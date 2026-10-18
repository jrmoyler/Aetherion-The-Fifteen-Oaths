// Render & atmosphere: physically based sky (sun, moon, clouds, stars), day/night cycle,
// sky-generated image based lighting, cascaded shadows, post-processing (ACES, bloom, FXAA,
// grain, vignette, chromatic aberration, sharpen, SSAO2), height fog + aerial perspective on
// every material, per-region colour grading and weather.  API: see game/CONTRACTS.md.
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera.js';
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { ReflectionProbe } from '@babylonjs/core/Probes/reflectionProbe.js';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.js';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent.js';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent.js';
import '@babylonjs/core/Rendering/depthRendererSceneComponent.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves.js';
import { SphericalHarmonics, SphericalPolynomial } from '@babylonjs/core/Maths/sphericalPolynomial.js';
import '@babylonjs/core/Materials/Textures/baseTexture.polynomial.js';
import { regionWeights, heightAt } from '@shared/terrain.js';
import { atmo, registerAerialPlugin, skyRadiance, transmittance } from './atmosphere.js';
import { createSky } from './sky.js';
import { createWeather } from './weather.js';
import { GRADES, NEUTRAL_GRADE, REGION_WEATHER } from './grades.js';

export { atmo } from './atmosphere.js';

const HOURS_PER_SECOND = 24 / (48 * 60); // one game day = 48 real minutes
const LAT = 40 * Math.PI / 180, DECL = 12 * Math.PI / 180, MOON_DECL = -6 * Math.PI / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function celestial(hourAngle, decl, out) {
  const sH = Math.sin(hourAngle), cH = Math.cos(hourAngle);
  const east = -Math.cos(decl) * sH;
  const north = Math.cos(LAT) * Math.sin(decl) - Math.sin(LAT) * Math.cos(decl) * cH;
  const up = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * cH;
  return out.set(east, up, north).normalize();
}

