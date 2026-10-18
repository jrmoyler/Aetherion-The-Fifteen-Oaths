import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Comet Harpoon — the bespoke shaders.
 *
 *  - **the harpoon** — the solid: comet ice, near-black blue with cyan veins
 *    glowing through it (voronoi seams), a cyan fresnel rim, a white-hot
 *    broadhead, gold barbs and eye; lit off the frame's light direction so it
 *    reads as an object, not a glow. Dissolves butt-first on the exit.
 *  - **the coma** — a camera-facing glow round the head, hooded forward along
 *    the flight (the direction is projected in the vertex stage), with
 *    flickering jets.
 *  - **the tails** — two camera-facing ribbons trailing the head: the *ion*
 *    tail, straight, narrow, blue, combed into streamers; and the *dust* tail,
 *    broad, gold, curving away to one side and down.
 *  - **the tether** — a ribbon of starlight from the caster's hand to the eye
 *    of the harpoon, sagging while it pays out, snapping taut on impact, beads
 *    of light running down it, fraying away from the hand.
 *  - **the bloom** — up to 2×12 petals of ice-light in parameter space, each
 *    a cupped, pointed leaf whose opening angle, curl and twist are uniforms;
 *    gold veins, glowing rims, dissolving from the tips.
 *  - **the crater** — a floor quad: frost cracks radiating from the strike,
 *    a gold ring, a dark pit, cooling and eroding.
 *  - **the lens** — `LAYER.DISTORTION`: a shimmer round the head in flight, a
 *    pressure ring when it blooms.
 *
 * Every material reads `settings.cometharpoon` in `userData.sync(state)`.
 */

const ID = 'cometharpoon';
export const MAX_PETALS = 12;

/* -------------------------------------------------------------------- */
/* The harpoon                                                          */
/* -------------------------------------------------------------------- */

