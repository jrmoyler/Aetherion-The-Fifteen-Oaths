import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Shared vertex stage for every straight ribbon here (the lance, the beams):
 * `aParam` (t, side) is placed between `uFrom` and `uTo` and swung across the
 * line of sight, so a segment is always seen face-on. `uTaper` narrows the
 * tail (lance) or both ends (beam).
 */
const RIBBON_VERTEX = /* glsl */ `
  attribute vec2 aParam;

  uniform vec3  uFrom;
  uniform vec3  uTo;
  uniform float uWidth;
  uniform float uTaperTail;
  uniform float uTaperHead;
  uniform float uArc;

  varying vec2  vParam;
  varying float vLength;

  void main() {
    float t = aParam.x;
    // uArc (metres) bows the ribbon up into an arc over its span (beams only).
    vec3 p = mix(uFrom, uTo, t) + vec3(0.0, uArc * 4.0 * t * (1.0 - t), 0.0);
    vec3 d = uTo - uFrom;
    float len = max(length(d), 1e-4);
    vec3 tangent = normalize(d + vec3(0.0, uArc * 4.0 * (1.0 - 2.0 * t), 0.0));
    vec3 toCamera = normalize(cameraPosition - p);
    vec3 across = cross(tangent, toCamera);
    float l = length(across);
    across = l > 1e-4 ? across / l : vec3(0.0, 1.0, 0.0);

    float taper = mix(1.0, smoothstep(0.0, 1.0, t / max(uTaperTail, 1e-3)), step(1e-3, uTaperTail))
                * mix(1.0, smoothstep(0.0, 1.0, (1.0 - t) / max(uTaperHead, 1e-3)), step(1e-3, uTaperHead));
    p += across * aParam.y * uWidth * max(taper, 0.08);

    vParam = aParam;
    vLength = len;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

/* ====================================================================== */
/* 1 · The lance                                                           */
/* ====================================================================== */

/**
 * The charged lance — a bolt of compressed light, not a beam.
 *
 * A ribbon from tail to head, tapered hard at the tail. Across it, a white
 * core in a cyan glow fringed blue. Along it, **charge rings** — bright bands
 * racing from tail to head at `uRingSpeed`, tighter toward the head — which is
 * what sells "charged" rather than "glowing". The head is a hot bulb. While it
 * is building in the hand `uCharge` climbs 0→1: the rings speed up and pack
 * tighter and the whole thing brightens; in flight it holds at 1.
 */
const LANCE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uCharge;
  uniform float uCore;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uRings;
  uniform float uRingSpeed;
  uniform float uCrackle;
  uniform float uFlicker;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorGlow;
  uniform vec3  uColorEdge;

  varying vec2  vParam;
  varying float vLength;

  ${noiseGLSL}

  void main() {
    float t = vParam.x;
    float across = abs(vParam.y);

    float core = 1.0 - smoothstep(uCore * 0.6, uCore, across);
    float glow = pow(clamp(1.0 - across, 0.0, 1.0), 2.0);

    // Rings running toward the head, packing tighter as they go.
    float phase = pow(t, 1.6) * uRings * (0.6 + 0.6 * uCharge) - uTime * uRingSpeed * (0.4 + 0.6 * uCharge);
    float rings = pow(0.5 + 0.5 * sin(phase * 6.28318), 8.0) * smoothstep(0.05, 0.4, t);

    // The hot head.
    float head = smoothstep(0.78, 1.0, t);

    float n = snoise(vec3(t * vLength * 3.0 - uTime * 14.0, across * 3.0, uSeed));
    float crackle = 1.0 + uCrackle * n * uShaderIntensity;
    float flick = 1.0 - uFlicker * step(0.8, hash11(floor(uTime * 30.0) + uSeed));

    vec3 tint = mix(uColorEdge, uColorGlow, smoothstep(0.0, 0.7, glow));
    vec3 color = tint * glow * crackle * (1.0 + rings * 1.5) + uColorCore * (core + head * glow * 1.5) * (1.0 + rings);
    float tail = smoothstep(0.0, 0.25, t);
    float energy = (0.35 + 0.65 * uCharge) * flick * tail;

    float alpha = clamp(max(glow, core) * energy, 0.0, 1.0) * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * energy * uIntensity * uGlobalGlow * uOpacity, alpha);
  }
`;

export function createRefractorLanceMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFrom: { value: new Vector3() },
      uTo: { value: new Vector3(0, 0, 1) },
      uWidth: { value: 0.16 },
      uTaperTail: { value: 0.7 },
      uTaperHead: { value: 0.06 },
      uArc: { value: 0 },
      uCharge: { value: 0 },
      uCore: { value: 0.22 },
      uIntensity: { value: 4.5 },
      uOpacity: { value: 1 },
      uRings: { value: 6 },
      uRingSpeed: { value: 9 },
      uCrackle: { value: 0.4 },
      uFlicker: { value: 0.25 },
      uSeed: { value: Math.random() * 10 },
      uColorCore: { value: new Color(1, 1, 1) },
      uColorGlow: { value: new Color(0.6, 0.95, 1) },
      uColorEdge: { value: new Color(0.25, 0.4, 1) }
    }),
    vertexShader: RIBBON_VERTEX,
    fragmentShader: LANCE_FRAGMENT
  });

  /** @param {object} s { from, to, charge, widthScale } */
  material.userData.sync = (s) => {
    const c = settings.refractor;
    const g = settings.global;
    const u = material.uniforms;
    u.uFrom.value.copy(s.from);
    u.uTo.value.copy(s.to);
    u.uCharge.value = s.charge;
    u.uWidth.value = c.lanceWidth * s.widthScale;
    u.uCore.value = c.lanceCore;
    u.uIntensity.value = c.lanceIntensity * g.glow;
    u.uOpacity.value = g.opacity;
    u.uRings.value = c.lanceRings;
    u.uRingSpeed.value = c.lanceRingSpeed * g.animationSpeed;
    u.uCrackle.value = c.lanceCrackle * g.noiseStrength;
    u.uFlicker.value = c.lanceFlicker * g.shaderIntensity;
    u.uColorCore.value.copy(getColor(c.colorLanceCore));
    u.uColorGlow.value.copy(getColor(c.colorLanceGlow));
    u.uColorEdge.value.copy(getColor(c.colorLanceEdge));
  };

  return material;
}

