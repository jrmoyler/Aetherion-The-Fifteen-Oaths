import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';

/**
 * Tidal Memory — materials.
 *
 * Every factory returns a raw `ShaderMaterial`; most carry a
 * `userData.sync(c, state)` that resolves the live settings block `c` and
 * `settings.global` into uniforms each frame. The four materials the tests and
 * the ability address by name keep their original uniforms (`uFade`,
 * `uCoverage`, `uDirection`, `uColor`, `uOpacity`, `uWidth`, `uHeight`) and
 * gain the rest.
 *
 *  - **wave** — the hero: a breaking wave built in the vertex stage from
 *    parameter space (back slope → crest → curling lip), with normals from
 *    finite differences of the same profile. The fragment shades it as water:
 *    deep at the foot, shallow and lit through at the crest, fresnel on the
 *    silhouette, a voronoi caustic shimmer on the face, fbm-broken foam on
 *    the crest and lip that streams back down the slope, a sun glint, soft
 *    feathering at the lateral ends and against scene depth.
 *  - **wake** — the recorded course on the floor: ripples, a voronoi foam
 *    lace, and a bright *memory* line down its middle. It is revealed only
 *    where the wave has been (`uCoverage`), and dimmed to a residue where the
 *    returning wave has already retraced it (`uErase`).
 *  - **crest foam** — two foam bands riding and lagging the crest.
 *  - **spray** — points thrown up off the lip on a parabola.
 *  - **turn ripple** — concentric crests and foam beads on the floor where
 *    the wave turns.
 *  - **warp** — LAYER.DISTORTION refraction riding just behind the crest.
 */

/* ---------------------------------------------------------------------- */
/* Wave                                                                    */
/* ---------------------------------------------------------------------- */

const WAVE_PROFILE = /* glsl */ `
  const float CREST = 0.62;

  /** Profile at v for crest height H: x metres forward, y metres up. */
  vec2 waveProfile(float v, float H) {
    if (v <= CREST) {
      float s = v / CREST;
      // A concave back slope, steepening toward the crest.
      float f = -uBack * (1.0 - s) * (1.0 - s * 0.35);
      float y = H * pow(sin(s * 1.5707963), 1.6);
      return vec2(f, y);
    }
    // The lip: an arc of a circle hanging forward off the crest and under.
    float s = (v - CREST) / (1.0 - CREST);
    float rc = max(H * uCurl * 0.45, 0.005);
    float th = s * 2.3;
    return vec2(rc * sin(th), H - rc + rc * cos(th));
  }

  vec3 wavePoint(float u, float v) {
    float H = uHeight * max(0.0, 1.0 - u * u);
    vec2 pr = waveProfile(v, H);
    // The crest rolls laterally, and wanders a little with noise.
    float roll = sin(u * 7.0 + uRollPhase) * uRoll;
    float wander = snoise(vec3(u * 1.7, uTime * 0.6, uSeed)) * uWander * smoothstep(0.3, CREST, v);
    vec3 p = uFront + uFacing * (pr.x + roll + wander) + uSide * (u * uWidth);
    p.y = pr.y + 0.02;
    return p;
  }
`;

