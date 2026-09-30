import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ReviewApp } from "@/components/ReviewApp";
import { loadCatalog } from "@/lib/catalog";
import type { OrderResult, Sender } from "@/lib/types";
import type { SlimCatalog } from "@/lib/view";
import type { EvalData } from "@/lib/eval/display";

export default async function Home({ searchParams }: { searchParams: Promise<{ order?: string | string[] }> }) {
  const wanted = (await searchParams).order;
  const dir = join(process.cwd(), "results");
  const samples = readdirSync(dir)
    .filter((f) => /^o\d+\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as OrderResult);
  const senders = JSON.parse(readFileSync(join(process.cwd(), "data", "contractors.json"), "utf8")) as Record<string, Sender>;
  for (const s of samples) s.from = senders[s.orderId];
  const catalog: SlimCatalog = Object.fromEntries(loadCatalog().map((p) => [p.sku, { name: p.name, unit: p.unit, price: p.price }]));
  const initial = typeof wanted === "string" && samples.some((s) => s.orderId === wanted) ? wanted : undefined;
  const evalData = JSON.parse(readFileSync(join(dir, "eval.json"), "utf8")) as EvalData;
  return <ReviewApp samples={samples} catalog={catalog} initialOrder={initial} evalData={evalData} />;
}
