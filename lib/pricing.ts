// Prices in USD per token.
// Claude: published list price for claude-sonnet-5-5 (checked 2026-09-29): $2 / $10 per million input / output
// tokens; cache writes 1.25x input (5-minute TTL), cache reads $0.20 per million. The API returns token counts,
// not dollars; billed dollars are only in the Admin API cost report (organization-wide, daily).
export const CLAUDE_INPUT_PER_TOKEN = 2 / 1_000_000;
export const CLAUDE_OUTPUT_PER_TOKEN = 10 / 1_000_000;
export const CLAUDE_CACHE_WRITE_PER_TOKEN = CLAUDE_INPUT_PER_TOKEN * 1.25;
export const CLAUDE_CACHE_READ_PER_TOKEN = 0.2 / 1_000_000;
// Jev: $42 per billion input tokens, output is free (TypeSafe's published rate; not verified against a bill).
export const JEV_INPUT_PER_TOKEN = 42 / 1_000_000_000;

type ClaudeUsage = { inputTokens: number; outputTokens: number; cacheWriteTokens?: number; cacheReadTokens?: number };

/** Cost of one Claude call from its usage block: each token type at its own rate. */
export const claudeCost = (u: ClaudeUsage) =>
  u.inputTokens * CLAUDE_INPUT_PER_TOKEN +
  u.outputTokens * CLAUDE_OUTPUT_PER_TOKEN +
  (u.cacheWriteTokens ?? 0) * CLAUDE_CACHE_WRITE_PER_TOKEN +
  (u.cacheReadTokens ?? 0) * CLAUDE_CACHE_READ_PER_TOKEN;
export const jevCost = (u: { inputTokens: number }) => u.inputTokens * JEV_INPUT_PER_TOKEN;
