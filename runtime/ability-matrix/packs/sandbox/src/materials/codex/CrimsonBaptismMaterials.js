import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Crimson Baptism — the bespoke shaders the blood fountain is drawn with.
 *
 *  - **the fountain** — one surface of revolution in parameter space
 *    (`createFountainGeometry`), turned into metres in the vertex stage: a
 *    column of blood punching straight up out of the floor, turning over at the
 *    top and falling away on every side as a ballistic umbrella sheet that
 *    lands in a ring. Its height, crown and reach are live; it wobbles on
 *    noise and twists slowly. The fragment stage shades a thin, wet, glossy
 *    sheet: flow streaks racing up the column and down the crown, a red-hot
 *    core lit from inside the column, a pale fresnel sheen where the sheet
 *    turns edge-on, and a ragged lip where it tears into strands. When it
 *    collapses it *breaks up* — holes eat it on noise until only droplets are
 *    left.
 *  - **the shimmer** — the same surface, fattened, on `LAYER.DISTORTION`.
 *  - **the seam** — a glowing crack wandering along the floor from the caster
 *    to the circle with blood seeping from it, a hot head where the blood is
 *    forcing its way under the stone.
 *  - **the font** — a ground quad: a pool that floods out from the ring where
 *    the crown lands and fills the circle, wet and glinting, peppered with
 *    rain rings once the blood falls back; it drains and dries at the end.
 *  - **the crown glow** — a camera-facing bloom where the column turns over.
 *
 * Every material reads `settings.baptism` in `userData.sync(state)`.
 */

const ID = 'baptism';

/* -------------------------------------------------------------------- */
/* The fountain                                                         */
/* -------------------------------------------------------------------- */

const FOUNTAIN_GLSL = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uHeight;      // top of the column, metres
  uniform float uColR;        // column radius, metres
  uniform float uReach;       // radius the crown lands at, metres
  uniform float uLoft;        // metres the crown rises over the top of the column
  uniform float uSplit;       // 0..1 share of the flow that is column
  uniform float uWobble;
  uniform float uTwist;
  uniform float uFlow;
  uniform float uSeed;

  /** (radius, height) of the flow at v. */
  vec2 profile(float v) {
    if (v < uSplit) {
      float t = v / max(uSplit, 0.01);
      // a little flare at the floor where it bursts out
      float r = uColR * (1.0 - 0.25 * t + 0.6 * exp(-t * 14.0));
      return vec2(r, uHeight * t);
    }
    float w = (v - uSplit) / max(1.0 - uSplit, 0.01);
    float r = mix(uColR * 0.75, uReach, w);
    float y = uHeight + 2.0 * uLoft * w - (2.0 * uLoft + uHeight) * w * w;
    return vec2(r, max(y, 0.0));
  }

  vec3 fountainPoint(float v, float ang) {
    vec2 pr = profile(v);
    float a = ang + uTwist * v;
    float wob = snoise(vec3(cos(ang) * 1.3, sin(ang) * 1.3, v * 3.0 - uFlow * 0.25 + uSeed));
    float r = pr.x * (1.0 + uWobble * wob);
    return uCenter + vec3(cos(a) * r, pr.y, sin(a) * r);
  }
