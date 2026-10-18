// VFX library — init(ctx) → { play, castEffect, impact, trail, stopAll, ... } (see game/CONTRACTS.md).
// A data-driven composer: each effect id maps to a recipe that schedules building blocks (blocks.js) on
// an Effect timeline (core.js) split into anticipation → travel/formation → impact → linger → fade.
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { ABILITY_BY_ID } from '@shared/abilities.js';
import { OATHS } from '@shared/oaths.js';
import { Particles } from './particles.js';
import { syncMats } from './shaders.js';
import { glyphTexture } from './textures.js';
import { Effect, LightPool, rng, hex } from './core.js';
import { ELEMENTS, elementOf, paletteFor } from './elements.js';
import { RECIPES } from './recipes/index.js';
import { GENERIC } from './generic.js';

const LIGHTS = { low: 0, medium: 1, high: 3, ultra: 4 };
const MAX_FX = { low: 10, medium: 16, high: 28, ultra: 36 };

class VfxSystem {
  constructor(ctx) {
    this.ctx = ctx; this.scene = ctx.scene;
    this.q = Math.max(0.2, ctx.quality?.particles ?? 1);
    this.tier = ctx.quality?.name ?? 'high';
    this.particles = new Particles(ctx);
    this.lightPool = new LightPool(this.scene, LIGHTS[this.tier] ?? 2);
    this.effects = new Set(); this.maxFx = MAX_FX[this.tier] ?? 24;
    this.timeScale = 1; this.time = 0; this.seq = 1;
    this.solids = new Map();
  }

  /** Cached PBR materials for solid effect geometry. */
  solid(type, tint, emissive) {
    const t = tint ?? Color3.White(); const key = `${type}|${t.toHexString()}|${emissive ?? ''}`;
    let m = this.solids.get(key); if (m) return m;
    m = new PBRMaterial(`fx.solid.${key}`, this.scene);
    m.metallic = 0; m.roughness = 0.6; m.environmentIntensity = 0.9;
    const e = emissive ?? null;
    const T = (k) => new Color3(t.r * k, t.g * k, t.b * k);
    switch (type) {
      case 'ice': m.albedoColor = Color3.Lerp(t, Color3.White(), 0.15).scale(0.45); m.roughness = 0.18; m.metallicF0Factor = 0.4; m.environmentIntensity = 0.5; m.alpha = 0.55; m.emissiveColor = T(e ?? 0.6); break;
      case 'iceSheet': m.albedoColor = t.scale(0.3); m.roughness = 0.12; m.metallicF0Factor = 0.4; m.environmentIntensity = 0.5; m.alpha = 0.28; m.emissiveColor = T(e ?? 0.4); m.indexOfRefraction = 1.31; m.clearCoat.isEnabled = true; m.clearCoat.intensity = 0.8; break;
      case 'crystal': m.albedoColor = t.scale(0.35); m.roughness = 0.28; m.metallicF0Factor = 0.35; m.environmentIntensity = 0.4; m.alpha = 0.8; m.emissiveColor = T(e ?? 0.85); m.clearCoat.isEnabled = true; break;
      case 'glass': m.albedoColor = new Color3(0.85, 0.9, 0.95); m.metallic = 0.9; m.roughness = 0.04; m.alpha = 0.85; m.emissiveColor = T(e ?? 0.25); break;
      case 'obsidian': m.albedoColor = new Color3(0.06, 0.05, 0.08); m.roughness = 0.15; m.metallic = 0.4; m.emissiveColor = T(Math.min(0.18, e ?? 0.15)); m.metallic = 0.1; m.environmentIntensity = 0.3; m.clearCoat.isEnabled = true; break;
      case 'basalt': m.albedoColor = new Color3(0.09, 0.08, 0.085); m.roughness = 0.88; m.emissiveColor = T(e ?? 0.1); break;
      case 'lava': m.albedoColor = new Color3(0.06, 0.045, 0.04); m.roughness = 0.8; m.emissiveColor = T(e ?? 0.45); break;
      case 'metal': m.albedoColor = Color3.Lerp(hex('#b08d57'), t, 0.25); m.metallic = 1; m.roughness = 0.32; m.emissiveColor = T(e ?? 0.05); break;
      case 'steel': m.albedoColor = new Color3(0.55, 0.58, 0.62); m.metallic = 1; m.roughness = 0.28; m.emissiveColor = T(e ?? 0.08); break;
      case 'wood': m.albedoColor = hex('#3b2a1c'); m.roughness = 0.92; m.emissiveColor = T(e ?? 0.04); break;
      case 'thorn': m.albedoColor = Color3.Lerp(hex('#2a0a10'), t, 0.15); m.roughness = 0.45; m.metallic = 0.1; m.emissiveColor = T(e ?? 0.12); m.clearCoat.isEnabled = true; break;
      case 'sand': m.albedoColor = hex('#b8935c'); m.roughness = 1; m.emissiveColor = T(e ?? 0); break;
      case 'bone': m.albedoColor = hex('#d8cdb8'); m.roughness = 0.6; m.emissiveColor = T(e ?? 0.05); break;
      default: m.albedoColor = Color3.Lerp(hex('#3e3a35'), t, 0.06); m.roughness = 0.92; m.emissiveColor = T(e ?? 0.0); // rock
    }
    if (m.alpha < 1) { m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND; m.backFaceCulling = false; }
    m.freeze?.();
    this.solids.set(key, m);
    return m;
  }

