import type { Decision } from "../types";

export const DEFAULT_T = 0.85;

/** Plain-language reasons shown to the rep. */
export const REASON = {
  noMatch: "Needs review. Select an option below.",
  unsure: (c: number) => `We're not sure which product this is (${Math.round(c * 100)}% on the best guess).`,
  quantity: "The quantity or unit may not fit how this product is sold.",
  noQty: "No quantity was given.",
  large: "This is an unusually large quantity. Confirm it with the customer.",
  claude: (c: string) => `Claude rated its own match “${c}”, not “high”.`,
};
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
  if (none) reasons.push(REASON.noMatch);
  if (!none && a.skuConfidence < T) reasons.push(REASON.unsure(a.skuConfidence)); // with no match, the confidence is in "none"
  // With no product there is no quantity check (it is not asked) and no selling unit to judge size against.
  if (!none && a.unitOk < unitMin) reasons.push(REASON.quantity);
  if (a.qty == null) reasons.push(REASON.noQty);
  if (!none && isLargeQuantity(a.qty, a.productUnit)) reasons.push(REASON.large);
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
  if (!a.sku) reasons.push(REASON.noMatch);
  if (a.confidence !== "high") reasons.push(REASON.claude(a.confidence));
  if (a.qty == null) reasons.push(REASON.noQty);
  if (isLargeQuantity(a.qty, a.productUnit)) reasons.push(REASON.large);
  return { approved: reasons.length === 0, reasons };
}
