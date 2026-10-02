import Link from "next/link";
import { ICON_BUTTON, ICON_BUTTON_GROUPED } from "@/components/iconButton";
import { ChartBarIcon } from "@heroicons/react/24/outline";

/** The Counterpart wordmark: a small mark (a checked line on a counter slip) and the name. Links home. */
export function Wordmark({ large = false }: { large?: boolean }) {
  const name = "counterpart";
  return (
    <Link href="/" aria-label="Counterpart demo, review" className={`flex items-center rounded-lg ${large ? "gap-[clamp(0.5rem,3vw,1rem)]" : "gap-2"}`}>
      <svg aria-hidden viewBox="0 0 24 24" className={`${large ? "h-[clamp(2.5rem,13vw,3.5rem)] w-[clamp(2.5rem,13vw,3.5rem)]" : "h-7 w-7"} shrink-0`}>
        <circle cx="12" cy="12" r="12" fill="var(--brand)" />
        <path d="M6.5 8.5h7M6.5 12h5M6.5 15.5h4" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" opacity="0.45" />
        <path d="M14 14.8l1.9 1.9 3.6-4.2" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span aria-hidden="true" className={`${large ? "text-[clamp(24px,8vw,34px)]" : "text-[17px]"} wordmark-name whitespace-nowrap font-bold tracking-[-0.03em] text-ink`}>
        {Array.from(name, (letter, index) => (
          <span
            key={`${letter}-${index}`}
            className={index >= 7 ? "wordmark-letter font-medium text-muted" : "wordmark-letter"}
            style={{ "--letter-index": index } as React.CSSProperties}
          >
            {letter}
          </span>
        ))}
      </span>
      {/* synthetic data throughout: say so wherever the name appears */}
      <span aria-hidden="true" className={`wordmark-demo self-center rounded-full border border-line font-semibold uppercase tracking-wider text-muted ${large ? "px-2 py-0.5 text-[10px]" : "px-1.5 text-[9px] leading-4"}`}>
        Demo
      </span>
    </Link>
  );
}

/** Icon button to the sample-results dashboard. */
export function ResultsButton({ grouped = false, onOpen }: { grouped?: boolean; onOpen?: () => void }) {
  return (
    <Link
      href="/results"
      aria-label="Sample results"
      title="Sample results"
      className={grouped ? ICON_BUTTON_GROUPED : ICON_BUTTON}
      onClick={onOpen ? event => {
        if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          onOpen();
        }
      } : undefined}
    >
      <ChartBarIcon aria-hidden className="h-4 w-4" />
    </Link>
  );
}

/**
 * The brand row, shared by both pages so the logo and the page switch sit at exactly the same place
 * when moving between Review and Sample results. Beside the logo: the results button on Review, and a
 * way back to Review on Sample results. `end` fills the right-hand side.
 */
export function BrandBar({ onResults = false, hideResults = false, end }: { onResults?: boolean; hideResults?: boolean; end?: React.ReactNode }) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-1.5 px-4">
      <Wordmark />
      {!hideResults && <span className="ml-1">
        {onResults ? (
          <Link href="/" className="flex h-8 items-center rounded-lg px-2 text-[13px] font-medium text-muted hover:bg-bg hover:text-ink">
            ← Back to review
          </Link>
        ) : (
          <ResultsButton />
        )}
      </span>}
      {end && <span className="ml-auto">{end}</span>}
    </div>
  );
}
