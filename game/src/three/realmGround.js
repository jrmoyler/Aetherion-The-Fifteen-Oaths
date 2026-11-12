// Places Biome Triad's ground shader and water under Aetherion's realms.
//
// biome-ground.generated.js holds the source code untouched: terrainMaterial(d), makeWater(...) and, per world, the
// `detail` settings and the colour and kind functions its terrain was built with. This file is the thin part:
//   - one terrain material for the whole continent, with the per-world settings looked up per triangle by realm,
//   - each realm's vertices coloured by its world's colour function, run against Aetherion's own heights and slopes,
//   - Aetherion's road, plaza and lava masks and its surface-state layer wired into that shader,
//   - the sea and the marsh pool made by makeWater with the look of the realm the player stands in.
import * as THREE from 'three';
import { BIOMES, SEA_LEVEL, MARSH_LEVEL, MARSH_RADIUS, waterLevelAt, heightAt } from '@shared/terrain.js';
import { OATH_BY_ID } from '@shared/oaths.js';
import { BIOME_RELIEF, BIOME_RELIEF_SPAN } from '@shared/biome-relief.generated.js';
import { WORLD_GROUND, RELIEF_WINDOW, terrainMaterial as biomeTerrainMaterial, makeWater, waters, WIND, VU, SURF_GLSL, setWaterReflection } from './biome-ground.generated.js';
import { REALM_WORLD } from './realmAir.js';
import { surfaceUniforms } from './surfaceState.js';

/** Realm biomes in a fixed order: the index is what each terrain vertex carries to pick its world's shader settings. */
export const REALM_ORDER = Object.freeze(Object.keys(REALM_WORLD));
const REALM_INDEX = Object.freeze(Object.fromEntries(REALM_ORDER.map((biome, index) => [biome, index])));
const DEFAULTS = { rock: [0.42, 0.38, 0.34], rockLo: 0.3, bump: 14, ripple: 0, wet: 0.5, foam: 0, caustic: 0, rows: 0, grain: 1, snow: 0, glow: 0, glowCol: [1.0, 0.32, 0.06], strata: 1, band: [0, 0] };
// Worlds that keep no open water of their own borrow the water of the world closest in climate.
const WATER_FALLBACK = { volcano: 'arctic', taiga: 'arctic', alpine: 'arctic', canyon: 'egypt', haven: 'ruins' };
const MARSH_CENTRE = OATH_BY_ID['oath-08'].center;

/** The ground of a realm: its Biome Triad world, that world's shader settings, and whether its colour function is used. */
export function realmGround(biome) {
  const world = REALM_WORLD[biome], ground = WORLD_GROUND[world];
  if (!ground) return null;
  const window = RELIEF_WINDOW[biome];
  // The colour function reads world positions, so it is only run where the realm's landforms came from the same world.
  const painted = Boolean(ground.paint) && window?.[0] === world;
  return { biome, world, index: REALM_INDEX[biome], detail: { ...DEFAULTS, ...ground.detail }, painted, window: painted ? window : null };
}
/** The look of a realm's open water: { color, distortion, scale, alpha } from its world's largest makeWater call. */
export function realmWaterLook(biome) {
  const world = REALM_WORLD[biome], own = WORLD_GROUND[world]?.waters ?? [];
  const list = own.some((w) => w.size >= 100) ? own : WORLD_GROUND[WATER_FALLBACK[world]]?.waters ?? own;
  const pick = [...list].sort((a, b) => b.size - a.size)[0];
  return pick ? { color: pick.color, distortion: pick.distortion ?? 2.5, scale: pick.scale ?? 3, alpha: pick.alpha ?? 1, world: own.includes(pick) ? world : WATER_FALLBACK[world] } : null;
}

// --- vertex colour ---------------------------------------------------------------------------------------
const painters = new Map(), broken = new Set();
function painterOf(world) {
  if (!painters.has(world)) {
    let made = null;
    try { made = WORLD_GROUND[world].paint(); } catch (error) { console.warn(`[ground] ${world} colour code did not start`, error); }
    painters.set(world, made);
  }
  return painters.get(world);
}
const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Water level under a point: the marsh pool stands above the sea. */
export { waterLevelAt };
const grounds = Object.fromEntries(REALM_ORDER.map((biome) => [biome, realmGround(biome)]));
/**
 * Colours one terrain vertex with its world's colour function.
 * `region` is regionAt(x, z); `h` the ground height; `up` the y of the ground normal; `lava` Aetherion's lava mask.
 * Returns { index, kind } for the vertex attributes, with `painted` false when the caller must colour it itself.
 */
