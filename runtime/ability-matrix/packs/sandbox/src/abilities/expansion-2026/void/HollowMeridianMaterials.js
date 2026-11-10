import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { copyColor } from '../../../utils/color.js';

/**
 * Hollow Meridian — the bespoke shaders.
 *
 *  - **the seam** — the breach. Normal-blended, because a hole in the world has
 *    to *occlude* what is behind it: an additive void is a purple glow, not an
 *    absence. A deep-space interior (swirled fbm nebula, voronoi star points
 *    drifting inward) darkening toward the centre, a ragged rim eaten by noise
 *    that burns white-violet past 1.0 so bloom finds it, and a closing
 *    dissolve that eats the rim inward rather than shrinking a card.
 *  - **the wake** — the ribbon that runs ahead of the breach during travel:
 *    a dark core with torn, flickering violet edges.
 *  - **the lens** — the spindle at the head of the wake: black glass with a
 *    hard fresnel rim.
 *  - **the warning** — the ground glyph over the next breach. The rim fills
 *    clockwise with the charge so the timing reads, ticks pulse inward.
 *  - **the shard** — torn fragments: dark facets, a fresnel edge, a
 *    noise dissolve from the tip as the breach closes.
 *  - **the wave** — the ragged ground ring each breach throws.
 *  - **the implosion** — a `LAYER.DISTORTION` billboard per open breach that
 *    pulls the scene *inward* and twists it, the gravity of the hole.
 *
 * Every material is synced from the live settings block in
 * `material.userData.sync(c, state)`, so every slider is live mid-cast.
 */

/* -------------------------------------------------------------------- */
/* The seam                                                             */
/* -------------------------------------------------------------------- */

const SEAM_VERTEX = /* glsl */ `
  uniform float uFlow;
  uniform float uSeed;
  uniform float uBreathe;

  varying vec2  vUv;
  varying float vViewZ;

  void main() {
    vUv = uv;
    vec3 p = position;
    // The lips breathe in and out of the plane, travelling up the tear.
    p.z += sin(uv.y * 20.0 - uFlow * 3.0 + uSeed) * 0.04 * uBreathe;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SEAM_FRAGMENT = /* glsl */ `
  uniform float uFlow;
  uniform float uSeed;
  uniform float uClose;      // 0 open → 1 fully dissolved
  uniform float uFade;
  uniform float uRagged;
  uniform float uRimWidth;
  uniform float uRimGlow;
  uniform float uSwirl;
  uniform float uStars;
  uniform float uDepth;
  uniform float uOpacity;
  uniform float uSoftFade;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3  uVoid;
  uniform vec3  uCore;
  uniform vec3  uEdge;
  uniform vec3  uStar;
  uniform sampler2D uSceneDepth;
  uniform vec2  uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;

  varying vec2  vUv;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float across = vUv.x * 2.0 - 1.0;
    float along = vUv.y;

    // Distance in from the rim (1 on the centre line), torn by noise that
    // creeps slowly up the seam so the rim never holds still.
    float tear = fbm3(vec3(along * 7.0 + uSeed, across * 1.3, uFlow * 0.35));
    float inward = 1.0 - abs(across) + tear * uRagged * 0.35;

    // Closing eats the rim inward. The extra margin guarantees the last
    // sliver is gone at uClose = 1 whatever the raggedness.
    float d = inward - uClose * (1.0 + uRagged * 0.35);
    if (d <= 0.0) discard;

    // Ends feather so the tips never cut a hard horizontal line.
    float ends = smoothstep(0.0, 0.07, along) * (1.0 - smoothstep(0.9, 1.0, along));

    // Interior: a nebula wound round the centre — the swirl is stronger near
    // the axis, so it reads as falling *into* the cut.
    vec2 q = vec2(across * 0.55, (along - 0.5) * 2.6);
    float r = length(q);
    q = rot2(uFlow * 0.5 * uSwirl + (1.0 - r) * 2.2 * uSwirl) * q;
    float neb = fbm4(vec3(q * 2.1, uFlow * 0.18 + uSeed));
    vec3 col = mix(uCore, uVoid, smoothstep(-0.35, 0.65, neb));
    // Deeper toward the centre line.
    col *= mix(1.0, 0.25, smoothstep(0.15, 0.95, 1.0 - abs(across)) * uDepth);

    // Distant points of light, drifting inward with the swirl.
    vec2 cell = voronoi2(q * 9.0 + vec2(uSeed * 3.1, -uFlow * 0.4));
    float twinkle = 0.55 + 0.45 * sin(uFlow * 4.0 + cell.y * 40.0);
    float star = (1.0 - smoothstep(0.0, 0.08, cell.x)) * step(0.72, cell.y) * twinkle;
    col += uStar * star * uStars;

    // The burning rim — the only part that blooms.
    float rim = 1.0 - smoothstep(0.0, max(uRimWidth, 0.005), d);
    float flicker = 0.75 + 0.25 * snoise(vec3(along * 18.0, uFlow * 2.0, uSeed));
    col = mix(col, uEdge * uRimGlow * flicker * uGlobalGlow, rim);

    float alpha = mix(0.92, 1.0, rim) * ends * uFade * uOpacity * uShaderIntensity;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export function createSeamMaterial(seed = 0) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFlow: { value: 0 },
      uSeed: { value: seed },
      uBreathe: { value: 1 },
      uClose: { value: 0 },
      uFade: { value: 1 },
      uRagged: { value: 1 },
      uRimWidth: { value: 0.12 },
      uRimGlow: { value: 2.4 },
      uSwirl: { value: 1 },
      uStars: { value: 1 },
      uDepth: { value: 1 },
      uOpacity: { value: 1 },
      uSoftFade: { value: 0.35 },
      uVoid: { value: new Color('#281b58') },
      uCore: { value: new Color('#05020f') },
      uEdge: { value: new Color('#b8a8ff') },
      uStar: { value: new Color('#ece6ff') }
    }),
    vertexShader: SEAM_VERTEX,
    fragmentShader: SEAM_FRAGMENT
  });

  /** @param {object} state { flow, close, fade, breathe } */
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uFlow.value = state.flow;
    u.uClose.value = state.close;
    u.uFade.value = state.fade;
    u.uBreathe.value = state.breathe;
    u.uRagged.value = c.seamRagged * g.noiseStrength;
    u.uRimWidth.value = c.rimWidth;
    u.uRimGlow.value = c.rimGlow * g.glow;
    u.uSwirl.value = c.seamSwirl;
    u.uStars.value = c.seamStars;
    u.uDepth.value = c.seamDepth;
    u.uOpacity.value = g.opacity;
    u.uSoftFade.value = c.softFade;
    copyColor(u.uVoid.value, c.voidColor);
    copyColor(u.uCore.value, c.coreColor);
    copyColor(u.uEdge.value, c.edgeColor);
    copyColor(u.uStar.value, c.starColor);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The wake and its lens                                                */
