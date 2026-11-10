import { Color, MathUtils, Quaternion, Vector3 } from 'three';

import { settings, ELEMENT_META, castShapeOf, zoneRadiusOf } from '../../config/settings.js';
import { ELEMENT_OF } from '../../config/elements.js';
import { AbilityManager } from '../../abilities/AbilityManager.js';
import { AssetLoader } from '../../loaders/AssetLoader.js';
import { VENDOR_PACKS } from '../../sandbox/vendors.js';
import { MECHANIC_PRESETS, MECHANIC_VARIANTS, PLAYABLE_MECHANICS } from '../ucsm/mechanics/presets.js';
import { WizardBody, loadWizardAssets } from './WizardBody.js';
import { DuelBrain, difficultyOf, DIFFICULTIES } from './DuelAI.js';
import { DuelRound, castTouches } from './DuelReferee.js';
import { DuelTelegraph } from './DuelTelegraph.js';
import { buildLoadout, classifyCastable, classifyMechanic, filterCastables } from './DuelLoadout.js';

/**
 * The Arch-Wizard duel: the original wizard as a CPU opponent.
 *
 * ## Casting from a second caster
 *
 * The CPU casts through the same engines the player does, without touching the
 * player's slot, aim or cooldowns:
 *
 *  - **native and Matrix Expansion casts** go through a second `AbilityManager`
 *    whose context is the player's own (`Object.create(app.abilities.ctx)`:
 *    same scene, particles, decals, dummies, combat adapter) with one
 *    difference — `character` is the wizard. A cast that reads its caster
 *    (follows it, leaves from its hands) reads the wizard.
 *  - **hosted packs' casts** go through that pack's own manager
 *    (`runtime.manager.cast`, below the aim), and the instance is remembered as
 *    the CPU's until it leaves the pack's active list.
 *  - **mechanic moves** are issued through `MechanicSystems.command` with the
 *    wizard's own owner id.
 *
 * ## Hits, both ways
 *
 *  - **Player → wizard.** The wizard is a body in the dummy field
 *    (`DummyField#addBody`), so every cast reaches it through the usual
 *    `applyHits` / `findTargets` / `kill`. `kill` asks `_struck`, which spends
 *    HP; the blow that empties the bar is a real ragdoll fall.
 *  - **Wizard → player.** The referee reads each CPU cast's published
 *    `origin / position / u / direction` and shape every frame (`castTouches`,
 *    the field's own capsule/disc rule) and lands one hit per cast. Mechanic
 *    damage comes from the unified combat state's own `damage` effects on the
 *    player.
 *  - **Dummies** can be hit by either side; the CPU's casts reach them through
 *    the same field passes, and never its own body.
 */

const _origin = new Vector3();
const _dir = new Vector3();
const _q = new Quaternion();
const _axis = new Vector3();
const _head = new Vector3();
const HURT = new Color('#ff3b2f');

/** Every uid the sandbox knows, with whether the CPU may use it and why not. */
export function castableRoster() {
  const uids = Object.keys(ELEMENT_OF).sort();
  const infoOf = (uid) => {
    const id = uid.slice(uid.indexOf('/') + 1);
    const meta = ELEMENT_META[id];
    return meta ? { cast: meta.cast } : {};
  };
  return filterCastables(uids, infoOf);
}

/** Every implemented mechanic move, as loadout entries. */
export function mechanicRoster() {
  return PLAYABLE_MECHANICS.map((uid) => {
    const preset = MECHANIC_VARIANTS[uid] ?? Object.values(MECHANIC_PRESETS).find((p) => p.uid === uid);
    return { uid, preset, ...classifyMechanic(preset) };
  }).filter((m) => m.preset);
}

export const labelOf = (uid) => {
  const id = uid.slice(uid.indexOf('/') + 1);
  return ELEMENT_META[id]?.label ?? id.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
};

