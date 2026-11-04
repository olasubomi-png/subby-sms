/**
 * Environment configuration — secrets only from env vars.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getTelegramBotToken(): string {
  return required("TELEGRAM_BOT_TOKEN");
}

export function getWebhookSecret(): string {
  return required("TELEGRAM_WEBHOOK_SECRET");
}

export function getAppUrl(): string {
  const url = process.env.APP_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (!url) {
    throw new Error("Missing APP_URL (or VERCEL_URL) environment variable");
  }
  return url.startsWith("http") ? url.replace(/\/$/, "") : `https://${url}`;
}

/** Safe config check for UI (does not throw). */
export function isBotConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() &&
      process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  );
}

/** ASMS.ai public free directory (shared inboxes — not a private API). */
export const ASMS = {
  home: "https://asms.ai",
  numbers: "https://asms.ai/numbers",
  /** Country list / filter on ASMS public site */
  countries: "https://asms.ai/numbers",
  /** Direct path users can open for public numbers by country code path if supported */
  countryBase: "https://asms.ai/numbers",
} as const;

export const BOT_NAME = "SUBBY SMS";
