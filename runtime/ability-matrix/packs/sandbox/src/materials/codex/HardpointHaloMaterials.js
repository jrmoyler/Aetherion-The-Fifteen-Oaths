import { AdditiveBlending, Color, DoubleSide, MeshDepthMaterial, MeshStandardMaterial, NormalBlending, RGBADepthPacking, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { patchOnBeforeCompile } from '../../utils/shaderPatch.js';

const ID = 'hardpoint';

/**
 * Hardpoint Halo — four shaders, none of them shared.
 *
 * Body placement is the stamp read (Tech — hardpoints lock into a ring, then fire outward together).
 * The fragment field is tech-specific (f 6.00 / 1.46, speed 0.79),
 * then carved by this spell's own mask. The lens writes distortion
 * (direction in RG around 0.5, strength in B, coverage in A). The ground
 * pattern belongs to tech, not to a shared stamp. The voice is a
 * second placement — crown — so the cast has a layer that
 * is not the body. Every uniform is filled from settings.hardpoint each frame.
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


    float ang = u * 6.2831853 + uSpin;
    vec3 radial = vec3(cos(ang), 0.0, sin(ang));
    float rad = uRadius * (1.0 + 0.20 * (1.0 - uGrow));
    p = uCenter + radial * rad;
    p.y = (uHeight * (1.0 - uOpen) + (v - 0.5) * uThickness) * max(uGrow, 0.04);
    local = fract(ang * 0.1591549);
  

    // square hardpoint crenels
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
    float field = step(0.55, abs(fract(vWorld.y * 6.00 + uTime * 1.46) - 0.5) * 2.0);
    float band = 0.5 + 0.5 * sin(vLocal * 6.00 + uTime * 0.79);
    float carved = band * (0.30 + 0.70 * field);
    vec3 col = mix(uColorC, uColorA, step(0.5, carved));
    col += uColorB * carved * uGlow;
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
    vec2 dir = vec2(0.0, fract(vLocal * 8.0) - 0.5); dir = length(dir) < 0.001 ? vec2(0.0, 1.0) : normalize(dir);
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
    float pat = step(0.45, abs(fract(vUv.y * 12.0) - 0.5)) * step(0.45, abs(fract(vUv.x * 12.0) - 0.5));
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
    float band = 0.5 + 0.5 * sin(vLocal * 6.00 + uTime * 0.79 + uSeed);
    float grain = snoise01(vWorld * 1.46 + vec3(uSeed, uTime * 0.30, 0.0));
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
    float pat = clamp(step(0.6, fract(vWorld.y * 6.0 + vSeed * 4.0)) * 0.7 + step(0.9, fract(vWorld.x * 5.0 + vWorld.z * 5.0)) * 0.3, 0.0, 1.0);
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
    gPartGlow += uColorA * line * uEdge * 0.28;
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

export function createHardpointHaloBodyMaterial() {
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

export function createHardpointHaloLensMaterial() {
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

export function createHardpointHaloGroundMaterial() {
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

export function createHardpointHaloVoiceMaterial() {
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
 * tech is matter: a MeshStandardMaterial lit by the scene sun,
 * opaque, with the part fold and the four-stop ramp patched in, and a depth
 * material carrying the same fold so the shadow moves with the parts. The
 * owner (RigHero / DetailLayer) puts the mesh on LAYER.SHAPED and lets it cast
 * and receive shadows.
 */
export function createHardpointHaloDetailMaterial(rig = false) {
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
    'codex-solid-hardpoint'
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
    'codex-solid-depth-hardpoint'
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

/* ==================================================================== */
/* The signature — the hardpoint turrets and the deck they lock onto     */
/* ==================================================================== */
/*
 * Two more shaders, written for this cast:
 *   armour — dark gunmetal (MeshStandardMaterial, patched, instanced): sun-lit,
 *            shadow-casting, with panel grooves; only the sensor slit, the
 *            plate seam and the muzzles glow — the slit with power, the
 *            muzzles with the heat of the volley.
 *   deck   — the floor: a filled hex-plated disc the turrets bolt onto, its
 *            seams lit while powered, a conduit from the hub to each
 *            hardpoint that charges before the volley, and a burnt wedge
 *            thrown out ahead of every muzzle.
 */

const ARMOUR_VERTEX_PARS = /* glsl */ `
  attribute float aGlow;
  varying float vGlow;
  varying vec3 vArmourLocal;
`;
const ARMOUR_FRAGMENT_PARS = /* glsl */ `
  uniform float uKind;
  uniform float uEye;
  uniform float uSeam;
  uniform float uHeat;
  uniform float uRim;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorHot;
  uniform vec3  uColorCore;
  varying float vGlow;
  varying vec3  vArmourLocal;
  ${noiseGLSL}
`;
const ARMOUR_COLOR = /* glsl */ `
  {
    vec3 p = vArmourLocal * 4.0;
    // Panel grooves: thin dark lines on a grid, broken by a little noise.
    vec3 f = abs(fract(p) - 0.5);
    float groove = 1.0 - smoothstep(0.43, 0.48, max(max(f.x, f.y), f.z));
    float grime = snoise(vArmourLocal * 6.0) * 0.5 + 0.5;
    diffuseColor.rgb = mix(uColorDeep, uColorBody, 0.55 + 0.35 * grime) * (0.55 + 0.45 * groove);
  }
`;
const ARMOUR_EMISSIVE = /* glsl */ `
  {
    if (uKind < 0.5) {
      float eye = smoothstep(0.85, 1.0, vGlow);
      float seam = smoothstep(0.4, 0.7, vGlow) * (1.0 - eye);
      totalEmissiveRadiance += mix(uColorHot, uColorCore, 0.35) * eye * uEye;
      totalEmissiveRadiance += uColorHot * seam * uSeam;
    } else {
      float m = vGlow;
      totalEmissiveRadiance += mix(uColorHot, uColorCore, m * uHeat) * m * m * uHeat * 3.0;
    }
    vec3 nV = normalize(normal);
    float rim = pow(1.0 - abs(dot(nV, normalize(vViewPosition))), 3.0);
    totalEmissiveRadiance += uColorHot * rim * uRim;
  }
`;

/** Gunmetal armour for a hardpoint's `pod` (kind 0) or its `barrel` (kind 1). */
export function createHardpointHaloArmourMaterial(kind = 0) {
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.7 });
  const uniforms = {
    uKind: { value: kind },
    uEye: { value: 1 },
    uSeam: { value: 1 },
    uHeat: { value: 0 },
    uRim: { value: 0.2 },
    uColorDeep: { value: new Color() },
    uColorBody: { value: new Color() },
    uColorHot: { value: new Color() },
    uColorCore: { value: new Color() }
  };
  patchOnBeforeCompile(
    material,
    (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${ARMOUR_VERTEX_PARS}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = aGlow;\n  vArmourLocal = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${ARMOUR_FRAGMENT_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${ARMOUR_COLOR}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${ARMOUR_EMISSIVE}`);
    },
    'hardpoint-armour'
  );
  material.userData.uniforms = uniforms;
  /** @param {number} power 0..1 the slit and seams @param {number} heat 0..1 the muzzles */
  material.userData.sync = (power, heat) => {
    const c = settings[ID];
    const g = settings.global;
    uniforms.uEye.value = power * c.podEyeGlow * g.glow;
    uniforms.uSeam.value = power * c.podSeamGlow * g.glow;
    uniforms.uHeat.value = heat * c.barrelHeat * g.glow;
    uniforms.uRim.value = c.podRimGlow * g.fresnel * g.glow * (0.3 + 0.7 * power);
    uniforms.uColorDeep.value.copy(getColor(c.colorPodDeep));
    uniforms.uColorBody.value.copy(getColor(c.colorPodBody));
    uniforms.uColorHot.value.copy(getColor(c.colorPodHot));
    uniforms.uColorCore.value.copy(getColor(c.colorPodCore));
    material.roughness = c.podRough;
    material.metalness = c.podMetal;
  };
  return material;
}

const DECK_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DECK_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uExtent;
  uniform float uPlate;
  uniform float uRing;
  uniform float uScorchLen;
  uniform float uPods;
  uniform float uPhase;
  uniform float uOpen;
  uniform float uPower;
  uniform float uCharge;
  uniform float uScorch;
  uniform float uHeat;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uHex;
  uniform float uSeed;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorHot;
  uniform vec3  uColorCore;
  uniform vec3  uColorBurn;
  varying vec2 vUv;
  ${noiseGLSL}
  float hexDist(vec2 p) {
    p = abs(p);
    return max(dot(p, vec2(0.5, 0.8660254)), p.x);
  }
  float hexEdge(vec2 p) {
    const vec2 s = vec2(1.0, 1.7320508);
    vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
    vec2 q = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
    return 0.5 - hexDist(q);
  }
  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * uExtent;
    float r = length(p);
    float a = atan(p.y, p.x) - uPhase;
    float sector = 6.2831853 / max(1.0, uPods);
    float k = mod(a + sector * 0.5, sector) - sector * 0.5;
    float lateral = abs(k) * r;
    vec3 col = vec3(0.0);
    float alpha = 0.0;
    // The plate: filled hex armour out to the plate radius, opened from the hub.
    float open = 1.0 - smoothstep(uOpen * uPlate - 0.4, uOpen * uPlate, r);
    float onPlate = (1.0 - smoothstep(uPlate - 0.06, uPlate, r)) * open;
    if (onPlate > 0.0) {
      float e = hexEdge(p / max(0.2, uHex));
      float grime = snoise(vec3(p * 0.7, uSeed)) * 0.5 + 0.5;
      vec3 plate = mix(uColorDeep, uColorBody, 0.35 + 0.35 * grime + 0.3 * smoothstep(0.02, 0.12, e));
      float seam = 1.0 - smoothstep(0.0, 0.035, e);
      float lip = smoothstep(uPlate - 0.35, uPlate - 0.06, r);
      plate = mix(plate, uColorBody * 1.3, lip * 0.5);
      plate += uColorHot * seam * uPower * (0.25 + 0.2 * sin(r * 3.0 - uTime * 4.0)) * uGlow;
      // Conduits from the hub out to each hardpoint, charging before the volley.
      float conduit = (1.0 - smoothstep(0.05, 0.14, lateral)) * step(r, uRing);
      float pulse = fract(r / max(0.5, uRing) - uTime * 1.6);
      plate += mix(uColorHot, uColorCore, pulse * uCharge) * conduit * (0.4 * uPower + 1.6 * uCharge * pulse) * uGlow;
      col = plate;
      alpha = onPlate;
    }
    // A burnt wedge thrown out ahead of each muzzle.
    float beyond = r - uRing;
    if (beyond > 0.0 && beyond < uScorchLen && uScorch > 0.0) {
      float n = snoise(vec3(p * 1.4, uSeed + 2.0)) * 0.5 + 0.5;
      float width = 0.35 + 0.18 * beyond + 0.15 * n;
      float wedge = 1.0 - smoothstep(width * 0.6, width, lateral);
      float along = 1.0 - smoothstep(uScorchLen * 0.55, uScorchLen, beyond + n * 0.6);
      float w = wedge * along * uScorch;
      vec3 burn = uColorBurn + uColorHot * (1.0 - smoothstep(0.0, 0.15, abs(lateral - width * 0.6))) * uHeat * wedge * 1.2 * uGlow;
      burn += mix(uColorHot, uColorCore, 0.5) * (1.0 - smoothstep(0.0, 0.12, lateral)) * uHeat * along * 1.4 * uGlow;
      col = mix(col, burn, w * (1.0 - alpha * 0.4));
      alpha = max(alpha, w * 0.92);
    }
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, alpha * uOpacity);
  }
`;

/** The deck: a filled hex-plated disc with powered seams, charging conduits and muzzle scorch. */
export function createHardpointHaloDeckMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: sharedUniforms({
      uExtent: { value: 1 },
      uPlate: { value: 1 },
      uRing: { value: 1 },
      uScorchLen: { value: 2 },
      uPods: { value: 8 },
      uPhase: { value: 0 },
      uOpen: { value: 0 },
      uPower: { value: 0 },
      uCharge: { value: 0 },
      uScorch: { value: 0 },
      uHeat: { value: 0 },
      uOpacity: { value: 0 },
      uGlow: { value: 1 },
      uHex: { value: 0.6 },
      uSeed: { value: 0 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorCore: { value: new Color() },
      uColorBurn: { value: new Color() }
    }),
    vertexShader: DECK_VERTEX,
    fragmentShader: DECK_FRAGMENT
  });
  material.userData.sync = (extent, plate, ring, scorchLen, pods, phase, open, power, charge, scorch, heat, opacity, seed) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uExtent.value = extent;
    u.uPlate.value = plate;
    u.uRing.value = ring;
    u.uScorchLen.value = scorchLen;
    u.uPods.value = pods;
    u.uPhase.value = phase;
    u.uOpen.value = open;
    u.uPower.value = power;
    u.uCharge.value = charge;
    u.uScorch.value = scorch;
    u.uHeat.value = heat;
    u.uOpacity.value = opacity * c.deckOpacity * g.opacity;
    u.uGlow.value = c.deckGlow * g.glow;
    u.uHex.value = c.deckHex;
    u.uSeed.value = seed;
    u.uColorDeep.value.copy(getColor(c.colorDeckDeep));
    u.uColorBody.value.copy(getColor(c.colorDeckBody));
    u.uColorHot.value.copy(getColor(c.colorPodHot));
    u.uColorCore.value.copy(getColor(c.colorPodCore));
    u.uColorBurn.value.copy(getColor(c.colorDeckBurn));
  };
  return material;
}
