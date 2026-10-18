import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Mycelium Wake — the bespoke shaders.
 *
 *  - **the hyphae** (`createHyphaeMaterial`) — luminous cords laid half-sunk
 *    along the line in the vertex stage: each wanders on its own noise, braids
 *    with its neighbours, and is clipped and tapered at a *reveal front*, so
 *    the network grows down the line instead of appearing. Side branches peel
 *    off the cords at their own, slower rate. Shaded additive and inverted-
 *    fresnel (thick through the middle): a cream core in a teal sheath, with
 *    pulses of light running down every cord toward the target, a hot growing
 *    tip, and a soft fade where they dive into the floor.
 *  - **the stromata** (`createStromaMaterial`) — the fruiting bodies, rigid
 *    and instanced on `LAYER.WORLD`: a pale, fibrous stalk with lengthwise
 *    striations rising into an orange-to-scarlet club pitted with glowing
 *    ostioles (a cell pattern), a waxy specular, a fresnel rim, a throb as it
 *    readies to puff, and a brown, collapsing wither. Per instance `aState`:
 *    seed, glow, wither, punch.
 *  - **the wake** (`createWakeGroundMaterial`) — the floor: down the line a
 *    band of heaved, crumbled soil threaded with fine hyphal hairs and lit
 *    from beneath where the cords run; round the target a rotting stain from
 *    which hairs radiate, dusted orange with fallen spores.
 *  - **the spore haze** (`createSporeHazeMaterial`) — an open cylinder on
 *    `LAYER.DISTORTION` over the cluster: the air thickening as it puffs.
 *
 * Every material reads `settings.mycelium` in `userData.sync(...)`.
 */

const ID = 'mycelium';

/* ==================================================================== */
/* The hyphae                                                            */
/* ==================================================================== */

const HYPHAE_VERTEX = /* glsl */ `
  attribute vec4 aCord;       // lane, seed, start, end
  attribute vec4 aCord2;      // drift, radius ×, grow ×, kind

  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uFront;       // metres the network has reached
  uniform float uRadius;
  uniform float uSink;
  uniform float uWander;
  uniform float uWanderScale;
  uniform float uBraid;
  uniform float uTaper;

  varying float vAlong;
  varying float vS;
  varying float vReveal;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;
  varying vec4  vCord;
  varying float vKind;

  ${noiseGLSL}

  vec3 cordPoint(float s) {
    float along = mix(aCord.z, aCord.w, s) * uLength;
    float lat = aCord.x + aCord2.x * pow(s, 1.3)
              + uWander * snoise(vec3(along * uWanderScale, aCord.y * 17.0, 0.0))
              + uBraid * sin(along * 2.1 + aCord.y * 40.0);
    float y = -uSink + 0.04 * snoise(vec3(along * 1.7, aCord.y * 5.0, 3.0));
    return uOrigin + uDir * along + uSide * lat + vec3(0.0, y, 0.0);
  }

  void main() {
    float s = position.x;
    float ang = position.y * 6.2831853;
    float startM = aCord.z * uLength;
    float endM = aCord.w * uLength;
    // A cord grows with the front; a branch grows off it at its own rate.
    float reachM = startM + max(uFront - startM, 0.0) * aCord2.z;
    float sReveal = clamp((reachM - startM) / max(endM - startM, 0.01), 0.0, 1.0);
    float se = min(s, sReveal);
    vec3 c = cordPoint(se);
    vec3 T = normalize(cordPoint(min(se + 0.006, 1.0)) - cordPoint(max(se - 0.006, 0.0)) + vec3(1e-5, 0.0, 0.0));
    vec3 N1 = normalize(cross(T, vec3(0.0, 1.0, 0.0)));
    vec3 B = cross(N1, T);
    vec3 radial = cos(ang) * N1 + sin(ang) * B;
    float r = uRadius * aCord2.y * mix(1.0, 0.35, s * aCord2.w);
    r *= smoothstep(0.0, max(uTaper, 0.002), sReveal - s);   // to a point at the front
    r *= 1.0 + 0.3 * snoise(vec3(se * 30.0, aCord.y * 9.0, 1.0));
    vec3 world = c + radial * r;
    vAlong = mix(startM, endM, s);
    vS = s;
    vReveal = sReveal;
    vNormalW = radial;
    vWorld = world;
    vCord = aCord;
    vKind = aCord2.w;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const HYPHAE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;

  uniform float uCoreGlow;
  uniform float uSheathGlow;
  uniform float uPulseLen;
  uniform float uPulseSpeed;
  uniform float uPulseGlow;
  uniform float uTipGlow;
  uniform float uSoftFade;
  uniform float uFade;
  uniform float uOpacity;
  uniform vec3  uColorCore;
  uniform vec3  uColorSheath;
  uniform vec3  uColorPulse;

  varying float vAlong;
  varying float vS;
  varying float vReveal;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying float vViewZ;
  varying vec4  vCord;
  varying float vKind;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    if (vS > vReveal + 0.002) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float core = pow(abs(dot(N, V)), 1.6);
    float fib = snoise(vec3(vAlong * 8.0, core * 3.0, vCord.y * 11.0)) * 0.5 + 0.5;
    vec3 col = mix(uColorSheath, uColorCore, core);
    float bright = uSheathGlow * (1.0 - core) + uCoreGlow * core * (0.7 + 0.5 * fib);
    // Pulses running down the cord toward the target.
    float pulse = pow(0.5 + 0.5 * sin(6.2831853 * (vAlong / max(uPulseLen, 0.1) - uTime * uPulseSpeed) + vCord.y * 6.0), 10.0);
    col = mix(col, uColorPulse, pulse * 0.7);
    bright += pulse * uPulseGlow;
    // The growing tip is the brightest thing on it.
    float tip = exp(-max(vReveal - vS, 0.0) * 30.0) * step(vReveal, 0.999);
    bright += tip * uTipGlow;
    float a = uFade * uOpacity * (0.45 + 0.55 * core) * (1.0 - 0.35 * vKind);
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * bright * a * uGlobalGlow * uShaderIntensity, a);
  }
`;

