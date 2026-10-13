import {
  Color,
  DoubleSide,
  FrontSide,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NormalBlending,
  RGBADepthPacking,
  ShaderMaterial,
  Vector3,
  Vector4
} from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { patchOnBeforeCompile } from '../../utils/shaderPatch.js';

/**
 * Seedstorm Volley — the four bespoke surfaces.
 *
 *  - **the sapling** (`createSaplingMaterial`) — a patched
 *    MeshStandardMaterial, so the wood and leaves take the stage's sun,
 *    shadows and sky. Its vertex stage *animates* the unit sapling from
 *    `SeedstormVolleyGeometry`: a grow front runs up the path distance
 *    (`aGrow`), collapsing every ring and leaf it has not reached onto its own
 *    spine; the lash bends the whole tree about its local X by an angle that
 *    grows with height^curve, which is what a whip does; withering hangs the
 *    leaves, slumps the tree sideways and sinks it back into the floor. The
 *    same function drives the shadow pass, so the shadow lashes too. The
 *    fragment stage paints streaked bark that greens toward the young wood, a
 *    folded leaf with midrib and side veins and backlit translucency, a band
 *    of light riding the grow front, sap veins, and the browning of the wither.
 *  - **the seed** (`createSeedMaterial`) — an instanced almond with a hot
 *    glowing core, fresnel rim and crawling veins; it brightens as it embeds.
 *  - **the soil scatter** (`createSoilScatterMaterial`) — one ground strip down
 *    the line that draws every landing site analytically from a uniform array:
 *    a ragged disc of churned earth with voronoi clods, a dark hole where the
 *    sapling tore out, radial cracks, and glowing root veins that cool.
 *  - **the lash warp** (`createLashWarpMaterial`) — instanced camera-facing
 *    rings on `LAYER.DISTORTION`: each sprout and each lash pushes a lens ring
 *    outward through the air.
 *
 * Every material reads `settings.seedstorm` in `userData.sync(...)`.
 */

/* ==================================================================== */
/* The sapling                                                           */
/* ==================================================================== */

const SAPLING_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  uniform float uGirth;
  uniform float uLeafSize;
  uniform float uGrowFeather;
  uniform float uBendCurve;
  uniform float uSway;
  uniform float uSwaySpeed;
  uniform float uDroop;

  attribute vec3  aCenter;
  attribute float aGrow;
  attribute float aKind;
  attribute vec2  aUv;
  attribute float aLevel;
  attribute vec4  aState;  // grow (past 1 = overshoot), lash bend (rad), wither 0..1, sink (unit heights)
  attribute vec4  aExtra;  // flash 0..1, seed, slump (rad, about Z), unused

  vec3  sPos;
  vec3  sNormal;
  float sFrontD;

  vec3 bendX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
  vec3 bendZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }

  void saplingVertex() {
    float grow = max(aState.x, 0.0);
    float wither = clamp(aState.z, 0.0, 1.0);
    float feather = max(uGrowFeather, 0.01);
    // The front runs a feather past the tips so the last of the wood finishes.
    float front = min(grow, 1.0) * (1.0 + feather);
    sFrontD = front - aGrow;
    float g = clamp(sFrontD / feather, 0.0, 1.0);

    vec3 off = position - aCenter;
    vec3 p;
    if (aKind < 0.5) {
      // Wood the front has not reached collapses onto its spine: zero area.
      p = aCenter + off * g * uGirth;
    } else {
      // Leaves unfurl just behind the front, from their attach point.
      float gl = smoothstep(0.0, 1.0, clamp(sFrontD / (feather * 0.8) - 0.15, 0.0, 1.0));
      vec3 lo = off * gl * uLeafSize;
      lo.y -= wither * uDroop * length(lo);
      p = aCenter + lo;
    }

    // The punch out of the floor stretches it past full height for a beat.
    p.y *= 1.0 + max(grow - 1.0, 0.0);

    // Bends grow with height^curve: the foot stays planted, the crown whips.
    float h = clamp(p.y, 0.0, 1.8);
    float shape = pow(h, max(uBendCurve, 0.2));
    float seed = aExtra.y * 6.2831;
    float swayX = sin(uTime * uSwaySpeed + seed) * uSway * (1.0 - wither);
    float swayZ = cos(uTime * uSwaySpeed * 0.77 + seed * 0.5) * uSway * (1.0 - wither);
    float ax = (aState.y + swayX) * shape;
    float az = (aExtra.z + swayZ) * shape;
    p = bendZ(bendX(p, ax), az);
    sNormal = normalize(bendZ(bendX(normal, ax), az));

    p.y -= aState.w;
    sPos = p * uHeight;
  }
