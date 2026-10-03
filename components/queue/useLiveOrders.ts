import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { generateOrder } from "@/lib/generate";
import { readOrderStream, type OrderProgress, type OrderStage } from "@/lib/order-progress";
import type { OrderResult } from "@/lib/types";
import { orderNumber } from "@/lib/view";

export type Run = OrderResult & { runId: number };
export type PendingOrder = { orderId: string; from: Run["from"]; text: string; at: number };

/**
 * Generate order: a simulated contractor text, run live through both pipelines. The order joins the queue as soon as
 * its text "arrives" (pending) and becomes a run once both finish. Past the free limit, the run asks for an email first.
 */
export function useLiveOrders({ samples, onStart, onArrived, onError }: {
  samples: OrderResult[];
  /** the text is on its way: make room for the progress view */
  onStart: () => void;
  /** a run finished and joined the queue */
  onArrived: (run: Run) => void;
  onError: () => void;
}) {
  const [runs, setRuns] = useState<Run[]>([]); // newest first
  const [pending, setPending] = useState<PendingOrder | null>(null);
  // Generated orders are numbered after the samples (shown as 1001–1020), so the two never collide
  const nextOrderNumber = useRef(Math.max(1000, ...samples.map((s) => Number(orderNumber(s.orderId)) || 0)) + 1);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<Partial<Record<OrderStage, OrderProgress>>>({});
  const [error, setError] = useState<string | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);

  async function runLive() {
    if (loading) return;
    // Every second generated order has two lines to check, so a visitor always sees one;
    // the first has one, which keeps the first review short
    const order = generateOrder(Math.random, { checks: runs.length % 2 === 1 ? 2 : 1 });
    trackEvent("order_run_started");
    setPending({ orderId: String(nextOrderNumber.current), from: order.from, text: order.text, at: Date.now() });
    setLoading(true);
    setProgress({ access: { stage: "access", status: "running" } });
    onStart();
    setError(null);
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ text: order.text }) });
      const data = res.headers.get("content-type")?.includes("application/x-ndjson")
        ? await readOrderStream(res, step => setProgress(current => ({ ...current, [step.stage]: step })))
        : await res.json();
      if (data.code === "SIGNUP_REQUIRED") {
        trackEvent("signup_required");
        setSignupOpen(true);
        setSignupError(null);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "The run failed.");
      trackEvent("order_run_completed", { line_count: (data as OrderResult).parse.lines.length });
      const runId = Date.now();
      const orderId = String(nextOrderNumber.current++);
      const run = { ...(data as OrderResult), orderId, from: order.from, runId };
      setRuns((r) => [run, ...r]);
      // it lands in the queue for the rep to open, like any incoming text
      onArrived(run);
    } catch (e) {
      trackEvent("order_run_failed");
      setError(e instanceof Error ? e.message : "The run failed.");
      onError();
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  async function signUp() {
    if (!signupEmail.trim() || signupLoading) return;
    setSignupLoading(true);
    setSignupError(null);
    try {
      const res = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: signupEmail }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "We couldn't save your email.");
      trackEvent("signup_completed");
      setSignupOpen(false);
      await runLive();
    } catch (e) {
      setSignupError(e instanceof Error ? e.message : "We couldn't save your email.");
    } finally {
      setSignupLoading(false);
    }
  }

  return {
    runs, pending, loading, progress, error, runLive,
    signup: { open: signupOpen, email: signupEmail, setEmail: setSignupEmail, loading: signupLoading, error: signupError, submit: signUp, close: () => setSignupOpen(false) },
  };
}

// First load: the centre waits on an empty state, then the first order lands in the queue for the rep to open.
const QUEUED_MS = 700;
// Module scope survives client-side navigation, so coming back from Sample results doesn't replay the arrival.
let firstArrivalShown = false;

/** "empty": waiting for the first order; "queued": it's in the queue. A link straight to an order (?order=) skips the wait. */
export function useFirstArrival(unlocked: boolean, skip: boolean, onArrived: () => void) {
  const [arrival, setArrival] = useState<"empty" | "queued">(() => (skip || firstArrivalShown ? "queued" : "empty"));
  useEffect(() => {
    if (!unlocked || arrival === "queued") return;
    const queued = window.setTimeout(() => { firstArrivalShown = true; setArrival("queued"); onArrived(); }, QUEUED_MS);
    return () => window.clearTimeout(queued);
    // runs once per unlock; the arrival stage only moves forward
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, onArrived]);
  return arrival;
}
