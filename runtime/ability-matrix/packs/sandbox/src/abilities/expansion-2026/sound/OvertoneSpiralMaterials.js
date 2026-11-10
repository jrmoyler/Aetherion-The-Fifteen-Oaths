import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';

/**
 * Materials for OVERTONE SPIRAL — one factory per layer.
 *
 * The palette is three tones, one per harmonic (`toneA` the fundamental,
 * `toneB` the second, `toneC` the third), plus `metalColor` for the fork.
 * Every factory owns its `uTime` box: the ability writes the cast's visual
 * clock into it (held at zero under `prefers-reduced-motion`). Emissive
 * layers set `toneMapped: false` so bloom carries them; the fork is
 * normal-blended so it reads as a solid object the light comes *off*.
 */

const g = () => settings.global;

/* ------------------------------------------------------------------ */
/* 1 · Harmonic fronts                                                 */
/* ------------------------------------------------------------------ */

const FRONT_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;     // metres — the mesh is not scaled
  uniform float uWidth;      // half-width of the band, metres
  uniform float uHeight;     // crest height, metres
  uniform float uLobes;      // standing-wave lobes round the ring
  uniform float uAmp;        // lobe amplitude, metres
  varying vec2  vUv;
  varying float vCrest;

  void main() {
    vUv = uv;
    vec2 bearing = position.xz;              // unit circle
    float a = atan(bearing.y, bearing.x);
    float across = uv.y * 2.0 - 1.0;         // -1 inner .. 1 outer
    // A pressure ridge: gaussian across the band, rippled by the harmonic's
    // lobes travelling round it.
    float crest = exp(-across * across * 2.5);
    float lobe = sin(a * uLobes + uTime * 8.0);
    float r = uRadius + across * uWidth + lobe * uAmp * 0.35;
    float y = crest * uHeight * (0.75 + 0.25 * lobe) + lobe * uAmp * crest;
    vCrest = crest;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(bearing.x * r, y, bearing.y * r, 1.0);
  }
