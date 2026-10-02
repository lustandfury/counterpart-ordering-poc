// Browser checks use a controlled response stream; no paid AI calls are made.
import { chromium, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { OrderStreamEvent } from "../lib/order-progress";
import type { OrderResult } from "../lib/types";

const base = `http://localhost:${process.env.PORT ?? 3100}`;
const sample = JSON.parse(readFileSync("results/o13.json", "utf8")) as OrderResult;

async function main() {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route(/posthog\.com\//, route => route.abort());
      await page.addInitScript(() => {
        const originalFetch = window.fetch.bind(window);
        let controller: ReadableStreamDefaultController<Uint8Array>;
        const testingWindow = window as typeof window & { orderTest: { send: (event: unknown) => void; finish: () => void } };
        testingWindow.orderTest = {
          send(event) { controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n")); },
          finish() { controller.close(); },
        };
        window.fetch = (input, init) => {
          if (input === "/api/run") {
            const stream = new ReadableStream<Uint8Array>({ start(current) { controller = current; } });
            return Promise.resolve(new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } }));
          }
          return originalFetch(input, init);
        };
      });
      const send = (events: OrderStreamEvent[]) => page.evaluate(events => {
        const testingWindow = window as typeof window & { orderTest: { send: (event: unknown) => void } };
        events.forEach(event => testingWindow.orderTest.send(event));
      }, events);
      const finish = () => page.evaluate(() => {
        (window as typeof window & { orderTest: { finish: () => void } }).orderTest.finish();
      });
      await page.goto(base);
      await page.getByLabel("Access code", { exact: true }).fill("007");
      await page.keyboard.press("Enter");
      await expect(page.locator(".lock-screen")).toHaveCount(0);
      const generate = async () => {
        // on phones the queue is a sheet (the walkthrough may already have opened it)
        if (width === 390 && !(await page.locator("#orders").isVisible())) await page.getByRole("button", { name: /^Show orders/ }).click();
        await page.getByRole("button", { name: "Generate order", exact: true }).click();
      };
      // wait for the first order to arrive and the walkthrough to start, as a visitor would
      await expect(page.locator(".walkthrough-card")).toContainText("1 of 3");
      if (width === 390) await page.getByRole("button", { name: "Close walkthrough" }).click();
      await generate();
      const loading = page.getByRole("region", { name: "Order processing" });
      await expect(loading).toBeVisible();
      // the order joins the queue as soon as it's generated, before its lines are read
      const queue = page.getByRole("navigation", { name: "Incoming orders" });
      const reading = queue.locator('button[aria-busy="true"]');
      if (width !== 390) await expect(reading).toContainText("1021");
      if (width !== 390) await expect(reading).toContainText("Reading…");
      await expect(page.locator(".walkthrough-card")).toHaveCount(0);
      if (width === 390) await expect(page.locator("#orders")).not.toBeVisible();
      await expect(loading.locator('[data-stage="access"]')).toHaveAttribute("data-status", "running");
      await send([
        { type: "progress", progress: { stage: "access", status: "complete" } },
        { type: "progress", progress: { stage: "parse", status: "running" } },
      ]);
      await expect(loading.locator('[data-stage="parse"]')).toHaveAttribute("data-status", "running");
      await expect(loading.locator('[data-stage="jev"]')).toHaveAttribute("data-status", "waiting");
      await send([
        { type: "progress", progress: { stage: "parse", status: "complete", total: 2 } },
        { type: "progress", progress: { stage: "jev", status: "running", completed: 1, total: 2 } },
        { type: "progress", progress: { stage: "claude", status: "running" } },
      ]);
      await expect(loading).toContainText("1 of 2 lines processed");
      await expect(loading.locator('[data-stage="claude"]')).toHaveAttribute("data-status", "running");
      await send([{ type: "progress", progress: { stage: "jev", status: "complete", completed: 2, total: 2 } }]);
      await expect(loading.locator('[data-stage="jev"]')).toHaveAttribute("data-status", "complete");
      await expect(loading.locator('[data-stage="claude"]')).toHaveAttribute("data-status", "running");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect.poll(() => page.locator(".order-loading-spinner").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
      await expect.poll(() => page.locator(".order-loading-bar").first().evaluate(el => getComputedStyle(el).animationName)).toBe("none");
      await send([
        { type: "progress", progress: { stage: "claude", status: "complete" } },
        { type: "result", result: sample },
      ]);
      await finish();
      await expect(loading).toHaveCount(0);
      await expect(reading).toHaveCount(0);
      // it lands at the top of the queue and waits for the rep to open it
      await expect(page.getByRole("heading", { name: "A new order is in your queue" })).toBeVisible();
      if (width === 390) await page.getByRole("button", { name: "Show orders (1 new)", exact: true }).click();
      await expect(queue.locator("li button").first()).toContainText("1021");
      await queue.locator("li button").first().click();
      await expect(page.locator("#review h1 + p")).toContainText("1021");
      // on phones, opening an order closes the queue sheet
      if (width !== 390) await expect(queue.locator('button[aria-current="true"]')).toContainText("1021");
      if (width !== 390) {
        await expect(page.locator(".walkthrough-card")).toContainText("2 of 3");
        await page.getByRole("button", { name: "Close walkthrough" }).click();
      }
      await generate();
      await expect(loading).toBeVisible();
      await send([{ type: "error", error: "Processing failed. Please retry." }]);
      await expect(loading).toHaveCount(0);
      await expect(page.getByRole("alert").filter({ hasText: "Processing failed." })).toBeVisible();
      await expect(reading).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Generate order", exact: true })).toBeEnabled();
      console.log(`Accurate loading progress, completion, and retry checks passed at ${width}px`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
