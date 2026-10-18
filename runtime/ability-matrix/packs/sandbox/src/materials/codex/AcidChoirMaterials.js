import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Acid Choir — the bespoke shaders the choir is drawn with.
 *
 *  - **the voices** — every wall of acid in one draw call: cylindrical bands
 *    whose radius, height, harmonic and age are read out of uniform arrays
 *    by a per-vertex voice index. A wall's crest carries a *standing wave*
 *    (`sin(angle · harmonics) · cos(time)`), so each voice visibly rings at
 *    its own pitch — the higher voices ripple finer. The crest curls outward
 *    and, past `crashAt`, the wall slumps, leans out and tears into tatters.
 *    Shaded as liquid: streaks running down the face, a foaming lip, a rim.
 *  - **the warp** — the same bands on `LAYER.DISTORTION`: each voice bends
 *    the air as it walks, like a sound you can see.
 *  - **the font** — the cantor: a bulb of acid in the middle, displaced into
 *    a wobbling blob that heaves up on every note.
 *  - **the eaten stone** — a disc: every voice that has crossed a point has
 *    eaten it a little darker, so the floor ends in concentric terraces; a
 *    band of live acid rides just behind every walking front; grooves and
 *    pits are etched into the eaten stone.
 *  - **the note** — the bead of light that runs along the floor to the
 *    circle while the cast travels.
 *
 * Every material reads `settings.acidchoir` in `userData.sync(state)`.
 */

const ID = 'acidchoir';
export const MAX_VOICES = 8;

/* -------------------------------------------------------------------- */
/* The voices                                                           */
/* -------------------------------------------------------------------- */

