import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Reliquary Dawn — the bespoke shaders.
 *
 *  - **the shrine** — gilt metal and ivory stone, lit off the frame's light
 *    direction, with a fake gold specular, a warm fresnel, *and* the relic's
 *    own light: every face that looks toward the relic glows as it kindles,
 *    so the inside of the pillars and the underside of the entablature light
 *    up. A molten seam of light runs round it where it comes up through the
 *    floor. The finial burns white.
 *  - **the glass** — six instanced lancet windows: voronoi cells of dawn
 *    colours between dark lead lines, a rose at the head of each arch, lit
 *    from behind by the relic.
 *  - **the relic** — a small dawn sun: boiling granulation, white core, rose
 *    limb; and its **corona**, a camera-facing burst of long soft rays.
 *  - **the rays** — up to 12 camera-facing shafts raking out of the open
 *    sides of the shrine and down onto the floor, extended as the wash runs.
 *  - **the ground** — the circle before dawn (a dusk tint, its rim drawn) and
 *    the wash: a bright front racing out from the shrine, warm gold behind it
 *    combed with sunrise streaks, cooling and eroding on the exit; and a
 *    glowing hexagonal seam where the shrine broke through.
 *  - **the shimmer** — `LAYER.DISTORTION`: heat riding the wash front.
 *
 * Every material reads `settings.reliquarydawn` in `userData.sync(state)`.
 */

const ID = 'reliquarydawn';
export const MAX_RAYS = 12;

/* -------------------------------------------------------------------- */
/* The shrine                                                           */
/* -------------------------------------------------------------------- */

const SHRINE_VERTEX = /* glsl */ `
  attribute float aPart;
  attribute float aHeight;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vWorld;
  varying float vPart;
  varying float vHeight;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    vWorld = world.xyz;
    vPart = aPart;
    vHeight = aHeight;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHRINE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform vec3  uRelic;       // world position of the relic
  uniform float uRelicLight;  // how hard the relic lights the frame
  uniform float uGlow;
  uniform float uSpec;
  uniform float uFresnel;
  uniform float uFinialGlow;
  uniform float uEmerge;      // the molten seam at the floor
  uniform vec3  uColorGilt;
  uniform vec3  uColorGiltHot;
  uniform vec3  uColorStone;
  uniform vec3  uColorShadow;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vWorld;
  varying float vPart;
  varying float vHeight;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float diff = max(dot(N, L), 0.0);
    vec3 R = reflect(-V, N);
    float spec = pow(max(dot(R, L), 0.0), 18.0) + 0.35 * pow(max(R.y, 0.0), 4.0);
    float rim = pow(1.0 - abs(dot(N, V)), 3.0) * uFresnel;

    float stone = step(1.5, vPart);
    float finial = step(0.5, vPart) * (1.0 - stone);
    // Fluting and wear: the gilt is not a flat colour.
    float wear = fbm3(vWorld * 3.5) * 0.5 + 0.5;
    float flute = 0.85 + 0.15 * sin(vHeight * 42.0);
    vec3 base = mix(uColorGilt * flute * (0.75 + 0.5 * wear), uColorStone * (0.8 + 0.3 * wear), stone);
    vec3 col = mix(uColorShadow, base, 0.25 + 0.75 * diff);
    col += uColorGiltHot * spec * uSpec * (1.0 - stone * 0.7);
    col += uColorGiltHot * rim * 0.6;

    // The relic's light on every face that looks at it.
    vec3 toRelic = uRelic - vWorld;
    float d = length(toRelic);
    float lit = max(dot(N, toRelic / max(d, 1e-3)), 0.0) / (1.0 + d * d * 0.6);
    col += uColorGiltHot * lit * uRelicLight * 2.0;

    col = mix(col, uColorGiltHot * uFinialGlow, finial);
    // Where it is coming up through the floor, the floor is molten light.
    float seam = exp(-max(vWorld.y, 0.0) * 10.0) * uEmerge;
    col += uColorGiltHot * seam * 3.0;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, 1.0);
  }
`;

