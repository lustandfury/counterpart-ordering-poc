/** Who sent an order. `address` is the jobsite on file (invented for the demo), used when they say "same address as last week". */
export type Sender = { name: string; company: string; address?: string };

/** A detail as the contractor wrote it, and tidied up for the rep ("thurs before 7am" -> "Thu, Oct 8 · before 7:00 AM"). */
export type Said = { said: string; tidy: string };

/** When and where the order goes, captured from the text alongside the lines. Every part is null when the text doesn't say. */
export type Delivery = {
  method: "delivery" | "pickup" | null;
  when: Said | null;
  // onFile: they pointed at an earlier address ("same address as last week"); the app shows the address on file
  where: (Said & { onFile: boolean }) | null;
  notes: string | null;
};

export type Product = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  aliases: string[];
};

/** One line pulled out of the order text by Claude (shared by both pipelines). */
export type ParsedLine = {
  id: string;
  raw: string; // verbatim text of the line
  item: string; // the product words, quantity removed
  qty: number | null;
  unit: string | null; // as spoken, e.g. "bags", "lbs"
  metric?: MetricConversion[]; // metric sizes or lengths converted for matching ("150 x 50" -> "2x6"); item holds the converted words
};

/** One metric size or length, as written and as the catalog names it. */
export type MetricConversion = { from: string; to: string };

export type Usage = { inputTokens: number; outputTokens: number; cacheWriteTokens?: number; cacheReadTokens?: number };
export type Timed = { ms: number; usage: Usage; costUsd: number };

export type Alternative = { sku: string; probability: number };

export type JevLine = {
  lineId: string;
  shortlist: string[];
  category: { choice: string; confidence: number };
  sku: { choice: string; confidence: number; top: Alternative[] }; // choice may be "NONE"
  unitOk: number;
  ms: number;
  usage: Usage;
  costUsd: number;
};

export type ClaudeOnlyLine = {
  lineId: string;
  sku: string | null;
  confidence: "high" | "medium" | "low";
};

export type OrderResult = {
  orderId: string;
  from?: Sender; // who sent the order (display only; never sent to the pipelines)
  text: string; // for a photo order, Claude's transcription of the photo
  photo?: { src: string } & Timed; // photo orders: the image (served from public/) and the transcription step
  model: string;
  parse: { lines: ParsedLine[]; delivery?: Delivery } & Timed; // delivery: live runs only (saved samples predate it)
  jev: { lines: JevLine[] } & Timed; // matching step only
  claudeOnly: { lines: ClaudeOnlyLine[] } & Timed; // matching step only
};

export type Decision = { approved: boolean; reasons: string[] };
