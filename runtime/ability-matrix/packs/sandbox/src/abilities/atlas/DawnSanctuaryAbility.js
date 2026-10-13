import {
  CylinderGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  MAX_WAVES,
  createSanctuaryCurtainMaterial,
  createSanctuaryFloorMaterial,
  createSanctuaryHazeMaterial,
  createSanctuaryOrbMaterial,
  createSanctuaryPetalMaterial,
  createSanctuaryPodMaterial
} from '../../materials/atlas/DawnSanctuaryMaterials.js';
import { createPetalBlankGeometry, createSeedPodGeometry } from '../../assets/atlas/DawnSanctuaryGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'sanctuary';

const TAU = Math.PI * 2;

/** Petal rings, and petals per ring. The editor's sliders clamp to these. */
const MAX_LAYERS = 3;
const MAX_PER_RING = 16;
const MAX_PETALS = MAX_LAYERS * MAX_PER_RING;
/** Fallen bodies a cast can be standing back up at once. */
const MAX_REVIVE = 8;

const _emit = {};
const _centre = new Vector3();
const _pos = new Vector3();
const _dir = new Vector3();
const _hand = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);
const _identity = new Matrix4();

/**
 * DAWN SANCTUARY — a support zone that never wounds.
 *
 * A bead of dawn light leaves the hand on a shallow arc. Where it lands a
 * **mechanical lotus** rises out of the floor, a closed brass bud on a seed
 * pod, and unfolds ring by ring, outer petals first. Under it a **living
 * floor** spreads to the edge of the circle. Then, at a steady beat, the lotus
 * breathes out **healing waves**: each one is a pulse that runs out along
 * every petal from hinge to tip, lifts the petals, and leaves them as a ring of
 * green-gold light that crosses the floor's petal lattice, lighting it as it
 * goes, with a curtain of rising light streaks standing at its front. When its
 * time is up the lotus folds shut and sinks back into the floor.
 *
 * Layers:
 *
 *   1. **the lotus** — up to three rings of instanced petals, every petal a
 *      row of brass plates and panes of light, shaped and unfolded entirely in
 *      the vertex stage from a parameter-space blank (see
 *      `DawnSanctuaryGeometry`); a pierced brass seed pod at the hub; and a
 *      camera-facing **dawn orb** over it with turning rays (the same mesh is
 *      the bead in flight).
 *   2. **the floor** — a ground shader: two counter-turning log spirals that
 *      tile the circle with petal-shaped cells, ridged light veins with light
 *      flowing outward along them, a ragged growing edge and a ticked rim.
 *   3. **the waves** — up to `MAX_WAVES` at once, each lighting a band of the
 *      floor's lattice and standing an open cylinder of climbing light streaks
 *      at its front, with a RIPPLE decal, a light punch and a soft flash.
 *   4. **motes, shed petals and sparkle** — soft motes rising off the floor
 *      while it stands, LEAF petals of light shed from the lotus on each wave,
 *      STREAK sparkle rising along every wave front and trailing the bead.
 *   5. **the haze** — a gentle LAYER.DISTORTION shimmer over the lotus, with a
 *      soft ring pushed outward as each wave leaves.
 *
 * ## The bodies
 *
 * It is a support spell: `handlesOwnHits` is true only so the field's default
 * zone disc does not fell anything standing in it. Nothing is killed.
 *
 * A body that is **down** inside the sanctuary (`dead` or `burning`, not yet
 * `gone`) is stood back up when a healing wave reaches where it lies: after
 * `reviveDelay` seconds of a column of light rising over it, it is handed to
 * `Dummy#place(x, z, yaw)`. That is the public call `DummyField` itself uses to
 * stand a body up — it drops any cut-off half, clears the ragdoll, restores
 * the rest pose, resets every dissolve and stain clock and restarts the idle
 * clip — so it is the one safe way to do it. The body is stood on the spot its
 * hips came to rest (kept inside the circle), facing the caster, and the field
 * carries on with it as a live target. `revive` turns it off.
 *
 * ## The editor rule
 *
 * Records hold clocks and dice only — when each wave left, its seed, which
 * bodies are rising and since when. Petal size, pitch, curl, the lattice, the
 * waves' speed and reach and every colour are read from `settings.sanctuary`
 * every frame.
 */
