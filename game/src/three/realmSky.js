// The sky of each realm: Biome Triad's volumetric clouds, cirrus, stars, moon, rain, flakes and aurora
// (biome-sky.generated.js, copied verbatim) placed over Aetherion and driven by the Biome Triad world the
// player's realm corresponds to (REALM_WORLD). This file only adapts: it chooses the world, eases its
// settings across realm borders, translates Aetherion's weather into the source's rain / fog factors and
// keeps the result inside Aetherion's camera range and under its bloom threshold.
import * as THREE from 'three';
import { BIOME_SKY, BIOME_CLOUD_DEFAULT, BIOME_CLOUD_STEPS, createBiomeSky } from './biome-sky.generated.js';
import { BIOME_WORLDS } from './biome-worlds.generated.js';
import { REALM_WORLD } from './realmAir.js';

/** Cloud march steps per Aetherion quality tier: the source's Fast / Balanced / Ultra presets. */
export const CLOUD_STEPS = Object.freeze({ low: BIOME_CLOUD_STEPS.fast, medium: BIOME_CLOUD_STEPS.balanced, high: BIOME_CLOUD_STEPS.ultra, ultra: BIOME_CLOUD_STEPS.ultra });

// Haven is a ring of floating islands over a sea of clouds: its deck sits below the camera (-950 to -330 m).
// Aetherion's crimson realm stands on the ground, where that deck would be under the terrain, so the same
// slab (same thickness, cover and cirrus) is raised overhead. Every other world's numbers are used as declared.
const OVERHEAD_BASE = 1500;

/** The cloud, Preetham and precipitation settings a realm biome takes from its Biome Triad world. */
export function realmSky(biome) {
  const id = REALM_WORLD[biome], world = BIOME_SKY[id];
  if (!world) return null;
  const clouds = { ...BIOME_CLOUD_DEFAULT, ...world.clouds };
  if (clouds.top <= 0) { clouds.top = OVERHEAD_BASE + (clouds.top - clouds.base); clouds.base = OVERHEAD_BASE; }
  return { world: id, clouds, sky: { ...world.sky }, ground: BIOME_WORLDS[id]?.ground ?? [.2, .2, .1], precip: world.precip, variants: world.variants };
}

// Aetherion's weather kinds have no falling-matter description of their own; when the realm's world does not
// describe that kind, the world that does lends its own (alpine snow above the freezing level, volcanic ash).
const SNOW = BIOME_SKY.alpine.variants.P_SNOW, ASH = BIOME_SKY.volcano.precip;
const falls = (precip) => !!precip && precip.kind !== 'none' && ((precip.base ?? .2) > 0 || (precip.storm ?? 1) > 0);

/**
 * Aetherion weather -> the source's inputs: rainK (0 clear .. 1 storm), fogK (1 clear .. 4 fogged in) and the
 * precipitation override for the frame (null = whatever the world declares).
 */
export function weatherInputs(kind, intensity, settings) {
  const k = Math.max(0, Math.min(1, intensity || 0)), world = settings?.precip;
  if (kind === 'storm') return { rainK: k, fogK: 1, precip: world?.kind === 'none' ? {} : null };
  if (kind === 'rain') return { rainK: k * .65, fogK: 1, precip: world?.kind === 'none' ? {} : world ? { ...world, lightning: false } : { lightning: false } };
  if (kind === 'snow') return { rainK: k * .5, fogK: 1, precip: { ...(world?.kind === 'snow' && falls(world) ? world : SNOW), rainLines: false, lightning: false } };
  if (kind === 'ash') return { rainK: k * .3, fogK: 1, precip: { ...(world?.kind === 'ash' ? world : ASH), rainLines: false, lightning: false } };
  if (kind === 'fog' || kind === 'mist') return { rainK: 0, fogK: 1 + k * 3, precip: null };
  return { rainK: 0, fogK: 1, precip: null };
}

const CLOUD_KEYS = ['cover', 'base', 'top', 'cirrus', 'dark'], SKY_KEYS = ['turbidity', 'rayleigh', 'mie', 'mieG'];
// Radiance ceiling for the cloud layer. The scene bloom starts at 1.05 and the sky dome is held at .97;
// sunlit cloud tops reach 4 and more, which would haze the whole frame.
const CLOUD_GAIN = .8, CLOUD_CEILING = .98, FLAKE_SCALE = 2.4;

/**
 * @param ctx   game context (scene, camera, quality, render.sun, render.hemi)
 * @param sky   Aetherion's Preetham dome; its turbidity / rayleigh / mie follow the realm's world
 * @returns null where there is no document (tests, server)
 */
