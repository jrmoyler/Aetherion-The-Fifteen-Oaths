import { AdditiveBlending, Color, DoubleSide, MeshDepthMaterial, MeshStandardMaterial, NormalBlending, RGBADepthPacking, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { patchOnBeforeCompile } from '../../utils/shaderPatch.js';

const ID = 'scarp';

/**
 * Scarp Break — four shaders, none of them shared.
 *
 * Body placement is the topple read (Earth — a scarp face shears up inside the circle and topples outward).
 * The fragment field is earth-specific (f 5.00 / 2.08, speed 1.23),
 * then carved by this spell's own mask. The lens writes distortion
 * (direction in RG around 0.5, strength in B, coverage in A). The ground
 * pattern belongs to earth, not to a shared stamp. The voice is a
 * second placement — crown — so the cast has a layer that
 * is not the body. Every uniform is filled from settings.scarp each frame.
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
    
    p = uCenter + radial * uRadius + tangent * lat;
    p.y = v * uHeight * uGrow;
    p += radial * (v * uOpen * uHeight * 0.55);
  
  

    // broken stratified escarpment
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
    float field = abs(fract(vWorld.y * 5.00 - uTime * 1.23) - 0.5);
    float carved = smoothstep(0.48, 0.04, field);
    vec3 col = mix(uColorC, uColorB, carved);
    col += uColorA * pow(1.0 - clamp(carved, 0.0, 1.0), 2.0) * uEdge * 0.35;
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
    vec2 dir = vec2(0.0, 1.0);
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
    float pat = smoothstep(0.10, 0.0, abs(fract(ang * 8.0 + grain) - 0.5) - 0.38);
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
    float band = 0.5 + 0.5 * sin(vLocal * 5.00 + uTime * 1.23 + uSeed);
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
    float pat = clamp(abs(sin(vWorld.y * 9.0 + vSeed * 20.0)) * 0.6 + snoise01(vWorld * 3.0) * 0.4, 0.0, 1.0);
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
    gPartGlow += uColorA * line * uEdge * 0.06;
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

export function createScarpBreakBodyMaterial() {
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

export function createScarpBreakLensMaterial() {
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

export function createScarpBreakGroundMaterial() {
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

export function createScarpBreakVoiceMaterial() {
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
 * earth is matter: a MeshStandardMaterial lit by the scene sun,
 * opaque, with the part fold and the four-stop ramp patched in, and a depth
 * material carrying the same fold so the shadow moves with the parts. The
 * owner (RigHero / DetailLayer) puts the mesh on LAYER.SHAPED and lets it cast
 * and receive shadows.
 */
export function createScarpBreakDetailMaterial(rig = false) {
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
    'codex-solid-scarp'
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
    'codex-solid-depth-scarp'
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
