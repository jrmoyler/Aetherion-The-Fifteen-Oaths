// Lifts Biome Triad's ground shader, its water and every world's ground settings into a module Aetherion can import.
//
// Nothing is rewritten. Copied character for character from index.html:
//   - terrainMaterial(d) with the GLSL it concatenates (NOISE2D, SURF_GLSL) and the uniform tables it reads (WIND, VU, SU),
//   - makeWater(...) and the two shared textures (tex.ground, tex.waterNormals; painted on first use, not at import),
//   - per world: the `detail` object, the `color` and `kind` functions given to makeTerrain, and every makeWater call.
// A world's colour function closes over names defined earlier in its build(k); that part of build() is copied in front
// of it (the "prefix"), and whatever the prefix names at the top level of index.html is pulled in on demand, the same
// way tools/import-biome-terrain.mjs resolves height code. Engine objects the ground does not need (scene, renderer,
// mesh builders) are answered by an inert stand-in.
//
//   node tools/extract-biome-ground.mjs <biome-triad checkout>      (run from game/, where three is installed)
//
// Output: game/src/three/biome-ground.generated.js
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node tools/extract-biome-ground.mjs <biome-triad checkout>');
const html = readFileSync(join(source, 'index.html'), 'utf8');
const THREE = await import(pathToFileURL(createRequire(join(repo, 'game/package.json')).resolve('three')).href);

// Where each realm's relief window sits in its world (the table of tools/import-biome-terrain.mjs): the ground is
// coloured at the same world position its landforms were sampled from.
const RELIEF_WINDOW = {
  volcanic: ['volcano', 0, -1250, 2600], glacial: ['arctic', 0, -1100, 2600], alpine: ['alpine', 0, -900, 2600], coast: ['sea', -150, -900, 2400],
  canyon: ['canyon', 0, -300, 1800], cliffs: ['village', 420, -520, 1800], forest: ['forest', 0, -300, 1800], marsh: ['marsh', 0, -300, 1600],
  meadow: ['village', 0, -150, 1800], highland: ['taiga', 0, -500, 2200], badlands: ['egypt', -150, -500, 2400], crimson: ['ruins', 260, -620, 1500],
  terraces: ['ruins', 0, -300, 1800], plateau: ['savanna', 0, -250, 2200], industrial: ['urban', 0, -100, 1200],
};
// Worlds whose colour function needs nothing from build(): their prefix (a whole city, for urban) is left behind.
const NO_PREFIX = new Set(['urban']);
// Top-level names that are engine state or mesh builders, never ground maths: always the inert stand-in.
const ENGINE = new Set(['QUALITY', 'qKey', 'Q', 'renderer', 'scene', 'camera', 'tex', 'kit', 'Helios', 'U', 'MAX_ANISO', 'makeTerrain', 'makeApron', 'makeWater',
  'terrainMaterial', 'plantMat', 'instTiled', 'flora', 'canvasTex', 'finishTex', 'waters', 'OWNED', 'group', 'composer', 'sky', 'sun', 'hemi', 'BIOMES', 'TEXCACHE', 'ATLAS',
  'scatter', 'lavaMaterial', 'Water', 'Sky', 'controls', 'state', 'ui', 'VU', 'SU', 'WIND', 'mergeGeometries', 'genTree', 'genPalm', 'boulderGeo', 'sprayAtlas']);

// --- reading the source ----------------------------------------------------------------------------------
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
  throw new Error(`Unbalanced ${open}`);
}
function statementEnd(start, text) {
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
  throw new Error('Statement has no end');
}
/** Source of a top-level definition by name, or null. */
function topLevel(name) {
  const fn = new RegExp(`^function ${name}\\(`, 'm').exec(html);
  if (fn) return html.slice(fn.index, balanced(html.indexOf('{', balanced(fn.index, '(', ')')), '{', '}'));
  const constant = new RegExp(`^(?:const|let) ${name} = `, 'm').exec(html);
  if (constant) return html.slice(constant.index, statementEnd(constant.index, html));
  const shared = new RegExp(`^(?:const|let) [^\\n;]*?\\b${name} = `, 'm').exec(html);
  if (shared) return html.slice(shared.index, statementEnd(shared.index, html));
  return null;
}
/** Top-level properties of an object literal's text, as { name: valueText }. Values are copied untouched. */
function properties(literal) {
  const out = {}, text = literal.trim().replace(/^\{/, '').replace(/\}$/, '');
  let depth = 0, quote = null, start = 0;
  const push = (end) => { const part = text.slice(start, end).replace(/^(\s*\/\/[^\n]*\n)+/, ''), colon = part.indexOf(':'); if (colon > 0) out[part.slice(0, colon).trim()] = part.slice(colon + 1).trim(); start = end + 1; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === '/' && next === '/') { i = text.indexOf('\n', i); if (i < 0) break; continue; }
    if (ch === '/' && next === '*') { i = text.indexOf('*/', i) + 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) push(i);
  }
  push(text.length);
  return out;
}
const lineOf = (offset) => html.slice(0, offset).split('\n').length;

