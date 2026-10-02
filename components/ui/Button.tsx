import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/components/ui/cx";

/**
 * The app's text buttons. Primary is the brand-yellow action (one per view: Send, Enter, Done); secondary is the quiet
 * outlined one. `disabled` dims the button. When it must stay focusable and clickable to explain why it can't act yet
 * (Send with lines still to check), use aria-disabled with the `waiting` variant instead: faded yellow fails contrast.
 */
const VARIANT = {
  primary: "bg-brand text-onbrand",
  /** an action that isn't ready yet but stays clickable to say why (Send with lines still to check) */
  waiting: "bg-panel2 text-muted shadow-control",
  secondary: "border border-line bg-panel text-ink hover:bg-bg",
};

/** Sizes as they are used today. The identity pass may fold these together. */
const SIZE = {
  /** dialog footers */
  sm: "h-9 rounded-lg px-5 text-small",
  /** the order's Send: taller on phones for the thumb */
  md: "h-11 rounded-lg px-4 text-body sm:h-10",
  /** a full-width form submit (the access code) */
  block: "h-10 w-full rounded-xl px-4 text-body",
  /** the floating Send, with an icon */
  lg: "flex min-h-12 items-center gap-2 rounded-xl px-6 text-body",
};

export function Button({ variant = "primary", size = "sm", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      {...props}
      className={cx(
        "font-semibold transition-[background-color,opacity] disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed",
        SIZE[size],
        VARIANT[variant],
        className,
      )}
    />
  );
}

/** A small underlined action in running text or beside a control: "Change product", "Reset to defaults". */
export function TextButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={cx("text-small text-muted underline hover:text-ink disabled:no-underline disabled:opacity-40", className)} />;
}
