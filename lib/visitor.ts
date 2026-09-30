import { createHash, randomUUID } from "node:crypto";

export const VISITOR_COOKIE = "counterpart_visitor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The visitor's id from the cookie. Anything that is not a UUID is ignored and a fresh id is issued, so a client
 * cannot stuff arbitrary or oversized strings into the database. Existing cookies are plain UUIDs and keep working.
 * The cookie is an identity, not a security control: clearing it gives a new visitor, which is why the per-IP and
 * daily limits in lib/usage.ts are what actually cap spend.
 */
export function visitorId(req: Request) {
  const match = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([^;]+)`));
  const id = match?.[1];
  return id && UUID.test(id) ? id.toLowerCase() : randomUUID();
}

export function withVisitorCookie(response: Response, id: string) {
  response.headers.append("Set-Cookie", `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}

/**
 * A short hash of the caller's IP, used only as a rate-limit key so raw addresses are never stored.
 * On Vercel, x-forwarded-for is set by the platform and client-supplied values are not forwarded.
 */
export function clientKey(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(`counterpart:${ip}`).digest("hex").slice(0, 16);
}
