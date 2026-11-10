import {
  AdditiveBlending,
  BackSide,
  Color,
  CustomBlending,
  DoubleSide,
  FrontSide,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial
} from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/* ==================================================================== */
/* 1 · the lattice shell                                                  */
/* ==================================================================== */

/**
 * The time-dilation dome — a geodesic shell of **filled glass panels** drawn
 * in the fragment stage from the barycentrics on a non-indexed icosphere.
 *
 *  - **panels**: every triangle is a pane of dark violet time-glass with a
 *    body, not an outline — coloured from a four-stop ramp (deep indigo mass
 *    → saturated violet body → pale lilac edges → white only in the nodes and
 *    the sun glint), thicker toward the silhouette (fresnel), each pane its
 *    own rolled tint, faceted against the sun with a hard glint. Drawn as a
 *    premultiplied "over": the deep stop *darkens* what is behind it, the
 *    light adds on top, so the dome has mass on the dark floor;
 *  - **the time hand**: a meridian sweep rolling round the dome, lighting
 *    the panes it passes and leaving them to cool behind it — slowed hard
 *    while time is held, so the linger has its own, visibly dragging motion;
 *  - **slow ripples** inside each pane, crawling inward from its frame;
 *  - thin pale **frames** and small white **nodes** (no longer the body);
 *  - **forming** from the floor up, each pane on its own lag, the leading
 *    row burning; **dissolving** crown-first with a burning edge;
 *  - two passes (far wall, then near) so the panes stack in order.
 */
