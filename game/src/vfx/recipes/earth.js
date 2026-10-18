// EARTH & CRYSTAL — Fault Choir. Cast study reference-103: stone spires, crystal clusters, dust, fractured ground.
import { B, K, V, C, life, along, polar, meteor, clamp01, easeOut, smooth } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

const DUST = [C('#9a8a74'), C('#6a5c4c'), C('#3a3430')];

export default {
  // Earthen Spire — jagged rock spires erupt in a travelling ridge to the target.
  'linear-ext/earth'(fx) {
    K.gather(fx); K.release(fx); const t = fx.T.ant; const L = life(fx, 3.65);
    const from = along(fx, 0.15); const to = fx.tgt.add(fx.dir.scale(0.5));
    B.spikes(fx, { layout: 'line', from, to, count: 26, shape: 'shard', mat: 'rock', h: [0.8, 1.6], h0: 0.4, w: [0.35, 0.7], w0: 0.3, w1: 1.1, travel: Math.max(0.25, fx.T.travel), lean: 0.3, t0: t, dur: L, rise: 0.14, sinkAt: 0.75, facets: 5 });
    B.spikes(fx, { layout: 'cluster', pos: fx.tgt, r: 1.4, count: 5, shape: 'shard', mat: 'rock', h: [2.2, 3.4], w: [0.8, 1.1], lean: 0.2, t0: fx.T.hit, dur: L - 0.3, rise: 0.16, sinkAt: 0.75, facets: 5 });
    B.emit(fx, 'dust', { pos: Vector3.Lerp(from, to, 0.5).add(V(0, 0.3, 0)), t0: t, dur: Math.max(0.3, fx.T.travel), rate: 30, shape: 'box', box: [0.8, 0.1, fx.dist * 0.4], colors: DUST, speed: [1, 3] });
    B.decal(fx, { kind: 'cracks', pos: Vector3.Lerp(from, to, 0.6), r: fx.dist * 0.5, t0: t, dur: L + 1, p: [1, 0.4, 0, 0], grow: [0, 1, fx.T.travel + 0.2], opacity: 0.8 });
    K.impact(fx, fx.tgt, { scale: 1.2 });
  },
  // Monolith Rift — the ground splits along the line; twin rows of monolith slabs heave up either side.
  'linear-extended/quake'(fx) {
    K.gather(fx); K.release(fx); const t = fx.T.ant; const L = life(fx, 5);
    const from = along(fx, 0.12); const to = fx.tgt.add(fx.dir.scale(1));
    for (const s of [-1, 1]) {
      const off = fx.side.scale(s * 0.9);
      B.spikes(fx, { layout: 'wall', from: from.add(off), to: to.add(off), shape: 'slab', mat: 'rock', tint: C('#c9bda6'), count: 9, h: [1.6, 2.6], w: [1.1, 1.5], travel: Math.max(0.3, fx.T.travel), lean: 0.35 * s, jitter: 0.15, t0: t, dur: L, rise: 0.2, sinkAt: 0.8, overshoot: false });
    }
    for (let i = 0; i < 4; i++) B.decal(fx, { kind: 'cracks', pos: along(fx, 0.2 + i * 0.25), r: 1.8, t0: t + i * 0.08, dur: L + 0.5, p: [1, 0.9, 0, 0], c1: C('#ffd27a'), opacity: 0.9 });
    B.emit(fx, 'dust', { pos: Vector3.Lerp(from, to, 0.5).add(V(0, 0.4, 0)), t0: t, dur: 0.8, rate: 40, shape: 'box', box: [1.2, 0.2, fx.dist * 0.45], colors: DUST, speed: [1, 4], size: 1.4 });
    B.debris(fx, { pos: fx.tgt, mode: 'burst', count: 14, mat: 'rock', size: [0.2, 0.5], t0: fx.T.hit, dur: 1.4, power: 1.1 });
    K.impact(fx, fx.tgt, { scale: 1.3 }); B.shake(fx, t, 0.35, 0.6);
  },
  // Amethyst Verdict — a colossal amethyst falls from above and shatters into a violet crystal cluster.
  'casting/amethyst'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit + 0.3;
    B.solid(fx, { shape: 'ico', mat: 'crystal', tint: fx.pal.glow, size: V(0.9, 2.6, 0.9), t0: fx.T.ant, dur: t - fx.T.ant, path: (lt, u) => V(c.x, fx.gy(c) + 1.3 + (1 - u * u) * 10, c.z), spin: V(0, 3, 0) });
    B.trail(fx, { follow: () => V(c.x, fx.gy(c) + 1.3 + 10 * (1 - Math.min(1, Math.max(0, (fx.t - fx.T.ant) / (t - fx.T.ant))) ** 2), c.z), t0: fx.T.ant, dur: t - fx.T.ant + 0.2, width: 0.9, kind: 'energy' });
    B.spikes(fx, { layout: 'cluster', pos: c, r: fx.R, count: 16, shape: 'shard', mat: 'crystal', h: [1.2, 3.2], w: [0.3, 0.7], lean: 0.55, t0: t, dur: 2.6, rise: 0.12, sinkAt: 0.72, shatter: true, facets: 6 });
    B.emit(fx, 'shard', { pos: c.add(V(0, 1, 0)), t0: t, burst: 70, r: 0.6, speed: [3, 9] });
    B.decal(fx, { kind: 'cracks', pos: c, r: fx.R * 1.2, t0: t, dur: 3, p: [1, 1.2, 0, 0], c1: fx.pal.glow, opacity: 0.9 });
    B.ring(fx, { pos: c, r0: 0.3, r1: fx.R * 1.3, h: 0.5, t0: t, dur: 0.45 });
    K.impact(fx, c, { t, scale: 1.5 }); B.shake(fx, t, 0.45, 0.4);
  },
  // Dune Scourge — a scouring sand wave rolls down the line wrapped in a dust storm.
  'collective/dune'(fx) {
    K.gather(fx); K.release(fx); const t = fx.T.ant; const dur = Math.max(1, fx.T.travel + 0.6); const from = along(fx, 0.1); const to = fx.tgt.add(fx.dir.scale(1.5));
    const SAND = { c0: C('#fff0cf'), c1: C('#e8b46a'), c2: C('#9a6a3a'), c3: C('#4b2e18') };
    B.wave(fx, { from, to, width: 3.4, h: 2, t0: t, dur, ...SAND, p: [4, 1.5, 0.6, 2], scroll: [0.4, -1] });
    const head = V(); fx.at(t, dur, { update(lt) { head.copyFrom(Vector3.Lerp(from, to, easeOut(clamp01(lt / dur)))); head.y = fx.gy(head) + 0.8; } });
    B.emit(fx, 'dust', { follow: () => head, t0: t, dur, rate: 40, shape: 'box', box: [1.8, 0.6, 0.5], speed: [1, 4], size: 1.6, colors: [C('#e9c58a'), C('#9a6a3a'), C('#4b2e18')], alpha: 0.85 });
    B.emit(fx, 'streak', { follow: () => head, t0: t, dur, rate: 60, shape: 'dir', dir: fx.dir, spread: 0.3, r: 1, speed: [6, 12], colors: [C('#fff0cf'), C('#e8b46a'), C('#9a6a3a')] });
    B.vortex(fx, { pos: fx.tgt, r0: 0.3, r1: 1.4, h: 3, t0: t + dur * 0.6, dur: 1.4, kind: 'smoke', ...SAND, spin: 4, opacity: 0.7 });
    K.impact(fx, fx.tgt, { t: t + dur * 0.75, scale: 1.1 });
  },
  // Geode Eruption — a stone shell hovers, cracks along glowing seams and bursts revealing violet crystal.
  'matrix-new/geode'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 3.5);
    B.debris(fx, { pos: c, mode: 'orbit', count: 14, mat: 'rock', size: [0.4, 0.8], r: 1.1, y: [0.6, 2.2], orbit: 0.6, t0: t, dur: 1.1, collapse: 0.5 });
    B.surf(fx, { shape: 'sphere', tess: 14, pos: c.add(V(0, 1.3, 0)), kind: 'lava', scale: 0.01, t0: t, dur: 1.1, p: [2, 2, 0, 2], anim: (lt, u, m) => m.scaling.setAll(1.1 * easeOut(lt / 0.5)), c3: C('#2a2228') });
    const burst = t + 1.1;
    B.debris(fx, { pos: c, mode: 'burst', count: 20, mat: 'rock', size: [0.25, 0.6], power: 1.2, t0: burst, dur: 1.6 });
    B.spikes(fx, { layout: 'cluster', pos: c, r: fx.R * 0.8, count: 14, shape: 'shard', mat: 'crystal', h: [1, 2.6], w: [0.25, 0.5], lean: 0.6, t0: burst, dur: L, rise: 0.15, sinkAt: 0.75 });
    B.emit(fx, 'shard', { pos: c.add(V(0, 1.2, 0)), t0: burst, burst: 60, r: 0.5, speed: [3, 8] });
    B.flash(fx, { pos: c.add(V(0, 1.3, 0)), t0: burst, size: 3, light: 6 });
    K.impact(fx, c, { t: burst, scale: 1.3 }); B.decal(fx, { kind: 'cracks', pos: c, r: fx.R, t0: burst, dur: L, p: [1, 1.4, 0, 0], c1: fx.pal.glow });
  },
  // Obsidian Wall — a wall of glassy obsidian slabs rises across the line at the target.
  'matrix-new/obsidianwall'(fx) {
    K.gather(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 2.8) + 1.5; const half = 3.2;
    const a = c.add(fx.side.scale(-half)); const b = c.add(fx.side.scale(half));
    B.decal(fx, { kind: 'telegraph', pos: c, r: half, t0: 0, dur: t + 0.2, grow: [0.05, 1, t], opacity: 0.5 });
    B.spikes(fx, { layout: 'wall', from: a, to: b, shape: 'slab', mat: 'obsidian', emissive: 0.4, count: 9, h: [2.4, 3.4], w: [0.85, 1.1], travel: 0.25, lean: 0.06, jitter: 0.12, t0: t, dur: L, rise: 0.22, sinkAt: 0.85, overshoot: false });
    B.spikes(fx, { layout: 'wall', from: a.subtract(fx.dir.scale(0.6)), to: b.subtract(fx.dir.scale(0.6)), shape: 'shard', mat: 'obsidian', emissive: 0.3, count: 12, h: [0.6, 1.3], w: [0.2, 0.4], travel: 0.3, lean: 0.4, t0: t + 0.1, dur: L - 0.2, rise: 0.15, sinkAt: 0.8 });
    B.emit(fx, 'mote', { pos: c.add(V(0, 1.5, 0)), t0: t, dur: L * 0.8, rate: 30, shape: 'box', box: [half, 1.2, 0.2], dir1: V(-0.2, 1, -0.2), dir2: V(0.2, 1, 0.2) });
    B.emit(fx, 'dust', { pos: c.add(V(0, 0.3, 0)), t0: t, burst: 20, shape: 'box', box: [half, 0.1, 0.4], colors: DUST });
    B.flash(fx, { pos: c.add(V(0, 1.5, 0)), t0: t, size: 2.5, light: 4 }); B.shake(fx, t, 0.3, 0.3);
  },
  // Crystalline Heart — a rose-crystal heart hangs over the target, pulsing shock rings, then detonates.
  'matrix-new/crystallineheart'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt.add(V(0, 2.4, 0)); const t = fx.T.hit; const L = life(fx, 4.2);
    B.solid(fx, { shape: 'ico', mat: 'crystal', tint: fx.pal.glow, size: V(1.1, 1.5, 1.1), t0: t - 0.2, dur: L * 0.75, pos: c, spin: V(0, 1.2, 0), anim: (lt, u, m) => { const k = easeOut(lt / 0.4) * (1 + Math.max(0, Math.sin(lt * 5)) * 0.12); m.scaling.set(1.1 * k, 1.5 * k, 1.1 * k); m.position.y = c.y + Math.sin(lt * 2) * 0.15; } });
    B.debris(fx, { pos: fx.tgt, mode: 'orbit', count: 12, mat: 'crystal', size: [0.15, 0.3], r: 1.8, y: [1.6, 3.2], orbit: 1.5, t0: t, dur: L * 0.75 });
    for (let i = 0; i < 4; i++) B.ring(fx, { pos: fx.tgt, r0: 0.4, r1: fx.R, h: 0.4, t0: t + 0.3 + i * 0.6, dur: 0.6, c1: fx.pal.glow });
    B.light(fx, { pos: c, t0: t, dur: L * 0.75, intensity: 3, range: 9, env: (lt) => 0.6 + Math.max(0, Math.sin(lt * 5)) * 0.4 });
    const boom = t + L * 0.75;
    B.emit(fx, 'shard', { pos: c, t0: boom, burst: 90, r: 0.5, speed: [4, 10] });
    B.flash(fx, { pos: c, t0: boom, size: 4, light: 7 });
    B.spikes(fx, { layout: 'ring', pos: fx.tgt, r: fx.R * 0.7, count: 12, shape: 'shard', mat: 'crystal', h: [0.8, 1.6], w: [0.25, 0.4], lean: 0.7, t0: boom, dur: 1.6, rise: 0.12, sinkAt: 0.6, shatter: true });
    K.impact(fx, fx.tgt, { t: boom, scale: 1.4 }); B.shake(fx, boom, 0.4, 0.35);
  },
  // Basalt Columns — hexagonal basalt columns punch up across the zone with lava welling between them.
  'codex/basalt'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = 3.4;
    B.decal(fx, { kind: 'lava', pos: c, r: fx.R * 1.1, t0: t - 0.1, dur: L + 0.8, p: [2.4, 1.3, 0, 0] });
    B.spikes(fx, { layout: 'disc', pos: c, r: fx.R * 0.9, count: 22, shape: 'column', mat: 'basalt', emissive: 0.12, h: [0.8, 2.6], w: [0.55, 0.8], travel: 0.35, lean: 0.06, jitter: 0.1, t0: t, dur: L, rise: 0.16, sinkAt: 0.82, overshoot: true });
    B.emit(fx, 'ember', { pos: c.add(V(0, 0.2, 0)), t0: t, dur: L * 0.8, rate: 50, shape: 'disc', r: fx.R, speed: [1, 3] });
    B.emit(fx, 'dust', { pos: c.add(V(0, 0.4, 0)), t0: t, burst: 24, shape: 'disc', r: fx.R, colors: DUST, speed: [1, 3] });
    K.impact(fx, c, { t, scale: 1.3 }); B.shake(fx, t, 0.4, 0.4);
  },
};
