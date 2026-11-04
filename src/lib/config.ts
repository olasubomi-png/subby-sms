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

/**
 * Official ASMS.ai public pages (shared free inboxes).
 * /numbers is the paid private-rental page — not used for free public browsing.
 * Free list: https://asms.ai/free-phone-numbers
 */
export const ASMS = {
  home: "https://asms.ai",
  /** Live free shared public numbers directory */
  numbers: "https://asms.ai/free-phone-numbers",
  /** Same directory (country filters on page) */
  countries: "https://asms.ai/free-phone-numbers",
  countryUk: "https://asms.ai/free-phone-numbers?country=uk",
  countryNl: "https://asms.ai/free-phone-numbers?country=nl",
  countryFi: "https://asms.ai/free-phone-numbers?country=fi",
  countryUs: "https://asms.ai/free-phone-numbers?country=us",
} as const;

export const BOT_NAME = "SUBBY SMS";
