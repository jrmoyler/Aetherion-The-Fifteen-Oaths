import { AdditiveBlending, Color, DoubleSide, FrontSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';

/**
 * Fulminant Relay — materials.
 *
 * Every factory returns a raw `ShaderMaterial` with a `userData.sync(c, state)`
 * that resolves the live settings block `c` (and `settings.global`) into its
 * uniforms. The ability calls it every frame, so a slider dragged mid-cast is
 * seen on the next frame. Emissive layers are additive and `toneMapped: false`
 * so their > 1 values reach the bloom pass.
 *
 *  - **seed core** — the charged node. Vertex stage spikes it along its normal
 *    with ridged noise (the charge straining to leave); fragment stage runs
 *    crawling filaments through it, a fresnel rim, and a noise dissolve with a
 *    burning edge for the exit.
 *  - **seed shell** — a looser sphere of crackle: voronoi cell *edges* on the
 *    sphere, re-rolled in steps so it stutters like a discharge, only visible
 *    at the silhouette.
 *  - **orbits** — a dash of light crawling round each broken ring.
 *  - **bolt** — the chain arcs (one material per arc, so each fades from its
 *    own strike time). Gaussian core / body / halo across the ribbon, a
 *    brightness crawl along it, and a white return-stroke flare on the frame
 *    it lands.
 *  - **corona** — breathing points round the seed.
 *  - **track** — the furrow: plasma that is revealed under the seed, then
 *    cools from blue-white through violet to a scorched line and fades.
 *  - **warp** — the distortion proxy (LAYER.DISTORTION): ionised air bent in
 *    crackling cells round the seed, punched by every hop.
 */

/* ---------------------------------------------------------------------- */
/* Seed: core + shell                                                      */
/* ---------------------------------------------------------------------- */

const SEED_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSpike;      // metres (× radius) of ridged spiking
  uniform float uSpikeScale;
  uniform float uSpikeSpeed;
  uniform float uSeed;

  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying float vSpike;

  ${noiseGLSL}

  void main() {
    vec3 p = position;
    // Ridged noise only ever pushes outward: charge strains to leave the node,
    // it never dents it.
    float r = ridged(normalize(p) * uSpikeScale + vec3(0.0, uTime * uSpikeSpeed, uSeed), 4);
    float spike = pow(clamp(r - 0.35, 0.0, 1.0), 2.0) * uSpike;
    p += normal * spike;
    vSpike = spike;
    vLocal = position;

    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SEED_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSeed;
  uniform float uRole;        // 0 core, 1 shell
  uniform float uGlow;
  uniform float uFresnel;
  uniform float uFilament;
  uniform float uFilamentScale;
  uniform float uCrawl;
  uniform float uFlicker;
  uniform float uDissolve;    // 0..1 exit
  uniform float uDissolveEdge;
  uniform float uFade;
  uniform float uCharge;      // 0..1 anticipation → full charge
  uniform float uPulse;       // decaying punch from each hop
  uniform vec3  uColorCore;
  uniform vec3  uColorBody;
  uniform vec3  uColorRim;
  uniform vec3  uColorDeep;   // the dark stop that carries the node's mass
  uniform float uDeep;        // 0..1 how much of the body is that deep
  uniform float uHaze;        // the shell's even glassy film (kept low: charge, not glass)
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying float vSpike;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    vec3 n = normalize(vLocal);
    float rim = fresnelTerm(vViewDir, vNormalW, max(uFresnel, 0.1), 1.0);

    // Stepped time: discharge re-rolls in jumps, it does not slide.
    float tick = floor(uTime * uFlicker);
    float stutter = 0.75 + 0.25 * hash11(tick + uSeed * 13.0);

    float alpha;
    vec3 color;
    if (uRole < 0.5) {
      // Filaments: the zero set of a moving noise field, sharpened.
      vec3 q = n * uFilamentScale + vec3(uTime * uCrawl, -uTime * uCrawl * 0.6, uSeed);
      float f = 1.0 - abs(snoise(q));
      f = pow(f, 10.0) * uFilament * uShaderIntensity;
      float hot = clamp(f + max(vSpike - 0.06, 0.0) * 1.5, 0.0, 1.0);
      // Four stops: a dark storm-node body (deep) lit violet toward the rim
      // (body → tint) and split by white-hot filaments (core). The node is
      // drawn opaque, so the deep stop is real mass on screen, not additive
      // black that vanishes — this is what keeps it from reading as ice.
      float lit = clamp(pow(rim, 1.4) * 1.2 + vSpike * 0.8, 0.0, 1.0);
      vec3 base = mix(uColorDeep, uColorBody, mix(1.0, lit, uDeep));
      color = base + uColorRim * pow(rim, 2.0) * 1.2;
      color = mix(color, uColorCore * (1.6 + uPulse * 1.5), hot);
      color *= (0.6 + 0.4 * uCharge + uPulse * 0.6) * stutter;
      alpha = 1.0;
    } else {
      // Crackle shell: the zero set of a noise field that re-rolls in steps,
      // sharpened into hairlines, visible at the silhouette only.
      vec3 q = n * uFilamentScale * 1.4 + vec3(tick * 0.37, tick * 0.11, uSeed + 5.0);
      float edge = pow(1.0 - abs(snoise(q)), 18.0);
      color = mix(uColorRim, uColorCore, edge) * (0.5 + uPulse);
      alpha = rim * (uHaze + edge * 1.1) * uCharge;
    }

    // Exit: noise dissolve with a burning lip.
    float dn = snoise01(n * 3.1 + uSeed);
    if (dn < uDissolve) discard;
    float lip = 1.0 - smoothstep(uDissolve, uDissolve + max(uDissolveEdge, 0.01), dn);
    color += uColorCore * lip * step(0.001, uDissolve) * 2.0;

    color *= uGlow * uGlobalGlow;
    alpha *= uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

/** @param {'core'|'shell'} role */
export function createSeedMaterial(role = 'core') {
  const core = role !== 'shell';
  const material = new ShaderMaterial({
    // The core is an opaque dark node with emissive veins; the shell is the
    // additive crackle round it.
    transparent: !core,
    depthWrite: core,
    blending: core ? NormalBlending : AdditiveBlending,
    side: role === 'shell' ? DoubleSide : FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: 0 },
      uRole: { value: role === 'shell' ? 1 : 0 },
      uSpike: { value: 0.2 },
      uSpikeScale: { value: 2.2 },
      uSpikeSpeed: { value: 1.6 },
      uGlow: { value: 1.3 },
      uFresnel: { value: 2 },
      uFilament: { value: 1 },
      uFilamentScale: { value: 2.4 },
      uCrawl: { value: 1.2 },
      uFlicker: { value: 14 },
      uDissolve: { value: 0 },
      uDissolveEdge: { value: 0.12 },
      uFade: { value: 1 },
      uCharge: { value: 1 },
      uPulse: { value: 0 },
      uColorCore: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorRim: { value: new Color() },
      uColorDeep: { value: new Color() },
      uDeep: { value: 0.85 },
      uHaze: { value: 0.05 }
    }),
    vertexShader: SEED_VERTEX,
    fragmentShader: SEED_FRAGMENT
  });

  /** @param {object} state { seed, charge, pulse, fade, dissolve, flicker } */
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    const shell = role === 'shell';
    u.uSeed.value = state.seed;
    u.uSpike.value = (shell ? 0.05 : c.seedSpike) * g.noiseStrength * (0.4 + 0.6 * state.charge + state.pulse);
    u.uSpikeScale.value = c.seedSpikeScale * g.noiseFrequency;
    u.uSpikeSpeed.value = c.seedSpikeSpeed * g.noiseSpeed;
    u.uGlow.value = (shell ? c.shellGlow : c.seedGlow) * g.glow;
    u.uFresnel.value = c.seedFresnel * g.fresnel;
    u.uFilament.value = c.seedFilament;
    u.uFilamentScale.value = c.seedFilamentScale * g.noiseFrequency;
    u.uCrawl.value = c.seedCrawl * g.noiseSpeed;
    u.uFlicker.value = state.flicker;
    u.uDissolve.value = state.dissolve;
    u.uDissolveEdge.value = c.seedDissolveEdge;
    u.uFade.value = state.fade * (shell ? c.shellOpacity : 1) * g.opacity;
    u.uCharge.value = state.charge;
    u.uPulse.value = state.pulse;
    u.uColorCore.value.copy(getColor(c.colorSeedCore));
    u.uColorBody.value.copy(getColor(c.colorSeedBody));
    u.uColorRim.value.copy(getColor(c.colorSeedRim));
    u.uColorDeep.value.copy(getColor(c.colorSeedDeep ?? '#0a0724'));
    u.uDeep.value = c.seedDeep ?? 0.85;
    u.uHaze.value = c.shellHaze ?? 0.05;
  };
  return material;
}

