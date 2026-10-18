// FROST — Rime Archive. Sheets reference-015..020. Palette: deep #0d3b5e, ice #7cc6ee, frost #eaf7ff, glow #8fe3ff.
import { B, K, V, C, life, fade, along, polar, meteor, clamp01, easeOut, smooth } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

export default {
  // 020 Frost Lance — a wedge of ice spikes rips along the ground toward the target, tallest at the tip, then shatters.
  'linear/ice'(fx) {
    K.gather(fx); K.release(fx);
    const L = life(fx, 3.6); const t0 = fx.T.ant;
    const from = along(fx, 0.12); const to = fx.tgt.add(fx.dir.scale(0.6));
    B.spikes(fx, { layout: 'line', from, to, count: 46, h: [0.9, 1.6], h0: 0.25, w: [0.14, 0.32], w0: 0.25, w1: 1.25, travel: Math.max(0.2, fx.T.travel), lean: 0.55, jitter: 0.5, t0, dur: L, rise: 0.17, sinkAt: 0.7, shatter: true, mat: 'ice' });
    B.spikes(fx, { layout: 'cluster', pos: fx.tgt, r: 1.6, count: 7, h: [2, 3.1], w: [0.35, 0.55], lean: 0.25, t0: fx.T.hit, dur: L - 0.3, rise: 0.15, sinkAt: 0.7, shatter: true, mat: 'ice' });
    B.emit(fx, 'mist', { pos: Vector3.Lerp(from, to, 0.5), t0, dur: 0.8, rate: 10, shape: 'box', box: [0.8, 0.1, fx.dist * 0.4], alpha: 0.5 });
    B.emit(fx, 'snow', { pos: Vector3.Lerp(from, to, 0.5), t0, dur: 0.6, rate: 80, shape: 'box', box: [0.8, 0.2, fx.dist * 0.4], speed: [1, 3] });
    K.impact(fx, fx.tgt, { scale: 0.9 });
    B.emit(fx, 'shard', { pos: fx.tgt.add(V(0, 1, 0)), t0: fx.T.hit + L * 0.7, burst: 40, r: 1, speed: [2, 6] });
    B.decal(fx, { kind: 'frost', pos: Vector3.Lerp(from, to, 0.7), r: fx.dist * 0.45, t0, dur: L, p: [0, 0, 0, 0], opacity: 0.5 });
  },
  // 019 Glacial Crown — towering ice spires burst up in a crown around the target, leaning inward.
  'linear/glacier'(fx) {
    K.gather(fx); B.telegraph(fx); const L = life(fx, 4.2);
    B.decal(fx, { kind: 'frost', pos: fx.tgt, r: fx.R * 1.2, t0: fx.T.hit - 0.15, dur: L + 0.6, p: [10, 0, 0, 0], grow: [0, 1, 0.35] });
    B.spikes(fx, { layout: 'ring', pos: fx.tgt, r: fx.R * 0.78, count: 9, h: [3.2, 5.6], w: [0.7, 1.1], lean: 0.32, inward: true, t0: fx.T.hit, dur: L, rise: 0.22, sweep: 0.25, sinkAt: 0.78, shatter: true, mat: 'ice' });
    B.spikes(fx, { layout: 'ring', pos: fx.tgt, r: fx.R * 1.0, count: 22, h: [0.6, 1.4], w: [0.18, 0.35], lean: 0.5, t0: fx.T.hit + 0.08, dur: L, rise: 0.15, sinkAt: 0.75, mat: 'ice' });
    B.column(fx, { pos: fx.tgt, r: fx.R * 0.5, h: 6, t0: fx.T.hit, dur: 0.6, rise: 0.1, c0: C('#ffffff'), c1: fx.pal.glow, opacity: 0.7 });
    K.impact(fx, fx.tgt, { scale: 1.4 }); K.linger(fx, fx.tgt, { dur: L * 0.8 });
    B.emit(fx, 'shard', { pos: fx.tgt.add(V(0, 2, 0)), t0: fx.T.hit + L * 0.8, burst: 60, r: fx.R * 0.7, speed: [2, 6] });
  },
  // 018 Glacial Shard Storm — a streaming storm of ice shards spirals from the hand down the line.
  'handcast/glacial'(fx) {
    K.gather(fx); K.release(fx);
    const n = 14; const t0 = fx.T.ant; const flight = Math.max(0.25, fx.T.travel);
    for (let i = 0; i < n; i++) {
      const ti = t0 + i * 0.05; const ph = i * 0.9; const end = fx.tgtH.add(fx.side.scale((fx.rnd() - 0.5) * 2.4)).add(V(0, (fx.rnd() - 0.5) * 1.2, 0)); const start = fx.o.clone(); const cur = start.clone();
      const path = (lt) => { const u = clamp01(lt / flight); const p = Vector3.Lerp(start, end, u); const sw = Math.sin(u * Math.PI) * 0.8; p.addInPlace(fx.side.scale(Math.cos(ph + u * 9) * sw)); p.y += Math.sin(ph + u * 9) * sw; cur.copyFrom(p); return cur; };
      B.solid(fx, { shape: 'ico', mat: 'ice', size: V(0.12, 0.12, 0.5), t0: ti, dur: flight, path, anim: (lt, u, m) => { m.lookAt(end); } });
      B.trail(fx, { follow: () => cur, t0: ti, dur: flight + 0.2, width: 0.12, n: 10, kind: 'energy' });
    }
    B.emit(fx, 'snow', { follow: () => Vector3.Lerp(fx.o, fx.tgtH, 0.5), t0, dur: n * 0.05 + flight, rate: 120, shape: 'box', box: [0.8, 0.8, fx.dist * 0.45], dir1: fx.dir.scale(4), dir2: fx.dir.scale(8) });
    for (let k = 0; k < 4; k++) K.impact(fx, fx.tgt.add(fx.side.scale((k - 1.5) * 0.6)), { t: t0 + flight + k * 0.12, scale: 0.55, shake: k === 0 });
  },
  // 017 Glacial Prison — 9-spoke floor plate, transparent ice walls rise and encase, cracks, 30-segment shatter.
  'handcast/frost'(fx) {
    K.gather(fx); const c = fx.tgt; const R = fx.R;
    const floor = fx.T.ant + 0.12; const wall = floor + 0.4; const encase = wall + 0.97; const hold = encase + 0.55 + 1.1; const shatter = hold + 0.45;
    B.decal(fx, { kind: 'frost', pos: c, r: R * 1.35, t0: 0, dur: shatter + 1.7, p: [9, 0, 0, 0], grow: [0.05, 1, floor + 0.4], opacity: 0.95 });
    B.spikes(fx, { layout: 'ring', pos: c, r: R * 0.92, shape: 'slab', count: 12, h: [5.2, 6.9], w: [1.4, 1.9], lean: 0.05, jitter: 0.08, t0: wall, dur: shatter - wall + 0.2, rise: 0.9, overshoot: false, sweep: 0.3, sinkAt: 0.92, shatter: true, mat: 'iceSheet' });
    B.column(fx, { pos: c, r: R * 0.93, h: 6.6, t0: wall + 0.2, dur: shatter - wall, rise: 0.9, kind: 'energy', opacity: 0.35, p: [10, 6, 0, 2.5], scroll: [0, -0.3] });
    B.spikes(fx, { layout: 'ring', pos: c, r: R * 1.05, count: 30, h: [0.5, 0.95], w: [0.14, 0.28], lean: 0.4, t0: floor, dur: shatter - floor + 1.4, rise: 0.25, sinkAt: 0.8, mat: 'ice' });
    B.spikes(fx, { layout: 'cluster', pos: c, r: 0.9, count: 6, h: [1.6, 2.1], w: [0.4, 0.6], lean: 0.1, t0: encase - 0.3, dur: shatter - encase + 0.35, rise: 0.55, overshoot: false, shatter: true, sinkAt: 0.95, mat: 'ice' });
    B.dome(fx, { pos: c, r: R * 0.95, kind: 'energy', t0: wall + 0.4, dur: shatter - wall - 0.3, opacity: 0.35, p: [5, 3, 0, 1.8] });
    B.emit(fx, 'mist', { pos: c.add(V(0, 0.2, 0)), t0: floor, dur: shatter - floor + 1.5, rate: 8, shape: 'disc', r: R, alpha: 0.6 });
    B.emit(fx, 'snow', { pos: c.add(V(0, 3, 0)), t0: wall, dur: shatter - wall, rate: 50, shape: 'disc', r: R });
    B.flash(fx, { pos: c.add(V(0, 1, 0)), t0: encase, size: 3, light: 5 });
    B.debris(fx, { pos: c, mode: 'burst', count: 30, mat: 'ice', size: [0.2, 0.55], power: 0.8, t0: shatter, dur: 1.6, r: R * 0.7 });
    B.emit(fx, 'shard', { pos: c.add(V(0, 2.5, 0)), t0: shatter, burst: 80, r: R * 0.8, speed: [3, 9] });
    B.emit(fx, 'mist', { pos: c.add(V(0, 1, 0)), t0: shatter, burst: 14, r: R * 0.8, speed: [1, 3], alpha: 0.7 });
    B.shake(fx, encase, 0.3, 0.4); B.shake(fx, shatter, 0.45, 0.4);
  },
  // 016 Permafrost Bloom — frost spreads outward as a ring of crystal petals blooms from the centre.
  'codex/permafrost'(fx) {
    K.gather(fx); B.telegraph(fx); const L = life(fx, 2.2) + 1.2; const c = fx.tgt;
    B.decal(fx, { kind: 'frost', pos: c, r: fx.R * 1.15, t0: fx.T.hit - 0.1, dur: L + 0.8, p: [12, 0, 0, 0], grow: [0, 1, 0.6] });
    B.spikes(fx, { layout: 'cluster', pos: c, r: 0.6, count: 5, h: [1.6, 2.4], w: [0.35, 0.5], lean: 0.15, t0: fx.T.hit, dur: L, rise: 0.2, sinkAt: 0.75, mat: 'ice' });
    for (let ring = 0; ring < 3; ring++) {
      B.spikes(fx, { layout: 'ring', pos: c, r: fx.R * (0.35 + ring * 0.3), count: 6 + ring * 4, h: [1.4 - ring * 0.35, 2.1 - ring * 0.45], w: [0.3, 0.5], lean: 0.75 + ring * 0.15, t0: fx.T.hit + 0.1 + ring * 0.14, dur: L - ring * 0.1, rise: 0.22, sinkAt: 0.72, shatter: ring === 2, mat: 'ice', tint: C('#bfefff') });
    }
    B.ring(fx, { pos: c, r0: 0.3, r1: fx.R * 1.1, h: 0.5, t0: fx.T.hit, dur: 0.6, c0: C('#ffffff'), c1: fx.pal.glow });
    K.impact(fx, c, { scale: 1.1 }); K.linger(fx, c, { dur: L * 0.7 });
  },
  // 015 Avalanche Wake — a roaring snow avalanche rolls down the line, leaving a wake of ice.
  'codex/avalanche'(fx) {
    K.gather(fx); K.release(fx);
    const t0 = fx.T.ant; const dur = Math.max(0.9, fx.T.travel + 0.6); const from = along(fx, 0.1); const to = fx.tgt.add(fx.dir.scale(1.5));
    B.wave(fx, { from, to, width: 3.2, h: 2.2, t0, dur, c0: C('#ffffff'), c1: C('#cfe8ff'), c2: C('#8aa6cc'), c3: C('#4f6d9c'), p: [3, 1.5, 1.6, 2], spread: 0.4 });
    const head = V(); const prim = { update(lt) { head.copyFrom(Vector3.Lerp(from, to, easeOut(clamp01(lt / dur)))); head.y = fx.gy(head) + 0.6; } }; fx.at(t0, dur, prim);
    B.emit(fx, 'mist', { follow: () => head, t0, dur, rate: 28, shape: 'box', box: [1.6, 0.4, 0.4], speed: [0.5, 2], size: 1.8, alpha: 0.85, c0: C('#ffffff'), c1: C('#e2f0ff'), c2: C('#8aa6cc') });
    B.emit(fx, 'snow', { follow: () => head, t0, dur, rate: 140, shape: 'box', box: [1.6, 0.6, 0.4], speed: [2, 6], g: -4 });
    B.debris(fx, { pos: () => head, mode: 'hover', count: 10, mat: 'ice', size: [0.25, 0.6], r: 1.4, y: [0, 0.9], t0, dur, orbit: 3 });
    B.spikes(fx, { layout: 'line', from, to, count: 28, h: [0.4, 0.9], w: [0.15, 0.3], w0: 0.8, w1: 1.6, h0: 0.6, travel: dur * 0.9, lean: 0.6, t0, dur: life(fx, 3.4) + 0.8, rise: 0.2, sinkAt: 0.7, mat: 'ice' });
    B.decal(fx, { kind: 'frost', pos: Vector3.Lerp(from, to, 0.55), r: fx.dist * 0.55, t0, dur: dur + 2, p: [0, 0, 0, 0], grow: [0, 1, dur], opacity: 0.5 });
    K.impact(fx, fx.tgt, { t: t0 + dur * 0.8, scale: 1.3 });
  },
};
