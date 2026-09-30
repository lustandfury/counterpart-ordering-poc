import { sql } from "@vercel/postgres";

export const FREE_ORDER_LIMIT = 5;
export const VISITOR_COOKIE = "counterpart_visitor";

let tableReady: Promise<void> | undefined;

async function ensureUsageTable() {
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL is not configured.");
  tableReady ??= sql`
    CREATE TABLE IF NOT EXISTS counterpart_visitors (
      visitor_id TEXT PRIMARY KEY,
      order_count INTEGER NOT NULL DEFAULT 0,
      email TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.then(() => undefined).catch((error) => {
    tableReady = undefined;
    throw error;
  });
  await tableReady;
}

export async function reserveOrder(visitorId: string) {
  await ensureUsageTable();
  await sql`
    INSERT INTO counterpart_visitors (visitor_id)
    VALUES (${visitorId})
    ON CONFLICT (visitor_id) DO NOTHING
  `;

  const result = await sql`
    UPDATE counterpart_visitors
    SET order_count = order_count + 1, updated_at = NOW()
    WHERE visitor_id = ${visitorId}
      AND (email IS NOT NULL OR order_count < ${FREE_ORDER_LIMIT})
    RETURNING order_count, email
  `;
  const row = result.rows[0] as { order_count: number; email: string | null } | undefined;
  return row ? { allowed: true, count: row.order_count, signedUp: !!row.email } : { allowed: false, count: FREE_ORDER_LIMIT, signedUp: false };
}

export async function saveEmail(visitorId: string, email: string) {
  await ensureUsageTable();
  await sql`
    INSERT INTO counterpart_visitors (visitor_id, email)
    VALUES (${visitorId}, ${email})
    ON CONFLICT (visitor_id) DO UPDATE
      SET email = EXCLUDED.email, updated_at = NOW()
  `;
}
