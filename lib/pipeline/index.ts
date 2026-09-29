import { claudeModel } from "./claude";
import { claudeOnlyMatch } from "./claude-only";
import { decideLine } from "./decide";
import { mapLimit } from "./limit";
import { parseOrder } from "./parse";
import type { OrderResult } from "../types";

/** Runs parse (shared), then Jev and Claude-only matching side by side. Thresholds are applied later, from the saved raw scores. */
export async function runOrder(orderId: string, text: string): Promise<OrderResult> {
  const parse = await parseOrder(text);

  const [jevLines, claudeOnly] = await Promise.all([
    (async () => {
      const t0 = performance.now();
      const lines = await mapLimit(parse.lines, 5, (l) => decideLine(l, text));
      const usage = lines.reduce((u, l) => ({ inputTokens: u.inputTokens + l.usage.inputTokens, outputTokens: u.outputTokens + l.usage.outputTokens }), { inputTokens: 0, outputTokens: 0 });
      return { lines, ms: performance.now() - t0, usage, costUsd: lines.reduce((c, l) => c + l.costUsd, 0) };
    })(),
    claudeOnlyMatch(parse.lines, text),
  ]);

  return { orderId, text, model: claudeModel(), parse, jev: jevLines, claudeOnly };
}
