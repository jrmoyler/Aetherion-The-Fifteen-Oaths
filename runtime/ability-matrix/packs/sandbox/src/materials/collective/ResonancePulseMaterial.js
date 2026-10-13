import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * The Resonance Pulse's three shaders: the pressure shell, the warp it bends
 * the frame with, and the ripple the boom sends across the floor.
 *
 * ## The shell is placed in the vertex stage
 *
 * The mesh is a plain `PlaneGeometry` grid and only its `uv` is used: `u` goes
 * once round the ring, `v` runs from the shell's apex (0) to its rim (1). The
 * vertex stage wraps that grid onto a spherical cap whose rim has a lateral
 * radius of `uRadius` and whose half-angle is `uSpread`, with the rim at local
 * z = 0 and the dome bulging forward along +Z — which the ability points down
 * the cast. A pressure front *is* a cap of a sphere, and building it this way
 * means the dome's curvature and the ring's radius are both live uniforms
 * rather than baked geometry: dragging `spread` re-curves rings that are
 * already in flight.
 *
 * ## What the fragment draws
 *
 *  - a **rim**, a narrow gaussian at v = 1, sampled three times at offsets of
 *    ±`uChroma` and tinted red / green / blue, so the leading edge splits into
 *    its colours like a lens at the edge of its field — the classic read for a
 *    sound wave as opposed to a shockwave;
 *  - **interference bands** across the body: two travelling waves at a
 *    `uBeat` ratio multiplied together, which beat against each other the way
 *    two tones do, broken around the ring by `uLobes` standing-wave lobes;
 *  - a **fresnel** lift so the dome's silhouette reads even where it is thin;
 *  - **soft fade** against the depth prepass so the shell feathers where it
 *    cuts the floor instead of drawing a hard ellipse across it.
 */
