import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSheetPresence } from "@/components/ui/useSheetPresence";

const MOBILE_QUERY = "(max-width: 1023px)";
const subscribeToMobile = (callback: () => void) => {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
/** Read at the moment of an action (a click, a failed run), where a render-time value could be stale. */
export const narrow = () => window.matchMedia(MOBILE_QUERY).matches;

/**
 * Which panels are open around the review. Wide screens: the orders sidebar (open by default, ⌘B toggles it) and the
 * AI cost rail (closed by default: the order is the work, the cost is context). Phones: the orders panel and the cost
 * comparison rise as sheets, and orders that arrive while the queue is out of sight are counted on the orders button.
 */
export function useWorkspaceLayout() {
  const isMobile = useSyncExternalStore(subscribeToMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileOrders = useSheetPresence(mobileOpen);
  const [mobileCostOpen, setMobileCostOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  // Orders that arrived while the queue was out of sight. Shown as a count on the orders button; opening the queue clears it.
  const [unseen, setUnseen] = useState(0);
  const queueVisible = useRef(false);

  const toggleSidebar = useCallback(() => {
    if (narrow()) {
      setMobileCostOpen(false);
      setMobileOpen((v) => !v);
    } else setDesktopOpen((v) => !v);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => { if (media.matches) setMobileCostOpen(false); };
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  // Cmd/Ctrl+B toggles the orders sidebar (as in code editors); Escape closes the phone overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "Escape") {
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  useEffect(() => {
    queueVisible.current = isMobile ? mobileOpen : desktopOpen;
    if (queueVisible.current) setUnseen(0);
  }, [isMobile, mobileOpen, desktopOpen]);
  /** An order landed in the queue: count it if the rep can't see the queue right now. */
  const arrived = useCallback(() => {
    if (!queueVisible.current) setUnseen((n) => n + 1);
  }, []);

  return {
    isMobile, desktopOpen, mobileOpen, setMobileOpen, mobileOrders, mobileCostOpen, setMobileCostOpen, costOpen, setCostOpen,
    unseen, arrived, toggleSidebar,
  };
}