`;

const FOUNTAIN_VERTEX = /* glsl */ `
  uniform float uScale;       // the shimmer is a fat fountain

  varying float vV;
  varying float vAng;
  varying vec3  vNormalW;
  varying vec3  vWorld;

  ${noiseGLSL}
  ${FOUNTAIN_GLSL}

  void main() {
    float v = position.x;
    float ang = position.y * 6.2831853;
    vec3 p = fountainPoint(v, ang);
    vec3 dv = fountainPoint(min(v + 0.01, 1.0), ang) - fountainPoint(max(v - 0.01, 0.0), ang);
    vec3 da = fountainPoint(v, ang + 0.05) - fountainPoint(v, ang - 0.05);
    vec3 N = normalize(cross(da, dv) + vec3(0.0, 1e-5, 0.0));
    // Fatten outward from the axis (the shimmer); 1 for the fountain itself.
    vec3 out_ = p - uCenter;
    out_.y = 0.0;
    p += normalize(out_ + vec3(1e-4, 0.0, 0.0)) * (uScale - 1.0) * uColR;
    vV = v;
    vAng = ang;
    vNormalW = N;
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const FOUNTAIN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uSplit;
  uniform float uFlow;
  uniform float uSeed;
  uniform float uStreakScale;
  uniform float uCoreGlow;
  uniform float uSheen;
  uniform float uGloss;
  uniform float uOpacity;
  uniform float uCrownAlpha;
  uniform float uBreak;       // 0 whole .. 1 nothing but droplets
  uniform float uLip;         // how ragged the crown's lip is
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorHot;
  uniform vec3  uColorSheen;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying float vV;
  varying float vAng;
  varying vec3  vNormalW;
  varying vec3  vWorld;

  ${noiseGLSL}

  void main() {
    vec2 ca = vec2(cos(vAng), sin(vAng));
    float col = 1.0 - smoothstep(uSplit - 0.04, uSplit + 0.02, vV);
    float w = clamp((vV - uSplit) / max(1.0 - uSplit, 0.01), 0.0, 1.0);

    // Streaks: up the column, down and out over the crown.
    float streak = fbm3(vec3(ca * uStreakScale, vV * 9.0 - uFlow + uSeed));
    float fine = snoise(vec3(ca * uStreakScale * 3.0, vV * 22.0 - uFlow * 1.7));
    float s = streak * 0.7 + fine * 0.3;

    // Breaking up: holes eat the sheet, the lip first.
    float hole = snoise(vec3(ca * 3.5, vV * 6.0 + uSeed * 2.0)) * 0.5 + 0.5;
    float lip = smoothstep(0.7, 1.0, w) * uLip;
    if (hole < uBreak * 1.15 + lip * 0.6 - 0.05) discard;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float facing = abs(dot(N, V));
    float diff = max(dot(N, L), 0.0) * 0.6 + 0.4;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 60.0) * uGloss;
    float fres = pow(1.0 - facing, 2.5);

    vec3 c = mix(uColorDeep, uColorBody, diff * (0.6 + 0.4 * s));
    // Lit from inside the column — the source of the fountain burns.
    float core = col * (0.5 + 0.5 * s) * uCoreGlow * uShaderIntensity;
    c += uColorHot * core * uGlobalGlow;
    c += uColorSheen * fres * uSheen * uGlobalGlow * (0.5 + 0.5 * s);
    c += vec3(spec);

    float a = (0.55 + 0.35 * s + fres * 0.4 + col * 0.3) * uOpacity * mix(uCrownAlpha, 1.0, col);
    a *= 1.0 - smoothstep(0.85, 1.0, w);
    a *= smoothstep(0.0, 0.02, vV);
    if (a < 0.004) discard;
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
  }
