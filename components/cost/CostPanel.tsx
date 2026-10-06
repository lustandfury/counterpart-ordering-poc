import Link from "next/link";
import { CLAUDE_INPUT_PER_TOKEN, CLAUDE_OUTPUT_PER_TOKEN, JEV_INPUT_PER_TOKEN } from "@/lib/pricing";
import type { OrderResult } from "@/lib/types";
import { computeView, totals, type Mode, type SlimCatalog } from "@/lib/view";
import { ms, usd } from "@/lib/format";
import { ModalCloseButton } from "@/components/ui/ModalCloseButton";

/** What reading and matching this order cost with Claude + Jev vs Claude only. Picking a side shows its draft. */
type Side = { key: Mode; label: string; matcher: string; t: ReturnType<typeof totals>; approved: number; lines: number };
const PER = 10_000;

export function CostPanel({ result, samples, mode, T, unitMin, catalog, onMode, onClose, onCollapse, onResults }: { result: OrderResult; samples: OrderResult[]; mode: Mode; T: number; unitMin: number; catalog: SlimCatalog; onMode: (m: Mode) => void; onClose?: () => void; onCollapse?: () => void; onResults?: () => void }) {
  const a = computeView(result, "jev", T, catalog, unitMin);
  const b = computeView(result, "claude", T, catalog);
  const n = result.parse.lines.length;
  const sides: Side[] = [
    { key: "jev", label: "Claude + Jev", matcher: "Jev", t: totals(result, "jev"), approved: a.filter((l) => l.approved).length, lines: n },
    { key: "claude", label: "Claude only", matcher: "Claude", t: totals(result, "claude"), approved: b.filter((l) => l.approved).length, lines: n },
  ];
  const maxUsd = Math.max(...sides.map((x) => x.t.usd));
  const diff = a.filter((l, i) => l.sku !== b[i].sku);
  const per10k = (usdPerOrder: number) => `$${(usdPerOrder * PER).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

  return (
    <div className="flex flex-col">
      <div className={`flex shrink-0 justify-between ${onClose ? "items-start gap-4" : "h-16 items-center gap-2 px-4"}`}>
        <h2 className={onClose ? "text-xl font-semibold tracking-tight" : "text-heading font-semibold"}>AI cost</h2>
        {onCollapse && <ModalCloseButton onClose={onCollapse} label="Hide AI cost" />}
        {onClose && <ModalCloseButton onClose={onClose} label="Close AI cost comparison" />}
      </div>
      <div className={`flex flex-col gap-4 ${onClose ? "pt-4" : "p-5"}`}>

        {sides.map((x) => (
          <button
            key={x.key}
            onClick={() => onMode(x.key)}
            aria-pressed={mode === x.key}
            className={`tour-compare card p-4 text-left ${mode === x.key ? "!shadow-[0_0_0_1px_var(--ink)]" : "hover:!shadow-control"}`}
          >
          <div className="flex items-center justify-between gap-2 text-body">
            <span className={`font-semibold ${x.key === "jev" ? "text-branddeep" : "text-ink"}`}>{x.label}</span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="figures text-lg font-medium tracking-tight">{usd(x.t.usd)}</span>
            <span className="figures text-caption text-muted">{ms(x.t.ms)}</span>
          </div>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full" style={{ background: "var(--line)" }} aria-hidden>
            <span style={{ width: `${(100 * x.t.parseUsd) / maxUsd}%`, background: "var(--reading)" }} />
            <span style={{ width: `${(100 * x.t.matchUsd) / maxUsd}%`, background: "var(--matching)" }} />
          </div>
          <dl className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-caption">
            <dt className="flex items-center gap-2 text-muted">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--reading)" }} />
              Reading
            </dt>
            <dd className="text-right figures">{usd(x.t.parseUsd)}</dd>
            <dd className="text-right figures text-muted">{ms(x.t.parseMs)}</dd>
            <dt className="flex items-center gap-2 text-muted">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--matching)" }} />
              Matching
            </dt>
            <dd className="text-right figures">{usd(x.t.matchUsd)}</dd>
            <dd className="text-right figures text-muted">{ms(x.t.matchMs)}</dd>
            <dt className="text-muted">Auto-approved</dt>
            <dd className="col-span-2 text-right figures">{x.approved} / {x.lines}</dd>
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-2.5 text-caption">
            <span className="text-muted">Per 10,000 orders<small className="block text-tiny">this order × 10,000</small></span>
            <span className="figures text-body font-medium">{per10k(x.t.usd)}</span>
          </div>
          </button>
        ))}

        <Link href="/results" onClick={onResults ? event => { event.preventDefault(); onResults(); } : undefined} className="flex min-h-11 items-center px-1 text-small font-medium underline underline-offset-2">
          {/* the results cover the labelled text orders; photo orders aren't scored yet */}
          See results on all {samples.filter((s) => /^o\d+$/.test(s.orderId)).length} sample orders →
        </Link>

        <p className="px-1 text-caption text-muted">
          {diff.length ? `They pick different products on ${diff.length} line${diff.length > 1 ? "s" : ""}: ${diff.map((l) => `“${l.raw}”`).join(", ")}.` : "Both pick the same product on every line."}
        </p>
        <p className="px-1 text-tiny leading-relaxed text-muted">
          Claude at ${(CLAUDE_INPUT_PER_TOKEN * 1e6).toFixed(0)} / ${(CLAUDE_OUTPUT_PER_TOKEN * 1e6).toFixed(0)} per million tokens in / out (list price); Jev at ${(JEV_INPUT_PER_TOKEN * 1e9).toFixed(0)} per billion input tokens. Times are from one run. Synthetic data.
        </p>
      </div>
    </div>
  );
}
