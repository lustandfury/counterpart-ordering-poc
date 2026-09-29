// Generates data/catalog.json: ~200 synthetic products. Names/sizes are generic and
// modeled on public big-box listings; no dealer's real catalog or SKUs. Run: npm run gen:catalog
import { writeFileSync } from "node:fs";

export type Product = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  aliases: string[];
};

const items: Product[] = [];
const add = (p: Product) => items.push(p);

// Dimensional lumber: SPF and pressure-treated (PT), many lengths
const sizes: [string, number][] = [["2x4", 3.4], ["2x6", 5.6], ["2x8", 8.2], ["2x10", 12.5], ["2x12", 16.9]];
for (const [sz, base] of sizes) {
  for (const len of [8, 10, 12, 16]) {
    const price = +(base * (len / 8) ** 0.95).toFixed(2);
    add({
      sku: `LBR-${sz.toUpperCase()}-${String(len).padStart(2, "0")}-SPF`,
      name: `${sz} x ${len}' SPF #2 Kiln-Dried Framing Lumber`,
      category: "dimensional_lumber", unit: "each", price,
      aliases: [`${sz}x${len}`, `${sz} ${len}ft`, `${sz}x${len} spf`, ...(sz === "2x4" && len === 8 ? ["stud", "2x4 stud"] : [])],
    });
    add({
      sku: `LBR-${sz.toUpperCase()}-${String(len).padStart(2, "0")}-PT`,
      name: `${sz} x ${len}' Pressure-Treated #2 Ground Contact Lumber`,
      category: "dimensional_lumber", unit: "each", price: +(price * 1.45).toFixed(2),
      aliases: [`${sz}x${len} pt`, `${sz}x${len} treated`, `${sz} ${len}ft pt`, `${sz}x${len} green`],
    });
  }
}
for (const len of [8, 10, 12]) {
  add({ sku: `LBR-4X4-${len}-SPF`, name: `4x4 x ${len}' SPF Post`, category: "dimensional_lumber", unit: "each", price: +(len * 1.55).toFixed(2), aliases: [`4x4x${len}`, `4x4 ${len}ft`, "post"] });
  add({ sku: `LBR-4X4-${len}-PT`, name: `4x4 x ${len}' Pressure-Treated Post`, category: "dimensional_lumber", unit: "each", price: +(len * 2.4).toFixed(2), aliases: [`4x4x${len} pt`, `4x4 ${len}ft treated`, "treated post"] });
}
for (const len of [8, 10, 12]) add({ sku: `LBR-6X6-${len}-PT`, name: `6x6 x ${len}' Pressure-Treated Timber`, category: "dimensional_lumber", unit: "each", price: +(len * 5.2).toFixed(2), aliases: [`6x6x${len} pt`, "6x6 post"] });
for (const [sz, p] of [["1x4", 0.95], ["1x6", 1.5], ["1x8", 2.1]] as [string, number][]) {
  for (const len of [8, 12]) add({ sku: `LBR-${sz.toUpperCase()}-${len}-PINE`, name: `${sz} x ${len}' Common Pine Board`, category: "dimensional_lumber", unit: "each", price: +(p * len).toFixed(2), aliases: [`${sz}x${len}`, `${sz} board`, "one by"] });
}

