import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'eventcage';

/**
 * Event Cage — four shaders, none of them shared.
 *
 * Body placement is the seal read (Void — event bars drop and erase inward toward a missing centre).
 * The fragment field is void-specific (f 9.00 / 2.08, speed 1.89),
 * then carved by this spell's own mask. The lens writes distortion
 * (direction in RG around 0.5, strength in B, coverage in A). The ground
 * pattern belongs to void, not to a shared stamp. The voice is a
 * second placement — chord — so the cast has a layer that
 * is not the body. Every uniform is filled from settings.eventcage each frame.
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
  
  

    // inward event horizon hooks
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
    float field = smoothstep(0.15, 0.85, length(vUv - 0.5) + 0.25 * sin(uTime * 2.08 + vLocal * 9.00));
    float carved = pow(clamp(field, 0.0, 1.0), 1.70);
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
    float band = 0.5 + 0.5 * sin(vLocal * 9.00 + uTime * 1.89 + uSeed);
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

export function createEventCageBodyMaterial() {
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

export function createEventCageLensMaterial() {
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

export function createEventCageGroundMaterial() {
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

export function createEventCageVoiceMaterial() {
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
export function createEventCageDetailMaterial(rig = false) {
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
/* The cage itself — cast-local hero shaders                             */
/* -------------------------------------------------------------------- */

/**
 * The bars and the lintel: lit void-glass. A near-black violet body, sun-lit
 * (key light + sky fill + a hard specular glint, so it reads as a solid on the
 * floor), a violet fresnel rim, a column of "event" notches that tick on in
 * order up each bar, and an erase front that eats the bar from the top down
 * with a white-hot cut edge. Per bar: `aBar` = (seed, erase 0..1, heat 0..1,
 * the notch clock). Opaque, on LAYER.SHAPED so it casts the sun's shadow.
 */
