# House defaults

What a counter person at a lumber yard assumes without calling the contractor. These are
business rules, not answers: they go into both pipelines' prompts and are used to review
labels. Every rule was checked against `data/catalog.json` (203 products).

**Units are Canadian:** bags in kg (30 kg standard), liquids in L / mL, rebar as 10M / 15M in
metres. Lumber, sheet goods, drywall and fasteners keep the imperial nominal sizes that
Canadian yards use (2x4, 4x8, 1/2", #10 x 3", lb boxes).

## Defaults (apply; the line can auto-approve if nothing else is missing)

1. **Framing lumber, 2x4 to 2x12:** no grade means #2; no drying means kiln-dried; no species
   means SPF. (Catalog: every 2x SPF product is "SPF #2 Kiln-Dried".)
2. **A bare number next to lumber or sheet goods means pieces or sheets.** "12 - 2x4x8" is 12 each.
3. **"Stud" or "2x4 stud" means the 2x4 x 92-5/8" precut stud** (`LBR-2X4-PRECUT-SPF`). "2x6 stud"
   means `LBR-2X6-PRECUT-SPF`. A stud is never an 8 ft 2x4.
4. **Drywall with no thickness and no length** ("drywall", "sheetrock", "board", "rock")
   means 1/2" regular 4x8 (`DRY-12-REG-4X8`).
5. **Drywall with a thickness but no type** means regular (not moisture-resistant, lightweight or
   Type X). "1/2 drywall" matches regular, moisture-resistant and lightweight, so this settles it.
6. **"Type X" means 5/8" fire-rated Type X** (`DRY-58-X-*`), not the 5/8" moisture-resistant
   Type X (`DRY-58-MR-*`), which needs "green board" or "moisture resistant" said.
7. **"PT" or "treated" on 2x lumber, 4x4 and 6x6** means the catalog's only treatment level
   (ground contact). Explicit "PT" beats the SPF default.
8. **Length means feet** for lumber and drywall, and **metres for rebar**, read from the size
   ("2x4x8", "16ft", "3m").
9. **Bags are 30 kg.** "Concrete" or "concrete mix" with no size means the 30 kg mix
   (`CON-30KG`); "mortar" means Type S 30 kg. Fast-setting concrete is 20 kg and needs "fast" said.

## No default: always `shouldReview: true`

- **Missing length**, when the catalog offers more than one length for that product
  (dimensional lumber 8/10/12/16 ft, 4x4 and 6x6 posts, 1x boards, deck boards, drywall
  8/10/12 ft, 15M rebar 3 m / 6 m). Products with one length (drip edge, sheet goods at 4x8)
  are not affected.
- **Missing thickness on plywood or OSB**, when more than one exists. "3/4 plywood" also needs
  review (CDX, PT and birch).
- **Missing box size on fasteners** (1 / 5 / 25 lb or 5 / 50 lb).
- **Missing quantity.** Amounts in a unit the catalog does not sell (feet of tape, pounds of nails,
  "half a pallet") also need review.
- **Large quantities:** 100 or more pieces or sheets, or 50 or more of any other unit (bags, boxes,
  rolls, bundles, pails). The two thresholds are the numbers to tune.
- **Anything not in the catalog** (equipment rentals, tools, cedar shakes, marine plywood,
  dumpsters) and references to prior orders ("same as last time").
- **PT with no treatment level:** inert today, because every PT product has exactly one treatment
  level. It becomes active if a second one is added.

## Collision check

For each phrase, the catalog SKUs it could plausibly match. If 2+ SKUs match and no default settles
it, the phrase is in the "no default" list below.

| Phrase | SKUs matched | Settled by |
| --- | --- | --- |
| 2x4 (bare) | 8 (SPF/PT x 4 lengths) | SPF default; length still needed |
| stud | 1 (`LBR-2X4-PRECUT-SPF`) | Default 3 |
| 4x4 post (bare) | 6 (SPF/PT x 3 lengths) | **No default** (species and length) |
| PT on 2x, 4x4, 6x6 | 1 treatment level per size | Default 7 |
| drywall, 1/2" | 9 (regular, MR, lightweight x 3 lengths) | Defaults 4, 5 |
| Type X | 6 (`58-X` and `58-MR`, x 3 lengths) | Default 6 |
| plywood 1/2" | 1 (`SHT-PLY-CDX-12`) | Unique |
| plywood 3/4" | 3 (CDX, PT, birch) | **No default** |
| OSB 3/4 T&G | 1 (`SHT-OSB-2332`) | Unique |
| 5/4 decking, 16 ft | 1 (`DCK-54-16-PT`) | Unique once length is given |
| concrete | 2 mixes (30 kg, fast-set 20 kg) | Default 9 |
| cement | 2 (Portland cement 30 kg, and concrete mix by common usage) | **No default** |
| tape | 4 (paper, mesh, two flashing tapes) | **No default** |
| drywall screws 1-5/8" | 6 (coarse and fine thread x 3 box sizes) | **No default** (thread, box size) |
| deck screws 3" | 6 (tan and gray x 3 box sizes) | **No default** (color, box size) |
| 16d nails | 4 (common and sinker x 2 box sizes) | **No default** |
| felt | 3 (#15, #30, synthetic) | **No default** |
| shingles | 4 (3-tab, arch black, arch brown, hip and ridge) | **No default** |
| caulk | 2 (silicone, latex) | **No default** |
| 15M rebar | 2 (3 m, 6 m) | **No default** (length) |
| 2x6 hangers | 2 (each, box of 25) | "box" in the text picks the box |
| R-20 | 2 (15" and 23" wide) | **No default** (width) |
| drip edge | 2 (white, brown) | Color said in the text; one length only |

### No default: always review (from the collision check)
4x4 posts with no species or length, 3/4" plywood with no type, "cement", "tape" with no type,
"drywall screws" with no thread or box size, deck screws with no color or box size, 16d nails
with no type or box size, "felt" with no weight, "shingles" with no style or color, "caulk" with no
type, rebar with no length, batts with no width.

## Left out of the catalog on purpose
Cedar shakes, marine plywood, equipment rentals, tools and dumpsters. The "deliberately
impossible" sample orders depend on these being absent.
