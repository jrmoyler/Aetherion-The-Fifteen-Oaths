// Particle layer: one call (`emit(preset, opts)`) gives a running emitter driven by our phase scheduler.
// Uses GPUParticleSystem where the platform supports it (`?gpu=0` forces the CPU path) and the CPU
// ParticleSystem otherwise. Systems are pooled per preset/colour/size key, capped globally, and every
// rate/burst/capacity is scaled by ctx.quality.particles. All times are in seconds (updateSpeed = 1/60).
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { GPUParticleSystem } from '@babylonjs/core/Particles/gpuParticleSystem.js';
import '@babylonjs/core/Particles/particleSystemComponent.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { getTexture } from './textures.js';

/** Preset library. size = base metres, life = [min,max] s, speed = [min,max] m/s, g = gravity y. */
export const PRESETS = {
  spark: { tex: 'spark', blend: 'add', stretch: true, life: [0.25, 0.6], size: 0.12, speed: [6, 14], g: -9, drag: 0.4, grow: [1, 0.3], cap: 400 },
  ember: { tex: 'ember', blend: 'add', life: [0.8, 1.8], size: 0.08, speed: [0.5, 2.5], g: 1.2, grow: [1, 0.2], cap: 400, spin: 0 },
  glow: { tex: 'dot', blend: 'add', life: [0.3, 0.7], size: 0.6, speed: [0, 0.6], g: 0, grow: [0.6, 1.4], cap: 160 },
  mote: { tex: 'dot', blend: 'add', life: [1, 2.2], size: 0.1, speed: [0.2, 1], g: 0.4, grow: [0.4, 1, 0], cap: 300 },
  smoke: { tex: 'smoke', blend: 'normal', life: [1.2, 2.6], size: 1.2, speed: [0.3, 1.2], g: 0.6, grow: [0.5, 2.2], cap: 160, spin: 0.6 },
  steam: { tex: 'smoke', blend: 'add', life: [0.8, 1.8], size: 1.0, speed: [0.4, 1.5], g: 1.2, grow: [0.4, 2.4], cap: 160, spin: 0.5 },
  mist: { tex: 'smoke', blend: 'add', life: [1.2, 2.4], size: 1.6, speed: [0.1, 0.5], g: 0.05, grow: [0.6, 1.8], cap: 120, spin: 0.2 },
  dust: { tex: 'smoke', blend: 'normal', life: [0.8, 1.8], size: 0.9, speed: [1, 4], g: 0.3, grow: [0.4, 2.0], cap: 160, spin: 0.4, drag: 0.6 },
  splash: { tex: 'drop', blend: 'add', stretch: true, life: [0.5, 1.1], size: 0.22, speed: [3, 9], g: -12, grow: [1, 0.6], cap: 500 },
  foam: { tex: 'smoke', blend: 'add', life: [0.5, 1.2], size: 0.7, speed: [0.5, 3], g: -2, grow: [0.5, 1.6], cap: 200, spin: 0.8 },
  snow: { tex: 'dot', blend: 'add', life: [1, 2.5], size: 0.07, speed: [0.3, 2], g: -0.6, grow: [1, 0.5], cap: 400 },
  shard: { tex: 'shard', blend: 'add', life: [0.5, 1.2], size: 0.25, speed: [3, 8], g: -9, grow: [1, 0.7], cap: 200, spin: 6 },
  rock: { tex: 'rock', blend: 'normal', life: [0.6, 1.4], size: 0.35, speed: [3, 8], g: -14, grow: [1, 0.9], cap: 160, spin: 4, dark: true },
  leaf: { tex: 'leaf', blend: 'normal', life: [1.2, 2.4], size: 0.22, speed: [1, 4], g: -0.8, grow: [1, 0.8], cap: 200, spin: 3 },
  petal: { tex: 'leaf', blend: 'add', life: [1, 2], size: 0.14, speed: [1, 3], g: -0.3, grow: [1, 0.6], cap: 240, spin: 4 },
  bubble: { tex: 'bubble', blend: 'add', life: [0.8, 1.8], size: 0.18, speed: [0.3, 1.2], g: 0.8, grow: [0.6, 1.2], cap: 200 },
  drip: { tex: 'drop', blend: 'add', stretch: true, life: [0.5, 1.0], size: 0.1, speed: [0.2, 1], g: -9, grow: [1, 0.8], cap: 200 },
  flare: { tex: 'flare', blend: 'add', life: [0.15, 0.3], size: 2.2, speed: [0, 0], g: 0, grow: [0.6, 1.3, 0], cap: 16 },
  streak: { tex: 'streak', blend: 'add', stretch: true, life: [0.3, 0.7], size: 0.5, speed: [8, 16], g: 0, grow: [1, 0.4], cap: 200 },
  ring: { tex: 'ring', blend: 'add', life: [0.4, 0.7], size: 1, speed: [0, 0], g: 0, grow: [0.3, 3, 0], cap: 24 },
  flame: { tex: 'flame', blend: 'add', life: [0.4, 0.9], size: 0.8, speed: [1, 2.5], g: 2.5, grow: [1, 0.25], cap: 300, spin: 0.25 },
  void: { tex: 'smoke#9', blend: 'normal', life: [0.8, 1.8], size: 1.0, speed: [0.2, 1.0], g: 0.2, grow: [0.6, 1.6], cap: 160, spin: 0.7, dark: true },
};

