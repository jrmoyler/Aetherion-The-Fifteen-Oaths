import { Mesh, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createFeatherGeometry,
  createHaloGeometry,
  createRayGeometry,
  createDartGeometry,
  createGlintGeometry,
  createSigilGeometry,
  createWarpGeometry
} from '../../assets/codex/SeraphicDescentGeometry.js';
import {
  createFeatherMaterial,
  createHaloMaterial,
  createRayMaterial,
  createSigilMaterial,
  createDartMaterial,
  createGlintMaterial,
  createWarpMaterial
} from '../../materials/codex/SeraphicDescentMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing, hash11 } from '../../utils/math.js';

export const ID = 'seraph';

/** Feathers per wing: a flight row of up to 40 and four covert rows of up to 30. */
const MAX_ROW0 = 40;
const MAX_COVERT = 30;
const MAX_ROWS = 4;
const MAX_PER_WING = MAX_ROW0 + MAX_ROWS * MAX_COVERT;
const MAX_FEATHERS = MAX_PER_WING * 2;
/** Feather darts per cast, bodies first. */
const MAX_DARTS = 72;
/** Bodies one descent can hold in the light. */
const MAX_HELD = 10;
/** God-ray slots: the slanting shafts, then one per held body. */
const MAX_SHAFTS = 6;
const MAX_RAYS = MAX_SHAFTS + MAX_HELD;
/** Glint slots: the herald, the halo's bloom, then one per dart landing. */
const GLINT_HERALD = 0;
const GLINT_BLOOM = 1;
const GLINT_DARTS = 2;
const MAX_GLINTS = GLINT_DARTS + MAX_DARTS;
const TAU = Math.PI * 2;
/** Joints the light takes hold of, in order of preference. */
const PIN_JOINTS = ['Spine2', 'Spine1', 'Spine'];

const _emit = {};
const _pos = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _up = new Vector3(0, 1, 0);
const _down = new Vector3(0, -1, 0);
const _body = new Vector3();

/**
 * SERAPHIC DESCENT — Light, zone cast.
 *
 * A mote of light climbs from the hand to a point high over the circle and
 * opens into a halo; two great wings of light unfold out of it, breathe, rise
 * and beat once — and the beat looses a rain of feather blades into every body
 * in the circle and into the floor. The struck are caught on the light: pinned
 * by the chest and drawn gently upward, hanging, each in its own shaft — and
 * then the light lets go and they drop. The wings fold, the halo lifts away.
 *
 * One clock, started when the herald reaches the halo (`_clock`), drives every
 * beat; every one of its marks is read live off `settings.seraph`.
 *
 * ## Layers
 *
 *   - **wings** (`createFeatherMaterial`) — the hero. Up to 320 instanced
 *     feather strips in five layered rows (flight feathers and covert rows),
 *     posed *entirely in the vertex stage* from a dozen uniforms: the arched
 *     arm, the fold, the flap, the sweep, the fan. The ability only writes
 *     where on the arm each feather hangs and its dice, and mirrors the pose in
 *     `wingPoint` for the things that need a wing point on the CPU (dart
 *     launches, motes, shed feathers). Gold at the root to white at the tip,
 *     raked barbs, a glowing rachis, torn vanes, light moving across the wing.
 *   - **halo** (`createHaloMaterial`) — a camera-facing ribbon round a circle
 *     tipped toward the caster: white core, gold glow, turning beads; drawn
 *     round from the front, lifts away on the exit. A bloom glint behind it.
 *   - **god rays** (`createRayMaterial`) — additive frustums slanting from the
 *     halo to the floor, brightest through their middles, streaks pouring down,
 *     soft where they meet the floor; plus a narrow shaft over every body held.
 *   - **sigil** (`createSigilMaterial`) — the floor: rings, a radiant star, a
 *     turning band of runes; drawn on as the halo forms, flaring on the beat.
 *   - **feather darts** (`createDartMaterial`) — instanced blades with gold
 *     light trails, loosed from the wing tips on the beat, bowing as they
 *     fall; they stay stuck in the floor, glowing, then go.
 *   - **glints** — the herald, the halo bloom, a star of light at each landing.
 *   - **particles** — motes sifting off the wings, loose feathers (LEAF)
 *     drifting down and shaken off by the beat, sparks thrown by each landing.
 *   - **the beat** — an AIR shell off the wings, a shock ring on the floor, a
 *     flash, a shake and a light punch, and a pressure ring through the
 *     distortion proxy (`createWarpMaterial`, `LAYER.DISTORTION`), which also
 *     shimmers steadily round the open wings.
 *
 * ## The struck (`handlesOwnHits`)
 *
 * Bodies are not hit by the zone: they are hit by darts. Each body in the
 * circle at the moment of the beat is assigned `dartsPerBody` darts, which
 * track it in flight. The first to arrive knocks it down with a small blow and
 * the light takes hold: its chest is pinned (`Dummy#pin`, soft) to a point that
 * rises `liftHeight` over `liftTime`, swaying, so the body hangs and swings
 * from the light with its limbs dangling. At the drop mark every held body is
 * unpinned, released and shoved down.
 *
 * ## The editor rule
 *
 * Records hold only dice and the events they latch (a dart's launch point, its
 * landing). Feather layout, wing pose, every time, every size and colour are
 * resolved from `settings.seraph` every frame, so the editor reshapes a
 * descent mid-cast — including the feather counts, which are re-laid-out every
 * frame (a few hundred floats).
 */
