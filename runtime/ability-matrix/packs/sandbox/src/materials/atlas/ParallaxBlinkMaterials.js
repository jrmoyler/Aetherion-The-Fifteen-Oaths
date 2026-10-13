import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { SKINNING_PARS, SKINNING_MAIN } from '../../assets/atlas/ChronoRecallRig.js';

/**
 * The five bespoke surfaces of the Parallax Blink.
 *
 *   - `createParallaxIrisMaterial`   — the aperture: N curved blades in
 *     brushed chrome, each with its own tilted normal so the sky slides across
 *     them separately, a pinwheel of seams with contact shadows, a hot blue
 *     lip on the aperture edge, and — through the opening — a **parallax
 *     tunnel**: four layers of rings and swirl, each shifted by the view
 *     direction by its own depth, so the portal reads as a bore going *into*
 *     the disc rather than a picture painted on it.
 *   - `createParallaxBezelMaterial`  — the machined housing ring: chrome off
 *     the environment map, an engraved groove and a chase of blue indicator
 *     lights round its face.
 *   - `createParallaxRingMaterial`   — the corridor hoops: thin, additive,
 *     segmented, carrying the transit pulse.
 *   - `createParallaxBodyMaterial`   — the caster's double: lit with the
 *     skin's own colour map so it *is* the caster, then taken apart
 *     nearest-the-iris first — the dissolving edge glows, and the vertices
 *     behind it are dragged and spun into the iris. Run backward at the exit,
 *     it is the reassembly.
 *   - `createParallaxWarpMaterial`   — LAYER.DISTORTION: an iris-shaped
 *     (N-gon) ripple that pulls in at the entry and pushes out at the exit.
 *
 * All read `settings.parallax` through `userData.sync`, every frame.
 */