const SHELL_VERTEX = /* glsl */ `
  attribute vec3 aBary;
  varying vec3  vBary;
  varying vec3  vLocal;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vWorld;
  varying float vViewZ;

  void main() {
    vBary = aBary;
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHELL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uForm;
  uniform float uDissolve;
  uniform float uDissolveEdge;
  uniform float uSink;          // local y below which nothing is drawn
  uniform float uEdgeWidth;
  uniform float uEdgeGlow;
  uniform float uNodeGlow;
  uniform float uFillGlow;
  uniform float uFresnelPower;
  uniform float uFresnelGlow;
  uniform float uShimmerTime;   // integrated, so it can be slowed live
  uniform float uShimmerScale;
  uniform float uShimmerAmount;
  uniform float uBackFace;
  uniform float uOpacity;
  uniform float uFlash;         // the release
  uniform float uPanelOpacity;
  uniform float uPanelGlow;
  uniform float uSweep;         // integrated angle of the time hand
  uniform float uSweepGlow;
  uniform float uSweepTrail;
  uniform float uGlint;
  uniform float uPass;          // 0 far wall, 1 near wall
  uniform float uSaturation;
  uniform float uFrameDeep;     // the frames' own dark body    // 1 as authored, 0 grey-violet
  uniform float uLightCap;      // how far the brightest light is held down
  uniform vec3  uColorEdge;
  uniform vec3  uColorNode;
  uniform vec3  uColorFill;
  uniform vec3  uColorDeep;
  uniform vec3  uColorRim;
  uniform vec3  uColorBurn;
  uniform vec3  uLightDir;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec3  vBary;
  varying vec3  vLocal;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    if (vLocal.y < uSink) discard;
    // 0 at the floor line, 1 at the crown.
    float h = clamp((vLocal.y - uSink) / max(1.0 - uSink, 1e-3), 0.0, 1.0);

    /* --- per-face dice: the face centre is the same for its three vertices --- */
    vec3 faceKey = floor(normalize(vLocal) * 7.0 + 0.5);
    float dice = hash13(faceKey + uSeed);

    /* --- forming from the floor up --- */
    float lightAt = h * 0.8 + dice * 0.2;
    float formed = step(lightAt, uForm);
    float formEdge = exp(-max(uForm - lightAt, 0.0) * 14.0) * formed;
    float guide = (1.0 - smoothstep(0.0, 0.1, lightAt - uForm)) * (1.0 - formed) * 0.4;

    /* --- dissolving from the crown down --- */
    float goneAt = (1.0 - h) * 0.7 + dice * 0.3;
    float threshold = uDissolve * (1.0 + uDissolveEdge);
    if (uDissolve > 0.0 && goneAt < threshold - uDissolveEdge) discard;
    float burning = (1.0 - smoothstep(threshold - uDissolveEdge, threshold, goneAt)) * step(goneAt, threshold) * step(0.0001, uDissolve);

    /* --- frames and nodes from the barycentrics --- */
    vec3 fw = fwidth(vBary) * 1.2;
    vec3 e3 = smoothstep(fw * 0.5, fw * 0.5 + max(uEdgeWidth, 1e-3) * (1.0 + fw * 20.0), vBary);
    float edge = 1.0 - min(min(e3.x, e3.y), e3.z);
    vec3 n3 = 1.0 - smoothstep(vec3(0.0), vec3(0.07), vBary);
    float node = clamp(n3.x * n3.y + n3.y * n3.z + n3.z * n3.x, 0.0, 1.0);
    float inset = min(min(vBary.x, vBary.y), vBary.z); // 0 at the frame, 1/3 at the pane centre

    /* --- facet lighting --- */
    vec3 Nf = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 V = normalize(vViewDir);
    if (dot(Nf, V) < 0.0) Nf = -Nf;
    float ndv = clamp(dot(Nf, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, max(uFresnelPower, 0.2));
    vec3 L = normalize(uLightDir);
    float glint = pow(clamp(dot(Nf, normalize(L + V)), 0.0, 1.0), 90.0) * uGlint;
    float sunSide = clamp(dot(Nf, L) * 0.5 + 0.5, 0.0, 1.0);

    /* --- the time hand: a meridian rolling round the dome, a cooling wake --- */
    float azim = atan(faceKey.z, faceKey.x);
    float lag = fract((uSweep - azim) / 6.2831853);
    float hand = exp(-lag * uSweepTrail) * (0.4 + 0.6 * h);
    float ahead = exp(-pow((1.0 - lag) * 40.0, 2.0)); // the bright leading meridian

    /* --- slow ripples inside each pane, crawling in from its frame --- */
    float ripple = pow(0.5 + 0.5 * sin(inset * 48.0 - uShimmerTime * 6.0 + dice * 6.2831853), 4.0) * smoothstep(0.02, 0.12, inset);
    float sh = snoise(vec3(vLocal * uShimmerScale + vec3(0.0, -uShimmerTime, uSeed)));
    float shimmer = 1.0 + uShimmerAmount * sh * 0.5;

    /* --- the pane body: deep mass, saturated where lit, pale at the grazing rim --- */
    // Thin where seen face-on (you see the frozen debris through it), thick
    // and dark toward the silhouette, like a lens of slowed time.
    float thick = 0.4 + 0.6 * fres;
    float paneA = uPanelOpacity * thick * formed;
    vec3 body = mix(uColorDeep, uColorFill, clamp(0.05 * dice + 0.1 * sunSide + hand * 0.35, 0.0, 1.0));
    vec3 light = uColorFill * (uFillGlow * dice + ripple * 0.12) * uPanelGlow * shimmer
               + uColorRim * hand * hand * uSweepGlow * 0.35 * uPanelGlow
               + uColorRim * fres * fres * uFresnelGlow
               + uColorEdge * ahead * uSweepGlow
               + uColorEdge * glint;
    light *= formed;
    // The frames are thin and the far wall's frames dimmer still, so the
    // dome reads as panes with mass, not as a wire diagram.
    float framePass = mix(0.25, 1.0, uPass);
    light += (uColorEdge * edge * uEdgeGlow * (0.6 + hand) * shimmer
           + uColorNode * node * uNodeGlow) * formed * framePass;
    light += uColorBurn * (formEdge * (edge + 0.3) * 3.0 + guide * edge);
    light += uColorBurn * burning * 2.0;
    light += uColorBurn * uFlash * (edge + 0.25);

    // Pull the light toward its own grey and keep the frames in the deep
    // stop's family: violet glass, not neon.
    float lum = dot(light, vec3(0.2126, 0.7152, 0.0722));
    light = mix(vec3(lum) * mix(vec3(1.0), uColorRim / max(dot(uColorRim, vec3(0.2126, 0.7152, 0.0722)), 1e-3), 0.35), light, uSaturation);
    light *= mix(1.0, uLightCap, smoothstep(0.0, 1.5, lum));

    float pass = mix(uBackFace, 1.0, uPass);
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    float soft = softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.25);
    float a = clamp(paneA + edge * uFrameDeep * formed, 0.0, 1.0) * uOpacity * pass * soft;
    vec3 outC = (body * a + light * uOpacity * pass * soft * uGlobalGlow * uShaderIntensity);
    if (a < 0.003 && dot(outC, outC) < 1e-5) discard;
    gl_FragColor = vec4(outC, a);
  }
`;

