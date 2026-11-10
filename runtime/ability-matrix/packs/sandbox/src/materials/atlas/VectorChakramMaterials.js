import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector2 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/* ====================================================================== */
/* 1 · The disc                                                            */
/* ====================================================================== */

/**
 * The chakram blade: brushed metal with a live cutting edge.
 *
 * A raw ShaderMaterial — the disc is small, fast and bright, and what sells it
 * is the *edge*, not physically based shading. It is lit by hand from the
 * same sun direction the stage uses (`frame.uLightDir`) and reflects the sky
 * probe (`frame.uEnvMap`), so it sits in the scene:
 *
 *   - **metal** — a two-tone base (`uMetal` → `uMetalDark` by facing), a
 *     Blinn specular from the sun, the sky probe in the reflection vector
 *     blurred by roughness (a cheap mip bias), and **radial brushing**: a hash
 *     streak per angular slice stretched along the radius, which is how a
 *     turned and polished blade catches the light while it spins.
 *   - **energy** — three channels, all from `aRing` (see the geometry):
 *     the **cutting edge** (`aRing.x` near 1) burns in `uColorEnergy`; a
 *     **groove** round the hub carries packets that run *against* the spin so
 *     they read at any spin rate; and the **tooth tips** (`aRing.z` near 1)
 *     are white-hot.
 *   - **hit flare** — on every bank the whole blade flashes toward
 *     `uColorHot` and decays (`uFlare`), so a ricochet is visible at range.
 */
