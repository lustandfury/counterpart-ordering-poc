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

/** Top-N catalog candidates for one parsed line (fuzzy search on name + aliases). */
export function shortlist(line: Pick<ParsedLine, "item">, n = 20): Product[] {
  const q = line.item.toLowerCase().replace(/[()]/g, " ").trim();
  return index().search(q, { limit: n }).map((r) => r.item);
}
