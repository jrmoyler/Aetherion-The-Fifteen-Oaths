import { Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Dust Devil March — the bespoke shaders.
 *
 *  - **the funnel** (`createFunnelMaterial`) — a column of whirling dust. The
 *    vertex stage raises the parameter tube into a devil: pinched at the
 *    floor with a flared *skirt* where the dust is kicked up, widening up its
 *    height, leaning into the way it walks, its axis snaking on two slow
 *    sines, and the whole surface *twisted* by the integrated spin phase so it
 *    visibly turns. The fragment is dust, not light — normal blending, so a
 *    devil darkens what is behind it: spiral bands of fbm density sheared up
 *    the column, thickest at the silhouette (where the eye runs through the
 *    most dust), lit on its sunward side, hazier toward the crown, soft where
 *    it meets the floor, and eroding into wisps as it collapses. Two shells
 *    per devil: a dense, fast core and a thin, slow, wide veil.
 *  - **the swirl** (`createFunnelWarpMaterial`) — the same vertex stage on
 *    `LAYER.DISTORTION`, writing a *tangential* offset, so the air round each
 *    devil visibly turns.
 *  - **the track** (`createTrackMaterial`) — the floor the march wears into
 *    the rim of the circle: a scoured ring of pale sand raked with spiral
 *    grooves that rotate with the march, and under each devil a dark swirl of
 *    disturbed dust. Up to `MAX_DEVILS` devils, as uniforms.
 *
 * Every material reads `settings.dustmarch` in `userData.sync(...)`.
 */

const ID = 'dustmarch';

/** Devils the track can draw; the ability's cap matches it. */
export const MAX_DEVILS = 8;

const FUNNEL_VERTEX_GLSL = /* glsl */ `
  attribute vec4 aDevil;      // x, z, seed, shell
  attribute vec4 aDevil2;     // height, radius ×, spin phase, opacity
  attribute vec4 aDevil3;     // lean x, lean z, collapse, -

  uniform float uTime;
  uniform float uBaseR;
  uniform float uTopR;
  uniform float uFlare;
  uniform float uSkirt;
  uniform float uSkirtHeight;
  uniform float uWobble;
  uniform float uWobbleRate;
  uniform float uTwist;
  uniform float uShellScale;
  uniform float uBulge;

  varying vec2  vUv;           // x: 0..1 round, y: s
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;
  varying vec4  vDevil;
  varying vec4  vDevil2;
  varying float vCollapse;

  ${noiseGLSL}

  vec3 funnelAxis(float s) {
    float H = aDevil2.x;
    float seed = aDevil.z;
    vec2 wob = uWobble * pow(s, 1.25) * vec2(
      sin(uTime * uWobbleRate + s * 3.1 + seed * 20.0),
      cos(uTime * uWobbleRate * 0.83 + s * 2.4 + seed * 13.0)
    );
    vec2 lean = aDevil3.xy * s * H;
    return vec3(aDevil.x + lean.x + wob.x, s * H, aDevil.y + lean.y + wob.y);
  }

  vec3 placeFunnel() {
    float s = position.y;
    float seed = aDevil.z;
    float shell = aDevil.w;
    float H = aDevil2.x;
    // Twisted: the surface turns with the spin, faster at the floor.
    float ang = position.x * 6.2831853;
    float twist = aDevil2.z * (1.0 - 0.45 * s) * mix(1.0, 0.55, shell) + s * uTwist;
    vec3 axis = funnelAxis(s);
    float r = mix(uBaseR, uTopR, pow(s, uFlare));
    r += uSkirt * exp(-s * H / max(uSkirtHeight, 0.02));
    r *= 1.0 + uBulge * snoise(vec3(cos(ang + twist) * 0.8, s * 3.0 - uTime * 0.6, seed * 7.0 + sin(ang + twist) * 0.8));
    r *= aDevil2.y * mix(1.0, uShellScale, shell);
    // Collapsing: the column ropes thin and the skirt spreads out.
    float col = aDevil3.z;
    r *= mix(1.0, 0.35 + 1.6 * exp(-s * 6.0), col);
    vec3 dir = vec3(cos(ang), 0.0, sin(ang));
    vec3 world = axis + dir * r;
    vUv = vec2(position.x, s);
    vNormalW = dir;
    vDevil = aDevil;
    vDevil2 = aDevil2;
    vCollapse = col;
    return world;
  }
`;

const FUNNEL_VERTEX = /* glsl */ `
  ${FUNNEL_VERTEX_GLSL}
  void main() {
    vec3 world = placeFunnel();
    vWorld = world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FUNNEL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;

  uniform float uBands;
  uniform float uShear;
  uniform float uDensity;
  uniform float uEdgeThick;
  uniform float uCrownFade;
  uniform float uSoftFade;
  uniform float uLit;
  uniform float uOpacity;
  uniform float uNoiseScale;
  uniform vec3  uColorDark;
  uniform vec3  uColorMid;
  uniform vec3  uColorLight;

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;
  varying vec4  vDevil;
  varying vec4  vDevil2;
  varying float vCollapse;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float s = vUv.y;
    float seed = vDevil.z;
    float shell = vDevil.w;
    float H = vDevil2.x;
    // Spiral bands sheared up the column, scrolled by the spin phase. Sampled
    // on a circle, so the seam round the tube never shows.
    float a = vUv.x * 6.2831853 + vDevil2.z * mix(1.0, 0.6, shell) - s * uShear;
    vec3 p = vec3(cos(a) * uBands, sin(a) * uBands, s * H * uNoiseScale - uTime * 0.4) + seed * 11.0;
    float n = fbm4(p);
    float bands = 0.5 + 0.5 * sin(a * 3.0 + s * H * 2.2 + n * 3.0);
    float dens = smoothstep(0.15, 0.85, n * 0.5 + 0.5 + bands * 0.35 - 0.2) * uDensity;
    // Wisps as it collapses.
    float wn = snoise(vec3(cos(a) * 2.0, sin(a) * 2.0, s * 6.0 + seed * 3.0)) * 0.5 + 0.5;
    dens *= smoothstep(vCollapse * 1.1 - 0.1, vCollapse * 1.1 + 0.15, wn);

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float edge = 1.0 - abs(dot(N, V));
    float thick = mix(1.0, 0.35 + edge * 1.3, uEdgeThick);
    float crown = 1.0 - smoothstep(1.0 - uCrownFade, 1.0, s);
    float a1 = dens * thick * crown * vDevil2.w * uOpacity * mix(1.0, 0.45, shell);
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    a1 *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (a1 < 0.004) discard;

    float lit = clamp(dot(N, normalize(uLightDir)) * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uColorDark, uColorMid, smoothstep(0.0, 0.6, lit));
    col = mix(col, uColorLight, smoothstep(0.55, 1.0, lit) * uLit);
    col *= 0.75 + 0.35 * n;
    // The skirt is churned floor: darker.
    col = mix(col, uColorDark, exp(-s * H * 2.5) * 0.5);
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a1, 0.0, 1.0));
  }
`;

function funnelShapeUniforms() {
  return {
    uBaseR: { value: 0.3 },
    uTopR: { value: 1.6 },
    uFlare: { value: 1.3 },
    uSkirt: { value: 0.6 },
    uSkirtHeight: { value: 0.3 },
    uWobble: { value: 0.4 },
    uWobbleRate: { value: 1.5 },
    uTwist: { value: 2 },
    uShellScale: { value: 1.5 },
    uBulge: { value: 0.15 }
  };
}

function syncFunnelShape(u) {
  const c = settings[ID];
  const g = settings.global;
  u.uBaseR.value = Math.max(0.02, c.baseRadius);
  u.uTopR.value = Math.max(0.05, c.topRadius);
  u.uFlare.value = c.flare;
  u.uSkirt.value = c.skirt;
  u.uSkirtHeight.value = c.skirtHeight;
  u.uWobble.value = c.wobble * g.noiseStrength;
  u.uWobbleRate.value = c.wobbleRate * g.animationSpeed;
  u.uTwist.value = c.twist;
  u.uShellScale.value = c.veilScale;
  u.uBulge.value = c.bulge * g.noiseStrength;
}

/** A whirling column of dust. Normal blending — it occludes. */
export function createFunnelMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...funnelShapeUniforms(),
      uBands: { value: 1.5 },
      uShear: { value: 6 },
      uDensity: { value: 1 },
      uEdgeThick: { value: 0.7 },
      uCrownFade: { value: 0.4 },
      uSoftFade: { value: 0.4 },
      uLit: { value: 0.8 },
      uOpacity: { value: 0.8 },
      uNoiseScale: { value: 0.8 },
      uColorDark: { value: new Color() },
      uColorMid: { value: new Color() },
      uColorLight: { value: new Color() }
    }),
    vertexShader: FUNNEL_VERTEX,
    fragmentShader: FUNNEL_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncFunnelShape(u);
    u.uBands.value = c.bandScale * g.noiseFrequency;
    u.uShear.value = c.bandShear;
    u.uDensity.value = c.density;
    u.uEdgeThick.value = c.edgeThickness;
    u.uCrownFade.value = c.crownFade;
    u.uSoftFade.value = c.softFade;
    u.uLit.value = c.dustLit;
    u.uOpacity.value = c.dustOpacity * g.opacity;
    u.uNoiseScale.value = c.dustNoiseScale * g.noiseFrequency;
    u.uColorDark.value.copy(getColor(c.colorDustDark));
    u.uColorMid.value.copy(getColor(c.colorDustMid));
    u.uColorLight.value.copy(getColor(c.colorDustLight));
  };

  return material;
}

