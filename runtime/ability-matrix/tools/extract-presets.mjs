// Dumps every ability's live settings block from each pack's own settings.js
// into presets/<pack>/<id>.json plus one catalog.json. Run: node tools/extract-presets.mjs
import { writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { NEW_PRESETS } from '../presets/new/catalog.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PACKS = {
  linear: { repo: 'achrefelouafi/LinearAbiltyCastingThreeJS', title: 'Linear Ability Casting' },
  'linear-ext': { repo: 'achrefelouafi/LinearAbilityExtThreeJS', title: 'Linear Ability Ext' },
  'linear-extended': { repo: 'achrefelouafi/LinearAbiltyCastingExtendedThreeJS', title: 'Linear Ability Casting Extended' },
  handcast: { repo: 'achrefelouafi/HandCastAbilityThreeJS', title: 'Hand Cast Ability' },
  casting: { repo: 'achrefelouafi/AbilityCastingThreeJS', title: 'Ability Casting (Elemental Sandbox)' },
  collective: { repo: 'collective-ai (new)', title: 'Collective Originals', native: true },
  'matrix-new': { repo: 'collective-ai (new)', title: 'Matrix New', native: true },
  atlas: { repo: 'collective-ai (new)', title: 'Ability Atlas', native: true },
  codex: { repo: 'collective-ai (new)', title: 'Elemental Codex', native: true }
};
// Every ability now runs in the one sandbox (packs/sandbox). Source packs keep
// their own settings.js (vendored verbatim into the sandbox); the native groups
// are read from the sandbox's settings, split by config/sandbox.js.
const sandboxCfg = await import(pathToFileURL(path.join(root, 'packs/sandbox/src/config/settings.js')).href);
const { NATIVE_GROUPS } = await import(pathToFileURL(path.join(root, 'packs/sandbox/src/config/sandbox.js')).href);
// What each ability *is* (fire, frost, tech…), independent of the pack it came from.
const { ELEMENT_GROUPS, ELEMENT_OF } = await import(pathToFileURL(path.join(root, 'packs/sandbox/src/config/elements.js')).href);
const EXTRAS = { boost: 'BOOST_META', magic: 'MAGIC_META', fire: 'FIRE_META' };
const SHARED = ['global', 'aim', 'zone', 'character', 'move', 'dummies', 'camera', 'environment', 'post'];

const catalog = { format: 'collective-ability-catalog@1', generated: new Date().toISOString(), elements: [], packs: [], abilities: [] };
for (const [pack, info] of Object.entries(PACKS)) {
  const file = path.join(root, 'packs', pack, 'src/config/settings.js');
  if (!info.native && !existsSync(file)) continue;
  const cfg = info.native ? sandboxCfg : await import(pathToFileURL(file).href);
  const ids = info.native ? NATIVE_GROUPS.find((g) => g.pack === pack).ids : cfg.ELEMENTS;
  const shape = cfg.castShapeOf ?? ((id) => cfg.ELEMENT_META[id]?.cast ?? 'line');
  mkdirSync(path.join(root, 'presets', pack), { recursive: true });
  const entries = [];
  ids.forEach((id, slot) => {
    const meta = cfg.ELEMENT_META[id] ?? {};
    const block = cfg.DEFAULT_SETTINGS[id];
    const entry = {
      uid: `${pack}/${id}`, pack, id, slot, kind: shape(id) === 'summon' ? 'summon' : 'ability', element: ELEMENT_OF[`${pack}/${id}`] ?? null,
      label: meta.label ?? id, hint: meta.hint ?? '', key: meta.key ?? '', accent: meta.accent ?? '#fff',
      cast: shape(id), castAnim: block?.castAnim ?? null, cooldown: block?.cooldown ?? null,
      range: block?.range ?? null, minRange: block?.minRange ?? null, zoneRadius: block?.zoneRadius ?? null,
      controls: countLeaves(block), status: 'live'
    };
    entries.push(entry);
    writeFileSync(path.join(root, 'presets', pack, `${id}.json`), JSON.stringify({ format: 'collective-ability-preset@1', ...entry, settings: block }, null, 2));
  });
  for (const [action, metaName] of Object.entries(EXTRAS)) {
    if (!cfg[metaName] || !cfg.DEFAULT_SETTINGS[action]) continue;
    const meta = cfg[metaName];
    const block = cfg.DEFAULT_SETTINGS[action];
    const entry = { uid: `${pack}/${action}`, pack, id: action, slot: null, kind: 'buff', element: ELEMENT_OF[`${pack}/${action}`] ?? null, action, label: meta.label ?? action,
      hint: meta.hint ?? 'Self buff — press again to let go', key: meta.key ?? '', accent: meta.accent ?? '#fff', cast: 'self',
      castAnim: block?.castAnim ?? null, cooldown: block?.cooldown ?? null, duration: block?.duration ?? null, controls: countLeaves(block), status: 'live' };
    entries.push(entry);
    writeFileSync(path.join(root, 'presets', pack, `${action}.json`), JSON.stringify({ format: 'collective-ability-preset@1', ...entry, settings: block }, null, 2));
  }
  const shared = Object.fromEntries(SHARED.filter((k) => cfg.DEFAULT_SETTINGS[k]).map((k) => [k, cfg.DEFAULT_SETTINGS[k]]));
  writeFileSync(path.join(root, 'presets', pack, `_shared.json`), JSON.stringify(shared, null, 2));
  catalog.packs.push({ pack, ...info, castAnimations: cfg.CAST_ANIMATIONS ?? [], castShapes: Object.values(cfg.CastShape ?? {}), count: entries.length });
  catalog.abilities.push(...entries);
  console.log(pack, entries.length, entries.map((e) => e.id).join(' '));
}
function countLeaves(o) { if (!o || typeof o !== 'object') return 1; return Object.values(o).reduce((n, v) => n + countLeaves(v), 0); }

