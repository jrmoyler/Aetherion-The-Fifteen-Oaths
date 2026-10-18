import { Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Thorn Volley — the bespoke shaders.
 *
 *  - **the thorn** (`createThornMaterial`) — opaque, instanced, lit: a
 *    lacquered horn going from dark heartwood at the base through blood-red
 *    bark to a bone-white point, with a wet specular down its length, a sap
 *    vein of green light spiralling to the point that blazes while it flies
 *    and gutters once it is stuck, leaf vanes with a midrib, and a *splinter*
 *    — the thorn breaking up from the point back on noise, the break edge
 *    glowing — when the volley ends. Per instance `aState`: seed, glow,
 *    splinter (0..1), flash.
 *  - **the root web** (`createThornWebMaterial`) — the floor round the
 *    landings: from each thorn that has struck, roots of green light crawl
 *    outward through a dark, churned stain, branching as they go; they cool
 *    and erode as the cast ends. Up to `MAX_LANDINGS` points, as uniforms.
 *  - **the lens rings** (`createThornWarpMaterial`) — instanced flat rings on
 *    `LAYER.DISTORTION`, one per landing, kicked out by the strike.
 *
 * Every material reads `settings.thornvolley` in `userData.sync(...)`.
 */

const ID = 'thornvolley';

/** Landings the floor web can draw; the ability's thorn cap matches it. */
export const MAX_LANDINGS = 12;

/* ==================================================================== */
/* The thorn                                                             */
/* ==================================================================== */

const THORN_VERTEX = /* glsl */ `
  attribute float aT;
  attribute float aPart;
  attribute vec4  aState;     // seed, glow, splinter, flash

  varying float vT;
  varying float vPart;
  varying vec4  vState;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;

  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 w = model * vec4(position, 1.0);
    vWorld = w.xyz;
    vLocal = position;
    vNormalW = normalize(mat3(model) * normal);
    vT = aT;
    vPart = aPart;
    vState = aState;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const THORN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColorHeart;
  uniform vec3  uColorBark;
  uniform vec3  uColorPoint;
  uniform vec3  uColorLeaf;
  uniform vec3  uColorSap;
  uniform vec3  uColorBreak;
  uniform float uSpecular;
  uniform float uGloss;
  uniform float uRim;
  uniform float uSapGlow;
  uniform float uSapTurns;
  uniform float uSapWidth;
  uniform float uBreakEdge;
  uniform float uBreakGlow;

  varying float vT;
  varying float vPart;
  varying vec4  vState;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;

  ${noiseGLSL}

  void main() {
    float seed = vState.x;
    float glow = vState.y;
    float splinter = vState.z;
    float flash = vState.w;

    // Splinter from the point back, ragged on noise; the break edge glows.
    float dn = snoise(vLocal * vec3(18.0, 7.0, 18.0) + seed * 13.0) * 0.5 + 0.5;
    float field = (1.0 - vT) * 0.7 + dn * 0.3;
    float thr = splinter * 1.1 - 0.05;
    if (splinter > 0.0 && field < thr) discard;
    float edge = splinter > 0.0 ? 1.0 - smoothstep(thr, thr + uBreakEdge, field) : 0.0;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);

    float isLeaf = step(1.5, vPart);
    float isBarb = step(0.5, vPart) * (1.0 - isLeaf);
    float grain = fbm3(vLocal * vec3(30.0, 4.0, 30.0) + seed * 5.0);
    vec3 albedo = mix(uColorHeart, uColorBark, smoothstep(0.0, 0.35, vT));
    albedo = mix(albedo, uColorPoint, smoothstep(0.55, 0.98, vT));
    albedo *= 0.8 + 0.35 * grain;
    albedo = mix(albedo, uColorPoint * 0.9, isBarb * 0.7);
    // Leaves: green with a pale midrib.
    float rib = 1.0 - smoothstep(0.0, 0.012, abs(vLocal.x * vLocal.z) * 6.0);
    albedo = mix(albedo, mix(uColorLeaf, uColorLeaf * 1.8, rib), isLeaf);

    float wrap = clamp(dot(N, L) * 0.6 + 0.4, 0.0, 1.0);
    vec3 color = albedo * (0.28 + 0.9 * wrap);
    color += vec3(pow(max(dot(N, H), 0.0), uGloss) * uSpecular) * (1.0 - isLeaf * 0.7);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    color += uColorSap * fres * uRim * (0.3 + glow);

    // The sap vein: a spiral of light climbing to the point.
    float ang = atan(vLocal.z, vLocal.x - 0.09 * vT * vT);
    float spiral = abs(fract(ang / 6.2831853 + vT * uSapTurns - uTime * 0.6 + seed) - 0.5) * 2.0;
    float vein = (1.0 - smoothstep(0.0, uSapWidth, spiral)) * (1.0 - isLeaf) * (1.0 - isBarb) * smoothstep(0.05, 0.3, vT);
    float pulse = 0.65 + 0.35 * sin(uTime * 9.0 + seed * 20.0 - vT * 8.0);
    color += uColorSap * vein * uSapGlow * glow * pulse * uShaderIntensity;
    color += uColorSap * smoothstep(0.85, 1.0, vT) * glow * uSapGlow * 0.6;
    color += uColorSap * flash * 2.0;
    color += uColorBreak * edge * uBreakGlow;

    gl_FragColor = vec4(color * uGlobalGlow, 1.0);
  }
`;

/** The thrown thorn: rigid, instanced, opaque on `LAYER.WORLD`. */
export function createThornMaterial() {
  const material = new ShaderMaterial({
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uColorHeart: { value: new Color() },
      uColorBark: { value: new Color() },
      uColorPoint: { value: new Color() },
      uColorLeaf: { value: new Color() },
      uColorSap: { value: new Color() },
      uColorBreak: { value: new Color() },
      uSpecular: { value: 0.6 },
      uGloss: { value: 50 },
      uRim: { value: 0.8 },
      uSapGlow: { value: 3 },
      uSapTurns: { value: 1.5 },
      uSapWidth: { value: 0.15 },
      uBreakEdge: { value: 0.08 },
      uBreakGlow: { value: 3 }
    }),
    vertexShader: THORN_VERTEX,
    fragmentShader: THORN_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uColorHeart.value.copy(getColor(c.colorHeartwood));
    u.uColorBark.value.copy(getColor(c.colorBark));
    u.uColorPoint.value.copy(getColor(c.colorPoint));
    u.uColorLeaf.value.copy(getColor(c.colorVane));
    u.uColorSap.value.copy(getColor(c.colorSap));
    u.uColorBreak.value.copy(getColor(c.colorBreak));
    u.uSpecular.value = c.thornSpecular;
    u.uGloss.value = c.thornGloss;
    u.uRim.value = c.thornRim * g.fresnel;
    u.uSapGlow.value = c.sapGlow * g.glow;
    u.uSapTurns.value = c.sapTurns;
    u.uSapWidth.value = c.sapWidth;
    u.uBreakEdge.value = c.splinterEdge;
    u.uBreakGlow.value = c.splinterGlow * g.glow;
  };

  return material;
}

