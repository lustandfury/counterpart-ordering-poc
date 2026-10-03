import { useCallback, useEffect, useRef, useState } from "react";

/** Something that happened to an order: a new one arrived, the rep sent or reopened it, the contractor approved it. */
export type NoticeKind = "arrived" | "sent" | "approved" | "reopened";
export type Notice = { id: number; at: number; kind: NoticeKind; title: string; detail?: string; orderId?: string };

const TOAST_MS = 6000;
const LOG_SIZE = 50;

/**
 * The notification log, newest first, and the toasts on screen. Only things that happen *to* the rep raise a toast
 * (`toast: true`: an order arriving, a contractor approving); their own actions go to the log quietly, since the
 * screen already confirms them where they acted.
 */
export function useNotifications() {
  const [log, setLog] = useState<Notice[]>([]);
  const [toasts, setToasts] = useState<Notice[]>([]);
  // notices the rep has seen: by opening the log, or by opening the order the notice is about
  const [read, setRead] = useState<ReadonlySet<number>>(new Set());
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((n) => n.id !== id));
  }, []);

  // `read`: the rep is already looking at it (an approval for the order they have open), so it never counts as unread
  const notify = useCallback((n: Omit<Notice, "id" | "at"> & { toast?: boolean; read?: boolean }) => {
    const { toast, read: seen, ...rest } = n;
    const item: Notice = { ...rest, id: nextId.current++, at: Date.now() };
    if (seen) setRead((r) => new Set(r).add(item.id));
    setLog((l) => [item, ...l].slice(0, LOG_SIZE));
    if (toast) {
      setToasts((t) => [...t, item].slice(-3));
      timers.current.set(item.id, window.setTimeout(() => dismiss(item.id), TOAST_MS));
    }
  }, [dismiss]);

  return {
    log,
    toasts,
    // only contractor approvals count as unread: the rep isn't watching that queue, while new orders already show in
    // the Open count and sends and reopens are the rep's own actions
    unread: log.filter((n) => n.kind === "approved" && !read.has(n.id)).length,
    notify,
    dismiss,
    markAllRead: () => setRead(new Set(log.map((n) => n.id))),
    /** Opening an order counts as seeing every notice about it. */
    markOrderRead: (orderId: string) => setRead((r) => new Set([...r, ...log.filter((n) => n.orderId === orderId).map((n) => n.id)])),
  };
}
