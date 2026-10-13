import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Orbital Strike — the five bespoke shaders the strike is drawn with.
 *
 *  - **the laser** (`createOrbitalLaserMaterial`) — a cylinder between two
 *    world points built in the vertex stage (any orientation, no transform),
 *    with an `|N·V|` core, pulses racing toward the floor, a stutter, and a
 *    fade toward the sky so it never ends in a hard cap. Drawn twice: a hair-
 *    thin core and a soft halo wide enough to survive being sub-pixel.
 *  - **the reticle** (`createOrbitalReticleMaterial`) — a ground quad, all of
 *    it polar SDFs in metres: a segmented outer ring and a dashed inner ring
 *    turning opposite ways, major/minor ticks, a guide ring, a countdown
 *    sweep with a hot leading edge, a crosshair with a centre gap, warning
 *    triangles with an exclamation mark blinking round the circle, a faint hex
 *    grid, and the laser's hot spot. It is *painted* in an angular sweep as the
 *    spot circles the edge, tightens onto the circle as it counts down,
 *    flashes and blinks on lock, and burns away from the centre when the beam
 *    lands.
 *  - **the column** (`createOrbitalColumnMaterial`) — a parameter grid bent into
 *    a leaning, flaring cylinder, drawn in three layers (white core, pale mid,
 *    hot outer). Energy pours down it as fbm sampled on a *seamless* cylinder
 *    (cos/sin of the bearing, not the bearing), streaked vertically, brightest
 *    at the floor where it splashes, fading into the sky. It comes down as a
 *    front from orbit and is soft against the floor.
 *  - **the crater** (`createOrbitalCraterMaterial`) — a ground quad: a molten
 *    pool spreading under the beam, hottest where the beam is *now* (it
 *    sweeps), crusting over into a voronoi skin whose seams glow longest as it
 *    cools, a raised rim and a ring of scorch, eroding raggedly in the fade.
 *  - **the heat bend** (`createOrbitalWarpMaterial`) — a wider cylinder on
 *    `LAYER.DISTORTION`: rising, rippling air round the column.
 *
 * Every material reads `settings.orbital` in `userData.sync(state)`; `state`
 * carries only what the ability knows that the settings do not.
 */

/* -------------------------------------------------------------------- */
/* 1 · The laser                                                        */
/* -------------------------------------------------------------------- */

