import { useState, type ReactNode } from "react";
import { CheckIcon, UserIcon } from "@heroicons/react/24/outline";
import { NONE, productChoices, sameQuantityUnit, type SlimCatalog, type ViewLine } from "@/lib/view";
import { fmtQty, money, unitName } from "@/lib/format";
import { linePrice } from "@/lib/order-math";
import { TextButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { QuantityEditor } from "@/components/order/QuantityEditor";

export type LineState = "ok" | "done" | "flag";

/** One line of the order. A line to check is expanded with its choices; a confirmed line is one compact row. */
export function LineRow(props: {
  l: ViewLine; state: LineState; pick?: string; quantity?: number; staged?: string; active: boolean; catalog: SlimCatalog;
  onSelect: () => void; onPick: (sku: string, editQuantity?: boolean) => void; onConfirm: (sku: string, qty?: number) => void; onUnstage: () => void; onUndo: () => void;
}) {
  return props.state === "flag" ? <FlaggedLine {...props} /> : <ConfirmedLine {...props} />;
}

type Props = Parameters<typeof LineRow>[0];

function FlaggedLine(props: Props) {
  const { l, catalog, active } = props;
  const [showAll, setShowAll] = useState(false);
  const sellUnit = catalog[l.sku]?.unit;
  const choices = productChoices(l);
  const quick = l.quantityOnly && !showAll;
  // On a line to check, show the quantity as the customer wrote it. If their unit differs from how the
  // product is sold ("50 lb" of nails sold by the box), say both rather than silently converting.
  const asked = l.unit && sellUnit && l.sku !== NONE && !sameQuantityUnit(l.unit, sellUnit) ? `${fmtQty(l.qty, l.unit)} · sold per ${unitName(sellUnit)}` : fmtQty(l.qty, l.unit);
  const quickPrice = linePrice(l, l.sku, catalog);
  const none = l.options.find((o) => o.sku === NONE)?.probability;
  return (
    <li id={`line-${l.id}`} tabIndex={-1} onClick={props.onSelect} className={`outline-none scroll-mt-44 scroll-mb-8 border-b border-line bg-panel px-4 py-5 last:border-b-0 sm:px-6`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <span className="font-mono text-body font-medium">
          <span className="sr-only">Check this: </span>
          {l.raw}
        </span>
        <span className="text-body text-muted">{asked}</span>
      </div>
      <p className="mt-1.5 text-small text-warn">{l.reasons.join(" ")}</p>
      {props.staged ? (
        <QuantityEditor l={l} sku={props.staged} catalog={catalog} onConfirm={(n) => props.onConfirm(props.staged!, n)} onCancel={props.onUnstage} />
      ) : quick ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={(e) => { e.stopPropagation(); props.onPick(l.sku); }} className="review-option tour-option min-h-11 rounded-xl bg-okbg px-4 py-2 text-left font-medium text-ok shadow-ok">
            {active && <kbd className="mr-2 text-xs">Enter</kbd>}
            {quickPrice?.total != null ? <>Confirm {fmtQty(l.qty, sellUnit ?? null)} of {l.name}<span className="font-normal"> · {money(quickPrice.total)}</span></> : <>Set the quantity of {l.name}</>}
          </button>
          {quickPrice?.total != null && <TextButton onClick={(e) => { e.stopPropagation(); props.onPick(l.sku, true); }}>Change quantity</TextButton>}
          <TextButton onClick={(e) => { e.stopPropagation(); setShowAll(true); }}>Other products…</TextButton>
        </div>
      ) : (
        <div role="group" aria-label={`Products for ${l.raw}`} className="mt-3 flex flex-col gap-2">
          {/* column header over the confidence cells */}
          {choices.some((o) => o.probability != null) && (
            <div aria-hidden className="-mb-1 flex justify-end px-3.5 text-caption font-medium text-muted">
              <span className="w-16 text-center sm:w-24">Confidence</span>
            </div>
          )}
          {choices.map((o, i) => {
            const price = linePrice(l, o.sku, catalog);
            const suggested = o.sku === l.sku;
            return (
              <ChoiceButton
                key={o.sku}
                className="tour-option"
                keyHint={i + 1}
                title={o.name}
                suggested={suggested}
                detail={price && <span className="tabular-nums">{price.unit}{price.total != null && <> · {money(price.total)} for {fmtQty(l.qty, catalog[o.sku].unit)}</>}</span>}
                confidence={o.probability}
                aside={o.probability == null && suggested && <span className="text-xs text-muted">Claude: {l.confidence}</span>}
                onClick={() => props.onPick(o.sku)}
              />
            );
          })}
          {choices.length === 0 && <p className="text-small text-muted">No product in the catalog comes close.</p>}
        </div>
      )}
      {/* leaving the line off is a choice like the products, shaped the same, with its own key and its own confidence */}
      {!props.staged && (
        <ChoiceButton
          className="mt-2 w-full"
          keyHint="x"
          title="Leave off order"
          suggested={l.sku === NONE}
          detail="Not in the catalog · tell the contractor we don't carry it"
          confidence={none}
          onClick={() => props.onConfirm(NONE)}
        />
      )}
    </li>
  );
}

/**
 * One choice on a line to check: its key, the product (bold when it's the suggestion), a price or note under it,
 * and the matcher's confidence in its own column.
 */
function ChoiceButton({ keyHint, title, suggested, detail, confidence, aside, className, onClick }: {
  keyHint: ReactNode; title: string; suggested: boolean; detail?: ReactNode; confidence?: number; aside?: ReactNode; className?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cx("review-option flex min-h-11 items-center gap-3 rounded-xl bg-panel px-3.5 py-2 text-left text-ink shadow-control", className)}
    >
      <kbd className="w-4 text-center text-xs text-muted">{keyHint}</kbd>
      <span className="min-w-0 flex-1">
        <span className={`block ${suggested ? "font-semibold" : ""}`}>{title}{suggested && <span className="sr-only"> (suggested)</span>}</span>
        {detail && <span className="block text-caption text-muted">{detail}</span>}
      </span>
      {confidence != null && (
        <span className="flex w-16 shrink-0 items-center justify-center self-stretch border-l border-line text-body text-muted sm:w-24">
          <span className="sr-only">confidence </span>
          {Math.round(confidence * 100)}%
        </span>
      )}
      {aside}
    </button>
  );
}