const SHELL_VERTEX = /* glsl */ `
  uniform float uRadius;
  uniform float uSpread;

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  void main() {
    vUv = uv;
    float spread = max(uSpread, 0.05);
    float theta = uv.y * spread;             // v = 0 at the apex, 1 at the rim
    float phi = uv.x * 6.28318530718;
    vec3 n = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
    // Sphere radius chosen so the rim's lateral radius is exactly uRadius.
    float sphere = uRadius / sin(spread);
    vec3 local = vec3(n.xy, n.z - cos(spread)) * sphere;

    vec4 world = modelMatrix * vec4(local, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * n);
    vViewDir = cameraPosition - world.xyz;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHELL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uFade;
  uniform float uRimWidth;
  uniform float uRimBright;
  uniform float uChroma;
  uniform float uFresnelPower;
  uniform float uFresnelBright;
  uniform float uBody;
  uniform float uBands;
  uniform float uBeat;
  uniform float uBandSpeed;
  uniform float uBandSharp;
  uniform float uLobes;
  uniform float uLobeDepth;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uSoftFade;
  uniform vec3  uColorRim;
  uniform vec3  uColorBody;
  uniform vec3  uColorR;
  uniform vec3  uColorG;
  uniform vec3  uColorB;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  float rim(float v) {
    float d = (1.0 - v) / max(uRimWidth, 1e-3);
    return exp(-d * d);
  }

  void main() {
    float v = vUv.y;
    float phi = vUv.x * 6.28318530718;

    /* --- the chromatic rim --- */
    float rr = rim(v + uChroma);
    float rg = rim(v);
    float rb = rim(v - uChroma);
    float white = min(rr, min(rg, rb));
    vec3 rimColor = uColorR * rr + uColorG * rg + uColorB * rb;
    rimColor = rimColor * 0.6 + uColorRim * white * 1.4;

    /* --- two tones beating across the body --- */
    float phase = v * uBands * 6.28318530718 - uTime * uBandSpeed;
    float w1 = sin(phase);
    float w2 = sin(phase * uBeat + uSeed * 3.0);
    float beat = (w1 + w2) * 0.5;
    float band = pow(clamp(beat * beat, 0.0, 1.0), uBandSharp * 0.5);
    // Standing-wave lobes around the ring, turning slowly.
    float lobe = 1.0 - uLobeDepth * (0.5 + 0.5 * cos(phi * floor(uLobes + 0.5) + uTime * 1.3 + uSeed));
    // A breath of noise so neighbouring rings never band identically.
    float grain = 0.85 + 0.3 * snoise(vec3(phi * 1.5, v * 4.0, uTime * 0.8 + uSeed));
    float body = band * lobe * grain * smoothstep(0.0, 0.35, v) * uBody * uShaderIntensity;

    /* --- the silhouette --- */
    float fres = fresnelTerm(vViewDir, vNormalW, uFresnelPower, 1.0) * uFresnelBright;

    vec3 color = rimColor * uRimBright + uColorBody * (body + fres * 0.6);
    float alpha = clamp(max(max(rr, max(rg, rb)), body + fres * 0.5), 0.0, 1.0) * uFade * uOpacity;
    if (alpha < 0.003) discard;

    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.003) discard;

    color *= uIntensity * uGlobalGlow * uFade * uOpacity;
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * The warp: same placement as the shell, but the fragment writes a
 * screen-space refraction offset instead of a colour (LAYER.DISTORTION, the
 * `createAcidFumeMaterial` convention — `vec4(dir * 0.5 + 0.5, strength,
 * mask)`). The direction is *radial on screen* from the ring's own centre, so
 * the frame is pushed outward across the rim the way air under pressure bends
 * light, not shivered at random.
 */
const WARP_SHELL_VERTEX = /* glsl */ `
  uniform float uRadius;
  uniform float uSpread;

  varying vec2 vUv;
  varying vec2 vScreen;
  varying vec2 vCentre;

  void main() {
    vUv = uv;
    float spread = max(uSpread, 0.05);
    float theta = uv.y * spread;
    float phi = uv.x * 6.28318530718;
    vec3 n = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
    float sphere = uRadius / sin(spread);
    vec3 local = vec3(n.xy, n.z - cos(spread)) * sphere;

    vec4 clip = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
    vec4 centre = projectionMatrix * modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vScreen = clip.xy / max(clip.w, 1e-4);
    vCentre = centre.xy / max(centre.w, 1e-4);
    gl_Position = clip;
  }
`;

const WARP_SHELL_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uWidth;
  uniform float uBody;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec2 vScreen;
  varying vec2 vCentre;

  void main() {
    float d = (1.0 - vUv.y) / max(uWidth, 1e-3);
    float band = exp(-d * d);
    float mask = max(band, uBody * smoothstep(0.2, 1.0, vUv.y));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;

    vec2 dir = vScreen - vCentre;
    dir = length(dir) > 1e-5 ? normalize(dir) : vec2(0.0, 1.0);
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * The boom's floor ripple — a flat quad, drawn in metres from the impact.
 *
 * A short train of wavelets races out to `floorRadius`. Each wavelet is a
 * gaussian ring split into red / green / blue by `floorChroma` metres, the
 * same lens trick as the shell rim, so the floor ripple and the rings read as
 * the same physics. One quad, two materials: the colour pass here, and a
 * `FLOOR_WARP` pass on LAYER.DISTORTION that bends the frame along the same
 * rings.
 */
const FLOOR_VERTEX = /* glsl */ `
  uniform float uQuadSize;

  varying vec2 vLocal;
  varying vec2 vScreen;
  varying vec2 vCentre;
  varying float vViewZ;

  void main() {
    vLocal = (uv - 0.5) * uQuadSize;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewZ = mv.z;
    vec4 clip = projectionMatrix * mv;
    vec4 centre = projectionMatrix * modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vScreen = clip.xy / max(clip.w, 1e-4);
    vCentre = centre.xy / max(centre.w, 1e-4);
    gl_Position = clip;
  }