/* ==================================================================== */
/* The root web on the floor                                             */
/* ==================================================================== */

const WEB_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  varying vec2 vP;
  void main() {
    vec2 p = position.xy * uExtent;
    vP = uCentre.xz + p;
    vec3 world = vec3(uCentre.x + p.x, 0.015, uCentre.z + p.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const WEB_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec4  uLand[${MAX_LANDINGS}];   // x, z, seconds since it struck (−1 = none), seed
  uniform float uReach;
  uniform float uGrowSpeed;
  uniform float uRoots;
  uniform float uRootWidth;
  uniform float uStain;
  uniform float uGlow;
  uniform float uHeat;        // 0..1 cooling
  uniform float uErode;
  uniform float uOpacity;
  uniform vec3  uColorStain;
  uniform vec3  uColorRoot;
  uniform vec3  uColorHot;

  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float root = 0.0;
    float stain = 0.0;
    float hot = 0.0;
    for (int i = 0; i < ${MAX_LANDINGS}; i++) {
      vec4 L = uLand[i];
      if (L.z < 0.0) continue;
      vec2 d = vP - L.xy;
      float r = length(d);
      float reach = min(uReach, L.z * uGrowSpeed);
      if (r > reach + 0.5) continue;
      float a = atan(d.y, d.x);
      // Roots: a few rays that wander in angle as they go out and fork.
      float wob = snoise(vec3(r * 1.8, L.w * 7.0, 0.0)) * 0.55 + snoise(vec3(r * 5.0, L.w * 3.0, 1.0)) * 0.15;
      float k = (a + wob) / 6.2831853 * uRoots + L.w * 3.0;
      float m = abs(fract(k) - 0.5) * 2.0;           // 0 on a root
      float w = uRootWidth * (1.0 - r / max(uReach, 0.1) * 0.7) / max(r, 0.15) * uRoots * 0.16;
      float line = 1.0 - smoothstep(w * 0.4, w, m);
      // Forks: a second, finer set that only starts part-way out.
      float k2 = (a - wob * 1.3) / 6.2831853 * uRoots * 2.0 + L.w * 5.0;
      float m2 = abs(fract(k2) - 0.5) * 2.0;
      float fork = (1.0 - smoothstep(w * 0.25, w * 0.6, m2)) * smoothstep(reach * 0.35, reach * 0.55, r);
      float grow = 1.0 - smoothstep(reach - 0.3, reach, r);
      float lr = max(line, fork * 0.7) * grow;
      root = max(root, lr);
      hot = max(hot, lr * exp(-max(reach - r, 0.0) * 1.4) * step(L.z * uGrowSpeed, uReach + 0.3));
      float st = (1.0 - smoothstep(0.2, 0.9 + 0.4 * snoise(vec3(d * 2.0, L.w)), r)) * smoothstep(0.0, 0.15, L.z);
      stain = max(stain, st);
    }
    float n = snoise(vec3(vP * 1.6, 3.0)) * 0.5 + 0.5;
    float thr = uErode * 1.25 - 0.15;
    float keep = smoothstep(thr, thr + 0.15, mix(n, n * 0.5 + root * 0.5, 0.5));

    vec3 col = mix(uColorStain, uColorRoot, root);
    col += (uColorRoot * root * 0.6 + uColorHot * hot * 1.5) * uGlow * uHeat * uGlobalGlow * uShaderIntensity;
    float a1 = max(stain * uStain, root) * keep * uOpacity;
    if (a1 < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a1, 0.0, 1.0));
  }