`;

const FRONT_FRAGMENT = /* glsl */ `
  uniform float uFade;
  uniform float uTime;
  uniform float uHarmonic;
  uniform float uGlowGain;
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2  vUv;
  varying float vCrest;
  ${noiseGLSL}
  void main() {
    // Nodes: bright beads where the harmonic's standing wave peaks.
    float node = pow(abs(sin(vUv.x * 37.699 * uHarmonic - uTime * 2.0)), 8.0);
    float grain = 0.8 + 0.2 * snoise(vec3(vUv.x * 60.0, vUv.y * 3.0, uTime * 1.5));
    float centre = pow(vCrest, 1.4);
    float a = (centre * 0.5 + node * 0.4 * centre) * grain * uFade * uShaderIntensity;
    vec3 col = uColor * uGlowGain * uGlobalGlow * (1.0 + node * 0.8);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/**
 * One harmonic front. `frequency` (1, 1.5, 2 for the three fronts) sets both
 * the node count of the shimmer and — via `uLobes` — the ripple round the
 * ring, so the three read as three different notes.
 */
export function createFrontMaterial(color = new Color(0xa6ff85), frequency = 1) {
  const material = new ShaderMaterial({
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uColor: { value: color },
      uHarmonic: { value: frequency },
      uRadius: { value: 0 },
      uWidth: { value: 0.12 },
      uHeight: { value: 0.3 },
      uLobes: { value: 6 },
      uAmp: { value: 0.08 },
      uGlowGain: { value: 1 }
    }),
    vertexShader: FRONT_VERTEX,
    fragmentShader: FRONT_FRAGMENT
  });
  /** @param {object} c live settings  @param {number} index which harmonic */
  material.userData.sync = (c, index) => {
    const u = material.uniforms;
    u.uWidth.value = c.frontWidth ?? 0.12;
    u.uHeight.value = c.frontHeight ?? 0.3;
    u.uLobes.value = (c.frontLobes ?? 6) + index * 2;
    u.uAmp.value = (c.frontRipple ?? 0.08) * g().noiseStrength;
    u.uGlowGain.value = c.frontGlow ?? 1;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 2 · The resonator (fork + stem)                                     */
/* ------------------------------------------------------------------ */

const FORK_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uStrike;     // 0..1, decays after each strike
  uniform float uBuzz;       // vibration amplitude, metres
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vec3 p = position;
    // A struck tine bends in its first mode: displacement grows with the
    // square of height, flipping sign at audio-ish speed and decaying.
    float h = clamp(position.y + 0.5, 0.0, 1.0);
    p.x += sin(uTime * 90.0) * uBuzz * uStrike * h * h;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FORK_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uStrike;
  uniform float uGlowGain;
  uniform float uFresnel;
  uniform vec3  uColor;      // the fundamental tone
  uniform vec3  uMetal;
  uniform vec3  uDeep;       // the dark deep stop of the steel
  uniform vec3  uRimColor;   // fresnel rim tone (the second harmonic)
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  varying vec3 vNormalW;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec3 n = normalize(vNormalW);
    float lambert = clamp((dot(n, normalize(uLightDir)) + 0.3) / 1.3, 0.0, 1.0);
    // Brushed steel: fine streaks along the length, a sheen that rides them.
    float brush = 0.85 + 0.15 * snoise(vec3(vUv.x * 80.0, vUv.y * 4.0, 0.0));
    float sheen = pow(abs(sin(vUv.y * 9.0 + uTime * 0.6 + vUv.x * 6.28318)), 30.0);
    float rim = fresnelTerm(vViewV, vNormalV, 3.0, uFresnel);
    // Nodal bands glow on the strike: the standing wave made visible.
    float nodes = pow(abs(cos(vUv.y * 3.14159 * 3.0)), 18.0) * uStrike;
    // Four-stop ramp on the steel: the deep stop owns the shadowed side and
    // the foot, the body tone the lit faces, the sheen the pale tint, and the
    // white-hot core lives only in the nodal bands on a strike.
    float lit = (0.15 + 0.85 * lambert) * brush;
    float foot = smoothstep(0.0, 0.55, vUv.y);
    vec3 col = mix(uDeep, uMetal, clamp(lit * (0.45 + 0.55 * foot), 0.0, 1.0));
    col += mix(uMetal, vec3(1.0), 0.35) * sheen * 0.45;
    col += uRimColor * rim * 0.9 * uGlowGain * uGlobalGlow * uShaderIntensity;
    col += uColor * (nodes * 3.2 + uStrike * 0.18) * uGlowGain * uGlobalGlow * uShaderIntensity;
    col += vec3(1.0) * nodes * uStrike * 0.6 * uGlowGain;
    gl_FragColor = vec4(col, uFade);
  }
`;

/** Brushed steel with a fresnel rim and nodal bands that ring on the strike. */
export function createResonatorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uStrike: { value: 0 },
      uBuzz: { value: 0.02 },
      uGlowGain: { value: 1 },
      uFresnel: { value: 1 },
      uColor: { value: new Color(0xa6ff85) },
      uMetal: { value: new Color('#c9d6c2') },
      uDeep: { value: new Color('#071312') },
      uRimColor: { value: new Color(0x54ebe6) }
    }),
    vertexShader: FORK_VERTEX,
    fragmentShader: FORK_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uColor.value.set(c.toneA);
    u.uMetal.value.set(c.metalColor ?? '#c9d6c2');
    u.uDeep.value.set(c.metalDeep ?? '#071312');
    u.uRimColor.value.set(c.toneB);
    u.uGlowGain.value = c.resonatorGlow ?? 1;
    u.uBuzz.value = c.forkBuzz ?? 0.02;
    u.uFresnel.value = g().fresnel;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 3 · The carrier                                                     */
/* ------------------------------------------------------------------ */

const CARRIER_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CARRIER_FRAGMENT = /* glsl */ `
  uniform float uFade;
  uniform float uTime;
  uniform float uHarmonic;
  uniform float uGlowGain;
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    float centre = pow(max(0.0, 1.0 - abs(vUv.y - 0.5) * 2.0), 1.4);
    float node = pow(abs(sin(vUv.x * 37.699 * uHarmonic - uTime * 2.0)), 8.0);
    float flick = 0.8 + 0.2 * snoise(vec3(vUv.x * 12.0, uTime * 3.0, 0.0));
    float a = (centre * 0.5 + node * 0.4) * flick * uFade;
    gl_FragColor = vec4(uColor * uGlowGain * uGlobalGlow * (1.0 + node * 0.8), clamp(a, 0.0, 1.0));
  }