const DISC_VERTEX = /* glsl */ `
  attribute vec3 aRing;

  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vRing;

  void main() {
    vRing = aRing;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const DISC_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform sampler2D uEnvMap;
  uniform float uHasEnv;

  uniform float uSeed;
  uniform float uEnv;
  uniform float uRoughness;
  uniform float uBrushed;
  uniform float uRimEnergy;
  uniform float uRimWidth;
  uniform float uChannel;
  uniform float uChannelSpeed;
  uniform float uTipHeat;
  uniform float uFlare;
  uniform float uCharge;
  uniform float uFresnel;
  uniform float uTeeth;
  uniform vec3  uMetal;
  uniform vec3  uMetalDark;
  uniform vec3  uColorEnergy;
  uniform vec3  uColorHot;

  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vRing;

  ${noiseGLSL}

  const float PI = 3.14159265359;

  vec3 sky(vec3 dir, float rough) {
    vec3 fallback = mix(uMetalDark, vec3(0.9, 0.85, 0.75), dir.y * 0.5 + 0.5);
    vec2 uv = vec2(atan(dir.z, dir.x) / (2.0 * PI) + 0.5, asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5);
    vec3 env = min(textureLod(uEnvMap, uv, rough * 6.0).rgb, vec3(6.0));
    return mix(fallback, env, uHasEnv);
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndl = clamp(dot(N, L), 0.0, 1.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    float radius = vRing.x;
    float around = vRing.y;

    /* --- brushed: a streak per thin angular slice, along the radius --- */
    float slice = floor(around * 420.0 + uSeed);
    float streak = hash11(slice) * 0.6 + hash11(floor(radius * 6.0) + slice * 0.37) * 0.4;
    float brush = mix(1.0, 0.55 + streak * 0.9, uBrushed);

    vec3 base = mix(uMetalDark, uMetal, 0.35 + 0.65 * ndl) * brush;
    float gloss = mix(260.0, 12.0, uRoughness);
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), gloss) * (1.0 - uRoughness * 0.7) * 3.0 * brush;
    float fres = clamp(uFresnel * pow(1.0 - ndv, 4.0), 0.0, 1.0);
    vec3 refl = sky(reflect(-V, N), uRoughness) * uEnv;
    vec3 metal = base * 0.35 + base * refl * (0.6 + fres) + vec3(spec) * mix(uMetal, vec3(1.0), 0.5);

    /* --- energy: cutting edge, the groove, the tooth tips --- */
    float edge = smoothstep(1.0 - uRimWidth, 1.0, radius);
    float groove = exp(-pow((radius - 0.12) * 18.0, 2.0));
    float packets = pow(0.5 + 0.5 * sin((around * uTeeth * 2.0 + uTime * uChannelSpeed) * 2.0 * PI), 6.0);
    float tip = smoothstep(0.75, 1.0, vRing.z) * edge;
    float crawl = 0.7 + 0.6 * snoise(vec3(around * 30.0, radius * 4.0, uTime * 6.0 + uSeed)) * uShaderIntensity;

    vec3 energy = uColorEnergy * edge * uRimEnergy * crawl
                + uColorEnergy * groove * packets * uChannel
                + uColorHot * tip * uTipHeat;
    energy *= (0.4 + 0.6 * uCharge);

    vec3 color = metal + energy * uGlobalGlow;
    // The flare on a bank: the whole blade goes white-gold and decays.
    color += mix(uColorEnergy, uColorHot, 0.6) * uFlare * (0.4 + edge) * uGlobalGlow;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createChakramDiscMaterial() {
  const material = new ShaderMaterial({
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uHasEnv: { value: 0 },
      uSeed: { value: Math.random() * 100 },
      uEnv: { value: 1 },
      uRoughness: { value: 0.3 },
      uBrushed: { value: 0.5 },
      uRimEnergy: { value: 3 },
      uRimWidth: { value: 0.12 },
      uChannel: { value: 2 },
      uChannelSpeed: { value: 3 },
      uTipHeat: { value: 2.5 },
      uFlare: { value: 0 },
      uCharge: { value: 1 },
      uFresnel: { value: 1.4 },
      uTeeth: { value: 7 },
      uMetal: { value: new Color(0.7, 0.62, 0.45) },
      uMetalDark: { value: new Color(0.03, 0.02, 0.01) },
      uColorEnergy: { value: new Color(1, 0.85, 0.4) },
      uColorHot: { value: new Color(1, 1, 1) }
    }),
    vertexShader: DISC_VERTEX,
    fragmentShader: DISC_FRAGMENT
  });

  /** @param {object} s { flare, charge } */
  material.userData.sync = (s) => {
    const c = settings.chakram;
    const g = settings.global;
    const u = material.uniforms;
    u.uHasEnv.value = frame.uEnvMap.value ? 1 : 0;
    u.uFlare.value = s.flare * c.hitFlare;
    u.uCharge.value = s.charge;
    u.uEnv.value = c.envIntensity;
    u.uRoughness.value = c.roughness;
    u.uBrushed.value = c.brushed;
    u.uRimEnergy.value = c.rimEnergy * g.glow;
    u.uRimWidth.value = c.rimWidth;
    u.uChannel.value = c.channelEnergy * g.glow;
    u.uChannelSpeed.value = c.channelSpeed * g.animationSpeed;
    u.uTipHeat.value = c.tipHeat * g.glow;
    u.uFresnel.value = c.fresnel * g.fresnel;
    u.uTeeth.value = Math.max(3, Math.round(c.teeth));
    u.uMetal.value.copy(getColor(c.metalColor));
    u.uMetalDark.value.copy(getColor(c.metalDark));
    u.uColorEnergy.value.copy(getColor(c.colorEnergy));
    u.uColorHot.value.copy(getColor(c.colorEnergyHot));
  };

  return material;
}

/* ====================================================================== */
/* 2a · The smear                                                          */
/* ====================================================================== */

/**
 * Motion blur for a disc that turns faster than the frame rate can show.
 *
 * A flat quad coplanar with the blade, drawn additively over it. The blade's
 * silhouette is evaluated *analytically* (an annulus from the hub to the tooth
 * tips, teeth averaged out into a soft fringe) at six taps stepped back along
 * the disc's velocity (`uDir`, in the disc's own plane), each weaker than the
 * last, so the disc leaves a short ghost of itself. Over that, `uStreaks`
 * angular streaks scroll round at the spin rate — the rotational blur — and
 * the smear brightens with speed (`uAmount`).
 */
const SMEAR_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SMEAR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;

  uniform vec2  uDir;
  uniform float uStretch;
  uniform float uScale;
  uniform float uInner;
  uniform float uTip;
  uniform float uSpin;
  uniform float uStreaks;
  uniform float uAmount;
  uniform float uOpacity;
  uniform vec3  uColor;
  uniform vec3  uColorHot;

  varying vec2 vUv;

  ${noiseGLSL}

  float ring(vec2 p) {
    float r = length(p);
    return smoothstep(uInner * 0.85, uInner, r) * (1.0 - smoothstep(1.0, uTip, r));
  }

  void main() {
    // Quad space → blade radii.
    vec2 p = vUv * uScale;
    float acc = 0.0;
    float w = 1.0;
    float total = 0.0;
    for (int i = 0; i < 6; i++) {
      vec2 q = p + uDir * uStretch * float(i) / 5.0;
      acc += ring(q) * w;
      total += w;
      w *= 0.62;
    }
    acc /= total;

    float r = length(p);
    float a = atan(p.y, p.x);
    float streak = 0.5 + 0.5 * sin(a * uStreaks + uSpin * 6.0 + r * 3.0);
    streak = mix(0.6, 1.0, pow(streak, 3.0));
    float edge = smoothstep(0.75, 1.0, r) * (1.0 - smoothstep(1.0, uTip, r));

    float alpha = acc * streak * uAmount * uOpacity;
    if (alpha < 0.003) discard;
    vec3 color = mix(uColor, uColorHot, edge * 0.7) * uGlobalGlow;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createChakramSmearMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uDir: { value: new Vector2(1, 0) },
      uStretch: { value: 0.5 },
      uScale: { value: 1.6 },
      uInner: { value: 0.44 },
      uTip: { value: 1.26 },
      uSpin: { value: 0 },
      uStreaks: { value: 22 },
      uAmount: { value: 1 },
      uOpacity: { value: 0.5 },
      uColor: { value: new Color(1, 0.85, 0.4) },
      uColorHot: { value: new Color(1, 1, 1) }
    }),
    vertexShader: SMEAR_VERTEX,
    fragmentShader: SMEAR_FRAGMENT
  });

  /** @param {object} s { dirX, dirY, stretch, scale, spin, amount } */
  material.userData.sync = (s) => {
    const c = settings.chakram;
    const g = settings.global;
    const u = material.uniforms;
    u.uDir.value.set(s.dirX, s.dirY);
    u.uStretch.value = s.stretch;
    u.uScale.value = s.scale;
    u.uSpin.value = s.spin;
    u.uAmount.value = s.amount * c.smearStrength;
    u.uInner.value = c.innerRadius;
    u.uTip.value = 1 + c.toothDepth;
    u.uStreaks.value = c.smearStreaks;
    u.uOpacity.value = c.smearOpacity * g.opacity;
    u.uColor.value.copy(getColor(c.colorEnergy));
    u.uColorHot.value.copy(getColor(c.colorEnergyHot));
  };

  return material;
}

/* ====================================================================== */
/* 2b · The trail                                                          */
/* ====================================================================== */

/**
 * The ribbon the disc leaves behind (`ChakramTrailRibbon`).
 *
 * Camera-facing like a bolt, but its profile is set by **age**, not by
 * distance: a point is full width the instant the disc leaves it and narrows
 * to nothing over `trailLife`, so a fast leg leaves a long trail and the bite
 * on a bank leaves a fat knot — the trail *records* the ricochets. Colour runs
 * head → tail by age with the edge colour on the rim, and speed lines scroll
 * along it in world distance so they do not swim when the disc slows.
 */
const TRAIL_VERTEX = /* glsl */ `
  attribute vec3 aTangent;
  attribute vec3 aCoord;  // x side, y age 0..1, z live

  uniform float uWidth;
  uniform float uTwist;

  varying vec3  vCoord;
  varying vec3  vWorld;

  void main() {
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 tangent = normalize(aTangent + vec3(1e-5));
    vec3 toCamera = normalize(cameraPosition - world);
    vec3 acrossCam = cross(tangent, toCamera);
    float l = length(acrossCam);
    acrossCam = l > 1e-4 ? acrossCam / l : vec3(0.0, 1.0, 0.0);
    // Optionally lie flat in the disc's flight plane: a blade-edge wake.
    vec3 flat_ = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)) + vec3(1e-5));
    vec3 across = normalize(mix(acrossCam, flat_, uTwist));

    float age = aCoord.y;
    float width = uWidth * pow(1.0 - age, 0.7) * aCoord.z;
    world += across * aCoord.x * width;

    vCoord = aCoord;
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uCore;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uStreaks;
  uniform float uFade;
  uniform vec3  uColorHead;
  uniform vec3  uColorTail;
  uniform vec3  uColorEdge;

  varying vec3 vCoord;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    if (vCoord.z < 0.5 || vCoord.y >= 1.0) discard;
    float age = vCoord.y;
    float across = abs(vCoord.x);

    float core = 1.0 - smoothstep(uCore * 0.6, uCore, across);
    float body = pow(clamp(1.0 - across, 0.0, 1.0), 1.6);

    // Speed lines: thin bands across the ribbon, broken by noise.
    float lines = 0.5 + 0.5 * sin(vCoord.x * uStreaks * 3.14159);
    lines = mix(1.0, 0.55 + 0.9 * pow(lines, 4.0), smoothstep(0.0, 0.3, age));
    float breakup = smoothstep(-0.2, 0.6, snoise(vec3(vWorld.xz * 2.0, uTime * 3.0)) + (1.0 - age));

    vec3 tint = mix(uColorHead, uColorTail, smoothstep(0.0, 0.6, age));
    tint = mix(uColorEdge, tint, smoothstep(0.0, 0.8, body));
    vec3 color = tint * body * lines + uColorHead * core * (1.0 - age);

    float life = pow(1.0 - age, 1.4);
    float alpha = clamp(max(body * lines, core) * life * breakup, 0.0, 1.0) * uOpacity * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uIntensity * uGlobalGlow, alpha);
  }
