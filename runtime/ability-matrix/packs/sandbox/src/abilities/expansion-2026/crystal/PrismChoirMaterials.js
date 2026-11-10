import { AdditiveBlending, Color, DoubleSide, MeshStandardMaterial, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';

/**
 * Prism Choir — the bespoke shaders.
 *
 * The whole cast is about *dispersion*: white light going in, a spectrum
 * coming out. One cosine palette (`spectrum`) is shared by every layer so the
 * lance, its shards, their trails, the splinters and the light thrown on the
 * floor all agree on what "red" and "violet" are.
 *
 *  - **crystal** (`createPrismMaterial`) — flat facets with a refracted
 *    interior (ridged noise sampled along the refracted view ray, so the inside
 *    parallaxes against the surface), a fresnel rim split into a spectrum by
 *    angle and facet, glowing facet edges from barycentrics, a formation
 *    dissolve on the way in and a spectral burn-out on the way out.
 *  - **beam trails** (`createBeamMaterial`) — crossed ribbons: a hot core,
 *    a spectral fringe either side of it, bright at the head and streaming.
 *  - **splinters** (`createSplinterMaterial`) — 120 points thrown out of the
 *    split, each a twinkling four-point star tinted by its seed.
 *  - **lightfall** (`createLightfallMaterial`) — the caustics the crystal
 *    throws on the floor: a voronoi pool under the lance and the comet of
 *    light behind it, then three spectral rays fanned out from the split.
 *  - **the lens** (`createLensMaterial`, `LAYER.DISTORTION`) — the crystal
 *    bending the scene behind it, and the ring of bent air at the split.
 *
 * Every material reads `settings['prism-choir']` in `userData.sync(state)`.
 */

const ID = 'prism-choir';

/** The shared spectrum: a cosine palette, 0..1 → red … violet … red. */
const SPECTRUM_GLSL = /* glsl */ `
  vec3 spectrum(float x) {
    return clamp(0.5 + 0.5 * cos(6.2831853 * (x + vec3(0.0, 0.33, 0.67))), 0.0, 1.0);
  }
`;

/* -------------------------------------------------------------------- */
/* Crystal                                                              */
/* -------------------------------------------------------------------- */

const PRISM_VERTEX = /* glsl */ `
  attribute vec3 aBary;
  attribute float aFacet;

  varying vec3  vN;
  varying vec3  vP;
  varying vec3  vViewDir;
  varying vec3  vBary;
  varying float vFacet;

  void main() {
    vP = position;
    vBary = aBary;
    vFacet = aFacet;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PRISM_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;        // 1 whole … 0 burnt out
  uniform float uForm;        // 0 unformed … 1 condensed
  uniform float uHue;         // spectral offset, radians (each shard its own)
  uniform float uSpread;      // how far the spectrum is pulled apart
  uniform float uGlow;
  uniform float uFresnelPow;
  uniform float uDispersion;
  uniform float uEdgeGlow;
  uniform float uInnerGlow;
  uniform float uOpacity;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorRim;
  uniform vec3  uLightDir;
  uniform float uShaderIntensity;
  uniform float uGlobalGlow;

  varying vec3  vN;
  varying vec3  vP;
  varying vec3  vViewDir;
  varying vec3  vBary;
  varying float vFacet;

  ${noiseGLSL}
  ${commonGLSL}
  ${SPECTRUM_GLSL}

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(vViewDir);
    if (!gl_FrontFacing) N = -N;

    // Formation in, burn-out away: one noise field, two thresholds.
    float n = snoise01(vP * 3.2 + vFacet * 4.0);
    float formCut = 1.0 - uForm;
    float fadeCut = 1.0 - uFade;
    float cut = max(formCut * (0.4 + 0.6 * (vP.y * 0.4 + 0.5)), fadeCut);
    vec2 dm = dissolveMask(n, cut, 0.12);
    if (dm.x < 0.5) discard;

    // The interior: ridged filaments sampled along the refracted ray, so the
    // inside of the crystal slides against its surface as it turns.
    vec3 r = refract(-V, N, 0.66);
    float inner = ridged(vP * 2.2 + r * 0.9 + vec3(0.0, uTime * 0.35, 0.0), 4);
    inner = smoothstep(0.55, 0.95, inner);

    float fres = fresnelTerm(V, N, uFresnelPow, 1.0);
    float hue = uHue / 6.2831853 + vFacet * 0.35 * uSpread + fres * uDispersion * uSpread + uTime * 0.04;
    vec3 spec = spectrum(hue);

    // Facet edges from barycentrics: thin, bright, spectral.
    float edgeD = min(vBary.x, min(vBary.y, vBary.z));
    float edge = 1.0 - smoothstep(0.0, 0.045, edgeD);

    // A glint where a facet catches the key light.
    float glint = pow(max(dot(reflect(-V, N), normalize(uLightDir)), 0.0), 28.0);

    vec3 body = mix(uColorDeep, uColorBody, 0.35 + 0.65 * vFacet);
    vec3 col = body * (0.35 + 0.65 * inner * uInnerGlow);
    col += mix(uColorRim, spec, 0.65) * fres * 1.6;
    col += spec * edge * uEdgeGlow;
    col += uColorRim * glint * 2.0;
    col += spec * dm.y * 3.0; // the burning dissolve edge
    col *= uGlow * uShaderIntensity * uGlobalGlow;

    float alpha = clamp((0.28 + fres * 0.55 + edge * 0.4 + inner * 0.2 + dm.y) * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

/** A crystal. Each shard gets its own instance so its spectrum can differ. */
export function createPrismMaterial(hue = 0) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uForm: { value: 1 },
      uHue: { value: hue },
      uSpread: { value: 1 },
      uGlow: { value: 1.4 },
      uFresnelPow: { value: 2.2 },
      uDispersion: { value: 1 },
      uEdgeGlow: { value: 2 },
      uInnerGlow: { value: 1 },
      uOpacity: { value: 0.85 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: PRISM_VERTEX,
    fragmentShader: PRISM_FRAGMENT
  });
  // The cast's own clock, so the interior crawls at the cast's pace.
  material.uniforms.uTime = { value: 0 };

  /** @param {object} state { time, fade, form, hue } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time * g.noiseSpeed;
    u.uFade.value = state.fade;
    u.uForm.value = state.form;
    u.uHue.value = state.hue;
    u.uSpread.value = c.spectralSpread;
    u.uGlow.value = c.crystalGlow * g.glow;
    u.uFresnelPow.value = Math.max(0.2, c.fresnelPower / Math.max(0.1, g.fresnel));
    u.uDispersion.value = c.dispersion;
    u.uEdgeGlow.value = c.edgeGlow;
    u.uInnerGlow.value = c.innerGlow * g.shaderIntensity;
    u.uOpacity.value = c.crystalOpacity * g.opacity;
    u.uColorDeep.value.copy(getColor(c.colorCrystalDeep));
    u.uColorBody.value.copy(getColor(c.colorCrystalBody));
    u.uColorRim.value.copy(getColor(c.colorCrystalRim));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Beam trails                                                          */
/* -------------------------------------------------------------------- */

const BEAM_VERTEX = /* glsl */ `
  uniform float uWidth;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    // Width is a uniform, not a scale, so length scaling never fattens it.
    vec3 p = vec3(position.xy * uWidth, position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uHue;
  uniform float uSpread;
  uniform float uGlow;
  uniform float uLength;      // metres the ribbon currently spans
  uniform float uTail;        // metres of tail behind the head
  uniform vec3  uColorCore;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}
  ${SPECTRUM_GLSL}

  void main() {
    float across = (vUv.y - 0.5) * 2.0;     // -1..1
    float metres = vUv.x * uLength;
    float behind = uLength - metres;          // metres behind the head
    // A comet: full at the head, gone uTail metres back.
    float tail = 1.0 - smoothstep(0.0, max(uTail, 0.05), behind);
    float head = smoothstep(0.0, 0.15, behind) ; // softened right at the tip
    float core = exp(-across * across * 18.0);
    // Either side of the core the light is split into its colours.
    vec3 fringe = spectrum(uHue / 6.2831853 + across * 0.25 * uSpread);
    float stream = 0.65 + 0.35 * snoise(vec3(metres * 2.2 - uTime * 9.0, across * 2.0, uHue));
    float body = (1.0 - abs(across)) * stream;
    vec3 col = uColorCore * core * 1.6 + fringe * body;
    float a = clamp((core + body * 0.6) * tail * head * uFade, 0.0, 1.0);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * a * uGlow * uGlobalGlow, a);
  }