/** @param {number} pass 0: the far wall (BackSide), 1: the near wall (FrontSide). */
export function createStillpointShellMaterial(pass = 1) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // Premultiplied "over": the deep pane darkens what is behind it.
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    side: pass > 0.5 ? FrontSide : BackSide,
    toneMapped: false,
    extensions: { derivatives: true },
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uForm: { value: 0 },
      uDissolve: { value: 0 },
      uDissolveEdge: { value: 0.08 },
      uSink: { value: -0.2 },
      uEdgeWidth: { value: 0.035 },
      uEdgeGlow: { value: 2 },
      uNodeGlow: { value: 3 },
      uFillGlow: { value: 0.1 },
      uFresnelPower: { value: 2.4 },
      uFresnelGlow: { value: 1 },
      uShimmerTime: { value: 0 },
      uShimmerScale: { value: 2 },
      uShimmerAmount: { value: 0.6 },
      uBackFace: { value: 0.4 },
      uOpacity: { value: 1 },
      uFlash: { value: 0 },
      uPanelOpacity: { value: 0.55 },
      uPanelGlow: { value: 1 },
      uSweep: { value: 0 },
      uSweepGlow: { value: 1 },
      uSweepTrail: { value: 3 },
      uGlint: { value: 2 },
      uPass: { value: pass },
      uSaturation: { value: 1 },
      uLightCap: { value: 1 },
      uFrameDeep: { value: 0.6 },
      uColorEdge: { value: new Color() },
      uColorNode: { value: new Color() },
      uColorFill: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorBurn: { value: new Color() }
    }),
    vertexShader: SHELL_VERTEX,
    fragmentShader: SHELL_FRAGMENT
  });

  /** @param {object} state { seed, form, dissolve, sink, shimmerTime, sweep, flash } */
  material.userData.sync = (state) => {
    const c = settings.stillpoint;
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = state.seed;
    u.uForm.value = state.form;
    u.uDissolve.value = state.dissolve;
    u.uDissolveEdge.value = c.dissolveEdge;
    u.uSink.value = state.sink;
    u.uEdgeWidth.value = c.edgeWidth;
    u.uEdgeGlow.value = c.edgeGlow * g.glow;
    u.uNodeGlow.value = c.nodeGlow * g.glow;
    u.uFillGlow.value = c.fillGlow;
    u.uFresnelPower.value = c.fresnelPower;
    u.uFresnelGlow.value = c.fresnelGlow * g.fresnel;
    u.uShimmerTime.value = state.shimmerTime;
    u.uShimmerScale.value = c.shimmerScale * g.noiseFrequency;
    u.uShimmerAmount.value = c.shimmerAmount * g.noiseStrength;
    u.uBackFace.value = c.backFace;
    u.uOpacity.value = c.shellOpacity * g.opacity;
    u.uFlash.value = state.flash;
    u.uPanelOpacity.value = c.panelOpacity;
    u.uPanelGlow.value = c.panelGlow * g.glow;
    u.uSweep.value = state.sweep;
    u.uSweepGlow.value = c.sweepGlow;
    u.uSweepTrail.value = c.sweepTrail;
    u.uGlint.value = c.panelGlint;
    u.uSaturation.value = c.panelSaturation;
    u.uLightCap.value = c.panelLightCap;
    u.uFrameDeep.value = c.frameDeep;
    u.uColorEdge.value.copy(getColor(c.colorEdge));
    u.uColorNode.value.copy(getColor(c.colorNode));
    u.uColorFill.value.copy(getColor(c.colorFill));
    u.uColorDeep.value.copy(getColor(c.colorPanelDeep));
    u.uColorRim.value.copy(getColor(c.colorRim));
    u.uColorBurn.value.copy(getColor(c.colorBurn));
  };

  return material;
}

