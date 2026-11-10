import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Orbit Lock — the bespoke shaders.
 *
 *  - **the orbit** — a closed tube grid laid on a tilted circle in the vertex
 *    stage: a horizontal ring of radius `uRadius` turned by `uTilt` about a
 *    horizontal axis at bearing `uTiltYaw` (Rodrigues). The CPU twin is
 *    `OrbitLockAbility#_orbitPoint`, which places the planets *on* the same
 *    ring, so the two must change together. Additive: a faint hairline of a
 *    track plus a comet trail behind every planet on it, computed from the
 *    orbit's own phase and planet count — and, blended in as the orbits lock,
 *    from the single locked ring's phase and count, so the trails slide from
 *    three tilted orbits into one ring without a cut.
 *  - **the planet** — an instanced sphere, opaque and emissive: a white-hot
 *    core banded like a gas giant (noise-warped latitude bands, turning), a
 *    violet fresnel limb, a heat term that flares at the slam and a ragged
 *    dissolve as they burn into the floor.
 *  - **the star** — the thrown seed: a camera-facing four-point star.
 *  - **the dial** — the orrery sigil on the floor: the ring the planets will
 *    land on, a ticked band inside it, a dashed outer track, spokes to the
 *    centre. It draws itself round as the orbits form, brightens as the ring
 *    falls, flares on the slam and erodes away.
 *  - **the slam warp** — a flat ring on `LAYER.DISTORTION` that runs out
 *    across the floor from the slam.
 *
 *  - **the vortex** — the hero: a polar grid wound into log-spiral ridges of
 *    infalling matter, sagging into a well while it hangs and lying on the
 *    floor after the slam; deep violet-black between the arms, white-hot lip.
 *  - **the singularity** — an opaque black core with a photon-ring fresnel.
 *  - **the lens** — light bent round the core, on `LAYER.DISTORTION`.
 *  The planets are now lit, noise-displaced rock with molten seams.
 *
 * Every material reads `settings.orbitlock` in `userData.sync(state)`.
 */

const ID = 'orbitlock';

/* -------------------------------------------------------------------- */
/* The orbit                                                            */
/* -------------------------------------------------------------------- */

/** Shared by the tube's vertex stage — keep in step with `_orbitPoint`. */
export const ORBIT_GLSL = /* glsl */ `
  vec3 rotAxis(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
`;

