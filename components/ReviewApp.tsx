"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useThresholds } from "@/lib/settings";
import { DEFAULT_T, UNIT_OK_MIN as DEFAULT_UNIT } from "@/lib/pipeline/route";
import { trackEvent } from "@/lib/analytics";
import { readOrderStream, type OrderProgress, type OrderStage } from "@/lib/order-progress";
import { OrderLoading } from "@/components/OrderLoading";
import type { OrderResult, Sender } from "@/lib/types";
import Link from "next/link";
import { setShortcutsEnabled, shortcutsEnabled } from "@/lib/shortcuts";
import { useDialog } from "@/components/useDialog";
import { BrandBar, ResultsButton, Wordmark } from "@/components/AppNav";
import { useAccess } from "@/components/AccessProvider";
import { generateOrder } from "@/lib/generate";
import { applyTheme, readTheme, THEMES, type Theme } from "@/lib/theme";
import { CLAUDE_INPUT_PER_TOKEN, CLAUDE_OUTPUT_PER_TOKEN, JEV_INPUT_PER_TOKEN } from "@/lib/pricing";
import { computeView, displayChoices, NONE, segmentText, totals, type Mode, type SlimCatalog, type ViewLine } from "@/lib/view";

const usd = (n: number) => `$${n.toFixed(4)}`;
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);

const Person = () => (
  <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="8" cy="5.2" r="2.4" />
    <path d="M3 13.5c.6-2.6 2.5-3.8 5-3.8s4.4 1.2 5 3.8" strokeLinecap="round" />
  </svg>
);

