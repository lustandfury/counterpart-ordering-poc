"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useThresholds } from "@/lib/settings";
import { DEFAULT_T, UNIT_OK_MIN as DEFAULT_UNIT } from "@/lib/pipeline/route";
import { trackEvent } from "@/lib/analytics";
import { readOrderStream, type OrderProgress, type OrderStage } from "@/lib/order-progress";
import { OrderLoading } from "@/components/OrderLoading";
import type { OrderResult } from "@/lib/types";
import Link from "next/link";
import { ICON_BUTTON } from "@/components/iconButton";
import { AdjustmentsHorizontalIcon, ArrowLeftEndOnRectangleIcon, CheckIcon, InboxIcon, QuestionMarkCircleIcon, SparklesIcon, UserIcon } from "@heroicons/react/24/outline";
import { setShortcutsEnabled, shortcutsEnabled } from "@/lib/shortcuts";
import { ActionSheet } from "@/components/ActionSheet";
import { ModalCloseButton } from "@/components/ModalCloseButton";
import { ResultsDisplay } from "@/components/ResultsDisplay";
import type { EvalData } from "@/lib/eval/display";
import { useSheetPresence } from "@/components/useSheetPresence";
import { BrandBar, Wordmark } from "@/components/AppNav";
import { useAccess } from "@/components/AccessProvider";
import { generateOrder } from "@/lib/generate";
import { applyTheme, readTheme, THEMES, type Theme } from "@/lib/theme";
import { CLAUDE_INPUT_PER_TOKEN, CLAUDE_OUTPUT_PER_TOKEN, JEV_INPUT_PER_TOKEN } from "@/lib/pricing";
import { computeView, NONE, orderNumber, productChoices, sameQuantityUnit, suggestQuantity, totals, type Mode, type SlimCatalog, type ViewLine } from "@/lib/view";

const usd = (n: number) => `$${n.toFixed(4)}`;
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);

/** How Claude + Jev compares with Claude only on this order's AI cost and time. One place, so the header and the cost panel agree. */
function savings(result: OrderResult) {
  const jev = totals(result, "jev");
  const claude = totals(result, "claude");
  return {
    cheaper: claude.usd / jev.usd,
    // negative when Jev is slower on this order
    timeSaved: jev.ms > 0 && claude.ms > 0 ? Math.round((1 - jev.ms / claude.ms) * 100) : null,
    jevUsd: jev.usd,
    claudeUsd: claude.usd,
  };
}
const speedLine = (saved: number) => saved === 0 ? "same speed" : `${Math.abs(saved)}% ${saved < 0 ? "slower" : "faster"}`;

const Person = () => <UserIcon aria-hidden className="h-4 w-4 shrink-0" />;

const Check = () => <CheckIcon aria-hidden strokeWidth={2} className="h-4 w-4 shrink-0" />;

