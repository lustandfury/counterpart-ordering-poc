// Runs the pipeline over data/orders and saves results/<orderId>.json. Usage:
//   npm run pipeline            (all orders)
//   npm run pipeline -- o01 o05 (some orders)
import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { runOrder } from "../lib/pipeline";

async function main() {
  mkdirSync("results", { recursive: true });
  const wanted = process.argv.slice(2);
  const ids = readdirSync("data/orders")
    .filter((f) => f.endsWith(".txt"))
    .map((f) => f.replace(".txt", ""))
    .filter((id) => !wanted.length || wanted.includes(id));
  let cost = 0;
  for (const id of ids) {
    const t0 = Date.now();
    try {
      const r = await runOrder(id, readFileSync(`data/orders/${id}.txt`, "utf8"));
      writeFileSync(`results/${id}.json`, JSON.stringify(r, null, 2) + "\n");
      const c = r.parse.costUsd + r.jev.costUsd + r.claudeOnly.costUsd;
      cost += c;
      console.log(`${id}: ${r.parse.lines.length} lines | parse ${r.parse.ms.toFixed(0)}ms | jev ${r.jev.ms.toFixed(0)}ms | claude-only ${r.claudeOnly.ms.toFixed(0)}ms | $${c.toFixed(4)} | ${Date.now() - t0}ms wall`);
    } catch (e) {
      console.error(`${id}: FAILED`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`total $${cost.toFixed(4)} for ${ids.length} orders`);
}
main();