  /** Ground height near a point (world module if present, else the point's own y / 0). */
  groundY(p) {
    const w = this.ctx.world;
    if (w?.heightAt) { try { const h = w.heightAt(p.x, p.z); if (Number.isFinite(h)) return h; } catch { /* ignore */ } }
    return this.ctx.vfxGround ?? 0;
  }

  /** Build an Effect with full geometric context. */
  makeFx(id, ab, o) {
    const fx = new Effect(this, { ...o, id });
    const caster = o.caster ?? null;
    const g = (o.pos ? o.pos.clone() : caster?.position?.clone?.()) ?? new Vector3();
    if (!o.pos && caster?.position) g.y = caster.position.y;
    let tgt = o.target ? (o.target.position ?? o.target).clone() : null;
    let dir = o.dir ? new Vector3(o.dir.x, 0, o.dir.z ?? o.dir.y ?? 0) : null;
    if (!dir || dir.lengthSquared() < 1e-6) dir = tgt ? tgt.subtract(g) : new Vector3(0, 0, 1);
    dir.y = 0; if (dir.lengthSquared() < 1e-6) dir.set(0, 0, 1); dir.normalize();
    const range = ab?.range ?? 12;
    if (!tgt) tgt = g.add(dir.scale(ab?.shape === 'self' ? 0 : Math.min(range, ab?.shape === 'zone' ? Math.min(range, 9) : range)));
    const gy = (p) => (this.ctx.world?.heightAt ? this.groundY(p) : (o.groundY ?? g.y));
    tgt.y = gy(tgt);
    fx.sysQ = this.q;
    fx.caster = caster; fx.ab = ab; fx.g = g; fx.dir = dir; fx.tgt = tgt;
    fx.tgtH = tgt.add(new Vector3(0, o.targetHeight ?? 1.1, 0));
    fx.side = Vector3.Cross(Vector3.Up(), dir).normalize();
    let hand = null;
    try { const s = caster?.socket?.('hand.R'); if (s?.getAbsolutePosition) hand = s.getAbsolutePosition().clone(); } catch { hand = null; }
    fx.o = hand ?? g.add(new Vector3(0, 1.3, 0)).add(dir.scale(0.45)).add(fx.side.scale(-0.15));
    fx.dist = Math.max(0.5, Vector3.Distance(new Vector3(g.x, 0, g.z), new Vector3(tgt.x, 0, tgt.z)));
    const scale = o.scale ?? 1;
    fx.R = (o.radius ?? (ab?.radius > 0.2 ? ab.radius : 2.5)) * scale;
    fx.gy = gy;
    fx.rnd = rng(o.seed ?? (this.seq++ * 7919));
    fx.el = ELEMENTS[o.element ?? ab?.element ?? 'arcane'] ?? ELEMENTS.arcane;
    fx.pal = paletteFor(ab?.id, fx.el, o.color);
    if (ab?.glyph) fx.glyph = glyphTexture(this.scene, ab.id, ab.glyph);
    const ant = o.ant ?? Math.max(0.2, Math.min(1.2, (o.castTime ?? ab?.castTime ?? 0.25) + 0.05));
    const speed = ab?.speed > 0 ? Math.max(12, ab.speed) : 30;
    const travel = ab?.shape === 'line' ? Math.min(1.1, Math.max(0.08, fx.dist / speed)) : ab?.shape === 'zone' ? 0.22 : 0.05;
    fx.T = { ant, travel, hit: ant + travel };
    fx.ult = !!o.ultimate; fx.mul = fx.ult ? 1.35 : 1;
    return fx;
  }

  run(fx, recipe) {
    if (this.effects.size >= this.maxFx) {
      // drop the oldest non-local effect to make room (local casts always play)
      let victim = null; for (const e of this.effects) if (!e.opts.local) { victim = e; break; }
      if (!victim && !fx.opts.local) return null;
      victim?.dispose(); this.effects.delete(victim);
    }
    const cam = this.scene.activeCamera;
    const far = cam && Vector3.Distance(cam.globalPosition, fx.tgt) > (fx.opts.local ? 1e9 : 110);
    try {
      if (far) GENERIC.impactOnly(fx); else recipe(fx);
    } catch (err) { console.warn('[vfx] recipe failed', fx.id, err); fx.dispose(); return null; }
    this.effects.add(fx);
    return handleOf(fx);
  }

  update(dt) {
    const sdt = dt * this.timeScale; this.time += sdt;
    this.particles.update(dt);
    for (const fx of this.effects) { fx.update(sdt); if (fx.done) this.effects.delete(fx); }
    syncMats(this.scene, this.time);
  }

