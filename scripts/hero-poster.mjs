// Renders the hero scene's first frame and saves it as two tiny WebP previews (landscape and portrait) in
// src/assets/. The page shows them, blurred, the moment it loads, and the live scene fades in over them.
// Run it after changing the scene's layout, against a running dev or preview server:
//   npm i --no-save playwright-core && node scripts/hero-poster.mjs [url]
// It drives the Chrome installed on this machine (set CHROME to its path if it isn't /usr/bin/google-chrome).
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:4321/';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [name, w, h, small] of [['land', 1440, 860, 72], ['port', 430, 932, 36]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  // the first frame: before the glow spreads, at the scene's starting moment, full resolution
  await page.addInitScript(() => { window.__groveDebug = { t: 6, spread: 0, pr: 1 }; });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('.hero')?.classList.contains('is-lit'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const png = await page.locator('#grove').screenshot();
  const webp = await page.evaluate(async ({ b64, small }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = small; c.height = Math.round((small * img.height) / img.width);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', 0.8).split(',')[1];
  }, { b64: png.toString('base64'), small });
  const out = new URL(`../src/assets/hero-poster-${name}.webp`, import.meta.url);
  writeFileSync(out, Buffer.from(webp, 'base64'));
  console.log(`${out.pathname}: ${Buffer.from(webp, 'base64').length} bytes`);
  await page.close();
}
await browser.close();
