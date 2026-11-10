import { AdditiveBlending, Color, DoubleSide, MeshDepthMaterial, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { patchOnBeforeCompile, replaceChunk } from '../../../utils/shaderPatch.js';

/**
 * Faultwake Bastion — the bespoke shaders.
 *
 *  - **basalt** (`createRockMaterial`) — opaque, instanced, flat-shaded from
 *    screen derivatives so the hexagonal faces stay crisp. Grit and strata
 *    from fbm in the column's *own* space (so the pattern rides the column as
 *    it heaves), dust settled on the upward faces, magma veins that are open
 *    while a column is fresh (`aHeat`, per instance) and seal as it cools, a
 *    molten seam where it leaves the fissure, and a noise dissolve with a
 *    burning edge for the exit. Fragments under the floor are discarded, so a
 *    retreating column is genuinely swallowed rather than sliding through.
 *    Its shadow (`createRockDepthMaterial`) runs the same erosion and the same
 *    under-floor discard, so the shadow crumbles with the crown.
 *  - **the fissure** (`createFissureMaterial`) — a wandering, white-hot slit
 *    that only exists behind the travelling front, ridged branch cracks off
 *    it, a scorched scar around it, and a faint pulsing seam running a few
 *    metres *ahead* of the front: the telegraph. It cools from white through
 *    ember to scar and erodes away.
 *  - **the heat veil** (`createHeatVeilMaterial`, `LAYER.DISTORTION`) — the
 *    air shimmering over the open fissure, strongest just behind the front.
 *  - **debris** (`createDebrisMaterial`) — 96 points thrown ballistically by
 *    the vertex stage as the front passes their station; hot when launched,
 *    cooling to rock on the way down.
 *  - **the shock disc** (`createShockMaterial`) — the terminal eruption's
 *    ground wave: a hot rim with radial cracks running out behind it.
 *
 * Every material reads `settings['faultwake-bastion']` in
 * `userData.sync(state)`, so every slider is live mid-cast.
 */

const ID = 'faultwake-bastion';

/* -------------------------------------------------------------------- */
/* Basalt                                                               */
/* -------------------------------------------------------------------- */

const ROCK_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aHeat;

  varying vec3  vLocal;
  varying vec3  vWorld;
  varying float vHeat;
  varying float vSeed;

  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vLocal = position;
    vWorld = world.xyz;
    vHeat = aHeat;
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * The dissolve field, shared by the basalt and its shadow so the two crumble
 * as one. Biased toward the crown (the low term) so the shaft is eaten
 * top-first.
 */
const ROCK_EROSION = /* glsl */ `
  float rockErosion(vec3 local, vec3 p) {
    return snoise01(p * 2.3) * 0.85 + 0.15 * (1.0 - clamp(local.y * 0.5, 0.0, 1.0));
  }
`;

const ROCK_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;        // 1 standing … 0 gone (drives the dissolve)
  uniform float uNoiseScale;
  uniform float uGrit;
  uniform float uStrata;
  uniform float uVeinGlow;
  uniform float uVeinWidth;
  uniform float uDustCover;
  uniform float uBurnEdge;
  uniform vec3  uColorDark;
  uniform vec3  uColorLight;
  uniform vec3  uColorDust;
  uniform vec3  uColorMagma;
  uniform vec3  uColorCore;
  uniform vec3  uLightDir;
  uniform float uShaderIntensity;
  uniform float uGlobalGlow;

  varying vec3  vLocal;
  varying vec3  vWorld;
  varying float vHeat;
  varying float vSeed;

  ${noiseGLSL}
  ${commonGLSL}
  ${ROCK_EROSION}

  void main() {
    // Whatever has sunk below the floor is under the floor.
    if (vWorld.y < 0.0) discard;

    vec3 p = vLocal * uNoiseScale + vec3(vSeed * 17.0, vSeed * 5.3, vSeed * 11.1);

    // Exit: a noise dissolve that eats the column crown-first, with a burning
    // rim (the low term biases erosion toward the top of the shaft).
    float dissolve = 1.0 - uFade;
    float erosion = rockErosion(vLocal, p);
    vec2 dm = dissolveMask(erosion, dissolve, max(uBurnEdge, 0.001));
    if (dm.x < 0.5) discard;
    float burn = (1.0 - smoothstep(dissolve, dissolve + uBurnEdge, erosion)) * step(0.001, dissolve);

    // Faceted normal: the hexagon must read as faces, not as a soft cylinder.
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;

    // Grit and strata in the column's own space.
    float grit = fbm3(p * 3.1) * uGrit;
    float strata = 0.5 + 0.5 * sin(vLocal.y * 13.0 + snoise(p * 0.7) * 2.2);
    float tone = clamp(0.42 + grit * 0.55 + (strata - 0.5) * 0.35 * uStrata, 0.0, 1.0);
    vec3 albedo = mix(uColorDark, uColorLight, tone);
    // Dust settles on whatever faces up — the crown and the joints' ledges.
    albedo = mix(albedo, uColorDust, smoothstep(0.45, 0.95, N.y) * uDustCover);

    vec3 L = normalize(uLightDir);
    float diffuse = max(dot(N, L), 0.0);
    float hemi = 0.55 + 0.45 * N.y;
    float rim = fresnelTerm(V, N, 3.0, 1.0);
    vec3 col = albedo * (0.3 * hemi + 0.95 * diffuse) + uColorDust * rim * 0.12;

    // Magma veins: ridged filaments, open while the column is fresh.
    float v = ridged(p * 1.7 + vec3(0.0, -uTime * 0.12, 0.0), 4);
    float width = max(uVeinWidth, 0.01);
    float vein = smoothstep(0.92 - width, 0.92, v) * vHeat;
    // The molten seam where the column leaves the fissure.
    float seam = (1.0 - smoothstep(0.0, 0.4, vWorld.y)) * vHeat;
    vec3 magma = mix(uColorMagma, uColorCore, vein * vein);
    vec3 emissive = magma * (vein * 1.4 + seam * 0.8) * uVeinGlow * uShaderIntensity;
    emissive += uColorMagma * burn * 3.0;

    gl_FragColor = vec4(col + emissive * uGlobalGlow, 1.0);
  }
`;

/**
 * The basalt. Opaque, `LAYER.WORLD`: it occludes, and soft particles fade
 * against it.
 */
export function createRockMaterial() {
  const material = new ShaderMaterial({
    toneMapped: false,
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uNoiseScale: { value: 1.2 },
      uGrit: { value: 1 },
      uStrata: { value: 1 },
      uVeinGlow: { value: 2.5 },
      uVeinWidth: { value: 0.12 },
      uDustCover: { value: 0.55 },
      uBurnEdge: { value: 0.08 },
      uColorDark: { value: new Color() },
      uColorLight: { value: new Color() },
      uColorDust: { value: new Color() },
      uColorMagma: { value: new Color() },
      uColorCore: { value: new Color() }
    }),
    vertexShader: ROCK_VERTEX,
    fragmentShader: ROCK_FRAGMENT
  });
  // The shared clock is a frame uniform; the cast's own clock replaces it so
  // the veins crawl at the same rate whether or not the app is paused.
  material.uniforms.uTime = { value: 0 };

  /** @param {object} state { time, fade } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time * g.noiseSpeed;
    u.uFade.value = state.fade;
    u.uNoiseScale.value = c.rockNoiseScale * g.noiseFrequency;
    u.uGrit.value = c.rockGrit * g.noiseStrength;
    u.uStrata.value = c.rockStrata;
    u.uVeinGlow.value = c.veinGlow * g.glow;
    u.uVeinWidth.value = c.veinWidth;
    u.uDustCover.value = c.dustCover;
    u.uBurnEdge.value = c.burnEdge;
    u.uColorDark.value.copy(getColor(c.colorRockDark));
    u.uColorLight.value.copy(getColor(c.colorRockLight));
    u.uColorDust.value.copy(getColor(c.colorRockDust));
    u.uColorMagma.value.copy(getColor(c.colorMagma));
    u.uColorCore.value.copy(getColor(c.colorMagmaCore));
  };
  return material;
}

/**
 * The basalt's shadow. A stock `MeshDepthMaterial` (so it packs depth the way
 * three's shadow pass expects, instancing included) patched to run the same
 * under-floor discard and erosion dissolve as `createRockMaterial`. It shares
 * that material's `uFade` and `uNoiseScale` uniform objects, so the shadow
 * follows every sync without a second one (the burn edge is colour only; the
 * cut itself is a hard step, so the shadow needs no `uBurnEdge`). Assign it as the mesh's
 * `customDepthMaterial`; only the sun casts, so no distance material is needed.
 *
 * @param {ShaderMaterial} rock the material from `createRockMaterial`
 */
export function createRockDepthMaterial(rock) {
  const material = new MeshDepthMaterial();
  patchOnBeforeCompile(
    material,
    (shader) => {
      shader.uniforms.uFade = rock.uniforms.uFade;
      shader.uniforms.uNoiseScale = rock.uniforms.uNoiseScale;

      shader.vertexShader = replaceChunk(
        shader.vertexShader,
        '#include <common>',
        `#include <common>
         attribute float aSeed;
         varying vec3  vFwLocal;
         varying float vFwWorldY;
         varying float vFwSeed;`
      );
      shader.vertexShader = replaceChunk(
        shader.vertexShader,
        '#include <project_vertex>',
        `#include <project_vertex>
         vec4 fwWorld = vec4(transformed, 1.0);
         #ifdef USE_INSTANCING
           fwWorld = instanceMatrix * fwWorld;
         #endif
         fwWorld = modelMatrix * fwWorld;
         vFwLocal = position;
         vFwWorldY = fwWorld.y;
         vFwSeed = aSeed;`
      );

      shader.fragmentShader = replaceChunk(
        shader.fragmentShader,
        '#include <common>',
        `#include <common>
         uniform float uFade;
         uniform float uNoiseScale;
         varying vec3  vFwLocal;
         varying float vFwWorldY;
         varying float vFwSeed;
         ${noiseGLSL}
         ${ROCK_EROSION}`
      );
      shader.fragmentShader = replaceChunk(
        shader.fragmentShader,
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
         // The same cuts as the basalt: under the floor, and the dissolve
         // (dissolveMask's mask is step(threshold, erosion)).
         if (vFwWorldY < 0.0) discard;
         vec3 fwP = vFwLocal * uNoiseScale + vec3(vFwSeed * 17.0, vFwSeed * 5.3, vFwSeed * 11.1);
         if (rockErosion(vFwLocal, fwP) < 1.0 - uFade) discard;`
      );
    },
    'faultwake-rock-depth'
  );
  return material;
}

