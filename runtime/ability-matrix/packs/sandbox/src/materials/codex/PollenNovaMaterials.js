import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Pollen Nova — the bespoke shaders the giant flower is drawn with.
 *
 *  - **the petals** — one instanced parameter-space strip (`createPetalGeometry`)
 *    bent into a petal in the vertex stage. A petal is a circular arc in the
 *    vertical plane through its bearing: it leaves the receptacle at a *pitch*
 *    from vertical and bends by a *curl* along its length, so a bud (pitched up,
 *    curled in — the tips meet over the middle), an open bloom (pitched out,
 *    curled back) and a wilt (pitched past the horizontal, drooping) are three
 *    values of the same two numbers. Each of the four layers — green sepals and
 *    three whorls of petals — has its own length, width, pitch and curl, and
 *    its own *opening* clock, so the bloom unfolds from the outside in. Across
 *    the strip the petal cups upward. The fragment stage is a thin, lit,
 *    *translucent* surface: wrap diffuse from the sun, light transmitted through
 *    from behind (the petal glows where the sun is behind it, and the veins
 *    block that light, so they read dark against it), a soft fresnel rim, a
 *    midrib and fanned side veins, a frilled margin and a notched tip. The wilt
 *    browns the tips first; the dissolve eats it on noise with a dry edge.
 *    A matching depth material makes the flower cast its shadow.
 *  - **the pistil** — instanced stamens round a domed head, emissive gold with
 *    a grain of pollen on the head, charging up before the burst. The same
 *    material draws the green receptacle under the petals.
 *  - **the foliage** — the ground: rings of leaves fanning out from where the bud
 *    tore up through the floor, grass blades combed outward between them, the
 *    torn soil at the middle, and — after the burst — a dusting of gold.
 *  - **the pollen shell** — the nova: an expanding additive sphere of fresnel
 *    light whose surface is grains of pollen, thinning as it grows.
 *  - **the nova lens** — `LAYER.DISTORTION`: the shell bending the world as it
 *    sweeps past.
 *
 * Every material reads `settings.pollen` in `userData.sync(state)`; `state`
 * carries what only the ability knows (the clock-driven envelopes, the centre).
 */

/* -------------------------------------------------------------------- */
/* The petals                                                           */
/* -------------------------------------------------------------------- */

/**
 * The petal frame, shared by the colour and the depth pass so the shadow is the
 * flower's. Layers are packed in vec4s: x sepals, y outer, z middle, w inner.
 */
const PETAL_VERTEX_GLSL = /* glsl */ `
  attribute vec4 aPetal;      // layer, bearing, seed, length jitter (-1..1)

  uniform vec3  uCentre;      // where the receptacle sits at rest
  uniform float uSink;        // metres the whole flower is under its rest
  uniform float uScale;       // whole-flower scale (the bud swells as it rises)
  uniform vec4  uLen;
  uniform vec4  uWidth;
  uniform vec4  uPitchOpen;
  uniform vec4  uCurlOpen;
  uniform vec4  uBaseR;
  uniform vec4  uBaseY;
  uniform vec4  uOpen;        // 0 bud .. 1 open, per layer
  uniform float uPitchBud;
  uniform float uCurlBud;
  uniform float uPitchWilt;
  uniform float uCurlWilt;
  uniform float uWilt;
  uniform float uPulse;
  uniform float uCup;
  uniform float uLenJitter;
  uniform float uFlutter;
  uniform float uTime;

  varying vec2  vSU;          // x: along 0..1, y: across -1..1
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vLayer;
  varying float vSeed;

  float pick(vec4 v, float i) {
    return i < 0.5 ? v.x : i < 1.5 ? v.y : i < 2.5 ? v.z : v.w;
  }

  vec3 petalPoint(out vec3 N) {
    float layer = aPetal.x;
    float th = aPetal.y;
    float seed = aPetal.z;
    float s = position.y;
    float u = position.x;

    float open = pick(uOpen, layer);
    float L = pick(uLen, layer) * (1.0 + aPetal.w * uLenJitter) * uScale;
    float W = pick(uWidth, layer) * uScale;
    // The wilt reaches the outer layers first and each petal on its own clock.
    float wilt = clamp(uWilt * (1.15 - layer * 0.08) - seed * 0.25 * (1.0 - uWilt), 0.0, 1.0);

    float pitch = mix(uPitchBud * (1.0 - layer * 0.15), pick(uPitchOpen, layer), open);
    float curl = mix(uCurlBud, pick(uCurlOpen, layer), open);
    pitch = mix(pitch, uPitchWilt, wilt);
    curl = mix(curl, uCurlWilt, wilt);
    // Breathing before the burst, and a little life in the open petals.
    pitch -= uPulse * 0.1 * (1.0 - layer * 0.2) * open;
    pitch += uFlutter * open * sin(uTime * (1.7 + seed) + seed * 40.0) * (1.0 - wilt);

    // A circular arc of length L: pitch from vertical at the base, curl along it.
    float a = pitch + curl * s;
    float x;
    float y;
    if (abs(curl) < 1e-3) {
      x = L * s * sin(pitch);
      y = L * s * cos(pitch);
    } else {
      x = L * (cos(pitch) - cos(a)) / curl;
      y = L * (sin(a) - sin(pitch)) / curl;
    }

    vec3 R = vec3(cos(th), 0.0, sin(th));
    vec3 T = vec3(-sin(th), 0.0, cos(th));
    vec3 U = vec3(0.0, 1.0, 0.0);
    vec3 tang = sin(a) * R + cos(a) * U;
    vec3 nrm = cos(a) * R - sin(a) * U;

    // Narrow at the base, widest two thirds out, rounded to the tip.
    float sc = clamp(s, 0.0, 1.0);
    float prof = pow(sc, 0.55) * pow(1.0 - sc * 0.985, 0.38) * 1.75;
    prof *= 1.0 - wilt * 0.3;
    float halfW = W * prof;
    float cup = uCup * (1.0 - wilt * 0.6) * halfW;

    vec3 base = uCentre + R * pick(uBaseR, layer) * uScale + U * (pick(uBaseY, layer) * uScale - uSink);
    vec3 p = base + R * x + U * y + T * (u * halfW) - nrm * (cup * u * u);

    vec3 dU = T * halfW - nrm * (cup * 2.0 * u);
    N = normalize(cross(dU, tang * max(L, 0.01)));

    vSU = vec2(s, u);
    vLayer = layer;
    vSeed = seed;
    return p;
  }
`;

