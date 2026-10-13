import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { createChainBoltMaterial } from '../../materials/collective/ChainArcBoltMaterial.js';
import { ChainBoltRibbon, MAX_BRANCHES, MAX_FORK, MAX_GROUND_FORKS, MAX_MAIN } from '../../assets/collective/ChainArcGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'chain';

/** Leaps after the first strike. The editor's `maxJumps` slider clamps to this. */
const MAX_JUMPS = 8;
/** Slot 0 is the bolt out of the hand; every leap takes the next one. */
const MAX_BOLTS = 1 + MAX_JUMPS;

/** What the cast is doing right now. */
const Mode = Object.freeze({
  /** The leader is running down the aimed line looking for something to hit. */
  LEADER: 0,
  /** It found a body and is leaping from body to body. */
  CHAIN: 1,
  /** It ran out of line, or out of bodies, and the strikes are just hanging. */
  SPENT: 2
});

const _emit = {};
const _pos = new Vector3();
const _from = new Vector3();
const _to = new Vector3();
const _dir = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);

/** Shape controls handed to `ChainBoltRibbon#build`, reused. */
const _shape = {
  segments: 30,
  jag: 0.12,
  jagMax: 1.4,
  kink: 0.3,
  branches: 4,
  branchLength: 0.3,
  branchSegments: 10,
  branchSpread: 0.8,
  branchJag: 0.2,
  branchWidth: 0.6,
  branchBright: 0.6,
  groundForks: 0,
  groundY: 0.03,
  randomness: 1
};

/**
 * CHAIN — Chain Arc.
 *
 * A line cast that does not stop at the end of its line. A **leader** runs
 * down the aimed direction; the moment a body is within `captureRadius` of its
 * head the leader commits, the bolt out of the caster's hand snaps onto that
 * body and kills it, and after `jumpDelay` the arc leaps from that body to the
 * nearest live one within `jumpRange` — and again, up to `maxJumps` times. A
 * leader that reaches the end of the line without finding anyone **grounds**
 * there instead, forking out across the floor.
 *
 * Layers:
 *
 *   1. **BOLTS** — every strike is its own camera-facing ribbon
 *      (`ChainArcGeometry` + `ChainArcBoltMaterial`): a Brownian-bridge channel
 *      with forks, a hard white core inside a violet-edged glow. The shape is
 *      re-rolled `crackleRate` times a second into pre-allocated buffers, so a
 *      hanging bolt keeps *crackling* rather than freezing into a neon tube.
 *      Each strike races from source to target, punches bright and wide the
 *      instant it lands, settles to `lingerLevel`, and finally tears into
 *      pieces as it goes.
 *   2. **SPARKS** — STREAK particles thrown off every strike, and spat off the
 *      ends of hanging bolts while they last.
 *   3. **MOTES** — soft additive ionised glow trailing the leader and puffing
 *      off every strike.
 *   4. **GROUND** — an ARC burn under every struck body; when the bolt grounds,
 *      a larger burn, a STORM shell and extra forks skating across the floor.
 *   5. **FEEDBACK** — a guttering light that rides the newest strike, with a
 *      punch, a flash and a kick of shake on every hit.
 *
 * ## Decisions
 *
 * `handlesOwnHits` is true: the default line capsule would fell everything
 * the leader passes, including the bodies the chain is about to pick off one
 * by one on its own clock. Bodies are thrown along the *leap* — from the
 * previous strike to this one — so a chain reads as a direction of travel
 * even when it doubles back on itself.
 *
 * The phase machine is kept honest by overriding `advance`: while the chain is
 * leaping the front is held where it is, and the frame the last leap lands (or
 * the leader runs out of line) is the frame `advance` reports the end — so
 * `onImpact` means "the chain is done" in both cases and the linger/fade timing
 * is shared.
 *
 * Like the originals, a bolt record stores only what was *decided* — who it
 * left, who it hit, when — never a width, colour or brightness. Those are all
 * resolved from `settings.chain` every frame, so every slider is live on a
 * bolt that is already hanging in the air.
 */
