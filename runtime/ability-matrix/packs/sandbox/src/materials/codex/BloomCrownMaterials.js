import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Bloom Crown — the bespoke shaders the crown is drawn with.
 *
 *  - **the petals** (`createBloomPetalMaterial`) — instanced strips curled into
 *    petals in the vertex stage. A petal is an arc in its blossom's plane: it
 *    leaves the heart at a pitch that runs from nearly upright (a closed bud)
 *    to nearly flat (open) and curls along its length; its edges cup inward.
 *    The instance matrix seats it on its blossom, so one deformation serves
 *    every petal of every flower. Shaded opaque: a gold heart running through
 *    blush to a deep tip, veins, light *through* the thin petal, a fresnel
 *    rim, and a white-hot charge as the crown gathers to strike. A matching
 *    depth material gives the crown its own shadow.
 *  - **the hearts and the seed** (`createBloomCoreMaterial`) — glowing orbs,
 *    instanced at the blossoms' hearts, and once more, alone, as the seed they
 *    fuse into: a fresnel shell over a churning, veined interior.
 *  - **the garland** (`createBloomGarlandMaterial`) — a vine circlet strung
 *    from flower to flower, sagging between them, riding the same tilt and
 *    spin; leaf-shaped glints chase round it. It is the *crown* in the name:
 *    the thing that makes seven flowers read as one object.
 *  - **the sigil** (`createBloomSigilMaterial`) — the floor under the crown:
 *    a mandala of petals that lights while the crown turns, flares at the
 *    slam, and sends a ring of green outward across the floor.
 *  - **the warp** (`createBloomWarpMaterial`) — a flat lens ring on
 *    `LAYER.DISTORTION` thrown outward by the slam.
 *
 * Every material reads `settings.bloomcrown` in `userData.sync(state)`.
 */

const ID = 'bloomcrown';

/* ==================================================================== */
/* Petals                                                                */
/* ==================================================================== */

const PETAL_VERTEX_GLSL = /* glsl */ `
  attribute vec4 aPetal;      // open, seed, charge, layer

  uniform float uTime;
  uniform float uLen;
  uniform float uWidth;
  uniform float uInnerScale;
  uniform float uBudPitch;
  uniform float uOpenPitch;
  uniform float uCurlBud;
  uniform float uCurlOpen;
  uniform float uCup;
  uniform float uFlutter;

  varying vec2  vSU;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec4  vPetal;

  vec3 petalLocal(out vec3 N) {
    float s = position.x;
    float u = position.y;
    float open = aPetal.x;
    float inner = aPetal.w;
    float L = uLen * mix(1.0, uInnerScale, inner);
    float a0 = mix(uBudPitch, uOpenPitch * mix(1.0, 0.75, inner), open);
    float k = mix(uCurlBud, uCurlOpen, open) + uFlutter * sin(uTime * 6.0 + aPetal.y * 30.0) * open;
    float ang = a0 + k * s;
    float x;
    float y;
    if (abs(k) < 1e-3) {
      x = sin(a0) * s;
      y = cos(a0) * s;
    } else {
      x = (cos(a0) - cos(a0 + k * s)) / k;
      y = (sin(a0 + k * s) - sin(a0)) / k;
    }
    float prof = pow(s, 0.6) * pow(1.0 - s * 0.975, 0.45) * 1.7;
    float halfW = uWidth * mix(1.0, 0.8, inner) * prof;
    vec3 tang = vec3(sin(ang), cos(ang), 0.0);
    vec3 nIn = vec3(-cos(ang), sin(ang), 0.0);
    float cup = uCup * halfW;
    vec3 p = vec3(x, y, 0.0) * L + vec3(0.0, 0.0, u * halfW) + nIn * cup * u * u;
    N = normalize(cross(vec3(0.0, 0.0, 1.0) + nIn * (2.0 * cup * u / max(halfW, 1e-3)), tang));
    vSU = vec2(s, u);
    vPetal = aPetal;
    return p;
  }

  vec3 petalWorld(out vec3 N) {
    vec3 n;
    vec3 p = petalLocal(n);
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    N = normalize(mat3(model) * n);
    return (model * vec4(p, 1.0)).xyz;
  }
`;

