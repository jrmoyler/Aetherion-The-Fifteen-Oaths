import {
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion, syncParticleGlobals } from '../ExpansionAtmosphere.js';
import { ParticleShape } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  createBeadGeometry,
  createHeartGeometry,
  createMoundGeometry,
  createQuad,
  createSeedGeometry,
  createSepalGeometry,
  createTendrilGeometry,
} from './geometry.js';
import {
  createBeadMaterial,
  createFieldMaterial,
  createHeartMaterial,
  createPulseWarpMaterial,
  createTendrilMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/symbiotic-exchange';

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Bound enemies (prey) one heart can hold. */
export const MAX_LINKS = 6;
/** Ally lines; line 0 is always the caster's lifeline. */
export const MAX_ALLIES = 3;
/** Extra roots plunging into the rim so the heart is rooted with no prey too. */
const MAX_ANCHORS = 8;
/** Tendril instances: ally lines, then prey roots, then anchors. */
const MAX_TENDRILS = MAX_ALLIES + MAX_LINKS + MAX_ANCHORS;
const PREY0 = MAX_ALLIES;
const ANCHOR0 = MAX_ALLIES + MAX_LINKS;
/** Sap beads in flight at once. */
const MAX_BEADS = 48;
/** Crown sepals round the heart's mouth. */
const SEPALS = 6;
/** Most beats an exchange can run (editor clamp). */
const MAX_PULSES = 8;

const BEAD_TAKE = 0; // prey → heart, amber
const BEAD_GIVE = 1; // heart → ally, green

const _scratch = new Object3D();
const _p = new Vector3();
const _q = new Vector3();
const _hand = new Vector3();
const _up = new Vector3(0, 1, 0);
const _down = new Vector3(0, -1, 0);
const _dir = new Vector3();
const _emit = {};
const _point = [0, 0, 0];
const _source = [0, 0, 0];
const _found = [];
const _near = [];

/** One frame's resolved tendril shape — module scratch, filled per record. */
const _shape = { ax: 0, ay: 0, az: 0, ex: 0, ey: 0, ez: 0, arc: 0, wrap: 0, bow: 0, seed: 0 };
/** Live tendril look, mirrored from the uniforms so the CPU twin matches. */
const _look = { amp: 0, freq: 0, speed: 0, wrapR: 0, wrapH: 0, turns: 0, portion: 0.3, clock: 0 };

/**
 * CPU twin of the tendril vertex stage's `centre(s)` (materials.js). Beads,
 * the thrown seed and the coil are placed with it, so they ride exactly on
 * the drawn root.
 */
export function tendrilPoint(t, look, s, out) {
  const cx = t.ex - t.ax;
  const cz = t.ez - t.az;
  const L = Math.max(Math.hypot(cx, cz), 1e-3);
  const dx = cx / L, dz = cz / L;
  const sx = -dz, sz = dx;
  const wrapP = t.wrap * look.portion;
  const sb = 1 - wrapP;
  const a0 = Math.atan2(-dz, -dx);
  let env;
  if (s <= sb) {
    const bx = t.ex + Math.cos(a0) * look.wrapR * t.wrap;
    const bz = t.ez + Math.sin(a0) * look.wrapR * t.wrap;
    const by = t.ey;
    const k = s / sb;
    const m = 1 - k;
    const mx = (t.ax + bx) * 0.5 + sx * t.bow;
    const my = (t.ay + by) * 0.5 + t.arc;
    const mz = (t.az + bz) * 0.5 + sz * t.bow;
    out.set(
      m * m * t.ax + 2 * m * k * mx + k * k * bx,
      m * m * t.ay + 2 * m * k * my + k * k * by,
      m * m * t.az + 2 * m * k * mz + k * k * bz,
    );
    env = Math.sin(Math.PI * k);
  } else {
    const k = (s - sb) / Math.max(wrapP, 1e-3);
    const ang = a0 + k * look.turns * TAU;
    out.set(t.ex + Math.cos(ang) * look.wrapR, t.ey + k * look.wrapH, t.ez + Math.sin(ang) * look.wrapR);
    env = 0;
  }
  const ph = s * look.freq * TAU - look.clock * look.speed + t.seed * TAU;
  const w = look.amp * env;
  out.x += sx * Math.sin(ph) * w;
  out.y += 0.6 * Math.cos(ph * 0.7 + 1.3) * w;
  out.z += sz * Math.sin(ph) * w;
  return out;
}

/**
 * SYMBIOTIC EXCHANGE — Nature, zone cast. *Ally regeneration link.*
 *
 * Every other nature cast in the matrix kills with growth — a flower that
 * bursts, a vault that closes, a canopy that lashes. This one *trades*: it
 * takes life out of what it binds and hands it back to its own side, and the
 * whole cast is that transaction made visible.
 *
 *   1. **anticipation** — a ribbed seed pod swells at the caster's hand for
 *      `chargeTime`, spores drawn into it.
 *   2. **travel** — the seed is lobbed at the circle and pays out a living
 *      vine behind it: the **lifeline**. Its far end *is* the seed (both are
 *      placed by `tendrilPoint`), so the vine visibly grows from the hand to
 *      the target.
 *   3. **impact** — the seed bursts into a root mound; the **symbiont heart**
 *      heaves out of it, sepals peeling open; root tendrils whip out (with
 *      an overshoot) to every enemy inside `zoneRadius` and coil round them,
 *      and eight more plunge into the rim. Earth shell, crack and dust ring,
 *      soil chips, a knock, a flash and a punch of light; the root field
 *      spreads across the floor.
 *   4. **linger — the exchange** — the heart beats `pulses` times. Each beat
 *      (lub-dub squeeze, a ring of light running *in* along the floor veins,
 *      a pressure ring through the air, a flush down every root) drains one
 *      share from every bound body: an amber bead climbs each root into the
 *      heart, whose veins fill from the bottom up; the heart converts it and
 *      a green bead runs down the lifeline to the ally, where motes rise.
 *      The lifeline sags from its throwing arc to a resting one; the roots
 *      squirm the whole time.
 *   5. **exit** — on the last beat the emptied prey is hauled into the heart
 *      and its root snaps back; then the heart folds its sepals, browns and
 *      sinks into the mound, the roots draw back tip-first, the lifeline
 *      last, and the field dissolves.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the heart** — `createHeartGeometry` (lobed, cupped pod) in
 *      `createHeartMaterial` (lit skin, filling veins, glowing cup), opaque
 *      on `LAYER.WORLD`, shadowed. The seed shares the material.
 *   2. **sepals and mound** — six curled, serrated sepals (instanced) and a
 *      heaved soil mound, `MeshStandardMaterial`, lit and shadowed.
 *   3. **the tendrils** — one instanced parameter tube in
 *      `createTendrilMaterial` on `LAYER.SHAPED` with its own shadow depth.
 *   4. **sap beads** — instanced drops in `createBeadMaterial`, additive.
 *   5. **the root field** — `createFieldMaterial` on the floor.
 *   6. **particles** — SOFT spores, DROPLET sap, lit CHIP soil, RING beats.
 *   7. **impact** — EARTH shell, CRACK + DUSTRING decals, shake, flash, light.
 *   8. **the pulse** — `createPulseWarpMaterial` on `LAYER.DISTORTION`.
 *
 * ## The rule (`handlesOwnHits`)
 *
 * At impact the heart binds up to `maxLinks` enemies inside `zoneRadius`,
 * nearest first, and up to `maxAllies` allies within `allyRadius` (the
 * caster is always ally 0). Beat k of `pulses` runs at
 * `latchTime + k·beatInterval` (× global lifetime) and drains every bound
 * enemy for `drainDamage`: through the combat binding as an attributed
 * `hit` (plus a nature `status` — entangled — at the first beat), or, with
 * no binding, by staining the dummy and felling it on the last beat. Exactly
 * `links × pulses` hits, never more. Each drained share becomes one bead to
 * the heart and then one bead to an ally (round-robin), crediting that ally
 * `regenPerShare`, capped at `regenCap` — the regeneration ledger
 * (`allyVitality`). The host has no heal event, so the ledger is the
 * regeneration; nothing is invented on the combat side.
 *
 * ## The editor rule
 *
 * Records hold dice (seeds), actor ids and event timestamps only. Every
 * dimension, time and colour is resolved from `settings.symbioticExchange`
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
    return MAX_TENDRILS + MAX_BEADS + SEPALS + 3;
  }

  /** Global lifetime scale on the authored clock. */
  get lifeScale() {
    return Math.max(0.1, settings.global.lifetime);
  }

  get pulseCount() {
    return Math.max(1, Math.min(MAX_PULSES, Math.round(this.config.pulses)));
  }

  /** Seconds (impact clock) of beat k. */
  beatTime(k) {
    const c = this.config;
    return (c.latchTime + k * c.beatInterval) * this.lifeScale;
  }

  get impactDuration() {
    const c = this.config;
    return this.beatTime(this.pulseCount - 1) + c.settleTime * this.lifeScale;
  }

  get fadeDuration() {
    return Math.max(0.1, this.config.exitTime * this.lifeScale);
  }

  /** Hold the seed at the hand for `chargeTime`, then throw it. */
  advance(dt) {
    if (this.age < this.config.chargeTime * this.lifeScale) {
      this.position.copy(this.origin);
      return false;
    }
    return super.advance(dt);
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
    const quad = own(createQuad());

    // 5 · the root field
    this.fieldMaterial = own(createFieldMaterial());
    this.field = new Mesh(quad, this.fieldMaterial);
    this.field.rotation.x = -Math.PI / 2;
    this.field.renderOrder = 2;
    this.field.layers.set(LAYER.VFX);
    this.root.add(this.field);

    // 1 · the heart and the seed
    this.heartMaterial = own(createHeartMaterial());
    this.heart = new Mesh(own(createHeartGeometry()), this.heartMaterial);
    this.heart.castShadow = true;
    this.heart.receiveShadow = true;
    this.heart.layers.set(LAYER.WORLD);
    this.root.add(this.heart);
    this.seed = new Mesh(own(createSeedGeometry()), this.heartMaterial);
    this.seed.castShadow = true;
    this.seed.layers.set(LAYER.WORLD);
    this.root.add(this.seed);

    // 2 · sepals and mound
    this.sepalMaterial = own(new MeshStandardMaterial({ color: 0x4f8a2e, roughness: 0.62, metalness: 0, side: 2 }));
    this.sepals = new InstancedMesh(own(createSepalGeometry()), this.sepalMaterial, SEPALS);
    this.sepals.castShadow = true;
    this.sepals.frustumCulled = false;
    this.sepals.layers.set(LAYER.WORLD);
    this.root.add(this.sepals);
    this.moundMaterial = own(new MeshStandardMaterial({ color: 0x3a2c1d, roughness: 0.92, metalness: 0 }));
    this.mound = new Mesh(own(createMoundGeometry()), this.moundMaterial);
    this.mound.castShadow = true;
    this.mound.receiveShadow = true;
    this.mound.layers.set(LAYER.WORLD);
    this.root.add(this.mound);

    // 3 · the tendrils: one instanced parameter tube
    this.tendrilMaterial = own(createTendrilMaterial());
    this.resources.push(this.tendrilMaterial.userData.depth);
    const tube = own(createTendrilGeometry());
    this.aStart = new InstancedBufferAttribute(new Float32Array(MAX_TENDRILS * 3), 3);
    this.aEnd = new InstancedBufferAttribute(new Float32Array(MAX_TENDRILS * 3), 3);
    this.aShape = new InstancedBufferAttribute(new Float32Array(MAX_TENDRILS * 4), 4);
    this.aLife = new InstancedBufferAttribute(new Float32Array(MAX_TENDRILS * 4), 4);
    tube.setAttribute('aStart', this.aStart);
    tube.setAttribute('aEnd', this.aEnd);
    tube.setAttribute('aShape', this.aShape);
    tube.setAttribute('aLife', this.aLife);
    this.tendrils = new InstancedMesh(tube, this.tendrilMaterial, MAX_TENDRILS);
    this.tendrils.customDepthMaterial = this.tendrilMaterial.userData.depth;
    this.tendrils.castShadow = true;
    this.tendrils.frustumCulled = false;
    this.tendrils.count = 0;
    this.tendrils.layers.set(LAYER.SHAPED);
    this.root.add(this.tendrils);

    // 4 · sap beads
    this.beadMaterial = own(createBeadMaterial());
    const bead = own(createBeadGeometry());
    this.aHue = new InstancedBufferAttribute(new Float32Array(MAX_BEADS), 1);
    bead.setAttribute('aHue', this.aHue);
    this.beads = new InstancedMesh(bead, this.beadMaterial, MAX_BEADS);
    this.beads.frustumCulled = false;
    this.beads.count = 0;
    this.beads.renderOrder = 9;
    this.beads.layers.set(LAYER.VFX);
    this.root.add(this.beads);

    // 8 · the pulse
    this.pulseMaterial = own(createPulseWarpMaterial());
    this.pulse = new Mesh(quad, this.pulseMaterial);
    this.pulse.rotation.x = -Math.PI / 2;
    this.pulse.visible = false;
    this.pulse.layers.set(LAYER.DISTORTION);
    this.root.add(this.pulse);

    /* ---- fixed-size record pools: a cast allocates nothing ---- */
    /** Tendril records: dice only (seed, bow sign), plus one event time. */
    this._tendrils = [];
    for (let i = 0; i < MAX_TENDRILS; i++) {
      this._tendrils.push({ seed: 0, bow: 0, ax: 0, ay: 0, az: 0, ex: 0, ey: 0, ez: 0, arc: 0, wrap: 0, grow: 0, flush: 0, hue: 0, thick: 1, on: false });
    }
    /** Prey: actor id or dummy, where it was last seen, beats drained, when felled. */
    this.links = [];
    for (let i = 0; i < MAX_LINKS; i++) {
      this.links.push({ active: false, id: null, dummy: null, x: 0, z: 0, drained: 0, felledAt: -1, lostAt: -1 });
    }
    /** Allies: id ('caster' for line 0), last position, vitality banked. */
    this.allies = [];
    for (let i = 0; i < MAX_ALLIES; i++) this.allies.push({ active: false, id: null, x: 0, z: 0, banked: 0 });
    /** Beads: which tendril, which way, when it set off, arrived yet. */
    this._beads = [];
    for (let i = 0; i < MAX_BEADS; i++) this._beads.push({ live: false, tendril: 0, kind: 0, born: 0, ally: 0 });

    /** Where the heart stands (set at impact; a position, not a dimension). */
    this._heart = new Vector3();
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._look = { color: '#4a3a24', rimColor: '#ffb64a', rimEmissive: 0.6, edgeColor: '#7a320c', edgeEmissive: 1.2 };
    this._heartState = { clock: 0, beat: 0, fill: 0, convert: 0, dry: 0 };
    this._fieldState = { clock: 0, grow: 0, beat: -1, mound: 0.4, zone: 0.85, fade: 1, dissolve: 0 };
    this._tendrilState = { clock: 0, dry: 0 };
    this._beadState = { fade: 1 };
    this._pulseState = { wave: 0, strength: 0, clock: 0 };
    this._disposed = false;
  }

  createParticles() {
    const get = (layer, opts) => this.ctx.particles?.get?.(`${ID}.${layer}`, opts) ?? null;
    this.spores = get('spores', { capacity: 900, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.4 });
    this.sap = get('sap', { capacity: 400, shape: ParticleShape.DROPLET, additive: true, softFade: 0.3 });
    this.soil = get('soil', { capacity: 300, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.2 });
    this.rings = get('rings', { capacity: 48, shape: ParticleShape.RING, additive: true, softFade: 0.2 });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._calm = prefersReducedMotion();
    this._clock = 0;
    this._beats = 0;
    this._lastBeat = -10;
    this._latched = false;
    this._taken = 0;
    this._given = 0;
    this._giveCursor = 0;
    this._sporeCarry = 0;
    this.hits = 0;
    this.allyVitality = 0;
    this._heart.copy(this.origin);
    for (let i = 0; i < MAX_TENDRILS; i++) {
      const t = this._tendrils[i];
      // Dice: a deterministic per-slot seed jittered by the pool's own count.
      t.seed = ((i * 0.618034 + (this._spawns ?? 0) * 0.2137) % 1);
      t.bow = ((i * 7) % 5) / 4 - 0.5;
      t.on = false;
      t.grow = 0;
      t.flush = 0;
    }
    this._spawns = (this._spawns ?? 0) + 1;
    this._turn = (this._spawns * 1.318) % TAU;
    this.linkCount = 0;
    for (const l of this.links) { l.active = false; l.id = null; l.dummy = null; l.drained = 0; l.felledAt = -1; l.lostAt = -1; }
    for (const a of this.allies) { a.active = false; a.id = null; a.banked = 0; }
    for (const b of this._beads) b.live = false;
    // The caster is always ally 0: its lifeline is the travel.
    const ally = this.allies[0];
    ally.active = true;
    ally.id = 'caster';
    this._casterPoint(_p);
    ally.x = _p.x;
    ally.z = _p.z;
    this.root.visible = true;
    this.heart.visible = false;
    this.sepals.visible = false;
    this.mound.visible = false;
    this.field.visible = false;
    this.pulse.visible = false;
    this.seed.visible = true;
    this._sync(0);
  }

  onTravel(dt) {
    this._sync(dt);
  }

  onImpact() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const r = c.zoneRadius;
    this.position.y = 0;
    this._heart.set(this.position.x, 0, this.position.z);
    this._bind();

    // The burst: shell, crack, dust, chips, knock, flash, light.
    this.lightBoost = c.impactLight * power;
    _p.set(this._heart.x, 0.05, this._heart.z);
    this.ctx.bursts?.spawn?.(BurstMode.EARTH, _p, {
      radius: 0.2, endRadius: r * c.burstReach * power, life: c.burstLife, intensity: c.burstIntensity,
      opacity: c.burstOpacity * g.opacity, squash: 0.45,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorBody), colorC: getColor(c.colorDeep),
    });
    this.ctx.decals?.spawn?.(DecalType.CRACK, _p, {
      radius: r * 0.62, life: c.decalLife, intensity: c.crackIntensity,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorDeep),
    });
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, _p, {
      radius: r * 0.9, life: c.decalLife * 0.4, intensity: c.dustIntensity,
      colorA: getColor(c.colorMound), colorB: getColor(c.colorDeep),
    });
    if (c.impactShake > 0) this.ctx.shake?.add?.(c.impactShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.impactFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.impactFlash * power);
    _p.y = c.moundHeight * 0.5;
    this._burst(this.soil, _p, c.soilCount, r * c.moundRadius * 0.6, c.soilSpeed, 0.75, c.soilSize, c.soilLife, _up);
    this._burst(this.rings, _p.setY(0.08), 1, 0, 0, 0, r * 1.2, c.ringLife, _up);
    this._sync(0);
  }

  onFade(dt) {
    if (this.phase === 'impact') {
      while (this._beats < this.pulseCount && this.impactTime >= this.beatTime(this._beats)) this._beat();
    }
    this._advanceBeads();
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The rule                                                            */
  /* ------------------------------------------------------------------ */

  /** Where the caster's lifeline leaves from: the hand, or the cast origin. */
  _casterPoint(out) {
    const ch = this.ctx.character?.position;
    if (ch) out.set(ch.x, 0, ch.z);
    else out.copy(this.origin);
    return out;
  }

  /** Choose prey and allies at impact: nearest first, bounded, deterministic. */
  _bind() {
    const c = this.config;
    const R = c.zoneRadius;
    const hx = this._heart.x, hz = this._heart.z;
    const want = Math.max(0, Math.min(MAX_LINKS, Math.round(c.maxLinks)));
    let n = 0;
    _near.length = 0;
    if (this._scope) {
      _point[0] = hx; _point[1] = 0; _point[2] = hz;
      const enemies = this._scope.queryActors({ position: _point, radius: R, relation: 'enemy' });
      if (!enemies.ok) this.failure = enemies.reason;
      else {
        for (const actor of enemies.actors) if (actor.alive !== false) _near.push(actor);
        _near.sort((a, b) => (Math.hypot(a.position[0] - hx, a.position[2] - hz) - Math.hypot(b.position[0] - hx, b.position[2] - hz)) || (a.id < b.id ? -1 : 1));
        for (let i = 0; i < _near.length && n < want; i++) {
          const l = this.links[n++];
          l.active = true;
          l.id = _near[i].id;
          l.x = _near[i].position[0];
          l.z = _near[i].position[2];
          l.dummy = this._dummyAt(l.x, l.z);
        }
      }
      const friends = this._scope.queryActors({ position: _point, radius: Math.max(0, Math.min(48, c.allyRadius)), relation: 'ally' });
      let m = 1;
      const wantAllies = Math.max(1, Math.min(MAX_ALLIES, Math.round(c.maxAllies)));
      if (friends.ok) {
        for (const actor of friends.actors) {
          if (m >= wantAllies) break;
          if (actor.id === 'caster' || actor.alive === false) continue;
          const a = this.allies[m++];
          a.active = true; a.id = actor.id; a.x = actor.position[0]; a.z = actor.position[2]; a.banked = 0;
        }
      }
    } else {
      const field = this.ctx.dummies;
      if (field?.findTargets) {
        field.findTargets(hx, hz, R, _found);
        for (let i = 0; i < _found.length && n < want; i++) {
          const d = _found[i];
          if (Math.hypot(d.position.x - hx, d.position.z - hz) > R) continue;
          const l = this.links[n++];
          l.active = true;
          l.id = null;
          l.dummy = d;
          l.x = d.position.x;
          l.z = d.position.z;
        }
      }
    }
    _near.length = 0;
    this.linkCount = n;
  }

  /** The sandbox dummy standing at an actor's position, for the stain only. */
  _dummyAt(x, z) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return null;
    field.findTargets(x, z, 0.35, _found);
    const d = _found[0] ?? null;
    _found.length = 0;
    return d;
  }

  /** One heartbeat: drain every bound body once, launch the beads. */
  _beat() {
    const c = this.config;
    const g = settings.global;
    const k = this._beats++;
    const last = k === this.pulseCount - 1;
    this._lastBeat = this.age;
    const hx = this._heart.x, hz = this._heart.z;
    const power = g.explosionIntensity;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    this._look.color = c.colorWither;
    this._look.rimColor = c.colorSap;
    this._look.edgeColor = c.colorSapDeep;
    for (let i = 0; i < MAX_LINKS; i++) {
      const l = this.links[i];
      if (!l.active) continue;
      let drained = false;
      if (this._scope) {
        // Hauled toward the heart: the source sits on the far side of the body.
        _point[0] = l.x; _point[1] = 0; _point[2] = l.z;
        _source[0] = 2 * l.x - hx; _source[1] = 0; _source[2] = 2 * l.z - hz;
        if (k === 0) {
          // The entangling bind; refused in standalone (no statuses), harmless.
          this._scope.emit({
            type: 'status', element: 'nature', targetIds: [l.id], position: [l.x, 0, l.z],
            durationTicks: Math.round(Math.max(0, c.entangleSeconds) * (this._scope.tickRate || 30)),
            tags: ['symbiotic-exchange', 'bind'],
          });
        }
        const sent = this._scope.emit({
          type: 'hit', element: 'nature', targetIds: [l.id], position: [l.x, 0, l.z],
          sourcePosition: [_source[0], 0, _source[2]], damage: Math.max(0, c.drainDamage),
          hitForce: impactForce(c, power), tags: ['symbiotic-exchange', last ? 'empty' : 'drain'],
        });
        if (sent.ok) drained = true;
        else { this.failure = sent.reason; l.active = false; l.lostAt = this.age; }
      } else if (l.dummy && l.dummy.alive !== false) {
        drained = true;
        if (last) {
          _dir.set(hx - l.dummy.position.x, 0, hz - l.dummy.position.z);
          if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction).negate();
          else _dir.normalize();
          l.dummy.kill?.(_dir.x, _dir.z, this._force);
        }
      } else {
        l.active = false;
        l.lostAt = this.age;
      }
      if (!drained) continue;
      this.hits++;
      l.drained++;
      if (l.dummy?.corrode) l.dummy.corrode(l.drained / this.pulseCount, this._look);
      if (last) l.felledAt = this.age;
      this._launch(PREY0 + i, BEAD_TAKE, 0);
      // Sap torn from the body toward the heart.
      _p.set(l.x, 0.9, l.z);
      _dir.set(hx - l.x, 0.6, hz - l.z).normalize();
      this._burst(this.sap, _p, c.sapCount, 0.25, c.sapSpeed, 0.35, c.sapSize, c.sapLife, _dir);
    }
    // The heart answers: a ring, a knock, light, the pulse.
    _p.set(hx, 0.06, hz);
    this._burst(this.rings, _p, 1, 0, 0, 0, c.ringSize * c.zoneRadius * 0.5, c.ringLife, _up);
    this.lightBoost = Math.max(this.lightBoost, c.beatLight * power);
    if (c.beatShake > 0) this.ctx.shake?.add?.(c.beatShake * power, c.shakeDecay, c.shakeFrequency);
    for (const t of this._tendrils) t.flush = 1;
  }

  /** Start a bead on a tendril. */
  _launch(tendril, kind, ally) {
    for (const b of this._beads) {
      if (b.live) continue;
      b.live = true;
      b.tendril = tendril;
      b.kind = kind;
      b.born = this.age;
      b.ally = ally;
      return true;
    }
    return false;
  }

  /** Seconds a bead takes on its tendril (live from the settings). */
  _beadDuration(b) {
    const c = this.config;
    if (b.kind === BEAD_TAKE) return Math.max(0.05, c.beadTime * this.lifeScale);
    const t = this._tendrils[b.tendril];
    const len = Math.hypot(t.ex - t.ax, t.ez - t.az) + t.arc;
    return Math.max(0.1, len / Math.max(0.5, c.allyBeadSpeed));
  }

  /** Move the exchange on: arrivals bank, convert and credit. */
  _advanceBeads() {
    const c = this.config;
    for (const b of this._beads) {
      if (!b.live || this.age - b.born < this._beadDuration(b)) continue;
      b.live = false;
      if (b.kind === BEAD_TAKE) {
        this._taken++;
        // Round-robin over the bound allies.
        let pick = -1;
        for (let n = 0; n < MAX_ALLIES; n++) {
          const j = (this._giveCursor + n) % MAX_ALLIES;
          if (this.allies[j].active) { pick = j; break; }
        }
        if (pick >= 0) {
          this._giveCursor = pick + 1;
          this._launch(pick, BEAD_GIVE, pick);
        }
      } else {
        const a = this.allies[b.ally];
        this._given++;
        const credit = Math.max(0, Math.min(c.regenPerShare, c.regenCap - a.banked));
        a.banked += credit;
        this.allyVitality += credit;
        const t = this._tendrils[b.tendril];
        _p.set(t.ax, 0.4, t.az);
        this._burst(this.spores, _p, c.regenCount, 0.45, 0.9, 0.35, c.regenSize, c.sporeLife * 0.6, _up);
        this._burst(this.rings, _p.setY(0.05), 1, 0, 0, 0, 1.3, c.ringLife * 0.8, _up);
      }
    }
  }

  /** Bounded one-shot particle emission on a shared system. */
  _burst(system, position, count, radius, speed, spread, size, life, direction) {
    if (!system) return;
    const g = settings.global;
    const n = Math.min(128, Math.max(0, Math.round(count * g.particleCount)));
    if (!n) return;
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.spread = spread;
    _emit.size = size;
    _emit.life = life;
    _emit.spin = 2;
    _emit.time = frame.uTime.value;
    system.emit(n, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _syncParticles() {
    const c = this.config;
    this._syncSystem(this.spores, c.colorCore, c.colorTint, c.colorBody, c.colorDeep, 1.2, 0.35, 0.6);
    this._syncSystem(this.sap, c.colorCore, c.colorSap, c.colorSapDeep, c.colorDeep, 1.4, -5.5, 0.4);
    this._syncSystem(this.soil, c.colorBarkLight, c.colorMound, c.colorBark, c.colorDeep, 0.6, -9.8, 0.25);
    this._syncSystem(this.rings, c.colorCore, c.colorTint, c.colorBody, c.colorDeep, 1.4, 0, 1);
  }

  /** Mirror one shared system's look from the settings (no-op on stubs). */
  _syncSystem(system, a, b, cc, d, glow, gravity, drag) {
    if (!system?.uniforms) return;
    const g = settings.global;
    system.setGradient?.(getColor(a), getColor(b), getColor(cc), getColor(d));
    const u = system.uniforms;
    if (u.uGlow) u.uGlow.value = glow * this.config.particleGlow * g.glow;
    if (u.uOpacity) u.uOpacity.value = g.opacity;
    if (u.uTurbulence) u.uTurbulence.value = 0.6 * g.turbulence;
    if (u.uGravity?.value?.set) u.uGravity.value.set(0, gravity, 0);
    if (u.uDrag) u.uDrag.value = drag;
    syncParticleGlobals(system);
  }

  /** Mirror the tendril uniforms into the CPU twin's look. */
  _syncLook() {
    const c = this.config;
    const g = settings.global;
    _look.amp = c.writheAmp * g.turbulence;
    _look.freq = c.writheFreq * g.noiseFrequency;
    _look.speed = c.writheSpeed * g.noiseSpeed;
    _look.wrapR = c.wrapRadius;
    _look.wrapH = c.wrapHeight;
    _look.turns = c.wrapTurns;
    _look.portion = Math.min(0.6, Math.max(0.05, c.wrapPortion));
    _look.clock = this._clock;
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const L = this.lifeScale;
    const R = c.zoneRadius;
    if (!this._calm) this._clock += dt * g.noiseSpeed;
    this._syncLook();

    const landed = this.phase !== 'travel';
    const fadeT = this.phase === 'fade' ? clamp01(this.fadeTime / this.fadeDuration) : 0;
    const st = landed ? this.impactTime / L : 0; // seconds since impact, authored clock
    const hx = this._heart.x, hz = this._heart.z;
    const H = c.heartHeight;
    const w = R * c.heartWidth;
    const mR = R * c.moundRadius;
    const rise = landed ? Easing.outBack(clamp01(st / Math.max(0.05, c.heartRiseTime))) : 0;
    const wither = clamp01(fadeT / Math.max(0.05, c.witherTime));
    const sinceBeat = (this.age - this._lastBeat) / L;
    const sharp = Math.max(1, c.beatSharpness);
    const lub = Math.exp(-Math.pow((sinceBeat - 0.04) * sharp * 1.6, 2));
    const dub = 0.6 * Math.exp(-Math.pow((sinceBeat - 0.22) * sharp * 1.6, 2));
    const beat = Math.min(1, lub + dub);

    /* ---- the caster's hand and the lifeline ---- */
    this._casterPoint(_hand);
    const ally0 = this.allies[0];
    ally0.x = _hand.x;
    ally0.z = _hand.z;

    /* ---- the seed (charge + travel) ---- */
    const life = this._tendrils[0];
    this._shapeLifeline(life, landed, st, fadeT);
    if (!landed) {
      const charge = clamp01(this.age / Math.max(0.01, c.chargeTime * L));
      if (this.u <= 0) {
        // At the hand: swelling, spores drawn in.
        _p.set(life.ax, life.ay, life.az);
        if (this.spores && c.chargeMotes > 0) {
          this._burst(this.spores, _p, c.chargeMotes, 0.7, 0.25, 1, c.sporeSize, 0.4, _up);
        }
      } else {
        tendrilPoint(life, _look, Math.min(1, this.u), _p);
      }
      this.seed.position.copy(_p);
      this.seed.scale.setScalar(Math.max(0.001, c.seedSize * Easing.outBack(charge)));
      const spin = this._calm ? 0 : this.age * c.seedSpin;
      this.seed.rotation.set(spin * 0.7, spin, Math.PI * 0.35);
      const hs = this._heartState;
      hs.clock = this._clock;
      hs.beat = 0.5 + 0.5 * Math.sin(this.age * 14);
      hs.fill = 0.15 + 0.6 * charge;
      hs.convert = 1;
      hs.dry = 0;
      this.heartMaterial.userData.sync(hs);
    }
    this.seed.visible = !landed;

    /* ---- the heart ---- */
    this.heart.visible = landed;
    this.sepals.visible = landed;
    this.mound.visible = landed;
    this.field.visible = landed;
    if (landed) {
      const squash = c.beatSquash * beat * (1 - wither);
      const sink = Easing.inCubic(wither);
      const hy = (rise - 1) * H * 0.85 + c.moundHeight * 0.3 - sink * H * 0.75;
      const shrink = 1 - wither * 0.35;
      this.heart.position.set(hx, hy, hz);
      this.heart.scale.set(w * (1 + squash * 0.6) * shrink, H * Math.max(0.05, rise) * (1 - squash), w * (1 + squash * 0.6) * shrink);
      this.heart.rotation.y = this._turn;
      const hs = this._heartState;
      hs.clock = this._clock;
      hs.beat = beat * (1 - wither);
      const total = Math.max(1, (this.linkCount ?? 0) * this.pulseCount);
      hs.fill = this._taken > 0 ? 0.1 + 0.82 * Math.min(1, this._taken / total) : 0.04;
      hs.convert = this._taken > 0 ? Math.min(1, this._given / Math.max(1, this._taken)) : 0;
      hs.dry = wither;
      this.heartMaterial.userData.sync(hs);

      /* ---- sepals: peel open on the rise, flutter on beats, fold on exit ---- */
      const open = c.sepalOpen * clamp01((st - 0.12) / 0.35) * (1 - Easing.inOutCubic(wither)) +
        (this._calm ? 0 : c.sepalFlutter * beat);
      const lipY = hy + H * Math.max(0.05, rise) * (1 - squash) * 0.94;
      const lipR = w * 0.6 * (1 + squash * 0.6) * shrink;
      for (let i = 0; i < SEPALS; i++) {
        const a = (i / SEPALS) * TAU + 0.3;
        _scratch.position.set(hx + Math.cos(a) * lipR, lipY, hz + Math.sin(a) * lipR);
        _scratch.rotation.set(open - 0.25 + (i % 2) * 0.12, Math.PI / 2 - a, 0, 'YXZ');
        _scratch.scale.setScalar(c.sepalLength * (H / 2.1) * Math.max(0.01, rise) * (1 - wither * 0.6));
        _scratch.updateMatrix();
        this.sepals.setMatrixAt(i, _scratch.matrix);
      }
      this.sepals.instanceMatrix.needsUpdate = true;
      this.sepalMaterial.color.copy(getColor(c.colorSepal)).lerp(getColor(c.colorWither), wither);
      this.sepalMaterial.emissive.copy(getColor(c.colorBody)).multiplyScalar(0.25 * beat * g.glow);

      /* ---- the mound ---- */
      const heave = Easing.outBack(clamp01(st / 0.25));
      this.mound.position.set(hx, -0.02 - sink * c.moundHeight * 0.5, hz);
      this.mound.scale.set(mR * Math.max(0.01, heave), c.moundHeight * Math.max(0.01, heave) * (1 + 0.08 * beat), mR * Math.max(0.01, heave));
      this.moundMaterial.color.copy(getColor(c.colorMound));
      this.moundMaterial.roughness = c.moundRoughness;

      /* ---- the root field ---- */
      const fs = this._fieldState;
      this.field.position.set(hx, 0.03, hz);
      const fr = R * c.fieldScale;
      this.field.scale.set(fr * 2, fr * 2, 1);
      fs.clock = this._clock;
      fs.grow = Easing.outCubic(clamp01(st / Math.max(0.05, c.fieldGrowTime)));
      const ringT = sinceBeat / 0.45;
      fs.beat = this._beats > 0 && ringT < 1 ? ringT : -1;
      fs.mound = (mR / fr) * 0.95;
      fs.zone = 1 / Math.max(1, c.fieldScale);
      fs.fade = 1;
      fs.dissolve = clamp01((fadeT - 0.15) / 0.85);
      this.fieldMaterial.userData.sync(fs);

      /* ---- the pulse ---- */
      const ps = this._pulseState;
      ps.wave = clamp01(sinceBeat / 0.5);
      ps.strength = this._beats > 0 && ps.wave < 1 ? 1 - ps.wave : 0;
      ps.clock = this._clock;
      this.pulse.visible = !this._calm && ps.strength * c.pulseWarp * g.distortion > 0.002;
      if (this.pulse.visible) {
        this.pulse.position.set(hx, 0.5, hz);
        this.pulse.scale.set(R * 2.6, R * 2.6, 1);
        this.pulseMaterial.userData.sync(ps);
      }

      /* ---- spores drift off the heart's mouth ---- */
      if (this.spores && dt > 0 && fadeT < 0.6) {
        this._sporeCarry += dt * c.sporeRate * (0.5 + beat) * g.particleCount;
        const n = Math.floor(this._sporeCarry);
        if (n > 0) {
          this._sporeCarry -= n;
          _p.set(hx, lipY, hz);
          _emit.position = _p; _emit.radius = lipR * 0.8; _emit.direction = _up; _emit.speed = c.sporeSpeed;
          _emit.spread = 0.6; _emit.size = c.sporeSize; _emit.life = c.sporeLife; _emit.spin = 1; _emit.time = frame.uTime.value;
          this.spores.emit(Math.min(16, n), _emit);
        }
      }
    }

    /* ---- the tendrils ---- */
    this._shapeRoots(landed, st, fadeT, hx, hz, R, mR);
    const decay = Math.exp(-dt * 5);
    let n = 0;
    for (let i = 0; i < MAX_TENDRILS; i++) {
      const t = this._tendrils[i];
      t.flush *= decay;
      if (!t.on || t.grow <= 0.002) continue;
      this.aStart.setXYZ(n, t.ax, t.ay, t.az);
      this.aEnd.setXYZ(n, t.ex, t.ey, t.ez);
      this.aShape.setXYZW(n, t.arc, t.thick, t.wrap, t.hue);
      this.aLife.setXYZW(n, Math.min(1, t.grow), t.seed, t.flush, t.bow);
      t.slot = n++;
    }
    this.tendrils.count = n;
    this.aStart.needsUpdate = true;
    this.aEnd.needsUpdate = true;
    this.aShape.needsUpdate = true;
    this.aLife.needsUpdate = true;
    this._tendrilState.clock = this._clock;
    this._tendrilState.dry = landed ? Easing.inQuad(fadeT) : 0;
    this.tendrilMaterial.userData.sync(this._tendrilState);

    /* ---- the beads ---- */
    let m = 0;
    const size = c.beadSize;
    for (const b of this._beads) {
      if (!b.live) continue;
      const t = this._tendrils[b.tendril];
      if (!t.on) continue;
      const k = clamp01((this.age - b.born) / this._beadDuration(b));
      // Both kinds run toward s = 0: prey → heart, heart → ally.
      const s = Math.min(t.grow, 1) * (1 - Easing.inOutQuad(k));
      tendrilPoint(t, _look, s, _q);
      _scratch.position.copy(_q);
      _scratch.rotation.set(0, 0, 0);
      const swell = 1 + 0.35 * Math.sin(k * Math.PI);
      _scratch.scale.setScalar(size * swell * (b.kind === BEAD_GIVE ? 1.1 : 1));
      _scratch.updateMatrix();
      this.beads.setMatrixAt(m, _scratch.matrix);
      this.aHue.setX(m, b.kind);
      m++;
    }
    this.beads.count = m;
    this.beads.instanceMatrix.needsUpdate = true;
    this.aHue.needsUpdate = true;
    this._beadState.fade = 1 - clamp01((fadeT - 0.7) / 0.3);
    this.beadMaterial.userData.sync(this._beadState);

    this._syncParticles();
  }

  /** The lifeline: hand → seed (travel), then hand → heart, sagging. */
  _shapeLifeline(t, landed, st, fadeT) {
    const c = this.config;
    t.on = true;
    t.ax = this.allies[0].x + this.direction.x * c.chargeForward;
    t.ay = c.chargeHeight;
    t.az = this.allies[0].z + this.direction.z * c.chargeForward;
    // The far end is the target on the floor (the seed lands there).
    const tx = landed ? this._heart.x : this.origin.x + this.direction.x * this.length;
    const tz = landed ? this._heart.z : this.origin.z + this.direction.z * this.length;
    t.ex = tx;
    t.ey = landed ? c.moundHeight * 0.55 : 0.05;
    t.ez = tz;
    t.wrap = 0;
    t.hue = 1;
    t.thick = c.lifelineRadius / Math.max(0.005, c.rootRadius);
    const dist = Math.hypot(tx - t.ax, tz - t.az);
    const lob = c.lobHeight + c.lobPerMetre * dist;
    const sag = landed ? Easing.inOutCubic(clamp01(st / Math.max(0.05, c.lifelineSettle))) : 0;
    t.arc = lob + (c.lifelineRest - lob) * sag;
    t.bow = 0;
    if (!landed) t.grow = Math.max(0.002, this.u);
    else {
      // Draws back last on the exit, after the final beads are home.
      t.grow = 1 - smooth((fadeT - 0.55) / 0.45);
    }
  }

  /** Prey roots, anchor roots and extra ally lines, all from settings. */
  _shapeRoots(landed, st, fadeT, hx, hz, R, mR) {
    const c = this.config;
    const retract = Math.max(0.05, c.retractTime);
    const exitGrow = 1 - smooth(fadeT / retract);
    const baseY = c.moundHeight * 0.45;
    // Extra allies (UCSM): lines from the heart's lip out to them.
    for (let i = 1; i < MAX_ALLIES; i++) {
      const t = this._tendrils[i];
      const a = this.allies[i];
      t.on = landed && a.active;
      if (!t.on) continue;
      t.ax = a.x; t.ay = 1.0; t.az = a.z;
      t.ex = hx; t.ey = c.moundHeight * 0.55; t.ez = hz;
      t.wrap = 0; t.hue = 1; t.bow = 0;
      t.thick = c.lifelineRadius / Math.max(0.005, c.rootRadius);
      t.arc = c.lifelineRest;
      t.grow = Easing.outCubic(clamp01((st - 0.2) / Math.max(0.05, c.reachTime * 1.5))) * (1 - smooth((fadeT - 0.55) / 0.45));
    }
    // Prey: whip out with an overshoot, coil, snap back when felled or lost.
    for (let i = 0; i < MAX_LINKS; i++) {
      const t = this._tendrils[PREY0 + i];
      const l = this.links[i];
      t.on = landed && (l.active || l.felledAt >= 0 || l.lostAt >= 0);
      if (!t.on) continue;
      _dir.set(l.x - hx, 0, l.z - hz);
      const len = Math.max(0.3, _dir.length());
      _dir.multiplyScalar(1 / len);
      t.ax = hx + _dir.x * mR * 0.45;
      t.ay = baseY;
      t.az = hz + _dir.z * mR * 0.45;
      t.ex = l.x; t.ey = 0.04; t.ez = l.z;
      t.wrap = 1;
      t.hue = 0;
      t.thick = 1;
      const k = clamp01((st - 0.05 - i * 0.04) / Math.max(0.05, c.reachTime));
      t.arc = (c.tendrilArc + 0.15 * len) * (1 + c.reachOvershoot * 2.5 * Math.sin(k * Math.PI));
      t.bow = (t.seed - 0.5) * Math.min(0.8, 0.15 * len);
      let grow = Easing.outCubic(k);
      const gone = l.felledAt >= 0 ? l.felledAt : l.lostAt;
      if (gone >= 0) grow *= 1 - smooth((this.age - gone) / (0.35 * this.lifeScale));
      t.grow = grow * exitGrow;
    }
    // Anchors: plunge into the rim, staggered round the circle.
    const count = Math.max(0, Math.min(MAX_ANCHORS, Math.round(c.anchorCount)));
    for (let i = 0; i < MAX_ANCHORS; i++) {
      const t = this._tendrils[ANCHOR0 + i];
      t.on = landed && i < count;
      if (!t.on) continue;
      const a = (i / Math.max(1, count)) * TAU + t.seed * 0.5 + 0.2;
      const reach = R * c.anchorReach * (0.86 + 0.14 * t.seed);
      t.ax = hx + Math.cos(a) * mR * 0.5;
      t.ay = baseY * 0.8;
      t.az = hz + Math.sin(a) * mR * 0.5;
      t.ex = hx + Math.cos(a) * reach;
      t.ey = -0.35;
      t.ez = hz + Math.sin(a) * reach;
      t.wrap = 0;
      t.hue = 0.6;
      t.thick = 0.8 + 0.3 * t.seed;
      t.arc = (c.tendrilArc * 0.8 + 0.1 * reach);
      t.bow = (t.seed - 0.5) * 0.5;
      const k = clamp01((st - 0.08 - i * 0.03) / Math.max(0.05, c.reachTime * 1.2));
      t.grow = Easing.outCubic(k) * exitGrow;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.pulse.visible = false;
    this.tendrils.count = 0;
    this.beads.count = 0;
    for (const l of this.links) { l.active = false; l.dummy = null; }
    for (const b of this._beads) b.live = false;
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
  const castAnim = (f, c) => (Editor?.castAnimation ? Editor.castAnimation(f, c) : f.add(c, 'castAnim', CAST_ANIMATIONS));
  return { R, sub, color, castAnim };
}

export function buildEditor(gui, c, Editor) {
  const { R, sub, color, castAnim } = editorKit(Editor);
  const folder = gui.addFolder('❦  Symbiotic Exchange');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 3, 60, 0.5, 'seed flies at (m/s)');
  R(cast, c, 'zoneRadius', 1, 8, 0.1, 'heart reach (m)');
  R(cast, c, 'lifetime', 0.5, 10, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  castAnim(cast, c);

  const charge = sub(folder, 'Anticipation & travel');
  R(charge, c, 'chargeTime', 0.05, 1, 0.01, 'seed gathers (s)');
  R(charge, c, 'chargeHeight', 0.3, 2.5, 0.01, 'held at height (m)');
  R(charge, c, 'chargeForward', 0, 2, 0.01, 'held in front (m)');
  R(charge, c, 'chargeMotes', 0, 12, 1, 'spores drawn in per frame');
  R(charge, c, 'seedSize', 0.05, 1, 0.01, 'seed size (m)');
  R(charge, c, 'seedSpin', 0, 20, 0.1, 'seed tumble');
  R(charge, c, 'lobHeight', 0, 5, 0.05, 'lob apex (m)');
  R(charge, c, 'lobPerMetre', 0, 0.5, 0.005, 'apex per metre');
  R(charge, c, 'lifelineRest', 0, 4, 0.05, 'lifeline rest arc (m)');
  R(charge, c, 'lifelineRadius', 0.01, 0.4, 0.005, 'lifeline thickness (m)');
  R(charge, c, 'lifelineSettle', 0.05, 2, 0.01, 'lifeline sags over (s)');

  const rule = sub(folder, 'The exchange');
  R(rule, c, 'latchTime', 0.05, 1.5, 0.01, 'binds after (s)');
  R(rule, c, 'pulses', 1, MAX_PULSES, 1, 'heartbeats');
  R(rule, c, 'beatInterval', 0.15, 1.5, 0.01, 'beat every (s)');
  R(rule, c, 'settleTime', 0.1, 2, 0.01, 'lingers after last beat (s)');
  R(rule, c, 'exitTime', 0.2, 2, 0.01, 'exit (s)');
  R(rule, c, 'maxLinks', 0, MAX_LINKS, 1, 'enemies bound');
  R(rule, c, 'drainDamage', 0, 2, 0.01, 'drain per beat');
  R(rule, c, 'entangleSeconds', 0, 10, 0.1, 'entangled for (s)');
  R(rule, c, 'allyRadius', 0, 48, 0.5, 'ally link radius (m)');
  R(rule, c, 'maxAllies', 1, MAX_ALLIES, 1, 'ally lines');
  R(rule, c, 'regenPerShare', 0, 5, 0.05, 'vitality per bead');
  R(rule, c, 'regenCap', 0, 40, 0.5, 'vitality cap per ally');
  R(rule, c, 'hitImpulse', 0, 24, 0.1, 'haul impulse');
  R(rule, c, 'hitLift', 0, 20, 0.1, 'haul lift');
  R(rule, c, 'hitSpin', 0, 8, 0.05, 'haul tumble');

  const heart = sub(folder, '1 · The heart');
  R(heart, c, 'heartHeight', 0.4, 5, 0.01, 'height (m)');
  R(heart, c, 'heartWidth', 0.05, 0.6, 0.005, 'radius (× R)');
  R(heart, c, 'heartRiseTime', 0.05, 1.5, 0.01, 'heaves up over (s)');
  R(heart, c, 'beatSquash', 0, 0.5, 0.005, 'beat squeeze');
  R(heart, c, 'beatSharpness', 1, 20, 0.1, 'beat snap');
  R(heart, c, 'heartGlow', 0, 4, 0.05, 'flesh glow');
  R(heart, c, 'heartVeinGlow', 0, 8, 0.05, 'vein glow');
  R(heart, c, 'heartVeinScale', 0.5, 10, 0.05, 'vein density');
  R(heart, c, 'heartFresnel', 0, 5, 0.05, 'translucent rim');
  R(heart, c, 'heartAmbient', 0, 1.5, 0.01, 'ambient');
  R(heart, c, 'witherTime', 0.05, 1, 0.01, 'withers over (× exit)');
  color(heart, c, 'colorSkin', 'skin');

  const crown = sub(folder, '2 · Sepals & mound');
  R(crown, c, 'sepalLength', 0.1, 3, 0.01, 'sepal length (m)');
  R(crown, c, 'sepalOpen', 0, 2, 0.01, 'sepals open (rad)');
  R(crown, c, 'sepalFlutter', 0, 0.6, 0.005, 'sepal flutter (rad)');
  R(crown, c, 'moundRadius', 0.1, 1, 0.01, 'mound radius (× R)');
  R(crown, c, 'moundHeight', 0.05, 2, 0.01, 'mound height (m)');
  R(crown, c, 'moundRoughness', 0, 1, 0.01, 'mound roughness');
  color(crown, c, 'colorSepal', 'sepals');
  color(crown, c, 'colorMound', 'soil');

  const roots = sub(folder, '3 · Tendrils');
  R(roots, c, 'rootRadius', 0.02, 0.5, 0.005, 'root thickness (m)');
  R(roots, c, 'tipRadius', 0.005, 0.2, 0.001, 'tip thickness (m)');
  R(roots, c, 'reachTime', 0.05, 1.5, 0.01, 'whip out over (s)');
  R(roots, c, 'reachOvershoot', 0, 1, 0.01, 'whip overshoot');
  R(roots, c, 'tendrilArc', 0, 4, 0.05, 'arch (m)');
  R(roots, c, 'anchorCount', 0, MAX_ANCHORS, 1, 'rim roots');
  R(roots, c, 'anchorReach', 0.3, 1.6, 0.01, 'rim roots reach (× R)');
  R(roots, c, 'writheAmp', 0, 0.5, 0.005, 'squirm (m)');
  R(roots, c, 'writheFreq', 0, 10, 0.05, 'squirm waves');
  R(roots, c, 'writheSpeed', 0, 10, 0.05, 'squirm speed');
  R(roots, c, 'wrapRadius', 0.1, 1, 0.01, 'coil radius (m)');
  R(roots, c, 'wrapHeight', 0.2, 3, 0.01, 'coil height (m)');
  R(roots, c, 'wrapTurns', 0.5, 5, 0.05, 'coil turns');
  R(roots, c, 'wrapPortion', 0.05, 0.6, 0.01, 'share spent coiling');
  R(roots, c, 'barkRidges', 2, 20, 1, 'bark ridges');
  R(roots, c, 'barkBump', 0, 2, 0.01, 'bark noise');
  R(roots, c, 'tendrilRim', 0, 3, 0.01, 'green rim');
  R(roots, c, 'tendrilDiffuse', 0, 2, 0.01, 'sunlight');
  R(roots, c, 'sapGlow', 0, 8, 0.05, 'sap glow');
  R(roots, c, 'sapSpeed', 0, 6, 0.05, 'sap flow');
  R(roots, c, 'retractTime', 0.05, 1, 0.01, 'draw back over (× exit)');
  color(roots, c, 'colorBark', 'bark');
  color(roots, c, 'colorBarkLight', 'bark light');

  const beads = sub(folder, '4 · Sap beads');
  R(beads, c, 'beadSize', 0.02, 0.6, 0.005, 'bead size (m)');
  R(beads, c, 'beadTime', 0.05, 2, 0.01, 'prey → heart (s)');
  R(beads, c, 'allyBeadSpeed', 1, 40, 0.5, 'heart → ally (m/s)');
  R(beads, c, 'beadGlow', 0, 8, 0.05, 'bead glow');
  color(beads, c, 'colorSap', 'taken sap');
  color(beads, c, 'colorSapDeep', 'taken sap deep');

  const field = sub(folder, '5 · Root field');
  R(field, c, 'fieldScale', 0.6, 2, 0.01, 'size (× R)');
  R(field, c, 'fieldGlow', 0, 5, 0.05, 'vein glow');
  R(field, c, 'fieldGrowTime', 0.05, 2, 0.01, 'spreads over (s)');
  R(field, c, 'veinDensity', 0.5, 10, 0.05, 'vein density');
  R(field, c, 'veinWidth', 0.01, 0.3, 0.005, 'vein width');
  R(field, c, 'stainOpacity', 0, 1, 0.01, 'moss stain');
  R(field, c, 'beatRingWidth', 0.01, 0.4, 0.005, 'beat ring width');

  const fx = sub(folder, '6 · Particles');
  R(fx, c, 'sporeRate', 0, 120, 1, 'spores per s');
  R(fx, c, 'sporeSize', 0.01, 0.4, 0.005, 'spore size');
  R(fx, c, 'sporeLife', 0.1, 5, 0.05, 'spore life (s)');
  R(fx, c, 'sporeSpeed', 0, 4, 0.05, 'spore drift');
  R(fx, c, 'sapCount', 0, 40, 1, 'sap drops per body per beat');
  R(fx, c, 'sapSize', 0.01, 0.4, 0.005, 'sap drop size');
  R(fx, c, 'sapSpeed', 0, 10, 0.05, 'sap drop speed');
  R(fx, c, 'sapLife', 0.05, 3, 0.01, 'sap drop life (s)');
  R(fx, c, 'soilCount', 0, 128, 1, 'soil chips');
  R(fx, c, 'soilSize', 0.01, 0.5, 0.005, 'chip size');
  R(fx, c, 'soilSpeed', 0, 15, 0.05, 'chip speed');
  R(fx, c, 'soilLife', 0.05, 3, 0.01, 'chip life (s)');
  R(fx, c, 'ringSize', 0.1, 4, 0.01, 'beat ring size');
  R(fx, c, 'ringLife', 0.05, 2, 0.01, 'beat ring life (s)');
  R(fx, c, 'regenCount', 0, 48, 1, 'regen motes per bead');
  R(fx, c, 'regenSize', 0.01, 0.4, 0.005, 'regen mote size');
  R(fx, c, 'particleGlow', 0, 5, 0.05, 'particle glow');

  const hit = sub(folder, '7 · Impact & beats');
  R(hit, c, 'impactShake', 0, 1, 0.01, 'impact knock');
  R(hit, c, 'beatShake', 0, 0.5, 0.005, 'beat knock');
  R(hit, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(hit, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(hit, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(hit, c, 'impactLight', 0, 30, 0.1, 'impact light punch');
  R(hit, c, 'beatLight', 0, 15, 0.1, 'beat light punch');
  R(hit, c, 'burstReach', 0, 2, 0.01, 'earth shell (× R)');
  R(hit, c, 'burstLife', 0.05, 3, 0.01, 'shell life (s)');
  R(hit, c, 'burstIntensity', 0, 3, 0.01, 'shell brightness');
  R(hit, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(hit, c, 'decalLife', 0.1, 8, 0.05, 'crack lasts (s)');
  R(hit, c, 'crackIntensity', 0, 3, 0.01, 'crack brightness');
  R(hit, c, 'dustIntensity', 0, 3, 0.01, 'dust ring');

  const warp = sub(folder, '8 · Pulse');
  R(warp, c, 'pulseWarp', 0, 3, 0.01, 'pressure ring');
  R(warp, c, 'pulseWarpWidth', 0.02, 0.5, 0.005, 'ring width');

  const light = sub(folder, 'Light & palette');
  color(light, c, 'lightColor', 'light');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  color(light, c, 'colorCore', 'core');
  color(light, c, 'colorTint', 'tint');
  color(light, c, 'colorBody', 'body');
  color(light, c, 'colorDeep', 'deep');
  color(light, c, 'colorWither', 'withered');

  return folder;
}
