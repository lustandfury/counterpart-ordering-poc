import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resultsMetrics, type EvalData } from "./display";

const data = JSON.parse(readFileSync("results/eval.json", "utf8")) as EvalData;

describe("results display against saved eval", () => {
  it("agrees with table totals and allocates all whole-pipeline costs", () => {
    const m = resultsMetrics(data, 0.85, 0.8);
    expect(data.rows).toHaveLength(88);
    expect(m.sameDecisions).toBe(88);
    for (const mode of ["jev", "claude"] as const) {
      expect(m[mode]).toEqual({ correct: 87, approved: 66, wrongApproved: 0, unneeded: 1 });
      for (const key of ["correct", "approved", "wrongApproved", "unneeded"] as const) {
        expect(m.byOrder.reduce((n, o) => n + o[mode][key], 0)).toBe(m[mode][key]);
      }
      const total = data.rows.reduce((n, r) => n + r.cost[mode], 0);
      expect(total / data.costs.length).toBeCloseTo(mode === "jev" ? m.jevCost : m.claudeCost, 12);
    }
    expect(m.jevCost * 10000).toBeCloseTo(101.40, 2);
    expect(m.claudeCost * 10000).toBeCloseTo(456.38, 2);
    expect(m.costRatio.toFixed(1)).toBe("4.5");
    expect(m.matchedLines).toBe(73);
    expect(m.matchedRatio.toFixed(1)).toBe("4.4");
  });

  it("re-routes at current thresholds, changes the headline, and keeps costs fixed", () => {
    const defaults = resultsMetrics(data, 0.85, 0.8);
    const strict = resultsMetrics(data, 0.99, 0.8);
    expect(strict.jev.approved).toBeLessThan(defaults.jev.approved);
    expect(strict.jev.unneeded).toBeGreaterThan(defaults.jev.unneeded);
    expect(strict.sameDecisions).toBeLessThan(88);
    expect(strict.headline).toContain(`on ${strict.sameDecisions} of 88 lines`);
    expect(strict.claude).toEqual(defaults.claude);
    expect(strict.jevCost).toBe(defaults.jevCost);
    const loose = resultsMetrics(data, 0.5, 0.3);
    expect(loose.jev.wrongApproved).toBeGreaterThan(0);
    expect(loose.jev.approved).toBeGreaterThan(defaults.jev.approved);
  });

  it("states unequal accuracy and uses the conservative cost ratio when needed", () => {
    const changed = structuredClone(data);
    changed.rows[0].jev.sku = null;
    for (const r of changed.rows) r.cost.jev = r.cost.claude / 2;
    const m = resultsMetrics(changed, 0.85, 0.8);
    expect(m.headline).toContain("86 vs 87 of 88 right");
    expect(m.headline).toContain("2.0× lower cost on catalog-matched lines");
  });
});