export function initRealmSky(ctx, sky) {
  if (typeof document === 'undefined' || !ctx?.scene || !ctx.camera) return null;
  const { scene, camera } = ctx, hemi = ctx.render.hemi;
  const tier = ctx.quality?.name ?? 'medium', low = tier === 'low';
  const VU = { uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uHemiSky: { value: new THREE.Color() }, uHemiGround: { value: new THREE.Color() } };
  const B = createBiomeSky({ scene, VU, MAX_ANISO: ctx.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1 });
  B.clouds.name = 'Biome Triad volumetric clouds'; B.stars.name = 'Biome Triad stars'; B.moon.name = 'Biome Triad moon';
  B.rain.name = 'Biome Triad rain'; B.flakes.name = 'Biome Triad flakes';

  // Bloom guard: a soft shoulder on the cloud radiance, applied where the source writes its colour.
  B.CL.uGain = { value: CLOUD_GAIN }; B.CL.uCeil = { value: CLOUD_CEILING };
  const write = 'gl_FragColor = vec4(u, a);';
  if (!B.cloudMat.fragmentShader.includes(write)) throw new Error('realmSky: cloud shader changed, bloom guard not applied');
  B.cloudMat.fragmentShader = B.cloudMat.fragmentShader
    .replace('uniform vec2 uWind;', 'uniform float uGain, uCeil; uniform vec2 uWind;')
    .replace(write, 'u *= uGain; { float m = max(u.r, max(u.g, u.b)); u *= uCeil*(1.0 - exp(-m/uCeil))/max(m, 1e-4); }\n      ' + write);
  B.cloudMat.needsUpdate = true;

  // The source draws its stars and moon 8 to 9 km out; Aetherion's far plane is nearer, so they are scaled in.
  const reach = Math.min(1, camera.far * .9 / 9000);
  B.stars.scale.setScalar(reach); B.moon.scale.setScalar(380 * reach);
  // Low tier: the source's Fast march, and a lighter star field and flake box.
  if (low) B.stars.geometry.setDrawRange(0, 1300);
  const flakeShare = low ? .45 : 1;

  const S = { pos: new THREE.Vector3(), time: 0, flash: 0, nextFlash: 5 }, Q = { cloud: CLOUD_STEPS[tier] ?? CLOUD_STEPS.medium };
  const skyNow = {}, active = { precip: null, windK: 1 }, activeDef = { sky: skyNow, ground: [.2, .2, .1], precip: null };
  // The clouds are lit by the source's own light model (its sun, moon and sky bounce), computed into these
  // stand-ins; Aetherion's scene lights are left as the game sets them.
  const cloudSun = { color: new THREE.Color(), intensity: 0 }, cloudHemi = { color: new THREE.Color(), groundColor: new THREE.Color(), intensity: 0 };
  let settings = null, biomeNow = '', aurora = null, auroraK = 0, auroraGoal = 0, env = { day: 1, golden: 0, night: 0 };
  const goalClouds = { ...BIOME_CLOUD_DEFAULT }, goalSky = {};

  function enter(biome) {
    const next = realmSky(biome); if (!next) return;
    const first = !settings || S.time < 2; settings = next; biomeNow = biome;   // the first frames run before the player is placed
    Object.assign(goalClouds, next.clouds); Object.assign(goalSky, next.sky);
    if (first) { Object.assign(B.cloudState, goalClouds); Object.assign(skyNow, goalSky); }   // no deck sweeping through the camera on load
    auroraGoal = next.world === 'arctic' ? 1 : 0;
    if (auroraGoal && !aurora) { aurora = B.auroraMesh(); aurora.name = 'Biome Triad aurora'; scene.add(aurora); }
  }

  /** direction: unit vector to the sun. weather: { kind, intensity }. biome: the realm biome under the player. */
  function update(dt, direction, weather, biome) {
    if (biome && biome !== biomeNow) enter(biome);
    if (!settings) return;
    const ease = 1 - Math.exp(-dt / 4);
    for (const key of CLOUD_KEYS) B.cloudState[key] += (goalClouds[key] - B.cloudState[key]) * ease;
    for (const key of SKY_KEYS) skyNow[key] += (goalSky[key] - skyNow[key]) * ease;
    const wx = weatherInputs(weather.kind, weather.intensity, settings);
    activeDef.precip = settings.precip; active.precip = wx.precip;
    S.time += dt; S.pos.copy(camera.position);

    activeDef.ground = settings.ground;
    const el = Math.asin(Math.max(-1, Math.min(1, direction.y)));
    env = B.update({ sky, sun: cloudSun, hemi: cloudHemi, S, Q, active, activeDef, dt, sunDir: direction, el, rainK: wx.rainK, fogK: wx.fogK });
    hemi.intensity *= 1 + S.flash * 4;   // lightning lifts the game's sky light too, for a fifth of a second

    B.moon.position.copy(S.pos).addScaledVector(B.moonDir, 8000 * reach);
    // The source frames its flakes from a first-person eye; Aetherion's camera rides some metres behind the hero, so they are drawn larger.
    if (B.flakes.visible) B.flakes.material.size *= FLAKE_SCALE;
    if (B.flakes.visible && flakeShare < 1) B.flakes.geometry.setDrawRange(0, Math.round(B.flakes.geometry.drawRange.count * flakeShare));
    if (aurora) {
      // Arctic world: aurora at night, washed out by weather (index.html, arctic build(): smoothstep(0.2, 0.9, night) * (1 - rain) * 0.75).
      auroraK += (auroraGoal - auroraK) * ease;
      const night = THREE.MathUtils.smoothstep(env.night, .2, .9) * (1 - wx.rainK) * .75 * auroraK;
      aurora.visible = night > .004; aurora.position.copy(S.pos); aurora.material.uniforms.uInt.value = night;
    }
  }

  function dispose() {
    for (const object of [B.clouds, B.stars, B.moon, B.rain, B.flakes, aurora]) {
      if (!object) continue;
      scene.remove(object); if (!object.isSprite) object.geometry?.dispose?.(); object.material?.dispose?.();
    }
    B.tex.glow?.dispose(); B.tex.flake?.dispose();
  }
  return {
    update, dispose, source: B,
    get settings() { return settings; },
    get state() { return { biome: biomeNow, world: settings?.world, clouds: { ...B.cloudState }, sky: { ...skyNow }, cover: B.CL.uCover.value, dark: B.CL.uDark.value, steps: Q.cloud, night: env.night, stars: B.stars.material.opacity, aurora: aurora?.material.uniforms.uInt.value ?? 0, flakes: B.flakes.visible ? B.flakes.geometry.drawRange.count : 0, rain: B.rain.visible }; },
  };
}
