import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'clangor';

/**
 * Clangor Cage — four shaders, none of them shared.
 *
 * Body placement is the seal read (Sound — bars of clangor drop and ring the circle inward).
 * The fragment field is sound-specific (f 5.00 / 2.08, speed 1.01),
 * then carved by this spell's own mask. The lens writes distortion
 * (direction in RG around 0.5, strength in B, coverage in A). The ground
 * pattern belongs to sound, not to a shared stamp. The voice is a
 * second placement — chord — so the cast has a layer that
 * is not the body. Every uniform is filled from settings.clangor each frame.
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
    
    vec3 wall = uCenter + radial * uRadius + tangent * lat;
    wall.y = v * uHeight * uGrow;
    float cap = smoothstep(0.78, 1.0, v);
    vec3 lid = uCenter + radial * uRadius * (1.0 - 0.85 * uOpen);
    lid.y = uHeight * uGrow;
    p = mix(wall, lid, cap);
  
  

    // flared bell ribs
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
    float field = abs(fract(length(vUv - 0.5) * 5.00 - uTime * 2.08) - 0.5);
    float carved = pow(clamp(field, 0.0, 1.0), 1.70);
    vec3 col = mix(uColorC, uColorB, carved);
    col += uColorA * pow(clamp(carved, 0.0, 1.0), 3.0) * uEdge;
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
    vec2 raw = vUv - 0.5; float len = length(raw); vec2 dir = len < 0.001 ? vec2(1.0, 0.0) : raw / len;
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
    float pat = smoothstep(0.08, 0.0, abs(fract(rad * 9.0 - uTime * 0.80) - 0.5));
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
    float band = 0.5 + 0.5 * sin(vLocal * 5.00 + uTime * 1.01 + uSeed);
    float grain = snoise01(vWorld * 2.08 + vec3(uSeed, uTime * 0.30, 0.0));
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
    float pat = clamp(abs(sin(vWorld.y * 18.0 - uTime * 6.0)), 0.0, 1.0);
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

export function createClangorCageBodyMaterial() {
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

export function createClangorCageLensMaterial() {
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

export function createClangorCageGroundMaterial() {
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

export function createClangorCageVoiceMaterial() {
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
 * sound is energy: emissive over a dark body, normal-blended and
 * depth-writing, on LAYER.VFX.
 */
