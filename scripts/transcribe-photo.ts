// Prints the raw transcription of a photo order, to check what Claude reads before it is used. Usage:
//   npx tsx scripts/transcribe-photo.ts p01 [p02 ...]
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { transcribePhoto } from "../lib/pipeline/transcribe";

async function main() {
  for (const id of process.argv.slice(2)) {
    const r = await transcribePhoto(readFileSync(`data/orders/${id}.jpg`));
    console.log(`== ${id} | ${r.ms.toFixed(0)}ms | $${r.costUsd.toFixed(4)}\n${r.text}\n`);
  }
}
main();
