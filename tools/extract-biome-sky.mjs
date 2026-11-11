// Lifts Biome Triad's sky dressing out of its single-file app into a module Aetherion can import.
//
// Nothing is rewritten. Copied character for character from index.html:
//   - the "Sky dressing" engine block: the raymarched cloud slab and cirrus deck (uniforms, material, dome),
//     stars, moon, rain streaks and the snow / ash / mote flakes;
//   - auroraMesh(), the arctic world's aurora curtains;
//   - the per-frame lines of updateAtmosphere() that drive them (Preetham parameters, cloud uniforms, stars,
//     moon, flakes, rain, lightning, wind clock).
// The copies sit inside one factory so they run when the game asks for a sky, not at import, and so the
// engine globals they read (scene, VU, S, Q, active, activeDef) are supplied by the caller.
// Each world's clouds / sky / precip header blocks, and the precipitation variants its build() switches
// between, are evaluated and written out as data.
//
//   node tools/extract-biome-sky.mjs <biome-triad checkout>
//
// Output: game/src/three/biome-sky.generated.js
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Usage: node tools/extract-biome-sky.mjs <biome-triad checkout>');
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
const lineOf = (offset) => html.slice(0, offset).split('\n').length;
const must = (pattern, what) => { const match = pattern.exec(html); if (!match) throw new Error(`${what} not found`); return match; };
const lineAt = (pattern, what) => { const match = must(pattern, what); return { at: match.index, text: match[0].replace(/^\s+/, ''), note: what }; };
/** Everything from the line matching `first` to the end of the line matching `last`. */
function span(first, last, what) {
  const a = must(first, `${what} (start)`), tail = new RegExp(last.source, last.flags.replace('g', '') + 'g');
  tail.lastIndex = a.index; const b = tail.exec(html); if (!b) throw new Error(`${what} (end) not found`);
  return { at: a.index, text: html.slice(a.index, b.index + b[0].length), note: what };
}

