import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Briar Cathedral — the bespoke shaders the vault is drawn with.
 *
 *  - **the ribs** (`createBriarRibMaterial`) — twined briar stems. Each rib is
 *    a cubic Bézier in the plane of its bearing: up out of the floor at the
 *    rim, vertical to the springing line, then — as `uClose` runs 0 → 1 —
 *    from a splayed, open sheaf to a *pointed* gothic arch whose tip meets
 *    the others over the centre. Two strands per rib wind round that line.
 *    Every vertex is placed in the vertex stage from parameter space, and the
 *    grow front (`aGrow.x`) both clips the stem and tapers it to a point, so a
 *    rib *grows* rather than scaling. Shaded opaque: ridged bark, knots, a
 *    wrapped sun, a green fresnel rim, sap veins of light running up toward
 *    the apex, a lime-hot grow tip, and a dry brown wither.
 *  - **its shadow** — the same vertex stage writing packed depth, so the vault
 *    throws a vault-shaped shadow rather than a unit grid's.
 *  - **the thorns** (`createBriarThornMaterial`) — rigid hooked cones placed
 *    per instance along the strands. Lacquered red-brown to an ivory point,
 *    with a cold glint on the hook; opaque on `LAYER.WORLD`.
 *  - **the rose window** (`createBriarFloorMaterial`) — the floor of the
 *    nave: a torn ring of soil and root cracks where the ribs broke through,
 *    and, once the vault has closed, the light falling through it as a rose
 *    window — lead tracery (rings, spokes on the ribs' bearings, lancet lobes
 *    between them) round cells of stained light that dapple and breathe.
 *  - **the shaft** (`createBriarShaftMaterial`) — a cone of dusty light from
 *    the apex to the floor, raked by vertical streaks.
 *  - **the warp** (`createBriarWarpMaterial`) — the shaft cone again on
 *    `LAYER.DISTORTION`: the air shudders inward when the vault seals.
 *  - **the runner** (`createBriarRunnerMaterial`) — the bramble that races
 *    along the floor to the circle: two twined roots heaving through the soil
 *    with thorn ticks, a hot front, and a dark furrow behind.
 *
 * Every material reads `settings.briar` in `userData.sync(state)`; `state`
 * carries only what the ability knows that the settings do not.
 */

const ID = 'briar';

/* ==================================================================== */
/* The rib centreline — CPU twin: BriarCathedralAbility#_ribPoint         */
/* ==================================================================== */

const RIB_GLSL = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uRimR;
  uniform float uSpring;
  uniform float uApex;
  uniform float uApexGap;
  uniform float uClose;
  uniform float uLean;
  uniform float uSway;
  uniform float uStrandR;
  uniform float uTwist;
  uniform float uPoint;

  vec2 bez(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
    float u = 1.0 - t;
    return u * u * u * a + 3.0 * u * u * t * b + 3.0 * u * t * t * c + t * t * t * d;
  }

  /** The rib's own line, in metres: up out of the rim, over to the apex. */
  vec3 ribPoint(float s, float theta, float seed) {
    vec2 P0 = vec2(uRimR, -0.5);
    vec2 P1 = vec2(uRimR, uSpring);
    vec2 o2 = vec2(uRimR + uLean * 0.45, uApex * 0.8);
    vec2 o3 = vec2(uRimR + uLean, uApex * 0.92);
    vec2 c2 = vec2(uRimR * mix(0.55, 0.2, uPoint), uApex * mix(1.02, 0.84, uPoint));
    vec2 c3 = vec2(uApexGap, uApex);
    vec2 ry = bez(P0, P1, mix(o2, c2, uClose), mix(o3, c3, uClose), s);
    vec3 D = vec3(cos(theta), 0.0, sin(theta));
    vec3 T = vec3(-sin(theta), 0.0, cos(theta));
    float sway = uSway * (seed * 2.0 - 1.0) * sin(3.14159265 * s);
    return uCentre + D * ry.x + vec3(0.0, ry.y, 0.0) + T * sway;
  }

  /** One of the two strands that twine round that line. */
  vec3 strandPoint(float s, vec4 rib) {
    vec3 c = ribPoint(s, rib.x, rib.y);
    vec3 tg = ribPoint(min(s + 0.01, 1.0), rib.x, rib.y) - ribPoint(max(s - 0.01, 0.0), rib.x, rib.y);
    tg = normalize(tg + vec3(0.0, 1e-5, 0.0));
    vec3 T = vec3(-sin(rib.x), 0.0, cos(rib.x));
    vec3 N2 = normalize(cross(tg, T));
    float phi = rib.z + uTwist * 6.2831853 * s;
    float rr = uStrandR * (1.0 - 0.55 * s);
    return c + (T * cos(phi) + N2 * sin(phi)) * rr;
  }
