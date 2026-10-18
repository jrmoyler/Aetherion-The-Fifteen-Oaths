// TIME & MOTION — Escapement Road. Cast study reference-112: brass clockwork dials, afterimages, amber-teal light.
import { B, K, V, C, life, along, polar, clamp01, easeOut, smooth } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

/** Ghost afterimage of a body (capsule silhouette) at p. */
function ghost(fx, p, t0, dur, color) {
  B.surf(fx, { shape: 'sphere', tess: 12, pos: p.add(V(0, 0.95, 0)), kind: 'energy', scale: V(0.32, 0.92, 0.32), t0, dur, fadeIn: 0.02, fadeOut: dur * 0.8, c0: C('#ffffff'), c1: color ?? fx.pal.glow, c2: fx.pal.edge, p: [3, 6, 0, 1.2], scroll: [0, 3] });
}

export default {
  // Blink Step — the caster shatters into afterimages and snaps to the target point in a streak of light.
  'collective/blink'(fx) {
    const t = 0.2; const a = fx.g; const b = fx.tgt.subtract(fx.dir.scale(1.2));
    K.gather(fx, { dur: t, circle: false });
    B.decal(fx, { kind: 'clock', pos: a, r: 1.4, t0: 0, dur: 0.8, scroll: [1, 8] });
    for (let i = 0; i < 4; i++) ghost(fx, Vector3.Lerp(a, b, i / 4), t + i * 0.03, 0.6);
    B.beam(fx, { from: a.add(V(0, 1, 0)), to: b.add(V(0, 1, 0)), width: 0.5, t0: t, dur: 0.35, grow: (lt) => clamp01(lt / 0.06) * 1.02, tail: (lt) => clamp01((lt - 0.08) / 0.2), c0: C('#ffffff'), c1: fx.pal.glow });
    B.emit(fx, 'streak', { pos: a.add(V(0, 1, 0)), t0: t, burst: 30, shape: 'dir', dir: fx.dir, spread: 0.2, speed: [10, 18] });
    B.decal(fx, { kind: 'clock', pos: b, r: 1.4, t0: t + 0.05, dur: 0.8, scroll: [-1, -8] });
    B.ring(fx, { pos: b, r0: 0.3, r1: 2.2, h: 0.4, t0: t + 0.06, dur: 0.35 });
    B.flash(fx, { pos: b.add(V(0, 1, 0)), t0: t + 0.06, size: 2, light: 3 });
  },
  // Chrono Fracture — time cracks over the zone: a golden dial, suspended glass shards, then a shattering ripple.
  'collective/chrono'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 2.2) + 1;
    B.decal(fx, { kind: 'clock', pos: c, r: fx.R * 1.1, t0: t - 0.1, dur: L + 0.4, scroll: [0.3, 3] });
    B.debris(fx, { pos: c, mode: 'hover', shape: 'shardFlat', count: 18, mat: 'glass', tint: fx.pal.glow, emissive: 0.5, size: [0.3, 0.6], r: fx.R * 0.85, y: [0.5, 2.6], t0: t, dur: L * 0.8 });
    B.dome(fx, { pos: c, r: fx.R, kind: 'energy', t0: t, dur: L * 0.8, opacity: 0.3, c1: fx.pal.glow, c2: C('#6a4310') });
    const snap = t + L * 0.8;
    B.emit(fx, 'shard', { pos: c.add(V(0, 1.4, 0)), t0: snap, burst: 70, r: fx.R * 0.6, speed: [3, 8], c0: C('#ffffff'), c1: C('#fff4d6'), c2: fx.pal.glow });
    B.ring(fx, { pos: c, r0: 0.3, r1: fx.R * 1.4, h: 1, t0: snap, dur: 0.5 });
    B.flash(fx, { pos: c.add(V(0, 1.2, 0)), t0: snap, size: 3, light: 5 });
    K.impact(fx, c, { t: snap, scale: 1.2 });
  },
  // Chrono Recall — a ribbon of rewound time winds back from the target into the caster's hand.
  'atlas/recall'(fx) {
    K.gather(fx); const t = fx.T.ant; const dur = 0.7;
    B.decal(fx, { kind: 'clock', pos: fx.tgt, r: 1.6, t0: t - 0.1, dur: dur + 0.6, scroll: [-1.5, -10] });
    for (let k = 0; k < 2; k++) B.strip(fx, { kind: 'energy', maxPts: 33, width: 0.3, p: [6, 1, 0, 0], scroll: [-8, 0], t0: t, dur, fadeOut: 0.3, c0: C('#fff8e6'), c1: k ? C('#ffcf76') : C('#7fd8ff'), c2: C('#ff9a3c'),
      grow: (lt) => clamp01(lt / 0.35) * 1.02,
      lines: (lt) => { const pts = []; for (let i = 0; i <= 32; i++) { const u = i / 32; const p = Vector3.Lerp(fx.tgtH, fx.o, u); const w = Math.sin(u * Math.PI) * 0.6; const a = u * 14 + k * Math.PI - lt * 10; p.addInPlace(fx.side.scale(Math.cos(a) * w)); p.y += Math.sin(a) * w; pts.push(p); } return [{ pts, w: 1 }]; } });
    ghost(fx, fx.tgt, t, 0.6, C('#ffcf76'));
    B.emit(fx, 'mote', { pos: fx.tgtH, t0: t, burst: 40, shape: 'shell', r: 1.2, speed: [-3, -2] });
    B.decal(fx, { kind: 'clock', pos: fx.g, r: 1.2, t0: t + 0.35, dur: 0.7, scroll: [1.5, 10] });
    K.impact(fx, fx.tgt, { t: t + 0.1, scale: 0.8 });
  },
  // Parallax Blink — staggered afterimages fan out across the line as the caster phases through parallel moments.
  'atlas/parallax'(fx) {
    const t = 0.2; K.gather(fx, { dur: t, circle: false }); const n = 6;
    for (let i = 0; i < n; i++) { const u = i / (n - 1); const off = fx.side.scale(Math.sin(u * Math.PI * 2) * 1.2); ghost(fx, Vector3.Lerp(fx.g, fx.tgt, u).add(off), t + i * 0.04, 0.7, i % 2 ? C('#aab1ff') : C('#5b8cff')); }
    B.beam(fx, { from: fx.g.add(V(0, 1, 0)), to: fx.tgt.add(V(0, 1, 0)), width: 0.3, t0: t, dur: 0.4, grow: (lt) => clamp01(lt / 0.08) * 1.02, tail: (lt) => clamp01((lt - 0.1) / 0.25), c0: C('#f0f4ff'), c1: C('#9fb6ff') });
    B.emit(fx, 'streak', { pos: fx.g.add(V(0, 1, 0)), t0: t, burst: 24, shape: 'dir', dir: fx.dir, spread: 0.35, speed: [8, 14], c0: C('#f0f4ff'), c1: C('#9fb6ff'), c2: C('#2b2f9e') });
    B.decal(fx, { kind: 'clock', pos: fx.tgt, r: 1.3, t0: t + 0.2, dur: 0.6, scroll: [2, 12], c1: C('#9fb6ff') });
    B.flash(fx, { pos: fx.tgt.add(V(0, 1, 0)), t0: t + 0.2, size: 2, light: 3, color: C('#9fb6ff') });
  },
  // Stillpoint — time halts in a violet sphere: motes freeze mid-air, dial hands crawl, sound drains away.
  'atlas/stillpoint'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = 3;
    B.dome(fx, { pos: c, r: fx.R, full: false, kind: 'energy', t0: t, dur: L, rise: 0.4, opacity: 0.55, c0: C('#f2e9ff'), c1: fx.pal.glow, c2: C('#6a4dd8'), p: [3, 3, 0, 2.4], scroll: [0.02, 0.02] });
    B.decal(fx, { kind: 'clock', pos: c, r: fx.R * 1.05, t0: t, dur: L, scroll: [0.05, 0.4], c1: fx.pal.glow });
    B.debris(fx, { pos: c, mode: 'hover', count: 14, mat: 'rock', size: [0.1, 0.25], r: fx.R * 0.8, y: [0.4, 2.4], t0: t, dur: L });
    B.emit(fx, 'mote', { pos: c.add(V(0, 1.2, 0)), t0: t, burst: 80, shape: 'sphere', r: fx.R * 0.8, speed: [0, 0.05], g: 0, life: [L * 0.8, L * 0.9], c0: C('#ffffff'), c1: C('#d6c4ff'), c2: C('#7a5cff') });
    B.ring(fx, { pos: c, r0: fx.R * 1.3, r1: fx.R * 0.95, h: 1.2, t0: t, dur: 0.4, c1: fx.pal.glow });
    B.ring(fx, { pos: c, r0: 0.3, r1: fx.R * 1.2, h: 0.5, t0: t + L - 0.3, dur: 0.4, c1: fx.pal.glow });
    K.impact(fx, c, { t, scale: 0.8 });
  },
  // Hourglass Sunder — a giant hourglass forms over the target, sand pours, and it cracks apart in a burst.
  'codex/hourglass'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 2.4) + 0.6; const mid = c.add(V(0, 2.4, 0));
    for (const s of [1, -1]) B.surf(fx, { shape: 'cylinder', top: s > 0 ? 2 : 0.1, bottom: s > 0 ? 0.1 : 2, tess: 24, pos: mid.add(V(0, s * 0.8, 0)), kind: 'energy', scale: V(0.9, 1.6, 0.9), t0: t - 0.2, dur: L, opacity: 0.8, c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#ffcf70'), p: [6, 2, 0, 1.6], anim: (lt, u, m) => { m.scaling.y = 1.6 * easeOut(lt / 0.4); } });
    for (const s of [1, -1]) B.surf(fx, { shape: 'torus', thick: 0.08, pos: mid.add(V(0, s * 1.6, 0)), kind: 'energy', scale: 0.95, t0: t - 0.2, dur: L, c0: C('#ffffff'), c1: C('#ffd38a') });
    B.emit(fx, 'snow', { pos: mid, t0: t, dur: L - 0.3, rate: 120, shape: 'point', dir: V(0, -1, 0), spread: 0.05, speed: [1, 2], g: -6, c0: C('#ffffff'), c1: C('#ffe9c0'), c2: C('#ffd38a') });
    B.decal(fx, { kind: 'clock', pos: c, r: fx.R, t0: t, dur: L, scroll: [0.4, 4] });
    const snap = t + L;
    B.emit(fx, 'shard', { pos: mid, t0: snap, burst: 80, r: 0.9, speed: [3, 9], c0: C('#ffffff'), c1: C('#ffe9c0'), c2: C('#ffd38a') });
    B.emit(fx, 'mote', { pos: mid, t0: snap, burst: 80, r: 0.5, speed: [4, 9], c0: C('#ffffff'), c1: C('#ffd38a'), c2: C('#7affd9') });
    B.flash(fx, { pos: mid, t0: snap, size: 4, light: 6 });
    K.impact(fx, c, { t: snap, scale: 1.3 }); B.shake(fx, snap, 0.4, 0.35);
  },
};
