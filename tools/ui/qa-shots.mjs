// UI QA: drives the UI harness (game/src/ui/dev.html) and the real client through
// title -> character creation -> HUD -> map / character / settings / dialogue / death,
// capturing desktop and mobile (landscape + portrait, touch) screenshots.
// Usage: node tools/ui/qa-shots.mjs [baseUrl=http://localhost:5105] [outDir] [only]
import { chromium } from '../../game/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:5105';
const out = process.argv[3] || './qa-ui';
const only = process.argv[4] || '';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
async function page(vp, mobile = false) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 300)}`); });
  return p;
}
const shot = async (p, name) => { await p.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
const wait = (p, ms) => p.waitForTimeout(ms);
const run = (name) => !only || only.split(',').includes(name);

if (run('desktop')) {
  const p = await page({ width: 1920, height: 1080 });
  await p.goto(`${base}/src/ui/dev.html?walk=1`);
  await wait(p, 900); await shot(p, 'd01-loading');
  await p.waitForSelector('.ae-title:not([hidden])', { timeout: 20000 });
  await wait(p, 3600); await shot(p, 'd02-title');
  await p.click('.ae-title .ae-btn--primary');
  await p.waitForSelector('.ae-cc:not([hidden])'); await wait(p, 1500); await shot(p, 'd03-create');
  await p.click('[data-oath="oath-04"]'); await p.click('[data-cls="sorcerer"]');
  await p.hover('.ae-bar-preview .ae-slot:nth-child(6)', { timeout: 3000 }).catch(() => {});
  await p.fill('#ae-name', 'I'); await p.click('.ae-cc .ae-btn--primary'); await wait(p, 400); await shot(p, 'd04-create-invalid');
  await p.fill('#ae-name', 'Iruvane'); await p.click('.ae-cc .ae-btn--primary');
  await p.waitForSelector('.ae-hud:not(.is-hidden)', { timeout: 15000 });
  await wait(p, 2200); await shot(p, 'd05-hud-banner');
  await wait(p, 6000); await shot(p, 'd06-hud');
  await p.mouse.click(960, 700); await p.keyboard.press('Escape').catch(() => {});
  await p.keyboard.press('Digit3'); await wait(p, 250); await p.keyboard.press('Digit2'); await wait(p, 200); await shot(p, 'd06b-cast-cooldown');
  await wait(p, 2500); await shot(p, 'd06c-cooldown');
  await p.keyboard.press('KeyM'); await wait(p, 4500); await shot(p, 'd07-map');
  await p.mouse.move(900, 500); await p.mouse.wheel(0, -500); await wait(p, 800); await shot(p, 'd07b-map-zoom');
  await p.keyboard.press('KeyM'); await wait(p, 300);
  await p.keyboard.press('KeyI'); await wait(p, 800);
  await p.hover('.ae-char .ae-eq.has-item', { timeout: 3000 }).catch(() => {}); await wait(p, 200); await shot(p, 'd08-character');
  await p.keyboard.press('KeyI'); await wait(p, 300);
  await p.keyboard.press('Escape'); await wait(p, 600); await shot(p, 'd09-settings');
  await p.keyboard.press('Escape'); await wait(p, 300);
  await p.keyboard.press('Enter'); await p.keyboard.type('Hello Weave'); await shot(p, 'd10-chat-typing'); await p.keyboard.press('Enter');
  await p.hover('.ae-hotbar .ae-slot:nth-child(3)', { timeout: 3000 }).catch(() => {}); await wait(p, 300); await shot(p, 'd11-hotbar-tip');
  await p.close();
}
if (run('panels')) {
  const p = await page({ width: 1920, height: 1080 });
  await p.goto(`${base}/src/ui/dev.html?oath=oath-11&cls=ninja&name=Vesh&fast=1&panel=npc`);
  await wait(p, 4500); await shot(p, 'd12-npc');
  await p.goto(`${base}/src/ui/dev.html?oath=oath-12&cls=sorcerer&name=Cael&fast=1&panel=death`);
  await wait(p, 4000); await shot(p, 'd13-death');
  await p.goto(`${base}/src/ui/dev.html?oath=oath-01&cls=ninja&name=Kor&fast=1&panel=levelup`);
  await wait(p, 2400); await shot(p, 'd14-levelup');
  await p.close();
}
if (run('real')) {
  const p = await page({ width: 1600, height: 900 });
  await p.goto(`${base}/?oath=oath-09&cls=ninja&name=Tester`);
  await wait(p, 9000); await shot(p, 'r01-real-skip');
  await p.goto(`${base}/`);
  await wait(p, 8000); await shot(p, 'r02-real-title');
  await p.close();
}
if (run('mobile')) {
  const p = await page({ width: 844, height: 390 }, true);
  await p.goto(`${base}/src/ui/dev.html`);
  await p.waitForSelector('.ae-title:not([hidden])', { timeout: 20000 }); await wait(p, 3500); await shot(p, 'm01-title-landscape');
  await p.tap('.ae-title .ae-btn--primary'); await wait(p, 1500); await shot(p, 'm02-create-landscape');
  await p.tap('.ae-cc__nav .ae-btn--primary'); await wait(p, 600); await shot(p, 'm03-create-dossier');
  await p.tap('.ae-cc__nav .ae-btn--primary'); await wait(p, 600);
  await p.fill('#ae-name', 'Mira'); await shot(p, 'm04-create-discipline');
  await p.tap('.ae-cc .ae-name-row .ae-btn--primary');
  await p.waitForSelector('.ae-hud:not(.is-hidden)', { timeout: 15000 }); await wait(p, 8000); await shot(p, 'm05-hud-landscape');
  await p.tap('.ae-touch__top .ae-iconbtn:nth-child(1)'); await wait(p, 4000); await shot(p, 'm06-map-landscape');
  await p.close();
  const q = await page({ width: 390, height: 844 }, true);
  await q.goto(`${base}/src/ui/dev.html?oath=oath-06&cls=ninja&name=Reed&fast=1`);
  await wait(q, 7000); await shot(q, 'm07-hud-portrait');
  await q.goto(`${base}/src/ui/dev.html`);
  await q.waitForSelector('.ae-title:not([hidden])', { timeout: 20000 }); await wait(q, 3500); await shot(q, 'm08-title-portrait');
  await q.tap('.ae-title .ae-btn--primary'); await wait(q, 1500); await shot(q, 'm09-create-portrait');
  await q.close();
}
await browser.close();
console.log(errors.length ? `ERRORS (${errors.length}):\n${[...new Set(errors)].slice(0, 30).join('\n')}` : 'no page errors');