/* -------------------------------------------------------------------- */
/* The fissure                                                          */
/* -------------------------------------------------------------------- */

const STRIP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FISSURE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFront;       // 0..1 of the line the front has reached
  uniform float uFade;        // 1 open … 0 eroded away
  uniform float uLength;      // metres
  uniform float uWidth;       // full strip width, metres
  uniform float uHeat;        // 1 white-hot … 0 cold scar
  uniform float uFresh;       // metres behind the front that stay white-hot
  uniform float uTelegraph;   // metres ahead of the front the seam runs
  uniform float uTelegraphGlow;
  uniform float uCoreWidth;   // metres, the molten slit
  uniform float uLip;         // ember glow on the slit's lips
  uniform float uWander;
  uniform float uBranching;
  uniform float uGlow;
  uniform float uScar;
  uniform float uSeed;
  uniform vec3  uColorHot;
  uniform vec3  uColorEmber;
  uniform vec3  uColorScar;
  uniform float uShaderIntensity;
  uniform float uGlobalGlow;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float along = vUv.x * uLength;
    float across = (vUv.y - 0.5) * uWidth;
    float front = uFront * uLength;

    // The slit wanders off the aimed line, like a real crack finding weakness.
    float wander = uWander * fbm3(vec3(along * 0.38, uSeed, 1.7)) * 2.0;
    float d = abs(across - wander);
    float coreW = uCoreWidth * (0.45 + 0.75 * snoise01(vec3(along * 1.4, uSeed, 3.1)));
    float core = 1.0 - smoothstep(coreW * 0.35, coreW, d);

    // Branch cracks: ridged filaments, dying out away from the slit.
    float halfW = max(uWidth * 0.5, 0.05);
    float branchN = ridged(vec3(along * 1.7, across * 3.4, uSeed * 0.7), 4);
    float branch = smoothstep(0.93 - 0.12 * uBranching, 0.95, branchN) * (1.0 - smoothstep(0.05, halfW * 0.9, d));

    // Only behind the front, with the freshest metres white-hot.
    float behind = front - along;
    float reached = smoothstep(-0.04, 0.04, behind);
    float fresh = exp(-max(behind, 0.0) / max(uFresh, 0.05)) * reached;

    // The telegraph: a faint pulse racing ahead of the front.
    float ahead = max(-behind, 0.0);
    float tele = step(0.0, -behind) * (1.0 - smoothstep(0.0, max(uTelegraph, 0.01), ahead));
    tele *= (0.55 + 0.45 * sin(uTime * 16.0 - ahead * 5.0)) * (1.0 - smoothstep(coreW * 0.5, coreW * 2.5, d));
    tele *= uTelegraphGlow * step(0.001, uHeat);

    float heat = reached * uHeat * mix(0.6, 1.0, fresh);
    // The lips: a wider ember band either side of the slit, broken by grain.
    float lip = (1.0 - smoothstep(coreW, coreW * 3.2, d)) * (0.55 + 0.45 * snoise01(vec3(along * 3.1, across * 6.0, uSeed + 5.0)));
    float glow = (core + branch * 0.5 + lip * uLip * (1.0 - core)) * heat + tele * 0.35;
    vec3 hot = mix(uColorEmber, uColorHot, clamp(core * (0.35 + fresh * 0.9) * uHeat, 0.0, 1.0));

    // The scar: scorched ground around the crack, normal-blended darkening.
    float scar = reached * (1.0 - smoothstep(coreW, halfW, d + 0.12 * fbm3(vec3(along * 2.0, across * 2.0, uSeed)))) * uScar;

    // Feather every edge so the strip never shows a border.
    float edges = smoothstep(0.0, 0.03, vUv.x) * (1.0 - smoothstep(0.97, 1.0, vUv.x));
    edges *= 1.0 - smoothstep(0.75, 1.0, abs(vUv.y - 0.5) * 2.0);

    // Exit: erode by noise rather than fading uniformly.
    float erosion = snoise01(vec3(vWorld.xz * 1.6, uSeed));
    float keep = smoothstep(1.0 - uFade - 0.12, 1.0 - uFade + 0.12, erosion);

    float alpha = clamp(max(scar * 0.75, glow), 0.0, 1.0) * edges * keep;
    if (alpha < 0.003) discard;
    vec3 color = mix(uColorScar, hot * uGlow * uShaderIntensity * uGlobalGlow, clamp(glow * 1.5, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
  }
`;

/** The fissure: normal blending so the scar can darken as the crack glows. */
export function createFissureMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: sharedUniforms({
      uFront: { value: 0 },
      uFade: { value: 1 },
      uLength: { value: 1 },
      uWidth: { value: 2 },
      uHeat: { value: 1 },
      uFresh: { value: 2.5 },
      uTelegraph: { value: 2.5 },
      uTelegraphGlow: { value: 0.6 },
      uCoreWidth: { value: 0.17 },
      uLip: { value: 0.45 },
      uWander: { value: 0.12 },
      uBranching: { value: 1 },
      uGlow: { value: 3 },
      uScar: { value: 0.6 },
      uSeed: { value: 0 },
      uColorHot: { value: new Color() },
      uColorEmber: { value: new Color() },
      uColorScar: { value: new Color() }
    }),
    vertexShader: STRIP_VERTEX,
    fragmentShader: FISSURE_FRAGMENT
  });
  material.uniforms.uTime = { value: 0 };

  /** @param {object} state { time, front, fade, heat, length, width, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uFront.value = state.front;
    u.uFade.value = state.fade;
    u.uHeat.value = state.heat;
    u.uLength.value = state.length;
    u.uWidth.value = state.width;
    u.uSeed.value = state.seed;
    u.uFresh.value = c.crackFresh;
    u.uTelegraph.value = c.telegraphLength;
    u.uTelegraphGlow.value = c.telegraphGlow;
    u.uCoreWidth.value = c.crackCoreWidth ?? 0.17;
    u.uLip.value = c.crackLip ?? 0.45;
    u.uWander.value = c.crackWander * g.randomness;
    u.uBranching.value = c.crackBranching;
    u.uGlow.value = c.crackGlow * g.glow;
    u.uScar.value = c.scarOpacity * g.opacity;
    u.uColorHot.value.copy(getColor(c.colorCrackHot));
    u.uColorEmber.value.copy(getColor(c.colorCrackEmber));
    u.uColorScar.value.copy(getColor(c.colorCrackScar));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The heat veil — LAYER.DISTORTION                                     */
/* -------------------------------------------------------------------- */

const VEIL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFront;
  uniform float uLength;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float along = vUv.x * uLength;
    float behind = uFront * uLength - along;
    // Strongest a metre or two behind the front, where the rock is hottest.
    float heat = smoothstep(-0.1, 0.4, behind) * (0.35 + 0.65 * exp(-max(behind, 0.0) * 0.35));
    float mask = heat * (1.0 - smoothstep(0.2, 1.0, abs(vUv.y - 0.5) * 2.0));
    mask *= smoothstep(0.0, 0.04, vUv.x) * (1.0 - smoothstep(0.96, 1.0, vUv.x));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    // Welded to the ground, rising with time: heat shimmer, not a sliding warp.
    vec3 np = vec3(vWorld.xz * uScale, -uTime * uSpeed + uSeed);
    float nx = snoise(np);
    float ny = snoise(np + vec3(13.1, 7.7, 29.3));
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, strength, mask);
  }
`;

export function createHeatVeilMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFront: { value: 0 },
      uLength: { value: 1 },
      uStrength: { value: 0.6 },
      uScale: { value: 1.4 },
      uSpeed: { value: 1.2 },
      uSeed: { value: 0 }
    }),
    vertexShader: STRIP_VERTEX,
    fragmentShader: VEIL_FRAGMENT
  });
  material.uniforms.uTime = { value: 0 };

  /** @param {object} state { time, front, length, strength, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uFront.value = state.front;
    u.uLength.value = state.length;
    u.uStrength.value = state.strength * c.veilStrength * g.distortion;
    u.uScale.value = c.veilScale * g.noiseFrequency;
    u.uSpeed.value = c.veilSpeed * g.noiseSpeed;
    u.uSeed.value = state.seed;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Debris                                                               */