const PETAL_VERTEX = /* glsl */ `
  ${PETAL_VERTEX_GLSL}
  void main() {
    vec3 N;
    vec3 w = petalWorld(N);
    vNormalW = N;
    vWorld = w;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }
`;

const PETAL_FRAGMENT = /* glsl */ `
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColorHeart;
  uniform vec3  uColorMid;
  uniform vec3  uColorTip;
  uniform vec3  uColorVein;
  uniform vec3  uColorRim;
  uniform vec3  uColorCharge;
  uniform float uVeins;
  uniform float uVeinStrength;
  uniform float uSSS;
  uniform float uRimGlow;
  uniform float uHeartGlow;
  uniform float uChargeGlow;
  uniform float uAmbient;
  uniform float uDiffuse;

  varying vec2  vSU;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec4  vPetal;

  ${noiseGLSL}

  void main() {
    float s = clamp(vSU.x, 0.0, 1.0);
    float u = vSU.y;
    float au = abs(u);
    // A soft notch at the tip, and a ragged frill.
    float frill = snoise(vec3(s * 8.0, u * 2.0, vPetal.y * 11.0)) * 0.06;
    if (au > 1.0 - smoothstep(0.85, 1.0, s) * 0.35 + frill) discard;

    vec3 base = mix(uColorHeart, uColorMid, smoothstep(0.0, 0.4, s));
    base = mix(base, uColorTip, smoothstep(0.45, 1.0, s) * (0.7 + 0.3 * au));
    float rib = exp(-pow(u / 0.07, 2.0));
    float fan = abs(fract(u / (s + 0.2) * uVeins * 0.5 + 0.5) - 0.5) * 2.0;
    float vein = max(rib, (1.0 - smoothstep(0.0, 0.14, fan)) * 0.7) * smoothstep(0.05, 0.25, s) * uVeinStrength;
    vec3 albedo = mix(base, uColorVein, clamp(vein, 0.0, 1.0) * 0.6);

    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndl = dot(N, L);
    float wrap = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
    // Light through a thin petal: strongest at the margins, blocked by veins.
    float through = clamp(-ndl, 0.0, 1.0) * 0.6 + pow(clamp(dot(V, -L), 0.0, 1.0), 3.0) * 0.5 + 0.25;
    float sss = through * uSSS * (0.5 + 0.5 * au) * (1.0 - vein * 0.7) * uShaderIntensity;
    float rim = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.5) * uRimGlow;

    vec3 color = albedo * (uAmbient + uDiffuse * wrap);
    color += mix(albedo, vec3(1.0), 0.3) * sss;
    color += uColorRim * rim * (0.4 + 0.6 * s);
    color += uColorHeart * uHeartGlow * exp(-s * 5.0) * vPetal.x;
    // The charge: white-hot from the heart out as the crown gathers to strike.
    float charge = vPetal.z;
    color += uColorCharge * charge * uChargeGlow * (0.4 + 0.6 * smoothstep(1.0, 0.0, s - charge * 0.6));
    gl_FragColor = vec4(color * uGlobalGlow, 1.0);
  }
`;

const PETAL_DEPTH_VERTEX = /* glsl */ `
  ${PETAL_VERTEX_GLSL}
  void main() {
    vec3 N;
    vec3 w = petalWorld(N);
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }
`;

const PETAL_DEPTH_FRAGMENT = /* glsl */ `
  #include <packing>
  varying vec2 vSU;
  void main() {
    if (abs(vSU.y) > 1.0 - smoothstep(0.85, 1.0, vSU.x) * 0.35) discard;
    gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
  }
`;

