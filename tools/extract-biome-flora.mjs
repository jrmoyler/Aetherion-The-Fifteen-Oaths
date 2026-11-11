// Lifts Biome Triad's procedural flora out of its single-file app into a module Aetherion can import.
//
// Nothing is rewritten: named functions, the leaf-atlas helpers and every defineSpecies(...) statement are copied
// character for character from index.html, in source order, behind a small prelude that supplies the handful
// of engine globals they read (quality, texture cache, anisotropy). Three bark textures are the one exception in
// form, not content: their painting expression is copied verbatim but runs on first use or only in a browser.
//
//   node tools/extract-biome-flora.mjs <biome-triad checkout>
//
// Output: game/src/three/biome-flora.generated.js
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node tools/extract-biome-flora.mjs <biome-triad checkout>');
const html = readFileSync(join(source, 'index.html'), 'utf8');
const lines = html.split('\n');

/** Text from `start` to the bracket that closes the first `open` found after it. Skips strings and comments. */
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
const offsetOfLine = (() => { const at = [0]; for (const line of lines) at.push(at[at.length - 1] + line.length + 1); return (n) => at[n]; })();
const lineOfOffset = (offset) => html.slice(0, offset).split('\n').length;

const chunks = []; // { at, text }
const take = (at, end, note) => chunks.push({ at, text: html.slice(at, end).replace(/^\s+/, ''), note });

// 1. Whole functions, wherever they are declared.
const FUNCTIONS = ['rng', 'grad', 'perlin', 'fbm', 'ridged', 'canvasTex', 'finishTex', 'sprayAtlas', 'geoBuf', 'geoFinish', 'tubeInto', 'genTree',
  'paintData', 'frondTexture', 'genPalm', 'boulderGeo', 'gbFinish', 'bladeClump', 'papyrusClump', 'fernPlant', 'broadleafPlant', 'cypressTree', 'taigaNeedleAtlas', 'taigaTwigAtlas', 'taigaSpruceGen'];