const tmpV = new Vector3();
const c4 = (c, a = 1) => new Color4(c.r, c.g, c.b, a);

export class Particles {
  constructor(ctx) {
    this.ctx = ctx; this.scene = ctx.scene;
    this.q = Math.max(0.15, ctx.quality?.particles ?? 1);
    const force = ctx.params?.get?.('gpu');
    let gpuOk = false; try { gpuOk = GPUParticleSystem.IsSupported; } catch { gpuOk = false; }
    this.gpu = force === '0' ? false : force === '1' ? gpuOk : gpuOk;
    this.pools = new Map(); this.live = new Set(); this.idle = 0;
    this.maxLive = Math.round(24 + 56 * Math.min(1, this.q));
    this.timeScale = 1;
  }

  _create(key, pre, cap) {
    let ps = null;
    if (this.gpu) {
      try { ps = new GPUParticleSystem(`fx.p.${key}`, { capacity: cap, emitRateControl: true }, this.scene); } catch { this.gpu = false; ps = null; }
    }
    if (!ps) ps = new ParticleSystem(`fx.p.${key}`, cap, this.scene);
    ps.particleTexture = getTexture(this.scene, pre.tex, pre.tex.startsWith('smoke') || pre.tex === 'flame' ? 128 : 64);
    ps.blendMode = pre.blend === 'normal' ? ParticleSystem.BLENDMODE_STANDARD : ParticleSystem.BLENDMODE_ADD;
    if (pre.stretch) ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    ps.isLocal = false; ps.disposeOnStop = false; ps.preventAutoStart = true;
    ps.updateSpeed = 1 / 60; ps._fxBaseSpeed = 1 / 60;
    ps.emitRate = 0; ps.manualEmitCount = -1;
    ps.minEmitPower = 1; ps.maxEmitPower = 1;
    return ps;
  }

  /**
   * Start an emitter. opts: pos (Vector3, live-updated if you keep the ref), colors [c0,c1,c2] (Color3),
   * rate (per s), burst (count once), dur (s; emission window, Infinity = until stop), size, speed [min,max],
   * life [min,max], shape ('sphere'|'up'|'dir'|'disc'|'box'|'point'), r (shape radius), dir (Vector3), spread (0..1),
   * g (gravity override), alpha.
   */
  emit(name, o = {}) {
    const pre = PRESETS[name] ?? PRESETS.glow;
    if (this.live.size >= this.maxLive) return DUMMY;
    const cols = o.colors ?? [Color3.White(), Color3.White(), Color3.White()];
    const size = (o.size ?? pre.size) * (o.scale ?? 1);
    const key = `${name}|${cols.map((c) => c.toHexString()).join('')}|${Math.round(size * 20)}|${o.alpha ?? 1}`;
    const cap = Math.max(16, Math.round((o.cap ?? pre.cap) * Math.min(1, this.q * 1.2)));
    let list = this.pools.get(key); if (!list) { list = []; this.pools.set(key, list); }
    let ps = list.pop(); if (ps) this.idle--;
    const fresh = !ps;
    if (!ps) ps = this._create(key, pre, cap);
    if (fresh) {
      const a = o.alpha ?? 1; const dark = pre.dark || pre.blend === 'normal';
      const [g0, g1, g2] = pre.grow;
      ps.addSizeGradient(0, size * g0 * 0.7, size * g0 * 1.2);
      if (g2 !== undefined) { ps.addSizeGradient(0.5, size * g1 * 0.8, size * g1 * 1.1); ps.addSizeGradient(1, size * g2 + 0.001); } else ps.addSizeGradient(1, size * g1 * 0.8, size * g1 * 1.1);
      const k = dark ? 0.75 : 1;
      ps.addColorGradient(0, c4(cols[0], a * k), c4(cols[1] ?? cols[0], a * k));
      ps.addColorGradient(0.35, c4(cols[1] ?? cols[0], a * 0.9 * k));
      ps.addColorGradient(1, c4(cols[2] ?? cols[1] ?? cols[0], 0));
      if (pre.stretch) { ps.minScaleX = 0.6; ps.maxScaleX = 1; ps.minScaleY = 2.5; ps.maxScaleY = 4.5; }
    }
    const life = o.life ?? pre.life; ps.minLifeTime = life[0]; ps.maxLifeTime = life[1];
    const sp = o.speed ?? pre.speed; ps.minEmitPower = sp[0]; ps.maxEmitPower = sp[1];
    ps.gravity.set(0, o.g ?? pre.g, 0);
    const spin = pre.spin ?? 0; ps.minAngularSpeed = -spin; ps.maxAngularSpeed = spin; ps.minInitialRotation = 0; ps.maxInitialRotation = spin ? Math.PI * 2 : 0;
    this._shape(ps, o);
    const pos = o.pos ?? new Vector3();
    ps.emitter = pos;
    const q = this.q;
    ps.emitRate = 0; ps.manualEmitCount = -1;
    ps.updateSpeed = ps._fxBaseSpeed * this.timeScale;
    ps.start();
    const h = {
      ps, pos, alive: true, t: 0, rate: (o.rate ?? 0) * q, dur: o.dur ?? (o.rate ? Infinity : 0), burst: Math.round((o.burst ?? 0) * q), maxLife: life[1], key, mgr: this,
      stopAt: null,
      stop() { if (!this.alive) return; this.dur = Math.min(this.dur, this.t); this.ps.emitRate = 0; },
    };
    if (h.burst > 0) { ps.manualEmitCount = h.burst; }
    if (h.rate > 0 && h.dur > 0) ps.emitRate = h.rate;
    this.live.add(h);
    return h;
  }