/* ==================================================================== */
/* the floor under the lattice                                            */
/* ==================================================================== */

/**
 * Concentric **dilation rings** crowding toward the centre (spaced by a
 * power curve, so they read as time getting thicker inward) and creeping
 * slowly *inward*, crossed by spokes; torn patches where the debris left,
 * glowing; and a hard outer boundary. Fades in with the lattice's form.
 */
const FLOOR_VERTEX = /* glsl */ `
  uniform float uQuadSize;
  varying vec2 vLocal;
  void main() {
    vLocal = (uv - 0.5) * uQuadSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;
  uniform float uRings;
  uniform float uRingPhase;
  uniform float uSpokes;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uForm;
  uniform float uFade;
  uniform float uFlash;
  uniform float uSeed;
  uniform vec3  uColor;
  uniform vec3  uColorHot;
  uniform vec3  uColorDeep;
  uniform float uDeep;
  uniform float uTele;
  uniform float uGlobalGlow;

  varying vec2 vLocal;

  ${noiseGLSL}

  void main() {
    float r = length(vLocal) / max(uRadius, 1e-3);
    if (r > 2.0) discard;
    float ang = atan(vLocal.y, vLocal.x);
    float reveal = 1.0 - smoothstep(uForm * 1.05 - 0.08, uForm * 1.05, r);

    // Rings crowd toward the middle: equal steps in sqrt(r).
    float q = pow(r, 0.55) * max(uRings, 1.0) + uRingPhase;
    float aaq = fwidth(q) * 1.2;
    float ring = 1.0 - smoothstep(0.04, 0.04 + aaq, abs(fract(q) - 0.5) - 0.42);
    ring *= smoothstep(0.08, 0.2, r);
    float n = max(3.0, floor(uSpokes + 0.5));
    float sp = abs(fract(ang / 6.2831853 * n) - 0.5) * r * 6.2831853 / n * uRadius;
    float spoke = (1.0 - smoothstep(0.01, 0.03, sp)) * smoothstep(0.15, 0.4, r) * 0.6;
    float boundary = exp(-pow((r - 1.0) * uRadius / 0.04, 2.0));
    float torn = smoothstep(0.55, 0.85, snoise(vec3(vLocal * 1.8, uSeed))) * (1.0 - smoothstep(0.7, 1.0, r));
    float core = exp(-r * r * 8.0) * 0.6;

    float inDisc = 1.0 - smoothstep(1.0, 1.02, r);
    float light = (ring * 0.6 + spoke + boundary * 1.6 + torn * 0.8 + core) * reveal * inDisc;
    vec3 color = mix(uColor, uColorHot, clamp(boundary + core + torn * 0.5 + uFlash, 0.0, 1.0)) * light;

    // The telegraph while the seed is in flight: a ring closing on the mark
    // over a darkening disc.
    float pre = 1.0 - step(0.001, uForm);
    float ringAt = 1.0 + (1.0 - uTele) * 0.8;
    float tele = exp(-pow((r - ringAt) * uRadius / 0.06, 2.0)) * uTele * pre;
    color += uColor * tele * 1.5;

    // The deep stop is the floor's mass: the stilled ground goes dark indigo
    // (premultiplied "over"), and the rings burn on top of it.
    float deep = uDeep * inDisc * max(reveal, uTele * pre * 0.6) * (0.8 + 0.2 * snoise(vec3(vLocal * 1.3, uSeed + 3.0)));
    float a = clamp(deep, 0.0, 1.0) * uFade * uOpacity;
    vec3 outC = uColorDeep * a + color * uGlow * uGlobalGlow * uFade * uOpacity * (1.0 + uFlash * 2.0);
    if (a < 0.003 && dot(outC, outC) < 1e-5) discard;
    gl_FragColor = vec4(outC, a);
  }
`;