/** Petals of every blossom: opaque, curled open in the vertex stage — `LAYER.SHAPED`. */
export function createBloomPetalMaterial() {
  const material = new ShaderMaterial({
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uLen: { value: 0.8 },
      uWidth: { value: 0.3 },
      uInnerScale: { value: 0.7 },
      uBudPitch: { value: 0.15 },
      uOpenPitch: { value: 1.3 },
      uCurlBud: { value: -0.6 },
      uCurlOpen: { value: 0.5 },
      uCup: { value: 0.4 },
      uFlutter: { value: 0.1 },
      uColorHeart: { value: new Color() },
      uColorMid: { value: new Color() },
      uColorTip: { value: new Color() },
      uColorVein: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorCharge: { value: new Color() },
      uVeins: { value: 9 },
      uVeinStrength: { value: 0.6 },
      uSSS: { value: 0.8 },
      uRimGlow: { value: 0.6 },
      uHeartGlow: { value: 1.5 },
      uChargeGlow: { value: 3 },
      uAmbient: { value: 0.35 },
      uDiffuse: { value: 0.8 }
    }),
    vertexShader: PETAL_VERTEX,
    fragmentShader: PETAL_FRAGMENT
  });

  material.userData.depth = new ShaderMaterial({
    uniforms: material.uniforms,
    vertexShader: PETAL_DEPTH_VERTEX,
    fragmentShader: PETAL_DEPTH_FRAGMENT,
    side: DoubleSide
  });

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uLen.value = Math.max(0.02, c.petalLength);
    u.uWidth.value = Math.max(0.01, c.petalWidth);
    u.uInnerScale.value = c.innerScale;
    u.uBudPitch.value = c.budPitch;
    u.uOpenPitch.value = c.openPitch;
    u.uCurlBud.value = c.budCurl;
    u.uCurlOpen.value = c.openCurl;
    u.uCup.value = c.petalCup;
    u.uFlutter.value = c.petalFlutter * g.noiseStrength;
    u.uColorHeart.value.copy(getColor(c.colorPetalHeart));
    u.uColorMid.value.copy(getColor(c.colorPetalMid));
    u.uColorTip.value.copy(getColor(c.colorPetalTip));
    u.uColorVein.value.copy(getColor(c.colorPetalVein));
    u.uColorRim.value.copy(getColor(c.colorPetalRim));
    u.uColorCharge.value.copy(getColor(c.colorCharge));
    u.uVeins.value = c.petalVeins;
    u.uVeinStrength.value = c.veinStrength;
    u.uSSS.value = c.petalSSS;
    u.uRimGlow.value = c.petalRimGlow * g.fresnel;
    u.uHeartGlow.value = c.heartGlow * g.glow;
    u.uChargeGlow.value = c.chargeGlow * g.glow;
    u.uAmbient.value = c.petalAmbient;
    u.uDiffuse.value = c.petalDiffuse;
  };

  return material;
}

/* ==================================================================== */
/* Hearts and the seed                                                   */
/* ==================================================================== */

const CORE_VERTEX = /* glsl */ `
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 w = model * vec4(position, 1.0);
    vWorld = w.xyz;
    vLocal = position;
    vNormalW = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uGlow;
  uniform float uRim;
  uniform float uVeins;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3  uColorCore;
  uniform vec3  uColorShell;
  uniform vec3  uColorVein;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = abs(dot(N, V));
    float fres = pow(1.0 - facing, 2.0);
    float churn = fbm3(vLocal * 2.4 + vec3(0.0, uTime * 0.9, uSeed));
    float veins = 1.0 - smoothstep(0.0, 0.12, abs(snoise(vLocal * 3.2 + vec3(uSeed, uTime * 0.4, 0.0))));
    vec3 col = mix(uColorCore, uColorShell, fres);
    col += uColorVein * veins * uVeins * (0.5 + 0.5 * churn);
    float bright = uGlow * (0.6 + 0.4 * facing + 0.3 * churn) + fres * uRim;
    float a = clamp((0.55 + 0.45 * fres) * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(col * bright * a * uGlobalGlow * uShaderIntensity, a);
  }
`;