function fmtQty(qty: number | null, unit: string | null) {
  if (qty == null) return "no quantity";
  if (!unit) return String(qty);
  const u = unit === "each" ? "pcs" : qty === 1 || /s$|^(feet|ft|lb|kg|m|mm|l|ml|sq)$/i.test(unit) ? unit : /(x|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`;
  return `${qty} ${u}`;
}


type Run = OrderResult & { runId: number };

/** A copy of a record without one key. */
const without = <T,>(record: Record<string, T>, key: string) => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const money = (n: number) => cad.format(n);
// Sales tax on the order total. The demo has no province, so it assumes Ontario's 13% HST.
const SALES_TAX = { label: "HST", rate: 0.13 };
const cents = (n: number) => Math.round(n * 100) / 100;
// "$4.27 / pc", "$18.50 / sheet"
const perUnit = (price: number, unit: string) => `${money(price)} / ${unit === "each" ? "pc" : unit}`;

/**
 * The price of a line for a product (the rep's pick, else the pipeline's). The line total needs a quantity in the
 * unit the product is sold in: "50 lb" of nails sold by the box has a unit price but no total until the rep sets one.
 * An auto-approved line already passed the quantity check against the selling unit, so its quantity is used as is.
 */
function linePrice(l: ViewLine, pick: string | undefined, catalog: SlimCatalog, quantity?: number) {
  const product = catalog[pick ?? l.sku];
  if (!product || (pick ?? l.sku) === NONE) return null;
  const qty = quantity ?? l.qty;
  const usable = quantity != null || (l.approved && !pick) || sameQuantityUnit(l.unit, product.unit);
  return { unit: perUnit(product.price, product.unit), total: qty != null && usable ? qty * product.price : null };
}

const DEFAULT_SAMPLE = "o13";
// The queue starts with one order, which arrives as the page opens. Others come from Generate order or Sample results.
const SAMPLES_SHOWN = 1;
// Optional address for deletion requests, set in the environment so no personal address lives in the repo
const PRIVACY_CONTACT = process.env.NEXT_PUBLIC_PRIVACY_CONTACT;
const ago = (minutes: number) => (minutes < 1 ? "Just now" : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`);
const MOBILE_QUERY = "(max-width: 1023px)";
const subscribeToMobile = (callback: () => void) => {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};

// First load: the centre waits on an empty state, then the first order lands in the queue for the rep to open.
const QUEUED_MS = 700;
// Module scope survives client-side navigation, so coming back from Sample results doesn't replay the arrival.
let firstArrivalShown = false;

export function ReviewApp({ samples, catalog, initialOrder, evalData }: { samples: OrderResult[]; catalog: SlimCatalog; initialOrder?: string; evalData: EvalData }) {
  const [runs, setRuns] = useState<Run[]>([]); // generated orders run live, newest first
  // A generated order joins the queue as soon as its text "arrives"; it becomes a run once both pipelines finish
  const [pending, setPending] = useState<{ orderId: string; from: Run["from"]; text: string; at: number } | null>(null);
  // Generated orders are numbered after the samples (shown as 1001–1020), so the two never collide
  const nextOrderNumber = useRef(Math.max(1000, ...samples.map((s) => Number(orderNumber(s.orderId)) || 0)) + 1);
  // Nothing is open until the rep picks an order from the queue (or follows a link to one)
  const [selected, setSelected] = useState<string | null>(initialOrder ?? null);
  const [mode, setMode] = useState<Mode>("jev");
  const { T, unitMin, setT, setUnitMin } = useThresholds();
  // The orders sidebar is open by default on wide screens and closed on phones, where it opens as a bottom sheet.
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Orders that arrived while the queue was out of sight. Shown as a count on the orders button; opening the queue clears it.
  const [unseen, setUnseen] = useState(0);
  const queueVisible = useRef(false);
  const mobileOrders = useSheetPresence(mobileOpen);
  const [mobileCostOpen, setMobileCostOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const isMobile = useSyncExternalStore(subscribeToMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
  const [loading, setLoading] = useState(false);
  const [orderProgress, setOrderProgress] = useState<Partial<Record<OrderStage, OrderProgress>>>({});
  const [error, setError] = useState<string | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  // The rep's decisions and mock sends, per order, so they survive switching between orders
  const [decisions, setDecisions] = useState<Record<string, Decisions>>({});
  // Quantities the rep set in the product's selling unit, per order and line ("100 feet" of tape -> 1 roll)
  const [quantities, setQuantities] = useState<Record<string, Record<string, number>>>({});
  const [sent, setSent] = useState<Record<string, number>>({}); // order id -> time sent
  // The AI cost rail is closed by default on wide screens: the order is the work, the cost comparison is context.
  const [costOpen, setCostOpen] = useState(false);
  const { unlocked, unlock } = useAccess();
  // Arrival times in the queue are relative to page load, so the default order always arrives "just now".
  const [loadedAt] = useState(() => Date.now());
  const [now, setNow] = useState(loadedAt);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const [unlocking, setUnlocking] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState(false);

  const live = runs.find((r) => `live-${r.runId}` === selected);
  const result: OrderResult | undefined = live ?? samples.find((s) => s.orderId === selected);
  // The sidebar lists only a few samples: the default order first, then the next ones in file order.
  // A sample opened from a link (e.g. from Sample results) is added so the active order is always listed.
  const shownSamples = useMemo(() => {
    const ids = new Set([...new Set([DEFAULT_SAMPLE, ...samples.map((s) => s.orderId)])].filter((id) => samples.some((s) => s.orderId === id)).slice(0, SAMPLES_SHOWN));
    if (initialOrder) ids.add(initialOrder);
    if (selected && samples.some(s => s.orderId === selected)) ids.add(selected);
    return [...ids].map((id) => samples.find((s) => s.orderId === id)!);
  }, [samples, initialOrder, selected]);

  const narrow = () => window.matchMedia("(max-width: 1023px)").matches;
  const toggleSidebar = useCallback(() => {
    if (narrow()) {
      setMobileCostOpen(false);
      setMobileOpen((v) => !v);
    } else setDesktopOpen((v) => !v);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => { if (media.matches) setMobileCostOpen(false); };
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  // Cmd/Ctrl+B toggles the orders sidebar (as in code editors); Escape closes the phone overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "Escape") {
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  useEffect(() => {
    queueVisible.current = isMobile ? mobileOpen : desktopOpen;
    if (queueVisible.current) setUnseen(0);
  }, [isMobile, mobileOpen, desktopOpen]);
  const arrived = useCallback(() => {
    if (!queueVisible.current) setUnseen((n) => n + 1);
  }, []);
  // "empty": waiting for the first order; "queued": it's in the queue. A link straight to an order (?order=) skips the wait.
  const [arrival, setArrival] = useState<"empty" | "queued">(() => (initialOrder || firstArrivalShown ? "queued" : "empty"));
  useEffect(() => {
    if (!unlocked || arrival === "queued") return;
    const queued = window.setTimeout(() => { firstArrivalShown = true; setArrival("queued"); arrived(); }, QUEUED_MS);
    return () => window.clearTimeout(queued);
    // runs once per unlock; the arrival stage only moves forward
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, arrived]);

  const pick = (id: string) => {
    trackEvent("order_selected", { source: id.startsWith("live-") ? "live" : "sample" });
    setSelected(id);
    setMobileOpen(false);
    // hand the keyboard to the review, so Enter / j / k act on lines rather than re-clicking the order
    requestAnimationFrame(() => document.getElementById("review")?.focus({ preventScroll: true }));
  };

  // Generate simulates a new text arriving: a random order is written and run through both pipelines live.
  async function runLive() {
    if (loading) return;
    // Every second generated order has two lines to check, so a visitor always sees one;
    // the first has one, which keeps the first review short
    const order = generateOrder(Math.random, { checks: runs.length % 2 === 1 ? 2 : 1 });
    trackEvent("order_run_started");
    setPending({ orderId: String(nextOrderNumber.current), from: order.from, text: order.text, at: Date.now() });
    setLoading(true);
    setOrderProgress({ access: { stage: "access", status: "running" } });
    setMobileOpen(false);
    requestAnimationFrame(() => document.getElementById("review")?.scrollIntoView({ block: "start" }));
    setError(null);
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ text: order.text }) });
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
      const orderId = String(nextOrderNumber.current++);
      setRuns((r) => [{ ...(data as OrderResult), orderId, from: order.from, runId }, ...r]);
      // it lands in the queue for the rep to open, like any incoming text
      arrived();
    } catch (e) {
      trackEvent("order_run_failed");
      setError(e instanceof Error ? e.message : "The run failed.");
      if (narrow()) setMobileOpen(true);
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

  // lines still to check in an order: flagged by the current rule and not yet decided by the rep
  const toCheck = (r: OrderResult, id: string) => computeView(r, mode, T, catalog, unitMin).filter((l) => !l.approved && !decisions[id]?.[l.id]).length;
  const costPanelProps = result && {
    result, samples, mode, T, unitMin, catalog,
    onResults: () => setResultsOpen(true),
    onMode: (nextMode: Mode) => {
      if (nextMode !== mode) trackEvent("comparison_mode_changed", { mode: nextMode });
      setMode(nextMode);
    },
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div inert={!unlocked || undefined} className={`app-shell relative flex min-h-0 flex-1 [overflow-anchor:none] max-lg:flex-col max-lg:overflow-y-auto ${unlocked ? "app-shell-enter" : "app-shell-locked"}`}>
        {mobileOrders.present && <button data-state={mobileOrders.closing ? "closing" : "open"} aria-label="Close orders" tabIndex={-1} onClick={() => setMobileOpen(false)} className="sheet-fade fixed inset-0 z-20 bg-black/40 lg:hidden" />}
        {/* wide screens: a left sidebar that slides off the left edge when hidden; phones: a bottom sheet over the page */}
        <aside
          id="orders"
          data-state={mobileOrders.closing ? "closing" : "open"}
          onAnimationEnd={event => { if (mobileOrders.closing && event.target === event.currentTarget) mobileOrders.finish(); }}
          aria-label="Orders"
          inert={mobileCostOpen || (!isMobile && !desktopOpen) || undefined}
          className={`tour-orders w-80 shrink-0 flex-col border-r border-line bg-panel lg:flex lg:transition-[margin-left,visibility] lg:duration-300 lg:ease-[cubic-bezier(0.22,1,0.36,1)] lg:motion-reduce:transition-none max-lg:sheet-up max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:mx-auto max-lg:max-h-[85dvh] max-lg:w-full max-lg:rounded-t-2xl max-lg:border-r-0 max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-[0_-8px_30px_rgb(0_0_0/0.18)] ${desktopOpen ? "" : "lg:invisible lg:-ml-80"} ${mobileOrders.present ? "max-lg:flex" : "max-lg:hidden"}`}
        >
              <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line lg:hidden" />
              <BrandBar hideResults end={<><ModalCloseButton label="Hide orders" onClose={toggleSidebar} className="lg:hidden" /><span className="hidden lg:block"><SidebarButton label="Hide orders" expanded onClick={toggleSidebar} /></span></>} />
              <div className="shrink-0 px-4 pb-2 pt-2">
                <GenerateButton loading={loading} onGenerate={runLive} beside={!isMobile} />
              </div>
              {error && <p role="alert" className="mx-5 mb-2 text-[13px] text-warn">{error}</p>}
              <nav aria-label="Incoming orders" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                <ul className="flex flex-col gap-0.5">
                  {pending && (
                    <OrderItem key={`order-${pending.orderId}`} id="pending" tag={pending.orderId} title={pending.from?.company ?? "New order"} preview={pending.text} time={ago(Math.floor((now - pending.at) / 60_000))} count={0} sent={false} active reading arriving onPick={() => {}} />
                  )}
                  {runs.map((r) => (
                    <OrderItem key={`order-${r.orderId}`} id={`live-${r.runId}`} tag={r.orderId} title={r.from?.company ?? "New order"} preview={r.text} time={ago(Math.floor((now - r.runId) / 60_000))} count={toCheck(r, `live-${r.runId}`)} sent={!!sent[`live-${r.runId}`]} active={!pending && selected === `live-${r.runId}`} arriving onPick={pick} />
                  ))}
                  {shownSamples.filter((_, i) => i > 0 || arrival !== "empty").map((s, i) => (
                    <OrderItem key={s.orderId} id={s.orderId} tag={orderNumber(s.orderId)} title={s.from?.company ?? s.orderId} preview={s.text} time={i === 0 ? ago(Math.floor((now - loadedAt) / 60_000)) : "Earlier"} count={toCheck(s, s.orderId)} sent={!!sent[s.orderId]} active={!pending && selected === s.orderId} arriving={i === 0} onPick={pick} />
                  ))}
                </ul>
              </nav>
              {/* secondary, technical tools */}
              <div className="shrink-0 border-t border-line px-3 py-2">
                <button
                  onClick={() => { setMobileOpen(false); setSettingsOpen((v) => !v); }}
                  aria-expanded={settingsOpen}
                  aria-controls="settings"
                  aria-label={T !== DEFAULT_T || unitMin !== DEFAULT_UNIT ? "Settings (thresholds changed)" : "Settings"}
                  className={TOOL_ROW}
                >
                  <SlidersIcon />Settings
                  {(T !== DEFAULT_T || unitMin !== DEFAULT_UNIT) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--warn-line)]" aria-hidden />}
                </button>
                <button onClick={() => { setMobileOpen(false); setHelpOpen(true); }} aria-label="About Counterpart" className={TOOL_ROW}>
                  <QuestionMarkCircleIcon aria-hidden className="h-4 w-4" />About
                </button>
              </div>
        </aside>

        <main id="review" tabIndex={-1} inert={mobileCostOpen || undefined} className="tour-review textured-surface relative min-w-0 flex-1 outline-none [overflow-anchor:none] lg:overflow-y-auto">
          {/* Wide screens: opens the orders sidebar once it's hidden. Phones use the floating button below. */}
          <div className={desktopOpen ? "hidden" : "hidden px-4 pt-3 lg:flex"}>
            <SidebarButton label="Show orders" expanded={false} unseen={unseen} onClick={toggleSidebar} />
          </div>
          <div className="mx-auto max-w-4xl px-5 py-8 sm:px-10 xl:max-w-6xl">
            {loading ? <OrderLoading progress={orderProgress} /> : !result || !selected ? <WaitingForOrders arrived={arrival === "queued"} phone={isMobile} /> : <div className="order-enter"><Review
              key={selected}
              result={result}
              mode={mode}
              T={T}
              unitMin={unitMin}
              catalog={catalog}
              resolved={decisions[selected] ?? {}}
              setResolved={(f) => setDecisions((d) => ({ ...d, [selected]: f(d[selected] ?? {}) }))}
              quantities={quantities[selected] ?? {}}
              setQuantity={(lineId, qty) => setQuantities((all) => {
                const rest = without(all[selected] ?? {}, lineId);
                return { ...all, [selected]: qty == null ? rest : { ...rest, [lineId]: qty } };
              })}
              phone={isMobile}
              compare={{
                open: isMobile ? mobileCostOpen : costOpen,
                controls: isMobile ? "cost-comparison" : "cost-rail",
                onToggle: () => {
                  if (isMobile) { setMobileOpen(false); setMobileCostOpen(true); } else setCostOpen((v) => !v);
                },
              }}
              sentAt={sent[selected]}
              onSend={() => {
                trackEvent("order_sent", { source: live ? "live" : "sample", mode, demo: true });
                setSent((s) => ({ ...s, [selected]: Date.now() }));
              }}
              onReopen={() => setSent((s) => Object.fromEntries(Object.entries(s).filter(([id]) => id !== selected)))}
            /></div>}
          </div>
        </main>

        {!isMobile && costOpen && <aside id="cost-rail" aria-label="Cost assessment" className="tour-cost hidden w-80 shrink-0 overflow-y-auto border-l border-line bg-panel lg:block">
          {loading ? <p className="px-6 py-8 text-[14px] leading-relaxed text-muted">The cost comparison will appear when both matching checks finish.</p> : costPanelProps && <CostPanel {...costPanelProps} onCollapse={() => setCostOpen(false)} />}
        </aside>}
      </div>
      {isMobile && !mobileOrders.present && (
        <button
          onClick={toggleSidebar}
          aria-expanded={false}
          aria-controls="orders"
          aria-label={unseen ? `Show orders (${unseen} new)` : "Show orders"}
          className="orders-fab fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 grid h-14 w-14 place-items-center rounded-full bg-panel text-ink shadow-raise shadow-[0_0_0_1px_var(--ring)] lg:hidden"
        >
          <SidebarIcon />
          {unseen > 0 && <OrderBadge count={unseen} className="absolute -right-0.5 -top-0.5" />}
        </button>
      )}
      {isMobile && <ActionSheet open={mobileCostOpen} id="cost-comparison" label="Cost assessment" onClose={() => setMobileCostOpen(false)} className="tour-cost max-w-md">
        {loading ? <><div className="flex items-start justify-between gap-4"><h2 className="text-xl font-semibold tracking-tight">Cost</h2><ModalCloseButton onClose={() => setMobileCostOpen(false)} label="Close cost comparison" /></div><p className="py-8 text-[14px] text-muted">The cost comparison will appear when both matching checks finish.</p></> : costPanelProps && <CostPanel {...costPanelProps} onClose={() => setMobileCostOpen(false)} />}
      </ActionSheet>}
      <ActionSheet open={resultsOpen} id="sample-results-sheet" labelledBy="sample-results-title" onClose={() => setResultsOpen(false)} className="max-w-6xl">
        <ResultsDisplay data={evalData} samples={samples} senders={Object.fromEntries(samples.flatMap(sample => sample.from ? [[sample.orderId, sample.from]] : []))} onClose={() => setResultsOpen(false)} onOpenOrder={id => {
          pick(id);
          setResultsOpen(false);
          setMobileCostOpen(false);
        }} />
      </ActionSheet>
      <SettingsDialog open={settingsOpen} mode={mode} T={T} unitMin={unitMin} setT={setT} setUnitMin={setUnitMin} changed={T !== DEFAULT_T || unitMin !== DEFAULT_UNIT} onClose={() => setSettingsOpen(false)} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} onResults={() => { setHelpOpen(false); setResultsOpen(true); }} />
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
      <SignupDialog open={signupOpen} email={signupEmail} setEmail={setSignupEmail} loading={signupLoading} error={signupError} onSubmit={signUp} onClose={() => setSignupOpen(false)} />
    </div>
  );
}

