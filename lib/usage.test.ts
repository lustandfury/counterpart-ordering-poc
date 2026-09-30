import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@vercel/postgres", () => ({ sql }));

beforeEach(() => {
  vi.resetModules();
  sql.mockReset();
  vi.stubEnv("POSTGRES_URL", "configured-for-test");
  vi.spyOn(Math, "random").mockReturnValue(0.5); // no random clean-up query
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// Query order in reserveOrder: create visitors table, create limits table, insert visitor, reserve (update),
// then the per-IP slot and the daily slot. A slot query returns a row when a slot was taken, none when refused.
const setup = () => [{ rows: [] }, { rows: [] }, { rows: [] }];
const taken = { rows: [{ count: 1 }] };
const refused = { rows: [] };
const queue = (...results: { rows: unknown[] }[]) => results.forEach((r) => sql.mockResolvedValueOnce(r));

describe("visitor usage tracking", () => {
  it("retries table initialization after a temporary database failure", async () => {
    const { reserveOrder } = await import("./usage");
    sql.mockRejectedValueOnce(new Error("Database temporarily unavailable"));
    await expect(reserveOrder("visitor", "ip")).rejects.toThrow("Database temporarily unavailable");

    queue(...setup(), { rows: [{ order_count: 1, email: null }] }, taken, taken);
    await expect(reserveOrder("visitor", "ip")).resolves.toEqual({ allowed: true, count: 1, signedUp: false });
  });

  it("requires signup when the atomic reservation returns no eligible visitor", async () => {
    const { reserveOrder } = await import("./usage");
    sql.mockResolvedValue({ rows: [] });
    await expect(reserveOrder("visitor", "ip")).resolves.toEqual({ allowed: false, reason: "signup", count: 5, signedUp: false });
  });

  it("does not touch the shared limits for a visitor who is over their own limit", async () => {
    const { reserveOrder } = await import("./usage");
    queue(...setup(), { rows: [] });
    await reserveOrder("visitor", "ip");
    expect(sql).toHaveBeenCalledTimes(4); // two creates, the visitor insert, the refused reservation: no limit queries
  });

  it("allows signed-up visitors beyond five attempts", async () => {
    const { reserveOrder } = await import("./usage");
    queue(...setup(), { rows: [{ order_count: 6, email: "rep@example.com" }] }, taken, taken);
    await expect(reserveOrder("visitor", "ip")).resolves.toEqual({ allowed: true, count: 6, signedUp: true });
  });

  it("refuses when the per-IP limit is used up, and hands the visitor's run back", async () => {
    const { reserveOrder } = await import("./usage");
    queue(...setup(), { rows: [{ order_count: 3, email: null }] }, refused, { rows: [] });
    await expect(reserveOrder("visitor", "ip")).resolves.toEqual({ allowed: false, reason: "busy", count: 2, signedUp: false });
    const refund = sql.mock.calls[sql.mock.calls.length - 1][0].join(" ");
    expect(refund).toContain("GREATEST(order_count - 1, 0)");
  });

  it("applies the daily limit to signed-up visitors too", async () => {
    const { reserveOrder } = await import("./usage");
    queue(...setup(), { rows: [{ order_count: 30, email: "rep@example.com" }] }, taken, refused, { rows: [] });
    await expect(reserveOrder("visitor", "ip")).resolves.toEqual({ allowed: false, reason: "busy", count: 29, signedUp: true });
  });

  it("rate-limits sign-ups per network before writing an email", async () => {
    const { saveEmail, RateLimitError } = await import("./usage");
    queue({ rows: [] }, { rows: [] }, refused);
    await expect(saveEmail("visitor", "rep@example.com", "ip")).rejects.toBeInstanceOf(RateLimitError);
    expect(sql).toHaveBeenCalledTimes(3); // two creates and the refused slot: no insert of the email
  });

  it("saves the email once the sign-up slot is taken", async () => {
    const { saveEmail } = await import("./usage");
    queue({ rows: [] }, { rows: [] }, taken, { rows: [] });
    await expect(saveEmail("visitor", "rep@example.com", "ip")).resolves.toBeUndefined();
    expect(sql).toHaveBeenCalledTimes(4); // two creates, the slot, the email insert
  });
});
