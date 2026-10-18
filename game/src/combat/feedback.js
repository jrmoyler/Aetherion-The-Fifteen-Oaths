// Combat feedback helpers: per-mesh hit flashes (overlay pass, no material mutation) and persistent
// status visuals attached to actors, synced from `status` events and snapshot/you `fx` lists.
import { Color } from 'three';

/** Server status id -> visual kind understood by vfx `status:<kind>`. */
export const STATUS_VISUAL = {
  burn: 'burning', chill: 'chilled', freeze: 'chilled', shock: 'shocked', stun: 'shocked', soak: 'soaked',
  root: 'rooted', poison: 'poisoned', gravity: 'gravity', weaken: 'cursed', bleed: 'bleeding', expose: 'hexed',
  slow: 'slowed', sunder: 'sundered', shield: 'shielded', invuln: 'shielded', haste: 'haste', regen: 'blessed', empower: 'empowered',
};
const IGNORE = new Set(['combat', 'stagger', 'radiant']);

export class HitFlashes {
  constructor() { this.list = []; }
  // Private material clones prevent one hit from flashing every actor sharing a GLTF material.
  flash(actor, color = new Color(0xffffff), strength = 0.65, dur = 0.18) {
    actor?.root?.traverse?.((m) => {
      if (!m.isMesh || !m.material) return;
      const old = this.list.find((f) => f.m === m);
      if (old) { old.t = 0; old.dur = dur; old.s = strength; old.c.copy(color); return; }
      const original = m.material;
      const materials = (Array.isArray(original) ? original : [original]).map((mat) => mat.clone());
      m.material = Array.isArray(original) ? materials : materials[0];
      this.list.push({ m, t: 0, dur, s: strength, c: color.clone(), original, materials,
        base: materials.map((mat) => ({ color: mat.emissive?.clone(), intensity: mat.emissiveIntensity ?? 1 })) });
    });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i]; f.t += dt;
      if (f.t >= f.dur || !f.m.parent) {
        f.m.material = f.original; f.materials.forEach((m) => m.dispose());
        this.list.splice(i, 1); continue;
      }
      const k = f.s * (1 - f.t / f.dur) ** 2;
      f.materials.forEach((mat, j) => {
        if (mat.emissive) { mat.emissive.copy(f.base[j].color).lerp(f.c, k); mat.emissiveIntensity = f.base[j].intensity + k * 2; }
      });
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
