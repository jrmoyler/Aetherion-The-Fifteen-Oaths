import { AdditiveBlending, Color, DoubleSide, MeshStandardMaterial, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'crosscut';

/**
 * Crosscut Gust — four shaders, none of them shared.
 *
 * Body placement is the hinge read (Wind — a gust hinged at the hand cuts across the cast).
 * The fragment field is wind-specific (f 14.00 / 3.01, speed 0.57),
 * then carved by this spell's own mask. The lens writes distortion
 * (direction in RG around 0.5, strength in B, coverage in A). The ground
 * pattern belongs to wind, not to a shared stamp. The voice is a
 * second placement — bore — so the cast has a layer that
 * is not the body. Every uniform is filled from settings.crosscut each frame.
 */

const BODY_VERTEX = /* glsl */ `

  uniform vec3 uCenter;
  uniform vec3 uOrigin;
  uniform vec3 uDir;
  uniform vec3 uSide;
  uniform float uRadius;
  uniform float uLength;
  uniform float uHeight;
  uniform float uThickness;
  uniform float uCount;
  uniform float uSpin;
  uniform float uOpen;
  uniform float uGrow;
  uniform float uAlong;
  uniform float uSeed;
  varying vec2 vUv;
  varying float vLocal;
  varying float vAlong;
  varying vec3 vWorld;
  varying float vViewZ;
  void main() {
    float u = uv.x;
    float v = uv.y;
    vec3 p = vec3(0.0);
    float local = u;


    float ang = mix(-uRadius, uRadius, clamp(uAlong, 0.0, 1.0));
    vec3 fwd = uDir * cos(ang) + uSide * sin(ang);
    p = uOrigin + fwd * (uLength * (0.10 + 0.90 * v));
    p.y = uHeight * (0.90 - v * 0.28) * uGrow;
    local = v;
  

    // crescent gust edge
    vec3 sculptForward = uDir;
    vec3 sculptSide = uSide;
    float sculptWidth = max(uThickness, 0.08);
    float sculptRise = max(uHeight * 0.22, 0.08) * uGrow;
    p += sculptSide * position.x * sculptWidth;
    p.y += position.y * sculptRise;
    p += sculptForward * position.z * sculptWidth;


    vUv = vec2(u, v);
    vLocal = local;
    vAlong = uAlong;
    vWorld = p;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }

`;

const BODY_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uDissolve;
  uniform float uSoftFade;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uEdge;
  uniform float uPhrase;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec2 uResolution;
  uniform sampler2D uSceneDepth;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying float vLocal;
  varying float vAlong;
  varying vec3 vWorld;
  varying float vViewZ;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    float field = abs(sin(vWorld.x * 14.00 + vWorld.z * 3.01 - uTime * 0.57));
    float band = 0.5 + 0.5 * sin(vLocal * 14.00 + uTime * 0.57);
    float carved = band * (0.30 + 0.70 * field);
    vec3 col = mix(uColorC, uColorA, carved);
    col += uColorB * (1.0 - carved) * uGlow;
    col *= 1.0 + uPhrase * 0.18;
    float mask = uOpacity * (0.22 + 0.78 * clamp(carved, 0.0, 1.0));
    mask *= smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.94, 1.0, vUv.y));
    if (uDissolve > 0.0) {
      float n = snoise01(vWorld * 0.45 + vec3(uSeed, uTime * 0.20, 0.0));
      float hold = smoothstep(uDissolve, uDissolve + 0.14, n * 0.65 + carved * 0.35);
      col += uColorA * (1.0 - hold) * 0.65;
      mask *= hold;
    }
    if (mask < 0.02) discard;
    vec2 screenUV = gl_FragCoord.xy / max(uResolution, vec2(1.0));
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, max(uSoftFade, 0.02));
    if (mask < 0.02) discard;
    gl_FragColor = vec4(col * mask * uGlobalGlow * mix(1.0, uShaderIntensity, 0.65), mask);
  }
`;

const LENS_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uWarp;
  uniform float uShaderIntensity;
  uniform float uDissolve;
  uniform float uPhrase;
  varying vec2 vUv;
  varying float vLocal;
  varying float vAlong;
  varying vec3 vWorld;
  varying float vViewZ;
  void main() {
    float mask = smoothstep(0.0, 0.10, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
    mask *= (0.40 + 0.60 * clamp(vLocal, 0.0, 1.0)) * (1.0 - uDissolve);
    float s = uWarp * uShaderIntensity * mask * (1.0 + uPhrase * 0.25);
    if (s < 0.01) discard;
    vec2 dir = vec2(vLocal - 0.5, 0.15); dir = length(dir) < 0.001 ? vec2(1.0, 0.0) : normalize(dir);
    gl_FragColor = vec4(dir * 0.5 + 0.5, s, mask);
  }
`;

const GROUND_VERTEX = /* glsl */ `
  uniform vec3 uCenter;
  uniform vec3 uDir;
  uniform vec3 uSide;
  uniform float uLength;
  uniform float uWidth;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vViewZ;
  void main() {
    vUv = vec2(position.x + 0.5, position.y + 0.5);
    vec3 p = uCenter + uDir * (position.y * uLength) + uSide * (position.x * uWidth);
    p.y = 0.04;
    vWorld = p;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

/*
 * The ground is a filled field, not a sigil. Before the beat it is a faint
 * footprint (zone casts) or the strip the head has already crossed (line
 * casts); on the beat it lands from the centre out to the rim behind a hot lip,
 * holds through the linger with the element's own pattern carved into it,
 * cools, and finally breaks up from the rim inward. The colour is the ramp's
 * dark end — the stain the element leaves, mixed toward a pale coat for the
 * elements that frost or bleach — with the body tone in the carving.
 */
const GROUND_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uErode;
  uniform float uOpacity;
  uniform float uPhrase;
  uniform float uLand;
  uniform float uPre;
  uniform float uHeat;
  uniform float uCoat;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorStain;
  uniform vec3 uColorHot;
  uniform vec2 uResolution;
  uniform sampler2D uSceneDepth;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vViewZ;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec2 q = vUv - 0.5;
    float rad = length(q) * 2.0;
    float ang = atan(q.y, q.x);
    float grain = snoise(vec3(vWorld.xz * 0.85, uSeed)) * 0.5 + 0.5;
    float pat = smoothstep(0.25, 0.0, abs(fract(rad * 5.0 - uTime * 0.40) - 0.5));
    pat = clamp(pat, 0.0, 1.0);
    float rag = fbm3(vec3(vWorld.xz * 0.45, uSeed * 3.7)) * 0.5 + 0.5;
    // A ragged strip from the hand to the head, landing behind the head.
    float reach = abs(q.x) * 2.0 * (0.8 + 0.4 * rag);
    reach = max(reach, 1.0 - smoothstep(0.0, 0.08, vUv.y));
    float lead = vUv.y - uLand;
    float foot = 1.0 - smoothstep(0.8, 1.0, reach);
    float landed = 1.0 - smoothstep(-0.12, 0.0, lead);
    float cover = foot * max(landed, uPre);
    float lip = foot * (1.0 - smoothstep(0.0, 0.1, abs(lead)));
    // Cooling out: the field breaks up from its edge inward.
    cover *= smoothstep(uErode, uErode + 0.2, (1.0 - reach) * 0.55 + grain * 0.45);
    float mask = cover * uOpacity * (0.86 + 0.14 * grain);
    if (mask < 0.01) discard;
    vec3 dark = mix(uColorStain, uColorB, 0.3 + 0.4 * grain);
    vec3 pale = mix(uColorA, vec3(1.0), 0.4);
    vec3 col = mix(dark, pale, uCoat) * (0.72 + 0.28 * rag);
    col = mix(col, uColorA * (0.5 + 0.4 * uCoat), pat * 0.55);
    float heat = uHeat * uGlow;
    col += uColorA * pat * heat * 0.45;
    col += uColorA * (1.0 - smoothstep(0.0, 0.55, reach)) * heat * 0.2;
    col += uColorHot * lip * heat * 1.6;
    col *= 1.0 + uPhrase * 0.08;
    vec2 screenUV = gl_FragCoord.xy / max(uResolution, vec2(1.0));
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.45);
    gl_FragColor = vec4(col * uGlobalGlow, mask);
  }
`;

