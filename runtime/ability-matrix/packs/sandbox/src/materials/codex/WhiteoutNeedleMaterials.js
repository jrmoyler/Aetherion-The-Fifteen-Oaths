import { Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Whiteout Needle — the four bespoke shaders.
 *
 *  - **icicle ice** (`createIcicleMaterial`) — opaque, instanced, on
 *    `LAYER.WORLD`. Pale glacial ice with a flat facet normal, a milky core
 *    that thickens toward the root, a sky reflection and a fresnel rim. While
 *    an icicle falls (`aState.y`) its blunt root end burns white-blue — a
 *    comet tail along the streak the instance matrix has stretched it into;
 *    the instant it lands (`aState.w`) the whole spear flashes; and at the
 *    end it **sublimes** from the root down (`aState.z`).
 *  - **the cloud** (`createCloudMaterial`) — the whiteout overhead. A long
 *    grid bent downward in the vertex stage into billows (fbm, drifting with
 *    the wind down the line), shaded as a soft volume: a dark slate belly,
 *    lit white lobes, eroded wisps at its edges. It is drawn only up to a
 *    little ahead of the front, so the storm visibly *runs* down the line.
 *  - **the snowed floor** (`createDriftMaterial`) — the lane goes white
 *    behind the front: wind-combed drift streaks running down the line,
 *    blue in the troughs, a bright powdery leading edge, glints; then it
 *    sublimes off in patches.
 *  - **cold air** (`createColdSheetMaterial`) — the same strip lifted to
 *    waist height on `LAYER.DISTORTION`, sliding noise offsets down the line.
 *
 * Every material reads `settings.whiteout` in `userData.sync()`.
 */

const KEY = 'whiteout';

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* ==================================================================== */
/* Icicle ice                                                             */
/* ==================================================================== */

const ICICLE_VERTEX = /* glsl */ `
  attribute vec4 aState;   // seed, falling (0..1), dissolve, landing flash
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec4 vState;

  void main() {
    vLocal = position;
    vState = aState;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ICICLE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColorIce;
  uniform vec3  uColorMilk;
  uniform vec3  uColorGlow;
  uniform float uEnv;
  uniform float uRimGlow;
  uniform float uTrailGlow;
  uniform float uLandGlow;
  uniform float uCoreGlow;

  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec4 vState;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    float seed = vState.x;
    float falling = vState.y;
    float dissolve = vState.z;
    float land = vState.w;
    float along = clamp(vLocal.y, 0.0, 1.0);   // 0 root .. 1 point

    if (dissolve > 0.0) {
      float n = snoise(vec3(vLocal.xz * 4.0, along * 5.0 + seed * 7.0)) * 0.5 + 0.5;
      // Sublimes from the root down to the buried point.
      if (n * 0.55 + along * 0.45 < dissolve * 1.25 - 0.1) discard;
    }

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(N, V) < 0.0) N = -N;
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float F = pow(1.0 - ndv, 3.0);

    vec3 L = normalize(uLightDir);
    float ndl = max(dot(N, L), 0.0);
    // Clear at the point, milky toward the root.
    float milk = smoothstep(0.9, 0.1, along);
    vec3 albedo = mix(uColorIce, uColorMilk, milk * 0.8);
    vec3 col = albedo * (0.35 + 0.65 * ndl);
    col += texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uEnv * (0.25 + 0.75 * F);
    col += uColorGlow * F * uRimGlow * uGlobalGlow;
    // Bubbles and seams frozen in it.
    float seams = smoothstep(0.75, 0.95, snoise(vec3(vLocal.xz * 6.0, along * 14.0 + seed * 3.0)) * 0.5 + 0.5);
    col += uColorMilk * seams * 0.25;
    col += uColorGlow * (1.0 - smoothstep(0.0, 0.25, length(vLocal.xz))) * uCoreGlow * (0.5 + 0.5 * ndv) * uGlobalGlow;

    // Falling: the root end burns — a streak's tail.
    col += uColorGlow * falling * smoothstep(0.7, 0.0, along) * uTrailGlow * uGlobalGlow * uShaderIntensity;
    // Landing: the whole spear flashes.
    col += uColorGlow * land * uLandGlow * uGlobalGlow;
    // The sublimating edge glows.
    col += uColorGlow * dissolve * (1.0 - along) * uTrailGlow * 0.6;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createIcicleMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uColorIce: { value: new Color() },
      uColorMilk: { value: new Color() },
      uColorGlow: { value: new Color() },
      uEnv: { value: 0.5 },
      uRimGlow: { value: 1 },
      uTrailGlow: { value: 4 },
      uLandGlow: { value: 3 },
      uCoreGlow: { value: 0.5 }
    }),
    vertexShader: ICICLE_VERTEX,
    fragmentShader: ICICLE_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uColorIce.value.copy(getColor(c.colorIce));
    u.uColorMilk.value.copy(getColor(c.colorIceMilk));
    u.uColorGlow.value.copy(getColor(c.colorIceGlow));
    u.uEnv.value = c.iceEnv;
    u.uRimGlow.value = c.iceRimGlow * g.fresnel;
    u.uTrailGlow.value = c.trailGlow * g.glow;
    u.uLandGlow.value = c.landGlow * g.glow;
    u.uCoreGlow.value = c.iceCoreGlow * g.glow;
  };

  return material;
}

/* ==================================================================== */
/* The cloud                                                              */
/* ==================================================================== */

const CLOUD_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uLength;      // metres the grid spans along the line
  uniform float uWidth;
  uniform float uBillow;      // metres of downward billow
  uniform float uScale;
  uniform float uWind;
  uniform float uSeed;

  varying vec3 vWorld;
  varying vec2 vP;            // metres along, metres across
  varying float vLobe;

  ${noiseGLSL}

  void main() {
    vec2 p = vec2(position.x * uLength, position.z * uWidth);
    vP = p;
    vec3 q = vec3(p * uScale * vec2(0.6, 1.0) - vec2(uTime * uWind, 0.0), uSeed);
    float lobe = fbm3(q) * 0.5 + 0.5;
    // Belly hangs lower down the middle of the lane.
    float across = 1.0 - pow(abs(position.z) * 2.0, 2.0);
    vLobe = lobe;
    vec3 pos = position;
    pos.y -= (lobe * uBillow + across * uBillow * 0.4) / max(1e-3, 1.0);
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CLOUD_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  uniform float uLength;
  uniform float uWidth;
  uniform float uLead;        // metres along the cloud reaches
  uniform float uOpacity;
  uniform float uScale;
  uniform float uWind;
  uniform float uSeed;
  uniform float uFade;        // 0..1 thinning out
  uniform float uFlash;       // the volley's flash, lighting its belly
  uniform vec3  uColorBelly;
  uniform vec3  uColorLit;
  uniform vec3  uColorGlow;

  varying vec3 vWorld;
  varying vec2 vP;
  varying float vLobe;

  ${noiseGLSL}

  void main() {
    vec2 p = vP;
    vec3 q = vec3(p * uScale * vec2(0.6, 1.0) - vec2(uTime * uWind, 0.0), uSeed + 4.0);
    float d = fbm4(q * 1.7) * 0.5 + 0.5;
    float wisps = fbm3(q * 4.0 + 2.0) * 0.5 + 0.5;
    // Edges: across the lane, the two ends, and the running front.
    float across = 1.0 - smoothstep(0.25, 0.5, abs(p.y) / uWidth + (wisps - 0.5) * 0.25);
    float start = smoothstep(0.0, 2.5, p.x);
    float front = 1.0 - smoothstep(uLead - 2.5, uLead + 0.5, p.x + (wisps - 0.5) * 2.0);
    float density = clamp(d * 1.25 - 0.1, 0.0, 1.0) * across * start * front;
    density *= 1.0 - smoothstep(0.0, 1.0, uFade * 1.2 - wisps * 0.4);

    // A soft volume from below: lit lobes white, the belly slate.
    float lit = smoothstep(0.35, 0.9, vLobe) * 0.6 + wisps * 0.4;
    vec3 col = mix(uColorBelly, uColorLit, clamp(lit, 0.0, 1.0));
    col += uColorGlow * uFlash * (0.5 + d) * uGlobalGlow;
    float a = density * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createCloudMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uLength: { value: 10 },
      uWidth: { value: 5 },
      uBillow: { value: 1 },
      uScale: { value: 0.4 },
      uWind: { value: 1 },
      uSeed: { value: 0 },
      uLead: { value: 0 },
      uOpacity: { value: 0.8 },
      uFade: { value: 0 },
      uFlash: { value: 0 },
      uColorBelly: { value: new Color() },
      uColorLit: { value: new Color() },
      uColorGlow: { value: new Color() }
    }),
    vertexShader: CLOUD_VERTEX,
    fragmentShader: CLOUD_FRAGMENT
  });

  /** @param {object} s { length, width, lead, seed, fade, flash } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uLength.value = s.length;
    u.uWidth.value = s.width;
    u.uBillow.value = c.cloudBillow;
    u.uScale.value = c.cloudScale * g.noiseFrequency;
    u.uWind.value = c.cloudWind * g.noiseSpeed;
    u.uSeed.value = s.seed;
    u.uLead.value = s.lead;
    u.uOpacity.value = c.cloudOpacity * g.opacity;
    u.uFade.value = s.fade;
    u.uFlash.value = s.flash;
    u.uColorBelly.value.copy(getColor(c.colorCloudBelly));
    u.uColorLit.value.copy(getColor(c.colorCloudLit));
    u.uColorGlow.value.copy(getColor(c.colorIceGlow));
  };

  return material;
}

/* ==================================================================== */
/* The snowed floor                                                       */
/* ==================================================================== */

const STRIP_VERTEX = /* glsl */ `
  uniform float uLength;
  uniform float uWidth;
  varying vec2 vP;
  varying vec3 vWorld;

  void main() {
    vP = vec2(position.x * uLength, position.z * uWidth);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const DRIFT_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uLength;
  uniform float uWidth;
  uniform float uFront;       // metres the snow has reached
  uniform float uStart;       // metres out from the caster the snow begins
  uniform float uSeed;
  uniform float uStreak;
  uniform float uEdgeGlow;
  uniform float uSparkle;
  uniform float uErode;
  uniform float uOpacity;
  uniform float uEndPool;     // metres, the drift heaped round the end
  uniform vec3  uColorSnow;
  uniform vec3  uColorShade;
  uniform vec3  uColorGlow;

  varying vec2 vP;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec2 p = vP;
    // Wind-combed: noise stretched hard down the line.
    float comb = snoise(vec3(p.x * 0.35 * uStreak, p.y * 3.2, uSeed));
    float fine = snoise(vec3(p * vec2(0.8, 7.0), uSeed + 2.0));
    float ragged = snoise(vec3(p * 0.9, uSeed + 5.0));
    float lane = 1.0 - smoothstep(0.3, 0.5, abs(p.y) / uWidth + ragged * 0.12);
    // Heaped round the end of the line.
    float pool = 1.0 - smoothstep(uEndPool * 0.6, uEndPool, length(vec2(p.x - uLength + 2.0, p.y)) + ragged * 0.4);
    float shape = max(lane, pool);
    float reached = 1.0 - smoothstep(uFront - 0.6, uFront + 0.2, p.x + ragged * 0.5);
    float edge = exp(-pow((p.x - uFront) / 0.5, 2.0)) * step(p.x, uFront + 0.5) * lane;

    float body = clamp(0.55 + comb * 0.35 + fine * 0.2, 0.0, 1.0);
    vec3 col = mix(uColorShade, uColorSnow, body);
    float glint = step(0.986, hash13(floor(vec3(vWorld.xz * 40.0, floor(uTime * 5.0)))));
    col += uColorSnow * glint * uSparkle * uGlobalGlow;
    col += uColorGlow * edge * uEdgeGlow * uGlobalGlow * uShaderIntensity;

    float a = shape * reached * (0.55 + 0.45 * body);
    a *= smoothstep(uStart, uStart + 1.5, p.x + ragged * 0.4);
    float n = snoise(vec3(p * 1.4, uSeed * 3.0)) * 0.5 + 0.5;
    float thr = uErode * 1.25 - 0.15;
    a *= smoothstep(thr, thr + 0.12, n * 0.7 + body * 0.3);
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createDriftMaterial() {
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
      uLength: { value: 10 },
      uWidth: { value: 3 },
      uFront: { value: 0 },
      uStart: { value: 0 },
      uSeed: { value: 0 },
      uStreak: { value: 1 },
      uEdgeGlow: { value: 2 },
      uSparkle: { value: 2 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uEndPool: { value: 2 },
      uColorSnow: { value: new Color() },
      uColorShade: { value: new Color() },
      uColorGlow: { value: new Color() }
    }),
    vertexShader: STRIP_VERTEX,
    fragmentShader: DRIFT_FRAGMENT
  });

  /** @param {object} s { length, width, front, seed, erode } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uLength.value = s.length;
    u.uWidth.value = s.width;
    u.uFront.value = s.front;
    u.uStart.value = s.start ?? 0;
    u.uSeed.value = s.seed;
    u.uStreak.value = c.driftStreak * g.noiseFrequency;
    u.uEdgeGlow.value = c.driftEdgeGlow * g.glow;
    u.uSparkle.value = c.driftSparkle;
    u.uErode.value = s.erode;
    u.uOpacity.value = c.driftOpacity * g.opacity;
    u.uEndPool.value = c.volleyRadius + 1.2;
    u.uColorSnow.value.copy(getColor(c.colorSnow));
    u.uColorShade.value.copy(getColor(c.colorSnowShade));
    u.uColorGlow.value.copy(getColor(c.colorIceGlow));
  };

  return material;
}

/* ==================================================================== */
/* Cold air                                                               */
/* ==================================================================== */

