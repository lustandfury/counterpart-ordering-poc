"use client";

import { trackEvent } from "@/lib/analytics";

const PORTFOLIO_URL = "https://thefaintsignal.com";

// The Faint Signal's waveform mark: a circular amplitude envelope with seven oscillations and flat leads.
const WAVE = (() => {
  const points = Array.from({ length: 241 }, (_, i) => {
    const t = i / 240;
    const envelope = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
    return `${(21 + 38 * t).toFixed(2)} ${(20 - 19 * envelope * Math.sin(t * Math.PI * 14)).toFixed(2)}`;
  });
  return `M2 20 L${points.join(" L")} L78 20`;
})();

/** A quiet link back to the author's portfolio, set in its wordmark: condensed capitals followed by the waveform. */
export function FaintSignalCredit({ from, className = "" }: { from: "about" | "lock_screen"; className?: string }) {
  return (
    <a
      href={PORTFOLIO_URL}
      target="_blank"
      rel="noopener"
      onClick={() => trackEvent("portfolio_link_clicked", { from })}
      className={`group inline-flex items-center gap-2 rounded text-caption text-muted transition-colors hover:text-ink ${className}`}
    >
      <span>Built by</span>
      <span className="inline-flex items-center gap-[0.3em] font-wordmark text-[13px] uppercase leading-none tracking-[0.02em]">
        The Faint Signal
        <svg aria-hidden focusable="false" viewBox="0 0 80 40" className="h-[0.8em] w-auto overflow-visible">
          <path d={WAVE} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