const ENV_GLSL = /* glsl */ `
  vec2 parallaxEquirect(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* ==================================================================== */
/* The iris                                                              */
/* ==================================================================== */

const IRIS_VERTEX = /* glsl */ `
  varying vec2 vP;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vX;
  varying vec3 vY;
  void main() {
    vP = position.xy;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vN = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    vX = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
    vY = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const IRIS_FRAGMENT = /* glsl */ `
  #define TAU 6.28318530718
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpen;        // 0 shut .. 1 fully open
  uniform float uBlades;
  uniform float uCurve;       // how far a seam spirals, rad per unit radius
  uniform float uRot;         // ring drive angle
  uniform float uMaxAperture; // apothem when fully open, × radius
  uniform float uFade;
  uniform float uOpacity;
  uniform float uChrome;
  uniform float uRough;
  uniform float uSeam;
  uniform float uLip;
  uniform float uLipWidth;
  uniform float uDepth;
  uniform float uTunnelFreq;
  uniform float uTunnelSpeed;
  uniform float uSwirl;
  uniform float uPortalGlow;
  uniform float uPortalAlpha;
  uniform float uFresnel;
  uniform float uFlare;
  uniform vec3  uColorMetal;
  uniform vec3  uColorMetalDark;
  uniform vec3  uColorLip;
  uniform vec3  uColorPortalA;
  uniform vec3  uColorPortalB;
  uniform vec3  uColorCore;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vP;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vX;
  varying vec3 vY;

  ${noiseGLSL}
  ${ENV_GLSL}

  /** The tunnel seen through the aperture at disc point q, one depth layer. */
  vec3 tunnelLayer(vec2 q, float layer) {
    float r = length(q);
    float a = atan(q.y, q.x);
    float sw = a + uSwirl / (r + 0.25) + uTime * 0.6 * (mod(layer, 2.0) * 2.0 - 1.0);
    float rings = 0.5 + 0.5 * sin(log(r + 0.04) * uTunnelFreq - uTime * uTunnelSpeed + layer * 1.7);
    rings = pow(rings, 6.0);
    float n = snoise(vec3(cos(sw) * 2.0, sin(sw) * 2.0, r * 3.0 - uTime * 1.2 + layer * 3.1 + uSeed));
    float streak = pow(0.5 + 0.5 * n, 3.0);
    vec3 col = mix(uColorPortalA, uColorPortalB, clamp(r * 1.2, 0.0, 1.0));
    return col * (rings * 0.8 + streak * 0.6);
  }

  void main() {
    vec2 p = vP;
    float r = length(p);
    if (r > 1.0) discard;
    float N = max(3.0, uBlades);
    float seg = TAU / N;

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 Nrm = normalize(vN);
    if (dot(V, Nrm) < 0.0) Nrm = -Nrm;
    float ndv = clamp(dot(V, Nrm), 0.0, 1.0);

    /* --- the aperture: a regular N-gon that turns as it opens --- */
    float a = uOpen * uMaxAperture;
    float phi = uRot + (1.0 - uOpen) * seg * 0.9;
    float ang = atan(p.y, p.x) - phi;
    float local = mod(ang + seg * 0.5, seg) - seg * 0.5;
    float d = r * cos(local) - a;          // > 0 on a blade, < 0 in the opening
    float aa = fwidth(d) + 1e-4;
    float blade = smoothstep(-aa, aa, d);

    /* --- the blades: pinwheel seams, a tilted normal each --- */
    float bAng = ang + (r - a) * uCurve;
    float bf = fract(bAng / seg);
    float bid = floor(bAng / seg);
    float seamW = 0.035 * uSeam;
    float seam = 1.0 - smoothstep(0.0, seamW, bf) * smoothstep(1.0, 1.0 - seamW * 0.4, bf);
    float shadow = mix(0.45, 1.0, smoothstep(0.0, 0.22, bf));   // the overlap's shadow
    float tilt = (bf - 0.5) * 0.5 + (hash11(bid + uSeed) - 0.5) * 0.2;
    float bladeA = (bid + 0.5) * seg + phi;
    vec3 across = normalize(vX * -sin(bladeA) + vY * cos(bladeA));
    vec3 bn = normalize(Nrm + across * tilt);
    // Brushing: concentric grain lifts the normal a hair.
    float grain = snoise(vec3(r * 140.0, bid * 3.0, uSeed)) * uRough;
    bn = normalize(bn + (vX * p.x + vY * p.y) * grain * 0.06);
    vec3 env = texture2D(uEnvMap, parallaxEquirect(reflect(-V, bn))).rgb;
    float fres = pow(1.0 - clamp(dot(V, bn), 0.0, 1.0), 4.0) * uFresnel;
    vec3 metal = mix(uColorMetalDark, uColorMetal, 0.5 + 0.5 * dot(bn, normalize(vec3(0.3, 0.9, 0.2))));
    metal = mix(metal, env * uColorMetal * 1.6, uChrome) + env * fres;
    metal *= shadow * (1.0 - seam * 0.85);

    /* --- the lip: blue light bleeding off the aperture edge --- */
    float lip = exp(-max(d, 0.0) / max(uLipWidth, 1e-3)) * blade * uLip * smoothstep(0.0, 0.08, uOpen);

    /* --- the bore: four parallax layers, nearer ones brighter --- */
    vec3 vt = vec3(dot(V, vX), dot(V, vY), max(dot(V, Nrm), 0.15));
    vec3 tunnel = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      float L = float(i);
      vec2 q = p - vt.xy / vt.z * uDepth * (L + 1.0) * 0.35;
      tunnel += tunnelLayer(q * (1.0 + L * 0.35), L) * (1.0 - L * 0.2);
    }
    float core = exp(-r * r / max(a * a * 0.18, 1e-4));
    tunnel += uColorCore * core * 1.5;
    tunnel *= uPortalGlow * uShaderIntensity;

    /* --- compose --- */
    vec3 color = mix(tunnel, metal, blade) + uColorLip * lip * 3.0;
    color *= 1.0 + uFlare * 2.0;
    float alpha = mix(uPortalAlpha * smoothstep(0.0, 0.1, uOpen), 1.0, blade);
    alpha = max(alpha, lip);
    alpha *= uFade * uOpacity * (1.0 - smoothstep(0.97, 1.0, r));
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color * uGlobalGlow, alpha);
  }
`;

/** One per iris: each has its own aperture, drive angle and flare. */
export function createParallaxIrisMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uSeed: { value: 0 },
      uOpen: { value: 0 },
      uBlades: { value: 9 },
      uCurve: { value: 1.2 },
      uRot: { value: 0 },
      uMaxAperture: { value: 0.86 },
      uFade: { value: 1 },
      uOpacity: { value: 1 },
      uChrome: { value: 0.8 },
      uRough: { value: 0.3 },
      uSeam: { value: 1 },
      uLip: { value: 1 },
      uLipWidth: { value: 0.05 },
      uDepth: { value: 0.4 },
      uTunnelFreq: { value: 9 },
      uTunnelSpeed: { value: 4 },
      uSwirl: { value: 0.6 },
      uPortalGlow: { value: 1.5 },
      uPortalAlpha: { value: 0.85 },
      uFresnel: { value: 1 },
      uFlare: { value: 0 },
      uColorMetal: { value: new Color() },
      uColorMetalDark: { value: new Color() },
      uColorLip: { value: new Color() },
      uColorPortalA: { value: new Color() },
      uColorPortalB: { value: new Color() },
      uColorCore: { value: new Color() }
    }),
    vertexShader: IRIS_VERTEX,
    fragmentShader: IRIS_FRAGMENT
  });

  /** @param {object} state { open, rot, fade, flare, seed } */
  material.userData.sync = (state) => {
    const c = settings.parallax;
    const g = settings.global;
    const u = material.uniforms;
    u.uOpen.value = state.open;
    u.uRot.value = state.rot;
    u.uFade.value = state.fade;
    u.uFlare.value = state.flare;
    u.uSeed.value = state.seed;
    u.uBlades.value = Math.max(3, Math.round(c.irisBlades));
    u.uCurve.value = c.irisBladeCurve;
    u.uMaxAperture.value = c.irisAperture;
    u.uOpacity.value = g.opacity;
    u.uChrome.value = c.irisChrome;
    u.uRough.value = c.irisBrush * g.noiseStrength;
    u.uSeam.value = c.irisSeam;
    u.uLip.value = c.irisLip * g.glow;
    u.uLipWidth.value = c.irisLipWidth;
    u.uDepth.value = c.portalDepth;
    u.uTunnelFreq.value = c.portalRings;
    u.uTunnelSpeed.value = c.portalSpeed * g.noiseSpeed;
    u.uSwirl.value = c.portalSwirl;
    u.uPortalGlow.value = c.portalGlow * g.glow;
    u.uPortalAlpha.value = c.portalOpacity;
    u.uFresnel.value = c.irisFresnel * g.fresnel;
    u.uColorMetal.value.copy(getColor(c.colorChrome));
    u.uColorMetalDark.value.copy(getColor(c.colorChromeDark));
    u.uColorLip.value.copy(getColor(c.colorLip));
    u.uColorPortalA.value.copy(getColor(c.colorPortalA));
    u.uColorPortalB.value.copy(getColor(c.colorPortalB));
    u.uColorCore.value.copy(getColor(c.colorPortalCore));
  };

  return material;
}