const PETAL_VERTEX = /* glsl */ `
  ${PETAL_VERTEX_GLSL}

  void main() {
    vec3 N;
    vec3 p = petalPoint(N);
    vNormalW = N;
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

/** The outline and the dissolve, shared by both passes. */
const PETAL_SHAPE_GLSL = /* glsl */ `
  uniform float uNotch;
  uniform float uFrill;
  uniform float uDissolve;

  /** < 0 outside the petal. */
  float petalShape(vec2 su, float seed) {
    float s = su.x;
    float au = abs(su.y);
    // A notch at the tip — a heart-shaped petal.
    float notch = uNotch * (1.0 - smoothstep(0.0, 0.4, au));
    float frill = (snoise(vec3(s * 9.0, seed * 13.0, su.y * 2.0)) * 0.5 + 0.5) * uFrill * smoothstep(0.2, 0.8, s);
    return min((1.0 - notch) - s, (1.0 - frill) - au);
  }

  float petalDissolve(vec2 su, float seed) {
    return snoise(vec3(su.x * 4.0, su.y * 2.0, seed * 17.0)) * 0.5 + 0.5;
  }
`;

const PETAL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uWilt;
  uniform float uCharge;
  uniform float uChargeGlow;
  uniform float uVeins;
  uniform float uVeinWidth;
  uniform float uVeinStrength;
  uniform float uRibWidth;
  uniform float uSSS;
  uniform float uSSSPower;
  uniform float uRimGlow;
  uniform float uRimPower;
  uniform float uAmbient;
  uniform float uDiffuse;
  uniform float uOpacity;
  uniform vec3  uColorBase;
  uniform vec3  uColorMid;
  uniform vec3  uColorTip;
  uniform vec3  uColorVein;
  uniform vec3  uColorSSS;
  uniform vec3  uColorRim;
  uniform vec3  uColorSepalA;
  uniform vec3  uColorSepalB;
  uniform vec3  uColorWilt;
  uniform vec3  uColorBurn;
  uniform vec3  uColorCharge;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2  vSU;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vLayer;
  varying float vSeed;

  ${noiseGLSL}
  ${PETAL_SHAPE_GLSL}

  void main() {
    if (petalShape(vSU, vSeed) < 0.0) discard;
    float s = clamp(vSU.x, 0.0, 1.0);
    float u = vSU.y;
    float au = abs(u);

    float dn = petalDissolve(vSU, vSeed);
    if (dn < uDissolve) discard;
    float burnEdge = uDissolve > 0.0 ? 1.0 - smoothstep(uDissolve, uDissolve + 0.08, dn) : 0.0;

    // Colour along the petal; the sepals are leaves.
    vec3 petal = mix(uColorBase, uColorMid, smoothstep(0.0, 0.45, s));
    petal = mix(petal, uColorTip, smoothstep(0.45, 1.0, s) * (0.6 + 0.4 * au));
    vec3 sepal = mix(uColorSepalA, uColorSepalB, s);
    float isSepal = 1.0 - step(0.5, vLayer);
    vec3 base = mix(petal, sepal, isSepal);

    // Veins: a midrib and side veins fanning from the base.
    float rib = exp(-pow(u / max(uRibWidth, 0.01), 2.0));
    float fan = u / (s + 0.18);
    float lines = abs(fract(fan * uVeins * 0.5 + 0.5) - 0.5) * 2.0;
    float side = (1.0 - smoothstep(0.0, uVeinWidth, lines)) * smoothstep(0.03, 0.2, s) * (1.0 - smoothstep(0.75, 1.0, s));
    float vein = clamp(max(rib, side * 0.75) * uVeinStrength, 0.0, 1.0);

    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndl = dot(N, L);
    float wrap = clamp(ndl * 0.6 + 0.4, 0.0, 1.0);
    // Transmission: thin petals are lit through from the far side, most at
    // the margins, and the veins block it.
    float thin = 0.55 + 0.45 * au * au;
    float through = clamp(-ndl, 0.0, 1.0) * 0.7 + pow(clamp(dot(V, -L), 0.0, 1.0), uSSSPower) * 0.6;
    float sss = through * uSSS * thin * (1.0 - vein * 0.8) * uShaderIntensity;
    float rim = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), uRimPower) * uRimGlow;

    vec3 albedo = mix(base, uColorVein, vein * (1.0 - isSepal * 0.5));
    vec3 color = albedo * (uAmbient + uDiffuse * wrap);
    color += uColorSSS * mix(albedo, vec3(1.0), 0.35) * sss;
    color += uColorRim * rim * (0.4 + 0.6 * s);
    // The charge: the throat of the flower lighting up gold before it bursts.
    color += uColorCharge * uCharge * uChargeGlow * exp(-s * 4.5) * (1.0 - isSepal);

    // Wilt: dry brown from the tips in, on noise.
    float wn = snoise(vec3(vSU * vec2(5.0, 3.0), vSeed * 9.0)) * 0.2;
    float wl = smoothstep(0.0, 0.35, uWilt * 1.5 - (1.0 - s) * 0.7 + wn);
    color = mix(color, uColorWilt * (uAmbient + uDiffuse * wrap) + uColorWilt * sss * 0.4, wl);
    color = mix(color, uColorBurn, burnEdge);

    gl_FragColor = vec4(color * uGlobalGlow, uOpacity);
  }
`;

