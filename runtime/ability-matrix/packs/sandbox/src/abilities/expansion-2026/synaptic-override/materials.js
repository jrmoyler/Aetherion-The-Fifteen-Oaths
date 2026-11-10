import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  MeshDepthMaterial,
  NormalBlending,
  RGBADepthPacking,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { CROWN_GLSL, CROWN_UNIFORMS_GLSL, MAX_ARMS } from './crown.js';
import config from './config.js';

/**
 * Synaptic Override — the bespoke shaders. Every material reads
 * `settings.synapticOverride` in `userData.sync(state)`; the state carries only
 * what the ability's timeline decides (fade, energy, phases).
 *
 *  - **the dendrites** (`createDendriteMaterial`) — the hero. Opaque, on
 *    `LAYER.SHAPED`, inflated round the centreline in `crown.js` in the vertex
 *    stage, with a matching shadow-map depth material so the bent arms lay a
 *    real shadow. Shading is an *insulated nerve*: a dark, mottled indigo
 *    membrane lit by the sun with a hard specular, the electric core showing
 *    through where the tube faces the camera (an inverted fresnel — thin
 *    insulation over a live wire), an ionised blue rim, and white-hot **action
 *    potentials** — bands that swell the tube as they run in or out along it.
 *  - **the soma** (`createSomaMaterial`) — the cell body: a sphere heaved by
 *    fbm into lumps and pulled into an axon hillock toward the caster, beating;
 *    a white-hot nucleus, ridged plasma veins, a saturated fresnel rim.
 *  - **the axon** (`createAxonMaterial`) — the travel: a tube laid from the
 *    caster's hand down to the floor and along it to the target, meandering,
 *    beaded with nodes of Ranvier, a charge at the hand and a white head.
 *  - **the arcs** (`createArcMaterial`) — camera-facing bolt ribbons, jagged
 *    by noise that re-strikes `arcFlicker` times a second: the contact arcs
 *    that climb the seized bodies and the diverted bolts between them.
 *  - **the synaptic field** (`createFieldMaterial`) — the floor: a deep scorch
 *    threaded by a domain-warped neural web, the burnt traces of the arms,
 *    potentials running inward along them, the diversion ring running out;
 *    noise dissolve on exit. Normal-blended so the deep tone darkens.
 *  - **the lens** (`createLensMaterial`) — `LAYER.DISTORTION` disc: ionised
 *    shimmer while the override listens, pressure rings at plant/diversion.
 */

const ID = config.id;

const additive = (extra) => ({
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: AdditiveBlending,
  side: DoubleSide,
  toneMapped: false,
  ...extra,
});

/* -------------------------------------------------------------------- */
/* The dendrites                                                         */
/* -------------------------------------------------------------------- */

/** Builds the bent arm; shared by the colour and the shadow pass. */
const DENDRITE_BODY = /* glsl */ `
  ${CROWN_UNIFORMS_GLSL}
  attribute vec4 aBranch;   // arm, slot, side, seed
  ${CROWN_GLSL}

  vec3 dendriteLocal(out vec3 nrm, out float along, out float band, out float flash) {
    int i = int(aBranch.x + 0.5);
    vec4 A = uArmA[i];
    vec4 B = uArmB[i];
    float u = position.z;
    float grown;
    vec3 C = crownCentre(A, B, aBranch.y, aBranch.z, u, along, grown);
    float a1, g1;
    vec3 C1 = crownCentre(A, B, aBranch.y, aBranch.z, min(u + 0.012, 1.0), a1, g1);
    vec3 C0 = crownCentre(A, B, aBranch.y, aBranch.z, max(u - 0.012, 0.0), a1, g1);
    vec3 T = C1 - C0;
    T = length(T) < 1e-5 ? vec3(0.0, 1.0, 0.0) : normalize(T);
    vec3 ref = abs(T.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 N = normalize(cross(ref, T));
    vec3 Bn = cross(T, N);

    // Thickness: tapered along the arm; a twig takes its parent's girth.
    float sArm = along;
    float r = uThick * (1.0 - uTaper * along);
    if (aBranch.y > 0.5) {
      float sb = aBranch.y < 1.5 ? uTwigAt.x : uTwigAt.y;
      r = uThick * (1.0 - uTaper * sb) * uTwigThick * (1.0 - 0.7 * along);
      sArm = sb + along * (1.0 - sb);
    }
    // Close the tube at the growing tip; nothing at all before it sprouts.
    r *= sqrt(clamp((1.0 - u) * 9.0, 0.0, 1.0)) * smoothstep(0.0, 0.06, grown);

    // Action potentials: two bands per arm, running in (+1) or out (-1).
    float c = fract(2.0 * B.w * sArm + uPotential);
    band = exp(-pow((c - 0.5) / max(uPotentialWidth, 0.005), 2.0)) * step(0.01, abs(B.w));
    r *= 1.0 + band * uSwell;

    flash = B.z;
    nrm = N * position.x + Bn * position.y;
    return C + nrm * r;
  }
`;

