import { AdditiveBlending, Color, DoubleSide, MeshStandardMaterial, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { patchOnBeforeCompile } from '../../utils/shaderPatch.js';

const ID = 'mirrorhalo';

/**
 * Mirror Halo — four shaders, none of them shared.
 *
 * Body placement is the braid read (Illusion — three mirror rings walk the rim and disagree about where it is).
 * The fragment field is illusion-specific (f 12.00 / 3.32, speed 1.23),
 * then carved by this spell's own mask. The lens writes distortion
 * (direction in RG around 0.5, strength in B, coverage in A). The ground
 * pattern belongs to illusion, not to a shared stamp. The voice is a
 * second placement — crown — so the cast has a layer that
 * is not the body. Every uniform is filled from settings.mirrorhalo each frame.
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


    float cols = max(uCount, 1.0);
    float col = min(floor(u * cols), cols - 1.0);
    float fu = fract(u * cols);
    float ang = (col + 0.5) / cols * 6.2831853 + uSpin;
    float lat = (fu - 0.5) * uThickness;
    vec3 radial = vec3(cos(ang), 0.0, sin(ang));
    vec3 tangent = vec3(-sin(ang), 0.0, cos(ang));
    local = fu;
    
    float flip = mod(col, 2.0) * 2.0 - 1.0;
    p = uCenter + radial * (uRadius + sin(v * 6.0 + uSpin * flip) * uThickness) + tangent * lat;
    p.y = v * uHeight * uGrow;
    p += tangent * sin(v * 9.0 + uSpin * flip) * uOpen * 0.50;
  
  

    // pleated mirror polygon
    vec3 sculptForward = vec3(cos(u*6.2831853+uSpin),0.0,sin(u*6.2831853+uSpin));
    vec3 sculptSide = vec3(-sculptForward.z,0.0,sculptForward.x);
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
    float field = abs(sin(vWorld.x * 12.00 + uTime * 1.23) - sin(vWorld.z * 3.32 - uTime * 1.23));
    float ridge = abs(snoise(vWorld * 3.32 + vec3(uSeed, uTime * 1.23, 0.0)));
    float carved = max(field, ridge);
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
    // A ragged disc that lands from the centre out.
    float reach = rad * (0.84 + 0.3 * rag);
    float lead = reach - uLand;
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


    float ang = u * 6.2831853 + uSpin;
    float rad = uRadius * (0.72 + 0.28 * uGrow);
    p = uCenter + vec3(cos(ang), 0.0, sin(ang)) * rad;
    p.y = uHeight * (0.82 + 0.18 * sin(ang * max(uCount, 1.0))) * uGrow + (v - 0.5) * uThickness;
    local = fract(ang * 0.1591549);
  

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
    float band = 0.5 + 0.5 * sin(vLocal * 12.00 + uTime * 1.23 + uSeed);
    float grain = snoise01(vWorld * 3.32 + vec3(uSeed, uTime * 0.30, 0.0));
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

export function createMirrorHaloBodyMaterial() {
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

export function createMirrorHaloLensMaterial() {
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

export function createMirrorHaloGroundMaterial() {
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

export function createMirrorHaloVoiceMaterial() {
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
export function createMirrorHaloDetailMaterial(rig = false) {
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

/* ------------------------------------------------------------------ */
/* Upgrade pass: mirror glass and the mirror pool                      */
/* ------------------------------------------------------------------ */

const MIRROR_PARS = /* glsl */ `
uniform float uTime; uniform float uRim; uniform float uReflect; uniform float uSweep; uniform float uStreak;
uniform float uFrame; uniform float uCrackGlow; uniform float uPulse;
uniform vec3 uSky; uniform vec3 uEdgeColor; uniform vec3 uRimColor; uniform vec3 uCrackColor; uniform vec3 uDeep;
varying float vEdge; varying vec2 vPane; varying vec3 vMW; varying vec2 vInst;
float mirHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Cell edges of a jittered grid: the crack network across a pane.
float mirCells(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  float d1 = 8.0; float d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 r = o + vec2(mirHash(i + o), mirHash(i + o + 17.3)) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}
// Half width of the cusped outline at height y (matches the geometry).
float mirHalf(float y) { return y < 0.6 ? mix(0.42, 0.5, y / 0.6) : 0.5 * pow(max(0.0, (1.0 - y) / 0.4), 0.8); }
`;

/**
 * The mirror glass, one material for every panel (instanced) and the central
 * shard: a MeshStandardMaterial — sun-lit, shadow-casting, near-black plum
 * glass-metal — patched with this cast's own read of a mirror: a fresnel rim
 * in the spell hue, a fake reflection (the reflected view ray's height mixes
 * the deep tone into a pink sky), a bright streak that sweeps across the
 * panes in world space, a glowing inner frame along the cusped outline, and a
 * per-instance crack network (`aInst.y`) that glows as the ring breaks.
 */
export function createMirrorGlassMaterial() {
  const material = new MeshStandardMaterial({ color: 0x1d0a18, roughness: 0.12, metalness: 0.9, side: DoubleSide });
  const uniforms = {
    uTime: frame.uTime,
    uRim: { value: 1 },
    uReflect: { value: 0.6 },
    uSweep: { value: 0.35 },
    uStreak: { value: 1 },
    uFrame: { value: 2 },
    uCrackGlow: { value: 3 },
    uPulse: { value: 0 },
    uSky: { value: new Color() },
    uEdgeColor: { value: new Color() },
    uRimColor: { value: new Color() },
    uCrackColor: { value: new Color() },
    uDeep: { value: new Color() }
  };
  patchOnBeforeCompile(
    material,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aEdge;\nattribute vec2 aPane;\nattribute vec2 aInst;\nvarying float vEdge;\nvarying vec2 vPane;\nvarying vec3 vMW;\nvarying vec2 vInst;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vEdge = aEdge; vPane = aPane; vInst = aInst;
{
  vec4 mw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  mw = instanceMatrix * mw;
  #endif
  vMW = (modelMatrix * mw).xyz;
}`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${MIRROR_PARS}`)
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
{
  vec3 N = normalize(normal);
  vec3 V = normalize(vViewPosition);
  float ndv = abs(dot(N, V));
  float fres = pow(1.0 - ndv, 3.0);
  // Fake reflection: the reflected ray's height mixes deep floor into pink sky.
  vec3 Rv = reflect(-V, N);
  vec3 refl = mix(uDeep, uSky, smoothstep(-0.25, 0.65, Rv.y));
  // A streak that sweeps across the glass in world space.
  float band = fract((vMW.x * 0.31 + vMW.z * 0.27 + vMW.y * 0.55) * 0.6 - uTime * uSweep);
  float streak = smoothstep(0.07, 0.0, abs(band - 0.5)) * (1.0 - vEdge);
  // The inner frame along the outline, and the bevel walls.
  float px = abs(vPane.x - 0.5);
  float d = min(mirHalf(vPane.y) - px, vPane.y);
  float frameLine = max(vEdge * 0.2, smoothstep(0.018, 0.005, d));
  // Cracks, per instance.
  float crack = vInst.y;
  float cells = mirCells(vPane * vec2(4.0, 5.5) + vInst.x * 13.0);
  float crackLine = smoothstep(0.09 * crack, 0.0, cells) * step(0.01, crack);
  float pulse = 1.0 + uPulse;
  totalEmissiveRadiance += refl * uReflect * (1.0 - vEdge * 0.7);
  totalEmissiveRadiance += uRimColor * fres * uRim * pulse;
  totalEmissiveRadiance += uSky * streak * uStreak;
  totalEmissiveRadiance += uEdgeColor * frameLine * uFrame * pulse * (0.85 + 0.15 * sin(uTime * 6.0 + vMW.y * 3.0));
  totalEmissiveRadiance += uCrackColor * crackLine * uCrackGlow * (0.6 + crack);
}`
        );
    },
    'codex-mirrorhalo-glass'
  );
  material.userData.uniforms = uniforms;
  material.userData.sync = (pulse) => {
    const c = settings[ID];
    const g = settings.global;
    uniforms.uRim.value = c.mirrorRim * g.fresnel;
    uniforms.uReflect.value = c.mirrorReflect;
    uniforms.uSweep.value = c.mirrorSweep * g.animationSpeed;
    uniforms.uStreak.value = c.mirrorStreak * g.glow;
    uniforms.uFrame.value = c.mirrorFrame * g.glow;
    uniforms.uCrackGlow.value = c.crackGlow * g.glow;
    uniforms.uPulse.value = pulse;
    uniforms.uSky.value.copy(getColor(c.colorMirrorSky));
    uniforms.uEdgeColor.value.copy(getColor(c.colorA));
    uniforms.uCrackColor.value.copy(getColor(c.colorCrack));
    uniforms.uRimColor.value.copy(getColor(c.colorMirrorRim));
    uniforms.uDeep.value.copy(getColor(c.colorMirrorFloor));
    material.color.copy(getColor(c.colorMirror));
    material.roughness = c.mirrorRough;
    material.metalness = c.mirrorMetal;
  };
  return material;
}

const POOL_VERTEX = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uLand;
  uniform float uOpen;
  uniform float uHeat;
  uniform float uErode;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uCracks;
  uniform float uRim;     // true rim radius / pool radius
  uniform float uSweep;
  uniform vec3 uSky;
  uniform vec3 uBody;
  uniform vec3 uCrack;
  uniform vec3 uDeep;
  varying vec2 vP;
  ${noiseGLSL}

  void main() {
    float r = length(vP);
    if (r > 1.0 || r > uLand) discard;
    float a = atan(vP.y, vP.x);
    float n = snoise(vec3(vP * 3.0, uSeed));
    // A filled sheet of dark mirror: near-black plum, a cold sheen sliding across it.
    float body = smoothstep(1.0, 0.86, r + n * 0.06);
    float sheen = smoothstep(0.22, 0.0, abs(fract(vP.x * 0.35 + vP.y * 0.55 - uTime * uSweep) - 0.5)) * 0.5;
    float under = exp(-pow((r - uRim) / 0.07, 2.0));   // the wall's foot, where the rim bites the floor
    vec3 col = mix(uDeep, uSky * 0.18, 0.25 + 0.3 * n);
    col += uSky * sheen * 0.35;
    // Radial cracks running out from the centre with uOpen, branching with noise.
    float wob = snoise(vec3(r * 5.0, a * 1.5, uSeed + 2.0)) * 0.18;
    float spoke = abs(fract((a / 6.2831853) * uCracks + wob) - 0.5) * 2.0;
    float crack = smoothstep(0.06, 0.0, spoke * (0.5 + r * 1.5)) * step(r, uOpen);
    float ringCrack = smoothstep(0.03, 0.0, abs(r - uOpen * 0.55 - n * 0.04)) * step(0.05, uOpen) * 0.6;
    float hot = (crack + ringCrack) * uHeat + under * 0.06 * uHeat;
    col += mix(uBody, uCrack, smoothstep(0.4, 1.0, hot)) * hot * uGlow;
    float alpha = body * uOpacity * 0.94;
    float erode = smoothstep(uErode * 1.2 - 0.2, uErode * 1.2, 1.0 - r + n * 0.3);
    alpha *= mix(1.0, erode, step(0.001, uErode));
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * The mirror pool: a filled disc of near-black glass under the circle that
 * lands on the beat, carries a cold sheen, cracks out from the centre as the
 * ring commits and glows where the wall stands, then breaks up from the rim.
 */
export function createMirrorPoolMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uLand: { value: 0 },
      uOpen: { value: 0 },
      uHeat: { value: 1 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uGlow: { value: 1 },
      uCracks: { value: 12 },
      uRim: { value: 0.7 },
      uSweep: { value: 0.3 },
      uSky: { value: new Color() },
      uBody: { value: new Color() },
      uCrack: { value: new Color() },
      uDeep: { value: new Color() }
    }),
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT
  });
  material.userData.sync = (seed, land, open, heat, erode, rim) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = seed;
    u.uLand.value = land;
    u.uOpen.value = open;
    u.uHeat.value = heat;
    u.uErode.value = erode;
    u.uRim.value = rim;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uGlow.value = c.poolGlow * g.glow;
    u.uCracks.value = Math.max(3, Math.round(c.poolCracks));
    u.uSweep.value = c.mirrorSweep * 0.5 * g.animationSpeed;
    u.uSky.value.copy(getColor(c.colorMirrorSky));
    u.uBody.value.copy(getColor(c.colorA));
    u.uCrack.value.copy(getColor(c.colorCrack));
    u.uDeep.value.copy(getColor(c.colorPoolDeep));
  };
  return material;
}
