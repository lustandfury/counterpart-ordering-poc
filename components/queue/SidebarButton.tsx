import { ArrowLeftEndOnRectangleIcon } from "@heroicons/react/24/outline";
import { ICON_BUTTON } from "@/components/ui/iconButton";
import { OrderBadge, OrdersIcon } from "@/components/queue/OrderBadge";

/** Hides or shows the orders sidebar on wide screens (⌘B does the same). */
export function SidebarButton({ label, expanded, unseen = 0, onClick }: { label: string; expanded: boolean; unseen?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls="orders"
      aria-label={unseen ? `${label} (${unseen} new)` : label}
      title={`${label} (⌘B)`}
      className={`${ICON_BUTTON} relative`}
    >
      {expanded ? <ArrowLeftEndOnRectangleIcon aria-hidden className="h-4 w-4" /> : <OrdersIcon />}
      {unseen > 0 && <OrderBadge count={unseen} className="absolute -right-1 -top-1" />}
    </button>
  );
}
