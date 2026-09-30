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

const request = (cookie?: string, stream = false) => new Request("http://localhost/api/run", {
  method: "POST",
  headers: { "content-type": "application/json", ...(stream ? { accept: "application/x-ndjson" } : {}), ...(cookie ? { cookie } : {}) },
  body: JSON.stringify({ text: "12 2x4x8" }),
});

describe("live-run usage gate", () => {
  it("streams progress before the result and retains the visitor cookie", async () => {
    reserveOrder.mockResolvedValue({ allowed: true });
    let resolvePending!: (v: { orderId: string }) => void;
    const pending = new Promise<{ orderId: string }>((res) => (resolvePending = res));
    runOrder.mockImplementation((_id, _text, options) => {
      options.onProgress({ stage: "parse", status: "running" });
      return pending;
    });
    const { POST } = await import("./route");
    const response = await POST(request("counterpart_visitor=3f2b8c1a-6d4e-4a7b-9c0d-1e2f3a4b5c6d", true));
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("set-cookie")).toContain("counterpart_visitor=3f2b8c1a-6d4e-4a7b-9c0d-1e2f3a4b5c6d;");
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(JSON.parse(new TextDecoder().decode(first.value))).toMatchObject({ type: "progress", progress: { stage: "access", status: "complete" } });
    resolvePending({ orderId: "live" });
    let remaining = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      remaining += new TextDecoder().decode(chunk.value);
    }
    expect(remaining).toContain('"stage":"parse"');
    expect(remaining).toContain('"type":"result"');
  });

  it("reports mid-stream AI failures as error events", async () => {
    reserveOrder.mockResolvedValue({ allowed: true });
    runOrder.mockRejectedValue(new Error("Provider secret detail"));
    const { POST } = await import("./route");
    const response = await POST(request(undefined, true));
    const body = await response.text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain("Provider secret detail");
    expect(response.headers.get("set-cookie")).toContain("counterpart_visitor=");
  });

  it("returns signup-required without calling the AI pipeline", async () => {
    reserveOrder.mockResolvedValue({ allowed: false, reason: "signup" });
    const { POST } = await import("./route");
    const response = await POST(request("theme=light; counterpart_visitor=7a9e5d42-1b3c-4f68-8a0e-2c4d6e8f0a1b"));
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "SIGNUP_REQUIRED" });
    expect(reserveOrder).toHaveBeenCalledWith("7a9e5d42-1b3c-4f68-8a0e-2c4d6e8f0a1b", expect.stringMatching(/^[0-9a-f]{16}$/));
    expect(runOrder).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("counterpart_visitor=7a9e5d42-1b3c-4f68-8a0e-2c4d6e8f0a1b;");
  });

  it("returns 429 without calling the AI pipeline when the shared limits are reached", async () => {
    reserveOrder.mockResolvedValue({ allowed: false, reason: "busy" });
    const { POST } = await import("./route");
    const response = await POST(request(`counterpart_visitor=${"7a9e5d42-1b3c-4f68-8a0e-2c4d6e8f0a1b"}`));
    expect(response.status).toBe(429);
    expect(runOrder).not.toHaveBeenCalled();
  });

  it("ignores a malformed visitor cookie and issues a fresh id", async () => {
    reserveOrder.mockResolvedValue({ allowed: true });
    runOrder.mockResolvedValue({ orderId: "live" });
    const { POST } = await import("./route");
    const response = await POST(request("counterpart_visitor=" + "x".repeat(5000)));
    expect(response.status).toBe(200);
    expect(reserveOrder.mock.calls[0][0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("set-cookie")).not.toContain("xxxx");
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
