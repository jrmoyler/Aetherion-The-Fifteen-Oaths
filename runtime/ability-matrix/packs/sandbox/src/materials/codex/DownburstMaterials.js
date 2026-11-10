import {
  AddEquation,
  Color,
  CustomBlending,
  DoubleSide,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector2,
  Vector3
} from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Downburst — the six bespoke shaders the falling column of air is drawn with.
 *
 *  - **the storm cloud** — a polar disc (`createPolarDiscGeometry`) hung over
 *    the circle and bent in its vertex stage: the middle sags into a heavy
 *    pressure core, the rim curls up like a shelf cloud and the whole underside
 *    billows on noise sampled in a co-rotating frame. Its fragment stage is a
 *    spiral fbm — the sampling angle is wound by `swirl × (1 − r)²`, so the arms
 *    tighten toward the core — lit by a two-tap gradient toward the sun (the
 *    side of a billow that faces the key is the bright side), with flickers of
 *    sheet lightning hidden inside it. Normal blending: a storm cloud is dark.
 *  - **the pressure funnel** — `LAYER.DISTORTION`. A tube reaching down out of
 *    the cloud whose warp is noise sampled in a frame twisted by height, so the
 *    world behind it visibly churns and spirals before anything has fallen.
 *  - **the column** — the same tube, splayed at the foot (a real downburst
 *    fans out where it meets the ground) and pinched up into the cloud. It is
 *    drawn premultiplied: a dark storm-blue body of falling air (the deep and
 *    body stops of the ramp, shaded by the sun) carries the mass, and only the
 *    streak crests, the walls seen edge-on and the leading front add light
 *    (pale tint and white-hot). It is lifted off the floor through a ragged
 *    noise edge when the slam is spent.
 *  - **the ground blast** — the floor. A telegraph while the cloud gathers (the
 *    circle's edge darkens and pulses), then the shock ring racing out, the
 *    radial scour the outflow combs into the dust behind it, and the pressed
 *    imprint in the middle. Erodes on noise as the dust settles.
 *  - **the dust torus** — the rolling ring of dust riding the shock front: a
 *    torus placed in parameter space whose noise is advected round the tube,
 *    so it *rolls* outward rather than sliding; lit, squashed into the floor and
 *    thinned at the silhouette so it reads as a volume.
 *  - **the shock lens** — `LAYER.DISTORTION` again, the ring's bump written as
 *    a radial refraction that rides the wave.
 *
 * Every material reads `settings.downburst` in `userData.sync(state)`; `state`
 * carries only what the ability knows and the settings do not (the clock-driven
 * envelopes, the integrated phases, the centre).
 */

/* -------------------------------------------------------------------- */
/* The storm cloud                                                      */
/* -------------------------------------------------------------------- */

const CLOUD_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uRadius;      // metres, already scaled by the form envelope
  uniform float uHeight;      // metres the cloud's rim hangs at
  uniform float uSag;         // metres the pressure core hangs below it
  uniform float uSagWidth;    // 0..1 of the radius the sag spans
  uniform float uBillow;      // metres of noise on the underside
  uniform float uBillowScale;
  uniform float uSpin;        // radians, integrated on the CPU
  uniform float uSeed;
  uniform float uBoil;
  uniform float uTime;
  uniform float uDome;        // metres the upper shell towers over the rim (0 = the underside)

  varying vec2 vDisc;         // unit-disc point in the cloud's own frame
  varying float vR;
  varying float vUp;          // 0..1 how far up the tower this point sits

  ${noiseGLSL}

  void main() {
    float r = uv.x;
    float th = uv.y * 6.28318530718;
    vec2 dir = vec2(cos(th), sin(th));
    vec2 xz = dir * r * uRadius;

    // The heavy core: a gaussian hanging out of the middle.
    float sw = max(uSagWidth, 0.05);
    float sag = uSag * exp(-(r * r) / (sw * sw));

    // Billows, in a frame turning with the cloud so they are carried round.
    vec2 q = rot2(uSpin) * dir * r;
    float b = snoise(vec3(q * uBillowScale, uSeed + uTime * uBoil));
    float y = uHeight - sag + b * uBillow * (0.35 + 0.65 * (1.0 - r));
    // The rim curls up a little, like the lip of a shelf cloud.
    y += r * r * r * uBillow * 0.9;
    // The upper shell: a heaped cumulus tower over the belly, lumpy with
    // its own coarser billows, so from the play camera the cloud is a mass
    // with height rather than a disc seen edge-on.
    float dome = sqrt(max(0.0, 1.0 - r * r));
    float lump = snoise(vec3(q * uBillowScale * 0.6, uSeed * 1.7 + uTime * uBoil * 0.6));
    y += uDome * dome * (0.8 + 0.35 * lump) + (uDome > 0.0 ? sag * 0.85 : 0.0);
    vUp = uDome > 0.0 ? dome : 0.0;

    vDisc = dir * r;
    vR = r;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + xz.x, y, uCentre.z + xz.y, 1.0);
  }
