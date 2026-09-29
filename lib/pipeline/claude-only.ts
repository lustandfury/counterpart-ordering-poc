import { loadCatalog } from "../catalog";
import { houseDefaultsPrompt } from "../house-defaults";
import type { ClaudeOnlyLine, ParsedLine, Timed } from "../types";
import { callTool } from "./claude";

type Raw = { matches: { id: string; sku: string | null; confidence: "high" | "medium" | "low" }[] };

const catalogBlock = () =>
  loadCatalog()
    .map((p) => `${p.sku} | ${p.name} | per ${p.unit} | ${p.aliases.join(", ")}`)
    .join("\n");

/** Comparison pipeline: Claude alone matches every parsed line against the full catalog in one call. */
export async function claudeOnlyMatch(
  lines: ParsedLine[],
  orderText: string,
): Promise<{ lines: ClaudeOnlyLine[] } & Timed> {
  const r = await callTool<Raw>({
    system: `You match order lines to products in a lumber yard catalog.
For each line, return the catalog sku the customer meant, or null if no catalog product fits or the line cannot be resolved.
Give a confidence: "high" only if a counter person would ship it without checking; "medium" or "low" if a rep should look.
Apply these house rules:

${houseDefaultsPrompt()}

CATALOG (sku | name | sold per | nicknames):
${catalogBlock()}`,
    user: `Full order message:\n"""\n${orderText}\n"""\n\nLines to match:\n${lines
      .map((l) => `${l.id}. ${l.raw}  [item: ${l.item}; qty: ${l.qty ?? "none"}; unit: ${l.unit ?? "none"}]`)
      .join("\n")}`,
    toolName: "submit_matches",
    schema: {
      type: "object",
      properties: {
        matches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              sku: { type: ["string", "null"] },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["id", "sku", "confidence"],
          },
        },
      },
      required: ["matches"],
    },
  });
  const valid = new Set(loadCatalog().map((p) => p.sku));
  const byId = new Map(r.input.matches.map((m) => [m.id, m]));
  const out = lines.map((l) => {
    const m = byId.get(l.id);
    return { lineId: l.id, sku: m?.sku && valid.has(m.sku) ? m.sku : null, confidence: m?.confidence ?? "low" };
  });
  return { lines: out, ms: r.ms, usage: r.usage, costUsd: r.costUsd };
}
