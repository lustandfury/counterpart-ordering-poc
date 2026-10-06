import { claudeModel } from "./claude";
import { claudeOnlyMatch } from "./claude-only";
import { decideLine } from "./decide";
import { mapLimit } from "./limit";
import { convertMetric } from "./metric";
import { parseOrder } from "./parse";
import type { OrderResult } from "../types";
import type { OrderProgress } from "../order-progress";

/** Runs parse (shared), then Jev and Claude-only matching side by side. Thresholds are applied later, from the saved raw scores. */
export class TooManyLinesError extends Error {}

export async function runOrder(orderId: string, text: string, opts: { maxLines?: number; onProgress?: (progress: OrderProgress) => void } = {}): Promise<OrderResult> {
  opts.onProgress?.({ stage: "parse", status: "running" });
  const parsed = await parseOrder(text);
  // Metric sizes and lengths become the catalog's imperial names before either pipeline matches them
  const parse = { ...parsed, lines: parsed.lines.map(convertMetric) };
  opts.onProgress?.({ stage: "parse", status: "complete", total: parse.lines.length });
  // Every parsed line fans out to paid matching calls, so cap it before any of them run.
  if (opts.maxLines != null && parse.lines.length > opts.maxLines) {
    throw new TooManyLinesError(`The order has ${parse.lines.length} items; keep it to ${opts.maxLines} or fewer.`);
  }

  const [jevLines, claudeOnly] = await Promise.all([
    (async () => {
      const t0 = performance.now();
      let completed = 0;
      opts.onProgress?.({ stage: "jev", status: "running", completed, total: parse.lines.length });
      const lines = await mapLimit(parse.lines, 5, async (l) => {
        const line = await decideLine(l, text);
        completed++;
        opts.onProgress?.({ stage: "jev", status: "running", completed, total: parse.lines.length });
        return line;
      });
      opts.onProgress?.({ stage: "jev", status: "complete", completed, total: parse.lines.length });
      const usage = lines.reduce((u, l) => ({ inputTokens: u.inputTokens + l.usage.inputTokens, outputTokens: u.outputTokens + l.usage.outputTokens }), { inputTokens: 0, outputTokens: 0 });
      return { lines, ms: performance.now() - t0, usage, costUsd: lines.reduce((c, l) => c + l.costUsd, 0) };
    })(),
    (async () => {
      opts.onProgress?.({ stage: "claude", status: "running" });
      const comparison = await claudeOnlyMatch(parse.lines, text);
      opts.onProgress?.({ stage: "claude", status: "complete", total: comparison.lines.length });
      return comparison;
    })(),
  ]);

  return { orderId, text, model: claudeModel(), parse, jev: jevLines, claudeOnly };
}
