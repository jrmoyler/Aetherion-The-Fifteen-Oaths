import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  MeshStandardMaterial,
  NormalBlending,
  ShaderMaterial,
  Vector3,
  Vector4,
} from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Umbra Exchange — materials.
 *
 *  - **obsidian** — the anchor's body: lit, opaque, glassy-black
 *    `MeshStandardMaterial` on the world layer, casting shadows.
 *  - **veins** — an additive shell over the same anchor geometry: ridged
 *    violet veins that pulse *up* the shank while the anchor hums, a fresnel
 *    sheen, a white-hot bite in the crown and flukes at the plunge, and a
 *    noise dissolve for the anchor forming out of the caster's shadow.
 *  - **chain** — a unit tube bent onto a quadratic bezier in the vertex
 *    shader and pinched into alternating links (each link turned a quarter),
 *    normal-blended dark metal with a violet edge and a pulse that runs down
 *    it when a body is dragged.
 *  - **pool** — the floor: real darkness (normal-blended, it *removes* light)
 *    spreading out with an fbm edge, churned inward, split by violet fissures
 *    radiating from the anchor; a puddle under every hooked body and under its
 *    mirror point, and the umbra itself crawling P → anchor → P′.
 *  - **gate** — instanced sheaths of umbral tendrils, twisted in the vertex
 *    shader, standing where a body sinks and where it rises.
 *  - **lens** — `LAYER.DISTORTION`: the floor bends round the anchor while it
 *    turns, and a pressure ring runs out at the plunge.
 *
 * Every material reads `settings.umbraExchange` in `userData.sync(state)`.
 */

const ID = config.id;

/** Ramp uniforms shared in shape by every bespoke material. */
const rampUniforms = () => ({
  uCore: { value: new Color() },
  uTint: { value: new Color() },
  uBody: { value: new Color() },
  uDeep: { value: new Color() },
  uVoid: { value: new Color() },
});

function syncRamp(u, c) {
  u.uCore.value.copy(getColor(c.coreColor));
  u.uTint.value.copy(getColor(c.tintColor));
  u.uBody.value.copy(getColor(c.bodyColor));
  u.uDeep.value.copy(getColor(c.deepColor));
  u.uVoid.value.copy(getColor(c.voidColor));
}

const RAMP_GLSL = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform vec3 uDeep;
  uniform vec3 uVoid;
`;

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* -------------------------------------------------------------------- */
/* Obsidian                                                             */
/* -------------------------------------------------------------------- */

/** The anchor's lit body. */
export function createObsidianMaterial() {
  const material = new MeshStandardMaterial({
    color: 0x120c1c,
    metalness: 0.35,
    roughness: 0.16,
    emissive: 0x0a0614,
    emissiveIntensity: 1,
    flatShading: true,
  });
  material.userData.sync = () => {
    const c = settings[ID];
    material.color.copy(getColor(c.obsidianColor));
    material.metalness = c.obsidianMetalness;
    material.roughness = c.obsidianRoughness;
    material.emissive.copy(getColor(c.deepColor));
    material.emissiveIntensity = 0.6 * settings.global.glow;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Veins                                                                */
/* -------------------------------------------------------------------- */

const VEIN_VERTEX = /* glsl */ `
  attribute float aPart;
  uniform float uInflate;
  varying vec3 vObj;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vPart;
  void main() {
    vObj = position;
    vPart = aPart;
    vec3 p = position + normal * uInflate;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const VEIN_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uScale;
  uniform float uNoise;
  uniform float uGlow;
  uniform float uRim;
  uniform float uHum;      // 0..1 how hard the veins pulse (the linger)
  uniform float uRate;
  uniform float uHeat;     // the plunge bite, decays
  uniform float uForm;     // 0 = smoke, 1 = whole (anticipation and exit)
  uniform float uFade;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  ${RAMP_GLSL}
  varying vec3 vObj;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vPart;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    // Forming out of smoke: a noise dissolve with a hot edge.
    float n = snoise01(vec3(vObj * 9.0) + vec3(0.0, uClock * 0.6, 0.0));
    vec2 dm = dissolveMask(n, 1.0 - uForm, 0.12);
    if (dm.x < 0.5 && dm.y < 0.01) discard;

    vec3 q = vObj * uScale;
    float v1 = 1.0 - abs(snoise(q + vec3(0.0, -uClock * 0.15, 0.0)));
    float v2 = 1.0 - abs(snoise(q * 2.3 + vec3(4.1, 1.7, -uClock * 0.2)));
    float veins = pow(v1, 14.0) + 0.6 * pow(v2, 18.0) * uNoise;
    // Pulses climb the shank from the crown to the ring.
    float wave = 0.5 + 0.5 * sin(uClock * uRate * 6.2831 - vObj.y * 9.0);
    float pulse = mix(0.55, 0.35 + 1.15 * wave * wave, uHum);
    float rim = fresnelTerm(vViewDir, vNormalW, 2.5, uRim);
    // The bite: crown, spike and flukes white-hot at the plunge.
    float bite = vPart > 1.5 && vPart < 3.5 ? 1.4 : (1.0 - smoothstep(0.05, 0.55, vObj.y));
    float heat = uHeat * bite;
    float e = clamp(veins * pulse * uShaderIntensity + heat + dm.y * 1.5, 0.0, 1.6);
    vec3 col = gradient4(uCore, uTint, uBody, uDeep, 1.0 - clamp(e, 0.0, 1.0));
    col += uTint * rim * 0.5;
    float alpha = clamp(e + rim * 0.35, 0.0, 1.0) * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, alpha);
  }