// Sheet goods
const sheets: [string, string, number, string[]][] = [
  ["PLY-CDX-12", `1/2" CDX Plywood 4x8`, 38, ['1/2 ply', 'half inch ply', '1/2 cdx']],
  ["PLY-CDX-58", `5/8" CDX Plywood 4x8`, 46, ['5/8 ply', '5/8 cdx']],
  ["PLY-CDX-34", `3/4" CDX Plywood 4x8`, 58, ['3/4 ply', '3/4 cdx', 'three quarter ply']],
  ["PLY-PT-34", `3/4" Pressure-Treated Plywood 4x8`, 84, ['3/4 pt ply', 'treated ply']],
  ["PLY-BIRCH-34", `3/4" Birch Sanded Plywood 4x8`, 92, ['birch ply', '3/4 birch']],
  ["OSB-716", `7/16" OSB Sheathing 4x8`, 17.5, ['7/16 osb', 'osb', '7/16']],
  ["OSB-12", `1/2" OSB Sheathing 4x8`, 21, ['1/2 osb', 'half osb']],
  ["OSB-58", `5/8" OSB Sheathing 4x8`, 27, ['5/8 osb']],
  ["OSB-2332", `23/32" Tongue & Groove OSB Subfloor 4x8`, 39, ['23/32 osb', 'subfloor', 'tg osb', 'advantech']],
  ["MDF-34", `3/4" MDF Panel 4x8`, 54, ['3/4 mdf', 'mdf']],
  ["MDF-12", `1/2" MDF Panel 4x8`, 42, ['1/2 mdf']],
  ["PLY-ZIP-716", `7/16" Coated Wall Sheathing Panel 4x8`, 33, ['zip', 'zip sheathing']],
];
for (const [k, name, price, aliases] of sheets) add({ sku: `SHT-${k}`, name, category: "sheet_goods", unit: "sheet", price, aliases });

// Drywall
const dw: [string, string, number, string[]][] = [
  ["12-REG", "1/2\" Regular Drywall", 12.5, ["1/2 rock", "1/2 sheetrock", "half inch drywall"]],
  ["12-MR", "1/2\" Moisture-Resistant Drywall (Green Board)", 17, ["1/2 green board", "greenboard"]],
  ["12-LITE", "1/2\" Lightweight Drywall", 14, ["1/2 lite", "light rock"]],
  ["58-REG", "5/8\" Regular Drywall", 15, ["5/8 rock", "5/8 sheetrock"]],
  ["58-X", "5/8\" Type X Fire-Rated Drywall", 17, ["5/8 type x", "5/8 x", "fire rock", "type x"]],
  ["58-MR", "5/8\" Moisture-Resistant Type X Drywall", 21, ["5/8 green board"]],
  ["14-FLEX", "1/4\" Flexible Drywall", 15.5, ["1/4 rock", "flex rock"]],
];
for (const [k, name, price, aliases] of dw) {
  for (const len of [8, 10, 12]) {
    add({ sku: `DRY-${k}-4X${len}`, name: `${name} 4x${len}`, category: "drywall", unit: "sheet", price: +(price * (len / 8)).toFixed(2), aliases: aliases.map((a) => `${a} ${len}ft`).concat(len === 8 ? aliases : []) });
  }
}
add({ sku: "DRY-MUD-45", name: "All-Purpose Joint Compound 4.5 gal Bucket", category: "drywall", unit: "bucket", price: 17, aliases: ["mud", "joint compound", "5 gal mud"] });
add({ sku: "DRY-TAPE-250", name: "Paper Drywall Joint Tape 250 ft Roll", category: "drywall", unit: "roll", price: 4.5, aliases: ["tape", "paper tape"] });
add({ sku: "DRY-TAPE-MESH", name: "Self-Adhesive Mesh Drywall Tape 300 ft Roll", category: "drywall", unit: "roll", price: 7, aliases: ["mesh tape"] });