/* ---------------------------------------------------------------------- */
/* Orbits                                                                  */
/* ---------------------------------------------------------------------- */

const ORBIT_VERTEX = /* glsl */ `
  attribute float aAlong;
  attribute float aAcross;
  varying float vAlong;
  varying float vAcross;
  void main() {
    vAlong = aAlong;
    vAcross = aAcross;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ORBIT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uDash;
  uniform float uDashSpeed;
  uniform float uGlow;
  uniform float uFade;
  uniform vec3  uColor;
  uniform vec3  uColorHot;
  uniform float uGlobalGlow;
  varying float vAlong;
  varying float vAcross;
  void main() {
    float across = 1.0 - vAcross * vAcross;
    // Light crawling round the ring in short dashes, brightest at the head.
    float head = fract(vAlong * uDash - uTime * uDashSpeed);
    float dash = pow(head, 6.0);
    vec3 color = mix(uColor, uColorHot, dash) * (0.4 + dash * 2.2);
    float alpha = across * (0.25 + dash) * uFade;
    gl_FragColor = vec4(color * uGlow * uGlobalGlow, alpha);
  }
`;

export function createOrbitMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uDash: { value: 3 },
      uDashSpeed: { value: 1.5 },
      uGlow: { value: 1 },
      uFade: { value: 1 },
      uColor: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: ORBIT_VERTEX,
    fragmentShader: ORBIT_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uDash.value = c.orbitDashes;
    u.uDashSpeed.value = c.orbitDashSpeed * g.animationSpeed;
    u.uGlow.value = c.orbitGlow * g.glow;
    u.uFade.value = state.fade * c.orbitOpacity * g.opacity;
    u.uColor.value.copy(getColor(c.colorSeedRim));
    u.uColorHot.value.copy(getColor(c.colorArcCore));
  };
  return material;
}