`;

/** The ringing bead that carries the cast to the circle. */
export function createCarrierMaterial(color = new Color(0x7af5bd), frequency = 2) {
  const material = new ShaderMaterial({
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uFade: { value: 1 },
      uTime: { value: 0 },
      uColor: { value: color },
      uHarmonic: { value: frequency },
      uGlowGain: { value: 1 },
      uGlobalGlow: sharedUniforms().uGlobalGlow
    },
    vertexShader: CARRIER_VERTEX,
    fragmentShader: CARRIER_FRAGMENT
  });
  material.userData.sync = (c) => {
    material.uniforms.uColor.value.set(c.toneA);
    material.uniforms.uGlowGain.value = c.carrierGlow ?? 1;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 4 · The Chladni plate                                               */
/* ------------------------------------------------------------------ */

const PLATE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uMode;       // 0..2: which harmonic the plate is ringing in
  uniform float uSpin;       // radians, integrated on the CPU
  uniform float uLine;
  uniform float uGlowGain;
  uniform float uOpacity;
  uniform vec3  uFronts;     // the three fronts' radii as a fraction of the plate
  uniform vec3  uToneA;
  uniform vec3  uToneB;
  uniform vec3  uToneC;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}

  /** Chladni figure for a square plate in mode (n, m): zero on the nodal lines. */
  float chladni(vec2 p, float n, float m) {
    const float PI = 3.14159265;
    return cos(n * PI * p.x) * cos(m * PI * p.y) - cos(m * PI * p.x) * cos(n * PI * p.y);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // The figure turns slowly — the spiral in the name.
    p = rot2(uSpin) * p;
    // Morph between three modes as the three harmonics ring in.
    float m0 = chladni(p, 1.0, 2.0);
    float m1 = chladni(p, 2.0, 5.0);
    float m2 = chladni(p, 3.0, 7.0);
    float f = mix(mix(m0, m1, clamp(uMode, 0.0, 1.0)), m2, clamp(uMode - 1.0, 0.0, 1.0));
    // Sand gathers on the nodal lines: thin where |f| is small, grainy.
    float grain = snoise01(vec3(p * 40.0, 0.0));
    float lines = (1.0 - smoothstep(0.0, uLine, abs(f))) * (0.6 + 0.4 * grain);
    // Each front leaves a bright echo where it has just passed.
    vec3 echo = vec3(exp(-abs(r - uFronts.x) * 30.0), exp(-abs(r - uFronts.y) * 30.0), exp(-abs(r - uFronts.z) * 30.0));
    vec3 tone = mix(mix(uToneA, uToneB, clamp(uMode, 0.0, 1.0)), uToneC, clamp(uMode - 1.0, 0.0, 1.0));
    vec3 col = (tone * lines + uToneA * echo.x + uToneB * echo.y + uToneC * echo.z) * uGlowGain * uGlobalGlow;
    float edge = 1.0 - smoothstep(0.85, 1.0, r);
    float alpha = (lines * uOpacity + dot(echo, vec3(0.35))) * edge * uFade * uShaderIntensity;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The plate under the fork: Chladni nodal lines that change figure per strike. */
export function createPlateMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 0 },
      uMode: { value: 0 },
      uSpin: { value: 0 },
      uLine: { value: 0.08 },
      uGlowGain: { value: 1 },
      uOpacity: { value: 0.5 },
      uFronts: { value: new Vector3(-1, -1, -1) },
      uToneA: { value: new Color(0xa6ff85) },
      uToneB: { value: new Color(0x54ebe6) },
      uToneC: { value: new Color(0xe6d1ff) }
    }),
    vertexShader: CARRIER_VERTEX,
    fragmentShader: PLATE_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uToneA.value.set(c.toneA);
    u.uToneB.value.set(c.toneB);
    u.uToneC.value.set(c.toneC);
    u.uLine.value = c.plateLine ?? 0.08;
    u.uGlowGain.value = c.plateGlow ?? 1;
    u.uOpacity.value = (c.plateOpacity ?? 0.5) * g().opacity;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 5 · The overtone helix                                              */
/* ------------------------------------------------------------------ */

const HELIX_VERTEX = /* glsl */ `
  attribute float aTurn;
  varying vec2  vUv;
  varying float vTurn;
  void main() {
    vUv = uv;
    vTurn = aTurn;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HELIX_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uDraw;       // how far up the series is lit, in turns
  uniform float uGlowGain;
  uniform vec3  uToneA;
  uniform vec3  uToneC;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2  vUv;
  varying float vTurn;
  void main() {
    // Lit up to \`uDraw\` turns, with a soft leading edge: each strike climbs
    // the series by a harmonic.
    float lit = 1.0 - smoothstep(uDraw - 0.4, uDraw, vTurn);
    if (lit <= 0.001) discard;
    float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
    // Dashes race up the spiral like the partials of the note.
    float dash = pow(max(0.0, sin(vUv.y * 90.0 - uTime * 12.0)), 4.0);
    vec3 col = mix(uToneA, uToneC, vUv.y) * uGlowGain * uGlobalGlow * (0.6 + dash * 1.4);
    float a = across * (0.25 + 0.6 * dash) * lit * uFade * (1.0 - 0.5 * vUv.y) * uShaderIntensity;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The overtone series climbing the fork, lit one harmonic per strike. */
export function createHelixMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uFade: { value: 0 },
      uDraw: { value: 0 },
      uGlowGain: { value: 1 },
      uToneA: { value: new Color(0xa6ff85) },
      uToneC: { value: new Color(0xe6d1ff) }
    }),
    vertexShader: HELIX_VERTEX,
    fragmentShader: HELIX_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uToneA.value.set(c.toneA);
    u.uToneC.value.set(c.toneC);
    u.uGlowGain.value = c.helixGlow ?? 1;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 6 · Notes                                                           */
