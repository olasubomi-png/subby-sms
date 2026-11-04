/**
 * Read public ASMS.ai inbox pages (shared HTML — no paid API).
 */

import * as cheerio from "cheerio";
import { createHash } from "crypto";

export type ParsedInboxMessage = {
  externalId: string | null;
  sender: string | null;
  body: string;
  code: string | null;
  receivedAt: Date | null;
  messageHash: string;
};

const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT =
  "SUBBY-SMS/1.0 (+https://subby-sms.vercel.app; public-inbox reader)";

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/<#>/g, "")
    .trim();
}

export function extractVerificationCode(body: string): string | null {
  if (!body) return null;
  const nearCode =
    body.match(
      /(?:code|otp|verification|pin|passcode)\s*(?:is|:)?\s*([0-9]{3}[- ]?[0-9]{3,5}|[0-9]{4,8})/i
    ) ||
    body.match(
      /(?:code|otp|verification|pin)\s*[#:]?\s*([0-9]{4,8})/i
    );
  if (nearCode?.[1]) {
    return nearCode[1].replace(/[-\s]/g, "");
  }
  const standalone = body.match(/\b([0-9]{4,8})\b/);
  return standalone?.[1] ?? null;
}

function hashMessage(
  digits: string,
  body: string,
  receivedAt: string | null,
  externalId: string | null
): string {
  const base = externalId
    ? `${digits}|id:${externalId}`
    : `${digits}|${receivedAt ?? ""}|${body}`;
  return createHash("sha256").update(base).digest("hex");
}

function parseEscapedJsonMessages(
  html: string,
  digits: string
): ParsedInboxMessage[] {
  const out: ParsedInboxMessage[] = [];
  const seen = new Set<string>();
  const pat =
    /\\"id\\":\\"([^"\\]+)\\",\\"from\\":\\"((?:\\\\.|[^"\\])*)\\",\\"text\\":\\"((?:\\\\.|[^"\\])*)\\",\\"code\\":(?:null|\\"([^"\\]*)\\"),\\"receivedAt\\":\\"([^"\\]+)\\"/g;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(html)) !== null) {
    let text = m[3]!;
    try {
      text = JSON.parse(`"${text}"`) as string;
    } catch {
      text = text
        .replace(/\\u003c/gi, "<")
        .replace(/\\u003e/gi, ">")
        .replace(/\\n/g, "\n");
    }
    text = decodeEntities(text);
    if (!text || text.length < 2) continue;
    const externalId = m[1]!;
    const sender = m[2] ? decodeEntities(m[2]) : null;
    const codeFromPage = m[4] ? m[4].replace(/[-\s]/g, "") : null;
    const receivedAtRaw = m[5]!;
    const receivedAt = receivedAtRaw ? new Date(receivedAtRaw) : null;
    const code =
      codeFromPage || extractVerificationCode(text);
    const messageHash = hashMessage(
      digits,
      text,
      receivedAtRaw,
      externalId
    );
    if (seen.has(messageHash)) continue;
    seen.add(messageHash);
    out.push({
      externalId,
      sender,
      body: text,
      code,
      receivedAt:
        receivedAt && !Number.isNaN(receivedAt.getTime()) ? receivedAt : null,
      messageHash,
    });
  }
  return out;
}

function parseHtmlMessages(
  html: string,
  digits: string
): ParsedInboxMessage[] {
  const $ = cheerio.load(html);
  const out: ParsedInboxMessage[] = [];
  const seen = new Set<string>();

  $("time[datetime]").each((_, el) => {
    const $time = $(el);
    const receivedAtRaw = $time.attr("datetime") || null;
    const $parent = $time.parent();
    const $block = $parent.parent();
    let sender: string | null = null;
    const $senderLink = $time.prev("a");
    if ($senderLink.length) {
      sender = decodeEntities($senderLink.text());
    } else {
      const prevText = $time.parent().find("a").first().text();
      if (prevText) sender = decodeEntities(prevText);
    }
    let body = "";
    const $p = $block.find("p").first();
    if ($p.length) {
      body = decodeEntities($p.text());
    } else {
      const $sib = $parent.next("p");
      body = decodeEntities($sib.text());
    }
    if (!body || body.length < 2) return;
    // Skip FAQ / marketing blurbs that aren't SMS
    if (/genuine United Kingdom number|Copy the number/i.test(body)) return;

    const receivedAt = receivedAtRaw ? new Date(receivedAtRaw) : null;
    const code = extractVerificationCode(body);
    const messageHash = hashMessage(
      digits,
      body,
      receivedAtRaw,
      null
    );
    if (seen.has(messageHash)) return;
    seen.add(messageHash);
    out.push({
      externalId: null,
      sender,
      body,
      code,
      receivedAt:
        receivedAt && !Number.isNaN(receivedAt.getTime()) ? receivedAt : null,
      messageHash,
    });
  });

  return out;
}

export async function fetchPublicInbox(
  digits: string
): Promise<{
  messages: ParsedInboxMessage[];
  inboxUrl: string;
  source: "json" | "html" | "empty" | "error";
  error?: string;
}> {
  const clean = digits.replace(/\D/g, "");
  const inboxUrl = `https://asms.ai/number/${clean}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(inboxUrl, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        messages: [],
        inboxUrl,
        source: "error",
        error: `HTTP ${res.status}`,
      };
    }
    const html = await res.text();
    let messages = parseEscapedJsonMessages(html, clean);
    let source: "json" | "html" | "empty" = "json";
    if (messages.length === 0) {
      messages = parseHtmlMessages(html, clean);
      source = messages.length ? "html" : "empty";
    }
    // Newest first
    messages.sort((a, b) => {
      const ta = a.receivedAt?.getTime() ?? 0;
      const tb = b.receivedAt?.getTime() ?? 0;
      return tb - ta;
    });
    return { messages, inboxUrl, source };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Timeout fetching inbox"
          : err.message
        : "Unknown fetch error";
    return { messages: [], inboxUrl, source: "error", error: msg };
  } finally {
    clearTimeout(timer);
  }
}
