// NATURE — Graft Sanctuary. Cast study reference-105: vines and roots, pollen, spore clouds, living light.
import { B, K, V, C, life, along, polar, volley, portal, clamp01, easeOut, smooth } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

const LEAF = [C('#d9ff86'), C('#6fe04a'), C('#2a5a1a')];
const BARK = { c0: C('#d9ff86'), c1: C('#5c8a2c'), c2: C('#3b5138'), c3: C('#1a140c') };

export default {
  // Verdant Gate — a vine-wrapped ring gate unfurls; spores and petals pour through onto the target.
  'linear-ext/portal'(fx) {
    K.gather(fx); const c = fx.tgt.add(V(0, 2.4, 0)).subtract(fx.dir.scale(1.5)); const t = fx.T.hit; const L = 3.4;
    portal(fx, c, 2, fx.T.ant * 0.6, L, { kind: 'energy', inner: 'spiral', thick: 0.22 });
    B.tendrils(fx, { pos: c, r: 2, h: 0, count: 6, mode: 'reach', from: c.add(V(-2, -2.4, 0)), to: c.add(V(2, -2.4, 0)), kind: 'energy', width: 0.16, curl: 2.4, t0: fx.T.ant * 0.6, dur: L, growT: 0.8, ...BARK });
    B.emit(fx, 'petal', { pos: c, t0: t, dur: L - 0.6, rate: 60, shape: 'dir', dir: fx.tgtH.subtract(c), spread: 0.4, r: 1.2, speed: [3, 6], g: -1 });
    B.emit(fx, 'mote', { pos: c, t0: t, dur: L - 0.6, rate: 50, shape: 'dir', dir: fx.tgtH.subtract(c), spread: 0.35, r: 1.2, speed: [2, 5], c0: C('#f4ffd6'), c1: C('#9bff5a') });
    B.decal(fx, { kind: 'glyph', pos: fx.tgt, r: fx.R * 0.8, t0: t, dur: L, p: [10, 5, 0, 0], scroll: [0.3, 0], opacity: 0.7 });
    K.impact(fx, fx.tgt, { t: t + 0.4, scale: 1 }); K.linger(fx, fx.tgt, { t0: t + 0.4, dur: 2 });
  },
  // Arborist's Growth — a living tree erupts: thick roots, a trunk of twisting vines and a canopy of light.
  "linear-extended/growth"(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = Math.min(6, life(fx, 7.4));
    B.tendrils(fx, { pos: c, r: fx.R * 0.9, h: 0.6, count: 10, kind: 'energy', width: 0.22, inward: 0.05, curl: 0.6, t0: t - 0.1, dur: L, growT: 0.6, ...BARK, p: [3, 6, 0, 0] });
    B.tendrils(fx, { pos: c, r: 0.5, h: 4.5, count: 6, mode: 'wrap', curl: 0.35, kind: 'energy', width: 0.3, t0: t + 0.2, dur: L - 0.2, growT: 1.1, ...BARK, scaleQ: false });
    B.tendrils(fx, { pos: c.add(V(0, 0, 0)), r: 2.4, h: 5.2, count: 8, kind: 'energy', width: 0.12, inward: 1.2, curl: 1.4, t0: t + 0.9, dur: L - 0.9, growT: 0.8, c0: C('#ffffff'), c1: C('#b6ffb0'), c2: C('#3ddc7f') });
    B.emit(fx, 'leaf', { pos: c.add(V(0, 4.6, 0)), t0: t + 1.2, dur: L - 1.5, rate: 24, shape: 'sphere', r: 1.6, speed: [0.5, 1.5], colors: LEAF });
    B.emit(fx, 'mote', { pos: c.add(V(0, 4, 0)), t0: t + 1, dur: L - 1.2, rate: 40, shape: 'sphere', r: 2, speed: [0.3, 1], g: -0.3, c0: C('#fff6c8'), c1: C('#e8ff9a'), c2: C('#3ddc7f') });
    B.decal(fx, { kind: 'pool', pos: c, r: fx.R * 1.2, t0: t, dur: L, opacity: 0.6 });
    K.impact(fx, c, { t, scale: 1 });
  },
  // Wildroot Reliquary — roots spiral up into a cage around the target, a teal relic-light burning within.
  'casting/reliquary'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = 3.8;
    B.tendrils(fx, { pos: c, r: fx.R * 0.8, h: 3.4, count: 8, mode: 'wrap', curl: 0.18, kind: 'energy', width: 0.24, t0: t, dur: L, growT: 0.7, ...BARK, c1: C('#7d6c5b'), scaleQ: false });
    B.tendrils(fx, { pos: c, r: fx.R * 0.8, h: 3.4, count: 8, mode: 'wrap', curl: -0.18, kind: 'energy', width: 0.18, t0: t + 0.1, dur: L - 0.1, growT: 0.7, ...BARK, c1: C('#4f7a2a'), scaleQ: false });
    B.surf(fx, { shape: 'sphere', tess: 14, pos: c.add(V(0, 1.6, 0)), kind: 'energy', scale: 0.01, t0: t + 0.4, dur: L - 0.4, c0: C('#ffffff'), c1: fx.pal.glow, anim: (lt, u, m) => m.scaling.setAll(0.55 * easeOut(lt / 0.4) * (1 + Math.sin(lt * 6) * 0.06)) });
    B.light(fx, { pos: c.add(V(0, 1.6, 0)), t0: t + 0.4, dur: L - 0.4, intensity: 3, range: 7, color: fx.pal.glow });
    B.emit(fx, 'mote', { pos: c.add(V(0, 1.6, 0)), t0: t + 0.4, dur: L - 0.6, rate: 30, r: 0.5, speed: [0.5, 1.5], g: 0.5 });
    B.decal(fx, { kind: 'glyph', pos: c, r: fx.R, t0: t, dur: L, p: [10, 7, 0, 0], scroll: [0.25, 0], opacity: 0.7 });
    K.impact(fx, c, { t, scale: 0.9 });
  },
  // Spore Bloom — fungal bulbs swell from the ground and burst into drifting clouds of spores.
  'collective/spore'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 5);
    for (let i = 0; i < 6; i++) {
      const p = polar(fx, c, fx.rnd() * 6.28, fx.rnd() * fx.R * 0.8); const ti = t + i * 0.12; const pop = ti + 0.6 + fx.rnd() * 0.3;
      B.solid(fx, { shape: 'sphere', mat: 'crystal', tint: fx.pal.glow, size: 0.01, pos: p, t0: ti, dur: pop - ti, anim: (lt, u, m) => { const k = easeOut(u) * 0.8; m.scaling.set(k, k * 1.2, k); m.position.y = fx.gy(p) + k * 0.5; } });
      B.emit(fx, 'smoke', { pos: p.add(V(0, 0.6, 0)), t0: pop, burst: 10, r: 0.4, speed: [0.5, 1.5], colors: [C('#d8ff9a'), C('#6fe04a'), C('#1d3a12')], alpha: 0.55, size: 1.4 });
      B.emit(fx, 'mote', { pos: p.add(V(0, 0.6, 0)), t0: pop, burst: 30, r: 0.3, speed: [1, 3], c0: C('#f4ffd0'), c1: C('#b6ff6a'), c2: C('#6fe04a') });
    }
    B.emit(fx, 'mote', { pos: c.add(V(0, 1, 0)), t0: t + 0.8, dur: L - 1, rate: 40, shape: 'disc', r: fx.R, speed: [0.2, 0.8], g: 0.3, c0: C('#f4ffd0'), c1: C('#b6ff6a'), c2: C('#6fe04a') });
    K.linger(fx, c, { t0: t + 0.6, dur: L - 1 });
  },
  // Pollen Nova — a golden nova of pollen and petals bursts outward from the target.
  'codex/pollen'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit;
    B.ring(fx, { pos: c, r0: 0.3, r1: fx.R * 1.2, h: 1.2, t0: t, dur: 0.7, c0: C('#ffffff'), c1: fx.pal.glow });
    B.ring(fx, { pos: c, r0: 0.3, r1: fx.R * 0.9, h: 0.4, t0: t + 0.1, dur: 0.6, c0: C('#ffffff'), c1: C('#ff9fb8') });
    B.emit(fx, 'mote', { pos: c.add(V(0, 0.8, 0)), t0: t, burst: 120, r: 0.3, speed: [4, 9], g: -1, c0: C('#ffffff'), c1: C('#ffe066'), c2: C('#ffd23f') });
    B.emit(fx, 'petal', { pos: c.add(V(0, 0.8, 0)), t0: t, burst: 50, r: 0.3, speed: [3, 7], colors: [C('#ffe3ec'), C('#ff9fb8'), C('#ffd23f')] });
    B.decal(fx, { kind: 'spiral', pos: c, r: fx.R, t0: t, dur: 1.6, p: [8, 0.5, 0, 0], scroll: [1, 3], opacity: 0.7 });
    B.flash(fx, { pos: c.add(V(0, 1, 0)), t0: t, size: 3.5, light: 6 });
    K.linger(fx, c, { t0: t, dur: 1.5 });
  },
  // Seedstorm Volley — a spray of hard seeds whips out and sprouts thorns where they land.
  'codex/seedstorm'(fx) {
    K.gather(fx); K.release(fx);
    volley(fx, 9, { size: 0.12, spread: 2.2, arc: 0.9, wiggle: 0.3, stagger: 0.05, parts: 'petal',
      onHit: (to, th, i) => { const g = to.clone(); g.y = fx.gy(g); B.spikes(fx, { layout: 'cluster', pos: g, r: 0.5, count: 4, shape: 'thorn', mat: 'wood', h: [0.5, 1.0], w: [0.08, 0.14], lean: 0.6, t0: th, dur: 1.8, rise: 0.12, sinkAt: 0.7 }); B.emit(fx, 'leaf', { pos: g.add(V(0, 0.4, 0)), t0: th, burst: 6, r: 0.2, speed: [1, 3], colors: LEAF }); if (i % 3 === 0) K.impact(fx, g, { t: th, scale: 0.5, shake: i === 0 }); } });
  },
};
