// FIRE — Kiln Oath. Sheets reference-021..030. Palette: core #fff1c8, mid #ff8a1e, edge #ff360a, deep #050201, char #4b4541.
import { B, K, V, C, life, fade, along, polar, meteor, serpent, whip, portal, clamp01, easeOut, smooth, lerp } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

const ASH = [C('#4a3a30'), C('#2a2220'), C('#141010')];

export default {
  // 030 Cinder Fall — a line of cinders rains down from caster to target, last one heaviest.
  'linear/meteor'(fx) {
    K.gather(fx); B.telegraph(fx, { pos: fx.tgt, r: 1.6 });
    const n = 4;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n; const to = along(fx, 0.35 + k * 0.65); const t0 = fx.T.ant + i * 0.12;
      const from = to.add(V(-fx.dir.x * 3 + (fx.rnd() - 0.5), 9 + fx.rnd() * 2, -fx.dir.z * 3));
      meteor(fx, from, to, t0, 0.42, { size: i === n - 1 ? 0.75 : 0.35, impactScale: i === n - 1 ? 1.2 : 0.55, shake: i === n - 1 });
      B.decal(fx, { kind: 'lava', pos: to, r: i === n - 1 ? 1.8 : 0.9, t0: t0 + 0.42, dur: life(fx, 2.2) + 0.6, p: [3, 1, 0, 0], opacity: 0.9 });
    }
  },
  // 029 Pyre Crown — a crown of flame pillars rises around the target, then folds into a pyre.
  'linear-ext/pyre'(fx) {
    K.gather(fx); B.telegraph(fx);
    const n = 9; const t1 = fx.T.hit; const L = life(fx, 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2; const p = polar(fx, fx.tgt, a, fx.R * 0.85);
      B.column(fx, { pos: p, r: 0.45, h: 3.2 + fx.rnd() * 1.5, kind: 'fire', t0: t1 + i * 0.04, dur: L * 0.75, rise: 0.25, p: [2, 3, 0, 1], scroll: [0, 1.6], fadeOut: 0.6 });
      B.emit(fx, 'ember', { pos: p.add(V(0, 0.3, 0)), t0: t1 + i * 0.04, dur: L * 0.6, rate: 14, r: 0.3, speed: [1, 3] });
    }
    B.column(fx, { pos: fx.tgt, r: fx.R * 0.4, h: 5, kind: 'fire', t0: t1 + 0.6, dur: L * 0.5, rise: 0.4, p: [3, 3, 0, 1], scroll: [0, 2] });
    K.impact(fx, fx.tgt, { scale: 1.3 }); K.linger(fx, fx.tgt, { dur: L * 0.8 });
    B.ring(fx, { pos: fx.tgt, r0: 0.4, r1: fx.R * 1.2, h: 0.6, t0: t1, dur: 0.5 });
  },
  // 028 Fire Portal — a vertical ring of fire opens over the target and vomits flame onto it.
  'linear-ext/firePortal'(fx) {
    K.gather(fx);
    const c = fx.tgt.add(V(0, 3.4, 0)).subtract(fx.dir.scale(1.2)); const L = 3.2;
    portal(fx, c, 1.9, fx.T.ant * 0.6, L, { kind: 'fire', inner: 'spiral', thick: 0.3 });
    for (let i = 0; i < 4; i++) {
      const to = polar(fx, fx.tgt, fx.rnd() * 6.28, fx.rnd() * fx.R * 0.7);
      K.projectile(fx, { from: c, to, t0: fx.T.hit + 0.25 + i * 0.32, dur: 0.28, size: 0.4, light: false });
      K.impact(fx, to, { t: fx.T.hit + 0.53 + i * 0.32, scale: 0.8, shake: i === 0 });
    }
    B.emit(fx, 'flame', { pos: c, t0: fx.T.hit + 0.2, dur: 1.4, rate: 60, shape: 'dir', dir: fx.tgtH.subtract(c), spread: 0.25, speed: [4, 7], size: 0.9, g: -2 });
    K.linger(fx, fx.tgt, { t0: fx.T.hit + 0.5, dur: 2 });
  },
  // 027 Fire Boost — the caster ignites: flame aura, heat ring and rising embers.
  'linear-ext/fire'(fx) {
    const f = () => fx.caster?.position ?? fx.g; const t = 0.2;
    K.gather(fx, { dur: 0.2, circle: false });
    B.column(fx, { pos: fx.g, r: 0.75, h: 2.6, kind: 'fire', t0: t, dur: 2.4, rise: 0.15, p: [2, 2.5, 0, 1], scroll: [0, 2], anim: undefined });
    B.ring(fx, { pos: fx.g, r0: 0.4, r1: 3.5, h: 0.5, t0: t, dur: 0.5 });
    B.decal(fx, { kind: 'lava', pos: fx.g, r: 1.6, t0: t, dur: 2.6, p: [3, 1, 0, 0] });
    B.emit(fx, 'ember', { follow: () => f().add(V(0, 0.8, 0)), t0: t, dur: 2.4, rate: 60, shape: 'sphere', r: 0.5, speed: [1, 3], g: 3 });
    B.emit(fx, 'flame', { follow: () => f().add(V(0, 0.4, 0)), t0: t, dur: 2.2, rate: 24, shape: 'disc', r: 0.4, speed: [1, 2], size: 0.6 });
    B.flash(fx, { pos: fx.g.add(V(0, 1, 0)), t0: t, size: 3, light: 6 });
    B.light(fx, { pos: () => f().add(V(0, 1.2, 0)), t0: t, dur: 2.4, intensity: 2.5, range: 6, flicker: true, env: (lt, u) => 1 - smooth((u - 0.8) / 0.2) });
    B.shake(fx, t, 0.2, 0.3);
  },
  // 026 Volcanic Ward — basalt columns erupt in a ring, lava seeps between them, heat shimmer dome.
  'linear-extended/ward'(fx) {
    K.gather(fx); B.telegraph(fx); const L = life(fx, 5.2);
    B.spikes(fx, { layout: 'ring', shape: 'column', mat: 'basalt', emissive: 0.18, count: 16, h: [1.6, 2.8], w: [0.7, 1.0], r: fx.R, t0: fx.T.hit, dur: L, rise: 0.22, sweep: 0.4, lean: 0.08, overshoot: false, sinkAt: 0.85 });
    B.decal(fx, { kind: 'lava', pos: fx.tgt, r: fx.R * 1.1, t0: fx.T.hit - 0.1, dur: L + 0.5, p: [2.5, 1.2, 0, 0] });
    B.dome(fx, { pos: fx.tgt, r: fx.R * 0.95, kind: 'energy', t0: fx.T.hit + 0.35, dur: L - 0.4, opacity: 0.35, p: [3, 2, 0, 2.5], c1: fx.pal.glow, c2: fx.pal.edge });
    B.emit(fx, 'ember', { pos: fx.tgt.add(V(0, 0.2, 0)), t0: fx.T.hit, dur: L * 0.8, rate: 60, shape: 'disc', r: fx.R, speed: [1, 3] });
    B.emit(fx, 'smoke', { pos: fx.tgt.add(V(0, 1, 0)), t0: fx.T.hit, dur: L * 0.7, rate: 8, shape: 'disc', r: fx.R, colors: ASH, alpha: 0.6 });
    K.impact(fx, fx.tgt, { scale: 1.2 });
  },
  // 025 Serpent Tide Field — flame serpents swim through a burning field.
  'handcast/phoenix'(fx) {
    K.gather(fx); B.telegraph(fx); const L = Math.min(6, life(fx, 6));
    K.linger(fx, fx.tgt, { dur: L });
    for (let i = 0; i < 3; i++) {
      const ph = i * 2.1; const rr = fx.R * (0.45 + i * 0.18); const c = fx.tgt;
      serpent(fx, (lt) => { const a = ph + lt * (1.6 - i * 0.2); return V(c.x + Math.cos(a) * rr, fx.gy(c) + 0.5 + Math.abs(Math.sin(lt * 3 + ph)) * 1.2, c.z + Math.sin(a) * rr * 0.85); },
        fx.T.hit + i * 0.2, L - 0.4, { kind: 'flame', width: 0.65, n: 28, parts: 'ember', rate: 30 });
    }
    K.impact(fx, fx.tgt, { scale: 1.2 });
  },
  // 024 Dragonfire Circle — portal overhead, dragon arrives, breathes a ring of fire that becomes a wall, fades to ash.
  'casting/dragon'(fx) {
    K.gather(fx);
    const c = fx.tgt; const R = fx.R; const t1 = fx.T.ant + 0.2; const arrive = 1.1; const trace = 2.4; const hold = 2; const fd = 2.2;
    B.decal(fx, { kind: 'telegraph', pos: c, r: R, t0: 0, dur: t1 + arrive + trace, grow: [0.05, 1, t1], opacity: 0.6 });
    portal(fx, c.add(V(0, 8, 0)), 3.2, t1, arrive + 0.8, { kind: 'fire', flat: true, inner: 'spiral', thick: 0.35 });
    const alt = 3.6; const head = V();
    const dpath = (lt) => {
      if (lt < arrive) { const u = easeOut(lt / arrive); return Vector3.Lerp(c.add(V(0, 8, 0)), c.add(V(R, alt, 0)), u); }
      if (lt < arrive + trace) { const a = ((lt - arrive) / trace) * Math.PI * 2; return V(c.x + Math.cos(a) * R * 1.05, fx.gy(c) + alt, c.z + Math.sin(a) * R * 1.05); }
      const u = (lt - arrive - trace) / hold; return V(c.x + R * (1 + u * 2), fx.gy(c) + alt + u * 9, c.z + u * 3);
    };
    const tot = arrive + trace + hold;
    serpent(fx, (lt) => head.copyFrom(dpath(lt)), t1, tot, { kind: 'flame', width: 0.8, n: 18, taperPow: 0.45, parts: 'ember', rate: 40, p: [14, 6, 1, 0], scroll: [8, 0] });
    B.solid(fx, { mat: 'lava', size: V(0.5, 0.45, 0.9), t0: t1, dur: tot, path: () => head, emissive: 0.4, anim: (lt, u, m) => { m.rotation.y = Math.atan2(head.x - c.x, head.z - c.z) + Math.PI / 2; } });
    // wings: two crescents riding with the head
    for (const s of [-1, 1]) {
      B.slash(fx, { pos: head, r: 2.0, arc: 1.4, width: 0.9, kind: 'fire', t0: t1, dur: tot, sweep: 0.2, fadeOut: 0.5, p: [1, 2, 0, 1], scroll: [0, 1.5],
        anim: (lt, u, m) => { m.position.copyFrom(head); m.rotation.set(0.9 * s + Math.sin(lt * 7) * 0.4 * s, Math.atan2(head.x - c.x, head.z - c.z) + s * Math.PI / 2, 0); } });
    }
    // breath cone traces the ring
    B.strip(fx, { kind: 'flame', maxPts: 12, width: 1.0, p: [3, 1, 1, 0], scroll: [10, 0], t0: t1 + arrive, dur: trace, fadeIn: 0.1, fadeOut: 0.2,
      lines: () => { const pts = []; const g = V(head.x, fx.gy(head), head.z); for (let i = 0; i <= 10; i++) pts.push(Vector3.Lerp(head, g, i / 10)); return [{ pts, w: (i, n) => 0.3 + (i / (n - 1)) * 1.2 }]; } });
    const nSeg = 18;
    for (let i = 0; i < nSeg; i++) {
      const a = (i / nSeg) * Math.PI * 2; const p = polar(fx, c, a, R); const ti = t1 + arrive + (i / nSeg) * trace;
      B.emit(fx, 'flame', { pos: p.add(V(0, 0.3, 0)), t0: ti, dur: hold + trace - (i / nSeg) * trace + 0.6, rate: 10, r: 0.5, speed: [1.5, 3], size: 1.0 });
      if (i % 3 === 0) B.emit(fx, 'smoke', { pos: p.add(V(0, 2, 0)), t0: ti, dur: hold + 2, rate: 2, r: 0.5, colors: ASH, alpha: 0.6, size: 1.8 });
    }
    B.column(fx, { pos: c, r: R, h: 2.6, kind: 'fire', t0: t1 + arrive + trace * 0.95, dur: hold + 1.4, rise: 0.3, p: [14, 2.2, 1, 1], scroll: [0, 1.4], fadeOut: 1.0 });
    B.decal(fx, { kind: 'lava', pos: c, r: R * 1.15, t0: t1 + arrive, dur: trace + hold + fd, grow: [0.2, 1, trace], p: [2.5, 1, 0, 0] });
    B.decal(fx, { kind: 'scorch', pos: c, r: R * 1.2, t0: t1 + arrive + trace, dur: hold + fd, p: [1, 0.6, 0, 0], c3: C('#141010'), opacity: 0.8 });
    B.light(fx, { pos: c.add(V(0, 1.5, 0)), t0: t1 + arrive, dur: trace + hold + 1, intensity: 6, range: R * 4, flicker: true, env: (lt, u) => Math.min(1, lt / 0.5) * (1 - smooth((u - 0.75) / 0.25)), pri: 2 });
    B.shake(fx, t1 + arrive, 0.35, 0.6);
  },
  // 023 Meteor Swarm — a dozen burning rocks streak in at an angle and carpet the zone.
  'collective/swarm'(fx) {
    K.gather(fx); B.telegraph(fx);
    const n = 9; const L = life(fx, 2);
    for (let i = 0; i < n; i++) {
      const to = polar(fx, fx.tgt, fx.rnd() * 6.28, Math.sqrt(fx.rnd()) * fx.R); const t0 = fx.T.ant + i * 0.13 + fx.rnd() * 0.05;
      const from = to.add(V(-fx.dir.x * 6 + fx.side.x * (fx.rnd() - 0.5) * 3, 12, -fx.dir.z * 6 + fx.side.z * (fx.rnd() - 0.5) * 3));
      meteor(fx, from, to, t0, 0.5, { size: 0.3 + fx.rnd() * 0.3, impactScale: 0.6, shake: i % 3 === 0 });
    }
    K.linger(fx, fx.tgt, { t0: fx.T.ant + 0.5, dur: L + 1 });
  },
  // 022 Emberveil Lattice — a lattice of fire threads weaves over the zone, nodes flare, the veil rises.
  'matrix-new/emberveil'(fx) {
    K.gather(fx); B.telegraph(fx); const L = life(fx, 3.2); const c = fx.tgt; const R = fx.R;
    const lines = []; const n = 5;
    for (let s = -1; s <= 1; s += 2) for (let i = 0; i < n; i++) {
      const off = (i / (n - 1) - 0.5) * 2 * R * 0.8; const d = V(Math.cos(0.785 * s), 0, Math.sin(0.785 * s)); const nrm = V(-d.z, 0, d.x);
      const half = Math.sqrt(Math.max(0.1, R * R - off * off));
      const a = c.add(nrm.scale(off)).add(d.scale(-half)); const b = c.add(nrm.scale(off)).add(d.scale(half));
      const pts = []; for (let k = 0; k <= 12; k++) { const p = Vector3.Lerp(a, b, k / 12); p.y = fx.gy(p) + 0.08 + Math.sin(k / 12 * Math.PI) * 0.15; pts.push(p); }
      lines.push({ pts, w: 1 });
    }
    B.strip(fx, { kind: 'flame', maxPts: lines.length * 13 + 2, width: 0.32, p: [3, 1, 0.3, 0], scroll: [3, 0], t0: fx.T.hit, dur: L, fadeOut: 0.6, lines, grow: (lt) => clamp01(lt / 0.5) * 1.02 });
    for (let i = 0; i < 7; i++) { const p = polar(fx, c, fx.rnd() * 6.28, fx.rnd() * R * 0.8, 0.2); B.flash(fx, { pos: p, t0: fx.T.hit + 0.4 + i * 0.08, size: 1.2, light: 1.5, n: 1 }); B.emit(fx, 'flame', { pos: p, t0: fx.T.hit + 0.4 + i * 0.08, burst: 8, r: 0.2, speed: [1, 3], size: 0.6 }); }
    B.column(fx, { pos: c, r: R, h: 3, kind: 'fire', t0: fx.T.hit + 0.6, dur: L - 0.6, rise: 0.5, opacity: 0.55, p: [12, 1.4, 0, 1], scroll: [0, 0.9] });
    K.linger(fx, c, { t0: fx.T.hit, dur: L });
  },
  // 021 Solar Lash — a whip of solar flame cracks forward; flare at the tip.
  'codex/solarlash'(fx) {
    K.gather(fx); K.release(fx);
    whip(fx, { kind: 'flame', width: 0.55, amp: 1.4, c0: C('#ffffff'), c1: fx.pal.glow, c2: C('#ff9a2e'), c3: C('#3a1404') });
    whip(fx, { kind: 'energy', width: 0.16, amp: 1.4, c0: C('#ffffff'), c1: C('#fff1a8'), c2: fx.pal.glow });
    B.emit(fx, 'ember', { pos: fx.tgtH, t0: fx.T.hit, burst: 50, shape: 'dir', dir: fx.dir, spread: 0.7, speed: [3, 9] });
    B.flash(fx, { pos: fx.tgtH, t0: fx.T.hit, size: 3.2, light: 6, color: C('#ffd27a') });
    K.impact(fx, fx.tgt, { scale: 1 });
    B.ring(fx, { pos: fx.tgtH, y: fx.tgtH.y - 0.3, r0: 0.2, r1: 2.2, h: 0.6, t0: fx.T.hit, dur: 0.35 });
  },
};
