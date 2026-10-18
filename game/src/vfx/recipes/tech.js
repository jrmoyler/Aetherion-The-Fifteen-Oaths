// TECH & FORCE — Impulse Foundry. Cast study reference-113: hard-light shields, railgun beams, steel constructs.
import { B, K, V, C, life, along, polar, serpent, skyStrike, clamp01, easeOut, smooth, lerp } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

export default {
  // Cyber Serpent — a segmented serpent of hard light weaves down the line and coils its target.
  'linear-extended/cyber'(fx) {
    K.gather(fx); K.release(fx); const t = fx.T.ant; const dur = Math.max(0.6, fx.T.travel + 0.3);
    const head = serpent(fx, (lt) => { const u = clamp01(lt / dur); const p = Vector3.Lerp(fx.o, fx.tgtH, easeOut(u)); p.addInPlace(fx.side.scale(Math.sin(u * 12) * 0.8 * (1 - u * 0.5))); p.y += Math.cos(u * 9) * 0.3; if (lt > dur) { const a = (lt - dur) * 9; p.addInPlace(V(Math.cos(a) * 0.8, (lt - dur) * 0.6, Math.sin(a) * 0.8)); } return p; }, t, dur + 0.7,
      { kind: 'energy', width: 0.42, n: 32, taperPow: 0.4, p: [3, 1, 0, 0], scroll: [6, 0], c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#1050e0'), parts: 'spark', rate: 30 });
    B.surf(fx, { shape: 'box', pos: fx.o, follow: head, kind: 'hex', scale: 0.3, t0: t, dur: dur + 0.7, spin: 6, c0: C('#ffffff'), c1: fx.pal.glow });
    K.impact(fx, fx.tgt, { t: t + dur, scale: 1 });
  },
  // Monowheel Bot — a brass monowheel construct assembles from sparks and charges down the line.
  'handcast/monowheel'(fx) {
    K.gather(fx); const t = fx.T.ant + 0.2; const run = 1.6; const from = fx.g.add(fx.dir.scale(1)); const to = fx.g.add(fx.dir.scale(Math.min(10, (fx.ab.range ?? 8) + 2)));
    const cur = from.clone(); const yaw = Math.atan2(fx.dir.x, fx.dir.z);
    const path = (lt) => { const u = clamp01((lt - 0.4) / run); cur.copyFrom(Vector3.Lerp(from, to, u * u * 0.4 + u * 0.6)); cur.y = fx.gy(cur) + 0.55; return cur; };
    B.solid(fx, { shape: 'torus', mat: 'metal', tint: C('#e0c46a'), thick: 0.22, size: 1.1, t0: t, dur: run + 0.6, path, anim: (lt, u, m) => { m.rotation.set(lt * 12, yaw, Math.PI / 2); m.scaling.setAll(1.1 * easeOut(lt / 0.3)); } });
    B.solid(fx, { shape: 'box', mat: 'steel', size: V(0.35, 0.3, 0.5), t0: t, dur: run + 0.6, path: (lt) => path(lt).add(V(0, 0.05, 0)), anim: (lt, u, m) => { m.rotation.y = yaw; m.scaling.setAll(easeOut(lt / 0.3)); } });
    B.surf(fx, { shape: 'sphere', tess: 8, pos: from, follow: () => cur.add(fx.dir.scale(0.28)).add(V(0, 0.1, 0)), kind: 'glow', scale: 0.08, t0: t, dur: run + 0.6, c0: C('#ffffff'), c1: C('#ff3b2f') });
    B.emit(fx, 'spark', { pos: from.add(V(0, 0.5, 0)), t0: fx.T.ant, burst: 40, r: 0.6, speed: [-3, -1], c0: C('#ffe9bf'), c1: C('#ffc46a'), c2: C('#ff5a3c') });
    B.emit(fx, 'spark', { follow: () => V(cur.x, fx.gy(cur) + 0.05, cur.z), t0: t + 0.4, dur: run, rate: 60, shape: 'dir', dir: fx.dir.scale(-1).add(V(0, 0.6, 0)), spread: 0.4, speed: [2, 6], c0: C('#ffe9bf'), c1: C('#ffc46a'), c2: C('#ff5a3c') });
    B.trail(fx, { follow: () => V(cur.x, fx.gy(cur) + 0.05, cur.z), t0: t + 0.4, dur: run + 0.3, width: 0.25, kind: 'energy', c0: C('#ffe9bf'), c1: C('#ffc46a'), c2: C('#ff5a3c') });
    B.decal(fx, { kind: 'hex', pos: from, r: 1.2, t0: fx.T.ant, dur: 1, p: [5, 0, 0, 0] });
    K.impact(fx, to, { t: t + 0.4 + run, scale: 1 });
  },
  // Sentinel Drone — a quad-rotor drone deploys overhead, scans the area and lances the target with a red beam.
  'handcast/drone'(fx) {
    K.gather(fx); const t = fx.T.ant; const L = 3.2; const hover = fx.g.add(V(0, 3.2, 0)).add(fx.dir.scale(1.5)); const cur = hover.clone();
    const path = (lt) => { cur.copyFrom(hover); cur.y += Math.sin(lt * 3) * 0.15 + (1 - easeOut(lt / 0.5)) * -1.5; return cur; };
    fx.at(t, L, { update(lt) { path(lt); } });
    B.solid(fx, { shape: 'box', mat: 'steel', size: V(0.6, 0.18, 0.6), t0: t, dur: L, path: () => cur, spin: V(0, 0.5, 0) });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; B.solid(fx, { shape: 'torus', mat: 'metal', thick: 0.05, size: 0.4, t0: t, dur: L, path: () => cur.add(V(Math.cos(a + fx.t * 0.5) * 0.48, 0.05, Math.sin(a + fx.t * 0.5) * 0.48)) }); }
    B.surf(fx, { shape: 'sphere', tess: 8, pos: hover, follow: () => cur.add(V(0, -0.12, 0)), kind: 'glow', scale: 0.1, t0: t, dur: L, c0: C('#ffffff'), c1: C('#ff3b2f') });
    B.surf(fx, { shape: 'cylinder', top: 0.05, bottom: 2, pos: hover, kind: 'glow', scale: V(1.6, 3.2, 1.6), t0: t + 0.5, dur: 0.9, opacity: 0.12, c0: C('#ff5a3c'), c1: C('#ff3b2f'), anim: (lt, u, m) => { m.position.copyFrom(cur).addInPlace(V(0, -1.6, 0)); m.rotation.y = lt * 4; } });
    B.decal(fx, { kind: 'hex', pos: fx.tgt, r: 1.4, t0: t + 0.6, dur: L - 0.6, p: [5, 0, 0, 0], c1: C('#ff3b2f') });
    for (let k = 0; k < 3; k++) {
      const tk = t + 1.4 + k * 0.5;
      B.beam(fx, { from: () => cur, to: fx.tgtH, width: 0.12, t0: tk, dur: 0.25, kind: 'energy', c0: C('#ffffff'), c1: C('#ff3b2f'), c2: C('#ff5a3c') });
      K.impact(fx, fx.tgt, { t: tk, scale: 0.55, shake: k === 0 });
    }
    B.light(fx, { pos: () => cur, t0: t, dur: L, intensity: 1.5, range: 5, color: C('#ff3b2f'), env: () => 1 });
  },
  // Aegis Bulwark — a hard-light hex dome locks down over the area.
  'collective/aegis'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 4.5);
    B.dome(fx, { pos: c, r: fx.R, kind: 'hex', t0: t, dur: L, rise: 0.35, opacity: 0.9, c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#2fa8ff'), breathe: true });
    B.decal(fx, { kind: 'hex', pos: c, r: fx.R * 1.05, t0: t, dur: L, p: [7, 0, 0, 0] });
    B.ring(fx, { pos: c, r0: 0.3, r1: fx.R, h: 0.3, t0: t, dur: 0.4, kind: 'hex' });
    B.emit(fx, 'spark', { pos: c.add(V(0, 0.1, 0)), t0: t, burst: 60, shape: 'disc', r: fx.R, speed: [1, 4] });
    B.flash(fx, { pos: c.add(V(0, 1.5, 0)), t0: t, size: 3, light: 4 });
  },
  // Polarity Garden — red and blue magnetic poles sprout; arcs of force leap between them, debris floats in the field.
  'atlas/polarity'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = 3.2; const n = 6;
    const poles = []; for (let i = 0; i < n; i++) poles.push(polar(fx, c, (i / n) * 6.28 + 0.3, fx.R * (0.55 + (i % 2) * 0.3)));
    poles.forEach((p, i) => {
      const col = i % 2 ? C('#3a8bff') : C('#ff4a3a');
      B.spikes(fx, { layout: 'cluster', pos: p, r: 0.01, count: 1, shape: 'column', mat: 'steel', h: [1.2, 1.2], w: [0.18, 0.18], lean: 0, jitter: 0, t0: t + i * 0.05, dur: L, rise: 0.2, sinkAt: 0.85 });
      B.surf(fx, { shape: 'sphere', tess: 8, pos: p.add(V(0, 1.35, 0)), kind: 'glow', scale: 0.2, t0: t + 0.2, dur: L - 0.2, c0: C('#ffffff'), c1: col });
      const q = poles[(i + 1) % n]; const mid = Vector3.Lerp(p, q, 0.5).add(V(0, 2.4, 0));
      B.strip(fx, { kind: 'energy', maxPts: 17, width: 0.12, t0: t + 0.4, dur: L - 0.5, p: [6, 1, 0, 0], scroll: [i % 2 ? 6 : -6, 0], c0: C('#fff1d6'), c1: col, c2: i % 2 ? C('#ff4a3a') : C('#3a8bff'),
        lines: [{ pts: Array.from({ length: 17 }, (_, k) => { const u = k / 16; const a = p.add(V(0, 1.35, 0)); const b = q.add(V(0, 1.35, 0)); return Vector3.Lerp(Vector3.Lerp(a, mid, u), Vector3.Lerp(mid, b, u), u); }), w: 1 }] });
    });
    B.debris(fx, { pos: c, mode: 'hover', count: 12, mat: 'steel', size: [0.08, 0.2], r: fx.R * 0.7, y: [0.6, 2], t0: t, dur: L });
    B.decal(fx, { kind: 'hex', pos: c, r: fx.R, t0: t, dur: L, p: [6, 0, 0, 0], c1: C('#ffae69') });
    K.impact(fx, c, { t: t + 0.4, scale: 0.9 });
  },
  // Vector Chakram — a bladed steel chakram spins out on a vector, rebounds off the target and returns.
  'atlas/chakram'(fx) {
    K.gather(fx); const t = fx.T.ant; const out = Math.max(0.3, fx.T.travel + 0.1); const back = 0.45; const cur = fx.o.clone();
    const path = (lt) => { if (lt < out) cur.copyFrom(Vector3.Lerp(fx.o, fx.tgtH, easeOut(lt / out))); else { const u = clamp01((lt - out) / back); const p = Vector3.Lerp(fx.tgtH, fx.o, u * u); p.addInPlace(fx.side.scale(-Math.sin(u * Math.PI) * 1.6)); cur.copyFrom(p); } return cur; };
    B.solid(fx, { shape: 'torus', mat: 'metal', tint: C('#ffdf79'), thick: 0.12, size: 0.8, t0: t, dur: out + back, path, anim: (lt, u, m) => { m.rotation.set(0.15, lt * 30, 0); } });
    B.slash(fx, { pos: cur, dir: fx.dir, r: 0.5, arc: 6.2, width: 0.15, t0: t, dur: out + back, kind: 'glow', sweep: 0.02, c0: C('#fffbe8'), c1: fx.pal.glow, anim: (lt, u, m) => { m.position.copyFrom(cur); m.rotation.set(0.15, lt * 30, 0); } });
    B.trail(fx, { follow: () => cur, t0: t, dur: out + back + 0.2, width: 0.45, kind: 'energy', c0: C('#fffbe8'), c1: fx.pal.glow, c2: C('#ff9a3c') });
    B.emit(fx, 'spark', { follow: () => cur, t0: t, dur: out + back, rate: 30, r: 0.4, speed: [1, 3] });
    K.impact(fx, fx.tgt, { t: t + out, scale: 0.9 });
  },
  // Aegis Reversal — a mirrored shield snaps up; inbound force ripples reverse outward as a repulsor wave.
  'atlas/reversal'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = 2;
    B.dome(fx, { pos: c, r: fx.R, kind: 'hex', t0: t, dur: L, rise: 0.2, opacity: 0.85, c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#8fa6bd') });
    for (let k = 0; k < 3; k++) B.ring(fx, { pos: c, r0: fx.R * 1.5, r1: fx.R * 0.95, h: 1.6, t0: t + k * 0.18, dur: 0.3, kind: 'hex', c1: C('#c8f0ff') });
    B.ring(fx, { pos: c, r0: fx.R, r1: fx.R * 2.2, h: 1.2, t0: t + L * 0.6, dur: 0.5, c0: C('#ffffff'), c1: fx.pal.glow });
    B.emit(fx, 'spark', { pos: c.add(V(0, 1, 0)), t0: t + L * 0.6, burst: 80, shape: 'shell', r: fx.R, speed: [3, 8] });
    B.flash(fx, { pos: c.add(V(0, 1.4, 0)), t0: t + L * 0.6, size: 3, light: 5 });
    B.decal(fx, { kind: 'hex', pos: c, r: fx.R, t0: t, dur: L, p: [6, 0, 0, 0] });
    B.shake(fx, t + L * 0.6, 0.3, 0.3);
  },
  // Prism Refractor — a beam strikes a hovering prism and splits into a spread of refracted lances.
  'atlas/refractor'(fx) {
    K.gather(fx); const t = fx.T.ant; const pz = Vector3.Lerp(fx.o, fx.tgtH, 0.45).add(V(0, 0.5, 0)); const L = 0.9;
    B.solid(fx, { shape: 'cyl', tess: 3, mat: 'crystal', tint: fx.pal.glow, emissive: 0.7, size: V(0.6, 0.9, 0.6), pos: pz, t0: t - 0.15, dur: L + 0.3, spin: V(0, 3, 0) });
    B.beam(fx, { from: fx.o, to: pz, width: 0.3, t0: t, dur: L, grow: (lt) => clamp01(lt / 0.06) * 1.02, c0: C('#ffffff'), c1: fx.pal.glow });
    [-1, -0.5, 0, 0.5, 1].forEach((k, i) => {
      const to = fx.tgtH.add(fx.side.scale(k * 2)).add(V(0, (Math.abs(k) - 0.5) * 0.5, 0));
      B.beam(fx, { from: pz, to, width: 0.16, t0: t + 0.06, dur: L - 0.06, grow: (lt) => clamp01(lt / 0.08) * 1.02, c0: C('#ffffff'), c1: [C('#ff8a8a'), C('#ffe68a'), fx.pal.glow, C('#8affc4'), C('#b98cff')][i] });
      if (i % 2 === 0) K.impact(fx, fx.tgt.add(fx.side.scale(k * 2)), { t: t + 0.1, scale: 0.6, shake: i === 2 });
    });
    B.flash(fx, { pos: pz, t0: t + 0.05, size: 2.4, light: 4 });
  },
  // Railgun Lance — capacitor rings stack at the hand, then a hyper-velocity slug draws a white-hot line.
  'codex/railgun'(fx) {
    K.gather(fx, { size: 0.3 }); const t = fx.T.ant; const yaw = Math.atan2(fx.dir.x, fx.dir.z); const end = fx.o.add(fx.dir.scale(fx.ab.range ?? 26)); end.y = fx.tgtH.y;
    for (let i = 0; i < 4; i++) B.surf(fx, { shape: 'torus', thick: 0.05, pos: fx.o.add(fx.dir.scale(0.4 + i * 0.35)), kind: 'energy', scale: 0.01, rot: V(Math.PI / 2, yaw, 0), t0: t * (i / 5), dur: t - t * (i / 5) + 0.4, c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#155cff'),
      anim: (lt, u, m) => { m.scaling.setAll((0.5 - i * 0.07) * easeOut(lt / 0.15)); m.rotation.z = lt * 12; } });
    B.beam(fx, { from: fx.o, to: end, width: 0.16, t0: t, dur: 0.6, grow: (lt) => clamp01(lt / 0.03) * 1.02, c0: C('#ffffff'), c1: C('#ffffff'), fadeOut: 0.4 });
    B.beam(fx, { from: fx.o, to: end, width: 0.7, t0: t, dur: 1.1, grow: (lt) => clamp01(lt / 0.04) * 1.02, c0: C('#9ff6ff'), c1: fx.pal.glow, c2: C('#155cff'), fadeOut: 0.8 });
    for (let i = 0; i < 6; i++) { const p = Vector3.Lerp(fx.o, end, (i + 1) / 7); B.surf(fx, { shape: 'torus', thick: 0.03, pos: p, kind: 'energy', scale: 0.3, rot: V(Math.PI / 2, yaw, 0), t0: t + i * 0.015, dur: 0.5, c1: fx.pal.glow, anim: (lt, u, m) => m.scaling.setAll(0.3 + u * 1.2) }); }
    B.emit(fx, 'spark', { follow: () => Vector3.Lerp(fx.o, end, Math.random()), t0: t, dur: 0.2, rate: 300, r: 0.05, speed: [1, 4] });
    B.flash(fx, { pos: fx.o, t0: t, size: 2.5, light: 5 });
    K.impact(fx, fx.tgt, { t: t + 0.04, scale: 1.3 }); B.shake(fx, t, 0.45, 0.25);
  },
  // Orbital Strike — a red targeting lattice paints the zone; a lance from orbit erases it.
  'codex/orbital'(fx) {
    K.gather(fx); const c = fx.tgt; const t = fx.T.hit + 0.6;
    B.decal(fx, { kind: 'hex', pos: c, r: fx.R * 1.1, t0: 0, dur: t + 0.4, grow: [0, 1, t * 0.6], p: [6, 0, 0, 0], c1: fx.pal.glow, c0: C('#fff0d8') });
    B.decal(fx, { kind: 'telegraph', pos: c, r: fx.R, t0: 0, dur: t + 0.1, grow: [0, 1, t], c1: C('#ff2a2a') });
    B.beam(fx, { from: c.add(V(0, 40, 0)), to: c, width: 0.06, t0: fx.T.ant, dur: t - fx.T.ant, c0: C('#ffd6cf'), c1: C('#ff2a2a'), opacity: 0.8 });
    skyStrike(fx, c, t, { r: fx.R * 0.55, h: 30, dur: 0.8, c0: C('#ffffff'), c1: fx.pal.glow, scale: 1.8 });
    B.ring(fx, { pos: c, r0: 0.5, r1: fx.R * 2, h: 1.2, t0: t + 0.05, dur: 0.6, c0: C('#fff0d8'), c1: fx.pal.glow });
    B.emit(fx, 'smoke', { pos: c.add(V(0, 0.5, 0)), t0: t + 0.1, burst: 20, shape: 'disc', r: fx.R * 0.8, speed: [2, 5], colors: [C('#5a4a48'), C('#3a3030'), C('#1a1414')], alpha: 0.7, size: 2 });
    B.decal(fx, { kind: 'scorch', pos: c, r: fx.R * 1.2, t0: t + 0.05, dur: 2.5, p: [1, 1.4, 0, 0], c1: C('#ff5f5f'), c3: C('#120a0a') });
    B.shake(fx, t, 0.7, 0.5);
  },
};