`;

const SAPLING_VARYINGS = /* glsl */ `
  varying float vSKind;
  varying float vSGrow;
  varying float vSFrontD;
  varying float vSLevel;
  varying vec2  vSUv;
  varying vec3  vSUnit;
  varying vec4  vSState;
  varying vec4  vSExtra;
`;

export function createSaplingMaterial(environment) {
  const material = new MeshStandardMaterial({
    name: 'SeedstormSapling',
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0.0,
    // Leaves are single blades; their backs are part of the shape.
    side: DoubleSide
  });

  const uniforms = {
    uTime: frame.uTime,
    uHeight: { value: 2.3 },
    uGirth: { value: 1 },
    uLeafSize: { value: 1 },
    uGrowFeather: { value: 0.12 },
    uBendCurve: { value: 1.6 },
    uSway: { value: 0.05 },
    uSwaySpeed: { value: 1.4 },
    uDroop: { value: 0.6 },
    uBarkScale: { value: 9 },
    uFrontGlow: { value: 4 },
    uVeinGlow: { value: 0.8 },
    uLeafGlow: { value: 0.6 },
    uRimGlow: { value: 0.8 },
    uFlashGlow: { value: 3 },
    uGlow: { value: 1 },
    uColorBarkDark: { value: new Color() },
    uColorBarkLight: { value: new Color() },
    uColorYoung: { value: new Color() },
    uColorLeafBase: { value: new Color() },
    uColorLeafTip: { value: new Color() },
    uColorLeafVein: { value: new Color() },
    uColorWither: { value: new Color() },
    uColorBarkWither: { value: new Color() },
    uColorGlow: { value: new Color() }
  };

  environment.registerShadowCasterWithPatch(
    material,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${SAPLING_VERTEX}\n${SAPLING_VARYINGS}`)
        .replace(
          '#include <beginnormal_vertex>',
          `saplingVertex();
           vec3 objectNormal = sNormal;
           vSKind = aKind;
           vSGrow = aGrow;
           vSFrontD = sFrontD;
           vSLevel = aLevel;
           vSUv = aUv;
           vSUnit = position;
           vSState = aState;
           vSExtra = aExtra;
           #ifdef USE_TANGENT
             vec3 objectTangent = vec3(tangent.xyz);
           #endif`
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = sPos;');

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uGrowFeather;
           uniform float uBarkScale;
           uniform float uFrontGlow;
           uniform float uVeinGlow;
           uniform float uLeafGlow;
           uniform float uRimGlow;
           uniform float uFlashGlow;
           uniform float uGlow;
           uniform vec3  uColorBarkDark;
           uniform vec3  uColorBarkLight;
           uniform vec3  uColorYoung;
           uniform vec3  uColorLeafBase;
           uniform vec3  uColorLeafTip;
           uniform vec3  uColorLeafVein;
           uniform vec3  uColorWither;
           uniform vec3  uColorBarkWither;
           uniform vec3  uColorGlow;
           ${SAPLING_VARYINGS}
           ${noiseGLSL}`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           {
             float ndv = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
             float rim = pow(1.0 - ndv, 3.0);
             float wither = clamp(vSState.z, 0.0, 1.0);
             float alive = 1.0 - wither;
             float seed = vSExtra.y * 13.0;
             vec3 glow = vec3(0.0);

             // The grow front: a band of light riding up the wood as it grows,
             // gone once the sapling has finished.
             float d = vSFrontD / max(uGrowFeather, 0.01);
             float band = exp(-pow((d - 0.55) * 2.4, 2.0)) * (1.0 - smoothstep(0.92, 1.0, vSState.x));

             if (vSKind < 0.5) {
               /* --- bark: vertical streaks, greening toward the young wood --- */
               float streak = snoise(vec3(vSUnit.xz * 34.0, vSUnit.y * uBarkScale * 0.6 + seed)) * 0.5 + 0.5;
               float knots = smoothstep(0.55, 0.9, snoise(vec3(vSUnit * uBarkScale * 1.7 + seed)) * 0.5 + 0.5);
               vec3 bark = mix(uColorBarkDark, uColorBarkLight, streak * (1.0 - knots * 0.7));
               float young = clamp(smoothstep(0.4, 0.95, vSGrow) + vSLevel * 0.3, 0.0, 1.0);
               bark = mix(bark, uColorYoung, young * 0.85);
               bark = mix(bark, uColorBarkWither, wither * 0.8);
               diffuseColor.rgb *= bark;
               // Sap running up under the bark.
               float vein = 1.0 - smoothstep(0.0, 0.07, abs(snoise(vec3(vSUnit.xz * 16.0, vSUnit.y * 2.2 + seed))));
               float flow = 0.6 + 0.4 * sin(vSGrow * 18.0 - uTime * 5.0);
               glow += uColorGlow * vein * flow * uVeinGlow * alive * (0.4 + young);
               glow += uColorYoung * rim * uRimGlow * 0.35 * alive;
             } else {
               /* --- leaf: midrib, side veins, backlit translucency --- */
               float across = vSUv.x;
               float along = vSUv.y;
               float midrib = 1.0 - smoothstep(0.0, 0.1, abs(across));
               float side = abs(fract(along * 6.0 - abs(across) * 1.8 + seed) - 0.5);
               float veins = max(midrib, (1.0 - smoothstep(0.0, 0.08, side)) * (1.0 - smoothstep(0.7, 1.0, abs(across))));
               vec3 leafCol = mix(uColorLeafBase, uColorLeafTip, smoothstep(0.0, 1.0, along));
               leafCol = mix(leafCol, uColorLeafVein, veins * 0.55);
               // Withering browns from the tip and in blotches.
               float blotch = snoise(vec3(vSUnit * 40.0 + seed)) * 0.5 + 0.5;
               float brown = clamp(wither * 1.4 - (1.0 - along) * 0.4 + (blotch - 0.5) * 0.6, 0.0, 1.0);
               leafCol = mix(leafCol, uColorWither, brown);
               diffuseColor.rgb *= leafCol;
               glow += uColorLeafTip * uLeafGlow * (0.35 + rim) * alive;
               glow += uColorGlow * veins * uVeinGlow * 0.6 * alive;
             }

             glow += uColorGlow * band * uFrontGlow;
             glow += uColorGlow * vSExtra.x * uFlashGlow * (0.4 + rim);
             glow *= uGlow;
             glow /= 1.0 + glow * 0.2;
             totalEmissiveRadiance += glow;
           }`
        );
    },
    'seedstorm-sapling'
  );

  /* ---- the shadow: the same tree, in the depth pass ---- */
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide });
  patchOnBeforeCompile(
    depth,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${SAPLING_VERTEX}`)
        .replace('#include <begin_vertex>', 'saplingVertex();\nvec3 transformed = sPos;');
    },
    'seedstorm-sapling-depth'
  );

  material.userData.uniforms = uniforms;
  material.userData.depth = depth;

  material.userData.sync = () => {
    const c = settings.seedstorm;
    const g = settings.global;
    const u = uniforms;
    u.uHeight.value = Math.max(0.1, c.saplingHeight);
    u.uGirth.value = c.girth;
    u.uLeafSize.value = c.leafSize;
    u.uGrowFeather.value = Math.max(0.01, c.growFeather);
    u.uBendCurve.value = c.bendCurve;
    u.uSway.value = c.sway * g.turbulence;
    u.uSwaySpeed.value = c.swaySpeed * g.animationSpeed;
    u.uDroop.value = c.witherDroop;
    u.uBarkScale.value = c.barkScale * g.noiseFrequency;
    u.uFrontGlow.value = c.frontGlow * g.shaderIntensity;
    u.uVeinGlow.value = c.veinGlow * g.shaderIntensity;
    u.uLeafGlow.value = c.leafGlow;
    u.uRimGlow.value = c.rimGlow * g.fresnel;
    u.uFlashGlow.value = c.flashGlow;
    u.uGlow.value = g.glow;
    u.uColorBarkDark.value.copy(getColor(c.colorBarkDark));
    u.uColorBarkLight.value.copy(getColor(c.colorBarkLight));
    u.uColorYoung.value.copy(getColor(c.colorYoung));
    u.uColorLeafBase.value.copy(getColor(c.colorLeafBase));
    u.uColorLeafTip.value.copy(getColor(c.colorLeafTip));
    u.uColorLeafVein.value.copy(getColor(c.colorLeafVein));
    u.uColorWither.value.copy(getColor(c.colorLeafWither));
    u.uColorBarkWither.value.copy(getColor(c.colorBarkWither));
    u.uColorGlow.value.copy(getColor(c.colorGlow));
    material.roughness = c.barkRoughness;
  };

  return material;
}

/* ==================================================================== */
/* The seed                                                              */
/* ==================================================================== */

const SEED_VERTEX = /* glsl */ `
  attribute vec2 aSeedState;   // glow multiplier, phase
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vLocal;
  varying vec2 vState;

  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec4 world = m * vec4(position, 1.0);
    vN = normalize(mat3(m) * normal);
    vV = cameraPosition - world.xyz;
    vLocal = position;
    vState = aSeedState;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SEED_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uGlow;
  uniform float uRim;
  uniform float uPulse;
  uniform float uVeinScale;
  uniform vec3  uColorCore;
  uniform vec3  uColorBody;
  uniform vec3  uColorRim;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vLocal;
  varying vec2 vState;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(vV);
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
    float rim = pow(1.0 - ndv, 2.5);
    float lit = 0.35 + 0.65 * clamp(dot(N, normalize(uLightDir)), 0.0, 1.0);

    // Veins crawling over the husk.
    float vein = 1.0 - smoothstep(0.0, 0.12, abs(snoise(vLocal * uVeinScale + vec3(0.0, 0.0, uTime * 1.5 + vState.y))));
    float pulse = 1.0 + uPulse * sin(uTime * 11.0 + vState.y * 6.2831);
    // Hot toward the point it flies on.
    float tip = smoothstep(0.0, 0.45, vLocal.z);

    vec3 col = uColorBody * lit * 0.6
             + uColorBody * vein * uGlow * 0.6 * pulse
             + uColorCore * (ndv * ndv) * uGlow * 0.55 * pulse
             + uColorCore * tip * uGlow * 0.5
             + uColorRim * rim * uRim;
    col *= vState.x;
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

export function createSeedMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uGlow: { value: 3 },
      uRim: { value: 2 },
      uPulse: { value: 0.5 },
      uVeinScale: { value: 6 },
      uColorCore: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: SEED_VERTEX,
    fragmentShader: SEED_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.seedstorm;
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.seedGlow * g.glow;
    u.uRim.value = c.seedRim * g.fresnel;
    u.uPulse.value = c.seedPulse;
    u.uVeinScale.value = c.seedVeinScale * g.noiseFrequency;
    u.uColorCore.value.copy(getColor(c.colorSeedCore));
    u.uColorBody.value.copy(getColor(c.colorSeedBody));
    u.uColorRim.value.copy(getColor(c.colorSeedRim));
  };
  return material;
}