`;

export function createBeamMaterial(hue = 0) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uHue: { value: hue },
      uSpread: { value: 1 },
      uGlow: { value: 1.6 },
      uWidth: { value: 0.2 },
      uLength: { value: 1 },
      uTail: { value: 4 },
      uColorCore: { value: new Color() }
    }),
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT
  });
  material.uniforms.uTime = { value: 0 };

  /** @param {object} state { time, fade, hue, length, tail, width, glow } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time * g.noiseSpeed;
    u.uFade.value = state.fade * g.opacity;
    u.uHue.value = state.hue;
    u.uSpread.value = c.spectralSpread;
    u.uGlow.value = state.glow * g.glow;
    u.uWidth.value = Math.max(0.005, state.width);
    u.uLength.value = Math.max(0.001, state.length);
    u.uTail.value = state.tail;
    u.uColorCore.value.copy(getColor(c.colorCrystalRim));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Splinters                                                            */
/* -------------------------------------------------------------------- */

const SPLINTER_VERTEX = /* glsl */ `
  attribute float seed;
  uniform float uTime;
  uniform float uBurst;       // 0..1 through the split
  uniform float uReach;
  uniform float uSize;
  uniform vec2  uResolution;

  varying float vA;
  varying float vSeed;

  void main() {
    // Outward fast, slowing, sagging a little under their own weight.
    float travel = (1.0 - (1.0 - uBurst) * (1.0 - uBurst)) * (1.0 + seed * 3.0) * uReach;
    vec3 q = position * travel;
    q.y -= uBurst * uBurst * 0.65;
    vA = (1.0 - uBurst) * (0.5 + 0.5 * sin(uTime * 8.0 + seed * 40.0));
    vSeed = seed;
    vec4 mv = modelViewMatrix * vec4(q, 1.0);
    float worldSize = uSize * (0.04 + seed * 0.05);
    gl_PointSize = clamp(projectionMatrix[1][1] * 0.5 * uResolution.y * worldSize / max(0.5, -mv.z), 1.0, 32.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SPLINTER_FRAGMENT = /* glsl */ `
  uniform float uFade;
  uniform float uHue;
  uniform float uSpread;
  uniform float uGlow;
  uniform float uGlobalGlow;

  varying float vA;
  varying float vSeed;

  ${SPECTRUM_GLSL}

  void main() {
    vec2 p = abs(gl_PointCoord - 0.5) * 2.0;
    // A diamond body with a four-point glint through it.
    float diamond = 1.0 - smoothstep(0.55, 1.0, p.x + p.y);
    float star = max(1.0 - smoothstep(0.0, 0.12, p.x) , 1.0 - smoothstep(0.0, 0.12, p.y)) * (1.0 - smoothstep(0.4, 1.0, max(p.x, p.y)));
    vec3 c = spectrum(uHue / 6.2831853 + vSeed * uSpread);
    float a = clamp((diamond * 0.8 + star * 0.6) * vA * uFade, 0.0, 1.0);
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(c, vec3(1.0), star * 0.5) * uGlow * uGlobalGlow * a, a);
  }
`;

export function createSplinterMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uBurst: { value: 0 },
      uFade: { value: 1 },
      uReach: { value: 1 },
      uSize: { value: 1 },
      uHue: { value: 0 },
      uSpread: { value: 1 },
      uGlow: { value: 1.5 }
    }),
    vertexShader: SPLINTER_VERTEX,
    fragmentShader: SPLINTER_FRAGMENT
  });
  material.uniforms.uTime = { value: 0 };

  /** @param {object} state { time, burst, fade } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uBurst.value = state.burst;
    u.uFade.value = state.fade * g.opacity;
    u.uReach.value = c.splinterReach;
    u.uSize.value = c.splinterSize * g.particleSize;
    u.uSpread.value = c.spectralSpread;
    u.uGlow.value = c.splinterGlow * g.glow;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Lightfall — the caustics on the floor                                */