`;

const FLOOR_COMMON = /* glsl */ `
  uniform float uFront;       // metres the leading wavelet has reached
  uniform float uRings;
  uniform float uWavelength;
  uniform float uWidth;
  uniform float uMaxRadius;

  /** Sum of the wavelet train at distance d from the centre. */
  float wavelets(float d) {
    float sum = 0.0;
    for (int k = 0; k < 6; k++) {
      if (float(k) >= uRings) break;
      float r = uFront - float(k) * uWavelength;
      if (r <= 0.0) continue;
      float x = (d - r) / max(uWidth, 1e-3);
      // Each trailing wavelet is weaker than the one ahead of it.
      sum += exp(-x * x) * (1.0 - float(k) / max(uRings, 1.0) * 0.6);
    }
    // Thins out as it runs to the edge of its reach.
    return sum * (1.0 - smoothstep(uMaxRadius * 0.6, uMaxRadius, d));
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uChroma;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uFade;
  uniform vec3  uColorR;
  uniform vec3  uColorG;
  uniform vec3  uColorB;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

  varying vec2 vLocal;
  varying float vViewZ;

  ${FLOOR_COMMON}

  void main() {
    float d = length(vLocal);
    float r = wavelets(d + uChroma);
    float g = wavelets(d);
    float b = wavelets(d - uChroma);
    float white = min(r, min(g, b));
    vec3 color = uColorR * r + uColorG * g + uColorB * b;
    color = color * 0.6 + uColorRim * white * 1.2;

    float alpha = clamp(max(r, max(g, b)), 0.0, 1.0) * uFade * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uIntensity * uGlobalGlow * uFade * uOpacity, alpha);
  }
