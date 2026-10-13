// Guards the one-sandbox structure:
//   - the five source packs are vendored into the sandbox byte-for-byte
//   - every catalog entry and preset for a source pack matches that pack's own settings.js
//   - every native sandbox ability has a catalog entry and preset
//   - every castable is sorted into exactly one element
//   - each pack's files match the recorded snapshot (tests/fixtures/original-inventory.json)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const baseline = json('tests/fixtures/original-inventory.json');
const catalog = json('presets/catalog.json');
const library = json('presets/library.json');
const SOURCE_PACKS = ['linear', 'linear-ext', 'linear-extended', 'handcast', 'casting'];
const NATIVE_PACKS = ['collective', 'matrix-new', 'atlas', 'codex'];

function filesUnder(dir, skip = ['node_modules', 'dist', '.git']) {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    if (skip.includes(entry.name)) return [];
    const file = `${dir}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(file, skip) : [file];
  });
}

for (const pack of SOURCE_PACKS) {
  test(`${pack}: vendored into the sandbox byte-for-byte`, () => {
    // The sandbox copies the pack's live source; its archive (unreachable from
    // the pack's own app) and the matrix bridge are the only things left out.
    const source = filesUnder(`packs/${pack}/src`, ['archive', 'bridge']).map((f) => f.slice(`packs/${pack}/src/`.length)).sort();
    const vendored = filesUnder(`packs/sandbox/src/vendor/${pack}`).map((f) => f.slice(`packs/sandbox/src/vendor/${pack}/`.length)).sort();
    assert.deepEqual(vendored, source);
    for (const file of source) assert.ok(read(`packs/${pack}/src/${file}`).equals(read(`packs/sandbox/src/vendor/${pack}/${file}`)), file);
  });

  test(`${pack}: catalog and presets match the pack's own settings`, async () => {
    const cfg = await import(pathToFileURL(path.join(root, `packs/${pack}/src/config/settings.js`)).href);
    const entries = catalog.abilities.filter((a) => a.pack === pack && a.status === 'live');
    const ids = entries.filter((a) => a.kind !== 'buff').map((a) => a.id);
    assert.deepEqual(ids, cfg.ELEMENTS);
    for (const entry of entries) {
      const file = json(`presets/${pack}/${entry.id}.json`);
      assert.deepEqual(file.settings, JSON.parse(JSON.stringify(cfg.DEFAULT_SETTINGS[entry.id])), entry.uid);
      assert.deepEqual(library.presets[entry.uid], file, entry.uid);
    }
  });
}

test('every native sandbox ability is catalogued with a preset', async () => {
  const { NATIVE_GROUPS } = await import(pathToFileURL(path.join(root, 'packs/sandbox/src/config/sandbox.js')).href);
  assert.deepEqual(NATIVE_GROUPS.map((g) => g.pack), NATIVE_PACKS);
  for (const group of NATIVE_GROUPS) {
    const ids = catalog.abilities.filter((a) => a.pack === group.pack && a.status === 'live').map((a) => a.id);
    assert.deepEqual(ids, group.ids, group.pack);
    for (const id of group.ids) assert.ok(existsSync(path.join(root, `presets/${group.pack}/${id}.json`)), `${group.pack}/${id}`);
  }
});

test('the sandbox hosts 100 castable abilities with unique uids', () => {
  const castable = catalog.abilities.filter((a) => a.status === 'live' && ['ability', 'summon', 'buff'].includes(a.kind));
  assert.equal(castable.length, 100);
  assert.equal(catalog.abilities.filter((a) => a.pack === 'codex').length, 22);
  assert.equal(new Set(catalog.abilities.map((a) => a.uid)).size, catalog.abilities.length);
  assert.equal(catalog.abilities.filter((a) => a.status === 'archived').length, 7);
});

test('every castable belongs to exactly one known element', async () => {
  const { ELEMENT_GROUPS, ELEMENT_OF } = await import(pathToFileURL(path.join(root, 'packs/sandbox/src/config/elements.js')).href);
  const known = new Set(ELEMENT_GROUPS.map((e) => e.id));
  assert.equal(known.size, ELEMENT_GROUPS.length);
  const castable = catalog.abilities.filter((a) => a.status === 'live' && ['ability', 'summon', 'buff'].includes(a.kind));
  for (const a of castable) {
    assert.ok(known.has(a.element), `${a.uid} has element ${a.element}`);
    assert.equal(a.element, ELEMENT_OF[a.uid], a.uid);
  }
  // The map lists nothing that is not castable.
  assert.deepEqual(Object.keys(ELEMENT_OF).sort(), castable.map((a) => a.uid).sort());
  // The catalog's element list is the display order, with live counts that add up.
  assert.deepEqual(catalog.elements.map((e) => e.id), ELEMENT_GROUPS.map((e) => e.id));
  assert.equal(catalog.elements.reduce((n, e) => n + e.count, 0), castable.length);
  for (const e of catalog.elements) assert.ok(e.count >= 4, `${e.id} has only ${e.count}`);
});

test('codex abilities carry their element in their own meta, matching the map', async () => {
  const { CODEX_META } = await import(pathToFileURL(path.join(root, 'packs/sandbox/src/config/codex/index.js')).href);
  const { ELEMENT_OF } = await import(pathToFileURL(path.join(root, 'packs/sandbox/src/config/elements.js')).href);
  for (const [id, meta] of Object.entries(CODEX_META)) assert.equal(meta.element, ELEMENT_OF[`codex/${id}`], id);
});

test('movement settings ship in the shared preset block', () => {
  const shared = json('presets/codex/_shared.json');
  for (const key of ['walkSpeed', 'runSpeed', 'dashDistance', 'stride', 'legSwing', 'armSwing']) assert.equal(typeof shared.move[key], 'number', key);
});

test('the five portable Atlas prototype modules are unchanged', () => {
  for (const [name, expected] of Object.entries(baseline.atlasSource)) {
    assert.equal(hash(read(name === 'runtime.js' ? 'presets/runtime.js' : `presets/new/${name}`)), expected, name);
  }
});

for (const [pack, expected] of Object.entries(baseline.packs)) {
  test(`${pack}: pack files match the recorded snapshot`, () => {
    const files = filesUnder(`packs/${pack}`).sort();
    const digest = createHash('sha256');
    for (const file of files) digest.update(file).update('\0').update(read(file)).update('\0');
    assert.equal(files.length, expected.count);
    assert.equal(digest.digest('hex'), expected.sha256);
  });
}
