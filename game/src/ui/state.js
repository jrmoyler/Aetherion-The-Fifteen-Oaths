// UI-side game state mirror: everything the HUD needs, fed from bus events, with
// defensive accessors over ctx.actors / ctx.net (which may be stubs or not yet booted).
import { Vector3 } from 'three';
import { OATH_BY_ID, CLASSES, xpForLevel, regionAt } from '@shared/oaths.js';

export function createState(ctx) {
  const fwd = new Vector3(0, 0, 1);
  const dir = new Vector3();
  const gs = {
    selfId: null, character: null, you: {}, level: 1, xp: 0, next: xpForLevel(1),
    hp: 100, mhp: 100, mp: 100, mmp: 100, alive: true,
    target: null, quests: new Map(), shrines: new Set(), region: null, statuses: new Map(),
    net: { mode: 'offline', connected: false }, lastPos: null, inGame: false,
  };

  gs.oath = () => OATH_BY_ID[gs.character?.oath] || OATH_BY_ID['oath-09'];
  gs.self = () => {
    const a = ctx.actors;
    if (!a) return null;
    try { return a.player || (gs.selfId != null ? a.get?.(gs.selfId) : null) || null; } catch { return null; }
  };
  gs.isSelf = (id) => id != null && (id === gs.selfId || id === ctx.net?.selfId || id === gs.self()?.id);
  gs.actor = (id) => { try { return id == null ? null : (ctx.actors?.get?.(id) || ctx.actors?.entities?.get?.(id) || null); } catch { return null; } };

  gs.pos = () => {
    const p = gs.self()?.position;
    if (p && Number.isFinite(p.x)) return { x: p.x, y: p.y, z: p.z };
    if (gs.lastPos) return gs.lastPos;
    const c = gs.oath().center; return { x: c[0], y: 0, z: c[1] };
  };
  /** Camera heading in radians: 0 = north (+Z), PI/2 = east (+X). */
  gs.heading = () => {
    const cam = ctx.camera || ctx.actors?.camera;
    if (!cam?.getWorldDirection) return gs.yaw();
    try { cam.getWorldDirection(dir); } catch { return 0; }
    if (Math.abs(dir.x) + Math.abs(dir.z) < 1e-4) return 0;
    return Math.atan2(dir.x, dir.z);
  };
  gs.yaw = () => {
    const r = gs.self()?.root;
    if (!r) return gs._yaw ?? 0;
    try { if (r.rotationQuaternion) return r.rotationQuaternion.toEulerAngles().y; return r.rotation?.y ?? 0; } catch { return 0; }
  };
  gs.forEachEntity = (fn) => {
    const a = ctx.actors; if (!a) return;
    try {
      if (a.entities?.forEach) a.entities.forEach((e, id) => fn(e, id));
      else a.forEach?.((e) => fn(e, e.id));
    } catch { /* stub */ }
  };
  gs.regionHere = () => { const p = gs.pos(); try { return ctx.world?.regionAt?.(p.x, p.z) || regionAt(p.x, p.z); } catch { return regionAt(p.x, p.z); } };

  /** Merge a PlayerState from net:you / welcome (field names are tolerated loosely). */
  gs.applyYou = (you) => {
    if (!you || typeof you !== 'object') return;
    gs.you = { ...gs.you, ...you };
    const n = (...ks) => { for (const k of ks) if (Number.isFinite(you[k])) return you[k]; return undefined; };
    gs.level = n('level', 'lvl') ?? gs.level;
    gs.xp = n('xp', 'exp') ?? gs.xp;
    gs.next = n('next', 'xpNext', 'nextXp') ?? xpForLevel(gs.level);
    gs.hp = n('hp') ?? gs.hp; gs.mhp = n('mhp', 'maxHp', 'hpMax') ?? gs.mhp;
    gs.mp = n('mp', 'mana') ?? gs.mp; gs.mmp = n('mmp', 'maxMp', 'mpMax', 'maxMana') ?? gs.mmp;
    if (you.id != null && gs.selfId == null) gs.selfId = you.id;
    if (Array.isArray(you.quests)) for (const q of you.quests) if (q?.id) gs.quests.set(q.id, q);
    const sh = you.shrines || you.discovered;
    if (Array.isArray(sh)) sh.forEach((s) => gs.shrines.add(typeof s === 'string' ? s : s?.id));
    if (Number.isFinite(you.x) && Number.isFinite(you.z)) gs.lastPos = { x: you.x, y: you.y || 0, z: you.z };
  };

  gs.setCharacter = (c) => {
    gs.character = c;
    const base = CLASSES[c.cls] || CLASSES.ninja;
    gs.mhp = gs.hp = base.hp; gs.mmp = gs.mp = base.mp;
    gs.shrines.add(c.oath);
  };

  /** Pull live values from the local actor (authoritative hp) every HUD tick. */
  gs.sync = () => {
    const s = gs.self();
    if (s) {
      if (Number.isFinite(s.hp)) gs.hp = s.hp;
      if (Number.isFinite(s.mhp) && s.mhp > 0) gs.mhp = s.mhp;
      if (Number.isFinite(s.mp)) gs.mp = s.mp;
      if (Number.isFinite(s.mmp) && s.mmp > 0) gs.mmp = s.mmp;
      if (Number.isFinite(s.level)) gs.level = Math.max(gs.level, s.level);
      if (typeof s.alive === 'boolean') gs.alive = s.alive;
    }
  };
  return gs;
}
