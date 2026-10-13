import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* ==================================================================== */
/* 1 · the plates                                                         */
/* ==================================================================== */

/**
 * The shield's plates — one InstancedMesh.
 *
 * ## Built in the vertex stage
 *
 * Per instance `aPlate = (start angle, span, inner radius, outer radius)` in
 * the shield's own disc (XY, face toward +Z). The ability rewrites the start
 * angle every frame from its integrated spin, so the rings *turn* without the
 * blank changing. A plate's front skin is dished (`uDish`: the rim sits back
 * from the boss), it is `uThick` thick, and its edges are bevelled down to a
 * fraction of that over the outer `uBevel` of the plate — so each plate reads
 * as a machined tile with a lit chamfer. Normals: finite differences on the
 * skins, analytic on the walls.
 *
 * `instanceMatrix` carries only the assembly: the fly-in offset and tumble
 * about the plate's own centre, computed in the ability. Everything else is
 * the mesh's transform (the shield's frame).
 *
 * ## The fragment
 *
 * Brushed steel with sky reflection and a hard specular; engraved **channels**
 * (two concentric arcs and a radial cut per plate) which carry the stored
 * blow as light crawling round the shield (`uCharge`, `uCrawl`); a glowing
 * **rim** on each plate's edge; and an **impact ripple** expanding across the
 * whole disc from where the bolt struck (`uImpact` in disc metres + age).
 */
