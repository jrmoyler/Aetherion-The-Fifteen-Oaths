import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Heartstake — the bespoke shaders the stake is drawn with.
 *
 *  - **the stake** — a lathe grid (`createStakeGeometry`) turned into a barbed
 *    spike of coagulated blood in the vertex stage: a forked, three-finned
 *    tail; a lobed heart knot that *throbs* on every beat; a faceted shaft
 *    crowded with backward-raked barbs that narrows to a needle point. The
 *    fragment stage shades it as dark garnet glass with flat facets (screen-
 *    space derivatives), a red fresnel rim and a sharp specular glint, and
 *    lights it from inside: blood veins streaming toward the point, the heart
 *    flaring on the beat and each beat's surge running knot → point. When the
 *    beats stop it dries to brown-black and crumbles away point-first.
 *  - **the thorn roots** — up to sixteen barbed blood-glass roots in one
 *    parameter-space buffer (`createThornGeometry`), each bent in the vertex
 *    stage into an arch that breaks the floor beside the stake, stands
 *    `thornArch` metres and dives back under at its reach. They grow out a
 *    step on every heartbeat, the beat's pressure front swells and lights
 *    them as it runs outward, and they dry and crumble tips-first with the
 *    stake. Same garnet-glass shading as the stake, lit by the sun.
 *  - **the trail** — a camera-facing ribbon behind the stake, streaky with
 *    blood that is still flowing back off it.
 *  - **the stain** — a ground quad at the plunge: a wet, glinting blood stain
 *    spreading with a fingered edge, radial capillaries reaching out of it (the
 *    stake *rooting*), and a bright pressure ring running out along them on
 *    every heartbeat. It dries matte and erodes.
 *  - **the heart glow** — a camera-facing bloom at the knot.
 *  - **the pulse warp** — a flat ring on `LAYER.DISTORTION` thrown out over the
 *    floor on each beat, so the air visibly thumps.
 *
 * Every material reads `settings.heartstake` in `userData.sync(state)`; `state`
 * carries only what the ability knows that the settings do not.
 */

const ID = 'heartstake';

/* -------------------------------------------------------------------- */
/* The stake                                                            */
/* -------------------------------------------------------------------- */

/** The stake's profile — shared by its vertex stage only, kept in one place. */
const STAKE_PROFILE = /* glsl */ `
  uniform float uRadius;      // shaft radius, metres
  uniform float uKnotR;       // heart radius, × the shaft
  uniform float uKnotAt;      // 0..1 where the heart sits
  uniform float uKnotW;       // its half-width, 0..1
  uniform float uThrob;       // 0..1 the beat's swell right now
  uniform float uThrobAmt;
  uniform float uBarbRows;
  uniform float uBarbCount;
  uniform float uBarbLen;     // × the shaft radius
  uniform float uFins;        // tail fin flare, × the shaft radius
  uniform float uTaper;
  uniform float uGrow;        // 0..1 the stake forming

  float stakeR(float s, float ang) {
    // the shaft behind the heart, flaring into three fins at the tail
    float r = 0.55 + uFins * smoothstep(0.07, 0.0, s) * (0.35 + pow(abs(cos(ang * 1.5)), 6.0));
    // the shaft ahead of the heart narrows to a needle
    float t = clamp((s - 0.24) / 0.76, 0.0, 1.0);
    float shaft = pow(1.0 - t, max(uTaper, 0.05));
    r = mix(r, shaft, smoothstep(0.2, 0.26, s));
    // the heart: two lobes, swelling on the beat
    float k = exp(-pow((s - uKnotAt) / max(uKnotW, 0.01), 2.0));
    float knot = uKnotR * (1.0 + uThrob * uThrobAmt) * (1.0 + 0.24 * cos(2.0 * ang));
    r = max(r, knot * k);
    // barbs, raked back toward the tail: a sharp lip, a long slope to the point
    float row = (s - 0.32) * uBarbRows;
    float saw = fract(row);
    float rowMask = step(0.32, s) * step(s, 0.88);
    float around = pow(max(cos(ang * uBarbCount + floor(row) * 1.7), 0.0), 12.0);
    r += pow(1.0 - saw, 3.0) * around * uBarbLen * rowMask * shaft;
    return r * uRadius * uGrow;
  }
`;

