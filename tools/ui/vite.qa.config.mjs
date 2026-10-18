// QA dev server for the UI agent: same config as game/vite.config.js but without HMR/file watching,
// so screenshot runs aren't interrupted by other modules being edited in parallel.
// Usage (from game/): VITE_CACHE_DIR=node_modules/.vite-ui npx vite --config ../tools/ui/vite.qa.config.mjs --port 5105 --strictPort
import { fileURLToPath } from 'node:url';
import base from '../../game/vite.config.js';

export default {
  ...base,
  root: fileURLToPath(new URL('../../game', import.meta.url)),
  server: { ...base.server, hmr: false, watch: { ignored: ['**/*'] } },
};
