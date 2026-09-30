import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reserveOrder, runOrder } = vi.hoisted(() => ({ reserveOrder: vi.fn(), runOrder: vi.fn() }));
vi.mock("@/lib/usage", () => ({ reserveOrder, VISITOR_COOKIE: "counterpart_visitor" }));
vi.mock("@/lib/pipeline", () => ({ runOrder, TooManyLinesError: class extends Error {} }));

beforeEach(() => {
  vi.resetModules();
  reserveOrder.mockReset();
  runOrder.mockReset();
  vi.stubEnv("LIVE_RUNS", "on");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const request = (cookie?: string) => new Request("http://localhost/api/run", {
  method: "POST",
  headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  body: JSON.stringify({ text: "12 2x4x8" }),
});

describe("live-run usage gate", () => {
  it("returns signup-required without calling the AI pipeline", async () => {
    reserveOrder.mockResolvedValue({ allowed: false });
    const { POST } = await import("./route");
    const response = await POST(request("theme=light; counterpart_visitor=existing-visitor"));
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "SIGNUP_REQUIRED" });
    expect(reserveOrder).toHaveBeenCalledWith("existing-visitor");
    expect(runOrder).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("counterpart_visitor=existing-visitor;");
  });

  it("keeps a new visitor's identity after a failed AI call", async () => {
    reserveOrder.mockResolvedValue({ allowed: true });
    runOrder.mockRejectedValue(new Error("AI unavailable"));
    const { POST } = await import("./route");
    const failed = await POST(request());
    expect(failed.status).toBe(502);
    const cookie = failed.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toMatch(/^counterpart_visitor=.+/);

    runOrder.mockResolvedValue({ orderId: "live" });
    const retry = await POST(request(cookie));
    expect(retry.status).toBe(200);
    expect(reserveOrder.mock.calls[1][0]).toBe(reserveOrder.mock.calls[0][0]);
  });

  it("returns unavailable without calling AI when the database check fails", async () => {
    reserveOrder.mockRejectedValue(new Error("Database unavailable"));
    const { POST } = await import("./route");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(runOrder).not.toHaveBeenCalled();
  });
});
