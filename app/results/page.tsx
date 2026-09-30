import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ResultsDisplay } from "@/components/ResultsDisplay";
import type { Sender } from "@/lib/types";
import type { EvalData } from "@/lib/eval/display";

export const metadata: Metadata = { title: "Sample results", alternates: { canonical: "/results" } };

export default function ResultsPage() {
  const data = JSON.parse(readFileSync(join(process.cwd(), "results/eval.json"), "utf8")) as EvalData;
  const senders = JSON.parse(readFileSync(join(process.cwd(), "data/contractors.json"), "utf8")) as Record<string, Sender>;
  return <ResultsDisplay data={data} senders={senders} />;
}
