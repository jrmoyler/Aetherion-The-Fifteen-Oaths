import {
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createParallaxBezelMaterial,
  createParallaxBodyMaterial,
  createParallaxIrisMaterial,
  createParallaxRingMaterial,
  createParallaxWarpMaterial
} from '../../materials/atlas/ParallaxBlinkMaterials.js';
import {
  createParallaxBezelGeometry,
  createParallaxIrisGeometry,
  createParallaxRingGeometry
} from '../../assets/atlas/ParallaxBlinkGeometry.js';
import { CasterDouble, casterLock } from '../../assets/atlas/ChronoRecallRig.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing, randRange } from '../../utils/math.js';

export const ID = 'parallax';

/** Corridor hoops available. The editor's count slider clamps to this. */
const MAX_RINGS = 18;
const TAU = Math.PI * 2;
const _z = new Vector3(0, 0, 1);

const _emit = {};
const _force = { impulse: 0, lift: 0, spin: 0 };
const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _node = new Object3D();
/** Reused by `DummyField#findTargets`. */
const _targets = [];

/**
 * PARALLAX BLINK — Mobility, line cast.
 *
 * Two mechanical irises — chrome aperture blades in a toothed housing, blue
 * light bleeding off their edges — iris open, one just in front of the caster
 * and one just short of the target, and a corridor of floating light rings
 * assembles between them. The caster walks into the near iris and is taken
 * apart into it: nearest-the-iris first, voxel by voxel, every fragment drawn
 * spiralling into the aperture. A pulse runs the corridor. After a timed
 * delay the caster is rebuilt at the target out of the far iris — fragments
 * converging, the body reassembling front-first — anything standing there is
 * blown away, and both irises close.
 *
 * Read side by side with the Blink Step it is the *engineered* teleport: the
 * Blink is a crack of light that hides the body and streaks; the Parallax
 * builds a machine, keeps the body visibly physical while it is disassembled,
 * and moves it through apparatus rather than through the air.
 *
 * ## Layers
 *
 *   1. **IRISES** (`createParallaxIrisMaterial`) — a disc quad per gate drawn
 *      entirely in the fragment shader: N curved blades closing on an N-gon
 *      that turns as it opens (a real iris's kinematics), per-blade tilted
 *      normals reflecting the stage's sky, contact shadows at the overlaps, a
 *      blue lip on the aperture edge, and a four-layer **parallax tunnel**
 *      through the opening.
 *   2. **BEZELS** (`createParallaxBezelMaterial`) — a machined, toothed
 *      housing ring per gate: chrome off the environment, an engraved groove
 *      with a chase of indicator lights that charge with the gate.
 *   3. **CORRIDOR** (`createParallaxRingMaterial`) — up to 18 instanced hoops
 *      floating between the gates, each bobbing, tilting and turning on its
 *      own, dashed and fresnel-rimmed; they assemble from the entry outward
 *      and flare as the transit pulse passes through them.
 *   4. **THE BODY** (`createParallaxBodyMaterial`) — the caster's double, a
 *      `SkeletonUtils.clone` of the live rig (see `CasterDouble`) that copies
 *      the real body's pose every frame and is lit with the skin's own colour
 *      map. It dissolves in voxels ordered by distance to the iris, with a
 *      glowing front, while the vertices behind the front are spun and pulled
 *      into the aperture; at the exit the same shader runs backward.
 *   5. **FRAGMENTS** — additive CHIP particles leaving body points on paths
 *      aimed to arrive in the aperture as they die (entry), and leaving the
 *      exit aperture aimed at body points (exit).
 *   6. **TRANSIT** — STREAK particles riding the pulse down the corridor.
 *   7. **WARP** (LAYER.DISTORTION) — an N-gon ripple shaped like the aperture:
 *      a pull at the entry while the body goes, a push at the exit.
 *   8. **ARRIVAL** — AIR pressure shell, SHOCKWAVE + DUSTRING decals at the
 *      target, a SHOCKWAVE under each gate as it opens, flash, shake, light.
 *
 * ## Hits
 *
 * `handlesOwnHits`: only the exit matters. At the moment of reassembly every
 * body within `exitRadius` of the target is thrown outward from it (along the
 * corridor for one standing dead centre).
 *
 * ## The body
 *
 * The real character is hidden while its double plays the dissolve and the
 * reassembly — through its *model*, never `root.visible`, which is what the
 * Blink Step and Voidstep save and restore (see `_bodyMesh`) — and only while
 * this cast owns it (`casterLock`, shared with the
 * Chrono Recall; a foreign mover — Blink Step, Voidstep — is detected by the
 * body being moved under us, and we let go without touching it). The move to
 * the target is x/z only and happens once, at the start of the reassembly.
 * Every exit — reassembly finishing, `destroy` (clear / retire), a steal —
 * runs `_releaseCharacter`, which makes it visible again where it stands: at
 * the origin if the cast never arrived, at the target if it did. Never hidden,
 * never half-way.
 *
 * ## The editor rule
 *
 * Ring records hold dice only; every metre, second and colour is resolved from
 * `settings.parallax` per frame.
 */