export function paintGround(colour, region, x, z, h, up, lava = 0, out = { index: 0, kind: 0, painted: false }) {
  const ground = grounds[region.biome];
  out.index = ground?.index ?? 0; out.kind = 0; out.painted = false;
  // Molten channels are Aetherion's: the crust beside them takes the source's glowing-crack look (kind 1.2 .. 2).
  if (lava > .02) out.kind = 1.2 + .8 * Math.min(1, lava);
  if (!ground?.painted || broken.has(ground.world)) return out;
  const paint = painterOf(ground.world);
  if (!paint) { broken.add(ground.world); return out; }
  const [, wx, wz, span] = ground.window, scale = span / BIOME_RELIEF_SPAN, relief = BIOME_RELIEF[region.biome], shape = BIOMES[region.biome];
  const sx = wx + (x - region.center[0]) * scale, sz = wz + (z - region.center[1]) * scale;
  // Height the colour code sees: metres above the local water at the shore, rising to the height the same landform
  // has in the source world where that world is taller (its snow lines, strata and ice sit where it drew them).
  const above = h - waterLevelAt(x, z), source = relief.sourceMedian + (h - shape.base) / shape.amp * relief.reach;
  const y = above <= 0 ? above : above + smooth(above, 3, 14) * Math.max(0, source - above);
  try {
    paint.color(colour, sx, y, sz, up);
    // Crop rows (1) and ice (3) come from the world; its own lava lobes (between 1.2 and 2.5) are not Aetherion's lava.
    const kind = paint.kind ? Number(paint.kind(sx, y, sz, up)) || 0 : 0;
    if (kind > 2.5 || (kind > .5 && kind < 1.2)) out.kind = Math.max(out.kind, kind);
    out.painted = Number.isFinite(colour.r + colour.g + colour.b);
  } catch (error) { broken.add(ground.world); console.warn(`[ground] ${ground.world} colour code failed`, error); }
  return out;
}

// --- the ground shader -----------------------------------------------------------------------------------
const N = REALM_ORDER.length;
// Aetherion's surface-state window (wet, snow or ice, scorch, burn) answered through the source's surfAt().
const SURFACE_BRIDGE = `
uniform sampler2D uSurfaceMap; uniform vec4 uSurfaceRect, uSurfaceAmbient;
void surfAt(vec3 wp, out vec4 A, out vec4 B){
  vec2 uv = (wp.xz - uSurfaceRect.xy)*uSurfaceRect.zw; vec4 s = uSurfaceAmbient;
  if (uSurfaceRect.z > 0.0 && uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0)
    s = texture2D(uSurfaceMap, uv + (vec2(tvn(wp.xz*0.9), tvn(wp.zx*0.9 + 7.0)) - 0.5)*uSurfaceRect.zw*2.4);
  A = vec4(s.r, s.g, 0.0, s.b); B = vec4(s.a, 0.0, 0.0, 0.0);
}
`;
const PER_REALM = `
varying vec3 vGroundMask; flat varying float vBtRealm;
uniform vec4 uBtRock[${N}], uBtTD[${N}]; uniform vec3 uBtTE[${N}], uBtTF[${N}], uBtGlow[${N}]; uniform vec2 uBtTB[${N}];
#define uRock uBtRock[int(vBtRealm + 0.5)]
#define uTD uBtTD[int(vBtRealm + 0.5)]
#define uTE uBtTE[int(vBtRealm + 0.5)]
#define uTF uBtTF[int(vBtRealm + 0.5)]
#define uTB uBtTB[int(vBtRealm + 0.5)]
#define uGlowC uBtGlow[int(vBtRealm + 0.5)]
`;
/**
 * The continent's terrain material: Biome Triad's terrainMaterial with its settings chosen per realm.
 * Geometry must carry `color`, `kind` (float), `btRealm` (float, from paintGround) and `terrainMask` (road, plaza, lava).
 * On low quality the source's detail-normal block is left out (it is a dozen noise lookups per pixel).
 */
