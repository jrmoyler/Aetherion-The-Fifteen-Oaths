import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  NormalBlending,
  ShaderMaterial,
  Vector3
} from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Graviton Collapse — every bespoke shader the gravity well is drawn with.
 *
 * Four materials, one per layer that is not a particle system:
 *
 *  - **the core** — a sphere that is *not* lit and *not* transparent. It is
 *    the one opaque thing in the ability, written into the depth buffer so
 *    the far half of the accretion disc genuinely passes behind it and the
 *    near half in front. Black body, a hot fresnel limb, and that limb
 *    streaked by noise turning about the view axis.
 *  - **the accretion disc** — a flat annulus tilted off the floor. Its bands
 *    shear differentially (inner gas laps outer gas, ω ∝ r^-shear), its inner
 *    edge is white-hot, and one side is several times brighter than the other
 *    because gas coming toward the camera is Doppler-beamed. That asymmetry is
 *    what tells the eye the thing is *turning* without a single frame of
 *    motion.
 *  - **the lens** — a camera-facing proxy on LAYER.DISTORTION that pinches the
 *    finished frame toward the core and winds it round, so the stage behind
 *    the well visibly bends.
 *  - **the well** — the floor itself, sunk into a funnel in the vertex stage
 *    and ruled with a radial/concentric grid in the fragment stage. See
 *    `createGravitonWellMaterial` for the depth trick that lets a mesh drawn
 *    *below* an opaque floor still be seen through it.
 *
 * Every material takes its numbers from `settings.graviton` in its
 * `userData.sync(state)`, called every frame by the ability, so every slider is
 * live mid-cast. `state` carries only what the ability knows and settings do
 * not: where the thing is, how big it is right now, and its envelopes.
 */

/* -------------------------------------------------------------------- */
/* the core                                                             */
/* -------------------------------------------------------------------- */

const CORE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uWobble;
  uniform float uSeed;

  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;

  ${noiseGLSL}

  void main() {
    vLocal = normalize(position);
    // A little boil on the surface, so a sphere this dark still reads as a
    // *thing* with a turbulent limb rather than a cut-out circle.
    float n = snoise(vLocal * 2.3 + vec3(uSeed, uTime * 0.9, -uTime * 0.6));
    vec3 pos = position * (1.0 + n * uWobble);

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uRim;
  uniform float uRimPower;
  uniform float uSwirl;
  uniform float uHeat;
  uniform float uFade;
  uniform vec3  uColorBody;
  uniform vec3  uColorRim;
  uniform vec3  uColorHot;
  uniform float uGlobalGlow;

  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;

  ${noiseGLSL}

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewDir);
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    float limb = pow(1.0 - ndv, uRimPower);

    // Streaks wound round the limb. Sampled on a direction that turns about
    // the view axis with time, so they *circulate* rather than scroll.
    vec3 side = normalize(cross(v, vec3(0.0, 1.0, 0.0)) + 1e-4);
    vec3 up = cross(side, v);
    vec2 sv = vec2(dot(n, side), dot(n, up));
    float a = atan(sv.y, sv.x) + uTime * uSwirl;
    float streak = snoise(vec3(cos(a) * 2.2, sin(a) * 2.2, ndv * 3.0 + uSeed)) * 0.5 + 0.5;
    streak = mix(0.55, 1.35, streak);

    // The heat term is the implosion: the limb whitens as the core is crushed.
    vec3 rim = mix(uColorRim, uColorHot, clamp(uHeat + limb * limb * 0.5, 0.0, 1.0));
    vec3 color = uColorBody + rim * limb * uRim * streak * (1.0 + uHeat * 2.5);
    color *= uGlobalGlow;

    // Opaque on purpose; uFade only takes the glow down, never the black.
    gl_FragColor = vec4(color * uFade, 1.0);
  }
