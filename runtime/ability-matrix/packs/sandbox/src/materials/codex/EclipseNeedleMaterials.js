import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * Eclipse Needle — the bespoke shaders.
 *
 *  - **the needle** — the lathed spindle, opaque: black, with helical rifling
 *    grooves that glow violet and *turn* (the spin is a phase integrated on
 *    the CPU) so it reads as a drill bit boring down the line; a fresnel rim;
 *    hotter toward the point.
 *  - **the moon** — the eclipsing body at the point: a sphere of pure black
 *    with a hair of a white-violet limb.
 *  - **the corona** — a camera-facing billboard behind the moon: a thin ring
 *    of light at the limb, streamers that flicker on noise, and the *diamond
 *    ring* — the one bright bead where the sun breaks the limb — turning
 *    round it. At the impact it flares to totality.
 *  - **the drill strands** — two tubes wound in a helix behind the point, laid
 *    out in the vertex stage, turning with the spin, widening behind.
 *  - **the wake** — a tube of darkness from the caster's hand to the point:
 *    near-black and translucent inside, a violet fresnel skin outside,
 *    churning on noise. On the fade it collapses from the caster outward.
 *  - **the stain** — the wake's shadow on the floor: a ragged void-black band
 *    with violet fringes and a few cold specks, eroding away.
 *  - **the lens** — a billboard on `LAYER.DISTORTION` that bends light round
 *    the moon, the way an eclipse rings.
 *
 * Every material reads `settings.eclipseneedle` in `userData.sync(state)`.
 */

const ID = 'eclipseneedle';

/* -------------------------------------------------------------------- */
/* The needle                                                           */
/* -------------------------------------------------------------------- */

const SOLID_VERTEX = /* glsl */ `
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

const NEEDLE_FRAGMENT = /* glsl */ `
  uniform float uSpin;
  uniform float uGrooves;
  uniform float uTwist;
  uniform float uGrooveGlow;
  uniform float uRimGlow;
  uniform float uPointGlow;
  uniform float uDissolve;
  uniform float uSeed;
  uniform vec3  uColorBody;
  uniform vec3  uColorGroove;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;

  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  ${noiseGLSL}

  void main() {
    float s = clamp(-vLocal.y, 0.0, 1.0);   // 0 point .. 1 tail
    float a = atan(vLocal.z, vLocal.x) / 6.2831853;
    // Rifling: helical grooves, turning.
    float g = fract(a * uGrooves + s * uTwist - uSpin);
    float groove = 1.0 - smoothstep(0.0, 0.12, min(g, 1.0 - g));
    float fres = pow(max(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir))), 0.0), 2.5);
    float point = exp(-s * 6.0);
    vec3 col = uColorBody;
    col += uColorGroove * groove * uGrooveGlow * (0.35 + 0.65 * (1.0 - s));
    col += uColorRim * (fres * uRimGlow + point * uPointGlow);
    if (uDissolve > 0.0) {
      float n = snoise(vec3(s * 9.0, a * 4.0, uSeed)) * 0.5 + 0.5;
      float field = n * 0.5 + s * 0.5;
      float thr = 1.0 - uDissolve * 1.1;
      if (field > thr) discard;
      col += uColorGroove * smoothstep(thr - 0.06, thr, field) * 4.0;
    }
    gl_FragColor = vec4(col * uGlobalGlow, 1.0);
  }
`;

export function createNeedleMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSpin: { value: 0 },
      uGrooves: { value: 3 },
      uTwist: { value: 4 },
      uGrooveGlow: { value: 3 },
      uRimGlow: { value: 2 },
      uPointGlow: { value: 2 },
      uDissolve: { value: 0 },
      uSeed: { value: 0 },
      uColorBody: { value: new Color() },
      uColorGroove: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: SOLID_VERTEX,
    fragmentShader: NEEDLE_FRAGMENT
  });

  /** @param {object} s { spin, dissolve, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uSpin.value = s.spin;
    u.uGrooves.value = Math.max(1, Math.round(c.grooves));
    u.uTwist.value = c.grooveTwist;
    u.uGrooveGlow.value = c.grooveGlow * g.glow;
    u.uRimGlow.value = c.needleRim * g.glow * g.fresnel;
    u.uPointGlow.value = c.pointGlow * g.glow;
    u.uDissolve.value = s.dissolve;
    u.uSeed.value = s.seed;
    u.uColorBody.value.copy(getColor(c.colorNeedle));
    u.uColorGroove.value.copy(getColor(c.colorGroove));
    u.uColorRim.value.copy(getColor(c.colorLimb));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The moon                                                             */
/* -------------------------------------------------------------------- */

const MOON_FRAGMENT = /* glsl */ `
  uniform float uLimbGlow;
  uniform vec3  uColorBody;
  uniform vec3  uColorLimb;
  uniform float uGlobalGlow;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  void main() {
    float fres = pow(max(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir))), 0.0), 6.0);
    gl_FragColor = vec4((uColorBody + uColorLimb * fres * uLimbGlow) * uGlobalGlow, 1.0);
  }