/* -------------------------------------------------------------------- */

const WAKE_VERTEX = /* glsl */ `
  uniform float uFlow;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    // A shiver runs down the wake from the head.
    p.y += sin(uv.y * 22.0 - uFlow * 6.0) * 0.08 * uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const WAKE_FRAGMENT = /* glsl */ `
  uniform float uFlow;
  uniform float uGlow;
  uniform float uFade;
  uniform float uOpacity;
  uniform float uRagged;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uDark;
  varying vec2  vUv;

  ${noiseGLSL}

  void main() {
    float across = abs(vUv.x * 2.0 - 1.0);
    // Edges torn by noise streaming back from the head.
    float n = snoise(vec3(vUv.x * 3.0, vUv.y * 9.0 + uFlow * 3.0, 1.7));
    float body = 1.0 - smoothstep(0.55, 1.0, across + n * 0.25 * uRagged);
    if (body <= 0.0) discard;
    float edge = smoothstep(0.35, 0.95, across + n * 0.2);
    // Fine cracks of light along the wake.
    float cracks = pow(max(0.0, cos(vUv.y * 45.0 - uFlow * 9.0 + n * 3.0)), 18.0);
    vec3 col = mix(uDark, uColor * uGlow * uGlobalGlow, clamp(edge * 0.9 + cracks * 0.35, 0.0, 1.0));
    // Fades into a thread at the tail, sharp at the head.
    float lengthwise = smoothstep(0.0, 0.7, vUv.y) * (1.0 - smoothstep(0.97, 1.0, vUv.y));
    float alpha = body * lengthwise * (0.45 + edge * 0.5) * uFade * uOpacity;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export function createWakeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFlow: { value: 0 },
      uGlow: { value: 1.6 },
      uFade: { value: 1 },
      uOpacity: { value: 1 },
      uRagged: { value: 1 },
      uColor: { value: new Color('#b8a8ff') },
      uDark: { value: new Color('#281b58') }
    }),
    vertexShader: WAKE_VERTEX,
    fragmentShader: WAKE_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uFlow.value = state.flow;
    u.uFade.value = state.fade;
    u.uGlow.value = c.travelGlow * g.glow;
    u.uOpacity.value = g.opacity;
    u.uRagged.value = c.seamRagged * g.noiseStrength;
    copyColor(u.uColor.value, c.edgeColor);
    copyColor(u.uDark.value, c.voidColor);
  };
  return material;
}

