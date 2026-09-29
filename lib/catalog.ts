import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Product } from "./types";

let cached: Product[] | undefined;
export function loadCatalog(): Product[] {
  cached ??= JSON.parse(readFileSync(join(process.cwd(), "data", "catalog.json"), "utf8")) as Product[];
  return cached;
}
export const productBySku = () => new Map(loadCatalog().map((p) => [p.sku, p]));

export const CATEGORIES: Record<string, string> = {
  dimensional_lumber: "Framing lumber, posts, timbers, boards, studs",
  sheet_goods: "Plywood, OSB, MDF and other panels",
  drywall: "Drywall sheets, joint compound, drywall tape",
  decking_trim: "Deck boards, trim, baseboard, casing, siding",
  fasteners: "Nails, screws, bolts, anchors",
  hardware: "Joist hangers, hurricane ties, post bases, straps",
  concrete_masonry: "Concrete, cement, mortar, sand, gravel, block, rebar, mesh, tube forms",
  roofing: "Shingles, underlayment, ice and water shield, drip edge, vents",
  insulation: "Batts, rigid foam, spray foam cans",
  weatherproofing: "House wrap, flashing tape, cap nails, poly sheeting",
  adhesives_sealants: "Construction adhesive, caulk, glue, stain and sealer",
  tools_supplies: "Shims, saw blades, chalk, stakes",
};
