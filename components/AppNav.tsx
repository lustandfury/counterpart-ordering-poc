import Link from "next/link";

/** The Counterpart wordmark: a small mark (a checked line on a counter slip) and the name. Links home. */
export function Wordmark({ large = false }: { large?: boolean }) {
  const name = "counterpart";
  return (
    <Link href="/" aria-label="Counterpart, review" className={`flex items-center rounded-lg ${large ? "gap-4" : "gap-2"}`}>
      <svg aria-hidden viewBox="0 0 24 24" className={`${large ? "h-14 w-14" : "h-7 w-7"} shrink-0`}>
        <circle cx="12" cy="12" r="12" fill="var(--brand)" />
        <path d="M6.5 8.5h7M6.5 12h5M6.5 15.5h4" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" opacity="0.45" />
        <path d="M14 14.8l1.9 1.9 3.6-4.2" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span aria-hidden="true" className={`${large ? "text-[34px]" : "text-[17px]"} wordmark-name font-bold tracking-[-0.03em] text-ink`}>
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
    </Link>
  );
}

/** Icon button to the sample-results dashboard. */
export function ResultsButton() {
  return (
    <Link
      href="/results"
      aria-label="Sample results"
      title="Sample results"
      className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-panel hover:text-ink"
    >
      <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2.5 13.5h11" />
        <path d="M4.5 11V8.5M8 11V4.5M11.5 11V6.5" strokeWidth="2" />
      </svg>
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