const WALL_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uR[${MAX_VOICES}];
  uniform float uH[${MAX_VOICES}];
  uniform float uK[${MAX_VOICES}];      // 0..1 through its walk; <0 unborn, >1 gone
  uniform float uHarm[${MAX_VOICES}];
  uniform float uCrash[${MAX_VOICES}];  // 0..1 how far it has broken
  uniform float uCrestAmp;
  uniform float uCurl;
  uniform float uScale;                 // the warp stands a little proud
  uniform float uTime;

  attribute float aVoice;

  varying float vY;
  varying float vA;
  varying float vVoice;
  varying float vK;
  varying float vCrash;
  varying float vRing;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  void main() {
    int i = int(aVoice + 0.5);
    float k = uK[i];
    float live = step(0.0, k) * step(k, 1.0);
    float crash = uCrash[i];
    float a = position.x * 6.2831853;
    float y = position.y;
    // A standing wave on the crest, ringing at the voice's own pitch.
    float ring = sin(a * uHarm[i]) * cos(uTime * 7.0 + aVoice * 1.9);
    float H = uH[i] * (1.0 - crash * 0.85) * smoothstep(0.0, 0.12, k);
    float h = y * H * (1.0 + uCrestAmp * ring * y);
    float lean = uCurl * (1.0 + 2.5 * crash);
    float r = uR[i] + lean * y * y - 0.1 * (1.0 - y);
    vec3 out_ = vec3(cos(a), 0.0, sin(a));
    vec3 world = uCenter + out_ * r * uScale + vec3(0.0, h * uScale, 0.0);
    world = mix(vec3(0.0, -60.0, 0.0), world, live);

    vY = y;
    vA = position.x;
    vVoice = aVoice;
    vK = k;
    vCrash = crash;
    vRing = ring;
    vNormalW = normalize(out_ * (1.0 - y * 0.5) + vec3(0.0, y * 0.6, 0.0));
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const WALL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uFlow;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uCrestGlow;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorD;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying float vY;
  varying float vA;
  varying float vVoice;
  varying float vK;
  varying float vCrash;
  varying float vRing;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    // Tatters: the breaking wall tears on noise from the crest down.
    float tear = snoise(vec3(vA * 40.0, vY * 3.0 - uTime * 2.0, vVoice * 3.1 + uSeed)) * 0.5 + 0.5;
    if (vCrash > 0.0 && tear < vCrash * 1.2 - (1.0 - vY) * 0.4) discard;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float fres = pow(1.0 - abs(dot(N, V)), 2.0);
    // Streaks of acid running down the face.
    float streak = fbm3(vec3(vA * 60.0, vY * 2.5 + uFlow, vVoice + uSeed)) * uShaderIntensity;
    float crest = smoothstep(0.72, 1.0, vY) * (0.6 + 0.4 * (vRing * 0.5 + 0.5));
    float foam = smoothstep(0.2, 0.7, snoise(vec3(vA * 90.0, vY * 6.0, uTime * 3.0 + vVoice))) * crest;
    float heat = clamp(vY * 0.5 + streak * 0.35 + crest * 0.5, 0.0, 1.0);
    vec3 col = gradient4(uColorA, uColorB, uColorC, uColorD, 1.0 - heat) * uGlow;
    col += uColorA * (crest * uCrestGlow * 0.5 + foam * uCrestGlow * 0.6) + uColorB * fres;
    float a = uOpacity * mix(0.35, 1.0, vY) * smoothstep(0.0, 0.1, vY) + crest * 0.3;
    a *= 1.0 - smoothstep(0.85, 1.0, vK);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

function voiceUniforms() {
  return {
    uCenter: { value: new Vector3() },
    uR: { value: new Float32Array(MAX_VOICES) },
    uH: { value: new Float32Array(MAX_VOICES) },
    uK: { value: new Float32Array(MAX_VOICES).fill(-1) },
    uHarm: { value: new Float32Array(MAX_VOICES) },
    uCrash: { value: new Float32Array(MAX_VOICES) },
    uCrestAmp: { value: 0.35 },
    uCurl: { value: 0.35 },
    uScale: { value: 1 }
  };
}

/** @param {object} state { center, r, h, k, harm, crash } (Float32Arrays) */
function syncVoices(u, state) {
  const c = settings[ID];
  const g = settings.global;
  u.uCenter.value.copy(state.center);
  u.uR.value.set(state.r);
  u.uH.value.set(state.h);
  u.uK.value.set(state.k);
  u.uHarm.value.set(state.harm);
  u.uCrash.value.set(state.crash);
  u.uCrestAmp.value = c.crestAmp * g.noiseStrength;
  u.uCurl.value = c.curl;
}

/** The walls of acid, every voice in one draw. */
export function createWallMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...voiceUniforms(),
      uSeed: { value: 0 },
      uFlow: { value: 0 },
      uOpacity: { value: 0.7 },
      uGlow: { value: 2 },
      uCrestGlow: { value: 4 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() }
    }),
    vertexShader: WALL_VERTEX,
    fragmentShader: WALL_FRAGMENT
  });
  /** @param {object} state voice arrays plus { flow, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncVoices(u, state);
    u.uScale.value = 1;
    u.uSeed.value = state.seed;
    u.uFlow.value = state.flow;
    u.uOpacity.value = c.wallOpacity * g.opacity;
    u.uGlow.value = c.wallGlow * g.glow;
    u.uCrestGlow.value = c.crestGlow * g.glow;
    u.uColorA.value.copy(getColor(c.colorWallA));
    u.uColorB.value.copy(getColor(c.colorWallB));
    u.uColorC.value.copy(getColor(c.colorWallC));
    u.uColorD.value.copy(getColor(c.colorWallD));
  };
  return material;
}

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying float vY;
  varying float vA;
  varying float vVoice;
  varying float vK;
  varying float vCrash;
  varying float vRing;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  ${noiseGLSL}
  void main() {
    float through = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    vec2 n = vec2(snoise(vec3(vA * 50.0, vY * 2.0 - uTime * 2.0, vVoice + uSeed)), vRing * 0.6 + 0.2);
    float mask = smoothstep(0.0, 0.2, vY) * (1.0 - smoothstep(0.85, 1.0, vK)) * (1.0 - vCrash) * (0.4 + 0.6 * through);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    float len = length(n);
    if (len > 1.0) n /= len;
    gl_FragColor = vec4(n * 0.5 + 0.5, strength, mask);
  }
`;

/** Every voice bending the air — LAYER.DISTORTION. */
export function createWallWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...voiceUniforms(),
      uStrength: { value: 1 },
      uSeed: { value: 0 }
    }),
    vertexShader: WALL_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncVoices(u, state);
    u.uScale.value = 1.04;
    u.uSeed.value = state.seed;
    u.uStrength.value = c.warpStrength * g.distortion;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The font                                                             */
