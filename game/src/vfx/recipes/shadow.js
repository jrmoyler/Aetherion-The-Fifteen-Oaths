// SHADOW & VOID — The Missing Court. Cast study reference-109: ink-dark smoke, violet rims, rifts, grasping hands.
import { B, K, V, C, life, along, polar, serpent, portal, clamp01, easeOut, smooth } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

const VOID = (fx) => ({ c0: C('#efe4ff'), c1: fx.pal.glow, c2: C('#3b2566'), c3: C('#07040f') });

export default {
  // Void Slash — a huge crescent of void, rimmed in violet light, cleaves down the line.
  'handcast/voidslash'(fx) {
    K.gather(fx); const t = fx.T.ant; const dur = Math.max(0.35, fx.T.travel + 0.1); const from = fx.o.clone(); const to = fx.tgtH.clone();
    B.slash(fx, { pos: from, travel: to, dir: fx.dir, r: 2.4, arc: 2.4, width: 0.9, tilt: -0.35, t0: t, dur: dur + 0.25, kind: 'smoke', reverse: true, sweep: 0.12, fadeOut: 0.25, p: [1, 3, 0, 1], ...VOID(fx) });
    B.slash(fx, { pos: from, travel: to, dir: fx.dir, r: 2.35, arc: 2.3, width: 0.2, tilt: -0.35, t0: t, dur: dur + 0.2, kind: 'energy', reverse: true, sweep: 0.12, c0: C('#efe4ff'), c1: fx.pal.glow });
    const head = V(); fx.at(t, dur, { update(lt) { head.copyFrom(Vector3.Lerp(from, to, easeOut(clamp01(lt / dur)))); } });
    B.emit(fx, 'void', { follow: () => head, t0: t, dur, rate: 30, r: 1.2, colors: [C('#1a0a30'), C('#3b2566'), C('#07040f')] });
    B.emit(fx, 'mote', { follow: () => head, t0: t, dur, rate: 50, r: 1.2, speed: [0.5, 2] });
    K.impact(fx, fx.tgt, { t: t + dur, scale: 1.1 });
    B.decal(fx, { kind: 'scorch', pos: fx.tgt, r: 2, t0: t + dur, dur: life(fx, 3), c3: C('#07040f'), c1: fx.pal.glow, p: [1, 1, 0, 0] });
  },
  // Corrupted Shard — tainted crystal shards rain into the zone and erupt from a void-stained ground.
  'handcast/shard'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = Math.min(5, life(fx, 7));
    for (let i = 0; i < 6; i++) {
      const to = polar(fx, c, fx.rnd() * 6.28, fx.rnd() * fx.R * 0.8); const ti = fx.T.ant + i * 0.06;
      const from = to.add(V(fx.rnd() - 0.5, 8, fx.rnd() - 0.5)); const cur = from.clone();
      B.solid(fx, { shape: 'ico', mat: 'obsidian', emissive: 0.6, tint: fx.pal.glow, size: V(0.25, 1.1, 0.25), t0: ti, dur: t - ti + 0.05, path: (lt, u) => cur.copyFrom(Vector3.Lerp(from, to, u * u)) });
      B.trail(fx, { follow: () => cur, t0: ti, dur: t - ti + 0.2, width: 0.3, kind: 'energy', c1: fx.pal.glow });
    }
    B.spikes(fx, { layout: 'cluster', pos: c, r: fx.R, count: 16, shape: 'shard', mat: 'obsidian', emissive: 0.45, tint: fx.pal.glow, h: [1, 2.6], w: [0.25, 0.5], lean: 0.6, t0: t, dur: L, rise: 0.12, sinkAt: 0.8, shatter: true });
    B.decal(fx, { kind: 'scorch', pos: c, r: fx.R * 1.15, t0: t, dur: L + 0.5, c3: C('#07040f'), c1: fx.pal.glow, p: [1, 1.2, 0, 0] });
    B.emit(fx, 'void', { pos: c.add(V(0, 0.3, 0)), t0: t, dur: L * 0.8, rate: 8, shape: 'disc', r: fx.R, colors: [C('#2a1040'), C('#4d1a80'), C('#07040f')] });
    B.emit(fx, 'shard', { pos: c.add(V(0, 0.8, 0)), t0: t, burst: 50, r: 0.6, speed: [3, 8] });
    K.impact(fx, c, { t, scale: 1.2 });
  },
  // Umbra Grasp — a pool of shadow opens and clawed hands of darkness rise to seize the target.
  'matrix-new/umbra'(fx) {
    K.gather(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 2.4) + 0.8;
    B.decal(fx, { kind: 'scorch', pos: c, r: fx.R * 1.3, t0: fx.T.ant * 0.5, dur: L + t, grow: [0, 1, 0.4], c3: C('#030106'), c1: C('#6a30c0'), p: [1, 0.8, 0, 0], opacity: 1 });
    B.tendrils(fx, { pos: c, r: fx.R * 0.85, h: 2.4, count: 6, kind: 'dark', width: 0.42, inward: 0.1, curl: 1.0, t0: t, dur: L, growT: 0.4, retract: L - 0.7, ...VOID(fx), p: [3, 4, 0, 0] });
    B.tendrils(fx, { pos: c, r: fx.R * 0.5, h: 1.6, count: 5, kind: 'dark', width: 0.25, inward: 0.05, curl: 1.6, t0: t + 0.15, dur: L - 0.2, growT: 0.35, retract: L - 0.8, ...VOID(fx) });
    B.emit(fx, 'void', { pos: c.add(V(0, 0.4, 0)), t0: t, dur: L, rate: 12, shape: 'disc', r: fx.R, colors: [C('#140824'), C('#2a1040'), C('#030106')] });
    B.emit(fx, 'mote', { pos: c.add(V(0, 0.3, 0)), t0: t, dur: L, rate: 30, shape: 'disc', r: fx.R, speed: [0.5, 2], g: 1 });
    K.impact(fx, c, { t: t + 0.3, scale: 0.9 });
  },
  // Voidstep Rift — the caster tears a rift, steps through and re-emerges from a second rift at the target.
  'matrix-new/voidstep'(fx) {
    const t = 0.25; const a = fx.g.add(V(0, 1.1, 0)); const b = fx.tgt.add(V(0, 1.1, 0));
    K.gather(fx, { dur: t, circle: false });
    portal(fx, a, 1.1, 0, 0.9, { kind: 'smoke', inner: 'spiral', thick: 0.14 });
    portal(fx, b, 1.1, t, 0.9, { kind: 'smoke', inner: 'spiral', thick: 0.14 });
    B.beam(fx, { from: a, to: b, kind: 'dark', width: 0.6, t0: t, dur: 0.4, grow: (lt) => clamp01(lt / 0.12) * 1.02, tail: (lt) => clamp01((lt - 0.15) / 0.2), ...VOID(fx) });
    B.beam(fx, { from: a, to: b, width: 0.15, t0: t, dur: 0.35, grow: (lt) => clamp01(lt / 0.1) * 1.02, tail: (lt) => clamp01((lt - 0.12) / 0.2), c0: C('#ffffff'), c1: fx.pal.glow });
    B.emit(fx, 'void', { pos: a, t0: t, burst: 10, r: 0.5, colors: [C('#2a1040'), C('#3a1470'), C('#05010c')] });
    B.emit(fx, 'void', { pos: b, t0: t + 0.2, burst: 10, r: 0.5, colors: [C('#2a1040'), C('#3a1470'), C('#05010c')] });
    B.emit(fx, 'mote', { pos: b, t0: t + 0.2, burst: 40, r: 0.4, speed: [2, 6] });
    K.impact(fx, fx.tgt, { t: t + 0.25, scale: 0.8 });
  },
  // Nightfall Scythe — a reaping crescent sweeps a full circle around the caster then flies to the target.
  'codex/nightfall'(fx) {
    K.gather(fx); const t = fx.T.ant; const at = fx.g.add(V(0, 1, 0));
    B.slash(fx, { pos: at, dir: fx.dir, r: 2.6, arc: 5.6, width: 0.7, tilt: 0.1, t0: t, dur: 0.5, kind: 'smoke', sweep: 0.6, p: [1, 4, 0, 1], ...VOID(fx) });
    B.slash(fx, { pos: at, dir: fx.dir, r: 2.55, arc: 5.6, width: 0.18, tilt: 0.1, t0: t, dur: 0.45, kind: 'energy', sweep: 0.6, c0: C('#f4ecff'), c1: C('#b48cff') });
    const t2 = t + 0.35; const dur = Math.max(0.35, fx.T.travel + 0.1); const to = fx.tgtH.clone();
    B.slash(fx, { pos: at, travel: to, dir: fx.dir, r: 1.8, arc: 2.2, width: 0.6, tilt: 1.3, t0: t2, dur: dur + 0.2, kind: 'smoke', reverse: true, sweep: 0.1, ...VOID(fx) });
    B.slash(fx, { pos: at, travel: to, dir: fx.dir, r: 1.75, arc: 2.1, width: 0.15, tilt: 1.3, t0: t2, dur: dur + 0.15, kind: 'energy', reverse: true, sweep: 0.1, c0: C('#f4ecff'), c1: C('#b48cff') });
    B.emit(fx, 'void', { pos: at, t0: t, burst: 14, shape: 'disc', r: 2.2, colors: [C('#2a1460'), C('#06030d'), C('#06030d')] });
    K.impact(fx, fx.tgt, { t: t2 + dur, scale: 1.1 }); B.shake(fx, t2 + dur, 0.3, 0.3);
  },
  // Wraith Host — wailing wraiths boil out of the ground, circle, and dive onto the target.
  'codex/wraiths'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = 2.4;
    for (let i = 0; i < 6; i++) {
      const ph = (i / 6) * 6.28; const rr = fx.R * (0.7 + (i % 2) * 0.25);
      serpent(fx, (lt) => { const u = clamp01(lt / L); const a = ph + lt * 2.6; const r = rr * (1 - smooth((u - 0.65) / 0.35)); const y = fx.gy(c) + 0.3 + Math.sin(Math.min(1, u * 2) * Math.PI * 0.5) * 3 * (1 - smooth((u - 0.7) / 0.3)) + 0.8 * smooth((u - 0.7) / 0.3); return V(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r); }, t + i * 0.07, L,
        { kind: 'dark', width: 0.55, n: 18, taperPow: 0.5, c0: C('#cfdcff'), c1: fx.pal.glow, c2: C('#28305a'), c3: C('#020205'), parts: 'mote', rate: 20, partOpts: { c0: C('#cfdcff'), c1: C('#9fb4ff'), c2: C('#28305a') } });
    }
    B.decal(fx, { kind: 'scorch', pos: c, r: fx.R * 1.1, t0: t, dur: L + 1, c3: C('#020205'), c1: fx.pal.glow, p: [1, 0.6, 0, 0] });
    B.emit(fx, 'void', { pos: c.add(V(0, 0.3, 0)), t0: t, dur: L, rate: 8, shape: 'disc', r: fx.R, colors: [C('#0e1226'), C('#28305a'), C('#020205')] });
    K.impact(fx, c, { t: t + L * 0.9, scale: 1.2 });
  },
};
