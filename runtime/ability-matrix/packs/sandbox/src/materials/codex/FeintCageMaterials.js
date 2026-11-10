import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'feintcage';

/**
 * Feint Cage — four shaders, none of them shared.
 *
 * Body placement is the crush read (Illusion — a cage and its feint spin opposite ways, and only one of them cuts).
 * The fragment field is illusion-specific (f 6.00 / 1.77, speed 1.45),
 * then carved by this spell's own mask. The lens writes distortion
 * (direction in RG around 0.5, strength in B, coverage in A). The ground
 * pattern belongs to illusion, not to a shared stamp. The voice is a
 * second placement — chord — so the cast has a layer that
 * is not the body. Every uniform is filled from settings.feintcage each frame.
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
    
    float rad = uRadius * (1.0 - 0.55 * uOpen);
    p = uCenter + radial * rad + tangent * lat;
    p.y = mix(uHeight, uHeight * 0.22, uOpen) * v * uGrow;
  
  

    // alternating false buttresses
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
    float field = abs(sin(vWorld.x * 6.00 + uTime * 1.45) - sin(vWorld.z * 1.77 - uTime * 1.45));
    float band = 0.5 + 0.5 * sin(vLocal * 6.00 + uTime * 1.45);
    float carved = band * (0.30 + 0.70 * field);
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


    float ang = u * 6.2831853 - uSpin;
    float rad = uRadius * (0.35 + 0.85 * uOpen);
    p = uCenter + vec3(cos(ang) * rad, (v - 0.5) * uThickness, sin(ang) * rad);
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
    float band = 0.5 + 0.5 * sin(vLocal * 6.00 + uTime * 1.45 + uSeed);
    float grain = snoise01(vWorld * 1.77 + vec3(uSeed, uTime * 0.30, 0.0));
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

export function createFeintCageBodyMaterial() {
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

export function createFeintCageLensMaterial() {
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

export function createFeintCageGroundMaterial() {
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

export function createFeintCageVoiceMaterial() {
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
export function createFeintCageDetailMaterial(rig = false) {
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
/* The cage itself (cast-local signature layers)                       */
/* ------------------------------------------------------------------ */

/**
 * The bars: lacquered dark iron lit by the scene sun, the ramp as albedo
 * (deep → body), light only in the seams (collars, the twist groove) and on
 * the spearhead's cutting faces. Per instance `aBar` = (seed, heat, sink,
 * glitch): heat lights the blades when the real cage cuts, sink eats the bar
 * from the top behind a hot edge, glitch is the feint's breakup.
 *
 * The same shader draws the feint cage with `uGhost` = 1: a dim violet
 * afterimage, translucent (`feintOpacity`) and scan-sliced (whole bands drop
 * out and slide sideways), so the two cages read apart at play distance:
 * the real one solid near-black lacquer, the feint a flicker beside it.
 */
