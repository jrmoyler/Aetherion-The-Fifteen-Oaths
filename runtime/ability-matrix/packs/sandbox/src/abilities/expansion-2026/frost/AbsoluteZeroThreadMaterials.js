import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  NormalBlending,
  ShaderMaterial
} from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { patchOnBeforeCompile } from '../../../utils/shaderPatch.js';
import { ID } from './AbsoluteZeroThreadConfig.js';

/**
 * Absolute Zero Thread — the bespoke shaders.
 *
 *  - **the filament** (`createThreadMaterial`) — supercooled light: a white
 *    core feathering to deep blue, fine strands running down it, voronoi
 *    crystal cells that glint as they pass, a glare at the needle end, and a
 *    noise dissolve as it fades so it breaks up into rime rather than dimming
 *    out.
 *  - **the needle** (`createNeedleMaterial`) — flat-faceted ice with a strong
 *    fresnel rim and a cold inner glow; additive.
 *  - **the rime path** (`createRimeMaterial`) — frost plates (voronoi cells
 *    with bright edges) creeping along the floor behind the needle, revealed
 *    up to the front with a ragged edge and melting back with noise.
 *  - **the chill** (`createChillMaterial`) — the rime strip's twin on
 *    `LAYER.DISTORTION`: cold air pooling over the line.
 *  - **frost motes** (`createMoteMaterial`) — baked points drifting up off the
 *    line as far as the needle has reached.
 *  - **the rosette** (`createRosetteMaterial`) — a ring of rime round each
 *    statue's feet: six-fold dendrite arms over voronoi plates.
 *  - **the ice** (`createStatueMaterial`) — the statue is a skinned clone of
 *    the struck body, so it keeps a built-in material with frost patched in:
 *    hoarfrost noise, a white grazing rim, and the ice *climbing* the body
 *    from the feet over `statueCreep`.
 *  - **the shards** (`createShardMaterial`) — instanced crystals; fresnel ice
 *    with a bright core line.
 *  - **the frost spine** (`createSpineMaterial`) — the hero: opaque, sun-lit
 *    ice (MeshStandardMaterial on `LAYER.WORLD`, casting shadows) with a
 *    patched emissive — a four-stop ramp from the deep blue in the facets
 *    facing away to a white grazing rim, cloudy frost inside, and a per-
 *    instance `aPulse` that flares a crystal white as a pulse runs the thread.
 *  - **the chips** (`createChipMaterial`) — baked shatter points thrown out on
 *    a ballistic arc, one material per pooled burst.
 *
 * Every material reads `settings['absolute-zero-thread']` in
 * `userData.sync(state)`.
 */

/* -------------------------------------------------------------------- */
/* The filament                                                         */
/* -------------------------------------------------------------------- */

const THREAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const THREAD_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;         // 1 while standing, → 0 through the fade
  uniform float uDissolve;     // how much of the fade is a dissolve
  uniform float uGlow;
  uniform float uStrands;
  uniform float uCrystals;
  uniform float uHead;         // glare at the needle end (travel only)
  uniform vec3  uColorDeep;
  uniform vec3  uColorCore;
  uniform vec3  uColorCrystal;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float across = abs(vUv.y - 0.5) * 2.0;
    float core = pow(max(0.0, 1.0 - across), 0.45);
    float hot = pow(max(0.0, 1.0 - across), 4.0);

    // Fine strands, bent by noise so they braid instead of running parallel.
    float bend = snoise(vec3(vUv.x * 9.0, vUv.y * 2.0, uClock * 0.4)) * 1.6;
    float strand = pow(max(0.0, sin(vUv.x * uStrands - uClock * 5.0 + bend)), 14.0);

    // Crystal cells along the run that glint as the light crosses them.
    vec2 cell = voronoi2(vec2(vUv.x * uCrystals, vUv.y * 3.0 + 7.0));
    float glint = smoothstep(0.82, 1.0, fract(cell.y * 7.0 + uClock * 0.6)) * (1.0 - smoothstep(0.0, 0.35, cell.x));

    // The needle end flares while the thread is still running out.
    float head = smoothstep(0.86, 1.0, vUv.x) * uHead;

    // Fade: part dim, part a noise dissolve with a white burn edge.
    float n = snoise01(vWorld * 4.0);
    float threshold = (1.0 - uFade) * uDissolve;
    vec2 dm = dissolveMask(n, threshold, 0.08);
    if (dm.x < 0.5 && threshold > 0.001) discard;
    float dim = mix(uFade, 1.0, uDissolve);

    vec3 col = mix(uColorDeep, uColorCore, clamp(core + glint * 0.3, 0.0, 1.0))
             + uColorCore * (hot * 0.8 + head * 2.0)
             + uColorCrystal * (glint * 1.2 + dm.y * 1.5);
    float a = (core * 0.55 + strand * 0.45 + glint * 0.35 + head) * dim * uShaderIntensity;
    a *= smoothstep(0.0, 0.02, vUv.x); // feather off the caster's hand
    if (a < 0.002) discard;
    gl_FragColor = vec4(col * a * uGlow * uGlobalGlow, a);
  }
