// Writes data/review-sheet.csv: one row per labeled line, with the two closest catalog
// alternatives and (if data/blind-labels.json exists) an independent blind labeling and
// where it disagrees. Run: npm run export:review
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Fuse from "fuse.js";
import type { Product } from "./gen-catalog";

type Label = { raw: string; sku: string | null; qty: number | null; unit: string | null; shouldReview: boolean; reason?: string };
type Blind = { id: string; sku: string | null; qty: number | null; unit: string | null; shouldReview: boolean; reason: string };

const readJson = <T>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;
const catalog = readJson<Product[]>("data/catalog.json");
const bySku = new Map(catalog.map((p) => [p.sku, p]));
const labelsPath = existsSync("data/labels.json") ? "data/labels.json" : "data/labels.draft.json";
const labels = readJson<Record<string, Label[]>>(labelsPath);
const blind = existsSync("data/blind-labels.json")
  ? new Map(readJson<Blind[]>("data/blind-labels.json").map((b) => [b.id, b]))
  : null;

const fuse = new Fuse(catalog, {
  keys: [{ name: "name", weight: 0.6 }, { name: "aliases", weight: 0.4 }],
  threshold: 0.6,
  ignoreLocation: true,
});
const name = (sku: string | null) => (sku ? (bySku.get(sku)?.name ?? `?? ${sku}`) : "");
const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const header = [
  "order_id", "line_id", "raw_text", "labeled_sku", "labeled_product", "qty", "unit", "shouldReview", "reason",
  "alt1_sku", "alt1_product", "alt2_sku", "alt2_product",
  "blind_sku", "blind_product", "blind_qty", "blind_unit", "blind_shouldReview", "blind_reason", "blind_disagrees_on",
];
const rows: string[] = [header.join(",")];
let disagreeing = 0;
for (const [orderId, lines] of Object.entries(labels)) {
  lines.forEach((l, i) => {
    const id = `${orderId}-${i + 1}`;
    const alts = fuse
      .search(l.raw.replace(/^[\d\s-]+/, ""))
      .map((r) => r.item)
      .filter((p) => p.sku !== l.sku)
      .slice(0, 2);
    const b = blind?.get(id);
    const diffs: string[] = [];
    if (b) {
      if (b.sku !== l.sku) diffs.push("sku");
      if (b.qty !== l.qty) diffs.push("qty");
      if (b.shouldReview !== l.shouldReview) diffs.push("shouldReview");
      if (diffs.length) disagreeing++;
    }
    rows.push([
      orderId, id, l.raw, l.sku, name(l.sku), l.qty, l.unit, l.shouldReview, l.reason,
      alts[0]?.sku, alts[0]?.name, alts[1]?.sku, alts[1]?.name,
      b?.sku, b ? name(b.sku) : "", b?.qty, b?.unit, b?.shouldReview, b?.reason, b ? diffs.join("; ") : "",
    ].map(cell).join(","));
  });
}
writeFileSync("data/review-sheet.csv", rows.join("\n") + "\n");
console.log(`${rows.length - 1} rows from ${labelsPath}${blind ? `; blind labeler disagrees on ${disagreeing}` : "; no blind labels yet"}`);
