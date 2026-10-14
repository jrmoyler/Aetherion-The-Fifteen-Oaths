import fs from 'node:fs';
import path from 'node:path';
export function productionAssetsPlugin({ repositoryRoot, outDir }) {
  const assets = path.join(repositoryRoot, 'assets/production');
  function discover(dir, relative = '') {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? discover(path.join(dir, e.name), path.posix.join(relative, e.name)) : e.isFile() && e.name === 'manifest.json' ? [path.posix.join(relative, e.name)] : []).sort();
  }
  const catalog = () => ({ manifests: discover(assets) });
  return {
    name: 'aetherion-equipment-assets',
    configureServer(server) {
      server.middlewares.use('/production-assets', (req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; res.end(); return; }
        let name; try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.statusCode = 400; res.end(); return; }
        if (name === '/catalog.json') { res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(req.method === 'HEAD' ? undefined : JSON.stringify(catalog())); return; }
        const requested = path.resolve(assets, `.${name}`);
        if (!requested.startsWith(assets + path.sep) || !fs.existsSync(requested)) { res.statusCode = 404; res.end(); return; }
        const real = fs.realpathSync(requested);
        if (!real.startsWith(fs.realpathSync(assets) + path.sep) || !fs.statSync(real).isFile() || !['.json', '.glb'].includes(path.extname(real))) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Type', real.endsWith('.glb') ? 'model/gltf-binary' : 'application/json');
        if (req.method === 'HEAD') { res.end(); return; }
        fs.createReadStream(real).on('error', next).pipe(res);
      });
    },
    closeBundle() {
      const destination = path.join(outDir, 'production-assets'); fs.mkdirSync(destination, { recursive: true });
      const copy = (dir, target) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const source = path.join(dir, e.name), output = path.join(target, e.name);
          if (e.isDirectory()) { fs.mkdirSync(output, { recursive: true }); copy(source, output); }
          else if (e.isFile() && (e.name.endsWith('.glb') || e.name === 'manifest.json')) fs.copyFileSync(source, output);
        }
      };
      if (fs.existsSync(assets)) copy(assets, destination);
      fs.writeFileSync(path.join(destination, 'catalog.json'), JSON.stringify(catalog(), null, 2));
    },
  };
}
