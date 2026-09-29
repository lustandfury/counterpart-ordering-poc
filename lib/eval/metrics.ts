import { isLargeQuantity, route, routeClaudeOnly } from "../pipeline/route";
import type { OrderResult } from "../types";

export type Gold = { sku: string | null; shouldReview: boolean };

export type Row = {
  orderId: string;
  lineId: string;
  raw: string;
  qty: number | null;
  gold: Gold;
  inShortlist: boolean; // correct product among Jev's shortlist (true when gold is null)
  jev: { sku: string | null; confidence: number; unitOk: number; unit: string | null };
  claude: { sku: string | null; confidence: "high" | "medium" | "low"; unit: string | null };
};

/** Joins saved pipeline results with labels; both are index-aligned per order. */
export function buildRows(
  results: OrderResult[],
  labels: Record<string, Gold[]>,
  unitOf: (sku: string) => string | null,
): Row[] {
  const rows: Row[] = [];
  for (const r of results) {
    const gold = labels[r.orderId];
    if (!gold || gold.length !== r.parse.lines.length) {
      throw new Error(`${r.orderId}: ${r.parse.lines.length} parsed lines vs ${gold?.length ?? 0} labels`);
    }
    const claude = new Map(r.claudeOnly.lines.map((l) => [l.lineId, l]));
    r.parse.lines.forEach((pl, i) => {
      const j = r.jev.lines.find((x) => x.lineId === pl.id)!;
      const c = claude.get(pl.id)!;
      const jevSku = j.sku.choice === "NONE" ? null : j.sku.choice;
      rows.push({
        orderId: r.orderId,
        lineId: pl.id,
        raw: pl.raw,
        qty: pl.qty,
        gold: gold[i],
        inShortlist: gold[i].sku === null || j.shortlist.includes(gold[i].sku!),
        jev: { sku: jevSku, confidence: j.sku.confidence, unitOk: j.unitOk, unit: jevSku ? unitOf(jevSku) : null },
        claude: { sku: c.sku, confidence: c.confidence, unit: c.sku ? unitOf(c.sku) : null },
      });
    });
  }
  return rows;
}

export type Approve = (r: Row) => boolean;

export const jevApprove = (T: number, useUnitOk = true, unitOkMin?: number): Approve => (r) =>
  route({
    skuChoice: r.jev.sku ?? "NONE",
    skuConfidence: r.jev.confidence,
    unitOk: useUnitOk ? r.jev.unitOk : 1,
    qty: r.qty,
    productUnit: r.jev.unit,
    T,
    unitOkMin,
  }).approved;

export const claudeApprove: Approve = (r) =>
  routeClaudeOnly({ sku: r.claude.sku, confidence: r.claude.confidence, qty: r.qty, productUnit: r.claude.unit }).approved;

const pct = (n: number, d: number) => (d === 0 ? null : (100 * n) / d);

export type Summary = {
  lines: number;
  accuracy: number; // % of lines where the chosen product equals the label
  approvedPct: number;
  wrongProductAmongApproved: number | null; // % of approved lines with the wrong product
  shouldHaveReviewedAmongApproved: number | null; // % of approved lines the key says a rep should see
  reviewAgreement: number; // % of lines where approve/flag matches the key
};

export function summarize(rows: Row[], pick: (r: Row) => string | null, approve: Approve): Summary {
  const approved = rows.filter(approve);
  const wrong = approved.filter((r) => pick(r) !== r.gold.sku);
  const should = approved.filter((r) => r.gold.shouldReview);
  const agree = rows.filter((r) => approve(r) === !r.gold.shouldReview);
  return {
    lines: rows.length,
    accuracy: pct(rows.filter((r) => pick(r) === r.gold.sku).length, rows.length)!,
    approvedPct: pct(approved.length, rows.length)!,
    wrongProductAmongApproved: pct(wrong.length, approved.length),
    shouldHaveReviewedAmongApproved: pct(should.length, approved.length),
    reviewAgreement: pct(agree.length, rows.length)!,
  };
}

export type Band = { band: string; lines: number; accuracy: number | null };

export function jevBands(rows: Row[]): Band[] {
  const defs: [string, (c: number) => boolean][] = [
    [">= 0.9", (c) => c >= 0.9],
    ["0.7 - 0.9", (c) => c >= 0.7 && c < 0.9],
    ["< 0.7", (c) => c < 0.7],
  ];
  return defs.map(([band, f]) => {
    const g = rows.filter((r) => f(r.jev.confidence));
    return { band, lines: g.length, accuracy: pct(g.filter((r) => r.jev.sku === r.gold.sku).length, g.length) };
  });
}

export function claudeBands(rows: Row[]): Band[] {
  return (["high", "medium", "low"] as const).map((band) => {
    const g = rows.filter((r) => r.claude.confidence === band);
    return { band, lines: g.length, accuracy: pct(g.filter((r) => r.claude.sku === r.gold.sku).length, g.length) };
  });
}

export const shortlistRecall = (rows: Row[]) => pct(rows.filter((r) => r.inShortlist).length, rows.length)!;

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

export { isLargeQuantity };
