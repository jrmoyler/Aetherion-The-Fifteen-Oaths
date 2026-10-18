// Rendered audit of all 150 catalog abilities on the review stage (game/review.html?audit=1).
// Headless Chromium + SwiftShader WebGL: proves pixels are produced, NOT real-GPU frame rate.
//
//   node tools/qa/effects-render-audit.mjs [--url http://127.0.0.1:5173] [--out docs/qa/effects-render]
//        [--ids casting/shark,handcast/toxic] [--times 0.3,1,2] [--size 640x400]
//
// For every ability: reset stage, render a pre-cast baseline, cast, advance simulated time at a
// fixed 1/60 s step to each sample moment, read back the canvas and compute per-moment metrics
// against the baseline. Writes report.json and contact sheets (one JPEG per moment).
import { chromium } from '../../game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]);
  return acc;
}, []));
const url = args.url || 'http://127.0.0.1:5173';
const out = path.resolve(args.out || 'docs/qa/effects-render');
const times = String(args.times || '0.3,1,2').split(',').map(Number);
const [W, H] = String(args.size || '640x400').split('x').map(Number);
const only = args.ids ? new Set(String(args.ids).split(',')) : null;
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const THUMB = { w: 192, h: 120 };

// Thresholds used for verdicts (documented in README).
const LIMITS = {
  minChanged: 0.004,     // fraction of pixels differing from baseline at the best moment
  blownFrame: 0.05,      // fraction of the whole frame that is clipped near-white
  blownShare: 0.45,      // share of the changed region that is clipped near-white
  flatStd: 7,            // luminance std (0-255) of the changed region below which it reads as a solid blob
  flatArea: 0.03,        // ... only when the changed region is at least this large
};

await fs.mkdir(out, { recursive: true });
if (!only) await fs.rm(path.join(out, 'flagged'), { recursive: true, force: true });
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.setDefaultTimeout(600000);
const pageErrors = [], pageWarnings = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); else if (m.type() === 'warning') pageWarnings.push(m.text()); });
await page.goto(`${url}/review.html?audit=1`);
await page.waitForFunction(() => window.__review || window.__reviewReport?.errors?.length, null, { timeout: 600000 });
const boot = await page.evaluate(() => ({ ready: !!window.__review, errors: window.__reviewReport.errors, post: window.__review?.post, gl: (() => { const c = document.querySelector('canvas'); const g = c.getContext('webgl2'); const d = g?.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; })() }));
if (!boot.ready) throw new Error('Review stage failed to boot: ' + JSON.stringify(boot.errors));

// In-page image analysis helpers (2D canvas; no native deps).
await page.evaluate(({ THUMB }) => {
  const decode = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  window.__audit = {
    async pixels(src) { const img = await decode(src); const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height); },
    async thumb(src) { const img = await decode(src); const c = document.createElement('canvas'); c.width = THUMB.w; c.height = THUMB.h; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, THUMB.w, THUMB.h); return c.toDataURL('image/jpeg', .82); },
    metrics(base, cur) {
      const a = base.data, b = cur.data, w = cur.width, h = cur.height, n = w * h;
      let changed = 0, diffSum = 0, blown = 0, blownChanged = 0, lumSum = 0, lumSq = 0, satSum = 0, gradSum = 0, frameLum = 0;
      const mask = new Uint8Array(n);
      for (let i = 0, p = 0; p < n; p++, i += 4) {
        const r = b[i], g = b[i + 1], bl = b[i + 2];
        const d = Math.max(Math.abs(r - a[i]), Math.abs(g - a[i + 1]), Math.abs(bl - a[i + 2]));
        diffSum += d; const lum = .2126 * r + .7152 * g + .0722 * bl; frameLum += lum;
        const isBlown = r >= 248 && g >= 248 && bl >= 248; if (isBlown) blown++;
        if (d > 14) {
          mask[p] = 1; changed++; lumSum += lum; lumSq += lum * lum;
          const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); satSum += mx ? (mx - mn) / mx : 0;
          if (isBlown) blownChanged++;
        }
      }
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const p = y * w + x; if (!mask[p]) continue; const i = p * 4;
        const L = q => .2126 * b[q] + .7152 * b[q + 1] + .0722 * b[q + 2];
        gradSum += Math.abs(L(i + 4) - L(i - 4)) + Math.abs(L(i + w * 4) - L(i - w * 4));
      }
      const m = changed || 1, mean = lumSum / m;
      return {
        changedFrac: +(changed / n).toFixed(5), meanAbsDiff: +(diffSum / n).toFixed(3),
        frameLuma: +(frameLum / n).toFixed(2), changedLuma: +mean.toFixed(2),
        changedLumaStd: +Math.sqrt(Math.max(0, lumSq / m - mean * mean)).toFixed(2),
        changedSaturation: +(satSum / m).toFixed(3), changedGradient: +(gradSum / m).toFixed(2),
        blownFrac: +(blown / n).toFixed(5), blownShareOfChanged: +(blownChanged / m).toFixed(4),
      };
    },
  };
}, { THUMB });

