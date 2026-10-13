import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  ShaderMaterial,
  Vector3,
  Vector4
} from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * The three bespoke surfaces of the Meteor Swarm.
 *
 *   - `createMeteorRockMaterial`   — the rocks themselves: cooled black crust
 *     split by molten seams, with the face that is ploughing into the air
 *     glowing hottest. A patched MeshStandardMaterial so the rocks cast real
 *     shadows on the way down — the shadow racing across the floor toward its
 *     own mark is half of what sells the slant.
 *   - `createMeteorSheathMaterial` — the entry flame: an additive teardrop
 *     wrapped round each rock and pulled out up the flight path in the vertex
 *     shader, so one sphere serves every slant the editor can set.
 *   - `createMeteorGroundMaterial` — the telegraph: the circle's boundary ring
 *     and one closing mark per rock, then the molten bed each one leaves.
 *
 * All three read `settings.swarm` through `userData.sync`, every frame.
 */

/** Must match MAX_METEORS in the ability — the mark array is fixed size. */
export const METEOR_SWARM_MAX = 64;

/* ==================================================================== */
/* The rock                                                              */
/* ==================================================================== */

/**
 * Molten-crack rock.
 *
 * The seams are the zero set of a simplex field sampled in the rock's *local*
 * space — `abs(snoise)` is near zero along thin connected lines, which is what a
 * crust cracking over a molten interior looks like, and sampling it in local
 * space welds the network to the rock as it tumbles. A second, finer octave
 * adds the hairline cracks that branch off the big ones.
 *
 * The leading face is lit from the *direction of travel*, not from a light: a
 * meteor is heated by the air it is ramming, so the face whose world normal
 * points down the shared fall direction is the incandescent one, and the
 * trailing face stays black. `aHeat` (0 → 1 over the descent) drives how hot
 * the whole rock is, so it visibly ignites as it comes down.
 */
