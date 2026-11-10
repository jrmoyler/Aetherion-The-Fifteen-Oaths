import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createResonanceShellMaterial,
  createResonanceWarpMaterial,
  createResonanceFloorMaterial,
  createResonancePlateMaterial,
  createResonanceHullMaterial,
  createResonanceCraterMaterial
} from '../../materials/collective/ResonancePulseMaterial.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'sonic';

/** Rings per cast. The editor's `pulseCount` slider clamps to this. */
const MAX_PULSES = 12;
/** Grid the shell is wrapped from: around × apex-to-rim. */
const SHELL_AROUND = 56;
const SHELL_DOWN = 22;
/** Two boom domes (the blast and its echo) and the hum that stands after. */
const MAX_DOMES = 3;
const HUM = 2;
/** Grid the travelling shock body (the hull) is lofted from: around × along. */
const HULL_AROUND = 44;
const HULL_ALONG = 84;
/** Grid of the crater lip: around × across. */
const CRATER_AROUND = 80;
const CRATER_ACROSS = 12;

const _emit = {};
const _pos = new Vector3();
const _hand = new Vector3();
const _end = new Vector3();
const _dir = new Vector3();
const _zAxis = new Vector3(0, 0, 1);
const _up = new Vector3(0, 1, 0);
const _yAxis = new Vector3(0, 1, 0);
const _peelDir = new Vector3();

/**
 * SONIC — Resonance Pulse.
 *
 * A line cast that is a *train*: `pulseCount` pressure rings leave the hand
 * `pulseInterval` apart and travel down the line at the cast speed, opening as
 * they go, and the last one landing sets off the boom. Sound, not force — so
 * the read is a lens and a beat, not a blast.
 *
 * Layers:
 *
 *   1. **RINGS** — each ring is a spherical cap built in the vertex stage
 *      (`ResonancePulseMaterial`), its rim facing down the cast. The fragment
 *      draws a thin rim split into red / green / blue, interference bands from
 *      two beating waves, standing-wave lobes and a fresnel lift, soft-faded
 *      where it cuts the floor.
 *   2. **WARP** — a second copy of every shell on LAYER.DISTORTION writing a
 *      screen-radial refraction offset in a band at its rim, so each ring
 *      visibly bends the world it passes through; the boom's floor ripple has
 *      its own warp pass.
 *   3. **DUST** — non-additive smoke kicked out sideways from under each ring
 *      every `dustSpacing` metres, because the air it pushes has to go
 *      somewhere.
 *   4. **RIPPLES** — RIPPLE decals laid on the floor under every Nth ring.
 *   5. **MUZZLE** — little RING particles thrown off the hand as each pulse
 *      leaves, and a tick of shake per pulse so the train is *felt* as a
 *      rhythm.
 *   6. **BOOM** — when the last ring lands: two pressure **domes** (the
 *      same filled shell, stood on the floor with its lip rolling round the
 *      foot — the blast and its echo), an AIR shell, a SHOCKWAVE decal, a
 *      chromatic ripple train racing across the floor (colour + warp), a ring
 *      of dust, a light punch, a flash and a camera kick.
 *   7. **CHLADNI PLATE** — the floor answers the way sand on a sounding plate
 *      does: under the train a *lane* of standing-wave nodal lines is sorted
 *      out of a dark stain behind the lead ring, and at the boom a *disc* of
 *      nodal lines (cos nθ · sin kπr) that keeps morphing between two modes for
 *      the whole linger, its ridges pulsing with the hum. Both stay until the
 *      exit, then blow away grain by grain.
 *   8. **HUM** — after the boom a smaller filled dome stands over the plate and
 *      breathes in and out at `humRate`: the resonance the cast is named for,
 *      still ringing.
 *
 * ## The hull — the shape of the read (third pass)
 *
 * Seen from the camera behind the caster, any train of shells is end-on and
 * reads as nested rims, however it is shaded. So the train is now carried by
 * one **travelling shock body** (`createResonanceHullMaterial`): a long,
 * lofted, ground-hugging body of shoved air whose blunt bulge front rides the
 * lead ring, whose sheath trails `hullLength` metres behind it and boils into
 * a ragged wake, and through which every later ring runs as a bead of
 * compression. It is dark and dusty, lit by the sun, with violet only on its
 * silhouette and in a hot crest round the bulge. Dust and grit are peeled off
 * the floor under its front and stream back into the wake. When the lead ring
 * lands, the body piles up at the target — it shortens and swells as the rest
 * of the train runs into it — and the last ring sets off the boom, into which
 * it collapses.
 *
 * The boom is a **dark pressure burst** (an EARTH dust ball in the deep
 * ramp), a DUSTRING decal and a low ring of rolling dust, and the floor is
 * heaved into a lit **crater lip** (`createResonanceCraterMaterial`) round
 * the Chladni plate; the lip breathes with the hum and its cracks show violet
 * on each beat, leaking dust, until it sinks away on the exit. The old ring
 * shells and filled domes are still built (`ringShellOpacity`,
 * `boomDomeShow`) but default to off.
 *
 * ## The shells are bodies, not outlines
 *
 * Each ring is a filled lens of compressed air — a deep-violet body,
 * normal-blended so it darkens what it passes in front of, densest toward the
 * front, with interference bands running through it — whose leading edge
 * rolls back over itself into a thick **vortex lip** (built in the same vertex
 * stage), lit from the sun and streaked with air rolling round the tube. The
 * colour ramp is white-hot → pink tint → saturated violet → near-black deep.
 *
 * ## Decisions
 *
 * The base front is replaced (`advance`) by the train's own clock. Each ring
 * integrates its own distance, so the lead ring sets `position` (and the
 * default line hit capsule — this cast is happy to fell what it passes), and
 * the frame the *last* ring lands is the frame `advance` reports the end.
 *
 * A ring record captures only events — when it left, when it landed, a seed,
 * how far it has travelled. Its radius, height, brightness, banding and colour
 * are all resolved from `settings.sonic` every frame, so dragging `ringEnd` or
 * `spread` re-shapes rings that are already in flight.
 */
