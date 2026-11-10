// Biome Triad's surface and environmental state layer, running under the open world.
// One sparse layer covers the continent. Casts strike it with their school, the realm's climate and the current
// weather act on it, and the cells around the player are mirrored into a small texture that the ground shaders read:
// wet ground darkens and turns glossy, snow and ice whiten it, fire leaves char and live embers.
// Presentation and a HUD reading only: damage stays with the authoritative simulation.
import * as THREE from 'three';
import { createBiomeSurfaceLayer, ELEMENTS } from '@shared/biome-surface/index.mjs';
import { groundMaterialAt, climateAt, describeGround } from '@shared/biome-ground.js';
import { ABILITY_BY_ID } from '@shared/abilities.js';

const CELL = 3, WINDOW = 96; // 96 x 96 cells = 288 m around the player
const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat); blank.needsUpdate = true;
/** Shared by every ground material. Safe to bind before the layer exists (reads as untouched ground). */
export const surfaceUniforms = {
  uSurfaceMap: { value: blank },
  uSurfaceRect: { value: new THREE.Vector4(0, 0, 0, 0) }, // min x, min z, 1 / width, 1 / depth
  uSurfaceAmbient: { value: new THREE.Vector4(0, 0, 0, 0) }, // wet, frost, char, ember outside the window
  uSurfaceTime: { value: 0 },
};
const HEAD = `
  uniform sampler2D uSurfaceMap; uniform vec4 uSurfaceRect; uniform vec4 uSurfaceAmbient; uniform float uSurfaceTime;
  float surfHash(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453);}
  float surfNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(surfHash(i),surfHash(i+vec2(1,0)),f.x),mix(surfHash(i+vec2(0,1)),surfHash(i+vec2(1)),f.x),f.y);}
  vec4 surfaceState(vec3 world){
    vec2 uv=(world.xz-uSurfaceRect.xy)*uSurfaceRect.zw;
    if(uSurfaceRect.z<=0.||uv.x<=0.||uv.x>=1.||uv.y<=0.||uv.y>=1.)return uSurfaceAmbient;
    // Break the 3 m cells up with a little world-space jitter so scars have ragged edges.
    vec2 jitter=(vec2(surfNoise(world.xz*.9),surfNoise(world.zx*.9+7.))-.5)*uSurfaceRect.zw*2.4;
    return texture2D(uSurfaceMap,uv+jitter);
  }`;
/**
 * Adds surface-state shading to a MeshStandardMaterial whose fragment shader has a world-position varying.
 * `flat` is a GLSL float expression that is 1 on walkable faces and 0 on walls (snow and puddles do not climb walls).
 */
export function applySurfaceShading(shader, worldVarying, flat = '1.') {
  Object.assign(shader.uniforms, surfaceUniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${HEAD}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec4 surf=surfaceState(${worldVarying})*(${flat});
      float surfGrain=surfNoise(${worldVarying}.xz*2.3);
      float surfWet=smoothstep(.12,.7,surf.r+surfGrain*.14);
      float surfFrost=smoothstep(.1,.55,surf.g+surfGrain*.2);
      float surfChar=smoothstep(.06,.5,surf.b+surfGrain*.12);
      diffuseColor.rgb*=1.-surfWet*.4;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.045,.04,.037),surfChar*.86);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.8,.85,.9),surfFrost*.82);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor=mix(roughnessFactor,.16,surfWet*.85*(1.-surfFrost));
      roughnessFactor=mix(roughnessFactor,.42,surfFrost*.5);`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float surfEmber=surf.a*smoothstep(.35,.8,surfNoise(${worldVarying}.xz*3.1+vec2(0.,uSurfaceTime*.6))+surf.a*.35);
      totalEmissiveRadiance+=vec3(1.,.26,.04)*surfEmber*(.9+sin(uSurfaceTime*7.+surfGrain*40.)*.25);`);
}

const FLAME_VERT = `
  attribute vec4 flame; uniform float uTime; varying vec2 vUv; varying float vSeed; varying float vHeat;
  void main(){ vUv=uv; vSeed=flame.w; vHeat=instanceColor.r;
    vec3 centre=flame.xyz; float h=.8+vHeat*1.3;
    vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
    float sway=sin(uTime*3.+flame.w*31.)*.12*uv.y;
    vec3 p=centre+right*((position.x+sway)*(.9+vHeat*.5))+vec3(0.,position.y*h,0.);
    gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`;
