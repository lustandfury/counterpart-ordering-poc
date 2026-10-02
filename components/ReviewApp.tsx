"use client";

import { useEffect, useMemo, useState } from "react";
import { useThresholds } from "@/lib/settings";
import { trackEvent } from "@/lib/analytics";
import type { OrderResult } from "@/lib/types";
import type { EvalData } from "@/lib/eval/display";
import { computeView, orderNumber, type Mode, type SlimCatalog } from "@/lib/view";
import { ago } from "@/lib/format";
import { useAccess } from "@/components/AccessProvider";
import { BrandBar } from "@/components/AppNav";
import { ResultsDisplay } from "@/components/ResultsDisplay";
import { OrderLoading } from "@/components/OrderLoading";
import { narrow, useWorkspaceLayout } from "@/components/useWorkspaceLayout";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { ModalCloseButton } from "@/components/ui/ModalCloseButton";
import { SheetHeader } from "@/components/ui/Sheet";
import { AccessLockScreen } from "@/components/access/AccessLockScreen";
import { SignupDialog } from "@/components/access/SignupDialog";
import { CostPanel } from "@/components/cost/CostPanel";
import { HelpDialog } from "@/components/help/HelpDialog";
import { Review } from "@/components/order/Review";
import { useOrderDecisions } from "@/components/order/useOrderDecisions";
import { GenerateButton } from "@/components/queue/GenerateButton";
import { OrderBadge, OrdersIcon } from "@/components/queue/OrderBadge";
import { OrderItem } from "@/components/queue/OrderItem";
import { SidebarButton } from "@/components/queue/SidebarButton";
import { SidebarTools } from "@/components/queue/SidebarTools";
import { useFirstArrival, useLiveOrders } from "@/components/queue/useLiveOrders";
import { WaitingForOrders } from "@/components/queue/WaitingForOrders";
import { SettingsDialog, thresholdsChanged } from "@/components/settings/SettingsDialog";

const DEFAULT_SAMPLE = "o13";
// The queue starts with one order, which arrives as the page opens. Others come from Generate order or Sample results.
const SAMPLES_SHOWN = 1;
const COST_PENDING = "The cost comparison will appear when both matching checks finish.";