`;

/** The filament. Additive, both strips of the X. */
export function createThreadMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0.6 },
      uGlow: { value: 1.6 },
      uStrands: { value: 92 },
      uCrystals: { value: 66 },
      uHead: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorCore: { value: new Color() },
      uColorCrystal: { value: new Color() }
    }),
    vertexShader: THREAD_VERTEX,
    fragmentShader: THREAD_FRAGMENT
  });

  /** @param {{clock:number, fade:number, head:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock;
    u.uFade.value = state.fade;
    u.uHead.value = state.head;
    u.uDissolve.value = c.threadDissolve;
    u.uGlow.value = c.threadGlow * g.glow;
    u.uStrands.value = c.strandDensity;
    u.uCrystals.value = c.crystalDensity * g.noiseFrequency;
    u.uColorDeep.value.copy(getColor(c.colorThreadDeep));
    u.uColorCore.value.copy(getColor(c.colorThreadCore));
    u.uColorCrystal.value.copy(getColor(c.colorCrystal));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The needle                                                           */
/* -------------------------------------------------------------------- */

const LIT_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying vec3 vWorld;

  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec4 world = m * vec4(position, 1.0);
    vLocal = position;
    vWorld = world.xyz;
    vNormalW = normalize(mat3(m) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const NEEDLE_FRAGMENT = /* glsl */ `
  uniform float uPower;
  uniform float uGlow;
  uniform float uFresnel;
  uniform float uFresnelScale;
  uniform vec3  uColor;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, uFresnel, uFresnelScale);
    // Cold light trapped inside, brightest at the tip.
    float inner = 0.35 + 0.65 * smoothstep(0.0, 1.0, vLocal.z);
    float frost = snoise01(vWorld * 18.0);
    vec3 col = uColor * inner * (0.6 + 0.4 * frost) + uColorRim * rim * 1.5;
    float a = clamp((0.35 + rim) * uPower, 0.0, 1.0);
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * a * uGlow * uGlobalGlow, a);
  }
`;

export function createNeedleMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uPower: { value: 0 },
      uGlow: { value: 2.2 },
      uFresnel: { value: 2.5 },
      uFresnelScale: { value: 1 },
      uColor: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: LIT_VERTEX,
    fragmentShader: NEEDLE_FRAGMENT
  });

  /** @param {{power:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPower.value = state.power;
    u.uGlow.value = c.needleGlow * g.glow;
    u.uFresnel.value = c.needleFresnel;
    u.uFresnelScale.value = g.fresnel;
    u.uColor.value.copy(getColor(c.colorNeedle));
    u.uColorRim.value.copy(getColor(c.colorNeedleRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The rime path and its chill                                          */
/* -------------------------------------------------------------------- */

const STRIP_VERTEX = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;

  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RIME_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFront;      // 0..1 along the strip the needle has reached
  uniform float uMelt;       // 0..1 melted
  uniform float uOpacity;
  uniform float uScale;      // plates per metre
  uniform float uLength;     // strip length (m), to keep plates square
  uniform float uWidth;      // strip width (m)
  uniform float uGlow;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3 vLocal;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float along = vLocal.z;
    float across = abs(vLocal.x) * 2.0;
    // A ragged front: the frost has only crept as far as the needle.
    float ragged = snoise(vec3(vLocal.x * 4.0, along * uLength * 0.7, 2.3)) * 0.04;
    float reach = smoothstep(uFront + 0.01, uFront - 0.03, along + ragged);
    // The edges of the strip are feathered by noise too.
    float edge = 1.0 - smoothstep(0.45, 1.0, across + snoise(vWorld * 1.7) * 0.25);
    // Frost plates: voronoi in metres, bright at the cell walls.
    vec2 v = voronoi2(vWorld.xz * uScale);
    float wall = 1.0 - smoothstep(0.0, 0.12, v.x);
    float plate = 0.35 + 0.65 * v.y;
    // Melting eats plates from their centres outward, by cell.
    float melt = step(uMelt, v.y * 0.85 + 0.1 + v.x * 0.3);
    float m = reach * edge * melt * uOpacity * uShaderIntensity;
    if (m < 0.003) discard;
    vec3 col = mix(uColorB * plate, uColorA, wall) * (0.7 + wall * uGlow * uGlobalGlow);
    gl_FragColor = vec4(col, m * (0.45 + 0.55 * wall));
  }
`;

