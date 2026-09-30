import { chromium } from "playwright";
import { readFileSync } from "fs";

async function generateOGImage() {
  const bgData = readFileSync("public/images/counterpart-og-bg.png").toString("base64");
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; }
    body {
      width: 1730px;
      height: 909px;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      position: relative;
      overflow: hidden;
    }
    .background {
      position: absolute;
      inset: 0;
      background-image: url('data:image/png;base64,${bgData}');
      background-size: cover;
      background-position: center;
    }
    .logo-container {
      position: relative;
      z-index: 10;
      padding-left: 80px;
      display: flex;
      align-items: center;
      gap: 48px;
    }
    .logo {
      width: 200px;
      height: 200px;
      flex-shrink: 0;
      filter: drop-shadow(0 10px 30px rgba(0,0,0,0.15));
    }
    .wordmark {
      color: #1c1c1e;
    }
    .wordmark h1 {
      font-size: 64px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.03em;
      line-height: 1.2;
    }
    .part {
      font-weight: 500;
      color: #5c5c61;
    }
    .wordmark p {
      font-size: 20px;
      margin: 0;
      margin-top: 12px;
      color: #5c5c61;
      font-weight: 400;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="background"></div>
  <div class="logo-container">
    <svg class="logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="#ffca05"/>
      <path d="M6.5 8.5h7M6.5 12h5M6.5 15.5h4" stroke="#1c1c1e" stroke-width="1.8" stroke-linecap="round" opacity="0.45"/>
      <path d="M14 14.8l1.9 1.9 3.6-4.2" stroke="#1c1c1e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
    <div class="wordmark">
      <h1>counter<span class="part">part</span></h1>
      <p>Process orders at the speed of AI</p>
    </div>
  </div>
</body>
</html>
  `;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1730, height: 909 } });
  await page.setContent(html);
  await page.screenshot({ path: "public/images/counterpart-og.png" });
  await browser.close();
  console.log("✓ Generated public/images/counterpart-og.png (1730×909 with logo overlay)");
}

generateOGImage().catch(console.error);
