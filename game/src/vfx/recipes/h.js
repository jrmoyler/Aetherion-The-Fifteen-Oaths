// Recipe helpers: composite set-pieces reused across elements (meteors, serpents, whips, portals, volleys).
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import * as B from '../blocks.js';
import * as K from '../kit.js';
import { PALETTES } from '../palettes.generated.js';
import { clamp01, easeOut, easeIn, smooth, lerp } from '../core.js';

export const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
export const C = (h) => Color3.FromHexString(h);
export { B, K, clamp01, easeOut, easeIn, smooth, lerp };

/** Registry lifetime / fade (seconds) with defaults. */
export const life = (fx, d) => Math.min(8, PALETTES[fx.ab?.id]?.l ?? d);
export const fade = (fx, d) => Math.min(3, PALETTES[fx.ab?.id]?.f ?? d);

/** Point along the caster→target ground line. */
export const along = (fx, t, y = 0) => { const p = Vector3.Lerp(fx.g, fx.tgt, t); p.y = fx.gy(p) + y; return p; };
/** Ground point at polar offset around a centre. */
export const polar = (fx, c, a, r, y = 0) => { const p = V(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r); p.y = fx.gy(p) + y; return p; };

/** Falling molten / celestial body with heat trail and impact. kind: lava|star|ice|rock */
export function meteor(fx, from, to, t0, dur, o = {}) {
  const cur = from.clone(); const size = o.size ?? 0.7;
  const path = (lt) => { const u = clamp01(lt / dur); cur.copyFrom(Vector3.Lerp(from, to, easeIn(u) * 0.3 + u * 0.7)); return cur; };
  const getP = () => cur;
  const mat = o.mat ?? (o.kind === 'star' ? 'crystal' : o.kind === 'ice' ? 'ice' : 'lava');
  if (o.kind === 'star') B.surf(fx, { shape: 'sphere', tess: 12, pos: from, kind: 'energy', scale: size * 0.6, t0, dur, fadeIn: 0.02, fadeOut: 0.02, anim: (lt, u, m) => m.position.copyFrom(path(lt)) });
  else B.solid(fx, { mat, size, t0, dur, path, spin: V(3, 2, 1), tint: o.tint ?? fx.pal.glow, emissive: o.emissive });
  B.trail(fx, { follow: getP, t0, dur: dur + 0.2, kind: o.trailKind ?? (o.kind === 'star' || o.kind === 'ice' ? 'energy' : 'flame'), width: size * 1.8, n: 22, p: [3, 1, 1, 0], scroll: [5, 0] });
  if (o.kind !== 'star' && o.kind !== 'ice') B.emit(fx, 'smoke', { follow: getP, t0, dur, rate: 18, r: size * 0.4, size: size * 1.4, alpha: 0.6, colors: [C('#4a3a30'), C('#2a2220'), C('#141010')] });
  B.emit(fx, o.parts ?? (o.kind === 'star' ? 'mote' : o.kind === 'ice' ? 'snow' : 'ember'), { follow: getP, t0, dur, rate: 50, r: size * 0.5 });
  B.light(fx, { pos: getP, t0, dur, intensity: 2, range: 6, env: () => 1, pri: 0 });
  if (o.impact !== false) K.impact(fx, to, { t: t0 + dur, scale: o.impactScale ?? 1, shake: o.shake ?? true });
  return getP;
}

/** Parametric path follower drawn as a ribbon (serpents, spirits, wraiths, digital snakes). path(lt) -> Vector3 */
export function serpent(fx, path, t0, dur, o = {}) {
  const cur = V(); const getP = () => cur;
  const prim = { update(lt) { cur.copyFrom(path(lt)); } };
  fx.at(t0, dur, prim);
  B.trail(fx, { follow: getP, t0: t0 + 0.02, dur, kind: o.kind ?? 'energy', width: o.width ?? 0.5, n: o.n ?? 26, p: o.p ?? [4, 6, 1, 0], scroll: o.scroll ?? [3, 0], taperPow: o.taperPow ?? 0.7, c0: o.c0, c1: o.c1, c2: o.c2, c3: o.c3, fadeOut: o.fadeOut ?? 0.3 });
  if (o.head !== false) B.emit(fx, 'glow', { follow: getP, t0, dur, rate: 30, size: (o.width ?? 0.5) * 2.2, life: [0.08, 0.14], speed: [0, 0.1] });
  if (o.parts) B.emit(fx, o.parts, { follow: getP, t0, dur, rate: o.rate ?? 40, r: 0.2, ...(o.partOpts ?? {}) });
  return getP;
}

