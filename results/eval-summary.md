# Evaluation summary

Same accuracy and the same review decisions on all 88 lines, at 4.5× lower cost per order.

Right product: 87 vs 87 of 88. Auto-approved: 66 vs 66 of 88. Wrong among approved: 0 of 66 vs 0 of 66. Unneeded reviews: 1 vs 1 of 88.

Whole-pipeline mean cost per order: $0.0101 vs $0.0456 (Claude + Jev vs Claude only); per 10,000: $101.40 vs $456.38.
Excluding 15 lines with no catalog match: 4.4× cheaper on 73 matched lines. Shared reading and Claude batch matching are allocated equally across each order's lines; Jev matching uses per-line recorded costs.
Mike Costanzo (2026-09-29). Original API run date not recorded. Jev: jev-latest (resolved version not recorded).

Suggested message to Vadim: “On a small synthetic test set (20 orders, 88 lines), pairing Claude with a much smaller matching model made the same decisions as Claude alone at about 4.5x lower cost per order.”

20 orders, 88 lines. Model: claude-sonnet-5-5. Jev threshold T = 0.85, unit_ok >= 0.8. Small sample: read these as signals, not benchmarks.
Matching step only (parsing is shared and excluded), except the last row.

| Metric | A: Claude only | B: Claude + Jev |
| --- | --- | --- |
| Lines matched to the right product (%) | 99 | 99 |
| Share of lines auto-approved (%) | 75 | 75 |
| Wrong product among auto-approved lines (%) | 0 | 0 |
| Auto-approved lines the key says a rep should see (%) | 0 | 0 |
| Approve/flag agrees with the key (%) | 99 | 99 |
| Time per order, matching step (ms, wall clock) | 2480 | 531 |
| Time per order, matching step (ms, sum of the per-line calls) | 2480 | 1896 |
| Cost per order, matching step (USD) | 0.03652 | 0.00102 |
| Cost per 1,000 orders, whole pipeline (USD) | 45.64 | 10.14 |

Whole-pipeline cost includes the shared parse step (0.0091 USD per order). Costs are recorded token counts at list prices (lib/pricing.ts).
Caveats:
- Timing: Jev makes up to two calls per line (product, then quantity check), five lines at a time, so its wall-clock time depends on concurrency; the sum of the per-line calls is shown too. Claude-only is one large call (about 17k input tokens). Both ran together in one run, so each includes some contention and network noise.
- 15 of 88 lines chose NONE (no catalog match) and skipped the second Jev call, so their `jev_unit_ok` is stored as 0 meaning "not asked". Excluding those lines, the whole-pipeline allocated cost ratio is 4.4×. This set deliberately has many no-match lines. Do not average `unit_ok` over all lines.
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
| >= 0.9 | 75 | 100 |
| 0.7 - 0.9 | 10 | 100 |
| < 0.7 | 3 | 67 |

**Claude only (self-rated)**

| Band | Lines | Accuracy (%) |
| --- | --- | --- |
| high | 72 | 100 |
| medium | 3 | 100 |
| low | 13 | 92 |

## Shortlist recall (Jev)

The correct product was in the top-20 shortlist for 100% of lines (lines with no correct product count as covered).

## Threshold sweep (Jev)

What the slider does. "With unit_ok" is the real rule; "without" ignores the quantity/unit check.

| T | Approved (%) | Wrong product among approved (%) | Approved, no unit_ok (%) | Wrong among approved, no unit_ok (%) |
| --- | --- | --- | --- | --- |
| 0.5 | 77 | 1 | 78 | 1 |
| 0.6 | 76 | 0 | 77 | 0 |
| 0.7 | 76 | 0 | 77 | 0 |
| 0.8 | 76 | 0 | 76 | 0 |
| 0.85 | 75 | 0 | 75 | 0 |
| 0.9 | 72 | 0 | 72 | 0 |
| 0.95 | 65 | 0 | 65 | 0 |
| 0.99 | 44 | 0 | 44 | 0 |

## unit_ok cutoff sweep (Jev, T = 0.85)

The quantity check is asked after the product is known, so its scores are close to all-or-nothing and the cutoff barely matters. (Asked before the product was known, it flagged most lines whose unit was unstated, and this sweep was the main lever.)

| unit_ok cutoff | Approved (%) | Wrong product among approved (%) | Approved lines the key says a rep should see (%) |
| --- | --- | --- | --- |
| 0.3 | 75 | 0 | 0 |
| 0.5 | 75 | 0 | 0 |
| 0.6 | 75 | 0 | 0 |
| 0.7 | 75 | 0 | 0 |
| 0.8 | 75 | 0 | 0 |

## Lines either pipeline got wrong

- o12-4 "half a pallet of block": key MAS-CMU-8, Jev MAS-CMU-8 (0.78), Claude none (low)
- o14-3 "2 bags cement": key none, Jev MAS-CEM-GU-30KG (0.54), Claude none (low)