const Check = () => (
  <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 8.5l3.2 3L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function fmtQty(qty: number | null, unit: string | null) {
  if (qty == null) return "no quantity";
  if (!unit) return String(qty);
  const u = unit === "each" ? "pcs" : qty === 1 || /s$|^(feet|ft|lb|kg|m|mm|l|ml|sq)$/i.test(unit) ? unit : /(x|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`;
  return `${qty} ${u}`;
}

// "lbs" = "lb", "tubes" = "tube", "pcs" = "each": the same unit written differently
const unitKey = (u: string) => (/^(each|ea|pcs?|pieces?)$/i.test(u) ? "each" : u.toLowerCase().replace(/(es|s)$/, ""));

type Run = OrderResult & { runId: number };

const DEFAULT_SAMPLE = "o13";
const SAMPLES_SHOWN = 3;
// Optional address for deletion requests, set in the environment so no personal address lives in the repo
const PRIVACY_CONTACT = process.env.NEXT_PUBLIC_PRIVACY_CONTACT;
const WALKTHROUGH_KEY = "counterpart-walkthrough-complete";
const ORDER_TEXT_LIMIT = 600;
const ORDER_COUNTER_THRESHOLD = ORDER_TEXT_LIMIT * 0.8;

type WalkthroughStep = 0 | 1 | 2;

export function ReviewApp({ samples, catalog, initialOrder }: { samples: OrderResult[]; catalog: SlimCatalog; initialOrder?: string }) {
  const [runs, setRuns] = useState<Run[]>([]); // live runs from the composer, newest first
  const [selected, setSelected] = useState(initialOrder ?? samples.find((x) => x.orderId === DEFAULT_SAMPLE)?.orderId ?? samples[0].orderId);
  const [mode, setMode] = useState<Mode>("jev");
  const { T, unitMin, setT, setUnitMin } = useThresholds();
  // The orders sidebar is open by default on wide screens and closed on phones, where it opens as a bottom sheet.
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteFrom, setPasteFrom] = useState<Sender | undefined>(); // set by Generate, cleared by editing
  const [loading, setLoading] = useState(false);
  const [orderProgress, setOrderProgress] = useState<Partial<Record<OrderStage, OrderProgress>>>({});
  const [error, setError] = useState<string | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  // The rep's decisions and mock sends, per order, so they survive switching between orders
  const [decisions, setDecisions] = useState<Record<string, Decisions>>({});
  const [sent, setSent] = useState<Record<string, number>>({}); // order id -> time sent
  const [walkthroughStep, setWalkthroughStep] = useState<WalkthroughStep | null>(null);
  const walkthroughStepRef = useRef<WalkthroughStep | null>(null);
  const [walkthroughCompared, setWalkthroughCompared] = useState<Mode[]>([]);
  const { unlocked, unlock } = useAccess();
  const [unlocking, setUnlocking] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState(false);

  const live = runs.find((r) => `live-${r.runId}` === selected);
  const result = live ?? samples.find((s) => s.orderId === selected) ?? samples[0];
  // The sidebar lists only a few samples: the default order first, then the next ones in file order.
  // A sample opened from a link (e.g. from Sample results) is added so the active order is always listed.
  const shownSamples = useMemo(() => {
    const ids = new Set([...new Set([DEFAULT_SAMPLE, ...samples.map((s) => s.orderId)])].filter((id) => samples.some((s) => s.orderId === id)).slice(0, SAMPLES_SHOWN));
    if (initialOrder) ids.add(initialOrder);
    return [...ids].map((id) => samples.find((s) => s.orderId === id)!);
  }, [samples, initialOrder]);

  const narrow = () => window.matchMedia("(max-width: 1023px)").matches;
  const toggleSidebar = useCallback(() => (narrow() ? setMobileOpen((v) => !v) : setDesktopOpen((v) => !v)), []);

  const showWalkthroughStep = useCallback((step: WalkthroughStep) => {
    walkthroughStepRef.current = step;
    setWalkthroughStep(step);
    setWalkthroughCompared([]);
    setDesktopOpen(true);
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    setMobileOpen(mobile && step === 0);
    if (mobile && step > 0) {
      window.requestAnimationFrame(() => {
        document.querySelector(step === 1 ? ".tour-choice .tour-option" : ".tour-compare")?.scrollIntoView({ block: "center" });
      });
    }
  }, []);

  // Cmd/Ctrl+B toggles the orders sidebar (as in code editors); Escape closes the phone overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  // localStorage is deliberately read after mount: the walkthrough is a browser-only preference,
  // and reading it during render would make the server and client markup disagree.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (window.localStorage.getItem(WALKTHROUGH_KEY) !== "true") {
        showWalkthroughStep(0);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showWalkthroughStep]);

  const closeWalkthrough = useCallback(() => {
    walkthroughStepRef.current = null;
    window.localStorage.setItem(WALKTHROUGH_KEY, "true");
    setWalkthroughStep(null);
  }, []);

  const replayWalkthrough = useCallback(() => {
    showWalkthroughStep(0);
  }, [showWalkthroughStep]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && walkthroughStep !== null) closeWalkthrough();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walkthroughStep, closeWalkthrough]);

  const pick = (id: string) => {
    trackEvent("order_selected", { source: id.startsWith("live-") ? "live" : "sample" });
    setSelected(id);
    setMobileOpen(false);
    // hand the keyboard to the review, so Enter / j / k act on lines rather than re-clicking the order
    requestAnimationFrame(() => document.getElementById("review")?.focus({ preventScroll: true }));
  };

  async function runLive() {
    if (!pasteText.trim() || loading) return;
    trackEvent("order_run_started");
    setLoading(true);
    setOrderProgress({ access: { stage: "access", status: "running" } });
    setMobileOpen(false);
    requestAnimationFrame(() => document.getElementById("review")?.scrollIntoView({ block: "start" }));
    setError(null);
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ text: pasteText }) });
      const data = res.headers.get("content-type")?.includes("application/x-ndjson")
        ? await readOrderStream(res, progress => setOrderProgress(current => ({ ...current, [progress.stage]: progress })))
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
      setRuns((r) => [{ ...(data as OrderResult), from: pasteFrom, runId }, ...r]);
      setPasteFrom(undefined);
      pick(`live-${runId}`);
      setPasteText("");
      if (walkthroughStepRef.current === 0) {
        const needsReview = computeView(data as OrderResult, mode, T, catalog, unitMin).some((line) => !line.approved);
        showWalkthroughStep(needsReview ? 1 : 2);
      }
    } catch (e) {
      trackEvent("order_run_failed");
      setError(e instanceof Error ? e.message : "The run failed.");
      if (narrow()) setMobileOpen(true);
    } finally {
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

  // lines still to check in an order: flagged by the current rule and not yet decided by the rep
  const toCheck = (r: OrderResult, id: string) => computeView(r, mode, T, catalog, unitMin).filter((l) => !l.approved && !decisions[id]?.[l.id]).length;

  return (
    <div className={`flex h-dvh flex-col overflow-hidden ${walkthroughStep !== null && !loading ? `walkthrough-active walkthrough-${walkthroughStep}` : ""}`}>
      <div inert={!unlocked || undefined} className={`app-shell relative flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto ${unlocked ? "app-shell-enter" : "app-shell-locked"}`}>
        {mobileOpen && <button aria-label="Close orders" tabIndex={-1} onClick={() => setMobileOpen(false)} className="sheet-fade fixed inset-0 z-20 bg-black/40 lg:hidden" />}
        {/* wide screens: a left sidebar; phones: a bottom sheet over the page */}
        <aside
          id="orders"
          aria-label="Orders"
          className={`tour-orders w-80 shrink-0 flex-col border-r border-line bg-panel max-lg:sheet-up max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:mx-auto max-lg:max-h-[85dvh] max-lg:w-full max-lg:max-w-xl max-lg:rounded-t-2xl max-lg:border-r-0 max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-[0_-8px_30px_rgb(0_0_0/0.18)] ${desktopOpen ? "lg:flex" : "lg:hidden"} ${mobileOpen ? "max-lg:flex" : "max-lg:hidden"}`}
        >
              <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line lg:hidden" />
              <BrandBar hideResults end={<SidebarButton label="Hide orders" expanded onClick={toggleSidebar} />} />
              <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                {runs.length > 0 && <OrderGroup label="Your runs">{runs.map((r) => (
                  <OrderItem key={r.runId} id={`live-${r.runId}`} tag="live" title={r.from?.company ?? "Pasted order"} preview={r.text} count={toCheck(r, `live-${r.runId}`)} sent={!!sent[`live-${r.runId}`]} active={selected === `live-${r.runId}`} onPick={pick} />
                ))}</OrderGroup>}
                <OrderGroup label="Samples">{shownSamples.map((s) => (
                  <OrderItem key={s.orderId} id={s.orderId} tag={s.orderId} title={s.from?.company ?? s.orderId} preview={s.text} count={toCheck(s, s.orderId)} sent={!!sent[s.orderId]} active={selected === s.orderId} onPick={pick} />
                ))}</OrderGroup>
              </nav>
              <div className="shrink-0 border-t border-line p-4">
                <label htmlFor="paste" className="sr-only">Paste a text-message order</label>
                <div className="rounded-[14px] bg-input shadow-[inset_0_0_0_1px_var(--ring)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_var(--control)]">
                  <textarea
                    id="paste"
                    rows={7}
                    disabled={loading}
                    value={pasteText}
                    maxLength={ORDER_TEXT_LIMIT}
                    onChange={(e) => {
                      setPasteText(e.target.value);
                      setPasteFrom(undefined);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        runLive();
                      }
                    }}
                    placeholder={"Paste a text-message order, or press Generate for a sample…"}
                    className="block w-full resize-none rounded-t-[14px] bg-transparent px-3.5 pt-3 font-mono text-[13px] leading-6 outline-none focus-visible:outline-none"
                  />
                  <div className="flex items-center gap-2 px-3 pb-3">
                    <button
                      disabled={loading}
                      onClick={() => {
                        const g = generateOrder();
                        setPasteText(g.text);
                        setPasteFrom(g.from);
                        setError(null);
                        requestAnimationFrame(() => document.getElementById("paste")?.focus());
                      }}
                      title="Fill in a random sample order. It always includes at least one line to check."
                      className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted hover:text-ink ${walkthroughStep === 0 && !pasteText.trim() ? "tour-cue bg-line hover:bg-control/20" : "hover:bg-panel"}`}
                    >
                      <DiceIcon />
                      Generate
                    </button>
                    {pasteText.length >= ORDER_COUNTER_THRESHOLD && <span className="text-[12px] text-muted" aria-label={`${pasteText.length} of ${ORDER_TEXT_LIMIT} characters`}>{pasteText.length}/{ORDER_TEXT_LIMIT}</span>}
                    <button onClick={runLive} disabled={loading || !pasteText.trim()} className={`ml-auto h-8 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-onbrand disabled:opacity-40 ${walkthroughStep === 0 && pasteText.trim() && !loading ? "tour-cue" : ""}`}>
                      {loading ? "Reading…" : "Run ⌘↵"}
                    </button>
                  </div>
                </div>
                {error && <p role="alert" className="mt-2 text-[13px] text-warn">{error}</p>}
              </div>
        </aside>

        <main id="review" tabIndex={-1} className="tour-review textured-surface min-w-0 flex-1 outline-none lg:overflow-y-auto">
          <div className={`px-3 pt-3 max-lg:block ${desktopOpen ? "lg:hidden" : "lg:block"}`}>
            <SidebarButton label="Show orders" expanded={false} onClick={toggleSidebar} />
          </div>
          <div className="mx-auto max-w-4xl px-5 py-8 sm:px-10">
            {loading ? <OrderLoading progress={orderProgress} /> : <Review
              key={selected}
              result={result}
              isLive={!!live}
              mode={mode}
              T={T}
              unitMin={unitMin}
              catalog={catalog}
              resolved={decisions[selected] ?? {}}
              setResolved={(f) => setDecisions((d) => ({ ...d, [selected]: f(d[selected] ?? {}) }))}
              onReviewed={() => { if (walkthroughStep === 1) showWalkthroughStep(2); }}
              sentAt={sent[selected]}
              onSend={() => {
                trackEvent("order_sent", { source: live ? "live" : "sample", mode, demo: true });
                setSent((s) => ({ ...s, [selected]: Date.now() }));
              }}
              onReopen={() => setSent((s) => Object.fromEntries(Object.entries(s).filter(([id]) => id !== selected)))}
            />}
          </div>
        </main>

        <aside aria-label="Cost assessment" className="tour-cost shrink-0 border-line bg-panel lg:w-80 lg:overflow-y-auto lg:border-l max-lg:border-t">
          {loading ? <p className="px-6 py-8 text-[14px] leading-relaxed text-muted">The cost comparison will appear when both matching checks finish.</p> : <CostPanel result={result} samples={samples} mode={mode} T={T} unitMin={unitMin} catalog={catalog} onMode={(nextMode) => {
            if (nextMode !== mode) trackEvent("comparison_mode_changed", { mode: nextMode });
            setMode(nextMode);
            if (walkthroughStep === 2) {
              const compared = [...new Set([...walkthroughCompared, nextMode])];
              setWalkthroughCompared(compared);
              if (compared.length === 2) closeWalkthrough();
            }
          }} setT={setT} setUnitMin={setUnitMin} onReplay={replayWalkthrough} />}
        </aside>
      </div>
      {!unlocked && <AccessLockScreen code={accessCode} setCode={setAccessCode} error={accessError} unlocking={unlocking} onSubmit={() => {
        if (accessCode !== "007") {
          setAccessError(true);
          return;
        }
        setAccessError(false);
        trackEvent("workspace_unlocked");
        setUnlocking(true);
        window.setTimeout(() => {
          unlock();
          setUnlocking(false);
          window.requestAnimationFrame(() => document.getElementById("review")?.focus());
        }, 550);
      }} />}
      {walkthroughStep !== null && !loading && <Walkthrough step={walkthroughStep} composerReady={!!pasteText.trim()} onBack={() => showWalkthroughStep((walkthroughStep - 1) as WalkthroughStep)} onNext={() => {
        if (walkthroughStep === 2) closeWalkthrough();
        else {
          showWalkthroughStep((walkthroughStep + 1) as WalkthroughStep);
        }
      }} onClose={closeWalkthrough} />}
      {signupOpen && <SignupDialog email={signupEmail} setEmail={setSignupEmail} loading={signupLoading} error={signupError} onSubmit={signUp} onClose={() => setSignupOpen(false)} />}
    </div>
  );
}

