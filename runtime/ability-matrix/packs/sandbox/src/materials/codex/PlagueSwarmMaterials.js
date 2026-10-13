import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NormalBlending,
  RGBADepthPacking,
  ShaderMaterial,
  Vector3,
  Vector4
} from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { patchOnBeforeCompile } from '../../utils/shaderPatch.js';

/**
 * Plague Swarm — the five bespoke surfaces.
 *
 *  - **the hive** (`createHiveMaterial`) — a patched MeshStandardMaterial over
 *    `createHiveGeometry`. Its vertex stage breathes the pod, raises it out of
 *    the floor, swings each shell plate open about its hinge and sinks it as it
 *    dies; the depth pass shares the function, so the shadow opens too. The
 *    fragment stage paints chitin: near-black with a thin-film iridescence that
 *    slides through the spectrum with the view angle, toxic veins pulsing up
 *    it, seams that glow white-hot before they split, a wet glowing interior
 *    on the back faces, and a noise dissolve with a burning edge.
 *  - **the brood sac** (`createSacMaterial`) — the glowing heart inside the
 *    hive, seen when it cracks: fresnel, throbbing veins.
 *  - **the swarm** (`createSwarmMaterial`) — every insect, instanced, placed
 *    entirely on the GPU. Each one's path is a function of a few integrated
 *    phases and its own dice: it waits in the hive, bursts out of the mouth on
 *    a bezier, joins a vortex round the circle, is steered by a cheap analytic
 *    curl field, and — when its slot has a body — peels off into a fast orbit
 *    round that body; then it streams back into the mouth. The heading is the
 *    path's own finite difference, so every insect points where it flies; the
 *    wings flap about the body axis; the body streaks with speed; a halo
 *    billboard gives it a glow that reads at fifteen metres.
 *  - **the toxic pool** (`createToxicPoolMaterial`) — the ground treatment: a
 *    marking ring during the cast, then a pool of glowing toxin spreading over
 *    the circle and welling up under every body the swarm eats — wet, dark,
 *    domain-warped liquid, caustic veins, bubbles that swell and pop, a bright
 *    meniscus — eroding away at the end.
 *  - **the miasma** (`createMiasmaWarpMaterial`) — a camera-facing billboard on
 *    `LAYER.DISTORTION`: the air over the pool shimmering.
 *
 * Every material reads `settings.plague` in `userData.sync(...)`.
 */

/** Bodies the swarm can engulf at once; the ability's slot count. */
export const SWARM_SLOTS = 8;

/* ==================================================================== */
/* The hive                                                              */
/* ==================================================================== */

const HIVE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uHiveH;
  uniform float uHiveR;
  uniform float uRise;        // 0 buried .. 1 up (past 1 = the punch)
  uniform float uRiseFrom;    // metres below the floor it starts
  uniform float uOpen;        // 0 shut .. 1 open (past 1 = overshoot)
  uniform float uOpenAngle;
  uniform float uOpenJitter;
  uniform float uHinge;       // unit height of the hinge
  uniform float uHingeR;      // unit radius of the pod at the hinge
  uniform float uPulse;
  uniform float uPulseSpeed;
  uniform float uSink;        // metres it has sunk while dissolving

  attribute float aPlate;
  attribute vec2  aPV;

  vec3 hPos;
  vec3 hNormal;

  vec3 rotAxis(vec3 v, vec3 k, float a) {
    float c = cos(a), s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }

  void hiveVertex() {
    vec3 p = position;
    vec3 n = normal;
    // Breathing: a slow swell that travels up the pod.
    float swell = 1.0 + uPulse * sin(uTime * uPulseSpeed - aPV.y * 4.0);
    p.xz *= swell;

    // Each plate swings out about a hinge round its own foot.
    float w = smoothstep(uHinge - 0.04, uHinge + 0.08, aPV.y);
    float jit = 1.0 + uOpenJitter * (fract(sin(aPlate * 91.7) * 437.5) * 2.0 - 1.0);
    float a = -uOpen * uOpenAngle * jit * w;
    vec3 axis = vec3(-sin(aPlate), 0.0, cos(aPlate));
    vec3 pivot = vec3(cos(aPlate) * uHingeR, uHinge, sin(aPlate) * uHingeR);
    p = pivot + rotAxis(p - pivot, axis, a);
    n = rotAxis(n, axis, a);

    // Unit → metres. Non-uniform, so the normal takes the inverse scale.
    p.xz *= uHiveR;
    p.y *= uHiveH * (1.0 + max(uRise - 1.0, 0.0));
    n = normalize(vec3(n.x / max(uHiveR, 1e-3), n.y / max(uHiveH, 1e-3), n.z / max(uHiveR, 1e-3)));

    p.y -= uRiseFrom * (1.0 - clamp(uRise, 0.0, 1.0)) + uSink;
    hPos = p;
    hNormal = n;
  }
