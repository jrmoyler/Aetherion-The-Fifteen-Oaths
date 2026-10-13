import { Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Obsidian Wall — the two bespoke shaders the wall is drawn with.
 *
 *  - **volcanic glass** — opaque, instanced, used by both the slabs and the
 *    shards. What makes it obsidian rather than black plastic:
 *      1. **true facets** — the normal is rebuilt per pixel from screen-space
 *         derivatives of the world position, so every face is perfectly flat
 *         whatever the instance scale does to the mesh's own normals;
 *      2. **conchoidal ridges** — each facet gets its own origin (hashed from
 *         its quantised normal and the instance seed), and the normal is
 *         rippled in concentric shells round it, fading with distance. That
 *         is the scalloped fracture of real volcanic glass, and it is what
 *         breaks a single sharp reflection into a run of bright arcs;
 *      3. a **sharp sky reflection** from `frame.uEnvMap` with a glass Fresnel
 *         (F0 ≈ 0.04): almost black head-on, mirror-like at grazing angles;
 *      4. a hard **sun glint**;
 *      5. **violet light in the cracks** — a ridged-noise crack field in the
 *         instance's own space, sampled twice: once on the surface (thin hot
 *         lines) and once a little *behind* it along the view ray (a soft
 *         glow that slides with parallax — light trapped inside the glass).
 *         Hottest at the root, hot when the slab has just erupted (`heat`),
 *         and brightening as the wall charges before it breaks (`charge`).
 *    Per-instance `vec4 aState`: seed, heat, charge, shard (0 slab / 1 shard).
 *  - **the fissure** — a ground strip down the line that exists only behind
 *    the front: a jagged central rift with a violet core, branching side
 *    cracks, a dark scorched margin and grit. It cools after the eruption,
 *    flares again with the charge, and erodes away in the fade.
 *
 * Every material reads `settings.obsidianwall` in `userData.sync()`.
 */

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* -------------------------------------------------------------------- */
/* volcanic glass                                                       */
/* -------------------------------------------------------------------- */

