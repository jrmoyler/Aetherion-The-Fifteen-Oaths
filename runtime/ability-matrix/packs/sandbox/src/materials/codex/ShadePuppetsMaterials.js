import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Shade Puppets — the bespoke shaders the marionette show is drawn with.
 *
 *  - **the puppets** — one instanced draw of a carved spindle for every body
 *    part of every marionette. Ink-black lacquer with a violet fresnel rim,
 *    fine carved grain rings, and *glowing pivots*: every joint burns
 *    violet-white where two parts meet, so the figure reads as a jointed
 *    puppet even in silhouette. Each instance carries its own dissolve; a
 *    puppet crumbles into ink from the feet up.
 *  - **the crown** — the puppeteer's control: obsidian, flat-faceted, a cold
 *    violet rim, veins of light pulsing up its thorns.
 *  - **the strings** — every string in one draw: camera-facing hairlines
 *    looked up by index from two uniform tables, sagging with slack, humming
 *    with vibration, tension pulses running down them; additive, bright.
 *  - **the spotlight** — an open cone from the crown down onto the circle, a
 *    soft volumetric shaft of pale light with dust drifting in it.
 *  - **the stage** — a ground quad: the circle drawn as a theatre's ring — a
 *    shadowed floor, a double footlight ring at the rim with lamp beads round
 *    it, inky pools opening under each puppet, and, at the end, an ink splat
 *    where they fell.
 *  - **the slump warp** — a flat ring on `LAYER.DISTORTION` thrown out when
 *    the puppets hit the floor.
 *
 * Every material reads `settings.shadepuppet` in `userData.sync(state)`.
 */

const ID = 'shadepuppet';
/** Three strings for each of up to eight puppets, and the master string to the caster's hand. */
export const MAX_STRINGS = 25;
export const MAX_POOLS = 8;

/* -------------------------------------------------------------------- */
/* The puppets                                                          */
/* -------------------------------------------------------------------- */

