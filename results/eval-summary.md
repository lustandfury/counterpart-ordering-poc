# Evaluation summary

20 orders, 88 lines. Model: claude-sonnet-5-5. Jev threshold T = 0.85, unit_ok >= 0.8. Small sample: read these as signals, not benchmarks.
Matching step only (parsing is shared and excluded), except the last row.

| Metric | A: Claude only | B: Claude + Jev |
| --- | --- | --- |
| Lines matched to the right product (%) | 98.9 | 98.9 |
| Share of lines auto-approved (%) | 75.0 | 75.0 |
| Wrong product among auto-approved lines (%) | 0.0 | 0.0 |
| Auto-approved lines the key says a rep should see (%) | 0.0 | 0.0 |
| Approve/flag agrees with the key (%) | 98.9 | 98.9 |
| Time per order, matching step (ms, wall clock) | 2480 | 531 |
| Time per order, matching step (ms, sum of the per-line calls) | 2480 | 1896 |
| Cost per order, matching step (USD) | 0.03652 | 0.00102 |
| Cost per 1,000 orders, whole pipeline (USD) | 45.64 | 10.14 |

Whole-pipeline cost includes the shared parse step (0.0091 USD per order). Costs are recorded token counts at list prices (lib/pricing.ts).
Caveats:
- Timing: Jev makes up to two calls per line (product, then quantity check), five lines at a time, so its wall-clock time depends on concurrency; the sum of the per-line calls is shown too. Claude-only is one large call (about 17k input tokens). Both ran together in one run, so each includes some contention and network noise.
- 15 of 88 lines chose NONE (no catalog match) and skipped the second Jev call, so their `jev_unit_ok` is stored as 0 meaning "not asked". That saves Jev time and cost, but it depends on how many not-in-catalog lines the set has, and this set deliberately has many. Do not average `unit_ok` over all lines.
- The quantity check was the only reason for flagging on 0 of 88 lines. The check adds little on this set with the current wording (eval.csv shows which lines).
- The second Jev call (its existence, its position after the product choice, and its wording) was designed after seeing this same set of 20 orders fail the first version. The Jev approve rate is therefore in-sample and optimistic, and no held-out set has been run.
- Results vary a little from run to run (the parse and the Claude-only call are not deterministic): across three clean runs Jev's approve rate was 72.7%, 73.9% and 75.0% (the last after a one-line reword of a prompt heading).
- The approval rules differ: Jev has an extra `unit_ok` gate that Claude-only lacks, and its cutoffs (T, `unit_ok`) were chosen while looking at this data. See the sweeps below.
- The pipeline (shortlist and option text) was adjusted after a first look at these same 20 orders, and the house rules were written knowing the kinds of cases in them. Both pipelines get the same rules, but absolute accuracy is optimistic.
- Both pipelines have no wrong auto-approvals, so that row cannot tell them apart; with one wrong line in 88 the accuracy figures cannot either.

## Calibration

Accuracy of the chosen product, by the pipeline's own confidence.

**Jev (sku confidence)**

| Band | Lines | Accuracy (%) |
| --- | --- | --- |
| >= 0.9 | 75 | 100.0 |
| 0.7 - 0.9 | 10 | 100.0 |
| < 0.7 | 3 | 66.7 |

**Claude only (self-rated)**

| Band | Lines | Accuracy (%) |
| --- | --- | --- |
| high | 72 | 100.0 |
| medium | 3 | 100.0 |
| low | 13 | 92.3 |

## Shortlist recall (Jev)

The correct product was in the top-20 shortlist for 100.0% of lines (lines with no correct product count as covered).

## Threshold sweep (Jev)

What the slider does. "With unit_ok" is the real rule; "without" ignores the quantity/unit check.

| T | Approved (%) | Wrong product among approved (%) | Approved, no unit_ok (%) | Wrong among approved, no unit_ok (%) |
| --- | --- | --- | --- | --- |
| 0.5 | 77.3 | 1.5 | 78.4 | 1.4 |
| 0.6 | 76.1 | 0.0 | 77.3 | 0.0 |
| 0.7 | 76.1 | 0.0 | 77.3 | 0.0 |
| 0.8 | 76.1 | 0.0 | 76.1 | 0.0 |
| 0.85 | 75.0 | 0.0 | 75.0 | 0.0 |
| 0.9 | 71.6 | 0.0 | 71.6 | 0.0 |
| 0.95 | 64.8 | 0.0 | 64.8 | 0.0 |
| 0.99 | 44.3 | 0.0 | 44.3 | 0.0 |

## unit_ok cutoff sweep (Jev, T = 0.85)

The quantity check is asked after the product is known, so its scores are close to all-or-nothing and the cutoff barely matters. (Asked before the product was known, it flagged most lines whose unit was unstated, and this sweep was the main lever.)

| unit_ok cutoff | Approved (%) | Wrong product among approved (%) | Approved lines the key says a rep should see (%) |
| --- | --- | --- | --- |
| 0.3 | 75.0 | 0.0 | 0.0 |
| 0.5 | 75.0 | 0.0 | 0.0 |
| 0.6 | 75.0 | 0.0 | 0.0 |
| 0.7 | 75.0 | 0.0 | 0.0 |
| 0.8 | 75.0 | 0.0 | 0.0 |

## Lines either pipeline got wrong

- o12-4 "half a pallet of block": key MAS-CMU-8, Jev MAS-CMU-8 (0.78), Claude none (low)
- o14-3 "2 bags cement": key none, Jev MAS-CEM-GU-30KG (0.54), Claude none (low)
