import { describe, expect, it } from "vitest";
import { REASON } from "./pipeline/route";
import type { OrderResult } from "./types";
import { computeView, displayChoices, NONE, orderNumber, productChoices, sameQuantityUnit, segmentText, suggestQuantity, totals, unitKey, type SlimCatalog } from "./view";

const cat: SlimCatalog = { A: { name: "Prod A", unit: "each", price: 1 }, B: { name: "Prod B", unit: "each", price: 1 } };
const u = { inputTokens: 1, outputTokens: 1 };
const result = (conf: number, unitOk = 0.95, qty: number | null = 5): OrderResult => ({
  orderId: "o", text: "5 A\nnothing", model: "m",
  parse: { lines: [{ id: "1", raw: "5 A", item: "A", qty, unit: null }], ms: 100, usage: u, costUsd: 0.01 },
  jev: { lines: [{ lineId: "1", shortlist: ["A", "B"], category: { choice: "c", confidence: 1 }, sku: { choice: "A", confidence: conf, top: [{ sku: "A", probability: conf }, { sku: "B", probability: 1 - conf }] }, unitOk, ms: 5, usage: u, costUsd: 0.001 }], ms: 20, usage: u, costUsd: 0.001 },
  claudeOnly: { lines: [{ lineId: "1", sku: "A", confidence: "high" }], ms: 500, usage: u, costUsd: 0.05 },
});

describe("computeView", () => {
  it("re-routes when the threshold moves", () => {
    expect(computeView(result(0.8), "jev", 0.85, cat)[0].approved).toBe(false);
    expect(computeView(result(0.8), "jev", 0.7, cat)[0].approved).toBe(true);
  });
  it("re-routes when the quantity check cutoff moves", () => {
    expect(computeView(result(0.95, 0.6), "jev", 0.85, cat)[0].approved).toBe(false);
    expect(computeView(result(0.95, 0.6), "jev", 0.85, cat, 0.5)[0].approved).toBe(true);
  });
  it("explains why a line is flagged and lists alternatives", () => {
    const v = computeView(result(0.9, 0.5), "jev", 0.85, cat)[0];
    expect(v.quantityOnly).toBe(true);
    expect(v.reasons[0]).toMatch(/Check the quantity/);
    expect(v.options.map((o) => o.sku)).toEqual(["A", "B"]);
    expect(v.name).toBe("Prod A");
  });
  it("names the threshold in the reason and follows the slider", () => {
    const at85 = computeView(result(0.73, 0.96), "jev", 0.85, cat)[0];
    expect(at85.reasons[0]).toMatch(/73% on the best guess, below your 85% threshold/);
    const at90 = computeView(result(0.73, 0.96), "jev", 0.9, cat)[0];
    expect(at90.reasons[0]).toMatch(/below your 90% threshold/);
  });
  it("shows one confidence for the pick: the number the routing rule uses", () => {
    const r = result(0.73, 0.96);
    r.jev.lines[0].sku.top[0].probability = 0.75; // Jev's raw option probability differs from its confidence
    const v = computeView(r, "jev", 0.85, cat)[0];
    expect(v.options[0].probability).toBe(0.73);
    expect(v.reasons[0]).toContain("73%");
  });
  it("uses Claude's own rating in claude mode", () => {
    const v = computeView(result(0.1), "claude", 0.99, cat)[0];
    expect(v.approved).toBe(true);
    expect(v.confidence).toBe("high");
    expect(computeView(result(0.9, 0.95, null), "claude", 0.85, cat)[0].reasons).toContain(REASON.noQty);
  });
});

describe("displayChoices", () => {
  const opt = (sku: string, probability?: number) => ({ sku, name: sku, probability });
  it("always offers Not in catalog, last when it isn't a likely choice", () => {
    expect(displayChoices({ options: [opt("A", 0.9), opt("B", 0.1)] }).map((o) => o.sku)).toEqual(["A", "B", NONE]);
    expect(displayChoices({ options: [opt("A", 0.6), opt(NONE, 0.3), opt("B", 0.1)] }).map((o) => o.sku)).toEqual(["A", NONE, "B"]);
  });
  it("drops unlikely products but never the pick", () => {
    expect(displayChoices({ options: [opt("A", 0.02), opt("B", 0.01)] }).map((o) => o.sku)).toEqual(["A", NONE]);
  });
});