const DENDRITE_VERTEX = /* glsl */ `
  ${DENDRITE_BODY}
  varying vec3 vNormalW;
  varying vec3 vView;
  varying vec3 vWorld;
  varying float vAlong;
  varying float vBand;
  varying float vFlash;
  varying float vSeed;
  void main() {
    vec3 nrm;
    float along, band, flash;
    vec3 local = dendriteLocal(nrm, along, band, flash);
    vec4 world = modelMatrix * vec4(local, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * nrm);
    vView = cameraPosition - world.xyz;
    vAlong = along;
    vBand = band;
    vFlash = flash;
    vSeed = aBranch.w;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const DENDRITE_FRAGMENT = /* glsl */ `
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform vec3  uMembrane;
  uniform float uSpecular;
  uniform float uGlow;
  uniform float uBandGlow;
  uniform float uFresnel;
  uniform float uNoise;
  uniform float uScale;
  uniform float uEnergy;
  varying vec3 vNormalW;
  varying vec3 vView;
  varying vec3 vWorld;
  varying float vAlong;
  varying float vBand;
  varying float vFlash;
  varying float vSeed;
  ${noiseGLSL}
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vView);
    if (!gl_FrontFacing) N = -N;
    vec3 L = normalize(uLightDir);
    float facing = clamp(abs(dot(N, V)), 0.0, 1.0);
    // Membrane: mottled dark insulation, wrapped diffuse, a hard wet highlight.
    float mott = snoise(vec3(vWorld * 5.0 * uScale + vSeed * 7.0));
    float sheathRings = 0.5 + 0.5 * sin(vAlong * 90.0 + vSeed * 6.0);
    vec3 membrane = mix(uDeep, uMembrane, 0.55 + 0.35 * mott * uNoise + 0.1 * sheathRings);
    float ndl = max(dot(N, L) * 0.65 + 0.35, 0.0);
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 36.0) * uSpecular;
    vec3 col = membrane * ndl + uTint * spec;
    // The live core through thin insulation, strongest face-on.
    float core = pow(facing, 2.6);
    float crackle = 0.75 + 0.25 * snoise(vec3(vWorld.xz * 9.0, vAlong * 14.0 + vSeed * 3.0));
    col += mix(uBody, uTint, core) * core * uGlow * crackle * uEnergy * uShaderIntensity;
    // Ionised rim.
    float rim = pow(1.0 - facing, 3.0) * uFresnel;
    col += uBody * rim * 0.9 * uEnergy;
    // Action potentials: white-hot at the centre of the band.
    col += mix(uTint, uCore, vBand) * vBand * uBandGlow;
    // Seize / diversion flash.
    col += mix(uBody, uCore, 0.5) * vFlash * (0.4 + core);
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

function crownUniforms() {
  const armA = [],
    armB = [];
  for (let i = 0; i < MAX_ARMS; i++) {
    armA.push(new Vector4(0, 3, 0, Math.PI));
    armB.push(new Vector4(0, 0, 0, 0));
  }
  return {
    uArmA: { value: armA },
    uArmB: { value: armB },
    uR0: { value: 0.4 },
    uBaseY: { value: 0.3 },
    uThick: { value: 0.15 },
    uTaper: { value: 0.7 },
    uTwigAt: { value: new Vector2(0.42, 0.68) },
    uTwigSpread: { value: 0.55 },
    uTwigThick: { value: 0.55 },
    uWritheFreq: { value: 1.6 },
    uWritheClock: { value: 0 },
    uPotential: { value: 0 },
    uPotentialWidth: { value: 0.07 },
    uSwell: { value: 0.45 },
  };
}

