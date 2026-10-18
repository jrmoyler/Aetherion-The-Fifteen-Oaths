import { Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Glacier Calving — the three bespoke shaders.
 *
 *  - **glacier ice** (`createGlacierIceMaterial`) — opaque, on
 *    `LAYER.WORLD`, used by the shelf, its stump and (a second instance,
 *    instanced) the broken chunks. What makes it read as a glacier face and
 *    not a blue box:
 *      1. **compressed strata** — horizontal bands in the *shelf's own*
 *         height (local Y × its metres), warped, alternating clear blue ice,
 *         white firn and thin dirty seams, so the layering tips over with the
 *         slab when it falls;
 *      2. **vertical crevasse grooves** — ridged noise across the face,
 *         dark blue in their depths;
 *      3. **a snow cap** wherever the surface faces up;
 *      4. **glacial blue light** — a subsurface term that glows deepest blue
 *         where the ice is thickest (face-on) and paler at grazing angles,
 *         plus a wet specular and sky sheen;
 *      5. **the calving fissure** — a crack net that climbs the face from the
 *         foot as the shelf loads up (`uCrack`), white-cyan hot, the line it
 *         will break on.
 *  - **the crevasse field** (`createCrevasseFloorMaterial`) — the circle's
 *    floor splitting into blue-lit crevasses before the shelf rises, a dark
 *    rift where it comes up, and after the fall a fan of powder snow thrown
 *    out across the circle; erodes away at the end.
 *  - **the slam** (`createSlamWarpMaterial`) — an expanding open cylinder on
 *    `LAYER.DISTORTION`: the pressure wave of the fall.
 *
 * Every material reads `settings.calving` in `userData.sync()`.
 */

const KEY = 'calving';

const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

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
/* Glacier ice                                                            */
/* ==================================================================== */

const ICE_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform vec3 uSize;         // metres of the unit frame (shelf), or 1 (chunks)
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vMetric;       // local position in metres
  varying float vSeed;

  void main() {
    vSeed = aSeed;
    vMetric = position * uSize;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ICE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D uEnvMap;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColorDeep;
  uniform vec3  uColorIce;
  uniform vec3  uColorFirn;
  uniform vec3  uColorSnow;
  uniform vec3  uColorDirt;
  uniform vec3  uColorCrack;

  uniform float uStrata;       // bands per metre
  uniform float uStrataWarp;
  uniform float uDirt;
  uniform float uGrooves;      // grooves per metre
  uniform float uGrooveDepth;
  uniform float uSnowCap;
  uniform float uSubsurface;
  uniform float uSpecular;
  uniform float uEnv;
  uniform float uAmbient;
  uniform float uCrack;        // metres the fissure has climbed
  uniform float uCrackGlow;
  uniform float uCrackScale;
  uniform float uWet;          // 0..1 freshly broken surfaces gleam

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vMetric;
  varying float vSeed;

  ${noiseGLSL}
  ${ENV_GLSL}
  ${EDGES_GLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 Nf = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(Nf, V) < 0.0) Nf = -Nf;
    vec3 Ns = normalize(vNormalW);
    if (dot(Ns, V) < 0.0) Ns = -Ns;
    // Mostly the smooth normal, a little of the facet so breaks read.
    vec3 N = normalize(mix(Ns, Nf, 0.45));
    vec3 m = vMetric + vSeed * 13.7;

    float grain = fbm3(m * 0.9);
    N = normalize(N + vec3(snoise(m * 2.1), snoise(m * 2.1 + 7.0), snoise(m * 2.1 + 13.0)) * 0.12 * uShaderIntensity);

    // 1 · strata in the shelf's own height.
    float warp = snoise(vec3(m.xz * 0.35, vSeed)) * uStrataWarp;
    float h = m.y * uStrata + warp + grain * 0.3;
    float band = fract(h);
    float firn = smoothstep(0.55, 0.7, band) * (1.0 - smoothstep(0.85, 0.95, band));
    float seam = (1.0 - smoothstep(0.0, 0.05, abs(band - 0.5))) * step(0.6, fract(floor(h) * 0.618 + vSeed));
    vec3 albedo = mix(uColorIce, uColorFirn, firn * 0.8);
    albedo = mix(albedo, uColorDirt, seam * uDirt);

    // 2 · crevasse grooves down the face.
    float groove = ridged(vec3(m.x * uGrooves, m.y * 0.25, m.z * uGrooves + vSeed), 3);
    float depthDark = smoothstep(0.55, 1.0, groove) * uGrooveDepth;
    albedo = mix(albedo, uColorDeep, depthDark);

    // 3 · snow cap where it faces up.
    float cap = smoothstep(0.45, 0.8, N.y + grain * 0.2) * uSnowCap;
    albedo = mix(albedo, uColorSnow, cap);

    // Lighting.
    vec3 L = normalize(uLightDir);
    float ndl = max(dot(N, L), 0.0);
    float hemi = 0.5 + 0.5 * N.y;
    vec3 col = albedo * (uAmbient * (0.55 + 0.45 * hemi) + 0.8 * ndl);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    col += texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uEnv * (F + uWet * 0.3);
    vec3 H = normalize(L + V);
    col += vec3(pow(max(dot(N, H), 0.0), 60.0) * uSpecular * (1.0 + uWet * 2.0));

    // 4 · glacial blue: deepest face-on, where the light goes furthest into it.
    float thick = ndv * (1.0 - cap) * (0.6 + 0.4 * (1.0 - firn));
    col += mix(uColorIce, uColorDeep, 0.35) * thick * uSubsurface * uGlobalGlow * (0.8 + 0.2 * grain);

    // 5 · the calving fissure climbing from the foot.
    if (uCrack > 0.0) {
      float e = cellEdges(vec2(m.x, m.y * 0.6) * uCrackScale + vec2(vSeed * 3.0, 0.0));
      float line = 1.0 - smoothstep(0.0, 0.06, e);
      float climb = 1.0 - smoothstep(uCrack - 0.4, uCrack, m.y + snoise(vec3(m.x * 1.3, 0.0, vSeed)) * 0.4);
      float crack = line * climb;
      col = mix(col, uColorDeep * 0.3, crack * 0.5);
      col += uColorCrack * crack * uCrackGlow * (0.75 + 0.25 * sin(uTime * 20.0 + m.x * 4.0)) * uGlobalGlow;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createGlacierIceMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uSize: { value: new Vector3(1, 1, 1) },
      uColorDeep: { value: new Color() },
      uColorIce: { value: new Color() },
      uColorFirn: { value: new Color() },
      uColorSnow: { value: new Color() },
      uColorDirt: { value: new Color() },
      uColorCrack: { value: new Color() },
      uStrata: { value: 1.5 },
      uStrataWarp: { value: 0.5 },
      uDirt: { value: 0.6 },
      uGrooves: { value: 1 },
      uGrooveDepth: { value: 0.5 },
      uSnowCap: { value: 1 },
      uSubsurface: { value: 0.6 },
      uSpecular: { value: 0.6 },
      uEnv: { value: 0.4 },
      uAmbient: { value: 0.5 },
      uCrack: { value: 0 },
      uCrackGlow: { value: 4 },
      uCrackScale: { value: 1 },
      uWet: { value: 0 }
    }),
    vertexShader: ICE_VERTEX,
    fragmentShader: ICE_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {object} s { size: Vector3, crack, wet } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value.copy(s.size);
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorIce.value.copy(getColor(c.colorIce));
    u.uColorFirn.value.copy(getColor(c.colorFirn));
    u.uColorSnow.value.copy(getColor(c.colorSnow));
    u.uColorDirt.value.copy(getColor(c.colorDirt));
    u.uColorCrack.value.copy(getColor(c.colorCrack));
    u.uStrata.value = c.strataScale;
    u.uStrataWarp.value = c.strataWarp * g.noiseStrength;
    u.uDirt.value = c.strataDirt;
    u.uGrooves.value = c.grooveScale * g.noiseFrequency;
    u.uGrooveDepth.value = c.grooveDepth;
    u.uSnowCap.value = c.snowCap;
    u.uSubsurface.value = c.subsurface * g.glow;
    u.uSpecular.value = c.iceSpecular;
    u.uEnv.value = c.iceEnv * g.fresnel;
    u.uAmbient.value = c.iceAmbient;
    u.uCrack.value = s.crack;
    u.uCrackGlow.value = c.crackGlow * g.glow;
    u.uCrackScale.value = c.crackScale;
    u.uWet.value = s.wet;
  };

  return material;
}

