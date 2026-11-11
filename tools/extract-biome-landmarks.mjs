// Lifts Biome Triad's built and geological scene objects out of its single-file app into a module Aetherion can import.
//
// Nothing is rewritten. Two kinds of source text are copied character for character from index.html:
//   1. Top-level definitions: every builder named in ROOTS, plus whatever top-level function or constant its text
//      names (resolved automatically, in source order).
//   2. Recipes: runs of statements cut out of a world's build(k) body (the materials, option tables and assemblies
//      that only exist there), wrapped in a function whose parameters stand in for the build's own locals.
// A small prelude supplies the engine globals the copied code reads. Textures painted on a canvas at start-up in the
// source are painted on first use here, so the module also imports where there is no canvas (tests, the server).
//
//   node tools/extract-biome-landmarks.mjs <biome-triad checkout>
//
// Output: game/src/three/biome-landmarks.generated.js
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node tools/extract-biome-landmarks.mjs <biome-triad checkout>');
const html = readFileSync(join(source, 'index.html'), 'utf8');
const lineOf = (offset) => html.slice(0, offset).split('\n').length;

// --- what to take ------------------------------------------------------------------------------------------
/** Top-level builders and materials. Their dependencies follow automatically. */
const ROOTS = [
  'instTiled', 'plantMat', 'terrainMaterial',
  // rock kit, sea
  'cragGeo', 'cragMat', 'stackGeo', 'logGeo', 'islandGeo',
  // ice
  'iceMaterial', 'seaIceMaterial', 'icebergGeo', 'seaBergGeo', 'seracGeo', 'floeGeo', 'inukshukGeo', 'cabinGeo',
  // volcano
  'volcColonnadeGeo', 'snagGeo',
  // Egypt
  'masonryTex', 'glyphTex', 'pyramidGeo', 'columnGeo', 'houseGeo', 'colossusGeo', 'sphinxGeo', 'criosphinxGeo',
  // Haven
  'marbleTex', 'classicColumnGeo', 'tholosGeo', 'skyIslandGeo',
  // canyon
  'canyonHoodooGeo', 'canyonCaveGeo', 'canyonLayerAt', 'canyonLin',
  // alpine
  'alpineBridgeGeo', 'alpineCairnGeo',
  // marsh
  'marshHutGeo', 'marshPuntGeo', 'marshSnagGeo', 'marshKneeGeo',
  // forest, taiga, savanna
  'forestLogGeo', 'taigaFallenGeo', 'taigaStumpGeo', 'taigaCapMat', 'savannaMoundGeo',
  // ruins and the sunken colonnade
  'ruinHeadGeo', 'ruinStoneMat', 'ruinGrainTex', 'deepColumnGeo',
  // village
  'vilLayout', 'vilBuild', 'vilUnits', 'vilFinish', 'vilSlots', 'vilCoverGeo', 'VIL_SLOTS',
];
/** Names the prelude supplies, and names that only look like top-level references (locals, GLSL words, comments). */
const PROVIDED = new Set(['Q', 'MAX_ANISO', 'OWNED', 'tex', 'renderer', 'scene', 'camera', 'canvas', 'Helios', 'kit', 'qKey', 'QUALITY']);
const NOT_REFERENCES = new Set(['frame', 'cap', 'float', 'vec3', 'S', 'scatter', 'rain', 'SCATTERS', 'flora', 'stars', 'moon', 'clouds', 'flakes', 'wrap', 'active', 'ease', 'meta', 'stick', 'knob', 'veil', 'hud', 'show', 'drag', 'press']);
/** Shared textures the source paints at start-up (`tex.name = ...`), painted here on first use. */
const LAZY_TEXTURES = ['ground', 'bark', 'glow', 'marshPlank'];

/**
 * Statement runs cut from a world's build(k). `take` lists pieces in source order: a string is the start of one
 * statement or block; a pair is a range from the first anchor to the end of the line holding the second.
 * `env` names the build locals the caller supplies; `out` names what the recipe hands back.
 */
