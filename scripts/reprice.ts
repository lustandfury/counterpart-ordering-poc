// Recomputes the saved Claude costs in results/o*.json from their recorded token counts at the prices in
// lib/pricing.ts. No API calls. Usage: npm run reprice (then npm run eval)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { claudeCost } from "../lib/pricing";
import type { OrderResult } from "../lib/types";

let before = 0;
let after = 0;
for (const f of readdirSync("results").filter((f) => /^o\d+\.json$/.test(f))) {
  const r = JSON.parse(readFileSync(`results/${f}`, "utf8")) as OrderResult;
  before += r.parse.costUsd + r.claudeOnly.costUsd;
  r.parse.costUsd = claudeCost(r.parse.usage);
  r.claudeOnly.costUsd = claudeCost(r.claudeOnly.usage);
  after += r.parse.costUsd + r.claudeOnly.costUsd;
  writeFileSync(`results/${f}`, JSON.stringify(r, null, 2) + "\n");
}
console.log(`Claude cost across saved results: $${before.toFixed(4)} -> $${after.toFixed(4)}`);
