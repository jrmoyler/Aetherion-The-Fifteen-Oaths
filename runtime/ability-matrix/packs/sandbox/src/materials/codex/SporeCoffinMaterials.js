import { Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Spore Coffin — the bespoke shaders the cage is drawn with.
 *
 *  - **the ribs** — one tube grid instanced per rib and bent in the vertex
 *    stage along an arch from a root on the circle to the crown over its
 *    middle: bowed out at the shoulder, wound a little round the cage, and
 *    knuckled. A rib *sprouts* by compressing the whole tube into the part
 *    of the arch it has reached (so its tip is always rounded and always
 *    moving), overshoots the crown and settles. At the burst every rib
 *    swings outward about its root like a petal tearing open, and rots away
 *    on a noise threshold with a pale burning edge. The flesh is opaque and
 *    sun-shaded: pale cap flesh with dark gills, longitudinal ridges, and
 *    bioluminescent spots and veins of light that pulse up it.
 *  - **the pods** — puffballs clinging to the ribs (an InstancedMesh placed on
 *    the CPU from the CPU twin of the rib arch): a taut translucent skin with
 *    the spores glowing through it, thickest where you look straight in.
 *  - **the spore fog** — a dome inside the cage that fills from the floor up:
 *    a churning, glowing, mustard fog with dark lanes in it.
 *  - **the mycelium mat** — the ground: a ring of hyphae drawn round the
 *    circle while the cast runs out to it, then a mat of glowing threads and
 *    nodes growing in from that ring over a rotten dark stain.
 *  - **the blast warp** — a camera-facing ring on `LAYER.DISTORTION` that
 *    opens with the burst.
 *
 * Every material reads `settings.sporecoffin` in `userData.sync(state)`.
 */

const ID = 'sporecoffin';
export const MAX_RIBS = 24;

/* -------------------------------------------------------------------- */
/* The ribs                                                             */
/* -------------------------------------------------------------------- */

/** The rib arch. `SporeCoffinAbility#_ribPoint` is its CPU twin — keep them together. */
const RIB_GLSL = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uBulge;
  uniform float uTwist;
  uniform float uRibCount;
  uniform float uFling;       // radians, outward
  uniform float uPush;        // metres, outward

  float ribAngle(float i, float rnd) {
    float N = max(uRibCount, 1.0);
    return 6.2831853 * i / N + (rnd - 0.5) * 0.35 * 6.2831853 / N;
  }

  vec3 ribPoint(float th0, float s) {
    float th = th0 + uTwist * clamp(s, 0.0, 1.0);
    float phi = s * 1.5707963;
    float r = uRadius * cos(phi) * (1.0 + uBulge * sin(3.14159265 * clamp(s, 0.0, 1.0)));
    vec3 p = vec3(cos(th) * r, uHeight * sin(phi), sin(th) * r);
    vec3 o = vec3(cos(th0), 0.0, sin(th0));
    vec3 b = o * uRadius;
    vec3 v = p - b;
    // Swing about the root's tangent: the top falls outward.
    vec3 A = vec3(-sin(th0), 0.0, cos(th0));
    float be = -uFling;
    v = v * cos(be) + cross(A, v) * sin(be) + A * dot(A, v) * (1.0 - cos(be));
    return uCenter + b + v + o * uPush;
  }
`;

const RIB_VERTEX = /* glsl */ `
  uniform float uGrowClock;
  uniform float uGrowTime;
  uniform float uStagger;
  uniform float uOvershoot;
  uniform float uRibR;
  uniform float uTipR;
  uniform float uKnots;
  uniform float uKnotSize;
  uniform float uSeed;

  attribute vec2 aRib;

  varying float vS;
  varying float vLen;
  varying float vAng;
  varying float vRnd;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  ${RIB_GLSL}

  void main() {
    if (aRib.x >= uRibCount - 0.5) {
      gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      return;
    }
    float delay = uStagger * fract(aRib.x * 0.618 + aRib.y * 0.25);
    float k = clamp((uGrowClock - delay) / max(uGrowTime, 0.01), 0.0, 1.0);
    // Sprout: ease out, reach past the crown, settle back.
    float g = 1.0 - pow(1.0 - k, 3.0);
    g += uOvershoot * sin(3.14159265 * k) * k;
    float s = position.x * g;
    float th0 = ribAngle(aRib.x, aRib.y);

    vec3 c = ribPoint(th0, s);
    vec3 T = ribPoint(th0, s + 0.01) - ribPoint(th0, max(s - 0.01, 0.0));
    T = normalize(T + vec3(1e-5, 0.0, 0.0));
    vec3 ref = abs(T.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 N1 = normalize(cross(T, ref));
    vec3 B = cross(N1, T);
    float ang = position.y * 6.2831853;
    vec3 radial = cos(ang) * N1 + sin(ang) * B;

    float len = s * uHeight * 1.35;
    float knot = pow(max(sin(s * uKnots * 3.14159265 + aRib.y * 3.0), 0.0), 6.0);
    float rad = mix(uRibR, uTipR, clamp(s, 0.0, 1.0)) * (1.0 + uKnotSize * knot);
    // Round the growing tip.
    rad *= sqrt(clamp((1.0 - position.x) / 0.06, 0.0, 1.0)) * 0.85 + 0.15 * step(position.x, 0.999);
    rad *= smoothstep(0.0, 0.08, g);
    vec3 world = c + radial * rad;

    vS = s;
    vLen = len;
    vAng = ang;
    vRnd = aRib.y;
    vNormalW = radial;
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RIB_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uGillScale;
  uniform float uSpotScale;
  uniform float uSpotGlow;
  uniform float uVeinGlow;
  uniform float uVein;        // 0..1 how lit the gills are (the hold)
  uniform float uShade;
  uniform float uRot;         // 0 whole .. 1 rotted away
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorSpot;
  uniform vec3  uColorEdge;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying float vS;
  varying float vLen;
  varying float vAng;
  varying float vRnd;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  ${noiseGLSL}

  void main() {
    // Rot: eaten on noise from the crown down, with a pale burning edge.
    float n = snoise(vec3(vLen * 1.6, vAng * 0.8, vRnd * 9.0 + uSeed)) * 0.5 + 0.5;
    float field = n * 0.7 + (1.0 - clamp(vS, 0.0, 1.0)) * 0.3;
    float thr = uRot * 1.1 - 0.05;
    if (uRot > 0.0 && field < thr) discard;
    float edge = uRot > 0.0 ? 1.0 - smoothstep(thr, thr + 0.07, field) : 0.0;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float ndl = max(dot(N, normalize(uLightDir)), 0.0);
    float lit = mix(1.0, 0.35 + 0.65 * ndl, uShade);

    float ridges = smoothstep(0.55, 1.0, abs(sin(vAng * 5.0 + vRnd * 4.0)));
    float gills = smoothstep(0.7, 1.0, abs(sin(vLen * uGillScale + vAng * 0.5)));
    float mott = fbm3(vec3(vLen * 2.0, vAng, vRnd * 5.0)) * 0.5 + 0.5;
    vec3 col = mix(uColorA, uColorB, clamp(ridges * 0.7 + gills * 0.35 + (1.0 - mott) * 0.35, 0.0, 1.0));
    col *= lit;

    vec2 sp = voronoi2(vec2(vAng * 1.4, vLen * uSpotScale) + vRnd * 17.0);
    float throb = 0.6 + 0.4 * sin(uTime * 4.0 + sp.y * 6.2831853);
    float spot = (1.0 - smoothstep(0.08, 0.2, sp.x)) * step(0.45, sp.y) * throb;
    float vein = ridges * (0.5 + 0.5 * sin(vLen * 3.0 - uTime * 5.0 + vRnd * 6.0)) * uVein;
    float fres = pow(1.0 - abs(dot(N, V)), 3.0);

    vec3 glow = uColorSpot * (spot * uSpotGlow + vein * uVeinGlow + fres * 0.4) + uColorEdge * edge * 4.0;
    gl_FragColor = vec4(col + glow * uGlobalGlow, 1.0);
  }
`;

/** The ribs — opaque fungal flesh, bent and grown in the vertex stage. */
export function createRibMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 4 },
      uHeight: { value: 4 },
      uBulge: { value: 0.3 },
      uTwist: { value: 0.5 },
      uRibCount: { value: 14 },
      uFling: { value: 0 },
      uPush: { value: 0 },
      uGrowClock: { value: 0 },
      uGrowTime: { value: 0.5 },
      uStagger: { value: 0.3 },
      uOvershoot: { value: 0.08 },
      uRibR: { value: 0.12 },
      uTipR: { value: 0.03 },
      uKnots: { value: 6 },
      uKnotSize: { value: 0.4 },
      uSeed: { value: 0 },
      uGillScale: { value: 14 },
      uSpotScale: { value: 3 },
      uSpotGlow: { value: 3 },
      uVeinGlow: { value: 1.5 },
      uVein: { value: 0 },
      uShade: { value: 0.75 },
      uRot: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorSpot: { value: new Color() },
      uColorEdge: { value: new Color() }
    }),
    vertexShader: RIB_VERTEX,
    fragmentShader: RIB_FRAGMENT
  });

  /** @param {object} state { center, growClock, fling, push, vein, rot, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uRadius.value = Math.max(0.3, c.zoneRadius * c.cageRadius);
    u.uHeight.value = Math.max(0.3, c.cageHeight);
    u.uBulge.value = c.ribBulge;
    u.uTwist.value = c.ribTwist;
    u.uRibCount.value = Math.min(MAX_RIBS, Math.max(3, Math.round(c.ribCount)));
    u.uFling.value = state.fling;
    u.uPush.value = state.push;
    u.uGrowClock.value = state.growClock;
    u.uGrowTime.value = Math.max(0.02, c.growTime * g.lifetime);
    u.uStagger.value = c.growStagger * g.lifetime;
    u.uOvershoot.value = c.crownOvershoot;
    u.uRibR.value = Math.max(0.005, c.ribRadius);
    u.uTipR.value = Math.max(0.003, c.ribTipRadius);
    u.uKnots.value = c.knots;
    u.uKnotSize.value = c.knotSize * g.noiseStrength;
    u.uSeed.value = state.seed;
    u.uGillScale.value = c.gillScale * g.noiseFrequency;
    u.uSpotScale.value = c.spotScale * g.noiseFrequency;
    u.uSpotGlow.value = c.spotGlow * g.glow;
    u.uVeinGlow.value = c.veinGlow * g.glow;
    u.uVein.value = state.vein;
    u.uShade.value = c.fleshShade;
    u.uRot.value = state.rot;
    u.uColorA.value.copy(getColor(c.colorFleshA));
    u.uColorB.value.copy(getColor(c.colorFleshB));
    u.uColorSpot.value.copy(getColor(c.colorSpot));
    u.uColorEdge.value.copy(getColor(c.colorDissolve));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The pods                                                             */
/* -------------------------------------------------------------------- */

const POD_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uRate;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vLocal;
  varying float vPhase;
  ${noiseGLSL}
  void main() {
    vec3 seedP = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float ph = fract(dot(seedP, vec3(0.37, 0.71, 0.53)));
    // Lumpy, not a ball.
    float lump = snoise(position * 2.2 + seedP) * 0.14;
    vec3 p = position * (1.0 + lump);
    vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix * instanceMatrix) * position);
    vViewDir = cameraPosition - world.xyz;
    vLocal = position;
    vPhase = ph;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const POD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uRate;
  uniform float uGlow;
  uniform vec3  uColorSkin;
  uniform vec3  uColorGlow;
  uniform float uGlobalGlow;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vLocal;
  varying float vPhase;
  ${noiseGLSL}
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float facing = abs(dot(N, V));
    // Spores glow through the skin where it is thickest to look through.
    float through = pow(facing, 1.5);
    vec2 cells = voronoi2(vec2(atan(vLocal.z, vLocal.x) * 2.0, vLocal.y * 3.0) + vPhase * 20.0);
    float veins = 1.0 - smoothstep(0.03, 0.12, abs(cells.x - 0.35));
    float throb = 0.55 + 0.45 * sin(uTime * uRate * 6.2831853 + vPhase * 6.2831853);
    vec3 col = uColorSkin * (0.45 + 0.4 * facing) + uColorGlow * uGlow * (through * throb * 0.8 + veins * 0.35);
    float a = 0.75 + 0.25 * (1.0 - facing);
    gl_FragColor = vec4(col * uGlobalGlow, a);
  }
`;

/** Puffballs on the ribs. Used on an InstancedMesh. */
export function createPodMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRate: { value: 2.5 },
      uGlow: { value: 2.5 },
      uColorSkin: { value: new Color() },
      uColorGlow: { value: new Color() }
    }),
    vertexShader: POD_VERTEX,
    fragmentShader: POD_FRAGMENT
  });
  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uRate.value = c.podRate * g.animationSpeed;
    u.uGlow.value = c.podGlow * g.glow;
    u.uColorSkin.value.copy(getColor(c.colorPodSkin));
    u.uColorGlow.value.copy(getColor(c.colorPodGlow));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The spore fog                                                        */
