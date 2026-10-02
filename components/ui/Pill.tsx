import type { HTMLAttributes } from "react";
import { cx } from "@/components/ui/cx";

/** Small inline labels and counts. Each tone has one job, so the same kind of fact always looks the same. */
const TONE = {
  /** a neutral count beside a section title */
  count: "rounded-full bg-line/50 px-2.5 py-0.5 font-mono text-caption",
  /** lines still to check */
  warn: "rounded-full bg-warnbg px-2 py-0.5 text-caption font-medium leading-none text-warn",
  /** a quiet note on a figure ("identical") */
  quiet: "rounded-full bg-panel2 px-2 py-0.5 text-tiny text-muted",
  /** a row worth a second look ("Decisions differ") */
  highlight: "rounded bg-brandsoft px-2 text-tiny",
};

export function Pill({ tone, className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone: keyof typeof TONE }) {
  return <span {...props} className={cx(TONE[tone], className)} />;
}
