// UI harness: a tiny Babylon scene + fake actors/net/combat feeding every bus event the UI consumes.
// Open /src/ui/dev.html  (params: ?oath=oath-04&cls=sorcerer&name=Iru to skip creation,
// ?panel=map|character|settings|npc|death|levelup|loot, ?feed=0 to disable the scripted feed).
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Bus } from '../core/bus.js';
import { createInput } from '../core/input.js';
import { detectQuality } from '../core/quality.js';
import { OATH_BY_ID, CLASSES, xpForLevel, regionAt } from '@shared/oaths.js';
import { CREATURES } from '@shared/creatures.js';
import { hotbarFor } from '@shared/abilities.js';
import * as UI from './index.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const bus = new Bus();
const engine = new Engine(canvas, true, { antialias: true, adaptToDeviceRatio: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.42, 0.5, 0.58, 1);
scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.004; scene.fogColor = new Color3(0.5, 0.56, 0.62);
const camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.18, 16, Vector3.Zero(), scene);
new HemisphericLight('h', new Vector3(0.2, 1, 0.1), scene).intensity = 0.8;
const sun = new DirectionalLight('s', new Vector3(-0.4, -1, 0.3), scene); sun.intensity = 0.9;
const ground = CreateGround('g', { width: 1600, height: 1600, subdivisions: 2 }, scene);
const gm = new StandardMaterial('gm', scene); gm.diffuseColor = new Color3(0.38, 0.42, 0.3); gm.specularColor = Color3.Black(); ground.material = gm;

const updaters = [];
const ctx = {
  engine, scene, canvas, bus, quality: detectQuality(), input: createInput(canvas, bus),
  clock: { time: 0, dt: 0, frame: 0 }, params,
  addUpdate(fn, order = 50) { updaters.push({ fn, order }); updaters.sort((a, b) => a.order - b.order); return () => {}; },
  setLoading(p, label) { bus.emit('loading', { p, label }); },
};
window.__aetherion = ctx;

// ---------- fake world
const startOath = params.get('oath') || 'oath-09';
const C = OATH_BY_ID[startOath].center;
const ox = C[0], oz = C[1];
ground.position.set(ox, 0, oz);
function makeActor(id, kind, name, opts = {}) {
  const root = new TransformNode(id, scene);
  const mesh = CreateCapsule(`${id}m`, { height: opts.h || 1.8, radius: opts.r || 0.4 }, scene);
  mesh.parent = root; mesh.position.y = (opts.h || 1.8) / 2;
  const m = new StandardMaterial(`${id}mat`, scene); m.diffuseColor = Color3.FromHexString(opts.color || '#c8c0b0'); mesh.material = m;
  root.position.set(opts.x ?? ox, 0, opts.z ?? oz);
  return { id, kind, name, oath: opts.oath, cls: opts.cls, level: opts.level || 1, hp: opts.hp || 100, mhp: opts.hp || 100, alive: true, root, get position() { return root.position; }, headY: 2 };
}
const entities = new Map();
const mobsDef = CREATURES.filter((c) => c.oath === startOath);
const player = makeActor('me', 'player', params.get('name') || 'Wayfarer', { color: '#e8d8b0', oath: startOath, level: 4, hp: 260 });
entities.set('me', player);
mobsDef.forEach((c, i) => {
  const a = makeActor(`mob${i}`, 'mob', c.name, { color: c.tint.body, oath: c.oath, level: 3 + i * 2, hp: 180 + i * 220, h: c.role === 'boss' ? 4 : 2, r: c.role === 'boss' ? 1.2 : 0.6, x: ox + 6 + i * 5, z: oz + 10 + (i % 2) * 6 });
  entities.set(a.id, a);
});
const npc = makeActor('npc1', 'npc', 'Sorin Kes', { color: '#b0c8d8', x: ox - 6, z: oz + 4, level: 20, hp: 500 });
entities.set('npc1', npc);
const other = makeActor('p2', 'player', 'Tarin Esh', { color: '#8fb0ff', x: ox - 12, z: oz - 8, oath: 'oath-02', level: 9, hp: 300 });
entities.set('p2', other);

