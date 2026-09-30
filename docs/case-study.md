# Counterpart: a case study

An outside-in sketch of AI-assisted lumber ordering, built with Claude Code. All data is synthetic; the project is not affiliated with any company.

This is a running narrative. It is meant to be read top to bottom, or used as a talk track (see "Walking someone through it" at the end). New entries are added as features land and as we learn things. `docs/how-this-was-built.md` is the terse technical log; this file is the story.

## The idea in one paragraph

Contractors send orders as messy text messages. The obvious AI problem is reading them. The harder, more valuable problem is deciding **what the sales rep does not need to check**. We built a working prototype that reads a message, matches each line to a product catalog, and flags only the lines a rep should look at. Claude does the one step that needs reading. Jev (TypeSafe's model, which answers typed questions with calibrated confidence) makes the per-line decision. One adjustable threshold controls how much the rep reviews, and we measured the result against a Claude-only version on 20 labeled orders.

## How the pieces fit

```
order text -> Claude parses lines -> Fuse.js shortlists 20 products per line
           -> Jev: which product? (confidence)  -> Jev: is the quantity sane for that product?
           -> route: approve if confident, else flag for the rep
Comparison: Claude alone matches every line against the whole catalog and rates itself high / medium / low.
```

## Timeline

Each entry: what we did, what happened, what it changed.

### 1. Guardrails before code
**Did:** public repo from day one; three read-only review agents (security, evaluation, UX); hooks that run lint and tests whenever Claude finishes a turn and scan every commit for secrets.
**Happened:** two surprises in the first live calls: the configured model ID returned a 404, and the model rejected a forced tool call.
**Changed:** the structured-output step asks for the tool call in the prompt instead of forcing it. Lesson: verify the boring plumbing with a real call before building on it.

### 2. Data, and the answer key nobody should trust yet
**Did:** generated a 201-product synthetic catalog with deliberate look-alikes (lengths, SPF vs pressure-treated, drywall types, the same screw in three box sizes) and 20 text-message orders (88 lines) in five difficulty types, including two "impossible" orders. Drafted an answer key.
**Happened:** we had a second Claude, with no access to the key, label every line independently (the "blind labeler"). It agreed on 78 of 88 lines. Where we disagreed, my key had quietly guessed at the product ("15 of the 2x4" was labeled as 8-foot SPF, but the message never says the length).
**Changed:** lines that cannot be resolved from the text now have no product in the key and are always for review. A key encodes assumptions; the blind labeler is how we found them.

### 3. Making the assumptions explicit: house defaults
**Did:** wrote the rules a counter person assumes (framing lumber is SPF #2 kiln-dried, "stud" means the precut stud, a bare number means pieces, "Type X" means fire-rated) and a "no default, always review" list. Ran a collision check of every phrase against the catalog.
**Happened:** the check found catalog gaps and traps: no precut stud existed, "Type X" also matched a moisture-resistant board, concrete had no metric bags. Mike's calls: Canadian units (30 kg bags, metric rebar and liquids), add the missing products, and always review large quantities (100+ pieces or 50+ of anything else).
**Changed:** the same rules go into both pipelines' prompts so the comparison stays fair, and they are business rules, never answers. A test fails if application code ever reads the answer key.

### 4. First pipeline, and the first honest result
**Did:** built parse, shortlist, Jev decision, routing and the Claude-only comparison; ran all 20 orders for about $1.40.
**Happened:** Claude alone matched 88 of 88 lines and auto-approved 65. Jev matched 84 and auto-approved only 38. Neither approved a wrong line. Jev did not win.
**Changed:** nothing yet, and that mattered. We kept the result and asked why.

### 5. The evaluation found our bugs, and an auditor found our shortcuts
**Did:** wrote the evaluation (accuracy, auto-approve rate, error rate among approved lines, calibration bands, threshold sweeps), then had a separate agent recompute every number from raw files.
**Happened:** the first run exposed two bugs of ours, not Jev's. Words like "not treated" made the fuzzy search return only pressure-treated lumber, so the right product never reached Jev; and Jev only saw product names, not nicknames like "mud". The auditor found no arithmetic errors, but caught that we had re-run only Jev's step, so its timing came from a different run than Claude's.
**Changed:** a size-token second search, nicknames in the option text, and a clean full re-run. Jev's product accuracy went from 95.5% to 98.9%. Lesson: an independent recomputation is worth more than a second look at your own code.

### 6. The review screen, designed against one goal
**Did:** built the screen around "the rep only looks at what's uncertain": approved lines collapse to one quiet row, flagged lines expand, the original message is highlighted in place, and two sliders re-route lines in the browser with no API calls (the raw scores are saved).
**Happened:** a UX-review agent took screenshots on desktop and phone, in light and dark, and drove the keyboard. It found that a line flagged only for an unclear quantity showed a three-option product list, which asked the rep the wrong question; that Enter and x silently overwrote decided lines; and that borders and bar tracks failed contrast.
**Changed:** a one-click "Confirm 3 pails" card for quantity-only flags, a cursor that advances after each decision, undo that returns to the line, quieter approved rows, an "all checked" end state, and stronger control borders.

### 7. "Why does Jev fail on quantity?"
**Did:** looked at which lines the quantity check flagged. It scored 0.95+ when the message used the catalog's own unit ("20 sheets OSB") and low when the unit was missing ("hurricane ties 50") or worded differently ("buckets" vs a "17 L pail").
**Happened:** the cause was our question design: we asked "does the quantity make sense for the product?" in the same call as choosing the product, so Jev did not yet know the product or how it is sold. We tested the fix on the 67 lines the key says need no review: naming the product lifted the lines clearing the cutoff from 43 to 58, and telling it a bare number means the selling unit lifted it to 66. We then checked the gate still catches genuine errors ("100 feet of tape" 0.18, "half a pallet of block" 0.14).
**Changed:** two Jev calls per line, product first, then the quantity check with the product named. Jev's auto-approve share went from about 49% to about 73%, level with Claude-only, still with zero wrong approvals.

### 8. Auditing our own fix
**Did:** re-audited the numbers and prompts after the change.
**Happened:** numbers reproduced and the key never reached a prompt, but the auditor made us disclose that the fix was designed on the same 20 orders (so it is in-sample), that lines with no catalog match skip the second call and flatter Jev's cost, and that our house-rules file contained notes about the test set that should not be in a production prompt. Two clean runs gave 72.7% and 73.9% approved, so single-digit differences are noise.
**Changed:** the caveats are in the evaluation summary, the meta notes are out of the prompt, and the interaction test no longer depends on any one run's scores.

## Where it stands

| | Claude only | Claude + Jev |
| --- | --- | --- |
| Right product | 100% | 97.7% |
| Auto-approved | 73.9% | 73.9% |
| Wrong product among auto-approved | 0% | 0% |
| Matching time per order | about 2.1 s | about 0.4 s |
| Matching cost per order | about $0.055 | about $0.001 |

Read as signals, not benchmarks: 20 orders, tuned in-sample, Claude prices assumed. What the data supports is that Jev's confidence is well calibrated (every line it was at least 70% sure of was right) and the matching step is roughly 50x cheaper and 5x faster, with the same number of lines safely skipping review. It does not show Jev is more accurate.

## What the process taught us

- **Keep the honest result.** Jev lost the first comparison. Asking why, instead of tuning until it won, produced the most useful finding in the project.
- **A second, independent pair of eyes at each layer.** A blind labeler for the answer key, an auditor for the metrics, a critic for the screen. Each found something we would not have.
- **Test the cause before fixing it.** The quantity-check fix was a cheap experiment on 67 lines with a check that it had not simply turned the gate off.
- **Save raw scores, apply thresholds later.** It made the sliders instant and every re-tune free.
- **Disclose what was tuned on what.** In-sample results are fine if labeled.
- **The story maintains itself.** This file is kept current by a commit hook (product-changing commits are blocked until an entry is added) and a scribe agent that drafts entries from what actually happened, so the lessons are captured while they are fresh.
- **Guardrails are part of the product.** Secret scans, a leak test on the answer key, rate limits on the live route.

## Open questions

- A held-out set of messier orders (the current set was used to tune).
- Verify Claude pricing; the cost ratio depends on it.
- How the quantity check behaves on real, noisier unit language.
- Deployment and the spend cap on the live-paste route.

## Walking someone through it (about 5 minutes)

1. **The problem (30s).** Show a messy text order. "Reading it is the easy part."
2. **The screen (90s).** Open the review screen on the default order. Approved lines are quiet; the flagged line says why. Move a slider and watch lines re-route with no API call. Toggle Claude-only.
3. **The measurement (90s).** Open `results/eval-summary.md`. Read one number from each side; point at the calibration table.
4. **The turning points (90s).** Timeline 4 (Jev lost), 5 (our bugs), 7 (the quantity question). "The interesting work was the honest debugging."
5. **The close (30s).** "The hard part isn't reading the order. It's deciding what the rep doesn't need to check."

---

## Entry template (for new entries)

```
### N. Short title
**Did:** what we built or changed.
**Happened:** what we observed, with numbers.
**Changed:** what it altered in the product or the process.
```