`;

const CLOUD_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uSpin;
  uniform float uSwirl;       // how hard the arms wind toward the core
  uniform float uArms;
  uniform float uArmAmount;
  uniform float uScale;
  uniform float uBoil;
  uniform float uCover;       // density threshold — lower = more cloud
  uniform float uEdge;        // where the rim starts to break up, 0..1
  uniform float uEdgeNoise;
  uniform float uOpacity;
  uniform float uForm;        // 0..1 the cloud gathering
  uniform float uDissolve;    // 0..1 the cloud tearing apart afterward
  uniform float uDarkCore;
  uniform float uRimGlow;
  uniform float uCharge;      // 0..1 the pressure building in the core
  uniform float uChargeGlow;
  uniform float uFlash;       // sheet lightning, already flickered on the CPU
  uniform vec2  uLightXZ;     // toward the sun, flat, in the cloud's frame
  uniform vec3  uColorCore;
  uniform vec3  uColorBody;
  uniform vec3  uColorRim;
  uniform vec3  uColorFlash;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uShade;       // the upper shell's own darkening toward its foot

  varying vec2 vDisc;
  varying float vR;
  varying float vUp;

  ${noiseGLSL}

  /** Cloud density at a unit-disc point: a wound spiral of fbm. */
  float density(vec2 p) {
    float r = length(p);
    float a = atan(p.y, p.x) + uSpin + uSwirl * (1.0 - r) * (1.0 - r);
    vec2 s = vec2(cos(a), sin(a)) * r;
    float n = fbm4(vec3(s * uScale, uTime * uBoil + uSeed)) * 0.5 + 0.5;
    float arms = 0.5 + 0.5 * sin(a * uArms + r * 7.0);
    float d = mix(n, n * (0.5 + arms), uArmAmount);
    // Thicker toward the core, thinning to the rim.
    return d + (1.0 - r) * 0.3;
  }

  void main() {
    float r = vR;
    float d0 = density(vDisc);
    // Two taps toward the sun: where density falls off toward the light, the
    // billow faces it and is lit; where it rises, it is in its own shadow.
    float d1 = density(vDisc + uLightXZ * 0.07);
    float lit = clamp((d0 - d1) * 5.0 + 0.45, 0.0, 1.0);

    float cover = smoothstep(uCover - 0.16, uCover + 0.2, d0);
    float edge = 1.0 - smoothstep(uEdge, 1.0, r + (d0 - 0.5) * uEdgeNoise);

    // Tearing apart: thin parts first, the core last.
    float thr = uDissolve * 1.3 - 0.15;
    float keep = uDissolve <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.18, d0 * 0.75 + (1.0 - r) * 0.25);

    float alpha = cover * edge * keep * uOpacity * uForm;
    if (alpha < 0.004) discard;

    vec3 body = mix(uColorCore, uColorBody, smoothstep(0.0, 0.85, r + (d0 - 0.5) * 0.4));
    body = mix(body, uColorCore * 0.6, uDarkCore * exp(-r * r * 9.0));
    vec3 color = body * (0.55 + 0.6 * lit);
    // Upper shell: deep at its foot and through its flanks, only its crown
    // and sun-side lumps catching the light.
    color += uColorRim * pow(lit, 3.0) * uRimGlow * (0.35 + 0.65 * r) * uShaderIntensity;
    // The core lighting up from inside as the pressure builds.
    color += uColorRim * uCharge * uChargeGlow * exp(-r * r * 10.0) * (0.6 + 0.4 * d0);
    // Sheet lightning: patches of the cloud lit from within for a frame.
    float flashPatch = smoothstep(0.35, 0.85, snoise(vec3(vDisc * 2.6, floor(uTime * 7.0) + uSeed)));
    color += uColorFlash * uFlash * flashPatch * (0.4 + 0.6 * d0);
    // Upper shell: deep at its foot and through its flanks, only its crown
    // catching the light.
    color *= mix(1.0, 0.3 + 0.6 * vUp, uShade);

    gl_FragColor = vec4(color * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** @param {boolean} [tower] the upper shell (heaped cumulus) rather than the belly */
export function createStormCloudMaterial(tower = false) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uRadius: { value: 5 },
      uHeight: { value: 7 },
      uSag: { value: 1.5 },
      uSagWidth: { value: 0.45 },
      uBillow: { value: 0.5 },
      uBillowScale: { value: 2.2 },
      uSpin: { value: 0 },
      uSeed: { value: 0 },
      uBoil: { value: 0.25 },
      uSwirl: { value: 3 },
      uArms: { value: 3 },
      uArmAmount: { value: 0.4 },
      uScale: { value: 2.6 },
      uCover: { value: 0.45 },
      uEdge: { value: 0.72 },
      uEdgeNoise: { value: 0.35 },
      uOpacity: { value: 0.9 },
      uForm: { value: 0 },
      uDissolve: { value: 0 },
      uDarkCore: { value: 0.5 },
      uRimGlow: { value: 1.4 },
      uCharge: { value: 0 },
      uChargeGlow: { value: 2 },
      uFlash: { value: 0 },
      uLightXZ: { value: new Vector2(1, 0) },
      uColorCore: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorFlash: { value: new Color() },
      uDome: { value: 0 },
      uShade: { value: 0 }
    }),
    vertexShader: CLOUD_VERTEX,
    fragmentShader: CLOUD_FRAGMENT
  });

  /** @param {object} state { centre, form, dissolve, spin, charge, flash, sag, lightXZ, seed } */
  material.userData.sync = (state) => {
    const c = settings.downburst;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uRadius.value = Math.max(0.2, c.zoneRadius * c.cloudRadius) * (0.45 + 0.55 * state.form);
    u.uHeight.value = c.cloudHeight;
    u.uSag.value = state.sag;
    u.uSagWidth.value = c.cloudSagWidth;
    u.uBillow.value = c.cloudBillow * g.noiseStrength;
    u.uBillowScale.value = c.cloudBillowScale * g.noiseFrequency;
    u.uSpin.value = state.spin;
    u.uSeed.value = state.seed;
    u.uBoil.value = c.cloudBoil * g.noiseSpeed;
    u.uSwirl.value = c.cloudSwirl * g.turbulence;
    u.uArms.value = Math.round(c.cloudArms);
    u.uArmAmount.value = c.cloudArmAmount;
    u.uScale.value = c.cloudScale * g.noiseFrequency;
    u.uCover.value = c.cloudCover;
    u.uEdge.value = c.cloudEdge;
    u.uEdgeNoise.value = c.cloudEdgeNoise * g.noiseStrength;
    u.uOpacity.value = c.cloudOpacity * g.opacity;
    u.uForm.value = state.form;
    u.uDissolve.value = state.dissolve;
    u.uDarkCore.value = c.cloudDarkCore;
    u.uRimGlow.value = c.cloudRimGlow * g.fresnel;
    u.uCharge.value = state.charge;
    u.uChargeGlow.value = c.cloudChargeGlow * g.glow;
    u.uFlash.value = state.flash * c.cloudFlash * g.glow;
    u.uLightXZ.value.copy(state.lightXZ);
    u.uColorCore.value.copy(getColor(c.colorCloudCore));
    u.uColorBody.value.copy(getColor(c.colorCloudBody));
    u.uColorRim.value.copy(getColor(c.colorCloudRim));
    u.uColorFlash.value.copy(getColor(c.colorCloudFlash));
    u.uDome.value = tower ? Math.max(0, c.cloudTower) * (0.35 + 0.65 * state.form) : 0;
    u.uShade.value = tower ? c.cloudTowerShade : 0;
    if (tower) u.uOpacity.value = c.cloudOpacity * c.cloudTowerOpacity * g.opacity;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The column, and the funnel — one tube, two profiles                  */
/* -------------------------------------------------------------------- */

/**
 * The column's radius at a height. Pinched up into the cloud, full through the
 * middle, and splayed at the foot where the air hits the floor and has nowhere
 * to go but out. `ColumnRadius` on the CPU is not needed — nothing else reads it.
 */
const COLUMN_PROFILE_GLSL = /* glsl */ `
  uniform float uRadius;
  uniform float uTop;
  uniform float uTopScale;
  uniform float uFlare;
  uniform float uFlareHeight;

  float columnRadius(float y) {
    float k = smoothstep(0.0, 1.0, (uTop - y) / max(uTop * 0.55, 0.1));
    float r = uRadius * mix(uTopScale, 1.0, k);
    return r * (1.0 + uFlare * exp(-max(y, 0.0) / max(uFlareHeight, 0.05)));
  }