const GLASS_VERTEX = /* glsl */ `
  attribute float aV;
  attribute vec4  aState;

  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vV;
  varying vec4  vState;

  void main() {
    vLocal = position;
    vV = aV;
    vState = aState;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const GLASS_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uEnv;
  uniform float uFresnel;
  uniform float uSpecular;
  uniform float uGloss;
  uniform float uDiffuse;
  uniform float uRidge;        // normal tilt of the ripples
  uniform float uRidgeFreq;    // shells per metre
  uniform float uRidgeReach;   // metres the ripples spread from their origin
  uniform float uCrackScale;
  uniform float uCrackWidth;
  uniform float uCrackGlow;
  uniform float uDeepGlow;
  uniform float uDeepDepth;    // metres behind the surface the inner glow sits
  uniform float uRootGlow;
  uniform float uRim;
  uniform float uPulse;
  uniform vec3  uColorGlass;
  uniform vec3  uColorSheen;
  uniform vec3  uColorCrack;
  uniform vec3  uColorDeep;
  uniform vec3  uColorRim;

  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vV;
  varying vec4  vState;

  ${noiseGLSL}
  ${ENV_GLSL}

  /** The crack field: thin ridged lines, 1 on a crack. */
  float cracks(vec3 p, float width) {
    float r = ridged(p, 4);
    return smoothstep(1.0 - width, 1.0 - width * 0.25, r * 1.05);
  }

  void main() {
    float seed = vState.x;
    float heat = vState.y;
    float charge = vState.z;
    float shard = vState.w;

    vec3 V = normalize(cameraPosition - vWorld);
    // 1 · a truly flat facet normal, whatever the instance scale did.
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(N, V) < 0.0) N = -N;

    // 2 · conchoidal ripples, concentric round a per-facet origin.
    vec3 T = normalize(cross(N, abs(N.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 B = cross(N, T);
    vec3 qn = floor(N * 6.0 + 0.5);
    float fid = hash13(qn + seed * 17.0);
    vec2 q = vec2(dot(vWorld, T), dot(vWorld, B));
    // The scoop's origin, and the plane tiled every 3 m so a long facet gets
    // more than one.
    vec2 o = (hash21(fid * 91.7 + seed) - 0.5) * 1.6;
    vec2 dq = q - o - floor((q - o) / 3.0 + 0.5) * 3.0;
    float d = length(dq);
    float shell = d * uRidgeFreq * 6.2831853;
    float reach = exp(-d / max(uRidgeReach, 0.05));
    vec2 radial = dq / max(d, 1e-4);
    float ripple = cos(shell + fid * 6.0) * reach * uRidge * uShaderIntensity;
    N = normalize(N + (T * radial.x + B * radial.y) * ripple);

    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // 3 · glass fresnel and the sky.
    float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    vec3 color = uColorGlass * (0.15 + uDiffuse * clamp(dot(N, L), 0.0, 1.0));
    color += env * uColorSheen * uEnv * mix(0.04, 1.0, F * uFresnel);

    // 4 · the sun, hard.
    color += uColorSheen * pow(clamp(dot(N, H), 0.0, 1.0), uGloss) * uSpecular;

    // 5 · violet light in the cracks — on the surface, and deeper inside.
    vec3 lp = vLocal * uCrackScale + seed * 7.3;
    float surface = cracks(lp, uCrackWidth);
    vec3 deepP = (vLocal - normalize(V) * uDeepDepth) * uCrackScale * 0.6 + seed * 3.1;
    float deep = smoothstep(0.55, 1.0, ridged(deepP, 4)) * ndv;
    float root = mix(1.0, 1.0 - clamp(vV, 0.0, 1.0), uRootGlow);
    float throb = 1.0 + uPulse * sin(uTime * 3.2 + seed * 11.0) * 0.5;
    float energy = (0.25 + heat * 2.2 + charge * 3.0 + shard * 0.6) * throb;
    color += uColorCrack * surface * uCrackGlow * energy * root * uGlobalGlow;
    color += uColorDeep * deep * uDeepGlow * energy * root * uGlobalGlow;

    // A faint violet rim so the silhouette never melts into a dark stage.
    color += uColorRim * pow(1.0 - ndv, 3.0) * uRim * (1.0 + charge);

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Volcanic glass for the slabs and the shards. Opaque; on LAYER.WORLD. */
export function createObsidianGlassMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uEnv: { value: 1.2 },
      uFresnel: { value: 1 },
      uSpecular: { value: 4 },
      uGloss: { value: 240 },
      uDiffuse: { value: 0.2 },
      uRidge: { value: 0.18 },
      uRidgeFreq: { value: 3.2 },
      uRidgeReach: { value: 0.6 },
      uCrackScale: { value: 2.2 },
      uCrackWidth: { value: 0.06 },
      uCrackGlow: { value: 1.6 },
      uDeepGlow: { value: 0.6 },
      uDeepDepth: { value: 0.12 },
      uRootGlow: { value: 0.7 },
      uRim: { value: 0.25 },
      uPulse: { value: 0.3 },
      uColorGlass: { value: new Color() },
      uColorSheen: { value: new Color() },
      uColorCrack: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: GLASS_VERTEX,
    fragmentShader: GLASS_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings.obsidianwall;
    const g = settings.global;
    const u = material.uniforms;
    u.uEnv.value = c.glassEnv;
    u.uFresnel.value = c.glassFresnel * g.fresnel;
    u.uSpecular.value = c.glassSpecular * g.glow;
    u.uGloss.value = c.glassGloss;
    u.uDiffuse.value = c.glassDiffuse;
    u.uRidge.value = c.ridgeStrength * g.noiseStrength;
    u.uRidgeFreq.value = c.ridgeFrequency * g.noiseFrequency;
    u.uRidgeReach.value = c.ridgeReach;
    u.uCrackScale.value = c.crackScale * g.noiseFrequency;
    u.uCrackWidth.value = c.crackWidth;
    u.uCrackGlow.value = c.crackGlow * g.glow;
    u.uDeepGlow.value = c.deepGlow * g.glow;
    u.uDeepDepth.value = c.deepDepth;
    u.uRootGlow.value = c.rootGlow;
    u.uRim.value = c.rimGlow * g.fresnel;
    u.uPulse.value = c.crackPulse;
    u.uColorGlass.value.copy(getColor(c.colorGlass));
    u.uColorSheen.value.copy(getColor(c.colorSheen));
    u.uColorCrack.value.copy(getColor(c.colorCrack));
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorRim.value.copy(getColor(c.colorRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the fissure                                                          */
/* -------------------------------------------------------------------- */

const FISSURE_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uWidth;

  varying vec2 vFlat;          // x: metres across, y: metres along

  void main() {
    float across = position.x * uWidth;
    float along = (position.y + 0.5) * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = 0.014;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FISSURE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpen;         // metres of fissure that exist so far
  uniform float uFrontAt;
  uniform float uRift;         // half-width of the main rift
  uniform float uMargin;       // half-width of the scorched margin
  uniform float uBranch;       // how far the side cracks reach
  uniform float uBranchScale;
  uniform float uWander;
  uniform float uGlow;
  uniform float uHeat;         // 0..1 how hot the rift still is
  uniform float uCharge;
  uniform float uDark;
  uniform float uErode;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorRift;
  uniform vec3  uColorGlow;
  uniform vec3  uColorScorch;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;
    if (along < 0.0 || along > uOpen) discard;

    // A rift that zigzags: wandered by two octaves so it never reads as a curve.
    float wander = snoise(vec3(along * 0.45, uSeed, 0.0)) * uWander
                 + snoise(vec3(along * 2.1, uSeed * 1.7, 3.0)) * uWander * 0.3;
    float dx = x - wander;
    float ad = abs(dx);
    // Pinches shut at both ends.
    float open = smoothstep(0.0, 0.8, along) * smoothstep(0.0, 0.6, uOpen - along);
    float riftW = uRift * open * (0.65 + 0.35 * snoise(vec3(along * 1.3, uSeed * 2.3, 1.0)));
    float rift = 1.0 - smoothstep(riftW * 0.5, riftW + 0.004, ad);

    // Side cracks: ridged noise thresholded into thin lines, fading outward.
    vec3 bp = vec3(x * uBranchScale, along * uBranchScale * 0.6, uSeed * 5.0);
    float br = smoothstep(0.86, 0.97, ridged(bp, 4));
    br *= 1.0 - smoothstep(uBranch * 0.3, uBranch, ad);
    br *= open;

    // The scorched, glassy margin either side.
    float margin = (1.0 - smoothstep(uMargin * 0.4, uMargin, ad + fbm3(vec3(x * 1.5, along * 0.6, uSeed)) * 0.2)) * open;

    // Hot behind the front, cooling; flares again as the wall charges.
    float behind = max(uFrontAt - along, 0.0);
    float hot = clamp(uHeat * (0.35 + 0.65 * exp(-behind * 0.35)) + uCharge, 0.0, 2.5);
    float flick = 0.85 + 0.15 * snoise(vec3(along * 3.0, x * 3.0, uTime * 2.0));

    vec3 col = uColorScorch;
    float a = margin * uDark * 0.55;
    col = mix(col, uColorRift, max(rift, br * 0.8));
    a = max(a, max(rift, br * 0.85) * uDark);
    float glowMask = rift * (1.0 - smoothstep(0.0, riftW * 0.8 + 1e-3, ad) * 0.6) + br * 0.55;
    col += uColorGlow * glowMask * uGlow * hot * flick * uGlobalGlow;
    a = max(a, glowMask * min(1.0, hot));

    // Erodes raggedly in the fade.
    float n = snoise(vec3(x * 2.5, along * 0.9, uSeed * 4.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.55, n, uErode));
    a *= vis * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The rift the wall rose out of. Normal blending — it has to be dark. */
export function createObsidianFissureMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uWidth: { value: 3 },
      uSeed: { value: 0 },
      uOpen: { value: 0 },
      uFrontAt: { value: 0 },
      uRift: { value: 0.12 },
      uMargin: { value: 0.8 },
      uBranch: { value: 1.2 },
      uBranchScale: { value: 2 },
      uWander: { value: 0.2 },
      uGlow: { value: 3 },
      uHeat: { value: 1 },
      uCharge: { value: 0 },
      uDark: { value: 0.9 },
      uErode: { value: 0.7 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorRift: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorScorch: { value: new Color() }
    }),
    vertexShader: FISSURE_VERTEX,
    fragmentShader: FISSURE_FRAGMENT
  });

  /**
   * @param {object} state { start, dir, side, length, width, open, frontAt,
   *   heat, charge, fadeT, seed }
   */
  material.userData.sync = (state) => {
    const c = settings.obsidianwall;
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uWidth.value = state.width;
    u.uSeed.value = state.seed;
    u.uOpen.value = state.open;
    u.uFrontAt.value = state.frontAt;
    u.uRift.value = c.fissureWidth;
    u.uMargin.value = c.fissureMargin;
    u.uBranch.value = c.fissureBranch;
    u.uBranchScale.value = c.fissureBranchScale * g.noiseFrequency;
    u.uWander.value = c.fissureWander * g.noiseStrength * g.randomness;
    u.uGlow.value = c.fissureGlow * g.glow;
    u.uHeat.value = state.heat;
    u.uCharge.value = state.charge;
    u.uDark.value = c.fissureDark;
    u.uErode.value = c.fissureErode;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorRift.value.copy(getColor(c.colorFissure));
    u.uColorGlow.value.copy(getColor(c.colorFissureGlow));
    u.uColorScorch.value.copy(getColor(c.colorScorch));
  };

  return material;
}
