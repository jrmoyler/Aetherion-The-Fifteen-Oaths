import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { BLADE_R, BLADE_BELLY } from '../../assets/codex/UmbralGuillotineGeometry.js';

/**
 * Umbral Guillotine — the bespoke shaders.
 *
 *  - **the blade** — the extruded crescent, opaque: black obsidian with a
 *    slow violet bruise moving in it, a *temper line* (the hamon of a forged
 *    blade) glowing a finger's width in from the edge, and the edge itself a
 *    razor of white-violet light found analytically from the crescent's own
 *    circles — so it is exact at every size. A fresnel rim keeps the black
 *    silhouette readable against the black arena. It forms and goes on a
 *    noise dissolve with a burning lip, and flares on the chop.
 *  - **the tether** — the shadow it hangs from: a black rod with violet
 *    pulses running down it to the blade.
 *  - **the anchor** — the knot of shadow at the pivot: a black disc in a
 *    violet ring with short spikes, turning.
 *  - **the smear** — an annular sector in the swing plane behind the edge:
 *    the arc the edge has just cut, brightest along the edge's own track and
 *    at the leading end. Its twin on `LAYER.DISTORTION` shoves the air aside.
 *  - **the cleft** — the cut the chop leaves in the floor: a ragged black
 *    gash with burning violet lips and cracks running off it. The same
 *    shader cuts the shorter slashes the edge scores across the line at the
 *    bottom of each swing (per-mesh length, width and glow).
 *  - **the shadow pool** (`createShadowPoolMaterial`) — the linger's body: a
 *    disc of near-black shadow that spills out of the cleft, its edge a
 *    crawl of fbm tendrils, violet veins swirling inward through it toward
 *    the buried blade. Normal-blended so it *eats* the floor's light.
 *
 * Every material reads `settings.umbral` in `userData.sync(state)`.
 */

const ID = 'umbral';

/* -------------------------------------------------------------------- */
/* The blade                                                            */
/* -------------------------------------------------------------------- */

const BLADE_VERTEX = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vLocal = position;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BLADE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uEdgeWidth;
  uniform float uEdgeGlow;
  uniform float uHamonGlow;
  uniform float uRimGlow;
  uniform float uBruise;
  uniform float uPulse;       // 0..1 the chop's flare
  uniform float uDissolve;    // 0 whole .. 1 gone
  uniform float uDissolveEdge;
  uniform float uNoiseScale;
  uniform vec3  uColorBody;
  uniform vec3  uColorBruise;
  uniform vec3  uColorEdge;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  ${noiseGLSL}

  const float R = ${BLADE_R.toFixed(4)};
  const float BELLY = ${BLADE_BELLY.toFixed(4)};

  void main() {
    vec2 p = vLocal.xy;
    // Distance in from the cutting edge, and down from the spine.
    float fromEdge = R - length(p - vec2(0.0, R));
    float fromSpine = length(p - vec2(0.0, R + BELLY)) - R;
    float across = clamp(fromEdge / max(fromEdge + fromSpine, 1e-3), 0.0, 1.0);

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float fres = pow(max(1.0 - abs(dot(N, V)), 0.0), 3.0);

    // Obsidian with a slow violet bruise moving through it.
    float n = fbm3(vec3(p * uNoiseScale, uTime * 0.25 + uSeed));
    vec3 col = uColorBody + uColorBruise * smoothstep(0.1, 0.8, n * 0.5 + 0.5) * uBruise;

    // The temper line, wavering a little way in from the edge.
    float hamonAt = 0.11 + 0.025 * sin(atan(p.x, R - p.y) * 18.0 + n * 2.0);
    float hamon = exp(-pow(abs((fromEdge - hamonAt) / 0.012), 2.0));
    // The edge: a razor of light.
    float edge = exp(-max(fromEdge, 0.0) / max(uEdgeWidth, 1e-3));
    // The horns burn hotter.
    float horn = smoothstep(0.75, 0.98, abs(p.x)) * smoothstep(0.9, 1.25, p.y);

    col += uColorEdge * (edge * uEdgeGlow + horn * uEdgeGlow * 0.5) * (1.0 + uPulse * 2.0);
    col += uColorRim * hamon * uHamonGlow * (0.6 + 0.4 * sin(uTime * 4.0 - p.x * 6.0));
    col += uColorRim * fres * uRimGlow;
    col += uColorRim * uPulse * 1.5 * (1.0 - across);

    // Forms and goes on noise, edge last to go.
    if (uDissolve > 0.0) {
      float dn = snoise(vec3(p * 3.1, uSeed)) * 0.5 + 0.5;
      float field = dn * 0.7 + across * 0.3;
      float thr = uDissolve * 1.15 - 0.08;
      if (field < thr) discard;
      col += uColorEdge * (1.0 - smoothstep(thr, thr + uDissolveEdge, field)) * 5.0;
    }
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

/** The crescent blade — opaque, emissive edge. */
export function createBladeMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uEdgeWidth: { value: 0.03 },
      uEdgeGlow: { value: 5 },
      uHamonGlow: { value: 1.5 },
      uRimGlow: { value: 2 },
      uBruise: { value: 0.6 },
      uPulse: { value: 0 },
      uDissolve: { value: 0 },
      uDissolveEdge: { value: 0.08 },
      uNoiseScale: { value: 2 },
      uColorBody: { value: new Color() },
      uColorBruise: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: BLADE_VERTEX,
    fragmentShader: BLADE_FRAGMENT
  });

  /** @param {object} s { seed, pulse, dissolve } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSeed.value = s.seed;
    u.uEdgeWidth.value = c.edgeWidth;
    u.uEdgeGlow.value = c.edgeGlow * g.glow;
    u.uHamonGlow.value = c.hamonGlow * g.glow;
    u.uRimGlow.value = c.bladeRim * g.glow * g.fresnel;
    u.uBruise.value = c.bruise * g.shaderIntensity;
    u.uPulse.value = s.pulse;
    u.uDissolve.value = s.dissolve;
    u.uDissolveEdge.value = c.dissolveEdge;
    u.uNoiseScale.value = 2.2 * g.noiseFrequency;
    u.uColorBody.value.copy(getColor(c.colorBlade));
    u.uColorBruise.value.copy(getColor(c.colorBruise));
    u.uColorEdge.value.copy(getColor(c.colorEdge));
    u.uColorRim.value.copy(getColor(c.colorRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The tether                                                           */
