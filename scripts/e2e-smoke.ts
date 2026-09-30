// Browser regression checks against a running app; API calls are mocked.
import { chromium, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const base = `http://localhost:${process.env.PORT ?? 3100}`;

async function unlock(page: Page) {
  await page.getByLabel("Access code", { exact: true }).fill("007");
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await expect(page.locator(".lock-screen")).toHaveCount(0);
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.addInitScript(() => localStorage.setItem("counterpart-walkthrough-complete", "true"));
      await page.goto(base);
      await unlock(page);
      await expect(page.getByRole("region", { name: "Needs review", exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Validated items", exact: true })).toBeVisible();
      const openCost = async () => {
        if (width < 1024 && !(await page.locator("#cost-comparison").isVisible())) {
          await page.getByRole("button", { name: "Cost comparison", exact: true }).click();
        }
      };
      if (width < 1024) {
        await expect(page.locator("#cost-comparison")).toBeHidden();
        await expect(page.getByRole("button", { name: "Cost comparison", exact: true }).locator("..").locator("button, a")).toHaveCount(4);
        await page.getByRole("button", { name: /^Settings/ }).click();
        await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
        await expect(page.locator("#cost-comparison")).toBeHidden();
        await page.getByRole("button", { name: "Close settings" }).click();
        await page.getByRole("button", { name: "About Counterpart" }).click();
        await expect(page.getByRole("button", { name: "Close help" })).toBeVisible();
        await expect(page.locator("#cost-comparison")).toBeHidden();
        await page.getByRole("button", { name: "Close help" }).click();
        await openCost();
        await expect(page.getByRole("dialog", { name: "Cost assessment" })).toBeVisible();
        await expect(page.locator("#cost-comparison")).toHaveClass(/action-sheet-dialog/);
        expect(await page.locator("#cost-comparison").evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(width);
        await expect.poll(() => page.locator("#cost-comparison").evaluate(el => getComputedStyle(el).animationName)).toBe("lock-sheet-in");
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: "Close cost comparison", exact: true })).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(page.locator("#cost-comparison").getByRole("link").last()).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: "Close cost comparison", exact: true })).toBeFocused();
        await expect(page.locator("#review")).toHaveAttribute("inert", "");
        await page.getByRole("button", { name: "Close cost comparison", exact: true }).click();
        await expect(page.locator("#cost-comparison").locator("..")).toHaveAttribute("data-state", "closing");
        await expect.poll(() => page.locator("#cost-comparison").evaluate(el => getComputedStyle(el).animationName)).toBe("lock-sheet-out");
        await expect(page.locator("#cost-comparison")).toBeHidden();
        await expect(page.getByRole("button", { name: "Cost comparison", exact: true })).toBeFocused();
        await openCost();
        await page.keyboard.press("Escape");
        await expect(page.locator("#cost-comparison")).toBeHidden();
        await openCost();
        await page.locator(".action-sheet-backdrop").click({ position: { x: 5, y: 5 } });
        await expect(page.locator("#cost-comparison")).toBeHidden();
        await page.getByRole("button", { name: "Show orders", exact: true }).click();
        expect(await page.locator("#orders").evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(width);
        await page.getByRole("button", { name: "Hide orders", exact: true }).click();
        await expect(page.locator("#orders")).toHaveAttribute("data-state", "closing");
        await expect.poll(() => page.locator("#orders").evaluate(el => getComputedStyle(el).animationName)).toBe("lock-sheet-out");
        await expect(page.locator("#orders")).toBeHidden();
      }

      const headerSend = page.locator("#send-order");
      const floatingSend = page.locator("#floating-send-order");
      const floatingBar = page.locator(".floating-send");
      const validatedList = page.getByRole("region", { name: "Validated items", exact: true });
      await expect(headerSend).toBeDisabled();
      await headerSend.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#send-order-guidance")).toContainText("Confirm a product and quantity");
      await expect(page.getByRole("button", { name: "Reopen", exact: true })).toHaveCount(0);
      await expect(floatingBar).toHaveAttribute("aria-hidden", "true");

      // Keep this short sample scrollable even after its final review item is confirmed.
      await validatedList.evaluate((el) => { (el as HTMLElement).style.minHeight = "1200px"; });
      await page.getByRole("region", { name: "Needs review", exact: true }).evaluate((el) => el.scrollIntoView({ block: "start" }));
      await expect(headerSend).not.toBeInViewport();
      if (width > 1023) {
        await page.getByRole("region", { name: "Needs review", exact: true }).locator("li").first().focus();
        await page.keyboard.press("2");
      } else {
        const option = page.getByRole("region", { name: "Needs review", exact: true }).locator(".tour-option").nth(1);
        await expect(option).toBeInViewport();
        const bounds = await option.boundingBox();
        if (!bounds) throw new Error("Review option has no visible bounds");
        await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      }
      await expect(page.getByRole("region", { name: "Needs review", exact: true })).toHaveCount(0);
      await expect(headerSend).toBeEnabled();
      await expect(headerSend).not.toBeInViewport();
      await expect(floatingBar).toHaveAttribute("aria-hidden", "false");
      await expect(floatingSend).toBeInViewport();
      await expect(page.locator("#send-order-guidance")).toHaveCount(0);
      await headerSend.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await expect(floatingBar).toHaveAttribute("aria-hidden", "true");
      const summaryCard = page.locator("[aria-live=polite]");
      const headerLayout = () => summaryCard.evaluate(el => {
        const card = el.getBoundingClientRect();
        const title = el.querySelector("h1")!.getBoundingClientRect();
        const counts = el.querySelector(".divide-x")!.getBoundingClientRect();
        return { countsX: counts.x - card.x, countsY: counts.y - card.y, titleY: title.y - card.y, overflow: el.scrollWidth - el.clientWidth };
      });
      const beforeSend = await headerLayout();
      await validatedList.evaluate((el) => el.scrollIntoView({ block: "end" }));
      await expect(floatingBar).toHaveAttribute("aria-hidden", "false");
      await floatingSend.click();
      await expect(floatingBar).toHaveAttribute("aria-hidden", "true");
      await expect(page.getByRole("status")).toContainText("Sent to");
      const afterSend = await headerLayout();
      expect(afterSend.overflow).toBeLessThanOrEqual(1);
      if (width > 1023) {
        expect(Math.abs(afterSend.countsX - beforeSend.countsX)).toBeLessThanOrEqual(1);
        expect(Math.abs(afterSend.countsY - beforeSend.countsY)).toBeLessThanOrEqual(1);
        expect(Math.abs(afterSend.titleY - beforeSend.titleY)).toBeLessThanOrEqual(1);
      }
      await page.getByRole("button", { name: "Reopen", exact: true }).click();
      await validatedList.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(floatingBar).toHaveAttribute("aria-hidden", "true");
      await validatedList.evaluate((el) => { (el as HTMLElement).style.minHeight = ""; });
      await headerSend.evaluate((el) => el.scrollIntoView({ block: "start" }));

      const closeMobileCost = async () => {
        if (width < 1024 && await page.locator("#cost-comparison").isVisible()) {
          await page.getByRole("button", { name: "Close cost comparison", exact: true }).click();
          await expect(page.locator("#cost-comparison")).toBeHidden();
        }
      };
      const settings = async () => {
        await closeMobileCost();
        await page.getByRole("button", { name: /^Settings/ }).click();
      };
      const goToResults = async () => {
        await closeMobileCost();
        await page.getByRole("link", { name: "Sample results", exact: true }).click();
      };
      const closeSettings = () => page.getByRole("button", { name: "Close settings" }).click();
      if (width > 1023) await page.getByRole("button", { name: "Hide orders", exact: true }).click();
      await settings();
      await page.getByRole("button", { name: "Replay walkthrough" }).click();
      await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toHaveCount(0);
      await expect(page.locator("#orders")).toBeVisible();
      const generate = page.getByRole("button", { name: "Generate", exact: true });
      await expect(generate).toHaveClass(/tour-cue/);
      await expect(page.getByRole("button", { name: "Next", exact: true })).not.toHaveClass(/tour-cue/);
      await generate.click();
      await expect(generate).not.toHaveClass(/tour-cue/);
      await expect(page.getByRole("button", { name: "Run ⌘↵", exact: true })).toHaveClass(/tour-cue/);
      await page.getByRole("button", { name: "Next", exact: true }).click();
      const choice = page.locator(".tour-choice .tour-option").first();
      await expect(choice).toBeVisible();
      await expect.poll(() => choice.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
      await expect.poll(() => choice.evaluate((el) => getComputedStyle(el, "::after").animationName)).toBe("tour-trace");
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(page.locator("#orders")).toBeVisible();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      const comparison = page.locator(".tour-compare").first();
      await expect.poll(() => comparison.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + 40));
      })).toBe(true);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect.poll(() => comparison.evaluate((el) => getComputedStyle(el, "::after").animationName)).toBe("none");
      // the final tour button reads "Done" on phones and "Let's get to work" on wide screens
      await page.getByRole("button", { name: width < 1024 ? "Done" : "Let's get to work", exact: true }).click();
      await expect(page.locator(".walkthrough-card")).toHaveCount(0);

      if (width < 1024) await page.getByRole("button", { name: "Show orders", exact: true }).click();
      const paste = page.getByLabel("Paste a text-message order");
      await paste.fill("x".repeat(479));
      await expect(page.getByLabel("479 of 600 characters", { exact: true })).toHaveCount(0);
      await paste.fill("x".repeat(480));
      await expect(page.getByLabel("480 of 600 characters", { exact: true })).toBeVisible();
      await paste.fill("12 2x4x8");
      await expect(page.getByLabel(/of 600 characters/)).toHaveCount(0);
      if (width < 1024) await page.getByRole("button", { name: "Hide orders", exact: true }).click();

      if (width > 1023) {
        const summary = page.locator("[aria-live=polite]");
        const reviewItems = page.getByRole("region", { name: "Needs review", exact: true });
        const validatedItems = page.getByRole("region", { name: "Validated items", exact: true });
        const lineId = await reviewItems.locator("li").first().getAttribute("id");
        await expect(summary).toContainText("1 To check");
        await expect(reviewItems.locator("li")).toHaveCount(1);
        await page.locator("#review").focus();
        // The sample suggests Not in catalog first; choose its second option to validate a product.
        await page.keyboard.press("2");
        await expect(summary).toContainText("0 To check");
        await expect(reviewItems).toHaveCount(0);
        await expect(validatedItems.locator(`[id="${lineId}"]`)).toHaveCount(1);
        await expect(headerSend).toBeEnabled();
        await headerSend.click();
        await expect(page.getByRole("status")).toContainText("Sent to");
        await page.getByRole("button", { name: "Reopen", exact: true }).click();
        await page.getByRole("button", { name: "Undo", exact: true }).click();
        await expect(summary).toContainText("1 To check");
        await expect(reviewItems.locator(`[id="${lineId}"]`)).toHaveCount(1);
        await expect(validatedItems.locator(`[id="${lineId}"]`)).toHaveCount(0);
        await page.locator("#review").focus();
        await page.keyboard.press("x");
        const excludedItems = page.getByRole("region", { name: "Not in catalog", exact: true });
        await expect(excludedItems.locator(`[id="${lineId}"]`)).toHaveCount(1);
        await expect(reviewItems).toHaveCount(0);
        await expect(validatedItems.locator(`[id="${lineId}"]`)).toHaveCount(0);
        await excludedItems.getByRole("button", { name: "Undo", exact: true }).click();
        await expect(reviewItems.locator(`[id="${lineId}"]`)).toHaveCount(1);
        await expect(excludedItems).toHaveCount(0);
        await settings();
        await page.locator("#t").fill("0.99");
        await expect(page.locator("#t")).toHaveValue("0.99");
        await page.getByRole("radio", { name: "Dark", exact: true }).click();
        await closeSettings();
        await page.reload();
        await unlock(page);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        await settings();
        await page.getByRole("radio", { name: "Light", exact: true }).click();
        await closeSettings();
        await page.getByRole("button", { name: /^Claude only/ }).click();
        await settings();
        await expect(page.locator("#t")).toBeDisabled();
        await closeSettings();
      }

      {
        const orderTitle = await page.locator("#review h1").innerText();
        const summary = await page.locator("[aria-live=polite]").textContent() ?? "";
        await goToResults();
        const sheet = page.getByRole("dialog", { name: "Sample results", exact: true });
        await expect(sheet).toBeVisible();
        await expect(sheet).toHaveClass(/action-sheet-dialog/);
        const sheetWidth = await sheet.evaluate(el => Math.round(el.getBoundingClientRect().width));
        if (width > 1023) {
          expect(sheetWidth).toBe(1152);
          const bounds = await sheet.boundingBox();
          expect(bounds!.x).toBe((width - sheetWidth) / 2);
          expect(bounds!.height).toBeLessThanOrEqual(968);
        } else expect(sheetWidth).toBe(width);
        await expect(sheet.getByRole("region", { name: "Quality", exact: true })).toBeVisible();
        await expect(page).toHaveURL(`${base}/`);
        await sheet.getByRole("button", { name: "Close sample results" }).click();
        await expect(sheet).toBeHidden();
        await expect(page.locator("#review h1")).toHaveText(orderTitle);
        await expect(page.locator("[aria-live=polite]")).toHaveText(summary);
        await openCost();
        await page.getByRole("link", { name: /^See results on all/ }).click();
        await expect(sheet).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
        if (width < 1024) await expect(page.getByRole("dialog", { name: "Cost assessment", exact: true })).toBeVisible();
        else await expect(page.getByRole("complementary", { name: "Cost assessment", exact: true })).toBeVisible();
        await closeMobileCost();
        await goToResults();
        await sheet.locator("tbody tr").filter({ hasText: "o07" }).getByRole("button", { name: "Open", exact: true }).click();
        await expect(sheet).toBeHidden();
        await expect(page).toHaveURL(`${base}/`);
      }
      await expect(page.getByRole("heading", { name: "Order o07" })).toBeVisible();
      await expect(page.locator(".lock-screen")).toHaveCount(0);
      await page.reload();
      await expect(page.getByLabel("Access code", { exact: true })).toBeVisible();
      await unlock(page);

      // Exercise signup and retry without spending API credits or writing to Postgres.
      if (width > 1023) {
        let signedUp = false;
        const sample = JSON.parse(readFileSync("results/o13.json", "utf8"));
        await page.route("**/api/run", (route) => route.fulfill({
          status: signedUp ? 200 : 402,
          json: signedUp ? sample : { code: "SIGNUP_REQUIRED" },
        }));
        await page.route("**/api/signup", (route) => {
          signedUp = true;
          return route.fulfill({ json: { ok: true } });
        });
        await paste.fill("12 2x4x8");
        await page.getByRole("button", { name: "Run ⌘↵", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Keep generating orders" })).toBeVisible();
        await page.getByLabel("Email address", { exact: true }).fill("rep@example.com");
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Order 1001", exact: true })).toBeVisible();
      }

      console.log(`Browser checks passed at ${width}px`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