const PETAL_DEPTH_VERTEX = /* glsl */ `
  ${PETAL_VERTEX_GLSL}

  void main() {
    vec3 N;
    vec3 p = petalPoint(N);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const PETAL_DEPTH_FRAGMENT = /* glsl */ `
  #include <packing>
  varying vec2  vSU;
  varying float vSeed;
  ${noiseGLSL}
  ${PETAL_SHAPE_GLSL}

  void main() {
    if (petalShape(vSU, vSeed) < 0.0) discard;
    if (petalDissolve(vSU, vSeed) < uDissolve) discard;
    gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
  }
`;

export function createPetalMaterial() {
  const uniforms = sharedUniforms({
    uCentre: { value: new Vector3() },
    uSink: { value: 0 },
    uScale: { value: 1 },
    uLen: { value: new Vector4(1.6, 2.6, 2.1, 1.5) },
    uWidth: { value: new Vector4(0.5, 1.0, 0.85, 0.7) },
    uPitchOpen: { value: new Vector4(1.8, 1.45, 1.1, 0.75) },
    uCurlOpen: { value: new Vector4(0.6, 0.55, 0.45, 0.3) },
    uBaseR: { value: new Vector4(0.5, 0.42, 0.32, 0.22) },
    uBaseY: { value: new Vector4(-0.1, 0, 0.06, 0.12) },
    uOpen: { value: new Vector4() },
    uPitchBud: { value: 0.35 },
    uCurlBud: { value: -0.9 },
    uPitchWilt: { value: 2.4 },
    uCurlWilt: { value: 1.1 },
    uWilt: { value: 0 },
    uPulse: { value: 0 },
    uCup: { value: 0.35 },
    uLenJitter: { value: 0.1 },
    uFlutter: { value: 0.03 },
    uNotch: { value: 0.08 },
    uFrill: { value: 0.08 },
    uDissolve: { value: 0 },
    uCharge: { value: 0 },
    uChargeGlow: { value: 2 },
    uVeins: { value: 9 },
    uVeinWidth: { value: 0.12 },
    uVeinStrength: { value: 0.6 },
    uRibWidth: { value: 0.06 },
    uSSS: { value: 1.2 },
    uSSSPower: { value: 3 },
    uRimGlow: { value: 0.6 },
    uRimPower: { value: 2.5 },
    uAmbient: { value: 0.35 },
    uDiffuse: { value: 0.9 },
    uOpacity: { value: 1 },
    uColorBase: { value: new Color() },
    uColorMid: { value: new Color() },
    uColorTip: { value: new Color() },
    uColorVein: { value: new Color() },
    uColorSSS: { value: new Color() },
    uColorRim: { value: new Color() },
    uColorSepalA: { value: new Color() },
    uColorSepalB: { value: new Color() },
    uColorWilt: { value: new Color() },
    uColorBurn: { value: new Color() },
    uColorCharge: { value: new Color() }
  });

  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms,
    vertexShader: PETAL_VERTEX,
    fragmentShader: PETAL_FRAGMENT
  });

  // Same uniforms by identity: one sync moves both passes.
  material.userData.depth = new ShaderMaterial({
    side: DoubleSide,
    uniforms,
    vertexShader: PETAL_DEPTH_VERTEX,
    fragmentShader: PETAL_DEPTH_FRAGMENT
  });

  /** @param {object} state { centre, sink, scale, open (Vector4), wilt, pulse, charge, dissolve } */
  material.userData.sync = (state) => {
    const c = settings.pollen;
    const g = settings.global;
    const u = uniforms;
    u.uCentre.value.copy(state.centre);
    u.uSink.value = state.sink;
    u.uScale.value = state.scale * c.flowerScale;
    u.uLen.value.set(c.sepalLength, c.outerLength, c.midLength, c.innerLength);
    u.uWidth.value.set(c.sepalWidth, c.outerWidth, c.midWidth, c.innerWidth);
    u.uPitchOpen.value.set(c.sepalPitch, c.outerPitch, c.midPitch, c.innerPitch);
    u.uCurlOpen.value.set(c.sepalCurl, c.outerCurl, c.midCurl, c.innerCurl);
    u.uBaseR.value.set(c.sepalBase, c.outerBase, c.midBase, c.innerBase);
    u.uBaseY.value.set(-0.12, 0, 0.07, 0.14);
    u.uOpen.value.copy(state.open);
    u.uPitchBud.value = c.budPitch;
    u.uCurlBud.value = c.budCurl;
    u.uPitchWilt.value = c.wiltPitch;
    u.uCurlWilt.value = c.wiltCurl;
    u.uWilt.value = state.wilt;
    u.uPulse.value = state.pulse;
    u.uCup.value = c.petalCup;
    u.uLenJitter.value = c.petalJitter * g.randomness;
    u.uFlutter.value = c.petalFlutter * g.noiseStrength;
    u.uNotch.value = c.petalNotch;
    u.uFrill.value = c.petalFrill * g.noiseStrength;
    u.uDissolve.value = state.dissolve;
    u.uCharge.value = state.charge;
    u.uChargeGlow.value = c.chargeGlow * g.glow;
    u.uVeins.value = c.veinCount;
    u.uVeinWidth.value = c.veinWidth;
    u.uVeinStrength.value = c.veinStrength;
    u.uRibWidth.value = c.ribWidth;
    u.uSSS.value = c.petalSSS;
    u.uSSSPower.value = c.petalSSSPower;
    u.uRimGlow.value = c.petalRim * g.fresnel;
    u.uRimPower.value = c.petalRimPower;
    u.uAmbient.value = c.petalAmbient;
    u.uDiffuse.value = c.petalDiffuse;
    u.uOpacity.value = 1;
    u.uColorBase.value.copy(getColor(c.colorPetalBase));
    u.uColorMid.value.copy(getColor(c.colorPetalMid));
    u.uColorTip.value.copy(getColor(c.colorPetalTip));
    u.uColorVein.value.copy(getColor(c.colorPetalVein));
    u.uColorSSS.value.copy(getColor(c.colorPetalSSS));
    u.uColorRim.value.copy(getColor(c.colorPetalRim));
    u.uColorSepalA.value.copy(getColor(c.colorSepalA));
    u.uColorSepalB.value.copy(getColor(c.colorSepalB));
    u.uColorWilt.value.copy(getColor(c.colorWilt));
    u.uColorBurn.value.copy(getColor(c.colorWiltEdge));
    u.uColorCharge.value.copy(getColor(c.colorCharge));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The pistil (and the receptacle)                                      */
/* -------------------------------------------------------------------- */

const PISTIL_VERTEX = /* glsl */ `
  attribute float aPart;      // 0 stalk, 1 anther, 2 pistil head, 3 receptacle

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vPart;

  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec4 world = m * vec4(position, 1.0);
    vNormalW = normalize(mat3(m) * normal);
    vWorld = world.xyz;
    vLocal = position;
    vPart = aPart;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PISTIL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uCharge;      // 0..1 building to the burst
  uniform float uSpent;       // 0..1 after it: the pistil dulls
  uniform float uGlow;
  uniform float uGrain;
  uniform float uSparkle;
  uniform float uRimGlow;
  uniform float uAmbient;
  uniform vec3  uColorStalk;
  uniform vec3  uColorAnther;
  uniform vec3  uColorHead;
  uniform vec3  uColorHot;
  uniform vec3  uColorReceptacle;
  uniform vec3  uColorWilt;
  uniform float uWilt;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vPart;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float wrap = clamp(dot(N, L) * 0.6 + 0.4, 0.0, 1.0);
    float rim = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.5) * uRimGlow;
    float live = 1.0 - uSpent * 0.7;

    vec3 color;
    if (vPart < 0.5) {
      // Stalk: pale, a little translucent at the rim.
      color = uColorStalk * (uAmbient + wrap) + uColorStalk * rim;
    } else if (vPart < 1.5) {
      // Anther: dusted gold, sparkling, glowing with the charge.
      float grain = snoise(vLocal * 40.0 + uTime * 0.5) * 0.5 + 0.5;
      float sparkle = pow(grain, 8.0) * uSparkle;
      color = uColorAnther * (uAmbient + wrap) * (0.8 + 0.4 * grain);
      color += uColorHot * (uCharge * uGlow * (0.5 + grain) + sparkle) * live;
      color += uColorAnther * rim;
    } else if (vPart < 2.5) {
      // The pistil's head: a dome packed with pollen grains.
      vec2 cell = voronoi2(vLocal.xz * uGrain + vLocal.y * 3.0);
      float bump = 1.0 - smoothstep(0.0, 0.45, cell.x);
      color = mix(uColorHead * 0.55, uColorHead, bump) * (uAmbient + wrap);
      color += uColorHot * bump * uCharge * uGlow * 1.3 * live;
      color += uColorHot * rim * (0.3 + uCharge) * live;
    } else {
      // Receptacle: the green bulb the petals grow out of.
      float fibres = snoise(vec3(vLocal.xz * 6.0, vLocal.y * 1.5)) * 0.5 + 0.5;
      color = uColorReceptacle * (uAmbient + wrap) * (0.8 + 0.3 * fibres) + uColorReceptacle * rim * 0.6;
    }
    color = mix(color, uColorWilt * (uAmbient + wrap), uWilt * (vPart < 2.5 ? 0.85 : 0.6));
    gl_FragColor = vec4(color * uGlobalGlow, 1.0);
  }
