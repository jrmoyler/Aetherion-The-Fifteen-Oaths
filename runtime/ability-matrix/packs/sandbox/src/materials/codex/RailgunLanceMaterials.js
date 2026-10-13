import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Railgun Lance — the six bespoke shaders the lance is drawn with.
 *
 *  - **the coil** (`createRailCoilMaterial`) — a parameter grid bent into a
 *    flat torus band in the vertex stage. Hard light: a hex lattice flowing
 *    round the band, world-space scanlines climbing through it, a fresnel rim,
 *    and gaps cut between segments. It *draws itself in* as an angular sweep
 *    with a bright leading edge, crawls with arcs of light as it charges, and
 *    after the shot *derezzes*: the band is quantised into world-space pixel
 *    cells that blink out on a hash threshold, the last ones flaring.
 *  - **the slug** (`createRailSlugMaterial`) — a teardrop of hard light, blunt
 *    nose, long tail. A white core seen face-on, a cyan rim edge-on, the same
 *    hex lattice streaming back over it.
 *  - **the beam** (`createRailBeamMaterial`) — the trail. A cylinder whose
 *    brightness is `|N·V|^k`, so from any angle it reads as a soft tube with a
 *    hard white centre line. Energy pulses race down it; as it dies it thins
 *    in the vertex stage and breaks into dashes on noise. Drawn twice: a tight
 *    core and a wide soft halo.
 *  - **the shock rings** (`createRailShockMaterial`) — instanced quads stood up
 *    across the line, a hard ring with tick marks round it and a faint haze
 *    inside, expanding and fading on their own clocks.
 *  - **the slag** (`createRailTrenchMaterial`) — a ground strip down the line.
 *    Each point knows how long ago the slug passed over it (`along / speed`),
 *    so the trench cools from the muzzle outward the way a real cut would:
 *    white-hot → orange → dull red slag, cracked into a voronoi crust whose
 *    seams keep glowing longest, in a band of scorch.
 *  - **the heat bend** (`createRailWarpMaterial`) — the beam's cylinder again,
 *    wider, on `LAYER.DISTORTION`: the screen pushed out along the tube's own
 *    projected normal, shimmering on noise.
 *
 * Every material reads `settings.railgun` in `userData.sync(state)`; `state`
 * carries only what the ability knows that the settings do not.
 */

/* -------------------------------------------------------------------- */
/* Shared GLSL                                                          */
/* -------------------------------------------------------------------- */

/** Hex lattice: returns (edge distance, cell id.x, cell id.y). */
const HEX_GLSL = /* glsl */ `
  float hexDist(vec2 p) {
    p = abs(p);
    return max(dot(p, vec2(0.5, 0.8660254)), p.x);
  }
  vec3 hexCell(vec2 uv) {
    const vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(uv, r) - h;
    vec2 b = mod(uv - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 id = uv - gv;
    return vec3(0.5 - hexDist(gv), id);
  }
`;

/* -------------------------------------------------------------------- */
/* 1 · The coil                                                         */
/* -------------------------------------------------------------------- */