const STAKE_VERTEX = /* glsl */ `
  uniform vec3  uTail;
  uniform vec3  uAxis;
  uniform float uLength;
  uniform float uTwist;

  varying float vS;
  varying float vAng;
  varying vec3  vWorld;
  varying float vKnot;

  ${STAKE_PROFILE}

  void main() {
    float s = position.x;
    float ang = position.y * 6.2831853;
    vec3 T = normalize(uAxis);
    vec3 ref = abs(T.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 N1 = normalize(cross(T, ref));
    vec3 B = cross(N1, T);
    float a = ang + uTwist * s;
    vec3 radial = cos(a) * N1 + sin(a) * B;
    float L = uLength * uGrow;
    vec3 world = uTail + T * s * L + radial * stakeR(s, ang);
    vS = s;
    vAng = ang;
    vWorld = world;
    vKnot = exp(-pow((s - uKnotAt) / max(uKnotW * 1.4, 0.01), 2.0));
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const STAKE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uLength;
  uniform float uSeed;
  uniform float uFlow;        // integrated vein flow
  uniform float uVeinScale;
  uniform float uVeinGlow;
  uniform float uHeartGlow;
  uniform float uThrob;
  uniform float uSurge;       // 0..1 where the beat's surge has got to along the stake (−1 none)
  uniform float uSurgeGlow;
  uniform float uFresnel;
  uniform float uSpec;
  uniform float uDry;         // 0 wet .. 1 dried
  uniform float uCrumble;     // 0 whole .. 1 gone
  uniform float uKnotAt;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorHot;
  uniform vec3  uColorRim;
  uniform vec3  uColorDry;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying float vS;
  varying float vAng;
  varying vec3  vWorld;
  varying float vKnot;

  ${noiseGLSL}

  void main() {
    // crumbling away point-first, with a hot fraying edge
    float cn = snoise(vWorld * 5.0 + uSeed) * 0.5 + 0.5;
    float field = vS * 0.75 + cn * 0.25;
    float thr = 1.05 - uCrumble * 1.15;
    if (uCrumble > 0.0 && field > thr) discard;
    float fray = uCrumble > 0.0 ? 1.0 - smoothstep(0.0, 0.05, thr - field) : 0.0;

    vec3 V = normalize(cameraPosition - vWorld);
    // Flat facets: the coagulate is cut glass, not a smooth tube.
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float diff = max(dot(N, L), 0.0);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0) * uFresnel;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 70.0) * uSpec;

    // Blood inside: veins streaming toward the point.
    float d = vS * uLength;
    float vein = 1.0 - abs(snoise(vec3(d * uVeinScale - uFlow, cos(vAng) * 1.4 + uSeed, sin(vAng) * 1.4)));
    vein = pow(vein, 7.0) * uShaderIntensity;
    // The beat's surge, running knot → point.
    float surge = uSurge < 0.0 ? 0.0 : exp(-pow((vS - uSurge) / 0.07, 2.0)) * step(uKnotAt - 0.05, vS);
    float heart = vKnot * (0.35 + 1.6 * uThrob);
    float inner = vein * uVeinGlow + heart * uHeartGlow + surge * uSurgeGlow;

    vec3 body = mix(uColorDeep, uColorBody, diff * 0.55 + 0.12);
    vec3 glow = mix(uColorBody, uColorHot, clamp(inner * 0.4, 0.0, 1.0)) * inner;
    vec3 col = body + glow * uGlobalGlow + uColorRim * fres * uGlobalGlow + vec3(spec);

    // Dried: brown-black, matte, the light inside gone.
    vec3 dry = uColorDry * (0.35 + 0.65 * diff) + uColorDry * fres * 0.4;
    col = mix(col, dry, uDry);
    col += uColorHot * fray * 3.0 * uGlobalGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The stake itself: opaque, bent from parameter space in the vertex stage. */
export function createStakeMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uTail: { value: new Vector3() },
      uAxis: { value: new Vector3(0, 0, 1) },
      uLength: { value: 2 },
      uTwist: { value: 0.6 },
      uRadius: { value: 0.12 },
      uKnotR: { value: 2.2 },
      uKnotAt: { value: 0.16 },
      uKnotW: { value: 0.07 },
      uThrob: { value: 0 },
      uThrobAmt: { value: 0.35 },
      uBarbRows: { value: 5 },
      uBarbCount: { value: 3 },
      uBarbLen: { value: 1.2 },
      uFins: { value: 1.2 },
      uTaper: { value: 0.9 },
      uGrow: { value: 1 },
      uSeed: { value: 0 },
      uFlow: { value: 0 },
      uVeinScale: { value: 2.4 },
      uVeinGlow: { value: 1.6 },
      uHeartGlow: { value: 3 },
      uSurge: { value: -1 },
      uSurgeGlow: { value: 3 },
      uFresnel: { value: 1.4 },
      uSpec: { value: 1.2 },
      uDry: { value: 0 },
      uCrumble: { value: 0 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorDry: { value: new Color() }
    }),
    vertexShader: STAKE_VERTEX,
    fragmentShader: STAKE_FRAGMENT
  });

  /** @param {object} state { tail, axis, grow, throb, surge, flow, dry, crumble, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTail.value.copy(state.tail);
    u.uAxis.value.copy(state.axis);
    u.uLength.value = Math.max(0.1, c.stakeLength);
    u.uTwist.value = c.twist;
    u.uRadius.value = Math.max(0.005, c.stakeRadius);
    u.uKnotR.value = c.heartSize;
    u.uKnotAt.value = c.heartAt;
    u.uKnotW.value = c.heartWidth;
    u.uThrob.value = state.throb;
    u.uThrobAmt.value = c.throb;
    u.uBarbRows.value = c.barbRows;
    u.uBarbCount.value = Math.max(1, Math.round(c.barbsAround));
    u.uBarbLen.value = c.barbLength;
    u.uFins.value = c.finFlare;
    u.uTaper.value = c.taper;
    u.uGrow.value = state.grow;
    u.uSeed.value = state.seed;
    u.uFlow.value = state.flow;
    u.uVeinScale.value = c.veinScale * g.noiseFrequency;
    u.uVeinGlow.value = c.veinGlow * g.glow;
    u.uHeartGlow.value = c.heartGlow * g.glow;
    u.uSurge.value = state.surge;
    u.uSurgeGlow.value = c.surgeGlow * g.glow;
    u.uFresnel.value = c.rimGlow * g.fresnel;
    u.uSpec.value = c.gloss;
    u.uDry.value = state.dry;
    u.uCrumble.value = state.crumble;
    u.uColorDeep.value.copy(getColor(c.colorStakeDeep));
    u.uColorBody.value.copy(getColor(c.colorStakeBody));
    u.uColorHot.value.copy(getColor(c.colorStakeHot));
    u.uColorRim.value.copy(getColor(c.colorStakeRim));
    u.uColorDry.value.copy(getColor(c.colorDry));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The thorn roots                                                      */
/* -------------------------------------------------------------------- */

const THORN_VERTEX = /* glsl */ `
  uniform vec3  uCenter;      // the stake's foot, on the floor
  uniform float uYaw;         // bearing of root 0 (the cast direction)
  uniform float uCount;       // live roots
  uniform float uReach;       // metres the longest root reaches at full growth
  uniform float uGrow;        // 0..1 how far they have grown (steps up per beat)
  uniform float uArch;        // metres the arch stands
  uniform float uStartR;      // metres from the stake they break the floor
  uniform float uRadius;      // tube radius at the stake, metres
  uniform float uTaper;
  uniform float uWander;
  uniform float uSink;        // metres the far end dives under the floor
  uniform float uJitter;
  uniform float uSpikes;      // spike rows along a root
  uniform float uSpikeLen;    // × the local radius
  uniform float uThrob;       // the beat's swell
  uniform float uRingR;       // the beat's pressure front, metres (−1 none)
  uniform float uSeed;

  varying float vS;
  varying float vAlong;       // metres from the stake, on the floor
  varying float vIdx;
  varying vec3  vWorld;
  varying float vPulse;

  float hash1(float n) { return fract(sin(n * 12.9898 + uSeed * 3.17) * 43758.5453); }

  // Where root i is at s, in metres, given its dice.
  vec3 thornPath(float s, float bear, float len, float arch) {
    float d = mix(uStartR, uStartR + uReach * len * uGrow, s);
    float a = bear + uWander * sin(s * 3.4 + bear * 2.0) * s;
    float lift = pow(max(sin(3.14159 * s), 0.0), 0.75);
    float y = arch * (0.35 + 0.65 * uGrow) * lift - mix(0.35, uSink, s) * (1.0 - lift);
    return uCenter + vec3(cos(a) * d, y, sin(a) * d);
  }

  void main() {
    float idx = position.z;
    vIdx = idx;
    if (idx >= uCount) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      vS = 0.0; vAlong = 0.0; vWorld = vec3(0.0); vPulse = 0.0;
      return;
    }
    float s = position.x;
    float ang = position.y * 6.2831853;
    float bear = uYaw + (idx + 0.5 + (hash1(idx) - 0.5) * uJitter) / uCount * 6.2831853;
    float len = 1.0 - uJitter * 0.6 * hash1(idx + 7.0);
    float arch = 1.0 - uJitter * 0.5 * hash1(idx + 13.0);

    vec3 P = thornPath(s, bear, len, arch);
    vec3 Q = thornPath(min(s + 0.01, 1.0), bear, len, arch);
    vec3 R0 = thornPath(max(s - 0.01, 0.0), bear, len, arch);
    vec3 T = normalize(Q - R0 + vec3(1e-5, 0.0, 0.0));
    vec3 N1 = normalize(cross(T, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 0.0, 1e-5));
    vec3 B = cross(N1, T);

    float along = length(P.xz - uCenter.xz);
    float pulse = uRingR < 0.0 ? 0.0 : exp(-pow((along - uRingR) / 0.45, 2.0));
    float rad = uRadius * pow(max(1.0 - s * 0.82, 0.02), uTaper) * (0.55 + 0.45 * uGrow);
    rad *= 1.0 + 0.22 * uThrob + 0.45 * pulse;
    // spikes raked back toward the stake
    float row = s * uSpikes + hash1(idx + 21.0);
    float saw = fract(row);
    float around = pow(max(cos(ang * 2.0 + floor(row) * 2.3 + idx), 0.0), 10.0);
    float spike = pow(1.0 - saw, 3.0) * around * uSpikeLen * step(0.08, s) * step(s, 0.92);
    vec3 world = P + (cos(ang) * N1 + sin(ang) * B) * rad * (1.0 + spike);

    vS = s;
    vAlong = along;
    vWorld = world;
    vPulse = pulse;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const THORN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uSeed;
  uniform float uFlow;
  uniform float uVeinScale;
  uniform float uVeinGlow;
  uniform float uPulseGlow;
  uniform float uThrob;
  uniform float uFresnel;
  uniform float uSpec;
  uniform float uDry;
  uniform float uCrumble;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorHot;
  uniform vec3  uColorRim;
  uniform vec3  uColorDry;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying float vS;
  varying float vAlong;
  varying float vIdx;
  varying vec3  vWorld;
  varying float vPulse;

  ${noiseGLSL}

  void main() {
    // Crumbling from the tips back toward the stake.
    float cn = snoise(vWorld * 4.0 + uSeed) * 0.5 + 0.5;
    float tipward = abs(vS - 0.5) * 2.0;
    float field = tipward * 0.7 + cn * 0.3;
    float thr = 1.05 - uCrumble * 1.15;
    if (uCrumble > 0.0 && field > thr) discard;
    float fray = uCrumble > 0.0 ? 1.0 - smoothstep(0.0, 0.05, thr - field) : 0.0;

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float diff = max(dot(N, L), 0.0);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0) * uFresnel;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 60.0) * uSpec;

    // Veins of blood running out from the stake along the root.
    float vein = 1.0 - abs(snoise(vec3(vAlong * uVeinScale - uFlow, vIdx * 3.1 + uSeed, vWorld.y * 2.0)));
    vein = pow(vein, 8.0) * uShaderIntensity;
    float inner = vein * uVeinGlow * (0.6 + 0.8 * uThrob) + vPulse * uPulseGlow;

    vec3 body = mix(uColorDeep, uColorBody, diff * 0.6 + 0.1);
    vec3 glow = mix(uColorBody, uColorHot, clamp(inner * 0.45, 0.0, 1.0)) * inner;
    vec3 col = body + glow * uGlobalGlow + uColorRim * fres * uGlobalGlow * 0.7 + vec3(spec);
    vec3 dry = uColorDry * (0.3 + 0.7 * diff) + uColorDry * fres * 0.3;
    col = mix(col, dry, uDry);
    col += uColorHot * fray * 3.0 * uGlobalGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The thorn roots the stake sends out across the floor. Opaque, `LAYER.SHAPED`. */
