import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';

/**
 * Materials for MASS WEFT — one factory per layer.
 *
 * ## The clock rule
 *
 * Every material here owns its **own** `uTime` box rather than the shared
 * frame clock. The ability writes the cast's visual time into it (scaled by
 * `flowSpeed`), and holds it at zero under `prefers-reduced-motion`, so a
 * reduced-motion player sees a still corridor whose gameplay still pulses.
 * Everything else that is global (scene depth, resolution, camera planes,
 * the glow and shader-intensity multipliers) comes from `sharedUniforms`.
 *
 * ## The palette rule
 *
 * The corridor is two colours from the settings — `gravityColor` (the bruised
 * violet of bent space) and `coreColor` (the pale light the weft carries) —
 * plus `weftColor` for the floor threads and `voidColor` for the well they
 * sag into. Each `sync` copies those strings into uniforms every frame, so a
 * colour drag lands on a corridor already standing.
 *
 * Emissive materials set `toneMapped: false` so bloom can pick up values
 * above one; the distortion proxy writes the screen-warp vector the sandbox's
 * distortion pass expects.
 */

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const SOFT_VARYINGS = /* glsl */ `
  varying float vViewZ;
  varying vec4  vClip;
`;

/** Soft-fade against the opaque depth prepass; 1 when there is no depth yet. */
const SOFT_FRAGMENT = /* glsl */ `
  float sceneSoft(float dist) {
    if (dist <= 0.0) return 1.0;
    vec2 screenUV = screenUVFromClip(vClip);
    return softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, dist);
  }
`;

const g = () => settings.global;

/* ------------------------------------------------------------------ */
/* 1 · The weft ribbon                                                 */
/* ------------------------------------------------------------------ */

const FIELD_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uRipple;
  varying vec2 vUv;
  ${SOFT_VARYINGS}

  void main() {
    vUv = uv;
    vec3 p = position;
    // A standing ripple down the trough, strongest along the spine: the
    // floor of the weft "breathes" toward the aim point.
    float spine = 1.0 - abs(uv.x * 2.0 - 1.0);
    p.z += sin(uv.y * 24.0 - uTime * 4.0) * 0.025 * spine * uRipple;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
    vClip = gl_Position;
  }
