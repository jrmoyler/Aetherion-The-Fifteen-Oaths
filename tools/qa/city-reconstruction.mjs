// City reconstruction review: renders each sanctuary from a camera matching the ENVIRONMENT panel of
// its concept sheet (assets/references/reference-099..113) and writes side-by-side comparisons
// (reference crop | Three.js render) to docs/qa/city-reconstruction/.
//   node tools/qa/city-reconstruction.mjs [oath-12 oath-04 ...] [--scale 1] [--low]
// CITY_RENDERS=1 also writes the bare render (<id>-render.png).
// Uses CITY_URL (default http://127.0.0.1:5173) or starts its own Vite server on :4189.
// Renders through the game's real stack (world.js terrain/sea/vegetation, atmosphere.js sky + sun by time of
// day, postprocessing.js HDR bloom). Headless WebGL via SwiftShader; PLAYWRIGHT_EXECUTABLE_PATH overrides the browser.
import { chromium } from '../../game/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const game = resolve(repo, 'game');
const output = resolve(repo, 'docs/qa/city-reconstruction');
const args = process.argv.slice(2);
const low = args.includes('--low');
const scaleArg = args.indexOf('--scale'); const scale = scaleArg >= 0 ? +args[scaleArg + 1] : 1;
const only = args.filter((a) => a.startsWith('oath-'));

// Reference sheet + ENVIRONMENT panel crop [x0,y0,x1,y1] (px in original.png) and a camera in the
// sanctuary-local frame (metres; origin plaza centre, +Z toward the hall) matching the panel view.
const VIEWS = {
  'oath-01': { ref: 113, crop: [12, 672, 1000, 1004], cam: [22, 24, -46], at: [-4, 2, 32], fov: 50 },
  'oath-02': { ref: 112, crop: [12, 666, 990, 1008], cam: [-6, 6, -40], at: [0, 10, 60], fov: 52 },
  'oath-03': { ref: 111, crop: [6, 674, 1105, 1018], cam: [0, 9, -44], at: [0, 11, 50], fov: 54 },
  'oath-04': { ref: 110, crop: [2, 692, 1534, 1022], cam: [0, 36, -58], at: [0, 0, 26], fov: 50 },
  'oath-05': { ref: 109, crop: [14, 664, 985, 1008], cam: [-4, 10, -54], at: [0, 6, 50], fov: 54 },
  'oath-06': { ref: 108, crop: [12, 648, 1095, 1010], cam: [-30, 9, -30], at: [12, 4, 40], fov: 56 },
  'oath-07': { ref: 107, crop: [6, 742, 1163, 1014], cam: [0, 7, -40], at: [0, 9, 60], fov: 54 },
  'oath-08': { ref: 106, crop: [4, 642, 1530, 1021], cam: [0, 22, -50], at: [0, 0, 30], fov: 50 },
  'oath-09': { ref: 105, crop: [8, 660, 1262, 1010], cam: [-22, 24, -48], at: [4, 3, 40], fov: 50 },
  'oath-10': { ref: 104, crop: [4, 652, 1085, 1017], cam: [0, 10, -38], at: [0, 7, 40], fov: 54 },
  'oath-11': { ref: 103, crop: [12, 646, 1153, 1008], cam: [0, 20, -48], at: [0, 3, 30], fov: 52 },
  'oath-12': { ref: 102, crop: [10, 696, 1240, 1010], cam: [0, 27, -64], at: [0, 0, 22], fov: 48 },
  'oath-13': { ref: 100, crop: [4, 694, 1140, 1018], cam: [-10, 16, -44], at: [0, 2, 30], fov: 52 },
  'oath-14': { ref: 99, crop: [10, 665, 1205, 1010], cam: [0, 5.5, -34], at: [0, 9, 60], fov: 56 },
  'oath-15': { ref: 101, crop: [8, 674, 1197, 1008], cam: [0, 6, -38], at: [0, 8, 60], fov: 54 },
};