/** A glowing heart (instanced over the blossoms) or the seed (alone). Additive. */
export function createBloomCoreMaterial(kind) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uGlow: { value: 2 },
      uRim: { value: 2 },
      uVeins: { value: 1 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uColorCore: { value: new Color() },
      uColorShell: { value: new Color() },
      uColorVein: { value: new Color() }
    }),
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT
  });

  /** @param {object} s { glow, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    const seed = kind === 'seed';
    u.uGlow.value = (seed ? c.seedGlow : c.heartCoreGlow) * s.glow * g.glow;
    u.uRim.value = (seed ? c.seedRim : c.heartCoreGlow * 0.6) * g.fresnel;
    u.uVeins.value = seed ? c.seedVeins : 0.4;
    u.uSeed.value = s.seed;
    u.uOpacity.value = g.opacity;
    u.uColorCore.value.copy(getColor(seed ? c.colorSeedCore : c.colorPetalHeart));
    u.uColorShell.value.copy(getColor(seed ? c.colorSeedShell : c.colorCharge));
    u.uColorVein.value.copy(getColor(seed ? c.colorSeedVein : c.colorCharge));
  };

  return material;
}

/* ==================================================================== */
/* The garland — CPU twin: BloomCrownAbility#_blossomPoint               */
/* ==================================================================== */

const GARLAND_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uRingR;
  uniform float uRingY;
  uniform float uSpin;
  uniform float uCount;
  uniform float uTiltAmp;
  uniform float uTiltPhase;
  uniform float uSag;
  uniform float uThick;

  varying vec2  vRing;       // x: 0..1 round, y: 0..1 round the tube
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  vec3 ringPoint(float th) {
    float hang = sin((th - uSpin) * uCount * 0.5);
    float y = uRingY + uTiltAmp * sin(th - uTiltPhase) - uSag * hang * hang;
    return uCentre + vec3(cos(th) * uRingR, y, sin(th) * uRingR);
  }

  void main() {
    float th = position.x * 6.2831853;
    float a = position.y * 6.2831853;
    vec3 c = ringPoint(th);
    vec3 T = normalize(ringPoint(th + 0.01) - ringPoint(th - 0.01));
    vec3 N1 = normalize(cross(T, vec3(0.0, 1.0, 0.0)));
    vec3 B = cross(N1, T);
    vec3 radial = cos(a) * N1 + sin(a) * B;
    // A braid: the tube's own radius swells on a twist.
    float r = uThick * (0.75 + 0.25 * sin(th * 40.0 + a * 2.0));
    vec3 world = c + radial * r;
    vRing = position.xy;
    vNormalW = radial;
    vWorld = world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const GARLAND_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uGlow;
  uniform float uLeaves;
  uniform float uChase;
  uniform float uSpin;
  uniform float uFade;
  uniform vec3  uColorVine;
  uniform vec3  uColorLeaf;

  varying vec2  vRing;
  varying vec3  vNormalW;
  varying vec3  vWorld;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float core = pow(abs(dot(N, V)), 1.5);
    float th = vRing.x * 6.2831853;
    // Leaf glints: little almond lights strung along the vine, chasing round.
    float lp = fract(vRing.x * uLeaves - uTime * uChase);
    float leaf = smoothstep(0.35, 0.0, abs(lp - 0.5)) * (0.5 + 0.5 * sin(vRing.y * 6.2831853 * 2.0));
    float n = snoise(vec3(th * 3.0, vRing.y * 4.0, uTime * 0.6)) * 0.5 + 0.5;
    vec3 col = mix(uColorVine, uColorLeaf, leaf);
    float bright = uGlow * (0.4 + 0.6 * core) * (0.7 + 0.5 * n) + leaf * uGlow * 1.2;
    float a = uFade * (0.35 + 0.65 * core);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * bright * a * uGlobalGlow * uShaderIntensity, a);
  }