const PUPPET_VERTEX = /* glsl */ `
  attribute vec2 aState;      // x: dissolve 0..1, y: seed

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vY;
  varying vec2  vState;

  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * normal);
    vY = position.y;
    vState = aState;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PUPPET_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uRimGlow;
  uniform float uJointGlow;
  uniform float uGrain;
  uniform float uGloss;
  uniform float uEdge;
  uniform vec3  uColorBody;
  uniform vec3  uColorRim;
  uniform vec3  uColorJoint;
  uniform vec3  uColorEdge;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vY;
  varying vec2  vState;

  ${noiseGLSL}

  void main() {
    // Crumbling into ink from the floor up.
    float n = snoise(vWorld * 4.0 + vState.y * 13.0) * 0.5 + 0.5;
    float field = n * 0.6 + clamp(vWorld.y / 2.4, 0.0, 1.0) * 0.4;
    float d = vState.x;
    if (d > 0.0 && field < d * 1.1) discard;
    float edge = d > 0.0 ? 1.0 - smoothstep(0.0, uEdge, field - d * 1.1) : 0.0;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float diff = max(dot(N, L), 0.0) * 0.5 + 0.5;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 40.0) * uGloss;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);

    // carved grain: fine rings round each part
    float grain = 0.5 + 0.5 * sin(vY * 46.0 + snoise(vWorld * 6.0) * 2.5);
    grain = pow(grain, 6.0) * uGrain;
    // the pivots burn where two parts meet
    float joint = exp(-pow(vY / 0.09, 2.0)) + exp(-pow((1.0 - vY) / 0.09, 2.0));

    vec3 col = uColorBody * diff * (1.0 - grain * 0.6);
    col += vec3(spec) * 0.6;
    col += uColorRim * fres * uRimGlow * uGlobalGlow;
    col += uColorJoint * joint * uJointGlow * uGlobalGlow * uShaderIntensity;
    col += uColorEdge * edge * 3.0 * uGlobalGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The marionettes: ink lacquer, a violet rim and burning pivots. */
export function createPuppetMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRimGlow: { value: 1.5 },
      uJointGlow: { value: 2.5 },
      uGrain: { value: 0.5 },
      uGloss: { value: 0.6 },
      uEdge: { value: 0.08 },
      uColorBody: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorJoint: { value: new Color() },
      uColorEdge: { value: new Color() }
    }),
    vertexShader: PUPPET_VERTEX,
    fragmentShader: PUPPET_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uRimGlow.value = c.puppetRimGlow * g.fresnel;
    u.uJointGlow.value = c.jointGlow * g.glow;
    u.uGrain.value = c.grain;
    u.uGloss.value = c.lacquer;
    u.uEdge.value = c.crumbleEdge;
    u.uColorBody.value.copy(getColor(c.colorPuppetBody));
    u.uColorRim.value.copy(getColor(c.colorPuppetRim));
    u.uColorJoint.value.copy(getColor(c.colorJoint));
    u.uColorEdge.value.copy(getColor(c.colorCrumbleEdge));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The crown                                                            */
/* -------------------------------------------------------------------- */

const CROWN_VERTEX = /* glsl */ `
  attribute float aPart;
  attribute float aTip;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vPart;
  varying float vTip;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vLocal = position;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vPart = aPart;
    vTip = aTip;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CROWN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uRimGlow;
  uniform float uVeinGlow;
  uniform float uTipGlow;
  uniform float uPulse;       // integrated vein pulse
  uniform float uFade;
  uniform vec3  uColorBody;
  uniform vec3  uColorRim;
  uniform vec3  uColorVein;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vPart;
  varying float vTip;

  ${noiseGLSL}

  void main() {
    // shattering upward at the end
    float n = snoise(vLocal * 5.0 + uSeed) * 0.5 + 0.5;
    if (uFade < 1.0 && n > uFade) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float diff = max(dot(N, L), 0.0) * 0.6 + 0.4;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 50.0);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);
    float a = atan(vLocal.z, vLocal.x);
    float vein = 1.0 - abs(snoise(vec3(cos(a) * 3.0, vLocal.y * 4.0 - uPulse, sin(a) * 3.0 + uSeed)));
    vein = pow(vein, 10.0);
    vec3 col = uColorBody * diff + vec3(spec) * 0.5;
    col += uColorRim * fres * uRimGlow * uGlobalGlow;
    col += uColorVein * (vein * uVeinGlow + vPart * pow(vTip, 3.0) * uTipGlow) * uGlobalGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The puppeteer's crown. */
export function createCrownMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uRimGlow: { value: 1.5 },
      uVeinGlow: { value: 2 },
      uTipGlow: { value: 3 },
      uPulse: { value: 0 },
      uFade: { value: 1 },
      uColorBody: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorVein: { value: new Color() }
    }),
    vertexShader: CROWN_VERTEX,
    fragmentShader: CROWN_FRAGMENT
  });

  /** @param {object} state { pulse, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = state.seed;
    u.uRimGlow.value = c.crownRimGlow * g.fresnel;
    u.uVeinGlow.value = c.crownVeinGlow * g.glow;
    u.uTipGlow.value = c.crownTipGlow * g.glow;
    u.uPulse.value = state.pulse;
    u.uFade.value = state.fade;
    u.uColorBody.value.copy(getColor(c.colorCrownBody));
    u.uColorRim.value.copy(getColor(c.colorCrownRim));
    u.uColorVein.value.copy(getColor(c.colorCrownVein));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The strings                                                          */
/* -------------------------------------------------------------------- */