const PLATE_VERTEX = /* glsl */ `
  attribute float aKind;
  attribute vec4  aPlate;     // start angle, span, r inner, r outer
  attribute vec4  aInfo;      // ring, seed, lock flash, -

  uniform float uRadius;      // shield radius, for the dish
  uniform float uDish;
  uniform float uThick;
  uniform float uBevel;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vDisc;        // disc-space metres, before assembly
  varying vec2  vUv;
  varying float vKind;
  varying vec4  vInfo;

  vec3 platePoint(float u, float v, float face) {
    float ang = aPlate.x + u * aPlate.y;
    float r = mix(aPlate.z, aPlate.w, v);
    float k = r / max(uRadius, 1e-3);
    float z = -uDish * k * k;
    // Bevel: thickness falls toward every edge of the plate.
    float arcLen = aPlate.y * r;
    float du = min(u, 1.0 - u) * arcLen;
    float dv = min(v, 1.0 - v) * (aPlate.w - aPlate.z);
    float e = min(du, dv);
    float bevelW = max(uBevel * 0.12, 1e-3);
    float t = mix(0.35, 1.0, smoothstep(0.0, bevelW, e));
    return vec3(cos(ang) * r, sin(ang) * r, z + face * uThick * 0.5 * t);
  }

  void main() {
    float u = position.x;
    float v = position.y;
    float face = position.z;
    vec3 p = platePoint(u, v, face);

    vec3 n;
    float ang = aPlate.x + u * aPlate.y;
    if (aKind < 0.5) {
      float e = 0.02;
      vec3 pu = platePoint(min(u + e, 1.0), v, face) - platePoint(max(u - e, 0.0), v, face);
      vec3 pv = platePoint(u, min(v + e, 1.0), face) - platePoint(u, max(v - e, 0.0), face);
      n = normalize(cross(pu, pv)) * face;
    } else if (aKind < 1.5) {
      n = vec3(-sin(ang), cos(ang), 0.0) * (u > 0.5 ? 1.0 : -1.0);
    } else {
      n = vec3(cos(ang), sin(ang), 0.0) * (v > 0.5 ? 1.0 : -1.0);
    }

    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * n);
    vDisc = p.xy;
    vUv = vec2(u, v);
    vKind = aKind;
    vInfo = aInfo;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PLATE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;
  uniform float uReflect;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uEngrave;
  uniform float uRimGlow;
  uniform float uCharge;       // 0..1 the stored blow
  uniform float uChargeGlow;
  uniform float uCrawl;        // integrated crawl phase
  uniform vec3  uImpact;       // disc x, y, age (age < 0: none)
  uniform float uImpactRing;
  uniform float uFade;
  uniform vec3  uColorSteel;
  uniform vec3  uColorDeep;
  uniform vec3  uColorSpec;
  uniform vec3  uColorRim;
  uniform vec3  uColorCharge;
  uniform vec3  uColorHot;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vDisc;
  varying vec2  vUv;
  varying float vKind;
  varying vec4  vInfo;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    float seed = vInfo.y;
    float r = length(vDisc);
    float ang = atan(vDisc.y, vDisc.x);

    /* --- steel --- */
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    float fres = 0.3 + 0.7 * pow(1.0 - ndv, 5.0);
    float brushed = snoise(vec3(ang * 40.0, r * 3.0, seed * 9.0)) * 0.05;
    vec3 steel = uColorSteel * (0.3 + 0.55 * clamp(dot(N, L), 0.0, 1.0) + brushed);
    steel += uColorSteel * env * uReflect * fres;
    steel += uColorSpec * pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), uGloss) * uSpecular;
    steel += uColorDeep * 0.3;

    /* --- channels: two arcs and a radial cut on every plate --- */
    float faceMask = step(vKind, 0.5);
    float aaU = fwidth(vUv.x) * 1.5;
    float aaV = fwidth(vUv.y) * 1.5;
    float arc1 = 1.0 - smoothstep(0.03, 0.03 + aaV, abs(vUv.y - 0.33));
    float arc2 = 1.0 - smoothstep(0.03, 0.03 + aaV, abs(vUv.y - 0.7));
    float cut = (1.0 - smoothstep(0.025, 0.025 + aaU, abs(vUv.x - 0.5))) * step(0.33, vUv.y) * step(vUv.y, 0.7);
    float channel = max(max(arc1, arc2), cut) * faceMask;

    // The charge crawling round the shield, pulsing outward.
    float crawl = 0.5 + 0.5 * sin(ang * 3.0 - uCrawl + r * 6.0);
    crawl = pow(crawl, 3.0);
    float chargeLight = uCharge * (0.35 + 0.65 * crawl) * uChargeGlow;

    /* --- each plate's lit chamfer --- */
    float edge = min(min(vUv.x, 1.0 - vUv.x) * 5.0, min(vUv.y, 1.0 - vUv.y) * 5.0);
    float rim = (1.0 - smoothstep(0.0, 0.35, edge)) * faceMask + step(0.5, vKind) * 0.6;

    /* --- the impact ripple --- */
    float ripple = 0.0;
    if (uImpact.z >= 0.0) {
      float d = length(vDisc - uImpact.xy);
      float front = uImpact.z * uRadius * 2.6;
      float life = exp(-uImpact.z * 2.2);
      ripple = (exp(-pow((d - front) / 0.09, 2.0)) + exp(-pow((d - front * 0.6) / 0.07, 2.0)) * 0.5) * life;
      ripple += exp(-d * d / 0.03) * exp(-uImpact.z * 8.0) * 3.0;
    }

    vec3 color = mix(steel, uColorDeep * 0.5, channel * uEngrave);
    vec3 glowCol = mix(uColorCharge, uColorHot, crawl * uCharge);
    color += glowCol * channel * chargeLight * uGlobalGlow;
    color += uColorRim * rim * uRimGlow * (1.0 + uCharge * 1.5) * uGlobalGlow;
    color += uColorHot * vInfo.z * 3.0 * uGlobalGlow;
    color += mix(uColorCharge, uColorHot, 0.5) * ripple * uImpactRing * uGlobalGlow;
    color *= uFade;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createReversalPlateMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uRadius: { value: 1.2 },
      uDish: { value: 0.2 },
      uThick: { value: 0.07 },
      uBevel: { value: 0.25 },
      uReflect: { value: 1 },
      uGloss: { value: 100 },
      uSpecular: { value: 2 },
      uEngrave: { value: 0.6 },
      uRimGlow: { value: 1.4 },
      uCharge: { value: 0 },
      uChargeGlow: { value: 6 },
      uCrawl: { value: 0 },
      uImpact: { value: new Vector3(0, 0, -1) },
      uImpactRing: { value: 4 },
      uFade: { value: 1 },
      uColorSteel: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorSpec: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorCharge: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: PLATE_VERTEX,
    fragmentShader: PLATE_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {object} state { charge, crawl, impactX, impactY, impactAge, fade } */
  material.userData.sync = (state) => {
    const c = settings.reversal;
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = Math.max(0.1, c.shieldRadius);
    u.uDish.value = c.shieldDish;
    u.uThick.value = c.plateThickness;
    u.uBevel.value = c.plateBevel;
    u.uReflect.value = c.metalReflect;
    u.uGloss.value = c.metalGloss;
    u.uSpecular.value = c.metalSpecular;
    u.uEngrave.value = c.engrave;
    u.uRimGlow.value = c.rimGlow * g.glow;
    u.uCharge.value = state.charge;
    u.uChargeGlow.value = c.chargeGlow * g.glow * g.shaderIntensity;
    u.uCrawl.value = state.crawl;
    u.uImpact.value.set(state.impactX, state.impactY, state.impactAge);
    u.uImpactRing.value = c.impactRing;
    u.uFade.value = state.fade;
    u.uColorSteel.value.copy(getColor(c.colorSteel));
    u.uColorDeep.value.copy(getColor(c.colorSteelDeep));
    u.uColorSpec.value.copy(getColor(c.colorSteelSpec));
    u.uColorRim.value.copy(getColor(c.colorRimLight));
    u.uColorCharge.value.copy(getColor(c.colorCharge));
    u.uColorHot.value.copy(getColor(c.colorChargeHot));
  };

  return material;
}

/* ==================================================================== */
/* 2 · the bolt                                                           */
/* ==================================================================== */

/**
 * The hostile bolt: the strip blank stretched behind its head along its
 * flight and turned to face the camera about that axis — a hot white core in
 * a red sheath, corkscrewing (`uWobble`), with a noise-torn tail. With
 * `uLength` near zero it is the muzzle flare before it fires.
 */
const BOLT_VERTEX = /* glsl */ `
  uniform vec3  uHead;
  uniform vec3  uDir;
  uniform float uLength;
  uniform float uWidth;
  uniform float uWobble;
  uniform float uTime;

  varying vec2 vUv;

  void main() {
    float s = position.x;           // -1..1 across
    float h = position.y;           // 0 head .. 1 tail
    vec3 dir = normalize(uDir);
    vec3 p = uHead - dir * h * uLength;
    vec3 side0 = normalize(cross(dir, vec3(0.0, 1.0, 0.0)) + vec3(1e-5));
    vec3 up0 = cross(side0, dir);
    float tw = h * 9.0 - uTime * 30.0;
    p += (side0 * cos(tw) + up0 * sin(tw)) * uWobble * h;
    vec3 view = normalize(cameraPosition - p);
    vec3 across = normalize(cross(dir, view) + vec3(1e-5));
    // Fat at the head, thin at the tail; a round cap ahead of the head.
    float w = uWidth * (1.0 - h * 0.75);
    p += across * s * w;
    p += dir * (1.0 - h) * uWidth * 0.5 * step(h, 0.001);
    vUv = vec2(s, h);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const BOLT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uFade;
  uniform vec3  uColorCore;
  uniform vec3  uColor;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float s = abs(vUv.x);
    float h = vUv.y;
    float tear = snoise(vec3(vUv.x * 3.0, h * 6.0 - uTime * 14.0, 1.7)) * 0.5 + 0.5;
    float core = exp(-s * s * 18.0) * (1.0 - smoothstep(0.2, 0.9, h));
    float sheath = exp(-s * s * 3.0) * (1.0 - smoothstep(0.0, 1.0, h)) * (0.6 + 0.4 * tear);
    vec3 color = uColorCore * core * 2.0 + uColor * sheath;
    float a = clamp(core + sheath, 0.0, 1.0) * uFade;
    if (a < 0.003) discard;
    gl_FragColor = vec4(color * uGlow * uGlobalGlow * uFade, a);
  }