// Lock-screen copy arrives in reading order (pitch, then how it works), and the access code last,
// so a first-time visitor reads what the app does before being asked for anything.
// Any key or tap shows everything at once, so returning reps are never held up.
const LOCK_STEPS = [
  { title: "A contractor texts an order", body: <span className="mt-1.5 block w-fit rounded-2xl rounded-tl-md bg-bg px-3 py-1.5 font-mono text-[12px] leading-snug text-ink">need 40 2x4x8 PT + 12 sheets 1/2 rock</span> },
  { title: "AI drafts it from your catalog", body: <span className="mt-0.5 block text-[13px] text-muted">Each line is matched to a product with a confidence score.</span> },
  { title: "You check only what\u2019s uncertain", body: <span className="mt-0.5 block text-[13px] text-muted">Confident lines are approved; unclear ones are flagged with options.</span> },
];
const LOCK_REVEAL_MS = { headline: 900, intro: 1300, steps: 1900, stepGap: 650, form: 3900 };

function AccessLockScreen({ code, setCode, error, unlocking, onSubmit }: { code: string; setCode: (value: string) => void; error: boolean; unlocking: boolean; onSubmit: () => void }) {
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
  const reveal = (ms: number) => ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;

  return (
    <div role="dialog" aria-modal="true" aria-label="Enter access code" className={`lock-screen fixed inset-0 z-[70] grid place-items-center p-6 ${unlocking ? "lock-screen-exit" : ""} ${skipped ? "lock-reveal-skip" : ""}`}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="lock-screen-form flex w-full max-w-sm flex-col items-center text-center">
        <div className="action-sheet-handle" aria-hidden />
        <Wordmark large />
        <p className="lock-reveal mt-5 text-lg font-medium tracking-tight" style={reveal(LOCK_REVEAL_MS.headline)}>The Fast Lane for Pro Orders</p>
        <p className="lock-reveal mt-1.5 text-[14px] text-muted" style={reveal(LOCK_REVEAL_MS.intro)}>Contractors&apos; text messages, turned into ready-to-send orders.</p>
        <ol className="mt-5 flex w-full flex-col gap-3 text-left">
          {LOCK_STEPS.map((step, i) => (
            <li key={step.title} className="lock-reveal flex gap-3" style={reveal(LOCK_REVEAL_MS.steps + i * LOCK_REVEAL_MS.stepGap)}>
              <span aria-hidden className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brandsoft text-[12px] font-semibold text-ink">{i + 1}</span>
              <span className="min-w-0 text-[14px] font-medium leading-6">{step.title}{step.body}</span>
            </li>
          ))}
        </ol>
        <div className="lock-reveal mt-6 flex w-full flex-col items-center border-t border-line pt-5" style={reveal(LOCK_REVEAL_MS.form)}>
          <p className="text-[13px] text-muted">Enter your access code to continue</p>
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
            className="mt-4 h-11 w-full rounded-xl bg-panel px-4 text-center tracking-[0.3em] outline-none shadow-[0_0_0_1px_var(--ring)] focus:shadow-[0_0_0_1px_var(--control)]"
          />
          {error && <p id="access-code-error" role="alert" className="mt-2 text-[13px] text-warn">That code doesn&apos;t match.</p>}
          <button type="submit" disabled={code.length !== 3 || unlocking} className="mt-4 h-10 w-full rounded-xl bg-brand px-4 text-[14px] font-semibold text-onbrand transition-opacity disabled:cursor-not-allowed disabled:opacity-40">
            Enter
          </button>
        </div>
      </form>
    </div>
  );
}

function SignupDialog({ open, email, setEmail, loading, error, onSubmit, onClose }: { open: boolean; email: string; setEmail: (value: string) => void; loading: boolean; error: string | null; onSubmit: () => void; onClose: () => void }) {
  return (
    <ActionSheet open={open} onClose={onClose} labelledBy="signup-title" dismissOnBackdrop={false}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Free limit reached</p>
            <h2 id="signup-title" className="mt-1 text-xl font-semibold tracking-tight">Keep generating orders</h2>
          </div>
          <ModalCloseButton onClose={onClose} label="Close sign-up" />
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">You’ve used your 5 free orders. Enter your email to continue using Counterpart.</p>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="mt-5">
          <label htmlFor="signup-email" className="text-[13px] font-medium">Email address</label>
          <input id="signup-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1.5 h-11 w-full rounded-lg bg-input px-3.5 outline-none shadow-[inset_0_0_0_1px_var(--ring)] focus:shadow-[inset_0_0_0_1px_var(--control)]" />
          {error && <p role="alert" className="mt-2 text-[13px] text-warn">{error}</p>}
          <div className="mt-4 flex justify-end"><button type="submit" disabled={loading || !email.trim()} className={MODAL_PRIMARY}>{loading ? "Saving…" : "Continue"}</button></div>
        </form>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
          We store your email only to let you keep generating orders in this demo. It isn’t sold or shared.
          {PRIVACY_CONTACT && <> To have it deleted, email <a href={`mailto:${PRIVACY_CONTACT}`} className="underline">{PRIVACY_CONTACT}</a>.</>}
        </p>
    </ActionSheet>
  );
}


