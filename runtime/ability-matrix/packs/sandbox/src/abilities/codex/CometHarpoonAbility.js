import { DynamicDrawUsage, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createHarpoonGeometry,
  createCometGrid,
  createCometQuad,
  createCometNucleusGeometry,
  createIceBladeGeometry,
  HARPOON_BUTT
} from '../../assets/codex/CometHarpoonGeometry.js';
import {
  createHarpoonMaterial,
  createComaMaterial,
  createCometLensMaterial,
  createIonTailMaterial,
  createDustTailMaterial,
  createTetherMaterial,
  createPetalMaterial,
  createCraterMaterial,
  createIceSolidMaterial,
  MAX_PETALS
} from '../../materials/codex/CometHarpoonMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'cometharpoon';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _floor = new Vector3();
const _up = new Vector3(0, 1, 0);
const _down = new Vector3(0, -1, 0);
const _zAxis = new Vector3(0, 0, 1);
const _q = new Quaternion();
const _qRoll = new Quaternion();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _bx = new Vector3();
const _by = new Vector3();
const _bz = new Vector3();
const _radial = new Vector3();
const _tumble = new Vector3(0.3, 1, 0.2).normalize();
const MAX_BLADES = MAX_PETALS * 2;

/**
 * COMET HARPOON — Cosmic, line cast.
 *
 * A harpoon, first: a real barbed spear of comet ice with an eye at the butt,
 * thrown on a **tether** of starlight that pays out from the caster's hand.
 * A comet, second: its head blazes inside a hooded **coma**, a straight blue
 * **ion tail** combed into streamers and a broad gold **dust tail** curving
 * away behind it, shedding grains and sublimating vapour as it flies the
 * line on a shallow arc, spinning.
 *
 * It **drives in** at the target nose-first and shudders. The tails collapse
 * into the strike, the coma flares — and the comet **blooms**: two rows of
 * cupped, twisting petals of ice-light open out of the strike like a lotus
 * while frost cracks race across a crater under it, a FROST shell and a
 * pressure ring go out, and everything near is thrown. In the same beat the
 * tether **snaps taut** and the body nearest the strike — the one it
 * harpooned — is yanked back down the line toward the caster. Then the petals
 * dissolve from their tips, the tether frays away from the hand, the harpoon
 * dissolves butt-first and the crater cools.
 *
 * **The comet has a body.** Impaled on the harpoon just behind the broadhead
 * rides the *nucleus*: a 1.3 m lumpy, cratered, faceted lump of dirty comet
 * ice, lit by the sun and casting a shadow, its forward face boiling white
 * where it meets the wind. At the strike it is driven into the floor with the
 * head and sits there, seams pulsing, while a lotus of **solid ice blades**
 * (lit, faceted, deep navy to pale tip) heaves up round it under the
 * ice-light petals; through the linger the blades turn and breathe and light
 * runs out along the frost cracks while the frost creeps outward; then the
 * blades melt from their tips and the nucleus sublimates away into vapour.
 *
 * ## Layers (each a folder in the editor)
 *
 *   0. **the nucleus** and **the blades** (`createIceSolidMaterial`,
 *      `LAYER.WORLD`, cast shadows) — the solid comet ice.
 *   1. **the harpoon** (`createHarpoonMaterial`, `LAYER.WORLD`) — the solid.
 *   2. **the coma** (`createComaMaterial`) and its shimmer
 *      (`createCometLensMaterial`, `LAYER.DISTORTION`).
 *   3. **the tails** (`createIonTailMaterial`, `createDustTailMaterial`) —
 *      camera-facing ribbons bent in the vertex stage.
 *   4. **the tether** (`createTetherMaterial`) — sagging, rippling, beaded.
 *   5. **the bloom** (`createPetalMaterial`) — 2 × up to 12 petals.
 *   6. **the crater** (`createCraterMaterial`) — frost cracks, gold ring, pit.
 *   7. **particles** — gold grains off the dust tail, ice spark streaks,
 *      sublimation vapour and the strike's plume.
 *   8. **the strike** — FROST shell, SHOCKWAVE and FROST decals, pressure
 *      ring, flash, shake, light punch.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * At the strike: the body nearest it (within `impaleRadius`) is harpooned and
 * yanked back toward the caster; everything else within `bloomRadius` is
 * thrown outward and up by the bloom.
 *
 * ## The editor rule
 *
 * A cast keeps a seed, the flight's integrated phases (roll, flows) and the
 * strike point. Every dimension, time and colour is read from
 * `settings.cometharpoon` every frame.
 */
