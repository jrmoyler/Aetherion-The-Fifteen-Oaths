import {
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createReversalBoltMaterial,
  createReversalConeMaterial,
  createReversalPlateMaterial,
  createReversalSealMaterial,
  createReversalWallMaterial,
  createReversalWarpMaterial
} from '../../materials/atlas/AegisReversalMaterials.js';
import { createShieldPlateGeometry, createStripGeometry } from '../../assets/atlas/AegisReversalGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'reversal';

const TAU = Math.PI * 2;

/** Plates per ring at most: the boss, the inner ring, the outer ring. */
const MAX_BOSS = 8;
const MAX_INNER = 12;
const MAX_OUTER = 16;
const MAX_PLATES = MAX_BOSS + MAX_INNER + MAX_OUTER;

const _emit = {};
const _centre = new Vector3();
const _pos = new Vector3();
const _dir = new Vector3();
const _side = new Vector3();
const _axis = new Vector3();
const _pc = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _up = new Vector3(0, 1, 0);
const _zero = new Vector3();

/**
 * AEGIS REVERSAL — a parry that answers.
 *
 * An anchor spark runs out to the circle. There, plates fly in from every
 * side, tumbling, and lock into a round **shield** of three rings — a boss,
 * an inner ring, an outer ring — standing upright with its face turned *out
 * along the aim line*, its back to the caster. The rings turn slowly, in
 * opposite directions. From further down that line a hostile **bolt** flares
 * at its muzzle and comes in. It strikes the shield: a spray of sparks, a
 * ripple across the plates from the point of impact, the shield shoved back
 * a hand's width. And the blow **stays in it** — the engraved channels fill
 * with light that crawls round the disc, the rings spin up hard, the rim
 * crackles, and a faint cone is sketched on the floor ahead. Then it lets go:
 * a **counter-wave** fans out from the face as a widening cone — a bright
 * front sweeping across the floor with rays and chevrons racing behind it and
 * a standing, warping wavefront riding it — and every body it reaches inside
 * that cone is thrown down it. The plates come apart and scatter.
 *
 * Layers:
 *
 *   1. **the plates** — one InstancedMesh of parameter-space plate blanks
 *      built into dished, bevelled annular sectors in the vertex stage
 *      (`AegisReversalGeometry`), steel with engraved charge channels, lit
 *      chamfers and an impact ripple (`createReversalPlateMaterial`).
 *   2. **the bolt** — a camera-facing corkscrewing streak with a torn tail,
 *      and its muzzle flare; STREAK sparks off its tail.
 *   3. **the cone** — a ground shader: preview edges while charged, then the
 *      sweeping front, rays, chevrons and lit edges, lingering as a scorch.
 *   4. **the wavefront** — an additive banded wall bent round the cone's arc
 *      at the front, and its LAYER.DISTORTION twin pushing the frame outward.
 *   6. **the seal** — a dark engraved disc under the shield (premultiplied
 *      "over", so it darkens the floor): its rings close on the mark while
 *      the anchor is in flight, then its rune and chevron rings turn, burn
 *      brighter with the stored blow and flare at the release.
 *   5. **impacts** — catch: STORM burst, SHOCKWAVE, spark spray, flash, kick;
 *      release: AIR burst, SHOCKWAVE, DUSTRING, CHIP shards thrown down the
 *      cone, SMOKE dust kicked up along the front, flash, shake, light.
 *
 * ## The bodies
 *
 * `handlesOwnHits` is true. Nothing is hurt by the shield or by the bolt (it
 * is the shield's to catch). Bodies die to the **counter-wave only**, and only
 * when its front actually reaches them inside the cone — tested every frame
 * against the cone's *live* half-angle at that distance — and each is thrown
 * straight down the cone along its own bearing from the apex.
 *
 * ## The clock and the editor rule
 *
 * The timeline starts when the anchor lands: assemble → bolt delay → muzzle
 * warning → flight → catch → store → sweep → linger; then the fade scatters
 * the plates. Each event is a function of the live settings and one clock, so
 * a slider dragged mid-cast retimes what has not happened yet. Records hold
 * dice only (plate fly-in directions, the strike's offset, latches).
 */