export function createThornMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uYaw: { value: 0 },
      uCount: { value: 9 },
      uReach: { value: 4 },
      uGrow: { value: 0 },
      uArch: { value: 1.2 },
      uStartR: { value: 0.3 },
      uRadius: { value: 0.2 },
      uTaper: { value: 1 },
      uWander: { value: 0.3 },
      uSink: { value: 0.3 },
      uJitter: { value: 0.35 },
      uSpikes: { value: 7 },
      uSpikeLen: { value: 1.5 },
      uThrob: { value: 0 },
      uRingR: { value: -1 },
      uSeed: { value: 0 },
      uFlow: { value: 0 },
      uVeinScale: { value: 2 },
      uVeinGlow: { value: 1 },
      uPulseGlow: { value: 3 },
      uFresnel: { value: 1 },
      uSpec: { value: 1 },
      uDry: { value: 0 },
      uCrumble: { value: 0 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorDry: { value: new Color() }
    }),
    vertexShader: THORN_VERTEX,
    fragmentShader: THORN_FRAGMENT
  });

  /** @param {object} s { center, yaw, grow, throb, ringR, flow, dry, crumble, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uYaw.value = s.yaw;
    u.uCount.value = Math.max(1, Math.min(16, Math.round(c.thornRoots)));
    u.uReach.value = Math.max(0.1, c.rootReach * c.thornReach);
    u.uGrow.value = s.grow;
    u.uArch.value = c.thornArch;
    u.uStartR.value = c.stakeRadius * 1.2;
    u.uRadius.value = Math.max(0.01, c.thornRadius);
    u.uTaper.value = c.thornTaper;
    u.uWander.value = c.thornWander * g.noiseStrength;
    u.uSink.value = c.thornSink;
    u.uJitter.value = c.thornJitter * g.randomness;
    u.uSpikes.value = c.thornSpikes;
    u.uSpikeLen.value = c.thornSpikeLen;
    u.uThrob.value = s.throb * c.throb * 2;
    u.uRingR.value = s.ringR;
    u.uSeed.value = s.seed;
    u.uFlow.value = s.flow;
    u.uVeinScale.value = c.veinScale * g.noiseFrequency;
    u.uVeinGlow.value = c.thornVeinGlow * g.glow;
    u.uPulseGlow.value = c.thornPulseGlow * g.glow;
    u.uFresnel.value = c.rimGlow * g.fresnel;
    u.uSpec.value = c.gloss;
    u.uDry.value = s.dry;
    u.uCrumble.value = s.crumble;
    u.uColorDeep.value.copy(getColor(c.colorStakeDeep));
    u.uColorBody.value.copy(getColor(c.colorThornBody));
    u.uColorHot.value.copy(getColor(c.colorStakeHot));
    u.uColorRim.value.copy(getColor(c.colorStakeRim));
    u.uColorDry.value.copy(getColor(c.colorDry));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The trail                                                            */