type Thresholds = { mode: Mode; T: number; unitMin: number; setT: (v: number) => void; setUnitMin: (v: number) => void };

const SlidersIcon = () => <AdjustmentsHorizontalIcon aria-hidden className="h-4 w-4" />;

/** Review thresholds and onboarding controls, rendered inside the settings dialog. */
function SettingsSection(p: Thresholds & { changed: boolean }) {
  return (
    <div id="settings" className="mt-5 divide-y divide-line border-y border-line">
      <section aria-labelledby="settings-thresholds" className="py-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 id="settings-thresholds" className="text-[15px] font-semibold">Review thresholds</h3>
          <button
            onClick={() => {
              p.setT(DEFAULT_T);
              p.setUnitMin(DEFAULT_UNIT);
            }}
            disabled={!p.changed}
            className="text-[13px] text-muted underline hover:text-ink disabled:no-underline disabled:opacity-40"
          >
            Reset to defaults
          </button>
        </div>
        <p className="mt-1 text-[13px] text-muted">
          {p.mode === "claude" ? "Claude only has no thresholds: it approves its own “high” ratings." : "Higher = the rep checks more lines. Lines re-route instantly; no new API calls."}
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <Slider id="t" label="Product confidence" value={p.T} min={0.5} max={0.99} onChange={p.setT} disabled={p.mode === "claude"} />
          <Slider id="u" label="Quantity clarity" value={p.unitMin} min={0.3} max={0.9} onChange={p.setUnitMin} disabled={p.mode === "claude"} />
        </div>
      </section>
      <section aria-labelledby="settings-preferences" className="py-5">
        <h3 id="settings-preferences" className="text-[15px] font-semibold">Preferences</h3>
        <div className="mt-3 flex flex-col gap-4">
          <ThemeChoice />
          <ShortcutsToggle />
        </div>
      </section>
    </div>
  );
}

/** The primary action at the bottom-right of a dialog. Every dialog footer uses this row and button. */
const MODAL_FOOTER = "mt-6 flex justify-end";
const MODAL_PRIMARY = "h-9 rounded-lg bg-brand px-5 text-[13px] font-semibold text-onbrand disabled:opacity-40";

function SettingsDialog(p: Thresholds & { open: boolean; changed: boolean; onClose: () => void }) {
  return (
    <ActionSheet open={p.open} onClose={p.onClose} labelledBy="settings-title" layer="settings">
      <div className="flex items-start justify-between gap-4">
        <h2 id="settings-title" className="text-xl font-semibold tracking-tight">Settings</h2>
        <ModalCloseButton onClose={p.onClose} label="Close settings" />
      </div>
      <SettingsSection {...p} />
      <div className={MODAL_FOOTER}>
        <button onClick={p.onClose} className={MODAL_PRIMARY}>Done</button>
      </div>
    </ActionSheet>
  );
}

function ShortcutsToggle() {
  // Rendered only when Settings is open, so reading storage here is client-side only.
  const [on, setOn] = useState(() => shortcutsEnabled());
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p id="shortcuts-label" className="text-[13px] font-medium">Keyboard shortcuts</p>
        <p className="mt-0.5 text-[13px] text-muted">Single-key shortcuts in the review. Turn off if they get in the way of speech input or assistive technology.</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-labelledby="shortcuts-label"
        onClick={() => { setOn(!on); setShortcutsEnabled(!on); }}
        className={`relative h-6 w-10 shrink-0 rounded-full shadow-[0_0_0_1px_var(--ring)] transition-colors ${on ? "bg-ink" : "bg-bg"}`}
      >
        <span aria-hidden className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${on ? "translate-x-4 bg-bg" : "bg-muted"}`} />
      </button>
    </div>
  );
}

/** Light / Dark / System. Rendered only when Settings is open, so reading storage here is client-side only. */
function ThemeChoice() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const label: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };
  return (
    <div className="flex items-center justify-between gap-4">
      <p id="theme-label" className="text-[13px] font-medium">Theme</p>
      <div className="inline-flex gap-1 rounded-xl bg-panel p-1 text-[13px] shadow-[0_0_0_1px_var(--ring)]" role="radiogroup" aria-labelledby="theme-label">
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
    </div>
  );
}

const DiceIcon = () => <SparklesIcon aria-hidden className="h-4 w-4" />;

/** What the rep sees before the first order lands: an empty queue, and a text on its way. */
function WaitingForOrders({ arrived, phone }: { arrived: boolean; phone: boolean }) {
  if (arrived) {
    return (
      <div className="waiting-orders mx-auto flex max-w-sm flex-col items-center pt-[14vh] text-center">
        <div className="relative grid h-14 w-14 place-items-center rounded-full bg-panel text-ink shadow-[0_0_0_1px_var(--ring)]">
          <InboxIcon aria-hidden className="h-6 w-6" />
          <OrderBadge count={1} className="absolute -right-1 -top-1" />
        </div>
        <h1 className="mt-5 text-lg font-semibold tracking-tight">A new order is in your queue</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
          {phone ? "Tap the orders button to open it." : "Open it from the queue on the left."}
        </p>
      </div>
    );
  }
  return (
    <div className="waiting-orders mx-auto flex max-w-sm flex-col items-center pt-[14vh] text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-panel text-muted shadow-[0_0_0_1px_var(--ring)]">
        <InboxIcon aria-hidden className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-lg font-semibold tracking-tight">Waiting for orders</h1>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
        Contractors text their orders in. Each one lands in your queue already matched to the catalog, so you only check what&apos;s uncertain.
      </p>
      <div role="status" className="mt-6 flex items-center gap-2 text-[13px] text-muted">
        <span aria-hidden className="flex h-8 items-center gap-1 rounded-2xl rounded-tl-md bg-panel px-3 shadow-[0_0_0_1px_var(--ring)]">
          <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
        </span>
        A contractor is texting…
      </div>
    </div>
  );
}

/**
 * Generate order, with a tooltip on hover and keyboard focus that says it's a simulated order and what runs.
 * The tooltip is portalled to <body> so the sidebar can't clip it: beside the button on wide screens, below it on phones.
 */
function GenerateButton({ loading, onGenerate, beside }: { loading: boolean; onGenerate: () => void; beside: boolean }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const show = (e: { currentTarget: HTMLElement }) => setAnchor(e.currentTarget.getBoundingClientRect());
  const hide = () => setAnchor(null);
  const style: CSSProperties | undefined = anchor ? (beside
    ? { left: anchor.right + 12, top: anchor.top + anchor.height / 2, transform: "translateY(-50%)", width: 288 }
    : { left: anchor.left, top: anchor.bottom + 8, width: anchor.width }) : undefined;
  return (
    <>
      <button
        disabled={loading}
        onClick={onGenerate}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={anchor ? "generate-tip" : undefined}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink shadow-[0_0_0_1px_var(--ring)] transition-colors hover:bg-brand hover:text-onbrand hover:shadow-none focus-visible:bg-brand focus-visible:text-onbrand disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-ink"
      >
        <DiceIcon />
        {loading ? "Arriving…" : "Generate order"}
      </button>
      {anchor && createPortal(
        <span id="generate-tip" role="tooltip" style={style} className="generate-tip pointer-events-none fixed z-[60] rounded-lg bg-ink px-3 py-2 text-[12px] leading-snug text-bg shadow-raise">
          {beside && <span aria-hidden className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-ink" />}
          Simulates a contractor texting in a new order (synthetic data). It runs live through two pipelines:
          <span className="mt-1.5 block"><span className="font-semibold">Claude + Jev:</span> Claude reads the text, then Jev matches each line to the catalog with a calibrated confidence.</span>
          <span className="mt-1 block"><span className="font-semibold">Claude only:</span> Claude reads and matches the whole order in one call, for comparison.</span>
        </span>,
        document.body,
      )}
    </>
  );
}

function SidebarButton({ label, expanded, unseen = 0, onClick }: { label: string; expanded: boolean; unseen?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls="orders"
      aria-label={unseen ? `${label} (${unseen} new)` : label}
      title={`${label} (⌘B)`}
      className={`${ICON_BUTTON} relative`}
    >
      {expanded ? <ArrowLeftEndOnRectangleIcon aria-hidden className="h-4 w-4" /> : <SidebarIcon />}
      {unseen > 0 && <OrderBadge count={unseen} className="absolute -right-1 -top-1" />}
    </button>
  );
}

/** The count of new orders on the orders button. Keyed by the count, so it pops each time another order arrives. */
function OrderBadge({ count, className }: { count: number; className: string }) {
  return (
    <span key={count} aria-hidden className={`order-badge grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-none text-onbrand shadow-[0_0_0_2px_var(--panel)] ${className}`}>
      {count}
    </span>
  );
}

const TOOL_ROW = "flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-muted hover:bg-bg hover:text-ink";

const SidebarIcon = () => <InboxIcon aria-hidden className="h-4 w-4" />;

function OrderItem(p: { id: string; tag: string; title: string; preview: string; time: string; count: number; sent: boolean; active: boolean; reading?: boolean; arriving?: boolean; onPick: (id: string) => void }) {
  // the first two lines of the text, as the contractor wrote them (the same text the message bubble shows)
  const previewLines = p.preview.trim().split("\n");
  const preview = previewLines.slice(0, 2);
  const hasMorePreview = previewLines.length > preview.length;
  return (
    <li className={p.arriving ? "queue-arrive" : undefined}>
      <button
        onClick={() => p.onPick(p.id)}
        aria-current={p.active ? "true" : undefined}
        aria-busy={p.reading || undefined}
        className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2.5 rounded-r-lg px-2.5 py-2.5 text-left ${p.active ? "bg-bg shadow-[inset_3px_0_0_var(--brand)]" : "hover:bg-bg"}`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className={`shrink-0 rounded-md bg-bg px-1.5 py-0.5 font-mono text-[12px] font-semibold leading-4 text-ink ${p.active ? "shadow-[0_0_0_1px_var(--ring)]" : ""}`}>{p.tag}</span>
            <span className={`min-w-0 flex-1 truncate text-[13px] ${p.active ? "font-semibold" : "font-medium"}`}>{p.title}</span>
          </span>
          <span className="mt-1 block text-[12px] leading-4 text-muted">{preview.map((line, i) => <span key={i} className="block truncate whitespace-pre">{line}{hasMorePreview && i === preview.length - 1 ? "..." : ""}</span>)}</span>
        </span>
        <span className="flex min-w-0 flex-col items-end justify-between gap-2 text-right">
          <span className="shrink-0 text-[11px] text-muted">{p.time}</span>
          {p.reading ? (
            <span className="shrink-0 text-[12px] text-muted">Reading…</span>
          ) : p.sent ? (
            <span className="shrink-0 text-[12px] font-medium text-ok">Sent<span className="sr-only"> for approval</span></span>
          ) : p.count > 0 ? (
            <span className="shrink-0 rounded-full bg-warnbg px-2 py-0.5 text-[12px] font-medium leading-none text-warn"><span aria-hidden>{p.count}</span><span className="sr-only">{p.count} to check</span></span>
          ) : (
            <span className="shrink-0 text-ok"><span aria-hidden><Check /></span><span className="sr-only">Nothing to check</span></span>
          )}
        </span>
      </button>
    </li>
  );
}

