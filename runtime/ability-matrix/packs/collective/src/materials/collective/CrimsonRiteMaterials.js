import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { frame, sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Crimson Rite — the four bespoke shaders the rite is drawn with.
 *
 *  - **the blood moon** — a camera-facing quad that draws a whole lit sphere
 *    analytically: a normal reconstructed from the disc, limb darkening, maria
 *    from low-frequency noise and craters from a voronoi field projected on
 *    the visible hemisphere (so they foreshorten toward the limb for free),
 *    all tinted the deep copper-red of a totally eclipsed moon, wrapped in a
 *    thin bright rim and a soft halo.
 *  - **the ritual circle** — a ground quad whose fragment stage is entirely
 *    signed distance: concentric rings, a star polygon, and a band of runes
 *    built from line-segment SDFs chosen per rune by a hash. Every element is
 *    *drawn on*: the rings sweep round, the star's strokes are traced one after
 *    another, the runes light in order — all from one `uDraw` 0..1.
 *  - **the blood pool** — a ground quad that spreads from the centre with a
 *    noise-fingered edge and splatter beyond it, shaded as a wet surface: a
 *    meniscus at the edge, a fake normal from noise, a sharp Blinn highlight
 *    from the stage's own sun direction, and a fresnel env reflection. `uDry`
 *    takes it down to a matte brown stain with a darker tide line.
 *  - **the spikes** — instanced, glossy coagulated blood: almost black in the
 *    body, a hard specular, a bright red fresnel rim, and the light trapped
 *    inside glowing up out of the base.
 *
 * Every material reads `settings.crimson` in `userData.sync(state)`; `state`
 * carries only what the ability knows that settings do not.
 */

/** Equirect lookup shared by the wet surfaces. */
const ENV_GLSL = /* glsl */ `
  vec2 equirectUv(vec3 dir) {
    return vec2(atan(dir.z, dir.x) * 0.15915494 + 0.5,
                asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  }
`;

/** A ground quad lying in XZ, metres from its own centre. Shared by circle and pool. */
const GROUND_VERTEX = /* glsl */ `
  uniform float uQuadSize;
  varying vec2 vFlat;
  varying vec3 vWorld;

  void main() {
    vFlat = (uv - 0.5) * uQuadSize;
    // PlaneGeometry rotated into XZ has its +V running toward -Z.
    vFlat.y = -vFlat.y;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/* -------------------------------------------------------------------- */
/* the blood moon                                                       */
/* -------------------------------------------------------------------- */

const MOON_VERTEX = /* glsl */ `
  uniform float uSize;   // half-width of the quad, metres
  varying vec2 vLocal;

  void main() {
    vLocal = position.xy * 2.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * (uSize * 2.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const MOON_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uHaloReach;   // quad half-width in moon radii
  uniform float uSpin;        // radians the surface has turned
  uniform float uMaria;
  uniform float uMariaScale;
  uniform float uCraters;
  uniform float uCraterScale;
  uniform float uLimb;
  uniform float uSurface;
  uniform float uRimGlow;
  uniform float uRimWidth;
  uniform float uHalo;
  uniform float uHaloFalloff;
  uniform float uFlicker;
  uniform float uFade;
  uniform float uOpacity;
  uniform vec3  uColorLight;
  uniform vec3  uColorDark;
  uniform vec3  uColorRim;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;

  varying vec2 vLocal;

  ${noiseGLSL}

  void main() {
    // Moon radii from the centre.
    vec2 p = vLocal * uHaloReach;
    float r = length(p);
    if (r > uHaloReach) discard;

    float aa = fwidth(r) * 1.2;
    float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);

    vec3 color = vec3(0.0);
    float alpha = 0.0;

    if (r < 1.0 + aa) {
      // The visible hemisphere's normal, reconstructed from the disc.
      vec3 n = vec3(p, sqrt(max(0.0, 1.0 - min(r * r, 1.0))));
      // Turned slowly about the vertical, so the maria drift across the face.
      vec3 s = vec3(n.x * cos(uSpin) - n.z * sin(uSpin), n.y, n.x * sin(uSpin) + n.z * cos(uSpin));

      // Maria: broad dark seas.
      float maria = smoothstep(-0.05, 0.35, fbm4(s * uMariaScale + uSeed));
      // Craters: a voronoi field over the face. Bowl darker, rim brighter.
      vec2 cell = voronoi2(n.xy / max(n.z + 0.35, 0.35) * uCraterScale + uSeed * 3.1);
      float size = mix(0.18, 0.42, cell.y);
      float bowl = 1.0 - smoothstep(size * 0.55, size, cell.x);
      float rim = smoothstep(size * 0.6, size, cell.x) * (1.0 - smoothstep(size, size * 1.35, cell.x));
      float speck = snoise(s * 22.0 + uSeed) * 0.5 + 0.5;

      float tone = 1.0;
      tone -= maria * uMaria;
      tone -= bowl * uCraters * 0.55 * step(0.45, cell.y);
      tone += rim * uCraters * 0.35 * step(0.45, cell.y);
      tone += (speck - 0.5) * uSurface;
      // Limb darkening: the light grazes the edge of the sphere.
      float limb = pow(clamp(n.z, 0.0, 1.0), uLimb);
      tone = clamp(tone, 0.0, 1.4) * mix(0.35, 1.0, limb);

      color = mix(uColorDark, uColorLight, clamp(tone, 0.0, 1.0)) * (0.6 + 0.4 * tone);
      alpha = disc;
    }

    // A thin bright rim right on the limb, and the halo beyond it.
    float d = max(r - 1.0, 0.0);
    float rimLine = exp(-abs(r - 1.0) / max(uRimWidth, 1e-3)) * uRimGlow;
    float halo = exp(-d * uHaloFalloff) * uHalo * (1.0 - disc * 0.6);
    // The halo must die before the quad's edge or it prints a square.
    halo *= 1.0 - smoothstep(uHaloReach * 0.7, uHaloReach, r);

    float flicker = 1.0 + uFlicker * sin(uTime * 2.3 + uSeed) * sin(uTime * 3.7);
    color += uColorRim * rimLine + uColorHalo * halo;
    color *= uGlobalGlow * flicker;

    alpha = clamp(max(alpha, rimLine * 0.5 + halo), 0.0, 1.0) * uFade * uOpacity;
    if (alpha < 0.003) discard;
    // Additive: the moon is light in the sky, never something the sky shows through grey.
    gl_FragColor = vec4(color * uFade * uOpacity, alpha);
  }
`;

/** The blood moon billboard. */
export function createCrimsonMoonMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 4 },
      uSeed: { value: 0 },
      uHaloReach: { value: 2.5 },
      uSpin: { value: 0 },
      uMaria: { value: 0.4 },
      uMariaScale: { value: 1.6 },
      uCraters: { value: 0.6 },
      uCraterScale: { value: 4 },
      uLimb: { value: 0.6 },
      uSurface: { value: 0.2 },
      uRimGlow: { value: 1.5 },
      uRimWidth: { value: 0.03 },
      uHalo: { value: 0.6 },
      uHaloFalloff: { value: 2.5 },
      uFlicker: { value: 0.05 },
      uFade: { value: 1 },
      uOpacity: { value: 1 },
      uColorLight: { value: new Color() },
      uColorDark: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: MOON_VERTEX,
    fragmentShader: MOON_FRAGMENT
  });

  /** @param {object} state { size, spin, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.crimson;
    const g = settings.global;
    const u = material.uniforms;
    const reach = Math.max(1.05, c.moonHaloReach);
    u.uSize.value = Math.max(0.05, state.size ?? c.moonRadius) * reach;
    u.uHaloReach.value = reach;
    u.uSpin.value = state.spin ?? 0;
    u.uFade.value = state.fade ?? 1;
    u.uSeed.value = state.seed ?? 0;
    u.uMaria.value = c.moonMaria * g.shaderIntensity;
    u.uMariaScale.value = c.moonMariaScale * g.noiseFrequency;
    u.uCraters.value = c.moonCraters * g.shaderIntensity;
    u.uCraterScale.value = c.moonCraterScale * g.noiseFrequency;
    u.uLimb.value = c.moonLimb;
    u.uSurface.value = c.moonSurface * g.noiseStrength;
    u.uRimGlow.value = c.moonRimGlow * g.glow * g.fresnel;
    u.uRimWidth.value = c.moonRimWidth;
    u.uHalo.value = c.moonHalo * g.glow;
    u.uHaloFalloff.value = c.moonHaloFalloff;
    u.uFlicker.value = c.moonFlicker;
    u.uOpacity.value = c.moonBrightness * g.opacity;
    u.uColorLight.value.copy(getColor(c.colorMoonLight));
    u.uColorDark.value.copy(getColor(c.colorMoonDark));
    u.uColorRim.value.copy(getColor(c.colorMoonRim));
    u.uColorHalo.value.copy(getColor(c.colorMoonHalo));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the ritual circle                                                    */
/* -------------------------------------------------------------------- */

const CIRCLE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;      // metres
  uniform float uDraw;        // 0..1 how much of the rite has been drawn
  uniform float uRuneAngle;   // radians the rune band has turned
  uniform float uStarAngle;   // radians the star has turned
  uniform float uRuneInner;   // inner edge of the rune band, × radius
  uniform float uInnerRing;   // the inner circle, × radius
  uniform float uStarRadius;  // star vertices, × radius
  uniform float uStarPoints;
  uniform float uStarSkip;
  uniform float uRunes;       // runes around the band
  uniform float uRuneSize;    // × the band width
  uniform float uLine;        // stroke half-width, metres
  uniform float uGlowWidth;   // metres
  uniform float uCoreGlow;
  uniform float uHaloGlow;
  uniform float uPulse;
  uniform float uPulseRate;
  uniform float uSeed;
  uniform float uFade;
  uniform float uOpacity;
  uniform vec3  uColorCore;
  uniform vec3  uColorGlow;
  uniform float uGlobalGlow;

  varying vec2 vFlat;

  ${noiseGLSL}

  const float TAU = 6.28318530718;

  float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  /** Fraction of the way round from a start bearing, 0..1. */
  float sweep(float a, float start) {
    return fract((a - start) / TAU + 1.0);
  }

  /** A ring of radius rr that sweeps on as uDraw passes [from, to]. */
  float ringSDF(float r, float a, float rr, float from, float to, float start) {
    float k = clamp((uDraw - from) / max(to - from, 1e-3), 0.0, 1.0);
    float shown = step(sweep(a, start), k);
    return mix(1e3, abs(r - rr), shown);
  }

  /**
   * One rune: up to eight strokes and a ring, picked by hash from its id.
   * q is the rune's own frame in units of its size (-0.5..0.5 each way).
   */
  float runeSDF(vec2 q, float id) {
    float d = sdSegment(q, vec2(0.0, -0.42), vec2(0.0, 0.42));   // every rune has a stem
    float h;
    h = hash11(id * 13.1 + 1.0); if (h > 0.5) d = min(d, sdSegment(q, vec2(0.0, 0.42), vec2(-0.3, 0.12)));
    h = hash11(id * 13.1 + 2.0); if (h > 0.5) d = min(d, sdSegment(q, vec2(0.0, 0.42), vec2(0.3, 0.12)));
    h = hash11(id * 13.1 + 3.0); if (h > 0.55) d = min(d, sdSegment(q, vec2(0.0, -0.42), vec2(-0.3, -0.12)));
    h = hash11(id * 13.1 + 4.0); if (h > 0.55) d = min(d, sdSegment(q, vec2(0.0, -0.42), vec2(0.3, -0.12)));
    h = hash11(id * 13.1 + 5.0); if (h > 0.6) d = min(d, sdSegment(q, vec2(-0.3, 0.0), vec2(0.3, 0.0)));
    h = hash11(id * 13.1 + 6.0); if (h > 0.6) d = min(d, sdSegment(q, vec2(0.0, 0.1), vec2(-0.3, 0.36)));
    h = hash11(id * 13.1 + 7.0); if (h > 0.6) d = min(d, sdSegment(q, vec2(0.0, -0.1), vec2(0.3, -0.36)));
    h = hash11(id * 13.1 + 8.0); if (h > 0.7) d = min(d, abs(length(q - vec2(0.0, 0.18)) - 0.13));
    return d;
  }

  void main() {
    float r = length(vFlat);
    float R = max(uRadius, 0.05);
    if (r > R * 1.12) discard;
    float a = atan(vFlat.y, vFlat.x);

    float band = R * (1.0 - uRuneInner);
    float d = 1e3;

    /* --- rings: the outer pair first, then the inner circle --- */
    d = min(d, ringSDF(r, a, R, 0.0, 0.3, 1.57));
    d = min(d, ringSDF(r, a, R * uRuneInner, 0.05, 0.35, -1.57));
    d = min(d, ringSDF(r, a, R * uInnerRing, 0.55, 0.75, 0.0));

    /* --- the star: strokes traced one after another --- */
    {
      float n = max(3.0, floor(uStarPoints + 0.5));
      float k = max(1.0, floor(uStarSkip + 0.5));
      float sr = R * uStarRadius;
      float drawn = clamp((uDraw - 0.3) / 0.35, 0.0, 1.0) * n;
      for (int i = 0; i < 12; i++) {
        float fi = float(i);
        if (fi >= n) break;
        float a0 = uStarAngle + fi * k * TAU / n;
        float a1 = uStarAngle + (fi + 1.0) * k * TAU / n;
        vec2 p0 = vec2(cos(a0), sin(a0)) * sr;
        vec2 p1 = vec2(cos(a1), sin(a1)) * sr;
        float part = clamp(drawn - fi, 0.0, 1.0);
        if (part <= 0.0) continue;
        d = min(d, sdSegment(vFlat, p0, mix(p0, p1, part)));
        // A dot at every point of the star.
        d = min(d, abs(length(vFlat - p0) - R * 0.035));
      }
    }

    /* --- the rune band --- */
    if (r > R * uRuneInner && r < R) {
      float n = max(3.0, floor(uRunes + 0.5));
      float ar = a - uRuneAngle;
      float f = ar / TAU * n;
      float id = floor(f);
      id = mod(id, n);
      float mid = R - band * 0.5;
      float size = max(band * uRuneSize, 1e-3);
      vec2 q = vec2((fract(f) - 0.5) * TAU * mid / n, r - mid) / size;
      float lit = step((id + 0.5) / n, clamp((uDraw - 0.4) / 0.6, 0.0, 1.0));
      if (lit > 0.0 && abs(q.x) < 0.5) d = min(d, runeSDF(q, id + uSeed) * size);
    }

    /* --- light --- */
    float aa = fwidth(d) + 1e-4;
    float core = 1.0 - smoothstep(uLine, uLine + aa * 1.5, d);
    float glow = exp(-max(d - uLine, 0.0) / max(uGlowWidth, 1e-3));
    float pulse = 1.0 + uPulse * sin(uTime * uPulseRate - r * 2.0);
    // Blood seeping along the strokes: a slow noise that brightens and dims them.
    float seep = 0.75 + 0.5 * snoise(vec3(vFlat * 1.3, uTime * 0.4 + uSeed));

    vec3 color = uColorCore * core * uCoreGlow + uColorGlow * glow * uHaloGlow * seep;
    color *= pulse * uGlobalGlow * uFade * uOpacity;
    float alpha = clamp(core + glow * 0.6, 0.0, 1.0) * uFade * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

/** The ritual circle, drawn on. Additive ground quad. */
export function createCrimsonCircleMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uQuadSize: { value: 8 },
      uRadius: { value: 3 },
      uDraw: { value: 0 },
      uRuneAngle: { value: 0 },
      uStarAngle: { value: 0 },
      uRuneInner: { value: 0.82 },
      uInnerRing: { value: 0.4 },
      uStarRadius: { value: 0.82 },
      uStarPoints: { value: 7 },
      uStarSkip: { value: 3 },
      uRunes: { value: 18 },
      uRuneSize: { value: 0.8 },
      uLine: { value: 0.02 },
      uGlowWidth: { value: 0.08 },
      uCoreGlow: { value: 3 },
      uHaloGlow: { value: 1 },
      uPulse: { value: 0.2 },
      uPulseRate: { value: 3 },
      uSeed: { value: 0 },
      uFade: { value: 1 },
      uOpacity: { value: 1 },
      uColorCore: { value: new Color() },
      uColorGlow: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: CIRCLE_FRAGMENT
  });

  /** @param {object} state { radius, quadSize, draw, runeAngle, starAngle, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.crimson;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize ?? 8;
    u.uRadius.value = state.radius ?? 3;
    u.uDraw.value = state.draw ?? 0;
    u.uRuneAngle.value = state.runeAngle ?? 0;
    u.uStarAngle.value = state.starAngle ?? 0;
    u.uFade.value = state.fade ?? 1;
    u.uSeed.value = state.seed ?? 0;
    u.uRuneInner.value = c.circleRuneInner;
    u.uInnerRing.value = c.circleInnerRing;
    u.uStarRadius.value = c.circleStarRadius;
    u.uStarPoints.value = c.circleStarPoints;
    u.uStarSkip.value = c.circleStarSkip;
    u.uRunes.value = c.circleRunes;
    u.uRuneSize.value = c.circleRuneSize;
    u.uLine.value = c.circleLine;
    u.uGlowWidth.value = c.circleGlowWidth;
    u.uCoreGlow.value = c.circleCoreGlow * g.glow;
    u.uHaloGlow.value = c.circleHaloGlow * g.glow * g.shaderIntensity;
    u.uPulse.value = c.circlePulse;
    u.uPulseRate.value = c.circlePulseRate * g.animationSpeed;
    u.uOpacity.value = c.circleOpacity * g.opacity;
    u.uColorCore.value.copy(getColor(c.colorCircleCore));
    u.uColorGlow.value.copy(getColor(c.colorCircleGlow));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the blood pool                                                       */
/* -------------------------------------------------------------------- */

const POOL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGrown;       // metres the pool has spread to
  uniform float uEdgeNoise;   // fingering of the edge, × the radius
  uniform float uEdgeScale;
  uniform float uFeather;     // metres
  uniform float uSplatter;
  uniform float uSplatterScale;
  uniform float uMeniscus;
  uniform float uRipple;
  uniform float uRippleScale;
  uniform float uBump;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uEnv;
  uniform float uFresnel;
  uniform float uDry;         // 0 wet .. 1 a dry stain
  uniform float uTideLine;
  uniform float uSeed;
  uniform float uFade;
  uniform float uOpacity;
  uniform vec3  uColorWet;
  uniform vec3  uColorDeep;
  uniform vec3  uColorSpec;
  uniform vec3  uColorStain;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec2 vFlat;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${ENV_GLSL}

  /** Signed distance to the pool's edge, metres; negative inside. */
  float edgeSDF(vec2 p) {
    float r = length(p);
    vec2 dir = p / max(r, 1e-4);
    float n = fbm3(vec3(dir * uEdgeScale, uSeed)) + 0.35 * snoise(vec3(p * uEdgeScale * 0.6, uSeed + 7.0));
    return r - uGrown * (1.0 + n * uEdgeNoise);
  }

  /** The wet surface's height field: a meniscus at the edge plus slow ripples. */
  float heightAt(vec2 p, float edge) {
    float men = smoothstep(-uFeather * 4.0, 0.0, edge) * uMeniscus;
    float rip = snoise(vec3(p * uRippleScale, uTime * 0.6 + uSeed)) * uRipple;
    return men + rip;
  }

  void main() {
    if (uGrown <= 0.001) discard;
    float edge = edgeSDF(vFlat);

    // Splatter: separate beads thrown just past the edge.
    vec2 cell = voronoi2(vFlat * uSplatterScale + uSeed * 5.3);
    float beadR = mix(0.08, 0.28, cell.y) * uSplatter;
    float beads = (1.0 - smoothstep(beadR * 0.8, beadR, cell.x))
                * step(0.55, cell.y)
                * (1.0 - smoothstep(0.0, uGrown * 0.35, edge));

    float body = 1.0 - smoothstep(-uFeather, 0.0, edge);
    float cover = max(body, beads);
    if (cover < 0.004) discard;

    /* --- the fake normal, by central differences on the height field --- */
    float e = 0.04;
    float h0 = heightAt(vFlat, edge);
    float hx = heightAt(vFlat + vec2(e, 0.0), edgeSDF(vFlat + vec2(e, 0.0)));
    float hz = heightAt(vFlat + vec2(0.0, e), edgeSDF(vFlat + vec2(0.0, e)));
    float wet = 1.0 - uDry;
    vec3 N = normalize(vec3(-(hx - h0) / e * uBump * wet, 1.0, -(hz - h0) / e * uBump * wet));

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);

    /* --- colour: deep in the middle, brighter where it is thin --- */
    float depth = smoothstep(0.0, uGrown * 0.6, -edge);
    vec3 base = mix(uColorWet, uColorDeep, depth);
    float lambert = 0.45 + 0.55 * clamp(dot(N, L), 0.0, 1.0);
    base *= lambert;

    /* --- the wet: sharp highlight and the sky in it --- */
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), uGloss) * uSpecular;
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0) * uFresnel + 0.04;
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uEnv * fres;
    vec3 wetColor = base + (uColorSpec * spec + env) * wet;

    /* --- drying: matte, browner, a dark tide line at the old edge --- */
    float tide = exp(-abs(edge + uFeather * 2.0) / max(uFeather * 2.5, 1e-3)) * uTideLine;
    float craze = (1.0 - smoothstep(0.0, 0.02, voronoi2(vFlat * 6.0 + uSeed).x - 0.05)) * 0.25;
    vec3 stain = uColorStain * (1.0 - tide * 0.6) * (1.0 - craze * uDry);
    vec3 color = mix(wetColor, stain, uDry);

    float alpha = cover * uOpacity * uFade * mix(1.0, 0.75 + tide * 0.25, uDry);
    gl_FragColor = vec4(color * mix(uGlobalGlow, 1.0, 0.5), alpha);
  }
`;

/** The blood pool, spreading, then drying to a stain. Alpha-blended ground quad. */
export function createCrimsonPoolMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uQuadSize: { value: 8 },
      uGrown: { value: 0 },
      uEdgeNoise: { value: 0.25 },
      uEdgeScale: { value: 2.2 },
      uFeather: { value: 0.03 },
      uSplatter: { value: 1 },
      uSplatterScale: { value: 3 },
      uMeniscus: { value: 0.03 },
      uRipple: { value: 0.01 },
      uRippleScale: { value: 2 },
      uBump: { value: 1 },
      uGloss: { value: 120 },
      uSpecular: { value: 3 },
      uEnv: { value: 0.6 },
      uFresnel: { value: 1 },
      uDry: { value: 0 },
      uTideLine: { value: 0.7 },
      uSeed: { value: 0 },
      uFade: { value: 1 },
      uOpacity: { value: 1 },
      uColorWet: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorSpec: { value: new Color() },
      uColorStain: { value: new Color() }
    }),
    vertexShader: GROUND_VERTEX,
    fragmentShader: POOL_FRAGMENT
  });

  /** @param {object} state { quadSize, grown, dry, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.crimson;
    const g = settings.global;
    const u = material.uniforms;
    u.uQuadSize.value = state.quadSize ?? 8;
    u.uGrown.value = state.grown ?? 0;
    u.uDry.value = state.dry ?? 0;
    u.uFade.value = state.fade ?? 1;
    u.uSeed.value = state.seed ?? 0;
    u.uEdgeNoise.value = c.poolEdgeNoise * g.noiseStrength;
    u.uEdgeScale.value = c.poolEdgeScale * g.noiseFrequency;
    u.uFeather.value = Math.max(0.005, c.poolFeather);
    u.uSplatter.value = c.poolSplatter * g.randomness;
    u.uSplatterScale.value = c.poolSplatterScale;
    u.uMeniscus.value = c.poolMeniscus;
    u.uRipple.value = c.poolRipple * g.turbulence;
    u.uRippleScale.value = c.poolRippleScale * g.noiseFrequency;
    u.uBump.value = c.poolBump * g.shaderIntensity;
    u.uGloss.value = c.poolGloss;
    u.uSpecular.value = c.poolSpecular * g.glow;
    u.uEnv.value = c.poolEnv;
    u.uFresnel.value = c.poolFresnel * g.fresnel;
    u.uTideLine.value = c.poolTideLine;
    u.uOpacity.value = c.poolOpacity * g.opacity;
    u.uColorWet.value.copy(getColor(c.colorPoolWet));
    u.uColorDeep.value.copy(getColor(c.colorPoolDeep));
    u.uColorSpec.value.copy(getColor(c.colorPoolSpec));
    u.uColorStain.value.copy(getColor(c.colorPoolStain));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* the spikes                                                           */
