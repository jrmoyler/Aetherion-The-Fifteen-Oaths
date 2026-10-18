// Element-aware helper compositions shared by every recipe: anticipation gather, cast circle, release
// flash, projectile, impact and lingering ground state. Recipes call these and add their signature layers.
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import * as B from './blocks.js';
import { clamp01, easeOut, smooth } from './core.js';

const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const W = Color3.White();

/** 1 ANTICIPATION: energy gathering at the casting hand + converging motes + light. */
export function gather(fx, o = {}) {
  const el = fx.el; const dur = o.dur ?? fx.T.ant; const at = o.at ?? fx.o; const s = o.size ?? 0.22;
  const pre = o.preset ?? (el.id === 'fire' ? 'ember' : el.id === 'water' || el.id === 'blood' ? 'drip' : el.id === 'earth' ? 'dust' : el.id === 'frost' ? 'snow' : el.id === 'storm' ? 'spark' : el.id === 'nature' ? 'petal' : el.id === 'shadow' || el.id === 'cosmic' ? 'mote' : 'mote');
  B.emit(fx, pre === 'dust' ? 'mote' : pre, { pos: at, t0: 0, dur: dur * 0.9, rate: 70, shape: 'shell', r: o.r ?? 0.9, speed: [-(o.r ?? 0.9) * 2.4, -(o.r ?? 0.9) * 1.8], life: [0.3, 0.42], g: 0, size: pre === 'spark' ? 0.06 : undefined });
  B.surf(fx, { shape: 'sphere', tess: 12, pos: at, kind: 'energy', scale: 0.01, t0: 0, dur: dur + 0.06, fadeIn: 0.05, fadeOut: 0.06, p: [3, 3, 0, 1.2], scroll: [0.5, 1.2],
    anim: (lt, u, m) => { m.scaling.setAll(s * (0.3 + easeOut(lt / dur) * 0.9) * (1 + Math.sin(lt * 40) * 0.06)); } });
  B.emit(fx, 'glow', { pos: at, t0: 0, dur, rate: 24, size: s * 3.5, life: [0.12, 0.2], speed: [0, 0.1] });
  if (el.id === 'storm') B.bolt(fx, { from: at, to: () => at.add(V(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).scale(0.9)), t0: 0, dur, width: 0.12, forks: 1, segs: 6, regen: 0.05 });
  B.light(fx, { pos: at, t0: 0, dur: dur + 0.1, intensity: 1.6, range: 5, env: (lt) => clamp01(lt / dur), pri: 0 });
  if (o.circle !== false) castCircle(fx, { dur: dur + 0.25 });
}

/** Small sigil under the caster's feet during anticipation. */
export function castCircle(fx, o = {}) {
  const k = { fire: 'lava', frost: 'frost', water: 'wash', storm: 'glyph', earth: 'cracks', time: 'clock', tech: 'hex', cosmic: 'glyph', wind: 'spiral' }[fx.el.id] ?? 'glyph';
  B.decal(fx, { kind: k === 'lava' || k === 'wash' || k === 'cracks' ? 'glyph' : k, pos: fx.g, r: o.r ?? 1.1, t0: 0, dur: o.dur ?? fx.T.ant + 0.2, grow: [0.2, 1, 0.25], opacity: 0.7, spin: 0.8, p: [10, 6, 0, 0], fadeOut: 0.25, scroll: [0.6, 1] });
}

/** Burst at the hand when the spell is released. */
export function release(fx, o = {}) {
  const t = o.t ?? fx.T.ant; const at = o.at ?? fx.o;
  B.flash(fx, { pos: at, t0: t, size: o.size ?? 1.4, light: 3, dur: 0.12 });
  B.emit(fx, fx.el.spark === 'rock' ? 'dust' : fx.el.spark, { pos: at, t0: t, burst: o.n ?? 14, shape: 'dir', dir: fx.dir, spread: 0.45, speed: [2, 6], size: fx.el.spark === 'rock' ? 0.4 : undefined });
}