function AccessLockScreen({ code, setCode, error, unlocking, onSubmit }: { code: string; setCode: (value: string) => void; error: boolean; unlocking: boolean; onSubmit: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Enter access code" className={`lock-screen fixed inset-0 z-[70] grid place-items-center p-6 ${unlocking ? "lock-screen-exit" : ""}`}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="lock-screen-form flex w-full max-w-sm flex-col items-center text-center">
        <div className="action-sheet-handle" aria-hidden />
        <Wordmark large />
        <p className="mt-5 text-lg font-medium tracking-tight">Process orders at the speed of AI</p>
        <p className="mt-2 text-[14px] text-muted">Enter your access code to continue</p>
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
          className="mt-4 h-11 w-full rounded-xl bg-panel px-4 text-center tracking-[0.3em] outline-none shadow-[0_0_0_1px_var(--ring)] focus:shadow-[0_0_0_1px_var(--control)]"
        />
        {error && <p id="access-code-error" role="alert" className="mt-2 text-[13px] text-warn">That code doesn&apos;t match.</p>}
        <button type="submit" disabled={code.length !== 3 || unlocking} className="mt-4 h-10 w-full rounded-xl bg-brand px-4 text-[14px] font-semibold text-onbrand transition-opacity disabled:cursor-not-allowed disabled:opacity-40">
          Enter
        </button>
      </form>
    </div>
  );
}

function SignupDialog({ email, setEmail, loading, error, onSubmit, onClose }: { email: string; setEmail: (value: string) => void; loading: boolean; error: string | null; onSubmit: () => void; onClose: () => void }) {
  const dialogRef = useDialog<HTMLElement>(onClose);
  return (
    <ModalPortal>
    <div className="action-sheet-backdrop fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" role="presentation">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="signup-title" className="action-sheet-dialog outline-none w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl">
        <div className="action-sheet-handle" aria-hidden />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Free limit reached</p>
            <h2 id="signup-title" className="mt-1 text-xl font-semibold tracking-tight">Keep generating orders</h2>
          </div>
          <button onClick={onClose} aria-label="Close sign-up" className="-mr-2 -mt-2 rounded-lg px-2 py-1 text-xl leading-none text-muted hover:bg-bg hover:text-ink">×</button>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">You’ve used your 5 free orders. Enter your email to continue using Counterpart.</p>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="mt-5">
          <label htmlFor="signup-email" className="text-[13px] font-medium">Email address</label>
          <input id="signup-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1.5 h-11 w-full rounded-lg bg-input px-3.5 outline-none shadow-[inset_0_0_0_1px_var(--ring)] focus:shadow-[inset_0_0_0_1px_var(--control)]" />
          {error && <p role="alert" className="mt-2 text-[13px] text-warn">{error}</p>}
          <button type="submit" disabled={loading || !email.trim()} className="mt-4 h-10 w-full rounded-lg bg-brand px-4 text-[14px] font-semibold text-onbrand disabled:opacity-40">{loading ? "Saving…" : "Continue"}</button>
        </form>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
          We store your email only to let you keep generating orders in this demo. It isn’t sold or shared.
          {PRIVACY_CONTACT && <> To have it deleted, email <a href={`mailto:${PRIVACY_CONTACT}`} className="underline">{PRIVACY_CONTACT}</a>.</>}
        </p>
      </section>
    </div>
    </ModalPortal>
  );
}

