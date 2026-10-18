import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Hemorrhage Ring — the bespoke shaders the ring is drawn with.
 *
 *  - **the race** — a tube laid along an arc of the rim in the vertex stage,
 *    from a trailing end to a swollen racing head: blood running round the
 *    circle in a low, flattened rope, its streaks rushing toward the head, a
 *    hot glow in the head and the streak crests, wet specular, red rim. As it
 *    laps, the arc grows until it closes into a complete spinning ring.
 *  - **the wall** — a band round the circle in parameter space: the ring
 *    stands up into a spinning wall of blood, its crest torn and foaming pale,
 *    horizontal streaks racing round it; then it *falls inward* — the radius
 *    collapses toward the centre, the crest leans in like a breaking wave and
 *    climbs as the circle narrows, and the sheet tears apart as it meets
 *    itself in the middle.
 *  - **the channel** — a ground quad: a groove cut round the rim that fills
 *    with racing blood behind the head, then, as the wall falls in, radial drag
 *    marks smeared from the rim toward the centre and a splat where it met;
 *    all of it dries and erodes.
 *  - **the head glow** — a camera-facing bloom on the racing head.
 *  - **the implosion warp** — a flat ring on `LAYER.DISTORTION` that runs
 *    *inward* with the wall.
 *
 * Every material reads `settings.hemorrhage` in `userData.sync(state)`.
 */

const ID = 'hemorrhage';

/* -------------------------------------------------------------------- */
/* The race                                                             */
/* -------------------------------------------------------------------- */

const RACE_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uR;
  uniform float uTheta0;      // trailing end, radians
  uniform float uTheta1;      // racing head, radians
  uniform float uTubeR;
  uniform float uSquash;      // vertical flattening
  uniform float uLift;
  uniform float uHeadBulb;
  uniform float uWobble;
  uniform float uFlow;
  uniform float uSeed;

  varying float vS;
  varying float vAng;
  varying float vD;           // metres along the arc
  varying vec3  vNormalW;
  varying vec3  vWorld;

  ${noiseGLSL}

  void main() {
    float s = position.x;
    float ang = position.y * 6.2831853;
    float th = mix(uTheta0, uTheta1, s);
    float dirSign = sign(uTheta1 - uTheta0 + 1e-6);
    vec3 radial = vec3(cos(th), 0.0, sin(th));
    vec3 T = vec3(-sin(th), 0.0, cos(th)) * dirSign;
    vec3 up = vec3(0.0, 1.0, 0.0);
    float span = abs(uTheta1 - uTheta0) * uR;
    float d = s * span;
    float tail = smoothstep(0.0, min(0.25, 1.5 / max(span, 0.1)), s);
    float head = exp(-pow((1.0 - s) * span / 0.35, 2.0));
    float wob = snoise(vec3(d * 1.2 - uFlow * 0.5, cos(ang), sin(ang) + uSeed));
    float r = uTubeR * (0.35 + 0.65 * tail) * (1.0 + uHeadBulb * head) * (1.0 + uWobble * wob);
    r *= 1.0 - smoothstep(0.985, 1.0, s) * 0.85;
    vec3 c = uCenter + radial * uR + up * (uLift + r * uSquash);
    vec3 offs = radial * cos(ang) * r + up * sin(ang) * r * uSquash;
    vec3 world = c + offs;
    world.y = max(world.y, 0.01);
    vS = s;
    vAng = ang;
    vD = d;
    vNormalW = normalize(radial * cos(ang) + up * sin(ang) / max(uSquash, 0.2));
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RACE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uFlow;
  uniform float uSeed;
  uniform float uStreakScale;
  uniform float uGlow;
  uniform float uHeadGlow;
  uniform float uGloss;
  uniform float uRim;
  uniform float uTheta0;
  uniform float uTheta1;
  uniform float uR;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorHot;
  uniform vec3  uColorRim;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying float vS;
  varying float vAng;
  varying float vD;
  varying vec3  vNormalW;
  varying vec3  vWorld;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float diff = max(dot(N, L), 0.0) * 0.6 + 0.4;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 80.0) * uGloss;
    float fres = pow(1.0 - abs(dot(N, V)), 3.0) * uRim;

    float span = abs(uTheta1 - uTheta0) * uR;
    // Streaks rushing toward the head.
    float st = fbm3(vec3(vD * uStreakScale - uFlow, cos(vAng) * 1.5, sin(vAng) * 1.5 + uSeed));
    float crest = smoothstep(0.1, 0.6, st);
    float head = exp(-pow((span - vD) / 0.6, 2.0));

    vec3 col = mix(uColorDeep, uColorBody, diff * (0.5 + 0.5 * crest));
    col += uColorHot * (crest * uGlow + head * uHeadGlow) * uGlobalGlow * uShaderIntensity;
    col += uColorRim * fres * uGlobalGlow + vec3(spec);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The blood racing round the rim. Opaque and lit. */
