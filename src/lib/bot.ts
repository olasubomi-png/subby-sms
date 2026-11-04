/**
 * SUBBY SMS — Telegram bot command handlers.
 *
 * Live free public numbers from ASMS.ai shared directory (HTML).
 * No paid API. No invented numbers or SMS content.
 */

import { ASMS, BOT_NAME } from "./config";
import {
  fetchPublicNumbers,
  paginateNumbers,
  countryLabel,
  type AsmsPublicNumber,
  type AsmsCountry,
} from "./asms";
import {
  sendMessage,
  answerCallbackQuery,
  type TelegramUpdate,
  type InlineKeyboardMarkup,
  type InlineKeyboardButton,
  type TelegramUser,
} from "./telegram";
import {
  ensureSchema,
  upsertTelegramUser,
  setActiveWatchedNumber,
  deactivateActiveWatchedNumber,
} from "./db";

function mainMenuKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "📱 Live free numbers", callback_data: "numbers:all:0" },
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

function backMenuKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: "« Main menu", callback_data: "start" }]],
  };
}

function numbersListKeyboard(
  slice: AsmsPublicNumber[],
  country: string,
  page: number,
  totalPages: number
): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = slice.map((n) => [
    {
      text: n.phone,
      callback_data: `num:${n.digits}`,
    },
  ]);

  const nav: InlineKeyboardButton[] = [];
  if (page > 0) {
    nav.push({
      text: "‹ Prev",
      callback_data: `numbers:${country}:${page - 1}`,
    });
  }
  if (page < totalPages - 1) {
    nav.push({
      text: "Next ›",
      callback_data: `numbers:${country}:${page + 1}`,
    });
  }
  if (nav.length) rows.push(nav);

  rows.push([
    {
      text: "🔄 Refresh",
      callback_data: `numbers:${country}:${page}:r`,
    },
    { text: "🌍 Countries", callback_data: "countries" },
  ]);
  rows.push([
    { text: "Open full directory", url: ASMS.numbers },
    { text: "« Menu", callback_data: "start" },
  ]);

  return { inline_keyboard: rows };
}

function countriesKeyboard(countries: AsmsCountry[]): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = [];
  rows.push([
    {
      text: "🌐 All free numbers",
      callback_data: "numbers:all:0",
    },
  ]);

  // Two countries per row; only those with count > 0
  const usable = countries.filter((c) => c.count > 0);
  for (let i = 0; i < usable.length; i += 2) {
    const row: InlineKeyboardButton[] = [];
    const a = usable[i]!;
    row.push({
      text: `${countryLabel(a.code, a.name)} (${a.count})`,
      callback_data: `numbers:${a.code}:0`,
    });
    const b = usable[i + 1];
    if (b) {
      row.push({
        text: `${countryLabel(b.code, b.name)} (${b.count})`,
        callback_data: `numbers:${b.code}:0`,
      });
    }
    rows.push(row);
  }

  rows.push([
    { text: "🔄 Refresh countries", callback_data: "countries:r" },
    { text: "« Menu", callback_data: "start" },
  ]);
  rows.push([{ text: "Open ASMS free directory", url: ASMS.numbers }]);
  return { inline_keyboard: rows };
}

function numberDetailKeyboard(
  number: AsmsPublicNumber,
  country: string
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "📬 Open public inbox on ASMS.ai", url: number.inboxUrl }],
      [{ text: "⏹ Stop monitoring", callback_data: "stop" }],
      [
        {
          text: "« Back to list",
          callback_data: `numbers:${country || "all"}:0`,
        },
        { text: "🌍 Countries", callback_data: "countries" },
      ],
      [{ text: "« Menu", callback_data: "start" }],
    ],
  };
}

const START_TEXT = `
<b>${BOT_NAME}</b>

Browse <b>live free shared / public</b> temporary SMS numbers from <a href="${ASMS.home}">ASMS.ai</a>.

These are <b>public inboxes</b> — anyone can open the same number and read messages. Use only for low-risk sign-ups.

⚠️ Never use public numbers for banking, payments, password recovery, or sensitive accounts.

<b>Commands</b>
/start — Main menu
/numbers — Live free numbers
/countries — Browse by country
/help — How to use
/privacy — Risks &amp; safety
/stop — Stop inbox monitoring
`.trim();

const HELP_TEXT = `
<b>❓ Help — ${BOT_NAME}</b>

<b>How to get a code</b>
1. Open <b>Live free numbers</b> or pick a country
2. Tap a number — copy the full international format
3. Enter it on the site that needs verification
4. Open the <b>public inbox</b> on ASMS.ai (button) and read the SMS yourself

<b>Important</b>
• Inboxes are <b>public</b> — anyone can read them
• Numbers are shared and change often
• After you select a number, the bot monitors its public inbox for <b>new</b> SMS
• Existing messages are not re-sent (baseline on first scan)
• Paid ASMS API is not used — public HTML only
• Send /stop to cancel monitoring

/privacy for safety details.
`.trim();