`;

export function createPistilMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCharge: { value: 0 },
      uSpent: { value: 0 },
      uGlow: { value: 3 },
      uGrain: { value: 7 },
      uSparkle: { value: 2 },
      uRimGlow: { value: 0.5 },
      uAmbient: { value: 0.35 },
      uWilt: { value: 0 },
      uColorStalk: { value: new Color() },
      uColorAnther: { value: new Color() },
      uColorHead: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorReceptacle: { value: new Color() },
      uColorWilt: { value: new Color() }
    }),
    vertexShader: PISTIL_VERTEX,
    fragmentShader: PISTIL_FRAGMENT
  });

  /** @param {object} state { charge, spent, wilt } */
  material.userData.sync = (state) => {
    const c = settings.pollen;
    const g = settings.global;
    const u = material.uniforms;
    u.uCharge.value = state.charge;
    u.uSpent.value = state.spent;
    u.uGlow.value = c.pistilGlow * g.glow;
    u.uGrain.value = c.pistilGrain * g.noiseFrequency;
    u.uSparkle.value = c.pistilSparkle * g.shaderIntensity;
    u.uRimGlow.value = c.pistilRim * g.fresnel;
    u.uAmbient.value = c.petalAmbient;
    u.uWilt.value = state.wilt;
    u.uColorStalk.value.copy(getColor(c.colorStalk));
    u.uColorAnther.value.copy(getColor(c.colorAnther));
    u.uColorHead.value.copy(getColor(c.colorPistil));
    u.uColorHot.value.copy(getColor(c.colorCharge));
    u.uColorReceptacle.value.copy(getColor(c.colorSepalA));
    u.uColorWilt.value.copy(getColor(c.colorWilt));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The foliage on the floor                                             */
/* -------------------------------------------------------------------- */

const FOLIAGE_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;

  varying vec2 vXZ;

  void main() {
    vec2 xz = position.xz * uExtent;
    vXZ = xz;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + xz.x, 0.016, uCentre.z + xz.y, 1.0);
  }
`;

