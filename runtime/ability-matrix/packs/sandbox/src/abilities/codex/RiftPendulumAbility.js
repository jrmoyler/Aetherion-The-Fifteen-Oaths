import { ExtrudeGeometry, Float32BufferAttribute, LatheGeometry, Matrix4, Mesh, PlaneGeometry, Shape, SphereGeometry, Vector2, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { DetailLayer } from './DetailLayer.js';
import { RigHero } from './RigHero.js';
import { createSpellBodyGeometry } from './PureBodyGeometries.js';
import { LineTrail } from './LineTrail.js';
import { createRiftPendulumPieceGeometry, createRiftPendulumHeroGeometry } from '../../assets/codex/RiftPendulumGeometry.js';
import {
  createRiftPendulumBodyMaterial,
  createRiftPendulumLensMaterial,
  createRiftPendulumGroundMaterial,
  createRiftPendulumVoiceMaterial,
  createRiftPendulumDetailMaterial,
  createRiftPendulumTrailMaterial,
  createRiftPendulumScarMaterial,
  createRiftPendulumBladeMaterial,
  createRiftPendulumTearMaterial,
  createRiftPendulumKnotMaterial
} from '../../materials/codex/RiftPendulumMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'riftpendulum';

const TWIST = 'return';
const ARCH = 'pendulum';
const HIT = 'swing';
const CARRY = 'none';
const WHEN = 'return';
const ECHO = null;
const OFFSET = false;
const DISSOLVE_TRAVEL = false;
const COUNTER = false;
const ZONE = false;
const LIFT = 1;
const SLICE = true;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _end = new Vector3();
const _focus = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);

/** Felled bodies one cast can keep marked at once. */
const MAX_MARKS = 12;
const TAU = Math.PI * 2;
const _m4 = new Matrix4();
const _bx = new Vector3();
const _by = new Vector3();
const _bz = new Vector3();
const _hand = new Vector3();
const _pivot = new Vector3();
const _tip = new Vector3();
const _vel = new Vector3();

/* Crescent outline, in authored units: an outer arc of radius 1 from horn to
 * horn under its centre, a blade `BLADE_W` deep at the belly tapering to the
 * horns. The socket the arm drives into is the middle of the concave edge. */
const BLADE_R = 1;
const BLADE_T0 = 0.3;
const BLADE_W = 0.42;
const BLADE_SOCKET = BLADE_R - BLADE_W - 0.012;
const BLADE_SPAN = 2 * Math.cos(BLADE_T0) * BLADE_R;

function bladeDepth(f) {
  return BLADE_W * Math.pow(Math.sin(f * Math.PI), 0.75) + 0.012;
}

/**
 * The pendulum blade: a crescent of void-iron, horns up, its convex belly the
 * cutting edge — the classic pit-and-pendulum blade, extruded with a bevel so
 * the sun catches its arrises. `aEdge` runs 0 on the concave spine to 1 on
 * the cutting edge (the shader's hot rim). Authored so the span is one unit
 * after `BLADE_SPAN` scaling, the socket on the origin, the belly down −Y.
 */
export function createPendulumBladeGeometry() {
  const N = 44;
  const outer = [];
  const inner = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const phi = BLADE_T0 + f * (Math.PI - 2 * BLADE_T0);
    const w = bladeDepth(f);
    outer.push(new Vector2(BLADE_R * Math.cos(phi), -BLADE_R * Math.sin(phi)));
    inner.push(new Vector2((BLADE_R - w) * Math.cos(phi), -(BLADE_R - w) * Math.sin(phi)));
  }
  const shape = new Shape(outer.concat(inner.reverse()));
  const g = new ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.028, bevelSegments: 2, curveSegments: 1, steps: 1 });
  g.translate(0, 0, -0.025);
  const pos = g.getAttribute('position');
  const edge = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.hypot(x, y);
    const phi = Math.atan2(-y, x);
    const f = Math.min(1, Math.max(0, (phi - BLADE_T0) / (Math.PI - 2 * BLADE_T0)));
    const w = bladeDepth(f);
    edge[i] = Math.min(1, Math.max(0, (r - (BLADE_R - w)) / w));
  }
  g.setAttribute('aEdge', new Float32BufferAttribute(edge, 1));
  g.translate(0, BLADE_SOCKET, 0);
  g.scale(1 / BLADE_SPAN, 1 / BLADE_SPAN, 1 / BLADE_SPAN);
  g.computeBoundingSphere();
  return g;
}

/**
 * The arm: a forged rod hung from the pivot, one unit long down −Y, with a
 * hanger cap, a mid collar and a socket collar where it drives into the
 * blade. Radius 1 is the rod; the ability scales x/z by `armWidth`.
 */
export function createPendulumArmGeometry() {
  const profile = [
    [0.001, 0.04], [1.7, 0.04], [1.7, -0.02], [1.0, -0.04], [1.0, -0.47], [1.6, -0.49], [1.6, -0.53],
    [1.0, -0.55], [1.0, -0.9], [1.9, -0.93], [2.1, -0.97], [1.4, -1.0], [0.001, -1.0]
  ];
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 10).toNonIndexed();
  g.computeVertexNormals();
  g.setAttribute('aEdge', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(0.12), 1));
  return g;
}

/**
 * RIFT PENDULUM — void, line cast.
 *
 * Void — a rift swings across the cast and hangs open a beat.
 *
 * The rift hangs open at the far end for the impact, then cuts on the way back.
 *
 * The read is `return`: hit timing `return`, blow `swing`.
 *
 * ## Layers
 *
 *   1. **body** — the return placement, in its own shader.
 *   2. **lens** — the same placement into the distortion buffer.
 *   3. **ground** — a filled void field under the strip the head has crossed: it lands behind a hot lip on the beat, holds through the linger with the element's pattern carved in, cools and breaks up; a filled residue decal outlives the cast.
 *   4. **voice** — a bore riding alongside the body, spun with the cast.
 *   5. **detail** — an InstancedMesh of the cast's own authored piece (`createRiftPendulumPieceGeometry`); each piece folds part by part as the cast rises and beats.
 *   6. **hero** — one larger authored rig (`createRiftPendulumHeroGeometry`), stood by its archetype (pendulum): hinged at the hand, swung across the cast.
 *      Hero and pieces are energy: emissive over a dark body with a fresnel shell (LAYER.VFX). The rig is framed to the body height (`heroMinSpan`) and kept under `heroMaxHeight`.
 *   7. **shed** — dust, streaks, chips and motes on RateEmitters.
 *   8. **aftershock** — a second, smaller beat when the fade starts.
 *   9. **bodies** — `handlesOwnHits`: the rift hangs open at the far end for the impact, then cuts on the way back.
 *  10. **mark** — a felled body is hollowed out: `corrode` stains it toward the
 *      element's look over `markTime` and it sheds motes for `markLife`.
 *
 * The cast leaves the fist in a flare of sparks (`handFlare`, `handSparks`).
 *
 * ## The pendulum (the hero, cast-local — sections 15–16 of the editor)
 *
 * The shared template layers (body sheet, voice, rig, pieces, lens and the
 * haze strip of the ground field) are switched off in the config; the spell
 * is carried by its own forms:
 *
 *   - **the blade** — a crescent of lit void-iron, horns up, its convex belly
 *     the cutting edge (`createPendulumBladeGeometry`, extruded and bevelled,
 *     `LAYER.WORLD`, shadows). It leaves the hand spinning in its own plane
 *     and flies down the line, growing as it goes.
 *   - **the knot** — a spiked knot of void gathers over the target while the
 *     blade flies (`pivot*`); on the beat the blade catches on a forged arm
 *     hung from it and swings across the cast line in a damped arc
 *     (θ = A·sin(2πs/T)·e^(−ks)), its edge hot while it moves fast. Each sweep
 *     back through the bottom is a cut you feel: a camera tick, a light tick,
 *     dust thrown sideways (`pass*`), sparks off the edge.
 *   - **the rift** — on the beat a tall tear opens in the air behind the
 *     blade: black inside, draining, with a burning violet-to-white lip. It
 *     hangs open (`riftHold`), drawing motes in, then zips shut from both
 *     ends. A wound torn across the floor under it outlives it (`wound*`).
 *   - **the exit** — the blade and arm shatter along voronoi cells and the
 *     knot collapses; the scar, wake and residue stay on the floor.
 *
 * All of it is presentation: hits still land through `_strike` on the return,
 * exactly as before.
 *
 * Every metre, rate and colour is read from `settings.riftpendulum` each frame.
 * A cast only captures a seed and an integrated spin.
 */
