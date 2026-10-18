// Combat — targeting, casting, feedback. init(ctx) → { hotbar, target, setTarget, cast, cooldowns, castBar }.
// Client-side prediction: cooldown/mana pre-checks against the latest `net:you`, local anticipation VFX and
// animation the instant a slot is pressed, then `{t:'cast'}` to the server. Server events resolve visuals
// for everyone else (cast/hit/heal/status/death/interrupt/fail). See game/CONTRACTS.md.
import { Vector3, Vector2, Raycaster, Color } from 'three';
import { hotbarFor, ABILITY_BY_ID } from '@shared/abilities.js';
import { OATH_BY_ID } from '@shared/oaths.js';
import { HitFlashes, StatusVisuals } from './feedback.js';
import { createArenas } from './arenas.js';
import { ActionBuffer, reconcileCooldown } from './timing.js';
import { replaceHotbar } from './loadout.js';

const ELEMENT_FLASH = {
  fire: '#ff8a3c', frost: '#bfefff', storm: '#cfe0ff', water: '#8fe6ff', earth: '#ffd7a0', wind: '#e6fbff', nature: '#c8ff9a', poison: '#b6ff3d',
  light: '#fff4c0', cosmic: '#d8b8ff', shadow: '#b48cff', blood: '#ff5a6a', arcane: '#e0a8ff', time: '#ffe0a0', tech: '#a8f0ff',
};
const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const nowMs = () => performance.now();

