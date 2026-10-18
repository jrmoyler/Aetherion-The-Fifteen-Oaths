import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'prismlie';

/**
 * Prism Lie — the six bespoke shaders.
 *
 *  - **crystal** (`createPrismCrystalMaterial`) — one per prism. Additive
 *    glass: a faint body of the prism's own hue, a thin-film **spectral sheen**
 *    that slides with the view angle (every facet shows a different colour, so
 *    the crystal reads as *refracting*), hot **edges** down its three arrises
 *    and round its caps, a fresnel rim, and a **glitch** in the vertex stage —
 *    horizontal slices that jump sideways on a quantised clock — which is how a
 *    prism *lies*. A dissolve with a spectral burning edge pops the false ones.
 *  - **shards** (`createPrismShardMaterial`) — the same glass on an
 *    InstancedMesh of slivers; per-instance hue and fade in `aShard`.
 *  - **tethers** (`createPrismTetherMaterial`) — three crackling threads of
 *    light strung between the prisms while they fly, each blending the two
 *    hues it joins; laid out and camera-faced in the vertex stage from the
 *    prisms' positions.
 *  - **trails** (`createPrismTrailMaterial`) — three braided streaks burnt
 *    into the floor down the line, drawn analytically from the same braid
 *    the CPU flies the prisms on (`braidLat`), so a trail is always exactly
 *    under its prism.
 *  - **spectral ring** (`createPrismRingMaterial`) — a rainbow shock ring on
 *    the floor where the true prism shatters.
 *  - **lens** (`createPrismLensMaterial`) — a camera-facing bump of bent air
 *    on `LAYER.DISTORTION`, the ring's twin.
 *
 * Every material reads `settings.prismlie` in `userData.sync()`.
 */

/** Spectral palette: 0..1 → a saturated rainbow. */
const SPECTRAL_GLSL = /* glsl */ `
  vec3 spectral(float t) {
    return clamp(0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67))), 0.0, 1.0);
  }
`;

/* ==================================================================== */
/* Crystal                                                                */
/* ==================================================================== */