export class DawnSanctuaryAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let n = this.petals.count;
    for (const curtain of this.curtains) if (curtain.visible) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the lotus ---- */
    this.petalGeometry = createPetalBlankGeometry(28, 8);
    this.petalAttr = new InstancedBufferAttribute(new Float32Array(MAX_PETALS * 4), 4);
    this.petalGeometry.setAttribute('aPetal', this.petalAttr);
    this.petalMaterial = createSanctuaryPetalMaterial();
    this.petals = new InstancedMesh(this.petalGeometry, this.petalMaterial, MAX_PETALS);
    this.petals.name = 'SanctuaryPetals';
    // Opaque, but on VFX: the petals are placed in the vertex stage and the
    // WORLD depth prepass would rasterise the raw parameter blank instead.
    this.petals.layers.set(LAYER.VFX);
    this.petals.renderOrder = 3;
    this.petals.frustumCulled = false;
    this.petals.matrixAutoUpdate = true;
    for (let i = 0; i < MAX_PETALS; i++) this.petals.setMatrixAt(i, _identity);
    this.petals.count = 0;
    this.petals.visible = false;
    this.group.add(this.petals);

    this.podGeometry = createSeedPodGeometry(48);
    this.podMaterial = createSanctuaryPodMaterial();
    this.pod = new Mesh(this.podGeometry, this.podMaterial);
    this.pod.name = 'SanctuaryPod';
    this.pod.layers.set(LAYER.VFX);
    this.pod.renderOrder = 3;
    this.pod.frustumCulled = false;
    this.pod.visible = false;
    this.group.add(this.pod);

    this.orbGeometry = new PlaneGeometry(1, 1);
    this.orbMaterial = createSanctuaryOrbMaterial();
    this.orb = new Mesh(this.orbGeometry, this.orbMaterial);
    this.orb.name = 'SanctuaryOrb';
    this.orb.layers.set(LAYER.VFX);
    this.orb.renderOrder = 14;
    this.orb.frustumCulled = false;
    this.orb.visible = false;
    this.group.add(this.orb);

    /* ---- layer 2: the floor ---- */
    this.floorGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.floorMaterial = createSanctuaryFloorMaterial();
    this.floor = new Mesh(this.floorGeometry, this.floorMaterial);
    this.floor.name = 'SanctuaryFloor';
    this.floor.layers.set(LAYER.VFX);
    this.floor.renderOrder = 5;
    this.floor.frustumCulled = false;
    this.floor.visible = false;
    this.group.add(this.floor);
    /** The floor's wave slots, written straight into its uniform. */
    this._floorWaves = this.floorMaterial.uniforms.uWaves.value;

    /* ---- layer 3: the wave curtains ---- */
    // Unit open cylinder standing on y = 0; scaled to (radius, height, radius).
    this.curtainGeometry = new CylinderGeometry(1, 1, 1, 96, 1, true).translate(0, 0.5, 0);
    this.curtains = [];
    this.curtainMaterials = [];
    for (let i = 0; i < MAX_WAVES; i++) {
      const material = createSanctuaryCurtainMaterial();
      const mesh = new Mesh(this.curtainGeometry, material);
      mesh.name = `SanctuaryCurtain${i}`;
      mesh.layers.set(LAYER.VFX);
      mesh.renderOrder = 12;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      this.curtains.push(mesh);
      this.curtainMaterials.push(material);
    }

    /* ---- layer 5: the haze ---- */
    this.hazeGeometry = new PlaneGeometry(1, 1);
    this.hazeMaterial = createSanctuaryHazeMaterial();
    this.haze = new Mesh(this.hazeGeometry, this.hazeMaterial);
    this.haze.name = 'SanctuaryHaze';
    this.haze.layers.set(LAYER.DISTORTION);
    this.haze.frustumCulled = false;
    this.haze.visible = false;
    this.group.add(this.haze);

    /* ---- per-cast records ---- */
    /** Waves: when each left, its dice, and its sparkle accumulator. */
    this._waves = [];
    for (let i = 0; i < MAX_WAVES; i++) this._waves.push({ active: false, age: 0, seed: 0, acc: 0, radius: 0 });
    /** Bodies rising: who, since when, and where it will stand. */
    this._revive = [];
    for (let i = 0; i < MAX_REVIVE; i++) this._revive.push({ dummy: null, time: 0, x: 0, z: 0 });
    this._reviveCount = 0;
    this._found = [];

    this._seed = 0;
    /** Seconds since the bead landed. -1 while it is still in flight. */
    this._landed = -1;
    this._wavesLaunched = 0;
    this._spin = 0;
    /** Age of the most recent wave, for the petal pulse and the haze ring. */
    this._lastWave = -1;
    this._petalCount = 0;
    /** Ring layout last written into `aPetal`, so it is only rewritten on change. */
    this._layout = new Int32Array(MAX_LAYERS + 1).fill(-1);

    this._petalState = {
      len: [1, 1, 1],
      pitch: [1.7, 1.7, 1.7],
      spin: [0, 0, 0],
      hinge: [0, 0, 0],
      hubRadius: 0.2,
      breathe: 0,
      lift: 0,
      pulse: 0,
      pulseFront: 0,
      lightFade: 1
    };
    this._podState = { pulse: 0, lightFade: 1 };
    this._orbState = { size: 0.3, rays: 0, fade: 1, pulse: 0 };
    this._floorState = { quadSize: 8, radius: 3, spread: 0, fade: 1, seed: 0 };
    this._curtainState = { strength: 0, seed: 0 };
    this._hazeState = { size: 4, strength: 0, pulse: 0, pulseAt: 0, seed: 0 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Soft motes rising off the living floor.
    this.motes = particles.get('sanctuary.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.35
    });
    this.motes.uniforms.uDrag.value = 0.9;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uSizeIn.value = 0.2;
    this.motes.uniforms.uFadeIn.value = 0.2;
    this.motes.uniforms.uFadeOut.value = 0.45;

    // Petals of light shed by the lotus on each wave, drifting down and out.
    this.shed = particles.get('sanctuary.petals', {
      capacity: 600,
      shape: ParticleShape.LEAF,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.shed.uniforms.uDrag.value = 1.6;
    this.shed.uniforms.uEndSize.value = 0.6;
    this.shed.uniforms.uSizeIn.value = 0.1;
    this.shed.uniforms.uFadeIn.value = 0.08;
    this.shed.uniforms.uFadeOut.value = 0.5;

    // Rising sparkle along every wave front, and the bead's trail.
    this.sparkle = particles.get('sanctuary.sparkle', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparkle.uniforms.uDrag.value = 2.2;
    this.sparkle.uniforms.uEndSize.value = 0.2;
    this.sparkle.uniforms.uSizeIn.value = 0.04;
    this.sparkle.uniforms.uFadeIn.value = 0.05;
    this.sparkle.uniforms.uFadeOut.value = 0.5;
    this.sparkle.uniforms.uStretch.value = 0.06;

    this.moteEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The sanctuary stands for its lifetime... */
  get impactDuration() {
    return Math.max(0.2, settings.sanctuary.lifetime * settings.global.lifetime);
  }

  /** ...and then the lotus folds shut and sinks. */
  get fadeDuration() {
    return Math.max(0.1, settings.sanctuary.closeTime * settings.global.lifetime);
  }

  /** A slow breath that swells with every wave. */
  lightShimmer() {
    const k = settings.sanctuary.lightBreathe;
    const wave = this._lastWave >= 0 ? Math.exp(-this._lastWave * 3) : 0;
    return 1 - k * 0.3 + k * 0.3 * Math.sin(this.age * 1.7) + k * wave * 1.5;
  }

  /* ------------------------------------------------------------------ */
  /* Live dimensions                                                     */
  /* ------------------------------------------------------------------ */

  get floorRadius() {
    return Math.max(0.3, settings.sanctuary.zoneRadius * settings.sanctuary.floorScale);
  }

  get lotusLength() {
    return Math.max(0.1, settings.sanctuary.zoneRadius * settings.sanctuary.lotusScale);
  }

  get waveReach() {
    return Math.max(0.3, settings.sanctuary.zoneRadius * settings.sanctuary.waveReach);
  }

  _floorPoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  /** How many petal rings, and how many petals in ring `i` (0 = outer). */
  _layers() {
    return Math.min(MAX_LAYERS, Math.max(1, Math.round(settings.sanctuary.layers)));
  }

  _petalsIn(i, layers) {
    const c = settings.sanctuary;
    let n;
    if (i === 0) n = c.petalsOuter;
    else if (i === layers - 1) n = c.petalsInner;
    else n = c.petalsMid;
    return Math.min(MAX_PER_RING, Math.max(3, Math.round(n)));
  }

  /** 0..1 how far the lotus has risen out of the floor. */
  _rise() {
    if (this._landed < 0) return 0;
    return Easing.outCubic(saturate(this._landed / Math.max(0.02, settings.sanctuary.riseTime)));
  }

  /** 0..1 how far ring `i` has unfolded (outer first). */
  _ringOpen(i) {
    const c = settings.sanctuary;
    if (this._landed < 0) return 0;
    const start = c.riseTime + c.openDelay + i * c.openStagger;
    return saturate((this._landed - start) / Math.max(0.05, c.openTime));
  }

  /** 0..1 through the closing fade. */
  _closing() {
    return this.phase === AbilityPhase.FADE ? saturate(this.fadeTime / this.fadeDuration) : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._landed = -1;
    this._wavesLaunched = 0;
    this._spin = Math.random() * TAU;
    this._lastWave = -1;
    for (const wave of this._waves) {
      wave.active = false;
      wave.age = 0;
      wave.acc = 0;
    }
    for (let i = 0; i < MAX_WAVES; i++) this._floorWaves[i].set(0, 0, 0.4, 0);
    this._clearRevive();
    this.moteEmitter.reset();
    this.trailEmitter.reset();

    this.petals.visible = false;
    this.pod.visible = false;
    this.floor.visible = false;
    this.haze.visible = false;
    for (const curtain of this.curtains) curtain.visible = false;
    this._sync(0);
  }

  _clearRevive() {
    for (let i = 0; i < MAX_REVIVE; i++) this._revive[i].dummy = null;
    this._reviveCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* The petals' instance data                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Write `(ring, azimuth, seed, slot)` for every petal. Only when the layout
   * actually changed — a ring count or petal count dragged in the editor —
   * so a standing lotus costs no upload per frame.
   */
  _writeLayout() {
    const layers = this._layers();
    let changed = this._layout[MAX_LAYERS] !== layers;
    for (let i = 0; i < MAX_LAYERS; i++) {
      const n = i < layers ? this._petalsIn(i, layers) : 0;
      if (this._layout[i] !== n) changed = true;
    }
    if (!changed) return;

    const data = this.petalAttr.array;
    let k = 0;
    for (let i = 0; i < layers; i++) {
      const n = this._petalsIn(i, layers);
      this._layout[i] = n;
      // Alternate rings sit half a step round, so each petal shows between two.
      const offset = (i % 2) * (Math.PI / n);
      for (let p = 0; p < n; p++) {
        data[k * 4 + 0] = i;
        data[k * 4 + 1] = (p / n) * TAU + offset;
        data[k * 4 + 2] = ((Math.sin((k + 1) * 12.9898 + this._seed) * 43758.5453) % 1 + 1) % 1;
        data[k * 4 + 3] = p;
        k++;
      }
    }
    for (let i = layers; i < MAX_LAYERS; i++) this._layout[i] = 0;
    this._layout[MAX_LAYERS] = layers;
    this._petalCount = k;
    this.petalAttr.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = settings.sanctuary;
    const g = settings.global;
    const travelling = this.phase === AbilityPhase.TRAVEL;
    const closing = this._closing();
    const lightFade = 1 - Easing.inQuad(closing);
    this._floorPoint(_centre);

    /* ---- the lotus ---- */
    const len = this.lotusLength;
    const hubR = len * c.hubRadius;
    const rise = this._rise();
    const sink = Easing.inQuad(saturate((closing - 0.35) / 0.65));
    const baseY = c.lotusLift - c.riseDepth * (1 - rise) - c.riseDepth * sink;
    const layers = this._layers();
    this._spin += c.spin * g.animationSpeed * dt;

    // The most recent wave's pulse along the petals.
    const lw = this._lastWave;
    const pulse = lw >= 0 ? Math.exp(-lw * 1.6) : 0;
    const pulseFront = lw >= 0 ? saturate(lw / 0.45) : 0;
    const lift = lw >= 0 ? Math.sin(Math.PI * saturate(lw / 0.7)) * c.waveLift : 0;

    const ps = this._petalState;
    for (let i = 0; i < MAX_LAYERS; i++) {
      const f = layers > 1 ? Math.min(i, layers - 1) / (layers - 1) : 0;
      const open = Easing.outBack(this._ringOpen(i)) * (1 - Easing.inOutQuad(closing));
      ps.len[i] = len * lerp(1, c.layerLength, f);
      ps.pitch[i] = lerp(c.closedPitch, lerp(c.openPitchOuter, c.openPitchInner, f), open);
      ps.spin[i] = this._spin * (i % 2 === 1 ? -c.layerCounterSpin : 1);
      ps.hinge[i] = i * c.layerHeight;
    }
    ps.hubRadius = hubR;
    ps.breathe = this._ringOpen(0);
    ps.lift = lift * (1 - closing);
    ps.pulse = pulse;
    ps.pulseFront = pulseFront;
    ps.lightFade = lightFade;
    this.petalMaterial.userData.sync(ps);
    this._writeLayout();
    const lotusShown = !travelling && this._landed >= 0 && baseY > -c.riseDepth * 1.98;
    this.petals.count = lotusShown ? this._petalCount : 0;
    this.petals.visible = lotusShown;
    this.petals.position.set(_centre.x, baseY, _centre.z);

    const podState = this._podState;
    podState.pulse = pulse;
    podState.lightFade = lightFade;
    this.podMaterial.userData.sync(podState);
    const podH = hubR * c.hubHeight * 4;
    this.pod.position.set(_centre.x, baseY + (layers - 1) * c.layerHeight, _centre.z);
    this.pod.scale.set(hubR * 1.08, Math.max(0.01, podH), hubR * 1.08);
    this.pod.rotation.y = this._spin;
    this.pod.visible = lotusShown;

    /* ---- the orb: the bead in flight, the dawn sun once it opens ---- */
    const os = this._orbState;
    if (travelling) {
      this._beadPoint(this.orb.position);
      os.size = c.beadSize;
      os.rays = 0;
      os.fade = 1;
      os.pulse = 0.3;
      this.orb.visible = true;
    } else {
      const open0 = this._ringOpen(0);
      this.orb.position.set(_centre.x, baseY + (layers - 1) * c.layerHeight + podH + c.orbHeight * Easing.outCubic(open0), _centre.z);
      // Shrinks to a point as the lotus lands, then grows back as it opens.
      const landing = this._landed >= 0 ? Math.exp(-this._landed * 6) : 0;
      os.size = c.orbSize * Math.max(Easing.outBack(open0), landing * 0.6) * lightFade;
      os.rays = Easing.outCubic(open0);
      os.fade = lightFade;
      os.pulse = pulse;
      this.orb.visible = os.size > 0.005;
    }
    this.orbMaterial.userData.sync(os);

    /* ---- the floor ---- */
    const floorR = this.floorRadius;
    const fs = this._floorState;
    fs.radius = floorR;
    fs.quadSize = (floorR + c.rimWidth * 4 + c.spreadEdge + 0.2) * 2;
    fs.spread = this._landed >= 0 ? floorR * Easing.outCubic(saturate(this._landed / Math.max(0.05, c.spreadTime))) : 0;
    fs.fade = lightFade;
    fs.seed = this._seed;
    this.floorMaterial.userData.sync(fs);
    this.floor.position.set(_centre.x, c.floorHeight, _centre.z);
    this.floor.scale.set(fs.quadSize, 1, fs.quadSize);
    this.floor.visible = !travelling && fs.spread > 0.001 && lightFade > 0.003;

    /* ---- the waves: floor bands and curtains ---- */
    const reach = this.waveReach;
    for (let i = 0; i < MAX_WAVES; i++) {
      const wave = this._waves[i];
      const curtain = this.curtains[i];
      const slot = this._floorWaves[i];
      if (!wave.active) {
        slot.y = 0;
        curtain.visible = false;
        continue;
      }
      const r = wave.radius;
      const k = saturate(r / reach);
      // In over the first tenth of a second, out over the last third of its run.
      const strength = saturate(wave.age / 0.1) * (1 - Easing.inQuad(saturate((k - 0.66) / 0.34)));
      slot.set(r, strength, c.waveWidth, 0);

      const cs = this._curtainState;
      cs.strength = strength;
      cs.seed = wave.seed;
      this.curtainMaterials[i].userData.sync(cs);
      const h = Math.max(0.02, c.waveHeight * (1 - c.waveHeightFalloff * k));
      curtain.position.set(_centre.x, 0, _centre.z);
      curtain.scale.set(Math.max(0.05, r), h, Math.max(0.05, r));
      curtain.visible = strength > 0.004;
    }

    /* ---- the haze ---- */
    const hs = this._hazeState;
    hs.size = c.zoneRadius * c.hazeReach;
    hs.strength = travelling ? 0 : Easing.outCubic(this._ringOpen(0)) * lightFade;
    hs.pulse = lw >= 0 ? Math.exp(-lw * 2.2) * lightFade : 0;
    hs.pulseAt = lw >= 0 ? saturate((lw * c.waveSpeed) / Math.max(0.1, hs.size)) : 0;
    hs.seed = this._seed;
    this.hazeMaterial.userData.sync(hs);
    this.haze.position.set(_centre.x, Math.max(0.3, baseY + len * 0.4), _centre.z);
    this.haze.visible = hs.strength + hs.pulse > 0.004;

    /* ---- particles ---- */
    this._syncParticles();
  }

  _syncParticles() {
    const c = settings.sanctuary;
    const g = settings.global;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uGravity.value.set(0, c.moteRise, 0);
    this.motes.uniforms.uSizeScale.value = g.particleSize;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = c.moteGlow * g.glow;
    this.motes.uniforms.uTurbulence.value = c.moteTurbulence * g.turbulence;

    this.shed.setGradient(getColor(c.colorShedA), getColor(c.colorShedB), getColor(c.colorShedC), getColor(c.colorShedD));
    this.shed.uniforms.uGravity.value.set(0, -0.35, 0);
    this.shed.uniforms.uSizeScale.value = g.particleSize;
    this.shed.uniforms.uLifeScale.value = g.particleLifetime;
    this.shed.uniforms.uSpeedScale.value = g.particleSpeed;
    this.shed.uniforms.uOpacity.value = g.opacity;
    this.shed.uniforms.uGlow.value = g.glow;
    this.shed.uniforms.uTurbulence.value = 0.8 * g.turbulence;

    this.sparkle.setGradient(getColor(c.colorSparkleA), getColor(c.colorSparkleB), getColor(c.colorSparkleC), getColor(c.colorSparkleD));
    this.sparkle.uniforms.uGravity.value.set(0, 1.2, 0);
    this.sparkle.uniforms.uSizeScale.value = g.particleSize;
    this.sparkle.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparkle.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparkle.uniforms.uOpacity.value = g.opacity;
    this.sparkle.uniforms.uGlow.value = g.glow;
  }

  /** The bead's place on its arc from the hand to the circle. */
  _beadPoint(out) {
    const c = settings.sanctuary;
    _hand.copy(this.origin).addScaledVector(this.direction, 0.5);
    _hand.y = c.handHeight;
    this._floorPoint(out);
    out.y = 0.6;
    out.lerpVectors(_hand, out, this.u);
    out.y += Math.sin(this.u * Math.PI) * c.beadArc;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
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

  _travelFx(dt) {
    const c = settings.sanctuary;
    const g = settings.global;
    const n = this.trailEmitter.tick(dt, c.travelSparkle * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    this._beadPoint(_pos);
    _emit.position = _pos;
    _emit.radius = c.beadSize * 0.5;
    _emit.direction = _dir.copy(this.direction).negate().setY(0.4);
    _emit.speed = c.sparkleSpeed * 0.5;
    _emit.spread = 0.6;
    _emit.size = c.sparkleSize;
    _emit.life = c.sparkleLife * 0.7;
    this.sparkle.emit(n, _emit);
  }

  /** The bead lands: a soft bloom, a ripple, the lotus starts to rise. */
  _landFx() {
    const c = settings.sanctuary;
    const g = settings.global;
    const power = g.explosionIntensity;
    this._floorPoint(_centre);
    this.ctx.decals.spawn(DecalType.RIPPLE, _centre, {
      radius: c.zoneRadius,
      life: 1.4,
      intensity: 0.7,
      colorA: getColor(c.colorWaveA),
      colorB: getColor(c.colorWaveB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.zoneRadius * c.bloomDust * power,
      life: 1.6,
      intensity: 0.5,
      colorA: getColor(c.colorMoteC),
      colorB: getColor(c.colorMoteD)
    });
    _pos.copy(_centre).setY(0.4);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: 0.3,
      endRadius: c.zoneRadius * 0.7 * power,
      life: 0.7,
      intensity: 0.8,
      opacity: 0.4,
      fresnel: 2.2,
      squash: 0.5,
      colorA: getColor(c.colorOrbCore),
      colorB: getColor(c.colorWaveA),
      colorC: getColor(c.colorWaveB)
    });

    this._resetEmit(frame.uTime.value);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = c.sparkleSpeed;
    _emit.spread = 0.9;
    _emit.size = c.sparkleSize;
    _emit.life = c.sparkleLife;
    this.sparkle.emit(Math.round(60 * g.particleCount), _emit);

    this.ctx.shake.add(c.bloomShake * power * g.cameraShake, 4, 12);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.bloomFlash * power);
    this.lightBoost = c.bloomLight * power;
  }

  /** A healing wave leaves the lotus. */
  _launchWave() {
    const c = settings.sanctuary;
    const g = settings.global;
    const power = g.explosionIntensity;
    // A free slot, or the oldest one.
    let slot = null;
    let oldest = null;
    for (const wave of this._waves) {
      if (!wave.active) {
        slot = wave;
        break;
      }
      if (!oldest || wave.age > oldest.age) oldest = wave;
    }
    slot = slot ?? oldest;
    slot.active = true;
    slot.age = 0;
    slot.radius = this.lotusLength * c.hubRadius;
    slot.seed = Math.random() * 100;
    slot.acc = 0;
    this._lastWave = 0;
    this._wavesLaunched++;

    this._floorPoint(_centre);
    if (c.waveRipple > 0.5) {
      this.ctx.decals.spawn(DecalType.RIPPLE, _centre, {
        radius: this.waveReach,
        life: this.waveReach / Math.max(0.1, c.waveSpeed),
        intensity: 0.45,
        colorA: getColor(c.colorWaveA),
        colorB: getColor(c.colorWaveB)
      });
    }

    // Light petals shed from the petal tips.
    const len = this.lotusLength;
    const shed = Math.round(c.petalShed * g.particleCount);
    const time = frame.uTime.value;
    for (let n = 0; n < shed; n++) {
      const a = Math.random() * TAU;
      _dir.set(Math.cos(a), 0.6, Math.sin(a)).normalize();
      _pos.set(_centre.x + Math.cos(a) * len * 0.8, c.lotusLift + len * 0.35, _centre.z + Math.sin(a) * len * 0.8);
      this._resetEmit(time);
      _emit.position = _pos;
      _emit.radius = 0.1;
      _emit.direction = _dir;
      _emit.speed = 1.2;
      _emit.spread = 0.4;
      _emit.size = c.petalSize;
      _emit.life = c.petalLife;
      _emit.spin = 4;
      this.shed.emit(1, _emit);
    }

    this.ctx.shake.add(c.waveShake * power * g.cameraShake, 6, 10);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.waveFlash * power);
    this.lightBoost = Math.max(this.lightBoost, c.waveLight * power);
  }

  /** Age the waves, sparkle along their fronts, and find bodies they cross. */
  _updateWaves(dt) {
    const c = settings.sanctuary;
    const g = settings.global;
    const reach = this.waveReach;
    const time = frame.uTime.value;
    const duration = reach / Math.max(0.1, c.waveSpeed);
    this._floorPoint(_centre);

    let anyActive = false;
    for (const wave of this._waves) {
      if (!wave.active) continue;
      const before = wave.radius;
      wave.age += dt;
      wave.radius += c.waveSpeed * g.animationSpeed * dt;
      if (wave.radius >= reach) {
        wave.active = false;
        continue;
      }
      anyActive = true;

      // Sparkle rising off the front, spread over the wave's whole run.
      wave.acc += c.sparkleCount * g.particleCount * g.emissionRate * (dt / duration);
      const n = Math.min(60, Math.floor(wave.acc));
      wave.acc -= n;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU;
        _pos.set(_centre.x + Math.cos(a) * wave.radius, 0.05, _centre.z + Math.sin(a) * wave.radius);
        this._resetEmit(time);
        _emit.position = _pos;
        _emit.radius = 0.05;
        _emit.direction = _up;
        _emit.speed = c.sparkleSpeed;
        _emit.spread = 0.15;
        _emit.size = c.sparkleSize;
        _emit.life = c.sparkleLife;
        this.sparkle.emit(1, _emit);
      }

      if (c.revive > 0.5) this._touchBodies(before, wave.radius);
    }
    if (this._lastWave >= 0) this._lastWave += dt;
    return anyActive;
  }

  /* ------------------------------------------------------------------ */
  /* Standing the fallen back up                                         */
  /* ------------------------------------------------------------------ */

  /** Every fallen body whose resting place a wave front crossed this frame. */
  _touchBodies(inner, outer) {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const floorR = this.floorRadius;
    const found = field.findBodies(_centre.x, _centre.z, Math.min(outer, floorR), this._found);
    for (const dummy of found) {
      if (dummy.alive || dummy.state === 'gone') continue;
      if (this._risingOf(dummy)) continue;
      if (this._reviveCount >= MAX_REVIVE) break;
      const at = dummy.bodyPoint(_body) ?? dummy.position;
      const dx = at.x - _centre.x;
      const dz = at.z - _centre.z;
      const d = Math.hypot(dx, dz);
      if (d < inner - 0.3 || d > outer + 0.3) continue;
      const slot = this._revive[this._reviveCount++];
      slot.dummy = dummy;
      slot.time = 0;
      // Stood where it lies, kept just inside the circle.
      const keep = d > floorR * 0.92 ? (floorR * 0.92) / d : 1;
      slot.x = _centre.x + dx * keep;
      slot.z = _centre.z + dz * keep;
    }
  }

  _risingOf(dummy) {
    for (let i = 0; i < this._reviveCount; i++) if (this._revive[i].dummy === dummy) return this._revive[i];
    return null;
  }

  /** A column of light over every body rising, then `Dummy#place`. */
  _updateRevive(dt) {
    const c = settings.sanctuary;
    const g = settings.global;
    const time = frame.uTime.value;
    for (let i = this._reviveCount - 1; i >= 0; i--) {
      const slot = this._revive[i];
      const dummy = slot.dummy;
      // Gone, or stood up by something else in the meantime: let it go.
      const lost = !dummy || dummy.state === 'gone' || dummy.alive;
      if (!lost) {
        slot.time += dt;
        const n = Math.round(c.reviveColumn * g.particleCount * g.emissionRate * dt / Math.max(0.1, c.reviveDelay));
        if (n > 0) {
          this._resetEmit(time);
          _pos.set(slot.x, 0.1, slot.z);
          _emit.position = _pos;
          _emit.radius = 0.35;
          _emit.direction = _up;
          _emit.speed = c.sparkleSpeed * 0.8;
          _emit.spread = 0.1;
          _emit.size = c.sparkleSize;
          _emit.life = c.sparkleLife;
          this.sparkle.emit(n, _emit);
        }
        if (slot.time >= c.reviveDelay) {
          const anchor = this.ctx.character?.position ?? this.origin;
          const yaw = Math.atan2(anchor.x - slot.x, anchor.z - slot.z);
          dummy.place(slot.x, slot.z, yaw);
          this._riseFx(slot.x, slot.z);
        } else continue;
      }
      // Remove (swap with last).
      const last = this._reviveCount - 1;
      this._revive[i] = this._revive[last];
      this._revive[last] = slot;
      slot.dummy = null;
      this._reviveCount = last;
    }
  }

  _riseFx(x, z) {
    const c = settings.sanctuary;
    const g = settings.global;
    _pos.set(x, 0.02, z);
    this.ctx.decals.spawn(DecalType.RIPPLE, _pos, {
      radius: 1.2,
      life: 0.9,
      intensity: 0.8,
      colorA: getColor(c.colorWaveB),
      colorB: getColor(c.colorWaveA)
    });
    this._resetEmit(frame.uTime.value);
    _pos.y = 0.9;
    _emit.position = _pos;
    _emit.radius = 0.4;
    _emit.direction = _up;
    _emit.speed = c.moteSpeed * 2;
    _emit.spread = 1;
    _emit.size = c.moteSize * 1.5;
    _emit.life = c.moteLife * 0.6;
    this.motes.emit(Math.round(40 * g.particleCount), _emit);
    this.lightBoost = Math.max(this.lightBoost, c.waveLight * 0.6);
  }

  /** Motes rising off the living floor while it stands. */
  _standingFx(dt, strength) {
    const c = settings.sanctuary;
    const g = settings.global;
    const n = this.moteEmitter.tick(dt, c.moteRate * strength * g.particleCount);
    if (n <= 0) return;
    const spread = this._floorState.spread;
    const time = frame.uTime.value;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * spread * 0.95;
      _pos.set(_centre.x + Math.cos(a) * r, 0.08, _centre.z + Math.sin(a) * r);
      this._resetEmit(time);
      _emit.position = _pos;
      _emit.radius = 0.05;
      _emit.direction = _up;
      _emit.speed = c.moteSpeed;
      _emit.spread = 0.3;
      _emit.size = c.moteSize;
      _emit.life = c.moteLife;
      this.motes.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._sync(dt);
    this._beadPoint(this.position);
    this._travelFx(dt);
  }

  onImpact() {
    this._landed = 0;
    this._landFx();
  }

  onFade(dt, t) {
    const c = settings.sanctuary;
    this._landed += dt;

    // Waves leave on a steady beat while the sanctuary stands.
    if (this.phase === AbilityPhase.IMPACT) {
      const count = Math.min(MAX_WAVES * 4, Math.max(0, Math.round(c.waveCount)));
      const next = c.waveStart + this._wavesLaunched * Math.max(0.1, c.waveInterval);
      if (this._wavesLaunched < count && this._landed >= next) this._launchWave();
    }

    this._updateWaves(dt);
    this._updateRevive(dt);
    this._sync(dt);
    this._standingFx(dt, 1 - this._closing());

    this._floorPoint(this.position);
    this.position.y = c.lightHeight;
  }

  onDestroy() {
    // Bodies part-way through rising are simply left where they lie.
    this._clearRevive();
    for (const wave of this._waves) wave.active = false;
    this.petals.visible = false;
    this.petals.count = 0;
    this.pod.visible = false;
    this.orb.visible = false;
    this.floor.visible = false;
    this.haze.visible = false;
    for (const curtain of this.curtains) curtain.visible = false;
    this._landed = -1;
  }

  dispose() {
    this.petalGeometry.dispose();
    this.petalMaterial.dispose();
    this.podGeometry.dispose();
    this.podMaterial.dispose();
    this.orbGeometry.dispose();
    this.orbMaterial.dispose();
    this.floorGeometry.dispose();
    this.floorMaterial.dispose();
    this.curtainGeometry.dispose();
    for (const material of this.curtainMaterials) material.dispose();
    this.hazeGeometry.dispose();
    this.hazeMaterial.dispose();
    this.petals.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const R = Editor.range;
  const folder = gui.addFolder('❀  Dawn Sanctuary');

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 0, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 90, 0.5, 'bead speed (m/s)');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'sanctuary radius (m)');
  R(cast, c, 'lifetime', 0.5, 20, 0.05, 'stands for (s)');
  R(cast, c, 'closeTime', 0.1, 5, 0.05, 'folds shut over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handHeight', 0, 3, 0.01, 'hand height (m)');
  R(cast, c, 'beadArc', 0, 4, 0.01, 'bead arc (m)');
  R(cast, c, 'beadSize', 0.02, 1.5, 0.01, 'bead size (m)');

  const heal = folder.addFolder('Healing (never kills)');
  R(heal, c, 'revive', 0, 1, 1, 'waves raise the fallen');
  R(heal, c, 'reviveDelay', 0, 4, 0.05, 'rises after (s)');
  R(heal, c, 'reviveColumn', 0, 600, 1, 'light column (motes)');

  /* ---- layer 1 ---- */
  const lotus = folder.addFolder('1 · Lotus');
  const shape = lotus.addFolder('Layout');
  R(shape, c, 'lotusScale', 0.1, 1.5, 0.01, 'petal length (× radius)');
  R(shape, c, 'lotusLift', -0.5, 1, 0.005, 'hinge height (m)');
  R(shape, c, 'riseDepth', 0, 3, 0.01, 'rises from depth (m)');
  R(shape, c, 'riseTime', 0.02, 3, 0.01, 'rises over (s)');
  R(shape, c, 'hubRadius', 0.02, 0.6, 0.005, 'hinge ring (× length)');
  R(shape, c, 'layers', 1, MAX_LAYERS, 1, 'petal rings');
  R(shape, c, 'petalsOuter', 3, MAX_PER_RING, 1, 'outer petals');
  R(shape, c, 'petalsMid', 3, MAX_PER_RING, 1, 'middle petals');
  R(shape, c, 'petalsInner', 3, MAX_PER_RING, 1, 'inner petals');
  R(shape, c, 'layerLength', 0.2, 1.2, 0.01, 'inner length (× outer)');
  R(shape, c, 'layerHeight', 0, 0.5, 0.005, 'ring step (m)');

  const petal = lotus.addFolder('Petal');
  R(petal, c, 'petalWidth', 0.05, 0.8, 0.005, 'half-width (× length)');
  R(petal, c, 'petalTaper', 0.2, 4, 0.01, 'taper');
  R(petal, c, 'petalThickness', 0.002, 0.2, 0.001, 'thickness (m)');
  R(petal, c, 'petalCup', -1, 1, 0.01, 'cup');
  R(petal, c, 'petalCurl', -2, 2, 0.01, 'curl (rad)');

  const unfold = lotus.addFolder('Unfolding');
  R(unfold, c, 'openDelay', 0, 2, 0.01, 'opens after rising (s)');
  R(unfold, c, 'openTime', 0.05, 3, 0.01, 'one ring opens over (s)');
  R(unfold, c, 'openStagger', 0, 1.5, 0.01, 'ring stagger (s)');
  R(unfold, c, 'closedPitch', 0.5, 2.6, 0.01, 'closed pitch (rad)');
  R(unfold, c, 'openPitchOuter', -0.6, 1.6, 0.01, 'open pitch, outer (rad)');
  R(unfold, c, 'openPitchInner', -0.6, 1.6, 0.01, 'open pitch, inner (rad)');
  R(unfold, c, 'spin', -2, 2, 0.01, 'spin (rad/s)');
  R(unfold, c, 'layerCounterSpin', 0, 2, 0.01, 'middle ring counter-spin');
  R(unfold, c, 'breathe', 0, 0.5, 0.005, 'sway (rad)');
  R(unfold, c, 'breatheSpeed', 0, 4, 0.01, 'sways / s');
  R(unfold, c, 'waveLift', 0, 1, 0.005, 'lift on a wave (rad)');

  const metal = lotus.addFolder('Brass & light');
  R(metal, c, 'segments', 1, 12, 1, 'plates per petal');
  R(metal, c, 'segmentGap', 0, 0.4, 0.005, 'gap between plates');
  R(metal, c, 'lightEvery', 0, 6, 1, 'every Nth plate is light (0 none)');
  R(metal, c, 'trimWidth', 0, 0.5, 0.005, 'inlay width');
  R(metal, c, 'ribWidth', 0, 0.5, 0.005, 'midrib width');
  R(metal, c, 'metalReflect', 0, 3, 0.01, 'reflection');
  R(metal, c, 'metalGloss', 4, 300, 1, 'gloss');
  R(metal, c, 'metalSpecular', 0, 6, 0.05, 'specular');
  R(metal, c, 'filigree', 0, 1, 0.01, 'filigree');
  R(metal, c, 'lightGlow', 0, 10, 0.05, 'light glow');
  R(metal, c, 'pulseGlow', 0, 15, 0.05, 'wave pulse glow');
  metal.addColor(c, 'colorBrass').name('brass');
  metal.addColor(c, 'colorBrassDeep').name('deep brass');
  metal.addColor(c, 'colorBrassSpec').name('highlight');
  metal.addColor(c, 'colorLight').name('light');
  metal.addColor(c, 'colorLightHot').name('light, hot');

  const hub = lotus.addFolder('Hub & dawn orb');
  R(hub, c, 'hubHeight', 0.05, 1.5, 0.01, 'pod height');
  R(hub, c, 'podGlow', 0, 10, 0.05, 'pod glow');
  R(hub, c, 'podHoles', 1, 20, 0.1, 'pod holes');
  R(hub, c, 'orbHeight', 0, 3, 0.01, 'orb height (m)');
  R(hub, c, 'orbSize', 0, 2, 0.01, 'orb size (m)');
  R(hub, c, 'orbGlow', 0, 8, 0.05, 'orb glow');
  R(hub, c, 'orbRays', 3, 24, 1, 'rays');
  R(hub, c, 'orbRayLength', 0.2, 4, 0.01, 'ray length');
  hub.addColor(c, 'colorOrbCore').name('orb core');
  hub.addColor(c, 'colorOrbRim').name('orb rim');

  /* ---- layer 2 ---- */
  const floor = folder.addFolder('2 · Living floor');
  R(floor, c, 'floorScale', 0.3, 2, 0.01, 'radius (× zone)');
  R(floor, c, 'spreadTime', 0.05, 4, 0.01, 'spreads over (s)');
  R(floor, c, 'spreadEdge', 0.02, 1.5, 0.01, 'growing edge (m)');
  R(floor, c, 'latticeArms', 3, 40, 1, 'petal cells round');
  R(floor, c, 'latticeTwist', 0.2, 8, 0.05, 'spiral twist');
  R(floor, c, 'latticeLine', 0.005, 0.3, 0.001, 'lattice stroke');
  R(floor, c, 'latticeFill', 0, 1, 0.01, 'cell fill');
  R(floor, c, 'latticeGlow', 0, 6, 0.05, 'lattice glow');
  R(floor, c, 'veinScale', 0.1, 6, 0.01, 'vein scale');
  R(floor, c, 'veinSharp', 1, 60, 0.5, 'vein thinness');
  R(floor, c, 'veinFlow', 0, 3, 0.01, 'vein flow');
  R(floor, c, 'veinGlow', 0, 6, 0.05, 'vein glow');
  R(floor, c, 'rimWidth', 0.005, 0.4, 0.001, 'rim width (m)');
  R(floor, c, 'rimGlow', 0, 8, 0.05, 'rim glow');
  R(floor, c, 'rimTicks', 0, 160, 1, 'rim ticks');
  R(floor, c, 'floorOpacity', 0, 1, 0.01, 'opacity');
  R(floor, c, 'floorHeight', 0, 0.1, 0.001, 'height (m)');
  floor.addColor(c, 'colorFloor').name('floor');
  floor.addColor(c, 'colorVein').name('veins');
  floor.addColor(c, 'colorLattice').name('lattice');
  floor.addColor(c, 'colorRim').name('rim & edge');

  /* ---- layer 3 ---- */
  const waves = folder.addFolder('3 · Healing waves');
  R(waves, c, 'waveStart', 0, 4, 0.01, 'first wave after (s)');
  R(waves, c, 'waveInterval', 0.1, 4, 0.01, 'interval (s)');
  R(waves, c, 'waveCount', 0, 20, 1, 'waves');
  R(waves, c, 'waveSpeed', 0.2, 20, 0.05, 'speed (m/s)');
  R(waves, c, 'waveReach', 0.2, 3, 0.01, 'reach (× zone)');
  R(waves, c, 'waveWidth', 0.02, 2, 0.01, 'band width (m)');
  R(waves, c, 'waveHeight', 0, 4, 0.01, 'curtain height (m)');
  R(waves, c, 'waveHeightFalloff', 0, 1, 0.01, 'curtain shrinks by');
  R(waves, c, 'waveGlow', 0, 8, 0.05, 'curtain glow');
  R(waves, c, 'waveStreaks', 4, 160, 1, 'streaks');
  R(waves, c, 'waveOpacity', 0, 1, 0.01, 'curtain opacity');
  R(waves, c, 'waveShake', 0, 0.5, 0.005, 'shake');
  R(waves, c, 'waveLight', 0, 30, 0.1, 'light punch');
  R(waves, c, 'waveFlash', 0, 0.5, 0.005, 'flash');
  R(waves, c, 'waveRipple', 0, 1, 1, 'ripple decal');
  waves.addColor(c, 'colorWaveA').name('wave green');
  waves.addColor(c, 'colorWaveB').name('wave gold');

  /* ---- layer 4 ---- */
  const motes = folder.addFolder('4 · Motes, petals & sparkle');
  R(motes, c, 'moteRate', 0, 400, 1, 'motes / s');
  R(motes, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(motes, c, 'moteLife', 0.1, 6, 0.05, 'mote life (s)');
  R(motes, c, 'moteRise', -2, 4, 0.05, 'mote rise');
  R(motes, c, 'moteSpeed', 0, 4, 0.05, 'mote speed');
  R(motes, c, 'moteGlow', 0, 6, 0.05, 'mote glow');
  R(motes, c, 'moteTurbulence', 0, 3, 0.05, 'mote turbulence');
  Editor.gradient(motes, c, 'colorMote', 'Mote colour');
  R(motes, c, 'petalShed', 0, 80, 1, 'petals shed per wave');
  R(motes, c, 'petalSize', 0.02, 0.6, 0.005, 'shed petal size');
  R(motes, c, 'petalLife', 0.2, 6, 0.05, 'shed petal life (s)');
  Editor.gradient(motes, c, 'colorShed', 'Shed petal colour');
  R(motes, c, 'sparkleCount', 0, 600, 1, 'sparkle per wave');
  R(motes, c, 'sparkleSize', 0.01, 0.3, 0.005, 'sparkle size');
  R(motes, c, 'sparkleLife', 0.1, 3, 0.05, 'sparkle life (s)');
  R(motes, c, 'sparkleSpeed', 0, 10, 0.05, 'sparkle speed');
  R(motes, c, 'travelSparkle', 0, 600, 1, 'bead trail (/s)');
  Editor.gradient(motes, c, 'colorSparkle', 'Sparkle colour');

  /* ---- layer 5 ---- */
  const haze = folder.addFolder('5 · Haze & bloom');
  R(haze, c, 'hazeStrength', 0, 3, 0.01, 'haze strength');
  R(haze, c, 'hazeReach', 0.2, 3, 0.01, 'haze reach (× zone)');
  R(haze, c, 'hazeScale', 0.1, 8, 0.05, 'haze scale');
  R(haze, c, 'hazeSpeed', 0, 3, 0.01, 'haze speed');
  R(haze, c, 'hazePulse', 0, 5, 0.01, 'wave push');
  R(haze, c, 'bloomShake', 0, 1, 0.005, 'landing shake');
  R(haze, c, 'bloomFlash', 0, 1, 0.005, 'landing flash');
  R(haze, c, 'bloomLight', 0, 40, 0.1, 'landing light');
  R(haze, c, 'bloomDust', 0, 3, 0.01, 'landing dust (× zone)');
  haze.addColor(c, 'colorFlash').name('flash');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 30, 0.1, 'radius');
  R(light, c, 'lightHeight', 0, 5, 0.05, 'height (m)');
  R(light, c, 'lightBreathe', 0, 1, 0.01, 'breathes with the waves');

  folder.close();
  return folder;
}