const STRING_VERTEX = /* glsl */ `
  uniform vec4  uA[${MAX_STRINGS}];   // crown end (xyz), opacity (w)
  uniform vec4  uB[${MAX_STRINGS}];   // puppet end (xyz), slack (w)
  uniform float uWidth;
  uniform float uSag;
  uniform float uVib;
  uniform float uTime;

  attribute float aIdx;

  varying vec2  vRib;
  varying float vIdx;
  varying float vAlpha;

  void main() {
    int i = int(aIdx + 0.5);
    vec3 A = uA[i].xyz;
    vec3 B = uB[i].xyz;
    float t = position.x;
    vec3 base = mix(A, B, t);
    float hang = sin(3.14159265 * t);
    // slack sags; tension hums
    base.y -= uSag * uB[i].w * hang;
    vec3 dir = normalize(B - A + vec3(0.0, 1e-4, 0.0));
    vec3 toCam = normalize(cameraPosition - base);
    vec3 axis = normalize(cross(dir, toCam) + vec3(1e-4, 0.0, 0.0));
    base += axis * uVib * hang * sin(t * 18.0 - uTime * 40.0 + aIdx * 2.1) * (1.0 - uB[i].w);
    vec3 world = base + axis * position.y * uWidth;
    vRib = vec2(t, position.y);
    vIdx = aIdx;
    vAlpha = uA[i].w;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const STRING_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uPulseGlow;
  uniform float uPulseRate;
  uniform vec3  uColorCore;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;

  varying vec2  vRib;
  varying float vIdx;
  varying float vAlpha;

  void main() {
    if (vAlpha <= 0.002) discard;
    float y = abs(vRib.y);
    float core = exp(-y * y * 18.0);
    float halo = exp(-y * 3.0) * 0.35;
    // tension pulses running crown → puppet
    float pulse = pow(0.5 + 0.5 * sin(vRib.x * 14.0 - uTime * uPulseRate + vIdx * 1.7), 10.0);
    float ends = smoothstep(0.0, 0.03, vRib.x) * smoothstep(1.0, 0.97, vRib.x);
    vec3 col = (uColorCore * core + uColorHalo * halo) * uGlow * (1.0 + pulse * uPulseGlow);
    float a = (core + halo) * ends * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlobalGlow, a);
  }
`;

/** Every string in one additive draw. */
export function createStringsMaterial() {
  const A = [];
  const B = [];
  for (let i = 0; i < MAX_STRINGS; i++) {
    A.push(new Vector4(0, 0, 0, 0));
    B.push(new Vector4(0, 0, 0, 0));
  }
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uA: { value: A },
      uB: { value: B },
      uWidth: { value: 0.02 },
      uSag: { value: 0.3 },
      uVib: { value: 0.02 },
      uGlow: { value: 3 },
      uPulseGlow: { value: 2 },
      uPulseRate: { value: 8 },
      uColorCore: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: STRING_VERTEX,
    fragmentShader: STRING_FRAGMENT
  });

  /** Endpoints are written straight into `uniforms.uA/uB` by the ability. */
  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = Math.max(0.002, c.stringWidth);
    u.uSag.value = c.stringSag;
    u.uVib.value = c.stringHum * g.noiseStrength;
    u.uGlow.value = c.stringGlow * g.glow;
    u.uPulseGlow.value = c.stringPulseGlow;
    u.uPulseRate.value = c.stringPulseRate * g.noiseSpeed;
    u.uColorCore.value.copy(getColor(c.colorStringCore));
    u.uColorHalo.value.copy(getColor(c.colorStringHalo));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The spotlight                                                        */
/* -------------------------------------------------------------------- */