// --- the worlds ------------------------------------------------------------------------------------------
const worlds = [];
for (const match of html.matchAll(/^Helios\.registerBiome\(\{\s*\n\s*id:'(\w+)', label:'([^']+)'/gm)) {
  const id = match[1], open = html.indexOf('{', html.indexOf('build(k)', match.index)), end = balanced(open, '{', '}');
  const body = html.slice(open + 1, end - 1), at = (i) => open + 1 + i;
  const world = { id, label: match[2], waters: [] };
  const call = /\bmakeTerrain\(/.exec(body);
  if (call) {
    const args = body.slice(body.indexOf('(', call.index) + 1, balanced(call.index, '(', ')', body) - 1), props = properties(args);
    world.line = lineOf(at(call.index));
    world.detail = props.detail ?? '{}'; world.color = props.color ?? null; world.kind = props.kind ?? null;
    world.prefix = NO_PREFIX.has(id) ? '' : body.slice(0, body.lastIndexOf('\n', call.index));
  } else {
    // No makeTerrain: the world shapes its own ground meshes and only names the shader settings.
    const material = /\bterrainMaterial\(/.exec(body);
    if (!material) continue;
    world.line = lineOf(at(material.index));
    world.detail = body.slice(body.indexOf('(', material.index) + 1, balanced(material.index, '(', ')', body) - 1); world.color = world.kind = null; world.prefix = '';
  }
  for (const water of body.matchAll(/\bmakeWater\(/g)) {
    const props = properties(body.slice(body.indexOf('(', water.index) + 1, balanced(water.index, '(', ')', body) - 1));
    // Only the look is taken (colour, distortion, wave scale, alpha); size and position belong to the source world.
    const look = ['color', 'distortion', 'scale', 'alpha'].filter((key) => props[key] != null && /^[\w.]+$/.test(props[key])).map((key) => `${key}:${props[key]}`);
    world.waters.push(`{ ${look.join(', ')}, size:${/^[\d.]+$/.test(props.size ?? '') ? props.size : 0} }`);
  }
  worlds.push(world);
}

// --- resolving what the colour code names ----------------------------------------------------------------
const inert = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => 0 : key === Symbol.iterator ? function* () {} : inert, apply: () => inert, construct: () => inert, set: () => true });
const context2d = new Proxy({}, { get: (_, key) => /ImageData$/.test(String(key)) ? (...args) => ({ data: new Uint8ClampedArray(Math.max(4, (args.at(-2) | 0) * (args.at(-1) | 0) * 4)) }) : () => context2d, set: () => true });
const fakeDocument = { createElement: () => ({ width: 0, height: 0, getContext: () => context2d, style: {} }), getElementById: () => inert, querySelector: () => inert };

const shared = new Map(); // name -> source text (real definition) or an inert constant
const base = ['TAU', 'clamp', 'lerp', 'smoothstep', 'rng', 'PERM', 'fade', 'grad', 'perlin', 'fbm', 'ridged', 'V3', 'hash2', 'srgb', 'lin', 'noise'];
for (const name of base) { const text = topLevel(name); if (!text) throw new Error(`${name} not found`); shared.set(name, text); }
shared.set('PERM', `${topLevel('PERM')}\n${/^\{ const r = rng\(7\).*$/m.exec(html)[0]}`);
const position = (text) => { const i = html.indexOf(text.split('\n')[0]); return i < 0 ? -1 : i; };
const sharedSource = () => [...shared.entries()].sort((p, q) => position(p[1]) - position(q[1])).map(([, text]) => text).join('\n');
const KIT = `new Proxy({ THREE, noise, rng, smoothstep, lerp, clamp, srgb, lin, Q: { density: 1, seg: 1, cardK: 1 } }, { get: (target, key) => key in target ? target[key] : INERT })`;
const painter = (world) => `(k, document, window) => {\n${world.prefix}\nreturn { color: ${world.color}, kind: ${world.kind ?? 'null'} };\n}`;

const windowsOf = (id) => Object.values(RELIEF_WINDOW).filter((w) => w[0] === id);
for (const world of worlds) {
  if (!world.color) continue;
  const windows = windowsOf(world.id).length ? windowsOf(world.id) : [[world.id, 0, -300, 1800]];
  for (let attempt = 0; ; attempt++) {
    if (attempt > 80) throw new Error(`${world.id}: too many unresolved names`);
    try {
      const paint = new Function('THREE', 'INERT', `${sharedSource()}\nconst k = ${KIT};\nreturn (${painter(world)})(k, DOCUMENT, INERT);`.replace('DOCUMENT', 'arguments[2]'))(THREE, inert, fakeDocument);
      // Names used only inside the colour code surface when it runs: walk each window at every height band and slope.
      const c = new THREE.Color(); let dark = 0, count = 0;
      for (const [, cx, cz, span] of windows) for (let j = 0; j <= 20; j++) for (let i = 0; i <= 20; i++) for (const y of [-30, -1, .2, 1, 3, 8, 30, 100, 400, 900]) for (const ny of [.5, .95]) {
        const x = cx + (i / 20 - .5) * span * 1.5, z = cz + (j / 20 - .5) * span * 1.5;
        c.setRGB(0, 0, 0); paint.color(c, x, y, z, ny); if (paint.kind) paint.kind(x, y, z, ny);
        if (!Number.isFinite(c.r + c.g + c.b)) throw new Error(`colour is not finite at ${x},${y},${z}`);
        count++; if (c.r + c.g + c.b === 0) dark++;
      }
      if (dark === count) throw new Error('colour function never wrote a colour');
      break;
    } catch (error) {
      const missing = /^(\w+) is not defined$/.exec(error.message)?.[1];
      if (!(error instanceof ReferenceError) || !missing || shared.has(missing)) throw new Error(`${world.id}: ${error.message}`);
      const real = ENGINE.has(missing) ? null : topLevel(missing);
      shared.set(missing, real ?? `const ${missing} = INERT;`);
      world.resolved = [...(world.resolved ?? []), `${missing}${real ? '' : ' (inert)'}`];
    }
  }
}

// --- the shader, the water and what they read -----------------------------------------------------------
const need = (text, what) => { if (!text) throw new Error(`${what} not found`); return text; };
const line = (pattern, what) => need(pattern.exec(html)?.[0], what);
const noise2d = need(topLevel('NOISE2D'), 'NOISE2D');
const surfBlock = (() => { const start = html.indexOf('const SURF_N = '), end = html.indexOf('function terrainMaterial('); if (start < 0 || end < start) throw new Error('surface uniforms not found'); return html.slice(start, end).trim(); })();
const terrainMaterial = need(topLevel('terrainMaterial'), 'terrainMaterial'), makeWater = need(topLevel('makeWater'), 'makeWater');
const canvasTex = need(topLevel('canvasTex'), 'canvasTex'), finishTex = need(topLevel('finishTex'), 'finishTex');
const wind = line(/^const WIND = .*$/m, 'WIND'), vu = need(topLevel('VU'), 'VU');
const groundTex = need(/^tex\.ground = (canvasTex.*);$/m.exec(html)?.[1], 'tex.ground');
const normalsTex = (() => { const start = html.indexOf('tex.waterNormals = '); if (start < 0) throw new Error('tex.waterNormals not found'); return html.slice(start + 'tex.waterNormals = '.length, statementEnd(start, html) - 1); })();

const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const realEngine = `// Generated by tools/extract-biome-ground.mjs from Biome Triad ${commit}. Do not edit.
// The ground shader (terrainMaterial), the water (makeWater) and each world's ground settings, colour and kind
// functions, copied verbatim from index.html. Hand-written placement lives in realmGround.js.
/* eslint-disable */
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

export const BIOME_GROUND_COMMIT = '${commit}';
// Engine globals the copied code reads. Q.water is the reflection target size (0: no reflection pass).
const Q = { water: 0 };
const MAX_ANISO = 4;
const tex = {};
function lazyTexture(name, paint) { let made; Object.defineProperty(tex, name, { get: () => typeof document === 'undefined' ? null : (made ??= paint()), enumerable: true }); }
/** Size of the water reflection target for water made after this call (the source's quality setting; 0 turns the pass off). */
export function setWaterReflection(size) { Q.water = size; }
// Stand-in for engine objects a world's build() touches on its way to the ground code (scene, meshes, textures).
const INERT = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => 0 : key === Symbol.iterator ? function* () {} : INERT, apply: () => INERT, construct: () => INERT, set: () => true });
const CONTEXT2D = new Proxy({}, { get: (_, key) => /ImageData$/.test(String(key)) ? (...args) => ({ data: new Uint8ClampedArray(Math.max(4, (args.at(-2) | 0) * (args.at(-1) | 0) * 4)) }) : () => CONTEXT2D, set: () => true });
const DOCUMENT = { createElement: () => ({ width: 0, height: 0, getContext: () => CONTEXT2D, style: {} }), getElementById: () => INERT, querySelector: () => INERT };
`;
const section = (note, text) => `// --- ${note}\n${text}\n`;
const inOrder = (keep) => [...shared.entries()].filter(([name]) => keep(name)).sort((p, q) => position(p[1]) - position(q[1])).map(([, text]) => text).join('\n');
const isBase = (name) => base.includes(name);
const indent = (text) => text.split('\n').map((row) => `  ${row}`).join('\n');
const out = [realEngine,
  section('noise and colour helpers (index.html, source order)', inOrder(isBase)),
  section(`canvas textures (index.html:${lineOf(html.indexOf('function canvasTex('))})`, `${canvasTex}\n${finishTex}`),
  section('tex.ground and tex.waterNormals: the source paints them at start-up; here the same expressions run on first use', `lazyTexture('ground', () => ${groundTex});\nlazyTexture('waterNormals', () => ${normalsTex});`),
  section(`uniform tables (index.html:${lineOf(html.indexOf(wind))}, ${lineOf(html.indexOf(vu))})`, `${wind}\n${vu}`),
  section(`shader noise (index.html:${lineOf(html.indexOf(noise2d))})`, noise2d),
  section(`surface state window and SURF_GLSL (index.html:${lineOf(html.indexOf('const SURF_N = '))})`, surfBlock),
  section(`terrainMaterial (index.html:${lineOf(html.indexOf(terrainMaterial))})`, terrainMaterial),
  section(`makeWater (index.html:${lineOf(html.indexOf(makeWater))})`, `const waters = [];\n${makeWater}`),
  '// --- each world\'s ground painter. Inside this scope the engine names a build() touches are the inert stand-in, exactly as when',
  '//     the tool resolved them; the other definitions are the top-level ground code the worlds name (index.html, source order).',
  'const WORLD_PAINT = (() => {',
  indent(inOrder((name) => !isBase(name))),
  `  const KIT = ${KIT};`,
  '  return {',
  ...worlds.filter((world) => world.color).map((world) => `    // ${world.label} (index.html:${world.line})\n    ${world.id}: () => (${painter(world)})(KIT, DOCUMENT, INERT),`),
  '  };',
  '})();',
  '/** Per world: `detail` (terrainMaterial settings), `waters` (the look of each makeWater call) and `paint()`, which runs the part of',
  ' *  the world\'s build() that precedes its terrain and returns its { color(c, x, y, z, ny), kind(x, y, z, ny) }. */',
  'export const WORLD_GROUND = {',
  ...worlds.map((world) => `  ${world.id}: { label: '${world.label}', detail: ${world.detail}, waters: [${world.waters.join(', ')}], paint: ${world.color ? `WORLD_PAINT.${world.id}` : 'null'} },`),
  '};',
  `/** Where each realm's relief window sits in its world: [world, centre x, centre z, span in metres] (tools/import-biome-terrain.mjs). */\nexport const RELIEF_WINDOW = ${JSON.stringify(RELIEF_WINDOW)};`,
  'export { terrainMaterial, makeWater, waters, tex, WIND, VU, SU, NOISE2D, SURF_GLSL };', ''].join('\n');

const target = join(repo, 'game/src/three/biome-ground.generated.js');
writeFileSync(target, out);
execFileSync(process.execPath, ['--check', target]);
for (const world of worlds) console.log(world.id.padEnd(11), world.color ? 'colour' : 'detail only', world.kind ? '+kind' : '', `${world.waters.length} water`, world.resolved?.length ? `| ${world.resolved.join(', ')}` : '');
console.log(commit, worlds.length, 'worlds', `${(out.length / 1024).toFixed(0)} kB`);
