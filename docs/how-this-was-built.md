# How this was built

Built with Claude Code from a written plan (`AI Ordering POC Build Plan.md`) and a `CLAUDE.md` that acts as the source of truth.

## Milestone 1: setup
- **Scaffold:** Next.js (App Router, TypeScript, Tailwind), Vitest, Playwright, Fuse.js, Anthropic SDK.
- **Subagents** (`.claude/agents/`, all read-only): `security-reviewer`, `eval-checker`, `ux-critic`.
- **Hooks** (`.claude/settings.json`): a Stop hook runs lint, typecheck and tests and sends failures back to Claude; a pre-commit hook runs `gitleaks` on staged changes and blocks on findings.
- **Jev client** (`lib/jev.ts`): typed request and response, retries on 429/529 with exponential backoff, response validation, unit-tested with fixtures.
- **Decided by me:** public repo from day one; API keys only in `.env.local` and Vercel.
