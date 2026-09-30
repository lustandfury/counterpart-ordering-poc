"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrderResult, Sender } from "@/lib/types";
import Link from "next/link";
import { BrandBar } from "@/components/AppNav";
import { generateOrder } from "@/lib/generate";
import { applyTheme, readTheme, THEMES, type Theme } from "@/lib/theme";
import { CLAUDE_INPUT_PER_TOKEN, CLAUDE_OUTPUT_PER_TOKEN, JEV_INPUT_PER_TOKEN } from "@/lib/pricing";
import { computeView, displayChoices, NONE, segmentText, totals, type Mode, type SlimCatalog, type ViewLine } from "@/lib/view";

const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`);
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
const ORDER_TEXT_LIMIT = 600;
const ORDER_COUNTER_THRESHOLD = ORDER_TEXT_LIMIT * 0.8;

export function ReviewApp({ samples, catalog, initialOrder }: { samples: OrderResult[]; catalog: SlimCatalog; initialOrder?: string }) {
  const [runs, setRuns] = useState<Run[]>([]); // live runs from the composer, newest first
  const [selected, setSelected] = useState(initialOrder ?? samples.find((x) => x.orderId === DEFAULT_SAMPLE)?.orderId ?? samples[0].orderId);
  const [mode, setMode] = useState<Mode>("jev");
  const [T, setT] = useState(0.85);
  const [unitMin, setUnitMin] = useState(0.8);
  // The orders sidebar is open by default on wide screens and closed on phones, where it opens as a bottom sheet.
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteFrom, setPasteFrom] = useState<Sender | undefined>(); // set by Generate, cleared by editing
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  // The rep's decisions and mock sends, per order, so they survive switching between orders
  const [decisions, setDecisions] = useState<Record<string, Decisions>>({});
  const [sent, setSent] = useState<Record<string, number>>({}); // order id -> time sent

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

  const pick = (id: string) => {
    setSelected(id);
    setMobileOpen(false);
    // hand the keyboard to the review, so Enter / j / k act on lines rather than re-clicking the order
    requestAnimationFrame(() => document.getElementById("review")?.focus({ preventScroll: true }));
  };

  async function runLive() {
    if (!pasteText.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: pasteText }) });
      const data = await res.json();
      if (data.code === "SIGNUP_REQUIRED") {
        setSignupOpen(true);
        setSignupError(null);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "The run failed.");
      const runId = Date.now();
      setRuns((r) => [{ ...(data as OrderResult), from: pasteFrom, runId }, ...r]);
      setPasteFrom(undefined);
      pick(`live-${runId}`);
      setPasteText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The run failed.");
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
      setSignupOpen(false);
      await runLive();
    } catch (e) {
      setSignupError(e instanceof Error ? e.message : "We couldn't save your email.");
    } finally {
      setSignupLoading(false);
    }
  }

  const toCheck = (r: OrderResult) => computeView(r, mode, T, catalog, unitMin).filter((l) => !l.approved).length;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="relative flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
        {mobileOpen && <button aria-label="Close orders" tabIndex={-1} onClick={() => setMobileOpen(false)} className="sheet-fade fixed inset-0 z-20 bg-black/40 lg:hidden" />}
        {/* wide screens: a left sidebar; phones: a bottom sheet over the page */}
        <aside
          id="orders"
          aria-label="Orders"
          className={`w-80 shrink-0 flex-col border-r border-line bg-panel max-lg:sheet-up max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:mx-auto max-lg:max-h-[85dvh] max-lg:w-full max-lg:max-w-xl max-lg:rounded-t-2xl max-lg:border-r-0 max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-[0_-8px_30px_rgb(0_0_0/0.18)] ${desktopOpen ? "lg:flex" : "lg:hidden"} ${mobileOpen ? "max-lg:flex" : "max-lg:hidden"}`}
        >
              <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line lg:hidden" />
              <BrandBar end={<SidebarButton label="Hide orders" expanded onClick={toggleSidebar} />} />
              <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                {runs.length > 0 && <OrderGroup label="Your runs">{runs.map((r) => (
                  <OrderItem key={r.runId} id={`live-${r.runId}`} tag="live" title={r.from?.company ?? "Pasted order"} preview={r.text} count={toCheck(r)} sent={!!sent[`live-${r.runId}`]} active={selected === `live-${r.runId}`} onPick={pick} />
                ))}</OrderGroup>}
                <OrderGroup label="Samples">{shownSamples.map((s) => (
                  <OrderItem key={s.orderId} id={s.orderId} tag={s.orderId} title={s.from?.company ?? s.orderId} preview={s.text} count={toCheck(s)} sent={!!sent[s.orderId]} active={selected === s.orderId} onPick={pick} />
                ))}</OrderGroup>
              </nav>
              <div className="shrink-0 border-t border-line p-4">
                <label htmlFor="paste" className="sr-only">Paste a text-message order</label>
                <div className="rounded-[14px] bg-input shadow-[inset_0_0_0_1px_var(--ring)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_var(--control)]">
                  <textarea
                    id="paste"
                    rows={7}
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
                      onClick={() => {
                        const g = generateOrder();
                        setPasteText(g.text);
                        setPasteFrom(g.from);
                        setError(null);
                        requestAnimationFrame(() => document.getElementById("paste")?.focus());
                      }}
                      title="Fill in a random sample order. It always includes at least one line to check."
                      className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted hover:bg-panel hover:text-ink"
                    >
                      <DiceIcon />
                      Generate
                    </button>
                    {pasteText.length >= ORDER_COUNTER_THRESHOLD && <span className="text-[12px] text-muted" aria-label={`${pasteText.length} of ${ORDER_TEXT_LIMIT} characters`}>{pasteText.length}/{ORDER_TEXT_LIMIT}</span>}
                    <button onClick={runLive} disabled={loading || !pasteText.trim()} className="ml-auto h-8 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-ink disabled:opacity-40">
                      {loading ? "Reading…" : "Run ⌘↵"}
                    </button>
                  </div>
                </div>
                {error && <p role="alert" className="mt-2 text-[13px] text-warn">{error}</p>}
              </div>
        </aside>

        <main id="review" tabIndex={-1} className="min-w-0 flex-1 outline-none lg:overflow-y-auto">
          <div className={`px-3 pt-3 max-lg:block ${desktopOpen ? "lg:hidden" : "lg:block"}`}>
            <SidebarButton label="Show orders" expanded={false} onClick={toggleSidebar} />
          </div>
          <div className="mx-auto max-w-4xl px-5 py-8 sm:px-10">
            <Review
              key={selected}
              result={result}
              isLive={!!live}
              mode={mode}
              T={T}
              unitMin={unitMin}
              catalog={catalog}
              resolved={decisions[selected] ?? {}}
              setResolved={(f) => setDecisions((d) => ({ ...d, [selected]: f(d[selected] ?? {}) }))}
              sentAt={sent[selected]}
              onSend={() => setSent((s) => ({ ...s, [selected]: Date.now() }))}
              onReopen={() => setSent((s) => Object.fromEntries(Object.entries(s).filter(([id]) => id !== selected)))}
            />
          </div>
        </main>

        <aside aria-label="Cost assessment" className="shrink-0 border-line bg-panel lg:w-80 lg:overflow-y-auto lg:border-l max-lg:border-t">
          <CostPanel result={result} samples={samples} mode={mode} T={T} unitMin={unitMin} catalog={catalog} onMode={setMode} setT={setT} setUnitMin={setUnitMin} />
        </aside>
      </div>
      {signupOpen && <SignupDialog email={signupEmail} setEmail={setSignupEmail} loading={signupLoading} error={signupError} onSubmit={signUp} onClose={() => setSignupOpen(false)} />}
    </div>
  );
}

function SignupDialog({ email, setEmail, loading, error, onSubmit, onClose }: { email: string; setEmail: (value: string) => void; loading: boolean; error: string | null; onSubmit: () => void; onClose: () => void }) {
  return (
    <div className="action-sheet-backdrop fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="signup-title" className="action-sheet-dialog w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl">
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
          <button type="submit" disabled={loading || !email.trim()} className="mt-4 h-10 w-full rounded-lg bg-brand px-4 text-[14px] font-semibold text-ink disabled:opacity-40">{loading ? "Saving…" : "Continue"}</button>
        </form>
        <p className="mt-3 text-center text-[11px] text-muted">We’ll only use this to identify your Counterpart account.</p>
      </section>
    </div>
  );
}

const DEFAULT_T = 0.85;
const DEFAULT_UNIT = 0.8;

type Thresholds = { mode: Mode; T: number; unitMin: number; setT: (v: number) => void; setUnitMin: (v: number) => void };

function SettingsButton({ open, changed, onToggle }: { open: boolean; changed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="settings"
      aria-label={changed ? "Settings (thresholds changed)" : "Settings"}
      title="Settings"
      className={`relative grid h-8 w-8 place-items-center rounded-lg ${open ? "bg-bg text-ink shadow-[0_0_0_1px_var(--ring)]" : "text-muted hover:bg-bg hover:text-ink"}`}
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

/** Review thresholds, opened from the cost panel. Inline rather than a popover, which the scrolling panel would clip. */
function SettingsSection(p: Thresholds & { changed: boolean }) {
  return (
    <section id="settings" aria-label="Review thresholds" className="rounded-xl bg-bg p-5">
      <h3 className="text-[15px] font-semibold">Review thresholds</h3>
      <p className="mt-1 text-[13px] text-muted">
        {p.mode === "claude" ? "Claude only has no thresholds: it approves its own “high” ratings." : "Higher = the rep checks more lines. Lines re-route instantly; no new API calls."}
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <Slider id="t" label="Product confidence" value={p.T} min={0.5} max={0.99} onChange={p.setT} disabled={p.mode === "claude"} />
        <Slider id="u" label="Quantity clarity" value={p.unitMin} min={0.3} max={0.9} onChange={p.setUnitMin} disabled={p.mode === "claude"} />
      </div>
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
    </section>
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
      className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-bg hover:text-ink"
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
      <h3 className="px-2 pb-1.5 pt-3 text-[12px] font-medium uppercase tracking-wider text-muted">{label}</h3>
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
        aria-label={`${p.tag} ${p.title}`}
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
          <span className="shrink-0 rounded-full bg-warnbg px-2 py-0.5 text-[12px] font-medium leading-none text-warn" aria-label={`${p.count} to check`}>{p.count}</span>
        ) : (
          <span className="shrink-0 text-ok" aria-label="nothing to check"><Check /></span>
        )}
      </button>
    </li>
  );
}

type Decisions = Record<string, string>; // lineId -> sku chosen by the rep

function OrderDetails({ result, isLive, lines, flagged, done, sentAt, onSend }: { result: OrderResult; isLive: boolean; lines: number; flagged: number; done: number; sentAt?: number; onSend: () => void }) {
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
        <button onClick={onSend} disabled={!readyToSend} className="col-start-2 row-start-1 ml-auto h-11 shrink-0 whitespace-nowrap rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40 sm:h-9">
          {sentAt ? "Sent" : "Send order"}
        </button>
      </div>
    </div>
  );
}

function Review({ result, isLive, mode, T, unitMin, catalog, resolved, setResolved, sentAt, onSend, onReopen }: {
  result: OrderResult; isLive: boolean; mode: Mode; T: number; unitMin: number; catalog: SlimCatalog;
  resolved: Decisions; setResolved: (f: (r: Decisions) => Decisions) => void;
  sentAt?: number; onSend: () => void; onReopen: () => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const lines = useMemo(() => computeView(result, mode, T, catalog, unitMin), [result, mode, T, catalog, unitMin]);
  // Unmatched lines need triage before product or quantity checks, so keep them at the top of the review list.
  // The original `lines` order stays intact for reconstructing the contractor's message above the list.
  const orderedLines = useMemo(() => [...lines].sort((a, b) => Number(b.sku === NONE) - Number(a.sku === NONE)), [lines]);
  const flagged = orderedLines.filter((l) => !l.approved);
  const done = flagged.filter((l) => resolved[l.id]).length;
  const current = active ?? flagged.find((l) => !resolved[l.id])?.id ?? null;

  const choose = useCallback((lineId: string, sku: string) => setResolved((r) => ({ ...r, [lineId]: sku })), [setResolved]);
  const undo = (lineId: string) => {
    setActive(lineId);
    setResolved((r) => Object.fromEntries(Object.entries(r).filter(([id]) => id !== lineId)));
  };

  // keyboard: j/k move between flagged lines, 1-3 pick an option, Enter accepts the top pick, x = not in catalog.
  // After a decision the cursor moves to the next line that still needs one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.closest("textarea, select") || (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range");
      if (typing || sentAt || e.metaKey || e.ctrlKey || e.altKey) return;
      const ids = flagged.map((l) => l.id);
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
  }, [flagged, current, choose, resolved, sentAt]);

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
      {flagged.length > 0 && (
        <a href={`#line-${flagged[0].id}`} className="sr-only focus:not-sr-only focus:mb-2 focus:inline-block focus:rounded focus:bg-panel focus:px-2 focus:py-1">
          Skip to the first line to check
        </a>
      )}
      <OrderDetails
        result={result}
        isLive={isLive}
        lines={lines.length}
        flagged={flagged.length}
        done={done}
        sentAt={sentAt}
        onSend={onSend}
      />


      {/* Sending is mocked: it only marks the order as sent in this browser tab */}
      {sentAt ? (
        <div role="status" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-okbg px-5 py-3.5">
          <span className="text-ok"><Check /></span>
          <p className="flex-1 font-medium text-ok">
            Sent to {result.from?.name ?? "the contractor"} at {new Date(sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            <span className="block text-[13px] font-normal text-muted">Demo only: nothing was actually sent.</span>
          </p>
          <button onClick={onReopen} className="text-[13px] text-muted underline hover:text-ink">Reopen</button>
        </div>
      ) : (flagged.length === 0 || done === flagged.length) && (
        <div role="status" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-okbg px-5 py-3">
          <p className="flex-1 font-medium text-ok">{flagged.length === 0 ? "Nothing needs your attention. This order is ready to send." : "All checked. This order is ready to send."}</p>
        </div>
      )}

      <section aria-label="Order" inert={!!sentAt} className={`card overflow-hidden ${sentAt ? "opacity-70" : ""}`}>
        <header className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-line px-4 py-4 sm:flex sm:flex-wrap sm:gap-y-1 sm:px-6">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg text-[11px] font-semibold text-ink" aria-hidden>
            {result.from ? result.from.name.split(" ").map((w) => w[0]).join("").slice(0, 2) : "C"}
          </span>
          <span className="min-w-0 break-words text-[14px]">
            <span className="block font-semibold sm:inline">{result.from?.name ?? "Contractor"}</span>
            {result.from && <span className="block text-[13px] text-muted sm:inline sm:text-[14px]"><span className="hidden sm:inline"> · </span>{result.from.company}</span>}
          </span>
          <span className="col-start-2 whitespace-nowrap text-[12px] text-muted sm:ml-auto sm:text-[13px]">{mode === "jev" ? "Claude + Jev" : "Claude only"}</span>
          {notes && <p className="col-span-2 min-w-0 break-words border-t border-line pt-3 text-[14px] leading-relaxed text-muted sm:basis-full sm:border-t-0 sm:pt-1">“{notes}”</p>}
        </header>
        <ul>
          {orderedLines.map((l) => (
            <LineRow key={l.id} l={l} state={status(l)} pick={resolved[l.id]} active={current === l.id} catalog={catalog} onSelect={() => setActive(l.id)} onChoose={(sku) => choose(l.id, sku)} onUndo={() => undo(l.id)} />
          ))}
        </ul>
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
      <input id={p.id} type="range" min={p.min} max={p.max} step={0.01} value={p.value} disabled={p.disabled} onChange={(e) => p.onChange(Number(e.target.value))} className="h-7 w-full accent-[var(--brand)] disabled:opacity-40" />
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
      <li id={`line-${l.id}`} onClick={props.onSelect} className={`scroll-mt-44 scroll-mb-8 border-b border-line px-6 py-5 last:border-b-0 ${active ? "bg-warnbg" : "bg-warnbg/40"}`} style={{ borderLeft: "4px solid var(--warn-line)" }}>
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
            <button onClick={(e) => { e.stopPropagation(); props.onChoose(l.sku); }} className="min-h-11 rounded-xl bg-okbg px-4 py-2 text-left font-medium text-ok shadow-[0_0_0_1px_var(--ok)]">
              {active && <kbd className="mr-2 text-xs">Enter</kbd>}Confirm {qty} of {l.name}
            </button>
            <button onClick={(e) => { e.stopPropagation(); props.onChoose(NONE); }} className="min-h-11 rounded-xl bg-panel px-4 py-2 font-medium shadow-[0_0_0_1px_var(--control)] hover:bg-panel2">
              {active && <kbd className="mr-2 text-xs text-muted">x</kbd>}Not in catalog
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowAll(true); }} className="text-[13px] text-muted underline hover:text-ink">Other products…</button>
          </div>
        ) : (
          <div role="group" aria-label={`Options for ${l.raw}`} className="mt-3 flex flex-col gap-2">
            {/* column header over the confidence cells */}
            {shown.some((o) => o.probability != null) && (
              <div aria-hidden className="-mb-1 flex justify-end px-3.5 text-[12px] font-medium text-muted">
                <span className="w-24 text-center">Confidence</span>
              </div>
            )}
            {shown.map((o, i) => (
              <button
                key={o.sku}
                aria-pressed={pick === o.sku}
                onClick={(e) => { e.stopPropagation(); props.onChoose(o.sku); }}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2 text-left ${pick === o.sku ? "bg-okbg shadow-[0_0_0_1px_var(--ok)]" : "bg-panel shadow-[0_0_0_1px_var(--control)] hover:bg-panel2"}`}
              >
                <kbd className="w-4 text-center text-xs text-muted">{i + 1}</kbd>
                <span className="min-w-0 flex-1">{o.name}</span>
                {o.probability != null && (
                  <span className="flex w-24 shrink-0 items-center justify-center self-stretch border-l border-line text-[14px] text-muted">
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
    <li id={`line-${l.id}`} onClick={props.onSelect} className={`scroll-mt-44 border-b border-line last:border-b-0 ${active ? "bg-bg" : ""}`}>
      <div className="flex min-h-14 items-center gap-3 px-6 py-3">
        <span className={state === "done" && pick === NONE ? "text-warn" : "text-ok"}>{state === "done" ? <Person /> : <Check />}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[13px] text-muted">{l.raw}</span>
          <span className="block text-ink sm:truncate">{chosen}</span>
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

function CostPanel({ result, samples, mode, T, unitMin, catalog, onMode, setT, setUnitMin }: { result: OrderResult; samples: OrderResult[]; mode: Mode; T: number; unitMin: number; catalog: SlimCatalog; onMode: (m: Mode) => void; setT: (v: number) => void; setUnitMin: (v: number) => void }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const cheaper = cla.t.matchUsd / Math.max(jev.t.matchUsd, 1e-9);
  const faster = cla.t.matchMs / Math.max(jev.t.matchMs, 1);
  const diff = a.filter((l, i) => l.sku !== b[i].sku);
  const per10k = (usdPerOrder: number) => `$${(usdPerOrder * PER).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Cost</h2>
        <SettingsButton open={settingsOpen} changed={changed} onToggle={() => setSettingsOpen((v) => !v)} />
      </div>
      {settingsOpen && <SettingsSection mode={mode} T={T} unitMin={unitMin} setT={setT} setUnitMin={setUnitMin} changed={changed} />}

      <div className="rounded-xl bg-okbg px-4 py-3 text-ok">
        <p className="text-[12px] text-muted">Claude with Jev&apos;s matching is</p>
        <p className="mt-0.5 font-mono text-[15px] font-semibold">{Math.round(cheaper)}× cheaper · {faster.toFixed(1)}× faster</p>
      </div>

      {sides.map((x) => (
        <button
          key={x.key}
          onClick={() => onMode(x.key)}
          aria-pressed={mode === x.key}
          className={`card p-4 text-left ${mode === x.key ? "!shadow-[0_0_0_1px_var(--ink)]" : "hover:!shadow-[0_0_0_1px_var(--control)]"}`}
        >
          <div className="flex items-center justify-between gap-2 text-[14px]">
            <span className="font-semibold">{x.label}</span>
            {mode === x.key && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold leading-none text-ink">showing</span>}
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-xl font-medium tracking-tight">{usd(x.t.usd)}</span>
            <span className="font-mono text-[12px] text-muted">{ms(x.t.ms)}</span>
          </div>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full" style={{ background: "var(--line)" }} aria-hidden>
            {x.key === "jev" ? (
              <span style={{ width: `${(100 * x.t.usd) / maxUsd}%`, background: "var(--ok)" }} />
            ) : (
              // Claude only: light red up to the Claude + Jev cost, full red for the overage beyond it
              <>
                <span style={{ width: `${(100 * Math.min(x.t.usd, jev.t.usd)) / maxUsd}%`, background: "var(--over-soft)" }} />
                <span style={{ width: `${(100 * Math.max(0, x.t.usd - jev.t.usd)) / maxUsd}%`, background: "var(--over)" }} />
              </>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-[12px]">
            <dt className="text-muted">Reading</dt>
            <dd className="text-right font-mono">{usd(x.t.parseUsd)}</dd>
            <dd className="text-right font-mono text-muted">{ms(x.t.parseMs)}</dd>
            <dt className="text-muted">Matching</dt>
            <dd className="text-right font-mono">{usd(x.t.matchUsd)}</dd>
            <dd className="text-right font-mono text-muted">{ms(x.t.matchMs)}</dd>
            <dt className="text-muted">Auto-approved</dt>
            <dd className="col-span-2 text-right font-mono">{x.approved} / {x.lines}</dd>
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-2.5 text-[12px]">
            <span className="text-muted">Per 10,000 orders</span>
            <span className="font-mono text-[14px] font-medium">{per10k(x.t.usd)}</span>
          </div>
        </button>
      ))}

      <Link href="/results" className="px-1 text-[13px] font-medium underline underline-offset-2">
        See all {samples.length} sample results →
      </Link>

      <p className="px-1 text-[12px] text-muted">
        {diff.length ? `They pick different products on ${diff.length} line${diff.length > 1 ? "s" : ""}: ${diff.map((l) => `“${l.raw}”`).join(", ")}.` : "Both pick the same product on every line."}
      </p>
      <p className="px-1 text-[11px] leading-relaxed text-muted">
        Claude at ${(CLAUDE_INPUT_PER_TOKEN * 1e6).toFixed(0)} / ${(CLAUDE_OUTPUT_PER_TOKEN * 1e6).toFixed(0)} per million tokens in / out (list price); Jev at ${(JEV_INPUT_PER_TOKEN * 1e9).toFixed(0)} per billion input tokens. Times are from one run. Synthetic data.
      </p>
    </div>
  );
}