const base = process.env.CITY_URL || 'http://127.0.0.1:5173';
let dev, browser;
async function reachable(url) { try { const r = await fetch(url); return r.ok; } catch { return false; } }
try {
  let url = base;
  if (!(await reachable(base))) {
    url = 'http://127.0.0.1:4189';
    dev = spawn(process.execPath, [resolve(game, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4189', '--strictPort'], { cwd: game, stdio: 'pipe' });
    await new Promise((ok, fail) => { const t = setTimeout(() => fail(new Error('Vite did not start')), 30000); dev.stdout.on('data', (d) => { if (d.toString().includes('Local:')) { clearTimeout(t); ok(); } }); dev.on('exit', (c) => c && fail(new Error(`Vite exited ${c}`))); });
  }
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/__city-review', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#000"></body></html>' }));
  await page.goto(url + '/__city-review');
  page.setDefaultTimeout(600000);
  await page.evaluate(async ({ repo, low, nopost, keylight }) => {
    // Mirror game/src/main.js: renderer settings, RoomEnvironment IBL, hemi + shadowed sun, the real
    // world (terrain tiles, sea, vegetation, all sanctuaries), the Preetham atmosphere driven by time
    // of day, and the game's HDR bloom post-processing chain.
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { RoomEnvironment } = await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
    const { TIERS } = await import('/src/core/quality.js');
    const { CollisionWorld } = await import('/src/core/collision.js');
    const { initWorld } = await import('/src/three/world.js');
    const { initAtmosphere } = await import('/src/three/atmosphere.js');
    const { createPostprocessing } = await import('/src/three/postprocessing.js');
    const quality = { ...(low ? TIERS.low : TIERS.high) }; if (nopost) quality.bloom = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.93;
    renderer.shadowMap.enabled = quality.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.setPixelRatio(1);
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#aebcc4'); scene.fog = new THREE.FogExp2('#aebcc4', 0.0018);
    const camera = new THREE.PerspectiveCamera(53, 1, 0.3, 4000);
    const postprocessing = createPostprocessing(renderer, scene, camera, quality);
    const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture; scene.environmentIntensity = 0.32;
    const hemi = new THREE.HemisphereLight('#d5e8ff', '#574a38', 1.2); scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff0ce', 2.3); sun.castShadow = quality.shadows;
    // the game frames a +-65 m shadow box around the player; the review frames the whole plaza instead
    sun.shadow.mapSize.set(4096, 4096); Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 700 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.035; scene.add(sun, sun.target);
    const updaters = [];
    const ctx = { renderer, scene, camera, quality, postprocessing, collision: new CollisionWorld(), params: new URLSearchParams(''),
      addUpdate(fn, order = 50) { const it = { fn, order }; updaters.push(it); updaters.sort((x, y) => x.order - y.order); return () => updaters.splice(updaters.indexOf(it), 1); },
      render: { sun, hemi, addShadowCaster() {}, removeShadowCaster() {} }, bus: null };
    const world = await initWorld(ctx); ctx.world = world;
    const atmosphere = initAtmosphere(ctx); atmosphere.setTimeScale(0); atmosphere.setWeather('clear', 0);
    const cities = world.architecture;
    window.renderCity = async (oathId, view, w, h) => {
      const idx = cities.sanctuaries.findIndex((s) => s.oathId === oathId); const city = cities.children[idx];
      city.updateMatrixWorld(true);
      const L = (v) => new THREE.Vector3(...v).applyMatrix4(city.matrixWorld);
      camera.position.copy(L(view.cam)); camera.lookAt(L(view.at)); camera.fov = view.fov; camera.aspect = w / h; camera.updateProjectionMatrix();
      world.focus(camera.position.x, camera.position.z); for (let i = 0; i < 12 && world.stats().pending; i++) await world.ready(camera.position.x, camera.position.z);
      // the game's sun azimuth is fixed by the hour (atmosphere.js); pick the morning or afternoon hour that puts the
      // sun behind/beside the hall in this city's frame (shadows rake toward the camera, as in the panels)
      const sunLocal = (hr) => { const an = (hr - 6) / 24 * Math.PI * 2; const d = new THREE.Vector3(Math.cos(an) * 0.75, 0, Math.cos(an) * 0.5).normalize(); const inv = city.matrixWorld.clone().invert(); return d.transformDirection(inv); };
      const hour = view.hour ?? [8.5, 15.5].sort((a, b) => { const A = sunLocal(a), B = sunLocal(b); return (B.z + Math.abs(B.x) * 0.35) - (A.z + Math.abs(A.x) * 0.35); })[0];
      atmosphere.setTimeOfDay(hour);
      renderer.setSize(w, h, false); postprocessing.resize(w, h, 1);
      for (let f = 0; f < 3; f++) for (const u of updaters) u.fn(0.016);
      // CITY_KEYLIGHT=1: art-direction preview with the panels' lighting ratio (stronger warm sun, weaker sky fill).
      // Default renders keep atmosphere.js values exactly as the game sets them for that hour.
      if (keylight) {
        sun.intensity *= 1.9; sun.color.lerp(new THREE.Color('#ffd2a0'), 0.5); hemi.intensity *= 0.55;
        // LDR gradient sky dome (zenith blue -> warm horizon haze) instead of the HDR Preetham sky, which the
        // game's bloom (threshold 1.05) spreads over the whole frame as a milky veil.
        atmosphere.sky.visible = false;
        if (!window.gradSky) {
          window.gradSky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
            vertexShader: 'varying vec3 vW; void main(){ vW = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
            fragmentShader: 'varying vec3 vW; void main(){ float h = clamp(vW.y, -0.1, 1.); vec3 hor = vec3(.86,.83,.78), mid = vec3(.55,.68,.82), zen = vec3(.27,.42,.62); vec3 c = mix(hor, mid, smoothstep(0., .18, h)); c = mix(c, zen, smoothstep(.18, .7, h)); gl_FragColor = vec4(c * .82, 1.); }' }));
          window.gradSky.renderOrder = -1000; scene.add(window.gradSky);
        }
        window.gradSky.position.copy(camera.position); scene.fog.color.set('#c9c6bd'); scene.fog.density = 0.0012;
      }
      const p = L([0, 0, 15]); sun.position.copy(p).add(atmosphere.sunOffset); sun.target.position.copy(p); sun.target.updateMatrixWorld();
      renderer.info.autoReset = false; renderer.info.reset(); postprocessing.render(0.016, false);
      const calls = renderer.info.render.calls, tris = renderer.info.render.triangles; renderer.info.autoReset = true;
      return { drawCalls: calls, triangles: tris, hour, cityMeshes: (() => { let n = 0; city.traverse((o) => { if (o.isMesh && o.visible) n++; }); return n; })(), bloom: postprocessing.enabled, png: renderer.domElement.toDataURL('image/png') };
    };
    window.compose = async (refUrl, crop, png, w, h) => {
      const load = (src) => new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = src; });
      const [ref, ren] = await Promise.all([load(refUrl), load(png)]);
      const cw = crop[2] - crop[0], ch = crop[3] - crop[1]; const rw = Math.round(cw * h / ch);
      const cv = document.createElement('canvas'); cv.width = rw + 8 + w; cv.height = h; const g = cv.getContext('2d');
      g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(ref, crop[0], crop[1], cw, ch, 0, 0, rw, h); g.drawImage(ren, rw + 8, 0, w, h);
      return cv.toDataURL('image/jpeg', 0.88);
    };
  }, { repo, low, nopost: !!process.env.CITY_NOPOST, keylight: !!process.env.CITY_KEYLIGHT });
  // CITY_VIEW='{"cam":[..],"at":[..],"fov":40}' overrides the camera (close-up inspection, written as <id>-detail.png)
  const override = process.env.CITY_VIEW ? JSON.parse(process.env.CITY_VIEW) : null;
  const ids = only.length ? only : Object.keys(VIEWS);
  const summary = [];
  for (const id of ids) {
    const v = override ? { ...VIEWS[id], ...override } : VIEWS[id]; const cw = v.crop[2] - v.crop[0], ch = v.crop[3] - v.crop[1];
    const h = Math.round(400 * scale), w = Math.round(cw * h / ch);
    const t0 = Date.now();
    const r = await page.evaluate(async ({ id, v, w, h }) => window.renderCity(id, v, w, h), { id, v, w, h });
    const refUrl = `/@fs${repo}assets/references/reference-${String(v.ref).padStart(3, '0')}/original.png`;
    const comp = await page.evaluate(({ refUrl, crop, png, w, h }) => window.compose(refUrl, crop, png, w, h), { refUrl, crop: v.crop, png: r.png, w, h });
    if (override) { await writeFile(resolve(output, `${id}-detail.png`), Buffer.from(r.png.split(',')[1], 'base64')); console.log(id, 'detail'); continue; }
    if (process.env.CITY_RENDERS) await writeFile(resolve(output, `${id}-render.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    await writeFile(resolve(output, `${id}-compare${process.env.CITY_KEYLIGHT ? '-keylight' : ''}.jpg`), Buffer.from(comp.split(',')[1], 'base64'));
    summary.push({ id, ref: v.ref, hour: r.hour, cityMeshes: r.cityMeshes, frameDrawCalls: r.drawCalls, frameTriangles: r.triangles, ms: Date.now() - t0 });
    console.log(id, `ref-${v.ref}`, `hour=${r.hour}`, `bloom=${r.bloom}`, `cityMeshes=${r.cityMeshes}`, `calls=${r.drawCalls}`, `tris=${r.triangles}`, `${Date.now() - t0}ms`);
  }
  if (!only.length && !process.env.CITY_KEYLIGHT) await writeFile(resolve(output, 'render-stats.json'), JSON.stringify({ low, summary }, null, 1) + '\n');
  if (errors.length) { console.log('page errors:', errors.slice(0, 10)); process.exitCode = 1; }
} finally { await browser?.close(); dev?.kill(); }
