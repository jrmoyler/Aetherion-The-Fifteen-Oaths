// POISON — Bitterglass Guild. Cast study reference-106: acid green, sickly violet, bubbling pools, gas volumes.
import { B, K, V, C, life, along, polar, serpent, whip, clamp01, easeOut, smooth } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

const GAS = (fx) => [fx.pal.glow.scale(0.45), fx.pal.edge.scale(0.3), fx.pal.deep];

export default {
  // Caustic Bloom — an acid flower: liquid petals unfurl from a bubbling pool and spit caustic gas.
  'linear-extended/acid'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 5.6);
    B.tendrils(fx, { pos: c, r: 0.2, h: 1.6, count: 8, kind: 'liquid', width: 0.5, inward: 5.5, curl: 0.4, t0: t, dur: L - 0.5, growT: 0.5, retract: L - 1.6, c0: C('#dcff9a'), c1: fx.pal.glow, c2: C('#24310c'), c3: C('#0a1104') });
    K.linger(fx, c, { t0: t, dur: L });
    B.emit(fx, 'smoke', { pos: c.add(V(0, 0.8, 0)), t0: t + 0.3, dur: L - 1, rate: 12, shape: 'sphere', r: 1.4, speed: [0.3, 1], colors: GAS(fx), alpha: 0.6, size: 1.8 });
    B.emit(fx, 'drip', { pos: c.add(V(0, 1.4, 0)), t0: t, burst: 60, shape: 'up', r: 0.3, spread: 0.9, speed: [3, 7] });
    K.impact(fx, c, { t, scale: 1.1 });
  },
  // Venom Surge — a pressurised violet-green stream of venom sprays down the line.
  'linear-extended/venom'(fx) {
    K.gather(fx); K.release(fx); const t = fx.T.ant; const L = 0.9;
    B.beam(fx, { from: fx.o, to: fx.tgtH, kind: 'liquid', width: 0.32, t0: t, dur: L, grow: (lt) => clamp01(lt / Math.max(0.1, fx.T.travel)) * 1.02, wobble: 0.12, p: [3, 1, 0, 0], scroll: [12, 0], c0: C('#ded2f8'), c1: C('#7b3fd4'), c3: C('#3c1a6e'), taper: [0.5, 1.4] });
    B.beam(fx, { from: fx.o, to: fx.tgtH, kind: 'energy', width: 0.1, t0: t, dur: L, grow: (lt) => clamp01(lt / Math.max(0.1, fx.T.travel)) * 1.02, c0: C('#ffffff'), c1: C('#9dff3a') });
    B.emit(fx, 'drip', { follow: () => Vector3.Lerp(fx.o, fx.tgtH, Math.random()), t0: t, dur: L, rate: 60, r: 0.1, speed: [0.3, 1], c0: C('#c9a3ff'), c1: C('#7b3fd4'), c2: C('#3c1a6e') });
    B.emit(fx, 'splash', { pos: fx.tgtH, t0: fx.T.hit, dur: L - fx.T.travel, rate: 80, shape: 'dir', dir: fx.dir.scale(-1).add(V(0, 1, 0)), spread: 0.8, speed: [2, 5], c0: C('#ded2f8'), c1: C('#9dff3a'), c2: C('#3c1a6e') });
    K.impact(fx, fx.tgt, { scale: 0.9 });
  },
  // Toxic Shield — a churning dome of toxic smog with an amber hazard rim shrouds the area.
  'handcast/toxic'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 5.5);
    B.dome(fx, { pos: c, r: fx.R, kind: 'smoke', t0: t, dur: L, opacity: 0.75, rise: 0.5, c0: C('#ff7a1a'), c1: C('#73ffb8'), c2: C('#4f5350'), c3: C('#0a1a0e'), p: [3, 2, 0, 1.6], scroll: [0.1, 0.2] });
    B.dome(fx, { pos: c, r: fx.R * 1.02, kind: 'hex', t0: t + 0.2, dur: L - 0.2, opacity: 0.14, c0: C('#dcffb0'), c1: C('#73ffb8'), c2: C('#1e211f') });
    B.emit(fx, 'smoke', { pos: c.add(V(0, 0.5, 0)), t0: t, dur: L, rate: 14, shape: 'disc', r: fx.R * 0.9, colors: GAS(fx), alpha: 0.6, size: 1.6 });
    B.emit(fx, 'bubble', { pos: c.add(V(0, 0.2, 0)), t0: t, dur: L, rate: 20, shape: 'disc', r: fx.R });
    K.linger(fx, c, { t0: t, dur: L });
  },
  // Plague Swarm — a buzzing swarm of plague motes spirals in and engulfs the target in miasma.
  'codex/plague'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 3) + 1;
    for (let i = 0; i < 5; i++) {
      const ph = i * 1.25; const rr = fx.R * (0.4 + (i % 3) * 0.2);
      serpent(fx, (lt) => { const a = ph + lt * (3 + i * 0.5); const r = rr * (1 - Math.min(0.5, lt / L)); return V(c.x + Math.cos(a) * r, fx.gy(c) + 0.8 + Math.sin(lt * 2.5 + ph) * 0.6, c.z + Math.sin(a) * r); }, t + i * 0.08, L,
        { kind: 'dark', width: 0.25, n: 16, c1: fx.pal.glow, c2: C('#2a1838'), c3: C('#0e120a'), parts: 'mote', rate: 30, partOpts: { c0: C('#f0ff9a'), c1: C('#b6ff3d'), c2: C('#2a1838') } });
    }
    B.debris(fx, { pos: c, mode: 'orbit', count: 16, mat: 'obsidian', emissive: 0.5, size: [0.05, 0.1], r: fx.R * 0.7, y: [0.3, 2], orbit: 5, t0: t, dur: L });
    K.linger(fx, c, { t0: t, dur: L });
    K.impact(fx, c, { t, scale: 0.9 });
  },
  // Miasma Spit — a lobbed glob of bile bursts into a lingering cloud of miasma.
  'codex/miasma'(fx) {
    K.gather(fx); K.release(fx);
    K.projectile(fx, { size: 0.3, arc: 1.6, coreKind: 'water', trailKind: 'liquid', parts: 'drip', partRate: 40 });
    const t = fx.T.hit; const c = fx.tgt;
    B.emit(fx, 'smoke', { pos: c.add(V(0, 0.8, 0)), t0: t, burst: 16, r: 0.8, speed: [0.5, 2], colors: GAS(fx), alpha: 0.65, size: 2 });
    B.emit(fx, 'smoke', { pos: c.add(V(0, 0.5, 0)), t0: t + 0.3, dur: life(fx, 2.6), rate: 6, shape: 'disc', r: 1.6, colors: GAS(fx), alpha: 0.55, size: 1.8 });
    K.impact(fx, c, { t, scale: 1 }); K.linger(fx, c, { t0: t, dur: life(fx, 2.6), r: 2 });
  },
};