/* -------------------------------------------------------------------- */

const LIGHTFALL_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const LIGHTFALL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform vec3  uLance;       // floor point under the lance
  uniform float uLancePower;  // 0..1 pool under the lance
  uniform float uPoolRadius;
  uniform float uTail;        // metres of comet behind the lance
  uniform vec3  uSplit;       // floor point of the split
  uniform vec3  uArm0;
  uniform vec3  uArm1;
  uniform vec3  uArm2;
  uniform float uArmLength;   // metres each shard has travelled
  uniform float uFanPower;    // 0..1 the spectral fan
  uniform float uFanWidth;
  uniform float uHue0;
  uniform float uHue1;
  uniform float uHue2;
  uniform float uScale;
  uniform float uGlow;
  uniform float uSpread;
  uniform vec3  uColorPool;
  uniform float uGlobalGlow;

  varying vec3 vWorld;
  varying vec2 vUv;

  ${noiseGLSL}
  ${SPECTRUM_GLSL}

  // Caustic web: thin bright lines where two voronoi cells meet, animated.
  float caustic(vec2 p) {
    vec2 a = voronoi2(p + vec2(uTime * 0.6, -uTime * 0.4));
    vec2 b = voronoi2(p * 1.37 + vec2(-uTime * 0.5, uTime * 0.7) + 11.3);
    return pow(1.0 - a.x, 6.0) * 0.7 + pow(1.0 - b.x, 8.0) * 0.6;
  }

  // Distance from a point to a ray segment start → start + dir * len.
  vec2 rayFrame(vec2 p, vec2 start, vec2 dir, float len) {
    vec2 rel = p - start;
    float along = clamp(dot(rel, dir), 0.0, len);
    return vec2(along, length(rel - dir * along));
  }

  vec3 arm(vec2 p, vec3 dir, float hue) {
    vec2 f = rayFrame(p, uSplit.xz, normalize(dir.xz), uArmLength);
    float w = max(uFanWidth, 0.02) * (0.4 + 0.6 * f.x / max(uArmLength, 0.01));
    float beam = exp(-(f.y * f.y) / (w * w)) * smoothstep(0.0, 0.3, f.x);
    float sparkle = 0.6 + 0.8 * caustic(p * uScale * 1.4);
    return spectrum(hue / 6.2831853 + f.y * 0.4 * uSpread) * beam * sparkle;
  }

  void main() {
    vec2 p = vWorld.xz;
    vec3 col = vec3(0.0);

    // The pool under the lance, and the comet of light it drags behind it.
    vec2 lf = rayFrame(p, uOrigin.xz, uDir.xz, dot(uLance.xz - uOrigin.xz, uDir.xz));
    float lanceAlong = dot(uLance.xz - uOrigin.xz, uDir.xz);
    float behind = lanceAlong - lf.x;
    float comet = exp(-(lf.y * lf.y) / (uPoolRadius * uPoolRadius * 0.12)) * (1.0 - smoothstep(0.0, max(uTail, 0.1), behind));
    float pool = 1.0 - smoothstep(0.0, uPoolRadius, distance(p, uLance.xz));
    float web = caustic(p * uScale);
    col += uColorPool * (pool * (0.25 + web) + comet * (0.15 + web * 0.5)) * uLancePower;

    // The three rays of the split, each its own colour.
    vec3 fan = arm(p, uArm0, uHue0) + arm(p, uArm1, uHue1) + arm(p, uArm2, uHue2);
    col += fan * uFanPower;

    // Feather the quad's border.
    float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(0.0, 0.06, vUv.y) * smoothstep(0.0, 0.06, 1.0 - vUv.x) * smoothstep(0.0, 0.06, 1.0 - vUv.y);
    col *= edge * uGlow * uGlobalGlow;
    float lum = max(col.r, max(col.g, col.b));
    if (lum < 0.003) discard;
    gl_FragColor = vec4(col, clamp(lum, 0.0, 1.0));
  }