/* -------------------------------------------------------------------- */

const SPIKE_VERTEX = /* glsl */ `
  attribute float aSeed;
  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vSeed;

  void main() {
    vLocal = position;
    vSeed = aSeed;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    // Non-uniform instance scale: good enough for a shading normal on a
    // shape this smooth, and it keeps the shader free of an inverse.
    vNormalW = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SPIKE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGloss;
  uniform float uSpecular;
  uniform float uEnv;
  uniform float uRim;
  uniform float uRimPower;
  uniform float uInner;
  uniform float uVeins;
  uniform float uVeinScale;
  uniform float uDrip;
  uniform float uFade;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  uniform vec3  uColorRim;
  uniform vec3  uColorInner;
  uniform vec3  uColorSpec;
  uniform vec3  uLightDir;
  uniform sampler2D uEnvMap;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vWorld;
  varying vec3  vLocal;
  varying float vSeed;

  ${noiseGLSL}
  ${ENV_GLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float h = clamp(vLocal.y, 0.0, 1.0);

    // Clotted body: veins of brighter blood through near-black, running along
    // the spike so they read as having *flowed* up it as it set.
    vec3 vp = vec3(vLocal.x * uVeinScale, vLocal.y * uVeinScale * 0.35, vLocal.z * uVeinScale) + vSeed * 17.0;
    float vein = pow(clamp(ridged(vp, 4), 0.0, 1.0), 3.0) * uVeins;
    vec3 body = mix(uColorDeep, uColorBody, clamp(vein + h * 0.35, 0.0, 1.0));

    // Drips: thin wet streaks running down from the tip.
    float streak = smoothstep(0.65, 1.0, snoise(vec3(atan(vLocal.z, vLocal.x) * 3.0, h * 1.5 - uTime * 0.25, vSeed)));
    body += uColorBody * streak * uDrip * (1.0 - h);

    float lambert = 0.25 + 0.75 * clamp(dot(N, L), 0.0, 1.0);
    vec3 color = body * lambert;

    // Glossy: a tight highlight and the sky in it.
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), uGloss) * uSpecular;
    float fres = pow(1.0 - ndv, 4.0);
    vec3 env = texture2D(uEnvMap, equirectUv(reflect(-V, N))).rgb * uEnv * (0.06 + fres);
    color += uColorSpec * spec + env;

    // The bright red rim, and the light trapped in the blood glowing up out of
    // the pool at the base.
    float rim = pow(1.0 - ndv, uRimPower) * uRim;
    float inner = (1.0 - smoothstep(0.0, 0.45, h)) * uInner;
    color += (uColorRim * rim + uColorInner * inner) * uGlobalGlow * uFade;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Glossy coagulated blood. Opaque; used on an InstancedMesh on LAYER.WORLD. */
export function createCrimsonSpikeMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uEnvMap: frame.uEnvMap,
      uGloss: { value: 90 },
      uSpecular: { value: 2 },
      uEnv: { value: 0.8 },
      uRim: { value: 2 },
      uRimPower: { value: 3 },
      uInner: { value: 1.5 },
      uVeins: { value: 0.8 },
      uVeinScale: { value: 3 },
      uDrip: { value: 0.6 },
      uFade: { value: 1 },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorInner: { value: new Color() },
      uColorSpec: { value: new Color() }
    }),
    vertexShader: SPIKE_VERTEX,
    fragmentShader: SPIKE_FRAGMENT
  });
  material.userData.instanced = true;

  /** @param {object} state { fade } */
  material.userData.sync = (state) => {
    const c = settings.crimson;
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = state.fade ?? 1;
    u.uGloss.value = c.spikeGloss;
    u.uSpecular.value = c.spikeSpecular * g.glow;
    u.uEnv.value = c.spikeEnv;
    u.uRim.value = c.spikeRim * g.fresnel;
    u.uRimPower.value = c.spikeRimPower;
    u.uInner.value = c.spikeInnerGlow * g.glow;
    u.uVeins.value = c.spikeVeins * g.shaderIntensity;
    u.uVeinScale.value = c.spikeVeinScale * g.noiseFrequency;
    u.uDrip.value = c.spikeDrip;
    u.uColorBody.value.copy(getColor(c.colorSpikeBody));
    u.uColorDeep.value.copy(getColor(c.colorSpikeDeep));
    u.uColorRim.value.copy(getColor(c.colorSpikeRim));
    u.uColorInner.value.copy(getColor(c.colorSpikeInner));
    u.uColorSpec.value.copy(getColor(c.colorSpikeSpec));
  };

  return material;
}
