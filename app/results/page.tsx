import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ResultsDisplay } from "@/components/ResultsDisplay";
import type { OrderResult, Sender } from "@/lib/types";
import type { EvalData } from "@/lib/eval/display";

export const metadata: Metadata = { title: "Sample results", alternates: { canonical: "/results" } };

export default function ResultsPage() {
  const data = JSON.parse(readFileSync(join(process.cwd(), "results/eval.json"), "utf8")) as EvalData;
  const senders = JSON.parse(readFileSync(join(process.cwd(), "data/contractors.json"), "utf8")) as Record<string, Sender>;
  const samples = data.costs.map(({ orderId }) => JSON.parse(readFileSync(join(process.cwd(), "results", `${orderId}.json`), "utf8")) as OrderResult);
  return <ResultsDisplay data={data} samples={samples} senders={senders} />;
}
