// Run against a local production build. AI calls and analytics are intercepted.
import { chromium, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const base = `http://localhost:${process.env.PORT ?? 3100}`;
const sample = JSON.parse(readFileSync("results/o13.json", "utf8"));

async function main() {
  const browser = await chromium.launch();
  try {
    for (const { width, height } of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.route(/posthog\.com\//, (route) => route.abort());
      let succeeds = false;
      await page.route("**/api/run", (route) => route.fulfill({
        status: succeeds ? 200 : 500,
        json: succeeds ? sample : { error: "Try again." },
      }));
      await page.goto(base);
      await page.getByLabel("Access code", { exact: true }).fill("007");
      await page.keyboard.press("Enter");
      await expect(page.locator(".lock-screen")).toHaveCount(0);
      const tour = page.locator(".walkthrough-card");
      const checkPlacement = async (selector: string) => {
        await expect(tour).toBeVisible();
        await expect.poll(async () => {
          const card = await tour.boundingBox();
          const target = await page.locator(selector).first().boundingBox();
          if (!card || !target) return false;
          const side = await tour.getAttribute("data-side");
          const gap = side === "bottom" ? target.y - (card.y + card.height)
            : side === "top" ? card.y - (target.y + target.height)
            : side === "left" ? card.x - (target.x + target.width)
            : target.x - (card.x + card.width);
          return card.x >= 0 && card.y >= 0 && card.x + card.width <= width && card.y + card.height <= height
            && gap >= 10 && gap <= 14 && (width >= 1024 || card.height < 185);
        }).toBe(true);
      };
      await expect(tour).toContainText("1 of 3");
      // Step 1 points at the order in the queue (a sheet on phones); nothing is open until the rep opens it
      const firstOrder = page.locator("#orders nav li button").first();
      await checkPlacement("#orders nav li button");
      await expect(page.getByRole("heading", { name: "A new order is in your queue" })).toBeVisible();
      if (width >= 1024) {
        // Generate order sits beside the tour: a failed run keeps step 1; a good one lands at the top of the queue
        const generate = page.getByRole("button", { name: "Generate order", exact: true });
        await generate.click();
        await expect(page.getByRole("alert").filter({ hasText: "Try again." })).toBeVisible();
        await expect(tour).toContainText("1 of 3");
        succeeds = true;
        await generate.click();
        await expect(firstOrder).toContainText("1021");
        await expect(tour).toContainText("1 of 3");
      }
      // opening the order moves the tour on
      await firstOrder.click();
      await expect(tour).toContainText("2 of 3");
      const choice = page.locator(".tour-choice .tour-option").first();
      await expect(choice).toBeVisible();
      await checkPlacement(".tour-choice .tour-option");

      // The suggestion is to leave the tape off, so pick the closest product: it's sold by the roll, so the
      // quantity editor opens first, and the tour only moves on once the quantity is confirmed.
      if (width === 1440) {
        await page.locator("#review").focus();
        await page.keyboard.press("1");
      } else {
        await choice.click();
      }
      await expect(page.getByLabel("Quantity in rolls", { exact: true })).toHaveValue("1");
      await expect(tour).toContainText("2 of 3");
      await page.getByRole("button", { name: /^Confirm 1 roll/ }).click();
      await expect(tour).toContainText("3 of 3");
      await page.emulateMedia({ reducedMotion: "reduce" });
      const send = page.locator("#send-order");
      await checkPlacement("#send-order");
      await expect.poll(() => send.evaluate(el => getComputedStyle(el, "::before").animationName)).toBe("none");
      await expect.poll(() => send.evaluate(el => getComputedStyle(el, "::after").animationName)).toBe("none");
      // the visitor sends it; that ends the tour
      await send.click();
      await expect(tour).toHaveCount(0);
      await expect(page.locator("#send-order-note")).toContainText("Sent to");
      expect(await page.evaluate(() => localStorage.getItem("counterpart-walkthrough-complete"))).toBe("true");
      console.log(`Onboarding placement, auto-advance, and highlight checks passed at ${width}×${height}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
