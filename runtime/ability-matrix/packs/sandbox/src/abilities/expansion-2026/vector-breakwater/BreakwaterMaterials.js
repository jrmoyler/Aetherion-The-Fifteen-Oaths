import { AdditiveBlending, Color, DoubleSide, AddEquation, CustomBlending, NormalBlending, OneMinusSrcAlphaFactor, SrcAlphaFactor, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import config from './config.js';

/**
 * Vector Breakwater — every material the cast draws with.
 *
 * Each factory returns a `ShaderMaterial` with hand-written GLSL and a
 * `userData.sync(state)` that reads `settings.vectorBreakwater` and the
 * globals into uniforms every frame. Per-front materials are separate
 * instances so each front can tear apart on its own schedule.
 *
 * Colour: one four-stop ramp on the force hue — `coreColor` (white-hot, the
 * crest line and burning edges only) → `edgeColor` (pale amber rims) →
 * `bodyColor` (saturated orange, the pressure cells) → `deepColor` (dark
 * umber that carries the sheet and the scoured floor). The front and the
 * corridor are normal-blended so the deep stop really darkens what is
 * behind and under them: a dense wall, not a jelly.
 *
 *  - **front** — the shield sheet. Voronoi pressure cells drifting up it,
 *    slash lines racing across, a hot leading rim, bright tapered sides and a
 *    fresnel edge; near the end of the lane a noise dissolve (`dissolveMask`)
 *    tears it apart from the crest with a burning edge — the front breaks
 *    rather than vanishing.
 *  - **rib** — the internal splines, with pulses climbing them.
 *  - **fin** — instanced pressure fins; tip-hot, alpha by instance scale.
 *  - **contact** — the pressure petals at a struck body, noise-streaked.
 *  - **wake** — the breaking crest at the end of the lane, foam-noise broken.
 *  - **corridor** — the ground: scour gouges, a fresh hot band just behind
 *    each front (their positions arrive as one `vec3`), edge lines.
 *  - **brace** — three chevrons at the caster, each flared as its front leaves.
 *  - **warp** — a vertical sheet on `LAYER.DISTORTION` riding each front.
 */

const ID = config.id;

/* ==================================================================== */
/* The shield front                                                       */
/* ==================================================================== */

const FRONT_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uShimmer;
  uniform float uSpent;
  uniform float uSeed;
  uniform float uNoiseStrength;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vView;

  ${noiseGLSL}

  void main() {
    vUv = uv;
    vec3 p = position;
    // The sheet quivers: a travelling ripple plus a slow noise bowing,
    // both strongest at the crest so the foot stays planted.
    p.z += sin(uv.x * 19.0 + uShimmer) * 0.008 * uv.y;
    p.z += snoise(vec3(uv * vec2(3.0, 2.0), uTime * 1.5 + uSeed)) * 0.025 * uv.y * uNoiseStrength;
    // As it breaks, the crest curls forward over the foot.
    p.z += uSpent * uSpent * 0.3 * uv.y * uv.y;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRONT_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uShimmer;
  uniform float uFade;
  uniform float uSpent;
  uniform float uSeed;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uNoise;
  uniform float uNoiseScale;
  uniform float uRim;
  uniform float uFresnel;
  uniform vec3  uEdge;
  uniform vec3  uBody;
  uniform vec3  uCore;
  uniform vec3  uDeep;
  uniform float uDensity;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vView;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float side = pow(abs(vUv.x * 2.0 - 1.0), 5.0);
    // A hard crest: a thin white-hot line over a pale band, cut sharp on top.
    float crestLine = smoothstep(0.035, 0.0, abs(vUv.y - 0.94)) * uRim;
    float crestBand = smoothstep(0.78, 0.92, vUv.y) * (1.0 - smoothstep(0.95, 0.985, vUv.y)) * uRim;
    float foot = smoothstep(0.06, 0.0, vUv.y);
    float slash = pow(max(0.0, cos(vUv.x * 33.0 - vUv.y * 17.0 - uShimmer)), 16.0);
    // Pressure cells drift up the sheet: saturated where cells meet.
    vec2 vor = voronoi2(vec2(vUv.x * uNoiseScale * 4.0, vUv.y * uNoiseScale * 1.6 - uTime * 0.8 + uSeed));
    float cells = smoothstep(0.35, 0.8, vor.x) * (0.6 + 0.4 * vor.y) * uNoise * uShaderIntensity;
    float fres = fresnelTerm(vView, vNormalW, 2.0, uFresnel);
    float ends = smoothstep(0.0, 0.03, vUv.y) * (1.0 - smoothstep(0.975, 1.0, vUv.y));

    // The break: noise dissolve from the crest down, with a burning edge.
    float tear = snoise01(vec3(vUv * vec2(6.0, 3.0), uSeed + uTime * 0.6)) * 0.75 + (1.0 - vUv.y) * 0.25;
    vec2 cut = dissolveMask(tear, uSpent * 1.05, 0.08);
    if (cut.x < 0.5 && cut.y < 0.01) discard;

    // Ramp index: 1 deep (the body of the wall) → 0 core (crest, burn edge).
    float lift = clamp(cells * 0.38 + slash * 0.3 + fres * 0.25 + side * 0.7 + crestBand * 0.6 + foot * 0.4, 0.0, 1.0);
    float t = 1.0 - lift * 0.72;
    t = mix(t, 0.0, clamp(crestLine + cut.y * 1.5, 0.0, 1.0));
    vec3 color = gradient4(uCore, uEdge, uBody, uDeep, t);
    color *= uGlow;
    color += uCore * (crestLine * 1.6 + cut.y * 2.0); // HDR only in the core
    float alpha = (uDensity + cells * 0.25 + side * 0.4 + crestBand * 0.5 + crestLine + fres * 0.2 + foot * 0.3)
                * ends * uFade * uOpacity * max(cut.x, cut.y);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

export function createFrontMaterial(seed = 0) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uShimmer: { value: 0 },
      uFade: { value: 1 },
      uSpent: { value: 0 },
      uSeed: { value: seed },
      uNoiseStrength: { value: 1 },
      uGlow: { value: 2 },
      uOpacity: { value: 1 },
      uNoise: { value: 0.6 },
      uNoiseScale: { value: 3 },
      uRim: { value: 0.8 },
      uFresnel: { value: 1 },
      uEdge: { value: new Color('#ffc27a') },
      uBody: { value: new Color('#e2571c') },
      uCore: { value: new Color('#fff3df') },
      uDeep: { value: new Color('#2b0d06') },
      uDensity: { value: 0.55 },
    }),
    vertexShader: FRONT_VERTEX,
    fragmentShader: FRONT_FRAGMENT,
  });
  /** @param {{fade:number, spent:number, shimmer:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uShimmer.value = s.shimmer;
    u.uFade.value = s.fade;
    u.uSpent.value = s.spent;
    u.uNoiseStrength.value = g.noiseStrength;
    u.uGlow.value = c.frontGlow * g.glow;
    u.uOpacity.value = c.frontOpacity * g.opacity;
    u.uNoise.value = c.frontNoise * g.noiseStrength;
    u.uNoiseScale.value = c.frontNoiseScale * g.noiseFrequency;
    u.uRim.value = c.frontRim;
    u.uFresnel.value = g.fresnel;
    u.uEdge.value.copy(getColor(c.edgeColor));
    u.uBody.value.copy(getColor(c.bodyColor));
    u.uCore.value.copy(getColor(c.coreColor));
    u.uDeep.value.copy(getColor(c.deepColor));
    u.uDensity.value = c.frontDensity;
  };
  return material;
}

/* ==================================================================== */
/* Ribs and fins                                                          */
/* ==================================================================== */

