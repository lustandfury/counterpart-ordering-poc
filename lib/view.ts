import { REASON, route, routeClaudeOnly } from "./pipeline/route";
import type { MetricConversion, OrderResult } from "./types";

export type Mode = "jev" | "claude";
export type SlimProduct = { name: string; unit: string; price: number };
export type SlimCatalog = Record<string, SlimProduct>;
export const NONE = "NONE";

export type Option = { sku: string; name: string; probability?: number };

export type ViewLine = {
  id: string;
  raw: string;
  qty: number | null;
  unit: string | null;
  sku: string; // the pipeline's pick, or NONE
  name: string;
  confidence: string; // "0.93" or "high"
  approved: boolean; // auto-approved by the current rule
  reasons: string[];
  quantityOnly: boolean; // product is confident; only the quantity/unit is unclear
  options: Option[]; // the pick first, then the next best candidates
  metric?: MetricConversion[]; // metric sizes converted before matching ("150 x 50" -> "2x6")
};

/**
 * One spelling per unit, so units written differently compare equal: "lbs" = "lb", "tubes" = "tube",
 * "boxes" = "box", "pcs" = "each". "es" is a plural ending only after s, x, ch or sh ("bundles" is "bundle").
 */
export const unitKey = (u: string) => (/^(each|ea|pcs?|pieces?)$/i.test(u) ? "each" : u.toLowerCase().replace(/(?<=(?:s|x|ch|sh))es$|s$/, ""));

// Units that measure or package a quantity. A bare count word ("50 studs", "6 lengths") is a count of pieces.
const MEASURES = new Set(["ft", "feet", "foot", "lf", "in", "inch", "m", "mm", "cm", "lb", "kg", "g", "l", "litre", "liter", "gal", "gallon", "sq", "sqft", "yd", "yard", "ton",
  "sheet", "box", "bag", "bundle", "roll", "pail", "bucket", "tube", "case", "pallet", "pack", "carton", "pair", "set", "can", "jug"]);
// Different words for the same container
const SAME = { bucket: "pail" } as Record<string, string>;

/**
 * Whether a quantity written in one unit can be used as-is for a product sold in another: "24 bundles" for a bundle,
 * "50 studs" for a piece. "100 feet" for a roll, or "50 lb" for a box, cannot.
 */
export function sameQuantityUnit(written: string | null, sold: string): boolean {
  if (!written) return true;
  const w = unitKey(written);
  const s = unitKey(sold);
  if ((SAME[w] ?? w) === (SAME[s] ?? s)) return true;
  return s === "each" && !MEASURES.has(w);
}