/**
 * The dendrite crown. `userData.depth` is the shadow-map material the mesh
 * must take as `customDepthMaterial`; it bends the arms with the same uniforms.
 * `userData.sync(s)` with s = { energy, potential, clock } plus the per-arm
 * vectors the ability writes straight into `uniforms.uArmA/uArmB`.
 */
export function createDendriteMaterial() {
  const crown = crownUniforms();
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...crown,
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
      uMembrane: { value: new Color() },
      uSpecular: { value: 0.6 },
      uGlow: { value: 1.5 },
      uBandGlow: { value: 3 },
      uFresnel: { value: 1 },
      uNoise: { value: 1 },
      uScale: { value: 1 },
      uEnergy: { value: 1 },
    }),
    vertexShader: DENDRITE_VERTEX,
    fragmentShader: DENDRITE_FRAGMENT,
  });
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide });
  depth.onBeforeCompile = (shader) => {
    for (const key of Object.keys(crown)) shader.uniforms[key] = material.uniforms[key];
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DENDRITE_BODY}`)
      .replace(
        '#include <begin_vertex>',
        'vec3 _sNrm; float _sAlong, _sBand, _sFlash;\nvec3 transformed = dendriteLocal(_sNrm, _sAlong, _sBand, _sFlash);',
      );
  };
  depth.customProgramCacheKey = () => 'synaptic-override-dendrite-depth';
  material.userData.depth = depth;

  /** @param {object} s { energy, potential, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uR0.value = c.somaRadius * 0.78;
    u.uBaseY.value = c.somaHeight * c.dendriteRise;
    u.uThick.value = c.dendriteThickness;
    u.uTaper.value = Math.min(0.95, Math.max(0, c.dendriteTaper));
    u.uTwigAt.value.set(c.twigAt, c.twigAt2);
    u.uTwigSpread.value = c.twigSpread;
    u.uTwigThick.value = c.twigThickness;
    u.uWritheFreq.value = c.writheFrequency * g.noiseFrequency;
    u.uWritheClock.value = s.clock * c.writheSpeed;
    u.uPotential.value = s.potential;
    u.uPotentialWidth.value = c.potentialWidth;
    u.uSwell.value = c.potentialSwell;
    u.uCore.value.copy(getColor(c.coreColor));
    u.uTint.value.copy(getColor(c.tintColor));
    u.uBody.value.copy(getColor(c.bodyColor));
    u.uDeep.value.copy(getColor(c.deepColor));
    u.uMembrane.value.copy(getColor(c.membraneColor));
    u.uSpecular.value = c.membraneSpecular;
    u.uGlow.value = c.dendriteGlow * g.glow;
    u.uBandGlow.value = c.potentialGlow * g.glow;
    u.uFresnel.value = g.fresnel;
    u.uNoise.value = g.noiseStrength;
    u.uScale.value = g.noiseFrequency;
    u.uEnergy.value = s.energy;
  };
  return material;
}


/* -------------------------------------------------------------------- */
/* The soma                                                              */
/* -------------------------------------------------------------------- */

const SOMA_VERTEX = /* glsl */ `
  uniform float uClock;
  uniform float uLumps;
  uniform float uStretch;
  uniform float uBeat;
  uniform float uScale;
  uniform vec3  uHillock;   // local, flat, toward the axon
  varying vec3 vNormalW;
  varying vec3 vView;
  varying vec3 vLocal;
  varying float vHill;
  ${noiseGLSL}
  void main() {
    vec3 p = normalize(position);
    float n = fbm3(p * 1.9 * uScale + vec3(0.0, uClock * 0.55, uClock * 0.2));
    float hill = pow(max(dot(p, uHillock), 0.0), 3.0);
    // Flattened underneath so it sits on its dendrites rather than floats.
    vec3 q = p * (1.0 + uLumps * (n - 0.5) * 2.0 + uBeat * 0.09);
    q.y *= mix(0.78, 1.0, step(0.0, p.y));
    q += uHillock * hill * uStretch;
    vLocal = p;
    vHill = hill;
    vec4 world = modelMatrix * vec4(q, 1.0);
    // Displaced normal, approximated: the lumps are low frequency.
    vNormalW = normalize(mat3(modelMatrix) * normalize(q));
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SOMA_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uGlow;
  uniform float uFlare;
  uniform float uFresnel;
  uniform float uScale;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec3 vNormalW;
  varying vec3 vView;
  varying vec3 vLocal;
  varying float vHill;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    float facing = clamp(abs(dot(normalize(vNormalW), normalize(vView))), 0.0, 1.0);
    float rim = fresnelTerm(vView, vNormalW, 2.2, uFresnel);
    // Plasma veins: ridged noise crawling over the membrane.
    float v = 1.0 - abs(snoise(vLocal * 3.2 * uScale + vec3(0.3, 1.0, 0.2) * uClock * 0.9));
    float veins = pow(v, 7.0);
    float nucleus = pow(facing, 5.0);
    vec3 col = mix(uDeep, uBody, 0.35 + 0.65 * rim);
    col += uTint * veins * 1.4 * uShaderIntensity;
    col += uCore * nucleus * (1.4 + 2.5 * uFlare);
    col += uTint * vHill * 0.8;
    float a = (0.4 + 0.6 * rim + veins * 0.5 + nucleus) * uFade;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The cell body. Additive plasma. */
export function createSomaMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uLumps: { value: 0.2 },
      uStretch: { value: 0.35 },
      uBeat: { value: 0 },
      uScale: { value: 1 },
      uHillock: { value: new Vector3(0, 0, -1) },
      uFade: { value: 1 },
      uGlow: { value: 2 },
      uFlare: { value: 0 },
      uFresnel: { value: 1 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: SOMA_VERTEX,
    fragmentShader: SOMA_FRAGMENT,
  });
  /** @param {object} s { clock, beat, flare, fade, hillock: Vector3 } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uLumps.value = c.somaLumps * g.noiseStrength;
    u.uStretch.value = c.somaStretch;
    u.uBeat.value = s.beat;
    u.uScale.value = g.noiseFrequency;
    u.uHillock.value.copy(s.hillock);
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.somaGlow * g.glow;
    u.uFlare.value = s.flare;
    u.uFresnel.value = g.fresnel;
    u.uCore.value.copy(getColor(c.coreColor));
    u.uTint.value.copy(getColor(c.tintColor));
    u.uBody.value.copy(getColor(c.bodyColor));
    u.uDeep.value.copy(getColor(c.deepColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The axon                                                              */