type Decisions = Record<string, string>; // lineId -> sku chosen by the rep

function OrderDetails({ result, mode, lines, flagged, done, compare }: { result: OrderResult; mode: Mode; lines: number; flagged: number; done: number; compare: Compare }) {
  const who = result.from?.name ?? "the contractor";
  const save = savings(result);
  const toCheck = Math.max(0, flagged - done);
  const stats = [
    { label: "Lines", value: lines, className: "text-ink" },
    { label: "Auto-approved", value: lines - flagged, className: "text-ok" },
    { label: "To check", value: toCheck, className: "text-warn" },
  ];
  return (
    <div className="@container mb-6 rounded-xl border xl:mb-0 border-line bg-panel px-4 py-4 shadow-[0_0_0_1px_var(--ring)] sm:px-5" aria-live="polite">
      <div className="flex flex-col gap-3 @min-[560px]:flex-row @min-[560px]:items-start @min-[560px]:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg text-[12px] font-semibold text-ink" aria-hidden>
          {result.from ? result.from.name.split(" ").map((w) => w[0]).join("").slice(0, 2) : "C"}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-semibold leading-tight tracking-tight">
            {result.from?.name ?? "New order"}
            {result.from && <span className="font-normal text-muted"> · {result.from.company}</span>}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">Texted an order · <span className="font-mono">{orderNumber(result.orderId)}</span></p>
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-3 divide-x divide-line whitespace-nowrap rounded-lg bg-bg py-2 @min-[560px]:ml-auto @min-[560px]:flex @min-[560px]:px-1 @min-[560px]:py-1">
        {stats.map((stat) => <span key={stat.label} className={`flex min-w-0 flex-col items-center gap-0.5 px-1 text-[18px] font-semibold @min-[560px]:block @min-[560px]:px-3 @min-[560px]:text-[13px] @min-[560px]:font-medium ${stat.className}`}>{stat.value} <span className="text-[11px] font-normal text-muted @min-[560px]:text-[13px]">{stat.label}</span></span>)}
      </div>
      </div>
      <figure className="mt-4 @min-[560px]:ml-12">
        <figcaption className="sr-only">Text message from {who}</figcaption>
        <blockquote id="incoming-message" className="w-fit max-w-prose whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-bg px-4 py-3 text-[14px] leading-relaxed text-ink">
          {result.text.trim()}
        </blockquote>
      </figure>
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3 @min-[560px]:flex-row @min-[560px]:items-center">
        {/* which draft is showing; the send status lives in the pricing card beside Send */}
        <p className="text-left text-[12px] font-medium leading-4 text-ink">
          {mode === "claude" && "Showing the Claude-only draft"}
        </p>
        {/* What the AI cost to read and match this order, vs Claude only. One line; clicking it opens the details. */}
        <button
          onClick={compare.onToggle}
          aria-expanded={compare.open}
          aria-controls={compare.controls}
          title={`AI cost: ${usd(save.jevUsd)} vs ${usd(save.claudeUsd)} per order with Claude only, from a single run`}
          className={`shrink-0 self-start whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium tabular-nums text-ink hover:bg-bg @min-[560px]:ml-auto @min-[560px]:self-center ${compare.open ? "bg-bg shadow-[0_0_0_1px_var(--ring)]" : "bg-bg/60"}`}
        >
          <span className="text-muted">Results · </span>{save.cheaper.toFixed(1)}× lower cost
          {save.timeSaved != null && <><span className="text-muted"> | </span>{speedLine(save.timeSaved)}</>}
        </button>
      </div>
    </div>
  );
}

/** The foot of the order: the subtotal, then Send. It comes after the lines, so the rep reaches it once they're checked. */
function OrderFooter({ result, subtotal, toCheck, sentAt, onSend, onReopen }: { result: OrderResult; subtotal: { sum: number; unpriced: number }; toCheck: number; sentAt?: number; onSend: () => void; onReopen: () => void }) {
  const [sendAttempted, setSendAttempted] = useState(false);
  const first = result.from?.name.split(" ")[0] ?? "contractor";
  const ready = !sentAt && toCheck === 0;
  const extra = [toCheck > 0 && `+ ${toCheck} to check`, subtotal.unpriced > 0 && `+ ${subtotal.unpriced} not priced`].filter(Boolean).join(" · ");
  const tax = cents(subtotal.sum * SALES_TAX.rate);
  const total = cents(subtotal.sum + tax);
  return (
    <div className="card px-4 py-4 sm:px-6">
      <h2 className="sr-only">Order total</h2>
      <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[14px] tabular-nums">
        <dt className="text-muted">{toCheck > 0 ? "Subtotal so far" : "Subtotal"}</dt>
        <dd className="pl-4 text-right">{money(subtotal.sum)}</dd>
        <dt className="text-muted">{SALES_TAX.label} ({Math.round(SALES_TAX.rate * 100)}%)</dt>
        <dd className="pl-4 text-right">{money(tax)}</dd>
        <dt className="mt-1 border-t border-line pt-2 font-semibold">Total <span className="font-normal text-muted">CAD</span></dt>
        <dd className="mt-1 border-t border-line pl-4 pt-2 text-right text-[15px] font-semibold">{money(total)}</dd>
      </dl>
      {extra && <p className="mt-1.5 text-right text-[12px] text-muted">Not included yet: {extra.replaceAll("+ ", "")}</p>}
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-end">
        {/* the send status lives here, beside Send: what's left before sending, then the confirmation once sent */}
        <p id="send-order-note" role="status" className={`text-[12px] leading-4 sm:mr-auto ${sentAt ? "font-medium text-ok" : toCheck > 0 ? "text-warn" : "text-muted"}`}>
          {sentAt
            ? `Sent to ${result.from?.name ?? "the contractor"} for approval at ${new Date(sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Waiting for their approval.`
            : toCheck > 0 ? `${toCheck} ${toCheck === 1 ? "line" : "lines"} still to check before sending.` : `${first} approves it before it goes to the ERP.`}
        </p>
        <button
          id="send-order"
          onClick={() => {
            if (sentAt) onReopen();
            else if (ready) onSend();
            else setSendAttempted(true);
          }}
          aria-disabled={!sentAt && !ready}
          aria-describedby={sendAttempted && !ready && !sentAt ? "send-order-note send-order-guidance" : "send-order-note"}
          className={`h-11 w-full shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-4 text-[14px] font-semibold transition-[background-color,opacity] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 sm:h-10 sm:w-auto ${sentAt ? "border border-line bg-panel text-ink hover:bg-bg" : "bg-brand text-onbrand"}`}
        >
          {sentAt ? "Reopen" : "Send for approval"}
        </button>
      </div>
      {sendAttempted && !ready && !sentAt && (
        <p id="send-order-guidance" role="status" className="mt-3 text-[13px] text-warn">
          Confirm a product and quantity for each remaining item first. <a href="#needs-review" className="font-medium underline underline-offset-2">Go to Needs review</a>
        </p>
      )}
    </div>
  );
}