`;

export function createLightfallMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: sharedUniforms({
      uOrigin: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uLance: { value: new Vector3() },
      uLancePower: { value: 0 },
      uPoolRadius: { value: 1.4 },
      uTail: { value: 4 },
      uSplit: { value: new Vector3() },
      uArm0: { value: new Vector3(0, 0, 1) },
      uArm1: { value: new Vector3(0, 0, 1) },
      uArm2: { value: new Vector3(0, 0, 1) },
      uArmLength: { value: 0 },
      uFanPower: { value: 0 },
      uFanWidth: { value: 0.5 },
      uHue0: { value: 0 },
      uHue1: { value: 2.1 },
      uHue2: { value: 4.2 },
      uScale: { value: 1.6 },
      uGlow: { value: 1.2 },
      uSpread: { value: 1 },
      uColorPool: { value: new Color() }
    }),
    vertexShader: LIGHTFALL_VERTEX,
    fragmentShader: LIGHTFALL_FRAGMENT
  });
  material.uniforms.uTime = { value: 0 };

  /**
   * @param {object} state { time, origin, dir, lance, lancePower, split,
   *   arms: [Vector3 × 3], hues: [n × 3], armLength, fanPower }
   */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time * g.noiseSpeed;
    u.uOrigin.value.copy(state.origin);
    u.uDir.value.copy(state.dir);
    u.uLance.value.copy(state.lance);
    u.uLancePower.value = state.lancePower;
    u.uPoolRadius.value = Math.max(0.1, c.causticRadius);
    u.uTail.value = c.lanceTrailLength;
    u.uSplit.value.copy(state.split);
    u.uArm0.value.copy(state.arms[0]);
    u.uArm1.value.copy(state.arms[1]);
    u.uArm2.value.copy(state.arms[2]);
    u.uArmLength.value = state.armLength;
    u.uFanPower.value = state.fanPower * c.fanGlow;
    u.uFanWidth.value = c.fanWidth;
    u.uHue0.value = state.hues[0];
    u.uHue1.value = state.hues[1];
    u.uHue2.value = state.hues[2];
    u.uScale.value = c.causticScale * g.noiseFrequency;
    u.uGlow.value = c.causticGlow * g.glow * g.opacity;
    u.uSpread.value = c.spectralSpread;
    u.uColorPool.value.copy(getColor(c.colorCrystalRim));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens — LAYER.DISTORTION                                          */
/* -------------------------------------------------------------------- */

const LENS_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // A view-space billboard: always facing the camera, sized in metres.
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;    // the crystal's own lens
  uniform float uRing;        // 0..1 radius of the split's pressure ring
  uniform float uRingStrength;
  uniform float uShaderIntensity;

  varying vec2 vUv;

  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float r = length(c);
    if (r > 1.0) discard;
    vec2 dir = r > 1e-4 ? c / r : vec2(0.0);
    // A convex lens: pushes outward, strongest at mid radius, zero at the edge.
    float lens = sin(3.14159265 * r) * uStrength;
    // The ring of bent air leaving the split.
    float ring = exp(-pow((r - uRing) * 9.0, 2.0)) * uRingStrength * step(0.001, uRing) * (1.0 - uRing);
    float strength = (lens + ring) * uShaderIntensity;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    if (strength * mask < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 1.4 },
      uStrength: { value: 0.5 },
      uRing: { value: 0 },
      uRingStrength: { value: 0.8 }
    }),
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} state { size, strength, ring } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = Math.max(0.05, state.size);
    u.uStrength.value = state.strength * c.lensStrength * g.distortion;
    u.uRing.value = state.ring;
    u.uRingStrength.value = c.splitRingStrength * g.distortion;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The choir — crystal pipes where the shards land                       */
/* -------------------------------------------------------------------- */

/** The JS twin of `spectrum` (0..1 → red … violet … red), into `out`. */
export function spectrumColor(x, out) {
  const t = Math.PI * 2;
  return out.setRGB(
    Math.min(1, Math.max(0, 0.5 + 0.5 * Math.cos(t * x))),
    Math.min(1, Math.max(0, 0.5 + 0.5 * Math.cos(t * (x + 0.33)))),
    Math.min(1, Math.max(0, 0.5 + 0.5 * Math.cos(t * (x + 0.67))))
  );
}

const _spec = new Color();
const _deep = new Color();

/**
 * The solid of a choir cluster: quartz lit by the scene sun, flat-shaded so
 * every facet takes its own light, on `LAYER.WORLD` (the ability flags it to
 * cast shadows). Its albedo is the dark end of its shard's hue mixed into the
 * crystal deep tone, its emissive the hue itself — the song drives it.
 */
export function createChoirSolidMaterial() {
  const material = new MeshStandardMaterial({
    color: 0x262a8c,
    emissive: 0x8f7cff,
    emissiveIntensity: 0.4,
    metalness: 0.25,
    roughness: 0.12,
    flatShading: true
  });
  /** @param {object} state { hue (radians), sing (0..~1.5), fade } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    spectrumColor(state.hue / (Math.PI * 2), _spec);
    _deep.copy(getColor(c.colorCrystalDeep));
    material.color.copy(_deep).lerp(_spec, c.spireTint).multiplyScalar(c.spireDeep * 3);
    material.emissive.copy(_spec);
    material.emissiveIntensity = (c.spireGlow * (0.35 + state.sing)) * g.glow * state.fade;
    material.roughness = c.spireRoughness;
    material.metalness = c.spireMetalness;
  };
  return material;
}

const CHOIR_VERTEX = /* glsl */ `
  attribute vec3 aBary;
  attribute float aFacet;
  attribute float aRise;
  attribute float aPipe;
  uniform float uInflate;
  varying vec3 vN;
  varying vec3 vViewDir;
  varying vec3 vBary;
  varying float vFacet;
  varying float vRise;
  varying float vPipe;
  void main() {
    vBary = aBary;
    vFacet = aFacet;
    vRise = aRise;
    vPipe = aPipe;
    vec3 p = position + normal * uInflate;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * The song of a choir cluster, an additive shell over the solid. Each pipe
 * sings in turn — a ring of light climbs it from the floor to the tip, one
 * pipe after the next across the cluster, and its tip flares as the ring
 * leaves it — over a spectral fresnel rim and glowing facet edges. The
 * cluster burns out from the tips down through noise as it sinks.
 */
const CHOIR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uHue;
  uniform float uSpread;
  uniform float uGlow;
  uniform float uSing;        // 0..~1.5 how loud the choir is
  uniform float uSingRate;    // rings per second up each pipe
  uniform float uBands;
  uniform float uEdgeGlow;
  uniform float uFresnelPow;
  uniform float uFade;
  uniform vec3 uColorRim;
  varying vec3 vN;
  varying vec3 vViewDir;
  varying vec3 vBary;
  varying float vFacet;
  varying float vRise;
  varying float vPipe;

  ${noiseGLSL}
  ${commonGLSL}
  ${SPECTRUM_GLSL}

  void main() {
    vec3 V = normalize(vViewDir);
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    float n = snoise01(vec3(vPipe * 7.0, vRise * 3.0, vFacet * 5.0));
    // Burns out from the tips down.
    float cut = 1.0 - uFade;
    vec2 dm = dissolveMask(n * 0.5 + vRise * 0.5, cut, 0.1);
    if (dm.x < 0.5) discard;

    float fres = fresnelTerm(V, N, uFresnelPow, 1.0);
    float edge = 1.0 - smoothstep(0.0, 0.05, min(vBary.x, min(vBary.y, vBary.z)));
    // One ring per pipe, staggered across the cluster.
    float phase = fract(uTime * uSingRate - vPipe * 0.85);
    float ring = exp(-pow((vRise - phase * 1.15) * 7.0 * uBands, 2.0));
    float tip = smoothstep(0.82, 1.0, vRise) * smoothstep(0.75, 1.0, phase);
    vec3 spec = spectrum(uHue / 6.2831853 + vRise * 0.18 * uSpread + fres * 0.2 * uSpread);
    vec3 col = spec * (ring * 1.6 + tip * 2.0) * uSing;
    col += mix(uColorRim, spec, 0.6) * fres * 1.1;
    col += spec * edge * uEdgeGlow * (0.4 + 0.6 * uSing);
    col += spec * dm.y * 3.0;
    col *= uGlow;
    float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

export function createChoirGlowMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uInflate: { value: 0.012 },
      uHue: { value: 0 },
      uSpread: { value: 1 },
      uGlow: { value: 1 },
      uSing: { value: 1 },
      uSingRate: { value: 2.2 },
      uBands: { value: 1 },
      uEdgeGlow: { value: 1 },
      uFresnelPow: { value: 2.2 },
      uFade: { value: 1 },
      uColorRim: { value: new Color() }
    }),
    vertexShader: CHOIR_VERTEX,
    fragmentShader: CHOIR_FRAGMENT
  });
  material.uniforms.uTime = { value: 0 };
  /** @param {object} state { time, hue, sing, fade } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time * g.animationSpeed;
    u.uHue.value = state.hue;
    u.uSpread.value = c.spectralSpread;
    u.uGlow.value = c.crystalGlow * g.glow * g.shaderIntensity;
    u.uSing.value = state.sing;
    u.uSingRate.value = c.spireSingRate;
    u.uBands.value = c.spireBands;
    u.uEdgeGlow.value = c.edgeGlow * 0.6;
    u.uFresnelPow.value = Math.max(0.2, c.fresnelPower / Math.max(0.1, g.fresnel));
    u.uFade.value = state.fade * g.opacity;
    u.uColorRim.value.copy(getColor(c.colorCrystalRim));
  };
  return material;
}

/**
 * The floor the choir grows from: a rime of faceted crystal spreading under
 * each cluster, normal-blended so its deep tone darkens the ground. Voronoi
 * flagstones of crystal, dark hue-tinted deep in the cells, the hue on the
 * seams and a pale tint where the light pools at the cluster's foot; spectral
 * cracks radiate from each cluster and pulse with the song. It grows with the
 * clusters, stays for the hang and burns out through noise at the exit.
 * Drawn on the lightfall's quad (world-space XZ), so it covers the whole fan.
 */
