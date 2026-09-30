import { describe, expect, it } from "vitest";
import { clientKey, visitorId } from "./visitor";

const req = (headers: Record<string, string>) => new Request("http://localhost/api/run", { headers });
const UUID = "3f2b8c1a-6d4e-4a7b-9c0d-1e2f3a4b5c6d";

describe("visitor id", () => {
  it("keeps a well-formed UUID cookie, so existing visitors keep their allowance", () => {
    expect(visitorId(req({ cookie: `theme=light; counterpart_visitor=${UUID}` }))).toBe(UUID);
  });

  it("issues a fresh id for a missing, malformed or oversized cookie", () => {
    for (const cookie of [undefined, "counterpart_visitor=abc", `counterpart_visitor=${"a".repeat(5000)}`, `counterpart_visitor='; DROP TABLE x`]) {
      const id = visitorId(req(cookie ? { cookie } : {}));
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(id).not.toBe("abc");
    }
  });
});

describe("client key", () => {
  it("is a short stable hash and never contains the address", () => {
    const a = clientKey(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).toBe(clientKey(req({ "x-forwarded-for": "203.0.113.7" })));
    expect(a).not.toContain("203");
    expect(a).not.toBe(clientKey(req({ "x-forwarded-for": "203.0.113.8" })));
  });
});
