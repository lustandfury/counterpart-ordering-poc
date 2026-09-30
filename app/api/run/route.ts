import { runOrder, TooManyLinesError } from "@/lib/pipeline";
import { reserveOrder } from "@/lib/usage";
import { clientKey, visitorId, withVisitorCookie } from "@/lib/visitor";
import type { OrderStreamEvent } from "@/lib/order-progress";

export const maxDuration = 60;

// A typical live run costs about $0.07 (mostly the Claude-only comparison, which sends the whole catalog).
// The per-IP and daily caps live in lib/usage.ts (Postgres), so they hold across server instances.
const MAX_CHARS = 600;
const MAX_LINES = 15; // lines of pasted text
const MAX_ITEMS = 15; // items after parsing (one line can hold several)

/**
 * Live run on pasted text. Each run makes paid API calls, so it is capped per visitor, per IP and per day.
 * Keep the Anthropic spend limit and TypeSafe's prepaid credits as the hard stops, and LIVE_RUNS=off as the off switch.
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

  const visitor = visitorId(req);
  let reservation: Awaited<ReturnType<typeof reserveOrder>>;
  try {
    reservation = await reserveOrder(visitor, clientKey(req));
  } catch (e) {
    console.error("usage check failed", e);
    return Response.json({ error: "Live runs are temporarily unavailable. Please try again later." }, { status: 503 });
  }
  if (!reservation.allowed && reservation.reason === "busy") {
    return withVisitorCookie(Response.json({ error: "Too many live runs right now. Try a saved sample." }, { status: 429 }), visitor);
  }
  if (!reservation.allowed) {
    return withVisitorCookie(Response.json({ code: "SIGNUP_REQUIRED", error: "You’ve used your 5 free orders. Sign up with your email to keep generating orders." }, { status: 402 }), visitor);
  }

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