`;

const COLUMN_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uBottom;      // where the falling front is, metres

  varying vec2  vTube;        // x: bearing 0..1, y: world height
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${COLUMN_PROFILE_GLSL}

  void main() {
    float y = mix(uBottom, uTop, uv.y);
    float r = columnRadius(y);
    float th = uv.x * 6.28318530718;
    vec3 dir = vec3(cos(th), 0.0, sin(th));
    vec3 world = uCentre + dir * r;
    world.y = y;
    // The flare tilts the wall outward at the foot: lean the normal with it.
    float slope = (columnRadius(y + 0.05) - r) / 0.05;
    vNormalW = normalize(dir - vec3(0.0, slope, 0.0));
    vViewDir = cameraPosition - world;
    vTube = vec2(uv.x, y);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const COLUMN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uBottom;
  uniform float uTop;
  uniform float uStreaks;
  uniform float uStreakSharp;
  uniform float uFlow;        // metres the streaks have fallen, integrated on the CPU
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uRim;
  uniform float uFront;
  uniform float uFrontWidth;
  uniform float uSoftFade;
  uniform float uFade;
  uniform float uLiftY;       // the column is let go of from below this height
  uniform vec3  uColor;
  uniform vec3  uColorHot;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  uniform float uBodyOpacity;
  uniform float uBodyLight;
  uniform vec3  uLightDir;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vTube;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float y = vTube.y;
    float th = vTube.x * 6.28318530718;
    // Seamless round the tube: sample on the bearing's circle, not the bearing.
    vec2 ring = vec2(cos(th), sin(th)) * uStreaks * 0.16;

    // Wind streaks falling: noise stretched hard along the height.
    float s1 = snoise(vec3(ring, (y + uFlow) * 0.28 + uSeed));
    float s2 = snoise(vec3(ring * 2.3 + 7.1, (y + uFlow * 1.35) * 0.55 + uSeed * 2.0));
    float lines = clamp(0.5 + 0.5 * (s1 * 0.65 + s2 * 0.35), 0.0, 1.0);
    lines = pow(lines, mix(1.0, 7.0, clamp(uStreakSharp, 0.0, 1.0)));

    // Walls bright, the middle clear: you look through a tube of moving air.
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float edgeOn = pow(1.0 - abs(dot(N, V)), 2.2);
    float rim = edgeOn * uRim;

    // The leading front: a hot band right at the bottom of what has fallen.
    float front = exp(-max(y - uBottom, 0.0) / max(uFrontWidth, 0.02)) * uFront;

    // Blend up into the cloud rather than ending at it.
    float top = 1.0 - smoothstep(uTop - 1.6, uTop, y);

    // Let go of from below through a ragged edge.
    float n = snoise(vec3(ring * 0.6, y * 0.9 + uSeed * 3.0));
    float keep = smoothstep(uLiftY, uLiftY + 0.9, y + n * 0.6);

    // The body: dark falling air, denser at the walls, banded by the streaks,
    // the sun-side a shade lighter. This is what the eye reads as the column.
    float sun = clamp(dot(N, normalize(uLightDir)) * 0.5 + 0.5, 0.0, 1.0);
    float shade = mix(0.5, sun, uBodyLight);
    vec3 body = mix(uColorDeep, uColorBody, 0.25 + 0.75 * shade * (0.45 + 0.55 * lines));
    float density = clamp((0.6 + 0.4 * lines) * (0.75 + 0.25 * edgeOn) * uBodyOpacity, 0.0, 1.0);

    // Light only where it belongs: streak crests, edge-on walls, the front.
    float crest = pow(lines, 1.6);
    float energy = crest * (0.25 + rim) * uOpacity * uShaderIntensity;
    vec3 light = uColor * energy * uGlow + uColorHot * (front * (0.6 + 0.4 * lines) + crest * rim * 0.3);

    // The splayed foot is seen face-on from above and stacks up its own
    // layers: thin it, so the column reads as air hitting the floor, not a disc.
    float foot = mix(0.22, 1.0, smoothstep(0.0, 1.4, y));
    float mask = top * keep * foot * uFade;
    if (mask < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (mask < 0.004) discard;

    // Premultiplied: the body occludes, the light adds.
    float a = clamp(density + front * 0.15, 0.0, 1.0) * mask;
    gl_FragColor = vec4((body * density + light * uGlobalGlow) * mask, a);
  }
`;

