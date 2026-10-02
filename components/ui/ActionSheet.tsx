"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/components/ui/useDialog";
import { useSheetPresence } from "@/components/ui/useSheetPresence";

export function ActionSheet({ children, open = true, onClose, id, label, labelledBy, className = "max-w-md", layer = "normal", modal = true, dismissOnBackdrop = true }: {
  children: ReactNode;
  open?: boolean;
  onClose: () => void;
  id?: string;
  label?: string;
  labelledBy?: string;
  className?: string;
  layer?: "normal" | "settings";
  modal?: boolean;
  dismissOnBackdrop?: boolean;
}) {
  const { present, closing, finish } = useSheetPresence(open);
  const ref = useDialog<HTMLElement>(onClose, present && modal);
  if (typeof document === "undefined" || !present) return null;
  return createPortal(
    <div data-state={closing ? "closing" : "open"} className={`action-sheet-backdrop fixed inset-0 grid place-items-center bg-black/40 p-4 ${layer === "settings" ? "z-[100]" : "z-[60]"}`} role="presentation" onMouseDown={event => {
      if (!closing && dismissOnBackdrop && event.target === event.currentTarget) onClose();
    }}>
      <section id={id} ref={ref} tabIndex={-1} role={modal ? "dialog" : "region"} aria-modal={modal || undefined} aria-label={label} aria-labelledby={labelledBy} onAnimationEnd={event => { if (closing && event.target === event.currentTarget) finish(); }} className={`action-sheet-dialog relative w-full rounded-2xl border border-line bg-panel p-5 shadow-2xl outline-none sm:p-6 ${className}`}>
        <div className="action-sheet-handle" aria-hidden />
        {children}
      </section>
    </div>,
    document.body,
  );
}
