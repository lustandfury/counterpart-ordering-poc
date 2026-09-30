import { claudeModel } from "./claude";
import { claudeOnlyMatch } from "./claude-only";
import { decideLine } from "./decide";
import { mapLimit } from "./limit";
import { parseOrder } from "./parse";
import type { OrderResult } from "../types";

/** Runs parse (shared), then Jev and Claude-only matching side by side. Thresholds are applied later, from the saved raw scores. */
export class TooManyLinesError extends Error {}

export async function runOrder(orderId: string, text: string, opts: { maxLines?: number } = {}): Promise<OrderResult> {
  const parse = await parseOrder(text);
  // Every parsed line fans out to paid matching calls, so cap it before any of them run.
  if (opts.maxLines != null && parse.lines.length > opts.maxLines) {
    throw new TooManyLinesError(`The order has ${parse.lines.length} items; keep it to ${opts.maxLines} or fewer.`);
  }

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
