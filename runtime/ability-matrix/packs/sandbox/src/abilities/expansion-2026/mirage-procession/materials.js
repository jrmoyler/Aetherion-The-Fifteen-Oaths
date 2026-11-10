import { AdditiveBlending, Color, DoubleSide, FrontSide, MeshPhysicalMaterial, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Mirage Procession — the bespoke shaders.
 *
 *  - **the carved face** — lit dark lacquer (`MeshPhysicalMaterial` +
 *    clearcoat, patched): a camera-side modelling key, a gilded border with
 *    a magenta glow and a running scan band, magenta fire on the eye-hole
 *    rims and in the mouth slit, slice glitches in the vertex stage, and a
 *    noise dissolve with a white-hot edge for the appear and the burn-away.
 *  - **the engraving** — glints running along each filigree stroke (`aT`).
 *  - **the veil** — a silk ribbon fluttered, swayed and drooped in the
 *    vertex stage, iridescent at its edges and thinning toward the hem.
 *  - **the wake** — heat shimmer down each lane: fbm-bent bands brightest
 *    just behind the mask, feathered at both sides.
 *  - **the mirror shards** — instanced; a fake sky/floor reflection off the
 *    reflected view vector and a thin-film rim, so they flash as they turn.
 *  - **the glitter** — a GPU point cloud dealt evenly over the three lanes.
 *  - **the shimmer** — `LAYER.DISTORTION` sheet standing across all three
 *    lanes at the mask front: the air the procession bends.
 *
 * Every material reads `settings.mirageProcession` in `userData.sync(state)`.
 */

const ID = config.id;

const additive = (extra) => ({
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: AdditiveBlending,
  side: DoubleSide,
  toneMapped: false,
  ...extra,
});

/** Thin-film interference approximated by a phase-shifted cosine palette. */
const FILM_GLSL = /* glsl */ `
  vec3 thinFilm(float phase) {
    return 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + phase));
  }
`;

/* -------------------------------------------------------------------- */
/* The carved face (the hero)                                           */
/* -------------------------------------------------------------------- */

/**
 * The face is mirrored from `geometry.js` (`FACE_EYE`, `FACE_MOUTH`): the
 * shader finds the eye holes and the mouth slit from the object-space
 * position so the glow sits exactly on the cut rims.
 */
const FACE_HOLES_GLSL = /* glsl */ `
  float mpEyeDist(vec2 p) {
    vec2 e = vec2(abs(p.x) - 0.2, p.y - 0.1);
    float cs = cos(0.2), sn = sin(0.2);
    e = vec2(e.x * cs + e.y * sn, -e.x * sn + e.y * cs);
    return (length(e / vec2(0.105, 0.05)) - 1.0) * 0.045;
  }
  float mpMouthDist(vec2 p) {
    float u = p.x / 0.17;
    float dy = p.y + 0.37 - 0.02 * u * u;
    return (length(vec2(u, dy / 0.026)) - 1.0) * 0.024;
  }
  float mpHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float mpNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(mpHash(i), mpHash(i + vec3(1, 0, 0)), f.x), mix(mpHash(i + vec3(0, 1, 0)), mpHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(mpHash(i + vec3(0, 0, 1)), mpHash(i + vec3(1, 0, 1)), f.x), mix(mpHash(i + vec3(0, 1, 1)), mpHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
`;

/**
 * The carved theatrical face: lit lacquer (`MeshPhysicalMaterial`, clearcoat
 * varnish, on `LAYER.WORLD`, casting shadows) patched with
 *  - a camera-side key in the emissive so brow, nose bridge and cheekbones
 *    model even on the night stage, the hollows staying near-black;
 *  - gilding round the border (`aEdge`): metal, with a magenta emissive and
 *    a scan band running round it;
 *  - magenta fire on the eye-hole rims (HDR at the cut) and an ember in the
 *    mouth slit — the only places the saturated body colour appears;
 *  - a noise dissolve (appear and burn-away) with a white-hot edge;
 *  - slice glitches in the vertex stage;
 *  - `heat` for the true-strike copy: eyes and gilding blaze, a magenta
 *    fresnel aura — the lacquer itself stays dark.
 */
export function createFaceMaterial() {
  const material = new MeshPhysicalMaterial({ color: 0x3a1838, roughness: 0.34, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.12, side: DoubleSide });
  const u = {
    uMpClock: { value: 0 },
    uMpDissolve: { value: 0 },
    uMpEdgeW: { value: 0.08 },
    uMpGlitch: { value: 0 },
    uMpKey: { value: 0.6 },
    uMpRim: { value: 0.4 },
    uMpSpec: { value: 0.8 },
    uMpGild: { value: 1.3 },
    uMpGildW: { value: 0.045 },
    uMpGildMetal: { value: 0.85 },
    uMpEye: { value: 3 },
    uMpEyeSpread: { value: 0.045 },
    uMpMouth: { value: 1 },
    uMpHeat: { value: 0 },
    uMpScan: { value: 7 },
    uMpFilm: { value: 0.8 },
    uMpGlow: { value: 1 },
    uMpDeepBias: { value: 0 },
    uMpCore: { value: new Color() },
    uMpPale: { value: new Color() },
    uMpBody: { value: new Color() },
    uMpDeep: { value: new Color() },
    uMpLacquer: { value: new Color() },
  };
  material.userData.uniforms = u;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aEdge;
        uniform float uMpClock;
        uniform float uMpGlitch;
        varying vec3 vMpLocal;
        varying float vMpEdge;
        float mpVHash(float p) { return fract(sin(p * 91.345) * 47453.5453); }`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vMpLocal = position;
        vMpEdge = aEdge;
        {
          // Slice glitches: a horizontal strip of the face jumps sideways.
          float strip = floor(position.y * 14.0);
          float tick = floor(uMpClock * 9.0);
          float slice = step(0.94, mpVHash(strip * 7.13 + tick * 1.31));
          transformed.x += slice * (mpVHash(strip + tick) - 0.5) * 0.1 * uMpGlitch;
        }`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vMpLocal;
        varying float vMpEdge;
        uniform float uMpClock;
        uniform float uMpDissolve;
        uniform float uMpEdgeW;
        uniform float uMpKey;
        uniform float uMpRim;
        uniform float uMpSpec;
        uniform float uMpGild;
        uniform float uMpGildW;
        uniform float uMpGildMetal;
        uniform float uMpEye;
        uniform float uMpEyeSpread;
        uniform float uMpMouth;
        uniform float uMpHeat;
        uniform float uMpScan;
        uniform float uMpFilm;
        uniform float uMpGlow;
        uniform float uMpDeepBias;
        uniform vec3 uMpCore;
        uniform vec3 uMpPale;
        uniform vec3 uMpBody;
        uniform vec3 uMpDeep;
        uniform vec3 uMpLacquer;
        ${FACE_HOLES_GLSL}`
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        // Dissolve (appear and burn-away): grain at two scales.
        float mpN = mpNoise(vMpLocal * 7.0 + vec3(0.0, 0.0, uMpClock * 0.15)) * 0.65 + mpNoise(vMpLocal * 23.0) * 0.35;
        float mpCut = mpN - uMpDissolve;
        if (uMpDissolve > 0.001 && mpCut < 0.0) discard;
        float mpBurn = uMpDissolve > 0.001 ? 1.0 - smoothstep(0.0, uMpEdgeW, mpCut) : 0.0;
        float mpGild = 1.0 - smoothstep(uMpGildW * 0.6, uMpGildW, vMpEdge);
        float mpEyeD = max(mpEyeDist(vMpLocal.xy), 0.0);
        float mpEye = exp(-mpEyeD / max(0.002, uMpEyeSpread)) * (1.0 - smoothstep(uMpEyeSpread * 2.0, uMpEyeSpread * 4.0, mpEyeD));
        float mpMouthD = max(mpMouthDist(vMpLocal.xy), 0.0);
        float mpMouth = exp(-mpMouthD / max(0.002, uMpEyeSpread * 0.6)) * (1.0 - smoothstep(uMpEyeSpread * 1.2, uMpEyeSpread * 2.4, mpMouthD));`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix(uMpLacquer, uMpDeep, clamp(uMpDeepBias * 2.0, 0.0, 1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, uMpLacquer * 1.6, clamp(-uMpDeepBias * 2.0, 0.0, 1.0));
        // Gilding: a pale-metal border; eye rims darken to soot round the fire.
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(uMpPale, uMpBody, 0.35) * 0.6, mpGild);
        diffuseColor.rgb *= 1.0 - 0.6 * mpEye;`
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, uMpGildMetal, mpGild);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 mpN3 = normalize(normal);
          vec3 mpV = normalize(vViewPosition);
          // A key from above-right of the camera: lit planes come up to a
          // mauve lacquer, hollows (sockets, under the brow, the cheeks) stay
          // in the deep stop.
          vec3 mpL = normalize(vec3(0.7, 0.55, 0.45));
          float mpLam = max(0.0, dot(mpN3, mpL));
          float mpFres = pow(1.0 - clamp(dot(mpN3, mpV), 0.0, 1.0), 3.0);
          vec3 mpLit = uMpLacquer * 3.0 + vec3(0.1, 0.075, 0.1);
          vec3 mpE = mix(uMpDeep * 0.3, mpLit, pow(mpLam, 1.6)) * uMpKey * (1.0 - mpGild * 0.5);
          float mpGlint = pow(max(0.0, dot(reflect(-mpV, mpN3), mpL)), 60.0) * uMpSpec;
          mpE += uMpCore * mpGlint * 0.6 * (1.0 - mpEye);
          mpE += uMpPale * mpFres * uMpRim * 0.35;
          // Gilding: magenta glow, a pale scan band running round it.
          float mpBand = pow(max(0.0, cos(atan(vMpLocal.y, vMpLocal.x) * 3.0 - uMpClock * uMpScan * 0.4)), 16.0);
          vec3 mpFilm = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + mpFres * 0.9 + uMpClock * 0.05));
          vec3 mpGildCol = mix(uMpBody, uMpPale * mpFilm, uMpFilm * 0.35) * (0.55 + 0.6 * mpBand);
          mpE += mpGildCol * mpGild * uMpGild;
          // Eyes: magenta fire, white-hot right at the cut.
          vec3 mpEyeCol = mix(uMpBody, uMpCore, mpEye * mpEye * mpEye * 0.35);
          float mpFlick = 0.85 + 0.15 * sin(uMpClock * 11.0 + vMpLocal.x * 9.0);
          mpE += mpEyeCol * mpEye * uMpEye * mpFlick;
          mpE += uMpBody * mpMouth * uMpMouth;
          // The true strike: eyes and gilding blaze, a magenta aura on the rim.
          mpE += uMpBody * uMpHeat * (mpEye * 2.0 + mpGild * 1.5 + mpFres * 1.2);
          mpE += uMpCore * mpBurn * 2.5;
          totalEmissiveRadiance += mpE * uMpGlow;
        }`
      );
  };
  material.customProgramCacheKey = () => 'mirage-procession-face';
  /** @param {object} s { clock, fade, dissolve, calm, heat? } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    material.color.copy(getColor(c.maskLacquer));
    material.roughness = c.maskRoughness;
    material.metalness = c.maskMetalness;
    material.clearcoat = c.maskClearcoat;
    // Appear materialises through the same dissolve the burn-away uses.
    const cover = Math.max(0, Math.min(1, s.fade * c.maskOpacity * g.opacity));
    u.uMpDissolve.value = Math.max(s.dissolve, 1.02 * (1 - cover));
    u.uMpClock.value = s.clock;
    u.uMpEdgeW.value = c.dissolveEdge;
    u.uMpGlitch.value = s.calm ? 0 : c.glitch * g.randomness;
    u.uMpKey.value = c.maskKeyFill * c.maskShade;
    u.uMpRim.value = c.maskRimLight * g.fresnel;
    u.uMpSpec.value = c.maskSpecular;
    u.uMpGild.value = c.gildGlow * g.shaderIntensity;
    u.uMpGildW.value = c.gildWidth;
    u.uMpGildMetal.value = c.gildMetal;
    u.uMpEye.value = c.eyeGlow * g.shaderIntensity;
    u.uMpEyeSpread.value = c.eyeSpread;
    u.uMpMouth.value = c.mouthGlow * g.shaderIntensity;
    u.uMpHeat.value = s.heat ?? 0;
    u.uMpScan.value = s.calm ? 0 : c.scanSpeed * g.noiseSpeed;
    u.uMpFilm.value = c.filmStrength;
    u.uMpGlow.value = c.maskGlow * g.glow;
    u.uMpDeepBias.value = c.maskDeep;
    u.uMpCore.value.copy(getColor(c.coreColor));
    u.uMpPale.value.copy(getColor(c.edgeColor));
    u.uMpBody.value.copy(getColor(c.maskColor));
    u.uMpDeep.value.copy(getColor(c.deepColor));
    u.uMpLacquer.value.copy(getColor(c.maskLacquer));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The engraving                                                        */
