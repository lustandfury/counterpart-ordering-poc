import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | undefined;

/** The business rules in data/house-defaults.md. Shared by both pipelines so the comparison is fair. */
export function houseDefaults(): string {
  cached ??= readFileSync(join(process.cwd(), "data", "house-defaults.md"), "utf8");
  return cached;
}

/** System-prompt block for the Claude parse/match steps. */
export function houseDefaultsPrompt(): string {
  return `Apply these house rules exactly as a lumber-yard counter would. Where a rule says "No default", the line must be flagged for review.\n\n${houseDefaults()}`;
}

/** Adds the rules to the state sent to Jev for one line. */
export function withHouseDefaults<T extends object>(lineState: T): T & { house_rules: string } {
  return { ...lineState, house_rules: houseDefaults() };
}
