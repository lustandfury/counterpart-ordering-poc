import { describe, expect, it } from "vitest";
import { isLargeQuantity, route, routeClaudeOnly } from "./route";

const ok = { skuChoice: "A", skuConfidence: 0.95, unitOk: 0.9, qty: 12, productUnit: "each" };

describe("route (Jev)", () => {
  it("approves a confident, sane line", () => expect(route(ok)).toEqual({ approved: true, reasons: [] }));
  it("flags low product confidence and respects T", () => {
    expect(route({ ...ok, skuConfidence: 0.8 }).approved).toBe(false);
    expect(route({ ...ok, skuConfidence: 0.8, T: 0.7 }).approved).toBe(true);
  });
  it("flags a bad unit check even when the product is certain", () => {
    expect(route({ ...ok, skuConfidence: 1, unitOk: 0.66 }).reasons[0]).toMatch(/quantity\/unit/);
  });
  it("flags NONE, missing quantity and large quantities", () => {
    expect(route({ ...ok, skuChoice: "NONE" }).approved).toBe(false);
    expect(route({ ...ok, qty: null }).reasons).toContain("quantity missing");
    expect(route({ ...ok, qty: 100 }).reasons).toContain("large quantity");
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