export class RiftPendulumAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._hits;
  }

  createShaders() {
    this.bodyGeometry = createSpellBodyGeometry(ID);
    this.voiceGeometry = new PlaneGeometry(1, 1, 64, 8);
    this.groundGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.bodyMaterial = createRiftPendulumBodyMaterial();
    this.lensMaterial = createRiftPendulumLensMaterial();
    this.groundMaterial = createRiftPendulumGroundMaterial();
    this.voiceMaterial = createRiftPendulumVoiceMaterial();
    this.detailMaterial = createRiftPendulumDetailMaterial();
    this.heroMaterial = createRiftPendulumDetailMaterial(true);
    this.detail = new DetailLayer(createRiftPendulumPieceGeometry(), this.detailMaterial);
    this.group.add(this.detail.mesh);
    this.rig = new RigHero(createRiftPendulumHeroGeometry(), this.heroMaterial, ARCH, ZONE);
    this.group.add(this.rig.mesh);
    this.body = this._mesh(this.bodyGeometry, this.bodyMaterial, LAYER.VFX, 12);
    this.voice = this._mesh(this.voiceGeometry, this.voiceMaterial, LAYER.VFX, 13);
    this.lens = this._mesh(this.bodyGeometry, this.lensMaterial, LAYER.DISTORTION, 0);
    this.ground = this._mesh(this.groundGeometry, this.groundMaterial, LAYER.VFX, 1);
    this._state = {
      center: new Vector3(),
      origin: new Vector3(),
      dir: new Vector3(0, 0, 1),
      side: new Vector3(1, 0, 0),
      radius: 1,
      length: 1,
      height: 1,
      thickness: 0.3,
      count: 6,
      spin: 0,
      voiceSpin: 0,
      open: 1,
      beat: 0,
      grow: 1,
      along: 0,
      seed: 0,
      fade: 1,
      dissolve: 0,
      phrase: 0,
      foot: 1,
      footWidth: 1,
      groundCenter: new Vector3(),
      land: 0,
      pre: 0,
      heat: 0,
      erode: 0,
      pulse: 1
    };
    this._seed = 0;
    this._settled = false;
    this._spin = 0;
    this._hits = 0;
    this._echoed = false;
    this._struck = [];
    this._carried = [];
    this._parts = Array.from({ length: 12 }, () => ({ armed: true }));
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._flow = { vx: 0, vy: 0, vz: 0 };
    this._field = (x, y, z, out) => out.set(this._flow.vx, this._flow.vy, this._flow.vz);
    this._found = [];
    this._marks = Array.from({ length: MAX_MARKS }, () => ({ dummy: null, time: 0, emitter: new RateEmitter() }));
    this._markCount = 0;
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0 };
    this.trailMaterial = createRiftPendulumTrailMaterial();
    this.scarMaterial = createRiftPendulumScarMaterial();
    this.trail = new LineTrail(TWIST, this.trailMaterial, this.scarMaterial);
    this.trail.onWake = (point, lane, s) => this._wake(point, lane, s);
    this.group.add(this.trail.scarMesh, this.trail.trailMesh);
    this._buildPendulum();
  }

  /** The cast-local hero: the blade, its arm, the pivot knot, the air tear and the floor wound. */
  _buildPendulum() {
    this.bladeGeometry = createPendulumBladeGeometry();
    this.armGeometry = createPendulumArmGeometry();
    this.bladeMaterial = createRiftPendulumBladeMaterial();
    this.armMaterial = createRiftPendulumBladeMaterial();
    const solid = (geometry, material) => {
      const mesh = new Mesh(geometry, material);
      mesh.layers.set(LAYER.WORLD);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      return mesh;
    };
    this.blade = solid(this.bladeGeometry, this.bladeMaterial);
    this.arm = solid(this.armGeometry, this.armMaterial);
    this.knotGeometry = new SphereGeometry(1, 36, 24);
    this.knotMaterial = createRiftPendulumKnotMaterial();
    this.knot = this._mesh(this.knotGeometry, this.knotMaterial, LAYER.VFX, 15);
    this.tearGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.tearMaterial = createRiftPendulumTearMaterial();
    this.tear = this._mesh(this.tearGeometry, this.tearMaterial, LAYER.VFX, 11);
    this.woundMaterial = createRiftPendulumTearMaterial();
    this.wound = this._mesh(this.tearGeometry, this.woundMaterial, LAYER.VFX, 4);
    this._theta = 0;
    this._omega = 0;
    this._passes = 0;
    this._riftOpen = 0;
    this._bladeDissolve = 0;
    this._sparkEmitter = new RateEmitter();
    this._pullEmitter = new RateEmitter();
  }

  _hidePendulum() {
    this.blade.visible = false;
    this.arm.visible = false;
    this.knot.visible = false;
    this.tear.visible = false;
    this.wound.visible = false;
  }

  /** Seconds since the beat (−1 before it). */
  _since(committed, fadeT) {
    if (!committed) return -1;
    return fadeT < 1 ? fadeT * this.impactDuration : this.impactDuration + (fadeT - 1) * this.fadeDuration;
  }

  /** Orient `mesh` with its local X along `x`, Y along `y` (Z completes the frame). */
  _orient(mesh, x, y) {
    _bz.crossVectors(x, y).normalize();
    _m4.makeBasis(x, y, _bz);
    mesh.quaternion.setFromRotationMatrix(_m4);
  }

  /**
   * Stand the pendulum for this frame. Before the beat the blade is thrown
   * from the hand, spinning in its own plane, and the knot gathers over the
   * target. On the beat the blade catches on the knot's arm at the bottom of
   * its arc and swings across the cast line in a damped arc
   * (θ = A·sin(2πs/T)·e^(−ks)); the tear behind it opens, hangs, and zips
   * shut; the floor wound under it stays a while longer; the blade shatters
   * and the knot collapses on the exit. Every dimension is read from
   * settings each frame; the cast holds only its seed and the clock.
   */
  _pendulum(committed, fadeT, dt) {
    const c = settings[ID];
    const g = settings.global;
    const L = g.lifetime;
    const since = this._since(committed, fadeT);
    const total = this.impactDuration + this.fadeDuration;
    this.pointAt(1, _end);
    const span = Math.max(0.2, c.bladeSpan);
    const pivotY = Math.max(0.5, c.pendPivotHeight);
    const arm = Math.min(pivotY - 0.2, Math.max(0.2, c.pendArm));
    _pivot.copy(_end).setY(pivotY);
    const exitAt = total - Math.max(0.05, c.pendExit * L);
    const dissolve = since < 0 ? 0 : saturate((since - exitAt) / Math.max(0.05, c.pendExit * L));
    this._bladeDissolve = dissolve;

    // The knot: gathers over the target while the blade flies, collapses on the exit.
    const gather = committed ? 1 : Easing.outCubic(saturate(this.u * 1.15));
    const knotS = c.pivotSize * (0.25 + 0.75 * gather) * (1 - Easing.inQuad(dissolve)) * (1 + 0.08 * Math.sin(this.age * 9));
    this.knot.visible = knotS > 0.01;
    this.knot.position.copy(_pivot);
    this.knot.scale.setScalar(Math.max(0.001, knotS));
    this.knotMaterial.userData.sync(this._seed);

    let theta = 0;
    let omega = 0;
    if (!committed) {
      // Thrown: from the hand to the bottom of the arc, spinning in its plane.
      _hand.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
      _hand.y = c.handHeight;
      const t = saturate(this.u);
      this.blade.position.lerpVectors(_hand, _end, t);
      this.blade.position.y = lerp(_hand.y, pivotY - arm, t) + c.bladeArc * 4 * t * (1 - t);
      const s = span * lerp(c.bladeTravelScale, 1, Easing.inQuad(saturate((t - 0.55) / 0.45)));
      this.blade.scale.setScalar(s);
      _bx.copy(this.side);
      _by.set(0, 1, 0);
      this._orient(this.blade, _bx, _by);
      this.blade.rotateZ(-this.age * c.bladeSpin);
      this.blade.visible = c.bladeSpan > 0.01;
      this.arm.visible = false;
    } else {
      const A = c.pendAmplitude;
      const T = Math.max(0.2, c.pendPeriod * L);
      const k = c.pendDamping / L;
      const w = TAU / T;
      const env = Math.exp(-k * since);
      theta = A * Math.sin(w * since) * env;
      omega = A * env * (w * Math.cos(w * since) - k * Math.sin(w * since));
      _bx.copy(this.side);
      _by.set(0, 1, 0);
      // Blade on the arc in the side–up plane.
      this.blade.position.copy(_pivot).addScaledVector(this.side, arm * Math.sin(theta));
      this.blade.position.y = pivotY - arm * Math.cos(theta);
      this.blade.scale.setScalar(span * (1 + 0.1 * Math.exp(-since * 10)));
      this._orient(this.blade, _bx, _by);
      this.blade.rotateZ(theta);
      this.blade.visible = c.bladeSpan > 0.01 && dissolve < 0.995;
      // Arm: from the pivot down to the socket, retracting a little on the exit.
      const len = arm * (1 - 0.35 * Easing.inQuad(dissolve));
      this.arm.position.copy(_pivot);
      this._orient(this.arm, _bx, _by);
      this.arm.rotateZ(theta);
      this.arm.scale.set(c.armWidth, len, c.armWidth);
      this.arm.visible = c.armWidth > 0.002 && dissolve < 0.995;
    }
    const heat = since < 0 ? 0.6 : 0.35 + 0.65 * saturate(Math.abs(omega) / Math.max(0.1, c.pendAmplitude * TAU / Math.max(0.2, c.pendPeriod * L)));
    this.bladeMaterial.userData.sync(dissolve, heat, 1);
    this.armMaterial.userData.sync(dissolve, 0.2, 0.3);

    // Pass ticks: each time the blade sweeps back through the bottom.
    if (committed && since > 0.12 && Math.sign(theta) !== Math.sign(this._theta) && Math.abs(omega) > 0.4 && dissolve <= 0) this._pass(omega);
    this._theta = theta;
    this._omega = omega;

    // The air tear, behind the blade: opens on the beat, hangs, zips shut.
    const open = since < 0 ? 0 : Easing.outCubic(saturate(since / Math.max(0.02, c.riftOpenTime * L)));
    const zip = since < 0 ? 0 : Easing.inQuad(saturate((since - c.riftHold * L) / Math.max(0.05, c.riftCloseTime * L)));
    this._riftOpen = open * (1 - zip);
    const RH = Math.max(0.2, c.riftHeight);
    const RW = Math.max(0.1, c.riftWidth);
    if (open > 0.001 && zip < 0.999 && c.riftHeight > 0.01) {
      this.tear.visible = true;
      this.tear.position.copy(_end).addScaledVector(this.direction, c.riftDepth);
      this.tear.position.y = 0.05 + RH * 0.5;
      _bx.copy(this.side);
      _by.set(0, 1, 0);
      this._orient(this.tear, _bx, _by);
      // The quad is wider than the tear so its smoky skirt has room.
      this.tear.scale.set(RW * 2 * 1.7, RH, 1);
      this.tearMaterial.userData.sync((open * (0.85 + 0.15 * Math.sin(this.age * 5.3))) / 1.7, zip, RW * 2 * 1.7, RH, c.riftLip, c.riftGlow, this._seed);
    } else this.tear.visible = false;

    // The floor wound across the line: it opens with the tear and outlives it.
    const FL = Math.max(0.2, c.woundLength);
    const FW = Math.max(0.05, c.woundWidth);
    const wOpen = since < 0 ? 0 : Easing.outCubic(saturate((since - 0.04) / Math.max(0.02, c.riftOpenTime * L * 1.5)));
    const wZip = since < 0 ? 0 : Easing.inQuad(saturate((since - (total - c.woundClose * L)) / Math.max(0.05, c.woundClose * L)));
    if (wOpen > 0.001 && wZip < 0.999 && c.woundLength > 0.01) {
      this.wound.visible = true;
      this.wound.position.copy(_end).setY(0.035);
      _bx.copy(this.direction);
      _by.copy(this.side);
      this._orient(this.wound, _bx, _by);
      this.wound.scale.set(FW * 2 * 1.7, FL, 1);
      this.woundMaterial.userData.sync((wOpen * (0.9 + 0.1 * Math.sin(this.age * 3.1))) / 1.7, wZip, FW * 2 * 1.7, FL, c.riftLip * 0.8, c.woundGlow, this._seed + 3.1);
    } else this.wound.visible = false;

    this._pendulumShed(dt, committed, since, omega, dissolve);
  }

  /** The blade sweeps back through the bottom of its arc: a cut you feel. */
  _pass(omega) {
    const c = settings[ID];
    const g = settings.global;
    this._passes++;
    const w = saturate(Math.abs(omega) / Math.max(0.1, c.pendAmplitude * 5));
    this.ctx.shake.add(c.passShake * w * g.cameraShake * g.explosionIntensity, 4, 16);
    this.lightBoost += c.passLight * w * g.explosionIntensity;
    _pos.copy(this.blade.position).setY(0.1);
    const dust = Math.round(c.passDust * w * g.particleCount);
    for (let i = 0; i < dust; i++) {
      const s = i % 2 ? 1 : -1;
      _dir.copy(this.side).multiplyScalar(s * Math.sign(omega)).addScaledVector(this.direction, (Math.random() - 0.5) * 0.6).setY(0.15);
      this._fillEmit(_pos, 0.4, _dir, c.dustSpeed * 1.4, 0.3, 0.55, c.dustLife * 1.2, 0.4);
      this.dust.emit(1, _emit);
    }
  }

  /** Sparks off the cutting edge while it swings fast; motes dragged into the tear while it hangs open. */
  _pendulumShed(dt, committed, since, omega, dissolve) {
    const c = settings[ID];
    const g = settings.global;
    if (committed && this.blade.visible) {
      const speed = Math.abs(omega) * c.pendArm;
      const n = Math.round(this._sparkEmitter.tick(dt, c.swingSparks * saturate(speed / 6)) * g.particleCount);
      if (n > 0) {
        // The belly of the blade, a little below the socket.
        _tip.set(0, -0.35, 0).applyQuaternion(this.blade.quaternion).multiplyScalar(this.blade.scale.x).add(this.blade.position);
        _vel.copy(this.side).multiplyScalar(Math.sign(omega)).setY(0.25);
        this._fillEmit(_tip, 0.25, _vel, c.streakSpeed * 0.8, 0.35, 0.07, c.streakLife, 2);
        this.streaks.emit(n, _emit);
      }
    }
    if (this._riftOpen > 0.05) {
      const n = Math.round(this._pullEmitter.tick(dt, c.riftMotes * this._riftOpen) * g.particleCount);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = 1.2 + Math.random() * 1.4;
        _pos.copy(_end).addScaledVector(this.side, Math.cos(a) * r).addScaledVector(this.direction, c.riftDepth);
        _pos.y = Math.max(0.15, c.riftHeight * 0.5 + Math.sin(a) * r);
        _dir.copy(_end).addScaledVector(this.direction, c.riftDepth).setY(c.riftHeight * 0.5).sub(_pos).normalize();
        this._fillEmit(_pos, 0.1, _dir, c.moteSpeed * 1.6, 0.1, 0.08, c.moteLife * 0.8, 1);
        this.motes.emit(1, _emit);
      }
    }
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
    this.dust = particles.get('riftpendulum.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.65
    });
    this.streaks = particles.get('riftpendulum.streak', {
      capacity: 1200,
      shape: ParticleShape.SMOKE,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.chips = particles.get('riftpendulum.chip', {
      capacity: 500,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.motes = particles.get('riftpendulum.mote', {
      capacity: 600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.2
    });
    this.dustEmitter = new RateEmitter();
    this.streakEmitter = new RateEmitter();
    this.chipEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  get impactDuration() {
    return Math.max(0.05, settings[ID].impactTime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].fadeTime * settings.global.lifetime);
  }

  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f + f * Math.sin(this.age * 11.00);
  }

  onSpawn() {
    this._seed = Math.random() * 10;
    this._spin = Math.random() * Math.PI * 2;
    this._hits = 0;
    this._echoed = false;
    this._settled = false;
    this._struck.length = 0;
    this._carried.length = 0;
    for (let i = 0; i < this._parts.length; i++) this._parts[i].armed = true;
    this.dustEmitter.reset();
    this.streakEmitter.reset();
    this.chipEmitter.reset();
    this.moteEmitter.reset();
    this.detail.reseed(this._seed);
    this.trail.reset();
    this.detail.hide();
    this.rig.hide();
    this.body.visible = false;
    this.voice.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
    this._theta = 0;
    this._omega = 0;
    this._passes = 0;
    this._riftOpen = 0;
    this._bladeDissolve = 0;
    this._sparkEmitter.reset();
    this._pullEmitter.reset();
    this._hidePendulum();
    this._releaseMarks();
    this._palette();
    this._hand();
    if (ZONE) this._telegraph();
  }

  /** The cast leaves the fist: a small flare, a spray of sparks along the aim, motes left hanging. */
  _hand() {
    const c = settings[ID];
    const g = settings.global;
    _pos.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    _pos.y = c.handHeight;
    if (c.handFlare > 0.01) {
      this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
        radius: 0.05,
        endRadius: c.handFlare,
        life: 0.22,
        intensity: 0.6,
        opacity: 0.4 * g.opacity,
        squash: 1,
        colorA: getColor(c.colorBurstA),
        colorB: getColor(c.colorBurstB),
        colorC: getColor(c.colorBurstC)
      });
    }
    const sparks = Math.round(c.handSparks * g.particleCount);
    if (sparks > 0) {
      this._fillEmit(_pos, 0.08, this.direction, c.streakSpeed * 1.2, 0.5, 0.06, c.streakLife * 0.8, 2);
      this.streaks.emit(sparks, _emit);
    }
    const motes = Math.round(c.handMotes * g.particleCount);
    if (motes > 0) {
      this._fillEmit(_pos, 0.15, _up, c.moteSpeed * 0.5, 0.9, 0.08, c.moteLife, 1);
      this.motes.emit(motes, _emit);
    }
  }

  _focusPoint(out) {
    if (ZONE) return this.pointAt(1, out);
    return this.pointAt(this.u, out);
  }

  _aim(out) {
    this._focusPoint(out);
    if (OFFSET) out.addScaledVector(this.side, settings[ID].thickness * 4);
    return out;
  }

  _pose(committed, fadeT) {
    const u = this.u;
    
    
    let grow;
    let open;
    let along;
    along = committed ? (1 - saturate(fadeT < 1 ? fadeT : 1)) : u; grow = 1; open = committed ? saturate(fadeT) : 0;
    let dissolve = 0;
    if (committed && fadeT >= 1) dissolve = saturate((fadeT - 1) * 1.15);
    else if (DISSOLVE_TRAVEL && !committed) dissolve = saturate(u * 0.55);
    const fade = committed && fadeT >= 1 ? 1 - (fadeT - 1) : 1;
    const phrase = committed ? (fadeT < 1 ? 1 : 2) : 0;
    this._groundPose(committed, fadeT);
    this._write(open, grow, along, dissolve, fade, phrase);
  }

  /**
   * The floor's own clock. Before the beat a zone shows its footprint faintly
   * and a line lays its strip behind the head; on the beat the field lands out
   * to the rim over `groundLand` seconds (a line's strip is already down),
   * hot; it cools through the fade and breaks up over its last stretch. The
   * residue decal outlives it.
   */
  _groundPose(committed, fadeT) {
    const c = settings[ID];
    const st = this._state;
    if (!committed) {
      st.land = 1;
      st.pre = 0;
      st.heat = 0.85;
      st.erode = 0;
      return;
    }
    st.land = 1;
    st.pre = 0;
    st.heat = fadeT < 1 ? 1 - 0.3 * fadeT : 0.7 * (1 - saturate((fadeT - 1) * 1.5));
    st.erode = fadeT < 1 ? 0 : saturate((fadeT - 1.4) / 0.6);
  }

  _write(open, grow, along, dissolve, fade, phrase) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._state;
    this._focusPoint(_focus);
    st.center.copy(_focus);
    st.origin.copy(this.origin);
    st.dir.copy(this.direction);
    st.side.copy(this.side);
    st.radius = ZONE ? Math.max(0.2, c.zoneRadius) : Math.max(0.2, c.sweep);
    st.length = Math.max(0.2, this.length);
    st.height = c.height * g.shaderIntensity;
    st.thickness = c.thickness;
    st.count = Math.max(1, c.count);
    st.spin = this._spin;
    st.voiceSpin = this._spin * (COUNTER ? -1.35 : 1);
    st.open = open * (0.35 + Math.max(0, c.lean));
    st.beat = open;
    st.grow = grow;
    st.along = along;
    st.seed = this._seed;
    st.fade = fade;
    st.dissolve = dissolve;
    st.phrase = phrase;
    st.foot = ZONE ? c.zoneRadius * 2 : Math.max(0.4, this.front);
    st.footWidth = ZONE ? c.zoneRadius * 2 : c.groundWidth;
    // A zone's field sits on the circle; a line's covers the strip already crossed.
    if (ZONE) st.groundCenter.copy(_focus);
    else st.groundCenter.copy(this.origin).addScaledVector(this.direction, st.foot * 0.5);
    st.pulse = 1 + c.bodyPulse * Math.sin(this.age * c.bodyPulseRate);
    this.bodyMaterial.userData.sync(st);
    this.lensMaterial.userData.sync(st);
    this.groundMaterial.userData.sync(st);
    this.voiceMaterial.userData.sync(st);
    this.detailMaterial.userData.sync(st);
    this.heroMaterial.userData.sync(st);
    this.trailMaterial.userData.sync(st, this.trail, this._travelTime());
    this.scarMaterial.userData.sync(st, this.trail, this._travelTime());
    this.trail.show(this.isActive);
    this.detail.update(TWIST, ZONE, st, c, this.age);
    this.rig.update(st, c, this.age);
    const show = fade > 0.02 && (grow > 0.02 || open > 0.02);
    this.body.visible = show;
    this.voice.visible = show;
    this.lens.visible = show && c.lensWarp > 0.01;
    this.ground.visible = st.erode < 0.99 && (st.land > 0.001 || st.pre > 0.01);
    this.position.copy(_focus);
    this.position.y = c.height * 0.45;
  }

  _palette() {
    const c = settings[ID];
    const g = settings.global;
    const sync = (p, a, b, cc, d, size, glow, grav) => {
      p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
      p.uniforms.uSizeScale.value = size * g.particleSize * 7;
      p.uniforms.uLifeScale.value = g.particleLifetime;
      p.uniforms.uSpeedScale.value = g.particleSpeed;
      p.uniforms.uOpacity.value = g.opacity;
      p.uniforms.uGlow.value = glow;
      p.uniforms.uGravity.value.set(0, grav, 0);
    };
    sync(this.dust, c.colorDustA, c.colorDustB, c.colorDustC, c.colorDustD, c.dustSize, 1, 0.4);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    sync(this.streaks, c.colorStreakA, c.colorStreakB, c.colorStreakC, c.colorStreakD, c.streakSize, 2 * g.glow, 0);
    this.streaks.uniforms.uStretch.value = c.streakStretch;
    sync(this.motes, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD, c.moteSize, 1.6 * g.glow, -0.6);
    this.motes.uniforms.uOpacity.value = 0.9 * g.opacity;
    sync(this.chips, c.colorChipA, c.colorChipB, c.colorChipC, c.colorChipD, c.chipSize, 1, -9);
  }

  _fillEmit(position, radius, direction, speed, spread, size, life, spin) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = 0.4;
    _emit.spread = spread;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = size;
    _emit.sizeVariance = 0.5;
    _emit.life = life;
    _emit.lifeVariance = 0.35;
    _emit.spin = spin;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
  }

  _shed(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    this._focusPoint(_end);
    const dustN = Math.round(this.dustEmitter.tick(dt, c.dustRate * strength) * g.particleCount);
    if (dustN > 0) {
      this._fillEmit(_end, ZONE ? c.zoneRadius * 0.35 : 0.3, _dir, c.dustSpeed, 0.45, 0.45, c.dustLife, 0.4);
      for (let i = 0; i < dustN; i++) {
        const ang = this._spin + i * 0.7;
        _dir.set(-Math.cos(ang), 0.05, -Math.sin(ang));
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const streakN = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (streakN > 0) {
      this._fillEmit(_end, 0.2, _dir, c.streakSpeed, 0.22, 0.08, c.streakLife, 2);
      for (let i = 0; i < streakN; i++) {
        const ang = this._spin * 1.7 + i;
        _dir.set((Math.random() - 0.5) * 0.2, -0.15, (Math.random() - 0.5) * 0.2);
        _emit.direction = _dir;
        this.streaks.emit(1, _emit);
      }
    }
    const chipN = Math.round(this.chipEmitter.tick(dt, c.chipRate * strength) * g.particleCount);
    if (chipN > 0) {
      this._fillEmit(_end, 0.16, _dir, c.chipSpeed, 0.4, 0.08, c.chipLife, 6);
      for (let i = 0; i < chipN; i++) {
        const ang = this._spin + i * 1.3;
        _dir.set(Math.cos(ang), 0.7, Math.sin(ang));
        _emit.direction = _dir;
        this.chips.emit(1, _emit);
      }
    }
    this._motes(dt, strength);
  }

  /** Motes drift off whichever detail pieces are standing. */
  _motes(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength * (this.detail.live / Math.max(1, c.detailCount))) * g.particleCount);
    if (n <= 0) return;
    const count = Math.round(c.detailCount);
    for (let k = 0; k < n; k++) {
      const pick = Math.floor(Math.random() * count);
      if (!this.detail.pointOf(pick, _pos)) continue;
      _dir.set((Math.random() - 0.5) * 0.6, 1, (Math.random() - 0.5) * 0.6);
      this._fillEmit(_pos, 0.12, _dir, c.moteSpeed, 0.5, 0.08, c.moteLife, 1);
      this.motes.emit(1, _emit);
    }
  }

  _already(dummy) {
    for (let i = 0; i < this._struck.length; i++) if (this._struck[i] === dummy) return true;
    return false;
  }

  _remember(dummy) {
    if (this._struck.length < 24) this._struck.push(dummy);
    if (CARRY !== 'none' && this._carried.length < 16) this._carried.push(dummy);
    this._hits++;
    this._mark(dummy);
  }

  /** Start a felled body wearing the element. */
  _mark(dummy) {
    if (this._markCount >= MAX_MARKS) return;
    const slot = this._marks[this._markCount++];
    slot.dummy = dummy;
    slot.time = 0;
    slot.emitter.reset();
  }

  /** Stain the marked bodies toward the element's look and keep them shedding. */
  _updateMarks(dt) {
    if (this._markCount === 0) return;
    const c = settings[ID];
    const g = settings.global;
    const look = this._look;
    look.color = c.colorMarkBody;
    look.rimColor = c.colorMarkRim;
    look.rimEmissive = c.markRimGlow;
    look.edgeColor = c.colorMarkEdge;
    look.edgeEmissive = c.markEdgeGlow;
    look.edgeWidth = c.markEdgeWidth;
    for (let i = 0; i < this._markCount; i++) {
      const slot = this._marks[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt;
      dummy.corrode(saturate(slot.time / Math.max(0.02, c.markTime)) * c.markAmount, look);
      const left = 1 - saturate(slot.time / Math.max(0.05, c.markLife * g.lifetime));
      if (left <= 0) continue;
      const n = Math.round(slot.emitter.tick(dt, c.markMotes * left) * g.particleCount);
      if (n <= 0) continue;
      const at = dummy.bodyPoint?.(_body) ?? _body.copy(dummy.position).setY(0.9);
      this._fillEmit(at, 0.3, _up, c.moteSpeed, 0.7, 0.08, c.moteLife, 1);
      this.motes.emit(n, _emit);
    }
  }

  _releaseMarks() {
    for (let i = 0; i < this._markCount; i++) this._marks[i].dummy = null;
    this._markCount = 0;
  }


  _killDir() {
    const ang = lerp(-settings[ID].sweep, settings[ID].sweep, saturate(this._state.along));
    _dir.copy(this.direction).multiplyScalar(Math.cos(ang)).addScaledVector(this.side, Math.sin(ang));
  }

  _blow(dummy, mode) {
    const c = settings[ID];
    const g = settings.global;
    if (mode && mode !== HIT) this._killEcho(dummy, mode);
    else this._killDir(dummy);
    this._force.impulse = c.hitImpulse * g.explosionIntensity;
    this._force.lift = c.hitLift * g.explosionIntensity * LIFT;
    if (mode === 'up') this._force.lift *= 1.4;
    this._force.spin = c.hitSpin;
    if (dummy.kill(_dir.x, _dir.z, this._force, SLICE || mode === 'swing')) this._remember(dummy);
  }

  _killEcho(dummy, mode) {
    this._aim(_focus);
    if (mode === 'up') {
      _dir.copy(this.direction).multiplyScalar(0.2);
      return;
    }
    _dir.set(dummy.position.x - _focus.x, 0, dummy.position.z - _focus.z);
    if (_dir.lengthSq() < 1e-4) _dir.copy(this.direction);
    else _dir.normalize();
    if (mode === 'in') _dir.multiplyScalar(-1);
    if (mode === 'tangent') {
      const x = _dir.x;
      _dir.set(-_dir.z, 0, x);
    }
  }

  _gather(x, z, radius, mode) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(x, z, radius, this._found);
    for (let i = 0; i < found.length; i++) {
      const dummy = found[i];
      if (this._already(dummy)) continue;
      this._blow(dummy, mode);
    }
    this._found.length = 0;
  }


  _head(i, n) {
    return saturate(this.u * n - i);
  }

  _partPoint(i, n, out) {
    const c = settings[ID];
    const lane = ((i + 0.5) / n - 0.5) * 2 * c.sweep;
    const s = (i + 0.5) / n;
    return this.pointAt(s, out).addScaledVector(this.side, lane);
  }

  _strikeParts(forceAll) {
    const c = settings[ID];
    const n = Math.max(1, Math.min(12, Math.round(c.count)));
    for (let i = 0; i < n; i++) {
      if (!forceAll && this._head(i, n) < 0.98) continue;
      if (!this._parts[i].armed) continue;
      this._parts[i].armed = false;
      this._partPoint(i, n, _end);
      this._gather(_end.x, _end.z, Math.max(0.45, c.thickness * 4 + 0.5));
    }
  }

  _strike(forceAll) {
    const c = settings[ID];
    if (WHEN === 'part') {
      this._strikeParts(forceAll);
      return;
    }
    if (WHEN === 'late' && this.u < 0.42 && !forceAll) return;
    this._aim(_end);
    const reach = ZONE ? Math.max(c.zoneRadius, c.hitRadius) : Math.max(0.35, c.hitRadius);
    this._gather(_end.x, _end.z, reach);
  }

  _echo() {
    if (!ECHO) return;
    const c = settings[ID];
    this._aim(_end);
    const reach = (ZONE ? Math.max(c.zoneRadius, c.hitRadius) : c.hitRadius) * 1.15;
    this._gather(_end.x, _end.z, reach, ECHO);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * 0.45 * settings.global.explosionIntensity);
    this.ctx.shake.add(c.impactShake * 0.4 * settings.global.cameraShake, 6, 16);
  }

  _drag(dt, fade) {
    if (CARRY === 'none' || fade <= 0.02) return;
    const c = settings[ID];
    this._focusPoint(_focus);
    const grab = saturate(6 * dt) * fade;
    for (let i = this._carried.length - 1; i >= 0; i--) {
      const dummy = this._carried[i];
      if (!dummy || dummy.finished || dummy.alive) {
        dummy?.release?.();
        this._carried.splice(i, 1);
        continue;
      }
      const at = dummy.bodyPoint ? dummy.bodyPoint(_pos) : dummy.position;
      if (!at) continue;
      const dx = _focus.x - at.x;
      const dz = _focus.z - at.z;
      const d = Math.max(0.2, Math.hypot(dx, dz));
      const inward = CARRY === 'in' ? 1 : CARRY === 'out' ? -1 : 0.25;
      const spin = CARRY === 'orbit' ? 4.2 : 1.15;
      const lift = CARRY === 'up' ? 7 : 1.3;
      this._flow.vx = (dx / d) * inward * 6 * c.sweep + (-dz / d) * spin;
      this._flow.vz = (dz / d) * inward * 6 * c.sweep + (dx / d) * spin;
      this._flow.vy = lift * fade;
      dummy.carry(this._field, grab, grab, CARRY === 'up' ? 0.35 : 0);
    }
  }

  _telegraph() {
    const c = settings[ID];
    this.pointAt(1, _end);
    this.ctx.decals.spawn(DecalType.SCORCH, _end, {
      radius: Math.max(0.4, c.zoneRadius) * 0.85,
      life: Math.max(0.4, c.shockLife),
      width: 0.05,
      intensity: 0.45,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.02
    });
  }

  /**
   * The beat lands as a hit, not a pop: shake, flash and a light punch, a
   * burst, real fragments thrown up and out with dust rolled along
   * the floor, and a filled residue decal sized to the strip that stays on the
   * floor after the cast is gone. The thin shock ring is only a trace now (`shockRing`).
   */
  _beat() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._aim(_end);
    this.ctx.shake.add(c.impactShake * power * g.cameraShake, 4, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.impactLight * power;
    if (c.burstOpacity > 0.01) {
      this.ctx.bursts.spawn(BurstMode.AIR, _pos.copy(_end).setY(Math.max(0.4, c.height * 0.35)), {
        radius: 0.35,
        endRadius: c.burstRadius * power,
        life: c.burstLife,
        intensity: 0.85,
        opacity: c.burstOpacity * g.opacity,
        squash: 0.38,
        colorA: getColor(c.colorBurstA),
        colorB: getColor(c.colorBurstB),
        colorC: getColor(c.colorBurstC)
      });
    }
    this._debris(_end);
    this.ctx.decals.spawn(DecalType.SCORCH, _end, {
      radius: Math.max(0.5, c.groundWidth * c.groundStainReach) * power,
      life: c.groundLife * g.lifetime,
      width: 0.8,
      intensity: c.groundStain,
      colorA: getColor(c.colorGroundStain),
      colorB: getColor(c.colorGroundA),
      height: 0.025
    });
    this.ctx.decals.spawn(DecalType.SCORCH, _end, {
      radius: c.shockRadius * (ZONE ? 1 : 0.65) * power,
      life: c.shockLife,
      width: 0.08,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    if (c.shockRing > 0.01) {
      this.ctx.decals.spawn(DecalType.SHOCKWAVE, _end, {
        radius: c.shockRadius * 0.8,
        life: c.shockLife * 0.75,
        width: 0.08,
        intensity: 0.85 * c.shockRing,
        colorA: getColor(c.colorShockB),
        colorB: getColor(c.colorShockA),
        height: 0.03
      });
    }
  }

  /** Fragments thrown up and out of the strike, and dust rolled out along the floor. */
  _debris(at) {
    const c = settings[ID];
    const g = settings.global;
    const spread = ZONE ? c.zoneRadius * 0.4 : 0.5;
    _pos.copy(at).setY(0.15);
    const chips = Math.round(c.impactChips * g.particleCount * g.explosionIntensity);
    if (chips > 0) {
      this._fillEmit(_pos, spread, _up, c.chipSpeed * 1.5, 0.8, c.chipSize * 1.4, c.chipLife * 1.3, 8);
      this.chips.emit(chips, _emit);
    }
    const dust = Math.round(c.impactDust * g.particleCount);
    for (let i = 0; i < dust; i++) {
      const ang = (i / Math.max(1, dust)) * Math.PI * 2 + this._spin;
      _dir.set(Math.cos(ang), 0.12, Math.sin(ang));
      this._fillEmit(_pos, spread * 0.6, _dir, c.dustSpeed * 1.8, 0.25, 0.6, c.dustLife * 1.4, 0.4);
      this.dust.emit(1, _emit);
    }
  }

  /** The smaller second beat: a low dust roll settling over the field, a thud and a last flare of light. */
  _aftershock() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._aim(_end);
    this.ctx.shake.add(c.aftershockShake * power * g.cameraShake, 3, 12);
    this.lightBoost += c.aftershockLight * power;
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
      radius: c.aftershockRadius * power,
      life: c.aftershockLife,
      width: 0.06,
      intensity: 0.55,
      colorA: getColor(c.colorGroundB),
      colorB: getColor(c.colorGroundA),
      height: 0.03
    });
  }

  /** Seconds the head takes over the whole line — the trail's clock. */
  _travelTime() {
    return Math.max(0.05, this.length / Math.max(1, settings[ID].speed * settings.global.speed));
  }

  /** Where the head crosses each `wakeSpacing` metre: a scorch decal and a few chips. */
  _wake(point, lane, s) {
    const c = settings[ID];
    const g = settings.global;
    _pos.copy(point).setY(0);
    this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
      radius: c.wakeRadius * (0.8 + 0.4 * Math.random()),
      life: c.wakeLife * g.lifetime,
      width: 0.08,
      intensity: 0.75,
      colorA: getColor(c.colorScarB),
      colorB: getColor(c.colorScarA),
      height: 0.03
    });
    const chips = Math.round(c.wakeChips * g.particleCount);
    if (chips > 0) {
      this._fillEmit(_pos.setY(0.1), 0.25, _up, c.chipSpeed * 0.6, 0.8, c.chipSize, c.chipLife, 3);
      this.chips.emit(chips, _emit);
    }
  }

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._spin += dt * c.spinSpeed * g.animationSpeed;
    this._pose(false, 0);
    this._pendulum(false, 0, dt);
    this._palette();
    this._shed(dt, 0.35 + 0.65 * this._state.grow);
    this.trail.tick(dt, this._state.along, this._state, c.wakeSpacing);
    if (WHEN === 'travel' || WHEN === 'part' || WHEN === 'late') this._strike(false);
    this._updateMarks(dt);
    this.ctx.shake.rumble(0.035 * c.impactShake * g.cameraShake, dt);
  }

  onImpact() {
    this._beat();
    if (WHEN === 'commit' || WHEN === 'part') this._strike(true);
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const fade = t < 1 ? 1 : 1 - (t - 1);
    this._spin += dt * c.spinSpeed * g.animationSpeed * 0.40;
    this._pose(true, t);
    this._pendulum(true, t, dt);
    this._palette();
    this._shed(dt, fade * 0.7);
    this.trail.tick(dt, 1, this._state, c.wakeSpacing);
    if (WHEN === 'return') this._strike(false);
    if (!this._settled && t > c.aftershockAt) {
      this._settled = true;
      this._aftershock();
    }
    if (ECHO && !this._echoed && t > 1.08) {
      this._echoed = true;
      this._echo();
    }
    this._drag(dt, fade);
    this._updateMarks(dt);
  }

  onDestroy() {
    this._releaseMarks();
    for (let i = 0; i < this._carried.length; i++) this._carried[i].release?.();
    this._carried.length = 0;
    this.body.visible = false;
    this.voice.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
    this.detail.hide();
    this.rig.hide();
    this.trail.hide();
    this._hidePendulum();
  }

  dispose() {
    this.bladeGeometry.dispose();
    this.armGeometry.dispose();
    this.knotGeometry.dispose();
    this.tearGeometry.dispose();
    this.bladeMaterial.dispose();
    this.armMaterial.dispose();
    this.knotMaterial.dispose();
    this.tearMaterial.dispose();
    this.woundMaterial.dispose();
    this.trail.dispose();
    this.trailMaterial.dispose();
    this.scarMaterial.dispose();
    this.detail.dispose();
    this.rig.dispose();
    this.detailMaterial.dispose();
    this.heroMaterial.dispose();
    this.bodyGeometry.dispose();
    this.voiceGeometry.dispose();
    this.groundGeometry.dispose();
    this.bodyMaterial.dispose();
    this.lensMaterial.dispose();
    this.groundMaterial.dispose();
    this.voiceMaterial.dispose();
    super.dispose();
  }
}

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('Rift Pendulum');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'travel (m/s)');
  R(cast, c, 'cooldown', 0, 8, 0.05, 'cooldown');
  R(cast, c, 'impactTime', 0.05, 3, 0.01, 'impact (s)');
  R(cast, c, 'fadeTime', 0.05, 4, 0.01, 'fade (s)');
  
  Editor.castAnimation(cast, c);

  const hand = folder.addFolder('0 · Hand');
  R(hand, c, 'handForward', -0.5, 2, 0.01, 'forward (m)');
  R(hand, c, 'handSide', -1, 1, 0.01, 'side (m)');
  R(hand, c, 'handHeight', 0.2, 2.5, 0.01, 'height (m)');
  R(hand, c, 'handFlare', 0, 3, 0.01, 'flare (m)');
  R(hand, c, 'handSparks', 0, 120, 1, 'sparks');
  R(hand, c, 'handMotes', 0, 80, 1, 'motes');

  const shape = folder.addFolder('1 · Shape — return');
  R(shape, c, 'count', 1, 16, 1, 'count');
  R(shape, c, 'height', 0.2, 10, 0.05, 'height (m)');
  R(shape, c, 'thickness', 0.02, 2, 0.01, 'thickness (m)');
  R(shape, c, 'sweep', 0, 8, 0.05, 'reach');
  R(shape, c, 'lean', 0, 3, 0.01, 'lean');

  const motion = folder.addFolder('2 · Timing');
  R(motion, c, 'spinSpeed', -20, 20, 0.1, 'spin (rad/s)');
  R(motion, c, 'lifetime', 0.1, 5, 0.05, 'hold (s)');

  const look = folder.addFolder('3 · Body');
  R(look, c, 'bodyOpacity', 0, 2, 0.01, 'opacity');
  R(look, c, 'bodyGlow', 0, 4, 0.01, 'body glow');
  R(look, c, 'edgeGlow', 0, 10, 0.05, 'edge glow');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft fade (m)');
  R(look, c, 'bodyPulse', 0, 1, 0.01, 'pulse');
  R(look, c, 'bodyPulseRate', 0, 20, 0.1, 'pulse rate');
  R(look, c, 'lensWarp', 0, 3, 0.01, 'lens warp');
  look.addColor(c, 'colorA').name('edge');
  look.addColor(c, 'colorB').name('core');
  look.addColor(c, 'colorC').name('deep');

  const voice = folder.addFolder('4 · Voice');
  R(voice, c, 'voiceOpacity', 0, 2, 0.01, 'opacity');
  voice.addColor(c, 'colorVoiceA').name('voice');
  voice.addColor(c, 'colorVoiceB').name('voice, hot');

  const floor = folder.addFolder('5 · Ground');
  R(floor, c, 'groundWidth', 0.2, 16, 0.05, 'width (m)');
  R(floor, c, 'groundGlow', 0, 6, 0.05, 'glow');
  R(floor, c, 'groundLife', 0.1, 12, 0.05, 'residue life (s)');
  R(floor, c, 'groundOpacity', 0, 2, 0.01, 'opacity');
  R(floor, c, 'groundHeat', 0, 4, 0.05, 'heat');
  R(floor, c, 'groundCoat', 0, 1, 0.01, 'stain .. coat');
  
  R(floor, c, 'groundStain', 0, 1.5, 0.01, 'residue');
  R(floor, c, 'groundStainReach', 0.1, 2, 0.01, 'residue reach');
  floor.addColor(c, 'colorGroundA').name('ground');
  floor.addColor(c, 'colorGroundB').name('ground, deep');
  floor.addColor(c, 'colorGroundStain').name('stain');

  const pieces = folder.addFolder('6 · Detail pieces');
  R(pieces, c, 'detailCount', 0, 48, 1, 'count');
  R(pieces, c, 'detailSize', 0.05, 2, 0.01, 'size (m)');
  R(pieces, c, 'detailSizeJitter', 0, 1, 0.01, 'size jitter');
  R(pieces, c, 'detailSpread', 0.1, 2, 0.01, 'spread');
  R(pieces, c, 'detailLift', 0, 8, 0.05, 'lift (m)');
  R(pieces, c, 'detailSpin', -4, 4, 0.05, 'orbit');
  R(pieces, c, 'detailGlow', 0, 6, 0.05, 'rim glow');
  R(pieces, c, 'detailOpacity', 0, 1.5, 0.01, 'opacity');
  R(pieces, c, 'detailSwing', 0, 2.5, 0.01, 'fold');
  R(pieces, c, 'detailEdge', 0, 4, 0.05, 'arris light');
  R(pieces, c, 'detailDeep', 0, 1, 0.01, 'colour depth');
  pieces.addColor(c, 'colorDetailA').name('rim');
  pieces.addColor(c, 'colorDetailB').name('lit');
  pieces.addColor(c, 'colorDetailC').name('shade');

  const hero = folder.addFolder('7 · Hero rig');
  R(hero, c, 'heroSize', 0.2, 8, 0.05, 'size (m)');
  R(hero, c, 'heroReach', 0.1, 1.4, 0.01, 'ring fit');
  R(hero, c, 'heroLift', 0, 8, 0.05, 'travel (m)');
  R(hero, c, 'heroSpin', -4, 4, 0.05, 'turn');
  R(hero, c, 'heroSwing', 0, 2.5, 0.01, 'fold');
  R(hero, c, 'heroGlow', 0, 6, 0.05, 'rim glow');
  R(hero, c, 'heroEdge', 0, 4, 0.05, 'arris light');
  R(hero, c, 'heroOpacity', 0, 1.5, 0.01, 'opacity');
  R(hero, c, 'heroDeep', 0, 1, 0.01, 'colour depth');
  R(hero, c, 'heroMaxHeight', 1, 12, 0.05, 'max height (m)');
  R(hero, c, 'heroMinSpan', 0, 6, 0.05, 'min span (m)');
  hero.addColor(c, 'colorHeroA').name('rim');
  hero.addColor(c, 'colorHeroB').name('lit');
  hero.addColor(c, 'colorHeroC').name('shade');

  const parts = folder.addFolder('8 · Shed');
  R(parts, c, 'dustRate', 0, 400, 1, 'dust / s');
  R(parts, c, 'dustSize', 0.02, 2, 0.01, 'dust size');
  R(parts, c, 'dustSpeed', 0, 20, 0.1, 'dust speed');
  R(parts, c, 'dustLife', 0.05, 3, 0.01, 'dust life');
  R(parts, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(parts, c, 'colorDust', 'dust colour');
  R(parts, c, 'streakRate', 0, 400, 1, 'shed / s');
  R(parts, c, 'streakSize', 0.005, 0.4, 0.005, 'shed size');
  R(parts, c, 'streakSpeed', 0, 30, 0.1, 'shed speed');
  R(parts, c, 'streakLife', 0.05, 2, 0.01, 'shed life');
  R(parts, c, 'streakStretch', 0, 4, 0.01, 'shed stretch');
  Editor.gradient(parts, c, 'colorStreak', 'shed colour');
  R(parts, c, 'chipRate', 0, 200, 1, 'chips / s');
  R(parts, c, 'chipSize', 0.01, 0.4, 0.005, 'chip size');
  R(parts, c, 'chipSpeed', 0, 20, 0.1, 'chip speed');
  R(parts, c, 'chipLife', 0.05, 3, 0.01, 'chip life');
  Editor.gradient(parts, c, 'colorChip', 'chip colour');

  const motes = folder.addFolder('9 · Motes');
  R(motes, c, 'moteRate', 0, 200, 1, 'motes / s');
  R(motes, c, 'moteSize', 0.01, 0.4, 0.005, 'size');
  R(motes, c, 'moteSpeed', 0, 10, 0.1, 'speed');
  R(motes, c, 'moteLife', 0.1, 4, 0.05, 'life');
  Editor.gradient(motes, c, 'colorMote', 'mote colour');

  const beat = folder.addFolder('10 · The beat');
  R(beat, c, 'impactShake', 0, 2, 0.01, 'camera punch');
  R(beat, c, 'impactFlash', 0, 1, 0.01, 'flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 12, 0.05, 'burst (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'burst life');
  R(beat, c, 'burstOpacity', 0, 1.5, 0.01, 'burst opacity');
  R(beat, c, 'impactChips', 0, 200, 1, 'fragments');
  R(beat, c, 'impactDust', 0, 120, 1, 'dust roll');
  beat.addColor(c, 'colorBurstA').name('burst, hot');
  beat.addColor(c, 'colorBurstB').name('burst, body');
  beat.addColor(c, 'colorBurstC').name('burst, deep');
  R(beat, c, 'shockRadius', 0, 16, 0.05, 'decal (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'decal life');
  R(beat, c, 'shockRing', 0, 1.5, 0.01, 'shock ring');
  beat.addColor(c, 'colorShockA').name('decal');
  beat.addColor(c, 'colorShockB').name('decal, hot');

  const after = folder.addFolder('11 · Aftershock');
  R(after, c, 'aftershockAt', 1, 1.9, 0.01, 'lands at');
  R(after, c, 'aftershockRadius', 0, 12, 0.05, 'dust roll (m)');
  R(after, c, 'aftershockShake', 0, 2, 0.01, 'camera punch');
  R(after, c, 'aftershockLight', 0, 40, 0.5, 'light punch');
  R(after, c, 'aftershockLife', 0.05, 3, 0.01, 'dust life');

  const bodies = folder.addFolder('12 · Bodies');
  R(bodies, c, 'hitRadius', 0.1, 12, 0.05, 'reach (m)');
  R(bodies, c, 'hitImpulse', 0, 24, 0.1, 'impulse');
  R(bodies, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(bodies, c, 'hitSpin', 0, 8, 0.05, 'spin');

  const mark = folder.addFolder('13 · Mark — hollowed out');
  R(mark, c, 'markAmount', 0, 1, 0.01, 'stain');
  R(mark, c, 'markTime', 0.02, 3, 0.01, 'sets in (s)');
  R(mark, c, 'markLife', 0, 8, 0.05, 'sheds for (s)');
  R(mark, c, 'markMotes', 0, 120, 1, 'motes / s');
  mark.addColor(c, 'colorMarkBody').name('body');
  mark.addColor(c, 'colorMarkRim').name('rim');
  R(mark, c, 'markRimGlow', 0, 6, 0.05, 'rim glow');
  mark.addColor(c, 'colorMarkEdge').name('edge');
  R(mark, c, 'markEdgeGlow', 0, 8, 0.05, 'edge glow');
  R(mark, c, 'markEdgeWidth', 0, 0.3, 0.005, 'edge width');

  const trail = folder.addFolder('14 · Trail');
  R(trail, c, 'trailWidth', 0, 3, 0.01, 'ribbon width (m)');
  R(trail, c, 'trailLife', 0.05, 6, 0.05, 'ribbon life (s)');
  R(trail, c, 'trailOpacity', 0, 2, 0.01, 'ribbon opacity');
  R(trail, c, 'trailGlow', 0, 4, 0.01, 'ribbon glow');
  R(trail, c, 'trailCore', 0, 1, 0.01, 'white core');
  R(trail, c, 'trailBreakup', 0, 3, 0.01, 'break-up');
  R(trail, c, 'scarWidth', 0, 4, 0.01, 'scar width (m)');
  R(trail, c, 'scarLife', 0.05, 8, 0.05, 'scar life (s)');
  R(trail, c, 'scarOpacity', 0, 1, 0.01, 'scar opacity');
  R(trail, c, 'scarGlow', 0, 6, 0.05, 'seam glow');
  trail.addColor(c, 'colorScarA').name('seam');
  trail.addColor(c, 'colorScarB').name('bed');
  R(trail, c, 'wakeSpacing', 0, 6, 0.05, 'wake every (m)');
  R(trail, c, 'wakeRadius', 0, 4, 0.01, 'wake decal (m)');
  R(trail, c, 'wakeLife', 0.05, 6, 0.05, 'wake life (s)');
  R(trail, c, 'wakeChips', 0, 40, 1, 'wake chips');

  const pend = folder.addFolder('15 · The pendulum (hero)');
  R(pend, c, 'bladeSpan', 0, 5, 0.01, 'blade span (m)');
  R(pend, c, 'pendPivotHeight', 0.5, 8, 0.05, 'pivot height (m)');
  R(pend, c, 'pendArm', 0.2, 7, 0.05, 'arm length (m)');
  R(pend, c, 'armWidth', 0, 0.3, 0.005, 'arm radius (m)');
  R(pend, c, 'pendAmplitude', 0, 1.5, 0.01, 'swing (rad)');
  R(pend, c, 'pendPeriod', 0.2, 4, 0.01, 'period (s)');
  R(pend, c, 'pendDamping', 0, 4, 0.01, 'damping');
  R(pend, c, 'pendExit', 0.05, 2, 0.01, 'shatter (s)');
  R(pend, c, 'bladeTravelScale', 0.1, 1.5, 0.01, 'thrown size');
  R(pend, c, 'bladeSpin', -40, 40, 0.5, 'thrown spin (rad/s)');
  R(pend, c, 'bladeArc', 0, 4, 0.05, 'throw arc (m)');
  R(pend, c, 'bladeSpecular', 0, 4, 0.01, 'specular');
  R(pend, c, 'bladeFresnel', 0, 4, 0.01, 'fresnel');
  R(pend, c, 'bladeAmbient', 0, 1, 0.01, 'ambient');
  R(pend, c, 'bladeEdgeGlow', 0, 6, 0.05, 'edge glow');
  R(pend, c, 'bladeVeins', 0, 3, 0.01, 'rift veins');
  pend.addColor(c, 'colorBladeCore').name('core');
  pend.addColor(c, 'colorBladeTint').name('tint');
  pend.addColor(c, 'colorBladeBody').name('body');
  pend.addColor(c, 'colorBladeDeep').name('deep');
  R(pend, c, 'pivotSize', 0, 1.5, 0.01, 'knot size (m)');
  R(pend, c, 'pivotSpikes', 0, 1, 0.01, 'knot spikes');
  R(pend, c, 'pivotGlow', 0, 4, 0.01, 'knot glow');
  R(pend, c, 'passShake', 0, 1, 0.01, 'pass punch');
  R(pend, c, 'passLight', 0, 20, 0.1, 'pass light');
  R(pend, c, 'passDust', 0, 40, 1, 'pass dust');
  R(pend, c, 'swingSparks', 0, 300, 1, 'edge sparks / s');

  const rift = folder.addFolder('16 · The rift');
  R(rift, c, 'riftHeight', 0, 6, 0.05, 'tear height (m)');
  R(rift, c, 'riftWidth', 0.1, 3, 0.01, 'tear half-width (m)');
  R(rift, c, 'riftDepth', -1, 2, 0.01, 'tear behind blade (m)');
  R(rift, c, 'riftOpenTime', 0.02, 1, 0.01, 'opens in (s)');
  R(rift, c, 'riftHold', 0, 3, 0.01, 'hangs open (s)');
  R(rift, c, 'riftCloseTime', 0.05, 2, 0.01, 'zips shut in (s)');
  R(rift, c, 'riftLip', 0.01, 0.5, 0.005, 'lip (m)');
  R(rift, c, 'riftJag', 0, 2, 0.01, 'jag');
  R(rift, c, 'riftSwirl', 0, 4, 0.01, 'drain');
  R(rift, c, 'riftGlow', 0, 4, 0.01, 'lip glow');
  R(rift, c, 'riftMotes', 0, 200, 1, 'motes drawn in / s');
  rift.addColor(c, 'colorRiftDeep').name('inside');
  rift.addColor(c, 'colorRiftLip').name('lip');
  R(rift, c, 'woundLength', 0, 10, 0.05, 'floor wound length (m)');
  R(rift, c, 'woundWidth', 0.05, 2, 0.01, 'floor wound half-width (m)');
  R(rift, c, 'woundGlow', 0, 4, 0.01, 'floor wound glow');
  R(rift, c, 'woundClose', 0.05, 2, 0.01, 'floor wound closes in (s)');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'impactLight', 0, 40, 0.5, 'light punch');
}