`;

export function createChakramTrailMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uWidth: { value: 0.3 },
      uTwist: { value: 0 },
      uCore: { value: 0.18 },
      uIntensity: { value: 2.5 },
      uOpacity: { value: 0.9 },
      uStreaks: { value: 8 },
      uFade: { value: 1 },
      uColorHead: { value: new Color(1, 0.95, 0.75) },
      uColorTail: { value: new Color(1, 0.6, 0.2) },
      uColorEdge: { value: new Color(0.5, 0.2, 1) }
    }),
    vertexShader: TRAIL_VERTEX,
    fragmentShader: TRAIL_FRAGMENT
  });

  /** @param {object} s { fade } */
  material.userData.sync = (s) => {
    const c = settings.chakram;
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = s.fade;
    u.uWidth.value = c.trailWidth;
    u.uTwist.value = c.trailTwist;
    u.uCore.value = c.trailCore;
    u.uIntensity.value = c.trailIntensity * g.glow;
    u.uOpacity.value = c.trailOpacity * g.opacity;
    u.uStreaks.value = c.trailStreaks;
    u.uColorHead.value.copy(getColor(c.colorTrailHead));
    u.uColorTail.value.copy(getColor(c.colorTrailTail));
    u.uColorEdge.value.copy(getColor(c.colorTrailEdge));
  };

  return material;
}

/* ====================================================================== */
/* 2c · The floor path                                                     */
/* ====================================================================== */

/**
 * The line the throw scores into the floor (a second `ChakramTrailRibbon`
 * sampled every `pathStep` metres, without a live head).
 *
 * Flattened onto the floor in the vertex stage and laid flat across the
 * path, so from the play camera it reads as the route the disc took — the
 * zig-zag legs, the knots at the banks and the bow of the return. Three
 * bands across it: a dark **char** bed (normal-blended over the floor, so it
 * holds on a dark ground), a **hot** centre cut that starts white-gold and
 * cools to the sigil gold over `pathCool`, and **tooth nicks** — notches
 * along the cut spaced like the blade's teeth. Where the disc flew high (the
 * return arc) the mark is fainter and wider, a shadow more than a cut. It
 * erodes from its old end with a noise edge.
 */
const PATH_VERTEX = /* glsl */ `
  attribute vec3 aTangent;
  attribute vec3 aCoord;  // x side, y age 0..1, z live

  uniform float uWidth;
  uniform float uHighFade;

  varying vec3  vCoord;
  varying vec3  vWorld;
  varying float vHigh;
  varying float vDist;

  void main() {
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 t = vec3(aTangent.x, 0.0, aTangent.z);
    t = length(t) > 1e-5 ? normalize(t) : vec3(1.0, 0.0, 0.0);
    vec3 across = vec3(-t.z, 0.0, t.x);
    // Higher flight → a wider, fainter mark.
    vHigh = smoothstep(1.4, 1.4 + max(uHighFade, 0.1), world.y);
    float w = uWidth * (1.0 + vHigh * 0.6) * aCoord.z;
    world += across * aCoord.x * w;
    vDist = dot(world.xz, vec2(0.7071));
    world.y = 0.028;
    vCoord = aCoord;
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const PATH_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uCool;       // share of the life the cut takes to cool
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uNicks;      // tooth nicks per metre
  uniform float uFade;
  uniform vec3  uColorHot;
  uniform vec3  uColor;
  uniform vec3  uColorChar;

  varying vec3  vCoord;
  varying vec3  vWorld;
  varying float vHigh;
  varying float vDist;

  ${noiseGLSL}

  void main() {
    if (vCoord.z < 0.5 || vCoord.y >= 1.0) discard;
    float age = vCoord.y;
    float across = abs(vCoord.x);

    float bed = 1.0 - smoothstep(0.55, 1.0, across);
    float cut = 1.0 - smoothstep(0.08, 0.26, across);
    // Tooth nicks: short bright ticks across the cut, spaced like the teeth.
    float along = vWorld.x * 0.37 + vWorld.z * 0.93;
    float nick = smoothstep(0.82, 0.95, fract(along * uNicks)) * (1.0 - smoothstep(0.15, 0.5, across));
    float grain = snoise(vec3(vWorld.xz * 3.0, 1.7)) * 0.5 + 0.5;

    float heat = 1.0 - smoothstep(0.0, max(uCool, 0.01), age);
    vec3 glow = mix(uColor, uColorHot, heat) * (cut + nick * 0.8) * (0.35 + 0.65 * heat + 0.25);
    vec3 col = uColorChar * (0.7 + 0.3 * grain) + glow * uIntensity * uGlobalGlow * (1.0 - vHigh * 0.7);

    float erode = snoise(vec3(vWorld.xz * 1.4, 4.0)) * 0.5 + 0.5;
    float keep = smoothstep(age * 1.25 - 0.2, age * 1.25 - 0.05, erode * 0.6 + 0.4 * (1.0 - age));
    float a = max(bed * (0.75 - 0.45 * vHigh) * (0.75 + 0.25 * grain), cut) * keep * uOpacity * uFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createChakramPathMaterial() {
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
      uWidth: { value: 0.35 },
      uHighFade: { value: 1.5 },
      uCool: { value: 0.3 },
      uIntensity: { value: 1.6 },
      uOpacity: { value: 0.85 },
      uNicks: { value: 2 },
      uFade: { value: 1 },
      uColorHot: { value: new Color(1, 1, 1) },
      uColor: { value: new Color(1, 0.8, 0.35) },
      uColorChar: { value: new Color(0.1, 0.06, 0.03) }
    }),
    vertexShader: PATH_VERTEX,
    fragmentShader: PATH_FRAGMENT
  });

  /** @param {object} s { fade } */
  material.userData.sync = (s) => {
    const c = settings.chakram;
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = s.fade;
    u.uWidth.value = c.pathWidth;
    u.uHighFade.value = c.pathHighFade;
    u.uCool.value = c.pathCool;
    u.uIntensity.value = c.pathIntensity * g.glow;
    u.uOpacity.value = c.pathOpacity * g.opacity;
    u.uNicks.value = c.pathNicks;
    u.uColorHot.value.copy(getColor(c.colorSigilHot));
    u.uColor.value.copy(getColor(c.colorSigil));
    u.uColorChar.value.copy(getColor(c.colorSigilChar));
  };

  return material;
}

