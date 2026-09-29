import Anthropic from "@anthropic-ai/sdk";
import { claudeCost } from "../pricing";
import type { Timed } from "../types";

let client: Anthropic | undefined;
export const anthropic = () => (client ??= new Anthropic());
export const claudeModel = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

/** Gets a single structured tool call (this model rejects forced tool_choice, so the prompt asks for it) and returns its JSON input, with timing, tokens and cost. */
export async function callTool<T>(args: {
  system: string;
  user: string;
  toolName: string;
  schema: Anthropic.Tool["input_schema"];
  maxTokens?: number;
}): Promise<{ input: T } & Timed> {
  const t0 = performance.now();
  const res = await anthropic().messages.create({
    model: claudeModel(),
    max_tokens: args.maxTokens ?? 4000,
    system: `${args.system}\n\nRespond only by calling the ${args.toolName} tool.`,
    messages: [{ role: "user", content: args.user }],
    tools: [{ name: args.toolName, description: "Submit the result.", input_schema: args.schema }],
    tool_choice: { type: "auto" },
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Claude did not return a tool call");
  const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  return { input: block.input as T, ms: performance.now() - t0, usage, costUsd: claudeCost(usage) };
}
