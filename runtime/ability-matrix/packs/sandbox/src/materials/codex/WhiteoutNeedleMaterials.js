import { Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
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
 *  - **the blizzard** (`createBlizzardMaterial`) — the storm's vertical
 *    body: a box raymarched in 18 steps through wind-advected fbm, dense at
 *    the floor and tearing into gusts above, rolling down the line. Shaded
 *    on a four-stop ramp — deep navy where it is thick and low, steel blue
 *    in its body, pale ice where it thins, and white only in the fast
 *    driving streaks — so it reads as a moving mass of snow on the dark
 *    floor, not as white on white. Drawn on the box's front faces with the
 *    depth test, so what stands in front of the storm is never veiled.
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
  uniform float uTower;       // metres the heaped upper shell rises over the belly (0 = the belly)

  varying vec3 vWorld;
  varying vec2 vP;            // metres along, metres across
  varying float vLobe;
  varying float vUp;

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
    // Upper shell: heaped storm cumulus down the lane, so the cloud has a
    // body with height in the chase shot instead of a sheet seen edge-on.
    float heap = sqrt(max(0.0, across));
    vUp = uTower > 0.0 ? heap * (0.4 + 0.6 * lobe) : 0.0;
    if (uTower > 0.0) pos.y += (lobe * uBillow + across * uBillow * 0.4) * 0.9 + uTower * heap * (0.35 + 0.9 * lobe);
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
  uniform float uShade;       // the upper shell darkening toward its foot

  varying vec3 vWorld;
  varying vec2 vP;
  varying float vLobe;
  varying float vUp;

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
    col *= mix(1.0, 0.35 + 0.75 * vUp, uShade);
    col += uColorGlow * uFlash * (0.5 + d) * uGlobalGlow;
    float a = density * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** @param {boolean} [tower] the heaped upper shell rather than the belly */
export function createCloudMaterial(tower = false) {
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
      uColorGlow: { value: new Color() },
      uTower: { value: 0 },
      uShade: { value: 0 }
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
    u.uTower.value = tower ? Math.max(0, c.cloudTower) : 0;
    u.uShade.value = tower ? c.cloudTowerShade : 0;
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
  uniform vec3  uColorCrest;
  uniform vec3  uColorGlow;
  uniform float uWind;        // metres/second the combed streaks run down the line

  varying vec2 vP;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec2 p = vP;
    // Wind-combed: noise stretched hard down the line, and still running.
    float wx = p.x - uTime * uWind;
    float comb = snoise(vec3(wx * 0.35 * uStreak, p.y * 3.2, uSeed + uTime * 0.15));
    float fine = snoise(vec3(vec2(p.x - uTime * uWind * 1.8, p.y) * vec2(0.8, 7.0), uSeed + 2.0));
    float ragged = snoise(vec3(p * 0.9, uSeed + 5.0));
    float lane = 1.0 - smoothstep(0.3, 0.5, abs(p.y) / uWidth + ragged * 0.12);
    // Heaped round the end of the line.
    float pool = 1.0 - smoothstep(uEndPool * 0.6, uEndPool, length(vec2(p.x - uLength + 2.0, p.y)) + ragged * 0.4);
    float shape = max(lane, pool);
    float reached = 1.0 - smoothstep(uFront - 0.6, uFront + 0.2, p.x + ragged * 0.5);
    float edge = exp(-pow((p.x - uFront) / 0.5, 2.0)) * step(p.x, uFront + 0.5) * lane;

    float body = clamp(0.55 + comb * 0.35 + fine * 0.2, 0.0, 1.0);
    vec3 col = mix(uColorShade, uColorSnow, smoothstep(0.1, 0.8, body));
    // Only the crests of the combed ridges catch the pale top stop.
    col = mix(col, uColorCrest, smoothstep(0.88, 1.05, body) * 0.55);
    float glint = step(0.986, hash13(floor(vec3(vWorld.xz * 40.0, floor(uTime * 5.0)))));
    col += uColorCrest * glint * uSparkle * uGlobalGlow;
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
      uColorCrest: { value: new Color() },
      uColorGlow: { value: new Color() },
      uWind: { value: 1 }
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
    u.uColorCrest.value.copy(getColor(c.colorSnowCrest));
    u.uColorGlow.value.copy(getColor(c.colorIceGlow));
    u.uWind.value = c.driftWind * g.noiseSpeed;
  };

  return material;
}

