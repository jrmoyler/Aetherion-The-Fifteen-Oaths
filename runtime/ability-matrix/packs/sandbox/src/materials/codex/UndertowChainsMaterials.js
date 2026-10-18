import { Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Undertow Chains — the bespoke shaders.
 *
 *  - **the links** (`createLinkMaterial`) — opaque, instanced tori stretched
 *    into chain links. Water made solid: a dark, deep-blue body that goes
 *    clear toward its rim (fresnel), bright caustic veins streaming along the
 *    link in the direction the chain pulls, a hard specular and the stage
 *    sky. Each link carries a per-instance glow (`aLink.x`): it flares as it
 *    appears at the chain's racing head and pulses as the chain goes taut.
 *  - **the undertow** (`createPoolMaterial(0)`) — a disc on the floor. Not a
 *    funnel and not a whirlpool: a flat sheet of dark water whose current
 *    runs *inward and down* — concentric swells contracting toward the
 *    middle, streams drawn in along the chains' spirals, an abyss opening in
 *    the centre as the circle is dragged under, a ragged foam lip at its
 *    edge. It floods from the rim inward (`uFill`) and drains the same way.
 *  - **the pull** (`createPoolMaterial(1)`) — the same disc on
 *    `LAYER.DISTORTION`, bending the floor inward toward the centre in moving
 *    bands, so the ground itself looks dragged.
 *
 * Every material reads `settings.undertow` in `userData.sync()`.
 */

const ID = 'undertow';

const ENV_GLSL = /* glsl */ `
  uniform sampler2D uEnvMap;
  uniform float uHasEnv;
  vec3 skyAt(vec3 dir) {
    vec2 uv = vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    return uHasEnv > 0.5 ? texture2D(uEnvMap, uv).rgb : mix(vec3(0.08, 0.12, 0.18), vec3(0.55, 0.7, 0.85), dir.y * 0.5 + 0.5);
  }
`;

/* ==================================================================== */
/* The links                                                              */
/* ==================================================================== */

const LINK_VERTEX = /* glsl */ `
  attribute vec2 aLink;       // x: glow, y: seed

  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec2 vLink;

  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * normal);
    vLocal = position;
    vLink = aLink;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const LINK_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uFlow;
  uniform float uRimGlow;
  uniform float uCore;
  uniform float uFresnelPow;
  uniform float uEnvAmt;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec2 vLink;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - facing, max(uFresnelPow, 0.2));

    // Veins of light streaming round the link the way the chain pulls.
    float a = atan(vLocal.y, vLocal.x);
    float vein = snoise(vec3(a * 1.5 - uFlow * 2.0, vLocal.z * 6.0, vLink.y));
    vein = 1.0 - smoothstep(0.0, 0.22, abs(vein));
    float sparkle = pow(snoise01(vec3(vWorld * 7.0 + uTime * 0.8)), 10.0);

    float diff = clamp(dot(N, uLightDir) * 0.5 + 0.5, 0.0, 1.0);
    vec3 H = normalize(uLightDir + V);
    float spec = pow(max(dot(N, H), 0.0), 70.0);
    vec3 sky = skyAt(reflect(-V, N)) * uEnvAmt;

    vec3 col = mix(uColorA, uColorB, diff * 0.8 + fres * 0.3) * uCore;
    col += sky * (0.15 + fres * 0.7);
    col += uColorC * (fres * uRimGlow + vein * 1.4 * uShaderIntensity + sparkle * 2.0 + spec * 3.0);
    col += uColorC * vLink.x * 2.5;
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

export function createLinkMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uHasEnv: { value: 0 },
      uFlow: { value: 0 },
      uRimGlow: { value: 2.5 },
      uCore: { value: 1 },
      uFresnelPow: { value: 2 },
      uEnvAmt: { value: 0.6 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() }
    }),
    vertexShader: LINK_VERTEX,
    fragmentShader: LINK_FRAGMENT
  });

  /** @param {object} state { flow } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHasEnv.value = frame.uEnvMap.value ? 1 : 0;
    u.uFlow.value = state.flow;
    u.uRimGlow.value = c.linkGlow * g.glow * g.fresnel;
    u.uCore.value = c.linkCore;
    u.uFresnelPow.value = c.linkFresnel;
    u.uEnvAmt.value = c.envAmount;
    u.uColorA.value.copy(getColor(c.colorLinkA));
    u.uColorB.value.copy(getColor(c.colorLinkB));
    u.uColorC.value.copy(getColor(c.colorLinkC));
  };

  return material;
}

/* ==================================================================== */
/* The undertow                                                           */
/* ==================================================================== */

const POOL_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;

  varying vec2 vP;            // metres from the centre, on the floor
  varying vec3 vWorld;

  void main() {
    vec2 p = position.xy * uRadius;
    vec3 world = vec3(uCenter.x + p.x, 0.016, uCenter.z + p.y);
    vP = p;
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uZone;        // the circle's radius, metres
  uniform float uFill;        // 0..1 flooded, rim inward
  uniform float uDrain;       // 0..1 drained, rim inward
  uniform float uPull;        // 0..1 how far it has been dragged under
  uniform float uRings;       // integrated inward phase
  uniform float uRingFreq;
  uniform float uRingGlow;
  uniform float uStreams;     // integrated stream phase
  uniform float uTurns;
  uniform float uStreamGlow;
  uniform float uAbyss;
  uniform float uFoamWidth;
  uniform float uFoamGlow;
  uniform float uOpacity;
  uniform float uEnvAmt;
  uniform float uSeed;
  uniform float uSpin;        // +1 / −1, the way the chains spiral
  uniform vec3  uColorAbyss;
  uniform vec3  uColorDeep;
  uniform vec3  uColorShallow;
  uniform vec3  uColorFoam;
  uniform vec3  uColorRing;
  uniform vec3  uLightDir;
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vP;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    float r = length(vP);
    float rn = r / max(uZone, 0.1);
    float th = atan(vP.y, vP.x);

    // The edge wanders; the water floods in from the rim and drains the same way.
    float edgeN = snoise(vec3(cos(th) * 2.0, sin(th) * 2.0, uSeed)) * 0.06;
    float edge = 1.0 + edgeN;
    if (rn > edge) discard;
    float inner = (1.0 - uFill) * 1.05;               // flooded from here outward
    float dry = (1.0 - uDrain) * 1.05;                // still wet inside here
    float mask = smoothstep(inner - 0.08, inner, rn + edgeN * 0.5) * (1.0 - smoothstep(dry - 0.08, dry, rn - edgeN * 0.5));
    if (mask < 0.004) discard;

    // Swells contracting inward: the phase runs up as r goes down.
    float swell = sin(6.2831853 * (r * uRingFreq + uRings) + snoise(vec3(vP * 0.6, uSeed)) * 1.5);
    float crest = smoothstep(0.55, 1.0, swell);

    // Streams drawn in along the chains' spirals.
    float spiralTh = th + uSpin * uTurns * 6.2831853 * (1.0 - rn);
    float stream = snoise(vec3(cos(spiralTh) * 3.0, sin(spiralTh) * 3.0, rn * 2.5 + uStreams));
    stream = smoothstep(0.35, 0.95, stream);

    // A fake surface normal off the swells, for the sky and the sun.
    vec3 N = normalize(vec3(-vP.x / max(r, 0.01) * swell * 0.25, 1.0, -vP.y / max(r, 0.01) * swell * 0.25));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    vec3 sky = skyAt(reflect(-V, N)) * uEnvAmt;
    float spec = pow(max(dot(N, normalize(uLightDir + V)), 0.0), 80.0);

    // Depth: shallow at the rim, deep inward, an abyss as it is dragged under.
    float depth = smoothstep(1.0, 0.0, rn);
    vec3 col = mix(uColorShallow, uColorDeep, depth);
    float hole = smoothstep(0.55 * uPull + 0.05, 0.0, rn) * uPull;
    col = mix(col, uColorAbyss, clamp(depth * uAbyss * (0.4 + 0.6 * uPull) + hole, 0.0, 1.0));

    col += uColorRing * crest * uRingGlow * (0.4 + 0.6 * uPull) * (1.0 - hole) * uShaderIntensity;
    col += uColorRing * stream * uStreamGlow * (1.0 - hole);
    col += sky * (0.15 + fres) + vec3(spec * 2.0);

    // The foam lip.
    float lip = 1.0 - smoothstep(0.0, uFoamWidth / max(uZone, 0.1), edge - rn);
    float lipN = snoise(vec3(th * 4.0, rn * 8.0, uTime * 1.5 + uSeed)) * 0.5 + 0.5;
    float foam = lip * smoothstep(0.25, 0.75, lipN) + lip * 0.25;
    // And the drowning edge of the flood front.
    float front = (1.0 - smoothstep(0.0, 0.06, abs(rn - inner))) * step(0.02, 1.0 - uFill) ;
    foam = max(foam, front * lipN);
    col = mix(col, uColorFoam * uFoamGlow, clamp(foam, 0.0, 1.0));

    float a = mask * uOpacity * (0.75 + 0.25 * depth);
    a = max(a, foam * mask);
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

const PULL_FRAGMENT = /* glsl */ `
  uniform float uZone;
  uniform float uFill;
  uniform float uDrain;
  uniform float uPull;
  uniform float uRings;
  uniform float uRingFreq;
  uniform float uStrength;
  uniform float uSpin;
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying vec2 vP;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    float rn = r / max(uZone, 0.1);
    if (rn > 1.0) discard;
    float inner = (1.0 - uFill) * 1.05;
    float dry = (1.0 - uDrain) * 1.05;
    float mask = smoothstep(inner - 0.08, inner, rn) * (1.0 - smoothstep(dry - 0.08, dry, rn));
    // Inward and round: the floor is being dragged toward the middle.
    vec3 inward = (viewMatrix * vec4(-vP.x, 0.0, -vP.y, 0.0)).xyz;
    vec3 round = (viewMatrix * vec4(-vP.y * uSpin, 0.0, vP.x * uSpin, 0.0)).xyz;
    vec2 dir = normalize(inward.xy + round.xy * 0.6 + vec2(1e-4));
    float band = 0.5 + 0.5 * sin(6.2831853 * (r * uRingFreq + uRings));
    float n = snoise(vec3(vP * 0.8, uSeed)) * 0.3;
    float strength = uStrength * uShaderIntensity * mask * (0.3 + 0.7 * band + n) * (0.35 + 0.65 * uPull) * smoothstep(1.0, 0.7, rn);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

/** @param {0|1} mode 0 the water, 1 its pull on LAYER.DISTORTION */
export function createPoolMaterial(mode = 0) {
  const lens = mode === 1;
  const shared = {
    uCenter: { value: new Vector3() },
    uRadius: { value: 5 },
    uZone: { value: 5 },
    uFill: { value: 0 },
    uDrain: { value: 0 },
    uPull: { value: 0 },
    uRings: { value: 0 },
    uRingFreq: { value: 0.5 },
    uSpin: { value: 1 },
    uSeed: { value: 0 }
  };
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: !lens,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: !lens,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms(
      lens
        ? { ...shared, uStrength: { value: 1 } }
        : {
            ...shared,
            uEnvMap: frame.uEnvMap,
            uHasEnv: { value: 0 },
            uStreams: { value: 0 },
            uTurns: { value: 0.5 },
            uRingGlow: { value: 1 },
            uStreamGlow: { value: 1 },
            uAbyss: { value: 0.8 },
            uFoamWidth: { value: 0.5 },
            uFoamGlow: { value: 1.4 },
            uOpacity: { value: 0.9 },
            uEnvAmt: { value: 0.6 },
            uColorAbyss: { value: new Color() },
            uColorDeep: { value: new Color() },
            uColorShallow: { value: new Color() },
            uColorFoam: { value: new Color() },
            uColorRing: { value: new Color() }
          }
    ),
    vertexShader: POOL_VERTEX,
    fragmentShader: lens ? PULL_FRAGMENT : POOL_FRAGMENT
  });

  /** @param {object} state { center, fill, drain, pull, rings, streams, spin, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uZone.value = c.zoneRadius;
    u.uRadius.value = c.zoneRadius * 1.1;
    u.uFill.value = state.fill;
    u.uDrain.value = state.drain;
    u.uPull.value = state.pull;
    u.uRings.value = state.rings;
    u.uRingFreq.value = c.ringFreq * g.noiseFrequency;
    u.uSpin.value = state.spin;
    u.uSeed.value = state.seed;
    if (lens) {
      u.uStrength.value = c.warpStrength * g.distortion;
      return;
    }
    u.uHasEnv.value = frame.uEnvMap.value ? 1 : 0;
    u.uStreams.value = state.streams;
    u.uTurns.value = c.spiralTurns;
    u.uRingGlow.value = c.ringGlow * g.glow;
    u.uStreamGlow.value = c.streamGlow * g.glow;
    u.uAbyss.value = c.abyss;
    u.uFoamWidth.value = c.foamWidth;
    u.uFoamGlow.value = c.foamGlow * g.glow;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uEnvAmt.value = c.envAmount;
    u.uColorAbyss.value.copy(getColor(c.colorAbyss));
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorShallow.value.copy(getColor(c.colorShallow));
    u.uColorFoam.value.copy(getColor(c.colorFoam));
    u.uColorRing.value.copy(getColor(c.colorRing));
  };

  return material;
}