const ORBIT_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;
  uniform float uTilt;
  uniform float uTiltYaw;
  uniform float uWidth;

  varying float vTheta;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  ${ORBIT_GLSL}

  void main() {
    float theta = position.x * 6.2831853;
    float alpha = position.y * 6.2831853;
    vec3 k = vec3(cos(uTiltYaw), 0.0, sin(uTiltYaw));
    vec3 radial = rotAxis(vec3(cos(theta), 0.0, sin(theta)), k, uTilt);
    vec3 normal = rotAxis(vec3(0.0, 1.0, 0.0), k, uTilt);
    vec3 offset = radial * cos(alpha) + normal * sin(alpha);
    vec3 world = uCenter + radial * uRadius + offset * uWidth;
    vTheta = theta;
    vNormalW = offset;
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const ORBIT_FRAGMENT = /* glsl */ `
  uniform float uPhase;       // the orbit's leading planet, radians
  uniform float uCount;       // planets on this orbit
  uniform float uDirSign;     // which way they run
  uniform float uPhaseG;      // the same, for the single locked ring
  uniform float uCountG;
  uniform float uLock;        // 0 free orbits .. 1 locked
  uniform float uTrailLen;    // share of the gap between planets that glows
  uniform float uTrailGlow;
  uniform float uGlow;
  uniform float uLockFlash;
  uniform float uFade;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying float vTheta;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  float trail(float phase, float count) {
    float spacing = 6.2831853 / max(count, 1.0);
    float d = fract(uDirSign * (phase - vTheta) / spacing);
    return exp(-d / max(uTrailLen, 0.01));
  }

  void main() {
    float facing = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    float core = pow(max(facing, 0.0), 1.5);
    float t = mix(trail(uPhase, uCount), trail(uPhaseG, uCountG), uLock);
    float b = uGlow * (0.25 + 0.75 * core) + t * uTrailGlow * (0.5 + 0.5 * core) + uLockFlash;
    vec3 col = mix(uColorB, uColorA, clamp(t * 0.8 + uLockFlash * 0.3, 0.0, 1.0));
    float a = clamp(b, 0.0, 1.0) * uFade;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * b * uFade * uGlobalGlow, a);
  }
`;

/** One orbit. Each orbit owns its material — its tilt, phase and count. */
export function createOrbitMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 2 },
      uTilt: { value: 0 },
      uTiltYaw: { value: 0 },
      uWidth: { value: 0.03 },
      uPhase: { value: 0 },
      uCount: { value: 3 },
      uDirSign: { value: 1 },
      uPhaseG: { value: 0 },
      uCountG: { value: 9 },
      uLock: { value: 0 },
      uTrailLen: { value: 0.5 },
      uTrailGlow: { value: 4 },
      uGlow: { value: 1 },
      uLockFlash: { value: 0 },
      uFade: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: ORBIT_VERTEX,
    fragmentShader: ORBIT_FRAGMENT
  });

  /** @param {object} s { center, radius, tilt, yaw, phase, count, dirSign, phaseG, countG, lock, lockFlash, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uRadius.value = Math.max(0.05, s.radius);
    u.uTilt.value = s.tilt;
    u.uTiltYaw.value = s.yaw;
    u.uWidth.value = Math.max(0.004, c.ringWidth);
    u.uPhase.value = s.phase;
    u.uCount.value = s.count;
    u.uDirSign.value = s.dirSign;
    u.uPhaseG.value = s.phaseG;
    u.uCountG.value = s.countG;
    u.uLock.value = s.lock;
    u.uTrailLen.value = c.trailLength;
    u.uTrailGlow.value = c.trailGlow * g.shaderIntensity;
    u.uGlow.value = c.ringGlow * g.glow;
    u.uLockFlash.value = s.lockFlash * c.ringGlow;
    u.uFade.value = s.fade * g.opacity;
    u.uColorA.value.copy(getColor(c.colorRingA));
    u.uColorB.value.copy(getColor(c.colorRingB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The planets                                                          */
/* -------------------------------------------------------------------- */

