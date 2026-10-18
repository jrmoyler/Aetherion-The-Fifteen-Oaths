import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Event Horizon — the bespoke shaders.
 *
 * The other gravity spells in the sandbox are *wells* and *holes* — a sphere,
 * a disc, a funnel in the floor. This one is a **surface**: the horizon itself,
 * stood up round the whole circle as a wall of absolute black and then closed
 * like a drawstring.
 *
 *  - **the wall** — a cylinder in parameter space: radius, height, helical
 *    slant and the split along the shear plane are uniforms. Near-black and
 *    nearly opaque, with light streaming round it in helical bands (frame
 *    dragging) that wind tighter as it narrows, a blazing photon ring on its
 *    lip, a bright seam where it meets the floor and a violet lensing rim at
 *    its silhouette. At the shear the column parts along a plane — the top
 *    twists one way and lifts, the bottom the other way and sinks, both cut
 *    faces white-hot — and then shreds away on noise.
 *  - **the floor** — inside the wall, the void: black, with stars swirled by
 *    the lensing toward the middle. Outside it, every streak of light on the
 *    floor is being drawn inward. After the shear, concentric sheared rings
 *    burnt into the stone.
 *  - **the shear blade** — a horizontal annulus of light racing outward from
 *    the column at the shear height.
 *  - **the seed** — the thrown singularity: a black bead inside a thin
 *    photon ring.
 *  - **the lens** — `LAYER.DISTORTION`: the frame pinched toward the column,
 *    then a push ring at the shear.
 *
 * Every material reads `settings.horizon` in `userData.sync(state)`.
 */

const ID = 'horizon';

/* -------------------------------------------------------------------- */
/* The wall                                                             */
/* -------------------------------------------------------------------- */

