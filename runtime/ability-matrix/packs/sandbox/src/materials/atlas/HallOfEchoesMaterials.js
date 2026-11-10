import { AdditiveBlending, Color, DoubleSide, FrontSide, MeshStandardMaterial, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { SKINNING_PARS, SKINNING_MAIN } from '../../assets/atlas/ChronoRecallRig.js';

/**
 * The five bespoke surfaces of the Hall of Echoes.
 *
 *   - `createEchoHoloMaterial`   — a holographic copy of the caster: the real
 *     rig, skinned and animated, drawn as projected light. Assembles from
 *     horizontal slices that slide in from the side bottom-up behind a hot
 *     build line; scanlines crawling up the body, a fresnel rim, horizontal
 *     glitch tears that jump on a quantised clock, pixel dropout, and a
 *     chromatic fringe on the rim.
 *   - `createEchoDaisMaterial`   — the projector circle on the floor: bezel
 *     rings, a segmented ring turning against the orbit, three emitter nodes
 *     that track the copies, a hex lattice and a radial scan.
 *   - `createEchoBeamMaterial`   — the projector cone from each floor node up
 *     into its copy.
 *   - `createEchoMirrorMaterial` — the shattered copies: instanced faceted
 *     mirror shards reflecting the stage's sky (`frame.uEnvMap`), with a
 *     silvered rim, a hologram-coloured fresnel and a per-shard glint.
 *   - `createEchoWarpMaterial`   — LAYER.DISTORTION: a *cracked-glass* lens.
 *     Each voronoi cell writes its own constant offset, so for a moment the
 *     frame itself looks broken into panes; a ring front carries it outward.
 *
 * All read `settings.echoes` through `userData.sync`, every frame.
 */

const ENV_GLSL = /* glsl */ `
  vec2 echoEquirect(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* ==================================================================== */
/* The holograms                                                         */
/* ==================================================================== */

const HOLO_VERTEX = /* glsl */ `
  ${SKINNING_PARS}

  uniform float uTime;
  uniform float uHeight;
  uniform vec3  uBase;        // the copy's feet, world
  uniform vec3  uSide;        // unit, flat: the direction slices slide in from
  uniform float uAssemble;    // 0 nothing .. 1 whole
  uniform float uSlices;
  uniform float uSlideIn;     // metres a slice starts out displaced
  uniform float uGlitch;      // 0..1 how torn it is right now
  uniform float uGlitchBands;
  uniform float uGlitchRate;
  uniform float uGlitchShift; // metres a torn band jumps
  uniform float uSeed;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vH;
  varying float vK;
  varying float vTear;

  ${noiseGLSL}

  void main() {
    ${SKINNING_MAIN}

    vec4 world = modelMatrix * vec4(transformed, 1.0);
    vec3 nW = normalize(mat3(modelMatrix) * objectNormal);
    float h = clamp((world.y - uBase.y) / max(uHeight, 0.1), 0.0, 1.1);

    // Bottom-up, slice by slice, each a little early or late.
    float slice = floor(h * uSlices);
    float rnd = hash11(slice * 3.17 + uSeed * 11.0);
    float reveal = h * 0.82 + rnd * 0.12;
    float k = clamp((uAssemble * 1.06 - reveal) / 0.12, 0.0, 1.0);
    float ek = 1.0 - (1.0 - k) * (1.0 - k) * (1.0 - k);
    world.xyz += uSide * (1.0 - ek) * uSlideIn * (rnd * 2.0 - 1.0);
    world.y += (1.0 - ek) * 0.12;

    // Tears: a band chosen afresh on every tick of a quantised clock.
    float tick = floor(uTime * uGlitchRate);
    float band = floor(h * uGlitchBands);
    float pick = hash11(band * 7.7 + tick * 1.31 + uSeed * 5.0);
    float tear = step(1.0 - uGlitch * 0.6, pick) * (hash11(band + tick * 3.3) * 2.0 - 1.0);
    world.xyz += uSide * tear * uGlitchShift;

    vWorld = world.xyz;
    vNormalW = nW;
    vH = h;
    vK = k;
    vTear = abs(tear);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HOLO_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uAssemble;
  uniform float uFade;
  uniform float uFlash;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFill;
  uniform float uFresnel;
  uniform float uFresnelPower;
  uniform float uScanDensity;
  uniform float uScanSpeed;
  uniform float uScanStrength;
  uniform float uDropout;
  uniform float uFlicker;
  uniform float uFringe;
  uniform float uBuildGlow;
  uniform vec3  uColorLow;
  uniform vec3  uColorHigh;
  uniform vec3  uColorRim;
  uniform vec3  uColorBuild;
  uniform float uGlobalGlow;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vH;
  varying float vK;
  varying float vTear;

  ${noiseGLSL}

  void main() {
    if (vK <= 0.001) discard;

    // Pixel dropout, re-rolled a dozen times a second.
    vec2 cell = floor(gl_FragCoord.xy / 3.0);
    float drop = hash13(vec3(cell, floor(uTime * 12.0) + uSeed));
    if (drop < uDropout * (0.4 + vTear)) discard;

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    float ndv = abs(dot(N, V));
    float rim = pow(1.0 - ndv, uFresnelPower) * uFresnel;

    float scan = 0.5 + 0.5 * sin(vWorld.y * uScanDensity - uTime * uScanSpeed);
    scan = mix(1.0, pow(scan, 3.0) * 1.6, uScanStrength);
    float fine = 0.85 + 0.15 * sin(gl_FragCoord.y * 1.7);

    float flick = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 37.0 + uSeed * 3.0)) * step(0.6, hash11(floor(uTime * 9.0) + uSeed));

    vec3 base = mix(uColorLow, uColorHigh, clamp(vH, 0.0, 1.0));
    vec3 color = base * uFill * scan * fine;
    // A chromatic fringe: the rim splits toward its two hues.
    vec3 fringe = vec3(1.0 + uFringe, 1.0 - uFringe * 0.5, 1.0 + uFringe * 0.6);
    color += uColorRim * rim * fringe;
    color += uColorRim * vTear * 1.5;

    // The build line: a hot slice where the copy is still arriving.
    float building = (1.0 - vK);
    color += uColorBuild * building * uBuildGlow;

    color *= uGlow * uGlobalGlow * flick * (1.0 + uFlash * 3.0);
    float alpha = (uFill * 0.4 * scan + rim + building * 0.8 + vTear * 0.5) * uOpacity * uFade * vK;
    alpha = clamp(alpha, 0.0, 1.0);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

/** One per copy. */
export function createEchoHoloMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHeight: { value: 1.78 },
      uBase: { value: new Vector3() },
      uSide: { value: new Vector3(1, 0, 0) },
      uAssemble: { value: 0 },
      uSlices: { value: 24 },
      uSlideIn: { value: 0.6 },
      uGlitch: { value: 0 },
      uGlitchBands: { value: 18 },
      uGlitchRate: { value: 14 },
      uGlitchShift: { value: 0.08 },
      uSeed: { value: 0 },
      uFade: { value: 1 },
      uFlash: { value: 0 },
      uGlow: { value: 1 },
      uOpacity: { value: 1 },
      uFill: { value: 0.5 },
      uFresnel: { value: 1.5 },
      uFresnelPower: { value: 2 },
      uScanDensity: { value: 60 },
      uScanSpeed: { value: 3 },
      uScanStrength: { value: 0.6 },
      uDropout: { value: 0.1 },
      uFlicker: { value: 0.2 },
      uFringe: { value: 0.3 },
      uBuildGlow: { value: 3 },
      uColorLow: { value: new Color() },
      uColorHigh: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorBuild: { value: new Color() }
    }),
    vertexShader: HOLO_VERTEX,
    fragmentShader: HOLO_FRAGMENT
  });

  /** @param {object} state { base, side, assemble, glitch, fade, flash, seed, height } */
  material.userData.sync = (state) => {
    const c = settings.echoes;
    const g = settings.global;
    const u = material.uniforms;
    u.uHeight.value = state.height;
    u.uBase.value.copy(state.base);
    u.uSide.value.copy(state.side);
    u.uAssemble.value = state.assemble;
    u.uGlitch.value = Math.min(1, state.glitch * g.randomness);
    u.uFade.value = state.fade;
    u.uFlash.value = state.flash;
    u.uSeed.value = state.seed;
    u.uSlices.value = Math.max(1, Math.round(c.holoSlices));
    u.uSlideIn.value = c.holoSlideIn;
    u.uGlitchBands.value = Math.max(1, Math.round(c.glitchBands));
    u.uGlitchRate.value = c.glitchRate * g.animationSpeed;
    u.uGlitchShift.value = c.glitchShift;
    u.uGlow.value = c.holoGlow * g.glow;
    u.uOpacity.value = c.holoOpacity * g.opacity;
    u.uFill.value = c.holoFill;
    u.uFresnel.value = c.holoFresnel * g.fresnel;
    u.uFresnelPower.value = c.holoFresnelPower;
    u.uScanDensity.value = c.scanDensity * g.noiseFrequency;
    u.uScanSpeed.value = c.scanSpeed * g.noiseSpeed;
    u.uScanStrength.value = c.scanStrength * g.shaderIntensity;
    u.uDropout.value = c.holoDropout;
    u.uFlicker.value = c.holoFlicker;
    u.uFringe.value = c.holoFringe;
    u.uBuildGlow.value = c.buildGlow;
    u.uColorLow.value.copy(getColor(c.colorHoloLow));
    u.uColorHigh.value.copy(getColor(c.colorHoloHigh));
    u.uColorRim.value.copy(getColor(c.colorHoloRim));
    u.uColorBuild.value.copy(getColor(c.colorBuild));
  };

  return material;
}