export function createMeteorRockMaterial(environment) {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.0,
    flatShading: true
  });

  const uniforms = {
    uTime: frame.uTime,
    uFallDir: { value: new Vector3(0, -1, 0) },
    uCrackScale: { value: 2.6 },
    uCrackWidth: { value: 0.16 },
    uCrackGlow: { value: 4.5 },
    uCrackFlow: { value: 0.9 },
    uLeadHeat: { value: 2.2 },
    uLeadPower: { value: 2.5 },
    uRimGlow: { value: 1.4 },
    uRimPower: { value: 2.8 },
    uGlow: { value: 1 },
    uColorCrust: { value: new Color() },
    uColorCrustLit: { value: new Color() },
    uColorMagma: { value: new Color() },
    uColorHot: { value: new Color() },
    uColorRim: { value: new Color() }
  };

  environment.registerShadowCasterWithPatch(
    material,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute float aSeed;
           attribute float aHeat;
           varying vec3  vRockLocal;
           varying vec3  vRockNormalW;
           varying float vRockSeed;
           varying float vRockHeat;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vRockLocal = transformed;
           vRockSeed = aSeed;
           vRockHeat = aHeat;
           // World-space normal, because the heat is keyed off the world fall
           // direction. The instance matrix carries rotation + uniform scale
           // only, so its upper 3x3 is a valid normal matrix after normalising.
           #ifdef USE_INSTANCING
             vRockNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
           #else
             vRockNormalW = normalize(mat3(modelMatrix) * objectNormal);
           #endif`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform vec3  uFallDir;
           uniform float uCrackScale;
           uniform float uCrackWidth;
           uniform float uCrackGlow;
           uniform float uCrackFlow;
           uniform float uLeadHeat;
           uniform float uLeadPower;
           uniform float uRimGlow;
           uniform float uRimPower;
           uniform float uGlow;
           uniform vec3  uColorCrust;
           uniform vec3  uColorCrustLit;
           uniform vec3  uColorMagma;
           uniform vec3  uColorHot;
           uniform vec3  uColorRim;
           varying vec3  vRockLocal;
           varying vec3  vRockNormalW;
           varying float vRockSeed;
           varying float vRockHeat;
           ${noiseGLSL}`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           {
             vec3  N   = normalize(normal);
             float ndv = clamp(dot(N, normalize(vViewPosition)), 0.0, 1.0);

             /* --- the seams --------------------------------------------- */
             vec3 cp = vRockLocal * uCrackScale + vRockSeed * 13.7;
             float big  = abs(snoise(cp));
             float fine = abs(snoise(cp * 2.31 + vec3(7.1, 3.3, 1.9)));
             float seam = 1.0 - smoothstep(0.0, uCrackWidth, big);
             // Hairlines only branch off near a big seam — a crust breaks from
             // the main fracture outward, not in a uniform crazing.
             float hair = (1.0 - smoothstep(0.0, uCrackWidth * 0.55, fine)) *
                          (1.0 - smoothstep(uCrackWidth, uCrackWidth * 4.0, big));
             float crack = clamp(seam + hair * 0.6, 0.0, 1.0);

             // The melt crawls: brightness pumps along the seams over time.
             float pump = 0.62 + 0.38 * snoise(cp * 0.7 + vec3(0.0, uTime * uCrackFlow, vRockSeed));

             /* --- the face ramming the air -------------------------------- */
             float lead = pow(clamp(dot(normalize(vRockNormalW), normalize(uFallDir)), 0.0, 1.0), uLeadPower);
             lead *= uLeadHeat * (0.35 + 0.65 * vRockHeat);

             /* --- crust ---------------------------------------------------- */
             float grain = fbm3(vRockLocal * 5.3 + vRockSeed * 3.0) * 0.5 + 0.5;
             vec3 crust = mix(uColorCrust, uColorCrustLit, grain);
             // Charred toward the seams: a crack is a shadow before it is a light.
             crust *= 1.0 - (1.0 - smoothstep(uCrackWidth, uCrackWidth * 3.0, big)) * 0.6;
             diffuseColor.rgb *= crust * (1.0 - crack * 0.85);

             /* --- what emits ------------------------------------------------ */
             float heat = clamp(lead * 0.45 + pump * 0.35 + vRockHeat * 0.3, 0.0, 1.0);
             vec3 melt = mix(uColorMagma, uColorHot, heat);
             vec3 glow = melt * crack * uCrackGlow * pump * (0.45 + 0.55 * vRockHeat);
             glow += melt * lead * (0.3 + crack);
             glow += uColorRim * pow(1.0 - ndv, uRimPower) * uRimGlow * (0.4 + 0.6 * vRockHeat);
             glow *= uGlow;
             // Soft ceiling so the leading face keeps a hue under the bloom.
             glow /= 1.0 + glow * 0.3;
             totalEmissiveRadiance += glow;
           }`
        );
    },
    'meteor-swarm-rock'
  );

  material.userData.uniforms = uniforms;

  /** @param {THREE.Vector3} fallDir unit, the shared direction of travel */
  material.userData.sync = (fallDir) => {
    const c = settings.swarm;
    const g = settings.global;

    uniforms.uFallDir.value.copy(fallDir);
    uniforms.uCrackScale.value = c.crackScale * g.noiseFrequency;
    uniforms.uCrackWidth.value = c.crackWidth;
    uniforms.uCrackGlow.value = c.crackGlow * g.shaderIntensity;
    uniforms.uCrackFlow.value = c.crackFlow * g.noiseSpeed;
    uniforms.uLeadHeat.value = c.leadHeat * g.shaderIntensity;
    uniforms.uLeadPower.value = c.leadPower;
    uniforms.uRimGlow.value = c.rimGlow * g.fresnel;
    uniforms.uRimPower.value = c.rimPower;
    uniforms.uGlow.value = c.rockGlow * g.glow;
    uniforms.uColorCrust.value.copy(getColor(c.colorCrust));
    uniforms.uColorCrustLit.value.copy(getColor(c.colorCrustLit));
    uniforms.uColorMagma.value.copy(getColor(c.colorMagma));
    uniforms.uColorHot.value.copy(getColor(c.colorMagmaHot));
    uniforms.uColorRim.value.copy(getColor(c.colorRim));
    material.roughness = c.rockRoughness;
  };

  return material;
}

/* ==================================================================== */
/* The entry flame                                                       */
/* ==================================================================== */

/**
 * One unit sphere per rock, instanced, pulled into a teardrop up the path.
 *
 * The trailing hemisphere (every vertex whose direction from the centre points
 * back up the fall line) is pushed out along that line by `uTail` and pinched
 * toward the axis, so the bow hugs the rock and the tail streams away from it.
 * The normals are flattened toward the lateral plane by the same weight: a
 * teardrop's tail is a tube, and a tube seen side-on faces the camera along its
 * centre line — keep the sphere's backward-pointing normals and the facing term
 * below would make the tail vanish exactly where it should be brightest.
 *
 * The brightness term is `pow(ndv, falloff)` (facing, not grazing) on the
 * BackSide, for the same reason the Venom core does it: a flame is a volume,
 * and the far wall is naturally occluded by the rock sitting inside it.
 */
