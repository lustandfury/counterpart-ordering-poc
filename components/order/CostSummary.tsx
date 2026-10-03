import type { OrderResult } from "@/lib/types";
import type { Mode } from "@/lib/view";
import { usd } from "@/lib/format";
import { savings, speedLine } from "@/lib/order-math";
import type { Compare } from "@/components/order/types";

/**
 * A small card under the order card: what the AI cost to read and match this order vs Claude only, in the cost bars'
 * blue. It arrives last; clicking it opens the comparison (the rail on wide screens, a sheet on phones).
 */
export function CostSummary({ result, mode, compare }: { result: OrderResult; mode: Mode; compare: Compare }) {
  const save = savings(result);
  return (
    <div className="card mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="text-caption font-medium text-muted">AI cost</p>
        {/* which draft is showing, when the rep has switched to the comparison's */}
        {mode === "claude" && <p className="text-caption font-medium text-ink">Showing the Claude-only draft</p>}
      </div>
      <button
        onClick={compare.onToggle}
        aria-expanded={compare.open}
        aria-controls={compare.controls}
        title={`AI cost: ${usd(save.jevUsd)} vs ${usd(save.claudeUsd)} per order with Claude only, from a single run`}
        className="results-cue ml-auto shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-small font-medium tabular-nums hover:underline"
      >
        <span className="figures">{save.cheaper.toFixed(1)}×</span> lower AI cost
        {save.timeSaved != null && <><span className="text-muted"> | </span>{speedLine(save.timeSaved)}</>}
      </button>
    </div>
  );
}
