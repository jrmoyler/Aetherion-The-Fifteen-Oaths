import { AdditiveBlending, Color, DoubleSide, MeshStandardMaterial, NormalBlending, ShaderMaterial, Vector2, Vector4 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Signal Jack — materials.
 *
 * The rule this cast was written to: **machinery is lit, solid, shadowing
 * metal; only the signal glows.** The spike, claws, mast, dish and plugs are
 * `MeshStandardMaterial` gunmetal on `LAYER.WORLD`, patched (not replaced) so
 * thin seams carry the hijack signal; the cables are dark armoured rubber
 * with data pulses written into their emissive. Everything that *is* signal
 * — the intrusion field, the scan sheaths, the halos, the turncoat bolts —
 * is a bespoke additive or field `ShaderMaterial` on the four-stop ramp
 * core #fff0fb → tint #ff8ad8 → body #e0177f → deep #1c0614.
 *
 *  - `createMetalMaterial` — machined gunmetal: lathe banding in roughness,
 *    emissive seams at `seamSpacing`/m that throb with the signal (`uPulse`).
 *  - `createCableMaterial` — armoured cable: ribbed rubber, pulses running
 *    head → body at `pulseRate`, a white overload front (`uFront`).
 *  - `createFieldMaterial` — the intrusion field on the floor: a burnt-in
 *    deep footprint, Manhattan circuit traces racing out from the spike,
 *    bus routes lit toward each jacked body, a landing reticle during the
 *    throw, the EMP ring, a noise dissolve.
 *  - `createSheathMaterial` — scanlines sweeping down a jacked body.
 *  - `createHaloMaterial` — the takeover glyph ring over a jacked head.
 *  - `createBoltMaterial` — the turncoat bolt (volume on N·V, dashes).
 *  - `createAccentMaterial` — the lens eye, feed horn and plug collars.
 *  - `createLensMaterial` — `LAYER.DISTORTION`: heat shimmer and EMP ring.
 */

const ID = config.id;

const additive = (extra) => ({
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: AdditiveBlending,
  side: DoubleSide,
  toneMapped: false,
  ...extra,
});

const ramp = () => ({
  uCore: { value: new Color() },
  uTint: { value: new Color() },
  uBody: { value: new Color() },
  uDeep: { value: new Color() },
});
function syncRamp(u, c) {
  u.uCore.value.copy(getColor(c.colorCore));
  u.uTint.value.copy(getColor(c.colorTint));
  u.uBody.value.copy(getColor(c.colorBody));
  u.uDeep.value.copy(getColor(c.colorDeep));
}
const RAMP_GLSL = /* glsl */ `
  uniform vec3 uCore; uniform vec3 uTint; uniform vec3 uBody; uniform vec3 uDeep;
  vec3 sigRamp(float t) { return gradient4(uDeep, uBody, uTint, uCore, t); }
`;

const WORLD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/* -------------------------------------------------------------------- */
/* Lit metal (patched MeshStandardMaterial)                             */
/* -------------------------------------------------------------------- */

/**
 * @param {{dark?: boolean, seams?: boolean}} o dark = anodised parts; seams
 *   off for small parts where a band would read as noise.
 */
export function createMetalMaterial({ dark = false, seams = true } = {}) {
  const material = new MeshStandardMaterial({ color: dark ? 0x1b1d22 : 0x5a616c, metalness: 0.88, roughness: 0.34 });
  const uniforms = {
    uSeamColor: { value: new Color('#e0177f') },
    uSeamGlow: { value: seams ? 2 : 0 },
    uSeamFreq: { value: 3.2 },
    uSeamWidth: { value: 0.06 },
    uPulse: { value: 0 },
  };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSjLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSjLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSjLocal;
        uniform vec3 uSeamColor; uniform float uSeamGlow; uniform float uSeamFreq; uniform float uSeamWidth; uniform float uPulse;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Lathe banding: fine machining rings modulate the roughness.
        roughnessFactor = clamp(roughnessFactor * (0.82 + 0.36 * abs(sin(vSjLocal.y * 180.0))), 0.04, 1.0);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float band = fract(vSjLocal.y * uSeamFreq);
          float seam = 1.0 - smoothstep(uSeamWidth * 0.5, uSeamWidth, abs(band - 0.5));
          seam *= step(0.02, vSjLocal.y);
          totalEmissiveRadiance += uSeamColor * seam * uSeamGlow * (0.45 + 0.55 * uPulse);
        }`,
      );
  };
  material.customProgramCacheKey = () => `signal-jack-metal-${seams ? 1 : 0}`;
  /** @param {{pulse: number, fade: number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    material.color.copy(getColor(dark ? c.metalDark : c.metalColor));
    material.metalness = c.metalness;
    material.roughness = dark ? Math.min(1, c.roughness + 0.18) : c.roughness;
    uniforms.uSeamColor.value.copy(getColor(c.colorBody));
    uniforms.uSeamGlow.value = seams ? c.seamGlow * g.glow * s.fade : 0;
    uniforms.uSeamFreq.value = c.seamSpacing;
    uniforms.uSeamWidth.value = c.seamWidth;
    uniforms.uPulse.value = s.pulse;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Armoured cable                                                       */
/* -------------------------------------------------------------------- */

export function createCableMaterial() {
  const material = new MeshStandardMaterial({ color: 0x141418, metalness: 0.35, roughness: 0.55 });
  const uniforms = {
    uPulseColor: { value: new Color('#e0177f') },
    uHotColor: { value: new Color('#fff0fb') },
    uPulseGlow: { value: 3 },
    uPhase: { value: 0 },
    uRate: { value: 3 },
    uFront: { value: -1 },
    uReach: { value: 1 },
  };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSjUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSjUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vSjUv;
        uniform vec3 uPulseColor; uniform vec3 uHotColor; uniform float uPulseGlow; uniform float uPhase; uniform float uRate; uniform float uFront; uniform float uReach;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Armour rings: the cable is a run of ribbed collars, glossy on the crests.
        float rib = abs(sin(vSjUv.x * uReach * 140.0));
        roughnessFactor = mix(0.3, 0.75, rib);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float t = vSjUv.x;
          // Packets: short bright dashes running head (0) → body (1).
          float k = fract(t * uReach * 1.6 - uPhase);
          float packet = smoothstep(0.0, 0.05, k) * (1.0 - smoothstep(0.12, 0.2, k));
          float stripe = 1.0 - smoothstep(0.1, 0.22, abs(vSjUv.y - 0.5));
          vec3 e = uPulseColor * (packet * (0.35 + stripe) + 0.06 * stripe) * uPulseGlow;
          float front = uFront >= 0.0 ? exp(-abs(t - uFront) * 18.0) * 6.0 + step(t, uFront) * 1.2 : 0.0;
          e += mix(uPulseColor, uHotColor, 0.6) * front * uPulseGlow * 0.5;
          totalEmissiveRadiance += e;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'signal-jack-cable';
  /** @param {{phase: number, front: number, reach: number, fade: number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    // Armoured sheath: the gunmetal, darkened — readable against a night floor.
    material.color.copy(getColor(c.metalColor)).multiplyScalar(0.55);
    uniforms.uPulseColor.value.copy(getColor(c.colorBody));
    uniforms.uHotColor.value.copy(getColor(c.colorCore));
    uniforms.uPulseGlow.value = c.pulseGlow * g.glow * s.fade;
    uniforms.uPhase.value = s.phase;
    uniforms.uFront.value = s.front;
    uniforms.uReach.value = s.reach;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Intrusion field                                                      */
/* -------------------------------------------------------------------- */

const FIELD_FRAGMENT = /* glsl */ `
  uniform vec2  uCentre;
  uniform float uRadius;     // field radius (m)
  uniform float uSpread;     // 0..1: how far the traces have raced out
  uniform float uDeepAlpha;  // opacity of the burnt footprint
  uniform float uReticle;    // 0..1: the landing reticle during the throw
  uniform float uRing;       // EMP ring radius 0..1, < 0 off
  uniform float uCell;
  uniform float uClock;
  uniform float uFade;
  uniform float uDissolve;
  uniform float uGlow;
  uniform float uTraceGlow;
  uniform float uRouteGlow;
  uniform float uReticleGlow;
  uniform vec4  uTargets[4]; // xz world, power, overload
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${noiseGLSL}
  ${commonGLSL}
  ${RAMP_GLSL}

  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec2 p = vWorld.xz - uCentre;
    float r = length(p) / uRadius;
    if (r > 1.0) discard;
    float edgeN = snoise(vec3(p * 0.9, 1.7)) * 0.06;

    // --- the landing reticle (throw only): four brackets closing in ---
    float ang = atan(p.y, p.x);
    float rr = 0.55 + 0.35 * (1.0 - uReticle);
    float bracket = exp(-abs(r - rr) * 60.0) * step(0.55, abs(sin(ang * 2.0 + 0.785)));
    float cross = (exp(-abs(p.x) * 30.0) + exp(-abs(p.y) * 30.0)) * step(r, 0.18);
    float reticle = (bracket + cross * 0.6) * uReticle * uReticleGlow;

    // --- Manhattan circuit traces, in world metres ---
    vec2 g = p / uCell;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float w = 0.07;
    float segX = floor(g.x / 3.0), segY = floor(g.y / 3.0);
    float runX = step(0.55, hash13(vec3(id.y, segX, 1.3)));
    float runY = step(0.62, hash13(vec3(id.x, segY, 7.9)));
    float lx = (1.0 - smoothstep(w, w + 0.05, abs(f.y))) * runX;
    float ly = (1.0 - smoothstep(w, w + 0.05, abs(f.x))) * runY;
    float padH = hash13(vec3(id, 3.3));
    float pad = step(0.86, padH) * (1.0 - smoothstep(0.03, 0.07, abs(length(f) - 0.2)));
    float via = step(0.93, padH) * (1.0 - smoothstep(0.08, 0.12, length(f)));
    float trace = max(max(lx, ly), max(pad, via));

    // The traces race out from the spike; the front is ragged and hot.
    float front = uSpread * 1.05 + edgeN;
    float grown = 1.0 - smoothstep(front - 0.04, front, r);
    float lead = exp(-abs(r - front) * 22.0) * step(0.001, uSpread) * step(uSpread, 0.999);
    // Packets run outward along the grown traces.
    float packets = pow(max(0.0, sin(r * 28.0 - uClock * 7.0 + hash13(vec3(id, 9.1)) * 6.28)), 6.0);

    // --- bus routes to the jacked bodies ---
    float route = 0.0, routeHot = 0.0;
    for (int i = 0; i < 4; i++) {
      vec4 t = uTargets[i];
      if (t.z <= 0.0) continue;
      vec2 b = t.xy - uCentre;
      vec2 dirB = normalize(b + 1e-4);
      vec2 nB = vec2(-dirB.y, dirB.x);
      float along = clamp(dot(p, dirB) / max(length(b), 1e-3), 0.0, 1.0);
      float lane = 0.0;
      for (int k = -1; k <= 1; k++) {
        vec2 off = nB * float(k) * 0.16;
        lane = max(lane, 1.0 - smoothstep(0.025, 0.05, segDist(p, off, b + off)));
      }
      float flow = 0.5 + 0.5 * sin(along * 30.0 - uClock * 12.0);
      route = max(route, lane * t.z * (0.45 + 0.55 * flow));
      routeHot = max(routeHot, lane * t.w);
    }

    // --- EMP ring ---
    float ring = uRing >= 0.0 ? exp(-abs(r - uRing) * 24.0) * (1.0 - uRing) : 0.0;

    vec2 dm = dissolveMask(snoise01(vec3(p * 1.3, 4.1)) * 0.85 + r * 0.15, uDissolve, 0.06);
    float rim = 1.0 - smoothstep(0.86, 1.0, r - edgeN);

    float sig = (trace * grown * (0.35 + 0.9 * packets) + lead * 1.4) * uTraceGlow * uShaderIntensity
      + route * uRouteGlow + routeHot * 3.0 + ring * 3.0 + reticle;
    float heat = clamp(sig, 0.0, 1.2);
    vec3 col = sigRamp(0.25 + 0.6 * clamp(sig, 0.0, 1.0)) * sig * uGlow * uGlobalGlow;
    col += uCore * (dm.y * 2.0 + ring * 1.2) * uGlow;
    // Normal-blended: dark footprint (the deep stop) under emissive signal.
    float body = uDeepAlpha * rim * grown * (1.0 - 0.35 * r);
    float alpha = clamp(body + heat, 0.0, 1.0) * dm.x * uFade;
    vec3 base = uDeep * (0.6 + 0.4 * snoise01(vec3(p * 2.2, 0.5)));
    gl_FragColor = vec4(base * (1.0 - min(heat, 1.0)) + col, alpha);
  }
