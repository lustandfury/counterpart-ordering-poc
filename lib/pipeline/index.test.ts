import { beforeEach, describe, expect, it, vi } from "vitest";
import sample from "../../results/o13.json";
import type { OrderProgress } from "../order-progress";
import type { OrderResult } from "../types";

const mocks = vi.hoisted(() => ({ parse: vi.fn(), decide: vi.fn(), compare: vi.fn() }));
vi.mock("./parse", () => ({ parseOrder: mocks.parse }));
vi.mock("./decide", () => ({ decideLine: mocks.decide }));
vi.mock("./claude-only", () => ({ claudeOnlyMatch: mocks.compare }));
vi.mock("./claude", () => ({ claudeModel: () => "test-model" }));
import { runOrder, TooManyLinesError } from "./index";

const fixture = sample as OrderResult;
beforeEach(() => { vi.resetAllMocks(); });

describe("pipeline progress", () => {
  it.each(["jev", "claude"] as const)("reports actual completions when %s finishes first", async first => {
    const parsed = Promise.withResolvers<OrderResult["parse"]>();
    const matched = Promise.withResolvers<OrderResult["jev"]["lines"][number]>();
    const compared = Promise.withResolvers<OrderResult["claudeOnly"]>();
    mocks.parse.mockReturnValue(parsed.promise);
    mocks.decide.mockReturnValue(matched.promise);
    mocks.compare.mockReturnValue(compared.promise);
    const events: OrderProgress[] = [];
    const running = runOrder("test", "order", { onProgress: progress => events.push(progress) });
    expect(events).toEqual([{ stage: "parse", status: "running" }]);
    expect(mocks.decide).not.toHaveBeenCalled();
    parsed.resolve({ ...fixture.parse, lines: fixture.parse.lines.slice(0, 1) });
    await vi.waitFor(() => expect(mocks.compare).toHaveBeenCalled());
    expect(events).toContainEqual({ stage: "jev", status: "running", completed: 0, total: 1 });
    expect(events).toContainEqual({ stage: "claude", status: "running" });
    if (first === "jev") matched.resolve(fixture.jev.lines[0]);
    else compared.resolve(fixture.claudeOnly);
    await vi.waitFor(() => expect(events.some(event => event.stage === first && event.status === "complete")).toBe(true));
    expect(events.some(event => event.stage === (first === "jev" ? "claude" : "jev") && event.status === "complete")).toBe(false);
    if (first === "jev") compared.resolve(fixture.claudeOnly);
    else matched.resolve(fixture.jev.lines[0]);
    await running;
    expect(events).toContainEqual({ stage: "jev", status: "complete", completed: 1, total: 1 });
    expect(events.some(event => event.stage === "claude" && event.status === "complete")).toBe(true);
  });

  it("does not start matching when the parsed order exceeds the item cap", async () => {
    mocks.parse.mockResolvedValue(fixture.parse);
    await expect(runOrder("test", "order", { maxLines: 0 })).rejects.toBeInstanceOf(TooManyLinesError);
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
  });
});
