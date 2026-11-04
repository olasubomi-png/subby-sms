import { NextRequest, NextResponse } from "next/server";
import { getAppUrl, getWebhookSecret } from "@/lib/config";
import { setWebhook, getWebhookInfo } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registers the Telegram webhook URL with the secret token.
 * Auth: header X-Telegram-Bot-Api-Secret-Token only (no query params).
 *
 * GET  — current webhook info
 * POST — set webhook to {APP_URL}/api/telegram/webhook
 */
function authorize(request: NextRequest): boolean {
  try {
    const expected = getWebhookSecret();
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    return Boolean(header && header === expected);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const info = await getWebhookInfo();
    return NextResponse.json({ ok: true, webhook: info });
  } catch (err) {
    console.error("[setup] getWebhookInfo failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const base = getAppUrl();
    const webhookUrl = `${base}/api/telegram/webhook`;
    const secret = getWebhookSecret();
    await setWebhook(webhookUrl, secret);
    const info = await getWebhookInfo();
    return NextResponse.json({
      ok: true,
      message: "Webhook registered",
      url: webhookUrl,
      webhook: info,
    });
  } catch (err) {
    console.error("[setup] setWebhook failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
