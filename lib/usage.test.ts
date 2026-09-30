import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@vercel/postgres", () => ({ sql }));

beforeEach(() => {
  vi.resetModules();
  sql.mockReset();
  vi.stubEnv("POSTGRES_URL", "configured-for-test");
});
afterEach(() => vi.unstubAllEnvs());

describe("visitor usage tracking", () => {
  it("retries table initialization after a temporary database failure", async () => {
    const { reserveOrder } = await import("./usage");
    sql.mockRejectedValueOnce(new Error("Database temporarily unavailable"));
    await expect(reserveOrder("visitor")).rejects.toThrow("Database temporarily unavailable");

    sql.mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ order_count: 1, email: null }] });
    await expect(reserveOrder("visitor")).resolves.toEqual({ allowed: true, count: 1, signedUp: false });
  });

  it("requires signup when the atomic reservation returns no eligible visitor", async () => {
    const { reserveOrder } = await import("./usage");
    sql.mockResolvedValue({ rows: [] });
    await expect(reserveOrder("visitor")).resolves.toEqual({ allowed: false, count: 5, signedUp: false });
  });

  it("allows signed-up visitors beyond five attempts", async () => {
    const { reserveOrder } = await import("./usage");
    sql.mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ order_count: 6, email: "rep@example.com" }] });
    await expect(reserveOrder("visitor")).resolves.toEqual({ allowed: true, count: 6, signedUp: true });
  });
});
