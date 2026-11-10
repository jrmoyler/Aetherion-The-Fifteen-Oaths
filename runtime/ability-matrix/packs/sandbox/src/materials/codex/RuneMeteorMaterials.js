import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms, frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Rune Meteor — the bespoke shaders the star and its henge are drawn with.
 *
 *  - **runes** (`RUNE_GLSL`) — one procedural alphabet shared by everything:
 *    a stave and up to five branches chosen by a hash of the cell, drawn as
 *    line-segment distance fields, so every stone, band and ring of the sigil
 *    is carved with different, legible runes and nothing is a texture.
 *  - **the stones** (`createStoneMaterial`) — instanced pointed slabs: slate
 *    lit by the sun with fbm mottling, runes carved down both faces that
 *    light per stone (the chase round the henge), an arcane fresnel rim, and
 *    a crumble that eats them from a burning edge.
 *  - **the star** (`createOrbMaterial`) — a cut crystal: flat facets from
 *    screen-space derivatives, an arcane swirl turning inside it seen through
 *    the facets, a white-hot core and a pale rim, all emissive.
 *  - **the bands** (`createBandMaterial`) — rings of runes wound round the
 *    star at a tilt, spinning; opening out round it when it hovers.
 *  - **the beams** (`createBeamMaterial`) — instanced camera-facing ribbons:
 *    the column of light the star falls down, and the tethers from the
 *    hovering star to each stone, energy running along them.
 *  - **the sigil** (`createSigilMaterial`) — the floor: two rings drawn round
 *    as the call arrives, a band of runes between them, the star polygon
 *    joining where the stones will stand, all blazing on the nova.
 *  - **the ground** (`createGroundMaterial`) — normal-blended under the sigil:
 *    the circle darkening to a deep indigo pool as the star falls (the
 *    telegraph has mass, not just a ring), then a scorched bowl with a raised
 *    lip and fissures that glow arcane-hot at the landing and the nova and
 *    cool to slate through the linger.
 *  - **the warp** (`createWarpMaterial`) — LAYER.DISTORTION: the landing's
 *    ring and the nova's.
 *
 * Every material reads `settings.runemeteor` in `userData.sync(state)`.
 */

const ID = 'runemeteor';
export const MAX_STONES = 10;
export const MAX_BEAMS = MAX_STONES + 1;

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/** A rune in a cell. `uv` 0..1, `id` picks which. Returns 0..1 ink. */
const RUNE_GLSL = /* glsl */ `
  float sdSeg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  float rune(vec2 uv, float id, float weight) {
    vec2 p = uv - 0.5;
    float d = sdSeg(p, vec2(0.0, -0.36), vec2(0.0, 0.36));
    float h1 = hash11(id * 1.37 + 0.1);
    float h2 = hash11(id * 2.11 + 3.0);
    float h3 = hash11(id * 5.30 + 1.0);
    float h4 = hash11(id * 7.70 + 2.0);
    float h5 = hash11(id * 3.90 + 5.0);
    float s = h5 > 0.5 ? 1.0 : -1.0;
    if (h1 > 0.35) d = min(d, sdSeg(p, vec2(0.0, 0.36), vec2(0.24 * s, 0.12)));
    if (h2 > 0.45) d = min(d, sdSeg(p, vec2(0.0, 0.05), vec2(-0.24 * s, -0.16)));
    if (h3 > 0.55) d = min(d, sdSeg(p, vec2(-0.22, 0.0), vec2(0.22, 0.0)));
    if (h4 > 0.6) d = min(d, sdSeg(p, vec2(0.0, -0.1), vec2(0.22 * s, -0.36)));
    if (h1 < 0.2) d = min(d, abs(length(p - vec2(0.0, 0.12)) - 0.14));
    return 1.0 - smoothstep(weight * 0.55, weight, d);
  }
`;

/* -------------------------------------------------------------------- */
/* The stones                                                           */
/* -------------------------------------------------------------------- */