const COLD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  uniform float uScale;
  uniform float uFront;
  uniform float uWidth;

  varying vec2 vP;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec3 np = vec3(vP.x * uScale - uTime * 2.0, vP.y * uScale, uTime * 0.7);
    float nx = snoise(np);
    float ny = snoise(np + vec3(17.0, 3.0, 9.0));
    float mask = (1.0 - smoothstep(0.25, 0.5, abs(vP.y) / uWidth)) * (1.0 - smoothstep(uFront - 1.0, uFront + 0.5, vP.x)) * smoothstep(0.0, 1.5, vP.x);
    float s = uStrength * uShaderIntensity * mask;
    if (s < 0.002) discard;
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, s, mask);
  }
`;

export function createColdSheetMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uLength: { value: 10 },
      uWidth: { value: 3 },
      uStrength: { value: 0 },
      uScale: { value: 1.2 },
      uFront: { value: 0 }
    }),
    vertexShader: STRIP_VERTEX,
    fragmentShader: COLD_FRAGMENT
  });

  /** @param {object} s { length, width, front, strength } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uLength.value = s.length;
    u.uWidth.value = s.width;
    u.uFront.value = s.front;
    u.uStrength.value = s.strength * c.coldWarp * g.distortion;
    u.uScale.value = c.coldScale * g.noiseFrequency;
  };

  return material;
}
