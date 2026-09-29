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