`;

const HIVE_VARYINGS = /* glsl */ `
  varying vec3 vHUnit;
  varying vec2 vHPV;
  varying float vHPlate;
`;

/** The dissolve, shared by the colour pass and the shadow pass. */
const HIVE_DISSOLVE = /* glsl */ `
  float hiveDissolve(vec3 unit, float amount, out float edge) {
    float n = fbm3(unit * vec3(5.0, 3.0, 5.0) + 3.7) * 0.5 + 0.5;
    // Eats from the crown down, roughened by the noise.
    n = mix(n, 1.0 - unit.y, 0.35);
    float thr = amount * 1.25 - 0.15;
    edge = amount <= 0.0 ? 0.0 : 1.0 - smoothstep(thr, thr + 0.07, n);
    return amount <= 0.0 ? 1.0 : step(thr, n);
  }
`;

export function createHiveMaterial(environment, hingeRadius) {
  const material = new MeshStandardMaterial({
    name: 'PlagueHive',
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0.2,
    side: DoubleSide
  });

  const uniforms = {
    uTime: frame.uTime,
    uHiveH: { value: 1.9 },
    uHiveR: { value: 1 },
    uRise: { value: 0 },
    uRiseFrom: { value: 1.6 },
    uOpen: { value: 0 },
    uOpenAngle: { value: 1.1 },
    uOpenJitter: { value: 0.3 },
    uHinge: { value: 0.22 },
    uHingeR: { value: hingeRadius(0.22) },
    uPulse: { value: 0.04 },
    uPulseSpeed: { value: 3.2 },
    uSink: { value: 0 },
    uCrack: { value: 0 },
    uDissolve: { value: 0 },
    uIrid: { value: 0.9 },
    uIridScale: { value: 2.2 },
    uIridHue: { value: 0.25 },
    uVeinGlow: { value: 2.4 },
    uVeinScale: { value: 4.5 },
    uVeinWidth: { value: 0.06 },
    uVeinSpeed: { value: 1.6 },
    uSeamGlow: { value: 4 },
    uGooGlow: { value: 2.2 },
    uDissolveGlow: { value: 4 },
    uGlow: { value: 1 },
    uColorChitinA: { value: new Color() },
    uColorChitinB: { value: new Color() },
    uColorVein: { value: new Color() },
    uColorSeam: { value: new Color() },
    uColorGoo: { value: new Color() },
    uColorDissolve: { value: new Color() }
  };
  material.userData.hingeRadius = hingeRadius;

  environment.registerShadowCasterWithPatch(
    material,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${HIVE_VERTEX}\n${HIVE_VARYINGS}`)
        .replace(
          '#include <beginnormal_vertex>',
          `hiveVertex();
           vec3 objectNormal = hNormal;
           vHUnit = position;
           vHPV = aPV;
           vHPlate = aPlate;
           #ifdef USE_TANGENT
             vec3 objectTangent = vec3(tangent.xyz);
           #endif`
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = hPos;');

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uCrack;
           uniform float uDissolve;
           uniform float uIrid;
           uniform float uIridScale;
           uniform float uIridHue;
           uniform float uVeinGlow;
           uniform float uVeinScale;
           uniform float uVeinWidth;
           uniform float uVeinSpeed;
           uniform float uSeamGlow;
           uniform float uGooGlow;
           uniform float uDissolveGlow;
           uniform float uGlow;
           uniform vec3  uColorChitinA;
           uniform vec3  uColorChitinB;
           uniform vec3  uColorVein;
           uniform vec3  uColorSeam;
           uniform vec3  uColorGoo;
           uniform vec3  uColorDissolve;
           ${HIVE_VARYINGS}
           ${noiseGLSL}
           ${HIVE_DISSOLVE}`
        )
        .replace(
          'void main() {',
          `void main() {
             float hEdge;
             if (hiveDissolve(vHUnit, uDissolve, hEdge) < 0.5) discard;`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           {
             vec3 Nv = normalize(normal);
             float ndv = clamp(abs(dot(Nv, normalize(vViewPosition))), 0.0, 1.0);
             float fres = 1.0 - ndv;
             float mottle = snoise(vHUnit * 7.0) * 0.5 + 0.5;
             // Toxic veins: ridges of a noise field, a pulse running up them.
             float ridge = abs(snoise(vec3(vHUnit.xz * uVeinScale, vHUnit.y * uVeinScale * 0.6)));
             float vein = 1.0 - smoothstep(0.0, uVeinWidth, ridge);
             float pulse = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(vHPV.y * 14.0 - uTime * uVeinSpeed * 6.0 + vHPlate * 2.0), 3.0);
             // The seams glow hot as they are about to split.
             float edgeD = min(vHPV.x, 1.0 - vHPV.x);
             float seam = 1.0 - smoothstep(0.0, 0.07, edgeD);
             vec3 glow = vec3(0.0);

             if (gl_FrontFacing) {
               diffuseColor.rgb *= mix(uColorChitinA, uColorChitinB, mottle);
               // Thin-film sheen: hue slides with the view angle.
               float hue = fres * uIridScale + snoise(vHUnit * 3.0) * 0.25 + uIridHue;
               vec3 film = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
               glow += film * pow(fres, 2.0) * uIrid;
               glow += uColorVein * vein * pulse * uVeinGlow;
               glow += uColorSeam * seam * uSeamGlow * uCrack;
             } else {
               // Inside: wet, glowing brood-flesh.
               diffuseColor.rgb *= uColorChitinA * 0.5;
               glow += uColorGoo * uGooGlow * (0.45 + 0.55 * vein + 0.3 * mottle) * pulse;
             }
             glow += uColorDissolve * hEdge * uDissolveGlow;
             glow *= uGlow;
             totalEmissiveRadiance += glow;
           }`
        );
    },
    'plague-hive'
  );

  /* ---- the shadow: the same pod, open and dissolving the same way ---- */
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide });
  patchOnBeforeCompile(
    depth,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${HIVE_VERTEX}\nvarying vec3 vHUnit;`)
        .replace('#include <begin_vertex>', 'hiveVertex();\nvHUnit = position;\nvec3 transformed = hPos;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uDissolve;\nvarying vec3 vHUnit;\n${noiseGLSL}\n${HIVE_DISSOLVE}`)
        .replace('void main() {', `void main() {\n  float hEdge;\n  if (hiveDissolve(vHUnit, uDissolve, hEdge) < 0.5) discard;`);
    },
    'plague-hive-depth'
  );

  material.userData.uniforms = uniforms;
  material.userData.depth = depth;

  /** @param {object} state { rise, open, crack, sink, dissolve } */
  material.userData.sync = (state) => {
    const c = settings.plague;
    const g = settings.global;
    const u = uniforms;
    u.uHiveH.value = Math.max(0.1, c.hiveHeight);
    u.uHiveR.value = Math.max(0.1, c.hiveRadius);
    u.uRise.value = state.rise;
    u.uRiseFrom.value = c.hiveRiseFrom;
    u.uOpen.value = state.open;
    u.uOpenAngle.value = c.openAngle;
    u.uOpenJitter.value = c.openJitter * g.randomness;
    u.uHinge.value = c.hiveHinge;
    u.uHingeR.value = hingeRadius(c.hiveHinge);
    u.uPulse.value = c.hivePulse * g.noiseStrength;
    u.uPulseSpeed.value = c.pulseSpeed * g.animationSpeed;
    u.uSink.value = state.sink;
    u.uCrack.value = state.crack;
    u.uDissolve.value = state.dissolve;
    u.uIrid.value = c.iridescence * g.fresnel;
    u.uIridScale.value = c.iridScale;
    u.uIridHue.value = c.iridHue;
    u.uVeinGlow.value = c.veinGlow * g.shaderIntensity;
    u.uVeinScale.value = c.veinScale * g.noiseFrequency;
    u.uVeinWidth.value = c.veinWidth;
    u.uVeinSpeed.value = c.veinSpeed * g.noiseSpeed;
    u.uSeamGlow.value = c.seamGlow;
    u.uGooGlow.value = c.gooGlow;
    u.uDissolveGlow.value = c.dissolveGlow;
    u.uGlow.value = g.glow;
    u.uColorChitinA.value.copy(getColor(c.colorChitinA));
    u.uColorChitinB.value.copy(getColor(c.colorChitinB));
    u.uColorVein.value.copy(getColor(c.colorVein));
    u.uColorSeam.value.copy(getColor(c.colorSeam));
    u.uColorGoo.value.copy(getColor(c.colorGoo));
    u.uColorDissolve.value.copy(getColor(c.colorDissolve));
    material.roughness = c.hiveRoughness;
  };

  return material;
}

