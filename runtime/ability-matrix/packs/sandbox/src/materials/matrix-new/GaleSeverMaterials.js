import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector2, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Gale Sever — the three bespoke shaders the air blade is drawn with.
 *
 *  - **the blade** — a parameter-space strip (`createGaleBladeGeometry`) bent
 *    into a crescent in the vertex stage. Additive. Almost all of its light is
 *    in a cutting line a few centimetres wide at the leading edge; behind it
 *    the body is a faint streaming haze, and between the two sit three thin
 *    bands of colour — the chromatic fringe you get at the edge of a lens, the
 *    one cue that says "this is compressed air" rather than "this is a glow".
 *    A rim term lights the blade when it is seen edge-on, so it never vanishes
 *    into a line as the camera orbits. It tears apart on a noise threshold when
 *    it dissipates, and the tearing edge flares.
 *  - **the lens** — the *same* crescent written into `LAYER.DISTORTION`, but
 *    reaching ahead of the edge (the bow wave) and well behind the body. Its
 *    offset is not plain noise: it is the crescent's own outward normal,
 *    projected to the screen and multiplied by the derivative of a bump across
 *    the strip, so the world behind the blade is pushed *out* on one side of the
 *    lens and pulled *in* on the other — the magnification of a real refracting
 *    shell. `warpSwirl` mixes noise back in for turbulence.
 *  - **the scar** — a ground strip down the line that only exists behind the
 *    blade (`uCutEnd`). A dark slit wanders down the middle between two raised,
 *    light-catching lips; hairline scratches run parallel either side in broken
 *    dashes; a broad scoured band of dust frames it. The freshly cut floor
 *    shines hot right behind the blade and cools over `scarGlowLength`. It
 *    erodes raggedly when the cast fades.
 *
 * Every material reads `settings.gale` in `userData.sync(state)`; `state`
 * carries only what the ability knows that the settings do not (the integrated
 * phases, the form/dissolve envelopes, the extents of the cut).
 */

/* -------------------------------------------------------------------- */
/* The crescent — shared by the blade and its lens                      */
/* -------------------------------------------------------------------- */

/**
 * `bladeEdge(u)` is the cutting edge at bearing `u` (-1 tip, 0 apex, +1 tip) in
 * the blade's local frame: +Z is the direction of flight, +Y up, the apex at the
 * origin. It also returns the crescent's outward normal and the depth of the
 * body at that bearing. `GaleSeverAbility#_bladeLocal` is the CPU copy of this
 * (it places the wake on the tips), so the two must change together.
 */
const CRESCENT_GLSL = /* glsl */ `
  uniform float uRadius;      // half-width tip to tip, metres
  uniform float uArc;         // radians the crescent spans
  uniform float uBody;        // depth of the body at the apex, metres
  uniform float uTaper;
  uniform float uSweep;
  uniform float uBow;
  uniform float uRoll;        // radians, already includes the wobble
  uniform float uForm;        // 0..1 the blade snapping open off the hand
  uniform float uSpread;      // >= 1, how far it has opened while dissipating

  vec3 bladeEdge(float u, out vec3 outward, out float depth) {
    float halfArc = max(0.05, uArc * 0.5);
    // The arc radius that makes the tips land exactly uRadius either side.
    float R = uRadius / max(sin(min(halfArc, 1.5707)), 0.1) * uSpread;
    float th = u * halfArc * mix(0.12, 1.0, uForm);
    outward = vec3(sin(th), 0.0, cos(th));
    vec3 p = vec3(R * sin(th), 0.0, R * (cos(th) - 1.0));
    p.z -= uSweep * R * u * u;
    p.y += uBow * R * u * u;
    depth = uBody * uForm * pow(max(1.0 - u * u, 0.0), max(uTaper, 0.05));
    return p;
  }

  vec3 rollLocal(vec3 p) {
    float c = cos(uRoll), s = sin(uRoll);
    return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
  }
`;

