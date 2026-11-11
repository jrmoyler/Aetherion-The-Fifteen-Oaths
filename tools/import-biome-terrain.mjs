// Bakes Biome Triad terrain into relief grids the shared simulation can read.
//
// Every Biome Triad world computes its ground with its own code inside build(). This tool runs that code as it
// stands (the build body is cut right after the height function is defined, and anything it names is pulled from
// index.html on demand), samples a window of the world around its centre, and stores the result as a normalised
// relief grid per realm. The game then shapes each realm with its world's landforms while keeping its own
// elevation budget, sanctuary plazas, roads and coastline.
//
//   node tools/import-biome-terrain.mjs <biome-triad checkout>      (run from game/, where three is installed,
//                                                                    or with NODE_PATH pointing at it)
// Output: shared/biome-relief.generated.js
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node tools/import-biome-terrain.mjs <biome-triad checkout>');
const html = readFileSync(join(source, 'index.html'), 'utf8');
const { BIOMES } = await import(pathToFileURL(join(repo, 'shared/terrain.js')).href);
const THREE = await import(pathToFileURL(createRequire(join(repo, 'game/package.json')).resolve('three')).href);

// Realm biome -> the world whose ground it takes, the symbol that computes that ground, and the window sampled.
// `at` is the window centre in the world's own coordinates; `span` is the window's width there in metres. Every
// window lands on a realm window of REALM_SPAN metres, so span / REALM_SPAN is the scale the landforms are shown at.
const REALM_SPAN = 1800, CELLS = 128;
const REALMS = {
  volcanic: { world: 'volcano', symbol: 'heightAt', at: [0, -1250], span: 2600 },
  glacial: { world: 'arctic', symbol: 'heightAt', at: [0, -1100], span: 2600 },
  alpine: { world: 'alpine', expression: 'alpineT.heightAt', at: [0, -900], span: 2600 },
  coast: { world: 'sea', symbol: 'heightAt', at: [-150, -900], span: 2400 },
  canyon: { world: 'canyon', expression: 'canyonShape().terrainH', at: [0, -300], span: 1800 },
  cliffs: { world: 'village', expression: 'vilHeight', at: [420, -520], span: 1800 },
  forest: { world: 'forest', symbol: 'ground0', at: [0, -300], span: 1800 },
  marsh: { world: 'marsh', symbol: 'meshH', at: [0, -300], span: 1600 },
  meadow: { world: 'village', expression: 'vilHeight', at: [0, -150], span: 1800 },
  highland: { world: 'taiga', symbol: 'ground', at: [0, -500], span: 2200 },
  badlands: { world: 'egypt', symbol: 'heightAt0', at: [-150, -500], span: 2400 },
  crimson: { world: 'ruins', symbol: 'ground', at: [260, -620], span: 1500 },
  terraces: { world: 'ruins', symbol: 'ground', at: [0, -300], span: 1800 },
  plateau: { world: 'savanna', expression: 'savannaHeight', at: [0, -250], span: 2200 },
  industrial: { world: 'urban', symbol: 'groundAt', at: [0, -100], span: 1200 },
};

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
/** End of the statement starting at `start`: the first semicolon outside every bracket and string. */
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
  const shared = new RegExp(`^(?:const|let) [^\\n;]*?\\b${name} = `, 'm').exec(html); // one of several names on a line
  if (shared) return html.slice(shared.index, statementEnd(shared.index, html));
  return null;
}
/** Body of a world's build(k), cut right after the statement or function that defines `symbol`. */
function buildUpTo(world, symbol) {
  const header = html.indexOf(`id:'${world}', label`);
  if (header < 0) throw new Error(`world ${world} not found`);
  const open = html.indexOf('{', html.indexOf('build(k)', header)), end = balanced(open, '{', '}');
  const body = html.slice(open + 1, end - 1);
  if (!symbol) return '';
  const fn = new RegExp(`\\n\\s*function ${symbol}\\(`).exec(body);
  if (fn) return body.slice(0, balanced(body.indexOf('{', balanced(fn.index, '(', ')', body)), '{', '}', body));
  const assign = new RegExp(`[ ,]${symbol} = `).exec(body);
  if (!assign) throw new Error(`${world}: ${symbol} is not defined in build()`);
  return body.slice(0, statementEnd(assign.index, body));
}

// --- running it ------------------------------------------------------------------------------------------
// Anything the ground code does not need (meshes, textures, scatter) is answered by an inert stand-in.
const inert = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => 0 : key === Symbol.iterator ? function* () {} : inert, apply: () => inert, construct: () => inert, set: () => true });
const context2d = new Proxy({}, { get: (_, key) => /ImageData$/.test(String(key)) ? (...args) => ({ data: new Uint8ClampedArray(Math.max(4, (args.at(-2) | 0) * (args.at(-1) | 0) * 4)) }) : () => context2d, set: () => true });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => context2d, style: {} }), getElementById: () => inert, querySelector: () => inert };