/** The gilt frame. Opaque, on LAYER.WORLD. */
export function createShrineMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRelic: { value: new Vector3() },
      uRelicLight: { value: 0 },
      uGlow: { value: 1 },
      uSpec: { value: 1.5 },
      uFresnel: { value: 1 },
      uFinialGlow: { value: 4 },
      uEmerge: { value: 0 },
      uColorGilt: { value: new Color() },
      uColorGiltHot: { value: new Color() },
      uColorStone: { value: new Color() },
      uColorShadow: { value: new Color() }
    }),
    vertexShader: SHRINE_VERTEX,
    fragmentShader: SHRINE_FRAGMENT
  });

  /** @param {object} state { relic, kindle, emerge } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uRelic.value.copy(state.relic);
    u.uRelicLight.value = c.relicLight * state.kindle * g.shaderIntensity;
    u.uGlow.value = c.giltGlow * g.glow;
    u.uSpec.value = c.giltSpec;
    u.uFresnel.value = c.giltFresnel * g.fresnel;
    u.uFinialGlow.value = c.finialGlow * (0.4 + 0.6 * state.kindle);
    u.uEmerge.value = state.emerge * c.emergeGlow;
    u.uColorGilt.value.copy(getColor(c.colorGilt));
    u.uColorGiltHot.value.copy(getColor(c.colorGiltHot));
    u.uColorStone.value.copy(getColor(c.colorStone));
    u.uColorShadow.value.copy(getColor(c.colorShadow));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The glass                                                            */
/* -------------------------------------------------------------------- */

const GLASS_VERTEX = /* glsl */ `
  varying vec2  vP;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vSeed;

  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec4 world = m * vec4(position, 1.0);
    vP = position.xy;
    vNormalW = normalize(mat3(m) * vec3(0.0, 0.0, 1.0));
    vViewDir = cameraPosition - world.xyz;
    vSeed = fract(sin(dot(m[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const GLASS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uCells;
  uniform float uLead;
  uniform float uOpacity;
  uniform float uPower;
  uniform float uHeight;
  uniform float uHalfWidth;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorD;
  uniform vec3  uColorLead;
  uniform float uGlobalGlow;

  varying vec2  vP;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vSeed;

  ${noiseGLSL}

  /** x: F2 − F1 (0 on a lead line), y: cell hash. */
  vec2 cells(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    float id = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = vec2(hash13(vec3(n + g, 3.1)), hash13(vec3(n + g, 7.7)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = hash13(vec3(n + g, 5.3)); }
        else if (d < d2) { d2 = d; }
      }
    }
    return vec2(sqrt(d2) - sqrt(d1), id);
  }

  void main() {
    vec2 p = vP;
    // A rose at the head of the arch: rings and twelve spokes.
    vec2 rc = p - vec2(0.0, uHeight * 0.74);
    float rr = length(rc);
    float roseR = uHalfWidth * 0.62;
    float inRose = 1.0 - step(roseR, rr);
    float ang = atan(rc.y, rc.x);
    float spokes = abs(sin(ang * 6.0));
    float roseLead = (1.0 - smoothstep(0.0, uLead * 0.6, abs(rr - roseR))) + inRose * (1.0 - smoothstep(0.0, 0.08, spokes)) * step(roseR * 0.25, rr);
    roseLead += 1.0 - smoothstep(0.0, uLead * 0.5, abs(rr - roseR * 0.25));

    vec2 c = cells(p * uCells + vSeed * 13.0);
    float lead = 1.0 - smoothstep(uLead * 0.4, uLead, c.x / uCells);
    lead = mix(lead, clamp(roseLead, 0.0, 1.0), inRose);
    // The frame round the window.
    float border = 1.0 - smoothstep(uHalfWidth - uLead * 1.6, uHalfWidth - uLead * 0.6, abs(p.x));
    border *= smoothstep(uLead * 0.6, uLead * 1.6, p.y);
    lead = max(lead, 1.0 - border);

    float h = inRose > 0.5 ? fract(floor(ang / 0.5236) * 0.137 + 0.2) : c.y;
    vec3 glass = h < 0.3 ? uColorA : h < 0.55 ? uColorB : h < 0.8 ? uColorC : uColorD;
    float mottle = 0.7 + 0.3 * snoise(vec3(p * 9.0, vSeed * 4.0));
    // Lit from behind: brightest toward the relic, the bottom of each pane.
    float back = 0.65 + 0.35 * (1.0 - p.y / max(uHeight, 0.1));
    float flicker = 0.9 + 0.1 * sin(uTime * 3.0 + c.y * 30.0);
    vec3 col = glass * mottle * back * flicker * uGlow * uPower;
    col = mix(col, uColorLead, lead);
    float a = mix(uOpacity * (0.5 + 0.5 * uPower), 1.0, lead);
    gl_FragColor = vec4(col * uGlobalGlow, a);
  }
`;