const BLADE_VERTEX = /* glsl */ `
  uniform float uFlutter;
  uniform float uFlutterScale;
  uniform float uPhase;
  uniform float uSeed;

  varying vec2  vBlade;     // x: bearing -1..1, y: 0 edge .. 1 back
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}
  ${CRESCENT_GLSL}

  void main() {
    float u = position.x;
    float v = position.y;
    vec3 outward;
    float depth;
    vec3 p = bladeEdge(u, outward, depth);
    p -= outward * depth * v;
    // The trailing body shivers; the edge itself is rigid.
    p.y += uFlutter * v * snoise(vec3(u * uFlutterScale, v * 2.0, uPhase + uSeed));
    p = rollLocal(p);

    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * rollLocal(vec3(0.0, 1.0, 0.0)));
    vViewDir = cameraPosition - world.xyz;
    vBlade = vec2(u, v);

    vec4 mv = viewMatrix * world;
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BLADE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uEdgeWidth;
  uniform float uEdgeGlow;
  uniform float uBodyOpacity;
  uniform float uBodyFalloff;
  uniform float uRimGlow;
  uniform float uTipFade;
  uniform float uStreakScale;
  uniform float uFlow;        // integrated on the CPU so the slider never jumps
  uniform float uFringe;
  uniform float uFringeOffset;
  uniform float uFringeWidth;
  uniform float uSoftFade;
  uniform float uDissolve;    // 0 whole .. 1 gone
  uniform float uFade;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uFringeR;
  uniform vec3  uFringeG;
  uniform vec3  uFringeB;

  uniform vec2      uResolution;
  uniform sampler2D uSceneDepth;
  uniform float     uCameraNear;
  uniform float     uCameraFar;
  uniform float     uGlobalGlow;
  uniform float     uShaderIntensity;

  varying vec2  vBlade;
  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vViewZ;

  ${noiseGLSL}
  ${commonGLSL}

  /** One thin gaussian band of the fringe, \`index\` bands behind the edge. */
  float band(float v, float index) {
    float w = max(uFringeWidth, 0.002);
    float centre = uFringeOffset + index * w * 1.35;
    float d = (v - centre) / w;
    return exp(-d * d * 2.0);
  }

  void main() {
    float u = vBlade.x;
    float v = clamp(vBlade.y, 0.0, 1.0);
    float au = abs(u);

    // Soft tips — the blade thins to nothing rather than ending.
    float tip = 1.0 - smoothstep(1.0 - max(uTipFade, 0.01), 1.0, au);

    // Tearing apart: a noise threshold that eats the back first and the edge
    // last, with a bright frayed border where it is coming away.
    float tearN = fbm3(vec3(u * 2.6, v * 3.0 - uTime * 1.8, uSeed)) * 0.5 + 0.5;
    tearN = mix(tearN, tearN * 0.6 + (1.0 - v) * 0.4, 0.5);
    float thr = uDissolve * 1.25 - 0.1;
    float keep = uDissolve <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.06, tearN);
    float fray = uDissolve <= 0.0 ? 0.0 : smoothstep(thr - 0.02, thr + 0.06, tearN) - smoothstep(thr + 0.06, thr + 0.22, tearN);

    // 1 · the cutting line: a hard core and a short exponential halo.
    float ew = max(uEdgeWidth, 0.002);
    float core = 1.0 - smoothstep(ew * 0.35, ew, v);
    float halo = exp(-v / (ew * 4.0));

    // 2 · the body: a streaming haze, wind lines running edge to back.
    float body = pow(1.0 - v, max(uBodyFalloff, 0.05));
    float lines = snoise(vec3(u * uStreakScale * 2.2, v * 1.3 - uFlow, uSeed * 3.1));
    lines = smoothstep(-0.25, 0.95, lines);
    float haze = body * uBodyOpacity * (0.4 + 0.8 * lines * uShaderIntensity);

    // 3 · the chromatic fringe just behind the edge.
    vec3 fringe = uFringeR * band(v, 0.0) + uFringeG * band(v, 1.0) + uFringeB * band(v, 2.0);

    // 4 · edge-on, the blade is all rim — that is what keeps it from vanishing.
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float rim = pow(1.0 - abs(dot(N, V)), 3.0) * uRimGlow;

    vec3 color = uColorA * haze
               + uColorB * (core * uEdgeGlow + halo * uEdgeGlow * 0.22)
               + fringe * uFringe * (0.35 + 0.65 * lines)
               + uColorB * rim * (halo + body * 0.35)
               + uColorB * fray * 2.5;

    float mask = tip * keep * uFade;
    if (mask < 0.004) discard;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    mask *= softFade(uSceneDepth, screenUV, vViewZ, uCameraNear, uCameraFar, uSoftFade);
    if (mask < 0.004) discard;

    gl_FragColor = vec4(color * uGlobalGlow, clamp(mask, 0.0, 1.0));
  }
`;

