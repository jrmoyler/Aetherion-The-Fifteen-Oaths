// World: streamed quadtree terrain with procedural splat materials, ocean & marsh water, lava,
// vegetation/rocks, grass fields, distant horizon ranges.  API: see game/CONTRACTS.md.
import { heightAt, normalAt, isWater as seaAt, SEA_LEVEL, MARSH_LEVEL, lavaAt, sampleTerrain } from '@shared/terrain.js';
import { regionAt, OATH_BY_ID } from '@shared/oaths.js';
import { createPool } from './pool.js';
import { NLAYERS } from './surface.js';
import { createTerrainResources, createTerrainMaterial } from './terrainMaterial.js';
import { createTerrain } from './terrain.js';
import { createWater } from './water.js';
import { createVegetation } from './vegetation.js';
import { createGrass } from './grass.js';
import { createHorizon } from './horizon.js';
import { makeNoiseTexture } from '../render/sky.js';
import { windState } from './wind.js';

const MARSH_C = OATH_BY_ID['oath-08'].center;

export async function init(ctx) {
  const { scene, quality } = ctx;
  const groundAt = (x, z, y) => (ctx.collision ? ctx.collision.groundAt(x, z, y) : heightAt(x, z));
  const isWater = (x, z) => {
    const h = heightAt(x, z);
    if (h < SEA_LEVEL) return true;
    return Math.hypot(x - MARSH_C[0], z - MARSH_C[1]) < 640 && h < MARSH_LEVEL;
  };
  const waterLevelAt = (x, z) => (Math.hypot(x - MARSH_C[0], z - MARSH_C[1]) < 640 && heightAt(x, z) < MARSH_LEVEL ? MARSH_LEVEL : SEA_LEVEL);
  const api = {
    heightAt, normalAt, groundAt, isWater, waterLevel: SEA_LEVEL, waterLevelAt, lavaAt, regionAt, sampleTerrain,
    update() {}, focus() {}, ready: async () => {}, stats: () => ({}), wind: windState,
  };
  try {
    const cores = navigator.hardwareConcurrency || 4;
    const nWorkers = Math.max(1, Math.min(quality.name === 'low' ? 2 : 3, cores - 1));
    const pool = createPool(nWorkers);
    ctx.__loading = true;

    // procedural ground layers, split across the workers
    const N = quality.name === 'low' || quality.name === 'medium' ? 256 : 512;
    const all = Array.from({ length: NLAYERS }, (_, i) => i);
    const groups = Array.from({ length: Math.max(1, pool.workers.length || 1) * 2 }, () => []);
    all.forEach((l, i) => groups[i % groups.length].push(l));
    let done = 0;
    const parts = await Promise.all(groups.filter((g) => g.length).map((g) => pool.run({ t: 'tex', layers: g, N }).then((r) => { done++; ctx.setLoading?.(0.16 + 0.12 * done / groups.length, 'Weathering the stone'); return r; })
      .catch((e) => { console.warn('[world] texture job failed', e); return []; })));
    if (!pool.threaded) pool.update(1e9);
    const layers = parts.flat();
    const macro = makeNoiseTexture(scene, 256);
    const res = createTerrainResources(scene, layers, N, macro, quality);
    res.debug = +(ctx.params?.get?.('tdebug') || 0);
    const material = createTerrainMaterial(scene, res);

    const terrain = createTerrain(ctx, pool, material);
    let water = null, veg = null, grass = null, horizon = null;
    try { water = createWater(ctx, macro); } catch (e) { console.warn('[world] water failed', e); }
    try { horizon = createHorizon(ctx); } catch (e) { console.warn('[world] horizon failed', e); }
    try { veg = createVegetation(ctx, pool, res); } catch (e) { console.warn('[world] vegetation failed', e); }
    try { grass = (quality.grass ?? 0) > 0 ? createGrass(ctx) : null; } catch (e) { console.warn('[world] grass failed', e); }
    if (water) pool.run({ t: 'heightmap', N: water.HM, E: water.E }, () => 50).then((hm) => water.setHeightmap(hm)).catch((e) => console.warn('[world] heightmap', e));

    let windT = 0;
    function update(dt) {
      pool.update(ctx.__loading ? 30 : 5);
      terrain.update(dt);
      water?.update(dt);
      veg?.update(dt);
      grass?.update(dt);
      windT += dt; windState.gust = 0.25 * Math.sin(windT * 0.21) + 0.15 * Math.sin(windT * 0.53);
    }
    const ready = (x, z, timeoutMs = 25000) => new Promise((resolve) => {
      terrain.focus(x, z, 40);
      const t0 = performance.now();
      const tick = () => {
        if (terrain.isReady(x, z, 140) || performance.now() - t0 > timeoutMs) resolve(true);
        else setTimeout(tick, 100);
      };
      tick();
    });
    Object.assign(api, {
      update, ready,
      focus: (x, z) => terrain.focus(x, z, 40),
      stats: () => ({ terrainNodes: terrain.shownCount, built: terrain.builtCount, vegInstances: veg?.stats.instances ?? 0, vegCells: veg?.stats.cells ?? 0, grassPatches: grass?.stats.patches ?? 0, pending: pool.pending, threaded: pool.threaded }),
      terrain, water, vegetation: veg, grass, horizon, material, resources: res,
    });
    ctx.addUpdate(update, 40);

    // build the area around the current camera before returning (the render loop is not running yet)
    const cam = scene.activeCamera; const p = cam ? (cam.globalPosition ?? cam.position) : { x: 0, z: 0 };
    terrain.focus(p.x, p.z, 20);
    const t0 = performance.now();
    while (performance.now() - t0 < 20000) {
      update(1 / 60);
      if (terrain.isReady(p.x, p.z, 120) && (veg ? veg.pendingCount() === 0 : true)) break;
      await new Promise((r) => setTimeout(r, 16));
    }
    for (let i = 0; i < 4; i++) update(1 / 60);
    ctx.__loading = false;
  } catch (e) {
    console.warn('[world] init failed, running with a bare world', e);
    ctx.__loading = false;
  }
  return api;
}