/** The luminous cords. Additive, placed in the vertex stage. */
export function createHyphaeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uOrigin: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uFront: { value: 0 },
      uRadius: { value: 0.05 },
      uSink: { value: 0.02 },
      uWander: { value: 0.3 },
      uWanderScale: { value: 0.4 },
      uBraid: { value: 0.1 },
      uTaper: { value: 0.03 },
      uCoreGlow: { value: 3 },
      uSheathGlow: { value: 1 },
      uPulseLen: { value: 2 },
      uPulseSpeed: { value: 1 },
      uPulseGlow: { value: 3 },
      uTipGlow: { value: 4 },
      uSoftFade: { value: 0.05 },
      uFade: { value: 1 },
      uOpacity: { value: 1 },
      uColorCore: { value: new Color() },
      uColorSheath: { value: new Color() },
      uColorPulse: { value: new Color() }
    }),
    vertexShader: HYPHAE_VERTEX,
    fragmentShader: HYPHAE_FRAGMENT
  });

  /** @param {object} s { origin, dir, side, length, front, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uOrigin.value.copy(s.origin);
    u.uDir.value.copy(s.dir);
    u.uSide.value.copy(s.side);
    u.uLength.value = Math.max(0.1, s.length);
    u.uFront.value = s.front;
    u.uRadius.value = c.cordRadius;
    u.uSink.value = c.cordSink;
    u.uWander.value = c.cordWander * g.noiseStrength;
    u.uWanderScale.value = c.cordWanderScale * g.noiseFrequency;
    u.uBraid.value = c.cordBraid;
    u.uTaper.value = c.cordTaper;
    u.uCoreGlow.value = c.cordCoreGlow * g.glow;
    u.uSheathGlow.value = c.cordSheathGlow * g.glow;
    u.uPulseLen.value = c.pulseLength;
    u.uPulseSpeed.value = c.pulseSpeed * g.animationSpeed;
    u.uPulseGlow.value = c.pulseGlow * g.glow;
    u.uTipGlow.value = c.cordTipGlow * g.glow;
    u.uSoftFade.value = c.cordSoftFade;
    u.uFade.value = s.fade;
    u.uOpacity.value = g.opacity;
    u.uColorCore.value.copy(getColor(c.colorCordCore));
    u.uColorSheath.value.copy(getColor(c.colorCordSheath));
    u.uColorPulse.value.copy(getColor(c.colorPulse));
  };

  return material;
}

/* ==================================================================== */
/* The stromata                                                          */
/* ==================================================================== */

