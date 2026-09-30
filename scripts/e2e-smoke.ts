// Interaction smoke test against a running build (npm run build && npm start, PORT default 3100).
import { chromium } from "@playwright/test";
import assert from "node:assert";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://localhost:${process.env.PORT ?? 3100}`);
  await page.selectOption("#order", "o06");
  const summary = () => page.locator("[aria-live=polite]").innerText();
  assert.match(await summary(), /3 auto-approved[\s\S]*2 to check[\s\S]*0 done/);

  await page.keyboard.press("Enter"); // confirm the first flagged line; the cursor moves on by itself
  assert.match(await summary(), /1 done/);
  await page.keyboard.press("Enter"); // confirm the second
  assert.match(await summary(), /2 done/);
  assert.ok(await page.getByRole("status").filter({ hasText: "All checked" }).isVisible());
  await page.keyboard.press("x"); // already decided: must not overwrite anything
  await page.keyboard.press("Enter");
  assert.match(await summary(), /2 done/);

  await page.getByRole("button", { name: "Undo" }).first().click();
  assert.match(await summary(), /1 done/);

  // keys still work after touching a slider
  await page.locator("#u").focus();
  await page.keyboard.press("Enter");
  assert.match(await summary(), /2 done/);

  // slider re-routes lines in the browser: the strictest setting flags more
  await page.locator("#u").fill("0.9");
  const strict = await summary();
  await page.locator("#u").fill("0.3");
  const loose = await summary();
  console.log("T=0.99 ->", strict.replace(/\s+/g, " "), "| T=0.5 ->", loose.replace(/\s+/g, " "));
  assert.match(loose, /5 auto-approved/);
  assert.match(strict, /[0-3] auto-approved/);

  // Claude only mode disables the slider
  await page.getByRole("button", { name: "Claude only", exact: true }).click();
  assert.equal(await page.locator("#t").isDisabled(), true);
  await page.getByRole("button", { name: "Compare Jev vs Claude only" }).click();
  assert.ok(await page.getByRole("region", { name: "Comparison" }).isVisible());

  // switching orders resets review progress
  await page.selectOption("#order", "o02");
  assert.match(await summary(), /0 done/);
  console.log("e2e smoke ok");
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
