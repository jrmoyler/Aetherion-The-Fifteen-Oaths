// Headless walkway regression (Node, no browser): generates the sanctuaries into a CollisionWorld and
// drives the real PlayerController (dt = 1/30) over the S.qaMark landmarks:
//   oath-14  every viaduct access stair (foot -> deck), a deck run, pushes into both parapet rails
//   oath-07  every tree stair, every rope bridge end to end, a sideways push into the rope rail
// Also walks up the oath-14 main terrace stair (ramps used to wall people off).
//   node tools/qa/walkways-sim.mjs        -> prints JSON, exit 1 on any failure
import { createServer } from '../../game/node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../game');
const server = await createServer({ root, configFile: path.join(root, 'vite.config.js'), logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const A = await server.ssrLoadModule('/src/architecture/audit.js');
const G = await server.ssrLoadModule('/src/architecture/gen.js');
const C = await server.ssrLoadModule('/src/core/collision.js');
const K = await server.ssrLoadModule('/src/actors/controller.js');
const T = await server.ssrLoadModule('/@fs' + path.resolve(root, '../shared/terrain.js'));

function setup(id) {
  const m = G.computeMetas().find((x) => x.id === id); const col = new C.CollisionWorld(); const S = A.generate(m, col);
  const pos = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
  const actor = { root: { position: pos, rotation: { y: 0 } }, cls: 'ninja', alive: true, body: null };
  let yaw = 0; const input = { state: { moveX: 0, moveY: 0 }, consume: () => false };
  const pc = new K.PlayerController({ collision: col, input, world: { heightAt: T.heightAt, waterLevel: -1e9 } }, actor, () => yaw);
  return { m, S, pc, pos, input, setYaw: (v) => { yaw = v; } };
}
function walk(E, route, maxT = 90) {
  let t = 0, wi = 0; const ys = []; E.input.state.moveY = 1;
  while (wi < route.length && t < maxT) {
    const [tx, , tz] = route[wi]; const dx = tx - E.pos.x, dz = tz - E.pos.z;
    if (Math.hypot(dx, dz) < 0.6) { wi++; continue; }
    E.setYaw(Math.atan2(dx, dz)); E.pc.update(1 / 30); t += 1 / 30; ys.push(E.pos.y);
  }
  E.input.state.moveY = 0;
  return { reached: wi >= route.length, t: +t.toFixed(1), minY: +Math.min(...ys).toFixed(2), maxY: +Math.max(...ys).toFixed(2) };
}
const res = { fail: [] }; const ok = (c, msg) => { if (!c) res.fail.push(msg); };
{ // oath-14
  const E = setup('oath-14'); const qa = E.S.qa; const deck = E.m.Y + 12.7;
  const [x0, z0] = G.toWorld(E.m, 0, 40), [x1, z1] = G.toWorld(E.m, 0, 58); E.pc.teleport(x0, E.m.Y + 0.5, z0);
  res.terraceStair = walk(E, [[x1, 0, z1]], 20); res.terraceStair.endY = +(E.pos.y - E.m.Y).toFixed(2); ok(res.terraceStair.reached && res.terraceStair.endY > 3, 'terrace stair');
  res.viaductAccess = qa.viaductAccess.map((r) => { E.pc.teleport(r[0][0], r[0][1] + 0.5, r[0][2]); const w = walk(E, r.slice(1)); w.endErr = +(E.pos.y - deck).toFixed(3); ok(w.reached && Math.abs(w.endErr) < 0.05, 'viaduct access ' + r[0]); return w; });
  const c = qa.viaductDeck.map((d) => [(d[0][0] + d[1][0]) / 2, d[0][1], (d[0][2] + d[1][2]) / 2, d[2], d[3]]);
  // inner lane (1.55 m inside the centre line): the clock gears stand on the centre line at run ends
  const lane = c.map((d) => [d[0] + (d[4][0] - d[0]) * 0.6, d[1], d[2] + (d[4][2] - d[2]) * 0.6]);
  const run = [lane[0]]; for (let i = 1; i < c.length && Math.hypot(lane[i][0] - run[run.length - 1][0], lane[i][2] - run[run.length - 1][2]) < 8.5; i++) run.push(lane[i]);
  E.pc.teleport(run[0][0], deck + 0.3, run[0][2]); res.deckRun = walk(E, run.slice(1)); res.deckRun.chords = run.length;
  ok(res.deckRun.reached && res.deckRun.minY > deck - 0.05 && res.deckRun.maxY < deck + 0.05, 'deck run');
  // rail pushes on chords that carry no access stair (those have an intentional rail opening)
  const plain = c.map((d, k) => k).filter((k) => qa.viaductAccess.every((r) => Math.hypot(r[r.length - 1][0] - c[k][0], r[r.length - 1][2] - c[k][2]) > 3));
  res.railPush = [plain[Math.floor(plain.length / 2)], plain[Math.floor(plain.length / 2) + 1]].map((k) => { const d = c[Math.min(k, c.length - 1)]; return [d[3], d[4]].map((rp) => { E.pc.teleport(d[0], deck + 0.3, d[2]); walk(E, [[d[0] + (rp[0] - d[0]) * 3, 0, d[2] + (rp[2] - d[2]) * 3]], 5); const off = Math.hypot(E.pos.x - d[0], E.pos.z - d[2]); ok(off < 2.6 && Math.abs(E.pos.y - deck) < 0.05, 'rail push'); return { off: +off.toFixed(2), y: +(E.pos.y - deck).toFixed(3) }; }); });
}
{ // oath-07
  const E = setup('oath-07'); const qa = E.S.qa;
  res.treeStairs = qa.treeStair.map((s) => { E.pc.teleport(s[0][0], s[0][1] + 1, s[0][2]); const w = walk(E, [s[1]]); w.endY = +E.pos.y.toFixed(2); ok(w.reached && Math.abs(E.pos.y - s[1][1]) < 0.05, 'tree stair'); return w; });
  res.bridges = qa.ropeBridge.map((b) => {
    const cp = b.slice(1, -1); const ux = b[b.length - 1][0] - b[0][0], uz = b[b.length - 1][2] - b[0][2]; const L = Math.hypot(ux, uz);
    E.pc.teleport(cp[0][0] - ux / L * 1.2, cp[0][1] + 0.3, cp[0][2] - uz / L * 1.2);
    const w = walk(E, [...cp.slice(1), [cp[cp.length - 1][0] + ux / L * 1.2, 0, cp[cp.length - 1][2] + uz / L * 1.2]]);
    w.deckMin = Math.min(...cp.map((p) => p[1])); w.endY = +E.pos.y.toFixed(2);
    ok(w.reached && w.minY > w.deckMin - 0.1 && Math.abs(E.pos.y - b[b.length - 1][1]) < 0.1, 'rope bridge');
    const mid = cp[Math.floor(cp.length / 2)]; E.pc.teleport(mid[0], mid[1] + 0.3, mid[2]); walk(E, [[mid[0] + uz / L * 5, 0, mid[2] - ux / L * 5]], 4);
    w.sidePush = { off: +Math.hypot(E.pos.x - mid[0], E.pos.z - mid[2]).toFixed(2), y: +(E.pos.y - mid[1]).toFixed(2) };
    ok(w.sidePush.off < 0.8 && Math.abs(w.sidePush.y) < 0.3, 'rope rail push');
    return w;
  });
}
console.log(JSON.stringify(res, null, 1));
process.exitCode = res.fail.length ? 1 : 0;
await server.close();