/* ==================================================================== */
/* The blizzard                                                           */
/* ==================================================================== */

const BLIZZARD_VERTEX = /* glsl */ `
  varying vec3 vWorld;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BLIZZARD_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;

  uniform vec3  uOrigin;
  uniform vec3  uDir;         // down the line
  uniform vec3  uAcross;      // the box's local +z in the world
  uniform float uLength;
  uniform float uHeight;
  uniform float uWidth;
  uniform float uStart;       // metres out the snow begins
  uniform float uFront;       // metres the storm has reached
  uniform float uFade;        // 0..1 thinning out
  uniform float uDensity;
  uniform float uScale;
  uniform float uWind;
  uniform float uGust;
  uniform float uStreakGlow;
  uniform float uOpacity;
  uniform float uFlash;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorPale;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  uniform vec3  uColorGlow;

  varying vec3 vWorld;

  ${noiseGLSL}

  vec3 toLocal(vec3 d) { return vec3(dot(d, uDir), d.y, dot(d, uAcross)); }

  // Density of blowing snow at p (metres: along, up, across).
  float density(vec3 p, out float streak) {
    float t = uTime;
    // The whole field rides the wind down the line and rolls over itself.
    vec3 q = vec3(p.x - t * uWind, p.y + 0.6 * sin(p.x * 0.45 - t * 1.6 + p.z * 0.8), p.z);
    q *= uScale * vec3(0.55, 0.9, 0.8);
    float n = fbm3(q + vec3(0.0, -t * 0.35, uSeed)) * 0.5 + 0.5;
    float hp = p.y / max(uHeight, 0.1);
    float prof = exp(-hp * 2.4) * (1.0 - smoothstep(0.5, 1.0, hp + (n - 0.5) * 0.6));
    float lat = 1.0 - smoothstep(0.22, 0.5, abs(p.z) / max(uWidth, 0.1) + (n - 0.5) * 0.3);
    float reach = 1.0 - smoothstep(uFront - 2.5, uFront + 0.3, p.x + (n - 0.5) * 3.0);
    float start = smoothstep(uStart, uStart + 2.5, p.x + (n - 0.5) * 1.5);
    float end = 1.0 - smoothstep(uLength - 2.0, uLength, p.x);
    // Gusts: slow pulses of thicker snow running down the line.
    float gust = 1.0 + uGust * sin(p.x * 0.6 - t * uWind * 0.9 + uSeed);
    float d = clamp(n * 2.7 - 1.2 + prof * 0.25, 0.0, 1.0) * prof * lat * reach * start * end * gust;
    float er = uFade * 1.2 - 0.1;
    d *= smoothstep(er - 0.15, er + 0.15, n);
    // Driving streaks: thin slanted lines racing down the line, inside the body only.
    float s = snoise(vec3((p.x + p.y * 1.1) * 2.2 - t * uWind * 2.6, p.y * 0.35, p.z * 1.6 + uSeed));
    streak = pow(max(s, 0.0), 6.0) * prof * lat * reach * start * end * smoothstep(er - 0.15, er + 0.15, n);
    return d * uDensity;
  }

  void main() {
    vec3 ro = toLocal(cameraPosition - uOrigin);
    vec3 rdW = normalize(vWorld - cameraPosition);
    vec3 rd = toLocal(rdW);
    vec3 bmin = vec3(0.0, 0.0, -0.5 * uWidth);
    vec3 bmax = vec3(uLength, uHeight, 0.5 * uWidth);
    vec3 inv = 1.0 / (rd + vec3(1e-6));
    vec3 t0 = (bmin - ro) * inv;
    vec3 t1 = (bmax - ro) * inv;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float tn = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    if (tf <= tn) discard;

    const int STEPS = 18;
    float dt = (tf - tn) / float(STEPS);
    float jitter = hash13(vec3(gl_FragCoord.xy, floor(uTime * 30.0)));
    vec3 C = vec3(0.0);
    float A = 0.0;
    for (int i = 0; i < STEPS; i++) {
      vec3 p = ro + rd * (tn + (float(i) + jitter) * dt);
      float streak;
      float d = density(p, streak);
      if (d < 0.002 && streak < 0.01) continue;
      float a = 1.0 - exp(-d * dt * 1.7);
      float hp = clamp(p.y / max(uHeight, 0.1), 0.0, 1.0);
      // Thick and low is deep navy; the body is steel; where it thins, pale ice.
      float light = clamp(0.12 + hp * 0.8 - d * 0.5, 0.0, 1.0);
      vec3 col = mix(uColorDeep, uColorBody, smoothstep(0.0, 0.45, light));
      col = mix(col, uColorPale, smoothstep(0.45, 1.0, light));
      col += uColorGlow * uFlash * (0.4 + d) * uGlobalGlow;
      float sa = streak * 0.25 * (1.0 - uFade);
      vec3 sc = uColorCore * uStreakGlow * uGlobalGlow;
      // Over: the streak sits on top of this sample.
      C += (1.0 - A) * (col * a * (1.0 - sa) + sc * sa);
      A += (1.0 - A) * clamp(a + sa - a * sa, 0.0, 1.0);
      if (A > 0.97) break;
    }
    A *= uOpacity;
    if (A < 0.004) discard;
    gl_FragColor = vec4(C / max(A / max(uOpacity, 1e-3), 1e-3), A);
  }
`;

