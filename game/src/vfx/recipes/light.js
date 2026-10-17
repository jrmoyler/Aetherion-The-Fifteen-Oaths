// LIGHT & HOLY — Oath of Daybreak. Cast study reference-107: radiant beams, halos, glyph circles, gold-white.
import { B, K, V, C, life, along, polar, meteor, skyStrike, portal, clamp01, easeOut, smooth } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

const GOLD = { c0: C('#ffffff'), c1: C('#ffe6a0'), c2: C('#ffb547') };

export default {
  // Nova Beam — a wide radiant beam with travelling halo rings and a blinding terminus.
  'linear/beam'(fx) {
    K.gather(fx, { size: 0.3 }); const t = fx.T.ant; const L = life(fx, 1.15) + 0.2; const end = fx.o.add(fx.dir.scale(fx.ab.range ?? 20));
    end.y = fx.tgtH.y;
    B.beam(fx, { from: fx.o, to: end, width: 1.1, t0: t, dur: L, kind: 'energy', grow: (lt) => clamp01(lt / 0.1) * 1.02, p: [3, 1, 0, 0], scroll: [10, 0], c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#3ec6ff'), taper: [0.6, 1] });
    B.beam(fx, { from: fx.o, to: end, width: 0.35, t0: t, dur: L, kind: 'energy', grow: (lt) => clamp01(lt / 0.08) * 1.02, c0: C('#ffffff'), c1: C('#ffffff') });
    const yaw = Math.atan2(fx.dir.x, fx.dir.z);
    for (let i = 0; i < 5; i++) {
      const ti = t + i * 0.15;
      B.surf(fx, { shape: 'torus', thick: 0.04, pos: fx.o, kind: 'energy', scale: 0.7, rot: V(Math.PI / 2, yaw, 0), t0: ti, dur: 0.5, c0: C('#ffffff'), c1: C('#ffdc8c'), anim: (lt, u, m) => { m.position.copyFrom(Vector3.Lerp(fx.o, end, u)); m.scaling.setAll(0.7 + u * 0.6); } });
    }
    B.flash(fx, { pos: fx.o, t0: t, size: 2.4, light: 5 });
    B.emit(fx, 'mote', { follow: () => Vector3.Lerp(fx.o, end, Math.random()), t0: t, dur: L, rate: 70, r: 0.5, speed: [0.5, 2] });
    K.impact(fx, fx.tgt, { t: t + 0.08, scale: 1.1 });
  },
  // Celestial Rend — the sky tears open over the target; spears of dawnlight stab down through the rift.
  'linear-extended/rend'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = 3.2; const top = c.add(V(0, 7, 0));
    B.slash(fx, { pos: top, dir: fx.side, r: 4, arc: 1.6, width: 0.9, pitch: Math.PI / 2, t0: t - 0.2, dur: L, kind: 'glow', sweep: 0.15, fadeOut: 0.8, ...GOLD });
    B.slash(fx, { pos: top, dir: fx.side, r: 3.9, arc: 1.5, width: 0.3, pitch: Math.PI / 2, t0: t - 0.15, dur: L - 0.1, kind: 'energy', sweep: 0.12, fadeOut: 0.8, c0: C('#ffffff'), c1: C('#fffaf0') });
    for (let i = 0; i < 6; i++) skyStrike(fx, polar(fx, c, fx.rnd() * 6.28, fx.rnd() * fx.R * 0.8), t + 0.3 + i * 0.22, { r: 0.35, ...GOLD, scale: 0.6 });
    B.decal(fx, { kind: 'glyph', pos: c, r: fx.R, t0: t, dur: L, p: [16, 8, 0, 0], scroll: [0.2, 0], ...GOLD });
    B.emit(fx, 'mote', { pos: top, t0: t, dur: L - 0.5, rate: 60, shape: 'box', box: [2.5, 0.3, 0.3], speed: [1, 3], g: -2 });
    B.light(fx, { pos: c.add(V(0, 3, 0)), t0: t, dur: L, intensity: 5, range: 14, env: (lt, u) => Math.min(1, lt / 0.3) * (1 - smooth((u - 0.8) / 0.2)), color: C('#ffd890') });
  },
  // Chains of Penance — golden chains burst from glyph anchors and bind the target.
  'casting/chains'(fx) {
    K.gather(fx); const c = fx.tgt; const t = fx.T.hit; const L = 3; const R = 2.6;
    B.decal(fx, { kind: 'glyph', pos: c, r: R * 1.1, t0: fx.T.ant * 0.5, dur: L + 0.6, p: [14, 4, 0, 0], scroll: [0.4, 0], ...GOLD });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4; const anchor = polar(fx, c, a, R, 0.1);
      B.decal(fx, { kind: 'glyph', pos: anchor, r: 0.6, t0: t - 0.1, dur: L, p: [8, 3, 0, 0], scroll: [2, 0], ...GOLD });
      B.tendrils(fx, { mode: 'reach', from: anchor, to: c.add(V(0, 1.1 + (i % 2) * 0.4, 0)), count: 1, h: 1.2, curl: 0.3, kind: 'chain', width: 0.22, t0: t, dur: L - 0.1, growT: 0.25, c0: C('#fff0d2'), c1: C('#ffb547'), c2: C('#ff6a1c'), p: [1, 7, 0, 0], taper: false, scaleQ: false });
      B.emit(fx, 'spark', { pos: anchor, t0: t, burst: 20, r: 0.2, speed: [2, 6], ...GOLD });
    }
    B.tendrils(fx, { pos: c, r: 0.55, h: 1.8, count: 2, mode: 'wrap', curl: 0.5, kind: 'chain', width: 0.18, t0: t + 0.25, dur: L - 0.3, growT: 0.3, c0: C('#fff0d2'), c1: C('#ffb547'), c2: C('#b3121c'), p: [1, 9, 0, 0], taper: false, scaleQ: false });
    K.impact(fx, c, { t: t + 0.25, scale: 0.9 });
  },
  // Starbreaker Lance — a crystalline lance of starlight hurtles from the zenith into the target.
  'casting/lance'(fx) {
    K.gather(fx); B.telegraph(fx, { r: 2 }); const c = fx.tgt; const t = fx.T.hit + 0.25; const from = c.add(V(-fx.dir.x * 2, 16, -fx.dir.z * 2));
    const cur = from.clone(); fx.at(fx.T.ant, t - fx.T.ant, { update(lt, u) { cur.copyFrom(Vector3.Lerp(from, c.add(V(0, 1.2, 0)), u * u)); } });
    B.solid(fx, { shape: 'ico', mat: 'crystal', tint: fx.pal.glow, emissive: 1.2, size: V(0.35, 3.6, 0.35), t0: fx.T.ant, dur: t - fx.T.ant + 0.6, path: () => cur, anim: (lt, u, m) => { m.lookAt(c); m.rotation.x += Math.PI / 2; } });
    B.trail(fx, { follow: () => cur, t0: fx.T.ant, dur: t - fx.T.ant + 0.2, width: 0.7, kind: 'energy', c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#5a34ff') });
    B.flash(fx, { pos: c.add(V(0, 1, 0)), t0: t, size: 5, light: 8, color: C('#c8f4ff') });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; B.beam(fx, { from: c.add(V(0, 0.3, 0)), to: polar(fx, c, a, 3, 0.1), width: 0.25, t0: t, dur: 0.5, grow: (lt) => clamp01(lt / 0.1) * 1.02, c0: C('#ffffff'), c1: fx.pal.glow }); }
    K.impact(fx, c, { t, scale: 1.5 }); B.shake(fx, t, 0.5, 0.4);
  },
  // Sunfall Prism — a prism kindles above the target and splits a sunbeam into a fan of rays.
  'collective/prism'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = 2.2; const pz = c.add(V(0, 3.4, 0));
    B.solid(fx, { shape: 'cyl', tess: 3, mat: 'crystal', tint: C('#fff1b0'), emissive: 0.8, size: V(0.9, 1.3, 0.9), pos: pz, t0: t - 0.2, dur: L, spin: V(0, 1.5, 0) });
    B.beam(fx, { from: pz.add(V(0, 12, 0)), to: pz, width: 0.6, t0: t - 0.1, dur: L - 0.2, c0: C('#ffffff'), c1: C('#fff1b0') });
    const cols = ['#ff8a8a', '#ffd27a', '#fff1b0', '#9dffb0', '#8ad8ff', '#c49bff'];
    cols.forEach((h, i) => { const a = (i / cols.length) * 6.28 + 0.3; const g = polar(fx, c, a, fx.R * 0.7, 0.05); B.beam(fx, { from: pz, to: g, width: 0.3, t0: t + 0.1 + i * 0.03, dur: L - 0.4, grow: (lt) => clamp01(lt / 0.12) * 1.02, c0: C('#ffffff'), c1: C(h) }); B.decal(fx, { kind: 'pool', pos: g, r: 0.8, t0: t + 0.15, dur: L - 0.4, c0: C('#ffffff'), c1: C(h), opacity: 0.8 }); });
    B.decal(fx, { kind: 'glyph', pos: c, r: fx.R, t0: t, dur: L, p: [12, 6, 0, 0], scroll: [0.3, 0], ...GOLD });
    K.impact(fx, c, { t: t + 0.15, scale: 1 });
  },
  // Starfall Rite — a glyph circle opens and a rain of falling stars pours into the zone.
  'matrix-new/starfall'(fx) {
    K.gather(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 3.6);
    B.decal(fx, { kind: 'glyph', pos: c, r: fx.R * 1.05, t0: 0, dur: t + L, grow: [0, 1, t], p: [18, 8, 0, 0], scroll: [0.2, 0], ...GOLD });
    B.decal(fx, { kind: 'glyph', pos: c.add(V(0, 9, 0)), r: fx.R * 0.8, t0: t - 0.3, dur: L, lift: 9, p: [12, 6, 0, 0], scroll: [-0.3, 0], ...GOLD, opacity: 0.7 });
    for (let i = 0; i < 12; i++) {
      const to = polar(fx, c, fx.rnd() * 6.28, Math.sqrt(fx.rnd()) * fx.R * 0.95); const ti = t + i * (L * 0.6 / 12);
      meteor(fx, to.add(V(fx.rnd() - 0.5, 9, fx.rnd() - 0.5)), to, ti, 0.35, { kind: 'star', size: 0.3, impactScale: 0.45, shake: i % 4 === 0 });
    }
    B.emit(fx, 'mote', { pos: c.add(V(0, 0.3, 0)), t0: t, dur: L, rate: 40, shape: 'disc', r: fx.R, speed: [0.5, 2], g: 1.5 });
  },
  // Dawn Sanctuary — a sheltering dome of warm dawnlight, healing motes rising from a gilded circle.
  'atlas/sanctuary'(fx) {
    K.gather(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 6) - 1.5;
    B.decal(fx, { kind: 'glyph', pos: c, r: fx.R * 1.1, t0: t - 0.2, dur: L + 0.5, p: [14, 6, 0, 0], scroll: [0.15, 0], c0: C('#fffbe6'), c1: C('#c9953e') });
    B.decal(fx, { kind: 'pool', pos: c, r: fx.R * 1.2, t0: t, dur: L, c0: C('#fff6c4'), c1: fx.pal.glow, opacity: 0.6 });
    B.dome(fx, { pos: c, r: fx.R, kind: 'energy', t0: t, dur: L, rise: 0.6, opacity: 0.55, c0: C('#fffbe6'), c1: C('#fff1c8'), c2: fx.pal.glow, p: [4, 3, 0, 2.2] });
    B.column(fx, { pos: c, r: fx.R * 0.3, h: 8, t0: t, dur: L, kind: 'glow', c0: C('#ffffff'), c1: C('#fff1c8'), opacity: 0.5 });
    B.emit(fx, 'mote', { pos: c.add(V(0, 0.2, 0)), t0: t, dur: L, rate: 50, shape: 'disc', r: fx.R * 0.9, speed: [0.5, 1.5], g: 1.5, c0: C('#ffffff'), c1: C('#a9ffd2'), c2: C('#fff1c8') });
    B.light(fx, { pos: c.add(V(0, 2, 0)), t0: t, dur: L, intensity: 3, range: fx.R * 3, color: C('#fff1c8'), env: (lt, u) => Math.min(1, lt / 0.5) * (1 - smooth((u - 0.85) / 0.15)) });
  },
  // Seraphic Descent — wings of light unfold over the target as a seraph's pillar descends; feathers fall.
  'codex/seraph'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = 2.6; const wc = c.add(V(0, 3.2, 0)).subtract(fx.dir.scale(0.4));
    for (const s of [-1, 1]) {
      B.slash(fx, { pos: wc, dir: fx.dir, r: 2.8, arc: 1.5, width: 1.4, yaw: s * 1.2, pitch: -0.2, tilt: s * 1.35, t0: t - 0.1, dur: L, kind: 'glow', sweep: 0.25, fadeOut: 0.7, ...GOLD, reverse: s > 0 });
      B.slash(fx, { pos: wc, dir: fx.dir, r: 2.2, arc: 1.3, width: 0.9, yaw: s * 1.2, pitch: -0.2, tilt: s * 1.35, t0: t, dur: L - 0.1, kind: 'energy', sweep: 0.25, fadeOut: 0.7, c0: C('#ffffff'), c1: C('#ffe6a3'), reverse: s > 0 });
    }
    skyStrike(fx, c, t + 0.15, { r: 1.1, h: 16, dur: 0.9, ...GOLD, scale: 1.4 });
    B.emit(fx, 'petal', { pos: wc.add(V(0, 1, 0)), t0: t, dur: L - 0.4, rate: 40, shape: 'sphere', r: 2.2, speed: [0.3, 1], g: -1.2, c0: C('#ffffff'), c1: C('#fff1b0'), c2: C('#ffae45') });
    B.ring(fx, { pos: c, r0: 0.4, r1: fx.R * 1.3, h: 0.8, t0: t + 0.2, dur: 0.6, ...GOLD });
    B.shake(fx, t + 0.2, 0.4, 0.4);
  },
};
