export type Decisions = Record<string, string>; // lineId -> sku chosen by the rep

/** The AI cost rail or sheet: whether it's open, the element it controls, and the toggle. */
export type Compare = { open: boolean; controls: string; onToggle: () => void };
