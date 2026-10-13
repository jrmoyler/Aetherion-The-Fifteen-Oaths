import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * The bespoke surfaces of the Seraphic Descent. All of it is light — additive,
 * tone-mapping off so bloom picks up the hot parts — and all of it is shaped in
 * the vertex stage from uniforms and per-instance attributes the ability writes
 * in place, so a cast never rebuilds geometry.
 *
 *   - `createFeatherMaterial` — the wings. The *whole skeleton* lives here: the
 *     arched arm, the fold, the flap, the sweep and the feather fan are posed
 *     per vertex from ~15 uniforms, mirrored exactly by `wingPoint` in the
 *     ability (which needs the same points to launch darts and shed motes).
 *     The fragment stage draws a feather: a pointed asymmetric vane, raked
 *     barbs, a glowing rachis, splits torn into the vane, light running across
 *     the wing, a shoulder→tip reveal and a noise dissolve with a burning edge.
 *   - `createHaloMaterial` — a camera-facing ribbon round a tilted circle: a
 *     white core, gold glow, turning beads, drawn round from the front.
 *   - `createRayMaterial` — god-ray frustums: brightest through the middle of
 *     their silhouette (the volume trick: `|N·V|^k`), streaks pouring down,
 *     soft against the floor they stand on.
 *   - `createSigilMaterial` — the floor: rings, a radiant star, a band of
 *     turning runes, drawn on angularly and flaring on the beat.
 *   - `createDartMaterial` — a falling feather blade with a light trail; stays
 *     stuck in what it hit, glowing, then dissolves.
 *   - `createGlintMaterial` — camera-facing glints: the herald, the halo's
 *     bloom disc and a star of light at every landing.
 *   - `createWarpMaterial` — `LAYER.DISTORTION`: the beat's down-wash ring and
 *     a steady shimmer round the wings.
 *
 * All read `settings.seraph` through `material.userData.sync`, every frame.
 */

/* ==================================================================== */
/* Wings                                                                 */
/* ==================================================================== */

/**
 * The wing pose. Shared by the vertex shader and, line for line, by
 * `SeraphicDescentAbility#wingPoint`.
 *
 * In the wing's own plane (`u` outward from the shoulder, `v` up) the arm is a
 * quadratic Bézier (0,0) → (0.45, 0.7·lift) → (1, 0.25·lift), scaled by the
 * live span and turned about the shoulder by `uRot` (flap minus fold). Each
 * feather hangs off its point on the arm at the arm's own heading minus a fan
 * angle that is wide at the shoulder (secondaries hang down) and narrow at the
 * hand (primaries continue the arm). Folded (`uOpen` 0) the fan closes and every
 * feather lies along the arm. `uBend` curves a feather against the flap.
 *
 * Into the world: `side` (mirrored per wing) carries `u`, up carries `v`, and
 * the toward-the-caster axis carries the depth — covert rows layered forward,
 * the tips swept back, the stroke swinging them forward, each tip curled away.
 */
const WING_GLSL = /* glsl */ `
  uniform vec3  uCentre;
  uniform vec3  uSide;
  uniform vec3  uToward;
  uniform float uShoulder;
  uniform float uSpan;       // live span, metres
  uniform float uFullSpan;   // wingSpan, metres — the depth terms are normalised by it
  uniform float uLift;
  uniform float uRot;
  uniform float uOpen;
  uniform float uFanInner;
  uniform float uFanOuter;
  uniform float uBend;
  uniform float uSweepBack;
  uniform float uSweepFwd;
  uniform float uCurl;
  uniform float uLayerDepth;

  // Arm point and tangent at s, in the wing plane, already turned by uRot.
  void armAt(float s, out vec2 p, out vec2 t) {
    float l = uLift;
    vec2 P1 = vec2(0.45, 0.7 * l);
    vec2 P2 = vec2(1.0, 0.25 * l);
    p = (2.0 * (1.0 - s) * s * P1 + s * s * P2) * uSpan;
    t = 2.0 * (1.0 - s) * P1 + 2.0 * s * (P2 - P1);
    float c = cos(uRot), sn = sin(uRot);
    p = vec2(c * p.x - sn * p.y, sn * p.x + c * p.y);
    t = vec2(c * t.x - sn * t.y, sn * t.x + c * t.y);
  }

  // World point of a feather at fraction y along it; also its 2D heading.
  vec3 featherPoint(float s, float side, float jitter, float len, float y, float layer, out float theta) {
    vec2 p, t;
    armAt(s, p, t);
    float fan = mix(uFanInner, uFanOuter, pow(s, 0.8)) * uOpen;
    theta = atan(t.y, t.x) - fan + jitter;
    float chord = theta - uBend * y * 0.5;
    vec2 f = p + vec2(cos(chord), sin(chord)) * len * y;
    float k = f.x / max(uFullSpan, 0.1);
    float z = layer * uLayerDepth - uSweepBack * k * k + uSweepFwd * k - uCurl * y * y;
    return uCentre + uSide * side * (uShoulder + f.x) + vec3(0.0, f.y, 0.0) + uToward * z;
  }
`;

