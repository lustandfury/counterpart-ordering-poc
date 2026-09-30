/** Shared chrome for round icon controls: same fill, border and ring wherever they sit. */
const CHROME = "rounded-full border border-line bg-panel shadow-[0_0_0_1px_var(--ring)]";

/** A lone round icon button. */
export const ICON_BUTTON = `grid h-11 w-11 shrink-0 place-items-center ${CHROME} text-muted transition-colors hover:bg-bg hover:text-ink lg:h-8 lg:w-8`;

/** The single rounded container that holds two or more icon buttons. */
export const ICON_GROUP = `flex items-center gap-0.5 p-0.5 ${CHROME}`;

/** An icon button inside an ICON_GROUP: no chrome of its own, the container supplies it. */
export const ICON_BUTTON_GROUPED =
  "grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-ink lg:h-8 lg:w-8";
