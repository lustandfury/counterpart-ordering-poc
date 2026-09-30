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
      await checkPlacement("#paste");
      const generate = page.getByRole("button", { name: "Generate", exact: true });
      await expect.poll(() => generate.evaluate(el => getComputedStyle(el, "::after").padding)).toBe("3px");
      await expect.poll(() => generate.evaluate(el => getComputedStyle(el, "::before").animationName)).toBe("tour-glow");
      await generate.click();
      await expect(tour).toContainText("1 of 3");
      const run = page.getByRole("button", { name: "Run ⌘↵", exact: true });
      await run.click();
      await expect(page.getByRole("alert").filter({ hasText: "Try again." })).toBeVisible();
      await expect(tour).toContainText("1 of 3");
      succeeds = true;
      await run.click();
      await expect(tour).toContainText("2 of 3");
      const choice = page.locator(".tour-choice .tour-option").first();
      await expect(choice).toBeVisible();
      await checkPlacement(".tour-choice .tour-option");

      if (width === 1440) {
        await page.locator("#review").focus();
        await page.keyboard.press("Enter");
      } else {
        await choice.click();
      }
      await expect(tour).toContainText("3 of 3");
      await page.emulateMedia({ reducedMotion: "reduce" });
      const comparison = page.locator(".tour-compare").first();
      await checkPlacement(".tour-compare");

      await expect.poll(() => comparison.evaluate(el => getComputedStyle(el, "::before").animationName)).toBe("none");
      await expect.poll(() => comparison.evaluate(el => getComputedStyle(el, "::after").animationName)).toBe("none");
      await page.getByRole("button", { name: /^Claude only/ }).click();
      await expect(tour).toContainText("3 of 3");
      await page.getByRole("button", { name: /^Claude only/ }).click();
      await expect(tour).toContainText("3 of 3");
      await page.getByRole("button", { name: /^Claude \+ Jev/ }).click();
      await expect(tour).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("counterpart-walkthrough-complete"))).toBe("true");
      console.log(`Onboarding placement, auto-advance, and highlight checks passed at ${width}×${height}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
