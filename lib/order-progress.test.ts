import { describe, expect, it, vi } from "vitest";
import { readOrderStream, type OrderStreamEvent } from "./order-progress";
import sample from "../results/o13.json";
import type { OrderResult } from "./types";

function response(events: OrderStreamEvent[]) {
  const bytes = new TextEncoder().encode(events.map(event => JSON.stringify(event)).join("\n"));
  return new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
      controller.close();
    },
  }));
}

describe("order progress stream", () => {
  it("reads fragmented UTF-8 and JSON, including a final event without a newline", async () => {
    const result = { ...sample, text: "Contractor’s order 🪵" } as OrderResult;
    const onProgress = vi.fn();
    expect(await readOrderStream(response([
      { type: "progress", progress: { stage: "parse", status: "running" } },
      { type: "result", result },
    ]), onProgress)).toEqual(result);
    expect(onProgress).toHaveBeenCalledWith({ stage: "parse", status: "running" });
  });

  it("surfaces a pipeline error rather than treating HTTP 200 as success", async () => {
    await expect(readOrderStream(response([{ type: "error", error: "The run failed." }]), vi.fn())).rejects.toThrow("The run failed.");
  });

  it("rejects a connection that closes before the result arrives", async () => {
    await expect(readOrderStream(response([{ type: "progress", progress: { stage: "jev", status: "running" } }]), vi.fn())).rejects.toThrow("before your order was ready");
  });
});