const HARPOON_VERTEX = /* glsl */ `
  attribute float aPart;
  attribute float aAlong;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vLocal;
  varying float vPart;
  varying float vAlong;
  varying float vWorldY;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    vLocal = position;
    vPart = aPart;
    vAlong = aAlong;
    vWorldY = world.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HARPOON_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uHeadGlow;
  uniform float uVeinGlow;
  uniform float uVeinScale;
  uniform float uFresnel;
  uniform float uHeat;        // 1 in flight / at the strike, cools after
  uniform float uDissolve;    // 0 whole .. 1 gone (butt first)
  uniform float uDissolveEdge;
  uniform float uTotal;       // tip → eye, metres (unscaled)
  uniform vec3  uColorBody;
  uniform vec3  uColorIce;
  uniform vec3  uColorHead;
  uniform vec3  uColorGold;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vLocal;
  varying float vPart;
  varying float vAlong;
  varying float vWorldY;

  ${noiseGLSL}

  void main() {
    // Buried in the floor: the stage hides it.
    if (vWorldY < -0.02) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    if (dot(N, V) < 0.0) N = -N;
    float rim = pow(1.0 - abs(dot(N, V)), 3.0) * uFresnel;
    float diff = max(dot(N, normalize(uLightDir)), 0.0) * 0.7 + 0.3;

    // Ice seams glowing through the shaft.
    vec2 vp = vec2(atan(vLocal.y, vLocal.x) * 0.6, vLocal.z * uVeinScale) + uSeed;
    vec2 vo = voronoi2(vp);
    float seam = 1.0 - smoothstep(0.0, 0.18, abs(vo.x - 0.42));
    float shimmer = 0.6 + 0.4 * sin(uTime * 3.0 + vo.y * 20.0 + vLocal.z * 4.0);

    vec3 col = uColorBody * diff + uColorIce * (rim * 0.9 + seam * shimmer * uVeinGlow * 0.5);
    float head = step(0.5, vPart) * step(vPart, 1.5);
    float barb = step(1.5, vPart) * step(vPart, 2.5);
    float eye = step(2.5, vPart);
    // The head is white-hot to the tip, the barbs and eye are gold.
    float tipHot = exp(-vAlong * 3.0);
    col = mix(col, uColorHead * uHeadGlow * (0.5 + tipHot) * uHeat + uColorIce * rim, head);
    col = mix(col, uColorGold * (diff * 0.9 + rim * 2.0 + 0.6 * uHeat), max(barb, eye));
    col *= uGlow;

    // Dissolves from the butt toward the tip, with a hot cyan fraying edge.
    float n = snoise(vec3(vLocal * 9.0 + uSeed)) * 0.5 + 0.5;
    float field = vAlong / max(uTotal, 0.1) * 0.85 + n * 0.15;
    float thr = 1.0 - uDissolve * 1.1;
    if (uDissolve > 0.0 && field > thr) discard;
    float edge = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, uDissolveEdge, thr - field) : 0.0;
    col += uColorIce * edge * 6.0;
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

/** The harpoon itself — opaque, on LAYER.WORLD so it writes depth. */
export function createHarpoonMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uGlow: { value: 1 },
      uHeadGlow: { value: 5 },
      uVeinGlow: { value: 1.6 },
      uVeinScale: { value: 6 },
      uFresnel: { value: 1.5 },
      uHeat: { value: 1 },
      uDissolve: { value: 0 },
      uDissolveEdge: { value: 0.06 },
      uTotal: { value: 3 },
      uColorBody: { value: new Color() },
      uColorIce: { value: new Color() },
      uColorHead: { value: new Color() },
      uColorGold: { value: new Color() }
    }),
    vertexShader: HARPOON_VERTEX,
    fragmentShader: HARPOON_FRAGMENT
  });

  /** @param {object} state { heat, dissolve, total, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = state.seed;
    u.uGlow.value = c.harpoonGlow * g.glow;
    u.uHeadGlow.value = c.headGlow * g.shaderIntensity;
    u.uVeinGlow.value = c.veinGlow * g.shaderIntensity;
    u.uVeinScale.value = c.veinScale * g.noiseFrequency;
    u.uFresnel.value = c.harpoonFresnel * g.fresnel;
    u.uHeat.value = state.heat;
    u.uDissolve.value = state.dissolve;
    u.uDissolveEdge.value = Math.max(0.005, c.dissolveEdge);
    u.uTotal.value = state.total;
    u.uColorBody.value.copy(getColor(c.colorHarpoonBody));
    u.uColorIce.value.copy(getColor(c.colorHarpoonIce));
    u.uColorHead.value.copy(getColor(c.colorHarpoonHead));
    u.uColorGold.value.copy(getColor(c.colorHarpoonGold));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The coma and the lens — billboards                                   */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform vec3  uFwd;
  uniform float uSize;
  varying vec2  vUv;
  varying vec2  vFwd;

  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    vUv = position.xy;
    // The flight direction, as seen on this billboard.
    vec2 f = vec2(dot(uFwd, right), dot(uFwd, up));
    vFwd = length(f) > 1e-4 ? normalize(f) : vec2(0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const COMA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uHood;
  uniform float uJets;
  uniform vec3  uColorCore;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;

  varying vec2 vUv;
  varying vec2 vFwd;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0 || uIntensity <= 0.001) discard;
    vec2 d = vUv / max(r, 1e-4);
    float ahead = dot(d, vFwd);
    // The hood: brighter, tighter on the side it flies toward.
    float hood = exp(-r * mix(3.2, 6.0, uHood * (ahead * 0.5 + 0.5))) * (1.0 + uHood * ahead * 0.6);
    float core = exp(-r * r * 36.0);
    float a = atan(vUv.y, vUv.x);
    float jets = pow(abs(sin(a * max(uJets, 1.0) * 0.5 + uSeed + uTime * 0.7)), 14.0) * exp(-r * 3.0);
    jets *= 0.5 + 0.5 * snoise(vec3(a * 2.0, uTime * 4.0, uSeed));
    vec3 col = uColorHalo * (hood * 1.1 + jets * 1.3) + uColorCore * core * 3.0;
    float m = clamp(hood + core + jets, 0.0, 1.0) * (1.0 - smoothstep(0.8, 1.0, r));
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, m);
  }
`;