`;

const FIELD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uPulse;
  uniform float uGlowGain;
  uniform float uNoise;
  uniform float uNoiseScale;
  uniform float uSoft;
  uniform vec3  uColor;
  uniform vec3  uCore;
  uniform sampler2D uSceneDepth;
  uniform vec2  uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${SOFT_VARYINGS}

  ${noiseGLSL}
  ${commonGLSL}
  ${SOFT_FRAGMENT}

  void main() {
    float x = abs(vUv.x * 2.0 - 1.0);
    // Threads of the weft: tight bright filaments rolling toward the front,
    // broken by noise so they never read as a scrolling texture.
    float n = fbm3(vec3(vUv.x * 3.0 * uNoiseScale, vUv.y * 9.0 * uNoiseScale - uTime * 0.9, uTime * 0.15));
    float fil = pow(max(0.0, cos(vUv.y * 45.0 - uTime * 5.0 + n * 3.0 * uNoise)), 20.0);
    float edge = exp(-abs(x - 0.86) * 40.0);
    float core = exp(-x * 7.0);
    // Feather the two ends so the corridor never ends on a hard line.
    float ends = smoothstep(0.0, 0.04, vUv.y) * (1.0 - smoothstep(0.96, 1.0, vUv.y));
    // The strike lives in the travelling wave (floor, threads, arches), so the
    // ribbon only brightens a little on a pulse instead of washing out.
    float body = edge * 0.4 + fil * 0.2 * (0.6 + 0.4 * n) + core * 0.3 + uPulse * 0.06;
    vec3 col = mix(uColor, uCore, clamp(core * 0.6 + fil * 0.3 + uPulse * 0.15, 0.0, 1.0));
    col *= uGlowGain * uGlobalGlow * (1.0 + uPulse * 0.3);
    float alpha = body * uFade * ends * sceneSoft(uSoft) * uShaderIntensity;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The weft ribbon laid on the floor. Additive. */
export function createWeftFieldMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uPulse: { value: 0 },
      uRipple: { value: 1 },
      uGlowGain: { value: 1 },
      uNoise: { value: 1 },
      uNoiseScale: { value: 1 },
      uSoft: { value: 0.25 },
      uColor: { value: new Color('#9f8fbe') },
      uCore: { value: new Color('#efe4ff') }
    }),
    vertexShader: FIELD_VERTEX,
    fragmentShader: FIELD_FRAGMENT
  });
  /** @param {object} c the cast's live settings */
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uColor.value.set(c.gravityColor);
    u.uCore.value.set(c.coreColor);
    u.uGlowGain.value = c.ribbonGlow ?? 1;
    u.uRipple.value = c.ribbonRipple ?? 1;
    u.uNoise.value = (c.ribbonNoise ?? 1) * g().noiseStrength;
    u.uNoiseScale.value = g().noiseFrequency;
    u.uSoft.value = c.softFade ?? 0.25;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 2 · The filaments                                                   */
/* ------------------------------------------------------------------ */

const FILAMENT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * The filaments' own vertex stage: the thread swells where a strike wave is
 * passing (a knot of mass running down the weft), so the twist is never the
 * same twice between pulses.
 */
const FILAMENT_BULGE_VERTEX = /* glsl */ `
  uniform float uWaveT;
  uniform float uBulge;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  varying float vKnot;
  void main() {
    vUv = uv;
    float knot = uWaveT < 0.0 ? 0.0 : exp(-abs(uv.y - uWaveT) * 22.0) * (1.0 - uWaveT * 0.4);
    vKnot = knot;
    vec3 p = position;
    // position.xy is radial from the corridor axis: swell the tube outward.
    p.xy *= 1.0 + knot * uBulge;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FILAMENT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uPulse;
  uniform float uGlowGain;
  uniform float uBeads;
  uniform float uFresnel;
  uniform vec3  uColor;
  uniform vec3  uCore;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3  uDeep;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  varying float vKnot;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    // Beads of light ride the thread from the caster to the front; the pulse
    // brightens the whole thread at once.
    float bead = pow(max(0.0, sin(vUv.y * uBeads - uTime * 6.0)), 6.0);
    float flicker = 0.75 + 0.25 * snoise(vec3(vUv.y * 14.0, uTime * 1.7, 0.0));
    float rim = fresnelTerm(vViewV, vNormalV, 1.6, uFresnel);
    float ends = smoothstep(0.0, 0.05, vUv.y) * (1.0 - smoothstep(0.95, 1.0, vUv.y));
    // Ramp: the deep tone in the thread's shadowed core, body on the flanks,
    // core light in the beads and the travelling knot.
    float lum = clamp(rim * 0.6 + bead * 0.7 + vKnot + uPulse * 0.3, 0.0, 1.0);
    vec3 col = gradient4(uDeep, uColor, mix(uColor, uCore, 0.6), uCore, lum);
    col *= uGlowGain * uGlobalGlow * (0.7 + rim + bead * 1.5 + vKnot * 2.5 + uPulse);
    float alpha = (0.3 + 0.35 * rim + 0.5 * bead + vKnot) * flicker * ends * uFade * uShaderIntensity;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The two counter-wound threads. Additive, fresnel-lit, beaded. */
export function createFilamentMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uPulse: { value: 0 },
      uGlowGain: { value: 1 },
      uBeads: { value: 60 },
      uFresnel: { value: 1 },
      uWaveT: { value: -1 },
      uBulge: { value: 1.2 },
      uColor: { value: new Color('#9f8fbe') },
      uCore: { value: new Color('#efe4ff') },
      uDeep: { value: new Color('#0e0819') }
    }),
    vertexShader: FILAMENT_BULGE_VERTEX,
    fragmentShader: FILAMENT_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uColor.value.set(c.gravityColor);
    u.uCore.value.set(c.coreColor);
    u.uGlowGain.value = c.filamentGlow ?? 1;
    u.uBeads.value = c.filamentBeads ?? 60;
    u.uFresnel.value = g().fresnel;
    u.uDeep.value.set(c.voidColor ?? '#0e0819');
    u.uBulge.value = c.filamentBulge ?? 1.2;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 3 · The bead rings (heddles)                                        */
/* ------------------------------------------------------------------ */

