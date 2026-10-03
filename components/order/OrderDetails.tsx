import { useState } from "react";
import type { OrderResult } from "@/lib/types";
import { orderNumber, segmentText, type Mode } from "@/lib/view";
import { usd } from "@/lib/format";
import { savings, speedLine } from "@/lib/order-math";
import type { Compare } from "@/components/order/types";
import { TextButton } from "@/components/ui/Button";
import { CheckDot } from "@/components/order/CheckDot";
import { DeliveryDetails } from "@/components/order/DeliveryDetails";
import { OrderProgress } from "@/components/order/OrderProgress";

/**
 * The head of the order: who texted, the line counts, their message, and the AI cost saving (which opens the comparison).
 * On phones the message folds away behind "Show text", so the first line to check is on the first screen.
 */
export function OrderDetails({ result, mode, compare, phone, toCheck: unchecked, sentAt, approvedAt }: { result: OrderResult; mode: Mode; compare: Compare; phone: boolean; toCheck: string[]; sentAt?: number; approvedAt?: number }) {
  const [textShown, setTextShown] = useState(false);
  const who = result.from?.name ?? "the contractor";
  const save = savings(result);
  return (
    <div className="@container mb-6 rounded-xl border border-line @min-[52rem]/review:mb-0 bg-panel px-4 py-4 shadow-ring sm:px-5" aria-live="polite">
      <div className="flex flex-col gap-3 @min-[560px]:flex-row @min-[560px]:items-start @min-[560px]:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg text-caption font-semibold text-ink" aria-hidden>
          {result.from ? result.from.name.split(" ").map((w) => w[0]).join("").slice(0, 2) : "C"}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-lg font-semibold leading-tight tracking-tight">
            {result.from?.name ?? "New order"}
            {result.from && <span className="font-normal text-muted"> · {result.from.company}</span>}
          </h1>
          <p className="mt-0.5 text-small text-muted">Texted an order · <span className="figures text-ink">{orderNumber(result.orderId)}</span></p>
        </div>
      </div>
      </div>
      <OrderProgress sentAt={sentAt} approvedAt={approvedAt} />
      {(!phone || textShown) && (
        <figure className="mt-4 ml-12">
          <figcaption className="sr-only">Text message from {who}</figcaption>
          <blockquote id="incoming-message" className="w-fit max-w-prose whitespace-pre-wrap break-words rounded-[18px] rounded-tl-none bg-bg px-4 py-3 text-body leading-relaxed text-ink">
            {/* indented under the name, as in a messages app; the phrases behind lines still to check get the same dot as their line */}
            {segmentText(result.text.trim(), result.parse.lines).map((seg, i) => seg.lineId && unchecked.includes(seg.lineId)
              ? <span key={i}><CheckDot />{seg.text}<span className="sr-only"> (to check)</span></span>
              : <span key={i}>{seg.text}</span>)}
          </blockquote>
        </figure>
      )}
      {/* captured from the text, so it shows even while the text itself is folded away on phones */}
      <DeliveryDetails delivery={result.parse.delivery} from={result.from} />
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
        {phone && (
          <TextButton onClick={() => setTextShown((v) => !v)} aria-expanded={textShown} aria-controls="incoming-message">
            {textShown ? "Hide text" : "Show text"}
          </TextButton>
        )}
        {/* which draft is showing; the send status lives in the pricing card beside Send */}
        <p className="text-left text-caption font-medium leading-4 text-ink">
          {mode === "claude" && "Showing the Claude-only draft"}
        </p>
        {/* What the AI cost to read and match this order, vs Claude only, in the cost bars' blue. It arrives last; clicking it opens the details. */}
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
    </div>
  );
}