const LASER_VERTEX = /* glsl */ `
  uniform vec3  uFrom;        // the sky end
  uniform vec3  uTo;          // the floor end
  uniform float uRadius;

  varying float vAlong;       // metres from the sky end
  varying float vLength;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  void main() {
    vec3 axis = uTo - uFrom;
    float L = max(length(axis), 1e-4);
    vec3 w = axis / L;
    vec3 ref = abs(w.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 u = normalize(cross(ref, w));
    vec3 v = cross(w, u);
    float a = position.x * 6.2831853;
    vec3 n = u * cos(a) + v * sin(a);
    vec3 world = uFrom + w * position.y * L + n * uRadius;
    vAlong = position.y * L;
    vLength = L;
    vNormalW = n;
    vViewDir = cameraPosition - world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const LASER_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uLevel;
  uniform float uFlicker;
  uniform float uPulseScale;
  uniform float uPulsePhase;
  uniform float uHalo;
  uniform vec3  uColorCore;
  uniform vec3  uColor;
  uniform float uGlobalGlow;

  varying float vAlong;
  varying float vLength;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    float p = fract(vAlong * uPulseScale - uPulsePhase);
    float pulse = smoothstep(0.0, 0.05, p) * (1.0 - smoothstep(0.05, 0.3, p));
    float sky = smoothstep(0.0, vLength * 0.45, vAlong);
    float fl = 1.0 - uFlicker * step(0.6, hash11(floor(uTime * 30.0) + uSeed));
    vec3 col;
    float alpha;
    if (uHalo < 0.5) {
      float core = pow(ndv, 1.5);
      col = mix(uColor, uColorCore, core) * (1.0 + pulse * 1.5);
      alpha = core;
    } else {
      float soft = pow(ndv, 2.5);
      col = uColor * (0.6 + pulse);
      alpha = soft * 0.55;
    }
    alpha *= uLevel * sky * fl;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

export function createOrbitalLaserMaterial(halo = false) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFrom: { value: new Vector3() },
      uTo: { value: new Vector3() },
      uRadius: { value: 0.02 },
      uSeed: { value: 0 },
      uGlow: { value: 6 },
      uLevel: { value: 0 },
      uFlicker: { value: 0.3 },
      uPulseScale: { value: 0.35 },
      uPulsePhase: { value: 0 },
      uHalo: { value: halo ? 1 : 0 },
      uColorCore: { value: new Color() },
      uColor: { value: new Color() }
    }),
    vertexShader: LASER_VERTEX,
    fragmentShader: LASER_FRAGMENT
  });

  /** @param {object} s { from, to, level, width (× laserWidth), pulsePhase, seed } */
  material.userData.sync = (s) => {
    const c = settings.orbital;
    const g = settings.global;
    const u = material.uniforms;
    u.uFrom.value.copy(s.from);
    u.uTo.value.copy(s.to);
    u.uRadius.value = Math.max(0.002, c.laserWidth * s.width * (halo ? 5 : 1));
    u.uSeed.value = s.seed;
    u.uGlow.value = c.laserGlow * g.glow * (halo ? 0.4 : 1);
    u.uLevel.value = s.level * g.opacity;
    u.uFlicker.value = Math.min(1, c.laserFlicker * g.randomness);
    u.uPulseScale.value = c.laserPulseScale;
    u.uPulsePhase.value = s.pulsePhase;
    u.uColorCore.value.copy(getColor(c.colorLaserCore));
    u.uColor.value.copy(getColor(c.colorLaser));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* 2 · The reticle                                                      */
/* -------------------------------------------------------------------- */

/** Unit quad (±1) laid on the floor at `uCentre`, `uSize` metres to an edge. */
const GROUND_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uSize;
  uniform float uLift;

  varying vec2 vP;            // metres from the centre, on the floor (x, z)

  void main() {
    vec2 p = position.xy * uSize;
    vec3 world = vec3(uCentre.x + p.x, uLift, uCentre.z + p.y);
    vP = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RETICLE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;      // current (tightened) radius, metres
  uniform float uSpinO;       // integrated
  uniform float uSpinI;       // integrated
  uniform float uSegments;
  uniform float uGap;
  uniform float uRingW;
  uniform float uInner;
  uniform float uTicks;
  uniform float uTickLen;
  uniform float uSweep;       // 0..1 countdown
  uniform float uSweepOpacity;
  uniform float uGlyphs;
  uniform float uGlyphSize;
  uniform float uGlyphR;
  uniform float uGlyphBlink;
  uniform float uCrossGap;
  uniform float uGrid;
  uniform float uLock;        // 0..1 the lock flash
  uniform float uLocked;      // 0/1
  uniform float uLockBlink;
  uniform float uPaint;       // 0..1 how much of the circle has been painted
  uniform float uPaintAngle;  // where the painting started
  uniform float uLevel;
  uniform float uBurn;        // 0..1 burnt away from the centre
  uniform vec2  uDot;         // the laser's spot, metres from the centre
  uniform float uDotSize;
  uniform float uDotLevel;
  uniform float uGlow;
  uniform vec3  uColor;
  uniform vec3  uColorHot;
  uniform vec3  uColorDeep;
  uniform float uGlobalGlow;

  varying vec2 vP;

  ${noiseGLSL}

  float band(float d, float w, float aa) {
    return 1.0 - smoothstep(w * 0.5, w * 0.5 + aa, abs(d));
  }

  // Equilateral triangle, side ~1.73, centred on its centroid (iq).
  float sdTri(vec2 p) {
    const float k = 1.7320508;
    p.x = abs(p.x) - 1.0;
    p.y = p.y + 1.0 / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0, 0.0);
    return -length(p) * sign(p.y);
  }

  float hexLines(vec2 uv) {
    const vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(uv, r) - h;
    vec2 b = mod(uv - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 q = abs(gv);
    float d = 0.5 - max(dot(q, vec2(0.5, 0.8660254)), q.x);
    return 1.0 - smoothstep(0.0, 0.05, d);
  }

  void main() {
    vec2 p = vP;
    float r = length(p);
    float th = atan(p.y, p.x);
    float t01 = th / 6.2831853 + 0.5;
    float aa = max(fwidth(r), 1e-4) * 1.2;
    float R = max(uRadius, 0.05);
    float w = max(uRingW, aa);

    // Painted in an angular sweep, starting where the spot first touched.
    float pa = fract((th - uPaintAngle) / 6.2831853);
    float painted = 1.0 - smoothstep(uPaint - 0.02, uPaint, pa);
    if (uPaint >= 1.0) painted = 1.0;

    /* outer ring, segmented, turning */
    float so = fract((th + uSpinO) / 6.2831853 * max(uSegments, 1.0));
    float gh = uGap * 0.5;
    float seg = smoothstep(gh, gh + 0.01, so) * (1.0 - smoothstep(1.0 - gh - 0.01, 1.0 - gh, so));
    float outer = band(r - R, w, aa) * seg;
    float guide = band(r - (R + uTickLen * 1.5 + w), w * 0.4, aa) * 0.7;

    /* ticks: every fourth one long */
    float tt = fract(t01 + uSpinO * 0.04);
    float ti = floor(tt * max(uTicks, 1.0));
    float major = mod(ti, 4.0) < 0.5 ? 1.0 : 0.55;
    float arc = abs(fract(tt * max(uTicks, 1.0)) - 0.5) * 6.2831853 * r / max(uTicks, 1.0);
    float tickLine = 1.0 - smoothstep(w * 0.35, w * 0.35 + aa, arc);
    float tick = tickLine * step(R + w, r) * (1.0 - step(R + w + uTickLen * major, r));

    /* inner ring, dashed, turning the other way */
    float RI = R * uInner;
    float si = fract((th + uSpinI) / 6.2831853 * 24.0);
    float inner = band(r - RI, w * 0.7, aa) * step(0.35, si);
    float innerSolid = band(r - RI * 0.35, w * 0.6, aa);

    /* countdown sweep, clockwise from the top */
    float ang = fract((1.5707963 - th) / 6.2831853);
    float inWedge = step(ang, uSweep) * (1.0 - smoothstep(RI - aa, RI, r));
    float lead = exp(-max(uSweep - ang, 0.0) * 14.0);
    float sweepLine = (1.0 - smoothstep(0.0, 0.006, abs(ang - uSweep))) * (1.0 - smoothstep(R - aa, R, r));
    float sweep = inWedge * (0.25 + lead) * uSweepOpacity;

    /* crosshair with a centre gap */
    float crossH = (band(p.x, w * 0.6, aa) + band(p.y, w * 0.6, aa))
                * step(R * uCrossGap, r) * (1.0 - smoothstep(RI - aa, RI, r));
    float pip = 1.0 - smoothstep(w * 1.2, w * 1.2 + aa, max(abs(p.x), abs(p.y)));

    /* warning glyphs, apex outward, blinking in turn */
    float glyph = 0.0;
    for (int i = 0; i < 8; i++) {
      if (float(i) >= uGlyphs) break;
      float gi = float(i);
      float ga = gi / max(uGlyphs, 1.0) * 6.2831853 + 0.7853981 - uSpinO * 0.25;
      vec2 out2 = vec2(cos(ga), sin(ga));
      vec2 tan2 = vec2(-out2.y, out2.x);
      vec2 d = p - out2 * R * uGlyphR;
      vec2 q = vec2(dot(d, tan2), dot(d, out2)) / max(uGlyphSize, 0.02);
      if (max(abs(q.x), abs(q.y)) > 0.8) continue;
      float s = sdTri(q * 2.3) / 2.3;
      float qa = aa / max(uGlyphSize, 0.02);
      float edge = 1.0 - smoothstep(0.025, 0.025 + qa, abs(s));
      float bar = (1.0 - smoothstep(0.035, 0.035 + qa, abs(q.x))) * step(-0.06, q.y) * step(q.y, 0.2);
      float dotm = 1.0 - smoothstep(0.045, 0.045 + qa, length(q - vec2(0.0, -0.15)));
      float fillT = (1.0 - smoothstep(-qa, 0.0, s)) * 0.18;
      float blink = 0.35 + 0.65 * step(0.45, fract(uTime * uGlyphBlink + gi * 0.27));
      glyph = max(glyph, (edge + bar + dotm + fillT) * blink);
    }

    /* faint hex grid inside the circle */
    float grid = hexLines(p * 2.2) * (1.0 - smoothstep(R * 0.92, R, r)) * uGrid;

    /* the laser's hot spot */
    float dd = length(p - uDot);
    float dotGlow = (exp(-dd * dd / max(uDotSize * uDotSize, 1e-4)) * 1.6
                  + band(dd - uDotSize * 1.6, w * 0.6, aa) * 0.8) * uDotLevel;

    float lines = (outer + guide + tick + inner + innerSolid + sweepLine * 1.4 + crossH + pip) * painted + glyph * painted;
    float lockPulse = uLocked > 0.5 ? (0.55 + 0.45 * step(0.5, fract(uTime * uLockBlink))) : 1.0;

    // Burnt away from the centre once the beam is down, with a hot edge.
    float burnR = uBurn * (R + uTickLen * 2.0) * 1.15;
    float burnt = smoothstep(burnR - 0.25, burnR, r + snoise(vec3(p * 1.5, uSeed)) * 0.2);
    float burnEdge = (burnt - smoothstep(burnR, burnR + 0.4, r)) * step(0.001, uBurn);
    float keep = mix(1.0, burnt, step(0.001, uBurn)) * uLevel;

    // Premultiplied: the hologram fades with uLevel, the laser's spot does not
    // (it is on the floor before the reticle is).
    vec3 col = (uColorDeep * (sweep * 1.5 + grid) * painted
             + uColor * lines * lockPulse
             + uColorHot * (lead * inWedge * 0.6 + sweepLine + uLock * lines + burnEdge * lines * 2.0) * painted) * keep
             + mix(uColor, uColorHot, 0.5) * dotGlow;
    float cover = ((lines * lockPulse + sweep + grid) * painted) * keep + dotGlow;
    if (cover < 0.004) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, 1.0);
  }
`;