/* -------------------------------------------------------------------- */

const ENGRAVING_VERTEX = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() {
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ENGRAVING_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uGlow;
  uniform vec3  uEdge;
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  varying float vT;
  void main() {
    float glint = pow(max(0.0, sin((vT * 2.0 - uClock * 0.8) * 6.2831853)), 12.0);
    float a = (0.55 + 0.15 * sin(uClock * 3.0) + glint) * uFade;
    vec3 col = mix(uColor, uEdge, 0.6 + 0.4 * glint);
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** Glinting filigree lines. */
export function createEngravingMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.4 },
      uEdge: { value: new Color() },
      uColor: { value: new Color() },
    }),
    vertexShader: ENGRAVING_VERTEX,
    fragmentShader: ENGRAVING_FRAGMENT,
  });
  /** @param {object} s { clock, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.engravingGlow * g.glow;
    u.uEdge.value.copy(getColor(c.edgeColor));
    u.uColor.value.copy(getColor(c.maskColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The veil                                                             */
/* -------------------------------------------------------------------- */

const VEIL_VERTEX = /* glsl */ `
  uniform float uClock;
  uniform float uLength;
  uniform float uWidth;
  uniform float uFlutter;
  uniform float uDroop;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  ${noiseGLSL}

  void main() {
    vUv = uv;
    float v = uv.y;
    vec3 p = vec3(position.x * uWidth * (1.0 + v * 0.35), 0.0, v * uLength);
    // Flutter grows toward the hem; the hem also sags toward the floor.
    float wave = sin(v * 7.0 - uClock * 5.0 + position.x * 2.0);
    p.y += (wave * 0.09 + snoise(vec3(position.x * 2.0, v * 3.0, uClock * 0.8)) * 0.06) * v * uFlutter;
    p.x += sin(v * 4.0 - uClock * 3.1) * 0.08 * v * uFlutter;
    p.y -= v * v * uDroop;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const VEIL_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFilm;
  uniform vec3  uColor;
  uniform vec3  uEdge;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  ${noiseGLSL}
  ${commonGLSL}
  ${FILM_GLSL}

  void main() {
    float across = 1.0 - smoothstep(0.32, 0.5, abs(vUv.x - 0.5));
    float hem = pow(1.0 - vUv.y, 1.5);
    float weave = 0.75 + 0.25 * sin(vUv.x * 60.0) * sin(vUv.y * 40.0 - uClock * 2.0);
    float grazing = fresnelTerm(vViewDir, vNormalW, 1.5, 1.0);
    vec3 col = mix(uColor, thinFilm(vUv.y * 0.8 + grazing * 0.5 + uClock * 0.04) * uEdge, uFilm * (0.3 + 0.7 * grazing));
    float a = across * hem * weave * (0.4 + 0.6 * grazing) * uFade * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** Silk veils trailing the masks. */
export function createVeilMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uLength: { value: 1.6 },
      uWidth: { value: 0.8 },
      uFlutter: { value: 1 },
      uDroop: { value: 0.35 },
      uFade: { value: 1 },
      uGlow: { value: 1.2 },
      uOpacity: { value: 0.55 },
      uFilm: { value: 0.8 },
      uColor: { value: new Color() },
      uEdge: { value: new Color() },
    }),
    vertexShader: VEIL_VERTEX,
    fragmentShader: VEIL_FRAGMENT,
  });
  /** @param {object} s { clock, fade, calm } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uLength.value = c.veilLength;
    u.uWidth.value = c.veilWidth;
    u.uFlutter.value = s.calm ? 0 : c.veilFlutter * g.turbulence;
    u.uDroop.value = c.veilDroop;
    u.uFade.value = s.fade;
    u.uGlow.value = c.veilGlow * g.glow;
    u.uOpacity.value = c.veilOpacity * g.opacity;
    u.uFilm.value = c.filmStrength;
    u.uColor.value.copy(getColor(c.trailColor));
    u.uEdge.value.copy(getColor(c.edgeColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The wake                                                             */
/* -------------------------------------------------------------------- */

const WAKE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WAKE_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uShimmer;
  uniform float uScale;
  uniform float uFill;
  uniform float uVeins;
  uniform vec3  uColor;
  uniform vec3  uEdge;
  uniform vec3  uDeep;
  uniform float uDeepWeight;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    // uv.y is 0 at the mask, 1 back at the caster.
    float behind = vUv.y;
    float bend = fbm3(vec3(vWorld.xz * 0.6 * uScale, uClock * 0.3)) * 2.0;
    // The lane is a filled runner of lacquer haze laid on the floor: a
    // continuous deep-plum body, mottled, with broad swells of saturated
    // violet rolling down it and flowing veins — a surface, not a drawing.
    float edgeN = snoise(vec3(vWorld.xz * 1.1 * uScale, uClock * 0.4)) * 0.05;
    float side = 1.0 - smoothstep(0.3, 0.5, abs(vUv.x - 0.5) + edgeN);
    float body = fbm3(vec3(vWorld.xz * 0.9 * uScale, uClock * 0.25)) * 0.5 + 0.5;
    float swell = smoothstep(0.15, 0.95, 0.5 + 0.5 * cos(behind * 16.0 * uScale - uClock * 5.0 + sin(vUv.x * 9.0) * 1.5 + bend * uShimmer));
    float flow = snoise01(vec3(vWorld.x * 2.2 * uScale + bend, vWorld.z * 0.7 * uScale - uClock * 1.4, uClock * 0.3));
    float veins = smoothstep(0.72, 0.92, flow) * uVeins;
    float near = (0.55 + 0.45 * pow(1.0 - behind, 1.2)) * (1.0 - smoothstep(0.82, 1.0, behind + edgeN));
    float haze = (0.25 + 0.75 * snoise01(vec3(vWorld.xz * 1.3 * uScale, uClock * 0.6))) * 0.35 * uShaderIntensity;
    float a = (uFill * (0.7 + 0.3 * body) + swell * 0.25 + haze * uDeepWeight) * side * near * uFade * uOpacity;
    if (a < 0.002) discard;
    float lift = clamp(swell * 0.45 + (body - 0.5) * 0.5 + veins * 0.6, 0.0, 1.0);
    vec3 col = mix(uDeep, uColor * uGlow, lift);
    col = mix(col, uEdge * uGlow, veins * swell * 0.35 * (1.0 - behind));
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** Heat shimmer down each lane, on a deep haze (normal blend). */
export function createWakeMaterial() {
  const material = new ShaderMaterial({
    ...additive({ blending: NormalBlending }),
    uniforms: sharedUniforms({
      uDeep: { value: new Color() },
      uDeepWeight: { value: 1 },
      uClock: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.7 },
      uOpacity: { value: 0.3 },
      uShimmer: { value: 1 },
      uScale: { value: 1 },
      uFill: { value: 0.8 },
      uVeins: { value: 1 },
      uColor: { value: new Color() },
      uEdge: { value: new Color() },
    }),
    vertexShader: WAKE_VERTEX,
    fragmentShader: WAKE_FRAGMENT,
  });
  /** @param {object} s { clock, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uFade.value = s.fade;
    u.uGlow.value = c.wakeGlow * g.glow;
    u.uOpacity.value = c.wakeOpacity * g.opacity;
    u.uShimmer.value = c.wakeShimmer * g.noiseStrength;
    u.uScale.value = c.wakeScale * g.noiseFrequency;
    u.uDeep.value.copy(getColor(c.deepColor));
    u.uDeepWeight.value = c.wakeDeep;
    u.uFill.value = c.wakeFill;
    u.uVeins.value = c.wakeVeins * g.noiseStrength;
    u.uColor.value.copy(getColor(c.trailColor));
    u.uEdge.value.copy(getColor(c.edgeColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The mirror shards                                                    */
/* -------------------------------------------------------------------- */

const SHARD_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vSeed;
  void main() {
    mat4 local = mat4(1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix;
    #endif
    vec4 world = modelMatrix * local * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * mat3(local) * normal);
    vViewDir = cameraPosition - world.xyz;
    vSeed = fract(local[3].x * 3.7 + local[3].z * 1.3);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHARD_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFilm;
  uniform float uFresnel;
  uniform vec3  uColor;
  uniform vec3  uEdge;
  uniform vec3  uCore;
  uniform float uGlobalGlow;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vSeed;

  ${commonGLSL}
  ${FILM_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    vec3 Rf = reflect(-V, N);
    // A fake world in the mirror: bright sky above the horizon, dark floor below.
    float sky = smoothstep(-0.1, 0.5, Rf.y);
    float glint = pow(max(0.0, dot(Rf, normalize(vec3(0.4, 0.8, 0.3)))), 24.0);
    float rim = fresnelTerm(V, N, 3.0, uFresnel);
    vec3 col = mix(uColor * 0.35, uEdge, sky) + uCore * glint * 2.5;
    col = mix(col, thinFilm(rim + vSeed + uClock * 0.1) * uEdge, uFilm * rim);
    float a = (0.35 + 0.4 * sky + rim + glint) * uFade * uOpacity;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** Instanced mirror shards. */
export function createShardMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.6 },
      uOpacity: { value: 0.7 },
      uFilm: { value: 0.8 },
      uFresnel: { value: 1 },
      uColor: { value: new Color() },
      uEdge: { value: new Color() },
      uCore: { value: new Color() },
    }),
    vertexShader: SHARD_VERTEX,
    fragmentShader: SHARD_FRAGMENT,
  });
  material.userData.instanced = true;
  /** @param {object} s { clock, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uFade.value = s.fade;
    u.uGlow.value = c.shardGlow * g.glow;
    u.uOpacity.value = c.shardOpacity * g.opacity;
    u.uFilm.value = c.filmStrength;
    u.uFresnel.value = g.fresnel;
    u.uColor.value.copy(getColor(c.maskColor));
    u.uEdge.value.copy(getColor(c.edgeColor));
    u.uCore.value.copy(getColor(c.coreColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The glitter                                                          */
/* -------------------------------------------------------------------- */

const GLITTER_VERTEX = /* glsl */ `
  attribute vec4 aSeed;       // lane, along, phase, index
  uniform float uClock;
  uniform float uFront;
  uniform float uLaneGap;
  uniform float uHeight;
  uniform float uRise;
  uniform float uSpread;
  uniform float uSize;
  uniform float uFade;
  uniform float uCount;
  uniform vec2  uResolution;
  varying float vAlpha;
  varying float vTwinkle;

  void main() {
    if (aSeed.w >= uCount || uFront <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      vTwinkle = 0.0;
      return;
    }
    float life = fract(aSeed.z + uClock * 0.35);
    // Shed from the mask and left behind it: the same in every lane.
    float along = uFront - aSeed.y * min(uFront, 3.0) - life * 0.4;
    float x = aSeed.x * uLaneGap + (fract(aSeed.y * 13.7) - 0.5) * 0.9 * (1.0 + uSpread);
    float y = uHeight * (0.4 + 0.8 * fract(aSeed.z * 7.3)) + life * uRise;
    vec4 mv = modelViewMatrix * vec4(x, y, max(0.0, along), 1.0);
    gl_Position = projectionMatrix * mv;
    float env = sin(3.14159265 * life);
    vAlpha = env * uFade;
    vTwinkle = 0.5 + 0.5 * sin(uClock * 23.0 + aSeed.y * 91.0);
    gl_PointSize = uSize * env * uResolution.y * projectionMatrix[1][1] * 0.5 / max(0.1, -mv.z);
  }
