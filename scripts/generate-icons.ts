// Builds the browser and home-screen icons from the Counterpart logo (components/LogoMark.tsx).
// Writes app/icon.svg, app/favicon.ico, app/apple-icon.png and public/icon-192.png, public/icon-512.png.
// Run: npx tsx scripts/generate-icons.ts
import { chromium } from "playwright";
import { writeFileSync } from "fs";

// The mark, with the theme colours written out (--brand yellow, --on-brand graphite): a counter slip with a torn bottom
// edge and the CP monogram, the same paths as LogoMark (at rest, without its spin).
const MARK = `<path d="M4.5 2H27.5V30L24.625 28.5L21.75 30L18.875 28.5L16 30L13.125 28.5L10.25 30L7.375 28.5L4.5 30Z" fill="#ffca05" stroke="#ffca05" stroke-width="1.5" stroke-linejoin="round"/>
  <g transform="translate(16 16.5) scale(0.82) translate(-16 -16)">
    <path d="M16 7.5h-4a6 6 0 0 0 0 12h4v-12h4a6 6 0 0 1 0 12h-4v5" fill="none" stroke="#1f2328" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
const svg = (attrs = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" ${attrs}>\n  ${MARK}\n</svg>\n`;

/** An .ico file holding PNG images (supported by every current browser). */
function ico(images: { size: number; png: Buffer }[]) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size, 0);
    e.writeUInt8(size, 1);
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function main() {
  writeFileSync("app/icon.svg", svg());

  const browser = await chromium.launch();
  try {
    // The mark at `size`px on a transparent background, or centred at `scale` of the canvas on a solid one
    const render = async (size: number, opts: { background?: string; scale?: number } = {}) => {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      const inner = Math.round(size * (opts.scale ?? 1));
      await page.setContent(
        `<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${opts.background ?? "transparent"}">${svg(`width="${inner}" height="${inner}"`)}</body>`,
      );
      const png = await page.screenshot({ omitBackground: !opts.background });
      await page.close();
      return png;
    };

    writeFileSync("app/favicon.ico", ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await render(size) })))));
    // Home-screen icons: iOS fills transparency with black, so give it the app's concrete colour behind the mark
    writeFileSync("app/apple-icon.png", await render(180, { background: "#e8e9e5", scale: 0.8 }));
    writeFileSync("public/icon-192.png", await render(192));
    writeFileSync("public/icon-512.png", await render(512));
  } finally {
    await browser.close();
  }
  console.log("✓ Wrote app/icon.svg, app/favicon.ico, app/apple-icon.png, public/icon-192.png, public/icon-512.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
