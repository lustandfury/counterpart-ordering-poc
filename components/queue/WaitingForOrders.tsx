import { InboxIcon } from "@heroicons/react/24/outline";
import { OrderBadge } from "@/components/queue/OrderBadge";

/** What the rep sees before the first order lands: an empty queue, and a text on its way. */
export function WaitingForOrders({ arrived, phone }: { arrived: boolean; phone: boolean }) {
  if (arrived) {
    return (
      <div className="waiting-orders mx-auto flex max-w-sm flex-col items-center pt-[14vh] text-center">
        <div className="relative grid h-14 w-14 place-items-center rounded-full bg-panel text-ink shadow-ring">
          <InboxIcon aria-hidden className="h-6 w-6" />
          <OrderBadge count={1} className="absolute -right-1 -top-1" />
        </div>
        <h1 className="mt-5 text-lg font-semibold tracking-tight">A new order is in your queue</h1>
        <p className="mt-1.5 text-body leading-relaxed text-muted">
          {phone ? "Tap the orders button to open it." : "Open it from the queue on the left."}
        </p>
      </div>
    );
  }
  return (
    <div className="waiting-orders mx-auto flex max-w-sm flex-col items-center pt-[14vh] text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-panel text-muted shadow-ring">
        <InboxIcon aria-hidden className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-lg font-semibold tracking-tight">Waiting for orders</h1>
      <p className="mt-1.5 text-body leading-relaxed text-muted">
        Contractors text their orders in. Each one lands in your queue already matched to the catalog, so you only check what&apos;s uncertain.
      </p>
      <div role="status" className="mt-6 flex items-center gap-2 text-small text-muted">
        <span aria-hidden className="flex h-8 items-center gap-1 rounded-[18px] rounded-tl-[4px] bg-panel px-3 shadow-ring">
          <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
        </span>
        A contractor is texting…
      </div>
    </div>
  );
}
