import { Group, Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../../Ability.js';
import { LAYER } from '../../../core/Layers.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import { impactForce } from '../AuthoredImpactForce.js';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { MeridianFractures, MeridianParticles } from './HollowMeridianFX.js';
import {
  seamGeometry,
  fractureShardGeometry,
  breachWarningGeometry,
  voidTravelGeometry,
  voidLensGeometry,
  breachWaveGeometry
} from './HollowMeridianGeometry.js';
import {
  createSeamMaterial,
  createWakeMaterial,
  createLensMaterial,
  createWarningMaterial,
  createShardMaterial,
  createWaveMaterial,
  createImplosionWarpMaterial
} from './HollowMeridianMaterials.js';

export { seamGeometry, fractureShardGeometry, breachWarningGeometry, voidTravelGeometry };

export const ID = 'exp-hollow-meridian';
export const UID = 'matrix-expansion/hollow-meridian';

/** Breaches per cast. Fixed by the mechanic (and its tests). */
const MAX_BREACHES = 3;
/** Torn fragments, six per breach, assigned round-robin. */
const MAX_SHARDS = 18;
/** The combat bridge refuses more than eight targets per hit. */
const MAX_HIT_TARGETS = 8;
/** Height of the authored seam at `seamHeight = 1`, metres. */
const SEAM_HEIGHT = 2.8;
const TAU = Math.PI * 2;
/** Golden angle — spreads the shards round each breach without clumping. */
const GOLDEN = 2.399963;

const clamp = (x) => Math.max(0, Math.min(1, x));

/* Module scratch: no allocation per frame. */
const _world = new Vector3();
const _target = new Vector3();
const _queryAt = [0, 0, 0];
const _from = [0, 0, 0];
const _ids = [];
const _seamState = { flow: 0, close: 0, fade: 1, breathe: 1 };
const _wakeState = { flow: 0, fade: 1 };
const _warnState = { flow: 0, charge: 0, alpha: 0, reduced: false };
const _shardState = { flow: 0, fade: 1, dissolve: 0 };
const _waveState = { progress: 0, alpha: 0 };
const _warpState = { width: 1, height: 1, strength: 0, flow: 0 };

/**
 * HOLLOW MERIDIAN — three breaches torn down a line, one after another.
 *
 * A line cast in four beats:
 *
 *   1. **travel** — a dark wake runs out along the line: two crossed torn
 *      ribbons (so it has volume from any camera) with a black-glass spindle at
 *      the head, streaks thrown back off it.
 *   2. **anticipation** — once the wake arrives (it collapses into the far
 *      end over `wakeFade` rather than vanishing), a glyph lands on the floor at
 *      the next breach point. Its rim fills clockwise with the charge and motes
 *      start spiralling down into it, so the player can read *where* and
 *      *when* the floor will open.
 *   3. **impact × 3** — each breach is a gameplay event first: the cast asks
 *      the combat bridge for enemies over the point, checks cover and hits
 *      everyone uncovered. Only an accepted hit (or a disc with nobody to hit)
 *      opens anything; a refusal retries. Then a torn seam snaps open (with an
 *      overshoot) over the point, forked cracks race out across the floor, a
 *      ragged wave rings out, two jets of streaks spray along the line's
 *      normal, chips of floor are thrown up, six fragments of torn space lift
 *      out of the lips and hang tumbling round it, the scene is pulled inward
 *      by a distortion proxy, and the camera, flash and light take a beat.
 *   4. **linger → exit** — an open breach holds (`seamHold`), motes falling
 *      into it, then seals: the rim is *dissolved* inward by noise while the
 *      tear narrows, its fragments burn away from the tip and its cracks dim.
 *      In the release phase everything still open narrows to nothing and the
 *      fragments fly apart.
 *
 * Layers, each a folder in the editor:
 *
 *   - the wake + spindle (`createWakeMaterial`, `createLensMaterial`)
 *   - the warning glyph (`createWarningMaterial`, authored `breachWarningGeometry`)
 *   - the seams (`createSeamMaterial` — normal-blended so the hole *occludes*:
 *     an additive void is a purple glow, not an absence)
 *   - the floor: fractures (`MeridianFractures`) and the breach wave
 *   - the shards (`createShardMaterial`, faceted `fractureShardGeometry`)
 *   - three particle systems (`MeridianParticles`: streaks, motes, grit)
 *   - the implosion warp on `LAYER.DISTORTION`
 *
 * ## Why gameplay and presentation are separate
 *
 * `_schedule` is the mechanic and nothing else: it is timed on `stagedTime`
 * (impact time ÷ global lifetime, so the breach rhythm scales with the global
 * lifetime slider but not with the visual sliders), retries refused
 * breaches 0.2 s later, and records the accepted time of each breach. Every
 * visual in `_present` is a pure function of those three recorded times plus
 * the live settings — so a refused breach can never show a seam, and dragging
 * any presentation slider mid-cast re-shapes what is already open.
 *
 * Flow phases (`_flow`, `_spin`) are integrated rather than derived from age,
 * so dragging a speed slider mid-cast never snaps a seam to a new pose; under
 * reduced motion they hold still and particles, shake and flash are skipped.
 */
export class HollowMeridianAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** Breaches pick their own targets through the combat bridge. */
  get handlesOwnHits() {
    return true;
  }

  get lifetimeScale() {
    return Math.max(0.1, settings.global.lifetime);
  }

  get impactDuration() {
    return this.config.lifetime * this.lifetimeScale;
  }

  get fadeDuration() {
    return this.config.fade * this.lifetimeScale;
  }

  /** Impact time on the unscaled authoring clock the breach schedule uses. */
  get stagedTime() {
    return this.impactTime / this.lifetimeScale;
  }

  /** Open seams plus their visible fragments. HUD readout only. */
  get instanceCount() {
    let n = 0;
    for (const seam of this.seams) if (seam.visible) n++;
    for (const shard of this.fragments) if (shard.visible) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /** Every geometry and material this instance owns, for `dispose`. */
    this.gs = [];
    this.ms = [];
    const g = (x) => (this.gs.push(x), x);
    const m = (x) => (this.ms.push(x), x);

    /* ---- 1 · the wake ---- */
    this.travelMat = m(createWakeMaterial());
    this.travel = new Mesh(g(voidTravelGeometry()), this.travelMat);
    this.travel.visible = false;
    this.headMat = m(createLensMaterial());
    this.head = new Mesh(g(voidLensGeometry()), this.headMat);
    this.head.visible = false;
    for (const mesh of [this.travel, this.head]) {
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }

    /* ---- the rig: everything placed in the line's local frame ---- */
    // Local +z runs down the line; breach i sits at z = length × (i + 1) / 4.
    this.rig = new Group();
    this.group.add(this.rig);
    this.rig.visible = false;
    this.fractures = new MeridianFractures(this.rig);

    /* ---- 3 · the seams ---- */
    const seam = g(seamGeometry());
    this.seams = [];
    this.seamMaterials = [];
    for (let i = 0; i < MAX_BREACHES; i++) {
      const mat = m(createSeamMaterial(i * 7.31));
      const mesh = new Mesh(seam, mat);
      // Each breach leans a little differently so the three never line up.
      mesh.rotation.z = (i - 1) * 0.18;
      mesh.visible = false;
      // Drawn over the floor cracks and wave, under the shards.
      mesh.renderOrder = 4;
      this.rig.add(mesh);
      this.seams.push(mesh);
      this.seamMaterials.push(mat);
    }
    /** The first seam's material, kept for callers that read one. */
    this.mat = this.seamMaterials[0];

    /* ---- 2 · the warning glyph ---- */
    this.warningMat = m(createWarningMaterial());
    this.warning = new Mesh(g(breachWarningGeometry()), this.warningMat);
    this.warning.position.y = 0.035;
    this.warning.visible = false;
    this.rig.add(this.warning);

    /* ---- 4 · the breach waves ---- */
    const wave = g(breachWaveGeometry());
    this.waves = [];
    this.waveMaterials = [];
    for (let i = 0; i < MAX_BREACHES; i++) {
      const mat = m(createWaveMaterial(i * 3.7));
      const mesh = new Mesh(wave, mat);
      mesh.visible = false;
      this.rig.add(mesh);
      this.waves.push(mesh);
      this.waveMaterials.push(mat);
    }

    /* ---- 5 · the shards — one material per breach so each seals alone ---- */
    const shard = g(fractureShardGeometry());
    this.shardMaterials = [];
    for (let i = 0; i < MAX_BREACHES; i++) this.shardMaterials.push(m(createShardMaterial()));
    /** Kept for callers that read the shared fragment material. */
    this.edge = this.shardMaterials[0];
    this.fragments = [];
    for (let i = 0; i < MAX_SHARDS; i++) {
      const f = new Mesh(shard, this.shardMaterials[i % MAX_BREACHES]);
      f.visible = false;
      f.renderOrder = 5;
      this.rig.add(f);
      this.fragments.push(f);
    }

    this.rig.traverse((n) => {
      if (n.isMesh) {
        n.layers.set(LAYER.VFX);
        n.frustumCulled = false;
      }
    });

    /* ---- 7 · the implosion warps (set after the VFX sweep above) ---- */
    const plane = g(new PlaneGeometry(1, 1, 1, 1));
    this.warps = [];
    this.warpMaterials = [];
    for (let i = 0; i < MAX_BREACHES; i++) {
      const mat = m(createImplosionWarpMaterial(i * 5.1));
      const mesh = new Mesh(plane, mat);
      mesh.layers.set(LAYER.DISTORTION);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.rig.add(mesh);
      this.warps.push(mesh);
      this.warpMaterials.push(mat);
    }

    /* ---- per-cast state (reset in onSpawn) ---- */
    this.scope = null;
    this.nextIndex = 0;
    this.nextAt = 0;
    this.failure = null;
    this._cutTimes = [-1, -1, -1];
    this._flow = 0;
    this._spin = 0;
    this._lightAt = new Vector3();
    // Wake length at arrival, collapsed from by the wake fade-out.
    this._wakeLength = 0;
    this._lightSaved = new Vector3();
  }

  createParticles() {
    this.riftParticles = new MeridianParticles(this.ctx);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.reduceMotion = prefersReducedMotion();
    this.riftParticles.reset();
    this.fractures.reset();
    this.rig.visible = false;
    this.scope = bindExpansionCombat(this.ctx, UID);
    this.failure = this.scope ? null : 'combat bridge unavailable';
    this.nextIndex = 0;
    this.nextAt = Math.max(0.1, this.config.windup ?? 0.3);
    this._cutTimes.fill(-1);
    this._flow = 0;
    this._spin = 0;
    for (const seam of this.seams) seam.visible = false;
    for (const fragment of this.fragments) fragment.visible = false;
    for (const wave of this.waves) wave.visible = false;
    for (const warp of this.warps) warp.visible = false;
    this.warning.visible = false;
    // Without a bridge nothing can be cut, so nothing is drawn either.
    this.travel.visible = !!this.scope;
    this.head.visible = !!this.scope;
    this.travel.position.copy(this.origin);
    this.head.position.copy(this.origin);
    this._lightAt.copy(this.origin);
  }

  /** Integrated flow phases: a speed slider dragged mid-cast never snaps. */
  _advance(dt) {
    if (this.reduceMotion || dt <= 0) return;
    const c = this.config;
    const g = settings.global;
    this._flow += dt * (c.riftFlow ?? 1) * g.noiseSpeed;
    this._spin += dt * c.warningSpin * TAU * g.animationSpeed;
  }

  onTravel(dt) {
    const c = this.config;
    this._advance(dt);
    this.riftParticles.sync(c);
    if (this.scope) this.riftParticles.travel(dt, this.position, this.direction, c, this.reduceMotion);

    const yaw = Math.atan2(this.direction.x, this.direction.z);
    // The wake grows off the caster's hand rather than appearing full length.
    const grow = Easing.outCubic(clamp(this.age / 0.12));
    this.travel.position.copy(this.position);
    this.travel.position.y = 0.18;
    this.travel.rotation.y = yaw;
    this.travel.scale.set(c.travelWidth * grow, grow, Math.min(this.front, c.travelLength ?? 2));
    _wakeState.flow = this._flow;
    _wakeState.fade = grow;
    this.travelMat.userData.sync(c, _wakeState);

    this.head.position.copy(this.position);
    this.head.position.y = 0.32 + (this.reduceMotion ? 0 : Math.sin(this._flow * 7) * 0.03);
    this.head.rotation.set(0, yaw, this._flow * 2);
    this.head.scale.setScalar(c.headSize * grow);
    this.headMat.userData.sync(c, _wakeState);
    this._lightAt.copy(this.position);
  }

  onImpact() {
    // The wake and spindle stay up and collapse over `wakeFade` in
    // `_present`, so nothing vanishes at full size at the far end.
    this._wakeLength = this.travel.scale.z;
    if (!this.scope) return;
    this.rig.position.copy(this.origin);
    this.rig.rotation.y = Math.atan2(this.direction.x, this.direction.z);
    this.rig.visible = true;
  }

  onFade(dt, t) {
    this._advance(dt);
    this._schedule(dt);
    this._present(dt, t);
  }

  /* ------------------------------------------------------------------ */
  /* The mechanic                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Open the next breach once its staged time arrives. A breach opens when
   * the bridge accepted its hit, or when the disc held nobody to hit (covered
   * targets are simply excluded); a refused query, refused cover check or
   * refused emit retries 0.2 s later and opens nothing.
   */
  _schedule(dt) {
    const c = this.config;
    if (!(dt > 0) || !this.scope || this.phase !== AbilityPhase.IMPACT || this.nextIndex >= MAX_BREACHES || this.stagedTime < this.nextAt) return;
    const u = (this.nextIndex + 1) / 4;
    _queryAt[0] = this.origin.x + this.direction.x * this.length * u;
    _queryAt[1] = 0;
    _queryAt[2] = this.origin.z + this.direction.z * this.length * u;
    const q = this.scope.queryActors({ position: _queryAt, radius: c.zoneRadius, relation: 'enemy' });
    let accepted = !!q?.ok;
    _ids.length = 0;
    if (!accepted) this.failure = q?.reason ?? 'target query refused';
    if (accepted) {
      _from[0] = this.origin.x;
      _from[1] = this.origin.y;
      _from[2] = this.origin.z;
      for (const actor of q.actors) {
        if (!actor.alive) continue;
        const los = this.scope.isBlocked(_from, actor.position);
        // An unanswered cover check must not silently consume the breach.
        if (!los?.ok) {
          accepted = false;
          this.failure = los?.reason ?? 'terrain query refused';
          break;
        }
        if (!los.blocked && _ids.length < MAX_HIT_TARGETS) _ids.push(actor.id);
      }
    }
    if (accepted && _ids.length) {
      // The event is handed to the combat queue, so it owns fresh arrays.
      const point = [_queryAt[0], 0, _queryAt[2]];
      const out = this.scope.emit({
        type: 'hit',
        element: 'void',
        targetIds: _ids.slice(),
        position: point,
        sourcePosition: this.origin.toArray(),
        hitForce: impactForce(c),
        damage: c.damage,
        intensity: 1,
        shape: { kind: 'disc', x: point[0], z: point[2], r: c.zoneRadius }
      });
      accepted = !!out?.ok;
      if (!accepted) this.failure = out?.reason ?? 'breach refused';
    }
    if (accepted) {
      // An empty (or fully covered) disc still tears open — there was simply
      // nobody to hollow. Only a refusal holds the breach back.
      _queryAt[1] = 0;
      this._onBreach(_queryAt);
      this._cutTimes[this.nextIndex] = this.stagedTime;
      this.nextIndex++;
      this.nextAt = this.stagedTime + Math.max(0.15, c.strikeGap);
    } else {
      this.nextAt = this.stagedTime + 0.2;
    }
  }

  /** The beat of one accepted breach: particles, camera, flash and light. */
  _onBreach(point) {
    const c = this.config;
    const g = settings.global;
    this.riftParticles.sync(c);
    this.riftParticles.cut(point, this.direction, c, this.reduceMotion);
    this.lightBoost += c.lightPunch * g.lightIntensity;
    if (this.reduceMotion) return;
    if (c.impactShake > 0) this.ctx.shake?.add?.(c.impactShake, 3.2, 24);
    const flash = c.impactFlash * g.explosionIntensity;
    if (flash > 0) this.ctx.flash?.trigger?.(getColor(c.edgeColor), flash);
  }

  /* ------------------------------------------------------------------ */
  /* Presentation                                                        */
  /* ------------------------------------------------------------------ */

  /** Seconds since breach `i` was accepted, or −1 if it has not opened. */
  _age(i) {
    return this._cutTimes[i] < 0 ? -1 : this.stagedTime - this._cutTimes[i];
  }

  /** 1 while breach `i` holds, falling to 0 as it seals. */
  _cutFade(age) {
    const c = this.config;
    return age < 0 ? 0 : 1 - clamp((age - (c.seamHold ?? 1.4)) / Math.max(0.1, c.seamClose ?? 0.6));
  }

  /** The tear's opening curve: a fast snap past full width, then settling. */
  _open(age) {
    if (age < 0) return 0;
    const c = this.config;
    const t = clamp(age / Math.max(0.02, c.seamOpenTime));
    if (this.reduceMotion) return t;
    const snap = Easing.outCubic(t) * (1 + c.seamOvershoot);
    const settle = clamp((age - c.seamOpenTime) / Math.max(0.05, c.seamOpenTime * 2));
    return snap - c.seamOvershoot * Easing.outCubic(settle);
  }

  _present(dt, t) {
    const c = this.config;
    const g = settings.global;
    const fade = t <= 1 ? 1 : 1 - clamp(t - 1);
    const release = clamp(t - 1);
    const reduced = this.reduceMotion;
    const flow = this._flow;
    const width = Math.min(2, c.zoneRadius);
    this.riftParticles.sync(c);

    /* ---- 1 · the wake collapsing after arrival ---- */
    if (this.phase === AbilityPhase.IMPACT && (this.travel.visible || this.head.visible)) {
      const span = reduced ? 0 : Math.max(0, c.wakeFade ?? 0.18);
      const k = span > 0 ? 1 - clamp(this.impactTime / span) : 0;
      if (k <= 0) {
        this.travel.visible = false;
        this.head.visible = false;
      } else {
        const shrink = Easing.inCubic(k);
        this.travel.scale.z = Math.max(0.001, this._wakeLength * shrink);
        this.head.scale.setScalar(Math.max(0.001, c.headSize * shrink));
        _wakeState.flow = flow;
        _wakeState.fade = k;
        this.travelMat.userData.sync(c, _wakeState);
        this.headMat.userData.sync(c, _wakeState);
      }
    }

    /* ---- 2 · the warning over the next breach ---- */
    const charging = this.phase === AbilityPhase.IMPACT && this.nextIndex < MAX_BREACHES;
    this.warning.visible = charging;
    if (charging) {
      const z = (this.length * (this.nextIndex + 1)) / 4;
      const span = this.nextIndex === 0 ? Math.max(0.1, c.windup ?? 0.3) : Math.max(0.15, c.strikeGap);
      const charge = clamp(1 - (this.nextAt - this.stagedTime) / span);
      this.warning.position.z = z;
      this.warning.rotation.y = this._spin;
      this.warning.scale.setScalar(c.zoneRadius);
      _warnState.flow = flow;
      _warnState.charge = charge;
      _warnState.reduced = reduced;
      _warnState.alpha = fade * (c.warningIntensity ?? 0.6) * (reduced ? 1 : 0.65 + 0.35 * Math.sin(flow * 9));
      this.warningMat.userData.sync(c, _warnState);
      this._rigPoint(z, _world);
      this.riftParticles.linger(0, dt, _world, 0.35 + 0.65 * charge, c, reduced);
      _target.copy(_world);
    }

    /* ---- 3 · seams, 4 · floor, 7 · warps ---- */
    let latest = -1;
    for (let i = 0; i < MAX_BREACHES; i++) {
      const age = this._age(i);
      const cutFade = this._cutFade(age);
      const open = this._open(age);
      const z = (this.length * (i + 1)) / 4;
      const live = age >= 0 && cutFade > 0;
      if (live) latest = i;

      this.fractures.update(i, age, fade, c, this.length, reduced);

      const seam = this.seams[i];
      seam.visible = live;
      seam.position.set(0, 0.05, z);
      // Narrows as it seals and again through the release, while the
      // shader dissolves the rim inward — it never just pops.
      seam.scale.set(
        Math.max(0.001, width * open * (1 - release) * (0.35 + 0.65 * cutFade)),
        c.seamHeight * (0.8 + 0.2 * clamp(open)),
        1
      );
      _seamState.flow = flow + i * 3.1;
      _seamState.close = Math.max(1 - cutFade, release * 0.6);
      _seamState.fade = fade;
      _seamState.breathe = reduced ? 0 : 1;
      this.seamMaterials[i].userData.sync(c, _seamState);

      // The ragged ring the floor throws as the breach opens.
      const wave = this.waves[i];
      const waveT = age < 0 ? 1 : clamp(age / Math.max(0.05, c.waveLife));
      wave.visible = !reduced && age >= 0 && waveT < 1;
      if (wave.visible) {
        wave.position.set(0, 0.06, z);
        wave.scale.setScalar(Math.max(0.01, c.zoneRadius * c.waveRadius * Easing.outCubic(waveT)));
        _waveState.progress = waveT;
        _waveState.alpha = fade;
        this.waveMaterials[i].userData.sync(c, _waveState);
      }

      // The pull of the hole.
      const warp = this.warps[i];
      const pull = clamp(open) * cutFade * (1 - release);
      warp.visible = live && !reduced && pull > 0.01;
      if (warp.visible) {
        warp.position.set(0, 0, z);
        _warpState.width = Math.max(0.1, c.zoneRadius * c.warpWidth * (0.6 + 0.4 * clamp(open)));
        _warpState.height = SEAM_HEIGHT * c.seamHeight * c.warpHeight;
        _warpState.strength = pull;
        _warpState.flow = flow;
        this.warpMaterials[i].userData.sync(c, _warpState);
      }

      // Shards burn away with their own breach's seal.
      _shardState.flow = flow;
      _shardState.fade = fade;
      _shardState.dissolve = clamp(Math.max(1 - cutFade, release * 0.8));
      this.shardMaterials[i].userData.sync(c, _shardState);

      if (live) {
        this._rigPoint(z, _world);
        this.riftParticles.linger(i + 1, dt, _world, cutFade * (1 - release), c, reduced);
      }
    }

    /* ---- 5 · the shards ---- */
    const scatter = release * (c.releaseScatter ?? 1);
    const spin = flow * c.shardSpin;
    for (let i = 0; i < this.fragments.length; i++) {
      const q = i % MAX_BREACHES;
      const age = this._age(q);
      const cutFade = this._cutFade(age);
      const f = this.fragments[i];
      f.visible = age >= 0 && cutFade > 0;
      if (!f.visible) continue;
      const lift = clamp(age);
      // Each fragment leaves a lip of its seam and drifts round it.
      const a = i * GOLDEN + spin * 0.15;
      const reach = 0.3 + lift * c.zoneRadius + scatter;
      f.position.set(
        Math.sin(a) * reach,
        0.5 + lift * c.shardRise + scatter * 0.8 + (reduced ? 0 : Math.sin(flow * 1.7 + i) * 0.06),
        (this.length * (q + 1)) / 4 + Math.cos(a) * (0.35 + scatter)
      );
      f.rotation.set(i * GOLDEN * 0.37 + spin * 0.4, i * GOLDEN * 0.71 - spin * 0.3, i * GOLDEN + spin * 0.6);
      f.scale.setScalar(Math.max(0.001, (0.22 + 0.14 * (i % 3)) * c.shardScale * (1 - release) * cutFade * clamp(this._open(age) + 0.2)));
    }

    /* ---- the light follows the latest open breach, else the warning ---- */
    if (latest >= 0) this._rigPoint((this.length * (latest + 1)) / 4, _target);
    if (latest >= 0 || charging) {
      _target.y = 1;
      this._lightAt.lerp(_target, 1 - Math.exp(-Math.max(0, dt) * 10 * g.animationSpeed));
    }
  }

  /** World position of a point `z` metres down the line, on the floor. */
  _rigPoint(z, out) {
    return out.copy(this.origin).addScaledVector(this.direction, z);
  }

  /** The light rides the wake, then hangs over whichever breach is open. */
  _updateLight(dt, scale) {
    if (this.phase === AbilityPhase.TRAVEL || !this.rig.visible) return super._updateLight(dt, scale);
    this._lightSaved.copy(this.position);
    this.position.copy(this._lightAt);
    try {
      super._updateLight(dt, scale);
    } finally {
      this.position.copy(this._lightSaved);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.fractures.reset();
    this.rig.visible = false;
    this.travel.visible = false;
    this.head.visible = false;
    this.warning.visible = false;
    for (const seam of this.seams) seam.visible = false;
    for (const fragment of this.fragments) fragment.visible = false;
    for (const wave of this.waves) wave.visible = false;
    for (const warp of this.warps) warp.visible = false;
    this.scope = null;
  }

  dispose() {
    this.fractures.dispose();
    for (const x of this.gs) x.dispose();
    for (const x of this.ms) x.dispose();
    super.dispose();
  }
}

/* -------------------------------------------------------------------- */
/* Editor                                                               */
/* -------------------------------------------------------------------- */

/**
 * The production `Editor` helpers when they are handed in, plain lil-gui calls
 * when they are not (the candidate harnesses pass a bare folder).
 */
function editorKit(c, Editor) {
  const named = (controller, label) => (label && typeof controller?.name === 'function' ? controller.name(label) : controller);
  const sub = (folder, title) => (typeof folder.addFolder === 'function' ? folder.addFolder(title) : folder);
  const range = (folder, key, min, max, step, label) =>
    Editor?.range ? Editor.range(folder, c, key, min, max, step, label) : named(folder.add(c, key, min, max, step), label);
  const color = (folder, key, label) => named(folder.addColor(c, key), label);
  const gradient = (folder, prefix, title) => {
    if (Editor?.gradient && typeof folder.addFolder === 'function') return Editor.gradient(folder, c, prefix, title);
    const group = sub(folder, title);
    color(group, `${prefix}A`, 'birth');
    color(group, `${prefix}B`, 'early');
    color(group, `${prefix}C`, 'late');
    color(group, `${prefix}D`, 'death');
    return group;
  };
  const cast = (folder) => (Editor?.castAnimation ? Editor.castAnimation(folder, c) : named(folder.add(c, 'castAnim', CAST_ANIMATIONS), 'cast animation'));
  return { sub, range, color, gradient, cast };
}

export function buildEditor(gui, c, Editor) {
  const { sub, range: R, color, gradient, cast: castAnimation } = editorKit(c, Editor);
  const folder = gui.addFolder('◐  Hollow Meridian');

  const cast = sub(folder, 'The cast');
  R(cast, 'range', 1, 48, 0.1, 'max range');
  R(cast, 'minRange', 0, 20, 0.1, 'min range');
  R(cast, 'speed', 1, 60, 0.1, 'wake speed (m/s)');
  R(cast, 'lifetime', 1, 6, 0.1, 'breaches hold for');
  R(cast, 'fade', 0.1, 5, 0.1, 'release over');
  R(cast, 'cooldown', 0, 30, 0.1, 'cooldown');
  castAnimation(cast);

  const breach = sub(folder, 'The breaches (gameplay)');
  R(breach, 'zoneRadius', 0.4, 4, 0.1, 'breach radius (m)');
  R(breach, 'windup', 0.1, 2, 0.05, 'first breach after');
  R(breach, 'strikeGap', 0.15, 1.5, 0.05, 'between breaches');
  R(breach, 'damage', 0.1, 2, 0.1, 'damage per breach');
  R(breach, 'hitImpulse', 0, 24, 0.1, 'knockback');
  R(breach, 'hitLift', 0, 20, 0.1, 'knock-up');
  R(breach, 'hitSpin', 0, 8, 0.05, 'tumble');

  const light = sub(folder, 'Light & beat');
  color(light, 'lightColor', 'light');
  R(light, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, 'lightPunch', 0, 20, 0.1, 'punch per breach');
  R(light, 'impactShake', 0, 1, 0.01, 'camera shake');
  R(light, 'impactFlash', 0, 1, 0.01, 'screen flash');

  const palette = sub(folder, 'Palette');
  color(palette, 'voidColor', 'void');
  color(palette, 'coreColor', 'deep core');
  color(palette, 'edgeColor', 'burning edge');
  color(palette, 'starColor', 'starlight');

  const wake = sub(folder, '1 · The wake');
  R(wake, 'travelLength', 0.2, 5, 0.1, 'wake length (m)');
  R(wake, 'travelWidth', 0.2, 3, 0.05, 'wake width');
  R(wake, 'travelGlow', 0, 6, 0.05, 'edge glow');
  R(wake, 'headSize', 0, 3, 0.05, 'spindle size');
  R(wake, 'headFresnel', 0, 6, 0.05, 'spindle rim');
  R(wake, 'wakeFade', 0.02, 1, 0.01, 'collapses on arrival over');
  R(wake, 'particleRate', 0, 100, 1, 'streaks/second');
  R(wake, 'particleSize', 0.02, 0.5, 0.01, 'streak size');

  const warning = sub(folder, '2 · The warning');
  R(warning, 'warningIntensity', 0, 1, 0.05, 'opacity');
  R(warning, 'warningGlow', 0, 6, 0.05, 'glow');
  R(warning, 'warningSpin', -2, 2, 0.01, 'spin (rev/s)');

  const seams = sub(folder, '3 · The seams');
  R(seams, 'seamHold', 0.1, 4, 0.05, 'hold open for');
  R(seams, 'seamClose', 0.1, 2, 0.05, 'seal over');
  R(seams, 'seamOpenTime', 0.02, 1, 0.01, 'tear open over');
  R(seams, 'seamOvershoot', 0, 1, 0.01, 'snap past full width');
  R(seams, 'seamHeight', 0.2, 3, 0.05, 'height');
  R(seams, 'seamRagged', 0, 3, 0.05, 'rim raggedness');
  R(seams, 'seamSwirl', 0, 4, 0.05, 'inward swirl');
  R(seams, 'seamStars', 0, 4, 0.05, 'star points');
  R(seams, 'seamDepth', 0, 1, 0.01, 'centre darkness');
  R(seams, 'rimWidth', 0.01, 0.5, 0.005, 'rim width');
  R(seams, 'rimGlow', 0, 8, 0.05, 'rim glow');
  R(seams, 'riftFlow', 0, 3, 0.05, 'flow speed');
  R(seams, 'softFade', 0.01, 2, 0.01, 'floor soft fade (m)');

  const floor = sub(folder, '4 · The floor');
  R(floor, 'fractureReach', 0.4, 2, 0.05, 'crack reach');
  R(floor, 'fractureIntensity', 0, 1, 0.05, 'crack opacity');
  R(floor, 'fractureSpeed', 0.02, 1, 0.01, 'cracks run over');
  R(floor, 'fractureFlicker', 0, 2, 0.05, 'light leak flicker');
  R(floor, 'fractureGlow', 0, 6, 0.05, 'crack glow');
  R(floor, 'waveRadius', 0.5, 5, 0.05, 'wave reach');
  R(floor, 'waveLife', 0.1, 2, 0.05, 'wave lasts');
  R(floor, 'waveWidth', 0.05, 0.8, 0.01, 'wave band');
  R(floor, 'waveGlow', 0, 6, 0.05, 'wave glow');

  const shards = sub(folder, '5 · The shards');
  R(shards, 'shardScale', 0, 3, 0.05, 'size');
  R(shards, 'shardRise', 0, 4, 0.05, 'rise (m)');
  R(shards, 'shardSpin', 0, 4, 0.05, 'tumble');
  R(shards, 'shardGlow', 0, 6, 0.05, 'edge glow');
  R(shards, 'shardFresnel', 0, 6, 0.05, 'edge tightness');
  R(shards, 'releaseScatter', 0, 3, 0.1, 'scatter on release');

  const particles = sub(folder, '6 · Particles');
  const jets = sub(particles, 'Breach jets');
  R(jets, 'cutJet', 0, 24, 1, 'streaks per jet');
  R(jets, 'cutSpeed', 0, 4, 0.05, 'speed');
  R(jets, 'cutStretch', 0, 1.5, 0.01, 'stretch');
  R(jets, 'cutGlow', 0, 6, 0.05, 'glow');
  gradient(jets, 'cutColor', 'Streak colour');
  const motes = sub(particles, 'Falling motes');
  R(motes, 'moteRate', 0, 90, 1, 'motes/second');
  R(motes, 'moteSize', 0.01, 0.4, 0.005, 'size');
  R(motes, 'moteLife', 0.2, 4, 0.05, 'lifetime');
  R(motes, 'moteSwirl', -8, 8, 0.1, 'orbit speed');
  R(motes, 'motePull', 0, 1, 0.01, 'pull inward');
  R(motes, 'moteGlow', 0, 6, 0.05, 'glow');
  gradient(motes, 'moteColor', 'Mote colour');
  const grit = sub(particles, 'Floor grit');
  R(grit, 'gritCount', 0, 32, 1, 'chips per breach');
  R(grit, 'gritSize', 0.01, 0.3, 0.005, 'size');
  R(grit, 'gritLife', 0.2, 3, 0.05, 'lifetime');
  R(grit, 'gritSpeed', 0, 8, 0.05, 'throw speed');
  R(grit, 'gritGravity', 0, 20, 0.1, 'gravity');
  gradient(grit, 'gritColor', 'Grit colour');

  const warp = sub(folder, '7 · Distortion');
  R(warp, 'warpStrength', 0, 3, 0.01, 'pull strength');
  R(warp, 'warpScale', 0.1, 6, 0.05, 'shimmer scale');
  R(warp, 'warpTwist', -6, 6, 0.05, 'twist');
  R(warp, 'warpWidth', 0.2, 4, 0.05, 'width');
  R(warp, 'warpHeight', 0.2, 3, 0.05, 'height');

  return folder;
}