/* -------------------------------------------------------------------- */

const DEBRIS_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uFront;
  uniform float uLength;
  uniform float uSpeed;
  uniform float uLift;
  uniform float uSpread;
  uniform float uGravity;
  uniform float uSize;
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform vec2  uResolution;

  varying float vA;
  varying float vAge;
  varying float vSeed;

  void main() {
    float along = position.x * uLength;
    // Each chip launches when the front passes its station; the shared clock
    // keeps running after the eruption reaches the end, so they all land.
    float age = max(0.0, uTime-along / max(0.1, uSpeed));
    vec3 p = uOrigin + uDir * along + uSide * (position.z + sin(aSeed * 41.0) * age * uSpread);
    p.y = 0.12 + age * (uLift + aSeed * 2.0) - age * age * uGravity * 0.5;
    vA = step(along, uFront) * step(0.0, p.y) * (1.0 - smoothstep(0.3, 1.2, age));
    vAge = age;
    vSeed = aSeed;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    // World-size points: half a projected chip width in pixels.
    float worldSize = uSize * (0.05 + aSeed * 0.07);
    gl_PointSize = clamp(projectionMatrix[1][1] * 0.5 * uResolution.y * worldSize / max(1.0, -mv.z), 1.0, 24.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const DEBRIS_FRAGMENT = /* glsl */ `
  uniform float uFade;
  uniform float uGlow;
  uniform vec3  uColorRock;
  uniform vec3  uColorHot;
  uniform float uGlobalGlow;

  varying float vA;
  varying float vAge;
  varying float vSeed;

  void main() {
    // An angular chip rather than a round dot: a rotated, squashed diamond.
    vec2 q = gl_PointCoord - 0.5;
    float a = vSeed * 6.2831 + vAge * 6.0;
    q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
    float chip = 1.0 - smoothstep(0.3, 0.42, abs(q.x) * 1.2 + abs(q.y) * 0.9);
    // Hot when torn out, cooling to rock within half a second.
    float hot = exp(-vAge * 5.0);
    vec3 col = mix(uColorRock, uColorHot * uGlow * uGlobalGlow, hot);
    float alpha = chip * vA * uFade;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createDebrisMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFront: { value: 0 },
      uLength: { value: 1 },
      uSpeed: { value: 1 },
      uFade: { value: 1 },
      uLift: { value: 3.2 },
      uSpread: { value: 1.6 },
      uGravity: { value: 8 },
      uSize: { value: 1 },
      uGlow: { value: 2 },
      uOrigin: { value: new Vector3() },
      uDir: { value: new Vector3() },
      uSide: { value: new Vector3() },
      uColorRock: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: DEBRIS_VERTEX,
    fragmentShader: DEBRIS_FRAGMENT
  });
  material.uniforms.uTime = { value: 0 };

  /** @param {object} state { time, front, length, speed, fade, origin, dir, side } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uFront.value = state.front;
    u.uLength.value = state.length;
    u.uSpeed.value = state.speed;
    u.uFade.value = state.fade * c.dustOpacity * g.opacity;
    u.uLift.value = c.debrisLift;
    u.uSpread.value = c.debrisSpread * g.randomness;
    u.uGravity.value = c.debrisGravity;
    u.uSize.value = c.debrisSize * g.particleSize;
    u.uGlow.value = c.debrisGlow * g.glow;
    u.uOrigin.value.copy(state.origin);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uColorRock.value.copy(getColor(c.colorDebris));
    u.uColorHot.value.copy(getColor(c.colorCrackEmber));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The shock disc                                                       */
/* -------------------------------------------------------------------- */

const SHOCK_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHOCK_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uGlow;
  uniform float uCracks;
  uniform float uSeed;
  uniform vec3  uColorHot;
  uniform vec3  uColorDust;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float a = vUv.x * 6.2831853;
    float r = vUv.y;
    // The travelling rim: a bright, slightly ragged band at the edge.
    float ragged = 0.04 * snoise(vec3(cos(a) * 3.0, sin(a) * 3.0, uSeed));
    float rimBand = 1.0 - smoothstep(0.0, 0.12, abs(r - 0.9 - ragged));
    // Radial cracks behind it, drawn out along the radius.
    float n = ridged(vec3(cos(a) * uCracks, sin(a) * uCracks, r * 1.2 + uSeed), 4);
    float crack = smoothstep(0.82, 0.93, n) * smoothstep(0.1, 0.5, r) * (1.0 - smoothstep(0.85, 1.0, r));
    // A low haze of dust over the whole disc, thinning at the centre.
    float haze = smoothstep(0.2, 0.85, r) * (1.0 - smoothstep(0.9, 1.0, r)) * 0.25 * snoise01(vec3(a * 2.0, r * 4.0 - uTime, uSeed));
    vec3 col = uColorHot * (rimBand * 0.8 + crack) * uGlow + uColorDust * haze;
    float alpha = clamp(rimBand * 0.6 + crack + haze, 0.0, 1.0) * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col * uGlobalGlow * uFade, alpha);
  }
`;

export function createShockMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFade: { value: 0 },
      uGlow: { value: 2 },
      uCracks: { value: 3 },
      uSeed: { value: 0 },
      uColorHot: { value: new Color() },
      uColorDust: { value: new Color() }
    }),
    vertexShader: SHOCK_VERTEX,
    fragmentShader: SHOCK_FRAGMENT
  });
  material.uniforms.uTime = { value: 0 };

  /** @param {object} state { time, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uFade.value = state.fade;
    u.uGlow.value = c.impactRingGlow * g.glow;
    u.uCracks.value = c.impactCracks;
    u.uSeed.value = state.seed;
    u.uColorHot.value.copy(getColor(c.colorCrackHot));
    u.uColorDust.value.copy(getColor(c.colorRockDust));
  };
  return material;
}