ctx.actors = {
  camera, player, entities, get: (id) => entities.get(id) || null,
  pick: () => entities.get('mob0'), nearestHostile: () => entities.get('mob0'), forEach: (fn) => entities.forEach(fn),
};
const sent = [];
ctx.net = {
  mode: params.get('online') ? 'online' : 'offline', selfId: 'me', rtt: 38, serverTime: () => Date.now(),
  async connect() { return {}; },
  send(msg) {
    sent.push(msg); console.log('[net.send]', JSON.stringify(msg));
    const ev = (e) => bus.emit('net:ev', e);
    if (msg.t === 'chat') ev({ type: 'chat', from: 'me', name: player.name, text: msg.text, channel: msg.channel });
    if (msg.t === 'respawn') { player.hp = player.mhp; player.alive = true; ev({ type: 'teleport', id: 'me', x: ox, y: 0, z: oz, ry: 0 }); }
    if (msg.t === 'travel') { const c = OATH_BY_ID[msg.shrine].center; player.root.position.set(c[0], 0, c[1] + 25); ev({ type: 'system', text: `You arrive at the ${OATH_BY_ID[msg.shrine].name} shrine.` }); }
    if (msg.t === 'interact') ev({ type: 'system', text: `You chose "${msg.option}".` });
  },
};
let target = null;
ctx.combat = { hotbar: [], get target() { return target; }, setTarget(id) { target = id; bus.emit('combat:target', { id }); }, cooldowns: {}, castBar: null };
window.__dev = { ctx, sent, bus };

// ---------- frame loop
let mana = 150; let mmana = 150;
engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
  ctx.clock.dt = dt; ctx.clock.time += dt; ctx.clock.frame++;
  ctx.input.poll();
  // player motion: keyboard / joystick, else gentle circle walk for the minimap
  const st = ctx.input.state;
  const mv = Math.hypot(st.moveX, st.moveY);
  if (mv > 0.01) {
    const yaw = -camera.alpha - Math.PI / 2;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const sp = (st.sprint ? 9 : 5.5) * dt;
    player.root.position.x += (fx * st.moveY + fz * st.moveX) * sp;
    player.root.position.z += (fz * st.moveY - fx * st.moveX) * sp;
    player.root.rotation.y = Math.atan2(fx * st.moveY + fz * st.moveX, fz * st.moveY - fx * st.moveX);
  } else if (params.get('walk') !== '0') {
    const t = ctx.clock.time * 0.08;
    player.root.position.x = ox + Math.cos(t) * 40; player.root.position.z = oz + Math.sin(t) * 40;
    player.root.rotation.y = Math.atan2(-Math.sin(t), Math.cos(t));
  }
  camera.alpha -= st.lookDX * 0.004; camera.beta = Math.min(1.5, Math.max(0.3, camera.beta - st.lookDY * 0.004));
  camera.target.copyFrom(player.root.position).addInPlaceFromFloats(0, 1.6, 0);
  if (ctx.clock.frame % 6 === 0) bus.emit('player:moved', { x: player.position.x, y: 0, z: player.position.z });
  // abilities
  for (let s = 0; s < 6; s++) if (ctx.input.consume(`slot${s}`)) castSlot(s);
  if (ctx.input.consume('target')) { const ids = [...entities.values()].filter((e) => e.kind === 'mob').map((e) => e.id); ctx.combat.setTarget(ids[(ids.indexOf(target) + 1) % ids.length]); }
  mana = Math.min(mmana, mana + dt * 4); player.mp = mana; player.mmp = mmana;
  for (const u of updaters) u.fn(dt);
  scene.render();
  ctx.input.endFrame();
});
addEventListener('resize', () => engine.resize());

const cds = new Array(6).fill(0);
function castSlot(s) {
  const c = ctx.character; if (!c) return;
  const a = hotbarFor(c.oath, c.cls)[s]; if (!a) return;
  const now = performance.now();
  if (now < cds[s]) { ctx.ui.toast('That technique is not ready yet.', 'warn'); return; }
  if (a.mana > mana) { ctx.ui.toast('Not enough mana.', 'warn'); return; }
  mana -= a.mana || 0;
  cds[s] = now + a.cooldown * 1000;
  bus.emit('combat:cast', { slot: s });
  bus.emit('combat:cooldown', { slot: s, until: cds[s] });
  const t = entities.get(target) || entities.get('mob0');
  setTimeout(() => {
    const crit = Math.random() < 0.2; const amt = Math.round((a.damage || 12) * (crit ? 1.8 : 1) * (0.9 + Math.random() * 0.2));
    t.hp = Math.max(0, t.hp - amt);
    bus.emit('combat:floater', { x: t.position.x, y: 2.2, z: t.position.z, text: String(amt), kind: crit ? 'crit' : 'damage', element: a.element });
    bus.emit('net:ev', { type: 'hit', src: 'me', dst: t.id, ability: a.id, amount: amt, crit, element: a.element, x: t.position.x, y: 1, z: t.position.z });
    if (t.hp <= 0) { t.alive = false; bus.emit('net:ev', { type: 'death', id: t.id, killer: 'me' }); setTimeout(() => { t.hp = t.mhp; t.alive = true; }, 4000); }
  }, (a.castTime || 0) * 1000 + 150);
}

