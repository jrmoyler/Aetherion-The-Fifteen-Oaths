import { Mesh, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { createArcGeometry, createLodestoneGeometry, createPlugGeometry, createQuad } from './geometry.js';
import { createArcMaterial, createLensMaterial, createSocketMaterial, createStrataRockMaterial } from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/strata-exchange';

const PI = Math.PI;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const inOutCubic = (x) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const outCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);
/** Ease out past the mark by `over` (fraction) and back. */
const outBack = (x, over) => {
  const t = clamp01(x);
  const s = over * 10;
  return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
};

/** Bodies the cast may knock down, crush or carry, all told. */
const MAX_TARGETS = 12;
/** Bodies that may ride the plugs at once. */
const MAX_CARRY = 8;
/** The torn root hangs this far below the banded body (× plugDepth). */
const ROOT = 1.35;

const _up = new Vector3(0, 1, 0);
const _A = new Vector3();
const _B = new Vector3();
const _M = new Vector3();
const _off = new Vector3();
const _w = new Vector3();
const _pos = new Vector3();
const _dir = new Vector3();
const _mid = new Vector3();
const _h = new Vector3();
const _v = new Vector3();
const _body = new Vector3();
/** Reused particle option bag (the engine reads it, never retains it). */
const _emit = {
  position: null, radius: 0, direction: _up, speed: 0, speedVariance: 0.4, spread: 0.6,
  inherit: null, anchor: null, size: 0.1, sizeVariance: 0.4, life: 1, lifeVariance: 0.35, spin: 0, tint: null, time: 0,
};

