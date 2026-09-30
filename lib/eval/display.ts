import { claudeApprove, jevApprove, claudeBands, jevBands, shortlistRecall, type Row } from "./metrics";
import type { OrderResult } from "../types";

export type EvalOrder = { orderId: string; jevUsd: number; claudeUsd: number };
export type CostRow = Row & { cost: { jev: number; claude: number } };
export type EvalData = {
  rows: CostRow[];
  costs: EvalOrder[];
  models: string[];
  provenance: { reviewer: string; runDate: string; jevModel: string };
  caveats: string[];
};

/** Batch calls have no per-line usage: allocate them equally within each order. */
export function allocateCosts(rows: Row[], results: OrderResult[]): CostRow[] {
  const orders = new Map(results.map((r) => [r.orderId, r]));
  return rows.map((row) => {
    const r = orders.get(row.orderId)!;
    const reading = r.parse.costUsd / r.parse.lines.length;
    return { ...row, cost: {
      jev: reading + r.jev.lines.find((l) => l.lineId === row.lineId)!.costUsd,
      claude: reading + r.claudeOnly.costUsd / r.parse.lines.length,
    } };
  });
}

export function resultsMetrics(data: EvalData, T: number, unitMin: number) {
  const { rows } = data;
  const approve = { jev: jevApprove(T, true, unitMin), claude: claudeApprove };
  const side = (rs: Row[], mode: "jev" | "claude") => ({
    correct: rs.filter((r) => r[mode].sku === r.gold.sku).length,
    approved: rs.filter(approve[mode]).length,
    wrongApproved: rs.filter((r) => approve[mode](r) && r[mode].sku !== r.gold.sku).length,
    unneeded: rs.filter((r) => !approve[mode](r) && !r.gold.shouldReview).length,
  });
  const byOrder = data.costs.map((o) => {
    const rs = rows.filter((r) => r.orderId === o.orderId);
    return { ...o, lines: rs.length, shouldReview: rs.filter((r) => r.gold.shouldReview).length,
      decisionsSame: rs.every((r) => approve.jev(r) === approve.claude(r)),
      jev: side(rs, "jev"), claude: side(rs, "claude") };
  });
  const jev = side(rows, "jev"), claude = side(rows, "claude");
  const cost = (mode: "jev" | "claude") => data.costs.reduce((s, o) => s + o[mode === "jev" ? "jevUsd" : "claudeUsd"], 0) / data.costs.length;
  const matched = rows.filter((r) => r.jev.sku !== null);
  const matchedCost = (mode: "jev" | "claude") => matched.reduce((s, r) => s + r.cost[mode], 0);
  const costRatio = cost("claude") / cost("jev");
  const matchedRatio = matchedCost("claude") / matchedCost("jev");
  const leadRatio = matchedRatio < 3.5 ? matchedRatio : costRatio;
  const sameDecisions = rows.filter((r) => approve.jev(r) === approve.claude(r)).length;
  const quality = jev.correct === claude.correct ? "Same accuracy" : `${jev.correct} vs ${claude.correct} of ${rows.length} right (Claude + Jev vs Claude only)`;
  const decisions = sameDecisions === rows.length ? `the same review decisions on all ${rows.length} lines` : `the same review decision on ${sameDecisions} of ${rows.length} lines`;
  const headline = `${quality} and ${decisions}, at ${leadRatio.toFixed(1)}× lower cost ${matchedRatio < 3.5 ? "on catalog-matched lines" : "per order"}.`;
  return { jev, claude, byOrder, costRatio, matchedRatio, leadRatio, headline, sameDecisions,
    matchedLines: matched.length, excludedLines: rows.length - matched.length,
    jevCost: cost("jev"), claudeCost: cost("claude"),
    bands: { jev: jevBands(rows), claude: claudeBands(rows) }, shortlistRecall: shortlistRecall(rows),
    wrong: rows.filter((r) => r.jev.sku !== r.gold.sku || r.claude.sku !== r.gold.sku).map((r) => ({ ...r, jevApproved: approve.jev(r), claudeApproved: approve.claude(r) })),
  };
}
