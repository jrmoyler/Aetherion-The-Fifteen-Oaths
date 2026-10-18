// BLOOD — Sanguine Covenant. Cast study reference-110: arterial reds, dark clots, ribbons and thorned roots.
import { B, K, V, C, life, fade, along, polar, serpent, clamp01, easeOut, smooth } from './h.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

const BLOOD = { c0: C('#ffb9bf'), c1: C('#ff2d55'), c2: C('#6e0512'), c3: C('#26010a') };

export default {
  // Shimmering Flux — a shimmering ribbon of blood streams from the hand, braided with a bright filament.
  'handcast/flux'(fx) {
    K.gather(fx); K.release(fx); const t = fx.T.ant; const L = 1.2;
    for (let k = 0; k < 2; k++) {
      B.strip(fx, { kind: 'liquid', maxPts: 33, width: 0.32 - k * 0.12, p: [4, 1, 0, 0], scroll: [10, 0], t0: t, dur: L, fadeOut: fade(fx, 1.1) * 0.4, ...BLOOD,
        grow: (lt) => clamp01(lt / Math.max(0.1, fx.T.travel)) * 1.02,
        lines: (lt) => { const pts = []; for (let i = 0; i <= 32; i++) { const u = i / 32; const p = Vector3.Lerp(fx.o, fx.tgtH, u); const w = Math.sin(u * Math.PI) * 0.45; p.addInPlace(fx.side.scale(Math.sin(u * 10 + lt * 12 + k * 3.1) * w)); p.y += Math.cos(u * 10 + lt * 12 + k * 3.1) * w * 0.6; pts.push(p); } return [{ pts, w: 1 }]; } });
    }
    B.beam(fx, { from: fx.o, to: fx.tgtH, width: 0.08, t0: t, dur: L, grow: (lt) => clamp01(lt / Math.max(0.1, fx.T.travel)) * 1.02, c0: C('#ffffff'), c1: C('#ffbccd') });
    B.emit(fx, 'drip', { follow: () => Vector3.Lerp(fx.o, fx.tgtH, Math.random()), t0: t, dur: L, rate: 60, r: 0.2, speed: [0.2, 1], c0: BLOOD.c0, c1: BLOOD.c1, c2: BLOOD.c2 });
    K.impact(fx, fx.tgt, { scale: 1 });
  },
  // Crimson Rite — a blood circle is drawn; pillars of blood geyser up from its sigils.
  'collective/crimson'(fx) {
    K.gather(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 2.2) + 1;
    B.decal(fx, { kind: 'glyph', pos: c, r: fx.R * 1.1, t0: 0, dur: t + L, grow: [0, 1, t], p: [12, 5, 0, 0], scroll: [0.3, 0], c0: C('#ffb08a'), c1: C('#ff2f4f') });
    B.decal(fx, { kind: 'wash', pos: c, r: fx.R, t0: t, dur: L + 0.8, ...BLOOD });
    for (let i = 0; i < 5; i++) {
      const p = polar(fx, c, (i / 5) * 6.28, fx.R * 0.7); const ti = t + i * 0.08;
      B.column(fx, { pos: p, r: 0.35, h: 3.6, kind: 'water', t0: ti, dur: L * 0.6, rise: 0.2, shrink: 0.5, ...BLOOD, p: [3, 2, 0.8, 2], scroll: [0.2, 2.5], opacity: 0.7 });
      B.emit(fx, 'drip', { pos: p.add(V(0, 3.4, 0)), t0: ti + 0.15, dur: L * 0.5, rate: 40, r: 0.3, speed: [1, 3], c0: BLOOD.c0, c1: BLOOD.c1, c2: BLOOD.c2 });
    }
    B.column(fx, { pos: c, r: 0.7, h: 5, kind: 'water', t0: t + 0.45, dur: L * 0.5, rise: 0.2, shrink: 0.5, ...BLOOD, p: [4, 2, 0.8, 2], scroll: [0.2, 3] });
    K.impact(fx, c, { t: t + 0.45, scale: 1.2 });
  },
  // Bloodroot Thorns — crimson thorned roots burst up across a wide field, veined vines writhing between.
  'matrix-new/bloodroot'(fx) {
    K.gather(fx); B.telegraph(fx); const c = fx.tgt; const t = fx.T.hit; const L = life(fx, 3) + 0.8;
    B.spikes(fx, { layout: 'disc', pos: c, r: fx.R * 0.9, count: 30, shape: 'thorn', mat: 'thorn', tint: fx.pal.glow, emissive: 0.25, h: [0.8, 2.4], w: [0.18, 0.4], travel: 0.45, lean: 0.55, t0: t, dur: L, rise: 0.12, sinkAt: 0.78 });
    B.tendrils(fx, { pos: c, r: fx.R * 0.9, h: 0.9, count: 10, kind: 'liquid', width: 0.2, inward: 0.1, curl: 1.4, t0: t, dur: L, growT: 0.5, ...BLOOD });
    B.decal(fx, { kind: 'wash', pos: c, r: fx.R * 1.05, t0: t, dur: L + 0.8, c0: C('#ff9aa6'), c1: C('#8b1a3a'), c3: C('#1a0b08') });
    B.emit(fx, 'drip', { pos: c.add(V(0, 1.4, 0)), t0: t, burst: 80, shape: 'disc', r: fx.R * 0.8, speed: [2, 5], c0: BLOOD.c0, c1: BLOOD.c1, c2: BLOOD.c2 });
    K.impact(fx, c, { t, scale: 1.2 }); B.shake(fx, t, 0.35, 0.35);
  },
  // Sanguine Tide — a slow rolling wave of blood sweeps down the line, leaving a red wash.
  'codex/sanguine'(fx) {
    K.gather(fx); K.release(fx); const t = fx.T.ant; const dur = Math.max(1.1, fx.T.travel + 0.5); const from = along(fx, 0.1); const to = fx.tgt.add(fx.dir.scale(1.2));
    B.wave(fx, { from, to, width: 3, h: 1.8, t0: t, dur, ...BLOOD, p: [3, 1.5, 1.2, 2] });
    const head = V(); fx.at(t, dur, { update(lt) { head.copyFrom(Vector3.Lerp(from, to, easeOut(clamp01(lt / dur)))); head.y = fx.gy(head) + 1; } });
    B.emit(fx, 'drip', { follow: () => head, t0: t, dur, rate: 90, shape: 'box', box: [1.3, 0.4, 0.3], dir1: V(-1, 2, 0), dir2: V(1, 4, 1), speed: [1, 3], c0: BLOOD.c0, c1: BLOOD.c1, c2: BLOOD.c2 });
    B.decal(fx, { kind: 'wash', pos: Vector3.Lerp(from, to, 0.6), r: fx.dist * 0.5, t0: t, dur: dur + life(fx, 3.4) * 0.6, grow: [0, 1, dur], ...BLOOD });
    K.impact(fx, fx.tgt, { t: t + dur * 0.8, scale: 1.2 });
  },
};
