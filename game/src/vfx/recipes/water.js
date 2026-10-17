// WATER — Tidal Covenant. Sheets reference-000..005. Deep abyssal blues, white foam crests, wet ground wash.
import { B, K, V, C, life, fade, along, polar, serpent, clamp01, easeOut, smooth, lerp } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

export default {
  // 000 Riptide Lash — compact ribbon at the hand, narrow jet, tip folds into a low curling wave, fan splash, wet wash.
  'codex/riptide'(fx) {
    const t = fx.T.ant; const P = fx.pal;
    K.gather(fx, { preset: 'drip' });
    B.surf(fx, { shape: 'torus', thick: 0.08, pos: fx.o, kind: 'water', scale: 0.01, rot: V(Math.PI / 2, Math.atan2(fx.dir.x, fx.dir.z), 0), t0: 0, dur: t + 0.1, p: [6, 1, 1, 2], scroll: [1.5, 0],
      anim: (lt, u, m) => m.scaling.setAll(0.45 * easeOut(lt / t)) });
    const jetEnd = along(fx, 0.45, 0.6); const jetDur = 0.35;
    B.beam(fx, { from: fx.o, to: jetEnd, kind: 'liquid', width: 0.22, t0: t, dur: jetDur + 0.5, grow: (lt) => clamp01(lt / jetDur) * 1.02, wobble: 0.08, p: [4, 1, 0, 0], scroll: [10, 0], c0: C('#ffffff'), c1: P.glow, c3: P.deep, taper: [0.6, 1.4] });
    const wStart = Vector3.Lerp(fx.g, fx.tgt, 0.35); wStart.y = fx.gy(wStart); const wDur = Math.max(0.55, fx.T.travel + 0.35);
    B.wave(fx, { from: wStart, to: fx.tgt.subtract(fx.dir.scale(0.6)), width: 3.4, h: 2.6, t0: t + jetDur * 0.7, dur: wDur, c0: C('#f4fcff'), c1: P.glow, c2: P.edge, c3: P.deep, p: [3, 1.5, 1.5, 2], growRate: 2.2, spread: 0.25 });
    const head = V(); fx.at(t + jetDur * 0.7, wDur, { update(lt) { head.copyFrom(Vector3.Lerp(wStart, fx.tgt, easeOut(clamp01(lt / wDur)))); head.y = fx.gy(head) + 1.2; } });
    B.emit(fx, 'splash', { follow: () => head, t0: t + jetDur, dur: wDur - 0.2, rate: 120, shape: 'box', box: [1.1, 0.4, 0.3], dir1: V(-1, 2, 0.5), dir2: V(1, 4, 2), speed: [1, 3] });
    B.emit(fx, 'foam', { follow: () => head, t0: t + jetDur, dur: wDur - 0.2, rate: 30, shape: 'box', box: [1.2, 0.6, 0.3], size: 0.8 });
    const hit = t + jetDur * 0.7 + wDur * 0.85;
    B.emit(fx, 'splash', { pos: fx.tgtH, t0: hit, burst: 140, shape: 'dir', dir: fx.dir.add(V(0, 1.2, 0)), spread: 0.9, r: 0.6, speed: [3, 10], size: 0.2 });
    B.emit(fx, 'foam', { pos: fx.tgtH, t0: hit, burst: 30, shape: 'dir', dir: fx.dir.add(V(0, 1, 0)), spread: 0.8, r: 0.6, speed: [2, 5], size: 1.0 });
    B.flash(fx, { pos: fx.tgtH, t0: hit, size: 2.4, light: 3, color: P.glow });
    B.decal(fx, { kind: 'wash', pos: Vector3.Lerp(fx.tgt, wStart, 0.25), r: 3.4, t0: t + jetDur, dur: life(fx, 2) + 2, grow: [0.1, 1, wDur], opacity: 0.85 });
    B.shake(fx, hit, 0.3, 0.3);
  },
  // 001 Maelstrom Vortex — a churning whirlpool funnel drags spray and debris round the target.
  'codex/maelstrom'(fx) {
    K.gather(fx); B.telegraph(fx); const L = life(fx, 4.8); const c = fx.tgt; const t = fx.T.hit;
    B.decal(fx, { kind: 'spiral', pos: c, r: fx.R * 1.1, t0: t - 0.1, dur: L + 0.4, p: [4, 1.4, 0, 0], scroll: [2.5, 6], opacity: 0.9, c2: fx.pal.deep });
    B.decal(fx, { kind: 'wash', pos: c, r: fx.R * 1.2, t0: t, dur: L + 1, opacity: 0.8 });
    B.vortex(fx, { pos: c, r0: fx.R * 0.15, r1: fx.R * 0.9, h: 3.2, t0: t, dur: L, kind: 'water', spin: 3.5, scroll: [0.8, -0.3], squash: true, p: [5, 2, 1.4, 2] });
    B.vortex(fx, { pos: c, r0: fx.R * 0.1, r1: fx.R * 0.55, h: 4.2, t0: t + 0.15, dur: L - 0.2, kind: 'water', spin: -5, scroll: [1.2, -0.5], opacity: 0.6, squash: true, p: [6, 3, 1, 2] });
    B.emit(fx, 'splash', { pos: c.add(V(0, 0.3, 0)), t0: t, dur: L * 0.9, rate: 90, shape: 'disc', r: fx.R * 0.9, speed: [2, 5], spread: 0.3 });
    B.emit(fx, 'foam', { pos: c.add(V(0, 2.8, 0)), t0: t, dur: L * 0.85, rate: 14, shape: 'disc', r: fx.R * 0.8, size: 1.2 });
    B.debris(fx, { pos: c, mode: 'orbit', count: 10, mat: 'rock', size: [0.15, 0.35], r: fx.R * 0.8, y: [0.5, 2.8], orbit: 2.4, t0: t, dur: L, collapse: 0.8 });
    K.impact(fx, c, { t, scale: 1.1 });
    B.emit(fx, 'splash', { pos: c.add(V(0, 0.5, 0)), t0: t + L * 0.85, burst: 160, shape: 'up', r: fx.R * 0.4, spread: 0.6, speed: [4, 11] });
  },
  // 002 Abyssal Maw — a dark pool opens; a ring of bone teeth erupts and snaps shut on the target in a geyser.
  'casting/shark'(fx) {
    K.gather(fx); const c = fx.tgt; const t = fx.T.hit; const R = 2.2;
    B.decal(fx, { kind: 'wash', pos: c, r: R * 1.3, t0: fx.T.ant * 0.5, dur: 3.2, grow: [0, 1, 0.5], c1: fx.pal.deep, c3: C('#02060c'), opacity: 0.95 });
    B.decal(fx, { kind: 'spiral', pos: c, r: R, t0: fx.T.ant * 0.5, dur: 1.4, p: [3, 1, 0, 0], scroll: [2, 5], c1: fx.pal.glow, opacity: 0.7 });
    B.spikes(fx, { layout: 'ring', pos: c, r: R * 0.8, shape: 'thorn', count: 14, h: [1.2, 2.0], w: [0.22, 0.32], lean: -0.6, t0: t, dur: 1.4, rise: 0.18, sinkAt: 0.6, mat: 'bone', overshoot: true });
    B.spikes(fx, { layout: 'ring', pos: c, r: R * 0.55, shape: 'thorn', count: 10, h: [0.8, 1.3], w: [0.18, 0.26], lean: -0.5, t0: t + 0.05, dur: 1.3, rise: 0.18, sinkAt: 0.6, mat: 'bone' });
    B.vortex(fx, { pos: c, r0: 0.6, r1: 1.2, h: 4, t0: t, dur: 1.0, kind: 'water', spin: 2, scroll: [0.2, -2], rise: 0.15, squash: true, p: [3, 2, 1.5, 2] });
    B.emit(fx, 'splash', { pos: c.add(V(0, 0.4, 0)), t0: t, burst: 200, shape: 'up', r: 1, spread: 0.45, speed: [5, 13], size: 0.22 });
    B.emit(fx, 'foam', { pos: c.add(V(0, 1.5, 0)), t0: t, burst: 30, r: 1.2, speed: [2, 6], size: 1.2 });
    K.impact(fx, c, { t: t + 0.2, scale: 1.3 });
    B.shake(fx, t + 0.2, 0.4, 0.35);
  },
  // 003 Sumi Tide — a tide of living ink: black-teal wave, curling ink tendrils, paper-white spray.
  'linear-extended/ink'(fx) {
    K.gather(fx); B.telegraph(fx); const L = life(fx, 5.4); const c = fx.tgt; const t = fx.T.hit;
    const INK = { c0: C('#ded8c9'), c1: C('#134b55'), c2: C('#101f26'), c3: C('#05070b') };
    const from = c.subtract(fx.dir.scale(fx.R)); const to = c.add(fx.dir.scale(fx.R));
    B.wave(fx, { from, to, width: fx.R * 1.6, h: 2.2, t0: t - 0.2, dur: 1.3, ...INK, p: [3, 1.5, 1.2, 2] });
    B.tendrils(fx, { pos: c, r: fx.R * 0.9, h: 2.4, count: 9, kind: 'dark', width: 0.35, t0: t + 0.3, dur: L - 0.6, growT: 0.7, retract: L - 1.6, curl: 1.4, ...INK, p: [3, 4, 0, 0] });
    B.decal(fx, { kind: 'wash', pos: c, r: fx.R * 1.2, t0: t, dur: L + 0.5, ...INK, opacity: 0.95 });
    B.emit(fx, 'void', { pos: c.add(V(0, 0.4, 0)), t0: t, dur: L * 0.8, rate: 10, shape: 'disc', r: fx.R, colors: [C('#134b55'), C('#101f26'), C('#05070b')] });
    B.emit(fx, 'splash', { pos: c.add(V(0, 0.5, 0)), t0: t, burst: 80, shape: 'up', r: fx.R * 0.6, spread: 0.7, speed: [3, 8], colors: [C('#ded8c9'), C('#8f8a7c'), C('#101f26')] });
    K.impact(fx, c, { t: t + 0.3, scale: 1 });
  },
  // 004 Tidewrought Ring — a ring of water rises around the target, crests and crashes inward.
  'linear-ext/aether'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = 3.2;
    B.surf(fx, { shape: 'cylinder', cylBase: true, top: 1.8, bottom: 2, pos: V(c.x, fx.gy(c), c.z), kind: 'water', opacity: 0.8, scale: V(fx.R, 0.01, fx.R), t0: t, dur: L * 0.6, p: [8, 1.5, 1.6, 2], scroll: [0.4, -0.8],
      anim: (lt, u, m) => { const rise = easeOut(lt / 0.5); const crash = smooth((u - 0.55) / 0.45); m.scaling.y = 1.9 * rise * (1 - crash * 0.7); m.scaling.x = m.scaling.z = fx.R * (1 - crash * 0.85); } });
    B.surf(fx, { shape: 'torus', thick: 0.18, pos: c.add(V(0, 0.2, 0)), kind: 'water', scale: fx.R, t0: t, dur: L * 0.6, p: [8, 1, 1.5, 2], scroll: [1, 0],
      anim: (lt, u, m) => { const rise = easeOut(lt / 0.5); const crash = smooth((u - 0.55) / 0.45); m.position.y = fx.gy(c) + 1.9 * rise * (1 - crash * 0.7); m.scaling.setAll(fx.R * (1 - crash * 0.85)); } });
    B.emit(fx, 'splash', { pos: c.add(V(0, 2.6, 0)), t0: t + 0.3, dur: L * 0.4, rate: 100, shape: 'shell', r: fx.R * 0.9, speed: [1, 3], g: -10 });
    const crash = t + L * 0.6;
    B.emit(fx, 'splash', { pos: c.add(V(0, 0.6, 0)), t0: crash - 0.2, burst: 180, shape: 'up', r: 0.8, spread: 0.5, speed: [5, 12] });
    B.emit(fx, 'foam', { pos: c.add(V(0, 0.8, 0)), t0: crash - 0.2, burst: 30, r: 1.2, speed: [2, 6], size: 1.3 });
    K.impact(fx, c, { t: crash - 0.2, scale: 1.4 }); K.linger(fx, c, { t0: crash - 0.2, dur: 2 });
    B.ring(fx, { pos: c, r0: 0.4, r1: fx.R * 1.2, h: 0.6, t0: crash - 0.2, dur: 0.5, kind: 'water', blend: 'normal' });
  },
  // 005 Kraken Crown — tentacles of seawater rise in a crown from a dark pool and coil inward over the target.
  'linear-ext/kraken'(fx) {
    K.gather(fx); B.telegraph(fx); const L = life(fx, 5.5); const c = fx.tgt; const t = fx.T.hit;
    const P = { c0: C('#f2d8c8'), c1: C('#4ff2d8'), c2: C('#ff3b5c'), c3: C('#2a0f22') };
    B.decal(fx, { kind: 'wash', pos: c, r: fx.R * 1.2, t0: t - 0.2, dur: L + 0.8, c1: C('#1a5a6a'), c3: C('#02080c'), opacity: 0.95 });
    B.decal(fx, { kind: 'spiral', pos: c, r: fx.R, t0: t - 0.2, dur: L, p: [8, 1, 0, 0], scroll: [1, 3], c1: C('#4ff2d8'), opacity: 0.6 });
    B.tendrils(fx, { pos: c, r: fx.R * 0.85, h: 4.6, count: 8, kind: 'liquid', width: 0.55, t0: t, dur: L - 0.4, growT: 0.8, retract: L - 1.8, curl: 1.2, inward: 0.15, ...P, p: [4, 4, 0, 0], scroll: [1.5, 0] });
    B.tendrils(fx, { pos: c, r: fx.R * 0.6, h: 2.6, count: 6, kind: 'liquid', width: 0.32, t0: t + 0.25, dur: L - 0.8, growT: 0.6, retract: L - 2, curl: 1.8, ...P });
    B.emit(fx, 'splash', { pos: c.add(V(0, 0.3, 0)), t0: t, dur: 1.2, rate: 120, shape: 'disc', r: fx.R * 0.85, speed: [3, 7], spread: 0.25 });
    B.emit(fx, 'drip', { pos: c.add(V(0, 3.5, 0)), t0: t + 0.5, dur: L - 1.5, rate: 40, shape: 'disc', r: fx.R * 0.6 });
    K.impact(fx, c, { t: t + 0.4, scale: 1.2 });
  },
};
