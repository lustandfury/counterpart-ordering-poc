import { houseDefaultsPrompt } from "../house-defaults";
import type { ParsedLine, Timed } from "../types";
import { callTool } from "./claude";

type Raw = { lines: { raw: string; item: string; qty: number | null; unit: string | null }[] };

const SYSTEM = `You read a contractor's text-message order for lumber and building materials and split it into order lines.
Rules:
- One entry per product requested. Ignore delivery, jobsite and chit-chat sentences, but keep context words that change the product ("not treated", "the 2x6s for the deck").
- raw: the exact words from the message for that line (copy verbatim, do not fix typos).
- item: the product description only, with the quantity removed but nothing else changed. Examples: "2x4x8 PT x 15" -> item "2x4x8 PT", qty 15; "20 sheets 7/16 OSB" -> item "7/16 OSB", qty 20, unit "sheets"; "mesh tape x2" -> item "mesh tape", qty 2.
- qty: the number ordered, or null if none is stated. A bare number next to lumber or sheet goods means pieces or sheets. "a"/"one" means 1. Do not convert units.
- unit: the unit as spoken (bags, boxes, lbs, ft, rolls...), or null.
- Include items you cannot identify, and questions such as "do you rent a dumpster", as lines too.

House rules the yard uses (for reference only; do not pick products here):
`;

export async function parseOrder(text: string): Promise<{ lines: ParsedLine[] } & Timed> {
  const r = await callTool<Raw>({
    system: SYSTEM + "\n" + houseDefaultsPrompt(),
    user: `Order message:\n"""\n${text}\n"""`,
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
      },
      required: ["lines"],
    },
  });
  const lines = r.input.lines.map((l, i) => ({ id: String(i + 1), ...l }));
  return { lines, ms: r.ms, usage: r.usage, costUsd: r.costUsd };
}