/* ==================================================================== */
/* The soil scatter                                                      */
/* ==================================================================== */

/** Landing sites the soil strip can draw; the ability's MAX_SEEDS must not exceed it. */
export const SOIL_SITES = 16;

const SOIL_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uWidth;
  uniform float uLift;

  varying vec2 vFlat;   // x: metres across, y: metres along

  void main() {
    float across = position.x * uWidth;
    float along = (position.y + 0.5) * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = uLift;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SOIL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec4  uSite[${SOIL_SITES}];    // along, across, radius (m), open 0..1
  uniform vec4  uSiteB[${SOIL_SITES}];   // seed, root glow 0..1, hole 0..1, unused
  uniform float uCount;
  uniform float uDark;
  uniform float uClodScale;
  uniform float uClods;
  uniform float uCracks;
  uniform float uRootGlow;
  uniform float uRootScale;
  uniform float uEdgeNoise;
  uniform float uFade;
  uniform float uErode;
  uniform float uOpacity;
  uniform vec3  uColorDeep;
  uniform vec3  uColorSoil;
  uniform vec3  uColorLight;
  uniform vec3  uColorRoot;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    vec2 q = vFlat;
    vec3 col = vec3(0.0);
    float alpha = 0.0;
    vec3 glow = vec3(0.0);

    for (int i = 0; i < ${SOIL_SITES}; i++) {
      if (float(i) >= uCount) break;
      vec4 s = uSite[i];
      if (s.w <= 0.001) continue;
      vec4 b = uSiteB[i];
      vec2 d = vec2(q.x - s.y, q.y - s.x);
      float R = max(s.z * s.w, 0.02);
      float r = length(d);
      if (r > R * 1.7) continue;
      float rn = r / R;
      float ang = atan(d.y, d.x);
      vec2 dirA = vec2(cos(ang), sin(ang));

      // A ragged disc of thrown earth.
      float edge = fbm3(vec3(dirA * 1.6, b.x)) * uEdgeNoise;
      float disc = 1.0 - smoothstep(0.7 + edge, 1.02 + edge, rn);
      // Clods and crumbs scattered past the rim.
      vec2 vor = voronoi2(q * uClodScale + b.x * 3.1);
      float clod = (1.0 - smoothstep(0.08, 0.3, vor.x)) * step(0.55, vor.y) * (1.0 - smoothstep(0.9, 1.6, rn));
      // The hole the sapling tore out of.
      float hole = (1.0 - smoothstep(0.06, 0.22, rn)) * b.z;
      // Cracks running out from it.
      float wob = snoise(vec3(rn * 2.6, b.x, 0.0)) * 0.9;
      float spoke = abs(sin(ang * max(uCracks, 1.0) * 0.5 + wob));
      float crack = (1.0 - smoothstep(0.0, 0.05 + rn * 0.05, spoke)) * smoothstep(0.12, 0.3, rn) * (1.0 - smoothstep(0.75, 1.25, rn));
      // Roots of light, cooling.
      float rootN = abs(snoise(vec3(q * uRootScale + b.x * 7.0, b.x)));
      float roots = (1.0 - smoothstep(0.0, 0.06, rootN)) * (1.0 - smoothstep(0.25, 1.2, rn)) * b.y;

      float tone = snoise(vec3(q * 5.0, b.x)) * 0.5 + 0.5;
      vec3 soil = mix(uColorSoil, uColorLight, tone * 0.5);
      soil = mix(soil, uColorLight, clod * 0.7);
      soil = mix(soil, uColorDeep, max(hole, crack * 0.85));
      float a = max(disc * uDark * (0.65 + 0.35 * tone), clod * uClods);
      a = max(a, max(hole, crack) * 0.95 * disc);

      // Max-composite the sites: overlapping craters do not double up.
      if (a > alpha) { col = soil; alpha = a; }
      glow += uColorRoot * roots * uRootGlow;
    }

    // Erodes raggedly as the cast fades.
    float n = snoise(vec3(q * 1.7, 4.0)) * 0.5 + 0.5;
    float thr = uFade * 1.2 - 0.1;
    float vis = uFade <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.15, mix(0.55, n, uErode));
    alpha *= vis * uOpacity;
    glow *= vis;
    float total = max(alpha, clamp(max(glow.r, max(glow.g, glow.b)), 0.0, 1.0));
    if (total < 0.004) discard;
    gl_FragColor = vec4(col * alpha / max(total, 1e-3) + glow * uGlobalGlow, clamp(total, 0.0, 1.0));
  }
