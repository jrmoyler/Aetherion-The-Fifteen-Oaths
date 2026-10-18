// Dev-server config for the actors harness: the shared config without HMR (modules still invalidate on change),
// so edits by other modules do not reload pages mid-capture.
//   cd game && npx vite --config src/actors/vite.dev.config.js --port 5103
import { mergeConfig } from 'vite';
import base from '../../vite.config.js';

export default mergeConfig(base, {
  plugins: [],
  server: { hmr: false },
});