const CRYSTAL_VERTEX = /* glsl */ `
  attribute vec2 aFacet;

  uniform float uTime;
  uniform float uGlitch;
  uniform float uSeed;

  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec2 vFacet;

  ${noiseGLSL}

  void main() {
    vec3 p = position;
    // The lie: horizontal slices that jump sideways on a quantised clock.
    float slice = floor((p.y + 1.0) * 6.0);
    float tick = floor(uTime * 15.0);
    float h = hash11(slice * 13.1 + tick * 7.7 + uSeed * 3.0);
    p.x += (h - 0.5) * 2.0 * uGlitch * step(0.55, h);
    vLocal = position;
    vFacet = aFacet;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CRYSTAL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColor;
  uniform vec3  uCore;
  uniform float uBody;
  uniform float uEdge;
  uniform float uEdgeWidth;
  uniform float uIrid;
  uniform float uIridFreq;
  uniform float uRim;
  uniform float uFlash;
  uniform float uDissolve;
  uniform float uOpacity;
  uniform float uSeed;

  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec2 vFacet;

  ${noiseGLSL}
  ${SPECTRAL_GLSL}

  void main() {
    // Popping: a dissolve with a burning spectral edge.
    float n = snoise(vLocal * 3.0 + uSeed) * 0.5 + 0.5;
    if (n < uDissolve) discard;
    float burn = (1.0 - smoothstep(0.0, 0.12, n - uDissolve)) * step(0.001, uDissolve);

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vN);
    float ndv = abs(dot(N, V));
    float fres = pow(1.0 - ndv, 2.5);

    // Hot arrises: the three corners (and the cap ridges, which run to them).
    float ang = atan(vLocal.z, vLocal.x) - 1.5707963;
    float k = ang / 2.0943951;
    float dc = abs(fract(k + 0.5) - 0.5) * 2.0943951 * length(vLocal.xz);
    float e1 = 1.0 - smoothstep(0.0, uEdgeWidth, dc);
    float e2 = (1.0 - smoothstep(0.0, uEdgeWidth * 0.8, abs(abs(vLocal.y) - 0.5))) * step(abs(vLocal.y), 0.52);
    float edge = max(e1, e2);

    // Thin-film sheen sliding with the view, a different colour on every facet.
    float t = vLocal.y * uIridFreq * 0.25 + ndv * 1.4 + vFacet.x * 0.13 + uTime * 0.12 + uSeed;
    vec3 film = spectral(t);
    // Internal dispersion bands climbing the body.
    float bands = 0.5 + 0.5 * sin(vLocal.y * uIridFreq * 3.0 - uTime * 3.0 + vFacet.x);

    vec3 col = uColor * uBody * (0.25 + fres * 1.5) * (0.7 + 0.3 * bands);
    col += film * uIrid * (0.15 + 0.85 * fres) * (0.6 + 0.4 * bands);
    col += mix(uColor, uCore, 0.25) * edge * uEdge;
    col += uColor * fres * uRim;
    col += uCore * uFlash;
    col += spectral(n * 2.0 + uTime) * burn * uEdge * 1.5;
    col *= uGlobalGlow * uShaderIntensity * uOpacity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** One prism's glass. Additive. */
export function createPrismCrystalMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uColor: { value: new Color() },
      uCore: { value: new Color() },
      uBody: { value: 0.5 },
      uEdge: { value: 3 },
      uEdgeWidth: { value: 0.06 },
      uIrid: { value: 1 },
      uIridFreq: { value: 3 },
      uRim: { value: 1 },
      uFlash: { value: 0 },
      uDissolve: { value: 0 },
      uOpacity: { value: 1 },
      uGlitch: { value: 0 },
      uSeed: { value: 0 }
    }),
    vertexShader: CRYSTAL_VERTEX,
    fragmentShader: CRYSTAL_FRAGMENT
  });

  /** @param {object} s { color, glitch, flash, dissolve, opacity, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uColor.value.copy(getColor(s.color));
    u.uCore.value.copy(getColor(c.colorCore));
    u.uBody.value = c.bodyGlow * g.glow;
    u.uEdge.value = c.edgeGlow * g.glow;
    u.uEdgeWidth.value = c.edgeWidth;
    u.uIrid.value = c.iridescence * g.fresnel;
    u.uIridFreq.value = c.iridFrequency * g.noiseFrequency;
    u.uRim.value = c.rimGlow * g.fresnel;
    u.uFlash.value = s.flash;
    u.uDissolve.value = s.dissolve;
    u.uOpacity.value = s.opacity * g.opacity;
    u.uGlitch.value = s.glitch;
    u.uSeed.value = s.seed;
  };

  return material;
}

/* ==================================================================== */
/* Shards                                                                 */
/* ==================================================================== */

const SHARD_VERTEX = /* glsl */ `
  attribute vec2 aFacet;
  attribute vec4 aShard;

  varying vec3 vWorld;
  varying vec3 vN;
  varying vec4 vShard;
  varying float vFacet;

  void main() {
    vShard = aShard;
    vFacet = aFacet.x;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vN = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHARD_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3  uCore;
  uniform float uGlow;
  uniform float uIrid;
  uniform float uOpacity;

  varying vec3 vWorld;
  varying vec3 vN;
  varying vec4 vShard;
  varying float vFacet;

  ${SPECTRAL_GLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vN);
    float ndv = abs(dot(N, V));
    float fres = pow(1.0 - ndv, 2.0);
    // A glint as a facet swings through the view.
    float glint = pow(ndv, 24.0) * 3.0;
    vec3 film = spectral(ndv * 1.6 + vFacet * 0.21 + uTime * 0.3 + vWorld.y * 0.2);
    vec3 col = vShard.rgb * (0.35 + fres * 1.6) * uGlow + film * uIrid * fres + uCore * glint;
    col *= vShard.a * uOpacity * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The shatter. Additive, instanced. */
export function createPrismShardMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCore: { value: new Color() },
      uGlow: { value: 1.5 },
      uIrid: { value: 1 },
      uOpacity: { value: 1 }
    }),
    vertexShader: SHARD_VERTEX,
    fragmentShader: SHARD_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uGlow.value = c.shardGlow * g.glow;
    u.uIrid.value = c.iridescence * g.fresnel;
    u.uOpacity.value = g.opacity;
  };

  return material;
}