`;

export function createMoonMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uLimbGlow: { value: 3 },
      uColorBody: { value: new Color() },
      uColorLimb: { value: new Color() }
    }),
    vertexShader: SOLID_VERTEX,
    fragmentShader: MOON_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uLimbGlow.value = c.limbGlow * g.glow;
    u.uColorBody.value.copy(getColor(c.colorMoon));
    u.uColorLimb.value.copy(getColor(c.colorLimb));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The corona                                                           */
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

const CORONA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uInner;       // the moon's radius, as a share of the billboard
  uniform float uIntensity;
  uniform float uStreamers;
  uniform float uReach;
  uniform float uBead;        // the diamond ring's brightness
  uniform float uBeadAngle;
  uniform vec3  uColorRing;
  uniform vec3  uColorCorona;
  uniform vec3  uColorBead;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float r = length(vUv);
    if (r > 1.0 || uIntensity <= 0.001) discard;
    float a = atan(vUv.y, vUv.x);
    float out_ = max(r - uInner, 0.0) / max(1.0 - uInner, 0.01);
    // The thin ring at the limb.
    float ring = exp(-pow(abs((r - uInner * 1.02) / (uInner * 0.06 + 0.004)), 2.0));
    // Streamers flickering out of it.
    float st = snoise(vec3(cos(a) * uStreamers * 0.35, sin(a) * uStreamers * 0.35, uTime * 0.7 + uSeed)) * 0.5 + 0.5;
    float rays = pow(abs(cos(a * uStreamers * 0.5 + st * 2.0)), 6.0) * 0.7 + 0.3;
    float corona = exp(-out_ / max(uReach * (0.45 + 0.75 * st), 0.02)) * rays * step(uInner, r);
    // The diamond ring: one bead on the limb, and its own little flare.
    float da = atan(sin(a - uBeadAngle), cos(a - uBeadAngle));
    float bead = exp(-pow(abs(da / 0.12), 2.0)) * exp(-pow(abs((r - uInner) / (uInner * 0.16 + 0.004)), 2.0));
    vec2 bp = vec2(cos(uBeadAngle), sin(uBeadAngle)) * uInner;
    float flare = exp(-length(vUv - bp) * 9.0) * 0.6;
    vec3 col = uColorRing * ring * 2.5 + uColorCorona * corona * 1.4 + uColorBead * (bead * 6.0 + flare) * uBead;
    float m = clamp(ring + corona + (bead + flare) * uBead, 0.0, 1.0) * (1.0 - smoothstep(0.9, 1.0, r));
    gl_FragColor = vec4(col * uIntensity * uGlobalGlow, m);
  }
`;

export function createCoronaMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 1 },
      uSeed: { value: 0 },
      uInner: { value: 0.3 },
      uIntensity: { value: 1 },
      uStreamers: { value: 12 },
      uReach: { value: 0.4 },
      uBead: { value: 1 },
      uBeadAngle: { value: 0 },
      uColorRing: { value: new Color() },
      uColorCorona: { value: new Color() },
      uColorBead: { value: new Color() }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: CORONA_FRAGMENT
  });

  /** @param {object} s { center, size, moon, intensity, bead, beadAngle, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = Math.max(0.02, s.size);
    u.uInner.value = Math.min(0.9, s.moon / Math.max(0.02, s.size));
    u.uSeed.value = s.seed;
    u.uIntensity.value = s.intensity * c.coronaGlow * g.glow;
    u.uStreamers.value = c.streamers;
    u.uReach.value = c.coronaReach;
    u.uBead.value = s.bead;
    u.uBeadAngle.value = s.beadAngle;
    u.uColorRing.value.copy(getColor(c.colorLimb));
    u.uColorCorona.value.copy(getColor(c.colorCorona));
    u.uColorBead.value.copy(getColor(c.colorBead));
  };

  return material;
}

const LENS_FRAGMENT = /* glsl */ `
  uniform float uInner;
  uniform float uStrength;
  uniform float uShaderIntensity;
  varying vec2 vUv;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float d = (r - uInner * 1.5) / (uInner * 0.9 + 0.02);
    float mask = exp(-d * d) * (1.0 - smoothstep(0.8, 1.0, r));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    // Bent round the moon: pulled toward it.
    vec2 dir = -vUv / max(r, 1e-3);
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, mask);
  }
`;