const SIZE_PATTERNS: Record<string, RegExp> = {
  ft: /(\d+(?:\.\d+)?)\s*(?:ft\b|feet\b|foot\b|')/gi,
  lb: /(\d+(?:\.\d+)?)\s*(?:lbs?\b|pounds?\b)/gi,
  kg: /(\d+(?:\.\d+)?)\s*(?:kg\b|kilos?\b)/gi,
  L: /(\d+(?:\.\d+)?)\s*(?:L\b|litres?\b|liters?\b)/g,
};
const MEASURE_OF: Record<string, string> = {
  ft: "ft", feet: "ft", foot: "ft", "'": "ft", lf: "ft", lb: "lb", pound: "lb", kg: "kg", kilo: "kg",
  m: "m", metre: "m", meter: "m", l: "L", litre: "L", liter: "L", ltr: "L",
};
// A metric quantity against a product sized in imperial, or the other way round: "15 kg" of nails sold in 5 lb boxes
const CONVERT: Record<string, [to: string, factor: number][]> = {
  kg: [["lb", 2.20462]],
  lb: [["kg", 0.453592]],
  m: [["ft", 3.28084]],
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A suggested quantity in the product's selling unit, when one can be worked out from its name:
 * "100 feet" of a "250 ft Roll" is 1 roll, and "15 kg" of a "5 lb Box" is 7 boxes. Returns null when the name
 * gives no size in the written unit (or one it converts to), so the rep types the quantity instead of trusting a guess.
 */
export function suggestQuantity(qty: number | null, written: string | null, productName: string, sold: string): { qty: number; working: string } | null {
  if (qty == null || !written) return null;
  const measure = MEASURE_OF[unitKey(written)];
  if (!measure) return null;
  const sizeIn = (m: string) => (SIZE_PATTERNS[m] ? [...productName.matchAll(SIZE_PATTERNS[m])].map((x) => Number(x[1])).at(-1) : undefined);
  const plural = (n: number) => `${n} ${sold}${n === 1 ? "" : sold.endsWith("x") ? "es" : "s"}`;
  const size = sizeIn(measure);
  if (size) {
    const n = Math.max(1, Math.ceil(qty / size));
    return { qty: n, working: `${qty} ${measure} ÷ ${size} ${measure} per ${sold} = ${plural(n)}` };
  }
  for (const [to, factor] of CONVERT[measure] ?? []) {
    const other = sizeIn(to);
    if (!other) continue;
    const converted = round1(qty * factor);
    const n = Math.max(1, Math.ceil(converted / other));
    return { qty: n, working: `${qty} ${measure} = ${converted} ${to} ÷ ${other} ${to} per ${sold} = ${plural(n)}` };
  }
  return null;
}

/**
 * The number a rep sees for an order. Samples are stored as o01–o20 and shown as 1001–1020, the same
 * four-digit style as generated orders, which are numbered after them.
 */
export function orderNumber(orderId: string): string {
  const sample = /^o(\d+)$/.exec(orderId);
  if (sample) return String(1000 + Number(sample[1]));
  const photo = /^p(\d+)$/.exec(orderId); // photo orders: P01, P02
  return photo ? `P${photo[1]}` : orderId;
}

/** The product options on a flagged line, in order, without "no match" (leaving a line off is a separate action). */
export function productChoices(l: Pick<ViewLine, "options">): Option[] {
  return displayChoices(l).filter((o) => o.sku !== NONE);
}

const nameOf = (cat: SlimCatalog, sku: string) => (sku === NONE ? "No match: leave off order" : (cat[sku]?.name ?? sku));

/** Applies the routing rule to the saved raw scores. Pure: the slider just calls this again. */
export function computeView(result: OrderResult, mode: Mode, T: number, cat: SlimCatalog, unitOkMin?: number): ViewLine[] {
  const claude = new Map(result.claudeOnly.lines.map((l) => [l.lineId, l]));
  return result.parse.lines.map((pl) => {
    const j = result.jev.lines.find((x) => x.lineId === pl.id)!;
    const others = j.sku.top;
    if (mode === "jev") {
      const pick = j.sku.choice;
      const d = route({ skuChoice: pick, skuConfidence: j.sku.confidence, unitOk: j.unitOk, qty: pl.qty, productUnit: cat[pick]?.unit ?? null, T, unitOkMin, metric: pl.metric });
      const quantityOnly = !d.approved && pick !== NONE && j.sku.confidence >= T && d.reasons.length === 1 && d.reasons[0] === REASON.quantity;
      const closest = others.find((o) => o.sku !== NONE);
      const noMatch = `Best guess: nothing in the catalog fits (${Math.round(j.sku.confidence * 100)}%).${closest ? ` Closest product: ${nameOf(cat, closest.sku)} (${Math.round(closest.probability * 100)}%).` : ""}`;
      const reasons = quantityOnly
        ? [`The product looks right (${Math.round(j.sku.confidence * 100)}% sure). Check the quantity: this is sold per ${cat[pick]?.unit === "each" ? "piece" : (cat[pick]?.unit ?? "unit")}.`]
        : d.reasons.map((r) => (r === REASON.noMatch ? noMatch : r));
      return {
        id: pl.id, raw: pl.raw, qty: pl.qty, unit: pl.unit, sku: pick, name: nameOf(cat, pick), quantityOnly, metric: pl.metric,
        confidence: j.sku.confidence.toFixed(2), approved: d.approved, reasons,
        // The pick shows the same confidence the routing rule and the reason text use. Jev's per-option probability for the
        // pick can differ by a point or two, and two numbers for one thing reads as an error.
        options: others.map((o) => ({ sku: o.sku, name: nameOf(cat, o.sku), probability: o.sku === pick ? j.sku.confidence : o.probability })),
      };
    }
    const c = claude.get(pl.id)!;
    const pick = c.sku ?? NONE;
    const d = routeClaudeOnly({ sku: c.sku, confidence: c.confidence, qty: pl.qty, productUnit: c.sku ? (cat[c.sku]?.unit ?? null) : null, metric: pl.metric });
    const rest = others.filter((o) => o.sku !== pick).slice(0, 2);
    return {
      id: pl.id, raw: pl.raw, qty: pl.qty, unit: pl.unit, sku: pick, name: nameOf(cat, pick), metric: pl.metric,
      quantityOnly: false, confidence: c.confidence, approved: d.approved,
      reasons: d.reasons.map((r) => (r === REASON.noMatch ? "Claude found nothing in the catalog that fits. Choose a product or leave the line off." : r)),
      options: [{ sku: pick, name: nameOf(cat, pick) }, ...rest.map((o) => ({ sku: o.sku, name: nameOf(cat, o.sku) }))],
    };
  });
}

export function totals(result: OrderResult, mode: Mode) {
  const m = mode === "jev" ? result.jev : result.claudeOnly;
  // Reading is shared by both pipelines: parsing, plus transcribing the photo for a photo order
  const parseMs = result.parse.ms + (result.photo?.ms ?? 0);
  const parseUsd = result.parse.costUsd + (result.photo?.costUsd ?? 0);
  return {
    matchMs: m.ms,
    parseMs,
    matchUsd: m.costUsd,
    parseUsd,
    ms: m.ms + parseMs,
    usd: m.costUsd + parseUsd,
  };
}

export type Segment = { text: string; lineId?: string };

/** Splits the order text into plain and per-line segments so lines can be highlighted in place. */
export function segmentText(text: string, lines: { id: string; raw: string }[]): Segment[] {
  const found: { start: number; end: number; id: string }[] = [];
  let cursor = 0;
  for (const l of lines) {
    const start = text.indexOf(l.raw, cursor);
    if (start < 0 || !l.raw) continue;
    found.push({ start, end: start + l.raw.length, id: l.id });
    cursor = start + l.raw.length;
  }
  const out: Segment[] = [];
  let pos = 0;
  for (const f of found) {
    if (f.start > pos) out.push({ text: text.slice(pos, f.start) });
    out.push({ text: text.slice(f.start, f.end), lineId: f.id });
    pos = f.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

/**
 * The choices offered on a flagged line: the likely products in order (the pipeline's pick first, anything under 5%
 * dropped, at most 3), and always "Not in catalog", which is added last when it isn't already among them.
 */
export function displayChoices(l: Pick<ViewLine, "options">): Option[] {
  const likely = l.options.filter((o, i) => i === 0 || (o.probability ?? 1) >= 0.05).slice(0, 3);
  if (likely.some((o) => o.sku === NONE)) return likely;
  const none = l.options.find((o) => o.sku === NONE) ?? { sku: NONE, name: "No match: leave off order" };
  return [...likely, none];
}
