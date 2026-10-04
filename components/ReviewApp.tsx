"use client";

import { useEffect, useMemo, useState } from "react";
import { OrderIllustration } from "@/components/queue/OrderIllustration";
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
import { useOrderDecisions, type OrderStatus } from "@/components/order/useOrderDecisions";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { GenerateButton } from "@/components/queue/GenerateButton";
import { InboxIcon } from "@heroicons/react/24/outline";
import { OrderBadge } from "@/components/queue/OrderBadge";
import { OrderItem } from "@/components/queue/OrderItem";
import { SidebarButton } from "@/components/queue/SidebarButton";
import { SidebarTools } from "@/components/queue/SidebarTools";
import { useFirstArrival, useLiveOrders } from "@/components/queue/useLiveOrders";
import { WaitingForOrders } from "@/components/queue/WaitingForOrders";
import { SettingsDialog, thresholdsChanged } from "@/components/settings/SettingsDialog";
import { useNotifications } from "@/components/notifications/useNotifications";
import { Toasts } from "@/components/notifications/Toasts";
import { NotificationsDialog } from "@/components/notifications/NotificationsDialog";

const DEFAULT_SAMPLE = "o13";
// The queue starts with one order, which arrives as the page opens. Others come from Generate order or Sample results.
const SAMPLES_SHOWN = 1;
const COST_PENDING = "The cost comparison will appear when both matching checks finish.";
// The inbox filter follows an order's life: it's received and the rep checks it, sends it to the contractor, the contractor approves it.
const FILTERS: { value: OrderStatus; label: string; empty: string }[] = [
  { value: "open", label: "Received", empty: "No orders to check." },
  { value: "sent", label: "Sent", empty: "Orders you send wait here for the contractor's approval." },
  { value: "approved", label: "Approved", empty: "Orders the contractor approved, on their way to the ERP." },
];

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
  const notices = useNotifications();
  const [noticesOpen, setNoticesOpen] = useState(false);
  // who and which order, for notification copy ("Owen Park approved order 1013"). Called from callbacks, after `live` exists.
  const describe = (id: string) => {
    const r = id.startsWith("live-") ? live.runs.find((x) => `live-${x.runId}` === id) : samples.find((x) => x.orderId === id);
    return { number: r ? (id.startsWith("live-") ? r.orderId : orderNumber(r.orderId)) : id, who: r?.from?.name ?? "The contractor", company: r?.from?.company };
  };
  const orders = useOrderDecisions({
    onApproved: (id) => {
      trackEvent("order_approved", { demo: true });
      const o = describe(id);
      notices.notify({ kind: "approved", title: `${o.who} approved order ${o.number}`, detail: "Sent to the ERP.", orderId: id, toast: true, read: selected === id });
    },
  });
  const [filter, setFilter] = useState<OrderStatus>("open");
  const live = useLiveOrders({
    samples,
    onStart: () => {
      setMobileOpen(false);
      requestAnimationFrame(() => document.getElementById("review")?.scrollIntoView({ block: "start" }));
    },
    onArrived: (run) => {
      layout.arrived();
      notices.notify({ kind: "arrived", title: `New order from ${run.from?.company ?? "a contractor"}`, detail: `Order ${run.orderId} is in your queue.`, orderId: `live-${run.runId}`, toast: true });
    },
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

  const openNotices = () => {
    setMobileOpen(false);
    setNoticesOpen(true);
    notices.markAllRead();
  };
  const pick = (id: string) => {
    trackEvent("order_selected", { source: id.startsWith("live-") ? "live" : "sample" });
    // Already open (from a notification or the queue): nothing would change, so bring the order back into view and
    // flash its card once, so the click visibly lands.
    if (id === selected) {
      document.getElementById("review")?.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      const card = document.querySelector<HTMLElement>("#review [aria-live=polite]");
      if (card) {
        card.classList.remove("order-flash");
        void card.offsetWidth; // restart the animation if it's still running
        card.classList.add("order-flash");
        card.addEventListener("animationend", () => card.classList.remove("order-flash"), { once: true });
      }
    }
    setSelected(id);
    notices.markOrderRead(id);
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
  // Every order in the inbox, newest first, with where it is in its life. A text still being read is open.
  const queue = [
    ...(pending ? [{ key: `order-${pending.orderId}`, id: "pending", tag: pending.orderId, title: pending.from?.company ?? "New order", preview: pending.text, time: minutesSince(pending.at), count: 0, status: "open" as OrderStatus, active: true, reading: true, arriving: true, onPick: () => {} }] : []),
    ...live.runs.map((r) => {
      const id = `live-${r.runId}`;
      return { key: `order-${r.orderId}`, id, tag: r.orderId, title: r.from?.company ?? "New order", preview: r.text, time: minutesSince(r.runId), count: toCheck(r, id), status: orders.status(id), active: !pending && selected === id, arriving: true, onPick: pick };
    }),
    ...shownSamples.filter((_, i) => i > 0 || arrival !== "empty").map((s, i) => ({
      key: s.orderId, id: s.orderId, tag: orderNumber(s.orderId), title: s.from?.company ?? s.orderId, preview: s.text, time: i === 0 ? minutesSince(loadedAt) : "Earlier",
      count: toCheck(s, s.orderId), status: orders.status(s.orderId), active: !pending && selected === s.orderId, arriving: i === 0, onPick: pick,
    })),
  ];
  // orders still waiting on the rep (including one being read), counted on the phone's orders button
  const openCount = queue.filter((o) => o.status === "open").length;

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
              <BrandBar hideResults processing={live.loading} end={<span className="flex items-center gap-1"><ModalCloseButton label="Hide orders" onClose={toggleSidebar} className="lg:hidden" /><span className="hidden lg:block"><SidebarButton label="Hide orders" expanded onClick={toggleSidebar} /></span></span>} />
              <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-2">
                <h2 className="text-small font-semibold text-ink">Orders</h2>
                <GenerateButton loading={live.loading} onGenerate={live.runLive} beside={!isMobile} />
              </div>
              {live.error && <p role="alert" className="mx-5 mb-2 text-small text-warn">{live.error}</p>}
              <div className="shrink-0 px-4 pb-2">
                <SegmentedControl
                  fill
                  label="Show orders that are"
                  value={filter}
                  onChange={setFilter}
                  options={FILTERS.map((f) => {
                    const n = queue.filter((o) => o.status === f.value).length;
                    return { value: f.value, label: <>{f.label}{n > 0 && <span className="figures ml-1.5 font-normal text-muted">{n}</span>}</> };
                  })}
                />
              </div>
              <nav aria-label="Incoming orders" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                <ul className="flex flex-col gap-0.5">
                  {queue.filter((o) => o.status === filter).map(({ key, ...o }) => <OrderItem key={key} {...o} />)}
                </ul>
                {!queue.some((o) => o.status === filter) && arrival !== "empty" && (
                  <div role="status" className="flex flex-col items-center px-4 py-10 text-center">
                    <OrderIllustration state={filter === "open" ? "complete" : "idle"} className="h-20 w-20" />
                    <p className="mt-3 text-small font-semibold text-ink">{filter === "open" ? "You're all caught up" : filter === "sent" ? "No orders awaiting approval" : "No approved orders yet"}</p>
                    <p className="mt-1.5 text-caption leading-relaxed text-muted">{filter === "open" ? "New orders will appear here. Generate an order to try another review." : FILTERS.find((f) => f.value === filter)!.empty}</p>
                  </div>
                )}
              </nav>
              <SidebarTools
                unread={notices.unread}
                noticesOpen={noticesOpen}
                onNotices={openNotices}
                settingsOpen={settingsOpen}
                settingsChanged={settingsChanged}
                onSettings={() => { setMobileOpen(false); setSettingsOpen((v) => !v); }}
                onAbout={() => { setMobileOpen(false); setHelpOpen(true); }}
              />
        </aside>

        <main id="review" tabIndex={-1} inert={mobileCostOpen || undefined} className="tour-review textured-surface relative min-w-0 flex-1 outline-none [overflow-anchor:none] lg:overflow-y-auto">
          {/* Wide screens: opens the orders sidebar once it's hidden. Phones use the floating button below. */}
          <div className={desktopOpen ? "hidden" : "hidden items-center gap-1 px-4 pt-3 lg:flex"}>
            <SidebarButton label="Show orders" expanded={false} unseen={layout.unseen} onClick={toggleSidebar} />
          </div>
          <div className="mx-auto max-w-4xl px-5 py-8 sm:px-10 xl:max-w-6xl">
            {live.loading ? <OrderLoading progress={live.progress} /> : !result || !selected ? <WaitingForOrders arrived={arrival === "queued"} count={openCount} phone={isMobile} /> : <div className="order-enter"><Review
              key={selected}
              result={result}
              mode={mode}
              T={T}
              unitMin={unitMin}
              catalog={catalog}
              {...orders.forOrder(selected)}
              // when it landed in the queue: a generated order's arrival, or the page load for the sample orders
              receivedAt={liveRun ? liveRun.runId : loadedAt}
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
                const o = describe(selected);
                notices.notify({ kind: "sent", title: `Order ${o.number} sent to ${o.who} for approval`, orderId: selected });
              }}
              onReopen={() => {
                orders.reopen(selected);
                notices.notify({ kind: "reopened", title: `Order ${describe(selected).number} reopened`, orderId: selected });
              }}
            /></div>}
          </div>
        </main>

        {/* wide screens: the AI cost rail slides in from the right edge, the mirror of the orders sidebar. It stays mounted
            (hidden, invisible and inert when closed) so it can slide both ways. */}
        {!isMobile && <aside
          id="cost-rail"
          aria-label="Cost assessment"
          inert={!costOpen || undefined}
          className={`tour-cost hidden w-80 shrink-0 overflow-y-auto border-l border-line bg-panel lg:block lg:transition-[margin-right,visibility] lg:duration-300 lg:ease-[cubic-bezier(0.22,1,0.36,1)] lg:motion-reduce:transition-none ${costOpen ? "" : "lg:invisible lg:-mr-80"}`}
        >
          {live.loading ? <p className="px-6 py-8 text-body leading-relaxed text-muted">{COST_PENDING}</p> : costPanelProps && <CostPanel {...costPanelProps} onCollapse={() => layout.setCostOpen(false)} />}
        </aside>}
      </div>
      {isMobile && !mobileOrders.present && (
        <button
          onClick={toggleSidebar}
          aria-expanded={false}
          aria-controls="orders"
          aria-label={layout.unseen ? `Show orders (${layout.unseen} new)` : openCount ? `Show orders (${openCount} received)` : "Show orders"}
          className={`orders-fab ${layout.unseen ? "orders-fab-new" : ""} fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 grid h-14 w-14 place-items-center rounded-full bg-brand text-onbrand shadow-raise lg:hidden`}
        >
          <InboxIcon aria-hidden strokeWidth={2.5} className="h-5 w-5 text-onbrand" />
          {/* the count of open orders, so the rep knows there's work in the queue; it nudges when a new one arrives */}
          {openCount > 0 && <OrderBadge count={openCount} onBrand className="absolute -right-0.5 -top-0.5" />}
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
      <NotificationsDialog open={noticesOpen} log={notices.log} onClose={() => setNoticesOpen(false)} onOpen={pick} />
      <Toasts toasts={notices.toasts} onDismiss={notices.dismiss} onOpen={pick} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} onResults={() => { setHelpOpen(false); setResultsOpen(true); }} />
      {!unlocked && <AccessLockScreen />}
      <SignupDialog open={live.signup.open} email={live.signup.email} setEmail={live.signup.setEmail} loading={live.signup.loading} error={live.signup.error} onSubmit={live.signup.submit} onClose={live.signup.close} />
    </div>
  );
}