export function createBlizzardMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uOrigin: { value: new Vector3() },
      uDir: { value: new Vector3(1, 0, 0) },
      uAcross: { value: new Vector3(0, 0, 1) },
      uLength: { value: 10 },
      uHeight: { value: 3 },
      uWidth: { value: 5 },
      uStart: { value: 0 },
      uFront: { value: 0 },
      uFade: { value: 0 },
      uDensity: { value: 1 },
      uScale: { value: 0.6 },
      uWind: { value: 4 },
      uGust: { value: 0.3 },
      uStreakGlow: { value: 1.5 },
      uOpacity: { value: 0.85 },
      uFlash: { value: 0 },
      uSeed: { value: 0 },
      uColorCore: { value: new Color() },
      uColorPale: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorGlow: { value: new Color() }
    }),
    vertexShader: BLIZZARD_VERTEX,
    fragmentShader: BLIZZARD_FRAGMENT
  });

  /** @param {object} s { origin, dir, across, length, width, start, front, fade, flash, seed } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uOrigin.value.copy(s.origin);
    u.uDir.value.copy(s.dir);
    u.uAcross.value.copy(s.across);
    u.uLength.value = s.length;
    u.uHeight.value = Math.max(0.2, c.blizzardHeight);
    u.uWidth.value = s.width;
    u.uStart.value = s.start;
    u.uFront.value = s.front;
    u.uFade.value = s.fade;
    u.uDensity.value = c.blizzardDensity;
    u.uScale.value = c.blizzardScale * g.noiseFrequency;
    u.uWind.value = c.blizzardWind * g.noiseSpeed;
    u.uGust.value = c.blizzardGust * g.turbulence;
    u.uStreakGlow.value = c.blizzardStreakGlow * g.glow;
    u.uOpacity.value = c.blizzardOpacity * g.opacity;
    u.uFlash.value = s.flash;
    u.uSeed.value = s.seed;
    u.uColorCore.value.copy(getColor(c.colorBlizzardCore));
    u.uColorPale.value.copy(getColor(c.colorBlizzardPale));
    u.uColorBody.value.copy(getColor(c.colorBlizzardBody));
    u.uColorDeep.value.copy(getColor(c.colorBlizzardDeep));
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
