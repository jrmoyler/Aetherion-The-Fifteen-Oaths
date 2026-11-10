import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { copyColor } from '../../../utils/color.js';

/**
 * Pulse Covenant — the bespoke shaders.
 *
 *  - **the heart** — solid muscle, lit by the shared sun direction with wrap
 *    lighting so it never goes flat black on the shadow side, striated by
 *    stretched noise along its height, and threaded with veins (ridged noise)
 *    that flare on every beat. A fresnel rim in the glow colour sells the wet
 *    surface. The vertex stage squeezes it on the beat — apex first — so the
 *    contraction travels rather than the whole mesh scaling.
 *  - **the arteries** — tapered vessels whose surface carries the beat: a
 *    bright bolus runs from the heart to the floor once per beat, the vessel
 *    grows along its length on the cast and withdraws on the exit.
 *  - **the cells** — instanced red cells riding the arteries, additive glow.
 *  - **the covenant floor** — the ground sigil round the caster: capillaries
 *    radiating in polar noise, slow concentric rings, the expanding front of
 *    a secondary pulse, and the **timing cue** — a ring that contracts from
 *    the rim to the gate after each owned hit and burns while the next hit
 *    would land inside the window.
 *  - **the gate** — a clock-face ring with twelve ticks; it flares while the
 *    window is open.
 *  - **the pulse ring** — the flat ragged ring a secondary pulse throws from
 *    the hit that triggered it.
 *  - **the pulse warp** — `LAYER.DISTORTION`: the same ring pushing the scene
 *    outward as it passes.
 *
 * Each material has `userData.sync(c, state)` reading the live settings.
 */

/* -------------------------------------------------------------------- */
/* The heart                                                            */
/* -------------------------------------------------------------------- */