`;

/** The vine circlet strung between the blossoms. Additive. */
export function createBloomGarlandMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uRingR: { value: 3 },
      uRingY: { value: 3 },
      uSpin: { value: 0 },
      uCount: { value: 7 },
      uTiltAmp: { value: 0.3 },
      uTiltPhase: { value: 0 },
      uSag: { value: 0.4 },
      uThick: { value: 0.05 },
      uGlow: { value: 2 },
      uLeaves: { value: 40 },
      uChase: { value: 0.5 },
      uFade: { value: 1 },
      uColorVine: { value: new Color() },
      uColorLeaf: { value: new Color() }
    }),
    vertexShader: GARLAND_VERTEX,
    fragmentShader: GARLAND_FRAGMENT
  });

  /** @param {object} s { centre, ringR, ringY, spin, count, tiltAmp, tiltPhase, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRingR.value = Math.max(0.01, s.ringR);
    u.uRingY.value = s.ringY;
    u.uSpin.value = s.spin;
    u.uCount.value = s.count;
    u.uTiltAmp.value = s.tiltAmp;
    u.uTiltPhase.value = s.tiltPhase;
    u.uSag.value = c.garlandSag * Math.min(1, s.ringR / Math.max(0.1, c.zoneRadius * c.crownRadius));
    u.uThick.value = c.garlandThickness;
    u.uGlow.value = c.garlandGlow * g.glow;
    u.uLeaves.value = Math.round(c.garlandLeaves);
    u.uChase.value = c.garlandChase * g.animationSpeed;
    u.uFade.value = s.fade * g.opacity;
    u.uColorVine.value.copy(getColor(c.colorGarland));
    u.uColorLeaf.value.copy(getColor(c.colorGarlandLeaf));
  };

  return material;
}

/* ==================================================================== */
/* The sigil on the floor                                                */
/* ==================================================================== */

const SIGIL_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  varying vec2 vP;
  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    vec3 world = vec3(uCentre.x + p.x, 0.016, uCentre.z + p.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SIGIL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uRadius;      // the crown's circle on the floor
  uniform float uPetals;
  uniform float uSpin;
  uniform float uLit;         // 0..1 the sigil lit under the turning crown
  uniform float uFlare;       // 0..1 decaying, the slam
  uniform float uWave;        // metres the green ring has run out
  uniform float uWaveWidth;
  uniform float uGreen;       // 0..1 the floor greened behind the wave
  uniform float uLine;
  uniform float uGlow;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3  uColorLine;
  uniform vec3  uColorHot;
  uniform vec3  uColorWave;
  uniform vec3  uColorGreen;

  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    vec2 p = vP;
    float r = length(p);
    float a = atan(p.y, p.x) - uSpin;
    float R = uRadius;
    float rn = r / max(R, 0.1);

    // A rose curve of petals, a second one inside it offset half a petal, two rings.
    float rose1 = abs(cos(a * uPetals * 0.5)) * 0.95;
    float rose2 = abs(sin(a * uPetals * 0.5)) * 0.6;
    float lw = uLine;
    float l1 = 1.0 - smoothstep(lw * 0.4, lw, abs(rn - rose1) * R);
    float l2 = 1.0 - smoothstep(lw * 0.4, lw, abs(rn - rose2) * R);
    float ring1 = 1.0 - smoothstep(lw * 0.4, lw, abs(rn - 1.0) * R);
    float ring2 = 1.0 - smoothstep(lw * 0.4, lw, abs(rn - 0.18) * R);
    float lines = max(max(l1, l2 * 0.8), max(ring1, ring2));
    float fill = (1.0 - smoothstep(0.0, 0.08, rn - rose1)) * 0.12 * step(rn, 1.0);
    float sigil = (lines + fill) * (uLit + uFlare * 2.0);

    // The green ring and the greened floor behind it.
    float wave = exp(-pow((r - uWave) / max(uWaveWidth, 0.02), 2.0)) * step(0.01, uWave);
    float behind = (1.0 - smoothstep(uWave - 0.2, uWave + 0.2, r)) * uGreen;
    float grass = snoise(vec3(p * 6.0, uSeed)) * 0.5 + 0.5;

    vec3 col = mix(uColorLine, uColorHot, uFlare) * sigil * uGlow;
    col += uColorWave * wave * uGlow * (0.6 + 0.4 * grass);
    col += uColorGreen * behind * (0.3 + 0.7 * grass) * 0.6;
    float a1 = clamp(max(sigil, max(wave, behind * 0.5)), 0.0, 1.0) * uOpacity;
    if (a1 < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow * uShaderIntensity * a1, a1);
  }
`;