/* ---------------------------------------------------------------------- */
/* Bolt (one per arc)                                                      */
/* ---------------------------------------------------------------------- */

const BOLT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BOLT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uFade;       // per-arc decay since its own strike
  uniform float uStrike;     // 1 → 0 over the return stroke
  uniform float uSeed;
  uniform float uCore;
  uniform float uGlow;
  uniform float uCrawl;
  uniform vec3  uColorCore;
  uniform vec3  uColorBody;
  uniform vec3  uColorHalo;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    float x = (vUv.y - 0.5) * 2.0;
    float s = vUv.x;
    float core = exp(-x * x / max(uCore * uCore, 1e-4));
    float body = exp(-x * x * 4.0);
    float halo = (1.0 - x * x) * 0.3;
    // Brightness crawls down the bolt in beads, the way a real channel does.
    float crawl = 0.7 + 0.3 * sin(s * 37.0 - uTime * uCrawl + uSeed * 7.0)
                      * sin(s * 11.0 + uTime * uCrawl * 0.6);
    float grain = 0.85 + 0.3 * snoise(vec3(s * 18.0, uTime * 6.0, uSeed));
    float ends = sin(s * 3.14159265);
    vec3 color = uColorCore * core * (1.6 + uStrike * 3.0) + uColorBody * body + uColorHalo * halo;
    float k = crawl * grain * uGlow * uGlobalGlow * mix(1.0, uShaderIntensity, 0.5);
    float alpha = clamp((core + body * 0.7 + halo) * ends, 0.0, 1.0) * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * k, alpha);
  }
