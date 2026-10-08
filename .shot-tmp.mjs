import { chromium } from "playwright";
const out = process.argv[2];
const b = await chromium.launch();
for (const [name, vp, theme] of [["desk", { width: 1280, height: 800 }, "light"], ["phone", { width: 390, height: 844 }, "dark"]]) {
  const p = await b.newPage({ viewport: vp });
  await p.addInitScript((t) => localStorage.setItem("counterpart-theme", t), theme);
  await p.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await p.keyboard.press("Shift");
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/lock-${name}.png` });
  await p.fill("#access-code", "007"); await p.keyboard.press("Enter");
  await p.waitForTimeout(1200);
  const about = p.getByRole("button", { name: /about/i }).first();
  await about.click(); await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/about-${name}.png` });
  await p.close();
}
await b.close();
