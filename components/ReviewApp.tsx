"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrderResult, Sender } from "@/lib/types";
import Link from "next/link";
import { BrandBar } from "@/components/AppNav";
import { generateOrder } from "@/lib/generate";
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

type Run = OrderResult & { runId: number };

export function ReviewApp({ samples, catalog, initialOrder }: { samples: OrderResult[]; catalog: SlimCatalog; initialOrder?: string }) {
  const [runs, setRuns] = useState<Run[]>([]); // live runs from the composer, newest first
  const [selected, setSelected] = useState(initialOrder ?? samples.find((x) => x.orderId === "o13")?.orderId ?? samples[0].orderId);
  const [mode, setMode] = useState<Mode>("jev");
  const [T, setT] = useState(0.85);
  const [unitMin, setUnitMin] = useState(0.8);
  // The orders sidebar is open by default on wide screens and closed on phones, where it overlays the page.
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteFrom, setPasteFrom] = useState<Sender | undefined>(); // set by Generate, cleared by editing
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = runs.find((r) => `live-${r.runId}` === selected);
  const result = live ?? samples.find((s) => s.orderId === selected) ?? samples[0];

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

  const toCheck = (r: OrderResult) => computeView(r, mode, T, catalog, unitMin).filter((l) => !l.approved).length;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="relative flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
        {mobileOpen && <button aria-label="Close orders" tabIndex={-1} onClick={() => setMobileOpen(false)} className="fixed inset-0 z-20 bg-black/30 lg:hidden" />}
        <aside
          id="orders"
          aria-label="Orders"
          className={`w-80 shrink-0 flex-col border-r border-line bg-panel max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:shadow-xl ${desktopOpen ? "lg:flex" : "lg:hidden"} ${mobileOpen ? "max-lg:flex" : "max-lg:hidden"}`}
        >
              <BrandBar end={<SidebarButton label="Hide orders" expanded onClick={toggleSidebar} />} />
              <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                {runs.length > 0 && <OrderGroup label="Your runs">{runs.map((r) => (
                  <OrderItem key={r.runId} id={`live-${r.runId}`} tag="live" title={r.from?.company ?? "Pasted order"} preview={r.text} count={toCheck(r)} active={selected === `live-${r.runId}`} onPick={pick} />
                ))}</OrderGroup>}
                <OrderGroup label="Samples">{samples.map((s) => (
                  <OrderItem key={s.orderId} id={s.orderId} tag={s.orderId} title={s.from?.company ?? s.orderId} preview={s.text} count={toCheck(s)} active={selected === s.orderId} onPick={pick} />
                ))}</OrderGroup>
              </nav>
              <div className="shrink-0 border-t border-line p-4">
                <label htmlFor="paste" className="sr-only">Paste a text-message order</label>
                <div className="rounded-[14px] bg-input shadow-[inset_0_0_0_1px_var(--ring)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_var(--control)]">
                  <textarea
                    id="paste"
                    rows={7}
                    value={pasteText}
                    maxLength={600}
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
                    <span className="text-[12px] text-muted">{pasteText.length}/600</span>
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
            <Review key={selected} result={result} isLive={!!live} mode={mode} T={T} unitMin={unitMin} catalog={catalog} />
          </div>
        </main>

        <aside aria-label="Cost assessment" className="shrink-0 border-line bg-panel lg:w-80 lg:overflow-y-auto lg:border-l max-lg:border-t">
          <CostPanel result={result} samples={samples} mode={mode} T={T} unitMin={unitMin} catalog={catalog} onMode={setMode} setT={setT} setUnitMin={setUnitMin} />
        </aside>
      </div>
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
    </section>
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