// Fasteners: same screw in different box sizes
const screws: [string, string, string[]][] = [
  ["DECK-25-TAN", `#10 x 2-1/2" Exterior Deck Screws, Tan`, ["2.5 deck screws", "2 1/2 deck screws"]],
  ["DECK-3-TAN", `#10 x 3" Exterior Deck Screws, Tan`, ["3in deck screws", "3 inch deck screws", "3\" deck screws"]],
  ["DECK-3-GRAY", `#10 x 3" Exterior Deck Screws, Gray`, ["3in gray deck screws"]],
  ["DECK-25-BRN", `#10 x 2-1/2" Exterior Deck Screws, Brown`, ["brown deck screws"]],
  ["STRC-3", `#9 x 3" Structural Wood Screws`, ["3in structural screws", "lags", "timberlok"]],
  ["DRY-158", `#6 x 1-5/8" Coarse-Thread Drywall Screws`, ["1 5/8 drywall screws", "rock screws", "1-5/8 sheetrock screws"]],
  ["DRY-214", `#6 x 2-1/4" Coarse-Thread Drywall Screws`, ["2 1/4 drywall screws"]],
  ["DRY-158-FINE", `#6 x 1-5/8" Fine-Thread Drywall Screws (Steel Stud)`, ["fine thread rock screws", "metal stud screws"]],
];
const boxes: [string, number, number][] = [["1LB", 1, 8], ["5LB", 5, 30], ["25LB", 25, 110]];
for (const [k, name, aliases] of screws) {
  for (const [b, lb, mult] of boxes) {
    if (k.startsWith("STRC") && b === "25LB") continue;
    const basePrice = k.startsWith("DECK") || k.startsWith("STRC") ? mult * 1.25 : mult;
    add({ sku: `FST-${k}-${b}`, name: `${name}, ${lb} lb Box`, category: "fasteners", unit: "box", price: +basePrice.toFixed(2), aliases: aliases.flatMap((a) => [`${a} ${lb}lb`, `${a} ${lb} lb`]) });
  }
}
const nails: [string, string, string[]][] = [
  ["16D-COM", `16d 3-1/2" Common Nails, Bright`, ["16d", "16 penny", "16d commons"]],
  ["16D-SINK", `16d 3-1/4" Sinker Nails, Vinyl-Coated`, ["16d sinkers", "sinkers"]],
  ["8D-COM", `8d 2-1/2" Common Nails, Bright`, ["8d", "8 penny"]],
  ["10D-GALV", `10d 3" Hot-Dip Galvanized Nails`, ["10d galv", "10d hdg", "galvy nails"]],
  ["FRM-3-PAPER", `3" 30° Paper-Collated Framing Nails`, ["framing nails", "gun nails", "3in stick nails"]],
];
for (const [k, name, aliases] of nails) {
  for (const [b, lb, mult] of [["5LB", 5, 14], ["50LB", 50, 85]] as [string, number, number][]) add({ sku: `FST-${k}-${b}`, name: `${name}, ${lb} lb Box`, category: "fasteners", unit: "box", price: mult, aliases: aliases.map((a) => `${a} ${lb}lb`) });
}
add({ sku: "FST-ROOF-118-5LB", name: `1-1/8" Electro-Galvanized Roofing Nails, 5 lb Box`, category: "fasteners", unit: "box", price: 16, aliases: ["roofing nails", "roof nails 5lb"] });
add({ sku: "FST-ROOF-114-1LB", name: `1-1/4" Electro-Galvanized Roofing Nails, 1 lb Box`, category: "fasteners", unit: "box", price: 6, aliases: ["roofing nails 1lb"] });
add({ sku: "FST-TAPCON-14-100", name: `1/4" x 3-1/4" Concrete Screws, 100 ct`, category: "fasteners", unit: "box", price: 32, aliases: ["tapcons", "concrete screws"] });
add({ sku: "FST-ANCH-12-50", name: `1/2" x 6" Wedge Anchors, 50 ct`, category: "fasteners", unit: "box", price: 58, aliases: ["wedge anchors", "1/2 anchors"] });
for (const [k, d, l, p] of [["12-6", "1/2", "6", 1.4], ["12-8", "1/2", "8", 1.9], ["58-10", "5/8", "10", 3.2]] as [string, string, string, number][]) add({ sku: `FST-ATROD-${k}`, name: `${d}" x ${l}" J-Bolt Anchor Bolt`, category: "fasteners", unit: "each", price: p, aliases: [`${d} anchor bolt ${l}`, "j bolts", "anchor bolts"] });

