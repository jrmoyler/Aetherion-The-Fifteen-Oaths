import { Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Brine Geyser — the bespoke shaders.
 *
 *  - **the column** (`createColumnMaterial(0)`) — an open cylinder grid raised
 *    in the vertex stage into a geyser: a flared foot, a trunk swelling with
 *    surges that race upward (integrated phase), a slight twist, and at its
 *    top a crown that bursts out and droops like an umbrella of spray. The
 *    fragment is brine, not sea: green-teal water with fresnel and the stage
 *    sky, white salt-foam bands racing up the trunk, foam where the crown
 *    tears and at the foot, a churning core seen through the middle.
 *  - **the lens** (`createColumnMaterial(1)`) — the column on
 *    `LAYER.DISTORTION`, bending the world round it.
 *  - **the salt pan** (`createCrustMaterial`) — a floor disc that cracks into
 *    the polygons of a salt flat (F2−F1 cells): before the punch the seams
 *    seep glowing brine and the plates are wet and dark; as the brine rains
 *    back down the plates whiten into crust with raised, lit ridges. It
 *    spreads from the vent outward and erodes away at the end.
 *  - **the crystals** (`createCrystalMaterial`) — opaque, instanced, on
 *    `LAYER.WORLD` so they write the prepass and cast shadows: flat-faceted
 *    salt (normal rebuilt from derivatives), milky white with a teal heart,
 *    glittering. Per instance `aCrystal` (seed, growth).
 *
 * Every material reads `settings.brine` in `userData.sync()`.
 */

const ID = 'brine';

const ENV_GLSL = /* glsl */ `
  uniform sampler2D uEnvMap;
  uniform float uHasEnv;
  vec3 skyAt(vec3 dir) {
    vec2 uv = vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    return uHasEnv > 0.5 ? texture2D(uEnvMap, uv).rgb : mix(vec3(0.08, 0.12, 0.18), vec3(0.55, 0.7, 0.85), dir.y * 0.5 + 0.5);
  }
`;

/* ==================================================================== */
/* The column                                                             */
/* ==================================================================== */

/** The geyser's surface. Twin of `BrineGeyserAbility#_columnPoint`. */
const COLUMN_GLSL = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uBaseR;
  uniform float uTopR;
  uniform float uHeight;      // metres the trunk stands this frame
  uniform float uCrownR;
  uniform float uCrownLift;
  uniform float uCrownDrop;
  uniform float uOpen;        // 0..1 how far the crown has burst open
  uniform float uSurge;       // integrated phase of the surges racing up
  uniform float uSurgeAmp;
  uniform float uSurgeFreq;
  uniform float uTwist;
  uniform float uChurn;
  uniform float uSeed;

  const float TRUNK = 0.8;

  vec3 columnPoint(float a, float v, out float crownW) {
    float ang = a * 6.2831853;
    crownW = 0.0;
    float r;
    float y;
    if (v <= TRUNK) {
      float t = v / TRUNK;
      r = mix(uBaseR, uTopR, t);
      r *= 1.0 + 0.6 * pow(1.0 - t, 4.0);                       // the flared foot
      r *= 1.0 + uSurgeAmp * sin(6.2831853 * (t * uSurgeFreq - uSurge));
      y = t * uHeight;
    } else {
      // The crown: out and up, then drooping like an umbrella of spray.
      float w = (v - TRUNK) / (1.0 - TRUNK);
      crownW = w;
      float open = uOpen;
      r = uTopR + uCrownR * w * open;
      y = uHeight + (uCrownLift * sin(3.14159265 * w) - uCrownDrop * w * w) * open;
    }
    float churn = snoise(vec3(cos(ang) * 1.3, sin(ang) * 1.3, y * 0.6 - uSurge * 0.8 + uSeed)) * uChurn;
    r *= 1.0 + churn;
    ang += uTwist * y;
    return uCenter + vec3(cos(ang) * r, y, sin(ang) * r);
  }
`;

const COLUMN_VERTEX = /* glsl */ `
  varying float vA;
  varying float vV;
  varying float vY;
  varying float vCrown;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${COLUMN_GLSL}

  void main() {
    float a = position.x;
    float v = position.y;
    float cw;
    float cw2;
    vec3 p = columnPoint(a, v, cw);
    vec3 da = columnPoint(a + 0.01, v, cw2) - columnPoint(a - 0.01, v, cw2);
    vec3 dv = columnPoint(a, min(v + 0.01, 1.0), cw2) - columnPoint(a, max(v - 0.01, 0.0), cw2);
    vec3 N = cross(dv, da);
    vec3 radial = vec3(p.x - uCenter.x, 0.0, p.z - uCenter.z);
    N = length(N) > 1e-6 ? normalize(N) : normalize(radial + vec3(1e-4, 0.0, 0.0));
    if (dot(N, radial) < 0.0 && v <= TRUNK) N = -N;

    vA = a;
    vV = v;
    vY = p.y;
    vCrown = cw;
    vNormalW = N;
    vWorld = p;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const COLUMN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uHeight;
  uniform float uSurge;
  uniform float uSeed;
  uniform float uOpacity;
  uniform float uFresnelPow;
  uniform float uGlow;
  uniform float uCoreGlow;
  uniform float uFoam;
  uniform float uFoamScale;
  uniform float uEnvAmt;
  uniform float uFade;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBrine;
  uniform vec3  uColorFoam;
  uniform vec3  uLightDir;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying float vA;
  varying float vV;
  varying float vY;
  varying float vCrown;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    float facing = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - facing, max(uFresnelPow, 0.2));

    float ang = vA * 6.2831853;
    // Streaks and salt-foam bands racing up the trunk.
    vec3 sp = vec3(cos(ang) * 2.0, sin(ang) * 2.0, vY * 0.45 * uFoamScale - uSurge * 1.6 + uSeed);
    float streak = snoise(vec3(cos(ang) * 6.0, sin(ang) * 6.0, vY * 0.12 - uSurge * 0.5));
    streak = smoothstep(0.3, 0.9, streak);
    float bands = fbm3(sp);
    float foam = smoothstep(0.05, 0.45, bands) * uFoam;
    foam += (1.0 - smoothstep(0.0, 0.9, vY)) * 0.8;                   // the churn at the foot
    foam += smoothstep(0.35, 1.0, vCrown) * 0.9;                      // the crown breaking up

    // The crown tears into ragged tongues of spray at its edge.
    float tear = snoise(vec3(ang * 3.0, vCrown * 4.0, uSeed + 3.0)) * 0.5 + 0.5;
    if (vCrown > 0.0 && tear < smoothstep(0.4, 1.0, vCrown) * 0.85) discard;

    vec3 sky = skyAt(reflect(-V, N)) * uEnvAmt;
    float diff = clamp(dot(N, uLightDir) * 0.5 + 0.5, 0.0, 1.0);
    vec3 body = mix(uColorDeep, uColorBrine, diff * 0.7 + streak * 0.3) * uGlow;
    vec3 core = uColorBrine * pow(facing, 3.0) * uCoreGlow * uShaderIntensity * (0.6 + 0.4 * streak);
    vec3 col = body + core + sky * (0.2 + fres) + uColorFoam * clamp(foam, 0.0, 1.2) * 1.2;

    float a = (uOpacity * (0.5 + 0.5 * fres) + foam * 0.6 + streak * 0.15) * uFade;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.3);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uFade;
  uniform float uSurge;
  uniform float uShaderIntensity;

  varying float vA;
  varying float vV;
  varying float vY;
  varying float vCrown;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    vec3 nv = (viewMatrix * vec4(normalize(vNormalW), 0.0)).xyz;
    vec2 dir = nv.xy + vec2(0.0, 0.35) * snoise(vec3(vA * 8.0, vY * 0.5 - uSurge, 1.0));
    float len = length(dir);
    if (len > 1.0) dir /= len;
    float mask = uFade * (1.0 - vCrown);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