/** Element-flavoured projectile from hand to target. Returns orb holder {p}. */
export function projectile(fx, o = {}) {
  const el = fx.el.id;
  const look = {
    fire: { coreKind: 'energy', trailKind: 'flame', parts: 'ember', partRate: 90 },
    water: { trailKind: 'liquid', parts: 'splash', partRate: 50, partOpts: { speed: [0.5, 2], g: -6 } },
    frost: { trailKind: 'energy', parts: 'snow', partRate: 80 },
    storm: { trailKind: 'bolt', parts: 'spark', partRate: 60 },
    earth: { trailKind: 'dark', parts: 'dust', partRate: 30 },
    wind: { trailKind: 'energy', parts: 'streak', partRate: 40 },
    nature: { trailKind: 'energy', parts: 'petal', partRate: 50 },
    poison: { trailKind: 'liquid', parts: 'drip', partRate: 50 },
    light: { trailKind: 'energy', parts: 'mote', partRate: 70 },
    cosmic: { trailKind: 'energy', parts: 'mote', partRate: 60 },
    shadow: { trailKind: 'dark', parts: 'void', partRate: 40, coreKind: 'smoke' },
    blood: { trailKind: 'liquid', parts: 'drip', partRate: 60 },
    arcane: { trailKind: 'energy', parts: 'mote', partRate: 60 },
    time: { trailKind: 'energy', parts: 'mote', partRate: 50 },
    tech: { trailKind: 'energy', parts: 'spark', partRate: 40 },
  }[el] ?? {};
  return B.orb(fx, { ...look, ...o });
}