/** Whip / lash ribbon from hand to target with travelling wave, grows over `dur`. */
export function whip(fx, o = {}) {
  const t0 = o.t0 ?? fx.T.ant; const dur = o.dur ?? Math.max(0.25, fx.T.hit - t0 + 0.35); const n = 30;
  const to = o.to ?? fx.tgtH; const amp = o.amp ?? 1.2;
  return B.strip(fx, {
    kind: o.kind ?? 'flame', maxPts: n + 1, width: o.width ?? 0.45, p: o.p ?? [5, 1, 1, 0], scroll: o.scroll ?? [8, 0], t0, dur, fadeIn: 0.02, fadeOut: o.fadeOut ?? 0.2,
    c0: o.c0, c1: o.c1, c2: o.c2, c3: o.c3,
    grow: (lt) => clamp01(lt / Math.max(0.05, fx.T.hit - t0)) * 1.02,
    lines: (lt) => {
      const a = fx.o; const b = to; const pts = []; const side = fx.side; const k = clamp01(lt / Math.max(0.05, fx.T.hit - t0));
      for (let i = 0; i <= n; i++) {
        const t = i / n; const p = Vector3.Lerp(a, b, t);
        const w = Math.sin(t * Math.PI) * amp * (1 - k * 0.6);
        p.addInPlace(side.scale(Math.sin(t * 7 - lt * 18) * w * 0.4)); p.y += Math.sin(t * Math.PI) * (o.lift ?? 0.6) + Math.sin(t * 5 - lt * 14) * w * 0.25;
        pts.push(p);
      }
      return [{ pts, w: (i, m) => lerp(o.w0 ?? 0.5, o.w1 ?? 1.1, i / (m - 1)) }];
    },
  });
}

/** Volley of small projectiles fired in a staggered fan. Returns nothing; impacts at targets. */
export function volley(fx, count, o = {}) {
  const t0 = o.t0 ?? fx.T.ant; const spread = o.spread ?? 1.6;
  for (let i = 0; i < count; i++) {
    const k = count === 1 ? 0 : i / (count - 1) - 0.5; const ti = t0 + i * (o.stagger ?? 0.06);
    const to = fx.tgtH.add(fx.side.scale(k * spread * (fx.rnd() * 0.6 + 0.7))).add(V(0, (fx.rnd() - 0.5) * 0.6, 0));
    const flight = o.flight ?? Math.max(0.15, fx.T.hit - fx.T.ant);
    K.projectile(fx, { from: fx.o.add(fx.side.scale(k * 0.4)), to, t0: ti, dur: flight, size: o.size ?? 0.16, arc: (o.arc ?? 0.6) * (fx.rnd() * 0.5 + 0.5), wiggle: o.wiggle ?? 0, ph: i, light: i % 3 === 0 ? 1.2 : false, trailWidth: o.trailWidth ?? 0.22, coreKind: o.coreKind, trailKind: o.trailKind, parts: o.parts, partRate: 20, c0: o.c0, c1: o.c1 });
    if (o.onHit) o.onHit(to, ti + flight, i); else if (i % 2 === 0) { const g = to.clone(); g.y = fx.gy(g); K.impact(fx, g, { t: ti + flight, scale: o.impactScale ?? 0.45, shake: i === 0 }); }
  }
}

/** Vertical ring portal (torus + swirling inner disc). Returns centre. */
export function portal(fx, at, r, t0, dur, o = {}) {
  const yaw = Math.atan2(fx.dir.x, fx.dir.z);
  const flat = o.flat ?? false;
  B.surf(fx, { shape: 'torus', thick: o.thick ?? 0.18, tess: 48, pos: at, kind: o.kind ?? fx.el.surf, scale: 0.01, rot: flat ? V(0, 0, 0) : V(Math.PI / 2, yaw, 0), p: [6, 1, 0, 1.5], scroll: [0.4, -1.5], t0, dur, fadeIn: 0.1, fadeOut: 0.4,
    anim: (lt, u, m) => { m.scaling.setAll(r * easeOut(lt / 0.45)); m.rotation.y = flat ? lt * 0.8 : yaw; } });
  B.decal(fx, { kind: o.inner ?? 'spiral', pos: at, r: r * 0.95, vertical: !flat, yaw, t0: t0 + 0.1, dur: dur - 0.1, grow: [0, 1, 0.5], p: [4, 1.2, 0, 0], scroll: [1.2, 5], opacity: o.innerOpacity ?? 0.9, lift: flat ? at.y - fx.gy(at) : 0 });
  B.emit(fx, fx.el.spark === 'rock' ? 'dust' : fx.el.spark, { pos: at, t0, dur, rate: 40, shape: 'sphere', r: r * 0.9, speed: [0.5, 2] });
  B.light(fx, { pos: at, t0, dur, intensity: 3, range: r * 4, env: (lt, u) => Math.min(1, lt / 0.3) * (1 - smooth((u - 0.8) / 0.2)), pri: 1 });
  return at;
}

/** Pillar of energy striking down from the sky onto p. */
export function skyStrike(fx, p, t0, o = {}) {
  const r = o.r ?? 0.6; const h = o.h ?? 14;
  B.column(fx, { pos: p, r, h, t0, dur: o.dur ?? 0.5, rise: 0.06, kind: o.kind ?? 'glow', fadeOut: 0.35, c0: o.c0, c1: o.c1, p: [1, 3, 0, 2], scroll: [0, 6] });
  B.column(fx, { pos: p, r: r * 0.35, h, t0, dur: (o.dur ?? 0.5) * 0.7, rise: 0.04, kind: 'glow', c0: C('#ffffff'), c1: o.c0 ?? fx.pal.core, fadeOut: 0.2 });
  if (o.impact !== false) K.impact(fx, p, { t: t0 + 0.04, scale: o.scale ?? 1 });
}

export { PALETTES };