export function createWindColumnMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uRadius: { value: 3 },
      uTop: { value: 7 },
      uBottom: { value: 7 },
      uTopScale: { value: 0.6 },
      uFlare: { value: 0.9 },
      uFlareHeight: { value: 1.1 },
      uSeed: { value: 0 },
      uStreaks: { value: 26 },
      uStreakSharp: { value: 0.7 },
      uFlow: { value: 0 },
      uOpacity: { value: 0.55 },
      uGlow: { value: 2.4 },
      uRim: { value: 1.6 },
      uFront: { value: 3.5 },
      uFrontWidth: { value: 0.8 },
      uSoftFade: { value: 0.6 },
      uFade: { value: 1 },
      uLiftY: { value: -10 },
      uColor: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() },
      uBodyOpacity: { value: 0.7 },
      uBodyLight: { value: 0.5 }
    }),
    vertexShader: COLUMN_VERTEX,
    fragmentShader: COLUMN_FRAGMENT
  });

  /** @param {object} state { centre, bottom, flow, fade, liftY, seed } */
  material.userData.sync = (state) => {
    const c = settings.downburst;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uRadius.value = Math.max(0.1, c.zoneRadius * c.columnRadius);
    u.uTop.value = c.cloudHeight;
    u.uBottom.value = state.bottom;
    u.uTopScale.value = c.columnTopScale;
    u.uFlare.value = c.columnFlare;
    u.uFlareHeight.value = c.columnFlareHeight;
    u.uSeed.value = state.seed;
    u.uStreaks.value = c.columnStreaks * g.noiseFrequency;
    u.uStreakSharp.value = c.columnStreakSharp;
    u.uFlow.value = state.flow;
    u.uOpacity.value = c.columnOpacity * g.opacity;
    u.uGlow.value = c.columnGlow * g.glow;
    u.uRim.value = c.columnRim * g.fresnel;
    u.uFront.value = c.columnFront * g.glow * (state.front ?? 1);
    u.uFrontWidth.value = c.columnFrontWidth;
    u.uSoftFade.value = c.columnSoftFade;
    u.uFade.value = state.fade;
    u.uLiftY.value = state.liftY;
    u.uColor.value.copy(getColor(c.colorColumn));
    u.uColorHot.value.copy(getColor(c.colorColumnHot));
    u.uColorBody.value.copy(getColor(c.colorColumnBody));
    u.uColorDeep.value.copy(getColor(c.colorColumnDeep));
    u.uBodyOpacity.value = c.columnBodyOpacity * g.opacity;
    u.uBodyLight.value = c.columnBodyLight;
  };

  return material;
}

