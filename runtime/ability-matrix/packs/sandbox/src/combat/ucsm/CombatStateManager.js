import { validImpactForce } from '../../abilities/expansion-2026/ImpactForce.js';
import { CAPABILITIES, EVENT_TYPES, STATUS_OF, ELEMENT_OF_STATUS, MECHANICS, isElement } from './ontology.js';
import { resolvePair, TIER } from './reactions.js';

/**
 * Universal Combat State Manager (Unified Combat Spec §5).
 *
 * Authoritative over elemental exposure, statuses, element regions left on
 * the floor, ownership and the reaction chain budget. Casts keep drawing in
 * their own engines; they only *report* here (through `PackAdapter`), and any
 * secondary gameplay effect — a reaction felling a body — is issued from here,
 * once, through the `effects` outbox.
 *
 * Deterministic: a fixed tick, events ordered by (tick, sequence), entities
 * and regions walked in id order, ids derived from the tick and sequence. Feed
 * it the same events and it commits the same reactions.
 *
 * ## Tick pipeline (§5)
 *
 *  1. ingest   — take this tick's events; refuse unknown types, elements or
 *                targets, a missing ability uid or owner, a replayed eventId
 *                and anything past the depth cap.
 *  2. normalise — fill defaults, snap positions to the millimetre.
 *  3. expire   — statuses and regions whose time is up, in id order.
 *  4. direct   — a hit (or a buff's status) lays its element's status on its targets; an impact
 *                lays a region. Exactly once per eventId.
 *  5. resolve  — what was already there meets what arrived: statuses on the
 *                struck, regions under them, regions overlapping the new one.
 *  6. validate — depth, reactions per tick and per entity, team policy,
 *                one reaction of a name per arriving cast, diminishing returns
 *                applied after every multiplier, then the intensity cap.
 *  7. commit   — statuses, purges, regions (as next-tick events, so chains
 *                are bounded by depth), kills to the outbox, cues for VFX/HUD.
 *
 * Optional MechanicSystems executes on these same ticks and state maps.
 */

export const DEFAULT_BUDGET = Object.freeze({
  /** Ticks per second. */
  tickRate: 30,
  /** Reaction generations: a reaction's region may react, and so on, this deep. */
  maxDepth: 3,
  reactionsPerTick: 8,
  reactionsPerEntityPerTick: 2,
  maxRegions: 48,
  maxStacks: 5,
  maxIntensity: 3,
  maxQueue: 512,
  /** Ticks of position history kept per entity, for temporal effects. */
  historyTicks: 90,
  /** Seconds a hit's status lasts. */
  exposure: 4,
  /** Seconds a cast's footprint stays an element region. */
  regionLife: 3,
  /** Each repeat of a reaction on the same spot within `diminishWindow` s lands at 1 / (1 + diminish × n). */
  diminish: 0.5,
  diminishWindow: 3,
  /** Radius of a reaction centred on one struck body, metres. */
  contactRadius: 2.5
});

const snap = (v) => Math.round(v * 1000) / 1000;

/* ---- flat geometry: regions are discs or capsules on the floor ---- */

function segmentPointDistSq(ax, az, bx, bz, px, pz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = dx * dx + dz * dz;
  const t = len > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len)) : 0;
  const x = ax + dx * t - px;
  const z = az + dz * t - pz;
  return x * x + z * z;
}

function segmentSegmentDistSq(a, b) {
  return Math.min(
    segmentPointDistSq(a.ax, a.az, a.bx, a.bz, b.ax, b.az),
    segmentPointDistSq(a.ax, a.az, a.bx, a.bz, b.bx, b.bz),
    segmentPointDistSq(b.ax, b.az, b.bx, b.bz, a.ax, a.az),
    segmentPointDistSq(b.ax, b.az, b.bx, b.bz, a.bx, a.bz),
    crosses(a, b) ? 0 : Infinity
  );
}

