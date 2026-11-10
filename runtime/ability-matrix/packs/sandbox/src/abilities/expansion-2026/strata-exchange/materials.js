import { AdditiveBlending, Color, DoubleSide, MeshStandardMaterial, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { patchOnBeforeCompile, replaceChunk } from '../../../utils/shaderPatch.js';
import config from './config.js';

/**
 * Strata Exchange — the bespoke shaders.
 *
 *  - **strata rock** (`createStrataRockMaterial`) — the plugs and the
 *    lodestone. A real `MeshStandardMaterial` (lit by the sun, casts and
 *    receives shadows, on `LAYER.WORLD`) patched so its albedo is *ground*:
 *    a dusty crown, banded sandstone / iron-red / slate strata whose
 *    boundaries wander through noise, fine laminations and grit inside each
 *    band, a dark torn root — and seam light in the grooves between bands
 *    that charges up while the plug is in the air (the "exchange" glow), with
 *    faint ridged veins crawling through the rock at full charge.
 *  - **the socket** (`createSocketMaterial`) — everything the floor does:
 *    the telegraph circle scribing itself during the throw, the glowing kerf,
 *    radial cracks and a dust stain outside it, and inside it an
 *    **interior-mapped pit**: each pixel casts its view ray into a cylinder
 *    `uDepth` deep and shades the wall it hits with the same strata, darker
 *    with depth, its seams glowing — or the pit floor, or the cap of the plug
 *    that currently fills it. No geometry goes under the floor; the hole is
 *    in the shader. On the exit the kerf closes through noise.
 *  - **the exchange arc** (`createArcMaterial`) — a tube built entirely in
 *    the vertex shader on the arc each plug travels, with energy flowing
 *    along it toward the landing socket and a white-hot head that rides
 *    with the plug.
 *  - **the lens** (`createLensMaterial`, `LAYER.DISTORTION`) — the ground
 *    pressure ring at the key and at the slam.
 *
 * Every material reads `settings.strataExchange` in `userData.sync(state)`.
 */

const ID = config.id;

/* -------------------------------------------------------------------- */
/* Strata rock — a patched, lit, shadowing standard material            */
/* -------------------------------------------------------------------- */

const ROCK_VERTEX_HEAD = /* glsl */ `
  attribute float aBand;
  attribute float aSeam;
  attribute float aRoot;
  attribute float aCap;
  varying float vBand;
  varying float vSeam;
  varying float vRoot;
  varying float vCap;
  varying vec3  vObj;
`;

const ROCK_FRAGMENT_HEAD = /* glsl */ `
  uniform float uSeamGlow;
  uniform float uSeamWidth;
  uniform float uCharge;
  uniform float uGrit;
  uniform float uWarp;
  uniform float uNoiseScale;
  uniform float uClock;
  uniform vec3  uTurf;
  uniform vec3  uStrataA;
  uniform vec3  uStrataB;
  uniform vec3  uStrataC;
  uniform vec3  uRootColor;
  uniform vec3  uSeamCore;
  uniform vec3  uSeamTint;
  uniform vec3  uSeamBody;
  varying float vBand;
  varying float vSeam;
  varying float vRoot;
  varying float vCap;
  varying vec3  vObj;
  ${noiseGLSL}

  /** The band palette: sandstone, iron-red, sandstone, slate, iron-red. */
  vec3 strataColor(float band) {
    float i = floor(clamp(band, 0.0, 0.999) * 5.0);
    vec3 c = uStrataA;
    if (i > 0.5) c = uStrataB;
    if (i > 1.5) c = mix(uStrataA, uStrataB, 0.35);
    if (i > 2.5) c = uStrataC;
    if (i > 3.5) c = mix(uStrataB, uStrataC, 0.45);
    return c;
  }
`;

const ROCK_COLOR = /* glsl */ `
  #include <color_fragment>
  {
    vec3 q = vObj * 2.6 * uNoiseScale;
    float grit = fbm3(q * 2.4);
    // Band boundaries wander, and each band holds fine laminations.
    float band = vBand + snoise(vec3(vObj.xz * 1.4, 3.1)) * 0.035 * uWarp;
    vec3 rock = strataColor(band);
    float lam = sin((vObj.y + snoise(q * 0.6) * 0.05 * uWarp) * 70.0);
    rock *= 0.82 + 0.12 * lam + (grit - 0.5) * 0.55 * uGrit;
    rock = mix(rock, uTurf * (0.85 + 0.3 * grit), clamp(vCap, 0.0, 1.0));
    rock = mix(rock, uRootColor * (0.7 + 0.6 * grit), clamp(vRoot, 0.0, 1.0));
    diffuseColor.rgb = rock;
  }
`;

const ROCK_EMISSIVE = /* glsl */ `
  #include <emissivemap_fragment>
  {
    float w = clamp(uSeamWidth, 0.05, 3.0);
    float seam = smoothstep(1.0 - 0.55 * w, 1.0, vSeam);
    float flicker = 0.65 + 0.35 * snoise(vObj * 3.0 + vec3(0.0, uClock * 1.7, 0.0));
    float charge = 1.0 + uCharge;
    vec3 hot = mix(uSeamBody, mix(uSeamTint, uSeamCore, seam), seam);
    totalEmissiveRadiance += hot * seam * flicker * uSeamGlow * charge;
    // At full charge faint ridged veins crawl through the bands.
    float vein = smoothstep(0.9, 0.975, ridged(vObj * 2.2 + vec3(uClock * 0.2), 4)) * (1.0 - vCap) * (1.0 - vRoot);
    totalEmissiveRadiance += uSeamBody * vein * uCharge * uSeamGlow * 0.6;
  }
`;

/**
 * The plugs' and the lodestone's rock. Lit, opaque, shadowing.
 * @param {'plug'|'stone'} role which glow key drives the seams
 */
export function createStrataRockMaterial(role = 'plug') {
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.04, flatShading: false });
  const uniforms = {
    uSeamGlow: { value: 2.4 },
    uSeamWidth: { value: 1 },
    uCharge: { value: 0 },
    uGrit: { value: 1 },
    uWarp: { value: 1 },
    uNoiseScale: { value: 1 },
    uClock: { value: 0 },
    uTurf: { value: new Color() },
    uStrataA: { value: new Color() },
    uStrataB: { value: new Color() },
    uStrataC: { value: new Color() },
    uRootColor: { value: new Color() },
    uSeamCore: { value: new Color() },
    uSeamTint: { value: new Color() },
    uSeamBody: { value: new Color() },
  };
  material.userData.uniforms = uniforms;
  patchOnBeforeCompile(material, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = replaceChunk(shader.vertexShader, '#include <common>', `#include <common>\n${ROCK_VERTEX_HEAD}`);
    shader.vertexShader = replaceChunk(shader.vertexShader, '#include <begin_vertex>',
      '#include <begin_vertex>\n  vBand = aBand; vSeam = aSeam; vRoot = aRoot; vCap = aCap; vObj = position;');
    shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <common>', `#include <common>\n${ROCK_FRAGMENT_HEAD}`);
    shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <color_fragment>', ROCK_COLOR);
    shader.fragmentShader = replaceChunk(shader.fragmentShader, '#include <emissivemap_fragment>', ROCK_EMISSIVE);
  }, 'strata-exchange-rock');
  /** @param {object} s { charge, clock, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = uniforms;
    material.roughness = c.rockRoughness;
    material.metalness = c.rockMetalness;
    u.uSeamGlow.value = (role === 'stone' ? c.stoneGlow : c.seamGlow) * g.glow * g.shaderIntensity * s.fade;
    u.uSeamWidth.value = c.seamWidth;
    u.uCharge.value = s.charge * c.seamCharge;
    u.uGrit.value = c.rockGrit * g.noiseStrength;
    u.uWarp.value = c.strataWarp * g.noiseStrength;
    u.uNoiseScale.value = g.noiseFrequency;
    u.uClock.value = s.clock * g.noiseSpeed;
    u.uTurf.value.copy(getColor(c.colorTurf));
    u.uStrataA.value.copy(getColor(c.colorStrataA));
    u.uStrataB.value.copy(getColor(c.colorStrataB));
    u.uStrataC.value.copy(getColor(c.colorStrataC));
    u.uRootColor.value.copy(getColor(c.colorRoot));
    u.uSeamCore.value.copy(getColor(c.colorCore));
    u.uSeamTint.value.copy(getColor(c.colorTint));
    u.uSeamBody.value.copy(getColor(c.colorBody));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The socket                                                           */