/** The stained-glass windows. Instanced six times. */
export function createGlassMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uGlow: { value: 2 },
      uCells: { value: 7 },
      uLead: { value: 0.05 },
      uOpacity: { value: 0.9 },
      uPower: { value: 0 },
      uHeight: { value: 2 },
      uHalfWidth: { value: 0.42 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() },
      uColorLead: { value: new Color() }
    }),
    vertexShader: GLASS_VERTEX,
    fragmentShader: GLASS_FRAGMENT
  });

  /** @param {object} state { power, height, halfWidth } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.glassGlow * g.glow;
    u.uCells.value = Math.max(0.5, c.glassCells);
    u.uLead.value = Math.max(0.005, c.leadWidth);
    u.uOpacity.value = c.glassOpacity * g.opacity;
    u.uPower.value = state.power;
    u.uHeight.value = state.height;
    u.uHalfWidth.value = state.halfWidth;
    u.uColorA.value.copy(getColor(c.colorGlassA));
    u.uColorB.value.copy(getColor(c.colorGlassB));
    u.uColorC.value.copy(getColor(c.colorGlassC));
    u.uColorD.value.copy(getColor(c.colorGlassD));
    u.uColorLead.value.copy(getColor(c.colorLead));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The relic and its corona                                             */
/* -------------------------------------------------------------------- */

const RELIC_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;
  varying vec3  vN;
  varying vec3  vViewDir;

  void main() {
    vec3 world = uCenter + position * uRadius;
    vN = position;
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RELIC_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uBoil;
  uniform float uPower;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorD;
  uniform float uGlobalGlow;

  varying vec3 vN;
  varying vec3 vViewDir;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(vViewDir);
    float facing = abs(dot(N, V));
    float gran = fbm3(N * 4.0 + vec3(0.0, uTime * uBoil, uSeed)) * 0.5 + 0.5;
    float heat = clamp(pow(facing, 0.7) * 0.8 + gran * 0.3, 0.0, 1.0);
    vec3 col = gradient4(uColorA, uColorB, uColorC, uColorD, 1.0 - heat);
    float rim = pow(1.0 - facing, 2.0);
    vec3 color = col * uGlow * (0.6 + 0.6 * heat) + uColorD * rim * uGlow * 0.5;
    gl_FragColor = vec4(color * uPower * uGlobalGlow, clamp(uPower, 0.0, 1.0));
  }
`;

/** The dawn-sun relic. Additive. */
export function createRelicMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 0.3 },
      uSeed: { value: 0 },
      uGlow: { value: 5 },
      uBoil: { value: 1 },
      uPower: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorD: { value: new Color() }
    }),
    vertexShader: RELIC_VERTEX,
    fragmentShader: RELIC_FRAGMENT
  });

  /** @param {object} state { center, radius, power, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uRadius.value = Math.max(0.005, state.radius);
    u.uSeed.value = state.seed;
    u.uGlow.value = c.relicGlow * g.glow;
    u.uBoil.value = c.relicBoil * g.noiseSpeed;
    u.uPower.value = state.power * g.opacity;
    u.uColorA.value.copy(getColor(c.colorRelicA));
    u.uColorB.value.copy(getColor(c.colorRelicB));
    u.uColorC.value.copy(getColor(c.colorRelicC));
    u.uColorD.value.copy(getColor(c.colorRelicD));
  };
  return material;
}

const BILLBOARD_VERTEX = /* glsl */ `
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