const PLANET_VERTEX = /* glsl */ `
  uniform float uCrag;        // 0..1 how lumpy and cratered the rock is
  uniform float uSeed;

  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    // A moon, not a ball: lumps, a flattened pole and a few craters.
    float lump = snoise(position * 1.7 + uSeed) * 0.55 + snoise(position * 4.3 + uSeed * 2.0) * 0.2;
    float crater = smoothstep(0.55, 0.85, snoise(position * 2.6 + uSeed * 3.0));
    vec3 displaced = position * (1.0 + uCrag * (0.18 * lump - 0.16 * crater)) * vec3(1.0, 1.0 - 0.12 * uCrag, 1.0);
    vec4 world = model * vec4(displaced, 1.0);
    vLocal = position;
    vNormalW = normalize(mat3(model) * normal);
    vViewDir = cameraPosition - world.xyz;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PLANET_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uBandScale;
  uniform float uBandSpeed;
  uniform float uGlow;
  uniform float uRim;
  uniform float uRimPower;
  uniform float uHeat;        // 0..1 the slam's flare
  uniform float uDissolve;    // 0 whole .. 1 gone
  uniform vec3  uColorCore;
  uniform vec3  uColorBand;
  uniform vec3  uColorRim;
  uniform vec3  uColorRock;
  uniform vec3  uLightDir;
  uniform float uFissure;
  uniform float uGlobalGlow;
  uniform float uNoiseAmt;

  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    // Faceted, lumpy rock: the shading normal comes off the displaced surface.
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 V = normalize(vViewDir);
    if (dot(N, V) < 0.0) N = -N;
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(max(1.0 - ndv, 0.0), max(uRimPower, 0.5));
    float diff = max(dot(N, normalize(uLightDir)), 0.0);

    // Dense, dark rock lit by the sun — it has weight.
    float grain = snoise(vLocal * 6.0 + uSeed) * 0.5 + 0.5;
    vec3 rock = uColorRock * (0.25 + 1.1 * diff) * (0.8 + 0.4 * grain);
    // Molten fissures, banded like strata and turning slowly, glowing through.
    float warp = snoise(vec3(vLocal * 1.6 + vec3(0.0, uSeed, uTime * uBandSpeed * 0.3))) * uNoiseAmt;
    float bands = 0.5 + 0.5 * sin((vLocal.y + warp * 0.35) * uBandScale * 3.14159 + uTime * uBandSpeed);
    float crack = 1.0 - abs(snoise(vLocal * 2.4 + vec3(uSeed, 0.0, uTime * 0.2)));
    crack = pow(crack, mix(24.0, 6.0, clamp(uFissure, 0.0, 1.0)));
    float seam = max(crack, smoothstep(0.92, 1.0, bands) * 0.6);
    vec3 fissure = mix(uColorBand, uColorCore, seam) * seam * uGlow * 2.2;
    vec3 col = rock + fissure + uColorRim * fres * uRim;
    col += mix(uColorBand, uColorCore, uHeat) * uHeat * 2.5 * (0.4 + seam);

    // Burning into the floor: noise threshold with a hot edge.
    if (uDissolve > 0.0) {
      float n = snoise(vWorld * 4.0 + uSeed) * 0.5 + 0.5;
      float thr = uDissolve * 1.1 - 0.05;
      if (n < thr) discard;
      col += uColorRim * (1.0 - smoothstep(thr, thr + 0.12, n)) * 4.0;
    }
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

/** The planets: opaque, lit rock with molten seams, instanced (`LAYER.SHAPED`). */
export function createPlanetMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uBandScale: { value: 3 },
      uBandSpeed: { value: 2 },
      uGlow: { value: 3 },
      uRim: { value: 3 },
      uRimPower: { value: 2.5 },
      uHeat: { value: 0 },
      uDissolve: { value: 0 },
      uNoiseAmt: { value: 1 },
      uCrag: { value: 0.8 },
      uFissure: { value: 0.5 },
      uColorCore: { value: new Color() },
      uColorBand: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorRock: { value: new Color() }
    }),
    vertexShader: PLANET_VERTEX,
    fragmentShader: PLANET_FRAGMENT
  });

  /** @param {object} s { seed, heat, dissolve } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = s.seed;
    u.uBandScale.value = c.bandScale * g.noiseFrequency;
    u.uBandSpeed.value = c.bandSpeed * g.noiseSpeed;
    u.uGlow.value = c.planetGlow * g.glow;
    u.uRim.value = c.planetRim * g.fresnel * g.glow;
    u.uRimPower.value = c.planetRimPower;
    u.uHeat.value = s.heat;
    u.uDissolve.value = s.dissolve;
    u.uNoiseAmt.value = g.noiseStrength;
    u.uCrag.value = c.planetCrag;
    u.uFissure.value = c.planetFissure;
    u.uColorCore.value.copy(getColor(c.colorPlanetCore));
    u.uColorBand.value.copy(getColor(c.colorPlanetBand));
    u.uColorRim.value.copy(getColor(c.colorPlanetRim));
    u.uColorRock.value.copy(getColor(c.colorPlanetRock));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The star                                                             */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vUv;

  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  uniform vec3  uColorCore;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0 || uIntensity <= 0.001) discard;
    float core = exp(-r * r * 40.0);
    float halo = exp(-r * 4.0) * (1.0 - smoothstep(0.7, 1.0, r));
    // A four-point star, slowly turning, with a fainter diagonal pair.
    float spin = uTime * 0.8 + uSeed;
    vec2 q = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * vUv;
    float cross1 = exp(-abs(q.x) * 60.0) + exp(-abs(q.y) * 60.0);
    vec2 d = mat2(0.7071, -0.7071, 0.7071, 0.7071) * q;
    float cross2 = (exp(-abs(d.x) * 90.0) + exp(-abs(d.y) * 90.0)) * 0.45;
    float spikes = (cross1 + cross2) * exp(-r * 2.6);
    float twinkle = 0.8 + 0.2 * snoise(vec3(uTime * 6.0, uSeed, 0.0));
    vec3 col = uColorHalo * (halo * 1.2 + spikes * 1.6) * twinkle + uColorCore * core * 3.0;
    float mask = clamp(halo + spikes + core, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, r));
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, mask);
  }
`;

