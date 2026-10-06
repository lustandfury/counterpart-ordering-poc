import { houseDefaultsPrompt } from "../house-defaults";
import type { Delivery, ParsedLine, Timed } from "../types";
import { callTool } from "./claude";

type RawSaid = { said: string; tidy: string } | null;
type RawDelivery = { method: "delivery" | "pickup" | null; when: RawSaid; where: (RawSaid & { on_file?: boolean }) | null; notes: string | null };
type Raw = { lines: { raw: string; item: string; qty: number | null; unit: string | null }[]; delivery?: RawDelivery | null };

const SYSTEM = `You read a contractor's text-message order for lumber and building materials and split it into order lines.
Rules:
- One entry per product requested. Delivery, jobsite and chit-chat sentences are never lines, but keep context words that change the product ("not treated", "the 2x6s for the deck").
- raw: the exact words from the message for that line (copy verbatim, do not fix typos).
- item: the product description only, with the quantity removed but nothing else changed. Examples: "2x4x8 PT x 15" -> item "2x4x8 PT", qty 15; "20 sheets 7/16 OSB" -> item "7/16 OSB", qty 20, unit "sheets"; "mesh tape x2" -> item "mesh tape", qty 2.
- qty: the number ordered, or null if none is stated. A bare number next to lumber or sheet goods means pieces or sheets. "a"/"one" means 1. Do not convert units.
- unit: the unit as spoken (bags, boxes, lbs, ft, rolls...), or null.
- Include items you cannot identify, and questions such as "do you rent a dumpster", as lines too.
- Handwritten lists and estimates (transcribed from a photo) also hold working-out. Prices, sums, totals, tax, labour and
  lump sums ("fasteners = $175") are not lines; take only the material and its quantity from a priced line
  ("3 - 2"x 12"x 16' $39.41 ea = $118.23" -> item "2"x 12"x 16'", qty 3). Text in ~~ ~~ is crossed out: skip a crossed-out
  line, and where a number is crossed out with a new one beside it ("~~24~~ 30") use the new one. Sketch notes in [ ] are
  not lines. Keep a [?] reading as written in raw. A list number at the start ("4.") is not the quantity.

Also capture the delivery details, separately from the lines:
- method: "pickup" if they will collect it, "delivery" if it is delivered or a site/address is given, else null.
- when: said = their exact words for the time (verbatim); tidy = the same moment written out for a rep, resolving relative days against today's date below, in the form "Thu, Oct 8 · before 7:00 AM" (or "Thu, Oct 8 · first thing", "Mon, Oct 5" when no time is given). null if no time is mentioned.
- where: said = their exact words for the place (verbatim); tidy = the address with normal capitalization and abbreviations ("42 Birch St, Unit 3"). If they refer to an earlier or usual address ("same address as last week", "usual spot"), set on_file true and tidy "". null if no place is mentioned.
- notes: other delivery instructions in a short, tidy sentence ("Drop at the back gate; call when close."), or null.
Never invent a time, place or note that is not in the message.

House rules the yard uses (for reference only; do not pick products here):
`;

const saidSchema = { type: ["object", "null"], properties: { said: { type: "string" }, tidy: { type: "string" } }, required: ["said", "tidy"] };

/** Today in the yard's time zone (the demo assumes Ontario), so "tmrw" resolves to the right day. */
const today = (now: Date) => now.toLocaleString("en-CA", { timeZone: "America/Toronto", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Delivery details as the app stores them: empty strings become null, and a detail with nothing said is dropped. */
export function cleanDelivery(raw: RawDelivery | null | undefined): Delivery | undefined {
  if (!raw) return undefined;
  const text = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
  const said = (s: RawSaid) => (s && text(s.said) ? { said: text(s.said)!, tidy: text(s.tidy) ?? text(s.said)! } : null);
  const when = said(raw.when);
  const whereSaid = raw.where && text(raw.where.said) ? raw.where : null;
  const where = whereSaid ? { said: text(whereSaid.said)!, tidy: whereSaid.on_file ? "" : text(whereSaid.tidy) ?? text(whereSaid.said)!, onFile: !!whereSaid.on_file } : null;
  const notes = text(raw.notes);
  const method = raw.method === "pickup" || raw.method === "delivery" ? raw.method : null;
  if (!when && !where && !notes && !method) return undefined;
  return { method, when, where, notes };
}

export async function parseOrder(text: string, now = new Date()): Promise<{ lines: ParsedLine[]; delivery?: Delivery } & Timed> {
  const r = await callTool<Raw>({
    system: SYSTEM + "\n" + houseDefaultsPrompt(),
    user: `Today is ${today(now)}.\n\nOrder message:\n"""\n${text}\n"""`,
    toolName: "submit_lines",
    schema: {
      type: "object",
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              raw: { type: "string" },
              item: { type: "string" },
              qty: { type: ["number", "null"] },
              unit: { type: ["string", "null"] },
            },
            required: ["raw", "item", "qty", "unit"],
          },
        },
        delivery: {
          type: "object",
          properties: {
            method: { type: ["string", "null"], enum: ["delivery", "pickup", null] },
            when: saidSchema,
            where: { ...saidSchema, properties: { ...saidSchema.properties, on_file: { type: "boolean" } }, required: ["said", "tidy", "on_file"] },
            notes: { type: ["string", "null"] },
          },
          required: ["method", "when", "where", "notes"],
        },
      },
      required: ["lines", "delivery"],
    },
  });
  const lines = r.input.lines.map((l, i) => ({ id: String(i + 1), ...l }));
  const delivery = cleanDelivery(r.input.delivery);
  return { lines, ...(delivery ? { delivery } : {}), ms: r.ms, usage: r.usage, costUsd: r.costUsd };
}