/* -------------------------------------------------------------------- */

const TETHER_VERTEX = /* glsl */ `
  varying float vY;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vY = position.y + 0.5;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const TETHER_FRAGMENT = /* glsl */ `
  uniform float uFlow;
  uniform float uGlow;
  uniform float uDissolve;
  uniform vec3  uColorBody;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

  varying float vY;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  void main() {
    // Dissolves from the pivot down.
    if (vY > 1.0 - uDissolve) discard;
    float fres = pow(abs(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir)))), 2.0);
    // Pulses run down to the blade (y = 0 is the blade end).
    float pulse = pow(max(0.5 + 0.5 * sin((vY * 6.0 + uFlow) * 6.2831853), 0.0), 8.0);
    vec3 col = uColorBody + uColorRim * (fres * 1.4 + pulse) * uGlow;
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

export function createTetherMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFlow: { value: 0 },
      uGlow: { value: 2 },
      uDissolve: { value: 0 },
      uColorBody: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: TETHER_VERTEX,
    fragmentShader: TETHER_FRAGMENT
  });

  /** @param {object} s { flow, dissolve } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uFlow.value = s.flow;
    u.uGlow.value = c.tetherGlow * g.glow;
    u.uDissolve.value = s.dissolve;
    u.uColorBody.value.copy(getColor(c.colorBlade));
    u.uColorRim.value.copy(getColor(c.colorRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The anchor                                                           */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vUv;

  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const ANCHOR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uFade;
  uniform vec3  uColorBody;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = atan(vUv.y, vUv.x) + uTime * 0.9 + uSeed;
    // Short ragged spikes round a black core.
    float spikes = pow(abs(cos(a * 4.0)), 10.0) * (0.6 + 0.4 * snoise(vec3(a, uTime * 2.0, uSeed)));
    float shell = 0.38 + 0.22 * spikes;
    float core = 1.0 - smoothstep(shell - 0.02, shell, r);
    float ring = exp(-pow(abs((r - shell) / 0.04), 2.0));
    float halo = exp(-max(r - shell, 0.0) * 6.0) * (1.0 - core) * 0.35;
    vec3 col = uColorBody * core + uColorRim * (ring * 2.0 + halo) * uGlow;
    float alpha = clamp(core + ring + halo, 0.0, 1.0) * uFade * (1.0 - smoothstep(0.85, 1.0, r));
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col * uGlobalGlow, alpha);
  }