`;

export function createBoltMaterial(seed = 0) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uStrike: { value: 0 },
      uSeed: { value: seed },
      uCore: { value: 0.3 },
      uGlow: { value: 1.6 },
      uCrawl: { value: 30 },
      uColorCore: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorHalo: { value: new Color() }
    }),
    vertexShader: BOLT_VERTEX,
    fragmentShader: BOLT_FRAGMENT
  });
  /** `uFade` and `uStrike` are written by the ability per arc; this is the look. */
  material.userData.sync = (c) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uCore.value = c.arcCore;
    u.uGlow.value = c.arcGlow * g.glow;
    u.uCrawl.value = c.arcCrawl * g.animationSpeed;
    u.uColorCore.value.copy(getColor(c.colorArcCore));
    u.uColorBody.value.copy(getColor(c.colorArcBody));
    u.uColorHalo.value.copy(getColor(c.colorArcHalo));
  };
  return material;
}

/* ---------------------------------------------------------------------- */
/* Corona points                                                           */
/* ---------------------------------------------------------------------- */

const CORONA_VERTEX = /* glsl */ `
  attribute float seed;
  uniform float uTime;
  uniform float uBreath;     // radii the shell breathes out to
  uniform float uRate;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vA;
  varying float vSeed;
  void main() {
    float p = fract(seed + uTime * uRate);
    vec3 q = position * (1.0 + p * uBreath);
    vA = (1.0 - p) * smoothstep(0.0, 0.12, p);
    vSeed = seed;
    vec4 mv = modelViewMatrix * vec4(q, 1.0);
    gl_PointSize = clamp(uSize * uPixelRatio * 30.0 / -mv.z, 1.0, 9.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const CORONA_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uFade;
  uniform float uGlow;
  uniform vec3  uColor;
  uniform vec3  uColorHot;
  uniform float uGlobalGlow;
  varying float vA;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float spot = 1.0 - smoothstep(0.15, 1.0, d);
    vec3 color = mix(uColor, uColorHot, step(0.8, vSeed)) * uGlow * uGlobalGlow;
    float alpha = spot * vA * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createCoronaMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uBreath: { value: 2 },
      uRate: { value: 0.6 },
      uSize: { value: 0.66 },
      uPixelRatio: { value: 1 },
      uFade: { value: 1 },
      uGlow: { value: 1 },
      uColor: { value: new Color() },
      uColorHot: { value: new Color() }
    }),
    vertexShader: CORONA_VERTEX,
    fragmentShader: CORONA_FRAGMENT
  });
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uBreath.value = c.coronaBreath;
    u.uRate.value = c.coronaRate * g.particleSpeed;
    u.uSize.value = c.coronaSize * g.particleSize;
    // Device pixel ratio, read once per cast by the ability (see onSpawn), so
    // the motes keep their intended size on high-DPI screens.
    u.uPixelRatio.value = state.pixelRatio ?? 1;
    u.uFade.value = state.fade * c.coronaOpacity * g.opacity;
    u.uGlow.value = c.coronaGlow * g.glow;
    u.uColor.value.copy(getColor(c.colorSeedRim));
    u.uColorHot.value.copy(getColor(c.colorArcCore));
  };
  return material;
}

/* ---------------------------------------------------------------------- */
/* Track — the ionised furrow                                              */
/* ---------------------------------------------------------------------- */

const TRACK_VERTEX = /* glsl */ `
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform vec3  uSide;
  uniform float uLength;
  uniform float uWidth;
  varying vec2  vP;          // x metres along, y −1..1 across
  varying float vViewZ;
  void main() {
    float along = position.x * uLength;
    vec3 world = uOrigin + uDir * along + uSide * position.z * uWidth;
    world.y = 0.025;
    vP = vec2(along, position.z);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const TRACK_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uReveal;     // metres the seed has scored so far
  uniform float uAge;        // seconds since the seed passed (per cast)
  uniform float uCool;       // seconds to cool from plasma to scorch
  uniform float uPace;       // seconds per metre the seed took
  uniform float uFade;
  uniform float uGlow;
  uniform float uJag;
  uniform vec3  uColorHot;
  uniform vec3  uColorWarm;
  uniform vec3  uColorScorch;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2  vP;
  varying float vViewZ;

  ${noiseGLSL}

  void main() {
    if (vP.x > uReveal) discard;
    // The channel wanders: its centreline is noise, its width breathes.
    float centre = snoise(vec3(vP.x * 0.55, uSeed, 0.0)) * uJag;
    float x = abs(vP.y - centre);
    float width = 0.25 + 0.15 * snoise(vec3(vP.x * 1.7, uSeed + 3.0, 0.0));
    float channel = 1.0 - smoothstep(width * 0.3, width, x);
    float fringe = (1.0 - smoothstep(width, width * 2.6, x)) * 0.35;

    // Each metre cools from the moment the seed passed over it.
    float since = max(0.0, uAge + (uReveal - vP.x) * uPace);
    float heat = exp(-since / max(uCool, 0.05));
    float crackle = ridged(vec3(vP.x * 2.4, vP.y * 3.0, uTime * 2.0 + uSeed), 4);
    vec3 color = mix(uColorScorch, uColorWarm, smoothstep(0.05, 0.5, heat));
    color = mix(color, uColorHot, smoothstep(0.55, 1.0, heat * (0.6 + crackle * 0.6)));
    float glow = mix(0.6, uGlow * uGlobalGlow, heat);

    // The leading metre burns brightest: the seed is right above it.
    float lead = exp(-(uReveal - vP.x) * 2.5);
    color += uColorHot * lead * 1.5 * uShaderIntensity;

    float edgeIn = smoothstep(0.0, 0.6, vP.x);
    float alpha = (channel + fringe * heat) * edgeIn * uFade * (0.35 + 0.65 * heat);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * glow, clamp(alpha, 0.0, 1.0));
  }
`;

