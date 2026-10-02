import { useCallback, useEffect, useState } from "react";

// Keep the sheet mounted until its exit animation finishes.
export function useSheetPresence(open: boolean) {
  const [present, setPresent] = useState(open);
  const [previousOpen, setPreviousOpen] = useState(open);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) setPresent(true);
  }
  const closing = !open && present;
  const finish = useCallback(() => setPresent(false), []);
  useEffect(() => {
    if (!closing) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(finish, reduced ? 0 : 320);
    return () => window.clearTimeout(timer);
  }, [closing, finish]);
  return { present: present || open, closing, finish };
}
