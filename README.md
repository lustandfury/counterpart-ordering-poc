# Counterpart

**An outside-in sketch of AI-assisted lumber ordering.** Paste a contractor's text-message order and get a draft order matched to a product catalog, with only the lines a sales rep needs to check flagged.

**Live demo:** https://counterpart-ordering-poc.vercel.app

> All data is synthetic. This is a prototype, not affiliated with any company.

The idea it tests: reading a messy order is the easy part. The hard part is deciding **what the rep does not need to check**, and doing that cheaply, quickly and measurably.

## How it works

```
order text ─▶ Claude parses it into lines            (shared by both pipelines)
           ─▶ Fuse.js shortlists 20 products per line
           ─▶ Jev: which product?              → a choice with calibrated confidence
           ─▶ Jev: is the quantity sensible for that product?  → yes/no probability
           ─▶ route: auto-approve if both clear their thresholds, else flag for the rep

Comparison pipeline: Claude alone matches every line against the whole catalog
and rates itself high / medium / low; only "high" lines auto-approve.
```

- **Claude** does the one step that needs reading. **Jev** (TypeSafe's model, which answers typed questions such as "pick one" or "yes/no" with calibrated probabilities) makes the per-line decisions.
- The same **house rules** (`data/house-defaults.md`) go to both pipelines, so the comparison is fair: what a counter person assumes without calling (framing lumber is SPF #2 kiln-dried, "stud" means a precut stud, a bare number means pieces) and what always needs review (a missing length, a missing box size, large quantities).
- Raw scores are saved, and thresholds are applied afterwards. That makes the sliders in the UI instant and free to re-tune.
- Units are Canadian: 30 kg bags, metric rebar, litres.

## The screen

A three-pane workspace:
- **Left, open by default (⌘B or the sidebar icon to hide):** sample orders, each with the number of lines to check, and a composer to paste your own, or press **Generate** for a random sample order that always contains at least one line to check.
- **Center:** one card per order: who sent it, then each line as the contractor wrote it next to the product it matched. Approved lines are quiet; flagged lines say why and offer the top alternatives. When only the quantity is in doubt, a flagged line is a one-click confirm.
- **Right:** a cost assessment of both pipelines for the current order and across all samples. Clicking a pipeline's card shows its draft, and **Settings** there holds the thresholds.

The two thresholds (product confidence and quantity clarity), under Settings in the cost panel, re-route lines live; Settings also has Light / Dark / System (light by default).

A second page, **Sample results** (`/results`), is a dashboard for the 20 saved orders: headline comparisons, a by-order table linking back to each order, calibration, the misses and the caveats. Each line to check carries a short hint saying what to do. Keyboard shortcuts also work: `j`/`k` move, `1`–`3` pick, `Enter` accepts, `x` marks a line as not in the catalog.

## Results

20 synthetic orders (88 lines) scored against a hand-reviewed answer key. The full report is in [`results/eval-summary.md`](results/eval-summary.md), with one row per line in [`results/eval.csv`](results/eval.csv).

**Same accuracy and the same review decisions on all 88 lines, at 4.5× lower cost per order.** These are the default thresholds (product 0.85, quantity 0.80); the dashboard follows the review sliders without new API calls.

| | Claude only | Claude + Jev |
| --- | --- | --- |
| Right product | 87 of 88 (99%) | 87 of 88 (99%) |
| Lines auto-approved | 66 of 88 (75%) | 66 of 88 (75%) |
| Wrong product among auto-approved | 0 of 66 | 0 of 66 |
| Unneeded reviews | 1 of 88 | 1 of 88 |
| Whole pipeline, mean cost per order | $0.0456 | $0.0101 |
| Whole pipeline, cost per 10,000 orders | $456.38 | $101.40 |

Excluding the 15 lines where Jev selected no catalog product, the saving is **4.4×** across 73 matched lines. Jev matching uses per-line recorded costs; shared reading and Claude batch matching are allocated equally across each order's lines. The per-10,000 figures scale the unrounded mean.

Read these as signals, not benchmarks: 20 synthetic orders, tuned in-sample, with no held-out set. Mike Costanzo reviewed the answer key on September 29, 2026. Costs use token counts at list prices in `lib/pricing.ts`. With zero wrong approvals among 66 lines, the approximate 95% upper bound is still ~4.5%. Re-scoring the saved results is deterministic; it does not measure variation across fresh API runs. The original API run date and resolved Jev model version were not recorded.

## Run it locally

Requires Node 22 or later.

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev                  # http://localhost:3000
```

`.env.local` needs `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (for example `claude-sonnet-5-5`), `TYPESAFE_API_KEY`, and `POSTGRES_URL` for the live-order usage limit and email signups. Set `NEXT_PUBLIC_SITE_URL` to the public URL when deploying so canonical and social metadata point to the right host. The saved sample orders work without keys; only live paste and the pipeline scripts call the APIs.

## Analytics

PostHog is optional. Set `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` to the project's public token in `.env.local` and your hosting environment. Set `NEXT_PUBLIC_POSTHOG_HOST` to the ingestion host for your project (`https://us.i.posthog.com` or `https://eu.i.posthog.com`). Rebuild/redeploy after changing these values because Next.js embeds public environment variables at build time. Leave the token empty to disable analytics, including for local development.

Page views include initial loads and client-side navigation. Custom events cover workspace unlock, order selection, live-run start/completion/failure, the signup gate and completion, comparison mode changes, line review decisions, and mock order sends. Event properties contain workflow counts and categories; order text, sender details, emails, and access codes are not included. Autocapture, session replay, and surveys are disabled. Visitors use anonymous browser IDs; signup does not identify them by email.

To verify a configured deployment, open PostHog's live events view, visit Review and Sample results, and review a line. Look for `$pageview` and `order_line_reviewed`; sending a completed order emits `order_sent` with `demo: true`.

| Command | What it does |
| --- | --- |
| `npm run check` | Lint, typecheck and unit tests |
| `npm run pipeline` | Run both pipelines over `data/orders/` and save to `results/` (about $1.40 for all 20; `-- o01 o05` runs a subset, `-- --jev-only` re-runs only the Jev step) |
| `npm run eval` | Score the saved results against `data/labels.json`; writes the report, the per-line CSV and `results/eval.json` for the dashboard |
| `npm run jev:test` | One raw Jev call, to see the response shape |
| `npm run gen:catalog` | Regenerate `data/catalog.json` |
| `npm run export:review` | Build `data/review-sheet.csv` for reviewing labels |

With a production build running (`npm run build && PORT=3100 npm start`), `npx tsx scripts/e2e-smoke.ts` tests the keyboard flow and sliders in a real browser, and `npx tsx scripts/screenshots.ts` saves screenshots to `shots/`.

**Live paste is capped:**
- 600 characters and 15 items per order
- 5 free orders per visitor, then an email signup is required
- 5 runs per IP address per hour and 40 a day

The five-order signup limit is stored in Postgres and counts attempted runs, including failed AI calls. The hourly and daily counters are per server instance. The spend limit on the API key is the hard stop, and setting `LIVE_RUNS=off` switches live paste off.

## Live runs: limits and safeguards

Pasting your own order calls paid APIs, so live runs are limited: 5 free orders per visitor (an email unlocks more), 5 per hour per network and 40 per day overall. The per-network and daily limits are kept in Postgres, so they hold across servers and cannot be reset by clearing cookies; the visitor cookie is only an identity. Set spend limits with your Anthropic and TypeSafe accounts as the hard stop, and `LIVE_RUNS=off` switches live runs off. The opening screen's access code is a welcome screen checked in the browser, not access control. Emails are stored only to unlock more runs; set `NEXT_PUBLIC_PRIVACY_CONTACT` to show a deletion contact on the sign-up form.

## Repo layout

| Path | What's there |
| --- | --- |
| `lib/pipeline/` | parse, shortlist, decide (Jev), route, the Claude-only comparison |
| `lib/eval/` | Evaluation metrics (unit-tested) |
| `lib/view.ts` | Turns saved scores into approved or flagged lines at any threshold |
| `app/`, `components/` | The Next.js app and the review screen |
| `data/` | Synthetic catalog (203 products), 20 orders with fictional senders, answer key, house rules |
| `results/` | Saved pipeline outputs and the evaluation |
| `docs/` | The case study and the technical build log |

## How this was built

Built with Claude Code, one milestone at a time, with independent checks at every layer:

- **Guardrails from day one.**
  - Hooks run lint and tests at the end of every turn, and scan every commit for secrets.
  - A test fails if application code ever reads the answer key.
  - A hook blocks product-changing commits unless the case study is updated.
- **Read-only review agents** (`.claude/agents/`):
  - A *blind labeler*, a second Claude with no access to the answer key, relabeled every line. That exposed places where the key was quietly guessing.
  - An *eval-checker* recomputed every metric from the raw files. It caught a timing comparison taken from two different runs, and made us disclose in-sample tuning.
  - A *ux-critic* drove the screen in a real browser. It found flags that asked the rep the wrong question, and contrast failures.
  - A *security-reviewer* checked the repo before launch. It caught a cost gap in the live route.
- **Keeping the honest result.** In the first comparison, Jev auto-approved only half as many lines as Claude. Asking why exposed two bugs in our own shortlist, and a question design flaw: we asked Jev whether a quantity made sense before it knew the product. Fixing that, and disclosing that the fix was tuned on this set, was the most useful work in the project.

The full story, with numbers at each turn, is in [`docs/case-study.md`](docs/case-study.md). The terse technical log is [`docs/how-this-was-built.md`](docs/how-this-was-built.md).