`;

export function createFieldMaterial() {
  const targets = [new Vector4(), new Vector4(), new Vector4(), new Vector4()];
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: sharedUniforms({
      ...ramp(),
      uCentre: { value: new Vector2() },
      uRadius: { value: 4.5 },
      uSpread: { value: 0 },
      uDeepAlpha: { value: 0.75 },
      uReticle: { value: 0 },
      uRing: { value: -1 },
      uCell: { value: 0.42 },
      uClock: { value: 0 },
      uFade: { value: 1 },
      uDissolve: { value: 0 },
      uGlow: { value: 1 },
      uTraceGlow: { value: 1.6 },
      uRouteGlow: { value: 2.4 },
      uReticleGlow: { value: 1.8 },
      uTargets: { value: targets },
    }),
    vertexShader: WORLD_VERTEX,
    fragmentShader: FIELD_FRAGMENT,
  });
  /** @param {object} s { x, z, radius, spread, reticle, ring, clock, fade, dissolve, targets: [{x,z,power,hot}] , count } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncRamp(u, c);
    u.uCentre.value.set(s.x, s.z);
    u.uRadius.value = s.radius;
    u.uSpread.value = s.spread;
    u.uDeepAlpha.value = c.deepOpacity * g.opacity;
    u.uReticle.value = s.reticle;
    u.uRing.value = s.ring;
    u.uCell.value = Math.max(0.08, c.traceCell / Math.max(0.2, g.noiseFrequency));
    u.uClock.value = s.clock;
    u.uFade.value = s.fade;
    u.uDissolve.value = s.dissolve;
    u.uGlow.value = g.glow;
    u.uTraceGlow.value = c.traceGlow;
    u.uRouteGlow.value = c.routeGlow;
    u.uReticleGlow.value = c.reticleGlow;
    for (let i = 0; i < 4; i++) {
      const t = s.targets[i];
      if (i < s.count) targets[i].set(t.x, t.z, t.power, t.hot);
      else targets[i].set(0, 0, 0, 0);
    }
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Possession: scan sheath and halo                                     */
/* -------------------------------------------------------------------- */

const SHEATH_FRAGMENT = /* glsl */ `
  uniform float uPower;
  uniform float uScan;      // sweep phase
  uniform float uHot;       // overload flare
  uniform float uGlow;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    float y = vUv.y;
    float lines = pow(abs(sin(y * 70.0)), 10.0);
    float sweep = exp(-abs(fract(1.0 - uScan) - y) * 14.0);
    float rim = fresnelTerm(vViewDir, vNormalW, 2.2, 1.0);
    float caps = smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.86, 1.0, y));
    float glitch = step(0.82, fract(sin(floor(y * 24.0) * 91.7 + floor(uScan * 9.0)) * 4375.85));
    float v = (lines * 0.18 * rim + sweep * 1.2 * (0.3 + rim) + rim * 0.35 + glitch * 0.15 * rim) * caps * uPower + uHot * caps * (0.4 + rim);
    vec3 col = sigRamp(0.35 + 0.5 * clamp(sweep + uHot, 0.0, 1.0)) * v * uGlow * uGlobalGlow;
    gl_FragColor = vec4(col, clamp(v, 0.0, 1.0));
  }