/** The light bent round the moon — LAYER.DISTORTION. */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uCenter: { value: new Vector3() },
      uSize: { value: 1 },
      uInner: { value: 0.3 },
      uStrength: { value: 1 }
    }),
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: LENS_FRAGMENT
  });

  /** @param {object} s { center, size, moon, strength } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCenter.value.copy(s.center);
    u.uSize.value = Math.max(0.02, s.size);
    u.uInner.value = Math.min(0.6, s.moon / Math.max(0.02, s.size));
    u.uStrength.value = c.lensStrength * g.distortion * s.strength;
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The drill strands                                                    */
/* -------------------------------------------------------------------- */

const STRAND_VERTEX = /* glsl */ `
  uniform vec3  uHead;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uRadius;
  uniform float uTurns;
  uniform float uSpin;
  uniform float uOffset;
  uniform float uWidth;

  varying float vS;

  void main() {
    float s = position.x;
    float ang = position.y * 6.2831853;
    vec3 up = normalize(cross(uSide, uDir));
    float phi = s * uTurns * 6.2831853 - uSpin + uOffset;
    float rad = uRadius * (0.25 + 0.75 * sqrt(s));
    vec3 radial = uSide * cos(phi) + up * sin(phi);
    vec3 c = uHead - uDir * s * uLength + radial * rad;
    vec3 world = c + (radial * cos(ang) + uDir * sin(ang)) * uWidth * (1.0 - 0.6 * s);
    vS = s;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const STRAND_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uFade;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uGlobalGlow;
  varying float vS;

  void main() {
    float m = pow(max(1.0 - vS, 0.0), 1.6) * smoothstep(0.0, 0.04, vS) * uFade;
    if (m < 0.003) discard;
    vec3 col = mix(uColorB, uColorA, pow(max(1.0 - vS, 0.0), 3.0));
    gl_FragColor = vec4(col * m * uGlow * uGlobalGlow, clamp(m, 0.0, 1.0));
  }
`;

export function createStrandMaterial(offset) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHead: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 4 },
      uRadius: { value: 0.4 },
      uTurns: { value: 3 },
      uSpin: { value: 0 },
      uOffset: { value: offset },
      uWidth: { value: 0.03 },
      uGlow: { value: 3 },
      uFade: { value: 1 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() }
    }),
    vertexShader: STRAND_VERTEX,
    fragmentShader: STRAND_FRAGMENT
  });

  /** @param {object} s { head, dir, side, spin, reach, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHead.value.copy(s.head);
    u.uDir.value.copy(s.dir);
    u.uSide.value.copy(s.side);
    u.uLength.value = Math.max(0.05, Math.min(c.strandLength, s.reach));
    u.uRadius.value = c.strandRadius;
    u.uTurns.value = c.strandTurns * Math.min(1, s.reach / Math.max(0.1, c.strandLength));
    u.uSpin.value = s.spin;
    u.uWidth.value = c.strandWidth;
    u.uGlow.value = c.strandGlow * g.glow;
    u.uFade.value = s.fade * g.opacity;
    u.uColorA.value.copy(getColor(c.colorStrandA));
    u.uColorB.value.copy(getColor(c.colorStrandB));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The wake                                                             */
/* -------------------------------------------------------------------- */

const WAKE_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uHead;
  uniform vec3  uSide;
  uniform float uRadius;
  uniform float uCollapse;    // 0 whole .. 1 gone (from the caster outward)
  uniform float uChurn;
  uniform float uFlow;
  uniform float uSeed;

  varying float vS;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  ${noiseGLSL}

  void main() {
    float s = position.x;
    float ang = position.y * 6.2831853;
    vec3 dir = uHead - uStart;
    float L = max(length(dir), 1e-3);
    dir /= L;
    vec3 up = normalize(cross(uSide, dir));
    vec3 radial = uSide * cos(ang) + up * sin(ang);
    float n = snoise(vec3(s * L * 0.6 - uFlow, cos(ang), sin(ang) + uSeed));
    // Thin at the hand, full behind the point, closed at the point itself.
    float prof = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.96, 1.0, s)) * (0.55 + 0.45 * s);
    float keep = smoothstep(uCollapse - 0.12, uCollapse + 0.02, s * 0.85 + 0.15 * (n * 0.5 + 0.5));
    float r = uRadius * prof * keep * (1.0 + uChurn * n);
    vec3 world = mix(uStart, uHead, s) + radial * max(r, 0.0);
    vS = s;
    vNormalW = radial;
    vViewDir = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const WAKE_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform float uRimGlow;
  uniform vec3  uColorInk;
  uniform vec3  uColorRim;
  uniform float uGlobalGlow;
  varying float vS;
  varying vec3  vNormalW;
  varying vec3  vViewDir;

  void main() {
    float fres = pow(max(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir))), 0.0), 4.0);
    vec3 col = uColorInk + uColorRim * fres * uRimGlow;
    float a = mix(0.72, 0.95, fres) * uOpacity * smoothstep(0.0, 0.1, vS);
    if (a < 0.01) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

