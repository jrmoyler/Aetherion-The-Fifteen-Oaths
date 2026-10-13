import { fileURLToPath } from 'node:url';
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
export default {
  root: fileURLToPath(new URL('./', import.meta.url)),
  base: './',
  publicDir: fileURLToPath(new URL('../../runtime/ability-matrix/packs/sandbox/public/', import.meta.url)),
  server: { host: '127.0.0.1', port: 5173, open: false, fs: { allow: [repositoryRoot] } },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 2000, outDir: fileURLToPath(new URL('../../dist/abilities/', import.meta.url)) },
  assetsInclude: ['**/*.fbx', '**/*.glb', '**/*.hdr']
};