/* ==================================================================== */
/* The bezel                                                             */
/* ==================================================================== */

const BEZEL_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vUv;
  varying float vFront;
  void main() {
    vUv = uv;
    vFront = normal.z;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BEZEL_FRAGMENT = /* glsl */ `
  #define TAU 6.28318530718
  uniform float uTime;
  uniform float uChrome;
  uniform float uFresnel;
  uniform float uLights;
  uniform float uLightCount;
  uniform float uChase;
  uniform float uGroove;
  uniform float uCharge;      // 0..1 how lit it is (opening, transit)
  uniform float uFlare;
  uniform vec3  uColorMetal;
  uniform vec3  uColorMetalDark;
  uniform vec3  uColorLight;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vUv;
  varying float vFront;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    vec3 env = texture2D(uEnvMap, parallaxEquirect(reflect(-V, N))).rgb;
    float fres = pow(1.0 - clamp(abs(dot(V, N)), 0.0, 1.0), 4.0) * uFresnel;
    float lam = 0.35 + 0.65 * clamp(dot(N, normalize(uLightDir)), 0.0, 1.0);
    vec3 metal = mix(uColorMetalDark, uColorMetal, lam);
    metal = mix(metal, env * uColorMetal * 1.5, uChrome) + env * fres;

    // Front and back faces only: an engraved groove and the chase lights in it.
    float face = step(0.5, abs(vFront));
    float groove = face * (1.0 - smoothstep(0.0, 0.06, abs(vUv.y - 0.45))) * uGroove;
    metal *= 1.0 - groove * 0.6;
    float slot = fract(vUv.x * uLightCount);
    float lamp = smoothstep(0.0, 0.15, slot) * (1.0 - smoothstep(0.35, 0.5, slot));
    float head = fract(vUv.x - uTime * uChase);
    float chase = pow(1.0 - head, 6.0);
    float lit = groove * lamp * (0.25 + chase) * uLights * uCharge;

    vec3 color = metal + uColorLight * lit * 4.0;
    color *= 1.0 + uFlare;
    gl_FragColor = vec4(color * mix(1.0, uGlobalGlow, 0.5), 1.0);
  }
`;

export function createParallaxBezelMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uChrome: { value: 0.8 },
      uFresnel: { value: 1 },
      uLights: { value: 1 },
      uLightCount: { value: 24 },
      uChase: { value: 0.6 },
      uGroove: { value: 1 },
      uCharge: { value: 0 },
      uFlare: { value: 0 },
      uColorMetal: { value: new Color() },
      uColorMetalDark: { value: new Color() },
      uColorLight: { value: new Color() }
    }),
    vertexShader: BEZEL_VERTEX,
    fragmentShader: BEZEL_FRAGMENT
  });

  /** @param {object} state { charge, flare } */
  material.userData.sync = (state) => {
    const c = settings.parallax;
    const g = settings.global;
    const u = material.uniforms;
    u.uCharge.value = state.charge;
    u.uFlare.value = state.flare;
    u.uChrome.value = c.irisChrome;
    u.uFresnel.value = c.irisFresnel * g.fresnel;
    u.uLights.value = c.bezelLights * g.glow;
    u.uLightCount.value = Math.max(1, Math.round(c.bezelLightCount));
    u.uChase.value = c.bezelChase * g.animationSpeed;
    u.uGroove.value = c.bezelGroove;
    u.uColorMetal.value.copy(getColor(c.colorChrome));
    u.uColorMetalDark.value.copy(getColor(c.colorChromeDark));
    u.uColorLight.value.copy(getColor(c.colorLip));
  };

  return material;
}