`;

/** The additive vein shell over the anchor. */
export function createVeinMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uScale: { value: 3 },
      uNoise: { value: 1 },
      uGlow: { value: 2 },
      uRim: { value: 1.4 },
      uHum: { value: 0 },
      uRate: { value: 2.6 },
      uHeat: { value: 0 },
      uForm: { value: 1 },
      uFade: { value: 1 },
      uInflate: { value: 0.006 },
      ...rampUniforms(),
    }),
    vertexShader: VEIN_VERTEX,
    fragmentShader: VEIN_FRAGMENT,
  });
  /** @param {{clock:number, hum:number, heat:number, form:number, fade:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uScale.value = c.veinScale * g.noiseFrequency;
    u.uNoise.value = g.noiseStrength;
    u.uGlow.value = c.veinGlow * g.glow;
    u.uRim.value = c.rimGlow * g.fresnel;
    u.uHum.value = s.hum;
    u.uRate.value = c.humRate * g.noiseSpeed;
    u.uHeat.value = s.heat;
    u.uForm.value = s.form;
    u.uFade.value = s.fade * g.opacity;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Chain                                                                */
/* -------------------------------------------------------------------- */

const CHAIN_VERTEX = /* glsl */ `
  uniform vec3 uA;          // start (world)
  uniform vec3 uB;          // bezier control
  uniform vec3 uC;          // end
  uniform float uFrom;      // shown span along the curve
  uniform float uTo;
  uniform float uWidth;
  uniform float uLinks;     // links over the whole curve
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vLink;
  vec3 bez(float t) {
    float s = 1.0 - t;
    return s * s * uA + 2.0 * s * t * uB + t * t * uC;
  }
  void main() {
    float t = mix(uFrom, uTo, position.x);
    vec3 p = bez(t);
    vec3 tang = bez(min(1.0, t + 0.01)) - bez(max(0.0, t - 0.01));
    tang = length(tang) > 1e-5 ? normalize(tang) : vec3(1.0, 0.0, 0.0);
    vec3 ref = abs(tang.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 side = normalize(cross(tang, ref));
    vec3 up = cross(side, tang);
    float L = t * uLinks;
    float k = floor(L);
    float s = fract(L);
    // Alternate links turn a quarter; each is a flattened oval pinched where
    // it threads the next one.
    float turn = mod(k, 2.0) * 1.5707963;
    float cs = cos(turn), sn = sin(turn);
    vec2 unit = vec2(position.y, position.z);
    vec2 flat2 = vec2(unit.x * 1.0, unit.y * 0.38);
    vec2 sec = vec2(cs * flat2.x - sn * flat2.y, sn * flat2.x + cs * flat2.y);
    float pinch = 0.42 + 0.58 * pow(sin(3.14159265 * s), 0.55);
    // Taper at the very ends so the chain never ends in a cut.
    float ends = smoothstep(0.0, 0.02, position.x) * (0.55 + 0.45 * smoothstep(1.0, 0.97, position.x));
    vec3 world = p + (side * sec.x + up * sec.y) * uWidth * pinch * ends;
    vec2 nn = vec2(cs * unit.x - sn * unit.y * 2.6, sn * unit.x + cs * unit.y * 2.6);
    vNormalW = normalize(side * nn.x + up * nn.y);
    vViewDir = cameraPosition - world;
    vUv = vec2(t, position.x);
    vLink = s;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const CHAIN_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uPulse;     // 0..1 position of a drag pulse, < 0 for none
  uniform float uTaut;
  uniform vec3 uLightDir;
  uniform float uGlobalGlow;
  ${RAMP_GLSL}
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vLink;
  ${commonGLSL}
  void main() {
    vec3 n = normalize(vNormalW);
    float diffuse = 0.25 + 0.75 * max(0.0, dot(n, normalize(uLightDir)));
    vec3 v = normalize(vViewDir);
    float spec = pow(max(0.0, dot(reflect(-normalize(uLightDir), n), v)), 24.0);
    float rim = fresnelTerm(vViewDir, vNormalW, 2.0, 1.0);
    vec3 metal = mix(uVoid, uDeep, diffuse) + vec3(spec) * 0.35;
    // The edge of every link catches violet; a drag pulse runs down it.
    float edge = pow(1.0 - abs(vLink * 2.0 - 1.0), 6.0) * 0.4 + rim;
    float pulse = uPulse >= 0.0 ? exp(-abs(vUv.x - uPulse) * 18.0) : 0.0;
    float crawl = 0.5 + 0.5 * sin(vUv.x * 40.0 - uClock * 9.0);
    float hot = clamp(edge * (0.5 + 0.5 * uTaut) * (0.6 + 0.4 * crawl) + pulse * 1.6, 0.0, 1.5);
    vec3 col = metal + gradient4(uCore, uTint, uBody, uDeep, 1.0 - clamp(hot, 0.0, 1.0)) * hot * uGlow * uGlobalGlow;
    gl_FragColor = vec4(col, uOpacity * uFade);
  }
`;

/** One chain; each chain owns its material (its curve is uniforms). */
export function createChainMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uA: { value: new Vector3() },
      uB: { value: new Vector3() },
      uC: { value: new Vector3() },
      uFrom: { value: 0 },
      uTo: { value: 1 },
      uWidth: { value: 0.07 },
      uLinks: { value: 20 },
      uClock: { value: 0 },
      uGlow: { value: 1.6 },
      uOpacity: { value: 1 },
      uFade: { value: 1 },
      uPulse: { value: -1 },
      uTaut: { value: 0 },
      ...rampUniforms(),
    }),
    vertexShader: CHAIN_VERTEX,
    fragmentShader: CHAIN_FRAGMENT,
  });
  /** @param {{clock:number, fade:number, pulse:number, taut:number, length:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = s.clock;
    u.uWidth.value = c.chainWidth;
    u.uLinks.value = Math.max(2, Math.round(c.chainLinks * s.length));
    u.uGlow.value = c.chainGlow * g.glow;
    u.uOpacity.value = c.chainOpacity * g.opacity;
    u.uFade.value = s.fade;
    u.uPulse.value = s.pulse;
    u.uTaut.value = s.taut;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Pool                                                                 */
/* -------------------------------------------------------------------- */

export const MAX_POOL_TARGETS = 6;

const POOL_FRAGMENT = /* glsl */ `
  #define TARGETS ${MAX_POOL_TARGETS}
  uniform float uHalf;       // quad half-size (m)
  uniform float uPoolR;      // pool radius (m)
  uniform float uSpread;     // 0..1 the pool running out
  uniform float uDarkness;
  uniform float uSwirl;
  uniform float uCrackGlow;
  uniform float uCracks;
  uniform float uImpact;     // 0..1 the plunge ring, < 0 none
  uniform float uHum;
  uniform float uPuddle;     // (m)
  uniform float uUmbra;      // (m)
  uniform float uClock;
  uniform float uScale;
  uniform float uNoise;
  uniform float uFade;
  uniform float uDissolve;
  uniform vec4 uTargets[TARGETS];  // P.xy, P'.xy in pool space (m)
  uniform vec4 uState[TARGETS];    // puddle at P, puddle at P', crawl 0..1 (<0 none), active
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  ${RAMP_GLSL}
  varying vec2 vUv;
  ${noiseGLSL}
  ${commonGLSL}

  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-5), 0.0, 1.0);
    return length(p - a - ab * h);
  }

  void main() {
    // The quad is rotated onto the floor; pool space is metres from the anchor.
    vec2 q = (vUv - 0.5) * 2.0 * uHalf;
    float r = length(q) / max(uPoolR, 0.01);
    float a = atan(q.y, q.x);

    float edgeN = fbm3(vec3(q * 0.55 * uScale, uClock * 0.08)) * uNoise;
    float pool = 1.0 - smoothstep(uSpread * 0.82, uSpread, r + edgeN * 0.16);

    // The darkness churns inward, faster near the anchor.
    vec2 sw = rot2(uSwirl * (1.2 - r) * 2.4 + uClock * 0.35 * uSwirl) * q;
    float churn = fbm3(vec3(sw * 0.8 * uScale, uClock * 0.22)) * 0.5 + 0.5;

    // Fissures: polar spokes bent by noise, branching by ridged noise.
    float bend = snoise(vec3(q * 0.45 * uScale, 2.7)) * 0.9;
    float spoke = abs(sin((a + bend * 0.35) * uCracks * 0.5));
    float fiss = exp(-spoke * (18.0 + 30.0 * r)) * smoothstep(0.06, 0.22, r) * (1.0 - smoothstep(0.55, 1.0, r / max(uSpread, 0.01)));
    float branch = pow(ridged(vec3(q * 1.1 * uScale, 4.2), 4), 9.0) * 0.25 * smoothstep(0.1, 0.35, r);
    float throb = 0.7 + 0.3 * sin(uClock * 5.0 - r * 9.0) * uHum;
    float crack = clamp((fiss + branch * (1.0 - r)) * throb * uShaderIntensity, 0.0, 1.0) * pool;

    // The plunge ring, running out from the anchor.
    float ring = uImpact >= 0.0 ? exp(-abs(r - uImpact * 1.15) * 16.0) * (1.0 - uImpact) : 0.0;

    // The exchange: puddles, the crawling umbra and its trail.
    float dark = 0.0;
    float glow = 0.0;
    for (int i = 0; i < TARGETS; i++) {
      vec4 st = uState[i];
      if (st.w < 0.5) continue;
      vec2 P = uTargets[i].xy;
      vec2 Q = uTargets[i].zw;
      float wob = snoise(vec3(q * 1.6 * uScale, uClock * 0.6 + float(i))) * 0.18 * uNoise;
      float dp = length(q - P) / max(uPuddle, 0.05) + wob;
      float dq = length(q - Q) / max(uPuddle, 0.05) + wob;
      dark += st.x * (1.0 - smoothstep(0.55, 1.0, dp)) + st.y * (1.0 - smoothstep(0.55, 1.0, dq));
      glow += st.x * exp(-abs(dp - 0.9) * 9.0) + st.y * exp(-abs(dq - 0.9) * 9.0);
      if (st.z >= 0.0) {
        // P → anchor → P′, half the progress on each leg.
        float s = st.z;
        vec2 head = s < 0.5 ? mix(P, vec2(0.0), s * 2.0) : mix(vec2(0.0), Q, s * 2.0 - 1.0);
        vec2 dir = s < 0.5 ? -P : Q;
        dir = length(dir) > 1e-3 ? normalize(dir) : vec2(1.0, 0.0);
        vec2 rel = q - head;
        float along = dot(rel, dir);
        float across = dot(rel, vec2(-dir.y, dir.x));
        // A stretched body with a ragged edge, leaning into its crawl.
        float blob = length(vec2(along / 1.7, across)) / max(uUmbra, 0.05) + wob * 1.4;
        float body = 1.0 - smoothstep(0.5, 1.0, blob);
        dark += body;
        glow += exp(-abs(blob - 0.9) * 8.0) * 0.8;
        // The trail it drags behind it.
        float trail = s < 0.5 ? segDist(q, P, head) : min(segDist(q, P, vec2(0.0)), segDist(q, vec2(0.0), head));
        dark += (1.0 - smoothstep(0.0, uUmbra * 0.35, trail)) * 0.55;
      }
    }
    dark = clamp(dark, 0.0, 1.0);

    float base = pool * uDarkness * (0.72 + 0.28 * churn);
    float alpha = max(base, dark * 0.95);
    // The pool lip glows faintly where the darkness meets the floor.
    float lip = exp(-abs(r + edgeN * 0.16 - uSpread * 0.9) * 22.0) * pool;
    float e = clamp(crack * uCrackGlow + ring * 1.6 + glow * 0.7 + lip * 0.35, 0.0, 2.0);
    vec3 col = mix(uVoid, uDeep, churn * 0.6);
    col += gradient4(uCore, uTint, uBody, uDeep, 1.0 - clamp(e, 0.0, 1.0)) * e * uGlobalGlow;

    // Exit: the pool drains in patches.
    vec2 dm = dissolveMask(snoise01(vec3(q * 0.9 * uScale, 5.1)), uDissolve, 0.06);
    alpha = max(alpha, clamp(e, 0.0, 1.0)) * dm.x * uFade;
    col += uTint * dm.y * 1.5;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The pool on the floor. Normal-blended: it takes light away. */
export function createPoolMaterial() {
  const targets = [];
  const states = [];
  for (let i = 0; i < MAX_POOL_TARGETS; i++) {
    targets.push(new Vector4());
    states.push(new Vector4());
  }
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHalf: { value: 5 },
      uPoolR: { value: 4.4 },
      uSpread: { value: 0 },
      uDarkness: { value: 0.86 },
      uSwirl: { value: 0.6 },
      uCrackGlow: { value: 1.8 },
      uCracks: { value: 9 },
      uImpact: { value: -1 },
      uHum: { value: 0 },
      uPuddle: { value: 0.9 },
      uUmbra: { value: 0.75 },
      uClock: { value: 0 },
      uScale: { value: 1 },
      uNoise: { value: 1 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uTargets: { value: targets },
      uState: { value: states },
      ...rampUniforms(),
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: POOL_FRAGMENT,
  });
  /** @param {{half:number, radius:number, spread:number, impact:number, hum:number, clock:number, fade:number, dissolve:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHalf.value = s.half;
    u.uPoolR.value = s.radius;
    u.uSpread.value = s.spread;
    u.uDarkness.value = c.poolDarkness;
    u.uSwirl.value = c.poolSwirl * g.turbulence;
    u.uCrackGlow.value = c.crackGlow * g.glow;
    u.uCracks.value = Math.max(2, Math.round(c.crackCount)) * 2;
    u.uImpact.value = s.impact;
    u.uHum.value = s.hum;
    u.uPuddle.value = c.puddleSize;
    u.uUmbra.value = c.umbraSize;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
    u.uNoise.value = g.noiseStrength;
    u.uFade.value = s.fade * g.opacity;
    u.uDissolve.value = s.dissolve;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Gate                                                                 */
/* -------------------------------------------------------------------- */

const GATE_VERTEX = /* glsl */ `
  attribute vec4 aGate;      // open, seed, rising, fade
  uniform float uHeight;
  uniform float uRadius;
  uniform float uTwist;
  uniform float uClock;
  uniform float uNoise;
  varying vec2 vUv;
  varying vec4 vGate;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vTendril;
  ${noiseGLSL}
  void main() {
    float h = position.y;
    float ang = atan(position.z, position.x);
    float open = aGate.x;
    float seed = aGate.y;
    // Rising gates twist the other way: the shadow unwinds as the body leaves.
    float dirSign = aGate.z > 0.5 ? -1.0 : 1.0;
    float twist = dirSign * (uTwist * h * h + uClock * 1.4) + seed * 6.2831;
    float tendril = pow(0.5 + 0.5 * cos(ang * 5.0 + twist), 2.5);
    float flare = 1.0 + 1.2 * pow(1.0 - h, 4.0);
    float r = uRadius * flare * (0.42 + 0.58 * tendril) * (1.0 - 0.75 * h * h);
    r *= mix(0.35, 1.0, open);
    float wob = snoise(vec3(position.x * 2.0 + seed, h * 3.0 - uClock * 1.6, position.z * 2.0)) * 0.22 * h * uNoise;
    vec3 p = vec3(cos(ang) * (r + wob), h * uHeight * open, sin(ang) * (r + wob));
    vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * vec3(cos(ang), 0.35, sin(ang)));
    vViewDir = cameraPosition - world.xyz;
    vUv = vec2(ang / 6.2831 + 0.5, h);
    vGate = aGate;
    vTendril = tendril;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const GATE_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uGlow;
  uniform float uScale;
  uniform float uGlobalGlow;
  ${RAMP_GLSL}
  varying vec2 vUv;
  varying vec4 vGate;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vTendril;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    float h = vUv.y;
    // Torn upward: smoke eats the sheath from the top, more as it closes.
    float n = fbm3(vec3(vUv.x * 7.0 * uScale, h * 3.0 - uClock * 1.2, vGate.y * 9.0)) * 0.5 + 0.5;
    float tear = smoothstep(h * 0.95 + 0.05, h * 0.95 + 0.3, n + 0.25 * (1.0 - h));
    float body = tear * smoothstep(0.0, 0.05, h) * mix(0.55, 1.0, vTendril);
    float rim = fresnelTerm(vViewDir, vNormalW, 2.0, 1.0);
    float edge = clamp(rim * 0.45 + pow(vTendril, 6.0) * 0.35, 0.0, 1.0);
    float alpha = body * vGate.w;
    if (alpha < 0.004) discard;
    vec3 col = mix(uVoid, uDeep, 0.5 + 0.5 * n);
    col += gradient4(uCore, uTint, uBody, uDeep, 1.0 - edge) * edge * uGlow * uGlobalGlow;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** Instanced umbral sheaths. */
export function createGateMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHeight: { value: 2.4 },
      uRadius: { value: 0.6 },
      uTwist: { value: 2.2 },
      uClock: { value: 0 },
      uNoise: { value: 1 },
      uGlow: { value: 1.5 },
      uScale: { value: 1 },
      ...rampUniforms(),
    }),
    vertexShader: GATE_VERTEX,
    fragmentShader: GATE_FRAGMENT,
  });
  /** @param {{clock:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHeight.value = c.gateHeight;
    u.uRadius.value = c.gateRadius;
    u.uTwist.value = c.gateTwist * g.turbulence;
    u.uClock.value = s.clock;
    u.uNoise.value = g.noiseStrength;
    u.uGlow.value = c.gateGlow * g.glow;
    u.uScale.value = g.noiseFrequency;
    syncRamp(u, c);
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Lens                                                                 */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uSwirl;
  uniform float uShock;
  uniform float uWave;
  uniform float uClock;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    vec2 radial = q / max(r, 1e-3);
    vec2 tangent = vec2(-radial.y, radial.x);
    float body = (1.0 - smoothstep(0.15, 0.9, r)) * smoothstep(0.0, 0.12, r);
    float ring = exp(-pow((r - uWave) / 0.09, 2.0));
    vec3 np = vec3(q * 2.2 * uScale, uClock * 0.5);
    vec2 n = vec2(snoise(np), snoise(np + vec3(5.2, 1.3, 7.7))) * 0.35;
    vec2 dir = (tangent * 0.8 + radial * 0.2 + n) * body * uSwirl + (radial + n) * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(body * uSwirl + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc. Opaque on purpose, like the other expansion lenses:
 * the offset buffer wants the proxy's own value, and opacity keeps it out of
 * the "transparent ⇒ VFX layer" routing.
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
      uSwirl: { value: 0 },
      uShock: { value: 0 },
      uWave: { value: 0 },
      uClock: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: QUAD_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {{swirl:number, shock:number, wave:number, clock:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSwirl.value = s.swirl * c.lensStrength * g.distortion;
    u.uShock.value = s.shock * c.lensShock * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