const Check = () => <CheckIcon aria-hidden strokeWidth={2} className="h-4 w-4 shrink-0" />;

function ConfirmedLine(props: Props) {
  const { l, state, pick, active, catalog } = props;
  const product = catalog[pick && pick !== NONE ? pick : l.sku];
  const sellUnit = product?.unit;
  const qty = props.quantity != null && sellUnit ? fmtQty(props.quantity, sellUnit) : fmtQty(l.qty, sellUnit && sameQuantityUnit(l.unit, sellUnit) ? sellUnit : (l.unit ?? sellUnit ?? null));
  const chosen = state === "done" ? (pick === NONE ? "Left off order" : (catalog[pick!]?.name ?? pick)) : l.name;
  const price = pick === NONE ? null : linePrice(l, pick, catalog, props.quantity);
  const total = price?.total != null ? money(price.total) : <span title="Not priced: the quantity isn't in the unit this product is sold by">—<span className="sr-only">not priced</span></span>;
  return (
    <li id={`line-${l.id}`} tabIndex={-1} onClick={props.onSelect} className={`outline-none scroll-mt-44 border-b border-line last:border-b-0 ${active ? "bg-bg" : ""}`}>
      <div className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-6">
        <span className={state === "done" && pick === NONE ? "text-warn" : "text-ok"}>{state === "done" ? <UserIcon aria-hidden className="h-4 w-4 shrink-0" /> : <Check />}</span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-ink">{chosen}</span>
          <span className="block font-mono text-small text-muted">{l.raw}</span>
          {/* phones: quantity and price stack under the name instead of taking columns */}
          <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-small tabular-nums text-muted sm:hidden">
            {pick !== NONE && <span>{qty}</span>}
            {pick !== NONE && <span>{total}</span>}
            {pick !== NONE && price && <span>({price.unit})</span>}
          </span>
          {state === "done" && (
            <span className="mt-0.5 block text-caption text-muted">
              {pick === NONE ? "Left off by you" : props.quantity != null ? "Product and quantity set by you" : "Checked by you"} · <button className="underline hover:text-ink" onClick={props.onUndo}>Undo</button>
            </span>
          )}
        </span>
        {pick !== NONE && <span className="shrink-0 text-right text-body text-muted max-sm:hidden">{qty}</span>}
        {pick !== NONE && (
          <span className="w-28 shrink-0 text-right tabular-nums text-muted max-sm:hidden">
            <span className="block text-body">{total}</span>
            {price && <span className="block text-caption">{price.unit}</span>}
          </span>
        )}
      </div>
    </li>
  );
}