export function createRaceMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uR: { value: 4 },
      uTheta0: { value: 0 },
      uTheta1: { value: 1 },
      uTubeR: { value: 0.2 },
      uSquash: { value: 0.6 },
      uLift: { value: 0 },
      uHeadBulb: { value: 1 },
      uWobble: { value: 0.2 },
      uFlow: { value: 0 },
      uSeed: { value: 0 },
      uStreakScale: { value: 1.5 },
      uGlow: { value: 1.5 },
      uHeadGlow: { value: 3 },
      uGloss: { value: 1.2 },
      uRim: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: RACE_VERTEX,
    fragmentShader: RACE_FRAGMENT
  });

  /** @param {object} state { center, radius, theta0, theta1, flow, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uR.value = state.radius;
    u.uTheta0.value = state.theta0;
    u.uTheta1.value = state.theta1;
    u.uTubeR.value = Math.max(0.01, c.raceThickness);
    u.uSquash.value = c.raceSquash;
    u.uLift.value = c.raceLift;
    u.uHeadBulb.value = c.headBulb;
    u.uWobble.value = c.raceWobble * g.noiseStrength;
    u.uFlow.value = state.flow;
    u.uSeed.value = state.seed;
    u.uStreakScale.value = c.streakScale * g.noiseFrequency;
    u.uGlow.value = c.raceGlow * g.glow;
    u.uHeadGlow.value = c.headGlow * g.glow;
    u.uGloss.value = c.gloss;
    u.uRim.value = c.rimGlow * g.fresnel;
    u.uColorDeep.value.copy(getColor(c.colorBloodDeep));
    u.uColorBody.value.copy(getColor(c.colorBloodBody));
    u.uColorHot.value.copy(getColor(c.colorBloodHot));
    u.uColorRim.value.copy(getColor(c.colorBloodRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The wall                                                             */
/* -------------------------------------------------------------------- */