function Walkthrough({ step, composerReady, onBack, onNext, onClose }: { step: WalkthroughStep; composerReady: boolean; onBack: () => void; onNext: () => void; onClose: () => void }) {
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => { cardRef.current?.focus({ preventScroll: true }); }, []);
  const [position, setPosition] = useState<{ left: number; top: number; arrow: number; side: string; visible: boolean } | null>(null);

  useEffect(() => {
    let frame: number;
    const update = () => {
      const target = (document.querySelector<HTMLElement>(["#paste", ".tour-choice .tour-option", ".tour-compare"][step]) ?? document.querySelector<HTMLElement>("#review h1"));
      const card = cardRef.current;
      if (target && card) {
        const rect = target.getBoundingClientRect();
        const { width, height } = card.getBoundingClientRect();
        const viewport = window.visualViewport;
        const minX = (viewport?.offsetLeft ?? 0) + 12;
        const minY = (viewport?.offsetTop ?? 0) + 12;
        const maxX = minX + (viewport?.width ?? window.innerWidth) - 24;
        const maxY = minY + (viewport?.height ?? window.innerHeight) - 24;
        const gap = 12;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
        let left = clamp(centerX - width / 2, minX, maxX - width);
        let top: number;
        let side: string;
        let arrow: number;
        if (window.innerWidth >= 1024 && rect.right + gap + width <= maxX) {
          left = rect.right + gap;
          top = clamp(centerY - height / 2, minY, maxY - height);
          side = "left";
          arrow = clamp(centerY - top, 20, height - 20);
        } else if (window.innerWidth >= 1024 && rect.left - gap - width >= minX) {
          left = rect.left - gap - width;
          top = clamp(centerY - height / 2, minY, maxY - height);
          side = "right";
          arrow = clamp(centerY - top, 20, height - 20);
        } else {
          const above = rect.top - gap - height;
          const below = rect.bottom + gap;
          const useAbove = above >= minY || (below + height > maxY && rect.top - minY > maxY - rect.bottom);
          top = useAbove ? above : below;
          side = useAbove ? "bottom" : "top";
          arrow = clamp(centerX - left, 20, width - 20);
        }
        const visible = rect.bottom > minY && rect.top < maxY && rect.right > minX && rect.left < maxX;
        const next = { left: Math.round(left), top: Math.round(top), arrow: Math.round(arrow), side, visible };
        setPosition(previous => previous && Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
      }
      // Follow nested scrolling, sheet animations, layout changes, and the mobile keyboard.
      frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [step, composerReady]);

  const content = [
    { eyebrow: "1 of 3 · Make an order", title: "Bring on the lumber lingo.", body: composerReady ? "Now tap Run. We'll do the decoding; you keep the coffee. Or hit Next to explore a saved sample." : "No contractor text handy? Tap Generate. We'll supply the typos. You can also paste your own order, then tap Run.", mobileTitle: "Make an order", mobileBody: composerReady ? "Tap Run to match your order." : "Paste an order or tap Generate, then Run." },
    { eyebrow: "2 of 3 · Make the call", title: "Even AI needs safety glasses.", body: "Check a flagged line and choose the product that fits, confirm the quantity, or select Not in catalog. The glowing choices are yours to make. No rubber stamp required.", mobileTitle: "Check a flagged line", mobileBody: "Choose a product, confirm quantity, or tap Not in catalog." },
    { eyebrow: "3 of 3 · Compare the savings", title: "Less waiting. More lumber.", body: "Tap Claude + Jev and Claude only to compare cost and time for this order. Your calculator can take a coffee break.", mobileTitle: "Compare cost & time", mobileBody: "Tap Claude + Jev and Claude only to compare." },
  ][step];

  return (
    <>
      <div className="walkthrough-backdrop fixed inset-0 z-40 bg-black/35" aria-hidden />
      <section ref={cardRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="walkthrough-title" aria-describedby="walkthrough-body" data-side={position?.side} className="walkthrough-card fixed z-50 rounded-2xl outline-none bg-panel shadow-2xl" style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position?.visible ? "visible" : "hidden", "--walkthrough-arrow": `${position?.arrow ?? 20}px` } as CSSProperties}>
        <span className="walkthrough-arrow" aria-hidden />
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted"><span className="lg:hidden">{step + 1} of 3</span><span className="hidden lg:inline">{content.eyebrow}</span></p>
          <button onClick={onClose} aria-label="Close walkthrough" className="-mr-2 -mt-1 grid h-11 w-11 place-items-center rounded-lg text-xl leading-none text-muted hover:bg-bg hover:text-ink">×</button>
        </div>
        <h2 id="walkthrough-title" className="text-[15px] font-semibold tracking-tight lg:mt-2 lg:text-lg"><span className="lg:hidden">{content.mobileTitle}</span><span className="hidden lg:inline">{content.title}</span></h2>
        <p id="walkthrough-body" className="mt-1 text-[13px] leading-snug text-muted lg:mt-1.5 lg:text-[14px] lg:leading-relaxed"><span className="lg:hidden">{content.mobileBody}</span><span className="hidden lg:inline">{content.body}</span></p>
        <div className="mt-2 flex items-center justify-between gap-3 lg:mt-4">
          <button onClick={onBack} disabled={step === 0} className="h-11 rounded-lg px-3 text-[13px] font-medium text-muted hover:bg-bg hover:text-ink disabled:invisible">Back</button>
          <button onClick={onNext} className="h-11 rounded-lg bg-brand px-4 text-[13px] font-semibold text-onbrand">{step === 2 ? <><span className="lg:hidden">Done</span><span className="hidden lg:inline">Let&apos;s get to work</span></> : "Next"}</button>
        </div>
      </section>
    </>
  );
}


type Thresholds = { mode: Mode; T: number; unitMin: number; setT: (v: number) => void; setUnitMin: (v: number) => void };

function SettingsButton({ open, changed, onToggle }: { open: boolean; changed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="settings"
      aria-label={changed ? "Settings (thresholds changed)" : "Settings"}
      title="Settings"
      className={`relative grid h-11 w-11 place-items-center rounded-full transition-colors lg:h-8 lg:w-8 ${open ? "bg-panel text-ink shadow-[0_0_0_1px_var(--ring)]" : "text-muted hover:bg-panel hover:text-ink"}`}
    >
      <SlidersIcon />
      {changed && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--warn-line)]" aria-hidden />}
    </button>
  );
}

const SlidersIcon = () => (
  <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2.5 4.5h11M2.5 11.5h11" />
    <circle cx="6" cy="4.5" r="1.8" fill="var(--panel)" />
    <circle cx="10.5" cy="11.5" r="1.8" fill="var(--panel)" />
  </svg>
);

/** Review thresholds and onboarding controls, rendered inside the settings dialog. */
function SettingsSection(p: Thresholds & { changed: boolean; onReplay: () => void }) {
  return (
    <section id="settings" aria-label="Review thresholds" className="mt-5">
      <h3 className="text-[15px] font-semibold">Review thresholds</h3>
      <p className="mt-1 text-[13px] text-muted">
        {p.mode === "claude" ? "Claude only has no thresholds: it approves its own “high” ratings." : "Higher = the rep checks more lines. Lines re-route instantly; no new API calls."}
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <Slider id="t" label="Product confidence" value={p.T} min={0.5} max={0.99} onChange={p.setT} disabled={p.mode === "claude"} />
        <Slider id="u" label="Quantity clarity" value={p.unitMin} min={0.3} max={0.9} onChange={p.setUnitMin} disabled={p.mode === "claude"} />
      </div>
      <ShortcutsToggle />
      <button
        onClick={() => {
          p.setT(DEFAULT_T);
          p.setUnitMin(DEFAULT_UNIT);
        }}
        disabled={!p.changed}
        className="mt-4 text-[13px] text-muted underline hover:text-ink disabled:no-underline disabled:opacity-40"
      >
        Reset to defaults
      </button>
      <ThemeChoice />
      <button onClick={p.onReplay} className="mt-5 w-full rounded-lg bg-panel px-3 py-2 text-left text-[13px] font-medium shadow-[0_0_0_1px_var(--ring)] hover:bg-panel2">
        Replay walkthrough
      </button>
    </section>
  );
}

function SettingsDialog(p: Thresholds & { changed: boolean; onReplay: () => void; onClose: () => void }) {
  const dialogRef = useDialog<HTMLElement>(p.onClose);
  return (
    <ModalPortal>
      <div className="action-sheet-backdrop fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
        <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="settings-title" className="action-sheet-dialog outline-none w-full max-w-md rounded-2xl border border-line bg-panel p-5 shadow-2xl sm:p-6">
          <div className="action-sheet-handle" aria-hidden />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Counterpart</p>
              <h2 id="settings-title" className="mt-1 text-xl font-semibold tracking-tight">Settings</h2>
            </div>
            <button onClick={p.onClose} aria-label="Close settings" className="-mr-2 -mt-2 rounded-lg px-2 py-1 text-xl leading-none text-muted hover:bg-bg hover:text-ink">×</button>
          </div>
          <SettingsSection {...p} />
          <button onClick={p.onClose} className="mt-6 h-9 rounded-lg bg-brand px-4 text-[13px] font-semibold text-onbrand">Done</button>
        </section>
      </div>
    </ModalPortal>
  );
}

function ModalPortal({ children }: { children: React.ReactNode }) {
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}

