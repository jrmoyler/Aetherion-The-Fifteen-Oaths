import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Fault Choir — the bespoke shaders.
 *
 *  - **the fissure** (`createFissureMaterial`) — a floor strip down the line
 *    that only exists behind the racing front: a wandering crack whose gap
 *    glows amber-white from deep inside, side fractures branching off it
 *    (F2−F1 cell edges, kept near the gap), a lip of heaved, broken ground
 *    either side, and the *song* — bright pulses running down the gap toward
 *    the target. It cools and seals at the end.
 *  - **the stone** (`createStoneMaterial`) — opaque, instanced, on
 *    `LAYER.WORLD` (prepass, shadows) for the choir's spikes and the lance:
 *    flat facets rebuilt from derivatives, sandstone strata, darker toward
 *    the root, and resonance veins (ridged noise) that glow amber and pulse
 *    with each spike's own note, brightest at the tip.
 *  - **the song rings** (`createRingMaterial(0)`) — instanced quads stood
 *    across the line: rings of sound opening out from each spike as it sings,
 *    several thin bands per ring; additive.
 *  - **their warp** (`createRingMaterial(1)`) — the same rings on
 *    `LAYER.DISTORTION`, pushing the air outward as each wave passes.
 *
 * Every material reads `settings.faultchoir` in `userData.sync()`.
 */

const ID = 'faultchoir';

/* ==================================================================== */
/* The fissure                                                            */
/* ==================================================================== */

const FISSURE_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uHalfWidth;

  varying vec2 vFlat;         // x: metres across, y: metres along

  void main() {
    float across = position.y * uHalfWidth;
    float along = position.x * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = 0.015;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FISSURE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uSeed;
  uniform float uFront;       // metres of fissure opened so far
  uniform float uGap;
  uniform float uEdge;
  uniform float uWander;
  uniform float uWanderScale;
  uniform float uBranch;
  uniform float uGlow;
  uniform float uSong;        // integrated phase of the pulses
  uniform float uSongSpacing;
  uniform float uSongGlow;
  uniform float uSeal;        // 0 open .. 1 sealed
  uniform float uOpacity;
  uniform vec3  uColorGap;
  uniform vec3  uColorHot;
  uniform vec3  uColorLip;
  uniform vec3  uColorDust;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vFlat;

  ${noiseGLSL}

  float cellEdges(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; }
        else if (d < d2) { d2 = d; }
      }
    }
    return sqrt(d2) - sqrt(d1);
  }

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;
    if (along < 0.0 || along > uFront + 0.3) discard;

    // The crack wanders, zig-zagging at two scales.
    float wig = snoise(vec3(along * uWanderScale, uSeed, 0.0)) * uWander
              + snoise(vec3(along * uWanderScale * 5.0, uSeed, 2.0)) * uWander * 0.25;
    float d = abs(x - wig);

    // Opens behind the front, narrows to a hairline at it; seals at the end.
    float behind = uFront - along;
    float open = smoothstep(-0.3, 1.2, behind) * (1.0 - uSeal) * smoothstep(0.0, 0.6, along);
    float w = uGap * open * (0.7 + 0.6 * (snoise(vec3(along * 1.7, uSeed, 5.0)) * 0.5 + 0.5));
    float gap = 1.0 - smoothstep(w * 0.4, w + 0.015, d);

    // Side fractures: cell edges, only near the main crack.
    float cells = cellEdges(vec2(x, along) * 1.6 + uSeed);
    float branch = (1.0 - smoothstep(0.0, 0.05, cells)) * (1.0 - smoothstep(0.0, uEdge, d)) * uBranch * open;

    // The song: bright pulses running down the gap toward the target.
    float pulse = pow(0.5 + 0.5 * sin(6.2831853 * (along / max(uSongSpacing, 0.2) - uSong)), 6.0);
    float heat = gap * (0.55 + 0.45 * open) + branch * 0.6;
    vec3 glow = mix(uColorGap, uColorHot, clamp(gap * (0.4 + pulse * 0.8), 0.0, 1.0));
    glow *= uGlow * (1.0 + pulse * uSongGlow) * uShaderIntensity;

    // The lip: heaved, broken ground, darker plates with dust on top.
    float lipM = (1.0 - smoothstep(uEdge * 0.5, uEdge, d + snoise(vec3(x * 2.0, along * 2.0, uSeed)) * 0.15)) * smoothstep(-0.2, 0.5, behind);
    float plate = cellEdges(vec2(x, along) * 2.6 + 9.0 + uSeed);
    vec3 lip = mix(uColorLip, uColorDust, smoothstep(0.05, 0.3, plate) * 0.6);

    vec3 col = mix(lip, glow * uGlobalGlow, clamp(heat, 0.0, 1.0));
    float a = max(lipM * uOpacity * (1.0 - uSeal * 0.6), heat);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createFissureMaterial() {
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
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uHalfWidth: { value: 2 },
      uSeed: { value: 0 },
      uFront: { value: 0 },
      uGap: { value: 0.2 },
      uEdge: { value: 0.9 },
      uWander: { value: 0.3 },
      uWanderScale: { value: 0.35 },
      uBranch: { value: 0.6 },
      uGlow: { value: 3 },
      uSong: { value: 0 },
      uSongSpacing: { value: 2 },
      uSongGlow: { value: 2 },
      uSeal: { value: 0 },
      uOpacity: { value: 0.9 },
      uColorGap: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorLip: { value: new Color() },
      uColorDust: { value: new Color() }
    }),
    vertexShader: FISSURE_VERTEX,
    fragmentShader: FISSURE_FRAGMENT
  });

  /** @param {object} state { start, dir, side, length, front, song, seal, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uHalfWidth.value = c.crackEdge + c.crackWander + 0.3;
    u.uSeed.value = state.seed;
    u.uFront.value = state.front;
    u.uGap.value = c.crackWidth;
    u.uEdge.value = Math.max(0.05, c.crackEdge);
    u.uWander.value = c.crackWander * g.noiseStrength * g.randomness;
    u.uWanderScale.value = c.crackWanderScale * g.noiseFrequency;
    u.uBranch.value = c.branchAmount;
    u.uGlow.value = c.crackGlow * g.glow;
    u.uSong.value = state.song;
    u.uSongSpacing.value = c.songSpacing;
    u.uSongGlow.value = c.songGlow;
    u.uSeal.value = state.seal;
    u.uOpacity.value = c.crackOpacity * g.opacity;
    u.uColorGap.value.copy(getColor(c.colorGap));
    u.uColorHot.value.copy(getColor(c.colorHot));
    u.uColorLip.value.copy(getColor(c.colorLip));
    u.uColorDust.value.copy(getColor(c.colorDustLip));
  };

  return material;
}

/* ==================================================================== */
/* The stone                                                              */
/* ==================================================================== */