const LENS_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uFlow;
  uniform float uFresnel;
  uniform float uGlow;
  uniform float uFade;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uCore;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec2 vUv;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, 3.0, uFresnel);
    // A ring of light sliding nose → tail: the lens is *moving*.
    float band = pow(max(0.0, sin(vUv.y * 12.0 + uFlow * 10.0)), 10.0);
    vec3 col = mix(uCore, uColor * uGlow * uGlobalGlow, clamp(rim + band * 0.3, 0.0, 1.0));
    gl_FragColor = vec4(col, clamp((0.85 + rim * 0.15) * uFade, 0.0, 1.0));
  }
`;

export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFlow: { value: 0 },
      uFresnel: { value: 1.6 },
      uGlow: { value: 2 },
      uFade: { value: 1 },
      uColor: { value: new Color('#b8a8ff') },
      uCore: { value: new Color('#05020f') }
    }),
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uFlow.value = state.flow;
    u.uFade.value = state.fade;
    u.uFresnel.value = c.headFresnel * g.fresnel;
    u.uGlow.value = c.travelGlow * g.glow;
    copyColor(u.uColor.value, c.edgeColor);
    copyColor(u.uCore.value, c.coreColor);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The warning glyph                                                    */
/* -------------------------------------------------------------------- */

const WARNING_VERTEX = /* glsl */ `
  attribute float aRole;
  varying vec2  vUv;
  varying float vRole;
  void main() {
    vUv = uv;
    vRole = aRole;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WARNING_FRAGMENT = /* glsl */ `
  uniform float uFlow;
  uniform float uCharge;     // 0 → 1 as the breach is about to open
  uniform float uAlpha;
  uniform float uPulse;
  uniform float uGlow;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uDark;
  varying vec2  vUv;
  varying float vRole;

  ${noiseGLSL}

  void main() {
    float glow = uGlow * uGlobalGlow;
    vec3 col;
    float a;
    if (vRole < 0.5) {
      // Rim arcs: fill clockwise with the charge, the unfilled part a dim
      // dashed track that crawls round.
      float filled = step(vUv.x, uCharge);
      float dash = 0.5 + 0.5 * sin(vUv.x * 120.0 - uFlow * 6.0);
      float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
      col = mix(uDark * 2.0, uColor * glow, filled);
      a = mix(0.25 + dash * 0.25, 1.0, filled) * (0.4 + across * 0.6);
    } else if (vRole < 1.5) {
      // Ticks: a pulse of light running from root to tip, i.e. inward.
      float run = pow(max(0.0, sin(vUv.y * 3.14159 - uFlow * 5.0)), 4.0);
      col = uColor * glow * (0.6 + run);
      a = (0.45 + run * 0.55) * (1.0 - vUv.y * 0.4);
    } else {
      // Inner ring: a broken thread that tightens as the charge completes.
      float n = snoise(vec3(vUv.x * 24.0, uFlow * 0.8, 3.1));
      col = uColor * glow * 0.8;
      a = smoothstep(-0.2, 0.6, n) * (0.35 + uCharge * 0.65);
    }
    a *= uAlpha * (1.0 - uPulse * 0.35 + uPulse * 0.35 * sin(uFlow * 9.0));
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createWarningMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFlow: { value: 0 },
      uCharge: { value: 0 },
      uAlpha: { value: 0 },
      uPulse: { value: 1 },
      uGlow: { value: 1.4 },
      uColor: { value: new Color('#b8a8ff') },
      uDark: { value: new Color('#281b58') }
    }),
    vertexShader: WARNING_VERTEX,
    fragmentShader: WARNING_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uFlow.value = state.flow;
    u.uCharge.value = state.charge;
    u.uAlpha.value = state.alpha * g.opacity;
    u.uPulse.value = state.reduced ? 0 : 1;
    u.uGlow.value = c.warningGlow * g.glow;
    copyColor(u.uColor.value, c.edgeColor);
    copyColor(u.uDark.value, c.voidColor);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Shards                                                               */
/* -------------------------------------------------------------------- */

const SHARD_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHARD_FRAGMENT = /* glsl */ `
  uniform float uFlow;
  uniform float uFade;
  uniform float uDissolve;
  uniform float uFresnel;
  uniform float uGlow;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uDark;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying vec2 vUv;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    // Dissolve eats from the tip down, leaving a thin burning margin.
    float n = snoise01(vLocal * 9.0 + vec3(0.0, uFlow * 0.3, 0.0));
    float survive = 1.0 - mix(n, vUv.y, 0.5);
    if (survive < uDissolve) discard;
    float burn = (1.0 - smoothstep(uDissolve, uDissolve + 0.12, survive)) * step(0.001, uDissolve);
    float rim = fresnelTerm(vViewDir, vNormalW, 2.5, uFresnel);
    vec3 col = mix(uDark, uColor * uGlow * uGlobalGlow, clamp(rim, 0.0, 1.0));
    col += uColor * burn * 3.0 * uGlobalGlow;
    float alpha = (0.75 + rim * 0.25) * uFade;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export function createShardMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFlow: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uFresnel: { value: 2 },
      uGlow: { value: 2 },
      uColor: { value: new Color('#b8a8ff') },
      uDark: { value: new Color('#100a26') }
    }),
    vertexShader: SHARD_VERTEX,
    fragmentShader: SHARD_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uFlow.value = state.flow;
    u.uFade.value = state.fade;
    u.uDissolve.value = state.dissolve;
    u.uFresnel.value = c.shardFresnel * g.fresnel;
    u.uGlow.value = c.shardGlow * g.glow;
    copyColor(u.uColor.value, c.edgeColor);
    copyColor(u.uDark.value, c.voidColor).multiplyScalar(0.5);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The breach wave                                                      */