/* ==================================================================== */
/* Tethers                                                                */
/* ==================================================================== */

const TETHER_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec3  uP0;
  uniform vec3  uP1;
  uniform vec3  uP2;
  uniform float uWidth;
  uniform float uJitter;

  varying float vS;
  varying float vAcross;
  varying float vPair;

  ${noiseGLSL}

  void main() {
    float s = position.x;
    float pair = position.z;
    vec3 A = pair < 0.5 ? uP0 : (pair < 1.5 ? uP1 : uP2);
    vec3 B = pair < 0.5 ? uP1 : (pair < 1.5 ? uP2 : uP0);
    vec3 P = mix(A, B, s);
    // Crackle: a jagged offset, re-rolled on a fast quantised clock.
    float tick = floor(uTime * 20.0);
    float env = sin(3.14159265 * s);
    P += vec3(hash11(floor(s * 9.0) + tick + pair * 17.0) - 0.5,
              hash11(floor(s * 9.0) + tick * 1.3 + pair * 5.0) - 0.5,
              hash11(floor(s * 9.0) + tick * 0.7 + pair * 11.0) - 0.5) * uJitter * env;
    vec3 viewDir = normalize(cameraPosition - P);
    vec3 side = normalize(cross(B - A + vec3(1e-5), viewDir));
    P += side * position.y * uWidth;
    vS = s;
    vAcross = position.y;
    vPair = pair;
    gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  }
`;

const TETHER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3  uC0;
  uniform vec3  uC1;
  uniform vec3  uC2;
  uniform vec3  uCore;
  uniform float uGlow;
  uniform float uStrength;

  varying float vS;
  varying float vAcross;
  varying float vPair;

  ${noiseGLSL}

  void main() {
    vec3 a = vPair < 0.5 ? uC0 : (vPair < 1.5 ? uC1 : uC2);
    vec3 b = vPair < 0.5 ? uC1 : (vPair < 1.5 ? uC2 : uC0);
    float core = exp(-vAcross * vAcross * 9.0);
    float halo = exp(-vAcross * vAcross * 2.0) * 0.35;
    // Static running along the thread, and the ends faded into the prisms.
    float flick = 0.5 + 0.5 * snoise(vec3(vS * 6.0 - uTime * 7.0, vPair * 3.0, uTime * 2.0));
    float ends = smoothstep(0.0, 0.12, vS) * smoothstep(1.0, 0.88, vS);
    vec3 col = mix(a, b, vS) * (core + halo) + uCore * core * 0.6;
    col *= uGlow * uStrength * ends * (0.35 + 0.65 * flick) * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The threads of light strung between the prisms. Additive. */
export function createPrismTetherMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uP0: { value: new Vector3() },
      uP1: { value: new Vector3() },
      uP2: { value: new Vector3() },
      uWidth: { value: 0.05 },
      uJitter: { value: 0.15 },
      uC0: { value: new Color() },
      uC1: { value: new Color() },
      uC2: { value: new Color() },
      uCore: { value: new Color() },
      uGlow: { value: 2 },
      uStrength: { value: 1 }
    }),
    vertexShader: TETHER_VERTEX,
    fragmentShader: TETHER_FRAGMENT
  });

  /** @param {object} s { p0, p1, p2, strength } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uP0.value.copy(s.p0);
    u.uP1.value.copy(s.p1);
    u.uP2.value.copy(s.p2);
    u.uWidth.value = c.tetherWidth;
    u.uJitter.value = c.tetherJitter * g.randomness;
    u.uC0.value.copy(getColor(c.colorPrismA));
    u.uC1.value.copy(getColor(c.colorPrismB));
    u.uC2.value.copy(getColor(c.colorPrismC));
    u.uCore.value.copy(getColor(c.colorCore));
    u.uGlow.value = c.tetherGlow * g.glow;
    u.uStrength.value = s.strength * g.opacity;
  };

  return material;
}

/* ==================================================================== */
/* Trails                                                                 */
/* ==================================================================== */

/**
 * The braid — the GPU twin of `PrismLieAbility#_braidLat`. Keep them together.
 * Lateral offset of prism `i` at `d` metres down the line.
 */