`;

/** The black core. Opaque and depth-writing; drawn as a scaled unit sphere. */
export function createGravitonCoreMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uWobble: { value: 0.04 },
      uRim: { value: 3 },
      uRimPower: { value: 3 },
      uSwirl: { value: 2 },
      uHeat: { value: 0 },
      uFade: { value: 1 },
      uColorBody: { value: new Color(0, 0, 0) },
      uColorRim: { value: new Color(0.7, 0.5, 1) },
      uColorHot: { value: new Color(1, 1, 1) }
    }),
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT
  });

  /** @param {object} state { heat, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.graviton;
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = state.seed ?? 0;
    u.uHeat.value = state.heat ?? 0;
    u.uFade.value = state.fade ?? 1;
    u.uWobble.value = c.coreWobble * g.noiseStrength;
    u.uRim.value = c.coreRimGlow * g.glow * g.fresnel;
    u.uRimPower.value = c.coreRimPower;
    u.uSwirl.value = c.coreSwirl * g.noiseSpeed;
    u.uColorBody.value.copy(getColor(c.colorCore));
    u.uColorRim.value.copy(getColor(c.colorCoreRim));
    u.uColorHot.value.copy(getColor(c.colorDiscHot));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the accretion disc                                                   */
/* -------------------------------------------------------------------- */

const DISC_VERTEX = /* glsl */ `
  varying vec2  vLocal;
  varying vec3  vWorld;
  varying vec3  vVel;
  varying float vViewZ;

  void main() {
    // RingGeometry lies in XY, outer radius 1: local xy *is* the disc's polar
    // plane, in units of its own outer radius.
    vLocal = position.xy;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    // Prograde orbital direction of the gas at this point, in world space.
    vVel = normalize(mat3(modelMatrix) * vec3(-position.y, position.x, 0.0) + 1e-5);
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const DISC_FRAGMENT = /* glsl */ `
  uniform float uClock;       // seconds since the well opened — see the ability
  uniform float uSeed;
  uniform float uInner;       // inner edge, fraction of the outer radius
  uniform float uSpin;        // rad/s at the inner edge
  uniform float uShear;       // ω ∝ r^-shear
  uniform float uBands;
  uniform float uNoise;
  uniform float uNoiseScale;
  uniform float uHotEdge;
  uniform float uBeam;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uHeat;
  uniform float uSoftFade;
  uniform vec3  uColorHot;
  uniform vec3  uColorMid;
  uniform vec3  uColorCool;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vLocal;
  varying vec3  vWorld;
  varying vec3  vVel;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float r = length(vLocal);
    float inner = clamp(uInner, 0.02, 0.95);
    if (r < inner * 0.97 || r > 1.0) discard;

    // 0 at the inner edge, 1 at the rim.
    float s = clamp((r - inner) / (1.0 - inner), 0.0, 1.0);

    // Differential rotation. The angle is advanced by the cast's own clock,
    // not the app's: integrated shear grows without bound, and on a global
    // clock the bands would be wound into a grey smear before the first cast.
    float omega = uSpin * pow(max(r / inner, 1.0), -uShear);
    float a = atan(vLocal.y, vLocal.x) - uClock * omega;

    // Polar sampling wraps cleanly; log-radius keeps band width proportional.
    vec3 np = vec3(cos(a) * uNoiseScale, sin(a) * uNoiseScale, log(r) * uNoiseScale * 1.6 + uSeed);
    float turb = fbm4(np) * 0.5 + 0.5;
    float streak = ridged(np * vec3(1.0, 1.0, 2.6) + 13.0, 4);
    float rings = 0.5 + 0.5 * sin((r * uBands + turb * uNoise * 2.0) * 6.2831);
    float density = mix(rings, streak, 0.45) * mix(1.0, turb * 1.6, clamp(uNoise, 0.0, 1.0));

    // Hot inner edge: a thin white band right at the innermost stable orbit,
    // falling off exponentially into the body of the disc.
    float hot = exp(-s * uHotEdge);
    vec3 color = mix(uColorCool, uColorMid, 1.0 - smoothstep(0.25, 0.85, s));
    color = mix(color, uColorHot, clamp(hot * 1.2, 0.0, 1.0));

    // Doppler beaming. Gas approaching the camera is boosted, receding gas is
    // dimmed — the one asymmetric thing in an otherwise rotationally
    // symmetric object, and the reason it reads as turning.
    vec3 view = normalize(cameraPosition - vWorld);
    float toward = dot(vVel, view);
    float beam = pow(clamp(1.0 + uBeam * toward, 0.08, 3.0), 2.4);

    float edgeIn = smoothstep(inner * 0.97, inner * 1.02, r);
    float edgeOut = 1.0 - smoothstep(0.62, 1.0, s);
    float alpha = density * edgeIn * edgeOut * (0.35 + hot * 0.9);
    alpha *= uOpacity * uFade;

    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.003) discard;

    float glow = uIntensity * beam * (1.0 + uHeat * 2.0) * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(color * glow * alpha, alpha);
  }
`;

/** The tilted accretion disc. Additive, double-sided; drawn on a unit RingGeometry. */
export function createGravitonDiscMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uSeed: { value: 0 },
      uInner: { value: 0.3 },
      uSpin: { value: 4 },
      uShear: { value: 1.5 },
      uBands: { value: 9 },
      uNoise: { value: 0.6 },
      uNoiseScale: { value: 2.4 },
      uHotEdge: { value: 7 },
      uBeam: { value: 0.7 },
      uIntensity: { value: 3 },
      uOpacity: { value: 1 },
      uFade: { value: 1 },
      uHeat: { value: 0 },
      uSoftFade: { value: 0.4 },
      uColorHot: { value: new Color(1, 1, 1) },
      uColorMid: { value: new Color(1, 0.6, 0.8) },
      uColorCool: { value: new Color(0.5, 0.3, 1) }
    }),
    vertexShader: DISC_VERTEX,
    fragmentShader: DISC_FRAGMENT
  });

  /** @param {object} state { clock, inner, heat, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.graviton;
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock ?? 0;
    u.uSeed.value = state.seed ?? 0;
    u.uInner.value = state.inner ?? 0.3;
    u.uHeat.value = state.heat ?? 0;
    u.uFade.value = state.fade ?? 1;
    u.uSpin.value = c.discSpin * g.noiseSpeed;
    u.uShear.value = c.discShear;
    u.uBands.value = c.discBands;
    u.uNoise.value = c.discNoise * g.noiseStrength;
    u.uNoiseScale.value = c.discNoiseScale * g.noiseFrequency;
    u.uHotEdge.value = c.discHotEdge;
    u.uBeam.value = c.discBeaming;
    u.uIntensity.value = c.discBrightness * g.glow;
    u.uOpacity.value = c.discOpacity * g.opacity;
    u.uSoftFade.value = c.discSoftFade;
    u.uColorHot.value.copy(getColor(c.colorDiscHot));
    u.uColorMid.value.copy(getColor(c.colorDiscMid));
    u.uColorCool.value.copy(getColor(c.colorDiscCool));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the lens                                                             */