const WALL_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uR;           // radius of the wall's foot right now
  uniform float uH;           // height of the crest right now
  uniform float uLean;        // metres the crest leans inward
  uniform float uCrest;       // how torn the crest is
  uniform float uSpin;        // integrated spin, radians
  uniform float uSeed;

  varying vec2  vG;           // x: bearing 0..1, y: 0 floor .. 1 crest
  varying vec3  vNormalW;
  varying vec3  vWorld;

  ${noiseGLSL}

  vec3 wallPoint(float x, float y) {
    float a = x * 6.2831853;
    float torn = snoise(vec3(cos(a + uSpin * 0.3) * 2.5, sin(a + uSpin * 0.3) * 2.5, uSeed)) * 0.5 + 0.5;
    float h = y * uH * (1.0 + uCrest * (torn - 0.5) * y);
    float r = max(uR - uLean * y * y, 0.02);
    return uCenter + vec3(cos(a) * r, h, sin(a) * r);
  }

  void main() {
    float x = position.x;
    float y = position.y;
    vec3 p = wallPoint(x, y);
    vec3 dx = wallPoint(x + 0.004, y) - wallPoint(x - 0.004, y);
    vec3 dy = wallPoint(x, min(y + 0.02, 1.0)) - wallPoint(x, max(y - 0.02, 0.0));
    vNormalW = normalize(cross(dx, dy) + vec3(0.0, 1e-5, 0.0));
    vG = vec2(x, y);
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const WALL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uSpin;
  uniform float uSeed;
  uniform float uStreakScale;
  uniform float uGlow;
  uniform float uFoam;
  uniform float uGloss;
  uniform float uOpacity;
  uniform float uBreak;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorHot;
  uniform vec3  uColorFoam;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2  vG;
  varying vec3  vNormalW;
  varying vec3  vWorld;

  ${noiseGLSL}

  void main() {
    float a = vG.x * 6.2831853;
    // Streaks racing round the circle, the spin is in the coordinate.
    vec3 sp = vec3(cos(a) * uStreakScale, sin(a) * uStreakScale, vG.y * 3.0);
    float ca = cos(-uSpin);
    float sa = sin(-uSpin);
    sp.xy = mat2(ca, -sa, sa, ca) * sp.xy;
    float st = fbm3(sp + uSeed);
    float fine = snoise(sp * vec3(2.5, 2.5, 1.0) + vec3(0.0, 0.0, uSeed));
    float s = st * 0.7 + fine * 0.3;

    // Torn apart as it meets itself.
    float hole = snoise(vec3(sp.xy * 0.8, vG.y * 4.0 + uSeed * 2.0)) * 0.5 + 0.5;
    if (hole < uBreak * 1.1 - 0.05 + vG.y * uBreak * 0.3) discard;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float diff = max(dot(N, L), 0.0) * 0.6 + 0.4;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 60.0) * uGloss;
    float fres = pow(1.0 - abs(dot(N, V)), 2.5);

    float foam = smoothstep(0.7, 1.0, vG.y + s * 0.2) * uFoam;
    vec3 col = mix(uColorDeep, uColorBody, diff * (0.55 + 0.45 * s));
    col += uColorHot * smoothstep(0.15, 0.6, s) * uGlow * uGlobalGlow * uShaderIntensity * (0.4 + 0.6 * fres);
    col = mix(col, uColorFoam * uGlobalGlow, foam * (0.5 + 0.5 * s));
    col += vec3(spec);

    float alpha = (0.75 + 0.25 * s + fres * 0.3) * uOpacity;
    alpha *= 1.0 - smoothstep(0.92, 1.0, vG.y);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The spinning wall the ring stands up into, and that falls inward. */
export function createWallMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uR: { value: 4 },
      uH: { value: 0 },
      uLean: { value: 0 },
      uCrest: { value: 0.5 },
      uSpin: { value: 0 },
      uSeed: { value: 0 },
      uStreakScale: { value: 3 },
      uGlow: { value: 1.5 },
      uFoam: { value: 1 },
      uGloss: { value: 1 },
      uOpacity: { value: 1 },
      uBreak: { value: 0 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorFoam: { value: new Color() }
    }),
    vertexShader: WALL_VERTEX,
    fragmentShader: WALL_FRAGMENT
  });

  /** @param {object} state { center, radius, height, lean, spin, break, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uR.value = Math.max(0.02, state.radius);
    u.uH.value = Math.max(0.001, state.height);
    u.uLean.value = state.lean;
    u.uCrest.value = c.crestTear * g.noiseStrength;
    u.uSpin.value = state.spin;
    u.uSeed.value = state.seed;
    u.uStreakScale.value = c.wallStreakScale * g.noiseFrequency;
    u.uGlow.value = c.wallGlow * g.glow;
    u.uFoam.value = c.crestFoam;
    u.uGloss.value = c.gloss;
    u.uOpacity.value = c.wallOpacity * g.opacity;
    u.uBreak.value = state.break;
    u.uColorDeep.value.copy(getColor(c.colorBloodDeep));
    u.uColorBody.value.copy(getColor(c.colorBloodBody));
    u.uColorHot.value.copy(getColor(c.colorBloodHot));
    u.uColorFoam.value.copy(getColor(c.colorFoam));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The channel                                                          */
