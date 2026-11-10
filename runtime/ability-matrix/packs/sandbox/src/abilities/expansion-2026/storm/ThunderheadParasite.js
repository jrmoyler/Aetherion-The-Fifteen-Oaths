import { Mesh, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../../Ability.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { getColor } from '../../../utils/color.js';
import { saturate, Easing } from '../../../utils/math.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { createCloudGeometry, createGroundQuad, createStrandGeometry, createWarpQuad } from './ThunderheadParasiteGeometry.js';
import {
  createBoltMaterial,
  createCloudDepthMaterial,
  createCloudMaterial,
  createFlareMaterial,
  createParasiteWarpMaterial,
  createShadowMaterial
} from './ThunderheadParasiteMaterial.js';

export const ID = 'thunderhead-parasite';
export const UID = 'matrix-expansion/thunderhead-parasite';

/**
 * Thunderhead Parasite — storm, zone cast.
 *
 * Data block: presentation (`meta`) and the live settings the ability and its
 * editor folder read. The gameplay keys (`attachRadius`, `duration`,
 * `retaliation`, `reactionCooldown`, `range`, `speed`) keep their original
 * meaning; everything else is look, resolved per frame.
 */
export const CONFIG = Object.freeze({
  id: ID,
  meta: {
    label: 'Thunderhead Parasite',
    accent: '#a9baff',
    element: 'storm',
    key: '',
    cast: 'zone',
    hint: 'A storm attaches to a target and shocks it when it attacks.',
    glyph: '<path d="M20 50Q10 35 30 30Q38 8 55 25Q75 15 80 40Q95 44 85 55H18"/><path d="M56 48L43 68L55 68L43 90"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 0, // closer than this and the cast is refused
    speed: 30, // how fast the stormlet flies to the circle, metres/second
    lifetime: 0.6, // seconds (informational: the fade is fixed by the mechanic)
    cooldown: 7, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#afa4ff',
    lightIntensity: 5, // the storm's steady inner glow
    lightRadius: 8,
    lightFlicker: 0.25, // 0..1 how hard the light stutters with sheet lightning
    strikeLight: 10, // light punch on every retaliation

    /* ================================================================ */
    /* THE PARASITE (gameplay)                                           */
    /* ================================================================ */
    attachRadius: 2.5, // metres round the landing point it looks for a host
    duration: 6, // seconds it stays attached
    retaliation: 0.55, // damage per shock
    reactionCooldown: 0.3, // seconds between shocks

    /* ================================================================ */
    /* 1 · THE THUNDERHEAD                                               */
    /* ================================================================ */
    cloudHeight: 3.0, // metres above the host's feet (the belly hangs well over a 1.8 m body)
    cloudSize: 1.5, // minimum scale of the cluster (≈ 2.9 m across at 1)
    cloudZoneSpan: 1.4, // cloud width × the attach circle's diameter (≈ 7 m over the 2.5 m circle); 0 = use size only
    cloudFlatten: 0.72, // vertical squash
    cloudBillow: 0.12, // metres of fine billow on every lobe
    cloudBillowScale: 1.6, // billow noise frequency
    cloudDrift: 0.35, // billow noise speed
    cloudSpin: 0.05, // turns/second the cluster slowly wheels
    cloudOpacity: 0.96,
    cloudBoil: 0.1, // each lobe swells and sinks on its own by this share of its size
    cloudBoilRate: 0.7, // boils per second
    cloudTwist: 0.12, // radians/second the crown wheels against the belly (updraft shear)
    cloudAnvil: 1, // how far the anvil spreads out over the ride (0..1.5)
    cloudSwell: 0.14, // the cloud grows by this share as it feeds, across the ride
    cloudSurge: 0.06, // lobes heave out on every bolt (× bolt power)
    cloudShade: 0.62, // overall body brightness before lightning (low = a black storm)
    cloudSkyFill: 0.15, // sky catching the lobe tops
    cloudFlashWash: 0.03, // how much a flash lights the dense faces (the gaps always light)
    cloudCrownLight: 0.2, // how far the sun-facing upper lobes reach the crown tint
    cloudLining: 0.7, // the thin silver lining on the lobes' edges
    cloudEmber: 0.3, // violet smoulder in the crevices between flashes
    cloudEdge: 1.6, // how deep the silhouette is torn into wisps
    cloudFollow: 6, // how tightly it trails its host (1/s)
    cloudBob: 0.08, // metres of slow vertical bob
    formTime: 0.45, // seconds to condense on arrival
    seedScale: 0.4, // the stormlet's size in flight (× cloud)
    softFade: 0.5, // metres of soft intersection with the scene
    flashGlow: 1.7, // brightness of lightning inside the cloud
    idleFlash: 1.6, // ambient sheet-lightning flickers per second
    colorCloudDark: '#020208', // deep: the belly
    colorCloudMid: '#1d2145', // body (slate indigo)
    colorCloudLit: '#6a73b4', // tint: the sun-lit crown
    colorCloudFlash: '#c9c4ff', // core: lightning inside it

    /* ================================================================ */
    /* 2 · THE TETHER — strands hanging from the cloud onto its host     */
    /* ================================================================ */
    strandCount: 5, // max 5
    strandReach: 1.4, // metres up the host the strands touch
    strandSpread: 0.45, // metres the strands fan out at the cloud
    strandWidth: 0.045, // ribbon half-width, metres
    strandJag: 0.14, // metres of jag
    strandFlicker: 18, // re-shapes per second
    strandGlow: 1.4,
    strandOpacity: 0.65, // idle crackle brightness
    travelLeash: 0.7, // brightness of the leash from the hand to the stormlet in flight (0 = none)
    colorStrandCore: '#e6ebff',
    colorStrandBody: '#8b8cff',
    colorStrandHalo: '#4b2fd6',

    /* ================================================================ */
    /* 3 · THE STRIKE — one retaliation                                  */
    /* ================================================================ */
    strikeLife: 0.25, // seconds the bolt and the cloud flood last
    strikeWidth: 0.2, // ribbon half-width, metres (reads at play distance)
    strikeJag: 0.35, // metres of jag
    strikeGlow: 3.6,
    strikeBranchLength: 1.3, // metres, the two side branches
    strikeShake: 0.12,
    strikeFlash: 0.12,
    flareSize: 1.1, // metres, the contact flash where the bolt lands (× bolt power)
    flareGlow: 1.6,
    strikeBurst: 1.2, // metres, the ionised shell on the host
    strikeMark: 1.2, // metres, the branching burn under the host
    strikeMarkLife: 3.5, // the burn stays through the linger
    strikeWarp: 0.6, // distortion kick per strike (kept low so the bolt stays a crisp line)
    latchStrength: 1, // the bite on arrival: a full bolt onto the host (or the ground) — presentation only
    feedInterval: 0.85, // seconds between feeding bolts while it rides the host (0 = none) — presentation only
    feedJitter: 0.5, // ± share of that interval, so the feeding is irregular
    feedStrength: 0.85, // size of a feeding bolt, × a retaliation
    colorStrikeCore: '#ffffff',
    colorStrikeBody: '#a9b6ff',
    colorBurstA: '#ffffff',
    colorBurstB: '#a2a8ff',
    colorBurstC: '#4a2fd0',
    colorScorchA: '#1d1a30',
    colorScorchB: '#a3a0ff',
    colorFlash: '#c6c2ff',

    /* ================================================================ */
    /* 4 · ARRIVAL — the downdraft when it latches on                    */
    /* ================================================================ */
    attachShake: 0.05,
    attachFlash: 0.03,
    gustRadius: 2.4, // metres, the dust ring the downdraft throws
    colorGustA: '#2c2f4a',
    colorGustB: '#8c93c8',

    /* ================================================================ */
    /* 5 · RAIN                                                          */
    /* ================================================================ */
    rainRate: 160, // drops per second
    rainSpeed: 9,
    rainSize: 0.035,
    rainLife: 0.32,
    rainStretch: 0.85,
    rainOpacity: 0.6,
    rainSpread: 0.8, // radius (× cloud) the rain falls from
    colorRainA: '#d7defa',
    colorRainB: '#9aa6d8',
    colorRainC: '#5b628f',
    colorRainD: '#2a2d44',

    /* ================================================================ */
    /* 6 · MIST — vapour torn off the cloud's base                       */
    /* ================================================================ */
    mistRate: 14,
    mistSize: 0.7,
    mistLife: 1.6,
    mistOpacity: 0.45,
    colorMistA: '#3a3d66',
    colorMistB: '#2a2c4c',
    colorMistC: '#1a1b30',
    colorMistD: '#0c0c18',

    /* ================================================================ */
    /* 7 · SPARKS — sprayed off the host on every strike                 */
    /* ================================================================ */
    sparkCount: 30,
    sparkSize: 0.05,
    sparkSpeed: 6,
    sparkLife: 0.4,
    colorSparkA: '#ffffff',
    colorSparkB: '#c3c8ff',
    colorSparkC: '#7062ff',
    colorSparkD: '#24165a',

    /* ================================================================ */
    /* 8 · GROUND & DISTORTION                                           */
    /* ================================================================ */
    shadowRadius: 1.8, // metres (× cloud size)
    shadowOpacity: 0.85,
    crackleGlow: 0.5, // the net of charge crawling over the pool (idle; floods on a strike)
    crackleScale: 1.3, // cells per metre of that net
    scorchDarken: 0.8, // the charred centre under the host, grown as it feeds
    shadowWet: 0.6, // cold sheen on the pool's rim
    colorShadow: '#05060f',
    colorWet: '#8d9cff',
    warpStrength: 0.18,
    warpScale: 1.4,
    warpSpeed: 0.6
  }
});

const TAU = Math.PI * 2;
/** Fixed capacities: the tether never has more strands, the strike two branches. */
const MAX_STRANDS = 5;
const STRAND_POINTS = 12;
const STRIKE_POINTS = 16;
const BRANCH_POINTS = 8;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _travel = new Vector3();
// Bridge events the parasite listens to, and an empty actor list for a
// snapshot with none: hoisted so attaching allocates neither per cast.
const EVENT_TYPES = ['hit', 'cast-start'];
const NO_ACTORS = Object.freeze([]);
const DOWN = new Vector3(0, -1, 0);
const UP = new Vector3(0, 1, 0);

/**
 * THUNDERHEAD PARASITE — a storm that rides a target and punishes it for acting.
 *
 * The cast throws a small stormlet to the circle. On arrival it looks for the
 * nearest live enemy within `attachRadius`, latches on, and subscribes to the
 * combat bridge's `hit` and `cast-start` events. Whenever its host is the
 * owner of one of those events, the storm answers with a `hit` of its own on
 * the host — at most once per event, at most every `reactionCooldown`. It
 * follows the host for `duration` and then rains itself away.
 *
 * Layers, each a folder in the editor:
 *
 *   1. **the thunderhead** — an authored cumulonimbus (`createCloudGeometry`:
 *      42 lobes — flat belly, tower, budding cauliflower turrets, sheared
 *      anvil — with baked crevice burial) under a bruise-dark shader: belly
 *      at the deep stop, crevices darker still, only open upper faces lit,
 *      violet embers smouldering in the gaps. Through the ride every lobe
 *      boils on its own phase, the crown wheels against the belly, the anvil
 *      spreads and the cloud swells as it feeds; each bolt heaves it. It
 *      condenses out of noise on arrival, lights from inside with sheet
 *      lightning, floods through its gaps on a strike, and dissolves on exit. It flies small (the stormlet), blooms on arrival, trails its
 *      host on a spring and bobs.
 *   2. **the tether** — faint strands crackling from the cloud's belly onto
 *      the host while it is attached: you can see what it is feeding on.
 *   3. **the strike** — the retaliation: a bright jagged bolt from the cloud
 *      to the host's feet with two side branches, and a contact flare (a
 *      white-violet star billboard) where it lands.
 *   4. **rain** — STREAKs falling from the cloud's base onto the host.
 *   5. **mist** — non-additive SMOKE torn off the cloud's base, so it sheds.
 *   6. **sparks** — STREAKs sprayed off the host by each strike.
 *   7. **the ground** — the cloud's wet shadow pool following the host (a
 *      crackle net of charge crawling over it, a centre charring black), a
 *      DUSTRING from the arrival downdraft, an ARC burn + SCORCH per strike.
 *   8. **the beats** — an AIR shell on arrival, a STORM shell on every
 *      strike, camera knock, flash and light punch, all scaled by globals.
 *   9. **distortion** — the downdraft under the cloud on LAYER.DISTORTION,
 *      kicked by every strike.
 *
 * ## Before (and without) a host
 *
 * The retaliation needs a host that acts, which a training dummy never does,
 * so the cast must read on its own. A crackling **leash** runs from the hand
 * to the stormlet in flight; on arrival the storm **bites** — one full bolt
 * onto its host (or into the ground at the circle if nobody is there) with
 * its shell, burn and knock; and while it rides, it **feeds**: smaller bolts
 * at irregular intervals, each leaving a burn that stays through the linger.
 * These bites are presentation only — they emit no combat event; damage is
 * still and only the retaliation below.
 *
 * ## Rules
 *
 * The bridge callback only records gameplay; the strike's *visuals* are
 * spawned on the next frame from `lastEventCount`, so nothing visual ever
 * runs inside a combat tick. Every capacity is fixed; nothing allocates per
 * frame. The mechanic — binding, query, nearest-target choice with id
 * tie-break, subscriptions, dedupe, cooldown, emitted event, follow, and
 * unsubscribe on loss / expiry / disposal — is the original, unchanged.
 */
export class ThunderheadParasiteAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get impactDuration() {
    return Math.max(0.2, this.config.duration);
  }

  /** Fixed: the subscriptions stay live until destroy, so this is gameplay. */
  get fadeDuration() {
    return 0.6;
  }

  /** Attached host count. HUD readout only. */
  get instanceCount() {
    return this.targetId ? 1 : 0;
  }

  /** Stutters with the sheet lightning inside the cloud. */
  lightShimmer() {
    const f = saturate(this.config.lightFlicker ?? 0);
    return 1 - f * 0.5 + f * this._sheet * 0.8;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the thunderhead ---- */
    this.cloudGeometry = createCloudGeometry(3);
    this.cloudMaterial = createCloudMaterial();
    this.cloud = new Mesh(this.cloudGeometry, this.cloudMaterial);
    this.cloud.layers.set(LAYER.VFX);
    // Drawn after the strands and rain so it dims what hangs behind it.
    this.cloud.renderOrder = 3;
    this.group.add(this.cloud);
    // Depth pre-pass: same geometry, vertex stage and uniforms, colour off.
    // Parented to the cloud so it inherits its transform and visibility; it
    // resolves which lobe is nearest so back lobes never paint over front ones.
    this.cloudDepthMaterial = createCloudDepthMaterial(this.cloudMaterial);
    this.cloudDepth = new Mesh(this.cloudGeometry, this.cloudDepthMaterial);
    this.cloudDepth.layers.set(LAYER.VFX);
    this.cloudDepth.renderOrder = 2;
    this.cloud.add(this.cloudDepth);

    /* ---- layer 2: the tether ---- */
    this.strandMaterial = createBoltMaterial('strand');
    this.strands = [];
    for (let i = 0; i < MAX_STRANDS; i++) {
      const mesh = new Mesh(createStrandGeometry(STRAND_POINTS), this.strandMaterial);
      this.strands.push(mesh);
    }

    /* ---- layer 3: the strike ---- */
    this.strikeMaterial = createBoltMaterial('strike');
    this.strike = new Mesh(createStrandGeometry(STRIKE_POINTS), this.strikeMaterial);
    this.strikeBranches = [
      new Mesh(createStrandGeometry(BRANCH_POINTS), this.strikeMaterial),
      new Mesh(createStrandGeometry(BRANCH_POINTS), this.strikeMaterial)
    ];
    for (const mesh of [...this.strands, this.strike, ...this.strikeBranches]) {
      mesh.layers.set(LAYER.VFX);
      // World-space vertices written per frame.
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
    }

    /* ---- layer 3b: the contact flare where a bolt lands ---- */
    this.flareGeometry = createWarpQuad();
    this.flareMaterial = createFlareMaterial();
    this.flare = new Mesh(this.flareGeometry, this.flareMaterial);
    this.flare.layers.set(LAYER.VFX);
    this.flare.frustumCulled = false;
    this.flare.renderOrder = 12;
    this.flare.visible = false;
    this.group.add(this.flare);

    /* ---- layer 7: the shadow pool ---- */
    this.shadowGeometry = createGroundQuad();
    this.shadowMaterial = createShadowMaterial();
    this.shadow = new Mesh(this.shadowGeometry, this.shadowMaterial);
    this.shadow.layers.set(LAYER.VFX);
    this.shadow.frustumCulled = false;
    this.shadow.renderOrder = -1;
    this.group.add(this.shadow);

    /* ---- layer 9: the downdraft warp ---- */
    this.warpGeometry = createWarpQuad();
    this.warpMaterial = createParasiteWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.group.add(this.warp);

    /* ---- gameplay state (original) ---- */
    this.targetId = null;
    this.bridge = null;
    // Bound once: the bridge listener for every cast.
    this._onEvent = (event) => this._react(event);
    this.unsub = [];
    this.seen = new Set();
    this.nextPulse = 0;
    this.lastFlash = -10;
    this.attachPosition = new Vector3();
    this.lastEventCount = 0;

    /* ---- visual state, allocated once ---- */
    this.cloudPosition = new Vector3();
    this._sheetPos = new Vector3();
    this._seed = 0;
    this._spin = 0;
    this._sheet = 0;
    this._shownStrikes = 0;
    this._strikeRoll = 0;
    this._warpKick = 0;
    this._boltPower = 1;
    this._latchPending = false;
    this._nextFeed = 0;
    this._reduced = false;
    this._twist = 0;
    this._cloudState = { seed: 0, form: 1, flash: 0, sheet: 0, sheetPos: this._sheetPos, fade: 1, twist: 0, anvil: 0, surge: 0 };
    this._shadowState = { radius: 1, fade: 1, rain: 1, seed: 0, flash: 0, scorch: 0 };
    this._flareState = { fade: 0, size: 1, roll: 0 };
    this._warpState = { width: 1, height: 1, strength: 0, seed: 0 };
  }

  createParticles() {
    const particles = this.ctx.particles;
    /* ---- layer 4: rain ---- */
    this.rainSystem =
      particles?.get?.(`${ID}.rain`, {
        capacity: 900,
        shape: ParticleShape.STREAK,
        additive: true,
        stretch: true,
        softFade: 0.3
      }) ?? null;
    /* ---- layer 5: mist ---- */
    this.mistSystem =
      particles?.get?.(`${ID}.mist`, {
        capacity: 300,
        shape: ParticleShape.SMOKE,
        additive: false,
        curl: true,
        softFade: 1
      }) ?? null;
    /* ---- layer 6: sparks ---- */
    this.sparkSystem =
      particles?.get?.(`${ID}.sparks`, {
        capacity: 500,
        shape: ParticleShape.STREAK,
        additive: true,
        stretch: true,
        softFade: 0.3
      }) ?? null;
    if (this.rainSystem) {
      const u = this.rainSystem.uniforms;
      u.uSizeIn.value = 0.02;
      u.uFadeIn.value = 0.05;
      u.uFadeOut.value = 0.2;
      u.uEndSize.value = 0.8;
      u.uDrag.value = 0;
    }
    if (this.mistSystem) {
      const u = this.mistSystem.uniforms;
      u.uSizeIn.value = 0.2;
      u.uFadeIn.value = 0.2;
      u.uFadeOut.value = 0.5;
      u.uEndSize.value = 1.8;
      u.uDrag.value = 1.2;
    }
    if (this.sparkSystem) {
      const u = this.sparkSystem.uniforms;
      u.uSizeIn.value = 0.02;
      u.uFadeIn.value = 0.02;
      u.uFadeOut.value = 0.5;
      u.uEndSize.value = 0.3;
      u.uDrag.value = 2;
    }
    this.rainEmitter = new RateEmitter();
    this.mistEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.targetId = null;
    this.seen.clear();
    this.lastFlash = -10;
    this.nextPulse = 0;
    this.lastEventCount = 0;
    this._clearSubscriptions();
    this.bridge = this.ctx.expansionCombat?.bind?.(UID, 'caster') ?? null;
    this.attachPosition.copy(this.origin).addScaledVector(this.direction, this.length);

    this._seed = Math.random() * 100;
    this._spin = Math.random() * TAU;
    this._twist = 0;
    this._sheet = 0;
    this._shownStrikes = 0;
    this._warpKick = 0;
    this._boltPower = 1;
    this._latchPending = false;
    this._nextFeed = 0;
    // Read once per cast: matchMedia allocates, and the answer never changes mid-cast.
    this._reduced = prefersReducedMotion();
    this.cloudPosition.copy(this.origin);
    this.rainEmitter.reset();
    this.mistEmitter.reset();
    this.cloud.visible = true;
    this.shadow.visible = true;
    this.warp.visible = true;
    for (const mesh of this.strands) mesh.visible = false;
    this.strike.visible = false;
    for (const mesh of this.strikeBranches) mesh.visible = false;
    this.flare.visible = false;
    this._draw(0);
  }

  onTravel(dt) {
    this._draw(dt);
  }

  onImpact() {
    this._arrive();
    // The bite lands on the next drawn frame, on the host if one is found.
    this._latchPending = true;
    if (!this.bridge) return;
    const result = this.bridge.queryActors({
      position: [this.attachPosition.x, 0, this.attachPosition.z],
      radius: this.config.attachRadius,
      relation: 'enemy'
    });
    if (!result?.ok) return;
    // Nearest live actor, ties broken by id — the original ordering, without
    // building a filtered and sorted copy of the snapshot list.
    let best = null;
    let bestD = Infinity;
    const actors = result.actors ?? NO_ACTORS;
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i];
      if (!actor.alive) continue;
      const d = (actor.position[0] - this.attachPosition.x) ** 2 + (actor.position[2] - this.attachPosition.z) ** 2;
      if (d < bestD || (d === bestD && best && actor.id.localeCompare(best.id) < 0)) {
        best = actor;
        bestD = d;
      }
    }
    if (!best) return;
    this.targetId = best.id;
    for (let i = 0; i < EVENT_TYPES.length; i++) {
      const sub = this.bridge.on(EVENT_TYPES[i], this._onEvent);
      if (sub?.ok) this.unsub.push(sub.unsubscribe);
      else {
        this._clearSubscriptions();
        this.targetId = null;
        break;
      }
    }
  }

  /** Gameplay only: the visuals of a strike are drawn on the next frame. */
  _react(event) {
    if (!this.targetId || event.ownerId !== this.targetId || this.seen.has(event.eventId) || this.age < this.nextPulse) return;
    this.seen.add(event.eventId);
    if (this.seen.size > 64) this.seen.delete(this.seen.values().next().value);
    const target = this.bridge.getActor(this.targetId);
    if (!target?.ok || !target.actor?.alive) return;
    const result = this.bridge.emit({
      type: 'hit',
      element: 'storm',
      targetIds: [this.targetId],
      position: target.actor.position,
      damage: this.config.retaliation,
      tags: ['parasite-retaliation']
    });
    if (result?.ok) {
      this.nextPulse = this.age + this.config.reactionCooldown;
      this.lastFlash = this.age;
      this._boltPower = 1;
      this.lastEventCount++;
    }
  }

  onFade(dt, t) {
    if (this.targetId) {
      const result = this.bridge.getActor(this.targetId);
      if (result?.ok && result.actor?.alive) this.attachPosition.fromArray(result.actor.position);
      else {
        this.targetId = null;
        this._clearSubscriptions();
      }
    }
    this._draw(dt, t);
  }

  /* ------------------------------------------------------------------ */
  /* Beats                                                               */
  /* ------------------------------------------------------------------ */

  /** The downdraft as it condenses over the circle. */
  _arrive() {
    const c = this.config;
    const g = settings.global;
    _pos.copy(this.attachPosition).setY(0);
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, _pos, {
      radius: c.gustRadius,
      life: 0.9,
      intensity: 0.8,
      colorA: getColor(c.colorGustA),
      colorB: getColor(c.colorGustB)
    });
    _pos.y = c.cloudHeight * 0.5;
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _pos, {
      radius: 0.3,
      endRadius: c.gustRadius * 0.8 * g.explosionIntensity,
      life: 0.5,
      intensity: 0.6,
      opacity: 0.4,
      squash: 0.35,
      colorA: getColor(c.colorGustB),
      colorB: getColor(c.colorGustA),
      colorC: getColor(c.colorCloudMid)
    });
    this._mist(this.cloudPosition, 10 * settings.global.particleCount, 1);
    this._sheet = 1;
    if (c.attachShake > 0) this.ctx.shake?.add?.(c.attachShake * g.cameraShake, 5, 14);
    if (c.attachFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorFlash), c.attachFlash * g.explosionIntensity);
  }

  /** A bite or a feeding bolt: presentation only, no combat event. */
  _visualStrike(power) {
    this.lastFlash = this.age;
    this._boltPower = power;
    this._strikeBeat(power);
  }

  /** One retaliation (power 1) or bite, seen: bolt, flood, shell, burn, spray, knock, flash. */
  _strikeBeat(power = 1) {
    const c = this.config;
    const g = settings.global;
    if (power === 1 && this._boltPower === 1) this._shownStrikes = this.lastEventCount;
    this._rollStrike();
    _pos.copy(this.attachPosition).setY(1);
    this.ctx.bursts?.spawn?.(BurstMode.STORM, _pos, {
      radius: 0.15,
      endRadius: c.strikeBurst * power * g.explosionIntensity,
      life: 0.35,
      intensity: 1.2 * power,
      opacity: 0.65,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _pos.y = 0;
    this.ctx.decals?.spawn?.(DecalType.ARC, _pos, {
      radius: c.strikeMark * (0.5 + 0.5 * power),
      life: c.strikeMarkLife,
      intensity: 1,
      colorA: getColor(c.colorScorchA),
      colorB: getColor(c.colorScorchB)
    });
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: c.strikeMark * 0.5 * (0.5 + 0.5 * power),
      life: c.strikeMarkLife * 1.4,
      intensity: 0.8,
      colorA: getColor(c.colorScorchA),
      colorB: getColor(c.colorScorchB)
    });
    _pos.y = 0.9;
    this._sparks(_pos, c.sparkCount * power);
    this.lightBoost = Math.max(this.lightBoost, c.strikeLight * power * g.explosionIntensity);
    this._warpKick = Math.max(this._warpKick, power);
    if (c.strikeShake > 0) this.ctx.shake?.add?.(c.strikeShake * power * g.cameraShake, 8, 24);
    if (c.strikeFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorFlash), c.strikeFlash * power * g.explosionIntensity);
  }

  /* ------------------------------------------------------------------ */
  /* Drawing                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * @param {number} dt
   * @param {number} [t] the phase clock from `onFade` (0..1 impact, 1..2 fade)
   */
  _draw(dt, t = 0) {
    const c = this.config;
    const g = settings.global;
    const travelling = this.phase === AbilityPhase.TRAVEL;
    const fading = this.phase === AbilityPhase.FADE;
    if (!travelling && this.lastEventCount !== this._shownStrikes) {
      this._boltPower = 1;
      this._strikeBeat(1);
    }
    if (!travelling && this._latchPending) {
      this._latchPending = false;
      if (c.latchStrength > 0) this._visualStrike(c.latchStrength);
      this._nextFeed = this.age + Math.max(0.1, c.feedInterval);
    }
    // Feeding: irregular smaller bolts while it rides (never in the fade).
    if (!travelling && !fading && !this._reduced && dt > 0 && c.feedInterval > 0 && c.feedStrength > 0 && this.age >= this._nextFeed) {
      this._nextFeed = this.age + c.feedInterval * (1 + (Math.random() * 2 - 1) * saturate(c.feedJitter));
      this._visualStrike(c.feedStrength);
    }

    /* --- where the cloud is --- */
    if (travelling) {
      this.pointAt(this.u, _travel);
      this.cloudPosition.copy(_travel);
    } else if (dt > 0) {
      // A spring behind its host: it is carried, it is not glued on.
      this.cloudPosition.lerp(this.attachPosition, 1 - Math.exp(-Math.max(0.1, c.cloudFollow) * dt));
    } else {
      this.cloudPosition.copy(this.attachPosition);
    }
    this._spin += c.cloudSpin * TAU * dt * g.animationSpeed;
    if (!this._reduced) this._twist += (c.cloudTwist ?? 0) * dt * g.animationSpeed;

    /* --- how much cloud there is --- */
    const since = travelling ? 0 : this.impactTime + (fading ? this.impactDuration : 0);
    const grow = travelling ? 0 : Easing.outBack(saturate(since / Math.max(0.05, c.formTime)));
    // It feeds and grows: swelling across the whole ride, not just on arrival.
    const ride = travelling ? 0 : saturate(since / Math.max(0.2, this.impactDuration));
    // Sized off the zone it hunts in, so the storm always roofs the crowd it
    // landed on: `cloudZoneSpan` × the attach circle's diameter (the authored
    // cluster is ≈ 2.9 m across at scale 1); `cloudSize` is the floor.
    const zoneSize = Math.max(0, c.cloudZoneSpan ?? 0) * 2 * Math.max(0, c.attachRadius) / 2.9;
    const baseSize = travelling ? c.cloudSize : Math.max(c.cloudSize, zoneSize);
    let scale = baseSize * (c.seedScale + (1 - c.seedScale) * grow) * (1 + (c.cloudSwell ?? 0) * ride);
    // In flight the stormlet condenses out of nothing over its first moments
    // (form 0 on the first frame), then on arrival heaps up to fully formed.
    let form = travelling ? 0.8 * Easing.outCubic(saturate(this.age / Math.max(0.05, c.formTime * 0.5))) : Math.min(1, 0.8 + 0.2 * grow);
    let fade = 1;
    if (fading) {
      const ft = saturate(t - 1);
      form = 1 - Easing.inQuad(ft);
      fade = 1 - Easing.inCubic(ft);
      // It spreads out as it rains away.
      scale *= 1 + ft * 0.25;
    }
    const bob = this._reduced ? 0 : Math.sin(this.age * 1.3 + this._seed) * c.cloudBob;
    // A bigger cloud rides higher by just its extra belly depth, so the belly
    // stays where `cloudHeight` put it and the mass towers up, not down.
    const height = c.cloudHeight + Math.max(0, baseSize - c.cloudSize) * 0.37 * c.cloudFlatten + bob;
    this.cloud.position.set(this.cloudPosition.x, height, this.cloudPosition.z);
    this.cloud.scale.set(scale, scale * c.cloudFlatten, scale);
    this.cloud.rotation.y = this._spin;

    /* --- lightning inside it --- */
    const strike = Math.max(0, 1 - (this.age - this.lastFlash) / Math.max(0.02, c.strikeLife)) * this._boltPower;
    this._sheet = Math.max(0, this._sheet - dt * 9);
    const sheetRate = this._reduced ? c.idleFlash * 0.25 : c.idleFlash;
    if (!travelling && dt > 0 && Math.random() < sheetRate * dt) {
      this._sheet = 0.6 + Math.random() * 0.4;
      this._sheetPos.set(Math.random() * 1.6 - 0.8, Math.random() * 0.5, Math.random() * 1.2 - 0.6);
    }
    const cs = this._cloudState;
    cs.seed = this._seed;
    cs.form = form;
    cs.flash = strike;
    cs.sheet = Math.max(this._sheet, strike);
    cs.fade = fade;
    cs.twist = this._twist;
    cs.anvil = (c.cloudAnvil ?? 1) * Easing.outCubic(ride);
    cs.surge = this._reduced ? 0 : strike;
    this.cloudMaterial.uniforms.uSoftFade.value = c.softFade;
    this.cloudMaterial.userData.sync(c, cs);

    /* --- the tether and the strike --- */
    const attached = !!this.targetId && !travelling;
    this._writeTether(attached, height, scale, strike, fade);
    if (travelling) this._writeLeash(height, scale);
    this._writeStrike(strike, height, scale);

    /* --- ground and warp --- */
    this.shadow.position.set(this.cloudPosition.x, 0, this.cloudPosition.z);
    const ss = this._shadowState;
    ss.radius = c.shadowRadius * scale;
    ss.fade = fade * (travelling ? 0.25 : saturate(grow));
    ss.rain = travelling ? 0 : 1;
    ss.seed = this._seed;
    ss.flash = strike;
    ss.scorch = travelling ? 0 : Easing.outCubic(saturate(since / 2.5));
    this.shadowMaterial.userData.sync(c, ss);

    /* --- the contact flare where the bolt lands --- */
    const fs = this._flareState;
    this.flare.visible = strike > 0.01 && (c.flareSize ?? 0) > 0;
    fs.fade = strike;
    fs.size = (c.flareSize ?? 1.1) * Math.max(0.3, this._boltPower) * (0.7 + 0.3 * strike) * g.explosionIntensity;
    fs.roll = this._strikeRoll * 0.37;
    this.flare.position.set(this.attachPosition.x, 0.35, this.attachPosition.z);
    this.flareMaterial.userData.sync(c, fs);

    this._warpKick = Math.max(0, this._warpKick - dt * 3);
    const ws = this._warpState;
    ws.width = scale * 2.6;
    ws.height = height + 0.5;
    ws.strength = fade * (travelling ? 0.2 : 0.6) + this._warpKick * c.strikeWarp;
    ws.seed = this._seed;
    this.warpMaterial.userData.sync(c, ws);
    this.warp.position.set(this.cloudPosition.x, (height + 0.5) * 0.5, this.cloudPosition.z);

    /* --- weather --- */
    this._syncParticles();
    if (!travelling) this._rain(dt, height, scale, fading ? 1 + (t - 1) : 1);
    this._mistRate(dt, height, scale, travelling ? 0.5 : 1 - (fading ? saturate(t - 1) : 0));

    // The light lives inside the cloud.
    this.position.set(this.cloudPosition.x, height - 0.3, this.cloudPosition.z);
  }

  /** Strands crackling from the cloud's belly onto the host's shoulders. */
  _writeTether(attached, height, scale, strike, fade) {
    const c = this.config;
    const count = Math.min(MAX_STRANDS, Math.max(0, Math.floor(c.strandCount)));
    const rate = this._reduced ? Math.min(3, c.strandFlicker) : c.strandFlicker;
    const tick = Math.floor(this.age * rate);
    const base = height - 0.35 * scale * c.cloudFlatten;
    for (let i = 0; i < MAX_STRANDS; i++) {
      const mesh = this.strands[i];
      mesh.visible = attached && i < count;
      if (!mesh.visible) continue;
      const a = (i / Math.max(1, count)) * TAU + this._spin;
      _a.set(
        this.cloudPosition.x + Math.cos(a) * c.strandSpread * scale,
        base,
        this.cloudPosition.z + Math.sin(a) * c.strandSpread * scale
      );
      _b.set(this.attachPosition.x + Math.cos(a) * 0.12, c.strandReach, this.attachPosition.z + Math.sin(a) * 0.12);
      this._writeBolt(mesh, _a, _b, STRAND_POINTS, c.strandWidth, c.strandJag, tick + i * 7);
    }
    // Idle crackle, swelling to full on a strike.
    const flicker = 0.6 + 0.4 * Math.sin(this.age * 37 + Math.sin(this.age * 11) * 3);
    this.strandMaterial.userData.sync(c, (c.strandOpacity * flicker + strike) * fade);
  }

  /** In flight: one crackling strand from the caster's hand to the stormlet. */
  _writeLeash(height, scale) {
    const c = this.config;
    const mesh = this.strands[0];
    mesh.visible = c.travelLeash > 0;
    if (!mesh.visible) return;
    _a.set(this.origin.x + this.direction.x * 0.5, 1.4, this.origin.z + this.direction.z * 0.5);
    _b.set(this.cloudPosition.x, height - 0.3 * scale * c.cloudFlatten, this.cloudPosition.z);
    const rate = this._reduced ? Math.min(3, c.strandFlicker) : c.strandFlicker;
    this._writeBolt(mesh, _a, _b, STRAND_POINTS, c.strandWidth * 1.4, c.strandJag * 2, Math.floor(this.age * rate));
    const flicker = 0.6 + 0.4 * Math.sin(this.age * 37 + Math.sin(this.age * 11) * 3);
    this.strandMaterial.userData.sync(c, c.travelLeash * flicker * (1 - this.u * 0.4));
  }

  /** The retaliation bolt, cloud to host's feet, plus two branches. */
  _writeStrike(strike, height, scale) {
    const c = this.config;
    const visible = strike > 0;
    this.strike.visible = visible;
    for (const mesh of this.strikeBranches) mesh.visible = visible && c.strikeBranchLength > 0;
    this.strikeMaterial.userData.sync(c, strike);
    if (!visible) return;
    _a.set(this.cloudPosition.x, height - 0.3 * scale, this.cloudPosition.z);
    _b.set(this.attachPosition.x, 0.05, this.attachPosition.z);
    this._writeBolt(this.strike, _a, _b, STRIKE_POINTS, c.strikeWidth, c.strikeJag, this._strikeRoll);
    if (c.strikeBranchLength <= 0) return;
    const p = this.strike.geometry.attributes.position;
    for (let k = 0; k < 2; k++) {
      // Branch from a third and two thirds of the way down the main channel.
      const at = Math.round((STRIKE_POINTS - 1) * (k ? 0.62 : 0.34));
      _a.set((p.getX(at * 2) + p.getX(at * 2 + 1)) * 0.5, (p.getY(at * 2) + p.getY(at * 2 + 1)) * 0.5, (p.getZ(at * 2) + p.getZ(at * 2 + 1)) * 0.5);
      const angle = this._strikeRoll * 1.7 + k * Math.PI;
      _b.set(
        _a.x + Math.cos(angle) * c.strikeBranchLength,
        _a.y - c.strikeBranchLength * 0.6,
        _a.z + Math.sin(angle) * c.strikeBranchLength
      );
      this._writeBolt(this.strikeBranches[k], _a, _b, BRANCH_POINTS, c.strikeWidth * 0.5, c.strikeJag * 0.6, this._strikeRoll + k * 13);
    }
  }

  _rollStrike() {
    this._strikeRoll = Math.floor(Math.random() * 1000);
  }

  /**
   * One ribbon between two points, jagged across both axes perpendicular to
   * it and pinned at the ends by `sin(πs)`. The ribbon's width runs along the
   * horizontal perpendicular, so a near-vertical bolt reads from any side.
   */
  _writeBolt(mesh, from, to, points, width, jag, seed) {
    const p = mesh.geometry.attributes.position;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    // Horizontal perpendicular (falls back to X for a vertical bolt).
    let sx = -dz;
    let sz = dx;
    const sl = Math.hypot(sx, sz);
    if (sl < 1e-4) {
      sx = 1;
      sz = 0;
    } else {
      sx /= sl;
      sz /= sl;
    }
    const amp = jag * settings.global.noiseStrength * Math.min(1, len / 1.5);
    for (let i = 0; i < points; i++) {
      const s = i / (points - 1);
      const env = Math.sin(Math.PI * s);
      const j1 = (Math.sin(i * 5.31 + seed * 1.13) + Math.sin(i * 2.17 - seed * 0.71)) * 0.5 * env * amp;
      const j2 = Math.sin(i * 3.73 + seed * 2.41) * env * amp * 0.7;
      const x = from.x + dx * s + sx * j1;
      const y = from.y + dy * s + j2 * 0.5;
      const z = from.z + dz * s + sz * j1 + j2 * 0.3;
      p.setXYZ(i * 2, x - sx * width, y, z - sz * width);
      p.setXYZ(i * 2 + 1, x + sx * width, y, z + sz * width);
    }
    p.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    if (this.rainSystem) {
      const u = this.rainSystem.uniforms;
      this.rainSystem.setGradient(getColor(c.colorRainA), getColor(c.colorRainB), getColor(c.colorRainC), getColor(c.colorRainD));
      u.uStretch.value = c.rainStretch;
      u.uOpacity.value = c.rainOpacity * g.opacity;
      u.uGlow.value = g.glow;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uGravity.value.set(0, -6, 0);
      u.uTurbulence.value = 0.05 * g.turbulence;
    }
    if (this.mistSystem) {
      const u = this.mistSystem.uniforms;
      this.mistSystem.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
      u.uOpacity.value = c.mistOpacity * g.opacity;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uGravity.value.set(0, -0.15, 0);
      u.uTurbulence.value = 0.6 * g.turbulence;
    }
    if (this.sparkSystem) {
      const u = this.sparkSystem.uniforms;
      this.sparkSystem.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
      u.uStretch.value = 0.6;
      u.uGlow.value = 2 * g.glow;
      u.uOpacity.value = g.opacity;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uGravity.value.set(0, -5, 0);
    }
  }

  _rain(dt, height, scale, strength) {
    if (!this.rainSystem || dt <= 0) return;
    const c = this.config;
    const n = Math.round(this.rainEmitter.tick(dt, c.rainRate * strength * settings.global.particleCount));
    if (n <= 0) return;
    _pos.set(this.cloudPosition.x, height - 0.35 * scale * c.cloudFlatten, this.cloudPosition.z);
    _emit.position = _pos;
    _emit.radius = c.rainSpread * scale;
    _emit.direction = DOWN;
    _emit.speed = c.rainSpeed;
    _emit.speedVariance = 0.2;
    _emit.spread = 0.05;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.rainSize;
    _emit.sizeVariance = 0.3;
    _emit.life = c.rainLife;
    _emit.lifeVariance = 0.25;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.rainSystem.emit(Math.min(n, 64), _emit);
  }

  _mistRate(dt, height, scale, strength) {
    if (!this.mistSystem || dt <= 0) return;
    const n = Math.round(this.mistEmitter.tick(dt, this.config.mistRate * strength * settings.global.particleCount));
    if (n > 0) {
      _pos.set(this.cloudPosition.x, height - 0.25 * scale, this.cloudPosition.z);
      this._mist(_pos, n, scale);
    }
  }

  _mist(position, count, scale = 1) {
    if (!this.mistSystem) return;
    const c = this.config;
    const n = Math.min(32, Math.max(0, Math.round(count)));
    if (n <= 0) return;
    _emit.position = position;
    _emit.radius = 0.7 * scale;
    _emit.direction = _dir.set(0, -0.3, 0);
    _emit.speed = 0.3;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.mistSize * scale;
    _emit.sizeVariance = 0.5;
    _emit.life = c.mistLife;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.4;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.mistSystem.emit(n, _emit);
  }

  _sparks(position, count) {
    if (!this.sparkSystem) return;
    const c = this.config;
    const n = Math.min(96, Math.max(0, Math.round(count * settings.global.particleCount)));
    if (n <= 0) return;
    _emit.position = position;
    _emit.radius = 0.25;
    _emit.direction = UP;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.sparkSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sparkLife;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.sparkSystem.emit(n, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  _clearSubscriptions() {
    for (const off of this.unsub) off();
    this.unsub.length = 0;
  }

  onDestroy() {
    this._clearSubscriptions();
    this.targetId = null;
    this.bridge = null;
    this.seen.clear();
    this._sheet = 0;
    this._warpKick = 0;
    this.cloudMaterial.uniforms.uFlash.value = 0;
    this.strikeMaterial.uniforms.uFade.value = 0;
    this.strandMaterial.uniforms.uFade.value = 0;
    this.cloud.visible = false;
    this.shadow.visible = false;
    this.warp.visible = false;
    for (const mesh of this.strands) mesh.visible = false;
    this.strike.visible = false;
    for (const mesh of this.strikeBranches) mesh.visible = false;
    this.flare.visible = false;
  }

  dispose() {
    this.onDestroy();
    this.cloudGeometry.dispose();
    this.cloudMaterial.dispose();
    // The pre-pass shares the geometry and uniforms; only its program is its own.
    this.cloudDepthMaterial.dispose();
    for (const mesh of this.strands) mesh.geometry.dispose();
    this.strandMaterial.dispose();
    this.strike.geometry.dispose();
    for (const mesh of this.strikeBranches) mesh.geometry.dispose();
    this.strikeMaterial.dispose();
    this.flareGeometry.dispose();
    this.flareMaterial.dispose();
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
    this.warpGeometry.dispose();
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

/** A sub-folder where the host GUI nests; a flat host gets the parent back. */
function section(parent, title) {
  return typeof parent.addFolder === 'function' ? parent.addFolder(title) : parent;
}

/** `Editor.gradient`, with the same flat-host fallback as `section`. */
function gradient(folder, c, prefix, title, Editor) {
  if (typeof folder.addFolder === 'function') return Editor.gradient(folder, c, prefix, title);
  for (const stop of ['A', 'B', 'C', 'D']) folder.addColor(c, `${prefix}${stop}`).name(`${title} ${stop}`);
  return folder;
}

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('☁  Thunderhead Parasite');
  const R = Editor.range;

  const cast = section(folder, 'The cast');
  R(cast, c, 'range', 2, 48, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'stormlet speed (m/s)');
  R(cast, c, 'cooldown', 0, 30, 0.05, 'cooldown');
  R(cast, c, 'lifetime', 0.1, 4, 0.05, 'lifetime (informational)');
  if (Editor.castAnimation) Editor.castAnimation(cast, c);

  const light = section(folder, 'Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'stutter');
  R(light, c, 'strikeLight', 0, 40, 0.1, 'punch per strike');

  const parasite = section(folder, 'The parasite');
  R(parasite, c, 'attachRadius', 0.5, 5, 0.1, 'attachment radius');
  R(parasite, c, 'duration', 1, 12, 0.1, 'duration');
  R(parasite, c, 'reactionCooldown', 0.1, 2, 0.05, 'reaction cooldown');
  R(parasite, c, 'retaliation', 0, 3, 0.05, 'retaliation');

  const cloud = section(folder, '1 · Thunderhead');
  R(cloud, c, 'cloudHeight', 0.8, 8, 0.05, 'height (m)');
  R(cloud, c, 'cloudSize', 0.2, 4, 0.01, 'size (minimum)');
  R(cloud, c, 'cloudZoneSpan', 0, 2.5, 0.01, 'width × zone diameter');
  R(cloud, c, 'cloudShade', 0, 1.5, 0.01, 'body brightness');
  R(cloud, c, 'cloudSkyFill', 0, 1, 0.01, 'sky fill on tops');
  R(cloud, c, 'cloudFlashWash', 0, 0.5, 0.005, 'flash on dense faces');
  R(cloud, c, 'cloudFlatten', 0.3, 1.5, 0.01, 'flatten');
  R(cloud, c, 'cloudBillow', 0, 0.6, 0.005, 'billow (m)');
  R(cloud, c, 'cloudBillowScale', 0.2, 6, 0.05, 'billow scale');
  R(cloud, c, 'cloudDrift', 0, 3, 0.01, 'billow speed');
  R(cloud, c, 'cloudSpin', -1, 1, 0.005, 'wheel (turns/s)');
  R(cloud, c, 'cloudOpacity', 0, 1, 0.01, 'opacity');
  R(cloud, c, 'cloudBoil', 0, 0.4, 0.005, 'lobe boil');
  R(cloud, c, 'cloudBoilRate', 0, 4, 0.05, 'boils/s');
  R(cloud, c, 'cloudTwist', -1, 1, 0.01, 'updraft shear (rad/s)');
  R(cloud, c, 'cloudAnvil', 0, 1.5, 0.01, 'anvil spread');
  R(cloud, c, 'cloudSwell', 0, 1, 0.01, 'grows as it feeds');
  R(cloud, c, 'cloudSurge', 0, 0.3, 0.005, 'heave per bolt');
  R(cloud, c, 'cloudCrownLight', 0, 1.5, 0.01, 'crown light');
  R(cloud, c, 'cloudLining', 0, 3, 0.01, 'silver lining');
  R(cloud, c, 'cloudEmber', 0, 2, 0.01, 'crevice smoulder');
  R(cloud, c, 'cloudEdge', 0.1, 6, 0.05, 'wisp edge');
  R(cloud, c, 'cloudFollow', 0.5, 30, 0.1, 'follow tightness');
  R(cloud, c, 'cloudBob', 0, 0.6, 0.005, 'bob (m)');
  R(cloud, c, 'formTime', 0.05, 2, 0.01, 'condense time (s)');
  R(cloud, c, 'seedScale', 0.05, 1, 0.01, 'stormlet size (× cloud)');
  R(cloud, c, 'softFade', 0.01, 3, 0.01, 'soft intersection (m)');
  R(cloud, c, 'flashGlow', 0, 10, 0.05, 'inner lightning glow');
  R(cloud, c, 'idleFlash', 0, 6, 0.05, 'sheet lightning / s');
  cloud.addColor(c, 'colorCloudDark').name('belly');
  cloud.addColor(c, 'colorCloudMid').name('body');
  cloud.addColor(c, 'colorCloudLit').name('crown');
  cloud.addColor(c, 'colorCloudFlash').name('inner lightning');

  const tether = section(folder, '2 · Tether');
  R(tether, c, 'strandCount', 0, MAX_STRANDS, 1, 'strands');
  R(tether, c, 'strandReach', 0, 3, 0.01, 'touches at (m)');
  R(tether, c, 'strandSpread', 0, 2, 0.01, 'fan at cloud (m)');
  R(tether, c, 'strandWidth', 0.005, 0.2, 0.001, 'width (m)');
  R(tether, c, 'strandJag', 0, 0.8, 0.01, 'jag (m)');
  R(tether, c, 'strandFlicker', 0, 40, 0.5, 're-shapes/s');
  R(tether, c, 'strandGlow', 0, 6, 0.01, 'glow');
  R(tether, c, 'strandOpacity', 0, 1, 0.01, 'idle brightness');
  R(tether, c, 'travelLeash', 0, 2, 0.01, 'leash in flight');
  tether.addColor(c, 'colorStrandCore').name('core');
  tether.addColor(c, 'colorStrandBody').name('body');
  tether.addColor(c, 'colorStrandHalo').name('halo');

  const strike = section(folder, '3 · Strike');
  R(strike, c, 'strikeLife', 0.02, 1, 0.01, 'lasts (s)');
  R(strike, c, 'strikeWidth', 0.01, 0.4, 0.005, 'width (m)');
  R(strike, c, 'strikeJag', 0, 1.2, 0.01, 'jag (m)');
  R(strike, c, 'strikeGlow', 0, 10, 0.05, 'glow');
  R(strike, c, 'strikeBranchLength', 0, 3, 0.05, 'branch length (m)');
  R(strike, c, 'strikeShake', 0, 1, 0.01, 'camera knock');
  R(strike, c, 'strikeFlash', 0, 0.5, 0.01, 'flash');
  R(strike, c, 'flareSize', 0, 4, 0.05, 'contact flare (m)');
  R(strike, c, 'flareGlow', 0, 6, 0.05, 'contact flare glow');
  R(strike, c, 'strikeBurst', 0, 4, 0.05, 'shell (m)');
  R(strike, c, 'strikeMark', 0, 4, 0.05, 'burn (m)');
  R(strike, c, 'strikeMarkLife', 0.1, 6, 0.05, 'burn life');
  R(strike, c, 'strikeWarp', 0, 4, 0.05, 'distortion kick');
  R(strike, c, 'latchStrength', 0, 1.5, 0.01, 'bite on arrival (× strike)');
  R(strike, c, 'feedInterval', 0, 4, 0.05, 'feeding bolt every (s)');
  R(strike, c, 'feedJitter', 0, 1, 0.01, 'feeding irregularity');
  R(strike, c, 'feedStrength', 0, 1.5, 0.01, 'feeding bolt (× strike)');
  strike.addColor(c, 'colorStrikeCore').name('bolt core');
  strike.addColor(c, 'colorStrikeBody').name('bolt body');
  strike.addColor(c, 'colorBurstA').name('shell inner');
  strike.addColor(c, 'colorBurstB').name('shell mid');
  strike.addColor(c, 'colorBurstC').name('shell outer');
  strike.addColor(c, 'colorScorchA').name('burn dark');
  strike.addColor(c, 'colorScorchB').name('burn hot');
  strike.addColor(c, 'colorFlash').name('flash');

  const arrival = section(folder, '4 · Arrival');
  R(arrival, c, 'attachShake', 0, 1, 0.01, 'camera knock');
  R(arrival, c, 'attachFlash', 0, 0.5, 0.01, 'flash');
  R(arrival, c, 'gustRadius', 0, 6, 0.05, 'downdraft ring (m)');
  arrival.addColor(c, 'colorGustA').name('dust dark');
  arrival.addColor(c, 'colorGustB').name('dust light');

  const rain = section(folder, '5 · Rain');
  R(rain, c, 'rainRate', 0, 400, 1, 'drops/s');
  R(rain, c, 'rainSpeed', 0, 30, 0.1, 'speed');
  R(rain, c, 'rainSize', 0.005, 0.2, 0.001, 'width');
  R(rain, c, 'rainLife', 0.05, 2, 0.01, 'lifetime');
  R(rain, c, 'rainStretch', 0, 1, 0.01, 'stretch');
  R(rain, c, 'rainOpacity', 0, 1, 0.01, 'opacity');
  R(rain, c, 'rainSpread', 0, 2, 0.01, 'spread (× cloud)');
  gradient(rain, c, 'colorRain', 'rain gradient', Editor);

  const mist = section(folder, '6 · Mist');
  R(mist, c, 'mistRate', 0, 80, 0.5, 'puffs/s');
  R(mist, c, 'mistSize', 0.05, 3, 0.01, 'size');
  R(mist, c, 'mistLife', 0.1, 6, 0.05, 'lifetime');
  R(mist, c, 'mistOpacity', 0, 1, 0.01, 'opacity');
  gradient(mist, c, 'colorMist', 'mist gradient', Editor);

  const sparks = section(folder, '7 · Sparks');
  R(sparks, c, 'sparkCount', 0, 96, 1, 'per strike');
  R(sparks, c, 'sparkSize', 0.005, 0.3, 0.005, 'width');
  R(sparks, c, 'sparkSpeed', 0, 20, 0.1, 'speed');
  R(sparks, c, 'sparkLife', 0.05, 2, 0.01, 'lifetime');
  gradient(sparks, c, 'colorSpark', 'spark gradient', Editor);

  const ground = section(folder, '8 · Ground & distortion');
  R(ground, c, 'shadowRadius', 0, 4, 0.01, 'shadow (× cloud)');
  R(ground, c, 'shadowOpacity', 0, 1, 0.01, 'shadow opacity');
  R(ground, c, 'shadowWet', 0, 1, 0.01, 'wet sheen');
  R(ground, c, 'crackleGlow', 0, 3, 0.01, 'crackle');
  R(ground, c, 'crackleScale', 0.2, 5, 0.05, 'crackle cells / m');
  R(ground, c, 'scorchDarken', 0, 1, 0.01, 'scorched centre');
  ground.addColor(c, 'colorShadow').name('shadow');
  ground.addColor(c, 'colorWet').name('wet sheen');
  R(ground, c, 'warpStrength', 0, 3, 0.01, 'downdraft warp');
  R(ground, c, 'warpScale', 0.1, 6, 0.01, 'warp scale');
  R(ground, c, 'warpSpeed', 0, 6, 0.01, 'warp speed');

  folder.close();
  return folder;
}