const VOICE_VERTEX = /* glsl */ `

  uniform vec3 uCenter;
  uniform vec3 uOrigin;
  uniform vec3 uDir;
  uniform vec3 uSide;
  uniform float uRadius;
  uniform float uLength;
  uniform float uHeight;
  uniform float uThickness;
  uniform float uCount;
  uniform float uSpin;
  uniform float uOpen;
  uniform float uGrow;
  uniform float uAlong;
  uniform float uSeed;
  varying vec2 vUv;
  varying float vLocal;
  varying float vAlong;
  varying vec3 vWorld;
  varying float vViewZ;
  void main() {
    float u = position.x + 0.5;
    float v = position.y + 0.5;
    vec3 p = vec3(0.0);
    float local = u;


    float s = clamp(uAlong, 0.0, 1.0);
    p = uOrigin + uDir * (s * uLength) + uSide * ((u - 0.5) * uThickness * 1.5);
    p.y = 0.18 + v * uHeight * 0.22 * uGrow;
    local = s;
  

    vUv = vec2(u, v);
    vLocal = local;
    vAlong = uAlong;
    vWorld = p;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }

`;

const VOICE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uDissolve;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uPhrase;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec2 uResolution;
  uniform sampler2D uSceneDepth;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying float vLocal;
  varying float vAlong;
  varying vec3 vWorld;
  varying float vViewZ;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    float band = 0.5 + 0.5 * sin(vLocal * 14.00 + uTime * 0.57 + uSeed);
    float grain = snoise01(vWorld * 3.01 + vec3(uSeed, uTime * 0.30, 0.0));
    float mask = (0.30 + 0.70 * band) * (0.45 + 0.55 * grain);
    mask *= uOpacity * (1.0 - uDissolve);
    mask *= smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.88, 1.0, vUv.y));
    if (mask < 0.02) discard;
    vec3 col = mix(uColorA, uColorB, band) * (1.0 + uGlow) * (1.0 + uPhrase * 0.40);
    vec2 screenUV = gl_FragCoord.xy / max(uResolution, vec2(1.0));
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.35);
    gl_FragColor = vec4(col * mask * uGlobalGlow, mask);
  }
`;


const DETAIL_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute vec3 aEdge;
  attribute vec4 aInfo;
  attribute vec3 aStyle;
  attribute vec3 aPivot;
  attribute vec4 aHinge;
  uniform float uGrowArt;
  uniform float uOpenArt;
  uniform float uSwing;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vSeed;
  varying float vSpan;
  varying float vViewZ;
  varying vec3 vEdge;
  varying vec4 vInfo;
  varying vec2 vStyle;
  vec3 rotAxis(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
  void main() {
    // Each authored part folds about its own pivot: aInfo.w picks whether it
    // follows the rise (0) or the beat (1), aInfo.z delays it within that.
    float art = mix(uGrowArt, uOpenArt, aInfo.w);
    float fold = smoothstep(aInfo.z, aInfo.z + 0.5, art) * aHinge.w * uSwing;
    vec3 p = position;
    vec3 n = normal;
    if (abs(fold) > 1e-4 && dot(aHinge.xyz, aHinge.xyz) > 0.5) {
      p = aPivot + rotAxis(position - aPivot, aHinge.xyz, fold);
      n = rotAxis(normal, aHinge.xyz, fold);
    }
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 wp = model * vec4(p, 1.0);
    vWorld = wp.xyz;
    vNormalW = normalize(mat3(model) * n);
    vSeed = aSeed;
    vSpan = aStyle.z;
    vEdge = aEdge;
    vInfo = aInfo;
    vStyle = aStyle.xy;
    vec4 mv = viewMatrix * wp;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

/*
 * Energy over a dark body. The deep stop fills the faces that look at the
 * camera, the body colour climbs the span and the lit side, and the light
 * tint rides the silhouette as a fresnel shell, so the rig reads as a volume
 * of something rather than as its own outline. Hot parts and arrises glow on
 * top and feed the bloom.
 */
const DETAIL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uEdge;
  uniform float uRim;
  uniform float uDeep;
  uniform float uDissolve;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uLightDir;
  uniform vec2 uResolution;
  uniform sampler2D uSceneDepth;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uGlobalGlow;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vSeed;
  varying float vSpan;
  varying float vViewZ;
  varying vec3 vEdge;
  varying vec4 vInfo;
  varying vec2 vStyle;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    vec3 view = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - abs(dot(n, view)), 2.2);
    float lit = clamp(dot(n, normalize(uLightDir)) * 0.5 + 0.5, 0.0, 1.0);
    float pat = clamp(abs(sin(vSpan * 10.0 - uTime * 5.0 + vSeed * 9.0)), 0.0, 1.0);
    float form = clamp(0.15 + 0.45 * vSpan + 0.4 * lit, 0.0, 1.0);
    vec3 col = mix(uColorC, uColorB, mix(1.0, form, uDeep));
    col *= 0.86 + 0.28 * fract(vInfo.y * 0.61803 + vInfo.x * 0.37);
    col = mix(col, uColorC, pat * 0.35 * uDeep);
    col += uColorB * pat * 0.22 * uGlow;
    // The fresnel shell.
    col += mix(uColorB, uColorA, rim) * rim * uRim * uGlow * 1.15;
    // Hot core parts breathe.
    col += mix(uColorB, uColorA, 0.6) * vStyle.y * (1.1 + 0.5 * sin(uTime * 3.0 + vInfo.x * 1.7)) * uGlow;
    // Arrises: a hairline, dropped once a triangle is too small to carry one.
    float edge = min(min(vEdge.x, vEdge.y), vEdge.z);
    float slope = fwidth(edge) + 1e-4;
    float line = (1.0 - smoothstep(slope * 0.6, slope * 1.7, edge)) * (1.0 - smoothstep(0.14, 0.3, slope)) * vStyle.x;
    col += uColorA * line * uEdge * 0.3;
    col *= 0.9 + 0.1 * sin(uTime * (3.0 + vSeed * 5.0) + vSeed * 31.0);
    float mask = uOpacity * clamp(0.72 + 0.28 * rim + 0.3 * vStyle.y + 0.2 * line, 0.0, 1.0);
    if (uDissolve > 0.0) {
      float cut = snoise01(vWorld * 1.7 + vec3(vSeed * 9.0, uTime * 0.2, 0.0));
      mask *= smoothstep(uDissolve, uDissolve + 0.12, cut);
      col += uColorA * (1.0 - smoothstep(uDissolve, uDissolve + 0.08, cut)) * 1.5;
    }
    if (mask < 0.02) discard;
    vec2 screenUV = gl_FragCoord.xy / max(uResolution, vec2(1.0));
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.3);
    if (mask < 0.02) discard;
    gl_FragColor = vec4(col * uGlobalGlow, mask);
  }
`;