/* ====================================================================== */
/* 2 · The crystal                                                         */
/* ====================================================================== */

/**
 * The prism column.
 *
 * Glass in the same family as Sunfall's stone (sky-probe refraction and
 * reflection, fresnel, drawn facet edges) but doing four different jobs:
 *
 *   - **materialise** — `uForm` 0→1 scans the crystal into being from the
 *     bottom up: a bright line rides the scan height, everything above it is
 *     discarded, so it *crystallises* out of the air at the end of the line.
 *   - **caustic bands** — bright planes sweeping up the column in local space,
 *     sharpened, which read as light trapped inside and turning with it.
 *   - **the charge** — when the lance strikes, `uCharge` floods the glass
 *     white from the inside, past 1 so bloom takes it.
 *   - **cracks and shatter** — a voronoi crack network in the crystal's local
 *     space, with cells on the *faces* (projected by the dominant normal axis
 *     so a crack runs straight across a facet). `uCrack` grows the network
 *     with each beam that leaves; `uShatter` then dissolves the facets one by
 *     one on their own clocks (`aFace.x`), leaving a hot rim on what remains.
 */
const CRYSTAL_VERTEX = /* glsl */ `
  attribute vec3 aEdge;
  attribute vec2 aFace;

  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vNormalL;
  varying vec3 vEdge;
  varying vec2 vFace;

  void main() {
    vLocal = position;
    vNormalL = normal;
    vEdge = aEdge;
    vFace = aFace;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CRYSTAL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform sampler2D uEnvMap;
  uniform float uHasEnv;

  uniform float uSeed;
  uniform float uForm;
  uniform float uSpan;
  uniform float uCharge;
  uniform float uCrack;
  uniform float uShatter;
  uniform float uOpacity;
  uniform float uFresnel;
  uniform float uFresnelPower;
  uniform float uEnvIntensity;
  uniform float uBands;
  uniform float uBandSpeed;
  uniform float uEdgeGlow;
  uniform float uChargeGlow;
  uniform float uCrackScale;
  uniform float uCrackWidth;
  uniform float uCrackGlow;
  uniform float uBody;
  uniform float uReflect;
  uniform vec3  uColorGlass;
  uniform vec3  uColorDeep;
  uniform vec3  uColorEdge;
  uniform vec3  uColorCrack;

  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vNormalL;
  varying vec3 vEdge;
  varying vec2 vFace;

  ${noiseGLSL}

  const float PI = 3.14159265359;

  /** Voronoi with the edge distance: x = F2 − F1, y = nearest cell's id. */
  vec3 crackCells(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    float id = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 r = g + hash21(dot(n + g, vec2(7.13, 113.17))) - f;
        float d = length(r);
        if (d < d1) { d2 = d1; d1 = d; id = hash11(dot(n + g, vec2(31.7, 57.1))); }
        else if (d < d2) { d2 = d; }
      }
    }
    return vec3(d2 - d1, id, d1);
  }

  vec3 sky(vec3 dir) {
    vec3 fallback = mix(uColorDeep, uColorGlass, dir.y * 0.5 + 0.5);
    vec2 uv = vec2(atan(dir.z, dir.x) / (2.0 * PI) + 0.5, asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5);
    vec3 env = min(texture2D(uEnvMap, uv).rgb, vec3(8.0));
    return mix(fallback, env, uHasEnv) * uEnvIntensity;
  }

  void main() {
    /* --- materialise: scan up the column --- */
    float h = (vLocal.y / max(uSpan, 1e-3)) * 0.5 + 0.5;
    float scan = uForm * 1.15 - 0.05;
    if (h > scan) discard;
    float scanLine = 1.0 - smoothstep(0.0, 0.06, scan - h);

    /* --- shatter: each facet on its own clock --- */
    float facetClock = vFace.x * 0.7 + (1.0 - vFace.y) * 0.3;
    float gone = smoothstep(facetClock - 0.08, facetClock, uShatter * 1.1);
    float n = snoise01(vLocal * 6.0 + uSeed);
    if (n < gone) discard;
    float shatterRim = (1.0 - smoothstep(0.0, 0.12, n - gone)) * step(0.001, uShatter);

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = clamp(uFresnel * pow(1.0 - ndv, uFresnelPower), 0.0, 1.0);

    vec3 refl = sky(reflect(-V, N));
    vec3 tR = refract(-V, N, 0.70);
    vec3 tG = refract(-V, N, 0.66);
    vec3 tB = refract(-V, N, 0.62);
    // The body is deep indigo glass: the refracted sky is filtered hard
    // through the deep stop, the lighter glass tint only toward grazing.
    vec3 through = vec3(sky(tR).r, sky(tG).g, sky(tB).b) * mix(uColorDeep, uColorGlass, uBody * (0.15 + 0.85 * pow(1.0 - ndv, 2.0)));

    /* --- caustic bands sweeping up inside --- */
    float bandCoord = vLocal.y * uBands + dot(vLocal.xz, vec2(0.6, 0.4)) * 1.4 - uTime * uBandSpeed;
    float bands = pow(0.5 + 0.5 * sin(bandCoord * 6.28318), 10.0) * uShaderIntensity;

    /* --- facet edges --- */
    float e = min(vEdge.x, min(vEdge.y, vEdge.z));
    float edge = 1.0 - smoothstep(0.0, fwidth(e) * 1.6 + 1e-4, e);

    /* --- cracks: voronoi on the facet's own plane --- */
    vec3 an = abs(vNormalL);
    vec2 fp = an.y > max(an.x, an.z) ? vLocal.xz : (an.x > an.z ? vLocal.zy : vLocal.xy);
    vec3 vo = crackCells(fp * uCrackScale + uSeed);
    // A cell's border opens once the crack front has passed its id, so the
    // network grows cell by cell as each beam leaves.
    float crack = (1.0 - smoothstep(uCrackWidth, uCrackWidth + fwidth(vo.x) * 1.5, vo.x)) * step(vo.y, uCrack);

    vec3 color = mix(through, refl * uReflect, fres);
    color += uColorGlass * bands * 0.8 * uBody * uGlobalGlow;
    color += uColorEdge * edge * uEdgeGlow * (1.0 + uCharge) * uGlobalGlow;
    color += uColorEdge * uCharge * uChargeGlow * pow(1.0 - ndv, 1.5) * uGlobalGlow;
    color += uColorCrack * (crack * uCrackGlow + shatterRim * uCrackGlow * 1.5) * uGlobalGlow;
    color += uColorEdge * scanLine * 4.0 * uGlobalGlow;

    float alpha = clamp(uOpacity + fres * 0.3 + edge * 0.6 + uCharge * 0.15 + crack * 0.6 + scanLine + bands * 0.1, 0.0, 1.0);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createRefractorCrystalMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uHasEnv: { value: 0 },
      uSeed: { value: Math.random() * 10 },
      uForm: { value: 0 },
      uSpan: { value: 1 },
      uCharge: { value: 0 },
      uCrack: { value: 0 },
      uShatter: { value: 0 },
      uOpacity: { value: 0.35 },
      uFresnel: { value: 2.2 },
      uFresnelPower: { value: 2.6 },
      uEnvIntensity: { value: 1 },
      uBands: { value: 3 },
      uBandSpeed: { value: 1.2 },
      uEdgeGlow: { value: 2.4 },
      uChargeGlow: { value: 6 },
      uCrackScale: { value: 3.6 },
      uCrackWidth: { value: 0.05 },
      uCrackGlow: { value: 5 },
      uBody: { value: 0.45 },
      uReflect: { value: 0.5 },
      uColorGlass: { value: new Color(0.75, 0.97, 1) },
      uColorDeep: { value: new Color(0.02, 0.07, 0.13) },
      uColorEdge: { value: new Color(0.9, 1, 1) },
      uColorCrack: { value: new Color(1, 1, 1) }
    }),
    vertexShader: CRYSTAL_VERTEX,
    fragmentShader: CRYSTAL_FRAGMENT
  });

  /** @param {object} s { form, span, charge, crack, shatter, seed } */
  material.userData.sync = (s) => {
    const c = settings.refractor;
    const g = settings.global;
    const u = material.uniforms;
    u.uHasEnv.value = frame.uEnvMap.value ? 1 : 0;
    u.uForm.value = s.form;
    u.uSpan.value = s.span;
    u.uCharge.value = s.charge;
    u.uCrack.value = s.crack;
    u.uShatter.value = s.shatter;
    u.uSeed.value = s.seed;
    u.uOpacity.value = c.glassOpacity * g.opacity;
    u.uFresnel.value = c.fresnel * g.fresnel;
    u.uFresnelPower.value = c.fresnelPower;
    u.uEnvIntensity.value = c.envIntensity;
    u.uBands.value = c.innerBands;
    u.uBandSpeed.value = c.bandSpeed * g.animationSpeed;
    u.uEdgeGlow.value = c.edgeGlow;
    u.uChargeGlow.value = c.chargeGlow;
    u.uCrackScale.value = c.crackScale;
    u.uCrackWidth.value = c.crackWidth;
    u.uCrackGlow.value = c.crackGlow;
    u.uBody.value = c.glassBody ?? 0.45;
    u.uReflect.value = c.glassReflect ?? 0.5;
    u.uColorGlass.value.copy(getColor(c.colorGlass));
    u.uColorDeep.value.copy(getColor(c.colorGlassDeep));
    u.uColorEdge.value.copy(getColor(c.colorGlassEdge));
    u.uColorCrack.value.copy(getColor(c.colorCrack));
  };

  return material;
}

/* ====================================================================== */
/* 3 · A refracted beam                                                    */
/* ====================================================================== */

/**
 * One of the three refracted shots.
 *
 * A ribbon tapered at both ends, from the prism face to the target, with three
 * envelopes the ability drives: `uReach` (the tip racing out to the target),
 * `uLevel` (the punch on arrival settling to the hold) and `uPinch` (the beam
 * narrowing to a thread and breaking up from the prism outward as it goes).
 * Along it, **photon packets** move at a world speed (so a long beam does not
 * look faster) and faint **refraction bands** shimmer, in the beam's own hue
 * with a white core.
 */
const BEAM_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uReach;
  uniform float uLevel;
  uniform float uPinch;
  uniform float uCore;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uPackets;
  uniform float uPacketSpeed;
  uniform float uBands;
  uniform float uFlicker;
  uniform float uShaft;
  uniform float uSeed;
  uniform vec3  uColor;
  uniform vec3  uColorCore;

  varying vec2  vParam;
  varying float vLength;

  ${noiseGLSL}

  void main() {
    float t = vParam.x;
    if (t > uReach) discard;
    // Pinch: thins and breaks up from the prism end outward.
    if (t < uPinch * 1.05 - 0.05) discard;
    float across = abs(vParam.y) / max(1.0 - uPinch * 0.85, 0.05);
    if (across > 1.0) discard;

    float core = 1.0 - smoothstep(uCore * 0.6, uCore, across);
    // A solid shaft of the beam's colour: flat across most of its width,
    // falling off only at the edge; the white is a thin core.
    float glow = pow(clamp(1.0 - across, 0.0, 1.0), mix(1.8, 0.45, uShaft));

    float d = t * vLength;
    float packets = pow(0.5 + 0.5 * sin((d * uPackets - uTime * uPacketSpeed * uPackets) * 6.28318 * 0.25), 12.0);
    float bands = 1.0 + uBands * snoise(vec3(d * 1.5 - uTime * 4.0, across * 2.0, uSeed)) * uShaderIntensity;
    float tip = smoothstep(uReach - 0.08, uReach, t) * step(uReach, 0.999);
    float flick = 1.0 - uFlicker * step(0.78, hash11(floor(uTime * 28.0) + uSeed * 7.0));

    vec3 hot = mix(uColor, uColorCore, 0.25);
    vec3 color = uColor * glow * bands * (1.0 + packets * 0.9) + hot * (core + tip * 1.5) * (1.0 + packets * 0.5);
    float energy = uLevel * flick;
    float alpha = clamp(max(glow, core) * energy, 0.0, 1.0) * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * energy * uIntensity * uGlobalGlow * uOpacity, alpha);
  }
`;