const HEART_VERTEX = /* glsl */ `
  uniform float uBeat;
  uniform float uSquash;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec3 p = position;
    // Contraction leads from the apex (y = -0.9) toward the base.
    float apex = smoothstep(0.7, -0.9, position.y);
    p.xz *= 1.0 - uBeat * uSquash * (0.4 + 0.6 * apex);
    p.y *= 1.0 + uBeat * uSquash * 0.3;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HEART_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uBeat;
  uniform float uFade;
  uniform float uDissolve;
  uniform float uGlow;
  uniform float uFresnel;
  uniform float uVeins;
  uniform float uGlobalGlow;
  uniform vec3  uLightDir;
  uniform vec3  uMuscle;
  uniform vec3  uVessel;
  uniform vec3  uBlood;
  uniform vec3  uDeep;
  uniform vec3  uCore;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    // Withdrawal: the heart burns away from the apex up.
    float n = snoise01(vLocal * 5.0);
    float level = (vLocal.y + 1.0) * 0.5 + n * 0.25;
    if (level < uDissolve * 1.3) discard;
    float burn = (1.0 - smoothstep(uDissolve * 1.3, uDissolve * 1.3 + 0.08, level)) * step(0.001, uDissolve);

    vec3 N = normalize(vNormalW);
    // Wrap lighting: muscle scatters, its dark side is deep red, not black.
    float wrap = clamp((dot(N, normalize(uLightDir)) + 0.5) / 1.5, 0.0, 1.0);
    // Striations along the height, broken so they do not read as stripes.
    float fibre = snoise(vec3(vLocal.x * 2.0, vLocal.y * 14.0, vLocal.z * 2.0)) * 0.5 + 0.5;
    // Four-stop ramp: the deep tone pools in the clefts and the shadow side,
    // the muscle is the body, the wet highlight and the beat are the tint/core.
    float cleft = smoothstep(0.35, -0.2, fibre - 0.25 + wrap * 0.6);
    vec3 col = mix(uMuscle, uDeep, cleft) * (0.3 + 0.8 * wrap) * (0.8 + 0.3 * fibre);
    // Veins flare on the beat.
    float veins = pow(ridged(vLocal * 3.2 + vec3(0.0, uTime * 0.1, 0.0), 4), 6.0);
    col = mix(col, uVessel * (1.0 + uBeat * 2.5) * uGlow * uGlobalGlow, clamp(veins * uVeins, 0.0, 1.0));
    // A wet specular: muscle under a film of blood.
    vec3 V = normalize(vViewDir);
    vec3 H = normalize(normalize(uLightDir) + V);
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), 48.0) * (0.4 + 0.6 * fibre);
    col += uCore * spec * 0.9;
    float rim = fresnelTerm(vViewDir, N, 3.0, uFresnel);
    col += uBlood * rim * (0.5 + uBeat) * uGlow * uGlobalGlow;
    col += uCore * burn * 3.0;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createHeartMaterial() {
  // Opaque and lit: the heart is muscle, so it lives on LAYER.WORLD, occludes
  // and casts a shadow. The exit is a discard dissolve, not an alpha fade.
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uSquash: { value: 0.12 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uGlow: { value: 1.4 },
      uFresnel: { value: 1.8 },
      uVeins: { value: 1 },
      uMuscle: { value: new Color('#750a22') },
      uVessel: { value: new Color('#d91f47') },
      uBlood: { value: new Color('#ff8290') },
      uDeep: { value: new Color('#24030b') },
      uCore: { value: new Color('#fff0f2') }
    }),
    vertexShader: HEART_VERTEX,
    fragmentShader: HEART_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uBeat.value = state.beat;
    u.uFade.value = state.fade;
    u.uDissolve.value = state.dissolve;
    u.uSquash.value = c.heartSquash;
    u.uGlow.value = c.heartGlow * g.glow;
    u.uFresnel.value = c.heartFresnel * g.fresnel;
    u.uVeins.value = c.heartVeins;
    copyColor(u.uMuscle.value, c.heartColor);
    copyColor(u.uVessel.value, c.arteryColor);
    copyColor(u.uBlood.value, c.bloodGlow);
    copyColor(u.uDeep.value, c.deepColor);
    copyColor(u.uCore.value, c.coreColor);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Arteries                                                             */
/* -------------------------------------------------------------------- */

const ARTERY_VERTEX = /* glsl */ `
  uniform float uFlow;
  uniform float uSwell;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    // The bolus swells the wall as it passes.
    float bolus = exp(-pow((fract(uFlow) - uv.x) * 9.0, 2.0));
    vec3 p = position + normal * bolus * uSwell * 0.02;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ARTERY_FRAGMENT = /* glsl */ `
  uniform float uFlow;
  uniform float uGrow;
  uniform float uFade;
  uniform float uGlow;
  uniform float uFlare;
  uniform float uGlobalGlow;
  uniform vec3  uLightDir;
  uniform vec3  uWall;
  uniform vec3  uBlood;
  uniform vec3  uDeep;
  uniform vec3  uCore;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  ${commonGLSL}

  void main() {
    // Grows out from the heart; the growing tip is hot.
    if (vUv.x > uGrow) discard;
    float tip = exp(-(uGrow - vUv.x) * 25.0) * step(uGrow, 0.999);
    vec3 N = normalize(vNormalW);
    float wrap = clamp((dot(N, normalize(uLightDir)) + 0.6) / 1.6, 0.0, 1.0);
    float bolus = exp(-pow((fract(uFlow) - vUv.x) * 9.0, 2.0));
    float rim = fresnelTerm(vViewDir, N, 2.0, 1.0);
    // Dark wet vessel walls (deep → body with the light), so the bolus is
    // the only bright thing running down them.
    vec3 col = mix(uDeep, uWall, 0.1 + 0.4 * wrap) * (0.3 + 0.5 * wrap);
    float spec = pow(clamp(dot(N, normalize(normalize(uLightDir) + normalize(vViewDir))), 0.0, 1.0), 48.0);
    col += uCore * spec * 0.25;
    col += uBlood * (bolus * (1.0 + uFlare) + rim * 0.15 + tip) * uGlow * uGlobalGlow;
    col += uCore * bolus * bolus * 0.6 * uGlow * uGlobalGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createArteryMaterial() {
  // Opaque vessel walls (the exit is the network shrinking, not an alpha fade).
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFlow: { value: 0 },
      uSwell: { value: 1 },
      uGrow: { value: 1 },
      uFade: { value: 1 },
      uGlow: { value: 1.6 },
      uFlare: { value: 0 },
      uWall: { value: new Color('#d91f47') },
      uBlood: { value: new Color('#ff8290') },
      uDeep: { value: new Color('#24030b') },
      uCore: { value: new Color('#fff0f2') }
    }),
    vertexShader: ARTERY_VERTEX,
    fragmentShader: ARTERY_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uFlow.value = state.flow;
    u.uGrow.value = state.grow;
    u.uFade.value = state.fade;
    u.uFlare.value = state.flare;
    u.uSwell.value = c.arterySwell;
    u.uGlow.value = c.arteryGlow * g.glow;
    copyColor(u.uWall.value, c.arteryColor);
    copyColor(u.uBlood.value, c.bloodGlow);
    copyColor(u.uDeep.value, c.deepColor);
    copyColor(u.uCore.value, c.coreColor);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Cells (instanced)                                                    */
/* -------------------------------------------------------------------- */

const CELL_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 world = modelMatrix * local;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CELL_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uFade;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uCore;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  ${commonGLSL}

  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, 1.5, 1.0);
    vec3 col = mix(uCore, uColor, clamp(rim, 0.0, 1.0)) * uGlow * uGlobalGlow;
    gl_FragColor = vec4(col, clamp((0.55 + rim * 0.45) * uFade, 0.0, 1.0));
  }
`;