// ---------- boot sequence
(async () => {
  ctx.ui = await UI.init(ctx);
  const steps = [[0.05, 'Kindling the renderer'], [0.15, 'Raising the continent'], [0.45, 'Building the fifteen sanctuaries'], [0.65, 'Opening the Weave'], [0.75, 'Summoning the Oathbound'], [1, 'Ready']];
  for (const [p, l] of steps) { ctx.setLoading(p, l); await new Promise((r) => setTimeout(r, params.get('fast') ? 30 : 380)); }
  const character = await ctx.ui.chooseCharacter();
  ctx.character = character;
  player.name = character.name; player.oath = character.oath; player.cls = character.cls;
  const cl = CLASSES[character.cls]; mmana = cl.mp + 8 * 3; mana = mmana * 0.7;
  bus.emit('game:character', character);
  await new Promise((r) => setTimeout(r, params.get('fast') ? 50 : 500));
  ctx.ui.enterGame();
  bus.emit('game:start', character);
  if (params.get('feed') !== '0') feed(character);
})();

function you(character, extra = {}) {
  return {
    id: 'me', name: character.name, oath: character.oath, cls: character.cls, level: 4, xp: 610, next: xpForLevel(4),
    hp: 240, mhp: 260, mp: Math.round(mana), mmp: mmana, gold: 1284, shrines: [character.oath, 'oath-05', 'oath-12'],
    stats: { power: 34, ward: 22, crit: 8, haste: 4 },
    equipment: {
      head: { id: 'i1', name: 'Quilted Felt Hood', rarity: 'uncommon', slot: 'head', stats: { ward: 4 } },
      chest: { id: 'i2', name: 'Ceramic Slat Harness', rarity: 'rare', slot: 'chest', stats: { ward: 9, power: 3 }, text: 'Fired twice, cooled once.' },
      hands: { id: 'i3', name: 'Vented Forearm Gauntlets', rarity: 'common', slot: 'hands' },
      feet: { id: 'i4', name: 'Archive Courier Boots', rarity: 'uncommon', slot: 'feet' },
      mainhand: { id: 'i5', name: 'Ceramic Wedge Blade', rarity: 'epic', slot: 'mainhand', stats: { power: 14 } },
      ring: { id: 'i6', name: 'Oath-Loop Band', rarity: 'rare', slot: 'ring' },
    },
    inventory: [
      { id: 'b1', name: 'Minor Mending Draught', rarity: 'common', qty: 6 }, { id: 'b2', name: 'Raw Amethyst Shard', rarity: 'uncommon', qty: 3 },
      { id: 'b3', name: 'Moss Fiber Bundle', rarity: 'common', qty: 12 }, { id: 'b4', name: 'Sealed Reagent Vial', rarity: 'rare', qty: 1 },
      { id: 'b5', name: 'Rime Ledger Page', rarity: 'epic', qty: 1 }, { id: 'b6', name: 'Oxidized Iron Ingot', rarity: 'common', qty: 4 },
      { id: 'b7', name: 'Lotus Short Sword', rarity: 'legendary', qty: 1 },
    ],
    quests: [
      { id: 'q1', title: 'Testimony on the Steps', text: 'Speak with Sorin Kes about what happened on the plaza.', progress: 0, goal: 1 },
      { id: 'q2', title: 'Thin the Ember Hounds', text: 'Hounds are harrying the foundry road.', progress: 2, goal: 6 },
    ],
    ...extra,
  };
}

