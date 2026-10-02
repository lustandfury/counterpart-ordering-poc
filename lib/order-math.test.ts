import { describe, expect, it } from "vitest";
import type { OrderResult } from "./types";
import { NONE, type SlimCatalog, type ViewLine } from "./view";
import { linePrice, savings, speedLine, subtotal, withTax } from "./order-math";
import { ago, fmtQty, money, perUnit, unitName } from "./format";

const cat: SlimCatalog = {
  STUD: { name: "2x4 Stud", unit: "each", price: 3.6 },
  TAPE: { name: "Joint Tape 250 ft Roll", unit: "roll", price: 4.5 },
  PLY: { name: "1/2 Plywood", unit: "sheet", price: 38 },
};
const line = (over: Partial<ViewLine>): ViewLine => ({
  id: "1", raw: "50 studs", qty: 50, unit: null, sku: "STUD", name: "2x4 Stud", confidence: "0.95",
  approved: true, reasons: [], quantityOnly: false, options: [], ...over,
});

describe("linePrice", () => {
  it("prices an auto-approved line at its quantity", () => {
    expect(linePrice(line({}), undefined, cat)).toEqual({ unit: "$3.60 / pc", total: 180 });
  });
  it("gives a unit price but no total when the written unit isn't the selling unit", () => {
    const tape = line({ raw: "100 feet of tape", qty: 100, unit: "feet", sku: "TAPE", approved: false });
    expect(linePrice(tape, "TAPE", cat)).toEqual({ unit: "$4.50 / roll", total: null });
  });
  it("uses the quantity the rep set in the selling unit", () => {
    const tape = line({ qty: 100, unit: "feet", sku: "TAPE", approved: false });
    expect(linePrice(tape, "TAPE", cat, 2)?.total).toBe(9);
  });
  it("has no price for a line left off the order", () => {
    expect(linePrice(line({}), NONE, cat)).toBeNull();
  });
});

describe("subtotal and tax", () => {
  it("adds the priced lines and counts the ones it can't price", () => {
    const lines = [line({ id: "a" }), line({ id: "b", qty: 3, unit: "sheets", sku: "PLY" }), line({ id: "c", qty: 100, unit: "feet", sku: "TAPE", approved: false })];
    expect(subtotal(lines, { c: "TAPE" }, cat, {})).toEqual({ sum: 294, unpriced: 1 });
    expect(subtotal(lines, { c: "TAPE" }, cat, { c: 1 })).toEqual({ sum: 298.5, unpriced: 0 });
  });
  it("adds 13% HST, rounded to the cent", () => {
    expect(withTax(396)).toEqual({ tax: 51.48, total: 447.48 });
    expect(withTax(0.05)).toEqual({ tax: 0.01, total: 0.06 });
  });
});

describe("savings", () => {
  const u = { inputTokens: 1, outputTokens: 1 };
  const result = (jevMs: number, claudeMs: number) => ({
    parse: { ms: 100, costUsd: 0.01, usage: u, lines: [] },
    jev: { ms: jevMs, costUsd: 0.001, usage: u, lines: [] },
    claudeOnly: { ms: claudeMs, costUsd: 0.04, usage: u, lines: [] },
  }) as unknown as OrderResult;
  it("compares whole-order cost and time", () => {
    const s = savings(result(100, 300));
    expect(s.cheaper).toBeCloseTo(0.05 / 0.011);
    expect(s.timeSaved).toBe(50);
  });
  it("says so when Jev is slower", () => {
    expect(speedLine(savings(result(500, 300)).timeSaved!)).toBe("50% slower");
    expect(speedLine(0)).toBe("same speed");
  });
});

describe("format", () => {
  it("writes quantities the way a rep reads them", () => {
    expect(fmtQty(50, "each")).toBe("50 pcs");
    expect(fmtQty(3, "sheet")).toBe("3 sheets");
    expect(fmtQty(2, "box")).toBe("2 boxes");
    expect(fmtQty(100, "feet")).toBe("100 feet");
    expect(fmtQty(1, "roll")).toBe("1 roll");
    expect(fmtQty(null, "roll")).toBe("no quantity");
  });
  it("names units and prices", () => {
    expect(unitName("each", 2)).toBe("pieces");
    expect(unitName("box", 2)).toBe("boxes");
    expect(perUnit(38, "sheet")).toBe(`${money(38)} / sheet`);
    expect(ago(0)).toBe("Just now");
    expect(ago(125)).toBe("2 h ago");
  });
});
