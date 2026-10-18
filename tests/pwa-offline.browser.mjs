// Run against a production preview: node tests/pwa-offline.browser.mjs http://localhost:4173
// Service workers are deliberately disabled in the development server.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '../game/node_modules/playwright/index.mjs';
const base = process.argv[2] || 'http://localhost:4173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', error => console.error('[page]', error.message));
  page.on('console', message => { if (message.type() === 'error') console.error('[browser]', message.text()); });
  page.on('response', response => { if (response.status() >= 400) console.error('[http]', response.status(), response.url()); });
  await page.goto(`${base}/?offline=1&q=low`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker did not activate')), 45000))]));
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  const cache = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat();
    return urls;
  });
  assert(cache.some(url => url.endsWith('/index.html')), 'offline shell cached');
  for (const icon of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) {
    assert(cache.some(url => url.endsWith(`/icons/${icon}`)), `${icon} precached`);
  }
  for (const atlas of ['ability-atlas.webp', 'equipment-atlas.webp']) {
    assert(cache.some(url => url.endsWith(`/ui/${atlas}`)), `${atlas} precached`);
  }
  assert(cache.some(url => /simWorker.*\.js$/.test(url)), 'offline simulation worker cached');
  assert(cache.some(url => url.endsWith('/assets/characters/manifest.json')), 'character catalog precached before visiting every model');
  await context.setOffline(true);
  const response = await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
  assert.equal(response.fromServiceWorker(), true);
  await page.waitForSelector('.ae-title', { timeout: 60000 });
  const iconResponse = await page.evaluate(async () => {
    const response = await fetch('./icons/icon-192.png');
    return { status: response.status, type: response.headers.get('content-type') };
  });
  assert.equal(iconResponse.status, 200);
  assert(iconResponse.type?.includes('image/png'));
  const catalog = await page.evaluate(async () => {
    const response = await fetch('./assets/characters/manifest.json');
    return { status: response.status, data: await response.json() };
  });
  assert.equal(catalog.status, 200);
  assert(catalog.data && typeof catalog.data === 'object', 'offline character catalog is JSON, not navigation fallback HTML');
  const evidence = { testedAt: new Date().toISOString(), passed: true, offlineReload: true, cachedEntries: cache.length, offlineTitle: true, offlineIcons: true, offlineCharacterCatalog: true, browser: 'Chromium headless', limitations: ['Desktop browser simulation only; physical Android/iOS install not tested', 'This test checks the offline shell and catalog, not every unvisited 3D asset'] };
  if (process.env.PWA_EVIDENCE_PATH) {
    await mkdir(dirname(process.env.PWA_EVIDENCE_PATH), { recursive: true });
    await writeFile(process.env.PWA_EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
  }
  console.log(JSON.stringify(evidence));
  await context.close();
} finally { await browser.close(); }
