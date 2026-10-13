import { AdditiveBlending, Color, DoubleSide, FrontSide, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Geode Eruption — the three bespoke shaders the geode is drawn with.
 *
 *  - **the stone shell** — one material for all eighteen plates. Everything it
 *    draws is keyed to the plate's *rest-space* position (`aRest`), so a plate
 *    tumbling through the air carries its rock, its agate and its dissolve
 *    pattern with it. Three surfaces in one pass, told apart by `aSurface`:
 *      · outside — rough grey-violet rock: two scales of noise, a bump from
 *        the noise gradient, pale crust settled in the hollows, a faint sheen;
 *      · the broken edges — fresher, lighter stone that *glows* with the light
 *        inside while the seams are open;
 *      · inside — banded agate (concentric bands warped by noise, pale at the
 *        stone, deep violet toward the hollow) glittering with drusy: a field
 *        of tiny crystal faces, each catching the light at its own angle.
 *    The seams glow from `aSeam` (metres to the plate's border), flickering,
 *    with a voronoi crazing creeping out from them as it cracks. After the
 *    burst a flying plate keeps an ember of that light, and at the end a noise
 *    dissolve with a violet edge takes the fallen plates away.
 *  - **the amethyst** — instanced, opaque, but shaded to read as translucent:
 *    the world seen *through* the crystal (the env map along the refracted
 *    ray), tinted from a deep root to a pale point, a light living inside it
 *    that is brightest toward the termination, a fresnel rim and hard glints
 *    off the facets. `uFracture` lights a web of fracture lines just before it
 *    breaks.
 *  - **the inner light** — a camera-facing additive glow at the heart with soft
 *    rays. It is drawn depth-tested *inside* the shell, so the shell hides it
 *    until the seams part, and then it pours out of the gaps.
 *
 * Every material reads `settings.geode` in `userData.sync(state)`.
 */

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* -------------------------------------------------------------------- */
/* the stone shell                                                      */
/* -------------------------------------------------------------------- */

const SHELL_VERTEX = /* glsl */ `
  attribute vec3  aRest;
  attribute float aSurface;
  attribute float aSeam;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vRest;
  varying float vSurface;
  varying float vSeam;

  void main() {
    vRest = aRest;
    vSurface = aSurface;
    vSeam = aSeam;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    // The plates only ever rotate and scale uniformly: no inverse needed.
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHELL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStoneScale;
  uniform float uBump;
  uniform float uSpecular;
  uniform float uLichen;
  uniform float uBands;
  uniform float uBandWarp;
  uniform float uAgateGlow;
  uniform float uDrusy;
  uniform float uSeamWidth;
  uniform float uSeamGlow;
  uniform float uFlicker;
  uniform float uCrack;      // 0..1 how far the seams have opened
  uniform float uOpen;       // 0..1 how much light the hollow is giving off
  uniform float uEmber;      // seam light left on a flying plate
  uniform float uDissolve;
  uniform float uDissolveEdge;
  uniform float uHeight;     // shell height, metres (rest space)
  uniform float uSeed;
  uniform vec3  uColorStone;
  uniform vec3  uColorStoneDark;
  uniform vec3  uColorLichen;
  uniform vec3  uColorAgateA;
  uniform vec3  uColorAgateB;
  uniform vec3  uColorAgateC;
  uniform vec3  uColorSeam;
  uniform vec3  uColorSeamHot;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vRest;
  varying float vSurface;
  varying float vSeam;

  ${noiseGLSL}

  void main() {
    vec3 rp = vRest + uSeed;

    /* --- the dissolve, first: a discarded fragment needs nothing else --- */
    float dn = fbm3(vRest * 2.3 + uSeed * 1.7) * 0.5 + 0.5;
    float threshold = uDissolve * 1.2 - 0.1;
    if (uDissolve > 0.0 && dn < threshold) discard;
    float burn = uDissolve > 0.0 ? 1.0 - smoothstep(threshold, threshold + uDissolveEdge, dn) : 0.0;

    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);

    float outer = 1.0 - step(0.25, vSurface);
    float inner = step(0.75, vSurface);
    float edge = 1.0 - outer - inner;

    // Seam light: hottest right on the border, flickering, and only once open.
    float seam = exp(-vSeam / max(uSeamWidth, 1e-3));
    float flick = 1.0 + uFlicker * snoise(vec3(vRest * 3.0 + uTime * 2.5));
    // Crazing: fine cracks creeping out from the seams as the shell opens.
    vec2 cell = voronoi2(vRest.xz * 2.2 + vRest.y * 1.3 + uSeed);
    float craze = (1.0 - smoothstep(0.0, 0.05, cell.x - 0.02)) * smoothstep(uCrack * 1.4 * uSeamWidth * 6.0, 0.0, vSeam);
    float seamLight = (seam + craze * 0.6) * uCrack * flick + seam * uEmber;

    vec3 color;

    if (outer > 0.5) {
      /* --- rough stone --- */
      float n1 = fbm4(rp * uStoneScale);
      float n2 = snoise(rp * uStoneScale * 4.3);
      // Bump from the noise gradient, in rest space — close enough on a rock.
      float e = 0.05;
      float gx = fbm3((rp + vec3(e, 0.0, 0.0)) * uStoneScale) - fbm3(rp * uStoneScale);
      float gy = fbm3((rp + vec3(0.0, e, 0.0)) * uStoneScale) - fbm3(rp * uStoneScale);
      float gz = fbm3((rp + vec3(0.0, 0.0, e)) * uStoneScale) - fbm3(rp * uStoneScale);
      N = normalize(N - vec3(gx, gy, gz) / e * 0.08 * uBump);

      float hollow = smoothstep(0.15, -0.35, n1);
      vec3 stone = mix(uColorStone, uColorStoneDark, clamp(hollow + n2 * 0.15, 0.0, 1.0));
      // Pale crust settled in the hollows and on the upward faces.
      float crust = smoothstep(0.55, 0.85, snoise(rp * uStoneScale * 2.7) * 0.5 + 0.5 + hollow * 0.3) * uLichen;
      crust *= 0.5 + 0.5 * clamp(N.y, 0.0, 1.0);
      stone = mix(stone, uColorLichen, crust);

      float lambert = 0.22 + 0.78 * clamp(dot(N, L), 0.0, 1.0);
      float spec = pow(clamp(dot(N, H), 0.0, 1.0), 24.0) * uSpecular * (1.0 - hollow);
      color = stone * lambert + vec3(spec);
    } else if (inner > 0.5) {
      /* --- banded agate and drusy --- */
      vec3 c0 = vec3(0.0, uHeight * 0.42, 0.0);
      float depth = length(vRest - c0);
      float warp = fbm3(rp * 1.3) * uBandWarp;
      float band = fract((depth + warp) * uBands);
      float band2 = smoothstep(0.0, 0.15, band) * (1.0 - smoothstep(0.55, 0.75, band));
      vec3 agate = mix(uColorAgateC, uColorAgateB, band2);
      agate = mix(agate, uColorAgateA, smoothstep(0.85, 1.0, band) * 0.8);

      // Drusy: tiny crystal faces, each with its own normal, catching the light.
      vec3 dp = vRest * 38.0;
      vec3 cellId = floor(dp);
      vec3 jitter = vec3(hash13(cellId), hash13(cellId + 7.1), hash13(cellId + 13.7)) * 2.0 - 1.0;
      vec3 Nd = normalize(N + jitter * 0.8);
      float glint = pow(clamp(dot(reflect(-V, Nd), L), 0.0, 1.0), 40.0);
      float lambert = 0.3 + 0.7 * clamp(dot(N, L), 0.0, 1.0);
      color = agate * lambert * 0.6
            + agate * uAgateGlow * uOpen * uGlobalGlow
            + uColorAgateA * glint * uDrusy * (0.4 + uOpen);
    } else {
      /* --- broken edge: fresh stone, lit from within --- */
      float n = fbm3(rp * uStoneScale * 3.0);
      vec3 fresh = mix(uColorStone * 1.4, uColorLichen, 0.35 + 0.25 * n);
      float lambert = 0.35 + 0.65 * clamp(dot(N, L), 0.0, 1.0);
      color = fresh * lambert;
      seamLight = max(seamLight, (uCrack + uEmber) * 0.9 * flick);
    }

    // The light in the seams: violet, with a white-hot core.
    vec3 seamColor = mix(uColorSeam, uColorSeamHot, clamp(seamLight * seam - 0.4, 0.0, 1.0));
    color += seamColor * seamLight * uSeamGlow * uGlobalGlow * (outer + edge * 1.3 + inner * 0.5);

    color += uColorSeam * burn * uSeamGlow * 0.7 * uGlobalGlow;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Stone plates of the geode shell. Opaque, LAYER.WORLD while whole. */
export function createGeodeShellMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    // Double-sided: a peeled plate shows its broken back, and the camera can
    // look down into an open geode.
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStoneScale: { value: 1.4 },
      uBump: { value: 0.9 },
      uSpecular: { value: 0.25 },
      uLichen: { value: 0.35 },
      uBands: { value: 9 },
      uBandWarp: { value: 0.6 },
      uAgateGlow: { value: 0.6 },
      uDrusy: { value: 2.4 },
      uSeamWidth: { value: 0.12 },
      uSeamGlow: { value: 7 },
      uFlicker: { value: 0.35 },
      uCrack: { value: 0 },
      uOpen: { value: 0 },
      uEmber: { value: 0 },
      uDissolve: { value: 0 },
      uDissolveEdge: { value: 0.08 },
      uHeight: { value: 2.8 },
      uSeed: { value: 0 },
      uColorStone: { value: new Color() },
      uColorStoneDark: { value: new Color() },
      uColorLichen: { value: new Color() },
      uColorAgateA: { value: new Color() },
      uColorAgateB: { value: new Color() },
      uColorAgateC: { value: new Color() },
      uColorSeam: { value: new Color() },
      uColorSeamHot: { value: new Color() }
    }),
    vertexShader: SHELL_VERTEX,
    fragmentShader: SHELL_FRAGMENT
  });

  /** @param {object} state { crack, open, ember, dissolve, height, seed } */
  material.userData.sync = (state) => {
    const c = settings.geode;
    const g = settings.global;
    const u = material.uniforms;
    u.uCrack.value = state.crack ?? 0;
    u.uOpen.value = state.open ?? 0;
    u.uEmber.value = state.ember ?? 0;
    u.uDissolve.value = state.dissolve ?? 0;
    u.uHeight.value = state.height ?? 2.8;
    u.uSeed.value = state.seed ?? 0;
    u.uStoneScale.value = c.stoneScale * g.noiseFrequency;
    u.uBump.value = c.stoneBump * g.shaderIntensity;
    u.uSpecular.value = c.stoneSpecular;
    u.uLichen.value = c.stoneLichen;
    u.uBands.value = c.agateBands;
    u.uBandWarp.value = c.agateWarp * g.noiseStrength;
    u.uAgateGlow.value = c.agateGlow * g.glow;
    u.uDrusy.value = c.drusy * g.glow;
    u.uSeamWidth.value = Math.max(0.005, c.seamWidth);
    u.uSeamGlow.value = c.seamGlow * g.glow;
    u.uFlicker.value = c.seamFlicker * g.turbulence;
    u.uDissolveEdge.value = Math.max(0.005, c.plateDissolve);
    u.uColorStone.value.copy(getColor(c.colorStone));
    u.uColorStoneDark.value.copy(getColor(c.colorStoneDark));
    u.uColorLichen.value.copy(getColor(c.colorLichen));
    u.uColorAgateA.value.copy(getColor(c.colorAgateA));
    u.uColorAgateB.value.copy(getColor(c.colorAgateB));
    u.uColorAgateC.value.copy(getColor(c.colorAgateC));
    u.uColorSeam.value.copy(getColor(c.colorSeam));
    u.uColorSeamHot.value.copy(getColor(c.colorSeamHot));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the amethyst                                                         */
/* -------------------------------------------------------------------- */

const CRYSTAL_VERTEX = /* glsl */ `
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

const CRYSTAL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIOR;
  uniform float uRefract;
  uniform float uInner;
  uniform float uTipGlow;
  uniform float uRim;
  uniform float uSparkle;
  uniform float uSparkleSharp;
  uniform float uPulse;
  uniform float uFracture;
  uniform float uFractureGlow;
  uniform float uLit;        // 0..1 how much the geode's light has reached them
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorTip;
  uniform vec3  uColorInner;
  uniform vec3  uColorRim;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vSeed;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float h = clamp(vLocal.y, 0.0, 1.0);

    // Body colour runs from a deep root to a pale point.
    vec3 body = mix(uColorDeep, uColorBody, smoothstep(0.0, 0.55, h));
    body = mix(body, uColorTip, smoothstep(0.6, 1.0, h));

    // The world seen through it: the env map along the refracted ray, tinted.
    vec3 T = refract(-V, N, 1.0 / max(uIOR, 1.0));
    vec3 through = texture2D(uEnvMap, equirectUv(T)).rgb;
    vec3 color = body * (0.25 + through * uRefract);

    // Light living inside it, brighter toward the point, breathing.
    float pulse = 1.0 + uPulse * sin(uTime * 2.2 + vSeed * 6.0);
    float inner = (0.35 + uTipGlow * h * h) * uInner * pulse * uLit;
    // Thicker-looking where it is seen face-on: more light trapped.
    color += uColorInner * inner * (0.45 + 0.55 * ndv) * uGlobalGlow;

    // Rim and hard glints off the facets.
    color += uColorRim * pow(1.0 - ndv, 3.0) * uRim * uGlobalGlow;
    float glint = pow(clamp(dot(reflect(-V, N), L), 0.0, 1.0), uSparkleSharp);
    color += vec3(glint) * uSparkle;

    // Fracture lines lighting up just before it breaks.
    if (uFracture > 0.0) {
      vec2 cell = voronoi2(vLocal.xz * 3.0 + vLocal.y * 4.0 + vSeed * 5.0);
      float line = 1.0 - smoothstep(0.0, 0.06, cell.x - 0.02);
      color += uColorTip * line * uFracture * uFractureGlow * uGlobalGlow;
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Amethyst crystals. Opaque; InstancedMesh on LAYER.WORLD. */
export function createGeodeCrystalMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uIOR: { value: 1.45 },
      uRefract: { value: 1.1 },
      uInner: { value: 2.6 },
      uTipGlow: { value: 1.6 },
      uRim: { value: 2.2 },
      uSparkle: { value: 4 },
      uSparkleSharp: { value: 60 },
      uPulse: { value: 0.25 },
      uFracture: { value: 0 },
      uFractureGlow: { value: 6 },
      uLit: { value: 0 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorTip: { value: new Color() },
      uColorInner: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: CRYSTAL_VERTEX,
    fragmentShader: CRYSTAL_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {object} state { fracture, lit } */
  material.userData.sync = (state) => {
    const c = settings.geode;
    const g = settings.global;
    const u = material.uniforms;
    u.uFracture.value = state.fracture ?? 0;
    u.uLit.value = state.lit ?? 1;
    u.uIOR.value = c.crystalIOR;
    u.uRefract.value = c.crystalRefract;
    u.uInner.value = c.crystalInner * g.glow;
    u.uTipGlow.value = c.crystalTipGlow;
    u.uRim.value = c.crystalRim * g.fresnel;
    u.uSparkle.value = c.crystalSparkle * g.shaderIntensity;
    u.uSparkleSharp.value = c.crystalSparkleSharp;
    u.uPulse.value = c.crystalPulse;
    u.uFractureGlow.value = c.crystalFractureGlow;
    u.uColorDeep.value.copy(getColor(c.colorCrystalDeep));
    u.uColorBody.value.copy(getColor(c.colorCrystalBody));
    u.uColorTip.value.copy(getColor(c.colorCrystalTip));
    u.uColorInner.value.copy(getColor(c.colorCrystalInner));
    u.uColorRim.value.copy(getColor(c.colorCrystalRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the inner light                                                      */
/* -------------------------------------------------------------------- */

const GLOW_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vLocal;

  void main() {
    vLocal = position.xy * 2.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * (uSize * 2.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uRays;
  uniform float uSeed;
  uniform vec3  uColor;
  uniform float uGlobalGlow;

  varying vec2 vLocal;

  ${noiseGLSL}

  void main() {
    float r = length(vLocal);
    if (r > 1.0) discard;
    float a = atan(vLocal.y, vLocal.x);
    float core = exp(-r * r * 9.0);
    float halo = exp(-r * 3.2) * (1.0 - smoothstep(0.75, 1.0, r));
    // Rays: angular noise that turns slowly.
    float rays = pow(snoise(vec3(cos(a) * 2.0, sin(a) * 2.0, uTime * 0.35 + uSeed)) * 0.5 + 0.5, 3.0);
    rays *= exp(-r * 2.0) * (1.0 - smoothstep(0.6, 1.0, r));
    float light = core * 1.6 + halo * 0.7 + rays * uRays * 1.4;
    vec3 color = uColor * light * uIntensity * uGlobalGlow;
    float alpha = clamp(light * uIntensity, 0.0, 1.0);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

/** The light at the geode's heart. Additive billboard, depth-tested. */
export function createGeodeGlowMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 2 },
      uIntensity: { value: 1 },
      uRays: { value: 0.6 },
      uSeed: { value: 0 },
      uColor: { value: new Color() }
    }),
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT
  });

  /** @param {object} state { size, intensity, seed } */
  material.userData.sync = (state) => {
    const c = settings.geode;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = Math.max(0.05, state.size ?? 1);
    u.uIntensity.value = (state.intensity ?? 0) * c.innerLight * g.opacity;
    u.uRays.value = c.innerLightRays * g.shaderIntensity;
    u.uSeed.value = state.seed ?? 0;
    u.uColor.value.copy(getColor(c.colorInnerLight));
  };

  return material;
}