`;

function fountainUniforms() {
  return {
    uCenter: { value: new Vector3() },
    uHeight: { value: 0 },
    uColR: { value: 0.5 },
    uReach: { value: 3 },
    uLoft: { value: 0.8 },
    uSplit: { value: 0.4 },
    uWobble: { value: 0.1 },
    uTwist: { value: 0.3 },
    uFlow: { value: 0 },
    uSeed: { value: 0 },
    uScale: { value: 1 }
  };
}

/** @param {object} state { center, height, reach, loft, flow, seed } */
function syncFountainShape(u, state) {
  const c = settings[ID];
  const g = settings.global;
  u.uCenter.value.copy(state.center);
  u.uHeight.value = Math.max(0.001, state.height);
  u.uColR.value = Math.max(0.02, c.columnRadius);
  u.uReach.value = Math.max(0.05, state.reach);
  u.uLoft.value = Math.max(0, state.loft);
  u.uSplit.value = Math.min(0.9, Math.max(0.1, c.columnShare));
  u.uWobble.value = c.wobble * g.noiseStrength;
  u.uTwist.value = c.twist;
  u.uFlow.value = state.flow;
  u.uSeed.value = state.seed;
}

/** The fountain itself: a wet, translucent, glossy sheet of blood. */
export function createFountainMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...fountainUniforms(),
      uStreakScale: { value: 3 },
      uCoreGlow: { value: 2 },
      uSheen: { value: 1 },
      uGloss: { value: 1 },
      uOpacity: { value: 1 },
      uCrownAlpha: { value: 0.5 },
      uBreak: { value: 0 },
      uLip: { value: 0.6 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorSheen: { value: new Color() }
    }),
    vertexShader: FOUNTAIN_VERTEX,
    fragmentShader: FOUNTAIN_FRAGMENT
  });

  /** @param {object} state shape state plus { break } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncFountainShape(u, state);
    u.uScale.value = 1;
    u.uStreakScale.value = c.streakScale * g.noiseFrequency;
    u.uCoreGlow.value = c.coreGlow * g.glow;
    u.uSheen.value = c.sheen * g.fresnel;
    u.uGloss.value = c.gloss;
    u.uOpacity.value = c.fountainOpacity * g.opacity;
    u.uCrownAlpha.value = c.crownOpacity;
    u.uBreak.value = state.break;
    u.uLip.value = c.lipTear;
    u.uColorDeep.value.copy(getColor(c.colorFountainDeep));
    u.uColorBody.value.copy(getColor(c.colorFountainBody));
    u.uColorHot.value.copy(getColor(c.colorFountainHot));
    u.uColorSheen.value.copy(getColor(c.colorFountainSheen));
  };

  return material;
}

const SHIMMER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uBreak;
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying float vV;
  varying float vAng;
  varying vec3  vNormalW;
  varying vec3  vWorld;

  ${noiseGLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float through = pow(abs(dot(normalize(vNormalW), V)), 1.2);
    vec3 np = vec3(cos(vAng) * 2.0, sin(vAng) * 2.0, vV * 8.0 - uTime * 3.0 + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(9.1, 3.7, 5.3)));
    float mask = through * (1.0 - uBreak) * smoothstep(0.0, 0.05, vV);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(n * 0.5 + 0.5, strength, mask);
  }
`;

/** The air bent round the fountain — LAYER.DISTORTION. */
export function createFountainShimmerMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...fountainUniforms(),
      uStrength: { value: 1 },
      uBreak: { value: 0 }
    }),
    vertexShader: FOUNTAIN_VERTEX,
    fragmentShader: SHIMMER_FRAGMENT
  });

  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncFountainShape(u, state);
    u.uScale.value = Math.max(1, c.shimmerWidth);
    u.uStrength.value = c.shimmer * g.distortion * state.strength;
    u.uBreak.value = state.break;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The seam                                                             */
/* -------------------------------------------------------------------- */