/** @param {0|1} mode 0 the brine, 1 its refraction on LAYER.DISTORTION */
export function createColumnMaterial(mode = 0) {
  const lens = mode === 1;
  const shape = {
    uCenter: { value: new Vector3() },
    uBaseR: { value: 1 },
    uTopR: { value: 0.8 },
    uHeight: { value: 0 },
    uCrownR: { value: 1.8 },
    uCrownLift: { value: 0.8 },
    uCrownDrop: { value: 1.6 },
    uOpen: { value: 0 },
    uSurge: { value: 0 },
    uSurgeAmp: { value: 0.12 },
    uSurgeFreq: { value: 3 },
    uTwist: { value: 0.1 },
    uChurn: { value: 0.1 },
    uSeed: { value: 0 },
    uFade: { value: 1 }
  };
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: !lens,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms(
      lens
        ? { ...shape, uStrength: { value: 1 } }
        : {
            ...shape,
            uEnvMap: frame.uEnvMap,
            uHasEnv: { value: 0 },
            uOpacity: { value: 0.7 },
            uFresnelPow: { value: 2 },
            uGlow: { value: 1 },
            uCoreGlow: { value: 1.5 },
            uFoam: { value: 1 },
            uFoamScale: { value: 1 },
            uEnvAmt: { value: 0.7 },
            uColorDeep: { value: new Color() },
            uColorBrine: { value: new Color() },
            uColorFoam: { value: new Color() }
          }
    ),
    vertexShader: COLUMN_VERTEX,
    fragmentShader: lens ? LENS_FRAGMENT : COLUMN_FRAGMENT
  });

  /** @param {object} state { center, height, open, surge, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uBaseR.value = c.columnRadius;
    u.uTopR.value = c.columnRadius * c.columnTaper;
    u.uHeight.value = state.height;
    u.uCrownR.value = c.crownRadius * g.explosionIntensity;
    u.uCrownLift.value = c.crownLift;
    u.uCrownDrop.value = c.crownDrop;
    u.uOpen.value = state.open;
    u.uSurge.value = state.surge;
    u.uSurgeAmp.value = c.surgeAmp * g.noiseStrength;
    u.uSurgeFreq.value = c.surgeCount;
    u.uTwist.value = c.twist;
    u.uChurn.value = c.churn * g.noiseStrength;
    u.uSeed.value = state.seed;
    u.uFade.value = state.fade;
    if (lens) {
      u.uStrength.value = c.refractStrength * g.distortion;
      return;
    }
    u.uHasEnv.value = frame.uEnvMap.value ? 1 : 0;
    u.uOpacity.value = c.columnOpacity * g.opacity;
    u.uFresnelPow.value = c.fresnelPower;
    u.uGlow.value = c.columnGlow * g.glow;
    u.uCoreGlow.value = c.coreGlow * g.glow;
    u.uFoam.value = c.foamAmount;
    u.uFoamScale.value = c.foamScale * g.noiseFrequency;
    u.uEnvAmt.value = c.envAmount;
    u.uColorDeep.value.copy(getColor(c.colorBrineDeep));
    u.uColorBrine.value.copy(getColor(c.colorBrine));
    u.uColorFoam.value.copy(getColor(c.colorFoam));
  };

  return material;
}

/* ==================================================================== */
/* The salt pan                                                           */
/* ==================================================================== */

