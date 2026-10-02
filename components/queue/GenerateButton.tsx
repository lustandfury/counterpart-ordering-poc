import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { SparklesIcon } from "@heroicons/react/24/outline";

/**
 * Generate order, with a tooltip on hover and keyboard focus that says it's a simulated order and what runs.
 * The tooltip is portalled to <body> so the sidebar can't clip it: beside the button on wide screens, below it on phones.
 */
export function GenerateButton({ loading, onGenerate, beside }: { loading: boolean; onGenerate: () => void; beside: boolean }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const show = (e: { currentTarget: HTMLElement }) => setAnchor(e.currentTarget.getBoundingClientRect());
  const hide = () => setAnchor(null);
  const style: CSSProperties | undefined = anchor ? (beside
    ? { left: anchor.right + 12, top: anchor.top + anchor.height / 2, transform: "translateY(-50%)", width: 288 }
    : { left: anchor.left, top: anchor.bottom + 8, width: anchor.width }) : undefined;
  return (
    <>
      <button
        disabled={loading}
        onClick={onGenerate}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={anchor ? "generate-tip" : undefined}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg px-2.5 text-small font-medium text-ink shadow-ring transition-colors hover:bg-brand hover:text-onbrand hover:shadow-none focus-visible:bg-brand focus-visible:text-onbrand disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-ink"
      >
        <SparklesIcon aria-hidden className="h-4 w-4" />
        {loading ? "Arriving…" : "Generate order"}
      </button>
      {anchor && createPortal(
        <span id="generate-tip" role="tooltip" style={style} className="generate-tip pointer-events-none fixed z-[60] rounded-lg bg-ink px-3 py-2 text-caption leading-snug text-bg shadow-raise">
          {beside && <span aria-hidden className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-ink" />}
          Simulates a contractor texting in a new order (synthetic data). It runs live through two pipelines:
          <span className="mt-1.5 block"><span className="font-semibold">Claude + Jev:</span> Claude reads the text, then Jev matches each line to the catalog with a calibrated confidence.</span>
          <span className="mt-1 block"><span className="font-semibold">Claude only:</span> Claude reads and matches the whole order in one call, for comparison.</span>
        </span>,
        document.body,
      )}
    </>
  );
}