`;

export function createReversalBoltMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHead: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uLength: { value: 1 },
      uWidth: { value: 0.2 },
      uWobble: { value: 0.1 },
      uGlow: { value: 4 },
      uFade: { value: 1 },
      uColorCore: { value: new Color() },
      uColor: { value: new Color() }
    }),
    vertexShader: BOLT_VERTEX,
    fragmentShader: BOLT_FRAGMENT
  });

  /** @param {object} state { head, dir, length, width, fade } */
  material.userData.sync = (state) => {
    const c = settings.reversal;
    const g = settings.global;
    const u = material.uniforms;
    u.uHead.value.copy(state.head);
    u.uDir.value.copy(state.dir);
    u.uLength.value = state.length;
    u.uWidth.value = state.width;
    u.uWobble.value = c.boltWobble * g.turbulence;
    u.uGlow.value = c.boltGlow * g.glow;
    u.uFade.value = state.fade * g.opacity;
    u.uColorCore.value.copy(getColor(c.colorBoltCore));
    u.uColor.value.copy(getColor(c.colorBolt));
  };

  return material;
}

/* ==================================================================== */
/* 3 · the counter-wave on the floor                                      */
/* ==================================================================== */

/**
 * The cone, drawn on a ground quad centred on its apex. The fragment works in
 * the cone's own frame (`x` down the axis, `z` across) and widens like a horn:
 * the half-angle at distance `r` is `mix(uStart, uFull, r / uReach)`.
 *
 *  - **preview** (`uPreview`) while the blow is stored: the two edges and a
 *    dotted axis faintly drawn ahead of the shield — the threat of it;
 *  - the **front**: a bright band at `uFront` metres, inside the cone only;
 *  - **behind** the front: rays (one per angular bucket, rolled lengths and
 *    brightness) and chevrons racing outward, all burning down over
 *    `uAfter` as the scorched cone lingers;
 *  - the **edges**, lit hard where the front is.
 */
const CONE_VERTEX = /* glsl */ `
  uniform float uQuadSize;
  varying vec2 vLocal;
  void main() {
    vLocal = (uv - 0.5) * uQuadSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CONE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec2  uAxis;      // world xz, unit
  uniform float uReach;
  uniform float uStart;
  uniform float uFull;
  uniform float uFront;
  uniform float uFrontWidth;
  uniform float uRays;
  uniform float uChevrons;
  uniform float uFloorGlow;
  uniform float uEdgeGlow;
  uniform float uAfter;     // 0 while sweeping → 1 burnt out
  uniform float uPreview;
  uniform float uSeed;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;
  uniform float uOpacity;

  varying vec2 vLocal;

  ${noiseGLSL}

  void main() {
    // Plane geometry is rotated -90° about X, so uv.y runs toward -z.
    vec2 xz = vec2(vLocal.x, -vLocal.y);
    float x = dot(xz, uAxis);
    float z = dot(xz, vec2(-uAxis.y, uAxis.x));
    float r = length(xz);
    if (x <= 0.0 || r > uReach * 1.08) discard;
    float ang = atan(abs(z), x);
    float k = clamp(r / max(uReach, 1e-3), 0.0, 1.0);
    float halfA = mix(uStart, uFull, k);
    float aaA = fwidth(ang) * 1.5;
    float inside = 1.0 - smoothstep(halfA - aaA, halfA + aaA, ang);
    float edgeD = abs(ang - halfA) * r;
    float edge = exp(-edgeD * edgeD / 0.0025);
    float endFade = 1.0 - smoothstep(uReach * 0.92, uReach * 1.06, r);

    /* --- preview while charged --- */
    float dots = step(0.5, fract(r * 3.0 - uTime * 2.0)) * exp(-z * z / 0.002);
    float preview = (edge * 0.8 + dots * 0.6) * uPreview * endFade;

    /* --- the front --- */
    float swept = step(0.001, uFront);
    float front = exp(-pow((r - uFront) / max(uFrontWidth * 0.5, 1e-3), 2.0)) * inside * swept;
    float behind = (1.0 - smoothstep(uFront - 0.05, uFront + 0.05, r)) * inside * swept;

    /* --- rays and chevrons behind it --- */
    float rel = ang / max(halfA, 1e-3);           // -1..1 across the cone (abs here)
    float bucket = floor((rel * 0.5 + 0.5) * max(uRays, 1.0));
    float rnd = hash11(bucket + uSeed);
    float rayW = abs(fract((rel * 0.5 + 0.5) * max(uRays, 1.0)) - 0.5);
    float ray = (1.0 - smoothstep(0.05, 0.25, rayW)) * smoothstep(0.0, 0.6, rnd) * (0.4 + 0.6 * rnd);
    float chev = fract(r / max(uReach, 1e-3) * uChevrons - rel * 0.6 - uTime * 2.4);
    chev = smoothstep(0.75, 1.0, chev) * (1.0 - uAfter);
    float scorch = 0.5 + 0.5 * snoise(vec3(xz * 2.0, uSeed));
    float trail = behind * (ray * 0.8 + chev * 0.7 + scorch * 0.25) * (1.0 - uAfter);

    float edgeLit = edge * behind * (1.0 - uAfter) + edge * exp(-pow((r - uFront) / 0.6, 2.0)) * swept;

    vec3 color = mix(uColorA, uColorB, front) * (front * 2.0 + trail) * uFloorGlow
               + uColorA * edgeLit * uEdgeGlow
               + uColorA * preview;
    float a = clamp(front + trail + edgeLit + preview, 0.0, 1.0) * endFade * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(color * uGlobalGlow * endFade * uOpacity, a);
  }
`;

export function createReversalConeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 10 },
      uAxis: { value: new Vector2(1, 0) },
      uReach: { value: 6 },
      uStart: { value: 0.1 },
      uFull: { value: 0.6 },
      uFront: { value: 0 },
      uFrontWidth: { value: 0.5 },
      uRays: { value: 18 },
      uChevrons: { value: 5 },
      uFloorGlow: { value: 2.5 },
      uEdgeGlow: { value: 2 },
      uAfter: { value: 0 },
      uPreview: { value: 0 },
      uSeed: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uOpacity: { value: 1 }
    }),
    vertexShader: CONE_VERTEX,
    fragmentShader: CONE_FRAGMENT
  });

  /** @param {object} state { quadSize, axisX, axisZ, reach, front, after, preview, seed } */
  material.userData.sync = (state) => {
    const c = settings.reversal;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize;
    u.uAxis.value.set(state.axisX, state.axisZ);
    u.uReach.value = state.reach;
    u.uStart.value = c.coneStartAngle;
    u.uFull.value = c.coneAngle;
    u.uFront.value = state.front;
    u.uFrontWidth.value = c.frontWidth;
    u.uRays.value = c.rayCount;
    u.uChevrons.value = c.chevrons;
    u.uFloorGlow.value = c.floorGlow * g.shaderIntensity;
    u.uEdgeGlow.value = c.edgeGlow;
    u.uAfter.value = state.after;
    u.uPreview.value = state.preview;
    u.uSeed.value = state.seed;
    u.uOpacity.value = g.opacity;
    u.uColorA.value.copy(getColor(c.colorConeA));
    u.uColorB.value.copy(getColor(c.colorConeB));
  };

  return material;
}

/* ==================================================================== */
/* 4 · the standing wavefront, and its warp                               */
/* ==================================================================== */

/**
 * The wavefront: the strip blank bent round the arc of the cone at `uFront`
 * metres, `uHeight` tall, standing on the floor. Shared by the visible wall
 * (additive bands of light, brightest at the floor and fading up and toward
 * the cone's edges) and its LAYER.DISTORTION twin, which pushes the frame
 * along the cone's axis as seen on screen.
 */
const WALL_VERTEX = /* glsl */ `
  uniform vec3  uApex;
  uniform vec2  uAxis;
  uniform float uFront;
  uniform float uHalf;
  uniform float uHeight;

  varying vec2 vUv;
  varying vec2 vScreenAxis;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  void main() {
    float s = position.x;
    float h = position.y;
    float a = s * uHalf;
    vec2 d = vec2(uAxis.x * cos(a) - uAxis.y * sin(a), uAxis.x * sin(a) + uAxis.y * cos(a));
    // Leans forward at the top, like a breaking wave.
    vec3 p = uApex + vec3(d.x, 0.0, d.y) * (uFront + h * h * uHeight * 0.25) + vec3(0.0, h * uHeight, 0.0);
    vUv = vec2(s, h);
    vNormalW = vec3(d.x, 0.0, d.y);
    vWorld = p;

    vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
    vec4 clip2 = projectionMatrix * viewMatrix * vec4(p + vec3(uAxis.x, 0.0, uAxis.y) * 0.5, 1.0);
    vec2 n1 = clip.xy / max(clip.w, 1e-4);
    vec2 n2 = clip2.xy / max(clip2.w, 1e-4);
    vScreenAxis = normalize(n2 - n1 + vec2(1e-5));
    gl_Position = clip;
  }
`;

const WALL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uBands;
  uniform float uGlow;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying vec2 vUv;
  varying vec2 vScreenAxis;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float s = abs(vUv.x);
    float h = vUv.y;
    float sides = 1.0 - smoothstep(0.7, 1.0, s);
    float top = 1.0 - smoothstep(0.25, 1.0, h);
    float bands = 0.5 + 0.5 * sin(h * uBands * 6.2831853 - uTime * 14.0);
    bands = pow(bands, 3.0);
    float grain = 0.7 + 0.3 * snoise(vec3(vUv.x * 8.0, h * 4.0 - uTime * 6.0, 2.3));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = 0.5 + 0.5 * pow(1.0 - abs(dot(V, normalize(vNormalW))), 2.0);
    float light = (0.35 + bands) * sides * top * grain * fres;
    vec3 color = mix(uColorA, uColorB, bands * (1.0 - h));
    float a = clamp(light, 0.0, 1.0) * uStrength;
    if (a < 0.003) discard;
    gl_FragColor = vec4(color * light * uGlow * uGlobalGlow * uStrength, a);
  }
`;

const WALL_WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform vec2  uResolution;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec2 vScreenAxis;

  ${noiseGLSL}

  void main() {
    float s = abs(vUv.x);
    float h = vUv.y;
    float mask = (1.0 - smoothstep(0.6, 1.0, s)) * (1.0 - smoothstep(0.3, 1.0, h));
    float ripple = 0.6 + 0.4 * sin(h * 20.0 - uTime * 18.0);
    float strength = uStrength * mask * ripple;
    if (strength < 0.002) discard;
    vec2 o = vScreenAxis;
    gl_FragColor = vec4(o * 0.5 + 0.5, strength * uShaderIntensity, mask);
  }
`;

function wallUniforms() {
  return sharedUniforms({
    uApex: { value: new Vector3() },
    uAxis: { value: new Vector2(1, 0) },
    uFront: { value: 0 },
    uHalf: { value: 0.5 },
    uHeight: { value: 1.5 },
    uStrength: { value: 0 },
    uBands: { value: 6 },
    uGlow: { value: 2 },
    uColorA: { value: new Color() },
    uColorB: { value: new Color() }
  });
}

/** @param {object} state { apex, axisX, axisZ, front, half, height, strength } */
function syncWall(material, state, warp) {
  const c = settings.reversal;
  const g = settings.global;
  const u = material.uniforms;
  u.uApex.value.copy(state.apex);
  u.uAxis.value.set(state.axisX, state.axisZ);
  u.uFront.value = state.front;
  u.uHalf.value = state.half;
  u.uHeight.value = state.height;
  u.uStrength.value = warp ? state.strength * c.distortion * g.distortion * 0.8 : state.strength * g.opacity;
  u.uBands.value = c.wallBands;
  u.uGlow.value = c.wallGlow * g.glow;
  u.uColorA.value.copy(getColor(c.colorConeA));
  u.uColorB.value.copy(getColor(c.colorConeB));
}

export function createReversalWallMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: wallUniforms(),
    vertexShader: WALL_VERTEX,
    fragmentShader: WALL_FRAGMENT
  });
  material.userData.sync = (state) => syncWall(material, state, false);
  return material;
}

/** LAYER.DISTORTION twin of the wall. Same encoding as `createAcidFumeMaterial`. */
export function createReversalWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: wallUniforms(),
    vertexShader: WALL_VERTEX,
    fragmentShader: WALL_WARP_FRAGMENT
  });
  material.userData.sync = (state) => syncWall(material, state, true);
  return material;
}