`;

const FLOOR_WARP_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uShaderIntensity;

  varying vec2 vLocal;
  varying vec2 vScreen;
  varying vec2 vCentre;

  ${FLOOR_COMMON}

  void main() {
    float mask = clamp(wavelets(length(vLocal)), 0.0, 1.0);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    vec2 dir = vScreen - vCentre;
    dir = length(dir) > 1e-5 ? normalize(dir) : vec2(0.0, 1.0);
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

/* ==================================================================== */
/* Factories                                                             */
/* ==================================================================== */

/** One pressure shell. Each ring owns one, so each has its own envelope. */
export function createResonanceShellMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: Math.random() * 10 },
      uRadius: { value: 1 },
      uSpread: { value: 0.8 },
      uFade: { value: 1 },
      uRimWidth: { value: 0.05 },
      uRimBright: { value: 3 },
      uChroma: { value: 0.04 },
      uFresnelPower: { value: 2.4 },
      uFresnelBright: { value: 0.9 },
      uBody: { value: 0.3 },
      uBands: { value: 6 },
      uBeat: { value: 1.65 },
      uBandSpeed: { value: 16 },
      uBandSharp: { value: 3 },
      uLobes: { value: 5 },
      uLobeDepth: { value: 0.35 },
      uIntensity: { value: 2 },
      uOpacity: { value: 1 },
      uSoftFade: { value: 0.45 },
      uColorRim: { value: new Color(1, 1, 1) },
      uColorBody: { value: new Color(0.8, 0.6, 1) },
      uColorR: { value: new Color(1, 0.3, 0.6) },
      uColorG: { value: new Color(0.6, 1, 0.9) },
      uColorB: { value: new Color(0.4, 0.5, 1) }
    }),
    vertexShader: SHELL_VERTEX,
    fragmentShader: SHELL_FRAGMENT
  });

  /** @param {object} state { radius, fade, seed } — the ring's own envelope */
  material.userData.sync = (state) => {
    const c = settings.sonic;
    const g = settings.global;
    const u = material.uniforms;

    u.uSeed.value = state.seed;
    u.uRadius.value = state.radius;
    u.uFade.value = state.fade;
    u.uSpread.value = c.spread;
    u.uRimWidth.value = c.rimWidth;
    u.uRimBright.value = c.rimBright;
    u.uChroma.value = c.chroma * g.shaderIntensity;
    u.uFresnelPower.value = c.fresnelPower;
    u.uFresnelBright.value = c.fresnelBright * g.fresnel;
    u.uBody.value = c.bodyOpacity;
    u.uBands.value = c.bands * g.noiseFrequency;
    u.uBeat.value = c.beat;
    u.uBandSpeed.value = c.bandSpeed * g.noiseSpeed;
    u.uBandSharp.value = c.bandSharp;
    u.uLobes.value = c.lobes;
    u.uLobeDepth.value = c.lobeDepth * g.noiseStrength;
    u.uIntensity.value = c.intensity * g.glow;
    u.uOpacity.value = c.opacity * g.opacity;
    u.uSoftFade.value = c.softFade;

    u.uColorRim.value.copy(getColor(c.colorRim));
    u.uColorBody.value.copy(getColor(c.colorBody));
    u.uColorR.value.copy(getColor(c.colorChromaR));
    u.uColorG.value.copy(getColor(c.colorChromaG));
    u.uColorB.value.copy(getColor(c.colorChromaB));
  };

  return material;
}

/** The warp under one pressure shell (LAYER.DISTORTION). */
export function createResonanceWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRadius: { value: 1 },
      uSpread: { value: 0.8 },
      uStrength: { value: 1 },
      uWidth: { value: 0.16 },
      uBody: { value: 0.2 }
    }),
    vertexShader: WARP_SHELL_VERTEX,
    fragmentShader: WARP_SHELL_FRAGMENT
  });

  /** @param {object} state { radius, fade } */
  material.userData.sync = (state) => {
    const c = settings.sonic;
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = state.radius;
    u.uSpread.value = c.spread;
    u.uStrength.value = state.fade * c.warpStrength * g.distortion;
    u.uWidth.value = c.warpWidth;
    u.uBody.value = c.warpBody;
  };

  return material;
}

/**
 * The boom's floor ripple.
 * @param {'color'|'warp'} pass which of the two passes this material draws
 */
export function createResonanceFloorMaterial(pass = 'color') {
  const warp = pass === 'warp';
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: !warp,
    blending: warp ? NormalBlending : AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 20 },
      uFront: { value: 0 },
      uRings: { value: 3 },
      uWavelength: { value: 0.8 },
      uWidth: { value: 0.14 },
      uMaxRadius: { value: 9 },
      uChroma: { value: 0.09 },
      uIntensity: { value: 2 },
      uOpacity: { value: 1 },
      uFade: { value: 1 },
      uStrength: { value: 1 },
      uColorR: { value: new Color(1, 0.3, 0.6) },
      uColorG: { value: new Color(0.6, 1, 0.9) },
      uColorB: { value: new Color(0.4, 0.5, 1) },
      uColorRim: { value: new Color(1, 1, 1) }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: warp ? FLOOR_WARP_FRAGMENT : FLOOR_FRAGMENT
  });

  /** @param {object} state { quadSize, front, fade } */
  material.userData.sync = (state) => {
    const c = settings.sonic;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize;
    u.uFront.value = state.front;
    u.uFade.value = state.fade;
    u.uRings.value = Math.max(1, Math.min(6, Math.round(c.floorRings)));
    u.uWavelength.value = c.floorWavelength;
    u.uWidth.value = c.floorWidth;
    u.uMaxRadius.value = Math.max(0.1, c.floorRadius * g.explosionIntensity);
    u.uChroma.value = c.floorChroma * g.shaderIntensity;
    u.uIntensity.value = c.floorIntensity * g.glow;
    u.uOpacity.value = c.opacity * g.opacity;
    u.uStrength.value = state.fade * c.boomWarp * g.distortion;
    u.uColorR.value.copy(getColor(c.colorChromaR));
    u.uColorG.value.copy(getColor(c.colorChromaG));
    u.uColorB.value.copy(getColor(c.colorChromaB));
    u.uColorRim.value.copy(getColor(c.colorRim));
  };

  return material;
}