export function createStillpointFloorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 8 },
      uRadius: { value: 3 },
      uRings: { value: 7 },
      uRingPhase: { value: 0 },
      uSpokes: { value: 12 },
      uGlow: { value: 1.5 },
      uOpacity: { value: 1 },
      uForm: { value: 0 },
      uFade: { value: 1 },
      uFlash: { value: 0 },
      uSeed: { value: 0 },
      uColor: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorDeep: { value: new Color() },
      uDeep: { value: 0.6 },
      uTele: { value: 0 }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} state { quadSize, radius, ringPhase, form, fade, flash, seed } */
  material.userData.sync = (state) => {
    const c = settings.stillpoint;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize;
    u.uRadius.value = state.radius;
    u.uRings.value = c.floorRings;
    u.uRingPhase.value = state.ringPhase;
    u.uSpokes.value = c.floorSpokes;
    u.uGlow.value = c.floorGlow * g.glow;
    u.uOpacity.value = c.floorOpacity * g.opacity;
    u.uForm.value = state.form;
    u.uFade.value = state.fade;
    u.uFlash.value = state.flash;
    u.uSeed.value = state.seed;
    u.uColor.value.copy(getColor(c.colorFloor));
    u.uColorHot.value.copy(getColor(c.colorFloorHot));
    u.uColorDeep.value.copy(getColor(c.colorFloorDeep));
    u.uDeep.value = c.floorDeep;
    u.uTele.value = state.tele ?? 0;
  };

  return material;
}

/* ==================================================================== */
/* 2 · the debris                                                         */
/* ==================================================================== */

/**
 * Rock: opaque, flat-shaded stone — lit by the sun, a little sky in it —
 * split by a voronoi web of **cracks** that glow violet with the momentum
 * stored in the piece (`aGlow` per instance: rises as it is caught, peaks in
 * the tremble before the release, burns out in flight).
 */
const ROCK_VERTEX = /* glsl */ `
  attribute float aGlow;
  attribute vec3  aRound;    // the same vertex with no lumps
  uniform float uRough;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying vec3  vNormalL;
  varying float vGlow;

  void main() {
    vec3 p = mix(aRound, position, uRough);
    vLocal = p;
    vNormalL = normal;
    vGlow = aGlow;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ROCK_FRAGMENT = /* glsl */ `
  uniform float uCrackGlow;
  uniform vec3  uColorRock;
  uniform vec3  uColorDeep;
  uniform vec3  uColorCrack;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vGlow;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    // Flat facets from screen derivatives: correct at any blended roughness.
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float grain = fbm3(vLocal * 9.0) * 0.5 + 0.5;
    vec3 base = mix(uColorDeep, uColorRock, grain);
    float lambert = 0.25 + 0.75 * clamp(dot(N, L), 0.0, 1.0);
    vec3 sky = texture2D(uEnvMap, equirectUv(N)).rgb * 0.25;
    vec3 color = base * (lambert + sky);

    vec2 vor = voronoi2(vLocal.xy * 5.0 + vLocal.z * 3.0);
    float crack = 1.0 - smoothstep(0.0, 0.07, vor.x);
    vec2 vor2 = voronoi2(vLocal.zy * 4.0 + 7.0);
    crack = max(crack, 1.0 - smoothstep(0.0, 0.05, vor2.x));
    float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    color = mix(color, uColorDeep * 0.5, crack * 0.6);
    color += uColorCrack * (crack * 1.5 + rim * 0.4) * vGlow * uCrackGlow * uGlobalGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createStillpointRockMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uRough: { value: 0.75 },
      uCrackGlow: { value: 1.5 },
      uColorRock: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorCrack: { value: new Color() }
    }),
    vertexShader: ROCK_VERTEX,
    fragmentShader: ROCK_FRAGMENT
  });
  material.userData.instanced = true;
  material.userData.sync = () => {
    const c = settings.stillpoint;
    const g = settings.global;
    const u = material.uniforms;
    u.uRough.value = c.rockRoughness;
    u.uCrackGlow.value = c.rockGlow * g.glow;
    u.uColorRock.value.copy(getColor(c.colorRock));
    u.uColorDeep.value.copy(getColor(c.colorRockDeep));
    u.uColorCrack.value.copy(getColor(c.colorCrack));
  };
  return material;
}