/* ------------------------------------------------------------------ */

const NOTE_VERTEX = /* glsl */ `
  attribute float phase;
  uniform float uTime;
  uniform float uRadius;
  uniform float uRise;
  uniform float uSize;
  uniform float uSwirl;
  varying float vA;
  varying float vPhase;
  void main() {
    float p = fract(phase + uTime * 0.4);
    // Notes spiral outward as they rise — the fronts carry them off.
    float a = p * uSwirl;
    vec2 xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xz;
    vec3 q = vec3(xz.x * uRadius * (0.2 + p), position.y + p * uRise, xz.y * uRadius * (0.2 + p));
    vA = (1.0 - p) * smoothstep(0.0, 0.08, p);
    vPhase = phase;
    vec4 mv = modelViewMatrix * vec4(q, 1.0);
    gl_PointSize = clamp(uSize / -mv.z, 1.0, 9.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const NOTE_FRAGMENT = /* glsl */ `
  uniform float uFade;
  uniform vec3  uToneA;
  uniform vec3  uToneB;
  uniform vec3  uToneC;
  uniform float uGlobalGlow;
  varying float vA;
  varying float vPhase;
  void main() {
    // A note glyph in the point sprite: an oval head low-left and a stem
    // rising from its right side.
    vec2 c = gl_PointCoord - vec2(0.5);
    c.y = -c.y;
    vec2 h = (c - vec2(-0.1, -0.22)) * vec2(1.0, 1.45);
    float head = 1.0 - smoothstep(0.17, 0.24, length(h));
    float stem = (1.0 - smoothstep(0.03, 0.07, abs(c.x - 0.09))) * step(-0.22, c.y) * (1.0 - smoothstep(0.38, 0.45, c.y));
    float shape = max(head, stem);
    vec3 tone = vPhase < 0.333 ? uToneA : (vPhase < 0.666 ? uToneB : uToneC);
    gl_FragColor = vec4(tone * uGlobalGlow, shape * vA * uFade);
  }