function ShortcutsToggle() {
  // Rendered only when Settings is open, so reading storage here is client-side only.
  const [on, setOn] = useState(() => shortcutsEnabled());
  return (
    <label className="mt-4 flex items-start gap-2.5 text-[13px]">
      <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); setShortcutsEnabled(e.target.checked); }} className="mt-0.5 h-4 w-4 accent-[var(--ink)]" />
      <span><span className="font-medium">Keyboard shortcuts</span> <span className="text-muted">Single-key shortcuts in the review. Turn off if they get in the way of speech input or assistive technology.</span></span>
    </label>
  );
}

/** Light / Dark / System. Rendered only when Settings is open, so reading storage here is client-side only. */
function ThemeChoice() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const label: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };
  return (
    <fieldset className="mt-5 border-t border-line pt-4">
      <legend className="sr-only">Theme</legend>
      <p className="mb-2 text-[13px] font-medium text-muted" aria-hidden>
        Theme
      </p>
      <div className="inline-flex gap-1 rounded-xl bg-panel p-1 text-[13px] shadow-[0_0_0_1px_var(--ring)]" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={theme === t}
            onClick={() => {
              setTheme(t);
              applyTheme(t);
            }}
            className={`h-8 rounded-lg px-3 font-medium ${theme === t ? "bg-ink text-bg" : "text-muted hover:bg-bg hover:text-ink"}`}
          >
            {label[t]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const DiceIcon = () => (
  <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
    <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
    <circle cx="5.8" cy="5.8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="10.2" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

function SidebarButton({ label, expanded, onClick }: { label: string; expanded: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls="orders"
      aria-label={label}
      title={`${label} (⌘B)`}
      className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-bg hover:text-ink lg:h-9 lg:w-9"
    >
      <SidebarIcon />
    </button>
  );
}

const SidebarIcon = () => (
  <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M6 2.5v11" />
  </svg>
);

function OrderGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <h2 className="px-2 pb-1.5 pt-3 text-[12px] font-medium uppercase tracking-wider text-muted">{label}</h2>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function OrderItem(p: { id: string; tag: string; title: string; preview: string; count: number; sent: boolean; active: boolean; onPick: (id: string) => void }) {
  const preview = p.preview.replace(/\s+/g, " ").trim();
  return (
    <li>
      <button
        onClick={() => p.onPick(p.id)}
        aria-current={p.active ? "true" : undefined}
        className={`flex w-full items-center gap-3 rounded-r-lg px-2.5 py-2 text-left ${p.active ? "bg-bg shadow-[inset_3px_0_0_var(--brand)]" : "hover:bg-bg"}`}
      >
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14px] ${p.active ? "font-semibold" : "font-medium"}`}>{p.title}</span>
          <span className="block truncate text-[12px] text-muted">
            <span className="font-mono">{p.tag}</span> · {preview}
          </span>
        </span>
        {p.sent ? (
          <span className="shrink-0 text-[12px] font-medium text-ok">Sent</span>
        ) : p.count > 0 ? (
          <span className="shrink-0 rounded-full bg-warnbg px-2 py-0.5 text-[12px] font-medium leading-none text-warn"><span aria-hidden>{p.count}</span><span className="sr-only">{p.count} to check</span></span>
        ) : (
          <span className="shrink-0 text-ok"><span aria-hidden><Check /></span><span className="sr-only">Nothing to check</span></span>
        )}
      </button>
    </li>
  );
}

type Decisions = Record<string, string>; // lineId -> sku chosen by the rep

function OrderDetails({ result, isLive, mode, notes, lines, flagged, done, sentAt, onSend }: { result: OrderResult; isLive: boolean; mode: Mode; notes: string; lines: number; flagged: number; done: number; sentAt?: number; onSend: () => void }) {
  const title = isLive ? "Your order" : `Order ${result.orderId}`;
  const readyToSend = !sentAt && flagged === done;
  const stats = [
    { label: "Lines", value: lines, suffix: "", className: "text-ink" },
    { label: "Auto-approved", value: lines - flagged, suffix: "", className: "text-ok" },
    { label: "To check", value: Math.max(0, flagged - done), suffix: "", className: "text-warn" },
  ];
  return (
    <div className="mb-6 rounded-xl border border-line bg-panel px-4 py-3 shadow-[0_0_0_1px_var(--ring)]" aria-live="polite">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-4 sm:gap-y-3">
        <div className="contents sm:flex sm:min-w-0 sm:flex-wrap sm:items-center sm:gap-4">
          <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight">{title}</h1>
          <div className="col-span-2 row-start-2 grid grid-cols-3 divide-x divide-line rounded-lg bg-bg py-2 sm:flex sm:items-center sm:px-1 sm:py-1">
            {stats.map((stat) => <span key={stat.label} className={`flex min-w-0 flex-col items-center gap-0.5 px-1 text-[18px] font-semibold sm:block sm:px-3 sm:text-[13px] sm:font-medium ${stat.className}`}>{stat.value}{stat.suffix} <span className="text-[11px] font-normal text-muted sm:text-[13px]">{stat.label}</span></span>)}
          </div>
        </div>
        <button
          id="send-order"
          onClick={onSend}
          disabled={!readyToSend}
          title={readyToSend ? undefined : sentAt ? "This order has been sent" : `${flagged - done} ${flagged - done === 1 ? "line" : "lines"} still to check`}
          className="col-start-2 row-start-1 ml-auto h-11 shrink-0 whitespace-nowrap rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-onbrand transition-opacity disabled:cursor-not-allowed disabled:opacity-50 sm:h-9"
        >
          {sentAt ? "Sent" : "Send order"}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-t border-line pt-3 sm:flex sm:flex-wrap sm:gap-y-1">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg text-[11px] font-semibold text-ink" aria-hidden>
          {result.from ? result.from.name.split(" ").map((w) => w[0]).join("").slice(0, 2) : "C"}
        </span>
        <span className="min-w-0 break-words text-[14px]">
          <span className="block font-semibold sm:inline">{result.from?.name ?? "Contractor"}</span>
          {result.from && <span className="block text-[13px] text-muted sm:inline sm:text-[14px]"><span className="hidden sm:inline"> · </span>{result.from.company}</span>}
        </span>
        <span className="col-start-2 whitespace-nowrap text-[12px] text-muted sm:ml-auto sm:text-[13px]">{mode === "jev" ? "Claude + Jev" : "Claude only"}</span>
        {notes && <p className="col-span-2 min-w-0 break-words border-t border-line pt-3 text-[14px] leading-relaxed text-muted sm:basis-full sm:border-t-0 sm:pt-1">“{notes}”</p>}
      </div>
    </div>
  );
}

function Review({ result, isLive, mode, T, unitMin, catalog, resolved, setResolved, sentAt, onSend, onReopen, onReviewed }: {
  result: OrderResult; isLive: boolean; mode: Mode; T: number; unitMin: number; catalog: SlimCatalog;
  resolved: Decisions; setResolved: (f: (r: Decisions) => Decisions) => void;
  sentAt?: number; onSend: () => void; onReopen: () => void;
  onReviewed: () => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const lines = useMemo(() => computeView(result, mode, T, catalog, unitMin), [result, mode, T, catalog, unitMin]);
  // Unmatched lines need triage before product or quantity checks, so keep them at the top of the review list.
  // The original `lines` order stays intact for reconstructing the contractor's message above the list.
  const orderedLines = useMemo(() => [...lines].sort((a, b) => Number(b.sku === NONE) - Number(a.sku === NONE)), [lines]);
  const flagged = orderedLines.filter((l) => !l.approved);
  const done = flagged.filter((l) => resolved[l.id]).length;
  const pending = flagged.filter((l) => !resolved[l.id]);
  const validated = orderedLines.filter((l) => l.approved || (resolved[l.id] && resolved[l.id] !== NONE));
  const excluded = flagged.filter((l) => resolved[l.id] === NONE);
  const current = pending.find((l) => l.id === active)?.id ?? pending[0]?.id ?? null;

  // A decision removes the button that had focus, so move it on instead of dropping to <body>.
  const focusAfter = useRef<"next" | string | null>(null);
  const choose = useCallback((lineId: string, sku: string) => {
    focusAfter.current = "next";
    trackEvent("order_line_reviewed", { mode, decision: sku === NONE ? "not_in_catalog" : "product" });
    setResolved((r) => ({ ...r, [lineId]: sku }));
    onReviewed();
  }, [mode, setResolved, onReviewed]);
  const undo = (lineId: string) => {
    focusAfter.current = lineId;
    setActive(lineId);
    setResolved((r) => Object.fromEntries(Object.entries(r).filter(([id]) => id !== lineId)));
  };

  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const id = target === "next" ? flagged.find((l) => !resolved[l.id])?.id : target;
    const el = id ? document.getElementById(`line-${id}`) : document.getElementById("send-order");
    (el ?? document.getElementById("review"))?.focus({ preventScroll: false });
  }, [resolved, flagged]);

  // keyboard: j/k move between flagged lines, 1-3 pick an option, Enter accepts the top pick, x = not in catalog.
  // After a decision the cursor moves to the next line that still needs one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.closest("textarea, select") || (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range");
      // Only inside the review (or with nothing focused), and only while the Settings toggle is on.
      const inReview = t === document.body || !!t.closest("#review");
      if (typing || !inReview || !shortcutsEnabled() || sentAt || e.metaKey || e.ctrlKey || e.altKey) return;
      const ids = pending.map((l) => l.id);
      const i = current ? ids.indexOf(current) : -1;
      const line = flagged.find((l) => l.id === current);
      const decide = (sku: string) => {
        if (!line || resolved[line.id]) return false; // already decided: use Undo to change
        choose(line.id, sku);
        const next = flagged.find((l) => l.id !== line.id && !resolved[l.id] && ids.indexOf(l.id) > i) ?? flagged.find((l) => l.id !== line.id && !resolved[l.id]);
        setActive(next?.id ?? line.id);
        return true;
      };
      if (e.key === "j" && ids.length) setActive(ids[Math.min(ids.length - 1, i + 1)]);
      else if (e.key === "k" && ids.length) setActive(ids[Math.max(0, i - 1)]);
      else if (line && !line.quantityOnly && /^[1-4]$/.test(e.key) && displayChoices(line)[Number(e.key) - 1]) decide(displayChoices(line)[Number(e.key) - 1].sku);
      else if (line && e.key === "Enter" && t.tagName !== "BUTTON") decide(line.sku);
      else if (line && e.key === "x") decide(NONE);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flagged, pending, current, choose, resolved, sentAt]);

  useEffect(() => {
    if (!active) return; // only follow the cursor after the rep moves it, not on first load
    const el = document.getElementById(`line-${active}`);
    const r = el?.getBoundingClientRect();
    if (el && r && (r.top < 160 || r.bottom > window.innerHeight)) el.scrollIntoView({ block: "nearest" });
  }, [active]);


  // What the contractor wrote besides the order lines (greetings, delivery notes), shown with the sender.
  // If order lines sit inside sentences ("We need 30 2x4x8 and 12 2x6x8"), cutting them out would leave
  // broken text, so the whole message is shown instead.
  const notes = useMemo(() => {
    const segs = segmentText(result.text, lines);
    const inline = segs.some((seg, i) => {
      if (!seg.lineId) return false;
      const before = (segs[i - 1]?.text ?? "\n").split("\n").pop()!.trim();
      const after = (segs[i + 1]?.text ?? "\n").split("\n")[0].trim();
      return before !== "" || after !== "";
    });
    if (inline) return result.text.replace(/\s+/g, " ").trim();
    return segs
      .filter((seg) => !seg.lineId)
      .map((seg) => seg.text.replace(/\s+/g, " ").trim())
      .filter((t) => /[a-z]{2}/i.test(t))
      .join(" ")
      .trim();
  }, [result, lines]);
  const status = (l: ViewLine) => (l.approved ? "ok" : resolved[l.id] ? "done" : "flag");

  return (
    <>
      {pending.length > 0 && (
        <a href={`#line-${pending[0].id}`} className="sr-only focus:not-sr-only focus:mb-2 focus:inline-block focus:rounded focus:bg-panel focus:px-2 focus:py-1">
          Skip to the first line to check
        </a>
      )}
      <OrderDetails
        result={result}
        isLive={isLive}
        mode={mode}
        notes={notes}
        lines={lines.length}
        flagged={flagged.length}
        done={done}
        sentAt={sentAt}
        onSend={onSend}
      />


      {/* Sending is mocked: it only marks the order as sent in this browser tab */}
      {!!sentAt && (
        <div role="status" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-okbg px-5 py-3.5">
          <span className="text-ok"><Check /></span>
          <p className="flex-1 font-medium text-ok">
            Sent to {result.from?.name ?? "the contractor"} at {new Date(sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            <span className="block text-[13px] font-normal text-muted">Demo only: nothing was actually sent.</span>
          </p>
          <button onClick={onReopen} className="text-[13px] text-muted underline hover:text-ink">Reopen</button>
        </div>
      )}

      <section aria-label="Order" inert={!!sentAt} className={sentAt ? "opacity-70" : ""}>
        <div className="space-y-5">
          {[
            ...(pending.length ? [{ id: "needs-review", title: "Needs review", description: "Confirm a product and quantity for each item.", items: pending, color: "bg-panel text-warn", empty: "" }] : []),
            { id: "validated-items", title: "Validated items", description: "Auto-approved or checked by you.", items: validated, color: "bg-panel text-ok", empty: "Validated items will appear here as you confirm them." },
            ...(excluded.length ? [{ id: "excluded-items", title: "Not in catalog", description: "Items skipped by you.", items: excluded, color: "bg-bg text-muted", empty: "" }] : []),
          ].map((group) => (
            <section key={group.id} aria-labelledby={group.id} className="card overflow-hidden">
              <header className={`border-b border-line px-4 py-3 sm:px-6 ${group.color}`}>
                <div className="flex items-center justify-between gap-3">
                  <h2 id={group.id} className="text-[14px] font-semibold">{group.title}</h2>
                  <span className="rounded-full bg-line/50 px-2.5 py-0.5 font-mono text-[12px]" aria-label={`${group.items.length} items`}>{group.items.length}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-muted">{group.description}</p>
              </header>
              {group.items.length ? (
                <ul>
                  {group.items.map((l) => (
                    <LineRow key={l.id} l={l} state={status(l)} pick={resolved[l.id]} active={current === l.id} catalog={catalog} onSelect={() => setActive(l.id)} onChoose={(sku) => choose(l.id, sku)} onUndo={() => undo(l.id)} />
                  ))}
                </ul>
              ) : <p className="px-4 py-5 text-[13px] text-muted sm:px-6">{group.empty}</p>}
            </section>
          ))}
        </div>
      </section>
    </>
  );
}

function Slider(p: { id: string; label: string; value: number; min: number; max: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className="w-full">
      <label htmlFor={p.id} className="mb-1.5 flex justify-between text-[13px] font-medium text-muted">
        <span>{p.label}</span>
        <span className="text-ink">{p.value.toFixed(2)}</span>
      </label>
      <input id={p.id} type="range" min={p.min} max={p.max} step={0.01} value={p.value} aria-valuetext={`${Math.round(p.value * 100)}%`} disabled={p.disabled} onChange={(e) => p.onChange(Number(e.target.value))} className="h-7 w-full accent-[var(--ink)] disabled:opacity-40" />
    </div>
  );
}

function LineRow(props: { l: ViewLine; state: "ok" | "done" | "flag"; pick?: string; active: boolean; catalog: SlimCatalog; onSelect: () => void; onChoose: (sku: string) => void; onUndo: () => void }) {
  const { l, state, pick, active, catalog } = props;
  const [showAll, setShowAll] = useState(false);
  const sellUnit = catalog[l.sku]?.unit;
  const qty = fmtQty(l.qty, sellUnit ?? l.unit);

  if (state === "flag") {
    const shown = displayChoices(l);
    const quick = l.quantityOnly && !showAll;
    // On a line to check, show the quantity as the customer wrote it. If their unit differs from how the
    // product is sold ("50 lb" of nails sold by the box), say both rather than silently converting.
    const asked = l.unit && sellUnit && unitKey(l.unit) !== unitKey(sellUnit) ? `${fmtQty(l.qty, l.unit)} · sold per ${sellUnit === "each" ? "piece" : sellUnit}` : qty;
    return (
      <li id={`line-${l.id}`} tabIndex={-1} onClick={props.onSelect} className={`outline-none scroll-mt-44 scroll-mb-8 border-b border-line bg-panel px-6 py-5 last:border-b-0 ${active ? "tour-choice" : ""}`} style={{ borderLeft: `${active ? 8 : 4}px solid var(--warn-line)` }}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <span className="font-mono text-[14px] font-medium">
            <span className="sr-only">Check this: </span>
            {l.raw}
          </span>
          <span className="text-[14px] text-muted">{asked}</span>
        </div>
        <p className="mt-1.5 text-[14px] text-warn">{l.reasons.join(" ")}</p>
        {quick ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={(e) => { e.stopPropagation(); props.onChoose(l.sku); }} className="review-option tour-option min-h-11 rounded-xl bg-okbg px-4 py-2 text-left font-medium text-ok shadow-[0_0_0_1px_var(--ok)]">
              {active && <kbd className="mr-2 text-xs">Enter</kbd>}Confirm {qty} of {l.name}
            </button>
            <button onClick={(e) => { e.stopPropagation(); props.onChoose(NONE); }} className="review-option tour-option min-h-11 rounded-xl bg-panel px-4 py-2 font-medium shadow-[0_0_0_1px_var(--control)]" style={{ "--tour-delay": "300ms" } as React.CSSProperties}>
              {active && <kbd className="mr-2 text-xs text-muted">x</kbd>}Not in catalog
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowAll(true); }} className="text-[13px] text-muted underline hover:text-ink">Other products…</button>
          </div>
        ) : (
          <div role="group" aria-label={`Options for ${l.raw}`} className="mt-3 flex flex-col gap-2">
            {/* column header over the confidence cells */}
            {shown.some((o) => o.probability != null) && (
              <div aria-hidden className="-mb-1 flex justify-end px-3.5 text-[12px] font-medium text-muted">
                <span className="w-16 text-center sm:w-24">Confidence</span>
              </div>
            )}
            {shown.map((o, i) => (
              <button
                key={o.sku}
                aria-pressed={pick === o.sku}
                style={{ "--tour-delay": `${i * 300}ms` } as React.CSSProperties}
                onClick={(e) => { e.stopPropagation(); props.onChoose(o.sku); }}
                className={`review-option tour-option flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2 text-left text-ink ${pick === o.sku ? "bg-okbg shadow-[0_0_0_1px_var(--ok)]" : "bg-panel shadow-[0_0_0_1px_var(--control)]"}`}
              >
                <kbd className="w-4 text-center text-xs text-muted">{i + 1}</kbd>
                <span className="min-w-0 flex-1">
                  <span className={i === 0 ? "font-semibold" : ""}>{o.name}</span>
                </span>
                {o.probability != null && (
                  <span className="flex w-16 shrink-0 items-center justify-center self-stretch sm:w-24 border-l border-line text-[14px] text-muted">
                    <span className="sr-only">confidence </span>
                    {Math.round(o.probability * 100)}%
                  </span>
                )}
                {o.probability == null && i === 0 && <span className="text-xs text-muted">Claude: {l.confidence}</span>}
              </button>
            ))}
          </div>
        )}
      </li>
    );
  }

  const chosen = state === "done" ? (pick === NONE ? "Not in catalog" : (catalog[pick!]?.name ?? pick)) : l.name;
  return (
    <li id={`line-${l.id}`} tabIndex={-1} onClick={props.onSelect} className={`outline-none scroll-mt-44 border-b border-line last:border-b-0 ${active ? "bg-bg" : ""}`}>
      <div className="flex min-h-14 items-center gap-3 px-6 py-3">
        <span className={state === "done" && pick === NONE ? "text-warn" : "text-ok"}>{state === "done" ? <Person /> : <Check />}</span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-ink">{chosen}</span>
          <span className="block font-mono text-[13px] text-muted">{l.raw}</span>
        </span>
        <span className="shrink-0 text-[14px] text-muted">{qty}</span>
        {state === "done" && (
          <>
            <span className="shrink-0 text-[13px] text-muted">{pick === NONE ? "skipped by you" : "checked by you"}</span>
            <button className="shrink-0 text-[13px] underline" onClick={props.onUndo}>Undo</button>
          </>
        )}
      </div>
    </li>
  );
}