export function createRefractorBeamMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFrom: { value: new Vector3() },
      uTo: { value: new Vector3(0, 0, 1) },
      uWidth: { value: 0.2 },
      uTaperTail: { value: 0.04 },
      uTaperHead: { value: 0.03 },
      uReach: { value: 0 },
      uLevel: { value: 0 },
      uPinch: { value: 0 },
      uCore: { value: 0.18 },
      uIntensity: { value: 5 },
      uOpacity: { value: 1 },
      uPackets: { value: 5 },
      uPacketSpeed: { value: 22 },
      uBands: { value: 0.4 },
      uFlicker: { value: 0.2 },
      uShaft: { value: 0.7 },
      uArc: { value: 0 },
      uSeed: { value: Math.random() * 10 },
      uColor: { value: new Color(0.5, 0.95, 1) },
      uColorCore: { value: new Color(1, 1, 1) }
    }),
    vertexShader: RIBBON_VERTEX,
    fragmentShader: BEAM_FRAGMENT
  });

  /** @param {object} s { from, to, reach, level, pinch, widthScale, color } */
  material.userData.sync = (s) => {
    const c = settings.refractor;
    const g = settings.global;
    const u = material.uniforms;
    u.uFrom.value.copy(s.from);
    u.uTo.value.copy(s.to);
    u.uReach.value = s.reach;
    u.uLevel.value = s.level;
    u.uPinch.value = s.pinch;
    u.uWidth.value = c.beamWidth * s.widthScale;
    u.uCore.value = c.beamCore;
    u.uIntensity.value = c.beamIntensity * g.glow;
    u.uOpacity.value = g.opacity;
    u.uPackets.value = c.beamPackets;
    u.uPacketSpeed.value = c.beamPacketSpeed * g.animationSpeed / Math.max(0.1, c.beamPackets);
    u.uBands.value = c.beamBands * g.noiseStrength;
    u.uFlicker.value = c.beamFlicker * g.shaderIntensity;
    u.uShaft.value = c.beamShaft ?? 0.7;
    u.uArc.value = s.arc ?? 0;
    u.uColor.value.copy(s.color);
    u.uColorCore.value.copy(getColor(c.colorBeamCore));
  };

  return material;
}