// Hardware (connectors)
for (const [k, name, p, aliases] of [
  ["JH-2X4", "Face-Mount Joist Hanger for 2x4", 0.85, ["2x4 hanger", "2x4 joist hanger"]],
  ["JH-2X6", "Face-Mount Joist Hanger for 2x6", 1.05, ["2x6 hanger", "2x6 joist hanger", "2x6 hangers"]],
  ["JH-2X8", "Face-Mount Joist Hanger for 2x8", 1.3, ["2x8 hanger"]],
  ["JH-2X10", "Face-Mount Joist Hanger for 2x10", 1.6, ["2x10 hanger"]],
  ["HT-H2-5", "H2.5A Hurricane Tie", 0.95, ["hurricane ties", "h2.5"]],
  ["POST-4X4", "Adjustable Post Base for 4x4", 12, ["4x4 post base"]],
  ["STRAP-12", "12\" Flat Strap Tie", 1.75, ["strap tie", "flat strap"]],
] as [string, string, number, string[]][]) add({ sku: `HDW-${k}`, name, category: "hardware", unit: "each", price: p, aliases });
add({ sku: "HDW-JH-2X6-BOX", name: "Face-Mount Joist Hanger for 2x6, Box of 25", category: "hardware", unit: "box", price: 22, aliases: ["2x6 hangers box", "box of 2x6 hangers"] });

// Concrete & masonry
for (const [k, name, p, aliases] of [
  ["CON-60", "Concrete Mix 60 lb Bag", 5.6, ["60lb concrete", "concrete mix"]],
  ["CON-80", "Concrete Mix 80 lb Bag", 6.9, ["80lb concrete", "80 lb crete"]],
  ["CON-FAST-50", "Fast-Setting Concrete Mix 50 lb Bag", 8.5, ["fast set", "quikrete fast"]],
  ["MORT-60", "Type S Mortar Mix 60 lb Bag", 9.5, ["mortar", "type s mortar"]],
  ["MORT-80", "Type N Mortar Mix 80 lb Bag", 11, ["type n mortar"]],
  ["SAND-50", "All-Purpose Sand 50 lb Bag", 5, ["sand", "play sand"]],
  ["GRAV-50", "Crushed Gravel 50 lb Bag", 6, ["gravel", "stone bag"]],
  ["CMU-8", "8x8x16 Concrete Block", 2.4, ["cinder block", "8in block", "block"]],
  ["CMU-CAP", "4x8x16 Solid Concrete Cap Block", 2.1, ["cap block"]],
  ["MESH-5X10", "6x6 W1.4 Welded Wire Mesh 5x10 Sheet", 14, ["wire mesh", "6x6 mesh"]],
  ["REBAR-3-10", "#3 (3/8\") x 10' Rebar", 5.2, ["3 rebar", "#3 rebar", "3/8 rebar"]],
  ["REBAR-4-10", "#4 (1/2\") x 10' Rebar", 8.4, ["4 rebar", "#4 rebar", "1/2 rebar"]],
  ["REBAR-4-20", "#4 (1/2\") x 20' Rebar", 16.5, ["20ft 4 rebar"]],
  ["FORM-SONO-8", "8\" x 4' Concrete Tube Form", 19, ["sonotube 8", "8in tube form"]],
  ["FORM-SONO-12", "12\" x 4' Concrete Tube Form", 28, ["sonotube 12", "12in tube form"]],
] as [string, string, number, string[]][]) add({ sku: k.startsWith("CMU") ? `MAS-${k}` : k.startsWith("MESH") || k.startsWith("REBAR") || k.startsWith("FORM") ? `CON-${k}` : k.startsWith("CON") ? k : `MAS-${k}`, name, category: "concrete_masonry", unit: k.startsWith("REBAR") || k.startsWith("CMU") || k.startsWith("FORM") ? "each" : k.startsWith("MESH") ? "sheet" : "bag", price: p, aliases });