function feed(character) {
  const ev = (e) => bus.emit('net:ev', e);
  const at = (s, fn) => setTimeout(fn, s * 1000);
  bus.emit('net:welcome', { id: 'me', token: 'x', you: you(character), world: { seed: 1, timeOfDay: 9 } });
  bus.emit('net:status', { mode: ctx.net.mode, connected: true });
  bus.emit('net:you', { you: you(character) });
  bus.emit('player:region', { oath: character.oath });
  at(0.8, () => ctx.combat.setTarget('mob1'));
  at(1.5, () => ev({ type: 'chat', from: 'p2', name: 'Tarin Esh', text: 'Anyone heading to the Rime Archive? The roads north are clear.', channel: 'world' }));
  at(2.4, () => ev({ type: 'chat', from: 'p3', name: 'Oda Kesh', text: 'Kiln Oath recruits meet at the foundry terrace at dusk.', channel: 'oath' }));
  at(3, () => ev({ type: 'status', dst: 'me', status: 'ward', dur: 30 }));
  at(3.1, () => ev({ type: 'status', dst: 'me', status: 'burn', dur: 8 }));
  at(3.2, () => ev({ type: 'status', dst: 'me', status: 'haste', dur: 120 }));
  at(3.5, () => ev({ type: 'quest', id: 'me', quest: { id: 'q2', title: 'Thin the Ember Hounds', text: 'Hounds are harrying the foundry road.', progress: 3, goal: 6 } }));
  at(4, () => { castSlot(1); });
  at(4.3, () => { castSlot(2); });
  at(5, () => ev({ type: 'xp', id: 'me', amount: 64, total: 760, next: xpForLevel(4) }));
  at(5.2, () => bus.emit('combat:floater', { x: player.position.x, y: 2.4, z: player.position.z, text: '+64 XP', kind: 'xp' }));
  at(5.6, () => { player.hp -= 70; bus.emit('combat:floater', { x: player.position.x, y: 2, z: player.position.z, text: '-70', kind: 'damage', taken: true }); ev({ type: 'hit', src: 'mob0', dst: 'me', ability: 'basic/ninja', amount: 70, element: 'fire' }); });
  at(6.5, () => ev({ type: 'discover', id: 'me', shrine: 'oath-07' }));
  at(7, () => ev({ type: 'loot', id: 'me', items: [{ id: 'l1', name: 'Ember Hound Pelt', rarity: 'common', qty: 2 }, { id: 'l2', name: 'Firecloth Wraps', rarity: 'rare', qty: 1 }, { id: 'l3', name: 'Kiln Focus Shard', rarity: 'epic', qty: 1 }] }));
  at(7.5, () => bus.emit('combat:floater', { x: player.position.x, y: 2.3, z: player.position.z, text: '+38', kind: 'heal' }));
  at(9, () => { ev({ type: 'level', id: 'me', level: 5 }); bus.emit('net:you', { you: you(character, { level: 5, xp: 0, next: xpForLevel(5), mhp: 278, hp: 278 }) }); player.level = 5; player.mhp = 278; player.hp = 278; });
  at(10, () => ev({ type: 'chat', from: 'p4', name: 'Una Brin', text: 'Remember: every covenant has a price.', channel: 'say' }));
  let n = 0;
  setInterval(() => { // ambient chatter + region tour
    n++;
    if (n % 3 === 0) ev({ type: 'chat', from: 'p5', name: ['Dessa Rowan', 'Tarin Esh', 'Oda Kesh'][(n / 3) % 3], text: ['The relay towers are humming again.', 'Bitterglass is buying sealed vials.', 'Saw a Cinder Drake over the basalt terraces.'][(n / 3) % 3], channel: ['world', 'say', 'oath'][(n / 3) % 3] });
    const t = entities.get(target); if (t && t.alive) { const amt = 8 + Math.round(Math.random() * 30); t.hp = Math.max(1, t.hp - amt); bus.emit('combat:floater', { x: t.position.x, y: 2.1, z: t.position.z, text: String(amt), kind: Math.random() < 0.15 ? 'crit' : 'damage', element: OATH_BY_ID[character.oath].element }); }
    if (n % 2 === 0) { player.hp = Math.min(player.mhp, player.hp + 6); }
    bus.emit('net:you', { you: { mp: Math.round(mana), mmp: mmana } });
  }, 1400);
  if (params.get('tour')) { let i = 0; const ids = Object.keys(OATH_BY_ID); setInterval(() => { i = (i + 1) % 15; bus.emit('player:region', { oath: ids[i] }); }, 7000); }

  const panel = params.get('panel');
  at(params.get('fast') ? 1.2 : 2, () => {
    if (panel === 'map' || panel === 'character' || panel === 'settings') ctx.ui.openWindow(panel);
    if (panel === 'npc') ev({ type: 'npc', id: 'me', npc: 'npc1', name: 'Sorin Kes', role: 'Field medic · Daybreak', text: 'You were there when the Archivist fell. I saw the light leave their hands and go into yours.\n\nWhatever you carry now, people will want it. Some will ask nicely.', options: [{ id: 'ask', label: 'What did the Archivist say before the end?' }, { id: 'trust', label: 'Who can I trust here?' }, { id: 'bye', label: 'I need to go.' }] });
    if (panel === 'death') { player.hp = 0; ev({ type: 'death', id: 'me', killer: 'mob3' }); }
    if (panel === 'levelup') ev({ type: 'level', id: 'me', level: 6 });
  });
}
void regionAt;
