import type { ReactNode } from "react";
import { ModalCloseButton } from "@/components/ui/ModalCloseButton";

/** The small label above a dialog title ("Free limit reached"). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-caption font-semibold uppercase tracking-wider text-muted">{children}</p>;
}

/** The top of every dialog and sheet: the title (with an optional eyebrow above it) and the close button. */
export function SheetHeader({ id, title, eyebrow, closeLabel, onClose }: { id?: string; title: ReactNode; eyebrow?: ReactNode; closeLabel: string; onClose: () => void }) {
  const heading = <h2 id={id} className={`${eyebrow ? "mt-1 " : ""}text-xl font-semibold tracking-tight`}>{title}</h2>;
  return (
    <div className="flex items-start justify-between gap-4">
      {eyebrow ? <div><Eyebrow>{eyebrow}</Eyebrow>{heading}</div> : heading}
      <ModalCloseButton onClose={onClose} label={closeLabel} />
    </div>
  );
}

/** The foot of a dialog: actions on the right, the primary one last. */
export function SheetFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex justify-end">{children}</div>;
}
