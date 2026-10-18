import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Rewind Snare — the bespoke shaders the film and its cocoon are drawn with.
 *
 *  - **the film** (`createFilmMaterial`) — one strip of amber film, placed
 *    per vertex from film-metres: in *line* mode it lies down the cast line,
 *    fed forward into the circle; in *spiral* mode a point `ℓ` metres along
 *    the film sits `ℓ − wound` metres along an Archimedean spiral (arc length
 *    inverted in closed form), and anything wound past the spiral's inner end
 *    climbs a helix round the centre, turning from lying flat to standing up
 *    as it goes — that helix, packed tight, *is* the cocoon. The fragment
 *    stage draws real film: sprocket holes punched down both edges, frame
 *    lines, a ghost image in every frame that strobes as the film runs, a hot
 *    amber edge, a bright leading end while it unspools, and a burn that eats
 *    it frame by frame at the end.
 *  - **the clasps** (`createClaspMaterial`) — two bright bands that snap
 *    shut round the cocoon's top and bottom when it locks.
 *  - **the floor** (`createFloorMaterial`) — the circle's perforated rim and,
 *    during the rewind, chevrons racing inward and turning backward.
 *  - **the warp** (`createWarpMaterial`) — LAYER.DISTORTION: the air wrung
 *    round backward during the rewind, an implosion ring on the lock.
 *
 * `SPIRAL_GLSL` is the film's path; `RewindSnareAbility#_spiral*` its CPU
 * twin. Every material reads `settings.rewindsnare` in `userData.sync(state)`.
 */

const ID = 'rewindsnare';

/** The spiral and the coil. CPU twin: `RewindSnareAbility#_spiralTheta`. */
const SPIRAL_GLSL = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uR0;          // the spiral's inner radius
  uniform float uB;           // pitch / 2π
  uniform float uLf;          // metres of film on the full spiral
  uniform float uSpin;
  uniform float uCoilH;
  uniform float uCoilR;
  uniform float uLift;
  uniform float uWidth;

  /** Angle at arc length l along r = r0 + bθ (closed-form inverse). */
  float spiralTheta(float l) {
    return (-uR0 + sqrt(uR0 * uR0 + 2.0 * uB * max(l, 0.0))) / max(uB, 1e-4);
  }
