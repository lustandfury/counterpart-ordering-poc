import { describe, expect, it } from "vitest";
import { generateOrder, seeded } from "./generate";

describe("generateOrder", () => {
  const orders = Array.from({ length: 300 }, (_, i) => generateOrder(seeded(i + 1)));

  it("always includes at least one line that needs checking", () => {
    for (const o of orders) expect(o.checks.length).toBeGreaterThanOrEqual(1);
  });

  it("stays within the live-run limits (600 characters, 15 lines)", () => {
    for (const o of orders) {
      expect(o.text.length).toBeLessThanOrEqual(600);
      expect(o.text.split("\n").filter((l) => l.trim()).length).toBeLessThanOrEqual(15);
    }
  });

  it("varies from order to order and is repeatable with a seed", () => {
    expect(new Set(orders.map((o) => o.text)).size).toBeGreaterThan(290);
    expect(generateOrder(seeded(7)).text).toBe(generateOrder(seeded(7)).text);
  });

  it("covers every kind of check", () => {
    const kinds = new Set(orders.flatMap((o) => o.checks));
    expect(kinds.size).toBe(6);
  });
});