const CONE_VERTEX = /* glsl */ `
  uniform vec3  uApex;
  uniform vec3  uBase;
  uniform float uRadius;
  uniform float uApexR;
  varying vec2  vC;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;
  void main() {
    float v = position.x;
    float a = position.y * 6.2831853;
    vec3 c = mix(uApex, uBase, v);
    float r = mix(uApexR, uRadius, v);
    vec3 radial = vec3(cos(a), 0.0, sin(a));
    vec3 world = c + radial * r;
    vC = vec2(v, position.y);
    vNormalW = radial;
    vWorld = world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const CONE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uDust;
  uniform vec3  uColor;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float uGlobalGlow;
  varying vec2  vC;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    // A shaft: thickest where you look straight through it.
    float through = pow(abs(dot(normalize(vNormalW), V)), 1.6);
    float dust = 0.6 + 0.4 * fbm3(vec3(vWorld.x * 1.5, vWorld.y * 1.5 + uTime * 0.4, vWorld.z * 1.5 + uSeed));
    dust = mix(1.0, dust, uDust);
    float fall = mix(1.0, 0.45, vC.x);
    float m = through * dust * fall * smoothstep(0.0, 0.08, vC.x) * uIntensity;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    m *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.6);
    if (m < 0.002) discard;
    gl_FragColor = vec4(uColor * m * uGlobalGlow, m);
  }
`;

/** The shaft of light from the crown onto the circle. */
export function createSpotlightMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uApex: { value: new Vector3() },
      uBase: { value: new Vector3() },
      uRadius: { value: 4 },
      uApexR: { value: 0.6 },
      uSeed: { value: 0 },
      uIntensity: { value: 0 },
      uDust: { value: 0.6 },
      uColor: { value: new Color() }
    }),
    vertexShader: CONE_VERTEX,
    fragmentShader: CONE_FRAGMENT
  });

  /** @param {object} state { apex, base, apexR, intensity, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const u = material.uniforms;
    u.uApex.value.copy(state.apex);
    u.uBase.value.copy(state.base);
    u.uRadius.value = Math.max(0.1, c.zoneRadius * c.spotSpread);
    u.uApexR.value = state.apexR;
    u.uSeed.value = state.seed;
    u.uIntensity.value = state.intensity * c.spotIntensity * settings.global.opacity;
    u.uDust.value = c.spotDust;
    u.uColor.value.copy(getColor(c.colorSpot));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The stage                                                            */
/* -------------------------------------------------------------------- */

