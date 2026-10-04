import { chromium } from "playwright";
import { readFileSync } from "fs";

// Optional: --scale 2 --out path.png for a hi-res copy (e.g. a portfolio image); defaults to the 1× meta image.
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
const scale = Number(arg("--scale") ?? 1);
const out = arg("--out") ?? "public/images/counterpart-og.png";

async function generateOGImage() {
  const bgData = readFileSync("public/images/counterpart-og-bg.png").toString("base64");
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; }
    body {
      width: 1730px;
      height: 909px;
      font-family: 'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      position: relative;
      overflow: hidden;
    }
    /* The photo is shifted down 40px, so the wood sits clear of the tagline. A mirrored copy of the
       photo fills the strip left at the top, so the blueprint lines carry on rather than stopping. */
    .background, .background-mirror {
      position: absolute;
      left: 0;
      width: 100%;
      height: 909px;
      background-size: 100% 100%;
    }
    .background { top: 40px; background-image: url('data:image/png;base64,${bgData}'); }
    .background-mirror { top: -869px; transform: scaleY(-1); background-image: url('data:image/png;base64,${bgData}'); }
    .logo-container {
      position: relative;
      z-index: 10;
      padding-left: 80px;
      display: flex;
      align-items: center;
      gap: 32px;
    }
    .logo {
      width: 200px;
      height: 200px;
      flex-shrink: 0;
      filter: drop-shadow(0 10px 30px rgba(0,0,0,0.15));
    }
    .wordmark {
      color: #1f2328;
      /* vertical position is set after the fonts load: see the centring step below */
    }
    /* the app's wordmark: monospace capitals, C0UNTER in graphite and PART in muted grey */
    .wordmark h1 {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 92px;
      font-weight: 600;
      margin: 0;
      letter-spacing: 0.02em;
      line-height: 1.2;
    }
    .part {
      color: #575e66;
    }
    .wordmark p {
      font-size: 40px;
      margin: 0;
      margin-top: -14px;
      color: #575e66;
      font-weight: 400;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="background-mirror"></div>
  <div class="background"></div>
  <div class="logo-container">
    <svg class="logo" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.5 2H27.5V30L24.625 28.5L21.75 30L18.875 28.5L16 30L13.125 28.5L10.25 30L7.375 28.5L4.5 30Z" fill="#ffca05" stroke="#ffca05" stroke-width="1.5" stroke-linejoin="round"/>
      <g transform="translate(16 16.5) scale(0.82) translate(-16 -16)">
        <path d="M16 7.5h-4a6 6 0 0 0 0 12h4v-12h4a6 6 0 0 1 0 12h-4v5" fill="none" stroke="#1f2328" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>
    <div class="wordmark">
      <h1>C0UNTER<span class="part">PART</span></h1>
      <p>The fast lane for pro orders.</p>
    </div>
  </div>
</body>
</html>
  `;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1730, height: 909 }, deviceScaleFactor: scale });
    await page.setContent(html);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    // Fit the tagline to the wordmark's width: larger type, then letter-spacing takes up the remainder.
    // The page function is kept free of nested named helpers, which tsx would wrap in a helper the browser lacks.
    const fit = await page.evaluate(() => {
      const h1 = document.querySelector(".wordmark h1")!;
      const p = document.querySelector(".wordmark p") as HTMLElement;
      const range = document.createRange();
      range.selectNodeContents(h1);
      const target = range.getBoundingClientRect().width;
      p.style.whiteSpace = "nowrap";
      p.style.fontSize = "43px";
      p.style.letterSpacing = "0px";
      range.selectNodeContents(p);
      const natural = range.getBoundingClientRect().width;
      const chars = (p.textContent ?? "").length;
      const ls = (target - natural) / (chars - 1); // spacing lands between letters, so the last one adds none
      p.style.letterSpacing = `${ls}px`;
      return { target, ls };
    });
    console.log(`tagline letter-spacing ${fit.ls.toFixed(2)}px to match wordmark width ${fit.target.toFixed(0)}px`);
    // Centre the text on the logo's centre line: from the top of the wordmark's capitals to the
    // tagline's baseline (descenders hang below, as they do in any lockup). Baselines come from a
    // zero-size inline-block marker; cap height from canvas text metrics.
    const shift = await page.evaluate(() => {
      const logo = document.querySelector(".logo")!.getBoundingClientRect();
      const h1 = document.querySelector(".wordmark h1") as HTMLElement;
      const p = document.querySelector(".wordmark p") as HTMLElement;
      const baselines = [h1, p].map(el => {
        const marker = document.createElement("span");
        marker.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
        el.append(marker);
        const y = marker.getBoundingClientRect().bottom;
        marker.remove();
        return y;
      });
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.font = getComputedStyle(h1).font;
      const capTop = baselines[0] - ctx.measureText("C0UNTERPART").actualBoundingBoxAscent;
      const dy = logo.top + logo.height / 2 - (capTop + baselines[1]) / 2;
      (document.querySelector(".wordmark") as HTMLElement).style.transform = `translateY(${dy}px)`;
      return dy;
    });
    console.log(`text shifted ${shift.toFixed(1)}px to centre on the logo`);
    await page.screenshot({ path: out });
    console.log(`✓ Generated ${out} (${1730 * scale}×${909 * scale} with logo overlay)`);
  } finally {
    await browser.close();
  }
}

generateOGImage().catch(console.error);