  _shape(ps, o) {
    const r = o.r ?? 0.2; const shape = o.shape ?? 'sphere';
    if (shape === 'sphere') ps.createSphereEmitter(r, 0.3);
    else if (shape === 'shell') ps.createSphereEmitter(r, 0).radiusRange = 0;
    else if (shape === 'up') ps.createConeEmitter(r, o.spread ?? 0.5);
    else if (shape === 'disc') { const e = ps.createCylinderEmitter(r, o.h ?? 0.05, o.radiusRange ?? 1, o.spread ?? 0.4); e.radiusRange = o.radiusRange ?? 1; }
    else if (shape === 'box') { const s = o.box ?? [r, r, r]; ps.createBoxEmitter(o.dir1 ?? new Vector3(-0.3, 1, -0.3), o.dir2 ?? new Vector3(0.3, 1, 0.3), new Vector3(-s[0], -s[1], -s[2]), new Vector3(s[0], s[1], s[2])); }
    else { // 'dir' / 'point': cone around o.dir
      const d = (o.dir ?? new Vector3(0, 1, 0)).clone().normalize(); const sp = o.spread ?? 0.3;
      const side = Math.abs(d.y) > 0.9 ? new Vector3(1, 0, 0) : Vector3.Cross(d, Vector3.Up()).normalize(); const up = Vector3.Cross(side, d).normalize();
      if (shape === 'dir' && r > 0.001) {
        ps.createBoxEmitter(d.subtract(side.scale(sp)).subtract(up.scale(sp)), d.add(side.scale(sp)).add(up.scale(sp)), new Vector3(-r, -r, -r), new Vector3(r, r, r));
      } else ps.createPointEmitter(d.subtract(side.scale(sp)).subtract(up.scale(sp)), d.add(side.scale(sp)).add(up.scale(sp)));
    }
  }

  setTimeScale(s) {
    this.timeScale = s;
    for (const h of this.live) h.ps.updateSpeed = h.ps._fxBaseSpeed * s;
  }

  update(dt) {
    const sdt = dt * this.timeScale;
    for (const h of this.live) {
      h.t += sdt;
      if (h.burst > 0 && h.t > 0 && h.ps.manualEmitCount === 0) { h.ps.manualEmitCount = -1; h.burst = 0; if (h.alive && h.rate > 0 && h.t < h.dur) h.ps.emitRate = h.rate; }
      if (h.alive && h.t >= h.dur) { h.ps.emitRate = 0; h.alive = false; h.stopAt = h.t; }
      if (!h.alive && h.t >= h.stopAt + h.maxLife + 0.15) this._release(h);
    }
  }

  _release(h) {
    this.live.delete(h);
    const ps = h.ps; ps.stop(); try { ps.reset(); } catch { /* gpu reset may fail on lost ctx */ }
    const list = this.pools.get(h.key);
    if (list && list.length < 3 && this.idle < 72) { list.push(ps); this.idle++; } else ps.dispose();
  }

  stopAll() { for (const h of [...this.live]) this._release(h); }
}

const DUMMY = { ps: null, pos: new Vector3(), alive: false, stop() {}, dummy: true };
export { tmpV };