const RIB_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIB_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uFade;
  uniform float uGlow;
  uniform float uOpacity;
  uniform vec3  uColor;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  void main() {
    // A pulse climbs each spline as the front drives forward.
    float pulse = pow(0.5 + 0.5 * sin(vUv.y * 18.0 - uTime * 14.0), 6.0);
    float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float alpha = (0.55 + 0.45 * pulse) * (0.5 + 0.5 * across) * uFade * uOpacity;
    gl_FragColor = vec4(uColor * uGlow * uGlobalGlow * (0.8 + pulse), alpha);
  }
`;

export function createRibMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uGlow: { value: 1.4 },
      uOpacity: { value: 0.7 },
      uColor: { value: new Color('#ffe8cf') },
    }),
    vertexShader: RIB_VERTEX,
    fragmentShader: RIB_FRAGMENT,
  });
  /** @param {{fade:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = s.fade;
    u.uGlow.value = c.ribGlow * g.glow;
    u.uOpacity.value = c.ribOpacity * g.opacity;
    u.uColor.value.copy(getColor(c.edgeColor));
  };
  return material;
}

const FIN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 world = modelMatrix * local;
    vNormalW = normalize(mat3(modelMatrix) * n);
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FIN_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uFade;
  uniform float uGlow;
  uniform vec3  uColor;
  uniform vec3  uBody;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vView;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vView))), 1.5);
    float tip = vUv.y;
    vec3 color = mix(uBody, uColor, tip * 0.7 + f * 0.3) * uGlow * uGlobalGlow * (0.7 + tip);
    gl_FragColor = vec4(color, (0.35 + 0.65 * f) * uFade);
  }
`;