type Compare = { open: boolean; controls: string; onToggle: () => void };

function Review({ result, mode, T, unitMin, catalog, resolved, setResolved, quantities, setQuantity, phone, compare, sentAt, onSend, onReopen }: {
  result: OrderResult; mode: Mode; T: number; unitMin: number; catalog: SlimCatalog;
  resolved: Decisions; setResolved: (f: (r: Decisions) => Decisions) => void;
  quantities: Record<string, number>; setQuantity: (lineId: string, qty: number | undefined) => void;
  phone: boolean; compare: Compare;
  sentAt?: number; onSend: () => void; onReopen: () => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  // A product the rep picked whose quantity still has to be set in its selling unit (line id -> sku)
  const [staged, setStaged] = useState<Record<string, string>>({});
  const [footerSendVisible, setFooterSendVisible] = useState(false);
  const floatingSendRef = useRef<HTMLButtonElement>(null);
  const lines = useMemo(() => computeView(result, mode, T, catalog, unitMin), [result, mode, T, catalog, unitMin]);
  // Unmatched lines need triage before product or quantity checks, so keep them at the top of the review list.
  const orderedLines = useMemo(() => [...lines].sort((a, b) => Number(b.sku === NONE) - Number(a.sku === NONE)), [lines]);
  const flagged = orderedLines.filter((l) => !l.approved);
  const done = flagged.filter((l) => resolved[l.id]).length;
  const pending = flagged.filter((l) => !resolved[l.id]);
  const validated = orderedLines.filter((l) => l.approved || (resolved[l.id] && resolved[l.id] !== NONE));
  const excluded = flagged.filter((l) => resolved[l.id] === NONE);
  const current = pending.find((l) => l.id === active)?.id ?? pending[0]?.id ?? null;
  // Once every line is checked, Send follows the rep down the page until the footer's own Send is in view.
  const showFloatingSend = !sentAt && !footerSendVisible && pending.length === 0;

  useEffect(() => {
    const button = document.getElementById("send-order");
    if (!button) return;
    const observer = new IntersectionObserver(([entry]) => {
      const visible = entry.isIntersecting;
      setFooterSendVisible(visible);
      if (visible && document.activeElement === floatingSendRef.current) {
        button.focus({ preventScroll: true });
      }
    });
    observer.observe(button);
    return () => observer.disconnect();
  }, []);

  // A decision removes the button that had focus, so move it on instead of dropping to <body>.
  const focusAfter = useRef<"next" | string | null>(null);
  const scrollAfter = useRef<{ element: HTMLElement; top: number }[]>([]);
  const choose = useCallback((lineId: string, sku: string, qty?: number) => {
    focusAfter.current = "next";
    const positions: { element: HTMLElement; top: number }[] = [];
    for (let element = document.getElementById("review"); element; element = element.parentElement) {
      if (element.scrollHeight > element.clientHeight && /auto|scroll/.test(getComputedStyle(element).overflowY)) {
        positions.push({ element, top: element.scrollTop });
      }
    }
    scrollAfter.current = positions;
    setActive(null);
    setStaged((s) => without(s, lineId));
    trackEvent("order_line_reviewed", { mode, decision: sku === NONE ? "not_in_catalog" : "product", quantity_set: qty != null });
    setQuantity(lineId, sku === NONE ? undefined : qty);
    setResolved((r) => ({ ...r, [lineId]: sku }));
  }, [mode, setResolved, setQuantity]);
  /**
   * The one way a product gets picked (click, number key or Enter). If the contractor's quantity isn't in the unit the
   * product is sold by ("100 feet" of a roll), or there is none, the pick waits for the rep to set the quantity.
   */
  const pickProduct = useCallback((l: ViewLine, sku: string, editQuantity = false) => {
    const product = catalog[sku];
    if (editQuantity || l.qty == null || (product && !sameQuantityUnit(l.unit, product.unit))) {
      setActive(l.id);
      setStaged((s) => ({ ...s, [l.id]: sku }));
    } else choose(l.id, sku);
  }, [catalog, choose]);
  const unstage = (lineId: string) => {
    setStaged((s) => without(s, lineId));
    requestAnimationFrame(() => document.getElementById(`line-${lineId}`)?.focus());
  };
  const undo = (lineId: string) => {
    focusAfter.current = lineId;
    setActive(lineId);
    setQuantity(lineId, undefined);
    setResolved((r) => Object.fromEntries(Object.entries(r).filter(([id]) => id !== lineId)));
  };

  useLayoutEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const id = target === "next" ? current : target;
    const el = id ? document.getElementById(`line-${id}`) : showFloatingSend ? floatingSendRef.current : document.getElementById("send-order");
    (el ?? document.getElementById("review"))?.focus({ preventScroll: target === "next" });
    // Restore after focus too: mobile browsers can scroll while focusing a fixed button.
    for (const { element, top } of scrollAfter.current) element.scrollTo({ top, behavior: "instant" });
    scrollAfter.current = [];
  }, [resolved, current, showFloatingSend]);

  // keyboard: j/k move between flagged lines, 1-3 pick a product, Enter accepts the suggested product, x leaves the line off.
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
      // a line waiting for its quantity takes input in its own editor
      const open = line && !resolved[line.id] && !staged[line.id];
      const navigate = (id: string) => {
        setActive(id);
        document.getElementById(`line-${id}`)?.scrollIntoView({ block: "nearest" });
      };
      const choices = line ? productChoices(line) : [];
      if (e.key === "j" && ids.length) navigate(ids[Math.min(ids.length - 1, i + 1)]);
      else if (e.key === "k" && ids.length) navigate(ids[Math.max(0, i - 1)]);
      else if (open && !line.quantityOnly && /^[1-3]$/.test(e.key) && choices[Number(e.key) - 1]) pickProduct(line, choices[Number(e.key) - 1].sku);
      // Enter accepts the suggested product, only from the review itself or a line (never from a focused link or button),
      // and never when the suggestion is to leave the line off: that takes x or a click.
      else if (open && e.key === "Enter" && line.sku !== NONE && (t === document.body || t.id === "review" || /^line-/.test(t.id))) pickProduct(line, line.sku);
      else if (line && !resolved[line.id] && e.key === "x") choose(line.id, NONE);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flagged, pending, current, choose, pickProduct, resolved, staged, sentAt]);

  // Order subtotal: confirmed lines only (auto-approved or checked by the rep). Lines still to check aren't priced yet.
  const subtotal = useMemo(() => {
    let sum = 0;
    let unpriced = 0;
    for (const l of validated) {
      const total = linePrice(l, resolved[l.id], catalog, quantities[l.id])?.total;
      if (total == null) unpriced++;
      else sum += total;
    }
    return { sum, unpriced };
  }, [validated, resolved, catalog, quantities]);
  const status = (l: ViewLine) => (l.approved ? "ok" : resolved[l.id] ? "done" : "flag");

  return (
    <>
      {pending.length > 0 && (
        <a href={`#line-${pending[0].id}`} className="sr-only focus:not-sr-only focus:mb-2 focus:inline-block focus:rounded focus:bg-panel focus:px-2 focus:py-1">
          Skip to the first line to check
        </a>
      )}
      {/* Wide screens: two columns. The order header stays pinned on the left for reference while the lines scroll on the right. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] xl:items-start xl:gap-6">
      <div className="xl:sticky xl:top-5 xl:-m-1 xl:max-h-[calc(100dvh-2.5rem)] xl:overflow-y-auto xl:p-1">
        <OrderDetails result={result} mode={mode} lines={lines.length} flagged={flagged.length} done={done} compare={compare} />
      </div>

      <section aria-label="Order" className={phone ? "pb-24" : ""}>
        <div className="space-y-5">
          <div inert={!!sentAt} className={`space-y-5 ${sentAt ? "opacity-70" : ""}`}>
            {[
              ...(pending.length ? [{ id: "needs-review", title: "Needs review", description: "Confirm a product and quantity for each item.", items: pending, color: "bg-panel text-warn", empty: "" }] : []),
              { id: "validated-items", title: "Validated items", description: "Auto-approved or checked by you.", items: validated, color: "bg-panel text-ok", empty: "Validated items will appear here as you confirm them." },
              ...(excluded.length ? [{ id: "excluded-items", title: "Left off order", description: "No catalog match. Let the contractor know.", items: excluded, color: "bg-bg text-muted", empty: "" }] : []),
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
                      <LineRow
                        key={l.id} l={l} state={status(l)} pick={resolved[l.id]} quantity={quantities[l.id]} staged={staged[l.id]}
                        active={current === l.id} catalog={catalog}
                        onSelect={() => setActive(l.id)}
                        onPick={(sku, editQuantity) => pickProduct(l, sku, editQuantity)}
                        onConfirm={(sku, qty) => choose(l.id, sku, qty)}
                        onUnstage={() => unstage(l.id)}
                        onUndo={() => undo(l.id)}
                      />
                    ))}
                  </ul>
                ) : <p className="px-4 py-5 text-[13px] text-muted sm:px-6">{group.empty}</p>}
              </section>
            ))}
          </div>
          <OrderFooter result={result} subtotal={subtotal} toCheck={pending.length} sentAt={sentAt} onSend={onSend} onReopen={onReopen} />
        </div>
      </section>
      </div>

      <div
        className={`floating-send fixed inset-x-0 bottom-0 z-20 flex justify-center px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] ${showFloatingSend ? "floating-send-visible" : ""}`}
        inert={!showFloatingSend}
        aria-hidden={!showFloatingSend}
      >
          <button
            ref={floatingSendRef}
            id="floating-send-order"
            disabled={!showFloatingSend}
            onClick={() => {
              onSend();
              requestAnimationFrame(() => document.getElementById("send-order")?.focus());
            }}
            className="pointer-events-auto flex min-h-12 items-center gap-2 rounded-xl bg-brand px-6 text-[14px] font-semibold text-onbrand shadow-raise"
          >
            <Check /> Send for approval
          </button>
      </div>
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

const unitName = (unit: string, n = 1) => (unit === "each" ? (n === 1 ? "piece" : "pieces") : n === 1 ? unit : unit.endsWith("x") ? `${unit}es` : `${unit}s`);

/** Sets how many of a product, in the unit it's sold by, when the contractor's quantity can't be used as written. */
function QuantityEditor({ l, sku, catalog, onConfirm, onCancel }: { l: ViewLine; sku: string; catalog: SlimCatalog; onConfirm: (qty: number) => void; onCancel: () => void }) {
  const product = catalog[sku];
  const suggestion = product ? suggestQuantity(l.qty, l.unit, product.name, product.unit) : null;
  // Prefill only a quantity that is already in the selling unit, or a conversion worked out from the product's size.
  const initial = suggestion?.qty ?? (l.qty != null && product && sameQuantityUnit(l.unit, product.unit) ? l.qty : null);
  const [value, setValue] = useState(initial != null ? String(initial) : "");
  const qty = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(qty) && qty > 0;
  const inputId = `qty-${l.id}`;
  const step = (d: number) => setValue(String(Math.max(1, (valid ? qty : 0) + d)));
  if (!product) return null;
  return (
    <div className="mt-4 rounded-xl bg-bg p-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-medium text-ink">{product.name}</p>
        <button onClick={onCancel} className="text-[13px] text-muted underline hover:text-ink">Change product</button>
      </div>
      <p className="mt-0.5 text-[12px] tabular-nums text-muted">{perUnit(product.price, product.unit)}</p>
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (valid) onConfirm(qty); }}>
        <div>
          <label htmlFor={inputId} className="mb-1 block text-[13px] font-medium">Quantity in {unitName(product.unit, 2)}</label>
          <div className="flex items-center rounded-lg bg-panel shadow-[0_0_0_1px_var(--control)]">
            <button type="button" onClick={() => step(-1)} aria-label="One fewer" className="h-11 w-11 text-lg text-muted hover:text-ink">−</button>
            <input
              id={inputId}
              autoFocus
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); } }}
              aria-describedby={`${inputId}-hint`}
              className="h-11 w-16 bg-transparent text-center text-[15px] tabular-nums outline-none"
            />
            <button type="button" onClick={() => step(1)} aria-label="One more" className="h-11 w-11 text-lg text-muted hover:text-ink">+</button>
          </div>
        </div>
        <button type="submit" disabled={!valid} className="h-11 rounded-lg bg-okbg px-4 font-medium text-ok shadow-[0_0_0_1px_var(--ok)] disabled:opacity-40">
          Confirm {valid ? `${qty} ${unitName(product.unit, qty)}` : "quantity"}{valid ? ` · ${money(qty * product.price)}` : ""}
        </button>
      </form>
      <p id={`${inputId}-hint`} className="mt-2 text-[12px] text-muted">
        {suggestion ? `Suggested from the product size: ${suggestion.working}.`
          : l.qty == null ? "The contractor didn't give a quantity."
          : `The contractor wrote ${fmtQty(l.qty, l.unit)}. Enter how many ${unitName(product.unit, 2)} that is.`}
      </p>
    </div>
  );
}