const RECIPES = [
  { name: 'seaRockKit', world: 'sea', env: [], out: ['seaRock', 'stGeo', 'hdGeo', 'rockMat', 'lG', 'lMat'],
    take: ['const seaRock = cragMat(', 'const stGeo = [cragGeo(1,', 'const hdGeo = [cragGeo(11,', 'const rockMat = cragMat({ grain:1.4', 'const lG = logGeo(5)'] },
  { name: 'arcticIceKit', world: 'arctic', env: [], out: ['iceM', 'iceRough', 'bergM', 'bergG', 'floeG', 'floeMat', 'stoneMat', 'woodMat', 'inG'],
    take: ['const iceM = iceMaterial(0.2)', 'const bergG = [seaBergGeo(11', 'const floeG = [floeGeo(1)', 'const stoneMat = plantMat({ wind:0, back:0, rock:true, map:tex.ground, roughness:0.9 });', 'stoneMat.userData.far.value = 1e6;',
      'const woodMat = new THREE.MeshStandardMaterial({ vertexColors:true, map:tex.bark, roughness:0.92 });', 'const inuk = [], inG = inukshukGeo(5);'] },
  { name: 'volcanoRockKit', world: 'volcano', env: [], out: ['basMat', 'colG', 'wallRock', 'crG', 'snagG', 'charMat'],
    take: ['const basMat = new THREE.MeshStandardMaterial(', 'const colG = [volcColonnadeGeo(11)', 'const wallRock = cragMat(', 'const crG = [cragGeo(71', 'const snagG = [snagGeo(5)'] },
  // Egypt: the stone materials, the pyramid table, the whole west-bank temple (quay, pylon with reliefs and colossi,
  // obelisks, ram-headed sphinx avenue, painted hypostyle hall, sanctuary) and the six mud-brick house variants.
  { name: 'egyptMonuments', world: 'egypt', env: ['group', 'cx', 'nw'], out: ['limeMat', 'sandMat', 'mudMat', 'glyMat', 'gold', 'granite', 'pyr', 'temple', 'torches', 'variants'],
    take: [['const grain = TEXCACHE.grain ??=', 'const plain = (c) =>'], 'const pyr = [ [-470,-700,140,90,3,1]', ['const zT=-300, temple=new THREE.Group();', 'const torches=[]; for (const [x,z] of'], 'const variants = [1,2,3,4,5,6].map(i => houseGeo(i*17))'] },
  // Haven: the eight sky islands with their rim and surface functions, the walkable-in-source sky bridge, hanging roots
  // and vines, then the marble and gold architecture (tholos, plaza, stair, pool, bridge, gate, spire, shrines).
  { name: 'havenArchipelago', world: 'haven', env: [], out: ['group', 'isl', 'heightAt', 'bridgeAt', 'onIsland', 'rings', 'marble', 'gold', 'islMat', 'M0', 'N0', 'P0', 'P1', 'BL', 'deck'],
    take: [['const isl = [ {x:0,z:-300,r:150', 'const onIsland = (x,z) =>'], 'const group = new THREE.Group(), R = rng(131);', 'const islandColor = (c, x, y, z, und', 'const islMat = terrainMaterial({ rock:[0.6,0.54,0.46]',
      'for (const I of isl){ const big = I.r > 100', '{ const b = geoBuf(), lb = geoBuf(), rr = rng(77)', ['const mt = marbleTex(), marble = new THREE.MeshStandardMaterial(', 'for (const I of [isl[2], isl[4]]){ const S = tholosGeo(']] },
  { name: 'canyonKit', world: 'canyon', env: [], out: ['bandC', 'colorAt', 'hooG', 'hooMat'],
    take: ['const bandC = (c, y) =>', 'const colorAt = y =>', 'const hooG = [canyonHoodooGeo(1)'] },
  { name: 'alpineKit', world: 'alpine', env: ['T'], out: ['bridgeMat', 'woodMat'],
    take: ['const bridgeMat = new THREE.MeshStandardMaterial({ vertexColors:true, map:tex.bark, roughness:0.85 })', 'const woodMat = new THREE.MeshStandardMaterial({ vertexColors:true, map:tex.bark, roughness:0.92 });'] },
  { name: 'marshKit', world: 'marsh', env: ['HUT'], out: ['hut', 'woodMat', 'kneeMat', 'punt'],
    take: ['const hut = new THREE.Mesh(marshHutGeo(),', 'const woodMat = new THREE.MeshStandardMaterial({ vertexColors:true, map:tex.bark, roughness:0.95 });', 'const kneeMat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.95 });', 'const punt = new THREE.Mesh(marshPuntGeo(), woodMat);'] },
  { name: 'forestLogKit', world: 'forest', env: [], out: ['logMat', 'logG'],
    take: ['const logMat = plantMat({ wind:0, back:0, rock:true, map:tex.bark, roughness:0.95 });', 'logMat.userData.far.value = 1e6;', 'const logG = [forestLogGeo(11, 16, 0.75, false)'] },
  { name: 'taigaKit', world: 'taiga', env: [], out: ['capU', 'capRock', 'capWood', 'logG', 'stG'],
    take: ['const capU = { value:0.4 }, capRock = taigaCapMat(', 'const logG = [taigaFallenGeo(1)'] },
  // Savanna: the granite kopjes are stacked block by block by the source's own loop, onto whatever ground it is given.
  { name: 'savannaKopjes', world: 'savanna', env: ['R', 'savannaKopjes', 'heightAt', 'group'], out: ['granite', 'kopG', 'kopL', 'moundG', 'moundMat'],
    take: [['const granite = cragMat({ grain:1.5, bump:0.9', 'kopG.forEach((g, i) => group.add(instTiled(g, granite, kopL[i]'], 'const moundG = [savannaMoundGeo(1321)', 'const moundMat = new THREE.MeshStandardMaterial({ vertexColors:true, map:tex.ground, roughness:0.95 });'] },
  { name: 'ruinsKit', world: 'ruins', env: ['PY'], out: ['U', 'masTx', 'masMat', 'grainMat', 'basMat', 'headG', 'heads'],
    take: ['const U = { uState:{ value:0 }', 'const masTx = masonryTex(\'ruinWall\'', 'const masMat = ruinStoneMat(masT,', 'const grainMat = ruinStoneMat(ruinGrainTex(),', 'const basMat = ruinStoneMat(ruinGrainTex(),', 'const headG = ruinHeadGeo(5), heads ='] },
  // Underwater: the sunken city, built block by block onto whatever ground it is given: a temple on a stepped platform
  // with its colonnade, lintels and cella, an arch gate, a paved avenue, roofless houses, a toppled head, a statue, amphorae.
  { name: 'sunkenCity', world: 'underwater', env: ['UX', 'UZ', 'UY', 'ground'], out: ['stoneTex', 'parts', 'stone', 'PY'],
    take: [['const stoneTex = masonryTex(\'deepStone\'', 'for (let i=0;i<26;i++){ const a = cR()*TAU, d = 30 + cR()*40']] },
  { name: 'villageMaterials', world: 'village', env: [], out: ['masonry', 'matOf'],
    take: [['const masonry = masonryTex(\'vilStone\'', 'ember:new THREE.MeshStandardMaterial({ vertexColors:true, color:0x1a0a04'], '};', 'matOf.glass = new THREE.MeshStandardMaterial('] },
];

