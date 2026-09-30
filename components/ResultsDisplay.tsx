"use client";

import Link from "next/link";
import { BrandBar } from "@/components/AppNav";
import { ModalCloseButton } from "@/components/ModalCloseButton";
import type { Sender } from "@/lib/types";
import { resultsMetrics, type EvalData } from "@/lib/eval/display";
import { useThresholds } from "@/lib/settings";

const pct = (n: number | null) => n == null ? "n/a" : `${Math.round(n)}%`;
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd = (n: number) => `$${n.toFixed(4)}`;

export function ResultsDisplay({ data, senders, onClose, onOpenOrder }: { data: EvalData; senders: Record<string, Sender>; onClose?: () => void; onOpenOrder?: (id: string) => void }) {
  const { T, unitMin, changed, reset } = useThresholds();
  const e = resultsMetrics(data, T, unitMin);
  const { jev, claude } = e;
  const lines = data.rows.length;
  const quality = [
    { label: "Right product", key: "correct" as const, denominator: () => lines },
    { label: "Lines auto-approved", key: "approved" as const, denominator: () => lines },
    { label: "Wrong among auto-approved", key: "wrongApproved" as const, denominator: (side: typeof jev) => side.approved },
  ];
  return (
    <div className={onClose ? "" : "min-h-dvh"}>
      {!onClose && <header className="border-b border-line bg-panel">
        <BrandBar onResults />
      </header>}

      <main className={onClose ? "" : "mx-auto max-w-6xl px-5 py-10 sm:px-10"}>
        <div className="flex items-start justify-between gap-4">
          <h1 id={onClose ? "sample-results-title" : undefined} className={`${onClose ? "text-xl" : "text-2xl"} font-semibold tracking-tight`}>Sample results</h1>
          {onClose && <ModalCloseButton onClose={onClose} label="Close sample results" />}
        </div>
        <p data-testid="results-headline" className="mt-3 max-w-4xl text-xl font-semibold">{e.headline}</p>
        <p className="mt-2 max-w-3xl text-muted">
          Both pipelines on {data.costs.length} synthetic orders ({lines} lines), scored against a hand-reviewed answer key.
          Thresholds: product confidence <span className="font-mono">{T.toFixed(2)}</span>, quantity clarity <span className="font-mono">{unitMin.toFixed(2)}</span> ({changed ? "custom" : "defaults"}).
          {changed && <button onClick={reset} className="ml-2 underline underline-offset-2">Reset to defaults</button>}
        </p>

        <section aria-label="Quality" className="mt-8">
          <h2 className="mb-3 text-[15px] font-semibold">Quality — {jev.correct === claude.correct && jev.approved === claude.approved && jev.wrongApproved === claude.wrongApproved ? "no difference" : "at current thresholds"}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {quality.map((k) => (
              <div key={k.label} className="card p-5">
                <h3 className="flex items-center justify-between gap-2 text-[13px] text-muted">{k.label}
                  {jev[k.key] === claude[k.key] && k.denominator(jev) === k.denominator(claude) && <span className="rounded-full bg-panel2 px-2 py-0.5 text-[11px] text-muted">identical</span>}
                </h3>
                <dl className="mt-3 grid grid-cols-[1fr_auto] items-baseline gap-y-2">
                  {([['Claude + Jev', jev], ['Claude only', claude]] as const).map(([label, side]) => (
                    <div key={label} className="contents">
                      <dt className="text-[13px] text-muted">{label}</dt>
                      <dd className="text-right font-mono text-lg">{side[k.key]} of {k.denominator(side)}
                        <small className="block text-[12px] text-muted">{k.denominator(side) ? pct(100 * side[k.key] / k.denominator(side)) : "n/a"}</small>
                      </dd>
                    </div>
                  ))}
                </dl>
                {k.key === "wrongApproved" && ([['Claude + Jev', jev], ['Claude only', claude]] as const).filter(([label, side]) => side.wrongApproved === 0 && side.approved > 0 && (label === "Claude + Jev" || side.approved !== jev.approved || jev.wrongApproved !== 0)).map(([label, side]) => (
                  <p key={label} className="mt-2 text-[12px] text-muted">{jev.wrongApproved === 0 && claude.wrongApproved === 0 && jev.approved === claude.approved ? "" : `${label}: `}With {side.approved} lines, the true rate could still be up to ~{(300 / side.approved).toFixed(1)}% (rule of three, approximate 95% upper bound).</p>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Cost" className="mt-6 rounded-2xl border border-brand bg-brandsoft p-6">
          <h2 className="text-[15px] font-semibold">Cost · whole pipeline</h2>
          <p className="mt-1 text-2xl font-semibold">{e.costRatio.toFixed(1)}× lower cost per order</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-muted"><th className="font-normal">Pipeline</th><th className="text-right font-normal">Per order (mean)</th><th className="text-right font-normal">Per 10,000 orders</th></tr></thead>
              <tbody>{([['Claude + Jev', e.jevCost], ['Claude only', e.claudeCost]] as const).map(([label, cost]) => (
                <tr key={label}><th className="py-2 font-medium">{label}</th><td className="text-right font-mono text-lg">{usd(cost)}</td><td className="text-right font-mono text-lg">{money(cost * 10000)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-3 text-sm">Excluding the {e.excludedLines} lines with no catalog match: {e.matchedRatio.toFixed(1)}× cheaper.</p>
          <p className="mt-1 text-[12px] text-muted">{e.matchedLines} lines where Jev selected a catalog product. Reading and Claude batch matching costs are allocated equally across each order’s lines; Jev matching uses recorded per-line costs. The per-10,000 figures scale the unrounded mean.</p>
        </section>

        <section aria-label="Per order" className="card mt-8 overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 py-4">
            <h2 className="text-[15px] font-semibold">By order</h2>
            <p className="text-[13px] text-muted">Approved = auto-approved lines. Right = product matches the answer key.</p>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[760px] text-[14px]">
              <thead>
                <tr className="border-y border-line bg-panel2 text-left text-[12px] text-muted">
                  <th className="px-6 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 text-right font-medium">Lines</th>
                  <th className="px-3 py-2 text-right font-medium">Needs review (answer key)</th>
                  <th className="px-3 py-2 text-right font-medium">Jev approved</th>
                  <th className="px-3 py-2 text-right font-medium">Jev right</th>
                  <th className="px-3 py-2 text-right font-medium">Claude approved</th>
                  <th className="px-3 py-2 text-right font-medium">Claude right</th>
                  <th className="px-3 py-2 text-right font-medium">Jev unneeded reviews</th>
                  <th className="px-3 py-2 text-right font-medium">Claude unneeded reviews</th>
                  <th className="px-3 py-2 text-right font-medium">Jev cost</th>
                  <th className="px-3 py-2 text-right font-medium">Claude cost</th>
                  <th className="px-6 py-2"><span className="sr-only">Open order</span></th>
                </tr>
              </thead>
              <tbody>
                {e.byOrder.map((o) => (
                  <tr key={o.orderId} className={`border-b border-line last:border-b-0 hover:bg-bg ${!o.decisionsSame ? "bg-brandsoft" : ""}`}>
                    <td className="px-6 py-2.5">
                      <span className="font-medium">{senders[o.orderId]?.company ?? o.orderId}</span>
                      <span className="ml-2 font-mono text-[12px] text-muted">{o.orderId}</span>{!o.decisionsSame && <span className="ml-2 rounded bg-brandsoft px-2 text-[11px]">Decisions differ</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{o.lines}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted">{o.shouldReview}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{o.jev.approved}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${o.jev.correct < o.lines ? "text-warn" : ""}`}>{o.jev.correct}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{o.claude.approved}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${o.claude.correct < o.lines ? "text-warn" : ""}`}>{o.claude.correct}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{o.jev.unneeded}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{o.claude.unneeded}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{usd(o.jevUsd)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted">{usd(o.claudeUsd)}</td>
                    <td className="px-6 py-2.5 text-right">
                      {onOpenOrder ? <button onClick={() => onOpenOrder(o.orderId)} className="text-[13px] font-medium underline underline-offset-2">Open</button> : <Link href={`/?order=${o.orderId}`} className="text-[13px] font-medium underline underline-offset-2">
                        Open
                      </Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line bg-panel2 font-mono">
                <tr><th className="px-6 py-3 text-left">Totals / mean cost</th>
                  {[lines, e.byOrder.reduce((s, o) => s + o.shouldReview, 0), jev.approved, jev.correct, claude.approved, claude.correct, jev.unneeded, claude.unneeded, usd(e.jevCost), usd(e.claudeCost)].map((value, i) => <td key={i} className="px-3 py-3 text-right">{value}</td>)}<td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="px-6 py-3 text-[13px] text-muted">Unneeded reviews: {jev.unneeded} of {lines} lines flagged unnecessarily by Claude + Jev; {claude.unneeded} of {lines} by Claude only.</p>
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
                      Answer key: <span className="text-ink">{w.gold.sku ?? "not in catalog"}</span> · Jev: {w.jev.sku ?? "not in catalog"} ({Math.round(w.jev.confidence * 100)}%, {w.jevApproved ? "auto-approved" : "flagged"}) · Claude:{" "}
                      {w.claude.sku ?? "not in catalog"} ({w.claude.confidence}, {w.claudeApproved ? "auto-approved" : "flagged"})
                    </p>
                    {onOpenOrder ? <button onClick={() => onOpenOrder(w.orderId)} className="mt-1 inline-block text-[12px] font-medium underline underline-offset-2">Open {w.orderId}</button> : <Link href={`/?order=${w.orderId}`} className="mt-1 inline-block text-[12px] font-medium underline underline-offset-2">
                      Open {w.orderId}
                    </Link>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-label="How to read this" className="mt-8 max-w-3xl">
          <h2 className="text-[15px] font-semibold">How to read this</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-muted">
            {data.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
            <li>Excluding the {e.excludedLines} no-match lines that skipped Jev’s second call, the allocated whole-pipeline cost saving is {e.matchedRatio.toFixed(1)}×.</li>
          </ul>
          <p className="mt-4 text-[12px] text-muted">
            {data.costs.length} orders, {lines} lines · synthetic data · answer key reviewed by hand: {data.provenance.reviewer} · thresholds: product {T.toFixed(2)}, quantity {unitMin.toFixed(2)}; Claude: high ratings · models: {data.models.join(", ")}, {data.provenance.jevModel} · pricing: lib/pricing.ts, list prices · date run: {data.provenance.runDate}.
            Full report: results/eval-summary.md in the repository.
          </p>
        </section>
      </main>
    </div>
  );
}