/* ====================================================================== */
/* 4 · The impact sigil                                                    */
/* ====================================================================== */

/**
 * Where a beam lands: a refraction seal and its shock ring in one quad.
 *
 * Normal-blended: the seal is a disc of **deep glass** (`uColorDeep`, a dark
 * indigo) burned into the floor with the lines glowing in the beam's hue over
 * it, so the mark carries the ramp's dark stop instead of reading as flat
 * white rings.
 *
 * The seal is a triangle inscribed in a circle (the prism, seen from above)
 * with three short rays out of its corners and a dotted outer ring, turning
 * slowly, in the beam's hue. It **stamps** in — overshooting its size and
 * snapping back (`uStamp`) — rather than fading in. The **shock ring** is a
 * thin bright band racing outward to the quad's edge (`uRing`), thinning as
 * it goes. Both go out through a radial wipe from the centre (`uLife`).
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

  uniform float uGlobalGlow;

  uniform float uStamp;
  uniform float uRing;
  uniform float uRingWidth;
  uniform float uLife;
  uniform float uSpin;
  uniform float uLine;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform vec3  uColor;
  uniform vec3  uColorHot;
  uniform vec3  uColorDeep;
  uniform float uFill;

  varying vec2 vUv;

  const float PI = 3.14159265359;

  float band(float d, float w) {
    float aa = fwidth(d) * 1.2;
    return 1.0 - smoothstep(w, w + aa, abs(d));
  }

  void main() {
    float R = length(vUv);
    if (R > 1.0) discard;

    /* --- the shock ring --- */
    float ring = band(R - uRing, uRingWidth * (1.0 - uRing * 0.7)) * (1.0 - uRing) * step(0.001, uRing) * step(uRing, 0.999);

    /* --- the seal, scaled by the stamp --- */
    vec2 p = vUv / max(uStamp, 1e-3);
    float r = length(p);
    float a = atan(p.y, p.x) + uSpin;
    float seal = 0.0;
    if (r < 1.0) {
      // Triangle (the prism from above).
      float sector = 2.0 * PI / 3.0;
      float am = mod(a + PI / 6.0, sector) - sector * 0.5;
      float tri = r * cos(am) / cos(PI / 3.0);
      seal += band(tri - 0.46, uLine);
      // Rays out of the corners.
      float ac = mod(a - PI / 2.0 + sector * 0.5, sector) - sector * 0.5;
      seal += band(ac * r, uLine * 0.8) * step(0.5, r) * step(r, 0.82);
      // Dotted outer ring.
      float dots = step(0.5, fract((a / (2.0 * PI)) * 24.0));
      seal += band(r - 0.9, uLine * 0.8) * dots;
      seal += band(r - 0.62, uLine * 0.6);
    }
    seal = clamp(seal, 0.0, 1.0);

    // Out through a wipe from the middle.
    float wipe = smoothstep(uLife - 0.1, uLife, R);
    // White only while the seal is stamping in; at rest it is the beam's hue.
    float hot = clamp(abs(uStamp - 1.0) * 5.0, 0.0, 1.0) * 0.85;

    // Four-stop ramp: white-hot ring → hot lines → beam hue → deep glass
    // fill. The fill is *dark* (normal blending), so the seal is burned into
    // the floor rather than painted on it.
    float fillMask = (1.0 - smoothstep(0.78, 0.97, R)) * wipe * step(0.001, uStamp);
    float etch = 0.5 + 0.5 * sin(R * 40.0 - a * 3.0);
    vec3 deep = uColorDeep * (0.7 + 0.6 * etch * smoothstep(0.2, 0.9, R));
    vec3 lineCol = mix(uColor, uColorHot, hot + (1.0 - hot) * 0.35 * band(r - 0.62, uLine * 0.25));
    float alphaE = clamp(seal * wipe + ring, 0.0, 1.0);
    vec3 emissive = (lineCol * seal * wipe + uColorHot * ring * 2.0) * uIntensity * uGlobalGlow;
    float fill = fillMask * uFill;
    float alpha = clamp(max(fill, alphaE), 0.0, 1.0) * uOpacity;
    if (alpha < 0.003) discard;
    vec3 color = (deep * fill + emissive * alphaE) / max(alpha, 1e-3);
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createRefractorSigilMaterial() {
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
      uColorDeep: { value: new Color(0.03, 0.04, 0.16) },
      uFill: { value: 0.6 },
      uStamp: { value: 1 },
      uRing: { value: 0 },
      uRingWidth: { value: 0.12 },
      uLife: { value: 0 },
      uSpin: { value: 0 },
      uLine: { value: 0.03 },
      uIntensity: { value: 2.6 },
      uOpacity: { value: 1 },
      uColor: { value: new Color(0.6, 0.95, 1) },
      uColorHot: { value: new Color(1, 1, 1) }
    }),
    vertexShader: SIGIL_VERTEX,
    fragmentShader: SIGIL_FRAGMENT
  });

  /** @param {object} s { stamp, ring, life, spin, color } */
  material.userData.sync = (s) => {
    const c = settings.refractor;
    const g = settings.global;
    const u = material.uniforms;
    u.uStamp.value = s.stamp;
    u.uRing.value = s.ring;
    u.uLife.value = s.life;
    u.uSpin.value = s.spin;
    u.uRingWidth.value = c.ringWidth;
    u.uLine.value = c.sigilLine;
    u.uIntensity.value = c.sigilIntensity * g.glow;
    u.uOpacity.value = g.opacity;
    u.uColor.value.copy(s.color).lerp(getColor(c.colorSigil), c.sigilTint);
    u.uColorHot.value.copy(getColor(c.colorSigilHot));
    u.uColorDeep.value.copy(getColor(c.colorSigilDeep));
    u.uFill.value = c.sigilFill;
  };

  return material;
}

