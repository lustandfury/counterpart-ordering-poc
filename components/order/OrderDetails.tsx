import type { OrderResult } from "@/lib/types";
import { orderNumber, type Mode } from "@/lib/view";
import { usd } from "@/lib/format";
import { savings, speedLine } from "@/lib/order-math";
import type { Compare } from "@/components/order/types";

/** The head of the order: who texted, the line counts, their message, and the AI cost saving (which opens the comparison). */
export function OrderDetails({ result, mode, lines, flagged, done, compare }: { result: OrderResult; mode: Mode; lines: number; flagged: number; done: number; compare: Compare }) {
  const who = result.from?.name ?? "the contractor";
  const save = savings(result);
  const toCheck = Math.max(0, flagged - done);
  const stats = [
    { label: "Lines", value: lines, className: "text-ink" },
    { label: "Auto-approved", value: lines - flagged, className: "text-ok" },
    { label: "To check", value: toCheck, className: "text-warn" },
  ];
  return (
    <div className="@container mb-6 rounded-xl border xl:mb-0 border-line bg-panel px-4 py-4 shadow-ring sm:px-5" aria-live="polite">
      <div className="flex flex-col gap-3 @min-[560px]:flex-row @min-[560px]:items-start @min-[560px]:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg text-caption font-semibold text-ink" aria-hidden>
          {result.from ? result.from.name.split(" ").map((w) => w[0]).join("").slice(0, 2) : "C"}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-semibold leading-tight tracking-tight">
            {result.from?.name ?? "New order"}
            {result.from && <span className="font-normal text-muted"> · {result.from.company}</span>}
          </h1>
          <p className="mt-0.5 text-small text-muted">Texted an order · <span className="font-mono">{orderNumber(result.orderId)}</span></p>
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-3 divide-x divide-line whitespace-nowrap rounded-lg bg-bg py-2 @min-[560px]:ml-auto @min-[560px]:flex @min-[560px]:px-1 @min-[560px]:py-1">
        {stats.map((stat) => <span key={stat.label} className={`flex min-w-0 flex-col items-center gap-0.5 px-1 text-stat font-semibold @min-[560px]:block @min-[560px]:px-3 @min-[560px]:text-small @min-[560px]:font-medium ${stat.className}`}>{stat.value} <span className="text-tiny font-normal text-muted @min-[560px]:text-small">{stat.label}</span></span>)}
      </div>
      </div>
      <figure className="mt-4 @min-[560px]:ml-12">
        <figcaption className="sr-only">Text message from {who}</figcaption>
        <blockquote id="incoming-message" className="w-fit max-w-prose whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-bg px-4 py-3 text-body leading-relaxed text-ink">
          {result.text.trim()}
        </blockquote>
      </figure>
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3 @min-[560px]:flex-row @min-[560px]:items-center">
        {/* which draft is showing; the send status lives in the pricing card beside Send */}
        <p className="text-left text-caption font-medium leading-4 text-ink">
          {mode === "claude" && "Showing the Claude-only draft"}
        </p>
        {/* What the AI cost to read and match this order, vs Claude only. One line; clicking it opens the details. */}
        <button
          onClick={compare.onToggle}
          aria-expanded={compare.open}
          aria-controls={compare.controls}
          title={`AI cost: ${usd(save.jevUsd)} vs ${usd(save.claudeUsd)} per order with Claude only, from a single run`}
          className={`shrink-0 self-start whitespace-nowrap rounded-lg px-3 py-1.5 text-small font-medium tabular-nums text-ink hover:bg-bg @min-[560px]:ml-auto @min-[560px]:self-center ${compare.open ? "bg-bg shadow-ring" : "bg-bg/60"}`}
        >
          <span className="text-muted">Results · </span>{save.cheaper.toFixed(1)}× lower cost
          {save.timeSaved != null && <><span className="text-muted"> | </span>{speedLine(save.timeSaved)}</>}
        </button>
      </div>
    </div>
  );
}
