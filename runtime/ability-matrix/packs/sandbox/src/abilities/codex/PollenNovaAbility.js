import { InstancedMesh, Matrix4, Mesh, Vector3, Vector4 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createPetalGeometry,
  createStamenGeometry,
  createDomeGeometry,
  createShellGeometry,
  createGroundQuadGeometry
} from '../../assets/codex/PollenNovaGeometry.js';
import {
  createPetalMaterial,
  createPistilMaterial,
  createFoliageMaterial,
  createPollenShellMaterial,
  createNovaLensMaterial
} from '../../materials/codex/PollenNovaMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'pollen';

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Layers: green sepals, then three whorls of petals, outside in. */
const LAYERS = 4;
/** Petals per layer at most; the editor's count sliders clamp to this. */
const MAX_PER_LAYER = 12;
const MAX_PETALS = LAYERS * MAX_PER_LAYER;
const MAX_STAMENS = 24;
/** Bodies one nova can put to sleep. */
const MAX_SLEEPERS = 10;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _body = new Vector3();
const _axis = new Vector3();
const _scale = new Vector3();
const _mat = new Matrix4();
const _up = new Vector3(0, 1, 0);
const _counts = [0, 0, 0, 0];

/**
 * POLLEN NOVA — Nature, zone cast.
 *
 * A flower the size of the circle, on one clock that starts when the seed
 * reaches it:
 *
 *   1. **EMERGE** — the floor tears open and a closed bud punches up out of it,
 *      overshooting and settling, soil thrown up round it; leaves and grass
 *      fan out over the floor from the tear.
 *   2. **BLOOM** — the bud opens from the outside in: the green sepals fold
 *      down first, then each whorl of petals curls open after the last, and
 *      the pistil — a ring of stamens round a domed head — rises out of the
 *      middle.
 *   3. **PULSE** — the open flower breathes, faster and deeper, its throat and
 *      its pistil lighting up gold, pollen beginning to lift off it.
 *   4. **NOVA** — it bursts: the petals fling wide, a shell of pollen light
 *      sweeps out over the circle, a dense cloud of glowing pollen floods it and
 *      drifts, gold settles over the leaves.
 *   5. **WILT** — the petals brown from the tips, droop past the horizontal and
 *      fall off it as it sinks back into the floor; the leaves dry and erode.
 *
 * ## Layers
 *
 *   - **petals** (`createPetalMaterial`) — instanced strips bent into petals in
 *     the vertex stage; subsurface-lit, veined, fresnel-rimmed; four layers with
 *     their own shape and opening clock; casts its shadow (SHAPED + a matching
 *     depth material).
 *   - **pistil** (`createPistilMaterial`) — instanced stamens, a domed head of
 *     pollen grains, and the green receptacle; emissive gold as it charges.
 *   - **foliage** (`createFoliageMaterial`) — the ground: leaves, grass, torn
 *     soil, gold dust.
 *   - **pollen shell** (`createPollenShellMaterial`) and its **lens**
 *     (`createNovaLensMaterial`, `LAYER.DISTORTION`) — the nova itself.
 *   - **particles** — pollen motes (SOFT, the seed, the charge, the burst and
 *     the drift), pollen haze (SMOKE), petals and leaves (LEAF), soil (CHIP).
 *   - **engine** — a DUSTRING decal as the bud breaks the floor, a gold
 *     SHOCKWAVE on the burst.
 *
 * ## Bodies
 *
 * Nothing is thrown. `handlesOwnHits`: when the nova bursts, every body inside
 * `drowseReach` becomes a sleeper, reached when the shell gets to it. A sleeper
 * first *drowses*: it sways on its feet — its root tipped a few degrees on two
 * slow, slowing sines whose envelope rises and dies back to exactly zero —
 * while pollen settles on it and `Dummy#corrode` dusts it gold. When the sway
 * has died away it is upright again (that is the point of the envelope: the
 * tilt is zero on the frame of the kill, so the ragdoll takes over from an
 * untilted root), and it slumps: killed with a token impulse, and for a moment
 * held up by the pollen (`carry` with buoyancy) so it folds down gently rather
 * than dropping. The gold keeps spreading over it as it lies there.
 *
 * ## The editor rule
 *
 * A cast records dice (petal bearings, lengths, seeds), its clock and the
 * events it latches (emerged, burst). Every metre, radian, second and colour is
 * read from `settings.pollen` every frame — the petal counts too, so dragging
 * `outerCount` adds petals to a flower that is already open.
 */
