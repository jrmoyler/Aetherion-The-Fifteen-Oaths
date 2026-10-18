// Walkway play-test in the real game (offline, headless Chromium + SwiftShader).
//   node tools/qa/walkways.mjs <baseUrl e.g. http://localhost:4173/> <outDir>
// Gets walkway landmarks (S.qaMark) for the Escapement Road viaduct (oath-14) and the Graft
// Sanctuary rope bridges (oath-07) from the generator through Vite SSR, spawns the player at a stair
// foot, then drives the real PlayerController with simulated frames (dt = 1/30) along the route:
// up the stairs, along / across the deck, into the rails. Logs y against the expected deck height
// and saves screenshots. Moves are chunked (<= 1.5 s simulated, then real-time waits) so the
// authoritative offline sim's speed budget never issues a correction.
import { chromium } from '../../game/node_modules/playwright/index.mjs';
import { createServer } from '../../game/node_modules/vite/dist/node/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const [base = 'http://localhost:4173/', outDir = '/tmp/walkways'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../game');

// ---- landmarks from the generator (same code the client runs)
const vite = await createServer({ root, configFile: path.join(root, 'vite.config.js'), logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const A = await vite.ssrLoadModule('/src/architecture/audit.js');
const G = await vite.ssrLoadModule('/src/architecture/gen.js');
const C = await vite.ssrLoadModule('/src/core/collision.js');
const qa = {};
for (const id of ['oath-14', 'oath-07']) { const m = G.computeMetas().find((x) => x.id === id); qa[id] = A.generate(m, new C.CollisionWorld()).qa; }
await vite.close();

// ---- routes
const v = qa['oath-14'].viaductAccess[0]; // stair foot -> mid landing -> flight 2 -> top landing -> deck
// chord centre, outer rail point, inner rail point; walk the inner lane (the clock gears stand on the centre line)
const decks = qa['oath-14'].viaductDeck.map((d) => { const c = [(d[0][0] + d[1][0]) / 2, d[0][1], (d[0][2] + d[1][2]) / 2]; return [...c, d[2], [c[0] + (d[3][0] - c[0]) * 0.6, c[1], c[2] + (d[3][2] - c[2]) * 0.6]]; });
const deckEnd = v[v.length - 1];
// continue along the deck: chord centres in order starting from the access chord, then push into the outer rail
let k0 = 0, bd = 1e9; decks.forEach((d, k) => { const dd = Math.hypot(d[0] - deckEnd[0], d[2] - deckEnd[2]); if (dd < bd) { bd = dd; k0 = k; } });
const along = []; for (let k = k0 + 1; k < decks.length && along.length < 3; k++) { const p = along.length ? along[along.length - 1] : decks[k0]; if (Math.hypot(decks[k][0] - p[0], decks[k][2] - p[2]) > 8.5) break; along.push(decks[k]); }
// finally push from the inner lane into the inner parapet (no gear between them; only the access chord has an opening)
const last = along.length ? along[along.length - 1] : decks[k0]; const inDir = [(last[4][0] - last[0]) / 0.6, (last[4][2] - last[2]) / 0.6];
const railPush = [last[0] + inDir[0] * 3, last[1], last[2] + inDir[1] * 3];
const viaRoute = [...v.slice(1), ...along.map((d) => d[4]), railPush];

const st7 = qa['oath-07'].treeStair[0]; const br = qa['oath-07'].ropeBridge.find((b) => Math.hypot(b[b.length - 1][0] - st7[1][0], b[b.length - 1][2] - st7[1][2]) < 20) ?? qa['oath-07'].ropeBridge[0];
const tree = br[br.length - 1], cp = br.slice(1, -1).reverse(); // tree side first
const R0 = Math.hypot(cp[0][0] - tree[0], cp[0][2] - tree[2]) - 0.2; // ring radius at the bridge foot
const angOf = (p) => Math.atan2(p[0] - tree[0], p[2] - tree[2]);
const a0 = angOf(st7[1]), a1 = angOf(cp[0]); let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
const ring = []; for (let i = 1; i <= 6; i++) { const a = a0 + da * (i / 6); const r = R0 - 1.4; ring.push([tree[0] + Math.sin(a) * r, tree[1], tree[2] + Math.cos(a) * r]); }
const hall = br[0]; const ux = (hall[0] - cp[cp.length - 1][0]), uz = (hall[2] - cp[cp.length - 1][2]); const ul = Math.hypot(ux, uz);
const bridgeRoute = [st7[1], ...ring, ...cp, [cp[cp.length - 1][0] + ux / ul * 1.6, hall[1], cp[cp.length - 1][2] + uz / ul * 1.6]];
// expected deck height for a point on the bridge = linear interpolation of the collider polyline
const deckY = (x, z) => { let best = null; for (let i = 0; i < cp.length - 1; i++) { const p = cp[i], q = cp[i + 1]; const vx = q[0] - p[0], vz = q[2] - p[2]; const t = Math.max(0, Math.min(1, ((x - p[0]) * vx + (z - p[2]) * vz) / (vx * vx + vz * vz))); const d = Math.hypot(x - p[0] - vx * t, z - p[2] - vz * t); if (!best || d < best.d) best = { d, y: p[1] + (q[1] - p[1]) * t, t, i }; } return best; };

// ---- browser
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = {};
async function scenario(name, oath, start, route, opts = {}) {
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  const url = `${base}?offline=1&spawn=${start[0].toFixed(2)},${start[2].toFixed(2)}&oath=${oath}&cls=ninja&name=T&q=low`;
  await p.goto(url);
  await p.waitForFunction(() => window.__aetherion?.actors?.player?.controller && window.__aetherion?.net?.mode, null, { timeout: 240000, polling: 1000 });
  await p.waitForTimeout(+(process.env.SETTLE || 8000));
  const pos = () => p.evaluate(() => { const q = window.__aetherion.actors.player.position; return [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)]; });
  const log = [['spawn', ...(await pos())]];
  let wi = 0, guard = 0;
  while (wi < route.length && guard++ < 80) {
    const r = await p.evaluate(({ route, wi, simT }) => {
      const c = window.__aetherion; const pc = c.actors.player.controller; const st = c.input.state;
      const saveYaw = pc.getCameraYaw; let yaw = 0; pc.getCameraYaw = () => yaw; const out = [];
      const P = c.actors.player.position;
      for (let k = 0; k < simT * 30 && wi < route.length; k++) {
        const [tx, , tz] = route[wi]; const dx = tx - P.x, dz = tz - P.z;
        if (Math.hypot(dx, dz) < 0.6) { wi++; k--; continue; }
        yaw = Math.atan2(dx, dz); st.moveY = 1; st.moveX = 0; pc.update(1 / 30);
        if (k % 3 === 0) out.push([+P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2), wi]);
      }
      st.moveY = 0; pc.getCameraYaw = saveYaw;
      return { wi, out };
    }, { route, wi, simT: 1.5 });
    // a rail push never "arrives": stop after one chunk at the last waypoint
    if (r.wi === wi && wi === route.length - 1 && opts.lastIsPush) { log.push(...r.out); wi = route.length; break; }
    wi = r.wi; log.push(...r.out);
    await p.waitForTimeout(2200);
    log.push(['idle', ...(await pos())]);
  }
  await p.waitForTimeout(4000);
  const final = await pos();
  log.push(['final', ...final]);
  await p.evaluate(() => { const c = window.__aetherion; const cam = c.actors.camera; if (cam && 'radius' in cam) cam.radius = Math.max(9, cam.radius); });
  await p.screenshot({ path: path.join(outDir, `${name}.png`), timeout: 240000 });
  report[name] = { url, reached: wi >= route.length, final, errors: errs.slice(0, 8), log };
  await p.close();
  return report[name];
}