const BAR_VERTEX = /* glsl */ `
  attribute vec4 aBar;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec4 vBar;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec4 world = m * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(m) * normal);
    vLocal = position;
    vBar = aBar;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BAR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform vec3  uDeep;
  uniform vec3  uBody;
  uniform vec3  uRim;
  uniform vec3  uHot;
  uniform float uRimGlow;
  uniform float uSpecular;
  uniform float uNotches;
  uniform float uNotchGlow;
  uniform float uHeatGlow;
  uniform float uCutWidth;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec4 vBar;

  ${noiseGLSL}

  void main() {
    float h = clamp(vLocal.y, 0.0, 1.0);
    float n = snoise(vec3(vLocal.x * 7.0, h * 9.0, vBar.x * 13.0));
    // Erased from the top down: what is left is everything below the cut.
    float cut = 1.04 - vBar.y * 1.12 + n * 0.05;
    if (h > cut) discard;
    float edge = 1.0 - smoothstep(0.0, uCutWidth, cut - h);

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndl = max(dot(N, L), 0.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // Glassy obsidian strata: deep with a little body colour in the veins.
    float strata = smoothstep(0.35, 0.95, snoise01(vec3(h * 3.0, vLocal.x * 2.0 + vLocal.z * 2.0, vBar.x)));
    vec3 albedo = mix(uDeep, uBody, 0.35 + 0.65 * strata);
    vec3 color = albedo * (0.28 + 1.1 * ndl);
    color += albedo * 0.25 * (0.5 + 0.5 * N.y);
    color += mix(uRim, vec3(1.0), 0.4) * pow(max(dot(N, H), 0.0), 70.0) * uSpecular;
    // Violet rim — the horizon glow round every edge.
    color += uRim * pow(1.0 - ndv, 3.0) * uRimGlow * uGlobalGlow;

    // Event notches: a column of ticks up the bar that light in order with the
    // bar's clock (aBar.w), the newest one hottest.
    float row = floor(h * uNotches);
    float inRow = fract(h * uNotches);
    float tick = smoothstep(0.62, 0.7, inRow) * (1.0 - smoothstep(0.86, 0.94, inRow));
    float face = smoothstep(0.25, 0.05, abs(vLocal.x)) + smoothstep(0.25, 0.05, abs(vLocal.z));
    float lit = step(row, vBar.w * uNotches);
    float newest = exp(-max(vBar.w * uNotches - row, 0.0) * 1.2);
    color += mix(uRim, uHot, newest) * tick * min(face, 1.0) * lit * uNotchGlow * (0.4 + newest) * uGlobalGlow;

    // Slam heat at the foot, cooling.
    float foot = 1.0 - smoothstep(0.0, 0.3, h);
    color += mix(uRim, uHot, foot) * vBar.z * foot * uHeatGlow * uGlobalGlow;

    // The erase front burns white, then violet, then into the dark.
    color = mix(color, uHot * 2.4 * uGlobalGlow, edge * edge);
    color += uRim * edge * 1.5 * uGlobalGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createEventCageBarMaterial() {
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
      uSpecular: { value: 1 },
      uNotches: { value: 12 },
      uNotchGlow: { value: 1 },
      uHeatGlow: { value: 1 },
      uCutWidth: { value: 0.08 }
    }),
    vertexShader: BAR_VERTEX,
    fragmentShader: BAR_FRAGMENT
  });
  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uDeep.value.copy(getColor(c.colorCageDeep));
    u.uBody.value.copy(getColor(c.colorCageBody));
    u.uRim.value.copy(getColor(c.colorCageRim));
    u.uHot.value.copy(getColor(c.colorCageHot));
    u.uRimGlow.value = c.cageRimGlow * g.fresnel;
    u.uSpecular.value = c.cageSpecular;
    u.uNotches.value = Math.max(1, Math.round(c.cageNotches));
    u.uNotchGlow.value = c.cageNotchGlow * g.shaderIntensity;
    u.uHeatGlow.value = c.cageHeat;
    u.uCutWidth.value = Math.max(0.005, c.cageCutWidth);
  };
  return material;
}

/**
 * The thrown event: a black urchin of void with a burning violet horizon. A
 * sphere carrier pushed out into slow-churning spikes in the vertex stage.
 */
const SEED_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSpikes;
  uniform float uSeed;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vSpike;
  ${noiseGLSL}
  void main() {
    vec3 n = normalize(position);
    float s = snoise(n * 2.6 + vec3(uTime * 1.7, uSeed, -uTime * 1.1));
    float spike = pow(max(s, 0.0), 2.0);
    vec3 p = position * (1.0 + uSpikes * spike * 2.2);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vSpike = spike;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SEED_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uGlobalGlow;
  uniform vec3 uDeep;
  uniform vec3 uRim;
  uniform vec3 uHot;
  uniform float uGlow;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vSpike;
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    float f = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.2);
    vec3 color = uDeep;
    color += uRim * f * 1.6 * uGlow * uGlobalGlow;
    color += uHot * pow(f, 4.0) * 2.0 * uGlow * uGlobalGlow;
    color += uRim * vSpike * 0.8 * uGlow * uGlobalGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createEventCageSeedMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSpikes: { value: 0.3 },
      uSeed: { value: 0 },
      uGlow: { value: 1 },
      uDeep: { value: new Color() },
      uRim: { value: new Color() },
      uHot: { value: new Color() }
    }),
    vertexShader: SEED_VERTEX,
    fragmentShader: SEED_FRAGMENT
  });
  material.userData.sync = (seed) => {
    const c = settings[ID];
    const u = material.uniforms;
    u.uSpikes.value = c.seedSpikes;
    u.uSeed.value = seed;
    u.uGlow.value = c.seedGlow * settings.global.glow;
    u.uDeep.value.copy(getColor(c.colorPitDeep));
    u.uRim.value.copy(getColor(c.colorCageRim));
    u.uHot.value.copy(getColor(c.colorCageHot));
  };
  return material;
}

/**
 * The missing centre: a filled hole in the floor. Black inside, with faint
 * spiral streaks crawling inward (it drains), a hot horizon lip, and a dark
 * violet skirt beyond it that pulls the floor in toward the lip.
 */
const PIT_VERTEX = /* glsl */ `
  varying vec2 vXZ;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vXZ = position.xy;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PIT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uOuter;     // metres the quad spans from the centre
  uniform float uPit;       // hole radius, metres
  uniform float uLip;       // lip width, metres
  uniform float uSkirt;     // skirt reach beyond the lip, × the hole
  uniform float uSwirl;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3 uDeep;
  uniform vec3 uLipColor;
  uniform vec3 uHot;
  uniform vec3 uBody;
  varying vec2 vXZ;
  ${noiseGLSL}
  void main() {
    float r = length(vXZ) * 2.0 * uOuter;
    float a = atan(vXZ.y, vXZ.x);
    float pit = max(uPit, 0.001);
    float skirtR = pit * (1.0 + uSkirt);
    if (r > skirtR + uLip) discard;
    // Spiral streaks crawling inward.
    float spiral = sin(a * 5.0 + log(max(r, 0.02)) * 7.0 + uTime * 5.0 * uSwirl + uSeed);
    float grain = snoise(vec3(a * 3.0, r * 2.0 - uTime * 2.5 * uSwirl, uSeed));
    float inside = 1.0 - smoothstep(pit - 0.02, pit + 0.02, r);
    vec3 hole = uDeep + uLipColor * 0.12 * smoothstep(0.2, 1.0, spiral) * pow(r / pit, 2.0);
    // The horizon lip.
    float d = abs(r - pit);
    float lip = 1.0 - smoothstep(0.0, uLip, d);
    vec3 lipCol = mix(uLipColor, uHot, pow(lip, 8.0)) * (1.2 + 0.5 * grain) * uGlow * uGlobalGlow;
    // The skirt: a dark violet floor being pulled toward the lip.
    float t = clamp((r - pit) / max(skirtR - pit, 0.01), 0.0, 1.0);
    float pull = smoothstep(0.1, 0.9, sin(a * 7.0 - log(max(r, 0.02)) * 9.0 + uTime * 6.0 * uSwirl) * 0.5 + 0.5 + grain * 0.3);
    vec3 skirt = mix(uDeep, uBody, 0.35 + 0.4 * pull * (1.0 - t));
    vec3 color = mix(skirt, hole, inside);
    color = mix(color, lipCol, lip);
    float alpha = mix(0.92 * (1.0 - smoothstep(0.7, 1.0, t)), 1.0, inside);
    alpha = max(alpha, lip);
    alpha *= 1.0 - smoothstep(skirtR, skirtR + uLip, r);
    gl_FragColor = vec4(color, alpha * uOpacity);
  }
