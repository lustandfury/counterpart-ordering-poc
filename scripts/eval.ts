// Scores the saved pipeline results against data/labels.json.
// Writes results/eval.csv (one row per line), results/eval-summary.md, and results/eval.json (for the
// Results dashboard, so the app never reads the answer key itself). Usage: npm run eval
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { productBySku } from "../lib/catalog";
import {
  buildRows, claudeApprove, claudeBands, jevApprove, jevBands, mean, shortlistRecall, summarize, type Gold,
} from "../lib/eval/metrics";
import { DEFAULT_T, UNIT_OK_MIN } from "../lib/pipeline/route";
import type { OrderResult } from "../lib/types";

const labels = JSON.parse(readFileSync("data/labels.json", "utf8")) as Record<string, Gold[]>;
const results = readdirSync("results")
  .filter((f) => /^o\d+\.json$/.test(f))
  .sort()
  .map((f) => JSON.parse(readFileSync(`results/${f}`, "utf8")) as OrderResult);
const units = productBySku();
const rows = buildRows(results, labels, (s) => units.get(s)?.unit ?? null);

const f = (n: number | null, d = 1) => (n == null ? "n/a" : n.toFixed(d));
const T = DEFAULT_T;
const jev = summarize(rows, (r) => r.jev.sku, jevApprove(T));
const cla = summarize(rows, (r) => r.claude.sku, claudeApprove);
const n = results.length;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const jevMs = mean(results.map((r) => r.jev.ms));
const claMs = mean(results.map((r) => r.claudeOnly.ms));
const jevLineMs = mean(results.map((r) => sum(r.jev.lines.map((l) => l.ms))));
const jevUsd = mean(results.map((r) => r.jev.costUsd));
const claUsd = mean(results.map((r) => r.claudeOnly.costUsd));
const parseUsd = mean(results.map((r) => r.parse.costUsd));

// per-line CSV
const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
const noneLines = rows.filter((r) => r.jev.sku === null).length;
const gateOnly = rows.filter((r) => jevApprove(T, false)(r) && !jevApprove(T, true)(r)).length;
const csv = [
  "order,line,raw,gold_sku,gold_review,jev_sku,jev_conf,jev_unit_ok,jev_approved,jev_correct,claude_sku,claude_conf,claude_approved,claude_correct,in_shortlist",
  ...rows.map((r) =>
    [r.orderId, r.lineId, q(r.raw), r.gold.sku ?? "", r.gold.shouldReview, r.jev.sku ?? "", r.jev.confidence.toFixed(3), r.jev.unitOk.toFixed(3),
      jevApprove(T)(r), r.jev.sku === r.gold.sku, r.claude.sku ?? "", r.claude.confidence, claudeApprove(r), r.claude.sku === r.gold.sku, r.inShortlist].join(","),
  ),
].join("\n");
writeFileSync("results/eval.csv", csv + "\n");

// threshold sweep and unit_ok ablation
const sweep = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.99].map((t) => {
  const withU = summarize(rows, (r) => r.jev.sku, jevApprove(t));
  const noU = summarize(rows, (r) => r.jev.sku, jevApprove(t, false));
  return `| ${t} | ${f(withU.approvedPct)} | ${f(withU.wrongProductAmongApproved)} | ${f(noU.approvedPct)} | ${f(noU.wrongProductAmongApproved)} |`;
});
const unitSweep = [0.3, 0.5, 0.6, 0.7, 0.8].map((u) => {
  const x = summarize(rows, (r) => r.jev.sku, jevApprove(T, true, u));
  return `| ${u} | ${f(x.approvedPct)} | ${f(x.wrongProductAmongApproved)} | ${f(x.shouldHaveReviewedAmongApproved)} |`;
});
const bandRow = (b: { band: string; lines: number; accuracy: number | null }) => `| ${b.band} | ${b.lines} | ${f(b.accuracy)} |`;