/** The thrown seed star, and its burst into planets. */
export function createStarMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 0.5 },
      uSeed: { value: 0 },
      uIntensity: { value: 0 },
      uColorCore: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: STAR_FRAGMENT
  });

  /** @param {object} s { center, size, intensity, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = Math.max(0.01, s.size);
    u.uIntensity.value = s.intensity * c.starGlow * g.glow;
    u.uSeed.value = s.seed;
    u.uColorCore.value.copy(getColor(c.colorStarCore));
    u.uColorHalo.value.copy(getColor(c.colorStarHalo));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The dial                                                             */
/* -------------------------------------------------------------------- */

/** A flat quad on the floor, centred on `uCenter`, `uSize` metres in radius. */
const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  uniform float uLift;
  varying vec2 vXZ;           // metres from the centre

  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    world.y = uLift;
    vXZ = position.xy * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const DIAL_FRAGMENT = /* glsl */ `
  uniform float uZone;        // metres — the ring the planets land on
  uniform float uWidth;
  uniform float uTicks;
  uniform float uSpokes;
  uniform float uSpin;        // integrated turn of the tick band
  uniform float uReveal;      // 0..1 the dial drawing itself round
  uniform float uIntensity;
  uniform float uErode;       // 0 whole .. 1 gone
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying vec2 vXZ;

  ${noiseGLSL}

  float band(float r, float at, float w) {
    float d = (r - at) / max(w, 1e-3);
    return exp(-d * d);
  }

  void main() {
    float r = length(vXZ);
    float a = atan(vXZ.y, vXZ.x);
    float a01 = a / 6.2831853 + 0.5;
    if (r > uZone * 1.3) discard;

    // Draws itself round from one bearing, like a hand sweeping a dial.
    float reveal = smoothstep(a01 - 0.04, a01, uReveal * 1.04);

    float w = uWidth;
    float main = band(r, uZone, w * 1.3);
    float inner = band(r, uZone * 0.8, w * 0.7);
    float outer = band(r, uZone * 1.12, w * 0.5) * step(0.5, fract(a01 * uTicks * 0.5 - uSpin * 0.5));
    // Ticks in the band between the two inner rings; every fourth one long.
    float tickPhase = fract(a01 * uTicks + uSpin);
    float tickLine = 1.0 - smoothstep(0.0, 0.08, min(tickPhase, 1.0 - tickPhase));
    float isLong = step(fract((floor(a01 * uTicks + uSpin + 0.5)) / 4.0), 0.01);
    float tickIn = mix(uZone * 0.88, uZone * 0.82, isLong);
    float ticks = tickLine * step(tickIn, r) * step(r, uZone * 0.97);
    // Spokes to the centre, fading in toward it.
    float sp = fract(a01 * uSpokes);
    float spoke = (1.0 - smoothstep(0.0, 0.012 * uSpokes, min(sp, 1.0 - sp) * 6.2831853 * r / max(uSpokes, 1.0)))
                * smoothstep(uZone * 0.1, uZone * 0.75, r) * step(r, uZone * 0.8) * 0.35;
    float hub = band(r, uZone * 0.12, w * 0.6) * 0.8;

    float m = (main * 1.3 + inner * 0.7 + outer * 0.6 + ticks * 0.8 + spoke + hub) * reveal;

    float n = snoise(vec3(vXZ * 1.3, uSeed)) * 0.5 + 0.5;
    float keep = uErode <= 0.0 ? 1.0 : smoothstep(uErode * 1.2 - 0.1, uErode * 1.2 + 0.02, n);
    m *= keep * uIntensity * uOpacity;
    if (m < 0.003) discard;
    vec3 col = mix(uColorB, uColorA, clamp(main + ticks * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col * m * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

/** The orrery dial on the floor. */
export function createDialMaterial() {
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
      uCenter: { value: new Vector3() },
      uSize: { value: 6 },
      uLift: { value: 0.015 },
      uZone: { value: 4.6 },
      uWidth: { value: 0.05 },
      uTicks: { value: 24 },
      uSpokes: { value: 9 },
      uSpin: { value: 0 },
      uReveal: { value: 0 },
      uIntensity: { value: 1 },
      uErode: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: DIAL_FRAGMENT
  });

  /** @param {object} s { center, zone, spokes, spin, reveal, intensity, erode, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uZone.value = Math.max(0.2, s.zone);
    u.uSize.value = Math.max(0.3, s.zone * 1.3);
    u.uWidth.value = Math.max(0.005, c.sigilWidth);
    u.uTicks.value = Math.max(4, Math.round(c.sigilTicks));
    u.uSpokes.value = Math.max(1, s.spokes);
    u.uSpin.value = s.spin;
    u.uReveal.value = s.reveal;
    u.uIntensity.value = s.intensity * c.sigilGlow * g.glow;
    u.uErode.value = s.erode;
    u.uSeed.value = s.seed;
    u.uOpacity.value = c.sigilOpacity * g.opacity;
    u.uColorA.value.copy(getColor(c.colorSigilA));
    u.uColorB.value.copy(getColor(c.colorSigilB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The accretion vortex — the gravity well                              */
/* -------------------------------------------------------------------- */

const VORTEX_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uTilt;
  uniform float uTiltYaw;
  uniform float uInner;       // metres — the lip at the event horizon
  uniform float uOuter;       // metres — the ragged outer edge
  uniform float uHeight;      // metres the ridges stand at the lip
  uniform float uArms;
  uniform float uTwist;       // how tightly the arms wind in
  uniform float uSpin;        // integrated turn, radians
  uniform float uSeed;
  uniform float uSag;         // metres the middle dips (the well) when it hangs

  varying vec2  vPolar;       // x: 0 lip .. 1 edge, y: radians
  varying vec3  vWorld;
  varying float vRidge;

  ${ORBIT_GLSL}
  ${noiseGLSL}

  void main() {
    float r = position.x;
    float th = position.y * 6.2831853;
    float R = mix(uInner, uOuter, r);
    // Log-spiral arms of infalling matter; the inner turns run faster.
    float wind = uTwist * log(max(R, 0.01) / max(uInner, 0.01));
    float arm = 0.5 + 0.5 * cos(uArms * (th - uSpin * (1.0 + 1.6 * (1.0 - r))) + wind);
    float n = snoise(vec3(cos(th) * R * 0.7, sin(th) * R * 0.7, uSeed + uSpin * 0.15));
    float ridge = pow(arm, 2.5) * (0.75 + 0.35 * n);
    float lip = exp(-r * 9.0);
    float h = uHeight * (ridge * pow(1.0 - r, 0.9) * 0.8 + lip * 0.9);
    // The well: the disc sags toward its middle while it hangs.
    float sag = -uSag * pow(1.0 - r, 2.0);
    vec3 local = vec3(cos(th) * R, h + sag, sin(th) * R);
    vec3 k = vec3(cos(uTiltYaw), 0.0, sin(uTiltYaw));
    vec3 world = uCenter + rotAxis(local, k, uTilt);
    vPolar = vec2(r, th);
    vWorld = world;
    vRidge = ridge;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const VORTEX_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uSeed;
  uniform float uSpin;
  uniform float uHotGlow;
  uniform float uStreakGlow;
  uniform float uOpacity;
  uniform float uDissolve;
  uniform float uFlare;       // 0..1 the slam's flash through the disc
  uniform vec3  uColorHot;
  uniform vec3  uColorPale;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2  vPolar;
  varying vec3  vWorld;
  varying float vRidge;

  ${noiseGLSL}

  void main() {
    float r = vPolar.x;
    float th = vPolar.y;
    float edgeN = snoise(vec3(cos(th) * 2.2, sin(th) * 2.2, uSeed + uSpin * 0.1)) * 0.5 + 0.5;
    float alpha = 1.0 - smoothstep(0.62, 1.0, r + (edgeN - 0.5) * 0.35);
    float dn = snoise(vWorld * 1.3 + uSeed) * 0.5 + 0.5;
    if (uDissolve > 0.0) {
      float thr = uDissolve * 1.15 - 0.1 + (1.0 - r) * uDissolve * 0.4;
      if (dn < thr) discard;
    }

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(N, V) < 0.0) N = -N;
    float diff = max(dot(N, normalize(uLightDir)), 0.0);

    // Four-stop ramp: deep void between the arms, saturated body on them,
    // pale streaks of shredded matter, white-hot at the lip.
    float streak = pow(1.0 - abs(snoise(vec3(r * 9.0 - uSpin * 0.6, th * 2.0, uSeed))), 6.0) * uShaderIntensity;
    vec3 col = mix(uColorDeep, uColorBody, clamp(vRidge * (0.35 + 0.9 * diff), 0.0, 1.0));
    col = mix(col, uColorPale, clamp(streak * vRidge * (1.0 - r) * (1.0 - r) * 0.7 * uStreakGlow, 0.0, 1.0));
    float heat = exp(-r * 14.0);
    col += uColorHot * heat * uHotGlow * (0.6 + 0.6 * vRidge);
    col += uColorPale * uFlare * (1.0 - r) * 1.5;
    alpha *= mix(0.85, 1.0, vRidge) * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * mix(1.0, uGlobalGlow, heat), clamp(alpha, 0.0, 1.0));
  }
`;