const STROMA_VERTEX = /* glsl */ `
  attribute float aT;
  attribute float aPart;
  attribute vec4  aState;     // seed, glow, wither, punch

  varying float vT;
  varying float vPart;
  varying vec4  vState;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;

  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 w = model * vec4(position, 1.0);
    vWorld = w.xyz;
    vLocal = position;
    vNormalW = normalize(mat3(model) * normal);
    vT = aT;
    vPart = aPart;
    vState = aState;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const STROMA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColorStalk;
  uniform vec3  uColorStalkTop;
  uniform vec3  uColorClub;
  uniform vec3  uColorClubTip;
  uniform vec3  uColorPore;
  uniform vec3  uColorRim;
  uniform vec3  uColorDead;
  uniform float uPoreScale;
  uniform float uPoreGlow;
  uniform float uThrob;
  uniform float uSpecular;
  uniform float uRim;
  uniform float uStriation;

  varying float vT;
  varying float vPart;
  varying vec4  vState;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;

  ${noiseGLSL}

  void main() {
    float seed = vState.x;
    float glow = vState.y;
    float wither = vState.z;
    float punch = vState.w;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);

    float club = step(0.5, vPart);
    // Stalk: pale, fibrous, striated lengthwise, warming toward the head.
    float ang = atan(vLocal.z, vLocal.x);
    float stria = 0.5 + 0.5 * sin(ang * 14.0 + snoise(vec3(vLocal * 12.0 + seed)) * 2.0);
    vec3 stalk = mix(uColorStalk, uColorStalkTop, smoothstep(0.2, 0.75, vT));
    stalk *= 1.0 - uStriation * 0.35 * stria;
    // Club: orange to scarlet, pitted with ostioles.
    vec2 vc = voronoi2(vec2(ang * 3.0, vLocal.y * uPoreScale) + seed * 9.0);
    float pore = 1.0 - smoothstep(0.08, 0.28, vc.x);
    vec3 head = mix(uColorClub, uColorClubTip, smoothstep(0.7, 1.0, vT) + vc.y * 0.2);
    head *= 1.0 - pore * 0.35;
    vec3 albedo = mix(stalk, head, club);
    albedo = mix(albedo, uColorDead, wither * (0.6 + 0.4 * snoise(vLocal * 6.0 + vec3(seed))));

    float wrap = clamp(dot(N, L) * 0.6 + 0.4, 0.0, 1.0);
    vec3 color = albedo * (0.3 + 0.85 * wrap);
    color += vec3(pow(max(dot(N, H), 0.0), 30.0) * uSpecular) * (0.4 + 0.6 * club);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
    color += uColorRim * fres * uRim * (1.0 - wither);

    float throb = 1.0 + uThrob * sin(uTime * 6.0 + seed * 30.0 + vT * 5.0);
    float lit = glow * throb * (1.0 - wither) * uShaderIntensity;
    color += uColorPore * pore * club * uPoreGlow * lit;
    color += uColorClubTip * club * lit * 0.35;
    color += uColorPore * punch * (0.5 + club);

    gl_FragColor = vec4(color * uGlobalGlow, 1.0);
  }
`;