export function createClangorCageDetailMaterial(rig = false) {
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

/* -------------------------------------------------------------------- */
/* The bell cage — cast-local hero shaders                               */
/* -------------------------------------------------------------------- */

/**
 * The chime tubes and the hoop: lit bell-bronze. A dark olive patina body
 * (deep → body by a noise patina), lit by the scene sun with a warm metal
 * glint and a sky fill, so on the dark floor it reads as heavy cast metal.
 * When a tube is struck its strike band runs white-hot through lime and the
 * whole tube flexes in its first mode (pinned at the floor and at the hoop),
 * the swing decaying with the ring. Per instance `aTube` = (seed, ring
 * amplitude 0..1, heat 0..1, sink 0..1).
 */
const TUBE_VERTEX = /* glsl */ `
  attribute vec4 aTube;
  uniform float uTime;
  uniform float uFlex;
  uniform float uRate;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec4 vTube;
  void main() {
    vec3 p = position;
    float h = clamp(p.y, 0.0, 1.0);
    // First bending mode: pinned at both ends, widest at mid-height.
    float mode = sin(3.14159 * h);
    float wob = sin(uTime * uRate + aTube.x * 6.2831) * aTube.y;
    vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vec3 side = normalize(mat3(modelMatrix * instanceMatrix) * vec3(1.0, 0.0, 0.0));
    world.xyz += side * mode * wob * uFlex;
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vLocal = position;
    vTube = aTube;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const TUBE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform vec3  uDeep;
  uniform vec3  uBody;
  uniform vec3  uTint;
  uniform vec3  uHot;
  uniform vec3  uGlowColor;
  uniform float uSpecular;
  uniform float uRimGlow;
  uniform float uBandAt;
  uniform float uBandGlow;
  uniform float uRingGlow;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec4 vTube;

  ${noiseGLSL}

  void main() {
    float h = clamp(vLocal.y, 0.0, 1.0);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndl = max(dot(N, L), 0.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // Bell-bronze under a patina: dark, mottled, a little brighter where worn.
    float patina = snoise01(vec3(vLocal.x * 5.0 + vTube.x, h * 14.0, vLocal.z * 5.0));
    float wear = smoothstep(0.55, 0.85, snoise01(vec3(h * 3.0, vTube.x * 3.1, vLocal.x * 2.0)));
    vec3 albedo = mix(uDeep, uBody, 0.35 + 0.5 * patina);
    albedo = mix(albedo, uTint * 0.4, wear * 0.2);
    vec3 color = albedo * (0.22 + 1.05 * ndl);
    color += albedo * 0.35 * (0.5 + 0.5 * N.y);
    // Warm metal glint and a long anisotropic streak down the tube.
    float spec = pow(max(dot(N, H), 0.0), 48.0);
    color += vec3(1.0, 0.95, 0.82) * spec * uSpecular;
    color += uTint * pow(1.0 - ndv, 3.0) * uRimGlow * 0.6;

    // Ringing: the whole tube hums lime while it rings, strongest at the belly.
    float ring = vTube.y;
    float belly = sin(3.14159 * h);
    float shimmer = 0.6 + 0.4 * sin(h * 40.0 - uTime * 30.0);
    // Confined to the silhouette, so the dark bronze carries the mass.
    color += uGlowColor * ring * belly * shimmer * uRingGlow * pow(1.0 - ndv, 2.5) * uGlobalGlow;
    // The strike band: white-hot on the strike, cooling through lime to dark.
    float band = 1.0 - smoothstep(0.0, 0.035, abs(h - uBandAt));
    float heat = vTube.z;
    color += mix(uGlowColor, uHot, heat) * band * heat * uBandGlow * uGlobalGlow;
    // Foot heat where it was driven into the floor.
    float foot = 1.0 - smoothstep(0.0, 0.08, h);
    color += mix(uTint, uGlowColor, 0.4) * foot * heat * 0.35 * uGlobalGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createClangorTubeMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uDeep: { value: new Color() },
      uBody: { value: new Color() },
      uTint: { value: new Color() },
      uHot: { value: new Color() },
      uGlowColor: { value: new Color() },
      uSpecular: { value: 1 },
      uRimGlow: { value: 0.5 },
      uBandAt: { value: 0.78 },
      uBandGlow: { value: 2 },
      uRingGlow: { value: 1 },
      uFlex: { value: 0.1 },
      uRate: { value: 40 }
    }),
    vertexShader: TUBE_VERTEX,
    fragmentShader: TUBE_FRAGMENT
  });
  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uDeep.value.copy(getColor(c.colorTubeDeep));
    u.uBody.value.copy(getColor(c.colorTubeBody));
    u.uTint.value.copy(getColor(c.colorTubeTint));
    u.uHot.value.copy(getColor(c.colorTubeHot));
    u.uGlowColor.value.copy(getColor(c.colorTubeGlow));
    u.uSpecular.value = c.tubeSpecular;
    u.uRimGlow.value = c.tubeRimGlow * g.fresnel;
    u.uBandAt.value = c.tubeBandAt;
    u.uBandGlow.value = c.tubeBandGlow * g.shaderIntensity;
    u.uRingGlow.value = c.tubeRingGlow * g.shaderIntensity;
    u.uFlex.value = c.tubeFlex;
    u.uRate.value = c.tubeRingRate * g.animationSpeed;
  };
  return material;
}

/**
 * The pressure floor: a filled, dark pan of struck air inside the cage. Broad
 * pressure waves roll inward from the ring to the centre (the cage "rings the
 * circle inward"), shaded as a heightfield lit by the sun so the crests catch
 * light and the troughs fall to the deep tone; every clang throws its own
 * filled swell in from the struck tube's foot. Normal blending, so the dark
 * reads on the floor; it frays out on noise as it closes.
 */
const FLOOR_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uHalf;
  uniform float uRing;
  uniform float uSince;
  uniform float uOpen;
  uniform float uErode;
  uniform float uOpacity;
  uniform float uWaveLen;
  uniform float uWaveSpeed;
  uniform float uSwell;
  uniform float uGlow;
  uniform vec4  uClang[6];
  uniform vec3  uDeep;
  uniform vec3  uBody;
  uniform vec3  uTint;
  uniform vec3  uHot;
  varying vec2 vUv;

  ${noiseGLSL}

  float field(vec2 p) {
    float r = length(p);
    float a = atan(p.y, p.x);
    float warp = snoise(vec3(p * 0.45, uTime * 0.3)) * 0.35;
    // Inward-rolling pressure waves.
    float w = 0.5 + 0.5 * cos(6.2831 * (r + warp + uSince * uWaveSpeed) / uWaveLen);
    w *= smoothstep(0.0, uRing * 0.35, r);
    float h = w * 0.55;
    // Each clang's swell, rolling in from its foot.
    for (int i = 0; i < 6; i++) {
      vec4 k = uClang[i];
      if (k.w <= 0.0) continue;
      float age = uSince - k.z;
      if (age < 0.0) continue;
      float d = length(p - k.xy);
      float front = age * uWaveSpeed * 2.2;
      float band = exp(-pow((d - front) / (0.55 + age * 0.6), 2.0));
      h += band * k.w * exp(-age * 2.2) * uSwell;
    }
    return h;
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0 * uHalf;
    float r = length(p);
    float reach = uRing * uOpen;
    float inside = 1.0 - smoothstep(reach - 0.15, reach + 0.6, r);
    if (inside <= 0.001) discard;
    float n = snoise01(vec3(p * 0.9, 3.7));
    float erode = 1.0 - smoothstep(uErode - 0.1, uErode + 0.05, n);
    float alpha = inside * (1.0 - erode) * uOpacity;
    if (alpha <= 0.002) discard;

    float h = field(p);
    float e = 0.08;
    float hx = field(p + vec2(e, 0.0)) - h;
    float hz = field(p + vec2(0.0, e)) - h;
    vec3 N = normalize(vec3(-hx / e * 0.35, 1.0, -hz / e * 0.35));
    float ndl = max(dot(N, normalize(uLightDir)), 0.0);
    float grit = snoise01(vec3(p * 3.0, 1.3));
    vec3 col = mix(uDeep, uBody, clamp(h * 0.9, 0.0, 1.0)) * (0.45 + 0.9 * ndl) * (0.8 + 0.4 * grit);
    // Crests catch the ring's own light.
    col += uTint * pow(clamp(h, 0.0, 1.5), 3.0) * uGlow * 0.6 * uGlobalGlow;
    // A hot lip where the cage stands.
    float lip = exp(-pow((r - uRing) / 0.35, 2.0)) * uOpen;
    // The lip under the feet is heaved dark floor, not light.
    col = mix(col, uDeep, lip * 0.6);
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createClangorFloorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHalf: { value: 5 },
      uRing: { value: 4 },
      uSince: { value: 0 },
      uOpen: { value: 0 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uWaveLen: { value: 1.4 },
      uWaveSpeed: { value: 1.5 },
      uSwell: { value: 1 },
      uGlow: { value: 1 },
      uClang: { value: Array.from({ length: 6 }, () => new Vector4()) },
      uDeep: { value: new Color() },
      uBody: { value: new Color() },
      uTint: { value: new Color() },
      uHot: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });
  material.userData.sync = (half, ring, since, open, erode) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHalf.value = half;
    u.uRing.value = ring;
    u.uSince.value = since;
    u.uOpen.value = open;
    u.uErode.value = erode;
    u.uOpacity.value = c.floorOpacity * g.opacity;
    u.uWaveLen.value = Math.max(0.2, c.floorWaveLength);
    u.uWaveSpeed.value = c.floorWaveSpeed;
    u.uSwell.value = c.floorSwell;
    u.uGlow.value = c.floorGlow * g.glow;
    u.uDeep.value.copy(getColor(c.colorFloorDeep));
    u.uBody.value.copy(getColor(c.colorFloorBody));
    u.uTint.value.copy(getColor(c.colorTubeGlow));
    u.uHot.value.copy(getColor(c.colorTubeHot));
  };
  return material;
}