function crosses(a, b) {
  const d = (x1, z1, x2, z2, x3, z3) => (x2 - x1) * (z3 - z1) - (z2 - z1) * (x3 - x1);
  const d1 = d(a.ax, a.az, a.bx, a.bz, b.ax, b.az);
  const d2 = d(a.ax, a.az, a.bx, a.bz, b.bx, b.bz);
  const d3 = d(b.ax, b.az, b.bx, b.bz, a.ax, a.az);
  const d4 = d(b.ax, b.az, b.bx, b.bz, a.bx, a.bz);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Any shape as a capsule (a disc is a capsule of zero length). */
function asCapsule(shape) {
  if (shape.kind === 'capsule') return shape;
  return { ax: shape.x, az: shape.z, bx: shape.x, bz: shape.z, r: shape.r };
}

export function shapesOverlap(a, b) {
  const ca = asCapsule(a);
  const cb = asCapsule(b);
  const reach = ca.r + cb.r;
  return segmentSegmentDistSq(ca, cb) <= reach * reach;
}

export function shapeContains(shape, x, z) {
  const c = asCapsule(shape);
  return segmentPointDistSq(c.ax, c.az, c.bx, c.bz, x, z) <= c.r * c.r;
}

/** A point where two shapes meet, for placing the reaction. */
function meetingPoint(a, b) {
  const ca = asCapsule(a);
  const cb = asCapsule(b);
  // Midpoint of the two centres, pulled onto `b`'s spine.
  const mx = ((ca.ax + ca.bx) / 2 + (cb.ax + cb.bx) / 2) / 2;
  const mz = ((ca.az + ca.bz) / 2 + (cb.az + cb.bz) / 2) / 2;
  return [snap(mx), snap(mz)];
}

function shapeRadius(shape) {
  return shape.r;
}

export class CombatStateManager {
  /** @param {Partial<typeof DEFAULT_BUDGET>} [budget] */
  constructor(budget = {}) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
    this.tick = 0;
    this.sequence = 0;
    this._acc = 0;
    /** @type {Map<string, object>} */
    this.entities = new Map();
    /** @type {Map<string, object>} */
    this.regions = new Map();
    this.queue = [];
    this._seen = new Set();
    this._seenOrder = [];
    /** Reaction keys already committed — exact once. */
    this._committed = new Set();
    this._committedOrder = [];
    /** name@spot → ticks it landed at, for diminishing returns. */
    this._recent = new Map();
    this.history = new Map();
    this.anchors = new Map();
    this.activeStances = new Map();
    this.counterWindows = new Map();
    this.recentEvents = [];
    this.rejected = [];
    this.log = [];
    this.effects = [];
    this.cues = [];
    this.stats = { events: 0, rejected: 0, reactions: 0, refused: 0, kills: 0 };
  }

  get seconds() {
    return this.tick / this.budget.tickRate;
  }

  ticksFor(seconds) {
    return Math.max(1, Math.round(seconds * this.budget.tickRate));
  }

  /* ------------------------------------------------------------------ */
  /* entities                                                            */
  /* ------------------------------------------------------------------ */

  upsertEntity({ id, kind = 'actor', teamId = 'neutral', position = [0, 0, 0], health = 1, shields = 0, tags = [], alive }) {
    const existing = this.entities.get(id);
    if (existing) {
      existing.position = position.map(snap);
      if (alive !== undefined) this.setAlive(id, alive);
      return existing;
    }
    const entity = { id, kind, teamId, position: position.map(snap), health, maxHealth: health, shields, statuses: [], tags: [...tags], resistances: {}, alive: alive ?? true };
    this.entities.set(id, entity);
    return entity;
  }

  setPosition(id, x, y, z) {
    const e = this.entities.get(id);
    if (e) e.position = [snap(x), snap(y), snap(z)];
  }

  setAlive(id, alive) {
    const e = this.entities.get(id);
    if (!e) return;
    // A body that stands back up stands up clean.
    if (alive && !e.alive) {
      e.statuses.length = 0;
      e.pendingKill = false;
      e.health = e.maxHealth;
    }
    e.alive = alive;
  }

  /** Where an entity was `ticksAgo` ticks ago (the temporal ring buffer). */
  positionAt(id, ticksAgo = 0) {
    const ring = this.history.get(id);
    if (!ring || !ring.length) return this.entities.get(id)?.position ?? null;
    return ring[Math.max(0, ring.length - 1 - ticksAgo)];
  }

  /* ------------------------------------------------------------------ */
  /* events                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Queue an event for the next tick (or a later one, via `tick`).
   * Returns its eventId. Ids are assigned here when the caller gives none.
   */
  submit(event) {
    const tick = Math.max(this.tick, event.tick ?? this.tick);
    const sequence = this.sequence++;
    const out = {
      eventId: event.eventId ?? `ev:${tick}:${sequence}`,
      tick,
      sequence,
      type: event.type,
      actorId: event.actorId ?? event.ownerId ?? null,
      ownerId: event.ownerId ?? null,
      teamId: event.teamId ?? 'neutral',
      abilityUid: event.abilityUid ?? null,
      /** One cast's events share this, so a cast reacts once per reaction name. */
      castId: event.castId ?? null,
      element: event.element,
      mechanic: event.mechanic ?? 'standard',
      targetIds: [...(event.targetIds ?? [])],
      position: (event.position ?? [0, 0, 0]).map(snap),
      ...(event.type==='hit' && typeof event.abilityUid==='string' && event.abilityUid.startsWith('matrix-expansion/') && validImpactForce(event.hitForce) ? { hitForce: { impulse:event.hitForce.impulse,lift:event.hitForce.lift,spin:event.hitForce.spin } } : {}),
      ...(Array.isArray(event.sourcePosition) && event.sourcePosition.length === 3 && event.sourcePosition.every(Number.isFinite) ? { sourcePosition: event.sourcePosition.map(snap) } : {}),
      shape: event.shape ?? null,
      tags: [...(event.tags ?? [])],
      intensity: event.intensity ?? 1,
      durationTicks: event.durationTicks ?? 0,
      parentReactionId: event.parentReactionId ?? null,
      depth: event.depth ?? 0,
      damage: Number.isFinite(event.damage) ? Math.max(0, Math.min(10, event.damage)) : null,
      consumeRegions: [...(event.consumeRegions ?? [])]
    };
    if (this.queue.length >= this.budget.maxQueue) {
      this._reject(out, 'queue full');
      return out.eventId;
    }
    this.queue.push(out);
    return out.eventId;
  }

  /** Remove queued events and invalidate events already extracted for this tick. */
  cancelEvents(predicate) {
    this.queue = this.queue.filter((event) => !predicate(event));
    for (const event of this._dueEvents ?? []) if (predicate(event)) this._cancelledEvents.add(event);
  }

  /** Advance by real seconds: as many fixed ticks as fit. */
  step(dt) {
    this._acc += Math.max(0, dt);
    const step = 1 / this.budget.tickRate;
    let guard = 0;
    while (this._acc >= step && guard++ < 8) {
      this._acc -= step;
      this.advance();
    }
    if (guard >= 8) this._acc = 0;
  }

  /** Hand the outbox over and clear it. */
  drain() {
    const out = { effects: this.effects, cues: this.cues };
    this.effects = [];
    this.cues = [];
    return out;
  }

  /** Preview a pairing without touching state (the synergy explorer's question). */
  preview(first, second) {
    return resolvePair(first, second);
  }

  snapshot() {
    return {
      tick: this.tick,
      entities: new Map([...this.entities].map(([id, e]) => [id, { ...e, statuses: e.statuses.map((s) => ({ ...s })) }])),
      anchors: new Map(this.anchors),
      activeStances: new Map(this.activeStances),
      counterWindows: new Map(this.counterWindows),
      worldRegions: new Map([...this.regions].map(([id, r]) => [id, { ...r }])),
      recentEvents: [...this.recentEvents]
    };
  }

  /* ------------------------------------------------------------------ */
  /* the tick                                                            */
  /* ------------------------------------------------------------------ */

  advance() {
    const tick = this.tick;
    this._tickReactions = 0;
    this._entityReactions = new Map();

    this.mechanics?.beforeTick();

    // 1. ingest, in (tick, sequence) order
    this.queue.sort((a, b) => a.tick - b.tick || a.sequence - b.sequence);
    const due = [];
    while (this.queue.length && this.queue[0].tick <= tick) due.push(this.queue.shift());

    // 3. expire before anything new lands (stable id order)
    this._expire(tick);

    this._dueEvents = due;
    this._cancelledEvents = new WeakSet();
    for (const event of due) {
      if (this._cancelledEvents.has(event)) continue;
      // A listener may replace a pooled target during the same fixed tick.
      this.expansionObserver?.filterEventTargets?.(event);
      const reason = this._validate(event);
      if (reason) {
        this._reject(event, reason);
        continue;
      }
      this._remember(event);
      this.stats.events++;
      this.recentEvents.push(event);
      if (this.recentEvents.length > 64) this.recentEvents.shift();
      // 4–7, per event
      this.mechanics?.beforeEvent(event);
      const contacts = this._apply(event, tick);
      this._damage(event);
      for (const contact of contacts) this._react(event, contact, tick);
      this.mechanics?.afterEvent(event);
      this.expansionObserver?.onEvent(event);
    }

    this._dueEvents = null;
    this._cancelledEvents = null;
    this._record(tick);
    this.tick++;
  }

  _damage(event) {
    if (event.type !== 'hit' || event.damage === null) return;
    for (const id of event.targetIds) {
      const e = this.entities.get(id);
      if (!e?.alive || e.teamId === event.teamId) continue;
      const amount = event.damageByTarget?.[id] ?? event.damage;
      const shield = Math.min(e.shields, amount);
      e.shields -= shield; e.health = Math.max(0, e.health - (amount - shield));
      if (e.health === 0) e.alive = false;
      const source = event.sourcePosition ?? event.position;
      this.effects.push({ kind: 'damage', effectId: `damage:${event.eventId}:${id}`, targetId: id, amount, health: e.health, from: [source[0], source[2]], element: event.element, abilityUid: event.abilityUid, ...(event.hitForce ? {hitForce:{...event.hitForce}} : {}) });
    }
  }

  _validate(event) {
    if (!EVENT_TYPES.includes(event.type)) return `unknown type ${event.type}`;
    if (!isElement(event.element)) return `unknown element ${event.element}`;
    if (!MECHANICS.includes(event.mechanic)) return `unknown mechanic ${event.mechanic}`;
    if (!event.abilityUid) return 'no ability uid';
    if (!event.ownerId) return 'no owner';
    if (this._seen.has(event.eventId)) return 'replayed eventId';
    if (event.depth > this.budget.maxDepth) return 'past the reaction depth cap';
    event.targetIds = [...new Set(event.targetIds.filter((id) => this.entities.has(id)))].sort();
    if ((event.type === 'hit' || event.type === 'status') && event.targetIds.length === 0) return `${event.type} with no known target`;
    if ((event.type === 'terrain-impact' || event.type === 'spawn') && !event.shape) return 'impact with no footprint';
    return null;
  }

  _remember(event) {
    this._seen.add(event.eventId);
    this._seenOrder.push(event.eventId);
    if (this._seenOrder.length > 4096) this._seen.delete(this._seenOrder.shift());
  }

  _reject(event, reason) {
    this.stats.rejected++;
    this.rejected.push({ eventId: event.eventId, type: event.type, reason });
    if (this.rejected.length > 64) this.rejected.shift();
  }

  _expire(tick) {
    for (const id of [...this.entities.keys()].sort()) {
      const e = this.entities.get(id);
      e.statuses = e.statuses.filter((s) => s.expiresTick > tick);
    }
    for (const id of [...this.regions.keys()].sort()) {
      const r = this.regions.get(id);
      if (r.expiresTick <= tick) {
        this.regions.delete(id);
        this.cues.push({ kind: 'expire', regionId: id, element: r.element, tag: r.tag });
      }
    }
  }

  _addStatus(entity, tag, event, ticks, intensity = 1) {
    const existing = entity.statuses.find((s) => s.tag === tag);
    const expiresTick = this.tick + ticks;
    if (existing) {
      existing.stacks = Math.min(this.budget.maxStacks, existing.stacks + 1);
      existing.expiresTick = Math.max(existing.expiresTick, expiresTick);
      existing.intensity = Math.min(this.budget.maxIntensity, existing.intensity + intensity / (1 + existing.stacks));
      existing.sourceEventId = event.eventId;
      return existing;
    }
    const status = { tag, sourceUid: event.abilityUid, sourceEventId: event.eventId, ownerId: event.ownerId, teamId: event.teamId, stacks: 1, intensity: Math.min(this.budget.maxIntensity, intensity), expiresTick };
    entity.statuses.push(status);
    return status;
  }

  /** Step 4: the event's own effect. Returns what it met (step 5's inputs). */
  _apply(event, tick) {
    const contacts = [];
    // A status (a buff switched on) is laid like a hit's, and never fells anyone itself.
    if (event.type === 'hit' || event.type === 'status') {
      const tag = STATUS_OF[event.element];
      for (const id of event.targetIds) {
        const entity = this.entities.get(id);
        // What was on it before this hit, and what floor it stood on.
        for (const s of entity.statuses) {
          const prior = ELEMENT_OF_STATUS[s.tag];
          if (prior && s.sourceEventId !== event.eventId) contacts.push({ kind: 'status', element: prior, sourceEventId: s.sourceEventId, entityId: id, at: [entity.position[0], entity.position[2]], radius: this.budget.contactRadius });
        }
        for (const rid of [...this.regions.keys()].sort()) {
          const r = this.regions.get(rid);
          if (r.sourceEventId === event.eventId) continue;
          if (shapeContains(r.shape, entity.position[0], entity.position[2])) contacts.push({ kind: 'region', element: r.element, sourceEventId: r.sourceEventId, sourceUid: r.sourceUid, entityId: id, at: [entity.position[0], entity.position[2]], radius: this.budget.contactRadius, area: r.shape });
        }
        this._addStatus(entity, tag, event, this.ticksFor(this.budget.exposure), event.intensityByTarget?.[id] ?? event.intensity);
      }
      return contacts;
    }
    if (event.type === 'terrain-impact' || event.type === 'spawn') {
      const shape = { ...event.shape };
      for (const rid of [...this.regions.keys()].sort()) {
        const r = this.regions.get(rid);
        if (event.consumeRegions.length && !event.consumeRegions.includes(r.id)) continue;
        if (!shapesOverlap(r.shape, shape)) continue;
        // The reaction runs through what was already there: the standing water conducts, the brush burns.
        contacts.push({ kind: 'region', element: r.element, sourceEventId: r.sourceEventId, sourceUid: r.sourceUid, entityId: null, at: meetingPoint(r.shape, shape), radius: Math.max(1.2, Math.min(shapeRadius(r.shape), shapeRadius(shape))), area: r.shape });
      }
      this._addRegion(event, shape, event.durationTicks || this.ticksFor(this.budget.regionLife));
    }
    return contacts;
  }

  _addRegion(event, shape, ticks) {
    if (this.regions.size >= this.budget.maxRegions) {
      // Drop the one closest to expiring (oldest on a tie), never the new one.
      const victim = [...this.regions.values()].sort((a, b) => a.expiresTick - b.expiresTick || (a.id < b.id ? -1 : 1))[0];
      this.regions.delete(victim.id);
    }
    const id = `rg:${event.eventId}`;
    const region = { id, element: event.element, tag: event.tags.find((t) => !CAPABILITIES[t]) ?? STATUS_OF[event.element], shape, ownerId: event.ownerId, teamId: event.teamId, sourceUid: event.abilityUid, sourceEventId: event.eventId, expiresTick: this.tick + ticks, depth: event.depth };
    this.regions.set(id, region);
    this.cues.push({ kind: 'region', regionId: id, element: region.element, tag: region.tag, shape, depth: event.depth });
    return region;
  }

  /** Steps 5–7 for one thing the event met. */
  _react(event, contact, tick) {
    const r = resolvePair(contact.element, event.element);
    if (r.tier === TIER.GENERIC) return;
    if (r.tier === TIER.INCOMPATIBLE) {
      const key = `refuse:${r.key}:${event.eventId}`;
      if (this._committed.has(key)) return;
      this._commitKey(key);
      this.stats.refused++;
      this.cues.push({ kind: 'refused', name: r.name, reason: r.reason, elements: [r.lead, r.catalyst], position: contact.at });
      return;
    }

    // 6. validate
    // What a reaction made (its ice, its steam) does not set that same reaction off again.
    const product = `reaction/${r.key}`;
    if (event.abilityUid === product || contact.sourceUid === product) return;
    const depth = event.depth + 1;
    if (depth > this.budget.maxDepth) return;
    if (this._tickReactions >= this.budget.reactionsPerTick) return;
    const byName = `once:${r.name}@${event.castId ?? event.eventId}`;
    if (this._committed.has(byName)) return;
    if (contact.entityId) {
      const n = this._entityReactions.get(contact.entityId) ?? 0;
      if (n >= this.budget.reactionsPerEntityPerTick) return;
    }
    const sources = [contact.sourceEventId, event.eventId].sort();
    const reactionId = `rx:${r.key}:${sources.join('+')}`;
    if (this._committed.has(reactionId)) return;

    // Diminishing returns after every multiplier, then the cap.
    const spot = `${r.name}@${Math.round(contact.at[0])},${Math.round(contact.at[1])}`;
    const window = this.ticksFor(this.budget.diminishWindow);
    const recent = (this._recent.get(spot) ?? []).filter((t) => tick - t < window);
    const intensity = Math.min(this.budget.maxIntensity, ((event.intensityByTarget?.[contact.entityId] ?? event.intensity) * r.intensity) / (1 + this.budget.diminish * recent.length));
    recent.push(tick);
    this._recent.set(spot, recent);

    // 7. commit
    this._commitKey(reactionId);
    this._commitKey(byName);
    this._tickReactions++;
    if (contact.entityId) this._entityReactions.set(contact.entityId, (this._entityReactions.get(contact.entityId) ?? 0) + 1);
    this.stats.reactions++;

    const effect = r.effect;
    const [cx, cz] = contact.at;
    const radius = contact.radius;
    const reaction = { reactionId, sourceEventIds: sources, participantIds: [], kind: r.name, tier: r.tier, elements: [r.lead, r.catalyst], intensity, depth, position: [cx, 0, cz], radius, statusDeltas: [], worldDeltas: [], emittedEvents: [], presentationCues: [] };
    const reactionEvent = { ...event, eventId: reactionId, abilityUid: `reaction/${r.key}`, depth };

    const inArea = [];
    for (const id of [...this.entities.keys()].sort()) {
      const e = this.entities.get(id);
      const dx = e.position[0] - cx;
      const dz = e.position[2] - cz;
      const inside = contact.area ? shapeContains(contact.area, e.position[0], e.position[2]) : false;
      if (inside || dx * dx + dz * dz <= radius * radius) inArea.push(e);
    }
    const hostile = (e) => e.teamId !== event.teamId;

    if (effect.purge) {
      for (const e of inArea) {
        if (!hostile(e)) continue;
        const before = e.statuses.length;
        e.statuses = e.statuses.filter((s) => !effect.purge.includes(s.tag));
        if (e.statuses.length !== before) reaction.statusDeltas.push({ entityId: e.id, removed: effect.purge });
      }
    }
    if (effect.status) {
      for (const e of inArea) {
        if (effect.ally ? hostile(e) : !hostile(e)) continue;
        this._addStatus(e, effect.status, reactionEvent, this.ticksFor(effect.statusLife ?? 2), intensity);
        reaction.statusDeltas.push({ entityId: e.id, added: effect.status });
        reaction.participantIds.push(e.id);
      }
    }
    if (effect.kill) {
      const targets = inArea
        .filter((e) => e.alive && hostile(e) && !e.pendingKill)
        .sort((a, b) => {
          const da = (a.position[0] - cx) ** 2 + (a.position[2] - cz) ** 2;
          const db = (b.position[0] - cx) ** 2 + (b.position[2] - cz) ** 2;
          return da - db || (a.id < b.id ? -1 : 1);
        })
        .slice(0, effect.maxTargets ?? 3);
      for (const e of targets) {
        e.pendingKill = true;
        this.stats.kills++;
        this.effects.push({ effectId: `fx:${reactionId}:${e.id}`, kind: 'kill', targetId: e.id, from: [cx, cz], lift: effect.lift ?? 3, intensity, reactionId });
      }
    }
    if (effect.region) {
      const life = this.ticksFor(effect.region.life);
      const emitted = {
        type: 'terrain-impact',
        tick: tick + 1,
        ownerId: event.ownerId,
        teamId: event.teamId,
        abilityUid: reactionEvent.abilityUid,
        element: effect.region.element,
        mechanic: 'convergence',
        position: [cx, 0, cz],
        shape: { kind: 'disc', x: cx, z: cz, r: snap(radius * effect.region.scale) },
        tags: [effect.region.tag],
        intensity,
        durationTicks: life,
        parentReactionId: reactionId,
        depth
      };
      reaction.worldDeltas.push({ add: effect.region.tag, element: effect.region.element, shape: emitted.shape, ticks: life });
      reaction.emittedEvents.push(emitted);
      this.submit(emitted);
    }
    const cue = { kind: 'reaction', name: r.name, tier: r.tier, rule: r.rule, elements: [r.lead, r.catalyst], position: [cx, 0, cz], radius, intensity, depth, reactionId };
    reaction.presentationCues.push(cue);
    this.cues.push(cue);
    this.log.push(reaction);
    if (this.log.length > 128) this.log.shift();
  }

  _commitKey(key) {
    this._committed.add(key);
    this._committedOrder.push(key);
    if (this._committedOrder.length > 4096) this._committed.delete(this._committedOrder.shift());
  }

  _record() {
    const keep = this.budget.historyTicks;
    for (const id of [...this.entities.keys()].sort()) {
      const e = this.entities.get(id);
      let ring = this.history.get(id);
      if (!ring) this.history.set(id, (ring = []));
      ring.push([...e.position]);
      if (ring.length > keep) ring.shift();
    }
  }

  /** The adapter reports a kill landed (or was refused), so the body can be targeted again later. */
  settle(effectId, entityId) {
    const e = this.entities.get(entityId);
    if (e) e.pendingKill = false;
  }
}
