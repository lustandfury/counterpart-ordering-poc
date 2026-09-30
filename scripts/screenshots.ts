// Screenshots of the review screen for design review. Needs `npm run build && npm start` on PORT (default 3100).
import { chromium } from "@playwright/test";

const base = `http://localhost:${process.env.PORT ?? 3100}`;
async function main() {
  const browser = await chromium.launch();
  const shot = async (name: string, opts: { width: number; height: number; dark?: boolean }, act?: (p: import("@playwright/test").Page) => Promise<void>) => {
    const ctx = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, colorScheme: opts.dark ? "dark" : "light" });
    const page = await ctx.newPage();
    await page.goto(base);
    await page.selectOption("#order", process.env.ORDER ?? "o13");
    if (act) await act(page);
    await page.screenshot({ path: `shots/${name}.png`, fullPage: true });
    await ctx.close();
  };
  await shot("desktop-light", { width: 1280, height: 900 });
  await shot("desktop-dark", { width: 1280, height: 900, dark: true });
  await shot("desktop-compare", { width: 1280, height: 900 }, async (p) => {
    await p.getByRole("button", { name: /Compare Jev/ }).click();
  });
  await shot("mobile", { width: 390, height: 844 });
  await browser.close();
}
main();