const BAR_VERTEX = /* glsl */ `
  attribute vec4 aBar;
  attribute float aSeam;
  uniform float uTime;
  uniform float uGhost;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec4 vBar;
  varying float vSeam;
  float barHash(float p) { return fract(sin(p * 127.1) * 43758.5453); }
  void main() {
    vec3 p = position;
    // The feint slips: horizontal bands of the bar slide sideways and back.
    float band = floor(p.y * 14.0 + floor(uTime * 9.0) * 3.0);
    float slip = (barHash(band + aBar.x * 17.0) - 0.5) * step(0.72, barHash(band * 1.7 + aBar.x));
    p.x += slip * 1.6 * aBar.w * uGhost;
    mat4 m = modelMatrix * instanceMatrix;
    vec4 world = m * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(m) * normal);
    vLocal = position;
    vBar = aBar;
    vSeam = aSeam;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BAR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uGhost;
  uniform vec3  uDeep;
  uniform vec3  uBody;
  uniform vec3  uSeam;
  uniform vec3  uHot;
  uniform float uSeamGlow;
  uniform float uEdgeGlow;
  uniform float uRimGlow;
  uniform float uSpecular;
  uniform float uPulse;
  uniform float uLit;
  uniform float uGhostAlpha;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec4 vBar;
  varying float vSeam;
  ${noiseGLSL}
  void main() {
    float h = clamp(vLocal.y, 0.0, 1.0);
    // Sink: eaten from the top down behind a hot edge.
    float n = snoise01(vec3(vLocal.x * 6.0, h * 9.0, vLocal.z * 6.0 + vBar.x * 7.0));
    float d = (1.0 - h) * 0.7 + n * 0.3;
    float cut = vBar.z * 1.05;
    if (d < cut) discard;
    float burn = (1.0 - smoothstep(0.0, 0.06, d - cut)) * step(0.001, vBar.z);

    // The feint drops whole scan bands and is holed through as it glitches out.
    float ghost = uGhost;
    float scan = fract(h * 22.0 - uTime * 2.6 + vBar.x);
    if (ghost > 0.5 && scan < 0.18 + 0.5 * vBar.w) discard;
    if (ghost > 0.5 && snoise01(vec3(vLocal.xz * 5.0, h * 12.0 + uTime * 3.0)) < vBar.w * 0.75) discard;

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndl = max(dot(N, L), 0.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    float grain = snoise01(vec3(vLocal.x * 14.0, h * 30.0, vLocal.z * 14.0 + vBar.x));
    vec3 albedo = mix(uDeep, uBody, 0.15 + 0.55 * grain);
    vec3 color = albedo * (0.18 + uLit * ndl);
    color += albedo * 0.2 * (0.5 + 0.5 * N.y);
    color += mix(uBody, vec3(1.0), 0.35) * pow(max(dot(N, H), 0.0), 48.0) * uSpecular;
    float rim = pow(1.0 - ndv, 4.0);
    color += uSeam * rim * uRimGlow * (1.0 + ghost * 0.8) * uGlobalGlow;

    float seamMask = step(0.5, vSeam) * (1.0 - step(1.5, vSeam));
    float blade = step(1.5, vSeam);
    float pulse = 0.75 + 0.25 * sin(uTime * 7.0 + vBar.x * 5.0);
    color += uSeam * seamMask * uSeamGlow * pulse * uPulse * uGlobalGlow;
    // The spearhead: dark steel faces, glowing along their arrises; white-hot when it cuts.
    float arris = pow(1.0 - ndv, 1.5);
    color += mix(uSeam, uHot, vBar.y) * blade * (0.25 + arris) * uEdgeGlow * (0.35 + 1.4 * vBar.y) * uGlobalGlow;
    // Heat climbs the shaft from the blade when it cuts.
    color += uSeam * vBar.y * smoothstep(0.78, 0.9, h) * 0.35 * uGlobalGlow;

    color = mix(color, uHot * 2.0 * uGlobalGlow, burn);
    // The feint is a translucent, scan-sliced afterimage; the real cage is solid.
    float alpha = ghost > 0.5 ? uGhostAlpha * (0.55 + 0.45 * rim) * (1.0 - 0.6 * vBar.w) : 1.0;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createFeintCageBarMaterial(ghost = false) {
  const material = new ShaderMaterial({
    transparent: ghost,
    depthWrite: !ghost,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uGhost: { value: ghost ? 1 : 0 },
      uLit: { value: 0.8 },
      uGhostAlpha: { value: 0.4 },
      uDeep: { value: new Color() },
      uBody: { value: new Color() },
      uSeam: { value: new Color() },
      uHot: { value: new Color() },
      uSeamGlow: { value: 1 },
      uEdgeGlow: { value: 1 },
      uRimGlow: { value: 0.5 },
      uSpecular: { value: 0.7 },
      uPulse: { value: 1 }
    }),
    vertexShader: BAR_VERTEX,
    fragmentShader: BAR_FRAGMENT
  });
  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uDeep.value.copy(getColor(c.colorCageDeep));
    u.uBody.value.copy(getColor(ghost ? c.colorFeintBody : c.colorCageBody));
    u.uSeam.value.copy(getColor(ghost ? c.colorFeintSeam : c.colorCageSeam));
    u.uHot.value.copy(getColor(c.colorCageHot));
    u.uSeamGlow.value = (ghost ? c.feintGlow : c.cageSeamGlow) * g.shaderIntensity;
    u.uEdgeGlow.value = c.cageEdgeGlow * g.shaderIntensity;
    u.uRimGlow.value = c.cageRimGlow * g.fresnel;
    u.uSpecular.value = c.cageSpecular;
    u.uPulse.value = 1 + c.bodyPulse;
    u.uLit.value = c.cageLit;
    u.uGhostAlpha.value = c.feintOpacity * g.opacity;
  };
  return material;
}

/**
 * The cage floor: the circle filled with a dark plum stain; the groove the
 * real cage ploughs as it turns (dark bed, lips catching the light, hot where
 * the feet are now); the feint's ring, a broken phantom dash that only
 * flickers; and, after the cut, a gash per bar from its foot in toward the
 * centre, white-pink at the moment of the cut and cooling to a dark scar.
 */
const CAGE_FLOOR_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CAGE_FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform vec3  uCentre;
  uniform float uOuter;
  uniform float uRing;
  uniform float uFeintRing;
  uniform float uFeint;
  uniform float uCount;
  uniform float uSpin;
  uniform float uGroove;
  uniform float uHeat;
  uniform float uGash;
  uniform float uGashHeat;
  uniform float uLand;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3  uDeepC;
  uniform vec3  uBodyC;
  uniform vec3  uSeamC;
  uniform vec3  uHotC;
  uniform vec3  uFeintC;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    vec2 q = vWorld.xz - uCentre.xz;
    float r = length(q);
    float x = r / max(uOuter, 0.1);
    if (x > 1.0) discard;
    float a = atan(q.y, q.x);
    float grain = snoise01(vec3(vWorld.xz * 2.6, uSeed));
    float mott = snoise01(vec3(vWorld.xz * 0.7, uSeed + 3.0));

    // The stain lands out from the centre and fills the circle.
    float landed = 1.0 - smoothstep(uLand - 0.12, uLand, x);
    vec3 color = mix(uDeepC, uBodyC, 0.2 + 0.6 * mott) * (0.55 + 0.55 * grain);
    float alpha = landed * (1.0 - smoothstep(0.82, 1.0, x + 0.1 * (grain - 0.5))) * (0.72 + 0.25 * mott);

    // The plough groove under the real cage.
    float gd = abs(r - uRing);
    float bed = 1.0 - smoothstep(uGroove * 0.3, uGroove * 0.55, gd);
    float lip = (1.0 - smoothstep(0.0, 0.07, abs(gd - uGroove * 0.5))) * landed;
    color = mix(color, uDeepC * 0.25, bed * 0.85 * landed);
    color += uBodyC * lip * 0.8 * (0.5 + max(dot(normalize(vec3(q.x, 1.4, q.y)), normalize(uLightDir)), 0.0));
    float sector = 6.2831853 / max(uCount, 1.0);
    float k = floor((a - uSpin) / sector + 0.5);
    float da = (a - uSpin) - k * sector;
    float foot = exp(-abs(r * da) * 5.0);
    color += mix(uSeamC, uHotC, foot * uHeat) * bed * foot * uHeat * uGlow * uGlobalGlow * (0.6 + 0.6 * grain);
    alpha = max(alpha, bed * 0.95 * landed);

    // The feint's ring: a phantom dash that flickers, never a groove.
    float fd = abs(r - uFeintRing);
    float dash = step(0.5, fract(a * 6.0 / 3.14159 + uTime * 0.8));
    float flick = 0.6 + 0.4 * sin(uTime * 23.0 + a * 3.0);
    float phantom = (1.0 - smoothstep(0.02, 0.09, fd)) * dash * flick * uFeint;
    color += uFeintC * phantom * 0.8 * uGlow * uGlobalGlow;
    alpha = max(alpha, phantom * 0.7);

    // The cut: a gash from each bar's foot in toward the centre.
    float lateral = abs(r * sin(da)) * step(0.0, cos(da));
    float inward = smoothstep(uRing * 0.12, uRing * 0.3, r) * (1.0 - smoothstep(uRing - 0.05, uRing + 0.1, r));
    float reach = 1.0 - smoothstep(0.0, 0.08, (uRing - r) / max(uRing, 0.1) - uGash);
    float jag = 0.07 + 0.05 * snoise(vec3(r * 3.0, k, uSeed));
    float gash = (1.0 - smoothstep(jag * 0.4, jag, lateral)) * inward * reach * step(0.001, uGash);
    color = mix(color, uDeepC * 0.15, gash * 0.9);
    color += mix(uSeamC, uHotC, uGashHeat) * gash * (0.35 + 1.4 * uGashHeat) * uGlow * uGlobalGlow * (0.5 + 0.7 * grain);
    alpha = max(alpha, gash * 0.95);

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0) * uOpacity);
  }
`;