function shapeUniforms() {
  return {
    uCenter: { value: new Vector3() },
    uOrigin: { value: new Vector3() },
    uDir: { value: new Vector3(0, 0, 1) },
    uSide: { value: new Vector3(1, 0, 0) },
    uRadius: { value: 1 },
    uLength: { value: 1 },
    uHeight: { value: 1 },
    uThickness: { value: 0.3 },
    uCount: { value: 6 },
    uSpin: { value: 0 },
    uOpen: { value: 1 },
    uGrow: { value: 1 },
    uAlong: { value: 1 },
    uSeed: { value: 0 }
  };
}

function writeShape(u, st, spin) {
  u.uCenter.value.copy(st.center);
  u.uOrigin.value.copy(st.origin);
  u.uDir.value.copy(st.dir);
  u.uSide.value.copy(st.side);
  u.uRadius.value = st.radius;
  u.uLength.value = st.length;
  u.uHeight.value = st.height;
  u.uThickness.value = st.thickness;
  u.uCount.value = st.count;
  u.uSpin.value = spin;
  u.uOpen.value = st.open;
  u.uGrow.value = st.grow;
  u.uAlong.value = st.along;
  u.uSeed.value = st.seed;
}

export function createCrosscutGustBodyMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...shapeUniforms(),
      uDissolve: { value: 0 },
      uSoftFade: { value: 0.4 },
      uOpacity: { value: 1 },
      uGlow: { value: 1 },
      uEdge: { value: 2 },
      uPhrase: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() }
    }),
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT
  });
  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    writeShape(u, st, st.spin);
    u.uDissolve.value = st.dissolve;
    u.uSoftFade.value = c.softFade;
    u.uOpacity.value = c.bodyOpacity * g.opacity * st.fade;
    u.uGlow.value = c.bodyGlow * g.glow * st.pulse;
    u.uEdge.value = c.edgeGlow * g.glow * st.pulse;
    u.uPhrase.value = st.phrase;
    u.uColorA.value.copy(getColor(c.colorA));
    u.uColorB.value.copy(getColor(c.colorB));
    u.uColorC.value.copy(getColor(c.colorC));
  };
  return material;
}

export function createCrosscutGustLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...shapeUniforms(),
      uWarp: { value: 1 },
      uDissolve: { value: 0 },
      uPhrase: { value: 0 }
    }),
    vertexShader: BODY_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });
  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    writeShape(u, st, st.spin);
    u.uDissolve.value = st.dissolve;
    u.uPhrase.value = st.phrase;
    u.uWarp.value = c.lensWarp * g.distortion * st.fade * (1.0 - st.dissolve);
  };
  return material;
}

export function createCrosscutGustGroundMaterial() {
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
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 4 },
      uWidth: { value: 4 },
      uSeed: { value: 0 },
      uGlow: { value: 1 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uPhrase: { value: 0 },
      uLand: { value: 0 },
      uPre: { value: 0 },
      uHeat: { value: 0 },
      uCoat: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorStain: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT
  });
  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(st.groundCenter);
    u.uDir.value.copy(st.dir);
    u.uSide.value.copy(st.side);
    u.uLength.value = Math.max(0.2, st.foot);
    u.uWidth.value = Math.max(0.2, st.footWidth);
    u.uSeed.value = st.seed;
    u.uGlow.value = c.groundGlow * g.glow;
    u.uErode.value = st.erode;
    u.uOpacity.value = c.groundOpacity * g.opacity;
    u.uPhrase.value = st.phrase;
    u.uLand.value = st.land;
    u.uPre.value = st.pre;
    u.uHeat.value = c.groundHeat * st.heat;
    u.uCoat.value = c.groundCoat;
    u.uColorA.value.copy(getColor(c.colorGroundA));
    u.uColorB.value.copy(getColor(c.colorGroundB));
    u.uColorStain.value.copy(getColor(c.colorGroundStain));
    u.uColorHot.value.copy(getColor(c.colorB));
  };
  return material;
}

export function createCrosscutGustVoiceMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...shapeUniforms(),
      uDissolve: { value: 0 },
      uOpacity: { value: 1 },
      uGlow: { value: 1 },
      uPhrase: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: VOICE_VERTEX,
    fragmentShader: VOICE_FRAGMENT
  });
  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    writeShape(u, st, st.voiceSpin);
    u.uDissolve.value = st.dissolve;
    u.uOpacity.value = c.bodyOpacity * c.voiceOpacity * g.opacity * st.fade;
    u.uGlow.value = c.bodyGlow * g.glow * 1.25 * st.pulse;
    u.uPhrase.value = st.phrase;
    u.uColorA.value.copy(getColor(c.colorVoiceA));
    u.uColorB.value.copy(getColor(c.colorVoiceB));
  };
  return material;
}

/**
 * `rig` true builds the hero rig's material: the same shader, its own look.
 * wind is energy: emissive over a dark body, normal-blended and
 * depth-writing, on LAYER.VFX.
 */
export function createCrosscutGustDetailMaterial(rig = false) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uOpacity: { value: 1 },
      uGlow: { value: 1 },
      uEdge: { value: 1 },
      uRim: { value: 1 },
      uDeep: { value: 0.75 },
      uDissolve: { value: 0 },
      uGrowArt: { value: 0 },
      uOpenArt: { value: 0 },
      uSwing: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() }
    }),
    vertexShader: DETAIL_VERTEX,
    fragmentShader: DETAIL_FRAGMENT
  });
  material.userData.solid = false;
  const u = material.uniforms;
  material.userData.sync = (st) => {
    const c = settings[ID];
    const g = settings.global;
    const k = rig ? 'hero' : 'detail';
    const K = rig ? 'Hero' : 'Detail';
    u.uOpacity.value = c[k + 'Opacity'] * g.opacity * st.fade;
    u.uGlow.value = c[k + 'Glow'] * g.glow * st.pulse;
    u.uEdge.value = c[k + 'Edge'];
    u.uRim.value = g.fresnel;
    u.uDeep.value = c[k + 'Deep'];
    u.uSwing.value = c[k + 'Swing'];
    u.uGrowArt.value = Math.min(1, Math.max(0, st.grow));
    u.uOpenArt.value = Math.min(1, Math.max(0, st.beat));
    u.uDissolve.value = st.dissolve * 0.6;
    u.uColorA.value.copy(getColor(c['color' + K + 'A']));
    u.uColorB.value.copy(getColor(c['color' + K + 'B']));
    u.uColorC.value.copy(getColor(c['color' + K + 'C']));
  };
  return material;
}

