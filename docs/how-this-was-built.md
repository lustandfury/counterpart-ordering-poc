# How this was built

Built with Claude Code from a written plan (`AI Ordering POC Build Plan.md`) and a `CLAUDE.md` that acts as the source of truth.

## Milestone 1: setup
- **Scaffold:** Next.js (App Router, TypeScript, Tailwind), Vitest, Playwright, Fuse.js, Anthropic SDK.
- **Subagents** (`.claude/agents/`, all read-only): `security-reviewer`, `eval-checker`, `ux-critic`.
- **Hooks** (`.claude/settings.json`): a Stop hook runs lint, typecheck and tests and sends failures back to Claude; a pre-commit hook runs `gitleaks` on staged changes and blocks on findings.
- **Jev client** (`lib/jev.ts`): typed request and response, retries on 429/529 with exponential backoff, response validation, unit-tested with fixtures.
- **Decided by me:** public repo from day one; API keys only in `.env.local` and Vercel.

## Milestone 2: data
- `scripts/gen-catalog.ts` generates `data/catalog.json` (201 synthetic products, 12 categories) with deliberate look-alikes: lengths, SPF vs pressure-treated, drywall thicknesses and types, the same screw in 1/5/25 lb boxes.
- 20 SMS-style orders in `data/orders/` (4 clean, 6 jargon, 4 odd units, 4 chatty, 2 impossible), 88 lines in total.
- `data/labels.draft.json` was drafted by Claude alongside the orders. **Decided by me:** reviewing every line and promoting it to `data/labels.json`, which is what the evaluation scores against.

## House defaults
The first blind-labeler pass disagreed with my labels wherever a line depended on an unstated assumption (species, length, thread type). Rather than bury those guesses in the answer key, the assumptions became explicit rules in `data/house-defaults.md`, checked against the catalog for collisions, and given identically to both pipelines. Lines with no rule are labeled `sku: null` and always go to review. **Decided by me:** the Canadian units, the large-quantity rule, and the five judgment calls on the final review list. The blind labeler (`data/blind-labels.json`) is a second opinion for label review only and is never used in the pipelines.

## Milestone 3: pipeline
- `lib/pipeline/`: `parse` (Claude structured output, shared), `shortlist` (Fuse.js, top 20), `decide` (one Jev call per line, 5 at a time), `route` (threshold T, `unit_ok` >= 0.8, large-quantity rule), `claude-only` (comparison), `index` (runs both side by side). `npm run pipeline` saves raw scores per order to `results/`, so thresholds are applied afterwards and can be re-tuned without new API calls.
- Two things the plan did not anticipate: the configured model ID (`claude-3-5-sonnet-20260920`) returned a 404, so it is now `claude-sonnet-5-5`; and this model rejects forced `tool_choice`, so the prompt asks for the tool call instead. I also added a `NONE` option to Jev's `sku` question so lines with no catalog match have somewhere to go.
- Claude prices in `lib/pricing.ts` were first assumed ($3 / $15); later corrected to the published $2 / $10 for the model in use (see the pricing correction below).
- First informal look (not the evaluation): at T = 0.85 neither pipeline approved a wrong line, but Claude-only auto-approved far more lines than Jev (65 vs 38 of 88) and matched more products (88 vs 84). Jev does not win on this small, house-rules-assisted set. That is a finding to report honestly, and to test properly in milestone 4.