/** The mandala under the crown and the ring of green the slam sends out. Additive. */
export function createBloomSigilMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uExtent: { value: 8 },
      uRadius: { value: 3 },
      uPetals: { value: 7 },
      uSpin: { value: 0 },
      uLit: { value: 0 },
      uFlare: { value: 0 },
      uWave: { value: 0 },
      uWaveWidth: { value: 0.4 },
      uGreen: { value: 0 },
      uLine: { value: 0.06 },
      uGlow: { value: 2 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uColorLine: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorWave: { value: new Color() },
      uColorGreen: { value: new Color() }
    }),
    vertexShader: SIGIL_VERTEX,
    fragmentShader: SIGIL_FRAGMENT
  });

  /** @param {object} s { centre, radius, petals, spin, lit, flare, wave, green, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = Math.max(0.1, s.radius);
    u.uExtent.value = Math.max(s.radius, s.wave) + c.waveWidth * 2 + 0.5;
    u.uPetals.value = s.petals;
    u.uSpin.value = s.spin;
    u.uLit.value = s.lit;
    u.uFlare.value = s.flare;
    u.uWave.value = s.wave;
    u.uWaveWidth.value = c.waveWidth;
    u.uGreen.value = s.green;
    u.uLine.value = c.sigilLine;
    u.uGlow.value = c.sigilGlow * g.glow;
    u.uSeed.value = s.seed;
    u.uOpacity.value = g.opacity;
    u.uColorLine.value.copy(getColor(c.colorSigil));
    u.uColorHot.value.copy(getColor(c.colorSigilHot));
    u.uColorWave.value.copy(getColor(c.colorWave));
    u.uColorGreen.value.copy(getColor(c.colorGreen));
  };

  return material;
}

/* ==================================================================== */
/* The slam's lens ring — LAYER.DISTORTION                               */
/* ==================================================================== */

const WARP_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  varying vec2 vP;
  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    vec3 world = vec3(uCentre.x + p.x, 0.25, uCentre.z + p.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uShaderIntensity;
  uniform float uRingR;
  uniform float uWidth;
  uniform float uStrength;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float ring = exp(-pow((r - uRingR) / max(uWidth, 0.02), 2.0));
    float s = ring * uStrength * uShaderIntensity;
    if (s < 0.002) discard;
    vec2 dir = vP / max(r, 1e-3);
    gl_FragColor = vec4(dir * 0.5 + 0.5, s, ring);
  }
`;

/** The slam bending the air in a ring that runs outward. */
export function createBloomWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uExtent: { value: 6 },
      uRingR: { value: 1 },
      uWidth: { value: 0.4 },
      uStrength: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { centre, ringR, strength } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRingR.value = s.ringR;
    u.uExtent.value = s.ringR + c.warpWidth * 3 + 0.2;
    u.uWidth.value = c.warpWidth;
    u.uStrength.value = s.strength * c.slamWarp * g.distortion;
  };

  return material;
}

