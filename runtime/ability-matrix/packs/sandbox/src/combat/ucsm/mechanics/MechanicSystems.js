import { convergenceStrikeShapes } from './ConvergenceVariants.js';
import { shapeContains, shapesOverlap } from '../CombatStateManager.js';
import { MECHANIC_PRESETS as P, MECHANIC_VARIANTS, MECHANIC_BUDGET } from './presets.js';
import { resolvePair, TIER } from '../reactions.js';
const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const disc = (p, r) => ({ kind: 'disc', x: p[0], z: p[2], r });
const segment = (a, b, r = 0) => ({ kind: 'capsule', ax: a[0], az: a[2], bx: b[0], bz: b[2], r });
const sorted = (map) => [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
const snap = (n) => Math.round(n * 1000) / 1000;
// Tuple encoding prevents owners or targets containing ':' from colliding.
const weaveCooldownKey = (owner, target) => JSON.stringify([owner, target]);
const stanceCast = (a, id, position) => ({ id, family: a.family, uid: a.uid, ownerId: a.ownerId, direction: [...a.direction], position: [...position] });

/** Three anchors per owner; live topology is rebuilt every tick, never cached. */
export class WeavingManager {
  constructor(s) {
    this.s = s;
    this.anchors = s.m.anchors;
    this.links = [];
    this.hitCooldowns = new Map();
    this.floodCooldowns = new Map();
    this.floodCasts = new Map();
  }
  activate(c) {
    const s = this.s,
      p = s.preset(c),
      own = sorted(this.anchors).filter((a) => a.ownerId === c.ownerId);
    if (own.length >= p.maxAnchors || this.anchors.size >= s.b.maxAnchors) return 'anchor limit';
    if (own.some((a) => (a.uid ?? P.weave.uid) !== (c.uid ?? P.weave.uid))) return 'remove existing anchors before changing weave';
    if (own.some((a) => dist(a.position, c.position) < 1.5)) return 'anchors too close';
    if (own.length && !own.some((a) => dist(a.position, c.position) <= p.maxLink)) return 'link exceeds 14 m';
    const a = { ...c, id: c.id, health: p.anchorHealth, expiresTick: s.m.tick + s.t(p.life) };
    this.anchors.set(a.id, a);
    s.cue('anchor', a);
    return null;
  }
  beforeEvent(e) {
    for (const link of this.links)
      for (const reservation of link.reservations)
        if (reservation.eventId === e.eventId) reservation.processed = true;
    if (!['hit', 'terrain-impact'].includes(e.type)) return;
    for (const a of sorted(this.anchors)) {
      const owner = this.s.m.entities.get(a.ownerId);
      if (e.teamId === owner?.teamId) continue;
      if ((e.shape && shapeContains(e.shape, a.position[0], a.position[2])) || e.targetIds.includes(a.id)) {
        a.health -= Math.min(2, Math.max(0, e.intensity));
        if (a.health <= 0) {
          this.anchors.delete(a.id);
          // Links are rebuilt at tick start; invalidate affected ones now, not
          // on the next tick. Pending events from those links must not land
          // after the hostile strike that destroyed an endpoint.
          const broken = this.links.filter((link) => link.anchorIds.includes(a.id));
          this.links = this.links.filter((link) => !link.anchorIds.includes(a.id));
          for (const link of broken)
            for (const r of link.reservations)
              if (!r.processed)
                for (const target of r.targets) {
                  const key = weaveCooldownKey(a.ownerId, target);
                  if (this.hitCooldowns.get(key) === r.until) this.hitCooldowns.delete(key);
                }
          const casts = new Set(broken.flatMap((link) => link.castIds));
          const floodCast = this.floodCasts.get(a.ownerId);
          if (floodCast) {
            casts.add(floodCast);
            this.floodCasts.delete(a.ownerId);
            this.floodCooldowns.delete(a.ownerId);
          }
          if (casts.size) {
            this.s.m.cancelEvents((event) => event.ownerId === a.ownerId && casts.has(event.castId));
            this.s.m.cues = this.s.m.cues.filter((cue) => !(cue.kind === 'mechanic' && cue.ownerId === a.ownerId && casts.has(cue.id)));
          }
          this.s.cue('anchor-break', a);
          const p = this.s.preset(a);
          if (p.behavior === 'shatter' && this.s.alive(a.ownerId)) {
            const c = { ...a, id: `${a.id}:shatter:${this.s.m.tick}` };
            this.s.area(c, disc(a.position, p.shatterRadius), p.shatterDamage);
            this.s.cue('weave-burst', { ...c, weaveEffect: 'shatter', radius: p.shatterRadius });
          }
        }
      }
    }
  }
  update() {
    const s = this.s;
    for (const a of sorted(this.anchors))
      if (a.expiresTick <= s.m.tick || !s.alive(a.ownerId)) {
        this.anchors.delete(a.id);
        s.cue('anchor-expire', a);
      }
    this.links = [];
    this.floodCasts.clear();
    for (const [id, until] of this.hitCooldowns) if (until <= s.m.tick) this.hitCooldowns.delete(id);
    const all = sorted(this.anchors);
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i],
          b = all[j];
        const profile = s.preset(a);
        if (
          a.ownerId !== b.ownerId ||
          a.uid !== b.uid ||
          dist(a.position, b.position) > profile.maxLink ||
          s.worldshape.blocked(a.position, b.position)
        )
          continue;
        const shape = segment(a.position, b.position, profile.width);
        const c = { ...a, id: `${a.id}:${b.id}:${s.m.tick}` };
        const link = { id: `${a.id}:${b.id}`, ownerId: a.ownerId, uid: a.uid, shape,
          anchorIds: [a.id, b.id], castIds: [c.id, `${c.id}:chain`, `${c.id}:quake`], reservations: [] };
        this.links.push(link);
        const ids = s.targets(c, shape, true).filter((id) => !this.hitCooldowns.has(weaveCooldownKey(a.ownerId, id)));
        if (ids.length && s.emit(c, { type: 'hit', targetIds: ids, shape, damage: profile.damage })) {
          const until = s.m.tick + s.t(profile.pulse);
          for (const id of ids) this.hitCooldowns.set(weaveCooldownKey(a.ownerId, id), until);
          link.reservations.push({ eventId: `${c.id}:hit`, targets: ids, until, processed: false });
          if (profile.behavior === 'chain') {
            const origin = s.m.entities.get(ids[0]).position;
            const near = s.targets({ ...c, position: origin }, disc(origin, profile.chainRadius))
              .filter((id) => !ids.includes(id) && !this.hitCooldowns.has(weaveCooldownKey(a.ownerId, id)))
              .slice(0, profile.chainTargets);
            if (near.length) {
              const chain = { ...c, id: `${c.id}:chain`, position: [...origin] };
              if (s.emit(chain, { type: 'hit', targetIds: near, shape: disc(origin, profile.chainRadius), damage: profile.chainDamage })) {
                const until = s.m.tick + s.t(profile.pulse);
                for (const id of near) this.hitCooldowns.set(weaveCooldownKey(a.ownerId, id), until);
                link.reservations.push({ eventId: `${chain.id}:hit`, targets: near, until, processed: false });
                s.cue('weave-burst', { ...chain, weaveEffect: 'chain', arcTargets: near.map((id) => [...s.m.entities.get(id).position]) });
              }
            }
          }
          if (profile.behavior === 'draft') s.cue('weave-burst', { ...c, position: [...s.m.entities.get(ids[0]).position], weaveEffect: 'draft', radius: profile.width });
          if (profile.behavior === 'quake') {
            const origin = s.m.entities.get(ids[0]).position;
            const c2 = { ...c, id: `${c.id}:quake`, position: [...origin] };
            const others = s.targets(c2, disc(origin, profile.quakeRadius)).filter((id) => !ids.includes(id));
            if (others.length) s.emit(c2, { type: 'hit', targetIds: others, shape: disc(origin, profile.quakeRadius), damage: profile.quakeDamage });
            s.cue('weave-burst', { ...c2, weaveEffect: 'quake', radius: profile.quakeRadius });
          }
        }
        if (s.m.tick % s.t(profile.pulse) === 0)
          s.emit(c, { type: 'terrain-impact', shape, durationTicks: s.t(profile.pulse) });
      }
    // A complete, unobstructed triangle periodically floods its interior.
    const owners = new Set(all.filter((a) => s.preset(a).behavior === 'flood').map((a) => a.ownerId));
    for (const owner of owners) {
      const a = all.filter((x) => x.ownerId === owner && s.preset(x).behavior === 'flood');
      if (a.length !== 3 || this.links.filter((x) => x.ownerId === owner).length !== 3 || (this.floodCooldowns.get(owner) ?? 0) > s.m.tick) continue;
      const cross = (p, q, r) => (q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0]);
      if (Math.abs(cross(a[0].position, a[1].position, a[2].position)) < 0.1) continue;
      const center = [a.reduce((n, x) => n + x.position[0], 0) / 3, 0, a.reduce((n, x) => n + x.position[2], 0) / 3];
      const p = s.preset(a[0]), team = s.m.entities.get(owner)?.teamId;
      const ids = sorted(s.m.entities).filter((e) => {
        if (!e.alive || e.teamId === team || s.worldshape.blocked(center, e.position)) return false;
        const signs = a.map((v, i) => cross(v.position, a[(i + 1) % 3].position, e.position));
        return signs.every((x) => x >= 0) || signs.every((x) => x <= 0);
      }).slice(0, s.b.maxTargets).map((e) => e.id);
      if (ids.length) {
        const c = { ...a[0], id: `${a[0].id}:flood:${s.m.tick}`, position: center };
        if (s.emit(c, { type: 'hit', targetIds: ids, damage: p.floodDamage })) {
          this.floodCasts.set(owner, c.id);
          this.floodCooldowns.set(owner, s.m.tick + s.t(p.floodPulse));
          s.cue('weave-burst', { ...c, weaveEffect: 'flood', triangle: a.map((anchor) => [...anchor.position]) });
        }
      }
    }
  }
}