/* ==================================================================== */
/* The brood sac                                                         */
/* ==================================================================== */

const SAC_VERTEX = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vLocal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = cameraPosition - world.xyz;
    vLocal = position;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SAC_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uGlow;
  uniform float uPulse;
  uniform float uFade;
  uniform vec3  uColor;
  uniform vec3  uColorCore;
  uniform float uGlobalGlow;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vLocal;
  ${noiseGLSL}
  void main() {
    float ndv = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
    float beat = 1.0 + uPulse * pow(max(0.0, sin(uTime * 5.5)), 6.0);
    float vein = 1.0 - smoothstep(0.0, 0.1, abs(snoise(vLocal * 4.0 + vec3(0.0, uTime * 0.6, 0.0))));
    vec3 col = uColor * (0.25 + 0.75 * pow(1.0 - ndv, 1.5)) + uColorCore * ndv * ndv * 0.6 + uColor * vein * 0.8;
    gl_FragColor = vec4(col * uGlow * beat * uFade * uGlobalGlow, 1.0);
  }
`;

export function createSacMaterial() {
  const material = new ShaderMaterial({
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uGlow: { value: 3 },
      uPulse: { value: 0.4 },
      uFade: { value: 1 },
      uColor: { value: new Color() },
      uColorCore: { value: new Color() }
    }),
    vertexShader: SAC_VERTEX,
    fragmentShader: SAC_FRAGMENT
  });
  material.userData.sync = (fade) => {
    const c = settings.plague;
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.sacGlow * g.glow;
    u.uPulse.value = c.sacPulse;
    u.uFade.value = fade;
    u.uColor.value.copy(getColor(c.colorSac));
    u.uColorCore.value.copy(getColor(c.colorInsectCore));
  };
  return material;
}

/* ==================================================================== */
/* The swarm                                                             */
/* ==================================================================== */

const SWARM_VERTEX = /* glsl */ `
  uniform vec3  uHive;          // hive foot, on the floor
  uniform float uMouthY;        // metres up the hive the mouth is
  uniform vec3  uCenter;        // the circle's centre, on the floor
  uniform float uZoneR;
  uniform float uSwirlPhase;
  uniform float uSwirlRate;
  uniform float uCloudPhase;
  uniform float uCloudRate;
  uniform float uFlapPhase;
  uniform float uFlowPhase;
  uniform float uPour;          // seconds since the hive cracked (< 0 before)
  uniform float uPourTime;
  uniform float uEmergeTime;
  uniform float uLockT;         // seconds since the swarm turned on the bodies (< 0 before)
  uniform float uLockTime;
  uniform float uLockStagger;
  uniform float uRet;           // seconds since the swarm turned for home (< 0 before)
  uniform float uReturnTime;
  uniform float uReturnStagger;
  uniform vec4  uTargets[${SWARM_SLOTS}];  // xyz: the body; w: 0..1 whether this slot has one
  uniform float uRMin;
  uniform float uRMax;
  uniform float uHMin;
  uniform float uHMax;
  uniform float uBob;
  uniform float uBurstH;
  uniform float uFlowAmp;
  uniform float uFlowScale;
  uniform float uCloudR;
  uniform float uCloudTall;
  uniform float uSize;
  uniform float uHalo;
  uniform float uFlapAngle;
  uniform float uStretch;
  uniform float uSameWay;       // fraction of the swarm that circles the same way

  attribute float aPart;
  attribute vec4  aRand;
  attribute vec4  aRand2;

  varying vec2  vUv;
  varying float vPart;
  varying float vFade;
  varying float vLock;
  varying float vSpeed;

  vec3 bez(vec3 a, vec3 b, vec3 c, float t) {
    float s = 1.0 - t;
    return s * s * a + 2.0 * s * t * b + t * t * c;
  }

  /**
   * Analytic curl noise: the curl of a two-octave trigonometric vector
   * potential. Divergence-free — the swarm folds and eddies without bunching
   * up or thinning out — and a handful of sin/cos per vertex rather than the
   * twelve simplex samples a numerical curl would cost.
   */
  vec3 curlFlow(vec3 p, float t) {
    vec3 q = p * uFlowScale;
    vec3 c1 = vec3(-cos(q.z * 1.3 + t), -cos(q.x * 1.1 - t * 0.7), -cos(q.y * 1.7 + t * 1.3)) * vec3(1.3, 1.1, 1.7);
    vec3 r = vec3(q.y * 0.8 + q.z * 0.6, q.z * 0.8 - q.x * 0.6, q.x * 0.8 + q.y * 0.6) * 2.3;
    vec3 c2 = vec3(-cos(r.z + t * 1.9), -cos(r.x - t * 1.4), -cos(r.y + t * 2.1)) * 0.5;
    return (c1 + c2) * 0.45;
  }

  /** Where this insect is \`back\` seconds ago. */
  vec3 swarmAt(float back, out float vis, out float lockAmt) {
    float pour = uPour - back;
    float lockT = uLockT - back;
    float ret = uRet - back;
    float swirl = uSwirlPhase - uSwirlRate * back;
    float cloud = uCloudPhase - uCloudRate * back;
    vec3 mouth = uHive + vec3(0.0, uMouthY, 0.0);
    float way = aRand.w < uSameWay ? 1.0 : -1.0;

    /* the vortex round the circle */
    float ang = aRand.y * 6.2831 + swirl * (0.6 + 0.8 * aRand.z) * way;
    float rad = uZoneR * mix(uRMin, uRMax, sqrt(fract(aRand.w * 7.31)));
    float hgt = mix(uHMin, uHMax, aRand2.x) + sin(swirl * 1.7 + aRand.x * 20.0) * uBob;
    vec3 sw = uCenter + vec3(cos(ang) * rad, hgt, sin(ang) * rad);

    /* out of the mouth: a burst upward, then out to its place in the vortex */
    float delay = aRand.x * uPourTime;
    float e = clamp((pour - delay) / max(uEmergeTime, 0.01), 0.0, 1.0);
    vec3 burst = mouth + vec3((aRand2.y - 0.5) * 1.6, uBurstH * (0.6 + 0.6 * aRand2.z), (aRand2.w - 0.5) * 1.6);
    vec3 p = bez(mouth, burst, sw, smoothstep(0.0, 1.0, e));
    vis = pour > delay ? smoothstep(0.0, 0.06, e) : 0.0;

    /* onto a body: a fast orbit round it, a tall ellipsoid */
    int slot = int(floor(aRand2.y * ${SWARM_SLOTS}.0));
    vec4 tg = uTargets[slot];
    float lk = clamp((lockT - aRand2.z * uLockStagger) / max(uLockTime, 0.01), 0.0, 1.0) * tg.w * step(1.0, e);
    lk = smoothstep(0.0, 1.0, lk);
    float th = aRand.y * 6.2831 + cloud * (0.7 + 0.6 * aRand.z) * way;
    float ct = aRand.z * 2.0 - 1.0;
    float st = sqrt(max(0.0, 1.0 - ct * ct));
    vec3 sph = vec3(st * cos(th), ct, st * sin(th));
    vec3 cl = tg.xyz + sph * uCloudR * (0.4 + 0.6 * aRand.w) * vec3(1.0, uCloudTall, 1.0);
    p = mix(p, cl, lk);
    p.y += sin(lk * 3.14159) * 0.6; // they arc up and dive on it

    /* home: stream back into the mouth */
    float rt = clamp((ret - aRand2.w * uReturnStagger) / max(uReturnTime, 0.01), 0.0, 1.0);
    float re = smoothstep(0.0, 1.0, rt);
    p = bez(p, mouth + vec3(0.0, uBurstH * 0.7, 0.0), mouth, re);
    vis *= 1.0 - smoothstep(0.82, 1.0, rt);

    lockAmt = lk * (1.0 - re);
    return p;
  }

  void main() {
    float vis, lockAmt, vis2, lock2;
    vec3 p = swarmAt(0.0, vis, lockAmt);
    vec3 q = swarmAt(0.035, vis2, lock2);
    vec3 fwd = p - q;
    float sp = length(fwd);
    fwd = sp > 1e-5 ? fwd / sp : vec3(0.0, 0.0, 1.0);
    vSpeed = sp / 0.035;

    // The flow steers it; strongest in the vortex, calmer in the clouds.
    p += curlFlow(p + aRand.xyz * 3.0, uFlowPhase + aRand.x * 6.0) * uFlowAmp * vis * (1.0 - 0.5 * lockAmt);

    vec3 right = cross(fwd, vec3(0.0, 1.0, 0.0));
    right = length(right) > 1e-4 ? normalize(right) : vec3(1.0, 0.0, 0.0);
    vec3 up = cross(right, fwd);
    float s = uSize * (0.7 + 0.6 * aRand.z) * vis;

    vUv = uv;
    vPart = aPart;
    vFade = vis;
    vLock = lockAmt;

    if (vis < 0.001) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // still in the hive
      return;
    }

    if (aPart > 2.5) {
      vec4 mv = viewMatrix * vec4(p, 1.0);
      mv.xy += position.xy * s * uHalo;
      gl_Position = projectionMatrix * mv;
      return;
    }

    vec3 local = position;
    if (aPart > 0.5) {
      // Flap about the body axis; the two wings mirror.
      float side = aPart < 1.5 ? 1.0 : -1.0;
      float flap = sin(uFlapPhase * (0.85 + 0.3 * aRand.w) + aRand.y * 40.0) * uFlapAngle * side;
      float c = cos(flap), sn = sin(flap);
      local = vec3(local.x * c - local.y * sn, local.x * sn + local.y * c, local.z);
    } else {
      // Fast insects smear along their flight.
      local.z *= 1.0 + min(vSpeed * uStretch, 3.0);
    }
    vec3 world = p + (right * local.x + up * local.y + fwd * local.z) * s;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SWARM_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uBodyGlow;
  uniform float uWingGlow;
  uniform float uHaloGlow;
  uniform float uFrenzy;
  uniform float uOpacity;
  uniform vec3  uColorCore;
  uniform vec3  uColorBody;
  uniform vec3  uColorWing;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;

  varying vec2  vUv;
  varying float vPart;
  varying float vFade;
  varying float vLock;
  varying float vSpeed;

  void main() {
    vec3 col;
    float a;
    if (vPart < 0.5) {
      col = mix(uColorBody, uColorCore, vUv.y) * uBodyGlow;
      a = 1.0;
    } else if (vPart < 2.5) {
      // A translucent blade, brightest at the leading edge, gone at the tip.
      a = (1.0 - smoothstep(0.55, 1.0, vUv.y)) * (0.35 + 0.65 * (1.0 - vUv.x)) * 0.7;
      col = uColorWing * uWingGlow;
    } else {
      float r = length(vUv * 2.0 - 1.0);
      a = exp(-r * r * 4.0) * (1.0 - smoothstep(0.8, 1.0, r));
      col = uColorHalo * uHaloGlow;
    }
    // Feeding, they burn brighter.
    col *= 1.0 + vLock * uFrenzy;
    a *= vFade * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * a * uGlobalGlow, a);
  }
