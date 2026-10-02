import { useEffect, useRef } from "react";

// Makes a modal dialog behave like one for keyboard and screen-reader users: focus moves in,
// everything else on the page is inert (which also traps Tab), Escape closes it, and focus
// returns to whatever opened it. Attach the returned ref to the element with role="dialog".
export function useDialog<T extends HTMLElement>(onClose: () => void, enabled = true) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;
    const opener = document.activeElement as HTMLElement | null;
    const others = [...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.contains(root) && !el.inert);
    others.forEach((el) => { el.inert = true; });
    // Keep an autoFocus field's focus; otherwise land on the dialog itself.
    if (!root.contains(document.activeElement)) root.focus();
    const onKey = (e: KeyboardEvent) => {
      if (root.closest("[inert]")) return;
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); }
      else if (e.key === "Tab" && root.contains(document.activeElement)) {
        const controls = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter(el => el.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
          e.preventDefault();
          (last ?? root).focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === root)) {
          e.preventDefault();
          (first ?? root).focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      others.forEach((el) => { el.inert = false; });
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [enabled]);

  return ref;
}