/* -------------------------------------------------------------------- */

const FLAT_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    vP = position.xy * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const CHANNEL_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uR;
  uniform float uGroove;      // half-width of the groove, metres
  uniform float uTheta0;
  uniform float uTheta1;
  uniform float uFlow;
  uniform float uCut;         // 0..1 the groove being cut (follows the head)
  uniform float uDrag;        // radius the drag marks have been smeared in to (−1 none)
  uniform float uDragCount;
  uniform float uSplat;       // radius of the splat in the middle (0 none)
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uDry;
  uniform float uFadeT;
  uniform vec3  uColorCut;
  uniform vec3  uColorBlood;
  uniform vec3  uColorHot;
  uniform vec3  uColorDry;
  uniform float uGlobalGlow;
  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    float a = atan(vP.y, vP.x);
    vec2 ca = vec2(cos(a), sin(a));

    // How far behind the head this bearing is, in radians (huge if never reached).
    float dirSign = sign(uTheta1 - uTheta0 + 1e-6);
    float span = abs(uTheta1 - uTheta0);
    float d = mod((a - uTheta0) * dirSign, 6.2831853);
    float reached = span >= 6.2831853 ? 1.0 : step(d, span);
    float behindHead = span >= 6.2831853 ? 0.0 : span - d;

    // The groove round the rim.
    float wob = snoise(vec3(ca * 3.0, uSeed)) * uGroove * 0.4;
    float gd = abs(r - uR - wob);
    float groove = (1.0 - smoothstep(uGroove * 0.6, uGroove, gd)) * reached;
    float lip = (1.0 - smoothstep(uGroove, uGroove * 2.4, gd)) * reached * 0.6;
    float streak = fbm3(vec3(ca * 4.0 + vec2(uFlow * 0.1), r * 3.0 + uSeed));
    float hot = exp(-behindHead * 2.0) * reached;

    // Drag marks, smeared in toward the centre as the wall falls.
    float drags = 0.0;
    if (uDrag >= 0.0) {
      float fa = a / 6.2831853 * uDragCount + snoise(vec3(r * 0.6, uSeed, 1.0)) * 0.25;
      float gap = abs(fract(fa) - 0.5) * 6.2831853 * max(r, 0.05) / max(uDragCount, 1.0);
      float w = 0.18 * (0.4 + 0.6 * r / max(uR, 0.1));
      drags = (1.0 - smoothstep(w * 0.4, w, gap)) * step(uDrag, r) * step(r, uR + uGroove);
    }
    // The splat where the wall met itself.
    float sn = snoise(vec3(ca * 2.5, uSeed + 7.0)) * 0.35 + fbm3(vec3(vP * 2.0, uSeed)) * 0.15;
    float splat = uSplat <= 0.0 ? 0.0 : 1.0 - smoothstep(uSplat * (0.85 + sn) - 0.1, uSplat * (0.85 + sn), r);

    float blood = max(max(groove, drags * 0.9), splat);
    vec3 col = mix(uColorCut, uColorBlood * (0.7 + 0.5 * streak), blood);
    col += uColorHot * (hot * groove * 2.0 + streak * groove * 0.4) * uGlow * uGlobalGlow * (1.0 - uDry);
    col += uColorHot * splat * 0.3 * uGlow * uGlobalGlow * (1.0 - uDry);
    col = mix(col, uColorDry, uDry * blood);

    float alpha = max(blood, lip * uCut);
    float n = snoise(vec3(vP * 1.4, uSeed * 4.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, n);
    alpha *= vis * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The groove, the drag marks and the splat. Normal blending — blood is dark. */
export function createChannelMaterial() {
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
      uSize: { value: 6 },
      uSeed: { value: 0 },
      uR: { value: 4 },
      uGroove: { value: 0.25 },
      uTheta0: { value: 0 },
      uTheta1: { value: 0 },
      uFlow: { value: 0 },
      uCut: { value: 1 },
      uDrag: { value: -1 },
      uDragCount: { value: 18 },
      uSplat: { value: 0 },
      uGlow: { value: 2 },
      uOpacity: { value: 1 },
      uDry: { value: 0 },
      uFadeT: { value: 0 },
      uColorCut: { value: new Color() },
      uColorBlood: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorDry: { value: new Color() }
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: CHANNEL_FRAGMENT
  });

  /** @param {object} state { center, radius, theta0, theta1, flow, drag, splat, dry, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.5, state.radius + c.grooveWidth * 3 + 0.5);
    u.uSeed.value = state.seed;
    u.uR.value = state.radius;
    u.uGroove.value = Math.max(0.02, c.grooveWidth);
    u.uTheta0.value = state.theta0;
    u.uTheta1.value = state.theta1;
    u.uFlow.value = state.flow;
    u.uCut.value = 1;
    u.uDrag.value = state.drag;
    u.uDragCount.value = Math.max(1, Math.round(c.dragMarks));
    u.uSplat.value = state.splat;
    u.uGlow.value = c.channelGlow * g.glow;
    u.uOpacity.value = c.channelOpacity * g.opacity;
    u.uDry.value = state.dry;
    u.uFadeT.value = state.fadeT;
    u.uColorCut.value.copy(getColor(c.colorGroove));
    u.uColorBlood.value.copy(getColor(c.colorChannelBlood));
    u.uColorHot.value.copy(getColor(c.colorBloodHot));
    u.uColorDry.value.copy(getColor(c.colorDry));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The head glow                                                        */
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
    float core = exp(-r * r * 24.0);
    float rag = 0.7 + 0.3 * snoise(vec3(cos(a) * 3.0, sin(a) * 3.0, uTime * 3.0 + uSeed));
    float halo = exp(-r * 3.4 / rag) * (1.0 - smoothstep(0.7, 1.0, r));
    vec3 col = uColorHalo * halo + uColorCore * core * 2.0;
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, clamp(halo + core, 0.0, 1.0));
  }