const FOLIAGE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uSpread;      // metres the growth front has reached
  uniform float uInner;       // metres out the first ring of leaves sits
  uniform float uRingGap;
  uniform float uLeafCount;
  uniform float uLeafLength;
  uniform float uLeafWidth;
  uniform float uGrass;
  uniform float uGrassReach;
  uniform float uSoil;        // 0..1 the torn earth in the middle
  uniform float uSoilRadius;
  uniform float uDust;        // 0..1 gold settled on everything
  uniform float uDustGlow;
  uniform float uWilt;
  uniform float uErode;
  uniform float uOpacity;
  uniform vec3  uColorLeafA;
  uniform vec3  uColorLeafB;
  uniform vec3  uColorRib;
  uniform vec3  uColorGrass;
  uniform vec3  uColorSoil;
  uniform vec3  uColorDust;
  uniform vec3  uColorWilt;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec2 vXZ;

  ${noiseGLSL}

  void main() {
    float r = length(vXZ);
    float ang = atan(vXZ.y, vXZ.x);
    vec2 dir = vXZ / max(r, 1e-4);
    vec3 col = vec3(0.0);
    float a = 0.0;

    // 1 · grass blades combed outward, behind the growth front.
    float behind = 1.0 - smoothstep(uSpread - 0.5, uSpread, r);
    float blades = smoothstep(0.55, 0.95, snoise(vec3(dir * 55.0, r * 1.4 + uSeed)));
    float grassBand = smoothstep(uSoilRadius * 0.8, uSoilRadius * 1.2, r) * (1.0 - smoothstep(uGrassReach * 0.75, uGrassReach, r));
    float grass = blades * behind * grassBand * uGrass;
    col = uColorGrass * (0.7 + 0.5 * blades);
    a = grass * 0.85;

    // 2 · leaves, in staggered rings, each unfolding as the front passes it.
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float r0 = uInner + fk * uRingGap;
      float n = uLeafCount + fk * 3.0;
      float cell = (ang / 6.28318530718 + 0.5) * n + fk * 0.37;
      float id = floor(cell);
      float h = fract(sin(id * 12.9898 + fk * 78.233 + uSeed) * 43758.5453);
      float f = fract(cell) - 0.5 + (h - 0.5) * 0.25;
      float len = uLeafLength * (0.7 + 0.6 * h) * (1.0 + fk * 0.15);
      float grow = clamp((uSpread - r0) / max(len, 0.05), 0.0, 1.0);
      float along = (r - r0) / max(len * grow, 1e-3);
      if (grow <= 0.0 || along < 0.0 || along > 1.0) continue;
      float across = f * 6.28318530718 / n * r;
      float halfW = uLeafWidth * len * pow(sin(3.14159 * along), 0.75) * (0.6 + 0.4 * grow);
      float q = across / max(halfW, 1e-3);
      if (abs(q) > 1.0) continue;
      // The leaf folds along its rib: one half faces the sun, the other away.
      float fold = sign(q) * dot(vec2(-dir.y, dir.x), normalize(uLightDir.xz + 1e-4));
      float rib = exp(-q * q * 60.0);
      float veins = smoothstep(0.85, 1.0, abs(sin((along * 7.0 - abs(q) * 2.5) * 3.14159)));
      vec3 leaf = mix(uColorLeafA, uColorLeafB, h * 0.6 + along * 0.4) * (0.75 + 0.3 * fold);
      leaf = mix(leaf, uColorRib, max(rib, veins * 0.35));
      float edge = 1.0 - smoothstep(0.85, 1.0, abs(q));
      col = mix(col, leaf, edge);
      a = max(a, edge);
    }

    // 3 · torn soil where the bud came up through the floor.
    vec2 cr = voronoi2(vXZ * 3.0 + uSeed);
    float soilN = snoise(vec3(vXZ * 2.0, uSeed)) * 0.25;
    float soil = (1.0 - smoothstep(uSoilRadius * 0.7, uSoilRadius, r + soilN)) * uSoil;
    vec3 earth = uColorSoil * (0.6 + 0.6 * smoothstep(0.05, 0.3, cr.x));
    col = mix(col, earth, soil);
    a = max(a, soil);

    // Wilt: green to dry brown.
    float wn = snoise(vec3(vXZ * 0.9, uSeed + 4.0)) * 0.25;
    col = mix(col, uColorWilt * (0.7 + 0.4 * (col.g - col.r + 0.5)), clamp(uWilt * 1.3 + wn, 0.0, 1.0) * (1.0 - soil));

    // 4 · gold dust settled over all of it, glinting.
    if (uDust > 0.0) {
      float specks = pow(snoise(vec3(vXZ * 18.0, uSeed + 2.0)) * 0.5 + 0.5, 10.0);
      float wash = (1.0 - smoothstep(uGrassReach * 0.6, uGrassReach * 1.05, r)) * uDust;
      float glint = 0.6 + 0.4 * sin(uTime * 3.0 + specks * 40.0);
      col = mix(col, uColorDust, wash * 0.25);
      col += uColorDust * specks * wash * uDustGlow * glint * uGlobalGlow;
      a = max(a, wash * (0.25 + specks));
    }

    float n = snoise(vec3(vXZ * 1.1, uSeed * 3.0)) * 0.5 + 0.5;
    float thr = uErode * 1.2 - 0.1;
    float vis = uErode <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.15, n);
    a *= vis * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createFoliageMaterial() {
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
      uCentre: { value: new Vector3() },
      uExtent: { value: 6 },
      uSeed: { value: 0 },
      uSpread: { value: 0 },
      uInner: { value: 0.8 },
      uRingGap: { value: 0.7 },
      uLeafCount: { value: 9 },
      uLeafLength: { value: 1.6 },
      uLeafWidth: { value: 0.28 },
      uGrass: { value: 0.8 },
      uGrassReach: { value: 5 },
      uSoil: { value: 0 },
      uSoilRadius: { value: 1 },
      uDust: { value: 0 },
      uDustGlow: { value: 3 },
      uWilt: { value: 0 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uColorLeafA: { value: new Color() },
      uColorLeafB: { value: new Color() },
      uColorRib: { value: new Color() },
      uColorGrass: { value: new Color() },
      uColorSoil: { value: new Color() },
      uColorDust: { value: new Color() },
      uColorWilt: { value: new Color() }
    }),
    vertexShader: FOLIAGE_VERTEX,
    fragmentShader: FOLIAGE_FRAGMENT
  });

  /** @param {object} state { centre, spread, soil, dust, wilt, erode, seed } */
  material.userData.sync = (state) => {
    const c = settings.pollen;
    const g = settings.global;
    const u = material.uniforms;
    const reach = c.zoneRadius * c.foliageReach;
    u.uCentre.value.copy(state.centre);
    u.uExtent.value = reach + 1;
    u.uSeed.value = state.seed;
    u.uSpread.value = state.spread;
    u.uInner.value = c.leafInner;
    u.uRingGap.value = c.leafRingGap;
    u.uLeafCount.value = Math.max(3, Math.round(c.leafCount));
    u.uLeafLength.value = c.leafLength;
    u.uLeafWidth.value = c.leafWidth;
    u.uGrass.value = c.grassAmount;
    u.uGrassReach.value = reach;
    u.uSoil.value = state.soil;
    u.uSoilRadius.value = c.soilRadius;
    u.uDust.value = state.dust;
    u.uDustGlow.value = c.groundDustGlow * g.glow;
    u.uWilt.value = state.wilt;
    u.uErode.value = state.erode;
    u.uOpacity.value = g.opacity;
    u.uColorLeafA.value.copy(getColor(c.colorLeafA));
    u.uColorLeafB.value.copy(getColor(c.colorLeafB));
    u.uColorRib.value.copy(getColor(c.colorLeafRib));
    u.uColorGrass.value.copy(getColor(c.colorGrass));
    u.uColorSoil.value.copy(getColor(c.colorSoil));
    u.uColorDust.value.copy(getColor(c.colorDust));
    u.uColorWilt.value.copy(getColor(c.colorWilt));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The nova                                                             */
/* -------------------------------------------------------------------- */

const SHELL_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uRadius;
  uniform float uSquash;
  uniform float uLumps;
  uniform float uSeed;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vLocal;
  varying float vViewZ;
  varying float vY;

  ${noiseGLSL}

  void main() {
    vec3 n = normalize(position);
    float lump = snoise(n * 2.5 + uSeed) * uLumps;
    vec3 world = uCentre + vec3(n.x, n.y * uSquash, n.z) * uRadius * (1.0 + lump);
    vNormalW = normalize(vec3(n.x, n.y / max(uSquash, 0.05), n.z));
    vViewDir = cameraPosition - world;
    vLocal = n;
    vY = world.y;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHELL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uAge;         // 0..1 through its run
  uniform float uIntensity;
  uniform float uFresnelPower;
  uniform float uGrainScale;
  uniform float uGrain;
  uniform float uBody;
  uniform float uSoftFade;
  uniform vec3  uColorCore;
  uniform vec3  uColorEdge;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vLocal;
  varying float vViewZ;
  varying float vY;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    if (vY < 0.0) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), uFresnelPower);

    // The shell is pollen: grains of it, thinning into gaps as it spreads.
    float g1 = snoise(vLocal * uGrainScale + vec3(0.0, uTime * 0.4, uSeed)) * 0.5 + 0.5;
    float g2 = snoise(vLocal * uGrainScale * 2.7 - vec3(uSeed, uTime * 0.7, 0.0)) * 0.5 + 0.5;
    float grain = mix(1.0, smoothstep(0.35 + uAge * 0.4, 0.9, g1 * 0.65 + g2 * 0.35), uGrain);

    float life = (1.0 - smoothstep(0.35, 1.0, uAge)) * smoothstep(0.0, 0.05, uAge);
    float energy = (fres + uBody) * grain * life * uIntensity * uShaderIntensity;
    vec3 color = mix(uColorCore, uColorEdge, fres) * energy;

    float mask = 1.0;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (energy * mask < 0.003) discard;
    gl_FragColor = vec4(color * mask * uGlobalGlow, 1.0);
  }
