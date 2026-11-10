import { InstancedBufferAttribute, InstancedMesh, Mesh, Object3D, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createRelayTetherGeometry,
  createRelayQuadGeometry,
  createRelayFloorGeometry,
  createRelayProngGeometry,
  PRONG_WIDTH,
  MAX_TETHER_POINTS
} from '../../assets/atlas/ArcRelayGeometry.js';
import {
  createRelayTetherMaterial,
  createRelayCoreMaterial,
  createRelaySigilMaterial,
  createRelayWarpMaterial,
  createRelayProngMaterial
} from '../../materials/atlas/ArcRelayMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'relay';

/** Relays in one lattice. The editor's `maxNodes` slider clamps to this. */
const MAX_NODES = 8;
/**
 * Tether slots. Every relay is fed by exactly one tether (from the hand for the
 * first, from its parent relay for the rest), so a lattice is a tree and the
 * slot of a relay's feed is the relay's own index. Slot 0 doubles as the
 * seeking leader and as the grounding strike.
 */
const MAX_TETHERS = MAX_NODES;
/** New relays a single relay may claim per wave. */
const MAX_BRANCH = 3;
/** Burn marks laid along one link when it is claimed. */
const MAX_SCARS_PER_LINK = 10;
/** Conductor prongs in one relay cage. The editor's `prongCount` clamps to this. */
const MAX_PRONGS = 7;
const TAU = Math.PI * 2;

/** What the lattice is doing right now. */
const Mode = Object.freeze({
  /** The leader is running down the aimed line looking for a first body. */
  SEEK: 0,
  /** Relays are claiming the next bodies, wave by wave. */
  GROW: 1,
  /** The lattice is full (or out of bodies) and straining. */
  OVERLOAD: 2,
  /** Everything has gone off at once; the wreckage is hanging. */
  DISCHARGED: 3,
  /** Nobody on the line: the leader went to ground. */
  GROUNDED: 4
});

const _emit = {};
const _pos = new Vector3();
const _from = new Vector3();
const _to = new Vector3();
const _dir = new Vector3();
const _toCam = new Vector3();
const _up = new Vector3(0, 1, 0);
const _scar = new Vector3();
const _prong = new Object3D();

/**
 * RELAY — Arc Relay.
 *
 * Chain Arc *strikes* bodies one after another and throws each the instant it
 * lands. Arc Relay does the opposite: it **keeps** them. The first body the
 * leader reaches is not killed — it becomes a **relay**, held on its feet with
 * an overload node blazing over it and a seal burning in the floor under it.
 * From there the network **branches**: every `linkDelay`, each relay of the
 * newest wave reaches for up to `branchFactor` of the nearest unclaimed bodies
 * within `linkRange`, and each of those becomes a relay in turn, linked to its
 * parent by a standing tether. When the lattice reaches `maxNodes` (or there
 * is nobody left in reach) it **overloads** — every core swells, every tether
 * widens and runs white, the floor seals throb, the camera rumbles — and after
 * `overloadTime` the whole lattice **discharges at once**: every relay dies on
 * the same frame, in a STORM shell and a shockwave of its own, the tethers
 * snap into pieces and the bodies are thrown outward along the branches that
 * claimed them. A leader that reaches the end of its line without finding
 * anyone grounds there instead, killing anything within `groundRadius`.
 *
 * ## Layers
 *
 *   1. **TETHERS** (`createRelayTetherMaterial`) — two braided strands of
 *      current per link, placed *entirely in the vertex stage* from parameter
 *      space (`ArcRelayGeometry`): the buffers are written once at
 *      construction and a re-strike is one uniform. Packets of current ride
 *      each tether toward the relay it feeds.
 *   2. **RELAY CORES** (`createRelayCoreMaterial`) — a polar-coordinate
 *      billboard over each body: boiling plasma ball, crackling filaments
 *      re-struck on a quantised clock, a broken containment ring that spins,
 *      and a hot shell that races out of it on the discharge.
 *   2b. **CONDUCTOR CAGE** (the hero solid, `createRelayProngGeometry` +
 *      `createRelayProngMaterial`) — the claim tears a ring of lit,
 *      shadow-casting steel lightning rods (insulator stacks, hooked points)
 *      up out of the floor round the body, staggered, overshooting, leaning
 *      in so their points crown the head. Held, they hum and their insulator
 *      grooves glow; under overload the heat creeps from the points down the
 *      whole rod and the cage opens like a flower; on the discharge the rods
 *      are blown outward white-hot, then topple, cool through the ramp to the
 *      deep tone and sink back into the floor — the linger's own motion. One
 *      InstancedMesh on `LAYER.WORLD`; every angle and length is resolved
 *      from `settings.relay` each frame.
 *   3. **GROUND SIGILS** (`createRelaySigilMaterial`) — a filled, charged
 *      plate under each body: a deep floor-darkening disc lit by a plasma
 *      field and crawling veins, with the seal's rings on top; drawn in as
 *      it charges, throbbing under overload, wiped outward by the discharge;
 *      plus an ARC burn when it is claimed.
 *   3b. **CONDUCTION SCARS** — the floor remembers the lattice: when a link
 *      races to a new relay it burns a dotted line of ARC + SCORCH marks along
 *      its ground track (one per `scarSpacing` metres, at most ten a link),
 *      and every relay leaves a dark scorch on the discharge. They outlive
 *      the cast, so the shape of the network stays written on the floor.
 *   4. **SPARKS + MOTES** — STREAK sparks on every claim, spat off live relays
 *      and thrown in a ring by the discharge; SOFT ionised motes off the
 *      leader and drifting up out of every relay.
 *   5. **DISCHARGE** — per relay: STORM shell, SHOCKWAVE decal, spark ring; once
 *      for the lattice: screen flash, a hard shake, a big light punch.
 *   6. **HEAT WARP** (`createRelayWarpMaterial`, LAYER.DISTORTION) — a radial
 *      strain round every relay that climbs through the overload and spikes on
 *      the discharge.
 *
 * ## Decisions
 *
 * `handlesOwnHits` is true: the default capsule would kill the bodies the
 * lattice is about to *hold*. Nobody dies until the discharge, and then all of
 * them die together — that simultaneity is the whole read of the ability, so
 * it is one loop on one frame, not a staggered cascade.
 *
 * The front is held while the lattice works (the `advance` override, as in
 * Chain Arc): `onImpact` fires the frame the lattice discharges or grounds,
 * so the base class's impact/fade phases are the linger and the go-out.
 *
 * Like the originals a record keeps only what was *decided* — which body,
 * which parent, when — and resolves widths, colours, timings from
 * `settings.relay` every frame, so every slider is live on a lattice that is
 * already standing.
 */