/* ==================================================================== */
/* The dais                                                              */
/* ==================================================================== */

const DAIS_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vP;
  varying vec3 vWorld;
  varying float vViewZ;
  void main() {
    vP = position.xz * 2.0;   // -1..1
    vec4 world = modelMatrix * vec4(position * vec3(uSize, 1.0, uSize), 1.0);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const DAIS_FRAGMENT = /* glsl */ `
  #define TAU 6.28318530718
  uniform float uTime;
  uniform float uReveal;      // 0..1 unfurl
  uniform float uFade;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uOrbit;       // orbit radius, × dais radius
  uniform vec3  uNodes;       // the three copies' angles
  uniform float uNodeGlow;
  uniform float uSpin;
  uniform float uHex;
  uniform float uSweep;
  uniform float uPulse;
  uniform vec3  uColorRing;
  uniform vec3  uColorNode;
  uniform vec3  uColorHex;
  uniform float uGlobalGlow;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;

  varying vec2 vP;
  varying vec3 vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  float band(float x, float a, float b, float w) {
    return smoothstep(a - w, a, x) * (1.0 - smoothstep(b, b + w, x));
  }

  float hexGrid(vec2 p) {
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    vec2 q = abs(g);
    float d = max(dot(q, normalize(vec2(1.0, 1.7320508))), q.x);
    return smoothstep(0.43, 0.5, d);
  }

  void main() {
    float r = length(vP);
    if (r > 1.0) discard;
    float a = atan(vP.y, vP.x);
    float aa = fwidth(r) * 1.5 + 1e-4;

    // Unfurls from the centre out.
    float shown = 1.0 - smoothstep(uReveal - 0.05, uReveal, r);
    if (shown < 0.003) discard;

    float rings = band(r, 0.95, 0.965, aa) + band(r, 0.9, 0.905, aa) * 0.6;
    float orbitRing = band(r, uOrbit - 0.006, uOrbit + 0.006, aa) * 0.7;
    float segA = fract((a - uTime * uSpin) / TAU * 12.0);
    float seg = band(r, 0.8, 0.84, aa) * step(0.2, segA) * step(segA, 0.8);
    float hex = (1.0 - hexGrid(vP * 9.0)) * (1.0 - smoothstep(0.75, 0.9, r)) * uHex;

    // A radial scan sweeping round.
    float sw = fract((a - uTime * uSweep) / TAU);
    float sweep = pow(sw, 10.0) * (1.0 - smoothstep(0.85, 0.95, r)) * 0.8;

    // Emitter nodes under the copies, with a spoke to the centre.
    float nodes = 0.0;
    for (int i = 0; i < 3; i++) {
      float ang = i == 0 ? uNodes.x : (i == 1 ? uNodes.y : uNodes.z);
      vec2 c = vec2(cos(ang), sin(ang)) * uOrbit;
      float d = length(vP - c);
      nodes += (1.0 - smoothstep(0.035, 0.035 + aa, d)) + band(d, 0.07, 0.08, aa) * 0.8 + exp(-d * 18.0) * 0.4;
      vec2 dir = c / max(length(c), 1e-4);
      float t = clamp(dot(vP, dir), 0.0, uOrbit);
      float spoke = (1.0 - smoothstep(0.0, 0.006 + aa, length(vP - dir * t))) * 0.35;
      nodes += spoke;
    }

    float pulse = 0.85 + 0.15 * sin(uTime * 6.0) + uPulse;
    vec3 color = uColorRing * (rings + orbitRing + seg + sweep) * pulse
               + uColorNode * nodes * uNodeGlow
               + uColorHex * hex * 0.35;
    float e = rings + orbitRing + seg + sweep + nodes + hex * 0.35;

    vec2 screenUV = gl_FragCoord.xy / uResolution;
    float alpha = clamp(e, 0.0, 1.0) * shown * uOpacity * uFade;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.1);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uGlow * uGlobalGlow, alpha);
  }
`;

export function createEchoDaisMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 6 },
      uReveal: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1 },
      uOpacity: { value: 1 },
      uOrbit: { value: 0.7 },
      uNodes: { value: new Vector3() },
      uNodeGlow: { value: 2 },
      uSpin: { value: 0.5 },
      uHex: { value: 0.5 },
      uSweep: { value: 1 },
      uPulse: { value: 0 },
      uColorRing: { value: new Color() },
      uColorNode: { value: new Color() },
      uColorHex: { value: new Color() }
    }),
    vertexShader: DAIS_VERTEX,
    fragmentShader: DAIS_FRAGMENT
  });

  /** @param {object} state { size, reveal, fade, orbit, nodes, pulse } */
  material.userData.sync = (state) => {
    const c = settings.echoes;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = state.size;
    u.uReveal.value = state.reveal;
    u.uFade.value = state.fade;
    u.uOrbit.value = state.orbit;
    u.uNodes.value.copy(state.nodes);
    u.uPulse.value = state.pulse;
    u.uGlow.value = c.daisGlow * g.glow;
    u.uOpacity.value = c.daisOpacity * g.opacity;
    u.uNodeGlow.value = c.daisNodeGlow;
    u.uSpin.value = c.daisSpin * g.animationSpeed;
    u.uHex.value = c.daisHex;
    u.uSweep.value = c.daisSweep * g.animationSpeed;
    u.uColorRing.value.copy(getColor(c.colorDais));
    u.uColorNode.value.copy(getColor(c.colorHoloRim));
    u.uColorHex.value.copy(getColor(c.colorHoloLow));
  };

  return material;
}