/** The accretion vortex: dark, filled, lit, spiralling into the singularity. */
export function createVortexMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uTilt: { value: 0 },
      uTiltYaw: { value: 0 },
      uInner: { value: 0.6 },
      uOuter: { value: 4 },
      uHeight: { value: 0.5 },
      uArms: { value: 3 },
      uTwist: { value: 3 },
      uSpin: { value: 0 },
      uSeed: { value: 0 },
      uSag: { value: 0 },
      uHotGlow: { value: 3 },
      uStreakGlow: { value: 1 },
      uOpacity: { value: 1 },
      uDissolve: { value: 0 },
      uFlare: { value: 0 },
      uColorHot: { value: new Color() },
      uColorPale: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: VORTEX_VERTEX,
    fragmentShader: VORTEX_FRAGMENT
  });

  /** @param {object} s { center, tilt, yaw, inner, outer, height, spin, sag, opacity, dissolve, flare, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uTilt.value = s.tilt;
    u.uTiltYaw.value = s.yaw;
    u.uInner.value = Math.max(0.05, s.inner);
    u.uOuter.value = Math.max(s.inner + 0.1, s.outer);
    u.uHeight.value = s.height;
    u.uArms.value = Math.max(1, Math.round(c.vortexArms));
    u.uTwist.value = c.vortexTwist;
    u.uSpin.value = s.spin;
    u.uSeed.value = s.seed;
    u.uSag.value = s.sag;
    u.uHotGlow.value = c.vortexHotGlow * g.glow;
    u.uStreakGlow.value = c.vortexStreaks;
    u.uOpacity.value = c.vortexOpacity * g.opacity * s.opacity;
    u.uDissolve.value = s.dissolve;
    u.uFlare.value = s.flare;
    u.uColorHot.value.copy(getColor(c.colorWellHot));
    u.uColorPale.value.copy(getColor(c.colorWellPale));
    u.uColorBody.value.copy(getColor(c.colorWellBody));
    u.uColorDeep.value.copy(getColor(c.colorWellDeep));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The singularity                                                      */