const WALL_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uSlant;       // radians of helical wind, bottom to top
  uniform float uSpin;
  uniform float uShearH;      // metres up the shear plane is
  uniform float uShearTwist;  // radians each half has turned
  uniform float uSplit;       // metres each half has moved apart
  uniform float uGrow;        // 0..1 how much of the wall has risen

  varying float vX;
  varying float vY;
  varying float vH;
  varying float vSide;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  void main() {
    float y = position.y * uGrow;
    float h = y * uHeight;
    float upper = step(uShearH, h);
    float sgn = upper * 2.0 - 1.0;
    float parted = step(0.0001, uSplit + abs(uShearTwist));
    float ang = position.x * 6.2831853 + uSlant * y + uSpin + sgn * uShearTwist * parted;
    vec3 radial = vec3(cos(ang), 0.0, sin(ang));
    vec3 world = uCenter + radial * uRadius + vec3(0.0, h + sgn * uSplit * parted, 0.0);
    vX = position.x;
    vY = y;
    vH = h;
    vSide = upper;
    vNormalW = radial;
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const WALL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uHeight;
  uniform float uGrow;
  uniform float uBands;
  uniform float uBandTilt;
  uniform float uFlow;
  uniform float uBandGlow;
  uniform float uRingGlow;
  uniform float uRingWidth;
  uniform float uBaseGlow;
  uniform float uFresnel;
  uniform float uOpacity;
  uniform float uShearH;
  uniform float uSplit;
  uniform float uCutGlow;
  uniform float uShred;       // 0 whole .. 1 gone
  uniform vec3  uColorVoid;
  uniform vec3  uColorBand;
  uniform vec3  uColorRing;
  uniform vec3  uColorHalo;
  uniform vec3  uColorBase;
  uniform float uGlobalGlow;

  varying float vX;
  varying float vY;
  varying float vH;
  varying float vSide;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  ${noiseGLSL}

  void main() {
    // The triangles that straddle the shear plane are torn open, not stretched.
    if (uSplit > 0.001 && vSide > 0.03 && vSide < 0.97) discard;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float facing = abs(dot(N, V));
    float rim = pow(1.0 - facing, 3.0) * uFresnel;
    bool inner = dot(N, V) < 0.0;

    // Light dragged round the horizon in helical bands.
    float bandCoord = vX * uBands + vY * uBandTilt - uFlow;
    float bands = pow(abs(sin(3.14159265 * bandCoord)), 28.0);
    float flick = 0.55 + 0.45 * snoise(vec3(vX * 18.0, vY * 4.0 - uFlow * 0.5, uSeed));
    float lip = exp(-pow((uGrow - vY) / max(uRingWidth, 0.003), 2.0));
    float base = exp(-vH * 7.0);
    float cut = uSplit > 0.001 ? exp(-abs(vH - uShearH) * 9.0) : 0.0;

    vec3 col = uColorVoid;
    col += uColorBand * bands * flick * uBandGlow * (inner ? 0.35 : 1.0);
    col += uColorHalo * rim;
    col += mix(uColorHalo, uColorRing, lip) * lip * uRingGlow;
    col += uColorBase * base * uBaseGlow;
    col += uColorRing * cut * uCutGlow;

    float a = uOpacity * (inner ? 0.85 : 1.0);
    a = max(a, clamp(lip + base * 0.5, 0.0, 1.0));

    // Shredding away after the shear, from the cut outward.
    if (uShred > 0.0) {
      float n = snoise(vec3(vX * 22.0, vH * 1.6, uSeed * 3.0)) * 0.5 + 0.5;
      float field = n * 0.7 + (1.0 - exp(-abs(vH - uShearH) * 0.8)) * 0.3;
      float thr = uShred * 1.15 - 0.05;
      if (field < thr) discard;
      float edge = 1.0 - smoothstep(thr, thr + 0.06, field);
      col += uColorRing * edge * 5.0;
    }
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

/** The horizon. Normal blending: it has to be *black*; its light is HDR. */
export function createWallMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 5 },
      uHeight: { value: 2.6 },
      uSlant: { value: 0 },
      uSpin: { value: 0 },
      uShearH: { value: 1.1 },
      uShearTwist: { value: 0 },
      uSplit: { value: 0 },
      uGrow: { value: 0 },
      uSeed: { value: 0 },
      uBands: { value: 18 },
      uBandTilt: { value: 0 },
      uFlow: { value: 0 },
      uBandGlow: { value: 2 },
      uRingGlow: { value: 6 },
      uRingWidth: { value: 0.035 },
      uBaseGlow: { value: 3 },
      uFresnel: { value: 2 },
      uOpacity: { value: 0.93 },
      uCutGlow: { value: 5 },
      uShred: { value: 0 },
      uColorVoid: { value: new Color() },
      uColorBand: { value: new Color() },
      uColorRing: { value: new Color() },
      uColorHalo: { value: new Color() },
      uColorBase: { value: new Color() }
    }),
    vertexShader: WALL_VERTEX,
    fragmentShader: WALL_FRAGMENT
  });

  /** @param {object} state { center, radius, height, slant, spin, grow, twist, split, flow, shred, power, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uRadius.value = Math.max(0.05, state.radius);
    u.uHeight.value = Math.max(0.05, state.height);
    u.uSlant.value = state.slant;
    u.uSpin.value = state.spin;
    u.uShearH.value = c.shearHeight;
    u.uShearTwist.value = state.twist;
    u.uSplit.value = state.split;
    u.uGrow.value = state.grow;
    u.uSeed.value = state.seed;
    u.uBands.value = Math.max(1, Math.round(c.bandCount));
    // As the slant winds the wall, the bands follow it into helices.
    u.uBandTilt.value = (state.slant / (Math.PI * 2)) * Math.max(1, Math.round(c.bandCount)) * c.bandFollow;
    u.uFlow.value = state.flow;
    u.uBandGlow.value = c.bandGlow * g.glow * g.shaderIntensity;
    u.uRingGlow.value = c.ringGlow * g.glow;
    u.uRingWidth.value = c.ringWidth;
    u.uBaseGlow.value = c.baseGlow * g.glow;
    u.uFresnel.value = c.wallFresnel * g.fresnel;
    u.uOpacity.value = c.wallOpacity * g.opacity * state.power;
    u.uCutGlow.value = c.cutGlow * g.glow;
    u.uShred.value = state.shred;
    u.uColorVoid.value.copy(getColor(c.colorVoid));
    u.uColorBand.value.copy(getColor(c.colorBand));
    u.uColorRing.value.copy(getColor(c.colorRing));
    u.uColorHalo.value.copy(getColor(c.colorRingHalo));
    u.uColorBase.value.copy(getColor(c.colorBase));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The floor                                                            */