const FEATHER_VERTEX = /* glsl */ `
  attribute vec4 aFeather; // s, row, side, seed
  attribute vec4 aShape;   // length, half-width, jitter, layer

  uniform float uReveal;
  uniform float uRevealSoft;

  varying vec2  vQ;        // across −1..1, along 0..1
  varying vec4  vFeather;
  varying float vShown;    // 0..1 how far down its length the reveal has reached
  varying vec3  vWorld;

  ${WING_GLSL}

  void main() {
    vFeather = aFeather;
    float s = aFeather.x;
    float side = aFeather.z;
    // The reveal runs out along the arm, then down each feather.
    float local = (uReveal * (1.0 + uRevealSoft) - s - aFeather.y * 0.04) / max(uRevealSoft, 0.02);
    vShown = clamp(local, 0.0, 1.0);
    if (aShape.x <= 0.0 || local <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    float y = position.y;
    float theta;
    vec3 world = featherPoint(s, side, aShape.z, aShape.x, y, aShape.w, theta);
    float heading = theta - uBend * y;
    // Across the vane, in the wing plane: the 2D perpendicular, mirrored per wing.
    vec3 across = uSide * side * (-sin(heading)) + vec3(0.0, cos(heading), 0.0);
    world += across * position.x * aShape.y;

    vQ = vec2(position.x, y);
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FEATHER_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uRachisGlow;
  uniform float uRachisWidth;
  uniform float uBarbScale;
  uniform float uBarbSlant;
  uniform float uBarbContrast;
  uniform float uTear;
  uniform float uTearScale;
  uniform float uTipGlow;
  uniform float uShimmer;
  uniform float uShimmerSpeed;
  uniform float uDissolve;
  uniform float uDissolveEdge;
  uniform float uDissolveGlow;
  uniform vec3  uColorRoot;
  uniform vec3  uColorBody;
  uniform vec3  uColorTip;
  uniform vec3  uColorRachis;

  varying vec2  vQ;
  varying vec4  vFeather;
  varying float vShown;
  varying vec3  vWorld;

  ${noiseGLSL}

  void main() {
    float y = vQ.y;
    float x = vQ.x;
    float seed = vFeather.w;
    // Drawn down its own length as the reveal reaches it.
    if (y > vShown) discard;

    // The vane: narrow quill at the root, widest a third of the way, pointed tip.
    float w = smoothstep(0.0, 0.2, y) * pow(max(1.0 - y, 0.0), 0.55) * 1.3;
    // Asymmetric, like a flight feather: the leading vane is the narrow one.
    w *= x < 0.0 ? 0.6 : 1.0;
    // Splits torn into the vane, different on each side.
    float tear = snoise(vec3(y * uTearScale, sign(x) * 4.0 + seed * 13.0, seed * 3.0));
    w *= 1.0 - uTear * smoothstep(0.35, 0.8, tear) * smoothstep(0.15, 0.4, abs(x) / max(w, 1e-3));
    float d = abs(x) / max(w, 1e-3);
    // Squared by hand: pow() of a negative base is undefined in GLSL.
    float rx = x / max(uRachisWidth, 1e-3);
    float rachis = exp(-rx * rx) * smoothstep(0.0, 0.04, y) * (1.0 - y * 0.7);
    if (d > 1.0 && rachis < 0.05) discard;
    float vane = (1.0 - smoothstep(0.7, 1.0, d)) * step(d, 1.0);

    // Barbs, raked back from the shaft toward the tip.
    float barb = fract(y * uBarbScale - abs(x) * uBarbSlant + seed * 7.0);
    barb = smoothstep(0.0, 0.45, barb) * smoothstep(1.0, 0.55, barb);
    float barbs = mix(1.0, 0.45 + 0.9 * barb, uBarbContrast);

    vec3 color = mix(uColorRoot, uColorBody, smoothstep(0.0, 0.45, y));
    color = mix(color, uColorTip, smoothstep(0.55, 1.0, y));
    color *= barbs;
    // Light moving across the whole wing, in world space so it crosses feathers.
    float sh = snoise(vec3(vWorld.x * 0.45, vWorld.y * 0.45 - uTime * uShimmerSpeed, vWorld.z * 0.45));
    color *= 1.0 + uShimmer * sh * uShaderIntensity;
    color += uColorTip * smoothstep(0.7, 1.0, y) * uTipGlow * vane;
    color += uColorRachis * rachis * uRachisGlow;

    float alpha = max(vane * (0.55 + 0.45 * barb), rachis * 0.9);
    // Edge of the reveal: a hot line where the feather is being drawn.
    float front = smoothstep(vShown - 0.12, vShown, y) * step(vShown, 0.999);
    color += uColorTip * front * 2.0;

    // Dissolve as the wings go: noise threshold with a burning edge.
    if (uDissolve > 0.0) {
      float n = snoise(vec3(x * 1.7 + seed * 5.0, y * 5.0, seed * 11.0)) * 0.5 + 0.5;
      n = n * 0.75 + (1.0 - y) * 0.25;
      if (n < uDissolve) discard;
      float edge = 1.0 - smoothstep(0.0, max(uDissolveEdge, 1e-3), n - uDissolve);
      color += uColorTip * edge * uDissolveGlow;
    }

    alpha *= uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color * uIntensity * uGlobalGlow, alpha);
  }
`;

