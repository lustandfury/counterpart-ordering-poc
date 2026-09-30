import { RateLimitError, saveEmail } from "@/lib/usage";
import { clientKey, visitorId, withVisitorCookie } from "@/lib/visitor";

const MAX_EMAIL = 254; // the length limit for an email address

export async function POST(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Send JSON." }, { status: 415 });
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });

  const id = visitorId(req);
  try {
    await saveEmail(id, email, clientKey(req));
    return withVisitorCookie(Response.json({ ok: true }), id);
  } catch (error) {
    if (error instanceof RateLimitError) return withVisitorCookie(Response.json({ error: "Too many sign-ups from this network. Try again later." }, { status: 429 }), id);
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) return withVisitorCookie(Response.json({ error: "That email is already signed up." }, { status: 409 }), id);
    console.error("signup failed", error);
    return withVisitorCookie(Response.json({ error: "We couldn't save your email. Try again." }, { status: 503 }), id);
  }
}
