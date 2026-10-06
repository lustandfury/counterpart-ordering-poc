/**
 * Metric timber sizes and lengths, mapped to the imperial names the catalog uses, before matching.
 * "150 x 50" is the metric name for a 2x6 and "4.8m" is a 16' length, so a line written in metric can
 * find the same products as one written in imperial. The parser keeps the contractor's words ("raw");
 * this only rewrites the product words used for matching, and records each conversion so the rep sees it.
 *
 * The tables are standard trade equivalents, not entries for any particular order.
 */
import type { MetricConversion, ParsedLine } from "../types";

/**
 * Metric section sizes (mm) and the nominal imperial size they're sold as. Both the metric nominal sizes
 * (50, 100, 150...) and the actual dressed sizes of North American lumber (38, 89, 140...) are listed.
 */
const NOMINAL_INCHES: [mm: number, inches: number][] = [
  [25, 1], [38, 2], [50, 2], [75, 3], [89, 4], [100, 4], [140, 6], [150, 6],
  [184, 8], [200, 8], [235, 10], [250, 10], [286, 12], [300, 12],
];
const nominal = (mm: number) => NOMINAL_INCHES.find(([m]) => Math.abs(m - mm) <= 2)?.[1];

// Lumber is cut to even lengths in feet; a metric length converts to the nearest one
const STANDARD_FEET = [6, 8, 10, 12, 14, 16, 18, 20, 24];
const FT_PER_M = 3.28084;

// "150 x 50", "150x50mm", "150 × 50". Not followed by an inch or foot mark, so 2x4 and 4'x8' are left alone.
const SECTION = /\b(\d{2,3})\s*[x×]\s*(\d{2,3})(?:\s*mm\b)?(?!\s*(?:["'”’]|in\b|ft\b))/gi;
// "4.8m", "4.8 m", "4800mm", "4800 mm"
const LENGTH = /\b(\d+(?:\.\d+)?)\s*(mm|m)\b/gi;
// A lumber section, imperial or just converted ("2x6"). Lengths are only converted on lines that have one, so
// products sold in metric lengths (15M rebar 3m) keep their own names.
const HAS_SECTION = /\b\d+x\d+\b/i;

function feetFor(metres: number): number | null {
  if (metres < 1.5 || metres > 8) return null; // not a lumber length
  const ft = metres * FT_PER_M;
  const standard = STANDARD_FEET.find((f) => Math.abs(f - ft) <= 0.6);
  return standard ?? Math.round(ft);
}

/** The product words with metric timber sizes and lengths in imperial, and what was converted. */
export function toImperial(item: string): { item: string; conversions: MetricConversion[] } {
  const conversions: MetricConversion[] = [];
  let out = item.replace(SECTION, (match, a: string, b: string) => {
    const [x, y] = [nominal(Number(a)), nominal(Number(b))];
    if (!x || !y) return match;
    const to = `${Math.min(x, y)}x${Math.max(x, y)}`;
    conversions.push({ from: match.trim(), to });
    return to;
  });
  if (!HAS_SECTION.test(out)) return { item: out, conversions };
  out = out.replace(LENGTH, (match, n: string, unit: string) => {
    const ft = feetFor(unit.toLowerCase() === "mm" ? Number(n) / 1000 : Number(n));
    if (ft == null) return match;
    conversions.push({ from: match.trim(), to: `${ft}'` });
    return `${ft}'`;
  });
  return { item: out, conversions };
}

/** Applies toImperial to a parsed line, keeping the contractor's words in `raw`. Lines with nothing metric come back unchanged. */
export function convertMetric(line: ParsedLine): ParsedLine {
  const { item, conversions } = toImperial(line.item);
  return conversions.length ? { ...line, item, metric: conversions } : line;
}