/* -------------------------------------------------------------------- */

const FONT_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  uniform float uRise;        // 0..1 welling up
  uniform float uHeave;       // 0..1 the jump on a note
  uniform float uWobble;
  uniform float uSeed;
  uniform float uTime;
  varying vec3  vP;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  ${noiseGLSL}
  void main() {
    vec3 p = normalize(position);
    float w = snoise(p * 1.8 + vec3(0.0, uTime * 1.6, uSeed)) * uWobble;
    float r = uSize * (1.0 + w) * uRise;
    vec3 local = p * r;
    local.y *= 1.0 + uHeave;
    // Sits in a pool, half under the floor until it heaves.
    local.y += uSize * uRise * (0.15 + 0.7 * uHeave);
    vec3 world = uCenter + local;
    vP = p;
    vNormalW = normalize(p + vec3(0.0, w, 0.0));
    vViewDir = cameraPosition - world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FONT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uHeave;
  uniform float uFade;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uLightDir;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float uGlobalGlow;
  varying vec3  vP;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float facing = abs(dot(N, V));
    float fres = pow(1.0 - facing, 2.5);
    float swirl = fbm3(vP * 2.2 + vec3(0.0, -uTime * 1.2, uSeed)) * 0.5 + 0.5;
    vec3 col = mix(uColorC, uColorB, swirl) * (0.6 + 0.6 * facing);
    col += uColorA * (pow(facing, 3.0) * (0.6 + uHeave) + fres * 0.8) * uGlow;
    float spec = pow(max(dot(reflect(-V, N), normalize(uLightDir)), 0.0), 40.0);
    col += vec3(spec * 1.5);
    float a = (0.82 + 0.18 * fres) * uFade;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.15);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The singing bulb in the middle. */
export function createFontMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 0.7 },
      uRise: { value: 0 },
      uHeave: { value: 0 },
      uWobble: { value: 0.2 },
      uSeed: { value: 0 },
      uGlow: { value: 3 },
      uFade: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() }
    }),
    vertexShader: FONT_VERTEX,
    fragmentShader: FONT_FRAGMENT
  });
  /** @param {object} state { center, rise, heave, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.05, c.fontSize);
    u.uRise.value = state.rise;
    u.uHeave.value = state.heave * c.fontHeave;
    u.uWobble.value = c.fontWobble * g.noiseStrength;
    u.uSeed.value = state.seed;
    u.uGlow.value = c.fontGlow * g.glow;
    u.uFade.value = state.fade * g.opacity;
    u.uColorA.value.copy(getColor(c.colorFontA));
    u.uColorB.value.copy(getColor(c.colorFontB));
    u.uColorC.value.copy(getColor(c.colorFontC));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The eaten stone                                                      */