/* ---- the trail: the line cast's wake, along its own hinge path (LineTrail.js) ---- */

const TRAIL_VERTEX = /* glsl */ `

  uniform vec3 uOrigin;
  uniform vec3 uDir;
  uniform vec3 uSide;
  uniform float uLength;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uThickness;
  uniform float uLanes;
  uniform float uAlong;
  uniform float uTravel;
  uniform float uSince;
  uniform float uLife;
  uniform float uWidth;
  vec3 trailPath(float s, float lane) {
    float ang = -uRadius + 2.0 * uRadius * s;
    vec3 fwd = uDir * cos(ang) + uSide * sin(ang);
    vec3 p = uOrigin + fwd * (uLength * 0.92);
    p.y = uHeight * 0.68;
    return p;
  }
  float trailPass(float s, float lane) {
    return s;
  }
  varying vec2 vUv;
  varying float vLocal;
  varying float vAlong;
  varying float vAge;
  varying vec3 vWorld;
  varying float vViewZ;
  void main() {
    float s = position.x;
    float lane = position.z;
    vec3 p = trailPath(s, lane);
    vec3 t = trailPath(min(s + 0.01, 1.0), lane) - trailPath(max(s - 0.01, 0.0), lane);
    // Seconds since the head crossed this point; negative ahead of the head.
    float age = (uAlong - trailPass(s, lane)) * uTravel + uSince;
    float k = clamp(age / max(uLife, 0.05), 0.0, 1.0);
    float w = uWidth * pow(1.0 - k, 0.7) * smoothstep(-0.01, 0.06, age) * smoothstep(0.0, 0.04, s);
    w *= step(lane, uLanes - 0.5);
    vec3 across = normalize(cross(normalize(t + vec3(0.0, 1e-4, 0.0)), cameraPosition - p));
    p += across * position.y * w;
    vUv = vec2(s, position.y);
    vLocal = s;
    vAlong = s;
    vAge = age / max(uLife, 0.05);
    vWorld = p;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uLength;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uEdge;
  uniform float uCore;
  uniform float uBreakup;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec2 uResolution;
  uniform sampler2D uSceneDepth;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying float vLocal;
  varying float vAlong;
  varying float vAge;
  varying vec3 vWorld;
  varying float vViewZ;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    if (vAge < 0.0 || vAge > 1.0) discard;
    float x = abs(vUv.y);
    float field = abs(sin(vWorld.x * 14.00 + vWorld.z * 3.01 - uTime * 0.57));
    float carved = clamp(field, 0.0, 1.0);
    vec3 col = mix(uColorC, uColorA, carved);
    col += uColorB * (1.0 - carved) * uGlow;
    float core = (1.0 - smoothstep(0.0, 0.32, x)) * (1.0 - vAge);
    col = mix(col, uColorB, core * uCore);
    // Breaks up from the tail forward, the way an old beam goes to embers.
    float n = snoise01(vec3(vLocal * uLength * 1.3 - uTime * 0.7, vUv.y * 1.4, uSeed));
    float hold = smoothstep(vAge * uBreakup - 0.10, vAge * uBreakup + 0.06, n);
    float mask = (1.0 - smoothstep(0.5, 1.0, x)) * hold * pow(1.0 - vAge, 1.2) * uOpacity;
    if (mask < 0.01) discard;
    vec2 screenUV = gl_FragCoord.xy / max(uResolution, vec2(1.0));
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.25);
    gl_FragColor = vec4(col * mask * uGlow * uGlobalGlow, mask);
  }
`;

const SCAR_VERTEX = /* glsl */ `

  uniform vec3 uOrigin;
  uniform vec3 uDir;
  uniform vec3 uSide;
  uniform float uLength;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uThickness;
  uniform float uLanes;
  uniform float uAlong;
  uniform float uTravel;
  uniform float uSince;
  uniform float uLife;
  uniform float uWidth;
  vec3 trailPath(float s, float lane) {
    float ang = -uRadius + 2.0 * uRadius * s;
    vec3 fwd = uDir * cos(ang) + uSide * sin(ang);
    vec3 p = uOrigin + fwd * (uLength * 0.92);
    p.y = uHeight * 0.68;
    return p;
  }
  float trailPass(float s, float lane) {
    return s;
  }
  varying vec2 vUv;
  varying float vAge;
  varying vec3 vWorld;
  varying float vViewZ;
  void main() {
    float s = position.x;
    float lane = position.z;
    vec3 p = trailPath(s, lane);
    vec3 t = trailPath(min(s + 0.01, 1.0), lane) - trailPath(max(s - 0.01, 0.0), lane);
    t.y = 0.0;
    float age = (uAlong - trailPass(s, lane)) * uTravel + uSince;
    float w = uWidth * smoothstep(-0.01, 0.1, age) * smoothstep(0.0, 0.05, s) * step(lane, uLanes - 0.5);
    vec3 across = normalize(cross(normalize(t + vec3(1e-4, 0.0, 0.0)), vec3(0.0, 1.0, 0.0)));
    p += across * position.y * w;
    p.y = 0.035;
    vUv = vec2(s, position.y);
    vAge = age / max(uLife, 0.05);
    vWorld = p;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SCAR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uLength;
  uniform float uOpacity;
  uniform float uGlow;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec2 uResolution;
  uniform sampler2D uSceneDepth;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying float vAge;
  varying vec3 vWorld;
  varying float vViewZ;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    if (vAge < 0.0 || vAge > 1.0) discard;
    float x = abs(vUv.y);
    float along = vUv.x * uLength;
    float grain = snoise(vec3(vWorld.xz * 1.1, uSeed)) * 0.5 + 0.5;
    float seam = smoothstep(0.08, 0.0, abs(fract(x * 3.0 - along * 0.6) - 0.5)) * 0.6;
    seam = clamp(seam, 0.0, 1.0);
    float cool = 1.0 - vAge;
    float mask = (1.0 - smoothstep(0.55, 1.0, x + (grain - 0.5) * 0.35)) * (0.45 + 0.55 * grain);
    mask *= smoothstep(1.0, 0.6, vAge) * uOpacity;
    if (mask < 0.01) discard;
    // Dark scorched bed, with the element's hot seam cooling out of it.
    vec3 col = uColorB * 0.35 + uColorA * seam * cool * cool * uGlow;
    vec2 screenUV = gl_FragCoord.xy / max(uResolution, vec2(1.0));
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, 0.4);
    gl_FragColor = vec4(col * uGlobalGlow, mask * (0.55 + 0.45 * seam));
  }
`;