const BRAID_GLSL = /* glsl */ `
  float braidLat(float d, float i, float width, float pitch, float ramp) {
    float env = smoothstep(0.0, ramp, d);
    return width * env * sin(6.2831853 * d / max(pitch, 0.1) + i * 2.0943951);
  }
`;

const TRAIL_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uSpan;

  varying vec2 vS;

  void main() {
    float along = position.x * uLength;
    float across = position.z * uSpan;
    vec3 world = uStart + uDir * along + uSide * across;
    world.y = 0.018;
    vS = vec2(along, across);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uFront;
  uniform float uBraidWidth;
  uniform float uBraidPitch;
  uniform float uRamp;
  uniform float uLineWidth;
  uniform float uGlow;
  uniform float uDecay;     // metres behind the front over which a trail dims
  uniform float uFade;      // 0..1, the whole thing burning out
  uniform float uTruth;     // which prism is the true one (0, 1, 2)
  uniform float uReveal;    // 0..1 — after the reveal, only the truth's trail stays
  uniform vec3  uC0;
  uniform vec3  uC1;
  uniform vec3  uC2;
  uniform vec3  uCore;

  varying vec2 vS;

  ${noiseGLSL}
  ${BRAID_GLSL}
  ${SPECTRAL_GLSL}

  float lineAt(float i, float d, float y) {
    float lat = braidLat(d, i, uBraidWidth, uBraidPitch, uRamp);
    float dist = abs(y - lat);
    return exp(-dist * dist / max(uLineWidth * uLineWidth, 1e-5));
  }

  void main() {
    float d = vS.x;
    if (d > uFront) discard;
    float age = clamp((uFront - d) / max(uDecay, 0.1), 0.0, 1.0);
    float live = (1.0 - age * 0.7) * (1.0 - uFade);
    float shimmer = 0.75 + 0.25 * snoise(vec3(d * 2.0 - uTime * 3.0, vS.y * 4.0, 0.0));

    float l0 = lineAt(0.0, d, vS.y) * mix(1.0, step(abs(uTruth - 0.0), 0.1), uReveal);
    float l1 = lineAt(1.0, d, vS.y) * mix(1.0, step(abs(uTruth - 1.0), 0.1), uReveal);
    float l2 = lineAt(2.0, d, vS.y) * mix(1.0, step(abs(uTruth - 2.0), 0.1), uReveal);
    vec3 col = uC0 * l0 + uC1 * l1 + uC2 * l2;
    // Where the strands cross, the light adds up to white.
    col += uCore * max(0.0, l0 + l1 + l2 - 1.0) * 0.8;
    // A faint spectral smear between them.
    col += spectral(vS.y * 0.6 + d * 0.1) * exp(-vS.y * vS.y / max(uBraidWidth * uBraidWidth, 0.01)) * 0.08;
    col *= uGlow * live * shimmer * smoothstep(0.0, 0.8, d) * uGlobalGlow * uShaderIntensity;
    if (dot(col, vec3(1.0)) < 0.002) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The braided streaks down the line. Additive. */
export function createPrismTrailMaterial() {
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
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uSpan: { value: 2 },
      uFront: { value: 0 },
      uBraidWidth: { value: 1 },
      uBraidPitch: { value: 4 },
      uRamp: { value: 2 },
      uLineWidth: { value: 0.08 },
      uGlow: { value: 1 },
      uDecay: { value: 8 },
      uFade: { value: 0 },
      uTruth: { value: 0 },
      uReveal: { value: 0 },
      uC0: { value: new Color() },
      uC1: { value: new Color() },
      uC2: { value: new Color() },
      uCore: { value: new Color() }
    }),
    vertexShader: TRAIL_VERTEX,
    fragmentShader: TRAIL_FRAGMENT
  });

  /** @param {object} s { start, dir, side, length, front, fade, truth, reveal } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(s.start);
    u.uDir.value.copy(s.dir);
    u.uSide.value.copy(s.side);
    u.uLength.value = s.length;
    u.uSpan.value = Math.max(0.3, c.braidWidth + c.trailWidth * 4 + 0.3);
    u.uFront.value = s.front;
    u.uBraidWidth.value = c.braidWidth;
    u.uBraidPitch.value = c.braidPitch;
    u.uRamp.value = c.braidRamp;
    u.uLineWidth.value = c.trailWidth;
    u.uGlow.value = c.trailGlow * g.glow;
    u.uDecay.value = c.trailDecay;
    u.uFade.value = s.fade;
    u.uTruth.value = s.truth;
    u.uReveal.value = s.reveal;
    u.uC0.value.copy(getColor(c.colorPrismA));
    u.uC1.value.copy(getColor(c.colorPrismB));
    u.uC2.value.copy(getColor(c.colorPrismC));
    u.uCore.value.copy(getColor(c.colorCore));
  };

  return material;
}

/* ==================================================================== */
/* The spectral ring                                                      */
/* ==================================================================== */

