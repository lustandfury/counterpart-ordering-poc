import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ResultsButton, Wordmark } from "@/components/AppNav";
import type { Sender } from "@/lib/types";

export const metadata: Metadata = { title: "Sample results · Counterpart" };

type Side = {
  accuracy: number;
  approvedPct: number;
  wrongProductAmongApproved: number | null;
  shouldHaveReviewedAmongApproved: number | null;
  reviewAgreement: number;
  matchMs: number;
  matchUsd: number;
  totalUsd: number;
};
type OrderSide = { approved: number; correct: number; wrongApproved: number; matchMs: number; matchUsd: number; totalUsd: number };
type Band = { band: string; lines: number; accuracy: number | null };
type Eval = {
  orders: number;
  lines: number;
  model: string;
  thresholds: { productConfidence: number; quantityClarity: number };
  summary: { jev: Side; claude: Side; parseUsd: number };
  bands: { jev: Band[]; claude: Band[] };
  shortlistRecall: number;
  wrong: { orderId: string; raw: string; key: string | null; jev: string | null; jevConfidence: number; jevApproved: boolean; claude: string | null; claudeConfidence: string; claudeApproved: boolean }[];
  byOrder: { orderId: string; lines: number; shouldReview: number; jev: OrderSide; claude: OrderSide }[];
  caveats: string[];
};

