import type { OrderResult } from "./types";
import { NONE, sameQuantityUnit, totals, type SlimCatalog, type ViewLine } from "./view";
import { perUnit } from "./format";

// Sales tax on the order total. The demo has no province, so it assumes Ontario's 13% HST.
export const SALES_TAX = { label: "HST", rate: 0.13 };

export const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * The price of a line for a product (the rep's pick, else the pipeline's). The line total needs a quantity in the
 * unit the product is sold in: "50 lb" of nails sold by the box has a unit price but no total until the rep sets one.
 * An auto-approved line already passed the quantity check against the selling unit, so its quantity is used as is.
 */
export function linePrice(l: ViewLine, pick: string | undefined, catalog: SlimCatalog, quantity?: number) {
  const product = catalog[pick ?? l.sku];
  if (!product || (pick ?? l.sku) === NONE) return null;
  const qty = quantity ?? l.qty;
  const usable = quantity != null || (l.approved && !pick) || sameQuantityUnit(l.unit, product.unit);
  return { unit: perUnit(product.price, product.unit), total: qty != null && usable ? qty * product.price : null };
}

/** The subtotal of the confirmed lines (auto-approved or checked by the rep), and how many of them can't be priced yet. */
export function subtotal(validated: ViewLine[], resolved: Record<string, string>, catalog: SlimCatalog, quantities: Record<string, number>) {
  let sum = 0;
  let unpriced = 0;
  for (const l of validated) {
    const total = linePrice(l, resolved[l.id], catalog, quantities[l.id])?.total;
    if (total == null) unpriced++;
    else sum += total;
  }
  return { sum, unpriced };
}

/** Tax and total for a subtotal, each rounded to the cent. */
export function withTax(sum: number) {
  const tax = cents(sum * SALES_TAX.rate);
  return { tax, total: cents(sum + tax) };
}

/** How Claude + Jev compares with Claude only on this order's AI cost and time. One place, so the header and the cost panel agree. */
export function savings(result: OrderResult) {
  const jev = totals(result, "jev");
  const claude = totals(result, "claude");
  return {
    cheaper: claude.usd / jev.usd,
    // negative when Jev is slower on this order
    timeSaved: jev.ms > 0 && claude.ms > 0 ? Math.round((1 - jev.ms / claude.ms) * 100) : null,
    jevUsd: jev.usd,
    claudeUsd: claude.usd,
  };
}

export const speedLine = (saved: number) => (saved === 0 ? "same speed" : `${Math.abs(saved)}% ${saved < 0 ? "slower" : "faster"}`);