export function realmTerrainMaterial(quality = 'high') {
  const material = biomeTerrainMaterial({}), source = material.onBeforeCompile, low = quality === 'low';
  const rock = [], td = [], te = [], tf = [], tb = [], glow = [], colour = new THREE.Color();
  for (const biome of REALM_ORDER) {
    const d = grounds[biome]?.detail ?? DEFAULTS;
    colour.setRGB(d.rock[0], d.rock[1], d.rock[2], THREE.SRGBColorSpace);
    rock.push(new THREE.Vector4(colour.r, colour.g, colour.b, d.rockLo)); td.push(new THREE.Vector4(d.bump, d.ripple, d.wet, d.rows));
    te.push(new THREE.Vector3(d.foam, d.caustic, d.grain)); tf.push(new THREE.Vector3(d.snow, d.glow, d.strata));
    tb.push(new THREE.Vector2(d.band[0] ? Math.PI * 2 / d.band[0] : 0, d.band[1])); glow.push(new THREE.Vector3(...d.glowCol));
  }
  const uniforms = { uBtRock: { value: rock }, uBtTD: { value: td }, uBtTE: { value: te }, uBtTF: { value: tf }, uBtTB: { value: tb }, uBtGlow: { value: glow },
    uBtPool: { value: new THREE.Vector4(MARSH_CENTRE[0], MARSH_CENTRE[1], MARSH_RADIUS, MARSH_LEVEL - SEA_LEVEL) } };
  material.onBeforeCompile = (shader) => {
    if (low) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '');
    source(shader);
    Object.assign(shader.uniforms, surfaceUniforms, uniforms);
    // Shore effects (wet band, foam, caustics) are written against water at y = 0: the pool's level is taken off inside it.
    shader.vertexShader = 'attribute vec3 terrainMask; attribute float btRealm; varying vec3 vGroundMask; flat varying float vBtRealm; uniform vec4 uBtPool;\n'
      + shader.vertexShader.replace('#include <project_vertex>', `vGroundMask = terrainMask; vBtRealm = btRealm;
        vWP.y -= uBtPool.w*step(distance(vWP.xz, uBtPool.xy), uBtPool.z);
        #include <project_vertex>`);
    let fragment = shader.fragmentShader;
    if (!fragment.includes(SURF_GLSL)) throw new Error('Biome Triad terrain shader changed: surface block not found');
    fragment = fragment.replace(SURF_GLSL, SURFACE_BRIDGE);
    const firstLine = fragment.indexOf('\n') + 1;
    fragment = fragment.slice(0, firstLine) + PER_REALM + fragment.slice(firstLine);
    shader.fragmentShader = fragment
      .replace('#include <roughnessmap_fragment>', `
        { // Aetherion's roads and plazas stay legible: trodden earth over rock, strata and shore bands
          float road = clamp(max(vGroundMask.x, vGroundMask.y*0.6), 0.0, 1.0);
          vec3 bed = vColor.rgb*(0.8 + 0.3*n1)*(0.92 + 0.16*n2)*(1.0 - 0.3*sWet);
          diffuseColor.rgb = mix(diffuseColor.rgb, bed, road*0.85*(1.0 - 0.8*sSnow)*(1.0 - sScar));
          // molten rock in Aetherion's lava channels, under the source's cracked crust
          float molten = clamp(vGroundMask.z, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.055, 0.025), molten*0.85); }
        #include <roughnessmap_fragment>`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.17, 0.015)*smoothstep(0.35, 0.85, vGroundMask.z)*(0.22 + tvn(vWP.xz*0.8 + vec2(0.0, uT.x*0.05))*0.5);   // a dull red heart: the source's cracks carry the glow`);
  };
  material.customProgramCacheKey = () => `aetherion-biome-triad-ground-v1-${low ? 'low' : 'full'}`;
  material.userData.groundUniforms = uniforms;
  return material;
}

// --- water -----------------------------------------------------------------------------------------------
/**
 * Sea and marsh pool with Biome Triad's water. The sea takes the look of the realm the viewer stands in.
 * Reflections (three.js Water, a second render of the scene) run on high quality only, and only while open water is
 * within reach of the viewer; low and medium use the source's own cheap path (scrolling normal map, no extra pass).
 */