const STONE_VERTEX = /* glsl */ `
  attribute float aH;
  attribute vec2  aSpike;     // x: seed, y: resonance 0..1 (how loud it sings)

  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vH;
  varying vec2  vSpike;

  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vLocal = position;
    vH = aH;
    vSpike = aSpike;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const STONE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSong;
  uniform float uVeinGlow;
  uniform float uVeinScale;
  uniform float uTipGlow;
  uniform float uStrata;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorVein;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vH;
  varying vec2  vSpike;

  ${noiseGLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(N, V) < 0.0) N = -N;
    float diff = clamp(dot(N, uLightDir), 0.0, 1.0);
    float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);

    // Sandstone: strata up the blade, grain, darker toward the root.
    vec3 p = vLocal * vec3(3.0, 1.0, 3.0) + vSpike.x * 5.0;
    float strata = sin(vH * uStrata * 6.2831853 + snoise(p * 1.5) * 1.2) * 0.5 + 0.5;
    float grain = fbm3(p * 4.0) * 0.5 + 0.5;
    vec3 stone = mix(uColorA, uColorB, strata * 0.55 + grain * 0.45);
    stone *= mix(0.45, 1.0, smoothstep(0.0, 0.35, vH));
    vec3 col = stone * (0.25 + 0.85 * diff) + stone * rim * 0.4;

    // Resonance veins: ridged, pulsing with this spike's note, hottest at the tip.
    float vein = ridged(vec3(vLocal.x * uVeinScale * 2.0, vH * uVeinScale * 3.0, vLocal.z * uVeinScale * 2.0 + vSpike.x), 4);
    vein = smoothstep(0.82, 0.97, vein);
    float note = 0.55 + 0.45 * sin(uSong * 6.2831853 * 2.0 + vSpike.x * 3.0 - vH * 6.0);
    float sing = vSpike.y * note;
    float tip = smoothstep(0.7, 1.0, vH) * uTipGlow * sing;
    col += uColorVein * (vein * uVeinGlow * (0.25 + 0.75 * sing) + tip) * uShaderIntensity;
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

export function createStoneMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSong: { value: 0 },
      uVeinGlow: { value: 3 },
      uVeinScale: { value: 2 },
      uTipGlow: { value: 2.5 },
      uStrata: { value: 6 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorVein: { value: new Color() }
    }),
    vertexShader: STONE_VERTEX,
    fragmentShader: STONE_FRAGMENT
  });

  /** @param {object} state { song } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSong.value = state.song;
    u.uVeinGlow.value = c.veinGlow * g.glow;
    u.uVeinScale.value = c.veinScale * g.noiseFrequency;
    u.uTipGlow.value = c.tipGlow * g.glow;
    u.uStrata.value = c.strata;
    u.uColorA.value.copy(getColor(c.colorStoneA));
    u.uColorB.value.copy(getColor(c.colorStoneB));
    u.uColorVein.value.copy(getColor(c.colorVein));
  };

  return material;
}

/* ==================================================================== */
/* The song rings                                                         */
/* ==================================================================== */

const RING_VERTEX = /* glsl */ `
  attribute vec4 aRing;       // centre xyz, progress 0..1
  attribute vec2 aRingLook;   // size (m), glow

  uniform vec3 uAxisU;
  uniform vec3 uAxisV;

  varying vec2  vUv;
  varying float vProg;
  varying float vGlow;

  void main() {
    float size = aRingLook.x;
    vec3 world = aRing.xyz + (uAxisU * position.x + uAxisV * position.y) * size;
    vUv = position.xy;
    vProg = aRing.w;
    vGlow = aRingLook.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform float uWidth;
  uniform float uBands;
  uniform vec3  uColor;
  uniform vec3  uColorHot;
  uniform float uGlobalGlow;

  varying vec2  vUv;
  varying float vProg;
  varying float vGlow;

  ${noiseGLSL}

  void main() {
    if (vProg <= 0.0 || vProg >= 1.0) discard;
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = atan(vUv.y, vUv.x);
    float R = 0.1 + 0.88 * vProg;
    float m = 0.0;
    // Several thin bands trailing one another: a chord, not a single note.
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      if (fi >= uBands) break;
      float Ri = R * (1.0 - fi * 0.16);
      float d = (r - Ri) / max(uWidth * (1.0 - fi * 0.2), 0.004);
      m += exp(-d * d * 2.0) * (1.0 - fi * 0.25);
    }
    // The floor cuts the ring: only the arc above the ground sings.
    float above = smoothstep(-0.05, 0.08, vUv.y + 0.02);
    float breakup = 0.65 + 0.35 * snoise(vec3(cos(a) * 3.0, sin(a) * 3.0, vProg * 3.0));
    float fade = pow(1.0 - vProg, 1.5);
    m *= breakup * fade * vGlow * above;
    if (m < 0.004) discard;
    vec3 col = mix(uColor, uColorHot, exp(-vProg * 4.0));
    gl_FragColor = vec4(col * m * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uWidth;
  uniform float uStrength;
  uniform float uShaderIntensity;

  varying vec2  vUv;
  varying float vProg;
  varying float vGlow;

  void main() {
    if (vProg <= 0.0 || vProg >= 1.0) discard;
    float r = length(vUv);
    if (r > 1.0) discard;
    float R = 0.1 + 0.88 * vProg;
    float d = (r - R) / max(uWidth * 3.0, 0.01);
    float slope = -d * exp(-d * d);
    vec2 dir = vUv / max(r, 1e-4);
    float mask = exp(-d * d) * (1.0 - vProg);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * clamp(slope * 2.0, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** @param {0|1} mode 0 the visible rings, 1 their warp on LAYER.DISTORTION */
export function createRingMaterial(mode = 0) {
  const warp = mode === 1;
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: !warp,
    blending: warp ? NormalBlending : AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uAxisU: { value: new Vector3(1, 0, 0) },
      uAxisV: { value: new Vector3(0, 1, 0) },
      uWidth: { value: 0.05 },
      uBands: { value: 3 },
      uStrength: { value: 1 },
      uColor: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: RING_VERTEX,
    fragmentShader: warp ? WARP_FRAGMENT : RING_FRAGMENT
  });

  /** @param {object} state { axisU, axisV } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uAxisU.value.copy(state.axisU);
    u.uAxisV.value.copy(state.axisV);
    u.uWidth.value = c.ringWidth;
    u.uBands.value = Math.max(1, Math.min(4, Math.round(c.ringBands)));
    u.uStrength.value = c.ringWarp * g.distortion;
    u.uColor.value.copy(getColor(c.colorRing));
    u.uColorHot.value.copy(getColor(c.colorHot));
  };

  return material;
}