export async function init(ctx) {
  const { scene, engine, quality, params } = ctx;
  try { registerAerialPlugin(); } catch (e) { console.warn('[render] aerial plugin', e); }
  scene.clearColor = new Color4(0.5, 0.55, 0.62, 1);
  scene.fogEnabled = false; // replaced by the aerial-perspective plugin
  scene.ambientColor = new Color3(0, 0, 0);

  // ---------------- lights ----------------
  const sun = new DirectionalLight('sun', new Vector3(-0.4, -0.6, 0.6), scene);
  sun.intensity = 3.5; sun.position = new Vector3(0, 400, 0);
  sun.shadowMinZ = 0; sun.shadowMaxZ = 2000;
  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.2; hemi.specular = new Color3(0, 0, 0);

  // ---------------- temporary camera ----------------
  let camera = makeTempCamera(ctx);
  scene.activeCamera = camera;

  // ---------------- sky ----------------
  let sky = null;
  try { sky = createSky(scene, quality); } catch (e) { console.warn('[render] sky failed', e); }

  // ---------------- shadows ----------------
  let shadows = null;
  const casters = new Set();
  if (quality.shadows) {
    try {
      shadows = new CascadedShadowGenerator(quality.shadowSize, sun, undefined, undefined);
      shadows.numCascades = Math.max(1, Math.min(4, quality.cascades));
      shadows.lambda = 0.82;
      shadows.stabilizeCascades = true;
      shadows.usePercentageCloserFiltering = true;
      shadows.filteringQuality = quality.name === 'ultra' ? CascadedShadowGenerator.QUALITY_HIGH : CascadedShadowGenerator.QUALITY_MEDIUM;
      shadows.cascadeBlendPercentage = 0.08;
      shadows.depthClamp = true;
      shadows.bias = 0.0025; shadows.normalBias = 0.012;
      shadows.darkness = 0;
      shadows.shadowMaxZ = quality.name === 'ultra' ? 420 : quality.name === 'high' ? 300 : 200;
      shadows.autoCalcDepthBounds = false;
      shadows.freezeShadowCastersBoundingInfo = false;
    } catch (e) { console.warn('[render] shadows disabled', e); shadows = null; }
  }
  function addShadowCaster(mesh, includeChildren = true) {
    if (!shadows || !mesh) return; casters.add(mesh);
    try { shadows.addShadowCaster(mesh, includeChildren); } catch (e) { console.warn('[render] addShadowCaster', e); }
  }
  function removeShadowCaster(mesh) {
    if (!shadows || !mesh) return; casters.delete(mesh);
    try { shadows.removeShadowCaster(mesh, true); } catch { /* ignore */ }
  }

  // ---------------- image based lighting from the sky ----------------
  let probe = null;
  if (sky) {
    try {
      probe = new ReflectionProbe('skyProbe', quality.name === 'low' ? 64 : 128, scene, true, true, true);
      probe.renderList.push(sky.mesh);
      probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
      probe.cubeTexture.coordinatesMode = Texture.CUBIC_MODE;
      scene.environmentTexture = probe.cubeTexture;
      scene.environmentIntensity = 1;
    } catch (e) { console.warn('[render] IBL probe failed', e); probe = null; }
  }

  // ---------------- post-processing ----------------
  let pipeline = null, ssao = null;
  const grade = { cur: { ...NEUTRAL_GRADE }, target: { ...NEUTRAL_GRADE }, manual: null };
  const curves = new ColorCurves();
  function buildPipeline(cam) {
    try { ssao?.dispose(); } catch { /* ignore */ }
    try { pipeline?.dispose(); } catch { /* ignore */ }
    ssao = null; pipeline = null;
    if (quality.ssao) {
      try {
        if (SSAO2RenderingPipeline.IsSupported) {
          ssao = new SSAO2RenderingPipeline('aeSSAO', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [cam]);
          ssao.radius = 1.6; ssao.totalStrength = 1.1; ssao.base = 0.12; ssao.samples = quality.name === 'ultra' ? 16 : 10;
          ssao.maxZ = 220; ssao.minZAspect = 0.4; ssao.expensiveBlur = quality.name === 'ultra';
        }
      } catch (e) { console.warn('[render] SSAO2 disabled', e); ssao = null; }
    }
    try {
      const p = new DefaultRenderingPipeline('aePipeline', true, scene, [cam]);
      p.samples = 1;
      p.fxaaEnabled = quality.fxaa !== false;
      p.imageProcessingEnabled = true;
      const ip = p.imageProcessing;
      ip.toneMappingEnabled = true;
      ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
      ip.exposure = 1; ip.contrast = 1.08;
      ip.vignetteEnabled = true; ip.vignetteWeight = 1.6; ip.vignetteStretch = 0.2; ip.vignetteColor = new Color4(0.03, 0.03, 0.05, 0);
      ip.vignetteCameraFov = 0.6;
      ip.colorCurvesEnabled = true; ip.colorCurves = curves;
      ip.ditheringEnabled = true; ip.ditheringIntensity = 1 / 255;
      p.bloomEnabled = !!quality.bloom;
      if (p.bloomEnabled) { p.bloomThreshold = 1.15; p.bloomWeight = 0.16; p.bloomKernel = 64; p.bloomScale = 0.5; }
      p.grainEnabled = quality.name !== 'low';
      if (p.grainEnabled) { p.grain.intensity = 3.5; p.grain.animated = true; }
      p.chromaticAberrationEnabled = quality.name === 'high' || quality.name === 'ultra';
      if (p.chromaticAberrationEnabled) { p.chromaticAberration.aberrationAmount = 4; p.chromaticAberration.radialIntensity = 0.8; }
      p.sharpenEnabled = quality.name !== 'low';
      if (p.sharpenEnabled) { p.sharpen.edgeAmount = 0.22; p.sharpen.colorAmount = 1; }
      pipeline = p;
    } catch (e) { console.warn('[render] pipeline failed', e); pipeline = null; }
  }
  buildPipeline(camera);

  // ---------------- weather ----------------
  let weather = null;
  try { weather = createWeather(scene, quality); } catch (e) { console.warn('[render] weather disabled', e); }
  let weatherManual = false;

  // ---------------- time of day ----------------
  let timeOfDay = 16.8, timeScale = 1;
  const tp = parseFloat(params?.get?.('time'));
  if (Number.isFinite(tp)) timeOfDay = ((tp % 24) + 24) % 24;
  const ts = parseFloat(params?.get?.('timescale'));
  if (Number.isFinite(ts)) timeScale = ts;
  const wxParam = params?.get?.('weather');
  if (wxParam && weather) { const [k, i] = wxParam.split(','); weather.setWeather(k, i ? +i : 1); weatherManual = true; }

  const sunDir = new Vector3(), moonDir = new Vector3(), lastProbeSun = new Vector3(0, -1, 0);
  const tmpT = [0, 0, 0], tmpA = [0, 0, 0], tmpB = [0, 0, 0], tmpZ = [0, 0, 0];
  const dirArr = [0, 0, 0], sunArr = [0, 0, 0];
  let lastSkyEval = -1, probeTimer = 0, probeDirty = true, autoGradeTimer = 0, lastCover = -1;
  const skyCols = { zen: new Color3(), away: new Color3(), toward: new Color3(), ms: new Color3(), sunT: new Color3(), night: 0, day: 1 };

  function evalSky(w) {
    const s = sunArr; s[0] = sunDir.x; s[1] = sunDir.y; s[2] = sunDir.z;
    const S = sky ? sky.state.sunScale : 20;
    const haze = 1 + (w?.fogMul ?? 1) * 0.4;
    transmittance(200, Math.max(-1, sunDir.y), tmpT);
    skyRadiance([0, 1, 0], s, 200, tmpZ, haze);
    const ax = -sunDir.x, az = -sunDir.z, al = Math.hypot(ax, az) || 1;
    skyRadiance([ax / al * 0.995, 0.06, az / al * 0.995], s, 200, tmpA, haze);
    skyRadiance([-ax / al * 0.995, 0.06, -az / al * 0.995], s, 200, tmpB, haze);
    const night = 1 - smoothstep(-0.12, 0.02, sunDir.y);
    const moonUp = smoothstep(-0.05, 0.2, moonDir.y);
    const nr = 0.010 + 0.02 * moonUp, ng = 0.013 + 0.026 * moonUp, nb = 0.024 + 0.04 * moonUp; // night sky floor
    skyCols.zen.set(tmpZ[0] * S + nr, tmpZ[1] * S + ng, tmpZ[2] * S + nb);
    const msk = 0.42;
    skyCols.ms.set((tmpZ[0] + tmpA[0]) * 0.5 * S * msk + nr, (tmpZ[1] + tmpA[1]) * 0.5 * S * msk + ng, (tmpZ[2] + tmpA[2]) * 0.5 * S * msk + nb);
    // single scattering leaves the horizon slightly green: nudge toward a cool white haze
    skyCols.away.set((tmpA[0] * S + skyCols.ms.r) * 0.92, (tmpA[1] * S + skyCols.ms.g) * 0.97, (tmpA[2] * S + skyCols.ms.b) * 1.16);
    skyCols.toward.set((tmpB[0] * S + skyCols.ms.r) * 1.02, (tmpB[1] * S + skyCols.ms.g) * 0.97, (tmpB[2] * S + skyCols.ms.b) * 1.0);
    skyCols.sunT.set(tmpT[0], tmpT[1], tmpT[2]);
    skyCols.night = night; skyCols.day = 1 - night;
  }

  function computeSH(w) {
    if (!probe) return;
    try {
      const sh = new SphericalHarmonics();
      const N = 64; const S = sky ? sky.state.sunScale : 20; const out = [0, 0, 0];
      const cover = w ? w.cover : 0.4; const over = smoothstep(0.55, 1, cover);
      const sunI = sun.intensity; const sd = sun.diffuse;
      const gAlb = [0.16, 0.15, 0.12];
      const dir = new Vector3(), col = new Color3();
      const zl = (skyCols.zen.r + skyCols.zen.g + skyCols.zen.b) / 3;
      for (let i = 0; i < N; i++) {
        const y = 1 - (i + 0.5) / N * 2; const r = Math.sqrt(1 - y * y); const phi = i * 2.399963;
        dir.set(Math.cos(phi) * r, y, Math.sin(phi) * r);
        if (y > 0) {
          dirArr[0] = dir.x; dirArr[1] = y; dirArr[2] = dir.z;
          skyRadiance(dirArr, sunArr, 200, out, 1.4);
          let cr = out[0] * S + skyCols.ms.r, cg = out[1] * S + skyCols.ms.g, cb = out[2] * S + skyCols.ms.b;
          const l = (cr + cg + cb) / 3; // overcast: flatten toward grey
          cr += (l - cr) * over; cg += (l - cg) * over; cb += (l - cb) * over;
          col.set(cr * grade.cur.tint[0], cg * grade.cur.tint[1], cb * grade.cur.tint[2]);
        } else {
          const e = sunI * Math.max(0, sunDir.y) + zl * 2.2; const k = 0.6 + 0.4 * (-y);
          col.set(gAlb[0] * (e * sd.r) * k, gAlb[1] * (e * sd.g) * k, gAlb[2] * (e * sd.b) * k);
        }
        sh.addLight(dir, col, (4 * Math.PI) / N);
      }
      sh.convertIncidentRadianceToIrradiance();
      sh.convertIrradianceToLambertianRadiance();
      probe.cubeTexture.sphericalPolynomial = SphericalPolynomial.FromHarmonics(sh);
    } catch (e) { console.warn('[render] SH failed', e); }
  }

  function applyGrade(dt) {
    const c = grade.cur, t = grade.target; const k = Math.min(1, dt * 0.8);
    for (const key of ['fogMul', 'sat', 'hue', 'density', 'exposure', 'contrast', 'shadowsHue', 'shadowsDensity']) c[key] += (t[key] - c[key]) * k;
    for (let i = 0; i < 3; i++) { c.tint[i] += (t.tint[i] - c.tint[i]) * k; c.amb[i] += (t.amb[i] - c.amb[i]) * k; }
    curves.globalSaturation = c.sat; curves.globalHue = c.hue; curves.globalDensity = c.density;
    curves.shadowsHue = c.shadowsHue; curves.shadowsDensity = c.shadowsDensity; curves.shadowsSaturation = 0;
  }

  function autoGrade() {
    if (grade.manual) return;
    const cam = scene.activeCamera; if (!cam) return;
    const p = cam.globalPosition ?? cam.position;
    const ws = regionWeights(p.x, p.z, 2);
    blendGrades(ws.map((w) => [w.id, Math.pow(w.w, 1.5)]), grade.target);
    if (weather && !weatherManual) {
      const top = ws[0]; const wx = REGION_WEATHER[top.id];
      if (wx) weather.setWeather(wx[0], wx[1] * smoothstep(0.55, 0.85, top.w)); else weather.setWeather('clear', 0);
    }
  }

  function blendGrades(list, out) {
    const tot = list.reduce((a, [, w]) => a + w, 0) || 1;
    Object.assign(out, { ...NEUTRAL_GRADE, tint: [0, 0, 0], amb: [0, 0, 0] });
    for (const key of ['fogMul', 'sat', 'hue', 'density', 'exposure', 'contrast', 'shadowsHue', 'shadowsDensity']) out[key] = 0;
    let hx = 0, hy = 0, shx = 0, shy = 0;
    for (const [id, w0] of list) {
      const g = GRADES[id] ?? NEUTRAL_GRADE; const w = w0 / tot;
      for (const key of ['fogMul', 'sat', 'density', 'exposure', 'contrast', 'shadowsDensity']) out[key] += g[key] * w;
      hx += Math.cos(g.hue * Math.PI / 180) * w * (g.density + 1); hy += Math.sin(g.hue * Math.PI / 180) * w * (g.density + 1);
      shx += Math.cos(g.shadowsHue * Math.PI / 180) * w; shy += Math.sin(g.shadowsHue * Math.PI / 180) * w;
      for (let i = 0; i < 3; i++) { out.tint[i] += g.tint[i] * w; out.amb[i] += g.amb[i] * w; }
    }
    out.hue = ((Math.atan2(hy, hx) * 180 / Math.PI) + 360) % 360; out.shadowsHue = ((Math.atan2(shy, shx) * 180 / Math.PI) + 360) % 360;
  }

  function setRegionGrade(oathId, weight = 1) {
    if (!oathId || weight <= 0 || !GRADES[oathId]) { grade.manual = null; return; }
    grade.manual = { oathId, weight };
    blendGrades([[oathId, weight], ['neutral', Math.max(0, 1 - weight)]], grade.target);
  }

  const camDirTmp = new Vector3();
  function update(dt) {
    atmo.time += dt;
    timeOfDay = (timeOfDay + dt * HOURS_PER_SECOND * timeScale) % 24;
    const H = (timeOfDay - 12) / 24 * Math.PI * 2;
    celestial(H, DECL, sunDir);
    celestial(H + Math.PI + 0.35, MOON_DECL, moonDir);
    atmo.sunDir.copyFrom(sunDir); atmo.moonDir.copyFrom(moonDir);

    const cam = scene.activeCamera;
    if (cam) { atmo.camPos.copyFrom(cam.globalPosition ?? cam.position); cam.getDirectionToRef(Vector3.Forward(), camDirTmp); }

    const w = weather ? weather.update(dt, atmo.camPos, camDirTmp) : null;
    autoGradeTimer -= dt; if (autoGradeTimer <= 0) { autoGradeTimer = 0.3; autoGrade(); }
    applyGrade(dt);

    if (Math.abs(atmo.time - lastSkyEval) > 0.2 || lastSkyEval < 0) { evalSky(w); lastSkyEval = atmo.time; }
    const night = skyCols.night, day = skyCols.day;
    atmo.night = night;
    const light = w ? w.light : 1;
    const g = grade.cur;

    // dominant light: sun by day, moon by night (crossfade through ~zero at dusk)
    const sunUp = smoothstep(-0.03, 0.06, sunDir.y);
    const T = skyCols.sunT; const tm = Math.max(T.r, T.g, T.b, 1e-4);
    if (sunUp > 0.001) {
      sun.direction.set(-sunDir.x, -sunDir.y, -sunDir.z);
      sun.diffuse.set(T.r / tm, T.g / tm, T.b / tm);
      sun.intensity = 4.2 * tm * sunUp * light * (1 - 0.3 * (w?.dark ?? 0) * (w ? smoothstep(0.7, 1, w.cover) : 0));
      atmo.lightDir.copyFrom(sunDir);
    } else {
      const moonUp = smoothstep(0.0, 0.15, moonDir.y);
      sun.direction.set(-moonDir.x, -Math.max(moonDir.y, 0.15), -moonDir.z);
      sun.diffuse.set(0.55, 0.66, 1.0);
      sun.intensity = 0.32 * moonUp * light;
      atmo.lightDir.copyFrom(moonDir);
    }
    sun.specular.copyFrom(sun.diffuse);
    sun.position.set(atmo.camPos.x - sun.direction.x * 500, atmo.camPos.y - sun.direction.y * 500, atmo.camPos.z - sun.direction.z * 500);

    // ambient hemisphere (small; most ambient comes from the SH probe)
    const flash = w ? w.flash : 0; atmo.flash = flash;
    hemi.diffuse.set(skyCols.zen.r * g.amb[0], skyCols.zen.g * g.amb[1], skyCols.zen.b * g.amb[2]);
    hemi.groundColor.set(0.09 * T.r * day + 0.01, 0.08 * T.g * day + 0.01, 0.065 * T.b * day + 0.012);
    hemi.intensity = 0.35 + flash * 6;
    if (flash > 0) hemi.diffuse.set(0.75, 0.8, 1.0);

    // fog / aerial perspective
    const over = w ? smoothstep(0.6, 1, w.cover) : 0; const dark = w ? w.dark : 0.3;
    const fogL = (c) => (c.r + c.g + c.b) / 3;
    const setFog = (dst, src) => {
      const l = fogL(src) * (1 - 0.55 * over * dark);
      dst.set((src.r + (l - src.r) * over) * g.tint[0], (src.g + (l - src.g) * over) * g.tint[1], (src.b + (l - src.b) * over) * g.tint[2]);
      dst.r += flash * 1.5; dst.g += flash * 1.6; dst.b += flash * 2;
    };
    setFog(atmo.fogColor, skyCols.away);
    setFog(atmo.fogSunColor, skyCols.toward);
    atmo.fogDensity = 0.0002 * g.fogMul * (w ? w.fogMul : 1) * (1 + night * 0.4);
    atmo.fogFalloff = 0.0032;
    atmo.fogBase = 0;
    atmo.wetness = w ? w.wet : 0;
    atmo.snowCover = w ? w.snowCover : 0;

    // sky
    if (sky) {
      const st = sky.state;
      st.sunDisc[0] = T.r; st.sunDisc[1] = T.g; st.sunDisc[2] = T.b;
      st.discScale = 1400 * (1 - over * 0.97);
      st.ms[0] = skyCols.ms.r; st.ms[1] = skyCols.ms.g; st.ms[2] = skyCols.ms.b;
      st.stars = night * (1 - (w ? w.cover : 0.4) * 0.8);
      st.coverage = w ? w.cover : 0.42; st.darkness = w ? w.dark : 0.35;
      st.opacity = 0.92;
      st.wind[0] += dt * 0.0016; st.wind[1] += dt * 0.0007;
      st.flash = flash;
      const lit = 1.15 * day + 0.04;
      st.cloudLit[0] = (T.r / tm * 0.9 + 0.1) * lit * 2.1 * light + skyCols.ms.r * 2; st.cloudLit[1] = (T.g / tm * 0.9 + 0.1) * lit * 2.1 * light + skyCols.ms.g * 2; st.cloudLit[2] = (T.b / tm * 0.9 + 0.1) * lit * 2.1 * light + skyCols.ms.b * 2;
      const sh = 1.3 * (1 - 0.6 * dark); const zl = (skyCols.zen.r + skyCols.zen.g + skyCols.zen.b) / 3;
      const gz = (c) => (c + (zl - c) * (0.45 + 0.5 * over)) * sh + 0.03 * day;
      st.cloudShade[0] = gz(skyCols.zen.r); st.cloudShade[1] = gz(skyCols.zen.g); st.cloudShade[2] = gz(skyCols.zen.b) + 0.005 * day;
      st.tint[0] = g.tint[0] * (1 - 0.4 * over * dark); st.tint[1] = g.tint[1] * (1 - 0.4 * over * dark); st.tint[2] = g.tint[2] * (1 - 0.35 * over * dark);
      st.haze = 1 + (w ? (w.fogMul - 1) * 0.6 : 0);
    }

    // exposure: eye adaptation for night, region grade
    const ip = pipeline?.imageProcessing;
    if (ip) {
      ip.exposure = (1.0 + g.exposure) * (1 + night * 1.6) * (1 + over * 0.25);
      ip.contrast = g.contrast;
    }

    // IBL refresh when the sun moved notably / weather or grade changed
    probeTimer -= dt;
    const moved = Vector3.Dot(lastProbeSun, sunDir) < 0.99966; // ~1.5 deg
    const coverNow = w ? w.cover : 0.4;
    if (probe && (probeDirty || ((moved || Math.abs(coverNow - lastCover) > 0.06) && probeTimer <= 0))) {
      probe.position.copyFrom(atmo.camPos);
      probe.cubeTexture.resetRefreshCounter();
      computeSH(w);
      lastProbeSun.copyFrom(sunDir); lastCover = coverNow; probeTimer = 1.0; probeDirty = false;
    }
  }
  ctx.addUpdate(update, 50);
  update(0);
  setTimeout(() => { probeDirty = true; }, 1500); // re-bake once shaders are compiled

  function attachCamera(cam) {
    if (!cam || cam === camera) { if (cam) scene.activeCamera = cam; return; }
    const old = camera; camera = cam;
    if (!cam.maxZ || cam.maxZ < 9000) cam.maxZ = 12000; // distant mountains + sky need a long far plane
    if (cam.minZ < 0.05) cam.minZ = 0.1;
    scene.activeCamera = cam;
    buildPipeline(cam);
    if (shadows) { try { shadows.splitFrustum(); } catch { /* ignore */ } }
    if (old && old.metadata?.aeTemp) { try { old.detachControl(); old.dispose(); } catch { /* ignore */ } }
  }

  const api = {
    sun, hemi, shadows, addShadowCaster, removeShadowCaster,
    get pipeline() { return pipeline; },
    get ssao() { return ssao; },
    get timeOfDay() { return timeOfDay; },
    setTimeOfDay(h) { timeOfDay = ((h % 24) + 24) % 24; probeDirty = true; lastSkyEval = -1; },
    setTimeScale(s) { timeScale = s; },
    get envTexture() { return scene.environmentTexture; },
    setWeather(kind, intensity = 1) { if (!weather) return; if (kind == null) { weatherManual = false; return; } weatherManual = true; weather.setWeather(kind, intensity); },
    setRegionGrade,
    attachCamera,
    get camera() { return camera; },
    atmo,
    update,
  };
  return api;
}