export function createWakeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStart: { value: new Vector3() },
      uHead: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uRadius: { value: 0.3 },
      uCollapse: { value: 0 },
      uChurn: { value: 0.3 },
      uFlow: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uRimGlow: { value: 2 },
      uColorInk: { value: new Color() },
      uColorRim: { value: new Color() }
    }),
    vertexShader: WAKE_VERTEX,
    fragmentShader: WAKE_FRAGMENT
  });

  /** @param {object} s { start, head, side, collapse, flow, seed, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(s.start);
    u.uHead.value.copy(s.head);
    u.uSide.value.copy(s.side);
    u.uRadius.value = c.wakeRadius;
    u.uCollapse.value = s.collapse;
    u.uChurn.value = c.wakeChurn * g.noiseStrength;
    u.uFlow.value = s.flow;
    u.uSeed.value = s.seed;
    u.uOpacity.value = c.wakeOpacity * g.opacity * s.fade;
    u.uRimGlow.value = c.wakeRim * g.glow;
    u.uColorInk.value.copy(getColor(c.colorWake));
    u.uColorRim.value.copy(getColor(c.colorWakeRim));
  };

  return material;
}

/* -------------------------------------------------------------------- */
/* The stain                                                            */
/* -------------------------------------------------------------------- */

const STAIN_VERTEX = /* glsl */ `
  uniform vec3  uStart;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uHalfWidth;
  varying vec2 vFlat;         // x: across, y: along (metres)

  void main() {
    float across = position.y * uHalfWidth;
    float along = position.x * uLength;
    vec3 world = uStart + uSide * across + uDir * along;
    world.y = 0.013;
    vFlat = vec2(across, along);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const STAIN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uCutEnd;
  uniform float uWidth;
  uniform float uFringeGlow;
  uniform float uErode;
  uniform float uOpacity;
  uniform vec3  uColorVoid;
  uniform vec3  uColorFringe;
  uniform float uGlobalGlow;
  varying vec2 vFlat;

  ${noiseGLSL}

  void main() {
    float x = vFlat.x;
    float along = vFlat.y;
    if (along < 0.0 || along > uCutEnd) discard;
    float en = fbm3(vec3(along * 0.8, x * 1.5, uSeed)) * 0.5;
    float open = smoothstep(0.0, 1.0, along) * (1.0 - smoothstep(uCutEnd - 0.4, uCutEnd, along) * 0.6);
    float w = uWidth * open * (1.0 + en);
    float ad = abs(x);
    float body = 1.0 - smoothstep(w * 0.6, w, ad);
    float fringe = exp(-pow(abs((ad - w) / max(uWidth * 0.18, 0.01)), 2.0)) * open;
    vec2 cell = floor(vFlat * vec2(9.0, 5.0));
    float speck = step(0.985, hash13(vec3(cell, uSeed))) * body * (0.6 + 0.4 * sin(uTime * 4.0 + hash13(vec3(cell, 2.0)) * 30.0));
    vec3 col = uColorVoid * body + uColorFringe * (fringe * uFringeGlow + speck * 2.0);
    float a = max(body * 0.9, fringe);
    float n = snoise(vec3(vFlat * 1.3, uSeed * 3.0)) * 0.5 + 0.5;
    float thr = uErode * 1.2 - 0.1;
    a *= uErode <= 0.0 ? 1.0 : smoothstep(thr, thr + 0.1, n);
    a *= uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(a, 0.0, 1.0));
  }
`;

export function createStainMaterial() {
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
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 10 },
      uHalfWidth: { value: 1 },
      uSeed: { value: 0 },
      uCutEnd: { value: 0 },
      uWidth: { value: 0.5 },
      uFringeGlow: { value: 2 },
      uErode: { value: 0 },
      uOpacity: { value: 1 },
      uColorVoid: { value: new Color() },
      uColorFringe: { value: new Color() }
    }),
    vertexShader: STAIN_VERTEX,
    fragmentShader: STAIN_FRAGMENT
  });

  /** @param {object} s { start, dir, side, length, cutEnd, erode, seed } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStart.value.copy(s.start);
    u.uDir.value.copy(s.dir);
    u.uSide.value.copy(s.side);
    u.uLength.value = Math.max(0.1, s.length);
    u.uHalfWidth.value = c.stainWidth * 2 + 0.2;
    u.uSeed.value = s.seed;
    u.uCutEnd.value = s.cutEnd;
    u.uWidth.value = c.stainWidth;
    u.uFringeGlow.value = c.stainGlow * g.glow;
    u.uErode.value = s.erode;
    u.uOpacity.value = c.stainOpacity * g.opacity;
    u.uColorVoid.value.copy(getColor(c.colorStain));
    u.uColorFringe.value.copy(getColor(c.colorWakeRim));
  };

  return material;
}