const ids = (await page.evaluate(() => window.__review.ids)).filter(id => !only || only.has(id));
const report = { created: new Date().toISOString(), kind: 'Headless Chromium SwiftShader rendered audit (pixels, not GPU frame rate)', url, viewport: { W, H }, renderer: boot.gl, postprocessing: boot.post, times, step: '1/60 s simulated, rendered every 4th step + at each sample', limits: LIMITS, bootErrors: boot.errors, abilities: [] };
const thumbs = {}; // id -> [jpeg dataURL per time]
const t0 = Date.now();
for (const [index, id] of ids.entries()) {
  const started = Date.now(); pageErrors.length = 0; pageWarnings.length = 0;
  const row = { id, samples: [] };
  try {
    await page.evaluate(() => { window.__review.reset(); window.__review.step(.25); });
    await page.evaluate(async () => { window.__audit.base = await window.__audit.pixels(window.__review.capture()); });
    Object.assign(row, await page.evaluate(id => window.__review.cast(id), id));
    let elapsed = 0; thumbs[id] = [];
    for (const t of times) {
      const sample = await page.evaluate(async ({ dt }) => {
        const r = window.__review; if (dt > 0) r.step(dt);
        const src = r.capture(); const cur = await window.__audit.pixels(src);
        return { metrics: window.__audit.metrics(window.__audit.base, cur), thumb: await window.__audit.thumb(src), active: r.active, full: src };
      }, { dt: t - elapsed });
      elapsed = t;
      thumbs[id].push(sample.thumb);
      row.samples.push({ t, active: sample.active, ...sample.metrics });
      row._full ??= []; row._full.push(sample.full);
    }
    row.errors = [...(row.errors || []), ...await page.evaluate(id => window.__reviewReport.errors.filter(e => e.ability === id).map(e => e.message), id)];
  } catch (e) { row.errors = [...(row.errors || []), 'harness: ' + e.message]; }
  row.errors = [...new Set([...(row.errors || []), ...pageErrors.filter(m => !/GPU stall due to ReadPixels|WebGL: INVALID|GL Driver Message|swiftshader/i.test(m))])];
  row.warnings = [...new Set(pageWarnings.filter(m => !/GPU stall due to ReadPixels|GL Driver Message|swiftshader/i.test(m)))];
  // Verdict
  const best = row.samples.reduce((b, s) => (s.changedFrac > (b?.changedFrac ?? -1) ? s : b), null);
  const flags = [];
  if (row.errors.length) flags.push('errors');
  if (row.sourceId !== id) flags.push('source-identity');
  if (!best || best.changedFrac < LIMITS.minChanged) flags.push('nothing-rendered');
  if (row.samples.some(s => s.blownFrac > LIMITS.blownFrame || (s.changedFrac > .01 && s.blownShareOfChanged > LIMITS.blownShare))) flags.push('blown-out');
  if (row.samples.some(s => s.changedFrac > LIMITS.flatArea && s.changedLumaStd < LIMITS.flatStd)) flags.push('flat-blob');
  row.flags = flags; row.pass = !flags.length; row.ms = Date.now() - started;
  // Keep full-resolution frames only for flagged abilities (for close review).
  if (flags.length && row._full) {
    await fs.mkdir(path.join(out, 'flagged'), { recursive: true });
    const peak = row.samples.indexOf(best);
    await fs.writeFile(path.join(out, 'flagged', id.replace('/', '__') + '.png'), Buffer.from(row._full[Math.max(0, peak)].split(',')[1], 'base64'));
  }
  delete row._full;
  report.abilities.push(row);
  console.log(`[${index + 1}/${ids.length}] ${id} ${row.pass ? 'PASS' : 'FLAG ' + flags.join(',')} changed=${row.samples.map(s => s.changedFrac).join('/')} ${row.ms}ms${row.errors.length ? ' ERR ' + row.errors[0].slice(0, 160) : ''}`);
}

