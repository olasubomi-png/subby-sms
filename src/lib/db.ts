/**
 * Neon / Postgres — aligned with the existing SUBBY SMS production schema.
 *
 * telegram_users:  chat_id BIGINT PK, username, created_at, updated_at
 * watched_numbers: id BIGSERIAL, chat_id, phone_number, inbox_url, active, created_at, last_scanned_at
 * inbox_messages:  id BIGSERIAL, phone_number, message_hash, sender, message_text, verification_code, received_at, detected_at
 * sms_deliveries:  id BIGSERIAL, message_id, chat_id, delivered_at
 */

import postgres from "postgres";

const globalForDb = globalThis as unknown as {
  __subbySql?: ReturnType<typeof postgres>;
  __subbySchemaReady?: Promise<void>;
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
  chat_id: string;
  username: string | null;
};

export type WatchedNumberRow = {
  id: string;
  chat_id: string;
  phone_number: string;
  inbox_url: string;
  active: boolean;
  last_scanned_at: Date | null;
};

/**
 * Idempotent, concurrent-safe schema alignment with the live Neon tables.
 * Never drops tables or data. Only adds missing constraints/columns/indexes.
 */
export async function ensureSchema(): Promise<void> {
  if (!globalForDb.__subbySchemaReady) {
    globalForDb.__subbySchemaReady = (async () => {
      const sql = getDb();
      // Serialize migrations across concurrent serverless instances
      await sql`SELECT pg_advisory_lock(87245001)`;
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS telegram_users (
            chat_id BIGINT PRIMARY KEY,
            username TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS watched_numbers (
            id BIGSERIAL PRIMARY KEY,
            chat_id BIGINT NOT NULL REFERENCES telegram_users(chat_id) ON DELETE CASCADE,
            phone_number TEXT NOT NULL,
            inbox_url TEXT NOT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_scanned_at TIMESTAMPTZ
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS inbox_messages (
            id BIGSERIAL PRIMARY KEY,
            phone_number TEXT NOT NULL,
            message_hash TEXT NOT NULL,
            sender TEXT,
            message_text TEXT NOT NULL,
            verification_code TEXT,
            received_at TIMESTAMPTZ,
            detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS sms_deliveries (
            id BIGSERIAL PRIMARY KEY,
            message_id BIGINT NOT NULL REFERENCES inbox_messages(id) ON DELETE CASCADE,
            chat_id BIGINT NOT NULL REFERENCES telegram_users(chat_id) ON DELETE CASCADE,
            delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `;

        // Align columns that may exist under older names / be missing
        await sql`ALTER TABLE watched_numbers ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMPTZ`;
        await sql`ALTER TABLE watched_numbers ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`;
        await sql`ALTER TABLE watched_numbers ADD COLUMN IF NOT EXISTS inbox_url TEXT`;
        await sql`ALTER TABLE watched_numbers ADD COLUMN IF NOT EXISTS phone_number TEXT`;
        await sql`ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS message_text TEXT`;
        await sql`ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS verification_code TEXT`;
        await sql`ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ DEFAULT NOW()`;
        await sql`ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS sender TEXT`;
        await sql`ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ`;
        await sql`ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS message_hash TEXT`;
        await sql`ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS phone_number TEXT`;

        // Unique constraints (idempotent via catalog check)
        await sql`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'inbox_messages_phone_hash_uq'
            ) THEN
              ALTER TABLE inbox_messages
                ADD CONSTRAINT inbox_messages_phone_hash_uq
                UNIQUE (phone_number, message_hash);
            END IF;
          END $$
        `;
        await sql`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'sms_deliveries_message_chat_uq'
            ) THEN
              ALTER TABLE sms_deliveries
                ADD CONSTRAINT sms_deliveries_message_chat_uq
                UNIQUE (message_id, chat_id);
            END IF;
          END $$
        `;
        await sql`
          CREATE INDEX IF NOT EXISTS watched_numbers_active_idx
            ON watched_numbers (active) WHERE active = TRUE
        `;
        await sql`
          CREATE INDEX IF NOT EXISTS watched_numbers_chat_idx
            ON watched_numbers (chat_id)
        `;
      } finally {
        await sql`SELECT pg_advisory_unlock(87245001)`;
      }
    })().catch((err) => {
      globalForDb.__subbySchemaReady = undefined;
      throw err;
    });
  }
  await globalForDb.__subbySchemaReady;
}

export async function upsertTelegramUser(input: {
  chatId: number;
  username?: string | null;
}): Promise<TelegramUserRow> {
  const sql = getDb();
  const rows = await sql<TelegramUserRow[]>`
    INSERT INTO telegram_users (chat_id, username)
    VALUES (${input.chatId}, ${input.username ?? null})
    ON CONFLICT (chat_id) DO UPDATE SET
      username = COALESCE(EXCLUDED.username, telegram_users.username),
      updated_at = NOW()
    RETURNING chat_id::text, username
  `;
  return rows[0]!;
}

/** Activate one number for this chat; deactivate their other watches. */
export async function setActiveWatchedNumber(input: {
  chatId: number;
  phoneNumber: string;
  inboxUrl: string;
}): Promise<WatchedNumberRow> {
  const sql = getDb();
  await sql.begin(async (tx) => {
    await tx`
      UPDATE watched_numbers
      SET active = FALSE
      WHERE chat_id = ${input.chatId} AND active = TRUE
    `;

    const existing = await tx<{ id: string }[]>`
      SELECT id::text FROM watched_numbers
      WHERE chat_id = ${input.chatId}
        AND phone_number = ${input.phoneNumber}
      LIMIT 1
    `;

    if (existing[0]) {
      await tx`
        UPDATE watched_numbers
        SET active = TRUE,
            inbox_url = ${input.inboxUrl},
            last_scanned_at = NULL
        WHERE id = ${existing[0].id}::bigint
      `;
      // Reset last_scanned_at so the next cron run baselines again for this selection
    } else {
      await tx`
        INSERT INTO watched_numbers (chat_id, phone_number, inbox_url, active)
        VALUES (${input.chatId}, ${input.phoneNumber}, ${input.inboxUrl}, TRUE)
      `;
    }
  });

  const rows = await sql<WatchedNumberRow[]>`
    SELECT id::text, chat_id::text, phone_number, inbox_url, active, last_scanned_at
    FROM watched_numbers
    WHERE chat_id = ${input.chatId} AND active = TRUE
    LIMIT 1
  `;
  return rows[0]!;
}

export async function deactivateActiveWatchedNumber(
  chatId: number
): Promise<string | null> {
  const sql = getDb();
  const rows = await sql<{ phone_number: string }[]>`
    UPDATE watched_numbers
    SET active = FALSE
    WHERE chat_id = ${chatId} AND active = TRUE
    RETURNING phone_number
  `;
  return rows[0]?.phone_number ?? null;
}

export async function listActiveWatchedNumbers(
  limit = 40
): Promise<WatchedNumberRow[]> {
  const sql = getDb();
  return sql<WatchedNumberRow[]>`
    SELECT id::text, chat_id::text, phone_number, inbox_url, active, last_scanned_at
    FROM watched_numbers
    WHERE active = TRUE
    ORDER BY last_scanned_at NULLS FIRST, created_at ASC
    LIMIT ${limit}
  `;
}

export async function markWatchedScanned(id: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE watched_numbers
    SET last_scanned_at = NOW()
    WHERE id = ${id}::bigint
  `;
}

/**
 * Insert message if new. Returns id when inserted (or existing id when already present).
 */
export async function insertInboxMessage(input: {
  phoneNumber: string;
  messageHash: string;
  sender: string | null;
  body: string;
  code: string | null;
  receivedAt: Date | null;
}): Promise<{ id: string; inserted: boolean }> {
  const sql = getDb();
  const inserted = await sql<{ id: string }[]>`
    INSERT INTO inbox_messages (
      phone_number, message_hash, sender, message_text, verification_code, received_at
    ) VALUES (
      ${input.phoneNumber},
      ${input.messageHash},
      ${input.sender},
      ${input.body},
      ${input.code},
      ${input.receivedAt}
    )
    ON CONFLICT (phone_number, message_hash) DO NOTHING
    RETURNING id::text
  `;
  if (inserted[0]) return { id: inserted[0].id, inserted: true };

  const existing = await sql<{ id: string }[]>`
    SELECT id::text FROM inbox_messages
    WHERE phone_number = ${input.phoneNumber}
      AND message_hash = ${input.messageHash}
    LIMIT 1
  `;
  return { id: existing[0]?.id ?? "", inserted: false };
}

/**
 * Claim a delivery slot before sending. Caller must releaseClaim if Telegram fails.
 */
export async function claimDelivery(input: {
  messageId: string;
  chatId: number;
}): Promise<{ claimId: string } | null> {
  const sql = getDb();
  const rows = await sql<{ id: string }[]>`
    INSERT INTO sms_deliveries (message_id, chat_id)
    VALUES (${input.messageId}::bigint, ${input.chatId})
    ON CONFLICT (message_id, chat_id) DO NOTHING
    RETURNING id::text
  `;
  return rows[0] ? { claimId: rows[0].id } : null;
}

/** Undo a failed delivery so a later monitor run can retry. */
export async function releaseDeliveryClaim(claimId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM sms_deliveries WHERE id = ${claimId}::bigint`;
}
