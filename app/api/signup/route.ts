import { randomUUID } from "node:crypto";
import { saveEmail, VISITOR_COOKIE } from "@/lib/usage";

function visitorId(req: Request) {
  const match = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([^;]+)`));
  return match?.[1] || randomUUID();
}

function withVisitorCookie(response: Response, id: string) {
  response.headers.append("Set-Cookie", `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}

export async function POST(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Send JSON." }, { status: 415 });
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });

  const id = visitorId(req);
  try {
    await saveEmail(id, email);
    return withVisitorCookie(Response.json({ ok: true }), id);
  } catch (error) {
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) return withVisitorCookie(Response.json({ error: "That email is already signed up." }, { status: 409 }), id);
    console.error("signup failed", error);
    return withVisitorCookie(Response.json({ error: "We couldn't save your email. Try again." }, { status: 503 }), id);
  }
}