export function createFinMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uGlow: { value: 1.6 },
      uColor: { value: new Color('#fff0dd') },
      uBody: { value: new Color('#d16f56') },
    }),
    vertexShader: FIN_VERTEX,
    fragmentShader: FIN_FRAGMENT,
  });
  /** @param {{fade:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.finGlow * g.glow;
    u.uColor.value.copy(getColor(c.edgeColor));
    u.uBody.value.copy(getColor(c.bodyColor));
  };
  return material;
}

/* ==================================================================== */
/* Contact petals and wake crest                                          */
/* ==================================================================== */

const FLAT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CONTACT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3  color;
  uniform float fade;
  uniform float uGlow;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    float tip = 1.0 - vUv.x;
    // Streaks run root → tip, so the petals read as thrown, not printed.
    float streak = snoise01(vec3(vWorld.xz * 7.0, uTime * 4.0));
    float alpha = (0.25 + 0.75 * tip) * (0.6 + 0.6 * streak) * fade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * uGlow * uGlobalGlow * (0.8 + tip), alpha);
  }
`;

/** Uniform names `color` / `fade` are kept from the candidate's contact cue. */
export function createContactMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      color: { value: new Color('#fff0dd') },
      fade: { value: 0 },
      uGlow: { value: 1.6 },
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: CONTACT_FRAGMENT,
  });
  /** @param {{fade:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.color.value.copy(getColor(c.edgeColor));
    u.fade.value = s.fade * g.opacity;
    u.uGlow.value = 1.6 * g.glow;
  };
  return material;
}

const WAKE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uFade;
  uniform float uSeed;
  uniform float uGlow;
  uniform vec3  uColor;
  uniform vec3  uBody;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    // Brightest on the standing crest (uv.y 0.6), feathered both sides.
    float crest = exp(-pow((vUv.y - 0.6) * 4.0, 2.0));
    // Foam: the crest breaks into ridged noise round its length.
    float foam = ridged(vec3(vUv.x * 24.0, vUv.y * 3.0, uTime * 1.5 + uSeed), 3);
    float alpha = crest * (0.4 + 0.8 * foam) * uFade;
    if (alpha < 0.003) discard;
    vec3 color = mix(uBody, uColor, crest) * uGlow * uGlobalGlow;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createWakeMaterial(seed = 0) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFade: { value: 0 },
      uSeed: { value: seed },
      uGlow: { value: 1.6 },
      uColor: { value: new Color('#ffe8cf') },
      uBody: { value: new Color('#d16f56') },
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: WAKE_FRAGMENT,
  });
  /** @param {{fade:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = s.fade * c.wakeOpacity * g.opacity;
    u.uGlow.value = 1.6 * g.glow;
    u.uColor.value.copy(getColor(c.edgeColor));
    u.uBody.value.copy(getColor(c.bodyColor));
  };
  return material;
}

/* ==================================================================== */
/* Corridor scour                                                         */
/* ==================================================================== */

const CORRIDOR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uFade;        // 1 → 0 over the linger: the scour crumbles away
  uniform float uCool;        // 0 fresh → 1 cooled (seconds after the last break)
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uLength;      // metres
  uniform float uWidth;       // corridor half-width, metres
  uniform float uScour;       // fresh-scour length behind a front, × width
  uniform vec3  uFronts;      // each front's distance along the lane, metres (−1: not launched)
  uniform vec3  uCore;
  uniform vec3  uEdge;
  uniform vec3  uColor;
  uniform vec3  uDeep;
  uniform float uNoise;
  uniform float uDeepWeight;
  uniform float uSeams;
  uniform float uAfter;       // aftershock ripples rolling down the lane
  uniform float uAfterSpeed;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}
  ${commonGLSL}

  /** Fresh band just behind one front; nothing ahead of it. */
  float fresh(float along, float front) {
    // Not launched, or already broken at the end: no fresh band left standing.
    if (front < 0.0 || front >= uLength - 0.01) return 0.0;
    float behind = front - along;
    float reach = max(uScour * uWidth, 0.05);
    return step(0.0, behind) * exp(-behind / reach);
  }

  void main() {
    float along = vUv.y * uLength;
    float x = (vUv.x * 2.0 - 1.0) * uWidth;          // metres across
    float across = abs(vUv.x * 2.0 - 1.0);
    // Only ground the fronts have actually passed is scoured.
    float reached = max(max(uFronts.x, uFronts.y), uFronts.z);
    float passed = smoothstep(0.0, 0.25, reached - along);

    // A ragged, noise-broken edge (no ruled lines): the scour bites into the
    // floor unevenly, deeper near the middle of the lane.
    float ragged = snoise01(vec3(along * 0.9, x * 0.6, 3.1)) * 0.22 + snoise01(vec3(along * 3.1, x * 2.0, 7.7)) * 0.08;
    float inside = 1.0 - smoothstep(0.72 - ragged, 1.0 - ragged * 0.4, across);

    // Pressure seams dragged along the lane: stretched cells, saturated.
    vec2 cell = voronoi2(vec2(x * 1.6, along * 0.45));
    float seam = smoothstep(0.62, 0.78, cell.x);
    float gouge = smoothstep(0.78, 0.98, ridged(vec3(x * 2.4, along * 0.35, 1.7), 3));
    float seams = clamp(seam * 0.6 + gouge * 0.7, 0.0, 1.0) * uSeams * uNoise * uShaderIntensity;

    // Aftershocks: chevron pressure fronts (the brace's shape) keep rolling
    // down the lane after the fronts have gone, so the linger moves.
    float roll = along - abs(x) * 0.55 - uTime * uAfterSpeed + snoise(vec3(x * 0.5, along * 0.2, uTime * 0.3)) * 0.35;
    float after = pow(max(0.0, cos(roll * 1.3)), 10.0) * uAfter;

    float hot = fresh(along, uFronts.x) + fresh(along, uFronts.y) + fresh(along, uFronts.z);
    float ember = mix(1.0, 0.55, uCool) * (0.7 + 0.3 * snoise01(vec3(x * 3.0, along * 3.0, uTime * 2.0)));

    // Crumble away through a noise threshold as the linger ends.
    vec2 dm = dissolveMask(snoise01(vec3(x * 0.9, along * 0.7, 5.3)) * 0.8 + across * 0.2, 1.0 - uFade, 0.08);
    if (dm.x < 0.5 && dm.y < 0.01) discard;

    // Ramp index: deep scorched ground, saturated seams, pale fresh band,
    // white-hot only right behind a front.
    float lift = clamp(seams * ember * 0.55 + after * 0.55 + hot * 0.6, 0.0, 1.0);
    vec3 col = gradient4(uCore, uEdge, uColor, uDeep, 1.0 - lift * 0.7) * uGlow;
    col += uColor * dm.y * 1.2;
    // The scour starts past the caster's feet, feathered in.
    float start = smoothstep(0.2, 1.4, along);
    float alpha = (uDeepWeight * 0.62 + seams * ember * 0.25 + after * 0.3 + hot * 0.35) * passed * inside * start * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col * uGlobalGlow, clamp(alpha, 0.0, 1.0));
  }
`;

