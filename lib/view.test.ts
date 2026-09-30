import { describe, expect, it } from "vitest";
import type { OrderResult } from "./types";
import { computeView, segmentText, totals, type SlimCatalog } from "./view";

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
  it("uses Claude's own rating in claude mode", () => {
    const v = computeView(result(0.1), "claude", 0.99, cat)[0];
    expect(v.approved).toBe(true);
    expect(v.confidence).toBe("high");
    expect(computeView(result(0.9, 0.95, null), "claude", 0.85, cat)[0].reasons).toContain("quantity missing");
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
