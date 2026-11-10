import { Color, DoubleSide, FrontSide, ShaderMaterial, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Bloodroot Thorns — the two bespoke shaders the thicket is drawn with.
 *
 *  - **the roots** — one merged mesh of identical tubes. The vertex stage looks
 *    each root up in a uniform table and evaluates its noisy path in closed form
 *    (the same function `rootPathAt` evaluates on the CPU, so a thorn always
 *    stands on its root), cuts it off at the growth front with a tapered tip,
 *    and half-buries it in the floor. The fragment stage is dark wet wood: a
 *    bark grain stretched along the root, crimson veins in the grooves that
 *    *pulse* — heartbeats that travel outward from the heart along every root
 *    at `rootPulseSpeed`, so the roots read as arteries feeding the thicket —
 *    and a white-hot front where the root is still forcing its way through.
 *    `uDead` darkens it all to a withered husk.
 *  - **the thorns** — instanced, glossy dark red: near-black clot in the body,
 *    a tight specular and the sky in it, a bright red fresnel rim, sap glowing
 *    in the barbs and the base (`aSap`), and light bleeding through the thin
 *    parts when the vine is between the camera and the sun. `uDead` takes it to
 *    a matte brown-black as it withers.
 *
 * Every material reads `settings.bloodroot` in `userData.sync(state)`.
 */

/** How many roots the tables hold. Primaries × (1 + branches), plus the runner. */
export const BLOODROOT_MAX_ROOTS = 31;
/** Table slot of the runner — the root that crawls from the caster to the circle. */
export const BLOODROOT_RUNNER = 30;

/** Equirect lookup for the glossy thorns. */
const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/**
 * The root path, shared verbatim by the vertex stage. Mirrored in JS by
 * `rootPathAt` below — change one, change the other.
 *
 * offset(s) = k·W·L·( 0.30·s·(sin(s·f + p1) − sin p1) + 0.12·(sin(s·f·2.3 + p2) − sin p2) )
 *
 * Both terms are zero at s = 0, so every root leaves its fork exactly on it.
 * `k` (table C.z) scales one root's wander, and a *pinned* root (C.w = 1, the
 * runner) has `s·offset(1)` taken off so it also ends exactly on its target.
 */
const PATH_GLSL = /* glsl */ `
  uniform vec4 uRootA[${BLOODROOT_MAX_ROOTS}];  // origin x, origin z, bearing, length
  uniform vec4 uRootB[${BLOODROOT_MAX_ROOTS}];  // thickness, grown (m), phase 1, phase 2
  uniform vec4 uRootC[${BLOODROOT_MAX_ROOTS}];  // distance from the heart at the fork, live, wander scale, pinned
  uniform float uWander;
  uniform float uWanderFreq;

  float rootOffset(vec4 B, float s) {
    return 0.30 * s * (sin(s * uWanderFreq + B.z) - sin(B.z))
         + 0.12 * (sin(s * uWanderFreq * 2.3 + B.w) - sin(B.w));
  }

  vec2 rootPath(int i, float s) {
    vec4 A = uRootA[i];
    vec4 B = uRootB[i];
    vec4 C = uRootC[i];
    vec2 dir = vec2(cos(A.z), sin(A.z));
    vec2 perp = vec2(-dir.y, dir.x);
    float d = s * A.w;
    float off = rootOffset(B, s) - C.w * s * rootOffset(B, 1.0);
    off *= uWander * C.z * A.w;
    return A.xy + dir * d + perp * off;
  }
`;

/** JS mirror of the GLSL path. Writes x/z (local to the heart) into `out`. */
const rootOffset = (root, s, freq) =>
  0.3 * s * (Math.sin(s * freq + root.p1) - Math.sin(root.p1)) + 0.12 * (Math.sin(s * freq * 2.3 + root.p2) - Math.sin(root.p2));

export function rootPathAt(root, s, wander, freq, out) {
  const dx = Math.cos(root.bearing);
  const dz = Math.sin(root.bearing);
  const d = s * root.length;
  const pin = root.pin ?? 0;
  const off =
    wander * (root.wanderScale ?? 1) * root.length * (rootOffset(root, s, freq) - (pin ? pin * s * rootOffset(root, 1, freq) : 0));
  out.x = root.ox + dx * d - dz * off;
  out.z = root.oz + dz * d + dx * off;
  return out;
}

/* -------------------------------------------------------------------- */
/* the roots                                                            */
/* -------------------------------------------------------------------- */

const ROOT_VERTEX = /* glsl */ `
  attribute vec3 aRoot;   // root index, s, around

  uniform float uTaper;
  uniform float uEmbed;
  uniform float uTipLength;
  uniform float uSink;      // metres the roots have sunk

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vS;
  varying float vDist;      // metres from the heart along the root network
  varying float vFront;     // metres behind this root's growth front
  varying float vAround;
  varying float vRadius;
  varying float vRoot;

  ${PATH_GLSL}

  void main() {
    int i = int(aRoot.x + 0.5);
    vec4 A = uRootA[i];
    vec4 B = uRootB[i];
    vec4 C = uRootC[i];

    float L = max(A.w, 1e-3);
    float grown = clamp(B.y, 0.0, L);
    // Everything beyond the front is collapsed onto it: the root has not got there yet.
    float s = min(aRoot.y, grown / L);
    float d = s * L;
    float behind = grown - d;

    float r = B.x * mix(1.0, uTaper, s);
    // Narrows to a point at the front.
    r *= smoothstep(0.0, max(uTipLength, 1e-3), behind) * 0.85 + 0.15 * step(1e-3, behind);
    r *= step(0.5, C.y) * step(1e-3, grown);

    vec2 p0 = rootPath(i, s);
    vec2 p1 = rootPath(i, min(s + 0.01, 1.0));
    vec2 pm = rootPath(i, max(s - 0.01, 0.0));
    vec2 t2 = normalize(p1 - pm + vec2(1e-5, 0.0));
    vec3 T = vec3(t2.x, 0.0, t2.y);
    vec3 S = vec3(-t2.y, 0.0, t2.x);
    vec3 U = vec3(0.0, 1.0, 0.0);

    float a = aRoot.z;
    vec3 n = S * cos(a) + U * sin(a);
    // Squashed a little: a root pressed into earth is wider than it is tall.
    vec3 offset = S * cos(a) * r * 1.15 + U * sin(a) * r * 0.85;
    vec3 local = vec3(p0.x, r * (1.0 - uEmbed) - uSink * r, p0.y) + offset;

    vec4 world = modelMatrix * vec4(local, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * n);
    vWorld = world.xyz;
    vS = s;
    vDist = C.x + d;
    vFront = behind;
    vAround = a;
    vRadius = r;
    vRoot = float(i);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ROOT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uBark;
  uniform float uBarkScale;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uVeins;
  uniform float uVeinWidth;
  uniform float uPulseRate;
  uniform float uPulseSign;   // +1 beats run outward (feeding), −1 inward (the drain)
  uniform float uPulseSpeed;
  uniform float uPulseWidth;
  uniform float uFrontGlow;
  uniform float uRim;
  uniform float uDead;
  uniform float uDarken;
  uniform float uClock;     // seconds the thicket has stood — the heartbeat's clock
  uniform float uSeed;
  uniform vec3  uColorBark;
  uniform vec3  uColorBarkLight;
  uniform vec3  uColorVein;
  uniform vec3  uColorFront;
  uniform vec3  uColorRim;
  uniform vec3  uColorDead;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vS;
  varying float vDist;
  varying float vFront;
  varying float vAround;
  varying float vRadius;
  varying float vRoot;

  ${noiseGLSL}

  void main() {
    if (vRadius <= 1e-4) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // Bark: grain stretched along the root, wrapped round it.
    vec3 bp = vec3(vDist * uBarkScale * 0.25, vAround * 1.6, vRoot * 3.7 + uSeed);
    float grain = fbm3(bp * vec3(1.0, 1.0, 0.0) + vec3(0.0, 0.0, bp.z));
    float groove = 1.0 - abs(snoise(vec3(vAround * 2.5, vDist * uBarkScale * 0.08, vRoot + uSeed)));
    vec3 wood = mix(uColorBark, uColorBarkLight, clamp(grain * 0.5 + 0.5, 0.0, 1.0) * uBark);

    // Veins live in the grooves.
    float vein = smoothstep(1.0 - uVeinWidth, 1.0, groove);

    // Heartbeats travelling outward along the roots.
    float wave = uClock * uPulseSpeed - vDist * uPulseSign;
    float period = uPulseSpeed / max(uPulseRate, 1e-3);
    float phase = mod(wave, max(period, 1e-3));
    float beat = exp(-phase / max(uPulseWidth, 1e-3)) * step(0.0, wave);
    float veinGlow = vein * uVeins * (0.25 + 1.6 * beat);

    float lambert = 0.35 + 0.65 * clamp(dot(N, L), 0.0, 1.0);
    vec3 color = wood * lambert;
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), uGloss) * uSpecular * (0.4 + 0.6 * groove);
    color += vec3(spec);
    color += uColorRim * pow(1.0 - ndv, 3.0) * uRim * uGlobalGlow;

    // The growth front: a hot tip forcing its way through.
    float front = exp(-vFront / 0.25) * uFrontGlow;

    float alive = 1.0 - uDead;
    color += (uColorVein * veinGlow + uColorFront * front) * uGlobalGlow * alive;
    color = mix(color, uColorDead * lambert + vec3(spec) * 0.2, uDead * uDarken);

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** The racing roots. Opaque; the vertex stage builds the tubes. */
export function createBloodrootRootMaterial() {
  const table = (n) => Array.from({ length: n }, () => new Vector4());
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRootA: { value: table(BLOODROOT_MAX_ROOTS) },
      uRootB: { value: table(BLOODROOT_MAX_ROOTS) },
      uRootC: { value: table(BLOODROOT_MAX_ROOTS) },
      uWander: { value: 0.7 },
      uWanderFreq: { value: 3 },
      uTaper: { value: 0.3 },
      uEmbed: { value: 0.35 },
      uTipLength: { value: 0.5 },
      uSink: { value: 0 },
      uBark: { value: 1 },
      uBarkScale: { value: 9 },
      uGloss: { value: 40 },
      uSpecular: { value: 0.6 },
      uVeins: { value: 3 },
      uVeinWidth: { value: 0.25 },
      uPulseRate: { value: 1.6 },
      uPulseSign: { value: 1 },
      uPulseSpeed: { value: 6 },
      uPulseWidth: { value: 0.9 },
      uFrontGlow: { value: 5 },
      uRim: { value: 1 },
      uDead: { value: 0 },
      uDarken: { value: 0.85 },
      uClock: { value: 0 },
      uSeed: { value: 0 },
      uColorBark: { value: new Color() },
      uColorBarkLight: { value: new Color() },
      uColorVein: { value: new Color() },
      uColorFront: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorDead: { value: new Color() }
    }),
    vertexShader: ROOT_VERTEX,
    fragmentShader: ROOT_FRAGMENT
  });

  /**
   * @param {object} state { roots (records), count, clock, dead, sink, seed }
   * Each root record: { ox, oz, bearing, length, thickness, grown, p1, p2, forkDist, live }.
   */
  material.userData.sync = (state) => {
    const c = settings.bloodroot;
    const g = settings.global;
    const u = material.uniforms;
    const A = u.uRootA.value;
    const B = u.uRootB.value;
    const C = u.uRootC.value;
    for (let i = 0; i < BLOODROOT_MAX_ROOTS; i++) {
      const r = state.roots[i];
      const live = (i < state.count || (i === BLOODROOT_RUNNER && state.runner)) && r.live ? 1 : 0;
      A[i].set(r.ox, r.oz, r.bearing, Math.max(1e-3, r.length));
      B[i].set(r.thickness, live ? r.grown : 0, r.p1, r.p2);
      C[i].set(r.forkDist, live, r.wanderScale ?? 1, r.pin ?? 0);
    }
    u.uWander.value = c.rootWander * g.randomness;
    u.uWanderFreq.value = c.rootWanderFreq * g.noiseFrequency;
    u.uTaper.value = 1 - c.rootTaper;
    u.uEmbed.value = c.rootEmbed;
    u.uTipLength.value = c.rootTipLength;
    u.uSink.value = state.sink ?? 0;
    u.uClock.value = state.clock ?? 0;
    u.uDead.value = state.dead ?? 0;
    u.uSeed.value = state.seed ?? 0;
    u.uBark.value = c.rootBark * g.shaderIntensity;
    u.uBarkScale.value = c.rootBarkScale * g.noiseFrequency;
    u.uGloss.value = c.rootGloss;
    u.uSpecular.value = c.rootSpecular;
    u.uVeins.value = c.rootVeins * g.glow;
    u.uVeinWidth.value = c.rootVeinWidth;
    u.uPulseRate.value = c.rootPulseRate * g.animationSpeed;
    u.uPulseSign.value = state.pulseSign ?? 1;
    u.uPulseSpeed.value = c.rootPulseSpeed;
    u.uPulseWidth.value = c.rootPulseWidth;
    u.uFrontGlow.value = c.rootFrontGlow * g.glow;
    u.uRim.value = c.rootRim * g.fresnel;
    u.uDarken.value = c.rootDarken;
    u.uColorBark.value.copy(getColor(c.colorRootBark));
    u.uColorBarkLight.value.copy(getColor(c.colorRootBarkLight));
    u.uColorVein.value.copy(getColor(c.colorRootVein));
    u.uColorFront.value.copy(getColor(c.colorRootFront));
    u.uColorRim.value.copy(getColor(c.colorRootRim));
    u.uColorDead.value.copy(getColor(c.colorRootDead));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the thorns                                                           */
/* -------------------------------------------------------------------- */

const THORN_VERTEX = /* glsl */ `
  attribute float aSap;
  attribute float aSeed;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vSap;
  varying float vSeed;

  void main() {
    vLocal = position;
    vSap = aSap;
    vSeed = aSeed;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const THORN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uEnv;
  uniform float uRim;
  uniform float uRimPower;
  uniform float uSap;
  uniform float uVeins;
  uniform float uVeinScale;
  uniform float uBacklight;
  uniform float uDead;
  uniform float uPulse;      // 0..1 heartbeat, from the ability's clock
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  uniform vec3  uColorRim;
  uniform vec3  uColorSap;
  uniform vec3  uColorSpec;
  uniform vec3  uColorDead;
  uniform vec3  uColorBark;
  uniform float uBarkHeight;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vSap;
  varying float vSeed;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float h = clamp(vLocal.y, 0.0, 1.0);

    // The four-stop ramp, from the floor up: dark bark where the vine breaks
    // out of the root, the clot (deep), the glossy body, and the wet tint and
    // white-hot highlights reserved for the rim, the sap and the specular.
    vec3 vp = vec3(vLocal.x * uVeinScale * 0.2, vLocal.y * uVeinScale, vLocal.z * uVeinScale * 0.2) + vSeed * 13.0;
    float vein = pow(clamp(ridged(vp, 4), 0.0, 1.0), 4.0) * uVeins;
    float grain = snoise(vec3(vLocal.x * 6.0, vLocal.y * 40.0, vLocal.z * 6.0) + vSeed) * 0.5 + 0.5;
    vec3 bark = mix(uColorBark, uColorBark * 2.2, grain);
    vec3 body = mix(uColorBody, uColorDeep, clamp(vein + (1.0 - h) * 0.45, 0.0, 1.0));
    float barkMix = 1.0 - smoothstep(uBarkHeight * 0.55, uBarkHeight + 0.08 * grain, h);
    body = mix(body, bark, barkMix);

    float lambert = 0.3 + 0.7 * clamp(dot(N, L), 0.0, 1.0);
    vec3 color = body * lambert;

    // Light through the thin parts, from behind.
    float back = pow(clamp(dot(-V, L), 0.0, 1.0), 4.0) * (0.4 + 0.6 * h) * uBacklight;
    color += uColorSap * back * 0.5;

    float spec = pow(clamp(dot(N, H), 0.0, 1.0), uGloss) * uSpecular;
    float fres = pow(1.0 - ndv, 4.0);
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uEnv * (0.05 + fres);
    float wet = 1.0 - uDead;
    color += (uColorSpec * spec + env) * wet;

    // The bright rim, and sap welling in the barbs and the root flare.
    float rim = pow(1.0 - ndv, uRimPower) * uRim * (1.0 - barkMix * 0.8);
    float sap = vSap * uSap * (0.7 + 0.6 * uPulse) * (1.0 - barkMix * 0.6);
    color += (uColorRim * rim + uColorSap * sap) * uGlobalGlow * wet;

    // Withered: matte, brown-black, the rim gone to a dull ember.
    vec3 dead = uColorDead * lambert + uColorRim * rim * 0.08;
    color = mix(color, dead, uDead);

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Glossy thorn vines. Opaque; used on InstancedMeshes on LAYER.WORLD. */
export function createBloodrootThornMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    // Double-sided: the barbs are open cones welded onto the stem.
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uGloss: { value: 120 },
      uSpecular: { value: 2 },
      uEnv: { value: 0.7 },
      uRim: { value: 3 },
      uRimPower: { value: 2.6 },
      uSap: { value: 2.4 },
      uVeins: { value: 1 },
      uVeinScale: { value: 4 },
      uBacklight: { value: 1.2 },
      uDead: { value: 0 },
      uPulse: { value: 0 },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorSap: { value: new Color() },
      uColorSpec: { value: new Color() },
      uColorDead: { value: new Color() },
      uColorBark: { value: new Color() },
      uBarkHeight: { value: 0.25 }
    }),
    vertexShader: THORN_VERTEX,
    fragmentShader: THORN_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {object} state { dead, pulse } */
  material.userData.sync = (state) => {
    const c = settings.bloodroot;
    const g = settings.global;
    const u = material.uniforms;
    u.uDead.value = state.dead ?? 0;
    u.uPulse.value = state.pulse ?? 0;
    u.uGloss.value = c.thornGloss;
    u.uSpecular.value = c.thornSpecular * g.glow;
    u.uEnv.value = c.thornEnv;
    u.uRim.value = c.thornRim * g.fresnel;
    u.uRimPower.value = c.thornRimPower;
    u.uSap.value = c.thornSap * g.glow;
    u.uVeins.value = c.thornVeins * g.shaderIntensity;
    u.uVeinScale.value = c.thornVeinScale * g.noiseFrequency;
    u.uBacklight.value = c.thornBacklight;
    u.uColorBody.value.copy(getColor(c.colorThornBody));
    u.uColorDeep.value.copy(getColor(c.colorThornDeep));
    u.uColorRim.value.copy(getColor(c.colorThornRim));
    u.uColorSap.value.copy(getColor(c.colorThornSap));
    u.uColorSpec.value.copy(getColor(c.colorThornSpec));
    u.uColorDead.value.copy(getColor(c.colorThornDead));
    u.uColorBark.value.copy(getColor(c.colorRootBark));
    u.uBarkHeight.value = c.thornBarkHeight;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the soaked floor                                                     */
/* -------------------------------------------------------------------- */

const FIELD_VERTEX = /* glsl */ `
  varying vec2 vQ;
  void main() {
    vQ = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FIELD_FRAGMENT = /* glsl */ `
  uniform float uRadius;     // metres the plane spans from the heart
  uniform float uFront;      // metres the root front has run
  uniform float uClock;
  uniform float uSeed;
  uniform float uPulseRate;
  uniform float uPulseSpeed;
  uniform float uPulseWidth;
  uniform float uPulseSign;
  uniform float uVeins;
  uniform float uSheen;
  uniform float uOpacity;
  uniform float uDead;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorVein;
  uniform vec3  uColorSpec;
  uniform vec3  uColorDead;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  varying vec2 vQ;

  ${noiseGLSL}

  void main() {
    float rn = length(vQ);
    if (rn > 1.0) discard;
    float r = rn * uRadius;
    float a = atan(vQ.y, vQ.x);
    // The soak follows the root front, its edge torn by noise.
    float tear = fbm3(vec3(cos(a) * 2.4 + uSeed, sin(a) * 2.4, 1.7)) * 0.5 + 0.5;
    float edge = min(uFront, uRadius * 0.92) * (0.82 + 0.18 * tear);
    float mask = 1.0 - smoothstep(edge * 0.86, edge, r);
    mask *= 1.0 - smoothstep(0.9, 1.0, rn);
    if (mask < 0.003) discard;

    // Blood-soaked soil: clotted black-red, blotched with the body tone.
    vec2 p = vQ * uRadius;
    float blot = fbm3(vec3(p * 0.9, uSeed)) * 0.5 + 0.5;
    float grit = snoise(vec3(p * 7.0, uSeed + 4.0)) * 0.5 + 0.5;
    vec3 col = mix(uColorDeep, uColorBody, smoothstep(0.45, 0.85, blot) * 0.7) * (0.7 + 0.4 * grit);
    col *= 1.0 - 0.45 * smoothstep(0.4, 0.0, rn);  // darkest where the heart drinks

    // Capillaries through the soak, carrying the same heartbeat as the roots.
    float cap = pow(ridged(vec3(p * 0.55, uSeed * 0.3), 4), 7.0) * uVeins;
    float wave = uClock * uPulseSpeed - r * uPulseSign;
    float period = uPulseSpeed / max(uPulseRate, 1e-3);
    float phase = mod(wave, max(period, 1e-3));
    float beat = exp(-phase / max(uPulseWidth, 1e-3));
    float alive = 1.0 - uDead;
    col += uColorVein * cap * (0.25 + 1.4 * beat) * uGlobalGlow * alive;

    // Wet: a glancing sheen on the pool.
    vec3 n = normalize(vec3((blot - 0.5) * 0.5, 1.0, (grit - 0.5) * 0.3));
    float spec = pow(clamp(dot(n, normalize(uLightDir + vec3(0.0, 1.2, 0.0))), 0.0, 1.0), 30.0);
    col += uColorSpec * spec * uSheen * 0.35 * alive;

    // Drying out: brown-black and matte.
    col = mix(col, uColorDead * (0.6 + 0.4 * grit), uDead * 0.85);
    float alpha = mask * uOpacity * (0.6 + 0.35 * smoothstep(0.3, 0.7, blot));
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * The floor the thicket drinks from: a disc that soaks dark red behind the
 * racing root fronts (torn edge, clotted blotches, a wet sheen), with
 * capillaries carrying the roots' heartbeat — outward while it grows, inward
 * once the drain takes hold — drying to brown-black as the thicket withers.
 * Normal-blended, transparent, `LAYER.VFX`; it is the deep stop that grounds
 * the cast and stays for the whole linger.
 */
export function createBloodrootFieldMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRadius: { value: 6 },
      uFront: { value: 0 },
      uClock: { value: 0 },
      uSeed: { value: 0 },
      uPulseRate: { value: 1.6 },
      uPulseSpeed: { value: 6 },
      uPulseWidth: { value: 0.9 },
      uPulseSign: { value: 1 },
      uVeins: { value: 1 },
      uSheen: { value: 1 },
      uOpacity: { value: 1 },
      uDead: { value: 0 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorVein: { value: new Color() },
      uColorSpec: { value: new Color() },
      uColorDead: { value: new Color() }
    }),
    vertexShader: FIELD_VERTEX,
    fragmentShader: FIELD_FRAGMENT
  });

  /** @param {object} state { radius, front, clock, seed, dead, pulseSign } */
  material.userData.sync = (state) => {
    const c = settings.bloodroot;
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = state.radius;
    u.uFront.value = state.front;
    u.uClock.value = state.clock;
    u.uSeed.value = state.seed;
    u.uDead.value = state.dead;
    u.uPulseSign.value = state.pulseSign;
    u.uPulseRate.value = c.rootPulseRate * g.animationSpeed;
    u.uPulseSpeed.value = c.rootPulseSpeed;
    u.uPulseWidth.value = c.rootPulseWidth;
    u.uVeins.value = c.fieldVeins * g.glow;
    u.uSheen.value = c.fieldSheen;
    u.uOpacity.value = c.fieldOpacity * g.opacity * (1 - state.dead * 0.35);
    u.uColorDeep.value.copy(getColor(c.colorFieldDeep));
    u.uColorBody.value.copy(getColor(c.colorThornBody));
    u.uColorVein.value.copy(getColor(c.colorRootVein));
    u.uColorSpec.value.copy(getColor(c.colorThornSpec));
    u.uColorDead.value.copy(getColor(c.colorRootDead));
  };
  return material;
}
