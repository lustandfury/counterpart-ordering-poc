import type { HTMLAttributes } from "react";
import { cx } from "@/components/ui/cx";

/** Small inline labels and counts. Each tone has one job, so the same kind of fact always looks the same. */
const TONE = {
  /** a neutral count beside a section title */
  count: "rounded-full bg-line/50 px-2.5 py-0.5 figures text-caption",
  /** lines still to check: the Needs review red with white text, so the count stands out wherever it appears */
  warn: "rounded-full bg-fillalert px-2 py-0.5 text-caption font-semibold leading-none text-white",
  /** auto-approved lines */
  ok: "rounded-full bg-fillok px-2 py-0.5 text-caption font-semibold leading-none text-white",
  /** a plain total (all lines) */
  total: "rounded-full bg-fillink px-2 py-0.5 text-caption font-semibold leading-none text-white",
  /** a quiet note on a figure ("identical") */
  quiet: "rounded-full bg-panel2 px-2 py-0.5 text-tiny text-muted",
  /** a row worth a second look ("Decisions differ") */
  highlight: "rounded bg-brandsoft px-2 text-tiny",
};

export function Pill({ tone, className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone: keyof typeof TONE }) {
  return <span {...props} className={cx(TONE[tone], className)} />;
}