/* ====================================================================== */
/* 5 · Heat warp                                                           */
/* ====================================================================== */

/**
 * LAYER.DISTORTION proxy, two shapes from one shader:
 *
 *   - the **lance wake** (`uMode` 0) — a quad stretched along the lance and
 *     billboarded about that axis; offset *across* the flight line plus noise,
 *     strongest just behind the head, so the air shimmers in its wake.
 *   - the **prism lens** (`uMode` 1) — a round billboard that pushes the
 *     background *outward* from the struck prism, spiking with the strike.
 */
const WARP_VERTEX = /* glsl */ `
  uniform vec3  uFrom;
  uniform vec3  uTo;
  uniform float uWidth;
  uniform float uMode;

  varying vec2 vUv;

  void main() {
    vUv = position.xy;
    vec3 world;
    if (uMode < 0.5) {
      // Along the lance: x across (camera-facing), y along tail→head.
      vec3 d = uTo - uFrom;
      float len = max(length(d), 1e-4);
      vec3 tangent = d / len;
      vec3 mid = (uFrom + uTo) * 0.5;
      vec3 across = normalize(cross(tangent, normalize(cameraPosition - mid)) + vec3(1e-5));
      world = mid + tangent * position.y * len * 0.5 + across * position.x * uWidth;
      gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    } else {
      vec4 mv = viewMatrix * vec4(uTo, 1.0);
      mv.xy += position.xy * uWidth;
      gl_Position = projectionMatrix * mv;
    }
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uMode;
  uniform float uShaderIntensity;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    vec3 np = vec3(vUv * uScale, uTime * uSpeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(19.3, 7.7, 31.1)));
    vec2 offset;
    float mask;
    if (uMode < 0.5) {
      offset = normalize(vec2(sign(vUv.x), 0.0) * 0.7 + n * 0.6 + 1e-4);
      // Strongest behind the head (+y), nothing past the tail, feathered sides.
      mask = (1.0 - smoothstep(0.3, 1.0, abs(vUv.x))) * smoothstep(-1.0, 0.6, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
    } else {
      float r = length(vUv);
      if (r > 1.0) discard;
      offset = normalize(vUv / max(r, 1e-3) * 0.8 + n * 0.5 + 1e-4);
      mask = smoothstep(0.1, 0.4, r) * (1.0 - smoothstep(0.6, 1.0, r));
    }
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

/** @param {'lance'|'prism'} mode */
export function createRefractorWarpMaterial(mode = 'lance') {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFrom: { value: new Vector3() },
      uTo: { value: new Vector3(0, 0, 1) },
      uWidth: { value: 0.5 },
      uMode: { value: mode === 'lance' ? 0 : 1 },
      uStrength: { value: 0 },
      uScale: { value: 3.5 },
      uSpeed: { value: 5 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { from, to, strength, size } */
  material.userData.sync = (s) => {
    const c = settings.refractor;
    const g = settings.global;
    const u = material.uniforms;
    u.uFrom.value.copy(s.from);
    u.uTo.value.copy(s.to);
    u.uWidth.value = s.size;
    u.uStrength.value = s.strength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
  };

  return material;
}

/* ====================================================================== */
/* 6 · The light path                                                      */
/* ====================================================================== */

/**
 * The lance's travel, made to stay: the line of light it leaves between the
 * hand and the prism, in two forms from one shader.
 *
 *   - **air** (`uFlat` 0) — a camera-facing filament from the hand to the
 *     lance's head, dashes sliding toward the prism. After the strike it holds
 *     hand → prism and then **drains** into the prism (`uFade` wipes from the
 *     caster's end).
 *   - **floor** (`uFlat` 1) — the same path written flat on the floor under
 *     the flight: a glowing rune-line scar in the deep blue, white dashes
 *     running down it, that outlives the air path.
 *
 * `uReach` 0..1 is how far along the path is drawn; `uLevel` its energy.
 */
const PATH_VERTEX = /* glsl */ `
  attribute vec2 aParam;

  uniform vec3  uFrom;
  uniform vec3  uTo;
  uniform float uWidth;
  uniform float uFlat;

  varying vec2  vParam;
  varying float vLength;

  void main() {
    float t = aParam.x;
    vec3 p = mix(uFrom, uTo, t);
    vec3 d = uTo - uFrom;
    float len = max(length(d), 1e-4);
    vec3 tangent = d / len;
    vec3 across;
    if (uFlat > 0.5) {
      across = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)) + vec3(1e-5));
    } else {
      across = cross(tangent, normalize(cameraPosition - p));
      float l = length(across);
      across = l > 1e-4 ? across / l : vec3(0.0, 1.0, 0.0);
    }
    float taper = smoothstep(0.0, 0.06, t) * smoothstep(0.0, 0.03, 1.0 - t);
    p += across * aParam.y * uWidth * max(taper, 0.2);
    vParam = aParam;
    vLength = len;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const PATH_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uReach;
  uniform float uLevel;
  uniform float uFade;
  uniform float uFlat;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uDashes;
  uniform float uDashSpeed;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorGlow;
  uniform vec3  uColorDeep;

  varying vec2  vParam;
  varying float vLength;

  ${noiseGLSL}

  void main() {
    float t = vParam.x;
    if (t > uReach || t < uFade) discard;
    float across = abs(vParam.y);

    float core = 1.0 - smoothstep(0.1, 0.28, across);
    float glow = pow(clamp(1.0 - across, 0.0, 1.0), 2.2);
    float d = t * vLength;
    float dash = pow(0.5 + 0.5 * sin((d * uDashes - uTime * uDashSpeed) * 6.28318), 6.0);
    float n = snoise(vec3(d * 2.2 - uTime * 5.0, across * 2.0, uSeed));
    float head = smoothstep(uReach - 0.05, uReach, t) * step(uReach, 0.999);
    float feather = smoothstep(uFade, uFade + 0.1, t);

    // Floor scar: rune ticks across the line, and the glow sits deeper.
    float ticks = uFlat * step(0.82, fract(d * 1.6 + 0.5 * n)) * (1.0 - smoothstep(0.55, 0.9, across));
    vec3 tint = mix(uColorDeep, uColorGlow, smoothstep(0.05, 0.75 + uFlat * 0.2, glow));
    vec3 color = tint * glow * (0.75 + 0.35 * n * uShaderIntensity) * (1.0 + dash)
               + uColorCore * (core * (0.4 + dash * 1.4) + head * 2.5 + ticks * 0.8);
    float energy = uLevel * feather;
    float alpha = clamp(max(glow * 0.85, core) * energy, 0.0, 1.0) * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * energy * uIntensity * uGlobalGlow * uOpacity, alpha);
  }