export class StanceManager {
  constructor(s) {
    this.s = s;
    this.active = s.m.activeStances;
  }
  activate(c) {
    if (this.active.has(c.ownerId)) return 'stance already active';
    this.active.set(c.ownerId, {
      ...c,
      bank: 0,
      attacks: 0,
      hits: 0, nextRetaliation: 0, quakeBank: 0,
      pendingBursts: 0, pendingArcs: [], pendingRetorts: [], pendingQuakes: 0, burstSequence: 0, quakeSequence: 0,
      expiresTick: this.s.m.tick + this.s.t(this.s.preset(c).life)
    });
    this.s.cue('stance', c);
    return null;
  }
  /** Shared with the pending-cast budget: no actor can grow retry storage unboundedly. */
  deferredCount() {
    let count = 0;
    for (const a of this.active.values())
      count += a.pendingBursts + a.pendingArcs.length + a.pendingRetorts.length + a.pendingQuakes;
    return count;
  }
  reserve(a, kind, c, targetId) {
    if (this.s.pending.length + this.deferredCount() >= this.s.b.maxPending) {
      this.s.cue('refused', { ...c, reason: 'stance proc budget' });
      return false;
    }
    if (kind === 'burst') a.pendingBursts++;
    else if (kind === 'quake') a.pendingQuakes++;
    else if (kind === 'arc') a.pendingArcs.push({ c, targetId });
    else if (kind === 'retort') a.pendingRetorts.push({ c, targetId });
    return true;
  }
  finish(ownerId) {
    this.lastFinishFailure = null;
    const a = this.active.get(ownerId);
    if (!a) { this.lastFinishFailure = 'no active stance'; return false; }
    const s = this.s,
      e = s.m.entities.get(ownerId);
    const p = s.preset(a), c = stanceCast(a, `${a.id}:finish`, e.position);
    const shape = disc(c.position, p.finisherRadius), ids = s.targets(c, shape);
    // Reserve both events before committing: a finisher must never lose its
    // damage or terrain while still consuming the active form.
    if (!s.canEmit(1 + Number(ids.length > 0))) {
      this.lastFinishFailure = 'event budget';
      return false;
    }
    if (ids.length) s.emit(c, { type: 'hit', targetIds: ids, shape, damage: p.damage + a.bank });
    s.emit(c, {
      type: 'terrain-impact',
      shape,
      intensity: 1 + a.bank
    });
    this.active.delete(ownerId);
    s.cue('finisher', { ...c, visualRadius: p.finisherRadius });
    return true;
  }
  modify(e) {
    const s = this.s,
      a = this.active.get(e.ownerId);
    if (a && e.type === 'cast-start' && e.mechanic === 'standard') {
      a.attacks++;
      // Every third existing cast adds a local force wave, rather than mutating its geometry.
      const p = s.preset(a);
      const interval = p.passive === 'tide' ? 2 : 3;
      if ((p.passive === 'ember' || p.passive === 'tide' || !p.passive) && a.attacks % interval === 0) {
        const c = stanceCast(a, `${a.id}:burst-reserve:${a.attacks}`, s.m.entities.get(a.ownerId).position);
        if (this.reserve(a, 'burst', c)) this.flush(a, 1);
      }
    }
    if (e.type === 'hit') {
      if (a && e.mechanic === 'standard') e.intensity = Math.min(s.m.budget.maxIntensity, e.intensity * 1.25);
      if (a && e.mechanic === 'standard' && s.preset(a).passive === 'chain' && e.targetIds.length &&
          (e.tags.includes('sandbox-kill') || e.tags.includes('sandbox-freeze'))) {
        a.hits++;
        if (a.hits % 2 === 0) {
          const first = s.m.entities.get(e.targetIds[0]);
          const other = first && sorted(s.m.entities).find((target) => target.alive && target.teamId !== e.teamId &&
            !e.targetIds.includes(target.id) && dist(target.position, first.position) <= 4 &&
            !s.worldshape.blocked(first.position, target.position));
          if (other) {
            const c = stanceCast(a, `${a.id}:arc:${e.eventId}`, first.position);
            if (this.reserve(a, 'arc', c, other.id)) this.flush(a, 1);
          }
        }
      }
      for (const id of e.targetIds) {
        const guard = this.active.get(id);
        if (guard && e.teamId !== s.m.entities.get(id)?.teamId && e.damage > 0) {
          const p = s.preset(guard);
          const incoming = e.damageByTarget?.[id] ?? e.damage;
          if (incoming <= 0) continue;
          const amount = incoming * p.reduction;
          guard.bank = Math.min(p.bankCap, guard.bank + amount);
          e.damageByTarget = { ...e.damageByTarget, [id]: incoming - amount };
          s.cue('block', stanceCast(guard, guard.id, s.m.entities.get(id).position));
          const source = s.m.entities.get(e.ownerId), target = s.m.entities.get(id);
          if (p.passive === 'retaliate' && source?.alive && s.m.tick >= guard.nextRetaliation &&
              dist(source.position, target.position) <= 8 && !s.worldshape.blocked(target.position, source.position)) {
            const c = stanceCast(guard, `${guard.id}:retort:${e.eventId}`, target.position);
            if (this.reserve(guard, 'retort', c, source.id)) {
              guard.nextRetaliation = s.m.tick + s.t(1);
              this.flush(guard, 1);
            }
          }
          if (p.passive === 'quakes') {
            guard.quakeBank += amount;
            let reserved = false;
            while (guard.quakeBank >= 0.4) {
              guard.quakeBank -= 0.4;
              const c = stanceCast(guard, `${guard.id}:quake-reserve:${e.eventId}`, target.position);
              reserved = this.reserve(guard, 'quake', c) || reserved;
            }
            if (reserved) this.flush(guard, 1);
          }
        }
      }
    }
  }
  /** Retry deferred procs in tick order; an exhausted budget never consumes them. */
  flush(a, limit) {
    const s = this.s, p = s.preset(a), owner = s.m.entities.get(a.ownerId);
    if (!owner?.alive) return;
    let attempted = 0;
    while (attempted++ < limit) {
      if (a.pendingBursts > 0) {
        const c = stanceCast(a, `${a.id}:combo:${a.burstSequence}`, owner.position);
        if (!s.area(c, disc(c.position, p.passive === 'tide' ? 4 : 3), p.passive === 'ember' ? 0.7 : 0.5)) break;
        a.pendingBursts--; a.burstSequence++; s.cue('finisher', { ...c, visualRadius: p.passive === 'tide' ? 4 : 3 });
      } else if (a.pendingArcs.length) {
        const { c, targetId } = a.pendingArcs[0], target = s.m.entities.get(targetId);
        if (!target?.alive || target.teamId === owner.teamId || dist(c.position, target.position) > 4 ||
            s.worldshape.blocked(c.position, target.position)) { a.pendingArcs.shift(); continue; }
        if (!s.emit(c, { type: 'hit', targetIds: [targetId], damage: 0.45, tags: ['stance-arc'] })) break;
        a.pendingArcs.shift(); s.cue('reversal', { ...c, from: [...target.position] });
      } else if (a.pendingRetorts.length) {
        const { c, targetId } = a.pendingRetorts[0], target = s.m.entities.get(targetId);
        if (!target?.alive || target.teamId === owner.teamId || dist(owner.position, target.position) > 8 ||
            s.worldshape.blocked(owner.position, target.position)) { a.pendingRetorts.shift(); continue; }
        c.position = [...owner.position];
        if (!s.emit(c, { type: 'hit', targetIds: [targetId], damage: 0.35, tags: ['stance-retort'] })) break;
        a.pendingRetorts.shift(); s.cue('reversal', { ...c, from: [...target.position] });
      } else if (p.passive === 'quakes' && a.pendingQuakes > 0) {
        const c = stanceCast(a, `${a.id}:quake:${a.quakeSequence}`, owner.position);
        if (!s.area(c, disc(c.position, 3.5), 0.5)) break;
        a.pendingQuakes--; a.quakeSequence++; s.cue('finisher', { ...c, visualRadius: 3.5 });
      } else break;
    }
  }
  update() {
    const s = this.s;
    for (const [id, a] of this.active) {
      const state = s.actor(id);
      state.energy = Math.max(0, state.energy - s.preset(a).drain / s.m.budget.tickRate);
      if (!s.alive(id) || a.expiresTick <= s.m.tick || state.energy <= 0) this.active.delete(id);
      else this.flush(a, s.b.commandsPerTick);
    }
  }
}