/** The frosted ground strip behind the needle. Normal-blended. */
export function createRimeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uFront: { value: 0 },
      uMelt: { value: 0 },
      uOpacity: { value: 0.75 },
      uScale: { value: 3.2 },
      uLength: { value: 1 },
      uWidth: { value: 1 },
      uGlow: { value: 0.8 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: STRIP_VERTEX,
    fragmentShader: RIME_FRAGMENT
  });

  /** @param {{clock:number, front:number, melt:number, length:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock;
    u.uFront.value = state.front;
    u.uMelt.value = state.melt;
    u.uLength.value = state.length;
    u.uWidth.value = c.rimeWidth * 2;
    u.uOpacity.value = c.rimeOpacity * g.opacity;
    u.uScale.value = c.rimeScale * g.noiseFrequency;
    u.uGlow.value = c.rimeGlow * g.glow;
    u.uColorA.value.copy(getColor(c.colorRimeA));
    u.uColorB.value.copy(getColor(c.colorRimeB));
  };

  return material;
}

const CHILL_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFront;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uShaderIntensity;

  varying vec3 vLocal;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec3 np = vec3(vWorld.xz * uScale, uClock * uSpeed);
    float nx = snoise(np);
    float ny = snoise(np + vec3(19.3, 7.7, 31.1));
    float mask = (1.0 - smoothstep(0.2, 1.0, abs(vLocal.x) * 2.0))
               * smoothstep(uFront + 0.02, uFront - 0.08, vLocal.z)
               * smoothstep(0.0, 0.05, vLocal.z);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, strength, mask);
  }
`;

/** Cold air over the line, drawn into the distortion layer. */
export function createChillMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uFront: { value: 0 },
      uStrength: { value: 0 },
      uScale: { value: 3 },
      uSpeed: { value: 0.6 }
    }),
    vertexShader: STRIP_VERTEX,
    fragmentShader: CHILL_FRAGMENT
  });

  /** @param {{clock:number, front:number, power:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock;
    u.uFront.value = state.front;
    u.uStrength.value = c.chillStrength * state.power * g.distortion;
    u.uScale.value = c.chillScale * g.noiseFrequency;
    u.uSpeed.value = c.chillSpeed * g.noiseSpeed;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* Frost motes                                                          */
/* -------------------------------------------------------------------- */

const MOTE_VERTEX = /* glsl */ `
  uniform float uLength;
  uniform float uClock;
  uniform float uRise;
  uniform float uSize;

  varying float vA;

  void main() {
    // position.x: 0..1 along what the needle has covered; z: across; y: phase.
    vec3 p;
    p.z = position.x * uLength;
    p.x = position.z * 0.8 + sin(uClock * 2.0 + position.y * 20.0) * 0.12;
    p.y = 0.3 + mod(position.y * 2.0 + uClock * uRise, 2.0);
    // Thinner towards the caster and towards the top of their drift.
    vA = (1.0 - position.x * 0.6) * (1.0 - smoothstep(1.4, 2.3, p.y));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(uSize / max(1.0, -mv.z), 1.0, 5.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const MOTE_FRAGMENT = /* glsl */ `
  uniform float uFade;
  uniform vec3  uColor;
  uniform float uGlobalGlow;

  varying float vA;

  void main() {
    float a = (1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5))) * uFade * vA;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor * a * uGlobalGlow, a);
  }