describe("totals and segments", () => {
  it("adds the shared parse step to the matching step", () => {
    expect(totals(result(0.9), "jev").ms).toBe(120);
    expect(totals(result(0.9), "claude").usd).toBeCloseTo(0.06);
  });
  it("marks each line in the order text", () => {
    const s = segmentText("hi\n5 A\nbye", [{ id: "1", raw: "5 A" }]);
    expect(s).toEqual([{ text: "hi\n" }, { text: "5 A", lineId: "1" }, { text: "\nbye" }]);
  });
});

describe("unitKey", () => {
  it("treats plural and singular spellings of a selling unit as the same unit", () => {
    for (const [written, sold] of [["bundles", "bundle"], ["boxes", "box"], ["sheets", "sheet"], ["buckets", "bucket"], ["pails", "pail"], ["lbs", "lb"], ["pcs", "each"], ["pieces", "each"]]) {
      expect(unitKey(written)).toBe(unitKey(sold));
    }
  });
  it("keeps different units apart", () => {
    expect(unitKey("feet")).not.toBe(unitKey("roll"));
    expect(unitKey("lb")).not.toBe(unitKey("box"));
  });
});

describe("sameQuantityUnit", () => {
  it("accepts a quantity written in the selling unit, a synonym, or a count of pieces", () => {
    expect(sameQuantityUnit("bundles", "bundle")).toBe(true);
    expect(sameQuantityUnit("buckets", "pail")).toBe(true);
    expect(sameQuantityUnit("studs", "each")).toBe(true);
    expect(sameQuantityUnit(null, "roll")).toBe(true);
  });
  it("rejects a measure or a different container", () => {
    expect(sameQuantityUnit("feet", "roll")).toBe(false);
    expect(sameQuantityUnit("lb", "box")).toBe(false);
    expect(sameQuantityUnit("feet", "each")).toBe(false);
    expect(sameQuantityUnit("boxes", "each")).toBe(false);
  });
});

describe("suggestQuantity", () => {
  it("converts a length into rolls when the product name gives the roll length, rounding up", () => {
    expect(suggestQuantity(100, "feet", "Paper Drywall Joint Tape 250 ft Roll", "roll")).toEqual({ qty: 1, working: "100 ft ÷ 250 ft per roll = 1 roll" });
    expect(suggestQuantity(140, "ft", "Self-Adhering Ice & Water Shield 36\" x 66' Roll", "roll")?.qty).toBe(3);
  });
  it("converts weight into boxes", () => {
    expect(suggestQuantity(50, "lb", "Framing Nails 3-1/4\" 5 lb Box", "box")?.qty).toBe(10);
  });
  it("gives no suggestion when the name has no size in that unit, or the quantity is missing", () => {
    expect(suggestQuantity(100, "feet", "Synthetic Roofing Underlayment 1000 sq ft Roll", "roll")).toBeNull();
    expect(suggestQuantity(null, "feet", "Tape 250 ft Roll", "roll")).toBeNull();
    expect(suggestQuantity(3, "boxes", "Screws 5 lb Box", "box")).toBeNull();
  });
});

describe("productChoices", () => {
  it("lists products only, so leaving a line off is never a numbered option", () => {
    const opt = (sku: string, probability: number) => ({ sku, name: sku, probability });
    expect(productChoices({ options: [opt(NONE, 0.82), opt("TAPE", 0.14), opt("MESH", 0.02)] }).map((o) => o.sku)).toEqual(["TAPE"]);
    expect(productChoices({ options: [opt("A", 0.6), opt(NONE, 0.3), opt("B", 0.1)] }).map((o) => o.sku)).toEqual(["A", "B"]);
  });
});

describe("orderNumber", () => {
  it("shows sample ids in the same four-digit style as generated orders", () => {
    expect(orderNumber("o01")).toBe("1001");
    expect(orderNumber("o13")).toBe("1013");
    expect(orderNumber("o20")).toBe("1020");
    expect(orderNumber("1021")).toBe("1021");
  });
});