/** The fruiting bodies. Rigid, instanced, opaque on `LAYER.WORLD`. */
export function createStromaMaterial() {
  const material = new ShaderMaterial({
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uColorStalk: { value: new Color() },
      uColorStalkTop: { value: new Color() },
      uColorClub: { value: new Color() },
      uColorClubTip: { value: new Color() },
      uColorPore: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorDead: { value: new Color() },
      uPoreScale: { value: 30 },
      uPoreGlow: { value: 3 },
      uThrob: { value: 0.3 },
      uSpecular: { value: 0.5 },
      uRim: { value: 0.6 },
      uStriation: { value: 0.6 }
    }),
    vertexShader: STROMA_VERTEX,
    fragmentShader: STROMA_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uColorStalk.value.copy(getColor(c.colorStalk));
    u.uColorStalkTop.value.copy(getColor(c.colorStalkTop));
    u.uColorClub.value.copy(getColor(c.colorClub));
    u.uColorClubTip.value.copy(getColor(c.colorClubTip));
    u.uColorPore.value.copy(getColor(c.colorPore));
    u.uColorRim.value.copy(getColor(c.colorStromaRim));
    u.uColorDead.value.copy(getColor(c.colorDead));
    u.uPoreScale.value = c.poreScale;
    u.uPoreGlow.value = c.poreGlow * g.glow;
    u.uThrob.value = c.throb;
    u.uSpecular.value = c.stromaSpecular;
    u.uRim.value = c.stromaRim * g.fresnel;
    u.uStriation.value = c.striation;
  };

  return material;
}

/* ==================================================================== */
/* The wake on the floor                                                 */
/* ==================================================================== */

const WAKE_VERTEX = /* glsl */ `
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uHalfWidth;
  varying vec2 vFlat;       // x: metres across, y: metres along
  void main() {
    float across = position.y * uHalfWidth;
    float along = position.x * uLength;
    vec3 world = uOrigin + uSide * across + uDir * along;
    world.y = 0.014;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const WAKE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uFront;
  uniform float uEnd;          // metres to the target
  uniform float uBand;         // half-width of the heaved band
  uniform float uDisc;         // radius of the rot round the target
  uniform float uDiscGrow;     // 0..1
  uniform float uHair;
  uniform float uHairScale;
  uniform float uUnderGlow;
  uniform float uSporeDust;    // 0..1 orange settling round the cluster
  uniform float uErode;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3  uColorSoil;
  uniform vec3  uColorHair;
  uniform vec3  uColorGlow;
  uniform vec3  uColorRot;
  uniform vec3  uColorDust;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;

    /* the band the cords heaved up, to the front */
    float wob = snoise(vec3(along * 0.35, uSeed, 0.0)) * uBand * 0.3;
    float band = 1.0 - smoothstep(uBand * 0.5, uBand, abs(x - wob));
    band *= smoothstep(0.0, 0.6, along) * (1.0 - smoothstep(uFront - 0.4, uFront + 0.05, along));
    // Crumbs of heaved soil.
    float crumb = smoothstep(0.35, 0.8, snoise(vec3(vFlat * 5.0, uSeed + 2.0)) * 0.5 + 0.5);
    // Fine hyphal hair, stretched along the line.
    float hair = smoothstep(0.55, 0.95, snoise(vec3(x * uHairScale * 2.5, along * uHairScale * 0.25, uSeed * 3.0)) * 0.5 + 0.5);

    /* the rot round the target, hairs radiating from it */
    vec2 d = vec2(x, along - uEnd);
    float r = length(d);
    float rag = snoise(vec3(d * 0.8, uSeed + 7.0)) * 0.35;
    float disc = (1.0 - smoothstep(uDisc * uDiscGrow * 0.6, uDisc * uDiscGrow + rag, r)) * step(0.001, uDiscGrow);
    float a = atan(d.y, d.x);
    float rays = smoothstep(0.6, 0.95, snoise(vec3(a * 9.0, r * 0.6 - uTime * 0.05, uSeed)) * 0.5 + 0.5);
    float rhair = rays * disc * (1.0 - smoothstep(0.0, uDisc, r) * 0.4);
    float dust = disc * uSporeDust * smoothstep(0.4, 0.9, snoise(vec3(d * 3.0, uSeed + 9.0)) * 0.5 + 0.5);

    float glowLine = band * (0.4 + 0.6 * hair) * exp(-abs(x - wob) / max(uBand * 0.4, 0.01));
    vec3 col = uColorSoil * (0.7 + 0.5 * crumb);
    col = mix(col, uColorRot, disc * 0.8);
    col = mix(col, uColorHair, clamp((hair * band + rhair) * uHair, 0.0, 1.0));
    col = mix(col, uColorDust, dust);
    col += uColorGlow * (glowLine + rhair * 0.6) * uUnderGlow * uGlobalGlow * uShaderIntensity;

    float a1 = max(max(band * (0.55 + 0.35 * crumb), disc * 0.8), dust);
    float n = snoise(vec3(vFlat * 1.3, uSeed * 4.0)) * 0.5 + 0.5;
    float thr = uErode * 1.25 - 0.15;
    a1 *= smoothstep(thr, thr + 0.15, n) * uOpacity;
    if (a1 < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a1, 0.0, 1.0));
  }
`;