// Archived abilities: present in the repos, not reachable from the live app.
const ARCHIVED_ELEMENT = { fire: 'fire', water: 'water', earth: 'earth', wind: 'wind', airScooter: 'wind' };
const archived = [
  ['linear', 'fire', 'Fire (path cast)', 'Raymarched black-body flame volume + embers/smoke, cast along a freehand path'],
  ['linear', 'water', 'Water (path cast)', 'Raymarched water surface + spray/foam + splash crown, cast along a freehand path'],
  ['linear', 'earth', 'Earth (path cast)', 'Instanced crust plates, heaved boulders, finale tower, cast along a freehand path'],
  ['linear', 'wind', 'Wind (path cast)', 'Combed silk ribbons, vortex, tornado finale, cast along a freehand path'],
  ['linear', 'airScooter', 'Air Scooter (walk mode)', 'Walk-mode air ball the character rides'],
  ['linear-ext', 'water', 'Water (path cast)', 'Same archived water path cast as the Linear pack'],
  ['linear-ext', 'airScooter', 'Air Scooter (walk mode)', 'Same archived walk-mode air ball']
];
for (const [pack, id, label, hint] of archived) catalog.abilities.push({ uid: `${pack}/archive/${id}`, pack, id, kind: 'archived', element: ARCHIVED_ELEMENT[id] ?? null, label, hint, cast: 'path', status: 'archived', file: `packs/${pack}/src/archive/` });

