// LIGHTNING — Storm Relay. Sheets reference-006..014. Palette: core #ffffff, glow #8fb8ff, edge #5a3ccf.
import { B, K, V, C, life, fade, along, polar, clamp01, easeOut, smooth } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

const jitter = (fx, p, s) => p.add(V((fx.rnd() - 0.5) * s, (fx.rnd() - 0.5) * s, (fx.rnd() - 0.5) * s));

export default {
  // 014 Storm Lance — near-instant spear of lightning: blinding core bolt with forks, scorched crater.
  'linear/thunder'(fx) {
    K.gather(fx); const t = fx.T.ant;
    B.bolt(fx, { from: fx.o, to: fx.tgtH, t0: t, dur: 0.45, width: 0.75, forks: 6, segs: 22, jag: 0.18, growTime: 0.05, fadeOut: 0.3 });
    B.bolt(fx, { from: fx.o, to: fx.tgtH, t0: t + 0.03, dur: 0.35, width: 0.35, forks: 2, segs: 22, jag: 0.3, regen: 0.04 });
    B.beam(fx, { from: fx.o, to: fx.tgtH, width: 0.22, t0: t, dur: 0.18, kind: 'energy', c0: C('#ffffff'), c1: C('#c9ecff') });
    B.flash(fx, { pos: fx.o, t0: t, size: 2, light: 4 });
    K.impact(fx, fx.tgt, { t: t + 0.04, scale: 1.3 });
    B.ring(fx, { pos: fx.tgt, r0: 0.3, r1: 3.2, h: 0.4, t0: t + 0.04, dur: 0.35 });
    B.decal(fx, { kind: 'scorch', pos: fx.tgt, r: 1.6, t0: t + 0.04, dur: 2.5, p: [1, 1, 0, 0], c1: fx.pal.glow, c3: C('#0a0c12') });
    B.shake(fx, t + 0.04, 0.4, 0.3);
  },
  // 013 Voltaic Snare — six pylon nodes ring the target; a crackling violet net links them and pins the centre.
  'linear/snare'(fx) {
    K.gather(fx); B.telegraph(fx); const L = life(fx, 2.6) + 0.6; const c = fx.tgt; const n = 6; const t = fx.T.hit;
    const nodes = []; for (let i = 0; i < n; i++) nodes.push(polar(fx, c, (i / n) * Math.PI * 2, fx.R * 0.9, 0.6));
    nodes.forEach((p, i) => {
      B.surf(fx, { shape: 'sphere', tess: 10, pos: p, kind: 'energy', scale: 0.22, t0: t + i * 0.04, dur: L, p: [3, 3, 0, 1.2] });
      B.bolt(fx, { from: p, to: nodes[(i + 1) % n], t0: t + 0.1 + i * 0.04, dur: L - 0.2, width: 0.22, forks: 1, segs: 12, regen: 0.07 });
      B.bolt(fx, { from: p, to: c.add(V(0, 1, 0)), t0: t + 0.25, dur: L - 0.4, width: 0.16, forks: 1, segs: 10, regen: 0.09, jag: 0.35 });
      B.emit(fx, 'spark', { pos: p, t0: t, dur: L, rate: 10, r: 0.1, speed: [1, 3] });
    });
    B.decal(fx, { kind: 'glyph', pos: c, r: fx.R, t0: t, dur: L, p: [12, 6, 0, 0], scroll: [0.6, 0], opacity: 0.8 });
    K.impact(fx, c, { t: t + 0.25, scale: 0.9 });
  },
  // 012 Electrical Sphere — an amber plasma sphere swells over the target, arcs lashing its inner wall.
  'linear-ext/electrical'(fx) {
    K.gather(fx); B.telegraph(fx); const L = life(fx, 3.6); const c = fx.tgt.add(V(0, 1.5, 0)); const t = fx.T.hit;
    B.dome(fx, { pos: c, r: fx.R * 0.6, full: true, kind: 'energy', t0: t, dur: L, rise: 0.45, opacity: 0.8, p: [4, 4, 0, 1.6], scroll: [0.3, 0.6], breathe: true });
    B.surf(fx, { shape: 'sphere', tess: 14, pos: c, kind: 'energy', scale: 0.5, t0: t, dur: L, p: [3, 3, 0, 1], c0: C('#ffffff'), c1: C('#fff7d6') });
    for (let i = 0; i < 6; i++) B.bolt(fx, { from: c, to: () => c.add(V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().scale(fx.R * 0.58)), t0: t + 0.2, dur: L - 0.3, width: 0.2, forks: 2, segs: 10, regen: 0.08 + i * 0.01 });
    B.emit(fx, 'spark', { pos: c, t0: t, dur: L, rate: 40, shape: 'shell', r: fx.R * 0.6, speed: [1, 4] });
    B.light(fx, { pos: c, t0: t, dur: L, intensity: 5, range: 12, flicker: true, env: (lt, u) => Math.min(1, lt / 0.3) * (1 - smooth((u - 0.85) / 0.15)), pri: 2 });
    K.impact(fx, fx.tgt, { t: t + L * 0.9, scale: 1.3 });
    B.ring(fx, { pos: fx.tgt, r0: 0.5, r1: fx.R * 1.3, h: 0.5, t0: t + L * 0.9, dur: 0.4 });
  },
  // 011 Electric Boost — the caster is wreathed in arcing current and leaves a charged ring.
  'linear-ext/boost'(fx) {
    const f = () => (fx.caster?.position ?? fx.g); const body = () => f().add(V(0, 1, 0)); const t = 0.15; const L = 2.4;
    K.gather(fx, { dur: t, circle: false });
    for (let i = 0; i < 4; i++) B.bolt(fx, { from: () => jitter(fx, body(), 1.2), to: () => jitter(fx, body(), 1.4), t0: t, dur: L, width: 0.14, forks: 1, segs: 8, regen: 0.07 + i * 0.015 });
    B.column(fx, { pos: fx.g, r: 0.8, h: 2.4, t0: t, dur: L, kind: 'energy', p: [3, 4, 0, 2], scroll: [0, -2], opacity: 0.6 });
    B.ring(fx, { pos: fx.g, r0: 0.4, r1: 3.2, h: 0.4, t0: t, dur: 0.45 });
    B.decal(fx, { kind: 'glyph', pos: fx.g, r: 1.4, t0: t, dur: L, p: [10, 6, 0, 0], scroll: [1.5, 0] });
    B.emit(fx, 'spark', { follow: body, t0: t, dur: L, rate: 30, r: 0.6, speed: [2, 5] });
    B.flash(fx, { pos: body(), t0: t, size: 2.5, light: 5 });
    B.shake(fx, t, 0.2, 0.25);
  },
  // 010 Stormheart Gyroscope — three gimballed rings spin over the target and rain bolts into it.
  'casting/gyro'(fx) {
    K.gather(fx); B.telegraph(fx); const L = 3.2; const c = fx.tgt.add(V(0, 3.6, 0)); const t = fx.T.hit;
    [[0, 0], [Math.PI / 2, 0], [Math.PI / 4, Math.PI / 2]].forEach(([rx, rz], i) => {
      B.surf(fx, { shape: 'torus', thick: 0.06, pos: c, kind: 'energy', scale: 0.01, rot: V(rx, 0, rz), t0: t - 0.1 + i * 0.08, dur: L, p: [8, 1, 0, 1], scroll: [1, 0],
        anim: (lt, u, m) => { m.scaling.setAll((1.6 + i * 0.35) * easeOut(lt / 0.4)); m.rotation.x = rx + lt * (1.8 + i * 0.7); m.rotation.y = lt * (1.2 - i * 0.5); } });
    });
    B.surf(fx, { shape: 'sphere', tess: 12, pos: c, kind: 'energy', scale: 0.4, t0: t, dur: L, p: [3, 3, 0, 1], c0: C('#ffffff') });
    for (let k = 0; k < 7; k++) {
      const p = polar(fx, fx.tgt, fx.rnd() * 6.28, fx.rnd() * fx.R * 0.8); const ti = t + 0.3 + k * 0.38;
      B.bolt(fx, { from: c, to: p, t0: ti, dur: 0.22, width: 0.3, forks: 2, segs: 14, growTime: 0.04 });
      K.impact(fx, p, { t: ti + 0.03, scale: 0.55, shake: k === 0 });
    }
    B.decal(fx, { kind: 'glyph', pos: fx.tgt, r: fx.R, t0: t, dur: L, p: [16, 3, 0, 0], scroll: [-0.4, 0], opacity: 0.7 });
    B.light(fx, { pos: c, t0: t, dur: L, intensity: 4, range: 14, flicker: true, env: () => 1 });
  },
  // 009 Chain Arc — leader latches to A, current leaps A→B→C→D→E→F (≤7.5 m hops), F discharges in three ground forks.
  'collective/chain'(fx) {
    K.gather(fx); const t = fx.T.ant; const hop = 0.16;
    const pts = [fx.tgtH];
    const others = (fx.opts.chain ?? []).map((p) => (p.position ?? p).add(V(0, 1.1, 0)));
    for (let i = 0; i < 5; i++) {
      if (others[i]) { pts.push(others[i]); continue; }
      const prev = pts[pts.length - 1]; const a = Math.atan2(fx.dir.z, fx.dir.x) + (i % 2 ? 1.6 : -1.2) + (fx.rnd() - 0.5);
      pts.push(prev.add(V(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2)));
    }
    B.bolt(fx, { from: fx.o, to: pts[0], t0: t, dur: 0.9, width: 0.3, forks: 3, segs: 16, growTime: 0.06, fadeOut: 0.6 });
    for (let i = 1; i < pts.length; i++) {
      const ti = t + 0.06 + i * hop;
      B.bolt(fx, { from: pts[i - 1], to: pts[i], t0: ti, dur: 0.9 - i * 0.05, width: 0.26, forks: 3, segs: 14, growTime: 0.05, fadeOut: 0.5 });
      B.flash(fx, { pos: pts[i], t0: ti + 0.05, size: 1.6, light: 2.5, n: 1 });
      B.emit(fx, 'spark', { pos: pts[i], t0: ti + 0.05, burst: 24, r: 0.2, speed: [3, 8] });
    }
    K.impact(fx, fx.tgt, { t: t + 0.06, scale: 0.8 });
    const last = pts[pts.length - 1]; const tl = t + 0.06 + (pts.length - 1) * hop;
    for (let k = 0; k < 3; k++) { const a = (k / 3) * 6.28 + fx.rnd(); const g = V(last.x + Math.cos(a) * 2.6, fx.gy(last), last.z + Math.sin(a) * 2.6); B.bolt(fx, { from: last, to: g, t0: tl + 0.05, dur: 0.6, width: 0.3, forks: 2, segs: 12, growTime: 0.05 }); }
    B.decal(fx, { kind: 'cracks', pos: V(last.x, 0, last.z), r: 2.6, t0: tl + 0.05, dur: 1.4, p: [1, 1.8, 0, 0], opacity: 0.85 });
    B.shake(fx, tl, 0.3, 0.3);
  },
  // 008 Ion Storm Pillar — a cyan pillar of ionised air, spiralling arcs and a crown of cloud.
  'matrix-new/ionstorm'(fx) {
    K.gather(fx); B.telegraph(fx); const L = life(fx, 3.4) + 0.4; const c = fx.tgt; const t = fx.T.hit; const H = 9;
    B.column(fx, { pos: c, r: fx.R * 0.38, h: H, t0: t, dur: L, rise: 0.2, kind: 'energy', p: [3, 4, 0, 1.6], scroll: [0.4, -3] });
    B.column(fx, { pos: c, r: fx.R * 0.15, h: H, t0: t, dur: L, rise: 0.15, kind: 'glow', c0: C('#ffffff'), c1: fx.pal.glow });
    for (let i = 0; i < 3; i++) {
      const ph = (i / 3) * 6.28;
      B.bolt(fx, { from: () => { const a = ph + fx.t * 4; return V(c.x + Math.cos(a) * fx.R * 0.5, fx.gy(c) + 0.2, c.z + Math.sin(a) * fx.R * 0.5); }, to: () => { const a = ph + fx.t * 4 + 2; return V(c.x + Math.cos(a) * fx.R * 0.35, fx.gy(c) + H * 0.9, c.z + Math.sin(a) * fx.R * 0.35); }, t0: t + 0.1, dur: L - 0.2, width: 0.2, forks: 2, segs: 18, regen: 0.06, jag: 0.15 });
    }
    B.emit(fx, 'mist', { pos: c.add(V(0, H, 0)), t0: t, dur: L, rate: 10, shape: 'disc', r: fx.R * 0.9, size: 3, alpha: 0.5, c0: C('#cfe9ff'), c1: C('#6a7cff'), c2: C('#1a2040') });
    B.emit(fx, 'spark', { pos: c.add(V(0, 0.2, 0)), t0: t, dur: L, rate: 40, shape: 'disc', r: fx.R, speed: [2, 6] });
    B.ring(fx, { pos: c, r0: 0.5, r1: fx.R * 1.2, h: 0.6, t0: t, dur: 0.45 });
    K.impact(fx, c, { t, scale: 1.2 }); K.linger(fx, c, { dur: L });
    B.light(fx, { pos: c.add(V(0, 2, 0)), t0: t, dur: L, intensity: 5, range: 14, flicker: true, env: (lt, u) => 1 - smooth((u - 0.8) / 0.2) });
  },
  // 007 Arc Relay — a bolt strikes a floating relay node, which re-fires into the target.
  'atlas/relay'(fx) {
    K.gather(fx); const t = fx.T.ant; const node = Vector3.Lerp(fx.o, fx.tgtH, 0.5).add(V(0, 1.4, 0)).add(fx.side.scale(0.8));
    B.surf(fx, { shape: 'torus', thick: 0.12, pos: node, kind: 'energy', scale: 0.01, t0: t - 0.1, dur: 1.2, anim: (lt, u, m) => { m.scaling.setAll(0.8 * easeOut(lt / 0.2)); m.rotation.x = lt * 6; m.rotation.z = lt * 4; } });
    B.surf(fx, { shape: 'sphere', tess: 10, pos: node, kind: 'energy', scale: 0.25, t0: t - 0.1, dur: 1.2, c0: C('#ffffff') });
    B.bolt(fx, { from: fx.o, to: node, t0: t, dur: 0.55, width: 0.3, forks: 2, segs: 12, growTime: 0.04 });
    B.bolt(fx, { from: node, to: fx.tgtH, t0: t + 0.12, dur: 0.6, width: 0.38, forks: 3, segs: 14, growTime: 0.05 });
    B.flash(fx, { pos: node, t0: t + 0.05, size: 2.2, light: 3 });
    B.emit(fx, 'spark', { pos: node, t0: t + 0.05, burst: 30, r: 0.2, speed: [3, 8] });
    K.impact(fx, fx.tgt, { t: t + 0.17, scale: 1 });
  },
  // 006 Ball Lightning — a slow crackling plasma ball drifts down the line, spitting arcs, then detonates.
  'codex/balllightning'(fx) {
    K.gather(fx, { size: 0.35 }); K.release(fx);
    const t0 = fx.T.ant; const dur = Math.min(2.2, Math.max(1.2, fx.dist / 5)); const from = fx.o.clone(); const to = fx.tgtH.clone(); const cur = from.clone();
    const prim = { update(lt) { const u = clamp01(lt / dur); cur.copyFrom(Vector3.Lerp(from, to, u)); cur.y += Math.sin(u * Math.PI) * 0.6 + Math.sin(lt * 6) * 0.12; } }; fx.at(t0, dur, prim);
    B.surf(fx, { shape: 'sphere', tess: 16, pos: from, follow: () => cur, kind: 'energy', scale: 0.55, t0, dur, p: [4, 4, 0, 1.4], scroll: [1, 2], anim: (lt, u, m) => m.scaling.setAll(0.55 + Math.sin(lt * 25) * 0.05) });
    B.surf(fx, { shape: 'sphere', tess: 10, pos: from, follow: () => cur, kind: 'glow', scale: 0.25, t0, dur, c0: C('#ffffff'), c1: C('#ffffff') });
    for (let i = 0; i < 4; i++) B.bolt(fx, { from: () => cur, to: () => jitter(fx, cur, 2.2), t0, dur, width: 0.12, forks: 1, segs: 7, regen: 0.06 + i * 0.02 });
    B.bolt(fx, { from: () => cur, to: () => V(cur.x + (Math.random() - 0.5), fx.gy(cur), cur.z + (Math.random() - 0.5)), t0, dur, width: 0.14, forks: 1, segs: 9, regen: 0.11 });
    B.emit(fx, 'spark', { follow: () => cur, t0, dur, rate: 40, r: 0.4, speed: [1, 4] });
    B.light(fx, { pos: () => cur, t0, dur, intensity: 3.5, range: 8, flicker: true, env: () => 1 });
    const tb = t0 + dur;
    K.impact(fx, fx.tgt, { t: tb, scale: 1.4 });
    B.ring(fx, { pos: fx.tgt, r0: 0.3, r1: 3.5, h: 1, t0: tb, dur: 0.5 });
    for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.28; B.bolt(fx, { from: to, to: V(to.x + Math.cos(a) * 2.6, fx.gy(to), to.z + Math.sin(a) * 2.6), t0: tb, dur: 0.3, width: 0.25, forks: 1, segs: 9 }); }
  },
};
