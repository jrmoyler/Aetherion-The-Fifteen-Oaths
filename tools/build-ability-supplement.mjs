// Rebuilds shared/ability-supplement.json from an Ability-Matrix checkout.
// Usage: node tools/build-ability-supplement.mjs <path-to-Ability-Matrix> [--expansion]
// Every live castable that is not one of the 100 registry originals is copied with its catalog
// entry and full preset, pinned to the checkout's HEAD commit. Nothing is rewritten or invented here;
// gameplay scaling happens later in tools/generate-mmo-abilities.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const source = process.argv[2];
if (!source || !fs.existsSync(path.join(source, 'presets/catalog.json'))) throw new Error('Pass the Ability-Matrix checkout path');
const read = (p) => JSON.parse(fs.readFileSync(path.join(source, p), 'utf8'));
const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const registry = JSON.parse(fs.readFileSync(new URL('../CASTABLE_REGISTRY.json', import.meta.url)));
const originals = new Set(registry.castables.map((c) => c.sourceCatalog.uid));
const catalog = read('presets/catalog.json');
const castables = [];
for (const entry of catalog.abilities) {
  if (entry.status !== 'live' || !['ability', 'buff', 'summon'].includes(entry.kind) || originals.has(entry.uid)) continue;
  castables.push({ sourceCatalog: entry, sourcePreset: read(`presets/${entry.uid}.json`) });
}
if (process.argv.includes('--expansion')) {
  for (const entry of read('presets/expansion/catalog.json').abilities) {
    if (entry.status !== 'live') continue;
    castables.push({ sourceCatalog: entry, sourcePreset: read(`presets/expansion/${entry.uid.split('/')[1]}.json`) });
  }
}
const missing = registry.castables.filter((c) => !catalog.abilities.some((a) => a.uid === c.sourceCatalog.uid && a.status === 'live'));
if (missing.length) throw new Error(`Registry originals missing upstream: ${missing.map((c) => c.sourceCatalog.uid).join(', ')}`);
// Upstream later re-sorted some registry originals into the eight newer elements. The registry stays frozen;
// the current upstream element is recorded here so the game can show each castable's school.
const elementRevisions = {};
for (const c of registry.castables) {
  const now = catalog.abilities.find((a) => a.uid === c.sourceCatalog.uid).element;
  if (now !== c.sourceCatalog.element) elementRevisions[c.sourceCatalog.uid] = now;
}
const out = {
  format: 'aetherion-castable-supplement@2',
  sourceRepository: 'https://github.com/jrmoyler/Ability-Matrix',
  sourceCommit: commit,
  scope: 'Catalog entries and presets for every live castable beyond the 100 registry originals. The game runs the matching source classes from runtime/ability-matrix/packs/sandbox/src at the same commit.',
  elementRevisions,
  castables,
};
fs.writeFileSync(new URL('../shared/ability-supplement.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
const count = {};
for (const c of castables) count[c.sourceCatalog.element] = (count[c.sourceCatalog.element] ?? 0) + 1;
console.log(commit, castables.length, JSON.stringify(count));