/* ==================================================================== */
/* The corridor rings                                                    */
/* ==================================================================== */

const RING_VERTEX = /* glsl */ `
  attribute vec3 aRing;      // alpha, pulse, seed
  varying vec2 vUv;
  varying vec3 vRing;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vRing = aRing;
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 world = modelMatrix * local;
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uDashes;
  uniform float uDashSpeed;
  uniform float uPulseGlow;
  uniform float uFresnel;
  uniform vec3  uColorRing;
  uniform vec3  uColorPulse;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vRing;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  void main() {
    float alpha = vRing.x;
    if (alpha < 0.003) discard;
    float dir = vRing.z > 0.5 ? 1.0 : -1.0;
    float d = fract(vUv.x * uDashes + uTime * uDashSpeed * dir + vRing.z * 7.0);
    float dash = smoothstep(0.0, 0.08, d) * (1.0 - smoothstep(0.55, 0.65, d));
    float base = 0.25 + 0.75 * dash;
    vec3 V = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - abs(dot(V, normalize(vNormalW))), 2.0) * uFresnel;
    vec3 color = uColorRing * (base + rim) + uColorPulse * vRing.y * uPulseGlow;
    color *= uGlow * uGlobalGlow;
    gl_FragColor = vec4(color, alpha * (base * 0.7 + rim * 0.3 + vRing.y));
  }
`;

