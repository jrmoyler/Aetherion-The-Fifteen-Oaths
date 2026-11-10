import {
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency, ParticleShape } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  createBladeGeometry,
  createCrownGeometry,
  createFlameGeometry,
  createHeartGeometry,
  createHiltGeometry,
  createQuad,
  createShardGeometry,
  heartSurfacePoint,
} from './geometry.js';
import {
  MAX_WOUNDS,
  createAuraMaterial,
  createBladeMaterial,
  createFlameMaterial,
  createGloryMaterial,
  createHeartMaterial,
  createLensMaterial,
  createMetalMaterial,
  createSigilMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/martyrs-accord';

const TAU = Math.PI * 2;
/** Swords — the seven sorrows; one per bound enemy at most. */
const MAX_SWORDS = MAX_WOUNDS;
/** Enemies one accord can bind. */
const MAX_BOUND = MAX_SWORDS;
/** Allies one accord can sanctify (the bridge's per-event target cap). */
const MAX_ALLIES = 8;
/** Pieces of the broken heart. */
const MAX_SHARDS = 48;
/** The heart geometry's half-thickness (heart units), shared with the shards. */
const HEART_DEPTH = 0.34;
/** Heart-unit height of the cleft the flame rises from. */
const CLEFT_Y = 0.26;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** A two-lobe cardiac envelope, 0..1 over one beat (the systole, then the valve). */
const heartbeat = (phase) =>
  Math.min(1, Math.exp(-Math.pow((phase - 0.08) * 9.5, 2)) + 0.55 * Math.exp(-Math.pow((phase - 0.3) * 12, 2)));
/** Deterministic per-index dice in 0..1. */
const dice = (i, salt) => {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const _up = new Vector3(0, 1, 0);
const _negY = new Vector3(0, -1, 0);
const _pos = new Vector3();
const _dir = new Vector3();
const _c = new Vector3();
const _hand = new Vector3();
const _v = new Vector3();
const _w = new Vector3();
const _q = new Quaternion();
const _qYaw = new Quaternion();
const _obj = new Object3D();
const _emit = {};
const _force = { impulse: 0, lift: 0, spin: 0 };
const _src = [0, 0, 0];
const _at = [0, 0, 0];
const _ids = [];

/**
 * MARTYR'S ACCORD — Holy, zone cast. *Protective sacrifice.*
 *
 * A small gilded heart kindles at the caster's hand and is **thrown** in an
 * arc to the circle, trailing gold motes, while the circle's rim scribes
 * itself round from the caster's side (the telegraph). It **lands** and
 * unfurls to full size — a raised reliquary heart a third of the zone tall,
 * banded by a chased belt and wound with a crown of thorns, a flame rising
 * from its cleft and a radiant glory opening behind it — with a light punch,
 * a knock and a holy shell; the floor fills with a sanctified field and the
 * accord is sealed: allies inside are sanctified, enemies inside are
 * **bound**. Then the **vigil**: for every bound enemy (and to make up the
 * seven sorrows) a sword of light forms on its bearing — guard first, point
 * last — draws back and drives into the heart. Each blow knocks the heart
 * back, leaves a white wound, spreads the crack network, tightens the crown,
 * brightens the glory and throws sparks back along the blade, while the
 * heart beats on (a two-lobe cardiac envelope) and the swords' accord rays
 * run out across the floor to the enemies they belong to. At the end of the
 * vigil the heart swells and **breaks**: the gold shell bursts into lit
 * shards and gold leaf, the flame flares, the glory flares, a white sear
 * runs out over the floor and leaves cooling cracks, a pressure ring warps
 * the air — and the light runs back up every sword to its enemy (the
 * sacrifice's hit). **Exit:** the swords back out and dissolve point-first,
 * the crown falls to the floor, the shards cool from white to oxblood and
 * sink, the floor dissolves.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the heart** (`createHeartGeometry`, `createHeartMaterial`) — lit
 *      hammered gold on `LAYER.WORLD`, shadowing; wounds and cracks in its
 *      emissive. Its height is `heartScale × zoneRadius`.
 *   2. **the aura** (`createAuraMaterial`) — fresnel shell breathing with
 *      the beat.
 *   3. **the swords** — instanced lofted blades of light
 *      (`createBladeMaterial`) on lit gold hilts. Blade length is
 *      `swordReach × zoneRadius`; each rests with its point `tipDepth` inside
 *      the heart along its bearing, hilt raised by `swordPitch` — so moving
 *      the radius (or the heart) mid-cast keeps every point in the heart.
 *   4. **the crown of thorns** — braided briar, lit bronze; tightens per blow,
 *      falls at the sacrifice.
 *   5. **the flame** (`createFlameMaterial`) — fire torn into tongues in the
 *      vertex stage, rising from the cleft; flares and gutters after.
 *   6. **the glory** (`createGloryMaterial`) — camera-facing sunburst of
 *      `gloryScale × zoneRadius`.
 *   7. **the consecrated floor** (`createSigilMaterial`) — telegraph,
 *      sanctified field, seven-point star, accord rays, sear and cracks;
 *      plus CRACK / SCORCH / SHOCKWAVE decals and a holy AIR shell.
 *   8. **the shards** — 36 lit fragments of the heart's skin, thrown from
 *      its real surface, bouncing to rest and sinking.
 *   9. **particles** — gold motes (SOFT, curl), sparks (STREAK), gold leaf
 *      (CHIP, lit) — each its own system.
 *  10. **the beats** — light punch, camera knock and flash on landing, per
 *      blow and at the sacrifice.
 *  11. **the lens** (`LAYER.DISTORTION`) — heat over the flame, the
 *      sacrifice's pressure ring.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * Landing seals the accord: up to `maxBound` enemies inside `zoneRadius` are
 * bound (identity recorded, nobody added later) and allies inside are
 * sanctified with a holy `status` (live combat only). After
 * `sacrificeDelay` each still-standing bound enemy takes exactly one hit of
 * `sacrificeDamage + wardBonus × sheltered` and is thrown **away from the
 * protected caster** (not from the circle's centre) — through the combat
 * binding, or directly on the dummy field when there is none.
 *
 * ## The editor rule
 *
 * A cast records only dice and events (bound identities and their bearings,
 * sword slots, landing times); every size, colour, count and timing is read
 * from `settings.martyrsAccord` every frame. Reduced motion holds the sway,
 * the crown's turn and the glory's spin; hit timing is unchanged.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return MAX_SWORDS * 2 + MAX_SHARDS;
  }

  get impactDuration() {
    const c = this.config;
    return Math.max(0.3, (c.sacrificeDelay + c.ruptureLinger) * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, this.config.fade * settings.global.lifetime);
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
    this.root = new Group();
    this.group.add(this.root);
    const quad = own(createQuad());

    // 7 · the consecrated floor
    this.sigilMat = own(createSigilMaterial());
    this.floor = new Mesh(quad, this.sigilMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.renderOrder = 2;
    this.root.add(this.floor);

    // 1 · the heart and 2 · its aura share one raised geometry
    const heartGeometry = own(createHeartGeometry(112, 44, HEART_DEPTH));
    this.heartMat = own(createHeartMaterial('heart'));
    this.auraMat = own(createAuraMaterial());
    this.heartPivot = new Group();
    this.heart = new Mesh(heartGeometry, this.heartMat);
    this.heart.castShadow = true;
    this.heart.receiveShadow = true;
    this.heartPivot.add(this.heart);
    this.aura = new Mesh(heartGeometry, this.auraMat);
    this.aura.renderOrder = 6;
    this.heartPivot.add(this.aura);
    this.root.add(this.heartPivot);

    // 3 · the swords: blades of light on lit hilts, one instance per sword
    const bladeGeometry = own(createBladeGeometry());
    this.bladeState = new Float32Array(MAX_SWORDS * 4);
    this.bladeAttr = new InstancedBufferAttribute(this.bladeState, 4);
    bladeGeometry.setAttribute('aState', this.bladeAttr);
    this.bladeMat = own(createBladeMaterial());
    this.blades = new InstancedMesh(bladeGeometry, this.bladeMat, MAX_SWORDS);
    this.blades.frustumCulled = false;
    this.blades.renderOrder = 7;
    this.root.add(this.blades);
    this.hiltMat = own(createMetalMaterial('hiltColor', 'hiltMetalness', 'hiltRoughness', 0.6));
    this.hilts = new InstancedMesh(own(createHiltGeometry()), this.hiltMat, MAX_SWORDS);
    this.hilts.frustumCulled = false;
    this.hilts.castShadow = true;
    this.root.add(this.hilts);

    // 4 · the crown of thorns
    this.crownMat = own(createMetalMaterial('crownColor', 'crownMetalness', 'crownRoughness', 0.25));
    this.crown = new Mesh(own(createCrownGeometry()), this.crownMat);
    this.crown.castShadow = true;
    this.root.add(this.crown);

    // 5 · the flame
    this.flameMat = own(createFlameMaterial());
    this.flame = new Mesh(own(createFlameGeometry()), this.flameMat);
    this.flame.renderOrder = 8;
    this.root.add(this.flame);

    // 6 · the glory
    this.gloryMat = own(createGloryMaterial());
    this.glory = new Mesh(quad, this.gloryMat);
    this.glory.renderOrder = 3;
    this.root.add(this.glory);

    // 8 · the shards
    this.shardMat = own(createHeartMaterial('shard'));
    this.shards = new InstancedMesh(own(createShardGeometry()), this.shardMat, MAX_SHARDS);
    this.shards.frustumCulled = false;
    this.shards.castShadow = true;
    this.root.add(this.shards);

    // 11 · the lens (opaque proxy — see createLensMaterial)
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.visible = false;
    this.root.add(this.lens);

    routeExpansionTransparency(this.group);
    this.lens.layers.set(LAYER.DISTORTION);

    // Records: dice and events only.
    this._bound = [];
    for (let i = 0; i < MAX_BOUND; i++) this._bound.push({ kind: '', id: '', dummy: null, angle: 0 });
    this._boundCount = 0;
    this._wardCount = 0;
    this._swordN = 0;
    this._swordAngle = new Float32Array(MAX_SWORDS);
    this._swordBound = new Uint8Array(MAX_SWORDS);
    this._landedAt = new Float32Array(MAX_SWORDS);
    this._wounds = new Float32Array(MAX_WOUNDS * 4);
    this._rays = new Float32Array(MAX_WOUNDS * 4);
    this._found = [];
    this._recoil = new Vector3();
    this._protect = new Vector3();
    this._centre = new Vector3();
    this._clock = 0;
    this._heartState = { crack: 0, beat: 0, heat: 1, clock: 0, wounds: this._wounds };
    this._shardState = { crack: 1, beat: 0, heat: 1, clock: 0, wounds: null };
    this._auraState = { beat: 0, clock: 0, fade: 1 };
    this._bladeState = { clock: 0 };
    this._flameState = { clock: 0, fade: 1, flare: 0 };
    this._gloryState = { intensity: 0, spin: 0, clock: 0 };
    this._floorState = {
      extent: 1.25, scribe: 0, fill: 0, sear: -1, cool: 0, dissolve: 0, beat: 0, clock: 0, startAngle: 0, rays: this._rays, radius: 4, fade: 1,
    };
    this._lensState = { heat: 0, shock: 0, wave: 0, clock: 0 };
    this._metalState = { glow: 0 };
    this._trail = new RateEmitter();
    this._motes = new RateEmitter();
    this._disposed = false;
  }

  createParticles() {
    const particles = this.ctx.particles;
    // Optional: a bare test context has none, and the cast must still run.
    this.motes = particles?.get?.(`${ID}.motes`, { capacity: 600, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.4 }) ?? null;
    if (this.motes) {
      const u = this.motes.uniforms;
      u.uSizeIn.value = 0.1;
      u.uFadeOut.value = 0.5;
      u.uEndSize.value = 0.25;
      u.uDrag.value = 1.4;
    }
    this.sparks = particles?.get?.(`${ID}.sparks`, { capacity: 700, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.2 }) ?? null;
    if (this.sparks) {
      const u = this.sparks.uniforms;
      u.uSizeIn.value = 0.02;
      u.uFadeOut.value = 0.4;
      u.uEndSize.value = 0.3;
      u.uDrag.value = 1.6;
    }
    this.flakes = particles?.get?.(`${ID}.flakes`, { capacity: 400, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.2 }) ?? null;
    if (this.flakes) {
      const u = this.flakes.uniforms;
      u.uSizeIn.value = 0.02;
      u.uFadeIn.value = 0.02;
      u.uFadeOut.value = 0.3;
      u.uEndSize.value = 0.7;
      u.uDrag.value = 0.9;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this.hitCount = 0;
    this._arrived = false;
    this._sacrificed = false;
    this._boundCount = 0;
    this._wardCount = 0;
    this._swordN = 0;
    this._landedCount = 0;
    this._swordAngle.fill(0);
    this._swordBound.fill(0);
    this._landedAt.fill(-1);
    this._wounds.fill(0);
    this._rays.fill(0);
    for (const b of this._bound) {
      b.kind = '';
      b.id = '';
      b.dummy = null;
      b.angle = 0;
    }
    this._recoil.set(0, 0, 0);
    this._beatKick = 0;
    this._clock = 0;
    this._calm = prefersReducedMotion();
    this._trail.reset();
    this._motes.reset();
    this._protect.copy(this.origin);
    this.root.visible = true;
    this.heartPivot.visible = true;
    this.shards.count = 0;
    this.blades.count = 0;
    this.hilts.count = 0;
    this._sync(0);
  }

  onTravel(dt) {
    this._sync(dt);
    // The flying heart trails gold.
    const n = this._trail.tick(dt, this.config.trailRate * settings.global.particleCount);
    if (n > 0 && this.motes) {
      this._resetEmit(this.heartPivot.position, 0.12 * this._heartSize());
      _emit.speed = 0.3;
      _emit.spread = 1;
      _emit.size = this.config.moteSize;
      _emit.life = this.config.moteLife * 0.6;
      this.motes.emit(n, _emit);
    }
  }

  onImpact() {
    this._arrived = true;
    this._bind();
    this._arriveBeat();
    this._sync(0);
  }

  onFade(dt) {
    const c = this.config;
    const T = this._elapsed();
    const sacrificeAt = c.sacrificeDelay * settings.global.lifetime;
    // Each blow lands on its own frame.
    for (let k = 0; k < this._swordN; k++) {
      if (this._landedAt[k] >= 0) continue;
      if (this._plunge(k, T) >= 1 && !this._sacrificed) {
        this._landedAt[k] = T;
        this._landedCount++;
        this._plungeBeat(k);
      }
    }
    if (!this._sacrificed && T >= sacrificeAt) {
      this._sacrificed = true;
      this._sacrifice();
      this._ruptureBeat();
    }
    // Motes rise off the sanctified floor through the vigil.
    if (!this._sacrificed && this.motes) {
      const n = this._motes.tick(dt, c.moteRate * settings.global.particleCount);
      if (n > 0) {
        _pos.set(this.position.x, 0.1, this.position.z);
        this._resetEmit(_pos, c.zoneRadius * 0.85);
        _emit.speed = 0.25;
        _emit.spread = 0.4;
        _emit.size = c.moteSize;
        _emit.life = c.moteLife;
        this.motes.emit(n, _emit);
      }
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The accord — gameplay                                               */
  /* ------------------------------------------------------------------ */

  /** Seconds since landing, running on through the exit. */
  _elapsed() {
    if (this.phase === 'travel' || !this._arrived) return 0;
    return this.impactTime + (this.phase === 'fade' || this.phase === 'done' ? this.fadeTime : 0);
  }

  /** Landing: bind the enemies inside, sanctify the allies, lay the swords out. */
  _bind() {
    const c = this.config;
    const R = c.zoneRadius;
    const tx = this.position.x;
    const tz = this.position.z;
    const limit = Math.max(0, Math.min(MAX_BOUND, Math.round(c.maxBound)));
    // The protected: where the caster stands as the accord is sealed.
    const caster = this.ctx.character?.position;
    if (caster && Number.isFinite(caster.x) && Number.isFinite(caster.z)) this._protect.set(caster.x, 0, caster.z);
    else this._protect.copy(this.origin);
    const casterInside = Math.hypot(this._protect.x - tx, this._protect.z - tz) <= R;
    this._boundCount = 0;
    this._wardCount = 0;
    if (this._scope) {
      _src[0] = tx;
      _src[1] = 0;
      _src[2] = tz;
      const enemies = this._scope.queryActors({ position: _src, radius: R, relation: 'enemy' });
      if (!enemies?.ok) this.failure = enemies?.reason ?? 'accord query refused';
      else {
        for (const actor of enemies.actors) {
          if (this._boundCount >= limit) break;
          if (!actor.alive) continue;
          const b = this._bound[this._boundCount++];
          b.kind = 'actor';
          b.id = actor.id;
          b.dummy = null;
          b.angle = Math.atan2(actor.position[2] - tz, actor.position[0] - tx);
        }
      }
      if (this._scope.standalone) {
        // The direct fallback cannot carry statuses: only the caster is sheltered.
        this._wardCount = casterInside ? 1 : 0;
      } else {
        const allies = this._scope.queryActors({ position: _src, radius: R, relation: 'ally' });
        _ids.length = 0;
        if (allies?.ok) {
          for (const actor of allies.actors) {
            if (!actor.alive) continue;
            _ids.push(actor.id);
            if (_ids.length >= MAX_ALLIES) break;
          }
        } else this.failure = allies?.reason ?? 'accord query refused';
        if (_ids.length) {
          const sent = this._scope.emit({
            type: 'status', element: 'holy', targetIds: _ids.slice(), position: [tx, 0, tz],
            intensity: 1, tags: ['martyrs-accord', 'sanctuary'],
          });
          if (sent?.ok) this._wardCount = _ids.length;
          else this.failure = sent?.reason ?? 'accord status refused';
        }
      }
    } else {
      const field = this.ctx.dummies;
      const found = field?.findTargets ? field.findTargets(tx, tz, R, this._found) : null;
      if (found) {
        for (const dummy of found) {
          if (this._boundCount >= limit) break;
          if (!dummy || dummy.alive === false || !dummy.position) continue;
          const dx = dummy.position.x - tx;
          const dz = dummy.position.z - tz;
          if (dx * dx + dz * dz > R * R) continue;
          const b = this._bound[this._boundCount++];
          b.kind = 'dummy';
          b.id = '';
          b.dummy = dummy;
          b.angle = Math.atan2(dz, dx);
        }
      }
      this._wardCount = casterInside ? 1 : 0;
    }
    this._laySwords();
  }

  /**
   * Seven slots evenly round the heart, the first facing away from the caster;
   * each bound enemy takes the nearest free slot and turns it to its bearing.
   * The plunge order is the slot order — a rolling wave round the heart.
   */
  _laySwords() {
    const c = this.config;
    const n = Math.max(this._boundCount, Math.min(MAX_SWORDS, Math.max(0, Math.round(c.swordCount))));
    this._swordN = n;
    const base = Math.atan2(this.direction.z, this.direction.x);
    for (let k = 0; k < n; k++) {
      this._swordAngle[k] = base + (k * TAU) / n;
      this._swordBound[k] = 0;
    }
    for (let i = 0; i < this._boundCount; i++) {
      const a = this._bound[i].angle;
      let best = -1;
      let bestD = Infinity;
      for (let k = 0; k < n; k++) {
        if (this._swordBound[k]) continue;
        const d = Math.abs(Math.atan2(Math.sin(a - this._swordAngle[k]), Math.cos(a - this._swordAngle[k])));
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      if (best < 0) break;
      this._swordAngle[best] = a;
      this._swordBound[best] = 1;
    }
  }

  /** The vigil is over: the light runs back up every sword to its enemy. */
  _sacrifice() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    const sheltered = Math.min(this._wardCount, Math.max(0, Math.round(c.wardBonusCap)));
    const damage = Math.max(0, c.sacrificeDamage + c.wardBonus * sheltered);
    const px = this._protect.x;
    const pz = this._protect.z;
    if (this._scope) {
      const force = impactForce(c, power);
      _src[0] = px;
      _src[1] = 0;
      _src[2] = pz;
      for (let i = 0; i < this._boundCount; i++) {
        const b = this._bound[i];
        if (b.kind !== 'actor') continue;
        const actor = this._scope.getActor(b.id);
        if (!actor?.ok || !actor.actor?.alive) continue;
        const p = actor.actor.position;
        _at[0] = p[0];
        _at[1] = 0;
        _at[2] = p[2];
        const sent = this._scope.emit({
          type: 'hit', element: 'holy', targetIds: [b.id], position: _at.slice(), sourcePosition: _src.slice(),
          damage, hitForce: force, tags: ['martyrs-accord', 'sacrifice'],
        });
        if (sent?.ok) this.hitCount++;
        else this.failure = sent?.reason ?? 'sacrifice refused';
      }
      return;
    }
    _force.impulse = c.hitImpulse * power;
    _force.lift = c.hitLift * power;
    _force.spin = c.hitSpin;
    for (let i = 0; i < this._boundCount; i++) {
      const b = this._bound[i];
      const dummy = b.dummy;
      if (b.kind !== 'dummy' || !dummy || dummy.alive === false) continue;
      // Away from the protected, not from the circle's centre.
      _dir.set(dummy.position.x - px, 0, dummy.position.z - pz);
      if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
      else _dir.normalize();
      if (dummy.kill(_dir.x, _dir.z, _force)) this.hitCount++;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Beats                                                               */
  /* ------------------------------------------------------------------ */

  _arriveBeat() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    const R = c.zoneRadius;
    this.lightBoost = c.arriveLight * power;
    _pos.set(this.position.x, 0.05, this.position.z);
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: R, life: c.decalLife * 0.4, width: c.shockwaveWidth, intensity: 1,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorBody),
    });
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _pos, {
      radius: R * 0.1, endRadius: R * 0.6 * power, life: c.burstLife * 0.7, intensity: c.burstIntensity * 0.6,
      opacity: c.burstOpacity * 0.6 * settings.global.opacity, fresnel: c.burstFresnel, squash: c.burstSquash,
      colorA: getColor(c.colorBurstA), colorB: getColor(c.colorBurstB), colorC: getColor(c.colorBurstC),
    });
    if (c.arriveShake > 0) this.ctx.shake?.add?.(c.arriveShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.arriveFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.arriveFlash * power);
  }

  _plungeBeat(k) {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    this._swordAxis(k, _dir);
    // The heart is knocked back along the blade.
    this._recoil.addScaledVector(_dir, -c.recoil);
    this._beatKick = 1;
    this.lightBoost = Math.max(this.lightBoost, c.plungeLight * power);
    if (c.plungeShake > 0) this.ctx.shake?.add?.(c.plungeShake * power, c.shakeDecay, c.shakeFrequency);
    if (this.sparks) {
      const S = this._heartSize();
      this._heartCentre(_c);
      _pos.copy(_c).addScaledVector(_dir, S * 0.42);
      this._resetEmit(_pos, 0.05);
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed;
      _emit.spread = 0.55;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife;
      this.sparks.emit(Math.round(c.sparkCount * settings.global.particleCount), _emit);
    }
  }

  _ruptureBeat() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    const S = this._heartSize();
    this._heartCentre(this._centre);
    this.lightBoost = c.ruptureLight * power;
    _pos.set(this.position.x, 0.05, this.position.z);
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: R * c.scorchDecal, life: c.decalLife, intensity: 1,
      colorA: getColor(c.colorBody), colorB: getColor(c.colorDeep),
    });
    this.ctx.decals?.spawn?.(DecalType.CRACK, _pos, {
      radius: R * c.crackDecal, life: c.decalLife, intensity: 1.2,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorBody),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: R * 1.2 * power, life: c.decalLife * 0.5, width: c.shockwaveWidth, intensity: 1.4,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorBody),
    });
    this.ctx.bursts?.spawn?.(BurstMode.AIR, this._centre, {
      radius: S * 0.3, endRadius: R * c.burstReach * power, life: c.burstLife, intensity: c.burstIntensity,
      opacity: c.burstOpacity * g.opacity, fresnel: c.burstFresnel, squash: c.burstSquash,
      colorA: getColor(c.colorBurstA), colorB: getColor(c.colorBurstB), colorC: getColor(c.colorBurstC),
    });
    if (c.ruptureShake > 0) this.ctx.shake?.add?.(c.ruptureShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.ruptureFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorCore), c.ruptureFlash * power);
    if (this.sparks) {
      this._resetEmit(this._centre, S * 0.35);
      _emit.speed = c.sparkSpeed * 1.3;
      _emit.spread = 1;
      _emit.size = c.sparkSize * 1.2;
      _emit.life = c.sparkLife * 1.4;
      this.sparks.emit(Math.round(c.sparkRupture * g.particleCount), _emit);
    }
    if (this.flakes) {
      this._resetEmit(this._centre, S * 0.4);
      _emit.speed = c.flakeSpeed;
      _emit.spread = 1;
      _emit.size = c.flakeSize;
      _emit.life = c.flakeLife;
      _emit.spin = 8;
      this.flakes.emit(Math.round(c.flakeCount * g.particleCount), _emit);
    }
    if (this.motes) {
      this._resetEmit(this._centre, S * 0.5);
      _emit.speed = 2.2;
      _emit.spread = 1;
      _emit.size = c.moteSize * 1.4;
      _emit.life = c.moteLife;
      this.motes.emit(Math.round(48 * g.particleCount), _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Derived placement                                                   */
  /* ------------------------------------------------------------------ */

  /** Heart height (m), from the zone. */
  _heartSize() {
    const c = this.config;
    return Math.max(0.1, c.zoneRadius * c.heartScale);
  }

  /** Where the landed heart's centre stands (before recoil). */
  _heartCentre(out) {
    const c = this.config;
    const S = this._heartSize();
    return out.set(this.position.x, c.heartLift + S * 0.5, this.position.z);
  }

  /** Unit axis from the heart out along sword `k` (toward its hilt). */
  _swordAxis(k, out) {
    const pitch = this.config.swordPitch;
    const a = this._swordAngle[k];
    const cp = Math.cos(pitch);
    return out.set(Math.cos(a) * cp, Math.sin(pitch), Math.sin(a) * cp);
  }

  /** Start / stagger of the plunges, compressed so the last lands before the sacrifice. */
  _plunge(k, T) {
    const c = this.config;
    const L = settings.global.lifetime;
    const n = Math.max(1, this._swordN);
    const start = c.swordsStart * L;
    const dur = Math.max(0.05, c.plungeTime * L);
    const room = Math.max(0, c.sacrificeDelay * L - start - dur - 0.05);
    const stagger = n > 1 ? Math.min(c.plungeStagger * L, room / (n - 1)) : 0;
    return clamp01((T - (start + k * stagger)) / dur);
  }

  _resetEmit(position, radius) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = _up;
    _emit.speed = 1;
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

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const L = g.lifetime;
    const R = c.zoneRadius;
    const S = this._heartSize();
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    const T = this._elapsed();
    const sacrificeAt = c.sacrificeDelay * L;
    const since = this._sacrificed ? T - sacrificeAt : -1;
    const fadeT = this.phase === 'fade' ? clamp01(this.fadeTime / this.fadeDuration) : 0;
    const fade = 1 - fadeT;
    const arrive = this._arrived ? clamp01(T / Math.max(0.02, c.arriveTime * L)) : 0;
    const linger = Math.max(0.05, c.ruptureLinger * L);
    const after = this._sacrificed ? clamp01(since / linger) : 0;

    // Yaw that turns the heart's face toward the caster, with a slow sway.
    const face = Math.atan2(-this.direction.x, -this.direction.z);
    const sway = this._calm ? 0 : Math.sin(clock * 0.7) * c.heartSway;

    // The heartbeat: steady through the vigil, kicked by every blow.
    this._beatKick = Math.max(0, this._beatKick - dt * 5);
    const beat = this._arrived && !this._sacrificed
      ? Math.max(heartbeat((T * c.beatRate) % 1), this._beatKick)
      : this._sacrificed ? 0 : 0.5 + 0.5 * Math.sin(this.age * 14);
    this._recoil.multiplyScalar(Math.exp(-c.recoilDecay * dt));

    // ---- 1 · the heart (and 2 · its aura)
    this._heartCentre(_c);
    const pivot = this.heartPivot;
    if (!this._arrived) {
      // Kindled at the hand, then thrown in an arc.
      const kindle = smooth(this.age / 0.15);
      _hand.copy(this.origin).addScaledVector(this.side, -0.35).addScaledVector(this.direction, 0.5);
      _hand.y = 1.45;
      pivot.position.lerpVectors(_hand, _c, this.u);
      pivot.position.y += Math.sin(Math.PI * this.u) * c.arcHeight * this.length;
      pivot.scale.setScalar(Math.max(0.001, S * c.travelScale * kindle));
      pivot.rotation.set(0, face + this.age * c.travelSpin, 0);
    } else {
      const grow = c.travelScale + (1 - c.travelScale) * Easing.outBack(arrive);
      const swell = this._sacrificed ? 1 : 1 + c.swell * Easing.inQuad(clamp01(1 - (sacrificeAt - T) / Math.max(0.02, 0.18 * L)));
      pivot.position.copy(_c).add(this._recoil);
      pivot.scale.setScalar(Math.max(0.001, S * grow * swell * (1 + c.beatAmount * beat)));
      pivot.rotation.set(0, face + sway, 0);
    }
    pivot.visible = !this._sacrificed;
    // Light rides the heart.
    this.position.y = pivot.position.y;

    // Wounds: each landed sword's bearing in heart space.
    _qYaw.setFromAxisAngle(_up, -pivot.rotation.y);
    let crack = 0;
    for (let k = 0; k < MAX_WOUNDS; k++) {
      const o = k * 4;
      if (k < this._swordN && this._landedAt[k] >= 0) {
        this._swordAxis(k, _v).applyQuaternion(_qYaw);
        const age = T - this._landedAt[k];
        this._wounds[o] = _v.x;
        this._wounds[o + 1] = _v.y;
        this._wounds[o + 2] = _v.z;
        this._wounds[o + 3] = 0.75 + 1.25 * Math.exp(-age * 6);
        crack += 1;
      } else {
        this._wounds[o] = 0;
        this._wounds[o + 1] = 1;
        this._wounds[o + 2] = 0;
        this._wounds[o + 3] = 0;
      }
    }
    crack = this._swordN ? crack / this._swordN : 0;
    const preBreak = this._sacrificed ? 1 : clamp01(1 - (sacrificeAt - T) / Math.max(0.02, 0.25 * L));
    const hs = this._heartState;
    hs.crack = this._arrived ? Math.min(1, crack * 0.8 + preBreak * 0.4) : 0;
    hs.beat = beat;
    hs.heat = 1;
    hs.clock = clock;
    this.heartMat.userData.sync(hs);
    const as = this._auraState;
    as.beat = beat;
    as.clock = clock;
    as.fade = this._arrived ? 1 : 0.8;
    this.auraMat.userData.sync(as);

    // ---- 3 · the swords
    const bladeLen = Math.max(0.1, R * c.swordReach);
    const tip = S * c.tipDepth;
    const draw = R * c.plungeReach;
    const returnT = this._sacrificed ? clamp01(since / Math.max(0.05, c.returnTime * L)) : 0;
    const formF = Math.max(0.05, Math.min(0.95, c.formFraction));
    let swords = 0;
    for (let k = 0; k < this._swordN; k++) {
      const p = this._plunge(k, T);
      const form = clamp01(p / formF);
      const thrust = Easing.inCubic(clamp01((p - formF) / (1 - formF)));
      this._swordAxis(k, _dir);
      // Measured from the heart centre the sword is aimed at — derived each frame.
      const back = tip + bladeLen + draw * (1 - thrust) + R * c.returnDrift * Easing.outCubic(returnT);
      _pos.copy(_c).add(this._recoil).addScaledVector(_dir, back);
      _q.setFromUnitVectors(_up, _v.copy(_dir).negate());
      _obj.position.copy(_pos);
      _obj.quaternion.copy(_q);
      _obj.scale.set(bladeLen * c.swordWidth, bladeLen, bladeLen * c.swordWidth);
      _obj.updateMatrix();
      this.blades.setMatrixAt(k, _obj.matrix);
      _obj.scale.set(bladeLen, bladeLen, bladeLen);
      _obj.updateMatrix();
      // Hilts appear with the blade, and go with it.
      if (form <= 0 || returnT >= 1) _obj.matrix.makeScale(0, 0, 0).setPosition(_pos);
      this.hilts.setMatrixAt(k, _obj.matrix);
      const o = k * 4;
      this.bladeState[o] = form;
      this.bladeState[o + 1] = this._sacrificed ? clamp01(since / Math.max(0.05, 0.4 * L)) : 0;
      this.bladeState[o + 2] = this._swordBound[k];
      this.bladeState[o + 3] = returnT;
      // Floor ray to its bearing (quad space: x = world x, y = −world z).
      const a = this._swordAngle[k];
      this._rays[o] = Math.cos(a);
      this._rays[o + 1] = -Math.sin(a);
      this._rays[o + 2] = this._sacrificed ? 1 - returnT : form;
      this._rays[o + 3] = this._swordBound[k];
      swords++;
    }
    for (let k = this._swordN; k < MAX_SWORDS; k++) {
      const o = k * 4;
      this._rays[o] = 1;
      this._rays[o + 1] = 0;
      this._rays[o + 2] = 0;
      this._rays[o + 3] = 0;
    }
    this.blades.count = swords;
    this.hilts.count = swords;
    this.blades.instanceMatrix.needsUpdate = true;
    this.hilts.instanceMatrix.needsUpdate = true;
    this.bladeAttr.needsUpdate = true;
    this._bladeState.clock = clock;
    this.bladeMat.userData.sync(this._bladeState);
    this._metalState.glow = this._sacrificed ? 1 - returnT : 0.4 + 0.6 * crack;
    this.hiltMat.userData.sync(this._metalState);

    // ---- 4 · the crown of thorns: tightens per blow, falls at the sacrifice
    this.crownMat.userData.sync(this._metalState);
    const crownR = S * c.crownScale * (1 - c.crownTighten * crack) + (this._sacrificed ? R * c.crownSnap * Easing.outCubic(after) : 0);
    const crownSpin = this._calm ? 0 : clock * c.crownSpin;
    if (!this._sacrificed) {
      this.crown.position.copy(pivot.position);
      this.crown.position.y += S * 0.04;
      this.crown.rotation.set(c.crownTilt * Math.cos(sway), crownSpin, c.crownTilt * 0.4);
    } else {
      // It drops to the floor and settles flat, then sinks with the exit.
      const drop = clamp01(since / Math.max(0.05, 0.45 * L));
      this.crown.position.copy(this._centre);
      this.crown.position.y = Math.max(0.04, this._centre.y * (1 - drop * drop)) - fadeT * 0.25;
      this.crown.rotation.set(c.crownTilt * (1 - drop), crownSpin, c.crownTilt * 0.4 * (1 - drop));
    }
    this.crown.scale.set(crownR, S * (this._arrived ? 1 : c.travelScale), crownR);
    this.crown.visible = this._arrived && fade > 0.02;

    // ---- 5 · the flame rises from the cleft; flares and gutters after
    const fs = this._flameState;
    let flameH = S * c.flameHeight;
    if (!this._sacrificed) {
      _v.set(0, CLEFT_Y, 0).multiplyScalar(pivot.scale.y).applyQuaternion(_q.setFromAxisAngle(_up, pivot.rotation.y));
      this.flame.position.copy(pivot.position).add(_v);
      flameH *= (this._arrived ? 1 : c.travelScale * 1.6) * (0.9 + 0.2 * beat);
      fs.flare = 0;
      fs.fade = this._arrived ? 1 : 0.85;
    } else {
      this.flame.position.copy(this._centre);
      this.flame.position.y += S * 0.1;
      const flare = Math.exp(-since * 4);
      flameH *= (1 + c.flameFlare * flare) * (1 - after);
      fs.flare = flare;
      fs.fade = 1 - after;
    }
    const flameW = S * c.flameWidth * 2 * (this._arrived ? 1 : c.travelScale * 1.6);
    this.flame.scale.set(flameW, Math.max(0.001, flameH), flameW);
    this.flame.visible = flameH > 0.01 && fs.fade > 0.01;
    fs.clock = clock;
    this.flameMat.userData.sync(fs);

    // ---- 6 · the glory: gathers with each blow, flares at the sacrifice
    const camera = this.ctx.camera;
    const gs = this._gloryState;
    gs.intensity = this._arrived
      ? (this._sacrificed
        ? (0.55 + c.gloryFlare * Math.exp(-since * 3.5)) * (1 - after) * fade
        : smooth(arrive) * (0.45 + c.gloryGather * this._landedCount + 0.1 * beat))
      : 0;
    gs.spin = this._calm ? 0 : clock * c.glorySpin;
    gs.clock = clock;
    this.glory.visible = gs.intensity > 0.002;
    const gloryCentre = this._sacrificed ? this._centre : _c;
    this.glory.position.copy(gloryCentre);
    if (camera?.position) {
      _w.copy(camera.position).sub(gloryCentre).normalize();
      this.glory.position.addScaledVector(_w, -c.gloryOffset);
      this.glory.quaternion.copy(camera.quaternion);
      this.lens.quaternion.copy(camera.quaternion);
    }
    const gr = 2 * R * c.gloryScale * (0.75 + 0.25 * arrive) * (this._sacrificed ? 1 + 0.15 * Easing.outCubic(after) : 1);
    this.glory.scale.set(gr, gr, 1);
    this.gloryMat.userData.sync(gs);

    // ---- 7 · the consecrated floor
    this.floor.position.set(this.position.x, 0.035, this.position.z);
    const extent = 1.3;
    this.floor.scale.set(2 * R * extent, 2 * R * extent, 1);
    const fl = this._floorState;
    fl.extent = extent;
    fl.radius = R;
    fl.scribe = this._arrived ? 1 : smooth(this.u * 1.15);
    fl.fill = this._arrived ? smooth(arrive) : 0;
    fl.sear = this._sacrificed ? clamp01(since / Math.max(0.05, c.searTime * L)) : -1;
    fl.cool = this._sacrificed ? clamp01(since / (linger + this.fadeDuration)) : 0;
    fl.dissolve = clamp01(fadeT / Math.max(0.05, c.dissolveTime));
    fl.beat = beat;
    fl.clock = clock;
    fl.fade = 1;
    fl.startAngle = Math.atan2(this.direction.z, -this.direction.x);
    this.sigilMat.userData.sync(fl);

    // ---- 8 · the shards
    this._syncShards(since, fadeT, S, pivot.rotation.y);

    // ---- 9 · particle look
    this._syncParticles();

    // ---- 11 · the lens
    const ls = this._lensState;
    ls.heat = this._arrived && !this._sacrificed ? smooth(arrive) : this._sacrificed ? 1 - after : 0;
    ls.shock = this._sacrificed ? 1 - clamp01(since / Math.max(0.05, 0.55 * L)) : 0;
    ls.wave = this._sacrificed ? Easing.outCubic(clamp01(since / Math.max(0.05, 0.55 * L))) : 0;
    ls.clock = clock;
    this.lens.visible = !this._calm && (ls.heat * c.lensHeat + ls.shock * c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) {
      this.lens.position.copy(this._sacrificed ? this._centre : pivot.position);
      const lr = this._sacrificed ? 2 * R * 1.1 : S * 3;
      this.lens.scale.set(lr, lr, 1);
      this.lensMat.userData.sync(ls);
    }
  }

  /** The broken heart: shards from its real surface, thrown, bounced, sunk. */
  _syncShards(since, fadeT, S, yaw) {
    const c = this.config;
    const n = this._sacrificed ? Math.max(0, Math.min(MAX_SHARDS, Math.round(c.shardCount))) : 0;
    this.shards.count = n;
    if (!n) return;
    const L = settings.global.lifetime;
    const gravity = Math.max(0.1, c.shardGravity);
    _qYaw.setFromAxisAngle(_up, yaw);
    for (let i = 0; i < n; i++) {
      heartSurfacePoint(i, n, _v, HEART_DEPTH).applyQuaternion(_qYaw);
      // Outward from the centre, plus a seeded lift.
      _dir.copy(_v);
      if (_dir.lengthSq() < 1e-6) _dir.set(0, 1, 0);
      _dir.normalize();
      const speed = c.shardSpeed * (0.6 + 0.6 * dice(i, 1));
      const vy = _dir.y * speed + c.shardLift * (0.5 + 0.7 * dice(i, 2));
      const y0 = this._centre.y + _v.y * S;
      const ground = 0.05;
      const tLand = (vy + Math.sqrt(vy * vy + 2 * gravity * Math.max(0, y0 - ground))) / gravity;
      const tau = Math.max(0, since);
      const tc = Math.min(tau, tLand);
      // After landing they skid a little further and stop.
      const skid = tau > tLand ? Math.min(0.25, (tau - tLand) * 0.5) : 0;
      const h = (tc + skid) * speed;
      _pos.set(
        this._centre.x + _v.x * S + _dir.x * h,
        Math.max(ground, y0 + vy * tc - 0.5 * gravity * tc * tc) - fadeT * 0.35,
        this._centre.z + _v.z * S + _dir.z * h,
      );
      _obj.position.copy(_pos);
      const spin = c.shardSpin * (tc + skid * 0.3);
      _obj.rotation.set(dice(i, 3) * TAU + spin, dice(i, 4) * TAU + spin * 0.7, dice(i, 5) * TAU);
      const size = S * 0.9 * c.shardSize * (0.6 + 0.6 * dice(i, 6)) * (1 - fadeT * fadeT);
      _obj.scale.setScalar(Math.max(0.0001, size));
      _obj.updateMatrix();
      this.shards.setMatrixAt(i, _obj.matrix);
    }
    this.shards.instanceMatrix.needsUpdate = true;
    const ss = this._shardState;
    ss.crack = 1;
    ss.heat = 1 - clamp01(since / Math.max(0.05, c.shardCool * L));
    ss.clock = this._clock;
    this.shardMat.userData.sync(ss);
  }

  /** Mirror the particle look from settings every frame (no-op without systems). */
  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    if (this.motes?.uniforms) {
      this.motes.setGradient(getColor(c.colorCore), getColor(c.colorTint), getColor(c.colorBody), getColor(c.colorDeep));
      const u = this.motes.uniforms;
      u.uGravity.value.set(0, c.moteRise, 0);
      u.uGlow.value = c.moteGlow * g.glow;
      u.uOpacity.value = g.opacity;
      u.uTurbulence.value = 0.8 * g.turbulence;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
    }
    if (this.sparks?.uniforms) {
      this.sparks.setGradient(getColor(c.colorCore), getColor(c.colorCore), getColor(c.colorTint), getColor(c.colorBody));
      const u = this.sparks.uniforms;
      u.uGravity.value.set(0, -6, 0);
      u.uGlow.value = c.sparkGlow * g.glow;
      u.uOpacity.value = g.opacity;
      u.uTurbulence.value = 0.2 * g.turbulence;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
    }
    if (this.flakes?.uniforms) {
      this.flakes.setGradient(getColor(c.colorTint), getColor(c.heartColor), getColor(c.colorBody), getColor(c.colorDeep));
      const u = this.flakes.uniforms;
      u.uGravity.value.set(0, -c.flakeGravity, 0);
      u.uOpacity.value = g.opacity;
      u.uTurbulence.value = 0.6 * g.turbulence;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.lens.visible = false;
    this.shards.count = 0;
    this.blades.count = 0;
    this.hilts.count = 0;
    this._arrived = false;
    this._sacrificed = false;
    for (const b of this._bound) b.dummy = null;
    this._boundCount = 0;
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

/** Editor helpers that degrade to the dev harness's minimal shim. */
function editorKit(Editor) {
  const R = Editor?.range ?? ((f, c, k, min, max, step, label) => f.add(c, k, min, max, step).name?.(label ?? k));
  const sub = (parent, title) => (typeof parent.addFolder === 'function' ? parent.addFolder(title) : parent);
  const color = (f, c, k, label) => f.addColor(c, k).name?.(label ?? k);
  const gradient = (f, c, prefix, title) => {
    if (Editor?.gradient && typeof f.addFolder === 'function') return Editor.gradient(f, c, prefix, title);
    for (const s of ['A', 'B', 'C', 'D']) color(f, c, prefix + s, `${title} ${s}`);
    return f;
  };
  const castAnim = (f, c) => (Editor?.castAnimation ? Editor.castAnimation(f, c) : f.add(c, 'castAnim', CAST_ANIMATIONS));
  return { R, sub, color, gradient, castAnim };
}

export function buildEditor(gui, c, Editor) {
  const { R, sub, color, castAnim } = editorKit(Editor);
  const folder = gui.addFolder("♥  Martyr's Accord");

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'heart flies at (m/s)');
  R(cast, c, 'zoneRadius', 1, 8, 0.1, 'accord radius (m)');
  R(cast, c, 'lifetime', 0.5, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  castAnim(cast, c);

  const accord = sub(folder, 'The accord');
  R(accord, c, 'sacrificeDelay', 0.4, 4, 0.05, 'breaks after (s)');
  R(accord, c, 'maxBound', 0, MAX_BOUND, 1, 'enemies bound');
  R(accord, c, 'sacrificeDamage', 0, 5, 0.05, 'returned blow damage');
  R(accord, c, 'wardBonus', 0, 2, 0.05, 'bonus per sheltered ally');
  R(accord, c, 'wardBonusCap', 0, MAX_ALLIES, 1, 'sheltered allies counted');
  R(accord, c, 'hitImpulse', 0, 24, 0.5, 'thrown away from you');
  R(accord, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(accord, c, 'hitSpin', 0, 8, 0.05, 'tumble');

  const timing = sub(folder, 'Timing');
  R(timing, c, 'arriveTime', 0.05, 1, 0.01, 'heart unfurls over (s)');
  R(timing, c, 'swordsStart', 0, 1, 0.01, 'first sword after (s)');
  R(timing, c, 'plungeStagger', 0, 0.6, 0.01, 'between swords (s)');
  R(timing, c, 'plungeTime', 0.05, 1, 0.01, 'a plunge lasts (s)');
  R(timing, c, 'formFraction', 0.05, 0.95, 0.01, 'spent forming');
  R(timing, c, 'ruptureLinger', 0.1, 3, 0.05, 'aftermath (s)');
  R(timing, c, 'fade', 0.1, 3, 0.05, 'exit (s)');

  const light = sub(folder, 'Light & palette');
  color(light, c, 'lightColor', 'light');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'arriveLight', 0, 20, 0.1, 'punch on landing');
  R(light, c, 'plungeLight', 0, 10, 0.1, 'punch per sword');
  R(light, c, 'ruptureLight', 0, 30, 0.1, 'punch at the sacrifice');
  color(light, c, 'colorCore', 'ramp · white-hot');
  color(light, c, 'colorTint', 'ramp · pale gold');
  color(light, c, 'colorBody', 'ramp · amber');
  color(light, c, 'colorDeep', 'ramp · oxblood');

  const heart = sub(folder, '1 · The heart');
  R(heart, c, 'heartScale', 0.15, 0.9, 0.01, 'height (× radius)');
  R(heart, c, 'heartLift', 0, 3, 0.01, 'floats above floor (m)');
  R(heart, c, 'heartSway', 0, 1, 0.01, 'sway (rad)');
  color(heart, c, 'heartColor', 'gold');
  color(heart, c, 'enamelColor', 'enamel');
  R(heart, c, 'heartMetalness', 0, 1, 0.01, 'metalness');
  R(heart, c, 'heartRoughness', 0, 1, 0.01, 'roughness');
  color(heart, c, 'heartEmissive', 'emissive');
  R(heart, c, 'heartEmissiveGlow', 0, 4, 0.05, 'emissive glow');
  R(heart, c, 'beatRate', 0, 4, 0.05, 'beats per second');
  R(heart, c, 'beatAmount', 0, 0.3, 0.005, 'throb');
  R(heart, c, 'crackGlow', 0, 10, 0.05, 'crack light');
  R(heart, c, 'crackScale', 0.5, 8, 0.05, 'crack density');
  R(heart, c, 'woundGlow', 0, 10, 0.05, 'wound light');
  R(heart, c, 'woundSize', 0.02, 0.6, 0.01, 'wound spread');
  R(heart, c, 'beltGlow', 0, 5, 0.05, 'belt pulse');
  R(heart, c, 'recoil', 0, 0.6, 0.01, 'recoil per blow (m)');
  R(heart, c, 'recoilDecay', 0.5, 30, 0.1, 'recoil settles at');
  R(heart, c, 'swell', 0, 0.8, 0.01, 'swells before breaking');
  R(heart, c, 'travelScale', 0.05, 1, 0.01, 'size in flight');
  R(heart, c, 'arcHeight', 0, 0.6, 0.01, 'flight arc (× distance)');
  R(heart, c, 'travelSpin', 0, 20, 0.1, 'spin in flight');

  const aura = sub(folder, '2 · The aura');
  R(aura, c, 'auraGlow', 0, 5, 0.05, 'glow');
  R(aura, c, 'auraInflate', 0, 0.3, 0.005, 'inflate');
  R(aura, c, 'auraFresnel', 0.5, 8, 0.05, 'rim sharpness');
  R(aura, c, 'auraOpacity', 0, 1, 0.01, 'opacity');

  const swords = sub(folder, '3 · The swords');
  R(swords, c, 'swordCount', 0, MAX_SWORDS, 1, 'swords (min = bound)');
  R(swords, c, 'swordReach', 0.1, 1, 0.01, 'blade length (× radius)');
  R(swords, c, 'swordPitch', -0.5, 1.4, 0.01, 'hilt pitch (rad)');
  R(swords, c, 'swordWidth', 0.3, 4, 0.05, 'blade breadth');
  R(swords, c, 'plungeReach', 0, 1.5, 0.01, 'draw back (× radius)');
  R(swords, c, 'tipDepth', -0.3, 0.5, 0.01, 'points buried (× heart)');
  R(swords, c, 'bladeGlow', 0, 8, 0.05, 'blade glow');
  R(swords, c, 'bladeOpacity', 0, 1, 0.01, 'blade opacity');
  R(swords, c, 'boundBoost', 0.5, 4, 0.05, 'bound blades brighter');
  color(swords, c, 'hiltColor', 'hilt');
  R(swords, c, 'hiltMetalness', 0, 1, 0.01, 'hilt metalness');
  R(swords, c, 'hiltRoughness', 0, 1, 0.01, 'hilt roughness');
  R(swords, c, 'returnDrift', 0, 1.5, 0.01, 'back out after (× radius)');
  R(swords, c, 'returnTime', 0.05, 2, 0.01, 'dissolve over (s)');

  const crown = sub(folder, '4 · The crown of thorns');
  R(crown, c, 'crownScale', 0.3, 1.5, 0.01, 'radius (× heart)');
  R(crown, c, 'crownTilt', 0, 1.2, 0.01, 'tilt (rad)');
  R(crown, c, 'crownSpin', -4, 4, 0.05, 'turns at (rad/s)');
  R(crown, c, 'crownTighten', 0, 0.6, 0.01, 'tightens per blow');
  R(crown, c, 'crownSnap', 0, 1, 0.01, 'loosens as it falls (× radius)');
  color(crown, c, 'crownColor', 'briar');
  R(crown, c, 'crownMetalness', 0, 1, 0.01, 'metalness');
  R(crown, c, 'crownRoughness', 0, 1, 0.01, 'roughness');

  const flame = sub(folder, '5 · The flame');
  R(flame, c, 'flameHeight', 0, 2, 0.01, 'height (× heart)');
  R(flame, c, 'flameWidth', 0.02, 0.8, 0.01, 'width (× heart)');
  R(flame, c, 'flameGlow', 0, 8, 0.05, 'glow');
  R(flame, c, 'flameSpeed', 0, 6, 0.05, 'fire speed');
  R(flame, c, 'flameFlare', 0, 5, 0.05, 'flare at the sacrifice');

  const glory = sub(folder, '6 · The glory');
  R(glory, c, 'gloryScale', 0.2, 2, 0.01, 'radius (× zone)');
  R(glory, c, 'gloryRays', 4, 64, 2, 'rays');
  R(glory, c, 'gloryGlow', 0, 5, 0.05, 'glow');
  R(glory, c, 'gloryOpacity', 0, 1, 0.01, 'opacity');
  R(glory, c, 'glorySpin', -2, 2, 0.01, 'spin (rad/s)');
  R(glory, c, 'gloryGather', 0, 0.4, 0.005, 'brightens per blow');
  R(glory, c, 'gloryFlare', 0, 6, 0.05, 'flare at the sacrifice');
  R(glory, c, 'gloryOffset', 0, 3, 0.01, 'behind the heart (m)');

  const floor = sub(folder, '7 · The consecrated floor');
  R(floor, c, 'floorGlow', 0, 6, 0.05, 'line glow');
  R(floor, c, 'floorFill', 0, 1, 0.01, 'sanctified field');
  R(floor, c, 'floorRayGlow', 0, 5, 0.05, 'accord rays');
  R(floor, c, 'sealWidth', 0.01, 0.3, 0.005, 'line width (m)');
  R(floor, c, 'searGlow', 0, 8, 0.05, 'sear');
  R(floor, c, 'searTime', 0.05, 2, 0.01, 'sear runs out over (s)');
  R(floor, c, 'floorNoise', 0, 2, 0.01, 'mottling');
  R(floor, c, 'dissolveTime', 0.05, 1, 0.01, 'dissolves over (× exit)');

  const shards = sub(folder, '8 · The shards');
  R(shards, c, 'shardCount', 0, MAX_SHARDS, 1, 'shards');
  R(shards, c, 'shardSize', 0.2, 3, 0.01, 'size');
  R(shards, c, 'shardSpeed', 0, 12, 0.05, 'thrown out (m/s)');
  R(shards, c, 'shardLift', 0, 10, 0.05, 'thrown up (m/s)');
  R(shards, c, 'shardGravity', 0.5, 30, 0.1, 'gravity');
  R(shards, c, 'shardSpin', 0, 20, 0.1, 'tumble');
  R(shards, c, 'shardCool', 0.05, 3, 0.01, 'cools over (s)');

  const fx = sub(folder, '9 · Particles');
  R(fx, c, 'moteRate', 0, 200, 1, 'floor motes (/s)');
  R(fx, c, 'trailRate', 0, 200, 1, 'flight trail (/s)');
  R(fx, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(fx, c, 'moteLife', 0.1, 4, 0.05, 'mote life');
  R(fx, c, 'moteRise', -2, 4, 0.05, 'mote rise');
  R(fx, c, 'moteGlow', 0, 6, 0.05, 'mote glow');
  R(fx, c, 'sparkCount', 0, 60, 1, 'sparks per blow');
  R(fx, c, 'sparkRupture', 0, 240, 1, 'sparks at the sacrifice');
  R(fx, c, 'sparkSize', 0.01, 0.3, 0.005, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 2, 0.01, 'spark life');
  R(fx, c, 'sparkSpeed', 0, 20, 0.1, 'spark speed');
  R(fx, c, 'sparkGlow', 0, 8, 0.05, 'spark glow');
  R(fx, c, 'flakeCount', 0, 200, 1, 'gold leaf');
  R(fx, c, 'flakeSize', 0.01, 0.4, 0.005, 'leaf size');
  R(fx, c, 'flakeLife', 0.1, 4, 0.05, 'leaf life');
  R(fx, c, 'flakeSpeed', 0, 10, 0.05, 'leaf speed');
  R(fx, c, 'flakeGravity', 0, 15, 0.1, 'leaf gravity');

  const beats = sub(folder, '10 · The beats');
  R(beats, c, 'arriveShake', 0, 1, 0.005, 'knock on landing');
  R(beats, c, 'plungeShake', 0, 0.5, 0.005, 'knock per blow');
  R(beats, c, 'ruptureShake', 0, 1, 0.005, 'knock at the sacrifice');
  R(beats, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(beats, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(beats, c, 'arriveFlash', 0, 1, 0.01, 'flash on landing');
  R(beats, c, 'ruptureFlash', 0, 1, 0.01, 'flash at the sacrifice');
  R(beats, c, 'decalLife', 0.1, 6, 0.05, 'decals last (s)');
  R(beats, c, 'crackDecal', 0, 2, 0.01, 'crack decal (× radius)');
  R(beats, c, 'scorchDecal', 0, 2, 0.01, 'scorch decal (× radius)');
  R(beats, c, 'shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave width');
  R(beats, c, 'burstReach', 0, 2.5, 0.01, 'shell reach (× radius)');
  R(beats, c, 'burstLife', 0.05, 3, 0.01, 'shell life');
  R(beats, c, 'burstIntensity', 0, 3, 0.01, 'shell brightness');
  R(beats, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(beats, c, 'burstFresnel', 0, 6, 0.05, 'shell rim');
  R(beats, c, 'burstSquash', 0.05, 1.5, 0.01, 'shell squash');
  color(beats, c, 'colorBurstA', 'shell inner');
  color(beats, c, 'colorBurstB', 'shell mid');
  color(beats, c, 'colorBurstC', 'shell outer');

  const lens = sub(folder, '11 · The lens');
  R(lens, c, 'lensHeat', 0, 2, 0.01, 'heat over the flame');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'pressure ring');

  return folder;
}