`;

const FILM_VERTEX = /* glsl */ `
  uniform float uMode;        // 0 down the line, 1 round the spiral
  uniform vec3  uStart;       // line mode: where the film leaves the hand
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLineLen;     // line mode: hand to centre
  uniform float uFeed;        // line mode: metres fed forward into the reel
  uniform float uIn;          // spiral mode: metres wound back in
  uniform float uFlutter;
  uniform float uTime;

  varying float vL;           // film metres
  varying float vV;           // −1..1 across
  varying float vCoil;        // 0 on the floor .. 1 standing in the cocoon
  varying float vDist;        // line mode: metres from the hand
  varying float vViewZ;

  ${SPIRAL_GLSL}

  void main() {
    float v = position.y;
    vec3 P;
    vec3 across;
    float coil = 0.0;
    float l;
    if (uMode < 0.5) {
      l = position.x * uLineLen;
      float d = l + uFeed;
      P = uStart + uDir * d;
      P.y = uLift + sin(d * 3.0 - uTime * 8.0) * uFlutter * 0.5;
      across = uSide;
      vDist = d;
    } else {
      l = position.x * uLf;
      float q = l - uIn;
      if (q >= 0.0) {
        float th = spiralTheta(q);
        float r = uR0 + uB * th;
        float a = th + uSpin;
        vec3 radial = vec3(cos(a), 0.0, sin(a));
        P = uCenter + radial * r;
        P.y = uLift + sin(q * 2.2 - uTime * 6.0) * uFlutter;
        across = radial;
      } else {
        // Into the cocoon: a helix round the centre, standing up as it goes.
        float cd = -q;
        float rc = max(uCoilR, 0.05);
        float a = uSpin - cd / rc;
        vec3 radial = vec3(cos(a), 0.0, sin(a));
        coil = smoothstep(0.0, 1.4, cd);
        P = uCenter + radial * rc;
        P.y = uLift + cd * uCoilH / max(uLf, 1.0) + uWidth * 0.5 * coil;
        across = normalize(mix(radial, vec3(0.0, 1.0, 0.0), coil));
      }
      vDist = 0.0;
    }
    P += across * v * uWidth * 0.5;
    vL = l;
    vV = v;
    vCoil = coil;
    vec4 mv = viewMatrix * vec4(P, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FILM_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uMode;
  uniform float uOut;         // spiral: metres unspooled so far
  uniform float uFront;       // line: metres the film has reached
  uniform float uLineLen;
  uniform float uWidth;
  uniform float uFrame;
  uniform float uSprocket;
  uniform float uGlow;
  uniform float uEdgeGlow;
  uniform float uOpacity;
  uniform float uImageScale;
  uniform float uFlicker;
  uniform float uRun;         // 0..1 how fast it is running (strobe)
  uniform float uBurn;        // 0..1 burnt away
  uniform float uLock;        // 0..1 the lock's flare
  uniform vec3  uFilm;
  uniform vec3  uFilmDark;
  uniform vec3  uImage;
  uniform vec3  uEdge;
  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying float vL;
  varying float vV;
  varying float vCoil;
  varying float vDist;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    // What exists of it.
    if (uMode < 0.5) {
      if (vDist > uFront || vDist > uLineLen || vDist < 0.3) discard;
    } else {
      if (vL > uOut) discard;
    }

    float halfW = uWidth * 0.5;
    float x = abs(vV) * halfW;            // metres from the centreline
    float frameIdx = floor(vL / max(uFrame, 0.05));
    float fu = fract(vL / max(uFrame, 0.05));

    // Perforations: rounded holes down both edges, four to a frame.
    float sp = max(uFrame, 0.05) * 0.25;
    float hx = (fract(vL / sp) - 0.5) * sp;
    float hy = x - halfW * 0.81;
    vec2 hd = abs(vec2(hx, hy)) - vec2(uSprocket * 0.42, uSprocket * 0.32);
    float hole = 1.0 - smoothstep(-0.006, 0.004, length(max(hd, 0.0)) + min(max(hd.x, hd.y), 0.0) - 0.008);
    if (hole > 0.5) discard;

    // The burn: frame by frame, from the ragged noise edge.
    float bn = snoise01(vec3(vL * 1.3, vV * 2.0, uSeed)) * 0.6 + hash11(frameIdx + uSeed) * 0.4;
    float bt = uBurn * 1.15 - 0.1;
    if (uBurn > 0.0 && bn < bt) discard;
    float burnEdge = uBurn > 0.0 ? 1.0 - smoothstep(bt, bt + 0.06, bn) : 0.0;

    float edgeBand = smoothstep(halfW * 0.64, halfW * 0.68, x);
    float frameLine = 1.0 - smoothstep(0.0, 0.035, min(fu, 1.0 - fu));
    float inFrame = (1.0 - edgeBand) * (1.0 - frameLine);

    // A ghost image in every frame: different for each, strobing as it runs.
    vec2 fp = vec2(fu - 0.5, vV * 0.6);
    float img = fbm3(vec3(fp * uImageScale * 2.0, frameIdx * 1.7 + uSeed));
    float figure = smoothstep(0.25, 0.0, length(fp * vec2(1.6, 1.0) - vec2(0.0, 0.08))) * 0.6;
    img = clamp(img * 0.6 + 0.4 + figure, 0.0, 1.0);
    float strobe = 1.0 - uFlicker * uRun * step(0.55, hash11(frameIdx * 3.1 + floor(uTime * 14.0)));

    vec3 col = mix(uFilmDark, uFilm, 0.55) * 0.6;
    col += uImage * img * inFrame * uGlow * strobe * uShaderIntensity;
    col = mix(col, uFilmDark * 0.6, frameLine * (1.0 - edgeBand));
    // The hot amber edges.
    float rim = smoothstep(halfW * 0.86, halfW, x);
    col += uEdge * (rim * 1.4 + edgeBand * 0.35) * uEdgeGlow;
    // The leading end of the unspooling film, and the lock's flare.
    if (uMode > 0.5) col += uEdge * exp(-(uOut - vL) * 2.0) * uEdgeGlow * 1.5;
    col += uEdge * uLock * (0.6 + vCoil) * 2.0;
    col += uEdge * burnEdge * 6.0;

    float a = uOpacity * mix(0.75, 1.0, edgeBand + frameLine);
    vec2 suv = gl_FragCoord.xy / uResolution;
    a *= softFade(uSceneDepth, suv, vViewZ, uCameraNear, uCameraFar, 0.05);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, a);
  }