const CRUST_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;

  varying vec2 vP;
  varying vec3 vWorld;

  void main() {
    vec2 p = position.xy * uRadius;
    vec3 world = vec3(uCenter.x + p.x, 0.014, uCenter.z + p.y);
    vP = p;
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const CRUST_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uZone;
  uniform float uSpread;      // 0..1 how far the pan has cracked out from the vent
  uniform float uSalt;        // 0 wet brine .. 1 white crust
  uniform float uSeep;        // integrated seep phase
  uniform float uSeepGlow;
  uniform float uCellScale;
  uniform float uRidge;
  uniform float uErode;       // 0..1 eroded away
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3  uColorWet;
  uniform vec3  uColorSeep;
  uniform vec3  uColorSalt;
  uniform vec3  uColorRidge;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec2 vP;
  varying vec3 vWorld;

  ${noiseGLSL}

  /** x = F2 − F1 (0 on a seam), y = cell random. */
  vec2 pan(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    float id = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 cell = n + g;
        vec2 o = vec2(hash13(vec3(cell, 2.1)), hash13(vec3(cell, 6.7)));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = hash13(vec3(cell, 4.4)); }
        else if (d < d2) { d2 = d; }
      }
    }
    return vec2(sqrt(d2) - sqrt(d1), id);
  }

  void main() {
    float r = length(vP);
    float rn = r / max(uZone, 0.1);
    float th = atan(vP.y, vP.x);
    float edgeN = fbm3(vec3(cos(th) * 1.8, sin(th) * 1.8, uSeed)) * 0.25;
    float reach = uSpread * (1.0 + edgeN);
    if (rn > reach || rn > 1.25) discard;
    float edge = 1.0 - smoothstep(reach - 0.12, reach, rn);

    vec2 cell = pan(vP * uCellScale + uSeed * 3.0);
    float seam = 1.0 - smoothstep(0.0, 0.07, cell.x);
    float ridge = 1.0 - smoothstep(0.0, 0.18, cell.x);

    // Raised ridges catch the light on one side.
    vec2 g = vec2(dFdx(cell.x), dFdy(cell.x));
    float lit = clamp(0.6 + dot(normalize(vec3(-g * 40.0, 1.0)), uLightDir) * 0.4, 0.0, 1.2);

    vec3 wet = uColorWet * (0.7 + 0.5 * cell.y);
    vec3 salt = uColorSalt * (0.8 + 0.25 * cell.y) * (0.85 + 0.15 * fbm3(vec3(vP * 4.0, uSeed)));
    vec3 plate = mix(wet, salt, uSalt);
    vec3 col = mix(plate, uColorRidge * lit * 1.2, ridge * (0.3 + 0.7 * uSalt) * uRidge);

    // Brine seeping through the seams, glowing, before it salts over.
    float seepN = snoise(vec3(vP * 0.8, uSeep)) * 0.5 + 0.5;
    float seep = seam * smoothstep(0.3, 0.8, seepN) * (1.0 - uSalt * 0.85);
    col += uColorSeep * seep * uSeepGlow;

    // Erodes raggedly from the rim in.
    float n = snoise(vec3(vP * 0.9, uSeed * 2.0)) * 0.5 + 0.5;
    float keep = 1.0 - smoothstep(n * 0.8, n * 0.8 + 0.2, uErode * 1.2 - (1.0 - rn) * 0.3);

    float a = edge * keep * uOpacity * (0.75 + 0.25 * max(ridge, uSalt));
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

export function createCrustMaterial() {
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
      uCenter: { value: new Vector3() },
      uRadius: { value: 5 },
      uZone: { value: 4 },
      uSpread: { value: 0 },
      uSalt: { value: 0 },
      uSeep: { value: 0 },
      uSeepGlow: { value: 2 },
      uCellScale: { value: 1 },
      uRidge: { value: 1 },
      uErode: { value: 0 },
      uOpacity: { value: 0.9 },
      uSeed: { value: 0 },
      uColorWet: { value: new Color() },
      uColorSeep: { value: new Color() },
      uColorSalt: { value: new Color() },
      uColorRidge: { value: new Color() }
    }),
    vertexShader: CRUST_VERTEX,
    fragmentShader: CRUST_FRAGMENT
  });

  /** @param {object} state { center, spread, salt, seep, erode, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uZone.value = c.zoneRadius;
    u.uRadius.value = c.zoneRadius * 1.35;
    u.uSpread.value = state.spread;
    u.uSalt.value = state.salt;
    u.uSeep.value = state.seep;
    u.uSeepGlow.value = c.seepGlow * g.glow;
    u.uCellScale.value = c.panCells * g.noiseFrequency;
    u.uRidge.value = c.ridgeAmount;
    u.uErode.value = state.erode;
    u.uOpacity.value = c.crustOpacity * g.opacity;
    u.uSeed.value = state.seed;
    u.uColorWet.value.copy(getColor(c.colorWet));
    u.uColorSeep.value.copy(getColor(c.colorBrine));
    u.uColorSalt.value.copy(getColor(c.colorSalt));
    u.uColorRidge.value.copy(getColor(c.colorRidge));
  };

  return material;
}

/* ==================================================================== */
/* The crystals                                                           */
/* ==================================================================== */

