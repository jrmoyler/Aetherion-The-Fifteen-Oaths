import { AdditiveBlending, Color, DoubleSide, MeshDepthMaterial, MeshStandardMaterial, NormalBlending, RGBADepthPacking, ShaderMaterial, Vector3, Vector4 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { patchOnBeforeCompile } from '../../utils/shaderPatch.js';

const ID = 'slingvolley';

/**
 * Sling Volley — four shaders, none of them shared.
 *
 * Body placement is the plant read (Motion — stones leave on flat slings and arrive still spinning).
 * The fragment field is motion-specific (f 10.00 / 4.25, speed 1.01),
 * then carved by this spell's own mask. The lens writes distortion
 * (direction in RG around 0.5, strength in B, coverage in A). The ground
 * pattern belongs to motion, not to a shared stamp. The voice is a
 * second placement — bore — so the cast has a layer that
 * is not the body. Every uniform is filled from settings.slingvolley each frame.
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


    float n = max(uCount, 1.0);
    float i = min(floor(u * n), n - 1.0);
    float fu = fract(u * n);
    float lane = ((i + 0.5) / n - 0.5) * 2.0 * uRadius;
    float head = clamp(uAlong * n - i, 0.0, 1.0);
    float arc = sin(head * 3.1415926) * uHeight;
    p = uOrigin + uDir * (head * uLength) + uSide * (lane + (fu - 0.5) * uThickness * 2.0);
    p.y = arc * uGrow + v * 0.12;
    local = head;
  

    // spinning sling discs
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
    float field = abs(fract(vAlong * 4.0 - vLocal * 10.00 + uTime * 4.25) - 0.5);
    float carved = pow(clamp(field, 0.0, 1.0), 1.70);
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
    float band = 0.5 + 0.5 * sin(vLocal * 10.00 + uTime * 1.01 + uSeed);
    float grain = snoise01(vWorld * 4.25 + vec3(uSeed, uTime * 0.30, 0.0));
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

export function createSlingVolleyBodyMaterial() {
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

export function createSlingVolleyLensMaterial() {
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

export function createSlingVolleyGroundMaterial() {
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

export function createSlingVolleyVoiceMaterial() {
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
export function createSlingVolleyDetailMaterial(rig = false) {
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
    'codex-solid-slingvolley'
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
    'codex-solid-depth-slingvolley'
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

/* ---- the trail: the line cast's wake, along its own plant path (LineTrail.js) ---- */

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
    float n = max(uLanes, 1.0);
    float offset = ((lane + 0.5) / n - 0.5) * 2.0 * uRadius;
    vec3 p = uOrigin + uDir * (s * uLength) + uSide * offset;
    p.y = sin(s * 3.1415926) * uHeight * 1.0 + 0.12;
    return p;
  }
  float trailPass(float s, float lane) {
    float n = max(uLanes, 1.0); return (lane + s) / n;
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
    float field = abs(fract(vAlong * 4.0 - vLocal * 10.00 + uTime * 4.25) - 0.5);
    float carved = clamp(field, 0.0, 1.0);
    vec3 col = mix(uColorC, uColorA, vAlong);
    col += uColorB * carved * uEdge * 0.5;
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
    float n = max(uLanes, 1.0);
    float offset = ((lane + 0.5) / n - 0.5) * 2.0 * uRadius;
    vec3 p = uOrigin + uDir * (s * uLength) + uSide * offset;
    p.y = sin(s * 3.1415926) * uHeight * 1.0 + 0.12;
    return p;
  }
  float trailPass(float s, float lane) {
    float n = max(uLanes, 1.0); return (lane + s) / n;
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
    float seam = smoothstep(0.1, 0.0, abs(fract(along * 1.5 - uTime * 0.5) - 0.5));
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
export function createSlingVolleyTrailMaterial() {
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
export function createSlingVolleyScarMaterial() {
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
/* The upgrade: lit sling stones, their spin blur, the crater floor.   */
/* ------------------------------------------------------------------ */

const STONE_VERTEX = /* glsl */ `
  attribute float aGrain;
  attribute vec4  aState;   // heat 0..1, dissolve 0..1, seed, spin blur 0..1
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vGrain;
  varying vec4  vState;
  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 w = model * vec4(position, 1.0);
    vWorld = w.xyz;
    vLocal = position;
    vGrain = aGrain;
    vState = aState;
    vNormalW = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const STONE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uAmbient;
  uniform float uSpecular;
  uniform float uFresnel;
  uniform float uCrackScale;
  uniform float uCrackGlow;
  uniform vec3  uColorCore;   // white-hot
  uniform vec3  uColorTint;   // pale ochre
  uniform vec3  uColorBody;   // rust-red stone
  uniform vec3  uColorDeep;   // near-black basalt
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vGrain;
  varying vec4  vState;

  ${noiseGLSL}

  void main() {
    float heat = vState.x;
    float dissolve = vState.y;
    float seed = vState.z;
    // Crumble on the exit: noise eats the stone, a hot rim on the bite.
    float dn = snoise(vLocal * 2.6 + seed) * 0.5 + 0.5;
    float thr = 1.0 - dissolve * 1.1;
    if (dissolve > 0.0 && dn > thr) discard;
    float bite = dissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.07, thr - dn) : 0.0;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    float ndl = max(dot(N, L), 0.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 28.0) * uSpecular;
    float fres = pow(1.0 - abs(dot(N, V)), 3.0) * uFresnel;

    // Stone: basalt crust over rust-red, grain and pitting from noise.
    float crust = fbm3(vLocal * 3.2 + seed) * 0.5 + 0.5;
    float pit = smoothstep(0.55, 0.8, snoise(vLocal * 9.0 + seed * 3.0) * 0.5 + 0.5);
    float depthT = clamp(crust * 0.75 + vGrain * 0.35 + pit * 0.25, 0.0, 1.0);
    vec3 albedo = mix(uColorBody, uColorDeep, depthT);
    // Hot cracks: voronoi seams that glow while the stone is fresh from the throw.
    // Meandering hairline cracks (zero-crossings of noise), not cells.
    float cn = snoise(vLocal * uCrackScale + seed * 1.7);
    float seam = 1.0 - smoothstep(0.0, 0.07, abs(cn));
    seam *= smoothstep(-0.2, 0.4, snoise(vLocal * 1.3 + seed * 2.3));
    vec2 vo = vec2(cn, seed);
    // The leading edge (spin): friction heat on the pointed tips.
    float tip = smoothstep(0.62, 1.0, abs(vLocal.x));

    vec3 col = albedo * (uAmbient + ndl * 1.05);
    col += uColorTint * spec * (0.4 + 0.6 * (1.0 - depthT));
    col += uColorBody * fres * 0.8;
    float flicker = 0.75 + 0.25 * sin(uTime * 9.0 + vo.y * 20.0);
    vec3 hot = mix(uColorBody * 1.6, uColorCore * 1.4, heat * heat);
    col += hot * seam * heat * uCrackGlow * flicker * uShaderIntensity;
    col += mix(uColorTint, uColorCore, heat) * tip * heat * 0.9 * uShaderIntensity;
    col += uColorTint * bite * 2.4;
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

/**
 * Lit, opaque sling stones (instanced). Sun diffuse + specular, a body rim,
 * four-stop ramp (white-hot core in the cracks → pale ochre → rust-red body →
 * basalt deep); cracks and pointed tips glow while the throw's heat is in them
 * (`aState.x`) and cool as the stone spins down; `aState.y` crumbles it on the
 * exit. Sits on `LAYER.WORLD` and casts shadows.
 */
export function createSlingStoneMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uAmbient: { value: 0.3 },
      uSpecular: { value: 0.6 },
      uFresnel: { value: 0.6 },
      uCrackScale: { value: 3 },
      uCrackGlow: { value: 1.5 },
      uColorCore: { value: new Color() },
      uColorTint: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: STONE_VERTEX,
    fragmentShader: STONE_FRAGMENT
  });
  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uAmbient.value = c.stoneAmbient;
    u.uSpecular.value = c.stoneSpecular;
    u.uFresnel.value = c.stoneFresnel * g.fresnel;
    u.uCrackScale.value = c.stoneCrackScale * g.noiseFrequency;
    u.uCrackGlow.value = c.stoneCrackGlow * g.glow;
    u.uColorCore.value.copy(getColor(c.colorStoneCore));
    u.uColorTint.value.copy(getColor(c.colorStoneTint));
    u.uColorBody.value.copy(getColor(c.colorStoneBody));
    u.uColorDeep.value.copy(getColor(c.colorStoneDeep));
  };
  return material;
}

const BLUR_VERTEX = /* glsl */ `
  attribute vec4 aBlur;     // alpha, leading angle (rad), inner radius 0..1, arms (1 or 2)
  varying vec2 vUv;
  varying vec4 vBlur;
  void main() {
    vUv = uv * 2.0 - 1.0;
    vBlur = aBlur;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    gl_Position = projectionMatrix * viewMatrix * model * vec4(position, 1.0);
  }
`;

const BLUR_FRAGMENT = /* glsl */ `
  uniform float uGlobalGlow;
  uniform float uOpacity;
  uniform float uTrail;       // radians of smear behind the leading edge
  uniform vec3  uColorCore;
  uniform vec3  uColorTint;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  varying vec2 vUv;
  varying vec4 vBlur;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0 || vBlur.x < 0.002) discard;
    float a = atan(vUv.y, vUv.x);
    float arms = max(1.0, vBlur.w);
    float period = 6.2831853 / arms;
    // Angular distance behind the leading edge, wrapped per arm.
    float behind = mod(vBlur.y - a, period);
    float smear = exp(-behind / max(0.05, uTrail));
    // Strongest out at the tips' radius: the smear of the points, not a ring.
    float band = smoothstep(vBlur.z, vBlur.z + 0.35, r) * (1.0 - smoothstep(0.78, 1.0, r)) * smoothstep(0.0, 0.9, r);
    // Combed into fine streaks by radius: the grain of a fast whirl.
    float comb = 0.6 + 0.4 * snoise(vec3(r * 22.0, behind * 1.5, vBlur.y * 0.1));
    float k = smear * band * comb;
    vec3 col = gradient4(uColorDeep, uColorBody, uColorTint, uColorCore, clamp(k * 1.25, 0.0, 1.0));
    gl_FragColor = vec4(col * k * uOpacity * vBlur.x * uGlobalGlow, 1.0);
  }
`;

/**
 * The spin blur: a horizontal disc round each spinning stone (and the whirling
 * sling at the fist) — a comet-tailed smear behind each pointed tip, combed by
 * radius, ramped deep → body → tint → core at the leading edge. Additive, on
 * the VFX layer; `aBlur.x` is the spin it shows, so it fades as a stone slows.
 */
export function createSlingBlurMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uOpacity: { value: 1 },
      uTrail: { value: 1.2 },
      uColorCore: { value: new Color() },
      uColorTint: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: BLUR_VERTEX,
    fragmentShader: /* glsl */ `${commonGLSL}\n${BLUR_FRAGMENT}`
  });
  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uOpacity.value = c.blurOpacity * g.opacity;
    u.uTrail.value = c.blurTrail;
    u.uColorCore.value.copy(getColor(c.colorStoneCore));
    u.uColorTint.value.copy(getColor(c.colorStoneTint));
    u.uColorBody.value.copy(getColor(c.colorA));
    u.uColorDeep.value.copy(getColor(c.colorStoneDeep));
  };
  return material;
}

const CRATER_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const CRATER_FRAGMENT = /* glsl */ `
  #define MAX_STONES 12
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec4  uRest[MAX_STONES];   // rest x, z, seconds since landing (<0 = in the air), stone half-length
  uniform vec4  uTouch[MAX_STONES];  // touchdown x, z, heat 0..1, spin 0..1
  uniform float uCount;
  uniform float uCrater;     // crater radius, × stone half-length
  uniform float uCracks;     // crack reach, × crater radius
  uniform float uGouge;      // gouge width, × stone half-length
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uErode;
  uniform vec3  uColorCore;
  uniform vec3  uColorTint;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  varying vec3 vWorld;

  ${noiseGLSL}

  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / max(1e-4, dot(ab, ab)), 0.0, 1.0);
    return length(p - a - ab * t);
  }

  void main() {
    vec2 p = vWorld.xz;
    float dark = 0.0;     // how far the floor is pressed toward the deep tone
    float rim = 0.0;      // heaped, sun-catching dust
    float hot = 0.0;      // glowing seams
    float cover = 0.0;
    for (int i = 0; i < MAX_STONES; i++) {
      if (float(i) >= uCount) break;
      vec4 R = uRest[i];
      if (R.z < 0.0) continue;
      vec4 T = uTouch[i];
      float s = R.w;
      float grow = 1.0 - exp(-R.z * 14.0);
      vec2 d = p - R.xy;
      float dist = length(d);
      float cr = s * uCrater * grow;
      // The crater: a filled bowl, deepest in the middle, a heaped lip.
      float bowl = 1.0 - smoothstep(cr * 0.15, cr, dist);
      float lip = exp(-pow((dist - cr * 1.05) / max(0.02, cr * 0.22), 2.0));
      // The spin scuff: the pointed tips scribe a filled, finely grained disc.
      float scuffR = s * 1.05;
      float scuff = (1.0 - smoothstep(scuffR * 0.85, scuffR, dist)) * (0.55 + 0.45 * snoise(vec3(dist * 30.0, atan(d.y, d.x) * 0.5, R.w)));
      // The gouge it skidded along before it stopped.
      float g = segDist(p, T.xy, R.xy);
      float gw = s * uGouge;
      float gouge = (1.0 - smoothstep(gw * 0.3, gw, g)) * (0.6 + 0.4 * snoise(vec3(p * 6.0, 1.0)));
      float gougeLip = exp(-pow((g - gw) / max(0.02, gw * 0.35), 2.0)) * 0.6;
      // Radial cracks out of the crater, glowing while the stone is hot.
      float ang = atan(d.y, d.x);
      float crackN = abs(snoise(vec3(ang * 3.2 + float(i) * 5.0, dist * 0.6, float(i))));
      float reach = cr * uCracks;
      float crack = (1.0 - smoothstep(0.0, 0.05, crackN)) * smoothstep(cr * 0.5, cr, dist) * (1.0 - smoothstep(reach * 0.6, reach, dist)) * grow;
      dark = max(dark, max(bowl, gouge * 0.85));
      dark = max(dark, scuff * 0.55);
      dark = max(dark, crack * 0.9);
      rim = max(rim, max(lip, gougeLip));
      hot = max(hot, (1.0 - smoothstep(0.0, 0.02, crackN)) * crack * T.z);
      cover = max(cover, max(max(bowl, lip), max(max(gouge, gougeLip), max(scuff * 0.8, crack))));
    }
    if (cover < 0.01) discard;
    // Exit: the field breaks up raggedly into the floor.
    float er = snoise(vec3(p * 1.4, 3.0)) * 0.5 + 0.5;
    if (uErode > 0.0 && er < uErode) discard;
    float grain = fbm3(vec3(p * 3.0, 0.0)) * 0.5 + 0.5;
    // Scorched rock: near-black, a little brown in the grain — never a glowing disc.
    vec3 col = mix(uColorDeep * 2.2 + vec3(0.03), uColorDeep * 0.6, clamp(dark * 0.95 + grain * 0.25, 0.0, 1.0));
    float sun = 0.55 + 0.45 * max(uLightDir.y, 0.0);
    // The heaped lip: lighter dust, not a glowing ring.
    col = mix(col, mix(uColorDeep, uColorTint, 0.12) * sun, rim * (1.0 - dark) * 0.5);
    float flick = 0.8 + 0.2 * sin(uTime * 7.0 + p.x * 3.0 + p.y * 2.0);
    col += mix(uColorBody, uColorTint, hot * hot) * hot * uGlow * flick * uShaderIntensity;
    float alpha = clamp(cover * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(col * uGlobalGlow, alpha);
  }
`;

/**
 * The crater floor: one plane over the strip the volley covers, carrying up to
 * twelve landings (rest point, touchdown point, age, heat). Each is a filled,
 * dark bowl with a heaped sun-lit lip, the gouge the stone skidded along, the
 * finely scored disc its spinning tips scuffed, and radial cracks that glow
 * while the stone is hot and go dark as it cools. Normal blending; erodes on
 * the exit.
 */
export function createSlingCraterMaterial() {
  const rest = Array.from({ length: 12 }, () => new Vector4(0, 0, -1, 0));
  const touch = Array.from({ length: 12 }, () => new Vector4());
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
      uRest: { value: rest },
      uTouch: { value: touch },
      uCount: { value: 0 },
      uCrater: { value: 1.6 },
      uCracks: { value: 2.4 },
      uGouge: { value: 0.5 },
      uOpacity: { value: 1 },
      uGlow: { value: 1 },
      uErode: { value: 0 },
      uColorCore: { value: new Color() },
      uColorTint: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: CRATER_VERTEX,
    fragmentShader: CRATER_FRAGMENT
  });
  material.userData.sync = (count, erode) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCount.value = count;
    u.uCrater.value = c.craterSize;
    u.uCracks.value = c.craterCracks;
    u.uGouge.value = c.craterGouge;
    u.uOpacity.value = c.craterOpacity * g.opacity;
    u.uGlow.value = c.craterGlow * g.glow;
    u.uErode.value = erode;
    u.uColorCore.value.copy(getColor(c.colorStoneCore));
    u.uColorTint.value.copy(getColor(c.colorStoneTint));
    u.uColorBody.value.copy(getColor(c.colorA));
    u.uColorDeep.value.copy(getColor(c.colorStoneDeep));
  };
  return material;
}
