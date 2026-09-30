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

The two thresholds (product confidence and quantity clarity) re-route lines live.

A second page, **Sample results** (`/results`), is a dashboard for the 20 saved orders: headline comparisons, a by-order table linking back to each order, calibration, the misses and the caveats. Each line to check carries a short hint saying what to do. Keyboard shortcuts also work: `j`/`k` move, `1`–`3` pick, `Enter` accepts, `x` marks a line as not in the catalog.

## Results

20 synthetic orders (88 lines) scored against a hand-reviewed answer key. The full report is in [`results/eval-summary.md`](results/eval-summary.md), with one row per line in [`results/eval.csv`](results/eval.csv).

| | Claude only | Claude + Jev |
| --- | --- | --- |
| Lines matched to the right product | 100% | 97.7% |
| Lines auto-approved | 73.9% | 73.9% |
| Wrong product among auto-approved lines | 0% | 0% |
| Matching step, time per order | 2.1 s | 0.4 s |
| Matching step, cost per order | $0.036 | $0.001 |
| Whole pipeline, cost per 10,000 orders | $455.09 | $101.62 |

**What this supports:** on this set, Jev cleared the same share of lines for auto-approval as Claude alone, with no wrong approvals, and its matching step was roughly 35x cheaper and 5x faster. Its confidence was trustworthy: every line it rated at 0.7 or above was right.

**What it doesn't:** it doesn't show that Jev is more accurate. Read these as signals, not benchmarks:
- The set is small: 20 orders. There were only two wrong product picks in total, both Jev's, and both were flagged for the rep rather than approved.
- Parts of the pipeline, including Jev's quantity check, were designed after seeing these same orders. The results are in-sample, and no held-out set has been run.
- Costs are computed from each call's recorded token counts at published list prices (`lib/pricing.ts`); the API reports tokens, not dollars.
- The set deliberately includes many products that aren't in the catalog. Those skip Jev's second call, which flatters its cost.
- Results vary slightly between runs.

## Run it locally

Requires Node 22 or later.

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev                  # http://localhost:3000
```

`.env.local` needs `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (for example `claude-sonnet-5-5`) and `TYPESAFE_API_KEY`. The saved sample orders work without keys; only live paste and the pipeline scripts call the APIs.

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
- 5 runs per visitor per hour and 40 a day

The counters are per server instance. The spend limit on the API key is the hard stop, and setting `LIVE_RUNS=off` switches live paste off.

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
