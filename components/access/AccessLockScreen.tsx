import { useEffect, useState, type CSSProperties } from "react";
import { trackEvent } from "@/lib/analytics";
import { Wordmark } from "@/components/AppNav";
import { useAccess } from "@/components/AccessProvider";
import { Button } from "@/components/ui/Button";

// A welcome screen, not access control: the code is shared openly with visitors.
const ACCESS_CODE = "007";

// Lock-screen copy arrives in reading order (pitch, then how it works), and the access code last,
// so a first-time visitor reads what the app does before being asked for anything.
// Any key or tap shows everything at once, so returning reps are never held up.
const LOCK_STEPS = [
  { title: "A contractor texts an order", body: <span className="mt-1.5 block w-fit rounded-[18px] rounded-tl-[4px] bg-bg px-3 py-1.5 text-caption leading-snug text-ink">need 40 2x4x8 PT + 12 sheets 1/2 rock</span> },
  { title: "AI drafts it from your catalog", body: <span className="mt-0.5 block text-small text-muted">Each line is matched to a product with a confidence score.</span> },
  { title: "You check only what\u2019s uncertain", body: <span className="mt-0.5 block text-small text-muted">Confident lines are approved; unclear ones are flagged with options.</span> },
];
const LOCK_REVEAL_MS = { headline: 900, intro: 1300, steps: 1900, stepGap: 650, form: 3900 };
const reveal = (ms: number) => ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;

/** The entry screen over the lumber photo. A matching code fades it out and hands focus to the review. */
export function AccessLockScreen() {
  const { unlock } = useAccess();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
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
    if (code !== ACCESS_CODE) {
      setError(true);
      return;
    }
    setError(false);
    trackEvent("workspace_unlocked");
    setUnlocking(true);
    window.setTimeout(() => {
      unlock();
      setUnlocking(false);
      window.requestAnimationFrame(() => document.getElementById("review")?.focus());
    }, 550);
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Enter access code" className={`lock-screen fixed inset-0 z-[70] grid place-items-center p-6 ${unlocking ? "lock-screen-exit" : ""} ${skipped ? "lock-reveal-skip" : ""}`}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="lock-screen-form flex w-full max-w-3xl flex-col items-center text-center">
        <div className="action-sheet-handle" aria-hidden />
        <Wordmark large />
        <p className="lock-reveal mt-5 text-lg font-medium tracking-tight" style={reveal(LOCK_REVEAL_MS.headline)}>The Fast Lane for Pro Orders</p>
        <p className="lock-reveal mt-1.5 text-body text-muted" style={reveal(LOCK_REVEAL_MS.intro)}>Contractors&apos; text messages, turned into ready-to-send orders.</p>
        <ol className="mt-5 flex w-full max-w-sm flex-col gap-3 text-left">
          {LOCK_STEPS.map((step, i) => (
            <li key={step.title} className="lock-reveal flex gap-3" style={reveal(LOCK_REVEAL_MS.steps + i * LOCK_REVEAL_MS.stepGap)}>
              <span aria-hidden className="figures mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brandsoft text-caption font-semibold text-ink">{i + 1}</span>
              <span className="min-w-0 text-body font-medium leading-6">{step.title}{step.body}</span>
            </li>
          ))}
        </ol>
        <div className="lock-reveal mt-6 flex w-full flex-col items-center border-t border-line pt-5" style={reveal(LOCK_REVEAL_MS.form)}>
          <p className="text-small text-muted">Enter your access code to continue</p>
          <label htmlFor="access-code" className="sr-only">Access code</label>
          <input
            id="access-code"
            type="password"
            inputMode="numeric"
            maxLength={3}
            autoFocus
            value={code}
            onChange={(e) => { setSkipped(true); setCode(e.target.value); }}
            aria-invalid={error}
            aria-describedby={error ? "access-code-error" : undefined}
            placeholder="Access code"
            className="mt-4 h-11 w-full rounded-xl bg-panel px-4 text-center tracking-[0.3em] outline-none shadow-ring focus:shadow-control"
          />
          {error && <p id="access-code-error" role="alert" className="mt-2 text-small text-warn">That code doesn&apos;t match.</p>}
          <Button type="submit" size="block" disabled={code.length !== 3 || unlocking} className="mt-4">
            Enter
          </Button>
        </div>
      </form>
    </div>
  );
}