// Moves: the character clips and the non-cast moves each pack ships.
const MOVE_LABEL = { cast1: 'Cast gesture I', cast2: 'Cast gesture II', cast3: 'Cast gesture III' };
// One sandbox, one caster: the character's moves are listed once.
catalog.packs.push({ pack: 'moves', repo: '', title: 'Character & moves', castAnimations: ['cast1', 'cast2', 'cast3'], castShapes: [], count: 0 });
catalog.abilities.push({ uid: 'moves/idle', pack: 'moves', id: 'idle', kind: 'move', label: 'Idle', hint: 'Idle.fbx — the rig and its idle loop, shared by every pack', cast: 'move', status: 'live' });
for (const a of ['cast1', 'cast2', 'cast3']) catalog.abilities.push({ uid: `moves/${a}`, pack: 'moves', id: a, kind: 'move', label: MOVE_LABEL[a], hint: `${a}.fbx — Mixamo cast clip, thrown with the cast lunge`, cast: 'move', status: 'live', move: a });
catalog.abilities.push(
  { uid: 'moves/lunge', pack: 'moves', id: 'lunge', kind: 'move', label: 'Cast lunge', hint: 'Procedural body lunge thrown into every cast', cast: 'move', status: 'live', move: 'lunge' },
  { uid: 'moves/walk', pack: 'moves', id: 'walk', kind: 'move', label: 'Walk', hint: 'W A S D (or the arrows) walk the caster, relative to the camera, on a procedural gait. Cast on the move: armed, it strafes facing the aim', cast: 'move', status: 'live' },
  { uid: 'moves/run', pack: 'moves', id: 'run', kind: 'move', label: 'Run', hint: 'Hold Shift while moving: a longer, faster stride with footfall dust', cast: 'move', status: 'live' },
  { uid: 'moves/dash', pack: 'moves', id: 'dash', kind: 'move', label: 'Dash', hint: 'Space: a quick dash the way you are moving (or facing), with a dust ring and a streak trail', cast: 'move', status: 'live', move: 'dash' },
  { uid: 'moves/drive', pack: 'moves', id: 'drive', kind: 'move', label: 'Summon drive', hint: 'With the Sentinel Drone or Monowheel Bot out: WASD steers, Space or hold click fires, the same slot recalls', cast: 'move', status: 'live' },
  { uid: 'moves/handcam', pack: 'moves', id: 'handcam', kind: 'move', label: 'Hand-tracking cast', hint: 'Hand Cast and Ability Casting packs only (M): MediaPipe webcam, open palm aims, fist casts. Needs a camera, so it is not in the hosted sandbox', cast: 'move', status: 'pack-only' },
  { uid: 'moves/castle', pack: 'moves', id: 'castle', kind: 'move', label: 'Duel Hall burn', hint: 'Ability Casting pack only (`): burn the gothic hall away around the platform', cast: 'move', status: 'pack-only' }
);
// The Ability Atlas *prototype* (packs/atlas, presets/runtime.js) keeps its own
// presets. Its ten effects were rebuilt on the sandbox engine (the `atlas`
// group above); the prototype stays for anyone using its portable runtime.
mkdirSync(path.join(root, 'presets', 'atlas-prototype'), { recursive: true });
for (const [slot, preset] of NEW_PRESETS.entries()) {
  const settings = { ...preset.defaults, color: preset.color };
  const entry = {
    uid: `atlas/${preset.id}`, pack: 'atlas', id: preset.id, slot, kind: 'ability',
    label: preset.name, hint: preset.description, key: '', accent: preset.color,
    cast: 'point', castAnim: null, cooldown: null, range: 16, minRange: 0,
    zoneRadius: preset.defaults.radius, controls: countLeaves(settings), status: 'live'
  };
  writeFileSync(path.join(root, 'presets', 'atlas-prototype', `${preset.id}.json`), JSON.stringify({ format: 'collective-ability-preset@1', ...entry, settings }, null, 2));
}
const library = { format: 'collective-ability-library@1', generated: catalog.generated, presets: {} };
for (const a of catalog.abilities) {
  if (a.status !== 'live' || a.kind === 'move') continue;
  const file = path.join(root, 'presets', a.pack, `${a.id}.json`);
  if (existsSync(file)) library.presets[a.uid] = JSON.parse((await import('node:fs')).readFileSync(file, 'utf8'));
}
catalog.elements = ELEMENT_GROUPS.map((e) => ({ ...e, count: catalog.abilities.filter((a) => a.element === e.id && a.status === 'live' && a.kind !== 'move').length }));
writeFileSync(path.join(root, 'presets', 'library.json'), JSON.stringify(library));
writeFileSync(path.join(root, 'presets', 'catalog.json'), JSON.stringify(catalog, null, 2));
console.log('total live', catalog.abilities.filter((a) => a.status === 'live').length, 'archived', archived.length);

// HUD sigils, so the matrix cards draw the same mark the pack's own slot does.
const withGlyphs = JSON.parse((await import('node:fs')).readFileSync(path.join(root, 'presets', 'catalog.json'), 'utf8'));
for (const pk of withGlyphs.packs) {
  const file = PACKS[pk.pack]?.native ? path.join(root, 'packs/sandbox/src/ui/glyphs.js') : path.join(root, 'packs', pk.pack, 'src/ui/glyphs.js');
  if (!existsSync(file)) continue;
  const mod = await import(pathToFileURL(file).href);
  const sigils = mod.ELEMENT_SIGILS ?? {};
  const extra = { boost: mod.BOOST_SIGIL, magic: mod.MAGIC_SIGIL, fire: mod.FIRE_SIGIL };
  for (const a of withGlyphs.abilities) if (a.pack === pk.pack && (sigils[a.id] || extra[a.id])) a.glyph = sigils[a.id] ?? extra[a.id];
}
writeFileSync(path.join(root, 'presets', 'catalog.json'), JSON.stringify(withGlyphs, null, 2));
console.log('glyphs', withGlyphs.abilities.filter((a) => a.glyph).length);
