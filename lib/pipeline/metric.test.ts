import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../catalog";
import { generateOrder, seeded } from "../generate";
import { convertMetric, toImperial } from "./metric";

describe("toImperial", () => {
  it("maps metric timber sections to their nominal imperial size, smaller side first", () => {
    expect(toImperial("150 x 50")).toEqual({ item: "2x6", conversions: [{ from: "150 x 50", to: "2x6" }] });
    expect(toImperial("100x50mm SPF").item).toBe("2x4 SPF");
    expect(toImperial("50 × 50").item).toBe("2x2");
    expect(toImperial("38 x 89 stud").item).toBe("2x4 stud"); // actual dressed size of a 2x4
    expect(toImperial("50 x 200 joist").item).toBe("2x8 joist");
  });

  it("converts metric lumber lengths to the nearest standard length in feet", () => {
    expect(toImperial("150 x 50 x 4.8m")).toEqual({
      item: "2x6 x 16'",
      conversions: [{ from: "150 x 50", to: "2x6" }, { from: "4.8m", to: "16'" }],
    });
    expect(toImperial("2x4 2400mm").item).toBe("2x4 8'");
    expect(toImperial("2x6 3.6 m").item).toBe("2x6 12'");
  });

  it("leaves imperial sizes and other numbers alone", () => {
    for (const item of ["2x4x8 PT", "4x4 posts", "4'x8' sheet", "1/2 drywall 4x12", "12x16 deck", "30 kg concrete mix", "5\" wire nails", "R20 batts 15\""]) {
      expect(toImperial(item)).toEqual({ item, conversions: [] });
    }
  });

  it("does not convert sizes that are not standard timber sections, or lengths outside lumber range", () => {
    expect(toImperial("60 x 45 widget").conversions).toEqual([]);
    expect(toImperial("poly 0.15 mm").conversions).toEqual([]);
    expect(toImperial("hose 30m").conversions).toEqual([]);
  });

  it("leaves products sold in metric lengths alone: only lumber lengths are converted", () => {
    expect(toImperial("15M rebar 3m").conversions).toEqual([]);
    expect(toImperial("10M rebar 6 m").conversions).toEqual([]);
  });

  it("finds nothing to convert in the catalog, the text orders or generated orders", () => {
    const texts = [
      ...loadCatalog().flatMap((p) => [p.name, ...p.aliases]),
      ...readdirSync("data/orders").filter((f) => f.endsWith(".txt")).flatMap((f) => readFileSync(`data/orders/${f}`, "utf8").split("\n")),
      ...Array.from({ length: 300 }, (_, i) => generateOrder(seeded(i + 1)).text.split("\n")).flat(),
    ];
    expect(texts.filter((t) => toImperial(t).conversions.length)).toEqual([]);
  });
});

describe("convertMetric", () => {
  const line = { id: "1", raw: "1. 150 x 50 = 60 pcs", item: "150 x 50", qty: 60, unit: "pcs" };

  it("rewrites the product words, keeps the contractor's words and records the conversion", () => {
    expect(convertMetric(line)).toEqual({ ...line, item: "2x6", metric: [{ from: "150 x 50", to: "2x6" }] });
  });

  it("returns lines with nothing metric unchanged", () => {
    const imperial = { ...line, raw: "6 - 2x6x10", item: "2x6x10", qty: 6, unit: null };
    expect(convertMetric(imperial)).toBe(imperial);
  });
});