`;

/** @param {'air'|'floor'} mode */
export function createRefractorPathMaterial(mode = 'air') {
  const flat = mode === 'floor';
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: flat,
    polygonOffsetFactor: flat ? -2 : 0,
    polygonOffsetUnits: flat ? -2 : 0,
    uniforms: sharedUniforms({
      uFrom: { value: new Vector3() },
      uTo: { value: new Vector3(0, 0, 1) },
      uWidth: { value: 0.1 },
      uFlat: { value: flat ? 1 : 0 },
      uReach: { value: 0 },
      uLevel: { value: 0 },
      uFade: { value: 0 },
      uIntensity: { value: 3 },
      uOpacity: { value: 1 },
      uDashes: { value: 1.2 },
      uDashSpeed: { value: 6 },
      uSeed: { value: Math.random() * 10 },
      uColorCore: { value: new Color(1, 1, 1) },
      uColorGlow: { value: new Color(0.4, 0.9, 1) },
      uColorDeep: { value: new Color(0.05, 0.1, 0.5) }
    }),
    vertexShader: PATH_VERTEX,
    fragmentShader: PATH_FRAGMENT
  });

  /** @param {object} s { from, to, reach, level, fade } */
  material.userData.sync = (s) => {
    const c = settings.refractor;
    const g = settings.global;
    const u = material.uniforms;
    u.uFrom.value.copy(s.from);
    u.uTo.value.copy(s.to);
    u.uReach.value = s.reach;
    u.uLevel.value = s.level;
    u.uFade.value = s.fade;
    u.uWidth.value = flat ? c.scarWidth : c.pathWidth;
    u.uIntensity.value = (flat ? c.scarIntensity : c.pathIntensity) * g.glow;
    u.uOpacity.value = g.opacity;
    u.uDashes.value = c.pathDashes;
    u.uDashSpeed.value = c.pathDashSpeed * g.animationSpeed;
    u.uColorCore.value.copy(getColor(c.colorLanceCore));
    u.uColorGlow.value.copy(getColor(c.colorLanceGlow));
    u.uColorDeep.value.copy(getColor(c.colorPathDeep));
  };

  return material;
}

/* ====================================================================== */
/* 7 · The caustic pool                                                    */
/* ====================================================================== */

/**
 * The floor under the prism: the light it bends, thrown down as a pool.
 *
 * A disc of deep indigo glass-shadow (normal-blended, so it darkens the
 * floor — the ramp's deep stop) crossed by a moving **caustic web** (two
 * ridged noise fields) and three **spectral lobes** in the three beam hues
 * that turn with the prism, inside a bright rim. `uLevel` follows the prism:
 * scans in as it forms, flares on the strike, holds, and goes with the shatter.
 */
const POOL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uLevel;
  uniform float uFlare;
  uniform float uSpin;
  uniform float uScale;
  uniform float uFill;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform vec3  uColorHot;
  uniform vec3  uColorDeep;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float R = length(vUv);
    if (R > 1.0 || uLevel <= 0.001) discard;
    float a = atan(vUv.y, vUv.x) + uSpin;

    float n1 = snoise(vec3(vUv * uScale, uTime * 0.7));
    float n2 = snoise(vec3(vUv * uScale * 1.9 + 5.3, -uTime * 0.9));
    float web = pow(1.0 - abs(n1), 9.0) + pow(1.0 - abs(n2), 12.0) * 0.7;
    web *= uShaderIntensity;

    float wa = pow(0.5 + 0.5 * cos(a), 5.0);
    float wb = pow(0.5 + 0.5 * cos(a - 2.0943951), 5.0);
    float wc = pow(0.5 + 0.5 * cos(a + 2.0943951), 5.0);
    vec3 spec = (uColorA * wa + uColorB * wb + uColorC * wc) / max(wa + wb + wc, 1e-3);
    float lobes = (wa + wb + wc) * 0.5;

    float fall = 1.0 - smoothstep(0.3, 1.0, R);
    float rim = (1.0 - smoothstep(0.0, 0.03, abs(R - 0.9))) * (0.6 + 0.4 * sin(a * 12.0 - uTime * 3.0));
    float light = (web * (0.8 + uFlare) * fall + lobes * 0.45 * fall + rim * 0.7) * uLevel;

    vec3 emissive = (spec * light + uColorHot * pow(web, 3.0) * fall * (0.4 + uFlare) * uLevel) * uIntensity * uGlobalGlow;
    float alphaE = clamp(light, 0.0, 1.0);
    float fill = uFill * (1.0 - smoothstep(0.55, 1.0, R)) * uLevel;
    float alpha = clamp(max(fill, alphaE), 0.0, 1.0) * uOpacity;
    if (alpha < 0.003) discard;
    vec3 color = (uColorDeep * fill + emissive * alphaE) / max(alpha, 1e-3);
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createRefractorPoolMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: sharedUniforms({
      uLevel: { value: 0 },
      uFlare: { value: 0 },
      uSpin: { value: 0 },
      uScale: { value: 2.2 },
      uFill: { value: 0.55 },
      uIntensity: { value: 2 },
      uOpacity: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() },
      uColorHot: { value: new Color(1, 1, 1) },
      uColorDeep: { value: new Color(0.02, 0.03, 0.12) }
    }),
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT
  });

  /** @param {object} s { level, flare, spin } */
  material.userData.sync = (s) => {
    const c = settings.refractor;
    const g = settings.global;
    const u = material.uniforms;
    u.uLevel.value = s.level;
    u.uFlare.value = s.flare;
    u.uSpin.value = s.spin;
    u.uScale.value = c.poolScale * g.noiseFrequency;
    u.uFill.value = c.poolFill;
    u.uIntensity.value = c.poolIntensity * g.glow;
    u.uOpacity.value = g.opacity;
    u.uColorA.value.copy(getColor(c.colorBeamA));
    u.uColorB.value.copy(getColor(c.colorBeamB));
    u.uColorC.value.copy(getColor(c.colorBeamC));
    u.uColorHot.value.copy(getColor(c.colorSigilHot));
    u.uColorDeep.value.copy(getColor(c.colorPoolDeep));
  };

  return material;
}

/* ====================================================================== */
/* 8 · The beam burn — each refracted beam's path scorched on the floor    */
/* ====================================================================== */

/**
 * Under every refracted beam, its path burned flat on the floor from the
 * prism's foot to where it landed, so the three splits still read at 8 m
 * when the shafts themselves are short or seen end-on.
 *
 * Normal-blended: a charred deep-glass band (`uColorDeep`, near-black indigo)
 * with ragged edges, a molten seam of the beam's own hue down the middle and
 * embers flickering in it. `uReach` follows the beam's tip out; `uLevel` its
 * energy (flares on landing, settles to an ember glow); `uFade` wipes it out
 * from the prism end over the sigil's life.
 */
const BURN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uReach;
  uniform float uLevel;
  uniform float uFade;
  uniform float uFill;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3  uColor;
  uniform vec3  uColorDeep;

  varying vec2  vParam;
  varying float vLength;

  ${noiseGLSL}

  void main() {
    float t = vParam.x;
    if (t > uReach || t < uFade) discard;
    float d = t * vLength;
    float n = snoise(vec3(d * 2.6, vParam.y * 1.5, uSeed));
    float across = abs(vParam.y) + 0.18 * n * uShaderIntensity;
    if (across > 1.0) discard;

    float body = 1.0 - smoothstep(0.7, 1.0, across);
    float seam = 1.0 - smoothstep(0.05, 0.3, abs(vParam.y + 0.1 * n));
    float embers = smoothstep(0.55, 0.9, snoise(vec3(d * 5.0, vParam.y * 3.0, uTime * 1.6 + uSeed))) * (1.0 - smoothstep(0.2, 0.7, across));
    float feather = smoothstep(uFade, uFade + 0.12, t) * smoothstep(0.0, 0.05, t);

    float glow = (seam * 1.2 + embers * 0.8) * uLevel;
    vec3 emit = uColor * glow * uIntensity * uGlobalGlow;
    float ea = clamp(glow, 0.0, 1.0);
    float da = body * uFill;
    float a = clamp(ea + da * (1.0 - ea), 0.0, 1.0) * feather * uOpacity;
    if (a < 0.003) discard;
    vec3 color = (emit * ea + uColorDeep * da * (1.0 - ea)) / max(ea + da * (1.0 - ea), 1e-3);
    gl_FragColor = vec4(color, a);
  }
`;