/* -------------------------------------------------------------------- */

const CORE_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  uniform float uSquash;      // flattens as it sinks into the floor
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vec3 world = uCenter + position * uSize * vec3(1.0, 1.0 - uSquash, 1.0);
    vNormalW = normal;
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uRimGlow;
  uniform float uRimPower;
  uniform vec3  uColorHot;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    // Black: it eats the light. Only the photon ring at its limb burns.
    float fres = pow(1.0 - ndv, max(uRimPower, 0.5));
    float flick = 0.8 + 0.2 * snoise(vec3(N * 3.0 + uTime * 1.5 + uSeed));
    vec3 col = mix(uColorRim, uColorHot, fres * fres) * fres * uRimGlow * flick * uGlobalGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The singularity at the heart of the orrery: an opaque black core with a photon ring. */
export function createCoreMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 0.5 },
      uSquash: { value: 0 },
      uSeed: { value: 0 },
      uRimGlow: { value: 3 },
      uRimPower: { value: 3 },
      uColorHot: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT
  });

  /** @param {object} s { center, size, squash, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = Math.max(0.001, s.size);
    u.uSquash.value = s.squash;
    u.uSeed.value = s.seed;
    u.uRimGlow.value = c.coreRimGlow * g.fresnel;
    u.uRimPower.value = c.coreRimPower;
    u.uColorHot.value.copy(getColor(c.colorWellHot));
    u.uColorRim.value.copy(getColor(c.colorWellBody));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The lens — LAYER.DISTORTION                                          */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uHole;        // 0..1 share of the quad the horizon fills
  uniform float uSwirl;       // radians the pull is twisted
  uniform float uShaderIntensity;
  varying vec2 vUv;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    vec2 dir = vUv / max(r, 1e-4);
    // Light bent round the well: strongest just outside the horizon, falling
    // off with distance, twisted by the spin.
    float bend = smoothstep(1.0, uHole, r) * (uHole / max(r, uHole));
    float c = cos(uSwirl);
    float s = sin(uSwirl);
    vec2 pull = -vec2(dir.x * c - dir.y * s, dir.x * s + dir.y * c);
    float strength = uStrength * uShaderIntensity * bend;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(pull * 0.5 + 0.5, strength, smoothstep(1.0, 0.7, r));
  }