/* -------------------------------------------------------------------- */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2  vP;

  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    world.y = 0.016;
    vP = position.xy * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uZone;
  uniform float uR;            // the wall's radius now
  uniform float uGrow;         // 0..1 the wall has stood up
  uniform float uStars;
  uniform float uStarGlow;
  uniform float uSwirl;
  uniform float uStreaks;
  uniform float uStreakGlow;
  uniform float uInfall;       // phase of the inward drift
  uniform float uDim;          // how dark the pulled floor goes
  uniform float uScar;         // 0..1 the sheared rings after the cut
  uniform float uScarGlow;
  uniform float uFadeT;
  uniform float uErode;
  uniform float uOpacity;
  uniform vec3  uColorVoid;
  uniform vec3  uColorStar;
  uniform vec3  uColorStreak;
  uniform vec3  uColorScar;
  uniform float uGlobalGlow;

  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    if (r > uZone * 1.12) discard;
    float a = atan(vP.y, vP.x);
    float insideWall = (1.0 - smoothstep(uR - 0.06, uR, r)) * uGrow;
    float inZone = 1.0 - smoothstep(uZone * 0.98, uZone * 1.1, r);

    // The void: stars dragged into a spiral toward the middle.
    float sa = a + uSwirl / (r + 0.4) + uTime * 0.2;
    vec2 sp = vec2(sa * uStars * 0.16, log(r + 0.3) * uStars * 0.25);
    vec2 cell = floor(sp);
    vec2 f = fract(sp) - 0.5;
    float h = hash13(vec3(cell, uSeed));
    float star = step(0.82, h) * exp(-dot(f, f) * 90.0) * (0.6 + 0.4 * sin(uTime * 6.0 + h * 40.0));
    vec3 voidCol = uColorVoid + uColorStar * star * uStarGlow;

    // Outside the wall: streaks of light on the floor drawn inward.
    float lane = fract(a / 6.2831853 * uStreaks + snoise(vec3(r * 0.4, uSeed, 0.0)) * 0.3);
    float laneLine = pow(1.0 - abs(lane - 0.5) * 2.0, 14.0);
    float dash = pow(fract(r * 0.7 + uInfall + hash11(floor(a / 6.2831853 * uStreaks + 0.5)) * 3.0), 3.0);
    float outside = (1.0 - insideWall) * inZone * smoothstep(uR, uR + 0.4, r) * uGrow;
    vec3 streakCol = uColorStreak * laneLine * dash * uStreakGlow;

    // After the cut: concentric rings, sheared round as they were cut.
    float rings = pow(abs(sin(r * 5.0 + a * 0.5 + snoise(vec3(vP * 0.6, uSeed)) * 0.6)), 18.0);
    float scar = rings * uScar * inZone;

    vec3 col = mix(uColorVoid * 0.6, voidCol, insideWall);
    col += streakCol * outside;
    col += uColorScar * scar * uScarGlow;
    float alpha = max(insideWall * 0.96, outside * (uDim + laneLine * dash * 0.6));
    alpha = max(alpha, scar * 0.9);
    alpha = max(alpha, uScar * inZone * 0.35);

    float n = snoise(vec3(vP * 1.4, uSeed * 2.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.2 - 0.1;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.5, n, uErode));
    alpha *= vis * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/** The void inside the wall, the pull outside it, the scar after. */