const STONE_VERTEX = /* glsl */ `
  attribute vec4 aM0;
  attribute vec4 aM1;
  attribute vec4 aM2;
  attribute vec4 aM3;
  attribute vec4 aState;      // x glow, y crumble, z seed, w visible

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;
  varying vec3  vScale;
  varying vec3  vNormalL;
  varying vec4  vState;

  void main() {
    mat4 M = mat4(aM0, aM1, aM2, aM3);
    if (aState.w < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec4 world = M * vec4(position, 1.0);
    vec3 sx = vec3(M[0]);
    vec3 sy = vec3(M[1]);
    vec3 sz = vec3(M[2]);
    vScale = vec3(length(sx), length(sy), length(sz));
    // Normals through the inverse scale (the slab is scaled non-uniformly).
    vec3 n = normal / max(vScale, vec3(1e-4));
    vNormalW = normalize(mat3(sx / max(vScale.x, 1e-4), sy / max(vScale.y, 1e-4), sz / max(vScale.z, 1e-4)) * n);
    vWorld = world.xyz;
    vLocal = position;
    vNormalL = normal;
    vState = aState;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const STONE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform vec3  uStone;
  uniform vec3  uStoneLight;
  uniform vec3  uGlyph;
  uniform vec3  uGlyphHot;
  uniform vec3  uRimColor;
  uniform float uGlyphGlow;
  uniform float uGlyphScale;
  uniform float uRim;
  uniform float uEdge;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vLocal;
  varying vec3  vScale;
  varying vec3  vNormalL;
  varying vec4  vState;

  ${noiseGLSL}
  ${RUNE_GLSL}

  void main() {
    vec3 metres = vLocal * vScale;
    float seed = vState.z;

    // Crumbling: eaten from a burning edge, from the top down.
    float cn = snoise01(metres * 2.2 + seed) * 0.7 + (1.0 - vLocal.y) * 0.3;
    float thr = vState.y * 1.1 - 0.05;
    if (vState.y > 0.0 && cn < thr) discard;
    float burn = vState.y > 0.0 ? 1.0 - smoothstep(thr, thr + uEdge, cn) : 0.0;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;

    // Slate, mottled and faintly layered.
    float mott = fbm3(metres * 1.6 + seed * 3.0) * 0.5 + 0.5;
    float strata = 0.5 + 0.5 * sin(metres.y * 9.0 + snoise(metres * 1.2) * 2.0);
    vec3 base = mix(uStone, uStoneLight, mott * 0.7 + strata * 0.15);
    vec3 L = normalize(uLightDir);
    float diff = max(dot(N, L), 0.0);
    vec3 color = base * (0.22 + 0.78 * diff) + base * 0.12;

    // Runes carved down both broad faces.
    float face = smoothstep(0.6, 0.85, abs(vNormalL.z));
    vec2 fp = vec2(metres.x, metres.y) * uGlyphScale;
    vec2 cell = floor(fp);
    vec2 cuv = fract(fp);
    float inColumn = (1.0 - smoothstep(0.3, 0.36, abs(vLocal.x))) * smoothstep(0.08, 0.12, vLocal.y) * (1.0 - smoothstep(0.78, 0.84, vLocal.y));
    float ink = rune(cuv, cell.x * 7.0 + cell.y * 13.0 + seed * 31.0 + (vNormalL.z > 0.0 ? 0.0 : 101.0), 0.09) * face * inColumn;
    float glow = vState.x;
    color = mix(color, color * 0.35, ink);                       // carved dark
    color += mix(uGlyph, uGlyphHot, clamp(glow - 0.6, 0.0, 1.0)) * ink * glow * uGlyphGlow * uGlobalGlow;

    float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    color += uRimColor * rim * uRim * (0.4 + 0.6 * glow) * uGlobalGlow;
    color += uGlyphHot * burn * 5.0 * uGlobalGlow;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createStoneMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStone: { value: new Color() },
      uStoneLight: { value: new Color() },
      uGlyph: { value: new Color() },
      uGlyphHot: { value: new Color() },
      uRimColor: { value: new Color() },
      uGlyphGlow: { value: 3 },
      uGlyphScale: { value: 5 },
      uRim: { value: 1 },
      uEdge: { value: 0.08 }
    }),
    vertexShader: STONE_VERTEX,
    fragmentShader: STONE_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStone.value.copy(getColor(c.colorStone));
    u.uStoneLight.value.copy(getColor(c.colorStoneLight));
    u.uGlyph.value.copy(getColor(c.colorGlyph));
    u.uGlyphHot.value.copy(getColor(c.colorGlyphHot));
    u.uRimColor.value.copy(getColor(c.colorGlyph));
    u.uGlyphGlow.value = c.glyphGlow * g.glow * g.shaderIntensity;
    u.uGlyphScale.value = c.glyphScale;
    u.uRim.value = c.stoneRim * g.fresnel;
    u.uEdge.value = Math.max(0.005, c.crumbleEdge);
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The star                                                             */
/* -------------------------------------------------------------------- */

const ORB_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vLocal = position;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ORB_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;
  uniform float uCoreGlow;
  uniform float uFacetGlow;
  uniform float uRimGlow;
  uniform float uSwirlScale;
  uniform float uSwirl;       // integrated
  uniform float uFlare;       // 0..1+ the landing and the nova
  uniform float uSeed;
  uniform vec3  uCore;
  uniform vec3  uCrystal;
  uniform vec3  uDeep;
  uniform vec3  uRimColor;

  varying vec3 vWorld;
  varying vec3 vLocal;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    // Flat facets: the face normal from screen-space derivatives.
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // Looking in through the facet: an arcane swirl turning inside.
    vec3 inward = normalize(vLocal - N * 0.4);
    vec3 q = inward * uSwirlScale;
    q.xz *= mat2(cos(uSwirl), -sin(uSwirl), sin(uSwirl), cos(uSwirl));
    float sw = fbm3(q + vec3(0.0, uSwirl * 0.3, uSeed));
    float bands = 0.5 + 0.5 * sin(sw * 9.0 + uSwirl * 2.0);
    vec3 inner = mix(uDeep, uCrystal, bands) * (0.6 + sw);
    float core = pow(ndv, 4.0);
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;

    vec3 col = inner * uFacetGlow + uCore * core * uCoreGlow;
    // Every facet catches the light differently.
    float facet = hash13(floor(N * 9.0) + uSeed);
    col += uCrystal * facet * 0.6 * uFacetGlow + env * 0.5;
    col += uRimColor * pow(1.0 - ndv, 2.5) * uRimGlow;
    col *= 1.0 + uFlare * 2.0;
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

export function createOrbMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uCoreGlow: { value: 4 },
      uFacetGlow: { value: 1.5 },
      uRimGlow: { value: 3 },
      uSwirlScale: { value: 2.5 },
      uSwirl: { value: 0 },
      uFlare: { value: 0 },
      uSeed: { value: 0 },
      uCore: { value: new Color() },
      uCrystal: { value: new Color() },
      uDeep: { value: new Color() },
      uRimColor: { value: new Color() }
    }),
    vertexShader: ORB_VERTEX,
    fragmentShader: ORB_FRAGMENT
  });

  /** @param {object} s { swirl, flare, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCoreGlow.value = c.coreGlow * g.glow;
    u.uFacetGlow.value = c.facetGlow * g.shaderIntensity;
    u.uRimGlow.value = c.rimGlow * g.fresnel;
    u.uSwirlScale.value = c.swirlScale * g.noiseFrequency;
    u.uSwirl.value = s.swirl;
    u.uFlare.value = s.flare;
    u.uSeed.value = s.seed;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uCrystal.value.copy(getColor(c.colorCrystal));
    u.uDeep.value.copy(getColor(c.colorDeep));
    u.uRimColor.value.copy(getColor(c.colorRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The rune bands                                                       */
/* -------------------------------------------------------------------- */

const BAND_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform vec3  uAxisA;       // the band's plane
  uniform vec3  uAxisB;
  uniform float uRadius;
  uniform float uWidth;
  uniform float uSpin;

  varying vec2  vBand;
  varying float vViewZ;

  void main() {
    float a = position.x * 6.2831853 + uSpin;
    vec3 radial = cos(a) * uAxisA + sin(a) * uAxisB;
    vec3 axis = normalize(cross(uAxisA, uAxisB));
    vec3 world = uCenter + radial * uRadius + axis * position.y * uWidth * 0.5;
    vBand = position.xy;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BAND_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlow;
  uniform float uFade;
  uniform float uCells;
  uniform float uSeed;
  uniform vec3  uColor;
  uniform float uGlobalGlow;

  varying vec2  vBand;
  varying float vViewZ;

  ${noiseGLSL}
  ${RUNE_GLSL}

  void main() {
    float across = vBand.y;
    float rails = exp(-pow((abs(across) - 0.85) / 0.08, 2.0));
    float x = vBand.x * uCells;
    float ink = rune(vec2(fract(x), across * 0.5 + 0.5), floor(x) + uSeed * 17.0, 0.1) * (1.0 - smoothstep(0.7, 0.8, abs(across)));
    float shimmer = 0.75 + 0.25 * sin(vBand.x * 40.0 - uTime * 6.0);
    float a = (rails * 0.8 + ink) * shimmer * uFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor * uGlow * a * uGlobalGlow, a);
  }
`;

