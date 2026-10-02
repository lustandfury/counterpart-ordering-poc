import { InboxIcon } from "@heroicons/react/24/outline";

/** The count of new orders on the orders button. Keyed by the count, so it pops each time another order arrives. */
export function OrderBadge({ count, className }: { count: number; className: string }) {
  return (
    <span key={count} aria-hidden className={`order-badge grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-tiny font-semibold leading-none text-onbrand shadow-[0_0_0_2px_var(--panel)] ${className}`}>
      {count}
    </span>
  );
}

export const OrdersIcon = () => <InboxIcon aria-hidden className="h-4 w-4" />;