const SEAM_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uHalfWidth;
  varying vec2 vFlat;
  void main() {
    float across = position.y * uHalfWidth;
    float along = position.x * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = 0.014;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SEAM_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uFront;       // metres the blood has got under the floor
  uniform float uWidth;
  uniform float uWander;
  uniform float uGlow;
  uniform float uHeadGlow;
  uniform float uCool;        // metres behind the head the seam glows over
  uniform float uFade;
  uniform vec3  uColorHot;
  uniform vec3  uColorWet;
  uniform float uGlobalGlow;
  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;
    if (along < 0.0 || along > uFront + 0.4) discard;
    float wig = snoise(vec3(along * 0.5, uSeed, 0.0)) * uWander + snoise(vec3(along * 2.1, uSeed + 3.0, 0.0)) * uWander * 0.3;
    float d = abs(x - wig);
    float crack = 1.0 - smoothstep(uWidth * 0.2, uWidth, d);
    float wet = 1.0 - smoothstep(uWidth, uWidth * 5.0, d + snoise(vec3(along * 1.5, x * 3.0, uSeed)) * uWidth);
    float behind = uFront - along;
    float hot = exp(-max(behind, 0.0) / max(uCool, 0.05));
    float head = exp(-pow(behind / 0.5, 2.0)) * uHeadGlow;
    float a = max(crack, wet * 0.6) * smoothstep(-0.4, 0.0, behind) * uFade;
    if (a < 0.004) discard;
    vec3 col = mix(uColorWet, uColorHot * uGlow * uGlobalGlow * (0.3 + hot + head), crack);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The crack the blood races under the floor along. */
export function createSeamMaterial() {
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
      uHalfWidth: { value: 1 },
      uSeed: { value: 0 },
      uFront: { value: 0 },
      uWidth: { value: 0.08 },
      uWander: { value: 0.2 },
      uGlow: { value: 2 },
      uHeadGlow: { value: 2 },
      uCool: { value: 3 },
      uFade: { value: 1 },
      uColorHot: { value: new Color() },
      uColorWet: { value: new Color() }
    }),
    vertexShader: SEAM_VERTEX,
    fragmentShader: SEAM_FRAGMENT
  });

  /** @param {object} state { start, dir, side, length, front, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = Math.max(0.1, state.length);
    u.uHalfWidth.value = c.seamWander + c.seamWidth * 6 + 0.2;
    u.uSeed.value = state.seed;
    u.uFront.value = state.front;
    u.uWidth.value = Math.max(0.01, c.seamWidth);
    u.uWander.value = c.seamWander * g.noiseStrength;
    u.uGlow.value = c.seamGlow * g.glow;
    u.uHeadGlow.value = c.seamHeadGlow;
    u.uCool.value = c.seamCool;
    u.uFade.value = state.fade * g.opacity;
    u.uColorHot.value.copy(getColor(c.colorSeamHot));
    u.uColorWet.value.copy(getColor(c.colorSeamWet));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The font — the pool the blood falls back into                        */
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