// --- reading the source ------------------------------------------------------------------------------------
/** Index after the bracket closing the first `open` at or after `start`. Skips strings and comments. */
function balanced(start, open, close, text = html) {
  let depth = 0, quote = null;
  for (let i = text.indexOf(open, start); i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === '/' && next === '/') { i = text.indexOf('\n', i); continue; }
    if (ch === '/' && next === '*') { i = text.indexOf('*/', i) + 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return i + 1;
  }
  throw new Error(`Unbalanced ${open} from ${lineOf(start)}`);
}
/** Index after the first semicolon outside every bracket and string, from `start`. */
function statementEnd(start, text = html) {
  let depth = 0, quote = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === '/' && next === '/') { i = text.indexOf('\n', i); continue; }
    if (ch === '/' && next === '*') { i = text.indexOf('*/', i) + 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ';' && depth === 0) return i + 1;
  }
  throw new Error(`Statement from line ${lineOf(start)} has no end`);
}
/** Names declared by a top-level const/let statement (several may share one statement). */
function declaredNames(text) {
  const names = [], body = text.replace(/^(const|let) /, '');
  let depth = 0, quote = null, expect = true;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '/' && body[i + 1] === '/') { i = body.indexOf('\n', i); if (i < 0) break; continue; }
    if ('([{'.includes(ch)) {
      if (expect && depth === 0 && ch !== '(') { const end = balanced(i, ch, ch === '{' ? '}' : ']', body); for (const m of body.slice(i, end).matchAll(/\b([A-Za-z_$][\w$]*)\b(?!\s*:)/g)) names.push(m[1]); i = end - 1; expect = false; continue; }
      depth++; continue;
    }
    if (')]}'.includes(ch)) { depth--; continue; }
    if (depth === 0 && ch === ',') { expect = true; continue; }
    if (expect && /[A-Za-z_$]/.test(ch)) { const name = /^[\w$]+/.exec(body.slice(i))[0]; names.push(name); i += name.length - 1; expect = false; }
  }
  return names;
}
// Every top-level definition, by name. Start-up statements that finish a constant (a block or loop on the lines
// right after it, at column 0) travel with it.
const defs = new Map();
const withTail = (end) => { for (;;) { const rest = /^\n+(?=\{ |for \()/.exec(html.slice(end)); if (!rest) return end; const at = end + rest[0].length; end = html[at] === '{' ? balanced(at, '{', '}') : balanced(html.indexOf('{', balanced(at, '(', ')')), '{', '}'); } };
for (const match of html.matchAll(/^function (\w+)\(/gm)) defs.set(match[1], { at: match.index, end: balanced(html.indexOf('{', balanced(match.index, '(', ')')), '{', '}'), names: [match[1]] });
for (const match of html.matchAll(/^(?:const|let) /gm)) {
  const end = statementEnd(match.index), def = { at: match.index, end: withTail(end), names: declaredNames(html.slice(match.index, end)) };
  for (const name of def.names) if (!defs.has(name)) defs.set(name, def);
}

/** Text of one world's build(k) body. */
function buildBody(world) {
  const header = html.indexOf(`id:'${world}', label`);
  if (header < 0) throw new Error(`world ${world} not found`);
  const open = html.indexOf('{', html.indexOf('build(k)', header));
  return { start: open + 1, end: balanced(open, '{', '}') - 1 };
}
function recipeText(recipe) {
  const body = buildBody(recipe.world), pieces = [];
  let cursor = body.start;
  const find = (anchor) => { const at = html.indexOf(anchor, cursor); if (at < 0 || at > body.end) throw new Error(`${recipe.name}: "${anchor}" not found in ${recipe.world} build() after line ${lineOf(cursor)}`); return at; };
  for (const piece of recipe.take) {
    let at, end;
    if (Array.isArray(piece)) { at = find(piece[0]); cursor = at; const last = find(piece[1]); end = html.indexOf('\n', last); }
    else {
      at = find(piece);
      if (/^(const|let) /.test(piece) || /^[\w.$]+ = /.test(piece) || piece === '};') end = piece === '};' ? at + 2 : statementEnd(at);
      else if (piece.startsWith('{')) end = balanced(at, '{', '}');
      else end = balanced(html.indexOf('{', balanced(at, '(', ')')), '{', '}'); // for (...) { ... }
    }
    pieces.push(`  /* index.html:${lineOf(at)} */ ${html.slice(at, end).trim()}`);
    cursor = end;
  }
  return pieces.join('\n');
}

// --- gathering ---------------------------------------------------------------------------------------------
const recipes = RECIPES.map((recipe) => ({ ...recipe, text: recipeText(recipe) }));
const taken = new Set(), reason = new Map();
function need(name, from) {
  const def = defs.get(name);
  if (!def || taken.has(def) || PROVIDED.has(name) || NOT_REFERENCES.has(name)) return;
  taken.add(def); reason.set(def, from);
  for (const word of new Set(html.slice(def.at, def.end).match(/[A-Za-z_$][\w$]*/g))) need(word, def.names[0]);
}
for (const name of ROOTS) { if (!defs.has(name)) throw new Error(`${name} is not a top-level definition`); need(name, 'requested'); }
for (const recipe of recipes) for (const word of new Set(recipe.text.match(/[A-Za-z_$][\w$]*/g))) if (!recipe.env.includes(word)) need(word, recipe.name);
const ordered = [...taken].sort((a, b) => a.at - b.at);

const lazy = LAZY_TEXTURES.map((name) => {
  const match = new RegExp(`^tex\\.${name} = `, 'm').exec(html); if (!match) throw new Error(`tex.${name} not found`);
  const end = statementEnd(match.index);
  return `// --- tex.${name}, painted on first use (index.html:${lineOf(match.index)})\nlazyTexture('${name}', () => ${html.slice(match.index + match[0].length, end - 1)});`;
});

const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const exported = [...new Set([...ROOTS, 'VU', 'WIND', 'SU', 'TEXCACHE', 'rng', 'lin', 'perlin', 'fbm', 'hash2', 'boulderGeo', 'colored', 'worldUV', 'stripAttrs', 'vilFrame', 'vilHeight', 'savannaKopjes'])].filter((name) => taken.has(defs.get(name)));
const prelude = `// Generated by tools/extract-biome-landmarks.mjs from Biome Triad ${commit}. Do not edit.
// ${ordered.length} top-level definitions and ${recipes.length} build() recipes, copied verbatim from index.html: rock, ice, lava and
// masonry builders, monuments, houses, bridges, sky islands and the materials that shade them.
/* eslint-disable */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BIOME_LANDMARKS_COMMIT = '${commit}';
// Engine globals the copied code reads.
const Q = { density: 1, cardK: 0.6, seg: 1, water: 0 };
const MAX_ANISO = 4;
const tex = {}, OWNED = [];
function lazyTexture(name, paint) { let made; Object.defineProperty(tex, name, { get: () => (made ??= paint()), enumerable: true }); }
`;
const body = ordered.map((def) => `// --- ${def.names.join(', ')} (index.html:${lineOf(def.at)}; for ${reason.get(def)})\n${html.slice(def.at, def.end)}`).join('\n\n');
const recipeBlock = recipes.map((recipe) => `/** ${recipe.world} build(): ${recipe.out.join(', ')}. */\nfunction ${recipe.name}(${recipe.env.length ? `{ ${recipe.env.join(', ')} }` : ''}) {\n${recipe.text}\n  return { ${recipe.out.join(', ')} };\n}`).join('\n\n');
const target = join(repo, 'game/src/three/biome-landmarks.generated.js');
writeFileSync(target, `${prelude}\n${lazy.join('\n')}\n\n${body}\n\n// ===== Recipes: statement runs from each world's build(k) =====\n${recipeBlock}\n\nexport { ${exported.join(', ')}, tex, OWNED };\nexport const RECIPES = { ${recipes.map((recipe) => recipe.name).join(', ')} };\n`);
execFileSync(process.execPath, ['--check', target]);
if (process.argv.includes('--list')) for (const def of ordered) console.log(String(lineOf(def.at)).padStart(6), String(def.end - def.at).padStart(6), def.names.join(',').slice(0, 50).padEnd(50), '<-', reason.get(def));
console.log(commit, ordered.length, 'definitions', recipes.length, 'recipes', `${(readFileSync(target).length / 1024).toFixed(0)} kB`);
