import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/**
 * A row of mutually exclusive choices (a radio group drawn as buttons), e.g. Light / Dark / System.
 * Name it with `labelledBy` (visible text) or `label`. `fill` stretches it to its container, with equal segments.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, labelledBy, label, fill = false }: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  labelledBy?: string;
  label?: string;
  fill?: boolean;
}) {
  return (
    <div className={cx("gap-1 rounded-xl bg-panel p-1 text-small shadow-ring", fill ? "flex w-full" : "inline-flex")} role="radiogroup" aria-labelledby={labelledBy} aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("h-8 rounded-lg px-3 font-medium", fill && "flex-1 px-2", value === o.value ? "bg-ink text-bg" : "text-muted hover:bg-bg hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
