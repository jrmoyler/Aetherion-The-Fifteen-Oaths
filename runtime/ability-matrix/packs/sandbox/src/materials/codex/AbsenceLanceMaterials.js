import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'absence';

/**
 * Absence Lance — four shaders, none of them shared.
 *
 * Body placement is the erase read (Void — a lance of absence unmakes the line as it passes).
 * The fragment field is void-specific (f 9.00 / 3.63, speed 0.35),
 * then carved by this spell's own mask. The lens writes distortion
 * (direction in RG around 0.5, strength in B, coverage in A). The ground
 * pattern belongs to void, not to a shared stamp. The voice is a
 * second placement — bore — so the cast has a layer that
 * is not the body. Every uniform is filled from settings.absence each frame.
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


    float s = clamp(uAlong, 0.0, 1.0);
    float tail = smoothstep(0.0, 0.30, s);
    p = uOrigin + uDir * (s * uLength) + uSide * ((u - 0.5) * uThickness * 1.6 * tail);
    p.y = (v - 0.5) * uHeight * 0.32 * tail * uGrow;
    local = s;
  

    // split erasure edge
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
    float field = smoothstep(0.15, 0.85, length(vUv - 0.5) + 0.25 * sin(uTime * 3.63 + vLocal * 9.00));
    float ridge = abs(snoise(vWorld * 3.63 + vec3(uSeed, uTime * 0.35, 0.0)));
    float carved = max(field, ridge);
    vec3 col = mix(uColorC, uColorA, carved) * (0.20 + 0.80 * carved);
    col += uColorB * (1.0 - carved) * 0.25;
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
    vec2 raw = vec2(0.5) - vUv; float len = length(raw); vec2 dir = len < 0.001 ? vec2(1.0, 0.0) : raw / len;
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
    float pat = smoothstep(0.25, 0.05, abs(rad - 0.45)) * grain;
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
    float band = 0.5 + 0.5 * sin(vLocal * 9.00 + uTime * 0.35 + uSeed);
    float grain = snoise01(vWorld * 3.63 + vec3(uSeed, uTime * 0.30, 0.0));
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
    float pat = clamp(smoothstep(0.1, 0.9, 1.0 - rim), 0.0, 1.0);
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

export function createAbsenceLanceBodyMaterial() {
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

export function createAbsenceLanceLensMaterial() {
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

export function createAbsenceLanceGroundMaterial() {
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

export function createAbsenceLanceVoiceMaterial() {
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
 * void is energy: emissive over a dark body, normal-blended and
 * depth-writing, on LAYER.VFX.
 */