`;

const RIB_VERTEX_GLSL = /* glsl */ `
  attribute vec4 aRib;
  attribute vec4 aGrow;

  uniform float uRootR;
  uniform float uTipR;
  uniform float uTipTaper;
  uniform float uKnots;
  uniform float uBark;

  varying float vS;
  varying float vAng;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec4  vGrow;
  varying float vSeed;

  ${noiseGLSL}
  ${RIB_GLSL}

  vec3 placeRib() {
    float grow = aGrow.x;
    float s = position.x;
    float se = min(s, grow);
    float ang = position.y * 6.2831853;
    vec3 c = strandPoint(se, aRib);
    vec3 T = strandPoint(min(se + 0.012, 1.0), aRib) - strandPoint(max(se - 0.012, 0.0), aRib);
    T = normalize(T + vec3(0.0, 1e-5, 0.0));
    vec3 ref = abs(T.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 N1 = normalize(cross(T, ref));
    vec3 B = cross(N1, T);
    vec3 radial = cos(ang) * N1 + sin(ang) * B;

    float r = mix(uRootR, uTipR, pow(s, 0.8));
    // The grow front tapers the stem to a point; beyond it there is nothing.
    r *= smoothstep(0.0, max(uTipTaper, 0.005), grow - s);
    float knot = 1.0 + uKnots * pow(abs(sin(s * 19.0 + aRib.y * 10.0)), 14.0);
    float bark = snoise(vec3(s * 46.0, cos(ang) * 1.4, sin(ang) * 1.4 + aRib.y * 5.0));
    r *= knot * (1.0 + uBark * 0.18 * bark);

    vS = s;
    vAng = ang;
    vNormalW = radial;
    vGrow = aGrow;
    vSeed = aRib.y;
    return c + radial * r;
  }
`;

const RIB_VERTEX = /* glsl */ `
  ${RIB_VERTEX_GLSL}
  void main() {
    vec3 world = placeRib();
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RIB_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColorBark;
  uniform vec3  uColorBarkLight;
  uniform vec3  uColorRim;
  uniform vec3  uColorSap;
  uniform vec3  uColorTip;
  uniform vec3  uColorDry;
  uniform float uAmbient;
  uniform float uDiffuse;
  uniform float uRimGlow;
  uniform float uRimPower;
  uniform float uSapGlow;
  uniform float uSapSpeed;
  uniform float uSapWidth;
  uniform float uTipGlow;
  uniform float uSeal;          // 0..1 flash as the vault seals
  uniform float uRidges;

  varying float vS;
  varying float vAng;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec4  vGrow;
  varying float vSeed;

  ${noiseGLSL}

  void main() {
    if (vS > vGrow.x + 0.002) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);

    // Bark: ridges running the length of the stem, mottled, split at knots.
    float ridge = abs(fract(vAng / 6.2831853 * uRidges + snoise(vec3(vS * 9.0, vSeed * 7.0, 0.0)) * 0.25) - 0.5) * 2.0;
    float mott = fbm3(vec3(vS * 22.0, cos(vAng) * 2.0, sin(vAng) * 2.0 + vSeed * 9.0));
    vec3 albedo = mix(uColorBark, uColorBarkLight, clamp(mott * 0.7 + 0.35, 0.0, 1.0));
    albedo *= 0.65 + 0.35 * smoothstep(0.1, 0.6, ridge);

    float wrap = clamp(dot(N, L) * 0.6 + 0.4, 0.0, 1.0);
    float hemi = 0.55 + 0.45 * N.y;
    vec3 color = albedo * (uAmbient * hemi + uDiffuse * wrap);
    float rim = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), uRimPower) * uRimGlow;
    color += uColorRim * rim;

    // Sap: veins of light spiralling up the stem, pulses climbing to the apex.
    float vein = abs(fract(vAng / 6.2831853 * 2.0 + vS * 3.0 + vSeed) - 0.5) * 2.0;
    float veinLine = 1.0 - smoothstep(0.0, uSapWidth, vein);
    float climb = pow(0.5 + 0.5 * sin(6.2831853 * (vS * 4.0 - uTime * uSapSpeed) + vSeed * 6.0), 6.0);
    float wither = vGrow.y;
    float sap = veinLine * (0.25 + 0.75 * climb) * (1.0 - wither) * uShaderIntensity;
    color += uColorSap * sap * uSapGlow * (1.0 + uSeal * 2.0);

    // The growing tip burns lime-hot; so does a rib the instant it breaks the floor.
    float tip = exp(-max(vGrow.x - vS, 0.0) * 45.0) * (1.0 - smoothstep(0.98, 1.0, vGrow.x)) * (1.0 - wither);
    color += uColorTip * (tip * uTipGlow + vGrow.z * 0.4);
    color += uColorSap * uSeal * 0.6 * rim;

    // Wither: dry brown from the apex down, glow gone.
    float wn = snoise(vec3(vS * 6.0, vAng, vSeed * 13.0)) * 0.15;
    float dry = smoothstep(0.0, 0.25, wither * 1.4 - (1.0 - vS) * 0.6 + wn);
    vec3 dried = uColorDry * (uAmbient * hemi + uDiffuse * wrap) * (0.7 + 0.3 * mott);
    color = mix(color, dried, dry);

    gl_FragColor = vec4(color * uGlobalGlow, 1.0);
  }
