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
- Claude prices in `lib/pricing.ts` are assumed, not verified.
- First informal look (not the evaluation): at T = 0.85 neither pipeline approved a wrong line, but Claude-only auto-approved far more lines than Jev (65 vs 38 of 88) and matched more products (88 vs 84). Jev does not win on this small, house-rules-assisted set. That is a finding to report honestly, and to test properly in milestone 4.