const FUNNEL_VERTEX = /* glsl */ `
  uniform vec3 uCentre;

  varying vec3 vWorld;
  varying float vV;

  ${COLUMN_PROFILE_GLSL}

  void main() {
    // The funnel spans the whole drop, floor to cloud; the fragment stage
    // decides how much of it the pressure has reached.
    float y = uv.y * uTop;
    float r = columnRadius(y);
    float th = uv.x * 6.28318530718;
    vec3 world = uCentre + vec3(cos(th), 0.0, sin(th)) * r;
    world.y = y;
    vWorld = world;
    vV = uv.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FUNNEL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uCentre;
  uniform float uTop;
  uniform float uReach;       // 0..1, how far down out of the cloud it has got
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uTwist;
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying vec3 vWorld;
  varying float vV;

  ${noiseGLSL}

  void main() {
    float y = vWorld.y;
    float reachY = mix(uTop, 0.0, clamp(uReach, 0.0, 1.0));
    float feather = smoothstep(reachY, reachY + 1.4, y) * (1.0 - smoothstep(uTop - 0.6, uTop + 0.2, y));
    if (feather < 0.002) discard;

    // Twisted by height and spun by time: the churn is a spiral, not a boil.
    vec2 xz = rot2(y * uTwist + uTime * uSpeed * 0.35) * (vWorld.xz - uCentre.xz);
    vec3 np = vec3(xz * uScale, y * uScale * 0.4 + uTime * uSpeed + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(19.3, 7.7, 31.1)));

    float strength = uStrength * uShaderIntensity * feather;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(n * 0.5 + 0.5, strength, feather);
  }
`;

