// WIND & SOUND — Reed Resonance. Cast study reference-104: pale air streaks, spiral gusts, resonance rings, leaves.
import { B, K, V, C, life, along, polar, serpent, clamp01, easeOut, smooth } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

const LEAF = [C('#c9d48a'), C('#8a9a4a'), C('#4a5a2a')];

export default {
  // Tempest Spiral — a tight tornado spins up on the target, flinging debris and leaves.
  'collective/tempest'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 3.2) + 0.6;
    B.vortex(fx, { pos: c, r0: 0.35, r1: fx.R * 1.1, h: 6, t0: t, dur: L, kind: 'wind', spin: 6, scroll: [1.5, -0.4], p: [6, 3, 0, 1.5], opacity: 0.5 });
    B.vortex(fx, { pos: c, r0: 0.2, r1: fx.R * 0.7, h: 5, t0: t + 0.1, dur: L - 0.2, kind: 'wind', spin: -8, scroll: [2, -0.6], p: [8, 4, 0, 1.5], opacity: 0.6 });
    B.decal(fx, { kind: 'spiral', pos: c, r: fx.R * 1.3, t0: t, dur: L, p: [5, 1, 0, 0], scroll: [3, 7], opacity: 0.6 });
    B.debris(fx, { pos: c, mode: 'orbit', count: 12, mat: 'rock', size: [0.1, 0.28], r: fx.R * 0.9, y: [0.5, 4.5], orbit: 4, t0: t, dur: L });
    B.emit(fx, 'leaf', { pos: c.add(V(0, 1.5, 0)), t0: t, dur: L, rate: 30, shape: 'shell', r: fx.R * 0.8, speed: [2, 5], g: 1, colors: LEAF });
    B.emit(fx, 'dust', { pos: c.add(V(0, 0.2, 0)), t0: t, dur: L, rate: 12, shape: 'disc', r: fx.R, colors: [C('#8a8070'), C('#6a6052'), C('#3a3430')], speed: [2, 4], alpha: 0.6 });
    K.impact(fx, c, { t, scale: 1 });
  },
  // Resonance Pulse — concentric sound rings ripple down the line, the last one cracking at the target.
  'collective/sonic'(fx) {
    K.gather(fx); K.release(fx); const t = fx.T.ant; const n = 6; const dur = Math.max(0.4, fx.T.travel + 0.15); const yaw = Math.atan2(fx.dir.x, fx.dir.z);
    for (let i = 0; i < n; i++) {
      const ti = t + i * 0.07; const from = fx.o.clone(); const to = fx.tgtH.clone();
      B.surf(fx, { shape: 'torus', thick: 0.05, pos: from, kind: 'energy', scale: 0.2, rot: V(Math.PI / 2, yaw, 0), t0: ti, dur, p: [10, 1, 0, 1], c0: C('#fff4fb'), c1: i % 2 ? fx.pal.glow : C('#c79bff'), c2: C('#6a7cff'),
        anim: (lt, u, m) => { m.position.copyFrom(Vector3.Lerp(from, to, u)); m.scaling.setAll(0.3 + u * 1.4); } });
    }
    B.emit(fx, 'streak', { pos: fx.o, t0: t, dur: 0.3, rate: 80, shape: 'dir', dir: fx.dir, spread: 0.15, speed: [14, 22] });
    B.ring(fx, { pos: fx.tgtH, y: fx.tgtH.y - 0.4, r0: 0.3, r1: 2.6, h: 0.8, t0: t + dur, dur: 0.4, kind: 'wind', c1: fx.pal.glow });
    K.impact(fx, fx.tgt, { t: t + dur, scale: 1 });
  },
  // Gale Sever — a razor crescent of compressed air flies down the line, shearing grass and dust.
  'matrix-new/gale'(fx) {
    K.gather(fx); K.release(fx); const t = fx.T.ant; const dur = Math.max(0.3, fx.T.travel);
    const from = fx.o.clone(); const to = fx.tgtH.clone();
    B.slash(fx, { pos: from, travel: to, dir: fx.dir, r: 1.5, arc: 2.2, width: 0.5, tilt: 0.25, t0: t, dur: dur + 0.15, kind: 'wind', p: [1, 2, 0, 1], reverse: true, sweep: 0.15, fadeOut: 0.15, c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#6dffb8') });
    B.slash(fx, { pos: from, travel: to, dir: fx.dir, r: 1.35, arc: 2.0, width: 0.18, tilt: 0.25, t0: t, dur: dur + 0.15, kind: 'glow', reverse: true, sweep: 0.15, c0: C('#ffffff'), c1: C('#ffffff'), opacity: 0.7 });
    const head = V(); fx.at(t, dur, { update(lt) { head.copyFrom(Vector3.Lerp(from, to, easeOut(clamp01(lt / dur)))); } });
    B.emit(fx, 'streak', { follow: () => head, t0: t, dur, rate: 90, shape: 'sphere', r: 0.8, speed: [1, 3] });
    B.emit(fx, 'leaf', { follow: () => V(head.x, fx.gy(head) + 0.2, head.z), t0: t, dur, rate: 30, r: 0.8, speed: [2, 5], g: 1, colors: LEAF });
    K.impact(fx, fx.tgt, { t: t + dur, scale: 0.9 });
  },
  // Zephyr Shuriken — a four-bladed spinning star of wind arcs out and boomerangs back.
  'codex/zephyr'(fx) {
    K.gather(fx); K.release(fx); const t = fx.T.ant; const out = Math.max(0.35, fx.T.travel); const back = 0.45; const cur = fx.o.clone();
    const path = (lt) => { if (lt < out) cur.copyFrom(Vector3.Lerp(fx.o, fx.tgtH, easeOut(lt / out))); else { const u = clamp01((lt - out) / back); const p = Vector3.Lerp(fx.tgtH, fx.o, u * u); p.addInPlace(fx.side.scale(Math.sin(u * Math.PI) * 1.5)); cur.copyFrom(p); } return cur; };
    fx.at(t, out + back, { update(lt) { path(lt); } });
    for (let k = 0; k < 4; k++) B.slash(fx, { pos: cur, dir: fx.dir, r: 0.75, arc: 1.1, width: 0.32, t0: t, dur: out + back, kind: 'wind', sweep: 0.05, fadeOut: 0.12, p: [1, 2, 0, 1], c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#ff5c8a'),
      anim: (lt, u, m) => { m.position.copyFrom(cur); m.rotation.set(0, lt * 22 + k * Math.PI / 2, 0); } });
    B.trail(fx, { follow: () => cur, t0: t, dur: out + back + 0.2, width: 0.6, kind: 'energy', c1: fx.pal.glow, c2: C('#7affc4') });
    B.emit(fx, 'petal', { follow: () => cur, t0: t, dur: out + back, rate: 30, r: 0.4, colors: [C('#ffffff'), C('#ff9fb8'), C('#ff5c8a')] });
    K.impact(fx, fx.tgt, { t: t + out, scale: 0.8 });
  },
  // Downburst — a column of air slams down from the sky and blasts outward in a flattening ring.
  'codex/downburst'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit;
    B.surf(fx, { shape: 'cylinder', top: 0.6, bottom: 2, pos: c.add(V(0, 5, 0)), kind: 'wind', scale: V(fx.R * 0.7, 10, fx.R * 0.7), t0: t - 0.25, dur: 0.6, p: [4, 3, 0, 1.4], scroll: [0.5, 4], spin: 4,
      anim: (lt, u, m) => { m.position.y = fx.gy(c) + 5 + (1 - easeOut(u)) * 6; } });
    B.ring(fx, { pos: c, r0: 0.6, r1: fx.R * 1.6, h: 1.2, t0: t + 0.25, dur: 0.6, kind: 'wind', p: [8, 1, 0, 1] });
    B.ring(fx, { pos: c, r0: 0.4, r1: fx.R * 1.2, h: 0.4, t0: t + 0.25, dur: 0.45, c1: fx.pal.glow });
    B.emit(fx, 'dust', { pos: c.add(V(0, 0.2, 0)), t0: t + 0.25, burst: 30, shape: 'disc', r: fx.R * 0.5, speed: [4, 9], spread: 0.05, colors: [C('#8a8a8a'), C('#5a5a5a'), C('#2a2a2a')], g: 0 });
    B.emit(fx, 'streak', { pos: c.add(V(0, 0.4, 0)), t0: t + 0.25, burst: 60, shape: 'disc', r: 0.5, speed: [8, 16], spread: 0.02 });
    B.decal(fx, { kind: 'spiral', pos: c, r: fx.R * 1.3, t0: t + 0.25, dur: 1.4, p: [6, 0.4, 0, 0], scroll: [-2, -6], opacity: 0.55 });
    K.impact(fx, c, { t: t + 0.25, scale: 1.3 }); B.shake(fx, t + 0.25, 0.45, 0.4);
  },
};