`;

const GLITTER_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uGlobalGlow;
  varying float vAlpha;
  varying float vTwinkle;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    // A four-point star: two thin crossed bars over a soft core.
    float star = max(exp(-abs(c.x) * 14.0) * exp(-abs(c.y) * 3.0), exp(-abs(c.y) * 14.0) * exp(-abs(c.x) * 3.0));
    float core = exp(-dot(c, c) * 5.0);
    float a = (star * vTwinkle + core) * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(mix(uColor, uHot, core) * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** GPU glitter dealt evenly across the three lanes. */
export function createGlitterMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uFront: { value: 0 },
      uLaneGap: { value: 1.8 },
      uHeight: { value: 1.15 },
      uRise: { value: 1.2 },
      uSpread: { value: 0 },
      uSize: { value: 0.05 },
      uFade: { value: 1 },
      uCount: { value: 1 },
      uGlow: { value: 2 },
      uColor: { value: new Color() },
      uHot: { value: new Color() },
    }),
    vertexShader: GLITTER_VERTEX,
    fragmentShader: GLITTER_FRAGMENT,
  });
  /** @param {object} s { clock, front, spread, fade, capacity } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uFront.value = s.front;
    u.uLaneGap.value = c.laneGap;
    u.uHeight.value = c.maskHeight;
    u.uRise.value = c.glitterRise;
    u.uSpread.value = s.spread;
    u.uSize.value = c.glitterSize * g.particleSize;
    u.uFade.value = s.fade * g.opacity;
    u.uCount.value = Math.min(1, (c.glitterCount * g.particleCount) / s.capacity);
    u.uGlow.value = c.glitterGlow * g.glow;
    u.uColor.value.copy(getColor(c.maskColor));
    u.uHot.value.copy(getColor(c.glitterColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The shimmer                                                          */
/* -------------------------------------------------------------------- */

const SHIMMER_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHIMMER_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uLaneGap;
  uniform float uSpan;
  uniform float uShaderIntensity;
  uniform float uClock;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec3 np = vec3(vWorld.xz * 1.4 * uScale, vWorld.y * 1.1 * uScale - uClock * uSpeed);
    vec2 dir = vec2(snoise(np), snoise(np + vec3(11.3, 5.1, 2.7)));
    // Strongest in each lane, feathered between, at the top and the floor.
    float x = (vUv.x - 0.5) * uSpan;
    float lanes = 0.0;
    for (int i = -1; i <= 1; i++) lanes = max(lanes, exp(-pow((x - float(i) * uLaneGap) / 0.7, 2.0)));
    float mask = lanes * smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` sheet across the three lanes. Opaque on purpose: the
 * offset buffer wants the proxy's value, and an opaque proxy keeps the
 * expansion's "transparent ⇒ VFX layer" routing from pulling it out of the
 * warp pass.
 */