`;

export function createSwarmMaterial() {
  const targets = [];
  for (let i = 0; i < SWARM_SLOTS; i++) targets.push(new Vector4());
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHive: { value: new Vector3() },
      uMouthY: { value: 1.6 },
      uCenter: { value: new Vector3() },
      uZoneR: { value: 4 },
      uSwirlPhase: { value: 0 },
      uSwirlRate: { value: 1 },
      uCloudPhase: { value: 0 },
      uCloudRate: { value: 1 },
      uFlapPhase: { value: 0 },
      uFlowPhase: { value: 0 },
      uPour: { value: -1 },
      uPourTime: { value: 1 },
      uEmergeTime: { value: 0.6 },
      uLockT: { value: -1 },
      uLockTime: { value: 0.7 },
      uLockStagger: { value: 0.6 },
      uRet: { value: -1 },
      uReturnTime: { value: 0.8 },
      uReturnStagger: { value: 0.7 },
      uTargets: { value: targets },
      uRMin: { value: 0.25 },
      uRMax: { value: 1 },
      uHMin: { value: 0.4 },
      uHMax: { value: 2.8 },
      uBob: { value: 0.35 },
      uBurstH: { value: 2.6 },
      uFlowAmp: { value: 0.5 },
      uFlowScale: { value: 0.6 },
      uCloudR: { value: 0.85 },
      uCloudTall: { value: 1.4 },
      uSize: { value: 0.13 },
      uHalo: { value: 3 },
      uFlapAngle: { value: 0.9 },
      uStretch: { value: 0.08 },
      uSameWay: { value: 0.85 },
      uBodyGlow: { value: 3 },
      uWingGlow: { value: 1.2 },
      uHaloGlow: { value: 0.5 },
      uFrenzy: { value: 0.6 },
      uOpacity: { value: 1 },
      uColorCore: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorWing: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: SWARM_VERTEX,
    fragmentShader: SWARM_FRAGMENT
  });

  /**
   * @param {object} state { hive, mouthY, center, zoneR, swirl, swirlRate,
   *   cloud, cloudRate, flap, flow, pour, lockT, ret } — targets are written
   *   straight into `uniforms.uTargets` by the ability.
   */
  material.userData.sync = (state) => {
    const c = settings.plague;
    const g = settings.global;
    const u = material.uniforms;
    u.uHive.value.copy(state.hive);
    u.uMouthY.value = state.mouthY;
    u.uCenter.value.copy(state.center);
    u.uZoneR.value = state.zoneR;
    u.uSwirlPhase.value = state.swirl;
    u.uSwirlRate.value = state.swirlRate;
    u.uCloudPhase.value = state.cloud;
    u.uCloudRate.value = state.cloudRate;
    u.uFlapPhase.value = state.flap;
    u.uFlowPhase.value = state.flow;
    u.uPour.value = state.pour;
    u.uPourTime.value = Math.max(0.01, c.pourTime);
    u.uEmergeTime.value = c.emergeTime;
    u.uLockT.value = state.lockT;
    u.uLockTime.value = c.lockTime;
    u.uLockStagger.value = c.lockStagger;
    u.uRet.value = state.ret;
    u.uReturnTime.value = c.returnTime;
    u.uReturnStagger.value = c.returnStagger;
    u.uRMin.value = c.swirlRadiusMin;
    u.uRMax.value = c.swirlRadiusMax;
    u.uHMin.value = c.swirlHeightMin;
    u.uHMax.value = c.swirlHeightMax;
    u.uBob.value = c.swirlBob;
    u.uBurstH.value = c.burstHeight;
    u.uFlowAmp.value = c.flowAmp * g.noiseStrength * g.turbulence;
    u.uFlowScale.value = c.flowScale * g.noiseFrequency;
    u.uCloudR.value = c.cloudRadius;
    u.uCloudTall.value = c.cloudTall;
    u.uSize.value = c.insectSize * g.particleSize;
    u.uHalo.value = c.haloSize;
    u.uFlapAngle.value = c.flapAngle;
    u.uStretch.value = c.insectStretch;
    u.uSameWay.value = c.swirlSameWay;
    u.uBodyGlow.value = c.insectGlow;
    u.uWingGlow.value = c.wingGlow;
    u.uHaloGlow.value = c.haloGlow;
    u.uFrenzy.value = c.feedFrenzy;
    u.uOpacity.value = g.opacity;
    u.uColorCore.value.copy(getColor(c.colorInsectCore));
    u.uColorBody.value.copy(getColor(c.colorInsectBody));
    u.uColorWing.value.copy(getColor(c.colorWing));
    u.uColorHalo.value.copy(getColor(c.colorHalo));
  };
  return material;
}

/* ==================================================================== */
/* The toxic pool                                                        */
/* ==================================================================== */

const POOL_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying float vViewZ;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3  uCenter;
  uniform float uSeed;
  uniform float uZoneR;
  uniform float uRadius;      // how far the main pool has spread, metres
  uniform float uMark;        // 0..1 the marking ring during the cast
  uniform float uMarkWidth;
  uniform float uMarkGlow;
  uniform vec4  uPools[${SWARM_SLOTS}];  // xy: body (floor, rel. centre), z: radius, w: unused
  uniform float uEdgeNoise;
  uniform float uFlowScale;
  uniform float uFlowSpeed;
  uniform float uBubbleScale;
  uniform float uBubbleRate;
  uniform float uBubbleSize;
  uniform float uBubbleShare;
  uniform float uPoolGlow;
  uniform float uCaustic;
  uniform float uEdgeGlow;
  uniform float uOpacity;
  uniform float uFade;        // 0..1 eroding away
  uniform float uErode;
  uniform vec3  uColorDeep;
  uniform vec3  uColorToxic;
  uniform vec3  uColorFoam;
  uniform vec3  uColorEdge;
  uniform float uGlobalGlow;

  varying vec3 vWorld;
  varying float vViewZ;

  ${noiseGLSL}

  float smax(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
    return mix(b, a, h) + k * h * (1.0 - h);
  }

  void main() {
    vec2 q = vWorld.xz - uCenter.xz;
    float r = length(q);
    float t = uTime * uFlowSpeed;

    /* the shape: the main pool, unioned smoothly with a pool under every body */
    float edgeN = fbm3(vec3(q * 0.7, uSeed)) * uEdgeNoise;
    float field = uRadius * (1.0 + edgeN) - r;
    for (int i = 0; i < ${SWARM_SLOTS}; i++) {
      vec4 pl = uPools[i];
      if (pl.z <= 0.01) continue;
      float d = length(q - pl.xy);
      field = smax(field, pl.z * (1.0 + edgeN * 0.8) - d, 0.5);
    }
    float inside = smoothstep(0.0, 0.18, field);
    float meniscus = exp(-pow(field / 0.09, 2.0)) * step(0.0, field + 0.15);

    /* the liquid: domain-warped, slowly churning */
    vec2 w = q * uFlowScale;
    w += vec2(fbm3(vec3(w * 0.6, t * 0.25 + uSeed)), fbm3(vec3(w * 0.6 + 5.2, t * 0.25 - uSeed))) * 1.4;
    float liquid = fbm3(vec3(w, t * 0.35)) * 0.5 + 0.5;
    float caustic = pow(1.0 - abs(snoise(vec3(w * 1.8, t * 0.6))), 7.0);

    /* bubbles: some cells swell, flash and pop, each on its own clock */
    vec2 cell = voronoi2(q * uBubbleScale + uSeed);
    float phase = fract(cell.y * 7.31 + t * uBubbleRate * (0.6 + 0.8 * fract(cell.y * 3.7)));
    float bubbles = step(1.0 - uBubbleShare, fract(cell.y * 13.17));
    float R = uBubbleSize * 0.5 * smoothstep(0.0, 0.85, phase);
    float film = smoothstep(R - 0.05, R, cell.x) * (1.0 - smoothstep(R, R + 0.03, cell.x));
    float dome = (1.0 - smoothstep(0.0, R, cell.x)) * 0.4;
    float pop = smoothstep(0.85, 0.9, phase) * (1.0 - smoothstep(0.9, 1.0, phase));
    float bubble = bubbles * (film + dome) * (1.0 - pop) * inside;
    float popRing = bubbles * pop * (1.0 - smoothstep(0.0, 0.05, abs(cell.x - R * 1.4))) * inside;

    vec3 col = mix(uColorDeep, uColorToxic * 0.55, liquid * 0.8);
    // The liquid's own glow stays inside the pool: unmasked, it lit the whole quad.
    vec3 glow = (uColorToxic * liquid * liquid * uPoolGlow * 0.4
              + uColorEdge * caustic * uCaustic) * inside
              + uColorFoam * (bubble + popRing * 2.0) * uPoolGlow
              + uColorEdge * meniscus * uEdgeGlow;
    float alpha = inside * uOpacity + meniscus * 0.6 + bubble * 0.4;

    /* the marking ring, drawn while the cast is still on its way */
    float mark = exp(-pow((r - uZoneR) / max(uMarkWidth, 0.005), 2.0)) * uMark;
    float tick = 0.6 + 0.4 * sin(atan(q.y, q.x) * 18.0 - uTime * 3.0);
    glow += uColorEdge * mark * tick * uMarkGlow;
    alpha = max(alpha, mark * 0.8);

    /* eroding away at the end */
    float n = snoise(vec3(q * 1.3, uSeed + 9.0)) * 0.5 + 0.5;
    float thr = uFade * 1.2 - 0.12;
    float vis = uFade <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.5, n, uErode));
    alpha *= vis;
    glow *= vis;
    if (alpha < 0.004 && dot(glow, glow) < 1e-5) discard;
    gl_FragColor = vec4(col * clamp(alpha, 0.0, 1.0) + glow * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

export function createToxicPoolMaterial() {
  const pools = [];
  for (let i = 0; i < SWARM_SLOTS; i++) pools.push(new Vector4());
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // Premultiplied: the dark liquid covers the floor, the glow adds over it.
    blending: NormalBlending,
    premultipliedAlpha: true,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSeed: { value: 0 },
      uZoneR: { value: 4 },
      uRadius: { value: 0 },
      uMark: { value: 0 },
      uMarkWidth: { value: 0.06 },
      uMarkGlow: { value: 2.5 },
      uPools: { value: pools },
      uEdgeNoise: { value: 0.3 },
      uFlowScale: { value: 0.8 },
      uFlowSpeed: { value: 1 },
      uBubbleScale: { value: 3.2 },
      uBubbleRate: { value: 1.4 },
      uBubbleSize: { value: 0.45 },
      uBubbleShare: { value: 0.45 },
      uPoolGlow: { value: 1.8 },
      uCaustic: { value: 1 },
      uEdgeGlow: { value: 2 },
      uOpacity: { value: 0.85 },
      uFade: { value: 0 },
      uErode: { value: 0.7 },
      uColorDeep: { value: new Color() },
      uColorToxic: { value: new Color() },
      uColorFoam: { value: new Color() },
      uColorEdge: { value: new Color() }
    }),
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT
  });

  /** @param {object} state { center, zoneR, radius, mark, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.plague;
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSeed.value = state.seed;
    u.uZoneR.value = state.zoneR;
    u.uRadius.value = state.radius;
    u.uMark.value = state.mark;
    u.uMarkWidth.value = c.markWidth;
    u.uMarkGlow.value = c.markGlow * g.glow;
    u.uEdgeNoise.value = c.poolEdgeNoise * g.noiseStrength;
    u.uFlowScale.value = c.poolFlowScale * g.noiseFrequency;
    u.uFlowSpeed.value = c.poolFlowSpeed * g.noiseSpeed;
    u.uBubbleScale.value = c.bubbleScale;
    u.uBubbleRate.value = c.bubbleRate;
    u.uBubbleSize.value = c.bubbleSize;
    u.uBubbleShare.value = c.bubbleShare;
    u.uPoolGlow.value = c.poolGlow * g.glow;
    u.uCaustic.value = c.poolCaustic * g.shaderIntensity;
    u.uEdgeGlow.value = c.poolEdgeGlow * g.glow;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uFade.value = state.fade;
    u.uErode.value = c.poolErode;
    u.uColorDeep.value.copy(getColor(c.colorPoolDeep));
    u.uColorToxic.value.copy(getColor(c.colorPoolToxic));
    u.uColorFoam.value.copy(getColor(c.colorPoolFoam));
    u.uColorEdge.value.copy(getColor(c.colorPoolEdge));
  };
  return material;
}

/* ==================================================================== */
/* The miasma — LAYER.DISTORTION                                         */
/* ==================================================================== */

const MIASMA_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    // Camera-facing, standing on the floor: the plane's origin is its foot.
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += vec2(position.x * uWidth, (position.y + 0.5) * uHeight);
    vWorld = (modelMatrix * vec4(position.x * uWidth, (position.y + 0.5) * uHeight, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const MIASMA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.5 - uTime * uSpeed + uSeed);
    float nx = snoise(np);
    float ny = snoise(np + vec3(19.3, 7.7, 31.1));
    vec2 c = (vUv - 0.5) * 2.0;
    // Thick at the floor, thinning upward, feathered at the sides.
    float mask = (1.0 - smoothstep(0.35, 1.0, abs(c.x))) * (1.0 - smoothstep(0.0, 1.0, vUv.y)) * smoothstep(0.0, 0.06, vUv.y);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, strength, mask);
  }
`;

export function createMiasmaWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 8 },
      uHeight: { value: 2.4 },
      uStrength: { value: 0 },
      uScale: { value: 1.6 },
      uSpeed: { value: 0.9 },
      uSeed: { value: 0 }
    }),
    vertexShader: MIASMA_VERTEX,
    fragmentShader: MIASMA_FRAGMENT
  });
  /** @param {object} state { width, strength, seed } */
  material.userData.sync = (state) => {
    const c = settings.plague;
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = state.width;
    u.uHeight.value = c.warpHeight;
    u.uStrength.value = state.strength * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
    u.uSeed.value = state.seed;
  };
  return material;
}

