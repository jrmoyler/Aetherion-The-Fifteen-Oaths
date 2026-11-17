// Usage: node tools/qa/roster-browser.mjs <output-dir> [oath-01-ninja ...]
// PLAYWRIGHT_EXECUTABLE_PATH may point to a system Chromium. Install game deps first.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../game/node_modules/playwright/index.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const requireGame = createRequire(new URL('../../game/package.json', import.meta.url));
const out = process.argv[2];
if (!out) throw new Error('Pass a directory for the review images and metrics');
await mkdir(out, { recursive: true });
const assets = path.join(root, 'game/public/assets/');
const manifest = JSON.parse(await readFile(path.join(assets, 'characters/manifest.json')));
const ids = process.argv.length > 3 ? process.argv.slice(3) : manifest.map(hero => hero.id);
const bundle = await requireGame('esbuild').build({
  entryPoints: [fileURLToPath(new URL('./roster-stage.mjs', import.meta.url))],
  bundle: true, write: false, format: 'esm',
  alias: { '@shared': path.join(root, 'shared') }, nodePaths: [path.join(root, 'game/node_modules')],
});
const mime = { '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><meta charset="utf-8"><script type="module" src="/stage.js"></script>');
    return;
  }
  if (pathname === '/stage.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(bundle.outputFiles[0].contents);
    return;
  }
  if (!pathname.startsWith('/assets/')) { res.writeHead(404).end(); return; }
  const file = path.resolve(assets, '.' + pathname.slice('/assets'.length));
  if (file.startsWith(assets) && (await stat(file).catch(() => null))?.isFile()) {
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } else res.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const rows = [], errors = [];
try {
  let page;
  for (const [index, id] of ids.entries()) {
    // Release the GLB loader and GPU caches periodically when running with software GL.
    if (index % 5 === 0) {
      await browser?.close();
      browser = await chromium.launch({
        headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      page = await browser.newPage({ viewport: { width: 360, height: 440 } });
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => {
        if (m.type() === 'error' || (m.type() === 'warning' && /failed|binding|not found|unavailable/i.test(m.text()))) errors.push(m.text());
      });
      await page.goto('http://127.0.0.1:' + server.address().port);
      await page.waitForFunction(() => !!window.checkHero);
    }
    assert(manifest.some(entry => entry.id === id), 'Unknown roster identity: ' + id);
    const { metrics, image } = await page.evaluate(id => window.checkHero(id), id);
    assert(metrics.fingerJoints >= 30 && metrics.joints >= 53 && metrics.maxFingerRotationDegrees > .5, id + ' finger rig');
    assert(metrics.blendedVertices > 0 && metrics.largestWeightError < .012, id + ' skin weights');
    assert(metrics.sampledVertices > 0 && metrics.maxVertexTravel > .015, id + ' posed deformation');
    rows.push(metrics);
    await writeFile(path.join(out, id + '-action.jpg'), Buffer.from(image, 'base64'));
    console.log(id, metrics.joints, 'joints,', metrics.maxFingerRotationDegrees, 'degrees of finger movement');
  }
  await writeFile(path.join(out, 'roster-validation.json'), JSON.stringify({ rows, errors }, null, 2) + '\n');
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