/* ==================================================================== */
/* The projector beams                                                   */
/* ==================================================================== */

const BEAM_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uGlow;
  uniform float uBands;
  uniform float uSpeed;
  uniform float uSeed;
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  ${noiseGLSL}

  void main() {
    if (uStrength < 0.003) discard;
    float y = vUv.y;                                  // 0 at the floor node, 1 at the top
    vec3 V = normalize(cameraPosition - vWorld);
    // Soft at the silhouette, brightest looking through the cone.
    float face = pow(abs(dot(normalize(vNormalW), V)), 1.5);
    float bands = 0.6 + 0.4 * sin(y * uBands - uTime * uSpeed);
    float streak = snoise(vec3(vUv.x * 24.0, y * 2.0 - uTime * 1.5, uSeed)) * 0.5 + 0.5;
    float fall = (1.0 - y) * (1.0 - y) * 0.8 + 0.2 * (1.0 - smoothstep(0.85, 1.0, y));
    float e = face * bands * mix(0.6, 1.2, streak) * fall * uStrength;
    if (e < 0.003) discard;
    gl_FragColor = vec4(uColor * uGlow * uGlobalGlow, clamp(e, 0.0, 1.0));
  }
`;

export function createEchoBeamMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStrength: { value: 0 },
      uGlow: { value: 1 },
      uBands: { value: 30 },
      uSpeed: { value: 6 },
      uSeed: { value: 0 },
      uColor: { value: new Color() }
    }),
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT
  });

  /** @param {object} state { strength, seed } */
  material.userData.sync = (state) => {
    const c = settings.echoes;
    const g = settings.global;
    const u = material.uniforms;
    u.uStrength.value = state.strength * c.beamOpacity * g.opacity;
    u.uSeed.value = state.seed;
    u.uGlow.value = c.beamGlow * g.glow;
    u.uBands.value = c.beamBands;
    u.uSpeed.value = c.beamSpeed * g.noiseSpeed;
    u.uColor.value.copy(getColor(c.colorBeam));
  };

  return material;
}

/* ==================================================================== */
/* The mirror shards                                                     */
/* ==================================================================== */

const MIRROR_VERTEX = /* glsl */ `
  attribute float aEdge;
  attribute vec3  aShard;     // fade, glint, seed
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vEdge;
  varying vec3  vShard;
  void main() {
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 world = modelMatrix * local;
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vEdge = aEdge;
    vShard = aShard;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const MIRROR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uReflect;
  uniform float uFresnel;
  uniform float uTint;
  uniform float uEdgeGlow;
  uniform float uGlint;
  uniform float uOpacity;
  uniform float uGlow;
  uniform vec3  uColorMirror;
  uniform vec3  uColorEdge;
  uniform vec3  uColorHolo;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vEdge;
  varying vec3  vShard;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    float fade = vShard.x;
    if (fade < 0.003) discard;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);

    vec3 env = texture2D(uEnvMap, echoEquirect(reflect(-V, N))).rgb;
    float fres = pow(1.0 - ndv, 4.0) * uFresnel;
    vec3 L = normalize(uLightDir);
    float spec = pow(clamp(dot(reflect(-L, N), V), 0.0, 1.0), 80.0);

    vec3 color = env * uColorMirror * uReflect;
    // Still part illusion: the hologram's hue lives in the grazing angles.
    color += uColorHolo * (fres + uTint * 0.3);
    color += vec3(1.0) * spec * 2.0;
    // Silvered rim where the mirror was broken.
    float edge = smoothstep(0.8, 1.0, vEdge);
    color += uColorEdge * edge * uEdgeGlow;
    // Catching the light as it turns.
    color += uColorEdge * vShard.y * uGlint * 3.0;

    color *= uGlow * mix(1.0, uGlobalGlow, 0.5);
    float alpha = clamp((0.75 + fres * 0.25 + edge * 0.3) * uOpacity * fade, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createEchoMirrorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uReflect: { value: 1 },
      uFresnel: { value: 1 },
      uTint: { value: 0.3 },
      uEdgeGlow: { value: 2 },
      uGlint: { value: 1 },
      uOpacity: { value: 1 },
      uGlow: { value: 1 },
      uColorMirror: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorHolo: { value: new Color() }
    }),
    vertexShader: MIRROR_VERTEX,
    fragmentShader: MIRROR_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.echoes;
    const g = settings.global;
    const u = material.uniforms;
    u.uReflect.value = c.mirrorReflect;
    u.uFresnel.value = c.mirrorFresnel * g.fresnel;
    u.uTint.value = c.mirrorTint;
    u.uEdgeGlow.value = c.mirrorEdgeGlow * g.glow;
    u.uGlint.value = c.mirrorGlint;
    u.uOpacity.value = c.mirrorOpacity * g.opacity;
    u.uGlow.value = c.mirrorGlow;
    u.uColorMirror.value.copy(getColor(c.colorMirror));
    u.uColorEdge.value.copy(getColor(c.colorMirrorEdge));
    u.uColorHolo.value.copy(getColor(c.colorHoloRim));
  };

  return material;
}

