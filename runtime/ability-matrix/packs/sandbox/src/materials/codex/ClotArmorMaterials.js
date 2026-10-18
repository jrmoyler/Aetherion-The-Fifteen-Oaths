import { Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'clotarmor';

/**
 * Clot Armor — the four bespoke shaders.
 *
 *  - **the plates** (`createClotPlateMaterial`) — opaque, instanced, on
 *    `LAYER.WORLD` (placed through `instanceMatrix`, so the depth prepass and
 *    the shadow map draw them where they stand). What makes a curved slab read
 *    as *coagulated blood hardened into armour*:
 *      1. **lames** — overlapping bands across the plate's height, each one
 *         darker where it tucks under the band above and catching a bright
 *         lip where it laps over, so the plate reads as segmented armour;
 *      2. **clot lumps** — fbm on the plate's own coordinates, bumping the
 *         normal and pooling bright wet red in the hollows between the
 *         darker crust;
 *      3. **wetness** (`aState.y`) — fresh plates are glossy, mirror the sky
 *         and are fresh-blood red; as they harden the gloss dies, the crust
 *         spreads and the colour drops to a dried maroon;
 *      4. **subsurface rim** — a red fresnel glow, as if light came through
 *         the thin edges of the clot;
 *      5. **cracks** (`aState.z`) — F2−F1 cell edges that open and glow red
 *         as the armour fails, and a **dissolve** (`aState.w`) that crumbles
 *         the plate away behind a hot edge;
 *      6. the **inner face** (`aPlate.z`) is wet, raw and lit from within —
 *         what the camera sees when it looks into the carapace.
 *  - **the pool** (`createClotPoolMaterial`) — a floor disc of blood that
 *    floods out with a fingered, ragged edge, wet (a height field, a sun
 *    highlight, the sky in it), with a coagulated dark tide line; it dries to
 *    a cracked brown crust and erodes at the end.
 *  - **the rivulet** (`createClotRivuletMaterial`) — the same blood running
 *    down the cast line, meandering, with a bulging head where the front is.
 *  - **the clank** (`createClotWarpMaterial`) — an expanding ring on
 *    `LAYER.DISTORTION` that bends the air the moment the carapace locks.
 *
 * Every material reads `settings.clotarmor` in `userData.sync()`.
 */

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/** F2 − F1 Voronoi: 0 on a cell border, growing into the cell. */
const EDGES_GLSL = /* glsl */ `
  float cellEdges(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; }
        else if (d < d2) { d2 = d; }
      }
    }
    return sqrt(d2) - sqrt(d1);
  }
`;

/* ==================================================================== */
/* The plates                                                             */
/* ==================================================================== */

const PLATE_VERTEX = /* glsl */ `
  attribute vec4 aState;
  attribute vec3 aPlate;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vPlate;
  varying vec4 vState;

  void main() {
    vPlate = aPlate;
    vState = aState;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PLATE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColorCrust;
  uniform vec3  uColorClot;
  uniform vec3  uColorWet;
  uniform vec3  uColorRim;
  uniform vec3  uColorCrack;
  uniform vec3  uColorInner;

  uniform float uLames;
  uniform float uLameDepth;
  uniform float uLumpScale;
  uniform float uLumpBump;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uEnv;
  uniform float uDiffuse;
  uniform float uAmbient;
  uniform float uRimGlow;
  uniform float uCrackScale;
  uniform float uCrackGlow;
  uniform float uEdgeGlow;
  uniform float uInnerGlow;
  uniform float uBeat;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vPlate;
  varying vec4 vState;

  ${noiseGLSL}
  ${ENV_GLSL}
  ${EDGES_GLSL}

  void main() {
    float seed = vState.x;
    float wet = vState.y;
    float crack = vState.z;
    float dissolve = vState.w;
    vec2 pc = vec2(vPlate.x * 0.55, vPlate.y);
    float inner = step(0.75, vPlate.z);
    float rim = step(0.25, vPlate.z) * (1.0 - inner);

    // 5 · crumbling away, behind a hot edge.
    float dn = fbm3(vec3(pc * 3.2, seed * 13.0)) * 0.5 + 0.5;
    dn = mix(dn, 1.0 - vPlate.y, 0.35);
    if (dn < dissolve * 1.15) discard;
    float burn = 1.0 - smoothstep(0.0, 0.07, dn - dissolve * 1.15);
    burn *= step(0.001, dissolve);

    // 1 · lames — overlapping bands, each tucked under the one above.
    float wob = snoise(vec3(pc * 2.0, seed * 3.0)) * 0.12;
    float l = vPlate.y * uLames + wob - abs(vPlate.x) * 0.35;
    float lame = fract(l);
    float tuck = smoothstep(0.0, 0.55, lame);          // dark under the lap, lighter up the band
    float lip = smoothstep(0.82, 0.97, lame) * (1.0 - smoothstep(0.97, 1.0, lame));

    // 2 · clot lumps.
    vec3 lp = vec3(pc * uLumpScale, seed * 7.0);
    float lump = fbm3(lp);
    vec3 bump = vec3(snoise(lp * 2.1), snoise(lp * 2.1 + 17.0), snoise(lp * 2.1 + 31.0));
    vec3 N = normalize(vNormal + bump * uLumpBump * 0.25 * uShaderIntensity);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;

    float hollow = smoothstep(0.1, -0.35, lump);
    vec3 albedo = mix(uColorCrust, uColorClot, smoothstep(-0.4, 0.5, lump));
    // 3 · wet: fresh red pools in the hollows and over the whole plate.
    albedo = mix(albedo, uColorWet, clamp(hollow * (0.2 + 0.5 * wet) + wet * 0.12, 0.0, 1.0));
    albedo *= mix(1.0, 0.3 + 0.7 * tuck, uLameDepth);
    // A hard dark seam where each lame tucks under the next.
    albedo *= 1.0 - (1.0 - smoothstep(0.0, 0.06, lame)) * 0.7 * uLameDepth;
    albedo = mix(albedo, uColorWet * 1.2, lip * uLameDepth * 0.7);
    albedo = mix(albedo, uColorInner, inner);

    // Lighting: wrapped sun, sky, a glossy wet sheen that dries off.
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndl = max(dot(N, L) * 0.8 + 0.2, 0.0);
    float hemi = 0.5 + 0.5 * N.y;
    vec3 color = albedo * (uAmbient * (0.5 + 0.5 * hemi) + uDiffuse * ndl);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    float gloss = mix(8.0, uGloss, wet);
    color += texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uEnv * F * (0.25 + 0.75 * wet);
    color += vec3(1.0, 0.85, 0.85) * pow(max(dot(N, H), 0.0), gloss) * uSpecular * (0.2 + 0.8 * wet) * (0.5 + hollow);

    // 4 · light through the thin clot at the silhouette and the rim.
    float fres = pow(1.0 - ndv, 2.5);
    float glow = fres * uRimGlow * (0.6 + 0.4 * wet) + rim * uRimGlow * 0.5;
    glow += inner * uInnerGlow * (0.6 + 0.4 * sin(uTime * 3.0 + vPlate.y * 6.0));
    glow *= 1.0 + uBeat * 1.5;

    // 5 · cracks open and burn as the armour fails.
    float ce = cellEdges(pc * uCrackScale + seed * 9.0);
    float cr = (1.0 - smoothstep(0.0, 0.06 + 0.06 * crack, ce)) * smoothstep(0.0, 0.25, crack);
    color *= 1.0 - cr * 0.7;
    color = mix(color, color * 0.55, crack * 0.4);

    vec3 emit = uColorRim * glow + uColorCrack * (cr * uCrackGlow + burn * uEdgeGlow);
    color += emit * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** The carapace. Opaque, instanced; lives on LAYER.WORLD. */
export function createClotPlateMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uColorCrust: { value: new Color() },
      uColorClot: { value: new Color() },
      uColorWet: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorCrack: { value: new Color() },
      uColorInner: { value: new Color() },
      uLames: { value: 5 },
      uLameDepth: { value: 0.5 },
      uLumpScale: { value: 2.4 },
      uLumpBump: { value: 0.6 },
      uGloss: { value: 70 },
      uSpecular: { value: 1.2 },
      uEnv: { value: 0.6 },
      uDiffuse: { value: 0.9 },
      uAmbient: { value: 0.25 },
      uRimGlow: { value: 1.5 },
      uCrackScale: { value: 3 },
      uCrackGlow: { value: 4 },
      uEdgeGlow: { value: 5 },
      uInnerGlow: { value: 0.6 },
      uBeat: { value: 0 }
    }),
    vertexShader: PLATE_VERTEX,
    fragmentShader: PLATE_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {number} beat 0..1 heartbeat envelope */
  material.userData.sync = (beat) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uColorCrust.value.copy(getColor(c.colorCrust));
    u.uColorClot.value.copy(getColor(c.colorClot));
    u.uColorWet.value.copy(getColor(c.colorWet));
    u.uColorRim.value.copy(getColor(c.colorRim));
    u.uColorCrack.value.copy(getColor(c.colorCrack));
    u.uColorInner.value.copy(getColor(c.colorInner));
    u.uLames.value = c.lames;
    u.uLameDepth.value = c.lameDepth;
    u.uLumpScale.value = c.lumpScale * g.noiseFrequency;
    u.uLumpBump.value = c.lumpBump * g.noiseStrength;
    u.uGloss.value = c.wetGloss;
    u.uSpecular.value = c.wetSpecular;
    u.uEnv.value = c.envSheen * g.fresnel;
    u.uDiffuse.value = c.plateDiffuse;
    u.uAmbient.value = c.plateAmbient;
    u.uRimGlow.value = c.rimGlow * g.glow;
    u.uCrackScale.value = c.crackScale;
    u.uCrackGlow.value = c.crackGlow * g.glow;
    u.uEdgeGlow.value = c.crumbleGlow * g.glow;
    u.uInnerGlow.value = c.innerGlow * g.glow;
    u.uBeat.value = beat;
  };

  return material;
}

/* ==================================================================== */
/* Blood on the floor — shared by the pool and the rivulet                */
/* ==================================================================== */

/**
 * The wet-blood surface, given a mask and a "how far into the blood" depth.
 * A height field gives it a normal; the sun and the sky give it a highlight;
 * drying turns it matte, browner, and opens a crust of cracks.
 */
const BLOOD_GLSL = /* glsl */ `
  vec3 bloodSurface(vec2 p, float inside, float seed, float dry, vec3 deep, vec3 fresh, vec3 dried,
                    vec3 lightDir, sampler2D env, float gloss, float spec, float envAmt, out float crustLine) {
    float hs = 1.6;
    float h  = fbm3(vec3(p * hs, seed));
    float hx = fbm3(vec3((p + vec2(0.05, 0.0)) * hs, seed));
    float hz = fbm3(vec3((p + vec2(0.0, 0.05)) * hs, seed));
    vec3 N = normalize(vec3(-(hx - h) * 0.9, 1.0, -(hz - h) * 0.9));
    vec3 V = normalize(cameraPosition - vec3(p.x, 0.0, p.y));
    vec3 L = normalize(lightDir);
    vec3 H = normalize(L + V);

    // Thicker blood is darker; the thin edge is fresher, brighter red.
    vec3 col = mix(fresh, deep, smoothstep(0.0, 0.8, inside) * (0.6 + 0.4 * h));
    // Crust: drying opens fine cracks and drops the colour to brown.
    float ce = cellEdges(p * 2.6 + seed);
    crustLine = (1.0 - smoothstep(0.0, 0.05, ce)) * smoothstep(0.3, 0.9, dry);
    col = mix(col, dried, smoothstep(0.0, 1.0, dry) * 0.85);
    col *= 1.0 - crustLine * 0.5;

    float wet = 1.0 - dry;
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    col += texture2D(env, equirectUv(reflect(-V, N))).rgb * envAmt * F * wet;
    col += vec3(1.0, 0.9, 0.9) * pow(max(dot(N, H), 0.0), gloss) * spec * wet;
    return col;
  }
`;

/* ==================================================================== */
/* The pool                                                               */
/* ==================================================================== */

const POOL_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;

  varying vec2 vP;
  varying vec2 vWorldXZ;

  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    vec3 world = vec3(uCentre.x + p.x, 0.016, uCentre.z + p.y);
    vWorldXZ = world.xz;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uSpread;     // metres the flood has reached
  uniform float uRadius;     // the circle
  uniform float uSeed;
  uniform float uRagged;
  uniform float uFingers;
  uniform float uDry;
  uniform float uErode;
  uniform float uRing;       // 0..1, the blood running round the rim
  uniform float uRingGlow;
  uniform float uGloss;
  uniform float uSpec;
  uniform float uEnv;
  uniform float uOpacity;
  uniform float uTide;

  uniform vec3 uColorDeep;
  uniform vec3 uColorFresh;
  uniform vec3 uColorDried;
  uniform vec3 uColorRim;

  varying vec2 vP;
  varying vec2 vWorldXZ;

  ${noiseGLSL}
  ${ENV_GLSL}
  ${EDGES_GLSL}
  ${BLOOD_GLSL}

  void main() {
    vec2 p = vP;
    float r = length(p);
    float ang = atan(p.y, p.x);
    vec2 dirp = vec2(cos(ang), sin(ang));

    // A fingered, ragged edge: slow lobes plus thin runners.
    float lobes = snoise(vec3(dirp * 1.3, uSeed)) * uRagged;
    float runners = pow(max(snoise(vec3(dirp * 5.0, uSeed + 4.0)), 0.0), 2.0) * uFingers;
    float edge = uSpread + lobes + runners * smoothstep(0.3, 1.0, uSpread / max(uRadius, 0.1));
    float d = edge - r;                     // metres inside the edge
    float inside = smoothstep(-0.02, 0.05, d);

    // Splatter beyond the edge.
    float spl = smoothstep(0.62, 0.8, snoise(vec3(vP * 2.4, uSeed + 9.0))) * (1.0 - smoothstep(0.0, 0.9, -d)) * step(d, 0.0);
    float mask = max(inside, spl);
    if (mask < 0.003) discard;

    float crust;
    vec3 col = bloodSurface(vWorldXZ, clamp(d / 1.2, 0.0, 1.0), uSeed, uDry, uColorDeep, uColorFresh, uColorDried,
                            uLightDir, uEnvMap, uGloss, uSpec, uEnv, crust);

    // A coagulated dark tide line at the edge.
    float tide = (1.0 - smoothstep(0.0, 0.12, abs(d - 0.06))) * uTide;
    col *= 1.0 - tide * 0.6;

    // The ring of blood running round the rim as the plates rise out of it.
    float rimBand = 1.0 - smoothstep(0.0, 0.35, abs(r - uRadius));
    col += uColorRim * rimBand * uRing * uRingGlow * (1.0 - uDry) * uGlobalGlow * uShaderIntensity;

    // Erodes raggedly at the end — thin blood first.
    float n = snoise(vec3(vP * 1.7, uSeed * 3.0)) * 0.5 + 0.5;
    float thr = uErode * 1.25 - 0.1;
    float a = mask * smoothstep(thr, thr + 0.15, mix(n, clamp(d, 0.0, 1.0), 0.4));
    a *= uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The flooded circle. Normal blending — blood has to be able to darken the floor. */
export function createClotPoolMaterial() {
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
      uEnvMap: frame.uEnvMap,
      uCentre: { value: new Vector3() },
      uExtent: { value: 5 },
      uSpread: { value: 0 },
      uRadius: { value: 4 },
      uSeed: { value: 0 },
      uRagged: { value: 0.4 },
      uFingers: { value: 0.5 },
      uDry: { value: 0 },
      uErode: { value: 0 },
      uRing: { value: 0 },
      uRingGlow: { value: 1 },
      uGloss: { value: 80 },
      uSpec: { value: 1 },
      uEnv: { value: 0.5 },
      uOpacity: { value: 1 },
      uTide: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorFresh: { value: new Color() },
      uColorDried: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT
  });

  /** @param {object} s { centre, spread, radius, seed, dry, erode, ring } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = s.radius;
    u.uExtent.value = s.radius + c.poolRagged + c.poolFingers + 1.2;
    u.uSpread.value = s.spread;
    u.uSeed.value = s.seed;
    u.uRagged.value = c.poolRagged * g.noiseStrength * g.randomness;
    u.uFingers.value = c.poolFingers * g.noiseStrength;
    u.uDry.value = s.dry;
    u.uErode.value = s.erode;
    u.uRing.value = s.ring;
    u.uRingGlow.value = c.rimRunGlow * g.glow;
    u.uGloss.value = c.poolGloss;
    u.uSpec.value = c.poolSpecular;
    u.uEnv.value = c.poolSheen * g.fresnel;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uTide.value = c.tideLine;
    u.uColorDeep.value.copy(getColor(c.colorPoolDeep));
    u.uColorFresh.value.copy(getColor(c.colorPoolFresh));
    u.uColorDried.value.copy(getColor(c.colorPoolDried));
    u.uColorRim.value.copy(getColor(c.colorRim));
  };

  return material;
}

/* ==================================================================== */
/* The rivulet                                                            */
/* ==================================================================== */

const RIVULET_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uWidth;

  varying vec2 vS;        // x: metres along, y: metres across
  varying vec2 vWorldXZ;

  void main() {
    float along = position.x * uLength;
    float across = position.z * uWidth * 1.8;
    vec3 world = uStart + uDir * along + uSide * across;
    world.y = 0.014;
    vS = vec2(along, across);
    vWorldXZ = world.xz;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RIVULET_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;

  uniform float uFront;      // metres the blood has run
  uniform float uLength;
  uniform float uWidth;
  uniform float uMeander;
  uniform float uSeed;
  uniform float uDry;
  uniform float uErode;
  uniform float uGloss;
  uniform float uSpec;
  uniform float uEnv;
  uniform float uOpacity;

  uniform vec3 uColorDeep;
  uniform vec3 uColorFresh;
  uniform vec3 uColorDried;

  varying vec2 vS;
  varying vec2 vWorldXZ;

  ${noiseGLSL}
  ${ENV_GLSL}
  ${EDGES_GLSL}
  ${BLOOD_GLSL}

  void main() {
    float s = vS.x;
    // Meanders, and swells and pinches along its length.
    float centre = snoise(vec3(s * 0.35, uSeed, 0.0)) * uMeander;
    float w = uWidth * (0.7 + 0.45 * snoise(vec3(s * 0.8, uSeed + 3.0, 1.0)));
    // A bulb at the running head.
    float head = exp(-pow((s - uFront + 0.25) / 0.45, 2.0));
    w *= 1.0 + head * 0.7;
    float lat = abs(vS.y - centre);
    float body = 1.0 - smoothstep(w * 0.75, w, lat + snoise(vec3(vWorldXZ * 3.0, uSeed)) * 0.06);
    float reached = 1.0 - smoothstep(uFront - 0.15, uFront + 0.05, s);
    // Feather into the caster's feet.
    float foot = smoothstep(0.0, 0.8, s);
    float mask = body * reached * foot;
    if (mask < 0.003) discard;

    float crust;
    float age = clamp((uFront - s) / 6.0, 0.0, 1.0);
    float dry = clamp(uDry + age * 0.25, 0.0, 1.0);
    vec3 col = bloodSurface(vWorldXZ, 1.0 - lat / max(w, 1e-3), uSeed, dry, uColorDeep, uColorFresh, uColorDried,
                            uLightDir, uEnvMap, uGloss, uSpec, uEnv, crust);

    float n = snoise(vec3(vWorldXZ * 1.9, uSeed * 2.0)) * 0.5 + 0.5;
    float thr = uErode * 1.25 - 0.1;
    float a = mask * smoothstep(thr, thr + 0.15, n) * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The blood running to the circle. */
export function createClotRivuletMaterial() {
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
      uEnvMap: frame.uEnvMap,
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uWidth: { value: 0.4 },
      uFront: { value: 0 },
      uMeander: { value: 0.3 },
      uSeed: { value: 0 },
      uDry: { value: 0 },
      uErode: { value: 0 },
      uGloss: { value: 80 },
      uSpec: { value: 1 },
      uEnv: { value: 0.5 },
      uOpacity: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorFresh: { value: new Color() },
      uColorDried: { value: new Color() }
    }),
    vertexShader: RIVULET_VERTEX,
    fragmentShader: RIVULET_FRAGMENT
  });

  /** @param {object} s { start, dir, side, length, front, seed, dry, erode } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(s.start);
    u.uDir.value.copy(s.dir);
    u.uSide.value.copy(s.side);
    u.uLength.value = s.length;
    u.uFront.value = s.front;
    u.uSeed.value = s.seed;
    u.uDry.value = s.dry;
    u.uErode.value = s.erode;
    u.uWidth.value = c.rivuletWidth;
    u.uMeander.value = c.rivuletMeander * g.noiseStrength * g.randomness;
    u.uGloss.value = c.poolGloss;
    u.uSpec.value = c.poolSpecular;
    u.uEnv.value = c.poolSheen * g.fresnel;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uColorDeep.value.copy(getColor(c.colorPoolDeep));
    u.uColorFresh.value.copy(getColor(c.colorPoolFresh));
    u.uColorDried.value.copy(getColor(c.colorPoolDried));
  };

  return material;
}

/* ==================================================================== */
/* The clank — a ring of bent air                                         */
/* ==================================================================== */

const WARP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uWidth;
  uniform float uStrength;
  uniform float uShaderIntensity;

  varying vec2 vUv;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float R = 0.2 + 0.8 * uProgress;
    float d = (r - R) / max(uWidth, 0.01);
    // The derivative of a bump: pushed out ahead of the ring, pulled in behind.
    float slope = -d * exp(-d * d);
    vec2 dir = vUv / max(r, 1e-4);
    float mask = exp(-d * d) * (1.0 - uProgress);
    float s = uStrength * uShaderIntensity * mask;
    if (s < 0.002) discard;
    gl_FragColor = vec4(dir * clamp(slope * 2.0, -1.0, 1.0) * 0.5 + 0.5, s, mask);
  }
`;

/** LAYER.DISTORTION — see `createAcidFumeMaterial`. */
export function createClotWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uProgress: { value: 0 },
      uWidth: { value: 0.12 },
      uStrength: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {number} progress 0..1 through the ring's life */
  material.userData.sync = (progress) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uProgress.value = progress;
    u.uWidth.value = c.warpWidth;
    u.uStrength.value = progress < 1 ? c.warpStrength * g.distortion : 0;
  };

  return material;
}
