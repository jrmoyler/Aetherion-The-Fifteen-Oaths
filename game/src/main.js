// Three.js client: simulation and UI are independent of the render graph.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import sourceEnvironmentUrl from '../../runtime/ability-matrix/packs/handcast/public/hdri/spruit_sunrise.hdr?url';
import { createGameClock } from './core/gameClock.js';
import { Bus } from './core/bus.js';
import { detectQuality } from './core/quality.js';
import { createInput } from './core/input.js';
import { CollisionWorld } from './core/collision.js';
import { createFrameBudget } from './core/frameBudget.js';
import * as UI from './ui/index.js';
import * as Net from './net/index.js';
import * as Combat from './combat/index.js';
import { initWorld } from './three/world.js';
import { initAtmosphere } from './three/atmosphere.js';
import { initActors } from './three/actors.js';
import { initVFX } from './three/vfx.js';
import { createPostprocessing } from './three/postprocessing.js';
import { OATH_BY_ID } from '@shared/oaths.js';
import { heightAt } from '@shared/terrain.js';

async function startClient() {
  const canvas = document.getElementById('game');
  const bus = new Bus(), quality = detectQuality();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.name !== 'low', powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .93;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#aebcc4');
  scene.fog = new THREE.FogExp2('#aebcc4', .0018);
  const camera = new THREE.PerspectiveCamera(53, 1, .3, 4000);
  const postprocessing = createPostprocessing(renderer, scene, camera, quality);
  scene.activeCamera = camera;
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(environment, .05);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = .32;
  environment.dispose(); pmrem.dispose();
  const hemi = new THREE.HemisphereLight('#d5e8ff', '#574a38', 1.2); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0ce', 2.3);
  sun.position.set(-90, 140, 75); sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 400 });
  sun.shadow.bias = -.0003; sun.shadow.normalBias = .035;
  scene.add(sun, sun.target);
  const updaters = [];
  const gameClock = createGameClock();
  bus.on('game:paused', ({ paused }) => gameClock.setPaused(paused));
  const budget = createFrameBudget({ maxScale: quality.renderScale });
  let frameMs = 16.7, suspended = false, stopped = false, timeOfDay = 16;
  const ctx = {
    renderer, scene, camera, canvas, bus, quality, postprocessing, gameplayNow: gameClock.now,
    engine: { getFps: () => 1000 / frameMs, getRenderWidth: () => canvas.width, getRenderHeight: () => canvas.height },
    input: createInput(canvas, bus), collision: new CollisionWorld(),
    clock: { time: 0, dt: 0, frame: 0 }, params: new URLSearchParams(location.search),
    addUpdate(fn, order = 50) { const item = { fn, order }; updaters.push(item); updaters.sort((a,b) => a.order-b.order); return () => { const i = updaters.indexOf(item); if(i >= 0) updaters.splice(i,1); }; },
    setLoading(p, label) { bus.emit('loading', { p, label }); },
    render: { sun, hemi, addShadowCaster(mesh) { mesh.castShadow = quality.shadows; }, removeShadowCaster(mesh) { mesh.castShadow = false; }, get timeOfDay() { return timeOfDay; }, setTimeOfDay(h) { timeOfDay = h; }, setTimeScale() {}, attachCamera() {}, setWeather(kind, intensity) { bus.emit('world:weather', { kind, intensity }); }, setRegionGrade() {} },
  };
  window.__aetherion = ctx;
  ctx.render.sceneDepth = postprocessing.depthTexture;
  // Source ability shaders sample the unfiltered equirectangular HDR directly;
  // the world's PMREM room texture is a different layout and cannot replace it.
  const sourceEnvironmentReady = new RGBELoader().loadAsync(sourceEnvironmentUrl).then(texture => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    ctx.sourceEnvironmentTexture = texture;
  }).catch(error => console.warn('[abilities] Source reflection environment unavailable', error));
  ctx.input.setEnabled(false);
  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.name === 'low' ? 1.25 : 1.75) * budget.scale);
    renderer.setSize(innerWidth, innerHeight, false);
    postprocessing.resize(innerWidth, innerHeight, renderer.getPixelRatio());
    camera.aspect = innerWidth / Math.max(1, innerHeight); camera.updateProjectionMatrix();
  }
  resize(); addEventListener('resize', resize);
  canvas.addEventListener('pointermove', e => { scene.pointerX = e.clientX; scene.pointerY = e.clientY; });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); suspended = true; ctx.input.setEnabled(false); ctx.ui?.toast('Graphics paused. Recovering your view…', 'info'); });
  canvas.addEventListener('webglcontextrestored', () => { suspended = false; budget.reset(); ctx.input.setEnabled(!!ctx.character); });
  let menuPaused = false;
  const syncPause = () => ctx.net?.setPaused(menuPaused || document.hidden);
  const onVisibility = () => { budget.reset(); syncPause(); };
  const offPause = bus.on('ui:pause', ({ paused }) => { menuPaused = !!paused; syncPause(); });
  document.addEventListener('visibilitychange', onVisibility);
  ctx.ui = await UI.init(ctx);
  ctx.setLoading(.1, 'Shaping the continent');
  ctx.world = await initWorld(ctx);
  const atmosphere = initAtmosphere(ctx);
  Object.defineProperty(ctx.render, 'timeOfDay', { get: () => atmosphere.timeOfDay, configurable: true });
  ctx.render.setTimeOfDay = atmosphere.setTimeOfDay;
  ctx.render.setTimeScale = atmosphere.setTimeScale;
  ctx.render.setWeather = atmosphere.setWeather;
  ctx.setLoading(.55, 'Opening the Weave');
  ctx.net = await Net.init(ctx);
  await sourceEnvironmentReady;
  ctx.vfx = await initVFX(ctx);
  ctx.actors = await initActors(ctx);
  ctx.combat = await Combat.init(ctx);
  const home = OATH_BY_ID['oath-09'].center;
  const h = heightAt(home[0], home[1]);
  camera.position.set(home[0] + 45, h + 28, home[1] + 65);
  camera.lookAt(home[0], h + 5, home[1]);
  ctx.world.focus(home[0], home[1]);
  let last = performance.now();
  renderer.setAnimationLoop(now => {
    if(stopped) return;
    const raw = now - last; last = now;
    if(document.hidden || suspended) return;
    const dt = Math.min(Math.max(raw / 1000, .001), .05);
    frameMs = frameMs * .92 + raw * .08;
    if(ctx.clock.time > 8 && budget.sample(raw) !== null) resize();
    const simDt = ctx.net?.paused ? 0 : dt;
    ctx.clock.dt = simDt; ctx.clock.time += simDt; ctx.clock.frame++;
    ctx.input.poll();
    // Keep menu navigation alive while the local simulation and presentation are frozen.
    for(const u of updaters) if (simDt > 0 || u.order <= 0 || u.order >= 60) u.fn(simDt);
    const p = ctx.actors?.player?.position ?? camera.position;
    sun.position.copy(p).add(atmosphere.sunOffset);
    sun.target.position.set(p.x, p.y, p.z); sun.target.updateMatrixWorld();
    postprocessing.render(simDt, !!ctx.vfx?.hasActiveSourceEffects);
    ctx.input.endFrame();
  });
  ctx.setLoading(1, 'Your covenant awaits');
  const character = await ctx.ui.chooseCharacter();
  ctx.character = character; bus.emit('game:character', character);
  const center = OATH_BY_ID[character.oath].center;
  await ctx.world.ready(center[0], center[1]);
  await ctx.net.connect(character);
  // Keep the offline world still while the chosen hero finishes loading.
  ctx.net.setPaused(true);
  await ctx.actors.ready?.();
  ctx.ui.enterGame(); ctx.input.setEnabled(true);
  bus.emit('game:start', character);
  syncPause();
  ctx.dispose = () => {
    stopped = true; renderer.setAnimationLoop(null); ctx.net.disconnect?.();
    ctx.input.dispose?.(); ctx.ui.audio?.dispose?.(); offPause();
    document.removeEventListener('visibilitychange', onVisibility);
    ctx.vfx.dispose?.(); ctx.actors.dispose?.(); atmosphere.dispose(); ctx.world.dispose?.();
    ctx.sourceEnvironmentTexture?.dispose(); postprocessing.dispose(); envTarget.dispose(); renderer.dispose(); removeEventListener('resize', resize);
  };
}
startClient().catch(err => {
  console.error(err);
  window.__aetherion?.bus.emit('fatal', err);
  const box = document.createElement('section');
  box.setAttribute('role','alert');
  box.style.cssText = 'position:fixed;inset:auto 12px 12px;color:#f4eee1;background:#182028;padding:20px;font:16px system-ui;z-index:100';
  box.textContent = 'The realm could not open. Your character is saved. ';
  const retry = document.createElement('button'); retry.textContent = 'Retry with reduced graphics';
  retry.style.cssText = 'padding:12px;margin:8px;cursor:pointer';
  retry.onclick = () => { const url = new URL(location.href); url.searchParams.set('q','low'); location.href = url.href; };
  box.append(retry); document.body.append(box);
});
