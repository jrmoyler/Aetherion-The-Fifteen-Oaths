import { IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Vector3, DynamicDrawUsage } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createBloomPetalGeometry,
  createBloomGarlandGeometry,
  createBloomQuadGeometry
} from '../../assets/codex/BloomCrownGeometry.js';
import {
  createBloomPetalMaterial,
  createBloomCoreMaterial,
  createBloomGarlandMaterial,
  createBloomSigilMaterial,
  createBloomGroundMaterial,
  createBloomWarpMaterial
} from '../../materials/codex/BloomCrownMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'bloomcrown';

const TAU = Math.PI * 2;
/** Blossoms a crown can carry; the editor's slider clamps to this. */
const MAX_BLOSSOMS = 10;
/** Petals per whorl at most; each blossom has an outer and an inner whorl. */
const MAX_PETALS = 8;
const MAX_PETAL_INSTANCES = MAX_BLOSSOMS * MAX_PETALS * 2;
/** Blossoms the slam can raise out of the floor (the garden). */
const MAX_GARDEN = 14;
const MAX_GARDEN_INSTANCES = MAX_GARDEN * MAX_PETALS * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _centre = new Vector3();
const _radial = new Vector3();
const _axis = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();
const _bx = new Vector3();
const _by = new Vector3();
const _bz = new Vector3();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _up = new Vector3(0, 1, 0);
const _ref = new Vector3(1, 0, 0);
const _coreState = { glow: 1, seed: 0 };
const _seedState = { glow: 1, seed: 0 };
const _garlandState = { centre: new Vector3(), ringR: 1, ringY: 2, spin: 0, count: 7, tiltAmp: 0, tiltPhase: 0, fade: 1 };
const _sigilState = { centre: new Vector3(), radius: 3, petals: 7, spin: 0, lit: 0, flare: 0, wave: 0, waveOn: 1, green: 0, seed: 0 };
const _warpState = { centre: new Vector3(), ringR: 0, strength: 0 };
const _groundState = { centre: new Vector3(), radius: 3, pool: 0, crater: 0, moss: 0, mossOn: 0, stains: 0, fade: 0, seed: 0 };
const _gardenHeartState = { glow: 1, seed: 0 };