export class SeraphicDescentAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Feathers drawn plus darts alive. HUD readout only. */
  get instanceCount() {
    let n = this.wingGeometry.instanceCount;
    for (let i = 0; i < this._dartCount; i++) if (this.darts[i].level > 0) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.sigilGeometry = createSigilGeometry();
    this.sigilMaterial = createSigilMaterial();
    this.sigil = this._mesh(this.sigilGeometry, this.sigilMaterial, 4);

    this.rayGeometry = createRayGeometry(MAX_RAYS);
    this.rayMaterial = createRayMaterial();
    this.rays = this._mesh(this.rayGeometry, this.rayMaterial, 8);

    this.wingGeometry = createFeatherGeometry(MAX_FEATHERS);
    this.wingMaterial = createFeatherMaterial();
    this.wings = this._mesh(this.wingGeometry, this.wingMaterial, 12);

    this.haloGeometry = createHaloGeometry();
    this.haloMaterial = createHaloMaterial();
    this.halo = this._mesh(this.haloGeometry, this.haloMaterial, 13);

    this.dartGeometry = createDartGeometry(MAX_DARTS);
    this.dartMaterial = createDartMaterial();
    this.dartMesh = this._mesh(this.dartGeometry, this.dartMaterial, 14);

    this.glintGeometry = createGlintGeometry(MAX_GLINTS);
    this.glintMaterial = createGlintMaterial();
    this.glints = this._mesh(this.glintGeometry, this.glintMaterial, 15);
    this.glintGeometry.instanceCount = MAX_GLINTS;

    this.warpGeometry = createWarpGeometry();
    this.warpMaterial = createWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.frustumCulled = false;
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.visible = false;
    this.group.add(this.warp);

    /** Darts: dice plus the two events they latch. */
    this.darts = [];
    for (let i = 0; i < MAX_DARTS; i++) {
      this.darts.push({
        order: 0, // 0..1 slot in the volley
        flight: 1, // × dartFlight
        side: 1, // which wing it leaves
        s: 0, // where along that wing
        angle: 0, // ground landing dice
        area: 0,
        bodyY: 0, // where on a body it strikes, metres
        arc: 0, // −1..1 bow
        seed: 0,
        dummy: null, // the body it is aimed at, or null for the floor
        launched: false,
        landed: false,
        landAt: 0,
        level: 0,
        start: new Vector3(), // latched at launch
        land: new Vector3(), // latched at landing (head)
        offset: new Vector3(), // from the body point, once stuck in a body
        fly: new Vector3(0, -1, 0) // last flight direction
      });
    }
    this._dartCount = 0;

    /** Bodies held in the light. */
    this.held = [];
    for (let i = 0; i < MAX_HELD; i++) {
      this.held.push({ dummy: null, time: 0, x: 0, z: 0, seed: 0, joint: 'Spine2' });
    }
    this._heldCount = 0;

    /** Shaft dice. */
    this._rayAngle = new Float32Array(MAX_SHAFTS);
    this._rayDist = new Float32Array(MAX_SHAFTS);
    this._rayTop = new Float32Array(MAX_SHAFTS);
    this._raySeed = new Float32Array(MAX_SHAFTS);

    /** The live wing pose, shared with the shader (see `wingPoint`). */
    this._pose = {
      centre: new Vector3(),
      side: new Vector3(1, 0, 0),
      toward: new Vector3(0, 0, -1),
      span: 1,
      rot: 0,
      open: 0,
      bend: 0,
      sweepFwd: 0,
      reveal: 0,
      dissolve: 0,
      level: 0
    };
    this._haloState = {
      centre: new Vector3(),
      side: new Vector3(1, 0, 0),
      forward: new Vector3(0, 0, 1),
      radius: 1,
      draw: 0,
      level: 0,
      spinPhase: 0
    };
    this._sigilState = { radius: 4, draw: 0, pulse: 0, fade: 1, spinPhase: 0, front: 0, seed: 0 };
    this._warpState = { strength: 0, ring: -1 };

    this._clock = -1;
    this._prevRot = 0;
    this._flapVel = 0;
    this._beaten = false;
    this._loosed = false;
    this._dropped = false;
    this._pulse = 0;
    this._haloSpin = 0;
    this._sigilSpin = 0;
    this._seed = 0;
    this._targets = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  _mesh(geometry, material, order) {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.layers.set(LAYER.VFX);
    mesh.renderOrder = order;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.motes = particles.get('seraph.mote', { capacity: 1600, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.3 });
    this.motes.uniforms.uDrag.value = 0.9;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uSizeIn.value = 0.12;
    this.motes.uniforms.uFadeIn.value = 0.15;
    this.motes.uniforms.uFadeOut.value = 0.5;

    this.down = particles.get('seraph.down', { capacity: 600, shape: ParticleShape.LEAF, additive: true, softFade: 0.3 });
    this.down.uniforms.uDrag.value = 1.6;
    this.down.uniforms.uEndSize.value = 0.7;
    this.down.uniforms.uSizeIn.value = 0.05;
    this.down.uniforms.uFadeIn.value = 0.08;
    this.down.uniforms.uFadeOut.value = 0.4;

    this.sparks = particles.get('seraph.spark', { capacity: 1200, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.15 });
    this.sparks.uniforms.uDrag.value = 2.8;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.01;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    this.moteEmitter = new RateEmitter();
    this.downEmitter = new RateEmitter();
    this.heraldEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* The clock — every mark, live                                        */
  /* ------------------------------------------------------------------ */

  _lt(x) {
    return Math.max(0.01, x * settings.global.lifetime);
  }

  /** Clock time the wind-up starts. */
  _beatStart(c) {
    return this._lt(c.unfoldDelay) + this._lt(c.unfoldTime) + Math.max(0, c.hoverTime * settings.global.lifetime);
  }

  /** Clock time the stroke bottoms out and the volley is loosed. */
  _beatAt(c) {
    return this._beatStart(c) + this._lt(c.beatWindup) + Math.max(0.02, c.beatStroke);
  }

  /** Clock time the light lets go of the struck. */
  _dropAt(c) {
    return this._beatAt(c) + Math.max(0.02, c.volleyTime) + Math.max(0.05, c.dartFlight) * 1.15 + Math.max(0.05, c.lifetime * settings.global.lifetime);
  }

  get impactDuration() {
    return this._dropAt(settings.seraph) + 0.35;
  }

  get fadeDuration() {
    return this._lt(settings.seraph.foldTime);
  }

  /** Holy light breathes; it does not gutter. */
  lightShimmer() {
    return 0.93 + 0.07 * Math.sin(this.age * 3.3) * Math.sin(this.age * 1.3);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._clock = -1;
    this._prevRot = 0;
    this._flapVel = 0;
    this._beaten = false;
    this._loosed = false;
    this._dropped = false;
    this._pulse = 0;
    this._haloSpin = Math.random() * TAU;
    this._sigilSpin = Math.random();
    this._seed = Math.random() * 100;
    this._dartCount = 0;
    this._releaseHeld();
    this.moteEmitter.reset();
    this.downEmitter.reset();
    this.heraldEmitter.reset();

    for (let i = 0; i < MAX_DARTS; i++) {
      const d = this.darts[i];
      d.launched = false;
      d.landed = false;
      d.level = 0;
      d.dummy = null;
    }
    for (let j = 0; j < MAX_SHAFTS; j++) {
      this._rayAngle[j] = (j / MAX_SHAFTS) * TAU + (Math.random() - 0.5) * 0.8;
      this._rayDist[j] = 0.45 + Math.random() * 0.55;
      this._rayTop[j] = Math.random();
      this._raySeed[j] = Math.random();
    }

    this.dartGeometry.attributes.aHead.array.fill(0);
    this.dartGeometry.attributes.aHead.needsUpdate = true;
    this.glintGeometry.attributes.aGlow.array.fill(0);
    this.glintGeometry.attributes.aGlow.needsUpdate = true;
    this.rayGeometry.attributes.aRay.array.fill(0);
    this.rayGeometry.attributes.aRay.needsUpdate = true;
    this.wingGeometry.instanceCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Placing things                                                      */
  /* ------------------------------------------------------------------ */

  /** The circle's centre, on the floor. */
  _circle(out) {
    return this.pointAt(1, out);
  }

  /** Where the halo hangs (before its exit rise). */
  _haloCentre(c, out) {
    this._circle(out);
    out.addScaledVector(this.direction, c.haloOffset);
    out.y = c.haloHeight;
    return out;
  }

  /**
   * A point on a feather — the CPU mirror of `WING_GLSL#featherPoint`.
   *
   * @param {number} side ±1, which wing
   * @param {number} s 0..1 along the arm
   * @param {number} jitter radians off the fan
   * @param {number} len feather length, metres
   * @param {number} y 0..1 along the feather
   * @param {number} layer covert row
   */
  wingPoint(side, s, jitter, len, y, layer, out) {
    const c = settings.seraph;
    const p = this._pose;
    const l = c.wingLift;
    const P1x = 0.45;
    const P1y = 0.7 * l;
    const P2y = 0.25 * l;
    let px = (2 * (1 - s) * s * P1x + s * s) * p.span;
    let py = (2 * (1 - s) * s * P1y + s * s * P2y) * p.span;
    let tx = 2 * (1 - s) * P1x + 2 * s * (1 - P1x);
    let ty = 2 * (1 - s) * P1y + 2 * s * (P2y - P1y);
    const cr = Math.cos(p.rot);
    const sr = Math.sin(p.rot);
    const rx = cr * px - sr * py;
    py = sr * px + cr * py;
    px = rx;
    const rtx = cr * tx - sr * ty;
    ty = sr * tx + cr * ty;
    tx = rtx;
    const fan = lerp(c.fanInner, c.fanOuter, Math.pow(s, 0.8)) * p.open;
    const theta = Math.atan2(ty, tx) - fan + jitter;
    const chord = theta - p.bend * y * 0.5;
    const fx = px + Math.cos(chord) * len * y;
    const fy = py + Math.sin(chord) * len * y;
    const k = fx / Math.max(c.wingSpan, 0.1);
    const z = layer * c.layerDepth - c.wingSweep * k * k + p.sweepFwd * k - c.wingCurl * y * y;
    out.copy(p.centre).addScaledVector(p.side, side * (c.wingShoulder + fx));
    out.y += fy;
    out.addScaledVector(p.toward, z);
    return out;
  }

  /** Length of a flight feather at `s` — the same curve `_layoutFeathers` uses. */
  _flightLength(c, s) {
    return lerp(c.featherInnerLength, c.featherLength, smoothstep(0.35, 0.85, s)) * (1 - 0.22 * smoothstep(0.88, 1, s));
  }

  /**
   * Write every feather of both wings. Cheap enough to run every frame, which
   * is what lets the counts be dragged mid-cast. Dice come from a hash of the
   * feather's slot, so a feather keeps its jitter while its neighbours move.
   */
  _layoutFeathers(c, g) {
    const fa = this.wingGeometry.attributes.aFeather.array;
    const sa = this.wingGeometry.attributes.aShape.array;
    const rnd = g.randomness;
    let n = 0;
    for (let w = 0; w < 2; w++) {
      const side = w === 0 ? 1 : -1;
      const n0 = Math.min(MAX_ROW0, Math.max(2, Math.round(c.featherCount)));
      for (let i = 0; i < n0; i++) {
        const s = 0.03 + (0.97 * (i + 0.5)) / n0;
        const h = hash11(i * 13.7 + w * 101.3 + 0.5);
        const len = this._flightLength(c, s) * (1 + (h - 0.5) * 0.14 * rnd);
        const k4 = n * 4;
        fa[k4] = s;
        fa[k4 + 1] = 0;
        fa[k4 + 2] = side;
        fa[k4 + 3] = h;
        sa[k4] = len;
        sa[k4 + 1] = c.featherWidth * (0.8 + 0.35 * s);
        sa[k4 + 2] = (hash11(i * 7.1 + w * 31.7 + 2.0) - 0.5) * 2 * c.fanJitter * rnd;
        sa[k4 + 3] = 0;
        n++;
      }
      const rows = Math.min(MAX_ROWS, Math.max(0, Math.round(c.covertRows)));
      for (let r = 1; r <= rows; r++) {
        const count = Math.min(MAX_COVERT, Math.max(2, Math.round(c.covertCount * (1 - 0.2 * (r - 1)))));
        const reach = saturate(c.covertReach * (1 - 0.08 * (r - 1)));
        const shrink = Math.pow(Math.max(0.05, c.covertLength), r);
        for (let i = 0; i < count; i++) {
          const s = 0.02 + (reach * (i + 0.5)) / count;
          const h = hash11(i * 19.3 + r * 57.1 + w * 211.9 + 0.25);
          const k4 = n * 4;
          fa[k4] = s;
          fa[k4 + 1] = r;
          fa[k4 + 2] = side;
          fa[k4 + 3] = h;
          sa[k4] = this._flightLength(c, s) * shrink * (1 + (h - 0.5) * 0.18 * rnd);
          sa[k4 + 1] = c.featherWidth * c.covertWidth * Math.pow(shrink, 0.45) * (0.85 + 0.3 * s);
          sa[k4 + 2] = (hash11(i * 5.3 + r * 9.9 + w * 77.7) - 0.5) * 2 * c.fanJitter * rnd;
          sa[k4 + 3] = r;
          n++;
        }
      }
    }
    this.wingGeometry.instanceCount = n;
    this.wingGeometry.attributes.aFeather.needsUpdate = true;
    this.wingGeometry.attributes.aShape.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* The pose on the clock                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Resolve the wing pose for this frame from the clock. Fills `_pose`; the
   * feather shader and `wingPoint` both read it.
   */
  _resolvePose(c, g, dt) {
    const p = this._pose;
    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const fold = fading ? Easing.inOutCubic(saturate(this.fadeTime / this.fadeDuration)) : 0;

    this._haloCentre(c, _centre);
    p.centre.copy(_centre);
    p.centre.y -= c.wingDrop;
    p.centre.y += fading ? c.haloRise * Easing.inQuad(fold) * 0.5 : 0;
    p.side.copy(this.side);
    p.toward.copy(this.direction).negate();

    const unfold = clock < 0 ? 0 : saturate((clock - this._lt(c.unfoldDelay)) / this._lt(c.unfoldTime));
    p.open = Easing.outCubic(unfold) * (1 - fold);
    p.reveal = clock < 0 ? 0 : Easing.outQuad(unfold) * 1.05;
    p.span = c.wingSpan * lerp(c.wingFoldSpan, 1, Easing.outBack(unfold) * (1 - fold));
    p.dissolve = smoothstep(0.3, 1, fold) * 1.02;
    p.level = clock < 0 ? 0 : 1;

    // The flap: breathing, then the wind-up, the stroke and the recovery.
    const age = this.age * g.animationSpeed;
    let rot = c.flapAmp * Math.sin(age * c.flapSpeed);
    let sweep = 0;
    const beatStart = this._beatStart(c);
    const windup = this._lt(c.beatWindup);
    const stroke = Math.max(0.02, c.beatStroke);
    const beatAt = beatStart + windup + stroke;
    if (clock >= beatStart && clock < beatStart + windup) {
      const k = Easing.inOutQuad((clock - beatStart) / windup);
      rot = lerp(rot, c.beatRaise, k);
      sweep = -0.25 * c.beatSweep * k; // drawn back as they rise
    } else if (clock >= beatStart + windup && clock < beatAt) {
      const k = Easing.inQuad((clock - beatStart - windup) / stroke);
      rot = lerp(c.beatRaise, -c.beatDown, k);
      sweep = lerp(-0.25, 1, k) * c.beatSweep;
    } else if (clock >= beatAt) {
      const k = Easing.outCubic(saturate((clock - beatAt) / 0.9));
      rot = lerp(-c.beatDown, rot, k);
      sweep = c.beatSweep * (1 - k);
    }
    rot -= c.wingFoldAngle * (1 - p.open);
    p.rot = rot;
    p.sweepFwd = sweep;

    // Feathers trail the flap: bend against its angular velocity.
    if (dt > 0) {
      const vel = (rot - this._prevRot) / dt;
      this._flapVel += (vel - this._flapVel) * (1 - Math.exp(-14 * dt));
      this._prevRot = rot;
    }
    p.bend = Math.max(-0.9, Math.min(0.9, this._flapVel * c.featherLag));
    return beatAt;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _syncParticles(c, g) {
    const m = this.motes;
    m.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    m.uniforms.uGravity.value.set(0, -0.15, 0);
    m.uniforms.uSizeScale.value = c.moteSize * g.particleSize * 7;
    m.uniforms.uLifeScale.value = g.particleLifetime;
    m.uniforms.uSpeedScale.value = g.particleSpeed;
    m.uniforms.uOpacity.value = g.opacity;
    m.uniforms.uGlow.value = c.moteGlow * g.glow;
    m.uniforms.uTurbulence.value = 0.35 * g.turbulence;

    const d = this.down;
    d.setGradient(getColor(c.colorDownA), getColor(c.colorDownB), getColor(c.colorDownC), getColor(c.colorDownD));
    d.uniforms.uGravity.value.set(0, c.downGravity, 0);
    d.uniforms.uSizeScale.value = c.downSize * g.particleSize * 7;
    d.uniforms.uLifeScale.value = g.particleLifetime;
    d.uniforms.uSpeedScale.value = g.particleSpeed;
    d.uniforms.uOpacity.value = g.opacity;
    d.uniforms.uGlow.value = c.downGlow * g.glow;
    d.uniforms.uTurbulence.value = 0.5 * g.turbulence;

    const s = this.sparks;
    s.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    s.uniforms.uGravity.value.set(0, -7, 0);
    s.uniforms.uSizeScale.value = c.sparkSize * g.particleSize * 7;
    s.uniforms.uLifeScale.value = g.particleLifetime;
    s.uniforms.uSpeedScale.value = g.particleSpeed;
    s.uniforms.uOpacity.value = g.opacity;
    s.uniforms.uGlow.value = 2.5 * g.glow;
    s.uniforms.uStretch.value = c.sparkStretch;
    s.uniforms.uTurbulence.value = 0.1 * g.turbulence;
  }

  /** The whole descent for this frame. Runs on a zero-length frame too. */
  _updateDescent(dt) {
    const c = settings.seraph;
    const g = settings.global;
    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const fadeT = fading ? saturate(this.fadeTime / this.fadeDuration) : 0;

    this._syncParticles(c, g);
    const beatAt = this._resolvePose(c, g, dt);
    this._layoutFeathers(c, g);
    this.wingMaterial.userData.sync(this._pose);
    this.wings.visible = clock >= 0;

    /* ---- the halo ---- */
    const h = this._haloState;
    this._haloCentre(c, h.centre);
    h.centre.y += c.haloRise * Easing.inQuad(fadeT);
    h.side.copy(this.side);
    h.forward.copy(this.direction).multiplyScalar(Math.cos(c.haloTilt)).addScaledVector(_up, Math.sin(c.haloTilt));
    const form = clock < 0 ? 0 : saturate(clock / this._lt(c.haloTime));
    h.draw = Easing.outCubic(form);
    h.radius = c.haloRadius * (0.55 + 0.45 * Easing.outBack(form));
    h.level = (1 - Easing.inQuad(fadeT)) * (1 + this._pulse * 0.6);
    this._haloSpin += c.haloSpin * dt * g.animationSpeed;
    h.spinPhase = this._haloSpin / TAU;
    this.haloMaterial.userData.sync(h);
    this.halo.visible = clock >= 0 && h.level > 0.001;

    /* ---- the sigil ---- */
    const sg = this._sigilState;
    this._circle(_centre);
    sg.radius = Math.max(0.2, c.zoneRadius * c.sigilRadius);
    sg.draw = clock < 0 ? 0 : Easing.inOutQuad(saturate(clock / this._lt(c.sigilDraw)));
    this._pulse *= Math.exp(-5 * dt);
    sg.pulse = this._pulse * c.sigilPulse;
    sg.fade = 1 - Easing.inQuad(fadeT);
    this._sigilSpin += c.sigilSpin * dt * g.animationSpeed;
    sg.spinPhase = this._sigilSpin / TAU;
    // The front is the bearing toward the caster, in the quad's own frame.
    sg.front = Math.atan2(this.direction.z, -this.direction.x);
    sg.seed = this._seed;
    this.sigilMaterial.userData.sync(sg);
    this.sigil.position.set(_centre.x, 0.035, _centre.z);
    this.sigil.scale.set(sg.radius * 2.25, 1, sg.radius * 2.25);
    this.sigil.visible = clock >= 0;

    /* ---- the beat and the volley ---- */
    if (clock >= 0 && !this._beaten && clock >= beatAt) this._beat(c, g);
    this._updateDarts(c, g, dt, beatAt);
    this._updateHeld(c, g, dt);
    if (clock >= 0 && !this._dropped && clock >= this._dropAt(c)) this._drop(c, g);

    /* ---- rays, glints, warp ---- */
    this._updateRays(c, g, fadeT);
    this._updateGlints(c, g, fadeT);
    this._updateWarp(c, g, beatAt);

    /* ---- motes and loose feathers off the open wings ---- */
    if (clock >= 0 && dt > 0) this._shedFx(c, g, dt, this._pose.open * (1 - fadeT));
  }

  _updateRays(c, g, fadeT) {
    const clock = this._clock;
    const top = this.rayGeometry.attributes.aTop.array;
    const bot = this.rayGeometry.attributes.aBottom.array;
    const ray = this.rayGeometry.attributes.aRay.array;
    this.rayMaterial.userData.sync();

    const unfold = clock < 0 ? 0 : saturate((clock - this._lt(c.unfoldDelay)) / this._lt(c.unfoldTime));
    const dropT = this._dropped ? saturate((clock - this._dropAt(c)) / 0.3) : 0;
    const base = Easing.inOutQuad(unfold) * (1 - fadeT) * (1 - dropT * 0.5) * (1 + this._pulse * 0.8);
    const count = Math.min(MAX_SHAFTS, Math.max(0, Math.round(c.rayCount)));

    this._haloCentre(c, _a);
    this._circle(_centre);
    for (let j = 0; j < MAX_SHAFTS; j++) {
      const k4 = j * 4;
      if (j >= count) {
        ray[k4] = 0;
        continue;
      }
      const angle = this._rayAngle[j];
      // Tops round the halo, feet scattered in the circle, all leaning away.
      top[k4] = _a.x + Math.cos(angle) * c.haloRadius * (0.5 + 0.5 * this._rayTop[j]);
      top[k4 + 1] = _a.y + c.haloRise * Easing.inQuad(fadeT);
      top[k4 + 2] = _a.z + Math.sin(angle) * c.haloRadius * (0.5 + 0.5 * this._rayTop[j]);
      top[k4 + 3] = c.rayTopRadius;
      const reach = c.zoneRadius * c.rayScatter * this._rayDist[j];
      bot[k4] = _centre.x + Math.cos(angle) * reach + this.direction.x * c.raySlant;
      bot[k4 + 1] = 0;
      bot[k4 + 2] = _centre.z + Math.sin(angle) * reach + this.direction.z * c.raySlant;
      bot[k4 + 3] = c.rayBottomRadius;
      const breathe = 0.75 + 0.25 * Math.sin(this.age * (1.3 + this._raySeed[j]) + this._raySeed[j] * 9);
      ray[k4] = base * breathe;
      ray[k4 + 1] = this._raySeed[j];
    }

    // A narrow shaft over every body held in the light.
    for (let i = 0; i < MAX_HELD; i++) {
      const k4 = (MAX_SHAFTS + i) * 4;
      const slot = this.held[i];
      if (i >= this._heldCount || !slot.dummy || !slot.dummy.bodyPoint(_body)) {
        ray[k4] = 0;
        continue;
      }
      top[k4] = _body.x;
      top[k4 + 1] = _body.y + 5;
      top[k4 + 2] = _body.z;
      top[k4 + 3] = c.bodyRayRadius * 0.6;
      bot[k4] = _body.x;
      bot[k4 + 1] = 0;
      bot[k4 + 2] = _body.z;
      bot[k4 + 3] = c.bodyRayRadius;
      ray[k4] = c.bodyRayGlow * Easing.outCubic(saturate(slot.time / 0.35)) * (1 - fadeT);
      ray[k4 + 1] = slot.seed;
    }

    this.rayGeometry.instanceCount = MAX_RAYS;
    this.rayGeometry.attributes.aTop.needsUpdate = true;
    this.rayGeometry.attributes.aBottom.needsUpdate = true;
    this.rayGeometry.attributes.aRay.needsUpdate = true;
    this.rays.visible = clock >= 0;
  }

  _updateGlints(c, g, fadeT) {
    const ga = this.glintGeometry.attributes.aGlint.array;
    const gg = this.glintGeometry.attributes.aGlow.array;
    this.glintMaterial.userData.sync();

    // The halo's bloom disc.
    const h = this._haloState;
    let k4 = GLINT_BLOOM * 4;
    ga[k4] = h.centre.x;
    ga[k4 + 1] = h.centre.y;
    ga[k4 + 2] = h.centre.z;
    ga[k4 + 3] = c.haloBloomSize * (0.6 + 0.4 * h.draw);
    gg[k4] = this._clock < 0 ? 0 : c.haloBloom * h.draw * h.level;
    gg[k4 + 1] = 0.13;
    gg[k4 + 2] = 0.35;

    // A star of light where each dart landed, cooling out.
    const life = Math.max(0.02, c.landFlareLife);
    for (let i = 0; i < MAX_DARTS; i++) {
      k4 = (GLINT_DARTS + i) * 4;
      const d = this.darts[i];
      if (i >= this._dartCount || !d.landed) {
        gg[k4] = 0;
        continue;
      }
      const age = (this._clock - d.landAt) / life;
      if (age >= 1 || age < 0) {
        gg[k4] = 0;
        continue;
      }
      ga[k4] = d.land.x;
      ga[k4 + 1] = Math.max(0.12, d.land.y + 0.1);
      ga[k4 + 2] = d.land.z;
      ga[k4 + 3] = c.landFlareSize * (0.5 + 0.5 * Easing.outCubic(age)) * g.explosionIntensity;
      gg[k4] = (1 - age) * (1 - age);
      gg[k4 + 1] = d.seed;
      gg[k4 + 2] = 1;
    }
    this.glintGeometry.attributes.aGlint.needsUpdate = true;
    this.glintGeometry.attributes.aGlow.needsUpdate = true;
    this.glints.visible = true;
  }

  _updateWarp(c, g, beatAt) {
    const clock = this._clock;
    const ws = this._warpState;
    const since = clock - beatAt;
    const ringTime = Math.max(0.05, c.warpRingTime);
    ws.ring = this._beaten && since >= 0 && since < ringTime ? Easing.outQuad(since / ringTime) : -1;
    ws.strength = Math.max(this._pose.open * (1 - this._pose.dissolve), ws.ring >= 0 ? 1 : 0);
    this.warpMaterial.userData.sync(ws);
    this.warp.position.copy(this._pose.centre);
    this.warp.position.y = Math.max(1.5, this._pose.centre.y - 1);
    this.warp.visible = clock >= 0 && ws.strength > 0.001 && c.warpStrength > 0;
  }

  /* ------------------------------------------------------------------ */
  /* The beat                                                            */
  /* ------------------------------------------------------------------ */

  _beat(c, g) {
    this._beaten = true;
    this._pulse = 1;
    const time = frame.uTime.value;
    const centre = this._pose.centre;

    this.ctx.bursts.spawn(BurstMode.AIR, centre, {
      radius: 0.3,
      endRadius: c.beatBurst * g.explosionIntensity,
      life: 0.55,
      intensity: 2,
      opacity: 0.55 * g.opacity,
      squash: 0.45,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this._circle(_pos);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.beatRing * g.explosionIntensity,
      life: c.beatRingLife,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorRingB),
      height: 0.03
    });
    this.ctx.shake.add(c.beatShake * g.cameraShake, 5, 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.beatFlash * g.explosionIntensity);
    this.lightBoost = c.beatLight * g.explosionIntensity;

    // The stroke shakes loose feathers off both wings.
    const count = Math.round(c.downBeat * g.particleCount);
    for (let k = 0; k < count; k++) {
      const side = k % 2 === 0 ? 1 : -1;
      const s = 0.2 + Math.random() * 0.8;
      this.wingPoint(side, s, 0, this._flightLength(c, s), 0.4 + Math.random() * 0.6, 0, _pos);
      _emit.position = _pos;
      _emit.radius = 0.15;
      _emit.direction = _dir.set(this.side.x * side * 0.5, -0.6, this.side.z * side * 0.5).addScaledVector(this.direction, -0.4);
      _emit.speed = 2.6;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.6;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.18;
      _emit.sizeVariance = 0.5;
      _emit.life = c.downLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = c.downSpin;
      _emit.tint = null;
      _emit.time = time;
      this.down.emit(1, _emit);
    }

    this._loose(c);
  }

  /**
   * Deal out the volley: `dartsPerBody` for every body in the circle (the first
   * of each early in the volley, so every body is taken promptly), then the
   * floor's share. Dice only; launch points and landings are latched later.
   */
  _loose(c) {
    this._loosed = true;
    const g = settings.global;
    this._circle(_centre);
    const found = this.ctx.dummies?.findTargets ? this.ctx.dummies.findTargets(_centre.x, _centre.z, c.zoneRadius, this._targets) : this._targets;
    let n = 0;
    const per = Math.max(0, Math.round(c.dartsPerBody));
    const bodies = Math.min(found.length, MAX_HELD);
    for (let b = 0; b < bodies && n < MAX_DARTS; b++) {
      for (let k = 0; k < per && n < MAX_DARTS; k++) {
        const d = this.darts[n++];
        this._dice(d);
        d.dummy = found[b];
        d.order = k === 0 ? Math.random() * 0.25 : Math.random();
        d.bodyY = c.pinHeight + (Math.random() - 0.3) * 0.5;
      }
    }
    const ground = Math.max(0, Math.round(c.dartsGround * g.particleCount));
    for (let k = 0; k < ground && n < MAX_DARTS; k++) {
      const d = this.darts[n++];
      this._dice(d);
      d.dummy = null;
      d.order = Math.random();
    }
    this._dartCount = n;
    this._targets.length = 0;
  }

  _dice(d) {
    d.flight = 0.85 + Math.random() * 0.3;
    d.side = Math.random() < 0.5 ? 1 : -1;
    d.s = 0.35 + Math.random() * 0.65;
    // Area-uniform in the circle, with the bearing rolled.
    d.angle = Math.random() * TAU;
    d.area = Math.random();
    d.arc = Math.random() * 2 - 1;
    d.seed = Math.random();
    d.launched = false;
    d.landed = false;
    d.level = 0;
  }

  /** Where dart `d` is headed, live. */
  _dartTarget(d, c, out) {
    if (d.dummy) {
      if (d.dummy.alive) return out.set(d.dummy.position.x, d.bodyY, d.dummy.position.z);
      if (d.dummy.bodyPoint(out)) return out.setY(out.y + 0.25);
      return out.set(d.dummy.position.x, d.bodyY, d.dummy.position.z);
    }
    this._circle(out);
    const reach = c.zoneRadius * c.dartScatter * Math.sqrt(d.area);
    out.x += Math.cos(d.angle) * reach;
    out.z += Math.sin(d.angle) * reach;
    out.y = 0;
    return out;
  }

  /** A point on dart `d`'s flight at t, bowed sideways. */
  _dartAt(d, c, t, target, out) {
    const e = Math.pow(saturate(t), 1.35);
    out.lerpVectors(d.start, target, e);
    const bow = Math.sin(Math.PI * saturate(t)) * c.dartArc * d.arc * settings.global.randomness;
    out.addScaledVector(this.side, bow);
    return out;
  }

  _updateDarts(c, g, dt, beatAt) {
    const head = this.dartGeometry.attributes.aHead.array;
    const dir = this.dartGeometry.attributes.aDir.array;
    const dart = this.dartGeometry.attributes.aDart.array;
    this.dartMaterial.userData.sync();
    const volley = Math.max(0.02, c.volleyTime);
    const flight = Math.max(0.05, c.dartFlight);
    const stick = Math.max(0.05, c.dartStickTime * g.lifetime);
    const clock = this._clock;
    const fadeT = this.phase === AbilityPhase.FADE ? saturate(this.fadeTime / this.fadeDuration) : 0;

    for (let i = 0; i < MAX_DARTS; i++) {
      const k4 = i * 4;
      const d = this.darts[i];
      if (i >= this._dartCount || !this._loosed) {
        head[k4 + 3] = 0;
        continue;
      }
      const launchAt = beatAt + d.order * volley;
      const tFlight = flight * d.flight;
      if (!d.launched) {
        if (clock < launchAt) {
          head[k4 + 3] = 0;
          continue;
        }
        d.launched = true;
        // Leaves from a feather tip of the wing as it is *now*.
        this.wingPoint(d.side, d.s, 0, this._flightLength(c, d.s), 1, 0, d.start);
      }

      let trail = c.dartTrail;
      if (!d.landed) {
        const t = (clock - launchAt) / tFlight;
        this._dartTarget(d, c, _b);
        this._dartAt(d, c, t, _b, _pos);
        this._dartAt(d, c, t + 0.02, _b, _a);
        _dir.subVectors(_a, _pos);
        if (_dir.lengthSq() > 1e-8) d.fly.copy(_dir).normalize();
        trail = Math.min(c.dartTrail, d.start.distanceTo(_pos));
        d.level = smoothstep(0, 0.12, t);
        if (t >= 1) this._land(d, c, g, _b);
        else d.land.copy(_pos);
      }
      if (d.landed) {
        // Stuck: in a body it rides the body; in the floor it stays.
        if (d.dummy && d.dummy.bodyPoint(_body)) d.land.copy(_body).add(d.offset);
        const since = clock - d.landAt;
        trail *= 1 - saturate(since / 0.12);
        const life = d.dummy ? 0.45 : stick;
        d.level = (1 - smoothstep(life * 0.5, life, since)) * (1 - fadeT);
      }

      // The head is the blade's tip, pushed into whatever it hit.
      const bury = d.landed ? c.dartLength * c.dartBury : 0;
      head[k4] = d.land.x + d.fly.x * bury;
      head[k4 + 1] = d.land.y + d.fly.y * bury;
      head[k4 + 2] = d.land.z + d.fly.z * bury;
      head[k4 + 3] = d.level;
      dir[k4] = d.fly.x;
      dir[k4 + 1] = d.fly.y;
      dir[k4 + 2] = d.fly.z;
      dir[k4 + 3] = Math.max(0.01, trail);
      dart[k4] = d.seed;
    }
    this.dartGeometry.instanceCount = this._dartCount;
    this.dartGeometry.attributes.aHead.needsUpdate = true;
    this.dartGeometry.attributes.aDir.needsUpdate = true;
    this.dartGeometry.attributes.aDart.needsUpdate = true;
    this.dartMesh.visible = this._dartCount > 0;
  }

  /** One dart arriving: the star, the sparks, the ring — and the catch. */
  _land(d, c, g, at) {
    d.landed = true;
    d.landAt = this._clock;
    d.land.copy(at);
    const time = frame.uTime.value;

    _emit.position = _pos.copy(at).setY(Math.max(0.08, at.y));
    _emit.radius = 0.08;
    _emit.direction = _dir.copy(d.fly).negate().add(_up).normalize();
    _emit.speed = c.landSparkSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.85;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.07;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sparkLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
    this.sparks.emit(Math.round(c.landSparks * g.particleCount), _emit);

    if (!d.dummy) {
      this.ctx.decals.spawn(DecalType.SHOCKWAVE, at, {
        radius: c.landDecalRadius * g.explosionIntensity,
        life: c.landDecalLife,
        width: 0.08,
        intensity: 0.8,
        colorA: getColor(c.colorRingA),
        colorB: getColor(c.colorRingB),
        height: 0.025
      });
      this.ctx.shake.add(c.landShake * g.cameraShake, 9, 26);
      return;
    }

    // Into a body. The first dart that reaches it takes it.
    const dummy = d.dummy;
    _dir.set(d.fly.x, 0, d.fly.z);
    if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
    _dir.normalize();
    if (dummy.alive) {
      this._force.impulse = c.hitImpulse;
      this._force.lift = c.hitLift;
      this._force.spin = c.hitSpin;
      if (dummy.kill(_dir.x, _dir.z, this._force)) this._hold(dummy);
    } else if (!this._dropped) {
      dummy.shove(_dir.x * 0.6, 0.4, _dir.z * 0.6);
    }
    if (dummy.bodyPoint(_body)) d.offset.subVectors(at, _body);
    else d.offset.set(0, 0, 0);
    this.ctx.shake.add(c.landShake * 2 * g.cameraShake, 8, 24);
    this.lightBoost = Math.min(this.lightBoost + c.beatLight * 0.15, c.beatLight * 2);
  }

  /* ------------------------------------------------------------------ */
  /* The struck                                                          */
  /* ------------------------------------------------------------------ */

  _hold(dummy) {
    if (this._dropped || this._heldCount >= MAX_HELD) return;
    for (let i = 0; i < this._heldCount; i++) if (this.held[i].dummy === dummy) return;
    const slot = this.held[this._heldCount++];
    slot.dummy = dummy;
    slot.time = 0;
    slot.x = dummy.position.x;
    slot.z = dummy.position.z;
    slot.seed = Math.random();
    slot.joint = PIN_JOINTS[0];
  }

  /**
   * Pin each held body's chest to a point rising in the light. Soft, so the
   * body swings on it; swaying, so it is never perfectly still.
   */
  _updateHeld(c, g, dt) {
    if (this._dropped) return;
    const liftTime = this._lt(c.liftTime);
    for (let i = 0; i < this._heldCount; i++) {
      const slot = this.held[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt;
      const k = Easing.inOutCubic(saturate(slot.time / liftTime));
      const sway = c.liftSway * g.randomness;
      const ph = this.age * 1.3 + slot.seed * TAU;
      _pos.set(slot.x + Math.sin(ph) * sway, c.pinHeight + c.liftHeight * k, slot.z + Math.cos(ph * 0.8) * sway);
      // Eased in: the light closes its grip over the first moments.
      const grip = c.pinStiffness * Easing.outCubic(saturate(slot.time / 0.25));
      let held = dummy.pin(slot.joint, _pos, grip);
      for (let j = 1; !held && j < PIN_JOINTS.length; j++) {
        slot.joint = PIN_JOINTS[j];
        held = dummy.pin(slot.joint, _pos, grip);
      }
      dummy.hold();
    }
  }

  /** The light lets go: every held body is dropped. */
  _drop(c, g) {
    this._dropped = true;
    for (let i = 0; i < this._heldCount; i++) {
      const dummy = this.held[i].dummy;
      if (!dummy || dummy.finished) continue;
      dummy.unpin();
      dummy.release();
      dummy.shove(0, -c.dropShove, 0);
      if (dummy.bodyPoint(_body)) {
        _emit.position = _body;
        _emit.radius = 0.3;
        _emit.direction = _up;
        _emit.speed = 1.5;
        _emit.speedVariance = 0.6;
        _emit.spread = 1;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = 0.09;
        _emit.sizeVariance = 0.5;
        _emit.life = c.moteLifetime * 0.6;
        _emit.lifeVariance = 0.4;
        _emit.spin = 0;
        _emit.tint = null;
        _emit.time = frame.uTime.value;
        this.motes.emit(Math.round(30 * g.particleCount), _emit);
      }
    }
    if (this._heldCount > 0) this.ctx.flash.trigger(getColor(c.colorFlash), c.dropFlash * g.explosionIntensity);
  }

  _releaseHeld() {
    for (let i = 0; i < this._heldCount; i++) {
      const dummy = this.held[i].dummy;
      if (dummy && !dummy.finished) {
        dummy.unpin();
        dummy.release();
      }
      this.held[i].dummy = null;
    }
    this._heldCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Particles off the wings                                             */
  /* ------------------------------------------------------------------ */

  _shedFx(c, g, dt, strength) {
    if (strength <= 0.01) return;
    const time = frame.uTime.value;
    const motes = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength * g.emissionRate) * g.particleCount);
    for (let k = 0; k < motes; k++) {
      const side = Math.random() < 0.5 ? 1 : -1;
      const s = Math.random();
      this.wingPoint(side, s, 0, this._flightLength(c, s), Math.random(), 0, _pos);
      _emit.position = _pos;
      _emit.radius = 0.2;
      _emit.direction = _down;
      _emit.speed = c.moteFall;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.5;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.08;
      _emit.sizeVariance = 0.6;
      _emit.life = c.moteLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = time;
      this.motes.emit(1, _emit);
    }
    const down = Math.round(this.downEmitter.tick(dt, c.downRate * strength * g.emissionRate) * g.particleCount);
    for (let k = 0; k < down; k++) {
      const side = Math.random() < 0.5 ? 1 : -1;
      const s = 0.15 + Math.random() * 0.85;
      this.wingPoint(side, s, 0, this._flightLength(c, s), 0.6 + Math.random() * 0.4, 0, _pos);
      _emit.position = _pos;
      _emit.radius = 0.1;
      _emit.direction = _down;
      _emit.speed = 0.4;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.6;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.18;
      _emit.sizeVariance = 0.5;
      _emit.life = c.downLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = c.downSpin;
      _emit.tint = null;
      _emit.time = time;
      this.down.emit(1, _emit);
    }
  }

  /** The herald: a mote of light climbing from the hand to the halo. */
  _updateHerald(dt, level) {
    const c = settings.seraph;
    const g = settings.global;
    const ga = this.glintGeometry.attributes.aGlint.array;
    const gg = this.glintGeometry.attributes.aGlow.array;
    const k4 = GLINT_HERALD * 4;
    ga[k4] = this.position.x;
    ga[k4 + 1] = this.position.y;
    ga[k4 + 2] = this.position.z;
    ga[k4 + 3] = c.heraldSize * 3;
    gg[k4] = level;
    gg[k4 + 1] = 0.61;
    gg[k4 + 2] = 1;
    if (level <= 0 || dt <= 0) return;
    const count = Math.round(this.heraldEmitter.tick(dt, c.heraldGlitter * g.emissionRate) * g.particleCount);
    if (count <= 0) return;
    _emit.position = this.position;
    _emit.radius = 0.06;
    _emit.direction = _down;
    _emit.speed = 0.5;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.8;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.08;
    _emit.sizeVariance = 0.5;
    _emit.life = c.moteLifetime * 0.5;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = getColor(Math.random() < 0.5 ? c.colorA : c.colorB);
    _emit.time = frame.uTime.value;
    this.motes.emit(count, _emit);
    _emit.tint = null;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.seraph;
    this._clock = -1;
    // The herald climbs from the hand to where the halo will open.
    const k = Easing.inOutQuad(this.u);
    this.position.y = lerp(1.4, c.haloHeight, k);
    this.position.addScaledVector(this.direction, c.haloOffset * k);
    this._updateDescent(dt);
    this._updateHerald(dt, 1);
    this.glintGeometry.attributes.aGlint.needsUpdate = true;
    this.glintGeometry.attributes.aGlow.needsUpdate = true;
  }

  onImpact() {
    const c = settings.seraph;
    const g = settings.global;
    this._clock = 0;
    this._haloCentre(c, _pos);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = 2.5;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.08;
    _emit.sizeVariance = 0.5;
    _emit.life = c.moteLifetime * 0.6;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.motes.emit(Math.round(60 * g.particleCount), _emit);
    this.lightBoost = c.lightIntensity * 0.6;
  }

  onFade(dt) {
    const c = settings.seraph;
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this._updateDescent(dt);
    // The herald folds into the halo's first light.
    this._updateHerald(dt, 1 - saturate(this._clock / 0.3));
    this.glintGeometry.attributes.aGlint.needsUpdate = true;
    this.glintGeometry.attributes.aGlow.needsUpdate = true;
    this._circle(_centre);
    this.position.set(_centre.x, c.lightHeight, _centre.z);
  }

  onDestroy() {
    this._releaseHeld();
    for (let i = 0; i < MAX_DARTS; i++) this.darts[i].dummy = null;
    this._dartCount = 0;
    this._clock = -1;
    this.wings.visible = false;
    this.halo.visible = false;
    this.rays.visible = false;
    this.sigil.visible = false;
    this.dartMesh.visible = false;
    this.glints.visible = false;
    this.warp.visible = false;
  }

  dispose() {
    for (const geometry of [this.wingGeometry, this.haloGeometry, this.rayGeometry, this.dartGeometry, this.glintGeometry, this.sigilGeometry, this.warpGeometry]) {
      geometry.dispose();
    }
    for (const material of [this.wingMaterial, this.haloMaterial, this.rayMaterial, this.dartMaterial, this.glintMaterial, this.sigilMaterial, this.warpMaterial]) {
      material.dispose();
    }
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('☩  Seraphic Descent');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'herald speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'heraldSize', 0.02, 1, 0.01, 'herald size (m)');
  R(cast, c, 'heraldGlitter', 0, 400, 1, 'herald motes / s');
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('accent, white');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'haloTime', 0.05, 3, 0.01, 'halo draws over');
  R(time, c, 'unfoldDelay', 0, 2, 0.01, 'wings wait');
  R(time, c, 'unfoldTime', 0.1, 4, 0.01, 'wings open over');
  R(time, c, 'hoverTime', 0, 4, 0.01, 'hang open for');
  R(time, c, 'beatWindup', 0.05, 2, 0.01, 'wind-up');
  R(time, c, 'beatStroke', 0.02, 1, 0.01, 'down-stroke');
  R(time, c, 'volleyTime', 0.02, 2, 0.01, 'volley loosed over');
  R(time, c, 'dartFlight', 0.05, 2, 0.01, 'dart flight');
  R(time, c, 'lifetime', 0.05, 8, 0.05, 'struck held for');
  R(time, c, 'foldTime', 0.1, 4, 0.05, 'fold & leave over');

  const halo = folder.addFolder('1 · Halo');
  R(halo, c, 'haloHeight', 2, 16, 0.05, 'height (m)');
  R(halo, c, 'haloOffset', -4, 4, 0.05, 'set back (m)');
  R(halo, c, 'haloRadius', 0.2, 4, 0.01, 'radius (m)');
  R(halo, c, 'haloWidth', 0.01, 1, 0.005, 'glow width (m)');
  R(halo, c, 'haloCore', 0.002, 0.3, 0.001, 'core width (m)');
  R(halo, c, 'haloTilt', -1.5, 1.5, 0.01, 'tilt to caster (rad)');
  R(halo, c, 'haloGlow', 0, 15, 0.05, 'glow');
  R(halo, c, 'haloOpacity', 0, 1, 0.01, 'opacity');
  R(halo, c, 'haloFalloff', 0.3, 8, 0.05, 'falloff');
  R(halo, c, 'haloBeads', 0, 96, 1, 'beads');
  R(halo, c, 'haloBeadGlow', 0, 6, 0.05, 'bead glow');
  R(halo, c, 'haloBeadSharp', 0.5, 30, 0.1, 'bead sharpness');
  R(halo, c, 'haloSpin', -3, 3, 0.01, 'bead spin (rad/s)');
  R(halo, c, 'haloShimmer', 0, 1, 0.01, 'shimmer');
  R(halo, c, 'haloShimmerScale', 0.2, 20, 0.1, 'shimmer scale');
  R(halo, c, 'haloShimmerSpeed', 0, 10, 0.05, 'shimmer speed');
  R(halo, c, 'haloRise', 0, 10, 0.05, 'rises on exit (m)');
  R(halo, c, 'haloBloom', 0, 3, 0.01, 'bloom disc');
  R(halo, c, 'haloBloomSize', 0.2, 8, 0.05, 'bloom size (m)');
  halo.addColor(c, 'colorHaloCore').name('core');
  halo.addColor(c, 'colorHalo').name('glow');
  halo.addColor(c, 'colorHaloEdge').name('edge');

  const wing = folder.addFolder('2 · Wings — pose');
  R(wing, c, 'wingDrop', -3, 4, 0.01, 'shoulders below halo (m)');
  R(wing, c, 'wingShoulder', 0, 2, 0.01, 'shoulder gap (m)');
  R(wing, c, 'wingSpan', 0.5, 12, 0.05, 'span (m)');
  R(wing, c, 'wingLift', -0.5, 1.5, 0.01, 'arch');
  R(wing, c, 'wingSweep', -3, 3, 0.01, 'tips swept back (m)');
  R(wing, c, 'wingFoldSpan', 0.05, 1, 0.01, 'folded span');
  R(wing, c, 'wingFoldAngle', 0, 3, 0.01, 'folded turn (rad)');
  R(wing, c, 'wingCurl', -1, 1.5, 0.01, 'feather curl (m)');
  R(wing, c, 'flapAmp', 0, 0.6, 0.005, 'breathing flap (rad)');
  R(wing, c, 'flapSpeed', 0, 10, 0.05, 'breathing rate');
  R(wing, c, 'beatRaise', 0, 1.5, 0.01, 'wind-up raise (rad)');
  R(wing, c, 'beatDown', 0, 1.5, 0.01, 'stroke depth (rad)');
  R(wing, c, 'beatSweep', 0, 4, 0.05, 'stroke sweep (m)');
  R(wing, c, 'featherLag', 0, 0.6, 0.005, 'feather lag');

  const feather = folder.addFolder('3 · Wings — feathers');
  R(feather, c, 'featherCount', 2, MAX_ROW0, 1, 'flight feathers');
  R(feather, c, 'featherLength', 0.2, 6, 0.05, 'primary length (m)');
  R(feather, c, 'featherInnerLength', 0.2, 6, 0.05, 'secondary length (m)');
  R(feather, c, 'featherWidth', 0.02, 1, 0.005, 'vane half-width (m)');
  R(feather, c, 'covertRows', 0, MAX_ROWS, 1, 'covert rows');
  R(feather, c, 'covertCount', 2, MAX_COVERT, 1, 'coverts per row');
  R(feather, c, 'covertLength', 0.1, 1, 0.01, 'covert length');
  R(feather, c, 'covertWidth', 0.2, 2, 0.01, 'covert width');
  R(feather, c, 'covertReach', 0.1, 1, 0.01, 'covert reach');
  R(feather, c, 'fanInner', -0.5, 3, 0.01, 'fan at shoulder (rad)');
  R(feather, c, 'fanOuter', -1, 1.5, 0.01, 'fan at tip (rad)');
  R(feather, c, 'fanJitter', 0, 0.5, 0.005, 'fan jitter (rad)');
  R(feather, c, 'layerDepth', 0, 0.5, 0.005, 'row depth (m)');

  const shade = folder.addFolder('4 · Wings — shading');
  R(shade, c, 'featherGlow', 0, 6, 0.01, 'glow');
  R(shade, c, 'featherOpacity', 0, 1, 0.01, 'opacity');
  R(shade, c, 'rachisGlow', 0, 10, 0.05, 'shaft glow');
  R(shade, c, 'rachisWidth', 0.01, 0.4, 0.005, 'shaft width');
  R(shade, c, 'barbScale', 2, 120, 0.5, 'barbs');
  R(shade, c, 'barbSlant', -4, 4, 0.05, 'barb rake');
  R(shade, c, 'barbContrast', 0, 1, 0.01, 'barb contrast');
  R(shade, c, 'vaneTear', 0, 1, 0.01, 'vane splits');
  R(shade, c, 'vaneTearScale', 0.5, 30, 0.1, 'split scale');
  R(shade, c, 'tipGlow', 0, 6, 0.05, 'tip glow');
  R(shade, c, 'featherShimmer', 0, 1, 0.01, 'shimmer');
  R(shade, c, 'featherShimmerSpeed', 0, 6, 0.05, 'shimmer speed');
  R(shade, c, 'revealSoft', 0.02, 1, 0.01, 'reveal softness');
  R(shade, c, 'dissolveEdge', 0.005, 0.4, 0.005, 'dissolve edge');
  R(shade, c, 'dissolveGlow', 0, 10, 0.05, 'dissolve glow');
  shade.addColor(c, 'colorFeatherRoot').name('root');
  shade.addColor(c, 'colorFeather').name('vane');
  shade.addColor(c, 'colorFeatherTip').name('tip');
  shade.addColor(c, 'colorRachis').name('shaft');

  const rays = folder.addFolder('5 · God rays');
  R(rays, c, 'rayCount', 0, MAX_SHAFTS, 1, 'shafts');
  R(rays, c, 'rayTopRadius', 0.02, 3, 0.01, 'top radius (m)');
  R(rays, c, 'rayBottomRadius', 0.05, 5, 0.01, 'foot radius (m)');
  R(rays, c, 'raySlant', -6, 6, 0.05, 'slant (m)');
  R(rays, c, 'rayScatter', 0, 1.5, 0.01, 'feet spread');
  R(rays, c, 'rayGlow', 0, 6, 0.05, 'glow');
  R(rays, c, 'rayOpacity', 0, 1, 0.01, 'opacity');
  R(rays, c, 'rayEdge', 0.3, 10, 0.05, 'edge softness');
  R(rays, c, 'rayStreakScale', 0.2, 12, 0.05, 'streak scale');
  R(rays, c, 'rayStreakSpeed', 0, 6, 0.05, 'streak speed');
  R(rays, c, 'rayStreaks', 0, 1, 0.01, 'streaks');
  R(rays, c, 'rayTopFade', 0.01, 1, 0.01, 'top fade');
  R(rays, c, 'raySoftFade', 0.01, 3, 0.01, 'floor soft fade (m)');
  R(rays, c, 'bodyRayRadius', 0.05, 2, 0.01, 'body shaft radius (m)');
  R(rays, c, 'bodyRayGlow', 0, 4, 0.05, 'body shaft glow');
  rays.addColor(c, 'colorRay').name('shaft');
  rays.addColor(c, 'colorRayCore').name('core');

  const sigil = folder.addFolder('6 · Floor sigil');
  R(sigil, c, 'sigilRadius', 0.2, 1.5, 0.01, 'radius (× circle)');
  R(sigil, c, 'sigilGlow', 0, 8, 0.05, 'glow');
  R(sigil, c, 'sigilOpacity', 0, 1, 0.01, 'opacity');
  R(sigil, c, 'sigilRingWidth', 0.005, 0.3, 0.005, 'ring width (m)');
  R(sigil, c, 'sigilRays', 1, 48, 1, 'star rays');
  R(sigil, c, 'sigilRaySharp', 1, 120, 0.5, 'ray thinness');
  R(sigil, c, 'sigilRunes', 0, 96, 1, 'runes');
  R(sigil, c, 'sigilRuneGlow', 0, 4, 0.05, 'rune glow');
  R(sigil, c, 'sigilSpin', -1, 1, 0.005, 'rune spin (rad/s)');
  R(sigil, c, 'sigilDraw', 0.05, 4, 0.01, 'draws over');
  R(sigil, c, 'sigilPulse', 0, 6, 0.05, 'beat flare');
  R(sigil, c, 'sigilFlicker', 0, 1, 0.01, 'flicker');
  sigil.addColor(c, 'colorSigil').name('lines');
  sigil.addColor(c, 'colorSigilHot').name('hot');

  const darts = folder.addFolder('7 · Feather darts');
  R(darts, c, 'dartsPerBody', 0, 8, 1, 'per body');
  R(darts, c, 'dartsGround', 0, MAX_DARTS, 1, 'into the floor');
  R(darts, c, 'dartScatter', 0, 1.5, 0.01, 'scatter (× circle)');
  R(darts, c, 'dartArc', 0, 4, 0.05, 'bow (m)');
  R(darts, c, 'dartLength', 0.05, 3, 0.01, 'blade (m)');
  R(darts, c, 'dartWidth', 0.01, 0.5, 0.005, 'blade width (m)');
  R(darts, c, 'dartTrail', 0, 8, 0.05, 'trail (m)');
  R(darts, c, 'dartTrailWidth', 0.005, 0.4, 0.005, 'trail width (m)');
  R(darts, c, 'dartGlow', 0, 12, 0.05, 'glow');
  R(darts, c, 'dartSoftFade', 0.01, 1, 0.01, 'soft fade (m)');
  R(darts, c, 'dartBury', 0, 1, 0.01, 'sinks in');
  R(darts, c, 'dartStickTime', 0.05, 5, 0.05, 'stays stuck for');
  darts.addColor(c, 'colorDart').name('blade');
  darts.addColor(c, 'colorDartTrail').name('trail');

  const land = darts.addFolder('Landing');
  R(land, c, 'landFlareSize', 0, 3, 0.01, 'flare (m)');
  R(land, c, 'landFlareLife', 0.02, 2, 0.01, 'flare life');
  R(land, c, 'landSparks', 0, 60, 1, 'sparks');
  R(land, c, 'landSparkSpeed', 0, 20, 0.1, 'spark speed');
  R(land, c, 'landDecalRadius', 0, 3, 0.01, 'ring (m)');
  R(land, c, 'landDecalLife', 0.05, 3, 0.01, 'ring life');
  R(land, c, 'landShake', 0, 0.4, 0.005, 'shake');
  R(land, c, 'sparkSize', 0.01, 0.3, 0.005, 'spark size');
  R(land, c, 'sparkLifetime', 0.05, 2, 0.01, 'spark lifetime');
  R(land, c, 'sparkStretch', 0, 2, 0.01, 'spark stretch');
  Editor.gradient(land, c, 'colorSpark', 'spark colour');

  const motes = folder.addFolder('8 · Motes & loose feathers');
  R(motes, c, 'moteRate', 0, 400, 1, 'motes / s');
  R(motes, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(motes, c, 'moteLifetime', 0.1, 6, 0.05, 'mote lifetime');
  R(motes, c, 'moteFall', 0, 4, 0.05, 'mote fall (m/s)');
  R(motes, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  Editor.gradient(motes, c, 'colorMote', 'mote colour');
  R(motes, c, 'downRate', 0, 80, 0.5, 'loose feathers / s');
  R(motes, c, 'downBeat', 0, 200, 1, 'shaken off by beat');
  R(motes, c, 'downSize', 0.02, 0.8, 0.005, 'feather size');
  R(motes, c, 'downLifetime', 0.1, 8, 0.05, 'feather lifetime');
  R(motes, c, 'downGravity', -6, 2, 0.05, 'feather gravity');
  R(motes, c, 'downSpin', 0, 10, 0.05, 'feather spin');
  R(motes, c, 'downGlow', 0, 6, 0.05, 'feather glow');
  Editor.gradient(motes, c, 'colorDown', 'feather colour');

  const beat = folder.addFolder('9 · The beat');
  R(beat, c, 'beatShake', 0, 1, 0.01, 'shake');
  R(beat, c, 'beatFlash', 0, 1, 0.01, 'flash');
  R(beat, c, 'beatLight', 0, 60, 0.5, 'light punch');
  R(beat, c, 'beatBurst', 0, 10, 0.05, 'air shell (m)');
  R(beat, c, 'beatRing', 0, 16, 0.05, 'floor ring (m)');
  R(beat, c, 'beatRingLife', 0.05, 3, 0.01, 'ring life');
  beat.addColor(c, 'colorFlash').name('flash');
  beat.addColor(c, 'colorRingA').name('ring');
  beat.addColor(c, 'colorRingB').name('ring, hot');
  beat.addColor(c, 'colorBurstA').name('shell, hot');
  beat.addColor(c, 'colorBurstB').name('shell');
  beat.addColor(c, 'colorBurstC').name('shell, cool');
  const warp = beat.addFolder('Distortion');
  R(warp, c, 'warpStrength', 0, 3, 0.01, 'strength');
  R(warp, c, 'warpSize', 1, 30, 0.1, 'size (m)');
  R(warp, c, 'warpRingWidth', 0.01, 0.5, 0.005, 'ring width');
  R(warp, c, 'warpRingTime', 0.05, 2, 0.01, 'ring crosses in');
  R(warp, c, 'warpShimmer', 0, 1, 0.01, 'shimmer');
  R(warp, c, 'warpScale', 0.1, 6, 0.05, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 6, 0.05, 'noise speed');

  const held = folder.addFolder('10 · The struck');
  R(held, c, 'pinHeight', 0.3, 2.5, 0.01, 'caught at (m)');
  R(held, c, 'liftHeight', 0, 5, 0.05, 'lifted by (m)');
  R(held, c, 'liftTime', 0.05, 5, 0.05, 'rise over');
  R(held, c, 'pinStiffness', 0.01, 1, 0.01, 'grip');
  R(held, c, 'liftSway', 0, 1, 0.01, 'sway (m)');
  R(held, c, 'hitImpulse', 0, 10, 0.1, 'dart impulse');
  R(held, c, 'hitLift', 0, 10, 0.1, 'dart lift');
  R(held, c, 'hitSpin', 0, 4, 0.05, 'dart spin');
  R(held, c, 'dropShove', 0, 12, 0.1, 'thrown down (m/s)');
  R(held, c, 'dropFlash', 0, 1, 0.01, 'drop flash');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 12, 0.05, 'height (m)');
}