export function createAbsenceLanceDetailMaterial(rig = false) {
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

/* ---- the trail: the line cast's wake, along its own erase path (LineTrail.js) ---- */

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
    float off = 0.0;
    vec3 p = uOrigin + uDir * (s * uLength) + uSide * off;
    p.y = 0.32;
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
    float field = smoothstep(0.15, 0.85, length(vUv - 0.5) + 0.25 * sin(uTime * 3.63 + vLocal * 9.00));
    float carved = clamp(field, 0.0, 1.0);
    vec3 col = mix(uColorC, uColorA, carved) * (0.20 + 0.80 * carved);
    col += uColorB * (1.0 - carved) * 0.25;
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
    float off = 0.0;
    vec3 p = uOrigin + uDir * (s * uLength) + uSide * off;
    p.y = 0.32;
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
    float seam = smoothstep(0.12, 0.0, abs(x - 0.55)) * grain;
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
export function createAbsenceLanceTrailMaterial() {
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
export function createAbsenceLanceScarMaterial() {
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

/* -------------------------------------------------------------------- */
/* The lance itself — cast-local hero shaders                            */
/* -------------------------------------------------------------------- */

/**
 * The lance: lit void-obsidian. A near-black violet body with glassy strata,
 * sun-lit (key + sky fill + a hard specular glint) so it reads as a solid
 * spear, a violet fresnel rim, a seam of light up each arris of the cruciform
 * head, and the unmaking: an erase front that eats the lance from the butt
 * to the tip with a white-hot cut edge (`uErase` 0..1 along the axis).
 * Opaque, on LAYER.SHAPED so it casts the sun's shadow. The geometry carries
 * `aAxis` (0 butt .. 1 tip) and `aArris` (1 on the blade edges).
 */
const LANCE_VERTEX = /* glsl */ `
  attribute float aAxis;
  attribute float aArris;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying float vAxis;
  varying float vArris;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vLocal = position;
    vAxis = aAxis;
    vArris = aArris;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const LANCE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform vec3  uDeep;
  uniform vec3  uBody;
  uniform vec3  uRim;
  uniform vec3  uHot;
  uniform float uRimGlow;
  uniform vec3  uCold;
  uniform float uColdRim;
  uniform float uSpecular;
  uniform float uSeam;
  uniform float uErase;
  uniform float uCutWidth;
  uniform float uHeat;
  uniform float uSeed;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying float vAxis;
  varying float vArris;

  ${noiseGLSL}

  void main() {
    float n = snoise(vec3(vLocal.x * 6.0, vAxis * 14.0, vLocal.z * 6.0 + uSeed));
    // Unmade from the butt toward the tip: what is left is everything ahead of the cut.
    float cut = vAxis - (uErase * 1.15 - 0.08) + n * 0.035;
    if (cut < 0.0) discard;
    float edge = 1.0 - smoothstep(0.0, uCutWidth, cut);

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndl = max(dot(N, L), 0.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    float strata = smoothstep(0.3, 0.95, snoise01(vec3(vAxis * 5.0, vLocal.x * 3.0 + vLocal.z * 3.0, uSeed)));
    vec3 albedo = mix(uDeep, uBody, 0.25 + 0.75 * strata);
    vec3 color = albedo * (0.3 + 1.15 * ndl);
    color += albedo * 0.3 * (0.5 + 0.5 * N.y);
    color += mix(uRim, vec3(1.0), 0.45) * pow(max(dot(N, H), 0.0), 80.0) * uSpecular;
    color += uRim * pow(1.0 - ndv, 3.0) * uRimGlow * uGlobalGlow;
    // A cold rim light that lifts the black silhouette off the night floor.
    color += uCold * smoothstep(0.55, 0.95, 1.0 - ndv) * uColdRim * (0.6 + 0.4 * N.y) * uGlobalGlow;
    // A seam of light runs up every arris of the head, brightest at the tip.
    float seam = smoothstep(0.88, 0.99, vArris) * (0.15 + 0.85 * smoothstep(0.6, 0.75, vAxis) + 0.6 * (1.0 - smoothstep(0.1, 0.16, vAxis)));
    color += mix(uRim, uHot, 0.3 * seam) * seam * uSeam * (0.75 + 0.25 * sin(uTime * 9.0 + vAxis * 20.0)) * uGlobalGlow;
    // Heat at the buried tip just after the plant.
    color += uRim * uHeat * smoothstep(0.82, 1.0, vAxis) * uGlobalGlow;

    // The unmaking front burns white, then violet, then into the dark.
    color = mix(color, uHot * 2.2 * uGlobalGlow, edge * edge);
    color += uRim * edge * 1.4 * uGlobalGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createAbsenceLanceSpearMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uDeep: { value: new Color() },
      uBody: { value: new Color() },
      uRim: { value: new Color() },
      uHot: { value: new Color() },
      uRimGlow: { value: 1 },
      uCold: { value: new Color() },
      uColdRim: { value: 1 },
      uSpecular: { value: 1 },
      uSeam: { value: 1 },
      uErase: { value: 0 },
      uCutWidth: { value: 0.05 },
      uHeat: { value: 0 },
      uSeed: { value: 0 }
    }),
    vertexShader: LANCE_VERTEX,
    fragmentShader: LANCE_FRAGMENT
  });
  material.userData.sync = (erase, heat, seed) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uDeep.value.copy(getColor(c.colorLanceDeep));
    u.uBody.value.copy(getColor(c.colorLanceBody));
    u.uRim.value.copy(getColor(c.colorLanceRim));
    u.uHot.value.copy(getColor(c.colorLanceHot));
    u.uRimGlow.value = c.lanceRimGlow * g.fresnel;
    u.uCold.value.copy(getColor(c.colorLanceCold));
    u.uColdRim.value = c.lanceColdRim * g.fresnel;
    u.uSpecular.value = c.lanceSpecular;
    u.uSeam.value = c.lanceSeam * g.shaderIntensity;
    u.uErase.value = erase;
    u.uCutWidth.value = Math.max(0.005, c.lanceCutWidth);
    u.uHeat.value = heat * c.lanceHeat;
    u.uSeed.value = seed;
  };
  return material;
}

/**
 * The unmade line: a filled strip of absence cut into the floor behind the
 * lance. Black at its heart (the floor is simply not there), a crumbling edge
 * that eats into the ground on noise, a thin violet seam along each lip, and
 * faint violet flecks drifting down into it. It opens behind the head and,
 * through the linger, closes from the caster's end toward the lance: the
 * lips draw together into a seam and the seam goes out.
 * The quad is laid along the line: x across (metres), y along (metres from origin).
 */
const TRENCH_VERTEX = /* glsl */ `
  uniform vec2 uSpan;
  varying vec2 vXY;
  void main() {
    vXY = position.xy * uSpan;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRENCH_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uHead;     // metres of line the head has crossed
  uniform float uClosed;   // metres from the origin already closed
  uniform float uCloseSpan;// metres over which a closing lip narrows
  uniform float uWidth;    // half width, metres
  uniform float uOpen;     // 0..1 how far the lips have drawn back just behind the head
  uniform float uSeamGlow;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uSeed;
  uniform vec3  uVoid;
  uniform vec3  uLip;
  uniform vec3  uSeamColor;
  varying vec2 vXY;

  ${noiseGLSL}

  void main() {
    float x = vXY.x;
    float y = vXY.y;
    if (y > uHead) discard;
    float n = fbm3(vec3(x * 1.6, y * 0.9, uSeed));
    float fine = snoise01(vec3(x * 7.0, y * 5.0, uSeed + 4.0));
    // Opens behind the head over the first metre and a half.
    float behind = smoothstep(0.0, 1.5, uHead - y);
    // Closes from the origin toward the head.
    float close = smoothstep(uClosed - uCloseSpan, uClosed, y);
    float hw = uWidth * (0.25 + 0.75 * behind) * close * (0.85 + 0.3 * (n - 0.5) * 2.0);
    float d = abs(x) / max(hw, 0.001);
    if (d > 1.35) discard;
    float hole = 1.0 - smoothstep(0.82, 1.0, d + (fine - 0.5) * 0.18);
    float lip = smoothstep(0.7, 0.95, d) * (1.0 - smoothstep(1.0, 1.3, d));
    vec3 color = mix(uLip, uVoid, hole);
    // A thin violet seam along each lip, flickering.
    float seam = smoothstep(0.88, 0.98, d) * (1.0 - smoothstep(0.98, 1.08, d));
    color += uSeamColor * seam * uSeamGlow * (0.7 + 0.3 * sin(uTime * 7.0 + y * 3.0)) * uGlobalGlow;
    // Faint flecks drifting down into the void.
    float fleck = smoothstep(0.93, 0.99, snoise01(vec3(x * 9.0, y * 4.0 + uTime * 0.8, uTime * 0.6 + uSeed)));
    color += uSeamColor * fleck * hole * 0.6 * uGlobalGlow;
    float alpha = uOpacity * uFade * max(hole, lip * 0.7);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createAbsenceLanceTrenchMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: sharedUniforms({
      uSpan: { value: new Vector2(1, 1) },
      uHead: { value: 0 },
      uClosed: { value: 0 },
      uCloseSpan: { value: 2 },
      uWidth: { value: 0.5 },
      uOpen: { value: 1 },
      uSeamGlow: { value: 1 },
      uOpacity: { value: 1 },
      uFade: { value: 1 },
      uSeed: { value: 0 },
      uVoid: { value: new Color() },
      uLip: { value: new Color() },
      uSeamColor: { value: new Color() }
    }),
    vertexShader: TRENCH_VERTEX,
    fragmentShader: TRENCH_FRAGMENT
  });
  material.userData.sync = (head, closed, fade, seed) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHead.value = head;
    u.uClosed.value = closed;
    u.uCloseSpan.value = Math.max(0.1, c.trenchCloseSpan);
    u.uWidth.value = Math.max(0.02, c.trenchWidth * 0.5);
    u.uSeamGlow.value = c.trenchSeam * g.glow;
    u.uOpacity.value = c.trenchOpacity * g.opacity;
    u.uFade.value = fade;
    u.uSeed.value = seed;
    u.uVoid.value.copy(getColor(c.colorTrenchVoid));
    u.uLip.value.copy(getColor(c.colorTrenchLip));
    u.uSeamColor.value.copy(getColor(c.colorLanceRim));
  };
  return material;
}
