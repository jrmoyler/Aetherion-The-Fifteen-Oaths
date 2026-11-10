import { validImpactForce } from '../../abilities/expansion-2026/ImpactForce.js';
import { EVENT_TYPES, isElement } from './ontology.js';
import { shapesOverlap } from './CombatStateManager.js';

const CAPABILITIES = Object.freeze({
  events: true, actorQueries: true, history: true, elementalRegions: true,
  terrainLineOfSight: true, ownedWorldshapeSwap: true, eventSubmission: true,
  projectiles: false, projectileRedirect: false, terrainRelocation: false,
  forceRegions: false, damageRedirection: false, constructs: false, mass: false
});
const finitePoint = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const finiteRadius = (r) => Number.isFinite(r) && r >= 0 && r <= 48;
const point = (p) => Object.freeze([...p]);
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const snapshot = (value) => freeze(structuredClone(value));
const failure = (reason) => ({ ok: false, reason });

/**
 * Scoped, budgeted bridge for new expansion abilities. It observes the combat
 * manager after an event resolves and queues new events for the next fixed tick.
 * It does not rewrite legacy packs, expose mutable manager objects, or invent
 * projectile, force, construct, mass or damage-redirection support.
 */
export class ExpansionCombatAdapter {
  constructor(manager, { maxSubscriptions = 64, eventsPerTick = 24, enabled = () => true, modeVersion = () => 0, isTargetable = () => true, actorGeneration = () => undefined } = {}) {
    this.manager = manager;
    this.maxSubscriptions = Number.isSafeInteger(maxSubscriptions) && maxSubscriptions >= 0 ? maxSubscriptions : 0;
    this.eventsPerTick = Number.isSafeInteger(eventsPerTick) && eventsPerTick >= 0 ? eventsPerTick : 0;
    this.enabled = enabled;
    this.modeVersion = modeVersion;
    this.isTargetable = isTargetable;
    this.actorGeneration = actorGeneration;
    this.targetGenerations = new WeakMap();
    this.listeners = new Set();
    this.budgetTick = -1;
    this.used = 0;
    this.disposed = false;
    if (manager.expansionObserver) throw new Error('Expansion combat observer already attached');
    manager.expansionObserver = this;
  }
  get capabilities() { return CAPABILITIES; }
  bind(uid, ownerId = 'caster') {
    if (typeof uid !== 'string' || !/^matrix-expansion\/[a-z0-9-]+$/.test(uid) || typeof ownerId !== 'string' || !ownerId)
      throw new TypeError('Expected an expansion uid and owner id');
    const adapter = this;
    const owner = () => adapter.manager.entities.get(ownerId);
    return Object.freeze({
      capabilities: CAPABILITIES,
      get tick() { return adapter.manager.tick; },
      get tickRate() { return adapter.manager.budget.tickRate; },
      ticksFor(seconds) {
        return Number.isFinite(seconds) && seconds >= 0 && seconds <= 60 ? adapter.manager.ticksFor(seconds) : null;
      },
      on(type, handler) {
        if (adapter.disposed || !EVENT_TYPES.includes(type) || typeof handler !== 'function') return failure('invalid subscription');
        if (adapter.listeners.size >= adapter.maxSubscriptions) return failure('subscription budget');
        const listener = { type, handler };
        adapter.listeners.add(listener);
        let active = true;
        return { ok: true, unsubscribe() { if (active) { active = false; adapter.listeners.delete(listener); } } };
      },
      getActor(id) {
        const e = adapter.manager.entities.get(id);
        if (!e) return failure('unknown actor');
        if (!adapter.isTargetable(id)) return failure('target unavailable');
        return { ok: true, actor: snapshot({ id: e.id, teamId: e.teamId, kind: e.kind, position: e.position, health: e.health, maxHealth: e.maxHealth, shields: e.shields, alive: e.alive, statuses: e.statuses, standGeneration: adapter.actorGeneration(e.id) }) };
      },
      positionAt(id, ticksAgo = 0) {
        if (!Number.isSafeInteger(ticksAgo) || ticksAgo < 0 || !adapter.isTargetable(id)) return null;
        const pos = adapter.manager.positionAt(id, ticksAgo);
        return pos ? point(pos) : null;
      },
      queryActors({ position, radius, relation = 'enemy' } = {}) {
        const caster = owner();
        if (!caster || !finitePoint(position) || !finiteRadius(radius) || !['ally', 'enemy', 'any'].includes(relation)) return failure('invalid actor query');
        const actors = [...adapter.manager.entities.values()].filter((e) => e.alive && adapter.isTargetable(e.id) &&
          (relation === 'any' || (relation === 'ally' ? e.teamId === caster.teamId : e.teamId !== caster.teamId)) &&
          Math.hypot(e.position[0] - position[0], e.position[2] - position[2]) <= radius)
          .sort((a, b) => a.id.localeCompare(b.id)).slice(0, 32)
          .map((e) => snapshot({ id: e.id, teamId: e.teamId, kind: e.kind, position: e.position, health: e.health, shields: e.shields, alive: e.alive, standGeneration: adapter.actorGeneration(e.id) }));
        return { ok: true, actors: Object.freeze(actors) };
      },
      queryRegions({ position, radius } = {}) {
        if (!finitePoint(position) || !finiteRadius(radius)) return failure('invalid region query');
        const shape = { kind: 'disc', x: position[0], z: position[2], r: radius };
        const regions = [...adapter.manager.regions.values()].filter((r) => r.expiresTick > adapter.manager.tick && shapesOverlap(shape, r.shape))
          .sort((a, b) => a.id.localeCompare(b.id)).slice(0, 48).map((r) => snapshot(r));
        return { ok: true, regions: Object.freeze(regions) };
      },
      queryWorldshapes({ position, radius } = {}) {
        if (!finitePoint(position) || !finiteRadius(radius)) return failure('invalid terrain query');
        const systems = adapter.manager.mechanics;
        if (!systems?.worldshape) return failure('terrain query unavailable');
        const terrain = [...systems.worldshape.regions.values()]
          .filter((r) => r.expiresTick > adapter.manager.tick && Math.hypot(r.position[0] - position[0], r.position[2] - position[2]) <= radius)
          .sort((a, b) => a.id.localeCompare(b.id)).slice(0, 8)
          .map((r) => snapshot({ id: r.id, uid: r.uid, ownerId: r.ownerId, position: r.position,
            direction: r.direction, radius: systems.preset(r).radius, element: systems.preset(r).element, expiresTick: r.expiresTick }));
        return { ok: true, terrain: Object.freeze(terrain) };
      },
      /** Swap only owned worldshapes, preserving existing timers and imprints. */
      swapOwnedWorldshapes(firstId, secondId) {
        const m = adapter.manager, systems = m.mechanics, caster = owner();
        if (adapter.disposed || !adapter.enabled()) return failure('combat disabled');
        if (!caster?.alive) return failure('unknown or dead owner');
        if (!systems?.worldshape || !systems?.weave) return failure('terrain swap unavailable');
        if (typeof firstId !== 'string' || typeof secondId !== 'string' || firstId === secondId) return failure('invalid terrain selection');
        const a = systems.worldshape.regions.get(firstId), b = systems.worldshape.regions.get(secondId);
        if (!a || !b || a.ownerId !== ownerId || b.ownerId !== ownerId || a.expiresTick <= m.tick || b.expiresTick <= m.tick)
          return failure('two active owned terrains required');
        // A swap must not invalidate an extracted event, existing weave links,
        // or a not-yet-applied imprint/pulse for either construct.
        if (m._dueEvents || systems.weave.links.length || m.queue.some((e) => typeof e.castId === 'string' && [a.id, b.id].some((id) => e.castId === id || e.castId.startsWith(`${id}:`))))
          return failure('terrain busy');
        const pa = systems.preset(a), pb = systems.preset(b), nextA = [...b.position], nextB = [...a.position];
        const distance = (x, y) => Math.hypot(x[0] - y[0], x[2] - y[2]);
        if ([a.position, b.position].some((p) => distance(caster.position, p) > 18)) return failure('outside cast range');
        if (Math.hypot(nextA[0], nextA[2]) + pa.radius > systems.b.arenaRadius || Math.hypot(nextB[0], nextB[2]) + pb.radius > systems.b.arenaRadius)
          return failure('terrain outside arena');
        const others = [...systems.worldshape.regions.values()].filter((r) => r.id !== a.id && r.id !== b.id);
        if (distance(nextA, nextB) < pa.radius + pb.radius || others.some((r) => distance(r.position, nextA) < systems.preset(r).radius + pa.radius || distance(r.position, nextB) < systems.preset(r).radius + pb.radius))
          return failure('terrain overlap');
        const moved = (r, destination) => r.ridges.map((ridge) => ({ ...ridge, x: ridge.x + destination[0] - r.position[0], z: ridge.z + destination[2] - r.position[2] }));
        const ridgesA = moved(a, nextA), ridgesB = moved(b, nextB);
        if ([...m.entities.values()].some((e) => e.alive && [...ridgesA, ...ridgesB].some((r) => Math.hypot(e.position[0] - r.x, e.position[2] - r.z) < r.r + 0.55)))
          return failure('terrain would trap an actor');
        for (const [r, pos, ridges, spec] of [[a, nextA, ridgesA, pa], [b, nextB, ridgesB, pb]]) {
          r.position = pos; r.ridges = ridges;
          const imprint = m.regions.get(`rg:${r.id}:terrain-impact`);
          if (imprint) imprint.shape = { kind: 'disc', x: pos[0], z: pos[2], r: spec.radius };
        }
        return { ok: true, firstId, secondId };
      },
      isBlocked(from, to) {
        if (!finitePoint(from) || !finitePoint(to)) return failure('invalid terrain query');
        const terrain = adapter.manager.mechanics?.worldshape;
        if (!terrain) return failure('terrain query unavailable');
        return { ok: true, blocked: terrain.blocked(from, to) };
      },
      queryProjectiles() { return failure('projectile query unsupported'); },
      emit(event) {
        const m = adapter.manager, caster = owner();
        if (adapter.disposed || !adapter.enabled()) return failure('combat disabled');
        if (!caster?.alive) return failure('unknown or dead owner');
        if (!event || !EVENT_TYPES.includes(event.type) || !isElement(event.element) ||
            (event.position !== undefined && !finitePoint(event.position)) ||
            (event.sourcePosition !== undefined && !finitePoint(event.sourcePosition)) ||
            (event.targetIds !== undefined && (!Array.isArray(event.targetIds) || event.targetIds.length > 8 || event.targetIds.some((id) => typeof id !== 'string' || !m.entities.has(id) || !adapter.isTargetable(id)))) ||
            (['hit', 'status'].includes(event.type) && !event.targetIds?.length) ||
            (['spawn', 'terrain-impact'].includes(event.type) && !event.shape) ||
            (event.tags !== undefined && (!Array.isArray(event.tags) || event.tags.length > 16 || event.tags.some((tag) => typeof tag !== 'string'))) ||
            (event.damage !== undefined && (!Number.isFinite(event.damage) || event.damage < 0)) ||
            (event.hitForce !== undefined && (event.type !== 'hit' || !validImpactForce(event.hitForce))) ||
            (event.intensity !== undefined && (!Number.isFinite(event.intensity) || event.intensity < 0 || event.intensity > m.budget.maxIntensity)) ||
            (event.durationTicks !== undefined && (!Number.isSafeInteger(event.durationTicks) || event.durationTicks < 0 || event.durationTicks > m.ticksFor(60))) ||
            (event.castId !== undefined && typeof event.castId !== 'string')) return failure('invalid event');
        if (event.shape !== undefined && event.shape !== null) {
          const shape = event.shape;
          const fields = shape.kind === 'disc' ? ['x', 'z', 'r'] : shape.kind === 'capsule' ? ['ax', 'az', 'bx', 'bz', 'r'] : [];
          if (!fields.length || fields.some((key) => !Number.isFinite(shape[key])) || !finiteRadius(shape.r)) return failure('invalid shape');
        }
        if (adapter.budgetTick !== m.tick) { adapter.budgetTick = m.tick; adapter.used = 0; }
        if (adapter.used >= adapter.eventsPerTick || m.queue.length >= m.budget.maxQueue) return failure('event budget');
        adapter.used++;
        const eventId = m.submit({
          type: event.type, element: event.element, abilityUid: uid, ownerId, actorId: ownerId,
          tick: m.tick + (m._dueEvents ? 1 : 0),
          teamId: caster.teamId, mechanic: 'standard', position: event.position ?? caster.position,
          ...(event.sourcePosition !== undefined ? { sourcePosition: event.sourcePosition } : {}),
          ...(event.hitForce !== undefined ? { hitForce: { impulse:event.hitForce.impulse,lift:event.hitForce.lift,spin:event.hitForce.spin } } : {}),
          targetIds: event.targetIds ?? [], shape: event.shape ? { ...event.shape } : null,
          damage: event.damage, intensity: event.intensity, durationTicks: event.durationTicks,
          tags: event.tags, castId: event.castId
        });
        const queued = m.queue[m.queue.length - 1];
        if (queued?.eventId === eventId && ['hit', 'status'].includes(event.type)) {
          adapter.targetGenerations.set(queued, new Map((event.targetIds ?? []).map((id) => [id, adapter.actorGeneration(id)])));
        }
        return { ok: true, eventId };
      }
    });
  }
  /** Recheck a scoped target immediately before an event commits. */
  filterEventTargets(event) {
    if (typeof event.abilityUid !== 'string' || !event.abilityUid.startsWith('matrix-expansion/') || !['hit', 'status'].includes(event.type)) return;
    const generations = this.targetGenerations.get(event);
    event.targetIds = event.targetIds.filter((id) => this.isTargetable(id) &&
      (!generations || generations.get(id) === this.actorGeneration(id)));
  }
  /** Drop hidden, removed or replaced targets before events leave the queue. */
  filterQueuedTargets() {
    const manager = this.manager;
    for (const event of manager.queue) this.filterEventTargets(event);
    manager.cancelEvents((event) => typeof event.abilityUid === 'string' && event.abilityUid.startsWith('matrix-expansion/') && ['hit', 'status'].includes(event.type) && event.targetIds.length === 0);
  }
  onEvent(event) {
    if (this.disposed || !this.enabled() || !this.listeners.size) return;
    let copy;
    try { copy = snapshot({ eventId: event.eventId, tick: this.manager.tick, scheduledTick: event.tick, sequence: event.sequence,
      type: event.type, abilityUid: event.abilityUid, castId: event.castId, ownerId: event.ownerId,
      teamId: event.teamId, element: event.element, mechanic: event.mechanic,
      targetIds: event.targetIds, position: event.position, ...(event.sourcePosition ? { sourcePosition: event.sourcePosition } : {}), shape: event.shape, tags: event.tags,
      damage: event.damage, intensity: event.intensity, depth: event.depth }); }
    catch { return; } // An exotic legacy payload must never break the combat tick.
    for (const listener of [...this.listeners]) if (this.listeners.has(listener) && listener.type === event.type) {
      try { listener.handler(copy); } catch { /* one extension cannot break the combat tick */ }
    }
  }
  dispose() {
    this.disposed = true;
    this.listeners.clear();
    if (this.manager.expansionObserver === this) this.manager.expansionObserver = null;
  }
}