## Milestone 4: evaluation
- `npm run eval` scores the saved results against the answer key and writes `results/eval.csv` (one row per line) and `results/eval-summary.md` (the results table, calibration bands, shortlist recall, a threshold sweep and a `unit_ok` cutoff sweep). The metric logic lives in `lib/eval/metrics.ts` and is unit-tested; only `scripts/` and that module read the answer key.
- **What the first run caught:** two real bugs in my pipeline, not in Jev. Words like "not treated" made the fuzzy shortlist return only pressure-treated lumber, so the right product never reached Jev; and Jev only saw product names, not nicknames ("mud"). Fixed with a size-token second search and by adding nicknames to the option text. This means the pipeline was tuned after a first look at the same 20 orders, so accuracy is optimistic.
- **What the eval-checker caught:** it recomputed every metric independently and found no numeric mismatches and no answer-key leakage. It did catch that I had re-run only Jev's step, so its timing came from a different run than Claude-only's. I redid one clean full run and added the caveats to the summary.
- **Finding:** Jev's product choice is well calibrated (every line at confidence >= 0.7 was right) and it is much cheaper and faster, but on this set Claude-only was as accurate and auto-approved more lines. Jev's gap comes from the `unit_ok` gate, which flags lines where the unit is not stated. Neither pipeline approved a wrong line, so the sample cannot separate them on error rate.

## Milestone 5: review screen
- `app/page.tsx` loads the saved results (instant); `app/api/run/route.ts` runs a live pasted order (capped at 1,500 characters, 10 per visitor per hour, 200 a day, and switchable off with `LIVE_RUNS=off`, because every run makes paid API calls). `lib/view.ts` is the pure logic that turns saved raw scores into approved or flagged lines at any threshold, so the sliders re-route in the browser with no API calls; `components/ReviewApp.tsx` is the screen.
- I made two design calls from the evaluation: a second slider for the quantity/unit check, because that check, not product confidence, decided most flags; and a one-click "Confirm 3 buckets" card when only the quantity is unclear.
- **What the ux-critic caught** (it took screenshots at desktop and phone, light and dark, and tested the keyboard): flags that gave the rep the wrong question (a 3-option product list when the product was already 96% sure); the cursor not advancing after a decision, and Enter/x silently overwriting resolved lines; keys dead after touching a slider; 0% options taking two thirds of each card; reviewed lines looking identical to auto-approved ones; control borders and the bar track below 3:1 contrast; no end state. All fixed except: the fixed cost/time footer, and moving the sliders into a settings disclosure on phones.
- `scripts/e2e-smoke.ts` (needs a running build) checks the keyboard flow, the sliders, the mode toggle and reset-on-order-change.
- I used plain Tailwind rather than shadcn/ui: the screen needs about six components, and not adding a component library kept it small.

## Fixing the quantity check (after milestone 5)
- I noticed Jev flagged many fine lines on the quantity/unit check and asked why. Cause: `unit_ok` was asked in the same call as the product choice, so the product and its selling unit were not yet known, and unstated or differently worded units ("hurricane ties 50", "6 buckets of mud" against a 17 L pail) were marked down. I tested the fix on the lines the key says need no review (naming the product lifted 43 of 67 clearing the cutoff to 58; rewording lifted it to 66) and checked it still scores low on genuinely wrong units ("100 feet of tape" 0.18, "half a pallet of block" 0.14).
- `decide.ts` now makes two Jev calls per line: product first, then `unit_ok` with the product named. Lines that chose NONE skip the second call.
- Result: Jev's auto-approve share went from about 49% to about 73%, level with Claude-only, with no wrong approvals. The eval-checker re-audited it: numbers reproduce, no leakage. It also flagged that the fix was designed on the same 20 orders (now in the caveats) and that `house-defaults.md` contained notes about the test set, which I removed from the prompt text. Because the prompt changed, I re-ran everything once more; two clean runs gave 72.7% and 73.9%.
- Demo order changed from o06 to o13, since o06 no longer has flagged lines.

## Workspace layout
- The screen is now a three-pane workspace: collapsible orders sidebar with a composer for live runs (hidden by default, ⌘B), the conversation-style review in the center, and a cost assessment panel on the right comparing both pipelines for the current order and on average across the samples. The old fixed footer and comparison drawer are folded into that panel.
- Routing no longer lists the quantity check or large-quantity rule as reasons on lines with no product match (neither applies without a product). Approvals and the evaluation output are unchanged.

