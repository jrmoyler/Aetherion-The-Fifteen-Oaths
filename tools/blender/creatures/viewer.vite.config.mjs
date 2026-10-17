// Creature-forge QA dev server: serves game/ with Babylon NOT prebundled so the static page
// game/public/assets/creatures/viewer.html can import core + glTF loader as one module graph.
//   cd game && npx vite --config ../tools/blender/creatures/viewer.vite.config.mjs
//   open http://localhost:5108/assets/creatures/viewer.html[?id=hound&clip=attack]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const game = path.resolve(here, '../../../game');
export default {
  root: game,
  cacheDir: path.join(game, 'node_modules/.vite-creature2'),
  optimizeDeps: { noDiscovery: true, include: [], exclude: ['@babylonjs/core', '@babylonjs/loaders', '@babylonjs/materials'] },
  server: { port: 5108, strictPort: true },
};