`;

const RIB_DEPTH_VERTEX = /* glsl */ `
  ${RIB_VERTEX_GLSL}
  void main() {
    vec3 world = placeRib();
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RIB_DEPTH_FRAGMENT = /* glsl */ `
  #include <packing>
  varying float vS;
  varying vec4  vGrow;
  void main() {
    if (vS > vGrow.x + 0.002) discard;
    gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
  }
`;

function ribShapeUniforms() {
  return {
    uCentre: { value: new Vector3() },
    uRimR: { value: 4.5 },
    uSpring: { value: 2 },
    uApex: { value: 6 },
    uApexGap: { value: 0.1 },
    uClose: { value: 0 },
    uLean: { value: 1 },
    uSway: { value: 0.3 },
    uStrandR: { value: 0.12 },
    uTwist: { value: 3 },
    uPoint: { value: 0.6 },
    uRootR: { value: 0.16 },
    uTipR: { value: 0.05 },
    uTipTaper: { value: 0.05 },
    uKnots: { value: 0.3 },
    uBark: { value: 0.5 }
  };
}

/** @param {object} s { centre, close } */
function syncRibShape(u, s) {
  const c = settings[ID];
  const g = settings.global;
  u.uCentre.value.copy(s.centre);
  u.uRimR.value = Math.max(0.3, c.zoneRadius * c.ribInset);
  u.uSpring.value = c.springHeight;
  u.uApex.value = Math.max(c.springHeight + 0.2, c.apexHeight);
  u.uApexGap.value = c.apexGap;
  u.uClose.value = s.close;
  u.uLean.value = c.openLean;
  u.uSway.value = c.ribSway * g.randomness;
  u.uStrandR.value = c.strandSpread;
  u.uTwist.value = c.strandTwist;
  u.uPoint.value = c.archPoint;
  u.uRootR.value = Math.max(0.005, c.rootRadius);
  u.uTipR.value = Math.max(0.003, c.tipRadius);
  u.uTipTaper.value = c.tipTaper;
  u.uKnots.value = c.knots;
  u.uBark.value = c.barkBump * g.noiseStrength;
}

/** The twined briar stems. Opaque, placed in the vertex stage — `LAYER.SHAPED`. */
export function createBriarRibMaterial() {
  const material = new ShaderMaterial({
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...ribShapeUniforms(),
      uColorBark: { value: new Color() },
      uColorBarkLight: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorSap: { value: new Color() },
      uColorTip: { value: new Color() },
      uColorDry: { value: new Color() },
      uAmbient: { value: 0.35 },
      uDiffuse: { value: 0.9 },
      uRimGlow: { value: 0.8 },
      uRimPower: { value: 2.5 },
      uSapGlow: { value: 2 },
      uSapSpeed: { value: 0.8 },
      uSapWidth: { value: 0.12 },
      uTipGlow: { value: 4 },
      uSeal: { value: 0 },
      uRidges: { value: 7 }
    }),
    vertexShader: RIB_VERTEX,
    fragmentShader: RIB_FRAGMENT
  });

  const depth = new ShaderMaterial({
    uniforms: material.uniforms,
    vertexShader: RIB_DEPTH_VERTEX,
    fragmentShader: RIB_DEPTH_FRAGMENT,
    side: DoubleSide
  });
  material.userData.depth = depth;

  /** @param {object} s { centre, close, seal } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncRibShape(u, s);
    u.uColorBark.value.copy(getColor(c.colorBark));
    u.uColorBarkLight.value.copy(getColor(c.colorBarkLight));
    u.uColorRim.value.copy(getColor(c.colorRibRim));
    u.uColorSap.value.copy(getColor(c.colorSap));
    u.uColorTip.value.copy(getColor(c.colorGrowTip));
    u.uColorDry.value.copy(getColor(c.colorDry));
    u.uAmbient.value = c.ribAmbient;
    u.uDiffuse.value = c.ribDiffuse;
    u.uRimGlow.value = c.ribRimGlow * g.fresnel;
    u.uRimPower.value = c.ribRimPower;
    u.uSapGlow.value = c.sapGlow * g.glow;
    u.uSapSpeed.value = c.sapSpeed * g.animationSpeed;
    u.uSapWidth.value = c.sapWidth;
    u.uTipGlow.value = c.growTipGlow * g.glow;
    u.uSeal.value = s.seal;
    u.uRidges.value = c.barkRidges;
  };

  return material;
}

/* ==================================================================== */
/* Thorns                                                                */
/* ==================================================================== */

