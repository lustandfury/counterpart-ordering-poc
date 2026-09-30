import type { Decision } from "../types";

export const DEFAULT_T = 0.85;
export const UNIT_OK_MIN = 0.8;

/** House rule: 100+ pieces/sheets, or 50+ of any other unit, always goes to a rep. */
export function isLargeQuantity(qty: number | null, unit: string | null): boolean {
  if (qty == null) return false;
  return unit === "each" || unit === "sheet" ? qty >= 100 : qty >= 50;
}

export function route(a: {
  skuChoice: string; // "NONE" if nothing fit
  skuConfidence: number;
  unitOk: number;
  qty: number | null;
  productUnit: string | null; // catalog unit of the chosen product
  T?: number;
  unitOkMin?: number;
}): Decision {
  const T = a.T ?? DEFAULT_T;
  const unitMin = a.unitOkMin ?? UNIT_OK_MIN;
  const reasons: string[] = [];
  const none = a.skuChoice === "NONE";
  if (none) reasons.push("no single product matched");
  if (a.skuConfidence < T) reasons.push(`product confidence ${a.skuConfidence.toFixed(2)} below ${T}`);
  // With no product there is no quantity check (it is not asked) and no selling unit to judge size against.
  if (!none && a.unitOk < unitMin) reasons.push(`quantity/unit unclear (${a.unitOk.toFixed(2)}, needs ${unitMin})`);
  if (a.qty == null) reasons.push("quantity missing");
  if (!none && isLargeQuantity(a.qty, a.productUnit)) reasons.push("large quantity");
  return { approved: reasons.length === 0, reasons };
}

/** Claude-only comparison: approve only "high" confidence, with the same quantity rules. */
export function routeClaudeOnly(a: {
  sku: string | null;
  confidence: "high" | "medium" | "low";
  qty: number | null;
  productUnit: string | null;
}): Decision {
  const reasons: string[] = [];
  if (!a.sku) reasons.push("no single product matched");
  if (a.confidence !== "high") reasons.push(`Claude confidence ${a.confidence}`);
  if (a.qty == null) reasons.push("quantity missing");
  if (isLargeQuantity(a.qty, a.productUnit)) reasons.push("large quantity");
  return { approved: reasons.length === 0, reasons };
}