function makeTempCamera(ctx) {
  const { scene, params, canvas } = ctx;
  let x = 270, z = 360 - 120, y = NaN, yaw = 0, pitch = -6;
  const spawn = params?.get?.('spawn');
  if (spawn) { const [sx, sz] = spawn.split(',').map(Number); if (Number.isFinite(sx) && Number.isFinite(sz)) { x = sx; z = sz; } }
  const camP = params?.get?.('cam');
  if (camP) { const v = camP.split(',').map(Number); if (v.length >= 2) { x = v[0]; z = v[v.length >= 3 ? 2 : 1]; if (v.length >= 3) y = v[1]; } }
  const yp = parseFloat(params?.get?.('yaw')); if (Number.isFinite(yp)) yaw = yp;
  const pp = parseFloat(params?.get?.('pitch')); if (Number.isFinite(pp)) pitch = pp;
  if (!Number.isFinite(y)) { let g = 0; try { g = Math.max(0, heightAt(x, z)); } catch { /* ignore */ } y = g + (parseFloat(params?.get?.('eye')) || 1.8); }
  const cam = new UniversalCamera('tempCam', new Vector3(x, y, z), scene);
  cam.rotation.set(-pitch * Math.PI / 180, yaw * Math.PI / 180, 0);
  cam.fov = 0.9; cam.minZ = 0.2; cam.maxZ = 12000;
  cam.speed = 4; cam.angularSensibility = 3000;
  cam.metadata = { aeTemp: true };
  if (params?.get?.('freecam')) { try { cam.attachControl(canvas, true); cam.keysUp.push(87); cam.keysDown.push(83); cam.keysLeft.push(65); cam.keysRight.push(68); } catch { /* ignore */ } }
  return cam;
}