  setTimeScale(s) { this.timeScale = s; this.particles.setTimeScale(s); }

  stopAll() { for (const fx of this.effects) fx.dispose(); this.effects.clear(); this.particles.stopAll(); }
}

function handleOf(fx) {
  return { effect: fx, get done() { return fx.done; }, get time() { return fx.t; }, stop() { fx.dispose(); } };
}

const toV = (p) => (p ? (p.position ? p.position : p.x !== undefined ? new Vector3(p.x, p.y ?? 0, p.z ?? 0) : null) : null);

export async function init(ctx) {
  let sys;
  try { sys = new VfxSystem(ctx); } catch (err) {
    console.warn('[vfx] init failed, effects disabled', err);
    return { play() { return null; }, castEffect() { return null; }, impact() { return null; }, trail() { return null; }, stopAll() {}, elementOf };
  }
  ctx.addUpdate?.((dt) => sys.update(dt), 35);

  const resolveTarget = (o) => {
    if (!o) return null;
    const t = o.target; if (!t) return null;
    if (t.position) return t.position.clone();
    if (t.x !== undefined) return new Vector3(t.x, t.y ?? 0, t.z ?? 0);
    return null;
  };

  const api = {
    sys,
    /**
     * Play an effect by id: an ability uid ('codex/riptide'), 'basic:ninja:<element>', 'basic:sorcerer:<element>',
     * 'impact:<element>', 'death:<element>', 'heal', 'levelup', 'telegraph', 'dodge'.
     * opts: {pos, dir, target (Vector3|actor|{x,y,z}), color, scale, duration, attachTo, caster, castTime, element, local, shake, ultimate}
     */
    play(effectId, opts = {}) {
      try {
        const o = { ...opts };
        if (o.attachTo && !o.caster) o.caster = o.attachTo;
        if (o.pos && !(o.pos instanceof Vector3)) o.pos = toV(o.pos);
        const tv = resolveTarget(o); if (tv) o.target = tv; else delete o.target;
        if (o.color && typeof o.color === 'string') o.color = hex(o.color);
        const ab = ABILITY_BY_ID[effectId];
        if (ab) { const fx = sys.makeFx(effectId, ab, o); return sys.run(fx, RECIPES[effectId] ?? GENERIC.ability); }
        const [kind, a1, a2] = String(effectId).split(':');
        const element = o.element ?? (kind === 'basic' || kind === 'ultimate' ? a2 : a1) ?? 'arcane';
        const fake = { id: effectId, element, shape: kind === 'basic' ? (a1 === 'ninja' ? 'melee' : 'line') : kind === 'zone' ? 'zone' : 'self', range: kind === 'basic' ? (a1 === 'ninja' ? 3.2 : 22) : 0, radius: o.radius ?? 1.2, speed: 34, castTime: 0 };
        const fx = sys.makeFx(effectId, fake, { ...o, element, ant: o.ant ?? (kind === 'basic' ? 0.12 : 0.01) });
        const recipe = GENERIC[kind]?.bind?.(null) ?? GENERIC.impact;
        return sys.run(fx, (f) => recipe(f, a1, a2));
      } catch (err) { console.warn('[vfx] play failed', effectId, err); return null; }
    },
    /** Full cast effect for an ability (hotbar entry or catalog ability). */
    castEffect(ability, opts = {}) {
      if (!ability) return null;
      if (ability.kind === 'basic' || String(ability.id).startsWith('basic/')) {
        const cls = String(ability.id).split('/')[1] ?? 'ninja';
        const element = opts.element ?? elementOf(opts.caster?.oath) ?? 'arcane';
        return api.play(`basic:${cls}:${element}`, opts);
      }
      return api.play(ability.id, { castTime: ability.castTime, ultimate: ability.slot === 4 || opts.ultimate, ...opts });
    },
    impact(element, pos, scale = 1, opts = {}) { return api.play(`impact:${element ?? 'arcane'}`, { ...opts, pos: toV(pos), scale }); },
    /** Persistent elemental trail following a mesh / transform node. Returns {stop()}. */
    trail(mesh, element = 'arcane', opts = {}) {
      if (!mesh) return null;
      const getP = () => (mesh.getAbsolutePosition ? mesh.getAbsolutePosition() : mesh.position);
      return api.play(`trail:${element}`, { ...opts, pos: getP().clone(), follow: getP, duration: opts.duration ?? 600 });
    },
    /** Persistent status visual on an actor (or point). Returns handle with stop(). */
    status(actor, kind, duration = 4, opts = {}) {
      const follow = actor?.position ? () => actor.position : null;
      return api.play(`status:${kind}`, { ...opts, pos: actor?.position?.clone?.() ?? toV(opts.pos), follow, duration });
    },
    stopAll() { sys.stopAll(); },
    setTimeScale(s) { sys.setTimeScale(s); },
    elementOf,
    get count() { return sys.effects.size; },
  };
  return api;
}

export { elementOf, OATHS };
