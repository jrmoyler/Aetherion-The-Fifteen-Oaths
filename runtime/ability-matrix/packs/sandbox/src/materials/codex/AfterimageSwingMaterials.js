import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'afterimage';

/**
 * Afterimage Swing — four shaders, none of them shared.
 *
 * Body placement is the return read (Illusion — the swing is the decoy; the blade arrives on the way back).
 * The fragment field is illusion-specific (f 15.00 / 2.39, speed 1.67),
 * then carved by this spell's own mask. The lens writes distortion
 * (direction in RG around 0.5, strength in B, coverage in A). The ground
 * pattern belongs to illusion, not to a shared stamp. The voice is a
 * second placement — bore — so the cast has a layer that
 * is not the body. Every uniform is filled from settings.afterimage each frame.
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
    p = uOrigin + fwd * (uLength * (0.16 + 0.84 * v));
    p.y = uHeight * (0.55 + 0.45 * (1.0 - v)) * uGrow;
    local = v;
  

    // offset echo blade
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
    float field = abs(sin(vWorld.x * 15.00 + uTime * 1.67) - sin(vWorld.z * 2.39 - uTime * 1.67));
    float rad = length(vUv - 0.5);
    float ring = abs(fract(rad * 15.00 - uTime * 1.67) - 0.5);
    float carved = smoothstep(0.42, 0.04, ring) + 0.40 * field;
    vec3 col = mix(uColorA, uColorB, abs(sin(vLocal * 9.0 + uTime)));
    col = mix(col, uColorC, 1.0 - carved);
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
    vec2 dir = normalize(vec2(sin(uTime + vLocal * 4.0), cos(uTime * 0.7)));
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
    float pat = abs(sin(ang * 3.0 + uTime * 0.50)) * smoothstep(1.0, 0.2, rad);
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
    float band = 0.5 + 0.5 * sin(vLocal * 15.00 + uTime * 1.67 + uSeed);
    float grain = snoise01(vWorld * 2.39 + vec3(uSeed, uTime * 0.30, 0.0));
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
    float pat = clamp(abs(sin(vWorld.x * 7.0 + uTime * 3.0) - sin(vWorld.z * 7.0 - uTime * 3.0)), 0.0, 1.0);
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

export function createAfterimageSwingBodyMaterial() {
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

export function createAfterimageSwingLensMaterial() {
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

export function createAfterimageSwingGroundMaterial() {
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

export function createAfterimageSwingVoiceMaterial() {
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
 * illusion is energy: emissive over a dark body, normal-blended and
 * depth-writing, on LAYER.VFX.
 */