`;

/** A bloom on the racing head, and on the meeting in the middle. */
export function createHeadGlowMaterial() {
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
    u.uIntensity.value = state.intensity * c.headBloom * g.glow;
    u.uSeed.value = state.seed;
    u.uColorCore.value.copy(getColor(c.colorBloomCore));
    u.uColorHalo.value.copy(getColor(c.colorBloomHalo));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The implosion warp — LAYER.DISTORTION                                */
/* -------------------------------------------------------------------- */

const IMPLODE_FRAGMENT = /* glsl */ `
  uniform float uRing;        // 0..1 radius of the ring, of the quad
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vP;
  uniform float uSize;
  void main() {
    vec2 q = vP / max(uSize, 0.01);
    float r = length(q);
    if (r > 1.0) discard;
    float d = (r - uRing) / 0.08;
    // Pulled in behind the ring, pushed ahead of it: the air rushes inward.
    float slope = d * exp(-d * d);
    vec2 dir = q / max(r, 1e-4);
    float mask = exp(-d * d);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * clamp(slope * 2.0, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** The air rushing in with the wall, flat over the circle. */
export function createImplodeWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 5 },
      uRing: { value: 1 },
      uStrength: { value: 0 }
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: IMPLODE_FRAGMENT
  });

  /** @param {object} state { center, size, ring, strength } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.2, state.size);
    u.uRing.value = state.ring;
    u.uStrength.value = c.implodeWarp * g.distortion * state.strength;
  };

  return material;
}