/** The coma round the head. */
export function createComaMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uFwd: { value: new Vector3(0, 0, 1) },
      uSize: { value: 1 },
      uSeed: { value: 0 },
      uIntensity: { value: 1 },
      uHood: { value: 0.5 },
      uJets: { value: 5 },
      uColorCore: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: COMA_FRAGMENT
  });

  /** @param {object} state { center, fwd, size, intensity, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uFwd.value.copy(state.fwd);
    u.uSize.value = Math.max(0.01, state.size);
    u.uIntensity.value = state.intensity * c.comaGlow * g.glow;
    u.uHood.value = c.comaHood;
    u.uJets.value = Math.max(1, Math.round(c.comaJets));
    u.uSeed.value = state.seed;
    u.uColorCore.value.copy(getColor(c.colorComaCore));
    u.uColorHalo.value.copy(getColor(c.colorComaHalo));
  };
  return material;
}

const LENS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uRing;        // < 0: a shimmer; 0..1: a pressure ring opening
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec2 vFwd;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    vec2 dir = vUv / max(r, 1e-4);
    vec2 offset;
    float mask;
    if (uRing < 0.0) {
      vec2 n = vec2(snoise(vec3(vUv * 3.0, uTime * 3.0)), snoise(vec3(vUv * 3.0 + 7.3, uTime * 3.0)));
      mask = (1.0 - smoothstep(0.3, 1.0, r));
      offset = n;
    } else {
      float d = (r - (0.1 + 0.85 * uRing)) / 0.12;
      offset = dir * (-d * exp(-d * d)) * 2.0;
      mask = exp(-d * d) * (1.0 - uRing);
    }
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    float len = length(offset);
    if (len > 1.0) offset /= len;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

/** The bent air round the head, and the bloom's pressure ring — LAYER.DISTORTION. */
export function createCometLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uFwd: { value: new Vector3(0, 0, 1) },
      uSize: { value: 1 },
      uStrength: { value: 1 },
      uRing: { value: -1 }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} state { center, size, strength, ring } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.05, state.size);
    u.uStrength.value = c.lensStrength * g.distortion * state.strength;
    u.uRing.value = state.ring;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Ribbons — the tails and the tether                                   */
/* -------------------------------------------------------------------- */

/**
 * A camera-facing ribbon along a bent centreline. `position.x` 0..1 along,
 * `position.y` -1..1 across. The centreline runs from `uA` along `uDirA`
 * for `uLength`, bowed by `uBend` along `uBendDir` (∝ x²) — the comet tails —
 * or, with `uToB` = 1, straight from `uA` to `uB` sagging by `uSag` and
 * rippling — the tether.
 */
