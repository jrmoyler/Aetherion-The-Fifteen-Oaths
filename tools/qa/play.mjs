// Scripted play-through: node tools/qa/play.mjs <url> <outPrefix>
import { chromium } from '../../game/node_modules/playwright/index.mjs';
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await p.goto(url);
await p.waitForTimeout(+(process.env.INIT || 40000));
console.log('net', await p.evaluate(() => ({ mode: window.__aetherion.net?.mode, self: window.__aetherion.net?.selfId })));
await p.evaluate(() => { const c = window.__aetherion; c.__ev = {}; c.bus.on('net:ev', (e) => { c.__ev[e.type] = (c.__ev[e.type] || 0) + 1; }); });
const shot = async (n) => p.screenshot({ path: `${out}-${n}.png`, timeout: 240000 });
await shot('a-spawn');
const pos = () => p.evaluate(() => { const a = window.__aetherion.actors?.player; return a ? [a.position.x.toFixed(1), a.position.y.toFixed(1), a.position.z.toFixed(1), a.anim ?? a.state] : null; });
console.log('spawn', JSON.stringify((await pos())?.slice(0,3)));
await p.click('canvas', { position: { x: 480, y: 270 } }).catch(() => {});
await p.keyboard.down('KeyW'); await p.keyboard.down('ShiftLeft'); await p.waitForTimeout(12000); await p.keyboard.up('ShiftLeft'); await p.keyboard.up('KeyW');
console.log('after run', JSON.stringify((await pos())?.slice(0,3)));
await shot('b-run');
// teleport near a mob camp to test combat (debug: ask server via chat /stuck not ideal) – use nearest hostile
const mob = await p.evaluate(() => { const c = window.__aetherion; let best = null; c.actors.entities.forEach((a) => { if (a.kind === 'mob' && a.alive) { const d = a.position.subtract(c.actors.player.position).length(); if (!best || d < best.d) best = { d, id: a.id, name: a.name }; } }); return best; });
console.log('nearest mob', mob);
for (const k of ['Tab', 'Digit1', 'Digit2', 'Digit3', 'Digit1', 'Digit4', 'Digit5', 'KeyR']) { await p.keyboard.press(k); await p.waitForTimeout(1500); }
await shot('c-cast');
await p.waitForTimeout(5000);
console.log('events', await p.evaluate(() => window.__aetherion.__ev));
console.log('target', await p.evaluate(() => window.__aetherion.combat?.target));
console.log('errors', errs.slice(0, 15));
await b.close();
