import { useState } from "react";
import { sameQuantityUnit, suggestQuantity, type SlimCatalog, type ViewLine } from "@/lib/view";
import { fmtQty, money, perUnit, unitName } from "@/lib/format";
import { TextButton } from "@/components/ui/Button";

/** Sets how many of a product, in the unit it's sold by, when the contractor's quantity can't be used as written. */
export function QuantityEditor({ l, sku, catalog, onConfirm, onCancel }: { l: ViewLine; sku: string; catalog: SlimCatalog; onConfirm: (qty: number) => void; onCancel: () => void }) {
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
        <TextButton onClick={onCancel}>Change product</TextButton>
      </div>
      <p className="mt-0.5 text-caption tabular-nums text-muted">{perUnit(product.price, product.unit)}</p>
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (valid) onConfirm(qty); }}>
        <div>
          <label htmlFor={inputId} className="mb-1 block text-small font-medium">Quantity in {unitName(product.unit, 2)}</label>
          <div className="flex items-center rounded-lg bg-panel shadow-control">
            <button type="button" onClick={() => step(-1)} aria-label="One fewer" className="h-11 w-11 text-lg text-muted hover:text-ink">−</button>
            <input
              id={inputId}
              autoFocus
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); } }}
              aria-describedby={`${inputId}-hint`}
              className="h-11 w-16 bg-transparent text-center text-heading tabular-nums outline-none"
            />
            <button type="button" onClick={() => step(1)} aria-label="One more" className="h-11 w-11 text-lg text-muted hover:text-ink">+</button>
          </div>
        </div>
        <button type="submit" disabled={!valid} className="h-11 rounded-lg bg-okbg px-4 font-medium text-ok shadow-ok disabled:opacity-40">
          Confirm {valid ? `${qty} ${unitName(product.unit, qty)}` : "quantity"}{valid ? ` · ${money(qty * product.price)}` : ""}
        </button>
      </form>
      <p id={`${inputId}-hint`} className="mt-2 text-caption text-muted">
        {suggestion ? `Suggested from the product size: ${suggestion.working}.`
          : l.qty == null ? "The contractor didn't give a quantity."
          : `The contractor wrote ${fmtQty(l.qty, l.unit)}. Enter how many ${unitName(product.unit, 2)} that is.`}
      </p>
    </div>
  );
}