`;

export function createEventCagePitMaterial() {
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
      uOuter: { value: 1 },
      uPit: { value: 1 },
      uLip: { value: 0.12 },
      uSkirt: { value: 1.5 },
      uSwirl: { value: 1 },
      uGlow: { value: 1 },
      uOpacity: { value: 1 },
      uSeed: { value: 0 },
      uDeep: { value: new Color() },
      uLipColor: { value: new Color() },
      uHot: { value: new Color() },
      uBody: { value: new Color() }
    }),
    vertexShader: PIT_VERTEX,
    fragmentShader: PIT_FRAGMENT
  });
  /** @param {number} outer  @param {number} pit  @param {number} alpha  @param {number} seed */
  material.userData.sync = (outer, pit, alpha, seed) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uOuter.value = outer;
    u.uPit.value = pit;
    u.uLip.value = Math.max(0.01, c.pitLip);
    u.uSkirt.value = c.pitSkirt;
    u.uSwirl.value = c.pitSwirl * g.animationSpeed;
    u.uGlow.value = c.pitGlow * g.glow;
    u.uOpacity.value = c.pitOpacity * g.opacity * alpha;
    u.uSeed.value = seed;
    u.uDeep.value.copy(getColor(c.colorPitDeep));
    u.uLipColor.value.copy(getColor(c.colorPitLip));
    u.uHot.value.copy(getColor(c.colorCageHot));
    u.uBody.value.copy(getColor(c.colorCageBody));
  };
  return material;
}