function trailUniforms() {
  return {
    uOrigin: { value: new Vector3() },
    uDir: { value: new Vector3(0, 0, 1) },
    uSide: { value: new Vector3(1, 0, 0) },
    uLength: { value: 1 },
    uRadius: { value: 1 },
    uHeight: { value: 1 },
    uThickness: { value: 0.3 },
    uLanes: { value: 1 },
    uAlong: { value: 0 },
    uTravel: { value: 0.5 },
    uSince: { value: 0 },
    uLife: { value: 1 },
    uWidth: { value: 0.3 },
    uSeed: { value: 0 },
    uOpacity: { value: 1 },
    uGlow: { value: 1 }
  };
}

function writeTrail(u, st, trail, travel, life, width, opacity, glow) {
  u.uOrigin.value.copy(st.origin);
  u.uDir.value.copy(st.dir);
  u.uSide.value.copy(st.side);
  u.uLength.value = st.length;
  u.uRadius.value = st.radius;
  u.uHeight.value = st.height;
  u.uThickness.value = st.thickness;
  u.uLanes.value = trail.lanes;
  u.uAlong.value = trail.along;
  u.uTravel.value = travel;
  u.uSince.value = trail.since;
  u.uLife.value = life;
  u.uWidth.value = width;
  u.uSeed.value = st.seed;
  u.uOpacity.value = opacity;
  u.uGlow.value = glow;
}

/** The ribbon along the path. `travel` is the seconds the head takes over the whole line. */
export function createCrosscutGustTrailMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      ...trailUniforms(),
      uEdge: { value: 1 },
      uCore: { value: 1 },
      uBreakup: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uColorC: { value: new Color() }
    }),
    vertexShader: TRAIL_VERTEX,
    fragmentShader: TRAIL_FRAGMENT
  });
  material.userData.sync = (st, trail, travel) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    writeTrail(u, st, trail, travel, c.trailLife * g.lifetime, c.trailWidth, c.trailOpacity * g.opacity, c.trailGlow * g.glow);
    // The body's edge term is tuned for a small shape; along a whole line it would go white.
    u.uEdge.value = c.edgeGlow * g.glow * 0.3;
    u.uCore.value = c.trailCore;
    u.uBreakup.value = c.trailBreakup;
    u.uColorA.value.copy(getColor(c.colorA));
    u.uColorB.value.copy(getColor(c.colorB));
    u.uColorC.value.copy(getColor(c.colorC));
  };
  return material;
}

/** The scar the path leaves on the floor, cooling from the element's seam to a dark bed. */
export function createCrosscutGustScarMaterial() {
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
      ...trailUniforms(),
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: SCAR_VERTEX,
    fragmentShader: SCAR_FRAGMENT
  });
  material.userData.sync = (st, trail, travel) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    writeTrail(u, st, trail, travel, c.scarLife * g.lifetime, c.scarWidth, c.scarOpacity * g.opacity, c.scarGlow * g.glow);
    u.uColorA.value.copy(getColor(c.colorScarA));
    u.uColorB.value.copy(getColor(c.colorScarB));
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* The upgrade: the gust front, the rotor, the scoured floor.          */
/* ------------------------------------------------------------------ */

const WIND_VERTEX = /* glsl */ `
  attribute float aU;
  attribute float aV;
  uniform float uTime;
  uniform float uKind;     // 0 front, 1 rotor
  uniform float uRipple;   // metres-ish flutter in local units
  varying float vU;
  varying float vV;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  void main() {
    vU = aU;
    vV = aV;
    vec3 p = position;
    // A degenerate (collapsed) vertex has no normal: never let it NaN the frame.
    vec3 nrm = dot(normal, normal) > 1e-8 ? normalize(normal) : vec3(0.0, 1.0, 0.0);
    // Flutter: the sheet is air, it never holds still.
    float w = sin(aU * 17.0 + uTime * 9.0) * sin(aV * 11.0 - uTime * 7.0);
    p += nrm * w * uRipple * mix(aV, 1.0, uKind);
    vLocal = p;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    vNormalW = mat3(modelMatrix) * nrm;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const WIND_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uKind;
  uniform float uOpacity;     // body (mass) strength
  uniform float uStreak;      // bright flow streaks
  uniform float uFlow;        // flow speed
  uniform float uDissolve;
  uniform float uFresnel;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorTint;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  varying float vU;
  varying float vV;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;

  ${noiseGLSL}

  void main() {
    // Flow coordinates: up and over the curl for the front, along the ribbon for the rotor.
    float along = mix(vV + (vU - 0.5) * 0.9, vU, uKind);   // the front's streaks rake across it: the crosscut
    float across = mix(vU - vV * 0.45, vV, uKind);
    float flow = along * mix(5.0, 9.0, uKind) - uTime * uFlow;
    // Streaks: noise stretched along the flow.
    float n1 = snoise(vec3(across * mix(26.0, 8.0, uKind), flow, uSeed));
    float n2 = snoise(vec3(across * mix(55.0, 17.0, uKind), flow * 1.7 + 3.0, uSeed + 7.0));
    float streak = smoothstep(0.45, 0.9, n1) * 0.7 + smoothstep(0.6, 0.95, n2) * 0.5;
    // Body: torn, translucent mass; thicker low on the front and at the rotor's core.
    float tear = snoise(vec3(across * 6.0, flow * 0.5, uSeed + 3.0)) * 0.5 + 0.5;
    // Edges: fade at the horns / ends and at the floor; the front's lip stays crisp.
    float sideFade = mix(smoothstep(0.0, 0.14, vU) * smoothstep(1.0, 0.86, vU), smoothstep(0.0, 0.14, vV) * smoothstep(1.0, 0.86, vV), uKind);
    float frontEnds = mix(smoothstep(0.0, 0.08, vV) * (0.55 + 0.45 * smoothstep(1.0, 0.9, vV)), 1.0, uKind);
    float mass = sideFade * frontEnds * (0.45 + 0.55 * tear);
    // Dissolve: the wind tears apart.
    float dn = snoise(vLocal * 2.2 + uSeed) * 0.5 + 0.5;
    float keep = smoothstep(uDissolve * 1.1 - 0.05, uDissolve * 1.1 + 0.05, dn);
    if (keep < 0.01) discard;
    vec3 N = vNormalW / max(1e-4, length(vNormalW));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 2.0) * uFresnel;
    if (uKind > 0.5) {
      // The spiral is not a volume of air: it is the debris the wind carries, a
      // thin dark ribbon broken into fragments that race round the roll.
      float cell = snoise(vec3(vU * 34.0 - uTime * uFlow * 0.6, vV * 2.5, uSeed + 11.0));
      float grit = snoise(vec3(vU * 90.0 - uTime * uFlow, vV * 7.0, uSeed + 2.0));
      float bits = smoothstep(-0.05, 0.15, cell) * (0.6 + 0.4 * smoothstep(-0.4, 0.2, grit));
      float a = bits * sideFade * keep;
      if (a < 0.28) discard;
      vec3 dcol = mix(uColorDeep * 0.5, uColorBody * 0.22, tear * 0.4);
      dcol += (uColorTint * streak * uStreak * 0.1 + uColorBody * fres * 0.2) * uShaderIntensity;
      gl_FragColor = vec4(dcol * uGlobalGlow, clamp(a * uOpacity, 0.0, 1.0));
      return;
    }
    // Ramp: deep teal in the body / low, saturated teal mid, pale mint high, white at the lip.
    // Mostly deep → body; only the crest (and the bright streaks) climb to tint.
    float h = mix(vV * vV, 0.3 + 0.3 * sin(vU * 6.2831 * 1.5 + vV * 3.0), uKind);
    vec3 col = gradient4(uColorDeep, uColorBody, uColorTint, uColorCore, clamp(h * 0.7 + streak * 0.3, 0.0, 1.0));
    col *= 0.55 + 0.45 * tear;
    float lip = (1.0 - uKind) * smoothstep(0.86, 0.97, vV) * smoothstep(1.0, 0.97, vV);
    // On the roll the ribbons are quieter, so the body inside carries the read.
    vec3 glow = (uColorTint * streak * uStreak * (1.0 - 0.45 * uKind) + uColorCore * lip * 1.4 + uColorBody * fres) * uShaderIntensity;
    float alpha = clamp(mass * uOpacity * (0.55 + 0.45 * fres) + streak * uStreak * 0.25 * sideFade, 0.0, 1.0) * keep;
    gl_FragColor = vec4((col + glow) * uGlobalGlow, alpha);
  }
`;

