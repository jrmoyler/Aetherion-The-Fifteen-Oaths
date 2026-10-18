// Collider audit runner (Node, headless — no browser/GPU needed).
//   node tools/qa/collision-audit.mjs [oath-14 oath-07 ...] [--out tools/qa/collision-audit.json]
// Loads game/src/architecture/audit.js through Vite's SSR loader (resolves the @shared alias),
// generates each sanctuary into a fresh CollisionWorld, and compares the walkable surfaces of
// the built geometry with collision.groundAt / solid colliders. Prints a table and writes JSON.
// Exit code 1 if any sanctuary has more than --max m² (default 1) of uncovered reachable walkway.
import { createServer } from '../../game/node_modules/vite/dist/node/index.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../game');
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const out = path.resolve(process.cwd(), flag('--out', path.join(here, 'collision-audit.json')));
const maxUncovered = +flag('--max', 1);
const ids = args.filter((a) => a.startsWith('oath-'));

const server = await createServer({ root, configFile: path.join(root, 'vite.config.js'), logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { runAudit } = await server.ssrLoadModule('/src/architecture/audit.js');
  const t0 = Date.now();
  const results = runAudit(ids.length ? ids : null);
  const pad = (s, n) => String(s).padEnd(n), num = (v, n) => String(v).padStart(n);
  console.log(`${pad('sanctuary', 26)}${num('walk m²', 9)}${num('uncov m²', 10)}${num('solidOnly', 10)}${num('wallGap', 9)}${num('unreachDeck', 12)}${num('colliders', 10)}${num('ms', 7)}`);
  for (const r of results) console.log(`${pad(`${r.id} ${r.name}`.slice(0, 25), 26)}${num(r.walkElevated.toFixed(0), 9)}${num(r.uncovered.toFixed(1), 10)}${num(r.solidOnly.toFixed(1), 10)}${num(r.wallGap.toFixed(1), 9)}${num(r.unreachableDeckArea.toFixed(0), 12)}${num(r.colliders, 10)}${num(r.ms, 7)}`);
  const tot = (k) => results.reduce((a, r) => a + r[k], 0);
  console.log(`${pad('TOTAL', 26)}${num(tot('walkElevated').toFixed(0), 9)}${num(tot('uncovered').toFixed(1), 10)}${num(tot('solidOnly').toFixed(1), 10)}${num(tot('wallGap').toFixed(1), 9)}${num(tot('unreachableDeckArea').toFixed(0), 12)}${num(tot('colliders'), 10)}${num(Date.now() - t0, 7)}`);
  for (const r of results) {
    if (r.clusters.uncovered.length) console.log(`  ${r.id} uncovered:`, r.clusters.uncovered.slice(0, 5).map((c) => `${c.area}m² @local(${c.local}) y=${c.y} size=${c.size}`).join(' | '));
    if (r.clusters.solidOnly.length) console.log(`  ${r.id} solidOnly:`, r.clusters.solidOnly.slice(0, 5).map((c) => `${c.area}m² @local(${c.local}) y=${c.y} size=${c.size}`).join(' | '));
    if (r.clusters.wall.length) console.log(`  ${r.id} wall:`, r.clusters.wall.slice(0, 4).map((c) => `${c.area}m² @local(${c.local}) y=${c.y}`).join(' | '));
  }
  // one line per sanctuary keeps the committed report diffable
  writeFileSync(out, `{"generated":"${new Date().toISOString()}","cell":0.4,"units":"m2 (areas), local = sanctuary frame","results":[\n${results.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
  console.log('wrote', path.relative(process.cwd(), out));
  process.exitCode = results.some((r) => r.uncovered > maxUncovered) ? 1 : 0;
} finally {
  await server.close();
}
