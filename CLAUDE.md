# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Full context lives in `AI Ordering POC Build Plan.md` (goals, Jev API details, test data spec, evaluation table, demo script). No code exists yet; milestone 1 is the scaffold.

## Counterpart: an outside-in sketch of AI ordering (repo: counterpart-ordering-poc)

## What we're building
A web prototype that turns a contractor's text-message order for lumber and building
materials into a draft order matched to a product catalog, and flags only the lines a
sales rep needs to check. Claude reads the text; TypeSafe's Jev model makes each line's
matching decision with calibrated confidence. A Claude-only comparison version runs
alongside. All data is synthetic. Not affiliated with any company.

## Stack
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Anthropic SDK. Model comes from env ANTHROPIC_MODEL (use the current Sonnet model)
- Jev over REST: POST https://api.typesafe.ai/v1/systemone, model "jev-latest",
  header Authorization: Bearer $TYPESAFE_API_KEY
- Fuse.js for fuzzy product shortlists
- Vitest for tests; Playwright for UI screenshots
- Public GitHub repo, deployed on Vercel. Secrets live only in .env.local (gitignored) and
  in Vercel's environment variables. Provide .env.example

## Pipeline (lib/pipeline)
1. parse: Claude turns the order text into line items [{id, raw, qty, unit}] using
   structured output (tool use with a JSON schema)
2. shortlist: Fuse.js finds the top 20 catalog products per line, searching name + aliases
3. decide: one Jev call per line with three questions:
   - category: choice over about 12 categories
   - sku: choice over the shortlist; each option's description is the product name + unit
   - unit_ok: noul, "Does the quantity and unit make sense for this product?"
   Run lines in parallel, at most 5 at a time; retry 429/529 errors with
   exponential backoff
4. route: auto-approve a line if sku.confidence >= T and unit_ok >= 0.8; otherwise flag it
   for the rep. T defaults to 0.85 and can be changed in the UI
5. comparison: a Claude-only version reads the order and matches lines against the full
   catalog in one call, returning a sku plus confidence (high/medium/low)
Every step records time (ms), tokens and cost (USD). Prices are constants in lib/pricing.ts.

## Data (data/)
- catalog.json: about 200 items {sku, name, category, unit, price, aliases[]}.
  Include look-alikes: lengths, PT vs SPF, drywall thicknesses, box sizes
- orders/*.txt: 20 SMS-style orders with typos, missing units, jargon ("2x4x8 PT"),
  and 2 deliberately impossible ones
- labels.json: {orderId: [{raw, sku, qty, unit, shouldReview}]}. I write this
- results/: saved pipeline outputs for the sample orders

## UI
- Home: pick a sample order (loads instantly from results/) or paste your own (runs live)
- Review screen: order text on the left, lines on the right. Approved lines collapsed
  with a check mark; flagged lines expanded with the top 3 alternatives and their
  confidence, plus a one-click swap. A threshold slider re-routes lines in the browser.
  Footer: time and cost for this order, and a toggle to compare Jev vs Claude-only
- Product name: Counterpart. Banner: "Counterpart · outside-in sketch · synthetic data"
- The design should be calm and dense, like a rep's work tool. No marketing page

## Evaluation (scripts/eval.ts)
Run both pipelines over all orders against labels.json. Write results/eval.csv and a
markdown summary with, for each pipeline: accuracy, % of lines auto-approved,
error rate among auto-approved lines, accuracy by confidence band (>=0.9, 0.7-0.9, <0.7),
how often the correct product is in the top-20 shortlist, and ms and USD per order for the
matching step only (parsing is shared by both, so leave it out of the comparison).

## Agents and quality checks
Set these up in milestone 1. They are part of what this project demonstrates.

Subagents (.claude/agents/), all read-only; they report, they don't edit:
- security-reviewer: before every commit, check the staged changes for API keys, secrets,
  .env files, or anything unsafe in a public repo. Report and block; never auto-fix secrets
- eval-checker: after each eval run, recompute every metric from the raw results files,
  and flag mismatches or answer-key data leaking into prompts
- ux-critic: review the review screen against one goal: "the rep only looks at what's
  uncertain." Check hierarchy, density, how confidence is shown, keyboard flow and
  WCAG AA contrast. Use Playwright screenshots and return ranked issues

Hooks (.claude/settings.json):
- When Claude finishes a turn: run lint + tests; if they fail, keep working until they pass
- Before any git commit: run a secret scan (for example gitleaks) and block on findings

Parallel work:
- Once milestone 3 passes, build milestones 4 and 5 in separate git worktrees, each owning
  its own files (4: scripts/, results/; 5: app/, components/). Merge 4 first
- Before making the repo public: run a review with three agents (security, eval
  correctness, UX), using an agent team if enabled (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1),
  otherwise three subagents. Fix the findings, then deploy

Keep docs/how-this-was-built.md up to date: the setup, which agent did what, what each
check caught, and what I decided myself. It becomes a README section.

## Working agreements
- Work one milestone at a time. Propose a plan first, then stop for my review when done
- Commit at the end of each milestone with a clear message
- Never hardcode keys or commit .env files
- Write tests for the routing logic and for parsing Jev responses
- Keep it simple: no auth, no database, no state beyond files
- If Jev's behaviour is unclear, make a minimal call and show me the raw response
  instead of guessing

## Milestones
1. Scaffold, subagents + hooks, Jev client, and one test call that prints the raw response
2. Data: generate catalog.json and draft 20 orders. I review them and write labels.json
3. Pipeline + comparison version, plus a command-line runner over all orders with logs
4. Evaluation script and summary; eval-checker verifies it (runs in parallel with 5)
5. Review UI with saved samples and live paste; ux-critic reviews it (runs in parallel with 4)
6. Three-agent review before going public, then deploy to Vercel. README with the
   architecture, the results table, how to run it, and "How this was built"
