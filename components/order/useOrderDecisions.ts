import { useState } from "react";
import { without } from "@/lib/format";
import type { Decisions } from "@/components/order/types";

/**
 * The rep's work on every order, kept per order id so it survives switching between orders: the product picked for
 * each checked line, quantities set in the product's selling unit ("100 feet" of tape -> 1 roll), and mock sends.
 */
export function useOrderDecisions() {
  const [decisions, setDecisions] = useState<Record<string, Decisions>>({});
  const [quantities, setQuantities] = useState<Record<string, Record<string, number>>>({});
  const [sent, setSent] = useState<Record<string, number>>({}); // order id -> time sent

  return {
    decisions,
    sent,
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
    }),
    send: (id: string) => setSent((s) => ({ ...s, [id]: Date.now() })),
    reopen: (id: string) => setSent((s) => without(s, id)),
  };
}
