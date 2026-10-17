// Headless screenshot helper for agents: node tools/qa/shot.mjs <url> <out.png> [waitMs] [w] [h]
// Uses the preinstalled Chromium with SwiftShader WebGL. Prints console errors.
import { chromium } from '../../game/node_modules/playwright/index.mjs';
const [url, out = 'shot.png', wait = '8000', w = '1280', h = '720'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(`[${m.type()}]`, m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
const info = await page.evaluate(() => { const c = window.__aetherion; return c ? { fps: c.engine.getFps().toFixed(1), meshes: c.scene.meshes.length, active: c.scene.getActiveMeshes().length, draw: c.engine._drawCalls?.current } : null; });
console.log('info', JSON.stringify(info));
await browser.close();
