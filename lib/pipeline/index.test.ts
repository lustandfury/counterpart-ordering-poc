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
    let resolveP!: (v: OrderResult["parse"]) => void;
    let resolveM!: (v: OrderResult["jev"]["lines"][number]) => void;
    let resolveC!: (v: OrderResult["claudeOnly"]) => void;
    const parsed = new Promise<OrderResult["parse"]>((res) => (resolveP = res));
    const matched = new Promise<OrderResult["jev"]["lines"][number]>((res) => (resolveM = res));
    const compared = new Promise<OrderResult["claudeOnly"]>((res) => (resolveC = res));
    mocks.parse.mockReturnValue(parsed);
    mocks.decide.mockReturnValue(matched);
    mocks.compare.mockReturnValue(compared);
    const events: OrderProgress[] = [];
    const running = runOrder("test", "order", { onProgress: progress => events.push(progress) });
    expect(events).toEqual([{ stage: "parse", status: "running" }]);
    expect(mocks.decide).not.toHaveBeenCalled();
    resolveP({ ...fixture.parse, lines: fixture.parse.lines.slice(0, 1) });
    await vi.waitFor(() => expect(mocks.compare).toHaveBeenCalled());
    expect(events).toContainEqual({ stage: "jev", status: "running", completed: 0, total: 1 });
    expect(events).toContainEqual({ stage: "claude", status: "running" });
    if (first === "jev") resolveM(fixture.jev.lines[0]);
    else resolveC(fixture.claudeOnly);
    await vi.waitFor(() => expect(events.some(event => event.stage === first && event.status === "complete")).toBe(true));
    expect(events.some(event => event.stage === (first === "jev" ? "claude" : "jev") && event.status === "complete")).toBe(false);
    if (first === "jev") resolveC(fixture.claudeOnly);
    else resolveM(fixture.jev.lines[0]);
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
