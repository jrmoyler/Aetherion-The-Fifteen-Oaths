// Character persistence: one JSON file per character token under <dataDir>/characters/.
// Reads are synchronous (small files, only on join) and cached; writes are asynchronous and
// atomic (write temp file, fsync, rename), serialized per token, and flushable on shutdown.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const TOKEN_RE = /^[a-f0-9]{16,64}$/;

export function createStore(dataDir) {
  const dir = path.join(dataDir, 'characters');
  fs.mkdirSync(dir, { recursive: true });
  const cache = new Map(); // token -> JSON string (snapshot, detached from live sim objects)
  const writing = new Map(); // token -> Promise
  const pending = new Map(); // token -> latest data waiting behind an in-flight write
  let writes = 0, errors = 0;

  const file = (token) => path.join(dir, `${token}.json`);

  function load(token) {
    if (!TOKEN_RE.test(token)) return null;
    try {
      let json = cache.get(token);
      if (json === undefined) { json = fs.readFileSync(file(token), 'utf8'); cache.set(token, json); }
      return JSON.parse(json);
    } catch { return null; }
  }

  async function writeAtomic(token, data) {
    const f = file(token);
    const tmp = `${f}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    const fh = await fsp.open(tmp, 'w');
    try {
      await fh.writeFile(data);
      await fh.sync();
    } finally { await fh.close(); }
    await fsp.rename(tmp, f);
    writes++;
  }

  function save(token, data) {
    if (!TOKEN_RE.test(token)) return;
    data = JSON.stringify(data);
    cache.set(token, data);
    if (writing.has(token)) { pending.set(token, data); return; }
    const run = (d) => {
      const p = writeAtomic(token, d).catch((e) => { errors++; console.error('[persist] write failed', token.slice(0, 8), e.message); })
        .finally(() => {
          writing.delete(token);
          if (pending.has(token)) { const next = pending.get(token); pending.delete(token); writing.set(token, run(next)); }
        });
      return p;
    };
    writing.set(token, run(data));
  }

  async function flush() {
    while (writing.size) await Promise.all([...writing.values()]);
  }

  return { load, save, flush, stats: () => ({ cached: cache.size, writes, errors, inFlight: writing.size }) };
}
