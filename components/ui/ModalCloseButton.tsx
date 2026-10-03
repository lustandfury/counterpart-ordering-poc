import { XMarkIcon } from "@heroicons/react/24/outline";

/** Shared dismiss control for dialogs and sheets: a bare X with a 44px target and a square hover, like the sidebar toggle. */
export function ModalCloseButton({ onClose, label, className = "" }: { onClose: () => void; label: string; className?: string }) {
  return (
    <button type="button" onClick={onClose} aria-label={label} className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-control ${className}`}>
      <XMarkIcon aria-hidden className="h-5 w-5" />
    </button>
  );
}