/* -------------------------------------------------------------------- */

const FOG_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform vec3  uScale;
  varying vec3  vLocal;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  void main() {
    vec3 world = uCenter + position * uScale;
    vLocal = position * uScale;
    vNormalW = normalize(position / max(uScale, vec3(0.01)));
    vViewDir = cameraPosition - world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FOG_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uFill;        // metres it has filled to
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uScaleN;
  uniform float uSwirl;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float uGlobalGlow;
  varying vec3  vLocal;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    if (vLocal.y < -0.05) discard;
    float thick = pow(abs(dot(normalize(vNormalW), normalize(vViewDir))), 1.2);
    vec3 q = vLocal * uScaleN;
    q.xz *= rot2(uTime * uSwirl * 0.4 + vLocal.y * 0.3);
    float swirl = fbm4(q + vec3(0.0, -uTime * uSwirl, uSeed)) * 0.5 + 0.5;
    float lanes = smoothstep(0.35, 0.75, swirl);
    float filled = 1.0 - smoothstep(uFill - 0.6, uFill, vLocal.y);
    vec3 col = mix(uColorB, uColorA, lanes) * uGlow * (0.5 + 0.7 * lanes);
    float a = uOpacity * thick * filled * (0.35 + 0.65 * lanes);
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.6);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The spores packed inside the coffin. */
export function createFogMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uScale: { value: new Vector3(4, 4, 4) },
      uSeed: { value: 0 },
      uFill: { value: 0 },
      uOpacity: { value: 0.5 },
      uGlow: { value: 1.5 },
      uScaleN: { value: 0.8 },
      uSwirl: { value: 0.6 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: FOG_VERTEX,
    fragmentShader: FOG_FRAGMENT
  });
  /** @param {object} state { center, fill (0..1), fade, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    const R = Math.max(0.3, c.zoneRadius * c.cageRadius);
    u.uCenter.value.copy(state.center);
    u.uScale.value.set(R * (1 + c.ribBulge * 0.5) * 0.85, c.cageHeight * 0.92, R * (1 + c.ribBulge * 0.5) * 0.85);
    u.uSeed.value = state.seed;
    u.uFill.value = state.fill * (c.cageHeight + 0.6);
    u.uOpacity.value = c.fogOpacity * g.opacity * state.fade;
    u.uGlow.value = c.fogGlow * g.glow;
    u.uScaleN.value = c.fogScale * g.noiseFrequency;
    u.uSwirl.value = c.fogSwirl * g.noiseSpeed;
    u.uColorA.value.copy(getColor(c.colorFogA));
    u.uColorB.value.copy(getColor(c.colorFogB));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The mycelium mat                                                     */