const THORN_VERTEX = /* glsl */ `
  attribute float aT;
  attribute vec2  aState;     // seed, glint

  varying float vT;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vState;

  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * normal);
    vT = aT;
    vState = aState;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const THORN_FRAGMENT = /* glsl */ `
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform vec3  uColorBase;
  uniform vec3  uColorMid;
  uniform vec3  uColorPoint;
  uniform vec3  uColorGlint;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uGlint;
  uniform float uDry;
  uniform vec3  uColorDry;

  varying float vT;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec2  vState;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);

    vec3 albedo = mix(uColorBase, uColorMid, smoothstep(0.0, 0.45, vT));
    albedo = mix(albedo, uColorPoint, smoothstep(0.55, 1.0, vT));
    albedo = mix(albedo, uColorDry, uDry * (1.0 - vT * 0.5));
    float wrap = clamp(dot(N, L) * 0.6 + 0.4, 0.0, 1.0);
    vec3 color = albedo * (0.3 + 0.85 * wrap);
    // Lacquered: a hard highlight along the hook.
    color += vec3(pow(max(dot(N, H), 0.0), uGloss) * uSpecular);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    color += uColorGlint * (fres * 0.4 + smoothstep(0.75, 1.0, vT) * vState.y) * uGlint * (1.0 - uDry);
    gl_FragColor = vec4(color * uGlobalGlow, 1.0);
  }
