import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/**
 * A row of mutually exclusive choices (a radio group drawn as buttons): a rounded track where the choice is a raised
 * white pill. Used for settings (Light / Dark / System) and for filtering the inbox (Received / Sent / Approved).
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
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={label}
      className={cx("gap-0.5 rounded-full bg-bg p-1 text-small", fill ? "flex w-full" : "inline-flex")}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx("h-8 rounded-full font-medium transition-colors", fill ? "flex-1 px-2" : "px-4", on ? "bg-panel text-ink shadow-ring" : "text-muted hover:text-ink")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
