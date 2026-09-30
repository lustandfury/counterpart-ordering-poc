import { runOrder } from "@/lib/pipeline";

export const maxDuration = 60;

const MAX_CHARS = 1500;
const PER_IP_PER_HOUR = 10;
const GLOBAL_PER_DAY = 200;
const hits = new Map<string, number[]>();
let day = { key: "", count: 0 };

/** Live run on pasted text. Each run makes paid API calls, so it is capped per visitor and per day. */
export async function POST(req: Request) {
  if (process.env.LIVE_RUNS === "off") return Response.json({ error: "Live runs are switched off. Pick a saved sample." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Paste an order first." }, { status: 400 });
  if (text.length > MAX_CHARS) return Response.json({ error: `Keep it under ${MAX_CHARS} characters.` }, { status: 413 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  const today = new Date().toISOString().slice(0, 10);
  if (day.key !== today) day = { key: today, count: 0 };
  if (recent.length >= PER_IP_PER_HOUR || day.count >= GLOBAL_PER_DAY) {
    return Response.json({ error: "Too many live runs right now. Try a saved sample." }, { status: 429 });
  }
  hits.set(ip, [...recent, now]);
  day.count++;

  try {
    return Response.json(await runOrder("live", text));
  } catch (e) {
    console.error("live run failed", e);
    return Response.json({ error: "The run failed. Try again, or pick a saved sample." }, { status: 502 });
  }
}
