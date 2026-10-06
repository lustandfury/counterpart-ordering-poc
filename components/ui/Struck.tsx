import type { ReactNode } from "react";

/** Text crossed out on a photographed list is transcribed as ~~text~~; show it struck through, as on the paper. */
export function struck(text: string): ReactNode {
  if (!text.includes("~~")) return text;
  return text.split(/~~([^~]+)~~/).map((part, i) => (i % 2 ? <s key={i} className="text-muted">{part}</s> : part));
}

/** The same text with the marks removed, for labels read by screen readers. */
export const unstruck = (text: string) => text.replace(/~~([^~]+)~~\s*/g, "");