`;

export function createSheathMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({ ...ramp(), uPower: { value: 0 }, uScan: { value: 0 }, uHot: { value: 0 }, uGlow: { value: 1 } }),
    vertexShader: WORLD_VERTEX,
    fragmentShader: SHEATH_FRAGMENT,
  });
  /** @param {{power:number, scan:number, hot:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncRamp(u, c);
    u.uPower.value = s.power * g.opacity;
    u.uScan.value = s.scan;
    u.uHot.value = s.hot;
    u.uGlow.value = c.sheathGlow * g.glow;
  };
  return material;
}

const HALO_FRAGMENT = /* glsl */ `
  uniform float uPower;
  uniform float uSpin;
  uniform float uHot;
  uniform float uGlow;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    float a = atan(q.y, q.x) + uSpin;
    // Hexagonal ring: distance to a hexagon of circumradius .78.
    vec2 h = abs(q);
    float hex = max(h.x * 0.866 + h.y * 0.5, h.y);
    float ring = exp(-abs(hex - 0.72) * 40.0);
    float ticks = step(0.6, fract(a * 12.0 / 6.2831853)) * exp(-abs(r - 0.9) * 30.0);
    float inner = exp(-abs(r - 0.5) * 50.0) * step(0.3, fract(a * 3.0 / 6.2831853 - uSpin * 0.3));
    float v = (ring * 1.4 + ticks + inner * 0.8) * uPower * (1.0 + uHot * 2.0);
    vec3 col = sigRamp(0.45 + 0.5 * clamp(ring + uHot, 0.0, 1.0)) * v * uGlow * uGlobalGlow;
    gl_FragColor = vec4(col, clamp(v, 0.0, 1.0));
  }