const SHEATH_VERTEX = /* glsl */ `
  uniform vec3  uFallDir;
  uniform float uTail;

  attribute float aFade;
  attribute float aSeed;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vLocal;
  varying float vAlong;
  varying float vFade;
  varying float vSeed;
  varying float vViewZ;

  void main() {
    vec3 back = -normalize(uFallDir);
    vec3 dir  = normalize(position);
    float b   = max(dot(dir, back), 0.0);

    vec3 p = position;
    float axial = dot(p, back);
    vec3 lateral = p - back * axial;
    // Pinch, then pull: narrower and longer the further round the back.
    lateral *= mix(1.0, 0.38, b * b);
    p = lateral + back * (axial + pow(b, 1.6) * uTail);

    vec3 n = normalize(normal - back * dot(normal, back) * b * 0.9);

    mat4 inst = mat4(1.0);
    #ifdef USE_INSTANCING
      inst = instanceMatrix;
    #endif

    vec4 world = modelMatrix * inst * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * mat3(inst) * n);
    vViewDir = cameraPosition - world.xyz;
    vLocal = p;
    vAlong = b;
    vFade = aFade;
    vSeed = aSeed;

    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHEATH_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3  uFallDir;
  uniform float uFalloff;
  uniform float uNoise;
  uniform float uNoiseScale;
  uniform float uFlow;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uSoftFade;
  uniform vec3  uColorCore;
  uniform vec3  uColorMid;
  uniform vec3  uColorEdge;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying vec3  vLocal;
  varying float vAlong;
  varying float vFade;
  varying float vSeed;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    if (vFade < 0.004) discard;

    float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    float density = pow(clamp(ndv, 0.0, 1.0), uFalloff);

    // Torn flame streaming back up the path: the field slides along the fall
    // line, so every tear travels from the bow to the tip of the tail.
    vec3 back = -normalize(uFallDir);
    vec3 np = vLocal * uNoiseScale - back * uTime * uFlow + vec3(vSeed * 17.0);
    float n = fbm3(np) * 0.5 + 0.5;
    density *= mix(1.0, n * 1.7, clamp(uNoise, 0.0, 1.0));

    // Thins out to nothing at the tip, so the tail never ends in a cap.
    density *= 1.0 - smoothstep(0.45, 1.0, vAlong);

    // White at the bow, orange through the body, deep red off the tail.
    float t = clamp(vAlong * 0.8 + (1.0 - clamp(density, 0.0, 1.0)) * 0.4, 0.0, 1.0);
    vec3 color = mix(uColorCore, uColorMid, smoothstep(0.0, 0.45, t));
    color = mix(color, uColorEdge, smoothstep(0.45, 1.0, t));

    float alpha = clamp(density, 0.0, 1.0) * uOpacity * vFade;
    if (alpha < 0.004) discard;

    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(color * uIntensity * uGlobalGlow, alpha);
  }
`;

export function createMeteorSheathMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: BackSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFallDir: { value: new Vector3(0, -1, 0) },
      uTail: { value: 4.5 },
      uFalloff: { value: 1.6 },
      uNoise: { value: 0.55 },
      uNoiseScale: { value: 2.4 },
      uFlow: { value: 3.5 },
      uIntensity: { value: 3.2 },
      uOpacity: { value: 0.85 },
      uSoftFade: { value: 0.35 },
      uColorCore: { value: new Color() },
      uColorMid: { value: new Color() },
      uColorEdge: { value: new Color() }
    }),
    vertexShader: SHEATH_VERTEX,
    fragmentShader: SHEATH_FRAGMENT
  });

  material.userData.sync = (fallDir) => {
    const c = settings.swarm;
    const g = settings.global;
    const u = material.uniforms;

    u.uFallDir.value.copy(fallDir);
    u.uTail.value = c.sheathTail;
    u.uFalloff.value = c.sheathFalloff;
    u.uNoise.value = c.sheathNoise * g.noiseStrength;
    u.uNoiseScale.value = c.sheathNoiseScale * g.noiseFrequency;
    u.uFlow.value = c.sheathFlow * g.noiseSpeed;
    u.uIntensity.value = c.sheathIntensity * g.glow;
    u.uOpacity.value = c.sheathOpacity * g.opacity;
    u.uSoftFade.value = c.sheathSoftFade;
    u.uColorCore.value.copy(getColor(c.colorSheathCore));
    u.uColorMid.value.copy(getColor(c.colorSheathMid));
    u.uColorEdge.value.copy(getColor(c.colorSheathEdge));
  };

  return material;
}

/* ==================================================================== */
/* The telegraph                                                         */
/* ==================================================================== */