/**
 * Glass: thin violet-tinted slivers — sky reflected and refracted, a hard
 * fresnel rim, a thin-film sheen, and the same stored-momentum glow along
 * their broken edges.
 */
const GLASS_FRAGMENT = /* glsl */ `
  uniform float uFresnel;
  uniform float uGlow;
  uniform float uOpacity;
  uniform vec3  uColorGlass;
  uniform vec3  uColorRim;
  uniform vec3  uColorCrack;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying vec3  vNormalL;
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
    vec3 refl = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb;
    vec3 refr = texture2D(uEnvMap, equirectUv(refract(-V, N, 0.67))).rgb;
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + ndv * 4.0));
    float spec = pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), 140.0) * 3.0;
    // The broken edge: any face whose object-space normal is not the pane's.
    float edge = 1.0 - smoothstep(0.6, 0.9, abs(normalize(vNormalL).z));
    vec3 color = uColorGlass * refr * 0.6 + refl * (0.15 + fres) + uColorRim * film * fres * 0.6 + vec3(spec);
    color += uColorCrack * (edge * 1.2 + fres * 0.5) * vGlow * uGlow;
    color *= uGlobalGlow;
    float a = clamp(uOpacity + fres * 0.6 + spec * 0.3 + vGlow * edge * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(color, a);
  }
`;

export function createStillpointGlassMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uRough: { value: 1 },
      uFresnel: { value: 2 },
      uGlow: { value: 1.4 },
      uOpacity: { value: 0.45 },
      uColorGlass: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorCrack: { value: new Color() }
    }),
    vertexShader: ROCK_VERTEX,
    fragmentShader: GLASS_FRAGMENT
  });
  material.userData.instanced = true;
  material.userData.sync = () => {
    const c = settings.stillpoint;
    const g = settings.global;
    const u = material.uniforms;
    u.uFresnel.value = c.glassFresnel * g.fresnel;
    u.uGlow.value = c.glassGlow * g.glow;
    u.uOpacity.value = c.glassOpacity * g.opacity;
    u.uColorGlass.value.copy(getColor(c.colorGlass));
    u.uColorRim.value.copy(getColor(c.colorGlassRim));
    u.uColorCrack.value.copy(getColor(c.colorCrack));
  };
  return material;
}

/* ==================================================================== */
/* 5 · the dilation lens                                                  */
/* ==================================================================== */

/**
 * LAYER.DISTORTION. While time is stopped: a slow, heavy **drag** inward —
 * the image pulled a little toward the stillpoint and smeared round it, as if
 * light were slow to leave. At the release: a hard ring pushed outward. Same
 * output encoding as `createAcidFumeMaterial`.
 */