`;

export function createAnchorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 0.6 },
      uSeed: { value: 0 },
      uGlow: { value: 2 },
      uFade: { value: 1 },
      uColorBody: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: ANCHOR_FRAGMENT
  });

  /** @param {object} s { center, seed, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = Math.max(0.05, c.anchorSize);
    u.uSeed.value = s.seed;
    u.uGlow.value = c.tetherGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    u.uColorBody.value.copy(getColor(c.colorBlade));
    u.uColorRim.value.copy(getColor(c.colorRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The smear                                                            */
/* -------------------------------------------------------------------- */

const SMEAR_VERTEX = /* glsl */ `
  uniform vec3  uPivot;
  uniform vec3  uSide;
  uniform float uLead;        // the edge's angle now, radians
  uniform float uSpan;        // signed radians it has swept behind it
  uniform float uRIn;
  uniform float uROut;

  varying vec2 vSm;           // x: 0 lead .. 1 tail, y: 0 inner .. 1 edge

  void main() {
    float th = uLead - position.x * uSpan;
    float r = mix(uRIn, uROut, position.y);
    vec3 world = uPivot + (uSide * sin(th) - vec3(0.0, 1.0, 0.0) * cos(th)) * r;
    vSm = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SMEAR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uStrength;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying vec2 vSm;

  ${noiseGLSL}

  void main() {
    float tail = 1.0 - vSm.x;
    float edgeTrack = pow(max(vSm.y, 0.0), 6.0);
    float body = pow(max(vSm.y, 0.0), 1.5) * 0.35;
    float streak = 0.75 + 0.25 * snoise(vec3(vSm.y * 14.0, vSm.x * 2.0 - uTime * 3.0, uSeed));
    float m = (edgeTrack + body) * tail * tail * streak * uStrength;
    m *= smoothstep(0.0, 0.06, vSm.x + 0.02) * smoothstep(0.0, 0.15, vSm.y);
    if (m < 0.003) discard;
    vec3 col = mix(uColorB, uColorA, edgeTrack * tail);
    gl_FragColor = vec4(col * m * uGlow * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

/** The arc the edge has just cut. */
export function createSmearMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uPivot: { value: new Vector3() },
      uSide: { value: new Vector3(1, 0, 0) },
      uLead: { value: 0 },
      uSpan: { value: 0.5 },
      uRIn: { value: 4 },
      uROut: { value: 5 },
      uSeed: { value: 0 },
      uGlow: { value: 2 },
      uStrength: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: SMEAR_VERTEX,
    fragmentShader: SMEAR_FRAGMENT
  });

  /** @param {object} s { pivot, side, lead, span, rIn, rOut, strength, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPivot.value.copy(s.pivot);
    u.uSide.value.copy(s.side);
    u.uLead.value = s.lead;
    u.uSpan.value = s.span;
    u.uRIn.value = s.rIn;
    u.uROut.value = s.rOut;
    u.uSeed.value = s.seed;
    u.uGlow.value = c.smearGlow * g.glow;
    u.uStrength.value = s.strength * g.opacity;
    u.uColorA.value.copy(getColor(c.colorSmearA));
    u.uColorB.value.copy(getColor(c.colorSmearB));
  };

  return material;
}

const SMEAR_WARP_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uShaderIntensity;
  uniform float uSpan;
  varying vec2 vSm;

  void main() {
    float tail = 1.0 - vSm.x;
    float mask = tail * smoothstep(0.0, 0.4, vSm.y) * smoothstep(0.0, 0.08, vSm.x);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    // Shoved along the swing: sideways on screen, the way the blade went.
    vec2 dir = vec2(-sign(uSpan), 0.25);
    gl_FragColor = vec4(normalize(dir) * 0.5 + 0.5, strength, mask);
  }
`;

/** The air the swing shoves aside — LAYER.DISTORTION. */
export function createSmearWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uPivot: { value: new Vector3() },
      uSide: { value: new Vector3(1, 0, 0) },
      uLead: { value: 0 },
      uSpan: { value: 0.5 },
      uRIn: { value: 4 },
      uROut: { value: 5 },
      uStrength: { value: 1 }
    }),
    vertexShader: SMEAR_VERTEX,
    fragmentShader: SMEAR_WARP_FRAGMENT
  });

  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uPivot.value.copy(s.pivot);
    u.uSide.value.copy(s.side);
    u.uLead.value = s.lead;
    u.uSpan.value = s.span;
    u.uRIn.value = s.rIn;
    u.uROut.value = s.rOut;
    u.uStrength.value = c.warpStrength * g.distortion * s.strength;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The cleft                                                            */
