#!/usr/bin/env node
// Network-free simulation benchmark: N virtual players (same behaviour as loadtest.mjs: walk out of
// their sanctuaries at legal speed with 12 Hz moves, cast every ~1.1 s) driving shared/sim directly.
// Measures per-tick wall time and process CPU time, so results are less sensitive to other processes
// than the end-to-end load test.   node bench.mjs [--players 300] [--seconds 60] [--realtime]
import { createSim } from '../shared/sim/index.js';
import { OATHS } from '../shared/oaths.js';
import { TICK_HZ } from '../shared/protocol.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const N = Number(args.players ?? 300);
const SECONDS = Number(args.seconds ?? 60);
const realtime = process.argv.includes('--realtime');
const sim = createSim({ seed: 15015, bots: 0 });
const ps = [];
for (let i = 0; i < N; i++) {
  const w = sim.addPlayer(`c${i}`, { t: 'hello', name: `Bench ${i}`, oath: OATHS[i % 15].id, cls: i % 2 ? 'sorcerer' : 'ninja' });
  ps.push({ id: w.id, x: w.you.x, y: w.you.y, z: w.you.z, ry: Math.random() * 6.28, seq: 0, castT: Math.random() * 1.1 });
}
const dt = 1 / TICK_HZ;
const wall = [], cpu = [];
let bytes = 0, t = 0;
const RAW = Symbol('raw');
const enc = (m) => {
  if (m[RAW]) return m[RAW];
  if (m.t === 'snap') { let s = '{"t":"snap","ents":['; m.ents.forEach((e, i) => { s += (i ? ',' : '') + (e[RAW] ??= JSON.stringify(e)); }); return (m[RAW] = s + ']}'); }
  return (m[RAW] = JSON.stringify(m));
};
const ticks = SECONDS * TICK_HZ;
for (let k = 0; k < ticks; k++) {
  t += dt;
  // client inputs arriving during this tick (12 Hz moves, ~0.9 Hz casts)
  for (const p of ps) {
    if (Math.random() < 12 / TICK_HZ) {
      p.ry += (Math.random() - 0.5) * 0.25;
      p.x += Math.sin(p.ry) * 5.5 / 12; p.z += Math.cos(p.ry) * 5.5 / 12;
      sim.handle(p.id, { t: 'move', x: p.x, y: p.y, z: p.z, ry: p.ry, anim: 'run', seq: ++p.seq });
    }
    if (t - p.castT > 1.1) {
      p.castT = t;
      const slot = Math.random() < 0.6 ? 0 : 1 + Math.floor(Math.random() * 5);
      sim.handle(p.id, { t: 'cast', slot, dir: { x: Math.sin(p.ry), z: Math.cos(p.ry) }, aim: { x: p.x + Math.sin(p.ry) * 10, y: p.y, z: p.z + Math.cos(p.ry) * 10 } });
    }
  }
  const c0 = process.cpuUsage(), w0 = performance.now();
  const out = sim.tick(dt);
  const w1 = performance.now(), c1 = process.cpuUsage(c0);
  for (const o of out) {
    if (!process.argv.includes('--noencode')) bytes += enc(o.msg).length;
    if (o.msg.t === 'ev' && o.msg.e.type === 'teleport') { const p = ps.find((q) => q.id === o.msg.e.id); if (p) { p.x = o.msg.e.x; p.y = o.msg.e.y; p.z = o.msg.e.z; } }
    if (o.msg.t === 'ev' && o.msg.e.type === 'death' && o.to === o.msg.e.id) sim.handle(o.to, { t: 'respawn' });
  }
  if (k > TICK_HZ * 2) { wall.push(w1 - w0); cpu.push((c1.user + c1.system) / 1000); }
  if (realtime) await new Promise((r) => setTimeout(r, Math.max(0, 50 - (performance.now() - w0))));
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3); };
const st = sim.stats();
console.log(JSON.stringify({
  players: N, simSeconds: SECONDS, mobs: st.mobs, mobsAwake: st.mobsAwake,
  tickWallMs: { p50: pct(wall, 0.5), p90: pct(wall, 0.9), p99: pct(wall, 0.99), max: pct(wall, 1) },
  tickCpuMs: { avg: +(cpu.reduce((a, b) => a + b, 0) / cpu.length).toFixed(3), p50: pct(cpu, 0.5), p90: pct(cpu, 0.9), p99: pct(cpu, 0.99) },
  bytesPerClientPerSec: Math.round(bytes / N / SECONDS), counters: st.counters,
}, null, 1));
