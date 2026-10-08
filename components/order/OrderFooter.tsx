import { useState } from "react";
import type { OrderResult } from "@/lib/types";
import { money } from "@/lib/format";
import { SALES_TAX, withTax } from "@/lib/order-math";
import { Button } from "@/components/ui/Button";

/** The foot of the order: the subtotal, then Send. It comes after the lines, so the rep reaches it once they're checked. */
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function OrderFooter({ result, subtotal, toCheck, sentAt, approvedAt, onSend, onReopen }: { result: OrderResult; subtotal: { sum: number; unpriced: number }; toCheck: number; sentAt?: number; approvedAt?: number; onSend: () => void; onReopen: () => void }) {
  const [sendAttempted, setSendAttempted] = useState(false);
  const first = result.from?.name.split(" ")[0] ?? "contractor";
  const ready = !sentAt && toCheck === 0;
  const extra = [toCheck > 0 && `+ ${toCheck} to check`, subtotal.unpriced > 0 && `+ ${subtotal.unpriced} not priced`].filter(Boolean).join(" · ");
  const { tax, total } = withTax(subtotal.sum);
  return (
    <div className="border-t-2 border-line px-4 py-4 sm:px-6">
      <h2 className="sr-only">Order total</h2>
      <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-body tabular-nums">
        <dt className="text-muted">{toCheck > 0 ? "Subtotal so far" : "Subtotal"}</dt>
        <dd className="pl-4 text-right">{money(subtotal.sum)}</dd>
        <dt className="text-muted">{SALES_TAX.label} ({Math.round(SALES_TAX.rate * 100)}%)</dt>
        <dd className="pl-4 text-right">{money(tax)}</dd>
        <dt className="mt-1 border-t border-line pt-2 font-semibold">Total <span className="font-normal text-muted">CAD</span></dt>
        <dd className="mt-1 border-t border-line pl-4 pt-2 text-right text-heading font-semibold">{money(total)}</dd>
      </dl>
      {extra && <p className="mt-1.5 text-right text-caption text-muted">Not included yet: {extra.replaceAll("+ ", "")}</p>}
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-end">
        {/* the send status lives here, beside Send: what's left before sending, then the confirmation once sent */}
        <p id="send-order-note" role="status" className={`text-caption leading-4 sm:mr-auto ${sentAt ? "font-medium text-ok" : toCheck > 0 ? "text-warn" : "text-muted"}`}>
          {approvedAt
            ? `Approved by ${result.from?.name ?? "the contractor"} at ${clock(approvedAt)}. Sent to the ERP.`
            : sentAt
            ? `Sent to ${result.from?.name ?? "the contractor"} for approval at ${clock(sentAt)}. Waiting for their approval.`
            : toCheck > 0 ? `${toCheck} ${toCheck === 1 ? "line" : "lines"} still to check before sending.` : `${first} approves it before it goes to the ERP.`}
        </p>
        {/* aria-disabled, not disabled: Send stays clickable before it's ready, to say what's left. Once approved, the order has left */}
        {!approvedAt && <Button
          id="send-order"
          size="md"
          variant={sentAt ? "secondary" : ready ? "primary" : "waiting"}
          onClick={() => {
            if (sentAt) onReopen();
            else if (ready) onSend();
            else setSendAttempted(true);
          }}
          aria-disabled={!sentAt && !ready}
          aria-describedby={sendAttempted && !ready && !sentAt ? "send-order-note send-order-guidance" : "send-order-note"}
          className="w-full shrink-0 whitespace-nowrap sm:w-auto"
        >
          {sentAt ? "Reopen" : "Create quote"}
        </Button>}
      </div>
      {sendAttempted && !ready && !sentAt && (
        <p id="send-order-guidance" role="status" className="mt-3 text-small text-warn">
          Confirm a product and quantity for each remaining item first. <a href="#needs-review" className="font-medium underline underline-offset-2">Go to Needs review</a>
        </p>
      )}
    </div>
  );
}