/* -------------------------------------------------------------------- */

const SOCKET_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vCenter;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vCenter = modelMatrix[3].xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SOCKET_FRAGMENT = /* glsl */ `
  uniform float uRadius;      // pit radius (m)
  uniform float uOuter;       // crack reach (m, from the centre)
  uniform float uDepth;       // pit depth (m)
  uniform float uFloor;       // depth of the first thing in the hole (m)
  uniform float uCap;         // 1: that thing is a plug's crown; 0: the empty floor
  uniform float uOpen;        // 0 sealed … 1 the kerf is cut
  uniform float uScribe;      // 0..1 the telegraph circle drawn so far
  uniform float uHeal;        // 0..1 the kerf closing on the exit
  uniform float uPulse;       // a heave of light through the kerf (key / slam)
  uniform float uSeed;
  uniform float uKerfGlow;
  uniform float uKerfWidth;
  uniform float uCrackGlow;
  uniform float uPitShade;
  uniform float uPitSeams;
  uniform float uFade;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform vec3  uTurf;
  uniform vec3  uStrataA;
  uniform vec3  uStrataB;
  uniform vec3  uStrataC;
  uniform vec3  uRootColor;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec3 vWorld;
  varying vec3 vCenter;

  ${noiseGLSL}

  vec3 strata(float band) {
    float i = floor(clamp(band, 0.0, 0.999) * 5.0);
    vec3 c = uStrataA;
    if (i > 0.5) c = uStrataB;
    if (i > 1.5) c = mix(uStrataA, uStrataB, 0.35);
    if (i > 2.5) c = uStrataC;
    if (i > 3.5) c = mix(uStrataB, uStrataC, 0.45);
    return c;
  }

  void main() {
    vec2 p = vWorld.xz - vCenter.xz;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float R = uRadius;
    // The pit's own lip wanders a little, and closes through noise on the exit.
    float lipNoise = snoise(vec3(normalize(p + 1e-4) * 2.0, uSeed)) * 0.04 * R;
    float healN = snoise(vec3(p * 1.7, uSeed + 4.0)) * 0.5 + 0.5;
    float pitR = max(0.0, R * (1.0 - uHeal * (0.75 + 0.5 * healN))) + lipNoise;

    vec4 outCol = vec4(0.0);

    // ---- outside the lip: telegraph, kerf, cracks, stain ----
    float kerfW = max(uKerfWidth, 0.01);
    float kerf = exp(-abs(r - pitR) / kerfW) * uOpen;
    // The telegraph circle draws itself clockwise before the cut.
    float around = fract(0.75 - ang / 6.2831853 + uSeed * 0.13);
    float scribeLine = exp(-abs(r - R) / (kerfW * 0.6)) * step(around, uScribe) * (1.0 - uOpen);
    float scribeHead = exp(-abs(around - uScribe) * 60.0) * exp(-abs(r - R) / (kerfW * 1.5)) * step(0.001, uScribe) * step(uScribe, 0.999) * (1.0 - uOpen);
    // Radial cracks: angular cells, each crack wandering and running out a
    // random fraction of the reach.
    float cells = 11.0;
    float ca = ang / 6.2831853 * cells + snoise(vec3(r * 0.9, 0.0, uSeed)) * 0.35;
    float cell = floor(ca);
    float reach = R + (uOuter - R) * (0.35 + 0.65 * fract(sin((cell + uSeed) * 91.7) * 4375.5));
    float line = exp(-abs(fract(ca) - 0.5) * 55.0 * (0.6 + r / max(uOuter, 0.01)));
    // Broken into segments, like real ground cracks, not a sunburst.
    line *= smoothstep(0.38, 0.62, snoise(vec3(r * 2.2, cell * 1.7, uSeed)) * 0.5 + 0.5);
    float crack = line * step(R, r) * (1.0 - smoothstep(reach * 0.75, reach, r)) * uOpen;
    float crackHeat = exp(-(r - R) / max(0.2, (uOuter - R) * 0.35));
    float stain = (1.0 - smoothstep(R, R + (uOuter - R) * 0.8, r)) * step(R * 0.98, r) * uOpen;
    float heal = 1.0 - uHeal;

    vec3 glowCol = mix(uBody, mix(uTint, uCore, kerf), kerf) * (kerf * uKerfGlow * (1.0 + uPulse * 2.0))
                 + mix(uBody, uTint, crackHeat) * crack * crackHeat * uCrackGlow * (1.0 + uPulse)
                 + uTint * (scribeLine * 1.2 + scribeHead * 3.0) * uKerfGlow;
    float glowA = clamp(kerf + crack * crackHeat + scribeLine + scribeHead, 0.0, 1.0);
    // The ground around a socket is darkened and dusted (the deep tone).
    outCol = vec4(uDeep, stain * 0.55 * heal);
    outCol.rgb = mix(outCol.rgb, glowCol * uGlobalGlow * uShaderIntensity, glowA);
    outCol.a = max(outCol.a, glowA * heal);

    // ---- inside the lip: the interior-mapped pit ----
    if (r < pitR && uOpen > 0.0) {
      vec3 V = normalize(vWorld - cameraPosition);
      vec2 v2 = V.xz;
      float a = max(dot(v2, v2), 1e-5);
      float b = 2.0 * dot(p, v2);
      float c = dot(p, p) - pitR * pitR;
      float t = (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a);
      float vy = min(V.y, -1e-3);
      float wallDepth = -t * vy;
      vec3 col;
      if (wallDepth >= uFloor) {
        // The floor of the hole — empty rubble, or the crown of a plug.
        vec2 q = p + v2 * (uFloor / -vy);
        float n = snoise(vec3(q * 3.0, uSeed));
        vec3 rubble = uRootColor * (0.6 + 0.4 * n) + uBody * smoothstep(0.55, 0.9, n) * 0.6 * uPitSeams;
        vec3 crown = uTurf * (0.75 + 0.25 * n);
        col = mix(rubble, crown, uCap) * mix(1.0, exp(-uFloor * uPitShade), 1.0 - uCap * 0.6);
      } else {
        // A wall: the strata the plug was cut from, darker with depth.
        float d = wallDepth / max(uDepth, 0.01);
        vec2 hit = p + v2 * t;
        float wallAng = atan(hit.y, hit.x);
        float band = d / 0.74 + snoise(vec3(wallAng * 2.0, d * 3.0, uSeed)) * 0.03;
        vec3 rock = strata(band) * (0.8 + 0.25 * snoise(vec3(wallAng * 6.0, d * 14.0, 1.0)));
        // Light falls on the far wall, the near wall is in its own shadow.
        float lit = 0.45 + 0.55 * clamp(dot(-normalize(hit + 1e-4), normalize(uLightDir.xz + 1e-4)), 0.0, 1.0);
        col = rock * lit * 0.75 * exp(-wallDepth * uPitShade);
        // Seams between bands glow, strongest near the lip.
        float seam = exp(-abs(fract(band * 5.0) - 0.0) * 30.0) + exp(-abs(fract(band * 5.0) - 1.0) * 30.0);
        col += mix(uBody, uTint, exp(-wallDepth)) * seam * uPitSeams * uKerfGlow * 0.2 * exp(-wallDepth * 0.8);
      }
      float edge = smoothstep(pitR, pitR - 0.06, r);
      outCol.rgb = mix(outCol.rgb, col, edge);
      outCol.a = max(outCol.a, edge);
      // The kerf burns on the lip, over the pit.
      outCol.rgb += glowCol * uGlobalGlow * uShaderIntensity * kerf;
    }
    outCol.a *= uFade;
    if (outCol.a < 0.003) discard;
    gl_FragColor = outCol;
  }
`;