/** The rep's workspace: the order queue, the open order's review, and the AI cost comparison beside it. */
export function ReviewApp({ samples, catalog, initialOrder, evalData }: { samples: OrderResult[]; catalog: SlimCatalog; initialOrder?: string; evalData: EvalData }) {
  // Nothing is open until the rep picks an order from the queue (or follows a link to one)
  const [selected, setSelected] = useState<string | null>(initialOrder ?? null);
  const [mode, setMode] = useState<Mode>("jev");
  const { T, unitMin, setT, setUnitMin } = useThresholds();
  const layout = useWorkspaceLayout();
  const { isMobile, desktopOpen, setMobileOpen, mobileOrders, mobileCostOpen, setMobileCostOpen, costOpen, toggleSidebar } = layout;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const orders = useOrderDecisions();
  const live = useLiveOrders({
    samples,
    onStart: () => {
      setMobileOpen(false);
      requestAnimationFrame(() => document.getElementById("review")?.scrollIntoView({ block: "start" }));
    },
    onArrived: layout.arrived,
    onError: () => { if (narrow()) setMobileOpen(true); },
  });
  const { unlocked } = useAccess();
  const arrival = useFirstArrival(unlocked, !!initialOrder, layout.arrived);
  // Arrival times in the queue are relative to page load, so the default order always arrives "just now".
  const [loadedAt] = useState(() => Date.now());
  const [now, setNow] = useState(loadedAt);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const liveRun = live.runs.find((r) => `live-${r.runId}` === selected);
  const result: OrderResult | undefined = liveRun ?? samples.find((s) => s.orderId === selected);
  // The sidebar lists only a few samples: the default order first, then the next ones in file order.
  // A sample opened from a link (e.g. from Sample results) is added so the active order is always listed.
  const shownSamples = useMemo(() => {
    const ids = new Set([...new Set([DEFAULT_SAMPLE, ...samples.map((s) => s.orderId)])].filter((id) => samples.some((s) => s.orderId === id)).slice(0, SAMPLES_SHOWN));
    if (initialOrder) ids.add(initialOrder);
    if (selected && samples.some(s => s.orderId === selected)) ids.add(selected);
    return [...ids].map((id) => samples.find((s) => s.orderId === id)!);
  }, [samples, initialOrder, selected]);

  const pick = (id: string) => {
    trackEvent("order_selected", { source: id.startsWith("live-") ? "live" : "sample" });
    setSelected(id);
    setMobileOpen(false);
    // hand the keyboard to the review, so Enter / j / k act on lines rather than re-clicking the order
    requestAnimationFrame(() => document.getElementById("review")?.focus({ preventScroll: true }));
  };

  // lines still to check in an order: flagged by the current rule and not yet decided by the rep
  const toCheck = (r: OrderResult, id: string) => computeView(r, mode, T, catalog, unitMin).filter((l) => !l.approved && !orders.decisions[id]?.[l.id]).length;
  const minutesSince = (at: number) => ago(Math.floor((now - at) / 60_000));
  const settingsChanged = thresholdsChanged(T, unitMin);
  const costPanelProps = result && {
    result, samples, mode, T, unitMin, catalog,
    onResults: () => setResultsOpen(true),
    onMode: (nextMode: Mode) => {
      if (nextMode !== mode) trackEvent("comparison_mode_changed", { mode: nextMode });
      setMode(nextMode);
    },
  };
  const { pending } = live;

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
          className={`tour-orders w-80 shrink-0 flex-col border-r border-line bg-panel lg:flex lg:transition-[margin-left,visibility] lg:duration-300 lg:ease-[cubic-bezier(0.22,1,0.36,1)] lg:motion-reduce:transition-none max-lg:sheet-up max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:mx-auto max-lg:max-h-[85dvh] max-lg:w-full max-lg:rounded-t-[12px] max-lg:border-r-0 max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-[0_-8px_30px_rgb(0_0_0/0.18)] ${desktopOpen ? "" : "lg:invisible lg:-ml-80"} ${mobileOrders.present ? "max-lg:flex" : "max-lg:hidden"}`}
        >
              <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line lg:hidden" />
              <BrandBar hideResults end={<><ModalCloseButton label="Hide orders" onClose={toggleSidebar} className="lg:hidden" /><span className="hidden lg:block"><SidebarButton label="Hide orders" expanded onClick={toggleSidebar} /></span></>} />
              <div className="shrink-0 px-4 pb-2 pt-2">
                <GenerateButton loading={live.loading} onGenerate={live.runLive} beside={!isMobile} />
              </div>
              {live.error && <p role="alert" className="mx-5 mb-2 text-small text-warn">{live.error}</p>}
              <nav aria-label="Incoming orders" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                <ul className="flex flex-col gap-0.5">
                  {pending && (
                    <OrderItem key={`order-${pending.orderId}`} id="pending" tag={pending.orderId} title={pending.from?.company ?? "New order"} preview={pending.text} time={minutesSince(pending.at)} count={0} sent={false} active reading arriving onPick={() => {}} />
                  )}
                  {live.runs.map((r) => (
                    <OrderItem key={`order-${r.orderId}`} id={`live-${r.runId}`} tag={r.orderId} title={r.from?.company ?? "New order"} preview={r.text} time={minutesSince(r.runId)} count={toCheck(r, `live-${r.runId}`)} sent={!!orders.sent[`live-${r.runId}`]} active={!pending && selected === `live-${r.runId}`} arriving onPick={pick} />
                  ))}
                  {shownSamples.filter((_, i) => i > 0 || arrival !== "empty").map((s, i) => (
                    <OrderItem key={s.orderId} id={s.orderId} tag={orderNumber(s.orderId)} title={s.from?.company ?? s.orderId} preview={s.text} time={i === 0 ? minutesSince(loadedAt) : "Earlier"} count={toCheck(s, s.orderId)} sent={!!orders.sent[s.orderId]} active={!pending && selected === s.orderId} arriving={i === 0} onPick={pick} />
                  ))}
                </ul>
              </nav>
              <SidebarTools
                settingsOpen={settingsOpen}
                settingsChanged={settingsChanged}
                onSettings={() => { setMobileOpen(false); setSettingsOpen((v) => !v); }}
                onAbout={() => { setMobileOpen(false); setHelpOpen(true); }}
              />
        </aside>

        <main id="review" tabIndex={-1} inert={mobileCostOpen || undefined} className="tour-review textured-surface relative min-w-0 flex-1 outline-none [overflow-anchor:none] lg:overflow-y-auto">
          {/* Wide screens: opens the orders sidebar once it's hidden. Phones use the floating button below. */}
          <div className={desktopOpen ? "hidden" : "hidden px-4 pt-3 lg:flex"}>
            <SidebarButton label="Show orders" expanded={false} unseen={layout.unseen} onClick={toggleSidebar} />
          </div>
          <div className="mx-auto max-w-4xl px-5 py-8 sm:px-10 xl:max-w-6xl">
            {live.loading ? <OrderLoading progress={live.progress} /> : !result || !selected ? <WaitingForOrders arrived={arrival === "queued"} phone={isMobile} /> : <div className="order-enter"><Review
              key={selected}
              result={result}
              mode={mode}
              T={T}
              unitMin={unitMin}
              catalog={catalog}
              {...orders.forOrder(selected)}
              phone={isMobile}
              compare={{
                open: isMobile ? mobileCostOpen : costOpen,
                controls: isMobile ? "cost-comparison" : "cost-rail",
                onToggle: () => {
                  if (isMobile) { setMobileOpen(false); setMobileCostOpen(true); } else layout.setCostOpen((v) => !v);
                },
              }}
              onSend={() => {
                trackEvent("order_sent", { source: liveRun ? "live" : "sample", mode, demo: true });
                orders.send(selected);
              }}
              onReopen={() => orders.reopen(selected)}
            /></div>}
          </div>
        </main>

        {!isMobile && costOpen && <aside id="cost-rail" aria-label="Cost assessment" className="tour-cost hidden w-80 shrink-0 overflow-y-auto border-l border-line bg-panel lg:block">
          {live.loading ? <p className="px-6 py-8 text-body leading-relaxed text-muted">{COST_PENDING}</p> : costPanelProps && <CostPanel {...costPanelProps} onCollapse={() => layout.setCostOpen(false)} />}
        </aside>}
      </div>
      {isMobile && !mobileOrders.present && (
        <button
          onClick={toggleSidebar}
          aria-expanded={false}
          aria-controls="orders"
          aria-label={layout.unseen ? `Show orders (${layout.unseen} new)` : "Show orders"}
          className="orders-fab fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 grid h-14 w-14 place-items-center rounded-full bg-panel text-ink shadow-raise shadow-ring lg:hidden"
        >
          <OrdersIcon />
          {layout.unseen > 0 && <OrderBadge count={layout.unseen} className="absolute -right-0.5 -top-0.5" />}
        </button>
      )}
      {isMobile && <ActionSheet open={mobileCostOpen} id="cost-comparison" label="Cost assessment" onClose={() => setMobileCostOpen(false)} className="tour-cost max-w-md">
        {live.loading ? <><SheetHeader title="Cost" closeLabel="Close cost comparison" onClose={() => setMobileCostOpen(false)} /><p className="py-8 text-body text-muted">{COST_PENDING}</p></> : costPanelProps && <CostPanel {...costPanelProps} onClose={() => setMobileCostOpen(false)} />}
      </ActionSheet>}
      <ActionSheet open={resultsOpen} id="sample-results-sheet" labelledBy="sample-results-title" onClose={() => setResultsOpen(false)} className="max-w-6xl">
        <ResultsDisplay data={evalData} samples={samples} senders={Object.fromEntries(samples.flatMap(sample => sample.from ? [[sample.orderId, sample.from]] : []))} onClose={() => setResultsOpen(false)} onOpenOrder={id => {
          pick(id);
          setResultsOpen(false);
          setMobileCostOpen(false);
        }} />
      </ActionSheet>
      <SettingsDialog open={settingsOpen} mode={mode} T={T} unitMin={unitMin} setT={setT} setUnitMin={setUnitMin} changed={settingsChanged} onClose={() => setSettingsOpen(false)} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} onResults={() => { setHelpOpen(false); setResultsOpen(true); }} />
      {!unlocked && <AccessLockScreen />}
      <SignupDialog open={live.signup.open} email={live.signup.email} setEmail={live.signup.setEmail} loading={live.signup.loading} error={live.signup.error} onSubmit={live.signup.submit} onClose={live.signup.close} />
    </div>
  );
}