const COIL_VERTEX = /* glsl */ `
  uniform float uRadius;
  uniform float uTube;
  uniform float uDepth;
  uniform float uScale;

  varying vec2  vRing;      // x: around the coil 0..1, y: around the tube 0..1
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vWorld;
  varying float vViewZ;

  void main() {
    float a = position.x * 6.2831853;
    float b = position.y * 6.2831853;
    float R = uRadius * uScale;
    float t = uTube * uScale;
    vec3 radial = vec3(cos(a), sin(a), 0.0);
    // A flat band: thin radially, deep along the axis (local +Z = the line).
    vec3 p = radial * (R + t * cos(b)) + vec3(0.0, 0.0, t * uDepth * sin(b));
    vec3 n = normalize(radial * cos(b) + vec3(0.0, 0.0, sin(b) / max(uDepth, 0.05)));

    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vViewDir = cameraPosition - world.xyz;
    vRing = position.xy;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const COIL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;
  uniform float uTube;
  uniform float uSpin;        // integrated, radians
  uniform float uSegments;
  uniform float uGap;
  uniform float uBuild;       // 0..1 the sweep drawing it in
  uniform float uCharge;      // 0..1
  uniform float uDerez;       // 0 whole .. 1 gone
  uniform float uPixel;       // metres per derez cell
  uniform float uHexScale;
  uniform float uHexFlow;     // integrated
  uniform float uHexEdge;
  uniform float uScan;
  uniform float uScanPhase;   // integrated
  uniform float uScanDepth;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uRim;
  uniform float uChargeGlow;
  uniform float uArc;
  uniform float uArcPhase;    // integrated
  uniform float uFlicker;
  uniform float uGlitch;
  uniform float uFlash;       // the shot's swell, decays
  uniform float uSoftFade;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorDeep;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vRing;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}
  ${HEX_GLSL}

  void main() {
    // Glitch: now and then a horizontal slice of the band jumps sideways.
    float slice = floor(vWorld.y * 38.0);
    float gT = floor(uTime * 17.0 + uSeed * 13.0);
    float jump = step(1.0 - 0.18 * uGlitch, hash11(slice * 1.7 + gT)) * (hash11(slice + gT * 3.1) - 0.5);
    float around = vRing.x + jump * 0.06 * uGlitch;

    // Spun pattern coordinate; the build sweep stays fixed in the coil's frame.
    float ang = fract(around + uSpin / 6.2831853);

    /* the sweep drawing it in, with a hot leading edge */
    float drawn = 1.0 - smoothstep(uBuild - 0.025, uBuild, vRing.x);
    float leading = uBuild < 1.0 ? exp(-abs(vRing.x - uBuild) * 60.0) : 0.0;

    /* segments */
    float segF = fract(ang * max(uSegments, 1.0));
    float g = uGap * 0.5;
    float seg = smoothstep(g, g + 0.015, segF) * (1.0 - smoothstep(1.0 - g - 0.015, 1.0 - g, segF));
    float segEdge = seg * (1.0 - smoothstep(0.0, 0.05, min(segF - g, 1.0 - g - segF)));

    /* hex lattice flowing round the band */
    float circ = 6.2831853 * uRadius;
    float tubeC = 6.2831853 * uTube * 3.0;
    vec2 huv = vec2(ang * circ, vRing.y * tubeC) * uHexScale + vec2(uHexFlow, 0.0);
    vec3 hx = hexCell(huv);
    float hexLine = 1.0 - smoothstep(uHexEdge * 0.4, uHexEdge, hx.x);
    float cell = hash13(vec3(hx.yz, floor(uTime * 4.0 + hash11(hx.y * 3.3 + hx.z) * 8.0)));
    float cellLit = step(0.82, cell);

    /* scanlines climbing in world height */
    float sl = 0.5 + 0.5 * sin((vWorld.y * uScan - uScanPhase) * 6.2831853);
    float scan = mix(1.0, sl, uScanDepth);
    float band = exp(-pow(fract(vWorld.y * 0.9 - uScanPhase * 0.03) - 0.5, 2.0) * 220.0);

    /* rim */
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = abs(dot(N, V));
    float rim = pow(1.0 - ndv, 2.0) * uRim;

    /* charge: arcs of light crawling round the band */
    float an = snoise(vec3(ang * 22.0 - uArcPhase, vRing.y * 2.0, uSeed * 7.0));
    float arc = smoothstep(0.82, 0.98, 1.0 - abs(an)) * uCharge * uArc;

    /* derez: world-space pixel cells blinking out */
    vec3 cellP = floor(vWorld / max(uPixel, 0.004));
    float ph = hash13(cellP + uSeed * 17.0);
    float thr = uDerez * 1.12 - 0.06;
    float keep = uDerez <= 0.0 ? 1.0 : step(thr, ph);
    float flare = uDerez <= 0.0 ? 0.0 : (step(thr, ph) - step(thr + 0.09, ph));

    /* dropout flicker */
    float fl = hash11(floor(uTime * 26.0) + uSeed * 5.0);
    float flick = 1.0 - uFlicker * step(0.78, fl) * 0.85;

    float energy = 1.0 + uCharge * uChargeGlow + uFlash * 1.5;
    vec3 col = uColorDeep * 0.55
             + uColorA * (0.3 + hexLine * 1.15 + cellLit * 0.35) * uShaderIntensity
             + uColorB * (rim * 0.3 + segEdge * 0.7 + arc * 2.2 + leading * 3.0 + band * 0.25 + flare * 2.0);
    col *= scan * energy;

    float alpha = uOpacity * seg * drawn * keep * flick
                * (0.3 + 0.7 * hexLine + rim * 0.6 + arc + leading + flare);
    if (alpha < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** One coil. The ability builds one per ring so each has its own clocks. */
export function createRailCoilMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uRadius: { value: 0.4 },
      uTube: { value: 0.03 },
      uDepth: { value: 3 },
      uScale: { value: 1 },
      uSpin: { value: 0 },
      uSegments: { value: 6 },
      uGap: { value: 0.16 },
      uBuild: { value: 0 },
      uCharge: { value: 0 },
      uDerez: { value: 0 },
      uPixel: { value: 0.03 },
      uHexScale: { value: 26 },
      uHexFlow: { value: 0 },
      uHexEdge: { value: 0.08 },
      uScan: { value: 34 },
      uScanPhase: { value: 0 },
      uScanDepth: { value: 0.5 },
      uGlow: { value: 2.8 },
      uOpacity: { value: 0.8 },
      uRim: { value: 1.6 },
      uChargeGlow: { value: 2 },
      uArc: { value: 1 },
      uArcPhase: { value: 0 },
      uFlicker: { value: 0.2 },
      uGlitch: { value: 0.3 },
      uFlash: { value: 0 },
      uSoftFade: { value: 0.15 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: COIL_VERTEX,
    fragmentShader: COIL_FRAGMENT
  });

  /**
   * @param {object} s { radius, scale, spin, build, charge, derez, flash,
   *   hexFlow, scanPhase, arcPhase, seed }
   */
  material.userData.sync = (s) => {
    const c = settings.railgun;
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = s.seed;
    u.uRadius.value = Math.max(0.02, s.radius);
    u.uTube.value = Math.max(0.002, c.ringTube);
    u.uDepth.value = Math.max(0.1, c.ringDepth);
    u.uScale.value = s.scale;
    u.uSpin.value = s.spin;
    u.uSegments.value = Math.max(1, Math.round(c.ringSegments));
    u.uGap.value = Math.min(0.9, Math.max(0, c.segmentGap));
    u.uBuild.value = s.build;
    u.uCharge.value = s.charge;
    u.uDerez.value = s.derez;
    u.uPixel.value = c.pixelSize;
    u.uHexScale.value = c.hexScale * g.noiseFrequency;
    u.uHexFlow.value = s.hexFlow;
    u.uHexEdge.value = Math.max(0.005, c.hexEdge);
    u.uScan.value = c.scanlines;
    u.uScanPhase.value = s.scanPhase;
    u.uScanDepth.value = Math.min(1, Math.max(0, c.scanDepth));
    u.uGlow.value = c.holoGlow * g.glow;
    u.uOpacity.value = c.holoOpacity * g.opacity;
    u.uRim.value = c.rimGlow * g.fresnel;
    u.uChargeGlow.value = c.chargeGlow;
    u.uArc.value = c.arcCrawl * g.shaderIntensity;
    u.uArcPhase.value = s.arcPhase;
    u.uFlicker.value = Math.min(1, c.flicker * g.randomness);
    u.uGlitch.value = Math.min(1, c.glitch * g.randomness);
    u.uFlash.value = s.flash;
    u.uSoftFade.value = c.softFade;
    u.uColorA.value.copy(getColor(c.colorA));
    u.uColorB.value.copy(getColor(c.colorB));
    u.uColorDeep.value.copy(getColor(c.colorRingDeep));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* 2 · The slug                                                         */
/* -------------------------------------------------------------------- */

const SLUG_VERTEX = /* glsl */ `
  uniform float uLength;
  uniform float uWidth;

  varying vec2  vSlug;      // x: around, y: 0 tail .. 1 nose
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  void main() {
    float a = position.x * 6.2831853;
    float s = position.y;
    vec2 ring = vec2(cos(a), sin(a));
    // Teardrop: a long tail swelling toward the front (s 0..0.85, local z
    // -uLength..0), then a domed nose cap ahead of z = 0.
    float r;
    float z;
    vec3 n;
    if (s <= 0.85) {
      float k = s / 0.85;
      r = uWidth * pow(k, 0.7);
      z = (k - 1.0) * uLength;
      n = vec3(ring, -uWidth * 0.7 / max(uLength, 0.01));
    } else {
      float k = (s - 0.85) / 0.15;
      float c = sqrt(max(1.0 - k * k, 0.0));
      r = uWidth * c;
      z = k * uWidth * 1.3;
      n = vec3(ring * c, k);
    }
    vec3 p = vec3(ring * r, z);
    n = normalize(n);

    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * n);
    vViewDir = cameraPosition - world.xyz;
    vSlug = position.xy;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SLUG_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uRim;
  uniform float uLevel;
  uniform float uFlow;
  uniform float uHexScale;
  uniform vec3  uColorCore;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

  varying vec2  vSlug;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  ${noiseGLSL}
  ${HEX_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = abs(dot(N, V));
    float core = pow(ndv, 1.6);
    float rim = pow(1.0 - ndv, 2.2) * uRim;

    vec3 hx = hexCell(vec2(vSlug.x * 6.0, vSlug.y * 8.0) * uHexScale * 0.12 + vec2(0.0, uFlow));
    float hexLine = 1.0 - smoothstep(0.02, 0.07, hx.x);
    // The tail is cooler than the nose; the nose is pure white.
    float tail = smoothstep(0.0, 0.9, vSlug.y);
    vec3 col = uColorCore * core * uGlow * (0.4 + 0.6 * tail)
             + uColorRim * (rim + hexLine * 0.6) * (0.6 + 0.4 * tail) * uGlow * 0.35;
    float alpha = uLevel * smoothstep(0.0, 0.25, vSlug.y) * (0.5 + 0.5 * core + rim);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

export function createRailSlugMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uLength: { value: 1.5 },
      uWidth: { value: 0.1 },
      uGlow: { value: 7 },
      uRim: { value: 2.4 },
      uLevel: { value: 1 },
      uFlow: { value: 0 },
      uHexScale: { value: 26 },
      uColorCore: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: SLUG_VERTEX,
    fragmentShader: SLUG_FRAGMENT
  });

  /** @param {object} s { length, width, level, flow, seed } */
  material.userData.sync = (s) => {
    const c = settings.railgun;
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = s.seed;
    u.uLength.value = Math.max(0.02, s.length);
    u.uWidth.value = Math.max(0.005, s.width);
    u.uGlow.value = c.slugGlow * g.glow;
    u.uRim.value = c.slugRim * g.fresnel;
    u.uLevel.value = s.level * g.opacity;
    u.uFlow.value = s.flow;
    u.uHexScale.value = c.hexScale * g.noiseFrequency;
    u.uColorCore.value.copy(getColor(c.colorSlugCore));
    u.uColorRim.value.copy(getColor(c.colorSlugRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* 3 · The beam trail (and, wider, the heat bend)                       */
/* -------------------------------------------------------------------- */

/**
 * Local frame: the mesh sits at the line's start with local +Z down the line.
 * `position.x` wraps round the tube, `position.y` runs 0..1 along `uLength`.
 */
const TUBE_VERTEX = /* glsl */ `
  uniform float uLength;
  uniform float uRadius;
  uniform float uTaper;      // metres at each end over which the tube closes

  varying vec2  vTube;       // x: around 0..1, y: metres along
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec2  vNormalS;    // the radial normal, in view space
  varying float vViewZ;

  void main() {
    float a = position.x * 6.2831853;
    float along = position.y * uLength;
    float close = smoothstep(0.0, max(uTaper, 1e-3), along) * smoothstep(0.0, max(uTaper, 1e-3), uLength - along);
    float r = uRadius * mix(0.35, 1.0, close);
    vec3 n = vec3(cos(a), sin(a), 0.0);
    vec3 p = n * r + vec3(0.0, 0.0, along);

    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * n);
    vViewDir = cameraPosition - world.xyz;
    vNormalS = (viewMatrix * vec4(vNormalW, 0.0)).xy;
    vTube = vec2(position.x, along);
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uHead;        // metres along the slug has reached
  uniform float uTail;        // metres along the trail starts
  uniform float uGlow;
  uniform float uCoreSharp;
  uniform float uPulseScale;
  uniform float uPulsePhase;  // integrated
  uniform float uFlicker;
  uniform float uBreak;       // 0 whole .. 1 gone
  uniform float uBreakScale;
  uniform float uLevel;
  uniform float uHalo;        // 0 the core, 1 the halo
  uniform float uSoftFade;
  uniform vec3  uColorCore;
  uniform vec3  uColorEdge;
  uniform vec3  uColorHalo;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vTube;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec2  vNormalS;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float along = vTube.y;
    if (along > uHead || along < uTail) discard;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = abs(dot(N, V));

    // Energy racing down the line, and a slow noise ripple under it.
    float p = fract(along * uPulseScale - uPulsePhase);
    float pulse = smoothstep(0.0, 0.06, p) * (1.0 - smoothstep(0.06, 0.45, p));
    float ripple = snoise(vec3(along * 1.7 - uPulsePhase * 0.25, vTube.x * 3.0, uSeed)) * 0.5 + 0.5;

    // Dying: it breaks into dashes from the noise up.
    float dn = snoise(vec3(along * uBreakScale, uSeed * 3.0, uTime * 0.6)) * 0.5 + 0.5;
    float thr = uBreak * 1.2 - 0.15;
    float keep = uBreak <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, dn);

    // Fresh at the slug, closing at the muzzle.
    float ends = smoothstep(0.0, 0.6, along - uTail) * smoothstep(0.0, 0.35, uHead - along);
    float fl = 1.0 - uFlicker * hash11(floor(uTime * 40.0) + uSeed);

    vec3 col;
    float alpha;
    if (uHalo < 0.5) {
      float core = pow(ndv, max(uCoreSharp, 0.2));
      col = mix(uColorEdge, uColorCore, core * core) * (core * (1.0 + pulse * 0.9 * uShaderIntensity) + ripple * 0.15);
      alpha = core;
    } else {
      float soft = pow(ndv, 1.4);
      col = uColorHalo * soft * (0.7 + 0.5 * ripple + pulse * 0.6 * uShaderIntensity);
      alpha = soft;
    }
    alpha *= uLevel * keep * ends * fl;
    if (alpha < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** @param {boolean} halo the wide soft outer glow instead of the core */
export function createRailBeamMaterial(halo = false) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uLength: { value: 10 },
      uRadius: { value: 0.08 },
      uTaper: { value: 0.3 },
      uHead: { value: 0 },
      uTail: { value: 0 },
      uGlow: { value: 5 },
      uCoreSharp: { value: 3 },
      uPulseScale: { value: 1 },
      uPulsePhase: { value: 0 },
      uFlicker: { value: 0.15 },
      uBreak: { value: 0 },
      uBreakScale: { value: 1.4 },
      uLevel: { value: 1 },
      uHalo: { value: halo ? 1 : 0 },
      uSoftFade: { value: 0.25 },
      uColorCore: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: TUBE_VERTEX,
    fragmentShader: BEAM_FRAGMENT
  });

  /** @param {object} s { length, head, tail, thin (0..1 of width left), breakT, level, pulsePhase, seed } */
  material.userData.sync = (s) => {
    const c = settings.railgun;
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = s.seed;
    u.uLength.value = Math.max(0.1, s.length);
    u.uRadius.value = Math.max(0.001, (halo ? c.beamHalo : c.beamWidth) * s.thin);
    u.uTaper.value = halo ? 0.6 : 0.25;
    u.uHead.value = s.head;
    u.uTail.value = s.tail;
    u.uGlow.value = (halo ? c.haloGlow : c.beamGlow) * g.glow;
    u.uCoreSharp.value = c.beamCoreSharp;
    u.uPulseScale.value = c.beamPulseScale * g.noiseFrequency;
    u.uPulsePhase.value = s.pulsePhase;
    u.uFlicker.value = Math.min(1, c.beamFlicker * g.randomness);
    u.uBreak.value = s.breakT * Math.min(1, Math.max(0, c.beamBreak));
    u.uBreakScale.value = c.beamBreakScale * g.noiseFrequency;
    u.uLevel.value = s.level * g.opacity;
    u.uSoftFade.value = c.beamSoftFade;
    u.uColorCore.value.copy(getColor(c.colorBeamCore));
    u.uColorEdge.value.copy(getColor(c.colorBeamEdge));
    u.uColorHalo.value.copy(getColor(c.colorBeamHalo));
  };

  return material;
}

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uHead;
  uniform float uTail;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uShaderIntensity;

  varying vec2  vTube;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec2  vNormalS;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float along = vTube.y;
    if (along > uHead || along < uTail) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = abs(dot(N, V));
    // Strongest on the tube's silhouette centre, where the most hot air is.
    float body = pow(ndv, 1.2);
    vec3 np = vec3(along * uScale - uTime * uSpeed, vTube.x * 4.0, uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(13.1, 5.7, 21.3)));
    vec2 dir = normalize(vNormalS + 1e-5);
    vec2 offset = dir * 0.6 + n * 0.6;
    float len = length(offset);
    if (len > 1.0) offset /= len;
    float ends = smoothstep(0.0, 0.8, along - uTail) * smoothstep(0.0, 0.5, uHead - along);
    float strength = uStrength * uShaderIntensity * body * ends;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, body * ends);
  }
`;

/** The heat bend round the trail, for `LAYER.DISTORTION`. */
export function createRailWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uLength: { value: 10 },
      uRadius: { value: 0.4 },
      uTaper: { value: 0.6 },
      uHead: { value: 0 },
      uTail: { value: 0 },
      uStrength: { value: 1 },
      uScale: { value: 3 },
      uSpeed: { value: 7 }
    }),
    vertexShader: TUBE_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { length, head, tail, strength, seed } */
  material.userData.sync = (s) => {
    const c = settings.railgun;
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = s.seed;
    u.uLength.value = Math.max(0.1, s.length);
    u.uRadius.value = Math.max(0.01, c.warpWidth);
    u.uHead.value = s.head;
    u.uTail.value = s.tail;
    u.uStrength.value = s.strength * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* 4 · The shock rings                                                  */
/* -------------------------------------------------------------------- */

const SHOCK_VERTEX = /* glsl */ `
  attribute vec4 aShock;      // x: metres along, y: age 0..1, z: seed, w: strength

  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uHeight;
  uniform float uRadius;
  uniform float uGrow;

  varying vec2  vUv;          // in units of the ring's current radius
  varying float vAge;
  varying float vSeed;
  varying float vStrength;

  void main() {
    float age = aShock.y;
    float grow = 1.0 - pow(1.0 - clamp(age, 0.0, 1.0), 3.0);
    float r = uRadius * mix(1.0, max(uGrow, 0.1), grow);
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 centre = uStart + uDir * aShock.x + up * uHeight;
    vec3 world = centre + (uSide * position.x + up * position.y) * r * 1.25;
    vUv = position.xy * 1.25;
    vAge = age;
    vSeed = aShock.z;
    vStrength = (age >= 1.0 || aShock.w <= 0.0) ? 0.0 : aShock.w;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SHOCK_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uWidthFrac;   // line width / current radius, at birth
  uniform float uGlow;
  uniform float uTicks;
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying vec2  vUv;
  varying float vAge;
  varying float vSeed;
  varying float vStrength;

  void main() {
    if (vStrength <= 0.0) discard;
    float r = length(vUv);
    float w = max(uWidthFrac, 0.005);
    float ring = exp(-pow((r - 1.0) / w, 2.0));
    // Tick marks standing just outside the ring.
    float a = atan(vUv.y, vUv.x) / 6.2831853 + vSeed;
    float tk = fract(a * max(uTicks, 1.0));
    float tick = (1.0 - smoothstep(0.05, 0.1, abs(tk - 0.5))) * smoothstep(1.04, 1.06, r) * (1.0 - smoothstep(1.1, 1.14, r));
    float haze = (1.0 - smoothstep(0.2, 1.0, r)) * 0.18;
    float life = pow(1.0 - vAge, 1.6);
    vec3 col = uColorA * (ring + tick * 0.8) * uGlow + uColorB * haze * uGlow;
    float alpha = (ring + tick * 0.7 + haze) * life * vStrength * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

export function createRailShockMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uHeight: { value: 1.3 },
      uRadius: { value: 0.5 },
      uGrow: { value: 2.5 },
      uWidthFrac: { value: 0.08 },
      uGlow: { value: 3 },
      uTicks: { value: 12 },
      uOpacity: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: SHOCK_VERTEX,
    fragmentShader: SHOCK_FRAGMENT
  });

  /** @param {object} s { start, dir, side } */
  material.userData.sync = (s) => {
    const c = settings.railgun;
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(s.start);
    u.uDir.value.copy(s.dir);
    u.uSide.value.copy(s.side);
    u.uHeight.value = c.ringHeight;
    u.uRadius.value = Math.max(0.02, c.shockRadius);
    u.uGrow.value = c.shockGrow;
    u.uWidthFrac.value = c.shockWidth / Math.max(0.02, c.shockRadius);
    u.uGlow.value = c.shockGlow * g.glow;
    u.uTicks.value = Math.max(1, Math.round(c.shockTicks));
    u.uOpacity.value = g.opacity;
    u.uColorA.value.copy(getColor(c.colorShockA));
    u.uColorB.value.copy(getColor(c.colorShockB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* 5 · The slag trench                                                  */
/* -------------------------------------------------------------------- */

const TRENCH_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uWidth;

  varying vec2 vFlat;         // x: metres across, y: metres along

  void main() {
    float across = position.x * uWidth;
    float along = (position.y + 0.5) * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = 0.014;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TRENCH_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uSeed;
  uniform float uReach;       // metres of trench the slug has crossed
  uniform float uFireAge;     // seconds since the slug left the muzzle
  uniform float uOffset;      // metres from the muzzle to the trench's start
  uniform float uSpeed;       // the slug's speed, m/s
  uniform float uCore;
  uniform float uScorch;
  uniform float uGlow;
  uniform float uCool;
  uniform float uEmber;
  uniform float uCells;
  uniform float uWander;
  uniform float uDark;
  uniform float uErode;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorHot;
  uniform vec3  uColorWarm;
  uniform vec3  uColorCool;
  uniform vec3  uColorScorch;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  vec3 heatRamp(float h) {
    vec3 a = mix(uColorCool, uColorWarm, smoothstep(0.0, 0.45, h));
    return mix(a, uColorHot, smoothstep(0.5, 1.0, h));
  }

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;
    if (along < 0.0 || along > uReach) discard;

    float wig = snoise(vec3(along * 0.7, uSeed, 0.0)) * uWander;
    float dx = x - wig;
    float ad = abs(dx);

    // Opens over the first half-metre, pinches to a point at the slug.
    float open = smoothstep(0.0, 0.5, along) * mix(0.35, 1.0, smoothstep(0.0, 0.25, uReach - along));

    // How long ago the slug crossed this point — the trench cools muzzle-first.
    float age = max(uFireAge - (along + uOffset) / max(uSpeed, 1.0), 0.0);
    float heat = exp(-age / max(uCool, 0.02));

    vec2 vor = voronoi2(vec2(x * 1.4, along) * uCells + uSeed * 9.0);
    float crack = smoothstep(0.32, 0.55, vor.x);
    float crust = 0.75 + 0.25 * vor.y;

    float edgeN = fbm3(vec3(x * 6.0, along * 1.3, uSeed)) * 0.04;
    float coreW = max(uCore * open * (0.75 + 0.25 * heat), 0.003);
    float core = 1.0 - smoothstep(coreW * 0.55, coreW, ad + edgeN);
    float scorchN = fbm3(vec3(x * 2.0, along * 0.6, uSeed * 2.0)) * 0.18;
    float scorch = (1.0 - smoothstep(uScorch * 0.35, uScorch, ad + scorchN)) * open;

    // Molten core: white while fresh; then the crust closes over it and only
    // the seams stay lit.
    float molten = core * mix(crack * 0.75 + 0.25, 1.0, heat);
    float h = heat * (0.75 + 0.25 * (1.0 - crack));
    float ember = core * crack * uEmber * (1.0 - uFadeT);
    vec3 glow = heatRamp(h) * uGlow * (molten * heat + ember * 0.6);
    // A heat bloom over the scorched band right behind the slug.
    glow += uColorWarm * scorch * heat * heat * heat * 0.08 * uGlow;

    vec3 col = uColorScorch * crust + glow * uGlobalGlow;
    float a = max(scorch * uDark, molten * max(heat, uEmber));

    float n = snoise(vec3(x * 3.0, along * 0.9, uSeed * 5.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.55, n, uErode));
    a *= vis * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The slag down the floor. Normal blending: the scorch has to be *dark*. */
export function createRailTrenchMaterial() {
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
      uDir: { value: new Vector3() },
      uSide: { value: new Vector3() },
      uLength: { value: 10 },
      uWidth: { value: 2 },
      uSeed: { value: 0 },
      uReach: { value: 0 },
      uFireAge: { value: 0 },
      uOffset: { value: 0 },
      uSpeed: { value: 100 },
      uCore: { value: 0.13 },
      uScorch: { value: 0.6 },
      uGlow: { value: 4 },
      uCool: { value: 0.9 },
      uEmber: { value: 0.35 },
      uCells: { value: 9 },
      uWander: { value: 0.03 },
      uDark: { value: 0.75 },
      uErode: { value: 0.7 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorHot: { value: new Color() },
      uColorWarm: { value: new Color() },
      uColorCool: { value: new Color() },
      uColorScorch: { value: new Color() }
    }),
    vertexShader: TRENCH_VERTEX,
    fragmentShader: TRENCH_FRAGMENT
  });

  /**
   * @param {object} s { start, dir, side, length, reach, fireAge, offset,
   *   speed, fadeT, seed }
   */
  material.userData.sync = (s) => {
    const c = settings.railgun;
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(s.start);
    u.uDir.value.copy(s.dir);
    u.uSide.value.copy(s.side);
    u.uLength.value = Math.max(0.1, s.length);
    u.uWidth.value = 2 * (Math.max(c.trenchScorch, c.trenchCore) + c.trenchWander + 0.2);
    u.uSeed.value = s.seed;
    u.uReach.value = s.reach;
    u.uFireAge.value = s.fireAge;
    u.uOffset.value = s.offset;
    u.uSpeed.value = s.speed;
    u.uCore.value = Math.max(0.005, c.trenchCore);
    u.uScorch.value = Math.max(0.01, c.trenchScorch);
    u.uGlow.value = c.trenchGlow * g.glow;
    u.uCool.value = c.trenchCool * g.lifetime;
    u.uEmber.value = c.trenchEmber;
    u.uCells.value = c.trenchCells * g.noiseFrequency;
    u.uWander.value = c.trenchWander * g.noiseStrength * g.randomness;
    u.uDark.value = c.trenchDark;
    u.uErode.value = c.trenchErode;
    u.uFadeT.value = s.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorHot.value.copy(getColor(c.colorSlagHot));
    u.uColorWarm.value.copy(getColor(c.colorSlagWarm));
    u.uColorCool.value.copy(getColor(c.colorSlagCool));
    u.uColorScorch.value.copy(getColor(c.colorScorch));
  };

  return material;
}