const CORONA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uRays;
  uniform vec3  uColorCore;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0 || uIntensity <= 0.001) discard;
    float a = atan(vUv.y, vUv.x);
    float core = exp(-r * r * 28.0);
    float halo = exp(-r * 3.0) * (1.0 - smoothstep(0.55, 1.0, r));
    // Long soft dawn rays, each its own length, breathing.
    float n = max(uRays, 1.0);
    float lane = a / 6.2831853 * n;
    float id = floor(lane + 0.5);
    float w = abs(lane - id);
    float len = 0.45 + 0.55 * hash11(id + uSeed) * (0.8 + 0.2 * sin(uTime * 1.7 + id));
    float rays = exp(-w * w * 60.0) * (1.0 - smoothstep(len * 0.4, len, r));
    vec3 col = uColorHalo * (halo + rays * 1.2) + uColorCore * core * 2.5;
    float m = clamp(halo + rays + core, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, r));
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, m);
  }
`;

/** The relic's corona, and the herald on its way out. */
export function createCoronaMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 1 },
      uSeed: { value: 0 },
      uIntensity: { value: 0 },
      uRays: { value: 12 },
      uColorCore: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: CORONA_FRAGMENT
  });

  /** @param {object} state { center, size, intensity, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.01, state.size);
    u.uIntensity.value = state.intensity * c.coronaGlow * g.glow;
    u.uRays.value = Math.max(1, Math.round(c.coronaRays));
    u.uSeed.value = state.seed;
    u.uColorCore.value.copy(getColor(c.colorCoronaCore));
    u.uColorHalo.value.copy(getColor(c.colorCoronaHalo));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The rays                                                             */
/* -------------------------------------------------------------------- */

const RAY_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uCount;
  uniform float uSpin;
  uniform float uStartR;
  uniform float uReach;       // metres out the rays reach right now
  uniform float uH0;
  uniform float uH1;
  uniform float uW0;
  uniform float uW1;
  uniform float uEndR;

  varying float vX;
  varying float vY;
  varying float vIdx;
  varying float vWorldY;
  varying float vViewZ;

  void main() {
    float x = position.x;
    float k = position.z;
    float live = step(k, uCount - 0.5);
    float az = 6.2831853 * (k + 0.5) / max(uCount, 1.0) + uSpin;
    vec3 R = vec3(cos(az), 0.0, sin(az));
    float r = mix(uStartR, max(uStartR + 0.05, uReach), x);
    // Height falls from the shrine's open side to the floor at full reach.
    float t = clamp((r - uStartR) / max(uEndR - uStartR, 0.1), 0.0, 1.0);
    vec3 c = uCenter + R * r + vec3(0.0, mix(uH0, uH1, t), 0.0);
    vec3 T = normalize(R * (uEndR - uStartR) + vec3(0.0, uH1 - uH0, 0.0));
    vec3 toCam = normalize(cameraPosition - c);
    vec3 across = normalize(cross(T, toCam) + vec3(0.0, 1e-5, 0.0));
    vec3 world = c + across * position.y * mix(uW0, uW1, t);
    world = mix(uCenter, world, live);
    vX = x;
    vY = position.y;
    vIdx = k;
    vWorldY = world.y;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const RAY_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uStreaks;
  uniform float uPower;
  uniform float uSoftFade;
  uniform vec3  uColorA;
  uniform vec3  uColorB;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying float vX;
  varying float vY;
  varying float vIdx;
  varying float vWorldY;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    if (vWorldY < 0.0) discard;
    float body = exp(-vY * vY * 2.5);
    float streak = 0.55 + 0.45 * snoise(vec3(vY * uStreaks, vX * 1.5 - uTime * 0.6, uSeed + vIdx * 4.3));
    // Dust motes glinting in the shaft.
    float glints = pow(max(snoise(vec3(vX * 30.0, vY * 6.0, uTime * 1.5 + vIdx)), 0.0), 8.0) * 3.0;
    float ends = smoothstep(0.0, 0.08, vX) * (1.0 - smoothstep(0.75, 1.0, vX));
    float m = body * (streak + glints) * ends * uPower;
    if (m < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    m *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (m < 0.004) discard;
    vec3 col = mix(uColorB, uColorA, body * (1.0 - vX * 0.6));
    gl_FragColor = vec4(col * m * uGlow * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

/** Shafts of dawn raking out of the open shrine. */
export function createRayMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uCount: { value: 6 },
      uSpin: { value: 0 },
      uStartR: { value: 0.9 },
      uReach: { value: 1 },
      uH0: { value: 1.4 },
      uH1: { value: 0.1 },
      uW0: { value: 0.5 },
      uW1: { value: 2 },
      uEndR: { value: 5 },
      uSeed: { value: 0 },
      uGlow: { value: 2 },
      uStreaks: { value: 6 },
      uPower: { value: 0 },
      uSoftFade: { value: 0.3 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: RAY_VERTEX,
    fragmentShader: RAY_FRAGMENT
  });

  /** @param {object} state { center, spin, startR, reach, endR, lift, power, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uCount.value = Math.max(1, Math.min(MAX_RAYS, Math.round(c.rays)));
    u.uSpin.value = state.spin;
    u.uStartR.value = state.startR;
    u.uReach.value = state.reach;
    u.uEndR.value = state.endR;
    u.uH0.value = c.rayHeight + state.lift;
    u.uH1.value = c.rayEndHeight + state.lift;
    u.uW0.value = c.rayWidth;
    u.uW1.value = c.rayEndWidth;
    u.uSeed.value = state.seed;
    u.uGlow.value = c.rayGlow * g.glow;
    u.uStreaks.value = c.rayStreaks;
    u.uPower.value = state.power * g.opacity;
    u.uSoftFade.value = 0.3;
    u.uColorA.value.copy(getColor(c.colorRayA));
    u.uColorB.value.copy(getColor(c.colorRayB));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The ground — dusk, the wash, and its shimmer                         */
/* -------------------------------------------------------------------- */

const GROUND_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;
  uniform float uLift;
  varying vec2  vP;

  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uRadius;
    world.y = uLift;
    vP = position.xy * uRadius;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uZone;        // the circle's radius
  uniform float uFront;       // metres the wash has run
  uniform float uFrontWidth;
  uniform float uDusk;        // 0..1 the circle before dawn
  uniform float uHeat;        // 1 bright .. 0 cooled
  uniform float uSeam;        // the hex seam the shrine broke through
  uniform float uSeamR;
  uniform float uStreaks;
  uniform float uGlow;
  uniform float uDuskOpacity;
  uniform float uErode;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorDusk;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform float uGlobalGlow;

  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    float rn = r / max(uZone, 0.1);
    if (rn > 1.15) discard;
    float a = atan(vP.y, vP.x);

    // Before dawn: a dusk tint over the circle, its rim drawn.
    float inside = 1.0 - smoothstep(0.97, 1.0, rn);
    float rim = exp(-pow((rn - 1.0) / 0.012, 2.0));
    float duskA = (inside * uDuskOpacity + rim * 0.8) * uDusk;

    // The wash: lit behind the front, a bright front line.
    float behind = 1.0 - smoothstep(uFront - uFrontWidth, uFront, r);
    float frontLine = exp(-pow((r - uFront) / max(uFrontWidth * 0.5, 0.01), 2.0)) * step(0.01, uFront) * step(uFront, uZone * 1.05);
    // Sunrise streaks combed out from the shrine.
    float streak = 0.55 + 0.45 * snoise(vec3(a * uStreaks / 6.2831853 * 2.0, r * 0.15 - uTime * 0.1, uSeed));
    float warm = behind * inside * (0.35 + 0.65 * streak) * (1.0 - 0.45 * rn);
    float T = uHeat;
    vec3 wash = mix(uColorC, uColorB, smoothstep(0.1, 0.6, T * (1.0 - rn * 0.5)));
    wash = mix(wash, uColorA, smoothstep(0.6, 1.0, T * (1.0 - rn)));
    vec3 lit = wash * warm * uGlow * (0.3 + 0.9 * T) + uColorA * frontLine * uGlow * 2.0;

    // The seam where the shrine came up: a hexagon of molten light.
    float hexR = cos(3.14159265 / 6.0) / cos(mod(a + 3.14159265 / 6.0, 3.14159265 / 3.0) - 3.14159265 / 6.0) * uSeamR;
    float seam = exp(-pow((r - hexR) / 0.05, 2.0)) * uSeam;
    float crackN = snoise(vec3(a * 6.0, r * 3.0, uSeed));
    seam += smoothstep(0.55, 0.9, crackN) * (1.0 - smoothstep(uSeamR, uSeamR * 1.8, r)) * step(uSeamR, r) * uSeam * 0.6;
    lit += uColorA * seam * uGlow * 1.5;

    float litA = clamp(warm * (0.5 + 0.5 * T) + frontLine + seam, 0.0, 1.0);
    vec3 col = mix(uColorDusk, lit * uGlobalGlow, clamp(litA * 1.5, 0.0, 1.0));
    float alpha = max(duskA * (1.0 - behind), litA);

    float n = snoise(vec3(vP * 1.3, uSeed * 2.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.2 - 0.1;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.5, n, uErode));
    alpha *= vis * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The circle at dusk, then the dawn washing across it. */
export function createGroundMaterial() {
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
      uRadius: { value: 5 },
      uLift: { value: 0.015 },
      uSeed: { value: 0 },
      uZone: { value: 4.6 },
      uFront: { value: 0 },
      uFrontWidth: { value: 0.35 },
      uDusk: { value: 0 },
      uHeat: { value: 1 },
      uSeam: { value: 0 },
      uSeamR: { value: 1.3 },
      uStreaks: { value: 28 },
      uGlow: { value: 2 },
      uDuskOpacity: { value: 0.45 },
      uErode: { value: 0.7 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorDusk: { value: new Color() },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT
  });

  /** @param {object} state { center, zone, front, dusk, heat, seam, seamR, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uRadius.value = state.zone * 1.15;
    u.uSeed.value = state.seed;
    u.uZone.value = state.zone;
    u.uFront.value = state.front;
    u.uFrontWidth.value = Math.max(0.02, c.washFrontWidth);
    u.uDusk.value = state.dusk;
    u.uHeat.value = state.heat;
    u.uSeam.value = state.seam;
    u.uSeamR.value = state.seamR;
    u.uStreaks.value = c.washStreaks;
    u.uGlow.value = c.washGlow * g.glow;
    u.uDuskOpacity.value = c.duskOpacity;
    u.uErode.value = c.groundErode;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorDusk.value.copy(getColor(c.colorDusk));
    u.uColorA.value.copy(getColor(c.colorWashA));
    u.uColorB.value.copy(getColor(c.colorWashB));
    u.uColorC.value.copy(getColor(c.colorWashC));
  };
  return material;
}

const SHIMMER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFront;
  uniform float uWidth;
  uniform float uStrength;
  uniform float uShaderIntensity;

  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    float d = (r - uFront) / max(uWidth, 0.05);
    float mask = exp(-d * d) * step(0.05, uFront);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    vec2 n = vec2(snoise(vec3(vP * 2.0, uTime * 4.0)), snoise(vec3(vP * 2.0 + 5.1, uTime * 4.0)) * 0.6 + 0.4);
    gl_FragColor = vec4(n * 0.5 + 0.5, strength, mask);
  }
`;

/** Heat riding the wash front — LAYER.DISTORTION. */
export function createShimmerMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 5 },
      uLift: { value: 0.3 },
      uFront: { value: 0 },
      uWidth: { value: 0.6 },
      uStrength: { value: 1 }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: SHIMMER_FRAGMENT
  });

  /** @param {object} state { center, zone, front, power } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uRadius.value = state.zone * 1.15;
    u.uLift.value = 0.25;
    u.uFront.value = state.front;
    u.uWidth.value = c.washFrontWidth * 2;
    u.uStrength.value = c.warpStrength * g.distortion * state.power;
  };
  return material;
}
