import { describe, expect, it, vi } from "vitest";
import { callJev, JevError, parseJevResponse } from "./jev";

const good = {
  model: "jev-1.13.0",
  answers: {
    sku: { type: "choice", choice: "a", probabilities: { a: 0.9, b: 0.1 }, confidence: 0.85 },
    unit_ok: { type: "noul", noul: 0.95 },
  },
  usage: { input_tokens: 100, output_tokens: 0 },
};
const req = { state: "x", questions: {} };
const ok = () => new Response(JSON.stringify(good), { status: 200 });

describe("parseJevResponse", () => {
  it("parses choice and noul answers", () => {
    const r = parseJevResponse(good);
    expect(r.answers.sku).toMatchObject({ choice: "a", confidence: 0.85 });
    expect(r.answers.unit_ok).toMatchObject({ noul: 0.95 });
  });
  it("rejects malformed bodies", () => {
    expect(() => parseJevResponse({})).toThrow(JevError);
    expect(() => parseJevResponse({ answers: { q: { type: "choice" } } })).toThrow(JevError);
    expect(() => parseJevResponse({ answers: { q: { type: "score" } } })).toThrow(JevError);
  });
});

describe("callJev", () => {
  it("retries 429 and 529 then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 529 }))
      .mockResolvedValueOnce(ok());
    const sleep = vi.fn().mockResolvedValue(undefined);
    const r = await callJev(req, { apiKey: "k", fetchImpl, sleep });
    expect(r.model).toBe("jev-1.13.0");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
  it("does not retry 401", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("bad key", { status: 401 }));
    await expect(callJev(req, { apiKey: "k", fetchImpl })).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("gives up after maxRetries", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response("", { status: 429 }));
    await expect(
      callJev(req, { apiKey: "k", fetchImpl, maxRetries: 2, sleep: async () => {} }),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("sends bearer auth and model", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    await callJev(req, { apiKey: "secret", fetchImpl });
    const init = fetchImpl.mock.calls[0][1];
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body).model).toBe("jev-latest");
  });
});
