import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Chrono Fracture — the five bespoke shaders the clockwork sphere is drawn with.
 *
 *  - **the rings** — gold gyroscope bands. The vertex stage re-places every
 *    vertex of a torus blank from uniforms, stretching its round cross-section
 *    into a flat band, so the ring's radius, tube and width are live sliders.
 *    The fragment stage engraves it: a tick every 6°, longer every fifth, and
 *    clusters of numeral-like dashes at the hours, cut as dark grooves with
 *    light trapped in them; the metal itself is a tinted reflection of the
 *    stage's own sky (`frame.uEnvMap`) with a hot highlight.
 *  - **the clock face** — the ground sigil: bezel rings, sixty ticks, an inner
 *    gear with teeth, and three hands, the second sweeping with a glowing wedge
 *    behind it. Pure SDF, drawn on with `uOpen`.
 *  - **the glass** — instanced panes, both the shards suspended inside and the
 *    shell fragments after it breaks. Fresnel-heavy, sky-reflecting, an
 *    iridescent thin-film tint in the rims and caustic lines through the body.
 *  - **the shell** — the sphere of stopped time: almost invisible, a fresnel
 *    rim, a faint hex lattice, and the **cracks**: the edges of a 3D voronoi
 *    field, revealed outward from an impact point as `uCrack` runs 0 → 1, so
 *    the fracture visibly *races* across the sphere rather than fading in.
 *  - **the lens** — a camera-facing proxy on LAYER.DISTORTION: a slow time
 *    eddy while the sphere holds, a hard outward ring at the shatter.
 */

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* -------------------------------------------------------------------- */
/* the rings                                                            */
/* -------------------------------------------------------------------- */

