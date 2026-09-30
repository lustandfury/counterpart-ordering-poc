export type Sender = { name: string; company: string };

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
};

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
  text: string;
  model: string;
  parse: { lines: ParsedLine[] } & Timed;
  jev: { lines: JevLine[] } & Timed; // matching step only
  claudeOnly: { lines: ClaudeOnlyLine[] } & Timed; // matching step only
};

export type Decision = { approved: boolean; reasons: string[] };