function LineRow(props: {
  l: ViewLine; state: "ok" | "done" | "flag"; pick?: string; quantity?: number; staged?: string; active: boolean; catalog: SlimCatalog;
  onSelect: () => void; onPick: (sku: string, editQuantity?: boolean) => void; onConfirm: (sku: string, qty?: number) => void; onUnstage: () => void; onUndo: () => void;
}) {
  const { l, state, pick, active, catalog } = props;
  const [showAll, setShowAll] = useState(false);
  const product = catalog[pick && pick !== NONE ? pick : l.sku];
  const sellUnit = product?.unit;
  const qty = props.quantity != null && sellUnit ? fmtQty(props.quantity, sellUnit) : fmtQty(l.qty, sellUnit && sameQuantityUnit(l.unit, sellUnit) ? sellUnit : (l.unit ?? sellUnit ?? null));

  if (state === "flag") {
    const choices = productChoices(l);
    const quick = l.quantityOnly && !showAll;
    // On a line to check, show the quantity as the customer wrote it. If their unit differs from how the
    // product is sold ("50 lb" of nails sold by the box), say both rather than silently converting.
    const asked = l.unit && sellUnit && l.sku !== NONE && !sameQuantityUnit(l.unit, sellUnit) ? `${fmtQty(l.qty, l.unit)} · sold per ${unitName(sellUnit)}` : fmtQty(l.qty, l.unit);
    const quickPrice = linePrice(l, l.sku, catalog);
    return (
      <li id={`line-${l.id}`} tabIndex={-1} onClick={props.onSelect} className={`outline-none scroll-mt-44 scroll-mb-8 border-b border-line bg-panel px-4 py-5 last:border-b-0 sm:px-6`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <span className="font-mono text-[14px] font-medium">
            <span className="sr-only">Check this: </span>
            {l.raw}
          </span>
          <span className="text-[14px] text-muted">{asked}</span>
        </div>
        <p className="mt-1.5 text-[13px] text-warn">{l.reasons.join(" ")}</p>
        {props.staged ? (
          <QuantityEditor l={l} sku={props.staged} catalog={catalog} onConfirm={(n) => props.onConfirm(props.staged!, n)} onCancel={props.onUnstage} />
        ) : quick ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={(e) => { e.stopPropagation(); props.onPick(l.sku); }} className="review-option tour-option min-h-11 rounded-xl bg-okbg px-4 py-2 text-left font-medium text-ok shadow-[0_0_0_1px_var(--ok)]">
              {active && <kbd className="mr-2 text-xs">Enter</kbd>}
              {quickPrice?.total != null ? <>Confirm {fmtQty(l.qty, sellUnit ?? null)} of {l.name}<span className="font-normal"> · {money(quickPrice.total)}</span></> : <>Set the quantity of {l.name}</>}
            </button>
            {quickPrice?.total != null && <button onClick={(e) => { e.stopPropagation(); props.onPick(l.sku, true); }} className="text-[13px] text-muted underline hover:text-ink">Change quantity</button>}
            <button onClick={(e) => { e.stopPropagation(); setShowAll(true); }} className="text-[13px] text-muted underline hover:text-ink">Other products…</button>
          </div>
        ) : (
          <div role="group" aria-label={`Products for ${l.raw}`} className="mt-3 flex flex-col gap-2">
            {/* column header over the confidence cells */}
            {choices.some((o) => o.probability != null) && (
              <div aria-hidden className="-mb-1 flex justify-end px-3.5 text-[12px] font-medium text-muted">
                <span className="w-16 text-center sm:w-24">Confidence</span>
              </div>
            )}
            {choices.map((o, i) => {
              const price = linePrice(l, o.sku, catalog);
              const suggested = o.sku === l.sku;
              return (
                <button
                  key={o.sku}
                  onClick={(e) => { e.stopPropagation(); props.onPick(o.sku); }}
                  className="review-option tour-option flex min-h-11 items-center gap-3 rounded-xl bg-panel px-3.5 py-2 text-left text-ink shadow-[0_0_0_1px_var(--control)]"
                >
                  <kbd className="w-4 text-center text-xs text-muted">{i + 1}</kbd>
                  <span className="min-w-0 flex-1">
                    <span className={`block ${suggested ? "font-semibold" : ""}`}>{o.name}{suggested && <span className="sr-only"> (suggested)</span>}</span>
                    {price && <span className="block text-[12px] tabular-nums text-muted">{price.unit}{price.total != null && <> · {money(price.total)} for {fmtQty(l.qty, catalog[o.sku].unit)}</>}</span>}
                  </span>
                  {o.probability != null && (
                    <span className="flex w-16 shrink-0 items-center justify-center self-stretch sm:w-24 border-l border-line text-[14px] text-muted">
                      <span className="sr-only">confidence </span>
                      {Math.round(o.probability * 100)}%
                    </span>
                  )}
                  {o.probability == null && suggested && <span className="text-xs text-muted">Claude: {l.confidence}</span>}
                </button>
              );
            })}
            {choices.length === 0 && <p className="text-[13px] text-muted">No product in the catalog comes close.</p>}
          </div>
        )}
        {/* leaving the line off is a choice like the products, shaped the same, with its own key and its own confidence */}
        {!props.staged && (() => {
          const none = l.options.find((o) => o.sku === NONE)?.probability;
          return (
            <button
              onClick={(e) => { e.stopPropagation(); props.onConfirm(NONE); }}
              className="review-option mt-2 flex min-h-11 w-full items-center gap-3 rounded-xl bg-panel px-3.5 py-2 text-left text-ink shadow-[0_0_0_1px_var(--control)]"
            >
              <kbd className="w-4 text-center text-xs text-muted">x</kbd>
              <span className="min-w-0 flex-1">
                <span className={`block ${l.sku === NONE ? "font-semibold" : ""}`}>Leave off order{l.sku === NONE && <span className="sr-only"> (suggested)</span>}</span>
                <span className="block text-[12px] text-muted">Not in the catalog · tell the contractor we don&apos;t carry it</span>
              </span>
              {none != null && (
                <span className="flex w-16 shrink-0 items-center justify-center self-stretch border-l border-line text-[14px] text-muted sm:w-24">
                  <span className="sr-only">confidence </span>
                  {Math.round(none * 100)}%
                </span>
              )}
            </button>
          );
        })()}
      </li>
    );
  }

  const chosen = state === "done" ? (pick === NONE ? "Left off order" : (catalog[pick!]?.name ?? pick)) : l.name;
  const price = pick === NONE ? null : linePrice(l, pick, catalog, props.quantity);
  const total = price?.total != null ? money(price.total) : <span title="Not priced: the quantity isn't in the unit this product is sold by">—<span className="sr-only">not priced</span></span>;
  return (
    <li id={`line-${l.id}`} tabIndex={-1} onClick={props.onSelect} className={`outline-none scroll-mt-44 border-b border-line last:border-b-0 ${active ? "bg-bg" : ""}`}>
      <div className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-6">
        <span className={state === "done" && pick === NONE ? "text-warn" : "text-ok"}>{state === "done" ? <Person /> : <Check />}</span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-ink">{chosen}</span>
          <span className="block font-mono text-[13px] text-muted">{l.raw}</span>
          {/* phones: quantity and price stack under the name instead of taking columns */}
          <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[13px] tabular-nums text-muted sm:hidden">
            {pick !== NONE && <span>{qty}</span>}
            {pick !== NONE && <span>{total}</span>}
            {pick !== NONE && price && <span>({price.unit})</span>}
          </span>
          {state === "done" && (
            <span className="mt-0.5 block text-[12px] text-muted">
              {pick === NONE ? "Left off by you" : props.quantity != null ? "Product and quantity set by you" : "Checked by you"} · <button className="underline hover:text-ink" onClick={props.onUndo}>Undo</button>
            </span>
          )}
        </span>
        {pick !== NONE && <span className="shrink-0 text-right text-[14px] text-muted max-sm:hidden">{qty}</span>}
        {pick !== NONE && (
          <span className="w-28 shrink-0 text-right tabular-nums text-muted max-sm:hidden">
            <span className="block text-[14px]">{total}</span>
            {price && <span className="block text-[12px]">{price.unit}</span>}
          </span>
        )}
      </div>
    </li>
  );
}

