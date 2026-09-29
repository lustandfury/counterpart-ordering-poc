import { describe, expect, it } from "vitest";
import { claudeApprove, claudeBands, jevApprove, jevBands, shortlistRecall, summarize, type Row } from "./metrics";

const row = (o: Partial<Row> & { goldSku?: string | null; review?: boolean; jevSku?: string | null; conf?: number; unitOk?: number }): Row => ({
  orderId: "o1",
  lineId: "1",
  raw: "x",
  qty: 5,
  gold: { sku: "goldSku" in o ? (o.goldSku as string | null) : "A", shouldReview: o.review ?? false },
  inShortlist: o.inShortlist ?? true,
  jev: { sku: o.jevSku === undefined ? "A" : o.jevSku, confidence: o.conf ?? 0.95, unitOk: o.unitOk ?? 0.9, unit: "each" },
  claude: o.claude ?? { sku: "A", confidence: "high", unit: "each" },
});

describe("summarize", () => {
  const rows = [
    row({}), // right, approved
    row({ jevSku: "B", conf: 0.95 }), // wrong but confident: a bad approval
    row({ conf: 0.5 }), // right, flagged
    row({ goldSku: null, jevSku: null, review: true, conf: 0.4 }), // correctly flagged not-in-catalog
  ];
  it("counts accuracy, approvals and errors among approved", () => {
    const s = summarize(rows, (r) => r.jev.sku, jevApprove(0.85));
    expect(s.accuracy).toBe(75);
    expect(s.approvedPct).toBe(50);
    expect(s.wrongProductAmongApproved).toBe(50);
    expect(s.reviewAgreement).toBe(75);
  });
  it("T controls how many lines are approved", () => {
    expect(summarize(rows, (r) => r.jev.sku, jevApprove(0.3)).approvedPct).toBeGreaterThan(50);
  });
  it("can ignore unit_ok", () => {
    const low = [row({ unitOk: 0.3 })];
    expect(summarize(low, (r) => r.jev.sku, jevApprove(0.85)).approvedPct).toBe(0);
    expect(summarize(low, (r) => r.jev.sku, jevApprove(0.85, false)).approvedPct).toBe(100);
  });
  it("reports null error rate when nothing is approved", () => {
    expect(summarize([row({ conf: 0.1 })], (r) => r.jev.sku, jevApprove(0.85)).wrongProductAmongApproved).toBeNull();
  });
});

describe("bands, recall, claude", () => {
  it("groups by confidence", () => {
    const b = jevBands([row({ conf: 0.95 }), row({ conf: 0.8, jevSku: "B" }), row({ conf: 0.2 })]);
    expect(b.map((x) => x.lines)).toEqual([1, 1, 1]);
    expect(b[1].accuracy).toBe(0);
  });
  it("shortlist recall", () => expect(shortlistRecall([row({}), row({ inShortlist: false })])).toBe(50));
  it("claude approves only high with a sku", () => {
    expect(claudeApprove(row({}))).toBe(true);
    expect(claudeApprove(row({ claude: { sku: "A", confidence: "medium", unit: "each" } }))).toBe(false);
    expect(claudeBands([row({})])[0].lines).toBe(1);
  });
});
