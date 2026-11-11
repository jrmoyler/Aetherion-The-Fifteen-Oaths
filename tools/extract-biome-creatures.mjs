// Lifts Biome Triad's creatures and ambient wildlife out of its single-file app into a module Aetherion can import.
//
// Nothing is rewritten. Three kinds of source text are copied character for character from index.html:
//   1. named top-level functions and constants (gullGeo, fishGeo, critterMat, flock, whaleGeo, the savanna and
//      village beasts, the marsh heron and dragonfly, and the small maths/geometry helpers they call);
//   2. each world's wildlife block from inside its build(k): the statements that create the animals;
//   3. each world's wildlife lines from inside its update(dt, env): the statements that move them.
// Kinds 2 and 3 live inside closures in the source, so each is wrapped in an exported function whose parameters
// are exactly the names the copied statements read from their world (its height function, its random stream, its
// landmarks). The adapter (game/src/three/realmCreatures.js) supplies Aetherion's equivalents.
//
//   node tools/extract-biome-creatures.mjs <biome-triad checkout>
//
// Output: game/src/three/biome-creatures.generated.js (imports in Node: no canvas is touched until a texture is read)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Usage: node tools/extract-biome-creatures.mjs <biome-triad checkout>');
const source = resolve(process.argv[2]);
const html = readFileSync(join(source, 'index.html'), 'utf8');

/** Offset just past the bracket that closes the first `open` found at or after `start`. Skips strings and comments. */
function balanced(start, open, close) {
  let depth = 0, i = html.indexOf(open, start), quote = null;
  for (; i < html.length; i++) {
    const ch = html[i], next = html[i + 1];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === '/' && next === '/') { i = html.indexOf('\n', i); continue; }
    if (ch === '/' && next === '*') { i = html.indexOf('*/', i) + 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return i + 1;
  }
  throw new Error(`Unbalanced ${open} from offset ${start}`);
}
const lineOfOffset = (offset) => html.slice(0, offset).split('\n').length;
const chunks = []; // { at, text, note }

// ---- 1. Top-level functions and constants -------------------------------------------------------------------
const FUNCTIONS = ['rng', 'grad', 'perlin', 'finishTex', 'gbFinish', 'geoBuf', 'geoFinish', 'tubeInto', 'colored', 'stripAttrs',
  'gullGeo', 'fishGeo', 'critterMat', 'flock', 'whaleGeo', 'taigaDeerGeo', 'savannaBeastGeo', 'savannaBeastMat', 'step01', 'savannaAnimalGeo',
  'marshHeronGeo', 'marshDragonflyGeo'];