export class Duel {
  constructor(app) {
    this.app = app;
    /** 'off' | 'duel' | 'watch' */
    this.mode = 'off';
    this.wizard = null;
    this._assets = null;
    this._loading = null;
    this.round = null;
    this.brain = null;
    this.difficulty = DIFFICULTIES.adept;
    /** The resolved loadout: castable uids and mechanic uids. */
    this.loadout = { castables: [], mechanics: [] };
    this.entries = [];
    this.ownerId = null;
    this.status = 'Off';
    this.listeners = new Set();
    this.telegraph = new DuelTelegraph(app.scene);
    this.flinch = 0;
    this.counterUntil = -1;
    this.clock = 0;
    this.recent = [];
    this._lastSlot = null;

    // A second pool for the CPU's native casts: the player's context with the
    // wizard as its caster (see the header).
    const ctx = Object.create(app.abilities.ctx);
    this.cpu = new AbilityManager(ctx);
    this.cpuCtx = ctx;
    for (const [id, c] of app.expansionLive?.byId ?? []) {
      if (!this.cpu.pools.has(id)) this.cpu.register(id, c.Ability);
    }

    /** Hosted-pack instances cast by the CPU → the cast record. */
    this.owned = new Map();
    /** cast record per CPU cast: { id, uid, shape, zoneRadius, hit } */
    this._records = new WeakMap();
    this._castSeq = 0;
    /** Player casts seen, for the wizard's dodge. */
    this._seen = new WeakMap();
    this._threatSeq = 0;

    this._wrapEffects();
  }

  /* ------------------------------------------------------------------ */
  /* setup                                                               */
  /* ------------------------------------------------------------------ */

  /** Load the wizard once (the first duel or watch). */
  async _ensureWizard() {
    if (this.wizard) return this.wizard;
    this._loading ??= (async () => {
      this._assets = await loadWizardAssets(new AssetLoader());
      const wizard = new WizardBody(this._assets, this.app.environment);
      wizard.onStruck = (body, blow) => this._struck(blow);
      wizard.owns = (ability) => this.owns(ability);
      wizard.root.visible = false;
      this.app.scene.add(wizard.root);
      this.cpuCtx.character = wizard;
      this.wizard = wizard;
      return wizard;
    })();
    return this._loading;
  }

  /** Whether an ability instance is one of the CPU's casts. */
  owns(ability) {
    return !!ability && (this.cpu.active.includes(ability) || this.owned.has(ability));
  }

  /** Resolve a loadout request into entries the brain can choose from. */
  async _resolve({ loadout = 'random', castables = null, mechanics = [], element = null } = {}) {
    const { allowed } = castableRoster();
    const elementOf = (uid) => ELEMENT_OF[uid];
    let picked;
    if (Array.isArray(castables) && castables.length) {
      picked = castables.filter((uid) => classifyCastable(uid).ok && allowed.includes(uid));
    } else if (Array.isArray(loadout)) {
      picked = loadout.filter((uid) => allowed.includes(uid));
    } else {
      picked = buildLoadout(loadout, { allowed, elementOf, element, mirror: this._mirror() }).castables;
    }
    const mechanicUids = (mechanics ?? []).filter((uid) => PLAYABLE_MECHANICS.includes(uid));

    const entries = [];
    for (const uid of picked) {
      const entry = await this._entryFor(uid).catch((error) => {
        console.warn(`[Duel] ${uid} left out: ${error.message}`);
        return null;
      });
      if (entry) entries.push(entry);
    }
    for (const uid of mechanicUids) {
      const preset = MECHANIC_VARIANTS[uid] ?? Object.values(MECHANIC_PRESETS).find((p) => p.uid === uid);
      entries.push({
        id: uid,
        uid,
        kind: 'mechanic',
        label: preset.name,
        family: preset.family,
        variant: MECHANIC_VARIANTS[uid] ? uid : null,
        range: ['stance', 'counter'].includes(preset.family) ? 40 : Math.min(preset.range ?? 18, 16),
        minRange: 0,
        cooldown: Math.max(preset.cooldown ?? 6, 3),
        shape: 'zone',
        radius: preset.radius ?? preset.finisherRadius ?? 2.5,
        castAnim: preset.castAnim ?? 'cast2'
      });
    }
    this.loadout = { castables: entries.filter((e) => e.kind === 'cast').map((e) => e.uid), mechanics: mechanicUids };
    return entries;
  }