export function createOrbitalReticleMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uSize: { value: 8 },
      uLift: { value: 0.03 },
      uSeed: { value: 0 },
      uRadius: { value: 4 },
      uSpinO: { value: 0 },
      uSpinI: { value: 0 },
      uSegments: { value: 8 },
      uGap: { value: 0.2 },
      uRingW: { value: 0.05 },
      uInner: { value: 0.6 },
      uTicks: { value: 48 },
      uTickLen: { value: 0.22 },
      uSweep: { value: 0 },
      uSweepOpacity: { value: 0.3 },
      uGlyphs: { value: 4 },
      uGlyphSize: { value: 0.42 },
      uGlyphR: { value: 0.8 },
      uGlyphBlink: { value: 5 },
      uCrossGap: { value: 0.3 },
      uGrid: { value: 0.12 },
      uLock: { value: 0 },
      uLocked: { value: 0 },
      uLockBlink: { value: 14 },
      uPaint: { value: 0 },
      uPaintAngle: { value: 0 },
      uLevel: { value: 0 },
      uBurn: { value: 0 },
      uDot: { value: new Vector2() },
      uDotSize: { value: 0.28 },
      uDotLevel: { value: 0 },
      uGlow: { value: 2.6 },
      uColor: { value: new Color() },
      uColorHot: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: RETICLE_FRAGMENT
  });

  /**
   * @param {object} s { centre, radius, spinO, spinI, sweep, lock, locked,
   *   paint, paintAngle, level, burn, dot (Vector2), dotLevel, seed }
   */
  material.userData.sync = (s) => {
    const c = settings.orbital;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = s.radius;
    u.uSize.value = s.radius + c.tickLength * 2 + c.ringWidth * 2 + 0.6;
    u.uSeed.value = s.seed;
    u.uSpinO.value = s.spinO;
    u.uSpinI.value = s.spinI;
    u.uSegments.value = Math.max(1, Math.round(c.segments));
    u.uGap.value = Math.min(0.9, Math.max(0, c.segmentGap));
    u.uRingW.value = c.ringWidth;
    u.uInner.value = c.innerRing;
    u.uTicks.value = Math.max(4, Math.round(c.ticks));
    u.uTickLen.value = c.tickLength;
    u.uSweep.value = s.sweep;
    u.uSweepOpacity.value = c.sweepOpacity;
    u.uGlyphs.value = Math.min(8, Math.max(0, Math.round(c.glyphCount)));
    u.uGlyphSize.value = c.glyphSize;
    u.uGlyphR.value = c.glyphRadius;
    u.uGlyphBlink.value = c.glyphBlink;
    u.uCrossGap.value = c.crossGap;
    u.uGrid.value = c.gridOpacity;
    u.uLock.value = s.lock * c.lockFlash;
    u.uLocked.value = s.locked ? 1 : 0;
    u.uLockBlink.value = c.lockBlink;
    u.uPaint.value = s.paint;
    u.uPaintAngle.value = s.paintAngle;
    u.uLevel.value = s.level * c.reticleOpacity * g.opacity;
    u.uBurn.value = s.burn;
    u.uDot.value.copy(s.dot);
    u.uDotSize.value = c.laserDot;
    u.uDotLevel.value = s.dotLevel;
    u.uGlow.value = c.reticleGlow * g.glow;
    u.uColor.value.copy(getColor(c.colorReticle));
    u.uColorHot.value.copy(getColor(c.colorReticleHot));
    u.uColorDeep.value.copy(getColor(c.colorReticleDeep));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* 3 · The column                                                       */
/* -------------------------------------------------------------------- */

const COLUMN_VERTEX = /* glsl */ `
  uniform vec3  uBase;        // the axis on the floor
  uniform vec3  uLean;        // where the top is, relative to straight up
  uniform float uHeight;
  uniform float uRadius;
  uniform float uFlare;
  uniform float uFlareH;
  uniform float uPulse;
  uniform float uPulsePhase;

  varying vec2  vCol;         // x: bearing 0..1, y: metres up
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  void main() {
    float a = position.x * 6.2831853;
    float h = position.y;
    float y = h * uHeight;
    float flare = 1.0 + uFlare * exp(-y / max(uFlareH, 0.05));
    float breathe = 1.0 + uPulse * sin(uPulsePhase + y * 0.35);
    float r = uRadius * flare * breathe;
    vec3 n = vec3(cos(a), 0.0, sin(a));
    vec3 world = uBase + uLean * h + vec3(0.0, y, 0.0) + n * r;
    vCol = vec2(position.x, y);
    vNormalW = n;
    vViewDir = cameraPosition - world;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const COLUMN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uHeight;
  uniform float uFront;       // metres up the falling front has reached down to
  uniform float uFlow;        // integrated, metres
  uniform float uEnergyScale;
  uniform float uContrast;
  uniform float uSharp;       // how tight this layer's body is
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uLevel;
  uniform float uSoftFade;
  uniform vec3  uColorIn;
  uniform vec3  uColorOut;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vCol;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float y = vCol.y;
    if (y < uFront) discard;
    float a = vCol.x * 6.2831853;
    float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    float body = pow(ndv, max(uSharp, 0.1));

    // Seamless round the cylinder: noise on (cos, sin) of the bearing.
    vec2 ring = vec2(cos(a), sin(a));
    float e = fbm3(vec3(ring * 1.6, (y + uFlow) * uEnergyScale * 0.25 + uSeed)) * 0.5 + 0.5;
    float streak = snoise(vec3(ring * 5.0, (y + uFlow * 0.6) * 0.04 + uSeed * 2.0)) * 0.5 + 0.5;
    float energy = mix(1.0, (e * 1.4 + streak * 0.6), uContrast * uShaderIntensity);

    float top = 1.0 - smoothstep(uHeight * 0.55, uHeight, y);
    float splash = 1.0 + 1.6 * exp(-y / 1.1);
    float front = 1.0 + 3.0 * exp(-(y - uFront) * 1.5) * step(0.01, uFront);

    vec3 col = mix(uColorOut, uColorIn, body) * energy * splash * front;
    float alpha = uLevel * uOpacity * body * top * clamp(energy, 0.0, 1.5);
    if (alpha < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uGlow * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * One layer of the column.
 * @param {'core'|'mid'|'outer'} layer
 */
export function createOrbitalColumnMaterial(layer) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uBase: { value: new Vector3() },
      uLean: { value: new Vector3() },
      uHeight: { value: 45 },
      uRadius: { value: 1 },
      uFlare: { value: 0.6 },
      uFlareH: { value: 1.4 },
      uPulse: { value: 0.1 },
      uPulsePhase: { value: 0 },
      uSeed: { value: 0 },
      uFront: { value: 0 },
      uFlow: { value: 0 },
      uEnergyScale: { value: 1 },
      uContrast: { value: 0.6 },
      uSharp: { value: 1 },
      uGlow: { value: 2 },
      uOpacity: { value: 1 },
      uLevel: { value: 0 },
      uSoftFade: { value: 0.6 },
      uColorIn: { value: new Color() },
      uColorOut: { value: new Color() }
    }),
    vertexShader: COLUMN_VERTEX,
    fragmentShader: COLUMN_FRAGMENT
  });

  /**
   * @param {object} s { base, lean, height, radius (outer, metres), front,
   *   flow, pulsePhase, level, seed }
   */
  material.userData.sync = (s) => {
    const c = settings.orbital;
    const g = settings.global;
    const u = material.uniforms;
    u.uBase.value.copy(s.base);
    u.uLean.value.copy(s.lean);
    u.uHeight.value = Math.max(1, s.height);
    const frac = layer === 'core' ? c.coreFrac : layer === 'mid' ? c.midFrac : 1;
    u.uRadius.value = Math.max(0.002, s.radius * frac);
    u.uFlare.value = c.beamFlare * (layer === 'core' ? 0.6 : 1);
    u.uFlareH.value = c.flareHeight;
    u.uPulse.value = c.beamPulse * (layer === 'outer' ? 1.4 : 0.7) * g.noiseStrength;
    u.uPulsePhase.value = s.pulsePhase + (layer === 'mid' ? 1.7 : layer === 'outer' ? 3.9 : 0);
    u.uSeed.value = s.seed + (layer === 'mid' ? 11 : layer === 'outer' ? 23 : 0);
    u.uFront.value = s.front;
    u.uFlow.value = s.flow * (layer === 'outer' ? 0.7 : 1);
    u.uEnergyScale.value = c.energyScale * g.noiseFrequency * (layer === 'core' ? 0.6 : 1);
    u.uContrast.value = c.energyContrast * (layer === 'core' ? 0.35 : layer === 'mid' ? 0.8 : 1);
    u.uSharp.value = layer === 'core' ? 0.5 : layer === 'mid' ? 1.2 : 2.2;
    u.uGlow.value = (layer === 'core' ? c.coreGlow : layer === 'mid' ? c.midGlow : c.outerGlow) * g.glow;
    u.uOpacity.value = layer === 'outer' ? c.outerOpacity : 1;
    u.uLevel.value = s.level * g.opacity;
    u.uSoftFade.value = c.softFade;
    if (layer === 'core') {
      u.uColorIn.value.copy(getColor(c.colorBeamCore));
      u.uColorOut.value.copy(getColor(c.colorBeamMid));
    } else if (layer === 'mid') {
      u.uColorIn.value.copy(getColor(c.colorBeamMid));
      u.uColorOut.value.copy(getColor(c.colorBeamOuter));
    } else {
      u.uColorIn.value.copy(getColor(c.colorBeamOuter));
      u.uColorOut.value.copy(getColor(c.colorBeamRim));
    }
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* 4 · The crater                                                       */
/* -------------------------------------------------------------------- */

const CRATER_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uSeed;
  uniform float uRadius;      // the crater's full radius, metres
  uniform float uForm;        // 0..1 how far it has spread
  uniform float uHeat;        // 0..1 the pool's heat
  uniform float uBeam;        // 0..1 the beam on it right now
  uniform vec2  uSpot;        // where the beam is, metres from the centre
  uniform float uSpotR;
  uniform float uMolten;
  uniform float uCells;
  uniform float uGlow;
  uniform float uCrackGlow;
  uniform float uRim;
  uniform float uScorch;
  uniform float uScorchOpacity;
  uniform float uFadeT;
  uniform float uOpacity;
  uniform vec3  uColorHot;
  uniform vec3  uColorWarm;
  uniform vec3  uColorCool;
  uniform vec3  uColorCrust;
  uniform vec3  uColorScorch;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

  varying vec2 vP;

  ${noiseGLSL}

  vec3 heatRamp(float h) {
    vec3 a = mix(uColorCool, uColorWarm, smoothstep(0.05, 0.5, h));
    return mix(a, uColorHot, smoothstep(0.55, 1.0, h));
  }

  void main() {
    vec2 p = vP;
    float r = length(p);
    float cr = max(uRadius * uForm, 0.05);
    float n1 = fbm3(vec3(p * 0.8, uSeed)) ;
    float rr = r + n1 * cr * 0.12;

    float scorch = 1.0 - smoothstep(cr * 0.7, cr * max(uScorch, 1.01), rr + fbm3(vec3(p * 2.0, uSeed * 2.0)) * 0.3);
    float pool = 1.0 - smoothstep(cr * uMolten * 0.8, cr * uMolten, rr);
    float bowl = 1.0 - smoothstep(cr * 0.85, cr, rr);
    float rimD = (rr - cr) / max(uRim * cr, 0.02);
    float rim = exp(-rimD * rimD * 2.0);

    vec2 vor = voronoi2(p * uCells + uSeed * 7.0);
    float crack = smoothstep(0.3, 0.55, vor.x);

    float hr = 1.0 - clamp(r / cr, 0.0, 1.0);
    float spot = exp(-length(p - uSpot) / max(uSpotR, 0.05));
    float h = clamp(uHeat * (0.5 + 0.5 * hr) + uBeam * spot * 0.8, 0.0, 1.2);

    // Hot, the pool is all molten; cooling, a crust closes over it and only
    // the seams stay open.
    float crust = smoothstep(0.7, 0.2, h);
    float molten = pool * mix(1.0, crack, crust);
    vec3 emit = heatRamp(h) * uGlow * molten * h;
    emit += heatRamp(h * 0.7 + 0.15) * uCrackGlow * crack * bowl * (1.0 - pool * (1.0 - crust)) * max(h, uHeat * 0.6) * 0.6;
    emit += uColorRim * rim * (h * 1.4 + 0.1 * uHeat) * uGlow * 0.4;

    vec3 base = mix(uColorScorch, uColorCrust * (0.7 + 0.3 * vor.y), bowl);
    base *= 1.0 - 0.35 * crack * bowl;
    vec3 col = base + emit * uGlobalGlow;
    float a = max(max(scorch * uScorchOpacity, bowl * 0.92), rim * 0.85 * step(0.0, cr * uScorch - r));

    float n = snoise(vec3(p * 0.9, uSeed * 5.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.55, n, 0.7));
    a *= vis * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The burnt-out ground. Normal blending — the scorch has to be dark. */
export function createOrbitalCraterMaterial() {
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
      uCentre: { value: new Vector3() },
      uSize: { value: 6 },
      uLift: { value: 0.016 },
      uSeed: { value: 0 },
      uRadius: { value: 3.4 },
      uForm: { value: 0 },
      uHeat: { value: 0 },
      uBeam: { value: 0 },
      uSpot: { value: new Vector2() },
      uSpotR: { value: 1 },
      uMolten: { value: 0.6 },
      uCells: { value: 1.8 },
      uGlow: { value: 4 },
      uCrackGlow: { value: 2.4 },
      uRim: { value: 0.16 },
      uScorch: { value: 1.35 },
      uScorchOpacity: { value: 0.85 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uColorHot: { value: new Color() },
      uColorWarm: { value: new Color() },
      uColorCool: { value: new Color() },
      uColorCrust: { value: new Color() },
      uColorScorch: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: CRATER_FRAGMENT
  });

  /** @param {object} s { centre, radius, form, heat, beam, spot (Vector2), spotR, fadeT, seed } */
  material.userData.sync = (s) => {
    const c = settings.orbital;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uRadius.value = Math.max(0.1, s.radius);
    u.uSize.value = Math.max(0.1, s.radius) * Math.max(1.05, c.scorchRadius) * 1.25 + 0.3;
    u.uSeed.value = s.seed;
    u.uForm.value = s.form;
    u.uHeat.value = s.heat;
    u.uBeam.value = s.beam;
    u.uSpot.value.copy(s.spot);
    u.uSpotR.value = s.spotR;
    u.uMolten.value = Math.min(0.98, Math.max(0.05, c.moltenFrac));
    u.uCells.value = c.craterCells * g.noiseFrequency;
    u.uGlow.value = c.craterGlow * g.glow;
    u.uCrackGlow.value = c.crackGlow * g.glow;
    u.uRim.value = Math.max(0.01, c.rimWidth);
    u.uScorch.value = Math.max(1.01, c.scorchRadius);
    u.uScorchOpacity.value = c.scorchOpacity;
    u.uFadeT.value = s.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorHot.value.copy(getColor(c.colorMoltenHot));
    u.uColorWarm.value.copy(getColor(c.colorMoltenWarm));
    u.uColorCool.value.copy(getColor(c.colorMoltenCool));
    u.uColorCrust.value.copy(getColor(c.colorCrust));
    u.uColorScorch.value.copy(getColor(c.colorScorch));
    u.uColorRim.value.copy(getColor(c.colorRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* 5 · The heat bend                                                    */
/* -------------------------------------------------------------------- */

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uHeight;
  uniform float uFront;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uShaderIntensity;

  varying vec2  vCol;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    float y = vCol.y;
    if (y < uFront) discard;
    float a = vCol.x * 6.2831853;
    vec2 ring = vec2(cos(a), sin(a));
    float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    // Air rising round the column: features climb, the beam's energy falls.
    vec3 np = vec3(ring * uScale, y * uScale * 0.35 - uTime * uSpeed + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(17.0, 3.0, 9.0)));
    float body = pow(ndv, 0.8) * (1.0 - smoothstep(6.0, 18.0, y));
    float strength = uStrength * uShaderIntensity * body;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(n * 0.5 + 0.5, strength, body);
  }
`;

export function createOrbitalWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uBase: { value: new Vector3() },
      uLean: { value: new Vector3() },
      uHeight: { value: 45 },
      uRadius: { value: 3 },
      uFlare: { value: 0.4 },
      uFlareH: { value: 1.4 },
      uPulse: { value: 0 },
      uPulsePhase: { value: 0 },
      uSeed: { value: 0 },
      uFront: { value: 0 },
      uStrength: { value: 1 },
      uScale: { value: 1.3 },
      uSpeed: { value: 5 }
    }),
    vertexShader: COLUMN_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s the column's state plus { strength } */
  material.userData.sync = (s) => {
    const c = settings.orbital;
    const g = settings.global;
    const u = material.uniforms;
    u.uBase.value.copy(s.base);
    u.uLean.value.copy(s.lean);
    u.uHeight.value = Math.max(1, s.height);
    u.uRadius.value = Math.max(0.05, s.radius * c.warpWidth);
    u.uFlare.value = c.beamFlare * 0.5;
    u.uFlareH.value = c.flareHeight;
    u.uSeed.value = s.seed;
    u.uFront.value = s.front;
    u.uStrength.value = s.strength * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
  };

  return material;
}
