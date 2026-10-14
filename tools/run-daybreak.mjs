/** Use the pinned runtime's Vite installation; do not install or alter source. */
import { createServer, build, preview } from '../runtime/ability-matrix/node_modules/vite/dist/node/index.js';
import config from '../app/daybreak/vite.config.mjs';
const [mode = 'dev', ...args] = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex < 0 ? undefined : Number(args[portIndex + 1]);
if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new TypeError('Invalid --port');
const options = { ...config, configFile: false };
if (mode === 'build') {
  await build(options);
} else if (mode === 'dev') {
  const server = await createServer({ ...options, server: { ...config.server, ...(port ? { port } : {}) } });
  await server.listen(); server.printUrls();
} else if (mode === 'preview') {
  const server = await preview({ ...options, preview: { host: '127.0.0.1', ...(port ? { port } : {}) } });
  server.printUrls();
} else {
  throw new RangeError(`Unknown mode ${mode}; use dev, build or preview`);
}