export class CometHarpoonAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._struck;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.harpoonGeometry = createHarpoonGeometry();
    this.ribbonGeometry = createCometGrid(64, 6, -1, 1);
    this.petalGeometry = createCometGrid(16, 8, -1, 1, MAX_PETALS * 2);
    this.quadGeometry = createCometQuad();

    this.craterMaterial = createCraterMaterial();
    this.crater = this._mesh(this.quadGeometry, this.craterMaterial, LAYER.VFX, 2);

    this.harpoonMaterial = createHarpoonMaterial();
    this.harpoon = new Mesh(this.harpoonGeometry, this.harpoonMaterial);
    this.harpoon.layers.set(LAYER.WORLD);
    this.harpoon.visible = false;
    this.harpoon.frustumCulled = false;
    // The group does not update matrices; the harpoon is posed by hand.
    this.harpoon.matrixAutoUpdate = false;
    this.group.add(this.harpoon);

    this.nucleusGeometry = createCometNucleusGeometry();
    this.nucleusMaterial = createIceSolidMaterial('nucleus');
    this.nucleus = new Mesh(this.nucleusGeometry, this.nucleusMaterial);
    this.nucleus.layers.set(LAYER.WORLD);
    this.nucleus.castShadow = true;
    this.nucleus.visible = false;
    this.nucleus.frustumCulled = false;
    this.group.add(this.nucleus);

    this.bladeGeometry = createIceBladeGeometry();
    this.bladeMaterial = createIceSolidMaterial('blade');
    this.blades = new InstancedMesh(this.bladeGeometry, this.bladeMaterial, MAX_BLADES);
    this.blades.instanceMatrix.setUsage(DynamicDrawUsage);
    this.blades.layers.set(LAYER.WORLD);
    this.blades.castShadow = true;
    this.blades.visible = false;
    this.blades.frustumCulled = false;
    this.blades.count = 0;
    this.group.add(this.blades);
    this._nucleusState = { fwd: new Vector3(0, 0, 1), heat: 1, pulse: 0, dissolve: 0, seed: 0 };
    this._bladeState = { heat: 1, pulse: 0, dissolve: 0, seed: 0 };
    this._nucleusAt = new Vector3();
    this._tumbleQ = new Quaternion();

    this.dustTailMaterial = createDustTailMaterial();
    this.dustTail = this._mesh(this.ribbonGeometry, this.dustTailMaterial, LAYER.VFX, 10);
    this.ionTailMaterial = createIonTailMaterial();
    this.ionTail = this._mesh(this.ribbonGeometry, this.ionTailMaterial, LAYER.VFX, 11);
    this.tetherMaterial = createTetherMaterial();
    this.tether = this._mesh(this.ribbonGeometry, this.tetherMaterial, LAYER.VFX, 12);
    this.petalMaterial = createPetalMaterial();
    this.petals = this._mesh(this.petalGeometry, this.petalMaterial, LAYER.VFX, 13);
    this.comaMaterial = createComaMaterial();
    this.coma = this._mesh(this.quadGeometry, this.comaMaterial, LAYER.VFX, 15);
    this.lensMaterial = createCometLensMaterial();
    this.lens = this._mesh(this.quadGeometry, this.lensMaterial, LAYER.DISTORTION, 0);

    this._hand = new Vector3();
    this._tip = new Vector3();
    this._fwd = new Vector3(0, 0, 1);
    this._butt = new Vector3();
    this._strike = new Vector3();
    this._strikeFwd = new Vector3(0, -1, 0);
    this._quiverAxis = new Vector3(1, 0, 0);

    this._harpoonState = { heat: 1, dissolve: 0, total: HARPOON_BUTT, seed: 0 };
    this._comaState = { center: new Vector3(), fwd: new Vector3(), size: 1, intensity: 1, seed: 0 };
    this._lensState = { center: new Vector3(), size: 1, strength: 1, ring: -1 };
    this._ionState = { head: new Vector3(), back: new Vector3(), length: 1, power: 1, flow: 0, seed: 0 };
    this._dustState = { head: new Vector3(), back: new Vector3(), bendDir: new Vector3(), length: 1, power: 1, flow: 0, seed: 0 };
    this._tetherState = { a: new Vector3(), b: new Vector3(), sag: 0.5, wave: 0, waveMul: 1, flow: 0, power: 1, fray: 0, taut: 0, seed: 0 };
    this._petalState = { center: new Vector3(), open: 0, scale: 0, spin: 0, power: 1, dissolve: 0, seed: 0 };
    this._craterState = { center: new Vector3(), grow: 0, heat: 1, fadeT: 0, creep: 0, pulse: 0, seed: 0 };

    this._seed = 0;
    this._roll = 0;
    this._flow = 0;
    this._beads = 0;
    this._wave = 0;
    this._spin = 0;
    this._struck = 0;

    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  _mesh(geometry, material, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;
    this.grains = particles.get('cometharpoon.grains', {
      capacity: 2000,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.grains.uniforms.uSizeIn.value = 0.1;
    this.grains.uniforms.uFadeIn.value = 0.05;
    this.grains.uniforms.uFadeOut.value = 0.5;
    this.grains.uniforms.uEndSize.value = 0.3;
    this.grains.uniforms.uDrag.value = 1.5;
    this.grains.uniforms.uTurbFrequency.value = 0.9;
    this.grains.uniforms.uTurbSpeed.value = 0.6;

    this.sparks = particles.get('cometharpoon.sparks', {
      capacity: 1600,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.55;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.2;

    this.vapor = particles.get('cometharpoon.vapor', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 1.0
    });
    this.vapor.uniforms.uSizeIn.value = 0.2;
    this.vapor.uniforms.uFadeIn.value = 0.12;
    this.vapor.uniforms.uFadeOut.value = 0.55;
    this.vapor.uniforms.uEndSize.value = 2.4;
    this.vapor.uniforms.uDrag.value = 1.1;

    this.grainEmitter = new RateEmitter();
    this.vaporEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    const c = settings[ID];
    return (Math.max(0.05, c.petalOpenTime) + Math.max(0, c.petalHold)) * settings.global.lifetime;
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  /* ------------------------------------------------------------------ */
  /* Flight                                                              */
  /* ------------------------------------------------------------------ */

  _handPoint(out) {
    const c = settings[ID];
    return out.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide).setY(c.handHeight);
  }

  /** Where the tip is at `u` along the throw, and the way it is heading. */
  _flight(u, out, fwd) {
    const c = settings[ID];
    this._handPoint(_a);
    this.pointAt(1, _b);
    _b.y = 0;
    out.lerpVectors(_a, _b, u);
    out.y += c.arcHeight * 4 * u * (1 - u);
    fwd.subVectors(_b, _a).addScaledVector(_up, c.arcHeight * 4 * (1 - 2 * u)).normalize();
    return out;
  }

  /** Place the harpoon mesh: tip at `tip`, pointing `fwd`, rolled, tipped by `quiver`. */
  _poseHarpoon(tip, fwd, quiver) {
    const c = settings[ID];
    const m = this.harpoon;
    _q.setFromUnitVectors(_zAxis, fwd);
    _qRoll.setFromAxisAngle(_zAxis, this._roll);
    m.quaternion.copy(_q).multiply(_qRoll);
    if (quiver !== 0) {
      _qRoll.setFromAxisAngle(this._quiverAxis, quiver);
      m.quaternion.premultiply(_qRoll);
    }
    m.position.copy(tip);
    const s = Math.max(0.05, c.harpoonScale);
    m.scale.set(s, s, s);
    m.updateMatrix();
    m.updateMatrixWorld(true);
    // The eye at the butt, for the tether.
    _a.set(0, 0, -HARPOON_BUTT).applyQuaternion(m.quaternion).multiplyScalar(s);
    this._butt.copy(tip).add(_a);
  }

  /**
   * The nucleus, impaled just behind the broadhead: centred `nucleusOffset`
   * back along the shaft, tumbling slowly about its own axis, scaled by
   * `nucleusSize × shrink`.
   */
  _poseNucleus(tip, fwd, shrink) {
    const c = settings[ID];
    const s = Math.max(0.05, c.harpoonScale);
    const r = Math.max(0.02, c.nucleusSize * s * shrink);
    this._nucleusAt.copy(tip).addScaledVector(fwd, -c.nucleusOffset * s);
    const n = this.nucleus;
    _q.setFromUnitVectors(_zAxis, fwd);
    n.quaternion.copy(_q).multiply(this._tumbleQ);
    n.position.copy(this._nucleusAt);
    n.scale.set(r, r, r);
    n.updateMatrix();
    n.updateMatrixWorld(true);
    this._nucleusState.fwd.copy(fwd);
  }

  /** The lotus of solid ice blades round the strike. */
  _poseBlades(open, scale, sink) {
    const c = settings[ID];
    const g = settings.global;
    const count = Math.max(1, Math.min(MAX_PETALS, Math.round(c.petals)));
    const rows = c.innerPetals >= 0.5 ? 2 : 1;
    const ctr = this._strike;
    let k = 0;
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i < count; i++, k++) {
        const az = (TAU * (i + row * 0.5)) / count + this._spin;
        const tilt = open * c.bladeOpen * (row ? c.bladeInnerOpen : 1) * (1 + c.bladeJitter * Math.sin(i * 7.31 + this._seed));
        const L = c.petalLength * c.bladeLength * g.explosionIntensity * (row ? 0.65 : 1) * scale * (0.9 + 0.2 * Math.abs(Math.sin(i * 3.7 + this._seed)));
        const W = c.bladeWidth * g.explosionIntensity * (row ? 0.8 : 1) * scale;
        if (L <= 0.01) {
          this.blades.setMatrixAt(k, _zero);
          continue;
        }
        _radial.set(Math.cos(az), 0, Math.sin(az));
        // Blade frame: y along the spine (tilted out from vertical), x outward.
        _by.set(0, Math.cos(tilt), 0).addScaledVector(_radial, Math.sin(tilt));
        _bx.copy(_radial).multiplyScalar(Math.cos(tilt)).add(_a.set(0, -Math.sin(tilt), 0));
        _bz.crossVectors(_bx, _by);
        _m.makeBasis(_bx.multiplyScalar(W), _by.multiplyScalar(L), _bz.multiplyScalar(W));
        _pos.copy(ctr).addScaledVector(_radial, c.bladeRoot * (row ? 0.5 : 1));
        _pos.y = -c.bladeSink - sink * L;
        _m.setPosition(_pos);
        this.blades.setMatrixAt(k, _m);
      }
    }
    this.blades.count = k;
    this.blades.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._roll = Math.random() * TAU;
    this._flow = 0;
    this._beads = 0;
    this._wave = 0;
    this._spin = Math.random() * TAU;
    this._struck = 0;
    this.grainEmitter.reset();
    this.vaporEmitter.reset();

    this._harpoonState.seed = this._seed;
    this._harpoonState.heat = 1;
    this._harpoonState.dissolve = 0;
    this._comaState.seed = this._seed;
    this._ionState.seed = this._seed;
    this._dustState.seed = this._seed;
    this._tetherState.seed = this._seed;
    this._tetherState.fray = 0;
    this._tetherState.taut = 0;
    this._petalState.seed = this._seed;
    this._petalState.dissolve = 0;
    this._petalState.scale = 0;
    this._craterState.seed = this._seed;
    this._craterState.grow = 0;
    this._craterState.fadeT = 0;
    this._craterState.creep = 0;
    this._craterState.pulse = 0;
    this._lensState.ring = -1;
    this._nucleusState.seed = this._seed;
    this._nucleusState.dissolve = 0;
    this._nucleusState.pulse = 0;
    this._nucleusState.heat = 1;
    this._bladeState.seed = this._seed;
    this._bladeState.dissolve = 0;
    this._bladeState.pulse = 0;
    this._tumbleQ.identity();
    this.nucleus.visible = true;
    this.blades.visible = false;
    this.blades.count = 0;

    this.harpoon.visible = true;
    this.coma.visible = true;
    this.ionTail.visible = true;
    this.dustTail.visible = true;
    this.tether.visible = true;
    this.lens.visible = true;
    this.petals.visible = false;
    this.crater.visible = false;

    this._flight(0, this._tip, this._fwd);
    this._poseHarpoon(this._tip, this._fwd, 0);
    this._poseNucleus(this._tip, this._fwd, 0.2);
    this._syncFlight(1, 1);
    this._syncAll();
  }

  _advancePhases(dt, rollMul) {
    const c = settings[ID];
    const g = settings.global;
    this._roll += c.rollRate * TAU * rollMul * dt * g.animationSpeed;
    this._flow += c.ionFlow * dt * g.noiseSpeed;
    this._beads += c.tetherFlow * dt * g.animationSpeed;
    this._wave += 7 * dt * g.animationSpeed;
    this._spin += c.petalSpin * dt * g.animationSpeed;
    _qRoll.setFromAxisAngle(_tumble, c.nucleusTumble * dt * g.animationSpeed);
    this._tumbleQ.multiply(_qRoll);
  }

  /** Coma, tails, tether and lens off the harpoon's current pose. */
  _syncFlight(tailPower, comaPower) {
    const c = settings[ID];
    const s = Math.max(0.05, c.harpoonScale);
    // The head: just behind the tip, where the coma sits.
    _pos.copy(this._tip).addScaledVector(this._fwd, -c.nucleusOffset * s);

    const cs = this._comaState;
    cs.center.copy(_pos);
    cs.fwd.copy(this._fwd);
    cs.size = c.comaSize * s;
    cs.intensity = comaPower;

    const ls = this._lensState;
    ls.center.copy(_pos);
    ls.size = c.lensRadius * s;
    ls.strength = comaPower;

    const io = this._ionState;
    io.head.copy(_pos);
    io.back.copy(this._fwd).negate();
    io.length = c.ionLength * tailPower;
    io.power = saturate(tailPower * 2);
    io.flow = this._flow;

    const du = this._dustState;
    du.head.copy(_pos);
    du.back.copy(this._fwd).negate();
    du.bendDir.copy(this.side).multiplyScalar(c.dustSide).addScaledVector(_down, c.dustDrop);
    if (du.bendDir.lengthSq() < 1e-6) du.bendDir.copy(_down);
    du.bendDir.normalize();
    du.length = c.dustLength * tailPower;
    du.power = saturate(tailPower * 2);
    du.flow = this._flow * 0.5;

    const ts = this._tetherState;
    this._handPoint(ts.a);
    ts.b.copy(this._butt);
    ts.wave = this._wave;
    ts.flow = this._beads;
  }

  _syncAll() {
    const c = settings[ID];
    const g = settings.global;
    this.harpoonMaterial.userData.sync(this._harpoonState);
    this.nucleusMaterial.userData.sync(this._nucleusState);
    this.bladeMaterial.userData.sync(this._bladeState);
    this.comaMaterial.userData.sync(this._comaState);
    this.lensMaterial.userData.sync(this._lensState);
    this.ionTailMaterial.userData.sync(this._ionState);
    this.dustTailMaterial.userData.sync(this._dustState);
    this.tetherMaterial.userData.sync(this._tetherState);
    this._petalState.spin = this._spin;
    this.petalMaterial.userData.sync(this._petalState);
    this.craterMaterial.userData.sync(this._craterState);

    this.grains.setGradient(getColor(c.colorGrainA), getColor(c.colorGrainB), getColor(c.colorGrainC), getColor(c.colorGrainD));
    const gr = this.grains.uniforms;
    gr.uGravity.value.set(0, -0.3, 0);
    gr.uSizeScale.value = g.particleSize;
    gr.uLifeScale.value = g.particleLifetime;
    gr.uSpeedScale.value = g.particleSpeed;
    gr.uOpacity.value = g.opacity;
    gr.uGlow.value = c.dustGrainGlow * g.glow;
    gr.uTurbulence.value = 1.0 * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const k = this.sparks.uniforms;
    k.uGravity.value.set(0, -c.sparkGravity, 0);
    k.uStretch.value = c.sparkStretch;
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uGlow.value = c.sparkGlow * g.glow;
    k.uTurbulence.value = 0.2 * g.turbulence;

    this.vapor.setGradient(getColor(c.colorVaporA), getColor(c.colorVaporB), getColor(c.colorVaporC), getColor(c.colorVaporD));
    const v = this.vapor.uniforms;
    v.uGravity.value.set(0, c.vaporLift * 0.4, 0);
    v.uSizeScale.value = g.particleSize;
    v.uLifeScale.value = g.particleLifetime;
    v.uSpeedScale.value = g.particleSpeed;
    v.uOpacity.value = c.vaporOpacity * g.opacity;
    v.uTurbulence.value = 0.6 * g.turbulence;
  }

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.35;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.45;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the throw                                                  */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    this._advancePhases(dt, 1);
    this._flight(this.u, this._tip, this._fwd);
    this._poseHarpoon(this._tip, this._fwd, 0);
    // The comet catches as it leaves the hand.
    const kindle = smoothstep(0, 0.12, this.age);
    this._poseNucleus(this._tip, this._fwd, 0.35 + 0.65 * smoothstep(0, 0.18, this.age));
    this._nucleusState.heat = 1;
    this._syncFlight(kindle, kindle);
    const ts = this._tetherState;
    ts.sag = c.tetherSag * (0.4 + 0.6 * this.u);
    ts.waveMul = 1;
    ts.power = 1;
    this._harpoonState.heat = 1;
    this._syncAll();
    this._flightFx(dt);
    this.position.copy(this._comaState.center);
  }

  /** Grains shed off the dust tail, vapour off the head. */
  _flightFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    const n = Math.round(this.grainEmitter.tick(dt, c.dustRate) * g.particleCount);
    if (n > 0) {
      this._resetEmit(time);
      _emit.size = c.dustGrainSize;
      _emit.life = c.dustGrainLife;
      _emit.speed = c.dustGrainSpeed;
      _emit.spread = 1;
      _emit.radius = 0.1;
      const du = this._dustState;
      for (let i = 0; i < n; i++) {
        const x = Math.random();
        _pos.copy(du.head).addScaledVector(du.back, x * du.length).addScaledVector(du.bendDir, c.dustBend * x * x * du.length);
        if (_pos.y < 0.05) continue;
        _emit.position = _pos;
        _emit.direction = du.bendDir;
        this.grains.emit(1, _emit);
      }
    }
    const puffs = Math.round(this.vaporEmitter.tick(dt, c.vaporRate) * g.particleCount);
    if (puffs > 0) {
      this._resetEmit(time);
      _emit.position = this._comaState.center;
      _emit.radius = 0.15;
      _emit.direction = this._ionState.back;
      _emit.speed = 1.5;
      _emit.spread = 0.5;
      _emit.size = c.vaporSize * 0.6;
      _emit.life = c.vaporLife * 0.6;
      _emit.spin = 0.5;
      this.vapor.emit(puffs, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Impact — drive in, bloom                                            */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._flight(1, this._strike, this._strikeFwd);
    this._strike.y = 0;
    this._quiverAxis.crossVectors(this._strikeFwd, _up);
    if (this._quiverAxis.lengthSq() < 1e-6) this._quiverAxis.copy(this.side);
    this._quiverAxis.normalize();

    this._petalState.center.copy(this._strike).setY(0.02);
    this._craterState.center.copy(this._strike);
    this.petals.visible = true;
    this.crater.visible = true;
    this.blades.visible = true;

    _floor.copy(this._strike);
    this.ctx.bursts.spawn(BurstMode.FROST, _floor, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.6,
      intensity: c.burstIntensity,
      opacity: 0.4,
      fresnel: 2,
      displace: 0.35,
      turbulence: 1.1,
      squash: 0.7,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.55,
      width: 0.06,
      intensity: 1.1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.FROST, _floor, {
      radius: c.craterRadius * 1.1 * power,
      life: this.impactDuration + this.fadeDuration,
      intensity: c.frostDecal,
      colorA: getColor(c.colorIceBody),
      colorB: getColor(c.colorCrack)
    });

    // Ice sparks thrown up and out of the strike.
    this._resetEmit(time);
    _pos.copy(_floor).setY(0.2);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.spread = 1.3;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.6;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    _emit.lifeVariance = 0.5;
    this.sparks.emit(Math.round(c.sparkCount * g.particleCount), _emit);
    _emit.speed = c.dustGrainSpeed * 6;
    _emit.size = c.dustGrainSize * 1.4;
    _emit.life = c.dustGrainLife * 1.2;
    this.grains.emit(Math.round(c.sparkCount * 0.6 * g.particleCount), _emit);
    _emit.speed = c.vaporLift * 2.5;
    _emit.spread = 1;
    _emit.size = c.vaporSize;
    _emit.life = c.vaporLife;
    _emit.spin = 0.6;
    _emit.radius = 0.6;
    this.vapor.emit(Math.round(c.vaporCount * g.particleCount), _emit);

    this._strikeHits();
    this.ctx.shake.add(c.impactShake * power, 1 / Math.max(0.05, c.shakeDuration), 24);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;
  }

  /** Where the tip has been driven to, `k` 0..1 of the way in. */
  _embedded(k, out) {
    const c = settings[ID];
    return out.copy(this._strike).addScaledVector(this._strikeFwd, c.embedDepth * Easing.outCubic(k));
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const ts = this._tetherState;
    const ps = this._petalState;
    const cr = this._craterState;

    if (t <= 1) {
      const tau = (t * this.impactDuration) / Math.max(0.01, g.lifetime);
      this._advancePhases(dt, 0);

      // Driven in, shuddering.
      this._embedded(saturate(tau / 0.06), this._tip);
      this._fwd.copy(this._strikeFwd);
      const quiver = c.quiverAmp * DEG * Math.exp(-tau * c.quiverDecay) * Math.sin(tau * c.quiverFreq);
      this._poseHarpoon(this._tip, this._fwd, quiver);
      this._poseNucleus(this._tip, this._fwd, 1 - c.nucleusSquash * Math.exp(-tau * 8) * Math.sin(Math.min(Math.PI, tau * 20)));
      this._nucleusState.heat = 1;
      this._nucleusState.pulse = smoothstep(0.1, 0.5, tau);

      // The tails collapse into the strike; the coma flares and goes out.
      const shrink = 1 - Easing.outCubic(saturate(tau / Math.max(0.02, c.tailShrink)));
      const flare = c.comaFlare * Math.exp(-tau * 6) + shrink * 0.5;
      this._syncFlight(shrink, flare);
      this._comaState.size *= 1 + (1 - shrink) * 0.8;
      this.ionTail.visible = shrink > 0.01;
      this.dustTail.visible = shrink > 0.01;
      this.coma.visible = flare > 0.02;

      // The pressure ring.
      const rT = Math.max(0.05, c.ringTime);
      const ring = saturate(tau / rT);
      const ls = this._lensState;
      ls.center.copy(this._strike).setY(0.6);
      ls.size = c.ringRadius * g.explosionIntensity;
      ls.ring = ring < 1 ? Easing.outCubic(ring) : -1;
      ls.strength = ring < 1 ? 1 : 0;
      this.lens.visible = ring < 1;

      // The tether snaps taut, overshooting, then rests.
      const snap = saturate(tau / Math.max(0.02, c.tetherSnap));
      ts.sag = c.tetherSag * 0.4 * (1 - Easing.outBack(snap)) ;
      ts.waveMul = Math.exp(-tau * 10) * 3;
      ts.taut = Math.exp(-tau * 7) * 1.5;
      ts.power = 1;
      ts.fray = 0;

      // The bloom opens.
      const open = saturate(tau / Math.max(0.05, c.petalOpenTime));
      ps.open = lerp(c.petalClosed, c.petalOpen, Easing.outBack(open)) * DEG;
      ps.scale = Easing.outCubic(saturate(open * 1.6));
      ps.power = 1;
      ps.dissolve = 0;
      cr.grow = Easing.outCubic(saturate(tau / Math.max(0.02, c.crackGrowTime)));
      cr.heat = 1;
      cr.creep = saturate(tau / Math.max(0.1, this.impactDuration / Math.max(0.01, g.lifetime)));
      cr.pulse = smoothstep(c.crackGrowTime, c.crackGrowTime + 0.2, tau);
      this._harpoonState.heat = 1;
      // The blades heave up just behind the petals and breathe while they hold.
      const bk = saturate((tau - c.bladeDelay) / Math.max(0.05, c.bladeGrowTime));
      const breathe = 1 + c.bladeBreathe * Math.sin(tau * c.bladeBreatheRate) * smoothstep(0.6, 1, bk);
      this._poseBlades(ps.open * breathe, bk <= 0 ? 0 : Easing.outBack(bk), 0);
      const bs = this._bladeState;
      bs.heat = 1;
      bs.pulse = smoothstep(0.5, 1, bk);
      bs.dissolve = 0;

      this._syncAll();
      this._petalFx(dt, 1);
      this.position.copy(this._strike).setY(1.0);
      return;
    }

    /* the fade: petals dissolve, tether frays, harpoon dissolves, crater cools */
    const ft = saturate(t - 1);
    this._advancePhases(dt, 0);
    this._embedded(1, this._tip);
    this._poseHarpoon(this._tip, this._strikeFwd, 0);
    this._syncFlight(0, 0);
    this.ionTail.visible = false;
    this.dustTail.visible = false;
    this.coma.visible = false;
    this.lens.visible = false;
    ts.sag = 0;
    ts.waveMul = 0;
    ts.taut = 0;
    ts.fray = smoothstep(0, Math.max(0.05, c.frayTime), ft);
    this.tether.visible = ts.fray < 1;
    ps.open = c.petalOpen * DEG * (1 + 0.15 * ft);
    ps.scale = 1;
    ps.dissolve = smoothstep(0, 0.75, ft);
    this.petals.visible = ps.dissolve < 1;
    // The blades melt from their tips and sink; the nucleus sublimates.
    this._poseBlades(c.petalOpen * DEG * (1 + 0.15 * ft), 1, smoothstep(0.4, 1, ft) * 0.35);
    const bs = this._bladeState;
    bs.heat = 1 - ft * 0.7;
    bs.pulse = 1 - ft;
    bs.dissolve = smoothstep(0.1, 0.95, ft);
    this.blades.visible = bs.dissolve < 1;
    const ns = this._nucleusState;
    ns.heat = 1 - ft * 0.6;
    ns.pulse = 1;
    ns.dissolve = smoothstep(0.25, 1, ft);
    this._poseNucleus(this._tip, this._strikeFwd, 1 - 0.35 * ft);
    this.nucleus.visible = ns.dissolve < 1;
    cr.creep = 1 + ft * 0.3;
    cr.pulse = 1 - ft;
    const hs = this._harpoonState;
    hs.heat = 1 - ft;
    hs.dissolve = smoothstep(0.5, 1, ft);
    this.harpoon.visible = hs.dissolve < 1;
    cr.heat = Math.pow(1 - ft, 1 / Math.max(0.1, c.coolCurve));
    cr.fadeT = smoothstep(0.4, 1, ft);
    this._syncAll();
    if (ps.dissolve < 1) this._petalFx(dt, 1 - ps.dissolve);
    this._sublimate(dt, 1 - ns.dissolve);
    this.position.copy(this._strike).setY(0.8);
  }

  /** Vapour boiling off the embedded nucleus as it sublimates. */
  _sublimate(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    if (strength <= 0) return;
    const n = Math.round(this.vaporEmitter.tick(dt, c.sublimateRate * strength) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.position = this._nucleusAt;
    _emit.radius = c.nucleusSize * Math.max(0.05, c.harpoonScale) * 0.8;
    _emit.direction = _up;
    _emit.speed = c.vaporLift * 1.4;
    _emit.spread = 0.6;
    _emit.size = c.vaporSize * 0.8;
    _emit.life = c.vaporLife * 0.8;
    _emit.spin = 0.4;
    this.vapor.emit(n, _emit);
  }

  /** Motes of ice-light shed off the petals' rims. */
  _petalFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.grainEmitter.tick(dt, c.dustRate * 0.6 * strength) * g.particleCount);
    if (n <= 0) return;
    const ps = this._petalState;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.dustGrainSize;
    _emit.life = c.dustGrainLife;
    _emit.speed = c.dustGrainSpeed;
    _emit.spread = 1;
    _emit.radius = 0.1;
    _emit.direction = _up;
    const count = Math.max(1, Math.round(c.petals));
    const L = c.petalLength * g.explosionIntensity * ps.scale;
    for (let i = 0; i < n; i++) {
      const az = (Math.floor(Math.random() * count) / count) * TAU + ps.spin;
      const u = 0.5 + 0.5 * Math.random();
      const r = Math.sin(ps.open) * u * L + c.petalCurl * L * u * u * Math.cos(ps.open);
      _pos.set(ps.center.x + Math.cos(az) * r, ps.center.y + Math.cos(ps.open) * u * L, ps.center.z + Math.sin(az) * r);
      _emit.position = _pos;
      this.grains.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Hits                                                                */
  /* ------------------------------------------------------------------ */

  _strikeHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = Math.max(c.bloomRadius, c.impaleRadius);
    const found = field.findTargets(this._strike.x, this._strike.z, R, this._found);
    // `findTargets` is nearest first: the first within reach is harpooned.
    let impaled = false;
    for (const dummy of found) {
      const dx = dummy.position.x - this._strike.x;
      const dz = dummy.position.z - this._strike.z;
      const d = Math.hypot(dx, dz);
      if (!impaled && d <= c.impaleRadius) {
        // Yanked back down the tether toward the caster.
        _dir.copy(this.direction).negate();
        this._force.impulse = c.yankImpulse * power;
        this._force.lift = c.yankLift * power;
        this._force.spin = c.hitSpin;
        if (dummy.kill(_dir.x, _dir.z, this._force)) {
          impaled = true;
          this._struck++;
          this._hitFx(dummy.position, _dir);
        }
        continue;
      }
      if (d > c.bloomRadius) continue;
      if (d > 1e-3) _dir.set(dx / d, 0, dz / d);
      else _dir.copy(this.direction);
      const close = 1 - saturate(d / Math.max(0.1, c.bloomRadius));
      this._force.impulse = c.hitImpulse * (0.5 + 0.5 * close) * power;
      this._force.lift = c.hitLift * (0.5 + 0.5 * close) * power;
      this._force.spin = c.hitSpin;
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._struck++;
      this._hitFx(dummy.position, _dir);
    }
  }

  _hitFx(at, dir) {
    const c = settings[ID];
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.copy(at).setY(1.0);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = dir;
    _emit.speed = c.sparkSpeed * 0.6;
    _emit.spread = 0.8;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    this.sparks.emit(Math.round(28 * g.particleCount), _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.harpoon.visible = false;
    this.coma.visible = false;
    this.lens.visible = false;
    this.ionTail.visible = false;
    this.dustTail.visible = false;
    this.tether.visible = false;
    this.petals.visible = false;
    this.crater.visible = false;
    this.nucleus.visible = false;
    this.blades.visible = false;
    this.blades.count = 0;
  }

  dispose() {
    this.harpoonGeometry.dispose();
    this.ribbonGeometry.dispose();
    this.petalGeometry.dispose();
    this.quadGeometry.dispose();
    this.harpoonMaterial.dispose();
    this.comaMaterial.dispose();
    this.lensMaterial.dispose();
    this.ionTailMaterial.dispose();
    this.dustTailMaterial.dispose();
    this.tetherMaterial.dispose();
    this.petalMaterial.dispose();
    this.craterMaterial.dispose();
    this.nucleusGeometry.dispose();
    this.nucleusMaterial.dispose();
    this.bladeGeometry.dispose();
    this.bladeMaterial.dispose();
    this.blades.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('☄  Comet Harpoon');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'flight speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'bloom fades over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');

  const thr = folder.addFolder('1 · The throw');
  R(thr, c, 'handForward', -1, 2, 0.01, 'leaves in front (m)');
  R(thr, c, 'handSide', -1, 1, 0.01, 'to the right (m)');
  R(thr, c, 'handHeight', 0.2, 3, 0.01, 'height (m)');
  R(thr, c, 'arcHeight', 0, 6, 0.01, 'arc (m)');
  R(thr, c, 'embedDepth', 0, 2, 0.01, 'drives in (m)');
  R(thr, c, 'harpoonScale', 0.2, 3, 0.01, 'harpoon scale');
  R(thr, c, 'rollRate', -6, 6, 0.01, 'roll (rev/s)');
  R(thr, c, 'quiverAmp', 0, 20, 0.1, 'shudder (°)');
  R(thr, c, 'quiverFreq', 1, 80, 0.5, 'shudder rate');
  R(thr, c, 'quiverDecay', 0.5, 30, 0.1, 'shudder dies');

  const hp = folder.addFolder('2 · The harpoon');
  R(hp, c, 'harpoonGlow', 0, 4, 0.01, 'brightness');
  R(hp, c, 'headGlow', 0, 15, 0.05, 'head glow');
  R(hp, c, 'veinGlow', 0, 8, 0.05, 'ice seams');
  R(hp, c, 'veinScale', 0.5, 20, 0.1, 'seam scale');
  R(hp, c, 'harpoonFresnel', 0, 5, 0.01, 'rim');
  R(hp, c, 'dissolveEdge', 0.005, 0.3, 0.005, 'dissolve edge');
  hp.addColor(c, 'colorHarpoonBody').name('body');
  hp.addColor(c, 'colorHarpoonIce').name('ice');
  hp.addColor(c, 'colorHarpoonHead').name('head');
  hp.addColor(c, 'colorHarpoonGold').name('barbs & eye');

  const ice = folder.addFolder('2b · The nucleus & the ice blades');
  R(ice, c, 'nucleusSize', 0.05, 2, 0.01, 'nucleus radius (m)');
  R(ice, c, 'nucleusOffset', 0, 2, 0.01, 'behind the tip (m)');
  R(ice, c, 'nucleusTumble', -6, 6, 0.01, 'tumbles (rad/s)');
  R(ice, c, 'nucleusSquash', 0, 0.6, 0.01, 'squash at the strike');
  R(ice, c, 'nucleusSeamScale', 0.2, 10, 0.05, 'nucleus seam scale');
  R(ice, c, 'nucleusSeamGlow', 0, 6, 0.05, 'nucleus seam glow');
  R(ice, c, 'sublimateRate', 0, 120, 1, 'vapour off it (/s)');
  R(ice, c, 'bladeLength', 0.1, 2, 0.01, 'blade length (× petal length)');
  R(ice, c, 'bladeWidth', 0.02, 1, 0.005, 'blade half-width (m)');
  R(ice, c, 'bladeRoot', 0, 2, 0.01, 'rooted out from the strike (m)');
  R(ice, c, 'bladeSink', 0, 1, 0.01, 'root below the floor (m)');
  R(ice, c, 'bladeOpen', 0, 1.5, 0.01, 'blades open (× petal angle)');
  R(ice, c, 'bladeInnerOpen', 0, 1.5, 0.01, 'inner row opens (×)');
  R(ice, c, 'bladeJitter', 0, 0.5, 0.01, 'tilt jitter');
  R(ice, c, 'bladeDelay', 0, 1, 0.01, 'heave up after (s)');
  R(ice, c, 'bladeGrowTime', 0.05, 1.5, 0.01, 'heave up over (s)');
  R(ice, c, 'bladeBreathe', 0, 0.5, 0.005, 'breathe (± open)');
  R(ice, c, 'bladeBreatheRate', 0, 12, 0.05, 'breath rate (rad/s)');
  R(ice, c, 'bladeSeamScale', 0.2, 10, 0.05, 'blade seam scale');
  R(ice, c, 'bladeSeamGlow', 0, 6, 0.05, 'blade seam glow');
  R(ice, c, 'iceFresnel', 0, 4, 0.01, 'ice rim');
  R(ice, c, 'iceSpecular', 0, 4, 0.01, 'ice specular');
  R(ice, c, 'iceAmbient', 0, 1, 0.01, 'ice ambient');
  ice.addColor(c, 'colorIceCore').name('ice core (hot)');
  ice.addColor(c, 'colorIceTint').name('ice tint');
  ice.addColor(c, 'colorIceBody').name('ice body');
  ice.addColor(c, 'colorIceDeep').name('ice deep');

  const coma = folder.addFolder('3 · The coma');
  R(coma, c, 'comaSize', 0.1, 5, 0.01, 'radius (m)');
  R(coma, c, 'comaGlow', 0, 12, 0.05, 'glow');
  R(coma, c, 'comaHood', 0, 1, 0.01, 'hood');
  R(coma, c, 'comaJets', 1, 16, 1, 'jets');
  R(coma, c, 'comaFlare', 0, 8, 0.05, 'flare at the strike');
  coma.addColor(c, 'colorComaCore').name('core');
  coma.addColor(c, 'colorComaHalo').name('halo');

  const tails = folder.addFolder('4 · The tails');
  R(tails, c, 'ionLength', 0, 20, 0.05, 'ion length (m)');
  R(tails, c, 'ionWidth', 0.01, 3, 0.01, 'ion width (m)');
  R(tails, c, 'ionGlow', 0, 10, 0.05, 'ion glow');
  R(tails, c, 'ionStreamers', 1, 20, 0.5, 'streamers');
  R(tails, c, 'ionFlow', 0, 40, 0.1, 'ion flow');
  tails.addColor(c, 'colorIonA').name('ion core');
  tails.addColor(c, 'colorIonB').name('ion');
  R(tails, c, 'dustLength', 0, 15, 0.05, 'dust length (m)');
  R(tails, c, 'dustWidth', 0.05, 5, 0.01, 'dust width (m)');
  R(tails, c, 'dustBend', -2, 2, 0.01, 'dust curve');
  R(tails, c, 'dustSide', -1, 1, 0.01, 'curves toward (−L / +R)');
  R(tails, c, 'dustDrop', -1, 2, 0.01, 'curve sag');
  R(tails, c, 'dustGlow', 0, 8, 0.05, 'dust glow');
  R(tails, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  tails.addColor(c, 'colorDustTailA').name('dust bright');
  tails.addColor(c, 'colorDustTailB').name('dust');
  R(tails, c, 'tailShrink', 0.02, 2, 0.01, 'collapse at strike (s)');

  const teth = folder.addFolder('5 · The tether');
  R(teth, c, 'tetherWidth', 0.005, 0.3, 0.001, 'width (m)');
  R(teth, c, 'tetherGlow', 0, 10, 0.05, 'glow');
  R(teth, c, 'tetherSag', 0, 4, 0.01, 'sag (m)');
  R(teth, c, 'tetherWave', 0, 1, 0.005, 'ripple (m)');
  R(teth, c, 'tetherWaveLength', 0.2, 10, 0.05, 'ripple length (m)');
  R(teth, c, 'tetherBeads', 0, 8, 0.05, 'beads per metre');
  R(teth, c, 'tetherFlow', 0, 20, 0.05, 'bead flow');
  R(teth, c, 'tetherSnap', 0.02, 1, 0.005, 'goes taut over (s)');
  R(teth, c, 'frayTime', 0.05, 1, 0.01, 'frays over (share of fade)');
  teth.addColor(c, 'colorTether').name('tether');
  teth.addColor(c, 'colorTetherBead').name('beads');

  const bloom = folder.addFolder('6 · The bloom');
  R(bloom, c, 'petals', 1, MAX_PETALS, 1, 'petals per row');
  R(bloom, c, 'innerPetals', 0, 1, 1, 'inner row (0/1)');
  R(bloom, c, 'petalLength', 0.1, 6, 0.01, 'length (m)');
  R(bloom, c, 'petalWidth', 0.05, 3, 0.01, 'width (m)');
  R(bloom, c, 'petalOpenTime', 0.05, 2, 0.01, 'opens over (s)');
  R(bloom, c, 'petalHold', 0, 3, 0.01, 'stays open (s)');
  R(bloom, c, 'petalClosed', 0, 90, 0.5, 'bud angle (°)');
  R(bloom, c, 'petalOpen', 0, 120, 0.5, 'open angle (°)');
  R(bloom, c, 'petalCurl', -1, 1.5, 0.01, 'tip curl');
  R(bloom, c, 'petalCup', -1, 1, 0.01, 'cup');
  R(bloom, c, 'petalTwist', -3, 3, 0.01, 'twist (rad)');
  R(bloom, c, 'petalSpin', -3, 3, 0.01, 'turn (rad/s)');
  R(bloom, c, 'petalGlow', 0, 10, 0.05, 'glow');
  R(bloom, c, 'petalVeinGlow', 0, 10, 0.05, 'vein glow');
  R(bloom, c, 'petalSoftFade', 0.01, 1, 0.01, 'soft floor (m)');
  bloom.addColor(c, 'colorPetalA').name('white');
  bloom.addColor(c, 'colorPetalB').name('ice');
  bloom.addColor(c, 'colorPetalC').name('deep');
  bloom.addColor(c, 'colorPetalVein').name('veins');

  const crater = folder.addFolder('7 · The crater');
  R(crater, c, 'craterRadius', 0.2, 10, 0.05, 'radius (m)');
  R(crater, c, 'crackCount', 1, 40, 1, 'cracks');
  R(crater, c, 'crackGrowTime', 0.02, 2, 0.01, 'cracks race out over (s)');
  R(crater, c, 'crackGlow', 0, 10, 0.05, 'crack glow');
  R(crater, c, 'craterRingGlow', 0, 10, 0.05, 'ring glow');
  R(crater, c, 'coolCurve', 0.1, 5, 0.01, 'holds glow');
  R(crater, c, 'frostDecal', 0, 1.5, 0.01, 'frost decal');
  R(crater, c, 'frostCreep', 0, 2, 0.01, 'frost creeps out (× radius)');
  R(crater, c, 'crackPulse', 0, 2, 0.01, 'light runs along cracks');
  crater.addColor(c, 'colorCrackHot').name('crack hot');
  crater.addColor(c, 'colorCrack').name('crack');
  crater.addColor(c, 'colorCraterRing').name('ring');
  crater.addColor(c, 'colorCraterChar').name('pit');

  const fx = folder.addFolder('8 · Particles');
  R(fx, c, 'dustRate', 0, 800, 1, 'grains/second');
  R(fx, c, 'dustGrainSize', 0.005, 0.3, 0.001, 'grain size');
  R(fx, c, 'dustGrainSpeed', 0, 6, 0.05, 'grain speed');
  R(fx, c, 'dustGrainLife', 0.1, 5, 0.05, 'grain lifetime');
  R(fx, c, 'dustGrainGlow', 0, 10, 0.05, 'grain glow');
  Editor.gradient(fx, c, 'colorGrain', 'grain gradient');
  R(fx, c, 'sparkCount', 0, 600, 1, 'sparks at the strike');
  R(fx, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark size');
  R(fx, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(fx, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGravity', -10, 30, 0.1, 'spark gravity');
  R(fx, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  Editor.gradient(fx, c, 'colorSpark', 'spark gradient');
  R(fx, c, 'vaporRate', 0, 200, 1, 'vapour/second in flight');
  R(fx, c, 'vaporCount', 0, 120, 1, 'plume at the strike');
  R(fx, c, 'vaporSize', 0.05, 3, 0.01, 'vapour size');
  R(fx, c, 'vaporLift', 0, 5, 0.01, 'vapour rise');
  R(fx, c, 'vaporLife', 0.1, 6, 0.05, 'vapour lifetime');
  R(fx, c, 'vaporOpacity', 0, 1, 0.01, 'vapour opacity');
  Editor.gradient(fx, c, 'colorVapor', 'vapour gradient');

  const strike = folder.addFolder('9 · The strike');
  R(strike, c, 'burstSize', 0, 10, 0.05, 'frost shell (m)');
  R(strike, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(strike, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(strike, c, 'lensRadius', 0.1, 5, 0.01, 'head shimmer (m)');
  R(strike, c, 'lensStrength', 0, 3, 0.01, 'distortion');
  R(strike, c, 'ringRadius', 0.2, 12, 0.05, 'pressure ring (m)');
  R(strike, c, 'ringTime', 0.05, 2, 0.01, 'ring opens over (s)');
  R(strike, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(strike, c, 'impactShake', 0, 1.5, 0.01, 'camera knock');
  R(strike, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(strike, c, 'impactLight', 0, 8, 0.01, 'light punch (× intensity)');
  strike.addColor(c, 'colorBurstA').name('shell inner');
  strike.addColor(c, 'colorBurstB').name('shell mid');
  strike.addColor(c, 'colorBurstC').name('shell outer');
  strike.addColor(c, 'colorShockA').name('shockwave');
  strike.addColor(c, 'colorShockB').name('shockwave hot');
  strike.addColor(c, 'colorFlash').name('flash');

  const hits = folder.addFolder('10 · Hits');
  R(hits, c, 'impaleRadius', 0, 4, 0.01, 'harpoons within (m)');
  R(hits, c, 'yankImpulse', 0, 40, 0.1, 'yank (m/s)');
  R(hits, c, 'yankLift', 0, 15, 0.05, 'yank lift (m/s)');
  R(hits, c, 'bloomRadius', 0, 10, 0.05, 'bloom throws within (m)');
  R(hits, c, 'hitImpulse', 0, 25, 0.1, 'thrown (m/s)');
  R(hits, c, 'hitLift', 0, 15, 0.05, 'lift (m/s)');
  R(hits, c, 'hitSpin', 0, 6, 0.01, 'tumble');

  folder.close();
  return folder;
}