`;

export function createFilmMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uMode: { value: 1 },
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLineLen: { value: 10 },
      uFeed: { value: 0 },
      uFront: { value: 0 },
      uIn: { value: 0 },
      uOut: { value: 0 },
      uFlutter: { value: 0.05 },
      uCenter: { value: new Vector3() },
      uR0: { value: 1.2 },
      uB: { value: 0.16 },
      uLf: { value: 60 },
      uSpin: { value: 0 },
      uCoilH: { value: 2.5 },
      uCoilR: { value: 1.2 },
      uLift: { value: 0.05 },
      uWidth: { value: 0.5 },
      uSeed: { value: 0 },
      uFrame: { value: 0.42 },
      uSprocket: { value: 0.07 },
      uGlow: { value: 2 },
      uEdgeGlow: { value: 3 },
      uOpacity: { value: 0.9 },
      uImageScale: { value: 2 },
      uFlicker: { value: 0.3 },
      uRun: { value: 0 },
      uBurn: { value: 0 },
      uLock: { value: 0 },
      uFilm: { value: new Color() },
      uFilmDark: { value: new Color() },
      uImage: { value: new Color() },
      uEdge: { value: new Color() }
    }),
    vertexShader: FILM_VERTEX,
    fragmentShader: FILM_FRAGMENT
  });

  /**
   * @param {object} s { mode, start, dir, side, lineLen, feed, front, center, r0, b, lf,
   *                     wound, out, spin, coilR, run, burn, lock, seed }
   */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uMode.value = s.mode;
    u.uStart.value.copy(s.start);
    u.uDir.value.copy(s.dir);
    u.uSide.value.copy(s.side);
    u.uLineLen.value = Math.max(0.1, s.lineLen);
    u.uFeed.value = s.feed;
    u.uFront.value = s.front;
    u.uIn.value = s.wound;
    u.uOut.value = s.out;
    u.uFlutter.value = c.flutter * g.noiseStrength * s.run;
    u.uCenter.value.copy(s.center);
    u.uR0.value = s.r0;
    u.uB.value = s.b;
    u.uLf.value = s.lf;
    u.uSpin.value = s.spin;
    u.uCoilH.value = c.coilHeight;
    u.uCoilR.value = s.coilR;
    u.uLift.value = c.lift;
    u.uWidth.value = Math.max(0.05, c.filmWidth);
    u.uSeed.value = s.seed;
    u.uFrame.value = Math.max(0.05, c.frameLength);
    u.uSprocket.value = c.sprocketSize;
    u.uGlow.value = c.filmGlow * g.glow;
    u.uEdgeGlow.value = c.edgeGlow * g.glow;
    u.uOpacity.value = c.filmOpacity * g.opacity;
    u.uImageScale.value = c.imageScale * g.noiseFrequency;
    u.uFlicker.value = c.flicker;
    u.uRun.value = s.run;
    u.uBurn.value = s.burn;
    u.uLock.value = s.lock;
    u.uFilm.value.copy(getColor(c.colorFilm));
    u.uFilmDark.value.copy(getColor(c.colorFilmDark));
    u.uImage.value.copy(getColor(c.colorImage));
    u.uEdge.value.copy(getColor(c.colorEdge));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The clasps                                                           */
/* -------------------------------------------------------------------- */

const CLASP_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uWidth;
  uniform float uSnap;        // 0..1 closing: it spins shut from a wider ring

  varying vec2 vBand;

  void main() {
    float a = position.x * 6.2831853 + (1.0 - uSnap) * 2.5;
    float r = uRadius * (1.0 + (1.0 - uSnap) * 0.8);
    vec3 radial = vec3(cos(a), 0.0, sin(a));
    vec3 world = uCenter + radial * r + vec3(0.0, uHeight + position.y * uWidth * 0.5, 0.0);
    vBand = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const CLASP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uSnap;
  uniform float uFade;
  uniform vec3  uColor;
  uniform float uGlobalGlow;

  varying vec2 vBand;

  void main() {
    // Closing: the band exists over the share of the circle it has swept.
    if (vBand.x > uSnap) discard;
    float edge = 1.0 - smoothstep(0.5, 1.0, abs(vBand.y));
    float rivets = smoothstep(0.75, 0.95, cos(vBand.x * 6.2831853 * 12.0)) * (1.0 - smoothstep(0.0, 0.4, abs(vBand.y)));
    float a = edge * uFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor * uGlow * (0.7 + rivets * 1.5) * a * uGlobalGlow, a);
  }
`;

