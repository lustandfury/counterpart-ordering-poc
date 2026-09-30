import { useEffect, useRef } from "react";

// Makes a modal dialog behave like one for keyboard and screen-reader users: focus moves in,
// everything else on the page is inert (which also traps Tab), Escape closes it, and focus
// returns to whatever opened it. Attach the returned ref to the element with role="dialog".
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement as HTMLElement | null;
    const others = [...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.contains(root) && !el.inert);
    others.forEach((el) => { el.inert = true; });
    // Keep an autoFocus field's focus; otherwise land on the dialog itself.
    if (!root.contains(document.activeElement)) root.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      others.forEach((el) => { el.inert = false; });
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return ref;
}