export class AegisReversalAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this.plates.count;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- the shield's frame: everything in it is in disc space ---- */
    this.shield = new Object3D();
    this.shield.name = 'ReversalShield';
    this.group.add(this.shield);

    /* ---- layer 1: the plates ---- */
    this.plateGeometry = createShieldPlateGeometry(10, 6);
    this.plateAttr = new InstancedBufferAttribute(new Float32Array(MAX_PLATES * 4), 4);
    this.plateInfo = new InstancedBufferAttribute(new Float32Array(MAX_PLATES * 4), 4);
    this.plateGeometry.setAttribute('aPlate', this.plateAttr);
    this.plateGeometry.setAttribute('aInfo', this.plateInfo);
    this.plateMaterial = createReversalPlateMaterial();
    this.plates = new InstancedMesh(this.plateGeometry, this.plateMaterial, MAX_PLATES);
    this.plates.name = 'ReversalPlates';
    // Opaque but on VFX: built in the vertex stage, so the WORLD depth prepass
    // would rasterise the raw blank.
    this.plates.layers.set(LAYER.VFX);
    this.plates.renderOrder = 3;
    this.plates.frustumCulled = false;
    this.plates.count = 0;
    this.plates.visible = false;
    this.shield.add(this.plates);

    /* ---- layer 2: the bolt ---- */
    this.boltGeometry = createStripGeometry(6, 24);
    this.boltMaterial = createReversalBoltMaterial();
    this.bolt = new Mesh(this.boltGeometry, this.boltMaterial);
    this.bolt.name = 'ReversalBolt';
    this.bolt.layers.set(LAYER.VFX);
    this.bolt.renderOrder = 14;
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.group.add(this.bolt);

    /* ---- layer 3: the cone on the floor ---- */
    this.coneGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.coneMaterial = createReversalConeMaterial();
    this.cone = new Mesh(this.coneGeometry, this.coneMaterial);
    this.cone.name = 'ReversalCone';
    this.cone.layers.set(LAYER.VFX);
    this.cone.renderOrder = 5;
    this.cone.frustumCulled = false;
    this.cone.visible = false;
    this.group.add(this.cone);

    /* ---- layer 6: the seal the shield stands on ---- */
    this.sealMaterial = createReversalSealMaterial();
    this.seal = new Mesh(this.coneGeometry, this.sealMaterial);
    this.seal.name = 'ReversalSeal';
    this.seal.layers.set(LAYER.VFX);
    this.seal.renderOrder = 4;
    this.seal.frustumCulled = false;
    this.seal.visible = false;
    this.group.add(this.seal);

    /* ---- layer 4: the wavefront and its warp ---- */
    this.wallGeometry = createStripGeometry(48, 6);
    this.wallMaterial = createReversalWallMaterial();
    this.wall = new Mesh(this.wallGeometry, this.wallMaterial);
    this.wall.name = 'ReversalWall';
    this.wall.layers.set(LAYER.VFX);
    this.wall.renderOrder = 13;
    this.wall.frustumCulled = false;
    this.wall.visible = false;
    this.group.add(this.wall);

    this.warpMaterial = createReversalWarpMaterial();
    this.warp = new Mesh(this.wallGeometry, this.warpMaterial);
    this.warp.name = 'ReversalWarp';
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);

    /* ---- per-cast dice and latches ---- */
    this._plates = [];
    for (let i = 0; i < MAX_PLATES; i++) {
      this._plates.push({ dx: 0, dy: 0, dz: 0, ax: 0, ay: 1, az: 0, lag: 0, seed: 0, fly: 1 });
    }
    /** Integrated ring angles: boss, inner, outer. */
    this._ringAngle = new Float32Array(3);
    this._spinRate = 0;
    this._crawl = 0;
    this._seed = 0;
    /** Seconds since the anchor landed; -1 in flight. */
    this._t = -1;
    this._fadeT = 0;
    this._hit = false;
    this._released = false;
    this._warned = false;
    /** Where on the disc the bolt strikes (metres). */
    this._strikeX = 0;
    this._strikeY = 0;
    this._targets = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };

    this._plateState = { charge: 0, crawl: 0, impactX: 0, impactY: 0, impactAge: -1, fade: 1 };
    this._boltState = { head: new Vector3(), dir: new Vector3(0, 0, 1), length: 1, width: 0.2, fade: 0 };
    this._coneState = { quadSize: 10, axisX: 1, axisZ: 0, reach: 6, front: 0, after: 0, preview: 0, seed: 0 };
    this._wallState = { apex: new Vector3(), axisX: 1, axisZ: 0, front: 0, half: 0.5, height: 1.5, strength: 0 };
    this._sealState = { quadSize: 4, radius: 1.6, spin: 0, tele: 0, form: 0, charge: 0, flash: 0, fade: 1, seed: 0 };
    this._sealSpin = 0;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.sparks = particles.get('reversal.sparks', {
      capacity: 2000,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uDrag.value = 2.0;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.5;
    this.sparks.uniforms.uStretch.value = 0.08;
    this.sparks.uniforms.uGravity.value.set(0, -6, 0);

    this.shards = particles.get('reversal.shards', {
      capacity: 900,
      shape: ParticleShape.CHIP,
      additive: true,
      lit: true,
      softFade: 0.2
    });
    this.shards.uniforms.uDrag.value = 1.6;
    this.shards.uniforms.uEndSize.value = 0.4;
    this.shards.uniforms.uSizeIn.value = 0.02;
    this.shards.uniforms.uFadeIn.value = 0.02;
    this.shards.uniforms.uFadeOut.value = 0.5;
    this.shards.uniforms.uGravity.value.set(0, -5, 0);

    this.dust = particles.get('reversal.dust', {
      capacity: 600,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      lit: true,
      softFade: 0.6
    });
    this.dust.uniforms.uDrag.value = 2.4;
    this.dust.uniforms.uEndSize.value = 2.2;
    this.dust.uniforms.uSizeIn.value = 0.12;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.6;
    this.dust.uniforms.uGravity.value.set(0, 0.4, 0);

    this.trailEmitter = new RateEmitter();
    this.arcEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* The timeline                                                         */
  /* ------------------------------------------------------------------ */

  _scale() {
    return Math.max(0.05, settings.reversal.lifetime * settings.global.lifetime);
  }

  _lockAt() {
    return settings.reversal.assembleTime * this._scale();
  }

  _warnAt() {
    return this._lockAt() + settings.reversal.boltDelay * this._scale();
  }

  _fireAt() {
    return this._warnAt() + settings.reversal.boltWarn * this._scale();
  }

  _flightTime() {
    const c = settings.reversal;
    return Math.max(0.02, (c.boltDistance - c.shieldDish) / Math.max(0.5, c.boltSpeed * settings.global.speed));
  }

  _hitAt() {
    return this._fireAt() + this._flightTime();
  }

  _releaseAt() {
    return this._hitAt() + settings.reversal.storeTime * this._scale();
  }

  _sweepTime() {
    return Math.max(0.05, settings.reversal.sweepTime * this._scale());
  }

  _endAt() {
    return this._releaseAt() + this._sweepTime() + settings.reversal.lingerTime * this._scale();
  }

  /** The impact phase is the whole timeline after the anchor lands. */
  get impactDuration() {
    return Math.max(0.1, this._endAt());
  }

  get fadeDuration() {
    return Math.max(0.1, settings.reversal.fadeTime * settings.global.lifetime);
  }

  lightShimmer() {
    return 0.9 + this._plateState.charge * (0.2 + 0.2 * Math.sin(this.age * 41.0));
  }

  /* ------------------------------------------------------------------ */
  /* Live geometry                                                        */
  /* ------------------------------------------------------------------ */

  get coneReach() {
    return Math.max(0.5, settings.reversal.zoneRadius * settings.reversal.coneReach);
  }

  _floorPoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  /** Plates in each ring, written into a module scratch array. */
  _counts() {
    const c = settings.reversal;
    _ringCounts[0] = Math.min(MAX_BOSS, Math.max(3, Math.round(c.bossPlates)));
    _ringCounts[1] = Math.min(MAX_INNER, Math.max(3, Math.round(c.innerPlates)));
    _ringCounts[2] = Math.min(MAX_OUTER, Math.max(3, Math.round(c.outerPlates)));
    return _ringCounts;
  }

  /** Ring `i`'s inner and outer radius, metres. */
  _ringRadii(i, out) {
    const c = settings.reversal;
    const R = Math.max(0.1, c.shieldRadius);
    const gap = c.ringGap * R;
    const boss = Math.max(0.05, c.bossRadius) * R;
    const inner = Math.max(c.bossRadius + 0.05, c.innerRadius) * R;
    if (i === 0) {
      out[0] = R * 0.04;
      out[1] = boss;
    } else if (i === 1) {
      out[0] = boss + gap;
      out[1] = inner;
    } else {
      out[0] = inner + gap;
      out[1] = R;
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._t = -1;
    this._fadeT = 0;
    this._hit = false;
    this._released = false;
    this._warned = false;
    this._spinRate = 0;
    this._crawl = 0;
    this._ringAngle[0] = Math.random() * TAU;
    this._ringAngle[1] = Math.random() * TAU;
    this._ringAngle[2] = Math.random() * TAU;
    // Where it will be struck: a little off-centre, a different spot each cast.
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * 0.35;
    this._strikeX = Math.cos(a) * r;
    this._strikeY = Math.sin(a) * r;
    for (const p of this._plates) {
      // Fly-in direction: mostly outward and from behind, never through the face.
      p.dx = randRange(-1, 1);
      p.dy = randRange(-0.6, 1);
      p.dz = randRange(-1.2, -0.2);
      const l = Math.hypot(p.dx, p.dy, p.dz) || 1;
      p.dx /= l;
      p.dy /= l;
      p.dz /= l;
      p.ax = randRange(-1, 1);
      p.ay = randRange(-1, 1);
      p.az = randRange(-1, 1);
      p.lag = Math.random();
      p.seed = Math.random();
      p.fly = randRange(0.7, 1.3);
    }
    this.trailEmitter.reset();
    this.arcEmitter.reset();
    this._targets.length = 0;
    this.plates.visible = false;
    this.plates.count = 0;
    this.bolt.visible = false;
    this.cone.visible = false;
    this.wall.visible = false;
    this.warp.visible = false;
    this.seal.visible = false;
    this._sealSpin = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame: the seal                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * The seal under the shield. `tele` is the anchor's progress while it is in
   * flight (the telegraph closing on the mark); once landed it forms, glows
   * with the stored blow, flares at the release and fades with the plates.
   */
  _updateSeal(dt, tele) {
    const c = settings.reversal;
    const g = settings.global;
    const landed = this._t >= 0;
    const t = Math.max(0, this._t);
    const charge = this._charge();
    this._sealSpin += c.sealSpin * (1 + charge * 4) * g.animationSpeed * dt;
    const ss = this._sealState;
    ss.radius = Math.max(0.2, c.shieldRadius * c.sealRadius);
    ss.quadSize = ss.radius * 4.2;
    ss.spin = this._sealSpin;
    ss.tele = landed ? 1 : saturate(tele) * c.sealTelegraph;
    ss.form = landed ? Easing.outCubic(saturate(t / Math.max(0.05, 0.3 * this._scale()))) : 0;
    ss.charge = charge;
    ss.flash = this._released ? Math.exp(-(t - this._releaseAt()) * 5) : this._hit ? Math.exp(-(t - this._hitAt()) * 7) * 0.6 : 0;
    const fading = this.phase === AbilityPhase.FADE;
    ss.fade = fading ? 1 - Easing.inQuad(saturate(this._fadeT / this.fadeDuration)) : 1;
    ss.seed = this._seed;
    this.sealMaterial.userData.sync(ss);
    this._floorPoint(_centre);
    this.seal.position.set(_centre.x, 0.025, _centre.z);
    this.seal.scale.set(ss.quadSize, 1, ss.quadSize);
    this.seal.visible = ss.fade > 0.003 && (landed || ss.tele > 0.003);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame: the shield                                               */
  /* ------------------------------------------------------------------ */

  /** Charge held in the plates, 0..1: fills at the catch, drains as the wave goes. */
  _charge() {
    if (!this._hit) return 0;
    const t = this._t;
    const fill = Easing.outCubic(saturate((t - this._hitAt()) / 0.18));
    if (!this._released) return fill;
    return fill * (1 - Easing.outQuad(saturate((t - this._releaseAt()) / this._sweepTime())));
  }

  _updateShield(dt) {
    const c = settings.reversal;
    const g = settings.global;
    const t = Math.max(0, this._t);
    const s = this._scale();
    this._floorPoint(_centre);

    /* --- the frame: upright, face along the aim line, leaning back --- */
    let recoil = 0;
    if (this._hit) {
      const since = t - this._hitAt();
      recoil += c.catchRecoil * Math.exp(-since / Math.max(0.02, c.catchRecoilTime * s)) * saturate(since / 0.04);
    }
    if (this._released) {
      const since = t - this._releaseAt();
      recoil += c.catchRecoil * 1.5 * Math.exp(-since / Math.max(0.02, c.catchRecoilTime * s)) * saturate(since / 0.03);
    }
    const charge = this._charge();
    const full = this._hit && !this._released ? 1 : 0;
    const shiver = c.storeShiver * full * charge;
    this.shield.position.set(
      _centre.x - this.direction.x * recoil + Math.sin(this.age * 71) * shiver,
      c.shieldHeight + Math.sin(this.age * 1.3) * 0.02 + Math.sin(this.age * 83) * shiver,
      _centre.z - this.direction.z * recoil + Math.cos(this.age * 67) * shiver
    );
    // Face (+Z local) along the aim line; lean back about the side axis.
    this.shield.rotation.set(0, 0, 0);
    this.shield.rotation.order = 'YXZ';
    this.shield.rotation.y = Math.atan2(this.direction.x, this.direction.z);
    this.shield.rotation.x = -c.shieldTilt;

    /* --- spin: idle, then the stored blow drives it hard --- */
    const target = this._hit && !this._released ? c.spinCharged : this._released ? lerp(c.spinCharged, c.spinIdle, saturate((t - this._releaseAt()) / this._sweepTime())) : c.spinIdle;
    const ramp = Math.max(0.02, c.spinRamp * s);
    this._spinRate += (target - this._spinRate) * Math.min(1, dt / ramp);
    for (let i = 0; i < 3; i++) {
      const dirn = i === 1 ? -1 : 1;
      this._ringAngle[i] += this._spinRate * (1 + (2 - i) * c.spinSpread) * dirn * g.animationSpeed * dt;
    }
    this._crawl += c.chargeCrawl * (1 + charge * 2) * g.animationSpeed * dt * TAU;

    /* --- the plates --- */
    const counts = this._counts();
    const radii = _ringRadiiScratch;
    const P = this.plateAttr.array;
    const I = this.plateInfo.array;
    const assemble = Math.max(0.02, c.assembleTime * s);
    const stagger = saturate(c.assembleStagger);
    const fading = this.phase === AbilityPhase.FADE;
    const fadeK = fading ? saturate(this._fadeT / this.fadeDuration) : 0;
    let k = 0;

    for (let ring = 0; ring < 3; ring++) {
      const n = counts[ring];
      this._ringRadii(ring, radii);
      const step = TAU / n;
      const gap = Math.min(step * 0.6, c.plateGap);
      for (let p = 0; p < n; p++) {
        const dice = this._plates[k];
        const start = this._ringAngle[ring] + p * step + gap * 0.5;
        const span = step - gap;
        P[k * 4 + 0] = start;
        P[k * 4 + 1] = span;
        P[k * 4 + 2] = radii[0];
        P[k * 4 + 3] = radii[1];

        // Assembly: each plate on its own lag; locks with a flash.
        const begin = dice.lag * stagger * assemble;
        const a = saturate((t - begin) / Math.max(0.02, assemble * (1 - stagger)));
        const ea = Easing.outCubic(a);
        const lockedFor = t - (begin + assemble * (1 - stagger));
        I[k * 4 + 0] = ring;
        I[k * 4 + 1] = dice.seed;
        I[k * 4 + 2] = a >= 1 ? Math.exp(-Math.max(0, lockedFor) * 10) : 0;
        I[k * 4 + 3] = 0;

        // The plate's centre in disc space (for tumbling about itself).
        const mid = start + span * 0.5;
        const rm = (radii[0] + radii[1]) * 0.5;
        _pc.set(Math.cos(mid) * rm, Math.sin(mid) * rm, 0);
        // Out: reverse of the fly-in, plus forward along the face.
        const away = (1 - ea) * c.scatter * dice.fly + Easing.inQuad(fadeK) * c.scatter * 1.6 * dice.fly;
        const tumble = (1 - ea) * c.assembleTumble + fadeK * c.assembleTumble * 1.5;
        const shrink = 1 - Easing.inCubic(fadeK);
        _axis.set(dice.ax, dice.ay, dice.az).normalize();
        _q.setFromAxisAngle(_axis, tumble * (dice.seed > 0.5 ? 1 : -1));
        // M = T(pc + off) · R · S · T(-pc)
        _m.makeTranslation(-_pc.x, -_pc.y, -_pc.z);
        _m2.compose(_zero, _q, _pos.set(shrink, shrink, shrink));
        _m.premultiply(_m2);
        if (fading) {
          // Thrown outward from the boss and forward off the face.
          _dir.set(_pc.x, _pc.y, 0).normalize().multiplyScalar(0.8);
          _dir.z += 0.6 + dice.dz * 0.3;
          _dir.normalize();
        } else {
          _dir.set(dice.dx, dice.dy, dice.dz);
        }
        _m2.makeTranslation(_pc.x + _dir.x * away, _pc.y + _dir.y * away, _pc.z + _dir.z * away);
        _m.premultiply(_m2);
        this.plates.setMatrixAt(k, _m);
        k++;
      }
    }
    this.plates.count = k;
    this.plates.visible = this._t >= 0 && shrinkVisible(fadeK);
    this.plates.instanceMatrix.needsUpdate = true;
    this.plateAttr.needsUpdate = true;
    this.plateInfo.needsUpdate = true;

    const ps = this._plateState;
    ps.charge = charge;
    ps.crawl = this._crawl;
    ps.impactX = this._strikeX * c.shieldRadius;
    ps.impactY = this._strikeY * c.shieldRadius;
    ps.impactAge = this._hit ? t - this._hitAt() : -1;
    if (this._released && t - this._releaseAt() < 0.6) {
      // The release ripples out from the boss.
      ps.impactX = 0;
      ps.impactY = 0;
      ps.impactAge = t - this._releaseAt();
    }
    ps.fade = 1 - fadeK * 0.6;
    this.plateMaterial.userData.sync(ps);
  }

  /** The face's centre in world space. */
  _faceCentre(out) {
    this.shield.updateMatrixWorld();
    return out.set(0, 0, 0).applyMatrix4(this.shield.matrixWorld);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame: the bolt                                                  */
  /* ------------------------------------------------------------------ */

  _updateBolt(dt) {
    const c = settings.reversal;
    const g = settings.global;
    const t = this._t;
    const bs = this._boltState;
    this._floorPoint(_centre);

    // The muzzle, beyond the shield and swung `boltYaw` off the aim line, so
    // the bolt crosses the frame on its way in instead of coming straight at
    // the camera hidden behind the disc. It still strikes the face.
    const cy = Math.cos(c.boltYaw);
    const sy = Math.sin(c.boltYaw);
    _dir.set(this.direction.x * cy - this.direction.z * sy, 0, this.direction.x * sy + this.direction.z * cy);
    _pos.copy(_centre).addScaledVector(_dir, c.boltDistance);
    _pos.y = c.boltHeight;
    const warnAt = this._warnAt();
    const fireAt = this._fireAt();
    const hitAt = this._hitAt();

    if (t < warnAt || this._hit) {
      this.bolt.visible = false;
      return;
    }
    if (!this._warned) {
      // A scorch under the muzzle: something hostile is standing out there.
      this._warned = true;
      _dir.copy(_pos).setY(0);
      this.ctx.decals.spawn(DecalType.SCORCH, _dir, {
        radius: 0.5,
        life: 2.5,
        intensity: 0.6,
        colorA: getColor(c.colorBolt),
        colorB: getColor(c.colorSparkD)
      });
    }

    // Where the strike lands, in world space: the shield's frame applied to
    // the strike point on the face.
    this.shield.updateMatrixWorld();
    _side.set(this._strikeX * c.shieldRadius, this._strikeY * c.shieldRadius, 0).applyMatrix4(this.shield.matrixWorld);

    bs.dir.subVectors(_side, _pos).normalize();
    if (t < fireAt) {
      // Muzzle flare: a swelling knot of light.
      const k = saturate((t - warnAt) / Math.max(0.02, fireAt - warnAt));
      bs.head.copy(_pos);
      bs.length = 0.05;
      bs.width = c.boltWidth * (0.5 + 1.6 * Easing.inQuad(k)) * (0.9 + 0.1 * Math.sin(this.age * 60));
      bs.fade = Easing.outQuad(k);
      // Embers sucked into the muzzle as it gathers: the threat is read early.
      const n = this.trailEmitter.tick(dt, c.muzzleSparks * g.particleCount * (0.3 + k));
      if (n > 0) {
        this._resetEmit(frame.uTime.value);
        _emit.position = _pos;
        _emit.radius = c.boltWidth * 2.5 * (1 - k * 0.6);
        _emit.direction = bs.dir;
        _emit.speed = c.sparkSpeed * 0.25;
        _emit.spread = 1.4;
        _emit.size = c.sparkSize * 1.3;
        _emit.life = c.sparkLife * 0.5;
        _emit.tint = getColor(c.colorBolt);
        this.sparks.emit(n, _emit);
      }
    } else {
      const k = saturate((t - fireAt) / Math.max(0.02, hitAt - fireAt));
      bs.head.lerpVectors(_pos, _side, k);
      const flown = _pos.distanceTo(bs.head);
      bs.length = Math.min(c.boltLength, flown + 0.05);
      bs.width = c.boltWidth;
      bs.fade = 1;
      // Sparks off its tail.
      const n = this.trailEmitter.tick(dt, c.boltTrail * g.particleCount);
      if (n > 0) {
        this._resetEmit(frame.uTime.value);
        _dir.copy(bs.dir).negate();
        _emit.position = bs.head;
        _emit.radius = c.boltWidth * 0.3;
        _emit.direction = _dir;
        _emit.speed = c.sparkSpeed * 0.3;
        _emit.spread = 0.5;
        _emit.size = c.sparkSize;
        _emit.life = c.sparkLife * 0.6;
        _emit.tint = getColor(c.colorBolt);
        this.sparks.emit(n, _emit);
      }
    }
    this.boltMaterial.userData.sync(bs);
    this.bolt.visible = bs.fade > 0.003;
  }

  /** The bolt strikes the shield. */
  _catch() {
    const c = settings.reversal;
    const g = settings.global;
    const power = g.explosionIntensity;
    this._hit = true;
    this.bolt.visible = false;
    this.shield.updateMatrixWorld();
    _pos.set(this._strikeX * c.shieldRadius, this._strikeY * c.shieldRadius, 0).applyMatrix4(this.shield.matrixWorld);

    this.ctx.bursts.spawn(BurstMode.STORM, _pos, {
      radius: 0.15,
      endRadius: c.shieldRadius * 1.1 * power,
      life: 0.35,
      intensity: 1.4,
      squash: 0.6,
      colorA: getColor(c.colorBoltCore),
      colorB: getColor(c.colorBolt),
      colorC: getColor(c.colorRimLight)
    });
    this._floorPoint(_centre);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shieldRadius * 1.8 * power,
      life: 0.45,
      width: 0.06,
      intensity: 1.0,
      colorA: getColor(c.colorBoltCore),
      colorB: getColor(c.colorRimLight)
    });

    // Sparks spraying off the face: back along the bolt's line, fanned.
    this._resetEmit(frame.uTime.value);
    _dir.copy(this.direction).setY(0.5).normalize();
    _emit.position = _pos;
    _emit.radius = 0.1;
    _emit.direction = _dir;
    _emit.speed = c.sparkSpeed * power;
    _emit.speedVariance = 0.5;
    _emit.spread = 1.1;
    _emit.size = c.sparkSize * 1.2;
    _emit.life = c.sparkLife;
    this.sparks.emit(Math.round(c.catchSparks * g.particleCount), _emit);

    this.ctx.shake.add(c.catchShake * power * g.cameraShake, 4, 26);
    this.ctx.flash.trigger(getColor(c.colorBoltCore), c.catchFlash * power);
    this.lightBoost = c.catchLight * power;
  }

  /** The blow is fired back. */
  _release() {
    const c = settings.reversal;
    const g = settings.global;
    const power = g.explosionIntensity;
    this._released = true;
    this._faceCentre(_pos);
    this._floorPoint(_centre);

    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: c.shieldRadius * 0.5,
      endRadius: c.shieldRadius * c.releaseBurst * power,
      life: 0.35,
      intensity: 1.2,
      opacity: 0.3,
      fresnel: 3.2,
      squash: 0.8,
      // Saturated at the heart, the wave's blue at the rim: no white dome.
      colorA: getColor(c.colorSeal),
      colorB: getColor(c.colorConeA),
      colorC: getColor(c.colorRimLight)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shieldRadius * 2.5 * power,
      life: 0.5,
      width: 0.08,
      intensity: 1.2,
      colorA: getColor(c.colorConeB),
      colorB: getColor(c.colorConeA)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.shieldRadius * 2.0 * power,
      life: 1.4,
      intensity: 0.7,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC)
    });

    // Shards thrown down the cone, spread across its full angle.
    const shards = Math.round(c.shardCount * g.particleCount);
    const time = frame.uTime.value;
    for (let n = 0; n < shards; n += 6) {
      const a = randRange(-1, 1) * c.coneAngle;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      _dir.set(this.direction.x * ca - this.direction.z * sa, randRange(0.05, 0.35), this.direction.x * sa + this.direction.z * ca).normalize();
      this._resetEmit(time);
      _emit.position = _pos;
      _emit.radius = c.shieldRadius * 0.5;
      _emit.direction = _dir;
      _emit.speed = c.shardSpeed * power;
      _emit.speedVariance = 0.4;
      _emit.spread = 0.08;
      _emit.size = c.shardSize;
      _emit.life = c.shardLife;
      _emit.spin = 12;
      this.shards.emit(Math.min(6, shards - n), _emit);
    }

    this.ctx.shake.add(c.releaseShake * power * g.cameraShake, 3, 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.releaseFlash * power);
    this.lightBoost = c.releaseLight * power;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame: the cone and the wavefront                                */
  /* ------------------------------------------------------------------ */

  _updateCone(dt) {
    const c = settings.reversal;
    const g = settings.global;
    const t = this._t;
    const reach = this.coneReach;
    this._floorPoint(_centre);

    const cs = this._coneState;
    cs.quadSize = reach * 2.3;
    cs.axisX = this.direction.x;
    cs.axisZ = this.direction.z;
    cs.reach = reach;
    cs.seed = this._seed;
    // A faint sketch of the threat while the blow is held.
    cs.preview = this._hit && !this._released ? 0.35 * Easing.outCubic(saturate((t - this._hitAt()) / 0.3)) : 0;
    const fading = this.phase === AbilityPhase.FADE;
    let front = 0;
    let after = 0;
    if (this._released) {
      const since = t - this._releaseAt();
      const k = saturate(since / this._sweepTime());
      front = reach * Easing.outCubic(k);
      after = saturate((since - this._sweepTime()) / Math.max(0.05, c.lingerTime * this._scale()));
      if (fading) after = 1;
    }
    cs.front = front;
    cs.after = fading ? 1 : after * 0.85;
    this.coneMaterial.userData.sync(cs);
    this.cone.position.set(_centre.x, 0.02, _centre.z);
    this.cone.scale.set(cs.quadSize, 1, cs.quadSize);
    this.cone.visible = (cs.preview > 0.003 || this._released) && !(fading && this._fadeT > this.fadeDuration * 0.5);

    /* --- the standing wavefront, riding the front --- */
    const ws = this._wallState;
    ws.apex.copy(_centre);
    ws.axisX = this.direction.x;
    ws.axisZ = this.direction.z;
    const k = reach > 0 ? front / reach : 0;
    const sweeping = this._released && front < reach * 0.999;
    // Presentation only: once the front (and its hits) has run its course the
    // wall carries on a beat — rolling a little further, its crest slumping —
    // so the blow reads from behind the caster, past the shield's top.
    const since = this._released ? t - this._releaseAt() : 0;
    const tailTime = Math.max(0.01, c.wallLinger * this._scale());
    const tail = this._released ? saturate((since - this._sweepTime()) / tailTime) : 0;
    ws.front = Math.max(0.05, front + reach * 0.1 * Easing.outQuad(tail));
    ws.half = lerp(c.coneStartAngle, c.coneAngle, k);
    // Grows as it runs, so it stays tall in frame as it moves away.
    ws.height = c.wallHeight * (1 + c.wallGrow * Easing.outQuad(k)) * (1 - 0.45 * tail);
    ws.strength = this._released
      ? saturate(since / 0.05) * (1 - 0.3 * saturate((k - 0.6) / 0.4)) * (1 - Easing.inQuad(tail))
      : 0;
    if (fading) ws.strength = 0;
    this.wallMaterial.userData.sync(ws);
    this.warpMaterial.userData.sync(ws);
    this.wall.visible = this._released && tail < 1 && ws.strength > 0.003;
    this.warp.visible = this.wall.visible;

    if (sweeping) {
      this._killInCone(front);
      this._dustAlongFront(dt, front, ws.half);
      // The light rides the front.
      this.position.copy(_centre).addScaledVector(this.direction, front);
      this.position.y = 1.0;
    }
  }

  /** Every live body the front has reached inside the cone is thrown down it. */
  _killInCone(front) {
    if (!settings.dummies.hit.enabled) return;
    const c = settings.reversal;
    const g = settings.global;
    const found = this.ctx.dummies?.findTargets?.(_centre.x, _centre.z, front, this._targets);
    if (!found || found.length === 0) return;
    const reach = this.coneReach;
    const body = settings.dummies.bodyRadius;
    this._force.impulse = c.hit.impulse * g.explosionIntensity;
    this._force.lift = c.hit.lift * g.explosionIntensity;
    this._force.spin = c.hit.spin;
    for (const dummy of found) {
      const dx = dummy.position.x - _centre.x;
      const dz = dummy.position.z - _centre.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      if (along <= 0) continue;
      const d = Math.hypot(dx, dz);
      const half = lerp(c.coneStartAngle, c.coneAngle, saturate(d / reach));
      const ang = Math.acos(Math.min(1, along / Math.max(d, 1e-4)));
      // The body's own width counts: a shoulder in the cone is a body in it.
      if (ang > half + Math.atan2(body, Math.max(d, 1e-3))) continue;
      dummy.kill(dx / Math.max(d, 1e-4), dz / Math.max(d, 1e-4), this._force);
    }
  }

  _dustAlongFront(dt, front, half) {
    const c = settings.reversal;
    const g = settings.global;
    const n = Math.round(c.dustCount * g.particleCount * g.emissionRate * dt / this._sweepTime());
    const time = frame.uTime.value;
    for (let i = 0; i < n; i++) {
      const a = randRange(-1, 1) * half;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      _dir.set(this.direction.x * ca - this.direction.z * sa, 0, this.direction.x * sa + this.direction.z * ca);
      _pos.copy(_centre).addScaledVector(_dir, front);
      _pos.y = 0.15;
      _dir.y = 0.4;
      this._resetEmit(time);
      _emit.position = _pos;
      _emit.radius = 0.2;
      _emit.direction = _dir;
      _emit.speed = 2.0;
      _emit.spread = 0.5;
      _emit.size = c.dustSize;
      _emit.life = c.dustLife;
      _emit.spin = 1.5;
      this.dust.emit(1, _emit);
    }
  }

  /** Crackle round the rim while the blow is held. */
  _storeFx(dt) {
    const c = settings.reversal;
    const g = settings.global;
    if (!this._hit || this._released) return;
    this.ctx.shake.rumble?.(c.storeHum * g.cameraShake * this._charge(), dt);
    const n = this.arcEmitter.tick(dt, c.storeArcs * g.particleCount);
    if (n <= 0) return;
    this.shield.updateMatrixWorld();
    const time = frame.uTime.value;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      _pos.set(Math.cos(a) * c.shieldRadius, Math.sin(a) * c.shieldRadius, -c.shieldDish).applyMatrix4(this.shield.matrixWorld);
      _dir.set(Math.cos(a), Math.sin(a), 0).transformDirection(this.shield.matrixWorld);
      this._resetEmit(time);
      _emit.position = _pos;
      _emit.radius = 0.04;
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed * 0.35;
      _emit.spread = 0.6;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife * 0.5;
      _emit.tint = getColor(c.colorCharge);
      this.sparks.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                            */
  /* ------------------------------------------------------------------ */

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.4;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.5;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  _syncParticles() {
    const c = settings.reversal;
    const g = settings.global;
    for (const sys of [this.sparks, this.shards]) {
      sys.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
      sys.uniforms.uSizeScale.value = g.particleSize;
      sys.uniforms.uLifeScale.value = g.particleLifetime;
      sys.uniforms.uSpeedScale.value = g.particleSpeed;
      sys.uniforms.uOpacity.value = g.opacity;
      sys.uniforms.uGlow.value = g.glow;
    }
    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    this.dust.uniforms.uSizeScale.value = g.particleSize;
    this.dust.uniforms.uLifeScale.value = g.particleLifetime;
    this.dust.uniforms.uSpeedScale.value = g.particleSpeed;
    this.dust.uniforms.uOpacity.value = g.opacity * 0.7;
    this.dust.uniforms.uTurbulence.value = 0.5 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._syncParticles();
    // Anticipation at the target: the seal's telegraph closes on the mark.
    this._updateSeal(dt, this.u);
    // The anchor: a short streak of light racing out at knee height.
    this.position.y = 0.5;
    const n = this.trailEmitter.tick(dt, 120 * settings.global.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _dir.copy(this.direction).negate();
      _emit.position = this.position;
      _emit.radius = 0.1;
      _emit.direction = _dir;
      _emit.speed = 2;
      _emit.spread = 0.4;
      _emit.size = settings.reversal.sparkSize;
      _emit.life = settings.reversal.sparkLife * 0.5;
      _emit.tint = getColor(settings.reversal.colorRimLight);
      this.sparks.emit(n, _emit);
    }
  }

  onImpact() {
    this._t = 0;
    this.trailEmitter.reset();
    this._floorPoint(_centre);
    this.ctx.decals.spawn(DecalType.RIPPLE, _centre, {
      radius: settings.reversal.shieldRadius * 1.6,
      life: 0.8,
      intensity: 0.5,
      colorA: getColor(settings.reversal.colorRimLight),
      colorB: getColor(settings.reversal.colorCharge)
    });
    this._updateShield(0);
  }

  onFade(dt) {
    this._syncParticles();
    if (this.phase === AbilityPhase.FADE) this._fadeT += dt;
    else this._t += dt;

    if (!this._hit && this._t >= this._hitAt()) this._catch();
    if (this._hit && !this._released && this._t >= this._releaseAt()) this._release();

    this._updateShield(dt);
    this._updateBolt(dt);
    this._storeFx(dt);

    this._faceCentre(this.position);
    this._updateCone(dt);
    this._updateSeal(dt, 1);
  }

  onDestroy() {
    this.plates.visible = false;
    this.plates.count = 0;
    this.bolt.visible = false;
    this.cone.visible = false;
    this.wall.visible = false;
    this.warp.visible = false;
    this.seal.visible = false;
    this._t = -1;
    this._targets.length = 0;
  }

  dispose() {
    this.plateGeometry.dispose();
    this.plateMaterial.dispose();
    this.boltGeometry.dispose();
    this.boltMaterial.dispose();
    this.coneGeometry.dispose();
    this.coneMaterial.dispose();
    this.wallGeometry.dispose();
    this.wallMaterial.dispose();
    this.warpMaterial.dispose();
    this.sealMaterial.dispose();
    this.plates.dispose();
    super.dispose();
  }
}

/** Ring radii scratch, [inner, outer]. */
const _ringRadiiScratch = new Float32Array(2);
/** Plates per ring, [boss, inner, outer]. */
const _ringCounts = new Int32Array(3);

/** The plates stay drawn until they have shrunk to nothing. */
function shrinkVisible(fadeK) {
  return fadeK < 0.999;
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const R = Editor.range;
  const folder = gui.addFolder('◐  Aegis Reversal');

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 0, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 120, 0.5, 'anchor speed (m/s)');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'zone radius (m)');
  R(cast, c, 'lifetime', 0.2, 4, 0.01, 'timeline scale (×)');
  R(cast, c, 'fadeTime', 0.1, 4, 0.05, 'plates scatter over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  /* ---- layer 1 ---- */
  const shield = folder.addFolder('1 · Shield');
  const shape = shield.addFolder('Shape');
  R(shape, c, 'shieldRadius', 0.2, 4, 0.01, 'radius (m)');
  R(shape, c, 'shieldHeight', 0.3, 4, 0.01, 'centre height (m)');
  R(shape, c, 'shieldDish', -0.5, 1, 0.005, 'dish (m)');
  R(shape, c, 'shieldTilt', -0.8, 0.8, 0.005, 'lean back (rad)');
  R(shape, c, 'bossPlates', 3, MAX_BOSS, 1, 'boss plates');
  R(shape, c, 'innerPlates', 3, MAX_INNER, 1, 'inner plates');
  R(shape, c, 'outerPlates', 3, MAX_OUTER, 1, 'outer plates');
  R(shape, c, 'bossRadius', 0.05, 0.6, 0.005, 'boss radius (× radius)');
  R(shape, c, 'innerRadius', 0.15, 0.95, 0.005, 'inner ring radius (× radius)');
  R(shape, c, 'ringGap', 0, 0.2, 0.001, 'ring gap (× radius)');
  R(shape, c, 'plateGap', 0, 0.4, 0.001, 'plate gap (rad)');
  R(shape, c, 'plateThickness', 0.005, 0.4, 0.001, 'thickness (m)');
  R(shape, c, 'plateBevel', 0, 1, 0.01, 'bevel');

  const motion = shield.addFolder('Assembly & spin');
  R(motion, c, 'assembleTime', 0.05, 3, 0.01, 'assembles over (s)');
  R(motion, c, 'assembleStagger', 0, 0.9, 0.01, 'stagger');
  R(motion, c, 'scatter', 0, 8, 0.05, 'flies in from (m)');
  R(motion, c, 'assembleTumble', 0, 20, 0.1, 'tumble (rad)');
  R(motion, c, 'spinIdle', -3, 3, 0.01, 'idle spin (rad/s)');
  R(motion, c, 'spinCharged', -20, 20, 0.05, 'charged spin (rad/s)');
  R(motion, c, 'spinSpread', 0, 3, 0.01, 'inner rings faster by');
  R(motion, c, 'spinRamp', 0.02, 2, 0.01, 'spin-up (s)');

  const metal = shield.addFolder('Steel & charge');
  R(metal, c, 'metalReflect', 0, 3, 0.01, 'reflection');
  R(metal, c, 'metalGloss', 4, 300, 1, 'gloss');
  R(metal, c, 'metalSpecular', 0, 6, 0.05, 'specular');
  R(metal, c, 'engrave', 0, 1, 0.01, 'channel depth');
  R(metal, c, 'rimGlow', 0, 6, 0.05, 'plate rim glow');
  R(metal, c, 'rimWidth', 0.005, 0.4, 0.005, 'plate rim width');
  R(metal, c, 'chargeGlow', 0, 20, 0.05, 'charge glow');
  R(metal, c, 'chargeCrawl', -6, 6, 0.01, 'charge crawl');
  R(metal, c, 'impactRing', 0, 12, 0.05, 'impact ripple');
  metal.addColor(c, 'colorSteel').name('steel');
  metal.addColor(c, 'colorSteelDeep').name('deep steel');
  metal.addColor(c, 'colorSteelSpec').name('highlight');
  metal.addColor(c, 'colorRimLight').name('rim light');
  metal.addColor(c, 'colorCharge').name('charge');
  metal.addColor(c, 'colorChargeHot').name('charge, hot');

  /* ---- layer 2 ---- */
  const bolt = folder.addFolder('2 · Bolt & catch');
  R(bolt, c, 'boltDelay', 0, 3, 0.01, 'after the shield locks (s)');
  R(bolt, c, 'boltWarn', 0, 2, 0.01, 'muzzle warning (s)');
  R(bolt, c, 'boltDistance', 2, 30, 0.1, 'fired from (m)');
  R(bolt, c, 'boltSpeed', 2, 80, 0.5, 'speed (m/s)');
  R(bolt, c, 'boltHeight', 0.2, 4, 0.01, 'height (m)');
  R(bolt, c, 'boltLength', 0.1, 6, 0.05, 'tail (m)');
  R(bolt, c, 'boltWidth', 0.02, 1, 0.005, 'width (m)');
  R(bolt, c, 'boltGlow', 0, 12, 0.05, 'glow');
  R(bolt, c, 'boltWobble', 0, 0.6, 0.005, 'corkscrew (m)');
  R(bolt, c, 'boltTrail', 0, 600, 1, 'trail sparks (/s)');
  R(bolt, c, 'boltYaw', -1.4, 1.4, 0.01, 'comes in from the side (rad)');
  R(bolt, c, 'muzzleSparks', 0, 600, 1, 'muzzle embers (/s)');
  bolt.addColor(c, 'colorBoltCore').name('bolt core');
  bolt.addColor(c, 'colorBoltPale').name('bolt, pale');
  bolt.addColor(c, 'colorBolt').name('bolt');
  bolt.addColor(c, 'colorBoltDeep').name('bolt, deep');
  R(bolt, c, 'catchShake', 0, 1.5, 0.01, 'catch shake');
  R(bolt, c, 'catchFlash', 0, 1, 0.005, 'catch flash');
  R(bolt, c, 'catchLight', 0, 60, 0.5, 'catch light');
  R(bolt, c, 'catchSparks', 0, 400, 1, 'catch sparks');
  R(bolt, c, 'catchRecoil', 0, 1, 0.005, 'recoil (m)');
  R(bolt, c, 'catchRecoilTime', 0.02, 2, 0.01, 'recoil recovery (s)');

  /* ---- layer 3 ---- */
  const store = folder.addFolder('3 · Stored blow');
  R(store, c, 'storeTime', 0, 4, 0.01, 'holds for (s)');
  R(store, c, 'storeShiver', 0, 0.2, 0.001, 'shiver (m)');
  R(store, c, 'storeArcs', 0, 300, 1, 'rim crackle (/s)');
  R(store, c, 'storeHum', 0, 1, 0.005, 'rumble');

  /* ---- layer 4 ---- */
  const wave = folder.addFolder('4 · Counter-wave');
  R(wave, c, 'coneAngle', 0.05, 1.4, 0.005, 'full half-angle (rad)');
  R(wave, c, 'coneStartAngle', 0, 1, 0.005, 'leaving half-angle (rad)');
  R(wave, c, 'coneReach', 0.3, 5, 0.01, 'reach (× zone)');
  R(wave, c, 'sweepTime', 0.05, 3, 0.01, 'sweeps over (s)');
  R(wave, c, 'frontWidth', 0.05, 3, 0.01, 'front width (m)');
  R(wave, c, 'rayCount', 1, 60, 1, 'rays');
  R(wave, c, 'chevrons', 0, 20, 0.1, 'chevrons');
  R(wave, c, 'floorGlow', 0, 8, 0.05, 'floor glow');
  R(wave, c, 'coneDeep', 0, 1, 0.01, 'scorched path (dark)');
  R(wave, c, 'edgeGlow', 0, 8, 0.05, 'edge glow');
  R(wave, c, 'lingerTime', 0, 3, 0.01, 'scorch lingers (s)');
  R(wave, c, 'wallHeight', 0, 5, 0.01, 'wavefront height (m)');
  R(wave, c, 'wallGlow', 0, 8, 0.05, 'wavefront glow');
  R(wave, c, 'wallBands', 0, 20, 0.1, 'wavefront bands');
  R(wave, c, 'wallDeep', 0, 1, 0.01, 'wavefront body (dark)');
  R(wave, c, 'wallCrest', 0, 8, 0.05, 'wavefront crest');
  R(wave, c, 'wallGrow', 0, 2, 0.01, 'wavefront grows as it runs (×)');
  R(wave, c, 'wallLinger', 0, 1.5, 0.01, 'wavefront rolls on after (s)');
  R(wave, c, 'scarGlow', 0, 4, 0.05, 'floor scar glow');
  R(wave, c, 'distortion', 0, 4, 0.01, 'wavefront warp');
  R(wave, c, 'releaseBurst', 0, 4, 0.01, 'air burst (× shield radius)');
  R(wave, c, 'releaseShake', 0, 2, 0.01, 'shake');
  R(wave, c, 'releaseFlash', 0, 1, 0.005, 'flash');
  R(wave, c, 'releaseLight', 0, 80, 0.5, 'light punch');
  wave.addColor(c, 'colorConeA').name('wave');
  wave.addColor(c, 'colorConeB').name('wave, hot');
  wave.addColor(c, 'colorConeDeep').name('wave, deep');
  wave.addColor(c, 'colorFlash').name('flash');
  R(wave, c.hit, 'impulse', 0, 30, 0.1, 'thrown (m/s)');
  R(wave, c.hit, 'lift', 0, 20, 0.1, 'thrown up (m/s)');
  R(wave, c.hit, 'spin', 0, 5, 0.05, 'torque');

  /* ---- layer 5 ---- */
  const parts = folder.addFolder('5 · Sparks, shards & dust');
  R(parts, c, 'sparkSize', 0.01, 0.3, 0.005, 'spark size');
  R(parts, c, 'sparkLife', 0.05, 2, 0.01, 'spark life (s)');
  R(parts, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  Editor.gradient(parts, c, 'colorSpark', 'Spark colour');
  R(parts, c, 'shardCount', 0, 600, 1, 'shards');
  R(parts, c, 'shardSize', 0.01, 0.4, 0.005, 'shard size');
  R(parts, c, 'shardLife', 0.05, 3, 0.01, 'shard life (s)');
  R(parts, c, 'shardSpeed', 0, 40, 0.1, 'shard speed');
  R(parts, c, 'dustCount', 0, 200, 1, 'dust along the front');
  R(parts, c, 'dustSize', 0.05, 2, 0.01, 'dust size');
  R(parts, c, 'dustLife', 0.1, 4, 0.05, 'dust life (s)');
  Editor.gradient(parts, c, 'colorDust', 'Dust colour');

  /* ---- layer 6 ---- */
  const seal = folder.addFolder('6 · Seal');
  R(seal, c, 'sealRadius', 0.5, 3, 0.01, 'radius (× shield)');
  R(seal, c, 'sealGlow', 0, 6, 0.05, 'glow');
  R(seal, c, 'sealDeep', 0, 1, 0.01, 'dark disc');
  R(seal, c, 'sealRunes', 3, 40, 1, 'runes');
  R(seal, c, 'sealSpin', -3, 3, 0.01, 'turn (rad/s)');
  R(seal, c, 'sealTelegraph', 0, 1, 0.01, 'telegraph while in flight');
  seal.addColor(c, 'colorSealDeep').name('deep');
  seal.addColor(c, 'colorSeal').name('engraving');
  seal.addColor(c, 'colorSealHot').name('engraving, hot');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 30, 0.1, 'radius');

  folder.close();
  return folder;
}
