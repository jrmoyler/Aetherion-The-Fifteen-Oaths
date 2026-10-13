import { Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Basalt Columns — the three bespoke shaders.
 *
 *  - **basalt** (`createBasaltRockMaterial`) — opaque, instanced, on
 *    `LAYER.WORLD` so the columns write the depth prepass and cast shadows.
 *    What makes it read as columnar basalt rather than grey hexagons:
 *      1. a **true facet normal** rebuilt per pixel from screen-space
 *         derivatives, so the six faces stay razor flat at any instance scale;
 *      2. **layered strata** — horizontal banding measured in metres *below
 *         the column's own top* (`aState.z`), warped by noise, with a dark
 *         groove between beds. Because the bands are column-relative they
 *         ride up with the rock as it rises instead of sliding over it;
 *      3. **wear** on the six vertical arrises and the chamfer — a paler,
 *         chipped edge that draws the hexagon at distance;
 *      4. **cap fractures** — F2−F1 cell edges on the top face;
 *      5. **a hot underside** — every column is freshly extruded: the rock
 *         nearest the floor glows white-orange → red with `aState.y` (heat),
 *         plus hot pinholes from ridged noise that thin out with height. It
 *         cools from orange to black as the cast winds down.
 *    Per-instance `vec4 aState`: seed, heat (0..1), top height (m), punch
 *    (a decaying 0..1 flash the frame it breaks the surface).
 *  - **the honeycomb** (`createBasaltGroundMaterial`) — a floor disc that
 *    cracks into the exact hex grid the columns stand on: a ragged crack
 *    front races out from the centre, the cells it passes darken into plates
 *    and their seams open on magma — a hot core line, a wide soft bloom,
 *    fine secondary fractures inside each plate. Seams cool from yellow to
 *    orange to black (`heat`), and the whole thing erodes away at the end.
 *  - **heat shimmer** (`createBasaltShimmerMaterial`) — an open cylinder over
 *    the circle on `LAYER.DISTORTION`, writing noise offsets that rise and
 *    thin with height. It is what makes the air over open magma *wobble*.
 *
 * Every material reads `settings.basalt` in `userData.sync()`.
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

/**
 * Flat-top hex grid (corner on +X). Mirrors `hexCellCentre` on the CPU, which
 * is the only reason the floor's seams and the columns line up.
 */
const HEX_GLSL = /* glsl */ `
  vec2 hexCentre(vec2 p, float s) {
    float q = (0.6666667 * p.x) / s;
    float r = (-0.3333333 * p.x + 0.5773503 * p.y) / s;
    vec3 c = vec3(q, -q - r, r);
    vec3 rc = floor(c + 0.5);
    vec3 d = abs(rc - c);
    if (d.x > d.y && d.x > d.z) rc.x = -rc.y - rc.z;
    else if (d.y > d.z) rc.y = -rc.x - rc.z;
    else rc.z = -rc.x - rc.y;
    return vec2(s * 1.5 * rc.x, s * 1.7320508 * (rc.z + rc.x * 0.5));
  }
  /** Hex "radius": equals the apothem (0.866 s) on the cell border. */
  float hexDist(vec2 q) {
    q = abs(q);
    return max(q.y, dot(q, vec2(0.8660254, 0.5)));
  }
`;

/** Shared heat ramp: 0 cold black → deep red → orange → white-yellow. */
const HEAT_GLSL = /* glsl */ `
  vec3 heatRamp(float t, vec3 cold, vec3 deep, vec3 mid, vec3 hot) {
    t = clamp(t, 0.0, 1.4);
    vec3 c = mix(cold, deep, smoothstep(0.0, 0.3, t));
    c = mix(c, mid, smoothstep(0.25, 0.7, t));
    return mix(c, hot, smoothstep(0.7, 1.3, t));
  }
`;

/* ==================================================================== */
/* Basalt                                                                 */
/* ==================================================================== */

const ROCK_VERTEX = /* glsl */ `
  attribute vec4  aState;
  attribute float aPart;

  varying vec3  vWorld;
  varying vec3  vLocal;
  varying vec4  vState;
  varying float vPart;

  void main() {
    vLocal = position;
    vState = aState;
    vPart = aPart;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ROCK_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColorRock;
  uniform vec3  uColorRockLight;
  uniform vec3  uColorStrata;
  uniform vec3  uColorCold;
  uniform vec3  uColorHotA;
  uniform vec3  uColorHotB;
  uniform vec3  uColorHotC;

  uniform float uStrataScale;   // beds per metre
  uniform float uStrataWarp;
  uniform float uStrataContrast;
  uniform float uNoiseScale;
  uniform float uBump;
  uniform float uSpecular;
  uniform float uGloss;
  uniform float uEnv;
  uniform float uDiffuse;
  uniform float uAmbient;
  uniform float uEdgeWear;
  uniform float uCapCracks;
  uniform float uCapCrackScale;
  uniform float uUnderGlow;
  uniform float uUnderHeight;   // metres of glow above the floor
  uniform float uPulse;
  uniform float uSpeckle;
  uniform float uPunchGlow;

  varying vec3  vWorld;
  varying vec3  vLocal;
  varying vec4  vState;
  varying float vPart;

  ${noiseGLSL}
  ${ENV_GLSL}
  ${EDGES_GLSL}
  ${HEAT_GLSL}

  void main() {
    float seed  = vState.x;
    float heat  = vState.y;
    float top   = vState.z;
    float punch = vState.w;

    vec3 V = normalize(cameraPosition - vWorld);
    // 1 · a flat facet normal, whatever the instance scale did.
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(N, V) < 0.0) N = -N;

    // Column-relative coordinates: depth below this column's top, so every
    // pattern below rides up with the rock rather than sliding over it.
    float depth = max(top - vWorld.y, 0.0);
    vec3 rp = vec3(vWorld.x, -depth, vWorld.z) * uNoiseScale + seed * 7.31;
    float grain = fbm3(rp);

    vec3 bump = vec3(snoise(rp * 2.3), snoise(rp * 2.3 + 11.0), snoise(rp * 2.3 + 23.0));
    N = normalize(N + bump * uBump * 0.3 * uShaderIntensity);

    float isShaft = 1.0 - step(0.5, vPart);
    float isBevel = step(0.5, vPart) * (1.0 - step(1.5, vPart));
    float isCap   = step(1.5, vPart);

    // 2 · strata — beds in metres below the top, warped, with a dark groove.
    float warp = snoise(vec3(vWorld.xz * 0.9, seed * 5.0)) * uStrataWarp;
    float beds = depth * uStrataScale + warp + seed * 3.0;
    float layer = fract(beds);
    float band = smoothstep(0.0, 0.1, layer) * (1.0 - smoothstep(0.5, 0.62, layer));
    float groove = 1.0 - smoothstep(0.0, 0.06, abs(layer - 0.78));
    vec3 albedo = mix(uColorRock, uColorStrata, band * uStrataContrast * isShaft);
    albedo = mix(albedo, uColorRockLight, clamp(grain * 0.6 + 0.3, 0.0, 1.0) * 0.45);
    albedo *= 1.0 - groove * 0.5 * uStrataContrast * isShaft;

    // 3 · wear on the six arrises and on the chamfer.
    float ang = atan(vLocal.z, vLocal.x) / 1.0471976;
    float toCorner = abs(fract(ang + 0.5) - 0.5) * 2.0; // 0 on a corner
    float chipped = smoothstep(0.55, 0.85, snoise(rp * 3.1) * 0.5 + 0.5);
    float wear = (1.0 - smoothstep(0.0, 0.12, toCorner)) * isShaft + isBevel * (0.5 + 0.5 * chipped);
    albedo = mix(albedo, uColorRockLight * 1.5, clamp(wear * uEdgeWear, 0.0, 1.0));

    // 4 · fractures across the cap.
    float capEdge = cellEdges(vLocal.xz * uCapCrackScale + seed * 9.0);
    float capCrack = (1.0 - smoothstep(0.0, 0.07, capEdge)) * isCap * uCapCracks;
    albedo *= 1.0 - capCrack * 0.6;

    // Lighting: wrapped sun, a sky term, a grazing sheen off the env map.
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndl = max(dot(N, L), 0.0);
    float hemi = 0.5 + 0.5 * N.y;
    vec3 color = albedo * (uAmbient * (0.55 + 0.45 * hemi) + uDiffuse * ndl);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    color += texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uEnv * F;
    color += vec3(pow(max(dot(N, H), 0.0), uGloss) * uSpecular * (0.4 + 0.6 * (grain * 0.5 + 0.5)));

    // 5 · the hot underside, and hot pinholes thinning with height.
    float y = max(vWorld.y, 0.0);
    float under = exp(-y / max(uUnderHeight, 0.02));
    float throb = 1.0 + uPulse * sin(uTime * 5.0 + seed * 20.0 + vWorld.y * 3.0);
    float hot = heat * throb;
    float pin = smoothstep(0.80, 0.95, ridged(rp * 1.7, 4)) * uSpeckle * (0.2 + under) * isShaft;
    float glowT = under * hot;
    vec3 glowCol = heatRamp(glowT * 1.2, uColorCold, uColorHotC, uColorHotB, uColorHotA);
    float glow = glowT * uUnderGlow + pin * hot * 1.5 + capCrack * hot * punch * 3.0;
    glow += punch * uPunchGlow * under;
    // The hottest rock is also the least rock-coloured: blend out the albedo.
    color = mix(color, color * 0.4, clamp(glowT, 0.0, 1.0));
    color += glowCol * glow * uGlobalGlow;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Columnar basalt, opaque and instanced. Lives on LAYER.WORLD. */
export function createBasaltRockMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uColorRock: { value: new Color() },
      uColorRockLight: { value: new Color() },
      uColorStrata: { value: new Color() },
      uColorCold: { value: new Color() },
      uColorHotA: { value: new Color() },
      uColorHotB: { value: new Color() },
      uColorHotC: { value: new Color() },
      uStrataScale: { value: 3 },
      uStrataWarp: { value: 0.3 },
      uStrataContrast: { value: 0.5 },
      uNoiseScale: { value: 2 },
      uBump: { value: 0.6 },
      uSpecular: { value: 0.3 },
      uGloss: { value: 24 },
      uEnv: { value: 0.3 },
      uDiffuse: { value: 0.85 },
      uAmbient: { value: 0.2 },
      uEdgeWear: { value: 0.4 },
      uCapCracks: { value: 0.6 },
      uCapCrackScale: { value: 2.5 },
      uUnderGlow: { value: 4 },
      uUnderHeight: { value: 0.6 },
      uPulse: { value: 0.25 },
      uSpeckle: { value: 0.6 },
      uPunchGlow: { value: 2 }
    }),
    vertexShader: ROCK_VERTEX,
    fragmentShader: ROCK_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings.basalt;
    const g = settings.global;
    const u = material.uniforms;
    u.uColorRock.value.copy(getColor(c.colorRock));
    u.uColorRockLight.value.copy(getColor(c.colorRockLight));
    u.uColorStrata.value.copy(getColor(c.colorStrata));
    u.uColorCold.value.copy(getColor(c.colorCold));
    u.uColorHotA.value.copy(getColor(c.colorHotA));
    u.uColorHotB.value.copy(getColor(c.colorHotB));
    u.uColorHotC.value.copy(getColor(c.colorHotC));
    u.uStrataScale.value = c.strataScale;
    u.uStrataWarp.value = c.strataWarp * g.noiseStrength;
    u.uStrataContrast.value = c.strataContrast;
    u.uNoiseScale.value = c.rockNoise * g.noiseFrequency;
    u.uBump.value = c.rockBump * g.noiseStrength;
    u.uSpecular.value = c.rockSpecular;
    u.uGloss.value = c.rockGloss;
    u.uEnv.value = c.rockEnv * g.fresnel;
    u.uDiffuse.value = c.rockDiffuse;
    u.uAmbient.value = c.rockAmbient;
    u.uEdgeWear.value = c.edgeWear;
    u.uCapCracks.value = c.capCracks;
    u.uCapCrackScale.value = c.capCrackScale;
    u.uUnderGlow.value = c.undersideGlow * g.glow;
    u.uUnderHeight.value = c.undersideHeight;
    u.uPulse.value = c.glowPulse;
    u.uSpeckle.value = c.emberSpeckle;
    u.uPunchGlow.value = c.punchGlow * g.glow;
  };

  return material;
}

/* ==================================================================== */
/* The honeycomb                                                          */
/* ==================================================================== */

const GROUND_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;

  varying vec2 vP;   // metres from the centre, on the floor

  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    vec3 world = vec3(uCentre.x + p.x, 0.012, uCentre.z + p.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uRadius;
  uniform float uCell;
  uniform float uSeed;
  uniform float uFront;        // metres the crack has reached
  uniform float uFrontSoft;
  uniform float uFrontNoise;
  uniform float uSeamWidth;    // metres, the hot core line
  uniform float uSeamSoft;     // metres, the bloom either side
  uniform float uSeamGlow;
  uniform float uOpen;         // 0..1, how far the seams have opened
  uniform float uHeat;         // 0..1, seams cooling to black
  uniform float uFine;
  uniform float uFineScale;
  uniform float uDark;
  uniform float uRimRagged;
  uniform float uRimSoft;
  uniform float uScorch;       // metres of darkened margin past the rim
  uniform float uFlicker;
  uniform float uErode;        // 0..1, the end of the cast
  uniform float uOpacity;

  uniform vec3  uColorPlate;
  uniform vec3  uColorCold;
  uniform vec3  uColorHotA;
  uniform vec3  uColorHotB;
  uniform vec3  uColorHotC;

  varying vec2 vP;

  ${noiseGLSL}
  ${EDGES_GLSL}
  ${HEX_GLSL}
  ${HEAT_GLSL}

  void main() {
    vec2 p = vP;
    float r = length(p);

    // The circle's edge, ragged so it never reads as a stencil.
    float rag = snoise(vec3(p * 0.7, uSeed)) * uRimRagged;
    float inside = 1.0 - smoothstep(uRadius - uRimSoft, uRadius + uRimSoft * 0.25, r + rag);
    float margin = 1.0 - smoothstep(uRadius, uRadius + uScorch, r + rag);

    // The crack front, racing outward, ragged in angle.
    float front = uFront + snoise(vec3(normalize(p + 1e-4) * 1.6, uSeed + 3.0)) * uFrontNoise;
    float reached = 1.0 - smoothstep(front - uFrontSoft, front, r);
    float atFront = (1.0 - smoothstep(0.0, uFrontSoft, abs(r - front))) * step(r, uRadius + 0.3);

    // The honeycomb itself — the same grid the columns stand on.
    vec2 cell = hexCentre(p, uCell);
    vec2 q = p - cell;
    float edge = 0.8660254 * uCell - hexDist(q);      // metres to the border
    float along = snoise(vec3(p * 2.2, uSeed * 1.7));
    float w = uSeamWidth * (0.55 + 0.9 * uOpen) * (0.75 + 0.5 * along);
    float seam = 1.0 - smoothstep(w * 0.45, w, edge);
    float bloom = exp(-max(edge, 0.0) / max(uSeamSoft * (0.6 + 0.8 * uOpen), 1e-3));

    // Fine secondary fractures inside each plate.
    float fe = cellEdges(p * uFineScale + uSeed * 11.0);
    float fine = (1.0 - smoothstep(0.0, 0.05, fe)) * uFine * smoothstep(0.08, 0.25, edge);

    float lit = reached * inside;
    float flick = 1.0 - uFlicker + uFlicker * (0.6 + 0.4 * snoise(vec3(p * 1.4, uTime * 2.2)));
    float h = uHeat * flick;

    // Plates: dark, scorched, faintly mottled. Seams: magma on the heat ramp.
    float mottle = fbm3(vec3(p * 1.3, uSeed));
    vec3 plate = uColorPlate * (0.75 + 0.5 * mottle);
    float hotLine = max(seam, fine * 0.6);
    vec3 magma = heatRamp(h * (0.7 + 0.6 * hotLine), uColorCold, uColorHotC, uColorHotB, uColorHotA);
    float glow = (hotLine * 1.2 + bloom * 0.45) * h * uSeamGlow + atFront * h * uSeamGlow * 0.8;

    vec3 col = mix(plate, magma * 0.35 + uColorCold, hotLine);
    col += magma * glow * uGlobalGlow * uShaderIntensity;

    float a = max(lit * uDark, max(seam, fine) * lit);
    a = max(a, margin * uDark * 0.35 * reached);
    a = max(a, min(glow, 1.0) * lit);

    // Erodes raggedly at the end — plates first, the cracks last.
    float n = snoise(vec3(p * 1.8, uSeed * 4.0)) * 0.5 + 0.5;
    float thr = uErode * 1.3 - 0.15;
    a *= smoothstep(thr, thr + 0.15, mix(n, n * 0.5 + hotLine * 0.5, 0.5));
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The cracked honeycomb floor. Normal blending — it has to be able to darken. */
export function createBasaltGroundMaterial() {
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
      uExtent: { value: 5 },
      uRadius: { value: 4 },
      uCell: { value: 0.55 },
      uSeed: { value: 0 },
      uFront: { value: 0 },
      uFrontSoft: { value: 0.5 },
      uFrontNoise: { value: 0.4 },
      uSeamWidth: { value: 0.05 },
      uSeamSoft: { value: 0.08 },
      uSeamGlow: { value: 4 },
      uOpen: { value: 0 },
      uHeat: { value: 1 },
      uFine: { value: 0.5 },
      uFineScale: { value: 2.4 },
      uDark: { value: 0.8 },
      uRimRagged: { value: 0.4 },
      uRimSoft: { value: 0.5 },
      uScorch: { value: 0.8 },
      uFlicker: { value: 0.3 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uColorPlate: { value: new Color() },
      uColorCold: { value: new Color() },
      uColorHotA: { value: new Color() },
      uColorHotB: { value: new Color() },
      uColorHotC: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT
  });

  /** @param {object} s { centre, radius, cell, seed, front, open, heat, erode } */
  material.userData.sync = (s) => {
    const c = settings.basalt;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = s.radius;
    u.uExtent.value = s.radius + c.scorchMargin + 0.6;
    u.uCell.value = s.cell;
    u.uSeed.value = s.seed;
    u.uFront.value = s.front;
    u.uFrontSoft.value = c.frontSoftness;
    u.uFrontNoise.value = c.frontNoise * g.noiseStrength * g.randomness;
    u.uSeamWidth.value = c.seamWidth;
    u.uSeamSoft.value = c.seamSoftness;
    u.uSeamGlow.value = c.seamGlow * g.glow;
    u.uOpen.value = s.open;
    u.uHeat.value = s.heat;
    u.uFine.value = c.fineCracks;
    u.uFineScale.value = c.fineCrackScale * g.noiseFrequency;
    u.uDark.value = c.groundDark;
    u.uRimRagged.value = c.rimRagged * g.noiseStrength;
    u.uRimSoft.value = c.rimSoftness;
    u.uScorch.value = c.scorchMargin;
    u.uFlicker.value = c.seamFlicker;
    u.uErode.value = s.erode;
    u.uOpacity.value = g.opacity;
    u.uColorPlate.value.copy(getColor(c.colorPlate));
    u.uColorCold.value.copy(getColor(c.colorCold));
    u.uColorHotA.value.copy(getColor(c.colorHotA));
    u.uColorHotB.value.copy(getColor(c.colorHotB));
    u.uColorHotC.value.copy(getColor(c.colorHotC));
  };

  return material;
}

/* ==================================================================== */
/* Heat shimmer                                                           */
/* ==================================================================== */

const SHIMMER_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHIMMER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSeed;

  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    // Welded to the world and rising, so the wobble climbs off the magma.
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.6 - uTime * uSpeed + uSeed);
    float nx = snoise(np);
    float ny = snoise(np + vec3(19.3, 7.7, 31.1));
    // Strongest just off the floor, thinning with height, feathered at the foot.
    float mask = (1.0 - smoothstep(0.0, 1.0, vUv.y)) * smoothstep(0.0, 0.05, vUv.y);
    float s = uStrength * uShaderIntensity * mask;
    if (s < 0.002) discard;
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, s, mask);
  }
`;

/** The air over open magma. LAYER.DISTORTION — see `createAcidFumeMaterial`. */
export function createBasaltShimmerMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStrength: { value: 0 },
      uScale: { value: 1.6 },
      uSpeed: { value: 1.4 },
      uSeed: { value: 0 }
    }),
    vertexShader: SHIMMER_VERTEX,
    fragmentShader: SHIMMER_FRAGMENT
  });

  /** @param {object} s { strength, seed } */
  material.userData.sync = (s) => {
    const c = settings.basalt;
    const g = settings.global;
    const u = material.uniforms;
    u.uStrength.value = s.strength * c.heatShimmer * g.distortion;
    u.uScale.value = c.shimmerScale * g.noiseFrequency;
    u.uSpeed.value = c.shimmerSpeed * g.noiseSpeed;
    u.uSeed.value = s.seed;
  };

  return material;
}