const CRYSTAL_VERTEX = /* glsl */ `
  attribute vec2 aCrystal;    // seed, growth 0..1

  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec2 vCrystal;

  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vLocal = position;
    vCrystal = aCrystal;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CRYSTAL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSparkle;
  uniform float uHeart;
  uniform float uEnvAmt;
  uniform vec3  uColorSalt;
  uniform vec3  uColorHeart;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;

  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec2 vCrystal;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(N, V) < 0.0) N = -N;
    float facing = clamp(dot(N, V), 0.0, 1.0);
    float diff = clamp(dot(N, uLightDir), 0.0, 1.0);
    float fres = pow(1.0 - facing, 3.0);
    vec3 H = normalize(uLightDir + V);
    float spec = pow(max(dot(N, H), 0.0), 50.0);

    // Milky salt, a teal heart deep inside, glitter on the facets.
    float heart = smoothstep(0.9, 0.0, length(vLocal.xz) * 2.0) * (1.0 - vLocal.y * 0.6);
    float glit = pow(snoise01(vec3(vWorld * 18.0 + vec3(0.0, uTime * 0.5, vCrystal.x))), 18.0) * uSparkle;
    vec3 col = uColorSalt * (0.35 + 0.65 * diff);
    col += uColorHeart * heart * uHeart * (0.4 + 0.6 * facing);
    col += skyAt(reflect(-V, N)) * uEnvAmt * (0.2 + fres);
    col += vec3(spec * 1.5 + glit * 4.0);
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

export function createCrystalMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uHasEnv: { value: 0 },
      uSparkle: { value: 1 },
      uHeart: { value: 1 },
      uEnvAmt: { value: 0.5 },
      uColorSalt: { value: new Color() },
      uColorHeart: { value: new Color() }
    }),
    vertexShader: CRYSTAL_VERTEX,
    fragmentShader: CRYSTAL_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHasEnv.value = frame.uEnvMap.value ? 1 : 0;
    u.uSparkle.value = c.crystalSparkle * g.glow;
    u.uHeart.value = c.crystalHeart * g.glow;
    u.uEnvAmt.value = c.envAmount * 0.6;
    u.uColorSalt.value.copy(getColor(c.colorSalt));
    u.uColorHeart.value.copy(getColor(c.colorBrine));
  };

  return material;
}
