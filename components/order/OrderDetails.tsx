import { useState } from "react";
import type { OrderResult } from "@/lib/types";
import { orderNumber, segmentText } from "@/lib/view";
import { TextButton } from "@/components/ui/Button";
import { CheckDot } from "@/components/order/CheckDot";
import { DeliveryDetails } from "@/components/order/DeliveryDetails";
import { OrderProgress } from "@/components/order/OrderProgress";

/**
 * The head of the order: who texted, their message, the delivery details and where the order is (the AI cost sits in
 * its own card below, see CostSummary).
 * On phones the message folds away behind "Show text", so the first line to check is on the first screen.
 */
export function OrderDetails({ result, phone, toCheck: unchecked, receivedAt, sentAt, approvedAt }: { result: OrderResult; phone: boolean; toCheck: string[]; receivedAt?: number; sentAt?: number; approvedAt?: number }) {
  const [textShown, setTextShown] = useState(false);
  const who = result.from?.name ?? "the contractor";
  return (
    <div className="@container rounded-xl border border-line bg-panel px-4 py-4 shadow-ring sm:px-5" aria-live="polite">
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
        {/* where the order is: Received, Sent, Approved, across the foot of the card */}
        <div className="mb-1 basis-full">
          <OrderProgress receivedAt={receivedAt} sentAt={sentAt} approvedAt={approvedAt} />
        </div>
        {phone && (
          <TextButton onClick={() => setTextShown((v) => !v)} aria-expanded={textShown} aria-controls="incoming-message">
            {textShown ? "Hide text" : "Show text"}
          </TextButton>
        )}
      </div>
    </div>
  );
}