for (const name of FUNCTIONS) {
  const match = new RegExp(`^[ \\t]*function ${name}\\(`, 'm').exec(html);
  if (!match) throw new Error(`function ${name} not found`);
  const open = html.indexOf('{', balanced(match.index + match[0].length - 1, '(', ')'));
  chunks.push({ at: match.index, text: html.slice(match.index, balanced(open, '{', '}')).replace(/^\s+/, ''), note: `function ${name}` });
}
for (const pattern of [/^const TAU = .*$/m, /^const clamp = .*$/m, /^const lerp = .*$/m, /^const smoothstep = .*$/m, /^const PERM = .*$/m, /^\{ const r = rng\(7\).*$/m,
  /^const fade = .*$/m, /^const V3 = .*$/m, /^const lin = .*$/m, /^const gb = .*$/m, /^const WIND = .*$/m, /^const owned = .*$/m, /^const FLOCKS = \[\];$/m,
  /^for \(const k in savannaBeasts\)\{.*$/m, /^for \(const k in VIL_BEASTS\)\{.*$/m, /^const VIL_PENS = .*$/m]) {
  const match = pattern.exec(html); if (!match) throw new Error(`constant not found: ${pattern}`);
  chunks.push({ at: match.index, text: match[0], note: 'constant' });
}
for (const name of ['savannaPaint', 'savannaPaint2', 'savannaBeasts', 'VIL_BEASTS']) {
  const match = new RegExp(`^const ${name} = \\{`, 'm').exec(html); if (!match) throw new Error(`table ${name} not found`);
  chunks.push({ at: match.index, text: html.slice(match.index, balanced(match.index, '{', '}')) + ';', note: `table ${name}` });
}
// The two sprite textures the night lights use are painted on a canvas at start-up in the source. Here the same
// expression runs on first use, so the module imports where there is no canvas (tests, the server).
for (const name of ['glow', 'flake']) {
  const match = new RegExp(`^tex\\.${name} = (\\(\\(\\) => \\{.*\\}\\)\\(\\));$`, 'm').exec(html); if (!match) throw new Error(`tex.${name} not found`);
  chunks.push({ at: match.index, text: `lazyTexture('${name}', () => ${match[1]});`, note: `sprite texture tex.${name}, deferred` });
}

// ---- 2 and 3. Wildlife statements from inside each world ----------------------------------------------------
const worldStart = {};
for (const match of html.matchAll(/^Helios\.registerBiome\(\{\s*\n\s*id:'(\w+)'/gm)) worldStart[match[1]] = match.index;
const worldIds = Object.keys(worldStart);
const worldEnd = (id) => { const next = worldIds[worldIds.indexOf(id) + 1]; return next ? worldStart[next] : html.length; };
const wrapped = [];
/**
 * Copy the statements of `world` running from the text `from` through the text `to` (both inclusive; `to` is the
 * first occurrence after `from`) into an exported function. `needs` are the world-local names the statements read,
 * `gives` the names they declare that the adapter uses afterwards. `state` names `let` variables of the source
 * closure that the statements reassign: they are read from and written back to a `state` object.
 */
function lift(name, world, { from, to, needs, gives = [], state = [], about }) {
  const lo = worldStart[world], hi = worldEnd(world); if (lo == null) throw new Error(`world ${world} not found`);
  const at = html.indexOf(from, lo); if (at < 0 || at >= hi) throw new Error(`${name}: start not found in ${world}`);
  const endAt = html.indexOf(to, at); if (endAt < 0 || endAt >= hi) throw new Error(`${name}: end not found in ${world}`);
  if (html.indexOf(from, at + 1) > 0 && html.indexOf(from, at + 1) < hi) throw new Error(`${name}: start is ambiguous in ${world}`);
  const body = html.slice(at, endAt + to.length);
  const params = [...needs, ...(state.length ? ['state'] : [])].join(', ');
  const pre = state.length ? `  let ${state.map((key) => `${key} = state.${key}`).join(', ')};\n` : '';
  const post = state.length ? `\n  ${state.map((key) => `state.${key} = ${key};`).join(' ')}` : '';
  const text = `/** ${about} (${world}, index.html:${lineOfOffset(at)}-${lineOfOffset(endAt)}) */\nexport function ${name}({ ${params} }) {\n${pre}  ${body}${post}\n  return { ${gives.join(', ')} };\n}`;
  chunks.push({ at, text, note: `${world}: ${name}` });
  wrapped.push({ name, world, lines: [lineOfOffset(at), lineOfOffset(endAt)], needs, gives, about });
}

lift('seaWildlife', 'sea', { about: 'Gull flocks over the islands and fish schools over the reef',
  from: "const gullM = new THREE.InstancedMesh(gullGeo(), critterMat('wing'), 40);", to: 'bank:0.3, seed:42 });',
  needs: ['k', 'isl', 'heightAt', 'group', 'R'], gives: ['gullM', 'gulls', 'fishM', 'fish'] });
lift('arcticPetrels', 'arctic', { about: 'Petrels over the islands',
  from: "const birdM = new THREE.InstancedMesh(gullGeo(), critterMat('wing'), 36);", to: 'scale:1.1, shy:20, seed:43 });',
  needs: ['k', 'isl', 'heightAt', 'group'], gives: ['birdM', 'petrels'] });
lift('arcticBoneMat', 'arctic', { about: 'The bone material of the whale skeleton',
  from: 'const boneMat = new THREE.MeshStandardMaterial({ vertexColors:true, color:0xeee6d2,', to: 'roughness:0.75 });',
  needs: ['tex'], gives: ['boneMat'] });
lift('arcticWhaleBones', 'arctic', { about: 'The bleached whale skeleton on the beach',
  from: '{ const x = 228, z = -196, w = new THREE.Mesh(owned(whaleGeo()), boneMat);', to: 'w.castShadow = w.receiveShadow = true; group.add(w); }',
  needs: ['boneMat', 'heightAt', 'group'] });
lift('havenDoves', 'haven', { about: 'Doves circling the sanctuary',
  from: "const doveM = new THREE.InstancedMesh(gullGeo(), critterMat('wing'), 48);", to: 'scale:0.75, shy:12, seed:44 });',
  needs: ['k', 'isl', 'heightAt', 'group'], gives: ['doveM', 'doves'] });
lift('forestRooks', 'forest', { about: 'Rooks wheeling over the canopy',
  from: "const birdM = new THREE.InstancedMesh(gullGeo(), critterMat('wing'), 26), dm = new THREE.Object3D();", to: 'scale:0.9, shy:14, seed:45 });',
  needs: ['k', 'CZ', 'heightAt', 'group'], gives: ['birdM', 'rooks'] });
lift('taigaWildlife', 'taiga', { about: 'A moose on the shore, caribou grazing the tundra, ravens over the forest',
  from: 'const furMat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.95 });', to: 'ravM.frustumCulled = false; group.add(ravM);',
  needs: ['R', 'group', 'meshH', 'ICE_Y'], gives: ['furMat', 'moose', 'cari', 'ravM', 'ravD', 'dm'] });
lift('taigaWildlifeUpdate', 'taiga', { about: 'The moose breathes, caribou walk and graze, ravens circle',
  from: 'moose.rotation.x = 0.03*Math.sin(t*0.4);', to: 'ravM.instanceMatrix.needsUpdate = true;',
  needs: ['moose', 'cari', 'ravD', 'ravM', 'dm', 'meshH', 'dt', 't'] });
lift('savannaWildlife', 'savanna', { about: 'Herds of impala, zebra, wildebeest and giraffe, and vultures on a thermal',
  from: 'const herds = [], dm = new THREE.Object3D();', to: 'vultM.frustumCulled = false; group.add(vultM);',
  needs: ['R', 'group'], gives: ['herds', 'dm', 'flee', 'vultM', 'vultD'] });
lift('savannaHerdsUpdate', 'savanna', { about: 'Herds graze, startle at an exposed viewer, flee and regroup',
  from: 'let stampeders = [];', to: 'H.mesh.instanceMatrix.needsUpdate = true; H.aLeg.needsUpdate = true;\n        }',
  needs: ['herds', 'heightAt', 'conceal', 'flee', 'savannaPools', 'R', 'dm', 'dt', 't'], gives: ['stampeders'] });
lift('savannaVulturesUpdate', 'savanna', { about: 'Vultures ride the thermal',
  from: 'vultD.forEach((g, i) => { const th = g.a + g.w*t,', to: 'vultM.instanceMatrix.needsUpdate = true;',
  needs: ['vultD', 'vultM', 'dm', 't'] });
lift('canyonBirds', 'canyon', { about: 'Ravens and condors riding the thermals over the gorge',
  from: "const birdM = new THREE.InstancedMesh(gullGeo(), critterMat('wing'), 30), birdD = [], dm = new THREE.Object3D();", to: 'birdM.frustumCulled = false; group.add(birdM);',
  needs: ['R', 'rx', 'group'], gives: ['birdM', 'birdD', 'dm'] });
lift('canyonBirdsUpdate', 'canyon', { about: 'Ravens and condors circle',
  from: 'birdD.forEach((g,i) => { const th = g.a + g.w*env.time,', to: 'birdM.instanceMatrix.needsUpdate = true;',
  needs: ['birdD', 'birdM', 'dm', 'env'] });
lift('alpineBirds', 'alpine', { about: 'Choughs about the crag, an eagle soaring the walls',
  from: "const birdM = new THREE.InstancedMesh(gullGeo(), critterMat('wing'), 26), birdD = [];", to: 'birdM.frustumCulled = false; group.add(birdM);',
  needs: ['R', 'vx', 'T', 'zc', 'group'], gives: ['birdM', 'birdD'] });
lift('alpineBirdsUpdate', 'alpine', { about: 'Choughs and eagles circle',
  from: 'birdD.forEach((g, i) => { const th = g.a + g.w*t,', to: 'birdM.instanceMatrix.needsUpdate = true;',
  needs: ['birdD', 'birdM', 'dm', 't'] });
lift('marshWildlife', 'marsh', { about: "Herons and egrets in the shallows, dragonflies, fireflies and will-o'-wisps",
  from: 'const birdMat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.85, side:THREE.DoubleSide }), HG =', to: 'return { sp, x:0, z:0, y:0, ph:R()*10, set:false }; });',
  needs: ['R', 'group', 'ground', 'deckDist'], gives: ['birdMat', 'HG', 'shallowSpot', 'herons', 'dfM', 'dfD', 'ff', 'wisps'] });
lift('marshWildlifeUpdate', 'marsh', { about: 'Herons stalk and lift off when approached, dragonflies dart by day, fireflies and wisps glow at night',
  from: 'st.heronMsg -= dt;', to: '*(1 - smoothstep(60, 90, dv)); });',
  needs: ['st', 'fi', 'herons', 'meshH', 'shallowSpot', 'marshAddRip', 'splash', 'R', 'dfD', 'dfM', 'dm', 'rk', 'SURF', 'ff', 'wisps', 'env', 'dt', 't'] });
lift('cavernBats', 'caverns', { about: 'Bats that roost by day, stream out at dusk and wheel at night',
  from: "const BN = 54, batM = new THREE.InstancedMesh(gullGeo(), critterMat('wing'), BN),", to: 'batM.frustumCulled = false; group.add(batM);',
  needs: ['R', 'bil', 'RF', 'fl', 'group'], gives: ['BN', 'batM', 'roostY', 'hallY', 'bats'] });
lift('cavernBatsUpdate', 'caverns', { about: 'Bats leave the roost at dusk, wheel and return',
  from: 'const emerge = env.night > 0.3', to: 'batM.instanceMatrix.needsUpdate = true;',
  needs: ['bats', 'batM', 'dm', 'hallY', 'S0', 'CAVE_SURF', 'env', 'dt', 't'], state: ['batScare'] });
lift('villageBirds', 'village', { about: 'Rooks round the church tower, swallows over the fields',
  from: "const birds = new THREE.InstancedMesh(gullGeo(), critterMat('wing'), 30), birdD = [];", to: 'birds.frustumCulled = false; group.add(birds);',
  needs: ['R', 'group'], gives: ['birds', 'birdD'] });
lift('villageBirdsUpdate', 'village', { about: 'Rooks and swallows circle',
  from: 'birdD.forEach((g, i) => { const th = g.a + g.w*t*(g.s < 0.4 ? 1 : 0.5),', to: 'birds.instanceMatrix.needsUpdate = true;',
  needs: ['birdD', 'birds', 'dm', 'heightAt', 't'] });
lift('villageLivestock', 'village', { about: 'Sheep, cattle and pigs in their pens',
  from: 'const herds = [];\n    for (const P of VIL_PENS){', to: 'herds.push(H); } }',
  needs: ['VIL_PENS', 'R', 'group'], gives: ['herds'] });
lift('villageLivestockUpdate', 'village', { about: 'Livestock wander and graze inside the pen',
  from: 'for (const H of herds){ const P = H.P, B = H.B; H.members.forEach((m, i) => {', to: 'H.mesh.instanceMatrix.needsUpdate = true; H.aLeg.needsUpdate = true; }',
  needs: ['herds', 'heightAt', 'R', 'dm', 'dt'] });
lift('ruinsBirds', 'ruins', { about: 'Macaws by day, bats pouring from the summit at dusk',
  from: "const birdM = new THREE.InstancedMesh(gullGeo(), critterMat('wing'), 40), BD = [];", to: 'birdM.frustumCulled = false; group.add(birdM);',
  needs: ['R', 'group'], gives: ['birdM', 'BD'] });
lift('ruinsBirdsUpdate', 'ruins', { about: 'Macaws circle the plaza by day; at dusk the same birds turn to bats over the summit',
  from: 'const mode = env.day > 0.45 ? 0 : 1;', to: 'birdM.instanceMatrix.needsUpdate = true;',
  needs: ['birdM', 'BD', 'pyrTop', 'PZ', 'PY', 'env', 't'], state: ['birdMode'] });
lift('deepWhale', 'underwater', { about: 'The whale: lathe body, pectoral fins, a fluke on its own pivot',
  from: 'const whale = new THREE.Group(); {', to: 'whale.userData.tail = tail; whale.scale.setScalar(1.0); group.add(whale); }',
  needs: ['group'], gives: ['whale'] });
lift('deepWhaleUpdate', 'underwater', { about: 'The whale cruises a wide circle, rising and sinking, tail beating',
  from: '{ const th = t*0.009 + 1.2, rad = 240;', to: 'whale.userData.tail.rotation.x = 0.35*Math.sin(t*0.9); }',
  needs: ['whale', 'KX', 'KZ', 't'] });

chunks.sort((a, b) => a.at - b.at);
const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const prelude = `// Generated by tools/extract-biome-creatures.mjs from Biome Triad ${commit}. Do not edit.
// Creature geometry, materials, the boids flock and each world's wildlife statements, copied verbatim from index.html.
/* eslint-disable */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BIOME_CREATURES_COMMIT = '${commit}';
// Engine globals the copied code reads. S is the source's viewer state: only its position is read here.
const MAX_ANISO = 4;
const S = { pos: new THREE.Vector3() };
const tex = {}, OWNED = [];
function lazyTexture(name, paint) { let made; Object.defineProperty(tex, name, { get: () => (made ??= paint()), enumerable: true }); }
`;
const body = chunks.map((chunk) => `// --- ${chunk.note} (index.html:${lineOfOffset(chunk.at)})\n${chunk.text}`).join('\n\n');
const exportsBlock = `
/** What was lifted from inside each world, for the inventory and the tests. */
export const LIFTED = ${JSON.stringify(wrapped.map(({ name, world, lines, about }) => ({ name, world, lines, about })), null, 1)};
export { S, WIND, OWNED, FLOCKS, tex, rng, flock, gullGeo, fishGeo, critterMat, whaleGeo, taigaDeerGeo, savannaBeastGeo, savannaAnimalGeo, savannaBeastMat, savannaBeasts,
  VIL_BEASTS, VIL_PENS, marshHeronGeo, marshDragonflyGeo };
`;
const target = join(repo, 'game/src/three/biome-creatures.generated.js');
writeFileSync(target, `${prelude}\n${body}\n${exportsBlock}`);
execFileSync(process.execPath, ['--check', target]);
// It must import with no document and no canvas.
const loaded = await import(pathToFileURL(target).href + `?t=${Date.now()}`);
if (typeof loaded.flock !== 'function' || loaded.gullGeo().attributes.position.count < 10) throw new Error('generated module did not load');
console.log(commit, FUNCTIONS.length, 'functions', wrapped.length, 'wildlife blocks', `${(readFileSync(target).length / 1024).toFixed(0)} kB`);