`;

/** Rigid, instanced thorns. `LAYER.WORLD` — they write depth and cast shadows. */
export function createBriarThornMaterial() {
  const material = new ShaderMaterial({
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uColorBase: { value: new Color() },
      uColorMid: { value: new Color() },
      uColorPoint: { value: new Color() },
      uColorGlint: { value: new Color() },
      uColorDry: { value: new Color() },
      uGloss: { value: 40 },
      uSpecular: { value: 0.5 },
      uGlint: { value: 2 },
      uDry: { value: 0 }
    }),
    vertexShader: THORN_VERTEX,
    fragmentShader: THORN_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {object} s { dry } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uColorBase.value.copy(getColor(c.colorThornBase));
    u.uColorMid.value.copy(getColor(c.colorThornMid));
    u.uColorPoint.value.copy(getColor(c.colorThornPoint));
    u.uColorGlint.value.copy(getColor(c.colorThornGlint));
    u.uColorDry.value.copy(getColor(c.colorDry));
    u.uGloss.value = c.thornGloss;
    u.uSpecular.value = c.thornSpecular;
    u.uGlint.value = c.thornGlint * g.glow;
    u.uDry.value = s.dry;
  };

  return material;
}

/* ==================================================================== */
/* The rose window on the floor                                          */
/* ==================================================================== */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  varying vec2 vP;
  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    vec3 world = vec3(uCentre.x + p.x, 0.014, uCentre.z + p.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uRadius;
  uniform float uRibs;
  uniform float uRot;
  uniform float uSeed;
  uniform float uSoil;        // 0..1 the rim torn open
  uniform float uLight;       // 0..1 the window lit
  uniform float uErode;       // 0..1 the end of the cast
  uniform float uSoilWidth;
  uniform float uRootCracks;
  uniform float uLead;
  uniform float uGlassGlow;
  uniform float uDapple;
  uniform float uWindowR;
  uniform float uOpacity;
  uniform vec3  uColorSoil;
  uniform vec3  uColorRoot;
  uniform vec3  uColorLead;
  uniform vec3  uGlassA;
  uniform vec3  uGlassB;
  uniform vec3  uGlassC;
  uniform vec3  uGlassD;

  varying vec2 vP;

  ${noiseGLSL}

  vec3 glass(float id) {
    if (id < 0.25) return uGlassA;
    if (id < 0.5) return uGlassB;
    if (id < 0.75) return uGlassC;
    return uGlassD;
  }

  void main() {
    vec2 p = vP;
    float r = length(p);
    float a = atan(p.y, p.x);
    float R = uRadius;

    // Sector coordinates on the ribs' bearings: 0 on a rib, 1 between two.
    float sector = (a - uRot) / 6.2831853 * uRibs;
    float sid = floor(sector + 0.5);
    float m = abs(fract(sector + 0.5) - 0.5) * 2.0;
    float sideM = m * 3.14159265 / uRibs * r;     // metres off the rib's bearing

    /* ---- the rim: soil torn up where the ribs came through ---- */
    float rag = snoise(vec3(p * 0.8, uSeed)) * 0.3;
    float soil = 1.0 - smoothstep(0.0, uSoilWidth * (0.7 + rag), abs(r - R));
    float wob = snoise(vec3(r * 1.7, sid * 3.1, uSeed)) * 0.18;
    float crack = 1.0 - smoothstep(0.0, 0.07, abs(sideM + wob));
    crack *= smoothstep(R * 0.35, R * 0.95, r) * (1.0 - smoothstep(R, R + 0.4, r)) * uRootCracks;
    float soilA = max(soil * 0.85, crack) * uSoil;

    /* ---- the rose window: the light the vault lets through ---- */
    float rn = r / max(uWindowR, 0.1);
    float lw = uLead * 0.5;
    float rings = 1.0 - smoothstep(lw, lw * 2.0, min(min(abs(rn - 0.24), abs(rn - 0.56)), abs(rn - 0.9)) * uWindowR);
    float spokes = (1.0 - smoothstep(lw, lw * 2.0, sideM)) * step(0.24, rn);
    // Lancets between the ribs: a pointed lobe, narrowing outward.
    float lt = clamp((rn - 0.24) / 0.66, 0.0, 1.0);
    float lobeW = 0.78 * (1.0 - pow(lt, 2.2));
    float lobe = (1.0 - m) - (1.0 - lobeW);
    float lobeLead = (1.0 - smoothstep(lw, lw * 2.0, abs(lobe) * 3.14159265 / uRibs * r)) * step(0.24, rn) * step(rn, 0.9);
    // The rosette at the heart: twice as many petals.
    float inner = abs(fract((a - uRot) / 6.2831853 * uRibs * 2.0) - 0.5) * 2.0;
    float rosette = (1.0 - smoothstep(lw, lw * 2.0, abs(rn - 0.16 * (0.55 + 0.45 * inner)) * uWindowR)) * step(rn, 0.24);
    float lead = clamp(max(max(rings, spokes), max(lobeLead, rosette)), 0.0, 1.0);

    float inLobe = step(0.0, lobe);
    float ringId = rn < 0.24 ? 0.0 : (rn < 0.56 ? 1.0 : 2.0);
    float id = hash11(sid * 7.13 + ringId * 3.7 + inLobe * 11.9 + floor(uSeed));
    vec3 tint = glass(id);
    float dapple = 1.0 - uDapple + uDapple * (0.55 + 0.45 * snoise(vec3(p * 0.9, uTime * 0.35 + uSeed)));
    float inside = 1.0 - smoothstep(0.88, 0.96, rn);
    float light = uLight * inside * (1.0 - lead) * dapple;
    // Brightest through the middle of each pane.
    light *= 0.7 + 0.3 * smoothstep(0.0, 0.35, abs(lobe) + 0.1);

    vec3 col = uColorSoil;
    col = mix(col, uColorRoot, crack);
    vec3 lit = tint * uGlassGlow * uGlobalGlow * uShaderIntensity;
    col = mix(col, lit, clamp(light * 1.4, 0.0, 1.0));
    col = mix(col, uColorLead, lead * uLight * inside);

    float a1 = max(soilA, max(light * 0.85, lead * uLight * inside * 0.75));
    float n = snoise(vec3(p * 1.5, uSeed * 3.0)) * 0.5 + 0.5;
    float thr = uErode * 1.25 - 0.15;
    a1 *= smoothstep(thr, thr + 0.15, n);
    a1 *= uOpacity;
    if (a1 < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a1, 0.0, 1.0));
  }
`;