export class CounterManager {
  constructor(s) {
    this.s = s;
    this.windows = s.m.counterWindows;
  }
  activate(c) {
    const s = this.s,
      p = s.preset(c);
    this.windows.set(c.ownerId, {
      ...c,
      perfectUntil: s.m.tick + s.t(p.perfect),
      expiresTick: s.m.tick + s.t(p.perfect + p.partial)
    });
    s.cue('counter', c);
    return null;
  }
  intercept(e) {
    if (e.type !== 'hit' || e.tags.includes('uncounterable') || e.tags.includes('counter-return')) return;
    const s = this.s;
    e.targetIds = e.targetIds.filter((id) => {
      const w = this.windows.get(id),
        target = s.m.entities.get(id),
        source = s.m.entities.get(e.ownerId);
      if (
        !w ||
        !source ||
        source.teamId === target?.teamId ||
        dist(source.position, target.position) > s.preset(w).range
      )
        return true;
      this.windows.delete(id);
      const p = s.preset(w);
      if (s.m.tick >= w.perfectUntil) {
        e.damageByTarget = {
          ...e.damageByTarget,
          [id]: (e.damageByTarget?.[id] ?? e.damage ?? 0) * p.reduction
        };
        e.intensityByTarget = { ...e.intensityByTarget, [id]: e.intensity * p.reduction };
        s.cue('partial', w);
        return true;
      }
      const c = { ...w, id: `${w.id}:return`, position: [...source.position] };
      const splashShape = p.splash ? disc(c.position, p.splash) : null;
      const nearby = splashShape ? s.targets(c, splashShape).filter((other) => other !== source.id) : [];
      const required = 1 + (nearby.length ? 1 : 0) + (p.footprint ? 1 : 0);
      if (s.used + required > s.b.eventsPerTick || s.m.queue.length + required > s.m.budget.maxQueue) {
        s.cue('refused', { ...w, reason: 'event budget' });
        return true;
      }
      if (!s.emit(c, { type: 'hit', targetIds: [source.id], tags: ['counter-return'], damage: p.damage })) {
        s.cue('refused', { ...w, reason: 'event budget' });
        return true;
      }
      if (nearby.length) s.emit({ ...c, id: `${c.id}:splash` }, { type: 'hit', targetIds: nearby, shape: splashShape, tags: ['counter-return'], damage: p.splashDamage });
      if (p.footprint) s.emit({ ...c, id: `${c.id}:footprint` }, { type: 'terrain-impact', shape: disc(c.position, p.footprint), durationTicks: s.t(2) });
      if (p.shield) target.shields = Math.max(target.shields, Math.min(1, target.shields + p.shield));
      s.cue('reversal', { ...c, from: [...target.position] });
      return false;
    });
  }
  update() {
    for (const [id, w] of this.windows)
      if (!this.s.alive(id) || w.expiresTick <= this.s.m.tick) {
        this.windows.delete(id);
        this.s.cue('whiff', w);
        if (this.s.alive(id)) this.s.actor(id).recoveryUntil = this.s.m.tick + this.s.t(this.s.preset(w).recovery);
      }
  }
}