export function createFeintCageFloorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uOuter: { value: 1 },
      uRing: { value: 1 },
      uFeintRing: { value: 1 },
      uFeint: { value: 0 },
      uCount: { value: 8 },
      uSpin: { value: 0 },
      uGroove: { value: 0.4 },
      uHeat: { value: 0 },
      uGash: { value: 0 },
      uGashHeat: { value: 0 },
      uLand: { value: 0 },
      uGlow: { value: 1 },
      uOpacity: { value: 1 },
      uSeed: { value: 0 },
      uDeepC: { value: new Color() },
      uBodyC: { value: new Color() },
      uSeamC: { value: new Color() },
      uHotC: { value: new Color() },
      uFeintC: { value: new Color() }
    }),
    vertexShader: CAGE_FLOOR_VERTEX,
    fragmentShader: CAGE_FLOOR_FRAGMENT
  });
  /** @param {object} p  centre, outer, ring, feintRing, feint, count, spin, heat, gash, gashHeat, land, alpha, seed */
  material.userData.sync = (p) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(p.centre);
    u.uOuter.value = p.outer;
    u.uRing.value = p.ring;
    u.uFeintRing.value = p.feintRing;
    u.uFeint.value = p.feint;
    u.uCount.value = p.count;
    u.uSpin.value = p.spin;
    u.uGroove.value = c.floorGroove;
    u.uHeat.value = p.heat;
    u.uGash.value = p.gash;
    u.uGashHeat.value = p.gashHeat;
    u.uLand.value = p.land;
    u.uGlow.value = c.floorGlow * g.glow;
    u.uOpacity.value = c.floorOpacity * g.opacity * p.alpha;
    u.uSeed.value = p.seed;
    u.uDeepC.value.copy(getColor(c.colorFloorDeep));
    u.uBodyC.value.copy(getColor(c.colorFloorBody));
    u.uSeamC.value.copy(getColor(c.colorCageSeam));
    u.uHotC.value.copy(getColor(c.colorCageHot));
    u.uFeintC.value.copy(getColor(c.colorFeintSeam));
  };
  return material;
}