export function createAfterimageSwingDetailMaterial(rig = false) {
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

/* ---- the trail: the line cast's wake, along its own return path (LineTrail.js) ---- */

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
    p.y = uHeight * 0.6;
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
    float field = abs(sin(vWorld.x * 15.00 + uTime * 1.67) - sin(vWorld.z * 2.39 - uTime * 1.67));
    float carved = clamp(field, 0.0, 1.0);
    vec3 col = mix(uColorA, uColorB, abs(sin(vLocal * 9.0 + uTime)));
    col = mix(col, uColorC, 1.0 - carved);
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
    p.y = uHeight * 0.6;
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
    float seam = abs(sin(along * 2.0 + uTime)) * smoothstep(0.6, 0.0, x);
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
export function createAfterimageSwingTrailMaterial() {
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
export function createAfterimageSwingScarMaterial() {
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
/* The upgrade: the real blade, its afterimages, the cut, the floor.   */
/* ------------------------------------------------------------------ */

const BLADE_VERTEX = /* glsl */ `
  attribute float aEdge;
  attribute float aAlong;
  attribute vec4  aGhost;    // ghosts only: alpha, flicker seed, chroma shift, shatter 0..1
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vEdge;
  varying float vAlong;
  varying vec4  vGhost;
  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 w = model * vec4(position, 1.0);
    vWorld = w.xyz;
    vLocal = position;
    vEdge = aEdge;
    vAlong = aAlong;
    vGhost = aGhost;
    vNormalW = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const BLADE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uDissolve;   // 0 whole .. 1 shattered away (and the reverse when it forms)
  uniform float uHeat;       // 0..1 how hot the edge runs (the cut)
  uniform float uSpecular;
  uniform float uFresnel;
  uniform float uAmbient;
  uniform float uEdgeGlow;
  uniform float uSheen;      // iridescent sheen across the flat
  uniform vec3  uColorCore;
  uniform vec3  uColorTint;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vEdge;
  varying float vAlong;

  ${noiseGLSL}

  void main() {
    // Shatter along facet cells: whole panes go at once, a hot rim on the break.
    vec2 cell = voronoi2(vLocal.xz * 7.0);
    float dn = cell.y * 0.7 + (snoise(vLocal * 4.0) * 0.5 + 0.5) * 0.3;
    float thr = 1.0 - uDissolve * 1.1;
    if (uDissolve > 0.0 && dn > thr) discard;
    float bite = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.06, thr - dn) : 0.0;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float ndl = max(dot(N, L), 0.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 64.0) * uSpecular;
    float fres = pow(1.0 - abs(dot(N, V)), 2.5) * uFresnel;

    // Dark plum glass: deep in the spine, the saturated body toward the edge.
    float depthT = clamp(1.0 - vEdge * 0.85 + (snoise(vLocal * 6.0) * 0.5 + 0.5) * 0.25, 0.0, 1.0);
    vec3 albedo = mix(uColorBody, uColorDeep, depthT);
    vec3 col = albedo * (uAmbient + ndl * 0.9);
    // Thin-film sheen: the illusion's oil-on-glass shimmer, sliding with the view.
    float film = sin((dot(V, N) * 9.0 + vAlong * 6.0 + uTime * 1.5));
    vec3 sheen = mix(uColorBody, uColorTint, film * 0.5 + 0.5);
    col += sheen * uSheen * pow(1.0 - abs(dot(N, V)), 1.5) * 0.6;
    float blade = step(0.0, vEdge);   // the wrapped grip (vEdge < 0) is dull
    col += uColorTint * spec * mix(0.15, 1.0, blade);
    col += uColorBody * fres * 0.9 * blade;
    // The cutting edge: a white-hot line along the convex rim.
    float rim = smoothstep(0.82, 1.0, vEdge);
    col += mix(uColorBody * 1.4, uColorCore * 1.5, uHeat) * rim * uEdgeGlow * (0.6 + 0.4 * uHeat) * uShaderIntensity;
    col += uColorCore * bite * 2.5;
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

/**
 * The real blade: lit, opaque dark-plum glass (four-stop ramp: white-hot edge
 * → pale pink sheen → saturated magenta body → near-black plum spine), sun
 * diffuse + sharp specular on the facets, an iridescent thin-film sheen at
 * grazing angles and a hot cutting edge. Shatters along facet cells on the
 * exit (`uDissolve`) and forms the same way, reversed, when it appears.
 * `LAYER.WORLD`, casts shadows.
 */
export function createAfterimageBladeMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uDissolve: { value: 0 },
      uHeat: { value: 1 },
      uSpecular: { value: 1.4 },
      uFresnel: { value: 0.9 },
      uAmbient: { value: 0.3 },
      uEdgeGlow: { value: 1.6 },
      uSheen: { value: 0.8 },
      uColorCore: { value: new Color() },
      uColorTint: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: BLADE_VERTEX,
    fragmentShader: BLADE_FRAGMENT
  });
  material.userData.sync = (dissolve, heat) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uDissolve.value = dissolve;
    u.uHeat.value = heat;
    u.uSpecular.value = c.bladeSpecular;
    u.uFresnel.value = c.bladeFresnel * g.fresnel;
    u.uAmbient.value = c.bladeAmbient;
    u.uEdgeGlow.value = c.bladeEdgeGlow * g.glow;
    u.uSheen.value = c.bladeSheen;
    u.uColorCore.value.copy(getColor(c.colorBladeCore));
    u.uColorTint.value.copy(getColor(c.colorBladeTint));
    u.uColorBody.value.copy(getColor(c.colorBladeBody));
    u.uColorDeep.value.copy(getColor(c.colorBladeDeep));
  };
  return material;
}

const GHOST_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uOpacity;
  uniform float uScan;       // scanline density
  uniform vec3  uColorCore;
  uniform vec3  uColorTint;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vEdge;
  varying float vAlong;
  varying vec4  vGhost;

  ${noiseGLSL}

  void main() {
    float alpha = vGhost.x;
    if (alpha < 0.003) discard;
    // Shatter: the ghost breaks into panes that drop out.
    vec2 cell = voronoi2(vLocal.xz * 6.0 + vGhost.y);
    if (vGhost.w > 0.0 && cell.y < vGhost.w * 1.05) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = abs(dot(N, V));
    float fres = pow(1.0 - facing, 2.0);
    // Scanlines sliding along the blade and a stutter: an image, not a thing.
    float scan = 0.55 + 0.45 * sin(vWorld.y * uScan + uTime * 18.0 + vGhost.y * 6.0);
    float stutter = step(0.18, fract(sin(floor(uTime * 14.0 + vGhost.y * 31.0) * 12.9898) * 43758.5));
    float rim = smoothstep(0.78, 1.0, vEdge);
    // A ghost of the plum blade: a dark, see-through plum body, banded by
    // scanlines, with only its cutting edge (and a chromatic fringe) in pink.
    float split = smoothstep(-0.05, 0.05, vLocal.y + (vGhost.z - 0.5) * 0.04);
    vec3 body = mix(uColorDeep, uColorBody * 0.45, fres * 0.8 + (1.0 - scan) * 0.15);
    vec3 edge = mix(uColorBody, uColorTint, split) * rim * 1.5 + uColorCore * rim * rim * 0.6;
    vec3 col = body + edge * uShaderIntensity;
    float a = alpha * uOpacity * (0.55 + 0.45 * stutter) * (0.45 + 0.35 * scan + 0.5 * rim);
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/**
 * The afterimages: ghosts of the plum blade — a dark, see-through plum body
 * (normal blending, so the deep tone reads on the floor) with only the
 * cutting edge in pink, scanlines sliding through it, a stutter, a chromatic
 * split along the edge. Instanced; `aGhost` carries each copy's alpha,
 * flicker seed, split and how far it has shattered.
 */
export function createAfterimageGhostMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uOpacity: { value: 1 },
      uScan: { value: 40 },
      uColorCore: { value: new Color() },
      uColorTint: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: BLADE_VERTEX,
    fragmentShader: GHOST_FRAGMENT
  });
  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uOpacity.value = c.ghostOpacity * g.opacity;
    u.uScan.value = c.ghostScan;
    u.uColorCore.value.copy(getColor(c.colorBladeCore));
    u.uColorTint.value.copy(getColor(c.colorBladeTint));
    u.uColorBody.value.copy(getColor(c.colorBladeBody));
    u.uColorDeep.value.copy(getColor(c.colorBladeDeep));
  };
  return material;
}

const CUT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const CUT_FRAGMENT = /* glsl */ `
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uLead;       // leading angle of the sweep, rad (0 = +x of the quad)
  uniform float uStart;      // angle the sweep began at
  uniform float uAlpha;
  uniform float uInner;      // inner radius 0..1
  uniform vec3  uColorCore;
  uniform vec3  uColorTint;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0 || uAlpha < 0.003) discard;
    float a = atan(vUv.y, vUv.x);
    // Only the arc already swept: from the start angle up to the leading edge.
    float swept = uLead - uStart;
    float into = (a - uStart) * sign(swept);
    float span = abs(swept);
    if (into < 0.0 || into > span) discard;
    float behind = span - into;          // 0 at the leading edge
    float head = exp(-behind * 3.5);
    float band = smoothstep(uInner, uInner + 0.06, r) * (1.0 - smoothstep(0.88, 0.94, r));
    float edge = exp(-pow((r - 0.86) / 0.025, 2.0));
    float streak = 0.6 + 0.4 * snoise(vec3(r * 40.0, behind * 0.6, 3.0));
    // A bright knife-line at the blade's radius, a hot wedge at the leading edge.
    float k = band * (0.15 + 0.85 * head) * streak + edge * (0.55 + 0.45 * head) * 1.6;
    vec3 col = gradient4(uColorDeep, uColorBody, uColorTint, uColorCore, clamp(k * 1.1, 0.0, 1.0));
    gl_FragColor = vec4(col * k * uAlpha * uGlobalGlow * uShaderIntensity, 1.0);
  }
`;

/**
 * The cut: a flat crescent of light swept through the group by the returning
 * blade — only the arc already crossed is drawn, brightest at the leading
 * edge, combed into streaks, a hard white line at the blade's radius.
 * Additive, VFX layer.
 */
export function createAfterimageCutMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uLead: { value: 0 },
      uStart: { value: 0 },
      uAlpha: { value: 0 },
      uInner: { value: 0.45 },
      uColorCore: { value: new Color() },
      uColorTint: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: CUT_VERTEX,
    fragmentShader: /* glsl */ `${commonGLSL}\n${CUT_FRAGMENT}`
  });
  material.userData.sync = (start, lead, alpha) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value = start;
    u.uLead.value = lead;
    u.uAlpha.value = alpha * c.cutOpacity * g.opacity;
    u.uInner.value = c.cutInner;
    u.uColorCore.value.copy(getColor(c.colorBladeCore));
    u.uColorTint.value.copy(getColor(c.colorBladeTint));
    u.uColorBody.value.copy(getColor(c.colorBladeBody));
    u.uColorDeep.value.copy(getColor(c.colorBladeDeep));
  };
  return material;
}

const FLOOR_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  #define MAX_GHOSTS 8
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec4  uEcho[MAX_GHOSTS];  // x, z, strength 0..1, radius
  uniform vec3  uCut;               // end x, z, seconds since the cut (<0 = not yet)
  uniform vec2  uDir;               // cast heading (x, z)
  uniform float uCutRadius;
  uniform float uCutWidth;
  uniform float uCutSpan;           // half-angle of the gash, rad
  uniform float uCutLead;           // the blade's angle on the arc: the gash is open behind it
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uErode;
  uniform vec3  uColorCore;
  uniform vec3  uColorTint;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec2 p = vWorld.xz;
    float cover = 0.0;
    float dark = 0.0;
    float hot = 0.0;
    float sheen = 0.0;
    // Echo footprints: a mirror-dark pool under each afterimage, a pink fringe.
    for (int i = 0; i < MAX_GHOSTS; i++) {
      vec4 E = uEcho[i];
      if (E.z <= 0.001) continue;
      vec2 d = p - E.xy;
      float r = length(d * vec2(1.0, 1.0)) / max(0.05, E.w);
      float pool = 1.0 - smoothstep(0.55, 1.0, r + snoise(vec3(p * 2.5, float(i))) * 0.12);
      float fringe = exp(-pow((r - 0.85) / 0.16, 2.0)) * (0.5 + 0.5 * snoise(vec3(p * 4.0, float(i) + uTime * 0.5)));
      cover = max(cover, pool * 0.9 * E.z);
      dark = max(dark, pool * E.z);
      sheen = max(sheen, (pool * 0.3 + fringe * 0.35) * E.z);
    }
    // The gash: a crescent cut across the line at the end, pointing back up it.
    if (uCut.z >= 0.0) {
      vec2 d = p - uCut.xy;
      vec2 fwd = normalize(uDir);
      vec2 side = vec2(fwd.y, -fwd.x);
      float x = dot(d, side);
      float y = dot(d, fwd);
      // Arc centre sits back up the line, so the crescent bows away from the caster.
      vec2 q = vec2(x, y + uCutRadius);
      float rr = length(q);
      float ang = atan(q.x, q.y);
      // Opened behind the blade as it sweeps, tapering to points at both ends.
      float taper = (1.0 - smoothstep(uCutSpan * 0.6, uCutSpan, abs(ang))) * smoothstep(0.0, 0.08, uCutLead - ang);
      float w = uCutWidth * taper;
      float band = 1.0 - smoothstep(w * 0.3, w, abs(rr - uCutRadius));
      float seam = exp(-pow((rr - uCutRadius) / max(0.01, w * 0.18), 2.0)) * taper;
      float lip = exp(-pow((abs(rr - uCutRadius) - w) / max(0.01, w * 0.4), 2.0)) * taper;
      cover = max(cover, max(band, lip * 0.5));
      dark = max(dark, band);
      hot = max(hot, seam * exp(-uCut.z * 1.2) * 0.7);
      sheen = max(sheen, lip);
    }
    if (cover < 0.01) discard;
    float er = snoise(vec3(p * 1.6, 5.0)) * 0.5 + 0.5;
    if (uErode > 0.0 && er < uErode) discard;
    // Mirror-dark plum, a slow iridescent shimmer in the sheen.
    float shimmer = 0.5 + 0.5 * sin(p.x * 3.0 + p.y * 2.0 + uTime * 2.0);
    vec3 col = mix(uColorBody * 0.2, uColorDeep * 0.35, dark);
    col += mix(uColorBody, uColorTint, shimmer) * sheen * 0.35 * uGlow;
    col += mix(uColorBody * 1.4, uColorCore, hot) * hot * uGlow * 1.4 * uShaderIntensity;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(cover * uOpacity, 0.0, 1.0));
  }
`;

/**
 * The floor: a mirror-dark pool with a pink fringe under every afterimage
 * (fading as the ghost goes), and the gash — a filled crescent cut into the
 * floor across the group, bowed away from the caster, a hot seam that cools
 * and an iridescent lip. Normal blending; erodes on the exit.
 */
export function createAfterimageFloorMaterial() {
  const echo = Array.from({ length: 8 }, () => new Vector4());
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
      uEcho: { value: echo },
      uCut: { value: new Vector3(0, 0, -1) },
      uDir: { value: new Vector3(0, 1, 0) },
      uCutRadius: { value: 2 },
      uCutWidth: { value: 0.3 },
      uCutSpan: { value: 0.8 },
      uCutLead: { value: -10 },
      uOpacity: { value: 1 },
      uGlow: { value: 1 },
      uErode: { value: 0 },
      uColorCore: { value: new Color() },
      uColorTint: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });
  material.userData.sync = (erode, lead) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCutLead.value = lead;
    u.uCutRadius.value = c.gashRadius;
    u.uCutWidth.value = c.gashWidth;
    u.uCutSpan.value = c.gashSpan;
    u.uOpacity.value = c.floorOpacity * g.opacity;
    u.uGlow.value = c.floorGlow * g.glow;
    u.uErode.value = erode;
    u.uColorCore.value.copy(getColor(c.colorBladeCore));
    u.uColorTint.value.copy(getColor(c.colorBladeTint));
    u.uColorBody.value.copy(getColor(c.colorBladeBody));
    u.uColorDeep.value.copy(getColor(c.colorBladeDeep));
  };
  return material;
}