/** Combat-local ridges + walkable ramp patch. Queries are shared by movement, LOS and AI. */
export class WorldshapeManager {
  constructor(s) {
    this.s = s;
    this.regions = new Map();
  }
  activate(c) {
    const s = this.s,
      p = s.preset(c);
    if (this.regions.size >= s.b.maxWorldshapes) return 'terrain budget';
    if (Math.hypot(c.position[0], c.position[2]) + p.radius > s.b.arenaRadius) return 'terrain outside arena';
    if (sorted(this.regions).some((r) => dist(r.position, c.position) < p.radius + s.preset(r).radius))
      return 'terrain overlap';
    const [dx, , dz] = c.direction;
    const layout = p.ridges ?? [-2.6, 0, 2.6].map((n) => [n, 0, p.ridgeRadius]);
    const ridges = layout.map(([right, forward, radius]) =>
      disc([c.position[0] + dz * right + dx * forward, 0, c.position[2] - dx * right + dz * forward], radius));
    if (
      [...s.m.entities.values()].some(
        (e) =>
          e.alive && ridges.some((r) => shapeContains({ ...r, r: r.r + 0.55 }, e.position[0], e.position[2]))
      )
    )
      return 'terrain would trap an actor';
    const r = { ...c, ridges, expiresTick: s.m.tick + s.t(p.life), nextPulse: s.m.tick + s.t(p.pulse ?? p.life) };
    if (!s.emit(c, { type: 'terrain-impact', shape: disc(c.position, p.radius), durationTicks: s.t(p.life) })) return 'event budget';
    this.regions.set(r.id, r);
    s.cue('worldshape', r);
    return null;
  }
  blocked(a, b, radius = 0, { allowEgress = false } = {}) {
    return sorted(this.regions).some((w) => w.ridges.some((r) => {
      // A ground effect originating within solid terrain may radiate outward;
      // other ridges along the path still block it. Movement and ordinary
      // projectile queries retain the default, strict collision policy.
      if (allowEgress && shapeContains(r, a[0], a[2])) return false;
      return shapesOverlap(r, segment(a, b, radius));
    }));
  }
  /** An embedded body may leave a collider, but cannot move further into it. */
  movementBlocked(a, b, radius = 0) {
    return sorted(this.regions).some((w) => w.ridges.some((r) => {
      if (!shapesOverlap(r, segment(a, b, radius))) return false;
      const ax = a[0] - r.x, az = a[2] - r.z;
      const bx = b[0] - r.x, bz = b[2] - r.z;
      const startSq = ax * ax + az * az, endSq = bx * bx + bz * bz;
      const inside = startSq <= (r.r + radius) ** 2 + 1e-9;
      const movingOut = ax * (b[0] - a[0]) + az * (b[2] - a[2]) >= 0 && endSq > startSq;
      return !(inside && movingOut);
    }));
  }
  /** Teleports may cross cover, but may not finish embedded in it. */
  resolveAbilityMovement(from, to, radius = 0.4) {
    const occupied = (p) => sorted(this.regions).some((w) => w.ridges.some((r) =>
      Math.hypot(p[0] - r.x, p[2] - r.z) < r.r + radius));
    if (!occupied(to)) {
      if (occupied(from) && this.movementBlocked(from, to, radius)) return [...from];
      return [...to];
    }
    return occupied(from) && !this.movementBlocked(from, to, radius) ? [...to] : [...from];
  }
  move(from, to, radius = 0.4) {
    // Swept segments prevent high-speed dashes tunnelling through cover.
    const out = [...to];
    if (this.movementBlocked(from, to, radius)) {
      const x = [to[0], to[1], from[2]],
        z = [from[0], to[1], to[2]];
      if (!this.movementBlocked(from, x, radius)) out.splice(0, 3, ...x);
      else if (!this.movementBlocked(from, z, radius)) out.splice(0, 3, ...z);
      else out.splice(0, 3, ...from);
    }
    // Floodplain current is an environmental force, applied equally to all movers.
    for (const r of sorted(this.regions)) {
      const p = this.s.preset(r);
      if (!p.current || dist(out, r.position) > p.radius) continue;
      const drift = dist(from, out) * p.current;
      const pushed = [out[0] + r.direction[0] * drift, out[1], out[2] + r.direction[2] * drift];
      if (!this.movementBlocked(out, pushed, radius)) out.splice(0, 3, ...pushed);
    }
    out[1] = this.heightAt(out);
    return out;
  }
  heightAt(p) {
    let h = 0;
    for (const r of this.regions.values()) {
      const spec = this.s.preset(r);
      h = Math.max(h, spec.height * Math.max(0, 1 - dist(p, r.position) / spec.radius));
    }
    return h;
  }
  update() {
    for (const [id, r] of this.regions)
      if (r.expiresTick <= this.s.m.tick || !this.s.alive(r.ownerId)) {
        this.regions.delete(id);
        this.s.m.regions.delete(`rg:${r.id}:terrain-impact`);
        this.s.cue('terrain-expire', r);
      } else {
        const p = this.s.preset(r);
        if (p.pulse && this.s.m.tick >= r.nextPulse) {
          const c = { ...r, id: `${r.id}:pulse:${this.s.m.tick}` };
          // Keep the pulse due if the event budget is exhausted. A visual
          // impact must not advertise damage that could not be queued.
          if (this.s.area(c, disc(r.position, p.radius), p.damage)) {
            this.s.cue('terrain-pulse', c);
            r.nextPulse = this.s.m.tick + this.s.t(p.pulse);
          }
        }
      }
  }
}