const WAVE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform vec3  uFront;
  uniform vec3  uFacing;     // direction × ±1: the wave faces home on the return
  uniform vec3  uSide;
  uniform float uWidth;
  uniform float uHeight;
  uniform float uBack;
  uniform float uCurl;
  uniform float uRoll;
  uniform float uRollPhase;
  uniform float uWander;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vU;
  varying float vV;
  varying float vViewZ;

  ${noiseGLSL}
  ${WAVE_PROFILE}

  void main() {
    float u = position.x;
    float v = position.y;
    vec3 p = wavePoint(u, v);
    // Normals from the same profile, by central differences.
    float e = 0.01;
    vec3 du = wavePoint(min(u + e, 1.0), v) - wavePoint(max(u - e, -1.0), v);
    vec3 dv = wavePoint(u, min(v + e, 1.0)) - wavePoint(u, max(v - e, 0.0));
    vec3 n = cross(du, dv);
    vNormalW = length(n) > 1e-6 ? normalize(n) : vec3(0.0, 1.0, 0.0);
    vViewDir = cameraPosition - p;
    vU = u;
    vV = v;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const WAVE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uWidth;
  uniform float uFade;
  uniform float uOpacity;
  uniform float uFresnel;
  uniform float uFoam;
  uniform float uFoamScale;
  uniform float uCaustic;
  uniform float uGlint;
  uniform float uSoftFade;
  uniform vec3  uColorDeep;
  uniform vec3  uColorShallow;
  uniform vec3  uColorFoam;
  uniform vec3  uColorGlint;
  uniform vec3  uLightDir;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vU;
  varying float vV;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndv = abs(dot(N, V));
    float fres = pow(1.0 - ndv, max(uFresnel, 0.1));

    // Deep at the foot, shallow (lit through) at the crest and lip.
    float shallow = smoothstep(0.25, 0.75, vV);
    vec3 color = mix(uColorDeep, uColorShallow, clamp(shallow * 0.8 + fres * 0.35, 0.0, 1.0));

    // Caustic shimmer across the face.
    vec2 cell = voronoi2(vec2(vU * uWidth * 1.6, vV * 3.2) * uFoamScale * 0.5 + vec2(0.0, -uTime * 0.8) + uSeed);
    float caustic = pow(1.0 - clamp(cell.x, 0.0, 1.0), 6.0) * uCaustic * (1.0 - shallow * 0.5) * uShaderIntensity;
    color += uColorShallow * caustic;

    // Foam: churned on the crest and lip, streaming back down the slope.
    float band = smoothstep(0.5, 0.66, vV);
    float churn = fbm3(vec3(vU * uFoamScale * 2.0, vV * 6.0 - uTime * 1.5, uSeed));
    float froth = pow(max(0.0, sin(vU * 59.0 + sin(vU * 18.0 + uTime) * 2.0 - uTime * 5.0)), 8.0);
    float foam = clamp(band * (0.45 + churn) + froth * band * 0.5, 0.0, 1.0);
    float streak = smoothstep(0.45, 0.9, snoise(vec3(vU * uWidth * 3.0, vV * 1.2 + uTime * 0.4, uSeed + 3.0))) * (1.0 - band) * 0.5;
    float white = clamp((foam + streak) * uFoam, 0.0, 1.0);
    color = mix(color, uColorFoam, white);

    // Sun glint off the face.
    vec3 H = normalize(normalize(uLightDir) + V);
    color += uColorGlint * pow(abs(dot(N, H)), 80.0) * uGlint * uGlobalGlow;

    float sides = 1.0 - smoothstep(0.72, 1.0, abs(vU));
    float foot = smoothstep(0.0, 0.08, vV);
    float alpha = uOpacity * (0.5 + 0.35 * fres + 0.35 * white) * sides * foot * uFade;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export function createWaveMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uFront: { value: new Vector3() },
      uFacing: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uWidth: { value: 1.6 },
      uHeight: { value: 1.3 },
      uBack: { value: 1.6 },
      uCurl: { value: 0.6 },
      uRoll: { value: 0.1 },
      uRollPhase: { value: 0 },
      uWander: { value: 0.08 },
      uFade: { value: 1 },
      uOpacity: { value: 0.8 },
      uFresnel: { value: 2.5 },
      uFoam: { value: 0.7 },
      uFoamScale: { value: 3 },
      uCaustic: { value: 0.5 },
      uGlint: { value: 1.2 },
      uSoftFade: { value: 0.4 },
      uColorDeep: { value: new Color() },
      uColorShallow: { value: new Color() },
      uColorFoam: { value: new Color() },
      uColorGlint: { value: new Color() }
    }),
    vertexShader: WAVE_VERTEX,
    fragmentShader: WAVE_FRAGMENT
  });
  /** @param {object} state { front, facing, side, height, rollPhase, fade, seed } */
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = state.seed;
    u.uFront.value.copy(state.front);
    u.uFacing.value.copy(state.facing);
    u.uSide.value.copy(state.side);
    u.uWidth.value = c.width;
    u.uHeight.value = state.height;
    u.uBack.value = c.waveBack;
    u.uCurl.value = c.waveCurl;
    u.uRoll.value = c.waveRoll;
    u.uRollPhase.value = state.rollPhase;
    u.uWander.value = c.waveWander * g.noiseStrength;
    u.uFade.value = state.fade;
    u.uOpacity.value = c.waveOpacity * g.opacity;
    u.uFresnel.value = c.waveFresnel * g.fresnel;
    u.uFoam.value = c.waveFoam;
    u.uFoamScale.value = c.waveFoamScale * g.noiseFrequency;
    u.uCaustic.value = c.waveCaustic;
    u.uGlint.value = c.waveGlint * g.glow;
    u.uSoftFade.value = c.waveSoftFade;
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorShallow.value.copy(getColor(c.colorShallow));
    u.uColorFoam.value.copy(getColor(c.colorFoam));
    u.uColorGlint.value.copy(getColor(c.colorGlint));
  };
  return material;
}