const RIBBON_VERTEX = /* glsl */ `
  uniform vec3  uA;
  uniform vec3  uB;
  uniform vec3  uDirA;
  uniform vec3  uBendDir;
  uniform float uToB;
  uniform float uLength;
  uniform float uBend;
  uniform float uSag;
  uniform float uWave;
  uniform float uWaveAmp;
  uniform float uWaveLen;
  uniform float uWidth0;
  uniform float uWidth1;

  varying float vX;
  varying float vY;
  varying float vViewZ;
  varying float vWorldY;

  vec3 ribbonPoint(float x) {
    vec3 tail = uA + uDirA * (x * uLength) + uBendDir * (uBend * x * x * uLength);
    vec3 rope = mix(uA, uB, x);
    float L = distance(uA, uB);
    rope.y -= uSag * 4.0 * x * (1.0 - x);
    rope.y += uWaveAmp * sin(6.2831853 * x * L / max(uWaveLen, 0.1) - uWave) * sin(3.14159265 * x);
    return mix(tail, rope, uToB);
  }

  void main() {
    float x = position.x;
    vec3 c = ribbonPoint(x);
    vec3 T = normalize(ribbonPoint(min(x + 0.01, 1.0)) - ribbonPoint(max(x - 0.01, 0.0)) + vec3(1e-5));
    vec3 toCam = normalize(cameraPosition - c);
    vec3 across = normalize(cross(T, toCam) + vec3(0.0, 1e-5, 0.0));
    float w = mix(uWidth0, uWidth1, x);
    vec3 world = c + across * position.y * w;
    vX = x;
    vY = position.y;
    vWorldY = world.y;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const ION_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uFlow;
  uniform float uGlow;
  uniform float uStreamers;
  uniform float uPower;
  uniform float uLength;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying float vX;
  varying float vY;
  varying float vViewZ;
  varying float vWorldY;

  ${noiseGLSL}

  void main() {
    if (vWorldY < 0.0) discard;
    float d = vX * uLength;
    // Combed streamers, kinking on noise as they stream away.
    float kink = snoise(vec3(d * 0.6 - uFlow * 0.3, vY * 2.0, uSeed)) * 0.25;
    float lanes = pow(abs(cos((vY + kink) * uStreamers * 1.5708)), 10.0);
    float knots = 0.6 + 0.4 * snoise(vec3(d * 1.5 - uFlow, vY * 3.0, uSeed + 3.0));
    float body = exp(-vY * vY * 3.0);
    float fall = pow(1.0 - vX, 1.4) * smoothstep(0.0, 0.03, vX);
    float m = (lanes * knots * 0.8 + body * 0.35) * fall * uPower;
    if (m < 0.004) discard;
    vec3 col = mix(uColorB, uColorA, body * (1.0 - vX));
    gl_FragColor = vec4(col * m * uGlow * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uFlow;
  uniform float uGlow;
  uniform float uPower;
  uniform float uOpacity;
  uniform float uLength;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying float vX;
  varying float vY;
  varying float vViewZ;
  varying float vWorldY;

  ${noiseGLSL}

  void main() {
    if (vWorldY < 0.0) discard;
    float d = vX * uLength;
    float n = fbm3(vec3(d * 0.8 - uFlow * 0.4, vY * 1.6, uSeed)) * 0.5 + 0.5;
    // Brighter on the leading (inside) edge of the curve, feathered outside.
    float lead = exp(-pow((vY + 0.35) * 1.6, 2.0));
    float body = (1.0 - smoothstep(0.4, 1.0, abs(vY))) * (0.5 + 0.5 * lead);
    float fall = pow(1.0 - vX, 1.2) * smoothstep(0.0, 0.06, vX);
    float m = body * fall * (0.4 + 0.8 * n) * uPower * uOpacity;
    if (m < 0.004) discard;
    vec3 col = mix(uColorB, uColorA, lead * (1.0 - vX * 0.7));
    gl_FragColor = vec4(col * m * uGlow * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

const TETHER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uFlow;
  uniform float uGlow;
  uniform float uBeads;
  uniform float uPower;
  uniform float uFray;        // 0..1 of the tether gone, from the hand
  uniform float uTaut;        // 0..1 flash as it snaps taut
  uniform float uLength;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying float vX;
  varying float vY;
  varying float vViewZ;
  varying float vWorldY;

  ${noiseGLSL}

  void main() {
    float d = vX * uLength;
    float core = exp(-vY * vY * 8.0);
    float line = exp(-vY * vY * 40.0);
    // Beads of light running out toward the harpoon.
    float bead = pow(0.5 + 0.5 * sin(6.2831853 * (d * uBeads - uFlow)), 16.0) * core;
    float twinkle = 0.7 + 0.3 * snoise(vec3(d * 4.0, uTime * 6.0, uSeed));
    // Frays away from the hand end.
    float n = snoise(vec3(d * 3.0, uSeed, 0.0)) * 0.5 + 0.5;
    float keep = uFray <= 0.0 ? 1.0 : smoothstep(uFray * 1.1 - 0.05, uFray * 1.1, vX * 0.85 + n * 0.15);
    float m = (core * 0.45 * twinkle + line * 0.8 + bead * 1.2 + uTaut * core) * keep * uPower;
    if (m < 0.004) discard;
    vec3 col = mix(uColorA, uColorB, clamp(bead + line * 0.5 + uTaut, 0.0, 1.0));
    gl_FragColor = vec4(col * m * uGlow * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

function ribbonUniforms() {
  return {
    uA: { value: new Vector3() },
    uB: { value: new Vector3() },
    uDirA: { value: new Vector3(0, 0, -1) },
    uBendDir: { value: new Vector3(0, -1, 0) },
    uToB: { value: 0 },
    uLength: { value: 4 },
    uBend: { value: 0 },
    uSag: { value: 0 },
    uWave: { value: 0 },
    uWaveAmp: { value: 0 },
    uWaveLen: { value: 2 },
    uWidth0: { value: 0.05 },
    uWidth1: { value: 0.5 },
    uSeed: { value: 0 },
    uFlow: { value: 0 },
    uGlow: { value: 1 },
    uPower: { value: 1 },
    uColorA: { value: new Color() },
    uColorB: { value: new Color() }
  };
}

function ribbonMaterial(fragmentShader, extra) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({ ...ribbonUniforms(), ...extra }),
    vertexShader: RIBBON_VERTEX,
    fragmentShader
  });
}

/** The straight blue ion tail. */
export function createIonTailMaterial() {
  const material = ribbonMaterial(ION_FRAGMENT, { uStreamers: { value: 7 } });
  /** @param {object} state { head, back, length, power, flow, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uA.value.copy(state.head);
    u.uDirA.value.copy(state.back);
    u.uToB.value = 0;
    u.uLength.value = Math.max(0.05, state.length);
    u.uBend.value = 0;
    u.uWidth0.value = c.ionWidth * 0.25;
    u.uWidth1.value = c.ionWidth;
    u.uSeed.value = state.seed;
    u.uFlow.value = state.flow;
    u.uGlow.value = c.ionGlow * g.glow;
    u.uStreamers.value = Math.max(1, c.ionStreamers);
    u.uPower.value = state.power * g.opacity;
    u.uColorA.value.copy(getColor(c.colorIonA));
    u.uColorB.value.copy(getColor(c.colorIonB));
  };
  return material;
}

/** The broad curving gold dust tail. */
export function createDustTailMaterial() {
  const material = ribbonMaterial(DUST_FRAGMENT, { uOpacity: { value: 1 } });
  /** @param {object} state { head, back, bendDir, length, power, flow, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uA.value.copy(state.head);
    u.uDirA.value.copy(state.back);
    u.uBendDir.value.copy(state.bendDir);
    u.uToB.value = 0;
    u.uLength.value = Math.max(0.05, state.length);
    u.uBend.value = c.dustBend;
    u.uWidth0.value = c.dustWidth * 0.2;
    u.uWidth1.value = c.dustWidth;
    u.uSeed.value = state.seed + 5;
    u.uFlow.value = state.flow;
    u.uGlow.value = c.dustGlow * g.glow;
    u.uOpacity.value = c.dustOpacity;
    u.uPower.value = state.power * g.opacity;
    u.uColorA.value.copy(getColor(c.colorDustTailA));
    u.uColorB.value.copy(getColor(c.colorDustTailB));
  };
  return material;
}

/** The line of starlight from the hand to the harpoon's eye. */
export function createTetherMaterial() {
  const material = ribbonMaterial(TETHER_FRAGMENT, { uBeads: { value: 1.5 }, uFray: { value: 0 }, uTaut: { value: 0 } });
  /** @param {object} state { a, b, sag, wave, flow, power, fray, taut, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uA.value.copy(state.a);
    u.uB.value.copy(state.b);
    u.uToB.value = 1;
    u.uLength.value = Math.max(0.05, state.a.distanceTo(state.b));
    u.uSag.value = state.sag;
    u.uWave.value = state.wave;
    u.uWaveAmp.value = c.tetherWave * state.waveMul;
    u.uWaveLen.value = c.tetherWaveLength;
    u.uWidth0.value = c.tetherWidth;
    u.uWidth1.value = c.tetherWidth;
    u.uSeed.value = state.seed;
    u.uFlow.value = state.flow;
    u.uGlow.value = c.tetherGlow * g.glow;
    u.uBeads.value = c.tetherBeads;
    u.uPower.value = state.power * g.opacity;
    u.uFray.value = state.fray;
    u.uTaut.value = state.taut;
    u.uColorA.value.copy(getColor(c.colorTether));
    u.uColorB.value.copy(getColor(c.colorTetherBead));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The bloom                                                            */
/* -------------------------------------------------------------------- */

const PETAL_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uCount;
  uniform float uInner;       // 1 draws the inner row too
  uniform float uLength;
  uniform float uWidth;
  uniform float uOpen;        // radians from vertical, outer row
  uniform float uCurl;
  uniform float uCup;
  uniform float uTwist;
  uniform float uSpin;
  uniform float uScale;       // 0..1 grown

  varying float vU;
  varying float vV;
  varying float vRow;
  varying float vIdx;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  void main() {
    float u = position.x;
    float v = position.y;
    float idx = position.z;
    float n = max(uCount, 1.0);
    float row = step(n - 0.5, idx);           // 0 outer, 1 inner
    float k = idx - row * n;
    float live = step(k, n - 0.5) * (1.0 - row * (1.0 - step(0.5, uInner)));
    float az = 6.2831853 * (k + row * 0.5) / n + uSpin;
    vec3 R = vec3(cos(az), 0.0, sin(az));
    vec3 Tn = vec3(-sin(az), 0.0, cos(az));
    float open = mix(uOpen, uOpen * 0.55, row);
    float len = uLength * mix(1.0, 0.62, row) * uScale;
    vec3 D = R * sin(open) + vec3(0.0, 1.0, 0.0) * cos(open);
    vec3 out_ = R * cos(open) - vec3(0.0, 1.0, 0.0) * sin(open);
    float w = uWidth * mix(1.0, 0.75, row) * uScale * pow(max(sin(3.14159265 * pow(u, 0.7)), 0.0), 0.9);
    // Twisted a little about its own spine, so the row reads as a spiral.
    float tw = uTwist * u;
    vec3 across = Tn * cos(tw) + out_ * sin(tw);
    vec3 pn = cross(across, D);
    vec3 world = uCenter
      + D * (u * len)
      + out_ * (uCurl * len * u * u)
      + across * (v * w)
      + pn * (uCup * w * v * v);
    world = mix(uCenter, world, live);
    vU = u;
    vV = v;
    vRow = row;
    vIdx = k + row * 17.0;
    vNormalW = pn;
    vViewDir = cameraPosition - world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const PETAL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uVeinGlow;
  uniform float uPower;
  uniform float uDissolve;
  uniform float uSoftFade;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorVein;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying float vU;
  varying float vV;
  varying float vRow;
  varying float vIdx;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float facing = abs(dot(N, V));
    float rim = pow(1.0 - facing, 2.0);
    float av = abs(vV);
    // A gold midrib and side veins sweeping out to the rim.
    float mid = exp(-pow(vV / 0.07, 2.0));
    float side = pow(abs(sin(vU * 18.0 - av * 6.0 + vIdx)), 24.0) * smoothstep(0.1, 0.4, av) * (1.0 - smoothstep(0.85, 1.0, av));
    float edge = smoothstep(0.7, 1.0, av);
    float frost = fbm3(vec3(vU * 6.0, vV * 3.0, uSeed + vIdx)) * 0.5 + 0.5;
    vec3 ice = gradient4(uColorA, uColorB, uColorC, uColorC, clamp(vU * 0.6 + av * 0.5 - frost * 0.3, 0.0, 1.0));
    vec3 col = ice * (0.45 + 0.55 * frost * uShaderIntensity) + uColorA * (edge * 1.2 + rim * 0.8) + uColorVein * (mid + side * 0.7) * uVeinGlow;
    col *= mix(1.0, 0.8, vRow);

    // Dissolves from the tips back toward the heart.
    float dn = snoise(vec3(vU * 5.0, vV * 2.0, uSeed + vIdx * 3.1)) * 0.5 + 0.5;
    float field = (1.0 - vU) * 0.8 + dn * 0.2;
    float thr = uDissolve * 1.1 - 0.05;
    float keep = uDissolve <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.03, field);
    float fray = uDissolve <= 0.0 ? 0.0 : smoothstep(thr - 0.01, thr + 0.03, field) - smoothstep(thr + 0.03, thr + 0.09, field);

    float body = 0.35 + 0.4 * edge + 0.5 * mid + 0.3 * side;
    float mask = body * keep * uPower * smoothstep(0.0, 0.06, vU);
    if (mask < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (mask < 0.004) discard;
    vec3 color = col * uGlow + uColorA * fray * 4.0;
    gl_FragColor = vec4(color * uGlobalGlow, clamp(mask, 0.0, 1.0));
  }
`;

