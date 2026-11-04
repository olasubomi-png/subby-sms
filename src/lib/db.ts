/**
 * Neon / Postgres connection for serverless (single shared pool).
 */

import postgres from "postgres";

const globalForDb = globalThis as unknown as {
  __subbySql?: ReturnType<typeof postgres>;
};

function createSql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  return postgres(url, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: "require",
  });
}

export function getDb() {
  if (!globalForDb.__subbySql) {
    globalForDb.__subbySql = createSql();
  }
  return globalForDb.__subbySql;
}

export type TelegramUserRow = {
  id: string;
  telegram_id: string;
  chat_id: string;
  username: string | null;
  first_name: string | null;
};

export type WatchedNumberRow = {
  id: string;
  telegram_user_id: string;
  phone_e164: string;
  digits: string;
  inbox_url: string;
  is_active: boolean;
  last_scanned_at: Date | null;
  chat_id: string;
};

/**
 * Ensure expected tables exist (idempotent). Safe if schema already applied in Neon.
 */
export async function ensureSchema(): Promise<void> {
  const sql = getDb();
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`
    CREATE TABLE IF NOT EXISTS telegram_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      telegram_id BIGINT NOT NULL UNIQUE,
      chat_id BIGINT NOT NULL,
      username TEXT,
      first_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS watched_numbers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      telegram_user_id UUID NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
      phone_e164 TEXT NOT NULL,
      digits TEXT NOT NULL,
      inbox_url TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_scanned_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS watched_numbers_active_idx
      ON watched_numbers (is_active) WHERE is_active = TRUE
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS inbox_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      watched_number_id UUID NOT NULL REFERENCES watched_numbers(id) ON DELETE CASCADE,
      external_id TEXT,
      message_hash TEXT NOT NULL,
      sender TEXT,
      body TEXT NOT NULL,
      code TEXT,
      received_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (watched_number_id, message_hash)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sms_deliveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      inbox_message_id UUID NOT NULL REFERENCES inbox_messages(id) ON DELETE CASCADE,
      telegram_user_id UUID NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
      delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (inbox_message_id, telegram_user_id)
    )
  `;
  // Column may already exist from Neon console
  await sql`
    ALTER TABLE watched_numbers
      ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMPTZ
  `;
}

export async function upsertTelegramUser(input: {
  telegramId: number;
  chatId: number;
  username?: string | null;
  firstName?: string | null;
}): Promise<TelegramUserRow> {
  const sql = getDb();
  const rows = await sql<TelegramUserRow[]>`
    INSERT INTO telegram_users (telegram_id, chat_id, username, first_name)
    VALUES (
      ${input.telegramId},
      ${input.chatId},
      ${input.username ?? null},
      ${input.firstName ?? null}
    )
    ON CONFLICT (telegram_id) DO UPDATE SET
      chat_id = EXCLUDED.chat_id,
      username = COALESCE(EXCLUDED.username, telegram_users.username),
      first_name = COALESCE(EXCLUDED.first_name, telegram_users.first_name),
      updated_at = NOW()
    RETURNING id, telegram_id::text, chat_id::text, username, first_name
  `;
  return rows[0]!;
}

