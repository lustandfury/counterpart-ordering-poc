// How numbers, money and quantities read on screen. One place, so the review, the cost panel and the results agree.

/** AI cost in US dollars, to the hundredth of a cent: "$0.0042". */
export const usd = (n: number) => `$${n.toFixed(4)}`;

/** A US dollar amount with cents: "$42.00", "$1,250.50". */
export const usdCents = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A duration: "640 ms", "1.2 s". */
export const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);

/** A rounded percentage, or "n/a" when there is nothing to divide. */
export const pct = (n: number | null) => (n == null ? "n/a" : `${Math.round(n)}%`);

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
/** Order prices are Canadian dollars. */
export const money = (n: number) => cad.format(n);

/** A unit price: "$4.27 / pc", "$18.50 / sheet". */
export const perUnit = (price: number, unit: string) => `${money(price)} / ${unit === "each" ? "pc" : unit}`;

/** A quantity with its unit, plural where it reads naturally: "50 pcs", "3 sheets", "100 feet", "2 boxes". */
export function fmtQty(qty: number | null, unit: string | null) {
  if (qty == null) return "no quantity";
  if (!unit) return String(qty);
  const u = unit === "each" ? "pcs" : qty === 1 || /s$|^(feet|ft|lb|kg|m|mm|l|ml|sq)$/i.test(unit) ? unit : /(x|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`;
  return `${qty} ${u}`;
}

/** The name of a selling unit in a sentence: "piece", "pieces", "box", "boxes", "rolls". */
export const unitName = (unit: string, n = 1) => (unit === "each" ? (n === 1 ? "piece" : "pieces") : n === 1 ? unit : unit.endsWith("x") ? `${unit}es` : `${unit}s`);

/** How long ago an order arrived, in the queue: "Just now", "12 min ago", "2 h ago". */
export const ago = (minutes: number) => (minutes < 1 ? "Just now" : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`);

/** A copy of a record without one key. */
export const without = <T,>(record: Record<string, T>, key: string) => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