export function createBandMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uAxisA: { value: new Vector3(1, 0, 0) },
      uAxisB: { value: new Vector3(0, 0, 1) },
      uRadius: { value: 1 },
      uWidth: { value: 0.2 },
      uSpin: { value: 0 },
      uGlow: { value: 2.5 },
      uFade: { value: 1 },
      uCells: { value: 24 },
      uSeed: { value: 0 },
      uColor: { value: new Color() }
    }),
    vertexShader: BAND_VERTEX,
    fragmentShader: BAND_FRAGMENT
  });

  /** @param {object} s { center, axisA, axisB, radius, spin, fade, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uAxisA.value.copy(s.axisA);
    u.uAxisB.value.copy(s.axisB);
    u.uRadius.value = s.radius;
    u.uWidth.value = Math.max(0.02, c.bandWidth);
    u.uSpin.value = s.spin;
    u.uGlow.value = c.bandGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    // Runes as tall as the band is wide, all the way round.
    u.uCells.value = Math.max(4, Math.round((6.2831853 * s.radius) / Math.max(0.05, c.bandWidth * 0.8)));
    u.uSeed.value = s.seed;
    u.uColor.value.copy(getColor(c.colorBand));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The beams                                                            */
/* -------------------------------------------------------------------- */

const BEAM_VERTEX = /* glsl */ `
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec4 aBeam;       // x width, y intensity, z seed, w scroll

  varying vec2  vRib;
  varying vec4  vBeam;
  varying float vLen;

  void main() {
    if (aBeam.y <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec3 c = mix(aA, aB, position.x);
    vec3 T = aB - aA;
    vec3 toCam = normalize(cameraPosition - c);
    vec3 W = normalize(cross(T + vec3(1e-5, 0.0, 0.0), toCam));
    vec3 world = c + W * position.y * aBeam.x;
    vRib = position.xy;
    vBeam = aBeam;
    vLen = length(T);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uGlobalGlow;

  varying vec2  vRib;
  varying vec4  vBeam;
  varying float vLen;

  ${noiseGLSL}

  void main() {
    float y = abs(vRib.y);
    float core = exp(-y * y * 18.0);
    float halo = exp(-y * y * 3.0) * 0.35;
    float d = vRib.x * vLen;
    // Pulses of energy running along it.
    float run = 0.6 + 0.4 * smoothstep(0.6, 1.0, sin(d * 3.0 - vBeam.w));
    float ends = smoothstep(0.0, 0.05, vRib.x) * smoothstep(0.0, 0.05, 1.0 - vRib.x);
    float n = 0.8 + 0.2 * snoise(vec3(d * 2.0, vBeam.z, uTime * 3.0));
    float a = (core + halo) * run * ends * n * vBeam.y;
    if (a < 0.003) discard;
    vec3 col = mix(uColor, uHot, core);
    gl_FragColor = vec4(col * a * uGlobalGlow, a);
  }
`;