export function createParallaxRingMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uGlow: { value: 1 },
      uDashes: { value: 6 },
      uDashSpeed: { value: 0.5 },
      uPulseGlow: { value: 3 },
      uFresnel: { value: 1 },
      uColorRing: { value: new Color() },
      uColorPulse: { value: new Color() }
    }),
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.parallax;
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.ringGlow * g.glow;
    u.uDashes.value = Math.max(1, Math.round(c.ringDashes));
    u.uDashSpeed.value = c.ringDashSpeed * g.animationSpeed;
    u.uPulseGlow.value = c.ringPulseGlow;
    u.uFresnel.value = c.ringFresnel * g.fresnel;
    u.uColorRing.value.copy(getColor(c.colorRing));
    u.uColorPulse.value.copy(getColor(c.colorRingPulse));
  };

  return material;
}

/* ==================================================================== */
/* The body                                                              */
/* ==================================================================== */

const BODY_VERTEX = /* glsl */ `
  ${SKINNING_PARS}

  uniform float uProgress;    // 0 whole .. 1 gone into the iris
  uniform float uBand;        // width of the dissolving front, in order units
  uniform vec3  uIris;        // the iris centre, world
  uniform vec3  uIrisN;       // its normal, flat
  uniform float uNear;        // distance from the iris where the order is 0
  uniform float uFar;         // ... and 1
  uniform float uPull;        // 0..1 how far a dissolving vertex travels to the iris
  uniform float uSpin;        // radians it spirals about the iris axis on the way

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec2  vUv;
  varying float vOrder;
  varying float vK;

  void main() {
    ${SKINNING_MAIN}

    vec4 world = modelMatrix * vec4(transformed, 1.0);
    vec3 nW = normalize(mat3(modelMatrix) * objectNormal);

    // Order: nearest the iris goes first (and, run backward, comes back first).
    float order = clamp((distance(world.xyz, uIris) - uNear) / max(uFar - uNear, 1e-3), 0.0, 1.0);
    float th = uProgress * (1.0 + uBand);
    float k = clamp((th - order) / max(uBand, 1e-3), 0.0, 1.0);

    // Pulled into the iris, spiralling about its axis.
    vec3 rel = world.xyz - uIris;
    float a = k * k * uSpin;
    vec3 ax = normalize(uIrisN);
    rel = rel * cos(a) + cross(ax, rel) * sin(a) + ax * dot(ax, rel) * (1.0 - cos(a));
    vec3 p = uIris + rel * (1.0 - uPull * k * k * k);

    vWorld = p;
    vNormalW = nW;
    vUv = uv;
    vOrder = order;
    vK = k;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const BODY_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uBand;
  uniform float uNoise;
  uniform float uNoiseScale;
  uniform float uEdge;
  uniform float uEdgeWidth;
  uniform float uFresnel;
  uniform float uTint;
  uniform float uHasMap;
  uniform sampler2D uMap;
  uniform vec3  uColorSkin;
  uniform vec3  uColorEdge;
  uniform vec3  uColorRim;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec2  vUv;
  varying float vOrder;
  varying float vK;

  ${noiseGLSL}

  void main() {
    // Cubed voxels, so it comes apart in fragments, not in smoke.
    vec3 cell = floor(vWorld * uNoiseScale);
    float n = hash13(cell) - 0.5;
    float th = uProgress * (1.0 + uBand);
    float k = (th - vOrder - n * uNoise) / max(uBand, 1e-3);
    if (k >= 1.0) discard;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 albedo = uColorSkin;
    if (uHasMap > 0.5) albedo *= texture2D(uMap, vUv).rgb;
    float lam = 0.3 + 0.7 * clamp(dot(N, normalize(uLightDir)), 0.0, 1.0);
    float rim = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0) * uFresnel;
    vec3 color = albedo * lam;

    // The approach of the front tints the body blue before it bites.
    float near = clamp(k + 1.0, 0.0, 1.0);
    color = mix(color, uColorRim, near * uTint);
    color += uColorRim * rim * (0.3 + near);

    float edge = smoothstep(1.0 - uEdgeWidth, 1.0, k + 0.02) + step(0.0, k) * 0.25;
    color += uColorEdge * edge * uEdge;
    gl_FragColor = vec4(color * mix(1.0, uGlobalGlow, 0.35), 1.0);
  }
`;

