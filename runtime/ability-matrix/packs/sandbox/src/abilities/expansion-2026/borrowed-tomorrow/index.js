import { DoubleSide, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Points, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import {
  createExpansionFX,
  routeExpansionTransparency,
  expansionBurst,
  ParticleShape,
} from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  createBezelGeometry,
  createBobGeometry,
  createDialGeometry,
  createFragmentGeometry,
  createGearGeometry,
  createHandGeometry,
  createIndexGeometry,
  createPillarGeometry,
  createQuad,
  createSandGeometry,
} from './geometry.js';
import {
  createChronoGlowMaterial,
  createClockFaceMaterial,
  createFutureRingMaterial,
  createGlassMaterial,
  createLensMaterial,
  createPillarMaterial,
  createSandMaterial,
  createShockMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;

const TAU = Math.PI * 2;
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
const scratch = new Object3D();
const delta = new Vector3();
const _pos = new Vector3();
/** Reused option bag for expansionBurst (it destructures, never retains). */
const _burst = { count: 0, size: 0, life: 0, speed: 0, spread: 0, radius: 0 };
/** Cut-glass fragments orbiting the clock. */
const MAX_SHARDS = 48;
/** Bodies the strike may affect. */
const MAX_TARGETS = 16;
/** GPU sand grains allocated per pool member. */
const MAX_SAND = 200;
/** Teeth of the gear train — the ratios that turn it. */
const GEAR_TEETH = [36, 18, 12];

/**
 * BORROWED TOMORROW — Time, zone cast.
 *
 * A strike that is *borrowed*, paid for later. A brass clock **unfolds** as it
 * flies to the target — turned bezels, a cut gear train, hour indices,
 * sculpted hands, a pendulum, a halo of cut-glass fragments. Once it lands
 * the **debt accrues** for `delay` seconds: the debt arc fills clockwise
 * round the face from twelve, the long hand sweeps one full turn, sand
 * spirals in toward the arbor, the air twists inward, the lit parts breathe
 * faster and faster — and *tomorrow's ring*, a chromatic double image
 * hovering high above, descends to meet the face as its two images close.
 * The pendulum's swing dies away with the debt, and at the instant it stops
 * the strike **lands**: a column of light drops through the clock, a shock
 * ring and a pressure wave run out, sand and glass are thrown, the camera
 * knocks. Then the clock **folds away** and the face dissolves.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the face** (`createClockFaceMaterial`) — ripples, hour rays, sweep
 *      wedge and the filling debt arc on the floor; noise dissolve on exit.
 *   2. **the clockwork** — lit brass (`MeshStandardMaterial`, world layer, so
 *      it shadows): turned bezels, chapter ring, a meshing three-gear train,
 *      bevelled indices, spade and counterweighted hands; the lit bezel,
 *      hand and bob in `createChronoGlowMaterial`.
 *   3. **the pendulum** — pierced rod and turned bob; its swing is the timer
 *      the player reads, so it settles to exactly zero at the strike.
 *   4. **tomorrow's ring** (`createFutureRingMaterial`) — the descending
 *      chromatic ghost ring: the telegraph of *when*.
 *   5. **the glass** (`createGlassMaterial`) — 48 instanced cut-glass
 *      fragments, thrown up and out at the strike.
 *   6. **particles** — chip puffs orbiting the face while the debt accrues
 *      and a 64-chip burst at the strike (shared expansion system); GPU sand.
 *   7. **the strike** — pillar (`createPillarMaterial`), shock ring
 *      (`createShockMaterial`), AIR shell, SHOCKWAVE + RIPPLE decals, flash,
 *      camera knock, light punch.
 *   8. **the lens** (`createLensMaterial` on `LAYER.DISTORTION`) — inward
 *      swirl while the debt accrues, pressure ring at the strike.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * Unchanged by the craft pass: exactly one strike, `delay` seconds after the
 * clock lands, on every enemy inside `zoneRadius`, through the expansion
 * combat binding or the dummy field.
 *
 * ## The editor rule
 *
 * A cast keeps whether it has released and integrated clocks; every
 * dimension, colour, count and timing is read from `settings.borrowedTomorrow`
 * every frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return MAX_SHARDS + 12;
  }

  /* ------------------------------------------------------------------ */
  /* Timing — gameplay; unchanged                                        */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    return Math.max(this.config.delay + 0.55, 0.7);
  }

  get fadeDuration() {
    return 0.85;
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
    // The clockwork is a child so `clockSize` scales only the clock itself;
    // the floor face, shock ring, lens, tomorrow's ring and pillar stay sized
    // from `zoneRadius` so the telegraph never lies about the hit area.
    this.clockwork = new Group();
    this.root.add(this.clockwork);
    const quad = own(createQuad());

    // 1 · the face
    this.fieldMaterial = own(createClockFaceMaterial());
    this.field = new Mesh(quad, this.fieldMaterial);
    this.field.rotation.x = -Math.PI / 2;
    this.field.position.y = 0.035;
    this.field.renderOrder = 2;
    this.root.add(this.field);

    // 2 · the clockwork: brass is lit and solid; the "lit" parts glow
    this.gold = own(new MeshStandardMaterial({
      color: 0x8d6032, metalness: 0.86, roughness: 0.24, emissive: 0x472000, emissiveIntensity: 0.8,
    }));
    this.lit = own(createChronoGlowMaterial());
    // The enamel dial and its case: the clock's body. Dark violet enamel
    // (the ramp's deep stop) under the brass, lit by the sun, shadowing.
    this.enamel = own(new MeshStandardMaterial({
      color: 0x1b1430, metalness: 0.25, roughness: 0.32, emissive: 0x120a22, emissiveIntensity: 1, side: DoubleSide,
    }));
    this.dial = new Mesh(own(createDialGeometry()), this.enamel);
    this.dial.castShadow = true;
    this.clockwork.add(this.dial);
    const outer = own(createBezelGeometry('outer'));
    const inner = own(createBezelGeometry('inner'));
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new Mesh(i === 1 ? inner : outer, i === 1 ? this.lit : this.gold);
      ring.position.y = 0.06 + i * 0.03;
      ring.castShadow = i !== 1;
      this.clockwork.add(ring);
      this.rings.push(ring);
    }
    this.chapter = new Mesh(own(createBezelGeometry('chapter')), this.gold);
    this.chapter.position.y = 0.13;
    this.clockwork.add(this.chapter);
    // Twelve independently articulated hour indices make the spinning face
    // readable even before the animated hands reach full size.
    this.indices = new InstancedMesh(own(createIndexGeometry()), this.gold, 12);
    this.indices.frustumCulled = false;
    this.clockwork.add(this.indices);
    // A meshing gear train under the face.
    this.gearTrain = new Group();
    this.gearTrain.position.y = 0.05;
    this.gears = [];
    const gearRadius = [0.5, 0.26, 0.18];
    for (let i = 0; i < GEAR_TEETH.length; i++) {
      const gear = new Mesh(own(createGearGeometry({
        teeth: GEAR_TEETH[i], radius: gearRadius[i], depth: 0.04 + 0.01 * (2 - i), hub: 0.05 + 0.02 * (2 - i), spokes: i === 2 ? 0 : 5, thickness: 0.035,
      })), this.gold);
      gear.castShadow = true;
      this.gearTrain.add(gear);
      this.gears.push(gear);
    }
    // Pitch circles touch: B sits right of A, C left of A.
    this.gears[1].position.set(gearRadius[0] + gearRadius[1] - 0.045, 0.01, 0);
    this.gears[2].position.set(-(gearRadius[0] + gearRadius[2] - 0.04), 0.02, 0);
    this.clockwork.add(this.gearTrain);

    // 7 · the strike's floor ring
    this.releaseMaterial = own(createShockMaterial());
    this.releaseRing = new Mesh(quad, this.releaseMaterial);
    this.releaseRing.rotation.x = -Math.PI / 2;
    this.releaseRing.position.y = 0.2;
    this.releaseRing.renderOrder = 4;
    this.root.add(this.releaseRing);

    // The hands: [0] long (sweeps the debt), [1] short.
    const minute = own(createHandGeometry('minute'));
    const hour = own(createHandGeometry('hour'));
    this.hands = [];
    for (let i = 0; i < 2; i++) {
      const pivot = new Group();
      pivot.position.y = 0.18 + i * 0.01;
      pivot.rotation.x = -Math.PI / 2;
      const hand = new Mesh(i ? hour : minute, i ? this.lit : this.gold);
      hand.castShadow = !i;
      pivot.add(hand);
      this.clockwork.add(pivot);
      this.hands.push(pivot);
    }

    // 3 · the pendulum settles as the actual deferred strike approaches.
    this.pendulum = new Group();
    this.pendulum.position.y = 1.7;
    this.rod = new Mesh(own(createHandGeometry('rod')), this.gold);
    this.pendulum.add(this.rod);
    this.bob = new Mesh(own(createBobGeometry()), this.lit);
    this.bob.position.y = -1.05;
    this.pendulum.add(this.bob);
    // Hung from the suspended clock's arbor in the root, not the tilted
    // clockwork, so it always hangs plumb under the clock.
    this.root.add(this.pendulum);

    // 4 · tomorrow's ring
    this.futureMat = own(createFutureRingMaterial());
    this.future = new Mesh(quad, this.futureMat);
    this.future.rotation.x = -Math.PI / 2;
    this.future.renderOrder = 5;
    this.root.add(this.future);

    // 7 · the pillar
    this.pillarMat = own(createPillarMaterial());
    this.pillar = new Mesh(own(createPillarGeometry()), this.pillarMat);
    this.pillar.visible = false;
    this.pillar.renderOrder = 6;
    this.root.add(this.pillar);

    // 5 · the glass
    this.glass = own(createGlassMaterial());
    this.shards = new InstancedMesh(own(createFragmentGeometry()), this.glass, MAX_SHARDS);
    this.shards.frustumCulled = false;
    this.shards.renderOrder = 7;
    this.clockwork.add(this.shards);

    // 6 · sand
    this.sandMat = own(createSandMaterial());
    this.sand = new Points(own(createSandGeometry(MAX_SAND)), this.sandMat);
    this.sand.frustumCulled = false;
    this.sand.renderOrder = 8;
    this.root.add(this.sand);

    // 8 · the lens (opaque proxy — see createLensMaterial)
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.position.y = 0.3;
    this.lens.visible = false;
    this.root.add(this.lens);

    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._found = [];
    this._mote = new Vector3();
    this._clock = 0;
    this._calm = false;
    this._faceState = { time: 0, radius: 1, energy: 0, fade: 1, debt: 0, release: -1, dissolve: 0 };
    this._chronoState = { pulse: 0, fade: 1 };
    this._futureState = { fade: 1, split: 1, debt: 0 };
    this._glassState = { fade: 1 };
    this._sandState = { clock: 0, radius: 1, debt: 0, throw: 0, fade: 1, capacity: MAX_SAND };
    this._shockState = { progress: 0, opacity: 0 };
    this._pillarState = { power: 0 };
    this._lensState = { swirl: 0, shock: 0, wave: 0, clock: 0 };

    routeExpansionTransparency(this.group);
    this.lens.layers.set(LAYER.DISTORTION);
    this._disposed = false;
  }

  createParticles() {
    this.fx = createExpansionFX(this.ctx, 'time', {
      shape: ParticleShape.CHIP,
      colors: ['#fff2cf', '#edbd73', '#a073bd', '#302451'],
    });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._released = false;
    this._scope = bindExpansionCombat(this.ctx, 'matrix-expansion/borrowed-tomorrow');
    this.failure = null;
    this._moteTimer = 0;
    this._trailT = 0;
    this._releaseCount = 0;
    this._clock = 0;
    this._calm = prefersReducedMotion();
    this.root.visible = true;
    this.root.scale.setScalar(0.01);
    this.fieldMaterial.uniforms.uEnergy.value = 0;
    this._sync(0);
  }

  onTravel(dt) {
    this._sync(dt);
  }

  onImpact() {
    this.position.y = 0;
    this._sync(0);
  }

  onFade(dt) {
    const c = this.config;
    if (this.phase === 'impact' && !this._released) {
      // Chip puffs orbit the face while the debt accrues.
      this._moteTimer += dt;
      const interval = Math.max(0.02, c.moteInterval);
      if (this._moteTimer >= interval) {
        this._moteTimer %= interval;
        const angle = this.age * c.rotationSpeed * 2;
        this._mote.set(this.position.x + Math.cos(angle) * c.zoneRadius * 0.7,
          0.15, this.position.z + Math.sin(angle) * c.zoneRadius * 0.7);
        _burst.count = c.moteCount;
        _burst.size = c.moteSize;
        _burst.life = c.moteLife;
        _burst.speed = c.moteSpeed;
        _burst.spread = c.moteSpread;
        _burst.radius = 0.12;
        expansionBurst(this.fx, this._mote, _burst);
      }
    }
    if (!this._released && this.impactTime >= c.delay) {
      this._released = true;
      this._releaseCount++;
      this._strike();
      this._release();
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The strike — gameplay, unchanged                                     */
  /* ------------------------------------------------------------------ */

  _strike() {
    const c = this.config;
    _burst.count = c.strikeCount;
    _burst.size = c.strikeSize;
    _burst.life = c.strikeLife;
    _burst.speed = c.strikeSpeed;
    _burst.spread = 0.8; // expansionBurst's default cone
    _burst.radius = c.zoneRadius * 0.5;
    expansionBurst(this.fx, this.position, _burst);
    if (this._scope) {
      const source = [this.position.x, 0, this.position.z];
      const targets = this._scope.queryActors({ position: source, radius: c.zoneRadius, relation: 'enemy' });
      if (!targets.ok) { this.failure = targets.reason; return; }
      for (const actor of targets.actors.slice(0, MAX_TARGETS)) {
        const sent = this._scope.emit({
          type: 'hit', element: 'time', targetIds: [actor.id],
          position: actor.position, sourcePosition: source, damage: 1,
          hitForce: impactForce(c, settings.global.explosionIntensity), tags: ['borrowed-tomorrow'],
        });
        if (!sent.ok) this.failure = sent.reason;
      }
      return;
    }
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(this.position.x, this.position.z, c.zoneRadius, this._found);
    const power = settings.global.explosionIntensity;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    let struck = 0;
    for (const dummy of found) {
      delta.set(dummy.position.x - this.position.x, 0, dummy.position.z - this.position.z);
      if (delta.lengthSq() > c.zoneRadius * c.zoneRadius) continue;
      if (delta.lengthSq() < 1e-8) delta.copy(this.direction);
      else delta.normalize();
      if (dummy.kill(delta.x, delta.z, this._force) && ++struck >= MAX_TARGETS) break;
    }
  }

  /** Shell, decals, flash, knock and light when the debt is paid. */
  _release() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    const r = c.zoneRadius;
    this.lightBoost = c.releaseLight * power;
    _pos.copy(this.position).setY(0.05);
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _pos, {
      radius: r * 0.1,
      endRadius: r * c.burstReach * power,
      life: c.burstLife,
      intensity: c.burstIntensity,
      opacity: c.burstOpacity * settings.global.opacity,
      fresnel: c.burstFresnel,
      squash: c.burstSquash,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: r * power, life: c.decalLife * 0.6, width: c.shockwaveWidth, intensity: c.shockwaveIntensity,
      colorA: getColor(c.coreColor), colorB: getColor(c.ringColor),
    });
    this.ctx.decals?.spawn?.(DecalType.RIPPLE, _pos, {
      radius: r * 0.8, life: c.decalLife, intensity: c.rippleIntensity,
      colorA: getColor(c.coreColor), colorB: getColor(c.shadowColor),
    });
    if (c.impactShake > 0) this.ctx.shake?.add?.(c.impactShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.impactFlash > 0) this.ctx.flash?.trigger?.(getColor(c.coreColor), c.impactFlash * power);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  /** Mirror the particle look from settings every frame (no-op on stubs). */
  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    const fx = this.fx;
    if (!fx?.uniforms) return;
    fx.setGradient?.(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const u = fx.uniforms;
    if (u.uGlow) u.uGlow.value = c.sparkGlow * g.glow;
    if (u.uOpacity) u.uOpacity.value = g.opacity;
    if (u.uTurbulence) u.uTurbulence.value = 0.5 * g.turbulence;
    if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
    if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
    if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
  }

  _sync(dt) {
    const c = this.config,
      g = settings.global,
      r = c.zoneRadius,
      anticipation = clamp(this.impactTime / Math.max(0.01, c.delay));
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    const arrival = smooth(this.u * 4);
    const fadeT = this.phase === 'fade' ? clamp(this.fadeTime / this.fadeDuration) : 0;
    const fade = 1 - fadeT;
    // Seconds since the debt was paid, through the impact and the fade.
    const since = this._released ? this.impactTime - c.delay + (this.phase === 'fade' ? this.fadeTime : 0) : -1;
    // Driven by `since`, which keeps running through the fade, so a long
    // releaseTime still runs out instead of freezing when the impact ends.
    const release = this._released ? clamp(since / Math.max(0.05, c.releaseTime)) : 0;
    const debt = this.phase === 'travel' ? 0 : anticipation;

    this.root.position.copy(this.position);
    this.root.scale.setScalar(Math.max(0.001, fade));
    const travelling = this.phase === 'travel';

    // 2a · the suspended clock: thrown small and spinning from the hand in an
    // arc, it unfolds over the circle standing nearly upright, facing the
    // caster, hovering at `clockLift`; in the last `slamTime` before the debt
    // falls due it drops flat onto its own face — the strike is the clock
    // hitting the floor on the hour.
    const yaw = Math.atan2(this.direction.x, this.direction.z);
    const unfold = travelling ? 0 : Easing.outBack(clamp(this.impactTime / Math.max(0.05, c.unfoldTime)));
    const slamStart = Math.max(0, c.delay - Math.max(0.02, c.slamTime));
    const slam = this._released ? 1 : travelling ? 0 : Easing.inCubic(clamp((this.impactTime - slamStart) / Math.max(0.02, c.slamTime)));
    let hubY, tilt, size;
    if (travelling) {
      hubY = c.travelHeight + Math.sin(Math.PI * clamp(this.u)) * c.travelArc;
      tilt = c.clockTilt;
      size = c.clockSize * c.travelScale * smooth(this.u * 6);
    } else {
      hubY = (c.travelHeight + (c.clockLift - c.travelHeight) * clamp(unfold)) * (1 - slam) + 0.08 * slam;
      tilt = c.clockTilt * (1 - slam);
      size = c.clockSize * (c.travelScale + (1 - c.travelScale) * unfold);
    }
    this.clockwork.position.set(0, hubY, 0);
    this.clockwork.rotation.set(-tilt, yaw, 0, 'YXZ');
    if (travelling) this.clockwork.rotation.y += this.age * c.travelSpin;
    this.clockwork.scale.setScalar(Math.max(0.001, size));
    this.dial.scale.set(r * 0.9, r * 0.9 * c.dialDepth, r * 0.9);
    this.dial.position.y = -0.02;
    this.enamel.color.copy(getColor(c.dialColor));
    this.enamel.emissive.copy(getColor(c.shadowColor));
    this.enamel.emissiveIntensity = c.dialGlow * g.glow * (0.4 + debt * 0.8);
    this.enamel.roughness = c.dialRoughness;
    // The floor face, tomorrow's ring, the sand and the lens belong to the
    // circle: they wait for the clock to arrive.
    this.field.visible = !travelling;
    this.sand.visible = !travelling;
    if (travelling && dt > 0) {
      this._trailT += dt;
      if (this._trailT >= 0.03) {
        this._trailT = 0;
        _pos.copy(this.position).setY(hubY);
        _burst.count = c.trailCount;
        _burst.size = c.moteSize;
        _burst.life = c.trailLife;
        _burst.speed = 0.3;
        _burst.spread = 1;
        _burst.radius = 0.25;
        expansionBurst(this.fx, _pos, _burst);
      }
    }

    // 1 · the face
    this.field.scale.set(r * 2, r * 2, 1);
    const fs = this._faceState;
    fs.time = this._calm ? 0 : this.age * c.pulseSpeed;
    fs.radius = r;
    fs.energy = 0.45 + 0.55 * anticipation;
    fs.fade = fade;
    fs.debt = this._released ? 1 : debt;
    fs.release = this._released && release < 1 ? release : -1;
    fs.dissolve = clamp(fadeT / Math.max(0.05, c.dissolveTime));
    this.fieldMaterial.userData.sync(fs);

    // 2 · the clockwork
    this.gold.color.copy(getColor(c.ringColor));
    this.gold.emissive.copy(getColor(c.brassEmissive));
    this.gold.emissiveIntensity = c.brassGlow * g.glow * (1 + debt * 0.6);
    this.gold.metalness = c.brassMetalness;
    this.gold.roughness = c.brassRoughness;
    const cs = this._chronoState;
    cs.pulse = this._calm ? 0.5 : 0.5 + 0.5 * Math.sin(this.age * (4 + 14 * debt * debt));
    cs.fade = fade;
    this.lit.userData.sync(cs);
    const spin = clock * c.rotationSpeed;
    this.rings[0].scale.set(r * 0.9, 1.6, r * 0.9);
    this.rings[1].scale.set(r * 0.74, 1.4, r * 0.74);
    this.rings[2].scale.set(r * 0.56, 1.6, r * 0.56);
    this.rings[0].rotation.y = spin;
    this.rings[1].rotation.y = -spin * 1.4;
    this.chapter.scale.set(r * 1.3, 1.5, r * 1.3);
    this.gearTrain.scale.set(r * 0.62 * c.gearScale, 1, r * 0.62 * c.gearScale);
    const gearTurn = spin * c.gearSpeed * (1 + debt * 2);
    this.gears[0].rotation.y = gearTurn;
    this.gears[1].rotation.y = -gearTurn * (GEAR_TEETH[0] / GEAR_TEETH[1]) + Math.PI / GEAR_TEETH[1];
    this.gears[2].rotation.y = -gearTurn * (GEAR_TEETH[0] / GEAR_TEETH[2]) + Math.PI / GEAR_TEETH[2];
    this.hands[0].rotation.z = -(spin + anticipation * TAU);
    this.hands[1].rotation.z = spin * 0.6;
    this.hands[0].children[0].scale.setScalar(r * 0.62);
    this.hands[1].children[0].scale.setScalar(r * 0.42);
    for (let i = 0; i < 12; i++) {
      const angle = (i * TAU) / 12;
      scratch.position.set(Math.sin(angle) * r * 0.81, 0.17, Math.cos(angle) * r * 0.81);
      scratch.rotation.set(-Math.PI / 2, 0, -angle);
      scratch.scale.set(r * 0.16, r * (i % 3 === 0 ? 0.24 : 0.14), 1);
      scratch.updateMatrix();
      this.indices.setMatrixAt(i, scratch.matrix);
    }
    this.indices.instanceMatrix.needsUpdate = true;

    // 3 · the pendulum: its swing dies away with the debt, exactly to zero.
    // Hung from the arbor, just behind the dial, swinging across the view.
    this.pendulum.visible = !travelling && slam < 0.5;
    this.pendulum.position.set(this.direction.x * c.pendulumBack, hubY + c.pendulumHeight, this.direction.z * c.pendulumBack);
    this.pendulum.scale.setScalar(Math.max(0.001, unfold));
    this.rod.scale.set(c.pendulumThick, c.pendulumLength, c.pendulumThick);
    this.bob.position.y = -c.pendulumLength;
    this.bob.scale.setScalar(c.bobScale);
    this.pendulum.rotation.set(0, yaw, Math.sin(this.age * (c.pendulumRate ?? 3)) * (c.pendulumArc ?? 0.55) * (1 - anticipation));

    // 4 · tomorrow's ring descends with the debt and lands at the strike
    const land = Easing.inCubic(debt);
    const vanish = Math.max(0.01, c.futureVanish);
    this.future.visible = !travelling && (!this._released || since < vanish);
    this.future.position.y = 0.2 + (c.futureHeight - 0.2) * (1 - land);
    this.future.scale.set(r * 1.9, r * 1.9, 1);
    const fu = this._futureState;
    fu.fade = fade * (this._released ? 1 - clamp(since / vanish) : arrival);
    fu.split = c.futureSplit * (1 - land);
    fu.debt = debt;
    this.futureMat.userData.sync(fu);

    // 7 · the shock ring and the pillar
    this.releaseRing.scale.set(r * 2 * (0.18 + 0.82 * smooth(release)), r * 2 * (0.18 + 0.82 * smooth(release)), 1);
    this._shockState.progress = release;
    this._shockState.opacity = this._released ? (1 - release) * 0.8 * fade : 0;
    this.releaseRing.visible = this._released && release < 1;
    this.releaseMaterial.userData.sync(this._shockState);
    const pillarT = this._released ? since / Math.max(0.05, c.pillarLife) : 1;
    this.pillar.visible = pillarT < 1;
    if (this.pillar.visible) {
      this._pillarState.power = Math.pow(1 - clamp(pillarT), 1.5);
      this.pillar.scale.set(c.pillarWidth * (1 + pillarT * 0.6), c.pillarHeight, c.pillarWidth * (1 + pillarT * 0.6));
      this.pillar.position.y = c.pillarHeight * 0.5;
      this.pillarMat.userData.sync(this._pillarState);
    }

    // 5 · the glass, scattered after the deferred hit
    this._glassState.fade = fade;
    this.glass.userData.sync(this._glassState);
    const shatter = this._released ? clamp(since / Math.max(0.05, c.shatterTime)) : 0;
    for (let i = 0; i < MAX_SHARDS; i++) {
      const a = i * 2.399963 + clock * 0.23,
        band = 0.36 + (i % 5) * 0.11;
      const orbit = r * (band + shatter * (c.shatterSpread + (i % 4) * 0.08));
      const lift = 0.22 + (i % 7) * 0.13 + Math.sin(clock * 2 + i) * 0.08 +
        shatter * (c.shatterLift + (i % 5) * 0.18);
      scratch.position.set(Math.cos(a) * orbit, lift, Math.sin(a) * orbit);
      scratch.rotation.set(a * 0.5 + shatter * 2, a + shatter, clock * 0.8 + i);
      const size = (0.65 + (i % 3) * 0.22) * fade * (1 - shatter * 0.75) * c.glassSize;
      scratch.scale.setScalar(size);
      scratch.updateMatrix();
      this.shards.setMatrixAt(i, scratch.matrix);
    }
    this.shards.instanceMatrix.needsUpdate = true;

    // 6 · sand and the particle look
    const ss = this._sandState;
    ss.clock = clock;
    ss.radius = r * 0.9;
    ss.debt = debt;
    ss.throw = this._released ? clamp(since / Math.max(0.05, c.sandThrowTime)) : 0;
    ss.fade = arrival * fade;
    this.sandMat.userData.sync(ss);
    this._syncParticles();

    // 8 · the lens: inward swirl while the debt accrues, a ring at the strike
    const ls = this._lensState;
    ls.swirl = this._released ? 0 : debt * debt;
    ls.shock = this._released && release < 1 ? (1 - release) * fade : 0;
    ls.wave = Easing.outCubic(release);
    ls.clock = clock;
    this.lens.visible = !this._calm && (ls.swirl * c.lensStrength + ls.shock * c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) {
      this.lens.scale.set(r * 2.2, r * 2.2, 1);
      this.lensMat.userData.sync(ls);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.pillar.visible = false;
    this.lens.visible = false;
    this._released = false;
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
  const { R, sub, color, gradient, castAnim } = editorKit(Editor);
  const folder = gui.addFolder('⧗  Borrowed Tomorrow');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'clock flies at (m/s)');
  R(cast, c, 'lifetime', 0.2, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 15, 0.05, 'cooldown');
  castAnim(cast, c);

  const debt = sub(folder, 'The debt');
  R(debt, c, 'delay', 0.25, 3, 0.05, 'defer (s)');
  R(debt, c, 'zoneRadius', 1, 8, 0.1, 'strike radius (m)');
  R(debt, c, 'hitImpulse', 0, 30, 0.5, 'impact impulse');
  R(debt, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(debt, c, 'hitSpin', 0, 8, 0.05, 'tumble');

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'releaseLight', 0, 20, 0.1, 'punch at the strike');

  const face = sub(folder, '1 · The face');
  R(face, c, 'pulseSpeed', 0, 8, 0.1, 'clock pulse');
  R(face, c, 'faceGlow', 0, 6, 0.05, 'glow');
  R(face, c, 'faceRipple', 0, 4, 0.05, 'time ripples');
  R(face, c, 'debtGlow', 0, 4, 0.05, 'debt arc');
  R(face, c, 'dissolveTime', 0.05, 1, 0.01, 'dissolves over (× fade)');
  color(face, c, 'coreColor', 'clock light');
  color(face, c, 'shadowColor', 'future shadow');

  const work = sub(folder, '2 · The clockwork');
  R(work, c, 'clockSize', 0.1, 2, 0.01, 'clock size');
  R(work, c, 'clockTilt', 0, 1.6, 0.01, 'stands up (rad)');
  R(work, c, 'clockLift', 0.3, 6, 0.05, 'hovers at (m)');
  R(work, c, 'unfoldTime', 0.05, 1.5, 0.01, 'unfolds over (s)');
  R(work, c, 'slamTime', 0.02, 0.8, 0.01, 'drops flat over (s)');
  R(work, c, 'dialDepth', 0.05, 1.5, 0.01, 'dial thickness');
  color(work, c, 'dialColor', 'enamel');
  R(work, c, 'dialGlow', 0, 4, 0.05, 'enamel glow');
  R(work, c, 'dialRoughness', 0, 1, 0.01, 'enamel roughness');
  const flight = sub(folder, '2b · The throw');
  R(flight, c, 'travelHeight', 0.2, 4, 0.05, 'thrown at (m)');
  R(flight, c, 'travelArc', 0, 6, 0.05, 'arc height (m)');
  R(flight, c, 'travelScale', 0.05, 1, 0.01, 'size in flight');
  R(flight, c, 'travelSpin', 0, 30, 0.5, 'spin in flight (rad/s)');
  R(flight, c, 'trailCount', 0, 10, 1, 'trail chips');
  R(flight, c, 'trailLife', 0.05, 2, 0.01, 'trail life (s)');
  R(work, c, 'rotationSpeed', 0, 4, 0.05, 'clock speed');
  R(work, c, 'gearSpeed', 0, 4, 0.05, 'gear train speed');
  R(work, c, 'gearScale', 0.2, 1.6, 0.01, 'gear train size');
  R(work, c, 'brassMetalness', 0, 1, 0.01, 'brass metalness');
  R(work, c, 'brassRoughness', 0, 1, 0.01, 'brass roughness');
  R(work, c, 'brassGlow', 0, 4, 0.05, 'brass emissive');
  color(work, c, 'ringColor', 'brass');
  color(work, c, 'brassEmissive', 'brass emissive colour');
  R(work, c, 'chronoGlow', 0, 6, 0.05, 'lit parts glow');

  const pend = sub(folder, '3 · The pendulum');
  R(pend, c, 'pendulumRate', 0, 8, 0.1, 'pendulum speed');
  R(pend, c, 'pendulumArc', 0, 1.2, 0.05, 'pendulum arc');
  R(pend, c, 'pendulumHeight', -2, 2, 0.01, 'pivot above the arbor (m)');
  R(pend, c, 'pendulumLength', 0.2, 4, 0.01, 'rod length (m)');
  R(pend, c, 'pendulumBack', -1, 1.5, 0.01, 'behind the dial (m)');
  R(pend, c, 'pendulumThick', 0.2, 4, 0.05, 'rod thickness');
  R(pend, c, 'bobScale', 0.2, 5, 0.05, 'bob size');

  const future = sub(folder, "4 · Tomorrow's ring");
  R(future, c, 'futureHeight', 0.3, 8, 0.05, 'starts at (m)');
  R(future, c, 'futureGlow', 0, 6, 0.05, 'glow');
  R(future, c, 'futureOpacity', 0, 1, 0.01, 'opacity');
  R(future, c, 'futureSplit', 0, 2, 0.01, 'chromatic split');
  R(future, c, 'futureVanish', 0.02, 1.5, 0.01, 'vanishes after the strike (s)');

  const glass = sub(folder, '5 · The glass');
  R(glass, c, 'glassSize', 0.2, 3, 0.01, 'fragment size');
  R(glass, c, 'glassGlow', 0, 6, 0.05, 'glow');
  R(glass, c, 'glassOpacity', 0, 1, 0.01, 'opacity');
  R(glass, c, 'shatterLift', 0, 4, 0.05, 'thrown up (m)');
  R(glass, c, 'shatterSpread', 0, 1.5, 0.01, 'thrown out (× radius)');
  R(glass, c, 'shatterTime', 0.05, 3, 0.01, 'throw lasts (s)');
  color(glass, c, 'glassColor', 'glass');

  const fx = sub(folder, '6 · Particles');
  R(fx, c, 'moteInterval', 0.02, 0.5, 0.01, 'chip puff every (s)');
  R(fx, c, 'moteCount', 0, 12, 1, 'chips per puff');
  R(fx, c, 'moteSize', 0.01, 0.4, 0.005, 'puff chip size');
  R(fx, c, 'moteLife', 0.05, 3, 0.01, 'puff chip life (s)');
  R(fx, c, 'moteSpeed', 0, 4, 0.01, 'puff chip speed');
  R(fx, c, 'moteSpread', 0, 1, 0.01, 'puff spread');
  R(fx, c, 'strikeCount', 0, 128, 1, 'chips at the strike');
  R(fx, c, 'strikeSize', 0.01, 0.6, 0.005, 'strike chip size');
  R(fx, c, 'strikeLife', 0.05, 3, 0.01, 'strike chip life (s)');
  R(fx, c, 'strikeSpeed', 0, 12, 0.05, 'strike chip speed');
  R(fx, c, 'sparkGlow', 0, 6, 0.05, 'chip glow');
  gradient(fx, c, 'colorSpark', 'chip gradient');
  R(fx, c, 'sandCount', 0, MAX_SAND, 1, 'sand grains');
  R(fx, c, 'sandSize', 0.005, 0.3, 0.005, 'grain size');
  R(fx, c, 'sandGlow', 0, 6, 0.05, 'sand glow');
  R(fx, c, 'sandSwirl', -4, 4, 0.05, 'sand swirl');
  R(fx, c, 'sandThrowTime', 0.05, 3, 0.01, 'sand thrown out over (s)');

  const strike = sub(folder, '7 · The strike');
  R(strike, c, 'releaseTime', 0.05, 2, 0.01, 'shock ring runs out over (s)');
  R(strike, c, 'releaseGlow', 0, 8, 0.05, 'shock & pillar glow');
  R(strike, c, 'pillarHeight', 0.5, 12, 0.05, 'pillar height (m)');
  R(strike, c, 'pillarWidth', 0.05, 3, 0.01, 'pillar radius (m)');
  R(strike, c, 'pillarLife', 0.05, 2, 0.01, 'pillar fades over (s)');
  R(strike, c, 'burstReach', 0, 2, 0.01, 'shell grows to (× radius)');
  R(strike, c, 'burstIntensity', 0, 3, 0.01, 'shell brightness');
  R(strike, c, 'burstLife', 0.05, 3, 0.01, 'shell lives (s)');
  R(strike, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(strike, c, 'burstFresnel', 0, 6, 0.05, 'shell rim');
  R(strike, c, 'burstSquash', 0.05, 1.5, 0.01, 'shell squash');
  R(strike, c, 'decalLife', 0.05, 3, 0.01, 'decals last (s)');
  R(strike, c, 'shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave decal width');
  R(strike, c, 'shockwaveIntensity', 0, 3, 0.01, 'shockwave decal brightness');
  R(strike, c, 'rippleIntensity', 0, 3, 0.01, 'ripple decal brightness');
  color(strike, c, 'colorBurstA', 'shell inner');
  color(strike, c, 'colorBurstB', 'shell mid');
  color(strike, c, 'colorBurstC', 'shell outer');
  R(strike, c, 'impactShake', 0, 1, 0.01, 'camera knock');
  R(strike, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(strike, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(strike, c, 'impactFlash', 0, 1, 0.01, 'flash');

  const lens = sub(folder, '8 · The lens');
  R(lens, c, 'lensStrength', 0, 3, 0.01, 'debt swirl');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'strike pressure ring');

  return folder;
}
