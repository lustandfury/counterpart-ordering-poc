import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { Wordmark } from "@/components/AppNav";
import { useAccess } from "@/components/AccessProvider";
import { Button } from "@/components/ui/Button";

// A welcome screen, not access control: the code is shared openly with visitors.
const ACCESS_CODE = "007";

/** The entry screen over the lumber photo. A matching code fades it out and hands focus to the review. */
export function AccessLockScreen() {
  const { unlock } = useAccess();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
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
    <div role="dialog" aria-modal="true" aria-label="Enter access code" className={`lock-screen fixed inset-0 z-[70] grid place-items-center p-6 ${unlocking ? "lock-screen-exit" : ""}`}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="lock-screen-form flex w-full max-w-3xl flex-col items-center text-center">
        <div className="action-sheet-handle" aria-hidden />
        <Wordmark large />
        <p className="mt-5 text-lg font-medium tracking-tight">The Fast Lane for Pro Orders</p>
        <p className="mt-1.5 text-body text-muted">Contractors text their orders. You check only what&apos;s uncertain.</p>
        <p className="mt-5 text-small text-muted">Enter your access code to continue</p>
        <label htmlFor="access-code" className="sr-only">Access code</label>
        <input
          id="access-code"
          type="password"
          inputMode="numeric"
          maxLength={3}
          autoFocus
          value={code}
          onChange={(e) => { setCode(e.target.value); }}
          aria-invalid={error}
          aria-describedby={error ? "access-code-error" : undefined}
          placeholder="Access code"
          className="mt-4 h-11 w-full rounded-xl bg-panel px-4 text-center tracking-[0.3em] outline-none shadow-ring focus:shadow-control"
        />
        {error && <p id="access-code-error" role="alert" className="mt-2 text-small text-warn">That code doesn&apos;t match.</p>}
        <Button type="submit" size="block" disabled={code.length !== 3 || unlocking} className="mt-4">
          Enter
        </Button>
      </form>
    </div>
  );
}
