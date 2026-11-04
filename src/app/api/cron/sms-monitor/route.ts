import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  listActiveWatchedNumbers,
  insertInboxMessage,
  markWatchedScanned,
  claimDelivery,
  releaseDeliveryClaim,
  type WatchedNumberRow,
} from "@/lib/db";
import { fetchPublicInbox } from "@/lib/asms-inbox";
import { sendMessage, type InlineKeyboardMarkup } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_NUMBERS_PER_RUN = 25;
const CONCURRENCY = 3;

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return header.slice(7) === secret;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatNotification(input: {
  phone: string;
  sender: string | null;
  body: string;
  code: string | null;
  receivedAt: Date | null;
}): string {
  const lines = [
    "<b>📩 NEW SMS RECEIVED</b>",
    "",
    `Number: <code>${input.phone}</code>`,
  ];
  if (input.sender) lines.push(`Sender: ${escapeHtml(input.sender)}`);
  if (input.code) {
    lines.push(`Code: <code>${escapeHtml(input.code)}</code>`);
  } else {
    lines.push("Code: <i>not identified</i>");
  }
  lines.push("", "Message:", escapeHtml(input.body));
  if (input.receivedAt) {
    lines.push("", `Received: ${input.receivedAt.toISOString()}`);
  }
  lines.push(
    "",
    "⚠️ Public shared inbox — others may see this message. Not for banking or account recovery."
  );
  return lines.join("\n");
}

function digitsFromPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function processWatched(row: WatchedNumberRow): Promise<{
  checked: boolean;
  detected: number;
  notified: number;
  error?: string;
}> {
  const digits = digitsFromPhone(row.phone_number);
  const inbox = await fetchPublicInbox(digits);

  if (inbox.source === "error") {
    // Do not advance last_scanned_at on hard fetch failure so we retry cleanly
    return {
      checked: true,
      detected: 0,
      notified: 0,
      error: inbox.error ?? "inbox fetch failed",
    };
  }

  if (inbox.source === "empty") {
    await markWatchedScanned(row.id);
    return {
      checked: true,
      detected: 0,
      notified: 0,
      error: "No parseable messages in public HTML (page may be empty or JS-only)",
    };
  }

  const isFirstScan = row.last_scanned_at == null;
  let detected = 0;
  let notified = 0;
  const chatId = Number(row.chat_id);
  const batch = inbox.messages.slice(0, 40);

  for (const msg of batch) {
    const { id, inserted } = await insertInboxMessage({
      phoneNumber: row.phone_number,
      messageHash: msg.messageHash,
      sender: msg.sender,
      body: msg.body,
      code: msg.code,
      receivedAt: msg.receivedAt,
    });

    if (!id) continue;
    if (inserted) detected += 1;

    // First scan: baseline only — store, do not notify
    if (isFirstScan) continue;
    // Only notify for messages newly inserted this scan
    if (!inserted) continue;

    const claim = await claimDelivery({
      messageId: id,
      chatId,
    });
    if (!claim) continue; // already claimed/delivered by another run

    const markup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: "📬 Open public inbox", url: row.inbox_url }],
        [{ text: "⏹ Stop monitoring", callback_data: "stop" }],
      ],
    };

    try {
      await sendMessage(
        chatId,
        formatNotification({
          phone: row.phone_number.startsWith("+")
            ? row.phone_number
            : `+${row.phone_number}`,
          sender: msg.sender,
          body: msg.body,
          code: msg.code,
          receivedAt: msg.receivedAt,
        }),
        { reply_markup: markup, disable_web_page_preview: true }
      );
      notified += 1;
    } catch (err) {
      console.error("[sms-monitor] telegram send failed:", err);
      // Release claim so a later run can retry
      await releaseDeliveryClaim(claim.claimId).catch(() => undefined);
    }
  }

  await markWatchedScanned(row.id);
  return { checked: true, detected, notified };
}

async function runMonitor(): Promise<{
  checked: number;
  detected: number;
  notified: number;
  failures: number;
  errors: string[];
}> {
  await ensureSchema();
  const watched = await listActiveWatchedNumbers(MAX_NUMBERS_PER_RUN);

  let checked = 0;
  let detected = 0;
  let notified = 0;
  let failures = 0;
  const errors: string[] = [];

  for (let i = 0; i < watched.length; i += CONCURRENCY) {
    const chunk = watched.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (row) => {
        try {
          return await processWatched(row);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "process failed";
          return {
            checked: true,
            detected: 0,
            notified: 0,
            error: `${row.phone_number}: ${msg}`,
          };
        }
      })
    );
    for (const r of results) {
      if (r.checked) checked += 1;
      detected += r.detected;
      notified += r.notified;
      if (r.error) {
        failures += 1;
        errors.push(r.error);
      }
    }
  }

  return { checked, detected, notified, failures, errors: errors.slice(0, 10) };
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runMonitor();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[sms-monitor]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Monitor failed",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
