import { describe, expect, it } from "vitest";
import { isLargeQuantity, REASON, route, routeClaudeOnly } from "./route";

const ok = { skuChoice: "A", skuConfidence: 0.95, unitOk: 0.9, qty: 12, productUnit: "each" };

describe("route (Jev)", () => {
  it("approves a confident, sane line", () => expect(route(ok)).toEqual({ approved: true, reasons: [] }));
  it("flags low product confidence and respects T", () => {
    expect(route({ ...ok, skuConfidence: 0.8 }).approved).toBe(false);
    expect(route({ ...ok, skuConfidence: 0.8, T: 0.7 }).approved).toBe(true);
  });
  it("flags a bad unit check even when the product is certain", () => {
    expect(route({ ...ok, skuConfidence: 1, unitOk: 0.66 }).reasons[0]).toBe(REASON.quantity);
  });
  it("flags NONE, missing quantity and large quantities", () => {
    expect(route({ ...ok, skuChoice: "NONE" }).approved).toBe(false);
    expect(route({ ...ok, skuChoice: "NONE", skuConfidence: 0.8, unitOk: 0, qty: 100, productUnit: null }).reasons).toEqual([REASON.noMatch]);
    expect(route({ ...ok, qty: null }).reasons).toContain(REASON.noQty);
    expect(route({ ...ok, qty: 100 }).reasons).toContain(REASON.large);
  });
});

describe("isLargeQuantity", () => {
  it("uses 100 for pieces/sheets and 50 for other units", () => {
    expect(isLargeQuantity(99, "each")).toBe(false);
    expect(isLargeQuantity(100, "sheet")).toBe(true);
    expect(isLargeQuantity(49, "bag")).toBe(false);
    expect(isLargeQuantity(50, "bag")).toBe(true);
    expect(isLargeQuantity(null, "bag")).toBe(false);
  });
});

describe("routeClaudeOnly", () => {
  it("approves only high confidence with a sku", () => {
    const a = { sku: "A", confidence: "high" as const, qty: 3, productUnit: "roll" };
    expect(routeClaudeOnly(a).approved).toBe(true);
    expect(routeClaudeOnly({ ...a, confidence: "medium" }).approved).toBe(false);
    expect(routeClaudeOnly({ ...a, sku: null }).approved).toBe(false);
  });
});

describe("metric lines", () => {
  const metric = [{ from: "150 x 50", to: "2x6" }];
  it("always go to a rep, even when the match is confident, and say what was converted", () => {
    const d = route({ skuChoice: "A", skuConfidence: 0.99, unitOk: 0.99, qty: 6, productUnit: "each", metric });
    expect(d.approved).toBe(false);
    expect(d.reasons).toEqual([REASON.metric(metric)]);
    expect(d.reasons[0]).toContain("150 x 50 → 2x6");
    expect(routeClaudeOnly({ sku: "A", confidence: "high", qty: 6, productUnit: "each", metric }).approved).toBe(false);
  });
  it("leave lines with no conversion to the normal rule", () => {
    expect(route({ skuChoice: "A", skuConfidence: 0.99, unitOk: 0.99, qty: 6, productUnit: "each", metric: [] }).approved).toBe(true);
  });
});