/* -------------------------------------------------------------------- */

const AXON_VERTEX = /* glsl */ `
  uniform vec3  uStart;      // the caster's hand
  uniform vec3  uEnd;        // the target, on the floor
  uniform float uHead;       // 0..1 how far the axon has crawled
  uniform float uTail;       // 0..1 how far it has been reeled in
  uniform float uThick;
  uniform float uWave;
  uniform float uArch;
  uniform float uNodes;
  uniform float uCharge;
  uniform float uClock;
  varying vec3 vNormalW;
  varying vec3 vView;
  varying float vS;
  varying float vNode;
  varying float vHead;

  vec3 axonAt(float s, float len, vec3 dir, vec3 side) {
    vec3 p = uStart + dir * (len * s);
    // Drop from the hand to the floor over the first metre and a half.
    float drop = 1.0 - smoothstep(0.0, min(1.5 / max(len, 0.1), 0.5), s);
    p.y = uStart.y * drop * drop + uArch * sin(3.14159265 * s) * (1.0 - drop) + 0.06;
    p.y = mix(p.y, uEnd.y + 0.06, smoothstep(0.85, 1.0, s));
    float meander = sin(s * len * 0.8 + 1.3) * 0.65 + sin(s * len * 2.1 + uClock * 0.6) * 0.35;
    p += side * meander * uWave * sin(3.14159265 * s);
    return p;
  }

  void main() {
    vec3 span = uEnd - uStart;
    span.y = 0.0;
    float len = max(length(span), 0.1);
    vec3 dir = span / len;
    vec3 side = vec3(-dir.z, 0.0, dir.x);
    float s = mix(uTail, uHead, position.z);
    vec3 C = axonAt(s, len, dir, side);
    vec3 C1 = axonAt(min(s + 0.004, 1.0), len, dir, side);
    vec3 C0 = axonAt(max(s - 0.004, 0.0), len, dir, side);
    vec3 T = normalize(C1 - C0 + vec3(1e-5, 0.0, 0.0));
    vec3 N = normalize(cross(vec3(0.0, 1.0, 0.0), T) + vec3(0.0, 1e-4, 0.0));
    vec3 Bn = cross(T, N);
    float node = pow(abs(sin(s * len * uNodes * 3.14159265)), 10.0);
    float headD = (uHead - s) * len;
    float head = exp(-headD * headD * 6.0);
    float hand = exp(-s * len * 2.5) * uCharge;
    float ends = sqrt(clamp(position.z * 12.0, 0.0, 1.0)) * sqrt(clamp((1.0 - position.z) * 12.0, 0.0, 1.0));
    float r = uThick * (1.0 + 0.7 * node + 1.6 * head) * mix(1.0, ends, step(0.001, uTail)) + 0.22 * hand;
    vec3 nrm = N * position.x + Bn * position.y;
    vec4 world = modelMatrix * vec4(C + nrm * r, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * nrm);
    vView = cameraPosition - world.xyz;
    vS = s;
    vNode = node;
    vHead = head + hand;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const AXON_FRAGMENT = /* glsl */ `
  uniform float uFade;
  uniform float uGlow;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  varying vec3 vNormalW;
  varying vec3 vView;
  varying float vS;
  varying float vNode;
  varying float vHead;
  void main() {
    float facing = clamp(abs(dot(normalize(vNormalW), normalize(vView))), 0.0, 1.0);
    float core = pow(facing, 3.0);
    vec3 col = mix(uDeep, uBody, 0.4 + 0.6 * (1.0 - core));
    col += uTint * core * 1.2 + uTint * vNode * 0.8 + uCore * vHead * 3.0;
    float a = (0.35 + 0.65 * core + vNode * 0.4 + vHead) * uFade;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The axon crawling from hand to target. Additive. */
export function createAxonMaterial() {
  const material = new ShaderMaterial({
    ...additive({ side: FrontSide }),
    uniforms: sharedUniforms({
      uStart: { value: new Vector3() },
      uEnd: { value: new Vector3() },
      uHead: { value: 0 },
      uTail: { value: 0 },
      uThick: { value: 0.07 },
      uWave: { value: 0.4 },
      uArch: { value: 0.5 },
      uNodes: { value: 1.3 },
      uCharge: { value: 0 },
      uClock: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 2 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: AXON_VERTEX,
    fragmentShader: AXON_FRAGMENT,
  });
  /** @param {object} s { start, end, head, tail, charge, clock, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(s.start);
    u.uEnd.value.copy(s.end);
    u.uHead.value = s.head;
    u.uTail.value = s.tail;
    u.uThick.value = c.axonThickness;
    u.uWave.value = c.axonWave * g.noiseStrength;
    u.uArch.value = c.axonArch;
    u.uNodes.value = c.axonNodes;
    u.uCharge.value = s.charge * c.chargeGlow;
    u.uClock.value = s.clock;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.axonGlow * g.glow;
    u.uCore.value.copy(getColor(c.coreColor));
    u.uTint.value.copy(getColor(c.tintColor));
    u.uBody.value.copy(getColor(c.bodyColor));
    u.uDeep.value.copy(getColor(c.deepColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The arcs                                                              */
/* -------------------------------------------------------------------- */

const ARC_VERTEX = /* glsl */ `
  uniform vec3  uA;
  uniform vec3  uB;
  uniform float uDraw;       // 0..1 of the bolt drawn from A
  uniform float uWidth;
  uniform float uJitter;
  uniform float uStrike;     // integer-stepped re-strike clock
  uniform float uSeed;
  varying float vSide;
  varying float vS;
  ${noiseGLSL}
  void main() {
    float s = position.x * uDraw;
    vec3 P = mix(uA, uB, s);
    vec3 d = uB - uA;
    vec3 T = length(d) < 1e-4 ? vec3(0.0, 1.0, 0.0) : normalize(d);
    vec3 ref = abs(T.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 n1 = normalize(cross(T, ref));
    vec3 n2 = cross(T, n1);
    float env = sin(3.14159265 * s);
    float k = uStrike + uSeed * 17.0;
    // Two octaves of jag: the big kinks and the fine crackle.
    vec3 q = vec3(s * 5.0, k * 1.37, uSeed * 3.1);
    vec3 q2 = vec3(s * 23.0, k * 2.11, uSeed * 7.3);
    P += (n1 * snoise(q) + n2 * snoise(q + 11.0)) * uJitter * env;
    P += (n1 * snoise(q2) + n2 * snoise(q2 + 5.0)) * uJitter * 0.3 * env;
    vec3 view = normalize(cameraPosition - P);
    vec3 side = cross(T, view);
    side = length(side) < 1e-4 ? n1 : normalize(side);
    P += side * position.y * uWidth * (0.45 + 0.55 * env);
    vSide = position.y;
    vS = s;
    gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  }
`;

const ARC_FRAGMENT = /* glsl */ `
  uniform float uIntensity;
  uniform float uGlow;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform float uGlobalGlow;
  varying float vSide;
  varying float vS;
  void main() {
    float core = exp(-vSide * vSide * 9.0);
    float halo = exp(-vSide * vSide * 2.0);
    vec3 col = uCore * core * 2.0 + mix(uBody, uTint, core) * halo;
    float a = (core + halo * 0.5) * uIntensity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** One bolt ribbon. Each arc owns one (the endpoints are per bolt). */
export function createArcMaterial(seed) {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({
      uA: { value: new Vector3() },
      uB: { value: new Vector3(0, 1, 0) },
      uDraw: { value: 1 },
      uWidth: { value: 0.1 },
      uJitter: { value: 0.2 },
      uStrike: { value: 0 },
      uSeed: { value: seed },
      uIntensity: { value: 0 },
      uGlow: { value: 2.6 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
    }),
    vertexShader: ARC_VERTEX,
    fragmentShader: ARC_FRAGMENT,
  });
  /** @param {object} s { a, b, draw, intensity, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uA.value.copy(s.a);
    u.uB.value.copy(s.b);
    u.uDraw.value = s.draw;
    u.uWidth.value = c.arcWidth;
    u.uJitter.value = c.arcJitter * g.turbulence;
    u.uStrike.value = Math.floor(s.clock * c.arcFlicker);
    u.uIntensity.value = s.intensity * g.opacity;
    u.uGlow.value = c.arcGlow * g.glow;
    u.uCore.value.copy(getColor(c.coreColor));
    u.uTint.value.copy(getColor(c.tintColor));
    u.uBody.value.copy(getColor(c.bodyColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The synaptic field                                                    */
/* -------------------------------------------------------------------- */

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FIELD_FRAGMENT = /* glsl */ `
  uniform vec4  uArms[${MAX_ARMS}];  // yaw, reach (m), growth, active
  uniform float uSize;      // field radius (m)
  uniform float uR0;
  uniform float uClock;
  uniform float uEnergy;    // 0..1 burnt in
  uniform float uListen;    // 0..1 while the override listens
  uniform float uPotential;
  uniform float uRing;      // diversion ring 0..1, -1 before
  uniform float uDissolve;
  uniform float uFade;
  uniform float uGlow;
  uniform float uCells;
  uniform float uTrace;
  uniform float uScorch;
  uniform float uNoise;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    vec2 m = p * uSize;               // metres from the soma
    float rm = r * uSize;

    // Domain-warped neural web: thin ridges of simplex noise at two scales.
    vec2 w = m + uNoise * 0.45 * vec2(snoise(vec3(m * 0.6, 1.7)), snoise(vec3(m * 0.6, 8.2)));
    float web1 = pow(1.0 - abs(snoise(vec3(w * uCells * 0.5, 0.3))), 14.0);
    float web2 = pow(1.0 - abs(snoise(vec3(w * uCells * 1.3, 4.1))), 18.0);
    float web = (web1 + web2 * 0.6) * (1.0 - smoothstep(0.6, 1.0, r));

    // The burnt trace under every planted arm, potentials running inward.
    float trace = 0.0;
    float flow = 0.0;
    for (int i = 0; i < ${MAX_ARMS}; i++) {
      vec4 A = uArms[i];
      if (A.w < 0.5) continue;
      // The quad lies rotated -90° about X: its +v is world -z.
      vec2 e = vec2(cos(A.x), -sin(A.x));
      float reach = uR0 + (A.y - uR0) * A.z;
      float t = clamp(dot(m, e), 0.0, reach);
      float d = length(m - e * t);
      float wob = snoise(vec3(t * 1.7, float(i) * 3.1, 0.5)) * 0.08 * uNoise;
      float line = exp(-pow((d + wob) / 0.07, 2.0)) * smoothstep(uR0 * 0.6, uR0 + 0.2, t);
      float burn = exp(-pow((d + wob) / 0.28, 2.0));
      trace += line + burn * 0.25;
      float band = fract(t / max(reach, 0.1) * 2.0 + uPotential);
      flow += line * exp(-pow((band - 0.5) / 0.08, 2.0));
    }

    // Listening pulses run in; the diversion ring runs out.
    float inward = pow(max(0.0, cos((r + uClock * 0.9) * 18.0)), 24.0) * uListen * (1.0 - smoothstep(0.75, 1.0, r));
    float ring = uRing >= 0.0 ? exp(-abs(r - uRing) * 26.0) * (1.0 - uRing) * 2.2 : 0.0;

    vec2 dm = dissolveMask(snoise01(vec3(m * 0.9, 2.3)), uDissolve, 0.08);
    float edge = 1.0 - smoothstep(0.7 + 0.15 * snoise(vec3(m * 0.8, 6.0)), 1.0, r);
    float scorch = uScorch * edge * uEnergy;
    float glow = (web * 0.55 + trace * uTrace * 0.8) * uEnergy * uShaderIntensity + flow * 2.5 + inward * 0.6 + ring;
    vec3 hot = mix(uBody, uTint, clamp(trace * 0.6 + flow + ring * 0.5, 0.0, 1.0));
    hot = mix(hot, uCore, clamp(flow * 0.8 + ring * 0.4, 0.0, 1.0));
    vec3 col = mix(uDeep * 0.6, hot * uGlow * uGlobalGlow, clamp(glow, 0.0, 1.0));
    col += uTint * dm.y * 2.5;
    float alpha = clamp(max(scorch, glow), 0.0, 1.0) * dm.x * uFade;
    gl_FragColor = vec4(col * (1.0 + glow * 0.6), alpha);
  }
`;

/** The floor. Normal-blended so the deep scorch darkens the ground. */
export function createFieldMaterial() {
  const arms = [];
  for (let i = 0; i < MAX_ARMS; i++) arms.push(new Vector4());
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uArms: { value: arms },
      uSize: { value: 4 },
      uR0: { value: 0.4 },
      uClock: { value: 0 },
      uEnergy: { value: 0 },
      uListen: { value: 0 },
      uPotential: { value: 0 },
      uRing: { value: -1 },
      uDissolve: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.5 },
      uCells: { value: 2 },
      uTrace: { value: 1.4 },
      uScorch: { value: 0.85 },
      uNoise: { value: 1 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: FIELD_FRAGMENT,
  });
  /** @param {object} s { size, clock, energy, listen, potential, ring, dissolve, fade } — arms written by the ability */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = s.size;
    u.uR0.value = c.somaRadius * 0.78;
    u.uClock.value = s.clock;
    u.uEnergy.value = s.energy;
    u.uListen.value = s.listen;
    u.uPotential.value = s.potential;
    u.uRing.value = s.ring;
    u.uDissolve.value = s.dissolve;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.fieldGlow * g.glow;
    u.uCells.value = c.fieldCells * g.noiseFrequency;
    u.uTrace.value = c.fieldTrace;
    u.uScorch.value = c.fieldScorch;
    u.uNoise.value = g.noiseStrength;
    u.uCore.value.copy(getColor(c.coreColor));
    u.uTint.value.copy(getColor(c.tintColor));
    u.uBody.value.copy(getColor(c.bodyColor));
    u.uDeep.value.copy(getColor(c.deepColor));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens                                                              */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uCrackle;
  uniform float uShock;
  uniform float uWave;
  uniform float uClock;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    vec2 radial = q / max(r, 1e-3);
    float body = 1.0 - smoothstep(0.2, 0.95, r);
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    // Ionised air: fast, fine, stepped noise.
    float k = floor(uClock * 18.0);
    vec3 np = vec3(q * 6.0 * uScale, k * 0.37);
    vec2 n = vec2(snoise(np), snoise(np + vec3(5.2, 1.3, 7.7)));
    vec2 dir = n * body * uCrackle + (radial + n * 0.3) * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uCrackle + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc. Opaque on purpose (the offset buffer wants the
 * proxy's own value, and the expansion's transparent ⇒ VFX routing must not
 * pull it out of the warp pass).
 */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCrackle: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { crackle, shock, wave, clock } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCrackle.value = s.crackle * c.lensCrackle * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
