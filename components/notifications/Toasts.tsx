import { XMarkIcon } from "@heroicons/react/24/outline";
import type { Notice } from "@/components/notifications/useNotifications";
import { NoticeIcon } from "@/components/notifications/NoticeIcon";

/**
 * Live updates as toasts, at the top right (full width along the top on phones, clear of the orders button and Send).
 * Announced politely to screen readers (a status region); each closes itself after a few seconds, or with its X.
 */
export function Toasts({ toasts, onDismiss, onOpen }: { toasts: Notice[]; onDismiss: (id: number) => void; onOpen: (orderId: string) => void }) {
  return (
    <div role="status" className="pointer-events-none fixed top-3 z-[80] flex flex-col gap-2 max-lg:inset-x-3 lg:right-5 lg:top-5 lg:w-88">
      {toasts.map((n) => (
        <div key={n.id} className="toast-in pointer-events-auto card flex items-start gap-3 px-4 py-3 shadow-raise">
          <NoticeIcon kind={n.kind} />
          <div className="min-w-0 flex-1">
            <p className="text-small font-semibold text-ink">{n.title}</p>
            {n.detail && <p className="mt-0.5 text-caption text-muted">{n.detail}</p>}
            {n.orderId && (
              <button onClick={() => { onOpen(n.orderId!); onDismiss(n.id); }} className="mt-1.5 text-caption font-medium text-ink underline underline-offset-2">
                Open order
              </button>
            )}
          </div>
          <button onClick={() => onDismiss(n.id)} aria-label="Dismiss notification" className="-m-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-bg hover:text-ink">
            <XMarkIcon aria-hidden className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
