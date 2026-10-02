import { ActionSheet } from "@/components/ui/ActionSheet";
import { Button } from "@/components/ui/Button";
import { SheetHeader } from "@/components/ui/Sheet";

// Optional address for deletion requests, set in the environment so no personal address lives in the repo
const PRIVACY_CONTACT = process.env.NEXT_PUBLIC_PRIVACY_CONTACT;

/** Shown when a visitor has used their free generated orders: an email keeps them going. */
export function SignupDialog({ open, email, setEmail, loading, error, onSubmit, onClose }: { open: boolean; email: string; setEmail: (value: string) => void; loading: boolean; error: string | null; onSubmit: () => void; onClose: () => void }) {
  return (
    <ActionSheet open={open} onClose={onClose} labelledBy="signup-title" dismissOnBackdrop={false}>
        <SheetHeader id="signup-title" eyebrow="Free limit reached" title="Keep generating orders" closeLabel="Close sign-up" onClose={onClose} />
        <p className="mt-3 text-body leading-relaxed text-muted">You’ve used your 5 free orders. Enter your email to continue using Counterpart.</p>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="mt-5">
          <label htmlFor="signup-email" className="text-small font-medium">Email address</label>
          <input id="signup-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1.5 h-11 w-full rounded-lg bg-input px-3.5 outline-none shadow-[inset_0_0_0_1px_var(--ring)] focus:shadow-[inset_0_0_0_1px_var(--control)]" />
          {error && <p role="alert" className="mt-2 text-small text-warn">{error}</p>}
          <div className="mt-4 flex justify-end"><Button type="submit" disabled={loading || !email.trim()}>{loading ? "Saving…" : "Continue"}</Button></div>
        </form>
        <p className="mt-3 text-center text-tiny leading-relaxed text-muted">
          We store your email only to let you keep generating orders in this demo. It isn’t sold or shared.
          {PRIVACY_CONTACT && <> To have it deleted, email <a href={`mailto:${PRIVACY_CONTACT}`} className="underline">{PRIVACY_CONTACT}</a>.</>}
        </p>
    </ActionSheet>
  );
}