// Roofing
for (const [k, name, p, unit, aliases] of [
  ["SHG-3TAB-GRY", "3-Tab Asphalt Shingles, Charcoal, 33.3 sq ft Bundle", 34, "bundle", ["shingles", "3 tab shingles", "bundle of shingles"]],
  ["SHG-ARCH-BLK", "Architectural Asphalt Shingles, Onyx Black, 32.8 sq ft Bundle", 44, "bundle", ["arch shingles", "black shingles", "dimensional shingles"]],
  ["SHG-ARCH-BRN", "Architectural Asphalt Shingles, Weathered Wood, 32.8 sq ft Bundle", 44, "bundle", ["brown shingles", "weathered wood shingles"]],
  ["SHG-RIDGE", "Hip & Ridge Cap Shingles, 20 lf Bundle", 52, "bundle", ["ridge cap", "hip and ridge"]],
  ["UNDER-15", "#15 Felt Roofing Underlayment 432 sq ft Roll", 30, "roll", ["15# felt", "felt paper", "tar paper"]],
  ["UNDER-30", "#30 Felt Roofing Underlayment 216 sq ft Roll", 34, "roll", ["30# felt"]],
  ["UNDER-SYN", "Synthetic Roofing Underlayment 1000 sq ft Roll", 145, "roll", ["synthetic felt", "syn underlayment"]],
  ["ICE-36", "Self-Adhering Ice & Water Shield 36\" x 66' Roll", 148, "roll", ["ice and water", "ice & water"]],
  ["DRIP-10", "Aluminum Drip Edge 10' White", 7.5, "each", ["drip edge", "white drip edge"]],
  ["DRIP-10-BRN", "Aluminum Drip Edge 10' Brown", 7.5, "each", ["brown drip edge"]],
  ["VENT-RIDGE", "Ridge Vent 4' Section", 9, "each", ["ridge vent"]],
] as [string, string, number, string, string[]][]) add({ sku: `ROF-${k}`, name, category: "roofing", unit, price: p, aliases });

// Insulation
for (const [k, name, p, unit, aliases] of [
  ["R13-15", "R-13 Kraft-Faced Batt 3.5\" x 15\" x 93\" (Bag)", 62, "bag", ["r13", "r13 batts", "r-13 15in"]],
  ["R13-23", "R-13 Kraft-Faced Batt 3.5\" x 23\" x 93\" (Bag)", 78, "bag", ["r13 23in"]],
  ["R19-15", "R-19 Kraft-Faced Batt 6.25\" x 15\" x 93\" (Bag)", 74, "bag", ["r19", "r19 batts", "r-19 15in"]],
  ["R19-23", "R-19 Kraft-Faced Batt 6.25\" x 23\" x 93\" (Bag)", 92, "bag", ["r19 23in"]],
  ["R30-16", "R-30 Unfaced Batt 9.5\" x 16\" x 48\" (Bag)", 68, "bag", ["r30", "r30 batts"]],
  ["R38-16", "R-38 Unfaced Batt 12\" x 16\" x 48\" (Bag)", 82, "bag", ["r38"]],
  ["FOAM-1", "1\" x 4' x 8' Rigid Foam Board", 28, "sheet", ["1in foam", "foam board", "pink board 1in"]],
  ["FOAM-2", "2\" x 4' x 8' Rigid Foam Board", 48, "sheet", ["2in foam", "pink board 2in"]],
  ["SPRAY-CAN", "Expanding Foam Sealant 12 oz Can", 7, "each", ["great stuff", "spray foam can"]],
] as [string, string, number, string, string[]][]) add({ sku: `INS-${k}`, name, category: "insulation", unit, price: p, aliases });

// Weatherproofing / house wrap
for (const [k, name, p, unit, aliases] of [
  ["WRAP-9", "House Wrap 9' x 100' Roll", 165, "roll", ["tyvek", "house wrap", "9ft wrap"]],
  ["WRAP-3", "House Wrap 3' x 100' Roll", 62, "roll", ["3ft tyvek"]],
  ["FLASH-6", "Self-Adhering Flashing Tape 6\" x 75' Roll", 42, "roll", ["flashing tape", "6in flashing"]],
  ["FLASH-4", "Self-Adhering Flashing Tape 4\" x 75' Roll", 32, "roll", ["4in flashing tape"]],
  ["CAP-1", "Cap Nails 1\" Plastic Cap, 1000 ct", 14, "box", ["cap nails", "plastic caps"]],
  ["POLY-6", "6 mil Clear Poly Sheeting 10' x 100'", 68, "roll", ["6 mil poly", "visqueen", "plastic sheeting"]],
] as [string, string, number, string, string[]][]) add({ sku: `WTH-${k}`, name, category: "weatherproofing", unit, price: p, aliases });