const RING_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uPulse;
  uniform float uGlowGain;
  uniform float uFresnel;
  uniform vec3  uColor;
  uniform vec3  uCore;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    // A comet of light chases round each heddle; noise keeps the beads from
    // lighting in lock-step.
    float chase = pow(fract(vUv.x - uTime * 0.35), 6.0);
    float n = snoise01(vec3(vUv.x * 24.0, vUv.y * 3.0, uTime * 0.6));
    float rim = fresnelTerm(vViewV, vNormalV, 2.2, uFresnel);
    vec3 col = mix(uColor, uCore, clamp(chase + rim * 0.4 + uPulse * 0.5, 0.0, 1.0));
    col *= uGlowGain * uGlobalGlow * (0.5 + chase * 2.0 + rim + uPulse);
    float alpha = (0.18 + rim * 0.45 + chase * 0.6) * (0.7 + 0.3 * n) * uFade * uShaderIntensity;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The six heddle rings. Shares the filament vertex stage. */
export function createWeftRingMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uPulse: { value: 0 },
      uGlowGain: { value: 1 },
      uFresnel: { value: 1 },
      uColor: { value: new Color('#9f8fbe') },
      uCore: { value: new Color('#efe4ff') }
    }),
    vertexShader: FILAMENT_VERTEX,
    fragmentShader: RING_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uColor.value.set(c.gravityColor);
    u.uCore.value.set(c.coreColor);
    u.uGlowGain.value = c.ringGlow ?? 1;
    u.uFresnel.value = g().fresnel;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 4 · The shuttle (the core)                                          */
/* ------------------------------------------------------------------ */

const SHUTTLE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uWobble;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  ${noiseGLSL}
  void main() {
    vUv = uv;
    // Space boils on the shuttle's skin: a slow noise displacement along the
    // normal, pinned at the tips so the silhouette stays a shuttle.
    float tips = sin(3.14159265 * uv.y);
    float n = snoise(position * 7.0 + vec3(0.0, 0.0, uTime * 0.8));
    vec3 p = position + normal * n * 0.018 * uWobble * tips;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHUTTLE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uPulse;
  uniform float uFlare;
  uniform float uHorizon;
  uniform float uGlowGain;
  uniform vec3  uColor;
  uniform vec3  uCore;
  uniform vec3  uVoid;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    // An event horizon, not a glow ball: the body is near-black and only the
    // grazing rim burns. The waist band carries the weft colour round.
    float rim = fresnelTerm(vViewV, vNormalV, uHorizon, 1.0);
    float waist = exp(-pow((vUv.y - 0.5) * 14.0, 2.0));
    float swirl = snoise01(vec3(vUv.x * 6.0 + uTime * 0.7, vUv.y * 5.0, uTime * 0.3));
    vec3 body = uVoid * (0.35 + 0.25 * swirl);
    vec3 glow = mix(uColor, uCore, rim) * (rim * 2.2 + waist * (0.6 + uPulse) + uFlare * 2.5);
    vec3 col = body + glow * uGlowGain * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(col, uFade);
  }
`;

/** The shuttle: a dark mass with a burning horizon. Normal blending, so it occludes. */
export function createShuttleMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uPulse: { value: 0 },
      uFlare: { value: 0 },
      uWobble: { value: 1 },
      uHorizon: { value: 2.4 },
      uGlowGain: { value: 1 },
      uColor: { value: new Color('#9f8fbe') },
      uCore: { value: new Color('#efe4ff') },
      uVoid: { value: new Color('#120d1c') }
    }),
    vertexShader: SHUTTLE_VERTEX,
    fragmentShader: SHUTTLE_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uColor.value.set(c.gravityColor);
    u.uCore.value.set(c.coreColor);
    u.uVoid.value.set(c.voidColor ?? '#120d1c');
    u.uHorizon.value = Math.max(0.3, (c.coreHorizon ?? 2.4) / Math.max(0.1, g().fresnel));
    u.uGlowGain.value = c.coreGlow ?? 1;
    u.uWobble.value = (c.coreWobble ?? 1) * g().noiseStrength;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 5 · Compression rings                                               */
/* ------------------------------------------------------------------ */

const PLAIN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const COMPRESSION_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uGlowGain;
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    // Thirty-six crests march round the ring; noise tears the band so the
    // compression reads as a shock, not a hoop.
    float pulse = pow(max(0.0, cos(vUv.x * 37.7 - uTime * 4.0)), 12.0);
    float tear = smoothstep(-0.4, 0.5, snoise(vec3(vUv.x * 9.0, uTime * 1.3, 0.0)));
    vec3 col = uColor * uGlowGain * uGlobalGlow * (1.0 + pulse * 1.5);
    gl_FragColor = vec4(col, clamp((0.35 + 0.5 * pulse) * tear * uFade * uShaderIntensity, 0.0, 1.0));
  }
`;