`;

/** Frost motes. `uLength` follows the needle; `uFade` is the cast's. */
export function createMoteMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uLength: { value: 1 },
      uClock: { value: 0 },
      uFade: { value: 1 },
      uRise: { value: 0.35 },
      uSize: { value: 14 },
      uColor: { value: new Color() }
    }),
    vertexShader: MOTE_VERTEX,
    fragmentShader: MOTE_FRAGMENT
  });

  /** @param {{clock:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock;
    u.uRise.value = c.moteRise;
    u.uSize.value = c.moteSize * g.particleSize;
    u.uColor.value.copy(getColor(c.colorMote)).multiplyScalar(c.moteOpacity * g.opacity);
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The rosette                                                          */
/* -------------------------------------------------------------------- */

const ROSETTE_VERTEX = /* glsl */ `
  varying vec2 vP;
  varying vec3 vWorld;

  void main() {
    vP = position.xz * 2.0; // -1..1 over the quad
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ROSETTE_FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uFade;
  uniform float uGlow;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vP;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    float a = atan(vP.y, vP.x);
    // Six dendrite arms, each with side branches every so often.
    float arm = abs(sin(a * 3.0));
    float branch = abs(sin(a * 3.0 + r * 18.0)) * smoothstep(0.2, 0.9, r);
    float dendrite = pow(1.0 - min(arm, 0.6 + branch * 0.4), 6.0) * (1.0 - smoothstep(0.6, 1.0, r));
    // Rime plates in between, welded to the floor.
    vec2 v = voronoi2(vWorld.xz * 6.0);
    float plates = (1.0 - smoothstep(0.0, 0.15, v.x)) * (1.0 - smoothstep(0.35, 0.95, r));
    float ring = exp(-pow((r - 0.62) * 9.0, 2.0));
    float glow = dendrite * 1.2 + plates * 0.6 + ring * 0.8;
    float m = glow * uFade * (1.0 - smoothstep(0.85, 1.0, r)) * uShaderIntensity;
    if (m < 0.003) discard;
    vec3 col = mix(uColorB, uColorA, clamp(dendrite + ring * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col * m * uGlow * uGlobalGlow, m);
  }
`;

/** The rime rosette under every statue (one material, shared). */
export function createRosetteMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uClock: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1.2 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: ROSETTE_VERTEX,
    fragmentShader: ROSETTE_FRAGMENT
  });

  /** @param {{clock:number, fade:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uClock.value = state.clock;
    u.uFade.value = state.fade;
    u.uGlow.value = c.ringGlow * g.glow;
    u.uColorA.value.copy(getColor(c.colorRimeA));
    u.uColorB.value.copy(getColor(c.colorRimeB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The ice (statue)                                                     */
/* -------------------------------------------------------------------- */

/**
 * One per pooled statue slot, so each statue's ice climbs on its own clock.
 * All slots share one compiled program (same cache key).
 */
export function createStatueMaterial() {
  const material = new MeshStandardMaterial({
    color: 0x84d9ff,
    emissive: 0x12517a,
    emissiveIntensity: 0.8,
    roughness: 0.22,
    metalness: 0.1,
    transparent: true,
    opacity: 0.78
  });
  const ice = {
    grow: { value: 1 },
    frost: { value: 1.2 },
    rim: { value: 1.4 },
    floorY: { value: 0 },
    height: { value: 1.8 },
    rimColor: { value: new Color(0.9, 0.98, 1) }
  };
  material.userData.ice = ice;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uIceGrow = ice.grow;
    shader.uniforms.uIceFrost = ice.frost;
    shader.uniforms.uIceRim = ice.rim;
    shader.uniforms.uIceFloor = ice.floorY;
    shader.uniforms.uIceHeight = ice.height;
    shader.uniforms.uIceRimColor = ice.rimColor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vIceWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvIceWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vIceWorld;
        uniform float uIceGrow;
        uniform float uIceFrost;
        uniform float uIceRim;
        uniform float uIceFloor;
        uniform float uIceHeight;
        uniform vec3 uIceRimColor;
        ${noiseGLSL}`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // The ice climbs from the feet. Above its line the body is still
          // there, dark and dull, so nothing pops while the ice catches up.
          float iceH = (vIceWorld.y - uIceFloor) / max(uIceHeight, 0.05);
          float iceN = snoise01(vIceWorld * 7.0);
          float iceKeep = uIceGrow * 1.2 - iceH + (iceN - 0.5) * 0.2;
          float iced = smoothstep(0.0, 0.05, iceKeep);
          float iceLip = (1.0 - smoothstep(0.0, 0.08, abs(iceKeep))) * step(uIceGrow, 0.999);
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.3 + vec3(0.03), diffuseColor.rgb, iced);
          // Hoarfrost: sharp-edged noise flecks.
          float frost = smoothstep(0.55, 0.8, snoise01(vIceWorld * 22.0)) * uIceFrost;
          vec3 V = normalize(vViewPosition);
          float rim = pow(1.0 - abs(dot(normal, V)), 2.5) * uIceRim;
          totalEmissiveRadiance *= mix(0.2, 1.0, iced);
          totalEmissiveRadiance += uIceRimColor * ((rim + frost * 0.6) * iced + iceLip * 2.0);
        }`
      );
  };
  material.customProgramCacheKey = () => 'absolute-zero-thread-ice-v2';

  /** @param {{grow:number, opacity:number, floor:number, height:number}} state */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    material.opacity = c.statueOpacity * state.opacity * g.opacity;
    material.color.copy(getColor(c.colorStatue));
    material.emissive.copy(getColor(c.colorStatueEmissive));
    material.emissiveIntensity = c.statueGlow * g.glow;
    ice.grow.value = state.grow;
    ice.floorY.value = state.floor;
    ice.height.value = state.height;
    ice.frost.value = c.statueFrost;
    ice.rim.value = c.statueRim * g.fresnel;
    ice.rimColor.value.copy(getColor(c.colorStatueRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The shards                                                           */
/* -------------------------------------------------------------------- */

const SHARD_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uOpacity;
  uniform vec3  uColor;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float rim = fresnelTerm(vViewDir, vNormalW, 2.0, 1.0);
    // A bright seam up the middle of each crystal, and frost at its foot.
    float seam = exp(-pow(length(vLocal.xz) * 18.0, 2.0)) * smoothstep(0.0, 0.8, vLocal.y);
    float foot = 1.0 - smoothstep(0.0, 0.25, vLocal.y);
    float fleck = smoothstep(0.6, 0.85, snoise01(vWorld * 20.0));
    vec3 col = uColor * (0.45 + 0.4 * fleck) + uColorRim * (rim * 1.4 + seam * 1.5 + foot * 0.5);
    float a = clamp((0.5 + rim * 0.5) * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, a);
  }
`;

