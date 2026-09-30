import { chromium } from "playwright";
import { writeFileSync } from "fs";

async function generateOGImage() {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; }
    body {
      width: 1200px;
      height: 630px;
      background: #f7f6f2;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      display: flex;
      align-items: center;
      gap: 60px;
    }
    .logo {
      width: 200px;
      height: 200px;
      flex-shrink: 0;
    }
    .content h1 {
      font-size: 72px;
      font-weight: bold;
      color: #1c1c1e;
      margin-bottom: 20px;
      letter-spacing: -1px;
    }
    .part {
      font-weight: 500;
      color: #5c5c61;
    }
    .content p {
      font-size: 24px;
      color: #5c5c61;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="container">
    <svg class="logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="#ffca05"/>
      <path d="M6.5 8.5h7M6.5 12h5M6.5 15.5h4" stroke="#1c1c1e" stroke-width="1.8" stroke-linecap="round" opacity="0.45"/>
      <path d="M14 14.8l1.9 1.9 3.6-4.2" stroke="#1c1c1e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
    <div class="content">
      <h1>counter<span class="part">part</span></h1>
      <p>Outside-in sketch of AI ordering</p>
    </div>
  </div>
</body>
</html>
  `;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html);
  await page.screenshot({ path: "public/images/counterpart-og.png" });
  await browser.close();
  console.log("✓ Generated public/images/counterpart-og.png");
}

generateOGImage().catch(console.error);