export function createCellMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uGlow: { value: 2 },
      uFade: { value: 1 },
      uColor: { value: new Color('#ff8290') },
      uCore: { value: new Color('#d91f47') }
    }),
    vertexShader: CELL_VERTEX,
    fragmentShader: CELL_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.cellGlow * g.glow * (1 + state.flare);
    u.uFade.value = state.fade;
    copyColor(u.uColor.value, c.bloodGlow);
    copyColor(u.uCore.value, c.arteryColor);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The covenant floor                                                   */
/* -------------------------------------------------------------------- */

const FLOOR_VERTEX = /* glsl */ `
  varying vec2 q;
  void main() {
    q = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uBeat;
  uniform float uPulse;     // 0..1 progress of the latest secondary pulse
  uniform float uFade;
  uniform float uCue;       // 0..1 since the last owned hit, 1 = one beat later
  uniform float uCueAlpha;  // 0 when there is no pending hit
  uniform float uWindow;    // 1 while the next hit would be in rhythm
  uniform float uGate;      // gate radius, in floor units (0..1)
  uniform float uVeins;
  uniform float uGlow;
  uniform float uCueGlow;
  uniform float uOpacity;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uDeep;
  varying vec2 q;

  ${noiseGLSL}

  void main() {
    float r = length(q);
    if (r > 1.0) discard;
    float a = atan(q.y, q.x);
    float mask = 1.0 - smoothstep(0.86, 1.0, r);

    // Capillaries: ridged polar noise stretched along the radius.
    float cap = pow(ridged(vec3(cos(a) * 3.0, sin(a) * 3.0, r * 2.5 - uTime * 0.25), 4), 5.0);
    cap *= smoothstep(0.08, 0.3, r) * uVeins;
    // Slow rings breathing outward on the heart's beat.
    float rings = pow(max(0.0, cos(r * 33.0 - uTime * 4.0)), 20.0) * (0.4 + uBeat);
    // The secondary pulse front.
    float wave = exp(-abs(r - uPulse) * 45.0) * step(0.001, uPulse) * (1.0 - uPulse);
    // The timing cue: contracts from the rim to the gate over one beat.
    float cueR = mix(1.0, uGate, clamp(uCue, 0.0, 1.2));
    float cue = exp(-abs(r - cueR) * 60.0) * uCueAlpha;
    float gate = exp(-abs(r - uGate) * 80.0) * (0.25 + uWindow);

    vec3 col = uColor * (cap * 0.35 + rings * 0.18 + wave * 0.8) * uGlow
             + uColor * (cue * (0.6 + uWindow * 1.6) + gate * 0.5) * uCueGlow;
    col = mix(uDeep * 0.6, col, clamp(cap + rings + wave + cue + gate, 0.0, 1.0)) * uGlobalGlow;
    float alpha = (cap * 0.3 + rings * 0.18 + wave * 0.65 + cue * 0.9 + gate * 0.5) * mask * uFade * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col * 2.0, clamp(alpha, 0.0, 1.0));
  }
`;

export function createCovenantFloorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      // Own clock: the floor breathes on the cast's age, not the frame clock.
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uPulse: { value: 0 },
      uFade: { value: 1 },
      uCue: { value: 0 },
      uCueAlpha: { value: 0 },
      uWindow: { value: 0 },
      uGate: { value: 0.55 },
      uVeins: { value: 1 },
      uGlow: { value: 1.2 },
      uCueGlow: { value: 1.6 },
      uOpacity: { value: 1 },
      uColor: { value: new Color('#ff8290') },
      uDeep: { value: new Color('#750a22') }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uBeat.value = state.beat;
    u.uPulse.value = state.pulse;
    u.uFade.value = state.fade;
    u.uCue.value = state.cue;
    u.uCueAlpha.value = state.cueAlpha;
    u.uWindow.value = state.window;
    u.uGate.value = state.gate;
    u.uVeins.value = c.floorVeins;
    u.uGlow.value = c.floorGlow * g.glow;
    u.uCueGlow.value = c.cueGlow * g.glow;
    u.uOpacity.value = g.opacity;
    copyColor(u.uColor.value, c.bloodGlow);
    copyColor(u.uDeep.value, c.heartColor);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The gate                                                             */
