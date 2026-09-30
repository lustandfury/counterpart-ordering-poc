import { sql } from "@vercel/postgres";

export const FREE_ORDER_LIMIT = 5;
// Durable brakes on paid runs. They apply to everyone, signed up or not, so they bound worst-case spend.
// A typical run costs about $0.07, so 40 a day is roughly $3.
export const PER_IP_PER_HOUR = 5;
export const GLOBAL_PER_DAY = 40;
export const SIGNUPS_PER_IP_PER_HOUR = 5;

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
  `
    .then(
      () => sql`
        CREATE TABLE IF NOT EXISTS counterpart_limits (
          bucket TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
    )
    .then(() => undefined)
    .catch((error) => {
      tableReady = undefined;
      throw error;
    });
  await tableReady;
}

export class RateLimitError extends Error {}

/**
 * Take one slot from a counter, atomically: the increment only happens while the count is under the limit,
 * so concurrent requests cannot overshoot. Counters are per calendar hour or day, and old rows are swept now and then.
 */
async function takeSlot(bucket: string, limit: number) {
  const result = await sql`
    INSERT INTO counterpart_limits (bucket, count)
    VALUES (${bucket}, 1)
    ON CONFLICT (bucket) DO UPDATE SET count = counterpart_limits.count + 1
    WHERE counterpart_limits.count < ${limit}
    RETURNING count
  `;
  if (Math.random() < 0.02) {
    sql`DELETE FROM counterpart_limits WHERE created_at < NOW() - INTERVAL '2 days'`.catch(() => undefined);
  }
  return result.rows.length > 0;
}

const hourKey = () => new Date().toISOString().slice(0, 13);
const dayKey = () => new Date().toISOString().slice(0, 10);

export type Reservation =
  | { allowed: true; count: number; signedUp: boolean }
  | { allowed: false; reason: "signup" | "busy"; count: number; signedUp: boolean };

/**
 * Reserve one live run. Order matters: the visitor's own allowance is checked first, so a visitor over their limit
 * never uses up the shared budget; the per-IP and daily limits come next and hand the run back if they refuse.
 * The per-IP and daily limits apply to everyone, because the visitor cookie can be cleared.
 */
export async function reserveOrder(visitorId: string, ipKey: string): Promise<Reservation> {
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
  if (!row) return { allowed: false, reason: "signup", count: FREE_ORDER_LIMIT, signedUp: false };

  const withinLimits = (await takeSlot(`run:ip:${ipKey}:${hourKey()}`, PER_IP_PER_HOUR)) && (await takeSlot(`run:day:${dayKey()}`, GLOBAL_PER_DAY));
  if (!withinLimits) {
    await sql`
      UPDATE counterpart_visitors
      SET order_count = GREATEST(order_count - 1, 0), updated_at = NOW()
      WHERE visitor_id = ${visitorId}
    `;
    return { allowed: false, reason: "busy", count: row.order_count - 1, signedUp: !!row.email };
  }
  return { allowed: true, count: row.order_count, signedUp: !!row.email };
}

export async function saveEmail(visitorId: string, email: string, ipKey: string) {
  await ensureUsageTable();
  if (!(await takeSlot(`signup:ip:${ipKey}:${hourKey()}`, SIGNUPS_PER_IP_PER_HOUR))) throw new RateLimitError("Too many sign-ups from this network.");
  await sql`
    INSERT INTO counterpart_visitors (visitor_id, email)
    VALUES (${visitorId}, ${email})
    ON CONFLICT (visitor_id) DO UPDATE
      SET email = EXCLUDED.email, updated_at = NOW()
  `;
}
