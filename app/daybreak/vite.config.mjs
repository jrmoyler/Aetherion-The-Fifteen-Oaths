import { fileURLToPath } from 'node:url';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import manifest from './assets.json' with { type: 'json' };
const root = fileURLToPath(new URL('../../', import.meta.url));
const outDir = fileURLToPath(new URL('../../dist/daybreak/', import.meta.url));
export async function checkedAsset(asset) {
  const bytes = await readFile(new URL(`../../${asset.source}`, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Daybreak asset checksum mismatch: ${asset.source}`);
  return bytes;
}
export default {
  root: fileURLToPath(new URL('./', import.meta.url)), base: './',
  resolve: { alias: [{ find: /^three$/, replacement: `${root}runtime/ability-matrix/node_modules/three/build/three.module.js` }, { find: /^three\/addons\//, replacement: `${root}runtime/ability-matrix/node_modules/three/examples/jsm/` }], dedupe: ['three'] },
  publicDir: `${root}runtime/ability-matrix/packs/sandbox/public`,
  server: { host: '127.0.0.1', port: 5174, open: false, fs: { allow: [root] } },
  build: { emptyOutDir: true, target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 2000, outDir },
  assetsInclude: ['**/*.fbx', '**/*.glb', '**/*.hdr'],
  plugins: [{
    name: 'daybreak-selected-assets',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const asset = manifest.assets.find(entry => `/daybreak-assets/${entry.file}` === req.url?.split('?')[0]);
        if (!asset) return next();
        try { res.setHeader('Content-Type', 'model/gltf-binary'); res.end(await checkedAsset(asset)); }
        catch (error) { next(error); }
      });
    },
    async closeBundle() {
      await mkdir(`${outDir}/daybreak-assets`, { recursive: true });
      for (const asset of manifest.assets) {
        await checkedAsset(asset);
        await copyFile(`${root}${asset.source}`, `${outDir}/daybreak-assets/${asset.file}`);
      }
    }
  }]
};
