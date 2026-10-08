"use client";

import { trackEvent } from "@/lib/analytics";

const PORTFOLIO_URL = "https://thefaintsignal.com";

// The Faint Signal's wordmark mark (its SignalLogo, "glass" variant at rest): a circular amplitude envelope
// with seven oscillations and flat leads, inside a capsule.
const WAVE = (() => {
  const points = Array.from({ length: 601 }, (_, i) => {
    const t = i / 600;
    const envelope = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
    return `${(21 + 38 * t).toFixed(3)} ${(20 - 19 * envelope * Math.sin(t * Math.PI * 14)).toFixed(3)}`;
  });
  return `M2 20 L${points.join(" L")} L78 20`;
})();

/** A quiet link back to the author's portfolio: its condensed-capitals wordmark and waveform mark. */
export function FaintSignalCredit({ from, className = "" }: { from: "about" | "lock_screen"; className?: string }) {
  return (
    <a
      href={PORTFOLIO_URL}
      target="_blank"
      rel="noopener"
      onClick={() => trackEvent("portfolio_link_clicked", { from })}
      className={`group inline-flex items-center gap-2 whitespace-nowrap rounded text-caption text-muted transition-colors hover:text-ink ${className}`}
    >
      <span>See more at</span>
      <span className="inline-flex items-center gap-[0.3em] font-wordmark text-[13px] uppercase leading-none tracking-[0.01em]">
        The Faint Signal
        <svg aria-hidden focusable="false" viewBox="-8 -8 96 56" className="h-4 w-auto shrink-0 overflow-visible">
          <rect x="-6" y="-6" width="92" height="52" rx="26" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.6" />
          <path d={WAVE} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
