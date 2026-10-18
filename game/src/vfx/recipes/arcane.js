// ARCANE & ILLUSION — Folded Theatre. Cast study reference-111: glyph rings, mirror shards, violet-cyan light.
import { B, K, V, C, life, along, polar, volley, clamp01, easeOut, smooth } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

export default {
  // Magic Boost — a turning glyph circle beneath the caster, orbiting runes and a violet aura.
  'linear-ext/magic'(fx) {
    const f = () => (fx.caster?.position ?? fx.g); const t = 0.2; const L = 2.6;
    K.gather(fx, { dur: t, circle: false });
    B.decal(fx, { kind: 'glyph', pos: fx.g, r: 1.8, t0: 0, dur: L, p: [14, 6, 0, 0], scroll: [0.8, 0] });
    B.column(fx, { pos: fx.g, r: 0.8, h: 2.8, t0: t, dur: L - 0.2, kind: 'energy', p: [3, 3, 0, 2], scroll: [0.2, -1.5], opacity: 0.55 });
    for (let i = 0; i < 3; i++) B.decal(fx, { kind: 'glyph', pos: fx.g, r: 0.45, vertical: true, yaw: 0, t0: t, dur: L - 0.2, p: [8, 0, 0, 0], opacity: 0.9,
      anim: (lt, u, m) => { const a = lt * 2.4 + i * 2.09; const p = f(); m.position.set(p.x + Math.cos(a) * 1.1, p.y + 1.2 + Math.sin(lt * 3 + i) * 0.2, p.z + Math.sin(a) * 1.1); m.rotation.y = -a + Math.PI / 2; } });
    B.ring(fx, { pos: fx.g, r0: 0.3, r1: 3, h: 0.4, t0: t, dur: 0.45 });
    B.emit(fx, 'mote', { follow: () => f().add(V(0, 1, 0)), t0: t, dur: L - 0.2, rate: 40, r: 0.6, speed: [0.5, 2], g: 1.5 });
    B.flash(fx, { pos: fx.g.add(V(0, 1, 0)), t0: t, size: 2.4, light: 4 });
  },
  // Baleful Cascade — a glyph opens in the sky over the target and pours a cascade of cyan arcana down.
  'linear-extended/cascade'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = Math.min(5, life(fx, 7) - 2); const top = c.add(V(0, 7, 0));
    B.decal(fx, { kind: 'glyph', pos: top, r: fx.R * 0.9, lift: 7, t0: t - 0.3, dur: L + 0.3, p: [14, 6, 0, 0], scroll: [0.4, 0], c0: C('#ffffff'), c1: fx.pal.glow, opacity: 0.9 });
    B.decal(fx, { kind: 'glyph', pos: c, r: fx.R, t0: t, dur: L, p: [16, 5, 0, 0], scroll: [-0.3, 0] });
    for (let i = 0; i < 14; i++) {
      const p = polar(fx, c, fx.rnd() * 6.28, Math.sqrt(fx.rnd()) * fx.R * 0.85); const ti = t + i * (L * 0.7 / 14);
      B.beam(fx, { from: V(p.x, top.y, p.z), to: p, width: 0.22, t0: ti, dur: 0.45, grow: (lt) => clamp01(lt / 0.12) * 1.02, tail: (lt) => clamp01((lt - 0.15) / 0.25), c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#2ecfc4') });
      if (i % 2 === 0) K.impact(fx, p, { t: ti + 0.12, scale: 0.45, shake: i === 0 });
    }
    B.emit(fx, 'mote', { pos: top, t0: t, dur: L, rate: 60, shape: 'disc', r: fx.R * 0.8, speed: [2, 5], g: -6, c0: C('#ffffff'), c1: C('#a8fff0'), c2: C('#2ecfc4') });
  },
  // Aetherblade Cascade — a fan of spectral blades materialises behind the caster and lances out in sequence.
  'matrix-new/aetherblade'(fx) {
    K.gather(fx); const n = 7; const t = fx.T.ant; const yaw = Math.atan2(fx.dir.x, fx.dir.z);
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1) - 0.5; const home = fx.g.add(V(0, 2.1 + Math.abs(k) * -0.8, 0)).add(fx.side.scale(k * 3)).subtract(fx.dir.scale(0.6));
      const to = fx.tgtH.add(fx.side.scale(k * 0.8)); const tf = t + 0.25 + i * 0.07; const fl = Math.max(0.2, fx.T.travel); const cur = home.clone();
      B.solid(fx, { shape: 'box', mat: 'glass', tint: fx.pal.glow, emissive: 0.9, size: V(0.12, 0.05, 1.5), t0: t, dur: tf - t + fl,
        path: (lt) => { const u = clamp01((lt - (tf - t)) / fl); cur.copyFrom(Vector3.Lerp(home, to, u * u)); return cur; }, anim: (lt, u, m) => { m.rotation.set(0, yaw, 0); m.scaling.z = 1.5 * easeOut(lt / 0.2); } });
      B.trail(fx, { follow: () => cur, t0: tf, dur: fl + 0.2, width: 0.25, kind: 'energy', c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#c8a8ff') });
      if (i % 2 === 0) K.impact(fx, fx.tgt.add(fx.side.scale(k * 0.8)), { t: tf + fl, scale: 0.5, shake: i === 0 });
    }
    B.decal(fx, { kind: 'glyph', pos: fx.g, r: 2.2, t0: 0, dur: t + 1, p: [12, 7, 0, 0], scroll: [0.6, 0] });
  },
  // Mirage Construct — mirror shards spiral together into a shimmering illusory figure, then shatter.
  'matrix-new/mirage'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 4);
    B.debris(fx, { pos: c, mode: 'orbit', shape: 'shardFlat', count: 22, mat: 'glass', tint: fx.pal.glow, emissive: 0.4, size: [0.25, 0.55], r: 1.4, y: [0.3, 2.6], orbit: 1.8, t0: t, dur: L, collapse: 0.4 });
    B.surf(fx, { shape: 'sphere', tess: 16, pos: c.add(V(0, 1.2, 0)), kind: 'energy', scale: V(0.5, 1.1, 0.5), t0: t + 0.6, dur: L - 0.8, opacity: 0.7, c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#ff5ad0'), p: [4, 4, 0, 1.4] });
    B.dome(fx, { pos: c, r: fx.R * 0.9, kind: 'energy', t0: t, dur: L, opacity: 0.3, c1: C('#a8d8ff'), c2: C('#ff5ad0') });
    B.decal(fx, { kind: 'glyph', pos: c, r: fx.R, t0: t, dur: L, p: [10, 6, 0, 0], scroll: [0.5, 0] });
    B.emit(fx, 'mote', { pos: c.add(V(0, 1.2, 0)), t0: t, dur: L, rate: 30, r: 1, speed: [0.3, 1] });
    B.emit(fx, 'shard', { pos: c.add(V(0, 1.2, 0)), t0: t + L - 0.3, burst: 60, r: 0.8, speed: [3, 8], c0: C('#ffffff'), c1: C('#e8f4ff'), c2: C('#ff5ad0') });
    B.flash(fx, { pos: c.add(V(0, 1.2, 0)), t0: t + L - 0.3, size: 3, light: 4 });
  },
  // Hall of Echoes — a ring of standing glyph mirrors rises; echo rings ricochet between them.
  'atlas/echoes'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 3.4); const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28; const p = polar(fx, c, a, fx.R * 0.85, 1.3);
      B.decal(fx, { kind: 'glyph', pos: p, r: 1.1, vertical: true, yaw: -a + Math.PI / 2, t0: t + i * 0.06, dur: L, grow: [0, 1, 0.3], p: [10, 4, 0, 0], scroll: [1, 0], opacity: 0.95 });
      B.beam(fx, { from: p, to: polar(fx, c, a + 6.28 / n * 2, fx.R * 0.85, 1.3), width: 0.08, t0: t + 0.3 + i * 0.1, dur: L - 0.5, grow: (lt) => clamp01(lt / 0.2) * 1.02, c0: C('#ffffff'), c1: fx.pal.glow });
    }
    for (let k = 0; k < 4; k++) B.ring(fx, { pos: c, r0: fx.R * 0.85, r1: 0.3, h: 1.6, t0: t + 0.4 + k * 0.6, dur: 0.55, c0: C('#ffd2ff'), c1: fx.pal.glow });
    B.decal(fx, { kind: 'glyph', pos: c, r: fx.R, t0: t, dur: L, p: [16, 6, 0, 0], scroll: [0.3, 0] });
    B.emit(fx, 'mote', { pos: c.add(V(0, 1.2, 0)), t0: t, dur: L, rate: 40, shape: 'shell', r: fx.R * 0.8, speed: [0.2, 0.6] });
    K.impact(fx, c, { t: t + 0.4, scale: 0.9 });
  },
  // Glyph Barrage — a volley of spinning glyph sigils arc down the line and burst on contact.
  'codex/glyphs'(fx) {
    K.gather(fx); const n = 6; const t = fx.T.ant; const fl = Math.max(0.6, Math.min(1.6, fx.dist / 14));
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1) - 0.5; const ti = t + i * 0.1; const from = fx.o.add(fx.side.scale(k * 1.4)).add(V(0, Math.abs(k), 0)); const to = fx.tgtH.add(fx.side.scale(k * 0.6)); const cur = from.clone();
      const yaw = Math.atan2(fx.dir.x, fx.dir.z);
      B.decal(fx, { kind: 'glyph', pos: from, r: 0.42, vertical: true, yaw, t0: ti, dur: fl, grow: [1, 1, 0.01], p: [8, 5, 0, 0], scroll: [3, 0], fadeIn: 0.05, fadeOut: 0.05,
        anim: (lt, u, m) => { const p = Vector3.Lerp(from, to, u); p.y += Math.sin(u * Math.PI) * 1.2; cur.copyFrom(p); m.position.copyFrom(p); } });
      B.trail(fx, { follow: () => cur, t0: ti, dur: fl + 0.2, width: 0.2, kind: 'energy' });
      if (i % 2 === 0) K.impact(fx, fx.tgt.add(fx.side.scale(k * 0.6)), { t: ti + fl, scale: 0.55, shake: i === 0 });
    }
  },
};