export class ArcRelayAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.tetherGeometry = createRelayTetherGeometry();
    this.quadGeometry = createRelayQuadGeometry();
    this.floorGeometry = createRelayFloorGeometry();

    /* ---- layer 1: tethers ---- */
    this.tethers = [];
    for (let i = 0; i < MAX_TETHERS; i++) {
      const material = createRelayTetherMaterial();
      const mesh = new Mesh(this.tetherGeometry, material);
      mesh.name = `RelayTether${i}`;
      mesh.layers.set(LAYER.VFX);
      // Placed in the vertex stage; the CPU bounds mean nothing.
      mesh.frustumCulled = false;
      mesh.renderOrder = 14;
      mesh.visible = false;
      this.group.add(mesh);
      this.tethers.push({
        mesh,
        material,
        active: false,
        /** The leader: still seeking, drawn to the moving head. */
        leader: false,
        grounded: false,
        age: 0,
        reroll: 0,
        /** Index of the relay it leaves from; −1 is the caster's hand. */
        fromNode: -1,
        /** Index of the relay it feeds; −1 for the ground or the leader. */
        toNode: -1,
        toPoint: new Vector3(),
        state: {
          from: new Vector3(),
          to: new Vector3(),
          grow: 0,
          level: 0,
          snap: 0,
          overload: 0,
          widthScale: 1,
          seed: 0,
          phase: 0
        }
      });
    }

    /* ---- layers 2, 3, 6: one core, one sigil, one warp per relay ---- */
    this.nodes = [];
    for (let i = 0; i < MAX_NODES; i++) {
      const coreMaterial = createRelayCoreMaterial();
      const core = new Mesh(this.quadGeometry, coreMaterial);
      core.name = `RelayCore${i}`;
      core.layers.set(LAYER.VFX);
      core.frustumCulled = false;
      core.renderOrder = 16;
      core.visible = false;

      const sigilMaterial = createRelaySigilMaterial();
      const sigil = new Mesh(this.floorGeometry, sigilMaterial);
      sigil.name = `RelaySigil${i}`;
      sigil.layers.set(LAYER.VFX);
      sigil.frustumCulled = false;
      sigil.renderOrder = 3;
      sigil.visible = false;

      const warpMaterial = createRelayWarpMaterial();
      const warp = new Mesh(this.quadGeometry, warpMaterial);
      warp.name = `RelayWarp${i}`;
      warp.layers.set(LAYER.DISTORTION);
      warp.frustumCulled = false;
      warp.visible = false;

      this.group.add(core, sigil, warp);
      this.nodes.push({
        core,
        coreMaterial,
        sigil,
        sigilMaterial,
        warp,
        warpMaterial,
        dummy: null,
        /** Where the relay core sits — fixed at the moment of the claim. */
        point: new Vector3(),
        parent: -1,
        /** Wave it was claimed in; the frontier is the newest wave. */
        wave: 0,
        age: 0,
        ringPhase: 0,
        spin: 0,
        seed: 0,
        /** Bearing of the cage's first prong, rolled at the claim. */
        cagePhase: 0,
        coreState: { size: 1, charge: 0, overload: 0, burst: 0, fade: 1, ringPhase: 0, seed: 0 },
        sigilState: { reveal: 0, overload: 0, burst: 0, fade: 1, spin: 0, seed: 0 },
        warpState: { strength: 0, seed: 0 }
      });
    }

    /* ---- layer 2b: the conductor cages, one instanced draw ---- */
    this.prongGeometry = createRelayProngGeometry();
    this.prongHeat = new InstancedBufferAttribute(new Float32Array(MAX_NODES * MAX_PRONGS * 4), 4);
    this.prongGeometry.setAttribute('aHeat', this.prongHeat);
    this.prongMaterial = createRelayProngMaterial();
    this.prongs = new InstancedMesh(this.prongGeometry, this.prongMaterial, MAX_NODES * MAX_PRONGS);
    this.prongs.name = 'RelayCage';
    this.prongs.layers.set(LAYER.WORLD);
    this.prongs.castShadow = true;
    this.prongs.receiveShadow = true;
    this.prongs.frustumCulled = false;
    this.prongs.count = 0;
    this.group.add(this.prongs);

    /** Reused by `DummyField#findTargets`, so polling allocates nothing. */
    this._targets = [];
    this._handPoint = new Vector3();
    this._groundPoint = new Vector3();
    this._centroid = new Vector3();

    // Per-cast state, reset in `onSpawn`.
    this._mode = Mode.GROUNDED;
    this._reported = false;
    this._nodeCount = 0;
    this._wave = 0;
    this._waveTimer = 0;
    this._overloadAge = 0;
    this._dischargeAge = 0;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 4: sparks ---- */
    this.sparks = particles.get('relay.sparks', {
      capacity: 3200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uSizeIn.value = 0.01;
    this.sparks.uniforms.uFadeIn.value = 0.01;
    this.sparks.uniforms.uFadeOut.value = 0.5;

    /* ---- layer 4: motes ---- */
    this.motes = particles.get('relay.motes', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.4
    });
    this.motes.uniforms.uDrag.value = 1.5;
    this.motes.uniforms.uEndSize.value = 1.6;
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.05;
    this.motes.uniforms.uFadeOut.value = 0.5;

    this.moteEmitter = new RateEmitter();
    this.nodeMoteEmitter = new RateEmitter();
    this.sparkEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get handlesOwnHits() {
    return true;
  }

  /** Relays in the lattice. HUD readout only. */
  get instanceCount() {
    return this._nodeCount;
  }

  /** The wreckage hangs for `lifetime` after the discharge. */
  get impactDuration() {
    return Math.max(0.05, settings.relay.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.05, settings.relay.fadeTime);
  }

  /** Current gutters; under overload it gutters harder. */
  lightShimmer() {
    const k = saturate(settings.relay.lightFlicker * (this._mode === Mode.OVERLOAD ? 1.6 : 1));
    return 1 - k * 0.5 + k * Math.random();
  }

  /**
   * Run the line only while seeking; report the end the frame after the
   * lattice discharges or the leader grounds (see Chain Arc for the pattern).
   */
  advance(dt) {
    if (this._mode === Mode.SEEK) {
      super.advance(dt);
      return false;
    }
    if ((this._mode === Mode.DISCHARGED || this._mode === Mode.GROUNDED) && !this._reported) {
      this._reported = true;
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.relay;
    const g = settings.global;

    this._mode = Mode.SEEK;
    this._reported = false;
    this._nodeCount = 0;
    this._wave = 0;
    this._waveTimer = 0;
    this._overloadAge = 0;
    this._dischargeAge = 0;
    this._targets.length = 0;
    this.moteEmitter.reset();
    this.nodeMoteEmitter.reset();
    this.sparkEmitter.reset();

    for (let i = 0; i < MAX_TETHERS; i++) this._releaseTether(this.tethers[i]);
    for (let i = 0; i < MAX_NODES; i++) this._releaseNode(this.nodes[i]);
    this.prongs.count = 0;

    this._hand(this._handPoint);

    // The leader leaves the hand at once.
    const leader = this.tethers[0];
    leader.active = true;
    leader.leader = true;
    leader.age = 0;
    leader.reroll = 0;
    leader.fromNode = -1;
    leader.toNode = -1;
    leader.toPoint.copy(this._handPoint);
    leader.state.seed = Math.random() * 10;
    leader.state.phase = Math.random() * 6.28;
    leader.mesh.visible = true;

    this._syncParticles();
    _dir.copy(this.direction).setY(0.3).normalize();
    this._sparkBurst(this._handPoint, 0.2, Math.round(c.sparkCount * 0.4 * g.particleCount), _dir, c.sparkSpeed * 0.7);
    this.ctx.shake.add(c.castShake * g.cameraShake, 6, 30);
  }

  /** Where the feed line leaves the caster, world space. */
  _hand(out) {
    const c = settings.relay;
    out.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    out.y = c.handHeight;
    return out;
  }

  _releaseTether(tether) {
    tether.active = false;
    tether.leader = false;
    tether.grounded = false;
    tether.fromNode = -1;
    tether.toNode = -1;
    tether.mesh.visible = false;
  }

  _releaseNode(node) {
    node.dummy = null;
    node.parent = -1;
    node.core.visible = false;
    node.sigil.visible = false;
    node.warp.visible = false;
  }

  /** Is this body already a relay. */
  _isClaimed(dummy) {
    for (let i = 0; i < this._nodeCount; i++) if (this.nodes[i].dummy === dummy) return true;
    return false;
  }

  /** The nearest live, unclaimed body within `radius` of (x, z). */
  _nearest(x, z, radius) {
    const found = this.ctx.dummies?.findTargets?.(x, z, radius, this._targets);
    if (!found) return null;
    for (let i = 0; i < found.length; i++) if (!this._isClaimed(found[i])) return found[i];
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* The lattice                                                         */
  /* ------------------------------------------------------------------ */

  /** Make `dummy` relay number `_nodeCount`, fed from `parent` (−1 = hand). */
  _claim(dummy, parent) {
    const c = settings.relay;
    const g = settings.global;
    const index = this._nodeCount++;
    const node = this.nodes[index];

    node.dummy = dummy;
    node.parent = parent;
    node.wave = this._wave;
    node.age = 0;
    node.ringPhase = Math.random() * 6.28;
    node.spin = Math.random() * 6.28;
    node.seed = Math.random() * 10;
    node.cagePhase = Math.random() * TAU;
    node.point.set(dummy.position.x, settings.dummies.height * c.nodeHeight, dummy.position.z);
    node.core.visible = true;
    node.sigil.visible = true;
    node.warp.visible = true;

    // Its feed: the tether slot with the same index.
    const tether = this.tethers[index];
    tether.active = true;
    tether.leader = false;
    tether.grounded = false;
    tether.age = 0;
    tether.reroll = 0;
    tether.fromNode = parent;
    tether.toNode = index;
    tether.toPoint.copy(node.point);
    tether.state.seed = Math.random() * 10;
    tether.state.phase = Math.random() * 6.28;
    tether.mesh.visible = true;

    /* --- the claim: a burn, a spray, a punch --- */
    _pos.set(node.point.x, 0, node.point.z);
    this.ctx.decals.spawn(DecalType.ARC, _pos, {
      radius: c.arcRadius * g.explosionIntensity,
      life: c.arcLife,
      width: c.arcWidth,
      intensity: c.arcIntensity,
      colorA: getColor(c.colorArcA),
      colorB: getColor(c.colorArcB),
      height: 0.018
    });
    this._feedSource(tether, _from);
    this._scarLine(_from, node.point);
    _dir.subVectors(node.point, _from).setY(0).normalize().setY(0.7).normalize();
    this._sparkBurst(node.point, 0.25, Math.round(c.sparkCount * g.particleCount), _dir, c.sparkSpeed);

    this.position.copy(node.point);
    this.lightBoost = Math.max(this.lightBoost, c.relayLight * g.explosionIntensity);
    this.ctx.shake.add(c.relayShake * g.explosionIntensity, 5, 28);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.relayFlash * g.explosionIntensity);
  }

  /** Burn the ground track of a new link: a dotted line of ARC and SCORCH. */
  _scarLine(from, to) {
    const c = settings.relay;
    const g = settings.global;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    const n = Math.min(MAX_SCARS_PER_LINK, Math.floor(length / Math.max(0.2, c.scarSpacing)));
    if (n <= 0 || c.scarRadius <= 0) return;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      _scar.set(from.x + dx * t, 0, from.z + dz * t);
      this.ctx.decals.spawn(DecalType.ARC, _scar, {
        radius: c.scarRadius * (0.7 + 0.6 * Math.random()) * g.explosionIntensity,
        life: c.scarLife,
        width: c.arcWidth,
        intensity: c.arcIntensity * 0.8,
        colorA: getColor(c.colorArcA),
        colorB: getColor(c.colorArcB),
        height: 0.016
      });
      if (i % 2) {
        this.ctx.decals.spawn(DecalType.SCORCH, _scar, {
          radius: c.scarRadius * 0.6,
          life: c.scarLife * 1.3,
          intensity: 0.8,
          colorA: getColor(c.colorScorch),
          colorB: getColor(c.colorArcB)
        });
      }
    }
  }

  /** One wave: every relay of the newest wave reaches for the next bodies. */
  _growWave() {
    const c = settings.relay;
    const limit = Math.max(1, Math.min(MAX_NODES, Math.round(c.maxNodes)));
    const branch = Math.max(1, Math.min(MAX_BRANCH, Math.round(c.branchFactor)));
    const frontier = this._wave;
    const before = this._nodeCount;
    this._wave++;

    // Only the relays that existed before this wave started may reach.
    for (let i = 0; i < before && this._nodeCount < limit; i++) {
      const node = this.nodes[i];
      if (node.wave !== frontier) continue;
      for (let b = 0; b < branch && this._nodeCount < limit; b++) {
        const next = this._nearest(node.point.x, node.point.z, c.linkRange);
        if (!next) break;
        this._claim(next, i);
      }
    }
    return this._nodeCount > before;
  }

  _beginOverload() {
    this._mode = Mode.OVERLOAD;
    this._overloadAge = 0;
  }

  /** Every relay goes off on the same frame. */
  _discharge() {
    const c = settings.relay;
    const g = settings.global;
    const hit = c.hit;
    const kill = settings.dummies.hit.enabled;
    this._mode = Mode.DISCHARGED;
    this._dischargeAge = 0;

    for (let i = 0; i < this._nodeCount; i++) {
      const node = this.nodes[i];

      // Thrown outward along the branch that claimed it.
      if (node.parent >= 0) _dir.subVectors(node.point, this.nodes[node.parent].point);
      else _dir.copy(this.direction);
      _dir.y = 0;
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize();
      if (kill && node.dummy) node.dummy.kill(_dir.x, _dir.z, hit);

      _pos.copy(node.point);
      this.ctx.bursts.spawn(BurstMode.STORM, _pos, {
        radius: c.burstSize * 0.12,
        endRadius: c.burstSize * g.explosionIntensity,
        life: c.burstLife,
        intensity: c.burstIntensity,
        opacity: 0.6,
        displace: 0.35,
        squash: 0.8,
        colorA: getColor(c.colorBurstA),
        colorB: getColor(c.colorBurstB),
        colorC: getColor(c.colorBurstC)
      });
      _pos.y = 0;
      this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
        radius: c.scorchRadius,
        life: c.scorchLife,
        intensity: 1,
        colorA: getColor(c.colorScorch),
        colorB: getColor(c.colorArcB)
      });
      this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
        radius: c.shockRadius * g.explosionIntensity,
        life: c.shockLife,
        width: 0.06,
        intensity: c.shockIntensity,
        colorA: getColor(c.colorShockA),
        colorB: getColor(c.colorShockB)
      });
      _dir.set(0, 1, 0);
      this._sparkBurst(node.point, 0.3, Math.round(c.dischargeSparks * g.particleCount), _dir, c.sparkSpeed * 1.4, 1.6);
      this._moteBurst(node.point, Math.round(c.dischargeSparks * 0.4 * g.particleCount));
    }

    this.lightBoost = Math.max(this.lightBoost, c.dischargeLight * g.explosionIntensity);
    this.ctx.shake.add(c.dischargeShake * g.explosionIntensity, 2.6, 26);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.dischargeFlash * g.explosionIntensity);
  }

  /** Nobody on the line: the leader goes to ground at the end of it. */
  _ground() {
    const c = settings.relay;
    const g = settings.global;
    this._mode = Mode.GROUNDED;
    this._dischargeAge = 0;

    this.pointAt(1, this._groundPoint).setY(0.03);
    const tether = this.tethers[0];
    tether.leader = false;
    tether.grounded = true;
    tether.age = 0;
    tether.toPoint.copy(this._groundPoint);

    const at = this._groundPoint;
    this.ctx.decals.spawn(DecalType.ARC, at, {
      radius: c.groundArcRadius * g.explosionIntensity,
      life: c.arcLife,
      width: c.arcWidth,
      intensity: c.arcIntensity,
      colorA: getColor(c.colorArcA),
      colorB: getColor(c.colorArcB),
      height: 0.018
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, at, {
      radius: c.shockRadius * 0.7 * g.explosionIntensity,
      life: c.shockLife,
      width: 0.05,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    _pos.set(at.x, 0.35, at.z);
    this.ctx.bursts.spawn(BurstMode.STORM, _pos, {
      radius: c.burstSize * 0.1,
      endRadius: c.burstSize * 0.75 * g.explosionIntensity,
      life: c.burstLife,
      intensity: c.burstIntensity * 0.8,
      opacity: 0.55,
      displace: 0.35,
      squash: 0.55,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _dir.set(0, 1, 0);
    this._sparkBurst(at, 0.4, Math.round(c.dischargeSparks * g.particleCount), _dir, c.sparkSpeed * 1.2, 1.4);

    // Whatever was standing close to where it went to ground.
    const field = this.ctx.dummies;
    if (field?.findTargets && settings.dummies.hit.enabled) {
      for (const dummy of field.findTargets(at.x, at.z, c.groundRadius, this._targets)) {
        _dir.set(dummy.position.x - at.x, 0, dummy.position.z - at.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        else _dir.normalize();
        dummy.kill(_dir.x, _dir.z, c.hit);
      }
    }

    this.position.copy(at);
    this.lightBoost = Math.max(this.lightBoost, c.dischargeLight * 0.6 * g.explosionIntensity);
    this.ctx.shake.add(c.dischargeShake * 0.6 * g.explosionIntensity, 3.2, 24);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.dischargeFlash * 0.6 * g.explosionIntensity);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  /** Where a tether leaves from: the hand, or its parent relay's core. */
  _feedSource(tether, out) {
    if (tether.fromNode >= 0) return out.copy(this.nodes[tether.fromNode].point);
    return out.copy(this._handPoint);
  }

  /** 0..1 how far into the overload the lattice is (1 after the discharge). */
  _overloadLevel() {
    if (this._mode === Mode.OVERLOAD) {
      return Easing.inQuad(saturate(this._overloadAge / Math.max(0.05, settings.relay.overloadTime)));
    }
    return this._mode === Mode.DISCHARGED ? 1 : 0;
  }

  /** 0..1 through linger + fade after the discharge/grounding. */
  _afterLevel() {
    const span = this.impactDuration + this.fadeDuration;
    return saturate(this._dischargeAge / Math.max(0.05, span));
  }

  _updateTether(tether, dt, overload) {
    const c = settings.relay;
    const g = settings.global;
    tether.age += dt;

    // Crackle on its own clock: the kinks snap rather than slide.
    tether.reroll -= dt;
    if (tether.reroll <= 0) {
      tether.reroll += 1 / Math.max(1, c.crackleRate * g.animationSpeed);
      if (tether.reroll < 0) tether.reroll = 0;
      tether.state.seed = Math.random() * 10;
    }

    const s = tether.state;
    this._feedSource(tether, s.from);
    if (tether.leader) s.to.copy(this.position);
    else s.to.copy(tether.toPoint);
    s.phase += c.braidSpeed * g.animationSpeed * dt;
    s.overload = overload;

    if (tether.leader) {
      // Seeking: thin, whole, dimmer.
      s.grow = 1.01;
      s.level = 0.65;
      s.snap = 0;
      s.widthScale = 0.6;
    } else if (this._mode === Mode.DISCHARGED || this._mode === Mode.GROUNDED) {
      const a = this._dischargeAge;
      const after = this._afterLevel();
      const punch = Math.exp(-10 * a);
      s.grow = 1.01;
      s.level = (1 + 2.5 * punch) * (1 - Easing.inQuad(after));
      s.snap = saturate(Easing.outQuad(after) * 1.1 + (this._mode === Mode.DISCHARGED ? 0.15 : 0));
      s.widthScale = lerp(1, c.overloadWidth, punch) * (1 + punch);
      s.overload = this._mode === Mode.DISCHARGED ? punch : 0;
      if (after >= 1) {
        this._releaseTether(tether);
        return;
      }
    } else {
      const grown = saturate(tether.age / Math.max(0.005, c.growTime));
      const punch = Math.exp(-8 * tether.age);
      s.grow = Easing.outQuad(grown) * 1.01;
      s.level = 1 + punch * 1.5;
      s.snap = 0;
      s.widthScale = lerp(1, c.overloadWidth, overload) * (1 + punch * 0.6);
    }
    tether.material.userData.sync(s);
  }

  _updateNode(node, dt, overload) {
    const c = settings.relay;
    const g = settings.global;
    node.age += dt;
    node.ringPhase += c.ringSpin * g.animationSpeed * dt * (1 + overload * 2.5) / 6.28;
    node.spin += c.sigilSpin * g.animationSpeed * dt * (1 + overload * 1.5);

    const camera = this.ctx.camera;
    const charge = saturate(node.age / Math.max(0.02, c.chargeTime));
    const discharged = this._mode === Mode.DISCHARGED;
    const after = discharged ? this._afterLevel() : 0;
    const burst = discharged ? Easing.outCubic(saturate(this._dischargeAge / 0.35)) : 0;
    const swell = lerp(1, c.overloadSwell, overload);

    /* --- core: over the body, pulled toward the camera so it is never cut --- */
    _pos.copy(node.point);
    _pos.y += Math.sin(node.age * 3.1 + node.seed) * c.nodeBob;
    if (camera) {
      _toCam.subVectors(camera.position, _pos);
      const d = _toCam.length();
      if (d > 1e-3) _pos.addScaledVector(_toCam, Math.min(c.nodeLift, d * 0.5) / d);
    }
    node.core.position.copy(_pos);
    const cs = node.coreState;
    cs.size = c.coreSize * swell * (discharged ? 1 + burst * 1.4 : 1) * (0.6 + 0.4 * Easing.outBack(charge));
    cs.charge = discharged ? 1 : lerp(0, lerp(c.idleCharge, 1, overload), Easing.outQuad(charge)) + Math.exp(-6 * node.age) * 0.8;
    cs.overload = discharged ? 1 : overload;
    cs.burst = burst;
    cs.fade = discharged ? 1 - saturate((this._dischargeAge - 0.3) / 0.15) : 1;
    cs.ringPhase = node.ringPhase;
    cs.seed = node.seed;
    node.coreMaterial.userData.sync(cs);
    node.core.visible = cs.fade > 0.001;

    /* --- sigil on the floor --- */
    node.sigil.position.set(node.point.x, 0.03, node.point.z);
    const r = c.sigilRadius * (discharged ? 1 + burst * 0.6 : 1);
    node.sigil.scale.set(r, 1, r);
    const ss = node.sigilState;
    ss.reveal = Easing.outCubic(saturate(node.age / Math.max(0.02, c.chargeTime * 1.6))) * 1.1;
    ss.overload = discharged ? 0 : overload;
    ss.burst = discharged ? Easing.outQuad(saturate(this._dischargeAge / Math.max(0.1, this.impactDuration))) : 0;
    ss.fade = 1 - Easing.inQuad(after);
    ss.spin = node.spin;
    ss.seed = node.seed;
    node.sigilMaterial.userData.sync(ss);
    node.sigil.visible = ss.fade > 0.001;

    /* --- warp --- */
    node.warp.position.copy(node.point);
    const ws = node.warpState;
    ws.strength = discharged
      ? c.warpOverload * 1.5 * Math.exp(-5 * this._dischargeAge)
      : c.warpStrength * Easing.outQuad(charge) + c.warpOverload * overload;
    ws.seed = node.seed;
    node.warpMaterial.userData.sync(ws);
    node.warp.visible = ws.strength > 0.004;
  }

  /**
   * The conductor cages, closed-form from each relay's clock and the
   * lattice's mode: rise out of the floor → hum → open under overload → blown
   * outward white-hot on the discharge → topple, cool and sink. Writes every
   * prong's matrix and its `aHeat` (heat, reach, seed, flicker).
   */
  _updateCage(overload) {
    const c = settings.relay;
    const g = settings.global;
    const n = Math.max(0, Math.min(MAX_PRONGS, Math.round(c.prongCount)));
    const discharged = this._mode === Mode.DISCHARGED;
    const da = this._dischargeAge;
    const blow = discharged ? Easing.outCubic(saturate(da / Math.max(0.02, c.cageBlowTime))) : 0;
    const sink = discharged ? Easing.inQuad(saturate((da - c.cageSinkDelay) / Math.max(0.05, c.cageSinkTime))) : 0;
    const width = c.prongWidth / PRONG_WIDTH;
    const time = frame.uTime.value * g.animationSpeed;
    let k = 0;

    for (let i = 0; i < this._nodeCount && n > 0; i++) {
      const node = this.nodes[i];
      const charge = saturate(node.age / Math.max(0.02, c.chargeTime));
      for (let p = 0; p < n; p++) {
        const seed = node.seed * 7.13 + p * 1.618;
        const jitter = (Math.sin(seed * 12.9898) * 0.5) * c.cageJitter * g.randomness;
        const bearing = node.cagePhase + (p / n) * TAU + jitter;
        const reach = c.cageRadius * (1 + jitter * 0.4) + c.cageBlowPush * blow;
        const H = c.cageHeight * (1 + jitter * 0.25);
        const inward = reach - c.cageTipRadius;
        const L = Math.hypot(H, inward);
        let lean = Math.atan2(inward, H);

        // Torn up out of the floor, staggered round the ring, overshooting.
        const rise = saturate((node.age - c.cageDelay - p * c.cageStagger) / Math.max(0.02, c.cageRiseTime));
        const grow = rise > 0 ? Easing.outBack(rise) : 0;
        lean *= 0.35 + 0.65 * Easing.outCubic(rise);
        // Held: a hum; overload: the cage opens; discharge: blown outward.
        lean += Math.sin(time * 41 + seed * 3.7) * c.cageHum * (0.25 + overload) * (1 - blow);
        lean -= c.cageSplay * overload;
        lean = lean + (-c.cageBlowAngle - lean) * blow;
        const len = L * grow * (1 - 0.25 * sink);

        const cx = Math.cos(bearing);
        const cz = Math.sin(bearing);
        _prong.position.set(node.point.x + cx * reach, -len * c.cageSink * sink - 0.04, node.point.z + cz * reach);
        _prong.rotation.set(0, -bearing, lean);
        const sx = len > 1e-4 ? width * (0.85 + 0.15 * grow) : 0;
        _prong.scale.set(sx, Math.max(1e-4, len), sx);
        _prong.updateMatrix();
        this.prongs.setMatrixAt(k, _prong.matrix);

        // Heat: grooves first, the points as the charge settles, the whole
        // rod under overload; a white-hot spike on the discharge that cools.
        let heat;
        let heatReach;
        if (discharged) {
          heat = c.cageDischargeHeat * Math.exp(-da / Math.max(0.05, c.cageCoolTime)) + c.cageIdleHeat * 0.3 * (1 - sink);
          heatReach = 1;
        } else {
          heat = (c.cageIdleHeat * Easing.outQuad(charge) + overload * (1 - c.cageIdleHeat)) + Math.exp(-6 * node.age) * 0.6;
          heatReach = lerp(c.cageIdleReach, 1, overload) * charge;
        }
        this.prongHeat.setXYZW(k, heat, heatReach, seed, c.cageCrackle * (0.3 + overload + blow));
        k++;
      }
    }
    this.prongs.count = k;
    this.prongs.instanceMatrix.needsUpdate = true;
    this.prongHeat.needsUpdate = true;
    this.prongMaterial.userData.sync();
  }

  _sparkBurst(point, radius, count, direction, speed, spread = 1.1) {
    const c = settings.relay;
    _emit.position = point;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = 0.6;
    _emit.spread = spread;
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

  _moteBurst(point, count) {
    const c = settings.relay;
    _emit.position = point;
    _emit.radius = 0.35;
    _emit.direction = _up;
    _emit.speed = c.moteSpeed * 2.2;
    _emit.speedVariance = 0.7;
    _emit.spread = 1.0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.2;
    _emit.sizeVariance = 0.6;
    _emit.life = c.moteLife * 1.3;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.motes.emit(count, _emit);
  }

  /** Sparks spat off the live relays, motes drifting up out of them. */
  _nodeFx(dt, strength) {
    const c = settings.relay;
    const g = settings.global;
    if (this._nodeCount === 0 || strength <= 0) return;

    const sparks = Math.round(this.sparkEmitter.tick(dt, c.lingerSparkRate * strength) * g.particleCount);
    for (let n = 0; n < sparks; n++) {
      const node = this.nodes[(Math.random() * this._nodeCount) | 0];
      _dir.set(Math.random() - 0.5, 0.6, Math.random() - 0.5).normalize();
      this._sparkBurst(node.point, 0.2, 1, _dir, c.sparkSpeed * 0.6);
    }

    const motes = Math.round(this.nodeMoteEmitter.tick(dt, c.nodeMoteRate * this._nodeCount * strength) * g.particleCount);
    for (let n = 0; n < motes; n++) {
      const node = this.nodes[(Math.random() * this._nodeCount) | 0];
      _emit.position = node.point;
      _emit.radius = 0.3;
      _emit.direction = _up;
      _emit.speed = c.moteSpeed;
      _emit.speedVariance = 0.7;
      _emit.spread = 0.8;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.2;
      _emit.sizeVariance = 0.5;
      _emit.life = c.moteLife;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.motes.emit(1, _emit);
    }
  }

  _syncParticles() {
    const c = settings.relay;
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
    this.motes.uniforms.uSizeScale.value = (c.moteSize / 0.2) * g.particleSize;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = c.moteGlow * g.glow;
    this.motes.uniforms.uTurbulence.value = c.moteTurbulence * g.turbulence;
  }

  /** Everything that moves, every frame, in every phase. */
  _frame(dt) {
    const c = settings.relay;
    const g = settings.global;
    this._syncParticles();

    /* --- the state machine --- */
    if (this._mode === Mode.SEEK) {
      this.position.y = c.leaderHeight;
      const caught = this._nearest(this.position.x, this.position.z, c.captureRadius);
      if (caught) {
        // The leader becomes the first feed.
        this._releaseTether(this.tethers[0]);
        this._claim(caught, -1);
        this._mode = Mode.GROW;
        this._waveTimer = 0;
      } else {
        const motes = Math.round(this.moteEmitter.tick(dt, c.moteRate) * g.particleCount);
        if (motes > 0) {
          _emit.position = this.position;
          _emit.radius = 0.22;
          _emit.direction = this.direction;
          _emit.speed = c.moteSpeed;
          _emit.speedVariance = 0.8;
          _emit.spread = 1.0;
          _emit.inherit = null;
          _emit.anchor = null;
          _emit.size = 0.2;
          _emit.sizeVariance = 0.5;
          _emit.life = c.moteLife;
          _emit.lifeVariance = 0.4;
          _emit.spin = 0;
          _emit.tint = null;
          _emit.time = frame.uTime.value;
          this.motes.emit(motes, _emit);
        }
        if (this.u >= 1) this._ground();
      }
    } else if (this._mode === Mode.GROW) {
      this._waveTimer += dt;
      if (this._waveTimer >= Math.max(0.02, c.linkDelay)) {
        this._waveTimer = 0;
        const limit = Math.max(1, Math.min(MAX_NODES, Math.round(c.maxNodes)));
        const grew = this._nodeCount < limit && this._growWave();
        if (!grew || this._nodeCount >= limit) this._beginOverload();
      }
    } else if (this._mode === Mode.OVERLOAD) {
      this._overloadAge += dt;
      const o = this._overloadLevel();
      this.ctx.shake.rumble(c.overloadRumble * o * g.explosionIntensity, dt);
      this.lightBoost = Math.max(this.lightBoost, c.relayLight * 0.6 * o);
      if (this._overloadAge >= Math.max(0.05, c.overloadTime)) this._discharge();
    } else {
      this._dischargeAge += dt;
    }

    /* --- draw --- */
    const overload = this._overloadLevel();
    for (let i = 0; i < MAX_TETHERS; i++) {
      const tether = this.tethers[i];
      if (tether.active) this._updateTether(tether, dt, overload);
    }
    for (let i = 0; i < this._nodeCount; i++) this._updateNode(this.nodes[i], dt, overload);
    this._updateCage(overload);

    const live = this._mode === Mode.GROW || this._mode === Mode.OVERLOAD ? 1 + overload * 2 : 0;
    this._nodeFx(dt, live);

    /* --- the light sits in the middle of the lattice --- */
    if (this._nodeCount > 0) {
      this._centroid.set(0, 0, 0);
      for (let i = 0; i < this._nodeCount; i++) this._centroid.add(this.nodes[i].point);
      this._centroid.divideScalar(this._nodeCount);
      this.position.lerp(this._centroid, 1 - Math.exp(-8 * dt));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._frame(dt);
  }

  /** The lattice has gone off (or grounded) — the linger starts now. */
  onImpact() {}

  onFade(dt) {
    this._frame(dt);
  }

  onDestroy() {
    for (let i = 0; i < MAX_TETHERS; i++) this._releaseTether(this.tethers[i]);
    for (let i = 0; i < MAX_NODES; i++) this._releaseNode(this.nodes[i]);
    this._nodeCount = 0;
    this._targets.length = 0;
    this._mode = Mode.GROUNDED;
    this.prongs.count = 0;
  }

  dispose() {
    for (const tether of this.tethers) tether.material.dispose();
    for (const node of this.nodes) {
      node.coreMaterial.dispose();
      node.sigilMaterial.dispose();
      node.warpMaterial.dispose();
    }
    this.tetherGeometry.dispose();
    this.quadGeometry.dispose();
    this.floorGeometry.dispose();
    this.prongGeometry.dispose();
    this.prongMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const R = Editor.range;
  const folder = gui.addFolder('\u{1F578}  Arc Relay');

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 120, 0.5, 'leader speed (m/s)');
  R(cast, c, 'lifetime', 0.05, 6, 0.05, 'wreckage hangs for (s)');
  R(cast, c, 'fadeTime', 0.05, 4, 0.05, 'goes out over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handForward', -1, 2, 0.01, 'hand forward (m)');
  R(cast, c, 'handSide', -1, 1, 0.01, 'hand side (m)');
  R(cast, c, 'handHeight', 0, 3, 0.01, 'hand height (m)');
  R(cast, c, 'leaderHeight', 0.1, 3, 0.01, 'leader height (m)');

  const net = folder.addFolder('The network');
  R(net, c, 'captureRadius', 0.1, 5, 0.05, 'capture radius (m)');
  R(net, c, 'linkRange', 0.5, 20, 0.1, 'link range (m)');
  R(net, c, 'maxNodes', 1, MAX_NODES, 1, 'relays before overload');
  R(net, c, 'branchFactor', 1, MAX_BRANCH, 1, 'branches per relay');
  R(net, c, 'linkDelay', 0.02, 1.5, 0.01, 'delay per wave (s)');
  R(net, c, 'nodeHeight', 0, 1.2, 0.01, 'relay height (× body)');
  R(net, c, 'overloadTime', 0.05, 4, 0.05, 'overload lasts (s)');
  R(net, c, 'groundRadius', 0, 8, 0.05, 'grounding kill radius (m)');
  R(net, c.hit, 'impulse', 0, 20, 0.1, 'throw impulse');
  R(net, c.hit, 'lift', 0, 20, 0.1, 'throw lift');
  R(net, c.hit, 'spin', 0, 5, 0.05, 'throw spin');

  /* ---- layer 1 ---- */
  const tethers = folder.addFolder('1 · Tethers');
  const shape = tethers.addFolder('Shape');
  R(shape, c, 'tetherSegments', 4, MAX_TETHER_POINTS, 1, 'points per strand');
  R(shape, c, 'growTime', 0.005, 1, 0.005, 'race time (s)');
  R(shape, c, 'bow', -0.5, 0.5, 0.005, 'bow (× length)');
  R(shape, c, 'braidRadius', 0, 0.6, 0.005, 'braid radius (m)');
  R(shape, c, 'braidTwists', 0, 12, 0.1, 'braid twists');
  R(shape, c, 'braidSpeed', -20, 20, 0.1, 'braid roll (rad/s)');
  R(shape, c, 'jag', 0, 0.3, 0.002, 'crackle (× length)');
  R(shape, c, 'jagMax', 0, 3, 0.01, 'crackle cap (m)');
  R(shape, c, 'jagFrequency', 1, 30, 0.1, 'kinks per tether');
  R(shape, c, 'crackleRate', 1, 60, 0.5, 're-strikes per second');
  const look = tethers.addFolder('Ribbon');
  R(look, c, 'coreWidth', 0.002, 0.2, 0.001, 'core half-width (m)');
  R(look, c, 'glowWidth', 0.02, 1.5, 0.005, 'glow half-width (m)');
  R(look, c, 'glowFalloff', 0.3, 8, 0.05, 'glow falloff');
  R(look, c, 'strandBalance', 0, 1.5, 0.01, 'second strand brightness');
  R(look, c, 'tetherIntensity', 0, 15, 0.05, 'intensity');
  R(look, c, 'tetherOpacity', 0, 1, 0.01, 'opacity');
  R(look, c, 'pulseCount', 0, 12, 0.1, 'packets per tether');
  R(look, c, 'pulseSpeed', -6, 6, 0.05, 'packet speed');
  R(look, c, 'pulseGlow', 0, 8, 0.05, 'packet brightness');
  R(look, c, 'tetherFlicker', 0, 1, 0.01, 'strobe');
  R(look, c, 'overloadWidth', 1, 5, 0.05, 'width at overload');
  R(look, c, 'snapScale', 2, 60, 1, 'pieces when it snaps');
  look.addColor(c, 'colorTetherCore').name('core');
  look.addColor(c, 'colorTetherGlow').name('glow');
  look.addColor(c, 'colorTetherEdge').name('edge');
  look.addColor(c, 'colorTetherAlt').name('second strand');

  /* ---- layer 2 ---- */
  const core = folder.addFolder('2 · Relay cores');
  R(core, c, 'coreSize', 0.1, 3, 0.01, 'half-size (m)');
  R(core, c, 'coreBall', 0.05, 0.9, 0.01, 'ball radius');
  R(core, c, 'coreBoil', 0, 2, 0.01, 'boil');
  R(core, c, 'coreBoilScale', 0.5, 12, 0.05, 'boil scale');
  R(core, c, 'coreFilaments', 1, 24, 1, 'filaments');
  R(core, c, 'filamentReach', 0.1, 1, 0.01, 'filament reach');
  R(core, c, 'filamentSharp', 1, 60, 0.5, 'filament thinness');
  R(core, c, 'ringRadius', 0.1, 1, 0.01, 'ring radius');
  R(core, c, 'ringWidth', 0.002, 0.2, 0.001, 'ring width');
  R(core, c, 'ringGaps', 1, 16, 1, 'ring breaks');
  R(core, c, 'ringSpin', -10, 10, 0.05, 'ring spin (rad/s)');
  R(core, c, 'coreIntensity', 0, 12, 0.05, 'intensity');
  R(core, c, 'coreFlicker', 0, 1, 0.01, 'strobe');
  R(core, c, 'chargeTime', 0.02, 2, 0.01, 'charges over (s)');
  R(core, c, 'idleCharge', 0, 1, 0.01, 'held charge');
  R(core, c, 'overloadSwell', 1, 3, 0.01, 'swell at overload');
  R(core, c, 'nodeBob', 0, 0.5, 0.005, 'hover (m)');
  R(core, c, 'nodeLift', 0, 2, 0.01, 'toward camera (m)');
  core.addColor(c, 'colorCoreHot').name('hot');
  core.addColor(c, 'colorCoreMid').name('plasma');
  core.addColor(c, 'colorCoreEdge').name('edge');
  core.addColor(c, 'colorCoreRing').name('ring');

  /* ---- layer 2b ---- */
  const cage = folder.addFolder('2b · Conductor cage (hero)');
  R(cage, c, 'prongCount', 0, MAX_PRONGS, 1, 'prongs per relay');
  R(cage, c, 'cageRadius', 0.2, 2.5, 0.01, 'foot ring radius (m)');
  R(cage, c, 'cageTipRadius', 0, 1.5, 0.01, 'point ring radius (m)');
  R(cage, c, 'cageHeight', 0.4, 4, 0.01, 'height (m)');
  R(cage, c, 'prongWidth', 0.02, 0.2, 0.001, 'foot half-width (m)');
  R(cage, c, 'cageJitter', 0, 1, 0.01, 'irregularity');
  R(cage, c, 'cageDelay', 0, 0.5, 0.005, 'rises after the claim (s)');
  R(cage, c, 'cageRiseTime', 0.02, 1, 0.005, 'rises over (s)');
  R(cage, c, 'cageStagger', 0, 0.2, 0.002, 'stagger per prong (s)');
  R(cage, c, 'cageHum', 0, 0.2, 0.001, 'hum (rad)');
  R(cage, c, 'cageSplay', 0, 0.8, 0.005, 'opens at overload (rad)');
  R(cage, c, 'cageBlowAngle', 0, 1.6, 0.01, 'blown out to (rad)');
  R(cage, c, 'cageBlowPush', 0, 2, 0.01, 'blown out by (m)');
  R(cage, c, 'cageBlowTime', 0.02, 1, 0.005, 'blown over (s)');
  R(cage, c, 'cageSinkDelay', 0, 2, 0.01, 'sinks after (s)');
  R(cage, c, 'cageSinkTime', 0.05, 3, 0.01, 'sinks over (s)');
  R(cage, c, 'cageSink', 0, 1.5, 0.01, 'sinks by (× length)');
  R(cage, c, 'cageIdleHeat', 0, 1, 0.01, 'held heat');
  R(cage, c, 'cageIdleReach', 0, 1, 0.01, 'held heat reach (× length)');
  R(cage, c, 'cageDischargeHeat', 0, 2, 0.01, 'discharge heat');
  R(cage, c, 'cageCoolTime', 0.05, 3, 0.01, 'cools over (s)');
  R(cage, c, 'cageCrackle', 0, 1, 0.01, 'heat crackle');
  R(cage, c, 'prongGlow', 0, 8, 0.05, 'heat glow');
  R(cage, c, 'prongGroove', 0, 3, 0.01, 'insulator groove glow');
  R(cage, c, 'prongRoughness', 0, 1, 0.01, 'roughness');
  R(cage, c, 'prongMetalness', 0, 1, 0.01, 'metalness');
  cage.addColor(c, 'colorProng').name('steel');
  cage.addColor(c, 'colorProngHot').name('heat: white point');
  cage.addColor(c, 'colorProngTint').name('heat: tint');
  cage.addColor(c, 'colorProngBody').name('heat: body');
  cage.addColor(c, 'colorProngDeep').name('heat: deep');

  /* ---- layer 3 ---- */
  const sigil = folder.addFolder('3 · Ground sigils');
  R(sigil, c, 'sigilRadius', 0.1, 4, 0.01, 'radius (m)');
  R(sigil, c, 'sigilSpokes', 3, 16, 1, 'spokes');
  R(sigil, c, 'sigilSpin', -6, 6, 0.01, 'spin (rad/s)');
  R(sigil, c, 'sigilLine', 0.005, 0.15, 0.001, 'line width');
  R(sigil, c, 'sigilIntensity', 0, 8, 0.05, 'intensity');
  R(sigil, c, 'sigilOpacity', 0, 1, 0.01, 'opacity');
  R(sigil, c, 'sigilFill', 0, 1, 0.01, 'plate darkness');
  R(sigil, c, 'sigilField', 0, 3, 0.01, 'plasma field');
  R(sigil, c, 'sigilFieldScale', 0.5, 10, 0.05, 'field scale');
  R(sigil, c, 'sigilVeins', 0, 3, 0.01, 'current veins');
  sigil.addColor(c, 'colorSigil').name('colour');
  sigil.addColor(c, 'colorSigilHot').name('hot');
  sigil.addColor(c, 'colorSigilBody').name('field body');
  sigil.addColor(c, 'colorSigilDeep').name('plate deep');
  R(sigil, c, 'arcRadius', 0.1, 6, 0.05, 'ARC burn on claim (m)');
  R(sigil, c, 'groundArcRadius', 0.1, 8, 0.05, 'ARC burn when grounding (m)');
  R(sigil, c, 'arcLife', 0.1, 6, 0.05, 'burn lifetime');
  R(sigil, c, 'arcWidth', 0.01, 0.4, 0.005, 'burn line width');
  R(sigil, c, 'arcIntensity', 0, 4, 0.05, 'burn intensity');
  sigil.addColor(c, 'colorArcA').name('burn hot');
  sigil.addColor(c, 'colorArcB').name('burn cool');
  const scars = folder.addFolder('3b · Conduction scars');
  R(scars, c, 'scarSpacing', 0.2, 4, 0.05, 'one mark every (m)');
  R(scars, c, 'scarRadius', 0, 2, 0.01, 'mark radius (m)');
  R(scars, c, 'scarLife', 0.2, 10, 0.1, 'marks last (s)');
  R(scars, c, 'scorchRadius', 0, 4, 0.05, 'scorch per relay on discharge (m)');
  R(scars, c, 'scorchLife', 0.2, 12, 0.1, 'scorch lasts (s)');
  scars.addColor(c, 'colorScorch').name('scorch');

  /* ---- layer 4 ---- */
  const sparks = folder.addFolder('4 · Sparks + motes');
  R(sparks, c, 'sparkCount', 0, 300, 1, 'sparks per claim');
  R(sparks, c, 'lingerSparkRate', 0, 400, 1, 'off live relays (/s)');
  R(sparks, c, 'dischargeSparks', 0, 600, 1, 'per relay on discharge');
  R(sparks, c, 'sparkSpeed', 0, 30, 0.1, 'speed');
  R(sparks, c, 'sparkSize', 0.005, 0.3, 0.005, 'size');
  R(sparks, c, 'sparkLife', 0.05, 2, 0.01, 'lifetime');
  R(sparks, c, 'sparkGravity', -30, 5, 0.1, 'gravity');
  R(sparks, c, 'sparkDrag', 0, 8, 0.05, 'drag');
  R(sparks, c, 'sparkStretch', 0, 0.4, 0.005, 'stretch');
  R(sparks, c, 'sparkGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(sparks, c, 'colorSpark', 'Spark colour over life');
  R(sparks, c, 'moteRate', 0, 600, 1, 'motes off the leader (/s)');
  R(sparks, c, 'nodeMoteRate', 0, 200, 1, 'motes per relay (/s)');
  R(sparks, c, 'moteSize', 0.01, 1, 0.005, 'mote size');
  R(sparks, c, 'moteLife', 0.05, 3, 0.01, 'mote lifetime');
  R(sparks, c, 'moteSpeed', 0, 8, 0.05, 'mote speed');
  R(sparks, c, 'moteRise', -4, 6, 0.05, 'mote rise');
  R(sparks, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  R(sparks, c, 'moteTurbulence', 0, 5, 0.05, 'mote turbulence');
  Editor.gradient(sparks, c, 'colorMote', 'Mote colour over life');

  /* ---- layer 5 ---- */
  const dis = folder.addFolder('5 · Discharge');
  R(dis, c, 'burstSize', 0.2, 10, 0.05, 'storm shell (m)');
  R(dis, c, 'burstLife', 0.05, 2, 0.01, 'shell lifetime');
  R(dis, c, 'burstIntensity', 0, 6, 0.05, 'shell intensity');
  R(dis, c, 'shockRadius', 0, 12, 0.05, 'shockwave (m)');
  R(dis, c, 'shockLife', 0.05, 3, 0.01, 'shockwave lifetime');
  R(dis, c, 'shockIntensity', 0, 3, 0.01, 'shockwave intensity');
  dis.addColor(c, 'colorBurstA').name('shell core');
  dis.addColor(c, 'colorBurstB').name('shell body');
  dis.addColor(c, 'colorBurstC').name('shell edge');
  dis.addColor(c, 'colorShockA').name('shockwave');
  dis.addColor(c, 'colorShockB').name('shockwave hot');

  /* ---- layer 6 ---- */
  const warp = folder.addFolder('6 · Heat warp');
  R(warp, c, 'warpSize', 0.1, 5, 0.05, 'half-size (m)');
  R(warp, c, 'warpStrength', 0, 3, 0.01, 'while held');
  R(warp, c, 'warpOverload', 0, 4, 0.01, 'extra at overload');
  R(warp, c, 'warpScale', 0.2, 10, 0.05, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 10, 0.05, 'noise speed');

  /* ---- layer 7 ---- */
  const fb = folder.addFolder('7 · Light & feedback');
  fb.addColor(c, 'lightColor').name('light colour');
  R(fb, c, 'lightIntensity', 0, 30, 0.1, 'light intensity');
  R(fb, c, 'lightRadius', 0.5, 30, 0.1, 'light radius');
  R(fb, c, 'lightFlicker', 0, 1, 0.01, 'light gutter');
  R(fb, c, 'relayLight', 0, 60, 0.5, 'light punch per relay');
  R(fb, c, 'dischargeLight', 0, 120, 0.5, 'light punch on discharge');
  R(fb, c, 'relayShake', 0, 1, 0.01, 'shake per relay');
  R(fb, c, 'relayFlash', 0, 1, 0.01, 'flash per relay');
  R(fb, c, 'overloadRumble', 0, 1, 0.01, 'rumble while overloading');
  R(fb, c, 'dischargeShake', 0, 1, 0.01, 'shake on discharge');
  R(fb, c, 'dischargeFlash', 0, 1, 0.01, 'flash on discharge');
  R(fb, c, 'castShake', 0, 0.5, 0.005, 'shake on cast');
  fb.addColor(c, 'colorFlash').name('flash colour');
}
