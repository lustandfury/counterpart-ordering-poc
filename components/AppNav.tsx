"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { LogoMark } from "@/components/LogoMark";
import { ICON_BUTTON, ICON_BUTTON_GROUPED } from "@/components/ui/iconButton";
import { ChartBarIcon } from "@heroicons/react/24/outline";

const WORDMARK_DURATION_MS = 2400;
// Six revolutions, one letter per half-turn. The coin uses quadratic ease-out:
// progress = 1 - (1 - time)^2; invert it to schedule each mechanical click.
const letterDelay = (index: number) => WORDMARK_DURATION_MS * (1 - Math.sqrt(1 - (index + 1) / 12));

/** Shared logo for the navigation and welcome screen. Links home. */
export function Wordmark({ large = false, processing }: { large?: boolean; processing?: boolean }) {
  return (
    <Link href="/" aria-label="Counterpart demo, review" data-wordmark-intro={processing === undefined} style={{ "--wordmark-duration": `${WORDMARK_DURATION_MS}ms` } as CSSProperties} className={`flex items-center rounded-lg ${large ? "gap-2" : "gap-1"}`}>
      <LogoMark processing={processing} className={large ? "h-[clamp(2.5rem,13vw,3.5rem)] w-[clamp(2.5rem,13vw,3.5rem)]" : "h-8 w-8"} />
      <span aria-hidden="true" className={`${large ? "text-[clamp(22px,7vw,32px)]" : "text-[17px]"} wordmark-name whitespace-nowrap font-mono font-semibold text-ink`}>
        {Array.from("C0UNTERPART", (letter, index) => (
          <span
            key={`${letter}-${index}`}
            className={index >= 7 ? `wordmark-slot text-muted${index === 7 ? " wordmark-slot-tight" : ""}` : "wordmark-slot"}
            style={{ "--letter-delay": `${letterDelay(index)}ms` } as CSSProperties}
          >
            <span className="wordmark-letter">
              {[-2, -1, 0].map(offset => (
                <span className="wordmark-glyph" key={offset}>
                  {letter === "0" ? String((offset + 10) % 10) : String.fromCharCode(65 + (letter.charCodeAt(0) - 65 + offset + 26) % 26)}
                </span>
              ))}
            </span>
          </span>
        ))}
      </span>
      {/* synthetic data throughout: say so wherever the name appears */}
      <span aria-hidden="true" className={`wordmark-demo self-center rounded-full border border-line font-semibold uppercase tracking-wider text-muted ${large ? "ml-2 px-2 py-0.5 text-[10px]" : "ml-1 px-1.5 text-[9px] leading-4"}`}>
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
export function BrandBar({ onResults = false, hideResults = false, processing, end }: { onResults?: boolean; hideResults?: boolean; processing?: boolean; end?: React.ReactNode }) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-1.5 px-4">
      <Wordmark processing={processing} />
      {!hideResults && <span className="ml-1">
        {onResults ? (
          <Link href="/" className="flex h-8 items-center rounded-lg px-2 text-small font-medium text-muted hover:bg-bg hover:text-ink">
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