const md = `# Evaluation summary

${n} orders, ${rows.length} lines. Model: ${results[0].model}. Jev threshold T = ${T}, unit_ok >= 0.8. Small sample: read these as signals, not benchmarks.
Matching step only (parsing is shared and excluded), except the last row.

| Metric | A: Claude only | B: Claude + Jev |
| --- | --- | --- |
| Lines matched to the right product (%) | ${f(cla.accuracy)} | ${f(jev.accuracy)} |
| Share of lines auto-approved (%) | ${f(cla.approvedPct)} | ${f(jev.approvedPct)} |
| Wrong product among auto-approved lines (%) | ${f(cla.wrongProductAmongApproved)} | ${f(jev.wrongProductAmongApproved)} |
| Auto-approved lines the key says a rep should see (%) | ${f(cla.shouldHaveReviewedAmongApproved)} | ${f(jev.shouldHaveReviewedAmongApproved)} |
| Approve/flag agrees with the key (%) | ${f(cla.reviewAgreement)} | ${f(jev.reviewAgreement)} |
| Time per order, matching step (ms, wall clock) | ${f(claMs, 0)} | ${f(jevMs, 0)} |
| Time per order, matching step (ms, sum of the per-line calls) | ${f(claMs, 0)} | ${f(jevLineMs, 0)} |
| Cost per order, matching step (USD) | ${claUsd.toFixed(5)} | ${jevUsd.toFixed(5)} |
| Cost per 1,000 orders, whole pipeline (USD) | ${(1000 * (parseUsd + claUsd)).toFixed(2)} | ${(1000 * (parseUsd + jevUsd)).toFixed(2)} |

Whole-pipeline cost includes the shared parse step (${parseUsd.toFixed(4)} USD per order). Claude prices are assumed (see lib/pricing.ts).
Caveats:
- Timing: Jev makes up to two calls per line (product, then quantity check), five lines at a time, so its wall-clock time depends on concurrency; the sum of the per-line calls is shown too. Claude-only is one large call (about 17k input tokens). Both ran together in one run, so each includes some contention and network noise.
- ${noneLines} of ${rows.length} lines chose NONE (no catalog match) and skipped the second Jev call, so their \`jev_unit_ok\` is stored as 0 meaning "not asked". That saves Jev time and cost, but it depends on how many not-in-catalog lines the set has, and this set deliberately has many. Do not average \`unit_ok\` over all lines.
- The quantity check was the only reason for flagging on ${gateOnly} of ${rows.length} lines. The check adds little on this set with the current wording (eval.csv shows which lines).
- The second Jev call (its existence, its position after the product choice, and its wording) was designed after seeing this same set of 20 orders fail the first version. The Jev approve rate is therefore in-sample and optimistic, and no held-out set has been run.
- Results vary a little from run to run (the parse and the Claude-only call are not deterministic): across two clean runs Jev's approve rate was 72.7% and 73.9%.
- The approval rules differ: Jev has an extra \`unit_ok\` gate that Claude-only lacks, and its cutoffs (T, \`unit_ok\`) were chosen while looking at this data. See the sweeps below.
- The pipeline (shortlist and option text) was adjusted after a first look at these same 20 orders, and the house rules were written knowing the kinds of cases in them. Both pipelines get the same rules, but absolute accuracy is optimistic.
- Both pipelines have no wrong auto-approvals, so that row cannot tell them apart; with one wrong line in 88 the accuracy figures cannot either.

## Calibration

Accuracy of the chosen product, by the pipeline's own confidence.

**Jev (sku confidence)**

| Band | Lines | Accuracy (%) |
| --- | --- | --- |
${jevBands(rows).map(bandRow).join("\n")}

**Claude only (self-rated)**

| Band | Lines | Accuracy (%) |
| --- | --- | --- |
${claudeBands(rows).map(bandRow).join("\n")}

## Shortlist recall (Jev)

The correct product was in the top-20 shortlist for ${f(shortlistRecall(rows))}% of lines (lines with no correct product count as covered).

## Threshold sweep (Jev)

What the slider does. "With unit_ok" is the real rule; "without" ignores the quantity/unit check.

| T | Approved (%) | Wrong product among approved (%) | Approved, no unit_ok (%) | Wrong among approved, no unit_ok (%) |
| --- | --- | --- | --- | --- |
${sweep.join("\n")}

## unit_ok cutoff sweep (Jev, T = ${T})

The quantity check is asked after the product is known, so its scores are close to all-or-nothing and the cutoff barely matters. (Asked before the product was known, it flagged most lines whose unit was unstated, and this sweep was the main lever.)

| unit_ok cutoff | Approved (%) | Wrong product among approved (%) | Approved lines the key says a rep should see (%) |
| --- | --- | --- | --- |
${unitSweep.join("\n")}

## Lines either pipeline got wrong

${rows
  .filter((r) => r.jev.sku !== r.gold.sku || r.claude.sku !== r.gold.sku)
  .map((r) => `- ${r.orderId}-${r.lineId} "${r.raw}": key ${r.gold.sku ?? "none"}, Jev ${r.jev.sku ?? "none"} (${r.jev.confidence.toFixed(2)}), Claude ${r.claude.sku ?? "none"} (${r.claude.confidence})${r.inShortlist ? "" : " [not in shortlist]"}`)
  .join("\n") || "None."}
`;
writeFileSync("results/eval-summary.md", md);
console.log(md);