/** One compression wave (three rings share it). Additive. */
export function createCompressionMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 0 },
      uGlowGain: { value: 1 },
      uColor: { value: new Color('#efe4ff') }
    }),
    vertexShader: PLAIN_VERTEX,
    fragmentShader: COMPRESSION_FRAGMENT
  });
  material.userData.sync = (c) => {
    material.uniforms.uColor.value.set(c.coreColor);
    material.uniforms.uGlowGain.value = c.compressionGlow ?? 1;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 6 · The lens (LAYER.DISTORTION)                                     */
/* ------------------------------------------------------------------ */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uPulse;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float along = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.92, 1.0, vUv.y));
    float mask = pow(max(0.0, across), 1.5) * along;
    // Breathing noise keeps the refraction alive between pulses.
    float breathe = 0.85 + 0.15 * snoise(vec3(vUv * vec2(3.0, 12.0), uTime * 0.6));
    float s = uStrength * mask * (0.65 + uPulse * 0.35) * breathe;
    if (s < 0.001) discard;
    // Pull the screen toward the corridor's spine, with a travelling shear.
    vec2 delta = vec2(0.5 - vUv.x, 0.08 * sin(vUv.y * 18.0 - uTime * 3.0));
    float l = length(delta);
    vec2 direction = l < 0.001 ? vec2(0.0, 1.0) : delta / l;
    gl_FragColor = vec4(direction * 0.5 + 0.5, s, mask);
  }