/** A socket on the floor: telegraph, kerf, cracks and the pit. */
export function createSocketMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRadius: { value: 2 },
      uOuter: { value: 3.6 },
      uDepth: { value: 2 },
      uFloor: { value: 0 },
      uCap: { value: 1 },
      uOpen: { value: 0 },
      uScribe: { value: 0 },
      uHeal: { value: 0 },
      uPulse: { value: 0 },
      uSeed: { value: 0 },
      uKerfGlow: { value: 2.6 },
      uKerfWidth: { value: 0.12 },
      uCrackGlow: { value: 1.4 },
      uPitShade: { value: 0.85 },
      uPitSeams: { value: 1 },
      uFade: { value: 1 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
      uTurf: { value: new Color() },
      uStrataA: { value: new Color() },
      uStrataB: { value: new Color() },
      uStrataC: { value: new Color() },
      uRootColor: { value: new Color() },
    }),
    vertexShader: SOCKET_VERTEX,
    fragmentShader: SOCKET_FRAGMENT,
  });
  /** @param {object} s { radius, outer, depth, floor, cap, open, scribe, heal, pulse, seed, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uRadius.value = s.radius;
    u.uOuter.value = s.outer;
    u.uDepth.value = s.depth;
    u.uFloor.value = s.floor;
    u.uCap.value = s.cap;
    u.uOpen.value = s.open;
    u.uScribe.value = s.scribe;
    u.uHeal.value = s.heal;
    u.uPulse.value = s.pulse;
    u.uSeed.value = s.seed;
    u.uFade.value = s.fade * g.opacity;
    u.uKerfGlow.value = c.kerfGlow * g.glow;
    u.uKerfWidth.value = c.kerfWidth;
    u.uCrackGlow.value = c.crackGlow * g.glow;
    u.uPitShade.value = c.pitShade;
    u.uPitSeams.value = c.pitSeams;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
    u.uTurf.value.copy(getColor(c.colorTurf));
    u.uStrataA.value.copy(getColor(c.colorStrataA));
    u.uStrataB.value.copy(getColor(c.colorStrataB));
    u.uStrataC.value.copy(getColor(c.colorStrataC));
    u.uRootColor.value.copy(getColor(c.colorRoot));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The exchange arc                                                     */