for (const name of FUNCTIONS) {
  const match = new RegExp(`^[ \\t]*function ${name}\\(`, 'm').exec(html);
  if (!match) throw new Error(`function ${name} not found`);
  const body = html.indexOf(')', match.index); // parameter lists here hold no nested parentheses beyond defaults handled below
  const open = html.indexOf('{', balanced(match.index + match[0].length - 1, '(', ')'));
  take(match.index, balanced(open, '{', '}'), `function ${name}`);
  void body;
}
// 2. Single-line constants the functions read.
for (const pattern of [/^const TAU = .*$/m, /^const clamp = .*$/m, /^const lerp = .*$/m, /^const smoothstep = .*$/m, /^const PERM = .*$/m, /^\{ const r = rng\(7\).*$/m,
  /^const fade = .*$/m, /^const V3 = .*$/m, /^const lin = .*$/m, /^const gb = .*$/m]) {
  const match = pattern.exec(html); if (!match) throw new Error(`constant not found: ${pattern}`);
  take(match.index, match.index + match[0].length, 'constant');
}
// The two shared bark textures are painted on a canvas. The source paints them at start-up; here the same
// expression runs on first use, so the module can be imported where there is no canvas (tests, the server).
for (const name of ['bark', 'palmBark']) {
  const match = new RegExp(`^tex\\.${name} = (canvasTex.*);$`, 'm').exec(html); if (!match) throw new Error(`tex.${name} not found`);
  chunks.push({ at: match.index, text: `lazyTexture('${name}', () => ${match[1]});`, note: `bark texture tex.${name}, deferred` });
}
// 3. Leaf atlases and bark textures the species name, then the species themselves.
for (const match of html.matchAll(/^[ \t]*const (\w+) = \(\) => atlas\(.*$/gm)) take(match.index, match.index + match[0].length, `atlas ${match[1]}`);
{
  const match = /^[ \t]*const needles = \(\) => ATLAS\.taigaNeedles.*$/m.exec(html); if (!match) throw new Error('taiga needle atlases not found');
  take(match.index, match.index + match[0].length, 'taiga leaf atlases');
  // Birch bark is painted where it is declared; guard that one line so a canvas is only needed in a browser.
  const birch = /^[ \t]*const birchBark = (TEXCACHE\.taigaBirch.*);$/m.exec(html); if (!birch) throw new Error('birch bark not found');
  chunks.push({ at: birch.index, text: `const birchBark = typeof document === 'undefined' ? null : (${birch[1]});`, note: 'taiga birch bark, guarded' });
}
const speciesKeys = [];
for (const match of html.matchAll(/^[ \t]*defineSpecies\('(\w+)'/gm)) {
  const end = balanced(match.index, '(', ')');
  speciesKeys.push(match[1]);
  // Each definition stands alone: one that names something outside this extract is skipped, not fatal.
  chunks.push({ at: match.index, text: `try { ${html.slice(match.index, end).replace(/^\s+/, '')}; } catch (error) { SKIPPED['${match[1]}'] = error.message; }`, note: `species ${match[1]}` });
}

chunks.sort((a, b) => a.at - b.at);
const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const prelude = `// Generated by tools/extract-biome-flora.mjs from Biome Triad ${commit}. Do not edit.
// Procedural trees, palms, leaf atlases, boulders and ${speciesKeys.length} species, copied verbatim from index.html.
/* eslint-disable */
import * as THREE from 'three';

export const BIOME_FLORA_COMMIT = '${commit}';
// Engine globals the copied code reads.
const Q = { cardK: 0.6 };
const MAX_ANISO = 4;
const tex = {}, ATLAS = {}, TEXCACHE = {}, SPECIES_DEF = {}, SKIPPED = {}, OWNED = [];
const atlas = (key, seed, o) => (ATLAS[key] ??= sprayAtlas(seed, o));
function defineSpecies(key, def) { SPECIES_DEF[key] = def; }
function lazyTexture(name, paint) { let made; Object.defineProperty(tex, name, { get: () => (made ??= paint()), enumerable: true }); }
/** Leaf-card density for trees generated after this call (the source's quality setting). */
export function setCardDensity(value) { Q.cardK = value; }
`;
const body = chunks.map((chunk) => `// --- ${chunk.note} (index.html:${lineOfOffset(chunk.at)})\n${chunk.text}`).join('\n\n');
const exportsBlock = `
export { SPECIES_DEF, SKIPPED, genTree, genPalm, boulderGeo, bladeClump, papyrusClump, fernPlant, broadleafPlant, lin, sprayAtlas, tex };
`;
// 4. Each world's air: fog density and tint, ground bounce colour and what falls from the sky.
const worlds = {};
for (const match of html.matchAll(/^Helios\.registerBiome\(\{\s*\n\s*id:'(\w+)', label:'([^']+)'/gm)) {
  const head = html.slice(match.index, html.indexOf('build(k){', match.index));
  const numbers = (text) => text.split(',').map(Number);
  const fog = /fog:\{ density:([\d.]+), tint:\[([^\]]+)\]/.exec(head), ground = /ground:\[([^\]]+)\]/.exec(head), precip = /precip:\{ kind:'(\w+)'/.exec(head);
  if (!fog || !ground) throw new Error(`world ${match[1]} has no fog or ground line`);
  // The bedrock colour each world gives its terrain shader (sRGB), where it names one.
  const body = html.slice(match.index, html.indexOf('\nHelios.registerBiome(', match.index + 10) > 0 ? html.indexOf('\nHelios.registerBiome(', match.index + 10) : html.length);
  const rock = /detail:\{ rock:\[([^\]]+)\]/.exec(body);
  worlds[match[1]] = { label: match[2], fog: { density: Number(fog[1]), tint: numbers(fog[2]) }, ground: numbers(ground[1]), rock: rock ? numbers(rock[1]) : null, precip: precip?.[1] ?? 'none' };
}
writeFileSync(join(repo, 'game/src/three/biome-worlds.generated.js'),
  `// Generated by tools/extract-biome-flora.mjs from Biome Triad ${commit}. Do not edit.\n`
  + `// The air of each Biome Triad world, read from its registerBiome header in index.html.\n`
  + `export const BIOME_WORLDS_COMMIT = '${commit}';\nexport const BIOME_WORLDS = ${JSON.stringify(worlds, null, 1)};\n`);

const target = join(repo, 'game/src/three/biome-flora.generated.js');
writeFileSync(target, `${prelude}\n${body}\n${exportsBlock}`);
execFileSync(process.execPath, ['--check', target]);
console.log(commit, FUNCTIONS.length, 'functions', speciesKeys.length, 'species', Object.keys(worlds).length, 'worlds', `${(readFileSync(target).length / 1024).toFixed(0)} kB`);
void offsetOfLine;
