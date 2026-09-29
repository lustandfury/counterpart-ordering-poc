# Evaluation summary

20 orders, 88 lines. Model: claude-sonnet-5-5. Jev threshold T = 0.85, unit_ok >= 0.8. Small sample: read these as signals, not benchmarks.
Matching step only (parsing is shared and excluded), except the last row.

| Metric | A: Claude only | B: Claude + Jev |
| --- | --- | --- |
| Lines matched to the right product (%) | 100.0 | 98.9 |
| Share of lines auto-approved (%) | 73.9 | 48.9 |
| Wrong product among auto-approved lines (%) | 0.0 | 0.0 |
| Auto-approved lines the key says a rep should see (%) | 0.0 | 0.0 |
| Approve/flag agrees with the key (%) | 97.7 | 72.7 |
| Time per order, matching step (ms, wall clock) | 2324 | 328 |
| Time per order, matching step (ms, sum of the per-line calls) | 2324 | 1155 |
| Cost per order, matching step (USD) | 0.05491 | 0.00071 |
| Cost per 1,000 orders, whole pipeline (USD) | 68.92 | 14.72 |

Whole-pipeline cost includes the shared parse step (0.0140 USD per order). Claude prices are assumed (see lib/pricing.ts).
Caveats:
- Timing: Jev makes one call per line, five at a time, so its wall-clock time depends on concurrency; the sum of the per-line calls is shown too. Claude-only is one large call (about 17k input tokens). Both ran together in one run, so each includes some contention and network noise.
- The approval rules differ: Jev has an extra `unit_ok` gate that Claude-only lacks, and its cutoffs (T, `unit_ok`) were chosen while looking at this data. See the sweeps below.
- The pipeline (shortlist and option text) was adjusted after a first look at these same 20 orders, and the house rules were written knowing the kinds of cases in them. Both pipelines get the same rules, but absolute accuracy is optimistic.
- Both pipelines have no wrong auto-approvals, so that row cannot tell them apart; with one wrong line in 88 the accuracy figures cannot either.

## Calibration

Accuracy of the chosen product, by the pipeline's own confidence.

**Jev (sku confidence)**

| Band | Lines | Accuracy (%) |
| --- | --- | --- |
| >= 0.9 | 71 | 100.0 |
| 0.7 - 0.9 | 12 | 100.0 |
| < 0.7 | 5 | 80.0 |

**Claude only (self-rated)**

| Band | Lines | Accuracy (%) |
| --- | --- | --- |
| high | 71 | 100.0 |
| medium | 3 | 100.0 |
| low | 14 | 100.0 |

## Shortlist recall (Jev)

The correct product was in the top-20 shortlist for 100.0% of lines (lines with no correct product count as covered).

## Threshold sweep (Jev)

What the slider does. "With unit_ok" is the real rule; "without" ignores the quantity/unit check.

| T | Approved (%) | Wrong product among approved (%) | Approved, no unit_ok (%) | Wrong among approved, no unit_ok (%) |
| --- | --- | --- | --- | --- |
| 0.5 | 50.0 | 0.0 | 77.3 | 0.0 |
| 0.6 | 50.0 | 0.0 | 77.3 | 0.0 |
| 0.7 | 50.0 | 0.0 | 76.1 | 0.0 |
| 0.8 | 50.0 | 0.0 | 76.1 | 0.0 |
| 0.85 | 48.9 | 0.0 | 75.0 | 0.0 |
| 0.9 | 46.6 | 0.0 | 67.0 | 0.0 |
| 0.95 | 44.3 | 0.0 | 59.1 | 0.0 |
| 0.99 | 36.4 | 0.0 | 44.3 | 0.0 |

## unit_ok cutoff sweep (Jev, T = 0.85)

Most lines the key says need no review are held back only by the `unit_ok` check, usually when the unit is not stated ("hurricane ties 50"). This shows what relaxing it does.

| unit_ok cutoff | Approved (%) | Wrong product among approved (%) | Approved lines the key says a rep should see (%) |
| --- | --- | --- | --- |
| 0.3 | 75.0 | 0.0 | 0.0 |
| 0.5 | 69.3 | 0.0 | 0.0 |
| 0.6 | 67.0 | 0.0 | 0.0 |
| 0.7 | 58.0 | 0.0 | 0.0 |
| 0.8 | 48.9 | 0.0 | 0.0 |

## Lines either pipeline got wrong

- o14-3 "2 bags cement": key none, Jev MAS-CEM-GU-30KG (0.47), Claude none (low)