export class ConvergenceManager {
  constructor(s) {
    this.s = s;
  }
  activate(c) {
    const s = this.s,
      p = s.preset(c),
      shape = disc(c.position, p.radius);
    const ingredients = sorted(s.m.regions)
      .filter(
        (r) =>
          r.expiresTick > s.m.tick &&
          r.element !== p.element &&
          shapesOverlap(shape, r.shape) &&
          resolvePair(r.element, p.element).tier <= TIER.RULE
      )
      .slice(0, p.maxIngredients);
    if (!ingredients.length) return 'needs a compatible active region';
    const seen = new Set();
    const strikes = convergenceStrikeShapes(p, c).map((strike) => {
      const targetIds = s.targets(c, strike, false, { allowEgress: true }).filter((id) => {
        if (seen.has(id) || seen.size >= s.b.maxTargets) return false;
        seen.add(id); return true;
      });
      return { shape: strike, targetIds };
    }).filter((strike) => strike.targetIds.length);
    const needed = 1 + strikes.length;
    if (s.used + needed > s.b.eventsPerTick || s.m.queue.length + needed > s.m.budget.maxQueue)
      return 'event budget';
    // Resolve through UCSM itself: reactions keep their normal caps/diminishing/ownership.
    // Consume only the selected spatial ingredients after this event has resolved.
    if (
      !s.emit(c, {
        type: 'terrain-impact',
        shape,
        intensity: Math.min(s.m.budget.maxIntensity, 1 + ingredients.length * 0.25),
        consumeRegions: ingredients.map((r) => r.id)
      })
    )
      return 'event budget';
    strikes.forEach((strike, i) => s.emit({ ...c, id: `${c.id}:strike:${i}` }, { type: 'hit', castId: c.id, targetIds: strike.targetIds, damage: p.damage, shape: strike.shape }));
    s.cue('convergence', {
      ...c,
      ingredients: ingredients.map((r) => ({ id: r.id, element: r.element, ownerId: r.ownerId }))
    });
    return null;
  }
}

