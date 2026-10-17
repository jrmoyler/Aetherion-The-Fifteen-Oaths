// COSMIC & GRAVITY — Tidal Observatory. Cast study reference-104 inset: dark orb, gravity lensing ring, debris burst.
import { B, K, V, C, life, along, polar, serpent, clamp01, easeOut, smooth, lerp } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

export default {
  // Astral Void Blast — a void sphere swallows light, then ruptures in a violet-gold shockwave.
  'linear-extended/astral'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt.add(V(0, 1.6, 0)); const t = fx.T.hit; const L = life(fx, 4.6) - 1; const boom = t + L * 0.55;
    B.surf(fx, { shape: 'sphere', tess: 20, pos: c, kind: 'smoke', scale: 0.01, t0: t, dur: boom - t + 0.1, p: [3, 3, 0, 1.2], c1: fx.pal.glow, c2: C('#2e1558'), c3: C('#05020c'), opacity: 0.95,
      anim: (lt, u, m) => m.scaling.setAll(1.3 * easeOut(lt / 0.5) * (1 - smooth((u - 0.85) / 0.15) * 0.8)) });
    B.surf(fx, { shape: 'torus', thick: 0.04, pos: c, kind: 'energy', scale: 2, rot: V(0.3, 0, 0.2), t0: t, dur: boom - t, c0: C('#ffe9b8'), c1: fx.pal.glow, anim: (lt, u, m) => { m.rotation.y = lt * 2; m.scaling.setAll(2.4 - u * 1.2); } });
    B.emit(fx, 'mote', { pos: c, t0: t, dur: boom - t, rate: 80, shape: 'shell', r: fx.R * 0.9, speed: [-6, -4], life: [0.4, 0.6], g: 0 });
    B.debris(fx, { pos: fx.tgt, mode: 'orbit', count: 12, mat: 'obsidian', emissive: 0.3, size: [0.15, 0.4], r: fx.R * 0.8, y: [0.6, 2.8], orbit: 3, t0: t, dur: boom - t, collapse: 0.4 });
    B.flash(fx, { pos: c, t0: boom, size: 5, light: 8, color: C('#ffb03a') });
    B.dome(fx, { pos: c, r: fx.R, full: true, kind: 'energy', t0: boom, dur: 0.6, rise: 0.25, c0: C('#ffe9b8'), c1: fx.pal.glow, c2: C('#3a1c72'), fadeOut: 0.4 });
    B.ring(fx, { pos: fx.tgt, r0: 0.5, r1: fx.R * 1.5, h: 0.6, t0: boom, dur: 0.6, c0: C('#ffe9b8'), c1: C('#ffb03a') });
    B.emit(fx, 'mote', { pos: c, t0: boom, burst: 100, r: 0.4, speed: [5, 12], c0: C('#ffe9b8'), c1: fx.pal.glow, c2: C('#3a1c72') });
    B.debris(fx, { pos: fx.tgt, mode: 'burst', count: 12, mat: 'obsidian', emissive: 0.3, size: [0.15, 0.4], power: 1.2, t0: boom, dur: 1.3 });
    K.impact(fx, fx.tgt, { t: boom, scale: 1.4 }); B.shake(fx, boom, 0.5, 0.45);
  },
  // Astral Tome — a star-chart tome opens over the target; constellation lines ignite and rain starlight.
  'casting/tome'(fx) {
    K.gather(fx); const c = fx.tgt; const t = fx.T.hit; const L = 3.4; const bk = c.add(V(0, 3.4, 0));
    const yaw = Math.atan2(fx.dir.x, fx.dir.z);
    for (const s of [-1, 1]) B.solid(fx, { shape: 'box', mat: 'metal', tint: fx.pal.glow, size: V(0.8, 0.06, 1.1), pos: bk, t0: t - 0.4, dur: L, anim: (lt, u, m) => { const open = easeOut(lt / 0.6) * 1.2; m.rotation.set(0, yaw, s * open); m.position.copyFrom(bk.add(V(Math.cos(yaw) * s * 0.4 * Math.cos(open), Math.sin(open) * 0.4, -Math.sin(yaw) * s * 0.4 * Math.cos(open)))); } });
    B.decal(fx, { kind: 'glyph', pos: c, r: fx.R, t0: t, dur: L, p: [20, 7, 0, 0], scroll: [0.15, 0], opacity: 0.85 });
    const stars = []; for (let i = 0; i < 7; i++) stars.push(polar(fx, c, (i / 7) * 6.28 + fx.rnd() * 0.5, fx.R * (0.3 + fx.rnd() * 0.6), 2 + fx.rnd() * 1.5));
    stars.forEach((s, i) => {
      B.flash(fx, { pos: s, t0: t + 0.2 + i * 0.1, size: 0.9, light: 0, n: 1, dur: 2.5 });
      B.surf(fx, { shape: 'sphere', tess: 8, pos: s, kind: 'glow', scale: 0.12, t0: t + 0.2 + i * 0.1, dur: L - 0.4, c0: C('#ffffff'), c1: fx.pal.glow });
      if (i) B.beam(fx, { from: stars[i - 1], to: s, width: 0.07, t0: t + 0.3 + i * 0.1, dur: L - 0.6, grow: (lt) => clamp01(lt / 0.2) * 1.02, c0: C('#ffffff'), c1: fx.pal.glow });
      B.beam(fx, { from: s, to: V(s.x, fx.gy(s), s.z), width: 0.18, t0: t + 1 + i * 0.12, dur: 0.4, grow: (lt) => clamp01(lt / 0.08) * 1.02, c0: C('#ffffff'), c1: C('#5ab6ff') });
    });
    B.emit(fx, 'mote', { pos: bk, t0: t, dur: L - 0.5, rate: 50, shape: 'sphere', r: 0.6, speed: [0.5, 2], c0: C('#ffffff'), c1: C('#cfe9ff'), c2: fx.pal.glow });
    K.impact(fx, c, { t: t + 1.1, scale: 1.1 });
  },
  // Astral Fang — a spectral star-wolf lunges down the line; twin fangs of light snap shut on the target.
  'casting/wolf'(fx) {
    K.gather(fx); const t = fx.T.ant; const dur = Math.max(0.35, fx.T.travel + 0.15); const from = fx.g.add(V(0, 0.9, 0)); const to = fx.tgt.add(V(0, 1, 0));
    serpent(fx, (lt) => { const u = easeOut(clamp01(lt / dur)); const p = Vector3.Lerp(from, to, u); p.y += Math.sin(u * Math.PI) * 1.2; return p; }, t, dur + 0.1, { kind: 'energy', width: 0.9, n: 22, taperPow: 0.5, parts: 'mote', rate: 80, c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#2f7dff') });
    const hit = t + dur;
    for (const s of [-1, 1]) B.slash(fx, { pos: to, dir: fx.dir, r: 1.1, arc: 1.8, width: 0.35, pitch: Math.PI / 2 * s * 0.8, tilt: Math.PI / 2, t0: hit - 0.05, dur: 0.35, kind: 'energy', sweep: 0.4, c0: C('#ffffff'), c1: C('#7febff'), reverse: s > 0 });
    B.emit(fx, 'mote', { pos: to, t0: hit, burst: 60, r: 0.3, speed: [3, 8], c0: C('#ffffff'), c1: C('#7febff'), c2: C('#0a2a72') });
    K.impact(fx, fx.tgt, { t: hit, scale: 1.1 });
  },
  // Graviton Collapse — a gravity well forms: debris spirals in, space lenses, and it all collapses to a point.
  'collective/graviton'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 2.2) + 0.6; const core = c.add(V(0, 1.4, 0));
    B.decal(fx, { kind: 'spiral', pos: c, r: fx.R * 1.2, t0: t - 0.1, dur: L + 0.4, p: [4, 1.6, 0, 0], scroll: [3, 8], c2: C('#000000'), opacity: 0.85 });
    B.surf(fx, { shape: 'sphere', tess: 16, pos: core, kind: 'smoke', scale: 0.01, t0: t, dur: L, c1: C('#ff8ad8'), c2: C('#000000'), c3: C('#000000'), opacity: 1, p: [2, 2, 0, 1], anim: (lt, u, m) => m.scaling.setAll(0.6 * easeOut(lt / 0.4) * (1 - smooth((u - 0.9) / 0.1))) });
    B.surf(fx, { shape: 'torus', thick: 0.06, pos: core, kind: 'energy', scale: 1.2, rot: V(1.2, 0, 0.3), t0: t, dur: L, c0: C('#fff4ec'), c1: fx.pal.glow, anim: (lt, u, m) => { m.rotation.y = lt * 5; m.scaling.setAll(1.3 * (1 - u * 0.6)); } });
    B.debris(fx, { pos: c, mode: 'orbit', count: 18, mat: 'rock', size: [0.12, 0.35], r: fx.R * 0.9, y: [0.4, 2.6], orbit: 3.5, t0: t, dur: L, collapse: 0.3 });
    B.emit(fx, 'mote', { pos: core, t0: t, dur: L, rate: 70, shape: 'shell', r: fx.R, speed: [-5, -3], life: [0.5, 0.7], g: 0 });
    B.emit(fx, 'dust', { pos: c.add(V(0, 0.2, 0)), t0: t, dur: L * 0.8, rate: 10, shape: 'shell', r: fx.R, speed: [-3, -2], colors: [C('#5a4a6a'), C('#3a2a4a'), C('#1a1020')], alpha: 0.6 });
    B.flash(fx, { pos: core, t0: t + L, size: 3, light: 6, color: fx.pal.glow });
    B.ring(fx, { pos: c, r0: fx.R * 1.2, r1: 0.2, h: 0.6, t0: t + L - 0.3, dur: 0.3 });
    K.impact(fx, c, { t: t + L, scale: 1.2 }); B.shake(fx, t + L, 0.45, 0.35);
  },
  // Nebula Collapse — a swirl of pink-teal nebula gas condenses into a newborn star that flares.
  'codex/nebula'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt.add(V(0, 1.5, 0)); const t = fx.T.hit; const L = life(fx, 1.8) + 1;
    const NEB = [[C('#ff6fbf'), C('#8a4dff'), C('#1a0a30')], [C('#2fd6c8'), C('#4f6dff'), C('#0a1430')], [C('#c18cff'), C('#ff6fbf'), C('#120820')]];
    NEB.forEach((cols, i) => B.emit(fx, 'mist', { pos: c, t0: t + i * 0.08, dur: L * 0.75, rate: 10, shape: 'shell', r: fx.R * (0.9 - i * 0.15), speed: [-1.6, -1], life: [1.2, 1.8], size: 2.2, colors: cols, alpha: 0.8 }));
    B.vortex(fx, { pos: fx.tgt, r0: fx.R * 0.2, r1: fx.R * 0.9, h: 3, y: 0.2, t0: t, dur: L * 0.8, kind: 'energy', spin: 2.5, opacity: 0.5, c0: C('#fff2d6'), c1: C('#c18cff'), c2: C('#2fd6c8'), p: [3, 2, 0, 1.5] });
    B.emit(fx, 'mote', { pos: c, t0: t, dur: L * 0.8, rate: 80, shape: 'shell', r: fx.R, speed: [-4, -2.5], life: [0.6, 0.9], g: 0, c0: C('#ffffff'), c1: C('#e8f4ff'), c2: C('#c18cff') });
    const flare = t + L * 0.8;
    B.surf(fx, { shape: 'sphere', tess: 14, pos: c, kind: 'glow', scale: 0.01, t0: t + 0.3, dur: flare - t - 0.2, c0: C('#ffffff'), c1: C('#fff2d6'), anim: (lt, u, m) => m.scaling.setAll(0.5 * easeOut(u)) });
    B.flash(fx, { pos: c, t0: flare, size: 6, light: 8, color: C('#fff2d6') });
    B.ring(fx, { pos: fx.tgt, r0: 0.4, r1: fx.R * 1.4, h: 0.5, t0: flare, dur: 0.5, c0: C('#ffffff'), c1: C('#ff6fbf') });
    B.emit(fx, 'mote', { pos: c, t0: flare, burst: 120, r: 0.3, speed: [5, 12], c0: C('#ffffff'), c1: C('#2fd6c8'), c2: C('#ff6fbf') });
    K.impact(fx, fx.tgt, { t: flare, scale: 1.3 });
  },
};