type Side = { key: Mode; label: string; matcher: string; t: ReturnType<typeof totals>; approved: number; lines: number };
const PER = 10_000;

function CostPanel({ result, samples, mode, T, unitMin, catalog, onMode, onClose, onCollapse, onResults }: { result: OrderResult; samples: OrderResult[]; mode: Mode; T: number; unitMin: number; catalog: SlimCatalog; onMode: (m: Mode) => void; onClose?: () => void; onCollapse?: () => void; onResults?: () => void }) {
  const a = computeView(result, "jev", T, catalog, unitMin);
  const b = computeView(result, "claude", T, catalog);
  const n = result.parse.lines.length;
  const sides: Side[] = [
    { key: "jev", label: "Claude + Jev", matcher: "Jev", t: totals(result, "jev"), approved: a.filter((l) => l.approved).length, lines: n },
    { key: "claude", label: "Claude only", matcher: "Claude", t: totals(result, "claude"), approved: b.filter((l) => l.approved).length, lines: n },
  ];
  const maxUsd = Math.max(...sides.map((x) => x.t.usd));
  const diff = a.filter((l, i) => l.sku !== b[i].sku);
  const per10k = (usdPerOrder: number) => `$${(usdPerOrder * PER).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

  return (
    <div className="flex flex-col">
      <div className={`flex shrink-0 justify-between ${onClose ? "items-start gap-4" : "h-16 items-center gap-2 px-4"}`}>
        <h2 className={onClose ? "text-xl font-semibold tracking-tight" : "text-[15px] font-semibold"}>AI cost</h2>
        {onCollapse && <ModalCloseButton onClose={onCollapse} label="Hide AI cost" />}
        {onClose && <ModalCloseButton onClose={onClose} label="Close AI cost comparison" />}
      </div>
      <div className={`flex flex-col gap-4 ${onClose ? "pt-4" : "p-5"}`}>

        {sides.map((x) => (
          <button
            key={x.key}
            onClick={() => onMode(x.key)}
            aria-pressed={mode === x.key}
            className={`tour-compare card p-4 text-left ${mode === x.key ? "!shadow-[0_0_0_1px_var(--ink)]" : "hover:!shadow-[0_0_0_1px_var(--control)]"}`}
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

        <Link href="/results" onClick={onResults ? event => { event.preventDefault(); onResults(); } : undefined} className="flex min-h-11 items-center px-1 text-[13px] font-medium underline underline-offset-2">
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

function HelpDialog({ open, onClose, onResults }: { open: boolean; onClose: () => void; onResults: () => void }) {
  return (
    <ActionSheet open={open} onClose={onClose} labelledBy="help-title" className="max-w-3xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Counterpart</p>
              <h2 id="help-title" className="mt-1 text-xl font-semibold tracking-tight">The fast lane for Pro orders</h2>
            </div>
            <ModalCloseButton onClose={onClose} label="Close help" />
          </div>
          <div className="mt-5 grid gap-6 text-[14px] leading-relaxed text-muted md:grid-cols-2 md:gap-8">
            <div className="space-y-4">
              <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink">Meet Pros where they order</h3>
              <p><span className="font-medium text-ink">The common path:</span> Many everyday orders start with a phone call or quick message to the counter. Counterpart turns a contractor&apos;s text into a catalog-matched draft. The rep checks only the uncertain lines, then sends it back to the contractor to approve before it goes to the ERP for purchase.</p>
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
          <div className={MODAL_FOOTER}>
            <button onClick={onResults} className="mr-auto h-9 rounded-lg px-1 text-[13px] font-medium text-muted underline underline-offset-2 hover:text-ink">Sample results</button>
            <button onClick={onClose} className={MODAL_PRIMARY}>Got it</button>
          </div>
    </ActionSheet>
  );
}
