import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import { trackEvent } from "@/lib/analytics";
import { shortcutsEnabled } from "@/lib/shortcuts";
import type { OrderResult } from "@/lib/types";
import { computeView, NONE, productChoices, sameQuantityUnit, type Mode, type SlimCatalog, type ViewLine } from "@/lib/view";
import { without } from "@/lib/format";
import { subtotal as orderSubtotal } from "@/lib/order-math";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { LineRow, type LineState } from "@/components/order/LineRow";
import { OrderDetails } from "@/components/order/OrderDetails";
import { OrderFooter } from "@/components/order/OrderFooter";
import type { Compare, Decisions } from "@/components/order/types";

/**
 * The review of one order: its header, the lines to check (expanded, with the keyboard on them), the confirmed lines,
 * and the total with Send. Decisions live with the parent so they survive switching orders.
 */
export function Review({ result, mode, T, unitMin, catalog, resolved, setResolved, quantities, setQuantity, phone, compare, sentAt, onSend, onReopen }: {
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
        // focus follows the cursor, so screen readers announce the line the keys now act on
        const line = document.getElementById(`line-${id}`);
        line?.focus({ preventScroll: true });
        line?.scrollIntoView({ block: "nearest" });
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
  const subtotal = useMemo(() => orderSubtotal(validated, resolved, catalog, quantities), [validated, resolved, catalog, quantities]);
  const status = (l: ViewLine): LineState => (l.approved ? "ok" : resolved[l.id] ? "done" : "flag");

  return (
    <>
      {pending.length > 0 && (
        <a href={`#line-${pending[0].id}`} className="sr-only focus:not-sr-only focus:mb-2 focus:inline-block focus:rounded focus:bg-panel focus:px-2 focus:py-1">
          Skip to the first line to check
        </a>
      )}
      {/*
        Two columns when there's room: the order header stays pinned on the left while the lines scroll on the right.
        "Room" is the space the review actually has (a container query), so opening the cost rail drops to one column.
      */}
      <div className="@container/review">
      <div className="@min-[52rem]/review:grid @min-[52rem]/review:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] @min-[52rem]/review:items-start @min-[52rem]/review:gap-6">
      <div className="@min-[52rem]/review:sticky @min-[52rem]/review:top-5 @min-[52rem]/review:-m-1 @min-[52rem]/review:max-h-[calc(100dvh-2.5rem)] @min-[52rem]/review:overflow-y-auto @min-[52rem]/review:p-1">
        <OrderDetails result={result} mode={mode} lines={lines.length} flagged={flagged.length} done={done} compare={compare} phone={phone} />
      </div>

      {/* One sheet, like a pick ticket: the lines to check on top, then the confirmed lines, then the total and Send. */}
      <section aria-label="Order" className={phone ? "pb-24" : ""}>
        <div className="card overflow-hidden">
          <div inert={!!sentAt} className={sentAt ? "opacity-70" : undefined}>
            {[
              ...(pending.length ? [{ id: "needs-review", title: "Needs review", description: "Confirm a product and quantity for each item.", items: pending, tone: "text-warn", empty: "" }] : []),
              { id: "validated-items", title: "Validated items", description: "Auto-approved or checked by you.", items: validated, tone: "text-ok", empty: "Validated items will appear here as you confirm them." },
              ...(excluded.length ? [{ id: "excluded-items", title: "Left off order", description: "No catalog match. Let the contractor know.", items: excluded, tone: "text-muted", empty: "" }] : []),
            ].map((group, i) => (
              <section key={group.id} aria-labelledby={group.id} className={i > 0 ? "border-t border-line" : undefined}>
                <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line bg-panel2 px-4 py-2.5 sm:px-6">
                  <h2 id={group.id} className={`text-small font-semibold ${group.tone}`}>{group.title}</h2>
                  <p className="text-caption text-muted">{group.description}</p>
                  <Pill tone="count" className="ml-auto" aria-label={`${group.items.length} items`}>{group.items.length}</Pill>
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
                ) : <p className="px-4 py-5 text-small text-muted sm:px-6">{group.empty}</p>}
              </section>
            ))}
          </div>
          <OrderFooter result={result} subtotal={subtotal} toCheck={pending.length} sentAt={sentAt} onSend={onSend} onReopen={onReopen} />
        </div>
      </section>
      </div>
      </div>

      <div
        className={`floating-send fixed inset-x-0 bottom-0 z-20 flex justify-center px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] ${showFloatingSend ? "floating-send-visible" : ""}`}
        inert={!showFloatingSend}
        aria-hidden={!showFloatingSend}
      >
          <Button
            ref={floatingSendRef}
            id="floating-send-order"
            size="lg"
            disabled={!showFloatingSend}
            onClick={() => {
              onSend();
              requestAnimationFrame(() => document.getElementById("send-order")?.focus());
            }}
            className="pointer-events-auto shadow-raise"
          >
            <CheckIcon aria-hidden strokeWidth={2} className="h-4 w-4 shrink-0" /> Send for approval
          </Button>
      </div>
    </>
  );
}
