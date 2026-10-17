// Draws the Aetherion app icon in code (SVG) and rasterizes PNGs with Playwright's Chromium.
// Output: game/public/icons/{icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png}
// Usage: node tools/ui/make-icons.mjs
import { chromium } from '../../game/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../../game/public/icons/', import.meta.url));
mkdirSync(outDir, { recursive: true });

function iconSVG({ maskable = false } = {}) {
  const s = maskable ? 0.72 : 0.9; // maskable keeps the mark inside the 80% safe zone
  const tf = `translate(256 256) scale(${s}) translate(-256 -256)`;
  const ticks = Array.from({ length: 15 }, (_, i) => {
    const a = (i / 15) * Math.PI * 2 - Math.PI / 2;
    const x = 256 + Math.cos(a) * 196, y = 256 + Math.sin(a) * 196;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="url(#gold)"/>`;
  }).join('');
  const star = Array.from({ length: 15 }, (_, i) => { const a = ((i * 7) / 15) * Math.PI * 2 - Math.PI / 2; return `${(256 + Math.cos(a) * 172).toFixed(1)},${(256 + Math.sin(a) * 172).toFixed(1)}`; }).join(' ');
  const corner = maskable ? 0 : 96;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#26324d"/><stop offset=".6" stop-color="#151c2c"/><stop offset="1" stop-color="#0a0d14"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf0d0"/><stop offset=".48" stop-color="#e2c27e"/><stop offset=".55" stop-color="#a47a38"/><stop offset="1" stop-color="#e8cf92"/></linearGradient>
  </defs>
  <rect width="512" height="512" rx="${corner}" fill="url(#bg)"/>
  <g transform="${tf}">
    <circle cx="256" cy="256" r="222" fill="none" stroke="url(#gold)" stroke-width="5"/>
    <circle cx="256" cy="256" r="208" fill="none" stroke="#e2c27e" stroke-opacity=".35" stroke-width="2"/>
    <polygon points="${star}" fill="none" stroke="#e2c27e" stroke-opacity=".28" stroke-width="2.5"/>
    ${ticks}
    <circle cx="256" cy="256" r="150" fill="#0d121c" fill-opacity=".55" stroke="#e2c27e" stroke-opacity=".5" stroke-width="2"/>
    <path d="M256 128 L332 372 H302 L286 318 H226 L210 372 H180 Z M234 292 H278 L256 214 Z" fill="url(#gold)"/>
    <path d="M150 384 H362" stroke="#d9b874" stroke-width="5"/>
    <path d="M256 372 l9 12 -9 12 -9 -12 Z" fill="url(#gold)"/>
  </g>
</svg>`;
}

const svg = iconSVG();
const svgMask = iconSVG({ maskable: true });
writeFileSync(`${outDir}icon.svg`, svg);
writeFileSync(`${outDir}icon-maskable.svg`, svgMask);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
async function raster(markup, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${markup.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: `${outDir}${file}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', file);
}
await raster(svg, 192, 'icon-192.png');
await raster(svg, 512, 'icon-512.png');
await raster(svgMask, 512, 'icon-maskable-512.png');
await raster(svgMask, 180, 'apple-touch-icon.png');
await browser.close();
