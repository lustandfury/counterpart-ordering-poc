// Browser regression checks against a running app; API calls are mocked.
import { chromium, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const base = `http://localhost:${process.env.PORT ?? 3100}`;

async function unlock(page: Page) {
  await page.getByLabel("Access code", { exact: true }).fill("007");
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await expect(page.locator(".lock-screen")).toHaveCount(0);
}

// Nothing opens by itself: the first order lands in the queue and the rep opens it (on phones, through the orders button).
async function openFirstOrder(page: Page, width: number) {
  if (width < 1024) await page.getByRole("button", { name: /^Show orders/ }).click();
  await page.locator("#orders nav li button").first().click();
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.goto(base);
      await unlock(page);
      await expect(page.getByRole("heading", { name: "A new order is in your queue" })).toBeVisible();
      if (width < 1024) {
        // the floating orders button counts the order that arrived while the queue was closed
        await expect(page.getByRole("button", { name: "Show orders (1 new)", exact: true })).toBeVisible();
        await expect(page.locator(".orders-fab .order-badge")).toHaveText("2"); // the arrival plus the earlier photo order
      }
      await openFirstOrder(page, width);
      await expect(page.getByRole("region", { name: "Needs review", exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Validated items", exact: true })).toBeVisible();
      // The savings sit in their own small card under the order card, "3.9× lower AI cost | 26% faster".
      // Clicking it opens the details: a sheet on phones, the rail on wide screens (closed at first).
      const compare = page.locator("#review").getByRole("button", { name: /^\d+\.\d× lower AI cost( \| (\d+% (faster|slower)|same speed))?$/ });
      await expect(compare).toBeVisible();
      const openCost = async () => {
        if (width < 1024 && !(await page.locator("#cost-comparison").isVisible())) {
          await compare.click();
        } else if (width >= 1024 && !(await page.locator("#cost-rail").isVisible())) {
          await compare.click();
          await expect(page.locator("#cost-rail")).toBeVisible();
        }
      };
      // Secondary tools live in the orders sidebar (a sheet on phones, and hidden once on wide screens below)
      const openOrders = async () => {
        // a phone sheet that is still animating closed counts as visible, so let it finish first
        if (width < 1024) await expect(page.locator('#orders[data-state="closing"]')).toBeHidden();
        // wide screens slide the sidebar away and mark it inert, so "visible" alone isn't enough
        const orders = page.locator("#orders");
        if (!(await orders.isVisible()) || (await orders.getAttribute("inert")) !== null) await page.getByRole("button", { name: /^Show orders/ }).click();
        await expect(orders).not.toHaveAttribute("inert", /.*/);
      };
      if (width >= 1024) await expect(page.locator("#cost-rail")).toBeHidden();
      if (width < 1024) {
        await expect(page.locator("#cost-comparison")).toBeHidden();
        // opening the queue cleared the "new" count
        await expect(page.getByRole("button", { name: "Show orders (2 received)", exact: true })).toBeVisible();
        // the open order stays counted on the button, so the rep knows it is waiting
        await expect(page.locator(".orders-fab .order-badge")).toHaveText("2");
        await openOrders();
        await page.getByRole("button", { name: /^Settings/ }).click();
        await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
        await expect(page.locator("#cost-comparison")).toBeHidden();
        await page.getByRole("button", { name: "Close settings" }).click();
        await openOrders();
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
        await expect(page.getByRole("button", { name: "Close AI cost comparison", exact: true })).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(page.locator("#cost-comparison").getByRole("link").last()).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: "Close AI cost comparison", exact: true })).toBeFocused();
        await expect(page.locator("#review")).toHaveAttribute("inert", "");
        await page.getByRole("button", { name: "Close AI cost comparison", exact: true }).click();
        await expect(page.locator("#cost-comparison").locator("..")).toHaveAttribute("data-state", "closing");
        await expect.poll(() => page.locator("#cost-comparison").evaluate(el => getComputedStyle(el).animationName)).toBe("lock-sheet-out");
        await expect(page.locator("#cost-comparison")).toBeHidden();
        await expect(compare).toBeFocused();
        await openCost();
        await page.keyboard.press("Escape");
        await expect(page.locator("#cost-comparison")).toBeHidden();
        await openCost();
        await page.locator(".action-sheet-backdrop").click({ position: { x: 5, y: 5 } });
        await expect(page.locator("#cost-comparison")).toBeHidden();
        await page.getByRole("button", { name: /^Show orders/ }).click();
        expect(await page.locator("#orders").evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(width);
        await page.getByRole("button", { name: "Hide orders", exact: true }).click();
        await expect(page.locator("#orders")).toHaveAttribute("data-state", "closing");
        await expect.poll(() => page.locator("#orders").evaluate(el => getComputedStyle(el).animationName)).toBe("lock-sheet-out");
        await expect(page.locator("#orders")).toBeHidden();
      }

      const send = page.locator("#send-order");
      const floatingSend = page.locator("#floating-send-order");
      const floatingBar = page.locator(".floating-send");
      const validatedList = page.getByRole("region", { name: "Validated items", exact: true });
      const needsReview = page.getByRole("region", { name: "Needs review", exact: true });
      // Send sits at the foot of the order, after the lines, and always says why it's off
      await send.scrollIntoViewIfNeeded();
      await expect(send).toHaveAttribute("aria-disabled", "true");
      await expect(page.locator("#send-order-note")).toContainText("1 line still to check");
      await send.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#send-order-guidance")).toContainText("Confirm a product and quantity");
      await expect(page.getByRole("button", { name: "Reopen", exact: true })).toHaveCount(0);

      // Keep this short sample scrollable even after its final review item is confirmed.
      await validatedList.evaluate((el) => { (el as HTMLElement).style.minHeight = "1200px"; });
      if (width >= 1280) {
        // wide screens: the order header is a pinned left column, so it stays in view while the lines scroll
        const header = page.locator("[aria-live=polite]");
        await page.locator("#review").evaluate((el) => el.scrollTo(0, 600));
        await expect(header).toBeInViewport();
        expect(await header.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(40);
        await page.locator("#review").evaluate((el) => el.scrollTo(0, 0));
      }
      await needsReview.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await expect(send).not.toBeInViewport();
      // the floating Send appears only once the review is done
      await expect(floatingBar).toHaveAttribute("aria-hidden", "true");

      // The tape line's closest product is sold by the roll, so picking it asks for a quantity in rolls,
      // prefilled from the product size (100 ft of a 250 ft roll = 1 roll). Nothing is decided until it's confirmed.
      if (width > 1023) {
        await page.locator("#review").focus();
        await page.keyboard.press("1");
      } else {
        const option = needsReview.locator(".tour-option").first();
        await expect(option).toBeInViewport();
        await option.click();
      }
      const quantity = page.getByLabel("Quantity in rolls", { exact: true });
      await expect(quantity).toBeFocused();
      await expect(quantity).toHaveValue("1");
      await expect(needsReview).toContainText("100 ft ÷ 250 ft per roll = 1 roll");
      await expect(page.locator("#order-counts")).toContainText("1 To check");
      await page.keyboard.press("Enter");
      await expect(needsReview).toHaveCount(0);
      await expect(validatedList).toContainText("1 roll");
      await expect(validatedList).toContainText("Product and quantity set by you");
      await expect(send).not.toBeInViewport();
      await expect(floatingBar).toHaveAttribute("aria-hidden", "false");
      await expect(floatingSend).toBeInViewport();
      await expect(page.locator("#send-order-guidance")).toHaveCount(0);
      await send.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await expect(floatingBar).toHaveAttribute("aria-hidden", "true");
      await expect(page.locator("#review")).toContainText("$400.50");
      // the footer adds 13% HST: $400.50 + $52.07 = $452.57
      await expect(page.locator("#review")).toContainText("$52.07");
      await expect(page.locator("#review")).toContainText("$452.57");
      await expect(page.locator("#send-order")).toHaveText("Send for approval");
      const summaryCard = page.locator("[aria-live=polite]");
      const headerLayout = () => summaryCard.evaluate(el => {
        const card = el.getBoundingClientRect();
        const title = el.querySelector("h1")!.getBoundingClientRect();
        // the line counts sit at the top of the order sheet, so measure them against it
        const sheet = document.querySelector('section[aria-label="Order"]')!.getBoundingClientRect();
        const counts = document.getElementById("order-counts")!.getBoundingClientRect();
        return { countsX: counts.x - sheet.x, countsY: counts.y - sheet.y, titleY: title.y - card.y, overflow: el.scrollWidth - el.clientWidth };
      });
      const beforeSend = await headerLayout();
      await validatedList.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await expect(floatingBar).toHaveAttribute("aria-hidden", "false");
      await floatingSend.click();
      await expect(floatingBar).toHaveAttribute("aria-hidden", "true");
      await expect(page.locator("#send-order-note")).toContainText("Sent to Owen Park for approval");
      const afterSend = await headerLayout();
      expect(afterSend.overflow).toBeLessThanOrEqual(1);
      if (width > 1023) {
        expect(Math.abs(afterSend.countsX - beforeSend.countsX)).toBeLessThanOrEqual(1);
        expect(Math.abs(afterSend.countsY - beforeSend.countsY)).toBeLessThanOrEqual(1);
        expect(Math.abs(afterSend.titleY - beforeSend.titleY)).toBeLessThanOrEqual(1);
      }
      await page.getByRole("button", { name: "Reopen", exact: true }).click();
      await validatedList.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.locator("#order-counts")).toContainText("1 To check");
      await validatedList.evaluate((el) => { (el as HTMLElement).style.minHeight = ""; });
      await page.locator("#review h1").evaluate((el) => el.scrollIntoView({ block: "start" }));

      const closeMobileCost = async () => {
        if (width < 1024 && await page.locator("#cost-comparison").isVisible()) {
          await page.getByRole("button", { name: "Close AI cost comparison", exact: true }).click();
          await expect(page.locator("#cost-comparison")).toBeHidden();
        }
      };
      const settings = async () => {
        await closeMobileCost();
        await openOrders();
        await page.getByRole("button", { name: /^Settings/ }).click();
      };
      // Sample results opens from the About dialog
      const goToResults = async () => {
        await closeMobileCost();
        await openOrders();
        await page.getByRole("button", { name: "About Counterpart", exact: true }).click();
        await page.getByRole("button", { name: "Sample results", exact: true }).click();
      };
      const closeSettings = () => page.getByRole("button", { name: "Close settings" }).click();
      if (width > 1023) {
        await page.getByRole("button", { name: "Hide orders", exact: true }).click();
        // the sidebar slides off the left edge before it counts as hidden
        await expect(page.locator("#orders")).toBeHidden();
      }
      // the queue has no text box: new orders come from Generate order
      await openOrders();
      await expect(page.getByRole("navigation", { name: "Incoming orders" })).toBeVisible();
      await expect(page.locator("textarea")).toHaveCount(0);
      if (width < 1024) await page.getByRole("button", { name: "Hide orders", exact: true }).click();

      if (width > 1023) {
        const summary = page.locator("#order-counts");
        const reviewItems = page.getByRole("region", { name: "Needs review", exact: true });
        const validatedItems = page.getByRole("region", { name: "Validated items", exact: true });
        const lineId = await reviewItems.locator("li").first().getAttribute("id");
        await expect(summary).toContainText("1 To check");
        await expect(reviewItems.locator("li")).toHaveCount(1);
        // The suggestion is to leave the line off, so Enter does nothing: that takes x or a click.
        await page.locator("#review").focus();
        await page.keyboard.press("Enter");
        await expect(summary).toContainText("1 To check");
        // the skip link moves to the line; it never decides it
        await page.getByRole("link", { name: "Skip to the first line to check" }).focus();
        await page.keyboard.press("Enter");
        await expect(summary).toContainText("1 To check");
        await page.evaluate(() => history.replaceState(null, "", "/")); // the skip link adds #line-…
        // Escape backs out of the quantity editor without deciding
        await page.locator("#review").focus();
        await page.keyboard.press("1");
        await page.keyboard.press("Escape");
        await expect(page.getByLabel("Quantity in rolls", { exact: true })).toHaveCount(0);
        await expect(reviewItems.locator(`[id="${lineId}"]`)).toHaveCount(1);
        await page.locator("#review").focus();
        await page.keyboard.press("x");
        const excludedItems = page.getByRole("region", { name: "Left off order", exact: true });
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
        await openFirstOrder(page, width);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        await settings();
        await page.getByRole("radio", { name: "Light", exact: true }).click();
        await closeSettings();
        await openCost();
        await page.getByRole("button", { name: /^Claude only/ }).click();
        await expect(page.locator("#review")).toContainText("Showing the Claude-only draft");
        await page.getByRole("button", { name: "Hide AI cost", exact: true }).click();
        await expect(page.locator("#cost-rail")).toBeHidden();
        await expect(page.locator("#review")).toContainText("Showing the Claude-only draft");
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
        await sheet.locator("tbody tr").filter({ hasText: "1007" }).getByRole("button", { name: "Open", exact: true }).click();
        await expect(sheet).toBeHidden();
        await expect(page).toHaveURL(`${base}/`);
      }
      await expect(page.locator("#review h1 + p")).toContainText("1007"); // sample o07, shown in the generated-order style
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
        await page.getByRole("button", { name: "Generate order", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Keep generating orders" })).toBeVisible();
        await page.getByLabel("Email address", { exact: true }).fill("rep@example.com");
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        // a generated order lands at the top of the queue for the rep to open; the first follows the 20 samples
        const newest = page.locator("#orders nav li button").first();
        await expect(newest).toContainText("1021");
        await newest.click();
        await expect(page.locator("#review h1 + p")).toContainText("1021");
      }

      console.log(`Browser checks passed at ${width}px`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