/** The air blade: additive, double-sided, a strip bent in the vertex stage. */
export function createGaleBladeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uRadius: { value: 1.8 },
      uArc: { value: 2.3 },
      uBody: { value: 0.85 },
      uTaper: { value: 0.75 },
      uSweep: { value: 0.2 },
      uBow: { value: 0.08 },
      uRoll: { value: 0 },
      uForm: { value: 1 },
      uSpread: { value: 1 },
      uFlutter: { value: 0.06 },
      uFlutterScale: { value: 3 },
      uPhase: { value: 0 },
      uEdgeWidth: { value: 0.045 },
      uEdgeGlow: { value: 4 },
      uBodyOpacity: { value: 0.3 },
      uBodyFalloff: { value: 1.6 },
      uRimGlow: { value: 1 },
      uTipFade: { value: 0.5 },
      uStreakScale: { value: 7 },
      uFlow: { value: 0 },
      uFringe: { value: 1 },
      uFringeOffset: { value: 0.07 },
      uFringeWidth: { value: 0.035 },
      uSoftFade: { value: 0.4 },
      uDissolve: { value: 0 },
      uFade: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uFringeR: { value: new Color() },
      uFringeG: { value: new Color() },
      uFringeB: { value: new Color() }
    }),
    vertexShader: BLADE_VERTEX,
    fragmentShader: BLADE_FRAGMENT
  });

  /**
   * @param {object} state { roll, form, spread, dissolve, phase, flow, fade, seed }
   */
  material.userData.sync = (state) => {
    const c = settings.gale;
    const g = settings.global;
    const u = material.uniforms;
    syncCrescent(u, state);
    u.uSeed.value = state.seed;
    u.uFlutter.value = c.flutter * g.noiseStrength;
    u.uFlutterScale.value = c.flutterScale * g.noiseFrequency;
    u.uPhase.value = state.phase;
    u.uEdgeWidth.value = c.edgeWidth;
    u.uEdgeGlow.value = c.edgeGlow * g.glow;
    u.uBodyOpacity.value = c.bodyOpacity * g.opacity;
    u.uBodyFalloff.value = c.bodyFalloff;
    u.uRimGlow.value = c.rimGlow * g.fresnel;
    u.uTipFade.value = c.tipFade;
    u.uStreakScale.value = c.streakScale * g.noiseFrequency;
    u.uFlow.value = state.flow;
    u.uFringe.value = c.fringe * g.shaderIntensity;
    u.uFringeOffset.value = c.fringeOffset;
    u.uFringeWidth.value = c.fringeWidth;
    u.uSoftFade.value = c.softFade;
    u.uDissolve.value = state.dissolve;
    u.uFade.value = state.fade;
    u.uColorA.value.copy(getColor(c.colorA));
    u.uColorB.value.copy(getColor(c.colorB));
    u.uFringeR.value.copy(getColor(c.colorFringeR));
    u.uFringeG.value.copy(getColor(c.colorFringeG));
    u.uFringeB.value.copy(getColor(c.colorFringeB));
  };

  return material;
}

/** The crescent's shape uniforms, shared by the blade and the lens. */
function syncCrescent(u, state) {
  const c = settings.gale;
  u.uRadius.value = Math.max(0.05, c.shearRadius);
  u.uArc.value = c.arc;
  u.uBody.value = Math.max(0.01, c.bodyLength);
  u.uTaper.value = c.taper;
  u.uSweep.value = c.sweepBack;
  u.uBow.value = c.bow;
  u.uRoll.value = state.roll;
  u.uForm.value = state.form;
  u.uSpread.value = state.spread;
}