// Decking & trim
for (const len of [8, 12, 16]) {
  add({ sku: `DCK-54-${len}-PT`, name: `5/4 x 6 x ${len}' Pressure-Treated Deck Board`, category: "decking_trim", unit: "each", price: +(len * 1.2).toFixed(2), aliases: [`5/4x6x${len}`, "deck board", "5/4 decking"] });
  add({ sku: `DCK-COMP-${len}`, name: `1 x 6 x ${len}' Composite Deck Board, Gray`, category: "decking_trim", unit: "each", price: +(len * 3.4).toFixed(2), aliases: [`composite ${len}ft`, "trex", "comp decking"] });
}
for (const len of [12, 16]) add({ sku: `TRM-1X4-${len}-PVC`, name: `1x4 x ${len}' PVC Trim Board`, category: "decking_trim", unit: "each", price: +(len * 1.6).toFixed(2), aliases: [`1x4 pvc ${len}`, "pvc trim", "azek 1x4"] });
add({ sku: "TRM-BASE-314", name: "3-1/4\" x 8' Primed MDF Baseboard", category: "decking_trim", unit: "each", price: 9, aliases: ["base", "baseboard", "mdf base"] });
add({ sku: "TRM-CASE-225", name: "2-1/4\" x 7' Primed MDF Door Casing", category: "decking_trim", unit: "each", price: 8, aliases: ["casing", "door casing"] });
add({ sku: "TRM-LAP-8", name: "8\" x 12' Fiber-Cement Lap Siding, Primed", category: "decking_trim", unit: "each", price: 19, aliases: ["hardie lap", "8in lap siding", "fiber cement siding"] });

// Adhesives & sealants, supplies
for (const [k, name, p, unit, aliases] of [
  ["ADH-CONST-10", "Heavy-Duty Construction Adhesive 10 oz Tube", 5.5, "each", ["liquid nails", "construction adhesive", "PL tube"]],
  ["ADH-SUBFL-28", "Subfloor Construction Adhesive 28 oz Tube", 8, "each", ["subfloor glue", "subfloor adhesive"]],
  ["CAULK-SIL-CLR", "100% Silicone Caulk 10 oz, Clear", 8.5, "each", ["silicone", "clear silicone"]],
  ["CAULK-LAT-WHT", "Paintable Acrylic Latex Caulk 10 oz, White", 4, "each", ["caulk", "white caulk", "latex caulk"]],
  ["GLUE-WOOD-16", "Wood Glue 16 oz", 6, "each", ["titebond", "wood glue"]],
  ["SEAL-EXT-5G", "Exterior Wood Stain and Sealer 5 gal", 120, "pail", ["5 gal stain", "deck stain"]],
  ["SHIM-42", "Cedar Wood Shims 42 ct Bundle", 4.5, "bundle", ["shims", "cedar shims"]],
  ["BLADE-712", "7-1/4\" 24T Framing Circular Saw Blade", 12, "each", ["saw blade", "circ blade"]],
  ["LINE-CHALK-BL", "Blue Chalk Refill 8 oz", 5, "each", ["blue chalk", "chalk"]],
  ["STAKE-24", "24\" Wood Stakes, Bundle of 12", 11, "bundle", ["stakes", "grade stakes"]],
] as [string, string, number, string, string[]][]) add({ sku: `SUP-${k}`, name, category: k.startsWith("ADH") || k.startsWith("CAULK") || k.startsWith("GLUE") || k.startsWith("SEAL") ? "adhesives_sealants" : "tools_supplies", unit, price: p, aliases });

const seen = new Set<string>();
for (const p of items) {
  if (seen.has(p.sku)) throw new Error(`Duplicate sku ${p.sku}`);
  seen.add(p.sku);
}
writeFileSync("data/catalog.json", JSON.stringify(items, null, 2) + "\n");
const cats = items.reduce<Record<string, number>>((m, p) => ((m[p.category] = (m[p.category] ?? 0) + 1), m), {});
console.log(`${items.length} products`, cats);