/** The pressure gathering: a churning, twisting lens reaching down out of the cloud. */
export function createPressureFunnelMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uRadius: { value: 2 },
      uTop: { value: 7 },
      uTopScale: { value: 0.6 },
      uFlare: { value: 0 },
      uFlareHeight: { value: 1 },
      uReach: { value: 0 },
      uStrength: { value: 1 },
      uScale: { value: 1.6 },
      uSpeed: { value: 3 },
      uTwist: { value: 2.2 },
      uSeed: { value: 0 }
    }),
    vertexShader: FUNNEL_VERTEX,
    fragmentShader: FUNNEL_FRAGMENT
  });

  /** @param {object} state { centre, reach, strength, seed } */
  material.userData.sync = (state) => {
    const c = settings.downburst;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uRadius.value = Math.max(0.1, c.zoneRadius * c.funnelRadius);
    u.uTop.value = c.cloudHeight;
    u.uTopScale.value = c.columnTopScale;
    u.uFlare.value = c.columnFlare * 0.5;
    u.uFlareHeight.value = c.columnFlareHeight;
    u.uReach.value = state.reach;
    u.uStrength.value = state.strength * c.funnelStrength * g.distortion;
    u.uScale.value = c.funnelScale * g.noiseFrequency;
    u.uSpeed.value = c.funnelSpeed * g.noiseSpeed;
    u.uTwist.value = c.funnelTwist * g.turbulence;
    u.uSeed.value = state.seed;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The floor                                                            */
/* -------------------------------------------------------------------- */

const GROUND_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;      // half-size of the quad, metres
  uniform float uLift;

  varying vec2 vXZ;           // metres from the centre

  void main() {
    vec2 xz = position.xz * uExtent;
    vXZ = xz;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + xz.x, uLift, uCentre.z + xz.y, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uZone;          // the circle, metres
  uniform float uWarn;          // 0..1 the telegraph while the cloud gathers
  uniform float uWarnGlow;
  uniform float uWave;          // metres the shock ring has run
  uniform float uRingWidth;
  uniform float uRingGlow;
  uniform float uRingLevel;     // 0..1, dims as the ring runs out
  uniform float uScour;         // 0..1 how much of the scour is laid down
  uniform float uScourStreaks;
  uniform float uScourOpacity;
  uniform float uScourContrast;
  uniform float uImprint;       // 0..1 the pressed patch in the middle
  uniform float uImprintRadius;
  uniform float uImprintOpacity;
  uniform float uErode;         // 0..1 through the fade
  uniform float uErodeNoise;
  uniform float uOpacity;
  uniform vec3  uColorRing;
  uniform vec3  uColorScour;
  uniform vec3  uColorScourLit;
  uniform float uScourRidge;
  uniform float uRingShadow;
  uniform vec3  uColorImprint;
  uniform vec3  uColorWarn;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vXZ;

  ${noiseGLSL}

  void main() {
    float r = length(vXZ);
    vec2 dir = vXZ / max(r, 1e-4);
    // Ragged everything: a ring of air is not a compass circle.
    float rag = snoise(vec3(dir * 2.2, uSeed)) * 0.25 + snoise(vec3(dir * 6.0, uSeed + 3.0)) * 0.1;

    vec3 col = vec3(0.0);
    float a = 0.0;

    // 1 · telegraph: the circle's edge darkens and breathes, the dust inside
    // turns in toward the middle.
    if (uWarn > 0.0) {
      float dr = (r - uZone * (1.0 + rag * 0.15)) / 0.22;
      float ring = exp(-dr * dr);
      float inside = 1.0 - smoothstep(uZone * 0.7, uZone * 1.05, r);
      vec2 sw = rot2(-uTime * 0.9 + r * 0.9) * dir;
      float curls = smoothstep(0.1, 0.9, snoise(vec3(sw * 3.0, r * 0.6 + uSeed)));
      float pulse = 0.75 + 0.25 * sin(uTime * 9.0);
      col += uColorWarn * (ring * pulse + curls * inside * 0.35) * uWarnGlow * uWarn * uGlobalGlow;
      a = max(a, (ring * 0.6 + inside * 0.25 + curls * inside * 0.25) * uWarn);
    }

    // 2 · the pressed imprint: dark, with faint concentric ripples in it.
    float imp = (1.0 - smoothstep(uImprintRadius * 0.6, uImprintRadius, r + rag * 0.6)) * uImprint;
    float ripple = 0.75 + 0.25 * sin(r * 9.0 - rag * 4.0);
    col = mix(col, uColorImprint * ripple, clamp(imp * uImprintOpacity, 0.0, 1.0));
    a = max(a, imp * uImprintOpacity);

    // 3 · the scour: dust combed outward into radial streaks behind the ring.
    float behind = 1.0 - smoothstep(uWave - 0.4, uWave + 0.1, r + rag * 0.4);
    float streak = snoise(vec3(dir * uScourStreaks * 0.16, r * 0.25 + uSeed));
    float fine = snoise(vec3(dir * uScourStreaks * 0.5, r * 0.6 - uSeed));
    float comb = clamp(0.5 + 0.5 * (streak * 0.7 + fine * 0.3) * uScourContrast, 0.0, 1.0);
    float scour = behind * uScour * smoothstep(0.2, 1.0, r) * (0.35 + 0.65 * comb);
    // Deep troughs, pale combed ridges: the floor carries the dark mass, the
    // ridges catch the light.
    vec3 scourCol = mix(uColorScour, uColorScourLit, smoothstep(0.55, 0.95, comb) * uScourRidge);
    col = mix(col, scourCol, clamp(scour * uScourOpacity * 1.4, 0.0, 1.0));
    a = max(a, scour * uScourOpacity);

    // 4 · the shock ring, with a short bright trail behind it.
    float wr = uWave * (1.0 + rag * 0.06);
    float d = (r - wr) / max(uRingWidth, 0.01);
    // A dark trough dragged just behind the front, so the bright edge sits on
    // the deep tone rather than on bare floor.
    float dt_ = (r - (wr - uRingWidth * 2.2)) / max(uRingWidth * 1.6, 0.02);
    float trough = exp(-dt_ * dt_) * uRingLevel * uRingShadow;
    col = mix(col, uColorImprint, clamp(trough, 0.0, 1.0));
    a = max(a, trough * 0.9);
    float ring = exp(-d * d) + (r < wr ? exp((r - wr) / max(uRingWidth * 3.0, 0.02)) * 0.2 : 0.0);
    ring *= uRingLevel * (0.65 + 0.35 * comb);
    col += uColorRing * ring * uRingGlow * uShaderIntensity * uGlobalGlow;
    a = max(a, ring * 0.9);

    // Erodes away raggedly as the dust settles.
    float n = snoise(vec3(vXZ * 0.8, uSeed * 7.0)) * 0.5 + 0.5;
    float thr = uErode * 1.2 - 0.1;
    float vis = uErode <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.15, mix(0.5, n, uErodeNoise));

    a *= vis * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createGroundBlastMaterial() {
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
      uExtent: { value: 10 },
      uLift: { value: 0.014 },
      uSeed: { value: 0 },
      uZone: { value: 4 },
      uWarn: { value: 0 },
      uWarnGlow: { value: 1 },
      uWave: { value: 0 },
      uRingWidth: { value: 0.35 },
      uRingGlow: { value: 3 },
      uRingLevel: { value: 0 },
      uScour: { value: 0 },
      uScourStreaks: { value: 70 },
      uScourOpacity: { value: 0.45 },
      uScourContrast: { value: 1.4 },
      uImprint: { value: 0 },
      uImprintRadius: { value: 2 },
      uImprintOpacity: { value: 0.5 },
      uErode: { value: 0 },
      uErodeNoise: { value: 0.7 },
      uOpacity: { value: 1 },
      uColorRing: { value: new Color() },
      uColorScour: { value: new Color() },
      uColorScourLit: { value: new Color() },
      uScourRidge: { value: 0.5 },
      uRingShadow: { value: 0.8 },
      uColorImprint: { value: new Color() },
      uColorWarn: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT
  });

  /** @param {object} state { centre, extent, warn, wave, ringLevel, scour, imprint, erode, seed } */
  material.userData.sync = (state) => {
    const c = settings.downburst;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uExtent.value = state.extent;
    u.uSeed.value = state.seed;
    u.uZone.value = c.zoneRadius;
    u.uWarn.value = state.warn;
    u.uWarnGlow.value = c.warnGlow * g.glow;
    u.uWave.value = state.wave;
    u.uRingWidth.value = c.ringWidth;
    u.uRingGlow.value = c.ringGlow * g.glow;
    u.uRingLevel.value = state.ringLevel;
    u.uScour.value = state.scour;
    u.uScourStreaks.value = c.scourStreaks * g.noiseFrequency;
    u.uScourOpacity.value = c.scourOpacity;
    u.uScourContrast.value = c.scourContrast * g.noiseStrength;
    u.uImprint.value = state.imprint;
    u.uImprintRadius.value = Math.max(0.1, c.zoneRadius * c.pressCore);
    u.uImprintOpacity.value = c.imprintOpacity;
    u.uErode.value = state.erode;
    u.uErodeNoise.value = c.groundErode;
    u.uOpacity.value = g.opacity;
    u.uColorRing.value.copy(getColor(c.colorRing));
    u.uColorScour.value.copy(getColor(c.colorScour));
    u.uColorScourLit.value.copy(getColor(c.colorScourLit));
    u.uScourRidge.value = c.scourRidge * g.shaderIntensity;
    u.uRingShadow.value = c.ringShadow;
    u.uColorImprint.value.copy(getColor(c.colorImprint));
    u.uColorWarn.value.copy(getColor(c.colorWarn));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The rolling dust torus                                               */
/* -------------------------------------------------------------------- */

const TORUS_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uMajor;       // metres from the centre to the tube's axis
  uniform float uTube;        // metres, the tube's radius
  uniform float uSquash;      // vertical squash of the cross-section
  uniform float uRoll;        // radians the tube has rolled
  uniform float uBillow;
  uniform float uScale;
  uniform float uSeed;

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  varying float vY;

  ${noiseGLSL}

  void main() {
    float th = uv.x * 6.28318530718;
    float ph = uv.y * 6.28318530718;
    vec2 dir = vec2(cos(th), sin(th));
    // Rolling: the bumps are advected round the tube, outward over the top.
    float pr = ph - uRoll;
    float bump = snoise(vec3(dir * uScale + vec2(cos(pr), sin(pr)) * 0.7, uSeed));
    float rr = uTube * (1.0 + uBillow * bump);
    float out_ = cos(ph) * rr;
    float up = sin(ph) * rr * uSquash;
    // Half sunk into the floor: the axis rides at a third of the height.
    vec3 world = uCentre + vec3(dir.x, 0.0, dir.y) * (uMajor + out_);
    world.y = up + uTube * uSquash * 0.35;
    vNormalW = normalize(vec3(dir.x * cos(ph), sin(ph) / max(uSquash, 0.05), dir.y * cos(ph)));
    vViewDir = cameraPosition - world;
    vUv = uv;
    vY = world.y;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const TORUS_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uRoll;
  uniform float uDetail;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uSoftFade;
  uniform float uLightAmount;
  uniform float uThin;        // how much it thins with age, 0..1
  uniform vec3  uColorLit;
  uniform vec3  uColorShade;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform vec3      uLightDir;
  uniform float     uShaderIntensity;

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;
  varying float vY;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    if (vY < 0.0) discard;
    float th = vUv.x * 6.28318530718;
    float pr = vUv.y * 6.28318530718 - uRoll;
    vec2 dir = vec2(cos(th), sin(th));
    vec3 p = vec3(dir * uDetail + vec2(cos(pr), sin(pr)) * 1.1, uSeed + uTime * 0.15);
    float dens = fbm3(p) * 0.5 + 0.5;
    dens = smoothstep(0.2 + uThin * 0.45, 0.85, dens + 0.15 * uShaderIntensity);

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    if (!gl_FrontFacing) N = -N;
    float lit = clamp(dot(N, normalize(uLightDir)) * 0.5 + 0.5, 0.0, 1.0);
    lit = mix(1.0, lit, uLightAmount);
    // A volume, not a shell: thin at the silhouette, dense face-on.
    float body = smoothstep(0.0, 0.55, abs(dot(N, V)));

    vec3 color = mix(uColorShade, uColorLit, lit * (0.7 + 0.3 * dens));
    float alpha = dens * body * uOpacity * uFade;
    if (alpha < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export function createDustTorusMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uMajor: { value: 1 },
      uTube: { value: 0.5 },
      uSquash: { value: 0.6 },
      uRoll: { value: 0 },
      uBillow: { value: 0.35 },
      uScale: { value: 2.4 },
      uSeed: { value: 0 },
      uDetail: { value: 3 },
      uOpacity: { value: 0.7 },
      uFade: { value: 0 },
      uSoftFade: { value: 0.5 },
      uLightAmount: { value: 0.8 },
      uThin: { value: 0 },
      uColorLit: { value: new Color() },
      uColorShade: { value: new Color() }
    }),
    vertexShader: TORUS_VERTEX,
    fragmentShader: TORUS_FRAGMENT
  });

  /** @param {object} state { centre, major, tube, roll, fade, thin, seed } */
  material.userData.sync = (state) => {
    const c = settings.downburst;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uMajor.value = state.major;
    u.uTube.value = state.tube;
    u.uSquash.value = c.torusSquash;
    u.uRoll.value = state.roll;
    u.uBillow.value = c.torusBillow * g.noiseStrength;
    u.uScale.value = c.torusScale * g.noiseFrequency;
    u.uSeed.value = state.seed;
    u.uDetail.value = c.torusDetail * g.noiseFrequency;
    u.uOpacity.value = c.torusOpacity * g.opacity;
    u.uFade.value = state.fade;
    u.uSoftFade.value = c.torusSoftFade;
    u.uLightAmount.value = c.torusLight;
    u.uThin.value = state.thin;
    u.uColorLit.value.copy(getColor(c.colorTorusLit));
    u.uColorShade.value.copy(getColor(c.colorTorusShade));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The shock lens                                                       */
/* -------------------------------------------------------------------- */

const LENS_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;

  varying vec2 vXZ;
  varying vec2 vRadialScreen;

  void main() {
    vec2 xz = position.xz * uExtent;
    vXZ = xz;
    vec2 d = normalize(xz + vec2(1e-4, 0.0));
    // The radial direction, turned into the screen — which way to bend.
    vRadialScreen = (viewMatrix * vec4(d.x, 0.0, d.y, 0.0)).xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + xz.x, 0.05, uCentre.z + xz.y, 1.0);
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uWave;
  uniform float uWidth;
  uniform float uStrength;
  uniform float uShaderIntensity;

  varying vec2 vXZ;
  varying vec2 vRadialScreen;

  void main() {
    float r = length(vXZ);
    float d = (r - uWave) / max(uWidth, 0.02);
    float bump = exp(-d * d);
    // The bump's slope bends the image: out ahead of the crest, in behind it.
    float slope = clamp(-2.0 * d * bump, -1.0, 1.0);
    vec2 dir = normalize(vRadialScreen + 1e-5);
    float strength = uStrength * uShaderIntensity * bump;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * slope * 0.5 + 0.5, strength, bump);
  }
`;

export function createShockLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uExtent: { value: 10 },
      uWave: { value: 0 },
      uWidth: { value: 0.8 },
      uStrength: { value: 0 }
    }),
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} state { centre, extent, wave, strength } */
  material.userData.sync = (state) => {
    const c = settings.downburst;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uExtent.value = state.extent;
    u.uWave.value = state.wave;
    u.uWidth.value = c.lensWidth;
    u.uStrength.value = state.strength * c.lensStrength * g.distortion;
  };

  return material;
}