`;

export function createHaloMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({ ...ramp(), uPower: { value: 0 }, uSpin: { value: 0 }, uHot: { value: 0 }, uGlow: { value: 1 } }),
    vertexShader: WORLD_VERTEX,
    fragmentShader: HALO_FRAGMENT,
  });
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncRamp(u, c);
    u.uPower.value = s.power * g.opacity;
    u.uSpin.value = s.spin;
    u.uHot.value = s.hot;
    u.uGlow.value = c.sheathGlow * 1.3 * g.glow;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Turncoat bolt                                                        */
/* -------------------------------------------------------------------- */

const BOLT_FRAGMENT = /* glsl */ `
  uniform float uPower;     // 1 → 0 over the bolt's life
  uniform float uTravel;    // 0..1 how far the head has run
  uniform float uClock;
  uniform float uGlow;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    float t = vUv.y;                      // 0 at the jacked body, 1 at the victim
    if (t > uTravel) discard;
    float nv = abs(dot(normalize(vViewDir), normalize(vNormalW)));
    float core = pow(nv, 3.0);
    float dash = 0.55 + 0.45 * step(0.5, fract(t * 14.0 - uClock * 9.0));
    float head = exp(-abs(t - uTravel) * 30.0) * 2.0;
    float v = (core * 1.4 + nv * 0.4) * dash * uPower + head * uPower;
    vec3 col = sigRamp(0.4 + 0.6 * clamp(core + head * 0.5, 0.0, 1.0)) * v * uGlow * uGlobalGlow;
    gl_FragColor = vec4(col, clamp(v, 0.0, 1.0));
  }