/* -------------------------------------------------------------------- */

const GATE_VERTEX = /* glsl */ `
  attribute float aRole;
  varying vec2 vUv;
  varying float vRole;
  void main() {
    vUv = uv;
    vRole = aRole;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GATE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uWindow;
  uniform float uBeat;
  uniform float uFade;
  uniform float uGlow;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  varying vec2 vUv;
  varying float vRole;

  void main() {
    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
    // A slow sweep round the face, one revolution per beat.
    float sweep = pow(fract(vUv.x - uTime), 6.0);
    float base = vRole > 0.5 ? 0.8 : 0.35 + across * 0.4;
    float a = (base + sweep * 0.5 + uWindow * 1.2 + uBeat * 0.3) * uFade;
    vec3 col = uColor * uGlow * uGlobalGlow * (1.0 + uWindow * 1.5);
    gl_FragColor = vec4(col, clamp(a * 0.6, 0.0, 1.0));
  }
`;

export function createGateMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uWindow: { value: 0 },
      uBeat: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.6 },
      uColor: { value: new Color('#ff8290') }
    }),
    vertexShader: GATE_VERTEX,
    fragmentShader: GATE_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.sweep;
    u.uWindow.value = state.window;
    u.uBeat.value = state.beat;
    u.uFade.value = state.fade * g.opacity;
    u.uGlow.value = c.cueGlow * g.glow;
    copyColor(u.uColor.value, c.bloodGlow);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The pulse ring and its warp                                          */
/* -------------------------------------------------------------------- */

const RING_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uAlpha;
  uniform float uGlow;
  uniform float uWidth;
  uniform float uGlobalGlow;
  uniform vec3  uColor;
  uniform vec3  uCore;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    // A wet, ragged front: noise round the ring offsets the band, and blood
    // beads along its leading edge.
    float n = fbm3(vec3(vUv.x * 18.0, uProgress * 3.0, 2.7));
    float front = 1.0 - uWidth * 0.3 + n * 0.12;
    float band = smoothstep(front - uWidth, front, vUv.y) * (1.0 - smoothstep(front, front + 0.05, vUv.y));
    float beads = pow(max(0.0, sin(vUv.x * 160.0 + n * 6.0)), 12.0) * smoothstep(front - 0.1, front, vUv.y);
    vec3 col = mix(uColor, uCore, clamp(beads + band * 0.3, 0.0, 1.0)) * uGlow * uGlobalGlow;
    float a = (band + beads * 0.5) * uAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createPulseRingMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uProgress: { value: 0 },
      uAlpha: { value: 0 },
      uGlow: { value: 2 },
      uWidth: { value: 0.35 },
      uColor: { value: new Color('#ff8290') },
      uCore: { value: new Color('#fff1e7') }
    }),
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uProgress.value = state.progress;
    u.uAlpha.value = state.alpha * g.opacity;
    u.uGlow.value = (state.glow ?? c.pulseGlow) * g.glow;
    u.uWidth.value = state.width ?? c.pulseWidth;
    copyColor(u.uColor.value, c.bloodGlow);
    copyColor(u.uCore.value, c.dropletColorA);
  };
  return material;
}

const WARP_VERTEX = /* glsl */ `
  uniform float uRadius;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Camera-facing billboard centred a metre off the floor.
    vec4 mv = modelViewMatrix * vec4(0.0, 1.0, 0.0, 1.0);
    mv.xy += position.xy * uRadius * 2.0;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vUv;

  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float r = length(c);
    // A shell of displacement riding the pulse front, pushing outward.
    float shell = exp(-pow((r - uProgress) * 9.0, 2.0)) * (1.0 - smoothstep(0.85, 1.0, r));
    float strength = uStrength * uShaderIntensity * shell * (1.0 - uProgress);
    if (strength < 0.002) discard;
    vec2 dir = normalize(c + 1e-4);
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, shell);
  }
`;

