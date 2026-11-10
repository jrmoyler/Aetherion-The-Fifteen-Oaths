import { AdditiveBlending, Color, DoubleSide, MeshDepthMaterial, MeshStandardMaterial, NormalBlending, RGBADepthPacking, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { patchOnBeforeCompile } from '../../utils/shaderPatch.js';

const ID = 'presscage';

/**
 * Press Cage — four shaders, none of them shared.
 *
 * Body placement is the crush read (Motion — momentum bars squeeze the circle and spit it upward).
 * The fragment field is motion-specific (f 14.00 / 3.63, speed 1.23),
 * then carved by this spell's own mask. The lens writes distortion
 * (direction in RG around 0.5, strength in B, coverage in A). The ground
 * pattern belongs to motion, not to a shared stamp. The voice is a
 * second placement — chord — so the cast has a layer that
 * is not the body. Every uniform is filled from settings.presscage each frame.
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
  
  

    // opposing piston jaws
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
    float field = abs(fract(vAlong * 4.0 - vLocal * 14.00 + uTime * 3.63) - 0.5);
    float rad = length(vUv - 0.5);
    float ring = abs(fract(rad * 14.00 - uTime * 1.23) - 0.5);
    float carved = smoothstep(0.42, 0.04, ring) + 0.40 * field;
    vec3 col = mix(uColorC, uColorA, vAlong);
    col += uColorB * carved * uEdge * 0.5;
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
    vec2 dir = vec2(vAlong - 0.5, 0.0); dir = length(dir) < 0.001 ? vec2(1.0, 0.0) : normalize(dir);
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
    float pat = smoothstep(0.2, 0.0, abs(fract(rad * 4.0 - uTime * 0.70) - 0.5));
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
    float band = 0.5 + 0.5 * sin(vLocal * 14.00 + uTime * 1.23 + uSeed);
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


/*
 * The hero rig and the pieces are matter: a MeshStandardMaterial lit by the
 * sun, with the fold and the ramp patched in. The same vertex logic goes into
 * the depth material, so the shadow folds with the parts.
 */
const PART_VERTEX_PARS = /* glsl */ `
  attribute float aSeed;
  attribute vec3 aEdge;
  attribute vec4 aInfo;
  attribute vec3 aStyle;
  attribute vec3 aPivot;
  attribute vec4 aHinge;
  uniform float uGrowArt;
  uniform float uOpenArt;
  uniform float uSwing;
  varying vec3 vPartWorld;
  varying vec3 vPartNormal;
  varying vec3 vPartEdge;
  varying vec4 vPartInfo;
  varying vec3 vPartStyle;
  varying float vPartSeed;
  vec3 rotAxis(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
  // Each authored part folds about its own pivot: aInfo.w picks whether it
  // follows the rise (0) or the beat (1), aInfo.z delays it within that.
  float partFold() {
    if (dot(aHinge.xyz, aHinge.xyz) < 0.5) return 0.0;
    float art = mix(uGrowArt, uOpenArt, aInfo.w);
    return smoothstep(aInfo.z, aInfo.z + 0.5, art) * aHinge.w * uSwing;
  }
`;

const PART_NORMAL = /* glsl */ `
  float partAngle = partFold();
  vec3 objectNormal = abs(partAngle) > 1e-4 ? rotAxis(normal, aHinge.xyz, partAngle) : normal;
  {
    vec3 on = objectNormal;
    #ifdef USE_INSTANCING
      mat3 im = mat3(instanceMatrix);
      on /= vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
      on = im * on;
    #endif
    vPartNormal = normalize(mat3(modelMatrix) * on);
  }
`;

const PART_POSITION = /* glsl */ `
  float partSwing = partFold();
  vec3 transformed = abs(partSwing) > 1e-4 ? aPivot + rotAxis(position - aPivot, aHinge.xyz, partSwing) : position;
  {
    vec4 wp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wp = instanceMatrix * wp;
    #endif
    vPartWorld = (modelMatrix * wp).xyz;
  }
  vPartEdge = aEdge;
  vPartInfo = aInfo;
  vPartStyle = aStyle;
  vPartSeed = aSeed;
`;

const PART_FRAGMENT_PARS = /* glsl */ `
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
  varying vec3 vPartWorld;
  varying vec3 vPartNormal;
  varying vec3 vPartEdge;
  varying vec4 vPartInfo;
  varying vec3 vPartStyle;
  varying float vPartSeed;
  vec3 gPartGlow;
  ${noiseGLSL}
`;

/*
 * The ramp, as albedo. The deep stop is not a shadow colour painted on: it is
 * where the form is occluded — the root of every part, the faces that look
 * down — and the sun then lights whatever is left. The light stop only rides
 * the arrises, as a chamfer catching the key light.
 */
const PART_COLOR = /* glsl */ `
  {
    vec3 vWorld = vPartWorld;
    float vSpan = vPartStyle.z;
    float vSeed = vPartSeed;
    vec3 pn = normalize(vPartNormal);
    if (!gl_FrontFacing) pn = -pn;
    vec3 pv = normalize(cameraPosition - vPartWorld);
    float rim = pow(1.0 - abs(dot(pn, pv)), 2.4);
    float pat = clamp(abs(fract(vSpan * 5.0 - uTime * 3.0) - 0.5) * 2.0, 0.0, 1.0);
    float up = pn.y * 0.5 + 0.5;
    float form = clamp(0.18 + 0.5 * vSpan + 0.42 * up, 0.0, 1.0);
    float tint = 0.86 + 0.28 * fract(vPartInfo.y * 0.61803 + vPartInfo.x * 0.37);
    vec3 albedo = mix(uColorC, uColorB, mix(1.0, form, uDeep)) * tint;
    albedo = mix(albedo, uColorC, pat * 0.32 * uDeep);
    albedo *= mix(1.0, 0.5 + 0.5 * smoothstep(0.0, 0.28, vSpan), uDeep);
    // Matter under a real sun: the ramp's body is a pigment, not a light, so it
    // is taken down in value and chroma (Monolith stone is a grey #9a948a).
    albedo = mix(albedo, vec3(dot(albedo, vec3(0.3, 0.59, 0.11))), 0.3) * 0.78;
    float edge = min(min(vPartEdge.x, vPartEdge.y), vPartEdge.z);
    float slope = fwidth(edge) + 1e-4;
    float line = (1.0 - smoothstep(slope * 0.8, slope * 2.2, edge)) * (1.0 - smoothstep(0.14, 0.3, slope)) * vPartStyle.x;
    albedo *= 1.0 + line * clamp(uEdge, 0.0, 1.5) * 0.35;
    diffuseColor.rgb = albedo;
    float breathe = 0.65 + 0.35 * sin(uTime * 3.0 + vPartInfo.x * 1.7);
    gPartGlow = mix(uColorB, uColorA, 0.5) * vPartStyle.y * breathe * uGlow * 1.6;
    gPartGlow += uColorB * rim * uRim * uGlow * 0.22;
    gPartGlow += uColorA * line * uEdge * 0.12;
    if (uDissolve > 0.0) {
      float cut = snoise01(vPartWorld * 1.7 + vec3(vPartSeed * 9.0, 0.0, 0.0));
      if (cut < uDissolve) discard;
      gPartGlow += uColorA * (1.0 - smoothstep(uDissolve, uDissolve + 0.06, cut)) * 2.0;
    }
    if (uOpacity < 0.999 && snoise01(vPartWorld * 2.3 + vec3(vPartSeed * 5.0, 3.1, 0.0)) * 0.9 + 0.05 > uOpacity) discard;
  }
`;

const PART_DEPTH_PARS = /* glsl */ `
  uniform float uOpacity;
  uniform float uDissolve;
  varying vec3 vPartWorld;
  varying float vPartSeed;
  ${noiseGLSL}
`;

const PART_DEPTH_CUT = /* glsl */ `
  if (uDissolve > 0.0 && snoise01(vPartWorld * 1.7 + vec3(vPartSeed * 9.0, 0.0, 0.0)) < uDissolve) discard;
  if (uOpacity < 0.999 && snoise01(vPartWorld * 2.3 + vec3(vPartSeed * 5.0, 3.1, 0.0)) * 0.9 + 0.05 > uOpacity) discard;
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

export function createPressCageBodyMaterial() {
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

export function createPressCageLensMaterial() {
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

export function createPressCageGroundMaterial() {
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

export function createPressCageVoiceMaterial() {
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
 * `rig` true builds the hero rig's material: the same surface, its own look.
 * motion is matter: a MeshStandardMaterial lit by the scene sun,
 * opaque, with the part fold and the four-stop ramp patched in, and a depth
 * material carrying the same fold so the shadow moves with the parts. The
 * owner (RigHero / DetailLayer) puts the mesh on LAYER.SHAPED and lets it cast
 * and receive shadows.
 */
export function createPressCageDetailMaterial(rig = false) {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.6,
    metalness: 0,
    side: DoubleSide
  });
  const uniforms = {
    uTime: frame.uTime,
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
  };
  patchOnBeforeCompile(
    material,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${PART_VERTEX_PARS}`)
        .replace('#include <beginnormal_vertex>', PART_NORMAL)
        .replace('#include <begin_vertex>', PART_POSITION);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${PART_FRAGMENT_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${PART_COLOR}`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += gPartGlow;');
    },
    'codex-solid-presscage'
  );
  // The shadow: the same folded shape, and the same dissolve, in the depth pass.
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide });
  patchOnBeforeCompile(
    depth,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${PART_VERTEX_PARS}`)
        .replace('#include <begin_vertex>', PART_POSITION);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${PART_DEPTH_PARS}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${PART_DEPTH_CUT}`);
    },
    'codex-solid-depth-presscage'
  );
  material.userData.solid = true;
  material.userData.depth = depth;
  material.userData.castShadow = true;
  material.userData.uniforms = uniforms;
  const baseDispose = material.dispose.bind(material);
  material.dispose = () => {
    depth.dispose();
    baseDispose();
  };
  const u = uniforms;
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
    material.roughness = c[k + 'Rough'];
    material.metalness = c[k + 'Metal'];
    material.userData.castShadow = c[k + 'Shadow'] > 0.5;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The press itself — cast-local hero shaders                            */
/* -------------------------------------------------------------------- */

/**
 * The press bars (and the billet they spit): lit, oxidised forged steel. A
 * near-black red body, sun-lit (key + sky fill + a hard specular), a red rim,
 * the inward platen face glowing red-hot with the pressure (`aBar.z`), friction
 * heat at the foot while it skids (`aBar.y`), and an exit dissolve with a hot
 * edge (`aBar.w`). Per instance: `aBar` = (seed, skid heat, press heat, dissolve).
 * Opaque, on LAYER.SHAPED, casting the sun's shadow.
 */
const RAM_VERTEX = /* glsl */ `
  attribute vec4 aBar;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec3 vNormalL;
  varying vec4 vBar;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec4 world = m * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(m) * normal);
    vNormalL = normal;
    vLocal = position;
    vBar = aBar;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RAM_FRAGMENT = /* glsl */ `
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
  uniform float uPressGlow;
  uniform float uSkidGlow;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec3 vNormalL;
  varying vec4 vBar;

  ${noiseGLSL}

  void main() {
    float h = clamp(vLocal.y, 0.0, 1.0);
    float n = snoise(vec3(vLocal.x * 2.0, h * 3.0, vLocal.z * 2.0 + vBar.x * 13.0));
    float cut = vBar.w * 1.15;
    float d = (1.0 - h) * 0.55 + (n * 0.5 + 0.5) * 0.45;
    if (d < cut) discard;
    float edge = (1.0 - smoothstep(0.0, 0.03, d - cut)) * step(0.001, vBar.w);

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormalW);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndl = max(dot(N, L), 0.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // Forged steel, oxidised: dark, with hammered patches of body colour.
    float hammer = snoise01(vec3(vLocal.x * 9.0, h * 14.0, vLocal.z * 9.0 + vBar.x));
    vec3 albedo = mix(uDeep, uBody, 0.2 + 0.55 * hammer);
    vec3 color = albedo * (0.25 + 1.2 * ndl);
    color += albedo * 0.25 * (0.5 + 0.5 * N.y);
    color += mix(uBody, vec3(1.0), 0.55) * pow(max(dot(N, H), 0.0), 60.0) * uSpecular;
    color += uRim * pow(1.0 - ndv, 3.0) * uRimGlow * uGlobalGlow;

    // The platen (local +z face) glows with the pressure, hottest at its middle.
    float platen = smoothstep(0.6, 0.95, vNormalL.z) * smoothstep(0.05, 0.25, h) * (1.0 - smoothstep(0.75, 0.9, h));
    float press = platen * vBar.z * (0.75 + 0.5 * snoise01(vec3(vLocal.x * 4.0, h * 6.0 - uTime * 2.0, vBar.x)));
    color = mix(color, mix(uRim, uHot, smoothstep(0.5, 1.2, press)) * 1.8 * uPressGlow * uGlobalGlow, clamp(press, 0.0, 0.9));

    // Friction heat at the foot while it skids.
    float foot = 1.0 - smoothstep(0.0, 0.22, h);
    color += mix(uRim, uHot, foot * foot) * vBar.y * foot * uSkidGlow * uGlobalGlow;

    color = mix(color, uRim * 1.4 * uGlobalGlow, edge);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createPressCageRamMaterial() {
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
      uRimGlow: { value: 0.4 },
      uSpecular: { value: 0.8 },
      uPressGlow: { value: 1 },
      uSkidGlow: { value: 1 }
    }),
    vertexShader: RAM_VERTEX,
    fragmentShader: RAM_FRAGMENT
  });
  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uDeep.value.copy(getColor(c.colorRamDeep));
    u.uBody.value.copy(getColor(c.colorRamBody));
    u.uRim.value.copy(getColor(c.colorRamRim));
    u.uHot.value.copy(getColor(c.colorRamHot));
    u.uRimGlow.value = c.ramRimGlow * g.fresnel;
    u.uSpecular.value = c.ramSpecular;
    u.uPressGlow.value = c.ramPressGlow * g.shaderIntensity;
    u.uSkidGlow.value = c.ramSkidGlow * g.shaderIntensity;
  };
  return material;
}

/**
 * The press floor: the circle filled with a dark, scoured stain; the gouge
 * each bar ploughs as it skids in (hot just behind the bar, cooling toward
 * where it started); and, once the press has spat, a crushed dent at the
 * centre with hot cracks running out of it.
 */
const SKID_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SKID_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform vec3  uCentre;
  uniform float uOuter;   // metres: the stain's reach
  uniform float uStart;   // metres: where the bars started (the ring)
  uniform float uNow;     // metres: how far in the bars have come (deepest point)
  uniform float uCount;
  uniform float uSpin;
  uniform float uWidth;   // gouge width, metres
  uniform float uHeat;    // 0..1 how hot the fresh gouges are
  uniform float uCrush;   // 0..1 the centre dent
  uniform float uCrushR;  // metres
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3  uDeepC;
  uniform vec3  uBodyC;
  uniform vec3  uRimC;
  uniform vec3  uHotC;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    vec2 q = vWorld.xz - uCentre.xz;
    float r = length(q);
    float x = r / max(uOuter, 0.1);
    if (x > 1.0) discard;
    float a = atan(q.y, q.x);
    float sector = 6.2831853 / max(uCount, 1.0);
    float k = floor((a - uSpin) / sector + 0.5);
    float da = (a - uSpin) - k * sector;
    float lateral = abs(r * sin(da));
    float grain = snoise01(vec3(vWorld.xz * 3.0, uSeed));
    float scuff = snoise01(vec3(vWorld.xz * 0.9, uSeed + 4.0));

    // The scoured stain over the whole circle.
    vec3 color = mix(uDeepC, uBodyC, 0.25 + 0.5 * scuff) * (0.6 + 0.5 * grain);
    float alpha = (1.0 - smoothstep(0.8, 1.0, x)) * (0.55 + 0.3 * scuff);

    // The gouges: a groove from the ring in to where the bar is now.
    float inLane = (1.0 - smoothstep(uWidth * 0.35, uWidth * 0.55, lateral)) * step(0.0, cos(da));
    float along = smoothstep(uNow - 0.15, uNow + 0.05, r) * (1.0 - smoothstep(uStart, uStart + 0.25, r));
    float gouge = inLane * along;
    // The groove floor is dark, its lips catch the light, the fresh end is hot.
    float lip = (1.0 - smoothstep(0.0, 0.08, abs(lateral - uWidth * 0.45))) * along;
    float fresh = exp(-max(r - uNow, 0.0) / 0.9) * uHeat;
    color = mix(color, uDeepC * 0.25, gouge * 0.85);
    color += uBodyC * lip * 0.7 * (0.5 + max(dot(normalize(vec3(q.x, 1.5, q.y)), normalize(uLightDir)), 0.0));
    color += mix(uRimC, uHotC, fresh * fresh) * gouge * fresh * 1.6 * uGlow * uGlobalGlow * (0.7 + 0.5 * grain);
    alpha = max(alpha, gouge * 0.95);

    // The crushed centre: a dark dent with hot cracks running out of it.
    float cr = r / max(uCrushR, 0.05);
    float dent = (1.0 - smoothstep(0.7, 1.0, cr)) * uCrush;
    float crack = 1.0 - smoothstep(0.0, 0.07, abs(snoise(vec3(a * 2.2, r * 0.6, uSeed)) ));
    crack *= (1.0 - smoothstep(0.6, 2.2, cr)) * uCrush;
    color = mix(color, uDeepC * 0.2, dent);
    color += mix(uRimC, uHotC, dent * 0.6) * crack * 1.4 * uHeat * uGlow * uGlobalGlow;
    alpha = max(alpha, dent * 0.95 + crack * 0.6);
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0) * uOpacity);
  }
`;