/* -------------------------------------------------------------------- */

const ARC_VERTEX = /* glsl */ `
  attribute vec2 aParam;      // (t along 0..1, around 0..2π)
  uniform vec3  uMid;         // the arc's centre
  uniform vec3  uH;           // centre → start socket
  uniform vec3  uV;           // centre → apex
  uniform float uTube;        // tube radius (m)
  varying float vT;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  void main() {
    float th = aParam.x * 3.14159265;
    vec3 c = uMid + cos(th) * uH + sin(th) * uV;
    vec3 T = normalize(-sin(th) * uH + cos(th) * uV);
    vec3 B = normalize(cross(uH, uV));
    vec3 N = normalize(cross(B, T));
    // Thicker in the middle of the flight, pinched where it meets the sockets.
    float taper = 0.35 + 0.65 * sin(th);
    vec3 n = cos(aParam.y) * N + sin(aParam.y) * B;
    vec3 world = c + n * uTube * taper;
    vT = aParam.x;
    vNormalW = n;
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const ARC_FRAGMENT = /* glsl */ `
  uniform float uDraw;        // 0..1 drawn from the start socket
  uniform float uHead;        // 0..1 where the plug is on the arc
  uniform float uFlow;
  uniform float uGlow;
  uniform float uFade;
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform float uGlobalGlow;
  varying float vT;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    if (vT > uDraw) discard;
    float rim = fresnelTerm(vViewDir, vNormalW, 1.6, 1.0);
    // Energy runs along the arc toward the landing socket.
    float dash = pow(max(0.0, sin((vT * 9.0 - uFlow) * 3.14159265)), 6.0);
    float head = exp(-abs(vT - uHead) * 14.0);
    float tail = smoothstep(uHead - 0.05, uHead - 0.6, vT); // the path behind the plug cools
    float drawEdge = exp(-(uDraw - vT) * 40.0) * step(uDraw, 0.999);
    vec3 col = gradient4(uDeep, uBody, uTint, uCore, clamp(0.35 + 0.4 * dash + 0.6 * head + drawEdge, 0.0, 1.0));
    float a = (0.25 + 0.5 * dash + head * 1.2 + drawEdge) * (1.0 - 0.6 * tail) * (0.4 + 0.6 * rim) * uFade;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** One plug's exchange arc. Additive. */