const LENS_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy * 2.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize * 2.0;
    gl_Position = projectionMatrix * mv;
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uDrag;
  uniform float uSwirl;
  uniform float uPhase;
  uniform float uShock;
  uniform float uShockAt;
  uniform vec2  uResolution;
  uniform float uShaderIntensity;

  varying vec2 vLocal;

  void main() {
    float len = length(vLocal);
    if (len > 1.0) discard;
    vec2 dir = vLocal / max(len, 1e-4);
    vec2 tang = vec2(-dir.y, dir.x);
    float body = smoothstep(0.0, 0.5, len) * (1.0 - smoothstep(0.6, 1.0, len));
    float pulse = 0.85 + 0.15 * sin(len * 12.0 - uPhase);
    vec2 offset = (-dir + tang * uSwirl) * uDrag * body * pulse;
    float ring = exp(-pow((len - uShockAt) / 0.07, 2.0)) * uShock;
    offset += dir * ring;
    float strength = length(offset);
    float mask = 1.0 - smoothstep(0.85, 1.0, len);
    if (strength * mask < 0.002) discard;
    vec2 o = offset / max(strength, 1e-4);
    float aspect = max(uResolution.x, 1.0) / max(uResolution.y, 1.0);
    o.x /= aspect;
    gl_FragColor = vec4(o * 0.5 + 0.5, strength * uShaderIntensity, mask);
  }
`;

export function createStillpointLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 4 },
      uDrag: { value: 0 },
      uSwirl: { value: 0.25 },
      uPhase: { value: 0 },
      uShock: { value: 0 },
      uShockAt: { value: 0 }
    }),
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} state { size, drag, phase, shock, shockAt } */
  material.userData.sync = (state) => {
    const c = settings.stillpoint;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = Math.max(0.1, state.size);
    u.uDrag.value = state.drag * c.lensStrength * g.distortion;
    u.uSwirl.value = c.lensSwirl;
    u.uPhase.value = state.phase;
    u.uShock.value = state.shock * c.lensShock * g.distortion;
    u.uShockAt.value = state.shockAt;
  };

  return material;
}

/* ==================================================================== */
/* the seed of stillness (the travel)                                     */
/* ==================================================================== */

/**
 * The seed carried from the hand to the circle: a faceted violet crystal
 * with a deep indigo body, saturated facets where the sun catches them, a
 * pale rim and a slow white-hot heart that beats at a dragging tempo.
 * Premultiplied "over", so it is a solid thing in the air rather than a glow.
 */
const SEED_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SEED_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uGlow;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorPale;
  uniform vec3  uColorCore;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec3 vWorld;
  varying vec3 vLocal;

  void main() {
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 2.5);
    float sun = clamp(dot(N, normalize(uLightDir)) * 0.5 + 0.5, 0.0, 1.0);
    float beat = 0.6 + 0.4 * sin(uTime * 3.0);
    vec3 body = mix(uColorDeep, uColorBody, sun * 0.8);
    vec3 light = uColorPale * fres * 1.6 + uColorCore * pow(ndv, 6.0) * beat * 2.0;
    float a = (0.85 + 0.15 * fres) * uFade;
    gl_FragColor = vec4(body * a + light * uGlow * uGlobalGlow * uFade, a);
  }
`;

export function createStillpointSeedMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    toneMapped: false,
    extensions: { derivatives: true },
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uGlow: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorPale: { value: new Color() },
      uColorCore: { value: new Color() }
    }),
    vertexShader: SEED_VERTEX,
    fragmentShader: SEED_FRAGMENT
  });
  /** @param {number} fade */
  material.userData.sync = (fade) => {
    const c = settings.stillpoint;
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = fade * g.opacity;
    u.uGlow.value = c.seedGlow * g.glow;
    u.uColorDeep.value.copy(getColor(c.colorPanelDeep));
    u.uColorBody.value.copy(getColor(c.colorFill));
    u.uColorPale.value.copy(getColor(c.colorEdge));
    u.uColorCore.value.copy(getColor(c.colorNode));
  };
  return material;
}
