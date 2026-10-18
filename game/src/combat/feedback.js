// Combat feedback helpers: per-mesh hit flashes (overlay pass, no material mutation) and persistent
// status visuals attached to actors, synced from `status` events and snapshot/you `fx` lists.
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import '@babylonjs/core/Rendering/outlineRenderer.js';

/** Server status id -> visual kind understood by vfx `status:<kind>`. */
export const STATUS_VISUAL = {
  burn: 'burning', chill: 'chilled', freeze: 'chilled', shock: 'shocked', stun: 'shocked', soak: 'soaked',
  root: 'rooted', poison: 'poisoned', gravity: 'gravity', weaken: 'cursed', bleed: 'bleeding', expose: 'hexed',
  slow: 'slowed', sunder: 'sundered', shield: 'shielded', invuln: 'shielded', haste: 'haste', regen: 'blessed', empower: 'empowered',
};
const IGNORE = new Set(['combat', 'stagger', 'radiant']);

export class HitFlashes {
  constructor() { this.list = []; }
  /** Pulse an emissive-looking overlay over every mesh of an actor. */
  flash(actor, color = Color3.White(), strength = 0.65, dur = 0.18) {
    const root = actor?.root; if (!root?.getChildMeshes) return;
    let meshes; try { meshes = root.getChildMeshes(false); } catch { return; }
    for (const m of meshes) {
      if (!m?.getTotalVertices || m.getTotalVertices() === 0 || m.getClassName?.() === 'InstancedMesh') continue;
      const old = this.list.find((f) => f.m === m);
      if (old) { old.t = 0; old.dur = dur; old.s = strength; old.c.copyFrom(color); continue; }
      this.list.push({ m, t: 0, dur, s: strength, c: color.clone(), prevColor: m.overlayColor?.clone?.(), prevAlpha: m.overlayAlpha, prevOn: m.renderOverlay });
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i]; f.t += dt;
      const m = f.m;
      if (m.isDisposed?.() || f.t >= f.dur) {
        if (!m.isDisposed?.()) { m.renderOverlay = !!f.prevOn; if (f.prevColor) m.overlayColor = f.prevColor; if (f.prevAlpha !== undefined) m.overlayAlpha = f.prevAlpha; }
        this.list.splice(i, 1); continue;
      }
      const k = 1 - f.t / f.dur;
      m.renderOverlay = true; m.overlayColor = f.c; m.overlayAlpha = f.s * k * k;
    }
  }
}

export class StatusVisuals {
  constructor(ctx) { this.ctx = ctx; this.map = new Map(); }
  key(id, kind) { return `${id}|${kind}`; }
  /** Ensure a status visual on actor `id` for `dur` seconds (Infinity = until removed by sync). */
  ensure(id, statusId, dur) {
    if (IGNORE.has(statusId)) return;
    const kind = STATUS_VISUAL[statusId] ?? null; if (!kind) return;
    const actor = this.ctx.actors?.get?.(id); if (!actor || actor.alive === false) return;
    const k = this.key(id, kind); const now = performance.now() / 1000;
    const until = now + (Number.isFinite(dur) && dur > 0 ? dur : 9999);
    const cur = this.map.get(k);
    if (cur && !cur.h?.done) {
      // Snapshots refresh presence, not the effect clock. Restarting each snapshot
      // repeatedly rebuilds particles and prevents status animations progressing.
      cur.until = Math.max(cur.until, until); cur.seen = now; return;
    }
    const h = this.ctx.vfx?.status?.(actor, kind, Math.min(60, until - now)) ?? null;
    this.map.set(k, { id, kind, status: statusId, h, until, seen: now, born: now });
  }
  /** Sync from an authoritative list of status ids for an entity. */
  sync(id, list) {
    if (!Array.isArray(list)) return;
    const want = new Set(list.map((s) => STATUS_VISUAL[s]).filter(Boolean));
    for (const s of list) this.ensure(id, s, Infinity);
    const now = performance.now() / 1000;
    for (const [k, v] of this.map) if (v.id === id && !want.has(v.kind) && now - v.born > 0.6) { v.h?.stop?.(); this.map.delete(k); }
  }
  clear(id) { for (const [k, v] of this.map) if (v.id === id) { v.h?.stop?.(); this.map.delete(k); } }
  update() {
    const now = performance.now() / 1000;
    for (const [k, v] of this.map) if (now > v.until || v.h?.done) { if (!v.h?.done) v.h?.stop?.(); this.map.delete(k); }
  }
}