  /** One castable, ready to cast: its pack loaded, its reach and shape read. */
  async _entryFor(uid) {
    const app = this.app;
    const ref = app.parse(uid);
    if (ref.native) {
      if (!this.cpu.pools.has(ref.id)) {
        const expansion = app.expansionLive?.byId.get(ref.id);
        if (!expansion) throw new Error('not a castable here');
        this.cpu.register(ref.id, expansion.Ability);
      }
      const block = settings[ref.id] ?? {};
      return {
        id: uid,
        uid,
        kind: 'cast',
        label: labelOf(uid),
        native: true,
        nativeId: ref.id,
        range: block.range ?? 16,
        minRange: block.minRange ?? 1,
        cooldown: Math.max(block.cooldown ?? 3, 1.5),
        shape: castShapeOf(ref.id) === 'zone' ? 'zone' : 'line',
        radius: castShapeOf(ref.id) === 'zone' ? zoneRadiusOf(ref.id) || 3 : settings.dummies.hit.radius,
        castAnim: block.castAnim ?? 'cast1'
      };
    }
    if (!VENDOR_PACKS[ref.pack]) throw new Error('unknown pack');
    const runtime = await app.loadRuntime(ref.pack);
    if (!runtime.ids.includes(ref.id)) throw new Error('not in its pack');
    const meta = runtime.meta(ref.id);
    const verdict = classifyCastable(uid, { cast: meta.cast });
    if (!verdict.ok) throw new Error(verdict.reason);
    return {
      id: uid,
      uid,
      kind: 'cast',
      label: meta.label ?? labelOf(uid),
      runtime,
      vendorId: ref.id,
      range: meta.range ?? 16,
      minRange: meta.minRange ?? 1,
      cooldown: Math.max(meta.cooldown ?? 3, 1.5),
      shape: meta.cast === 'zone' ? 'zone' : 'line',
      radius: meta.cast === 'zone' ? meta.zoneRadius || 3 : settings.dummies.hit.radius,
      castAnim: meta.castAnim ?? 'cast1'
    };
  }

  /** The player's slot and recent picks, for "Mirror my loadout". */
  _mirror() {
    const list = [...this.recent];
    if (this.app.slot?.uid) list.unshift(this.app.slot.uid);
    return list;
  }

  /* ------------------------------------------------------------------ */
  /* the API                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Start a duel.
   * @param {{loadout?: string|string[], castables?: string[], mechanics?: string[], element?: string, difficulty?: string, keepDummies?: boolean}} [options]
   */
  async start(options = {}) {
    return this._begin('duel', options);
  }

  /** The wizard shows off its loadout on the dummies; no player input needed. */
  async watch(options = {}) {
    return this._begin('watch', options);
  }

  async _begin(mode, options) {
    this.stop({ silent: true });
    this._setStatus('Summoning the Arch-Wizard…');
    const wizard = await this._ensureWizard();
    this.difficulty = difficultyOf(options.difficulty ?? this.difficulty.id);
    this.entries = await this._resolve(options);
    if (!this.entries.length) {
      // Never stand there with nothing: fall back to a random element.
      this.entries = await this._resolve({ loadout: 'random' });
    }
    if (options.keepDummies !== undefined) settings.dummies.enabled = !!options.keepDummies;
    if (mode === 'watch') settings.dummies.enabled = true;

    for (const entry of this.entries) {
      if (entry.native) this.app._prepare?.(() => this.cpu.prewarm(entry.nativeId));
      else if (entry.runtime) this.app._prepare?.(() => entry.runtime.prewarm(entry.vendorId));
    }

    this.mode = mode;
    this.clock = 0;
    this.brain = new DuelBrain({ difficulty: this.difficulty, loadout: this.entries });
    this.round = mode === 'duel' ? new DuelRound({ playerHp: 100, wizardHp: this.difficulty.hp }) : null;
    this._standWizard();
    this.app.dummies.addBody(wizard);
    this.ownerId = this.app.combat?._dummyId?.(wizard) ?? null;
    this._setStatus(mode === 'duel' ? `Duel · ${this.difficulty.label}` : `Watching · ${this.difficulty.label}`);
    this._emit('start');
    return this.state();
  }

  /** Same loadout and difficulty, both at full health. */
  async rematch() {
    if (this.mode === 'off' && !this.entries.length) return this.start();
    const mode = this.mode === 'off' ? 'duel' : this.mode;
    this._clearCasts();
    this.brain = new DuelBrain({ difficulty: this.difficulty, loadout: this.entries });
    this.round = mode === 'duel' ? new DuelRound({ playerHp: 100, wizardHp: this.difficulty.hp }) : null;
    this.mode = mode;
    this._standWizard();
    this.app.dummies.addBody(this.wizard);
    this._reviveCaster();
    this._emit('start');
    return this.state();
  }