function heightFunction(config) {
  const prelude = new Map();
  const base = ['TAU', 'clamp', 'lerp', 'smoothstep', 'rng', 'PERM', 'fade', 'grad', 'perlin', 'fbm', 'ridged', 'V3'];
  for (const name of base) prelude.set(name, topLevel(name));
  prelude.set('PERM', `${topLevel('PERM')}\n${/^\{ const r = rng\(7\).*$/m.exec(html)[0]}`);
  // Engine state the ground code may glance at; none of it shapes the ground.
  prelude.set('Q', 'const Q = { density: 1, seg: 1, cardK: 1, ext: 170, cards: 90, lod: 150 };');
  for (const name of ['QUALITY', 'qKey', 'renderer', 'scene', 'camera', 'tex', 'kit', 'Helios', 'U', 'MAX_ANISO']) prelude.set(name, `const ${name} = INERT;`);
  const body = buildUpTo(config.world, config.symbol);
  // Definitions keep the order they have in the source, so one that reads another finds it initialised.
  const ordered = () => [...prelude.values()].sort((p, q) => (html.indexOf(p) < 0 ? -1 : html.indexOf(p)) - (html.indexOf(q) < 0 ? -1 : html.indexOf(q))).join('\n');
  const result = config.expression ?? config.symbol;
  for (let attempt = 0; attempt < 60; attempt++) {
    const code = `${ordered()}\nconst k = new Proxy({ THREE, noise: { fbm, ridged, perlin }, rng, smoothstep, lerp, clamp, Q: { density: 1, seg: 1, cardK: 1 } }, { get: (target, key) => key in target ? target[key] : INERT });\nreturn (function (k) {\n${body}\nreturn ${result};\n})(k);`;
    try {
      const heightAt = new Function('THREE', 'INERT', code)(THREE, inert);
      // Names used only inside the height code surface when it runs, so walk the window once before accepting it.
      for (let j = 0; j <= 12; j++) for (let i = 0; i <= 12; i++) heightAt(config.at[0] + (i / 12 - .5) * config.span, config.at[1] + (j / 12 - .5) * config.span);
      return heightAt;
    }
    catch (error) {
      const missing = /^(\w+) is not defined$/.exec(error.message)?.[1];
      if (!(error instanceof ReferenceError) || !missing || prelude.has(missing)) throw new Error(`${config.world}: ${error.message}`);
      prelude.set(missing, topLevel(missing) ?? `const ${missing} = INERT;`);
    }
  }
  throw new Error(`${config.world}: too many unresolved names`);
}

const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const functions = new Map(), realms = {};
for (const [biome, config] of Object.entries(REALMS)) {
  const key = `${config.world}:${config.expression ?? config.symbol}`;
  if (!functions.has(key)) functions.set(key, heightFunction(config));
  const heightAt = functions.get(key), heights = new Float64Array(CELLS * CELLS), step = config.span / (CELLS - 1);
  for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) {
    const h = Number(heightAt(config.at[0] - config.span / 2 + i * step, config.at[1] - config.span / 2 + j * step));
    if (!Number.isFinite(h)) throw new Error(`${biome}: ${config.world} gave no height at cell ${i},${j}`);
    heights[j * CELLS + i] = h;
  }
  // Normalise around the window's median so each realm keeps its own base height and relief budget:
  // +1 is the 95th-percentile rise above the median, -1 the 5th-percentile drop. Extremes are eased, not cut.
  const sorted = Float64Array.from(heights).sort(), at = (q) => sorted[Math.floor(q * (sorted.length - 1))];
  // Never exaggerate: where the source is flatter than the realm's relief budget, a metre there stays a metre here.
  const median = at(.5), reach = Math.max(at(.95) - median, median - at(.05), BIOMES[biome].amp);
  const cells = new Int16Array(CELLS * CELLS);
  for (let n = 0; n < cells.length; n++) {
    const r = (heights[n] - median) / reach, eased = r > 1 ? 1 + Math.tanh((r - 1) * .6) * .9 : r < -1 ? -1 - Math.tanh((-r - 1) * .6) * .5 : r;
    cells[n] = Math.round(eased * 8192);
  }
  realms[biome] = { world: config.world, span: config.span, sourceMin: +sorted[0].toFixed(1), sourceMedian: +median.toFixed(1), sourceMax: +sorted.at(-1).toFixed(1), reach: +reach.toFixed(1), data: Buffer.from(cells.buffer).toString('base64') };
  console.log(biome.padEnd(11), config.world.padEnd(8), `source ${sorted[0].toFixed(0)}..${sorted.at(-1).toFixed(0)} m, median ${median.toFixed(1)}, reach ${reach.toFixed(1)}`);
}

writeFileSync(join(repo, 'shared/biome-relief.generated.js'),
  `// Generated by tools/import-biome-terrain.mjs from Biome Triad ${commit}. Do not edit.\n`
  + `// Each realm's landforms, sampled from its Biome Triad world's own height code: a ${CELLS}x${CELLS} grid over ${REALM_SPAN} m,\n`
  + `// little-endian Int16, 8192 = one unit of relief (see the tool for the normalisation).\n`
  + `export const BIOME_RELIEF_COMMIT = '${commit}';\nexport const BIOME_RELIEF_CELLS = ${CELLS};\nexport const BIOME_RELIEF_SPAN = ${REALM_SPAN};\n`
  + `export const BIOME_RELIEF = ${JSON.stringify(realms, null, 1)};\n`);
console.log(Object.keys(realms).length, 'realms', `${(readFileSync(join(repo, 'shared/biome-relief.generated.js')).length / 1e6).toFixed(2)} MB`);
