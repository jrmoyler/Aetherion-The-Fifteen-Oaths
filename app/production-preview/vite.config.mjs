import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./', import.meta.url));
const assets = path.resolve(fileURLToPath(new URL('../../assets/production/', import.meta.url)));
const outDir = path.join(root, 'dist');
function discover(directory, relative = '') {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) return discover(path.join(directory, entry.name), name);
    return entry.isFile() && entry.name === 'manifest.json' ? [name] : [];
  }).sort();
}
const catalog = () => ({ manifests: discover(assets) });
export default {
  root, base: './', publicDir: false,
  server: { host: '127.0.0.1', port: 5174, fs: { allow: [root, assets] } },
  build: { outDir, target: 'es2022', sourcemap: true },
  plugins: [{
    name: 'local-production-assets',
    configureServer(server) {
      server.middlewares.use('/production-assets', (req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; res.end(); return; }
        let pathname;
        try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
        catch { res.statusCode = 400; res.end(); return; }
        if (pathname === '/catalog.json') {
          res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
          res.end(req.method === 'HEAD' ? undefined : JSON.stringify(catalog())); return;
        }
        const target = path.resolve(assets, `.${pathname}`);
        if (!target.startsWith(assets + path.sep) || !fs.existsSync(target)) { res.statusCode = 404; res.end(); return; }
        const real = fs.realpathSync(target);
        if (!real.startsWith(fs.realpathSync(assets) + path.sep) || !fs.statSync(real).isFile()) { res.statusCode = 404; res.end(); return; }
        const types = { '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
        res.setHeader('Content-Type', types[path.extname(real)] || 'application/octet-stream');
        res.setHeader('Content-Length', fs.statSync(real).size);
        if (req.method === 'HEAD') { res.end(); return; }
        const stream = fs.createReadStream(real); stream.on('error', next); stream.pipe(res);
      });
    },
    closeBundle() {
      const destination = path.join(outDir, 'production-assets');
      fs.mkdirSync(destination, { recursive: true });
      for (const manifest of catalog().manifests) {
        const folder = path.dirname(manifest);
        fs.cpSync(path.join(assets, folder), path.join(destination, folder), { recursive: true, dereference: false });
      }
      fs.writeFileSync(path.join(destination, 'catalog.json'), JSON.stringify(catalog(), null, 2));
    }
  }]
};
