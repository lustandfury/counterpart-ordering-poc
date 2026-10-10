import { useEffect, useState, type CSSProperties } from "react";
import { trackEvent } from "@/lib/analytics";
import { Wordmark } from "@/components/AppNav";
import { useAccess } from "@/components/AccessProvider";
import { Button } from "@/components/ui/Button";
import { FaintSignalCredit } from "@/components/FaintSignalCredit";

// Introductory copy reveals in reading order; the entry button is available immediately.
// Any key or tap shows everything at once, so returning reps are never held up.
const LOCK_STEPS = [
  { title: "A contractor texts an order", body: <span className="mt-1.5 block w-fit rounded-[18px] rounded-tl-none bg-bg px-3 py-1.5 text-caption leading-snug text-ink">need 40 2x4x8 PT + 12 sheets 1/2 rock</span> },
  { title: "AI drafts it from your catalog", body: <span className="mt-0.5 block text-small text-muted">Each line is matched to a product with a confidence score.</span> },
  { title: "You check only what\u2019s uncertain", body: <span className="mt-0.5 block text-small text-muted">Confident lines are approved; unclear ones are flagged with options.</span> },
];
const LOCK_REVEAL_MS = { headline: 100, intro: 180, steps: 650, stepGap: 900 };
const reveal = (ms: number) => ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;

/** The entry screen over the lumber photo. "Try the demo" fades it out and hands focus to the review. */
export function AccessLockScreen() {
  const { unlock } = useAccess();
  const [unlocking, setUnlocking] = useState(false);
  const [skipped, setSkipped] = useState(false);
  useEffect(() => {
    if (skipped) return;
    const skip = () => setSkipped(true);
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [skipped]);
  const submit = () => {
    trackEvent("workspace_unlocked");
    setUnlocking(true);
    window.setTimeout(() => {
      unlock();
      setUnlocking(false);
      window.requestAnimationFrame(() => document.getElementById("review")?.focus());
    }, 550);
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome to Counterpart" className={`lock-screen fixed inset-0 z-[70] grid place-items-center p-6 ${unlocking ? "lock-screen-exit" : ""} ${skipped ? "lock-reveal-skip" : ""}`}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="lock-screen-form w-full">
        <div className="lock-screen-story">
          <Wordmark large />
          <h1 className="lock-reveal mt-6 text-balance text-[28px] font-semibold leading-[1.15] tracking-tight sm:text-[34px]" style={reveal(LOCK_REVEAL_MS.headline)}>The fast lane for pro orders.</h1>
          <p className="lock-reveal mt-3 text-body leading-relaxed text-muted" style={reveal(LOCK_REVEAL_MS.intro)}>Contractors&apos; text messages, turned into ready-to-send orders.</p>
          <ol className="mt-6 flex w-full flex-col gap-4 text-left">
            {LOCK_STEPS.map((step, i) => (
              <li key={step.title} className="lock-reveal flex gap-3" style={reveal(LOCK_REVEAL_MS.steps + i * LOCK_REVEAL_MS.stepGap)}>
                <span aria-hidden className="figures mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#2563eb] text-caption font-semibold text-white">{i + 1}</span>
                <span className="min-w-0 text-body font-medium leading-6">{step.title}{step.body}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="lock-screen-entry">
          <h2 className="text-lg font-semibold tracking-tight">Explore Counterpart</h2>
          <p className="mt-2 text-small leading-relaxed text-muted">See how a rep reviews AI-drafted orders, using sample orders and a live run.</p>
          <Button type="submit" size="block" disabled={unlocking} className="mt-6 min-h-12">
            Try the demo
          </Button>
          <div className="mt-6 flex justify-center"><FaintSignalCredit from="lock_screen" /></div>
        </div>
      </form>
    </div>
  );
}