/**
 * The wind itself — the breaking gust front (`kind` 'front') or the rotor it
 * rolls into (`kind` 'rotor'). A translucent, torn sheet of air with mass:
 * deep teal low and inside, saturated teal through the middle, pale mint
 * high, a white lip; bright flow streaks race up and over the curl (or round
 * the roll); the sheet flutters in the vertex stage and tears apart on noise
 * when it goes. Normal blending so the deep tone reads on the dark floor.
 */
export function createCrosscutWindMaterial(kind) {
  const rotor = kind === 'rotor';
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uKind: { value: rotor ? 1 : 0 },
      uRipple: { value: 0.03 },
      uOpacity: { value: 0.6 },
      uStreak: { value: 1 },
      uFlow: { value: 3 },
      uDissolve: { value: 0 },
      uFresnel: { value: 1 },
      uSeed: { value: 0 },
      uColorCore: { value: new Color() },
      uColorTint: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: WIND_VERTEX,
    fragmentShader: /* glsl */ `${commonGLSL}\n${WIND_FRAGMENT}`
  });
  material.userData.sync = (dissolve, seed) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uRipple.value = (rotor ? c.rotorFlutter : c.frontFlutter) * g.turbulence;
    u.uOpacity.value = (rotor ? c.rotorOpacity : c.frontOpacity) * g.opacity;
    u.uStreak.value = c.windStreaks * g.glow;
    u.uFlow.value = (rotor ? c.rotorFlow : c.frontFlow) * g.animationSpeed;
    u.uDissolve.value = dissolve;
    u.uFresnel.value = c.windFresnel * g.fresnel;
    u.uSeed.value = seed;
    u.uColorCore.value.copy(getColor(c.colorWindCore));
    u.uColorTint.value.copy(getColor(c.colorWindTint));
    u.uColorBody.value.copy(getColor(c.colorWindBody));
    u.uColorDeep.value.copy(getColor(c.colorWindDeep));
  };
  return material;
}

const SCOUR_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const SCOUR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec2  uOrigin;
  uniform vec2  uDir;
  uniform float uFront;      // metres the blades have run down the line (past the crossing too)
  uniform float uLength;     // metres from the hand to the crossing
  uniform float uOver;       // metres the blades run on past the crossing
  uniform float uReach;      // metres the sweeps swing out from the line
  uniform float uWidth;      // gash width at the crossing, metres
  uniform float uTaper;      // width where the bite starts, × uWidth
  uniform float uBite;       // metres before the crossing the blades start cutting the floor
  uniform vec3  uEddy;       // crossing x, z, seconds since the crossing (<0 = none)
  uniform float uEddyRadius;
  uniform float uEddySpin;   // integrated turn of the torn patch, rad
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uDepth;
  uniform float uLip;
  uniform float uErode;
  uniform vec3  uColorCore;
  uniform vec3  uColorTint;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  varying vec3 vWorld;

  ${noiseGLSL}

  const float PI_G = 3.14159265;

  // Lateral offset of sweep s (±1) at distance a down the line: out and back in
  // over the run so the two sweeps meet over the group, then straight on, crossed.
  float sweepLat(float a, float s) {
    if (a <= uLength) return s * uReach * sin(PI_G * a / uLength);
    return -s * uReach * PI_G / uLength * (a - uLength);
  }
  float sweepSlope(float a, float s) {
    if (a <= uLength) return s * uReach * PI_G / uLength * cos(PI_G * a / uLength);
    return -s * uReach * PI_G / uLength;
  }

  void main() {
    vec2 p = vWorld.xz;
    vec2 fwd = normalize(uDir);
    vec2 side = vec2(fwd.y, -fwd.x);
    vec2 d = p - uOrigin;
    float a = dot(d, fwd);
    float l = dot(d, side);
    float cover = 0.0;
    float gouge = 0.0;
    float lip = 0.0;
    float comb = 0.0;
    float fresh = 0.0;
    if (a > 0.0 && a < uFront) {
      for (int k = 0; k < 2; k++) {
        float s = k == 0 ? -1.0 : 1.0;
        float c = sweepLat(a, s);
        float sl = sweepSlope(a, s);
        float across = (l - c) / sqrt(1.0 + sl * sl);
        float b0 = max(0.0, uLength - uBite);
        float w = uWidth * 0.5 * mix(uTaper, 1.0, smoothstep(b0, uLength, a));
        w *= mix(1.0, 0.55, clamp((a - uLength) / max(0.1, uOver), 0.0, 1.0));
        w *= 1.0 + 0.22 * snoise(vec3(a * 0.9, s * 3.0, 2.0));
        float x = abs(across) / max(0.02, w);
        if (x < 1.0) {
          // Combed grooves running with the sweep.
          float g1 = snoise(vec3(a * 0.22, across * 13.0, s * 5.0 + 1.0));
          float g2 = snoise(vec3(a * 0.5 + 7.0, across * 31.0, s * 5.0 + 3.0));
          float cmb = smoothstep(0.15, 0.75, g1) * 0.7 + smoothstep(0.4, 0.9, g2) * 0.45;
          float gg = smoothstep(0.8, 0.1, x);
          float lp = smoothstep(0.5, 0.82, x) * smoothstep(1.0, 0.84, x) * (0.55 + 0.45 * snoise(vec3(a * 2.3, s, 5.0)));
          // The blades fly clear of the floor off the hand and bite into it as they
          // close on the group, so the floor keeps an X centred on the crossing.
          float bite = smoothstep(b0, b0 + 1.2, a);
          cover = max(cover, smoothstep(1.0, 0.82, x) * bite);
          gouge = max(gouge, gg);
          lip = max(lip, lp);
          comb = max(comb, cmb * gg);
          fresh = max(fresh, exp(-max(0.0, uFront - a) * 0.28) * gg);
        }
      }
    }
    // Where the two sweeps cross: a torn patch, combed round and still turning.
    if (uEddy.z >= 0.0) {
      vec2 e = p - uEddy.xy;
      float grow = 1.0 - exp(-uEddy.z * 7.0);
      float r = length(e) / max(0.1, uEddyRadius * grow);
      if (r < 1.0) {
        float th = atan(e.y, e.x);
        float arm = sin(th * 4.0 + log(max(r, 0.02)) * 3.5 - uEddySpin);
        float rag = smoothstep(1.0, 0.6, r + 0.25 * snoise(vec3(e * 2.0, 8.0)));
        cover = max(cover, rag);
        gouge = max(gouge, rag * (0.55 + 0.45 * smoothstep(0.0, 0.8, arm)));
        comb = max(comb, smoothstep(0.3, 0.9, arm) * rag * 0.8);
        fresh = max(fresh, rag * exp(-uEddy.z * 1.2));
      }
    }
    if (cover < 0.01) discard;
    float er = snoise(vec3(p * 1.3, 6.0)) * 0.5 + 0.5;
    if (uErode > 0.0 && er < uErode) discard;
    // Torn earth: a dark gouge with teal-lit combed grooves, pale torn lips.
    vec3 col = mix(uColorBody * 0.22, uColorDeep * (1.0 - 0.75 * uDepth), gouge * uDepth);
    col += uColorBody * comb * 0.32 * uShaderIntensity;
    col += uColorTint * lip * 0.26 * uLip * uShaderIntensity;
    col += mix(uColorBody, uColorTint, fresh) * fresh * 0.4 * uGlow * uShaderIntensity;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(cover * uOpacity * (0.8 + 0.2 * gouge), 0.0, 1.0));
  }