export function createClaspMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uRadius: { value: 0.7 },
      uHeight: { value: 0.3 },
      uWidth: { value: 0.15 },
      uSnap: { value: 0 },
      uGlow: { value: 4 },
      uFade: { value: 1 },
      uColor: { value: new Color() }
    }),
    vertexShader: CLASP_VERTEX,
    fragmentShader: CLASP_FRAGMENT
  });

  /** @param {object} s { center, radius, height, snap, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uRadius.value = s.radius;
    u.uHeight.value = s.height;
    u.uWidth.value = c.claspWidth;
    u.uSnap.value = s.snap;
    u.uGlow.value = c.claspGlow * settings.global.glow;
    u.uFade.value = s.fade * settings.global.opacity;
    u.uColor.value.copy(getColor(c.colorClasp));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The floor                                                            */
/* -------------------------------------------------------------------- */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uSize;
  varying vec2 vXZ;
  void main() {
    vec3 world = uCenter + vec3(position.x, 0.0, position.y) * uSize;
    world.y = 0.012;
    vXZ = position.xy * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uRadius;
  uniform float uRimWidth;
  uniform float uRimGlow;
  uniform float uChevrons;
  uniform float uChevronGlow;
  uniform float uRewind;      // 0..1 how hard it is rewinding
  uniform float uPhase;       // integrated: chevrons run inward
  uniform float uSpin;        // and turn backward
  uniform float uDraw;        // 0..1 the rim drawn round
  uniform float uOpacity;
  uniform vec3  uRim;
  uniform vec3  uChevron;
  uniform float uGlobalGlow;

  varying vec2 vXZ;

  void main() {
    float r = length(vXZ);
    float ang = atan(vXZ.y, vXZ.x);
    float a01 = fract(ang * 0.15915494 + 1.0);
    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // The rim: a perforated band — the edge of a reel.
    float dr = abs(r - uRadius);
    float band = 1.0 - smoothstep(uRimWidth * 0.5, uRimWidth * 0.5 + 0.02, dr);
    float perf = step(0.5, fract(a01 * uRadius * 6.0));
    float rim = band * mix(1.0, 0.35, perf) * step(a01, uDraw);
    col += uRim * rim * uRimGlow;
    alpha = max(alpha, rim);

    // Chevrons racing inward and turning backward while it rewinds.
    float inside = 1.0 - smoothstep(uRadius - 0.4, uRadius, r);
    float sector = fract((ang - uSpin) * uChevrons / 6.2831853) - 0.5;
    float chev = fract(r * 0.9 + abs(sector) * 0.9 + uPhase);
    float m = smoothstep(0.0, 0.08, chev) * (1.0 - smoothstep(0.14, 0.24, chev));
    m *= inside * smoothstep(0.6, 1.4, r) * uRewind;
    col += uChevron * m * uChevronGlow;
    alpha = max(alpha, m);

    float a = clamp(alpha, 0.0, 1.0) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, a);
  }