`;

/** The notes that drift up off the plate. */
export function createNoteMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 1 },
      uRadius: { value: 1 },
      uRise: { value: 1.5 },
      uSize: { value: 18 },
      uSwirl: { value: 2 },
      uToneA: { value: new Color(0xa6ff85) },
      uToneB: { value: new Color(0x54ebe6) },
      uToneC: { value: new Color(0xe6d1ff) },
      uGlobalGlow: sharedUniforms().uGlobalGlow
    },
    vertexShader: NOTE_VERTEX,
    fragmentShader: NOTE_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uToneA.value.set(c.toneA);
    u.uToneB.value.set(c.toneB);
    u.uToneC.value.set(c.toneC);
    u.uRise.value = c.noteRise ?? 1.5;
    u.uSize.value = (c.noteSize ?? 18) * g().particleSize;
    u.uSwirl.value = c.noteSwirl ?? 2;
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* 7 · The pressure warp (LAYER.DISTORTION)                            */
/* ------------------------------------------------------------------ */

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uWidth;      // ring width as a fraction of the disc
  uniform vec3  uFronts;     // fronts' radii as a fraction of the disc (<0 = none)
  uniform vec3  uFronts2;    // their fades
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // Each front is a ring of compressed air: refraction pushes outward on
    // its leading face and inward behind it.
    vec3 d = vec3(r) - uFronts;
    vec3 ring = exp(-(d * d) / max(1e-4, uWidth * uWidth)) * step(vec3(0.0), uFronts) * uFronts2;
    float shove = dot(ring, sign(d));
    float s = uStrength * (ring.x + ring.y + ring.z) * (0.85 + 0.15 * snoise(vec3(p * 5.0, uTime)));
    if (s < 0.001) discard;
    vec2 dir = r < 0.001 ? vec2(0.0, 1.0) : p / r * (shove >= 0.0 ? 1.0 : -1.0);
    gl_FragColor = vec4(dir * 0.5 + 0.5, s, clamp(ring.x + ring.y + ring.z, 0.0, 1.0));
  }
`;

/** Three rings of bent air riding the three fronts. Screen-warp proxy. */
export function createPressureWarpMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uWidth: { value: 0.04 },
      uFronts: { value: new Vector3(-1, -1, -1) },
      uFronts2: { value: new Vector3() }
    },
    vertexShader: CARRIER_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });
}

/* ------------------------------------------------------------------ */
/* 8 · The carrier's wake — caster to fork                             */
/* ------------------------------------------------------------------ */

