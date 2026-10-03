import { ActionSheet } from "@/components/ui/ActionSheet";
import { SheetHeader } from "@/components/ui/Sheet";
import type { Notice } from "@/components/notifications/useNotifications";
import { NoticeIcon } from "@/components/notifications/NoticeIcon";

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** The notification log: every recent update, newest first. An update about an order opens it. */
export function NotificationsDialog({ open, log, onClose, onOpen }: { open: boolean; log: Notice[]; onClose: () => void; onOpen: (orderId: string) => void }) {
  return (
    <ActionSheet open={open} id="notifications" onClose={onClose} labelledBy="notifications-title">
      <SheetHeader id="notifications-title" title="Notifications" closeLabel="Close notifications" onClose={onClose} />
      {log.length === 0 ? (
        <p className="mt-6 pb-2 text-small text-muted">New orders, sends and contractor approvals will be listed here.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {log.map((n) => {
            const body = (
              <>
                <NoticeIcon kind={n.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-medium text-ink">{n.title}</span>
                  {n.detail && <span className="block text-caption text-muted">{n.detail}</span>}
                </span>
                <span className="figures shrink-0 text-caption text-muted">{clock(n.at)}</span>
              </>
            );
            return (
              <li key={n.id}>
                {n.orderId ? (
                  <button onClick={() => { onOpen(n.orderId!); onClose(); }} className="flex w-full items-start gap-3 px-1 py-3 text-left hover:bg-bg">{body}</button>
                ) : (
                  <div className="flex items-start gap-3 px-1 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ActionSheet>
  );
}