export function createCorridorMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uFade: { value: 1 },
      uCool: { value: 0 },
      uGlow: { value: 1.5 },
      uOpacity: { value: 1 },
      uLength: { value: 10 },
      uWidth: { value: 2.2 },
      uScour: { value: 0.45 },
      uFronts: { value: new Vector3(-1, -1, -1) },
      uCore: { value: new Color('#fff3df') },
      uEdge: { value: new Color('#ffc27a') },
      uColor: { value: new Color('#e2571c') },
      uDeep: { value: new Color('#2b0d06') },
      uNoise: { value: 1 },
      uDeepWeight: { value: 1 },
      uSeams: { value: 1 },
      uAfter: { value: 1 },
      uAfterSpeed: { value: 3 },
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: CORRIDOR_FRAGMENT,
  });
  /** @param {{fade:number, cool:number, length:number, f0:number, f1:number, f2:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uFade.value = s.fade;
    u.uCool.value = s.cool;
    u.uGlow.value = c.groundGlow * g.glow;
    u.uOpacity.value = c.groundOpacity * g.opacity;
    u.uLength.value = s.length;
    u.uWidth.value = c.width;
    u.uScour.value = c.scourWidth;
    u.uFronts.value.set(s.f0, s.f1, s.f2);
    u.uCore.value.copy(getColor(c.coreColor));
    u.uEdge.value.copy(getColor(c.edgeColor));
    u.uColor.value.copy(getColor(c.groundColor));
    u.uDeep.value.copy(getColor(c.deepColor));
    u.uNoise.value = g.noiseStrength;
    u.uDeepWeight.value = c.groundDeep;
    u.uSeams.value = c.groundSeams;
    u.uAfter.value = c.aftershock;
    u.uAfterSpeed.value = c.aftershockSpeed * g.noiseSpeed;
  };
  return material;
}

/* ==================================================================== */
/* Brace                                                                  */
/* ==================================================================== */