type Side = { key: Mode; label: string; matcher: string; t: ReturnType<typeof totals>; approved: number; lines: number };
const PER = 10_000;

function CostPanel({ result, samples, mode, T, unitMin, catalog, onMode, setT, setUnitMin, onReplay }: { result: OrderResult; samples: OrderResult[]; mode: Mode; T: number; unitMin: number; catalog: SlimCatalog; onMode: (m: Mode) => void; setT: (v: number) => void; setUnitMin: (v: number) => void; onReplay: () => void }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const changed = T !== DEFAULT_T || unitMin !== DEFAULT_UNIT;
  const a = computeView(result, "jev", T, catalog, unitMin);
  const b = computeView(result, "claude", T, catalog);
  const n = result.parse.lines.length;
  const sides: Side[] = [
    { key: "jev", label: "Claude + Jev", matcher: "Jev", t: totals(result, "jev"), approved: a.filter((l) => l.approved).length, lines: n },
    { key: "claude", label: "Claude only", matcher: "Claude", t: totals(result, "claude"), approved: b.filter((l) => l.approved).length, lines: n },
  ];
  const maxUsd = Math.max(...sides.map((x) => x.t.usd));
  const [jev, cla] = sides;
  const cheaper = cla.t.usd / jev.t.usd;
  const diff = a.filter((l, i) => l.sku !== b[i].sku);
  const per10k = (usdPerOrder: number) => `$${(usdPerOrder * PER).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

  return (
    <div className="flex flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
        <h2 className="text-[15px] font-semibold">Cost</h2>
        <div className="flex items-center gap-0.5 rounded-full border border-line bg-bg p-0.5 shadow-[0_0_0_1px_var(--ring)] transition-colors hover:bg-panel">
          <ResultsButton />
          <SettingsButton open={settingsOpen} changed={changed} onToggle={() => setSettingsOpen((v) => !v)} />
          <button
            onClick={() => setHelpOpen(true)}
            aria-label="About Counterpart"
            title="About Counterpart"
            className="grid h-11 w-11 place-items-center rounded-full text-[13px] font-semibold text-muted transition-colors hover:bg-panel lg:h-8 lg:w-8 hover:text-ink"
          >
            ?
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-4 p-5">
        {settingsOpen && <SettingsDialog mode={mode} T={T} unitMin={unitMin} setT={setT} setUnitMin={setUnitMin} changed={changed} onReplay={() => { setSettingsOpen(false); onReplay(); }} onClose={() => setSettingsOpen(false)} />}
        {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}

        <div className="rounded-xl bg-brandsoft px-4 py-3">
          <p className="font-mono text-base font-semibold">{cheaper.toFixed(1)}× lower cost per order</p>
          <p className="mt-1 text-[12px] text-muted">{usd(jev.t.usd)} vs {usd(cla.t.usd)} · single run, results vary</p>
        </div>

        {sides.map((x) => (
          <button
            key={x.key}
            onClick={() => onMode(x.key)}
            aria-pressed={mode === x.key}
            className={`tour-compare card p-4 text-left ${mode === x.key ? "!shadow-[0_0_0_1px_var(--ink)]" : "hover:!shadow-[0_0_0_1px_var(--control)]"}`}
            style={{ "--tour-delay": x.key === "jev" ? "0ms" : "600ms" } as React.CSSProperties}
          >
          <div className="flex items-center justify-between gap-2 text-[14px]">
            <span className={`font-semibold ${x.key === "jev" ? "text-branddeep" : "text-ink"}`}>{x.label}</span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-lg font-medium tracking-tight">{usd(x.t.usd)}</span>
            <span className="font-mono text-[12px] text-muted">{ms(x.t.ms)}</span>
          </div>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full" style={{ background: "var(--line)" }} aria-hidden>
            <span style={{ width: `${(100 * x.t.parseUsd) / maxUsd}%`, background: "var(--reading)" }} />
            <span style={{ width: `${(100 * x.t.matchUsd) / maxUsd}%`, background: "var(--matching)" }} />
          </div>
          <dl className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-[12px]">
            <dt className="flex items-center gap-2 text-muted">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--reading)" }} />
              Reading
            </dt>
            <dd className="text-right font-mono">{usd(x.t.parseUsd)}</dd>
            <dd className="text-right font-mono text-muted">{ms(x.t.parseMs)}</dd>
            <dt className="flex items-center gap-2 text-muted">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--matching)" }} />
              Matching
            </dt>
            <dd className="text-right font-mono">{usd(x.t.matchUsd)}</dd>
            <dd className="text-right font-mono text-muted">{ms(x.t.matchMs)}</dd>
            <dt className="text-muted">Auto-approved</dt>
            <dd className="col-span-2 text-right font-mono">{x.approved} / {x.lines}</dd>
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-2.5 text-[12px]">
            <span className="text-muted">Per 10,000 orders<small className="block text-[11px]">this order × 10,000</small></span>
            <span className="font-mono text-[14px] font-medium">{per10k(x.t.usd)}</span>
          </div>
          </button>
        ))}

        <Link href="/results" className="flex min-h-11 items-center px-1 text-[13px] font-medium underline underline-offset-2">
          See results on all {samples.length} sample orders →
        </Link>

        <p className="px-1 text-[12px] text-muted">
          {diff.length ? `They pick different products on ${diff.length} line${diff.length > 1 ? "s" : ""}: ${diff.map((l) => `“${l.raw}”`).join(", ")}.` : "Both pick the same product on every line."}
        </p>
        <p className="px-1 text-[11px] leading-relaxed text-muted">
          Claude at ${(CLAUDE_INPUT_PER_TOKEN * 1e6).toFixed(0)} / ${(CLAUDE_OUTPUT_PER_TOKEN * 1e6).toFixed(0)} per million tokens in / out (list price); Jev at ${(JEV_INPUT_PER_TOKEN * 1e9).toFixed(0)} per billion input tokens. Times are from one run. Synthetic data.
        </p>
      </div>
    </div>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialog<HTMLElement>(onClose);
  return (
    <ModalPortal>
      <div className="action-sheet-backdrop fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="help-title" className="action-sheet-dialog outline-none w-full max-w-3xl rounded-2xl border border-line bg-panel p-5 shadow-2xl sm:p-6">
          <div className="action-sheet-handle" aria-hidden />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Counterpart</p>
              <h2 id="help-title" className="mt-1 text-xl font-semibold tracking-tight">The fast lane for Pro orders</h2>
            </div>
            <button onClick={onClose} aria-label="Close help" className="-mr-2 -mt-2 rounded-lg px-2 py-1 text-xl leading-none text-muted hover:bg-bg hover:text-ink">×</button>
          </div>
          <div className="mt-5 grid gap-6 text-[14px] leading-relaxed text-muted md:grid-cols-2 md:gap-8">
            <div className="space-y-4">
              <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink">Meet Pros where they order</h3>
              <p><span className="font-medium text-ink">The common path:</span> Many everyday orders start with a phone call or quick message to the counter. Counterpart turns the rep&apos;s notes or pasted request into a catalog-matched draft.</p>
              <p><span className="font-medium text-ink">The benefit:</span> The Pro avoids re-keying an order or learning another interface, while your team gets a structured order to review instead of working from messy shorthand.</p>
              <p><span className="font-medium text-ink">Skip the storefront when it makes sense:</span> Detailed quotes and complex orders can follow the full ordering workflow, while routine requests move straight from the channels Pros already use into a review-ready draft.</p>
            </div>
            <div className="space-y-4 border-t border-line pt-5 md:border-l md:border-t-0 md:pl-8 md:pt-0">
              <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink">How the comparison works</h3>
              <p><span className="font-medium text-ink">Claude + Jev:</span> Claude reads the message and extracts the order lines. Jev then evaluates each line against a short catalog shortlist, checking the category, product, and quantity clarity.</p>
              <p><span className="font-medium text-ink">Claude only:</span> Claude reads the same order, then matches each line against the full catalog in one comparison pass. Both views use the same order and catalog context.</p>
              <p><span className="font-medium text-ink">The savings:</span> The headline compares the whole order cost. In both bars, grey is reading and the accent is matching, on the same scale. “Per 10,000 orders” scales this run&apos;s total cost.</p>
            </div>
          </div>
          <button onClick={onClose} className="mt-6 h-9 rounded-lg bg-brand px-4 text-[13px] font-semibold text-onbrand">Got it</button>
        </section>
      </div>
    </ModalPortal>
  );
}