`;

export function createFloorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 5 },
      uRadius: { value: 4.6 },
      uRimWidth: { value: 0.08 },
      uRimGlow: { value: 1.5 },
      uChevrons: { value: 9 },
      uChevronGlow: { value: 2 },
      uRewind: { value: 0 },
      uPhase: { value: 0 },
      uSpin: { value: 0 },
      uDraw: { value: 0 },
      uOpacity: { value: 1 },
      uRim: { value: new Color() },
      uChevron: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} s { center, draw, rewind, phase, spin, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = c.zoneRadius + 0.6;
    u.uRadius.value = Math.max(0.3, c.zoneRadius);
    u.uRimWidth.value = c.rimWidth;
    u.uRimGlow.value = c.rimGlow * g.glow;
    u.uChevrons.value = Math.max(1, Math.round(c.chevrons));
    u.uChevronGlow.value = c.chevronGlow * g.glow;
    u.uRewind.value = s.rewind;
    u.uPhase.value = s.phase;
    u.uSpin.value = s.spin;
    u.uDraw.value = s.draw;
    u.uOpacity.value = c.floorOpacity * g.opacity * s.fade;
    u.uRim.value.copy(getColor(c.colorRim));
    u.uChevron.value.copy(getColor(c.colorChevron));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The warp — LAYER.DISTORTION                                          */
/* -------------------------------------------------------------------- */

const WARP_VERTEX = /* glsl */ `
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

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uWring;       // 0..1 the rewind's backward twist
  uniform float uImplode;     // 0..1 the lock's ring, running inward (0 = none)
  uniform float uStrength;
  uniform float uLockStrength;
  uniform float uShaderIntensity;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    vec2 dir = vUv / max(r, 1e-4);
    vec2 tang = vec2(dir.y, -dir.x);
    float m = uWring * smoothstep(0.05, 0.3, r) * (1.0 - smoothstep(0.6, 1.0, r));
    vec2 off = (tang * 0.8 - dir * 0.3) * m * (0.7 + 0.3 * snoise(vec3(vUv * 3.0, uTime)));
    float strength = uStrength * m;
    if (uImplode > 0.0 && uImplode < 1.0) {
      float R = 1.0 - uImplode * 0.95;
      float d = (r - R) / 0.08;
      float k = exp(-d * d) * (1.0 - uImplode * 0.6);
      off -= dir * clamp(-d * exp(-d * d) * 2.0, -1.0, 1.0) * k;
      strength = max(strength, uLockStrength * k);
    }
    strength *= uShaderIntensity;
    if (strength < 0.002) discard;
    float len = length(off);
    if (len > 1.0) off /= len;
    gl_FragColor = vec4(off * 0.5 + 0.5, strength, 1.0);
  }
`;

export function createWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 5 },
      uWring: { value: 0 },
      uImplode: { value: 0 },
      uStrength: { value: 1 },
      uLockStrength: { value: 1 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { center, size, wring, implode } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = s.size;
    u.uWring.value = s.wring;
    u.uImplode.value = s.implode;
    u.uStrength.value = c.rewindWarp * g.distortion;
    u.uLockStrength.value = c.lockWarp * g.distortion;
  };

  return material;
}