`;

export function createPollenShellMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uRadius: { value: 1 },
      uSquash: { value: 0.7 },
      uLumps: { value: 0.08 },
      uSeed: { value: 0 },
      uAge: { value: 1 },
      uIntensity: { value: 1.5 },
      uFresnelPower: { value: 2.2 },
      uGrainScale: { value: 9 },
      uGrain: { value: 0.8 },
      uBody: { value: 0.08 },
      uSoftFade: { value: 0.5 },
      uColorCore: { value: new Color() },
      uColorEdge: { value: new Color() }
    }),
    vertexShader: SHELL_VERTEX,
    fragmentShader: SHELL_FRAGMENT
  });

  /** @param {object} state { centre, radius, age, seed } */
  material.userData.sync = (state) => {
    const c = settings.pollen;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uRadius.value = state.radius;
    u.uSquash.value = c.shellSquash;
    u.uLumps.value = c.shellLumps * g.noiseStrength;
    u.uSeed.value = state.seed;
    u.uAge.value = state.age;
    u.uIntensity.value = c.shellGlow * g.glow * g.opacity;
    u.uFresnelPower.value = c.shellFresnel / Math.max(0.2, g.fresnel);
    u.uGrainScale.value = c.shellGrainScale * g.noiseFrequency;
    u.uGrain.value = c.shellGrain;
    u.uBody.value = c.shellBody;
    u.uSoftFade.value = c.shellSoftFade;
    u.uColorCore.value.copy(getColor(c.colorShellCore));
    u.uColorEdge.value.copy(getColor(c.colorShellEdge));
  };

  return material;
}

const LENS_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uRadius;
  uniform float uSquash;

  varying vec2  vDirScreen;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  void main() {
    vec3 n = normalize(position);
    vec3 world = uCentre + vec3(n.x, n.y * uSquash, n.z) * uRadius;
    vNormalW = n;
    vViewDir = cameraPosition - world;
    // Outward, in the screen: which way the shell pushes the world behind it.
    vDirScreen = (viewMatrix * vec4(n, 0.0)).xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uShaderIntensity;

  varying vec2  vDirScreen;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  void main() {
    float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    // Strongest just inside the silhouette, where the shell is seen edge-on.
    float band = smoothstep(0.0, 0.25, ndv) * (1.0 - smoothstep(0.25, 0.7, ndv));
    float strength = uStrength * uShaderIntensity * band;
    if (strength < 0.002) discard;
    vec2 dir = normalize(vDirScreen + 1e-5);
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, band);
  }
`;

export function createNovaLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uRadius: { value: 1 },
      uSquash: { value: 0.7 },
      uStrength: { value: 0 }
    }),
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} state { centre, radius, strength } */
  material.userData.sync = (state) => {
    const c = settings.pollen;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uRadius.value = state.radius;
    u.uSquash.value = c.shellSquash;
    u.uStrength.value = state.strength * c.lensStrength * g.distortion;
  };

  return material;
}
