import type { OrderResult } from "./types";

export type OrderStage = "access" | "parse" | "jev" | "claude";
export type OrderProgress = {
  stage: OrderStage;
  status: "running" | "complete";
  completed?: number;
  total?: number;
};
export type OrderStreamEvent =
  | { type: "progress"; progress: OrderProgress }
  | { type: "result"; result: OrderResult }
  | { type: "error"; error: string };

/** Decode server progress even when network chunks split JSON lines or UTF-8 characters. */
export async function readOrderStream(response: Response, onProgress: (progress: OrderProgress) => void): Promise<OrderResult> {
  if (!response.body) throw new Error("The order response was empty. Please try again.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: OrderResult | undefined;
  const receive = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as OrderStreamEvent;
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "progress") onProgress(event.progress);
    if (event.type === "result") result = event.result;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n")) !== -1) {
        receive(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
      if (done) break;
    }
    receive(buffer);
    if (!result) throw new Error("The connection ended before your order was ready. Please try again.");
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
