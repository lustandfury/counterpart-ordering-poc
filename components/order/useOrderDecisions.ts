import { useEffect, useRef, useState } from "react";
import { without } from "@/lib/format";
import type { Decisions } from "@/components/order/types";

/** Where an order is in its life: the rep is checking it, it's with the contractor, or the contractor approved it. */
export type OrderStatus = "open" | "sent" | "approved";

// The contractor's reply is simulated: they approve a sent order this long after it's sent.
const APPROVAL_MS = 5000;

/**
 * The rep's work on every order, kept per order id so it survives switching between orders: the product picked for
 * each checked line, quantities set in the product's selling unit ("100 feet" of tape -> 1 roll), and mock sends.
 * A sent order is approved by the (simulated) contractor a few seconds later, and from there it goes to the ERP.
 */
export function useOrderDecisions({ onApproved }: { onApproved?: (id: string) => void } = {}) {
  const [decisions, setDecisions] = useState<Record<string, Decisions>>({});
  const [quantities, setQuantities] = useState<Record<string, Record<string, number>>>({});
  const [sent, setSent] = useState<Record<string, number>>({}); // order id -> time sent
  const [approved, setApproved] = useState<Record<string, number>>({}); // order id -> time the contractor approved
  // pending contractor replies, so reopening an order before they reply cancels theirs
  const replies = useRef<Record<string, number>>({});
  const approvedCallback = useRef(onApproved);
  useEffect(() => { approvedCallback.current = onApproved; });
  useEffect(() => () => Object.values(replies.current).forEach((t) => window.clearTimeout(t)), []);

  const status = (id: string): OrderStatus => (approved[id] ? "approved" : sent[id] ? "sent" : "open");

  return {
    decisions,
    status,
    /** Everything the review of one order needs to read and change its decisions. */
    forOrder: (id: string) => ({
      resolved: decisions[id] ?? {},
      setResolved: (f: (r: Decisions) => Decisions) => setDecisions((d) => ({ ...d, [id]: f(d[id] ?? {}) })),
      quantities: quantities[id] ?? {},
      setQuantity: (lineId: string, qty: number | undefined) => setQuantities((all) => {
        const rest = without(all[id] ?? {}, lineId);
        return { ...all, [id]: qty == null ? rest : { ...rest, [lineId]: qty } };
      }),
      sentAt: sent[id] as number | undefined,
      approvedAt: approved[id] as number | undefined,
    }),
    send: (id: string) => {
      setSent((s) => ({ ...s, [id]: Date.now() }));
      replies.current[id] = window.setTimeout(() => {
        delete replies.current[id];
        setApproved((a) => ({ ...a, [id]: Date.now() }));
        approvedCallback.current?.(id);
      }, APPROVAL_MS);
    },
    /** Back to the rep, while the contractor hasn't replied yet. An approved order has gone to the ERP and stays. */
    reopen: (id: string) => {
      window.clearTimeout(replies.current[id]);
      delete replies.current[id];
      setSent((s) => without(s, id));
    },
  };
}