export function createFeatherMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uSide: { value: new Vector3(1, 0, 0) },
      uToward: { value: new Vector3(0, 0, -1) },
      uShoulder: { value: 0.3 },
      uSpan: { value: 5 },
      uFullSpan: { value: 5 },
      uLift: { value: 0.6 },
      uRot: { value: 0 },
      uOpen: { value: 0 },
      uFanInner: { value: 1.8 },
      uFanOuter: { value: 0.1 },
      uBend: { value: 0 },
      uSweepBack: { value: 0.8 },
      uSweepFwd: { value: 0 },
      uCurl: { value: 0.3 },
      uLayerDepth: { value: 0.05 },
      uReveal: { value: 0 },
      uRevealSoft: { value: 0.3 },
      uIntensity: { value: 1 },
      uOpacity: { value: 0.5 },
      uRachisGlow: { value: 3 },
      uRachisWidth: { value: 0.07 },
      uBarbScale: { value: 34 },
      uBarbSlant: { value: 1.4 },
      uBarbContrast: { value: 0.5 },
      uTear: { value: 0.35 },
      uTearScale: { value: 7 },
      uTipGlow: { value: 1.3 },
      uShimmer: { value: 0.3 },
      uShimmerSpeed: { value: 1.3 },
      uDissolve: { value: 0 },
      uDissolveEdge: { value: 0.08 },
      uDissolveGlow: { value: 3 },
      uColorRoot: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorTip: { value: new Color() },
      uColorRachis: { value: new Color() }
    }),
    vertexShader: FEATHER_VERTEX,
    fragmentShader: FEATHER_FRAGMENT
  });

  /**
   * @param {object} pose { centre, side, toward, span, rot, open, bend, sweepFwd, reveal, dissolve, level }
   */
  material.userData.sync = (pose) => {
    const c = settings.seraph;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(pose.centre);
    u.uSide.value.copy(pose.side);
    u.uToward.value.copy(pose.toward);
    u.uShoulder.value = c.wingShoulder;
    u.uSpan.value = pose.span;
    u.uFullSpan.value = c.wingSpan;
    u.uLift.value = c.wingLift;
    u.uRot.value = pose.rot;
    u.uOpen.value = pose.open;
    u.uFanInner.value = c.fanInner;
    u.uFanOuter.value = c.fanOuter;
    u.uBend.value = pose.bend;
    u.uSweepBack.value = c.wingSweep;
    u.uSweepFwd.value = pose.sweepFwd;
    u.uCurl.value = c.wingCurl;
    u.uLayerDepth.value = c.layerDepth;
    u.uReveal.value = pose.reveal;
    u.uRevealSoft.value = c.revealSoft;
    u.uIntensity.value = c.featherGlow * g.glow * pose.level;
    u.uOpacity.value = c.featherOpacity * g.opacity;
    u.uRachisGlow.value = c.rachisGlow;
    u.uRachisWidth.value = c.rachisWidth;
    u.uBarbScale.value = c.barbScale * g.noiseFrequency;
    u.uBarbSlant.value = c.barbSlant;
    u.uBarbContrast.value = c.barbContrast;
    u.uTear.value = c.vaneTear * g.noiseStrength;
    u.uTearScale.value = c.vaneTearScale * g.noiseFrequency;
    u.uTipGlow.value = c.tipGlow;
    u.uShimmer.value = c.featherShimmer * g.noiseStrength;
    u.uShimmerSpeed.value = c.featherShimmerSpeed * g.noiseSpeed;
    u.uDissolve.value = pose.dissolve;
    u.uDissolveEdge.value = c.dissolveEdge;
    u.uDissolveGlow.value = c.dissolveGlow;
    u.uColorRoot.value.copy(getColor(c.colorFeatherRoot));
    u.uColorBody.value.copy(getColor(c.colorFeather));
    u.uColorTip.value.copy(getColor(c.colorFeatherTip));
    u.uColorRachis.value.copy(getColor(c.colorRachis));
  };

  return material;
}

/* ==================================================================== */
/* Halo                                                                  */
/* ==================================================================== */

/**
 * A ribbon round a circle in the plane spanned by `uSide` and `uForward`
 * (forward already tipped toward the caster by the ability), swung across the
 * view per vertex so its width reads the same edge-on and face-on. `position.x`
 * is the bearing, which the fragment uses for the beads and the draw-on: it
 * opens from the bearing nearest the caster and closes round the back.
 */