const RING_VERTEX = /* glsl */ `
  uniform float uMajor;   // ring radius, metres
  uniform float uTube;    // tube half-thickness, metres
  uniform float uBand;    // band half-width along the axis, × uTube

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vTheta;   // 0..1 round the ring
  varying vec2  vSection; // (outward, along the axis) in -1..1

  void main() {
    // TorusGeometry(1, 0.5): the tube centre is at unit radius in XY.
    float theta = atan(position.y, position.x);
    vec2 dir = vec2(cos(theta), sin(theta));
    vec3 centre = vec3(dir, 0.0);
    vec3 off = position - centre;            // length 0.5
    float outward = dot(off.xy, dir) * 2.0;  // -1..1
    float along = off.z * 2.0;               // -1..1
    vSection = vec2(outward, along);
    vTheta = theta / 6.2831853 + 0.5;

    float a = uTube;
    float b = uTube * uBand;
    vec3 pos = vec3(dir * (uMajor + outward * a), along * b);
    // The normal of an elliptical section.
    vec3 n = normalize(vec3(dir * (outward / max(a, 1e-4)), along / max(b, 1e-4)));

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uTicks;
  uniform float uTickDepth;
  uniform float uTickWidth;
  uniform float uNumerals;
  uniform float uEngraveGlow;
  uniform float uPulse;
  uniform float uTick;        // 0..1, decaying after each tick of the second hand
  uniform float uMetal;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uFresnel;
  uniform float uSeed;
  uniform float uFade;
  uniform vec3  uColorGold;
  uniform vec3  uColorDeep;
  uniform vec3  uColorEngrave;
  uniform vec3  uColorSpec;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vTheta;
  varying vec2  vSection;

  ${noiseGLSL}
  ${ENV_GLSL}

  /** An AA groove centred on every integer of x, half-width w (fraction of a cell). */
  float groove(float x, float w) {
    float fw = fwidth(x);
    float d = abs(fract(x + 0.5) - 0.5);
    return 1.0 - smoothstep(w, w + fw * 1.5, d);
  }

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    /* --- engravings, cut into the band's outer face --- */
    float face = smoothstep(0.2, 0.7, vSection.x);           // the outward face only
    float across = vSection.y;                                // -1..1 across the band
    float t = vTheta * uTicks;
    float major = groove(t / 5.0, uTickWidth / 5.0);           // every fifth tick
    float tick = groove(t, uTickWidth) * (1.0 - step(0.45, abs(across)));
    tick = max(tick, major * (1.0 - step(0.75, abs(across))));

    // Numerals: at each hour a cluster of 1–4 short dashes along the band,
    // like Roman numerals seen too small to read.
    float hourF = vTheta * uNumerals;
    float hour = floor(hourF + 0.5);
    float local = (hourF - hour) * uTicks / max(uNumerals, 1.0); // in tick cells
    float count = 1.0 + floor(hash11(hour + uSeed) * 4.0);
    float dash = 0.0;
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      if (fk >= count) break;
      float x = local - (fk - (count - 1.0) * 0.5) * 0.45;
      dash = max(dash, (1.0 - smoothstep(0.07, 0.12, abs(x))) * step(abs(across - 0.0), 0.95) * step(0.55, abs(across)));
    }
    float engraved = clamp(max(tick, dash) * face, 0.0, 1.0);

    /* --- the gold --- */
    float brushed = snoise(vec3(vTheta * 180.0, across * 3.0, uSeed)) * 0.06;
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    float fres = 0.35 + 0.65 * pow(1.0 - ndv, 5.0) * uFresnel;
    float lambert = 0.3 + 0.7 * clamp(dot(N, L), 0.0, 1.0);
    vec3 gold = uColorGold * (lambert * 0.45 + brushed) + uColorGold * env * uMetal * fres;
    gold += uColorSpec * pow(clamp(dot(N, H), 0.0, 1.0), uGloss) * uSpecular;
    // A cheap ambient floor so a ring on the shadow side of a night stage is
    // still gold rather than black.
    gold += uColorDeep * 0.35;

    // Grooves are dark metal with light caught at the bottom.
    float pulse = 1.0 + uPulse * uTick;
    vec3 color = mix(gold, uColorDeep * 0.6, engraved * uTickDepth);
    color += uColorEngrave * engraved * uEngraveGlow * pulse * uGlobalGlow;
    color *= uFade;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** One gold gyroscope ring. Opaque; one material per ring, all sharing the blank. */
export function createChronoRingMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uMajor: { value: 1 },
      uTube: { value: 0.05 },
      uBand: { value: 2.5 },
      uTicks: { value: 60 },
      uTickDepth: { value: 0.5 },
      uTickWidth: { value: 0.12 },
      uNumerals: { value: 12 },
      uEngraveGlow: { value: 2 },
      uPulse: { value: 0.3 },
      uTick: { value: 0 },
      uMetal: { value: 1 },
      uGloss: { value: 60 },
      uSpecular: { value: 2 },
      uFresnel: { value: 1 },
      uSeed: { value: 0 },
      uFade: { value: 1 },
      uColorGold: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorEngrave: { value: new Color() },
      uColorSpec: { value: new Color() }
    }),
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT
  });

  /** @param {object} state { major, tube, tick, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.chrono;
    const g = settings.global;
    const u = material.uniforms;
    u.uMajor.value = Math.max(0.02, state.major ?? 1);
    u.uFade.value = state.fade ?? 1;
    u.uSeed.value = state.seed ?? 0;
    u.uTube.value = Math.max(0.0005, c.ringTube * (state.tube ?? 1));
    u.uTick.value = state.tick ?? 0;
    u.uBand.value = Math.max(0.2, c.ringBand);
    u.uTicks.value = Math.max(1, Math.round(c.ringTicks));
    u.uTickDepth.value = c.ringTickDepth;
    u.uTickWidth.value = c.ringTickWidth;
    u.uNumerals.value = Math.max(1, Math.round(c.ringNumerals));
    u.uEngraveGlow.value = c.ringEngraveGlow * g.glow * g.shaderIntensity;
    u.uPulse.value = c.ringPulse;
    u.uMetal.value = c.ringMetal;
    u.uGloss.value = c.ringGloss;
    u.uSpecular.value = c.ringSpecular;
    u.uFresnel.value = c.ringFresnel * g.fresnel;
    u.uColorGold.value.copy(getColor(c.colorGold));
    u.uColorDeep.value.copy(getColor(c.colorGoldDeep));
    u.uColorEngrave.value.copy(getColor(c.colorEngrave));
    u.uColorSpec.value.copy(getColor(c.colorGoldSpec));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the clock face                                                       */
/* -------------------------------------------------------------------- */

const CLOCK_VERTEX = /* glsl */ `
  uniform float uQuadSize;
  varying vec2 vFlat;

  void main() {
    vFlat = (uv - 0.5) * uQuadSize;
    vFlat.y = -vFlat.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CLOCK_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;
  uniform float uOpen;        // 0..1 drawn on
  uniform float uHour;        // hand angles, radians
  uniform float uMinute;
  uniform float uSecond;
  uniform float uTicks;
  uniform float uGear;
  uniform float uGearTeeth;
  uniform float uGearAngle;
  uniform float uLine;
  uniform float uGlowWidth;
  uniform float uSweep;
  uniform float uSweepGlow;
  uniform float uCoreGlow;
  uniform float uHaloGlow;
  uniform float uFade;
  uniform float uOpacity;
  uniform vec3  uColorCore;
  uniform vec3  uColorGlow;
  uniform vec3  uColorSweep;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  const float TAU = 6.28318530718;

  float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  vec2 polar(float a, float r) { return vec2(cos(a), sin(a)) * r; }

  void main() {
    float R = max(uRadius, 0.05);
    float r = length(vFlat);
    if (r > R * 1.15) discard;
    float a = atan(vFlat.y, vFlat.x);
    // Clockwise from 12 o'clock, measured along the cast.
    float clockA = fract((1.5707963 - a) / TAU + 1.0);

    // Drawn on: everything inside the reveal radius, the bezel sweeping round.
    float reveal = uOpen;
    float d = 1e3;

    /* bezel */
    float bezelShown = step(clockA, reveal);
    d = min(d, mix(1e3, abs(r - R), bezelShown));
    d = min(d, mix(1e3, abs(r - R * 0.93), bezelShown));

    /* ticks: sixty, the fives longer */
    if (r > R * 0.78 && r < R * 0.93) {
      float n = max(1.0, floor(uTicks + 0.5));
      float idx = floor(clockA * n + 0.5);
      float ta = 1.5707963 - idx / n * TAU;
      bool five = mod(idx, 5.0) < 0.5;
      float inner = five ? R * 0.8 : R * 0.86;
      float shown = step(idx / n, reveal);
      d = min(d, mix(1e3, sdSegment(vFlat, polar(ta, inner), polar(ta, R * 0.92)), shown));
    }

    /* the gear: a toothed ring, turning */
    {
      float gr = R * uGear;
      float teeth = max(3.0, floor(uGearTeeth + 0.5));
      float tooth = step(0.5, fract((a - uGearAngle) / TAU * teeth));
      float rr = gr + tooth * R * 0.045;
      float shown = smoothstep(0.3, 0.6, reveal);
      d = min(d, mix(1e3, abs(r - rr), step(0.001, shown)));
      d = min(d, mix(1e3, abs(r - gr * 0.55), step(0.5, reveal)));
    }

    /* the hands */
    float handsOn = smoothstep(0.55, 0.85, reveal);
    if (handsOn > 0.0) {
      d = min(d, sdSegment(vFlat, vec2(0.0), polar(uHour, R * 0.45)) - uLine * 1.6);
      d = min(d, sdSegment(vFlat, vec2(0.0), polar(uMinute, R * 0.72)) - uLine * 0.8);
      d = min(d, sdSegment(vFlat, polar(uSecond + 3.14159, R * 0.15), polar(uSecond, R * 0.88)));
      d = min(d, abs(r - R * 0.04));
    }

    float aa = fwidth(d) + 1e-4;
    float core = 1.0 - smoothstep(uLine, uLine + aa * 1.5, d);
    float glow = exp(-max(d - uLine, 0.0) / max(uGlowWidth, 1e-3));

    // The wedge of light the second hand drags behind it.
    float behind = fract((uSecond - a) / TAU + 1.0) * TAU;  // radians behind the hand
    float wedge = (1.0 - smoothstep(0.0, max(uSweep, 1e-3), behind)) * step(r, R * 0.9) * handsOn;

    vec3 color = uColorCore * core * uCoreGlow + uColorGlow * glow * uHaloGlow;
    color += uColorSweep * wedge * uSweepGlow * (0.3 + 0.7 * r / R);
    color *= uGlobalGlow * uFade * uOpacity;
    float alpha = clamp(core + glow * 0.6 + wedge * 0.4, 0.0, 1.0) * uFade * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

/** The clock-face ground sigil. Additive ground quad. */
export function createChronoClockMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 8 },
      uRadius: { value: 3 },
      uOpen: { value: 0 },
      uHour: { value: 0 },
      uMinute: { value: 0 },
      uSecond: { value: 0 },
      uTicks: { value: 60 },
      uGear: { value: 0.4 },
      uGearTeeth: { value: 24 },
      uGearAngle: { value: 0 },
      uLine: { value: 0.02 },
      uGlowWidth: { value: 0.08 },
      uSweep: { value: 0.9 },
      uSweepGlow: { value: 0.6 },
      uCoreGlow: { value: 2.5 },
      uHaloGlow: { value: 0.8 },
      uFade: { value: 1 },
      uOpacity: { value: 1 },
      uColorCore: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorSweep: { value: new Color() }
    }),
    vertexShader: CLOCK_VERTEX,
    fragmentShader: CLOCK_FRAGMENT
  });

  /** @param {object} state { quadSize, radius, open, hour, minute, second, gear, fade } */
  material.userData.sync = (state) => {
    const c = settings.chrono;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize ?? 8;
    u.uRadius.value = state.radius ?? 3;
    u.uOpen.value = state.open ?? 0;
    u.uHour.value = state.hour ?? 0;
    u.uMinute.value = state.minute ?? 0;
    u.uSecond.value = state.second ?? 0;
    u.uGearAngle.value = state.gear ?? 0;
    u.uFade.value = state.fade ?? 1;
    u.uTicks.value = c.clockTicks;
    u.uGear.value = c.clockGear;
    u.uGearTeeth.value = c.clockGearTeeth;
    u.uLine.value = c.clockLine;
    u.uGlowWidth.value = c.clockGlowWidth;
    u.uSweep.value = c.clockSweep;
    u.uSweepGlow.value = c.clockSweepGlow * g.glow;
    u.uCoreGlow.value = c.clockCoreGlow * g.glow;
    u.uHaloGlow.value = c.clockHaloGlow * g.glow * g.shaderIntensity;
    u.uOpacity.value = c.clockOpacity * g.opacity;
    u.uColorCore.value.copy(getColor(c.colorClockCore));
    u.uColorGlow.value.copy(getColor(c.colorClockGlow));
    u.uColorSweep.value.copy(getColor(c.colorClockSweep));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the glass                                                            */
/* -------------------------------------------------------------------- */

const GLASS_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aGlow;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vSeed;
  varying float vGlow;

  void main() {
    vLocal = position;
    vSeed = aSeed;
    vGlow = aGlow;
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

const GLASS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFresnel;
  uniform float uEnv;
  uniform float uIridescence;
  uniform float uCaustic;
  uniform float uGlow;
  uniform float uFade;
  uniform vec3  uColorGlass;
  uniform vec3  uColorRim;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vSeed;
  varying float vGlow;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 3.0) * uFresnel;

    // What the pane reflects, and what it bends through it — the second is a
    // fake, but sampling the sky along a refracted ray is what reads as glass
    // rather than as a tinted plane.
    vec3 refl = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    vec3 refr = texture2D(uEnvMap, equirectUv(refract(-V, N, 0.66))).rgb;

    // Thin-film colour where the light grazes.
    float film = ndv * 6.0 + vSeed * 3.0;
    vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + film));

    // Caustic lines: bright folds of light inside the pane.
    float caustic = pow(1.0 - abs(snoise(vec3(vLocal.xy * 9.0, vSeed + uTime * 0.2))), 8.0) * uCaustic;
    float spec = pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), 120.0) * 3.0;

    vec3 color = uColorGlass * refr * 0.5 + refl * uEnv * (0.15 + fres);
    color += mix(uColorRim, uColorRim * irid, uIridescence) * fres;
    color += (uColorGlass * caustic + vec3(spec)) * uGlow;
    color += uColorRim * vGlow * 2.0;
    color *= uGlobalGlow;

    float alpha = clamp(uOpacity + fres * 0.6 + caustic * 0.3 + vGlow, 0.0, 1.0) * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