`;

/** A camera-facing lens of bent air round the singularity. */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 2 },
      uStrength: { value: 1 },
      uHole: { value: 0.25 },
      uSwirl: { value: 0.6 }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} s { center, size, hole, strength } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = Math.max(0.05, s.size);
    u.uHole.value = Math.min(0.9, Math.max(0.02, s.hole));
    u.uSwirl.value = c.lensSwirl;
    u.uStrength.value = c.lensStrength * g.distortion * s.strength;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The slam warp — LAYER.DISTORTION                                     */
/* -------------------------------------------------------------------- */

const WARP_FRAGMENT = /* glsl */ `
  uniform float uZone;
  uniform float uProgress;
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vXZ;

  void main() {
    float r = length(vXZ) / max(uZone * 1.3, 0.01);
    if (r > 1.0) discard;
    float R = 0.05 + 0.95 * uProgress;
    float d = (r - R) / 0.09;
    float slope = -d * exp(-d * d);
    vec2 dir = vXZ / max(length(vXZ), 1e-4);
    float mask = exp(-d * d) * (1.0 - uProgress);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * clamp(slope * 2.0, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** The slam's ripple through the air over the floor. */
export function createSlamWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 6 },
      uLift: { value: 0.2 },
      uZone: { value: 4.6 },
      uProgress: { value: 0 },
      uStrength: { value: 1 }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { center, zone, progress } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uZone.value = Math.max(0.2, s.zone * c.warpReach);
    u.uSize.value = Math.max(0.3, s.zone * c.warpReach * 1.3);
    u.uProgress.value = s.progress;
    u.uStrength.value = c.warpStrength * g.distortion;
  };

  return material;
}