const HALO_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform vec3  uSide;
  uniform vec3  uForward;
  uniform float uRadius;
  uniform float uWidth;

  varying float vAngle;
  varying float vAcross;

  void main() {
    float a = position.x;
    vec3 radial = uSide * cos(a) + uForward * sin(a);
    vec3 tangent = -uSide * sin(a) + uForward * cos(a);
    vec3 world = uCentre + radial * uRadius;
    vec3 toCam = normalize(cameraPosition - world);
    vec3 across = cross(tangent, toCam);
    float l = length(across);
    across = l > 1e-4 ? across / l : radial;
    world += across * position.y * uWidth;
    vAngle = a;
    vAcross = position.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  precision highp float;
  #define TAU 6.28318530718

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uCore;        // core width / glow width
  uniform float uFalloff;
  uniform float uDraw;        // 0..1 drawn round
  uniform float uBeads;
  uniform float uBeadGlow;
  uniform float uBeadSharp;
  uniform float uSpinPhase;
  uniform float uShimmer;
  uniform float uShimmerScale;
  uniform float uShimmerSpeed;
  uniform float uFront;       // bearing the draw starts from
  uniform vec3  uColorCore;
  uniform vec3  uColorGlow;
  uniform vec3  uColorEdge;

  varying float vAngle;
  varying float vAcross;

  ${noiseGLSL}

  void main() {
    // Draw-on: both ways round from the front.
    float off = abs(mod(vAngle - uFront + TAU * 1.5, TAU) - TAU * 0.5) / (TAU * 0.5);
    if (off > uDraw) discard;
    float head = smoothstep(uDraw - 0.08, uDraw, off) * step(uDraw, 0.999);

    float x = abs(vAcross);
    float aa = fwidth(x) * 1.2;
    float core = 1.0 - smoothstep(uCore - aa, uCore + aa, x);
    float glow = pow(clamp(1.0 - x, 0.0, 1.0), uFalloff);

    // Beads: pointed studs round the band, turning.
    float b = abs(fract(vAngle / TAU * uBeads + uSpinPhase) - 0.5) * 2.0;
    float bead = pow(1.0 - b, uBeadSharp) * exp(-x * 3.0);

    vec2 ring = vec2(cos(vAngle), sin(vAngle)) * uShimmerScale;
    float sh = snoise(vec3(ring, uTime * uShimmerSpeed));
    float shimmer = 1.0 + uShimmer * sh * uShaderIntensity;

    vec3 tint = mix(uColorEdge, uColorGlow, smoothstep(0.0, 0.6, glow));
    vec3 color = tint * glow * shimmer + uColorCore * (core + bead * uBeadGlow) + uColorCore * head * 2.5;
    color *= uIntensity * uGlobalGlow;
    float alpha = clamp(max(glow, core) + bead, 0.0, 1.0) * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createHaloMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCentre: { value: new Vector3() },
      uSide: { value: new Vector3(1, 0, 0) },
      uForward: { value: new Vector3(0, 0, 1) },
      uRadius: { value: 1 },
      uWidth: { value: 0.15 },
      uIntensity: { value: 4 },
      uOpacity: { value: 1 },
      uCore: { value: 0.15 },
      uFalloff: { value: 2.2 },
      uDraw: { value: 0 },
      uBeads: { value: 28 },
      uBeadGlow: { value: 1.4 },
      uBeadSharp: { value: 6 },
      uSpinPhase: { value: 0 },
      uShimmer: { value: 0.35 },
      uShimmerScale: { value: 5 },
      uShimmerSpeed: { value: 1.6 },
      uFront: { value: -Math.PI / 2 },
      uColorCore: { value: new Color() },
      uColorGlow: { value: new Color() },
      uColorEdge: { value: new Color() }
    }),
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT
  });

  /** @param {object} s { centre, side, forward, radius, draw, level, spinPhase } */
  material.userData.sync = (s) => {
    const c = settings.seraph;
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uSide.value.copy(s.side);
    u.uForward.value.copy(s.forward);
    u.uRadius.value = s.radius;
    u.uWidth.value = Math.max(0.005, c.haloWidth);
    u.uCore.value = Math.min(0.9, c.haloCore / Math.max(0.005, c.haloWidth));
    u.uFalloff.value = c.haloFalloff;
    u.uDraw.value = s.draw;
    u.uIntensity.value = c.haloGlow * g.glow * g.shaderIntensity * s.level;
    u.uOpacity.value = c.haloOpacity * g.opacity;
    u.uBeads.value = Math.max(0, Math.round(c.haloBeads));
    u.uBeadGlow.value = c.haloBeadGlow;
    u.uBeadSharp.value = c.haloBeadSharp;
    u.uSpinPhase.value = s.spinPhase;
    u.uShimmer.value = c.haloShimmer * g.noiseStrength;
    u.uShimmerScale.value = c.haloShimmerScale * g.noiseFrequency;
    u.uShimmerSpeed.value = c.haloShimmerSpeed * g.noiseSpeed;
    u.uColorCore.value.copy(getColor(c.colorHaloCore));
    u.uColorGlow.value.copy(getColor(c.colorHalo));
    u.uColorEdge.value.copy(getColor(c.colorHaloEdge));
  };

  return material;
}

/* ==================================================================== */
/* God rays                                                              */
/* ==================================================================== */

/**
 * `aTop` / `aBottom` = (centre xyz, radius); `aRay` = (level, seed, -, -).
 *
 * A frustum between the two discs. The fragment brightness is `|N·V|^edge`:
 * where the view looks straight through the middle of the shaft it crosses the
 * most "air", at its silhouette the least — which is what makes a hollow cone
 * read as a column of lit dust. Streaks are noise on the cylinder (cos/sin of
 * the bearing, so there is no seam) scrolling down.
 */
