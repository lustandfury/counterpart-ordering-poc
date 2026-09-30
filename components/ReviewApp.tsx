"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrderResult } from "@/lib/types";
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
  const u = unit === "each" ? "pcs" : qty === 1 || /s$/.test(unit) ? unit : /(x|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`;
  return `${qty} ${u}`;
}

function sampleLabel(r: OrderResult) {
  const first = r.text.replace(/\s+/g, " ").trim();
  return `${r.orderId} · ${first.length > 46 ? first.slice(0, 46) + "…" : first}`;
}

export function ReviewApp({ samples, catalog }: { samples: OrderResult[]; catalog: SlimCatalog }) {
  const [live, setLive] = useState<OrderResult | null>(null);
  const [sampleId, setSampleId] = useState(samples.find((x) => x.orderId === "o06")?.orderId ?? samples[0].orderId);
  const [mode, setMode] = useState<Mode>("jev");
  const [T, setT] = useState(0.85);
  const [unitMin, setUnitMin] = useState(0.8);
  const [runId, setRunId] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const result = live ?? samples.find((s) => s.orderId === sampleId) ?? samples[0];

  async function runLive() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: pasteText }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The run failed.");
      setLive(data as OrderResult);
      setRunId((n) => n + 1);
      setPasteOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The run failed.");
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col px-4 pb-24 sm:px-6">
      <div className="-mx-4 border-b border-line bg-panel2 px-4 py-1.5 text-xs text-muted sm:-mx-6 sm:px-6">
        <strong className="font-semibold text-ink">Counterpart</strong> · outside-in sketch · synthetic data · not affiliated with any company
      </div>

      <header className="flex flex-wrap items-end gap-x-6 gap-y-3 py-4">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="order" className="mb-1 block text-xs font-medium text-muted">Order</label>
          <div className="flex gap-2">
            <select
              id="order"
              className="h-9 min-w-0 flex-1 rounded-md border border-control bg-panel px-2"
              value={live ? "live" : sampleId}
              onChange={(e) => {
                setLive(null);
                setSampleId(e.target.value);
              }}
            >
              {live && <option value="live">Your pasted order</option>}
              {samples.map((s) => (
                <option key={s.orderId} value={s.orderId}>{sampleLabel(s)}</option>
              ))}
            </select>
            <button className="h-9 shrink-0 rounded-md border border-control bg-panel px-3 hover:bg-panel2" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen}>
              Paste an order
            </button>
          </div>
        </div>

        <fieldset className="shrink-0">
          <legend className="mb-1 text-xs font-medium text-muted">Matching by</legend>
          <div className="inline-flex overflow-hidden rounded-md border border-control" role="group">
            {(["jev", "claude"] as const).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`h-9 px-3 ${mode === m ? "bg-ink text-bg" : "bg-panel hover:bg-panel2"}`}
              >
                {m === "jev" ? "Claude + Jev" : "Claude only"}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid w-full shrink-0 grid-cols-2 gap-x-4 gap-y-1 sm:w-auto">
          <Slider id="t" label="Product confidence needed" value={T} min={0.5} max={0.99} onChange={setT} disabled={mode === "claude"} />
          <Slider id="u" label="Quantity/unit clarity needed" value={unitMin} min={0.3} max={0.9} onChange={setUnitMin} disabled={mode === "claude"} />
          <p className="col-span-2 text-xs text-muted">
            {mode === "claude" ? "Claude only has no thresholds: it approves its own “high” ratings." : "Higher = the rep checks more lines. Lower = fewer, with more risk."}
          </p>
        </div>
      </header>

      {pasteOpen && (
        <section className="mb-4 rounded-lg border border-line bg-panel p-3">
          <label htmlFor="paste" className="mb-1 block text-xs font-medium text-muted">Paste a text-message order (live run, up to 1,500 characters)</label>
          <textarea
            id="paste"
            rows={5}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"20 of the 2x6 (8ft)\n15 of the 2x4\n3 sheets 5/8 type X"}
            className="w-full rounded-md border border-control bg-bg p-2 font-mono text-[13px]"
          />
          <div className="mt-2 flex items-center gap-3">
            <button onClick={runLive} disabled={loading || !pasteText.trim()} className="h-9 rounded-md bg-ink px-4 text-bg disabled:opacity-40">
              {loading ? "Reading the order…" : "Match it"}
            </button>
            {error && <span role="alert" className="text-warn">{error}</span>}
          </div>
        </section>
      )}


      <Review key={live ? `live-${runId}` : sampleId} result={result} isLive={!!live} mode={mode} T={T} unitMin={unitMin} catalog={catalog} />
    </div>
  );
}

function Review({ result, isLive, mode, T, unitMin, catalog }: { result: OrderResult; isLive: boolean; mode: Mode; T: number; unitMin: number; catalog: SlimCatalog }) {
  const [resolved, setResolved] = useState<Record<string, string>>({}); // lineId -> sku chosen by the rep
  const [active, setActive] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const lines = useMemo(() => computeView(result, mode, T, catalog, unitMin), [result, mode, T, catalog, unitMin]);
  const flagged = lines.filter((l) => !l.approved);
  const done = flagged.filter((l) => resolved[l.id]).length;
  const tot = totals(result, mode);
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
        <span className="ml-auto hidden text-xs text-muted sm:inline">Keys: <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>1</kbd>–<kbd>3</kbd> pick · <kbd>Enter</kbd> accept · <kbd>x</kbd> not in catalog</span>
      </div>

      {(flagged.length === 0 || done === flagged.length) && (
        <p role="status" className="mb-3 rounded-lg border border-ok bg-okbg px-3 py-2 font-medium text-ok">
          {flagged.length === 0 ? "Nothing needs your attention. This order is ready to send." : "All checked. This order is ready to send."}
        </p>
      )}

      <main className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label="Order message" className="h-fit rounded-lg border border-line bg-panel p-3 lg:sticky lg:top-3">
          <h2 className="mb-2 text-xs font-medium text-muted">What the contractor sent</h2>
          <p className="whitespace-pre-wrap font-mono text-[13px] leading-6">
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
          <ul className="overflow-hidden rounded-lg border border-line bg-panel">
            {lines.map((l) => (
              <LineRow key={l.id} l={l} state={status(l)} pick={resolved[l.id]} active={current === l.id} catalog={catalog} onSelect={() => setActive(l.id)} onChoose={(sku) => choose(l.id, sku)} onUndo={() => undo(l.id)} />
            ))}
          </ul>
        </section>
      </main>

      {showCompare && <Compare result={result} T={T} unitMin={unitMin} catalog={catalog} />}

      <footer className="fixed inset-x-0 bottom-0 border-t border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 text-xs sm:px-6">
          <span className="text-muted">
            This order, {mode === "jev" ? "Claude + Jev" : "Claude only"}: <strong className="text-ink">{ms(tot.ms)}</strong> · <strong className="text-ink">{usd(tot.usd)}</strong>
            <span className="hidden sm:inline"> (reading {ms(tot.parseMs)} + matching {ms(tot.matchMs)})</span>
          </span>
          <button className="ml-auto h-8 rounded-md border border-control px-3 hover:bg-panel2" aria-expanded={showCompare} onClick={() => setShowCompare((v) => !v)}>
            {showCompare ? "Hide comparison" : "Compare Jev vs Claude only"}
          </button>
        </div>
      </footer>
    </>
  );
}

function Slider(p: { id: string; label: string; value: number; min: number; max: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className="w-40">
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

function Compare({ result, T, unitMin, catalog }: { result: OrderResult; T: number; unitMin: number; catalog: SlimCatalog }) {
  const a = computeView(result, "jev", T, catalog, unitMin);
  const b = computeView(result, "claude", T, catalog);
  const ta = totals(result, "jev");
  const tb = totals(result, "claude");
  const diff = a.filter((l, i) => l.sku !== b[i].sku);
  const row = (label: string, x: string, y: string) => (
    <tr className="border-t border-line">
      <th scope="row" className="py-1.5 pr-4 text-left font-normal text-muted">{label}</th>
      <td className="py-1.5 pr-4">{x}</td>
      <td className="py-1.5">{y}</td>
    </tr>
  );
  return (
    <section aria-label="Comparison" className="mt-4 rounded-lg border border-line bg-panel p-3">
      <h2 className="mb-2 text-xs font-medium text-muted">This order, both ways (Jev threshold {T.toFixed(2)})</h2>
      <table className="w-full max-w-xl text-sm">
        <thead>
          <tr className="text-left text-xs text-muted"><th /><th className="pb-1 font-medium">Claude + Jev</th><th className="pb-1 font-medium">Claude only</th></tr>
        </thead>
        <tbody>
          {row("Auto-approved", `${a.filter((l) => l.approved).length} of ${a.length}`, `${b.filter((l) => l.approved).length} of ${b.length}`)}
          {row("Matching time", ms(ta.matchMs), ms(tb.matchMs))}
          {row("Matching cost", usd(ta.matchUsd), usd(tb.matchUsd))}
          {row("Whole order (incl. reading)", `${ms(ta.ms)} · ${usd(ta.usd)}`, `${ms(tb.ms)} · ${usd(tb.usd)}`)}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        {diff.length ? `They pick different products on ${diff.length} line${diff.length > 1 ? "s" : ""}: ${diff.map((l) => `“${l.raw}”`).join(", ")}.` : "They pick the same product on every line."}
      </p>
    </section>
  );
}