const RING_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + position.x * uSize, 0.03, uCentre.z + position.y * uSize, 1.0);
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uProgress;
  uniform float uWidth;
  uniform float uGlow;
  uniform float uSeed;
  uniform vec3  uCore;

  varying vec2 vP;

  ${noiseGLSL}
  ${SPECTRAL_GLSL}

  void main() {
    float r = length(vP);
    if (r > 1.0) discard;
    float R = 0.05 + 0.95 * (1.0 - pow(1.0 - uProgress, 2.5));
    float w = uWidth * (1.0 - 0.5 * uProgress);
    float d = (r - R) / max(w, 1e-3);
    float band = exp(-d * d);
    // A rainbow across the ring's width — red outside, violet in.
    vec3 col = spectral(0.62 - clamp(d * 0.25 + 0.5, 0.0, 1.0) * 0.75) * band;
    col += uCore * exp(-d * d * 6.0) * 0.6;
    // Broken into facets, like light through cut glass.
    float ang = atan(vP.y, vP.x);
    float facets = 0.6 + 0.4 * step(0.35, hash11(floor(ang * 7.0) + uSeed));
    col *= facets * uGlow * (1.0 - uProgress) * uGlobalGlow * uShaderIntensity;
    if (dot(col, vec3(1.0)) < 0.002) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The rainbow ring where the truth lands. Additive. */
export function createPrismRingMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uSize: { value: 5 },
      uProgress: { value: 0 },
      uWidth: { value: 0.08 },
      uGlow: { value: 2 },
      uSeed: { value: 0 },
      uCore: { value: new Color() }
    }),
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT
  });

  /** @param {object} s { centre, progress, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uSize.value = Math.max(0.2, c.ringRadius * g.explosionIntensity);
    u.uProgress.value = s.progress;
    u.uWidth.value = c.ringWidth;
    u.uGlow.value = c.ringGlow * g.glow;
    u.uSeed.value = s.seed;
    u.uCore.value.copy(getColor(c.colorCore));
  };

  return material;
}

/* ==================================================================== */
/* The lens                                                               */
/* ==================================================================== */

const LENS_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vUv = position.xy;
    // Camera-facing: the view matrix's rows are the camera's axes.
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCentre + (right * position.x + up * position.y) * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float R = 0.1 + 0.85 * uProgress;
    float d = (r - R) / 0.18;
    float slope = -d * exp(-d * d);
    vec2 dir = vUv / max(r, 1e-4);
    float mask = exp(-d * d) * (1.0 - uProgress);
    float s = uStrength * uShaderIntensity * mask;
    if (s < 0.002) discard;
    gl_FragColor = vec4(dir * clamp(slope * 2.0, -1.0, 1.0) * 0.5 + 0.5, s, mask);
  }
`;

/** The bent air at the shatter. LAYER.DISTORTION — see `createAcidFumeMaterial`. */
export function createPrismLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uSize: { value: 3 },
      uProgress: { value: 0 },
      uStrength: { value: 0 }
    }),
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} s { centre, progress } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uSize.value = c.lensSize;
    u.uProgress.value = s.progress;
    u.uStrength.value = s.progress < 1 ? c.lensStrength * g.distortion : 0;
  };

  return material;
}