const RAY_VERTEX = /* glsl */ `
  attribute vec4 aTop;
  attribute vec4 aBottom;
  attribute vec4 aRay;

  varying vec3  vNormal;
  varying vec3  vWorld;
  varying vec2  vCyl;     // bearing, 0 top .. 1 floor
  varying vec4  vRay;
  varying float vLength;
  varying float vViewZ;

  void main() {
    vRay = aRay;
    if (aRay.x <= 0.001) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float a = position.x;
    float v = position.y;
    vec3 axis = aBottom.xyz - aTop.xyz;
    vLength = length(axis);
    vec3 ax = axis / max(vLength, 1e-4);
    vec3 ref = abs(ax.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 e1 = normalize(cross(ax, ref));
    vec3 e2 = cross(ax, e1);
    vec3 radial = e1 * cos(a) + e2 * sin(a);
    float r = mix(aTop.w, aBottom.w, v);
    vec3 world = mix(aTop.xyz, aBottom.xyz, v) + radial * r;
    vNormal = radial;
    vWorld = world;
    vCyl = vec2(a, v);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const RAY_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uEdge;
  uniform float uStreakScale;
  uniform float uStreakSpeed;
  uniform float uStreaks;
  uniform float uTopFade;
  uniform float uSoftFade;
  uniform vec3  uColor;
  uniform vec3  uColorCore;
  uniform sampler2D uSceneDepth;
  uniform vec2  uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;

  varying vec3  vNormal;
  varying vec3  vWorld;
  varying vec2  vCyl;
  varying vec4  vRay;
  varying float vLength;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float face = abs(dot(normalize(vNormal), V));
    float body = pow(face, uEdge);

    vec3 q = vec3(cos(vCyl.x) * uStreakScale, sin(vCyl.x) * uStreakScale, vCyl.y * vLength * 0.35 - uTime * uStreakSpeed + vRay.y * 9.0);
    float streak = snoise(q) * 0.5 + 0.5;
    streak = mix(1.0, 0.35 + 1.1 * streak * streak, uStreaks * uShaderIntensity);

    float top = smoothstep(0.0, max(uTopFade, 0.01), vCyl.y);
    // Brightest high up, still strong where it meets the floor.
    float fall = mix(1.0, 0.55, vCyl.y);

    float alpha = body * streak * top * fall * vRay.x * uOpacity;
    if (alpha < 0.003) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.003) discard;

    vec3 color = mix(uColor, uColorCore, pow(face, uEdge * 2.0)) * uIntensity * uGlobalGlow;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createRayMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uIntensity: { value: 1 },
      uOpacity: { value: 0.3 },
      uEdge: { value: 2.4 },
      uStreakScale: { value: 3 },
      uStreakSpeed: { value: 1 },
      uStreaks: { value: 0.6 },
      uTopFade: { value: 0.2 },
      uSoftFade: { value: 0.6 },
      uColor: { value: new Color() },
      uColorCore: { value: new Color() }
    }),
    vertexShader: RAY_VERTEX,
    fragmentShader: RAY_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.seraph;
    const g = settings.global;
    const u = material.uniforms;
    u.uIntensity.value = c.rayGlow * g.glow * g.shaderIntensity;
    u.uOpacity.value = c.rayOpacity * g.opacity;
    u.uEdge.value = c.rayEdge * g.fresnel;
    u.uStreakScale.value = c.rayStreakScale * g.noiseFrequency;
    u.uStreakSpeed.value = c.rayStreakSpeed * g.noiseSpeed;
    u.uStreaks.value = c.rayStreaks * g.noiseStrength;
    u.uTopFade.value = c.rayTopFade;
    u.uSoftFade.value = c.raySoftFade;
    u.uColor.value.copy(getColor(c.colorRay));
    u.uColorCore.value.copy(getColor(c.colorRayCore));
  };

  return material;
}

/* ==================================================================== */
/* Floor sigil                                                           */
/* ==================================================================== */

/**
 * One additive floor quad over the circle, everything measured in metres
 * from its centre:
 *
 *   - three rings — the rim, the rune band's inner edge, the inner star's rim;
 *   - a radiant star of `uRays` pointed rays between the inner rings, thinning
 *     as they reach out (`exp(-|sin(n·θ/2)|·sharp / r)`);
 *   - a band of runes: the band is cut into `uRunes` cells, and each cell
 *     draws a stem plus a hashed choice of cross-bar, chevron and dot — which
 *     reads as script without being any real one. The band turns.
 *
 * Drawn on angularly from the bearing nearest the caster; `uPulse` flares it
 * on the beat, `uFade` takes it away.
 */
const SIGIL_VERTEX = /* glsl */ `
  varying vec2 vP;
  uniform float uQuad;
  void main() {
    vP = (uv - 0.5) * uQuad;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SIGIL_FRAGMENT = /* glsl */ `
  precision highp float;
  #define TAU 6.28318530718

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform float uRadius;
  uniform float uRingWidth;
  uniform float uRays;
  uniform float uRaySharp;
  uniform float uRunes;
  uniform float uRuneGlow;
  uniform float uSpinPhase;
  uniform float uDraw;
  uniform float uPulse;
  uniform float uFade;
  uniform float uFlicker;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uFront;
  uniform float uSeed;
  uniform vec3  uColor;
  uniform vec3  uColorHot;

  varying vec2 vP;

  ${noiseGLSL}

  float ring(float r, float at, float w) {
    float aa = fwidth(r) + 1e-4;
    return 1.0 - smoothstep(w, w + aa * 1.5, abs(r - at));
  }

  float seg(vec2 p, vec2 a, vec2 b, float w) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
    return 1.0 - smoothstep(w * 0.6, w, length(pa - ba * h));
  }

  void main() {
    float r = length(vP);
    float R = uRadius;
    if (r > R * 1.08) discard;
    float ang = atan(vP.y, vP.x);

    // Draw-on from the front, both ways round.
    float off = abs(mod(ang - uFront + TAU * 1.5, TAU) - TAU * 0.5) / (TAU * 0.5);
    float drawn = 1.0 - smoothstep(uDraw - 0.05, uDraw, off);
    if (drawn <= 0.0) discard;

    float w = uRingWidth;
    float lines = ring(r, R, w) + ring(r, R * 0.8, w * 0.7) + ring(r, R * 0.42, w * 0.8) + ring(r, R * 0.86, w * 0.4);

    // The radiant star between the inner rings.
    float rays = exp(-abs(sin(ang * uRays * 0.5)) * uRaySharp * (r / max(R, 0.1)) * 2.0);
    rays *= smoothstep(R * 0.1, R * 0.2, r) * (1.0 - smoothstep(R * 0.68, R * 0.79, r));
    float rays2 = exp(-abs(sin(ang * uRays * 0.5 + 1.5708 / max(uRays, 1.0) * 2.0)) * uRaySharp * 1.6) * 0.45;
    rays2 *= smoothstep(R * 0.42, R * 0.46, r) * (1.0 - smoothstep(R * 0.62, R * 0.7, r));

    // The rune band between 0.8 R and 0.86 R... widened to the rim.
    float runes = 0.0;
    float band0 = R * 0.875, band1 = R * 0.975;
    if (r > band0 && r < band1 && uRunes > 0.5) {
      float t = (ang / TAU + 0.5 + uSpinPhase) * uRunes;
      float cell = floor(t);
      vec2 cu = vec2(fract(t), (r - band0) / (band1 - band0));
      vec2 p = (cu - 0.5) * vec2(1.6, 1.0);
      float h = hash11(cell * 7.31 + uSeed);
      float h2 = hash11(cell * 3.17 + uSeed * 2.0);
      float lw = 0.12;
      float g = seg(p, vec2(0.0, -0.4), vec2(0.0, 0.4), lw);
      if (h > 0.35) g = max(g, seg(p, vec2(-0.32, mix(-0.2, 0.3, h2)), vec2(0.32, mix(-0.2, 0.3, h2)), lw));
      if (h > 0.7) g = max(g, seg(p, vec2(-0.32, 0.4), vec2(0.0, 0.05), lw) * 0.9);
      if (h2 > 0.6) g = max(g, seg(p, vec2(0.0, 0.05), vec2(0.32, 0.4), lw) * 0.9);
      if (h < 0.2) g = max(g, 1.0 - smoothstep(0.08, 0.13, length(p - vec2(0.3, -0.3))));
      runes = g * uRuneGlow;
    }

    float core = exp(-r / max(R * 0.12, 0.05)) * 0.8;
    float flick = 1.0 + uFlicker * snoise(vec3(ang * 3.0, r * 1.5, uTime * 3.0)) * uShaderIntensity;

    float shape = lines + rays + rays2 + runes + core;
    vec3 color = mix(uColor, uColorHot, clamp(rays * 0.6 + core + uPulse * 0.3, 0.0, 1.0)) * shape;
    color *= flick * (1.0 + uPulse) * drawn * uFade * uIntensity * uGlobalGlow;
    float alpha = clamp(shape, 0.0, 1.0) * drawn * uFade * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createSigilMaterial() {
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
      uQuad: { value: 10 },
      uRadius: { value: 4 },
      uRingWidth: { value: 0.04 },
      uRays: { value: 12 },
      uRaySharp: { value: 26 },
      uRunes: { value: 40 },
      uRuneGlow: { value: 1.2 },
      uSpinPhase: { value: 0 },
      uDraw: { value: 0 },
      uPulse: { value: 0 },
      uFade: { value: 1 },
      uFlicker: { value: 0.25 },
      uIntensity: { value: 2 },
      uOpacity: { value: 0.85 },
      uFront: { value: 0 },
      uSeed: { value: 0 },
      uColor: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: SIGIL_VERTEX,
    fragmentShader: SIGIL_FRAGMENT
  });

  /** @param {object} s { radius, draw, pulse, fade, spinPhase, front, seed } */
  material.userData.sync = (s) => {
    const c = settings.seraph;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuad.value = s.radius * 2.25;
    u.uRadius.value = s.radius;
    u.uRingWidth.value = c.sigilRingWidth;
    u.uRays.value = Math.max(1, Math.round(c.sigilRays));
    u.uRaySharp.value = c.sigilRaySharp;
    u.uRunes.value = Math.max(0, Math.round(c.sigilRunes));
    u.uRuneGlow.value = c.sigilRuneGlow;
    u.uSpinPhase.value = s.spinPhase;
    u.uDraw.value = s.draw;
    u.uPulse.value = s.pulse;
    u.uFade.value = s.fade;
    u.uFlicker.value = c.sigilFlicker * g.noiseStrength;
    u.uIntensity.value = c.sigilGlow * g.glow * g.shaderIntensity;
    u.uOpacity.value = c.sigilOpacity * g.opacity;
    u.uFront.value = s.front;
    u.uSeed.value = s.seed;
    u.uColor.value.copy(getColor(c.colorSigil));
    u.uColorHot.value.copy(getColor(c.colorSigilHot));
  };

  return material;
}

/* ==================================================================== */
/* Feather darts                                                         */
/* ==================================================================== */

/**
 * `aHead` = (blade tip xyz, level), `aDir` = (unit flight dir, trail metres),
 * `aDart` = (seed, -, -, -).
 *
 * Rows 0..1 are the trail, laid out behind the blade's base over `aDir.w`
 * metres; rows 1..2 are the blade, `uBlade` metres long. The strip is swung
 * across the view. The blade is a feather in miniature — a pointed vane with a
 * bright shaft — the trail a tapering ribbon of gold light.
 */
const DART_VERTEX = /* glsl */ `
  attribute vec4 aHead;
  attribute vec4 aDir;
  attribute vec4 aDart;

  uniform float uBlade;
  uniform float uWidth;
  uniform float uTrailWidth;

  varying float vR;
  varying float vX;
  varying vec4  vDart;
  varying float vLevel;
  varying float vViewZ;

  void main() {
    vDart = aDart;
    vLevel = aHead.w;
    if (aHead.w <= 0.001) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float r = position.y;
    vec3 dir = aDir.xyz;
    vec3 base = aHead.xyz - dir * uBlade;
    vec3 world;
    float width;
    if (r <= 1.0) {
      world = base - dir * aDir.w * (1.0 - r);
      width = uTrailWidth * (0.15 + 0.85 * r);
    } else {
      float b = r - 1.0;
      world = base + dir * uBlade * b;
      width = uWidth;
    }
    vec3 toCam = normalize(cameraPosition - world);
    vec3 across = cross(dir, toCam);
    float l = length(across);
    across = l > 1e-4 ? across / l : vec3(1.0, 0.0, 0.0);
    world += across * position.x * width;
    vR = r;
    vX = position.x;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const DART_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uSoftFade;
  uniform vec3  uColor;
  uniform vec3  uColorTrail;
  uniform sampler2D uSceneDepth;
  uniform vec2  uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;

  varying float vR;
  varying float vX;
  varying vec4  vDart;
  varying float vLevel;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float x = abs(vX);
    vec3 color;
    float alpha;
    if (vR <= 1.0) {
      // Trail: a soft ribbon, hot near the blade, sparkling.
      float t = vR;
      float glow = pow(clamp(1.0 - x, 0.0, 1.0), 2.0) * pow(t, 1.6);
      float sparkle = 0.75 + 0.5 * snoise(vec3(t * 9.0 - uTime * 6.0, vDart.x * 17.0, 0.0));
      color = mix(uColorTrail, uColor, t * t) * glow * sparkle;
      alpha = glow;
    } else {
      // Blade: a little pointed feather. Whatever is sunk into the floor or a
      // body is hidden by the depth test, so nothing here has to clip it.
      float b = vR - 1.0;
      float w = pow(max(sin(3.14159 * clamp(b, 0.0, 1.0)), 0.0), 0.7) * (1.0 - b * 0.35);
      float d = x / max(w, 1e-3);
      if (d > 1.0) discard;
      float shaft = exp(-x * x * 120.0);
      float vane = 1.0 - smoothstep(0.6, 1.0, d);
      float barb = fract(b * 14.0 - x * 2.0 + vDart.x * 3.0);
      vane *= 0.6 + 0.4 * smoothstep(0.0, 0.5, barb) * smoothstep(1.0, 0.5, barb);
      color = uColor * (vane + shaft * 2.0);
      alpha = max(vane, shaft);
    }
    alpha *= vLevel * uOpacity;
    if (alpha < 0.003) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    alpha *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uIntensity * uGlobalGlow * vLevel, alpha);
  }