export function createRefractorBeamBurnMaterial() {
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
      uFrom: { value: new Vector3() },
      uTo: { value: new Vector3(0, 0, 1) },
      uWidth: { value: 0.3 },
      uFlat: { value: 1 },
      uReach: { value: 0 },
      uLevel: { value: 0 },
      uFade: { value: 0 },
      uFill: { value: 0.75 },
      uIntensity: { value: 2 },
      uOpacity: { value: 1 },
      uSeed: { value: Math.random() * 10 },
      uColor: { value: new Color() },
      uColorDeep: { value: new Color(0.02, 0.03, 0.12) }
    }),
    vertexShader: PATH_VERTEX,
    fragmentShader: BURN_FRAGMENT
  });

  /** @param {object} s { from, to, reach, level, fade, color } */
  material.userData.sync = (s) => {
    const c = settings.refractor;
    const g = settings.global;
    const u = material.uniforms;
    u.uFrom.value.copy(s.from);
    u.uTo.value.copy(s.to);
    u.uReach.value = s.reach;
    u.uLevel.value = s.level;
    u.uFade.value = s.fade;
    u.uWidth.value = c.burnWidth;
    u.uFill.value = c.burnFill;
    u.uIntensity.value = c.burnGlow * g.glow;
    u.uOpacity.value = g.opacity;
    u.uColor.value.copy(s.color);
    u.uColorDeep.value.copy(getColor(c.colorSigilDeep));
  };

  return material;
}