/* -------------------------------------------------------------------- */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vXZ;
  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    world.y = 0.017;
    vXZ = position.xy * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uR[${MAX_VOICES}];
  uniform float uK[${MAX_VOICES}];
  uniform float uCrash[${MAX_VOICES}];
  uniform float uVoices;
  uniform float uStart;
  uniform float uGrooves;
  uniform float uFresh;
  uniform float uGlow;
  uniform float uDepth;
  uniform float uPitScale;
  uniform float uLive;
  uniform float uErode;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorAcid;
  uniform vec3  uColorEtched;
  uniform vec3  uColorGroove;
  uniform float uGlobalGlow;
  varying vec2 vXZ;
  ${noiseGLSL}
  void main() {
    float a = atan(vXZ.y, vXZ.x);
    float r = length(vXZ) + snoise(vec3(cos(a) * 2.0, sin(a) * 2.0, uSeed)) * 0.12;
    float eat = 0.0;
    float fresh = 0.0;
    for (int i = 0; i < ${MAX_VOICES}; i++) {
      if (float(i) >= uVoices) break;
      if (uK[i] < 0.0) continue;
      float front = uR[i];
      float passed = step(r, front);
      eat += passed;
      float live = step(uK[i], 1.0) * (1.0 - uCrash[i]);
      fresh = max(fresh, passed * exp(-(front - r) / max(uFresh, 0.05)) * live);
    }
    if (eat < 0.5) discard;
    float eatN = eat / max(uVoices, 1.0);
    float grooves = smoothstep(0.75, 1.0, abs(sin(r * uGrooves * 3.14159265)));
    float pits = smoothstep(0.45, 0.8, fbm3(vec3(vXZ * uPitScale, uSeed)));
    float flow = snoise(vec3(vXZ * 2.0, uTime * 0.8 + uSeed)) * 0.5 + 0.5;
    vec3 col = mix(uColorEtched, uColorGroove, clamp(grooves * 0.7 + pits * 0.4 + eatN * 0.3, 0.0, 1.0));
    col += uColorAcid * uGlow * uGlobalGlow * (fresh * (0.5 + 0.5 * flow) + pits * eatN * 0.25 * uLive);
    float alpha = clamp(0.25 + eatN * uDepth, 0.0, 0.95);
    alpha = max(alpha, fresh);
    alpha *= smoothstep(uStart * 0.4, uStart, r + 0.3);
    float n = snoise(vec3(vXZ * 0.9, uSeed * 5.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.55, n, uErode));
    alpha *= vis * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The stone the choir eats. */
export function createEtchFloorMaterial() {
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
      uCenter: { value: new Vector3() },
      uSize: { value: 6 },
      uSeed: { value: 0 },
      uR: { value: new Float32Array(MAX_VOICES) },
      uK: { value: new Float32Array(MAX_VOICES).fill(-1) },
      uCrash: { value: new Float32Array(MAX_VOICES) },
      uVoices: { value: 5 },
      uStart: { value: 0.5 },
      uGrooves: { value: 5 },
      uFresh: { value: 0.9 },
      uGlow: { value: 2.5 },
      uDepth: { value: 0.7 },
      uPitScale: { value: 3 },
      uLive: { value: 1 },
      uErode: { value: 0.7 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorAcid: { value: new Color() },
      uColorEtched: { value: new Color() },
      uColorGroove: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });
  /** @param {object} state voice arrays plus { voices, live, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.5, c.zoneRadius * c.reach + c.curl + 0.6);
    u.uSeed.value = state.seed;
    u.uR.value.set(state.r);
    u.uK.value.set(state.k);
    u.uCrash.value.set(state.crash);
    u.uVoices.value = state.voices;
    u.uStart.value = c.startRadius;
    u.uGrooves.value = c.grooveScale * g.noiseFrequency;
    u.uFresh.value = c.freshBand;
    u.uGlow.value = c.acidGlow * g.glow;
    u.uDepth.value = c.etchDepth;
    u.uPitScale.value = c.pitScale * g.noiseFrequency;
    u.uLive.value = state.live;
    u.uErode.value = c.erode;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorAcid.value.copy(getColor(c.colorAcid));
    u.uColorEtched.value.copy(getColor(c.colorEtched));
    u.uColorGroove.value.copy(getColor(c.colorGroove));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The note                                                             */
/* -------------------------------------------------------------------- */

const NOTE_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2  vUv;
  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const NOTE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float core = exp(-r * r * 14.0);
    // Rings pulse out of it — the note being held.
    float rings = pow(0.5 + 0.5 * sin(r * 18.0 - uTime * 16.0), 6.0) * exp(-r * 2.5);
    float m = core + rings * 0.6;
    if (m < 0.004) discard;
    gl_FragColor = vec4(uColor * uGlow * m * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

/** The bead of light that carries the note to the circle. Additive. */
export function createNoteMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 0.4 },
      uGlow: { value: 4 },
      uColor: { value: new Color() }
    }),
    vertexShader: NOTE_VERTEX,
    fragmentShader: NOTE_FRAGMENT
  });
  /** @param {object} state { center, scale } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.02, c.noteSize * 2 * state.scale);
    u.uGlow.value = c.noteGlow * g.glow;
    u.uColor.value.copy(getColor(c.colorNote));
  };
  return material;
}