function syncSystem(p, a, b, cc, d, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
  p.uniforms.uSizeScale.value = g.particleSize;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

function resetEmit(time) {
  _emit.radius = 0;
  _emit.direction = null;
  _emit.speed = 0;
  _emit.speedVariance = 0.35;
  _emit.spread = 0;
  _emit.inherit = null;
  _emit.anchor = null;
  _emit.size = 0.1;
  _emit.sizeVariance = 0.4;
  _emit.life = 1;
  _emit.lifeVariance = 0.35;
  _emit.spin = 0;
  _emit.tint = null;
  _emit.time = time;
}

/**
 * Seat one blossom's two whorls of `np` petals on an instanced petal mesh,
 * from slot `k`; returns the next free slot. `axis` must be unit length.
 */
function seatBlossom(mesh, attr, k, np, pos, axis, s, open, seed, charge, roll) {
  _e1.crossVectors(axis, Math.abs(axis.x) > 0.9 ? _up : _ref).normalize();
  _e2.crossVectors(axis, _e1);
  for (let layer = 0; layer < 2; layer++) {
    for (let p = 0; p < np; p++, k++) {
      const phi = roll + (p / np) * TAU + layer * (Math.PI / np);
      _bx.copy(_e1).multiplyScalar(Math.cos(phi)).addScaledVector(_e2, Math.sin(phi));
      _by.copy(axis);
      _bz.crossVectors(_bx, _by);
      if (s <= 0.002) {
        mesh.setMatrixAt(k, _zero);
      } else {
        _m.makeBasis(_bx.multiplyScalar(s), _by.multiplyScalar(s), _bz.multiplyScalar(s));
        _m.setPosition(pos);
        mesh.setMatrixAt(k, _m);
      }
      const q = k * 4;
      attr.array[q] = open;
      attr.array[q + 1] = seed + p * 0.13 + layer * 0.5;
      attr.array[q + 2] = charge;
      attr.array[q + 3] = layer;
    }
  }
  return k;
}

/**
 * BLOOM CROWN — Nature, zone cast.
 *
 * A **circlet of closed buds**, strung on a glowing vine, leaves the caster
 * and flies to the circle turning like a thrown wreath. There it **rises and
 * widens** into a crown over the circle and every bud **blooms** — the outer
 * whorl curling open, then the inner — while the whole ring **orbits**,
 * tilting as it turns, faster and faster, flinging petals and pollen, a
 * mandala lighting on the floor beneath it. Then it **gathers**: the blossoms
 * snap shut, white-hot from the heart out, and draw in to the centre where
 * they fuse into one bright **seed**, which **slams** straight down into the
 * floor. The earth jumps; a shockwave and a ring of green run out across the
 * floor, petals burst in every direction and whatever stood under the crown
 * is thrown clear. **Where the green ring passes, the crown grows back out of
 * the ground**: a ring of big blossoms (and one at the heart of the crater)
 * heaves up out of the moss, opens and slowly turns and breathes for the
 * linger, until they shut, wilt and sink as the moss burns away.
 *
 * The beats, at the default settings and the capture distance (13 m):
 * travel 0.6 s → crown widens and descends 0.35 s → blossoms open, crown
 * spins up and sinks onto the circle 0.5 s → gathers 0.38 s → slam at ≈ 1.95 s
 * → garden sprouts behind the wave (≈ 0.25 s to the rim) and lingers 1.3 s →
 * wilts and sinks 0.9 s. About 4.1 s on screen.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the petals** (`createBloomPetalMaterial`) — one InstancedMesh of
 *      parameter-space strips, curled open in the vertex stage, seated on
 *      their blossom by the instance matrix; two whorls per blossom. Opaque
 *      on `LAYER.SHAPED` with a matching depth material — the crown throws a
 *      turning shadow on the floor.
 *   2. **the hearts** and **the seed** (`createBloomCoreMaterial`) — glowing
 *      orbs at the blossoms' hearts; one more, almond-shaped, for the seed.
 *   3. **the garland** (`createBloomGarlandMaterial`) — the vine circlet that
 *      makes the blossoms one crown, sagging between them.
 *   4. **the sigil** (`createBloomSigilMaterial`) — the mandala under the
 *      crown, the slam's flare and the ring of green.
 *   5. **the lens ring** (`createBloomWarpMaterial`) on `LAYER.DISTORTION`.
 *   6. **particles** — petals (LEAF) flung off the turning crown and burst at
 *      the slam; pollen (SOFT, additive) trailing every blossom; soil (CHIP)
 *      and grass (LEAF) thrown up by the slam.
 *   7. **the slam** — an EARTH burst, a SHOCKWAVE, a DUSTRING and a CRACK,
 *      flash, shake and a light punch.
 *
 *   8. **the ground** (`createBloomGroundMaterial`, normal-blended) — the
 *      deep stop of the ramp: a wine-dark pool under the descending crown,
 *      then a furrowed soil crater, moss crawling out behind the wave with lit
 *      veins breathing in it, petal stains; it burns away on noise.
 *   9. **the garden** — a second InstancedMesh of the same petals (same
 *      material, same shadow), blossoms seated on the floor at
 *      `gardenRadius × zoneRadius`; each sprouts the instant the green ring
 *      reaches its radius (`r / waveSpeed`), so the timing is derived.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. The crown hurts nothing while it turns; the seed is the
 * blow. On the slam every body inside `hitReach` of the crown's circle is
 * thrown outward from where the seed went in, harder the nearer it stood.
 *
 * ## The editor rule
 *
 * A blossom record holds dice only (a seed, a bloom-timing roll, a size roll).
 * The crown's radius, height, spin, tilt, every petal's shape and every beat's
 * timing are resolved from `settings.bloomcrown` each frame; the spin and the
 * tilt are integrated phases so their rates are live without the crown ever
 * jumping. Dragging `blossoms` re-strings a crown already in the air.
 */
export class BloomCrownAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Petals drawn. HUD readout only. */
  get instanceCount() {
    return this.petals.count;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- 1 · the petals ---- */
    this.petalGeometry = createBloomPetalGeometry(MAX_PETAL_INSTANCES);
    this.petalMaterial = createBloomPetalMaterial();
    this.petals = new InstancedMesh(this.petalGeometry, this.petalMaterial, MAX_PETAL_INSTANCES);
    this.petals.name = 'BloomPetals';
    this.petals.instanceMatrix.setUsage(DynamicDrawUsage);
    this.petals.customDepthMaterial = this.petalMaterial.userData.depth;
    this.petals.castShadow = true;
    this.petals.count = 0;
    this._setup(this.petals, LAYER.SHAPED, 6);

    /* ---- 2 · the hearts and the seed ---- */
    this.coreGeometry = new IcosahedronGeometry(1, 2);
    this.coreMaterial = createBloomCoreMaterial('heart');
    this.hearts = new InstancedMesh(this.coreGeometry, this.coreMaterial, MAX_BLOSSOMS);
    this.hearts.instanceMatrix.setUsage(DynamicDrawUsage);
    this.hearts.count = 0;
    this._setup(this.hearts, LAYER.VFX, 9);
    this.seedMaterial = createBloomCoreMaterial('seed');
    this.seed = new Mesh(this.coreGeometry, this.seedMaterial);
    this.seed.matrixAutoUpdate = true;
    this._setup(this.seed, LAYER.VFX, 10);

    /* ---- 3 · the garland ---- */
    this.garlandGeometry = createBloomGarlandGeometry();
    this.garlandMaterial = createBloomGarlandMaterial();
    this.garland = new Mesh(this.garlandGeometry, this.garlandMaterial);
    this._setup(this.garland, LAYER.VFX, 8);

    /* ---- 4 · the sigil ---- */
    this.sigilGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.sigilMaterial = createBloomSigilMaterial();
    this.sigil = new Mesh(this.sigilGeometry, this.sigilMaterial);
    this._setup(this.sigil, LAYER.VFX, 2);

    /* ---- 4b · the ground field ---- */
    this.groundGeometry = createBloomQuadGeometry();
    this.groundMaterial = createBloomGroundMaterial();
    this.ground = new Mesh(this.groundGeometry, this.groundMaterial);
    this._setup(this.ground, LAYER.VFX, 1);

    /* ---- 4c · the garden ---- */
    this.gardenGeometry = createBloomPetalGeometry(MAX_GARDEN_INSTANCES);
    this.garden = new InstancedMesh(this.gardenGeometry, this.petalMaterial, MAX_GARDEN_INSTANCES);
    this.garden.name = 'BloomGarden';
    this.garden.instanceMatrix.setUsage(DynamicDrawUsage);
    this.garden.customDepthMaterial = this.petalMaterial.userData.depth;
    this.garden.castShadow = true;
    this.garden.count = 0;
    this._setup(this.garden, LAYER.SHAPED, 6);
    this.gardenHeartMaterial = createBloomCoreMaterial('heart');
    this.gardenHearts = new InstancedMesh(this.coreGeometry, this.gardenHeartMaterial, MAX_GARDEN);
    this.gardenHearts.instanceMatrix.setUsage(DynamicDrawUsage);
    this.gardenHearts.count = 0;
    this._setup(this.gardenHearts, LAYER.VFX, 9);
    /** Dice only: angle jitter, radius jitter, size, seed, sprout lag. */
    this.plots = [];
    for (let i = 0; i < MAX_GARDEN; i++) this.plots.push({ aDice: 0, rDice: 0, sDice: 0, seed: 0, lag: 0 });
    this._gardenRot = 0;

    /* ---- 5 · the lens ring ---- */
    this.quadGeometry = createBloomQuadGeometry();
    this.warpMaterial = createBloomWarpMaterial();
    this.warp = new Mesh(this.quadGeometry, this.warpMaterial);
    this._setup(this.warp, LAYER.DISTORTION, 0);

    /** Dice only — see the class comment. */
    this.blooms = [];
    for (let i = 0; i < MAX_BLOSSOMS; i++) {
      this.blooms.push({ seed: 0, tDice: 0, sDice: 0, open: 0, scale: 0, x: 0, y: 0, z: 0, ax: 0, ay: 1, az: 0 });
    }
    this._n = 0;
    this._seed = 0;
    this._clock = -1;
    this._spin = 0;
    this._tilt = 0;
    this._ringR = 0;
    this._ringY = 0;
    this._gather = 0;
    this._slammed = false;
    this._seedY = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  _setup(mesh, layer, order) {
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.shed = particles.get('bloomcrown.petal', { capacity: 1600, shape: ParticleShape.LEAF, additive: false, lit: true, curl: true, softFade: 0.3 });
    this.shed.uniforms.uDrag.value = 1.6;
    this.shed.uniforms.uEndSize.value = 0.9;
    this.shed.uniforms.uSizeIn.value = 0.05;
    this.shed.uniforms.uFadeIn.value = 0.04;
    this.shed.uniforms.uFadeOut.value = 0.35;

    this.pollen = particles.get('bloomcrown.pollen', { capacity: 2400, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.3 });
    this.pollen.uniforms.uDrag.value = 1.4;
    this.pollen.uniforms.uEndSize.value = 0.4;
    this.pollen.uniforms.uSizeIn.value = 0.1;
    this.pollen.uniforms.uFadeIn.value = 0.08;
    this.pollen.uniforms.uFadeOut.value = 0.5;

    this.soil = particles.get('bloomcrown.soil', { capacity: 900, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.1 });
    this.soil.uniforms.uDrag.value = 0.4;
    this.soil.uniforms.uEndSize.value = 0.8;
    this.soil.uniforms.uSizeIn.value = 0.02;
    this.soil.uniforms.uFadeIn.value = 0.01;
    this.soil.uniforms.uFadeOut.value = 0.3;

    this.grass = particles.get('bloomcrown.grass', { capacity: 1200, shape: ParticleShape.LEAF, additive: false, lit: true, softFade: 0.2 });
    this.grass.uniforms.uDrag.value = 1.2;
    this.grass.uniforms.uEndSize.value = 0.7;
    this.grass.uniforms.uSizeIn.value = 0.04;
    this.grass.uniforms.uFadeIn.value = 0.03;
    this.grass.uniforms.uFadeOut.value = 0.4;

    this.shedEmitter = new RateEmitter();
    this.pollenEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  _beats() {
    const c = settings[ID];
    const g = settings.global;
    const expand = Math.max(0.05, c.expandTime);
    const gatherAt = expand + Math.max(0.05, c.lifetime * g.lifetime);
    const slamAt = gatherAt + Math.max(0.05, c.gatherTime);
    const slamEnd = slamAt + Math.max(0.03, c.slamTime);
    return { expand, gatherAt, slamAt, slamEnd };
  }

  get impactDuration() {
    return this._beats().slamEnd + Math.max(0.05, settings[ID].slamLinger);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].fadeTime * settings.global.lifetime);
  }

  /** Light off turning petals: it swings as the crown turns. */
  lightShimmer() {
    return 0.85 + 0.15 * Math.sin(this._spin * 3.0);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._clock = -1;
    this._spin = Math.random() * TAU;
    this._tilt = Math.random() * TAU;
    this._gather = 0;
    this._slammed = false;
    this._seedY = 0;
    this.shedEmitter.reset();
    this.pollenEmitter.reset();
    for (let i = 0; i < MAX_BLOSSOMS; i++) {
      const b = this.blooms[i];
      b.seed = Math.random();
      b.tDice = Math.random();
      b.sDice = Math.random();
      b.open = 0;
      b.scale = 0;
    }
    for (let i = 0; i < MAX_PETAL_INSTANCES; i++) this.petals.setMatrixAt(i, _zero);
    this.petals.instanceMatrix.needsUpdate = true;
    this.petals.count = 0;
    for (let i = 0; i < MAX_GARDEN; i++) {
      const p = this.plots[i];
      p.aDice = Math.random() - 0.5;
      p.rDice = Math.random() - 0.5;
      p.sDice = Math.random();
      p.seed = Math.random();
      p.lag = Math.random();
    }
    for (let i = 0; i < MAX_GARDEN_INSTANCES; i++) this.garden.setMatrixAt(i, _zero);
    this.garden.instanceMatrix.needsUpdate = true;
    this.garden.count = 0;
    this.gardenHearts.count = 0;
    this.garden.visible = false;
    this.gardenHearts.visible = false;
    this.ground.visible = false;
    this._gardenRot = Math.random() * TAU;
    this.hearts.count = 0;
    this.petals.visible = true;
    this.hearts.visible = true;
    this.garland.visible = true;
    this.seed.visible = false;
    this.sigil.visible = false;
    this.warp.visible = false;
  }

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    this.petalMaterial.userData.sync();
    syncSystem(this.shed, c.colorShedA, c.colorShedB, c.colorShedC, c.colorShedD, c.shedGlow * g.glow, 0.9);
    this.shed.uniforms.uGravity.value.set(0, -c.shedFall, 0);
    syncSystem(this.pollen, c.colorPollenA, c.colorPollenB, c.colorPollenC, c.colorPollenD, c.pollenGlow * g.glow, 0.8);
    this.pollen.uniforms.uGravity.value.set(0, -c.pollenFall, 0);
    syncSystem(this.soil, c.colorSoilA, c.colorSoilB, c.colorSoilC, c.colorSoilD, 1, 0.05);
    this.soil.uniforms.uGravity.value.set(0, -9.5, 0);
    syncSystem(this.grass, c.colorGrassA, c.colorGrassB, c.colorGrassC, c.colorGrassD, 1, 0.3);
    this.grass.uniforms.uGravity.value.set(0, -6, 0);
  }

  /* ------------------------------------------------------------------ */
  /* The crown                                                           */
  /* ------------------------------------------------------------------ */

  /** Resolve the crown for this frame: the ring, every blossom, the seed. */
  _updateCrown(dt) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.max(3, Math.min(MAX_BLOSSOMS, Math.round(c.blossoms)));
    this._n = n;
    const clock = this._clock;
    const b = this._beats();
    const Rc = Math.max(0.3, c.zoneRadius * c.crownRadius);

    const e = clock < 0 ? 0 : Easing.outCubic(saturate(clock / b.expand));
    const hold = clock < 0 ? 0 : saturate((clock - b.expand) / Math.max(0.05, b.gatherAt - b.expand));
    const gk = clock < 0 ? 0 : saturate((clock - b.gatherAt) / Math.max(0.05, b.slamAt - b.gatherAt));
    const sk = clock < 0 ? 0 : saturate((clock - b.slamAt) / Math.max(0.03, b.slamEnd - b.slamAt));
    this._gather = gk;

    /* the ring: widening, rising, then drawing in */
    this._ringR = lerp(c.travelRadius, Rc, e) * (1 - Easing.inCubic(gk));
    // It settles down onto the circle while it turns, then lifts a touch to strike.
    const settle = c.crownDescend * Easing.inOutCubic(hold) * (1 - gk * 0.5);
    this._ringY = lerp(c.travelHeight, c.crownHeight, e) - settle + c.gatherLift * Math.sin(Math.PI * gk);
    const rate = clock < 0 ? c.spinTravel : lerp(lerp(c.spinTravel, c.spinCrown, e), c.spinPeak, hold) + c.spinGather * gk;
    this._spin += rate * dt * g.animationSpeed;
    this._tilt += c.tiltSpeed * dt * g.animationSpeed;
    const tiltAmp = c.tilt * e * (1 - gk);

    /* the blossoms */
    const charge = Math.max(gk, smoothstep(0.75, 1, hold) * 0.35);
    const shut = 1 - smoothstep(0, Math.max(0.05, c.shutAt), gk);
    const merge = 1 - smoothstep(0.7, 1, gk);
    const np = Math.max(3, Math.min(MAX_PETALS, Math.round(c.petalsPerWhorl)));
    const attr = this.petalGeometry.attributes.aPetal;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const bl = this.blooms[i];
      const ang = this._spin + (i / n) * TAU;
      _radial.set(Math.cos(ang), 0, Math.sin(ang));
      _pos.copy(_centre).addScaledVector(_radial, this._ringR);
      _pos.y = this._ringY + tiltAmp * Math.sin(ang - this._tilt);
      // Facing up and out from the crown; turned in and down as it gathers.
      _axis.copy(_up).addScaledVector(_radial, c.faceOut * (1 - 2 * gk)).normalize();

      const delay = c.bloomDelay + bl.tDice * c.bloomStagger * g.randomness + (i / n) * c.bloomStagger * (1 - g.randomness);
      const opening = clock < 0 ? 0 : saturate((clock - delay) / Math.max(0.05, c.bloomTime));
      bl.open = Easing.outBack(opening) * shut;
      bl.scale = lerp(c.budScale, 1, e) * lerp(1 - c.sizeJitter, 1 + c.sizeJitter, bl.sDice) * merge;
      bl.x = _pos.x;
      bl.y = _pos.y;
      bl.z = _pos.z;
      bl.ax = _axis.x;
      bl.ay = _axis.y;
      bl.az = _axis.z;

      const s = bl.scale;
      k = seatBlossom(this.petals, attr, k, np, _pos, _axis, s, bl.open, bl.seed, charge, this._spin * c.blossomRoll + bl.seed * TAU);

      /* its heart */
      const hs = c.heartSize * s * (0.6 + 0.4 * bl.open + charge * 0.6);
      if (hs <= 0.002) {
        this.hearts.setMatrixAt(i, _zero);
      } else {
        _m.makeScale(hs, hs, hs);
        _m.setPosition(_pos.x + _axis.x * c.heartLift * s, _pos.y + _axis.y * c.heartLift * s, _pos.z + _axis.z * c.heartLift * s);
        this.hearts.setMatrixAt(i, _m);
      }
    }
    for (let q = k; q < this.petals.count; q++) this.petals.setMatrixAt(q, _zero);
    this.petals.count = k;
    this.petals.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
    this.hearts.count = n;
    this.hearts.instanceMatrix.needsUpdate = true;
    this.petals.visible = merge > 0.001;
    this.hearts.visible = merge > 0.001;
    _coreState.glow = 1 + charge * 2;
    _coreState.seed = this._seed;
    this.coreMaterial.userData.sync(_coreState);

    /* the garland */
    _garlandState.centre.copy(_centre);
    _garlandState.ringR = this._ringR;
    _garlandState.ringY = this._ringY;
    _garlandState.spin = this._spin;
    _garlandState.count = n;
    _garlandState.tiltAmp = tiltAmp;
    _garlandState.tiltPhase = this._tilt;
    _garlandState.fade = lerp(c.garlandTravel, 1, e) * (1 - smoothstep(0.2, 0.75, gk));
    this.garlandMaterial.userData.sync(_garlandState);
    this.garland.visible = _garlandState.fade > 0.003;

    /* the seed: fused, then driven into the floor */
    const seedSize = c.seedSize * smoothstep(0.45, 1, gk);
    const after = clock - b.slamEnd;
    let sink = 0;
    if (this._slammed) sink = saturate(after / Math.max(0.05, c.seedSink));
    this._seedY = sk > 0 ? lerp(this._ringY, seedSize * 0.6, Easing.inQuad(sk)) : this._ringY;
    if (this._slammed) this._seedY = seedSize * 0.6 - sink * seedSize * 1.4;
    const stretch = 1 + sk * (1 - sk) * 4 * c.seedStretch;
    this.seed.position.set(_centre.x, this._seedY, _centre.z);
    this.seed.scale.set(seedSize / stretch, seedSize * c.seedElongation * stretch, seedSize / stretch);
    this.seed.visible = seedSize > 0.003 && sink < 1;
    _seedState.glow = 1 + gk + (this._slammed ? 2 * (1 - sink) : 0);
    _seedState.seed = this._seed;
    this.seedMaterial.userData.sync(_seedState);

    if (sk >= 1 && !this._slammed && clock >= 0) {
      this._slammed = true;
      this._slam();
    }

    this._crownFx(dt, e, gk, n);
  }

  /** The floor: the sigil under the crown, the slam's flare, the ring of green. */
  _updateFloor() {
    const c = settings[ID];
    const g = settings.global;
    const clock = this._clock;
    const b = this._beats();
    const Rc = Math.max(0.3, c.zoneRadius * c.crownRadius);
    const fading = this.phase === AbilityPhase.FADE;
    const fk = fading ? saturate(this.fadeTime / Math.max(0.05, this.fadeDuration)) : 0;
    const e = clock < 0 ? 0 : Easing.outCubic(saturate(clock / b.expand));
    const after = this._slammed ? clock - b.slamEnd : -1;

    _sigilState.centre.copy(_centre);
    _sigilState.radius = Rc;
    _sigilState.petals = this._n;
    _sigilState.spin = this._spin * c.sigilSpin;
    _sigilState.lit = c.sigilLit * e * (1 - fk) * (this._slammed ? Math.exp(-after * 0.8) : 1);
    _sigilState.flare = after >= 0 ? Math.exp(-after * c.flareDecay) * (1 - fk) : 0;
    _sigilState.wave = after >= 0 ? Math.min(c.waveReach * c.zoneRadius, after * c.waveSpeed) : 0;
    // The ring runs out and dies as it reaches its end — it never parks there.
    _sigilState.waveOn = 1 - smoothstep(0.55, 1, after * c.waveSpeed / Math.max(0.1, c.waveReach * c.zoneRadius));
    _sigilState.green = after >= 0 ? c.greenStrength * (1 - fk) * smoothstep(0, 0.2, after) : 0;
    _sigilState.seed = this._seed;
    this.sigilMaterial.userData.sync(_sigilState);
    this.sigil.visible = clock >= 0;

    const ringR = after >= 0 ? after * c.warpSpeed : 0;
    _warpState.centre.copy(_centre);
    _warpState.ringR = ringR;
    _warpState.strength = after >= 0 ? 1 - saturate(ringR / Math.max(0.5, c.zoneRadius * 1.8)) : 0;
    this.warpMaterial.userData.sync(_warpState);
    this.warp.visible = _warpState.strength > 0.01;

    /* the ground field: pool under the crown → crater, moss, stains */
    const hold = clock < 0 ? 0 : saturate((clock - b.expand) / Math.max(0.05, b.gatherAt - b.expand));
    _groundState.centre.copy(_centre);
    _groundState.radius = c.zoneRadius;
    _groundState.pool = c.poolDepth * Math.max(e * 0.6, smoothstep(0, 0.6, hold));
    _groundState.crater = after >= 0 ? c.craterRadius * Easing.outCubic(saturate(after / 0.12)) : 0;
    const waveR = after >= 0 ? Math.min(c.waveReach * c.zoneRadius, after * c.waveSpeed) : 0;
    _groundState.moss = after >= 0 ? Math.min(c.mossReach * c.zoneRadius, waveR * 0.92 + Math.max(0, after - 0.3) * c.mossCreep) : 0;
    _groundState.mossOn = after >= 0 ? c.mossStrength : 0;
    _groundState.stains = after >= 0 ? c.stainStrength * smoothstep(0.1, 0.6, after) : 0;
    _groundState.fade = fk;
    _groundState.seed = this._seed;
    this.groundMaterial.userData.sync(_groundState);
    this.ground.visible = clock >= 0;

    this._updateGarden(after, fk);
  }

  /**
   * The garden: the crown grows back out of the floor where the green ring
   * passes. A plot holds dice; its radius, size and every beat are resolved
   * here, and each sprouts at `radius / waveSpeed` after the slam.
   */
  _updateGarden(after, fk) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.max(0, Math.min(MAX_GARDEN, Math.round(c.gardenCount)));
    if (after < 0 || n === 0) {
      this.garden.visible = false;
      this.gardenHearts.visible = false;
      return;
    }
    const np = Math.max(3, Math.min(MAX_PETALS, Math.round(c.petalsPerWhorl)));
    const attr = this.gardenGeometry.attributes.aPetal;
    const R = c.zoneRadius * c.gardenRadius;
    const wilt = smoothstep(0, 0.7, fk);
    const sinkK = smoothstep(0.35, 1, fk);
    const time = frame.uTime.value * g.animationSpeed;
    let k = 0;
    let live = 0;
    for (let i = 0; i < n; i++) {
      const p = this.plots[i];
      const heart = i === 0 && c.gardenHeart > 0;
      const ring = heart ? 0 : i - (c.gardenHeart > 0 ? 1 : 0);
      const ringN = Math.max(1, n - (c.gardenHeart > 0 ? 1 : 0));
      const ang = this._gardenRot + ((ring + 0.5 + p.aDice * c.gardenJitter) / ringN) * TAU;
      const r = heart ? 0 : Math.max(0.2, R * (1 + p.rDice * 2 * c.gardenJitter));
      const sproutAt = r / Math.max(0.5, c.waveSpeed) + p.lag * c.gardenLag;
      const k0 = saturate((after - sproutAt) / Math.max(0.05, c.gardenGrow));
      const grow = k0 <= 0 ? 0 : Easing.outBack(k0);
      const opening = saturate((after - sproutAt - c.gardenGrow * 0.35) / Math.max(0.05, c.gardenOpen));
      const breathe = 1 + c.gardenBreathe * Math.sin(time * c.gardenBreatheRate + p.seed * TAU) * opening;
      const open = Easing.outBack(opening) * breathe * (1 - wilt);
      const size = c.gardenScale * (heart ? c.gardenHeartScale : lerp(1 - c.sizeJitter, 1 + c.sizeJitter, p.sDice));
      const s = size * grow * (1 - smoothstep(0.6, 1, fk));
      _radial.set(Math.cos(ang), 0, Math.sin(ang));
      _pos.copy(_centre).addScaledVector(_radial, r);
      _pos.y = lerp(-c.gardenRise, c.gardenHeight, Math.min(1, grow)) - sinkK * c.gardenRise;
      _axis.copy(_up).addScaledVector(_radial, heart ? 0 : c.gardenLean * (1 - 0.5 * wilt)).normalize();
      // A sprouting flash, white-hot from the heart, as it breaks the soil.
      const charge = Math.exp(-Math.max(0, after - sproutAt) * c.gardenFlashDecay) * c.gardenFlash * (k0 > 0 ? 1 : 0);
      const roll = this._gardenRot * 0.5 + p.seed * TAU + (after - sproutAt) * c.gardenSpin * (heart ? -1 : 1);
      k = seatBlossom(this.garden, attr, k, np, _pos, _axis, s, open, p.seed, charge, roll);
      const hs = c.heartSize * s * (0.7 + 0.5 * open);
      if (hs <= 0.002) {
        this.gardenHearts.setMatrixAt(i, _zero);
      } else {
        live++;
        _m.makeScale(hs, hs, hs);
        _m.setPosition(_pos.x + _axis.x * c.heartLift * s, _pos.y + _axis.y * (c.heartLift + 0.05) * s, _pos.z + _axis.z * c.heartLift * s);
        this.gardenHearts.setMatrixAt(i, _m);
      }
    }
    this.garden.count = k;
    this.garden.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
    this.gardenHearts.count = n;
    this.gardenHearts.instanceMatrix.needsUpdate = true;
    this.garden.visible = live > 0;
    this.gardenHearts.visible = live > 0;
    _gardenHeartState.glow = 1 - wilt * 0.8;
    _gardenHeartState.seed = this._seed;
    this.gardenHeartMaterial.userData.sync(_gardenHeartState);
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /** Pollen trailing every blossom; petals flung off the turning crown. */
  _crownFx(dt, e, gk, n) {
    const c = settings[ID];
    const g = settings.global;
    if (dt <= 0) return;
    const time = frame.uTime.value;
    const pollen = Math.round(this.pollenEmitter.tick(dt, c.pollenRate * (0.4 + 0.6 * e) * (1 - gk * 0.5)) * g.particleCount);
    if (pollen > 0) {
      resetEmit(time);
      _emit.radius = 0.12;
      _emit.direction = _up;
      _emit.speed = c.pollenSpeed;
      _emit.spread = 1;
      _emit.size = c.pollenSize;
      _emit.life = c.pollenLife;
      _emit.lifeVariance = 0.5;
      for (let q = 0; q < pollen; q++) {
        const bl = this.blooms[(Math.random() * n) | 0];
        if (bl.scale <= 0.01) continue;
        _pos.set(bl.x, bl.y, bl.z);
        _emit.position = _pos;
        this.pollen.emit(1, _emit);
      }
    }
    const shed = Math.round(this.shedEmitter.tick(dt, c.shedRate * e * (1 - gk)) * g.particleCount);
    if (shed > 0) {
      resetEmit(time);
      _emit.radius = 0.15;
      _emit.speed = c.shedSpeed;
      _emit.spread = 0.4;
      _emit.size = c.shedSize;
      _emit.life = c.shedLife;
      _emit.spin = 4;
      for (let q = 0; q < shed; q++) {
        const i = (Math.random() * n) | 0;
        const bl = this.blooms[i];
        if (bl.open < 0.3) continue;
        // Flung tangentially, the way the crown turns, and a little out.
        const ang = this._spin + (i / n) * TAU;
        _dir.set(-Math.sin(ang), 0.15, Math.cos(ang)).addScaledVector(_radial.set(Math.cos(ang), 0, Math.sin(ang)), 0.5).normalize();
        _pos.set(bl.x, bl.y, bl.z);
        _emit.position = _pos;
        _emit.direction = _dir;
        this.shed.emit(1, _emit);
      }
    }
  }

  /** The seed strikes: the beat, the burst of petals, the throw. */
  _slam() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    _pos.copy(_centre).setY(0.05);

    this.ctx.shake.add(c.slamShake * power, 1 / Math.max(0.05, c.slamShakeTime), 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.slamFlash * power);
    this.lightBoost = c.lightIntensity * c.slamLight * power;
    this.ctx.bursts.spawn(BurstMode.EARTH, _pos, {
      radius: 0.2,
      endRadius: c.burstRadius * power,
      life: 0.55,
      intensity: 1.5,
      opacity: 0.8 * g.opacity,
      squash: 0.5,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.zoneRadius * c.shockScale * power,
      life: 0.6,
      width: 0.07,
      intensity: 1.1,
      colorA: getColor(c.colorWave),
      colorB: getColor(c.colorSigilHot),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: c.zoneRadius * 0.9,
      life: 1.4,
      intensity: 0.8,
      colorA: getColor(c.colorSoilA),
      colorB: getColor(c.colorSoilC),
      growth: 0.35,
      height: 0.025
    });
    this.ctx.decals.spawn(DecalType.CRACK, _pos, {
      radius: c.craterRadius,
      life: this.fadeDuration + c.slamLinger + 0.5,
      intensity: 1,
      colorA: getColor(c.colorSigil),
      colorB: getColor(c.colorSigilHot),
      width: 0.1,
      height: 0.02
    });

    resetEmit(time);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = c.burstPetalSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 1.4;
    _emit.size = c.shedSize * 1.3;
    _emit.life = c.shedLife;
    _emit.spin = 6;
    this.shed.emit(Math.round(c.burstPetals * g.particleCount), _emit);
    _emit.speed = c.soilSpeed;
    _emit.spread = 0.8;
    _emit.size = c.soilSize;
    _emit.life = c.soilLife;
    _emit.spin = 9;
    this.soil.emit(Math.round(c.soilCount * g.particleCount), _emit);
    _emit.speed = c.pollenSpeed * 6;
    _emit.spread = 1.2;
    _emit.size = c.pollenSize * 1.5;
    _emit.life = c.pollenLife;
    _emit.spin = 0;
    this.pollen.emit(Math.round(c.burstPollen * g.particleCount), _emit);

    // A ring of grass thrown up just behind the green wave's start.
    _emit.speed = c.grassSpeed;
    _emit.spread = 0.35;
    _emit.size = c.grassSize;
    _emit.life = c.grassLife;
    _emit.spin = 3;
    const blades = Math.round(c.grassCount * g.particleCount);
    for (let q = 0; q < blades; q++) {
      const a = Math.random() * TAU;
      const rr = c.zoneRadius * (0.25 + 0.75 * Math.sqrt(Math.random()));
      _vel.set(_centre.x + Math.cos(a) * rr, 0.05, _centre.z + Math.sin(a) * rr);
      _dir.set(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5);
      _emit.position = _vel;
      _emit.direction = _dir;
      this.grass.emit(1, _emit);
    }

    this._throw(power);
  }

  _throw(power) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const reach = Math.max(0.3, c.zoneRadius * c.hitReach);
    const found = field.findTargets(_centre.x, _centre.z, reach, this._found);
    for (let f = 0; f < found.length; f++) {
      const d = found[f];
      _dir.set(d.position.x - _centre.x, 0, d.position.z - _centre.z);
      const dist = _dir.length();
      if (dist < 1e-3) _dir.set(this.direction.x, 0, this.direction.z);
      _dir.normalize();
      const near = 1 - saturate(dist / reach);
      this._force.impulse = lerp(c.hitImpulse * 0.5, c.hitImpulse, near) * power;
      this._force.lift = lerp(c.hitLift * 0.5, c.hitLift, near) * power;
      this._force.spin = c.hitSpin;
      d.kill(_dir.x, _dir.z, this._force);
    }
    this._found.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._clock = -1;
    _centre.copy(this.position).setY(0);
    this._sync();
    this._updateCrown(dt);
    this.position.y = this._ringY;
  }

  onImpact() {
    this._clock = 0;
    this.pointAt(1, _centre);
    this._sync();
    this._updateCrown(0);
    this._updateFloor();
  }

  onFade(dt) {
    const c = settings[ID];
    if (this._slammed) this._gardenRot += c.gardenTurn * dt * settings.global.animationSpeed;
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this.pointAt(1, _centre);
    this._sync();
    this._updateCrown(dt);
    this._updateFloor();
    this.position.set(_centre.x, this._slammed ? c.lightLow : this._ringY, _centre.z);
  }

  onDestroy() {
    this._clock = -1;
    this.petals.count = 0;
    this.hearts.count = 0;
    this.petals.visible = false;
    this.hearts.visible = false;
    this.seed.visible = false;
    this.garland.visible = false;
    this.sigil.visible = false;
    this.warp.visible = false;
    this.ground.visible = false;
    this.garden.count = 0;
    this.gardenHearts.count = 0;
    this.garden.visible = false;
    this.gardenHearts.visible = false;
  }

  dispose() {
    this.petalGeometry.dispose();
    this.coreGeometry.dispose();
    this.garlandGeometry.dispose();
    this.sigilGeometry.dispose();
    this.quadGeometry.dispose();
    this.groundGeometry.dispose();
    this.gardenGeometry.dispose();
    this.groundMaterial.dispose();
    this.gardenHeartMaterial.dispose();
    this.garden.dispose();
    this.gardenHearts.dispose();
    this.petalMaterial.userData.depth.dispose();
    this.petalMaterial.dispose();
    this.coreMaterial.dispose();
    this.seedMaterial.dispose();
    this.garlandMaterial.dispose();
    this.sigilMaterial.dispose();
    this.warpMaterial.dispose();
    this.petals.dispose();
    this.hearts.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('✿  Bloom Crown');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'crown flies (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'expandTime', 0.05, 2, 0.01, 'crown widens over (s)');
  R(time, c, 'bloomDelay', 0, 1.5, 0.01, 'first bloom after (s)');
  R(time, c, 'bloomStagger', 0, 1.5, 0.01, 'blooms spread over (s)');
  R(time, c, 'bloomTime', 0.05, 2, 0.01, 'one bloom opens over (s)');
  R(time, c, 'lifetime', 0.05, 8, 0.05, 'crown turns for (s)');
  R(time, c, 'gatherTime', 0.05, 2, 0.01, 'gathers over (s)');
  R(time, c, 'shutAt', 0.05, 1, 0.01, 'blossoms shut by (× gather)');
  R(time, c, 'slamTime', 0.03, 1, 0.01, 'seed falls over (s)');
  R(time, c, 'slamLinger', 0.05, 3, 0.05, 'after the slam (s)');
  R(time, c, 'fadeTime', 0.1, 5, 0.05, 'sigil burns down over (s)');

  const crown = folder.addFolder('1 · Crown');
  R(crown, c, 'blossoms', 3, MAX_BLOSSOMS, 1, 'blossoms');
  R(crown, c, 'crownRadius', 0.1, 1.5, 0.01, 'radius (× circle)');
  R(crown, c, 'crownHeight', 0.5, 8, 0.05, 'height (m)');
  R(crown, c, 'travelRadius', 0.1, 3, 0.01, 'radius in flight (m)');
  R(crown, c, 'travelHeight', 0.3, 5, 0.05, 'height in flight (m)');
  R(crown, c, 'spinTravel', -10, 10, 0.05, 'spin in flight (rad/s)');
  R(crown, c, 'spinCrown', -10, 10, 0.05, 'spin as it opens (rad/s)');
  R(crown, c, 'spinPeak', -15, 15, 0.05, 'spin before it gathers (rad/s)');
  R(crown, c, 'spinGather', -20, 20, 0.05, 'extra spin gathering (rad/s)');
  R(crown, c, 'tilt', 0, 1.5, 0.01, 'tilt wobble (m)');
  R(crown, c, 'tiltSpeed', -6, 6, 0.05, 'tilt precession (rad/s)');
  R(crown, c, 'crownDescend', -1, 3, 0.01, 'sinks onto the circle (m)');
  R(crown, c, 'gatherLift', -2, 3, 0.01, 'rises as it gathers (m)');
  R(crown, c, 'faceOut', -1, 2, 0.01, 'blossoms face outward');
  R(crown, c, 'blossomRoll', -2, 2, 0.01, 'blossoms roll');
  R(crown, c, 'budScale', 0, 1, 0.01, 'bud size in flight');
  R(crown, c, 'sizeJitter', 0, 0.6, 0.01, 'size jitter');

  const petal = folder.addFolder('2 · Petals');
  R(petal, c, 'petalsPerWhorl', 3, MAX_PETALS, 1, 'petals per whorl');
  R(petal, c, 'petalLength', 0.05, 2, 0.01, 'length (m)');
  R(petal, c, 'petalWidth', 0.02, 1, 0.005, 'half-width (m)');
  R(petal, c, 'innerScale', 0.2, 1.2, 0.01, 'inner whorl (×)');
  R(petal, c, 'budPitch', -0.5, 1.5, 0.01, 'bud pitch (rad)');
  R(petal, c, 'openPitch', 0, 2.5, 0.01, 'open pitch (rad)');
  R(petal, c, 'budCurl', -3, 3, 0.01, 'bud curl (rad)');
  R(petal, c, 'openCurl', -3, 3, 0.01, 'open curl (rad)');
  R(petal, c, 'petalCup', 0, 1.5, 0.01, 'cup');
  R(petal, c, 'petalFlutter', 0, 0.6, 0.005, 'flutter');
  R(petal, c, 'petalVeins', 0, 20, 0.5, 'veins');
  R(petal, c, 'veinStrength', 0, 1, 0.01, 'vein strength');
  R(petal, c, 'petalSSS', 0, 3, 0.01, 'light through');
  R(petal, c, 'petalRimGlow', 0, 4, 0.01, 'rim glow');
  R(petal, c, 'heartGlow', 0, 8, 0.05, 'heart glow');
  R(petal, c, 'chargeGlow', 0, 15, 0.05, 'charge glow');
  R(petal, c, 'petalAmbient', 0, 1.5, 0.01, 'ambient');
  R(petal, c, 'petalDiffuse', 0, 2, 0.01, 'diffuse');
  R(petal, c, 'petalDeep', 0, 1, 0.01, 'shade falls to deep');
  petal.addColor(c, 'colorPetalDeep').name('deep');
  R(petal, c, 'petalEdgeStart', 0, 1, 0.01, 'pink margin from (across)');
  R(petal, c, 'petalTipStart', 0, 1, 0.01, 'pink tip from (along)');
  R(petal, c, 'petalEdgeTint', 0, 1, 0.01, 'pink margin/tip amount');
  petal.addColor(c, 'colorPetalHeart').name('heart glow');
  petal.addColor(c, 'colorPetalBase').name('base (wine)');
  petal.addColor(c, 'colorPetalMid').name('body');
  petal.addColor(c, 'colorPetalTip').name('tip / margin');
  petal.addColor(c, 'colorPetalVein').name('veins');
  petal.addColor(c, 'colorPetalRim').name('rim');
  petal.addColor(c, 'colorCharge').name('charge');

  const core = folder.addFolder('3 · Hearts & seed');
  R(core, c, 'heartSize', 0.01, 0.6, 0.005, 'heart radius (m)');
  R(core, c, 'heartLift', -0.5, 0.5, 0.005, 'heart lift (m)');
  R(core, c, 'heartCoreGlow', 0, 8, 0.05, 'heart glow');
  R(core, c, 'seedSize', 0.05, 1.5, 0.01, 'seed radius (m)');
  R(core, c, 'seedElongation', 0.5, 3, 0.01, 'seed length (×)');
  R(core, c, 'seedStretch', 0, 2, 0.01, 'stretch as it falls');
  R(core, c, 'seedSink', 0.05, 2, 0.01, 'sinks into the floor over (s)');
  R(core, c, 'seedGlow', 0, 10, 0.05, 'seed glow');
  R(core, c, 'seedRim', 0, 10, 0.05, 'seed rim');
  R(core, c, 'seedVeins', 0, 4, 0.01, 'seed veins');
  core.addColor(c, 'colorSeedCore').name('seed core');
  core.addColor(c, 'colorSeedShell').name('seed shell');
  core.addColor(c, 'colorSeedVein').name('seed veins');

  const garland = folder.addFolder('4 · Garland');
  R(garland, c, 'garlandThickness', 0.005, 0.3, 0.005, 'thickness (m)');
  R(garland, c, 'garlandSag', 0, 2, 0.01, 'sag between blossoms (m)');
  R(garland, c, 'garlandGlow', 0, 8, 0.05, 'glow');
  R(garland, c, 'garlandLeaves', 0, 120, 1, 'leaf glints');
  R(garland, c, 'garlandChase', -4, 4, 0.01, 'glints chase');
  R(garland, c, 'garlandTravel', 0, 1, 0.01, 'shown in flight');
  garland.addColor(c, 'colorGarland').name('vine');
  garland.addColor(c, 'colorGarlandLeaf').name('leaf glints');

  const floor = folder.addFolder('5 · Sigil & wave');
  R(floor, c, 'sigilLit', 0, 2, 0.01, 'lit under the crown');
  R(floor, c, 'sigilGlow', 0, 8, 0.05, 'glow');
  R(floor, c, 'sigilLine', 0.01, 0.3, 0.005, 'line width (m)');
  R(floor, c, 'sigilFill', 0, 1, 0.01, 'petal fill');
  R(floor, c, 'sigilSpin', -1, 1, 0.01, 'turns with the crown (×)');
  R(floor, c, 'flareDecay', 0.2, 10, 0.05, 'slam flare decay');
  R(floor, c, 'waveSpeed', 0.5, 30, 0.1, 'green ring speed (m/s)');
  R(floor, c, 'waveReach', 0.2, 4, 0.01, 'green ring reach (× circle)');
  R(floor, c, 'waveWidth', 0.05, 2, 0.01, 'green ring width (m)');
  R(floor, c, 'greenStrength', 0, 2, 0.01, 'floor greened');
  R(floor, c, 'slamWarp', 0, 3, 0.01, 'lens ring strength');
  R(floor, c, 'warpSpeed', 0.5, 30, 0.1, 'lens ring speed (m/s)');
  R(floor, c, 'warpWidth', 0.05, 2, 0.01, 'lens ring width (m)');
  floor.addColor(c, 'colorSigil').name('sigil');
  floor.addColor(c, 'colorSigilHot').name('sigil, slam');
  floor.addColor(c, 'colorWave').name('green ring');
  floor.addColor(c, 'colorGreen').name('greened floor');

  const ground = folder.addFolder('5b · Ground (pool, crater, moss)');
  R(ground, c, 'groundOpacity', 0, 1, 0.01, 'opacity');
  R(ground, c, 'poolDepth', 0, 1, 0.01, 'shade pool under the crown');
  R(ground, c, 'mossStrength', 0, 1, 0.01, 'moss');
  R(ground, c, 'mossReach', 0.2, 2, 0.01, 'moss reach (× circle)');
  R(ground, c, 'mossCreep', 0, 4, 0.01, 'moss creeps on (m/s)');
  R(ground, c, 'mossBreathe', 0, 3, 0.01, 'lit veins breathe');
  R(ground, c, 'stainStrength', 0, 1, 0.01, 'petal stains');
  ground.addColor(c, 'colorGroundDeep').name('deep');
  ground.addColor(c, 'colorGroundSoil').name('soil');
  ground.addColor(c, 'colorGroundMoss').name('moss');
  ground.addColor(c, 'colorGroundMossLit').name('moss veins');
  ground.addColor(c, 'colorGroundStain').name('petal stains');

  const garden = folder.addFolder('5c · Garden (the crown regrown)');
  R(garden, c, 'gardenCount', 0, MAX_GARDEN, 1, 'blossoms');
  R(garden, c, 'gardenHeart', 0, 1, 1, 'one in the crater (0/1)');
  R(garden, c, 'gardenRadius', 0.1, 1.5, 0.01, 'ring radius (× circle)');
  R(garden, c, 'gardenJitter', 0, 0.5, 0.01, 'placement jitter');
  R(garden, c, 'gardenScale', 0.2, 3, 0.01, 'size (× petals)');
  R(garden, c, 'gardenHeartScale', 0.2, 3, 0.01, 'crater blossom (×)');
  R(garden, c, 'gardenHeight', -0.3, 1, 0.01, 'seated at (m)');
  R(garden, c, 'gardenRise', 0, 2, 0.01, 'heaves up from (m below)');
  R(garden, c, 'gardenLean', -1, 1.5, 0.01, 'leans outward');
  R(garden, c, 'gardenGrow', 0.05, 1.5, 0.01, 'heaves up over (s)');
  R(garden, c, 'gardenOpen', 0.05, 1.5, 0.01, 'opens over (s)');
  R(garden, c, 'gardenLag', 0, 1, 0.01, 'sprout lag jitter (s)');
  R(garden, c, 'gardenSpin', -3, 3, 0.01, 'each turns (rad/s)');
  R(garden, c, 'gardenTurn', -2, 2, 0.01, 'ring turns (rad/s)');
  R(garden, c, 'gardenBreathe', 0, 0.6, 0.005, 'breathes (± open)');
  R(garden, c, 'gardenBreatheRate', 0, 12, 0.05, 'breath rate (rad/s)');
  R(garden, c, 'gardenFlash', 0, 3, 0.01, 'sprout flash');
  R(garden, c, 'gardenFlashDecay', 0.5, 20, 0.1, 'flash decay');

  const slam = folder.addFolder('6 · The slam');
  R(slam, c, 'slamShake', 0, 1.5, 0.01, 'jolt');
  R(slam, c, 'slamShakeTime', 0.05, 2, 0.01, 'jolt lasts (s)');
  R(slam, c, 'slamFlash', 0, 1, 0.01, 'flash');
  R(slam, c, 'slamLight', 0, 8, 0.05, 'light punch (× intensity)');
  R(slam, c, 'burstRadius', 0, 8, 0.05, 'earth burst (m)');
  R(slam, c, 'shockScale', 0, 4, 0.01, 'shockwave (× circle)');
  R(slam, c, 'craterRadius', 0, 4, 0.05, 'crater crack (m)');
  slam.addColor(c, 'colorFlash').name('flash');
  slam.addColor(c, 'colorBurstA').name('burst, hot');
  slam.addColor(c, 'colorBurstB').name('burst, body');
  slam.addColor(c, 'colorBurstC').name('burst, dark');

  const fx = folder.addFolder('7 · Petals, pollen, soil, grass');
  R(fx, c, 'shedRate', 0, 200, 1, 'petals flung / s');
  R(fx, c, 'shedSpeed', 0, 12, 0.05, 'petal speed');
  R(fx, c, 'shedSize', 0.02, 0.5, 0.005, 'petal size');
  R(fx, c, 'shedLife', 0.1, 5, 0.05, 'petal lifetime');
  R(fx, c, 'shedFall', 0, 5, 0.05, 'petal fall (m/s²)');
  R(fx, c, 'shedGlow', 0, 4, 0.05, 'petal glow');
  R(fx, c, 'burstPetals', 0, 500, 1, 'petals at the slam');
  R(fx, c, 'burstPetalSpeed', 0, 20, 0.1, 'slam petal speed');
  Editor.gradient(fx, c, 'colorShed', 'petal colour');
  R(fx, c, 'pollenRate', 0, 600, 1, 'pollen / s');
  R(fx, c, 'pollenSpeed', 0, 4, 0.01, 'pollen speed');
  R(fx, c, 'pollenSize', 0.005, 0.3, 0.005, 'pollen size');
  R(fx, c, 'pollenLife', 0.1, 5, 0.05, 'pollen lifetime');
  R(fx, c, 'pollenFall', -2, 4, 0.01, 'pollen fall (m/s²)');
  R(fx, c, 'pollenGlow', 0, 8, 0.05, 'pollen glow');
  R(fx, c, 'burstPollen', 0, 600, 1, 'pollen at the slam');
  Editor.gradient(fx, c, 'colorPollen', 'pollen colour');
  R(fx, c, 'soilCount', 0, 300, 1, 'soil at the slam');
  R(fx, c, 'soilSpeed', 0, 20, 0.1, 'soil speed');
  R(fx, c, 'soilSize', 0.01, 0.4, 0.005, 'soil size');
  R(fx, c, 'soilLife', 0.1, 4, 0.05, 'soil lifetime');
  Editor.gradient(fx, c, 'colorSoil', 'soil colour');
  R(fx, c, 'grassCount', 0, 600, 1, 'grass thrown up');
  R(fx, c, 'grassSpeed', 0, 12, 0.05, 'grass speed');
  R(fx, c, 'grassSize', 0.02, 0.5, 0.005, 'grass size');
  R(fx, c, 'grassLife', 0.1, 4, 0.05, 'grass lifetime');
  Editor.gradient(fx, c, 'colorGrass', 'grass colour');

  const hit = folder.addFolder('8 · Bodies');
  R(hit, c, 'hitReach', 0.1, 2, 0.01, 'reach (× circle)');
  R(hit, c, 'hitImpulse', 0, 25, 0.1, 'thrown outward (m/s)');
  R(hit, c, 'hitLift', 0, 15, 0.05, 'lift (m/s)');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'tumble');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightLow', 0, 3, 0.01, 'height after the slam (m)');

  folder.close();
  return folder;
}
