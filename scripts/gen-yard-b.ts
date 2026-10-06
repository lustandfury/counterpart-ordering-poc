/**
 * Builds a second, fictional yard's raw item-master export (data/yards/fernhill/item-master.csv) from the
 * first yard's catalog, in a different shape: its own item codes, terse ERP descriptions, UoM codes, lumber
 * priced per thousand board feet (MBF), deck boards and pine per lineal foot, anchor bolts per hundred, plus
 * department, bin and user-defined columns. It also carries the mess a real export has: superseded codes,
 * a discontinued item, a duplicate from another branch, and products only this yard stocks.
 *
 * truth.json maps each row back to the first yard's sku and says which rows a person should confirm. It is
 * the answer key for the onboarding step: never pass it to a pipeline or the onboarding prompt.
 *
 * Run: npx tsx scripts/gen-yard-b.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Product } from "../lib/types";

const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8")) as Product[];
const dir = "data/yards/fernhill";

type Row = {
  ITEM_NO: string; DESC1: string; DESC2: string; STK_UOM: string; PRC_UOM: string; LIST_PRICE: string;
  BF_PER_PC: string; DEPT: string; STATUS: string; SUPERSEDED_BY: string; BIN: string; LAST_RCV: string; USER_DEF_1: string;
};
type Truth = { sku: string | null; sellUnit: string; confirm: string | null };

const rows: Row[] = [];
const truth: Record<string, Truth> = {};

// Deterministic "random" so the file is stable between runs.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const day = () => `2026-${String(1 + Math.floor(rand() * 9)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`;
const money = (n: number) => n.toFixed(2);
const markup = (n: number) => n * 1.04; // this yard is a little dearer

function add(r: Partial<Row> & Pick<Row, "ITEM_NO" | "DESC1" | "STK_UOM" | "PRC_UOM" | "LIST_PRICE" | "DEPT">, t: Truth) {
  rows.push({ DESC2: "", BF_PER_PC: "", STATUS: "A", SUPERSEDED_BY: "", BIN: `${pick(["Y", "W", "S"])}-${pick("ABCDEFGH".split(""))}${1 + Math.floor(rand() * 30)}`, LAST_RCV: day(), USER_DEF_1: pick(["", "", "", "MILL DIRECT", "NO BACKORDER", "CHK W/ BUYER", "SPEC ORD OK"]), ...r });
  truth[r.ITEM_NO] = t;
}

const len = (sku: string) => Number(sku.match(/-(\d+)-/)?.[1] ?? sku.match(/-(\d+)$/)?.[1]);

for (const p of catalog) {
  const price = markup(p.price);
  let m: RegExpMatchArray | null;

  // Framing lumber 2x4..2x12: priced per MBF, stocked by the piece
  if ((m = p.sku.match(/^LBR-2X(\d+)-(\d+)-(SPF|PT)$/))) {
    const [, d, l0, sp] = m;
    const l = String(Number(l0));
    const bf = (2 * Number(d) * Number(l)) / 12;
    const pt = sp === "PT";
    add({ ITEM_NO: `${pt ? "PTG" : "SPF"}2X${d}-${l.padStart(2, "0")}`, DESC1: pt ? `2X${d}-${l}' PT GC #2 BRN` : `2X${d}-${l}' SPF #2&BTR KD`, STK_UOM: "PC", PRC_UOM: "MBF", LIST_PRICE: money((price * 1000) / bf), BF_PER_PC: bf.toFixed(3), DEPT: "10" },
      { sku: p.sku, sellUnit: "PC", confirm: null });
    continue;
  }
  if ((m = p.sku.match(/^LBR-2X(4|6)-PRECUT-SPF$/))) {
    add({ ITEM_NO: `SPF2X${m[1]}-925`, DESC1: `2X${m[1]}-92 5/8 PRECUT STUD`, DESC2: "SPF KD", STK_UOM: "PC", PRC_UOM: "PC", LIST_PRICE: money(price), DEPT: "10" }, { sku: p.sku, sellUnit: "PC", confirm: null });
    continue;
  }
  if ((m = p.sku.match(/^LBR-(4X4|6X6)-(\d+)-(SPF|PT)$/))) {
    const [, size, l0, sp] = m;
    const l = String(Number(l0));
    const n = Number(size[0]);
    const bf = (n * n * Number(l)) / 12;
    const pt = sp === "PT";
    add({ ITEM_NO: `${pt ? "PTG" : "SPF"}${size}-${l.padStart(2, "0")}`, DESC1: `${size}-${l}' ${pt ? "PT GC" : "SPF"} ${size === "6X6" ? "TIMBER" : "POST"}`, STK_UOM: "PC", PRC_UOM: "MBF", LIST_PRICE: money((price * 1000) / bf), BF_PER_PC: bf.toFixed(3), DEPT: "10" },
      { sku: p.sku, sellUnit: "PC", confirm: null });
    continue;
  }
  if ((m = p.sku.match(/^LBR-1X(\d)-(\d+)-PINE$/))) {
    const [, w, l] = m;
    add({ ITEM_NO: `PIN1X${w}-${l.padStart(2, "0")}`, DESC1: `1X${w}-${l}' PINE #3 COMMON`, STK_UOM: "PC", PRC_UOM: "LF", LIST_PRICE: money(price / Number(l)), DEPT: "10" },
      { sku: p.sku, sellUnit: "PC", confirm: "Priced per lineal foot but sold by the piece: confirm the length used to convert." });
    continue;
  }

  // Panels
  if (p.category === "sheet_goods") {
    if (p.sku === "SHT-PLY-ZIP-716") continue; // not stocked here
    const code: Record<string, [string, string]> = {
      "SHT-PLY-CDX-12": ["PLY12CDX", `1/2 CDX PLY 4X8`], "SHT-PLY-CDX-58": ["PLY58CDX", `5/8 CDX PLY 4X8`], "SHT-PLY-CDX-34": ["PLY34CDX", `3/4 CDX PLY 4X8`],
      "SHT-PLY-PT-34": ["PLY34PTG", `3/4 PT PLY 4X8 GC`], "SHT-PLY-BIRCH-34": ["PLY34BIR", `3/4 BIRCH G1S 4X8`],
      "SHT-OSB-716": ["OSB716N", `7/16 OSB SHTG 4X8`], "SHT-OSB-12": ["OSB12", `1/2 OSB SHTG 4X8`], "SHT-OSB-58": ["OSB58", `5/8 OSB SHTG 4X8`],
      "SHT-OSB-2332": ["OSB2332TG", `23/32 OSB T&G SUBFLR`], "SHT-MDF-34": ["MDF34", `MDF 3/4 4X8`], "SHT-MDF-12": ["MDF12", `MDF 1/2 4X8`],
    };
    const [item, desc] = code[p.sku];
    add({ ITEM_NO: item, DESC1: desc, STK_UOM: "SHT", PRC_UOM: "SHT", LIST_PRICE: money(price), DEPT: "20" }, { sku: p.sku, sellUnit: "SHT", confirm: null });
    if (p.sku === "SHT-OSB-716") {
      // the old code is still in the file, superseded after a supplier change; contractors still write it
      add({ ITEM_NO: "OSB716", DESC1: "7/16 OSB SHTG 4X8", DESC2: "USE OSB716N", STK_UOM: "SHT", PRC_UOM: "SHT", LIST_PRICE: money(price * 0.96), DEPT: "20", STATUS: "S", SUPERSEDED_BY: "OSB716N" },
        { sku: p.sku, sellUnit: "SHT", confirm: "Superseded code: orders that use it should map to OSB716N." });
    }
    continue;
  }

  // Drywall
  if ((m = p.sku.match(/^DRY-(12|58|14)-(REG|MR|LITE|X|FLEX)-4X(8|10|12)$/))) {
    const [, th, kind, l] = m;
    if (kind === "FLEX") continue; // not stocked here
    const t = th === "12" ? "1/2" : "5/8";
    const label = { REG: "REG", MR: th === "58" ? "MR TYPE X" : "MR GREEN", LITE: "LT WT", X: "TYPE X FR" }[kind]!;
    const item = `GYP${th}${kind === "LITE" ? "L" : kind === "MR" ? "M" : kind === "X" ? "X" : "R"}${l.padStart(2, "0")}`;
    add({ ITEM_NO: item, DESC1: `GYP ${t} ${label} 4X${l}`, STK_UOM: "SHT", PRC_UOM: "SHT", LIST_PRICE: money(price), DEPT: "30" }, { sku: p.sku, sellUnit: "SHT", confirm: null });
    if (item === "GYP12R08") {
      // the same board entered again by the second branch
      add({ ITEM_NO: "GYP-12-REG-48", DESC1: "DRYWALL 1/2IN REGULAR 4X8", DESC2: "BR2", STK_UOM: "SHT", PRC_UOM: "SHT", LIST_PRICE: money(price * 1.02), DEPT: "30" },
        { sku: p.sku, sellUnit: "SHT", confirm: "Duplicate of GYP12R08 entered by the second branch: pick one to sell." });
    }
    continue;
  }
  if (p.sku === "DRY-MUD-45") { add({ ITEM_NO: "JC-AP17", DESC1: "JOINT CMPD ALL PURP 17L", STK_UOM: "PL", PRC_UOM: "PL", LIST_PRICE: money(price), DEPT: "30" }, { sku: p.sku, sellUnit: "PL", confirm: null }); continue; }
  if (p.sku === "DRY-TAPE-250") { add({ ITEM_NO: "TAPE-P250", DESC1: "DW TAPE PAPER 250'", STK_UOM: "RL", PRC_UOM: "RL", LIST_PRICE: money(price), DEPT: "30" }, { sku: p.sku, sellUnit: "RL", confirm: null }); continue; }
  if (p.sku === "DRY-TAPE-MESH") { add({ ITEM_NO: "TAPE-M300", DESC1: "DW TAPE MESH S/A 300'", STK_UOM: "RL", PRC_UOM: "RL", LIST_PRICE: money(price), DEPT: "30" }, { sku: p.sku, sellUnit: "RL", confirm: null }); continue; }

  // Fasteners: box sizes written the counter way (5# = 5 lb); 25 lb comes in a pail here
  if ((m = p.sku.match(/^FST-DECK-(25|3)-(TAN|GRAY|BRN)-(1|5|25)LB$/))) {
    const [, l, c, lb] = m;
    const size = l === "25" ? "2-1/2" : "3";
    const item = `DS10-${l === "25" ? "212" : "3"}${c[0]}-${lb.padStart(2, "0")}`;
    const uom = lb === "25" ? "PL" : "BX";
    const isMoved = item === "DS10-3T-05";
    add({ ITEM_NO: isMoved ? "DS10-3T-05N" : item, DESC1: `#10X${size} DECK SCR ${c} ${lb}#`, STK_UOM: uom, PRC_UOM: uom, LIST_PRICE: money(price), DEPT: "40" }, { sku: p.sku, sellUnit: uom, confirm: null });
    if (isMoved) {
      add({ ITEM_NO: "DS10-3T-05", DESC1: `#10X3 DECK SCR TAN 5#`, DESC2: "DISC - SEE DS10-3T-05N", STK_UOM: "BX", PRC_UOM: "BX", LIST_PRICE: money(price * 0.95), DEPT: "40", STATUS: "S", SUPERSEDED_BY: "DS10-3T-05N" },
        { sku: p.sku, sellUnit: "BX", confirm: "Superseded code: orders that use it should map to DS10-3T-05N." });
    }
    continue;
  }
  if (p.category === "fasteners") {
    const lb = p.sku.match(/-(\d+)LB$/)?.[1];
    const desc: Record<string, string> = {
      "FST-STRC-3": "#9X3 STRUCT WOOD SCR", "FST-DRY-158": "#6X1-5/8 DW SCR CRS", "FST-DRY-214": "#6X2-1/4 DW SCR CRS", "FST-DRY-158-FINE": "#6X1-5/8 DW SCR FINE",
      "FST-16D-COM": "16D CMN BRT NAIL", "FST-16D-SINK": "16D SINKER VC", "FST-8D-COM": "8D CMN BRT NAIL", "FST-10D-GALV": "10D HDG NAIL",
      "FST-FRM-3-PAPER": "3IN 30D PAPER FRM NAIL", "FST-ROOF-118": "1-1/8 EG ROOF NAIL", "FST-ROOF-114": "1-1/4 EG ROOF NAIL",
    };
    const stem = p.sku.replace(/-\d+LB$/, "");
    if (lb && desc[stem]) {
      const uom = lb === "25" ? "PL" : "BX";
      add({ ITEM_NO: `${stem.replace("FST-", "").replace(/-/g, "")}-${lb.padStart(2, "0")}`, DESC1: `${desc[stem]} ${lb}#`, STK_UOM: uom, PRC_UOM: uom, LIST_PRICE: money(price), DEPT: "40" }, { sku: p.sku, sellUnit: uom, confirm: null });
      continue;
    }
    if (p.sku === "FST-TAPCON-14-100") { add({ ITEM_NO: "CS14-314", DESC1: "1/4X3-1/4 CONC SCR 100CT", STK_UOM: "BX", PRC_UOM: "BX", LIST_PRICE: money(price), DEPT: "40" }, { sku: p.sku, sellUnit: "BX", confirm: null }); continue; }
    if (p.sku === "FST-ANCH-12-50") { add({ ITEM_NO: "WA12-6", DESC1: "1/2X6 WEDGE ANCHOR 50CT", STK_UOM: "BX", PRC_UOM: "BX", LIST_PRICE: money(price), DEPT: "40" }, { sku: p.sku, sellUnit: "BX", confirm: null }); continue; }
    if ((m = p.sku.match(/^FST-ATROD-(12|58)-(\d+)$/))) {
      // stocked each, priced per hundred (C)
      add({ ITEM_NO: `JB${m[1]}-${m[2].padStart(2, "0")}`, DESC1: `${m[1] === "12" ? "1/2" : "5/8"}X${m[2]} J-BOLT GALV`, STK_UOM: "EA", PRC_UOM: "C", LIST_PRICE: money(price * 100), DEPT: "40" },
        { sku: p.sku, sellUnit: "EA", confirm: "Priced per hundred (C) but sold each: confirm the conversion." });
      continue;
    }
  }

  // Hardware
  if (p.category === "hardware") {
    const map: Record<string, [string, string, string]> = {
      "HDW-JH-2X4": ["JH2X4", "JST HGR 2X4 FACE MT", "EA"], "HDW-JH-2X6": ["JH2X6", "JST HGR 2X6 FACE MT", "EA"], "HDW-JH-2X8": ["JH2X8", "JST HGR 2X8 FACE MT", "EA"],
      "HDW-JH-2X10": ["JH2X10", "JST HGR 2X10 FACE MT", "EA"], "HDW-HT-H2-5": ["HT25A", "HURR TIE H2.5A", "EA"], "HDW-POST-4X4": ["PB44ADJ", "POST BASE ADJ 4X4", "EA"],
      "HDW-STRAP-12": ["ST12", "STRAP TIE 12IN FLAT", "EA"], "HDW-JH-2X6-BOX": ["JH2X6-BX25", "JST HGR 2X6 BX/25", "BX"],
    };
    const [item, desc, uom] = map[p.sku];
    add({ ITEM_NO: item, DESC1: desc, STK_UOM: uom, PRC_UOM: uom, LIST_PRICE: money(price), DEPT: "40" }, { sku: p.sku, sellUnit: uom, confirm: null });
    continue;
  }

  // Concrete and masonry
  if (p.category === "concrete_masonry") {
    const map: Record<string, [string, string, string]> = {
      "CON-30KG": ["CM30", "CONC MIX 30KG", "BAG"], "CON-FAST-20KG": ["CMF20", "CONC FAST SET 20KG", "BAG"], "MAS-CEM-GU-30KG": ["CEMGU30", "CEMENT GU 30KG", "BAG"],
      "MAS-MORT-S-30KG": ["MORS30", "MORTAR TYPE S 30KG", "BAG"], "MAS-MORT-N-30KG": ["MORN30", "MORTAR TYPE N 30KG", "BAG"], "MAS-SAND-30KG": ["SAND30", "SAND ALL PURP 30KG", "BAG"],
      "MAS-GRAV-30KG": ["GRAV30", "GRAVEL 3/4 CRUSH 30KG", "BAG"], "MAS-CMU-8": ["CMU8", "CMU 8IN STD 8X8X16", "EA"], "MAS-CMU-CAP": ["CMU4CAP", "CMU 4IN SOLID CAP", "EA"],
      "CON-MESH-5X10": ["WWM6610", "WWM 6X6 W1.4 5X10", "SHT"], "CON-REBAR-10M-3M": ["RB10M-3", "REBAR 10M X 3M", "PC"], "CON-REBAR-15M-3M": ["RB15M-3", "REBAR 15M X 3M", "PC"],
      "CON-REBAR-15M-6M": ["RB15M-6", "REBAR 15M X 6M", "PC"], "CON-FORM-SONO-8": ["TF8-4", "TUBE FORM 8IN X 4'", "PC"], "CON-FORM-SONO-12": ["TF12-4", "TUBE FORM 12IN X 4'", "PC"],
    };
    const [item, desc, uom] = map[p.sku];
    add({ ITEM_NO: item, DESC1: desc, STK_UOM: uom, PRC_UOM: uom, LIST_PRICE: money(price), DEPT: "50" }, { sku: p.sku, sellUnit: uom, confirm: null });
    continue;
  }

  // Roofing
  if (p.category === "roofing") {
    const map: Record<string, [string, string, string]> = {
      "ROF-SHG-3TAB-GRY": ["SH3T-CHR", "SHGL 3-TAB CHARCOAL", "BDL"], "ROF-SHG-ARCH-BLK": ["SHAR-ONX", "SHGL ARCH ONYX BLK", "BDL"], "ROF-SHG-ARCH-BRN": ["SHAR-WW", "SHGL ARCH WTHRD WOOD", "BDL"],
      "ROF-SHG-RIDGE": ["SHHR", "SHGL HIP&RDG CAP 20LF", "BDL"], "ROF-UNDER-15": ["FELT15", "FELT #15 432SF", "RL"], "ROF-UNDER-30": ["FELT30", "FELT #30 216SF", "RL"],
      "ROF-UNDER-SYN": ["ULSYN10", "UNDERLAY SYNTH 10SQ", "RL"], "ROF-ICE-36": ["IWS36", "ICE&WTR 36INX66'", "RL"], "ROF-DRIP-10": ["DE10-WH", "DRIP EDGE ALUM 10' WHT", "PC"],
      "ROF-DRIP-10-BRN": ["DE10-BR", "DRIP EDGE ALUM 10' BRN", "PC"], "ROF-VENT-RIDGE": ["RV4", "RIDGE VENT 4'", "PC"],
    };
    const [item, desc, uom] = map[p.sku];
    const gone = p.sku === "ROF-SHG-3TAB-GRY";
    add({ ITEM_NO: item, DESC1: desc, DESC2: gone ? "DISCONTINUED" : "", STK_UOM: uom, PRC_UOM: uom, LIST_PRICE: money(price), DEPT: "60", STATUS: gone ? "I" : "A" },
      { sku: gone ? null : p.sku, sellUnit: uom, confirm: gone ? "Inactive (discontinued): should not be offered." : null });
    continue;
  }

  // Insulation and weatherproofing
  if (p.category === "insulation" || p.category === "weatherproofing") {
    const map: Record<string, [string, string, string]> = {
      "INS-R12-15": ["BT12-15", "BATT R12 3.5X15 KRAFT", "BAG"], "INS-R12-23": ["BT12-23", "BATT R12 3.5X23 KRAFT", "BAG"], "INS-R20-15": ["BT20-15", "BATT R20 5.5X15 KRAFT", "BAG"],
      "INS-R20-23": ["BT20-23", "BATT R20 5.5X23 KRAFT", "BAG"], "INS-R31-16": ["BT31-16", "BATT R31 UNFCD 16IN", "BAG"], "INS-R40-16": ["BT40-16", "BATT R40 UNFCD 16IN", "BAG"],
      "INS-FOAM-1": ["RF1-48", "RIGID FOAM 1IN 4X8", "SHT"], "INS-FOAM-2": ["RF2-48", "RIGID FOAM 2IN 4X8", "SHT"], "INS-SPRAY-CAN": ["FS340", "FOAM SEALANT 340G", "EA"],
      "WTH-WRAP-9": ["HW9-100", "HOUSEWRAP 9X100", "RL"], "WTH-WRAP-3": ["HW3-100", "HOUSEWRAP 3X100", "RL"], "WTH-FLASH-6": ["FT6-75", "FLASH TAPE 6INX75'", "RL"],
      "WTH-FLASH-4": ["FT4-75", "FLASH TAPE 4INX75'", "RL"], "WTH-CAP-1": ["CN1-1M", "CAP NAIL 1IN PLSTC 1M", "BX"], "WTH-POLY-6": ["POLY6-10", "POLY 6MIL 10X100 CLR", "RL"],
    };
    const [item, desc, uom] = map[p.sku];
    add({ ITEM_NO: item, DESC1: desc, STK_UOM: uom, PRC_UOM: uom, LIST_PRICE: money(price), DEPT: "70" }, { sku: p.sku, sellUnit: uom, confirm: null });
    continue;
  }

  // Decking and trim: PT deck boards priced per lineal foot; composite not stocked
  if ((m = p.sku.match(/^DCK-54-(\d+)-PT$/))) {
    const l = Number(m[1]);
    add({ ITEM_NO: `PTD546-${String(l).padStart(2, "0")}`, DESC1: `5/4X6-${l}' PT DECK RAD`, STK_UOM: "PC", PRC_UOM: "LF", LIST_PRICE: money(price / l), DEPT: "80" },
      { sku: p.sku, sellUnit: "PC", confirm: "Priced per lineal foot but sold by the piece: confirm the length used to convert." });
    continue;
  }
  if (p.sku.startsWith("DCK-COMP")) continue;
  if (p.category === "decking_trim") {
    const map: Record<string, [string, string]> = {
      "TRM-1X4-12-PVC": ["PVC1X4-12", "1X4-12' PVC TRIM"], "TRM-1X4-16-PVC": ["PVC1X4-16", "1X4-16' PVC TRIM"], "TRM-BASE-314": ["BSE314-8", "BASE MDF PRMD 3-1/4 8'"],
      "TRM-CASE-225": ["CSG214-7", "CASING MDF PRMD 2-1/4 7'"], "TRM-LAP-8": ["FCL8-12", "FC LAP SIDING 8IN 12'"],
    };
    const [item, desc] = map[p.sku];
    add({ ITEM_NO: item, DESC1: desc, STK_UOM: "PC", PRC_UOM: "PC", LIST_PRICE: money(price), DEPT: "80" }, { sku: p.sku, sellUnit: "PC", confirm: null });
    continue;
  }

  // Adhesives, sealants and supplies
  if (p.category === "adhesives_sealants" || p.category === "tools_supplies") {
    const map: Record<string, [string, string, string]> = {
      "SUP-ADH-CONST-10": ["ADH-HD295", "CONST ADH HD 295ML", "TB"], "SUP-ADH-SUBFL-28": ["ADH-SF828", "ADH SUBFLOOR 828ML", "TB"], "SUP-CAULK-SIL-CLR": ["SIL-CLR300", "SILICONE CLR 300ML", "TB"],
      "SUP-CAULK-LAT-WHT": ["CLK-AL-WH", "CAULK ACRYL LTX WHT 300ML", "TB"], "SUP-GLUE-WOOD-16": ["WG500", "WOOD GLUE 500ML", "EA"], "SUP-SEAL-EXT-5G": ["STN-EXT19", "STAIN/SEALER EXT 18.9L", "PL"],
      "SUP-SHIM-42": ["SHIM-C42", "SHIMS CEDAR 42/BDL", "BDL"], "SUP-BLADE-712": ["BLD714-24", "BLADE 7-1/4 24T FRMG", "EA"], "SUP-LINE-CHALK-BL": ["CHK-BL227", "CHALK BLUE 227G", "EA"],
      "SUP-STAKE-24": ["STK24-12", "STAKES WOOD 24IN BDL/12", "BDL"],
    };
    const [item, desc, uom] = map[p.sku];
    add({ ITEM_NO: item, DESC1: desc, STK_UOM: uom, PRC_UOM: uom, LIST_PRICE: money(price), DEPT: "90" }, { sku: p.sku, sellUnit: uom, confirm: null });
    continue;
  }

  throw new Error(`No yard B mapping for ${p.sku} (${len(p.sku)})`);
}

// Products only this yard stocks: the same order line can resolve differently at each yard.
add({ ITEM_NO: "CDR-SHK18", DESC1: "CEDAR SHAKE #1 18IN", DESC2: "HANDSPLIT", STK_UOM: "BDL", PRC_UOM: "BDL", LIST_PRICE: "89.00", DEPT: "60" }, { sku: null, sellUnit: "BDL", confirm: null });
add({ ITEM_NO: "PLY34MAR", DESC1: "3/4 MARINE FIR PLY 4X8", STK_UOM: "SHT", PRC_UOM: "SHT", LIST_PRICE: "149.00", DEPT: "20" }, { sku: null, sellUnit: "SHT", confirm: null });
add({ ITEM_NO: "PTG2X6-20", DESC1: "2X6-20' PT GC #2 BRN", STK_UOM: "PC", PRC_UOM: "MBF", LIST_PRICE: money((26.4 * 1000) / 20), BF_PER_PC: "20.000", DEPT: "10" }, { sku: null, sellUnit: "PC", confirm: null });
add({ ITEM_NO: "LVL134-912-16", DESC1: "LVL 1-3/4X9-1/2 16'", DESC2: "2.0E", STK_UOM: "PC", PRC_UOM: "LF", LIST_PRICE: "11.40", DEPT: "10" },
  { sku: null, sellUnit: "PC", confirm: "Priced per lineal foot but sold by the piece: confirm the length used to convert." });

mkdirSync(dir, { recursive: true });
const cols: (keyof Row)[] = ["ITEM_NO", "DESC1", "DESC2", "STK_UOM", "PRC_UOM", "LIST_PRICE", "BF_PER_PC", "DEPT", "STATUS", "SUPERSEDED_BY", "BIN", "LAST_RCV", "USER_DEF_1"];
const cell = (v: string) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync(`${dir}/item-master.csv`, [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n");
writeFileSync(`${dir}/truth.json`, JSON.stringify({ _note: "Answer key for onboarding. Never pass this to a pipeline or prompt.", items: truth }, null, 2) + "\n");
const confirm = Object.values(truth).filter((t) => t.confirm).length;
console.log(`Wrote ${rows.length} rows to ${dir}/item-master.csv (${confirm} for a person to confirm)`);