/** Torn rim and rose-window light on the nave floor. Normal blending — the tracery darkens. */
export function createBriarFloorMaterial() {
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
      uExtent: { value: 6 },
      uRadius: { value: 4.5 },
      uRibs: { value: 8 },
      uRot: { value: 0 },
      uSeed: { value: 0 },
      uSoil: { value: 0 },
      uLight: { value: 0 },
      uErode: { value: 0 },
      uSoilWidth: { value: 0.6 },
      uRootCracks: { value: 1 },
      uLead: { value: 0.08 },
      uGlassGlow: { value: 2 },
      uDapple: { value: 0.3 },
      uWindowR: { value: 4 },
      uOpacity: { value: 1 },
      uColorSoil: { value: new Color() },
      uColorRoot: { value: new Color() },
      uColorLead: { value: new Color() },
      uGlassA: { value: new Color() },
      uGlassB: { value: new Color() },
      uGlassC: { value: new Color() },
      uGlassD: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} s { centre, ribs, rot, seed, soil, light, erode } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    const R = Math.max(0.3, c.zoneRadius * c.ribInset);
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = R;
    u.uExtent.value = R + c.soilWidth + 0.8;
    u.uRibs.value = s.ribs;
    u.uRot.value = s.rot;
    u.uSeed.value = s.seed;
    u.uSoil.value = s.soil;
    u.uLight.value = s.light;
    u.uErode.value = s.erode;
    u.uSoilWidth.value = c.soilWidth;
    u.uRootCracks.value = c.rootCracks;
    u.uLead.value = c.leadWidth;
    u.uGlassGlow.value = c.glassGlow * g.glow;
    u.uDapple.value = c.glassDapple;
    u.uWindowR.value = R * c.windowScale;
    u.uOpacity.value = g.opacity;
    u.uColorSoil.value.copy(getColor(c.colorSoil));
    u.uColorRoot.value.copy(getColor(c.colorRootCrack));
    u.uColorLead.value.copy(getColor(c.colorLead));
    u.uGlassA.value.copy(getColor(c.colorGlassA));
    u.uGlassB.value.copy(getColor(c.colorGlassB));
    u.uGlassC.value.copy(getColor(c.colorGlassC));
    u.uGlassD.value.copy(getColor(c.colorGlassD));
  };

  return material;
}

/* ==================================================================== */
/* The light shaft, and its warp twin                                    */
/* ==================================================================== */

