import { useSyncExternalStore, type ReactNode } from "react";

/**
 * TEMPORARY: three ways to mark a phrase in the contractor's text whose line is still to check, instead of the dot.
 * Pick one with ?hl=underline | marker | circle (no param keeps the dot) so they can be compared in the live app.
 */
export type HighlightVariant = "dot" | "underline" | "marker" | "circle";

const readVariant = (): HighlightVariant => {
  const hl = new URLSearchParams(window.location.search).get("hl");
  return hl === "underline" || hl === "marker" || hl === "circle" ? hl : "dot";
};

export function useHighlightVariant(): HighlightVariant {
  return useSyncExternalStore(() => () => {}, readVariant, () => "dot");
}

const styles: Record<Exclude<HighlightVariant, "dot">, string> = {
  // A: a crayon stroke under the words, like a rep marking up the text with a pencil
  underline: "underline decoration-warnline decoration-wavy decoration-[1.5px] underline-offset-[5px] [text-decoration-skip-ink:none]",
  // B: a highlighter swipe over the lower part of the words; the text stays ink
  marker: "rounded-[3px] -mx-0.5 px-0.5 box-decoration-clone bg-[linear-gradient(transparent_38%,color-mix(in_oklab,var(--warn-line)_28%,transparent)_38%)]",
  // C: circled, as on a paper slip: a thin crayon ring around the phrase
  circle: "rounded-full px-1.5 -mx-1 py-px ring-[1.5px] ring-inset ring-warnline/80 box-decoration-clone",
};

export function CheckPhrase({ variant, children }: { variant: Exclude<HighlightVariant, "dot">; children: ReactNode }) {
  return <span className={styles[variant]}>{children}</span>;
}