const FLAME_FRAG = `
  uniform float uTime; varying vec2 vUv; varying float vSeed; varying float vHeat;
  float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1)),f.x),f.y);}
  void main(){ vec2 q=vec2((vUv.x-.5)*2.,vUv.y);
    float lick=n(vec2(q.x*2.4+vSeed*17.,q.y*3.2-uTime*2.6))*.6+n(vec2(q.x*5.+vSeed*5.,q.y*6.-uTime*4.2))*.4;
    float body=1.-smoothstep(.0,1.,abs(q.x)*(1.5+q.y*2.2)+q.y*.9-lick*.95);
    if(body<.02)discard;
    // Kept under the bloom threshold except at the core, so a fire reads orange rather than white.
    vec3 c=mix(vec3(.62,.07,.01),vec3(1.,.46,.07),smoothstep(.3,.95,body));
    gl_FragColor=vec4(c*(.75+vHeat*.35),body*.8); }`;

export function initSurfaceState(ctx) {
  const layer = createBiomeSurfaceLayer('aetherion', { materialAt: groundMaterialAt, cellSize: CELL, maxCells: 6000, spreadRate: .7 });
  const surface = layer.surface;
  const data = new Uint8Array(WINDOW * WINDOW * 4);
  const map = new THREE.DataTexture(data, WINDOW, WINDOW, THREE.RGBAFormat);
  map.magFilter = map.minFilter = THREE.LinearFilter; map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  surfaceUniforms.uSurfaceMap.value = map;
  const maxFlames = ctx.quality?.name === 'low' ? 16 : 48;
  const flameGeo = new THREE.PlaneGeometry(1, 1); flameGeo.translate(0, .5, 0);
  flameGeo.setAttribute('flame', new THREE.InstancedBufferAttribute(new Float32Array(maxFlames * 4), 4));
  const flameMat = new THREE.ShaderMaterial({ vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, uniforms: { uTime: surfaceUniforms.uSurfaceTime },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const flames = new THREE.InstancedMesh(flameGeo, flameMat, maxFlames);
  flames.name = 'Surface fire'; flames.frustumCulled = false; flames.count = 0; flames.renderOrder = 4;
  flames.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxFlames * 3), 3);
  ctx.scene.add(flames);
  const firelight = new THREE.PointLight('#ff7a2a', 0, 26, 1.6); ctx.scene.add(firelight);
  let weather = { kind: 'clear', intensity: 0 }, wind = [.8 * 2.5, .6 * 2.5], rebuild = 0, reading = '', readingAt = 0, sequence = 0, disposed = false;
  const offs = [];
  const on = (name, fn) => { const off = ctx.bus?.on?.(name, fn); if (typeof off === 'function') offs.push(off); };
  on('world:weather', (w) => { if (w?.kind) weather = { kind: w.kind, intensity: w.intensity ?? 1 }; });
  on('world:wind', (w) => { if (w?.direction) wind = [w.direction.x * (w.speed ?? 2.5), w.direction.z * (w.speed ?? 2.5)]; });

  function strike(element, x, z, radius, intensity, abilityUid = null) {
    if (!ELEMENTS.includes(element) || !Number.isFinite(x) || !Number.isFinite(z)) return;
    try { layer.impact({ eventId: `cast:${surface.tick}:${sequence++}`, element, position: [x, 0, z], radius: Math.min(12, Math.max(1.5, radius)), intensity, abilityUid }); }
    catch (error) { console.warn('[surface] impact refused', error); }
  }
  // Every cast that lands on the ground marks it, for players, adventurers and creatures alike.
  on('net:ev', (payload) => {
    const e = payload?.e ?? payload;
    if (e?.type !== 'cast' || !e.aim || e.release === false) return;
    const ability = ABILITY_BY_ID[e.ability];
    const element = ability?.school ?? e.element;
    if (!element || (e.castTime ?? 0) > .05 && !e.telegraph) return; // channelled casts mark the ground on release
    const power = e.slot === 5 ? 1.3 : ability ? .85 : .5, radius = e.radius ?? ability?.radius ?? 2;
    const shape = e.shape ?? ability?.shape;
    if (shape === 'self') return;
    if (shape === 'line' && e.dir) {
      const caster = ctx.actors?.get?.(e.src)?.position ?? (e.src === ctx.net?.selfId ? ctx.actors?.player?.position : null);
      const length = Math.min(ability?.range ?? 12, caster ? Math.hypot(e.aim.x - caster.x, e.aim.z - caster.z) || 12 : 12);
      const ox = caster?.x ?? e.aim.x - e.dir.x * length, oz = caster?.z ?? e.aim.z - e.dir.z * length;
      for (let t = .3; t <= 1.01; t += .35) strike(element, ox + e.dir.x * length * t, oz + e.dir.z * length * t, Math.max(1.5, radius), power * .7, e.ability);
    } else strike(element, e.aim.x, e.aim.z, radius, power, e.ability);
  });

  const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  const pack = (c, out, i) => { out[i] = byte(c.wetness); out[i + 1] = byte(Math.max(c.snow, c.ice)); out[i + 2] = byte(c.scorch); out[i + 3] = byte(c.burn); };
  const burning = [];
  function mirror(px, pz) {
    const a = surface.ambient, ax = byte(a.wetness), ay = byte(Math.max(a.snow, a.ice));
    for (let i = 0; i < data.length; i += 4) { data[i] = ax; data[i + 1] = ay; data[i + 2] = 0; data[i + 3] = 0; }
    const cx = Math.floor(px / CELL) - WINDOW / 2, cz = Math.floor(pz / CELL) - WINDOW / 2;
    burning.length = 0;
    for (const c of surface.cells.values()) {
      const ix = Math.floor(c.x / CELL) - cx, iz = Math.floor(c.z / CELL) - cz;
      if (ix < 0 || iz < 0 || ix >= WINDOW || iz >= WINDOW) continue;
      pack(c, data, (iz * WINDOW + ix) * 4);
      if (c.burn > .28 && c.flammability > .02) burning.push(c);
    }
    map.needsUpdate = true;
    surfaceUniforms.uSurfaceRect.value.set(cx * CELL, cz * CELL, 1 / (WINDOW * CELL), 1 / (WINDOW * CELL));
    surfaceUniforms.uSurfaceAmbient.value.set(a.wetness, Math.max(a.snow, a.ice), 0, 0);
    // Nearest fires get a flame each; one light sits on the strongest of them.
    burning.sort((p, q) => Math.hypot(p.x - px, p.z - pz) - Math.hypot(q.x - px, q.z - pz));
    const attr = flameGeo.attributes.flame, count = Math.min(maxFlames, burning.length);
    let hottest = null;
    for (let i = 0; i < count; i++) {
      const c = burning[i], y = ctx.world?.heightAt?.(c.x, c.z) ?? 0;
      const seed = Math.abs(Math.sin(c.x * 12.9898 + c.z * 78.233)) % 1;
      attr.setXYZW(i, c.x + (seed - .5) * 1.6, y - .05, c.z + ((seed * 7.3) % 1 - .5) * 1.6, seed);
      flames.instanceColor.setXYZ(i, c.burn, c.burn, c.burn);
      if (!hottest || c.burn > hottest.burn) hottest = c;
    }
    flames.count = count; attr.needsUpdate = true; flames.instanceColor.needsUpdate = true;
    if (hottest) { firelight.position.set(hottest.x, (ctx.world?.heightAt?.(hottest.x, hottest.z) ?? 0) + 1.6, hottest.z); firelight.intensity = Math.min(26, 8 + count); }
    else firelight.intensity = 0;
  }

  function update(dt) {
    if (disposed) return;
    const p = ctx.actors?.player?.position ?? ctx.camera?.position;
    if (!p) return;
    surfaceUniforms.uSurfaceTime.value += dt;
    const live = ctx.render?.weather; if (live?.kind) weather = live;
    const climate = climateAt(p.x, p.z);
    const wetWeather = weather.kind === 'rain' || weather.kind === 'storm' || weather.kind === 'snow';
    layer.update(dt, {
      rain: wetWeather ? weather.intensity : 0, wind,
      humidity: Math.min(1, climate.humidity + (weather.kind === 'mist' || weather.kind === 'fog' ? .3 : 0)),
      temperature: climate.temperature - (weather.kind === 'snow' ? 6 : 0),
    });
    rebuild -= dt;
    if (rebuild <= 0) { rebuild = .12; mirror(p.x, p.z); }
    readingAt -= dt;
    if (readingAt <= 0) {
      readingAt = .5;
      const next = describeGround(surface.sample(p.x, p.z));
      if (next !== reading) { reading = next; ctx.bus?.emit?.('world:ground', { text: next }); }
    }
  }
  const stop = ctx.addUpdate?.(update, 44);
  return {
    layer, strike, update,
    sample: (x, z) => surface.sample(x, z),
    get stats() { return { cells: surface.cells.size, tick: surface.tick, flames: flames.count, ambient: { wetness: surface.ambient.wetness, snow: surface.ambient.snow } }; },
    dispose() { disposed = true; stop?.(); offs.forEach((off) => off()); ctx.scene.remove(flames, firelight); flameGeo.dispose(); flameMat.dispose(); map.dispose(); surfaceUniforms.uSurfaceMap.value = blank; surfaceUniforms.uSurfaceRect.value.set(0, 0, 0, 0); },
  };
}