/* ---------------------------------------------------------------------- */
/* Wake                                                                    */
/* ---------------------------------------------------------------------- */

const RIBBON_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WAKE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uFade;
  uniform float uCoverage;   // 0..1 of the course the wave has reached
  uniform float uDirection;  // +1 outward, −1 on the return
  uniform float uErase;      // 0..1: beyond this the return has retraced it
  uniform float uMemory;     // what is left of retraced water
  uniform float uLace;
  uniform float uLength;     // metres
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3  uColor;
  uniform vec3  uColorMemory;
  uniform float uGlobalGlow;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float x = abs(vUv.y - 0.5) * 2.0;
    float metres = vUv.x * uLength;
    float ripple = pow(max(0.0, sin(vUv.x * 60.0 - uTime * 7.0 * uDirection + x * 6.0)), 12.0);
    // Foam lace: the far side of voronoi cells, drifting with the flow.
    vec2 cell = voronoi2(vec2(metres * 1.4, vUv.y * 3.0) + vec2(uTime * 0.4 * uDirection, 0.0) + uSeed);
    float lace = smoothstep(0.42, 0.6, cell.x) * uLace;
    // The memory: one bright line down the recorded course, shimmering.
    float shimmer = 0.6 + 0.4 * snoise(vec3(metres * 0.8 - uTime * 2.0 * uDirection, uSeed, 0.0));
    float memory = exp(-x * x * 40.0) * shimmer;

    float body = (1.0 - smoothstep(0.4, 1.0, x));
    float reveal = 1.0 - smoothstep(uCoverage, uCoverage + 0.025, vUv.x);
    float spent = smoothstep(uErase - 0.02, uErase, vUv.x);
    float keep = mix(1.0, uMemory, spent);

    vec3 color = uColor * (0.6 + ripple) + uColorMemory * memory * (1.0 + 1.5 * (1.0 - spent));
    float alpha = body * (ripple * 0.35 + lace * 0.4 + memory * 0.6 + 0.08) * uOpacity * reveal * keep * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uGlobalGlow, alpha);
  }
`;

export function createWakeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uCoverage: { value: 0 },
      uDirection: { value: 1 },
      uErase: { value: 1 },
      uMemory: { value: 0.25 },
      uLace: { value: 0.6 },
      uLength: { value: 10 },
      uOpacity: { value: 1 },
      uSeed: { value: 0 },
      uColor: { value: new Color() },
      uColorMemory: { value: new Color() }
    }),
    vertexShader: RIBBON_VERTEX,
    fragmentShader: WAKE_FRAGMENT
  });
  /** Coverage, direction and erase are written by the ability; this is the look. */
  material.userData.sync = (c, length, seed) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uMemory.value = c.wakeMemory;
    u.uLace.value = c.wakeLace;
    u.uLength.value = length;
    u.uOpacity.value = c.wakeOpacity * g.opacity;
    u.uSeed.value = seed;
    u.uColor.value.copy(getColor(c.colorWake));
    u.uColorMemory.value.copy(getColor(c.colorWakeMemory));
  };
  return material;
}

/* ---------------------------------------------------------------------- */
/* Crest foam bands                                                        */
/* ---------------------------------------------------------------------- */

const CREST_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uFade;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float edge = pow(max(0.0, 1.0 - abs(vUv.x - 0.5) * 2.0), 0.7);
    float stripe = pow(max(0.0, sin(vUv.x * 63.0 - uTime * 8.0)), 7.0);
    float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
    // Foam breaks up: noise tears gaps into the band.
    float tear = smoothstep(-0.35, 0.25, snoise(vec3(vUv.x * 14.0, uTime * 1.3, uSeed)));
    float alpha = edge * across * tear * (0.4 + stripe * 0.6) * uFade * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(uColor * (0.65 + stripe) * uGlobalGlow, alpha);
  }
`;