/* ====================================================================== */
/* 3 · The bank sigil                                                      */
/* ====================================================================== */

/**
 * The mark a ricochet burns into the floor.
 *
 * A *vector* glyph, aimed along the deflection (the quad is rotated by the
 * ability so +X is the way the disc left): a broken outer ring, a chevron
 * pointing out of the bank, a cut through the middle along the incoming
 * line, and `teeth` notches round the ring that echo the blade. It **burns
 * in** from the centre over `sigilBurn`, its lines start white-hot and cool to
 * the sigil colour over `sigilCool`, a char halo sits under it, and it goes
 * out with a noise dissolve so it does not just fade.
 */
const SIGIL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SIGIL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;

  uniform float uSeed;
  uniform float uBurn;
  uniform float uHeat;
  uniform float uLife;
  uniform float uLine;
  uniform float uNotches;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uCutAngle;
  uniform vec3  uColor;
  uniform vec3  uColorHot;
  uniform vec3  uColorChar;

  varying vec2 vUv;

  ${noiseGLSL}

  float band(float d, float w) {
    float aa = fwidth(d) * 1.2;
    return 1.0 - smoothstep(w, w + aa, abs(d));
  }

  void main() {
    vec2 p = vUv;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);

    // Broken outer ring with notches.
    float ring = band(r - 0.86, uLine);
    float gap = step(0.18, abs(sin(a * 1.5)));
    ring *= gap;
    float notch = band(mod(a * uNotches / 6.28318 + 0.5, 1.0) - 0.5, 0.08) * step(0.78, r) * step(r, 0.94);

    // The chevron, opening back toward the bank, pointing out along +X.
    vec2 c = p - vec2(0.18, 0.0);
    float chev = band(abs(c.y) * 0.9 + c.x * 0.75 - 0.18, uLine * 0.9) * step(-0.55, c.x) * step(c.x, 0.3);

    // The cut: along the incoming line.
    vec2 d = vec2(cos(uCutAngle), sin(uCutAngle));
    float along = dot(p, d);
    float side = dot(p, vec2(-d.y, d.x));
    float cut = band(side, uLine * 0.7) * (1.0 - smoothstep(0.55, 0.8, abs(along)));

    float shape = clamp(ring + notch + chev + cut, 0.0, 1.0);

    // Burns in from the middle; goes out through a noise dissolve.
    float reveal = 1.0 - smoothstep(uBurn - 0.1, uBurn, r);
    float n = snoise01(vec3(p * 5.0, uSeed));
    float dissolve = smoothstep(uLife - 0.08, uLife + 0.08, n);
    float hotEdge = (1.0 - smoothstep(0.0, 0.1, abs(n - uLife))) * step(0.01, uLife);

    float charHalo = (1.0 - smoothstep(0.15, 0.95, r)) * 0.35;

    vec3 hot = mix(uColor, uColorHot, uHeat);
    vec3 color = hot * shape * (1.0 + uHeat * 1.5) + uColorChar * charHalo * 0.3 + uColorHot * hotEdge * shape;
    float alpha = (shape + charHalo * 0.4) * reveal * dissolve * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uIntensity * uGlobalGlow, alpha);
  }
