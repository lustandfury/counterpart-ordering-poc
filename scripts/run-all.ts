// Runs the pipeline over data/orders and saves results/<orderId>.json. Usage:
//   npm run pipeline            (all orders)
//   npm run pipeline -- o01 p01 (some orders)
// Text orders are data/orders/<id>.txt. Photo orders are data/orders/<id>.json pointing at an image: the photo is
// transcribed first, and the transcription is the order text for both pipelines.
import { config } from "dotenv";
config({ path: ".env.local" });
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { runOrder } from "../lib/pipeline";
import { decideLine } from "../lib/pipeline/decide";
import { mapLimit } from "../lib/pipeline/limit";
import { transcribePhoto } from "../lib/pipeline/transcribe";
import { jevCost } from "../lib/pricing";
import type { OrderResult } from "../lib/types";

async function main() {
  mkdirSync("results", { recursive: true });
  const jevOnly = process.argv.includes("--jev-only"); // re-run only the Jev step from saved parses (cheap)
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const photos = new Map(
    readdirSync("data/orders")
      .filter((f) => /^p\d+\.json$/.test(f))
      .map((f) => [f.replace(".json", ""), JSON.parse(readFileSync(`data/orders/${f}`, "utf8")) as { image: string }] as const),
  );
  const ids = [...readdirSync("data/orders").filter((f) => f.endsWith(".txt")).map((f) => f.replace(".txt", "")), ...photos.keys()]
    .filter((id) => !wanted.length || wanted.includes(id));
  let cost = 0;
  for (const id of ids) {
    const t0 = Date.now();
    try {
      if (jevOnly) {
        const saved = JSON.parse(readFileSync(`results/${id}.json`, "utf8")) as OrderResult;
        const t0j = performance.now();
        const lines = await mapLimit(saved.parse.lines, 5, (l) => decideLine(l, saved.text));
        const usage = lines.reduce((u, l) => ({ inputTokens: u.inputTokens + l.usage.inputTokens, outputTokens: u.outputTokens + l.usage.outputTokens }), { inputTokens: 0, outputTokens: 0 });
        saved.jev = { lines, ms: performance.now() - t0j, usage, costUsd: jevCost(usage) };
        writeFileSync(`results/${id}.json`, JSON.stringify(saved, null, 2) + "\n");
        cost += saved.jev.costUsd;
        console.log(`${id}: jev only ${saved.jev.ms.toFixed(0)}ms`);
        continue;
      }
      const photo = photos.get(id);
      if (photo && !existsSync(photo.image)) {
        console.log(`${id}: skipped, no image at ${photo.image}`);
        continue;
      }
      const transcribed = photo ? await transcribePhoto(readFileSync(photo.image)) : undefined;
      const r = await runOrder(id, transcribed?.text ?? readFileSync(`data/orders/${id}.txt`, "utf8"));
      if (photo && transcribed) r.photo = { src: "/" + photo.image.replace(/^public\//, ""), ms: transcribed.ms, usage: transcribed.usage, costUsd: transcribed.costUsd };
      writeFileSync(`results/${id}.json`, JSON.stringify(r, null, 2) + "\n");
      const c = (r.photo?.costUsd ?? 0) + r.parse.costUsd + r.jev.costUsd + r.claudeOnly.costUsd;
      cost += c;
      console.log(`${id}: ${r.parse.lines.length} lines | parse ${r.parse.ms.toFixed(0)}ms | jev ${r.jev.ms.toFixed(0)}ms | claude-only ${r.claudeOnly.ms.toFixed(0)}ms | $${c.toFixed(4)} | ${Date.now() - t0}ms wall`);
    } catch (e) {
      console.error(`${id}: FAILED`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`total $${cost.toFixed(4)} for ${ids.length} orders`);
}
main();