/** The bloom's petals. Additive ice-light. */
export function createPetalMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uCount: { value: 7 },
      uInner: { value: 1 },
      uLength: { value: 2 },
      uWidth: { value: 0.5 },
      uOpen: { value: 0.3 },
      uCurl: { value: 0.3 },
      uCup: { value: 0.25 },
      uTwist: { value: 0.3 },
      uSpin: { value: 0 },
      uScale: { value: 1 },
      uSeed: { value: 0 },
      uGlow: { value: 2 },
      uVeinGlow: { value: 2 },
      uPower: { value: 1 },
      uDissolve: { value: 0 },
      uSoftFade: { value: 0.2 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorVein: { value: new Color() }
    }),
    vertexShader: PETAL_VERTEX,
    fragmentShader: PETAL_FRAGMENT
  });

  /** @param {object} state { center, open, scale, spin, power, dissolve, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uCount.value = Math.max(1, Math.min(MAX_PETALS, Math.round(c.petals)));
    u.uInner.value = c.innerPetals >= 0.5 ? 1 : 0;
    u.uLength.value = c.petalLength * g.explosionIntensity;
    u.uWidth.value = c.petalWidth * g.explosionIntensity;
    u.uOpen.value = state.open;
    u.uCurl.value = c.petalCurl;
    u.uCup.value = c.petalCup;
    u.uTwist.value = c.petalTwist;
    u.uSpin.value = state.spin;
    u.uScale.value = state.scale;
    u.uSeed.value = state.seed;
    u.uGlow.value = c.petalGlow * g.glow;
    u.uVeinGlow.value = c.petalVeinGlow * g.shaderIntensity;
    u.uPower.value = state.power * g.opacity;
    u.uDissolve.value = state.dissolve;
    u.uSoftFade.value = c.petalSoftFade;
    u.uColorA.value.copy(getColor(c.colorPetalA));
    u.uColorB.value.copy(getColor(c.colorPetalB));
    u.uColorC.value.copy(getColor(c.colorPetalC));
    u.uColorVein.value.copy(getColor(c.colorPetalVein));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The crater                                                           */