/* -------------------------------------------------------------------- */
/* The lens — LAYER.DISTORTION                                          */
/* -------------------------------------------------------------------- */

const WARP_VERTEX = /* glsl */ `
  uniform float uLead;        // metres the bow wave runs ahead of the edge
  uniform float uDepthScale;  // how far behind, × the body

  varying vec2 vBlade;        // x: bearing, y: 0 bow wave .. 1 wake
  varying vec2 vOutward;      // the crescent's normal, in screen space
  varying vec3 vWorld;

  ${CRESCENT_GLSL}

  void main() {
    float u = position.x;
    float v = position.y;
    vec3 outward;
    float depth;
    vec3 p = bladeEdge(u, outward, depth);
    // From \`uLead\` ahead of the edge to well behind the body; the tips keep a
    // little depth so the lens does not pinch to a line where the blade does.
    float back = max(depth, uBody * 0.25 * uForm) * uDepthScale;
    p -= outward * mix(-uLead, back, v);
    p = rollLocal(p);

    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vBlade = vec2(u, v);
    vec3 outW = normalize(mat3(modelMatrix) * rollLocal(outward));
    vOutward = (viewMatrix * vec4(outW, 0.0)).xy;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSwirl;
  uniform float uSeed;
  uniform float uLeadFrac;    // where the edge sits along the strip, 0..1
  uniform float uShaderIntensity;

  varying vec2 vBlade;
  varying vec2 vOutward;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float u = vBlade.x;
    float v = clamp(vBlade.y, 0.0, 1.0);

    // The lens is a bump across the strip peaking just behind the edge. Its
    // slope is what bends the image: + ahead of the crest, - behind it.
    float crest = clamp(uLeadFrac + 0.12, 0.05, 0.9);
    float k = v < crest ? v / crest : 1.0 + (v - crest) / (1.0 - crest);
    float slope = cos(k * 1.5707963);          // +1 → 0 → -1 across the strip
    float bump = sin(k * 1.5707963);           // 0 → 1 → 0

    vec2 dir = normalize(vOutward + 1e-5);
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale - uTime * uSpeed + uSeed);
    vec2 n = vec2(snoise(np), snoise(np + vec3(19.3, 7.7, 31.1)));
    vec2 offset = dir * slope * (1.0 - uSwirl) + n * uSwirl;
    float len = length(offset);
    if (len > 1.0) offset /= len;

    float mask = (1.0 - smoothstep(0.7, 1.0, abs(u)))
               * smoothstep(0.0, 0.08, v) * (1.0 - smoothstep(0.82, 1.0, v));
    float strength = uStrength * uShaderIntensity * mask * (0.35 + 0.65 * bump);
    if (strength < 0.002) discard;

    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

/** The bend in the air the blade pushes ahead of itself and drags behind. */
export function createGaleWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uRadius: { value: 1.8 },
      uArc: { value: 2.3 },
      uBody: { value: 0.85 },
      uTaper: { value: 0.75 },
      uSweep: { value: 0.2 },
      uBow: { value: 0.08 },
      uRoll: { value: 0 },
      uForm: { value: 1 },
      uSpread: { value: 1 },
      uLead: { value: 0.25 },
      uDepthScale: { value: 1.8 },
      uLeadFrac: { value: 0.2 },
      uStrength: { value: 1 },
      uScale: { value: 2.4 },
      uSpeed: { value: 3 },
      uSwirl: { value: 0.45 },
      uSeed: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} state the blade's state plus { strength } */
  material.userData.sync = (state) => {
    const c = settings.gale;
    const g = settings.global;
    const u = material.uniforms;
    syncCrescent(u, state);
    u.uLead.value = c.warpLead;
    u.uDepthScale.value = c.warpWidth;
    const back = Math.max(0.01, c.bodyLength * c.warpWidth);
    u.uLeadFrac.value = c.warpLead / Math.max(0.01, c.warpLead + back);
    u.uStrength.value = state.strength * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
    u.uSwirl.value = Math.min(1, Math.max(0, c.warpSwirl * g.turbulence));
    u.uSeed.value = state.seed;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The scar                                                             */
/* -------------------------------------------------------------------- */

/**
 * A raw unit PlaneGeometry (XY, ±0.5) laid down the cast line from uniforms:
 * `position.x` runs across it, `position.y` along it. Nothing about the strip
 * is baked into a transform, so its width and length follow the sliders.
 */
const SCAR_VERTEX = /* glsl */ `
  uniform vec3  uStart;       // floor point where the scar begins
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;      // metres the quad runs
  uniform float uWidth;       // full width of the quad, metres
  uniform float uLift;

  varying vec2 vFlat;         // x: metres across, y: metres along

  void main() {
    float across = position.x * uWidth;
    float along = (position.y + 0.5) * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = uLift;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const SCAR_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uCutEnd;      // metres of the scar that exist so far
  uniform float uBladeAt;     // where the blade is now, metres along
  uniform float uCut;
  uniform float uLips;
  uniform float uScour;
  uniform float uScratches;
  uniform float uScratchSpread;
  uniform float uWiggle;
  uniform float uWiggleScale;
  uniform float uDark;
  uniform float uLipBright;
  uniform float uScourOpacity;
  uniform float uGlow;
  uniform float uGlowLength;
  uniform float uHot;         // 1 while the blade is cutting, decays after
  uniform float uErode;
  uniform float uFadeT;       // 0..1 through the fade
  uniform float uOpacity;
  uniform vec2  uLightXZ;     // sun direction projected on the floor, in strip frame
  uniform vec3  uColorDeep;
  uniform vec3  uColorLip;
  uniform vec3  uColorScour;
  uniform vec3  uColorGlow;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;
    if (along < 0.0 || along > uCutEnd) discard;

    // The cut wanders a little: wind does not rule a line.
    float wig = snoise(vec3(along * uWiggleScale, uSeed, 0.0)) * uWiggle;
    float dx = x - wig;
    float ad = abs(dx);

    // Opens over the first metre and closes to a point at the blade.
    float open = smoothstep(0.0, 0.9, along) * mix(0.3, 1.0, smoothstep(0.0, 0.6, uCutEnd - along));
    float cutW = max(uCut * open, 0.002);

    float slit = 1.0 - smoothstep(cutW * 0.55, cutW, ad);
    float lipD = ad - cutW;
    float lipW = max(uLips, 0.002);
    float lip = smoothstep(-lipW * 0.15, lipW * 0.25, lipD) * (1.0 - smoothstep(lipW * 0.45, lipW, lipD)) * open;
    // A raised lip is lit on the side that faces the sun.
    float lit = 0.55 + 0.45 * sign(dx) * uLightXZ.x;

    // Hairline scratches either side, in broken dashes.
    float scratch = 0.0;
    for (int i = 0; i < 6; i++) {
      if (float(i) >= uScratches) break;
      float fi = float(i);
      float side = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
      float off = side * (cutW + lipW + (0.15 + 0.85 * hash11(fi * 7.31 + uSeed)) * uScratchSpread);
      float wob = snoise(vec3(along * 0.9, fi * 3.7, uSeed)) * 0.03;
      float line = 1.0 - smoothstep(0.004, 0.013, abs(x - off - wig * 0.6 - wob));
      float dash = smoothstep(-0.1, 0.45, snoise(vec3(along * 1.6, fi * 5.3, uSeed * 2.0)));
      scratch = max(scratch, line * dash * open);
    }

    // The scoured band: dust swept along the line in streaks.
    float edgeN = fbm3(vec3(x * 2.0, along * 0.7, uSeed)) * 0.25;
    float scour = 1.0 - smoothstep(uScour * 0.35, uScour, ad + edgeN);
    float streaks = 0.45 + 0.55 * smoothstep(-0.4, 0.8, snoise(vec3(x * 14.0, along * 0.5, uSeed * 1.7)));
    scour *= streaks * open;

    // Hot behind the blade, cooling with distance.
    float behind = max(uBladeAt - along, 0.0);
    float hot = exp(-behind / max(uGlowLength, 0.05)) * uHot;

    vec3 col = uColorScour;
    float a = scour * uScourOpacity;
    col = mix(col, uColorLip, clamp(scratch, 0.0, 1.0));
    a = max(a, scratch * uLipBright * 0.7);
    col = mix(col, uColorLip * lit, lip);
    a = max(a, lip * uLipBright);
    col = mix(col, uColorDeep, slit);
    a = max(a, slit * uDark);
    float glowMask = slit * 0.7 + lip + scratch * 0.4;
    col += uColorGlow * uGlow * hot * glowMask * uGlobalGlow;
    a = max(a, hot * glowMask * 0.85);

    // Erodes raggedly as the cast fades.
    float n = snoise(vec3(x * 3.0, along * 1.1, uSeed * 5.0)) * 0.5 + 0.5;
    float thr = uFadeT * 1.25 - 0.12;
    float vis = uFadeT <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.12, mix(0.55, n, uErode));

    a *= vis * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