// Contact sheets: 10 columns x up to 15 rows, one sheet per sample time, labelled with ability id.
async function sheet(t, ti, list, name) {
  const cols = 10, rows = Math.ceil(list.length / cols), labelH = 14;
  const data = await page.evaluate(async ({ list, cols, rows, labelH, THUMB, t, flags }) => {
    const c = document.createElement('canvas'); c.width = cols * THUMB.w; c.height = rows * (THUMB.h + labelH) + 22;
    const g = c.getContext('2d'); g.fillStyle = '#0b0f14'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#e6e9ef'; g.font = 'bold 14px monospace'; g.fillText(`Aetherion ability render audit - t=${t}s after cast (SwiftShader)`, 6, 16);
    for (const [i, [id, src]] of list.entries()) {
      const x = (i % cols) * THUMB.w, y = 22 + Math.floor(i / cols) * (THUMB.h + labelH);
      const img = await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = src; });
      g.drawImage(img, x, y + labelH);
      g.fillStyle = flags[id] ? '#ff6b5a' : '#9fb4c8'; g.font = '11px monospace'; g.fillText(id, x + 3, y + 11);
      g.strokeStyle = '#0b0f14'; g.strokeRect(x + .5, y + .5, THUMB.w - 1, THUMB.h + labelH - 1);
    }
    return c.toDataURL('image/jpeg', .8);
  }, { list, cols, rows, labelH, THUMB, t, flags: Object.fromEntries(report.abilities.map(a => [a.id, !a.pass])) });
  await fs.writeFile(path.join(out, name), Buffer.from(data.split(',')[1], 'base64'));
}
const list = ids.filter(id => thumbs[id]?.length);
const prefix = only ? 'subset-' : '';
for (const [ti, t] of times.entries()) {
  for (let start = 0, part = 1; start < list.length; start += 150, part++)
    await sheet(t, ti, list.slice(start, start + 150).map(id => [id, thumbs[id][ti]]), `${prefix}contact-t${String(t).replace('.', 'p')}s${list.length > 150 ? '-' + part : ''}.jpg`);
}
// Time strips: one row per ability, one column per sample (only for small/subset runs).
if (list.length <= 40) {
  const data = await page.evaluate(async ({ rows, times, THUMB }) => {
    const labelW = 0, c = document.createElement('canvas'); c.width = times.length * THUMB.w; c.height = rows.length * (THUMB.h + 14);
    const g = c.getContext('2d'); g.fillStyle = '#0b0f14'; g.fillRect(0, 0, c.width, c.height);
    for (const [r, [id, srcs]] of rows.entries()) for (const [i, src] of srcs.entries()) {
      const img = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = src; });
      const x = i * THUMB.w, y = r * (THUMB.h + 14); g.drawImage(img, x, y + 14);
      g.fillStyle = '#9fb4c8'; g.font = '11px monospace'; g.fillText(`${id} t=${times[i]}s`, x + 3, y + 11);
    }
    return c.toDataURL('image/jpeg', .85);
  }, { rows: list.map(id => [id, thumbs[id]]), times, THUMB });
  await fs.writeFile(path.join(out, `${prefix}strips.jpg`), Buffer.from(data.split(',')[1], 'base64'));
}
report.summary = {
  total: report.abilities.length, pass: report.abilities.filter(a => a.pass).length,
  flagged: Object.fromEntries(report.abilities.filter(a => !a.pass).map(a => [a.id, a.flags])),
  errorFree: report.abilities.filter(a => !a.errors.length).length,
  warningFree: report.abilities.filter(a => !a.warnings?.length).length,
  rendered: report.abilities.filter(a => !a.flags.includes('nothing-rendered')).length,
  minBestChanged: Math.min(...report.abilities.map(a => Math.max(...a.samples.map(s => s.changedFrac), 0))),
  wallSeconds: Math.round((Date.now() - t0) / 1000),
};
await fs.writeFile(path.join(out, `${prefix}report.json`), JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify(report.summary));
await browser.close();
if (report.summary.pass !== report.summary.total) process.exitCode = 1;