/* -------------------------------------------------------------------- */

const LENS_VERTEX = /* glsl */ `
  uniform float uSize;   // half-width of the quad, metres
  varying vec2 vLocal;

  void main() {
    vLocal = position.xy * 2.0;
    // Camera-facing: the quad's corners are laid out in view space around the
    // object's origin, so vLocal reads directly as a screen direction.
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * (uSize * 2.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uCore;      // core radius as a fraction of the quad's half-width
  uniform float uPinch;
  uniform float uSwirl;
  uniform float uFalloff;
  uniform float uRipple;
  uniform float uStrength;
  uniform vec2  uResolution;
  uniform float uShaderIntensity;

  varying vec2 vLocal;

  void main() {
    float len = length(vLocal);
    if (len > 1.0) discard;

    // Off inside the core (it is opaque black — nothing to bend) and off at
    // the quad's border so the proxy never prints its own outline.
    float mask = (1.0 - smoothstep(0.55, 1.0, len)) * smoothstep(uCore * 0.8, uCore * 1.3, len);
    if (mask < 0.003) discard;

    // A softened inverse square, measured from the core's limb.
    float q = max(len - uCore, 0.0) / max(uFalloff, 1e-3);
    float bend = 1.0 / (1.0 + q * q);
    // A slow ring travelling inward through the warp: space draining into the
    // well, which is what separates this lens from a static bulge.
    bend *= 1.0 + uRipple * sin(len * 26.0 + uTime * 7.0);

    vec2 dir = vLocal / max(len, 1e-4);
    vec2 tang = vec2(-dir.y, dir.x);
    vec2 offset = normalize(-dir * uPinch + tang * uSwirl + 1e-5);

    // UV space is not square; correct so the warp is round on a wide window.
    float aspect = max(uResolution.x, 1.0) / max(uResolution.y, 1.0);
    offset.x /= aspect;

    gl_FragColor = vec4(offset * 0.5 + 0.5, bend * uStrength * uShaderIntensity, mask);
  }
`;