const SHAFT_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uBottomR;
  uniform float uTopR;
  uniform float uHeight;

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  void main() {
    float a = position.x * 6.2831853;
    float t = position.y;
    float r = mix(uBottomR, uTopR, t);
    vec3 D = vec3(cos(a), 0.0, sin(a));
    vec3 world = uCentre + D * r + vec3(0.0, t * uHeight, 0.0);
    vUv = position.xy;
    vNormalW = normalize(D * uHeight + vec3(0.0, uBottomR - uTopR, 0.0));
    vWorld = world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHAFT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;

  uniform float uLight;
  uniform float uRays;
  uniform float uDrift;
  uniform float uGlow;
  uniform float uSeed;
  uniform vec3  uColorLow;
  uniform vec3  uColorHigh;

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    // A volume, not a shell: thickest where you look through the middle of it.
    float through = pow(abs(dot(N, V)), 1.4);
    float streak = fbm3(vec3(vUv.x * uRays, vUv.y * 1.2 - uTime * uDrift, uSeed));
    streak = smoothstep(-0.1, 0.7, streak);
    float motes = smoothstep(0.72, 0.95, snoise(vec3(vUv.x * uRays * 3.0, vUv.y * 9.0 + uTime * uDrift * 2.0, uSeed + 4.0)));
    float h = vUv.y;
    float env = smoothstep(0.0, 0.1, h) * pow(1.0 - h, 0.6);
    float a = (streak * 0.75 + motes * 0.6) * env * through * uLight;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.6);
    if (a < 0.003) discard;
    vec3 col = mix(uColorLow, uColorHigh, h) * uGlow * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(col * a, a);
  }
`;

function shaftUniforms() {
  return {
    uCentre: { value: new Vector3() },
    uBottomR: { value: 3 },
    uTopR: { value: 0.3 },
    uHeight: { value: 6 }
  };
}

function syncShaftShape(u, s) {
  const c = settings[ID];
  const R = Math.max(0.3, c.zoneRadius * c.ribInset);
  u.uCentre.value.copy(s.centre);
  u.uBottomR.value = R * c.shaftSpread;
  u.uTopR.value = Math.max(0.05, c.shaftTop);
  u.uHeight.value = Math.max(c.springHeight + 0.2, c.apexHeight) * 0.97;
}

/** The dusty cone of light under the apex. Additive. */
export function createBriarShaftMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...shaftUniforms(),
      uLight: { value: 0 },
      uRays: { value: 14 },
      uDrift: { value: 0.3 },
      uGlow: { value: 1.5 },
      uSeed: { value: 0 },
      uColorLow: { value: new Color() },
      uColorHigh: { value: new Color() }
    }),
    vertexShader: SHAFT_VERTEX,
    fragmentShader: SHAFT_FRAGMENT
  });

  /** @param {object} s { centre, light, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncShaftShape(u, s);
    u.uLight.value = s.light * c.shaftOpacity * g.opacity;
    u.uRays.value = Math.round(c.shaftRays);
    u.uDrift.value = c.shaftDrift * g.noiseSpeed;
    u.uGlow.value = c.shaftGlow * g.glow;
    u.uSeed.value = s.seed;
    u.uColorLow.value.copy(getColor(c.colorShaftLow));
    u.uColorHigh.value.copy(getColor(c.colorShaftHigh));
  };

  return material;
}

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSeed;

  varying vec2  vUv;
  varying vec3  vNormalW;
  varying vec3  vWorld;

  ${noiseGLSL}

  void main() {
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale - uTime * 2.0 + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(13.1, 7.3, 3.9)));
    float mask = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
    float s = uStrength * uShaderIntensity * mask;
    if (s < 0.002) discard;
    gl_FragColor = vec4(n * 0.5 + 0.5, s, mask);
  }
`;

/** The air shuddering as the vault seals. `LAYER.DISTORTION`. */
export function createBriarWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...shaftUniforms(),
      uStrength: { value: 0 },
      uScale: { value: 1.2 },
      uSeed: { value: 0 }
    }),
    vertexShader: SHAFT_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { centre, strength, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncShaftShape(u, s);
    u.uBottomR.value = Math.max(0.3, c.zoneRadius * c.ribInset) * 1.05;
    u.uStrength.value = s.strength * c.sealWarp * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSeed.value = s.seed;
  };

  return material;
}

