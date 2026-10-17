// Static file serving for the built client (game/dist): MIME types (incl. .webmanifest/.glb/.wasm),
// cached brotli/gzip for text assets, ETags, long-lived caching for hashed assets, SPA fallback.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.xml': 'application/xml',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.webmanifest', '.svg', '.txt', '.wasm', '.gltf', '.xml', '.bin', '.glb']);
const HASHED = /[-.][A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;
const NO_CACHE = new Set(['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest']);

export function createStatic(root) {
  root = path.resolve(root);
  const zcache = new Map(); // abs path -> {mtime, size, br?: Promise<Buffer>, gz?: Promise<Buffer>}

  function resolve(urlPath) {
    let p;
    try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
    if (p.includes('\0')) return null;
    const abs = path.resolve(root, '.' + path.posix.normalize('/' + p));
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;
    return abs;
  }

  function statFile(abs) {
    try { const st = fs.statSync(abs); if (st.isDirectory()) return statFile(path.join(abs, 'index.html')); return st.isFile() ? { abs, st } : null; } catch { return null; }
  }

  function compressed(abs, st, enc) {
    let c = zcache.get(abs);
    if (!c || c.mtime !== st.mtimeMs || c.size !== st.size) { c = { mtime: st.mtimeMs, size: st.size }; zcache.set(abs, c); }
    if (!c[enc]) {
      c[enc] = fs.promises.readFile(abs).then((buf) => (enc === 'br'
        ? brotli(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: buf.length > 2e6 ? 5 : 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } })
        : gzip(buf, { level: 7 })));
      c[enc].catch(() => { delete c[enc]; });
    }
    return c[enc];
  }

  /** Handles GET/HEAD for static files. Returns false when nothing matched (caller 404s). */
  async function serve(req, res) {
    const url = req.url || '/';
    let abs = resolve(url);
    if (!abs) { res.writeHead(400).end('bad path'); return true; }
    let f = statFile(abs);
    if (!f) {
      // SPA fallback for extension-less routes
      if (path.extname(url.split('?')[0]) === '') f = statFile(path.join(root, 'index.html'));
      if (!f) return false;
    }
    abs = f.abs;
    const st = f.st;
    const ext = path.extname(abs).toLowerCase();
    const base = path.basename(abs);
    const type = MIME[ext] ?? 'application/octet-stream';
    const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const headers = {
      'Content-Type': type,
      ETag: etag,
      'Cache-Control': NO_CACHE.has(base) || ext === '.html' ? 'no-cache' : HASHED.test(base) && url.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Accept-Encoding',
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return true; }
    const ae = String(req.headers['accept-encoding'] || '');
    let enc = null;
    if (COMPRESSIBLE.has(ext) && st.size > 1024) enc = /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gz' : null;
    if (enc) {
      try {
        const buf = await compressed(abs, st, enc);
        headers['Content-Encoding'] = enc === 'br' ? 'br' : 'gzip';
        headers['Content-Length'] = buf.length;
        res.writeHead(200, headers);
        res.end(req.method === 'HEAD' ? undefined : buf);
        return true;
      } catch { /* fall through to identity */ }
      delete headers['Content-Encoding'];
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return true; }
    fs.createReadStream(abs).on('error', () => res.destroy()).pipe(res);
    return true;
  }

  /** Warm the compression cache for the entry HTML and its largest JS/CSS bundles. */
  function prewarm() {
    const assets = path.join(root, 'assets');
    const files = [path.join(root, 'index.html')];
    try { for (const f of fs.readdirSync(assets)) if (/\.(js|css)$/.test(f)) files.push(path.join(assets, f)); } catch { /* no build */ }
    for (const abs of files) { const f = statFile(abs); if (f) { compressed(f.abs, f.st, 'br').catch(() => {}); compressed(f.abs, f.st, 'gz').catch(() => {}); } }
  }

  return { serve, prewarm, root, exists: () => !!statFile(path.join(root, 'index.html')) };
}