/** Activate one number for user; deactivate their other watches. */
export async function setActiveWatchedNumber(input: {
  telegramUserId: string;
  phoneE164: string;
  digits: string;
  inboxUrl: string;
}): Promise<WatchedNumberRow> {
  const sql = getDb();
  await sql`
    UPDATE watched_numbers
    SET is_active = FALSE, updated_at = NOW()
    WHERE telegram_user_id = ${input.telegramUserId}::uuid
      AND is_active = TRUE
  `;

  // Re-activate existing row for same digits if present
  const existing = await sql<WatchedNumberRow[]>`
    SELECT wn.id, wn.telegram_user_id, wn.phone_e164, wn.digits, wn.inbox_url,
           wn.is_active, wn.last_scanned_at, tu.chat_id::text AS chat_id
    FROM watched_numbers wn
    JOIN telegram_users tu ON tu.id = wn.telegram_user_id
    WHERE wn.telegram_user_id = ${input.telegramUserId}::uuid
      AND wn.digits = ${input.digits}
    LIMIT 1
  `;

  if (existing[0]) {
    const rows = await sql<WatchedNumberRow[]>`
      UPDATE watched_numbers
      SET is_active = TRUE,
          phone_e164 = ${input.phoneE164},
          inbox_url = ${input.inboxUrl},
          updated_at = NOW()
      WHERE id = ${existing[0].id}::uuid
      RETURNING id, telegram_user_id, phone_e164, digits, inbox_url, is_active, last_scanned_at
    `;
    return { ...rows[0]!, chat_id: existing[0].chat_id };
  }

  const rows = await sql<WatchedNumberRow[]>`
    INSERT INTO watched_numbers (
      telegram_user_id, phone_e164, digits, inbox_url, is_active
    ) VALUES (
      ${input.telegramUserId}::uuid,
      ${input.phoneE164},
      ${input.digits},
      ${input.inboxUrl},
      TRUE
    )
    RETURNING id, telegram_user_id, phone_e164, digits, inbox_url, is_active, last_scanned_at
  `;
  const user = await sql<{ chat_id: string }[]>`
    SELECT chat_id::text FROM telegram_users WHERE id = ${input.telegramUserId}::uuid
  `;
  return { ...rows[0]!, chat_id: user[0]!.chat_id };
}

export async function deactivateActiveWatchedNumber(
  telegramUserId: string
): Promise<string | null> {
  const sql = getDb();
  const rows = await sql<{ phone_e164: string }[]>`
    UPDATE watched_numbers
    SET is_active = FALSE, updated_at = NOW()
    WHERE telegram_user_id = ${telegramUserId}::uuid AND is_active = TRUE
    RETURNING phone_e164
  `;
  return rows[0]?.phone_e164 ?? null;
}

export async function listActiveWatchedNumbers(
  limit = 40
): Promise<WatchedNumberRow[]> {
  const sql = getDb();
  return sql<WatchedNumberRow[]>`
    SELECT wn.id, wn.telegram_user_id, wn.phone_e164, wn.digits, wn.inbox_url,
           wn.is_active, wn.last_scanned_at, tu.chat_id::text AS chat_id
    FROM watched_numbers wn
    JOIN telegram_users tu ON tu.id = wn.telegram_user_id
    WHERE wn.is_active = TRUE
    ORDER BY wn.last_scanned_at NULLS FIRST, wn.created_at ASC
    LIMIT ${limit}
  `;
}

export async function markWatchedScanned(id: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE watched_numbers
    SET last_scanned_at = NOW(), updated_at = NOW()
    WHERE id = ${id}::uuid
  `;
}

export async function insertInboxMessage(input: {
  watchedNumberId: string;
  externalId: string | null;
  messageHash: string;
  sender: string | null;
  body: string;
  code: string | null;
  receivedAt: Date | null;
}): Promise<{ id: string; inserted: boolean }> {
  const sql = getDb();
  const rows = await sql<{ id: string }[]>`
    INSERT INTO inbox_messages (
      watched_number_id, external_id, message_hash, sender, body, code, received_at
    ) VALUES (
      ${input.watchedNumberId}::uuid,
      ${input.externalId},
      ${input.messageHash},
      ${input.sender},
      ${input.body},
      ${input.code},
      ${input.receivedAt}
    )
    ON CONFLICT (watched_number_id, message_hash) DO NOTHING
    RETURNING id
  `;
  if (rows[0]) return { id: rows[0].id, inserted: true };
  return { id: "", inserted: false };
}

export async function recordDelivery(input: {
  inboxMessageId: string;
  telegramUserId: string;
}): Promise<boolean> {
  const sql = getDb();
  const rows = await sql<{ id: string }[]>`
    INSERT INTO sms_deliveries (inbox_message_id, telegram_user_id)
    VALUES (${input.inboxMessageId}::uuid, ${input.telegramUserId}::uuid)
    ON CONFLICT (inbox_message_id, telegram_user_id) DO NOTHING
    RETURNING id
  `;
  return Boolean(rows[0]);
}