export class PollenNovaAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Petals drawn. HUD readout only. */
  get instanceCount() {
    return this.petalGeometry.instanceCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- the flower ---- */
    this.petalGeometry = createPetalGeometry(MAX_PETALS);
    this.petalMaterial = createPetalMaterial();
    this.petals = new Mesh(this.petalGeometry, this.petalMaterial);
    // Placed in its own vertex stage: SHAPED keeps it out of the depth prepass
    // (which would rasterise the raw strip), its depth material casts the shadow.
    this.petals.customDepthMaterial = this.petalMaterial.userData.depth;
    this.petals.castShadow = true;
    this._setup(this.petals, LAYER.SHAPED, 8);

    this.pistilMaterial = createPistilMaterial();
    this.stamenGeometry = createStamenGeometry();
    this.stamens = new InstancedMesh(this.stamenGeometry, this.pistilMaterial, MAX_STAMENS);
    this.headGeometry = createDomeGeometry(2);
    this.head = new InstancedMesh(this.headGeometry, this.pistilMaterial, 1);
    this.receptacleGeometry = createDomeGeometry(3);
    this.receptacle = new InstancedMesh(this.receptacleGeometry, this.pistilMaterial, 1);
    for (const mesh of [this.stamens, this.head, this.receptacle]) {
      // Ordinary instanced meshes: the prepass and the shadow pass place them right.
      mesh.castShadow = true;
      this._setup(mesh, LAYER.WORLD, 8);
    }

    /* ---- the floor ---- */
    this.groundGeometry = createGroundQuadGeometry();
    this.foliageMaterial = createFoliageMaterial();
    this.foliage = new Mesh(this.groundGeometry, this.foliageMaterial);
    this._setup(this.foliage, LAYER.VFX, 3);

    /* ---- the nova ---- */
    this.shellGeometry = createShellGeometry();
    this.shellMaterial = createPollenShellMaterial();
    this.shell = new Mesh(this.shellGeometry, this.shellMaterial);
    this._setup(this.shell, LAYER.VFX, 14);
    this.lensMaterial = createNovaLensMaterial();
    this.lens = new Mesh(this.shellGeometry, this.lensMaterial);
    this._setup(this.lens, LAYER.DISTORTION, 1);

    /* ---- dice ---- */
    this._petalSeed = new Float32Array(MAX_PETALS);
    this._petalLen = new Float32Array(MAX_PETALS);
    this._petalAng = new Float32Array(MAX_PETALS);
    this._stamenDice = new Float32Array(MAX_STAMENS * 2);
    this._turn = 0;
    this._seed = 0;
    this._clock = -1;
    this._emerged = false;
    this._burst = false;
    this._centre = new Vector3();

    /* ---- sync state, written in place ---- */
    this._open = new Vector4();
    this._petalState = { centre: this._centre, sink: 0, scale: 1, open: this._open, wilt: 0, pulse: 0, charge: 0, dissolve: 0 };
    this._pistilState = { charge: 0, spent: 0, wilt: 0 };
    this._foliageState = { centre: this._centre, spread: 0, soil: 0, dust: 0, wilt: 0, erode: 0, seed: 0 };
    this._shellState = { centre: new Vector3(), radius: 0.1, age: 1, seed: 0 };
    this._lensState = { centre: this._shellState.centre, radius: 0.1, strength: 0 };

    /* ---- the sleepers ---- */
    this._sleepers = [];
    for (let i = 0; i < MAX_SLEEPERS; i++) {
      this._sleepers.push({
        dummy: null,
        delay: 0,
        phase: 0,
        phase2: 0,
        dirX: 0,
        dirZ: 1,
        slumped: false,
        soft: false,
        down: 0,
        motes: new RateEmitter()
      });
    }
    this._sleeperCount = 0;
    this._targets = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    /** The stain `Dummy#corrode` dusts them with — refreshed from settings each frame. */
    this._goldLook = { color: '#b08a2a', rimColor: '#ffe066', rimEmissive: 1.6, edgeColor: '#ffd84a', edgeEmissive: 5, edgeWidth: 0.12 };
    // Still air: the pollen only softens the fall, it does not move the body.
    this._still = (x, y, z, out) => out.set(0, 0, 0);
  }

  _setup(mesh, layer, order) {
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.visible = false;
    this.group.add(mesh);
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Pollen motes: the seed, the charge, the nova and the drift.
    this.motes = particles.get('pollen.mote', {
      capacity: 5000,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.motes.uniforms.uEndSize.value = 0.5;
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.06;
    this.motes.uniforms.uFadeOut.value = 0.5;

    // Soft clouds of pollen hanging in the air.
    this.haze = particles.get('pollen.haze', {
      capacity: 500,
      shape: ParticleShape.SMOKE,
      additive: true,
      curl: true,
      softFade: 0.7
    });
    this.haze.uniforms.uDrag.value = 2.2;
    this.haze.uniforms.uEndSize.value = 2.2;
    this.haze.uniforms.uSizeIn.value = 0.15;
    this.haze.uniforms.uFadeIn.value = 0.15;
    this.haze.uniforms.uFadeOut.value = 0.55;

    // Petals and leaves: lit, tumbling, normal-blended.
    this.leaves = particles.get('pollen.leaf', {
      capacity: 800,
      shape: ParticleShape.LEAF,
      additive: false,
      curl: true,
      lit: true,
      softFade: 0.15
    });
    this.leaves.uniforms.uDrag.value = 1.6;
    this.leaves.uniforms.uEndSize.value = 0.9;
    this.leaves.uniforms.uSizeIn.value = 0.05;
    this.leaves.uniforms.uFadeIn.value = 0.04;
    this.leaves.uniforms.uFadeOut.value = 0.3;

    // Clods of earth as the bud breaks the floor.
    this.soil = particles.get('pollen.soil', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.soil.uniforms.uDrag.value = 0.4;
    this.soil.uniforms.uEndSize.value = 0.8;
    this.soil.uniforms.uSizeIn.value = 0.01;
    this.soil.uniforms.uFadeIn.value = 0.01;
    this.soil.uniforms.uFadeOut.value = 0.25;

    this.seedEmitter = new RateEmitter();
    this.chargeEmitter = new RateEmitter();
    this.driftEmitter = new RateEmitter();
    this.fallEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every beat a function of the live settings                 */
  /* ------------------------------------------------------------------ */

  _t(key) {
    return Math.max(0.02, settings.pollen[key] * settings.global.lifetime);
  }

  _bloomStart() {
    return this._t('emergeTime') * 0.75;
  }

  _bloomEnd() {
    return this._bloomStart() + 3 * Math.max(0, settings.pollen.bloomStagger * settings.global.lifetime) + this._t('bloomTime');
  }

  _burstAt() {
    return this._bloomEnd() + this._t('pulseTime');
  }

  _wiltStart() {
    return this._burstAt() + Math.max(0, settings.pollen.wiltDelay * settings.global.lifetime);
  }

  _sinkStart() {
    return this._wiltStart() + this._t('wiltTime') * 0.55;
  }

  get impactDuration() {
    const c = settings.pollen;
    const burst = this._burstAt();
    return Math.max(
      this._sinkStart() + this._t('sinkTime'),
      burst + this._t('lifetime'),
      burst + Math.max(0.05, c.shellTime) + 0.3 + this._t('swayTime') + Math.max(0, c.slumpSoftTime)
    );
  }

  get fadeDuration() {
    return this._t('fadeTime');
  }

  /** Warm and steady, with the faintest breath. */
  lightShimmer() {
    return 0.94 + 0.06 * Math.sin(this.age * 2.3);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._turn = Math.random() * TAU;
    this._clock = -1;
    this._emerged = false;
    this._burst = false;
    this.pointAt(1, this._centre);
    this._centre.y = 0;
    for (let i = 0; i < MAX_PETALS; i++) {
      this._petalSeed[i] = Math.random();
      this._petalLen[i] = randRange(-1, 1);
      this._petalAng[i] = randRange(-1, 1);
    }
    for (let i = 0; i < MAX_STAMENS * 2; i++) this._stamenDice[i] = Math.random();
    for (let i = 0; i < MAX_SLEEPERS; i++) {
      const s = this._sleepers[i];
      s.dummy = null;
      s.slumped = false;
      s.soft = false;
      s.down = 0;
      s.motes.reset();
    }
    this._sleeperCount = 0;
    this.seedEmitter.reset();
    this.chargeEmitter.reset();
    this.driftEmitter.reset();
    this.fallEmitter.reset();
    this._update(0);
  }

  onTravel(dt) {
    this._clock = -1;
    this.position.y = 0.3;
    this._seedFx(dt);
    this._update(dt);
  }

  onImpact() {
    this._clock = 0;
    this._update(0);
  }

  onFade(dt) {
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    if (!this._emerged) this._emerge();
    if (!this._burst && this._clock >= this._burstAt()) this._nova();
    this._update(dt);
    this._updateSleepers(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _update(dt) {
    const c = settings.pollen;
    const g = settings.global;
    const k = this._clock;
    const arrived = k >= 0;
    const E = this._t('emergeTime');
    const B = this._t('bloomTime');
    const stagger = Math.max(0, c.bloomStagger * g.lifetime);
    const bloomStart = this._bloomStart();
    const bloomEnd = this._bloomEnd();
    const burstAt = this._burstAt();
    const wiltStart = this._wiltStart();
    const sinkStart = this._sinkStart();
    const since = this._burst ? k - burstAt : -1;
    let fadeT = 0;
    if (this.phase === AbilityPhase.FADE) fadeT = saturate(this.fadeTime / this.fadeDuration);

    /* ---- the flower's envelopes ---- */
    const rise = arrived ? saturate(k / E) : 0;
    const sinkT = arrived ? saturate((k - sinkStart) / this._t('sinkTime')) : 0;
    // Punches up past its rest and settles (outBack), then sinks away.
    let sink = c.budDepth * (1 - Easing.outBack(rise));
    sink = lerp(sink, c.budDepth + c.flowerHeight + 0.5, Easing.inQuad(sinkT));
    const scale = lerp(c.budScale, 1, Easing.outCubic(rise));
    for (let l = 0; l < LAYERS; l++) {
      const o = arrived ? Easing.outCubic(saturate((k - bloomStart - l * stagger) / B)) : 0;
      this._open.setComponent(l, o);
    }
    let pulse = 0;
    let charge = 0;
    if (arrived && k >= bloomEnd && !this._burst) {
      const p = saturate((k - bloomEnd) / this._t('pulseTime'));
      const s = Math.sin(k * c.pulseRate * (1 + p));
      pulse = c.pulseAmount * s * s * (0.3 + 0.7 * p);
      charge = p * p;
    }
    if (since >= 0) {
      // Flung wide by the burst, then settling back.
      pulse = -2.2 * c.pulseAmount * Math.exp(-since * 5);
      charge = Math.exp(-since * 3);
    }
    const wilt = arrived ? saturate((k - wiltStart) / this._t('wiltTime')) : 0;
    const crumble = arrived ? saturate((k - wiltStart - this._t('wiltTime') * 0.5) / (this._t('wiltTime') + this._t('sinkTime'))) * 0.6 : 0;

    const ps = this._petalState;
    this._centre.y = c.flowerHeight;
    ps.sink = sink;
    ps.scale = scale;
    ps.wilt = wilt;
    ps.pulse = pulse;
    ps.charge = charge;
    ps.dissolve = Math.max(crumble, fadeT);
    this.petalMaterial.userData.sync(ps);
    this._fillPetals(c, g);
    const shown = arrived && sink < c.budDepth + c.flowerHeight + 0.4 && fadeT < 1;
    this.petals.visible = shown;

    /* ---- the pistil and the receptacle ---- */
    const grow = arrived ? Easing.outBack(saturate((k - bloomStart - stagger * 2) / B)) : 0;
    const pis = this._pistilState;
    pis.charge = charge;
    pis.spent = since >= 0 ? saturate(since / 0.6) : 0;
    pis.wilt = wilt;
    this.pistilMaterial.userData.sync(pis);
    this._placePistil(c, grow, scale, sink);
    this.stamens.visible = shown && grow > 0.001;
    this.head.visible = shown && grow > 0.001;
    this.receptacle.visible = shown;
    this._centre.y = 0;

    /* ---- the floor ---- */
    const fs = this._foliageState;
    fs.spread = arrived ? c.zoneRadius * c.foliageReach * Easing.outCubic(saturate((k - 0.05) / this._t('spreadTime'))) : 0;
    fs.soil = arrived ? saturate(k / 0.12) * (1 - sinkT * 0.3) : 0;
    fs.dust = since >= 0 ? saturate(since / 0.9) : 0;
    fs.wilt = wilt * 0.9;
    fs.erode = fadeT;
    fs.seed = this._seed;
    this.foliageMaterial.userData.sync(fs);
    this.foliage.visible = arrived;

    /* ---- the nova ---- */
    const shellR = Math.max(0.2, c.zoneRadius * c.shellRadius);
    const age = since >= 0 ? saturate(since / Math.max(0.05, c.shellTime)) : 1;
    const ss = this._shellState;
    ss.centre.set(this._centre.x, c.flowerHeight + 0.4, this._centre.z);
    ss.radius = Math.max(0.2, shellR * Easing.outCubic(age));
    ss.age = age;
    ss.seed = this._seed;
    this.shellMaterial.userData.sync(ss);
    this.shell.visible = since >= 0 && age < 1;
    const ls = this._lensState;
    ls.radius = ss.radius;
    ls.strength = since >= 0 ? Math.pow(1 - age, 1.5) : 0;
    this.lensMaterial.userData.sync(ls);
    this.lens.visible = ls.strength > 0.002;

    /* ---- particles ---- */
    this._syncParticles(c, g);
    if (arrived && k >= bloomEnd && !this._burst) this._chargeFx(dt, saturate((k - bloomEnd) / this._t('pulseTime')), sink, c);
    if (since >= 0) this._driftFx(dt, (1 - saturate(since / this._t('lifetime'))) * (1 - fadeT), c);
    if (wilt > 0 && sinkT < 1) this._fallFx(dt, wilt, sink, scale, c);

    /* ---- the light: low over the flower once it is there ---- */
    if (arrived) this.position.set(this._centre.x, c.lightHeight - Math.min(sink, c.lightHeight * 0.8), this._centre.z);
  }

  /** Write every petal instance from its dice and the live layer counts. */
  _fillPetals(c, g) {
    const counts = _counts;
    counts[0] = c.sepalCount;
    counts[1] = c.outerCount;
    counts[2] = c.midCount;
    counts[3] = c.innerCount;
    const attr = this.petalGeometry.attributes.aPetal;
    const a = attr.array;
    let n = 0;
    for (let l = 0; l < LAYERS; l++) {
      const count = Math.min(MAX_PER_LAYER, Math.max(0, Math.round(counts[l])));
      // Each layer sits in the gaps of the one outside it.
      const offset = this._turn + (l % 2) * (Math.PI / Math.max(1, count)) + l * 0.37;
      for (let i = 0; i < count; i++) {
        const d = l * MAX_PER_LAYER + i;
        a[n * 4] = l;
        a[n * 4 + 1] = offset + (i / count) * TAU + this._petalAng[d] * 0.12 * g.randomness;
        a[n * 4 + 2] = this._petalSeed[d];
        a[n * 4 + 3] = this._petalLen[d];
        n++;
      }
    }
    this.petalGeometry.instanceCount = n;
    attr.needsUpdate = true;
  }

  /** Stamens leaning out of the middle round the domed head, and the receptacle. */
  _placePistil(c, grow, scale, sink) {
    const s = c.flowerScale * scale;
    const baseY = c.flowerHeight - sink;
    const cx = this._centre.x;
    const cz = this._centre.z;
    const count = Math.min(MAX_STAMENS, Math.max(0, Math.round(c.stamenCount)));
    for (let i = 0; i < count; i++) {
      const a = this._turn + i * GOLDEN * 2.4;
      const d1 = this._stamenDice[i * 2];
      const d2 = this._stamenDice[i * 2 + 1];
      const lean = c.stamenSpread * (0.6 + 0.6 * d1) * saturate(grow);
      // Tipped outward about the tangent at its bearing.
      _axis.set(-Math.sin(a), 0, Math.cos(a));
      _mat.makeRotationAxis(_axis, -lean);
      const h = c.stamenHeight * s * Math.max(0.001, grow) * (0.8 + 0.4 * d2);
      _scale.set(s, h, s);
      _mat.scale(_scale);
      const r = c.pistilSize * s * 0.6;
      _mat.setPosition(cx + Math.cos(a) * r, baseY + 0.05 * s, cz + Math.sin(a) * r);
      this.stamens.setMatrixAt(i, _mat);
    }
    this.stamens.count = count;
    this.stamens.instanceMatrix.needsUpdate = true;

    const hs = c.pistilSize * s * Math.max(0.001, grow);
    _mat.makeScale(hs, hs * 0.75, hs);
    _mat.setPosition(cx, baseY + 0.08 * s, cz);
    this.head.setMatrixAt(0, _mat);
    this.head.instanceMatrix.needsUpdate = true;

    _mat.makeScale(0.78 * s, 0.5 * s, 0.78 * s);
    _mat.setPosition(cx, baseY - 0.12 * s, cz);
    this.receptacle.setMatrixAt(0, _mat);
    this.receptacle.instanceMatrix.needsUpdate = true;
  }

  _syncParticles(c, g) {
    const m = this.motes.uniforms;
    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    m.uGravity.value.set(0, -0.12, 0);
    m.uDrag.value = c.novaDrag;
    m.uSizeScale.value = c.novaSize * g.particleSize * 7;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = g.opacity;
    m.uGlow.value = c.moteGlow * g.glow;
    m.uTurbulence.value = 0.5 * g.turbulence;

    const h = this.haze.uniforms;
    this.haze.setGradient(getColor(c.colorHazeA), getColor(c.colorHazeB), getColor(c.colorHazeC), getColor(c.colorHazeD));
    h.uGravity.value.set(0, 0.05, 0);
    h.uSizeScale.value = c.hazeSize * g.particleSize * 2.2;
    h.uLifeScale.value = g.particleLifetime;
    h.uSpeedScale.value = g.particleSpeed;
    h.uOpacity.value = c.hazeOpacity * g.opacity;
    h.uGlow.value = g.glow;
    h.uTurbulence.value = 0.4 * g.turbulence;

    const l = this.leaves.uniforms;
    const white = getColor('#ffffff');
    this.leaves.setGradient(white, white, white, white);
    l.uGravity.value.set(0, -1.6, 0);
    l.uSizeScale.value = c.petalFallSize * g.particleSize * 4;
    l.uLifeScale.value = g.particleLifetime;
    l.uSpeedScale.value = g.particleSpeed;
    l.uOpacity.value = g.opacity;
    l.uGlow.value = 1;
    l.uTurbulence.value = 0.7 * g.turbulence;

    const s = this.soil.uniforms;
    const earth = getColor(c.colorSoilChunk);
    this.soil.setGradient(earth, earth, earth, earth);
    s.uGravity.value.set(0, -14, 0);
    s.uSizeScale.value = c.soilSize * g.particleSize * 7;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = 1;
    s.uTurbulence.value = 0;
  }

  /* ------------------------------------------------------------------ */
  /* The beats                                                           */
  /* ------------------------------------------------------------------ */

  /** The bud breaks the floor: soil thrown up, leaves flung out, a dust ring. */
  _emerge() {
    const c = settings.pollen;
    const g = settings.global;
    this._emerged = true;
    const R = c.zoneRadius;
    this.ctx.decals.spawn(DecalType.DUSTRING, this._centre, {
      radius: R * c.emergeRingRadius,
      life: c.emergeRingLife,
      intensity: 0.8,
      growth: 0.3,
      colorA: getColor(c.colorSoil),
      colorB: getColor(c.colorLeafB),
      height: 0.02
    });
    const soil = Math.round(c.soilBurst * g.particleCount);
    for (let i = 0; i < soil; i++) {
      const a = Math.random() * TAU;
      const r = c.soilRadius * Math.sqrt(Math.random());
      _pos.set(this._centre.x + Math.cos(a) * r, 0.1, this._centre.z + Math.sin(a) * r);
      _dir.set(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5);
      this._emit(this.soil, 1, _pos, 0.1, _dir, 6, 0.5, 0.35, 0.12, 0.6, 1.1, 0.4, 8, null);
    }
    const leaves = Math.round(c.leafBurst * g.particleCount);
    for (let i = 0; i < leaves; i++) {
      const a = Math.random() * TAU;
      _pos.set(this._centre.x + Math.cos(a) * 0.6, 0.3, this._centre.z + Math.sin(a) * 0.6);
      _dir.set(Math.cos(a), 0.55, Math.sin(a));
      const tint = getColor(Math.random() < 0.5 ? c.colorLeafA : c.colorLeafB);
      this._emit(this.leaves, 1, _pos, 0.2, _dir, 5, 0.5, 0.25, 0.25, 0.5, 1.6, 0.4, 6, tint);
    }
    this.ctx.shake.add(c.emergeShake * g.explosionIntensity, 6, 20);
    this.lightBoost = c.burstLight * 0.25 * g.explosionIntensity;
  }

  /** The burst: the shell, the flood of pollen, the beat — and the sleep. */
  _nova() {
    const c = settings.pollen;
    const g = settings.global;
    this._burst = true;
    const R = c.zoneRadius;
    const cy = c.flowerHeight + 0.5;

    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._centre, {
      radius: R * c.burstRingRadius * g.explosionIntensity,
      life: c.burstRingLife,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorShellCore),
      colorB: getColor(c.colorShellEdge),
      height: 0.03
    });

    // The flood: motes thrown out in every direction above the floor, slowing
    // to a drift on their drag.
    const count = Math.round(c.novaCount * g.particleCount);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const y = Math.random() * 0.9 + 0.05;
      const h = Math.sqrt(1 - y * y);
      _dir.set(Math.cos(a) * h, y * c.shellSquash, Math.sin(a) * h);
      _pos.set(this._centre.x, cy, this._centre.z);
      this._emit(this.motes, 1, _pos, 0.6, _dir, c.novaSpeed, 0.6, 0.1, 0.08, 0.6, c.novaLifetime, 0.45, 0, null);
    }
    const haze = Math.round(c.hazeCount * g.particleCount);
    for (let i = 0; i < haze; i++) {
      const a = Math.random() * TAU;
      _dir.set(Math.cos(a), 0.25 + Math.random() * 0.4, Math.sin(a));
      _pos.set(this._centre.x, cy, this._centre.z);
      this._emit(this.haze, 1, _pos, 0.8, _dir, c.novaSpeed * 0.45, 0.5, 0.2, 0.6, 0.5, c.hazeLifetime, 0.4, 0.4, null);
    }

    this.ctx.shake.add(c.burstShake * g.explosionIntensity, 4, 14);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.burstFlash * g.explosionIntensity);
    this.lightBoost = c.burstLight * g.explosionIntensity;

    this._gather(c);
  }

  /** Everyone the pollen will reach, and when it reaches them. */
  _gather(c) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const R = Math.max(0.1, c.zoneRadius);
    const found = field.findTargets(this._centre.x, this._centre.z, R * c.drowseReach, this._targets);
    const reach = Math.max(0.1, R * c.shellRadius);
    let n = 0;
    for (let f = 0; f < found.length && n < MAX_SLEEPERS; f++) {
      const dummy = found[f];
      const s = this._sleepers[n++];
      const dx = dummy.position.x - this._centre.x;
      const dz = dummy.position.z - this._centre.z;
      const dist = Math.hypot(dx, dz);
      s.dummy = dummy;
      // Reached when the shell gets there, give or take.
      s.delay = Math.min(1, dist / reach) * Math.max(0.05, c.shellTime) + Math.random() * 0.3 * settings.global.randomness;
      s.phase = Math.random() * TAU;
      s.phase2 = Math.random() * TAU;
      // They fold sideways as often as back: drowsing, not blown.
      const a = Math.atan2(dz, dx) + randRange(-1.2, 1.2);
      s.dirX = Math.cos(a);
      s.dirZ = Math.sin(a);
      s.slumped = false;
      s.soft = false;
      s.down = 0;
      s.motes.reset();
    }
    this._sleeperCount = n;
    this._targets.length = 0;
  }

  /** Sway, slump, and be dusted gold. */
  _updateSleepers(dt) {
    if (!this._burst) return;
    const c = settings.pollen;
    const g = settings.global;
    const look = this._goldLook;
    look.color = c.colorStain;
    look.rimColor = c.colorStainRim;
    look.rimEmissive = c.stainRimGlow * g.glow;
    look.edgeColor = c.colorStainEdge;
    look.edgeEmissive = c.stainEdgeGlow * g.glow;
    look.edgeWidth = c.stainEdgeWidth;

    const since = this._clock - this._burstAt();
    const sway = this._t('swayTime');
    for (let i = 0; i < this._sleeperCount; i++) {
      const s = this._sleepers[i];
      const dummy = s.dummy;
      if (!dummy) continue;
      const t = since - s.delay;
      if (t < 0) continue;

      // Dusted gold from the moment the pollen reaches it, deepening as it lies.
      dummy.corrode(c.stainAmount * saturate(t / Math.max(0.05, c.stainTime)), look);

      if (!s.slumped) {
        if (!dummy.alive) {
          // Something else knocked it down first; it is not ours to fell.
          s.slumped = true;
          continue;
        }
        const x = saturate(t / sway);
        // Rises, and dies back to exactly zero at x = 1 — so the root is upright
        // on the frame the ragdoll takes over from it.
        const env = Math.sin(Math.PI * x) * (0.5 + 0.5 * x);
        const w = c.swayRate * (1 - 0.45 * x) * g.animationSpeed;
        const tilt = c.swayAmount * env;
        dummy.root.rotation.z = tilt * Math.sin(t * w + s.phase);
        dummy.root.rotation.x = tilt * 0.7 * Math.sin(t * w * 0.63 + s.phase2);
        this._dustFx(s, dt, c, dummy.position.x, 1.2, dummy.position.z);
        if (x >= 1) {
          dummy.root.rotation.x = 0;
          dummy.root.rotation.z = 0;
          this._force.impulse = c.slumpImpulse;
          this._force.lift = c.slumpLift;
          this._force.spin = c.slumpSpin;
          s.slumped = true;
          s.soft = dummy.kill(s.dirX, s.dirZ, this._force);
          s.down = 0;
        }
        continue;
      }

      // Going down, gently: the pollen holds part of its weight for a moment.
      if (s.soft) {
        s.down += dt;
        const k = saturate(s.down / Math.max(0.05, c.slumpSoftTime));
        if (k >= 1) {
          dummy.release();
          s.soft = false;
        } else {
          dummy.carry(this._still, saturate(1.5 * dt), 0, c.slumpFloat * (1 - k));
          dummy.hold();
        }
      }
      if (dummy.state !== 'gone' && t < c.stainTime) {
        const at = dummy.bodyPoint(_body);
        if (at) this._dustFx(s, dt, c, at.x, at.y + 0.3, at.z);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  /** One emit, every field written — `_emit` is shared and reused. */
  _emit(system, count, position, radius, direction, speed, speedVariance, spread, size, sizeVariance, life, lifeVariance, spin, tint) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = speedVariance;
    _emit.spread = spread;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = size;
    _emit.sizeVariance = sizeVariance;
    _emit.life = life;
    _emit.lifeVariance = lifeVariance;
    _emit.spin = spin;
    _emit.tint = tint;
    _emit.time = frame.uTime.value;
    system.emit(count, _emit);
  }

  /** The seed: a mote of gold skimming the floor out to the circle. */
  _seedFx(dt) {
    const c = settings.pollen;
    const count = Math.round(this.seedEmitter.tick(dt, c.seedRate) * settings.global.particleCount);
    if (count <= 0) return;
    _dir.copy(this.direction).negate();
    _dir.y = 0.4;
    this._emit(this.motes, count, this.position, 0.12, _dir, 1.2, 0.5, 0.5, c.seedSize, 0.4, 0.7, 0.4, 0, null);
  }

  /** Pollen lifting off the pistil as it charges. */
  _chargeFx(dt, p, sink, c) {
    const count = Math.round(this.chargeEmitter.tick(dt, c.chargeMotes * p) * settings.global.particleCount);
    if (count <= 0) return;
    _pos.set(this._centre.x, c.flowerHeight - sink + c.stamenHeight * c.flowerScale, this._centre.z);
    this._emit(this.motes, count, _pos, c.pistilSize * 1.4, _up, 1.4, 0.5, 0.6, 0.06, 0.5, 1.2, 0.4, 0, null);
  }

  /** The pollen hanging over the circle after the burst, drifting. */
  _driftFx(dt, strength, c) {
    const g = settings.global;
    const count = Math.round(this.driftEmitter.tick(dt, c.driftRate * strength) * g.particleCount);
    const R = c.zoneRadius * c.drowseReach;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const r = R * Math.sqrt(Math.random());
      _pos.set(this._centre.x + Math.cos(a) * r, Math.random() * c.driftHeight + 0.1, this._centre.z + Math.sin(a) * r);
      _dir.set(Math.cos(a + 1.4), 0.2, Math.sin(a + 1.4));
      this._emit(this.motes, 1, _pos, 0.2, _dir, 0.35, 0.6, 0.8, 0.06, 0.6, c.novaLifetime, 0.45, 0, null);
    }
  }

  /** Petals letting go of the flower as it wilts. */
  _fallFx(dt, wilt, sink, scale, c) {
    const g = settings.global;
    const count = Math.round(this.fallEmitter.tick(dt, c.petalFallRate * Math.sin(Math.PI * wilt)) * g.particleCount);
    const r0 = c.outerLength * c.flowerScale * scale * 0.65;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const r = r0 * (0.4 + 0.6 * Math.random());
      _pos.set(this._centre.x + Math.cos(a) * r, Math.max(0.2, c.flowerHeight + 0.4 - sink * 0.5), this._centre.z + Math.sin(a) * r);
      _dir.set(Math.cos(a), 0.3, Math.sin(a));
      const pick = Math.random();
      const tint = getColor(pick < 0.4 ? c.colorPetalMid : pick < 0.7 ? c.colorPetalTip : c.colorWilt);
      this._emit(this.leaves, 1, _pos, 0.2, _dir, 0.9, 0.6, 0.6, 0.3, 0.5, c.petalFallLifetime, 0.4, 3, tint);
    }
  }

  /** Pollen settling on one sleeper. */
  _dustFx(s, dt, c, x, y, z) {
    const count = Math.round(s.motes.tick(dt, c.stainMotes) * settings.global.particleCount);
    if (count <= 0) return;
    _pos.set(x, y, z);
    _dir.set(0, -1, 0);
    this._emit(this.motes, count, _pos, 0.55, _dir, 0.25, 0.5, 0.9, 0.05, 0.5, 1.0, 0.4, 0, null);
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    for (let i = 0; i < this._sleeperCount; i++) {
      const s = this._sleepers[i];
      const dummy = s.dummy;
      if (!dummy) continue;
      // Still swaying: stand it up straight again before letting go.
      if (!s.slumped && dummy.alive) {
        dummy.root.rotation.x = 0;
        dummy.root.rotation.z = 0;
      }
      if (s.soft) dummy.release();
      s.dummy = null;
      s.soft = false;
      s.slumped = false;
    }
    this._sleeperCount = 0;
    this._clock = -1;
    this.petals.visible = false;
    this.stamens.visible = false;
    this.head.visible = false;
    this.receptacle.visible = false;
    this.foliage.visible = false;
    this.shell.visible = false;
    this.lens.visible = false;
  }

  dispose() {
    for (const geometry of [this.petalGeometry, this.stamenGeometry, this.headGeometry, this.receptacleGeometry, this.groundGeometry, this.shellGeometry]) {
      geometry.dispose();
    }
    this.petalMaterial.userData.depth.dispose();
    for (const material of [this.petalMaterial, this.pistilMaterial, this.foliageMaterial, this.shellMaterial, this.lensMaterial]) {
      material.dispose();
    }
    for (const mesh of [this.stamens, this.head, this.receptacle]) mesh.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('✿  Pollen Nova');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'seed speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'seedRate', 0, 600, 1, 'seed motes / s');
  R(cast, c, 'seedSize', 0.01, 0.4, 0.005, 'seed mote size');
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('accent, hot');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'emergeTime', 0.05, 3, 0.01, 'bud emerges over');
  R(time, c, 'bloomTime', 0.05, 4, 0.01, 'a layer opens over');
  R(time, c, 'bloomStagger', 0, 1.5, 0.01, 'between layers');
  R(time, c, 'pulseTime', 0.05, 4, 0.01, 'pulses for');
  R(time, c, 'lifetime', 0.05, 8, 0.05, 'pollen drifts for');
  R(time, c, 'wiltDelay', 0, 6, 0.05, 'wilts after the burst');
  R(time, c, 'wiltTime', 0.05, 5, 0.05, 'wilts over');
  R(time, c, 'sinkTime', 0.05, 5, 0.05, 'sinks over');
  R(time, c, 'fadeTime', 0.1, 5, 0.05, 'final fade');

  const flower = folder.addFolder('1 · The flower');
  R(flower, c, 'flowerScale', 0.2, 3, 0.01, 'scale');
  R(flower, c, 'flowerHeight', 0, 3, 0.01, 'height (m)');
  R(flower, c, 'budDepth', 0.5, 8, 0.05, 'bud starts under (m)');
  R(flower, c, 'budScale', 0.1, 1.5, 0.01, 'bud size');
  R(flower, c, 'budPitch', -0.5, 1.5, 0.01, 'bud lean (rad)');
  R(flower, c, 'budCurl', -3, 1, 0.01, 'bud curl');
  R(flower, c, 'wiltPitch', 0.5, 3.2, 0.01, 'wilted lean (rad)');
  R(flower, c, 'wiltCurl', -2, 3, 0.01, 'wilted curl');
  R(flower, c, 'petalCup', 0, 1.5, 0.01, 'cup');
  R(flower, c, 'petalJitter', 0, 0.5, 0.01, 'length jitter');
  R(flower, c, 'petalFlutter', 0, 0.3, 0.005, 'flutter (rad)');
  R(flower, c, 'petalNotch', 0, 0.4, 0.005, 'tip notch');
  R(flower, c, 'petalFrill', 0, 0.4, 0.005, 'frilled margin');
  R(flower, c, 'pulseAmount', 0, 3, 0.01, 'pulse');
  R(flower, c, 'pulseRate', 0, 30, 0.1, 'pulse rate');

  const layers = flower.addFolder('Layers');
  for (const [prefix, name] of [['sepal', 'sepals'], ['outer', 'outer petals'], ['mid', 'middle petals'], ['inner', 'inner petals']]) {
    const f = layers.addFolder(name);
    R(f, c, `${prefix}Count`, 0, MAX_PER_LAYER, 1, 'count');
    R(f, c, `${prefix}Length`, 0.1, 6, 0.01, 'length (m)');
    R(f, c, `${prefix}Width`, 0.05, 3, 0.01, 'half-width (m)');
    R(f, c, `${prefix}Pitch`, 0, 3.1, 0.01, 'open lean (rad)');
    R(f, c, `${prefix}Curl`, -2, 3, 0.01, 'open curl');
    R(f, c, `${prefix}Base`, 0, 2, 0.01, 'grows from (m)');
  }

  const shade = flower.addFolder('Petal shading');
  R(shade, c, 'veinCount', 0, 30, 0.5, 'veins');
  R(shade, c, 'veinWidth', 0.01, 0.6, 0.005, 'vein width');
  R(shade, c, 'veinStrength', 0, 1, 0.01, 'vein strength');
  R(shade, c, 'ribWidth', 0.005, 0.4, 0.005, 'midrib width');
  R(shade, c, 'petalSSS', 0, 5, 0.05, 'translucency');
  R(shade, c, 'petalSSSPower', 0.5, 12, 0.1, 'translucency tightness');
  R(shade, c, 'petalRim', 0, 3, 0.01, 'fresnel');
  R(shade, c, 'petalRimPower', 0.5, 8, 0.05, 'fresnel power');
  R(shade, c, 'petalAmbient', 0, 1.5, 0.01, 'ambient');
  R(shade, c, 'petalDiffuse', 0, 2, 0.01, 'diffuse');
  R(shade, c, 'chargeGlow', 0, 8, 0.05, 'charge glow');
  shade.addColor(c, 'colorPetalBase').name('base');
  shade.addColor(c, 'colorPetalMid').name('body');
  shade.addColor(c, 'colorPetalTip').name('tip');
  shade.addColor(c, 'colorPetalVein').name('veins');
  shade.addColor(c, 'colorPetalSSS').name('transmitted light');
  shade.addColor(c, 'colorPetalRim').name('rim');
  shade.addColor(c, 'colorSepalA').name('sepal base');
  shade.addColor(c, 'colorSepalB').name('sepal tip');
  shade.addColor(c, 'colorWilt').name('wilted');
  shade.addColor(c, 'colorWiltEdge').name('crumbling edge');
  shade.addColor(c, 'colorCharge').name('charge');

  const pistil = flower.addFolder('Pistil');
  R(pistil, c, 'stamenCount', 0, MAX_STAMENS, 1, 'stamens');
  R(pistil, c, 'stamenHeight', 0.1, 3, 0.01, 'stamen height (m)');
  R(pistil, c, 'stamenSpread', 0, 1.5, 0.01, 'stamen lean (rad)');
  R(pistil, c, 'pistilSize', 0.05, 1.5, 0.01, 'head (m)');
  R(pistil, c, 'pistilGlow', 0, 10, 0.05, 'glow');
  R(pistil, c, 'pistilGrain', 1, 30, 0.1, 'grains');
  R(pistil, c, 'pistilSparkle', 0, 8, 0.05, 'sparkle');
  R(pistil, c, 'pistilRim', 0, 3, 0.01, 'rim');
  pistil.addColor(c, 'colorStalk').name('stalks');
  pistil.addColor(c, 'colorAnther').name('anthers');
  pistil.addColor(c, 'colorPistil').name('head');

  const ground = folder.addFolder('2 · Foliage');
  R(ground, c, 'foliageReach', 0.2, 3, 0.01, 'reach (× circle)');
  R(ground, c, 'spreadTime', 0.05, 4, 0.01, 'fans out over');
  R(ground, c, 'leafCount', 3, 30, 1, 'leaves, first ring');
  R(ground, c, 'leafInner', 0, 3, 0.01, 'first ring at (m)');
  R(ground, c, 'leafRingGap', 0.1, 3, 0.01, 'ring gap (m)');
  R(ground, c, 'leafLength', 0.1, 4, 0.01, 'leaf length (m)');
  R(ground, c, 'leafWidth', 0.05, 0.8, 0.005, 'leaf width (× length)');
  R(ground, c, 'grassAmount', 0, 1, 0.01, 'grass');
  R(ground, c, 'soilRadius', 0.1, 4, 0.01, 'torn soil (m)');
  R(ground, c, 'groundDustGlow', 0, 10, 0.05, 'gold dust glint');
  ground.addColor(c, 'colorLeafA').name('leaf dark');
  ground.addColor(c, 'colorLeafB').name('leaf light');
  ground.addColor(c, 'colorLeafRib').name('leaf rib');
  ground.addColor(c, 'colorGrass').name('grass');
  ground.addColor(c, 'colorSoil').name('soil');
  ground.addColor(c, 'colorDust').name('gold dust');

  const nova = folder.addFolder('3 · The nova');
  R(nova, c, 'shellRadius', 0.2, 3, 0.01, 'shell reaches (× circle)');
  R(nova, c, 'shellTime', 0.05, 3, 0.01, 'shell runs over');
  R(nova, c, 'shellSquash', 0.1, 1.5, 0.01, 'shell squash');
  R(nova, c, 'shellLumps', 0, 0.5, 0.005, 'shell lumps');
  R(nova, c, 'shellGlow', 0, 8, 0.05, 'shell glow');
  R(nova, c, 'shellFresnel', 0.3, 8, 0.05, 'shell fresnel');
  R(nova, c, 'shellGrainScale', 1, 40, 0.5, 'grain scale');
  R(nova, c, 'shellGrain', 0, 1, 0.01, 'grain');
  R(nova, c, 'shellBody', 0, 1, 0.01, 'shell body');
  R(nova, c, 'shellSoftFade', 0.01, 3, 0.01, 'soft fade (m)');
  nova.addColor(c, 'colorShellCore').name('shell');
  nova.addColor(c, 'colorShellEdge').name('shell rim');
  R(nova, c, 'lensStrength', 0, 5, 0.05, 'lens (distortion)');
  const motes = nova.addFolder('Pollen');
  R(motes, c, 'novaCount', 0, 3000, 10, 'motes in the burst');
  R(motes, c, 'novaSpeed', 0, 30, 0.1, 'burst speed');
  R(motes, c, 'novaSize', 0.01, 0.4, 0.005, 'mote size');
  R(motes, c, 'novaLifetime', 0.1, 6, 0.05, 'mote lifetime');
  R(motes, c, 'novaDrag', 0, 8, 0.05, 'drag');
  R(motes, c, 'moteGlow', 0, 8, 0.05, 'glow');
  R(motes, c, 'driftRate', 0, 1000, 5, 'drifting / s');
  R(motes, c, 'driftHeight', 0.2, 8, 0.05, 'drift height (m)');
  R(motes, c, 'chargeMotes', 0, 500, 1, 'charge motes / s');
  Editor.gradient(motes, c, 'colorMote', 'mote colour');
  R(motes, c, 'hazeCount', 0, 200, 1, 'haze clouds');
  R(motes, c, 'hazeSize', 0.1, 5, 0.05, 'haze size');
  R(motes, c, 'hazeLifetime', 0.1, 8, 0.05, 'haze lifetime');
  R(motes, c, 'hazeOpacity', 0, 1, 0.01, 'haze opacity');
  Editor.gradient(motes, c, 'colorHaze', 'haze colour');
  const shed = nova.addFolder('Petals, leaves & soil');
  R(shed, c, 'petalFallRate', 0, 300, 1, 'petals falling / s');
  R(shed, c, 'petalFallSize', 0.02, 1.5, 0.01, 'petal size');
  R(shed, c, 'petalFallLifetime', 0.1, 6, 0.05, 'petal lifetime');
  R(shed, c, 'leafBurst', 0, 200, 1, 'leaves on emerging');
  R(shed, c, 'soilBurst', 0, 300, 1, 'clods on emerging');
  R(shed, c, 'soilSize', 0.01, 0.5, 0.005, 'clod size');
  shed.addColor(c, 'colorSoilChunk').name('clods');

  const beats = folder.addFolder('4 · Beats');
  R(beats, c, 'emergeShake', 0, 2, 0.01, 'shake on emerging');
  R(beats, c, 'burstShake', 0, 2, 0.01, 'shake on the burst');
  R(beats, c, 'burstFlash', 0, 1, 0.01, 'flash');
  beats.addColor(c, 'colorFlash').name('flash');
  R(beats, c, 'burstLight', 0, 60, 0.5, 'light punch');
  R(beats, c, 'emergeRingRadius', 0.1, 4, 0.05, 'dust ring (× circle)');
  R(beats, c, 'emergeRingLife', 0.1, 5, 0.05, 'dust ring life');
  R(beats, c, 'burstRingRadius', 0.1, 4, 0.05, 'gold ring (× circle)');
  R(beats, c, 'burstRingLife', 0.1, 5, 0.05, 'gold ring life');

  const sleep = beats.addFolder('Bodies');
  R(sleep, c, 'drowseReach', 0.2, 3, 0.01, 'sleep reaches (× circle)');
  R(sleep, c, 'swayTime', 0.1, 5, 0.05, 'sway for');
  R(sleep, c, 'swayAmount', 0, 0.5, 0.005, 'sway (rad)');
  R(sleep, c, 'swayRate', 0, 12, 0.05, 'sway rate');
  R(sleep, c, 'slumpImpulse', 0, 6, 0.05, 'slump impulse');
  R(sleep, c, 'slumpLift', 0, 4, 0.05, 'slump lift');
  R(sleep, c, 'slumpSpin', 0, 3, 0.05, 'slump spin');
  R(sleep, c, 'slumpFloat', 0, 0.95, 0.01, 'held up while falling');
  R(sleep, c, 'slumpSoftTime', 0, 3, 0.05, 'softened for');
  R(sleep, c, 'stainTime', 0.1, 6, 0.05, 'dusted gold over');
  R(sleep, c, 'stainAmount', 0, 1, 0.01, 'how gold');
  R(sleep, c, 'stainMotes', 0, 200, 1, 'pollen settling / s');
  sleep.addColor(c, 'colorStain').name('dusted body');
  sleep.addColor(c, 'colorStainRim').name('dusted rim');
  R(sleep, c, 'stainRimGlow', 0, 6, 0.05, 'rim glow');
  sleep.addColor(c, 'colorStainEdge').name('burn edge');
  R(sleep, c, 'stainEdgeGlow', 0, 12, 0.1, 'burn edge glow');
  R(sleep, c, 'stainEdgeWidth', 0.01, 0.5, 0.005, 'burn edge width');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 10, 0.05, 'height (m)');
}