// Escapement viaduct: up the switchback, along the deck, into the outer rail
const r14 = await scenario('oath14-viaduct', 'oath-14', v[0], viaRoute, { lastIsPush: true });
const deckTop = v[v.length - 1][1];
const onDeck = r14.log.filter((l) => typeof l[0] === 'number' && l[3] >= v.length - 2);
r14.check = { deckTop, finalErr: +(r14.final[1] - deckTop).toFixed(3), deckSamples: onDeck.length, deckMinY: Math.min(...onDeck.map((l) => l[1])), deckMaxY: Math.max(...onDeck.map((l) => l[1])), railPushRadialOffset: (() => { const rx = inDir[0], rz = inDir[1]; const l = Math.hypot(rx, rz); return +(((r14.final[0] - last[0]) * rx + (r14.final[2] - last[2]) * rz) / l).toFixed(2); })(), railAt: 2.6 };
console.log('oath-14', JSON.stringify(r14.check), 'reached', r14.reached, 'errors', r14.errors.length);

// Graft Sanctuary: tree stair, around the platform ring, across the rope bridge to the hall-tree ring
const r7 = await scenario('oath07-ropebridge', 'oath-07', st7[0], bridgeRoute);
const onBridge = r7.log.filter((l) => typeof l[0] === 'number').map((l) => { const d = deckY(l[0], l[2]); return d && d.d < 1.0 && d.t > 0 && d.t < 1 ? { y: l[1], exp: d.y, err: l[1] - d.y } : null; }).filter(Boolean);
r7.check = { samplesOnBridge: onBridge.length, maxAbsErr: +Math.max(...onBridge.map((s) => Math.abs(s.err))).toFixed(3), minY: Math.min(...onBridge.map((s) => s.y)), finalY: r7.final[1], hallRingY: hall[1] };
console.log('oath-07', JSON.stringify(r7.check), 'reached', r7.reached, 'errors', r7.errors.length);
writeFileSync(path.join(outDir, 'walkways.json'), JSON.stringify(report, null, 1));
await b.close();