/* -------------------------------------------------------------------- */

const MAT_VERTEX = /* glsl */ `
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

const MAT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;      // the ring
  uniform float uOuter;       // the mat's reach
  uniform float uRing;        // 0..1 how much of the ring is drawn
  uniform float uSpread;      // 0..1 how far the mat has grown in
  uniform float uScale;
  uniform float uGlow;
  uniform float uLive;
  uniform float uErode;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorHyphae;
  uniform vec3  uColorMat;
  uniform vec3  uColorNodes;
  uniform float uGlobalGlow;
  varying vec2 vXZ;
  ${noiseGLSL}
  void main() {
    float r = length(vXZ);
    if (r > uOuter) discard;
    float a = atan(vXZ.y, vXZ.x);
    float a01 = fract(a / 6.2831853 + 0.25);

    // The ring, drawing itself round.
    float drawn = step(a01, uRing);
    float wob = snoise(vec3(cos(a) * 3.0, sin(a) * 3.0, uSeed)) * 0.12;
    float ring = exp(-pow((r - uRadius - wob) / 0.07, 2.0)) * drawn;

    // Threads: mostly radial filaments, with a second rotated set for the branching.
    float circ = a * uRadius * uScale * 0.16;
    float t1 = pow(1.0 - abs(snoise(vec3(circ, r * 0.45, uSeed))), 14.0);
    float t2 = pow(1.0 - abs(snoise(vec3(vXZ * uScale * 0.35, uSeed + 3.0))), 18.0);
    float threads = max(t1, t2 * 0.8);

    // The mat grows in from the ring and out a little past it.
    float inner = uRadius * (1.0 - uSpread);
    float matM = smoothstep(inner - 0.6, inner + 0.2, r) * (1.0 - smoothstep(uRadius, uOuter, r)) * smoothstep(0.0, 0.05, uSpread);
    matM = max(matM, (1.0 - smoothstep(uRadius * 0.9, uOuter, r)) * step(0.999, uSpread));
    vec2 nd = voronoi2(vXZ * 1.6 + uSeed);
    float nodes = (1.0 - smoothstep(0.05, 0.14, nd.x)) * step(0.55, nd.y) * matM;
    float pulse = 0.6 + 0.4 * sin(uTime * 3.0 - r * 2.0);

    vec3 col = uColorMat;
    vec3 glow = uColorHyphae * (threads * matM * pulse * 0.8 + ring * 1.6) + uColorNodes * nodes * 1.5;
    col += glow * uGlow * uLive * uGlobalGlow;
    float alpha = max(matM * (0.65 + 0.3 * threads), ring);
    float n = snoise(vec3(vXZ * 0.8, uSeed * 5.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.55, n, uErode));
    alpha *= vis * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The mycelium the coffin grows out of. */
export function createMatMaterial() {
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
      uRadius: { value: 4 },
      uOuter: { value: 5 },
      uRing: { value: 0 },
      uSpread: { value: 0 },
      uScale: { value: 5 },
      uGlow: { value: 2 },
      uLive: { value: 1 },
      uErode: { value: 0.7 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorHyphae: { value: new Color() },
      uColorMat: { value: new Color() },
      uColorNodes: { value: new Color() }
    }),
    vertexShader: MAT_VERTEX,
    fragmentShader: MAT_FRAGMENT
  });
  /** @param {object} state { center, ring, spread, live, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    const R = Math.max(0.3, c.zoneRadius * c.cageRadius);
    const outer = Math.max(R + 0.2, c.zoneRadius * c.matRadius);
    u.uCenter.value.copy(state.center);
    u.uSize.value = outer;
    u.uSeed.value = state.seed;
    u.uRadius.value = R;
    u.uOuter.value = outer;
    u.uRing.value = state.ring;
    u.uSpread.value = state.spread;
    u.uScale.value = c.hyphaeScale * g.noiseFrequency;
    u.uGlow.value = c.hyphaeGlow * g.glow;
    u.uLive.value = state.live;
    u.uErode.value = c.matErode;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorHyphae.value.copy(getColor(c.colorHyphae));
    u.uColorMat.value.copy(getColor(c.colorMat));
    u.uColorNodes.value.copy(getColor(c.colorNodes));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The blast warp                                                       */
/* -------------------------------------------------------------------- */

const WARP_VERTEX = /* glsl */ `
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

const WARP_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float R = 0.1 + 0.85 * uProgress;
    float d = (r - R) / 0.14;
    float slope = -d * exp(-d * d);
    vec2 dir = vUv / max(r, 1e-4);
    float mask = exp(-d * d) * (1.0 - uProgress);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * clamp(slope * 2.0, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** The air bent by the burst — LAYER.DISTORTION. */
export function createBlastWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 4 },
      uProgress: { value: 0 },
      uStrength: { value: 1 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });
  /** @param {object} state { center, progress } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.5, c.zoneRadius * 1.6 * g.explosionIntensity);
    u.uProgress.value = state.progress;
    u.uStrength.value = c.warpStrength * g.distortion;
  };
  return material;
}