/**
 * STRATA EXCHANGE — Earth, zone cast. *Terrain exchange.*
 *
 * The ground itself is the projectile. Two circles of floor are cut, torn out
 * whole and **traded**:
 *
 *  1. **Anticipation / travel.** A ridged, strata-banded lodestone forms at
 *     the hand and is lobbed in a high arc to the target, trailing gold
 *     motes. While it flies, two telegraph circles scribe themselves on the
 *     floor — the target socket and its twin, `2·zoneRadius + socketGap`
 *     away along `exchangeBearing`. Both sites are read before anything lands.
 *  2. **Impact — the key.** The lodestone drives into the target. On that one
 *     frame both kerfs burn open, radial cracks run out, an EARTH shell and
 *     chips burst from both rims, the light punches, the camera knocks and a
 *     pressure ring runs through the ground.
 *  3. **The heave.** Both plugs tear out of the floor — crown, five strata
 *     bands, a torn root of rubble — and hang at `heaveHeight`, shuddering,
 *     clods raining off their roots, their seams charging with light. Each
 *     socket is now a *pit* (interior-mapped: you look down past banded walls
 *     to the rubble floor). Everything standing on a plug is knocked down and
 *     rides it.
 *  4. **The exchange** (linger, part one). The two plugs trade places along
 *     two glowing arcs: one vaults high over, the other swings round
 *     beneath, each spinning and banking — and **drops into the other's
 *     socket**: the slam. Carried bodies are thrown out of their new
 *     ground; anyone who walked into an open pit is crushed.
 *  5. **The lock** (linger, part two). The plugs bounce, settle a hand proud
 *     of the floor and grind a quarter turn into place as their seams cool
 *     and dust trickles from the kerfs.
 *  6. **Exit.** The plugs sink flush and below; the kerfs close through
 *     noise and the cracks fade.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the plugs** — the hero: authored strata geometry
 *      (`createPlugGeometry`) in a lit, shadow-casting patched standard
 *      material (`createStrataRockMaterial`) on `LAYER.WORLD`.
 *   2. **the sockets** — `createSocketMaterial`: telegraph, kerf, cracks,
 *      dust stain and the interior-mapped pit. Two discs.
 *   3. **the lodestone** — the travel: lathe spindle in the same rock.
 *   4. **the exchange arcs** — `createArcMaterial` tubes, shaped in the
 *      vertex shader from the live span, so the plugs always ride them.
 *   5. **particles** — CHIP rock (bursts and roots raining clods), SMOKE
 *      dust (bursts, trickle, exit), SOFT gold motes (stone trail, arcs).
 *   6. **the beats** — EARTH bursts, CRACK / DUSTRING / SHOCKWAVE decals,
 *      flash, camera knock, light punch at the key and at the slam.
 *   7. **the lens** — `createLensMaterial` on `LAYER.DISTORTION`.
 *
 * ## Gameplay (`handlesOwnHits`)
 *
 * The exchange is a real, bounded rule. At the heave, every enemy on either
 * plug is hit once (knocked down, lifted). Downed bodies on either plug are
 * *carried* with it (`Dummy#carry`) and released at the slam in the other
 * socket, thrown outward. At the slam, enemies standing in a landing socket
 * that were not already hit are crushed (hit once), and with the combat
 * manager on, a `terrain-impact` imprint is written at both sockets. At most
 * `MAX_TARGETS` hits per cast; nobody is hit twice.
 *
 * ## The editor rule
 *
 * A cast stores dice (seed, base yaws) and which beats have fired; every
 * position, size, colour and timing is derived from `settings.strataExchange`
 * every frame — the twin socket, both arcs and both landings follow the
 * radius, gap and bearing sliders mid-cast.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return 2;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    const c = this.config;
    return (c.heaveTime + c.holdTime + c.swapTime + c.dropTime + c.settleTime) * settings.global.lifetime;
  }

  get fadeDuration() {
    return Math.max(0.1, this.config.exitTime * settings.global.lifetime);
  }

  /** Beat boundaries, seconds into the impact phase. */
  _beats() {
    const c = this.config;
    const L = settings.global.lifetime;
    const b = this._b;
    b.heave = c.heaveTime * L;
    b.swapStart = b.heave + c.holdTime * L;
    b.swapEnd = b.swapStart + c.swapTime * L;
    b.slam = b.swapEnd + c.dropTime * L;
    b.end = b.slam + c.settleTime * L;
    return b;
  }

  /** Seconds since the key (−1 while travelling), running on through the fade. */
  get _k() {
    if (this.phase === 'travel' || this.phase === 'idle') return -1;
    return this.phase === 'fade' ? this.impactDuration + this.fadeTime : this.impactTime;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.resources = [];
    const own = (x) => {
      this.resources.push(x);
      return x;
    };
    const quad = own(createQuad());

    // 2 · the sockets — drawn first, under everything.
    this.sockets = [];
    this.socketMats = [];
    for (let j = 0; j < 2; j++) {
      const mat = own(createSocketMaterial());
      const mesh = new Mesh(quad, mat);
      mesh.rotation.x = -PI / 2;
      mesh.renderOrder = 1;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.sockets.push(mesh);
      this.socketMats.push(mat);
    }

    // 1 · the plugs — lit, solid, shadowing; the hero.
    this.rock = own(createStrataRockMaterial('plug'));
    this.plugs = [];
    for (let i = 0; i < 2; i++) {
      const plug = new Mesh(own(createPlugGeometry(11 + i * 29)), this.rock);
      plug.rotation.order = 'YXZ';
      plug.castShadow = true;
      plug.receiveShadow = true;
      plug.layers.set(LAYER.WORLD);
      plug.frustumCulled = false;
      plug.visible = false;
      this.group.add(plug);
      this.plugs.push(plug);
    }

    // 3 · the lodestone
    this.stoneMat = own(createStrataRockMaterial('stone'));
    this.stone = new Mesh(own(createLodestoneGeometry()), this.stoneMat);
    this.stone.castShadow = true;
    this.stone.layers.set(LAYER.WORLD);
    this.stone.visible = false;
    this.group.add(this.stone);

    // 4 · the exchange arcs
    const arcGeometry = own(createArcGeometry());
    this.arcs = [];
    this.arcMats = [];
    for (let i = 0; i < 2; i++) {
      const mat = own(createArcMaterial());
      const arc = new Mesh(arcGeometry, mat);
      arc.frustumCulled = false;
      arc.renderOrder = 5;
      arc.visible = false;
      this.group.add(arc);
      this.arcs.push(arc);
      this.arcMats.push(mat);
    }

    // 7 · the lens (opaque proxy, distortion layer only)
    this.lensMat = own(createLensMaterial());
    this.lenses = [];
    for (let j = 0; j < 2; j++) {
      const lens = new Mesh(quad, this.lensMat);
      lens.rotation.x = -PI / 2;
      lens.frustumCulled = false;
      lens.visible = false;
      this.group.add(lens);
      this.lenses.push(lens);
    }

    routeExpansionTransparency(this.group);
    for (const lens of this.lenses) lens.layers.set(LAYER.DISTORTION);
    for (const plug of this.plugs) plug.layers.set(LAYER.WORLD);
    this.stone.layers.set(LAYER.WORLD);

    /* --- per-cast state: dice and fired beats only --- */
    this._b = { heave: 0, swapStart: 0, swapEnd: 0, slam: 0, end: 0 };
    this._seed = 0;
    this._yaw0 = new Float32Array(2);
    this._crown = [new Vector3(), new Vector3()];
    this._prevCrown = [new Vector3(), new Vector3()];
    this._vel = [new Vector3(), new Vector3()];
    this._yaw = new Float32Array(2);
    this._bank = new Float32Array(2);
    this._carried = new Array(MAX_CARRY).fill(null);
    this._carriedOn = new Int8Array(MAX_CARRY);
    this._carryCount = 0;
    this._hitIds = new Set();
    this._hitBodies = new Set();
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._fieldDrum = 0;
    // The current a carried body rides: its plug's velocity plus a spring to
    // just above its crown. Built once; reads the live plug state.
    this._field = (x, y, z, out) => {
      const crown = this._crown[this._fieldDrum];
      const vel = this._vel[this._fieldDrum];
      const k = 7;
      out.set((crown.x - x) * k + vel.x, (crown.y + 0.45 - y) * k + vel.y, (crown.z - z) * k + vel.z);
    };
    this._gritEmitters = [new RateEmitter(), new RateEmitter()];
    this._moteEmitters = [new RateEmitter(), new RateEmitter()];
    this._dustEmitter = new RateEmitter();

    this._rockState = { charge: 0, clock: 0, fade: 1 };
    this._stoneState = { charge: 1, clock: 0, fade: 1 };
    this._socketState = { radius: 1, outer: 2, depth: 1, floor: 0, cap: 1, open: 0, scribe: 0, heal: 0, pulse: 0, seed: 0, fade: 1 };
    this._arcState = { mid: _mid, h: _h, v: _v, draw: 0, head: 0, flow: 0, fade: 0 };
    this._lensState = { shock: 0, wave: 0, seed: 0 };
    this._disposed = false;
  }

  createParticles() {
    const particles = this.ctx.particles;
    // Optional: a bare test context has none, and the cast must still run.
    this.dust = particles?.get?.(`${ID}.dust`, { capacity: 700, shape: ParticleShape.SMOKE, additive: false, curl: true, softFade: 0.9 }) ?? null;
    if (this.dust) {
      const u = this.dust.uniforms;
      u.uSizeIn.value = 0.15;
      u.uFadeIn.value = 0.08;
      u.uFadeOut.value = 0.6;
      u.uEndSize.value = 2.4;
      u.uDrag.value = 1.8;
    }
    this.chips = particles?.get?.(`${ID}.chips`, { capacity: 900, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.2 }) ?? null;
    if (this.chips) {
      const u = this.chips.uniforms;
      u.uSizeIn.value = 0.02;
      u.uFadeIn.value = 0.02;
      u.uFadeOut.value = 0.25;
      u.uEndSize.value = 0.8;
      u.uDrag.value = 0.25;
    }
    this.motes = particles?.get?.(`${ID}.motes`, { capacity: 500, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.4 }) ?? null;
    if (this.motes) {
      const u = this.motes.uniforms;
      u.uSizeIn.value = 0.1;
      u.uFadeOut.value = 0.5;
      u.uEndSize.value = 0.2;
      u.uDrag.value = 1.2;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this.hitCount = 0;
    this._hitIds.clear();
    this._hitBodies.clear();
    this._dropCarried();
    this._seized = false;
    this._slammed = false;
    this._clock = 0;
    this._calm = prefersReducedMotion();
    this._seed = Math.random() * 100;
    this._yaw0[0] = Math.random() * PI * 2;
    this._yaw0[1] = Math.random() * PI * 2;
    for (const e of this._gritEmitters) e.reset();
    for (const e of this._moteEmitters) e.reset();
    this._dustEmitter.reset();
    for (let i = 0; i < 2; i++) {
      this.plugs[i].visible = false;
      this._crown[i].set(0, -10, 0);
      this._prevCrown[i].copy(this._crown[i]);
      this._vel[i].set(0, 0, 0);
    }
    this.stone.visible = true;
    for (const s of this.sockets) s.visible = true;
    this._sync(0);
  }

  onTravel(dt) {
    const c = this.config;
    // The lodestone trails gold motes.
    if (this.motes && this.stone.visible) {
      const n = this._moteEmitters[0].tick(dt, c.moteRate * 0.6 * settings.global.particleCount);
      if (n) this._emitMotes(n, this.stone.position, 0.12, 0.4);
    }
    this._sync(dt);
  }

  onImpact() {
    this._sync(0);
    this._key();
  }

  onFade(dt) {
    const b = this._beats();
    const k = this._k;
    if (!this._seized && k >= b.heave * 0.3) {
      this._seized = true;
      this._seize();
    }
    if (this._seized && !this._slammed && k < b.swapStart + 0.1) this._gather();
    if (this._seized && !this._slammed) this._carry();
    if (!this._slammed && k >= b.slam) {
      this._slammed = true;
      this._slam();
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Placement — derived from settings, every frame                       */
  /* ------------------------------------------------------------------ */

  /** Target socket A, twin socket B, their midpoint M and the swing side w. */
  _place() {
    const c = this.config;
    const R = c.zoneRadius;
    const span = 2 * R + c.socketGap;
    this.pointAt(1, _A);
    _off.copy(this.side).multiplyScalar(Math.cos(c.exchangeBearing)).addScaledVector(this.direction, -Math.sin(c.exchangeBearing));
    _B.copy(_A).addScaledVector(_off, span);
    _M.copy(_A).add(_B).multiplyScalar(0.5);
    // The swinging plug passes on the far side, away from the caster.
    _w.crossVectors(_up, _off).normalize();
    if (_w.dot(this.direction) < 0) _w.negate();
    return span * 0.5;
  }

  /** Crown position, yaw and bank of plug `i` at `k` seconds after the key. */
  _pose(i, k, half) {
    const c = this.config;
    const b = this._b;
    const out = this._crown[i];
    const home = i === 0 ? _A : _B;
    const away = i === 0 ? _B : _A;
    const heave = c.heaveHeight;
    let yaw = this._yaw0[i];
    let bank = 0;
    const calm = this._calm;
    if (k < 0) {
      out.copy(home).setY(-0.05);
    } else if (k < b.heave) {
      out.copy(home).setY(-0.05 + (heave + 0.05) * outBack(k / Math.max(1e-3, b.heave), c.heaveOvershoot));
    } else if (k < b.swapStart) {
      const sh = calm ? 0 : c.shudder;
      out.copy(home).setY(heave + Math.sin(this.age * 41 + i * 2.1) * sh);
      out.x += Math.sin(this.age * 53 + i) * sh * 0.6;
      out.z += Math.cos(this.age * 47 + i) * sh * 0.6;
    } else if (k < b.swapEnd) {
      const s = inOutCubic((k - b.swapStart) / Math.max(1e-3, b.swapEnd - b.swapStart));
      const th = s * PI;
      out.copy(_M).setY(heave);
      _h.copy(home).sub(_M).setY(0);
      out.addScaledVector(_h, Math.cos(th));
      if (i === 0) out.addScaledVector(_up, Math.sin(th) * c.vaultHeight);
      else out.addScaledVector(_w, Math.sin(th) * half * c.swingWidth);
      yaw += calm ? 0 : c.swapSpin * s * (i ? -1 : 1);
      bank = calm ? 0 : c.swapBank * Math.sin(th) * (i ? 1 : -1);
    } else if (k < b.slam) {
      const s = clamp01((k - b.swapEnd) / Math.max(1e-3, b.slam - b.swapEnd));
      out.copy(away).setY(heave + (c.settleProud - c.slamSink - heave) * s * s);
      yaw += calm ? 0 : c.swapSpin * (i ? -1 : 1);
    } else {
      yaw += calm ? 0 : c.swapSpin * (i ? -1 : 1);
      const s = clamp01((k - b.slam) / Math.max(1e-3, b.end - b.slam));
      // Bounce off the slam and settle standing proud of the floor; grind into the lock.
      const settle = c.settleProud - c.slamSink * Math.exp(-5 * s) * Math.cos(9 * s);
      out.copy(away).setY(settle);
      yaw += calm ? 0 : c.lockTwist * outCubic(s) * (i ? 1 : -1);
      if (!calm && s < 0.6) {
        const grind = (1 - s / 0.6) * 0.025;
        out.x += Math.sin(this.age * 61 + i) * grind;
        out.z += Math.cos(this.age * 57 + i) * grind;
      }
      if (k > b.end) {
        // The exit: sink flush and under.
        const e = clamp01((k - b.end) / this.fadeDuration);
        out.y = c.settleProud + (-(c.plugDepth * ROOT + 0.15) - c.settleProud) * e * e;
      }
    }
    this._yaw[i] = yaw;
    this._bank[i] = bank;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* The beats                                                           */
  /* ------------------------------------------------------------------ */

  /** The lodestone keys the ground: both kerfs burn open on one frame. */
  _key() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    this._place();
    this.stone.visible = false;
    this.lightBoost = c.keyLight * power;
    for (let j = 0; j < 2; j++) {
      const at = j === 0 ? _A : _B;
      _pos.copy(at).setY(0.05);
      this._burstAt(_pos, 1);
      // A ring of cracks round the kerf (the socket shader draws the cracks
      // that stay; a full CRACK disc would paint over the pit).
      this.ctx.decals?.spawn?.(DecalType.CRACK, _pos, {
        radius: c.zoneRadius * (1 + c.crackReach), life: c.decalLife * 0.35, intensity: c.crackIntensity * 0.5,
        colorA: getColor(c.colorTint), colorB: getColor(c.colorDeep),
      });
    }
    if (c.keyShake > 0) this.ctx.shake?.add?.(c.keyShake * power * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.keyFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.keyFlash * power);
  }

  /** Shell, chips and dust at a socket rim. */
  _burstAt(at, scale) {
    const c = this.config;
    const g = settings.global;
    const R = c.zoneRadius;
    this.ctx.bursts?.spawn?.(BurstMode.EARTH, at, {
      radius: R * 0.3, endRadius: R * c.burstReach * g.explosionIntensity * scale, life: c.burstLife,
      intensity: c.burstIntensity, opacity: c.burstOpacity * g.opacity, fresnel: g.fresnel, squash: 0.45,
      colorA: getColor(c.colorBurstA), colorB: getColor(c.colorBurstB), colorC: getColor(c.colorBurstC),
    });
    this._resetEmit();
    if (this.chips) {
      _emit.position = at;
      _emit.radius = R * 0.85;
      _emit.speed = c.chipSpeed * scale;
      _emit.spread = 0.55;
      _emit.size = c.chipSize;
      _emit.life = c.chipLife;
      _emit.spin = 9;
      this.chips.emit(Math.round(c.chipCount * scale * g.particleCount), _emit);
    }
    if (this.dust) {
      _emit.position = at;
      _emit.radius = R;
      _emit.speed = 1.6 * scale;
      _emit.spread = 0.95;
      _emit.size = c.dustSize;
      _emit.life = c.dustLife;
      _emit.spin = 0.5;
      this.dust.emit(Math.round(c.dustBurst * scale * g.particleCount), _emit);
    }
  }

  /** The heave: every enemy on either plug is hit once, knocked down and lifted. */
  _seize() {
    const c = this.config;
    const R = c.zoneRadius;
    this._place();
    const f = this._force;
    f.impulse = Math.min(24, Math.max(0, c.seizeImpulse));
    f.lift = Math.min(20, Math.max(0, c.seizeLift));
    f.spin = 1;
    for (let j = 0; j < 2; j++) this._hitDisc(j === 0 ? _A : _B, R, f, 'seize');
  }

  /** Hit every not-yet-hit enemy in one disc, bounded. */
  _hitDisc(center, R, force, tag) {
    const c = this.config;
    if (this._scope) {
      const source = [center.x, 0, center.z];
      const found = this._scope.queryActors({ position: source, radius: R, relation: 'enemy' });
      if (!found.ok) {
        this.failure = found.reason;
        return;
      }
      for (const actor of found.actors) {
        if (this.hitCount >= MAX_TARGETS) return;
        if (this._hitIds.has(actor.id)) continue;
        this._hitIds.add(actor.id);
        this.hitCount++;
        const sent = this._scope.emit({
          type: 'hit', element: 'earth', targetIds: [actor.id], position: actor.position, sourcePosition: source,
          damage: c.crushDamage, hitForce: { impulse: force.impulse, lift: force.lift, spin: force.spin },
          tags: ['strata-exchange', tag],
        });
        if (!sent.ok) this.failure = sent.reason;
      }
      return;
    }
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(center.x, center.z, R, this._found);
    for (const dummy of found) {
      if (this.hitCount >= MAX_TARGETS) return;
      if (!dummy?.position || this._hitBodies.has(dummy)) continue;
      _dir.set(dummy.position.x - center.x, 0, dummy.position.z - center.z);
      if (_dir.lengthSq() > R * R) continue;
      if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
      else _dir.normalize();
      if (dummy.kill(_dir.x, _dir.z, force)) {
        this._hitBodies.add(dummy);
        this.hitCount++;
      }
    }
  }

  /** Downed bodies on either plug are taken up to ride it. */
  _gather() {
    const field = this.ctx.dummies;
    if (!field?.findBodies || this._carryCount >= MAX_CARRY) return;
    const R = this.config.zoneRadius;
    for (let j = 0; j < 2; j++) {
      const at = j === 0 ? _A : _B;
      const found = field.findBodies(at.x, at.z, R, this._found);
      for (const body of found) {
        if (this._carryCount >= MAX_CARRY) return;
        if (!body || body.alive || typeof body.carry !== 'function' || this._carried.includes(body)) continue;
        this._carried[this._carryCount] = body;
        this._carriedOn[this._carryCount] = j;
        this._carryCount++;
      }
    }
  }

  /** Each carried body rides the current of its plug. */
  _carry() {
    const c = this.config;
    for (let n = 0; n < this._carryCount; n++) {
      const body = this._carried[n];
      this._fieldDrum = this._carriedOn[n];
      body.carry(this._field, c.carryGrip, c.carryGrip, c.carryBuoyancy);
      body.hold?.();
    }
  }

  /** Let every carried body go (pooling, cancellation). */
  _dropCarried() {
    for (let n = 0; n < this._carryCount; n++) this._carried[n]?.release?.();
    this._carried.fill(null);
    this._carryCount = 0;
  }

  /** The slam: each plug lands in the other's socket. */
  _slam() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    this._place();
    // Carried bodies are thrown out of their new ground.
    for (let n = 0; n < this._carryCount; n++) {
      const body = this._carried[n];
      const land = this._carriedOn[n] === 0 ? _B : _A;
      body.release?.();
      const p = body.bodyPoint?.(_body) ?? body.position ?? land;
      _dir.set(p.x - land.x, 0, p.z - land.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      else _dir.normalize();
      const s = 0.6 * Math.min(3, Math.max(0, power));
      body.shove?.(_dir.x * c.hitImpulse * s, c.hitLift * s, _dir.z * c.hitImpulse * s);
    }
    this._carried.fill(null);
    this._carryCount = 0;
    // Anyone standing in a landing socket is crushed.
    const crush = impactForce(c);
    for (let j = 0; j < 2; j++) this._hitDisc(j === 0 ? _A : _B, R, crush, 'crush');
    if (this._scope) {
      // The exchanged ground is written into combat as two terrain imprints.
      for (let j = 0; j < 2; j++) {
        const at = j === 0 ? _A : _B;
        this._scope.emit({
          type: 'terrain-impact', element: 'earth', position: [at.x, 0, at.z],
          shape: { kind: 'disc', x: at.x, z: at.z, r: R },
          intensity: Math.max(0, Math.min(3, c.terrainIntensity)), tags: ['strata-exchange', 'exchange'],
        });
      }
    }
    // The world answers.
    this.lightBoost = c.slamLight * power;
    for (let j = 0; j < 2; j++) {
      const at = j === 0 ? _A : _B;
      _pos.copy(at).setY(0.05);
      this._burstAt(_pos, 1.2);
      this.ctx.decals?.spawn?.(DecalType.DUSTRING, _pos, {
        radius: R * 1.9, life: c.decalLife * 0.7, intensity: c.dustRingIntensity,
        colorA: getColor(c.colorDustA), colorB: getColor(c.colorDustD),
      });
      this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
        radius: R * 2.2 * power, life: 0.6, width: 0.07, intensity: 1,
        colorA: getColor(c.colorCore), colorB: getColor(c.colorBody),
      });
    }
    if (c.slamShake > 0) this.ctx.shake?.add?.(c.slamShake * power * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.slamFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.slamFlash * power);
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  _resetEmit() {
    _emit.position = null;
    _emit.radius = 0;
    _emit.direction = _up;
    _emit.speed = 0;
    _emit.speedVariance = 0.4;
    _emit.spread = 0.6;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.4;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
  }

  _emitMotes(n, at, radius, speed) {
    const c = this.config;
    this._resetEmit();
    _emit.position = at;
    _emit.radius = radius;
    _emit.speed = speed;
    _emit.spread = 1;
    _emit.size = c.moteSize;
    _emit.life = c.moteLife;
    this.motes.emit(n, _emit);
  }

  /** Clods off hanging roots, motes on the arcs, dust at the kerfs. */
  _emitLinger(dt, k) {
    const c = this.config;
    const g = settings.global;
    const b = this._b;
    const R = c.zoneRadius;
    const airborne = k >= b.heave * 0.5 && k < b.slam;
    for (let i = 0; i < 2; i++) {
      if (this.chips && airborne) {
        const n = this._gritEmitters[i].tick(dt, c.gritRate * g.particleCount);
        if (n) {
          this._resetEmit();
          _pos.copy(this._crown[i]).addScaledVector(_up, -c.plugDepth * 1.15);
          _emit.position = _pos;
          _emit.radius = R * c.plugFit * 0.6;
          _emit.direction = _up;
          _emit.speed = 0.6;
          _emit.spread = 1;
          _emit.size = c.gritSize;
          _emit.life = c.gritLife;
          _emit.spin = 6;
          this.chips.emit(n, _emit);
        }
      }
      if (this.motes && k >= b.swapStart && k < b.slam) {
        const n = this._moteEmitters[i].tick(dt, c.moteRate * g.particleCount);
        if (n) {
          _pos.copy(this._crown[i]).addScaledVector(_up, -c.plugDepth * 0.5);
          this._emitMotes(n, _pos, R * 0.9, 0.5);
        }
      }
    }
    // Dust trickles from the kerfs while the plugs lock, and rolls as they sink.
    if (this.dust && k >= b.slam) {
      const rate = k < b.end ? 14 : 30;
      const n = this._dustEmitter.tick(dt, rate * g.particleCount);
      for (let q = 0; q < n; q++) {
        const at = q % 2 === 0 ? _A : _B;
        const a = this.age * 7.3 + q * 2.4;
        _pos.set(at.x + Math.cos(a) * R, 0.08, at.z + Math.sin(a) * R);
        this._resetEmit();
        _emit.position = _pos;
        _emit.radius = 0.2;
        _emit.speed = 0.4;
        _emit.spread = 0.9;
        _emit.size = c.dustSize * 0.6;
        _emit.life = c.dustLife * 0.8;
        this.dust.emit(1, _emit);
      }
    }
  }

  /** Mirror the particle look from settings every frame (shared, named systems). */
  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    if (this.dust?.uniforms) {
      this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
      const u = this.dust.uniforms;
      u.uGravity.value.set(0, c.dustRise, 0);
      u.uOpacity.value = c.dustOpacity * g.opacity;
      u.uTurbulence.value = 0.5 * g.turbulence;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
    }
    if (this.chips?.uniforms) {
      this.chips.setGradient(getColor(c.colorGritA), getColor(c.colorGritB), getColor(c.colorGritC), getColor(c.colorGritD));
      const u = this.chips.uniforms;
      u.uGravity.value.set(0, -c.gritGravity, 0);
      u.uOpacity.value = g.opacity;
      u.uTurbulence.value = 0.1 * g.turbulence;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
    }
    if (this.motes?.uniforms) {
      this.motes.setGradient(getColor(c.colorCore), getColor(c.colorTint), getColor(c.colorBody), getColor(c.colorDeep));
      const u = this.motes.uniforms;
      u.uGravity.value.set(0, 0.4, 0);
      u.uGlow.value = c.moteGlow * g.glow;
      u.uOpacity.value = g.opacity;
      u.uTurbulence.value = 0.8 * g.turbulence;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const R = c.zoneRadius;
    const b = this._beats();
    const half = this._place();
    const k = this._k;
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const fadeT = this.phase === 'fade' ? clamp01(this.fadeTime / this.fadeDuration) : 0;

    // 1 · the plugs
    for (let i = 0; i < 2; i++) {
      this._prevCrown[i].copy(this._crown[i]);
      const crown = this._pose(i, k, half);
      if (dt > 0 && this._prevCrown[i].y > -9) this._vel[i].copy(crown).sub(this._prevCrown[i]).multiplyScalar(1 / dt);
      else this._vel[i].set(0, 0, 0);
      const plug = this.plugs[i];
      plug.visible = k >= 0;
      plug.position.copy(crown);
      plug.rotation.set(this._bank[i], this._yaw[i], 0);
      plug.scale.set(R * c.plugFit, c.plugDepth, R * c.plugFit);
    }
    const rs = this._rockState;
    let charge = 0;
    if (k >= 0) {
      if (k < b.slam) charge = smooth(k / Math.max(1e-3, b.swapStart)) * (0.6 + 0.4 * smooth((k - b.swapStart) / Math.max(1e-3, b.swapEnd - b.swapStart)));
      else charge = 0.15 + 1.1 * Math.exp(-(k - b.slam) * 3);
    }
    rs.charge = charge * (1 - fadeT);
    rs.clock = this._clock;
    rs.fade = 1;
    this.rock.userData.sync(rs);

    // 3 · the lodestone: from the hand, lobbed to the target
    if (this.phase === 'travel') {
      const u = this.u;
      _pos.copy(this.origin).addScaledVector(_up, 1.4).addScaledVector(this.direction, 0.5);
      this.pointAt(1, _dir);
      this.stone.position.lerpVectors(_pos, _dir, u).addScaledVector(_up, c.stoneArc * this.length * 4 * u * (1 - u));
      const grow = smooth(this.age / 0.15);
      this.stone.scale.setScalar(Math.max(0.001, c.stoneSize * grow));
      this.stone.rotation.set(this._calm ? 0.4 : this.age * c.stoneSpin, this.age * 2, this._calm ? 0 : this.age * c.stoneSpin * 0.6);
      this._stoneState.charge = 1;
      this._stoneState.clock = this._clock;
      this._stoneState.fade = 1;
      this.stoneMat.userData.sync(this._stoneState);
    } else {
      this.stone.visible = false;
      // The light and the camera's front sit over the exchange.
      this.position.copy(_M).setY(1.2);
    }

    // 2 · the sockets
    const ss = this._socketState;
    ss.radius = R;
    ss.outer = R * (1 + c.crackReach);
    ss.depth = c.plugDepth * ROOT;
    ss.open = k < 0 ? 0 : smooth(k / 0.06);
    ss.scribe = this.phase === 'travel' ? clamp01(this.u / Math.max(0.05, c.scribeTime)) : 1;
    ss.heal = clamp01(fadeT / Math.max(0.05, c.healTime));
    ss.pulse = k < 0 ? 0 : Math.exp(-k * 6) + (k >= b.slam ? Math.exp(-(k - b.slam) * 5) : 0);
    ss.fade = 1 - smooth((fadeT - 0.7) / 0.3);
    for (let j = 0; j < 2; j++) {
      const at = j === 0 ? _A : _B;
      const mesh = this.sockets[j];
      mesh.position.set(at.x, 0.014 + j * 0.002, at.z);
      mesh.scale.set(ss.outer * 2, ss.outer * 2, 1);
      // What fills the hole: its own plug until the exchange, then the other.
      const occupant = k < b.swapEnd ? j : 1 - j;
      const crownY = this._crown[occupant].y;
      const bottom = crownY - ss.depth;
      ss.cap = crownY < 0 ? 1 : 0;
      ss.floor = crownY < 0 ? Math.min(ss.depth, -crownY) : bottom > 0 ? ss.depth : 0;
      ss.seed = this._seed + j * 7.1;
      this.socketMats[j].userData.sync(ss);
    }

    // 4 · the exchange arcs
    const as = this._arcState;
    const lead = Math.max(0.02, c.arcLead * g.lifetime);
    const swapS = clamp01((k - b.swapStart) / Math.max(1e-3, b.swapEnd - b.swapStart));
    as.draw = smooth((k - (b.swapStart - lead)) / lead);
    as.head = inOutCubic(swapS);
    as.flow = this._clock * c.arcFlow * 3;
    as.fade = k < 0 ? 0 : (1 - clamp01((k - b.slam) / 0.35)) * as.draw;
    for (let i = 0; i < 2; i++) {
      const arc = this.arcs[i];
      arc.visible = as.fade > 0.003;
      if (!arc.visible) continue;
      _mid.copy(_M).setY(c.heaveHeight - c.plugDepth * 0.5);
      _h.copy(i === 0 ? _A : _B).sub(_M).setY(0);
      if (i === 0) _v.copy(_up).multiplyScalar(c.vaultHeight);
      else _v.copy(_w).multiplyScalar(half * c.swingWidth);
      this.arcMats[i].userData.sync(as);
    }

    // 7 · the lens: a pressure ring at the key and at the slam
    const ls = this._lensState;
    const lt = Math.max(0.05, c.lensTime);
    const since = k >= b.slam ? k - b.slam : k;
    const wave = clamp01(since / lt);
    ls.shock = k < 0 || wave >= 1 ? 0 : (1 - wave) * (k >= b.slam ? 1.3 : 1);
    ls.wave = outCubic(wave);
    ls.seed = this._seed;
    const showLens = !this._calm && ls.shock * c.lensStrength * g.distortion > 0.002;
    for (let j = 0; j < 2; j++) {
      const lens = this.lenses[j];
      lens.visible = showLens;
      if (!showLens) continue;
      const at = j === 0 ? _A : _B;
      lens.position.set(at.x, 0.3, at.z);
      lens.scale.set(R * 4.4, R * 4.4, 1);
    }
    if (showLens) this.lensMat.userData.sync(ls);

    // 5 · particles
    if (k >= 0 && dt > 0) this._emitLinger(dt, k);
    this._syncParticles();
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._dropCarried();
    this._scope = null;
    for (const p of this.plugs) p.visible = false;
    for (const s of this.sockets) s.visible = false;
    for (const a of this.arcs) a.visible = false;
    for (const l of this.lenses) l.visible = false;
    this.stone.visible = false;
    this._seized = false;
    this._slammed = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    for (const r of this.resources) r.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

/** Editor helpers that degrade to a minimal lil-gui shim. */
function editorKit(Editor) {
  const R = Editor?.range ?? ((f, c, k, min, max, step, label) => f.add(c, k, min, max, step).name?.(label ?? k));
  const sub = (parent, title) => (typeof parent.addFolder === 'function' ? parent.addFolder(title) : parent);
  const color = (f, c, k, label) => f.addColor(c, k).name?.(label ?? k);
  const castAnim = (f, c) => (Editor?.castAnimation ? Editor.castAnimation(f, c) : f.add(c, 'castAnim', CAST_ANIMATIONS));
  return { R, sub, color, castAnim };
}

export function buildEditor(gui, c, Editor) {
  const { R, sub, color, castAnim } = editorKit(Editor);
  const folder = gui.addFolder('⇅  Strata Exchange');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 3, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 60, 0.5, 'lodestone flies at (m/s)');
  R(cast, c, 'zoneRadius', 0.8, 5, 0.05, 'socket radius (m)');
  R(cast, c, 'lifetime', 0.5, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  castAnim(cast, c);

  const place = sub(folder, 'Placement');
  R(place, c, 'socketGap', 0, 4, 0.05, 'gap between sockets (m)');
  R(place, c, 'exchangeBearing', -1.5, 1.5, 0.01, 'twin socket bearing (rad)');

  const beats = sub(folder, 'Beats');
  R(beats, c, 'heaveTime', 0.1, 1.5, 0.01, 'heave (s)');
  R(beats, c, 'holdTime', 0, 1, 0.01, 'hang (s)');
  R(beats, c, 'swapTime', 0.2, 3, 0.01, 'exchange (s)');
  R(beats, c, 'dropTime', 0.05, 1, 0.01, 'drop (s)');
  R(beats, c, 'settleTime', 0.2, 3, 0.01, 'lock & settle (s)');
  R(beats, c, 'exitTime', 0.1, 2, 0.01, 'sink & heal (s)');

  const play = sub(folder, 'Gameplay');
  R(play, c, 'seizeImpulse', 0, 10, 0.1, 'seize push');
  R(play, c, 'seizeLift', 0, 20, 0.1, 'seize lift');
  R(play, c, 'carryGrip', 0, 1, 0.01, 'carry grip');
  R(play, c, 'carryBuoyancy', 0, 1, 0.01, 'carry buoyancy');
  R(play, c, 'hitImpulse', 0, 24, 0.1, 'slam impulse');
  R(play, c, 'hitLift', 0, 20, 0.1, 'slam lift');
  R(play, c, 'hitSpin', 0, 8, 0.05, 'slam tumble');
  R(play, c, 'crushDamage', 0, 5, 0.1, 'damage per hit');
  R(play, c, 'terrainIntensity', 0, 3, 0.05, 'terrain imprint intensity');

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'keyLight', 0, 20, 0.1, 'punch at the key');
  R(light, c, 'slamLight', 0, 20, 0.1, 'punch at the slam');

  const ramp = sub(folder, 'Exchange ramp');
  color(ramp, c, 'colorCore', 'core');
  color(ramp, c, 'colorTint', 'tint');
  color(ramp, c, 'colorBody', 'body');
  color(ramp, c, 'colorDeep', 'deep');

  const plugs = sub(folder, '1 · The plugs');
  R(plugs, c, 'plugFit', 0.5, 1, 0.01, 'radius (× socket)');
  R(plugs, c, 'plugDepth', 0.4, 4, 0.05, 'depth (m)');
  R(plugs, c, 'heaveHeight', 0.5, 6, 0.05, 'hang height (m)');
  R(plugs, c, 'heaveOvershoot', 0, 0.5, 0.01, 'heave overshoot');
  R(plugs, c, 'shudder', 0, 0.3, 0.005, 'shudder (m)');
  R(plugs, c, 'vaultHeight', 0, 8, 0.05, 'vault height (m)');
  R(plugs, c, 'swingWidth', 0, 2, 0.01, 'swing width (× half span)');
  R(plugs, c, 'swapSpin', -6, 6, 0.05, 'spin in flight (rad)');
  R(plugs, c, 'swapBank', 0, 1.2, 0.01, 'bank (rad)');
  R(plugs, c, 'lockTwist', -2, 2, 0.01, 'lock twist (rad)');
  R(plugs, c, 'slamSink', 0, 1, 0.01, 'slam sink (m)');
  R(plugs, c, 'settleProud', -0.2, 1.5, 0.01, 'rests proud (m)');
  R(plugs, c, 'rockRoughness', 0, 1, 0.01, 'roughness');
  R(plugs, c, 'rockMetalness', 0, 1, 0.01, 'metalness');
  R(plugs, c, 'rockGrit', 0, 3, 0.05, 'grit');
  R(plugs, c, 'strataWarp', 0, 4, 0.05, 'band wander');
  color(plugs, c, 'colorTurf', 'crown');
  color(plugs, c, 'colorStrataA', 'sandstone band');
  color(plugs, c, 'colorStrataB', 'iron band');
  color(plugs, c, 'colorStrataC', 'slate band');
  color(plugs, c, 'colorRoot', 'root');
  R(plugs, c, 'seamGlow', 0, 8, 0.05, 'seam glow');
  R(plugs, c, 'seamWidth', 0.1, 3, 0.01, 'seam width');
  R(plugs, c, 'seamCharge', 0, 4, 0.05, 'charge in flight');

  const sockets = sub(folder, '2 · The sockets');
  R(sockets, c, 'kerfGlow', 0, 8, 0.05, 'kerf glow');
  R(sockets, c, 'kerfWidth', 0.01, 0.6, 0.005, 'kerf width (m)');
  R(sockets, c, 'crackReach', 0, 3, 0.01, 'crack reach (× radius)');
  R(sockets, c, 'crackGlow', 0, 6, 0.05, 'crack glow');
  R(sockets, c, 'pitShade', 0, 3, 0.01, 'pit darkness');
  R(sockets, c, 'pitSeams', 0, 3, 0.01, 'pit seam glow');
  R(sockets, c, 'scribeTime', 0.05, 1, 0.01, 'telegraph draws over (× travel)');
  R(sockets, c, 'healTime', 0.05, 1, 0.01, 'kerf heals over (× exit)');

  const stone = sub(folder, '3 · The lodestone');
  R(stone, c, 'stoneSize', 0.1, 2, 0.01, 'size (m)');
  R(stone, c, 'stoneArc', 0, 1, 0.01, 'lob height (× distance)');
  R(stone, c, 'stoneSpin', 0, 30, 0.1, 'tumble (rad/s)');
  R(stone, c, 'stoneGlow', 0, 8, 0.05, 'seam glow');

  const arcs = sub(folder, '4 · The exchange arcs');
  R(arcs, c, 'arcGlow', 0, 8, 0.05, 'glow');
  R(arcs, c, 'arcWidth', 0.01, 0.4, 0.005, 'tube radius (m)');
  R(arcs, c, 'arcFlow', 0, 6, 0.05, 'flow speed');
  R(arcs, c, 'arcLead', 0.02, 1, 0.01, 'draws in before the swap (s)');

  const fx = sub(folder, '5 · Particles');
  R(fx, c, 'gritRate', 0, 300, 1, 'root clods / s');
  R(fx, c, 'gritSize', 0.01, 0.4, 0.005, 'clod size');
  R(fx, c, 'gritLife', 0.1, 3, 0.01, 'clod life (s)');
  R(fx, c, 'gritGravity', 0, 40, 0.5, 'clod & chip gravity');
  color(fx, c, 'colorGritA', 'rock A');
  color(fx, c, 'colorGritB', 'rock B');
  color(fx, c, 'colorGritC', 'rock C');
  color(fx, c, 'colorGritD', 'rock D');
  R(fx, c, 'dustBurst', 0, 80, 1, 'dust puffs per burst');
  R(fx, c, 'dustSize', 0.1, 3, 0.05, 'dust size');
  R(fx, c, 'dustLife', 0.2, 5, 0.05, 'dust life (s)');
  R(fx, c, 'dustRise', -2, 3, 0.05, 'dust rise');
  R(fx, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  color(fx, c, 'colorDustA', 'dust A');
  color(fx, c, 'colorDustB', 'dust B');
  color(fx, c, 'colorDustC', 'dust C');
  color(fx, c, 'colorDustD', 'dust D');
  R(fx, c, 'moteRate', 0, 300, 1, 'motes / s');
  R(fx, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(fx, c, 'moteLife', 0.1, 3, 0.01, 'mote life (s)');
  R(fx, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  R(fx, c, 'chipCount', 0, 128, 1, 'chips per burst');
  R(fx, c, 'chipSize', 0.01, 0.5, 0.005, 'chip size');
  R(fx, c, 'chipSpeed', 0, 15, 0.1, 'chip speed');
  R(fx, c, 'chipLife', 0.1, 3, 0.01, 'chip life (s)');

  const world = sub(folder, '6 · The beats');
  R(world, c, 'keyShake', 0, 1, 0.01, 'knock at the key');
  R(world, c, 'slamShake', 0, 1, 0.01, 'knock at the slam');
  R(world, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(world, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(world, c, 'keyFlash', 0, 1, 0.01, 'flash at the key');
  R(world, c, 'slamFlash', 0, 1, 0.01, 'flash at the slam');
  R(world, c, 'burstReach', 0, 3, 0.01, 'shell reach (× radius)');
  R(world, c, 'burstIntensity', 0, 3, 0.01, 'shell brightness');
  R(world, c, 'burstLife', 0.05, 3, 0.01, 'shell life (s)');
  R(world, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(world, c, 'decalLife', 0.1, 6, 0.05, 'decals last (s)');
  R(world, c, 'crackIntensity', 0, 3, 0.01, 'crack decal');
  R(world, c, 'dustRingIntensity', 0, 3, 0.01, 'dust ring decal');
  color(world, c, 'colorBurstA', 'shell inner');
  color(world, c, 'colorBurstB', 'shell mid');
  color(world, c, 'colorBurstC', 'shell outer');

  const lens = sub(folder, '7 · The lens');
  R(lens, c, 'lensStrength', 0, 3, 0.01, 'pressure ring');
  R(lens, c, 'lensTime', 0.05, 2, 0.01, 'runs out over (s)');

  return folder;
}