/** The heaved band down the line, and the rot round the target. */
export function createWakeGroundMaterial() {
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
      uOrigin: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uHalfWidth: { value: 3 },
      uFront: { value: 0 },
      uEnd: { value: 10 },
      uBand: { value: 0.8 },
      uDisc: { value: 3 },
      uDiscGrow: { value: 0 },
      uHair: { value: 0.6 },
      uHairScale: { value: 4 },
      uUnderGlow: { value: 1.5 },
      uSporeDust: { value: 0 },
      uErode: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uColorSoil: { value: new Color() },
      uColorHair: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorRot: { value: new Color() },
      uColorDust: { value: new Color() }
    }),
    vertexShader: WAKE_VERTEX,
    fragmentShader: WAKE_FRAGMENT
  });

  /** @param {object} s { origin, dir, side, length, front, end, discGrow, dust, erode, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uOrigin.value.copy(s.origin);
    u.uDir.value.copy(s.dir);
    u.uSide.value.copy(s.side);
    u.uLength.value = Math.max(0.1, s.length);
    u.uHalfWidth.value = Math.max(c.bandWidth, c.fruitRadius * 1.5);
    u.uFront.value = s.front;
    u.uEnd.value = s.end;
    u.uBand.value = c.bandWidth;
    u.uDisc.value = c.fruitRadius * c.rotScale;
    u.uDiscGrow.value = s.discGrow;
    u.uHair.value = c.hairAmount;
    u.uHairScale.value = c.hairScale * g.noiseFrequency;
    u.uUnderGlow.value = c.underGlow * g.glow;
    u.uSporeDust.value = s.dust;
    u.uErode.value = s.erode;
    u.uSeed.value = s.seed;
    u.uOpacity.value = g.opacity;
    u.uColorSoil.value.copy(getColor(c.colorSoil));
    u.uColorHair.value.copy(getColor(c.colorHair));
    u.uColorGlow.value.copy(getColor(c.colorCordSheath));
    u.uColorRot.value.copy(getColor(c.colorRot));
    u.uColorDust.value.copy(getColor(c.colorSporeDust));
  };

  return material;
}

/* ==================================================================== */
/* Spore haze — LAYER.DISTORTION                                         */
/* ==================================================================== */

const HAZE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const HAZE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSeed;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGLSL}
  void main() {
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.5 - uTime * 0.8 + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(9.1, 3.3, 17.7)));
    float mask = smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
    float s = uStrength * uShaderIntensity * mask;
    if (s < 0.002) discard;
    gl_FragColor = vec4(n * 0.5 + 0.5, s, mask);
  }
`;

/** The air over the cluster thickening as it puffs. */
export function createSporeHazeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStrength: { value: 0 },
      uScale: { value: 1.4 },
      uSeed: { value: 0 }
    }),
    vertexShader: HAZE_VERTEX,
    fragmentShader: HAZE_FRAGMENT
  });

  /** @param {object} s { strength, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStrength.value = s.strength * c.hazeStrength * g.distortion;
    u.uScale.value = c.hazeScale * g.noiseFrequency;
    u.uSeed.value = s.seed;
  };

  return material;
}