`;

export function createBoltMaterial() {
  const material = new ShaderMaterial({
    ...additive(),
    uniforms: sharedUniforms({ ...ramp(), uPower: { value: 0 }, uTravel: { value: 0 }, uClock: { value: 0 }, uGlow: { value: 1 } }),
    vertexShader: WORLD_VERTEX,
    fragmentShader: BOLT_FRAGMENT,
  });
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    syncRamp(u, c);
    u.uPower.value = s.power * g.opacity;
    u.uTravel.value = s.travel;
    u.uClock.value = s.clock;
    u.uGlow.value = c.boltGlow * g.glow;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Accent glow (lens eye, feed horn, plug collars)                      */
/* -------------------------------------------------------------------- */

const ACCENT_FRAGMENT = /* glsl */ `
  uniform float uPower;
  uniform float uGlow;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${commonGLSL}
  ${RAMP_GLSL}
  void main() {
    float nv = abs(dot(normalize(vViewDir), normalize(vNormalW)));
    vec3 col = mix(uBody, uCore, pow(nv, 4.0) * uPower) * (0.5 + uPower) * uGlow * uGlobalGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createAccentMaterial() {
  const material = new ShaderMaterial({
    uniforms: sharedUniforms({ ...ramp(), uPower: { value: 0 }, uGlow: { value: 1 } }),
    vertexShader: WORLD_VERTEX,
    fragmentShader: ACCENT_FRAGMENT,
    toneMapped: false,
  });
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    syncRamp(material.uniforms, c);
    material.uniforms.uPower.value = s.power;
    material.uniforms.uGlow.value = c.seamGlow * g.glow * s.fade;
  };
  return material;
}

/* -------------------------------------------------------------------- */
/* Lens (LAYER.DISTORTION)                                              */
/* -------------------------------------------------------------------- */

const LENS_FRAGMENT = /* glsl */ `
  uniform float uHum;
  uniform float uShock;
  uniform float uWave;
  uniform float uClock;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  ${noiseGLSL}
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    vec2 radial = q / max(r, 1e-3);
    float hum = exp(-r * 6.0);
    float ring = exp(-pow((r - uWave) / 0.08, 2.0));
    vec3 np = vec3(q * 6.0, uClock * 1.3);
    vec2 n = vec2(snoise(np), snoise(np + vec3(5.2, 1.3, 7.7)));
    vec2 dir = n * hum * uHum + (radial + n * 0.3) * ring * uShock;
    float mask = 1.0 - smoothstep(0.85, 1.0, r);
    float strength = uShaderIntensity * mask * clamp(hum * uHum + ring * uShock, 0.0, 1.0);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(clamp(dir, -1.0, 1.0) * 0.5 + 0.5, strength, mask);
  }
`;

/** Opaque proxy on purpose (see borrowed-tomorrow): keeps it in the warp pass. */
export function createLensMaterial() {
  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({ uHum: { value: 0 }, uShock: { value: 0 }, uWave: { value: 0 }, uClock: { value: 0 } }),
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: LENS_FRAGMENT,
  });
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHum.value = s.hum * c.lensHum * g.distortion;
    u.uShock.value = s.shock * c.lensStrength * g.distortion;
    u.uWave.value = s.wave;
    u.uClock.value = s.clock;
  };
  return material;
}