// structured copy for the Results dashboard
const byOrder = results.map((r) => {
  const rs = rows.filter((x) => x.orderId === r.orderId);
  const side = (pickSku: (x: (typeof rs)[number]) => string | null, approve: (x: (typeof rs)[number]) => boolean, m: { ms: number; costUsd: number }) => ({
    approved: rs.filter(approve).length,
    correct: rs.filter((x) => pickSku(x) === x.gold.sku).length,
    wrongApproved: rs.filter((x) => approve(x) && pickSku(x) !== x.gold.sku).length,
    matchMs: m.ms,
    matchUsd: m.costUsd,
    totalUsd: m.costUsd + r.parse.costUsd,
  });
  return {
    orderId: r.orderId,
    lines: rs.length,
    shouldReview: rs.filter((x) => x.gold.shouldReview).length,
    jev: side((x) => x.jev.sku, jevApprove(T), r.jev),
    claude: side((x) => x.claude.sku, claudeApprove, r.claudeOnly),
  };
});
writeFileSync(
  "results/eval.json",
  JSON.stringify(
    {
      orders: n,
      lines: rows.length,
      model: results[0].model,
      thresholds: { productConfidence: T, quantityClarity: UNIT_OK_MIN },
      summary: {
        jev: { ...jev, matchMs: jevMs, matchUsd: jevUsd, totalUsd: parseUsd + jevUsd },
        claude: { ...cla, matchMs: claMs, matchUsd: claUsd, totalUsd: parseUsd + claUsd },
        parseUsd,
      },
      bands: { jev: jevBands(rows), claude: claudeBands(rows) },
      shortlistRecall: shortlistRecall(rows),
      wrong: rows
        .filter((r) => r.jev.sku !== r.gold.sku || r.claude.sku !== r.gold.sku)
        .map((r) => ({ orderId: r.orderId, raw: r.raw, key: r.gold.sku, jev: r.jev.sku, jevConfidence: r.jev.confidence, jevApproved: jevApprove(T)(r), claude: r.claude.sku, claudeConfidence: r.claude.confidence, claudeApproved: claudeApprove(r) })),
      byOrder,
      caveats: [
        `Small sample: ${n} orders and ${rows.length} lines. Read these as signals, not benchmarks.`,
        "Parts of the pipeline, including Jev's quantity check, were designed after seeing these same orders, so the results are in-sample. No held-out set has been run.",
        "Claude prices are assumed (see lib/pricing.ts).",
        `${noneLines} of ${rows.length} lines had no catalog match and skipped Jev's second call, which flatters Jev's cost; this set deliberately includes many.`,
        "Results vary slightly between runs.",
      ],
    },
    null,
    2,
  ) + "\n",
);