/* ==================================================================== */
/* The cracked-glass lens                                                */
/* ==================================================================== */

const WARP_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy * 2.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  #define TAU 6.28318530718
  uniform float uStrength;
  uniform float uFront;
  uniform float uWidth;
  uniform float uCells;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    if (r > 1.0) discard;
    // Panes: every cell bends the frame by its own constant amount.
    vec2 cell = voronoi2(vP * uCells + uSeed);
    float ang = cell.y * TAU;
    vec2 pane = vec2(cos(ang), sin(ang));
    vec2 radial = r > 1e-3 ? vP / r : vec2(1.0, 0.0);
    vec2 dir = normalize(mix(radial, pane, 0.65));
    float d = r - uFront;
    float window = exp(-(d * d) / max(uWidth, 1e-3)) * (1.0 - smoothstep(0.85, 1.0, r));
    // The cracks themselves refract hardest.
    float crack = 1.0 - smoothstep(0.0, 0.08, cell.x);
    float strength = uStrength * uShaderIntensity * window * (0.6 + crack * 0.8);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, window);
  }
`;

export function createEchoWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 2 },
      uStrength: { value: 0 },
      uFront: { value: 0.5 },
      uWidth: { value: 0.08 },
      uCells: { value: 4 },
      uSeed: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} state { size, strength, front, width, seed } */
  material.userData.sync = (state) => {
    const u = material.uniforms;
    u.uSize.value = state.size;
    u.uStrength.value = state.strength * settings.global.distortion;
    u.uFront.value = state.front;
    u.uWidth.value = state.width;
    u.uCells.value = settings.echoes.warpCells;
    u.uSeed.value = state.seed;
  };

  return material;
}

/* ==================================================================== */
/* The hall: mirror panes (solid, lit)                                   */
/* ==================================================================== */

/**
 * The panes of the hall are *glass and silver*, so they are lit matter: a
 * `MeshStandardMaterial` (metal, near-mirror roughness, on `LAYER.WORLD`,
 * casting shadows) that reflects the sky probe and the sun like a real
 * looking-glass, tinted faintly by the hologram's colour. Patched on top, in
 * the emissive term, measured on the pane's own face (`position.xy`, metres):
 *
 *  - a **silvered rim** following the round arch (analytic distance to the
 *    outline), hot white at the edge falling to the hologram colour;
 *  - **scanlines** creeping up the glass while the hall is live — the panes
 *    are projected too;
 *  - **cracks**: F2−F1 voronoi plates whose seams light up as `crack` rises,
 *    a pane at a time, just before the hall breaks.
 */
export function createEchoPanelMaterial() {
  const material = new MeshStandardMaterial({
    color: 0xe8dcff,
    metalness: 1,
    roughness: 0.06,
    envMapIntensity: 1.3
  });
  const extra = {
    uPaneW: { value: 0.6 },
    uPaneSpring: { value: 2.3 },
    uRimGlow: { value: 1 },
    uRimWidth: { value: 0.06 },
    uScan: { value: 0.3 },
    uScanDensity: { value: 20 },
    uCrack: { value: 0 },
    uCrackCells: { value: 3 },
    uCrackGlow: { value: 3 },
    uLive: { value: 1 },
    uRimColor: { value: new Color() },
    uHoloColor: { value: new Color() },
    uCoreColor: { value: new Color(1, 1, 1) }
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = frame.uTime;
    Object.assign(shader.uniforms, extra);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPane;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPane = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPane;
        uniform float uTime;
        uniform float uPaneW;
        uniform float uPaneSpring;
        uniform float uRimGlow;
        uniform float uRimWidth;
        uniform float uScan;
        uniform float uScanDensity;
        uniform float uCrack;
        uniform float uCrackCells;
        uniform float uCrackGlow;
        uniform float uLive;
        uniform vec3  uRimColor;
        uniform vec3  uHoloColor;
        uniform vec3  uCoreColor;
        vec2 paneHash(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return fract(sin(p) * 43758.5453);
        }
        vec3 paneCrack(vec2 p) {
          vec2 n = floor(p); vec2 f = fract(p);
          float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 r = g + paneHash(n + g) - f;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; id = n + g; } else if (d < d2) { d2 = d; }
          }
          return vec3(sqrt(d2) - sqrt(d1), paneHash(id + 3.7));
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec2 q = vPane.xy;
          float dist = q.y < uPaneSpring ? uPaneW - abs(q.x) : uPaneW - length(q - vec2(0.0, uPaneSpring));
          float rim = exp(-max(dist, 0.0) / max(uRimWidth, 1e-3));
          float scan = pow(0.5 + 0.5 * sin(q.y * uScanDensity * 6.2831853 - uTime * 3.0), 6.0) * uScan * uLive;
          vec3 ck = paneCrack(q * uCrackCells);
          float seam = (1.0 - smoothstep(0.0, 0.05, ck.x)) * step(ck.y, uCrack * 1.4);
          totalEmissiveRadiance += mix(uRimColor, uCoreColor, rim * rim) * rim * uRimGlow * uLive
            + uHoloColor * scan
            + mix(uHoloColor, uCoreColor, 0.6) * seam * uCrackGlow;
        }`
      );
  };
  material.customProgramCacheKey = () => 'echoes-pane';

  /** @param {object} s { width, height, crack, live } */
  material.userData.sync = (s) => {
    const c = settings.echoes;
    const g = settings.global;
    material.color.copy(getColor(c.colorPane));
    material.roughness = c.paneRoughness;
    material.metalness = c.paneMetalness;
    extra.uPaneW.value = s.width * 0.5;
    extra.uPaneSpring.value = Math.max(0.05, s.height - s.width * 0.5);
    extra.uRimGlow.value = c.paneRimGlow * g.glow;
    extra.uRimWidth.value = c.paneRimWidth;
    extra.uScan.value = c.paneScan * g.glow;
    extra.uScanDensity.value = c.paneScanDensity;
    extra.uCrack.value = s.crack;
    extra.uCrackCells.value = c.paneCrackCells;
    extra.uCrackGlow.value = c.paneCrackGlow * g.glow;
    extra.uLive.value = s.live;
    extra.uRimColor.value.copy(getColor(c.colorHoloRim));
    extra.uHoloColor.value.copy(getColor(c.colorHoloHigh));
  };
  return material;
}