export function createTrackMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: sharedUniforms({
      uOrigin: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uSide: { value: new Vector3(1, 0, 0) },
      uLength: { value: 1 },
      uWidth: { value: 0.5 },
      uSeed: { value: 0 },
      uReveal: { value: 0 },
      uAge: { value: 0 },
      uCool: { value: 0.6 },
      uPace: { value: 0.05 },
      uFade: { value: 1 },
      uGlow: { value: 2 },
      uJag: { value: 0.3 },
      uColorHot: { value: new Color() },
      uColorWarm: { value: new Color() },
      uColorScorch: { value: new Color() }
    }),
    vertexShader: TRACK_VERTEX,
    fragmentShader: TRACK_FRAGMENT
  });
  /** @param {object} state { origin, dir, side, length, reveal, age, fade, seed } */
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uOrigin.value.copy(state.origin);
    u.uDir.value.copy(state.dir);
    u.uSide.value.copy(state.side);
    u.uLength.value = state.length;
    u.uReveal.value = state.reveal;
    u.uAge.value = state.age;
    u.uPace.value = state.pace;
    u.uSeed.value = state.seed;
    u.uWidth.value = c.trackWidth;
    u.uCool.value = c.trackCool;
    u.uGlow.value = c.trackGlow * g.glow;
    u.uJag.value = c.trackJag * g.noiseStrength;
    u.uFade.value = state.fade * c.trackOpacity * g.opacity;
    u.uColorHot.value.copy(getColor(c.colorTrackHot));
    u.uColorWarm.value.copy(getColor(c.colorTrackWarm));
    u.uColorScorch.value.copy(getColor(c.colorTrackScorch));
  };
  return material;
}

/* ---------------------------------------------------------------------- */
/* Warp — LAYER.DISTORTION                                                 */
/* ---------------------------------------------------------------------- */

const WARP_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Billboard about the quad's centre, sized in metres.
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2 vUv;

  ${noiseGLSL}

  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float r = length(c);
    // Crackling cells: the warp jumps between voronoi cells in steps, so the
    // air reads as torn by discharge rather than rippling with heat.
    float tick = floor(uTime * uSpeed * 8.0);
    vec2 cell = voronoi2(c * uScale * 3.0 + vec2(tick * 0.71, tick * 0.29) + uSeed);
    vec2 n = vec2(snoise(vec3(c * uScale, tick * 0.13 + uSeed)), snoise(vec3(c * uScale + 9.1, tick * 0.17)));
    vec2 radial = normalize(c + 1e-4);
    vec2 offset = normalize(n * 0.8 + radial * (0.6 - cell.x) + 1e-4);
    float mask = (1.0 - smoothstep(0.3, 1.0, r)) * smoothstep(0.0, 0.15, r);
    float strength = uStrength * uShaderIntensity * mask * (0.6 + 0.4 * cell.y);
    if (strength < 0.002) discard;
    gl_FragColor = vec4(offset * 0.5 + 0.5, strength, mask);
  }
