// Non-ability effects: basic attacks per class/element, impacts, deaths, heals, level-ups, dodges,
// follow trails, persistent status visuals, and a shape-driven fallback for any unknown ability.
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import * as B from './blocks.js';
import * as K from './kit.js';
import { ELEMENTS } from './elements.js';
import { clamp01, easeOut } from './core.js';

const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const follow = (fx) => fx.opts.follow ?? (fx.caster ? () => fx.caster.position : null);

function slashKind(el) { return el === 'water' || el === 'blood' ? 'water' : el === 'shadow' || el === 'earth' ? 'smoke' : 'glow'; }

export const GENERIC = {
  /** Fallback for unknown abilities: anticipation → shape-appropriate delivery → impact → linger. */
  ability(fx) {
    K.gather(fx);
    const sh = fx.ab?.shape;
    if (sh === 'line') { K.release(fx); K.projectile(fx, { size: 0.35 }); K.impact(fx, fx.tgt); }
    else if (sh === 'self' || sh === 'summon') { B.column(fx, { pos: fx.g, r: 1.2, h: 3, t0: fx.T.ant, dur: 1.2 }); B.ring(fx, { pos: fx.g, r1: 3, t0: fx.T.ant, dur: 0.5 }); }
    else { B.telegraph(fx); K.impact(fx, fx.tgt, { scale: 1.4 }); K.linger(fx, fx.tgt, { dur: 1.6 }); }
  },

  /** Basic attack: 'basic:ninja:<el>' melee arc or 'basic:sorcerer:<el>' bolt. */
  basic(fx, cls, element) {
    const el = ELEMENTS[element] ?? ELEMENTS.arcane; const P = fx.pal;
    if (cls === 'ninja') {
      const combo = fx.opts.combo ?? Math.floor(fx.rnd() * 3); const t0 = 0.06;
      const tilt = [0.5, -0.6, 0.15][combo % 3]; const pitch = combo % 3 === 2 ? -0.25 : 0;
      const at = fx.g.add(V(0, 1.15, 0)).add(fx.dir.scale(0.25));
      B.slash(fx, { pos: at, dir: fx.dir, r: 1.7, arc: 2.6, width: 0.55, tilt, pitch, t0, dur: 0.3, kind: slashKind(el.id), reverse: combo % 2 === 1, p: [1, 2, 0.9, -1], scroll: [0, -4] });
      B.slash(fx, { pos: at, dir: fx.dir, r: 1.55, arc: 2.3, width: 0.18, tilt, pitch, t0: t0 + 0.02, dur: 0.26, kind: 'glow', reverse: combo % 2 === 1, c0: P.core, c1: P.core, blend: 'add', opacity: 0.9, p: [1, 1, 1, -1] });
      B.emit(fx, el.spark === 'rock' ? 'dust' : el.spark, { pos: at.add(fx.dir.scale(1.2)), t0: t0 + 0.08, burst: 18, shape: 'dir', dir: fx.dir, spread: 0.6, speed: [2, 5], size: el.spark === 'rock' ? 0.3 : undefined });
      if (fx.opts.target) { K.impact(fx, fx.tgt, { t: t0 + 0.14, scale: 0.55, shake: true }); }
      B.shake(fx, t0 + 0.12, 0.12, 0.12);
    } else {
      fx.T.ant = 0.14; fx.T.hit = fx.T.ant + Math.min(0.9, fx.dist / 30);
      K.gather(fx, { dur: 0.14, size: 0.16, r: 0.5, circle: false });
      K.release(fx, { size: 0.9, n: 8 });
      K.projectile(fx, { size: 0.24, trailWidth: 0.35 });
      K.impact(fx, fx.tgt, { scale: 0.6 });
    }
  },

  impact(fx, element) { K.impact(fx, fx.opts.pos ?? fx.g, { t: 0, scale: fx.opts.scale ?? 1, shake: !!fx.opts.shake }); },
  impactOnly(fx) { K.impact(fx, fx.tgt, { t: fx.T.hit, scale: 0.8, shake: false }); },

  death(fx) {
    const p = fx.g; const top = p.add(V(0, 1, 0));
    B.emit(fx, 'mote', { pos: top, t0: 0, dur: 1.2, rate: 60, shape: 'sphere', r: 0.5, speed: [0.5, 1.5], g: 2.5, life: [1, 2] });
    B.emit(fx, 'dust', { pos: p.add(V(0, 0.2, 0)), t0: 0.1, burst: 14, shape: 'disc', r: 0.6, speed: [1, 3], colors: [Color3.FromHexString('#6a5e52'), Color3.FromHexString('#4a4038'), Color3.FromHexString('#2a2420')] });
    B.emit(fx, fx.el.puff === 'glow' ? 'mist' : fx.el.puff, { pos: top, t0: 0, burst: 10, r: 0.5, speed: [0.5, 1.5] });
    B.column(fx, { pos: p, r: 0.6, h: 4, t0: 0, dur: 1.2, rise: 0.4, shrink: 0.4, opacity: 0.6 });
    B.decal(fx, { kind: fx.el.decal === 'lava' ? 'scorch' : fx.el.decal, pos: p, r: 1.4, t0: 0, dur: 2.5, opacity: 0.7, p: [8, 6, 0, 0] });
    B.flash(fx, { pos: top, t0: 0, size: 1.6, light: 3 });
  },

  heal(fx) {
    const f = follow(fx) ?? (() => fx.g);
    B.emit(fx, 'mote', { follow: f, t0: 0, dur: 0.8, rate: 60, shape: 'disc', r: 0.6, speed: [1, 2.5], g: 2, colors: [Color3.White(), Color3.FromHexString('#9dffb0'), Color3.FromHexString('#ffe68a')] });
    B.decal(fx, { kind: 'pool', pos: fx.g, r: 1.2, t0: 0, dur: 1.1, c0: Color3.White(), c1: Color3.FromHexString('#8affb0'), opacity: 0.8, anim: (lt, u, m) => { const p = f(); m.position.x = p.x; m.position.z = p.z; } });
    B.ring(fx, { pos: fx.g, r0: 1.2, r1: 0.4, h: 1.6, t0: 0, dur: 0.7, c0: Color3.White(), c1: Color3.FromHexString('#9dffb0') });
  },

  levelup(fx) {
    const P = { c0: Color3.White(), c1: Color3.FromHexString('#ffe6a0') };
    B.column(fx, { pos: fx.g, r: 0.9, h: 9, t0: 0, dur: 2, rise: 0.3, ...P });
    B.ring(fx, { pos: fx.g, r0: 0.3, r1: 4, h: 0.6, t0: 0, dur: 0.8, ...P });
    B.decal(fx, { kind: 'glyph', pos: fx.g, r: 2.2, t0: 0, dur: 2.2, p: [12, 8, 0, 0], scroll: [0.8, 0], ...P });
    B.emit(fx, 'mote', { pos: fx.g.add(V(0, 0.5, 0)), t0: 0, dur: 1.6, rate: 90, shape: 'disc', r: 1, speed: [1, 3], g: 3, colors: [Color3.White(), P.c1, Color3.FromHexString('#ffb547')] });
    B.flash(fx, { pos: fx.g.add(V(0, 1.2, 0)), t0: 0, size: 3, light: 6, color: P.c1 });
  },

  telegraph(fx) { B.telegraph(fx, { pos: fx.g, r: fx.opts.radius ?? 3, t0: 0, dur: fx.opts.duration ?? 1 }); },

  dodge(fx) {
    const f = follow(fx) ?? (() => fx.g);
    B.emit(fx, 'streak', { follow: () => f().add(V(0, 1, 0)), t0: 0, dur: 0.3, rate: 80, shape: 'sphere', r: 0.4, speed: [2, 5], c0: fx.pal.core, c1: fx.pal.glow, c2: fx.pal.edge });
    B.emit(fx, 'mist', { pos: fx.g.add(V(0, 0.9, 0)), t0: 0, burst: 4, r: 0.4, alpha: 0.4, life: [0.4, 0.7] });
    B.ring(fx, { pos: fx.g, r0: 0.3, r1: 1.6, h: 0.3, t0: 0, dur: 0.35, kind: 'wind', p: [6, 1, 0, 1] });
  },

  /** Server-side telegraphed zone (mob specials, world events): footprint fills for castTime, then element strike. */
  zone(fx) {
    const ct = Math.max(0.3, fx.opts.castTime ?? 1); const r = fx.opts.radius ?? 3;
    B.decal(fx, { kind: 'telegraph', pos: fx.tgt, r, t0: 0, dur: ct + 0.1, grow: [0.05, 1, ct], opacity: 0.85, c1: Color3.FromHexString('#ff5a3a'), c0: Color3.FromHexString('#ffd0a0') });
    B.decal(fx, { kind: fx.el.decal === 'glyph' ? 'glyph' : 'cracks', pos: fx.tgt, r: r * 0.9, t0: ct * 0.3, dur: ct * 0.7 + 0.1, opacity: 0.5, p: [1, 1, 0, 0] });
    K.impact(fx, fx.tgt, { t: ct, scale: Math.max(0.8, r / 2.5), shake: !!fx.opts.shake });
    K.linger(fx, fx.tgt, { t0: ct, dur: 1.2, r });
  },

  /** Short mob special without telegraph (roar / phase shift): shock ring + flash at the caster. */
  burst(fx) {
    B.ring(fx, { pos: fx.g, r0: 0.5, r1: fx.opts.radius ?? 6, h: 1.2, t0: 0, dur: 0.6 });
    B.flash(fx, { pos: fx.g.add(V(0, 1.4, 0)), t0: 0, size: 3, light: 4 });
    B.emit(fx, fx.el.spark === 'rock' ? 'dust' : fx.el.spark, { pos: fx.g.add(V(0, 1, 0)), t0: 0, burst: 40, r: 0.6, speed: [3, 8] });
    B.decal(fx, { kind: fx.el.decal, pos: fx.g, r: 2.5, t0: 0, dur: 1.2, opacity: 0.7, p: [8, 6, 0, 0] });
    B.shake(fx, 0, 0.3, 0.4);
  },

  /** Ultimate flourish layered on top of the ability recipe: 'ultimate:<cls>:<element>'. */
  ultimate(fx, cls) {
    const P = fx.pal; const f = () => fx.caster?.position ?? fx.g; const at = fx.g;
    if (cls === 'ninja') { // whirlwind of three elemental crescents + afterimage streaks
      for (let i = 0; i < 3; i++) B.slash(fx, { pos: at.add(V(0, 0.7 + i * 0.35, 0)), dir: fx.dir, r: 2.2 + i * 0.3, arc: 5.8, width: 0.45, tilt: (i - 1) * 0.25, t0: 0.02 + i * 0.07, dur: 0.42, kind: slashKind(fx.el.id), sweep: 0.7, p: [1, 4, 0, 1] });
      B.emit(fx, 'streak', { follow: () => f().add(V(0, 1, 0)), t0: 0, dur: 0.5, rate: 120, shape: 'sphere', r: 1.2, speed: [4, 9] });
      B.ring(fx, { pos: at, r0: 0.4, r1: 5, h: 0.6, t0: 0.15, dur: 0.5 });
    } else { // ascending sigil + pillar + orbiting motes
      B.decal(fx, { kind: fx.el.decal === 'clock' ? 'clock' : 'glyph', pos: at, r: 3.2, t0: 0, dur: Math.max(1.2, fx.T.ant + 0.8), p: [16, 8, 0, 0], scroll: [1.2, 6], grow: [0, 1, 0.35] });
      B.column(fx, { pos: at, r: 0.9, h: 10, t0: 0.05, dur: Math.max(0.9, fx.T.ant + 0.5), rise: 0.25, kind: 'glow', opacity: 0.35 });
      B.emit(fx, 'mote', { pos: at.add(V(0, 0.3, 0)), t0: 0, dur: Math.max(0.6, fx.T.ant), rate: 120, shape: 'disc', r: 2.6, speed: [1, 3], g: 4 });
    }
    B.flash(fx, { pos: at.add(V(0, 1.2, 0)), t0: 0.05, size: 4, light: 6, pri: 3 });
    B.shake(fx, 0.05, 0.35, 0.35);
    B.shake(fx, Math.max(0.3, fx.T.hit), 0.75, 0.6);
  },

  /** Follow trail: 'trail:<element>' with opts.follow. */
  trail(fx) {
    const f = fx.opts.follow; if (!f) return;
    const dur = fx.opts.duration ?? 2;
    B.trail(fx, { follow: f, t0: 0, dur, kind: fx.el.strip === 'bolt' ? 'energy' : fx.el.strip, width: fx.opts.width ?? 0.3, n: 18 });
    B.emit(fx, fx.el.spark === 'rock' ? 'dust' : fx.el.spark, { follow: f, t0: 0, dur, rate: 20, r: 0.05, speed: [0.2, 1], size: fx.el.spark === 'rock' ? 0.2 : undefined });
  },

  /** Persistent status visual: 'status:<kind>' with opts.follow + opts.duration. */
  status(fx, kind) {
    const f = follow(fx) ?? (() => fx.g); const dur = Math.max(0.5, fx.opts.duration ?? 4);
    const body = () => f().add(V(0, 1, 0)); const feet = () => f().add(V(0, 0.1, 0));
    const C = (h) => Color3.FromHexString(h);
    const decalFollow = (o) => B.decal(fx, { pos: fx.g, r: 0.9, t0: 0, dur, fadeOut: 0.4, ...o, anim: (lt, u, m) => { const p = f(); m.position.x = p.x; m.position.z = p.z; } });
    switch (kind) {
      case 'burning':
        B.emit(fx, 'flame', { follow: body, t0: 0, dur, rate: 26, shape: 'sphere', r: 0.35, speed: [0.5, 1.5], size: 0.45, c0: C('#fff1c8'), c1: C('#ff8a1e'), c2: C('#ff3a0a') });
        B.emit(fx, 'ember', { follow: body, t0: 0, dur, rate: 18, r: 0.4, c0: C('#fff1c8'), c1: C('#ff8a1e'), c2: C('#ff3a0a') });
        B.emit(fx, 'smoke', { follow: () => f().add(V(0, 1.7, 0)), t0: 0, dur, rate: 3, r: 0.2, alpha: 0.5, colors: [C('#3a302a'), C('#2a2420'), C('#1a1614')] });
        B.light(fx, { pos: body, t0: 0, dur, intensity: 1.5, range: 4, color: C('#ff7a2a'), flicker: true, env: () => 1, pri: 0 });
        break;
      case 'chilled':
        B.emit(fx, 'mist', { follow: feet, t0: 0, dur, rate: 4, shape: 'disc', r: 0.5, alpha: 0.5, c0: C('#f2feff'), c1: C('#8adaff'), c2: C('#3a74ae') });
        B.emit(fx, 'snow', { follow: body, t0: 0, dur, rate: 18, r: 0.5, c0: C('#ffffff'), c1: C('#bfefff'), c2: C('#8adaff') });
        decalFollow({ kind: 'frost', p: [8, 0, 0, 0], opacity: 0.7, c0: C('#f2feff'), c1: C('#8adaff') });
        break;
      case 'shocked':
        B.bolt(fx, { from: () => body().add(V(Math.random() - 0.5, Math.random(), Math.random() - 0.5).scale(0.6)), to: () => body().add(V(Math.random() - 0.5, Math.random() - 1, Math.random() - 0.5).scale(0.8)), t0: 0, dur, width: 0.1, forks: 1, segs: 6, regen: 0.09, c1: C('#8fc0ff'), c2: C('#5a3cff') });
        B.emit(fx, 'spark', { follow: body, t0: 0, dur, rate: 14, r: 0.4, speed: [2, 5], c0: C('#ffffff'), c1: C('#8fc0ff'), c2: C('#5a3cff') });
        break;
      case 'poisoned':
        B.emit(fx, 'bubble', { follow: body, t0: 0, dur, rate: 10, r: 0.4, c0: C('#e6ffb0'), c1: C('#9dff3a'), c2: C('#5cff22') });
        B.emit(fx, 'drip', { follow: body, t0: 0, dur, rate: 8, r: 0.35, c0: C('#e6ffb0'), c1: C('#9dff3a'), c2: C('#3a8a10') });
        B.emit(fx, 'smoke', { follow: feet, t0: 0, dur, rate: 3, r: 0.3, alpha: 0.45, colors: [C('#4a7a1a'), C('#2a4a10'), C('#0e1a06')] });
        break;
      case 'rooted': {
        const pts = () => fx.g;
        B.tendrils(fx, { pos: pts(), r: 0.55, h: 1.1, count: 5, mode: 'wrap', curl: 0.6, kind: 'energy', width: 0.09, t0: 0, dur, growT: 0.4, c0: C('#d9ff86'), c1: C('#6fe04a'), c2: C('#2a5a1a'), scaleQ: false });
        decalFollow({ kind: 'pool', opacity: 0.4, c0: C('#d9ff86'), c1: C('#3ddc7f') });
        break;
      }
      case 'shielded':
        B.dome(fx, { pos: fx.g, r: 1.25, full: true, follow: body, t0: 0, dur, kind: 'hex', opacity: 0.55, c0: C('#ffffff'), c1: C('#6fd8ff'), c2: C('#155cff'), breathe: true });
        break;
      case 'soaked':
        B.emit(fx, 'drip', { follow: body, t0: 0, dur, rate: 10, r: 0.35, c0: C('#eefbff'), c1: C('#4fd6ff'), c2: C('#1f8fe0') });
        decalFollow({ kind: 'wash', opacity: 0.6, c0: C('#eefbff'), c1: C('#4fd6ff'), c3: C('#06254a') });
        break;
      case 'gravity':
        decalFollow({ kind: 'spiral', opacity: 0.6, p: [3, 1, 0, 0], scroll: [1.5, 4], c0: C('#fff2d6'), c1: C('#b98cff'), c2: C('#0a0620') });
        B.emit(fx, 'mote', { follow: () => f().add(V(0, 1.8, 0)), t0: 0, dur, rate: 14, r: 0.5, g: -3, c0: C('#fff2d6'), c1: C('#b98cff'), c2: C('#4f9dff') });
        break;
      case 'haste': case 'empowered':
        B.emit(fx, kind === 'haste' ? 'streak' : 'glow', { follow: body, t0: 0, dur, rate: kind === 'haste' ? 16 : 6, r: 0.5, size: kind === 'haste' ? 0.3 : 0.6, c0: C('#ffffff'), c1: fx.pal.glow, c2: fx.pal.edge });
        decalFollow({ kind: 'glyph', opacity: 0.45, p: [8, 4, 0, 0], scroll: [1, 0] });
        break;
      case 'sundered':
        B.emit(fx, 'spark', { follow: body, t0: 0, dur, rate: 6, r: 0.4, speed: [1, 3], c0: C('#ffffff'), c1: C('#ffae69'), c2: C('#ff5a3c') });
        break;
      case 'bleeding':
        B.emit(fx, 'drip', { follow: body, t0: 0, dur, rate: 12, r: 0.3, c0: C('#ffc4cc'), c1: C('#ff2e4d'), c2: C('#7a0712') });
        break;
      case 'cursed': case 'hexed':
        B.emit(fx, 'void', { follow: body, t0: 0, dur, rate: 5, r: 0.4, colors: [C('#1a0a30'), C('#3b2566'), C('#07040f')] });
        B.emit(fx, 'mote', { follow: body, t0: 0, dur, rate: 14, r: 0.5, c0: C('#efe4ff'), c1: C('#a45cff'), c2: C('#3b2566') });
        break;
      case 'slowed':
        decalFollow({ kind: 'clock', opacity: 0.6, scroll: [0.3, 1.5], c0: C('#fff4d6'), c1: C('#ffd27a') });
        B.emit(fx, 'mote', { follow: body, t0: 0, dur, rate: 8, r: 0.5, c0: C('#fff4d6'), c1: C('#ffd27a'), c2: C('#7affd9') });
        break;
      case 'blessed':
        B.emit(fx, 'mote', { follow: body, t0: 0, dur, rate: 14, r: 0.5, g: 1.5, c0: C('#ffffff'), c1: C('#ffe6a0'), c2: C('#ffb547') });
        decalFollow({ kind: 'glyph', opacity: 0.5, p: [8, 6, 0, 0], scroll: [0.6, 0], c0: C('#ffffff'), c1: C('#ffe6a0') });
        break;
      default:
        B.emit(fx, 'mote', { follow: body, t0: 0, dur, rate: 12, r: 0.5 });
    }
  },
};

export { clamp01, easeOut };