const WAKE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uLength;     // metres, hand to head
  uniform float uStartY;     // metres, hand height
  uniform float uEndY;       // metres, head height
  uniform float uWidth;      // half-width at the belly, metres
  uniform float uAmp;        // standing-wave swing, metres
  uniform float uWaves;      // wavelengths along the wake
  uniform float uCross;      // 0 flat ribbon, 1 the crossed (upright) one
  varying vec2  vUv;
  varying float vNode;
  void main() {
    vUv = uv;
    float s = uv.x;
    // Pinched at the hand and at the head, full in the middle.
    float env = sin(3.14159 * clamp(s, 0.0, 1.0));
    float wave = sin(s * uWaves * 6.28318 - uTime * 14.0);
    float stand = sin(s * uWaves * 3.14159) * cos(uTime * 22.0);
    float swing = (0.65 * wave + 0.35 * stand) * uAmp * env;
    float w = uWidth * (0.35 + 0.65 * env);
    vec3 side = mix(vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), uCross);
    vec3 swingDir = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), uCross);
    vec3 p = vec3(0.0, mix(uStartY, uEndY, s), s * uLength);
    p += side * position.x * w + swingDir * swing;
    vNode = abs(wave);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const WAKE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uDraw;       // 0..1: the head has reached this far
  uniform float uTail;       // 0..1: the tail has been reeled in to here
  uniform float uFade;
  uniform float uGlowGain;
  uniform vec3  uCore;       // white-hot core (toneA, pushed past 1)
  uniform vec3  uBody;       // saturated body (toneB)
  uniform vec3  uDeep;       // the dark deep stop
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2  vUv;
  varying float vNode;
  ${noiseGLSL}
  void main() {
    if (vUv.x > uDraw || vUv.x < uTail) discard;
    float across = abs(vUv.y * 2.0 - 1.0);          // 0 centre .. 1 edge
    float core = pow(1.0 - across, 6.0);
    float body = 1.0 - smoothstep(0.25, 0.95, across);
    float deepEdge = smoothstep(0.3, 0.8, across);
    // Pressure beads travel down the wake toward the fork.
    float beads = pow(abs(sin(vUv.x * 46.0 - uTime * 30.0)), 10.0);
    float grain = 0.75 + 0.25 * snoise(vec3(vUv.x * 30.0, vUv.y * 4.0, uTime * 4.0));
    // The head glows hotter; the tail darkens toward the deep tone.
    float head = smoothstep(uDraw - 0.12, uDraw, vUv.x);
    vec3 col = mix(uBody, uDeep, deepEdge) * grain;
    col = mix(col, uCore * 1.5, clamp(core * (0.6 + 0.4 * vNode) + beads * core * 0.8 + head * core, 0.0, 1.0));
    col *= uGlowGain * uGlobalGlow;
    float ends = smoothstep(uTail, uTail + 0.06, vUv.x);
    float alpha = (0.85 * body + core) * uFade * uShaderIntensity * ends;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * The wake: a ribbon of sound strung from the caster to the carrier, then to
 * the fork. Normal-blended so its deep edges darken the floor behind it and
 * its core can glow: a four-stop ramp across the ribbon (deep → body → tint →
 * hot core), beads of pressure running down it toward the target.
 */
export function createWakeMaterial(cross = 0) {
  const material = new ShaderMaterial({
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTime: { value: 0 },
      uLength: { value: 1 },
      uStartY: { value: 1.3 },
      uEndY: { value: 1 },
      uWidth: { value: 0.3 },
      uAmp: { value: 0.3 },
      uWaves: { value: 3 },
      uCross: { value: cross },
      uDraw: { value: 0 },
      uTail: { value: 0 },
      uFade: { value: 1 },
      uGlowGain: { value: 1 },
      uCore: { value: new Color(0xa6ff85) },
      uBody: { value: new Color(0x54ebe6) },
      uDeep: { value: new Color(0x072423) }
    }),
    vertexShader: WAKE_VERTEX,
    fragmentShader: WAKE_FRAGMENT
  });
  material.userData.sync = (c) => {
    const u = material.uniforms;
    u.uCore.value.set(c.toneA);
    u.uBody.value.set(c.toneB);
    u.uDeep.value.set(c.colorDeep ?? '#072423');
    u.uWidth.value = c.wakeWidth ?? 0.3;
    u.uAmp.value = c.wakeSwing ?? 0.3;
    u.uWaves.value = c.wakeWaves ?? 3;
    u.uGlowGain.value = c.wakeGlow ?? 1;
  };
  return material;
}