export function createBeamMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uColor: { value: new Color() },
      uHot: { value: new Color() }
    }),
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT
  });
  material.userData.sync = () => {
    const c = settings[ID];
    material.uniforms.uColor.value.copy(getColor(c.colorTether));
    material.uniforms.uHot.value.copy(getColor(c.colorCore));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The sigil                                                            */
/* -------------------------------------------------------------------- */

const SIGIL_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vXZ;
  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    world.y = 0.015;
    vXZ = position.xy * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SIGIL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;
  uniform float uBand;
  uniform float uDraw;        // 0..1 drawn round
  uniform float uStar;        // 0..1 the star polygon drawn in
  uniform float uBlaze;       // 0..1+ the nova
  uniform float uStones;
  uniform float uSpin;        // the stones' starting angle
  uniform float uRing;        // where the stones stand
  uniform float uGlow;
  uniform float uStarGlow;
  uniform float uFade;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uGlobalGlow;

  varying vec2 vXZ;

  ${noiseGLSL}
  ${RUNE_GLSL}

  void main() {
    float r = length(vXZ);
    float ang = atan(vXZ.y, vXZ.x);
    float a01 = fract((ang - uSpin) * 0.15915494 + 1.0);
    float drawn = step(a01, uDraw);

    // Two rings and a band of runes between them.
    float bw = max(uBand, 0.05);
    float outer = exp(-pow((r - uRadius) / 0.03, 2.0));
    float inner = exp(-pow((r - (uRadius - bw)) / 0.025, 2.0));
    float t = (r - (uRadius - bw)) / bw;
    float cells = floor(6.2831853 * (uRadius - bw * 0.5) / (bw * 0.8));
    float x = a01 * cells;
    float ink = rune(vec2(fract(x), t), floor(x) + uSeed * 11.0, 0.11) * step(0.0, t) * step(t, 1.0);
    float ringM = (outer + inner * 0.8 + ink) * drawn;

    // The star polygon joining where the stones stand.
    float N = max(uStones, 3.0);
    float step_ = N >= 7.0 ? 3.0 : 2.0;
    float star = 0.0;
    for (int i = 0; i < 10; i++) {
      if (float(i) >= N) break;
      float a0 = uSpin + 6.2831853 * float(i) / N;
      float a1 = uSpin + 6.2831853 * (float(i) + step_) / N;
      vec2 p0 = vec2(cos(a0), sin(a0)) * uRing;
      vec2 p1 = vec2(cos(a1), sin(a1)) * uRing;
      star = max(star, exp(-pow(sdSeg(vXZ, p0, p1) / 0.025, 2.0)));
    }
    float circleIn = exp(-pow((r - uRing) / 0.02, 2.0)) * 0.6;
    float starM = (star + circleIn) * uStar;

    float pulse = 0.8 + 0.2 * sin(uTime * 4.0 - r * 2.0);
    vec3 col = mix(uColor, uHot, clamp(uBlaze, 0.0, 1.0)) * (ringM * uGlow + starM * uStarGlow) * pulse * (1.0 + uBlaze * 2.0);
    float a = clamp(ringM + starM, 0.0, 1.0) * uFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, a);
  }