`;

export function createRelayWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 2 },
      uStrength: { value: 0.5 },
      uScale: { value: 1.6 },
      uSpeed: { value: 1 },
      uSeed: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });
  /** @param {object} state { size, strength, seed } */
  material.userData.sync = (c, state) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uSize.value = state.size;
    u.uStrength.value = state.strength * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
    u.uSeed.value = state.seed;
  };
  return material;
}

/* ---------------------------------------------------------------------- */
/* Charge blast — the detonation and hop bursts                            */
/* ---------------------------------------------------------------------- */

const BLAST_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uAge;        // 0..1 over the blast's life
  uniform float uBillow;     // displacement, × radius
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vDir;
  varying float vHeat;
  ${noiseGLSL}
  void main() {
    vec3 n = normalize(position);
    float b = fbm3(n * 2.6 + vec3(uSeed, uTime * 0.8, -uSeed));
    vHeat = b;
    vDir = n;
    vec3 p = n * (1.0 + (b - 0.5) * 2.0 * uBillow * (0.6 + uAge));
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * n);
    vViewDir = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BLAST_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  uniform float uAge;
  uniform float uOpacity;
  uniform float uFilament;
  uniform float uGlow;
  uniform vec3  uColorCore;
  uniform vec3  uColorBody;
  uniform vec3  uColorDeep;
  uniform float uGlobalGlow;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vDir;
  varying float vHeat;
  ${noiseGLSL}
  ${commonGLSL}
  void main() {
    float facing = clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0);
    // A dark charged mass, violet where it billows toward the eye, near-black
    // in its folds — not a shell: it is most opaque face-on, softest at the rim.
    vec3 color = mix(uColorDeep, uColorBody, smoothstep(0.35, 0.8, vHeat) * (0.4 + 0.6 * facing));
    // White filaments skating over it, re-rolled as it grows.
    float fil = ridged(vDir * (4.0 + uAge * 5.0) + vec3(uSeed * 7.0, uTime * 3.0, 0.0), 4);
    float arcs = smoothstep(0.82, 0.97, fil) * (1.0 - uAge * 0.7) * uFilament;
    color = mix(color, uColorCore * (1.5 + 1.5 * (1.0 - uAge)) * uGlow * uGlobalGlow, arcs);
    // Tears apart from the folds outward as it ages.
    float tear = snoise01(vDir * 3.3 + uSeed);
    if (tear < uAge * 1.05 - 0.05) discard;
    float alpha = uOpacity * (0.25 + 0.75 * facing) * (1.0 - uAge * uAge);
    alpha = max(alpha, arcs * (1.0 - uAge));
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

/** The relay's charge blast: a dark violet mass with white filaments. */
export function createBlastMaterial(seed = 0) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: FrontSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSeed: { value: seed },
      uAge: { value: 0 },
      uBillow: { value: 0.25 },
      uOpacity: { value: 0.85 },
      uFilament: { value: 1 },
      uGlow: { value: 1.5 },
      uColorCore: { value: new Color() },
      uColorBody: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: BLAST_VERTEX,
    fragmentShader: BLAST_FRAGMENT
  });
  material.userData.sync = (c, age) => {
    const g = settings.global;
    const u = material.uniforms;
    u.uAge.value = age;
    u.uBillow.value = c.blastBillow * g.noiseStrength;
    u.uOpacity.value = c.blastOpacity * g.opacity;
    u.uFilament.value = c.blastFilament;
    u.uGlow.value = c.blastGlow * g.glow;
    u.uColorCore.value.copy(getColor(c.colorSeedCore));
    u.uColorBody.value.copy(getColor(c.colorBlastBody));
    u.uColorDeep.value.copy(getColor(c.colorSeedDeep));
  };
  return material;
}

/* ---------------------------------------------------------------------- */
/* Under-stroke — the dark bed a standing bolt's white core sits on        */
/* ---------------------------------------------------------------------- */

const UNDER_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uFade;
  uniform vec3  uColorDeep;
  uniform vec3  uColorBody;
  varying vec2 vUv;
  void main() {
    float x = (vUv.y - 0.5) * 2.0;
    float ends = sin(vUv.x * 3.14159265);
    float bed = exp(-x * x * 2.2);
    vec3 color = mix(uColorDeep, uColorBody, exp(-x * x * 9.0) * 0.6);
    float alpha = bed * ends * uFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export function createBoltUnderMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: {
      uFade: { value: 1 },
      uColorDeep: { value: new Color() },
      uColorBody: { value: new Color() }
    },
    vertexShader: BOLT_VERTEX,
    fragmentShader: UNDER_FRAGMENT
  });
  material.userData.sync = (c, fade) => {
    const u = material.uniforms;
    u.uFade.value = fade * c.underOpacity * settings.global.opacity;
    u.uColorDeep.value.copy(getColor(c.colorSeedDeep));
    u.uColorBody.value.copy(getColor(c.colorArcHalo));
  };
  return material;
}