export function createArcMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uMid: { value: new Vector3() },
      uH: { value: new Vector3(1, 0, 0) },
      uV: { value: new Vector3(0, 1, 0) },
      uTube: { value: 0.07 },
      uDraw: { value: 0 },
      uHead: { value: 0 },
      uFlow: { value: 0 },
      uGlow: { value: 2 },
      uFade: { value: 1 },
      uCore: { value: new Color() },
      uTint: { value: new Color() },
      uBody: { value: new Color() },
      uDeep: { value: new Color() },
    }),
    vertexShader: ARC_VERTEX,
    fragmentShader: ARC_FRAGMENT,
  });
  /** @param {object} s { mid, h, v, draw, head, flow, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uMid.value.copy(s.mid);
    u.uH.value.copy(s.h);
    u.uV.value.copy(s.v);
    u.uTube.value = c.arcWidth;
    u.uDraw.value = s.draw;
    u.uHead.value = s.head;
    u.uFlow.value = s.flow;
    u.uGlow.value = c.arcGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    u.uCore.value.copy(getColor(c.colorCore));
    u.uTint.value.copy(getColor(c.colorTint));
    u.uBody.value.copy(getColor(c.colorBody));
    u.uDeep.value.copy(getColor(c.colorDeep));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The lens                                                             */
/* -------------------------------------------------------------------- */

const LENS_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uShock;       // strength of the pressure ring
  uniform float uWave;        // its radius, 0..1
  uniform float uSeed;
  uniform float uScale;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    vec2 radial = q / max(r, 1e-3);
    float ring = exp(-pow((r - uWave) / 0.12, 2.0));
    // Ground pressure is lumpy: the ring is broken by grit.
    float n = snoise(vec3(q * 4.0 * uScale, uSeed));
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(ring * uShock * (0.7 + 0.3 * n), 0.0, 1.0);
    if (strength < 0.002) discard;
    vec2 dir = radial * (0.8 + 0.2 * n);
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/**
 * `LAYER.DISTORTION` disc. Opaque on purpose (see Borrowed Tomorrow's lens):
 * the offset buffer wants the proxy's own value.
 */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uShock: { value: 0 },
      uWave: { value: 0 },
      uSeed: { value: 0 },
      uScale: { value: 1 },
    }),
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT,
  });
  /** @param {object} s { shock, wave, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uShock.value = s.shock * c.lensStrength * g.distortion;
    u.uWave.value = s.wave;
    u.uSeed.value = s.seed;
    u.uScale.value = g.noiseFrequency;
  };
  return material;
}
