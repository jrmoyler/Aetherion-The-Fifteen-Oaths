// Loads the roster viewer in headless Chromium (SwiftShader) and reports which GLB animation groups play.
// usage: node tools/blender/characters/babylon_check.mjs "<viewer url>" out.png [waitMs]
import { chromium } from '../../../game/node_modules/playwright/index.mjs';
const [url, out = 'viewer.png', wait = '20000'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 600)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
await page.waitForFunction(() => window.__charReport && window.__charReport.length > 0, null, { timeout: 400000 }).catch((e) => console.log('no report', e.message));
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log('report', JSON.stringify(await page.evaluate(() => window.__charReport || null)));
await browser.close();