/** The cut down the floor. Normal blending: the slit has to be *dark*. */
export function createGaleScarMaterial() {
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
      uStart: { value: new Vector3() },
      uDir: { value: new Vector3() },
      uSide: { value: new Vector3() },
      uLength: { value: 10 },
      uWidth: { value: 3 },
      uLift: { value: 0.012 },
      uSeed: { value: 0 },
      uCutEnd: { value: 0 },
      uBladeAt: { value: 0 },
      uCut: { value: 0.07 },
      uLips: { value: 0.06 },
      uScour: { value: 0.9 },
      uScratches: { value: 3 },
      uScratchSpread: { value: 0.45 },
      uWiggle: { value: 0.05 },
      uWiggleScale: { value: 0.6 },
      uDark: { value: 0.85 },
      uLipBright: { value: 0.55 },
      uScourOpacity: { value: 0.22 },
      uGlow: { value: 2.4 },
      uGlowLength: { value: 2.5 },
      uHot: { value: 1 },
      uErode: { value: 0.7 },
      uFadeT: { value: 0 },
      uOpacity: { value: 1 },
      uLightXZ: { value: new Vector2(1, 0) },
      uColorDeep: { value: new Color() },
      uColorLip: { value: new Color() },
      uColorScour: { value: new Color() },
      uColorGlow: { value: new Color() }
    }),
    vertexShader: SCAR_VERTEX,
    fragmentShader: SCAR_FRAGMENT
  });

  /**
   * @param {object} state { start, dir, side, length, width, cutEnd, bladeAt,
   *   hot, fadeT, lightXZ (Vector2), seed }
   */
  material.userData.sync = (state) => {
    const c = settings.gale;
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(state.start);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLightXZ.value.copy(state.lightXZ);
    u.uLength.value = Math.max(0.1, state.length);
    u.uWidth.value = state.width;
    u.uSeed.value = state.seed;
    u.uCutEnd.value = state.cutEnd;
    u.uBladeAt.value = state.bladeAt;
    u.uCut.value = c.scarCut;
    u.uLips.value = c.scarLips;
    u.uScour.value = Math.max(0.01, c.scarScour);
    u.uScratches.value = Math.round(c.scarScratches);
    u.uScratchSpread.value = c.scarScratchSpread;
    u.uWiggle.value = c.scarWiggle * g.noiseStrength * g.randomness;
    u.uWiggleScale.value = c.scarWiggleScale * g.noiseFrequency;
    u.uDark.value = c.scarDark;
    u.uLipBright.value = c.scarLipBright;
    u.uScourOpacity.value = c.scarScourOpacity;
    u.uGlow.value = c.scarGlow * g.glow;
    u.uGlowLength.value = c.scarGlowLength;
    u.uHot.value = state.hot;
    u.uErode.value = c.scarErode;
    u.uFadeT.value = state.fadeT;
    u.uOpacity.value = g.opacity;
    u.uColorDeep.value.copy(getColor(c.colorScarDeep));
    u.uColorLip.value.copy(getColor(c.colorScarLip));
    u.uColorScour.value.copy(getColor(c.colorScarScour));
    u.uColorGlow.value.copy(getColor(c.colorScarGlow));
  };

  return material;
}
