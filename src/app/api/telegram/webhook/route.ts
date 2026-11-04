import { NextRequest, NextResponse } from "next/server";
import { getWebhookSecret } from "@/lib/config";
import { handleUpdate } from "@/lib/bot";
import type { TelegramUpdate } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telegram sends updates via POST.
 * Secret must match TELEGRAM_WEBHOOK_SECRET via header
 * X-Telegram-Bot-Api-Secret-Token only (no query-string secrets).
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  let expected: string;
  try {
    expected = getWebhookSecret();
  } catch {
    console.error("[webhook] TELEGRAM_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { ok: false, error: "Server misconfigured" },
      { status: 500 }
    );
  }

  if (!secret || secret !== expected) {
    console.warn("[webhook] Rejected request: invalid or missing secret token");
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof update?.update_id !== "number") {
    return NextResponse.json({ ok: false, error: "Invalid update" }, { status: 400 });
  }

  try {
    await handleUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] Processing failed:", err);
    // Non-2xx so Telegram can retry the update.
    return NextResponse.json(
      { ok: false, error: "Processing failed" },
      { status: 500 }
    );
  }
}

/** Health check (no secrets exposed). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "subby-sms",
    endpoint: "telegram-webhook",
    method: "POST with X-Telegram-Bot-Api-Secret-Token",
  });
}