/* ==================================================================== */
/* The crevasse field                                                     */
/* ==================================================================== */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  varying vec2 vP;

  void main() {
    vec2 p = position.xy * uExtent;
    vP = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + p.x, 0.013, uCentre.z + p.y, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uRadius;
  uniform vec2  uFace;        // unit, toward the caster (the way it falls)
  uniform vec2  uPivot;       // the shelf's foot, relative to the centre
  uniform float uHalfWidth;
  uniform float uDepth;
  uniform float uOpen;        // 0..1 the crevasses opening
  uniform float uRift;        // 0..1 the slot the shelf comes up through
  uniform float uPowder;      // metres the powder fan has run out
  uniform float uScale;
  uniform float uGlow;
  uniform float uErode;
  uniform float uSeed;
  uniform float uOpacity;

  uniform vec3 uColorDeep;
  uniform vec3 uColorCrack;
  uniform vec3 uColorSnow;
  uniform vec3 uColorShade;

  varying vec2 vP;

  ${noiseGLSL}
  ${EDGES_GLSL}

  void main() {
    vec2 p = vP;
    float r = length(p);
    vec2 side = vec2(-uFace.y, uFace.x);
    // Shelf frame: along = toward the caster from the foot, across the face.
    vec2 q = p - uPivot;
    float along = dot(q, uFace);
    float across = dot(q, side);

    float rag = snoise(vec3(p * 0.8, uSeed)) * 0.5;
    float inside = 1.0 - smoothstep(uRadius - 0.4, uRadius + 0.3, r + rag);

    // Crevasses: cell edges, opening out from the shelf's foot.
    float e = cellEdges(p * uScale + uSeed);
    float reach = uOpen * (uRadius * 2.2);
    float fromFoot = length(vec2(max(abs(across) - uHalfWidth, 0.0), along));
    float open = (1.0 - smoothstep(reach - 1.0, reach, fromFoot + rag)) * inside;
    float w = 0.03 + 0.07 * uOpen;
    float crev = (1.0 - smoothstep(w * 0.4, w, e)) * open;
    float bloom = exp(-e / 0.08) * open;

    // The rift: a dark slot behind the foot where the shelf rises.
    float slot = step(abs(across), uHalfWidth + 0.15) * step(-uDepth - 0.25, along) * step(along, 0.15) * uRift;

    // Powder fanned out toward the caster after the fall.
    float fan = step(-0.3, along) * (1.0 - smoothstep(uPowder - 1.5, uPowder, along + rag * 2.0)) * (1.0 - smoothstep(uHalfWidth + 0.5, uHalfWidth + 2.5, abs(across) - along * 0.25));
    float drift = fbm3(vec3(p * 0.9, uSeed + 3.0)) * 0.5 + 0.5;

    vec3 col = uColorShade;
    col = mix(col, uColorDeep * 0.4, slot);
    col = mix(col, uColorSnow * (0.75 + 0.35 * drift), fan * 0.9);
    vec3 glow = uColorCrack * (crev * 1.2 + bloom * 0.35) * uGlow * (1.0 - fan * 0.8);
    col = mix(col, uColorDeep, crev * 0.7);
    col += glow * uGlobalGlow * uShaderIntensity;

    float a = max(max(crev, bloom * 0.6) * (1.0 - fan * 0.6), max(slot * 0.9, fan * (0.6 + 0.4 * drift)));
    a = max(a, open * 0.25);
    float n = snoise(vec3(p * 1.3, uSeed * 2.0)) * 0.5 + 0.5;
    float thr = uErode * 1.25 - 0.15;
    a *= smoothstep(thr, thr + 0.12, n);
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

export function createCrevasseFloorMaterial() {
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
      uExtent: { value: 8 },
      uRadius: { value: 5 },
      uFace: { value: new Vector2(0, 1) },
      uPivot: { value: new Vector2() },
      uHalfWidth: { value: 3 },
      uDepth: { value: 2 },
      uOpen: { value: 0 },
      uRift: { value: 0 },
      uPowder: { value: 0 },
      uScale: { value: 0.8 },
      uGlow: { value: 3 },
      uErode: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorCrack: { value: new Color() },
      uColorSnow: { value: new Color() },
      uColorShade: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} s { centre, radius, faceX, faceZ, pivotX, pivotZ, halfWidth, depth, open, rift, powder, erode, seed } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uExtent.value = s.radius + s.halfWidth + 4;
    u.uRadius.value = s.radius;
    u.uFace.value.x = s.faceX;
    u.uFace.value.y = s.faceZ;
    u.uPivot.value.x = s.pivotX;
    u.uPivot.value.y = s.pivotZ;
    u.uHalfWidth.value = s.halfWidth;
    u.uDepth.value = s.depth;
    u.uOpen.value = s.open;
    u.uRift.value = s.rift;
    u.uPowder.value = s.powder;
    u.uScale.value = c.crevasseScale * g.noiseFrequency;
    u.uGlow.value = c.crevasseGlow * g.glow;
    u.uErode.value = s.erode;
    u.uSeed.value = s.seed;
    u.uOpacity.value = g.opacity;
    u.uColorDeep.value.copy(getColor(c.colorDeep));
    u.uColorCrack.value.copy(getColor(c.colorCrack));
    u.uColorSnow.value.copy(getColor(c.colorSnow));
    u.uColorShade.value.copy(getColor(c.colorFloorShade));
  };

  return material;
}

/* ==================================================================== */
/* The slam                                                               */
/* ==================================================================== */

const WARP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float ang = vUv.x * 6.2831853;
    vec2 dir = vec2(cos(ang), sin(ang));
    float n = snoise(vec3(ang * 5.0, vUv.y * 3.0, uTime * 2.0));
    float mask = (1.0 - smoothstep(0.3, 1.0, vUv.y)) * smoothstep(0.0, 0.05, vUv.y);
    float s = uStrength * uShaderIntensity * mask * (0.7 + 0.3 * n);
    if (s < 0.002) discard;
    gl_FragColor = vec4(normalize(dir + n * 0.3) * 0.5 + 0.5, s, mask);
  }
`;

export function createSlamWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({ uStrength: { value: 0 } }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { strength } */
  material.userData.sync = (s) => {
    const c = settings[KEY];
    material.uniforms.uStrength.value = s.strength * c.slamWarp * settings.global.distortion;
  };

  return material;
}