export class ChainArcAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the bolts ---- */
    this.bolts = [];
    for (let i = 0; i < MAX_BOLTS; i++) {
      const ribbon = new ChainBoltRibbon();
      const material = createChainBoltMaterial();
      const mesh = new Mesh(ribbon.geometry, material);
      mesh.name = `ChainBolt${i}`;
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      mesh.renderOrder = 14;
      mesh.visible = false;
      this.group.add(mesh);

      this.bolts.push({
        mesh,
        ribbon,
        material,
        /** Envelope handed to the material each frame. */
        state: { grow: 0, level: 0, brk: 0, head: 0, widthScale: 1, seed: Math.random() * 10 },
        active: false,
        /** The leader: still running, not yet a strike. */
        leader: false,
        grounded: false,
        age: 0,
        reroll: 0,
        /** Who it leaves from — null is the caster's hand. */
        fromDummy: null,
        /** Who it struck — null for the ground. */
        toDummy: null,
        /** Where it struck, at the moment it struck. */
        fromPoint: new Vector3(),
        toPoint: new Vector3()
      });
    }

    /** Bodies this cast has already struck, so a survivor is never hit twice. */
    this._struck = [];
    /** Reused by `DummyField#findTargets`, so polling allocates nothing. */
    this._targets = [];
    this._handPoint = new Vector3();

    // Per-cast state, reset in `onSpawn`.
    this._mode = Mode.SPENT;
    this._reported = false;
    this._jumps = 0;
    this._jumpTimer = 0;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 2: sparks ---- */
    this.sparks = particles.get('chain.sparks', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uSizeIn.value = 0.01;
    this.sparks.uniforms.uFadeIn.value = 0.01;
    this.sparks.uniforms.uFadeOut.value = 0.5;

    /* ---- layer 3: motes ---- */
    this.motes = particles.get('chain.motes', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.4
    });
    this.motes.uniforms.uDrag.value = 1.6;
    this.motes.uniforms.uEndSize.value = 1.8;
    this.motes.uniforms.uSizeIn.value = 0.04;
    this.motes.uniforms.uFadeIn.value = 0.04;
    this.motes.uniforms.uFadeOut.value = 0.5;

    this.moteEmitter = new RateEmitter();
    this.sparkEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let n = 0;
    for (let i = 0; i < MAX_BOLTS; i++) if (this.bolts[i].active) n++;
    return n;
  }

  /** The web hangs for `lifetime` after the last strike lands. */
  get impactDuration() {
    return Math.max(0.05, settings.chain.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.05, settings.chain.fadeTime);
  }

  /** Lightning light does not shimmer — it gutters, frame to frame. */
  lightShimmer() {
    const k = settings.chain.lightFlicker;
    return 1 - k * 0.5 + k * Math.random();
  }

  /**
   * Hold the front while the chain is leaping.
   *
   * The base advances the leader down the line, which is exactly what the
   * LEADER mode wants. Once a body is caught the front stops — the cast is no
   * longer *on* the line — and the end is reported the frame after the chain
   * is SPENT, whether that was the last leap or the leader grounding.
   */
  advance(dt) {
    if (this._mode === Mode.LEADER) {
      // Run the line, but never report the end from here: `onTravel` decides
      // whether the head caught someone on its last step before it grounds.
      super.advance(dt);
      return false;
    }
    if (this._mode === Mode.SPENT && !this._reported) {
      this._reported = true;
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.chain;
    const g = settings.global;

    this._mode = Mode.LEADER;
    this._reported = false;
    this._jumps = 0;
    this._jumpTimer = 0;
    this._struck.length = 0;
    this._targets.length = 0;
    this.moteEmitter.reset();
    this.sparkEmitter.reset();

    for (let i = 0; i < MAX_BOLTS; i++) this._release(this.bolts[i]);

    this._hand(this._handPoint);

    // The leader leaves the hand at once — it is a bolt from the first frame.
    const leader = this.bolts[0];
    leader.active = true;
    leader.leader = true;
    leader.age = 0;
    leader.reroll = 0;
    leader.fromDummy = null;
    leader.toDummy = null;
    leader.fromPoint.copy(this._handPoint);
    leader.toPoint.copy(this._handPoint);
    leader.state.seed = Math.random() * 10;
    leader.mesh.visible = true;

    // A crack of static off the hand: the cast itself.
    this._syncParticles();
    this._sparkBurst(this._handPoint, 0.35, Math.round(c.sparkCount * 0.35 * g.particleCount), _dir.copy(this.direction));
    this.ctx.shake.add(c.castShake * g.cameraShake, 6, 30);
  }

  /** Where the bolt leaves the caster, world space. */
  _hand(out) {
    const c = settings.chain;
    out.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    out.y = c.handHeight;
    return out;
  }

  /**
   * Where a strike on `dummy` lands right now.
   *
   * `point` is where it was standing when it was struck; `latch` blends that
   * toward where its body actually is now, so a lingering bolt follows the
   * corpse it threw instead of hanging onto empty air.
   */
  _strikePoint(dummy, point, out) {
    out.copy(point);
    const latch = saturate(settings.chain.latch);
    if (dummy && latch > 0 && !dummy.alive) {
      const body = dummy.bodyPoint(_body);
      if (body) out.lerp(body, latch);
    }
    return out;
  }

  /** The fixed point on a standing body a strike aims at. */
  _aimAt(dummy, out) {
    return out.set(dummy.position.x, settings.dummies.height * settings.chain.strikeHeight, dummy.position.z);
  }

  _release(bolt) {
    bolt.active = false;
    bolt.leader = false;
    bolt.grounded = false;
    bolt.fromDummy = null;
    bolt.toDummy = null;
    bolt.mesh.visible = false;
    bolt.ribbon.clear();
  }

  /* ------------------------------------------------------------------ */
  /* The chain                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Turn bolt `index` into a strike from (`fromDummy` | the hand) onto `dummy`
   * — or, with `dummy` null, onto the floor at `groundAt` — and land it.
   */
  _strike(index, fromDummy, fromPoint, dummy, groundAt) {
    const c = settings.chain;
    const g = settings.global;
    const time = frame.uTime.value;

    const bolt = this.bolts[index];
    bolt.active = true;
    bolt.leader = false;
    bolt.grounded = !dummy;
    bolt.age = 0;
    bolt.reroll = 0;
    bolt.fromDummy = fromDummy;
    bolt.toDummy = dummy;
    bolt.fromPoint.copy(fromPoint);
    if (dummy) this._aimAt(dummy, bolt.toPoint);
    else bolt.toPoint.copy(groundAt);
    bolt.state.seed = Math.random() * 10;
    bolt.mesh.visible = true;
    this._rebuild(bolt);

    /* --- the blow: along the leap, flat --- */
    let dx = bolt.toPoint.x - bolt.fromPoint.x;
    let dz = bolt.toPoint.z - bolt.fromPoint.z;
    const flat = Math.hypot(dx, dz);
    if (flat > 1e-4) {
      dx /= flat;
      dz /= flat;
    } else {
      dx = this.direction.x;
      dz = this.direction.z;
    }

    if (dummy) {
      this._struck.push(dummy);
      if (settings.dummies.hit.enabled) dummy.kill(dx, dz, c.hit);
    }

    /* --- the burn under it --- */
    _pos.set(bolt.toPoint.x, 0, bolt.toPoint.z);
    this.ctx.decals.spawn(DecalType.ARC, _pos, {
      radius: (dummy ? c.arcRadius : c.groundArcRadius) * g.explosionIntensity,
      life: c.arcLife,
      width: c.arcWidth,
      intensity: c.arcIntensity,
      colorA: getColor(c.colorArcA),
      colorB: getColor(c.colorArcB),
      height: 0.018
    });

    /* --- sparks and a puff of glow where it lands --- */
    _dir.set(dx, dummy ? 0.6 : 1.2, dz).normalize();
    const sparks = dummy ? c.sparkCount : c.groundSparks;
    this._sparkBurst(bolt.toPoint, dummy ? 0.25 : 0.4, Math.round(sparks * g.particleCount), _dir);

    _emit.position = bolt.toPoint;
    _emit.radius = 0.35;
    _emit.direction = _up;
    _emit.speed = c.moteSpeed * 1.8;
    _emit.speedVariance = 0.7;
    _emit.spread = 1.0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.22;
    _emit.sizeVariance = 0.6;
    _emit.life = c.moteLife * 1.4;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
    this.motes.emit(Math.round(c.strikeMotes * g.particleCount), _emit);

    /* --- the beat --- */
    this.position.copy(bolt.toPoint);
    if (dummy) {
      this.lightBoost = Math.max(this.lightBoost, c.strikeLight * g.explosionIntensity);
      this.ctx.shake.add(c.strikeShake * g.explosionIntensity * g.cameraShake, 5, 28);
      this.ctx.flash.trigger(getColor(c.colorFlash), c.strikeFlash * g.explosionIntensity);
    } else {
      this._groundFx(bolt.toPoint);
    }
  }

  /** The STORM shell and the extra kick when the bolt hits the floor. */
  _groundFx(point) {
    const c = settings.chain;
    const g = settings.global;

    _pos.set(point.x, 0.35, point.z);
    this.ctx.bursts.spawn(BurstMode.STORM, _pos, {
      radius: c.groundBurst * 0.15,
      endRadius: c.groundBurst * g.explosionIntensity,
      life: c.groundBurstLife,
      intensity: c.groundBurstIntensity,
      opacity: 0.55,
      displace: 0.35,
      squash: 0.55,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    this.lightBoost = Math.max(this.lightBoost, c.strikeLight * 1.3 * g.explosionIntensity);
    this.ctx.shake.add(c.groundShake * g.explosionIntensity * g.cameraShake, 3.2, 24);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.groundFlash * g.explosionIntensity);
  }

  _sparkBurst(point, radius, count, direction) {
    const c = settings.chain;
    _emit.position = point;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.05;
    _emit.sizeVariance = 0.6;
    _emit.life = c.sparkLife;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.sparks.emit(count, _emit);
  }

  /** Is this body already one of ours. */
  _isStruck(dummy) {
    for (let i = 0; i < this._struck.length; i++) if (this._struck[i] === dummy) return true;
    return false;
  }

  /** The nearest live body within `radius` of (x, z) this cast has not hit. */
  _nearest(x, z, radius) {
    const found = this.ctx.dummies?.findTargets?.(x, z, radius, this._targets);
    if (!found) return null;
    for (let i = 0; i < found.length; i++) if (!this._isStruck(found[i])) return found[i];
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  /** Re-roll a bolt's shape between its live endpoints. */
  _rebuild(bolt) {
    const c = settings.chain;
    const g = settings.global;

    if (bolt.fromDummy) this._strikePoint(bolt.fromDummy, bolt.fromPoint, _from);
    else _from.copy(bolt.fromPoint);
    if (bolt.toDummy) this._strikePoint(bolt.toDummy, bolt.toPoint, _to);
    else _to.copy(bolt.toPoint);

    _shape.segments = Math.min(MAX_MAIN, c.segments);
    _shape.jag = c.jaggedness * g.noiseStrength;
    _shape.jagMax = c.jagMax;
    _shape.kink = c.kink * g.noiseStrength;
    // The leader is thin and searching: half the forks, none on the floor.
    _shape.branches = Math.min(MAX_BRANCHES, bolt.leader ? Math.ceil(c.branches * 0.5) : c.branches);
    _shape.branchLength = c.branchLength;
    _shape.branchSegments = Math.min(MAX_FORK, c.branchSegments);
    _shape.branchSpread = c.branchSpread;
    _shape.branchJag = c.branchJag * g.noiseStrength;
    _shape.branchWidth = c.branchWidth;
    _shape.branchBright = c.branchBright;
    _shape.groundForks = bolt.grounded ? Math.min(MAX_GROUND_FORKS, c.groundForks) : 0;
    _shape.groundY = 0.03;
    _shape.randomness = g.randomness;

    bolt.ribbon.build(_from, _to, _shape);
  }

  /**
   * Drive one bolt's envelope.
   * @param {number} fade 0..1 — the whole cast's fade-out multiplier
   */
  _updateBolt(bolt, dt, fade) {
    const c = settings.chain;
    bolt.age += dt;

    // Crackle: the shape is re-rolled on its own clock. The leader is rebuilt
    // every frame, because its head moves metres per frame.
    bolt.reroll -= dt;
    if (bolt.leader) {
      this._rebuild(bolt);
    } else if (bolt.reroll <= 0) {
      bolt.reroll += 1 / Math.max(1, c.crackleRate * settings.global.animationSpeed);
      if (bolt.reroll < 0) bolt.reroll = 0;
      this._rebuild(bolt);
    }

    const s = bolt.state;
    if (bolt.leader) {
      // Searching: drawn whole, dimmer, no punch.
      s.grow = 1.31;
      s.level = 0.75 * fade;
      s.brk = 0;
      s.head = 0.5;
      s.widthScale = 0.7;
    } else {
      const growTime = Math.max(0.005, c.growTime);
      const grown = saturate(bolt.age / growTime);
      const punch = Math.exp(-c.decay * bolt.age);
      // Hangs on its own for `boltLife`, then goes over `boltFade`.
      const life = 1 - saturate((bolt.age - c.boltLife) / Math.max(0.02, c.boltFade));
      const alive = Math.min(life, fade);

      s.grow = Easing.outQuad(grown) * 1.31;
      s.level = (lerp(c.lingerLevel, 1, punch) + c.strikePunch * punch) * alive;
      s.brk = saturate(c.crackle * (1 - alive) * 1.1);
      s.head = 1 - grown;
      s.widthScale = 1 + (c.punchWidth - 1) * punch;

      if (life <= 0) {
        this._release(bolt);
        return;
      }
    }
    bolt.material.userData.sync(s);
  }

  /** Sparks spat off the ends of the hanging bolts. */
  _lingerFx(dt, strength) {
    const c = settings.chain;
    const g = settings.global;
    const count = Math.round(this.sparkEmitter.tick(dt, c.lingerSparkRate * strength) * g.particleCount);
    for (let n = 0; n < count; n++) {
      const bolt = this.bolts[(Math.random() * MAX_BOLTS) | 0];
      if (!bolt.active || bolt.leader) continue;
      if (bolt.toDummy) this._strikePoint(bolt.toDummy, bolt.toPoint, _pos);
      else _pos.copy(bolt.toPoint);
      _dir.set(Math.random() - 0.5, 0.8, Math.random() - 0.5).normalize();
      this._sparkBurst(_pos, 0.15, 1, _dir);
    }
  }

  _syncParticles() {
    const c = settings.chain;
    const g = settings.global;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    this.sparks.uniforms.uGravity.value.set(0, c.sparkGravity, 0);
    this.sparks.uniforms.uDrag.value = c.sparkDrag;
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
    this.sparks.uniforms.uSizeScale.value = (c.sparkSize / 0.05) * g.particleSize;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = c.sparkGlow * g.glow;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uGravity.value.set(0, c.moteRise, 0);
    this.motes.uniforms.uSizeScale.value = (c.moteSize / 0.22) * g.particleSize;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = c.moteGlow * g.glow;
    this.motes.uniforms.uTurbulence.value = c.moteTurbulence * g.turbulence;
  }

  /** The chain's own clock: wait out the delay, then leap or stop. */
  _stepChain(dt) {
    const c = settings.chain;
    this._jumpTimer += dt;
    if (this._jumpTimer < Math.max(0, c.jumpDelay)) return;

    const last = this.bolts[this._jumps];
    const limit = Math.min(MAX_JUMPS, Math.max(0, Math.round(c.maxJumps)));
    // Search from where the last body *stood*, not where it is flying.
    const next = this._jumps < limit ? this._nearest(last.toPoint.x, last.toPoint.z, c.jumpRange) : null;

    if (!next) {
      this._mode = Mode.SPENT;
      return;
    }

    this._jumps++;
    this._jumpTimer = 0;
    this._strikePoint(last.toDummy, last.toPoint, _from);
    this._strike(this._jumps, last.toDummy, _from, next, null);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.chain;
    const g = settings.global;
    this._syncParticles();

    if (this._mode === Mode.LEADER) {
      const leader = this.bolts[0];
      // The head runs at leader height along the line.
      this._hand(leader.fromPoint);
      leader.toPoint.copy(this.position).setY(c.leaderHeight);
      this.position.y = c.leaderHeight;

      // Did the head come within reach of anyone?
      const caught = this._nearest(this.position.x, this.position.z, c.captureRadius);
      if (caught) {
        this._mode = Mode.CHAIN;
        this._jumpTimer = 0;
        this._strike(0, null, leader.fromPoint, caught, null);
      } else {
        const motes = Math.round(this.moteEmitter.tick(dt, c.moteRate) * g.particleCount);
        if (motes > 0) {
          _emit.position = this.position;
          _emit.radius = 0.25;
          _emit.direction = this.direction;
          _emit.speed = c.moteSpeed;
          _emit.speedVariance = 0.8;
          _emit.spread = 1.0;
          _emit.inherit = null;
          _emit.anchor = null;
          _emit.size = 0.22;
          _emit.sizeVariance = 0.5;
          _emit.life = c.moteLife;
          _emit.lifeVariance = 0.4;
          _emit.spin = 0;
          _emit.tint = null;
          _emit.time = frame.uTime.value;
          this.motes.emit(motes, _emit);
        }

        // Out of line with nobody in reach: ground it where the line ends.
        if (this.u >= 1) {
          this._mode = Mode.SPENT;
          this.pointAt(1, _to).setY(0.03);
          this._strike(0, null, this._hand(_from), null, _to);
        }
      }
    } else if (this._mode === Mode.CHAIN) {
      this._stepChain(dt);
    }

    for (let i = 0; i < MAX_BOLTS; i++) {
      const bolt = this.bolts[i];
      if (bolt.active) this._updateBolt(bolt, dt, 1);
    }
    this._lingerFx(dt, this._mode === Mode.LEADER ? 0 : 1);
  }

  /** The chain is done — grounded or out of bodies. The hang starts now. */
  onImpact() {
    this._mode = Mode.SPENT;
  }

  onFade(dt, t) {
    this._syncParticles();
    // The impact phase is the hang; the fade phase takes everything down.
    const fade = t <= 1 ? 1 : 1 - Easing.inQuad(t - 1);

    for (let i = 0; i < MAX_BOLTS; i++) {
      const bolt = this.bolts[i];
      if (bolt.active) this._updateBolt(bolt, dt, fade);
    }
    this._lingerFx(dt, fade);

    // The light stays with the newest strike, wherever its body has got to.
    const newest = this.bolts[this._jumps];
    if (newest.active && newest.toDummy) this._strikePoint(newest.toDummy, newest.toPoint, this.position);
  }

  onDestroy() {
    for (let i = 0; i < MAX_BOLTS; i++) this._release(this.bolts[i]);
    this._struck.length = 0;
    this._targets.length = 0;
    this._mode = Mode.SPENT;
  }

  dispose() {
    for (const bolt of this.bolts) {
      bolt.ribbon.dispose();
      bolt.material.dispose();
    }
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const R = Editor.range;
  const folder = gui.addFolder('⚡  Chain Arc');

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 120, 0.5, 'leader speed (m/s)');
  R(cast, c, 'lifetime', 0.05, 6, 0.05, 'web hangs for');
  R(cast, c, 'fadeTime', 0.05, 4, 0.05, 'crackle-out time');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handForward', -1, 2, 0.01, 'hand forward (m)');
  R(cast, c, 'handSide', -1, 1, 0.01, 'hand side (m)');
  R(cast, c, 'handHeight', 0, 3, 0.01, 'hand height (m)');
  R(cast, c, 'leaderHeight', 0.1, 3, 0.01, 'leader height (m)');

  const chain = folder.addFolder('The chain');
  R(chain, c, 'captureRadius', 0.1, 5, 0.05, 'capture radius (m)');
  R(chain, c, 'jumpRange', 0.5, 20, 0.1, 'jump range (m)');
  R(chain, c, 'maxJumps', 0, MAX_JUMPS, 1, 'max jumps');
  R(chain, c, 'jumpDelay', 0, 1, 0.005, 'delay per jump (s)');
  R(chain, c, 'strikeHeight', 0, 1.2, 0.01, 'strike height (× body)');
  R(chain, c, 'latch', 0, 1, 0.01, 'follow the body it threw');
  R(chain, c.hit, 'impulse', 0, 20, 0.1, 'throw impulse');
  R(chain, c.hit, 'lift', 0, 20, 0.1, 'throw lift');
  R(chain, c.hit, 'spin', 0, 5, 0.05, 'throw spin');

  /* ---- layer 1 ---- */
  const bolts = folder.addFolder('1 · Bolts');
  const shape = bolts.addFolder('Shape');
  R(shape, c, 'segments', 3, MAX_MAIN, 1, 'points on the channel');
  R(shape, c, 'jaggedness', 0, 0.5, 0.005, 'wander (× length)');
  R(shape, c, 'jagMax', 0.05, 5, 0.05, 'wander cap (m)');
  R(shape, c, 'kink', 0, 2, 0.01, 'zig-zag');
  R(shape, c, 'branches', 0, MAX_BRANCHES, 1, 'forks');
  R(shape, c, 'branchLength', 0.02, 1, 0.01, 'fork length (× bolt)');
  R(shape, c, 'branchSegments', 3, MAX_FORK, 1, 'points on a fork');
  R(shape, c, 'branchSpread', 0, 1.6, 0.01, 'fork angle (rad)');
  R(shape, c, 'branchJag', 0, 1, 0.01, 'fork wander');
  R(shape, c, 'groundForks', 0, MAX_GROUND_FORKS, 1, 'forks on the floor when grounding');
  R(shape, c, 'crackleRate', 1, 60, 0.5, 're-strikes per second');

  const look = bolts.addFolder('Ribbon');
  R(look, c, 'coreWidth', 0.002, 0.3, 0.001, 'core half-width (m)');
  R(look, c, 'glowWidth', 0.02, 2, 0.01, 'glow half-width (m)');
  R(look, c, 'glowFalloff', 0.3, 8, 0.05, 'glow falloff');
  R(look, c, 'branchWidth', 0.05, 1.5, 0.01, 'fork width');
  R(look, c, 'branchBright', 0, 1.5, 0.01, 'fork brightness');
  R(look, c, 'intensity', 0, 15, 0.05, 'intensity');
  R(look, c, 'opacity', 0, 1, 0.01, 'opacity');
  R(look, c, 'crawl', 0, 1.5, 0.01, 'plasma crawl');
  R(look, c, 'crawlScale', 1, 60, 0.5, 'crawl scale');
  R(look, c, 'crawlSpeed', 0, 40, 0.5, 'crawl speed');
  R(look, c, 'flicker', 0, 1, 0.01, 'strobe');
  R(look, c, 'flickerRate', 1, 60, 0.5, 'strobe rate');
  look.addColor(c, 'colorCore').name('core');
  look.addColor(c, 'colorGlow').name('glow');
  look.addColor(c, 'colorEdge').name('edge');

  const env = bolts.addFolder('Strike envelope');
  R(env, c, 'growTime', 0.005, 0.5, 0.005, 'race time (s)');
  R(env, c, 'headGlow', 0, 6, 0.05, 'head brightness');
  R(env, c, 'headLength', 0.01, 0.6, 0.01, 'head length');
  R(env, c, 'strikePunch', 0, 6, 0.05, 'landing punch');
  R(env, c, 'punchWidth', 1, 4, 0.05, 'landing width');
  R(env, c, 'decay', 0.5, 30, 0.1, 'punch decay (/s)');
  R(env, c, 'lingerLevel', 0, 1.5, 0.01, 'hang brightness');
  R(env, c, 'boltLife', 0.05, 5, 0.05, 'hangs for (s)');
  R(env, c, 'boltFade', 0.02, 3, 0.01, 'goes over (s)');
  R(env, c, 'crackle', 0, 1, 0.01, 'tear apart on fade');
  R(env, c, 'crackleScale', 2, 60, 1, 'pieces per bolt');

  /* ---- layer 2 ---- */
  const sparks = folder.addFolder('2 · Sparks');
  R(sparks, c, 'sparkCount', 0, 200, 1, 'per strike');
  R(sparks, c, 'lingerSparkRate', 0, 200, 1, 'off hanging bolts (/s)');
  R(sparks, c, 'sparkSpeed', 0, 30, 0.1, 'speed');
  R(sparks, c, 'sparkSize', 0.005, 0.3, 0.005, 'size');
  R(sparks, c, 'sparkLife', 0.05, 2, 0.01, 'lifetime');
  R(sparks, c, 'sparkGravity', -30, 5, 0.1, 'gravity');
  R(sparks, c, 'sparkDrag', 0, 8, 0.05, 'drag');
  R(sparks, c, 'sparkStretch', 0, 0.4, 0.005, 'stretch');
  R(sparks, c, 'sparkGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(sparks, c, 'colorSpark', 'Colour over life');

  /* ---- layer 3 ---- */
  const motes = folder.addFolder('3 · Motes');
  R(motes, c, 'moteRate', 0, 500, 1, 'off the leader (/s)');
  R(motes, c, 'strikeMotes', 0, 200, 1, 'per strike');
  R(motes, c, 'moteSize', 0.01, 1, 0.005, 'size');
  R(motes, c, 'moteLife', 0.05, 2, 0.01, 'lifetime');
  R(motes, c, 'moteSpeed', 0, 8, 0.05, 'speed');
  R(motes, c, 'moteRise', -4, 6, 0.05, 'rise');
  R(motes, c, 'moteGlow', 0, 8, 0.05, 'glow');
  R(motes, c, 'moteTurbulence', 0, 5, 0.05, 'turbulence');
  Editor.gradient(motes, c, 'colorMote', 'Colour over life');

  /* ---- layer 4 ---- */
  const ground = folder.addFolder('4 · Ground');
  R(ground, c, 'arcRadius', 0.1, 6, 0.05, 'burn under a body (m)');
  R(ground, c, 'groundArcRadius', 0.1, 8, 0.05, 'burn where it grounds (m)');
  R(ground, c, 'arcLife', 0.1, 6, 0.05, 'burn lifetime');
  R(ground, c, 'arcWidth', 0.01, 0.4, 0.005, 'burn line width');
  R(ground, c, 'arcIntensity', 0, 4, 0.05, 'burn intensity');
  ground.addColor(c, 'colorArcA').name('burn hot');
  ground.addColor(c, 'colorArcB').name('burn cool');
  R(ground, c, 'groundBurst', 0.2, 10, 0.05, 'storm shell (m)');
  R(ground, c, 'groundBurstLife', 0.05, 2, 0.01, 'shell lifetime');
  R(ground, c, 'groundBurstIntensity', 0, 5, 0.05, 'shell intensity');
  R(ground, c, 'groundSparks', 0, 400, 1, 'sparks when grounding');
  ground.addColor(c, 'colorBurstA').name('shell core');
  ground.addColor(c, 'colorBurstB').name('shell body');
  ground.addColor(c, 'colorBurstC').name('shell edge');

  /* ---- layer 5 ---- */
  const fb = folder.addFolder('5 · Light & feedback');
  fb.addColor(c, 'lightColor').name('light colour');
  R(fb, c, 'lightIntensity', 0, 30, 0.1, 'light intensity');
  R(fb, c, 'lightRadius', 0.5, 30, 0.1, 'light radius');
  R(fb, c, 'lightFlicker', 0, 1, 0.01, 'light gutter');
  R(fb, c, 'strikeLight', 0, 60, 0.5, 'light punch per strike');
  R(fb, c, 'strikeShake', 0, 1, 0.01, 'shake per strike');
  R(fb, c, 'strikeFlash', 0, 1, 0.01, 'flash per strike');
  R(fb, c, 'groundShake', 0, 1, 0.01, 'shake when grounding');
  R(fb, c, 'groundFlash', 0, 1, 0.01, 'flash when grounding');
  R(fb, c, 'castShake', 0, 0.5, 0.005, 'shake on cast');
  fb.addColor(c, 'colorFlash').name('flash colour');
}
