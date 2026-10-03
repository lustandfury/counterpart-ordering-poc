import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/**
 * A row of mutually exclusive choices (a radio group drawn as buttons). Name it with `labelledBy` (visible text) or
 * `label`. Two looks:
 * - "chip" (default): a quiet track where the choice is a raised white chip, for settings (Light / Dark / System).
 * - "tabs": full-width text tabs with an ink underline, for filtering a list (the inbox's Open / Sent / Approved).
 */
export function SegmentedControl<T extends string>({ options, value, onChange, labelledBy, label, look = "chip" }: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  labelledBy?: string;
  label?: string;
  look?: "chip" | "tabs";
}) {
  const tabs = look === "tabs";
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={label}
      className={tabs ? "flex w-full border-b border-line text-small" : "inline-flex gap-0.5 rounded-lg bg-bg p-0.5 text-small"}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={tabs
              ? cx("-mb-px h-9 flex-1 px-2 transition-colors", on ? "font-semibold text-ink shadow-[inset_0_-2px_0_var(--ink)]" : "font-medium text-muted hover:text-ink")
              : cx("h-8 rounded-md px-3 font-medium transition-colors", on ? "bg-panel text-ink shadow-ring" : "text-muted hover:text-ink")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