/* -------------------------------------------------------------------- */

const WAVE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WAVE_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uSeed;
  uniform float uAlpha;
  uniform float uGlow;
  uniform float uWidth;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uCore;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    // The leading edge is torn: noise round the circle shifts where the
    // band sits, and thins it as the wave spends itself.
    float n = fbm3(vec3(vUv.x * 14.0, uSeed, uProgress * 2.0));
    float front = 1.0 - uWidth + n * 0.25;
    float band = smoothstep(front - uWidth, front, vUv.y) * (1.0 - smoothstep(front, front + 0.06, vUv.y));
    float hot = smoothstep(front - uWidth * 0.3, front, vUv.y) * band;
    vec3 col = mix(uColor, uCore, hot) * uGlow * uGlobalGlow;
    float a = band * uAlpha * (1.0 - uProgress);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createWaveMaterial(seed = 0) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uProgress: { value: 0 },
      uSeed: { value: seed },
      uAlpha: { value: 0 },
      uGlow: { value: 2 },
      uWidth: { value: 0.35 },
      uColor: { value: new Color('#b8a8ff') },
      uCore: { value: new Color('#ffffff') }
    }),
    vertexShader: WAVE_VERTEX,
    fragmentShader: WAVE_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uProgress.value = state.progress;
    u.uAlpha.value = state.alpha * g.opacity;
    u.uGlow.value = c.waveGlow * g.glow;
    u.uWidth.value = c.waveWidth;
    copyColor(u.uColor.value, c.edgeColor);
    copyColor(u.uCore.value, c.starColor);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The implosion warp (LAYER.DISTORTION)                                */
/* -------------------------------------------------------------------- */

const WARP_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    // Camera-facing billboard anchored at the object origin, base on the floor.
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 offset = vec2(position.x * uWidth, (position.y + 0.5) * uHeight);
    mv.xy += offset;
    vWorld = (modelMatrix * vec4(offset.x, offset.y, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uScale;
  uniform float uTwist;
  uniform float uFlow;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    // Elliptical falloff matching the tall seam.
    vec2 c = (vUv - 0.5) * 2.0;
    float r = length(c * vec2(1.0, 0.55));
    float mask = 1.0 - smoothstep(0.35, 1.0, r);
    if (mask <= 0.0) discard;
    // Pull toward the centre, twisted, with a little noise so it shimmers.
    vec2 inward = -normalize(c + 1e-4) * (1.0 - r);
    inward = rot2(uTwist * (1.0 - r)) * inward;
    float n = snoise(vec3(vWorld.xy * uScale, uFlow * 0.6 + uSeed));
    vec2 dir = clamp(inward + vec2(n, -n) * 0.25, -1.0, 1.0);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

export function createImplosionWarpMaterial(seed = 0) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 2 },
      uHeight: { value: 3 },
      uStrength: { value: 0 },
      uScale: { value: 1.5 },
      uTwist: { value: 1.5 },
      uFlow: { value: 0 },
      uSeed: { value: seed }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = state.width;
    u.uHeight.value = state.height;
    u.uStrength.value = state.strength * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uTwist.value = c.warpTwist;
    u.uFlow.value = state.flow;
  };
  return material;
}
