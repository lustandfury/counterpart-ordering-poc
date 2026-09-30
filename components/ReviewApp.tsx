"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrderResult } from "@/lib/types";
import { CLAUDE_INPUT_PER_TOKEN, CLAUDE_OUTPUT_PER_TOKEN, JEV_INPUT_PER_TOKEN } from "@/lib/pricing";
import { computeView, NONE, segmentText, totals, type Mode, type SlimCatalog, type ViewLine } from "@/lib/view";

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

export function ReviewApp({ samples, catalog }: { samples: OrderResult[]; catalog: SlimCatalog }) {
  const [runs, setRuns] = useState<Run[]>([]); // live runs from the composer, newest first
  const [selected, setSelected] = useState(samples.find((x) => x.orderId === "o13")?.orderId ?? samples[0].orderId);
  const [mode, setMode] = useState<Mode>("jev");
  const [T, setT] = useState(0.85);
  const [unitMin, setUnitMin] = useState(0.8);
  const [sidebar, setSidebar] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = runs.find((r) => `live-${r.runId}` === selected);
  const result = live ?? samples.find((s) => s.orderId === selected) ?? samples[0];

  // Cmd/Ctrl+B toggles the orders sidebar, Escape closes it (as in code editors)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebar((v) => !v);
      } else if (e.key === "Escape") setSidebar(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = (id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width: 1023px)").matches) setSidebar(false);
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
      setRuns((r) => [{ ...(data as OrderResult), runId }, ...r]);
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
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel2 px-2 text-sm">
        <button
          onClick={() => setSidebar((v) => !v)}
          aria-expanded={sidebar}
          aria-controls="orders"
          aria-label={sidebar ? "Hide orders" : "Show orders"}
          title="Orders (⌘B)"
          className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-panel hover:text-ink"
        >
          <SidebarIcon />
        </button>
        <strong className="font-semibold">Counterpart</strong>
        <span className="text-muted" aria-hidden>/</span>
        <button onClick={() => setSidebar(true)} className="truncate rounded px-1 text-muted hover:bg-panel hover:text-ink">
          {live ? "Your order" : `Order ${result.orderId}`}
        </button>
        <span className="ml-auto hidden rounded-full border border-line px-2 py-0.5 text-xs text-muted sm:inline">outside-in sketch · synthetic data · not affiliated with any company</span>
      </header>

      <div className="relative flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
        {sidebar && (
          <>
            <button aria-label="Close orders" tabIndex={-1} onClick={() => setSidebar(false)} className="fixed inset-0 z-20 bg-black/30 lg:hidden" />
            <aside id="orders" aria-label="Orders" className="flex w-72 shrink-0 flex-col border-r border-line bg-panel2 max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:shadow-xl">
              <div className="flex h-10 shrink-0 items-center justify-between px-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Orders
                <button onClick={() => setSidebar(false)} aria-label="Hide orders" className="grid h-7 w-7 place-items-center rounded hover:bg-panel">×</button>
              </div>
              <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
                {runs.length > 0 && <OrderGroup label="Your runs">{runs.map((r) => (
                  <OrderItem key={r.runId} id={`live-${r.runId}`} title="Pasted order" preview={r.text} count={toCheck(r)} active={selected === `live-${r.runId}`} onPick={pick} />
                ))}</OrderGroup>}
                <OrderGroup label="Samples">{samples.map((s) => (
                  <OrderItem key={s.orderId} id={s.orderId} title={s.orderId} preview={s.text} count={toCheck(s)} active={selected === s.orderId} onPick={pick} />
                ))}</OrderGroup>
              </nav>
              <div className="shrink-0 border-t border-line p-2">
                <label htmlFor="paste" className="sr-only">Paste a text-message order</label>
                <div className="rounded-lg border border-control bg-panel focus-within:ring-2 focus-within:ring-[var(--focus)]">
                  <textarea
                    id="paste"
                    rows={4}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        runLive();
                      }
                    }}
                    placeholder={"Paste a text-message order…\n20 of the 2x6 (8ft)\n3 sheets 5/8 type X"}
                    className="block w-full resize-none rounded-t-lg bg-transparent px-2.5 pt-2 font-mono text-[13px] outline-none"
                  />
                  <div className="flex items-center gap-2 px-2 pb-2">
                    <span className="text-[11px] text-muted">Live run · paid API calls</span>
                    <button onClick={runLive} disabled={loading || !pasteText.trim()} className="ml-auto h-7 rounded-md bg-ink px-3 text-xs font-medium text-bg disabled:opacity-40">
                      {loading ? "Reading…" : "Run ⌘↵"}
                    </button>
                  </div>
                </div>
                {error && <p role="alert" className="mt-1.5 text-xs text-warn">{error}</p>}
              </div>
            </aside>
          </>
        )}

        <main className="min-w-0 flex-1 lg:overflow-y-auto">
          <div className="sticky top-0 z-10 flex flex-wrap items-end gap-x-5 gap-y-2 border-b border-line bg-bg/95 px-4 py-2.5 backdrop-blur sm:px-6">
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-muted">Matching by</legend>
              <div className="inline-flex overflow-hidden rounded-md border border-control text-sm" role="group">
                {(["jev", "claude"] as const).map((m) => (
                  <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)} className={`h-8 px-3 ${mode === m ? "bg-ink text-bg" : "bg-panel hover:bg-panel2"}`}>
                    {m === "jev" ? "Claude + Jev" : "Claude only"}
                  </button>
                ))}
              </div>
            </fieldset>
            <Slider id="t" label="Product confidence" value={T} min={0.5} max={0.99} onChange={setT} disabled={mode === "claude"} />
            <Slider id="u" label="Quantity clarity" value={unitMin} min={0.3} max={0.9} onChange={setUnitMin} disabled={mode === "claude"} />
            <p className="basis-full text-xs text-muted sm:basis-auto sm:self-center">
              {mode === "claude" ? "Claude only approves its own “high” ratings." : "Higher = the rep checks more lines."}
            </p>
          </div>
          <div className="px-4 py-4 sm:px-6">
            <Review key={selected} result={result} isLive={!!live} mode={mode} T={T} unitMin={unitMin} catalog={catalog} />
          </div>
        </main>

        <aside aria-label="Cost assessment" className="shrink-0 border-line bg-panel2 lg:w-80 lg:overflow-y-auto lg:border-l max-lg:border-t">
          <CostPanel result={result} samples={samples} mode={mode} T={T} unitMin={unitMin} catalog={catalog} onMode={setMode} />
        </aside>
      </div>
    </div>
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
      <h3 className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted">{label}</h3>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function OrderItem(p: { id: string; title: string; preview: string; count: number; active: boolean; onPick: (id: string) => void }) {
  const preview = p.preview.replace(/\s+/g, " ").trim();
  return (
    <li>
      <button
        onClick={() => p.onPick(p.id)}
        aria-current={p.active ? "true" : undefined}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${p.active ? "bg-panel shadow-sm ring-1 ring-line" : "hover:bg-panel"}`}
      >
        <span className="w-9 shrink-0 font-mono text-xs text-muted">{p.title.startsWith("o") ? p.title : "live"}</span>
        <span className="min-w-0 flex-1 truncate text-[13px]">{preview}</span>
        {p.count > 0 ? (
          <span className="shrink-0 rounded-full bg-warnbg px-1.5 text-[11px] font-medium text-warn" aria-label={`${p.count} to check`}>{p.count}</span>
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
      else if (line && !line.quantityOnly && /^[1-3]$/.test(e.key) && line.options[Number(e.key) - 1]) decide(line.options[Number(e.key) - 1].sku);
      else if (line && e.key === "Enter" && t.tagName !== "BUTTON") decide(line.sku);
      else if (line && e.key === "x") decide(NONE);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flagged, current, choose, resolved]);

  useEffect(() => {
    if (current) document.getElementById(`line-${current}`)?.scrollIntoView({ block: "nearest" });
  }, [current]);


  const segments = useMemo(() => segmentText(result.text, lines), [result, lines]);
  const status = (l: ViewLine) => (l.approved ? "ok" : resolved[l.id] ? "done" : "flag");

  return (
    <>
      {flagged.length > 0 && (
        <a href={`#line-${flagged[0].id}`} className="sr-only focus:not-sr-only focus:mb-2 focus:inline-block focus:rounded focus:bg-panel focus:px-2 focus:py-1">
          Skip to the first line to check
        </a>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1" aria-live="polite">
        <h1 className="text-base font-semibold">{isLive ? "Your order" : `Order ${result.orderId}`}</h1>
        <span className="text-muted">{lines.length} lines</span>
        <span className="font-medium text-ok">{lines.length - flagged.length} auto-approved</span>
        <span className="font-medium text-warn">{flagged.length} to check{flagged.length ? ` · ${done} done` : ""}</span>
        <span className="ml-auto hidden text-xs text-muted xl:inline">Keys: <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>1</kbd>–<kbd>3</kbd> pick · <kbd>Enter</kbd> accept · <kbd>x</kbd> not in catalog</span>
      </div>

      {(flagged.length === 0 || done === flagged.length) && (
        <p role="status" className="mb-3 rounded-lg border border-ok bg-okbg px-3 py-2 font-medium text-ok">
          {flagged.length === 0 ? "Nothing needs your attention. This order is ready to send." : "All checked. This order is ready to send."}
        </p>
      )}

      <div className="flex flex-col gap-4">
        <section aria-label="Order message" className="max-w-2xl">
          <h2 className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-panel2 text-[10px] font-semibold text-ink ring-1 ring-line" aria-hidden>C</span>
            Contractor · text message
          </h2>
          <p className="whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-line bg-panel px-4 py-3 font-mono text-[13px] leading-6">
            {segments.map((s, i) =>
              s.lineId ? (
                <button
                  key={i}
                  onClick={() => setActive(s.lineId!)}
                  className={`rounded-sm px-0.5 text-left ${
                    { ok: "", done: "opacity-70", flag: "bg-warnbg underline decoration-warnline decoration-2 underline-offset-2" }[status(lines.find((l) => l.id === s.lineId)!)]
                  } ${current === s.lineId ? "ring-2 ring-[var(--focus)]" : ""}`}
                >
                  {s.text}
                </button>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </p>
        </section>

        <section aria-label="Draft order" className="min-w-0">
          <h2 className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] font-semibold text-bg" aria-hidden>AI</span>
            Draft order · {mode === "jev" ? "Claude + Jev" : "Claude only"}
          </h2>
          <ul className="overflow-hidden rounded-lg border border-line bg-panel">
            {lines.map((l) => (
              <LineRow key={l.id} l={l} state={status(l)} pick={resolved[l.id]} active={current === l.id} catalog={catalog} onSelect={() => setActive(l.id)} onChoose={(sku) => choose(l.id, sku)} onUndo={() => undo(l.id)} />
            ))}
          </ul>
        </section>
      </div>

    </>
  );
}

function Slider(p: { id: string; label: string; value: number; min: number; max: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className="w-36">
      <label htmlFor={p.id} className="mb-1 flex justify-between text-xs font-medium text-muted">
        <span>{p.label}</span>
        <span className="text-ink">{p.value.toFixed(2)}</span>
      </label>
      <input id={p.id} type="range" min={p.min} max={p.max} step={0.01} value={p.value} disabled={p.disabled} onChange={(e) => p.onChange(Number(e.target.value))} className="h-7 w-full accent-[var(--ok)] disabled:opacity-40" />
    </div>
  );
}

function LineRow(props: { l: ViewLine; state: "ok" | "done" | "flag"; pick?: string; active: boolean; catalog: SlimCatalog; onSelect: () => void; onChoose: (sku: string) => void; onUndo: () => void }) {
  const { l, state, pick, active, catalog } = props;
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const qty = fmtQty(l.qty, catalog[l.sku]?.unit ?? l.unit);

  if (state === "flag") {
    const shown = l.options.filter((o, i) => i === 0 || (o.probability ?? 1) >= 0.05).filter((o) => o.sku !== NONE || l.options[0].sku === NONE).slice(0, 3);
    const noneOpt = l.options.find((o) => o.sku === NONE) ?? { sku: NONE, name: "Not in catalog" };
    const quick = l.quantityOnly && !showAll;
    return (
      <li id={`line-${l.id}`} onClick={props.onSelect} className={`border-b border-line bg-warnbg/40 p-3 last:border-b-0 ${active ? "ring-2 ring-inset ring-[var(--focus)]" : ""}`} style={{ borderLeft: "4px solid var(--warn-line)" }}>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-medium">{l.raw}</span>
          <span className="text-xs font-semibold text-warn">Check this</span>
        </div>
        <ul className="mt-1 flex flex-col gap-1">
          {l.reasons.map((r) => (
            <li key={r} className="text-sm text-warn">{r}</li>
          ))}
        </ul>
        {quick ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={(e) => { e.stopPropagation(); props.onChoose(l.sku); }} className="min-h-9 rounded-md border border-ok bg-okbg px-3 py-1 text-left font-medium text-ok">
              <kbd className="mr-2 text-xs">Enter</kbd>Confirm {qty} of {l.name}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowAll(true); }} className="text-xs underline">Other products…</button>
          </div>
        ) : (
          <div role="group" aria-label={`Options for ${l.raw}`} className="mt-2 flex flex-col gap-1.5">
            {shown.map((o, i) => (
              <button
                key={o.sku}
                aria-pressed={pick === o.sku}
                onClick={(e) => { e.stopPropagation(); props.onChoose(o.sku); }}
                className={`flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2 py-1 text-left ${pick === o.sku ? "border-ok bg-okbg" : "border-control bg-panel hover:bg-panel2"}`}
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
        <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-muted">
          <span>Quantity: <strong className="text-ink">{qty}</strong></span>
          {!quick && <span><kbd>Enter</kbd> takes the top pick</span>}
          {noneOpt.sku !== l.sku && (
            <button onClick={(e) => { e.stopPropagation(); props.onChoose(NONE); }} className="underline"><kbd>x</kbd> Not in catalog</button>
          )}
        </p>
      </li>
    );
  }

  const chosen = state === "done" ? (pick === NONE ? "Not in catalog" : (catalog[pick!]?.name ?? pick)) : l.name;
  return (
    <li id={`line-${l.id}`} className={`border-b border-line last:border-b-0 ${active ? "ring-2 ring-inset ring-[var(--focus)]" : ""}`}>
      <div className={`flex min-h-10 items-center gap-2 px-3 py-1.5 ${state === "done" && pick === NONE ? "text-warn" : "text-ok"}`}>
        {state === "done" ? <Person /> : <Check />}
        <button className="flex min-w-0 flex-1 items-baseline gap-2 text-left text-ink" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="min-w-0 flex-1 sm:truncate">{chosen}</span>
          <span className="shrink-0 text-xs text-muted">{qty}</span>
        </button>
        <span className="shrink-0 text-xs text-muted" title={`Match confidence ${l.confidence}`}>{state === "done" ? (pick === NONE ? "skipped by you" : "checked by you") : ""}</span>
        {state === "done" && (
          <button className="shrink-0 text-xs underline" onClick={props.onUndo}>Undo</button>
        )}
      </div>
      {open && <p className="px-9 pb-2 text-xs text-muted">From: “{l.raw}”</p>}
    </li>
  );
}

type Side = { key: Mode; label: string; matcher: string; t: ReturnType<typeof totals>; approved: number; lines: number; calls: number; matchTokens: string };

function CostPanel({ result, samples, mode, T, unitMin, catalog, onMode }: { result: OrderResult; samples: OrderResult[]; mode: Mode; T: number; unitMin: number; catalog: SlimCatalog; onMode: (m: Mode) => void }) {
  const a = computeView(result, "jev", T, catalog, unitMin);
  const b = computeView(result, "claude", T, catalog);
  const n = result.parse.lines.length;
  const tok = (x: { inputTokens: number; outputTokens: number }) => `${x.inputTokens.toLocaleString()} in / ${x.outputTokens.toLocaleString()} out`;
  const sides: Side[] = [
    { key: "jev", label: "Claude + Jev", matcher: "Jev", t: totals(result, "jev"), approved: a.filter((l) => l.approved).length, lines: n,
      calls: n + result.jev.lines.filter((l) => l.sku.choice !== NONE).length, matchTokens: `${result.jev.usage.inputTokens.toLocaleString()} in` },
    { key: "claude", label: "Claude only", matcher: "Claude", t: totals(result, "claude"), approved: b.filter((l) => l.approved).length, lines: n,
      calls: 1, matchTokens: tok(result.claudeOnly.usage) },
  ];
  const maxUsd = Math.max(...sides.map((x) => x.t.usd));
  const [jev, cla] = sides;
  const cheaper = cla.t.matchUsd / Math.max(jev.t.matchUsd, 1e-9);
  const faster = cla.t.matchMs / Math.max(jev.t.matchMs, 1);
  const avg = (f: (r: OrderResult) => number) => samples.reduce((s, r) => s + f(r), 0) / samples.length;
  const avgJev = avg((r) => r.parse.costUsd + r.jev.costUsd);
  const avgCla = avg((r) => r.parse.costUsd + r.claudeOnly.costUsd);
  const diff = a.filter((l, i) => l.sku !== b[i].sku);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Cost assessment</h2>
        <p className="mt-0.5 text-xs text-muted">This order, {n} lines. Reading is shared; only matching differs.</p>
      </div>

      <p className="rounded-lg bg-okbg px-3 py-2 text-sm text-ok">
        Jev&apos;s matching step cost <strong>{Math.round(cheaper)}× less</strong> and ran <strong>{faster.toFixed(1)}× faster</strong> on this order.
      </p>

      {sides.map((x) => (
        <button
          key={x.key}
          onClick={() => onMode(x.key)}
          aria-pressed={mode === x.key}
          className={`rounded-lg border bg-panel p-3 text-left ${mode === x.key ? "border-ink ring-1 ring-ink" : "border-line hover:border-control"}`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{x.label}</span>
            {mode === x.key && <span className="rounded-full bg-ink px-1.5 text-[10px] font-medium text-bg">showing</span>}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-semibold">{usd(x.t.usd)}</span>
            <span className="text-xs text-muted">{ms(x.t.ms)} · {x.approved} of {x.lines} auto-approved</span>
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full" style={{ background: "var(--line)" }} aria-hidden>
            <span style={{ width: `${(100 * x.t.parseUsd) / maxUsd}%`, background: "var(--bar)" }} />
            <span style={{ width: `${(100 * x.t.matchUsd) / maxUsd}%`, background: x.key === "jev" ? "var(--ok)" : "var(--warn-line)" }} />
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted">Reading</dt>
            <dd className="text-right">{usd(x.t.parseUsd)} · {ms(x.t.parseMs)}</dd>
            <dt className="text-muted">Matching ({x.matcher})</dt>
            <dd className="text-right font-medium">{usd(x.t.matchUsd)} · {ms(x.t.matchMs)}</dd>
            <dt className="text-muted">API calls (read + match)</dt>
            <dd className="text-right">1 + {x.calls}</dd>
            <dt className="text-muted">Match tokens</dt>
            <dd className="text-right">{x.matchTokens}</dd>
            <dt className="text-muted">Per 1,000 orders</dt>
            <dd className="text-right font-medium">${(x.t.usd * 1000).toFixed(2)}</dd>
          </dl>
        </button>
      ))}

      <section className="rounded-lg border border-line bg-panel p-3 text-xs">
        <h3 className="mb-1 font-semibold">Across all {samples.length} saved orders</h3>
        <p className="text-muted">
          Average per order: <strong className="text-ink">{usd(avgJev)}</strong> with Jev, <strong className="text-ink">{usd(avgCla)}</strong> Claude only.
          Per 1,000 orders: <strong className="text-ink">${(avgJev * 1000).toFixed(2)}</strong> vs <strong className="text-ink">${(avgCla * 1000).toFixed(2)}</strong>.
        </p>
      </section>

      <p className="text-xs text-muted">
        {diff.length ? `The two pick different products on ${diff.length} line${diff.length > 1 ? "s" : ""}: ${diff.map((l) => `“${l.raw}”`).join(", ")}.` : "Both pick the same product on every line."}
      </p>
      <p className="text-[11px] leading-snug text-muted">
        Claude priced at ${(CLAUDE_INPUT_PER_TOKEN * 1e6).toFixed(0)} / ${(CLAUDE_OUTPUT_PER_TOKEN * 1e6).toFixed(0)} per million input / output tokens (assumed). Jev at ${(JEV_INPUT_PER_TOKEN * 1e9).toFixed(0)} per billion input tokens, output free. Times are measured on one run and vary.
      </p>
    </div>
  );
}