const BRACE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3  uHeat;        // flare of chevron 0, 1, 2
  uniform float uFade;
  uniform float uGlow;
  uniform vec3  uColor;
  uniform vec3  uBody;
  uniform float uGlobalGlow;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float id = vUv.x * 2.0;
    float heat = id < 0.5 ? uHeat.x : (id < 1.5 ? uHeat.y : uHeat.z);
    // Hot at the tip, cooling down each arm.
    float tip = 1.0 - vUv.y;
    float alpha = (0.18 + heat * (0.5 + 0.5 * tip)) * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(mix(uBody, uColor, heat) * uGlow * uGlobalGlow * (0.6 + heat), alpha);
  }
`;

export function createBraceMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHeat: { value: new Vector3() },
      uFade: { value: 1 },
      uGlow: { value: 2.5 },
      uColor: { value: new Color('#fff0dd') },
      uBody: { value: new Color('#d16f56') },
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: BRACE_FRAGMENT,
  });
  /** @param {{fade:number, h0:number, h1:number, h2:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uHeat.value.set(s.h0, s.h1, s.h2);
    u.uFade.value = s.fade * g.opacity;
    u.uGlow.value = c.braceGlow * g.glow;
    u.uColor.value.copy(getColor(c.edgeColor));
    u.uBody.value.copy(getColor(c.bodyColor));
  };
  return material;
}

/* ==================================================================== */
/* Distortion — LAYER.DISTORTION                                          */
/* ==================================================================== */

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  uniform float uScale;
  uniform float uSpeed;
  varying vec2 vUv;
  varying vec3 vWorld;

  ${noiseGLSL}

  void main() {
    vec3 np = vec3(vWorld.xz * uScale, vWorld.y * uScale * 0.5 - uTime * uSpeed);
    float nx = snoise(np);
    float ny = snoise(np + vec3(11.7, 3.1, 23.9));
    vec2 c = vUv * 2.0 - 1.0;
    // Strongest at the foot of the front, feathered to the tips and crest.
    float mask = (1.0 - smoothstep(0.4, 1.0, abs(c.x))) * smoothstep(0.0, 0.1, vUv.y)
               * (1.0 - smoothstep(0.3, 1.0, vUv.y));
    float strength = uStrength * uShaderIntensity * mask;
    if (strength < 0.002) discard;
    gl_FragColor = vec4(vec2(nx, ny) * 0.5 + 0.5, strength, mask);
  }
`;

export function createWarpMaterial() {
  const material = new ShaderMaterial({
    // Not `transparent`: the expansion contract keeps every transparent mesh
    // on LAYER.VFX, and this proxy lives on LAYER.DISTORTION. Custom
    // SrcAlpha / OneMinusSrcAlpha blending is exactly the normal blend the
    // acid-fume proxy relies on, so the offset buffer still composites.
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: SrcAlphaFactor,
    blendDst: OneMinusSrcAlphaFactor,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStrength: { value: 0 },
      uScale: { value: 2.5 },
      uSpeed: { value: 2 },
    }),
    vertexShader: FLAT_VERTEX,
    fragmentShader: WARP_FRAGMENT,
  });
  /** @param {{strength:number}} s */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uStrength.value = s.strength * c.warpStrength * g.distortion;
    u.uScale.value = c.warpScale * g.noiseFrequency;
    u.uSpeed.value = c.warpSpeed * g.noiseSpeed;
  };
  return material;
}