const IMPACT = {
  water: (fx, p, s) => { B.emit(fx, 'splash', { pos: p, t0: fx._t, burst: 60, shape: 'up', r: 0.4 * s, spread: 0.7, speed: [3, 8 * s] }); B.emit(fx, 'foam', { pos: p, t0: fx._t, burst: 14, shape: 'sphere', r: 0.5 * s }); B.decal(fx, { kind: 'wash', pos: p, r: 1.6 * s, t0: fx._t, dur: 1.6, grow: [0.3, 1, 0.5], opacity: 0.8 }); },
  storm: (fx, p, s) => { B.emit(fx, 'spark', { pos: p, t0: fx._t, burst: 50, r: 0.2, speed: [5, 14] }); for (let i = 0; i < 3; i++) { const a = fx.rnd() * 6.28; B.bolt(fx, { from: p, to: V(p.x + Math.cos(a) * 1.8 * s, fx.gy(p), p.z + Math.sin(a) * 1.8 * s), t0: fx._t, dur: 0.25, width: 0.18, forks: 1, segs: 8 }); } B.decal(fx, { kind: 'cracks', pos: p, r: 1.5 * s, t0: fx._t, dur: 1.2, p: [1, 1.5, 0, 0], opacity: 0.8, c3: fx.pal.deep }); },
  frost: (fx, p, s) => { B.emit(fx, 'shard', { pos: p, t0: fx._t, burst: 26, r: 0.3, speed: [3, 7] }); B.emit(fx, 'mist', { pos: p, t0: fx._t, burst: 6, r: 0.6 * s, life: [0.8, 1.4] }); B.emit(fx, 'snow', { pos: p, t0: fx._t, burst: 40, r: 0.4, speed: [1, 4] }); B.spikes(fx, { layout: 'cluster', pos: p, r: 0.9 * s, count: 6, h: [0.3 * s, 0.9 * s], w: [0.1, 0.22], t0: fx._t, dur: 1.4, mat: 'ice', rise: 0.1, sinkAt: 0.6 }); B.decal(fx, { kind: 'frost', pos: p, r: 1.4 * s, t0: fx._t, dur: 1.5, p: [8, 0, 0, 0], opacity: 0.7 }); },
  fire: (fx, p, s) => { B.emit(fx, 'ember', { pos: p, t0: fx._t, burst: 50, r: 0.3, speed: [2, 7], g: -2 }); B.emit(fx, 'flame', { pos: p, t0: fx._t, burst: 16, r: 0.4 * s, speed: [1, 3] }); B.emit(fx, 'smoke', { pos: p, t0: fx._t + 0.05, burst: 8, r: 0.5 * s, colors: [Color3.FromHexString('#3a302a'), Color3.FromHexString('#2a2420'), Color3.FromHexString('#1a1614')] }); B.decal(fx, { kind: 'scorch', pos: p, r: 1.3 * s, t0: fx._t, dur: 2.2, p: [1, 1, 0, 0], opacity: 0.8, c3: Color3.FromHexString('#120b08') }); },
  earth: (fx, p, s) => { B.debris(fx, { pos: p, mode: 'burst', count: 10, size: [0.12, 0.35], t0: fx._t, dur: 1.2, r: 0.4 }); B.emit(fx, 'dust', { pos: p, t0: fx._t, burst: 14, shape: 'disc', r: 0.6 * s, speed: [1.5, 4], colors: [Color3.FromHexString('#8a7a66'), Color3.FromHexString('#6a5c4c'), Color3.FromHexString('#4a4038')] }); B.decal(fx, { kind: 'cracks', pos: p, r: 1.6 * s, t0: fx._t, dur: 2, p: [1, 0.6, 0, 0], opacity: 0.85 }); },
  wind: (fx, p, s) => { B.emit(fx, 'streak', { pos: p, t0: fx._t, burst: 30, r: 0.3, speed: [6, 12] }); B.emit(fx, 'mist', { pos: p, t0: fx._t, burst: 6, r: 0.5, speed: [1, 3], alpha: 0.5 }); B.ring(fx, { pos: p, r0: 0.3, r1: 2.2 * s, h: 0.8, t0: fx._t, dur: 0.45, kind: 'wind', p: [6, 1, 0, 1] }); },
  nature: (fx, p, s) => { B.emit(fx, 'petal', { pos: p, t0: fx._t, burst: 30, r: 0.4, speed: [2, 5] }); B.emit(fx, 'leaf', { pos: p, t0: fx._t, burst: 10, r: 0.4, speed: [2, 4] }); B.decal(fx, { kind: 'pool', pos: p, r: 1.4 * s, t0: fx._t, dur: 1.2, opacity: 0.6 }); },
  poison: (fx, p, s) => { B.emit(fx, 'bubble', { pos: p, t0: fx._t, burst: 24, r: 0.4, speed: [1, 3] }); B.emit(fx, 'smoke', { pos: p, t0: fx._t, burst: 10, r: 0.6 * s, colors: [fx.pal.glow.scale(0.5), fx.pal.edge.scale(0.35), fx.pal.deep], alpha: 0.7 }); B.emit(fx, 'drip', { pos: p, t0: fx._t, burst: 20, r: 0.3, speed: [2, 5] }); B.decal(fx, { kind: 'wash', pos: p, r: 1.4 * s, t0: fx._t, dur: 2, opacity: 0.75, c0: fx.pal.glow, c1: fx.pal.edge, c3: fx.pal.deep }); },
  light: (fx, p, s) => { B.emit(fx, 'mote', { pos: p, t0: fx._t, burst: 40, r: 0.3, speed: [2, 5] }); B.ring(fx, { pos: p, r0: 0.2, r1: 2.0 * s, h: 0.4, t0: fx._t, dur: 0.4 }); B.decal(fx, { kind: 'glyph', pos: p, r: 1.5 * s, t0: fx._t, dur: 1, p: [8, 8, 0, 0], opacity: 0.8 }); },
  cosmic: (fx, p, s) => { B.emit(fx, 'mote', { pos: p, t0: fx._t, burst: 40, shape: 'shell', r: 1.2 * s, speed: [-3, -2], life: [0.3, 0.45] }); B.emit(fx, 'mote', { pos: p, t0: fx._t + 0.3, burst: 30, r: 0.2, speed: [3, 7] }); B.ring(fx, { pos: p, r0: 0.2, r1: 2.2 * s, h: 0.3, t0: fx._t + 0.3, dur: 0.45 }); B.decal(fx, { kind: 'spiral', pos: p, r: 1.6 * s, t0: fx._t, dur: 1.2, p: [3, 1, 0, 0], scroll: [1.5, 4], opacity: 0.7 }); },
  shadow: (fx, p, s) => { B.emit(fx, 'void', { pos: p, t0: fx._t, burst: 14, r: 0.5 * s, speed: [1, 3], colors: [fx.pal.deep, fx.pal.edge.scale(0.4), fx.pal.deep] }); B.emit(fx, 'mote', { pos: p, t0: fx._t, burst: 26, r: 0.3, speed: [2, 6] }); B.decal(fx, { kind: 'scorch', pos: p, r: 1.4 * s, t0: fx._t, dur: 1.8, opacity: 0.85, p: [1, 0.8, 0, 0], c3: fx.pal.deep }); },
  blood: (fx, p, s) => { B.emit(fx, 'drip', { pos: p, t0: fx._t, burst: 40, shape: 'up', r: 0.3, spread: 0.8, speed: [2, 7] }); B.emit(fx, 'void', { pos: p, t0: fx._t, burst: 8, r: 0.4, colors: [fx.pal.edge.scale(0.6), fx.pal.deep, fx.pal.deep] }); B.decal(fx, { kind: 'wash', pos: p, r: 1.3 * s, t0: fx._t, dur: 2.4, opacity: 0.85, c0: fx.pal.glow, c1: fx.pal.edge, c3: fx.pal.deep }); },
  arcane: (fx, p, s) => { B.emit(fx, 'mote', { pos: p, t0: fx._t, burst: 40, r: 0.3, speed: [2, 6] }); B.ring(fx, { pos: p, r0: 0.3, r1: 1.8 * s, h: 0.25, t0: fx._t, dur: 0.4 }); B.decal(fx, { kind: 'glyph', pos: p, r: 1.4 * s, t0: fx._t, dur: 0.9, p: [12, 5, 0, 0], scroll: [2, 0], opacity: 0.9 }); },
  time: (fx, p, s) => { B.emit(fx, 'mote', { pos: p, t0: fx._t, burst: 30, r: 0.3, speed: [1, 4] }); B.decal(fx, { kind: 'clock', pos: p, r: 1.5 * s, t0: fx._t, dur: 1, scroll: [0.5, 6], opacity: 0.9 }); B.ring(fx, { pos: p, r0: 1.6 * s, r1: 0.2, h: 0.3, t0: fx._t, dur: 0.4 }); },
  tech: (fx, p, s) => { B.emit(fx, 'spark', { pos: p, t0: fx._t, burst: 40, r: 0.2, speed: [5, 12] }); B.emit(fx, 'steam', { pos: p, t0: fx._t, burst: 6, r: 0.4, alpha: 0.5 }); B.decal(fx, { kind: 'hex', pos: p, r: 1.4 * s, t0: fx._t, dur: 1, p: [6, 0, 0, 0], opacity: 0.8 }); B.ring(fx, { pos: p, r0: 0.2, r1: 1.8 * s, h: 0.2, t0: fx._t, dur: 0.35, kind: 'hex' }); },
};