/** Screen-space lens proxy for LAYER.DISTORTION. Same pattern as `createAcidFumeMaterial`. */
export function createGravitonLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 4 },
      uCore: { value: 0.15 },
      uPinch: { value: 1 },
      uSwirl: { value: 0.5 },
      uFalloff: { value: 0.3 },
      uRipple: { value: 0.15 },
      uStrength: { value: 1 }
    }),
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} state { size, core, strength } */
  material.userData.sync = (state) => {
    const c = settings.graviton;
    const g = settings.global;
    const u = material.uniforms;
    const size = Math.max(0.05, state.size ?? 1);
    u.uSize.value = size;
    u.uCore.value = Math.min(0.9, (state.core ?? 0) / size);
    u.uPinch.value = c.lensPinch;
    u.uSwirl.value = c.lensSwirl;
    u.uFalloff.value = c.lensFalloff;
    u.uRipple.value = c.lensRipple * g.turbulence;
    u.uStrength.value = (state.strength ?? 1) * c.lensStrength * g.distortion;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the well                                                             */
/* -------------------------------------------------------------------- */

/** The depth profile, shared by both stages. Mirrors `wellProfile` in the JS geometry file. */
const PROFILE_GLSL = /* glsl */ `
  float wellRaw(float r, float throat) {
    float q = r / max(throat, 0.05);
    return 1.0 / (1.0 + q * q);
  }
  float wellProfile(float r, float reach, float throat) {
    float edge = wellRaw(reach, throat);
    return max(0.0, (wellRaw(r, throat) - edge) / max(1.0 - edge, 1e-4));
  }
`;

const WELL_VERTEX = /* glsl */ `
  uniform vec3  uCentre;     // on the floor, world space
  uniform float uReach;      // lip radius, metres
  uniform float uThroat;     // half-depth radius, metres
  uniform float uDepth;      // metres sunk at the axis (negative = a bulge)
  uniform float uLift;       // metres the lip sits above the floor
  uniform float uDepthBias;  // see below

  varying vec2  vFlat;       // offset from the axis, metres
  varying float vProfile;
  varying vec3  vNormalW;
  varying float vOcclude;    // where the eye ray crosses the floor, × reach (>1: the near floor hides it)

  ${PROFILE_GLSL}

  void main() {
    vec2 flat2 = position.xz * uReach;
    float r = length(flat2);
    vFlat = flat2;

    float prof = wellProfile(r, uReach, uThroat);
    vProfile = prof;

    vec3 world = vec3(uCentre.x + flat2.x, uCentre.y + uLift - uDepth * prof, uCentre.z + flat2.y);

    // Analytic normal from the radial slope of the profile.
    float w = max(uThroat, 0.05);
    float q = r / w;
    float edge = wellRaw(uReach, uThroat);
    float dprof = (-2.0 * q / (w * (1.0 + q * q) * (1.0 + q * q))) / max(1.0 - edge, 1e-4);
    float dh = -uDepth * dprof;              // dh/dr: the floor rises outward
    vec2 radial = r > 1e-4 ? flat2 / r : vec2(0.0);
    vNormalW = normalize(vec3(-dh * radial.x, 1.0, -dh * radial.y));

    /*
     * The depth trick.
     *
     * The stage floor is opaque and already in the depth buffer at y = 0, so a
     * mesh sunk beneath it would simply fail the depth test. The *image* has to
     * come from the sunk surface, but the *depth* has to come from somewhere at
     * or above the floor — and the one point that satisfies both is where the
     * eye ray through the sunk vertex crosses a plane just above the floor:
     * it projects to the same pixel by construction. A whisker of the true
     * distance is mixed back in so two layers of funnel on one ray still sort
     * correctly against each other, and anything standing *in* the well — a
     * body, a particle — is still in front of it.
     */
    vec3 eye = cameraPosition;
    float plane = uCentre.y + uLift + uDepthBias;
    float t = world.y < plane ? (eye.y - plane) / max(eye.y - world.y, 1e-4) : 1.0;
    t = clamp(t, 0.0, 1.0);
    vec3 proxy = eye + (world - eye) * mix(t, 1.0, 0.004);
    // A sunk point is only visible through the hole: if the eye ray reaches
    // the floor plane outside the lip, the real floor in front hides it.
    vec3 hit = eye + (world - eye) * t;
    vOcclude = world.y < plane ? length(hit.xz - uCentre.xz) / max(uReach, 1e-3) : 0.0;

    vec4 clipImage = projectionMatrix * viewMatrix * vec4(world, 1.0);
    vec4 clipDepth = projectionMatrix * viewMatrix * vec4(proxy, 1.0);
    float ndcZ = clipDepth.z / max(abs(clipDepth.w), 1e-5);
    gl_Position = vec4(clipImage.xy, ndcZ * clipImage.w, clipImage.w);
  }
`;

const WELL_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uReach;
  uniform float uThroat;
  uniform float uSeed;
  uniform float uTwist;       // radians the spokes are wound at the axis
  uniform float uSpin;        // rad/s the winding turns at the axis
  uniform float uSpokes;
  uniform float uRingSpacing; // metres between concentric lines
  uniform float uLineWidth;
  uniform float uFlow;        // m/s the rings drain inward
  uniform float uGridGlow;
  uniform float uHotGlow;
  uniform float uShade;
  uniform float uFeather;
  uniform float uGrain;
  uniform float uOpen;        // 0..1 how far the well has opened
  uniform float uOpacity;
  uniform float uFade;
  uniform vec3  uColorBase;
  uniform vec3  uColorDeep;
  uniform vec3  uColorGrid;
  uniform vec3  uColorHot;
  uniform vec3  uColorBody;   // saturated violet body of the lensing field
  uniform vec3  uColorTint;   // pale tint the arms burn to near the throat
  uniform float uGrip;        // 0..1 through the hold — the well keeps feeding
  uniform float uCrush;       // 0..1 through the crush window
  uniform float uHorizon;     // horizon radius, × throat
  uniform float uHorizonGrow; // how much it widens over the hold
  uniform float uPhotonGlow;
  uniform float uPhotonWidth; // × horizon radius
  uniform float uArms;
  uniform float uArmTight;    // log-spiral winding
  uniform float uFieldSpin;   // rad/s the arms turn
  uniform float uFieldFlow;   // how fast the streaks drain down the throat
  uniform float uFieldContrast;
  uniform float uFieldGlow;
  uniform float uRipple;
  uniform float uOccludeEdge;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec2  vFlat;
  varying float vProfile;
  varying vec3  vNormalW;
  varying float vOcclude;

  ${noiseGLSL}

  /** One AA line every unit of x. */
  float gridLine(float x, float width) {
    float fw = fwidth(x);
    float d = abs(fract(x + 0.5) - 0.5);
    return 1.0 - smoothstep(width, width + fw * 1.5, d);
  }

  /** Four-stop ramp: deep → body → tint → white-hot (HDR only at the top). */
  vec3 ramp4(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.4) return mix(uColorDeep, uColorBody, t / 0.4);
    if (t < 0.78) return mix(uColorBody, uColorTint, (t - 0.4) / 0.38);
    return mix(uColorTint, uColorHot * 1.6, (t - 0.78) / 0.22);
  }

  void main() {
    float r = length(vFlat);
    float lip = r / max(uReach, 1e-3);
    if (lip > 1.0) discard;
    if (vOcclude > uOccludeEdge) discard;
    float prof = vProfile;
    float angle = atan(vFlat.y, vFlat.x);
    float grip = uGrip;

    /* --- the event horizon: a black hole at the bottom of the throat that
           widens as the well feeds, and is crushed tight at the end --- */
    float horizon = uThroat * uHorizon * uOpen * (1.0 + uHorizonGrow * grip) * (1.0 - 0.45 * uCrush);
    float fwR = fwidth(r) + 1e-4;

    /* --- the lensing field: matter wound into log-spiral arms that are
           dragged down the throat, streaked by noise, filling the funnel --- */
    float lr = log(max(r, 0.04));
    float wind = uArmTight * (1.0 + 0.6 * grip + 0.8 * uCrush);
    float spinA = angle + uClock * uFieldSpin * (0.4 + 1.6 * prof);
    float phase = uArms * (spinA + wind * lr);
    float arms = 0.5 + 0.5 * cos(phase);
    arms = pow(arms, uFieldContrast);
    float sa = spinA + wind * lr;
    float streaks = fbm3(vec3(cos(sa) * 2.4, sin(sa) * 2.4, (lr + uClock * uFieldFlow) * 3.2 + uSeed)) * 0.5 + 0.5;
    float clumps = fbm3(vec3(vFlat * 1.3 + uSeed, uClock * 0.35)) * 0.5 + 0.5;
    // Inward-travelling gravity ripples modulate the density (no lines).
    float ripple = 1.0 + uRipple * sin((r + uClock * uFlow * 1.8) / max(uRingSpacing, 0.05) * 3.14159);
    float field = (arms * 0.75 + 0.25) * mix(0.45, 1.25, streaks) * mix(0.75, 1.15, clumps) * ripple;
    // Denser and hotter down the throat; it builds as the well feeds.
    float dens = field * (0.34 + 0.85 * pow(prof, 0.8)) * (0.65 + 0.55 * grip + 0.5 * uCrush);
    dens *= smoothstep(1.0, 0.55, lip) * 0.6 + 0.4;
    // A shadow ring just outside the horizon: light bent away before it falls in.
    float shadow = smoothstep(horizon * 1.05, horizon * 2.1, r);
    dens *= mix(0.2, 1.0, shadow);

    /* --- the stone the well is made of: dark, lit, swallowed by the field --- */
    float grain = fbm3(vec3(vFlat * 1.7, uSeed)) * 0.5 + 0.5;
    vec3 base = mix(uColorBase, uColorDeep, smoothstep(0.05, 0.85, prof));
    base *= mix(1.0, 0.65 + grain * 0.7, uGrain);
    float lambert = clamp(dot(normalize(vNormalW), normalize(uLightDir)), 0.0, 1.0);
    base *= 0.35 + 0.65 * lambert;
    base *= 1.0 - prof * uShade;

    vec3 fieldCol = ramp4(dens * uFieldGlow * 0.55);
    float cover = smoothstep(0.02, 0.35, dens) * uOpen;
    vec3 color = mix(base, fieldCol * (0.55 + 0.6 * uGlobalGlow), cover);

    /* --- the grid, demoted to an undertone wound into the field --- */
    float wound = angle + (uTwist + uClock * uSpin) * prof * uOpen;
    float spokes = gridLine(wound * uSpokes / 6.2831853, uLineWidth);
    spokes *= smoothstep(uThroat * 0.15, uThroat * 0.9, r);
    float rings = gridLine((r + uClock * uFlow) / max(uRingSpacing, 0.05), uLineWidth * 1.3);
    float grid = max(spokes, rings);
    color += uColorGrid * grid * uGridGlow * (0.15 + prof * 0.6) * uOpen * uGlobalGlow * (1.0 - 0.6 * cover);
    color += uColorHot * pow(prof, 5.0) * uHotGlow * uOpen * uGlobalGlow * shadow;

    /* --- the photon ring and the black --- */
    float ringD = (r - horizon) / max(horizon * uPhotonWidth, fwR);
    float photon = exp(-ringD * ringD) * uPhotonGlow * uOpen * (1.0 + 1.5 * uCrush);
    float ringCore = exp(-ringD * ringD * 6.0);
    color += mix(mix(uColorBody, uColorTint, 0.75), uColorHot, ringCore * 0.5) * photon * uGlobalGlow;
    float hole = 1.0 - smoothstep(horizon * 0.92 - fwR, horizon * 0.92 + fwR, r);
    color = mix(color, vec3(0.0), hole * uOpen);

    // Feathered at the lip, so the funnel hands over to the real floor.
    float alpha = (1.0 - smoothstep(1.0 - uFeather, 1.0, lip)) * uOpacity * uFade;
    alpha *= clamp(smoothstep(0.0, 0.035, prof * uOpen) + grid * 0.4 * uOpen + cover, 0.0, 1.0);
    if (alpha < 0.003) discard;

    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * The floor, sunk into a funnel.
 *
 * Drawn on the polar disc from `GravitonCollapseGeometry`, left at the origin
 * with an identity transform: every metre arrives as a uniform, so the mesh is
 * built once and `zoneRadius`, `wellDepth` and `wellThroat` all drag live.
 */
export function createGravitonWellMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    // Front faces only: the near wall of a deep well faces away from the
    // camera and has to drop out so the far wall shows through it.
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uReach: { value: 4 },
      uThroat: { value: 1 },
      uDepth: { value: 1 },
      uLift: { value: 0.012 },
      uDepthBias: { value: 0.05 },
      uClock: { value: 0 },
      uSeed: { value: 0 },
      uTwist: { value: 2 },
      uSpin: { value: 1 },
      uSpokes: { value: 24 },
      uRingSpacing: { value: 0.5 },
      uLineWidth: { value: 0.04 },
      uFlow: { value: 0.6 },
      uGridGlow: { value: 2 },
      uHotGlow: { value: 2 },
      uShade: { value: 0.8 },
      uFeather: { value: 0.2 },
      uGrain: { value: 0.5 },
      uOpen: { value: 0 },
      uOpacity: { value: 1 },
      uFade: { value: 1 },
      uColorBase: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorGrid: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorTint: { value: new Color() },
      uGrip: { value: 0 },
      uCrush: { value: 0 },
      uHorizon: { value: 0.5 },
      uHorizonGrow: { value: 0.5 },
      uPhotonGlow: { value: 2 },
      uPhotonWidth: { value: 0.12 },
      uArms: { value: 3 },
      uArmTight: { value: 1.6 },
      uFieldSpin: { value: 1 },
      uFieldFlow: { value: 0.6 },
      uFieldContrast: { value: 1.6 },
      uFieldGlow: { value: 1.6 },
      uRipple: { value: 0.25 },
      uOccludeEdge: { value: 1 }
    }),
    vertexShader: WELL_VERTEX,
    fragmentShader: WELL_FRAGMENT
  });

  /** @param {object} state { centre, reach, depth, clock, open, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.graviton;
    const g = settings.global;
    const u = material.uniforms;
    if (state.centre) u.uCentre.value.copy(state.centre);
    u.uReach.value = Math.max(0.2, state.reach ?? 4);
    u.uThroat.value = Math.max(0.05, c.wellThroat);
    u.uDepth.value = state.depth ?? 0;
    u.uClock.value = state.clock ?? 0;
    u.uOpen.value = state.open ?? 0;
    u.uFade.value = state.fade ?? 1;
    u.uSeed.value = state.seed ?? 0;
    u.uLift.value = c.wellLift;
    u.uDepthBias.value = c.wellDepthBias;
    u.uTwist.value = c.wellTwist;
    u.uSpin.value = c.wellSpin * g.noiseSpeed;
    u.uSpokes.value = Math.max(1, Math.round(c.wellSpokes));
    u.uRingSpacing.value = c.wellRingSpacing;
    u.uLineWidth.value = c.wellLineWidth;
    u.uFlow.value = c.wellFlow * g.noiseSpeed;
    u.uGridGlow.value = c.wellGridGlow * g.glow * g.shaderIntensity;
    u.uHotGlow.value = c.wellHotGlow * g.glow;
    u.uShade.value = c.wellShade;
    u.uFeather.value = Math.max(0.01, c.wellFeather);
    u.uGrain.value = c.wellGrain * g.noiseStrength;
    u.uOpacity.value = c.wellOpacity * g.opacity;
    u.uColorBase.value.copy(getColor(c.colorWellBase));
    u.uColorDeep.value.copy(getColor(c.colorWellDeep));
    u.uColorGrid.value.copy(getColor(c.colorWellGrid));
    u.uColorHot.value.copy(getColor(c.colorWellHot));
    u.uColorBody.value.copy(getColor(c.colorWellBody));
    u.uColorTint.value.copy(getColor(c.colorWellTint));
    u.uGrip.value = state.grip ?? 0;
    u.uCrush.value = state.crush ?? 0;
    u.uHorizon.value = c.wellHorizon;
    u.uHorizonGrow.value = c.wellHorizonGrow;
    u.uPhotonGlow.value = c.wellPhotonGlow * g.glow;
    u.uPhotonWidth.value = Math.max(0.01, c.wellPhotonWidth);
    u.uArms.value = Math.max(1, Math.round(c.wellArms));
    u.uArmTight.value = c.wellArmTight;
    u.uFieldSpin.value = c.wellFieldSpin * g.noiseSpeed;
    u.uFieldFlow.value = c.wellFieldFlow * g.noiseSpeed;
    u.uFieldContrast.value = Math.max(0.1, c.wellFieldContrast);
    u.uFieldGlow.value = c.wellFieldGlow * g.shaderIntensity;
    u.uRipple.value = c.wellRipple * g.turbulence;
    u.uOccludeEdge.value = c.wellOcclude;
  };

  return material;
}