`;

export function createSigilMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 5 },
      uSeed: { value: 0 },
      uRadius: { value: 4 },
      uBand: { value: 0.5 },
      uDraw: { value: 0 },
      uStar: { value: 0 },
      uBlaze: { value: 0 },
      uStones: { value: 7 },
      uSpin: { value: 0 },
      uRing: { value: 3.4 },
      uGlow: { value: 1.6 },
      uStarGlow: { value: 1.6 },
      uFade: { value: 1 },
      uColor: { value: new Color() },
      uHot: { value: new Color() }
    }),
    vertexShader: SIGIL_VERTEX,
    fragmentShader: SIGIL_FRAGMENT
  });

  /** @param {object} s { center, draw, star, blaze, stones, spin, fade, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    const R = Math.max(0.5, c.zoneRadius);
    u.uCenter.value.copy(s.center);
    u.uSize.value = R + 0.5;
    u.uSeed.value = s.seed;
    u.uRadius.value = R;
    u.uBand.value = c.sigilWidth;
    u.uDraw.value = s.draw;
    u.uStar.value = s.star;
    u.uBlaze.value = s.blaze;
    u.uStones.value = s.stones;
    u.uSpin.value = s.spin;
    u.uRing.value = R * c.ringRadius;
    u.uGlow.value = c.sigilGlow * g.glow;
    u.uStarGlow.value = c.starGlow * g.glow;
    u.uFade.value = c.floorOpacity * g.opacity * s.fade;
    u.uColor.value.copy(getColor(c.colorSigil));
    u.uHot.value.copy(getColor(c.colorSigilHot));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The ground — the star's shadow, then the crater it leaves            */
/* -------------------------------------------------------------------- */

const GROUND_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;      // the circle
  uniform float uShade;       // 0..1 the star's shadow gathering as it falls
  uniform float uShadow;      // how dark that gathering gets
  uniform float uCrater;      // metres: the bowl it punched (0 before landing)
  uniform float uHeat;        // 0..1+ fresh cracks glowing
  uniform float uCracks;      // fissures out of the bowl
  uniform float uCrackReach;  // × the crater, how far they run
  uniform float uOpacity;
  uniform float uFade;
  uniform vec3  uDeep;
  uniform vec3  uBody;
  uniform vec3  uHot;
  uniform float uGlobalGlow;

  varying vec2 vXZ;

  ${noiseGLSL}

  void main() {
    float r = length(vXZ);
    float ang = atan(vXZ.y, vXZ.x);
    float n = fbm3(vec3(vXZ * 0.9, uSeed)) * 0.5 + 0.5;
    float disc = 1.0 - smoothstep(uRadius * 0.82, uRadius * 1.02, r);

    // 1 · Anticipation: the circle darkens under the falling star, the
    // darkest pool tightening onto where it will strike.
    float pool = exp(-pow(r / max(0.4, uRadius * (0.75 - 0.4 * uShade)), 2.0));
    float shade = uShade * uShadow * (disc * (0.45 + 0.25 * n) + pool * 0.5);

    // 2 · The crater: a scorched bowl with a lighter, raised lip and
    // fissures that glow arcane-hot, then cool to slate.
    float C = max(uCrater, 1e-3);
    float bowl = (1.0 - smoothstep(C * 0.8, C, r)) * step(0.01, uCrater);
    float lip = exp(-pow((r - C) / (C * 0.12), 2.0)) * step(0.01, uCrater);
    float k = ang * uCracks / 6.2831853 + uSeed;
    float wob = fbm3(vec3(vXZ * 1.7, uSeed + 3.0)) * 0.9;
    float line = abs(fract(k + wob * 0.35) - 0.5) * 2.0;
    float reach = C * uCrackReach * (0.7 + 0.5 * hash11(floor(k + wob * 0.35) + uSeed));
    float crack = pow(1.0 - line, 46.0 * (0.4 + r / max(reach, 0.1))) * (1.0 - smoothstep(reach * 0.7, reach, r)) * step(C * 0.35, r) * step(0.01, uCrater);

    float a = max(shade, max(bowl * (0.75 + 0.2 * n), lip * 0.7));
    a = max(a, crack);
    vec3 col = mix(uDeep, uBody, clamp(lip + bowl * n * 0.35, 0.0, 1.0));
    // The pool is not just dark: a faint cold glow gathers at its heart and
    // rune-light veins it, so the telegraph reads on a dark floor.
    float vein = pow(1.0 - abs(fbm3(vec3(vXZ * 1.3, uSeed + uTime * 0.2))), 18.0);
    col += uHot * uShade * (1.0 - step(0.01, uCrater)) * (pool * 0.35 + vein * disc * 0.6) * uGlobalGlow;
    a = max(a, uShade * disc * vein * 0.6);
    col += uHot * crack * (0.25 + uHeat * 2.5) * uGlobalGlow;
    col += uHot * bowl * pow(1.0 - r / C, 2.0) * uHeat * 0.8 * uGlobalGlow;
    a *= uOpacity * uFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
  }
`;