/** 3 IMPACT: element impact at p (ground point) at time t. */
export function impact(fx, p, o = {}) {
  const t = o.t ?? fx.T.hit; const s = (o.scale ?? 1) * fx.mul;
  const pc = p.clone(); const gy = fx.gy(pc); const hit = V(pc.x, Math.max(gy + (o.h ?? 0.9), pc.y), pc.z);
  B.flash(fx, { pos: hit, t0: t, size: 2.2 * s, light: 5 * s, dur: 0.18 });
  fx._t = t; (IMPACT[fx.el.id] ?? IMPACT.arcane)(fx, V(pc.x, gy + 0.15, pc.z), s);
  if (o.shake !== false) B.shake(fx, t, 0.25 * s, 0.25);
}

/** 4 LINGER: element-specific ground state for a zone. */
export function linger(fx, p, o = {}) {
  const t0 = o.t0 ?? fx.T.hit; const dur = o.dur ?? 2; const r = o.r ?? fx.R; const el = fx.el.id;
  const ground = V(p.x, fx.gy(p) + 0.1, p.z);
  const K = {
    fire: () => { B.decal(fx, { kind: 'lava', pos: p, r, t0, dur: dur + 1.2, p: [2.2, 1, 0, 0], opacity: 0.95, grow: [0.3, 1, 0.4] }); B.emit(fx, 'ember', { pos: ground, t0, dur, rate: 50, shape: 'disc', r, speed: [0.5, 2] }); B.emit(fx, 'smoke', { pos: ground, t0, dur, rate: 6, shape: 'disc', r: r * 0.8, colors: [Color3.FromHexString('#4a3a30'), Color3.FromHexString('#2a2220'), Color3.FromHexString('#141010')], alpha: 0.7 }); },
    frost: () => { B.decal(fx, { kind: 'frost', pos: p, r, t0, dur: dur + 0.8, p: [9, 0, 0, 0], opacity: 0.85 }); B.emit(fx, 'mist', { pos: ground, t0, dur, rate: 8, shape: 'disc', r: r * 0.9, life: [1.5, 2.5], alpha: 0.6 }); B.emit(fx, 'snow', { pos: V(p.x, ground.y + 2, p.z), t0, dur, rate: 40, shape: 'disc', r }); },
    water: () => { B.decal(fx, { kind: 'wash', pos: p, r, t0, dur: dur + 1, opacity: 0.85 }); B.emit(fx, 'foam', { pos: ground, t0, dur, rate: 10, shape: 'disc', r: r * 0.8, speed: [0.2, 1], g: 0 }); },
    storm: () => { B.decal(fx, { kind: 'cracks', pos: p, r, t0, dur: dur + 0.5, p: [1, 1.6, 0, 0], opacity: 0.8 }); B.emit(fx, 'spark', { pos: ground, t0, dur, rate: 30, shape: 'disc', r, speed: [2, 6] }); },
    earth: () => { B.decal(fx, { kind: 'cracks', pos: p, r, t0, dur: dur + 1.5, p: [1, 0.5, 0, 0], opacity: 0.9 }); B.emit(fx, 'dust', { pos: ground, t0, dur: dur * 0.6, rate: 6, shape: 'disc', r, colors: [Color3.FromHexString('#8a7a66'), Color3.FromHexString('#6a5c4c'), Color3.FromHexString('#4a4038')], alpha: 0.6 }); },
    poison: () => { B.decal(fx, { kind: 'wash', pos: p, r, t0, dur: dur + 1, opacity: 0.8, c0: fx.pal.glow, c1: fx.pal.edge, c3: fx.pal.deep }); B.emit(fx, 'smoke', { pos: ground, t0, dur, rate: 10, shape: 'disc', r: r * 0.9, colors: [fx.pal.glow.scale(0.45), fx.pal.edge.scale(0.3), fx.pal.deep], alpha: 0.6, speed: [0.1, 0.5] }); B.emit(fx, 'bubble', { pos: ground, t0, dur, rate: 14, shape: 'disc', r }); },
    shadow: () => { B.decal(fx, { kind: 'scorch', pos: p, r, t0, dur: dur + 1, opacity: 0.9, p: [1, 0.6, 0, 0], c3: fx.pal.deep }); B.emit(fx, 'void', { pos: ground, t0, dur, rate: 8, shape: 'disc', r, colors: [fx.pal.deep, fx.pal.edge.scale(0.35), fx.pal.deep] }); },
    blood: () => { B.decal(fx, { kind: 'wash', pos: p, r, t0, dur: dur + 1, opacity: 0.85, c0: fx.pal.glow, c1: fx.pal.edge, c3: fx.pal.deep }); B.emit(fx, 'drip', { pos: V(p.x, ground.y + 1.5, p.z), t0, dur, rate: 20, shape: 'disc', r }); },
  };
  (K[el] ?? (() => { B.decal(fx, { kind: fx.el.decal, pos: p, r, t0, dur: dur + 0.6, opacity: 0.8, p: [10, 6, 0, 0], scroll: [0.3, 1] }); B.emit(fx, fx.el.mist, { pos: ground, t0, dur, rate: 20, shape: 'disc', r, speed: [0.3, 1.2] }); }))();
}

export { V, W, smooth, easeOut, clamp01 };