export class ResonancePulseAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layers 1 & 2: the shells and their warp ---- */
    // One grid for every ring and its warp twin: only `uv` is read, the cap is
    // placed in the vertex stage.
    this.shellGeometry = new PlaneGeometry(1, 1, SHELL_AROUND, SHELL_DOWN);
    this.rings = [];
    for (let i = 0; i < MAX_PULSES; i++) {
      const material = createResonanceShellMaterial();
      const mesh = new Mesh(this.shellGeometry, material);
      mesh.name = `SonicRing${i}`;
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false; // the cap is built in the shader
      mesh.renderOrder = 13;
      mesh.visible = false;
      this.group.add(mesh);

      const warpMaterial = createResonanceWarpMaterial();
      const warp = new Mesh(this.shellGeometry, warpMaterial);
      warp.name = `SonicRingWarp${i}`;
      warp.layers.set(LAYER.DISTORTION);
      warp.frustumCulled = false;
      warp.visible = false;
      this.group.add(warp);

      this.rings.push({
        mesh,
        material,
        warp,
        warpMaterial,
        state: { radius: 1, fade: 0, seed: Math.random() * 10, spread: 0, lip: 1, fill: 1, warp: 1, glow: 1 },
        launched: false,
        landed: false,
        done: false,
        launchAge: 0,
        landAge: 0,
        distance: 0,
        dustAt: 0,
        rippleAt: 0
      });
    }

    /* ---- layer 6: the boom's floor ripple ---- */
    this.floorGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.floorMaterial = createResonanceFloorMaterial('color');
    this.floorWarpMaterial = createResonanceFloorMaterial('warp');
    this.floor = new Mesh(this.floorGeometry, this.floorMaterial);
    this.floor.name = 'SonicFloor';
    this.floor.layers.set(LAYER.VFX);
    this.floor.renderOrder = 6;
    this.floor.frustumCulled = false;
    this.floor.visible = false;
    this.group.add(this.floor);

    this.floorWarp = new Mesh(this.floorGeometry, this.floorWarpMaterial);
    this.floorWarp.name = 'SonicFloorWarp';
    this.floorWarp.layers.set(LAYER.DISTORTION);
    this.floorWarp.frustumCulled = false;
    this.floorWarp.visible = false;
    this.group.add(this.floorWarp);

    this._floorState = { quadSize: 1, front: 0, fade: 0 };

    /* ---- layers 6 & 8: the boom domes and the hum ---- */
    this.domes = [];
    for (let i = 0; i < MAX_DOMES; i++) {
      const material = createResonanceShellMaterial();
      const mesh = new Mesh(this.shellGeometry, material);
      mesh.name = i === HUM ? 'SonicHum' : `SonicDome${i}`;
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      mesh.renderOrder = 12;
      mesh.visible = false;
      mesh.quaternion.setFromUnitVectors(_zAxis, _yAxis);
      this.group.add(mesh);
      const warpMaterial = createResonanceWarpMaterial();
      const warp = new Mesh(this.shellGeometry, warpMaterial);
      warp.name = `${mesh.name}Warp`;
      warp.layers.set(LAYER.DISTORTION);
      warp.frustumCulled = false;
      warp.visible = false;
      warp.quaternion.copy(mesh.quaternion);
      this.group.add(warp);
      this.domes.push({
        mesh,
        material,
        warp,
        warpMaterial,
        state: { radius: 1, fade: 0, seed: Math.random() * 10, spread: 1.2, lip: 1, fill: 1, warp: 1, glow: 1 }
      });
    }

    /* ---- layer 7: the Chladni lane and plate ---- */
    this.plateGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.laneMaterial = createResonancePlateMaterial('lane');
    this.lane = new Mesh(this.plateGeometry, this.laneMaterial);
    this.lane.name = 'SonicLane';
    this.lane.layers.set(LAYER.VFX);
    this.lane.renderOrder = 5;
    this.lane.frustumCulled = false;
    this.lane.visible = false;
    this.group.add(this.lane);
    this.plateMaterial = createResonancePlateMaterial('disc');
    this.plate = new Mesh(this.plateGeometry, this.plateMaterial);
    this.plate.name = 'SonicPlate';
    this.plate.layers.set(LAYER.VFX);
    this.plate.renderOrder = 5;
    this.plate.frustumCulled = false;
    this.plate.visible = false;
    this.group.add(this.plate);
    this._laneState = { seed: 0, quadX: 1, quadY: 1, radius: 1, length: 1, reveal: 0, morph: 0, hum: 0, fade: 1, dissolve: 0 };
    this._plateState = { seed: 0, quadX: 1, quadY: 1, radius: 1, length: 1, reveal: 0, morph: 0, hum: 0, fade: 1, dissolve: 0 };

    /* ---- layer 1b: the hull, the travelling shock body ---- */
    this.hullGeometry = new PlaneGeometry(1, 1, HULL_AROUND, HULL_ALONG);
    this.hullMaterial = createResonanceHullMaterial('color');
    this.hull = new Mesh(this.hullGeometry, this.hullMaterial);
    this.hull.name = 'SonicHull';
    this.hull.layers.set(LAYER.VFX);
    this.hull.frustumCulled = false;
    this.hull.renderOrder = 13;
    this.hull.visible = false;
    this.group.add(this.hull);
    this.hullWarpMaterial = createResonanceHullMaterial('warp');
    this.hullWarp = new Mesh(this.hullGeometry, this.hullWarpMaterial);
    this.hullWarp.name = 'SonicHullWarp';
    this.hullWarp.layers.set(LAYER.DISTORTION);
    this.hullWarp.frustumCulled = false;
    this.hullWarp.visible = false;
    this.group.add(this.hullWarp);
    this._hullState = {
      seed: 0,
      span: 1,
      front: 0,
      back: 0,
      frontR: 1,
      ride: 0.5,
      swell: 0,
      burst: 0,
      fade: 0,
      beads: new Array(MAX_PULSES).fill(-100),
      beadCount: 0
    };

    /* ---- layer 8: the crater lip ---- */
    this.craterGeometry = new PlaneGeometry(1, 1, CRATER_AROUND, CRATER_ACROSS);
    this.craterMaterial = createResonanceCraterMaterial();
    this.crater = new Mesh(this.craterGeometry, this.craterMaterial);
    this.crater.name = 'SonicCrater';
    this.crater.layers.set(LAYER.VFX);
    this.crater.frustumCulled = false;
    this.crater.renderOrder = 7;
    this.crater.visible = false;
    this.group.add(this.crater);
    this._craterState = { seed: 0, radius: 1, width: 1, height: 0, hum: 0, fade: 0, dissolve: 0 };

    // Per-cast clocks, reset in `onSpawn`; initialised so the HUD can read them.
    this._peelAt = 0;
    this._puffClock = 0;
    this._count = 0;
    this._ended = false;
    this._boomAge = -1;
    this._lastLaunch = -10;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 3: dust ---- */
    // Non-additive: dust occludes, and an additive version is a pink haze.
    this.dust = particles.get('sonic.dust', {
      capacity: 2400,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.9
    });
    this.dust.uniforms.uEndSize.value = 2.6;
    this.dust.uniforms.uSizeIn.value = 0.1;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.4;

    /* ---- layer 3b: grit peeled off the floor under the hull ---- */
    this.grit = particles.get('sonic.grit', {
      capacity: 900,
      shape: ParticleShape.CHIP,
      additive: false,
      softFade: 0.2
    });
    this.grit.uniforms.uEndSize.value = 0.8;
    this.grit.uniforms.uSizeIn.value = 0.02;
    this.grit.uniforms.uFadeIn.value = 0.02;
    this.grit.uniforms.uFadeOut.value = 0.3;
    this.grit.uniforms.uDrag.value = 0.8;
    this.grit.uniforms.uTurbulence.value = 0.2;

    /* ---- layer 5: muzzle rings ---- */
    this.muzzle = particles.get('sonic.muzzle', {
      capacity: 300,
      shape: ParticleShape.RING,
      additive: true,
      softFade: 0.2
    });
    this.muzzle.uniforms.uDrag.value = 3.0;
    this.muzzle.uniforms.uEndSize.value = 3.2;
    this.muzzle.uniforms.uSizeIn.value = 0.01;
    this.muzzle.uniforms.uFadeIn.value = 0.01;
    this.muzzle.uniforms.uFadeOut.value = 0.75;
    this.muzzle.uniforms.uGravity.value.set(0, 0, 0);
    this.muzzle.uniforms.uTurbulence.value = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get instanceCount() {
    let n = 0;
    for (let i = 0; i < this._count; i++) if (this.rings[i].mesh.visible) n++;
    for (let i = 0; i < MAX_DOMES; i++) if (this.domes[i].mesh.visible) n++;
    return (
      n +
      (this.floor.visible ? 1 : 0) +
      (this.plate.visible ? 1 : 0) +
      (this.lane.visible ? 1 : 0) +
      (this.hull.visible ? 1 : 0) +
      (this.crater.visible ? 1 : 0)
    );
  }

  get impactDuration() {
    return Math.max(0.05, settings.sonic.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.05, settings.sonic.fadeTime);
  }

  /** The light beats with the train: a thump on every pulse that leaves. */
  lightShimmer() {
    const k = settings.sonic.lightThrob;
    const since = this.age - this._lastLaunch;
    return 1 - k * 0.6 + k * 1.2 * Math.exp(-since * 14);
  }

  /**
   * The train's own clock in place of the base front.
   *
   * Every launched ring integrates its own distance at the live cast speed;
   * the lead ring is the front everyone else reads (`u`, `position`), and the
   * frame the last ring lands is reported as the end.
   */
  advance(dt) {
    const c = settings.sonic;
    const speed = c.speed * settings.global.speed;
    const interval = Math.max(0, c.pulseInterval);

    let lead = 0;
    let allLanded = true;
    for (let i = 0; i < this._count; i++) {
      const ring = this.rings[i];

      if (!ring.launched) {
        if (this.age >= i * interval) this._launch(ring, i);
        else {
          allLanded = false;
          continue;
        }
      }

      if (!ring.landed) {
        ring.distance = Math.min(this.length, ring.distance + speed * dt);
        if (ring.distance >= this.length) {
          ring.landed = true;
          ring.landAge = this.age;
        }
      }
      if (!ring.landed) allLanded = false;
      lead = Math.max(lead, ring.distance);
    }

    this.front = lead;
    this.u = saturate(lead / this.length);
    this.pointAt(this.u, this.position);
    this.position.y = c.ringHeight;

    if (allLanded && !this._ended) {
      this._ended = true;
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.sonic;

    this._count = Math.max(1, Math.min(MAX_PULSES, Math.round(c.pulseCount)));
    this._ended = false;
    this._boomAge = -1;
    this._lastLaunch = -10;
    // The first ring launches inside `advance`, before `onTravel` runs.
    this._syncParticles();

    for (let i = 0; i < MAX_PULSES; i++) {
      const ring = this.rings[i];
      ring.launched = false;
      ring.landed = false;
      ring.done = false;
      ring.distance = 0;
      ring.dustAt = 0;
      ring.rippleAt = 0;
      ring.state.seed = Math.random() * 10;
      // Rim facing down the cast; set once, the line does not turn.
      ring.mesh.quaternion.setFromUnitVectors(_zAxis, this.direction);
      ring.warp.quaternion.copy(ring.mesh.quaternion);
      ring.mesh.visible = false;
      ring.warp.visible = false;
    }

    this.floor.visible = false;
    this.floorWarp.visible = false;
    for (let i = 0; i < MAX_DOMES; i++) {
      this.domes[i].mesh.visible = false;
      this.domes[i].warp.visible = false;
      this.domes[i].state.seed = Math.random() * 10;
    }
    this._laneState.seed = Math.random() * 10;
    this._plateState.seed = Math.random() * 10;
    this.plate.visible = false;
    this.lane.visible = false;
    this.hull.visible = false;
    this.hullWarp.visible = false;
    this.crater.visible = false;
    this._hullState.seed = Math.random() * 10;
    this._hullState.fade = 0;
    this._craterState.seed = Math.random() * 10;
    this._peelAt = 0;
    this._puffClock = 0;
  }

  /** Where the train leaves the caster. */
  _handPoint(out) {
    const c = settings.sonic;
    out.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    out.y = c.handHeight;
    return out;
  }

  /** One ring leaves the hand. */
  _launch(ring, index) {
    const c = settings.sonic;
    const g = settings.global;

    ring.launched = true;
    ring.launchAge = this.age;
    ring.distance = 0;
    this._lastLaunch = this.age;

    // The little rings off the hand: the mouth of the sound.
    this._handPoint(_hand);
    _emit.position = _hand;
    _emit.radius = 0.05;
    _emit.direction = this.direction;
    _emit.speed = c.muzzleSpeed;
    _emit.speedVariance = 0.3;
    _emit.spread = 0.15;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.4;
    _emit.sizeVariance = 0.25;
    _emit.life = c.muzzleLife;
    _emit.lifeVariance = 0.2;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.muzzle.emit(Math.round(c.muzzleRings * g.particleCount), _emit);

    // A tick per pulse, slightly heavier on the first.
    this.ctx.shake.add(c.pulseShake * (index === 0 ? 1.6 : 1) * g.cameraShake, 9, 34);
  }

  /* ------------------------------------------------------------------ */
  /* Resolving a ring — every metre from live settings                    */
  /* ------------------------------------------------------------------ */

  /** Ring centre at `s` (0..1) along the line. */
  _ringCentre(s, out) {
    const c = settings.sonic;
    this._handPoint(_hand);
    this.pointAt(1, _end).setY(c.ringHeight);
    out.lerpVectors(_hand, _end, s);
    // Height settles early: the ring drops from the hand to its cruising
    // height in the first stretch rather than sliding down the whole line.
    out.y = lerp(c.handHeight, c.ringHeight, Easing.outQuad(s));
    return out;
  }

  _ringRadius(s, index) {
    const c = settings.sonic;
    const r = lerp(c.ringStart, c.ringEnd, Math.pow(saturate(s), Math.max(0.05, c.ringCurve)));
    return Math.max(0.02, r * (1 - saturate(c.pulseShrink) * index));
  }

  /** Drive one ring's mesh, warp twin and ground effects. */
  _updateRing(ring, index, fadeAll) {
    const c = settings.sonic;
    if (!ring.launched || ring.done) return;

    const s = saturate(ring.distance / this.length);
    let radius = this._ringRadius(s, index);
    let fade = saturate((this.age - ring.launchAge) / Math.max(0.005, c.birthTime));
    fade *= Math.max(0, 1 - saturate(c.pulseDim) * index);

    if (ring.landed) {
      const t = saturate((this.age - ring.landAge) / Math.max(0.02, c.arriveFade));
      radius *= 1 + c.arriveGrow * Easing.outQuad(t);
      fade *= 1 - Easing.inQuad(t);
      if (t >= 1) {
        ring.done = true;
        ring.mesh.visible = false;
        ring.warp.visible = false;
        return;
      }
    }
    fade *= fadeAll;

    this._ringCentre(s, ring.mesh.position);
    ring.warp.position.copy(ring.mesh.position);
    ring.state.radius = radius;
    // The shell itself is off by default (the hull carries the train); its
    // refraction stays as a faint bend at each ring.
    ring.state.fade = fade * saturate(c.ringShellOpacity);
    ring.material.userData.sync(ring.state);
    ring.mesh.visible = ring.state.fade > 0.002;
    ring.state.fade = fade;
    ring.state.warp = c.ringWarp;
    ring.warpMaterial.userData.sync(ring.state);
    ring.warp.visible = fade > 0.002 && c.ringWarp * c.warpStrength > 0.001;

    if (!ring.landed) this._ringGroundFx(ring, index, radius);
  }

  /** Dust kicked out from under a passing ring, and ripples laid behind it. */
  _ringGroundFx(ring, index, radius) {
    const c = settings.sonic;
    const g = settings.global;
    const time = frame.uTime.value;

    const dustStep = Math.max(0.1, c.dustSpacing);
    while (ring.distance - ring.dustAt >= dustStep) {
      ring.dustAt += dustStep;
      const s = saturate(ring.dustAt / this.length);
      this.pointAt(s, _pos).setY(0.1);
      // Both sides: the ring pushes air out to its flanks, not ahead of it.
      for (let side = -1; side <= 1; side += 2) {
        _emit.position = _pos.addScaledVector(this.side, side * radius * 0.7);
        _emit.radius = 0.25;
        _emit.direction = _dir.copy(this.side).multiplyScalar(side).addScaledVector(_up, 0.35).normalize();
        _emit.speed = c.dustSpeed;
        _emit.speedVariance = 0.6;
        _emit.spread = 0.6;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = 0.6;
        _emit.sizeVariance = 0.5;
        _emit.life = c.dustLife;
        _emit.lifeVariance = 0.4;
        _emit.spin = 0.4;
        _emit.tint = null;
        _emit.time = time;
        this.dust.emit(Math.round(c.dustCount * g.particleCount), _emit);
        _pos.addScaledVector(this.side, -side * radius * 0.7);
      }
    }

    const every = Math.max(1, Math.round(c.rippleEvery));
    if (index % every !== 0) return;
    const rippleStep = Math.max(0.2, c.rippleSpacing);
    while (ring.distance - ring.rippleAt >= rippleStep) {
      ring.rippleAt += rippleStep;
      this.pointAt(saturate(ring.rippleAt / this.length), _pos);
      this.ctx.decals.spawn(DecalType.RIPPLE, _pos, {
        radius: radius * c.rippleRadius,
        life: c.rippleLife,
        width: c.rippleWidth,
        intensity: c.rippleIntensity,
        colorA: getColor(c.colorRippleA),
        colorB: getColor(c.colorRippleB),
        growth: 0.6
      });
    }
  }

  _syncParticles() {
    const c = settings.sonic;
    const g = settings.global;

    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    this.dust.uniforms.uGravity.value.set(0, c.dustRise, 0);
    this.dust.uniforms.uDrag.value = c.dustDrag;
    this.dust.uniforms.uSizeScale.value = (c.dustSize / 0.6) * g.particleSize;
    this.dust.uniforms.uLifeScale.value = g.particleLifetime;
    this.dust.uniforms.uSpeedScale.value = g.particleSpeed;
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uTurbulence.value = c.dustTurbulence * g.turbulence;

    this.grit.setGradient(getColor(c.colorGritA), getColor(c.colorGritB), getColor(c.colorGritC), getColor(c.colorGritD));
    this.grit.uniforms.uGravity.value.set(0, -9, 0);
    this.grit.uniforms.uSizeScale.value = g.particleSize;
    this.grit.uniforms.uLifeScale.value = g.particleLifetime;
    this.grit.uniforms.uSpeedScale.value = g.particleSpeed;
    this.grit.uniforms.uOpacity.value = g.opacity;

    this.muzzle.setGradient(getColor(c.colorMuzzleA), getColor(c.colorMuzzleB), getColor(c.colorMuzzleC), getColor(c.colorMuzzleD));
    this.muzzle.uniforms.uSizeScale.value = (c.muzzleSize / 0.4) * g.particleSize;
    this.muzzle.uniforms.uLifeScale.value = g.particleLifetime;
    this.muzzle.uniforms.uSpeedScale.value = g.particleSpeed;
    this.muzzle.uniforms.uOpacity.value = g.opacity;
    this.muzzle.uniforms.uGlow.value = c.muzzleGlow * g.glow;
  }

  /** The boom's ripple running out across the floor. */
  _updateFloor(fadeAll) {
    const c = settings.sonic;
    const g = settings.global;
    if (this._boomAge < 0) return;

    const reach = Math.max(0.1, c.floorRadius * g.explosionIntensity);
    const t = saturate(this._boomAge / Math.max(0.05, c.floorTime));
    // The trailing wavelets need room behind the front, so the front overruns
    // the reach by the length of the train and the shader trims it.
    const trail = Math.max(1, Math.round(c.floorRings)) * c.floorWavelength;
    const state = this._floorState;
    state.front = Easing.outCubic(t) * (reach + trail);
    state.fade = (1 - Easing.inQuad(t)) * fadeAll;
    state.quadSize = (reach + c.floorWidth * 3) * 2;

    const visible = t < 1 && state.fade > 0.002;
    this.floor.visible = visible;
    this.floorWarp.visible = visible;
    if (!visible) return;

    this.pointAt(1, this.floor.position).setY(0.03);
    this.floorWarp.position.copy(this.floor.position);
    this.floor.scale.set(state.quadSize, 1, state.quadSize);
    this.floorWarp.scale.copy(this.floor.scale);
    this.floorMaterial.userData.sync(state);
    this.floorWarpMaterial.userData.sync(state);
  }

  /** The beat, 0..1: a thump per ring leaving, then the hum's own rate. */
  _hum() {
    const c = settings.sonic;
    const since = this.age - this._lastLaunch;
    const thump = Math.exp(-since * 9);
    if (this._boomAge < 0) return thump;
    const ring = 0.5 + 0.5 * Math.sin(this._boomAge * c.humRate * Math.PI * 2);
    return Math.max(thump, ring * ring);
  }

  /** The Chladni lane down the line, revealed behind the lead ring. */
  _updateLane(exit) {
    const c = settings.sonic;
    const st = this._laneState;
    const half = Math.max(0.05, c.ringEnd * c.laneWidth);
    this.pointAt(0.5, this.lane.position).setY(0.024);
    this.lane.rotation.set(0, Math.atan2(-this.direction.x, -this.direction.z), 0);
    st.quadX = half * 2.4;
    st.quadY = this.length + 1;
    this.lane.scale.set(st.quadX, 1, st.quadY);
    st.radius = half;
    st.length = this.length;
    st.reveal = this._boomAge >= 0 ? this.length + 2 : this.front + 0.5;
    st.hum = this._hum();
    st.fade = 1 - Easing.inQuad(saturate(exit));
    st.dissolve = saturate(exit);
    this.laneMaterial.userData.sync(st);
    this.lane.visible = c.laneStain > 0 || c.plateLineWidth > 0;
  }

  /** The plate the boom leaves, and its figure crawling between modes. */
  _updatePlate(exit) {
    const c = settings.sonic;
    const g = settings.global;
    if (this._boomAge < 0) return;
    const st = this._plateState;
    const radius = Math.max(0.1, c.plateRadius * g.explosionIntensity);
    this.pointAt(1, this.plate.position).setY(0.026);
    st.quadX = st.quadY = radius * 2.4;
    this.plate.scale.set(st.quadX, 1, st.quadY);
    st.radius = radius;
    st.length = 0;
    st.reveal = Easing.outCubic(saturate(this._boomAge / Math.max(0.05, c.floorTime * 0.6))) * radius * 1.3;
    st.morph = 0.5 - 0.5 * Math.cos((this._boomAge * Math.PI) / Math.max(0.1, c.plateMorphTime));
    st.hum = this._hum();
    st.fade = 1 - Easing.inQuad(saturate(exit));
    st.dissolve = saturate(exit);
    this.plateMaterial.userData.sync(st);
    this.plate.visible = st.fade > 0.002;
  }

  /** The two boom domes and the hum, stood on the floor at the end. */
  _updateDomes(exit) {
    const c = settings.sonic;
    const g = settings.global;
    const out = 1 - Easing.inQuad(saturate(exit));
    for (let i = 0; i < MAX_DOMES; i++) {
      const dome = this.domes[i];
      const st = dome.state;
      let visible = false;
      if (this._boomAge >= 0) {
        if (i === HUM) {
          const a = this._boomAge - c.humDelay;
          if (a > 0) {
            const breathe = Math.sin(this._boomAge * c.humRate * Math.PI * 2);
            st.radius = Math.max(0.05, c.humRadius * (1 + c.humAmp * breathe) * Easing.outCubic(saturate(a / 0.35)));
            st.fade = saturate(a / 0.3) * c.humBright * out;
            st.spread = c.humSpread;
            st.lip = 0.8 + 0.3 * breathe;
            st.fill = c.humFill;
            st.glow = 1;
            st.tone = 1;
            st.warp = 0.5;
            visible = st.fade > 0.002;
          }
        } else {
          const a = this._boomAge - i * c.boomEcho;
          if (a > 0) {
            const scale = i === 0 ? 1 : c.boomEchoScale;
            st.radius = Math.max(0.05, c.boomDomeRadius * scale * g.explosionIntensity * Easing.outCubic(saturate(a / Math.max(0.02, c.boomDomeTime))));
            st.fade = (1 - Easing.inQuad(saturate((a - c.boomDomeTime * 0.35) / Math.max(0.05, c.boomDomeLife)))) * out;
            st.spread = c.boomDomeSpread;
            st.lip = 1.25;
            st.fill = c.boomDomeFill;
            st.glow = c.boomDomeGlow;
            st.tone = 1.35;
            st.warp = 1.4;
            visible = st.fade > 0.002;
          }
        }
      }
      if (visible) {
        st.fade *= saturate(c.boomDomeShow);
        visible = st.fade > 0.002;
      }
      dome.mesh.visible = visible;
      dome.warp.visible = visible;
      if (!visible) continue;
      this.pointAt(1, dome.mesh.position).setY(0);
      dome.warp.position.copy(dome.mesh.position);
      dome.material.userData.sync(st);
      dome.warpMaterial.userData.sync(st);
    }
  }

  /**
   * The hull: one shock body from the lead ring back along its wake.
   * Everything is resolved from the ring records and live settings.
   */
  _updateHull(fadeAll) {
    const c = settings.sonic;
    const st = this._hullState;
    const lead = this.rings[0];
    if (!lead.launched) {
      this.hull.visible = false;
      this.hullWarp.visible = false;
      return;
    }

    this._handPoint(_hand);
    this.pointAt(1, _end);
    const dx = _end.x - _hand.x;
    const dz = _end.z - _hand.z;
    const span = Math.max(0.05, Math.hypot(dx, dz));
    this.hull.position.set(_hand.x, 0, _hand.z);
    this.hull.rotation.set(0, Math.atan2(dx, dz), 0);
    this.hullWarp.position.copy(this.hull.position);
    this.hullWarp.rotation.copy(this.hull.rotation);

    const s = saturate(lead.distance / this.length);
    // Piling up: once the lead lands, the rest of the train runs into it.
    let pile = 0;
    if (this._boomAge >= 0) pile = 1;
    else if (lead.landed) {
      const window = Math.max(0.05, (this._count - 1) * Math.max(0, c.pulseInterval));
      pile = saturate((this.age - lead.landAge) / window);
    }
    const collapse = this._boomAge >= 0 ? saturate(this._boomAge / Math.max(0.02, c.hullCollapse)) : 0;
    // At the boom the body does not shrink away: it bursts outward, lies
    // down and tears apart — the dark pressure burst.
    const len = c.hullLength * (1 - saturate(c.hullCompress) * Easing.outQuad(pile)) * (1 - 0.5 * collapse);

    st.span = span;
    st.front = s * span;
    st.back = Math.max(0, st.front - Math.max(0.02, len));
    st.swell = c.hullSwell * Easing.outQuad(pile);
    st.burst = Easing.outCubic(collapse) * c.hullBurst;
    const width = lerp(c.ringStart, c.ringEnd, Math.pow(s, Math.max(0.05, c.ringCurve))) * c.hullWidth;
    st.frontR = width * (1 + st.swell);
    st.ride = c.ringEnd * c.hullWidth * c.hullAspect * (1 - saturate(c.hullSink));
    st.fade = saturate(st.front / 0.8) * (1 - Easing.inCubic(collapse)) * fadeAll;

    // A bead for every later ring still running through the body.
    st.beadCount = this._count;
    for (let i = 0; i < MAX_PULSES; i++) {
      const ring = this.rings[i];
      st.beads[i] = i > 0 && i < this._count && ring.launched && !ring.landed ? (ring.distance / this.length) * span : -100;
    }

    const visible = st.fade > 0.002 && st.front > 0.05;
    this.hull.visible = visible;
    this.hullWarp.visible = visible && c.hullWarp > 0;
    if (!visible) return;
    this.hullMaterial.userData.sync(st);
    this.hullWarpMaterial.userData.sync(st);

    if (!lead.landed) this._peel(lead, width);
  }

  /** Dust and grit peeled off the floor under the hull's front, thrown back into its wake. */
  _peel(lead, width) {
    const c = settings.sonic;
    const g = settings.global;
    const time = frame.uTime.value;
    const step = Math.max(0.1, c.peelSpacing);
    while (lead.distance - this._peelAt >= step) {
      this._peelAt += step;
      const s = saturate(this._peelAt / this.length);
      for (let side = -1; side <= 1; side += 2) {
        this.pointAt(s, _pos).setY(0.08).addScaledVector(this.side, side * width * (0.35 + 0.5 * Math.random()));
        _peelDir
          .copy(this.direction)
          .multiplyScalar(-c.peelBack)
          .addScaledVector(_up, c.peelLift)
          .addScaledVector(this.side, side * 0.55)
          .normalize();
        _emit.position = _pos;
        _emit.radius = 0.3;
        _emit.direction = _peelDir;
        _emit.speed = c.peelSpeed;
        _emit.speedVariance = 0.5;
        _emit.spread = 0.5;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = c.peelSize;
        _emit.sizeVariance = 0.5;
        _emit.life = c.dustLife;
        _emit.lifeVariance = 0.4;
        _emit.spin = 0.6;
        _emit.tint = null;
        _emit.time = time;
        this.dust.emit(Math.round(c.peelCount * g.particleCount), _emit);

        _emit.radius = 0.15;
        _emit.speed = c.gritSpeed;
        _emit.speedVariance = 0.5;
        _emit.spread = 0.6;
        _emit.size = c.gritSize;
        _emit.sizeVariance = 0.6;
        _emit.life = c.gritLife;
        _emit.spin = 6;
        this.grit.emit(Math.round(c.gritCount * g.particleCount), _emit);
      }
    }
  }

  /** The crater lip heaved up round the plate, breathing with the hum. */
  _updateCrater(dt, exit) {
    const c = settings.sonic;
    const g = settings.global;
    const st = this._craterState;
    if (this._boomAge < 0) {
      this.crater.visible = false;
      return;
    }
    const plate = Math.max(0.1, c.plateRadius * g.explosionIntensity);
    const hum = this._hum();
    const rise = Easing.outBack(saturate(this._boomAge / Math.max(0.02, c.craterRise)));
    st.radius = plate * c.craterRadius;
    st.width = Math.max(0.05, plate * c.craterWidth);
    st.height =
      c.craterHeight * g.explosionIntensity * rise * (1 + c.craterBreath * (hum * 2 - 1)) * (1 - saturate(c.craterSink) * Easing.inQuad(saturate(exit)));
    st.hum = hum;
    st.fade = 1 - Easing.inQuad(saturate(exit));
    st.dissolve = saturate(exit);
    this.pointAt(1, this.crater.position).setY(0);
    this.craterMaterial.userData.sync(st);
    this.crater.visible = st.fade > 0.002 && st.height > 0.001;

    // Dust leaking off the lip through the linger.
    if (!this.crater.visible || c.craterPuffs <= 0 || exit > 0.5) return;
    this._puffClock += dt * c.craterPuffs;
    while (this._puffClock >= 1) {
      this._puffClock -= 1;
      const a = Math.random() * Math.PI * 2;
      _dir.set(Math.cos(a), 0, Math.sin(a));
      _pos.copy(this.crater.position).addScaledVector(_dir, st.radius).setY(st.height * 0.8);
      _peelDir.copy(_dir).multiplyScalar(0.6).addScaledVector(_up, 0.8).normalize();
      _emit.position = _pos;
      _emit.radius = 0.4;
      _emit.direction = _peelDir;
      _emit.speed = c.dustSpeed * 0.5;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.5;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.7;
      _emit.sizeVariance = 0.4;
      _emit.life = c.dustLife * 1.4;
      _emit.lifeVariance = 0.3;
      _emit.spin = 0.4;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.dust.emit(Math.max(1, Math.round(2 * g.particleCount)), _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel() {
    this._syncParticles();
    for (let i = 0; i < this._count; i++) this._updateRing(this.rings[i], i, 1);
    this._updateHull(1);
    this._updateLane(0);
  }

  onImpact() {
    const c = settings.sonic;
    const g = settings.global;
    const time = frame.uTime.value;

    this._boomAge = 0;
    this.pointAt(1, _end);

    /* --- the shell of air --- */
    _pos.copy(_end).setY(c.ringHeight * 0.6);
    // A dark pressure burst — a dense ball of shoved dust in the deep ramp,
    // not a bright dome.
    this.ctx.bursts.spawn(BurstMode.EARTH, _pos, {
      radius: c.boomBurst * 0.15,
      endRadius: c.boomBurst * g.explosionIntensity,
      life: c.boomBurstLife,
      intensity: c.boomBurstIntensity,
      opacity: c.boomBurstOpacity,
      fresnel: 2.0,
      displace: 0.1,
      squash: 0.75,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    /* --- the ring that snaps out across the floor (off by default) --- */
    if (c.shockIntensity > 0) this.ctx.decals.spawn(DecalType.SHOCKWAVE, _end, {
      radius: c.shockRadius * g.explosionIntensity,
      life: c.shockLife,
      width: c.shockWidth,
      intensity: c.shockIntensity,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });

    /* --- the dust ring rolling out across the floor --- */
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
      radius: c.boomRingRadius * g.explosionIntensity,
      life: c.boomRingLife,
      intensity: c.boomRingIntensity,
      colorA: getColor(c.colorDustB),
      colorB: getColor(c.colorDustD)
    });

    /* --- dust thrown out in a low ring --- */
    const count = Math.round(c.boomDust * g.particleCount);
    const spokes = 16;
    for (let k = 0; k < spokes; k++) {
      const angle = (k / spokes) * Math.PI * 2 + Math.random() * 0.3;
      _dir.set(Math.cos(angle), c.boomDustLow, Math.sin(angle)).normalize();
      _emit.position = _pos.copy(_end).setY(0.15);
      _emit.radius = 0.6;
      _emit.direction = _dir;
      _emit.speed = c.dustSpeed * 2.8;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.35;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.8;
      _emit.sizeVariance = 0.5;
      _emit.life = c.dustLife * 1.3;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0.4;
      _emit.tint = null;
      _emit.time = time;
      this.dust.emit(Math.max(1, Math.round(count / spokes)), _emit);
    }

    /* --- the beat --- */
    this.position.copy(_end).setY(c.ringHeight);
    this.ctx.shake.add(c.boomShake * g.explosionIntensity * g.cameraShake, 1 / Math.max(0.1, c.boomShakeTime), 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.boomFlash * g.explosionIntensity);
    this.lightBoost = c.boomLight * g.explosionIntensity;
    this._lastLaunch = this.age;
  }

  onFade(dt, t) {
    this._syncParticles();
    const fadeAll = this.phase === AbilityPhase.FADE ? 1 - Easing.inQuad(saturate(t - 1)) : 1;
    this._boomAge += dt;

    for (let i = 0; i < this._count; i++) this._updateRing(this.rings[i], i, fadeAll);
    this._updateFloor(fadeAll);
    const exit = this.phase === AbilityPhase.FADE ? saturate(t - 1) : 0;
    this._updateLane(exit);
    this._updatePlate(exit);
    this._updateDomes(exit);
    this._updateHull(fadeAll);
    this._updateCrater(dt, exit);
  }

  onDestroy() {
    for (let i = 0; i < MAX_PULSES; i++) {
      const ring = this.rings[i];
      ring.mesh.visible = false;
      ring.warp.visible = false;
      ring.launched = false;
      ring.done = true;
    }
    this.floor.visible = false;
    this.floorWarp.visible = false;
    for (let i = 0; i < MAX_DOMES; i++) {
      this.domes[i].mesh.visible = false;
      this.domes[i].warp.visible = false;
    }
    this.plate.visible = false;
    this.lane.visible = false;
    this.hull.visible = false;
    this.hullWarp.visible = false;
    this.crater.visible = false;
    this._boomAge = -1;
    this._count = 0;
  }

  dispose() {
    for (const ring of this.rings) {
      ring.material.dispose();
      ring.warpMaterial.dispose();
    }
    this.shellGeometry.dispose();
    this.floorGeometry.dispose();
    this.floorMaterial.dispose();
    this.floorWarpMaterial.dispose();
    for (const dome of this.domes) {
      dome.material.dispose();
      dome.warpMaterial.dispose();
    }
    this.plateGeometry.dispose();
    this.laneMaterial.dispose();
    this.plateMaterial.dispose();
    this.hullGeometry.dispose();
    this.hullMaterial.dispose();
    this.hullWarpMaterial.dispose();
    this.craterGeometry.dispose();
    this.craterMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const R = Editor.range;
  const folder = gui.addFolder('⦿  Resonance Pulse');

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'ring speed (m/s)');
  R(cast, c, 'lifetime', 0.05, 6, 0.05, 'boom hangs for');
  R(cast, c, 'fadeTime', 0.05, 4, 0.05, 'settle time');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handForward', -1, 2, 0.01, 'hand forward (m)');
  R(cast, c, 'handSide', -1, 1, 0.01, 'hand side (m)');
  R(cast, c, 'handHeight', 0, 3, 0.01, 'hand height (m)');

  /* ---- layer 1 ---- */
  const rings = folder.addFolder('1 · Rings');
  const train = rings.addFolder('The train');
  R(train, c, 'pulseCount', 1, MAX_PULSES, 1, 'rings per cast');
  R(train, c, 'pulseInterval', 0, 0.6, 0.005, 'seconds between rings');
  R(train, c, 'pulseShrink', 0, 0.15, 0.005, 'later rings smaller by');
  R(train, c, 'pulseDim', 0, 0.15, 0.005, 'later rings dimmer by');

  const shape = rings.addFolder('Shape');
  R(shape, c, 'ringStart', 0.02, 3, 0.01, 'radius at the hand (m)');
  R(shape, c, 'ringEnd', 0.1, 8, 0.05, 'radius at the end (m)');
  R(shape, c, 'ringCurve', 0.1, 4, 0.01, 'how late it opens');
  R(shape, c, 'ringHeight', 0, 4, 0.01, 'height at the end (m)');
  R(shape, c, 'spread', 0.05, 1.5, 0.01, 'dome half-angle (rad)');
  R(shape, c, 'birthTime', 0.005, 0.5, 0.005, 'fade in (s)');
  R(shape, c, 'arriveGrow', 0, 2, 0.01, 'opens on landing by');
  R(shape, c, 'arriveFade', 0.02, 2, 0.01, 'dies on landing over (s)');

  const look = rings.addFolder('Shader');
  R(look, c, 'rimWidth', 0.005, 0.4, 0.001, 'rim width');
  R(look, c, 'rimBright', 0, 10, 0.05, 'rim brightness');
  R(look, c, 'chroma', 0, 0.2, 0.001, 'chromatic split');
  R(look, c, 'fresnelPower', 0.2, 8, 0.05, 'fresnel power');
  R(look, c, 'fresnelBright', 0, 4, 0.01, 'fresnel brightness');
  R(look, c, 'bodyOpacity', 0, 2, 0.01, 'body (bands) strength');
  R(look, c, 'bands', 0, 24, 0.1, 'interference bands');
  R(look, c, 'beat', 1, 3, 0.01, 'beat ratio');
  R(look, c, 'bandSpeed', 0, 60, 0.5, 'band speed');
  R(look, c, 'bandSharp', 0.5, 12, 0.1, 'band sharpness');
  R(look, c, 'lobes', 0, 16, 1, 'standing lobes');
  R(look, c, 'lobeDepth', 0, 1, 0.01, 'lobe depth');
  R(look, c, 'intensity', 0, 10, 0.05, 'intensity');
  R(look, c, 'opacity', 0, 1, 0.01, 'opacity');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft fade (m)');
  look.addColor(c, 'colorRim').name('rim');
  look.addColor(c, 'colorBody').name('body');
  look.addColor(c, 'colorChromaR').name('chroma red');
  look.addColor(c, 'colorChromaG').name('chroma green');
  look.addColor(c, 'colorChromaB').name('chroma blue');

  /* ---- layer 2 ---- */
  const warp = folder.addFolder('2 · Warp');
  R(warp, c, 'warpStrength', 0, 5, 0.01, 'ring warp strength');
  R(warp, c, 'warpWidth', 0.01, 0.6, 0.005, 'ring warp band width');
  R(warp, c, 'warpBody', 0, 1, 0.01, 'warp across the shell');
  R(warp, c, 'boomWarp', 0, 5, 0.01, 'floor ripple warp');

  /* ---- layer 3 ---- */
  const dust = folder.addFolder('3 · Dust');
  R(dust, c, 'dustSpacing', 0.1, 4, 0.05, 'metres between puffs');
  R(dust, c, 'dustCount', 0, 30, 1, 'per puff');
  R(dust, c, 'boomDust', 0, 300, 1, 'thrown by the boom');
  R(dust, c, 'dustSize', 0.05, 3, 0.01, 'size');
  R(dust, c, 'dustLife', 0.1, 4, 0.05, 'lifetime');
  R(dust, c, 'dustSpeed', 0, 8, 0.05, 'speed');
  R(dust, c, 'dustRise', -2, 3, 0.05, 'rise');
  R(dust, c, 'dustDrag', 0, 8, 0.05, 'drag');
  R(dust, c, 'dustOpacity', 0, 1, 0.01, 'opacity');
  R(dust, c, 'dustTurbulence', 0, 4, 0.05, 'turbulence');
  Editor.gradient(dust, c, 'colorDust', 'Colour over life');

  /* ---- layer 4 ---- */
  const ripples = folder.addFolder('4 · Ripples');
  R(ripples, c, 'rippleSpacing', 0.2, 6, 0.05, 'metres between ripples');
  R(ripples, c, 'rippleEvery', 1, 6, 1, 'every Nth ring');
  R(ripples, c, 'rippleRadius', 0.1, 3, 0.01, 'radius (× ring)');
  R(ripples, c, 'rippleLife', 0.1, 3, 0.05, 'lifetime');
  R(ripples, c, 'rippleWidth', 0.01, 0.4, 0.005, 'line width');
  R(ripples, c, 'rippleIntensity', 0, 3, 0.01, 'intensity');
  ripples.addColor(c, 'colorRippleA').name('ripple inner');
  ripples.addColor(c, 'colorRippleB').name('ripple outer');

  /* ---- layer 5 ---- */
  const muzzle = folder.addFolder('5 · Muzzle');
  R(muzzle, c, 'muzzleRings', 0, 12, 1, 'rings per pulse');
  R(muzzle, c, 'muzzleSize', 0.05, 2, 0.01, 'size');
  R(muzzle, c, 'muzzleLife', 0.05, 1.5, 0.01, 'lifetime');
  R(muzzle, c, 'muzzleSpeed', 0, 10, 0.05, 'speed');
  R(muzzle, c, 'muzzleGlow', 0, 8, 0.05, 'glow');
  R(muzzle, c, 'pulseShake', 0, 0.3, 0.005, 'shake per pulse');
  Editor.gradient(muzzle, c, 'colorMuzzle', 'Colour over life');

  /* ---- layer 6 ---- */
  const boom = folder.addFolder('6 · Boom');
  R(boom, c, 'boomBurst', 0.2, 14, 0.05, 'air shell (m)');
  R(boom, c, 'boomBurstLife', 0.05, 2, 0.01, 'shell lifetime');
  R(boom, c, 'boomBurstIntensity', 0, 5, 0.05, 'shell intensity');
  R(boom, c, 'boomBurstOpacity', 0, 1, 0.01, 'shell opacity');
  boom.addColor(c, 'colorBurstA').name('shell core');
  boom.addColor(c, 'colorBurstB').name('shell body');
  boom.addColor(c, 'colorBurstC').name('shell edge');
  R(boom, c, 'shockRadius', 0.5, 16, 0.1, 'shockwave radius (m)');
  R(boom, c, 'shockLife', 0.1, 3, 0.05, 'shockwave lifetime');
  R(boom, c, 'shockWidth', 0.01, 0.4, 0.005, 'shockwave width');
  R(boom, c, 'shockIntensity', 0, 3, 0.01, 'shockwave outline strength');
  boom.addColor(c, 'colorShockA').name('shockwave inner');
  boom.addColor(c, 'colorShockB').name('shockwave outer');
  R(boom, c, 'floorRadius', 0.5, 25, 0.1, 'floor ripple reach (m)');
  R(boom, c, 'floorTime', 0.1, 4, 0.05, 'floor ripple time (s)');
  R(boom, c, 'floorRings', 1, 6, 1, 'floor wavelets');
  R(boom, c, 'floorWavelength', 0.1, 3, 0.05, 'wavelet spacing (m)');
  R(boom, c, 'floorWidth', 0.02, 1, 0.01, 'wavelet width (m)');
  R(boom, c, 'floorIntensity', 0, 8, 0.05, 'floor ripple intensity');
  R(boom, c, 'floorChroma', 0, 0.5, 0.005, 'floor chromatic split (m)');
  R(boom, c, 'floorWake', 0, 1, 0.01, 'pressure band opacity');
  R(boom, c, 'floorWakeLength', 0.1, 8, 0.05, 'pressure band length (m)');
  R(boom, c, 'boomShake', 0, 1.5, 0.01, 'camera kick');
  R(boom, c, 'boomShakeTime', 0.1, 2, 0.01, 'kick dies over (s)');
  R(boom, c, 'boomFlash', 0, 1, 0.01, 'flash');
  boom.addColor(c, 'colorFlash').name('flash colour');
  R(boom, c, 'boomLight', 0, 60, 0.5, 'light punch');

  const body = rings.addFolder('Body & lip');
  R(body, c, 'bodyFill', 0, 1, 0.01, 'body fill');
  R(body, c, 'bodyCentre', 0, 1, 0.01, 'fill at the centre (×)');
  R(body, c, 'capSplit', 0.3, 0.97, 0.01, 'cap / lip split');
  R(body, c, 'lipSize', 0, 0.5, 0.005, 'lip thickness (× radius)');
  R(body, c, 'lipCurl', 0.5, 6.2, 0.05, 'lip roll (rad)');
  R(body, c, 'lipSpin', 0, 10, 0.05, 'lip roll speed');
  R(body, c, 'lipBright', 0, 6, 0.05, 'lip brightness');
  R(body, c, 'lipOpacity', 0, 1, 0.01, 'lip opacity');
  R(body, c, 'bodyGlow', 0, 4, 0.01, 'body glow');
  R(body, c, 'bodyMottle', 0, 1, 0.01, 'pressure cells');
  R(body, c, 'bodyMottleScale', 0.2, 10, 0.05, 'cell scale');
  R(body, c, 'bodyShade', 0, 1, 0.01, 'sun shading');
  R(body, c, 'bodyTone', 0, 1, 0.01, 'body tone (deep → violet)');
  body.addColor(c, 'colorTint').name('tint');
  body.addColor(c, 'colorDeep').name('deep');
  R(body, c, 'ringShellOpacity', 0, 1, 0.01, 'ring shells shown');
  R(body, c, 'ringWarp', 0, 2, 0.01, 'ring warp (×)');

  const hull = folder.addFolder('1b · Hull (shock body)');
  R(hull, c, 'hullOpacity', 0, 1, 0.01, 'opacity');
  R(hull, c, 'hullLength', 0.2, 16, 0.05, 'wake length (m)');
  R(hull, c, 'hullWidth', 0.1, 2.5, 0.01, 'half-width (× ring)');
  R(hull, c, 'hullAspect', 0.1, 1.5, 0.01, 'height / width');
  R(hull, c, 'hullSink', 0, 1, 0.01, 'buried share');
  R(hull, c, 'hullNose', 0.05, 2, 0.01, 'nose length (× radius)');
  R(hull, c, 'hullBulge', 0, 1, 0.01, 'front bulge');
  R(hull, c, 'hullTailPow', 0.1, 3, 0.01, 'tail taper');
  R(hull, c, 'hullWake', 0, 1, 0.01, 'wake keeps front width');
  R(hull, c, 'hullWakeSpread', 0, 3, 0.01, 'wake spreads (bow wave)');
  R(hull, c, 'hullWakeFlat', 0, 0.95, 0.01, 'wake flattens');
  R(hull, c, 'hullTurb', 0, 1.5, 0.01, 'turbulence');
  R(hull, c, 'hullTurbScale', 0.1, 6, 0.05, 'turbulence scale');
  R(hull, c, 'hullTurbSpeed', 0, 12, 0.05, 'turbulence speed');
  R(hull, c, 'hullFlow', 0, 1, 0.01, 'flow streaks');
  R(hull, c, 'hullFlowSpeed', 0, 10, 0.05, 'streak speed');
  R(hull, c, 'hullLight', 0, 1.5, 0.01, 'sun lift');
  R(hull, c, 'hullEdge', 0, 4, 0.01, 'violet edge');
  R(hull, c, 'hullEdgePower', 0.5, 8, 0.05, 'edge power');
  R(hull, c, 'hullCrest', 0, 6, 0.05, 'front crest');
  R(hull, c, 'hullCrestWidth', 0.01, 1, 0.01, 'crest width (× radius)');
  R(hull, c, 'hullDissolve', 0, 1, 0.01, 'tail break-up');
  R(hull, c, 'hullBeads', 0, 1, 0.01, 'pulse beads');
  R(hull, c, 'hullBeadWidth', 0.05, 3, 0.01, 'bead length (m)');
  R(hull, c, 'hullCompress', 0, 1, 0.01, 'piles up by');
  R(hull, c, 'hullSwell', 0, 1.5, 0.01, 'swells while piling');
  R(hull, c, 'hullCollapse', 0.02, 1.5, 0.01, 'bursts at the boom over (s)');
  R(hull, c, 'hullBurst', 0, 1, 0.01, 'burst strength');
  R(hull, c, 'hullWarp', 0, 5, 0.01, 'warp');
  R(hull, c, 'hullSoftFade', 0.01, 2, 0.01, 'floor soft fade (m)');
  hull.addColor(c, 'colorHull').name('hull tone');
  hull.addColor(c, 'colorHullDeep').name('hull deep');
  R(hull, c, 'hullCrestHot', 0, 1, 0.01, 'crest tint → white');
  R(hull, c, 'peelSpacing', 0.1, 3, 0.05, 'peel every (m)');
  R(hull, c, 'peelCount', 0, 20, 1, 'dust per peel');
  R(hull, c, 'peelSpeed', 0, 10, 0.05, 'peel speed');
  R(hull, c, 'peelLift', 0, 3, 0.05, 'peel lift');
  R(hull, c, 'peelBack', 0, 3, 0.05, 'peel back');
  R(hull, c, 'peelSize', 0.05, 3, 0.01, 'peel size');
  R(hull, c, 'gritCount', 0, 20, 1, 'grit per peel');
  R(hull, c, 'gritSize', 0.01, 0.6, 0.005, 'grit size');
  R(hull, c, 'gritSpeed', 0, 12, 0.05, 'grit speed');
  R(hull, c, 'gritLife', 0.1, 3, 0.05, 'grit lifetime');
  Editor.gradient(hull, c, 'colorGrit', 'Grit colour over life');

  R(boom, c, 'boomDustLow', -0.2, 1, 0.01, 'boom dust lift');
  R(boom, c, 'boomRingRadius', 0.5, 16, 0.1, 'dust ring radius (m)');
  R(boom, c, 'boomRingLife', 0.1, 5, 0.05, 'dust ring lifetime');
  R(boom, c, 'boomRingIntensity', 0, 3, 0.01, 'dust ring strength');

  const domes = boom.addFolder('Domes & hum');
  R(domes, c, 'boomDomeShow', 0, 1, 0.01, 'show domes & hum');
  R(domes, c, 'boomDomeRadius', 0.2, 12, 0.05, 'dome radius (m)');
  R(domes, c, 'boomDomeTime', 0.02, 2, 0.01, 'dome opens over (s)');
  R(domes, c, 'boomDomeLife', 0.05, 3, 0.01, 'dome dies over (s)');
  R(domes, c, 'boomDomeSpread', 0.2, 1.55, 0.01, 'dome half-angle (rad)');
  R(domes, c, 'boomEcho', 0, 1, 0.01, 'echo delay (s)');
  R(domes, c, 'boomEchoScale', 0.1, 2, 0.01, 'echo size (×)');
  R(domes, c, 'humRadius', 0.1, 6, 0.05, 'hum radius (m)');
  R(domes, c, 'humSpread', 0.2, 1.55, 0.01, 'hum half-angle (rad)');
  R(domes, c, 'humAmp', 0, 0.6, 0.01, 'hum breath');
  R(domes, c, 'humRate', 0.1, 12, 0.05, 'hum rate (Hz)');
  R(domes, c, 'humDelay', 0, 1.5, 0.01, 'hum starts after (s)');
  R(domes, c, 'humBright', 0, 1.5, 0.01, 'hum strength');
  R(domes, c, 'humFill', 0, 1.5, 0.01, 'hum body fill (×)');
  R(domes, c, 'boomDomeFill', 0, 1.5, 0.01, 'dome body fill (×)');
  R(domes, c, 'boomDomeGlow', 0, 5, 0.01, 'dome body glow (×)');

  const plate = folder.addFolder('7 · Chladni plate');
  R(plate, c, 'plateRadius', 0.5, 12, 0.05, 'plate radius (m)');
  R(plate, c, 'plateModeA', 0, 10, 1, 'mode A diameters');
  R(plate, c, 'plateRingsA', 0.5, 8, 0.5, 'mode A circles');
  R(plate, c, 'plateModeB', 0, 10, 1, 'mode B diameters');
  R(plate, c, 'plateRingsB', 0.5, 8, 0.5, 'mode B circles');
  R(plate, c, 'plateMorphTime', 0.1, 6, 0.05, 'mode morph time (s)');
  R(plate, c, 'plateLineWidth', 0, 0.6, 0.005, 'nodal line width');
  R(plate, c, 'plateGrain', 1, 120, 1, 'sand grain');
  R(plate, c, 'plateStain', 0, 1, 0.01, 'plate stain');
  R(plate, c, 'plateGlow', 0, 8, 0.05, 'line glow on the hum');
  R(plate, c, 'plateBodyMix', 0, 1, 0.01, 'stain lift toward violet');
  R(plate, c, 'plateRimGlow', 0, 4, 0.01, 'crater lip glow');
  R(plate, c, 'plateRimWidth', 0.01, 0.3, 0.005, 'crater lip width');
  R(plate, c, 'laneWidth', 0.1, 2, 0.01, 'lane half-width (× ring end)');
  R(plate, c, 'laneStripe', 0.2, 5, 0.05, 'lane wavelength (m)');
  R(plate, c, 'laneAcross', 0, 6, 0.5, 'lane nodes across');
  R(plate, c, 'laneStain', 0, 1, 0.01, 'lane stain');
  R(plate, c, 'laneLines', 0, 1.5, 0.01, 'lane ridge strength');

  const crater = folder.addFolder('8 · Crater');
  R(crater, c, 'craterRadius', 0.1, 2, 0.01, 'lip crest (× plate)');
  R(crater, c, 'craterWidth', 0.05, 1.5, 0.01, 'lip width (× plate)');
  R(crater, c, 'craterHeight', 0, 2, 0.01, 'lip height (m)');
  R(crater, c, 'craterRise', 0.02, 1.5, 0.01, 'heaves up over (s)');
  R(crater, c, 'craterLump', 0, 1, 0.01, 'lumpiness');
  R(crater, c, 'craterLight', 0, 1.5, 0.01, 'sun lift');
  R(crater, c, 'craterGlow', 0, 4, 0.01, 'crack glow on the beat');
  R(crater, c, 'craterBreath', 0, 0.6, 0.01, 'breathes with the hum');
  R(crater, c, 'craterSink', 0, 1, 0.01, 'sinks on the way out');
  R(crater, c, 'craterPuffs', 0, 40, 0.5, 'dust puffs per second');
  crater.addColor(c, 'colorCrater').name('earth');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('light colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'light intensity');
  R(light, c, 'lightRadius', 0.5, 30, 0.1, 'light radius');
  R(light, c, 'lightThrob', 0, 1, 0.01, 'beats with the train');
}
