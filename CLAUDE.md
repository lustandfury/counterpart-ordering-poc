# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Background notes live in a local, untracked planning file.

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
3. decide: two Jev calls per line. Call 1 asks:
   - category: choice over about 12 categories
   - sku: choice over the shortlist; each option's description is the product name + unit + nicknames,
     plus a NONE option
   Call 2 (only when a product was chosen) asks unit_ok (noul) with the chosen product and its
   selling unit named: is the quantity a sensible number of that unit? A bare number means the
   selling unit. (Asked before the product is known, it flagged most lines with an unstated unit.)
   Run lines in parallel, at most 5 at a time; retry 429/529 errors with exponential backoff
4. route: auto-approve a line if sku.confidence >= T and unit_ok >= 0.8; otherwise flag it
   for the rep. T defaults to 0.85 and can be changed in the UI
5. comparison: a Claude-only version reads the order and matches lines against the full
   catalog in one call, returning a sku plus confidence (high/medium/low)
Every step records time (ms), tokens and cost (USD). Prices are constants in lib/pricing.ts.

## House defaults
`data/house-defaults.md` holds the business rules a counter person assumes (SPF #2 kiln-dried framing,
precut studs, 1/2" regular drywall, 30 kg bags, and so on), the "no default: always review" list,
and the large-quantity rule (100+ pieces or 50+ of other units). Units are Canadian. Both pipelines
get the same rules via `lib/house-defaults.ts` (Claude prompt and Jev state), so the comparison
stays fair. They are business rules, not answers: never pass `labels.json` or `blind-labels.json`
to either pipeline (a test enforces this in `lib/`, `app/`, `components/`).

## Data (data/)
- catalog.json: about 200 items {sku, name, category, unit, price, aliases[]}.
  Include look-alikes: lengths, PT vs SPF, drywall thicknesses, box sizes
- orders/*.txt: 20 SMS-style orders with typos, missing units, jargon ("2x4x8 PT"),
  and 2 deliberately impossible ones
- labels.json: {orderId: [{raw, sku, qty, unit, shouldReview}]}. I write this
- results/: saved pipeline outputs for the sample orders

## UI
- The visitor is the sales rep. Home is an order queue: one sample order (from results/)
  "arrives" on load, and Generate order simulates a new contractor text and runs it live.
  There is no paste box. Secondary tools (Sample results, Settings, About) sit at the foot
  of the sidebar
- Review screen: the contractor's name and their text as a message bubble, with the AI cost
  saving on the right of that card (leading with "N× lower cost per order", labelled as AI
  cost), then the lines.
  Approved lines collapsed with a check mark; flagged lines expanded with up to 3 product
  options, their confidence and price, and "Leave off order" as a separate action. Picking a
  product sold in a different unit than the contractor wrote opens a quantity editor
  (prefilled only when the product size gives a conversion). Every line shows its price;
  a CAD subtotal and "Send to {contractor} for approval" sit at the foot of the order (the
  contractor approves before it goes to the ERP; simulated). Threshold sliders in Settings
  re-route lines in the browser
- AI cost details: "Compare" in the order card opens a rail (desktop) or a sheet (phones) with
  time and cost for this order and a toggle to compare Jev vs Claude-only
- Product name: Counterpart
- The design should be calm and dense, like a rep's work tool. No marketing page

## Evaluation (scripts/eval.ts)
Run both pipelines over all orders against labels.json. Write results/eval.csv,
results/eval.json (read by the /results dashboard, so the app never reads labels.json) and a
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
- Keep `docs/case-study.md` current. It is the running narrative and talk track for this project. When a feature lands,
  a result changes a decision, or the process improves, add a Did / Happened / Changed entry (use the
  `case-study-scribe` agent or write it directly) in the same change. A commit hook blocks product-changing
  commits without it; use `[skip-case-study]` in the commit command only for trivial changes. The repo is public: no
  real company names, nothing personal, no keys.
- Work one milestone at a time. Propose a plan first, then stop for my review when done
- Commit at the end of each milestone with a clear message
- Commit and push straight to `main`; don't leave work on a side branch
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