function OrderItem(p: { id: string; tag: string; title: string; preview: string; count: number; active: boolean; onPick: (id: string) => void }) {
  const preview = p.preview.replace(/\s+/g, " ").trim();
  return (
    <li>
      <button
        onClick={() => p.onPick(p.id)}
        aria-current={p.active ? "true" : undefined}
        aria-label={`${p.tag} ${p.title}`}
        className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${p.active ? "bg-bg shadow-[inset_3px_0_0_var(--brand)]" : "hover:bg-bg"}`}
      >
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14px] ${p.active ? "font-semibold" : "font-medium"}`}>{p.title}</span>
          <span className="block truncate text-[12px] text-muted">
            <span className="font-mono">{p.tag}</span> · {preview}
          </span>
        </span>
        {p.count > 0 ? (
          <span className="shrink-0 rounded-full bg-warnbg px-2 py-0.5 text-[12px] font-medium leading-none text-warn" aria-label={`${p.count} to check`}>{p.count}</span>
        ) : (
          <span className="shrink-0 text-ok" aria-label="nothing to check"><Check /></span>
        )}
      </button>
    </li>
  );
}

function Review({ result, isLive, mode, T, unitMin, catalog }: { result: OrderResult; isLive: boolean; mode: Mode; T: number; unitMin: number; catalog: SlimCatalog }) {
  const [resolved, setResolved] = useState<Record<string, string>>({}); // lineId -> sku chosen by the rep
  const [active, setActive] = useState<string | null>(null);
  const lines = useMemo(() => computeView(result, mode, T, catalog, unitMin), [result, mode, T, catalog, unitMin]);
  const flagged = lines.filter((l) => !l.approved);
  const done = flagged.filter((l) => resolved[l.id]).length;
  const current = active ?? flagged.find((l) => !resolved[l.id])?.id ?? null;

  const choose = useCallback((lineId: string, sku: string) => setResolved((r) => ({ ...r, [lineId]: sku })), []);
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
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
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
  }, [flagged, current, choose, resolved]);

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
      <div className="mb-6 flex flex-wrap items-baseline gap-x-5 gap-y-1" aria-live="polite">
        <h1 className="text-2xl font-semibold tracking-tight">{isLive ? "Your order" : `Order ${result.orderId}`}</h1>
        <span className="text-muted">{lines.length} lines</span>
        <span className="font-medium text-ok">{lines.length - flagged.length} auto-approved</span>
        <span className="font-medium text-warn">{flagged.length} to check{flagged.length ? ` · ${done} done` : ""}</span>
      </div>


      {(flagged.length === 0 || done === flagged.length) && (
        <p role="status" className="mb-6 rounded-xl bg-okbg px-5 py-3.5 font-medium text-ok">
          {flagged.length === 0 ? "Nothing needs your attention. This order is ready to send." : "All checked. This order is ready to send."}
        </p>
      )}

      <section aria-label="Order" className="card overflow-hidden">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-6 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-bg text-[11px] font-semibold text-ink" aria-hidden>
            {result.from ? result.from.name.split(" ").map((w) => w[0]).join("").slice(0, 2) : "C"}
          </span>
          <span className="text-[14px]">
            <span className="font-semibold">{result.from?.name ?? "Contractor"}</span>
            {result.from && <span className="text-muted"> · {result.from.company}</span>}
          </span>
          <span className="whitespace-nowrap text-[13px] text-muted sm:ml-auto">{mode === "jev" ? "Claude + Jev" : "Claude only"}</span>
          {notes && <p className="basis-full pt-1 text-[14px] leading-relaxed text-muted">“{notes}”</p>}
        </header>
        <ul>
          {lines.map((l) => (
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
  const qty = fmtQty(l.qty, catalog[l.sku]?.unit ?? l.unit);

  if (state === "flag") {
    const shown = displayChoices(l);
    const quickLine = l.quantityOnly && !showAll;
    // one short instruction, beside the line, for what the rep should do here
    const hint = quickLine
      ? "Confirm if the quantity is right, or check with the customer"
      : l.sku === NONE
        ? "Pick the product if we carry it, or Not in catalog"
        : "Pick the product the customer meant";
    const quick = l.quantityOnly && !showAll;
    return (
      <li id={`line-${l.id}`} onClick={props.onSelect} className={`scroll-mt-44 scroll-mb-8 border-b border-line px-6 py-5 last:border-b-0 ${active ? "bg-warnbg" : "bg-warnbg/40"}`} style={{ borderLeft: "4px solid var(--warn-line)" }}>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-[14px] font-medium">{l.raw}</span>
          <span className="rounded-full bg-warnbg px-2 py-0.5 text-[12px] font-semibold text-warn">Check this</span>
          <span className="text-[13px] text-muted sm:ml-auto">{hint}</span>
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {l.reasons.map((r) => (
            <li key={r} className="text-[14px] text-warn">{r}</li>
          ))}
        </ul>
        {quick ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={(e) => { e.stopPropagation(); props.onChoose(l.sku); }} className="min-h-11 rounded-xl bg-okbg px-4 py-2 text-left font-medium text-ok shadow-[0_0_0_1px_var(--ok)]">
              <kbd className="mr-2 text-xs">Enter</kbd>Confirm {qty} of {l.name}
            </button>
            <button onClick={(e) => { e.stopPropagation(); props.onChoose(NONE); }} className="min-h-11 rounded-xl bg-panel px-4 py-2 font-medium shadow-[0_0_0_1px_var(--control)] hover:bg-panel2">
              <kbd className="mr-2 text-xs text-muted">x</kbd>Not in catalog
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowAll(true); }} className="text-[13px] text-muted underline hover:text-ink">Other products…</button>
          </div>
        ) : (
          <div role="group" aria-label={`Options for ${l.raw}`} className="mt-4 flex flex-col gap-2">
            {shown.map((o, i) => (
              <button
                key={o.sku}
                aria-pressed={pick === o.sku}
                onClick={(e) => { e.stopPropagation(); props.onChoose(o.sku); }}
                className={`flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3.5 py-2 text-left ${pick === o.sku ? "bg-okbg shadow-[0_0_0_1px_var(--ok)]" : "bg-panel shadow-[0_0_0_1px_var(--control)] hover:bg-panel2"}`}
              >
                <kbd className="w-4 text-center text-xs text-muted">{i + 1}</kbd>
                <span className="min-w-[12rem] flex-1">{o.name}</span>
                {o.probability != null && (
                  <span className="ml-6 flex w-28 shrink-0 items-center gap-1.5 text-xs text-muted sm:ml-0" aria-label={`${Math.round(o.probability * 100)} percent`}>
                    <span className="h-1.5 flex-1 rounded-full" style={{ background: "var(--bar)" }}>
                      <span className="block h-full rounded-full" style={{ width: `${Math.round(o.probability * 100)}%`, background: "var(--ok)" }} />
                    </span>
                    <span className="w-8 text-right">{Math.round(o.probability * 100)}%</span>
                  </span>
                )}
                {o.probability == null && i === 0 && <span className="text-xs text-muted">Claude: {l.confidence}</span>}
              </button>
            ))}
          </div>
        )}
        <p className="mt-4 flex flex-wrap items-center gap-x-4 text-[13px] text-muted">
          <span>Quantity: <strong className="text-ink">{qty}</strong></span>
          {!quick && <span><kbd>Enter</kbd> takes the top pick · <kbd>x</kbd> not in catalog</span>}
        </p>
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
        <p className="font-mono text-[15px] font-semibold">{Math.round(cheaper)}× cheaper · {faster.toFixed(1)}× faster</p>
        <p className="mt-0.5 text-[12px] text-muted">Jev&apos;s matching step vs Claude only, this order</p>
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
            <span style={{ width: `${(100 * x.t.parseUsd) / maxUsd}%`, background: "var(--bar)" }} />
            <span style={{ width: `${(100 * x.t.matchUsd) / maxUsd}%`, background: x.key === "jev" ? "var(--ok)" : "var(--control)" }} />
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
