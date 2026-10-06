import type { Timed } from "../types";
import { callTool } from "./claude";

const SYSTEM = `You transcribe a photo of a handwritten material list or estimate for a building-supply order.
Write out the page exactly as written, one line of the page per line of output, top to bottom.
- Copy spelling, abbreviations, numbers and units as written. Do not fix typos, convert units or tidy anything.
- Struck-through text: wrap it in ~~ ~~ (a whole crossed-out line becomes ~~the line~~).
- A number written over or beside a crossed-out number: write the old one struck, then the new one ("~~24~~ 30").
- A word or number you cannot read: write your best reading followed by [?]. Never leave a line out.
- Sketches and diagrams: one line in square brackets saying what they show and any measurements on them, e.g. "[sketch: deck 20' x 12']".
- Include headings, prices, totals and notes too; deciding what is an order line happens later.`;

/**
 * Turns a photo of a handwritten order into text, verbatim, with crossed-out and unclear parts marked.
 * The transcription becomes the order text for both pipelines, so they read the same thing.
 */
export async function transcribePhoto(image: Buffer, mediaType: "image/jpeg" | "image/png" = "image/jpeg"): Promise<{ text: string } & Timed> {
  const r = await callTool<{ text: string }>({
    system: SYSTEM,
    user: "Transcribe this page.",
    toolName: "submit_transcription",
    schema: { type: "object", properties: { text: { type: "string", description: "The page, one line per line" } }, required: ["text"] },
    image: { data: image, mediaType },
  });
  return { text: r.input.text.trim(), ms: r.ms, usage: r.usage, costUsd: r.costUsd };
}
