import { ArrowLeftEndOnRectangleIcon } from "@heroicons/react/24/outline";
import { OrderBadge, OrdersIcon } from "@/components/queue/OrderBadge";

/** Hides or shows the orders sidebar on wide screens (⌘B does the same). A bare icon: no outline, a square hover. */
export function SidebarButton({ label, expanded, unseen = 0, onClick }: { label: string; expanded: boolean; unseen?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls="orders"
      aria-label={unseen ? `${label} (${unseen} new)` : label}
      title={`${label} (⌘B)`}
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink lg:h-8 lg:w-8"
    >
      {expanded ? <ArrowLeftEndOnRectangleIcon aria-hidden className="h-4 w-4" /> : <OrdersIcon />}
      {unseen > 0 && <OrderBadge count={unseen} className="absolute -right-1 -top-1" />}
    </button>
  );
}
