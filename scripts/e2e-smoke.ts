// Interaction smoke test against a running build (npm run build && npm start, PORT default 3100).
import { chromium } from "@playwright/test";
import assert from "node:assert";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://localhost:${process.env.PORT ?? 3100}`);
  const openOrder = async (id: string) => {
    if (!(await page.locator("#orders").isVisible())) await page.keyboard.press("Control+b");
    await page.locator("#orders").getByRole("button", { name: new RegExp(`^${id}`) }).click();
  };
  assert.equal(await page.locator("#orders").isVisible(), true, "sidebar is open by default on desktop");
  await openOrder("o13");
  const summary = () => page.locator("[aria-live=polite]").innerText();
  const counts = async () => {
    const t = await summary();
    return { approved: Number(/(\d+) auto-approved/.exec(t)![1]), flagged: Number(/(\d+) to check/.exec(t)![1]), done: Number(/(\d+) done/.exec(t)?.[1] ?? 0) };
  };
  const openSettings = async () => {
    if (!(await page.locator("#t").isVisible())) await page.getByRole("button", { name: "Settings" }).click();
  };
  assert.equal(await page.locator("#t").count(), 0, "thresholds are tucked away by default");
  const start = await counts();
  assert.ok(start.flagged >= 1, "the demo order needs at least one flagged line");
  assert.equal(start.done, 0);

  // Enter confirms the current flagged line, and the cursor moves on by itself
  for (let i = 1; i <= start.flagged; i++) {
    await page.keyboard.press("Enter");
    assert.equal((await counts()).done, i);
  }
  assert.ok(await page.getByRole("status").filter({ hasText: "All checked" }).isVisible());
  await page.keyboard.press("x"); // already decided: must not overwrite anything
  await page.keyboard.press("Enter");
  assert.equal((await counts()).done, start.flagged);

  await page.getByRole("button", { name: "Undo" }).first().click();
  assert.equal((await counts()).done, start.flagged - 1);

  // keys still work after touching a slider
  await openSettings();
  await page.locator("#t").focus();
  await page.keyboard.press("Enter");
  assert.equal((await counts()).done, start.flagged);

  // the product-confidence slider re-routes lines in the browser
  await page.locator("#t").fill("0.99");
  const strict = await counts();
  await page.locator("#t").fill("0.5");
  const loose = await counts();
  console.log(`flagged: start ${start.flagged}, T=0.99 ${strict.flagged}, T=0.5 ${loose.flagged}`);
  assert.ok(strict.flagged >= start.flagged && loose.flagged <= start.flagged);

  // the sidebar button in the sidebar hides it; the one in the toolbar brings it back
  await page.getByRole("button", { name: "Hide orders" }).click();
  assert.equal(await page.locator("#orders").isVisible(), false);
  await page.getByRole("button", { name: "Show orders" }).click();
  assert.equal(await page.locator("#orders").isVisible(), true);

  // Claude only mode disables the slider
  await page.getByRole("button", { name: /^Claude only/ }).click(); // the cost card selects the pipeline
  await openSettings();
  assert.equal(await page.locator("#t").isDisabled(), true);
  assert.ok(await page.getByRole("complementary", { name: "Cost assessment" }).isVisible());
  assert.match(await page.getByRole("complementary", { name: "Cost assessment" }).innerText(), /less[\s\S]*faster/);

  // switching orders resets review progress
  await openOrder("o02");
  assert.match(await summary(), /0 done/);
  console.log("e2e smoke ok");
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