/** Instanced ice shards. Normal-blended translucent ice with emissive rims. */
export function createShardMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uGlow: { value: 1.2 },
      uOpacity: { value: 0.82 },
      uColor: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: LIT_VERTEX,
    fragmentShader: SHARD_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.shardGlow * g.glow;
    u.uOpacity.value = 0.82 * g.opacity;
    u.uColor.value.copy(getColor(c.colorShard));
    u.uColorRim.value.copy(getColor(c.colorShardRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The chips                                                            */
/* -------------------------------------------------------------------- */

const CHIP_VERTEX = /* glsl */ `
  attribute float seed;
  uniform float uAge;
  uniform float uLife;
  uniform float uSpeed;
  uniform float uSize;

  varying float vA;
  varying float vSeed;

  void main() {
    float t = uAge;
    vSeed = seed;
    // Ballistic: thrown out along the baked direction, falling under gravity.
    vec3 p = position * uSpeed * t * (0.7 + seed * 0.6);
    p.y += 0.8 - t * t * 2.2;
    vA = (1.0 - smoothstep(0.3, 1.0, t / max(0.01, uLife))) * step(0.0, p.y);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp((uSize + seed * uSize) / max(0.5, -mv.z), 1.0, 7.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const CHIP_FRAGMENT = /* glsl */ `
  uniform float uAge;
  uniform vec3  uColor;
  uniform float uGlobalGlow;

  varying float vA;
  varying float vSeed;

  void main() {
    // A spinning diamond rather than a dot.
    vec2 q = gl_PointCoord - 0.5;
    float ang = vSeed * 6.2831 + uAge * (4.0 + vSeed * 6.0);
    float s = sin(ang);
    float c = cos(ang);
    q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    vec2 p = abs(q) * 2.0;
    float chip = 1.0 - smoothstep(0.65, 1.0, p.x + p.y);
    float a = chip * vA;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor * (0.8 + 0.6 * vSeed) * uGlobalGlow * a, a);
  }
`;

/** One shatter burst (the cast pools eight). */
export function createChipMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uAge: { value: 0 },
      uLife: { value: 1 },
      uSpeed: { value: 1 },
      uSize: { value: 12 },
      uColor: { value: new Color() }
    }),
    vertexShader: CHIP_VERTEX,
    fragmentShader: CHIP_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    material.uniforms.uSize.value = c.chipSize * g.particleSize;
    material.uniforms.uColor.value.copy(getColor(c.colorChip));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The frost spine (hero)                                               */
/* -------------------------------------------------------------------- */

/**
 * Lit, opaque ice for the instanced spine and terminal cluster. Lighting,
 * shadows and the env reflection come from MeshStandardMaterial; the patch
 * adds the ramp: deep stop in the facets turned from the eye, body, a white
 * fresnel rim, voronoi-ish frost clouding and the travelling pulse.
 */
export function createSpineMaterial() {
  const material = new MeshStandardMaterial({
    color: 0xbfe9ff,
    roughness: 0.14,
    metalness: 0,
    flatShading: true,
    envMapIntensity: 1.2
  });
  const uniforms = {
    uTime: { value: 0 },
    uSpineDeep: { value: new Color('#0b2f5c') },
    uSpineRim: { value: new Color('#e8fbff') },
    uSpineCore: { value: new Color('#ffffff') },
    uSpineGlow: { value: 0.35 },
    uSpineRimGlow: { value: 1.2 },
    uSpineFresnel: { value: 3 },
    uSpinePulse: { value: 1.5 }
  };
  patchOnBeforeCompile(
    material,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
  attribute float aPulse;
  varying float vPulse;
  varying vec3 vSpineLocal;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
  vPulse = aPulse;
  vSpineLocal = position;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
  uniform float uTime;
  uniform vec3 uSpineDeep;
  uniform vec3 uSpineRim;
  uniform vec3 uSpineCore;
  uniform float uSpineGlow;
  uniform float uSpineRimGlow;
  uniform float uSpineFresnel;
  uniform float uSpinePulse;
  varying float vPulse;
  varying vec3 vSpineLocal;
  float spineHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
  {
    vec3 nV = normalize(normal);
    vec3 vV = normalize(vViewPosition);
    float facing = clamp(abs(dot(nV, vV)), 0.0, 1.0);
    float rim = pow(1.0 - facing, uSpineFresnel);
    // Frost clouding up the crystal: banded, hashed per facet height.
    float cloud = spineHash(floor(vSpineLocal * vec3(9.0, 14.0, 9.0)));
    float core = exp(-pow(length(vSpineLocal.xz) * 12.0, 2.0)) * smoothstep(0.05, 0.7, vSpineLocal.y);
    diffuseColor.rgb = mix(uSpineDeep, diffuseColor.rgb, 0.35 + 0.65 * facing);
    totalEmissiveRadiance += uSpineDeep * uSpineGlow * (0.6 + 0.8 * cloud);
    totalEmissiveRadiance += uSpineRim * rim * uSpineRimGlow;
    totalEmissiveRadiance += uSpineCore * (core * 0.6 + vPulse * (0.35 + rim)) * uSpinePulse * vPulse;
  }`
        );
    },
    'azt-spine'
  );
  material.userData.sync = (clock) => {
    const c = settings[ID];
    const g = settings.global;
    const u = uniforms;
    u.uTime.value = clock;
    material.color.copy(getColor(c.colorSpine));
    material.roughness = c.spineRough;
    u.uSpineDeep.value.copy(getColor(c.colorSpineDeep));
    u.uSpineRim.value.copy(getColor(c.colorSpineRim));
    u.uSpineCore.value.copy(getColor(c.colorSpineCore));
    u.uSpineGlow.value = c.spineGlow * g.glow * g.shaderIntensity;
    u.uSpineRimGlow.value = c.spineRimGlow * g.glow;
    u.uSpineFresnel.value = Math.max(0.3, c.spineFresnel / Math.max(0.05, g.fresnel));
    u.uSpinePulse.value = c.pulseGlow * g.glow;
  };
  return material;
}