/* -------------------------------------------------------------------- */

const CLEFT_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform vec3  uAxis;        // along the cut
  uniform float uHalfLength;
  uniform float uHalfWidth;
  varying vec2 vC;            // metres: x along, y across

  void main() {
    vec3 across = normalize(cross(uAxis, vec3(0.0, 1.0, 0.0)));
    vec3 world = uCenter + uAxis * position.x * uHalfLength + across * position.y * uHalfWidth;
    world.y = 0.016;
    vC = vec2(position.x * uHalfLength, position.y * uHalfWidth);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const CLEFT_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uHalfLength;
  uniform float uGash;        // half-width of the gash, metres
  uniform float uOpen;        // 0..1 how far it has torn open
  uniform float uGlow;
  uniform float uHeat;        // 0..1 how hot the lips still are
  uniform float uErode;
  uniform float uOpacity;
  uniform vec3  uColorVoid;
  uniform vec3  uColorLip;
  uniform vec3  uColorCrack;
  uniform float uGlobalGlow;

  varying vec2 vC;

  ${noiseGLSL}

  void main() {
    float xn = vC.x / max(uHalfLength, 0.01);
    // Tears open from the middle out.
    float reach = uOpen;
    if (abs(xn) > reach) discard;
    float taper = sqrt(max(1.0 - pow(abs(xn) / max(reach, 0.01), 2.0), 0.0));
    float jag = snoise(vec3(vC.x * 3.0, uSeed, 0.0)) * 0.35 + snoise(vec3(vC.x * 9.0, uSeed, 1.0)) * 0.15;
    float w = uGash * taper * (1.0 + jag);
    float y = abs(vC.y + jag * uGash * 0.6);
    float inside = 1.0 - smoothstep(w * 0.8, w, y);
    float lip = exp(-pow(abs((y - w) / max(uGash * 0.35, 0.01)), 2.0));
    // Cracks running off the lips.
    float crack = pow(max(1.0 - abs(snoise(vec3(vC * 2.2, uSeed + 4.0))), 0.0), 14.0) * exp(-y / max(uGash * 3.0, 0.05)) * taper;

    vec3 col = uColorVoid * inside;
    // Lips on the ramp: violet body, white only on the hottest line.
    col += mix(uColorCrack, uColorLip, smoothstep(0.7, 1.0, lip) * uHeat) * lip * uGlow * uHeat;
    col += uColorCrack * crack * uGlow * 0.5 * uHeat;
    float a = max(inside, max(lip * uHeat, crack * 0.8));
    float n = snoise(vec3(vC * 1.7, uSeed * 3.0)) * 0.5 + 0.5;
    float thr = uErode * 1.2 - 0.1;
    a *= uErode <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.1, n);
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The gash the chop leaves in the floor. */
export function createCleftMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uAxis: { value: new Vector3(1, 0, 0) },
      uHalfLength: { value: 2 },
      uHalfWidth: { value: 1 },
      uSeed: { value: 0 },
      uGash: { value: 0.2 },
      uOpen: { value: 0 },
      uGlow: { value: 3 },
      uHeat: { value: 1 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uColorVoid: { value: new Color() },
      uColorLip: { value: new Color() },
      uColorCrack: { value: new Color() }
    }),
    vertexShader: CLEFT_VERTEX,
    fragmentShader: CLEFT_FRAGMENT
  });

  /** @param {object} s { center, axis, open, heat, erode, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uAxis.value.copy(s.axis);
    // The chop's cleft reads its own keys; the swing's slashes pass theirs.
    const gash = s.gash ?? c.cleftWidth;
    u.uHalfLength.value = Math.max(0.1, s.halfLength ?? c.cleftLength * 0.5);
    u.uHalfWidth.value = Math.max(0.1, gash * 4);
    u.uGash.value = gash;
    u.uSeed.value = s.seed;
    u.uOpen.value = s.open;
    u.uGlow.value = (s.glow ?? c.cleftGlow) * g.glow;
    u.uHeat.value = s.heat;
    u.uErode.value = s.erode;
    u.uOpacity.value = g.opacity;
    u.uColorVoid.value.copy(getColor(c.colorCleft));
    u.uColorLip.value.copy(getColor(c.colorEdge));
    u.uColorCrack.value.copy(getColor(c.colorRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The shadow pool                                                      */