const FONT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;      // the circle
  uniform float uFill;        // 0..1 how far the pool has flooded the circle
  uniform float uLand;        // radius the crown is landing at (−1 none)
  uniform float uRain;        // 0..1 how hard it is raining back
  uniform float uRippleCell;
  uniform float uRippleRate;
  uniform float uRippleGlow;
  uniform float uGloss;
  uniform float uOpacity;
  uniform float uDry;
  uniform float uFadeT;
  uniform float uEdgeGlow;
  uniform vec3  uColorPool;
  uniform vec3  uColorPoolLit;
  uniform vec3  uColorRipple;
  uniform vec3  uColorDry;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  varying vec2 vP;

  ${noiseGLSL}

  /** Rain rings: one per cell, each on its own clock. */
  float ripples(vec2 p) {
    vec2 cell = p / uRippleCell;
    vec2 ic = floor(cell);
    float sum = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 id = ic + vec2(float(i), float(j));
        float h = hash13(vec3(id, uSeed));
        vec2 c = (id + vec2(hash13(vec3(id, uSeed + 1.7)), hash13(vec3(id, uSeed + 4.3)))) * uRippleCell;
        float ph = fract(uTime * uRippleRate * (0.7 + 0.6 * h) + h * 7.0);
        float rad = ph * uRippleCell * 0.75;
        float d = length(p - c);
        float ring = exp(-pow((d - rad) / (uRippleCell * 0.05), 2.0)) * (1.0 - ph);
        sum += ring * step(h, uRain);
      }
    }
    return sum;
  }

  void main() {
    float r = length(vP);
    float a = atan(vP.y, vP.x);
    vec2 ca = vec2(cos(a), sin(a));
    float edgeN = snoise(vec3(ca * 2.2, uSeed)) * 0.12 + fbm3(vec3(vP * 1.6, uSeed)) * 0.1;
    float R = uRadius * (1.0 + edgeN);
    // It floods out from the ring the crown lands on, and fills in behind.
    float disc = 1.0 - smoothstep(R * uFill - 0.15, R * uFill, r);
    float band = uLand < 0.0 ? 0.0 : 1.0 - smoothstep(0.25, 0.55 + uFill * R, abs(r - uLand));
    float pool = max(disc, band) * (1.0 - smoothstep(R - 0.12, R, r));

    float rip = ripples(vP) * uRain;
    float landing = uLand < 0.0 ? 0.0 : exp(-pow((r - uLand) / 0.35, 2.0));

    vec3 N = normalize(vec3(snoise(vec3(vP * 3.0, uSeed)) * 0.08 + rip * 0.1, 1.0, snoise(vec3(vP * 3.0, uSeed + 5.0)) * 0.08));
    vec3 V = normalize(cameraPosition - vec3(vP.x, 0.0, vP.y));
    vec3 H = normalize(normalize(uLightDir) + V);
    float spec = pow(max(dot(N, H), 0.0), 120.0) * uGloss * (1.0 - uDry);
    float fres = pow(1.0 - max(V.y, 0.0), 4.0);

    vec3 col = mix(uColorPool, uColorPoolLit, fres * 0.7 + 0.15);
    col += vec3(spec);
    col += uColorRipple * (rip * uRippleGlow + landing * uEdgeGlow) * uGlobalGlow * (1.0 - uDry);
    // a hot rim where the pool meets dry floor
    col += uColorRipple * uEdgeGlow * 0.3 * uGlobalGlow * smoothstep(R - 0.35, R - 0.1, r) * (1.0 - uDry);
    col = mix(col, uColorDry * (0.8 + 0.2 * snoise(vec3(vP * 4.0, uSeed))), uDry);

    float n = snoise(vec3(vP * 1.4, uSeed * 4.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, n);
    float alpha = pool * vis * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The pool the circle floods with, and the rain rings in it. */
export function createFontMaterial() {
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
      uSize: { value: 5 },
      uSeed: { value: 0 },
      uRadius: { value: 4 },
      uFill: { value: 0 },
      uLand: { value: -1 },
      uRain: { value: 0 },
      uRippleCell: { value: 0.5 },
      uRippleRate: { value: 1.5 },
      uRippleGlow: { value: 1 },
      uGloss: { value: 1 },
      uOpacity: { value: 1 },
      uDry: { value: 0 },
      uFadeT: { value: 0 },
      uEdgeGlow: { value: 1 },
      uColorPool: { value: new Color() },
      uColorPoolLit: { value: new Color() },
      uColorRipple: { value: new Color() },
      uColorDry: { value: new Color() }
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: FONT_FRAGMENT
  });

  /** @param {object} state { center, fill, land, rain, dry, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.5, c.zoneRadius * 1.3);
    u.uSeed.value = state.seed;
    u.uRadius.value = Math.max(0.2, c.zoneRadius);
    u.uFill.value = state.fill;
    u.uLand.value = state.land;
    u.uRain.value = state.rain;
    u.uRippleCell.value = Math.max(0.1, c.rippleCell);
    u.uRippleRate.value = c.rippleRate;
    u.uRippleGlow.value = c.rippleGlow;
    u.uGloss.value = c.poolGloss;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uDry.value = state.dry;
    u.uFadeT.value = state.fadeT;
    u.uEdgeGlow.value = c.poolEdgeGlow * g.glow;
    u.uColorPool.value.copy(getColor(c.colorPool));
    u.uColorPoolLit.value.copy(getColor(c.colorPoolLit));
    u.uColorRipple.value.copy(getColor(c.colorRipple));
    u.uColorDry.value.copy(getColor(c.colorDry));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The crown glow                                                       */
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
    float core = exp(-r * r * 18.0);
    // Rays fanning down and out, the way the crown falls.
    float rays = pow(abs(cos(a * 6.0 + uSeed)), 14.0) * exp(-r * 2.4) * (0.6 + 0.4 * snoise(vec3(a * 2.0, uTime * 2.5, uSeed)));
    float halo = exp(-r * 3.0) * (1.0 - smoothstep(0.7, 1.0, r));
    vec3 col = uColorHalo * (halo + rays) + uColorCore * core * 2.0;
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, clamp(halo + core + rays, 0.0, 1.0));
  }
`;

/** A bloom where the column turns over. */
export function createCrownGlowMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 1 },
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
    u.uIntensity.value = state.intensity * c.crownGlow * g.glow;
    u.uSeed.value = state.seed;
    u.uColorCore.value.copy(getColor(c.colorCrownCore));
    u.uColorHalo.value.copy(getColor(c.colorCrownHalo));
  };

  return material;
}