`;

/** Distortion pass proxy: pull screen-space samples toward the corridor spine. */
export function createGravityLensMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: PLAIN_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });
}

/* ------------------------------------------------------------------ */
/* 7 · The floor weave                                                 */
/* ------------------------------------------------------------------ */

const FLOOR_VERTEX = /* glsl */ `
  varying vec2 vUv;
  ${SOFT_VARYINGS}
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
    vClip = gl_Position;
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uPulse;
  uniform float uSag;
  uniform float uDensity;
  uniform float uThread;
  uniform float uGlowGain;
  uniform float uOpacity;
  uniform float uAspect;   // corridor length / width, keeps the weave square
  uniform float uNoise;
  uniform float uSoft;
  uniform float uFieldGlow;
  uniform float uFieldFlow;
  uniform float uRimGlow;
  uniform float uWaveT;    // 0..1 front of the newest strike wave, <0 when none
  uniform float uWaveWidth;
  uniform vec3  uWeft;
  uniform vec3  uVoid;
  uniform vec3  uBody;
  uniform vec3  uTint;
  uniform vec3  uCore;
  uniform sampler2D uSceneDepth;
  uniform vec2  uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${SOFT_VARYINGS}

  ${noiseGLSL}
  ${commonGLSL}
  ${SOFT_FRAGMENT}

  float line(float v, float w) {
    float d = abs(fract(v) - 0.5);
    return 1.0 - smoothstep(w * 0.5, w, d);
  }

  void main() {
    float x = vUv.x * 2.0 - 1.0;               // -1..1 across
    float well = exp(-x * x * 2.2);            // depth of the sag
    float along = vUv.y * uAspect;             // metres-ish down the corridor
    // The cloth of space-time, pinched toward the spine.
    float pinch = x * (1.0 - uSag * 0.55 * well);
    float jitter = snoise(vec3(vUv * vec2(4.0, 4.0 * uAspect), uTime * 0.2)) * 0.06 * uNoise;

    // A FILLED warp field: long bands of bent space dragged toward the front,
    // shaped by the pinch so they converge on the spine. This is the body of
    // the corridor; the weave only rides on top of it.
    float bands = fbm3(vec3(pinch * 2.6, along * 0.55 - uTime * uFieldFlow, uTime * 0.12)) * 0.5 + 0.5;
    float streak = pow(max(0.0, sin(pinch * 7.0 + bands * 5.0 * uNoise - along * 0.4 + uTime * 0.6)), 4.0);
    // Mostly deep: only the crests of the bands and the spine climb the ramp.
    float heat = clamp(well * 0.28 + smoothstep(0.45, 0.85, bands) * 0.55 + streak * 0.35 * well, 0.0, 1.0);

    // The weave, thin and dim: warp threads bunch at the spine, weft threads
    // bow toward the front the deeper they sit.
    float warp = line(pinch * uDensity * 0.5 + jitter, uThread);
    float bow = vUv.y * uAspect * uDensity * 0.5 - well * uSag * 0.6 - uTime * 0.35;
    // Cross threads only show where a band crest lights them, so the weave
    // never reads as a tiled grid.
    float weft = line(bow + jitter, uThread) * smoothstep(0.5, 0.8, bands);
    float threads = max(warp * 0.7, weft) * (0.3 + 0.7 * well);

    // The walls: a crushed lip where the floor folds up at the capsule edge.
    float rim = exp(-abs(abs(x) - 0.78) * 26.0);

    // A strike wave rolling from the caster to the front.
    float wave = 0.0;
    if (uWaveT >= 0.0) {
      float d = (vUv.y - uWaveT) * uAspect;
      // A chevron (it leads at the spine), thin, and it gathers strength as it
      // runs toward the bodies at the front.
      wave = exp(-abs(d + x * x * 0.8) / max(0.05, uWaveWidth)) * smoothstep(0.0, 0.25, uWaveT) * (0.55 + 0.45 * uWaveT) * well;
    }

    // Four-stop ramp: deep well -> saturated body -> pale tint -> white core.
    float t = clamp(heat * 0.75 + threads * 0.1 + rim * 0.35 * uRimGlow + wave * 0.7, 0.0, 1.0);
    vec3 ramp = gradient4(uVoid, uBody, uTint, uCore, t);
    // Only the bright end of the ramp emits; the deep end darkens the floor.
    float emit = smoothstep(0.25, 1.0, t);
    vec3 col = mix(uVoid, ramp * uFieldGlow, smoothstep(0.08, 0.5, t));
    col += uWeft * threads * 0.25 * uGlowGain;
    col += uCore * wave * 0.6;
    col *= mix(1.0, uGlobalGlow * (1.0 + uPulse * 0.25), emit);

    float side = 1.0 - smoothstep(0.82, 1.0, abs(x));
    float ends = smoothstep(0.0, 0.035, vUv.y) * (1.0 - smoothstep(0.965, 1.0, vUv.y));
    float mask = side * ends * uFade * sceneSoft(uSoft);
    float alpha = (uOpacity * (0.55 + 0.45 * well) + emit * 0.3 + wave * 0.2) * mask * uShaderIntensity;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * The floor the corridor bends. Normal blending, because a gravity well has
 * to *darken* the stone under it; the threads are bright enough (toneMapped
 * false) to bloom through the dark.
 */
export function createWeftFloorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 0 },
      uPulse: { value: 0 },
      uSag: { value: 1 },
      uDensity: { value: 6 },
      uThread: { value: 0.08 },
      uGlowGain: { value: 1 },
      uOpacity: { value: 0.6 },
      uAspect: { value: 4 },
      uNoise: { value: 1 },
      uSoft: { value: 0 },
      uFieldGlow: { value: 1 },
      uFieldFlow: { value: 0.6 },
      uRimGlow: { value: 1 },
      uWaveT: { value: -1 },
      uWaveWidth: { value: 0.6 },
      uWeft: { value: new Color('#c9b8ff') },
      uVoid: { value: new Color('#0e0819') },
      uBody: { value: new Color('#7c4fe0') },
      uTint: { value: new Color('#c4a8ff') },
      uCore: { value: new Color('#f7f1ff') }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });
  /** @param {object} c live settings  @param {number} aspect length ÷ width */
  material.userData.sync = (c, aspect) => {
    const u = material.uniforms;
    u.uWeft.value.set(c.weftColor ?? c.coreColor);
    u.uVoid.value.set(c.voidColor ?? '#120d1c');
    u.uSag.value = c.floorSag ?? 1;
    u.uDensity.value = c.weaveDensity ?? 6;
    u.uThread.value = c.weaveThread ?? 0.08;
    u.uGlowGain.value = c.weaveGlow ?? 1;
    u.uOpacity.value = (c.floorOpacity ?? 0.6) * g().opacity;
    u.uAspect.value = Math.max(0.1, aspect);
    u.uNoise.value = g().noiseStrength;
    u.uBody.value.set(c.gravityColor);
    u.uTint.value.set(c.tintColor ?? c.weftColor ?? c.coreColor);
    u.uCore.value.set(c.coreColor);
    u.uFieldGlow.value = c.fieldGlow ?? 1;
    u.uFieldFlow.value = c.fieldFlow ?? 0.6;
    u.uRimGlow.value = c.rimGlow ?? 1;
    u.uWaveWidth.value = c.waveWidth ?? 0.6;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 8 · Loom stone — the arches and the weights                         */
/* ------------------------------------------------------------------ */

const STONE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    vUv = uv;
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const STONE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;      // 1 = whole; <1 dissolves from the noise threshold
  uniform float uFlare;     // the beat: seams flood with core light
  uniform float uSeamGlow;
  uniform float uSeamScale;
  uniform float uGloss;
  uniform float uRunes;
  uniform vec3  uStone;
  uniform vec3  uDeep;
  uniform vec3  uBody;
  uniform vec3  uTint;
  uniform vec3  uCore;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    // Dark, dense stone: grain, a little strata, lit by the sun with a wrap
    // so the shadow side still reads, a tight specular sheen, a violet rim.
    float grain = fbm3(vLocal * 9.0 * uSeamScale);
    float strata = 0.5 + 0.5 * sin(vWorld.y * 11.0 + grain * 3.0);
    vec3 base = mix(uDeep, uStone, 0.55 + 0.35 * grain + 0.1 * strata);
    float ndl = dot(N, L);
    float diffuse = 0.2 + 0.8 * clamp(ndl * 0.6 + 0.4, 0.0, 1.0);
    vec3 H = normalize(L + V);
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), 48.0) * uGloss;
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    vec3 col = base * diffuse + vec3(spec) * 0.6 + uBody * fres * 0.3;

    // Seams: the stone is cracked, and bent space shows through the cracks —
    // thin lines where a noise field crosses zero.
    float crack = 1.0 - abs(snoise(vLocal * vec3(5.0, 5.0, 7.0) * uSeamScale + vec3(0.0, 0.0, uTime * 0.05)));
    float seam = pow(crack, 22.0);
    // Runes march along the sweep (uv.y): tied-off warp marks.
    float rune = step(0.82, fract(vUv.y * 22.0 - uTime * 0.4)) * step(0.35, abs(vUv.x - 0.5)) * uRunes;
    float lum = clamp(seam * (0.45 + 0.55 * uFlare) + rune * 0.6 + uFlare * 0.25, 0.0, 1.0);
    vec3 glow = gradient4(uDeep, uBody, uTint, uCore, lum);
    col += glow * lum * uSeamGlow * uGlobalGlow * uShaderIntensity * (1.0 + uFlare * 2.0);

    // Dissolve for the exit, with a burning core-coloured edge.
    if (uFade < 0.999) {
      float k = snoise01(vWorld * 2.4) - (1.0 - uFade);
      if (k < 0.0) discard;
      col += uCore * (1.0 - smoothstep(0.0, 0.07, k)) * 2.0;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Lit loom stone for the arches and the weights. Opaque (it occludes and
 * writes depth, so it belongs on LAYER.WORLD), sun-lit with a wrap term, its
 * seams glowing the cast's ramp and flooding white on a strike.
 */
export function createLoomStoneMaterial() {
  const material = new ShaderMaterial({
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uFlare: { value: 0 },
      uSeamGlow: { value: 1 },
      uSeamScale: { value: 1 },
      uGloss: { value: 0.8 },
      uRunes: { value: 1 },
      uStone: { value: new Color('#2b2340') },
      uDeep: { value: new Color('#0e0819') },
      uBody: { value: new Color('#7c4fe0') },
      uTint: { value: new Color('#c4a8ff') },
      uCore: { value: new Color('#f7f1ff') }
    }),
    vertexShader: STONE_VERTEX,
    fragmentShader: STONE_FRAGMENT
  });
  /** @param {object} c live settings */
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uStone.value.set(c.archColor ?? '#2b2340');
    u.uDeep.value.set(c.voidColor ?? '#0e0819');
    u.uBody.value.set(c.gravityColor);
    u.uTint.value.set(c.tintColor ?? c.coreColor);
    u.uCore.value.set(c.coreColor);
    u.uSeamGlow.value = c.archSeamGlow ?? 1;
    u.uSeamScale.value = g().noiseFrequency;
    u.uGloss.value = c.archGloss ?? 0.8;
    u.uRunes.value = c.archRunes ?? 1;
  };
  return material;
}