export async function init(ctx) {
  const state = {
    hotbar: [], target: null, cooldowns: {}, castBar: null, gcdUntil: 0,
    you: null, character: ctx.character ?? null, combo: 0,
  };
  const flashes = new HitFlashes();
  const statuses = new StatusVisuals(ctx);
  const localCasts = new Map(); // slot -> {t, handle, ability}
  const remoteFx = new Map(); // `${src}|${slot}` -> t  (to skip release echoes)
  const recentFxBySrc = new Map(); // src -> t (a cast effect already showed an impact)
  const lastImpactAt = new Map(); // dst -> t
  let toastAt = -Infinity;
  const actionBuffer = new ActionBuffer(180);
  let releaseTimer = null;
  let pruneAt = 0;
  const cancelRelease = () => { clearTimeout(releaseTimer); releaseTimer = null; };
  ctx.scene.onDisposeObservable?.addOnce(() => { cancelRelease(); actionBuffer.clear(); });

  const bus = ctx.bus;
  const actors = () => ctx.actors;
  const player = () => ctx.actors?.player ?? null;
  const selfId = () => ctx.net?.selfId ?? player()?.id ?? null;
  const isSelf = (id) => id != null && (id === selfId() || id === player()?.id);
  const actorOf = (id) => { try { return id == null ? null : (isSelf(id) ? player() : ctx.actors?.get?.(id)) ?? null; } catch { return null; } };
  const elementOfActor = (a) => (a?.element ?? OATH_BY_ID[a?.oath]?.element ?? null);
  const groundY = (x, z, fallback = 0) => { try { const h = ctx.world?.heightAt?.(x, z); return Number.isFinite(h) ? h : fallback; } catch { return fallback; } };
  const toast = (text) => { const t = nowMs(); if (t - toastAt < 900) return; toastAt = t; try { ctx.ui?.toast?.(text, 'warn'); } catch { /* ui optional */ } };

  function setHotbar(character, selectedIds, authoritative) {
    if (!character && !authoritative) return false;
    if (character) state.character = character;
    try {
      const next = authoritative ?? hotbarFor(character.oath, character.cls, selectedIds);
      if (!replaceHotbar(state.hotbar, next)) return false;
      // The server confirmed a different kit. Retire only the old kit's prediction;
      // repeated snapshots of the same kit must never interrupt a cast.
      cancelRelease(); actionBuffer.clear();
      for (const entry of localCasts.values()) entry.handle?.stop?.();
      localCasts.clear(); state.castBar = null; state.gcdUntil = 0; state.combo = 0;
      for (let slot = 0; slot < 6; slot++) {
        state.cooldowns[slot] = 0;
        bus.emit('combat:cooldown', { slot, until: 0, duration: 0 });
      }
      bus.emit('combat:hotbar', { hotbar: state.hotbar, loadout: state.hotbar.slice(1).map((ab) => ab.id) });
      return true;
    } catch (err) { console.warn('[combat] hotbar', err); return false; }
  }
  setHotbar(ctx.character);

  // ------------------------------------------------------------------------------------------ targeting
  function setTarget(id) {
    const v = id ?? null;
    if (v === state.target) return;
    state.target = v;
    try { ctx.net?.send?.({ t: 'target', id: v }); } catch { /* offline stub */ }
    bus.emit('combat:target', { id: v });
  }
  function targetActor() {
    const a = actorOf(state.target);
    if (!a || a.alive === false) return null;
    return a;
  }
  // PvP: hostile players (both flagged / war zone, or the live duel opponent) are valid enemies; friendlies never are.
  const canAttackPlayer = (a) => { try { return !!ctx.net?.canAttack?.(a.id); } catch { return false; } };
  const isEnemy = (a) => !!a && a !== player() && a.alive !== false && (a.kind === 'mob' ? !isFriendlyPet(a) : a.kind === 'player' && canAttackPlayer(a));
  const isFriendlyPet = (a) => { const own = ctx.net?.entities?.get?.(a.id)?.own; return own != null && (isSelf(own) || !ctx.net?.canAttack?.(own)); };
  /** Nearest enemy (creature or attackable player) favouring the camera's facing, like actors.nearestHostile. */
  function nearestEnemy(maxDist) {
    const p = player(); if (!p) return null;
    let best = null, score = Infinity;
    const forward = camForward();
    ctx.actors?.forEach?.((a) => {
      if (a.visible === false || !isEnemy(a)) return;
      const dx = a.position.x - p.position.x, dz = a.position.z - p.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > maxDist || Math.abs(a.position.y - p.position.y) > 8) return;
      if (ctx.collision?.blocked?.(p.position.x, p.position.z, a.position.x, a.position.z, p.position.y + 1)) return;
      const facing = distance > 0.01 ? (dx * forward.x + dz * forward.z) / distance : 1;
      const candidate = distance * (1 + (1 - facing) * 0.65);
      if (candidate < score) { score = candidate; best = a; }
    });
    return best;
  }
  function cycleTarget() {
    const p = player(); if (!p) return;
    const list = [];
    try { ctx.actors?.forEach?.((a) => { if (a !== p && a.visible !== false && isEnemy(a)) { const d = a.position.distanceTo(p.position); if (d < 40) list.push({ a, d }); } }); } catch { /* stub */ }
    if (!list.length) { const n = nearestEnemy(40); if (n) setTarget(n.id); return; }
    list.sort((x, y) => x.d - y.d);
    const i = list.findIndex((e) => e.a.id === state.target);
    setTarget(list[(i + 1) % list.length].a.id);
  }
  function clickPick() {
    if (ctx.input?.state?.pointerLocked) return;
    const sc = ctx.scene; let a = null;
    try { a = ctx.actors?.pick?.(sc.pointerX, sc.pointerY) ?? null; } catch { a = null; }
    if (a && a !== player()) setTarget(a.id);
  }

  // ------------------------------------------------------------------------------------------ aiming
  function camForward() {
    const cam = ctx.actors?.camera ?? ctx.camera;
    let d = null;
    try { d = cam?.getWorldDirection?.(new Vector3()); } catch { d = null; }
    if (!d) { const p = player(); const ry = p?.root?.rotation?.y ?? 0; d = new Vector3(Math.sin(ry), 0, Math.cos(ry)); }
    d.y = 0; if (d.lengthSq() < 1e-6) d.set(0, 0, 1); return d.normalize();
  }
  /** Ground point under the screen-centre (pointer locked) / mouse reticle, clamped to range. */
  function reticle(range) {
    const p = player(); const pos = p.position;
    const cam = ctx.actors?.camera ?? ctx.camera;
    if (!cam || isTouch()) return pos.clone().add(camForward().multiplyScalar(Math.min(range, 8)));
    try {
      const sc = ctx.scene; const locked = ctx.input?.state?.pointerLocked;
      const rect = ctx.canvas.getBoundingClientRect();
      const x = locked ? rect.width / 2 : sc.pointerX; const y = locked ? rect.height * 0.45 : sc.pointerY;
      const raycaster = new Raycaster();
      raycaster.setFromCamera(new Vector2(x / rect.width * 2 - 1, 1 - y / rect.height * 2), cam);
      const ray = raycaster.ray;
      if (ray.direction.y < -0.02) {
        let t = (pos.y - ray.origin.y) / ray.direction.y; // plane at player height, then refine on terrain
        for (let k = 0; k < 3; k++) { const q = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t)); const gy = groundY(q.x, q.z, pos.y); t = (gy - ray.origin.y) / ray.direction.y; }
        const hit = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t)); const off = hit.clone().sub(pos); off.y = 0;
        const d = off.length(); if (d > range) off.multiplyScalar(range / d);
        return pos.clone().add(off);
      }
    } catch { /* fall through */ }
    return pos.clone().add(camForward().multiplyScalar(Math.min(range, 8)));
  }
  function computeAim(ab, tgt) {
    const p = player(); const pos = p.position; const range = ab.range ?? 12;
    let dir; let aim;
    if (ab.shape === 'self' || ab.shape === 'summon') { dir = tgt ? tgt.position.clone().sub(pos) : camForward(); aim = pos.clone(); }
    else if (ab.shape === 'zone') {
      if (tgt && tgt.position.distanceTo(pos) <= range + 2) aim = tgt.position.clone(); else aim = reticle(range);
      dir = aim.clone().sub(pos);
    } else { // line / melee / projectile
      if (tgt) { dir = tgt.position.clone().sub(pos); aim = tgt.position.clone(); } else { dir = camForward(); aim = pos.clone().add(dir.clone().multiplyScalar(range)); }
    }
    dir.y = 0; if (dir.lengthSq() < 1e-6) dir = camForward(); dir.normalize();
    aim.y = groundY(aim.x, aim.z, aim.y);
    return { dir, aim };
  }

  // ------------------------------------------------------------------------------------------ casting
  function manaOk(ab) { const mp = state.you?.mp; return !(Number.isFinite(mp) && mp < (ab.mana ?? 0)); }

  function cast(slot) {
    try {
      const ab = state.hotbar[slot]; const p = player();
      if (!ab || !p || p.alive === false) return false;
      const now = nowMs();
      if (state.castBar && now < state.castBar.end) return false;
      if ((state.cooldowns[slot] ?? 0) > now + 50) { if (slot > 0) toast(`${ab.name} is not ready yet.`); return false; }
      if (slot > 0 && state.gcdUntil > now + 40) return false;
      if (!manaOk(ab)) { toast('Not enough mana.'); return false; }
      let tgt = targetActor();
      if (tgt && !isEnemy(tgt)) tgt = null; // friendly players, neutral NPCs and allied pets are never attacked
      const melee = ab.shape === 'melee';
      if (tgt && tgt.position.distanceTo(p.position) > (ab.range ?? 12) + (melee ? 1.5 : 10)) tgt = melee ? null : tgt;
      if (!tgt && (melee || ab.kind === 'basic')) { const n = nearestEnemy((ab.range ?? 3) + (melee ? 1.8 : 0)); if (n) { tgt = n; setTarget(n.id); } }
      const { dir, aim } = computeAim(ab, tgt);
      try { p.faceToward?.(aim.x + dir.x * 0.01, aim.z + dir.z * 0.01, 0.6); } catch { /* optional */ }
      const castTime = ab.castTime ?? 0;
      // animation
      let anim;
      if (ab.kind === 'basic') anim = ab.shape === 'melee' ? `attack_${(state.combo++ % 3) + 1}` : 'cast_release';
      else if (castTime >= 0.4) anim = 'cast_channel';
      else anim = ab.shape === 'zone' ? 'cast_aoe' : 'cast_release';
      try { p.playAnim?.(anim, { speed: 1 }); p.lastActionAt = now / 1000; } catch { /* optional */ }
      cancelRelease();
      if (castTime >= 0.4) releaseTimer = setTimeout(() => { releaseTimer = null; if (p.alive === false || p !== player()) return; try { p.playAnim?.(ab.shape === 'zone' ? 'cast_aoe' : 'cast_release'); } catch { /* ignore */ } }, castTime * 1000);
      // visuals
      const element = ab.element ?? elementOfActor(p) ?? OATH_BY_ID[state.character?.oath]?.element ?? 'arcane';
      const ult = slot === 5;
      const chain = [];
      if (ab.id === 'collective/chain') { try { ctx.actors?.forEach?.((a) => { if (a !== p && a !== tgt && isEnemy(a) && tgt && a.position.distanceTo(tgt.position) < 7.5 && chain.length < 5) chain.push(a); }); } catch { /* ignore */ } }
      const tpos = tgt ? tgt.position.clone() : aim.clone();
      const handle = ctx.vfx?.castEffect?.(ab, { caster: p, target: tpos, dir: { x: dir.x, z: dir.z }, castTime, element, local: true, shake: true, ultimate: ult, combo: state.combo, chain }) ?? null;
      if (ult) ctx.vfx?.play?.(`ultimate:${state.character?.cls ?? p.cls ?? 'sorcerer'}:${element}`, { caster: p, dir: { x: dir.x, z: dir.z }, target: tpos, local: true, shake: true, ant: castTime + 0.05 });
      // network
      try { ctx.net?.send?.({ t: 'cast', slot, target: tgt?.id ?? null, aim: { x: +aim.x.toFixed(2), y: +aim.y.toFixed(2), z: +aim.z.toFixed(2) }, dir: { x: +dir.x.toFixed(3), z: +dir.z.toFixed(3) } }); } catch (err) { console.warn('[combat] send', err); }
      localCasts.set(slot, { t: now, handle, ability: ab.id });
      recentFxBySrc.set(selfId(), now);
      // cooldowns / cast bar
      const cd = Math.max(0, ab.cooldown ?? 0);
      state.cooldowns[slot] = now + cd * 1000;
      if (slot > 0) state.gcdUntil = now + 400;
      bus.emit('combat:cooldown', { slot, until: state.cooldowns[slot], duration: cd, total: cd });
      if (castTime > 0.05) state.castBar = { slot, name: ab.name, ability: ab.id, start: now, end: now + castTime * 1000, duration: castTime };
      bus.emit('combat:cast', { slot, castTime, name: ab.name, ability: ab.id, element });
      return true;
    } catch (err) { console.warn('[combat] cast failed', err); return false; }
  }

  function readyAt(slot) {
    return Math.max(state.cooldowns[slot] ?? 0, slot > 0 ? state.gcdUntil : 0, state.castBar?.end ?? 0);
  }
  // A single deliberate press just before recovery completes should not disappear.
  function requestCast(slot) {
    const now = nowMs(), remaining = readyAt(slot) - now;
    if (remaining > 0 && remaining <= actionBuffer.windowMs && player()?.alive !== false) {
      actionBuffer.push(slot, now); return false;
    }
    actionBuffer.clear();
    return cast(slot);
  }

  // ------------------------------------------------------------------------------------------ server events
  function onYou(you) {
    if (!you) return;
    state.you = you;
    const character = state.character ?? ctx.character;
    if (Array.isArray(you.hotbar) && you.hotbar.length === 6 && you.hotbar.every((ab) => ab?.id)) {
      setHotbar(character, you.loadout, you.hotbar);
    } else if (Array.isArray(you.loadout) && character) {
      setHotbar(character, you.loadout);
    }
    if (Array.isArray(you.cooldowns) && ctx.net?.serverTime) {
      let st = 0; try { st = ctx.net.serverTime(); } catch { st = 0; }
      const now = nowMs();
      you.cooldowns.forEach((c, slot) => {
        const prediction = localCasts.get(slot);
        const pending = prediction && !prediction.confirmed && now - prediction.t < 1500;
        const until = reconcileCooldown(c, st, now, state.cooldowns[slot] ?? 0, pending);
        if (Math.abs(until - (state.cooldowns[slot] ?? 0)) > 80) {
          state.cooldowns[slot] = until;
          bus.emit('combat:cooldown', { slot, until, duration: Math.max(0, until - now) / 1000, total: state.hotbar[slot]?.cooldown ?? 0 });
        }
      });
    }
    if (you.casting === null && state.castBar && nowMs() > state.castBar.end) state.castBar = null;
    if (Array.isArray(you.fx)) statuses.sync(selfId(), you.fx);
  }

  function playRemoteCast(e) {
    const caster = actorOf(e.src);
    const key = `${e.src}|${e.slot}`; const now = nowMs();
    if (isSelf(e.src) && e.slot >= 0) { const lc = localCasts.get(e.slot); if (lc && now - lc.t < 2500) { lc.confirmed = true; return; } }
    if (e.release && remoteFx.has(key) && now - remoteFx.get(key) < ((e.castTime ?? 0) + 3) * 1000) { remoteFx.delete(key); return; }
    const aimV = e.aim ? new Vector3(e.aim.x, e.aim.y ?? 0, e.aim.z) : null;
    const tActor = actorOf(e.target);
    const tpos = tActor?.position?.clone() ?? aimV;
    const pos = caster?.position?.clone() ?? (e.ability?.startsWith('world/') ? aimV : null);
    const element = e.element ?? elementOfActor(caster) ?? 'arcane';
    const ab = ABILITY_BY_ID[e.ability];
    const common = { caster, pos: pos ?? undefined, target: tpos ?? undefined, dir: e.dir, castTime: e.castTime ?? 0, element };
    let h = null;
    if (ab) h = ctx.vfx?.castEffect?.({ ...ab, castTime: e.castTime ?? 0, slot: e.slot >= 1 ? e.slot - 1 : -1 }, { ...common, ultimate: e.slot === 5 });
    else if (String(e.ability).startsWith('basic/')) h = ctx.vfx?.castEffect?.({ id: e.ability, kind: 'basic' }, common);
    else if (e.telegraph || e.shape === 'zone') h = ctx.vfx?.play?.(`zone:${element}`, { ...common, pos: aimV ?? pos, target: aimV ?? tpos, radius: e.radius ?? 3, shake: tActor === player() });
    else if (/roar|phase/.test(e.ability)) h = ctx.vfx?.play?.(`burst:${element}`, { ...common, pos: pos ?? aimV, radius: e.radius ?? 6 });
    else if (String(e.ability).startsWith('item/')) h = ctx.vfx?.play?.('heal', { ...common, pos: pos ?? aimV, follow: caster ? () => caster.position : undefined });
    else if (tpos && pos) { // mob / pet strike: melee arc if close, bolt otherwise
      const far = pos.distanceTo(tpos) > 4.5;
      h = ctx.vfx?.play?.(`basic:${far ? 'sorcerer' : 'ninja'}:${element}`, common);
    }
    if (h) { recentFxBySrc.set(e.src, now); if ((e.castTime ?? 0) > 0.05) remoteFx.set(key, now); }
    if (caster && caster._fxCast) { /* keep last handle for interrupts */ }
    if (caster) caster._fxCast = h;
  }

  function onHit(e) {
    const dst = actorOf(e.dst); const now = nowMs();
    const hx = Number.isFinite(e.x) ? e.x : dst?.position?.x; const hz = Number.isFinite(e.z) ? e.z : dst?.position?.z;
    if (!Number.isFinite(hx)) return;
    const hy = Number.isFinite(e.y) ? e.y : (dst?.position?.y ?? 0) + (dst?.headY ?? 1.6);
    const selfDst = isSelf(e.dst); const selfSrc = isSelf(e.src);
    const element = e.element ?? null;
    // Server hit events are authoritative. Local dodge prediction must never hide damage.
    const p = player();
    const amount = Math.round(e.amount ?? 0);
    if (amount <= 0 && !e.absorbed) bus.emit('combat:floater', { x: hx, y: hy, z: hz, text: 'Miss', kind: 'miss', element, taken: selfDst });
    else if (amount > 0) bus.emit('combat:floater', { x: hx, y: hy, z: hz, text: String(amount), kind: e.crit ? 'crit' : 'damage', element, taken: selfDst, dot: !!e.dot });
    if (e.absorbed) bus.emit('combat:floater', { x: hx, y: hy + 0.35, z: hz, text: `${Math.round(e.absorbed)} absorbed`, kind: 'status', element, taken: selfDst });
    if (e.rx) bus.emit('combat:floater', { x: hx, y: hy + 0.6, z: hz, text: e.rx, kind: 'status', element });
    if (dst) flashes.flash(dst, new Color(ELEMENT_FLASH[element] ?? '#ffffff'), e.crit ? 0.85 : e.dot ? 0.35 : 0.6, e.crit ? 0.24 : 0.16);
    // Anchor a restrained impact to the confirmed victim. Predicted travel effects
    // cannot suppress all subsequent hits from this caster for three seconds.
    const castShown = e.src != null && now - (recentFxBySrc.get(e.src) ?? -1e9) < 3000 && !e.dot;
    const last = lastImpactAt.get(e.dst) ?? -1e9;
    if (element && (amount > 0 || e.absorbed) && now - last > (e.dot ? 900 : 140)) {
      lastImpactAt.set(e.dst, now);
      ctx.vfx?.impact?.(element, { x: hx, y: groundY(hx, hz, hy - 1.6), z: hz }, e.rx ? 1.15 : e.dot ? 0.35 : e.crit ? 1 : castShown ? 0.35 : 0.65, { shake: false });
    }
    if (selfDst && amount > 0) bus.emit('camera:shake', { strength: Math.min(0.6, 0.12 + amount / Math.max(1, p?.mhp ?? state.you?.mhp ?? 150) * 1.6), duration: 0.25 });
    else if (selfSrc && amount > 0 && !e.dot) bus.emit('camera:shake', { strength: e.crit ? 0.18 : 0.08, duration: 0.15 });
  }

  function onEvent(e) {
    if (!e?.type) return;
    switch (e.type) {
      case 'cast': playRemoteCast(e); break;
      case 'hit': onHit(e); break;
      case 'heal': {
        const dst = actorOf(e.dst); if (!dst) break;
        bus.emit('combat:floater', { x: dst.position.x, y: dst.position.y + (dst.headY ?? 1.7), z: dst.position.z, text: `+${Math.round(e.amount ?? 0)}`, kind: 'heal', taken: isSelf(e.dst) });
        const now = nowMs(); if (now - (dst._fxHealAt ?? -1e9) > 700 && (e.amount ?? 0) > 2) { dst._fxHealAt = now; ctx.vfx?.play?.('heal', { caster: dst, follow: () => dst.position }); }
        break;
      }
      case 'status': {
        statuses.ensure(e.dst, e.status, e.dur);
        break;
      }
      case 'death': {
        if (isSelf(e.id)) { cancelRelease(); actionBuffer.clear(); state.castBar = null; for (const lc of localCasts.values()) lc.handle?.stop?.(); localCasts.clear(); }
        const a = actorOf(e.id);
        statuses.clear(e.id);
        if (a) ctx.vfx?.play?.(`death:${elementOfActor(a) ?? 'shadow'}`, { pos: a.position.clone() });
        if (e.id === state.target) setTimeout(() => { if (state.target === e.id) setTarget(null); }, 1200);
        break;
      }
      case 'level': { const a = actorOf(e.id); if (a) ctx.vfx?.play?.('levelup', { pos: a.position.clone(), caster: a, local: isSelf(e.id) }); break; }
      case 'interrupt': {
        const a = actorOf(e.id);
        if (isSelf(e.id)) { cancelRelease(); actionBuffer.clear(); const lc = localCasts.get(e.slot); lc?.handle?.stop?.(); state.castBar = null; bus.emit('combat:cast', { slot: e.slot, castTime: 0, interrupted: true }); }
        else a?._fxCast?.stop?.();
        if (a) bus.emit('combat:floater', { x: a.position.x, y: a.position.y + (a.headY ?? 1.7) + 0.3, z: a.position.z, text: 'Interrupted', kind: 'status' });
        break;
      }
      case 'fail': {
        if (!isSelf(e.id)) break;
        cancelRelease();
        const lc = localCasts.get(e.slot);
        if (lc && nowMs() - lc.t < 2000) { lc.handle?.stop?.(); localCasts.delete(e.slot); }
        if (e.reason !== 'cooldown') { state.cooldowns[e.slot] = 0; bus.emit('combat:cooldown', { slot: e.slot, until: 0, duration: 0 }); }
        if (state.castBar?.slot === e.slot) state.castBar = null;
        const msg = { mana: 'Not enough mana.', range: 'Target is out of range.', cooldown: 'Not ready yet.', stunned: 'You are stunned.', dead: null, gcd: null, casting: null }[e.reason];
        if (msg) toast(msg);
        break;
      }
      default: break;
    }
  }

  function onSnap(s) {
    const ents = s?.ents; if (!Array.isArray(ents)) return;
    for (const en of ents) if (Array.isArray(en.fx)) statuses.sync(en.id, en.fx);
  }

  // ------------------------------------------------------------------------------------------ wiring
  try {
    bus.on('game:character', (c) => setHotbar(c));
    bus.on('game:start', (c) => { if (c && !state.hotbar.length) setHotbar(c); });
    bus.on('net:you', (p) => { try { onYou(p?.you ?? p); } catch (err) { console.warn('[combat] you', err); } });
    bus.on('net:ev', (p) => { try { onEvent(p?.e ?? p); } catch (err) { console.warn('[combat] ev', err); } });
    bus.on('net:snap', (p) => { try { onSnap(p); } catch (err) { console.warn('[combat] snap', err); } });
    bus.on('actor:despawn', (p) => { const id = p?.id ?? p; statuses.clear(id); if (id === state.target) setTarget(null); });
  } catch (err) { console.warn('[combat] wiring failed', err); }

  let arenas = null;
  try { arenas = createArenas(ctx); } catch (err) { console.warn('[combat] arenas', err); }

  ctx.addUpdate?.((dt) => {
    try { arenas?.update(dt); } catch (err) { console.warn('[combat] arenas', err); arenas = null; }
    try {
      const inp = ctx.input;
      if (inp) {
        if (inp.consume('target')) cycleTarget();
        if (inp.consume('click')) clickPick();
        for (let s = 0; s < 6; s++) if (inp.consume(`slot${s}`)) requestCast(s);
        const queued = actionBuffer.take(nowMs(), (slot) => readyAt(slot) <= nowMs());
        if (queued !== null) cast(queued);
      }
      if (state.target != null && !actorOf(state.target)) setTarget(null);
      if (state.castBar && nowMs() > state.castBar.end + 100) state.castBar = null;
      const now = nowMs();
      if (now >= pruneAt) {
        pruneAt = now + 5000;
        for (const map of [remoteFx, recentFxBySrc, lastImpactAt]) for (const [id, time] of map) if (now - time > 15000) map.delete(id);
        for (const [slot, entry] of localCasts) if (now - entry.t > 15000) localCasts.delete(slot);
      }
      flashes.update(dt);
      statuses.update();
    } catch (err) { console.warn('[combat] update', err); }
  }, 30);

  return {
    hotbar: state.hotbar,
    get target() { return state.target; },
    set target(id) { setTarget(id); },
    setTarget,
    cast: requestCast,
    cooldowns: state.cooldowns,
    get castBar() { return state.castBar; },
    /** Remaining cooldown seconds for a slot (client view). */
    remaining(slot) { return Math.max(0, ((state.cooldowns[slot] ?? 0) - nowMs()) / 1000); },
    cycleTarget,
    nearestEnemy,
    /** True for creatures and players the local player may attack (PvP rules mirrored from net.canAttack). */
    isEnemy: (id) => isEnemy(actorOf(id)),
    flash: (actor, color, s, d) => flashes.flash(actor, color ?? new Color(0xffffff), s, d),
  };
}