`;

export function createSoilScatterMaterial() {
  const sites = [];
  const sitesB = [];
  for (let i = 0; i < SOIL_SITES; i++) {
    sites.push(new Vector4());
    sitesB.push(new Vector4());
  }
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
      uWidth: { value: 4 },
      uLift: { value: 0.013 },
      uSite: { value: sites },
      uSiteB: { value: sitesB },
      uCount: { value: 0 },
      uDark: { value: 0.85 },
      uClodScale: { value: 7 },
      uClods: { value: 0.8 },
      uCracks: { value: 7 },
      uRootGlow: { value: 1.6 },
      uRootScale: { value: 3.5 },
      uEdgeNoise: { value: 0.3 },
      uFade: { value: 0 },
      uErode: { value: 0.7 },
      uOpacity: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorSoil: { value: new Color() },
      uColorLight: { value: new Color() },
      uColorRoot: { value: new Color() }
    }),
    vertexShader: SOIL_VERTEX,
    fragmentShader: SOIL_FRAGMENT
  });

  /** @param {object} state { start, dir, side, length, width, count, fade } — the site arrays are written by the ability. */
  material.userData.sync = (state) => {
    const c = settings.seedstorm;
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uWidth.value = state.width;
    u.uCount.value = state.count;
    u.uFade.value = state.fade;
    u.uDark.value = c.soilDark;
    u.uClodScale.value = c.soilClodScale * g.noiseFrequency;
    u.uClods.value = c.soilClods;
    u.uCracks.value = Math.round(c.soilCracks);
    u.uRootGlow.value = c.soilRootGlow * g.glow;
    u.uRootScale.value = c.soilRootScale * g.noiseFrequency;
    u.uEdgeNoise.value = c.soilEdgeNoise * g.noiseStrength;
    u.uErode.value = c.soilErode;
    u.uOpacity.value = g.opacity;
    u.uColorDeep.value.copy(getColor(c.colorSoilDeep));
    u.uColorSoil.value.copy(getColor(c.colorSoil));
    u.uColorLight.value.copy(getColor(c.colorSoilLight));
    u.uColorRoot.value.copy(getColor(c.colorRootGlow));
  };
  return material;
}

/* ==================================================================== */
/* The lash warp — LAYER.DISTORTION                                      */
/* ==================================================================== */

const WARP_VERTEX = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec4 aWarp;    // progress 0..1, strength, size (m), seed

  varying vec2 vUv;
  varying vec4 vWarp;

  void main() {
    vUv = uv;
    vWarp = aWarp;
    if (aWarp.y <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off screen: an idle slot
      return;
    }
    vec4 mv = viewMatrix * vec4(aCenter, 1.0);
    mv.xy += position.xy * aWarp.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uWidth;
  uniform float uNoise;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec4 vWarp;

  ${noiseGLSL}

  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float r = length(c);
    if (r > 1.0) discard;
    float prog = clamp(vWarp.x, 0.0, 1.0);
    float w = max(uWidth, 0.02);
    float k = (r - prog * 0.9) / w;
    // A lens ring: pushes out ahead of its crest, pulls in behind it.
    float bump = exp(-k * k);
    vec2 dir = c / max(r, 1e-3);
    vec2 n = vec2(snoise(vec3(c * 3.0, uTime * 2.0 + vWarp.w)), snoise(vec3(c * 3.0 + 7.1, uTime * 2.0 + vWarp.w)));
    vec2 offset = dir * clamp(k, -1.0, 1.0) * bump + n * uNoise * bump;
    float mask = (1.0 - smoothstep(0.85, 1.0, r)) * bump;
    float strength = vWarp.y * (1.0 - prog) * mask * uShaderIntensity;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

export function createLashWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 0.18 },
      uNoise: { value: 0.3 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });
  material.userData.sync = () => {
    const c = settings.seedstorm;
    const g = settings.global;
    material.uniforms.uWidth.value = c.warpWidth;
    material.uniforms.uNoise.value = c.warpNoise * g.turbulence;
  };
  return material;
}