/* -------------------------------------------------------------------- */

const TRAIL_VERTEX = /* glsl */ `
  uniform vec3  uHead;        // the stake's tail
  uniform vec3  uBack;        // where the trail ends
  uniform float uWidth;

  varying vec2 vRib;          // x: 0 head .. 1 back, y: -1..1 across

  void main() {
    vec3 base = mix(uHead, uBack, position.x);
    vec3 dir = normalize(uHead - uBack + vec3(1e-5, 0.0, 0.0));
    vec3 toCam = normalize(cameraPosition - base);
    vec3 axis = normalize(cross(dir, toCam) + vec3(0.0, 1e-4, 0.0));
    // A comet's taper: full behind the stake, a thread at the end.
    float w = uWidth * (1.0 - position.x) * (0.55 + 0.45 * (1.0 - position.x));
    vec3 world = base + axis * position.y * w;
    vRib = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  uniform float uLength;
  uniform float uFlow;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uOpacity;
  uniform vec3  uColorDeep;
  uniform vec3  uColorHot;
  uniform float uGlobalGlow;

  varying vec2 vRib;

  ${noiseGLSL}

  void main() {
    float along = vRib.x * uLength;
    // Streaks: blood shed backward off the stake, stretched along the flight.
    float n = snoise(vec3(along * 0.9 + uFlow, vRib.y * 3.2, uSeed));
    float n2 = snoise(vec3(along * 2.6 + uFlow * 1.6, vRib.y * 7.0, uSeed + 4.0));
    float streak = smoothstep(-0.2, 0.7, n * 0.7 + n2 * 0.45 - abs(vRib.y) * 0.9);
    float core = exp(-vRib.y * vRib.y * 9.0) * (1.0 - vRib.x);
    float a = streak * (1.0 - smoothstep(0.55, 1.0, abs(vRib.y))) * pow(1.0 - vRib.x, 0.8);
    a *= uOpacity;
    if (a < 0.004) discard;
    vec3 col = mix(uColorDeep, uColorHot * uGlow * uGlobalGlow, core * 0.8 + streak * 0.2);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The blood shed behind the stake in flight. Normal blending — blood is dark. */
export function createTrailMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHead: { value: new Vector3() },
      uBack: { value: new Vector3() },
      uWidth: { value: 0.3 },
      uLength: { value: 4 },
      uFlow: { value: 0 },
      uSeed: { value: 0 },
      uGlow: { value: 2 },
      uOpacity: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: TRAIL_VERTEX,
    fragmentShader: TRAIL_FRAGMENT
  });

  /** @param {object} state { head, back, flow, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHead.value.copy(state.head);
    u.uBack.value.copy(state.back);
    u.uWidth.value = c.trailWidth;
    u.uLength.value = Math.max(0.05, state.head.distanceTo(state.back));
    u.uFlow.value = state.flow;
    u.uSeed.value = state.seed;
    u.uGlow.value = c.trailGlow * g.glow;
    u.uOpacity.value = c.trailOpacity * g.opacity * state.fade;
    u.uColorDeep.value.copy(getColor(c.colorTrailDeep));
    u.uColorHot.value.copy(getColor(c.colorTrailHot));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The stain and its roots                                              */
/* -------------------------------------------------------------------- */

const FLAT_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;        // half-extent of the quad, metres

  varying vec2 vP;            // metres from the centre, on the floor

  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    vP = position.xy * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const STAIN_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uSpread;      // stain radius, metres
  uniform float uFingers;     // how far the fingers reach, × the radius
  uniform float uFingerFreq;
  uniform float uRootCount;
  uniform float uRootReach;   // metres the capillaries reach right now
  uniform float uRootWidth;
  uniform float uRootWander;
  uniform float uRingR;       // radius of the beat's pressure ring (−1 none)
  uniform float uRingW;
  uniform float uRingGlow;
  uniform float uBeat;        // 0..1 the beat's flare
  uniform float uRootGlow;
  uniform float uOpacity;
  uniform float uDry;
  uniform float uFadeT;
  uniform float uGloss;
  uniform vec3  uColorStain;
  uniform vec3  uColorWet;
  uniform vec3  uColorHot;
  uniform vec3  uColorDry;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec2 vP;

  ${noiseGLSL}

  float heightAt(vec2 p) {
    return fbm3(vec3(p * 2.3, uSeed));
  }

  void main() {
    float r = length(vP);
    float a = atan(vP.y, vP.x);
    vec2 ca = vec2(cos(a), sin(a));

    // The stain: a fingered, soaking edge.
    float fn = snoise(vec3(ca * uFingerFreq, uSeed));
    float fingers = pow(max(fn, 0.0), 2.0) * uFingers;
    float edge = uSpread * (1.0 + fingers) + fbm3(vec3(vP * 2.4, uSeed + 3.0)) * 0.18 * uSpread;
    float stain = 1.0 - smoothstep(edge - 0.1, edge, r);

    // The roots: radial capillaries wandering out of it.
    float wander = snoise(vec3(r * 0.9, uSeed * 1.3, 0.0)) * uRootWander;
    float fa = a / 6.2831853 * uRootCount + wander;
    float gap = abs(fract(fa) - 0.5) * 6.2831853 * max(r, 0.05) / max(uRootCount, 1.0);
    float thin = uRootWidth * (1.0 - smoothstep(0.0, max(uRootReach, 0.01), r) * 0.75);
    float roots = (1.0 - smoothstep(thin * 0.4, thin, gap)) * (1.0 - smoothstep(uRootReach - 0.6, uRootReach, r));
    // a second, finer rank forking out past the stain
    float fb = a / 6.2831853 * uRootCount * 2.0 + wander * 1.7 + 0.25;
    float gap2 = abs(fract(fb) - 0.5) * 6.2831853 * max(r, 0.05) / max(uRootCount * 2.0, 1.0);
    float roots2 = (1.0 - smoothstep(thin * 0.2, thin * 0.6, gap2)) * smoothstep(uSpread * 0.8, uSpread * 1.4, r)
                 * (1.0 - smoothstep(uRootReach * 0.75 - 0.4, uRootReach * 0.75, r));
    float rootM = max(roots, roots2 * 0.8) * smoothstep(0.15, 0.4, r);

    // The beat's pressure ring, running out along the roots.
    float ring = uRingR < 0.0 ? 0.0 : exp(-pow((r - uRingR) / max(uRingW, 0.02), 2.0));

    // Wet glint: a fake normal off a height field, lit by the stage's sun.
    float e = 0.04;
    float h0 = heightAt(vP);
    float hx = heightAt(vP + vec2(e, 0.0));
    float hz = heightAt(vP + vec2(0.0, e));
    vec3 N = normalize(vec3(-(hx - h0) / e * 0.18, 1.0, -(hz - h0) / e * 0.18));
    vec3 V = normalize(cameraPosition - vec3(vP.x, 0.0, vP.y));
    vec3 H = normalize(normalize(uLightDir) + V);
    float spec = pow(max(dot(N, H), 0.0), 80.0) * uGloss * (1.0 - uDry);

    vec3 col = mix(uColorStain, uColorWet, smoothstep(edge, edge * 0.3, r) * 0.6);
    col += vec3(spec);
    vec3 hot = uColorHot * uGlobalGlow * uRootGlow * (0.25 + 1.2 * uBeat + ring * uRingGlow);
    col = mix(col, hot, rootM * (1.0 - uDry * 0.85));
    col += uColorHot * ring * stain * uRingGlow * 0.25 * uGlobalGlow * (1.0 - uDry);
    col = mix(col, uColorDry * (0.7 + 0.3 * h0), uDry * max(stain, rootM));

    float alpha = max(stain, rootM * 0.95);
    // Erodes raggedly as it fades.
    float n = snoise(vec3(vP * 1.6, uSeed * 4.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, n);
    alpha *= vis * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The stain the stake roots into. Normal blending: wet blood is dark. */
export function createStainMaterial() {
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
      uCenter: { value: new Vector3() },
      uSize: { value: 4 },
      uSeed: { value: 0 },
      uSpread: { value: 1 },
      uFingers: { value: 0.6 },
      uFingerFreq: { value: 2.5 },
      uRootCount: { value: 9 },
      uRootReach: { value: 3 },
      uRootWidth: { value: 0.12 },
      uRootWander: { value: 0.25 },
      uRingR: { value: -1 },
      uRingW: { value: 0.3 },
      uRingGlow: { value: 2 },
      uBeat: { value: 0 },
      uRootGlow: { value: 2 },
      uOpacity: { value: 1 },
      uDry: { value: 0 },
      uFadeT: { value: 0 },
      uGloss: { value: 1 },
      uColorStain: { value: new Color() },
      uColorWet: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorDry: { value: new Color() }
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: STAIN_FRAGMENT
  });

  /** @param {object} state { center, spread, reach, ringR, beat, dry, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.5, c.rootReach * 1.15, c.stainRadius * (1 + c.stainFingers) * 1.3);
    u.uSeed.value = state.seed;
    u.uSpread.value = Math.max(0.01, state.spread);
    u.uFingers.value = c.stainFingers * g.randomness;
    u.uFingerFreq.value = c.stainFingerFreq * g.noiseFrequency;
    u.uRootCount.value = Math.max(1, Math.round(c.rootCount));
    u.uRootReach.value = state.reach;
    u.uRootWidth.value = c.rootWidth;
    u.uRootWander.value = c.rootWander * g.noiseStrength;
    u.uRingR.value = state.ringR;
    u.uRingW.value = c.ringWidth;
    u.uRingGlow.value = c.ringGlow * g.shaderIntensity;
    u.uBeat.value = state.beat;
    u.uRootGlow.value = c.rootGlow * g.glow;
    u.uOpacity.value = c.stainOpacity * g.opacity;
    u.uDry.value = state.dry;
    u.uFadeT.value = state.fadeT;
    u.uGloss.value = c.stainGloss;
    u.uColorStain.value.copy(getColor(c.colorStain));
    u.uColorWet.value.copy(getColor(c.colorStainWet));
    u.uColorHot.value.copy(getColor(c.colorRoots));
    u.uColorDry.value.copy(getColor(c.colorDry));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The heart glow                                                       */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2  vUv;
  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
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
    float a = atan(vUv.y, vUv.x);
    float core = exp(-r * r * 26.0);
    // A ragged, pulsing halo — it bleeds rather than shines.
    float rag = 0.75 + 0.25 * snoise(vec3(cos(a) * 2.5, sin(a) * 2.5, uTime * 1.7 + uSeed));
    float halo = exp(-r * 3.6 / rag) * (1.0 - smoothstep(0.7, 1.0, r));
    vec3 col = uColorHalo * halo + uColorCore * core * 2.0;
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, clamp(halo + core, 0.0, 1.0));
  }
`;

