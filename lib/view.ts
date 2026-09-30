import { REASON, route, routeClaudeOnly } from "./pipeline/route";
import type { OrderResult } from "./types";

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
};

const nameOf = (cat: SlimCatalog, sku: string) => (sku === NONE ? "Not in catalog" : (cat[sku]?.name ?? sku));

/** Applies the routing rule to the saved raw scores. Pure: the slider just calls this again. */
export function computeView(result: OrderResult, mode: Mode, T: number, cat: SlimCatalog, unitOkMin?: number): ViewLine[] {
  const claude = new Map(result.claudeOnly.lines.map((l) => [l.lineId, l]));
  return result.parse.lines.map((pl) => {
    const j = result.jev.lines.find((x) => x.lineId === pl.id)!;
    const others = j.sku.top;
    if (mode === "jev") {
      const pick = j.sku.choice;
      const d = route({ skuChoice: pick, skuConfidence: j.sku.confidence, unitOk: j.unitOk, qty: pl.qty, productUnit: cat[pick]?.unit ?? null, T, unitOkMin });
      const quantityOnly = !d.approved && pick !== NONE && j.sku.confidence >= T && d.reasons.length === 1 && d.reasons[0] === REASON.quantity;
      const reasons = quantityOnly
        ? [`The product looks right (${Math.round(j.sku.confidence * 100)}% sure). Check the quantity: the customer wrote “${pl.raw}”, and this is sold per ${cat[pick]?.unit === "each" ? "piece" : (cat[pick]?.unit ?? "unit")}.`]
        : d.reasons;
      return {
        id: pl.id, raw: pl.raw, qty: pl.qty, unit: pl.unit, sku: pick, name: nameOf(cat, pick), quantityOnly,
        confidence: j.sku.confidence.toFixed(2), approved: d.approved, reasons,
        options: others.map((o) => ({ sku: o.sku, name: nameOf(cat, o.sku), probability: o.probability })),
      };
    }
    const c = claude.get(pl.id)!;
    const pick = c.sku ?? NONE;
    const d = routeClaudeOnly({ sku: c.sku, confidence: c.confidence, qty: pl.qty, productUnit: c.sku ? (cat[c.sku]?.unit ?? null) : null });
    const rest = others.filter((o) => o.sku !== pick).slice(0, 2);
    return {
      id: pl.id, raw: pl.raw, qty: pl.qty, unit: pl.unit, sku: pick, name: nameOf(cat, pick),
      quantityOnly: false, confidence: c.confidence, approved: d.approved, reasons: d.reasons,
      options: [{ sku: pick, name: nameOf(cat, pick) }, ...rest.map((o) => ({ sku: o.sku, name: nameOf(cat, o.sku) }))],
    };
  });
}

export function totals(result: OrderResult, mode: Mode) {
  const m = mode === "jev" ? result.jev : result.claudeOnly;
  return {
    matchMs: m.ms,
    parseMs: result.parse.ms,
    matchUsd: m.costUsd,
    parseUsd: result.parse.costUsd,
    ms: m.ms + result.parse.ms,
    usd: m.costUsd + result.parse.costUsd,
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
  const none = l.options.find((o) => o.sku === NONE) ?? { sku: NONE, name: "Not in catalog" };
  return [...likely, none];
}