/* ==================================================================== */
/* The runner — the bramble racing along the floor to the circle         */
/* ==================================================================== */

const RUNNER_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uHalfWidth;
  varying vec2 vFlat;   // x: metres across, y: metres along
  void main() {
    float across = position.y * uHalfWidth;
    float along = position.x * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = 0.016;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RUNNER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uFront;        // metres the runner has reached
  uniform float uHalfWidth;
  uniform float uWave;
  uniform float uWaveLen;
  uniform float uLine;
  uniform float uGlow;
  uniform float uFade;         // 0..1 eroding away
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3  uColorSoil;
  uniform vec3  uColorRoot;
  uniform vec3  uColorHot;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    float along = vFlat.y;
    float x = vFlat.x;
    if (along > uFront + 0.3 || along < 0.0) discard;
    float ph = along / max(uWaveLen, 0.05) * 6.2831853 + uSeed;
    float wander = snoise(vec3(along * 0.4, uSeed, 0.0)) * uWave * 0.6;
    float y1 = sin(ph) * uWave + wander;
    float y2 = -sin(ph) * uWave + wander;
    float l1 = 1.0 - smoothstep(uLine * 0.5, uLine, abs(x - y1));
    float l2 = 1.0 - smoothstep(uLine * 0.5, uLine, abs(x - y2));
    // Thorn ticks: little barbs off each root, on a beat along the line.
    float tick = step(0.82, fract(along * 2.6 + uSeed)) * (1.0 - smoothstep(uLine, uLine * 2.4, min(abs(x - y1), abs(x - y2))));
    float root = max(max(l1, l2), tick * 0.8);
    // The heave: soil pushed up and darkened either side.
    float heave = (1.0 - smoothstep(uHalfWidth * 0.35, uHalfWidth, abs(x - wander))) * (0.6 + 0.4 * snoise(vec3(vFlat * 2.3, uSeed)));
    float frontGlow = exp(-max(uFront - along, 0.0) * 1.6) * (1.0 - smoothstep(uFront, uFront + 0.3, along));
    float cool = 1.0 - smoothstep(0.0, 0.7, uFade);
    vec3 col = mix(uColorSoil, uColorRoot, root);
    col += uColorHot * root * (0.25 + frontGlow * 2.5) * uGlow * cool * uGlobalGlow * uShaderIntensity;
    float a = max(heave * 0.7, root);
    a *= smoothstep(0.0, 0.8, along) * (1.0 - smoothstep(uFront, uFront + 0.3, along));
    float n = snoise(vec3(vFlat * 1.4, uSeed * 2.0)) * 0.5 + 0.5;
    float thr = uFade * 1.2 - 0.1;
    a *= smoothstep(thr, thr + 0.15, n) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The bramble racing out to the circle. */
export function createBriarRunnerMaterial() {
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
      uHalfWidth: { value: 0.6 },
      uFront: { value: 0 },
      uWave: { value: 0.12 },
      uWaveLen: { value: 1.6 },
      uLine: { value: 0.06 },
      uGlow: { value: 2 },
      uFade: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uColorSoil: { value: new Color() },
      uColorRoot: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: RUNNER_VERTEX,
    fragmentShader: RUNNER_FRAGMENT
  });

  /** @param {object} s { start, dir, side, length, front, fade, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(s.start);
    u.uDir.value.copy(s.dir);
    u.uSide.value.copy(s.side);
    u.uLength.value = Math.max(0.1, s.length);
    u.uHalfWidth.value = c.runnerWidth;
    u.uFront.value = s.front;
    u.uWave.value = c.runnerWave * g.noiseStrength;
    u.uWaveLen.value = c.runnerWaveLength;
    u.uLine.value = c.runnerLine;
    u.uGlow.value = c.runnerGlow * g.glow;
    u.uFade.value = s.fade;
    u.uSeed.value = s.seed;
    u.uOpacity.value = g.opacity;
    u.uColorSoil.value.copy(getColor(c.colorSoil));
    u.uColorRoot.value.copy(getColor(c.colorBark));
    u.uColorHot.value.copy(getColor(c.colorGrowTip));
  };

  return material;
}