const RIME_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCentre0;
  uniform vec3 uCentre1;
  uniform vec3 uCentre2;
  uniform vec3 uFace0;
  uniform vec3 uFace1;
  uniform vec3 uFace2;
  uniform float uHue0;
  uniform float uHue1;
  uniform float uHue2;
  uniform float uGrow;
  uniform float uDissolve;
  uniform float uSing;
  uniform float uRadius;
  uniform float uFacets;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uSpread;
  uniform vec3 uColorDeep;
  uniform vec3 uColorRim;
  varying vec3 vWorld;
  varying vec2 vUv;

  ${noiseGLSL}
  ${SPECTRUM_GLSL}

  vec4 rimePatch(vec2 p, vec3 centre, vec3 face, float hue) {
    vec2 d = p - centre.xz;
    float r = length(d);
    float n = snoise01(vec3(p * 0.9, hue));
    float R = uRadius * uGrow * (0.8 + 0.4 * n);
    float cover = 1.0 - smoothstep(R * 0.7, R, r);
    if (cover <= 0.0) return vec4(0.0);
    vec2 v = voronoi2(p * uFacets + hue * 3.0);
    float seam = 1.0 - smoothstep(0.02, 0.1, v.x);
    vec3 spec = spectrum(hue / 6.2831853 + v.y * 0.15 * uSpread);
    // Spectral cracks radiating from the cluster, pulsing outward with the song.
    float ang = atan(d.y, d.x);
    float spoke = pow(abs(sin(ang * 4.5 + hue * 2.0 + n * 2.0)), 18.0) * (1.0 - smoothstep(R * 0.3, R, r));
    float pulse = 0.5 + 0.5 * sin(r * 4.0 - uTime * 6.0 + hue);
    float pool = exp(-r * r / max(uRadius * uRadius * 0.12, 0.05));
    vec3 col = mix(uColorDeep * 0.35, spec * 0.25, 0.3 * v.y);
    col += spec * seam * 0.9;
    col += spec * spoke * pulse * uSing * 1.6;
    col += mix(spec, uColorRim, 0.5) * pool * (0.6 + uSing);
    float a = cover * (0.7 + 0.3 * seam);
    return vec4(col, a);
  }

  void main() {
    vec2 p = vWorld.xz;
    vec4 a = rimePatch(p, uCentre0, uFace0, uHue0);
    vec4 b = rimePatch(p, uCentre1, uFace1, uHue1);
    vec4 c = rimePatch(p, uCentre2, uFace2, uHue2);
    float alpha = max(a.a, max(b.a, c.a));
    if (alpha <= 0.001) discard;
    vec3 col = (a.rgb * a.a + b.rgb * b.a + c.rgb * c.a) / max(a.a + b.a + c.a, 1e-3);
    float n = snoise01(vec3(p * 1.7, 9.0));
    float alive = 1.0 - smoothstep(uDissolve - 0.05, uDissolve + 0.02, n);
    float burn = (1.0 - smoothstep(0.0, 0.05, abs(n - uDissolve))) * step(0.001, uDissolve);
    col += uColorRim * burn * 2.0;
    alpha *= mix(alive, 1.0, 0.0) * uOpacity;
    alpha *= 1.0 - step(0.999, uDissolve);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlow, clamp(alpha, 0.0, 1.0));
  }