/** Refractive-looking glass panes. Transparent; used on InstancedMeshes. */
export function createChronoGlassMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uOpacity: { value: 0.4 },
      uFresnel: { value: 2 },
      uEnv: { value: 1 },
      uIridescence: { value: 0.6 },
      uCaustic: { value: 0.8 },
      uGlow: { value: 1 },
      uFade: { value: 1 },
      uColorGlass: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: GLASS_VERTEX,
    fragmentShader: GLASS_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {object} state { fade } */
  material.userData.sync = (state) => {
    const c = settings.chrono;
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = state.fade ?? 1;
    u.uOpacity.value = c.glassOpacity * g.opacity;
    u.uFresnel.value = c.glassFresnel * g.fresnel;
    u.uEnv.value = c.glassEnv;
    u.uIridescence.value = c.glassIridescence;
    u.uCaustic.value = c.glassCaustic * g.shaderIntensity;
    u.uGlow.value = c.glassGlow * g.glow;
    u.uColorGlass.value.copy(getColor(c.colorGlass));
    u.uColorRim.value.copy(getColor(c.colorGlassRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the shell                                                            */
/* -------------------------------------------------------------------- */

const SHELL_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;

  void main() {
    vLocal = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHELL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFresnel;
  uniform float uGlow;
  uniform float uHex;
  uniform float uHexScale;
  uniform float uCrack;       // 0..1 how far the fracture has spread
  uniform float uCrackScale;
  uniform float uCrackWidth;
  uniform float uCrackGlow;
  uniform float uCrackJag;
  uniform vec3  uImpact;      // unit direction the fracture starts from
  uniform float uSeed;
  uniform float uFade;
  uniform vec3  uColorShell;
  uniform vec3  uColorRim;
  uniform vec3  uColorCrack;
  uniform vec3  uColorHot;
  uniform float uGlobalGlow;

  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;

  ${noiseGLSL}

  /** F2 − F1 of a 3D voronoi field: zero on the cell walls. */
  float voronoiEdge(vec3 p) {
    vec3 n = floor(p);
    vec3 f = fract(p);
    float f1 = 8.0, f2 = 8.0;
    for (int k = -1; k <= 1; k++)
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec3 g = vec3(float(i), float(j), float(k));
      vec3 cell = n + g;
      vec3 o = vec3(hash13(cell), hash13(cell + 17.1), hash13(cell + 41.7));
      vec3 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
    return sqrt(f2) - sqrt(f1);
  }

  /** A hex lattice on a 2D chart: distance to the nearest cell edge, 0..0.5. */
  float hexEdge(vec2 p) {
    vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(p, s) - s * 0.5;
    vec2 b = mod(p - s * 0.5, s) - s * 0.5;
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    vec2 q = abs(h);
    return 0.5 - max(dot(q, normalize(s)), q.x);
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = abs(dot(N, V));
    float rim = pow(1.0 - ndv, uFresnel);

    // Lattice on a lat-long chart, faded at the poles where it pinches.
    float lat = asin(clamp(vLocal.y, -1.0, 1.0));
    float lon = atan(vLocal.z, vLocal.x);
    float hex = 1.0 - smoothstep(0.0, 0.05, hexEdge(vec2(lon * cos(lat), lat) * uHexScale));
    hex *= uHex * (1.0 - smoothstep(0.75, 1.0, abs(vLocal.y)));

    // The fracture: cell walls revealed outward from the impact point.
    vec3 jag = vLocal * uCrackScale + snoise(vLocal * 6.0 + uSeed) * uCrackJag;
    float edge = voronoiEdge(jag + uSeed);
    float line = 1.0 - smoothstep(uCrackWidth * 0.5, uCrackWidth, edge);
    float reach = acos(clamp(dot(vLocal, normalize(uImpact)), -1.0, 1.0)) / 3.14159;  // 0 at impact, 1 opposite
    float front = uCrack * 1.25;
    float shown = 1.0 - smoothstep(front - 0.08, front, reach);
    float crack = line * shown * step(0.001, uCrack);
    // The newest cracks, nearest the front, are white hot.
    float fresh = smoothstep(front - 0.35, front, reach) * shown;

    vec3 color = uColorShell * (0.15 + rim * 0.85) * uGlow + uColorRim * rim * uGlow;
    color += uColorRim * hex * 0.6;
    color += mix(uColorCrack, uColorHot, fresh) * crack * uCrackGlow;
    color *= uGlobalGlow * uFade;

    float alpha = clamp(uOpacity * (0.2 + rim) + hex * 0.25 + crack, 0.0, 1.0) * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

/** The sphere of stopped time, and the cracks across it. Additive; double-sided. */
export function createChronoShellMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uOpacity: { value: 0.3 },
      uFresnel: { value: 2.4 },
      uGlow: { value: 1.4 },
      uHex: { value: 0.3 },
      uHexScale: { value: 7 },
      uCrack: { value: 0 },
      uCrackScale: { value: 4.5 },
      uCrackWidth: { value: 0.04 },
      uCrackGlow: { value: 5 },
      uCrackJag: { value: 0.25 },
      uImpact: { value: new Vector3(0, 1, 0) },
      uSeed: { value: 0 },
      uFade: { value: 1 },
      uColorShell: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorCrack: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: SHELL_VERTEX,
    fragmentShader: SHELL_FRAGMENT
  });

  /** @param {object} state { crack, impact, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.chrono;
    const g = settings.global;
    const u = material.uniforms;
    u.uCrack.value = state.crack ?? 0;
    if (state.impact) u.uImpact.value.copy(state.impact);
    u.uFade.value = state.fade ?? 1;
    u.uSeed.value = state.seed ?? 0;
    u.uOpacity.value = c.shellOpacity * g.opacity;
    u.uFresnel.value = Math.max(0.2, c.shellFresnel / Math.max(g.fresnel, 0.05));
    u.uGlow.value = c.shellGlow * g.glow;
    u.uHex.value = c.shellHex * g.shaderIntensity;
    u.uHexScale.value = c.shellHexScale;
    u.uCrackScale.value = c.crackScale * g.noiseFrequency;
    u.uCrackWidth.value = c.crackWidth;
    u.uCrackGlow.value = c.crackGlow * g.glow;
    u.uCrackJag.value = c.crackJag * g.noiseStrength;
    u.uColorShell.value.copy(getColor(c.colorShell));
    u.uColorRim.value.copy(getColor(c.colorShellRim));
    u.uColorCrack.value.copy(getColor(c.colorCrack));
    u.uColorHot.value.copy(getColor(c.colorCrackHot));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the lens                                                             */
/* -------------------------------------------------------------------- */

const LENS_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vLocal;

  void main() {
    vLocal = position.xy * 2.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * (uSize * 2.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uEddy;     // strength of the slow eddy while time is held
  uniform float uSwirl;
  uniform float uRipple;
  uniform float uShock;    // strength of the outward ring
  uniform float uShockAt;  // where that ring is, 0..1 of the quad
  uniform vec2  uResolution;
  uniform float uShaderIntensity;

  varying vec2 vLocal;

  void main() {
    float len = length(vLocal);
    if (len > 1.0) discard;
    vec2 dir = vLocal / max(len, 1e-4);
    vec2 tang = vec2(-dir.y, dir.x);

    // The eddy: a slow tangential smear with ripples running through it,
    // strongest at the shell and dying inside and out.
    float shellBand = smoothstep(0.35, 0.8, len) * (1.0 - smoothstep(0.8, 1.0, len));
    float ripple = 1.0 + uRipple * sin(len * 30.0 - uTime * 3.0);
    vec2 eddy = (tang * uSwirl + dir * 0.3) * uEddy * shellBand * ripple;

    // The shatter: a hard ring pushing the frame outward.
    float ring = exp(-pow((len - uShockAt) / 0.07, 2.0)) * uShock;
    vec2 offset = eddy + dir * ring;

    float strength = length(offset);
    float mask = (1.0 - smoothstep(0.85, 1.0, len));
    if (strength * mask < 0.002) discard;
    vec2 o = offset / max(strength, 1e-4);
    float aspect = max(uResolution.x, 1.0) / max(uResolution.y, 1.0);
    o.x /= aspect;
    gl_FragColor = vec4(o * 0.5 + 0.5, strength * uShaderIntensity, mask);
  }
`;

/** LAYER.DISTORTION proxy. Same pattern as `createAcidFumeMaterial`. */
export function createChronoLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 4 },
      uEddy: { value: 0 },
      uSwirl: { value: 0.6 },
      uRipple: { value: 0.5 },
      uShock: { value: 0 },
      uShockAt: { value: 0 }
    }),
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} state { size, eddy, shock, shockAt } */
  material.userData.sync = (state) => {
    const c = settings.chrono;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = Math.max(0.1, state.size ?? 4);
    u.uEddy.value = (state.eddy ?? 0) * c.lensStrength * g.distortion;
    u.uSwirl.value = c.lensSwirl;
    u.uRipple.value = c.lensRipple * g.turbulence;
    u.uShock.value = (state.shock ?? 0) * c.lensShock * g.distortion;
    u.uShockAt.value = state.shockAt ?? 0;
  };

  return material;
}
