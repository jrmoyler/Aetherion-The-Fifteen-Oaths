import { Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'veinlattice';

/**
 * Vein Lattice — the four bespoke shaders.
 *
 *  - **the net** (`createVeinNetMaterial`) — the vascular lattice, inflated
 *    from parameter space in the vertex stage (`VeinLatticeGeometry`): radius,
 *    height, thickness, the sway, the heartbeat's constriction and swell, the
 *    growth front and the withering are all uniforms. Opaque, on
 *    `LAYER.SHAPED` (the depth prepass would rasterise the raw parameter
 *    buffer). Shading runs on a **four-stop ramp** — deep (the mottled
 *    skin) → body → tint (blood) → hot — whose position is carried by a
 *    half-lambert sun term (so the shadowed side falls to the deep stop),
 *    then pushed by the blood under the skin, the pulses and the heartbeat;
 *    HDR only on the hot stop. A world-noise bump knots the tubes and a
 *    tight wet highlight gives them depth. Underneath it is *living tissue*: a dark, mottled, bruise-purple skin
 *    traced with fine capillaries, lit by the sun; blood glowing through it
 *    where the tube faces the camera (an inverted fresnel — thin skin over a
 *    lit core); a thin red rim where light comes through the silhouette; and
 *    bright **pulses** of blood that run up every vein from the floor to the
 *    tendrils, swelling the tube as they pass.
 *  - **the feeder** (`createVeinFeederMaterial`) — one more vein, half-sunk
 *    in the floor, running down the cast line from the caster's feet. Same
 *    skin, same pulses; its own vertex stage lays it along the line.
 *  - **the capillary floor** (`createVeinFloorMaterial`) — a bruise spreading
 *    under the circle, threaded by a web of capillaries at two scales,
 *    domain-warped so it never reads as cells. Heartbeat rings run out from
 *    the centre through it.
 *  - **the throb** (`createVeinThrobMaterial`) — an open cylinder round the
 *    lattice on `LAYER.DISTORTION`; every heartbeat bends the air through it.
 *
 * Every material reads `settings.veinlattice` in `userData.sync()`.
 */

/* ==================================================================== */
/* Shared tissue shading                                                  */
/* ==================================================================== */

const TISSUE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColorSkin;
  uniform vec3  uColorSkinDark;
  uniform vec3  uColorCapillary;
  uniform vec3  uColorBlood;
  uniform vec3  uColorRim;
  uniform float uCoreGlow;
  uniform float uRimGlow;
  uniform float uPulseGlow;
  uniform float uBeatGlow;
  uniform float uBeat;
  uniform float uPulse;
  uniform float uPulseFreq;
  uniform float uMottle;
  uniform float uCapillaries;
  uniform float uDiffuse;
  uniform float uAmbient;
  uniform float uSpecular;

  varying vec3  vWorld;
  varying vec3  vNormal;
  varying float vGrow;
  varying float vSeed;
  varying float vAngle;
  varying float vWithered;

  ${noiseGLSL}

  uniform vec3  uColorBody;
  uniform vec3  uColorHot;
  uniform float uRampBody;
  uniform float uHotBoost;
  uniform float uBump;
  uniform float uSpecPower;
  uniform float uFresnel;

  float pulseBand(float g) {
    float p = fract(g * uPulseFreq - uPulse);
    return smoothstep(0.72, 0.94, p) * (1.0 - smoothstep(0.94, 1.0, p));
  }

  // The four-stop ramp: deep (the mottled skin) → body → tint → hot.
  vec3 ramp(vec3 deep, float t) {
    vec3 c = mix(deep, uColorBody, smoothstep(0.08, 0.55, t));
    c = mix(c, uColorBlood, smoothstep(0.5, 0.82, t));
    c = mix(c, uColorHot, smoothstep(0.82, 1.0, t));
    return c * (1.0 + smoothstep(0.86, 1.0, t) * uHotBoost);
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    // Ridged, knotted tissue: the normal wanders with a world-space noise.
    vec3 bp = vWorld * 3.2 + vSeed * 7.0;
    N = normalize(N + uBump * vec3(snoise(bp), snoise(bp + 17.3), snoise(bp + 31.7)));
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // Skin: mottled, bruised, traced with fine capillaries — the deep stop.
    vec3 q = vec3(vGrow * 26.0, vAngle * 1.3, vSeed * 17.0);
    float m = fbm3(q * 0.6) * uMottle;
    vec3 skin = mix(uColorSkinDark, uColorSkin, clamp(0.5 + m, 0.0, 1.0));
    float cap = 1.0 - smoothstep(0.0, 0.08, abs(snoise(vec3(vGrow * 14.0, vAngle * 1.1, vSeed * 5.0))));
    skin = mix(skin, uColorCapillary * 0.35, cap * uCapillaries);

    // Sun: half-lambert, squared, so the shadowed side falls to the deep stop.
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    float lit = uAmbient + uDiffuse * wrap * wrap;

    float alive = 1.0 - vWithered;
    float band = pulseBand(vGrow);
    float core = pow(ndv, 1.6);
    // Ramp position: lighting carries it deep → body; blood through the skin,
    // the pulses and the heartbeat push it on to tint and hot.
    float t = lit * uRampBody + m * 0.12 - cap * uCapillaries * 0.12;
    t += core * uCoreGlow * 0.25 * alive;
    t += band * uPulseGlow * 0.16 * alive;
    t += uBeat * uBeatGlow * 0.14 * alive * (0.5 + 0.5 * core);
    t = clamp(t * uShaderIntensity * mix(1.0, uGlobalGlow, 0.5), 0.0, 1.0);
    vec3 color = ramp(skin, t);

    // Wet: a tight, bright highlight from the sun.
    color += vec3(1.0, 0.82, 0.86) * pow(max(dot(N, H), 0.0), uSpecPower) * uSpecular * (0.35 + 0.65 * alive);
    // Light coming through the silhouette — a red, not a white, rim.
    float fres = pow(1.0 - ndv, 2.6) * uFresnel;
    color += uColorRim * fres * uRimGlow * (0.3 + 0.7 * alive) * (1.0 + uBeat * 0.8) * uGlobalGlow;
    // Drained: the tissue greys and darkens.
    color = mix(color, color * vec3(0.35, 0.3, 0.33), vWithered * 0.8);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function tissueUniforms() {
  return {
    uColorSkin: { value: new Color() },
    uColorSkinDark: { value: new Color() },
    uColorCapillary: { value: new Color() },
    uColorBlood: { value: new Color() },
    uColorRim: { value: new Color() },
    uCoreGlow: { value: 0.6 },
    uRimGlow: { value: 1 },
    uPulseGlow: { value: 3 },
    uBeatGlow: { value: 2 },
    uBeat: { value: 0 },
    uPulse: { value: 0 },
    uPulseFreq: { value: 3 },
    uMottle: { value: 0.6 },
    uCapillaries: { value: 0.5 },
    uDiffuse: { value: 0.8 },
    uAmbient: { value: 0.2 },
    uSpecular: { value: 0.5 },
    uColorBody: { value: new Color() },
    uColorHot: { value: new Color() },
    uRampBody: { value: 0.5 },
    uHotBoost: { value: 1.5 },
    uBump: { value: 0.3 },
    uSpecPower: { value: 60 },
    uFresnel: { value: 1 }
  };
}

/** The shared looks, from settings. `s` = { beat, pulse }. */
function syncTissue(u, s) {
  const c = settings[ID];
  const g = settings.global;
  u.uColorSkin.value.copy(getColor(c.colorSkin));
  u.uColorSkinDark.value.copy(getColor(c.colorSkinDark));
  u.uColorCapillary.value.copy(getColor(c.colorCapillary));
  u.uColorBlood.value.copy(getColor(c.colorBlood));
  u.uColorRim.value.copy(getColor(c.colorRim));
  u.uCoreGlow.value = c.coreGlow * g.glow;
  u.uRimGlow.value = c.rimGlow * g.glow;
  u.uPulseGlow.value = c.pulseGlow * g.glow;
  u.uBeatGlow.value = c.beatGlow * g.glow;
  u.uBeat.value = s.beat;
  u.uPulse.value = s.pulse;
  u.uPulseFreq.value = c.pulseFreq;
  u.uMottle.value = c.mottle * g.noiseStrength;
  u.uCapillaries.value = c.capillaries;
  u.uDiffuse.value = c.skinDiffuse;
  u.uAmbient.value = c.skinAmbient;
  u.uSpecular.value = c.skinSpecular;
  u.uColorBody.value.copy(getColor(c.colorVeinBody));
  u.uColorHot.value.copy(getColor(c.colorVeinHot));
  u.uRampBody.value = c.rampBody;
  u.uHotBoost.value = c.hotBoost;
  u.uBump.value = c.tissueBump * g.noiseStrength;
  u.uSpecPower.value = c.specularPower;
  u.uFresnel.value = g.fresnel;
}

/* ==================================================================== */
/* The net                                                                */
/* ==================================================================== */

const NET_VERTEX = /* glsl */ `
  attribute vec3 aCentre;
  attribute vec3 aDeriv;
  attribute vec2 aRing;
  attribute vec4 aTube;

  uniform float uTime;
  uniform vec3  uCentre;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uSqueeze;
  uniform float uThick;
  uniform float uGrow;
  uniform float uWither;
  uniform float uBeat;
  uniform float uSwell;
  uniform float uSway;
  uniform float uPulse;
  uniform float uPulseFreq;
  uniform float uPulseBulge;

  varying vec3  vWorld;
  varying vec3  vNormal;
  varying float vGrow;
  varying float vSeed;
  varying float vAngle;
  varying float vWithered;

  void main() {
    vec3 c = aCentre;
    // A slow, living sway — more at the top, none at the roots.
    float h = clamp(c.y, 0.0, 1.2);
    c.x += sin(uTime * 1.3 + h * 4.0 + aTube.z * 6.0) * uSway * h / max(c.z, 0.3);

    // The constriction squeezes the top harder than the foot.
    float squeeze = 1.0 - uSqueeze * (0.35 + 0.65 * h);
    float rad = uRadius * c.z * squeeze;
    vec3 radial = vec3(cos(c.x), 0.0, sin(c.x));
    vec3 tang = vec3(-sin(c.x), 0.0, cos(c.x));
    vec3 P = uCentre + radial * rad + vec3(0.0, c.y * uHeight, 0.0);

    // The tube frame from the analytic derivative of the param → world map.
    vec3 T = tang * aDeriv.x * rad + vec3(0.0, aDeriv.y * uHeight, 0.0) + radial * aDeriv.z * uRadius * squeeze;
    T = normalize(T + vec3(1e-5, 0.0, 0.0));
    vec3 ref = abs(T.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : radial;
    vec3 Nf = normalize(cross(ref, T));
    vec3 Bf = cross(T, Nf);
    vec3 off = Nf * aRing.x + Bf * aRing.y;

    // Growth: the tube inflates behind a front that climbs the net.
    float grown = clamp((uGrow - aTube.x) / 0.07, 0.0, 1.0);
    // Withering runs from the tendrils down to the roots.
    float withered = clamp((uWither - (1.0 - aTube.x)) / 0.2, 0.0, 1.0);
    float p = fract(aTube.x * uPulseFreq - uPulse);
    float bulge = smoothstep(0.7, 0.93, p) * (1.0 - smoothstep(0.93, 1.0, p));
    float r = uThick * aTube.y * grown * (1.0 - withered * 0.8);
    r *= 1.0 + uBeat * uSwell + bulge * uPulseBulge;

    vec3 world = P + off * r;
    world.y = max(world.y, 0.0);
    vWorld = world;
    vNormal = off;
    vGrow = aTube.x;
    vSeed = aTube.z;
    vAngle = atan(aRing.y, aRing.x);
    vWithered = withered;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

/** The lattice of veins. LAYER.SHAPED, opaque, no shadow. */
export function createVeinNetMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uRadius: { value: 4 },
      uHeight: { value: 3 },
      uSqueeze: { value: 0 },
      uThick: { value: 0.1 },
      uGrow: { value: 0 },
      uWither: { value: 0 },
      uSwell: { value: 0.3 },
      uSway: { value: 0.05 },
      uPulseBulge: { value: 0.3 },
      ...tissueUniforms()
    }),
    vertexShader: NET_VERTEX,
    fragmentShader: TISSUE_FRAGMENT
  });

  /** @param {object} s { centre, radius, height, squeeze, grow, wither, beat, pulse } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncTissue(u, s);
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = s.radius;
    u.uHeight.value = s.height;
    u.uSqueeze.value = s.squeeze;
    u.uThick.value = c.veinThickness;
    u.uGrow.value = s.grow;
    u.uWither.value = s.wither;
    u.uSwell.value = c.beatSwell;
    u.uSway.value = c.sway * g.noiseStrength;
    u.uPulseBulge.value = c.pulseBulge;
  };

  return material;
}

/* ==================================================================== */
/* The feeder                                                             */
/* ==================================================================== */

const FEEDER_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uThick;
  uniform float uFront;
  uniform float uMeander;
  uniform float uSeedF;
  uniform float uWither;
  uniform float uBeat;
  uniform float uSwell;
  uniform float uPulse;
  uniform float uPulseFreq;
  uniform float uPulseBulge;

  varying vec3  vWorld;
  varying vec3  vNormal;
  varying float vGrow;
  varying float vSeed;
  varying float vAngle;
  varying float vWithered;

  void main() {
    float s = position.x;
    float along = s * uLength;
    float lat = (sin(along * 0.7 + uSeedF) * 0.6 + sin(along * 1.9 + uSeedF * 2.3) * 0.4) * uMeander;
    lat *= smoothstep(0.0, 1.5, along) * smoothstep(0.0, 1.5, uLength - along);
    vec3 C = uStart + uDir * along + uSide * lat;
    float g = s * 0.35; // pulses run caster → circle
    float p = fract(g * uPulseFreq - uPulse);
    float bulge = smoothstep(0.7, 0.93, p) * (1.0 - smoothstep(0.93, 1.0, p));
    float reached = clamp((uFront - along) / 0.5, 0.0, 1.0);
    float foot = smoothstep(0.0, 0.6, along);
    float withered = clamp(uWither * 1.4 - s * 0.4, 0.0, 1.0);
    float r = uThick * reached * foot * (1.0 - withered * 0.8) * (1.0 + uBeat * uSwell + bulge * uPulseBulge);
    vec3 off = uSide * position.y + vec3(0.0, 1.0, 0.0) * position.z;
    vec3 world = C + off * r;
    world.y = max(world.y + r * 0.25, 0.0);
    vWorld = world;
    vNormal = off;
    vGrow = g;
    vSeed = uSeedF * 0.01;
    vAngle = atan(position.z, position.y);
    vWithered = withered;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

/** The vein down the cast line. LAYER.SHAPED. */
export function createVeinFeederMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uThick: { value: 0.1 },
      uFront: { value: 0 },
      uMeander: { value: 0.3 },
      uSeedF: { value: 0 },
      uWither: { value: 0 },
      uSwell: { value: 0.3 },
      uPulseBulge: { value: 0.3 },
      ...tissueUniforms()
    }),
    vertexShader: FEEDER_VERTEX,
    fragmentShader: TISSUE_FRAGMENT
  });

  /** @param {object} s { start, dir, side, length, front, seed, wither, beat, pulse } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncTissue(u, s);
    u.uStart.value.copy(s.start);
    u.uDir.value.copy(s.dir);
    u.uSide.value.copy(s.side);
    u.uLength.value = s.length;
    u.uFront.value = s.front;
    u.uSeedF.value = s.seed;
    u.uWither.value = s.wither;
    u.uThick.value = c.feederThickness;
    u.uMeander.value = c.feederMeander * g.noiseStrength * g.randomness;
    u.uSwell.value = c.beatSwell;
    u.uPulseBulge.value = c.pulseBulge;
  };

  return material;
}

/* ==================================================================== */
/* The capillary floor                                                    */
/* ==================================================================== */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  varying vec2 vP;
  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + p.x, 0.014, uCentre.z + p.y, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uRadius;
  uniform float uFront;      // metres the web has spread
  uniform float uSeed;
  uniform float uScale;
  uniform float uWarp;
  uniform float uLineWidth;
  uniform float uBruise;
  uniform float uLineGlow;
  uniform float uBeat;
  uniform float uBeatRing;   // metres the last beat's ring has run
  uniform float uFade;
  uniform float uOpacity;

  uniform vec3 uColorBruise;
  uniform vec3 uColorLine;
  uniform vec3 uColorGlow;

  varying vec2 vP;

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
    vec2 p = vP;
    float r = length(p);
    float rag = snoise(vec3(p * 0.8, uSeed)) * 0.5;
    float inside = 1.0 - smoothstep(uRadius * 0.85, uRadius * 1.25, r + rag);
    float front = uFront + snoise(vec3(normalize(p + 1e-4) * 2.0, uSeed + 2.0)) * 0.6;
    float reached = 1.0 - smoothstep(front - 0.4, front, r);

    // Capillaries: two scales of warped cell edges, the fine ones thinner.
    vec2 w = vec2(fbm3(vec3(p * 0.5, uSeed)), fbm3(vec3(p * 0.5 + 9.0, uSeed))) * uWarp;
    vec2 q = (p + w) * uScale;
    float e1 = cellEdges(q + uSeed);
    float e2 = cellEdges(q * 2.6 + uSeed * 3.0);
    float l1 = 1.0 - smoothstep(0.0, uLineWidth, e1);
    float l2 = (1.0 - smoothstep(0.0, uLineWidth * 0.6, e2)) * 0.55;
    float lines = max(l1, l2) * inside * reached;

    float bruise = inside * reached * uBruise * (0.7 + 0.3 * fbm3(vec3(p * 0.9, uSeed + 5.0)));

    float ring = exp(-pow((r - uBeatRing) / 0.5, 2.0)) * step(0.01, uBeatRing);
    float glow = lines * (uLineGlow * (0.35 + 0.65 * smoothstep(-0.3, 0.6, snoise(vec3(p * 1.2, uTime * 0.8)))) + uBeat * uLineGlow * 1.5 + ring * uLineGlow * 2.0);

    vec3 col = mix(uColorBruise, uColorLine, lines) + uColorGlow * glow * uGlobalGlow * uShaderIntensity;
    float a = max(bruise, lines * 0.95) * (1.0 - uFade) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The bruise and the capillary web on the floor. */
export function createVeinFloorMaterial() {
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
      uRadius: { value: 4 },
      uFront: { value: 0 },
      uSeed: { value: 0 },
      uScale: { value: 0.8 },
      uWarp: { value: 1 },
      uLineWidth: { value: 0.05 },
      uBruise: { value: 0.6 },
      uLineGlow: { value: 1 },
      uBeat: { value: 0 },
      uBeatRing: { value: 0 },
      uFade: { value: 0 },
      uOpacity: { value: 1 },
      uColorBruise: { value: new Color() },
      uColorLine: { value: new Color() },
      uColorGlow: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} s { centre, radius, front, seed, beat, beatRing, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = s.radius;
    u.uExtent.value = s.radius * 1.35 + 0.8;
    u.uFront.value = s.front;
    u.uSeed.value = s.seed;
    u.uScale.value = c.webScale * g.noiseFrequency;
    u.uWarp.value = c.webWarp * g.noiseStrength;
    u.uLineWidth.value = c.webWidth;
    u.uBruise.value = c.bruise;
    u.uLineGlow.value = c.webGlow * g.glow;
    u.uBeat.value = s.beat;
    u.uBeatRing.value = s.beatRing;
    u.uFade.value = s.fade;
    u.uOpacity.value = g.opacity;
    u.uColorBruise.value.copy(getColor(c.colorBruise));
    u.uColorLine.value.copy(getColor(c.colorWebLine));
    u.uColorGlow.value.copy(getColor(c.colorWebGlow));
  };

  return material;
}

/* ==================================================================== */
/* The throb                                                              */
/* ==================================================================== */

const THROB_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const THROB_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  uniform float uSeed;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec3 np = vec3(vWorld.xz * 1.1, vWorld.y * 0.8 + uSeed);
    float nx = snoise(np + uTime * 0.6);
    float ny = snoise(np + vec3(13.1, 7.3, 2.9) - uTime * 0.6);
    float mask = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
    float s = uStrength * uShaderIntensity * mask;
    if (s < 0.002) discard;
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, s, mask);
  }
`;

/** The heartbeat in the air. LAYER.DISTORTION — see `createAcidFumeMaterial`. */
export function createVeinThrobMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStrength: { value: 0 },
      uSeed: { value: 0 }
    }),
    vertexShader: THROB_VERTEX,
    fragmentShader: THROB_FRAGMENT
  });

  /** @param {object} s { beat, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    material.uniforms.uStrength.value = s.beat * c.throbStrength * g.distortion;
    material.uniforms.uSeed.value = s.seed;
  };

  return material;
}