  stop({ silent = false } = {}) {
    if (this.mode === 'off' && !this.wizard?.root.visible) return this.state();
    this.mode = 'off';
    this.round = null;
    this.brain = null;
    this.telegraph.hide();
    this._clearCasts();
    if (this.wizard) {
      this.app.dummies.removeBody(this.wizard);
      this.wizard.root.visible = false;
      // Off the stage: nothing of it may linger in the combat state (a status
      // badge floating over the spot it left, a mechanic still owned by it).
      const m = this.app.combat?.manager;
      const entity = this.ownerId ? m?.entities.get(this.ownerId) : null;
      if (entity) {
        entity.statuses.length = 0;
        m.setAlive(this.ownerId, false);
      }
    }
    this._reviveCaster();
    if (!silent) {
      this._setStatus('Off');
      this._emit('stop');
    }
    return this.state();
  }

  state() {
    return {
      mode: this.mode,
      difficulty: this.difficulty.id,
      loadout: { ...this.loadout },
      status: this.status,
      round: this.round?.snapshot() ?? null,
      wizard: this.wizard && this.mode !== 'off'
        ? { alive: this.wizard.alive, x: +this.wizard.position.x.toFixed(2), z: +this.wizard.position.z.toFixed(2), state: this.brain?.state ?? null, casting: this.brain?.current?.uid ?? null }
        : null
    };
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emit(kind, detail = {}) {
    for (const listener of this.listeners) listener(kind, detail, this);
  }

  _setStatus(text) {
    this.status = text;
  }

  /* ------------------------------------------------------------------ */
  /* the frame                                                           */
  /* ------------------------------------------------------------------ */

  /** Before the bodies: the brain, the wizard, the CPU's native casts. */
  update(dt, raw) {
    const app = this.app;
    // The player's recent picks, for "Mirror my loadout".
    const slot = app.slot?.uid;
    if (slot && slot !== this._lastSlot) {
      this._lastSlot = slot;
      this.recent = [slot, ...this.recent.filter((u) => u !== slot)].slice(0, 6);
    }
    if (this.mode === 'off' || !this.wizard) return;
    this.clock += dt;
    const wizard = this.wizard;
    this.round?.step(dt);

    if (wizard.alive && this.brain && !this.round?.over) this._think(dt);
    else this.telegraph.hide();

    wizard.update(dt);

    // The CPU's own casts step with the wizard hidden from their searches.
    const field = app.dummies;
    field.exclude = wizard;
    try {
      this.cpu.update(dt);
    } finally {
      field.exclude = null;
    }
    for (const [ability, record] of this.owned) {
      if (!record.runtime.active.includes(ability)) this.owned.delete(ability);
    }

    // The player's flinch rides on the lunge joint, after the character posed.
    if (this.flinch > 0) {
      const character = app.character;
      this.flinch = Math.max(0, this.flinch - dt * 3.2);
      const amount = Math.sin(this.flinch * Math.PI) * 0.32;
      // About the body's own right axis, in the frame the lunge joint lives in.
      _axis.copy(character._rightAxis ?? _axis.set(1, 0, 0));
      character.tilt?.quaternion.premultiply(_q.setFromAxisAngle(_axis, -amount));
      character.root.updateMatrixWorld(true);
    }

    // The caster stays alive in the combat state while the duel decides who won.
    if (this.round && !this.round.over) this._reviveCaster();
    if (this.round) this.round.reduction.wizard = this._stanceUp() ? (MECHANIC_PRESETS.stance.reduction ?? 0.5) : 0;
  }

  /** After the bodies: the CPU's native hits on dummies, then the referee. */
  afterBodies() {
    if (this.mode === 'off' || !this.wizard) return;
    this.app.dummies.applyHits(this.cpu.active);
    if (this.mode !== 'duel' || !this.round || this.round.over) return;

    const player = this.app.character.position;
    const body = { x: player.x, z: player.z, r: settings.dummies.bodyRadius };
    const check = (ability, record) => {
      if (!record || record.hit || !ability.isActive) return;
      const cast = {
        shape: record.shape,
        origin: ability.origin,
        front: ability.position,
        landing: record.shape === 'zone' ? ability.pointAt(1, _origin) : null,
        u: ability.u,
        zoneRadius: record.radius * settings.dummies.hit.zoneScale,
        lineRadius: settings.dummies.hit.radius
      };
      if (!castTouches(cast, body)) return;
      record.hit = true;
      this._hitPlayer(this.difficulty.damage, record.label, ability.direction);
    };
    for (const ability of this.cpu.active) check(ability, this._records.get(ability));
    for (const [ability, record] of this.owned) check(ability, record);
  }

  _think(dt) {
    const app = this.app;
    const wizard = this.wizard;
    const target = this._target();
    if (!target) return;
    const sense = {
      self: { x: wizard.position.x, z: wizard.position.z },
      target: { x: target.x, z: target.z },
      targetVelocity: target.velocity,
      threats: this.mode === 'duel' ? this._threats() : []
    };
    const brain = this.brain;
    // A mechanic is only ready while the unified state is on.
    const ready = brain.ready.bind(brain);
    brain.ready = (id) => ready(id) && this._usable(id);
    const act = brain.update(dt, sense);
    brain.ready = ready;

    // Move: hold range, strafe; a dodge is a short burst sideways.
    let vx = act.move.x;
    let vz = act.move.z;
    if (act.dodge) {
      this._dodge = { x: act.dodge.x * 9, z: act.dodge.z * 9, t: 0.28 };
      this._setStatus(`${this._modeLabel()} · Arch-Wizard sidesteps`);
    }
    if (this._dodge?.t > 0) {
      vx += this._dodge.x;
      vz += this._dodge.z;
      this._dodge.t -= dt;
    }
    const p = wizard.position;
    p.x += vx * dt;
    p.z += vz * dt;
    // Never on top of the player; never out of the arena.
    const player = app.character.position;
    const dx = p.x - player.x;
    const dz = p.z - player.z;
    const near = Math.hypot(dx, dz);
    if (near < 3 && near > 1e-4) {
      p.x = player.x + (dx / near) * 3;
      p.z = player.z + (dz / near) * 3;
    }
    const arena = Math.max(8, (settings.move.arenaRadius ?? 40) - 1);
    const r = Math.hypot(p.x, p.z);
    if (r > arena) {
      p.x *= arena / r;
      p.z *= arena / r;
    }
    wizard.turnToward(Math.atan2(act.face.x, act.face.z), 0.02, dt);

    if (act.windup) {
      const { entry, aim } = act.windup;
      wizard.playCast(entry.castAnim);
      wizard.setFacing(Math.atan2(aim.dirX, aim.dirZ));
      const selfCentred = entry.kind === 'mechanic' && ['stance', 'counter'].includes(entry.family);
      if (selfCentred) this.telegraph.show('zone', p, { ...aim, x: p.x, z: p.z }, 1.4);
      else this.telegraph.show(entry.shape, p, aim, entry.radius);
      this._setStatus(`${this._modeLabel()} · winding up ${entry.label}`);
      this._emit('windup', { uid: entry.uid, label: entry.label });
    }
    if (this.brain.state === 'windup') {
      this.telegraph.set(1 - Math.max(0, this.brain.timer) / Math.max(0.05, this.difficulty.telegraph), this.clock);
    }
    if (act.release) {
      this.telegraph.hide();
      const { entry, aim } = act.release;
      wizard.setFacing(Math.atan2(aim.dirX, aim.dirZ));
      const fired = this._cast(entry, aim);
      this._setStatus(`${this._modeLabel()} · ${fired ? 'casts' : 'fizzles'} ${entry.label}`);
      this._emit('cast', { uid: entry.uid, label: entry.label, fired });
    }
  }

  _modeLabel() {
    return this.mode === 'duel' ? `Duel · ${this.difficulty.label}` : `Watching · ${this.difficulty.label}`;
  }

  /** What the wizard is fighting: the player, or (watching) the nearest dummy. */
  _target() {
    const app = this.app;
    if (this.mode === 'duel') {
      const p = app.character.position;
      const last = (this._lastPlayer ??= p.clone());
      const velocity = { x: (p.x - last.x) * 30, z: (p.z - last.z) * 30 };
      last.copy(p);
      return { x: p.x, z: p.z, velocity };
    }
    let best = null;
    let bestD = Infinity;
    for (const slot of app.dummies.slots) {
      if (slot.external || !slot.dummy.alive) continue;
      const d = slot.dummy.position.distanceToSquared(this.wizard.position);
      if (d < bestD) {
        bestD = d;
        best = slot.dummy.position;
      }
    }
    // Nobody standing: face the middle of the field and wait.
    return best ? { x: best.x, z: best.z, velocity: { x: 0, z: 0 } } : { x: app.character.position.x, z: app.character.position.z, velocity: { x: 0, z: 0 } };
  }

  /** New player casts heading for the wizard, for its dodge. */
  _threats() {
    const out = [];
    const consider = (ability) => {
      if (!ability?.isActive || this.owns(ability)) return;
      const key = `${ability.origin.x.toFixed(2)},${ability.origin.z.toFixed(2)},${ability.direction.x.toFixed(3)}`;
      if (this._seen.get(ability) === key) return;
      this._seen.set(ability, key);
      out.push({ id: ++this._threatSeq, origin: { x: ability.origin.x, z: ability.origin.z }, dir: { x: ability.direction.x, z: ability.direction.z }, reach: ability.length ?? 20 });
    };
    for (const ability of this.app.abilities.active) consider(ability);
    for (const runtime of this.app.runtimes.values()) for (const ability of runtime.active) consider(ability);
    return out;
  }

  _usable(id) {
    const entry = this.entries.find((e) => e.id === id);
    if (entry?.kind !== 'mechanic') return true;
    return !!this.app.combat?.enabled && !!this.ownerId;
  }

  /** Release one cast from the wizard, through the engine that owns it. */
  _cast(entry, aim) {
    const wizard = this.wizard;
    _origin.set(wizard.position.x, 0, wizard.position.z);
    _dir.set(aim.dirX, 0, aim.dirZ).normalize();
    const distance = MathUtils.clamp(aim.distance, entry.minRange ?? 0.5, entry.range ?? 18);
    const record = { id: ++this._castSeq, uid: entry.uid, label: entry.label, shape: entry.shape, radius: entry.radius, hit: false };

    if (entry.kind === 'mechanic') return this._castMechanic(entry, aim);

    if (entry.native) {
      const field = this.app.dummies;
      field.exclude = wizard;
      let ability;
      try {
        ability = this.cpu.cast(_origin, _dir, distance, entry.nativeId);
      } finally {
        field.exclude = null;
      }
      if (!ability) return false;
      this._records.set(ability, record);
      return true;
    }
    const runtime = entry.runtime;
    const ability = runtime.manager.cast(_origin, _dir, distance, entry.vendorId);
    if (!ability) return false;
    record.runtime = runtime;
    this.owned.set(ability, record);
    this._guardUpdate(ability);
    return true;
  }

  /**
   * A hosted pack steps the CPU's instance in its own loop; while it does,
   * the wizard is hidden from the searches (once per instance, and only while
   * the instance is the CPU's).
   */
  _guardUpdate(ability) {
    if (ability.__duelGuard) return;
    ability.__duelGuard = true;
    const update = ability.update.bind(ability);
    const duel = this;
    ability.update = function (dt) {
      if (!duel.owned.has(this)) return update(dt);
      const field = duel.app.dummies;
      field.exclude = duel.wizard;
      try {
        return update(dt);
      } finally {
        field.exclude = null;
      }
    };
  }

  _castMechanic(entry, aim) {
    const adapter = this.app.combat;
    if (!adapter?.enabled || !this.ownerId) return false;
    const systems = adapter.mechanics.systems;
    const p = this.wizard.position;
    const selfCentred = ['stance', 'counter'].includes(entry.family);
    const position = selfCentred ? [p.x, 0, p.z] : [aim.x, 0, aim.z];
    const result = systems.command({ family: entry.family, uid: entry.variant, ownerId: this.ownerId, position, direction: [aim.dirX, 0, aim.dirZ], action: 'cast' });
    if (result?.ok && entry.family === 'counter') {
      const preset = MECHANIC_VARIANTS[entry.uid] ?? MECHANIC_PRESETS.counter;
      this.counterUntil = this.clock + (preset.anticipation ?? 0.1) + (preset.perfect ?? 0.13) + (preset.partial ?? 0.2) + 0.6;
    }
    return !!result?.ok;
  }

  _stanceUp() {
    const systems = this.app.combat?.mechanics?.systems;
    return !!(this.ownerId && systems?.stance?.active?.has(this.ownerId));
  }

  /* ------------------------------------------------------------------ */
  /* damage                                                              */
  /* ------------------------------------------------------------------ */

  /** A blow on the wizard (from any cast, via `WizardBody#kill`). */
  _struck(blow) {
    if (this.mode !== 'duel' || !this.round || this.round.over) return 'ignore';
    if (this.clock < this.counterUntil) {
      // Parried: the guard turns it, and half of it goes back.
      this.counterUntil = -1;
      this._setStatus(`${this._modeLabel()} · Arch-Wizard parries`);
      this._hitPlayer(this.difficulty.damage * 0.5, 'Parry');
      return 'ignore';
    }
    const result = this.round.hit('wizard', 10);
    if (!result.landed) return 'ignore';
    this._emit('wizard-hit', { dealt: result.dealt, hp: this.round.hp.wizard });
    if (result.lethal) {
      this.telegraph.hide();
      this._clearCasts();
      this._setStatus('You win');
      this._emit('over', { winner: 'player' });
      return 'lethal';
    }
    return 'hurt';
  }

  /** A blow on the player, from the referee or a mechanic. */
  _hitPlayer(amount, label, direction = null) {
    if (!this.round || this.round.over) return;
    const result = this.round.hit('player', amount);
    if (!result.landed) return;
    this.flinch = 1;
    this.app.shake.add(0.35, 2.2, 18);
    this.app.flash.trigger(HURT, 0.35, 0.0012);
    this.app.hud?.showToast(`Hit by ${label} · −${Math.round(result.dealt)}`, 1100);
    this._emit('player-hit', { dealt: result.dealt, hp: this.round.hp.player, label });
    if (result.lethal) {
      this.telegraph.hide();
      this._setStatus('The Arch-Wizard wins');
      this._emit('over', { winner: 'wizard' });
    }
  }

  /** The wizard's mechanics land on the player through the unified state. */
  _wrapEffects() {
    const adapter = this.app.combat;
    if (!adapter || adapter.__duelWrapped) return;
    adapter.__duelWrapped = true;
    const apply = adapter._applyEffect.bind(adapter);
    adapter._applyEffect = (effect) => {
      if (this.mode === 'duel' && effect.targetId === 'caster' && effect.kind === 'damage' && String(effect.abilityUid ?? '').startsWith('mechanics/')) {
        this._hitPlayer(Math.max(6, (effect.amount ?? 0.5) * 22), MECHANIC_VARIANTS[effect.abilityUid]?.name ?? 'a mechanic');
        return;
      }
      if (this.mode === 'duel' && effect.targetId === 'caster' && effect.kind === 'kill') return;
      apply(effect);
    };
  }

  _reviveCaster() {
    const m = this.app.combat?.manager;
    const caster = m?.entities.get('caster');
    if (caster && !caster.alive) m.setAlive('caster', true);
  }

  /** Put every CPU cast away (round over, stop, rematch). */
  _clearCasts() {
    for (const ability of this.cpu.active) {
      ability.destroy();
      this.cpu.pools.get(ability.element).release(ability);
    }
    this.cpu.active.length = 0;
    for (const [ability, record] of this.owned) {
      const runtime = record.runtime;
      const at = runtime.active.indexOf(ability);
      if (at >= 0) {
        runtime.active.splice(at, 1);
        ability.destroy();
        runtime.manager.pools?.get(ability.element)?.release(ability);
      }
    }
    this.owned.clear();
    if (this.ownerId) this.app.combat?.mechanics?.systems.cancel(this.ownerId);
    this.counterUntil = -1;
  }

  /** Stand the wizard across from the player (or the dummies, watching). */
  _standWizard() {
    const app = this.app;
    const wizard = this.wizard;
    const p = app.character.position;
    app.camera.getWorldDirection(_dir);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, -1);
    _dir.normalize();
    const distance = this.mode === 'watch' ? 4 : 10;
    const side = this.mode === 'watch' ? 4 : 0;
    const x = p.x + _dir.x * distance - _dir.z * side;
    const z = p.z + _dir.z * distance + _dir.x * side;
    wizard.place(x, z, Math.atan2(p.x - x, p.z - z));
    wizard.root.visible = true;
  }

  /** Screen-space anchor above the wizard's head, for the floating bar. */
  headOnScreen(camera, width, height) {
    if (!this.wizard?.root.visible) return null;
    _head.copy(this.wizard.position);
    _head.y = this.wizard.alive ? this.wizard.height + 0.35 : 0.6;
    _head.project(camera);
    if (_head.z > 1) return null;
    return { x: (_head.x * 0.5 + 0.5) * width, y: (-_head.y * 0.5 + 0.5) * height };
  }

  dispose() {
    this.stop({ silent: true });
    this.cpu.dispose();
    this.telegraph.dispose();
    this.wizard?.dispose();
  }
}
