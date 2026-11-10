import { Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Miasma Spit — the bespoke shaders the bile is drawn with.
 *
 *  - **the glob** (`createBileGlobMaterial`) — a sphere displaced in the vertex
 *    stage into a wobbling blob: a few gaussian lobes that crawl over its
 *    surface (the metaball look — it reads as several blobs fused into one),
 *    surface noise, a squash-and-stretch along its own velocity and a hanging
 *    drip pulled out of its trailing underside. The normal is rebuilt from the
 *    displaced shape by finite differences, so the lighting follows the wobble.
 *    The fragment is a viscous translucent liquid: a murky body with swirling
 *    bands of darker bile, a hot inner glow where the blob is thickest, gas
 *    bubbles caught inside it (voronoi specks drifting up), a wet specular
 *    highlight and a bright toxic rim. The same material, instanced, draws the
 *    smaller blobs strung out behind the main one.
 *  - **the sludge pool** (`createSludgePoolMaterial`) — the ground treatment.
 *    A noise-edged pool with runnels splashed out of it, its surface a slow
 *    domain-warped flow lit through a normal rebuilt from its height field.
 *    Bubbles are voronoi cells that swell into domes and pop into a bright
 *    ring; an oily thin-film sheen rides the flow; and outside the liquid the
 *    floor is *eaten* — a band of dark stain pitted with corroded holes, with a
 *    glowing seam where the acid is working. It evaporates on a noise
 *    threshold and leaves the stain behind to fade.
 *  - **hiss marks** (`createSpatterMaterial`) — instanced floor spots where a
 *    drip landed: a ragged splat that flares green as it hisses and leaves a
 *    small etched burn.
 *  - **the splash crown** (`createSplashCrownMaterial`) — an open tube bent in
 *    the vertex stage into a crown of liquid thrown up by the impact, fingers
 *    round its lip, rising, falling back and tearing apart from the top.
 *  - **the fumes** (`createFumeWarpMaterial`) — a camera-facing proxy on
 *    `LAYER.DISTORTION` over the pool: the acrid air shimmering as it rises.
 *
 * Every material reads `settings.miasma` in `userData.sync(state)`; `state`
 * carries only what the ability knows that the settings do not.
 */

/* -------------------------------------------------------------------- */
/* The glob                                                             */
/* -------------------------------------------------------------------- */

const GLOB_VERTEX = /* glsl */ `
  uniform float uRadius;       // metres
  uniform float uForm;         // 0..1 grown off the hand
  uniform float uWobble;       // surface noise, × radius
  uniform float uWobbleScale;
  uniform float uLobes;        // crawling lobes, × radius
  uniform float uPhase;        // integrated on the CPU
  uniform float uSeed;
  uniform vec3  uVelDir;       // unit, world (the mesh is never rotated)
  uniform float uStretch;      // 0.. elongation along the velocity
  uniform float uDrip;         // 0.. how far the hanging drip is pulled out, × radius
  uniform float uDripThin;     // how thin its neck is

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vViewZ;

  ${noiseGLSL}

  /** The trailing underside: opposite the flight, and down. */
  vec3 tailDir() {
    return normalize(-uVelDir + vec3(0.0, -0.8, 0.0));
  }

  vec3 shape(vec3 n) {
    float d = uWobble * snoise(n * uWobbleScale + vec3(uSeed, uPhase * 0.7, -uPhase * 0.4));
    // Four lobes crawl over the surface — fused blobs, not one ball.
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec3 c = normalize(vec3(
        sin(uPhase * (0.9 + fi * 0.37) + fi * 2.1 + uSeed),
        cos(uPhase * (0.7 + fi * 0.29) + fi * 1.3),
        sin(uPhase * (0.8 + fi * 0.21) + fi * 4.7 - uSeed)));
      d += uLobes * exp(-(1.0 - dot(n, c)) * 7.0) * (0.55 + 0.45 * sin(uPhase * 1.7 + fi * 1.9));
    }
    float r = uRadius * max(uForm, 0.001) * (1.0 + d);
    vec3 p = n * r;

    // Squash and stretch: long along the flight, thinner across it.
    float along = dot(p, uVelDir);
    vec3 across = p - uVelDir * along;
    p = uVelDir * along * (1.0 + uStretch) + across * (1.0 - uStretch * 0.35);

    // The drip: the trailing underside pulled out into a tapering string.
    vec3 t = tailDir();
    float k = max(dot(n, t), 0.0);
    float tail = pow(k, 5.0);
    float neck = pow(k, 2.0);
    p += t * tail * uDrip * uRadius * uForm;
    vec3 side = p - t * dot(p, t);
    p -= side * neck * clamp(uDrip, 0.0, 1.0) * uDripThin;
    return p;
  }

  void main() {
    vec3 n = normalize(position);
    vec3 p = shape(n);

    // Rebuild the normal off the displaced surface.
    vec3 helper = abs(n.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t1 = normalize(cross(n, helper));
    vec3 t2 = cross(n, t1);
    float e = 0.04;
    vec3 pa = shape(normalize(n + t1 * e));
    vec3 pb = shape(normalize(n + t2 * e));
    vec3 normal = normalize(cross(pa - p, pb - p));
    if (dot(normal, n) < 0.0) normal = -normal;

    vec4 local = vec4(p, 1.0);
    vec3 nl = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      nl = mat3(instanceMatrix) * nl;
    #endif
    vec4 world = modelMatrix * local;
    vWorld = world.xyz;
    vLocal = p / max(uRadius, 0.01);
    vNormalW = normalize(mat3(modelMatrix) * nl);
    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const GLOB_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uFlow;          // integrated swirl
  uniform float uSwirlScale;
  uniform float uMurk;          // 0..1 how much dark bile swirls through it
  uniform float uInnerGlow;
  uniform float uRimGlow;
  uniform float uRimPower;
  uniform float uSpecular;
  uniform float uGloss;
  uniform float uOpacity;       // body opacity at the centre
  uniform float uBubbles;       // trapped gas
  uniform float uBubbleScale;
  uniform float uSoftFade;
  uniform float uFade;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  uniform vec3  uColorGlow;
  uniform vec3  uColorRim;

  uniform vec3      uLightDir;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (!gl_FrontFacing) N = -N;
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, max(uRimPower, 0.2));

    // Bands of darker bile turning slowly inside it.
    vec3 q = vLocal * uSwirlScale;
    q.xz = rot2(uFlow * 0.6 + q.y * 0.8) * q.xz;
    float bands = fbm3(q + vec3(0.0, uFlow, uSeed));
    bands = smoothstep(-0.35, 0.55, bands);

    vec3 col = mix(uColorBody, uColorDeep, bands * uMurk);

    // Thick in the middle, so it glows from inside there.
    float thick = pow(ndv, 1.6);
    col += uColorGlow * uInnerGlow * thick * (0.55 + 0.45 * (1.0 - bands)) * uShaderIntensity;

    // Trapped gas: bright specks that drift up through it.
    vec2 cell = voronoi2(vec2(vLocal.x + vLocal.z * 0.7, vLocal.y - uFlow * 0.8) * uBubbleScale + uSeed);
    float bubble = (1.0 - smoothstep(0.06, 0.16, cell.x)) * step(0.55, cell.y);
    col += uColorGlow * bubble * uBubbles * thick * 1.5;

    // Wet: a tight highlight and a hot toxic rim.
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), max(uGloss, 1.0)) * uSpecular;
    col += vec3(spec);
    col += uColorRim * fres * uRimGlow;

    float alpha = mix(uOpacity, 1.0, fres) + spec * 0.5;
    alpha *= uFade;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * The glob of bile. `instanced` builds the copy the trailing blobs use: the
 * same shape and look, placed by `instanceMatrix`, a little calmer.
 */
export function createBileGlobMaterial(instanced = false) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRadius: { value: 0.35 },
      uForm: { value: 1 },
      uWobble: { value: 0.1 },
      uWobbleScale: { value: 2 },
      uLobes: { value: 0.2 },
      uPhase: { value: 0 },
      uSeed: { value: 0 },
      uVelDir: { value: new Vector3(0, 0, 1) },
      uStretch: { value: 0 },
      uDrip: { value: 0 },
      uDripThin: { value: 0.7 },
      uFlow: { value: 0 },
      uSwirlScale: { value: 1.6 },
      uMurk: { value: 0.6 },
      uInnerGlow: { value: 1.5 },
      uRimGlow: { value: 1.5 },
      uRimPower: { value: 2.5 },
      uSpecular: { value: 1.2 },
      uGloss: { value: 60 },
      uOpacity: { value: 0.7 },
      uBubbles: { value: 1 },
      uBubbleScale: { value: 4 },
      uSoftFade: { value: 0.2 },
      uFade: { value: 1 },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: GLOB_VERTEX,
    fragmentShader: GLOB_FRAGMENT
  });

  /** @param {object} state { radius, form, phase, flow, seed, velDir, stretch, drip, fade } */
  material.userData.sync = (state) => {
    const c = settings.miasma;
    const g = settings.global;
    const u = material.uniforms;
    // The trailing blobs are scaled by their instance matrix; they wobble less.
    const calm = instanced ? c.blobWobble : 1;
    u.uRadius.value = instanced ? 1 : state.radius;
    u.uForm.value = state.form;
    u.uWobble.value = c.globWobble * calm * g.noiseStrength;
    u.uWobbleScale.value = c.globWobbleScale * g.noiseFrequency;
    u.uLobes.value = c.globLobes * calm * g.noiseStrength;
    u.uPhase.value = state.phase;
    u.uSeed.value = state.seed;
    u.uVelDir.value.copy(state.velDir);
    u.uStretch.value = state.stretch * (instanced ? 0.5 : 1);
    u.uDrip.value = instanced ? 0 : state.drip;
    u.uDripThin.value = c.dripNeck;
    u.uFlow.value = state.flow;
    u.uSwirlScale.value = c.globSwirlScale * g.noiseFrequency;
    u.uMurk.value = c.globMurk;
    u.uInnerGlow.value = c.globInnerGlow * g.glow;
    u.uRimGlow.value = c.globRimGlow * g.fresnel * g.glow;
    u.uRimPower.value = c.globRimPower;
    u.uSpecular.value = c.globSpecular;
    u.uGloss.value = c.globGloss;
    u.uOpacity.value = c.globOpacity * g.opacity;
    u.uBubbles.value = c.globBubbles;
    u.uBubbleScale.value = c.globBubbleScale;
    u.uSoftFade.value = 0.15;
    u.uFade.value = state.fade;
    u.uColorBody.value.copy(getColor(c.colorA));
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorGlow.value.copy(getColor(c.colorGlow));
    u.uColorRim.value.copy(getColor(c.colorB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The sludge pool                                                      */
/* -------------------------------------------------------------------- */

/**
 * A raw unit PlaneGeometry (XY, ±0.5) laid flat round `uCentre`. The quad's
 * size follows the sliders through `uQuad`, so nothing is baked in.
 */
const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uQuad;        // full side of the quad, metres
  uniform float uLift;

  varying vec2 vFlat;         // metres from the centre, x / z
  varying vec3 vWorld;

  void main() {
    vec2 p = position.xy * uQuad;
    vec3 world = vec3(uCentre.x + p.x, uLift, uCentre.z + p.y);
    vFlat = p;
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;        // the liquid's radius right now
  uniform float uEdgeNoise;     // how ragged its edge is, × radius
  uniform float uEdgeScale;
  uniform float uRunnels;       // splash runnels thrown out of it, × radius
  uniform float uRunnelCount;
  uniform float uFlow;          // integrated surface flow
  uniform float uFlowScale;
  uniform float uBumps;         // relief of the surface
  uniform float uBubblePhase;   // integrated bubble clock
  uniform float uBubbleScale;
  uniform float uBubbleSize;
  uniform float uBubbleDensity;
  uniform float uPopGlow;
  uniform float uSheen;
  uniform float uSheenScale;
  uniform float uSpecular;
  uniform float uDepthFalloff;  // metres from the edge to full depth
  uniform float uEdgeGlow;
  uniform float uEdgeWidth;
  uniform float uCorrode;       // metres of eaten floor outside the liquid
  uniform float uCorrodeDark;
  uniform float uPitScale;
  uniform float uPits;
  uniform float uEvap;          // 0 full .. 1 gone (the liquid)
  uniform float uStainFade;     // 0 .. 1 the stain going too
  uniform float uSplash;        // 0..1 age of the impact ripple
  uniform float uOpacity;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorFoam;
  uniform vec3  uColorGlow;
  uniform vec3  uColorStain;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vFlat;
  varying vec3 vWorld;

  ${noiseGLSL}

  /** Signed distance to the pool's ragged edge, metres (<0 inside). */
  float poolEdge(vec2 p, out float runnel) {
    float r = length(p);
    vec2 dir = p / max(r, 1e-4);
    float rag = fbm3(vec3(dir * uEdgeScale, uSeed)) * uEdgeNoise;
    // Runnels: narrow fingers of sludge splashed outward.
    float spoke = snoise(vec3(dir * uRunnelCount * 0.5, uSeed * 1.7));
    spoke = pow(max(spoke, 0.0), 3.0);
    runnel = spoke;
    float R = uRadius * (1.0 + rag + spoke * uRunnels);
    return r - R;
  }

  /** The surface relief: a slow, domain-warped flow. */
  float height(vec2 p) {
    vec2 w = vec2(snoise(vec3(p * uFlowScale * 0.5, uFlow * 0.3 + uSeed)),
                  snoise(vec3(p * uFlowScale * 0.5 + 17.0, uFlow * 0.3 - uSeed)));
    return fbm3(vec3((p + w * 0.6) * uFlowScale, uFlow * 0.5));
  }

  void main() {
    vec2 p = vFlat;
    float runnel;
    float sd = poolEdge(p, runnel);

    // Outside everything the quad covers: nothing.
    if (sd > uCorrode + 0.3) discard;

    /* ---------------- the liquid ---------------- */
    // Evaporating: eaten on a noise threshold, from the thin edge inward.
    float evN = snoise(vec3(p * 1.3, uSeed * 3.0)) * 0.5 + 0.5;
    float depthK = clamp(-sd / max(uDepthFalloff, 0.02), 0.0, 1.0);
    float evKey = mix(evN, depthK, 0.45);
    float keep = uEvap <= 0.0 ? 1.0 : smoothstep(uEvap * 1.15 - 0.08, uEvap * 1.15 + 0.04, evKey);

    float liquid = (1.0 - smoothstep(-0.04, 0.03, sd)) * keep;

    // Bubbles: voronoi cells swell into domes and pop.
    vec2 bp = p * uBubbleScale + vec2(uSeed, -uSeed * 0.7) + vec2(0.0, uFlow * 0.15);
    vec2 cell = voronoi2(bp);
    float present = step(1.0 - uBubbleDensity, fract(cell.y * 13.7));
    float cycle = fract(cell.y * 7.31 + uBubblePhase * (0.6 + cell.y * 0.8));
    float grow = smoothstep(0.0, 0.85, cycle);
    float popT = smoothstep(0.85, 1.0, cycle);
    float br = uBubbleSize * (0.45 + 0.55 * fract(cell.y * 31.1)) * grow * (1.0 - popT);
    float dome = present * (1.0 - smoothstep(br * 0.65, br, cell.x)) * step(0.001, br);
    float ring = present * popT * (1.0 - smoothstep(0.0, 0.05, abs(cell.x - uBubbleSize * (0.4 + popT * 0.6))));
    ring *= 1.0 - popT;
    dome *= depthK;
    ring *= depthK;

    // The relief, and a normal off it.
    float e = 0.06;
    float h0 = height(p) + dome * 1.5;
    float hx = height(p + vec2(e, 0.0));
    float hz = height(p + vec2(0.0, e));
    vec3 N = normalize(vec3((h0 - hx) * uBumps / e, 1.0, (h0 - hz) * uBumps / e));

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float ndl = max(dot(N, L), 0.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 70.0) * uSpecular;

    vec3 col = mix(uColorBody, uColorDeep, smoothstep(0.0, 1.0, depthK));
    col *= 0.55 + 0.45 * ndl;
    col = mix(col, uColorFoam, dome * 0.7);

    // An oily thin-film sheen riding the flow.
    float film = h0 * uSheenScale + dot(N.xz, vec2(3.0, 2.0)) + uFlow * 0.2;
    vec3 irid = 0.5 + 0.5 * cos(6.2831 * (film + vec3(0.0, 0.33, 0.67)));
    // Kept close to the bile's own hue: an oily slick, not a rainbow.
    irid = mix(uColorGlow, irid, 0.35);
    float fres = pow(1.0 - max(dot(vec3(0.0, 1.0, 0.0), V), 0.0), 2.0);
    col += irid * uSheen * (0.35 + 0.65 * fres) * depthK * uShaderIntensity;
    col += vec3(spec);
    col += uColorGlow * ring * uPopGlow;

    // The impact ripple runs out to the rim once.
    float rr = length(p) / max(uRadius, 0.05);
    float ripple = uSplash < 1.0 ? exp(-pow((rr - uSplash * 1.1) * 9.0, 2.0)) * (1.0 - uSplash) : 0.0;
    col += uColorGlow * ripple * 1.5 * liquid;

    /* ---------------- the eaten floor ---------------- */
    // A band outside the liquid, pitted, with a seam glowing where it works.
    float band = 1.0 - smoothstep(0.0, max(uCorrode, 0.01), sd + snoise(vec3(p * 2.2, uSeed)) * uCorrode * 0.35);
    vec2 pit = voronoi2(p * uPitScale + uSeed * 3.0);
    float holes = (1.0 - smoothstep(0.12, 0.28, pit.x)) * step(0.4, pit.y) * uPits;
    float stain = clamp(band * (0.55 + 0.45 * holes), 0.0, 1.0);
    stain *= 1.0 - uStainFade;
    // The seam: a glow along the liquid's edge (and where it has just left).
    float seam = exp(-abs(sd) / max(uEdgeWidth, 0.005)) * (0.4 + 0.6 * keep) * (1.0 - uStainFade);
    float seamFlicker = 0.75 + 0.25 * snoise(vec3(p * 4.0, uTime * 2.0));
    vec3 glow = uColorGlow * seam * uEdgeGlow * seamFlicker;
    // Where the liquid is going, it leaves the corroded floor behind.
    float leftBehind = (1.0 - keep) * (1.0 - smoothstep(-0.04, 0.03, sd)) * (1.0 - uStainFade);

    vec3 outCol = mix(uColorStain, col, liquid);
    float a = max(liquid, max(stain, leftBehind * 0.9) * uCorrodeDark);
    outCol = mix(uColorStain * (1.0 - holes * 0.5), outCol, liquid);
    outCol += glow * uGlobalGlow;
    a = max(a, clamp(seam * uEdgeGlow * 0.4, 0.0, 1.0));

    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(outCol, clamp(a, 0.0, 1.0));
  }
`;

/** The sludge on the floor. Normal blending: the stain has to be *dark*. */
export function createSludgePoolMaterial() {
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
      uQuad: { value: 8 },
      uLift: { value: 0.014 },
      uSeed: { value: 0 },
      uRadius: { value: 0 },
      uEdgeNoise: { value: 0.2 },
      uEdgeScale: { value: 2 },
      uRunnels: { value: 0.4 },
      uRunnelCount: { value: 9 },
      uFlow: { value: 0 },
      uFlowScale: { value: 1.2 },
      uBumps: { value: 0.1 },
      uBubblePhase: { value: 0 },
      uBubbleScale: { value: 3 },
      uBubbleSize: { value: 0.3 },
      uBubbleDensity: { value: 0.5 },
      uPopGlow: { value: 2 },
      uSheen: { value: 0.3 },
      uSheenScale: { value: 1.5 },
      uSpecular: { value: 1 },
      uDepthFalloff: { value: 0.8 },
      uEdgeGlow: { value: 2 },
      uEdgeWidth: { value: 0.06 },
      uCorrode: { value: 0.5 },
      uCorrodeDark: { value: 0.8 },
      uPitScale: { value: 7 },
      uPits: { value: 1 },
      uEvap: { value: 0 },
      uStainFade: { value: 0 },
      uSplash: { value: 1 },
      uOpacity: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorFoam: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorStain: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: POOL_FRAGMENT
  });

  /** @param {object} state { centre, quad, radius, flow, bubblePhase, evap, stainFade, splash, seed } */
  material.userData.sync = (state) => {
    const c = settings.miasma;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uQuad.value = state.quad;
    u.uSeed.value = state.seed;
    u.uRadius.value = state.radius;
    u.uEdgeNoise.value = c.poolRagged * g.noiseStrength * g.randomness;
    u.uEdgeScale.value = c.poolRaggedScale * g.noiseFrequency;
    u.uRunnels.value = c.poolRunnels * g.randomness;
    u.uRunnelCount.value = c.poolRunnelCount;
    u.uFlow.value = state.flow;
    u.uFlowScale.value = c.poolFlowScale * g.noiseFrequency;
    u.uBumps.value = c.poolBumps * g.noiseStrength;
    u.uBubblePhase.value = state.bubblePhase;
    u.uBubbleScale.value = c.poolBubbleScale;
    u.uBubbleSize.value = c.poolBubbleSize;
    u.uBubbleDensity.value = c.poolBubbleDensity;
    u.uPopGlow.value = c.poolPopGlow * g.glow;
    u.uSheen.value = c.poolSheen;
    u.uSheenScale.value = c.poolSheenScale;
    u.uSpecular.value = c.poolSpecular;
    u.uDepthFalloff.value = c.poolDepthFalloff;
    u.uEdgeGlow.value = c.poolEdgeGlow * g.glow;
    u.uEdgeWidth.value = c.poolEdgeWidth;
    u.uCorrode.value = c.corrodeBand;
    u.uCorrodeDark.value = c.corrodeDark;
    u.uPitScale.value = c.corrodePitScale;
    u.uPits.value = c.corrodePits;
    u.uEvap.value = state.evap;
    u.uStainFade.value = state.stainFade;
    u.uSplash.value = state.splash;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uColorDeep.value.copy(getColor(c.colorPoolDeep));
    u.uColorBody.value.copy(getColor(c.colorPoolBody));
    u.uColorFoam.value.copy(getColor(c.colorPoolFoam));
    u.uColorGlow.value.copy(getColor(c.colorGlow));
    u.uColorStain.value.copy(getColor(c.colorStain));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* Hiss marks                                                           */
/* -------------------------------------------------------------------- */

const SPATTER_VERTEX = /* glsl */ `
  attribute vec4 aSpot;       // x, z, radius, age 0..1 (>= 1 is gone)
  attribute float aSeed;
  uniform float uLift;

  varying vec2  vUv;
  varying float vAge;
  varying float vSeed;

  void main() {
    vUv = position.xy * 2.0;  // -1..1
    vAge = aSpot.w;
    vSeed = aSeed;
    float r = aSpot.w < 1.0 ? aSpot.z : 0.0;
    vec3 world = vec3(aSpot.x + position.x * r * 2.0, uLift, aSpot.y + position.y * r * 2.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SPATTER_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uHiss;        // how long the hot flare lasts, 0..1 of a mark's life
  uniform float uGlow;
  uniform float uDark;
  uniform float uOpacity;
  uniform vec3  uColorGlow;
  uniform vec3  uColorStain;
  uniform float uGlobalGlow;

  varying vec2  vUv;
  varying float vAge;
  varying float vSeed;

  ${noiseGLSL}

  void main() {
    if (vAge >= 1.0) discard;
    float r = length(vUv);
    vec2 dir = vUv / max(r, 1e-4);
    // A ragged splat with a few droplets flung round it.
    float rag = snoise(vec3(dir * 2.5, vSeed * 13.0)) * 0.22;
    float body = 1.0 - smoothstep(0.42 + rag, 0.5 + rag, r);
    vec2 cell = voronoi2(vUv * 3.2 + vSeed * 7.0);
    float drops = (1.0 - smoothstep(0.08, 0.16, cell.x)) * step(0.6, cell.y) * (1.0 - smoothstep(0.6, 1.0, r));
    float shape = max(body, drops);
    if (shape < 0.01) discard;

    // Hot while it hisses, then an etched burn that fades.
    float hot = 1.0 - smoothstep(0.0, max(uHiss, 0.01), vAge);
    float fade = 1.0 - smoothstep(0.55, 1.0, vAge);
    float rim = smoothstep(0.2, 0.5, r) * body;
    vec3 col = uColorStain + uColorGlow * hot * uGlow * (0.6 + 0.8 * rim) * uGlobalGlow;
    float a = shape * fade * max(uDark, hot) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createSpatterMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: sharedUniforms({
      uLift: { value: 0.018 },
      uHiss: { value: 0.3 },
      uGlow: { value: 3 },
      uDark: { value: 0.6 },
      uOpacity: { value: 1 },
      uColorGlow: { value: new Color() },
      uColorStain: { value: new Color() }
    }),
    vertexShader: SPATTER_VERTEX,
    fragmentShader: SPATTER_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.miasma;
    const g = settings.global;
    const u = material.uniforms;
    u.uHiss.value = c.hissFlare;
    u.uGlow.value = c.hissGlow * g.glow;
    u.uDark.value = c.hissStain;
    u.uOpacity.value = g.opacity;
    u.uColorGlow.value.copy(getColor(c.colorGlow));
    u.uColorStain.value.copy(getColor(c.colorStain));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The splash crown                                                     */
/* -------------------------------------------------------------------- */

/**
 * An open CylinderGeometry (height 1, radius 1, centred) bent into a crown.
 * `uv.x` runs round it, `uv.y` from the floor to the lip.
 */
const CROWN_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uRadius;      // at the floor, metres
  uniform float uFlare;       // how far the lip leans out, × radius
  uniform float uHeight;      // metres, already enveloped
  uniform float uFingers;     // count round the lip
  uniform float uFingerLen;   // × height
  uniform float uSeed;
  uniform float uAge;         // 0..1

  varying vec2  vUv;
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vFinger;

  ${noiseGLSL}

  void main() {
    float a = uv.x * 6.2831853;
    float v = uv.y;
    // Fingers round the lip: sharp peaks of liquid that will break into drops.
    float f = 0.5 + 0.5 * sin(a * uFingers + snoise(vec3(cos(a), sin(a), uSeed)) * 2.0);
    f = pow(f, 6.0);
    vFinger = f;
    float h = uHeight * (v + v * v * f * uFingerLen);
    float lean = mix(1.0, 1.0 + uFlare, v * v) * (1.0 + 0.25 * uAge);
    float wob = 1.0 + 0.08 * snoise(vec3(cos(a) * 2.0, sin(a) * 2.0, v + uSeed));
    float r = uRadius * lean * wob;
    vec3 world = uCentre + vec3(cos(a) * r, h, sin(a) * r);
    vWorld = world;
    vUv = vec2(uv.x, v);
    // Outward and a little up, leaning with the flare.
    vNormalW = normalize(vec3(cos(a), -uFlare * v * 0.8, sin(a)));
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const CROWN_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uAge;
  uniform float uOpacity;
  uniform float uRimGlow;
  uniform float uTear;        // how hard it tears apart from the top
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  uniform vec3  uColorGlow;
  uniform vec3  uColorRim;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec2  vUv;
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying float vFinger;

  ${noiseGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (!gl_FrontFacing) N = -N;
    float fres = pow(1.0 - abs(dot(N, V)), 2.0);

    // Thin sheet: torn from the lip down as it ages.
    float n = fbm3(vec3(vUv.x * 14.0, vUv.y * 3.0 - uAge * 2.0, uSeed)) * 0.5 + 0.5;
    float thr = uAge * uTear * 1.2 + vUv.y * 0.55 - 0.15;
    float keep = smoothstep(thr, thr + 0.08, n);
    float edge = smoothstep(thr - 0.04, thr + 0.02, n) - smoothstep(thr + 0.02, thr + 0.12, n);
    float foot = smoothstep(0.0, 0.12, vUv.y);
    float sheet = keep * foot * (0.55 + 0.45 * vFinger);

    // Sludge, not light: deep bile where the sheet faces you and at its foot,
    // the body where the sun catches it, the pale rim only at grazing angles.
    float wrap = dot(N, normalize(uLightDir)) * 0.5 + 0.5;
    vec3 col = mix(uColorDeep, uColorBody, smoothstep(0.2, 0.95, wrap) * (0.35 + 0.65 * vUv.y));
    col += uColorRim * fres * uRimGlow * 0.6 + uColorGlow * edge * 2.0;
    float a = sheet * mix(0.55, 1.0, fres) * uOpacity * (1.0 - smoothstep(0.75, 1.0, uAge));
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

export function createSplashCrownMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uRadius: { value: 1 },
      uFlare: { value: 0.6 },
      uHeight: { value: 1 },
      uFingers: { value: 12 },
      uFingerLen: { value: 0.6 },
      uSeed: { value: 0 },
      uAge: { value: 0 },
      uOpacity: { value: 0.8 },
      uRimGlow: { value: 1.5 },
      uTear: { value: 1 },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: CROWN_VERTEX,
    fragmentShader: CROWN_FRAGMENT
  });

  /** @param {object} state { centre, age, height, radius, seed } */
  material.userData.sync = (state) => {
    const c = settings.miasma;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(state.centre);
    u.uRadius.value = state.radius;
    u.uFlare.value = c.crownFlare;
    u.uHeight.value = state.height;
    u.uFingers.value = Math.round(c.crownFingers);
    u.uFingerLen.value = c.crownFingerLength;
    u.uSeed.value = state.seed;
    u.uAge.value = state.age;
    u.uOpacity.value = c.crownOpacity * g.opacity;
    u.uRimGlow.value = c.globRimGlow * g.fresnel;
    u.uTear.value = c.crownTear;
    u.uColorBody.value.copy(getColor(c.colorA));
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorGlow.value.copy(getColor(c.colorGlow));
    u.uColorRim.value.copy(getColor(c.colorB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The fumes — LAYER.DISTORTION                                         */
/* -------------------------------------------------------------------- */

const FUME_VERTEX = /* glsl */ `
  uniform float uWidth;
  uniform float uHeight;

  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    // Camera-facing, standing on its foot (the mesh origin is on the floor).
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += vec2(position.x * uWidth, (position.y + 0.5) * uHeight);
    vWorld = (modelMatrix * vec4(position.x * uWidth, (position.y + 0.5) * uHeight, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FUME_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uFalloff;
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.5 - uTime * uSpeed + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(19.3, 7.7, 31.1)));
    vec2 c = (vUv - 0.5) * 2.0;
    // Thick over the pool, thinning as it rises, feathered at the sides.
    float mask = (1.0 - smoothstep(0.3, 1.0, abs(c.x)))
               * (1.0 - smoothstep(0.0, 1.0, pow(clamp(vUv.y, 0.0, 1.0), 1.0 / max(uFalloff, 0.05))))
               * smoothstep(0.0, 0.06, vUv.y);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(n * 0.5 + 0.5, strength, mask);
  }
`;

export function createFumeWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 6 },
      uHeight: { value: 4 },
      uStrength: { value: 1 },
      uScale: { value: 1.6 },
      uSpeed: { value: 1 },
      uFalloff: { value: 1.2 },
      uSeed: { value: 0 }
    }),
    vertexShader: FUME_VERTEX,
    fragmentShader: FUME_FRAGMENT
  });

  /** @param {object} state { width, strength, seed } */
  material.userData.sync = (state) => {
    const c = settings.miasma;
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = state.width;
    u.uHeight.value = c.fumeWarpHeight;
    u.uStrength.value = state.strength * c.fumeWarp * g.distortion;
    u.uScale.value = c.fumeWarpScale * g.noiseFrequency;
    u.uSpeed.value = c.fumeWarpSpeed * g.noiseSpeed;
    u.uFalloff.value = c.fumeWarpFalloff;
    u.uSeed.value = state.seed;
  };

  return material;
}