export function createParallaxBodyMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uProgress: { value: 0 },
      uBand: { value: 0.25 },
      uIris: { value: new Vector3() },
      uIrisN: { value: new Vector3(0, 0, 1) },
      uNear: { value: 0 },
      uFar: { value: 2 },
      uPull: { value: 0.9 },
      uSpin: { value: 2 },
      uNoise: { value: 0.3 },
      uNoiseScale: { value: 14 },
      uEdge: { value: 4 },
      uEdgeWidth: { value: 0.35 },
      uFresnel: { value: 1 },
      uTint: { value: 0.3 },
      uHasMap: { value: 0 },
      uMap: { value: null },
      uColorSkin: { value: new Color(1, 1, 1) },
      uColorEdge: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT
  });

  /** @param {object} state { progress, iris, irisN, near, far, map } */
  material.userData.sync = (state) => {
    const c = settings.parallax;
    const g = settings.global;
    const u = material.uniforms;
    u.uProgress.value = state.progress;
    u.uIris.value.copy(state.iris);
    u.uIrisN.value.copy(state.irisN);
    u.uNear.value = state.near;
    u.uFar.value = state.far;
    u.uMap.value = state.map;
    u.uHasMap.value = state.map ? 1 : 0;
    u.uBand.value = c.dissolveBand;
    u.uPull.value = c.dissolvePull;
    u.uSpin.value = c.dissolveSpin;
    u.uNoise.value = c.dissolveNoise * g.randomness;
    u.uNoiseScale.value = c.dissolveVoxel * g.noiseFrequency;
    u.uEdge.value = c.dissolveEdgeGlow * g.glow;
    u.uEdgeWidth.value = c.dissolveEdgeWidth;
    u.uFresnel.value = c.dissolveRim * g.fresnel;
    u.uTint.value = c.dissolveTint;
    u.uColorSkin.value.copy(getColor(c.colorSkin));
    u.uColorEdge.value.copy(getColor(c.colorDissolveEdge));
    u.uColorRim.value.copy(getColor(c.colorLip));
  };

  return material;
}

/* ==================================================================== */
/* The warp                                                              */
/* ==================================================================== */

const WARP_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy * 2.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  #define TAU 6.28318530718
  uniform float uStrength;
  uniform float uFront;
  uniform float uSign;
  uniform float uBlades;
  uniform float uRot;
  uniform float uShaderIntensity;
  varying vec2 vP;

  void main() {
    float r = length(vP);
    if (r > 1.0 || r < 1e-3) discard;
    // The wavefront is the aperture's own N-gon, so the warp reads mechanical.
    float seg = TAU / max(3.0, uBlades);
    float ang = atan(vP.y, vP.x) - uRot;
    float local = mod(ang + seg * 0.5, seg) - seg * 0.5;
    float poly = r * cos(local);
    float d = poly - uFront;
    float window = exp(-(d * d) / 0.02) * (1.0 - smoothstep(0.85, 1.0, r));
    float strength = uStrength * uShaderIntensity * window;
    if (strength < 0.002) discard;
    vec2 dir = (vP / r) * uSign;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, window);
  }
`;

export function createParallaxWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 2 },
      uStrength: { value: 0 },
      uFront: { value: 0.5 },
      uSign: { value: 1 },
      uBlades: { value: 9 },
      uRot: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} state { size, strength, front, sign, rot } */
  material.userData.sync = (state) => {
    const u = material.uniforms;
    u.uSize.value = state.size;
    u.uStrength.value = state.strength * settings.global.distortion;
    u.uFront.value = state.front;
    u.uSign.value = state.sign;
    u.uRot.value = state.rot;
    u.uBlades.value = Math.max(3, Math.round(settings.parallax.irisBlades));
  };

  return material;
}
