/**
 * Minimal Telegram Bot API client for serverless webhooks.
 */

import { getTelegramBotToken } from "./config";

const API_BASE = "https://api.telegram.org";

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type: string;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date: number;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type InlineKeyboardButton = {
  text: string;
  url?: string;
  callback_data?: string;
};

export type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

type SendMessageOptions = {
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  reply_markup?: InlineKeyboardMarkup;
  disable_web_page_preview?: boolean;
};

async function telegramApi<T>(
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const token = getTelegramBotToken();
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as {
    ok: boolean;
    description?: string;
    result?: T;
  };

  if (!res.ok || !data.ok) {
    const msg = data.description || res.statusText || "Telegram API error";
    console.error(`[telegram] ${method} failed:`, msg);
    throw new Error(msg);
  }

  return data.result as T;
}

export async function sendMessage(
  chatId: number,
  text: string,
  options: SendMessageOptions = {}
): Promise<void> {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode ?? "HTML",
    reply_markup: options.reply_markup,
    disable_web_page_preview: options.disable_web_page_preview ?? false,
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text ?? "",
  });
}

export async function setWebhook(
  url: string,
  secretToken: string
): Promise<void> {
  await telegramApi("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export async function deleteWebhook(): Promise<void> {
  await telegramApi("deleteWebhook", { drop_pending_updates: false });
}

export async function getWebhookInfo(): Promise<unknown> {
  return telegramApi("getWebhookInfo", {});
}