`;

export function createDartMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uBlade: { value: 0.8 },
      uWidth: { value: 0.1 },
      uTrailWidth: { value: 0.05 },
      uIntensity: { value: 4 },
      uOpacity: { value: 1 },
      uSoftFade: { value: 0.12 },
      uColor: { value: new Color() },
      uColorTrail: { value: new Color() }
    }),
    vertexShader: DART_VERTEX,
    fragmentShader: DART_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.seraph;
    const g = settings.global;
    const u = material.uniforms;
    u.uBlade.value = Math.max(0.05, c.dartLength);
    u.uWidth.value = c.dartWidth;
    u.uTrailWidth.value = c.dartTrailWidth;
    u.uIntensity.value = c.dartGlow * g.glow * g.shaderIntensity;
    u.uOpacity.value = g.opacity;
    u.uSoftFade.value = c.dartSoftFade;
    u.uColor.value.copy(getColor(c.colorDart));
    u.uColorTrail.value.copy(getColor(c.colorDartTrail));
  };

  return material;
}

/* ==================================================================== */
/* Glints                                                                */
/* ==================================================================== */

/**
 * `aGlint` = (xyz, size), `aGlow` = (level, seed, spikes, -).
 * A hot core, a soft halo and — scaled by `spikes` — a cross of thin rays with
 * a weaker diagonal pair. The quad is sized for the rays.
 */
const GLINT_VERTEX = /* glsl */ `
  attribute vec4 aGlint;
  attribute vec4 aGlow;
  varying vec2 vP;
  varying vec4 vGlow;
  void main() {
    vGlow = aGlow;
    if (aGlow.x <= 0.001 || aGlint.w <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = aGlint.xyz + (right * position.x + up * position.y) * aGlint.w;
    vP = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const GLINT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform vec3  uColorCore;
  uniform vec3  uColorHalo;
  varying vec2 vP;
  varying vec4 vGlow;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    if (r > 1.0) discard;
    float core = exp(-r * r * 60.0);
    float halo = exp(-r * 5.0) * (1.0 - r);
    vec2 q = rot2(vGlow.y * 6.2831 + uTime * 0.4) * vP;
    float spikes = exp(-abs(q.y) * 70.0) * pow(1.0 - min(abs(q.x), 1.0), 2.0)
                 + exp(-abs(q.x) * 70.0) * pow(1.0 - min(abs(q.y), 1.0), 2.0);
    vec2 q2 = rot2(0.785398) * q;
    spikes += 0.4 * (exp(-abs(q2.y) * 90.0) * pow(1.0 - min(abs(q2.x), 1.0), 3.0)
                   + exp(-abs(q2.x) * 90.0) * pow(1.0 - min(abs(q2.y), 1.0), 3.0));
    spikes *= vGlow.z;
    vec3 color = uColorCore * (core * 2.0 + spikes) + uColorHalo * halo;
    float alpha = clamp(core + halo + spikes, 0.0, 1.0) * vGlow.x * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uIntensity * uGlobalGlow * vGlow.x, alpha);
  }