const SWIRL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec4  vDevil;
  varying vec4  vDevil2;
  varying float vCollapse;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    // The air turns: an offset along the swirl's tangent, projected on screen.
    vec3 tang = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    vec4 a = viewMatrix * vec4(tang, 0.0);
    vec2 dir = normalize(a.xy + vec2(1e-4));
    float n = snoise(vec3(vUv.x * 9.0, vUv.y * 4.0 - uTime, vDevil.z * 5.0)) * 0.5 + 0.5;
    float mask = pow(abs(dot(N, V)), 1.2) * smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y)) * (1.0 - vDevil.w);
    float s = uStrength * uShaderIntensity * mask * vDevil2.w * (1.0 - vCollapse) * (0.5 + 0.5 * n);
    if (s < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, s, mask);
  }
`;

/** The air turning round each devil. `LAYER.DISTORTION`. */
export function createFunnelWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...funnelShapeUniforms(),
      uStrength: { value: 1 }
    }),
    vertexShader: FUNNEL_VERTEX,
    fragmentShader: SWIRL_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncFunnelShape(u);
    u.uShellScale.value = c.veilScale;
    u.uStrength.value = c.swirlWarp * g.distortion;
  };

  return material;
}

/* ==================================================================== */
/* The track worn into the rim                                           */
/* ==================================================================== */

const TRACK_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  varying vec2 vP;
  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    vec3 world = vec3(uCentre.x + p.x, 0.013, uCentre.z + p.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TRACK_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;
  uniform float uWidth;
  uniform float uWorn;        // 0..1 the ring worn in
  uniform float uMarch;       // the march's angle, radians
  uniform float uGrooves;
  uniform float uGrooveDepth;
  uniform float uErode;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec4  uDevils[${MAX_DEVILS}];   // x, z (relative to the centre), strength, radius
  uniform vec3  uColorScour;
  uniform vec3  uColorGroove;
  uniform vec3  uColorChurn;

  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    vec2 p = vP;
    float r = length(p);
    float a = atan(p.y, p.x);

    // The worn ring, ragged.
    float rag = snoise(vec3(p * 0.9, uSeed)) * uWidth * 0.35;
    float ring = 1.0 - smoothstep(uWidth * 0.5, uWidth, abs(r - uRadius + rag));
    // Spiral rake grooves, turning with the march.
    float g = abs(fract((a - uMarch) / 6.2831853 * uGrooves + (r - uRadius) * 0.9) - 0.5) * 2.0;
    float groove = (1.0 - smoothstep(0.0, 0.35, g)) * ring;

    // Under each devil, a churned swirl of floor.
    float churn = 0.0;
    for (int i = 0; i < ${MAX_DEVILS}; i++) {
      vec4 d = uDevils[i];
      if (d.z <= 0.0) continue;
      vec2 q = p - d.xy;
      float qr = length(q);
      float qa = atan(q.y, q.x);
      float sw = 0.5 + 0.5 * sin(qa * 3.0 + qr * 6.0 - uTime * 8.0);
      float disc = 1.0 - smoothstep(d.w * 0.4, d.w, qr);
      churn = max(churn, disc * (0.55 + 0.45 * sw) * d.z);
    }

    vec3 col = mix(uColorScour, uColorGroove, groove * uGrooveDepth);
    col = mix(col, uColorChurn, churn);
    float alpha = max(ring * uWorn * (0.45 + 0.4 * groove), churn * 0.85);
    float n = snoise(vec3(p * 1.4, uSeed * 3.0)) * 0.5 + 0.5;
    float thr = uErode * 1.25 - 0.15;
    alpha *= smoothstep(thr, thr + 0.15, n) * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The scoured ring the march wears, and the churn under each devil. */
export function createTrackMaterial() {
  const devils = [];
  for (let i = 0; i < MAX_DEVILS; i++) devils.push(new Vector4(0, 0, 0, 1));
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
      uExtent: { value: 7 },
      uRadius: { value: 5 },
      uWidth: { value: 1.2 },
      uWorn: { value: 0 },
      uMarch: { value: 0 },
      uGrooves: { value: 24 },
      uGrooveDepth: { value: 0.6 },
      uErode: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uDevils: { value: devils },
      uColorScour: { value: new Color() },
      uColorGroove: { value: new Color() },
      uColorChurn: { value: new Color() }
    }),
    vertexShader: TRACK_VERTEX,
    fragmentShader: TRACK_FRAGMENT
  });

  /** @param {object} s { centre, radius, worn, march, erode, seed } — devils are written into `uniforms.uDevils` by the ability. */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = s.radius;
    u.uExtent.value = s.radius + c.trackWidth + c.churnRadius + 1;
    u.uWidth.value = c.trackWidth;
    u.uWorn.value = s.worn * c.trackOpacity;
    u.uMarch.value = s.march;
    u.uGrooves.value = Math.round(c.grooves);
    u.uGrooveDepth.value = c.grooveDepth;
    u.uErode.value = s.erode;
    u.uSeed.value = s.seed;
    u.uOpacity.value = g.opacity;
    u.uColorScour.value.copy(getColor(c.colorScour));
    u.uColorGroove.value.copy(getColor(c.colorGroove));
    u.uColorChurn.value.copy(getColor(c.colorChurn));
  };

  return material;
}