`;

/** Roots of light crawling out from every landing through a churned stain. */
export function createThornWebMaterial() {
  const land = [];
  for (let i = 0; i < MAX_LANDINGS; i++) land.push(new Vector4(0, 0, -1, 0));
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
      uCentre: { value: new Vector3() },
      uExtent: { value: 6 },
      uLand: { value: land },
      uReach: { value: 2 },
      uGrowSpeed: { value: 3 },
      uRoots: { value: 6 },
      uRootWidth: { value: 0.1 },
      uStain: { value: 0.7 },
      uGlow: { value: 2 },
      uHeat: { value: 1 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uColorStain: { value: new Color() },
      uColorRoot: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: WEB_VERTEX,
    fragmentShader: WEB_FRAGMENT
  });

  /** @param {object} s { centre, extent, heat, erode } — the landings are written by the ability into `uniforms.uLand`. */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uExtent.value = s.extent;
    u.uReach.value = c.rootReach;
    u.uGrowSpeed.value = c.rootSpeed;
    u.uRoots.value = Math.max(1, Math.round(c.rootCount));
    u.uRootWidth.value = c.rootWidth;
    u.uStain.value = c.stainOpacity;
    u.uGlow.value = c.rootGlow * g.glow;
    u.uHeat.value = s.heat;
    u.uErode.value = s.erode;
    u.uOpacity.value = g.opacity;
    u.uColorStain.value.copy(getColor(c.colorStain));
    u.uColorRoot.value.copy(getColor(c.colorRoot));
    u.uColorHot.value.copy(getColor(c.colorSap));
  };

  return material;
}

/* ==================================================================== */
/* Lens rings — LAYER.DISTORTION                                         */
/* ==================================================================== */

const WARP_VERTEX = /* glsl */ `
  attribute vec2 aWarp;       // progress 0..1, strength
  varying vec2 vQ;
  varying vec2 vWarp;
  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vQ = position.xy;
    vWarp = aWarp;
    vec4 w = model * vec4(position.x, 0.0, position.y, 1.0);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uShaderIntensity;
  uniform float uWidth;
  varying vec2 vQ;
  varying vec2 vWarp;
  void main() {
    float r = length(vQ);
    float ring = exp(-pow((r - vWarp.x) / max(uWidth, 0.01), 2.0));
    float s = ring * vWarp.y * uShaderIntensity;
    if (s < 0.002) discard;
    vec2 dir = vQ / max(r, 1e-3);
    gl_FragColor = vec4(dir * 0.5 + 0.5, s, ring);
  }
`;

/** A ring of bent air kicked out by each strike. Instanced quads laid flat. */
export function createThornWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 0.12 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  material.userData.sync = () => {
    material.uniforms.uWidth.value = settings[ID].warpWidth;
  };

  return material;
}