`;

/**
 * The gash: the two sweeps written into the floor. Each blade's path runs out
 * from the hand and back in to the group, then straight on past it, so the
 * pair leaves an almond scored down the line that closes into an X over the
 * group — the crosscut. Each gash narrows toward the hand (`gashTaper`), is a
 * dark gouge (`gashDepth`) combed with teal-lit grooves running with the
 * sweep, has pale torn lips (`gashLip`) and fresh dust right behind the
 * blades; where they cross, a torn patch combed round that keeps turning. It
 * stays through the linger and erodes on the exit. Normal blending.
 */
export function createCrosscutScourMaterial() {
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
      uOrigin: { value: new Vector2() },
      uDir: { value: new Vector2(0, 1) },
      uFront: { value: 0 },
      uLength: { value: 1 },
      uOver: { value: 3 },
      uReach: { value: 2 },
      uWidth: { value: 3 },
      uTaper: { value: 0.3 },
      uBite: { value: 5 },
      uDepth: { value: 0.9 },
      uLip: { value: 0.8 },
      uEddy: { value: new Vector3(0, 0, -1) },
      uEddyRadius: { value: 2 },
      uEddySpin: { value: 0 },
      uOpacity: { value: 1 },
      uGlow: { value: 1 },
      uErode: { value: 0 },
      uColorCore: { value: new Color() },
      uColorTint: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: SCOUR_VERTEX,
    fragmentShader: SCOUR_FRAGMENT
  });
  material.userData.sync = (erode) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uWidth.value = c.scourWidth;
    u.uTaper.value = c.gashTaper;
    u.uBite.value = c.gashReach;
    u.uDepth.value = c.gashDepth;
    u.uLip.value = c.gashLip;
    u.uEddyRadius.value = c.eddyRadius;
    u.uOpacity.value = c.scourOpacity * g.opacity;
    u.uGlow.value = c.scourGlow * g.glow;
    u.uErode.value = erode;
    u.uColorCore.value.copy(getColor(c.colorWindCore));
    u.uColorTint.value.copy(getColor(c.colorWindTint));
    u.uColorBody.value.copy(getColor(c.colorWindBody));
    u.uColorDeep.value.copy(getColor(c.colorWindDeep));
  };
  return material;
}

const CORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uOpacity;
  uniform float uDissolve;
  uniform float uSeed;
  uniform float uStreak;
  uniform vec3  uColorTint;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  varying float vU;
  varying float vV;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;

  ${noiseGLSL}

  void main() {
    // Churned air inside the roll: dark teal, thickest through the middle of the
    // body (view-facing), thinning to a soft limb, swirled by noise that turns with it.
    vec3 N = vNormalW / max(1e-4, length(vNormalW));
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = abs(dot(N, V));
    float swirl = snoise(vec3(vU * 5.0, vV * 6.0, uSeed + uTime * 0.6)) * 0.5 + 0.5;
    float ends = smoothstep(0.0, 0.18, vU) * smoothstep(1.0, 0.82, vU);
    float dn = snoise(vLocal * 2.0 + uSeed) * 0.5 + 0.5;
    float keep = smoothstep(uDissolve * 1.1 - 0.05, uDissolve * 1.1 + 0.05, dn);
    if (keep < 0.01) discard;
    float band = smoothstep(0.55, 0.85, snoise(vec3(vU * 3.0, vV * 14.0, uSeed + 4.0)));
    // Saturated teal churn over a deep core, a lighter limb so the roll reads as a volume.
    float limb = pow(1.0 - facing, 2.0);
    vec3 col = mix(uColorDeep * 1.5, uColorBody * 0.9, swirl * 0.55 + limb * 0.35);
    col += uColorTint * (band * 0.3 * uStreak + limb * 0.25) * uShaderIntensity;
    float alpha = uOpacity * ends * keep * (0.7 + 0.3 * swirl) * (0.75 + 0.25 * limb);
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * The body of the roll: a dark-teal, translucent churn of air filling the
 * rotor under its ribbons, densest where it faces the camera, swirled by
 * noise, torn by the same dissolve as the ribbons. Normal blending.
 */
export function createCrosscutCoreMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uKind: { value: 1 },
      uRipple: { value: 0.03 },
      uOpacity: { value: 0.6 },
      uDissolve: { value: 0 },
      uSeed: { value: 0 },
      uStreak: { value: 1 },
      uColorTint: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: WIND_VERTEX,
    fragmentShader: CORE_FRAGMENT
  });
  material.userData.sync = (dissolve, seed) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uRipple.value = c.rotorFlutter * g.turbulence;
    u.uOpacity.value = c.coreOpacity * g.opacity;
    u.uDissolve.value = dissolve;
    u.uSeed.value = seed;
    u.uStreak.value = c.windStreaks * g.glow;
    u.uColorTint.value.copy(getColor(c.colorWindTint));
    u.uColorBody.value.copy(getColor(c.colorWindBody));
    u.uColorDeep.value.copy(getColor(c.colorWindDeep));
  };
  return material;
}

/* ------------------------------------------------------------------ */
/* The shear blades                                                    */
/* ------------------------------------------------------------------ */

const BLADE_VERTEX = /* glsl */ `
  attribute float aU;
  attribute float aV;
  attribute float aFace;
  attribute float aThick;
  uniform float uTime;
  uniform float uHalfSpan;  // metres
  uniform float uSag;       // metres the crescent arcs up
  uniform float uBow;       // metres the horns trail back
  uniform float uThick;     // metres at the spine
  uniform float uRipple;    // metres of shiver
  varying float vU;
  varying float vV;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  void main() {
    vU = aU;
    vV = aV;
    float x = position.x;
    vec3 p;
    p.x = x * uHalfSpan;
    p.y = position.y * uSag;
    p.z = -uBow * x * x + aThick * uThick * 0.5 * aFace;
    // The blade shivers along its length, most at the cutting edge.
    p.z += sin(aU * 23.0 - uTime * 31.0) * (0.3 + 0.7 * aV) * uRipple;
    // Normal: the bowed face, bevelled toward both edges.
    float dzdx = -2.0 * uBow * x / max(0.01, uHalfSpan);
    vec3 n = normalize(vec3(-dzdx, (aV - 0.5) * 0.9, 1.0)) * aFace;
    vLocal = p;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    vNormalW = mat3(modelMatrix) * n;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const BLADE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uOpacity;
  uniform float uEdge;
  uniform float uStreak;
  uniform float uFlow;
  uniform float uDissolve;
  uniform float uFresnel;
  uniform float uWisp;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorTint;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  varying float vU;
  varying float vV;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;

  ${noiseGLSL}

  void main() {
    // Streaks race along the blade toward its trailing horn: the shear.
    float flow = vU * 7.0 - uTime * uFlow;
    float n1 = snoise(vec3(flow, vV * 8.0, uSeed));
    float n2 = snoise(vec3(flow * 1.9 + 5.0, vV * 19.0, uSeed + 3.0));
    float streak = smoothstep(0.3, 0.9, n1) * 0.6 + smoothstep(0.55, 0.95, n2) * 0.5;
    // The trailing horn frays into wisps.
    float tear = snoise(vec3(vU * 16.0 - uTime * 4.0, vV * 3.0, uSeed + 9.0)) * 0.5 + 0.5;
    float fray = smoothstep(1.0 - uWisp * 0.55, 1.0, vU);
    if (fray * (0.4 + 0.9 * tear) > 0.55) discard;
    // Tears apart on noise when it goes.
    float dn = snoise(vLocal * 1.4 + uSeed) * 0.5 + 0.5;
    float keep = smoothstep(uDissolve * 1.1 - 0.06, uDissolve * 1.1 + 0.06, dn);
    if (keep < 0.01) discard;
    float cut = smoothstep(0.72, 0.98, vV);   // outer cutting edge
    float spine = smoothstep(0.14, 0.0, vV);  // inner edge
    vec3 N = vNormalW / max(1e-4, length(vNormalW));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 2.0) * uFresnel;
    // Four-stop ramp: the mass is deep teal, streaks lift it to saturated teal,
    // the cutting edge climbs through mint to white.
    float h = clamp(0.06 + 0.32 * streak + 0.75 * cut * cut, 0.0, 1.0);
    vec3 col = gradient4(uColorDeep, uColorBody, uColorTint, uColorCore, h);
    col *= mix(0.5, 1.0, clamp(streak * 0.7 + cut, 0.0, 1.0));
    vec3 glow = (uColorCore * cut * cut * uEdge * (0.75 + 0.5 * streak)
               + uColorTint * spine * 0.5 * uEdge * 0.4
               + uColorBody * fres * 0.6
               + uColorTint * streak * uStreak * 0.25) * uShaderIntensity;
    // Burning in at the edge as it dissolves.
    float burn = smoothstep(uDissolve * 1.1 + 0.16, uDissolve * 1.1 + 0.04, dn) * step(0.01, uDissolve);
    glow += uColorTint * burn * 1.2 * uShaderIntensity;
    float alpha = uOpacity * (0.78 + 0.22 * streak) * (1.0 - 0.5 * fray) * smoothstep(0.0, 0.04, vU);
    alpha = max(alpha, cut * keep);
    gl_FragColor = vec4((col + glow) * uGlobalGlow, clamp(alpha * keep, 0.0, 1.0));
  }