export function createFloorMaterial() {
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
      uSize: { value: 6 },
      uSeed: { value: 0 },
      uZone: { value: 5 },
      uR: { value: 5 },
      uGrow: { value: 0 },
      uStars: { value: 60 },
      uStarGlow: { value: 2 },
      uSwirl: { value: 3 },
      uStreaks: { value: 40 },
      uStreakGlow: { value: 1.5 },
      uInfall: { value: 0 },
      uDim: { value: 0.3 },
      uScar: { value: 0 },
      uScarGlow: { value: 2 },
      uFadeT: { value: 0 },
      uErode: { value: 0.7 },
      uOpacity: { value: 1 },
      uColorVoid: { value: new Color() },
      uColorStar: { value: new Color() },
      uColorStreak: { value: new Color() },
      uColorScar: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} state { center, zone, radius, grow, infall, scar, fadeT, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = state.zone * 1.15;
    u.uSeed.value = state.seed;
    u.uZone.value = state.zone;
    u.uR.value = state.radius;
    u.uGrow.value = state.grow;
    u.uStars.value = c.starDensity;
    u.uStarGlow.value = c.starGlow * g.glow;
    u.uSwirl.value = c.lensSwirl * g.noiseStrength;
    u.uStreaks.value = Math.max(1, Math.round(c.streakCount));
    u.uStreakGlow.value = c.streakGlow * g.glow;
    u.uInfall.value = state.infall;
    u.uDim.value = c.floorDim;
    u.uScar.value = state.scar;
    u.uScarGlow.value = c.scarGlow * g.glow;
    u.uFadeT.value = state.fadeT;
    u.uErode.value = c.floorErode;
    u.uOpacity.value = g.opacity;
    u.uColorVoid.value.copy(getColor(c.colorFloorVoid));
    u.uColorStar.value.copy(getColor(c.colorStar));
    u.uColorStreak.value.copy(getColor(c.colorStreak));
    u.uColorScar.value.copy(getColor(c.colorScar));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* The shear blade                                                      */
/* -------------------------------------------------------------------- */

const BLADE_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uY;
  uniform float uR0;
  uniform float uR1;
  varying float vX;
  varying float vA;

  void main() {
    float r = mix(uR0, uR1, position.x);
    float a = position.y * 6.2831853;
    vec3 world = uCenter + vec3(cos(a) * r, uY, sin(a) * r);
    vX = position.x;
    vA = position.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const BLADE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uEdge;
  uniform float uPower;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;

  varying float vX;
  varying float vA;

  ${noiseGLSL}

  void main() {
    float lead = exp(-pow((1.0 - vX) / max(uEdge, 0.005), 2.0));
    float streak = 0.5 + 0.5 * snoise(vec3(vA * 60.0, vX * 2.0, uSeed));
    float body = pow(vX, 3.0) * 0.45 * streak;
    float m = (lead * 1.6 + body) * uPower;
    if (m < 0.004) discard;
    vec3 col = mix(uColorB, uColorA, lead);
    gl_FragColor = vec4(col * m * uGlow * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

/** The plane of light the column is cut along. Additive. */
export function createShearBladeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uY: { value: 1 },
      uR0: { value: 0.5 },
      uR1: { value: 1 },
      uSeed: { value: 0 },
      uGlow: { value: 4 },
      uEdge: { value: 0.05 },
      uPower: { value: 0 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: BLADE_VERTEX,
    fragmentShader: BLADE_FRAGMENT
  });

  /** @param {object} state { center, r0, r1, power, seed } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uY.value = c.shearHeight;
    u.uR0.value = state.r0;
    u.uR1.value = Math.max(state.r0 + 0.01, state.r1);
    u.uSeed.value = state.seed;
    u.uGlow.value = c.discGlow * g.glow;
    u.uEdge.value = c.discEdge;
    u.uPower.value = state.power * g.opacity;
    u.uColorA.value.copy(getColor(c.colorDisc));
    u.uColorB.value.copy(getColor(c.colorDiscEdge));
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Billboards — the seed and the lens                                   */
/* -------------------------------------------------------------------- */

const BILLBOARD_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2  vUv;

  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = uCenter + (right * position.x + up * position.y) * uSize;
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SEED_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3  uColorRing;
  uniform vec3  uColorHalo;
  uniform vec3  uColorVoid;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  void main() {
    float r = length(vUv);
    if (r > 1.0 || uIntensity <= 0.001) discard;
    float a = atan(vUv.y, vUv.x);
    float core = 1.0 - smoothstep(0.3, 0.34, r);
    // The photon ring, brighter on one limb (it is turning).
    float ring = exp(-pow((r - 0.37) / 0.025, 2.0)) * (0.7 + 0.3 * cos(a - uTime * 3.0));
    float halo = exp(-max(r - 0.37, 0.0) * 6.0) * (1.0 - core);
    vec3 col = uColorVoid * core + (uColorRing * ring * 3.0 + uColorHalo * halo) * uIntensity * uGlobalGlow;
    float m = max(core, clamp(ring + halo * 0.6, 0.0, 1.0)) * (1.0 - smoothstep(0.85, 1.0, r));
    gl_FragColor = vec4(col, m * min(uIntensity, 1.0));
  }
`;

/** The thrown singularity. Normal blending: its core is black. */
export function createSeedMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 0.5 },
      uIntensity: { value: 1 },
      uColorRing: { value: new Color() },
      uColorHalo: { value: new Color() },
      uColorVoid: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: SEED_FRAGMENT
  });

  /** @param {object} state { center, size, intensity } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.01, state.size);
    u.uIntensity.value = state.intensity * c.seedGlow * g.glow;
    u.uColorRing.value.copy(getColor(c.colorRing));
    u.uColorHalo.value.copy(getColor(c.colorRingHalo));
    u.uColorVoid.value.copy(getColor(c.colorVoid));
  };
  return material;
}

const LENS_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  uniform float uRing;
  uniform float uShaderIntensity;

  varying vec2 vUv;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    vec2 dir = vUv / max(r, 1e-4);
    float pinch = r * (1.0 - r) * 4.0;
    vec2 offset = -dir * pinch;
    float mask = pinch;
    if (uRing >= 0.0) {
      float d = (r - (0.08 + 0.9 * uRing)) / 0.1;
      offset = dir * (-d * exp(-d * d)) * 2.0 * (1.0 - uRing) + offset * (1.0 - uRing);
      mask = max(mask * (1.0 - uRing), exp(-d * d) * (1.0 - uRing));
    }
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    float len = length(offset);
    if (len > 1.0) offset /= len;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

/** The pull on the light round the horizon — LAYER.DISTORTION. */
export function createHorizonLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 3 },
      uStrength: { value: 1 },
      uRing: { value: -1 }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} state { center, size, strength, ring } */
  material.userData.sync = (state) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(state.center);
    u.uSize.value = Math.max(0.05, state.size);
    u.uStrength.value = c.lensStrength * g.distortion * state.strength;
    u.uRing.value = state.ring;
  };
  return material;
}