const PRIVACY_TEXT = `
<b>🔒 Privacy &amp; safety</b>

Free numbers from ASMS.ai are <b>shared public inboxes</b>:

• Anyone on the internet may open the same number
• Anyone may read messages that arrive there
• Codes and links in those inboxes are not private

<b>Never use public numbers for</b>
• Banking or payment apps
• Primary email or social accounts
• Password recovery
• Government, health, or identity services
• Anything you would not post publicly

${BOT_NAME} only reads the public ASMS directory and links to public inbox pages. It does not store your SMS.
`.trim();

async function replyStart(chatId: number): Promise<void> {
  await sendMessage(chatId, START_TEXT, {
    reply_markup: mainMenuKeyboard(),
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

async function replyCountries(chatId: number): Promise<void> {
  try {
    const { countries, sourceUrl } = await fetchPublicNumbers("all");
    if (countries.length === 0) {
      await sendMessage(
        chatId,
        `Could not load country filters right now.\n\nOpen the official directory:\n${sourceUrl}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Open ASMS free numbers", url: ASMS.numbers }],
              [{ text: "« Menu", callback_data: "start" }],
            ],
          },
          disable_web_page_preview: true,
        }
      );
      return;
    }

    const lines = countries
      .filter((c) => c.count > 0)
      .map((c) => `• ${countryLabel(c.code, c.name)} — ~${c.count}`)
      .join("\n");

    await sendMessage(
      chatId,
      `<b>🌍 Free numbers by country</b>\n\n` +
        `Pick a country to load live public numbers from ASMS.ai.\n\n` +
        `${lines}\n\n` +
        `<i>Shared public inboxes — not for banking or sensitive accounts.</i>`,
      {
        reply_markup: countriesKeyboard(countries),
        disable_web_page_preview: true,
      }
    );
  } catch (err) {
    console.error("[bot] countries fetch failed:", err);
    await sendMessage(
      chatId,
      `Could not reach the ASMS free-number directory right now.\n\nTry the official page:\n${ASMS.numbers}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Open ASMS free numbers", url: ASMS.numbers }],
            [{ text: "« Menu", callback_data: "start" }],
          ],
        },
        disable_web_page_preview: true,
      }
    );
  }
}

async function replyNumbers(
  chatId: number,
  country: string,
  page: number
): Promise<void> {
  const countryKey = country || "all";
  try {
    const { numbers, sourceUrl } = await fetchPublicNumbers(
      countryKey === "all" ? null : countryKey
    );

    if (numbers.length === 0) {
      await sendMessage(
        chatId,
        `<b>No free public numbers found</b> for this filter right now.\n\n` +
          `Try another country or open the directory:\n${sourceUrl}\n\n` +
          `<i>Lists change often. This is not a private SMS service.</i>`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🌍 Countries", callback_data: "countries" }],
              [{ text: "Open ASMS directory", url: sourceUrl }],
              [{ text: "« Menu", callback_data: "start" }],
            ],
          },
          disable_web_page_preview: true,
        }
      );
      return;
    }

    const { slice, page: safePage, totalPages } = paginateNumbers(
      numbers,
      page
    );
    const scope =
      countryKey === "all"
        ? "All countries"
        : countryLabel(countryKey);

    await sendMessage(
      chatId,
      `<b>📱 Free public numbers</b> — ${scope}\n` +
        `Page ${safePage + 1}/${totalPages} · showing ${slice.length} of ${numbers.length}\n\n` +
        `Tap a number to copy it, then open its <b>public</b> inbox on ASMS.ai.\n\n` +
        `⚠️ Shared inbox — anyone can read messages. Not for banking or account recovery.`,
      {
        reply_markup: numbersListKeyboard(
          slice,
          countryKey,
          safePage,
          totalPages
        ),
        disable_web_page_preview: true,
      }
    );
  } catch (err) {
    console.error("[bot] numbers fetch failed:", err);
    await sendMessage(
      chatId,
      `Could not load live numbers from ASMS.ai right now.\n\n` +
        `Please try again shortly or open:\n${ASMS.numbers}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Open ASMS free numbers", url: ASMS.numbers }],
            [{ text: "🔄 Retry", callback_data: `numbers:${countryKey}:0` }],
            [{ text: "« Menu", callback_data: "start" }],
          ],
        },
        disable_web_page_preview: true,
      }
    );
  }
}

async function replyNumberDetail(
  chatId: number,
  digits: string,
  from?: TelegramUser
): Promise<void> {
  const clean = digits.replace(/\D/g, "");
  const phone = `+${clean}`;
  const inboxUrl = `https://asms.ai/number/${clean}`;
  const number: AsmsPublicNumber = {
    phone,
    digits: clean,
    inboxUrl,
  };

  let monitoringNote =
    "Monitoring could not be enabled (database unavailable). You can still open the public inbox manually.";

  try {
    await ensureSchema();
    const user = await upsertTelegramUser({
      telegramId: from?.id ?? chatId,
      chatId,
      username: from?.username ?? null,
      firstName: from?.first_name ?? null,
    });
    await setActiveWatchedNumber({
      telegramUserId: user.id,
      phoneE164: phone,
      digits: clean,
      inboxUrl,
    });
    monitoringNote =
      "🔔 <b>Monitoring enabled</b> for this public inbox.\n" +
      "New SMS that appear on ASMS after this point will be forwarded here.\n" +
      "Existing messages on the page are not re-sent.\n" +
      "Send /stop to cancel monitoring.";
  } catch (err) {
    console.error("[bot] watch number failed:", err);
  }

  await sendMessage(
    chatId,
    `<b>Selected number</b>\n\n` +
      `<code>${number.phone}</code>\n\n` +
      `Copy this full international number into the app that needs verification.\n\n` +
      `${monitoringNote}\n\n` +
      `⚠️ This inbox is <b>public and shared</b> — anyone may read messages. ` +
      `Not for banking, password recovery, or sensitive accounts.`,
    {
      reply_markup: numberDetailKeyboard(number, "all"),
      disable_web_page_preview: true,
    }
  );
}

async function replyStop(
  chatId: number,
  from?: TelegramUser
): Promise<void> {
  try {
    await ensureSchema();
    const user = await upsertTelegramUser({
      telegramId: from?.id ?? chatId,
      chatId,
      username: from?.username ?? null,
      firstName: from?.first_name ?? null,
    });
    const stopped = await deactivateActiveWatchedNumber(user.id);
    if (stopped) {
      await sendMessage(
        chatId,
        `⏹ Stopped monitoring <code>${stopped}</code>.\n\nYou will not receive further SMS alerts until you select a number again.`,
        {
          reply_markup: mainMenuKeyboard(),
          disable_web_page_preview: true,
        }
      );
    } else {
      await sendMessage(
        chatId,
        `No active number was being monitored.`,
        { reply_markup: mainMenuKeyboard() }
      );
    }
  } catch (err) {
    console.error("[bot] stop failed:", err);
    await sendMessage(
      chatId,
      "Could not update monitoring right now. Please try again.",
      { reply_markup: mainMenuKeyboard() }
    );
  }
}

function parseCommand(text: string): string {
  const raw = text.trim().split(/\s+/)[0] ?? "";
  return raw.split("@")[0]!.toLowerCase();
}

/**
 * Process a single Telegram update (message or callback).
 */
export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat.id;
      const data = (cq.data ?? "").trim();

      await answerCallbackQuery(cq.id).catch(() => undefined);
      if (!chatId) return;

      if (data === "start") {
        await replyStart(chatId);
        return;
      }
      if (data === "help") {
        await replyHelp(chatId);
        return;
      }
      if (data === "privacy") {
        await replyPrivacy(chatId);
        return;
      }
      if (data === "countries" || data === "countries:r") {
        await replyCountries(chatId);
        return;
      }
      if (data === "numbers") {
        await replyNumbers(chatId, "all", 0);
        return;
      }

      // numbers:{country}:{page} or numbers:{country}:{page}:r
      const numbersMatch = /^numbers:([a-z]+):(\d+)(?::r)?$/.exec(data);
      if (numbersMatch) {
        await replyNumbers(
          chatId,
          numbersMatch[1]!,
          Number(numbersMatch[2])
        );
        return;
      }

      // num:{digits}
      if (data === "stop") {
        await replyStop(chatId, cq.from);
        return;
      }

      const numMatch = /^num:(\d{8,15})$/.exec(data);
      if (numMatch) {
        await replyNumberDetail(chatId, numMatch[1]!, cq.from);
        return;
      }

      await replyStart(chatId);
      return;
    }

    const message = update.message;
    if (!message?.chat?.id) return;

    const chatId = message.chat.id;
    const text = message.text?.trim() ?? "";

    if (!text.startsWith("/")) {
      await sendMessage(
        chatId,
        `Send /start for the menu, or /numbers · /countries · /help · /privacy.`,
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
        await replyNumbers(chatId, "all", 0);
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
      case "/stop":
        await replyStop(chatId, message.from);
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
    const chatId =
      update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chatId) {
      try {
        await sendMessage(
          chatId,
          "Something went wrong. Please try again in a moment."
        );
      } catch {
        // ignore secondary failure
      }
    }
    throw err;
  }
}