/** The heart's bloom. */
export function createHeartGlowMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 0.6 },
      uSeed: { value: 0 },
      uIntensity: { value: 0 },
      uColorCore: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: GLOW_FRAGMENT
  });

  /** @param {object} state { center, size, intensity, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.01, state.size);
    u.uIntensity.value = state.intensity * c.glowStrength * g.glow;
    u.uSeed.value = state.seed;
    u.uColorCore.value.copy(getColor(c.colorGlowCore));
    u.uColorHalo.value.copy(getColor(c.colorGlowHalo));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The beat's thump in the air — LAYER.DISTORTION                       */
/* -------------------------------------------------------------------- */

const WARP_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vP;
  uniform float uSize;

  void main() {
    vec2 q = vP / max(uSize, 0.01);
    float r = length(q);
    if (r > 1.0) discard;
    float R = 0.05 + 0.92 * uProgress;
    float d = (r - R) / 0.09;
    float slope = -d * exp(-d * d);
    vec2 dir = q / max(r, 1e-4);
    float mask = exp(-d * d) * (1.0 - uProgress);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * clamp(slope * 2.0, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** A flat ring of bent air thrown out over the floor on each heartbeat. */
export function createPulseWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 3 },
      uProgress: { value: 0 },
      uStrength: { value: 1 }
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} state { center, progress, strength } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.2, c.rootReach);
    u.uProgress.value = state.progress;
    u.uStrength.value = c.beatWarp * g.distortion * state.strength;
  };

  return material;
}

