// Verify computed results, slider persistence, and both themes against a running app.
import { chromium, expect } from "@playwright/test";

const base = `http://localhost:${process.env.PORT ?? 3100}`;
async function main() {
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await page.getByRole("button", { name: "Try the demo" }).click();
    await page.getByRole("button", { name: "Enter", exact: true }).click();
    await expect(page.locator(".lock-screen")).toHaveCount(0);
    await expect(page.locator(".tour-cost")).toContainText("× this order");
    await expect(page.locator(".tour-cost")).not.toContainText("faster");
    const liveCosts = await page.locator(".tour-compare .text-xl").allTextContents();
    const [jevCost, claudeCost] = liveCosts.map((value) => Number(value.slice(1)));
    // The ratio uses full precision; displayed four-decimal totals should agree within rounding.
    const liveRatio = Number((await page.locator(".tour-cost").innerText()).match(/([\d.]+)× this order/)![1]);
    expect(Math.abs(liveRatio - claudeCost / jevCost)).toBeLessThan(0.1);
    await page.getByRole("link", { name: /See results on all 20 sample orders/ }).click();
    await expect(page.getByTestId("results-headline")).toHaveText("Same accuracy and the same review decisions on all 88 lines, at 4.5× lower cost per order.");
    const totals = page.locator('section[aria-label="Per order"] tfoot');
    await expect(totals.locator("td")).toHaveText(["88", "21", "66", "87", "66", "87", "1", "1", "$0.0101", "$0.0456", ""]);
    await expect(page.locator('section[aria-label="Cost"]')).toContainText("4.4× cheaper");
    await page.getByRole("link", { name: "← Back to review" }).click();
    await expect(page).toHaveURL(`${base}/`);
    await expect(page.locator(".lock-screen")).toHaveCount(0);
    await page.getByRole("button", { name: /^Settings/ }).click();
    await page.getByRole("slider", { name: /Product confidence/ }).focus();
    await page.keyboard.press("End");
    await page.getByRole("slider", { name: /Quantity clarity/ }).focus();
    await page.keyboard.press("End");
    await page.getByRole("button", { name: "Close settings" }).click();
    await page.getByRole("link", { name: /See results on all/ }).click();
    await expect(page).toHaveURL(`${base}/results`);
    await expect(page.getByTestId("results-headline")).toContainText(/the same review decision on \d+ of 88 lines/);
    await expect(page.getByRole("main")).toContainText("(custom)");
    await expect(page.getByRole("main")).toContainText("Decisions differ");
    await page.getByRole("button", { name: "Reset to defaults" }).click();
    await expect(page.getByTestId("results-headline")).toContainText("on all 88 lines");
    await page.getByRole("link", { name: "← Back to review" }).click();
    await expect(page).toHaveURL(`${base}/`);
    await page.getByRole("button", { name: /^Settings/ }).click();
    await expect(page.getByRole("slider", { name: /Product confidence/ })).toHaveValue("0.85");
    await expect(page.getByRole("slider", { name: /Quantity clarity/ })).toHaveValue("0.8");
    await page.getByRole("button", { name: "Close settings" }).click();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; localStorage.setItem("counterpart-theme", value); }, theme);
      await page.screenshot({ path: `/tmp/counterpart-review-${width}-${theme}.png`, fullPage: true });
      const segments = page.locator(".tour-compare .h-1\\.5 span");
      expect(await segments.count()).toBe(4);
      const colors = await segments.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
      expect(colors[0]).toBe(colors[2]);
      expect(colors[1]).toBe(colors[3]);
      expect(colors[0]).not.toBe(colors[1]);
      await page.getByRole("link", { name: /See results on all/ }).click();
    await expect(page).toHaveURL(`${base}/results`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

      await page.screenshot({ path: `/tmp/counterpart-results-${width}-${theme}.png`, fullPage: true });
      await page.getByRole("link", { name: "← Back to review" }).click();
    await expect(page).toHaveURL(`${base}/`);
    }
    await page.reload();
    await expect(page.getByRole("button", { name: "Try the demo" })).toBeVisible();
    expect(errors).toEqual([]);
    await page.close();
    console.log(`Results, thresholds, gate, and themes passed at ${width}px`);
  }
} finally { await browser.close(); }

}
main();