export function createGroundMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 5 },
      uSeed: { value: 0 },
      uRadius: { value: 4 },
      uShade: { value: 0 },
      uShadow: { value: 0.7 },
      uCrater: { value: 0 },
      uHeat: { value: 0 },
      uCracks: { value: 9 },
      uCrackReach: { value: 2 },
      uOpacity: { value: 1 },
      uFade: { value: 1 },
      uDeep: { value: new Color() },
      uBody: { value: new Color() },
      uHot: { value: new Color() }
    }),
    vertexShader: SIGIL_VERTEX,
    fragmentShader: GROUND_FRAGMENT
  });

  /** @param {object} s { center, shade, crater, heat, fade, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    const R = Math.max(0.5, c.zoneRadius);
    u.uCenter.value.copy(s.center);
    u.uSize.value = Math.max(R, c.craterRadius * c.crackReach) + 0.5;
    u.uSeed.value = s.seed;
    u.uRadius.value = R;
    u.uShade.value = s.shade;
    u.uShadow.value = c.groundShadow;
    u.uCrater.value = s.crater;
    u.uHeat.value = s.heat;
    u.uCracks.value = Math.max(1, Math.round(c.crackCount));
    u.uCrackReach.value = c.crackReach;
    u.uOpacity.value = c.groundOpacity * g.opacity;
    u.uFade.value = s.fade;
    u.uDeep.value.copy(getColor(c.colorGroundDeep));
    u.uBody.value.copy(getColor(c.colorGroundBody));
    u.uHot.value.copy(getColor(c.colorCrackHot));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The warp — LAYER.DISTORTION                                          */
/* -------------------------------------------------------------------- */

const WARP_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uProgress;    // 0..1 the ring opening (0 = none)
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv);
    if (r > 1.0 || uProgress <= 0.0) discard;
    float R = 0.08 + 0.92 * uProgress;
    float d = (r - R) / 0.08;
    float m = exp(-d * d) * (1.0 - uProgress);
    vec2 dir = vUv / max(r, 1e-4);
    float strength = uStrength * m * uShaderIntensity;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * clamp(-d * exp(-d * d) * 2.0, -1.0, 1.0) * 0.5 + 0.5, strength, 1.0);
  }
`;

export function createWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 5 },
      uProgress: { value: 0 },
      uStrength: { value: 1 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { center, size, progress } */
  material.userData.sync = (s) => {
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = s.size;
    u.uProgress.value = s.progress;
    u.uStrength.value = settings[ID].ringWarp * settings.global.distortion;
  };

  return material;
}