/** Fixed-tick orchestration. No renderer, wall clock, randomness, or hidden timers. */
export class MechanicSystems {
  constructor(manager, budget = {}) {
    this.m = manager;
    this.b = { ...MECHANIC_BUDGET, ...budget };
    this.commands = [];
    this.pending = [];
    this.actors = new Map();
    this.sequence = 0;
    this.used = 0;
    this.results = [];
    this.seen = new Set();
    this.seenOrder = [];
    this.weave = new WeavingManager(this);
    this.stance = new StanceManager(this);
    this.counter = new CounterManager(this);
    this.worldshape = new WorldshapeManager(this);
    this.convergence = new ConvergenceManager(this);
    manager.mechanics = this;
  }
  t(seconds) {
    return this.m.ticksFor(seconds);
  }
  alive(id) {
    return !!this.m.entities.get(id)?.alive;
  }
  actor(id) {
    if (!this.actors.has(id)) this.actors.set(id, { energy: this.b.energy, cooldowns: {}, recoveryUntil: 0 });
    return this.actors.get(id);
  }
  preset(c) { return MECHANIC_VARIANTS[c.uid] ?? P[c.family]; }
  command({ family, uid, ownerId = 'caster', position, direction = [0, 0, 1], action = 'cast', commandId }) {
    if (!P[family]) return { ok: false, reason: 'unimplemented mechanic' };
    if (uid && uid !== P[family].uid && MECHANIC_VARIANTS[uid]?.family !== family)
      return { ok: false, reason: 'unknown mechanic variant' };
    if (!this.alive(ownerId)) return { ok: false, reason: 'unknown or dead owner' };
    if (!this.actors.has(ownerId) && this.actors.size >= this.b.maxActors)
      return { ok: false, reason: 'actor budget' };
    position = position ?? this.m.entities.get(ownerId).position;
    if (
      !Array.isArray(position) ||
      position.length !== 3 ||
      !position.every(Number.isFinite) ||
      !Array.isArray(direction) ||
      direction.length !== 3 ||
      !direction.every(Number.isFinite)
    )
      return { ok: false, reason: 'invalid position/direction' };
    if (!['cast', 'finish', 'cancel'].includes(action)) return { ok: false, reason: 'unknown action' };
    if (this.commands.length >= this.b.maxCommands) return { ok: false, reason: 'command budget' };
    const id = commandId ?? `mc:${this.m.tick}:${this.sequence++}`;
    if (this.seen.has(id)) return { ok: false, reason: 'duplicate command' };
    this.seen.add(id);
    this.seenOrder.push(id);
    if (this.seenOrder.length > 4096) this.seen.delete(this.seenOrder.shift());
    if (Math.hypot(direction[0], direction[2]) < 1e-6) direction = [0, 0, 1];
    const length = Math.hypot(direction[0], direction[2]);
    this.commands.push({
      id,
      family,
      uid: uid ?? P[family].uid,
      ownerId,
      position: position.map(snap),
      direction: [direction[0] / length, 0, direction[2] / length],
      action
    });
    return { ok: true, id };
  }
  cue(kind, c) {
    this.m.cues.push({ kind: 'mechanic', phase: kind, ...c, position: [...c.position], tick: this.m.tick });
  }
  canEmit(count = 1) {
    return this.used + count <= this.b.eventsPerTick && this.m.queue.length + count <= this.m.budget.maxQueue;
  }
  emit(c, event) {
    if (!this.canEmit()) return false;
    this.used++;
    const p = this.preset(c),
      owner = this.m.entities.get(c.ownerId);
    this.m.submit({
      eventId: `${c.id}:${event.type}`,
      castId: c.id,
      ownerId: c.ownerId,
      teamId: owner?.teamId,
      abilityUid: p.uid,
      element: p.element,
      mechanic: c.family,
      position: c.position,
      ...event
    });
    return true;
  }
  targets(c, shape, swept = false, { allowEgress = false } = {}) {
    const team = this.m.entities.get(c.ownerId)?.teamId;
    return sorted(this.m.entities)
      .filter((e) => {
        if (!e.alive || e.teamId === team || this.worldshape.blocked(c.position, e.position, 0, { allowEgress })) return false;
        if (shapeContains(shape, e.position[0], e.position[2])) return true;
        const prior = this.m.positionAt(e.id);
        return swept && prior && shapesOverlap(shape, segment(prior, e.position));
      })
      .slice(0, this.b.maxTargets)
      .map((e) => e.id);
  }
  area(c, shape, damage) {
    const ids = this.targets(c, shape);
    return !ids.length || this.emit(c, { type: 'hit', targetIds: ids, shape, damage });
  }
  result(c, reason) {
    this.results.push({ id: c.id, family: c.family, tick: this.m.tick, ok: !reason, reason: reason ?? null });
    if (this.results.length > 64) this.results.shift();
    if (reason) this.cue('refused', { ...c, reason });
  }
  beforeTick() {
    this.used = 0;
    this.worldshape.update();
    this.stance.update();
    this.counter.update();
    this.weave.update();
    for (const [id, a] of this.actors)
      if (!this.stance.active.has(id))
        a.energy = Math.min(this.b.energy, a.energy + this.b.regen / this.m.budget.tickRate);
    // Interrupted/dead casts cannot later materialize.
    const ready = this.pending.filter((c) => c.readyTick <= this.m.tick);
    this.pending = this.pending.filter((c) => c.readyTick > this.m.tick);
    for (const c of ready) {
      if (!this.alive(c.ownerId)) {
        this.result(c, 'owner died');
        continue;
      }
      const reason = this[c.family].activate(c);
      if (reason) {
        const a = this.actor(c.ownerId);
        a.energy = Math.min(this.b.energy, a.energy + this.preset(c).cost);
        a.cooldowns[c.family] = this.m.tick;
      }
      this.result(c, reason);
    }
    for (const c of this.commands.splice(0, this.b.commandsPerTick)) {
      const a = this.actor(c.ownerId),
        p = this.preset(c);
      if (c.action === 'cancel') {
        this.cancel(c.ownerId);
        this.result(c);
        continue;
      }
      if (c.action === 'finish') {
        const ok = c.family === 'stance' && this.stance.finish(c.ownerId);
        this.result(c, ok ? null : (c.family === 'stance' ? this.stance.lastFinishFailure : 'no active stance'));
        continue;
      }
      let reason;
      if (!this.alive(c.ownerId)) reason = 'owner died';
      else if (a.recoveryUntil > this.m.tick) reason = 'recovering';
      else if ((a.cooldowns[c.family] ?? 0) > this.m.tick) reason = 'cooldown';
      else if (a.energy < p.cost) reason = 'insufficient sovereignty';
      else if (
        dist(this.m.entities.get(c.ownerId).position, c.position) > p.range ||
        Math.hypot(c.position[0], c.position[2]) > this.b.arenaRadius
      )
        reason = 'outside cast range';
      else if (this.pending.length + this.stance.deferredCount() >= this.b.maxPending) reason = 'pending budget';
      if (reason) {
        this.result(c, reason);
        continue;
      }
      a.energy -= p.cost;
      a.recoveryUntil = this.m.tick + this.t(p.anticipation + p.recovery);
      const ownAnchors = [...this.weave.anchors.values()].filter((x) => x.ownerId === c.ownerId).length;
      a.cooldowns[c.family] = this.m.tick + this.t(c.family === 'weave' && ownAnchors < 2 ? 0.8 : p.cooldown);
      this.pending.push({ ...c, readyTick: this.m.tick + this.t(p.anticipation) });
      this.emit(c, { type: 'cast-start' });
      this.cue('anticipation', c);
    }
  }
  beforeEvent(e) {
    if (e.type === 'interrupt') {
      for (const id of e.targetIds) this.cancel(id);
      return;
    }
    this.weave.beforeEvent(e);
    this.counter.intercept(e);
    this.stance.modify(e);
  }
  afterEvent(e) {
    for (const id of e.consumeRegions ?? []) this.m.regions.delete(id);
    // Damage commits before this hook. End a defeated owner's mechanics now,
    // including events already extracted for the rest of this same tick.
    if (e.type === 'hit') for (const id of e.targetIds)
      if (this.actors.has(id) && !this.alive(id)) this.cancel(id);
  }
  speed(id) {
    const tags = this.m.entities.get(id)?.statuses ?? [];
    const slow = tags.some((s) => ['rooted', 'chilled', 'entangled', 'heavy', 'delayed'].includes(s.tag))
      ? 0.65
      : 1;
    const entity = this.m.entities.get(id);
    const inDraft = entity && this.weave.links.some((l) => {
      const owner = this.m.entities.get(l.ownerId);
      const p = MECHANIC_VARIANTS[l.uid];
      return p?.behavior === 'draft' && owner?.teamId === entity.teamId && shapeContains(l.shape, entity.position[0], entity.position[2]);
    });
    return slow * (this.stance.active.has(id) ? this.preset(this.stance.active.get(id)).speed : 1) * (inDraft ? 1.35 : 1);
  }
  cancel(id) {
    this.commands = this.commands.filter((c) => c.ownerId !== id);
    // A queued finisher or convergence can be interrupted before any of its
    // events commits. Drop its transient cue as well, so the renderer does
    // not play an impact for a cast whose gameplay was cancelled. Keep cues
    // for casts that already committed at least one event in the current tick.
    const events = [...this.m.queue, ...(this.m._dueEvents ?? [])].filter((e) => e.ownerId === id && e.mechanic !== 'standard');
    const uncommitted = new Set(events.filter((e) => e.castId && !this.m._seen.has(e.eventId)).map((e) => e.castId));
    for (const event of events) if (this.m._seen.has(event.eventId)) uncommitted.delete(event.castId);
    this.m.cues = this.m.cues.filter((cue) => !(cue.kind === 'mechanic' && cue.ownerId === id && uncommitted.has(cue.id) && ['convergence', 'finisher'].includes(cue.phase)));
    this.m.cancelEvents((e) => e.ownerId === id && e.mechanic !== 'standard');
    this.pending = this.pending.filter((c) => c.ownerId !== id);
    this.stance.active.delete(id);
    this.counter.windows.delete(id);
    for (const [key, a] of this.weave.anchors) if (a.ownerId === id) this.weave.anchors.delete(key);
    this.weave.links = this.weave.links.filter((link) => link.ownerId !== id);
    for (const key of this.weave.hitCooldowns.keys())
      if (JSON.parse(key)[0] === id) this.weave.hitCooldowns.delete(key);
    this.weave.floodCooldowns.delete(id);
    this.weave.floodCasts.delete(id);
    for (const [key, r] of this.worldshape.regions)
      if (r.ownerId === id) {
        this.worldshape.regions.delete(key);
        this.m.regions.delete(`rg:${r.id}:terrain-impact`);
      }
  }
  reset() {
    for (const id of this.actors.keys()) this.cancel(id);
    this.commands = [];
    this.pending = [];
    this.actors.clear();
    this.weave.links = [];
    this.weave.hitCooldowns.clear();
    this.weave.floodCooldowns.clear();
    this.weave.floodCasts.clear();
    this.m.cues = this.m.cues.filter((c) => c.kind !== 'mechanic');
    this.m.effects = this.m.effects.filter((e) => !e.abilityUid?.startsWith('mechanics/'));
    for (const [id, r] of this.m.regions)
      if (r.sourceUid?.startsWith('mechanics/')) this.m.regions.delete(id);
    this.m.cancelEvents((e) => e.mechanic !== 'standard');
  }
}