`;

/**
 * One scythe sweep of shearing air — the hero of the upgraded cast. A thin,
 * dark-teal crescent (deep body, saturated streaks racing along it) with a
 * hot white cutting edge and a mint spine; the trailing horn frays into
 * wisps, the blade shivers, and it tears apart on noise with a burning rim
 * when it goes. Its size (span, sag, bow, thickness) is applied in the vertex
 * stage from the live settings. Normal blending so the deep tone carries mass.
 */
export function createCrosscutBladeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHalfSpan: { value: 2 },
      uSag: { value: 1 },
      uBow: { value: 0.5 },
      uThick: { value: 0.15 },
      uRipple: { value: 0.03 },
      uOpacity: { value: 0.9 },
      uEdge: { value: 2 },
      uStreak: { value: 1 },
      uFlow: { value: 5 },
      uDissolve: { value: 0 },
      uFresnel: { value: 1 },
      uWisp: { value: 0.6 },
      uSeed: { value: 0 },
      uColorCore: { value: new Color() },
      uColorTint: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: BLADE_VERTEX,
    fragmentShader: /* glsl */ `${commonGLSL}\n${BLADE_FRAGMENT}`
  });
  material.userData.sync = (dissolve, seed, grow = 1) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    const span = Math.max(0.2, c.frontWidth) * grow;
    u.uHalfSpan.value = span * 0.5;
    u.uSag.value = Math.max(0.05, c.frontHeight) * grow;
    u.uBow.value = c.frontDepth * span;
    u.uThick.value = c.bladeThickness * grow;
    u.uRipple.value = c.frontFlutter * g.turbulence;
    u.uOpacity.value = c.frontOpacity * g.opacity;
    u.uEdge.value = c.bladeEdge * g.glow;
    u.uStreak.value = c.windStreaks * g.glow;
    u.uFlow.value = c.frontFlow * g.animationSpeed;
    u.uDissolve.value = dissolve;
    u.uFresnel.value = c.windFresnel * g.fresnel;
    u.uWisp.value = c.bladeWisp;
    u.uSeed.value = seed;
    u.uColorCore.value.copy(getColor(c.colorWindCore));
    u.uColorTint.value.copy(getColor(c.colorWindTint));
    u.uColorBody.value.copy(getColor(c.colorWindBody));
    u.uColorDeep.value.copy(getColor(c.colorWindDeep));
  };
  return material;
}

/**
 * The debris the blades tear up: turf clods, soil and grit. Matter, so a
 * MeshStandardMaterial lit by the scene sun (vertex colours give each clod a
 * grassy top and a soil underside; instance colours vary turf / soil / grit),
 * with a faint teal emissive so the dark chunks still separate from the dark
 * floor. The owner puts it on LAYER.WORLD and lets it cast shadows.
 */
export function createCrosscutDebrisMaterial() {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    flatShading: true
  });
  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    material.emissive.copy(getColor(c.colorWindDeep)).lerp(getColor(c.colorWindBody), 0.25);
    material.emissiveIntensity = c.debrisGlow * g.glow;
  };
  return material;
}