`;

export function createGlintMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uIntensity: { value: 3 },
      uOpacity: { value: 1 },
      uColorCore: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: GLINT_VERTEX,
    fragmentShader: GLINT_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.seraph;
    const g = settings.global;
    const u = material.uniforms;
    u.uIntensity.value = 2.5 * g.glow * g.shaderIntensity;
    u.uOpacity.value = g.opacity;
    u.uColorCore.value.copy(getColor(c.colorB));
    u.uColorHalo.value.copy(getColor(c.colorA));
  };

  return material;
}

/* ==================================================================== */
/* Distortion — LAYER.DISTORTION                                         */
/* ==================================================================== */

/**
 * A camera-facing quad centred under the wings. Two things bend the scene
 * through it: a steady shimmer in a soft disc round the wings (warm air over a
 * light source), and on the beat a pressure ring that runs out from the centre
 * — the down-wash of the stroke — pushing the scene radially as it passes.
 */
const WARP_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    vWorld = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz + vec3(position.xy * uSize, 0.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  uniform float uShimmer;
  uniform float uRing;       // ring radius as a fraction of the half-quad, <0 = none
  uniform float uRingWidth;
  uniform float uScale;
  uniform float uSpeed;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float r = length(c);
    if (r > 1.0) discard;
    vec3 np = vec3(vWorld.xy * uScale, uTime * uSpeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(17.1, 5.3, 9.7)));

    float disc = (1.0 - smoothstep(0.2, 0.75, r)) * uShimmer;
    float ring = 0.0;
    if (uRing >= 0.0) {
      float d = (r - uRing) / max(uRingWidth, 1e-3);
      ring = exp(-d * d) * (1.0 - uRing);
    }
    vec2 dir = normalize(mix(n, c / max(r, 1e-3), clamp(ring * 2.0, 0.0, 1.0)) + 1e-4);
    float mask = clamp(disc + ring, 0.0, 1.0);
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
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
      uSize: { value: 10 },
      uStrength: { value: 0 },
      uShimmer: { value: 0.2 },
      uRing: { value: -1 },
      uRingWidth: { value: 0.12 },
      uScale: { value: 1.4 },
      uSpeed: { value: 1.2 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} s { strength, ring } */
  material.userData.sync = (s) => {
    const c = settings.seraph;
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = c.warpSize; // the quad is unit-sized, so this is metres across
    u.uStrength.value = c.warpStrength * g.distortion * s.strength;
    u.uShimmer.value = c.warpShimmer;
    u.uRing.value = s.ring;
    u.uRingWidth.value = c.warpRingWidth;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
  };

  return material;
}
