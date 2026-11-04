/**
 * SUBBY SMS — Telegram bot command handlers.
 *
 * Honest about ASMS.ai free tier: shared public inboxes only.
 * No invented phone numbers or fake SMS content.
 */

import { ASMS, BOT_NAME } from "./config";
import {
  sendMessage,
  answerCallbackQuery,
  type TelegramUpdate,
  type InlineKeyboardMarkup,
} from "./telegram";

function mainMenuKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "📱 Browse numbers", callback_data: "numbers" },
        { text: "🌍 By country", callback_data: "countries" },
      ],
      [
        { text: "❓ Help", callback_data: "help" },
        { text: "🔒 Privacy", callback_data: "privacy" },
      ],
      [{ text: "Open ASMS.ai", url: ASMS.home }],
    ],
  };
}

function numbersKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "📱 Open public numbers directory", url: ASMS.numbers }],
      [
        { text: "🔄 Refresh", callback_data: "numbers" },
        { text: "« Main menu", callback_data: "start" },
      ],
    ],
  };
}

function countriesKeyboard(): InlineKeyboardMarkup {
  // Link users to ASMS public directory — do not invent country number lists.
  return {
    inline_keyboard: [
      [{ text: "🌍 Browse numbers by country", url: ASMS.countries }],
      [
        { text: "🇺🇸 US / others on ASMS", url: ASMS.numbers },
        { text: "🌐 All countries", url: ASMS.numbers },
      ],
      [
        { text: "🔄 Refresh", callback_data: "countries" },
        { text: "« Main menu", callback_data: "start" },
      ],
    ],
  };
}

function backMenuKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: "« Main menu", callback_data: "start" }]],
  };
}

const START_TEXT = `
<b>${BOT_NAME}</b>

Browse <b>free shared / public</b> temporary SMS numbers via <a href="${ASMS.home}">ASMS.ai</a>.

These are <b>public inboxes</b> — anyone can open the same number and read messages. They are useful for low-risk sign-ups, not for private accounts.

<b>Commands</b>
/start — Main menu
/numbers — Public number directory
/countries — Browse by country
/help — How to use
/privacy — Risks &amp; safety

Use the buttons below to open ASMS.ai pages. This bot does <b>not</b> list live numbers or fetch SMS automatically (that requires ASMS paid API access).
`.trim();

const NUMBERS_TEXT = `
<b>📱 Public numbers</b>

ASMS.ai publishes a free directory of <b>shared temporary numbers</b>. Anyone can view those inboxes.

Tap the button below to open the official public numbers page. Pick a number there, then open its inbox on ASMS.ai to see public messages.

⚠️ Do <b>not</b> use these numbers for banking, email recovery, or anything sensitive.

<i>Automated number lists and inbox reading require ASMS paid API — not available in this free bot.</i>
`.trim();

const COUNTRIES_TEXT = `
<b>🌍 Browse by country</b>

Public numbers are grouped by country on ASMS.ai. Open the directory and filter by the country you need.

This bot links you to the official site. It does not invent or cache phone numbers.
`.trim();

const HELP_TEXT = `
<b>❓ Help — ${BOT_NAME}</b>

<b>What this bot does</b>
• Guides you to ASMS.ai free public temporary numbers
• Warns about privacy risks of shared inboxes
• Keeps a simple menu for numbers, countries, help, and privacy

<b>What it does not do</b>
• Does not invent phone numbers
• Does not read SMS for you
• Does not offer private or exclusive numbers on the free tier

<b>How to receive a code</b>
1. Open the public numbers directory ( /numbers )
2. Choose a free public number on ASMS.ai
3. Use that number on the site that needs SMS verification
4. Open the same number’s public inbox on ASMS.ai to read the message

<b>Commands</b>
/start /numbers /countries /help /privacy
`.trim();

const PRIVACY_TEXT = `
<b>🔒 Privacy &amp; safety</b>

Free numbers from ASMS.ai are <b>shared public inboxes</b>:

• Anyone on the internet may open the same number
• Anyone may read messages that arrive there
• Codes, OTPs, and personal links in those inboxes are not private

<b>Never use public numbers for</b>
• Banking or payment apps
• Primary email or social accounts
• Password recovery
• Government, health, or identity services
• Anything you would not post on a public website

Prefer the site’s official verification flow, or a paid private SMS service, for anything important.

${BOT_NAME} only links to public ASMS.ai pages and does not store your messages.
`.trim();

async function replyStart(chatId: number): Promise<void> {
  await sendMessage(chatId, START_TEXT, {
    reply_markup: mainMenuKeyboard(),
    disable_web_page_preview: true,
  });
}

async function replyNumbers(chatId: number): Promise<void> {
  await sendMessage(chatId, NUMBERS_TEXT, {
    reply_markup: numbersKeyboard(),
    disable_web_page_preview: true,
  });
}

async function replyCountries(chatId: number): Promise<void> {
  await sendMessage(chatId, COUNTRIES_TEXT, {
    reply_markup: countriesKeyboard(),
    disable_web_page_preview: true,
  });
}

async function replyHelp(chatId: number): Promise<void> {
  await sendMessage(chatId, HELP_TEXT, {
    reply_markup: backMenuKeyboard(),
    disable_web_page_preview: true,
  });
}

async function replyPrivacy(chatId: number): Promise<void> {
  await sendMessage(chatId, PRIVACY_TEXT, {
    reply_markup: backMenuKeyboard(),
    disable_web_page_preview: true,
  });
}

function parseCommand(text: string): string {
  const raw = text.trim().split(/\s+/)[0] ?? "";
  // Strip @BotName from /start@MyBot
  return raw.split("@")[0]!.toLowerCase();
}

/**
 * Process a single Telegram update (message or callback).
 * Always resolves without throwing to the webhook caller when possible.
 */
export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat.id;
      const data = (cq.data ?? "").trim().toLowerCase();

      await answerCallbackQuery(cq.id).catch(() => undefined);

      if (!chatId) return;

      switch (data) {
        case "start":
          await replyStart(chatId);
          break;
        case "numbers":
          await replyNumbers(chatId);
          break;
        case "countries":
          await replyCountries(chatId);
          break;
        case "help":
          await replyHelp(chatId);
          break;
        case "privacy":
          await replyPrivacy(chatId);
          break;
        default:
          await replyStart(chatId);
      }
      return;
    }

    const message = update.message;
    if (!message?.chat?.id) return;

    const chatId = message.chat.id;
    const text = message.text?.trim() ?? "";

    if (!text.startsWith("/")) {
      await sendMessage(
        chatId,
        `Send /start for the menu, or use /numbers · /countries · /help · /privacy.`,
        { reply_markup: mainMenuKeyboard() }
      );
      return;
    }

    const cmd = parseCommand(text);

    switch (cmd) {
      case "/start":
        await replyStart(chatId);
        break;
      case "/numbers":
        await replyNumbers(chatId);
        break;
      case "/countries":
        await replyCountries(chatId);
        break;
      case "/help":
        await replyHelp(chatId);
        break;
      case "/privacy":
        await replyPrivacy(chatId);
        break;
      default:
        await sendMessage(
          chatId,
          `Unknown command. Try /start, /numbers, /countries, /help, or /privacy.`,
          { reply_markup: mainMenuKeyboard() }
        );
    }
  } catch (err) {
    console.error("[bot] handleUpdate error:", err);
    // Best-effort user feedback
    const chatId =
      update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chatId) {
      try {
        await sendMessage(
          chatId,
          "Something went wrong. Please try again in a moment."
        );
      } catch {
        // ignore
      }
    }
  }
}