const PER = 10_000;
const pct = (n: number | null) => (n == null ? "n/a" : `${n.toFixed(1)}%`);
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`);
const secs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

/** Dashboard for the 20 saved sample orders, built from results/eval.json (written by `npm run eval`). */
export default function ResultsPage() {
  const e = JSON.parse(readFileSync(join(process.cwd(), "results", "eval.json"), "utf8")) as Eval;
  const senders = JSON.parse(readFileSync(join(process.cwd(), "data", "contractors.json"), "utf8")) as Record<string, Sender>;
  const { jev, claude } = e.summary;

  const kpis: { label: string; jev: string; claude: string; note?: string }[] = [
    { label: "Right product", jev: pct(jev.accuracy), claude: pct(claude.accuracy) },
    { label: "Lines auto-approved", jev: pct(jev.approvedPct), claude: pct(claude.approvedPct) },
    { label: "Wrong among auto-approved", jev: pct(jev.wrongProductAmongApproved), claude: pct(claude.wrongProductAmongApproved) },
    { label: "Matching time per order", jev: secs(jev.matchMs), claude: secs(claude.matchMs) },
    { label: "Cost per 10,000 orders", jev: money(jev.totalUsd * PER), claude: money(claude.totalUsd * PER), note: "whole pipeline" },
  ];

  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-2 border-b border-line bg-panel px-5 py-3 sm:px-10">
        <Wordmark />
        <span className="ml-1">
          <ResultsButton active />
        </span>
        <Link href="/" className="ml-auto text-[13px] font-medium text-muted hover:text-ink">
          ← Back to review
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-10">
        <h1 className="text-2xl font-semibold tracking-tight">Sample results</h1>
        <p className="mt-2 max-w-3xl text-muted">
          Both pipelines on {e.orders} synthetic orders ({e.lines} lines), scored against a hand-reviewed answer key. Thresholds at their defaults:
          product confidence <span className="font-mono">{e.thresholds.productConfidence}</span>, quantity clarity{" "}
          <span className="font-mono">{e.thresholds.quantityClarity}</span>.
        </p>

        <section aria-label="Headline numbers" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.label} className="card p-5">
              <h2 className="text-[13px] text-muted">
                {k.label}
                {k.note && <span className="block text-[12px]">{k.note}</span>}
              </h2>
              <dl className="mt-3 grid grid-cols-[1fr_auto] items-baseline gap-y-1.5">
                <dt className="text-[13px]">Claude + Jev</dt>
                <dd className="text-right font-mono text-[17px] font-medium">{k.jev}</dd>
                <dt className="text-[13px] text-muted">Claude only</dt>
                <dd className="text-right font-mono text-[15px] text-muted">{k.claude}</dd>
              </dl>
            </div>
          ))}
        </section>

        <section aria-label="Per order" className="card mt-8 overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 py-4">
            <h2 className="text-[15px] font-semibold">By order</h2>
            <p className="text-[13px] text-muted">Approved = auto-approved lines. Right = product matches the answer key.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[14px]">
              <thead>
                <tr className="border-y border-line bg-panel2 text-left text-[12px] text-muted">
                  <th className="px-6 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 text-right font-medium">Lines</th>
                  <th className="px-3 py-2 text-right font-medium">Key says check</th>
                  <th className="px-3 py-2 text-right font-medium">Jev approved</th>
                  <th className="px-3 py-2 text-right font-medium">Jev right</th>
                  <th className="px-3 py-2 text-right font-medium">Claude approved</th>
                  <th className="px-3 py-2 text-right font-medium">Claude right</th>
                  <th className="px-3 py-2 text-right font-medium">Jev cost</th>
                  <th className="px-3 py-2 text-right font-medium">Claude cost</th>
                  <th className="px-6 py-2" />
                </tr>
              </thead>
              <tbody>
                {e.byOrder.map((o) => (
                  <tr key={o.orderId} className="border-b border-line last:border-b-0 hover:bg-bg">
                    <td className="px-6 py-2.5">
                      <span className="font-medium">{senders[o.orderId]?.company ?? o.orderId}</span>
                      <span className="ml-2 font-mono text-[12px] text-muted">{o.orderId}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{o.lines}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted">{o.shouldReview}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{o.jev.approved}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${o.jev.correct < o.lines ? "text-warn" : ""}`}>{o.jev.correct}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{o.claude.approved}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${o.claude.correct < o.lines ? "text-warn" : ""}`}>{o.claude.correct}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{usd(o.jev.totalUsd)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted">{usd(o.claude.totalUsd)}</td>
                    <td className="px-6 py-2.5 text-right">
                      <Link href={`/?order=${o.orderId}`} className="text-[13px] font-medium underline underline-offset-2">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <section aria-label="Calibration" className="card p-6">
            <h2 className="text-[15px] font-semibold">Is the confidence trustworthy?</h2>
            <p className="mt-1 text-[13px] text-muted">Share of lines with the right product, grouped by each pipeline&apos;s own confidence.</p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {(
                [
                  ["Claude + Jev", e.bands.jev],
                  ["Claude only (self-rated)", e.bands.claude],
                ] as const
              ).map(([title, bands]) => (
                <table key={title} className="w-full text-[13px]">
                  <caption className="mb-2 text-left font-medium">{title}</caption>
                  <thead>
                    <tr className="text-left text-[12px] text-muted">
                      <th className="pb-1 font-medium">Confidence</th>
                      <th className="pb-1 text-right font-medium">Lines</th>
                      <th className="pb-1 text-right font-medium">Right</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bands.map((b) => (
                      <tr key={b.band} className="border-t border-line">
                        <td className="py-1.5 font-mono">{b.band}</td>
                        <td className="py-1.5 text-right font-mono">{b.lines}</td>
                        <td className="py-1.5 text-right font-mono">{pct(b.accuracy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
            <p className="mt-4 text-[13px] text-muted">
              The right product was in Jev&apos;s 20-product shortlist for <span className="font-mono">{pct(e.shortlistRecall)}</span> of lines.
            </p>
          </section>

          <section aria-label="Misses" className="card p-6">
            <h2 className="text-[15px] font-semibold">Lines either pipeline got wrong</h2>
            {e.wrong.length === 0 ? (
              <p className="mt-2 text-[14px] text-muted">None.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3 text-[13px]">
                {e.wrong.map((w) => (
                  <li key={`${w.orderId}-${w.raw}`} className="rounded-xl bg-bg px-4 py-3">
                    <p className="font-mono text-[14px]">{w.raw}</p>
                    <p className="mt-1 text-muted">
                      Answer key: <span className="text-ink">{w.key ?? "not in catalog"}</span> · Jev: {w.jev ?? "not in catalog"} ({Math.round(w.jevConfidence * 100)}%, {w.jevApproved ? "auto-approved" : "flagged"}) · Claude:{" "}
                      {w.claude ?? "not in catalog"} ({w.claudeConfidence}, {w.claudeApproved ? "auto-approved" : "flagged"})
                    </p>
                    <Link href={`/?order=${w.orderId}`} className="mt-1 inline-block text-[12px] font-medium underline underline-offset-2">
                      Open {w.orderId}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-label="Caveats" className="mt-8 max-w-3xl">
          <h2 className="text-[15px] font-semibold">Read these as signals, not benchmarks</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-muted">
            {e.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] text-muted">
            Model: <span className="font-mono">{e.model}</span>. Synthetic data. Full report: results/eval-summary.md in the repository.
          </p>
        </section>
      </main>
    </div>
  );
}