`;

export function createChakramSigilMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uSeed: { value: Math.random() * 10 },
      uBurn: { value: 0 },
      uHeat: { value: 1 },
      uLife: { value: 0 },
      uLine: { value: 0.035 },
      uNotches: { value: 7 },
      uIntensity: { value: 2.5 },
      uOpacity: { value: 1 },
      uCutAngle: { value: 0 },
      uColor: { value: new Color(1, 0.8, 0.35) },
      uColorHot: { value: new Color(1, 1, 1) },
      uColorChar: { value: new Color(0.2, 0.1, 0.05) }
    }),
    vertexShader: SIGIL_VERTEX,
    fragmentShader: SIGIL_FRAGMENT
  });

  /** @param {object} s { burn, heat, life, cutAngle, seed } */
  material.userData.sync = (s) => {
    const c = settings.chakram;
    const g = settings.global;
    const u = material.uniforms;
    u.uBurn.value = s.burn;
    u.uHeat.value = s.heat;
    u.uLife.value = s.life;
    u.uCutAngle.value = s.cutAngle;
    u.uSeed.value = s.seed;
    u.uLine.value = c.sigilLine;
    u.uNotches.value = Math.max(3, Math.round(c.teeth));
    u.uIntensity.value = c.sigilIntensity * g.glow;
    u.uOpacity.value = g.opacity;
    u.uColor.value.copy(getColor(c.colorSigil));
    u.uColorHot.value.copy(getColor(c.colorSigilHot));
    u.uColorChar.value.copy(getColor(c.colorSigilChar));
  };

  return material;
}

/* ====================================================================== */
/* 4 · The wake warp                                                       */
/* ====================================================================== */

/**
 * The air the disc cuts, on LAYER.DISTORTION: a billboard round the blade
 * whose offset is mostly *tangential* — the wake is spun — with a fast noise
 * on top. Its strength follows the disc's speed, so it is gone in the hand
 * and strongest on the long legs.
 */
const WARP_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vUv = position.xy;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uShaderIntensity;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    vec3 np = vec3(vUv * uScale, uTime * uSpeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(19.3, 7.7, 31.1)));
    vec2 tangent = vec2(-vUv.y, vUv.x) / max(r, 1e-3);
    vec2 offset = normalize(tangent * 0.8 + n * 0.5 + 1e-4);
    float mask = smoothstep(0.15, 0.45, r) * (1.0 - smoothstep(0.55, 1.0, r));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

export function createChakramWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 0.9 },
      uStrength: { value: 0 },
      uScale: { value: 3 },
      uSpeed: { value: 4 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { strength } */
  material.userData.sync = (s) => {
    const c = settings.chakram;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = c.warpSize;
    u.uStrength.value = s.strength * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
  };

  return material;
}