/* ==================================================================== */
/* The hall floor: black glass (the deep tone)                           */
/* ==================================================================== */

/**
 * Under the projector circle, a disc of **black polished glass** drawn with
 * normal blending, so the zone gets its deep tone: the floor of the hall,
 * mirroring the sky faintly through a slow ripple, its edge a soft fall-off
 * into the real floor. When the hall breaks, the floor **cracks** with it —
 * radial seams out from the centre and voronoi plates, hot in the hologram's
 * colour, cooling through the fade. It outlives the copies.
 */
const FLOOR_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vP;
  varying vec3 vWorld;
  void main() {
    vP = position.xz * 2.0;
    vec4 world = modelMatrix * vec4(position * vec3(uSize, 1.0, uSize), 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uFade;
  uniform float uOpacity;
  uniform float uSky;
  uniform float uCrack;      // 0..1 how far the cracks have run out
  uniform float uHeat;       // 0..1 how hot they still are
  uniform float uCrackGlow;
  uniform float uSeed;
  uniform vec3  uDeep;
  uniform vec3  uTint;
  uniform vec3  uHot;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;
  varying vec2 vP;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${ENV_GLSL}

  float floorCrack(vec2 p) {
    vec2 n = floor(p); vec2 f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)) + uSeed);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
    return sqrt(d2) - sqrt(d1);
  }

  void main() {
    float r = length(vP);
    float a = atan(vP.y, vP.x);
    float shore = 1.0 + 0.04 * snoise(vec3(cos(a), sin(a), uSeed));
    if (r > shore) discard;
    float shown = 1.0 - smoothstep(uReveal - 0.08, uReveal, r);
    float fill = (1.0 - smoothstep(0.82 * shore, shore, r)) * shown;
    if (fill < 0.003) discard;

    vec3 V = normalize(cameraPosition - vWorld);
    vec2 wob = vec2(snoise(vec3(vWorld.xz * 0.8, uTime * 0.4)), snoise(vec3(vWorld.zx * 0.8, uTime * 0.4 + 5.0))) * 0.06;
    vec3 R = reflect(-V, normalize(vec3(wob.x, 1.0, wob.y)));
    vec3 sky = texture2D(uEnvMap, echoEquirect(R)).rgb;
    sky = sky / (1.0 + sky);
    float grazing = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.0);
    vec3 col = uDeep + sky * uTint * uSky * (0.3 + 0.9 * grazing);

    // The cracks, run out from the centre.
    float plates = 1.0 - smoothstep(0.0, 0.05, floorCrack(vP * 4.0));
    float spokes = 1.0 - smoothstep(0.0, 0.05, abs(sin(a * 6.0 + snoise(vec3(vP * 2.0, uSeed)) * 1.2)));
    float crack = max(plates, spokes * 0.8) * (1.0 - smoothstep(uCrack - 0.1, uCrack, r)) * step(0.01, uCrack);
    col += uHot * crack * (0.15 + uHeat * uCrackGlow) * uGlobalGlow;
    col = mix(col, col + uTint * 0.15, crack * 0.5);

    float alpha = clamp(fill * uOpacity + crack * 0.3, 0.0, 1.0) * uFade;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createEchoFloorMaterial() {
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
      uSize: { value: 6 },
      uReveal: { value: 0 },
      uFade: { value: 1 },
      uOpacity: { value: 0.8 },
      uSky: { value: 0.5 },
      uCrack: { value: 0 },
      uHeat: { value: 0 },
      uCrackGlow: { value: 2 },
      uSeed: { value: 0 },
      uDeep: { value: new Color() },
      uTint: { value: new Color() },
      uHot: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });
  material.uniforms.uEnvMap = frame.uEnvMap;

  /** @param {object} s { size, reveal, fade, crack, heat, seed } */
  material.userData.sync = (s) => {
    const c = settings.echoes;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = s.size;
    u.uReveal.value = s.reveal;
    u.uFade.value = s.fade;
    u.uOpacity.value = c.floorOpacity * g.opacity;
    u.uSky.value = c.floorSky;
    u.uCrack.value = s.crack;
    u.uHeat.value = s.heat;
    u.uCrackGlow.value = c.floorCrackGlow;
    u.uSeed.value = s.seed;
    u.uDeep.value.copy(getColor(c.colorFloorDeep));
    u.uTint.value.copy(getColor(c.colorHoloHigh));
    u.uHot.value.copy(getColor(c.colorHoloRim));
  };
  return material;
}
