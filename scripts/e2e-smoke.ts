// Browser regression checks against a running app; API calls are mocked.
import { chromium, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const base = `http://localhost:${process.env.PORT ?? 3100}`;

async function unlock(page: Page) {
  await page.getByLabel("Access code", { exact: true }).fill("007");
  await page.getByRole("button", { name: "Enter Counterpart" }).click();
  await expect(page.locator(".lock-screen")).toHaveCount(0);
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.addInitScript(() => localStorage.setItem("counterpart-walkthrough-complete", "true"));
      await page.goto(base);
      await unlock(page);

      const settings = () => page.getByRole("button", { name: /^Settings/ }).click();
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
      await page.getByRole("button", { name: "Let's get to work", exact: true }).click();
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
        await expect(summary).toContainText("1 To check");
        await page.locator("#review").focus();
        await page.keyboard.press("Enter");
        await expect(summary).toContainText("0 To check");
        await expect(page.getByRole("button", { name: "Send order", exact: true })).toBeEnabled();
        await page.getByRole("button", { name: "Send order", exact: true }).click();
        await expect(page.getByRole("status")).toContainText("Demo only");
        await page.getByRole("button", { name: "Reopen", exact: true }).click();
        await page.getByRole("button", { name: "Undo", exact: true }).click();
        await expect(summary).toContainText("1 To check");
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

      await page.getByRole("link", { name: "Sample results", exact: true }).click();
      await page.getByRole("link", { name: "← Back to review", exact: true }).click();
      await expect(page.locator(".lock-screen")).toHaveCount(0);
      await page.getByRole("link", { name: "Sample results", exact: true }).click();
      await expect(page).toHaveURL(`${base}/results`);
      await page.goBack();
      await expect(page).toHaveURL(`${base}/`);
      await expect(page.locator(".lock-screen")).toHaveCount(0);
      await page.getByRole("link", { name: "Sample results", exact: true }).click();
      await page.locator('a[href="/?order=o07"]').first().click();
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
        await expect(page.getByRole("heading", { name: "Your order", exact: true })).toBeVisible();
      }

      console.log(`Browser checks passed at ${width}px`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