export function createPulseWarpMaterial() {
  // Opaque on purpose: a distortion proxy writes offsets, not colour, and the
  // candidate harness requires every *transparent* mesh to sit on LAYER.VFX.
  // The shell fades its strength to zero before every discard edge, so no
  // blending is needed for a seamless warp.
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRadius: { value: 1 },
      uProgress: { value: 0 },
      uStrength: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const u = material.uniforms;
    u.uRadius.value = state.radius;
    u.uProgress.value = state.progress;
    u.uStrength.value = (state.strength ?? c.warpStrength) * settings.global.distortion;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The blood pool — the floor that stays                                */
/* -------------------------------------------------------------------- */

const POOL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSpread;    // 0..1 how far the pool has run out
  uniform float uBeat;
  uniform float uFade;      // 1 standing, → 0 as it dries on the exit
  uniform float uSheen;
  uniform float uRipple;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uGlobalGlow;
  uniform vec3  uLightDir;
  uniform vec3  uDeep;
  uniform vec3  uBody;
  uniform vec3  uTint;
  uniform vec3  uCore;
  varying vec2 q;

  ${noiseGLSL}

  void main() {
    float r = length(q);
    float a = atan(q.y, q.x);
    // A ragged, lobed edge that creeps outward as it spreads.
    float lobes = fbm3(vec3(cos(a) * 2.2, sin(a) * 2.2, 3.1)) * 0.5 + 0.5;
    float edge = uSpread * (0.78 + 0.22 * lobes);
    float mask = 1.0 - smoothstep(edge - 0.05, edge, r);
    if (mask < 0.003) discard;
    // Thicker, darker blood in the middle; a thin bright meniscus at the rim.
    float depth = smoothstep(edge, edge * 0.25, r);
    float clot = fbm3(vec3(q * 5.0, uTime * 0.05)) * 0.5 + 0.5;
    vec3 col = mix(uBody * 0.55, uDeep, clamp(depth * 0.8 + clot * 0.35, 0.0, 1.0));
    // Ripples rolling out from the heart on each beat.
    float ripple = sin(r * 38.0 - uTime * 9.0) * 0.5 + 0.5;
    ripple *= exp(-r * 2.5) * (0.35 + uBeat) * uRipple;
    // Wet sheen: a noise normal tilted by the ripples, lit by the sun.
    vec3 n = normalize(vec3(
      (fbm3(vec3(q * 9.0 + 0.7, uTime * 0.1)) + ripple * 0.6) * 0.35,
      1.0,
      (fbm3(vec3(q * 9.0 - 3.1, uTime * 0.1)) + ripple * 0.6) * 0.35));
    float spec = pow(clamp(dot(n, normalize(uLightDir + vec3(0.0, 1.0, 0.0))), 0.0, 1.0), 40.0);
    col += uCore * spec * uSheen * 0.6;
    float meniscus = exp(-abs(r - edge) * 60.0);
    col += uTint * meniscus * 0.6 * uGlow * uGlobalGlow;
    col += uBody * ripple * 0.35 * uGlow * uGlobalGlow;
    float alpha = mask * (0.55 + 0.4 * depth) * uFade * uOpacity;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * The pool of blood the covenant sheds round the caster at the bind: a dark,
 * glossy stain with a lobed creeping edge, ripples that roll out on every
 * beat and a bright meniscus. Normal blending — it is the deep stop of the
 * ramp that grounds the cast on the dark floor — and it stays for the whole
 * covenant, drying away only on the exit.
 */
export function createPoolMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uSpread: { value: 0 },
      uBeat: { value: 0 },
      uFade: { value: 1 },
      uSheen: { value: 1 },
      uRipple: { value: 1 },
      uOpacity: { value: 1 },
      uGlow: { value: 1 },
      uDeep: { value: new Color('#24030b') },
      uBody: { value: new Color('#d91f47') },
      uTint: { value: new Color('#ff8290') },
      uCore: { value: new Color('#fff0f2') }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: POOL_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time * g.noiseSpeed;
    u.uSpread.value = state.spread;
    u.uBeat.value = state.beat;
    u.uFade.value = state.fade;
    u.uSheen.value = c.poolSheen;
    u.uRipple.value = c.poolRipple * g.noiseStrength;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uGlow.value = c.floorGlow * g.glow;
    copyColor(u.uDeep.value, c.deepColor);
    copyColor(u.uBody.value, c.arteryColor);
    copyColor(u.uTint.value, c.bloodGlow);
    copyColor(u.uCore.value, c.coreColor);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The threads — vessels reaching out to the blood nearby               */
/* -------------------------------------------------------------------- */

const THREAD_VERTEX = /* glsl */ `
  // position = (t along the thread, cos, sin) round it.
  uniform vec3  uA;       // the heart
  uniform vec3  uB;       // the body it reaches for
  uniform vec3  uC;       // arch control point
  uniform float uGrow;    // 0..1 of the way there
  uniform float uRadius;
  varying float vT;
  varying float vFront;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  vec3 bez(float t) {
    float s = 1.0 - t;
    return s * s * uA + 2.0 * s * t * uC + t * t * uB;
  }

  void main() {
    float t = min(position.x, uGrow);
    vec3 P = bez(t);
    vec3 T = normalize(bez(min(t + 0.01, 1.0)) - bez(max(t - 0.01, 0.0)) + vec3(1e-5));
    vec3 S = normalize(cross(T, vec3(0.0, 1.0, 0.0)) + vec3(1e-5, 0.0, 0.0));
    vec3 U = normalize(cross(S, T));
    // Thick at the heart, thin where it bites; a swollen, pointed growing tip.
    float behind = (uGrow - t);
    float r = uRadius * mix(1.0, 0.5, t) * (0.25 + 0.75 * smoothstep(0.0, 0.06, behind));
    vec3 n = S * position.y + U * position.z;
    vec3 world = P + n * r;
    vT = t;
    vFront = behind;
    vNormalW = n;
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const THREAD_FRAGMENT = /* glsl */ `
  uniform float uFlow;     // bolus position, cycles 0..1 heart → body
  uniform float uGlow;
  uniform float uGlobalGlow;
  uniform float uFade;
  uniform vec3  uLightDir;
  uniform vec3  uDeep;
  uniform vec3  uBody;
  uniform vec3  uTint;
  uniform vec3  uCore;
  varying float vT;
  varying float vFront;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  ${commonGLSL}

  void main() {
    if (uFade < 0.01) discard;
    vec3 N = normalize(vNormalW);
    float wrap = clamp((dot(N, normalize(uLightDir)) + 0.5) / 1.5, 0.0, 1.0);
    vec3 col = mix(uDeep, uBody, wrap * 0.8) * (0.4 + 0.6 * wrap);
    float bolus = exp(-pow((fract(uFlow) - vT) * 11.0, 2.0));
    float tip = exp(-vFront * 30.0);
    float rim = fresnelTerm(vViewDir, N, 2.5, 1.0);
    col += uTint * (bolus * 1.6 + rim * 0.35 + tip * 1.2) * uGlow * uGlobalGlow;
    col += uCore * bolus * bolus * uGlow * uGlobalGlow;
    gl_FragColor = vec4(col * uFade, 1.0);
  }
`;

/**
 * One covenant thread: a vessel thrown from the heart to a body nearby,
 * bent along a quadratic arch in the vertex stage (so the target can move),
 * growing out tip-first and carrying one bolus of light per beat from the
 * heart to the body. Opaque — it is a vessel, not a glow.
 */
export function createThreadMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    toneMapped: false,
    uniforms: sharedUniforms({
      uA: { value: new Vector3() },
      uB: { value: new Vector3(0, 0, 1) },
      uC: { value: new Vector3() },
      uGrow: { value: 0 },
      uRadius: { value: 0.06 },
      uFlow: { value: 0 },
      uGlow: { value: 2 },
      uFade: { value: 1 },
      uDeep: { value: new Color('#24030b') },
      uBody: { value: new Color('#d91f47') },
      uTint: { value: new Color('#ff8290') },
      uCore: { value: new Color('#fff0f2') }
    }),
    vertexShader: THREAD_VERTEX,
    fragmentShader: THREAD_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uA.value.copy(state.a);
    u.uB.value.copy(state.b);
    u.uC.value.copy(state.c);
    u.uGrow.value = state.grow;
    u.uFlow.value = state.flow;
    u.uFade.value = state.fade;
    u.uRadius.value = c.threadRadius;
    u.uGlow.value = c.threadGlow * g.glow;
    copyColor(u.uDeep.value, c.deepColor);
    copyColor(u.uBody.value, c.arteryColor);
    copyColor(u.uTint.value, c.bloodGlow);
    copyColor(u.uCore.value, c.coreColor);
  };
  return material;
}