/**
 * The marked circle — one quad laid on the floor, everything in metres.
 *
 * `uPips[i]` is one rock: `xy` its landing point relative to the centre of the
 * circle, `z` how far its mark has closed (−1 while it is not up, 0 → 1 up to
 * the moment of landing), `w` its fade-in as a *negative* number while the mark
 * is up and then, once the rock has landed, how hot the bed it left still is
 * (1 → 0). A mark is a ring that *tightens* onto its point — starting
 * `pipTighten` times wider and closing to `pipSize` as its rock comes in — with
 * four gaps cut in it so it reads as a reticle rather than a ripple, and a dot
 * at the centre that flickers faster the closer the rock is. That countdown is
 * the whole telegraph: you can read the landing order off the floor.
 *
 * Additive. The craters are charred by the SCORCH decals underneath; this layer
 * only ever adds light, and an additive mark cannot hide the decal it sits on.
 */
const GROUND_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  #define MAX_PIPS ${METEOR_SWARM_MAX}
  #define TAU 6.28318530718

  uniform float uTime;
  uniform float uQuadSize;
  uniform float uRadius;
  uniform float uReveal;      // 0 → 1 as the ring draws on
  uniform float uFade;
  uniform float uOpacity;
  uniform float uSurge;       // 0..1 how much of the volley is in the air
  uniform float uRingWidth;
  uniform float uRingGlow;
  uniform float uTicks;
  uniform float uTickSpin;
  uniform float uFill;
  uniform float uFillNoise;
  uniform float uFillScale;
  uniform float uFillRise;
  uniform float uPipSize;
  uniform float uPipWidth;
  uniform float uPipTighten;
  uniform float uPipGlow;
  uniform float uPipDot;
  uniform float uPipBlink;
  uniform float uCraterSize;
  uniform float uCraterGlow;
  uniform float uSeed;
  uniform int   uPipCount;
  uniform vec4  uPips[MAX_PIPS];
  uniform vec3  uColorRing;
  uniform vec3  uColorHot;
  uniform vec3  uColorPip;
  uniform vec3  uColorField;
  uniform vec3  uColorCrater;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    vec2 p = vec2(vUv.x - 0.5, 0.5 - vUv.y) * uQuadSize;
    float rad = length(p);
    float ang = atan(p.y, p.x);
    float aa = fwidth(rad) + 0.01;

    vec3 color = vec3(0.0);

    /* ---- the boundary ring, drawn on round the circle ---- */
    // The reveal sweeps the ring on by angle, so the circle is *drawn* rather
    // than faded in — the cast is marking its target.
    float sweep = step(fract(ang / TAU + 0.25), uReveal);
    float ring = smoothstep(uRingWidth + aa, 0.0, abs(rad - uRadius));
    float halo = exp(-abs(rad - uRadius) * 6.0) * 0.25;
    // Rotating tick band just inside it.
    float tickBand = smoothstep(0.16 + aa, 0.0, abs(rad - (uRadius - 0.28)));
    float ticks = step(0.55, fract(ang / TAU * uTicks + uTime * uTickSpin));
    color += mix(uColorRing, uColorHot, uSurge * 0.6) * (ring + halo + tickBand * ticks * 0.35) * sweep * uRingGlow;

    /* ---- the heat wash inside ---- */
    float inside = smoothstep(uRadius + aa, uRadius - 0.4, rad);
    float wash = fbm3(vec3(p * uFillScale, uTime * 0.4 + uSeed)) * 0.5 + 0.5;
    wash = mix(1.0, wash * 1.6, uFillNoise);
    color += uColorField * inside * wash * uFill * (1.0 + uSurge * uFillRise) * uReveal;

    /* ---- one mark per rock, then the bed it leaves ---- */
    for (int i = 0; i < MAX_PIPS; i++) {
      if (i >= uPipCount) break;
      vec4 pip = uPips[i];
      vec2 d2 = p - pip.xy;
      float d = length(d2);
      // Cheap reject: nothing of a mark reaches further than its widest ring.
      if (d > uPipSize * max(uPipTighten, 1.0) + uCraterSize + 0.3) continue;

      float closing = pip.z;
      if (closing >= 0.0) {
        float k = closing * closing;
        float r = uPipSize * mix(uPipTighten, 1.0, k);
        float circle = smoothstep(uPipWidth + aa, 0.0, abs(d - r));
        // Four gaps, turning slowly as it closes: a reticle, not a ripple.
        float a = atan(d2.y, d2.x) + closing * 1.2;
        float gaps = smoothstep(0.08, 0.2, abs(fract(a / TAU * 4.0) - 0.5));
        // Negative w while a mark is up is its fade-in (see the ability).
        float appear = clamp(-pip.w, 0.0, 1.0);
        float blink = 0.65 + 0.35 * sin(uTime * uPipBlink * (0.4 + 2.0 * k));
        float pin = smoothstep(uPipDot + aa, 0.0, d) * (0.25 + 0.75 * k) * blink;
        // Hotter and whiter the closer the rock.
        vec3 tint = mix(uColorPip, uColorHot, k);
        color += tint * (circle * gaps * (0.6 + 0.8 * k) + pin * 1.6) * appear * uPipGlow;
      }

      float heat = max(pip.w, 0.0);
      if (heat > 0.0) {
        // A molten bed, broken up by noise so no two read as the same disc.
        float n = snoise(vec3(d2 * 3.2, uSeed + float(i) * 1.7)) * 0.5 + 0.5;
        float bed = smoothstep(uCraterSize, uCraterSize * 0.15, d + n * 0.25 * uCraterSize);
        float veins = pow(1.0 - abs(snoise(vec3(d2 * 5.0, float(i) * 3.1))), 6.0);
        float glow = bed * (0.55 + 0.45 * veins) * heat * heat;
        color += mix(uColorCrater, uColorHot, heat * 0.6 * veins) * glow * uCraterGlow;
      }
    }

    color *= uFade * uOpacity * uGlobalGlow;
    if (max(color.r, max(color.g, color.b)) < 0.002) discard;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createMeteorGroundMaterial() {
  const pips = [];
  for (let i = 0; i < METEOR_SWARM_MAX; i++) pips.push(new Vector4(0, 0, -1, 0));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 10 },
      uRadius: { value: 3.6 },
      uReveal: { value: 0 },
      uFade: { value: 1 },
      uOpacity: { value: 1 },
      uSurge: { value: 0 },
      uRingWidth: { value: 0.09 },
      uRingGlow: { value: 2.4 },
      uTicks: { value: 36 },
      uTickSpin: { value: 0.12 },
      uFill: { value: 0.12 },
      uFillNoise: { value: 0.6 },
      uFillScale: { value: 1.4 },
      uFillRise: { value: 1.5 },
      uPipSize: { value: 0.55 },
      uPipWidth: { value: 0.05 },
      uPipTighten: { value: 2.6 },
      uPipGlow: { value: 2.6 },
      uPipDot: { value: 0.12 },
      uPipBlink: { value: 9 },
      uCraterSize: { value: 0.75 },
      uCraterGlow: { value: 2.6 },
      uSeed: { value: 0 },
      uPipCount: { value: 0 },
      uPips: { value: pips },
      uColorRing: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorPip: { value: new Color() },
      uColorField: { value: new Color() },
      uColorCrater: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT
  });

  /** The marks, written in place by the ability. */
  material.userData.pips = pips;

  /** @param {object} state { quadSize, radius, reveal, fade, surge, count, seed } */
  material.userData.sync = (state) => {
    const c = settings.swarm;
    const g = settings.global;
    const u = material.uniforms;

    u.uQuadSize.value = state.quadSize;
    u.uRadius.value = state.radius;
    u.uReveal.value = state.reveal;
    u.uFade.value = state.fade;
    u.uSurge.value = state.surge;
    u.uPipCount.value = state.count;
    u.uSeed.value = state.seed;

    u.uOpacity.value = c.fieldOpacity * g.opacity;
    u.uRingWidth.value = c.ringWidth;
    u.uRingGlow.value = c.ringGlow * g.shaderIntensity;
    u.uTicks.value = Math.max(1, Math.round(c.ringTicks));
    u.uTickSpin.value = c.ringTickSpin * g.animationSpeed;
    u.uFill.value = c.fieldFill * g.shaderIntensity;
    u.uFillNoise.value = c.fieldNoise * g.noiseStrength;
    u.uFillScale.value = c.fieldNoiseScale * g.noiseFrequency;
    u.uFillRise.value = c.fieldRise;
    u.uPipSize.value = c.pipSize;
    u.uPipWidth.value = c.pipWidth;
    u.uPipTighten.value = c.pipTighten;
    u.uPipGlow.value = c.pipGlow * g.shaderIntensity;
    u.uPipDot.value = c.pipDot;
    u.uPipBlink.value = c.pipBlink;
    u.uCraterSize.value = c.craterSize;
    u.uCraterGlow.value = c.craterGlow * g.shaderIntensity;

    u.uColorRing.value.copy(getColor(c.colorRing));
    u.uColorHot.value.copy(getColor(c.colorRingHot));
    u.uColorPip.value.copy(getColor(c.colorPip));
    u.uColorField.value.copy(getColor(c.colorField));
    u.uColorCrater.value.copy(getColor(c.colorCrater));
  };

  return material;
}
