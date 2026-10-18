// actors/ — characters, local controller, camera, remote entities, creatures, NPCs,
// nameplates, selection ring. API per game/CONTRACTS.md.
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { OATH_BY_ID, OATHS, CLASSES } from '@shared/oaths.js';
import { CREATURES, ARCHETYPES } from '@shared/creatures.js';
import { heightAt } from '@shared/terrain.js';
import { Actor, INTERP_DELAY } from './actor.js';
import { BodyFactory } from './bodies.js';
import { AssetLibrary } from './assets.js';
import { OrbitCamera } from './camera.js';
import { PlayerController, TUNING } from './controller.js';
import { Nameplates } from './nameplates.js';
import { outfitKey } from './outfits.js';

const CAPS = { low: { visible: 24, shadows: 0 }, medium: { visible: 40, shadows: 8 }, high: { visible: 70, shadows: 16 }, ultra: { visible: 110, shadows: 24 } };

export async function init(ctx) {
  try {
    return createActors(ctx);
  } catch (err) {
    console.error('[actors] init failed — falling back to an inert camera', err);
    return { camera: ctx.scene.activeCamera, player: null, entities: new Map(), get: () => null, pick: () => null, nearestHostile: () => null, forEach() {} };
  }
}

function createActors(ctx) {
  const scene = ctx.scene;
  scene.metadata = { ...(scene.metadata ?? {}), quality: ctx.quality?.name };
  const caps = CAPS[ctx.quality?.name] ?? CAPS.high;
  const assets = new AssetLibrary(ctx);
  const factory = new BodyFactory(ctx);
  const orbit = new OrbitCamera(ctx);
  const plates = new Nameplates(ctx);
  const entities = new Map();
  let selfId = ctx.net?.selfId ?? null;
  let player = null;
  let controller = null;
  const shadowSet = new Set();
  let sortT = 0;
  let snapOffset = null;
  const pending = [];

  // camera
  scene.activeCamera = orbit.cam;
  try { ctx.render?.attachCamera?.(orbit.cam); } catch (e) { console.warn('[actors] attachCamera failed', e); }
  const p0 = ctx.params;
  const previewOath = OATH_BY_ID[p0?.get?.('oath')] ?? OATHS[3];
  orbit.pivot.set(previewOath.center[0], heightAt(previewOath.center[0], previewOath.center[1]) + 4, previewOath.center[1]);

  // warm the template for a URL-chosen character to avoid a hitch on spawn
  if (p0?.get?.('oath')) { try { factory.humanoidTemplate(outfitKey(p0.get('oath'), p0.get('cls') ?? 'ninja')); } catch (e) { console.warn(e); } }

  const api = {
    camera: orbit.cam,
    player: null,
    entities,
    get: (id) => (id === selfId || id === 'self' ? player : entities.get(id)) ?? null,
    forEach(fn) { if (player) fn(player); for (const a of entities.values()) fn(a); },
    pick, nearestHostile,
    spawnLocal: (st) => spawn({ ...st, k: st.k ?? 'n' }, true),
    despawnLocal: (id) => despawn(id, true),
    populateNpcSpots,
    setFrozen(b) { if (controller) controller.frozen = !!b; },
    tuning: TUNING,
    orbit,
    factory,
    assets,
    lineup,
  };

  // --------------------------------------------------------------- bodies
  function makeBody(actor) {
    const desc = { kind: actor.kind, oath: actor.oath, cls: actor.cls, model: actor.model, runSpeed: CLASSES[actor.cls]?.moveSpeed, noWeapon: actor.kind === 'npc' && actor.title === 'chronicler' };
    actor.body = factory.createProcedural(desc, actor.root);
    actor.radius = actor.body.radius;
    actor.body.setFade(0);
    if (!actor.alive) actor.body.animator.setState('dead');
    tryUpgrade(actor, desc);
  }
  async function tryUpgrade(actor, desc) {
    let url = null;
    if (actor.kind === 'mob') { const arch = actor.creature?.archetype ?? (ARCHETYPES[actor.model] ? actor.model : null); if (arch) url = await assets.creatureUrl(arch, actor.oath ?? actor.creature?.oath); }
    else url = assets.characterUrl(outfitKey(actor.oath, actor.cls));
    if (!url) return;
    const container = await assets.load(url);
    if (!container || actor.disposed || actor.bodyUrl === url) return;
    try {
      const nb = factory.createGltf(container, desc, actor.root);
      const old = actor.body;
      // Promote assets without resetting an in-flight jump, cast, visibility or fade.
      const previous = old?.animator;
      nb.animator.setState(previous?.state ?? 'loco');
      nb.animator.stateT = previous?.stateT ?? 0;
      nb.animator.speed = previous?.speed ?? 0;
      nb.animator.yawVel = previous?.yawVel ?? 0;
      nb.animator.backwards = previous?.backwards ?? false;
      nb.animator.channel = previous?.channel ?? false;
      nb.setVisible(actor.visible);
      nb.setFade(actor === player ? 1 : actor.fade);
      shadowSet.delete(actor); removeShadows(old);
      old?.dispose();
      actor.body = nb; actor.bodyUrl = url; actor.radius = nb.radius;
      if (actor === player) { if (controller) controller.actor = player; addShadows(nb); }
    } catch (e) { console.warn('[actors] GLB swap failed', url, e); }
  }
  assets.onChange(() => { api.forEach((a) => { if (!a.bodyUrl) tryUpgrade(a, { kind: a.kind, oath: a.oath, cls: a.cls, model: a.model, runSpeed: CLASSES[a.cls]?.moveSpeed, noWeapon: a.kind === 'npc' && a.title === 'chronicler' }); }); });
  assets.start();

  function addShadows(body) { if (!body || !ctx.render?.addShadowCaster) return; for (const m of body.meshes) ctx.render.addShadowCaster(m, false); }
  function removeShadows(body) { if (!body || !ctx.render?.removeShadowCaster) return; for (const m of body.meshes) ctx.render.removeShadowCaster(m); }

  // --------------------------------------------------------------- spawn / despawn
  function spawn(st, local = false) {
    if (entities.has(st.id)) return entities.get(st.id);
    const a = new Actor(scene, st);
    a.local = local;
    if (st.x != null) { a.root.position.set(st.x, st.y ?? heightAt(st.x, st.z), st.z); a.prevX = st.x; a.prevZ = st.z; }
    makeBody(a);
    a.plate = plates.create(a);
    entities.set(a.id, a);
    ctx.bus.emit('actor:spawn', { id: a.id, kind: a.kind, name: a.name, actor: a });
    return a;
  }
  function despawn(id, immediate = false) {
    const a = entities.get(id);
    if (!a) return;
    if (immediate) return finalize(a);
    a.fadeDir = -1; a.goneAt = performance.now() / 1000;
  }
  function finalize(a) {
    entities.delete(a.id);
    a.disposed = true;
    if (shadowSet.has(a)) { removeShadows(a.body); shadowSet.delete(a); }
    plates.remove(a.plate);
    a.dispose();
    ctx.bus.emit('actor:despawn', { id: a.id });
  }

  // --------------------------------------------------------------- local player
  function ensurePlayer(character, pos) {
    if (player) { if (pos) controller.teleport(pos.x, pos.y, pos.z, pos.ry); return player; }
    const ch = character ?? ctx.character ?? { name: 'Wayfarer', oath: previewOath.id, cls: 'ninja' };
    const st = { id: selfId ?? 'self', k: 'p', name: ch.name, oath: ch.oath, cls: ch.cls, lvl: 1, hp: CLASSES[ch.cls]?.hp ?? 120, mhp: CLASSES[ch.cls]?.hp ?? 120 };
    player = new Actor(scene, st, { isSelf: true });
    makeBody(player);
    player.body.setFade(1);
    controller = new PlayerController(ctx, player, () => orbit.yaw);
    player.controller = controller;
    api.player = player;
    const sp = pos ?? spawnPoint(ch);
    controller.teleport(sp.x, sp.y, sp.z, sp.ry ?? 0);
    ctx.world?.focus?.(sp.x, sp.z);
    orbit.follow(player, true);
    addShadows(player.body);
    ctx.bus.emit('actor:spawn', { id: player.id, kind: 'player', name: player.name, actor: player, self: true });
    return player;
  }
  function spawnPoint(ch) {
    const sp = ctx.params?.get?.('spawn');
    if (sp) { const [x, z] = sp.split(',').map(Number); if (Number.isFinite(x) && Number.isFinite(z)) return { x, y: heightAt(x, z), z }; }
    const sanct = ctx.architecture?.sanctuaries?.find?.((s) => s.oathId === ch.oath);
    if (sanct?.spawn) return { x: sanct.spawn.x, y: sanct.spawn.y, z: sanct.spawn.z, ry: sanct.spawn.ry };
    const o = OATH_BY_ID[ch.oath] ?? OATHS[0];
    const x = o.center[0] + 12, z = o.center[1] - 18;
    return { x, y: heightAt(x, z), z };
  }

  // --------------------------------------------------------------- net
  ctx.bus.on('game:character', (ch) => ensurePlayer(ch));
  ctx.bus.on('net:welcome', (w) => {
    if (w?.id) { selfId = w.id; if (player) player.id = w.id; }
    const you = w?.you;
    const pos = you && Number.isFinite(you.x) ? { x: you.x, y: you.y, z: you.z, ry: you.ry } : null;
    if (player && pos) controller.teleport(pos.x, pos.y, pos.z, pos.ry);
    else if (!player && ctx.character) ensurePlayer(ctx.character, pos);
    if (you && player) applyYou(you);
  });
  ctx.bus.on('net:you', (m) => { const you = m?.you ?? m; if (you && player) applyYou(you); });
  function applyYou(you) {
    if (you.hp != null) player.hp = you.hp;
    if (you.mhp != null) player.mhp = you.mhp;
    if (you.level != null || you.lvl != null) player.level = you.level ?? you.lvl;
    if (you.hp != null) setAlive(player, you.hp > 0);
  }
  function setAlive(a, alive) {
    if (a.alive === alive) return;
    a.alive = alive;
    a.deadT = 0;
    a.body?.animator.setState(alive ? 'loco' : 'dead');
  }
  ctx.bus.on('net:snap', (snap) => {
    if (!snap?.ents) return;
    const now = performance.now() / 1000;
    let t = now;
    if (Number.isFinite(snap.time)) {
      const st = snap.time / 1000, est = now - st;
      snapOffset = snapOffset == null || est < snapOffset ? est : snapOffset + (est - snapOffset) * 0.02;
      t = st + snapOffset;
    }
    for (const e of snap.ents) {
      if (e.id === selfId || (player && e.id === player.id)) {
        if (e.hp != null) player.hp = e.hp; if (e.mhp != null) player.mhp = e.mhp; if (e.lvl != null) player.level = e.lvl;
        if (e.anim === 'dead' || (e.hp != null && e.hp <= 0)) setAlive(player, false); else if (e.hp > 0) setAlive(player, true);
        continue;
      }
      let a = entities.get(e.id);
      if (!a) a = spawn(e);
      a.lastSeen = now;
      a.pushSample(t, e);
      if (e.name != null) a.name = e.name;
      if (e.lvl != null) a.level = e.lvl;
      if (e.hp != null) a.hp = e.hp;
      if (e.mhp != null) a.mhp = e.mhp;
      if (e.anim) applyAnimString(a, e.anim);
      if (e.hp != null && e.hp <= 0) setAlive(a, false);
    }
    for (const id of snap.gone ?? []) despawn(id);
  });
  function applyAnimString(a, anim) {
    if (anim === a.lastAnim) {
      if ((anim === 'attack') && a.animHold > 0.7) { a.animHold = 0; triggerAttack(a); }
      return;
    }
    const prev = a.lastAnim;
    a.lastAnim = anim; a.animHold = 0;
    const an = a.body?.animator;
    if (!an) return;
    if (prev === 'dead' && anim !== 'dead') setAlive(a, true);
    switch (anim) {
      case 'dead': setAlive(a, false); break;
      case 'jump': case 'fall': case 'dodge': case 'swim': case 'emote': an.setState(anim); break;
      case 'attack': triggerAttack(a); break;
      case 'cast': if (a.kind === 'mob') a.playAnim('attack'); else if (a.cls === 'sorcerer') { a.playAnim('cast_channel'); a.castAnim = 'release'; } else triggerAttack(a); break;
      case 'hit': a.playAnim('hit'); break;
      default:
        if (an.state !== 'loco' && an.state !== 'dead') an.setState('loco');
        if (prev === 'cast' && a.castAnim) { a.playAnim('cast_release'); a.castAnim = null; an.channel = false; }
    }
  }
  function triggerAttack(a) {
    if (a.kind === 'mob') return a.playAnim('attack');
    if (a.cls === 'sorcerer') return a.playAnim(a.atkN++ % 3 === 2 ? 'cast_aoe' : 'cast_release');
    a.playAnim(`attack_${(a.atkN++ % 3) + 1}`);
  }
  ctx.bus.on('net:ev', (ev) => {
    const e = ev?.e ?? ev;
    if (!e?.type) return;
    const now = performance.now() / 1000;
    switch (e.type) {
      case 'teleport': {
        if (e.id === selfId || (player && e.id === player.id)) { if (controller) { controller.teleport(e.x, e.y, e.z, e.ry); orbit.pivotInit = false; ctx.world?.focus?.(e.x, e.z); } }
        else { const a = entities.get(e.id); if (a) { a.buf.length = 0; a.root.position.set(e.x, e.y, e.z); a.prevX = e.x; a.prevZ = e.z; if (e.ry != null) a.root.rotation.y = a.targetRy = e.ry; } }
        break;
      }
      case 'cast': {
        const a = api.get(e.src);
        if (!a) break;
        if (a === player && now - (player.lastActionAt ?? 0) < 0.35) break; // combat already animated it
        if (a === player && e.aim) controller?.faceToward(e.aim.x, e.aim.z, 0.6);
        if (e.castTime > 0.25 && a.kind !== 'mob') { a.playAnim('cast_channel'); a.castUntil = now + e.castTime; }
        else triggerAttack(a);
        break;
      }
      case 'hit': { const a = api.get(e.dst); if (a && a.alive) a.playAnim('hit'); break; }
      case 'death': { const a = api.get(e.id); if (a) setAlive(a, false); break; }
      case 'level': { const a = api.get(e.id); if (a) a.level = e.level; break; }
      default: break;
    }
  });
  ctx.bus.on('combat:target', (t) => plates.setTarget(t?.id ?? null));
  ctx.bus.on('game:start', (ch) => { ensurePlayer(ch); orbit.startIntro(); });

  // --------------------------------------------------------------- picking
  const ray = { o: new Vector3(), d: new Vector3() };
  function pick(x, y) {
    const cam = orbit.cam;
    let r;
    try { r = scene.createPickingRay(x, y, Matrix.Identity(), cam); } catch { return null; }
    ray.o.copyFrom(r.origin); ray.d.copyFrom(r.direction);
    let best = null, bt = Infinity;
    for (const a of entities.values()) {
      if (!a.visible || a.fadeDir < 0) continue;
      const t = rayCylinder(ray.o, ray.d, a.root.position, (a.radius ?? 0.4) * (a.root.scaling.x || 1) * 1.35 + 0.1, a.headY);
      if (t != null && t < bt) { bt = t; best = a; }
    }
    return best;
  }
  function nearestHostile(maxDist = 30) {
    if (!player) return null;
    const p = player.root.position;
    const fx = Math.sin(orbit.yaw), fz = Math.cos(orbit.yaw);
    let best = null, bs = Infinity;
    for (const a of entities.values()) {
      if (a.kind !== 'mob' || !a.alive || !a.visible || a.fadeDir < 0) continue;
      const dx = a.root.position.x - p.x, dz = a.root.position.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > maxDist) continue;
      const cos = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      const s = d * (1 + 0.9 * (1 - cos));
      if (s < bs) { bs = s; best = a; }
    }
    return best;
  }

  // --------------------------------------------------------------- NPC helpers
  function populateNpcSpots() {
    const sanct = ctx.architecture?.sanctuaries ?? [];
    const roles = ['oathkeeper', 'quartermaster', 'trainer', 'warden', 'chronicler', 'artisan'];
    let n = 0;
    for (const s of sanct) for (const [i, spot] of (s.npcSpots ?? []).entries()) {
      const role = spot.role ?? roles[i % roles.length];
      spawn({ id: `npc:${s.oathId}:${i}`, k: 'n', name: npcName(s.oathId, role, i), oath: s.oathId, cls: i % 2 ? 'ninja' : 'sorcerer', lvl: 30, x: spot.x, y: spot.y, z: spot.z, ry: spot.ry ?? 0, role }, true);
      n++;
    }
    return n;
  }
  if (ctx.params?.get?.('npcs') === 'local') setTimeout(populateNpcSpots, 500);

  // --------------------------------------------------------------- debug lineup (dev harness / QA)
  function lineup(opts = {}) {
    const keys = [];
    for (const o of OATHS) for (const cls of ['ninja', 'sorcerer']) {
      if (opts.oaths && !opts.oaths.includes(o.id)) continue;
      if (opts.cls && opts.cls !== cls) continue;
      keys.push({ oath: o.id, cls });
    }
    const perRow = opts.perRow ?? 10, spacing = opts.spacing ?? 1.5;
    const base = opts.origin ?? { x: 0, z: 0 };
    const out = [];
    const kinds = opts.which ?? 'all';
    let i = 0;
    if (kinds !== 'creatures') for (const k of keys) {
      const row = Math.floor(i / perRow), col = i % perRow;
      const x = base.x + (col - (Math.min(perRow, keys.length) - 1) / 2) * spacing, z = base.z + row * 3.2;
      out.push(spawn({ id: `lineup:${k.oath}:${k.cls}`, k: 'p', name: `${OATH_BY_ID[k.oath].name}`, oath: k.oath, cls: k.cls, lvl: OATH_BY_ID[k.oath].index, x, y: opts.flat ? 0 : heightAt(x, z), z, ry: Math.PI }, true));
      i++;
    }
    if (kinds !== 'humans') {
      const arch = Object.keys(ARCHETYPES);
      arch.forEach((ar, j) => {
        const c = CREATURES.find((cc) => cc.archetype === ar && cc.role !== 'boss');
        const x = base.x + (j % 6 - 2.5) * 4.2, z = base.z + 11 + Math.floor(j / 6) * 5.5;
        out.push(spawn({ id: `lineup:${c.id}`, k: 'm', name: c.name, model: c.id, oath: c.oath, lvl: 5, x, y: opts.flat ? 0 : heightAt(x, z), z, ry: Math.PI }, true));
      });
    }
    return out;
  }

  // --------------------------------------------------------------- frame update
  function update(dt) {
    const now = performance.now() / 1000;
    const rt = now - INTERP_DELAY;
    if (controller) controller.update(dt);
    orbit.update(dt);
    const cam = orbit.cam.position;
    // visibility cap + shadow casters (every 0.5 s)
    sortT -= dt;
    if (sortT <= 0) {
      sortT = 0.5;
      const list = [...entities.values()];
      for (const a of list) a.dist = Vector3.Distance(a.root.position, cam);
      list.sort((a, b) => a.dist - b.dist);
      list.forEach((a, i) => {
        const vis = i < caps.visible && a.dist < factory.lodDist[1] * 1.05;
        a.visible = vis;
        a.body?.setVisible(vis);
        const wantShadow = vis && i < caps.shadows && a.dist < 60;
        if (wantShadow && !shadowSet.has(a)) { addShadows(a.body); shadowSet.add(a); }
        else if (!wantShadow && shadowSet.has(a)) { removeShadows(a.body); shadowSet.delete(a); }
        // stale entities (left interest without a gone list)
        if (!a.local && now - a.lastSeen > 6 && a.fadeDir > 0) despawn(a.id);
      });
    }
    for (const a of entities.values()) {
      if (!a.local) a.interpolate(rt, dt);
      a.animHold += dt;
      if (!a.alive) a.deadT += dt;
      if (a.castUntil && now > a.castUntil) { a.castUntil = 0; a.body?.animator && (a.body.animator.channel = false); a.playAnim('cast_release'); }
      // fade in / out
      if (a.fadeDir > 0 && a.fade < 1) { a.fade = Math.min(1, a.fade + dt * 2.5); a.body?.setFade(a.fade); }
      else if (a.fadeDir < 0) {
        a.fade -= dt * 2; a.body?.setFade(Math.max(0, a.fade));
        if (a.fade <= 0) { pending.push(a); continue; }
      }
      if (!a.visible || !a.body) continue;
      // animation LOD
      const d = a.dist;
      a.body.animator.interval = d < 22 ? 0 : d < 45 ? 1 / 30 : d < 80 ? 1 / 15 : 1 / 8;
      a.body.animator.update(dt);
    }
    for (const a of pending) finalize(a);
    pending.length = 0;
    if (player?.body) { player.body.animator.interval = 0; player.body.animator.update(dt); if (!player.alive) player.deadT += dt; }
    plates.update(dt, orbit.cam, player);
  }
  ctx.addUpdate(update, 20);

  // if the character is already known (late init), spawn immediately
  if (ctx.character) ensurePlayer(ctx.character);
  return api;
}

// ray (origin o, unit dir d) vs vertical cylinder at base p, radius r, height h → distance or null
function rayCylinder(o, d, p, r, h) {
  const ox = o.x - p.x, oz = o.z - p.z;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return null;
  const b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t < 0) continue;
    const y = o.y + d.y * t - p.y;
    if (y >= -0.1 && y <= h + 0.15) return t;
  }
  return null;
}

const NPC_FIRST = ['Aurel', 'Seren', 'Tamsin', 'Ilyas', 'Maren', 'Oskar', 'Veda', 'Corin', 'Hale', 'Nadia', 'Rook', 'Sabine'];
function npcName(oath, role, i) {
  const o = OATH_BY_ID[oath];
  const n = NPC_FIRST[(o?.index ?? 0) * 3 + i] ?? NPC_FIRST[i % NPC_FIRST.length];
  return `${NPC_FIRST[((o?.index ?? 1) * 7 + i * 5) % NPC_FIRST.length] ?? n}`;
}