## Visual refresh
- Lighter theme with more whitespace: paper background, white "card" surfaces (faint outline + soft shadow), DM Sans 15px / 1.6, taller rows. Tokens in `app/globals.css`; contrast re-checked (all text at least 5.7:1, control outlines 3.7:1).
- Auto-scroll now follows the cursor only after the rep moves it, so the order summary is visible on load.

## Deployment (milestone 6)
- Vercel project linked and connected to the GitHub repo; keys stored as sensitive environment variables for preview and production. A protected preview was deployed and tested (page, a live run, the length cap) before production.
- **What the security-reviewer caught:** no secrets in the tree or history, but a real company name in an agent file, lines hinting at private context, and that one pasted line could parse into many paid items. Fixed: item cap (15) after parsing and before any paid call, JSON-only requests, 600 characters / 15 lines, 5 runs per visitor per hour, 40 per day per instance.

## Pricing correction
- The API reports tokens, not dollars (billed dollars are only in the Admin API cost report, organization-wide and daily), so costs are token counts at list price. The list price had been assumed at $3 / $15 per million tokens; the model in use is $2 / $10. `npm run reprice` recomputed all saved results from their recorded token counts with no new API calls. Costs now also count cache-write and cache-read tokens.

## The three-agent review (milestone 6, repeated before promoting the link)
The plan calls for a security, evaluation-correctness and usability review before the repo goes public. The app grew (live runs, sign-up, a lock screen, a tour) after the first pass, so it was run again with three read-only subagents, each briefed on what was new. What each caught, and what was decided:
- **security-reviewer:** no committed secrets (full-history scan) and a clean dependency audit. Real findings: the free-run allowance and the hourly/daily limits could be reset (cookie cleared; limits held in each server's memory), which put a ceiling of roughly $250 a day on a determined visitor; sign-up had no rate limit or length cap; there were no security headers. Two suggestions were wrong: client-IP spoofing (Vercel overwrites that header) and an untracked `.env.example` (it is tracked). The reviewer's first fix, signing the cookie, would not have worked, since clearing the cookie just gives a new one; a second opinion redirected the fix to durable database limits. **Fixed:** per-network and daily limits in Postgres with an atomic statement (checked against the real database, including simultaneous requests), a cookie check, a rate-limited and length-capped sign-up, security headers with the Content Security Policy in report-only mode first.
- **eval-checker:** recomputed every published number from the raw results: no mismatches, no answer-key leaks, prices current. Low findings, all handled: the "5x faster" claim now says it is wall-clock (about 1.5x summed), the catalog count was corrected, and the leak-guard test now also covers data and prompt sources and fails if a scanned folder is missing. The label field name in one prompt heading was left alone on purpose: changing prompt text would make the saved results stale and would need paid re-runs for no gain.
- **ux-critic:** the screen meets its goal (the rep looks only at what is uncertain). Fixed: one confidence number per decision, the reason names the live threshold, a suggested-option cue, a stronger keyboard outline and active-line marker, 44 px phone targets, and the sidebar count following the rep's decisions. Two findings were not real (the tour already remembers completion and closes on Esc).
- **Decided by Mike:** keep the shortcut legend hidden and mark the suggested option instead; keep sign-ups unlimited per person (the daily limit bounds the cost); the access code stays as a welcome screen and is documented as one. **Left open:** a spend limit at each API provider (only the owner can set it), the deletion contact for sign-up emails, and switching the Content Security Policy from report-only to enforcing once production has been watched.
- **A separate lesson from the analytics setup:** a check that reports "nothing found" needs a known positive alongside it. A first scan of the live site said analytics was absent, and it was wrong because of a shell quirk; the fix was to look for known text in the same files.
- **Re-run after rewording a prompt heading:** the heading that reused the answer key's field name was reworded (`shouldReview: true` became "always review"), all 20 orders were run again (about $0.93), and the evaluation was regenerated and checked again by the eval-checker: every metric recomputed exactly, prices matched the recorded tokens, and the prompt file differed only in that heading. The published numbers moved: see the case study, entry 33.