export function createShimmerMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uStrength: { value: 0 },
      uScale: { value: 1 },
      uSpeed: { value: 1 },
      uLaneGap: { value: 1.8 },
      uSpan: { value: 6 },
    }),
    vertexShader: SHIMMER_VERTEX,
    fragmentShader: SHIMMER_FRAGMENT,
  });
  /** @param {object} s { clock, strength, span } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uStrength.value = s.strength * c.shimmerStrength * g.distortion;
    u.uScale.value = c.shimmerScale * g.noiseFrequency;
    u.uSpeed.value = g.noiseSpeed;
    u.uLaneGap.value = c.laneGap;
    u.uSpan.value = s.span;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The pools (linger)                                                   */
/* -------------------------------------------------------------------- */

const POOL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uDissolve;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uSwirl;
  uniform float uVeins;
  uniform float uRipple;
  uniform float uSeed;
  uniform vec3  uCore;
  uniform vec3  uEdge;
  uniform vec3  uColor;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}
  ${FILM_GLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    // The lacquer the mask melted into: a deep pool whose saturated veins
    // swirl round the fallen mask (stronger toward the centre) while slow
    // ripple fronts roll out to a pale, noise-broken lip.
    float ang = atan(p.y, p.x) + uClock * uSwirl * (0.6 / (0.25 + r)) + uSeed;
    vec2 q = vec2(cos(ang), sin(ang)) * r;
    float n = fbm3(vec3(q * 2.6, uClock * 0.25 + uSeed));
    float veins = smoothstep(0.08, 0.0, abs(n)) * uVeins * uShaderIntensity;
    float lip = snoise01(vec3(p * 3.0, uSeed + uClock * 0.4));
    float edgeR = 0.82 + 0.14 * lip;
    float body = 1.0 - smoothstep(edgeR - 0.25, edgeR, r);
    float rim = exp(-pow((r - edgeR + 0.06) * 14.0, 2.0));
    float ripple = pow(max(0.0, sin(r * 14.0 - uClock * 3.0)), 10.0) * body * (1.0 - r) * uRipple;
    // Exit: the pool dries from the lip inward through a noise threshold.
    vec2 dm = dissolveMask(fract(lip * 0.7 + (1.0 - r) * 0.5), uDissolve, 0.06);
    if (dm.x < 0.5 && dm.y < 0.01) discard;
    vec3 col = uDeep;
    col = mix(col, uColor * uGlow, clamp(veins * 0.85 + ripple, 0.0, 1.0));
    col = mix(col, uEdge * uGlow, clamp(rim * 0.8, 0.0, 1.0));
    col = mix(col, thinFilm(r * 1.5 + uClock * 0.1) * uEdge * uGlow, rim * 0.3);
    col += uCore * dm.y * 1.5;
    float a = (body * 0.82 + rim * 0.6 + veins * 0.2) * uFade * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** One pool under each fallen mask — identical in every lane. Normal blend. */
export function createPoolMaterial(seed = 0) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uFade: { value: 0 },
      uDissolve: { value: 0 },
      uGlow: { value: 1 },
      uOpacity: { value: 1 },
      uSwirl: { value: 1 },
      uVeins: { value: 1 },
      uRipple: { value: 0.6 },
      uSeed: { value: seed },
      uCore: { value: new Color() },
      uEdge: { value: new Color() },
      uColor: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT,
  });
  /** @param {object} s { clock, fade, dissolve, calm } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uFade.value = s.fade;
    u.uDissolve.value = s.dissolve;
    u.uGlow.value = c.poolGlow * g.glow;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uSwirl.value = s.calm ? 0 : c.poolSwirl;
    u.uVeins.value = c.poolVeins * g.noiseStrength;
    u.uRipple.value = s.calm ? 0 : c.poolRipple;
    u.uCore.value.copy(getColor(c.coreColor));
    u.uEdge.value.copy(getColor(c.edgeColor));
    u.uColor.value.copy(getColor(c.maskColor));
    u.uDeep.value.copy(getColor(c.deepColor));
  };
  return material;
}