// ---- 1. Engine code, in source order -------------------------------------------------------------------
const setup = [
  lineAt(/^const TAU = .*$/m, 'constant TAU'),
  lineAt(/^const clamp = .*$/m, 'constant clamp'),
  lineAt(/^const lerp = .*$/m, 'constant lerp'),
  lineAt(/^const smoothstep = .*$/m, 'constant smoothstep'),
  (() => { const m = must(/^function rng\(/m, 'function rng'); return { at: m.index, text: html.slice(m.index, balanced(html.indexOf('{', m.index), '{', '}')), note: 'function rng' }; })(),
  lineAt(/^function finishTex\(.*$/m, 'function finishTex'),
  lineAt(/^tex\.glow = .*$/m, 'moon / glow sprite texture'),
  lineAt(/^const WIND = .*$/m, 'wind clock uniform (the aurora animates on it)'),
  span(/^\/\* -+ Sky dressing: clouds, stars, moon, rain -+ \*\/$/m, /^const wrap = .*$/m, 'sky dressing: volumetric clouds, cirrus, stars, moon, rain streaks, flakes'),
  (() => { const m = must(/^\/\* Aurora:.*\*\/\nfunction auroraMesh\(\)/m, 'auroraMesh'); return { at: m.index, text: html.slice(m.index, balanced(html.indexOf('{', m.index + m[0].length - 2), '{', '}')), note: 'aurora curtains (arctic world)' }; })(),
  lineAt(/^const _sunDir = new THREE\.Vector3\(\), _moonDir = .*$/m, 'atmosphere scratch vectors'),
].sort((a, b) => a.at - b.at);

const frame = [
  lineAt(/^  const day = smoothstep\(-0\.06, 0\.18, el\), golden = .*$/m, 'day / golden / night from sun elevation'),
  span(/^  const u = sky\.material\.uniforms, sp = activeDef\.sky;$/m, /^  u\.mieCoefficient\.value = .*$/m, 'Preetham parameters from the world, pushed toward overcast by rain'),
  span(/^  \/\/ Light: sun by day, moon by night$/m, /^  VU\.uHemiSky\.value\.copy\(hemi\.color\).*$/m, 'the light the clouds read: sun by day, moon by night, sky and ground bounce'),
  span(/^  \/\/ Clouds, stars, moon, rain$/m, /^  WIND\.value\.set\(S\.time, .*$/m, 'clouds, stars, moon, flakes, rain, lightning, wind clock'),
].sort((a, b) => a.at - b.at);
for (const chunk of frame) chunk.text = chunk.text.replace(/^ {2}/gm, '    ');

// ---- 2. World data ---------------------------------------------------------------------------------------
const literal = (text) => Function(`"use strict"; return (${text});`)();
const cloudDefault = literal(must(/^const CLOUD_DEFAULT = (\{.*\});$/m, 'CLOUD_DEFAULT')[1]);
const steps = {};
for (const match of html.matchAll(/^  (\w+):\s+\{ label:'(\w+)',.*\bcloud:(\d+),.*$/gm)) steps[match[1]] = Number(match[3]);
if (!steps.fast || !steps.balanced || !steps.ultra) throw new Error('quality presets (cloud march steps) not found');

const worlds = {};
const heads = [...html.matchAll(/^Helios\.registerBiome\(\{\s*\n\s*id:'(\w+)', label:'([^']+)'/gm)];
heads.forEach((match, index) => {
  const buildAt = html.indexOf('build(k){', match.index), end = heads[index + 1]?.index ?? html.length;
  const block = (key) => {
    const at = html.slice(match.index, buildAt).search(new RegExp(`^  ${key}:\\{`, 'm'));
    if (at < 0) return null;
    const open = html.indexOf('{', match.index + at);
    return literal(html.slice(open, balanced(open, '{', '}')));
  };
  const clouds = block('clouds'), sky = block('sky');
  if (!clouds || !sky) throw new Error(`world ${match[1]} declares no clouds or sky`);
  // Named precipitation objects the world's build() swaps in as its weather changes (blizzard, sleet, dust storm).
  const variants = {};
  for (const variant of html.slice(buildAt, end).matchAll(/\b(\w+) = (\{ kind:'(?:snow|ash|motes|dust|none)'[^{}]*\})/g)) variants[variant[1]] = literal(variant[2]);
  worlds[match[1]] = { label: match[2], clouds, sky, precip: block('precip'), variants };
});

// ---- 3. Write ----------------------------------------------------------------------------------------------
const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const show = (chunks, indent) => chunks.map((chunk) => `${indent}// --- ${chunk.note} (index.html:${lineOf(chunk.at)})\n${chunk.text}`).join('\n\n');
const target = join(repo, 'game/src/three/biome-sky.generated.js');
writeFileSync(target, `// Generated by tools/extract-biome-sky.mjs from Biome Triad ${commit}. Do not edit.
// Volumetric clouds, cirrus, stars, moon, rain, flakes and aurora copied verbatim from index.html, plus each
// world's clouds / sky / precip settings as data.
/* eslint-disable */
import * as THREE from 'three';

export const BIOME_SKY_COMMIT = '${commit}';
/** The source's fallback for a world that leaves a cloud field out. */
export const BIOME_CLOUD_DEFAULT = ${JSON.stringify(cloudDefault)};
/** Cloud march steps per source quality preset (Q.cloud). */
export const BIOME_CLOUD_STEPS = ${JSON.stringify(steps)};
/** clouds / sky / precip as each world declares them in its registerBiome header; variants are the
 *  precipitation objects its build() switches to. */
export const BIOME_SKY = ${JSON.stringify(worlds, null, 1)};

/**
 * Builds the source's sky dressing into \`scene\`. Needs a document (two small canvas textures).
 * VU carries the light the clouds read: uSunDir, uSunCol, uHemiSky, uHemiGround ({ value }).
 */
export function createBiomeSky({ scene, VU, MAX_ANISO = 1 }) {
const tex = {}, OWNED = [];

${show(setup, '')}

  /**
   * One frame of the source's updateAtmosphere(), sky dressing only. \`sunDir\` is the unit vector to the sun and
   * \`el\` its elevation in radians; \`sun\` and \`hemi\` receive the source's light model ({ color, intensity } and
   * { color, groundColor, intensity }); S is the viewer ({ pos, time, flash, nextFlash }), Q the quality ({ cloud }),
   * active / activeDef the world ({ precip, windK } / { sky, ground, precip }), rainK and fogK the weather.
   */
  function update({ sky, sun, hemi, S, Q, active, activeDef, dt, sunDir, el, rainK, fogK }) {
    _sunDir.copy(sunDir);
${show(frame, '    ')}
    return { day, golden, night, useSun };
  }
  return { CL, cloudState, cloudMat, clouds, stars, moon, rain, flakes, auroraMesh, WIND, OWNED, tex, sunDir: _sunDir, moonDir: _moonDir, update };
}
`);
execFileSync(process.execPath, ['--check', target]);
console.log(commit, Object.keys(worlds).length, 'worlds', setup.length + frame.length, 'code blocks', `${(readFileSync(target).length / 1024).toFixed(0)} kB`);