/* -------------------------------------------------------------------- */

const CRATER_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;
  varying vec2  vP;            // metres from the centre

  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uRadius;
    world.y = 0.017;
    vP = position.xy * uRadius;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const CRATER_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uRadius;
  uniform float uGrow;         // 0..1 cracks racing outward
  uniform float uHeat;
  uniform float uCracks;
  uniform float uCrackGlow;
  uniform float uRingGlow;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorHot;
  uniform vec3  uColorCrack;
  uniform vec3  uColorRing;
  uniform vec3  uColorChar;
  uniform float uGlobalGlow;

  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    float rn = r / max(uRadius, 0.01);
    if (rn > 1.0) discard;
    float a = atan(vP.y, vP.x);
    // Radial cracks, each its own length, wandering on noise.
    float wob = snoise(vec3(r * 1.8, a * 0.5, uSeed)) * 0.22;
    float lane = (a + wob) / 6.2831853 * uCracks;
    float id = floor(lane + 0.5);
    float dl = abs(lane - id) * 6.2831853 / max(uCracks, 1.0) * r;
    float reach = (0.45 + 0.55 * hash11(id + uSeed)) * uGrow;
    float crack = (1.0 - smoothstep(0.015, 0.06 + 0.03 * (1.0 - rn), dl)) * (1.0 - smoothstep(reach - 0.08, reach, rn));
    float glow = exp(-dl * dl * 60.0) * (1.0 - smoothstep(reach - 0.15, reach, rn));
    // A frosted gold ring round the strike, a dark pit inside it.
    float ring = exp(-pow((rn - 0.24) / 0.06, 2.0)) * smoothstep(0.0, 0.3, uGrow);
    float pit = 1.0 - smoothstep(0.08, 0.2, rn);
    float frost = (fbm3(vec3(vP * 2.2, uSeed)) * 0.5 + 0.5) * (1.0 - smoothstep(0.2, 0.9, rn)) * uGrow;

    vec3 hot = mix(uColorCrack, uColorHot, smoothstep(0.4, 0.9, uHeat * (1.0 - rn)));
    vec3 col = uColorChar * (0.6 + 0.4 * frost);
    float lit = max(crack, glow * 0.5);
    col = mix(col, hot * uCrackGlow * (0.3 + uHeat) * uGlobalGlow, clamp(lit, 0.0, 1.0));
    col += uColorRing * ring * uRingGlow * (0.2 + uHeat) * uGlobalGlow;
    col += uColorHot * pit * uHeat * uCrackGlow * 0.6 * uGlobalGlow;

    float a0 = max(max(lit, ring * 0.8), max(frost * 0.45, pit * 0.8));
    a0 *= 1.0 - smoothstep(0.85, 1.0, rn);
    float n = snoise(vec3(vP * 1.7, uSeed * 2.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.2 - 0.1;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, n);
    float alpha = a0 * vis * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The frost-cracked strike in the floor. */
export function createCraterMaterial() {
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
      uRadius: { value: 3 },
      uSeed: { value: 0 },
      uGrow: { value: 0 },
      uHeat: { value: 1 },
      uCracks: { value: 14 },
      uCrackGlow: { value: 3 },
      uRingGlow: { value: 2 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorHot: { value: new Color() },
      uColorCrack: { value: new Color() },
      uColorRing: { value: new Color() },
      uColorChar: { value: new Color() }
    }),
    vertexShader: CRATER_VERTEX,
    fragmentShader: CRATER_FRAGMENT
  });

  /** @param {object} state { center, grow, heat, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uRadius.value = Math.max(0.1, c.craterRadius * g.explosionIntensity);
    u.uSeed.value = state.seed;
    u.uGrow.value = state.grow;
    u.uHeat.value = state.heat;
    u.uCracks.value = Math.max(1, Math.round(c.crackCount));
    u.uCrackGlow.value = c.crackGlow * g.glow;
    u.uRingGlow.value = c.craterRingGlow * g.glow;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorHot.value.copy(getColor(c.colorCrackHot));
    u.uColorCrack.value.copy(getColor(c.colorCrack));
    u.uColorRing.value.copy(getColor(c.colorCraterRing));
    u.uColorChar.value.copy(getColor(c.colorCraterChar));
  };
  return material;
}
