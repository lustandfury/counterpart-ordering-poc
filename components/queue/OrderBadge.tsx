import { InboxIcon } from "@heroicons/react/24/outline";

/**
 * The count of new orders on the orders button. Keyed by the count, so it pops each time another order arrives.
 * `onBrand` inverts it to graphite for the yellow floating button, where a yellow badge would vanish.
 */
export function OrderBadge({ count, className, onBrand = false }: { count: number; className: string; onBrand?: boolean }) {
  const tone = onBrand ? "bg-ink text-panel shadow-[0_0_0_2px_var(--brand)]" : "bg-brand text-onbrand shadow-[0_0_0_2px_var(--panel)]";
  return (
    <span key={count} aria-hidden className={`order-badge grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-tiny font-semibold leading-none ${tone} ${className}`}>
      {count}
    </span>
  );
}

export const OrdersIcon = () => <InboxIcon aria-hidden className="h-4 w-4" />;
