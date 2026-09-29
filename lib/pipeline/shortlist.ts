import Fuse from "fuse.js";
import { loadCatalog } from "../catalog";
import type { ParsedLine, Product } from "../types";

let fuse: Fuse<Product> | undefined;
const index = () =>
  (fuse ??= new Fuse(loadCatalog(), {
    keys: [{ name: "name", weight: 0.5 }, { name: "aliases", weight: 0.5 }],
    threshold: 0.6,
    ignoreLocation: true,
    ignoreFieldNorm: true,
  }));

const DIMENSION = /\d+(?:[-/]\d+)?x\d+(?:x\d+)?/gi; // 2x4, 2x4x8, 4x4x10

/**
 * Top-N catalog candidates for one parsed line. Fuzzy search on the whole item, plus a second search
 * on any size token ("2x4x8") so words like "not treated" cannot crowd the right size out of the list.
 */
export function shortlist(line: Pick<ParsedLine, "item">, n = 20): Product[] {
  const q = line.item.toLowerCase().replace(/[()]/g, " ").trim();
  const byItem = index().search(q, { limit: n }).map((r) => r.item);
  const sizes = q.match(DIMENSION) ?? [];
  const bySize = sizes.flatMap((sz) => index().search(sz, { limit: n }).map((r) => r.item));
  const out: Product[] = [];
  const add = (ps: Product[]) => {
    for (const p of ps) if (out.length < n && !out.includes(p)) out.push(p);
  };
  add(byItem.slice(0, Math.ceil(n / 2)));
  add(bySize);
  add(byItem);
  return out;
}