export function createCrestMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uColor: { value: new Color(0xa6f3ff) },
      uOpacity: { value: 1 },
      uSeed: { value: 0 }
    }),
    vertexShader: RIBBON_VERTEX,
    fragmentShader: CREST_FRAGMENT
  });
  return material;
}

/* ---------------------------------------------------------------------- */
/* Spray points                                                            */
/* ---------------------------------------------------------------------- */

const SPRAY_VERTEX = /* glsl */ `
  attribute float phase;
  uniform float uTime;
  uniform float uWidth;
  uniform float uHeight;
  uniform float uRate;
  uniform float uSize;
  varying float vA;
  void main() {
    float t = fract(phase + uTime * uRate);
    // Thrown up off the lip on a parabola and carried forward with the wave.
    vec3 q = vec3(position.x * uWidth, position.y * uHeight + t * (1.0 - t) * 2.0 * uHeight, position.z * (0.2 + t * 0.7));
    vA = sin(t * 3.14159);
    vec4 mv = modelViewMatrix * vec4(q, 1.0);
    gl_PointSize = clamp(uSize * 22.0 / -mv.z, 1.0, 6.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SPRAY_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uFade;
  uniform float uOpacity;
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = (1.0 - smoothstep(0.2, 1.0, d)) * vA * uFade * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(uColor * uGlobalGlow, alpha);
  }
`;

export function createSprayMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uWidth: { value: 1 },
      uHeight: { value: 1 },
      uRate: { value: 0.7 },
      uSize: { value: 1 },
      uOpacity: { value: 1 },
      uColor: { value: new Color() }
    }),
    vertexShader: SPRAY_VERTEX,
    fragmentShader: SPRAY_FRAGMENT
  });
  return material;
}

/* ---------------------------------------------------------------------- */
/* Turn ripple                                                             */
/* ---------------------------------------------------------------------- */

const TURN_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uFade;
  uniform float uRings;
  uniform float uSeed;
  uniform vec3  uColor;
  uniform vec3  uColorFoam;
  uniform float uGlobalGlow;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;          // 0.5 .. 1 across the annulus
    float angle = atan(p.y, p.x);
    // Concentric crests travelling outward, wobbled by noise.
    float wob = snoise(vec3(cos(angle) * 2.0, sin(angle) * 2.0, uTime * 0.7 + uSeed)) * 0.04;
    float crest = pow(max(0.0, sin((r + wob) * uRings * 6.2831853 - uTime * 9.0)), 6.0);
    float bead = pow(max(0.0, sin(angle * 13.0 - uTime * 7.0)), 6.0);
    float lead = smoothstep(0.9, 1.0, r) * (1.0 - smoothstep(0.985, 1.0, r));
    float inner = smoothstep(0.5, 0.62, r);
    vec3 color = mix(uColor, uColorFoam, clamp(lead * 0.7 + bead * lead, 0.0, 1.0));
    float alpha = inner * (crest * 0.45 + lead * (0.4 + 0.6 * bead) + 0.08) * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uGlobalGlow, alpha);
  }
`;

export function createTurnMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uTime: { value: 0 },
      uRings: { value: 3 },
      uSeed: { value: 0 },
      uColor: { value: new Color() },
      uColorFoam: { value: new Color() }
    }),
    vertexShader: RIBBON_VERTEX,
    fragmentShader: TURN_FRAGMENT
  });
  return material;
}

/* ---------------------------------------------------------------------- */
/* Warp — LAYER.DISTORTION                                                 */
/* ---------------------------------------------------------------------- */

const WARP_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * vec2(uWidth, uHeight);
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    // Refraction through moving water: smooth, slow, lensing upward.
    vec3 np = vec3(c * uScale, uTime * uSpeed + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(5.2, 1.3, 9.1)));
    vec2 offset = normalize(n + vec2(0.0, 0.5) + 1e-4);
    float mask = (1.0 - smoothstep(0.5, 1.0, abs(c.x))) * smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

export function createTideWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 3 },
      uHeight: { value: 2 },
      uStrength: { value: 0.5 },
      uScale: { value: 1.4 },
      uSpeed: { value: 1.2 },
      uSeed: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });
  /** @param {object} state { width, height, strength, seed } */
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = state.width;
    u.uHeight.value = state.height;
    u.uStrength.value = state.strength * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
    u.uSeed.value = state.seed;
  };
  return material;
}