/* -------------------------------------------------------------------- */

const POOL_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;
  varying vec2 vP;            // metres from the centre, on the floor

  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uRadius;
    world.y = 0.012;
    vP = position.xy * uRadius;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;
  uniform float uSpread;      // 0..1 how far it has spilled
  uniform float uErode;       // 0..1 drying off in the exit
  uniform float uSwirl;       // radians/second the veins turn
  uniform float uVeins;
  uniform float uGlow;
  uniform float uPulse;
  uniform float uOpacity;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  uniform vec3  uColorVein;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    float ang = atan(vP.y, vP.x);
    // The rim crawls: fbm tendrils that keep moving outward and round.
    vec3 rq = vec3(cos(ang) * 1.6, sin(ang) * 1.6, uTime * 0.45 + uSeed);
    float tend = fbm3(rq) * 0.5 + 0.5;
    float R = uRadius * uSpread * (0.62 + 0.42 * tend);
    float inside = 1.0 - smoothstep(R - 0.35, R, r);
    if (inside < 0.003) discard;

    // Swirled coordinates: the veins turn and are drawn in toward the centre.
    float a2 = ang + uTime * uSwirl + 1.4 / (0.6 + r);
    vec2 sw = vec2(cos(a2), sin(a2)) * r;
    vec3 q = vec3(sw * 0.75, r * 0.9 + uTime * 0.8 + uSeed * 2.0);
    float vein = pow(max(1.0 - abs(snoise(q)), 0.0), 9.0);
    float vein2 = pow(max(1.0 - abs(snoise(q * 2.1 + 5.0)), 0.0), 14.0);
    float mottled = fbm3(vec3(sw * 0.5, uTime * 0.3 + uSeed)) * 0.5 + 0.5;

    float rn = r / max(uRadius, 0.01);
    vec3 col = mix(uColorDeep, uColorBody, mottled * 0.6 * smoothstep(0.0, 0.7, rn));
    float v = (vein + vein2 * 0.6) * uVeins * (0.65 + 0.35 * uPulse);
    col += mix(uColorVein, uColorRim, smoothstep(0.5, 1.0, vein2)) * v * uGlow;
    // The lip of the pool: a violet glow where shadow meets floor.
    float lip = exp(-pow((r - R) / 0.28, 2.0));
    col += uColorVein * lip * uGlow * (0.5 + 0.5 * uPulse);

    float alpha = inside * mix(0.96, 0.75, smoothstep(0.5, 1.0, rn));
    float n = snoise(vec3(vP * 1.3, uSeed * 3.0)) * 0.5 + 0.5;
    float thr = uErode * 1.25 - 0.15;
    alpha *= uErode <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, n * 0.7 + (1.0 - rn) * 0.3);
    alpha = max(alpha, lip * 0.6 * (1.0 - uErode));
    alpha *= uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** The pool of shadow the chop spills — the linger's body. */
export function createShadowPoolMaterial() {
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
      uRadius: { value: 3 },
      uSeed: { value: 0 },
      uSpread: { value: 0 },
      uErode: { value: 0 },
      uSwirl: { value: 0.5 },
      uVeins: { value: 1 },
      uGlow: { value: 2 },
      uPulse: { value: 0 },
      uOpacity: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorVein: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT
  });

  /** @param {object} s { center, radius, spread, erode, pulse, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uRadius.value = Math.max(0.1, s.radius);
    u.uSeed.value = s.seed;
    u.uSpread.value = s.spread;
    u.uErode.value = s.erode;
    u.uSwirl.value = c.poolSwirl * g.noiseSpeed;
    u.uVeins.value = c.poolVeins;
    u.uGlow.value = c.poolGlow * g.glow;
    u.uPulse.value = s.pulse;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uColorDeep.value.copy(getColor(c.colorPoolDeep));
    u.uColorBody.value.copy(getColor(c.colorPoolBody));
    u.uColorVein.value.copy(getColor(c.colorPoolVein));
    u.uColorRim.value.copy(getColor(c.colorRim));
  };

  return material;
}
