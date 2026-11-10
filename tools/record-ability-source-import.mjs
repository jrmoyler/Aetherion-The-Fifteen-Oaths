// Records which vendored sandbox files differ from the frozen 100-castable manifest after an upstream sync.
// Usage: node tools/record-ability-source-import.mjs <path-to-Ability-Matrix>
// Writes docs/upgrades/ability-source-import.json (upstream hashes at the checkout's HEAD) and refreshes the
// upstream side of docs/upgrades/source-integration-patches.json. A patched file must still differ from upstream
// for a stated reason; a patch that upstream has since absorbed is dropped from the record.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const source = process.argv[2];
const root = new URL('../', import.meta.url);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const manifest = JSON.parse(fs.readFileSync(new URL('CASTABLE_SOURCE_MANIFEST.json', root)));
const frozen = new Map(manifest.files.map((f) => [f.destinationPath, f.sha256]));
const prefix = 'runtime/ability-matrix/packs/sandbox/src';
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(path.join(source, 'packs/sandbox/src', dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) { walk(rel); continue; }
    const upstream = sha(fs.readFileSync(path.join(source, 'packs/sandbox/src', rel)));
    const dest = `${prefix}/${rel}`;
    if (frozen.get(dest) !== upstream) files.push({ path: dest, sha256: upstream });
  }
})('');
files.sort((a, b) => a.path.localeCompare(b.path));
fs.writeFileSync(new URL('docs/upgrades/ability-source-import.json', root),
  JSON.stringify({ repository: 'https://github.com/jrmoyler/Ability-Matrix', commit, files }, null, 1) + '\n');

const upgraded = new Map(files.map((f) => [f.path, f.sha256]));
const patchUrl = new URL('docs/upgrades/source-integration-patches.json', root);
const patches = JSON.parse(fs.readFileSync(patchUrl)).filter((patch) => {
  const local = sha(fs.readFileSync(new URL(patch.path, root)));
  const upstream = upgraded.get(patch.path) ?? frozen.get(patch.path);
  if (local === upstream) return false;
  patch.upstreamSHA256 = upstream; patch.sha256 = local; return true;
});
fs.writeFileSync(patchUrl, JSON.stringify(patches, null, 2) + '\n');
// Any vendored sandbox file that differs from upstream must be a recorded patch.
const recorded = new Set(patches.map((p) => p.path));
for (const f of files) {
  const local = sha(fs.readFileSync(new URL(f.path, root)));
  if (local !== f.sha256 && !recorded.has(f.path)) throw new Error(`Unrecorded local change: ${f.path}`);
}
console.log(commit, files.length, 'upgraded files;', patches.length, 'patches');