const FLAT_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    vP = position.xy * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const STAGE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;
  uniform float uOpen;        // 0..1 the stage drawing itself
  uniform float uShade;       // how dark the floor inside goes
  uniform float uRingGlow;
  uniform float uLamps;
  uniform float uLampGlow;
  uniform vec3  uPools[${MAX_POOLS}];   // xy: centre (relative), z: radius
  uniform float uSplat;       // radius of the ink splat in the middle
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorShade;
  uniform vec3  uColorRing;
  uniform vec3  uColorPool;
  uniform vec3  uColorPoolRim;
  uniform float uGlobalGlow;
  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    float a = atan(vP.y, vP.x);
    vec2 ca = vec2(cos(a), sin(a));
    // The ring draws itself round, from the near side.
    float drawn = step(fract(a / 6.2831853 + 0.25), uOpen);

    float inside = 1.0 - smoothstep(uRadius - 0.1, uRadius, r);
    float ring1 = exp(-pow((r - uRadius) / 0.04, 2.0));
    float ring2 = exp(-pow((r - uRadius * 0.93) / 0.025, 2.0)) * 0.6;
    float lampA = fract(a / 6.2831853 * uLamps);
    float lamp = exp(-pow((r - uRadius * 0.965) / 0.06, 2.0)) * exp(-pow((lampA - 0.5) / 0.08, 2.0));
    float flick = 0.75 + 0.25 * snoise(vec3(floor(a / 6.2831853 * uLamps), uTime * 3.0, uSeed));

    // pools of ink opening under the puppets
    float pool = 0.0;
    float poolRim = 0.0;
    for (int i = 0; i < ${MAX_POOLS}; i++) {
      vec3 pl = uPools[i];
      if (pl.z <= 0.001) continue;
      vec2 q = vP - pl.xy;
      float qa = atan(q.y, q.x);
      float pr = pl.z * (1.0 + 0.25 * snoise(vec3(cos(qa) * 2.0, sin(qa) * 2.0, uSeed + float(i))));
      float d = length(q);
      pool = max(pool, 1.0 - smoothstep(pr * 0.8, pr, d));
      poolRim = max(poolRim, exp(-pow((d - pr * 0.9) / 0.06, 2.0)));
    }
    float sn = snoise(vec3(ca * 2.5, uSeed + 9.0)) * 0.3 + fbm3(vec3(vP * 1.8, uSeed)) * 0.2;
    float splat = uSplat <= 0.0 ? 0.0 : 1.0 - smoothstep(uSplat * (0.8 + sn) - 0.15, uSplat * (0.8 + sn), r);
    pool = max(pool, splat);

    vec3 col = uColorShade;
    float alpha = inside * uShade * uOpen;
    col = mix(col, uColorPool, pool);
    alpha = max(alpha, pool);
    vec3 glow = uColorRing * ((ring1 + ring2) * uRingGlow + lamp * uLampGlow * flick) * drawn
              + uColorPoolRim * poolRim * uRingGlow * 0.8;
    col += glow * uGlobalGlow;
    alpha = max(alpha, clamp((ring1 + ring2 + lamp) * drawn + poolRim, 0.0, 1.0));

    float n = snoise(vec3(vP * 1.4, uSeed * 4.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, n);
    alpha *= vis * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The stage: shadowed floor, footlight ring, ink pools, the splat. */
export function createStageMaterial() {
  const pools = [];
  for (let i = 0; i < MAX_POOLS; i++) pools.push(new Vector3(0, 0, 0));
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
      uSize: { value: 5 },
      uSeed: { value: 0 },
      uRadius: { value: 4 },
      uOpen: { value: 0 },
      uShade: { value: 0.5 },
      uRingGlow: { value: 2 },
      uLamps: { value: 16 },
      uLampGlow: { value: 3 },
      uPools: { value: pools },
      uSplat: { value: 0 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorShade: { value: new Color() },
      uColorRing: { value: new Color() },
      uColorPool: { value: new Color() },
      uColorPoolRim: { value: new Color() }
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: STAGE_FRAGMENT
  });

  /** @param {object} state { center, open, splat, fadeT, seed } — pools are written into `uniforms.uPools` directly. */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.5, c.zoneRadius * 1.15);
    u.uSeed.value = state.seed;
    u.uRadius.value = Math.max(0.2, c.zoneRadius);
    u.uOpen.value = state.open;
    u.uShade.value = c.stageShade;
    u.uRingGlow.value = c.ringGlow * g.glow;
    u.uLamps.value = Math.max(1, Math.round(c.footlights));
    u.uLampGlow.value = c.footlightGlow * g.glow;
    u.uSplat.value = state.splat;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorShade.value.copy(getColor(c.colorStageShade));
    u.uColorRing.value.copy(getColor(c.colorRing));
    u.uColorPool.value.copy(getColor(c.colorInk));
    u.uColorPoolRim.value.copy(getColor(c.colorPoolRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The slump warp — LAYER.DISTORTION                                    */
/* -------------------------------------------------------------------- */

const SLUMP_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uStrength;
  uniform float uShaderIntensity;
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vec2 q = vP / max(uSize, 0.01);
    float r = length(q);
    if (r > 1.0) discard;
    float R = 0.05 + 0.92 * uProgress;
    float d = (r - R) / 0.08;
    float slope = -d * exp(-d * d);
    vec2 dir = q / max(r, 1e-4);
    float mask = exp(-d * d) * (1.0 - uProgress);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * clamp(slope * 2.0, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** The thump in the air when the puppets hit the floor. */
export function createSlumpWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 5 },
      uProgress: { value: 0 },
      uStrength: { value: 0 }
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: SLUMP_FRAGMENT
  });

  /** @param {object} state { center, progress } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.2, c.zoneRadius * 1.3);
    u.uProgress.value = state.progress;
    u.uStrength.value = c.slumpWarp * g.distortion;
  };

  return material;
}