export function createPressCageSkidMaterial() {
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
      uStart: { value: 1 },
      uNow: { value: 1 },
      uCount: { value: 8 },
      uSpin: { value: 0 },
      uWidth: { value: 0.5 },
      uHeat: { value: 0 },
      uCrush: { value: 0 },
      uCrushR: { value: 1 },
      uGlow: { value: 1 },
      uOpacity: { value: 1 },
      uSeed: { value: 0 },
      uDeepC: { value: new Color() },
      uBodyC: { value: new Color() },
      uRimC: { value: new Color() },
      uHotC: { value: new Color() }
    }),
    vertexShader: SKID_VERTEX,
    fragmentShader: SKID_FRAGMENT
  });
  /** @param {object} p  centre, outer, start, now, count, spin, heat, crush, alpha, seed */
  material.userData.sync = (p) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(p.centre);
    u.uOuter.value = p.outer;
    u.uStart.value = p.start;
    u.uNow.value = p.now;
    u.uCount.value = p.count;
    u.uSpin.value = p.spin;
    u.uWidth.value = c.ramWidth * c.skidWidth;
    u.uHeat.value = p.heat;
    u.uCrush.value = p.crush;
    u.uCrushR.value = c.crushRadius;
    u.uGlow.value = c.skidGlow * g.glow;
    u.uOpacity.value = c.skidOpacity * g.opacity * p.alpha;
    u.uSeed.value = p.seed;
    u.uDeepC.value.copy(getColor(c.colorSkidDeep));
    u.uBodyC.value.copy(getColor(c.colorSkidBody));
    u.uRimC.value.copy(getColor(c.colorRamRim));
    u.uHotC.value.copy(getColor(c.colorRamHot));
  };
  return material;
}