`;

export function createChoirRimeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    uniforms: sharedUniforms({
      uCentre0: { value: new Vector3() },
      uCentre1: { value: new Vector3() },
      uCentre2: { value: new Vector3() },
      uFace0: { value: new Vector3(0, 0, 1) },
      uFace1: { value: new Vector3(0, 0, 1) },
      uFace2: { value: new Vector3(0, 0, 1) },
      uHue0: { value: 0 },
      uHue1: { value: 2.1 },
      uHue2: { value: 4.2 },
      uGrow: { value: 0 },
      uDissolve: { value: 0 },
      uSing: { value: 0 },
      uRadius: { value: 1.9 },
      uFacets: { value: 2.2 },
      uGlow: { value: 1 },
      uOpacity: { value: 0.8 },
      uSpread: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: LIGHTFALL_VERTEX,
    fragmentShader: RIME_FRAGMENT
  });
  material.uniforms.uTime = { value: 0 };
  /** @param {object} state { time, centres [V3×3], arms [V3×3], hues [n×3], grow, dissolve, sing } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time * g.noiseSpeed;
    u.uCentre0.value.copy(state.centres[0]);
    u.uCentre1.value.copy(state.centres[1]);
    u.uCentre2.value.copy(state.centres[2]);
    u.uFace0.value.copy(state.arms[0]);
    u.uFace1.value.copy(state.arms[1]);
    u.uFace2.value.copy(state.arms[2]);
    u.uHue0.value = state.hues[0];
    u.uHue1.value = state.hues[1];
    u.uHue2.value = state.hues[2];
    u.uGrow.value = state.grow;
    u.uDissolve.value = state.dissolve;
    u.uSing.value = state.sing;
    u.uRadius.value = c.rimeRadius;
    u.uFacets.value = c.rimeFacets * g.noiseFrequency;
    u.uGlow.value = c.rimeGlow * g.glow;
    u.uOpacity.value = c.rimeOpacity * g.opacity;
    u.uSpread.value = c.spectralSpread;
    u.uColorDeep.value.copy(getColor(c.colorCrystalDeep));
    u.uColorRim.value.copy(getColor(c.colorCrystalRim));
  };
  return material;
}
