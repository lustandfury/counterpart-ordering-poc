import { OrderIllustration } from "@/components/queue/OrderIllustration";
import { OrderBadge } from "@/components/queue/OrderBadge";

/** What the rep sees before the first order lands: an empty queue, and a text on its way. */
/** `count` is the Received queue's count, the same number the phone's orders button shows. */
export function WaitingForOrders({ arrived, count, phone }: { arrived: boolean; count: number; phone: boolean }) {
  if (arrived) {
    return (
      <div className="waiting-orders mx-auto flex max-w-sm flex-col items-center pt-[14vh] text-center">
        <div className="relative">
          <OrderIllustration state="arrived" className="h-24 w-24" />
          {count > 0 && <OrderBadge count={count} className="absolute right-0 top-0" />}
        </div>
        <h1 className="mt-5 text-lg font-semibold tracking-tight">{count > 1 ? `${count} new orders are in your queue` : "A new order is in your queue"}</h1>
        <p className="mt-1.5 text-body leading-relaxed text-muted">
          {phone ? `Tap the orders button to open ${count > 1 ? "one" : "it"}.` : `Open ${count > 1 ? "one" : "it"} from the queue on the left.`}
        </p>
      </div>
    );
  }
  return (
    <div className="waiting-orders mx-auto flex max-w-sm flex-col items-center pt-[14vh] text-center">
      <OrderIllustration state="waiting" className="h-24 w-24" />
      <h1 className="mt-5 text-lg font-semibold tracking-tight">Waiting for orders</h1>
      <p className="mt-1.5 text-body leading-relaxed text-muted">
        Contractors text their orders in. Each one lands in your queue already matched to the catalog, so you only check what&apos;s uncertain.
      </p>
      <div role="status" className="mt-6 flex items-center gap-2 text-small text-muted">
        A contractor is texting…
      </div>
    </div>
  );
}
