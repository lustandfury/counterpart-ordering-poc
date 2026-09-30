import { runOrder, TooManyLinesError } from "@/lib/pipeline";
import { randomUUID } from "node:crypto";
import { reserveOrder, VISITOR_COOKIE } from "@/lib/usage";
import type { OrderStreamEvent } from "@/lib/order-progress";

export const maxDuration = 60;

// A typical live run costs about $0.07 (mostly the Claude-only comparison, which sends the whole catalog),
// so the run caps matter more than the length cap. Worst case at these limits: a few dollars a day per instance.
const MAX_CHARS = 600;
const MAX_LINES = 15; // lines of pasted text
const MAX_ITEMS = 15; // items after parsing (one line can hold several)
const PER_IP_PER_HOUR = 5;
const GLOBAL_PER_DAY = 40;
const hits = new Map<string, number[]>();
let day = { key: "", count: 0 };

function visitorId(req: Request) {
  const match = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([^;]+)`));
  return match?.[1] || randomUUID();
}

function withVisitorCookie(response: Response, id: string) {
  response.headers.append("Set-Cookie", `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}

/**
 * Live run on pasted text. Each run makes paid API calls, so it is capped per visitor and per day.
 * The counters live in memory, so on Vercel each server instance keeps its own; treat them as a brake,
 * with the Anthropic spend limit and TypeSafe's prepaid credits as the hard stops, and LIVE_RUNS=off as
 * the off switch.
 */
export async function POST(req: Request) {
  if (process.env.LIVE_RUNS === "off") return Response.json({ error: "Live runs are switched off. Pick a saved sample." }, { status: 503 });

  // JSON only: blocks simple cross-site form posts, which skip the browser's CORS check
  if (!req.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Send JSON." }, { status: 415 });
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Paste an order first." }, { status: 400 });
  if (text.length > MAX_CHARS) return Response.json({ error: `Keep it under ${MAX_CHARS} characters.` }, { status: 413 });
  if (text.split(/\n/).filter((l) => l.trim()).length > MAX_LINES) return Response.json({ error: `Keep it to ${MAX_LINES} lines or fewer.` }, { status: 413 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  const today = new Date().toISOString().slice(0, 10);
  if (day.key !== today) day = { key: today, count: 0 };
  if (recent.length >= PER_IP_PER_HOUR || day.count >= GLOBAL_PER_DAY) {
    return Response.json({ error: "Too many live runs right now. Try a saved sample." }, { status: 429 });
  }

  const visitor = visitorId(req);
  let reservation: Awaited<ReturnType<typeof reserveOrder>>;
  try {
    reservation = await reserveOrder(visitor);
  } catch (e) {
    console.error("usage check failed", e);
    return Response.json({ error: "Live runs are temporarily unavailable. Please try again later." }, { status: 503 });
  }
  if (!reservation.allowed) {
    return withVisitorCookie(Response.json({ code: "SIGNUP_REQUIRED", error: "You’ve used your 5 free orders. Sign up with your email to keep generating orders." }, { status: 402 }), visitor);
  }

  hits.set(ip, [...recent, now]);
  day.count++;

  // Existing JSON callers keep their response contract; the app opts into live progress.
  if (req.headers.get("accept")?.includes("application/x-ndjson")) {
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: OrderStreamEvent) => {
          if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        try {
          send({ type: "progress", progress: { stage: "access", status: "complete" } });
          const result = await runOrder("live", text, {
            maxLines: MAX_ITEMS,
            onProgress: (progress) => send({ type: "progress", progress }),
          });
          send({ type: "result", result });
        } catch (e) {
          if (!(e instanceof TooManyLinesError)) console.error("live run failed", e);
          send({ type: "error", error: e instanceof TooManyLinesError ? e.message : "The run failed. Try again, or pick a saved sample." });
        } finally {
          if (!closed) { closed = true; controller.close(); }
        }
      },
      cancel() { closed = true; },
    });
    return withVisitorCookie(new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
    }), visitor);
  }

  try {
    return withVisitorCookie(Response.json(await runOrder("live", text, { maxLines: MAX_ITEMS })), visitor);
  } catch (e) {
    if (e instanceof TooManyLinesError) return withVisitorCookie(Response.json({ error: e.message }, { status: 413 }), visitor);
    console.error("live run failed", e);
    return withVisitorCookie(Response.json({ error: "The run failed. Try again, or pick a saved sample." }, { status: 502 }), visitor);
  }
}