export function createRealmWater(ctx, { seaSize = 12000 } = {}) {
  const quality = ctx.quality?.name ?? 'high', headless = typeof document === 'undefined';
  const group = new THREE.Group(); group.name = 'Realm water';
  const made = [];
  function body(look, size, y, x = 0, z = 0, circle = 0) {
    const place = (mesh) => { if (circle) { mesh.geometry.dispose(); mesh.geometry = new THREE.CircleGeometry(circle, 64); } mesh.position.y = y; mesh.renderOrder = 1; group.add(mesh); return mesh; };
    if (headless) { // no canvas to paint the normal map on (tests, server): plain water of the same colour
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: look.color, roughness: .06, metalness: .1, transparent: true, opacity: look.alpha }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0, z); mesh.userData.cheap = true; mesh.userData.plain = true;
      return { cheap: place(mesh), mirror: null };
    }
    setWaterReflection(0);
    const cheap = place(makeWater({ size, color: look.color, distortion: look.distortion, scale: look.scale, alpha: Math.min(look.alpha, .96), cx: x, cz: z }));
    let mirror = null;
    if (quality === 'high') { setWaterReflection(512); mirror = place(makeWater({ size, color: look.color, distortion: look.distortion, scale: look.scale, alpha: look.alpha, cx: x, cz: z })); mirror.visible = false; setWaterReflection(0); }
    return { cheap, mirror };
  }
  const coast = realmWaterLook('coast'), marshLook = realmWaterLook('marsh');
  const sea = body(coast, seaSize, SEA_LEVEL - .12), pool = body(marshLook, MARSH_RADIUS * 2, MARSH_LEVEL - .12, MARSH_CENTRE[0], MARSH_CENTRE[1], MARSH_RADIUS);
  made.push(sea, pool);
  ctx.scene.add(group);
  // The sea's look follows the viewer from realm to realm.
  const looks = Object.fromEntries(REALM_ORDER.map((biome) => [biome, realmWaterLook(biome) ?? coast]));
  const current = { color: new THREE.Color(coast.color), distortion: coast.distortion, scale: coast.scale, alpha: coast.alpha }, target = new THREE.Color();
  const sunDirection = new THREE.Vector3(0, 1, 0), sunColour = new THREE.Color(1, 1, 1);
  let probe = 0, seaNear = true, poolNear = false;
  function openWaterNear(x, z) {
    for (const radius of [30, 90, 180, 300]) for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2 + radius, px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
      if (heightAt(px, pz) < SEA_LEVEL && waterLevelAt(px, pz) === SEA_LEVEL) return true;
    }
    return false;
  }
  function apply(pair, look) {
    const cheap = pair.cheap.material;
    cheap.color.copy(look.color); cheap.opacity = Math.min(look.alpha, .96);
    if (cheap.normalScale) cheap.normalScale.setScalar(.35 * look.distortion / 2.5);
    if (pair.mirror) { const u = pair.mirror.material.uniforms; u.waterColor.value.copy(look.color); u.distortionScale.value = look.distortion; u.size.value = look.scale; u.alpha.value = look.alpha; }
  }
  function update(dt, biome, viewer) {
    const look = looks[biome] ?? coast, k = 1 - Math.exp(-dt * 1.2);
    current.color.lerp(target.set(look.color), k); current.distortion += (look.distortion - current.distortion) * k; current.scale += (look.scale - current.scale) * k; current.alpha += (look.alpha - current.alpha) * k;
    apply(sea, current);
    const sun = ctx.render?.sun;
    if (sun) { sunDirection.copy(sun.position).sub(sun.target?.position ?? group.position).normalize(); sunColour.copy(sun.color).multiplyScalar(Math.min(1, sun.intensity / 2.5)); }
    if (viewer && (probe -= dt) <= 0) { probe = .5; seaNear = openWaterNear(viewer.x, viewer.z); poolNear = Math.hypot(viewer.x - MARSH_CENTRE[0], viewer.z - MARSH_CENTRE[1]) < MARSH_RADIUS + 300; }
    for (const [pair, near] of [[sea, seaNear], [pool, poolNear]]) if (pair.mirror) { pair.mirror.visible = near; pair.cheap.visible = !near; }
    // The source's own per-frame water step: scroll the cheap normal map, advance and light the reflective water.
    for (const w of waters) {
      if (w.userData.cheap) { w.material.normalMap.offset.x += dt * .004; w.material.normalMap.offset.y += dt * .0025; continue; }
      const wu = w.material.uniforms; wu.time.value += dt * .6; wu.sunDirection.value.copy(sunDirection); wu.sunColor.value.copy(sunColour);
    }
  }
  function dispose() {
    ctx.scene.remove(group);
    for (const pair of made) for (const mesh of [pair.cheap, pair.mirror]) {
      if (!mesh) continue;
      const at = waters.indexOf(mesh); if (at >= 0) waters.splice(at, 1);
      mesh.geometry.dispose(); mesh.material.normalMap?.dispose?.(); mesh.material.uniforms?.mirrorSampler?.value?.dispose?.(); mesh.material.dispose();
    }
  }
  return { group, sea, pool, update, dispose, stats: () => ({ reflective: Boolean(sea.mirror?.visible || pool.mirror?.visible), look: { ...current, color: current.color.getHexString() } }) };
}

const sunView = new THREE.Vector3(), ORIGIN = new THREE.Vector3();
/** Per-frame uniforms of the ground shader: time for foam, caustics and embers; the sun for snow glints. */
export function updateRealmGround(ctx, time) {
  WIND.value.x = time;
  const sun = ctx.render?.sun, camera = ctx.camera;
  if (!sun || !camera) return;
  sunView.copy(sun.position).sub(sun.target?.position ?? ORIGIN).normalize();
  VU.uSunDir.value.copy(sunView); VU.uSunView.value.copy(sunView).transformDirection(camera.matrixWorldInverse);
  VU.uSunCol.value.copy(sun.color).multiplyScalar(Math.min(1, sun.intensity / 2.5));
}
export const REALM_GROUNDS = grounds;
