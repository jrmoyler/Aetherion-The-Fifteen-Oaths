import { BackSide, Color, FrontSide, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Avalanche Wake — the four bespoke shaders the wave is drawn with.
 *
 *  - **the front** — a parameter grid (`createAvalancheShellGeometry`) bent in
 *    the vertex stage into a rolling wall of powder: a half-ellipse in profile
 *    whose crest leans out over its own foot, whose flanks drop and trail into
 *    a crescent in plan, and whose surface is pushed out into billows by fbm
 *    sampled in a domain that *rotates about the lateral axis* with distance
 *    rolled — so the billows go up the back, over the crest and down the face,
 *    which is the one motion that says "rolling" rather than "sliding". The
 *    fragment is a soft volume faked on a shell: dense face-on, thinning to a
 *    ragged noise-eroded silhouette, lit by the stage's own sun with a wrapped
 *    term, deep blue in the folds between billows, and backlit through the thin
 *    edges. Normal blending — snow has to *cover* what is behind it.
 *  - **the shove** — the same shell on `LAYER.DISTORTION`, a size larger,
 *    pushing the screen out along its own projected normal with churning noise:
 *    the air the wave pushes ahead of itself.
 *  - **the boulders** — opaque faceted ice on `LAYER.WORLD` (instanced): the
 *    world refracted through it along the bent ray, the sky mirrored on the
 *    facets by fresnel, a crust of snow on whichever facets face up *right now*
 *    (world-space, so it stays on top as the boulder tumbles — which is how
 *    snow packs on a rolling lump), fracture planes glinting inside, and hard
 *    specular glints off the sun.
 *  - **the drift** — a dense strip laid down the line behind the front and
 *    heaped where the wave breaks. Its height is a bank profile across, lumps,
 *    the ruts the boulders gouged (a uniform array of their lateral tracks) and
 *    the heap; the normal is taken by finite differences of that same height so
 *    the snow shading matches the shape exactly. The fragment adds micro-relief,
 *    a field of view-dependent glints (one per cell, most cells dark), and the
 *    melt: the snow darkens wet in patches and erodes away into the floor.
 *
 * Every material reads `settings.avalanche` in `userData.sync(state)`; `state`
 * carries only what the ability knows that the settings do not.
 */

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* -------------------------------------------------------------------- */
/* The front's shape — shared by the shell and its warp                 */
/* -------------------------------------------------------------------- */

/**
 * `frontPoint(u, v)` is the shell at parameter (u across -1..1, v over the
 * profile 0..1) in the front's local frame: +Z the way it rolls, +Y up, the
 * leading foot at the origin. `frontSurface` adds the billows along the
 * outward normal and returns the billow value for the fragment stage.
 */
const FRONT_GLSL = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;
  uniform float uDepth;
  uniform float uCurl;
  uniform float uTaper;
  uniform float uScale;      // rise × growth × break surge, all in one
  uniform float uBob;
  uniform float uBillow;
  uniform float uBillowScale;
  uniform float uRoll;       // radians the billows have rolled, integrated on the CPU
  uniform float uPhase;
  uniform float uSeed;

  vec3 frontPoint(float u, float v) {
    float taper = pow(max(1.0 - u * u, 0.0), max(uTaper, 0.05));
    float th = clamp(v, 0.0, 1.0) * 3.14159265;
    float s = sin(th);
    float H = uHeight * (0.22 + 0.78 * taper) * uScale * (1.0 + uBob);
    float D = uDepth * (0.55 + 0.45 * taper) * uScale;
    vec3 p;
    p.x = u * uWidth * uScale * (1.0 + 0.12 * s);
    p.y = pow(s, 0.85) * H;
    p.z = -D * 0.5 * (1.0 + cos(th));
    // The crest leans out over its own foot ...
    p.z += uCurl * D * s * s * smoothstep(0.3, 0.85, v);
    // ... and the flanks trail behind the middle: a crescent from above.
    p.z -= u * u * D * 0.4;
    return p;
  }

  /** The billow field, sampled in a domain that turns with the roll. */
  float billowAt(vec3 p) {
    float cy = uHeight * 0.45 * uScale;
    float cz = -uDepth * 0.5 * uScale;
    float y = p.y - cy;
    float z = p.z - cz;
    float c = cos(uRoll), s = sin(uRoll);
    vec3 q = vec3(p.x, y * c + z * s, -y * s + z * c);
    return fbm3(q * uBillowScale + vec3(uSeed, uPhase * 0.2, uSeed * 0.37));
  }

  vec3 frontSurface(float u, float v, out vec3 nrm, out float billow) {
    float e = 0.01;
    vec3 p0 = frontPoint(u, v);
    vec3 pu = frontPoint(u + e, v);
    vec3 pv = frontPoint(u, v + e);
    // The grid runs across then over, so dv × du points out of the wall.
    vec3 n = normalize(cross(pv - p0, pu - p0) + vec3(0.0, 1e-5, 0.0));
    float taper = pow(max(1.0 - u * u, 0.0), 0.5);
    float onWall = pow(sin(clamp(v, 0.0, 1.0) * 3.14159265), 0.6) * taper;
    billow = billowAt(p0) * 0.5 + 0.5;
    vec3 p = p0 + n * uBillow * billow * onWall;
    // Displace the neighbours the same way, so the normal sees the billows.
    float bu = billowAt(pu) * 0.5 + 0.5;
    float bv = billowAt(pv) * 0.5 + 0.5;
    vec3 qu = pu + n * uBillow * bu * onWall;
    vec3 qv = pv + n * uBillow * bv * onWall;
    nrm = normalize(cross(qv - p, qu - p) + n * 1e-4);
    return p;
  }
`;

const SHELL_VERTEX = /* glsl */ `
  varying vec2  vParam;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vBillow;
  varying float vViewZ;

  ${noiseGLSL}
  ${FRONT_GLSL}

  void main() {
    vec3 n;
    float b;
    vec3 p = frontSurface(position.x, position.y, n, b);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vParam = position.xy;
    vBillow = b;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHELL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uPhase;
  uniform float uOpacity;
  uniform float uDensity;
  uniform float uLight;
  uniform float uAmbient;
  uniform float uScatter;
  uniform float uErode;
  uniform float uErodeScale;
  uniform float uTipFade;
  uniform float uSoftFadeDist;
  uniform float uDissolve;
  uniform float uFade;
  uniform vec3  uColorLit;
  uniform vec3  uColorShadow;
  uniform vec3  uColorDeep;
  uniform vec3  uColorRim;
  uniform vec3  uLightDir;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vParam;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vBillow;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float ndv = abs(dot(N, V));

    // Dense face-on, thinning toward the silhouette — a volume, faked.
    float core = pow(clamp(ndv * 1.25, 0.0, 1.0), max(uDensity, 0.05) * 0.5);

    // Wisps: the silhouette is eaten by noise, so the edge is powder, not a line.
    float wisp = fbm3(vWorld * uErodeScale + vec3(0.0, -uPhase * 0.6, uSeed)) * 0.5 + 0.5;
    float edge = smoothstep(0.0, 0.45, ndv + (wisp - 0.5) * uErode * 0.9 - uErode * 0.12);

    // Flanks melt into the air rather than ending.
    float flank = 1.0 - smoothstep(1.0 - max(uTipFade, 0.01), 1.0, abs(vParam.x));

    // Collapsing: a noise threshold that takes the top first.
    float dn = fbm3(vWorld * 1.3 + vec3(uSeed, uTime * 0.7, 0.0)) * 0.5 + 0.5;
    dn = mix(dn, 1.0 - vParam.y * 0.5, 0.25);
    float thr = uDissolve * 1.2 - 0.1;
    float keep = uDissolve <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.18, dn);

    // Lit with a wrapped term: powder scatters, it does not have a terminator.
    float lit = clamp(dot(N, L) * 0.55 + 0.45, 0.0, 1.0) * uLight;
    vec3 base = mix(uColorShadow, uColorLit, clamp(lit, 0.0, 1.0));
    // The folds between billows sit in their own shade.
    base = mix(uColorDeep, base, smoothstep(0.1, 0.7, vBillow));
    base *= mix(uAmbient, 1.0, clamp(lit, 0.0, 1.0));

    // Thin edges glow with the light behind them.
    float back = clamp(dot(-L, V) * 0.5 + 0.5, 0.0, 1.0);
    vec3 rim = uColorRim * pow(1.0 - ndv, 2.0) * uScatter * (0.35 + 0.65 * back) * uShaderIntensity;

    vec3 color = (base + rim) * uGlobalGlow;

    float alpha = uOpacity * core * edge * flank * keep * uFade;
    if (alpha < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFadeDist);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

/** Shape uniforms shared by the shell and its warp. */
function frontUniforms() {
  return {
    uWidth: { value: 3 },
    uHeight: { value: 2.5 },
    uDepth: { value: 2.6 },
    uCurl: { value: 0.45 },
    uTaper: { value: 0.45 },
    uScale: { value: 1 },
    uBob: { value: 0 },
    uBillow: { value: 0.55 },
    uBillowScale: { value: 1.1 },
    uRoll: { value: 0 },
    uPhase: { value: 0 },
    uSeed: { value: 0 }
  };
}

function syncFront(u, state, grow = 1) {
  const c = settings.avalanche;
  const g = settings.global;
  u.uWidth.value = Math.max(0.2, c.frontWidth);
  u.uHeight.value = Math.max(0.2, c.frontHeight);
  u.uDepth.value = Math.max(0.2, c.frontDepth);
  u.uCurl.value = c.frontCurl;
  u.uTaper.value = c.frontTaper;
  u.uScale.value = Math.max(0.001, state.scale * grow);
  u.uBob.value = state.bob;
  u.uBillow.value = c.frontBillow * g.noiseStrength;
  u.uBillowScale.value = c.frontBillowScale * g.noiseFrequency;
  u.uRoll.value = state.roll;
  u.uPhase.value = state.phase;
  u.uSeed.value = state.seed;
}

/** The rolling wall of powder. Normal-blended soft shell. */
export function createAvalancheShellMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    // See `frontSurface`: the grid's winding faces into the wall.
    side: BackSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...frontUniforms(),
      uOpacity: { value: 0.9 },
      uDensity: { value: 1.4 },
      uLight: { value: 1 },
      uAmbient: { value: 0.55 },
      uScatter: { value: 0.6 },
      uErode: { value: 0.55 },
      uErodeScale: { value: 2.4 },
      uTipFade: { value: 0.4 },
      uSoftFadeDist: { value: 0.7 },
      uDissolve: { value: 0 },
      uFade: { value: 1 },
      uColorLit: { value: new Color() },
      uColorShadow: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: SHELL_VERTEX,
    fragmentShader: SHELL_FRAGMENT
  });

  /** @param {object} state { scale, bob, roll, phase, seed, dissolve, fade } */
  material.userData.sync = (state) => {
    const c = settings.avalanche;
    const g = settings.global;
    const u = material.uniforms;
    syncFront(u, state);
    u.uOpacity.value = c.shellOpacity * g.opacity;
    u.uDensity.value = c.shellDensity;
    u.uLight.value = c.shellLight;
    u.uAmbient.value = c.shellAmbient;
    u.uScatter.value = c.shellScatter * g.fresnel;
    u.uErode.value = c.shellErode * g.noiseStrength;
    u.uErodeScale.value = c.shellErodeScale * g.noiseFrequency;
    u.uTipFade.value = c.tipFade;
    u.uSoftFadeDist.value = c.shellSoftFade;
    u.uDissolve.value = state.dissolve;
    u.uFade.value = state.fade;
    u.uColorLit.value.copy(getColor(c.colorShellLit));
    u.uColorShadow.value.copy(getColor(c.colorShellShadow));
    u.uColorDeep.value.copy(getColor(c.colorShellDeep));
    u.uColorRim.value.copy(getColor(c.colorShellRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The shove — LAYER.DISTORTION                                         */
/* -------------------------------------------------------------------- */

const WARP_VERTEX = /* glsl */ `
  varying vec2 vParam;
  varying vec2 vNormalS;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  ${noiseGLSL}
  ${FRONT_GLSL}

  void main() {
    vec3 n;
    float b;
    vec3 p = frontSurface(position.x, position.y, n, b);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vParam = position.xy;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vNormalS = (viewMatrix * vec4(vNormalW, 0.0)).xy;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uNoiseScale;
  uniform float uNoiseSpeed;
  uniform float uShaderIntensity;

  varying vec2 vParam;
  varying vec2 vNormalS;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  ${noiseGLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = abs(dot(normalize(vNormalW), V));
    // Strongest across the silhouette, where the bent air is seen edge-on.
    float edge = pow(1.0 - ndv, 1.5);
    vec3 np = vWorld * uNoiseScale + vec3(0.0, -uTime * uNoiseSpeed, uTime * 0.3);
    vec2 n = vec2(snoise(np), snoise(np + vec3(13.1, 7.3, 3.9)));
    vec2 dir = normalize(vNormalS + 1e-5);
    vec2 offset = dir * 0.6 + n * 0.55;
    float flank = 1.0 - smoothstep(0.7, 1.0, abs(vParam.x));
    float foot = smoothstep(0.0, 0.15, vParam.y) * (1.0 - smoothstep(0.85, 1.0, vParam.y));
    float strength = uStrength * uShaderIntensity * edge * flank * foot;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(offset, -1.0, 1.0) * 0.5 + 0.5, strength, flank * foot);
  }
`;

export function createAvalancheWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: BackSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...frontUniforms(),
      uStrength: { value: 0.7 },
      uNoiseScale: { value: 1.4 },
      uNoiseSpeed: { value: 2.2 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} state the shell's state plus { strength } */
  material.userData.sync = (state) => {
    const c = settings.avalanche;
    const g = settings.global;
    const u = material.uniforms;
    syncFront(u, state, Math.max(1, c.warpGrow));
    u.uStrength.value = c.warpStrength * g.distortion * state.strength;
    u.uNoiseScale.value = c.warpScale * g.noiseFrequency;
    u.uNoiseSpeed.value = c.warpSpeed * g.noiseSpeed;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The boulders                                                         */
/* -------------------------------------------------------------------- */

const BOULDER_VERTEX = /* glsl */ `
  attribute float aSeed;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vSeed;

  void main() {
    vLocal = position;
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

const BOULDER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIOR;
  uniform float uRefract;
  uniform float uReflect;
  uniform float uFresnel;
  uniform float uFresnelPower;
  uniform float uFrost;
  uniform float uFrostScale;
  uniform float uCracks;
  uniform float uCrackScale;
  uniform float uSparkle;
  uniform float uSparkleSharp;
  uniform float uInner;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorRim;
  uniform vec3  uColorFrost;
  uniform vec3  uColorInner;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uHasEnv;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vSeed;

  ${noiseGLSL}
  ${ENV_GLSL}

  vec3 env(vec3 dir) {
    return uHasEnv > 0.5 ? texture2D(uEnvMap, equirectUv(dir)).rgb : vec3(0.12, 0.18, 0.3);
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // Deep at the heart, paler toward the faces it is seen through.
    vec3 body = mix(uColorDeep, uColorBody, 0.35 + 0.65 * ndv);

    // The world bent through it, and the sky mirrored on it.
    vec3 T = refract(-V, N, 1.0 / max(uIOR, 1.0));
    vec3 through = env(T);
    vec3 R = reflect(-V, N);
    vec3 mirror = env(R);
    float fres = pow(1.0 - ndv, max(uFresnelPower, 0.5));
    vec3 color = body * (0.3 + through * uRefract);
    color += mirror * uReflect * (0.15 + 0.85 * fres);

    // Fracture planes inside, catching the light at their own angle.
    vec2 cell = voronoi2(vLocal.xz * uCrackScale + vLocal.y * 1.7 + vSeed * 9.0);
    float crack = 1.0 - smoothstep(0.0, 0.07, cell.x - 0.03);
    color += uColorInner * crack * uCracks * (0.4 + 0.6 * ndv) * uGlobalGlow;
    color += uColorInner * uInner * (0.3 + 0.7 * ndv) * uGlobalGlow;

    // Snow packed on whichever facets face up right now.
    float up = clamp(N.y, 0.0, 1.0);
    float crustN = fbm3(vLocal * uFrostScale + vSeed * 3.0) * 0.5 + 0.5;
    float crust = smoothstep(0.35, 0.7, up * 0.8 + crustN * 0.5) * uFrost;
    float lambert = clamp(dot(N, L) * 0.6 + 0.4, 0.0, 1.0);
    color = mix(color, uColorFrost * (0.45 + 0.55 * lambert), clamp(crust, 0.0, 1.0));

    // Rim and hard glints off the facets.
    color += uColorRim * fres * uFresnel * 0.5 * uGlobalGlow;
    float glint = pow(clamp(dot(R, L), 0.0, 1.0), max(uSparkleSharp, 1.0));
    color += vec3(glint) * uSparkle * (1.0 - crust * 0.6);

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Faceted ice. Opaque; InstancedMesh on LAYER.WORLD. */
export function createAvalancheBoulderMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uHasEnv: { value: 0 },
      uIOR: { value: 1.31 },
      uRefract: { value: 0.9 },
      uReflect: { value: 0.55 },
      uFresnel: { value: 2 },
      uFresnelPower: { value: 3 },
      uFrost: { value: 0.7 },
      uFrostScale: { value: 3 },
      uCracks: { value: 0.6 },
      uCrackScale: { value: 2.6 },
      uSparkle: { value: 3 },
      uSparkleSharp: { value: 90 },
      uInner: { value: 0.45 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorFrost: { value: new Color() },
      uColorInner: { value: new Color() }
    }),
    vertexShader: BOULDER_VERTEX,
    fragmentShader: BOULDER_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings.avalanche;
    const g = settings.global;
    const u = material.uniforms;
    u.uHasEnv.value = frame.uEnvMap.value ? 1 : 0;
    u.uIOR.value = c.iceIOR;
    u.uRefract.value = c.iceRefract;
    u.uReflect.value = c.iceReflect;
    u.uFresnel.value = c.iceFresnel * g.fresnel;
    u.uFresnelPower.value = c.iceFresnelPower;
    u.uFrost.value = c.iceFrost;
    u.uFrostScale.value = c.iceFrostScale * g.noiseFrequency;
    u.uCracks.value = c.iceCracks * g.shaderIntensity;
    u.uCrackScale.value = c.iceCrackScale;
    u.uSparkle.value = c.iceSparkle * g.shaderIntensity;
    u.uSparkleSharp.value = c.iceSparkleSharp;
    u.uInner.value = c.iceInner * g.glow;
    u.uColorDeep.value.copy(getColor(c.colorIceDeep));
    u.uColorBody.value.copy(getColor(c.colorIceBody));
    u.uColorRim.value.copy(getColor(c.colorIceRim));
    u.uColorFrost.value.copy(getColor(c.colorIceFrost));
    u.uColorInner.value.copy(getColor(c.colorIceInner));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The drift                                                            */
/* -------------------------------------------------------------------- */

/** Ruts the boulders gouged — one lateral track each. Must match the ability. */
export const MAX_RUTS = 10;

const DRIFT_HEIGHT_GLSL = /* glsl */ `
  uniform float uLength;      // metres the strip runs
  uniform float uWidth;       // half-width of the drift
  uniform float uHeight;
  uniform float uEdge;
  uniform float uStartAt;     // metres before the drift begins
  uniform float uLaid;        // metres of drift laid so far
  uniform float uNoiseAmp;
  uniform float uNoiseScale;
  uniform float uRutDepth;
  uniform float uRutWidth;
  uniform float uRuts[${MAX_RUTS}];
  uniform float uRutCount;
  uniform vec2  uHeapAt;      // (across, along) of the heap
  uniform float uHeapHeight;  // already × how far the heap has piled
  uniform float uHeapRadius;
  uniform float uMelt;        // 0..1 through the melt
  uniform float uSeed;

  /** Snow depth at (a across, s along), metres. */
  float driftHeight(float a, float s) {
    // The banks wander along the line (and differ side to side), so the
    // drift reads as poured snow rather than a laid-down strip.
    float wander = 0.22 * snoise(vec3(s * 0.35, sign(a) * 2.7, uSeed + 1.3))
                 + 0.08 * snoise(vec3(s * 1.4, sign(a) * 5.1, uSeed));
    float w = max(uWidth * (1.0 + wander), 0.05);
    float x = abs(a) / w;
    float bank = 1.0 - smoothstep(1.0 - clamp(uEdge, 0.02, 1.0), 1.0, x);
    float crown = 0.75 + 0.25 * cos(min(x, 1.0) * 1.5707963);
    float h = uHeight * bank * crown;
    // A fresh, thick lip right behind the front; nothing yet ahead of it.
    float laid = 1.0 - smoothstep(uLaid - 0.6, uLaid, s);
    float start = smoothstep(uStartAt, uStartAt + 1.6, s);
    h *= laid * start * (1.0 + 0.35 * exp(-max(uLaid - s, 0.0) * 1.2));
    // Lumps, never quite even.
    h += uNoiseAmp * fbm3(vec3(a * uNoiseScale, s * uNoiseScale * 0.6, uSeed)) * bank * laid * start;
    // The tracks the boulders cut.
    for (int i = 0; i < ${MAX_RUTS}; i++) {
      if (float(i) >= uRutCount) break;
      float d = (a - uRuts[i]) / max(uRutWidth, 0.02);
      float wob = 0.6 + 0.4 * snoise(vec3(s * 0.7, float(i) * 3.1, uSeed));
      h -= uRutDepth * exp(-d * d * 1.6) * wob * laid * start;
    }
    // The heap where the wave broke.
    vec2 hd = (vec2(a, s) - uHeapAt) / max(uHeapRadius, 0.1);
    float heapN = 0.75 + 0.25 * snoise(vec3(a * 0.9, s * 0.9, uSeed + 4.0));
    h += uHeapHeight * exp(-dot(hd, hd) * 1.8) * heapN;
    // Melting slumps it.
    h *= 1.0 - 0.8 * uMelt;
    return max(h, 0.0);
  }
`;

const DRIFT_VERTEX = /* glsl */ `
  uniform vec3 uStart;
  uniform vec3 uDir;
  uniform vec3 uSide;

  varying vec2  vFlat;        // (across, along) metres
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vHeight;

  ${noiseGLSL}
  ${DRIFT_HEIGHT_GLSL}

  void main() {
    float a = position.x * (uWidth + uHeapRadius) * 2.0;
    float s = (position.y + 0.5) * uLength;
    float h = driftHeight(a, s);
    float e = 0.08;
    float ha = driftHeight(a + e, s);
    float hs = driftHeight(a, s + e);
    // Tangents in (side, up, dir) → world.
    vec3 ta = uSide * e + vec3(0.0, ha - h, 0.0);
    vec3 ts = uDir * e + vec3(0.0, hs - h, 0.0);
    vec3 n = normalize(cross(ts, ta));
    if (n.y < 0.0) n = -n;
    vec3 world = uStart + uSide * a + uDir * s;
    world.y = h + 0.006;
    vFlat = vec2(a, s);
    vWorld = world;
    vNormalW = n;
    vHeight = h;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const DRIFT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uLight;
  uniform float uAmbient;
  uniform float uSparkle;
  uniform float uSparkleDensity;
  uniform float uSparkleCut;
  uniform float uMeltErode;
  uniform float uMeltWet;
  uniform float uOpacity;
  uniform vec3  uColorLit;
  uniform vec3  uColorShadow;
  uniform vec3  uColorWet;
  uniform vec3  uColorSparkle;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec2  vFlat;
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vHeight;

  ${noiseGLSL}
  ${DRIFT_HEIGHT_GLSL}

  void main() {
    if (vFlat.y < 0.0 || vHeight < 0.002) discard;

    // Micro-relief: wind-packed ripples the vertex grid is too coarse for.
    vec3 N = normalize(vNormalW);
    vec3 mp = vec3(vWorld.xz * 3.2, uSeed);
    float m0 = snoise(mp);
    N = normalize(N + vec3(snoise(mp + vec3(0.13, 0.0, 0.0)) - m0, 0.0, snoise(mp + vec3(0.0, 0.13, 0.0)) - m0) * 2.2);

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float ndl = clamp(dot(N, L) * 0.7 + 0.3, 0.0, 1.0);
    vec3 col = mix(uColorShadow, uColorLit, clamp(ndl * uLight, 0.0, 1.0));
    col *= mix(uAmbient, 1.0, ndl);

    // Glints: one candidate per cell, most cells dark, each with its own facet.
    vec2 g = vWorld.xz * uSparkleDensity;
    vec2 cell = floor(g);
    float h = hash13(vec3(cell, uSeed));
    if (h > uSparkleCut) {
      vec3 jitter = hash31(h * 91.7) * 2.0 - 1.0;
      vec3 Nj = normalize(vec3(0.0, 1.0, 0.0) + jitter * 0.9);
      float dotR = clamp(dot(reflect(-V, Nj), L), 0.0, 1.0);
      float twinkle = pow(dotR, 24.0) + pow(clamp(dot(Nj, V), 0.0, 1.0), 40.0) * 0.6;
      float spot = 1.0 - smoothstep(0.08, 0.3, length(fract(g) - 0.5));
      col += uColorSparkle * twinkle * spot * uSparkle * uGlobalGlow * (1.0 - uMelt);
    }

    // The melt: wet and dark in patches, then gone into the floor.
    float mn = fbm3(vec3(vWorld.xz * 0.7, uSeed * 2.0)) * 0.5 + 0.5;
    float patchy = mix(0.5, mn, uMeltErode);
    float wet = smoothstep(0.0, 0.7, uMelt * 1.3 - (1.0 - patchy) * 0.4) * uMeltWet;
    col = mix(col, uColorWet * (0.6 + 0.4 * ndl), clamp(wet, 0.0, 1.0));
    float thr = uMelt * 1.15 - 0.1;
    float keep = uMelt <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, patchy);

    float alpha = smoothstep(0.002, 0.05, vHeight) * keep * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The packed-snow drift. Writes depth so a buried body stays buried. */
export function createAvalancheDriftMaterial() {
  const ruts = [];
  for (let i = 0; i < MAX_RUTS; i++) ruts.push(0);
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uWidth: { value: 2.7 },
      uHeight: { value: 0.3 },
      uEdge: { value: 0.55 },
      uStartAt: { value: 1 },
      uLaid: { value: 0 },
      uNoiseAmp: { value: 0.1 },
      uNoiseScale: { value: 0.9 },
      uRutDepth: { value: 0.12 },
      uRutWidth: { value: 0.24 },
      uRuts: { value: ruts },
      uRutCount: { value: 0 },
      uHeapAt: { value: new Vector2() },
      uHeapHeight: { value: 0 },
      uHeapRadius: { value: 2.6 },
      uMelt: { value: 0 },
      uSeed: { value: 0 },
      uLight: { value: 1 },
      uAmbient: { value: 0.5 },
      uSparkle: { value: 2.4 },
      uSparkleDensity: { value: 38 },
      uSparkleCut: { value: 0.9 },
      uMeltErode: { value: 0.7 },
      uMeltWet: { value: 0.65 },
      uOpacity: { value: 1 },
      uColorLit: { value: new Color() },
      uColorShadow: { value: new Color() },
      uColorWet: { value: new Color() },
      uColorSparkle: { value: new Color() }
    }),
    vertexShader: DRIFT_VERTEX,
    fragmentShader: DRIFT_FRAGMENT
  });

  /**
   * @param {object} state { start, dir, side, length, laid, ruts (Float32Array),
   *   rutCount, heapAcross, heapAlong, heap (0..1), melt, seed }
   */
  material.userData.sync = (state) => {
    const c = settings.avalanche;
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.5, state.length);
    u.uWidth.value = Math.max(0.1, c.driftWidth);
    u.uHeight.value = c.driftHeight;
    u.uEdge.value = c.driftEdge;
    u.uStartAt.value = c.driftStart;
    u.uLaid.value = state.laid;
    u.uNoiseAmp.value = c.driftNoise * g.noiseStrength;
    u.uNoiseScale.value = c.driftNoiseScale * g.noiseFrequency;
    u.uRutDepth.value = c.rutDepth;
    u.uRutWidth.value = c.rutWidth;
    const n = Math.min(MAX_RUTS, state.rutCount);
    for (let i = 0; i < n; i++) u.uRuts.value[i] = state.ruts[i];
    u.uRutCount.value = n;
    u.uHeapAt.value.set(state.heapAcross, state.heapAlong);
    u.uHeapHeight.value = c.heapHeight * state.heap;
    u.uHeapRadius.value = Math.max(0.2, c.heapRadius);
    u.uMelt.value = state.melt;
    u.uSeed.value = state.seed;
    u.uLight.value = c.driftLight;
    u.uAmbient.value = c.driftAmbient;
    u.uSparkle.value = c.driftSparkle * g.shaderIntensity;
    u.uSparkleDensity.value = Math.max(1, c.driftSparkleDensity);
    u.uSparkleCut.value = c.driftSparkleCut;
    u.uMeltErode.value = c.meltErode;
    u.uMeltWet.value = c.meltWet;
    u.uOpacity.value = g.opacity;
    u.uColorLit.value.copy(getColor(c.colorDriftLit));
    u.uColorShadow.value.copy(getColor(c.colorDriftShadow));
    u.uColorWet.value.copy(getColor(c.colorDriftWet));
    u.uColorSparkle.value.copy(getColor(c.colorDriftSparkle));
  };

  return material;
}
