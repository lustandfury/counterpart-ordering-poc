// Run against a local production build. AI calls and analytics are intercepted.
import { chromium, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const base = `http://localhost:${process.env.PORT ?? 3100}`;
const sample = JSON.parse(readFileSync("results/o13.json", "utf8"));

async function main() {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
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
      await expect(tour).toContainText("1 of 3");
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
      if (width === 1440) {
        await page.locator("#review").focus();
        await page.keyboard.press("Enter");
      } else {
        await choice.click();
      }
      await expect(tour).toContainText("3 of 3");
      await page.emulateMedia({ reducedMotion: "reduce" });
      const comparison = page.locator(".tour-compare").first();
      await expect.poll(() => comparison.evaluate(el => getComputedStyle(el, "::before").animationName)).toBe("none");
      await expect.poll(() => comparison.evaluate(el => getComputedStyle(el, "::after").animationName)).toBe("none");
      await page.getByRole("button", { name: /^Claude only/ }).click();
      await expect(tour).toContainText("3 of 3");
      await page.getByRole("button", { name: /^Claude only/ }).click();
      await expect(tour).toContainText("3 of 3");
      await page.getByRole("button", { name: /^Claude \+ Jev/ }).click();
      await expect(tour).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("counterpart-walkthrough-complete"))).toBe("true");
      console.log(`Onboarding auto-advance and highlight checks passed at ${width}px`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