export class ParallaxBlinkAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this.rings.count + (this.double.root.visible ? 1 : 0);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layers 1 & 2: the two gates ---- */
    this.irisGeometry = createParallaxIrisGeometry();
    this.bezelGeometry = createParallaxBezelGeometry();
    this.bezelMaterial = createParallaxBezelMaterial();
    this.gates = [];
    for (let i = 0; i < 2; i++) {
      const root = new Group();
      root.name = i === 0 ? 'ParallaxEntry' : 'ParallaxExit';
      root.visible = false;
      const material = createParallaxIrisMaterial();
      const face = new Mesh(this.irisGeometry, material);
      face.layers.set(LAYER.VFX);
      face.frustumCulled = false;
      face.renderOrder = 8;
      // The housing spins on its own; the face's drive angle is in the shader.
      const bezel = new Mesh(this.bezelGeometry, this.bezelMaterial);
      bezel.layers.set(LAYER.VFX);
      bezel.frustumCulled = false;
      bezel.renderOrder = 7;
      root.add(face, bezel);
      this.group.add(root);
      this.gates.push({
        root,
        face,
        bezel,
        material,
        open: 0,
        flare: 0,
        state: { open: 0, rot: 0, fade: 1, flare: 0, seed: 0 },
        centre: new Vector3(),
        stamped: false
      });
    }
    this._bezelState = { charge: 0, flare: 0 };

    /* ---- layer 3: the corridor ---- */
    this.ringGeometry = createParallaxRingGeometry();
    this.ringAttr = new InstancedBufferAttribute(new Float32Array(MAX_RINGS * 3), 3);
    this.ringGeometry.setAttribute('aRing', this.ringAttr);
    this.ringMaterial = createParallaxRingMaterial();
    this.rings = new InstancedMesh(this.ringGeometry, this.ringMaterial, MAX_RINGS);
    this.rings.name = 'ParallaxCorridor';
    this.rings.layers.set(LAYER.VFX);
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 9;
    this.rings.count = 0;
    this.group.add(this.rings);
    this.ringDice = [];
    for (let i = 0; i < MAX_RINGS; i++) {
      this.ringDice.push({ phase: 0, bob: 0, tiltX: 0, tiltY: 0, spin: 0, size: 1, seed: 0 });
    }

    /* ---- layer 4: the body ---- */
    this.bodyMaterial = createParallaxBodyMaterial();
    this.double = new CasterDouble(this.bodyMaterial, 'ParallaxBody');
    this.double.bind(this.ctx.character);
    this.group.add(this.double.root);
    this._bodyState = {
      progress: 0,
      iris: new Vector3(),
      irisN: new Vector3(0, 0, 1),
      near: 0,
      far: 2,
      map: null
    };

    /* ---- layer 7: the warps ---- */
    this.warpGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.pullMaterial = createParallaxWarpMaterial();
    this.pushMaterial = createParallaxWarpMaterial();
    this.pull = new Mesh(this.warpGeometry, this.pullMaterial);
    this.push = new Mesh(this.warpGeometry, this.pushMaterial);
    for (const mesh of [this.pull, this.push]) {
      mesh.layers.set(LAYER.DISTORTION);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
    }
    this._warpState = { size: 1, strength: 0, front: 0.5, sign: 1, rot: 0 };

    /* ---- per cast ---- */
    this._target = new Vector3();
    this._owns = false;
    this._moved = false;
    this._savedVisible = true;
    this._lastWritten = new Vector3();
    this._arriveAge = -1;
    this._seed = 0;
    this._departAt = 0;
    this._closing = 0;
    this._facing = 0;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 5: fragments ---- */
    // Aimed to arrive exactly as they die, so drag, gravity and the global
    // speed/life scales stay neutral (the Blink implosion's rule).
    this.fragments = particles.get('parallax.fragments', {
      capacity: 2600,
      shape: ParticleShape.CHIP,
      additive: true,
      softFade: 0.15
    });
    this.fragments.uniforms.uDrag.value = 0;
    this.fragments.uniforms.uGravity.value.set(0, 0, 0);
    this.fragments.uniforms.uTurbulence.value = 0;
    this.fragments.uniforms.uSizeIn.value = 0.05;
    this.fragments.uniforms.uFadeIn.value = 0.08;
    this.fragments.uniforms.uFadeOut.value = 0.25;

    /* ---- layer 6: transit ---- */
    this.transit = particles.get('parallax.transit', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.transit.uniforms.uDrag.value = 1.2;
    this.transit.uniforms.uEndSize.value = 0.2;
    this.transit.uniforms.uSizeIn.value = 0.03;
    this.transit.uniforms.uFadeIn.value = 0.03;
    this.transit.uniforms.uFadeOut.value = 0.6;

    this.fragmentEmitter = new RateEmitter();
    this.transitEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** Reassembly plus the beat the gates hold open after it. */
  get impactDuration() {
    const c = settings.parallax;
    return Math.max(0.1, (c.reassembleTime + c.lifetime) * settings.global.lifetime);
  }

  /** The gates closing. */
  get fadeDuration() {
    return Math.max(0.1, settings.parallax.closeTime * settings.global.lifetime);
  }

  /** Machined light: a steady hum with the chase lights' beat in it. */
  lightShimmer() {
    return 0.94 + 0.06 * Math.sin(this.age * 23.0);
  }

  /** When the body has finished going in and the pulse may leave, seconds of age. */
  _departTime() {
    const c = settings.parallax;
    return c.dissolveDelay + c.dissolveTime + c.transitDelay;
  }

  /**
   * The pulse runs the *corridor* (gate to gate), and only once the body is
   * in. `u` still means "0 at the caster, 1 at the target" for the camera.
   */
  advance(dt) {
    const c = settings.parallax;
    if (this.age < this._departTime()) {
      this.u = 0;
      this._gateCentre(0, this.position);
      return false;
    }
    const speed = c.speed * settings.global.speed;
    this.front += speed * dt;
    const corridor = this._corridorLength();
    const previousU = this.u;
    this.u = saturate(this.front / corridor);
    this._gateCentre(0, _a);
    this._gateCentre(1, _b);
    this.position.lerpVectors(_a, _b, this.u);
    return this.u >= 1 && previousU < 1;
  }

  /* ------------------------------------------------------------------ */
  /* Geometry of the cast                                                */
  /* ------------------------------------------------------------------ */

  /** Gate `i` centre, world: entry just ahead of the caster, exit just short of the target. */
  _gateCentre(i, out) {
    const c = settings.parallax;
    const off = Math.min(c.gateOffset, this.length * 0.4);
    if (i === 0) this.pointAt(0, out).addScaledVector(this.direction, off);
    else this.pointAt(1, out).addScaledVector(this.direction, -off);
    out.y = c.gateHeight;
    return out;
  }

  _corridorLength() {
    const off = Math.min(settings.parallax.gateOffset, this.length * 0.4);
    return Math.max(0.1, this.length - off * 2);
  }

  /* ------------------------------------------------------------------ */
  /* The body                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * The visible part of the body. Hidden through the *model* (the rig under
   * the tilt joint), never through `root.visible`: Blink Step and Voidstep
   * save and restore `root.visible`, so if either took the body while we had
   * it hidden that way they would "restore" an invisible caster. Hiding the
   * model leaves `root` exactly as they expect to find it.
   */
  _bodyMesh() {
    const character = this.ctx.character;
    return character?.model ?? character?.root ?? null;
  }

  _hideBody(hidden) {
    const mesh = this._bodyMesh();
    if (this._owns && mesh) mesh.visible = !hidden && this._savedVisible;
  }

  _takeCharacter() {
    const character = this.ctx.character;
    if (!character?.root) return;
    if (casterLock.owner && casterLock.owner !== this) casterLock.owner._releaseCharacter(true);
    casterLock.owner = this;
    this._owns = true;
    this._savedVisible = this._bodyMesh().visible;
    this._lastWritten.copy(character.position);
  }

  /** Show the body where it stands. `steal`: another mover takes it this instant. */
  _releaseCharacter(_steal = false) {
    if (!this._owns) return;
    const mesh = this._bodyMesh();
    if (mesh) mesh.visible = this._savedVisible;
    this._owns = false;
    if (casterLock.owner === this) casterLock.owner = null;
    this.double.root.visible = false;
  }

  _checkForeign() {
    if (!this._owns) return;
    const p = this.ctx.character.position;
    const dx = p.x - this._lastWritten.x;
    const dz = p.z - this._lastWritten.z;
    if (dx * dx + dz * dz > 1e-4) this._releaseCharacter(true);
  }

  /** Mirror the real body into the double: place, facing, live pose. */
  _syncDouble(progress, gate) {
    const c = settings.parallax;
    const character = this.ctx.character;
    const double = this.double;
    if (!this._owns || progress >= 1) {
      double.root.visible = false;
      return;
    }
    double.root.position.copy(character.position);
    double.setFacing(character.facing ?? this._facing);
    double.copyPose();
    double.root.visible = true;

    const st = this._bodyState;
    st.progress = progress;
    this._gateCentre(gate, st.iris);
    st.irisN.copy(this.direction).multiplyScalar(gate === 0 ? -1 : 1);
    // Ordered over the body's own extent, measured from the iris.
    const toBody = Math.hypot(character.position.x - st.iris.x, character.position.z - st.iris.z);
    st.near = Math.max(0, toBody - c.bodyDepth);
    st.far = toBody + c.bodyDepth + double.height * 0.5;
    st.map = double.map;
    this.bodyMaterial.userData.sync(st);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.parallax;
    const g = settings.global;
    this._seed = Math.random() * 100;
    this._arriveAge = -1;
    this._moved = false;
    this._closing = 0;
    this._facing = Math.atan2(this.direction.x, this.direction.z);
    this.fragmentEmitter.reset();
    this.transitEmitter.reset();
    this.pointAt(1, this._target);

    for (const gate of this.gates) {
      gate.open = 0;
      gate.flare = 0;
      gate.stamped = false;
      gate.state.seed = Math.random() * 50;
    }
    for (const d of this.ringDice) {
      d.phase = Math.random() * TAU;
      d.bob = randRange(0.6, 1.4);
      d.tiltX = randRange(-1, 1) * g.randomness;
      d.tiltY = randRange(-1, 1) * g.randomness;
      d.spin = randRange(-1, 1);
      d.size = 1 + randRange(-1, 1) * c.ringSizeJitter * g.randomness;
      d.seed = Math.random();
    }

    this.double.bind(this.ctx.character);
    this._takeCharacter();
    this._sync();
    this._update(0);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _sync() {
    const c = settings.parallax;
    const g = settings.global;
    this.ringMaterial.userData.sync();

    this.fragments.setGradient(getColor(c.colorFragA), getColor(c.colorFragB), getColor(c.colorFragC), getColor(c.colorFragD));
    this.fragments.uniforms.uSizeScale.value = c.fragmentSize * g.particleSize * 7;
    this.fragments.uniforms.uEndSize.value = c.fragmentEndSize;
    this.fragments.uniforms.uOpacity.value = g.opacity;
    this.fragments.uniforms.uGlow.value = c.fragmentGlow * g.glow;

    this.transit.setGradient(getColor(c.colorTransitA), getColor(c.colorTransitB), getColor(c.colorTransitC), getColor(c.colorTransitD));
    this.transit.uniforms.uGravity.value.set(0, 0, 0);
    this.transit.uniforms.uSizeScale.value = c.transitSize * g.particleSize * 7;
    this.transit.uniforms.uLifeScale.value = g.particleLifetime;
    this.transit.uniforms.uSpeedScale.value = g.particleSpeed;
    this.transit.uniforms.uOpacity.value = g.opacity;
    this.transit.uniforms.uGlow.value = c.transitGlow * g.glow;
    this.transit.uniforms.uStretch.value = c.transitStretch;
    this.transit.uniforms.uTurbulence.value = 0.2 * g.turbulence;
  }

  /** Everything keyed off age and phase; called from every phase hook. */
  _update(dt) {
    const c = settings.parallax;
    const g = settings.global;
    const closeT = this.phase === AbilityPhase.FADE ? saturate(this.fadeTime / this.fadeDuration) : 0;
    this._closing = closeT;

    /* --- gates: open, hold, close --- */
    for (let i = 0; i < 2; i++) {
      const gate = this.gates[i];
      const start = i === 0 ? 0 : c.exitLag;
      const t = saturate((this.age - start) / Math.max(0.02, c.openTime));
      const open = Easing.outCubic(t) * (1 - Easing.inCubic(closeT));
      gate.open = open;
      gate.flare = Math.max(0, gate.flare - dt * 3);

      if (!gate.stamped && t > 0) {
        gate.stamped = true;
        this._gateCentre(i, _pos);
        this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
          radius: c.irisRadius * c.gateRingScale,
          life: c.gateRingLife,
          width: 0.05,
          intensity: 0.9,
          colorA: getColor(c.colorLip),
          colorB: getColor(c.colorChrome)
        });
        this.ctx.shake.add(c.openShake * g.cameraShake, 12, 24);
      }

      const root = gate.root;
      this._gateCentre(i, root.position);
      root.quaternion.setFromUnitVectors(_z, this.direction);
      // Pops out of nothing on an overshoot, and shrinks back as it shuts.
      const pop = t >= 1 ? 1 : Easing.outBack(t);
      const shut = 1 - Easing.inQuad(saturate((closeT - 0.55) / 0.45));
      root.scale.setScalar(Math.max(0.0001, c.irisRadius * pop * shut));
      root.visible = t > 0 && shut > 0.001;
      gate.bezel.rotation.z = (this.age * c.bezelSpin + open * c.irisDrive) * (i === 0 ? 1 : -1);

      const st = gate.state;
      st.open = open;
      st.rot = open * c.irisDrive * (i === 0 ? 1 : -1);
      st.fade = 1;
      st.flare = gate.flare;
      gate.material.userData.sync(st);
    }
    const charge = Math.max(this.gates[0].open, this.gates[1].open);
    this._bezelState.charge = charge;
    this._bezelState.flare = Math.max(this.gates[0].flare, this.gates[1].flare) * 0.5;
    this.bezelMaterial.userData.sync(this._bezelState);

    this._updateRings(closeT);
    this._updateBody(dt);
    this._updateWarps();
  }

  _updateRings(closeT) {
    const c = settings.parallax;
    const count = Math.min(MAX_RINGS, Math.max(0, Math.round(c.ringCount)));
    const data = this.ringAttr.array;
    this._gateCentre(0, _a);
    this._gateCentre(1, _b);
    const corridor = this._corridorLength();
    const assemble = Math.max(0.02, c.ringAssemble);
    const pulseW = Math.max(0.05, c.ringPulseWidth);
    const pulseAt = this.phase === AbilityPhase.TRAVEL ? this.front : this._arriveAge >= 0 ? corridor + 99 : -99;
    const time = this.age;

    for (let i = 0; i < MAX_RINGS; i++) {
      if (i >= count) {
        this._parkRing(i, data);
        continue;
      }
      const d = this.ringDice[i];
      const s = (i + 0.5) / count;
      // Assemble from the entry outward, staggered.
      const t = saturate((time - c.ringDelay - s * c.ringStagger) / assemble);
      const alpha = Easing.outCubic(t) * (1 - Easing.inQuad(closeT));
      if (alpha <= 0.001) {
        this._parkRing(i, data);
        continue;
      }
      _pos.lerpVectors(_a, _b, s);
      _pos.y += Math.sin(time * c.ringBobSpeed * d.bob + d.phase) * c.ringBob;
      _pos.addScaledVector(this.side, Math.sin(time * c.ringBobSpeed * 0.7 * d.bob + d.phase * 1.7) * c.ringBob * 0.6);

      const along = s * corridor;
      const dp = (along - pulseAt) / pulseW;
      const pulse = Math.exp(-dp * dp);

      // Face down the corridor, then the ring's own slow wobble and turn.
      _node.position.copy(_pos);
      _node.quaternion.setFromUnitVectors(_z, this.direction);
      _node.rotateX(d.tiltX * c.ringTilt * Math.sin(time * 0.9 + d.phase));
      _node.rotateY(d.tiltY * c.ringTilt * Math.cos(time * 0.8 + d.phase));
      _node.rotateZ(time * c.ringSpin * d.spin);
      const r = c.ringRadius * d.size * lerp(c.ringStartScale, 1, Easing.outBack(t)) * (1 + pulse * c.ringPulseScale);
      _node.scale.set(r, r, r * (1 + c.ringThickness));
      _node.updateMatrix();
      this.rings.setMatrixAt(i, _node.matrix);
      data[i * 3] = alpha * c.ringOpacity * settings.global.opacity;
      data[i * 3 + 1] = pulse;
      data[i * 3 + 2] = d.seed;
    }
    this.rings.count = count;
    this.rings.instanceMatrix.needsUpdate = true;
    this.ringAttr.needsUpdate = true;
  }

  _parkRing(i, data) {
    _node.position.set(0, -999, 0);
    _node.quaternion.identity();
    _node.scale.setScalar(0.0001);
    _node.updateMatrix();
    this.rings.setMatrixAt(i, _node.matrix);
    data[i * 3] = 0;
    data[i * 3 + 1] = 0;
  }

  /** The dissolve on the way in and the reassembly on the way out. */
  _updateBody(dt) {
    const c = settings.parallax;
    const g = settings.global;
    this._checkForeign();
    if (!this._owns) {
      this.double.root.visible = false;
      return;
    }
    const character = this.ctx.character;

    if (!this._moved) {
      /* --- going in --- */
      const t = saturate((this.age - c.dissolveDelay) / Math.max(0.02, c.dissolveTime));
      const progress = Easing.inOutQuad(t);
      // The real body steps aside for its double the instant the dissolve starts.
      this._hideBody(this.age >= c.dissolveDelay);
      this._syncDouble(this.age < c.dissolveDelay ? 1 : progress, 0);
      if (this.age >= c.dissolveDelay && t < 1) this._emitFragments(dt, 0, 1 - t);
    } else {
      /* --- coming out --- */
      const t = saturate(this._arriveAge / Math.max(0.02, c.reassembleTime * g.lifetime));
      const progress = 1 - Easing.inOutQuad(t);
      if (t >= 1) {
        this._releaseCharacter();
        return;
      }
      this._hideBody(true);
      this._syncDouble(progress, 1);
      this._emitFragments(dt, 1, 1 - t);
    }
  }

  /**
   * Fragments between the body and a gate. `gate` 0: from the body into the
   * aperture. `gate` 1: from the aperture onto the body. Each is aimed to land
   * exactly as it dies.
   */
  _emitFragments(dt, gate, weight) {
    const c = settings.parallax;
    const g = settings.global;
    const n = Math.round(this.fragmentEmitter.tick(dt, c.fragmentRate * weight) * g.particleCount);
    if (n <= 0) return;
    this._gateCentre(gate, _b);
    const life = Math.max(0.05, c.fragmentLife);
    const time = frame.uTime.value;
    this.double.root.updateMatrixWorld(true);
    for (let k = 0; k < n; k++) {
      this.double.bodyPoint(_a);
      // Off the body a touch, so they do not start inside the mesh.
      _a.x += randRange(-0.08, 0.08);
      _a.z += randRange(-0.08, 0.08);
      // Land somewhere on the aperture disc, not its exact centre.
      const ang = Math.random() * TAU;
      const rr = Math.sqrt(Math.random()) * c.irisRadius * c.irisAperture * 0.6;
      _pos.copy(_b).addScaledVector(this.side, Math.cos(ang) * rr);
      _pos.y += Math.sin(ang) * rr;
      if (gate === 0) {
        _dir.copy(_pos).sub(_a);
        _emit.position = _a;
      } else {
        _dir.copy(_a).sub(_pos);
        _emit.position = _pos;
      }
      const dist = _dir.length();
      _dir.multiplyScalar(1 / Math.max(1e-4, dist));
      _emit.radius = 0;
      _emit.direction = _dir;
      _emit.speed = dist / life;
      _emit.speedVariance = 0;
      _emit.spread = 0;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.06;
      _emit.sizeVariance = 0.6;
      _emit.life = life;
      _emit.lifeVariance = 0;
      _emit.spin = randRange(-12, 12);
      _emit.tint = null;
      _emit.time = time;
      this.fragments.emit(1, _emit);
    }
  }

  _updateWarps() {
    const c = settings.parallax;
    const st = this._warpState;

    /* --- the pull at the entry, while the body goes --- */
    const pt = saturate((this.age - c.dissolveDelay) / Math.max(0.02, c.dissolveTime + 0.2));
    st.size = c.warpSize;
    st.strength = c.pullStrength * Math.sin(pt * Math.PI);
    st.front = lerp(0.9, 0.15, Easing.inQuad(pt));
    st.sign = -1;
    st.rot = this.gates[0].state.rot;
    this.pullMaterial.userData.sync(st);
    this._gateCentre(0, this.pull.position);
    this.pull.visible = this.age > c.dissolveDelay && pt < 1;

    /* --- the push at the exit, on arrival --- */
    if (this._arriveAge < 0) {
      this.push.visible = false;
      return;
    }
    const t = saturate(this._arriveAge / Math.max(0.02, c.pushTime));
    st.size = c.warpSize * 1.3;
    st.strength = c.pushStrength * (1 - t) * smoothstep(0, 0.08, t);
    st.front = lerp(0.12, 0.95, Easing.outCubic(t));
    st.sign = 1;
    st.rot = this.gates[1].state.rot;
    this.pushMaterial.userData.sync(st);
    this._gateCentre(1, this.push.position);
    this.push.visible = t < 1;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.parallax;
    const g = settings.global;
    this._sync();
    this._update(dt);

    /* --- the pulse: streaks riding down the corridor --- */
    if (this.age >= this._departTime()) {
      const n = Math.round(this.transitEmitter.tick(dt, c.transitRate) * g.particleCount);
      if (n > 0) {
        _emit.position = _pos.copy(this.position);
        _emit.radius = c.ringRadius * 0.45;
        _emit.direction = _dir.copy(this.direction);
        _emit.speed = c.speed * g.speed * c.transitSpeed;
        _emit.speedVariance = 0.3;
        _emit.spread = 0.08;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = 0.08;
        _emit.sizeVariance = 0.5;
        _emit.life = c.transitLife;
        _emit.lifeVariance = 0.4;
        _emit.spin = 0;
        _emit.tint = null;
        _emit.time = frame.uTime.value;
        this.transit.emit(n, _emit);
      }
      this.ctx.shake.rumble?.(c.transitRumble * g.cameraShake, dt);
    }
  }

  onImpact() {
    const c = settings.parallax;
    const g = settings.global;
    this._arriveAge = 0;
    this.pointAt(1, _pos);

    /* --- the move: x/z only, and only while the body is still ours --- */
    if (this._owns && !this._moved) {
      const character = this.ctx.character;
      character.position.x = _pos.x;
      character.position.z = _pos.z;
      character.position.y = 0;
      character.setFacing?.(this._facing);
      this._hideBody(true);
      this._lastWritten.copy(character.position);
    }
    this._moved = true;
    this.gates[1].flare = 1;
    this.fragmentEmitter.reset();

    /* --- whoever is standing at the exit --- */
    const field = this.ctx.dummies;
    if (field?.findTargets) {
      _force.impulse = c.hitImpulse;
      _force.lift = c.hitLift;
      _force.spin = c.hitSpin;
      field.findTargets(_pos.x, _pos.z, c.exitRadius, _targets);
      for (const dummy of _targets) {
        _dir.set(dummy.position.x - _pos.x, 0, dummy.position.z - _pos.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        else _dir.normalize().addScaledVector(this.direction, c.hitForward).normalize();
        dummy.kill(_dir.x, _dir.z, _force);
      }
    }

    /* --- the landing --- */
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.exitRadius * c.decalScale * g.explosionIntensity,
      life: c.decalLife,
      width: 0.06,
      intensity: 1.1,
      colorA: getColor(c.colorLip),
      colorB: getColor(c.colorPortalCore)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: c.exitRadius * 0.9,
      life: c.decalLife * 1.6,
      intensity: 0.7,
      colorA: getColor(c.colorDust),
      colorB: getColor(c.colorDust)
    });
    _a.copy(_pos).setY(c.gateHeight * 0.8);
    this.ctx.bursts.spawn(BurstMode.AIR, _a, {
      radius: 0.3,
      endRadius: c.burstRadius * g.explosionIntensity,
      life: c.burstLife,
      intensity: c.burstIntensity,
      opacity: 0.7,
      fresnel: 2.0 * g.fresnel,
      squash: 0.7,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    _emit.position = _a;
    _emit.radius = 0.25;
    _emit.direction = _dir.copy(this.direction).setY(0.25).normalize();
    _emit.speed = c.arrivalSparkSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.9;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.5;
    _emit.life = c.transitLife * 1.4;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.transit.emit(Math.round(c.arrivalSparks * g.particleCount), _emit);

    this.ctx.shake.add(c.impactShake * g.explosionIntensity * g.cameraShake, 1 / Math.max(0.05, c.shakeDuration), 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * g.explosionIntensity);
    this.lightBoost = c.lightIntensity * c.lightBoost * g.explosionIntensity;
  }

  onFade(dt) {
    const c = settings.parallax;
    this._arriveAge += dt;
    this._sync();
    this._update(dt);
    this._gateCentre(1, this.position);
    this.position.y = c.gateHeight;
  }

  onDestroy() {
    // First, always: the body is shown wherever it stands.
    this._releaseCharacter();
    this._arriveAge = -1;
    for (const gate of this.gates) gate.root.visible = false;
    this.rings.count = 0;
    this.pull.visible = false;
    this.push.visible = false;
    this.double.root.visible = false;
  }

  dispose() {
    this._releaseCharacter();
    this.irisGeometry.dispose();
    this.bezelGeometry.dispose();
    this.bezelMaterial.dispose();
    for (const gate of this.gates) gate.material.dispose();
    this.ringGeometry.dispose();
    this.rings.dispose();
    this.ringMaterial.dispose();
    this.double.dispose();
    this.bodyMaterial.dispose();
    this.warpGeometry.dispose();
    this.pullMaterial.dispose();
    this.pushMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⦾  Parallax Blink');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 3, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 120, 0.5, 'transit pulse (m/s)');
  R(cast, c, 'transitDelay', 0, 2, 0.01, 'held in transit (s)');
  R(cast, c, 'lifetime', 0, 3, 0.01, 'gates hold after (s)');
  R(cast, c, 'closeTime', 0.05, 3, 0.01, 'gates close (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const gate = folder.addFolder('1 · Irises');
  R(gate, c, 'irisRadius', 0.3, 3, 0.01, 'radius (m)');
  R(gate, c, 'gateHeight', 0.3, 3, 0.01, 'centre height (m)');
  R(gate, c, 'gateOffset', 0, 3, 0.01, 'stand-off from ends (m)');
  R(gate, c, 'openTime', 0.02, 2, 0.01, 'open (s)');
  R(gate, c, 'exitLag', 0, 1.5, 0.01, 'exit opens after (s)');
  R(gate, c, 'irisBlades', 3, 16, 1, 'blades');
  R(gate, c, 'irisBladeCurve', -4, 4, 0.05, 'blade curve');
  R(gate, c, 'irisAperture', 0.2, 0.98, 0.01, 'full aperture');
  R(gate, c, 'irisDrive', -6, 6, 0.05, 'drive turn (rad)');
  R(gate, c, 'irisChrome', 0, 1, 0.01, 'chrome');
  R(gate, c, 'irisBrush', 0, 1, 0.01, 'brushing');
  R(gate, c, 'irisSeam', 0, 3, 0.01, 'seams');
  R(gate, c, 'irisFresnel', 0, 4, 0.05, 'fresnel');
  R(gate, c, 'irisLip', 0, 6, 0.05, 'lip glow');
  R(gate, c, 'irisLipWidth', 0.005, 0.3, 0.005, 'lip width');
  gate.addColor(c, 'colorChrome').name('chrome');
  gate.addColor(c, 'colorChromeDark').name('chrome, shade');
  gate.addColor(c, 'colorLip').name('blue light');
  R(gate, c, 'gateRingScale', 0, 4, 0.05, 'open ring (× radius)');
  R(gate, c, 'gateRingLife', 0.05, 2, 0.01, 'open ring life');
  R(gate, c, 'openShake', 0, 0.5, 0.005, 'open shake');

  const portal = folder.addFolder('Portal (through the aperture)');
  R(portal, c, 'portalDepth', 0, 1.5, 0.01, 'parallax depth');
  R(portal, c, 'portalRings', 0, 30, 0.1, 'tunnel rings');
  R(portal, c, 'portalSpeed', -15, 15, 0.1, 'tunnel speed');
  R(portal, c, 'portalSwirl', -3, 3, 0.01, 'swirl');
  R(portal, c, 'portalGlow', 0, 8, 0.05, 'glow');
  R(portal, c, 'portalOpacity', 0, 1, 0.01, 'opacity');
  portal.addColor(c, 'colorPortalA').name('inner');
  portal.addColor(c, 'colorPortalB').name('outer');
  portal.addColor(c, 'colorPortalCore').name('core');

  const bezel = folder.addFolder('2 · Housing');
  R(bezel, c, 'bezelSpin', -4, 4, 0.01, 'idle spin (rad/s)');
  R(bezel, c, 'bezelLights', 0, 6, 0.05, 'indicator lights');
  R(bezel, c, 'bezelLightCount', 1, 64, 1, 'light count');
  R(bezel, c, 'bezelChase', -3, 3, 0.01, 'chase speed');
  R(bezel, c, 'bezelGroove', 0, 1, 0.01, 'groove');

  const ring = folder.addFolder('3 · Corridor');
  R(ring, c, 'ringCount', 0, MAX_RINGS, 1, 'rings');
  R(ring, c, 'ringRadius', 0.1, 3, 0.01, 'radius (m)');
  R(ring, c, 'ringSizeJitter', 0, 1, 0.01, 'size jitter');
  R(ring, c, 'ringThickness', 0, 4, 0.05, 'depth');
  R(ring, c, 'ringDelay', 0, 2, 0.01, 'assemble after (s)');
  R(ring, c, 'ringStagger', 0, 2, 0.01, 'stagger (s)');
  R(ring, c, 'ringAssemble', 0.02, 2, 0.01, 'assemble (s)');
  R(ring, c, 'ringStartScale', 0, 3, 0.01, 'starts at (× radius)');
  R(ring, c, 'ringBob', 0, 0.6, 0.005, 'float (m)');
  R(ring, c, 'ringBobSpeed', 0, 6, 0.05, 'float speed');
  R(ring, c, 'ringTilt', 0, 1, 0.01, 'tilt (rad)');
  R(ring, c, 'ringSpin', -6, 6, 0.05, 'spin (rad/s)');
  R(ring, c, 'ringDashes', 1, 24, 1, 'dashes');
  R(ring, c, 'ringDashSpeed', -3, 3, 0.01, 'dash speed');
  R(ring, c, 'ringFresnel', 0, 4, 0.05, 'fresnel');
  R(ring, c, 'ringGlow', 0, 8, 0.05, 'glow');
  R(ring, c, 'ringOpacity', 0, 1, 0.01, 'opacity');
  R(ring, c, 'ringPulseWidth', 0.05, 6, 0.05, 'pulse width (m)');
  R(ring, c, 'ringPulseScale', 0, 1, 0.01, 'pulse swell');
  R(ring, c, 'ringPulseGlow', 0, 10, 0.05, 'pulse glow');
  ring.addColor(c, 'colorRing').name('ring');
  ring.addColor(c, 'colorRingPulse').name('pulse');

  const body = folder.addFolder('4 · Dissolve / reassembly');
  R(body, c, 'dissolveDelay', 0, 1.5, 0.01, 'dissolve after (s)');
  R(body, c, 'dissolveTime', 0.05, 3, 0.01, 'dissolve (s)');
  R(body, c, 'reassembleTime', 0.05, 3, 0.01, 'reassemble (s)');
  R(body, c, 'bodyDepth', 0, 2, 0.01, 'order depth (m)');
  R(body, c, 'dissolveBand', 0.02, 1, 0.01, 'front width');
  R(body, c, 'dissolveVoxel', 2, 60, 0.5, 'voxels per metre');
  R(body, c, 'dissolveNoise', 0, 1, 0.01, 'front noise');
  R(body, c, 'dissolvePull', 0, 1, 0.01, 'pull into iris');
  R(body, c, 'dissolveSpin', -12, 12, 0.05, 'spiral (rad)');
  R(body, c, 'dissolveEdgeGlow', 0, 12, 0.05, 'edge glow');
  R(body, c, 'dissolveEdgeWidth', 0.02, 1, 0.01, 'edge width');
  R(body, c, 'dissolveRim', 0, 4, 0.05, 'rim');
  R(body, c, 'dissolveTint', 0, 1, 0.01, 'blue tint ahead of front');
  body.addColor(c, 'colorSkin').name('skin tint');
  body.addColor(c, 'colorDissolveEdge').name('edge');

  const frag = folder.addFolder('5 · Fragments');
  R(frag, c, 'fragmentRate', 0, 1500, 1, 'per second');
  R(frag, c, 'fragmentLife', 0.05, 2, 0.01, 'flight (s)');
  R(frag, c, 'fragmentSize', 0.01, 0.4, 0.005, 'size');
  R(frag, c, 'fragmentEndSize', 0, 2, 0.01, 'end size');
  R(frag, c, 'fragmentGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(frag, c, 'colorFrag', 'fragment colour');

  const transit = folder.addFolder('6 · Transit');
  R(transit, c, 'transitRate', 0, 1000, 1, 'per second');
  R(transit, c, 'transitSpeed', 0, 2, 0.01, 'speed (× pulse)');
  R(transit, c, 'transitLife', 0.05, 2, 0.01, 'lifetime');
  R(transit, c, 'transitSize', 0.01, 0.4, 0.005, 'size');
  R(transit, c, 'transitStretch', 0, 2, 0.01, 'stretch');
  R(transit, c, 'transitGlow', 0, 8, 0.05, 'glow');
  R(transit, c, 'transitRumble', 0, 0.5, 0.005, 'rumble');
  Editor.gradient(transit, c, 'colorTransit', 'transit colour');

  const warp = folder.addFolder('7 · Warp');
  R(warp, c, 'warpSize', 0.2, 10, 0.05, 'size (m)');
  R(warp, c, 'pullStrength', 0, 3, 0.01, 'entry pull');
  R(warp, c, 'pushStrength', 0, 3, 0.01, 'exit push');
  R(warp, c, 'pushTime', 0.02, 2, 0.01, 'push time');

  const arrive = folder.addFolder('8 · Arrival');
  R(arrive, c, 'exitRadius', 0.2, 6, 0.05, 'blast radius (m)');
  R(arrive, c, 'hitImpulse', 0, 20, 0.1, 'impulse (m/s)');
  R(arrive, c, 'hitLift', 0, 12, 0.1, 'lift (m/s)');
  R(arrive, c, 'hitSpin', 0, 6, 0.05, 'spin');
  R(arrive, c, 'hitForward', 0, 2, 0.01, 'down the corridor');
  R(arrive, c, 'burstRadius', 0.1, 8, 0.05, 'pressure shell (m)');
  R(arrive, c, 'burstLife', 0.05, 2, 0.01, 'shell life');
  R(arrive, c, 'burstIntensity', 0, 6, 0.05, 'shell intensity');
  arrive.addColor(c, 'colorBurstA').name('shell core');
  arrive.addColor(c, 'colorBurstB').name('shell body');
  arrive.addColor(c, 'colorBurstC').name('shell edge');
  R(arrive, c, 'decalScale', 0, 4, 0.05, 'shock ring (× radius)');
  R(arrive, c, 'decalLife', 0.05, 3, 0.01, 'ring life');
  arrive.addColor(c, 'colorDust').name('dust');
  R(arrive, c, 'arrivalSparks', 0, 300, 1, 'sparks');
  R(arrive, c, 'arrivalSparkSpeed', 0, 20, 0.1, 'spark speed');
  R(arrive, c, 'impactShake', 0, 1.5, 0.01, 'shake');
  R(arrive, c, 'shakeDuration', 0.05, 2, 0.01, 'shake settles over');
  R(arrive, c, 'impactFlash', 0, 1, 0.01, 'flash');
  arrive.addColor(c, 'colorFlash').name('flash');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightBoost', 0, 6, 0.05, 'arrival punch (× intensity)');
}
