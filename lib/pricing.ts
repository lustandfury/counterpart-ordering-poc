// Prices in USD. Claude prices are ASSUMED (Sonnet-class list price): verify before quoting cost numbers.
export const CLAUDE_INPUT_PER_TOKEN = 3 / 1_000_000;
export const CLAUDE_OUTPUT_PER_TOKEN = 15 / 1_000_000;
// Jev: $42 per billion input tokens, output is free.
export const JEV_INPUT_PER_TOKEN = 42 / 1_000_000_000;

export const claudeCost = (u: { inputTokens: number; outputTokens: number }) =>
  u.inputTokens * CLAUDE_INPUT_PER_TOKEN + u.outputTokens * CLAUDE_OUTPUT_PER_TOKEN;
export const jevCost = (u: { inputTokens: number }) => u.inputTokens * JEV_INPUT_PER_TOKEN;
