import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { commonGLSL } from '../../shaders/lib/common.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

/**
 * The four bespoke surfaces of the Blink Step.
 *
 *   - `createBlinkTrailMaterial`  — the light streak along the path: a
 *     camera-facing ribbon built in the vertex shader from a parameter-space
 *     ladder, with a white-hot head, a torn and fading tail, and filaments
 *     spiralling round the core.
 *   - `createBlinkShardMaterial`  — the crowns of light shards at either end:
 *     glassy, additive, fresnel-edged.
 *   - `createBlinkGhostMaterial`  — the afterimages: an upright billboard with
 *     a body drawn as a signed-distance field, strobing, scan-lined, torn into
 *     slices and eaten by noise as it ages.
 *   - `createBlinkWarpMaterial`   — a screen-space pinch (departure) or bulge
 *     (arrival) on `LAYER.DISTORTION`.
 *
 * All four read `settings.blink` through `userData.sync`, every frame.
 */

/* ==================================================================== */
/* The streak                                                            */
/* ==================================================================== */

/**
 * Runs on `createBoltRibbonGeometry`: every vertex is `(t, side, 0)` with `t`
 * 0 → 1 from the tail to the head, and `aStrand` picks the filament (0 is the
 * core). Nothing in the buffer is in metres, so one strip draws a streak of
 * any length, and `uTail`/`uHead` slide it along the line every frame.
 *
 * Camera-facing about its own axis: the ribbon's width is laid along
 * `cross(axis, toCamera)`, so it is always seen face-on however the camera
 * orbits — a flat ribbon edge-on is a line one pixel wide.
 */
const TRAIL_VERTEX = /* glsl */ `
  #define TAU 6.28318530718

  uniform float uTime;
  uniform vec3  uOrigin;
  uniform vec3  uDir;
  uniform float uTail;      // metres along the line
  uniform float uHead;
  uniform float uHeight;
  uniform float uWidth;
  uniform float uTailWidth;
  uniform float uTaper;
  uniform float uStrands;
  uniform float uSpiral;
  uniform float uTwist;
  uniform float uStrandWidth;

  attribute float aStrand;

  varying float vT;
  varying float vAcross;
  varying float vMetres;     // metres behind the head
  varying float vS;          // metres along the line
  varying float vStrand;

  void main() {
    float t = position.x;
    float s = mix(uTail, uHead, t);
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 P = uOrigin + uDir * s + up * uHeight;

    float width = uWidth * mix(uTailWidth, 1.0, pow(clamp(t, 0.0, 1.0), uTaper));

    if (aStrand > 0.5) {
      // A filament: spirals round the core, pinched to it at both ends so the
      // bundle reads as one streak and not as a frayed rope.
      vec3 side = normalize(cross(uDir, up) + vec3(1e-5));
      float phase = (aStrand - 1.0) / max(uStrands, 1.0) * TAU + s * uTwist * TAU - uTime * 5.0;
      float env = sin(clamp(t, 0.0, 1.0) * 3.14159);
      P += (side * cos(phase) + up * sin(phase)) * uSpiral * env;
      width *= uStrandWidth;
    }

    vec3 toCam = normalize(cameraPosition - P);
    vec3 across = cross(uDir, toCam);
    float len = length(across);
    // Looking straight down the axis: any perpendicular will do.
    across = len > 1e-4 ? across / len : normalize(cross(uDir, up) + vec3(1e-5));
    P += across * position.y * width;

    vT = t;
    vAcross = position.y;
    vMetres = uHead - s;
    vS = s;
    vStrand = aStrand;
    gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFalloff;
  uniform float uHeadGlow;
  uniform float uHeadSize;
  uniform float uGlow;
  uniform float uNoise;
  uniform float uNoiseScale;
  uniform float uNoiseSpeed;
  uniform float uCore;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uSeed;
  uniform vec3  uColorCore;
  uniform vec3  uColorMid;
  uniform vec3  uColorEdge;
  uniform vec3  uColorTail;
  uniform float uGlobalGlow;

  varying float vT;
  varying float vAcross;
  varying float vMetres;
  varying float vS;
  varying float vStrand;

  ${noiseGLSL}
  ${commonGLSL}

  void main() {
    float a = abs(vAcross);
    // A soft body and a hard white core inside it.
    float body = 1.0 - smoothstep(0.35, 1.0, a);
    float core = exp(-(a * a) / max(uCore * uCore, 1e-4));

    // Bright head, fading tail.
    float run = pow(clamp(vT, 0.0, 1.0), uFalloff);

    // The tail tears: noise sliding back along the line, eating more of the
    // streak the further it is from the head.
    float n = fbm3(vec3(vS * uNoiseScale - uTime * uNoiseSpeed, vAcross * 1.3, uSeed + vStrand * 7.0));
    float tear = smoothstep(-0.25, 0.45, n + vT * 0.9 - 0.35);
    body *= mix(1.0, tear, clamp(uNoise, 0.0, 1.0));
    core *= mix(1.0, 0.5 + 0.5 * tear, clamp(uNoise, 0.0, 1.0));

    // The knot of light at the head.
    float knot = exp(-pow(vMetres / max(uHeadSize, 1e-3), 2.0)) * uHeadGlow;

    float energy = (body * 0.55 + core) * run + knot * (body + core);
    if (vStrand > 0.5) energy *= 0.65;

    vec3 color = gradient4(uColorCore, uColorMid, uColorEdge, uColorTail,
                           clamp(1.0 - (core * 0.6 + run * 0.6) + a * 0.3, 0.0, 1.0));
    color = mix(color, uColorCore, clamp(knot * 0.4, 0.0, 1.0));

    float alpha = clamp(energy, 0.0, 1.0) * uOpacity * uFade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * energy * uGlow * uGlobalGlow * uFade, alpha);
  }
`;

export function createBlinkTrailMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uOrigin: { value: new Vector3() },
      uDir: { value: new Vector3(0, 0, 1) },
      uTail: { value: 0 },
      uHead: { value: 0 },
      uHeight: { value: 1 },
      uWidth: { value: 0.16 },
      uTailWidth: { value: 0.25 },
      uTaper: { value: 1.2 },
      uStrands: { value: 3 },
      uSpiral: { value: 0.18 },
      uTwist: { value: 1.4 },
      uStrandWidth: { value: 0.35 },
      uFalloff: { value: 1.6 },
      uHeadGlow: { value: 3.5 },
      uHeadSize: { value: 0.8 },
      uGlow: { value: 3 },
      uNoise: { value: 0.7 },
      uNoiseScale: { value: 1.2 },
      uNoiseSpeed: { value: 3.5 },
      uCore: { value: 0.35 },
      uOpacity: { value: 1 },
      uFade: { value: 1 },
      uSeed: { value: 0 },
      uColorCore: { value: new Color() },
      uColorMid: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorTail: { value: new Color() }
    }),
    vertexShader: TRAIL_VERTEX,
    fragmentShader: TRAIL_FRAGMENT
  });

  /** @param {object} state { origin, dir, tail, head, fade, seed } */
  material.userData.sync = (state) => {
    const c = settings.blink;
    const g = settings.global;
    const u = material.uniforms;

    u.uOrigin.value.copy(state.origin);
    u.uDir.value.copy(state.dir);
    u.uTail.value = state.tail;
    u.uHead.value = state.head;
    u.uFade.value = state.fade;
    u.uSeed.value = state.seed;

    u.uHeight.value = c.bodyHeight;
    u.uWidth.value = c.trailWidth;
    u.uTailWidth.value = c.trailTailWidth;
    u.uTaper.value = c.trailTaper;
    u.uStrands.value = Math.max(1, Math.round(c.trailStrands));
    u.uSpiral.value = c.trailSpiral;
    u.uTwist.value = c.trailTwist;
    u.uStrandWidth.value = c.trailStrandWidth;
    u.uFalloff.value = c.trailFalloff;
    u.uHeadGlow.value = c.trailHeadGlow;
    u.uHeadSize.value = c.trailHeadSize;
    u.uGlow.value = c.trailGlow * g.glow;
    u.uNoise.value = c.trailNoise * g.noiseStrength;
    u.uNoiseScale.value = c.trailNoiseScale * g.noiseFrequency;
    u.uNoiseSpeed.value = c.trailNoiseSpeed * g.noiseSpeed;
    u.uCore.value = c.trailCore;
    u.uOpacity.value = c.trailOpacity * g.opacity;
    u.uColorCore.value.copy(getColor(c.colorTrailCore));
    u.uColorMid.value.copy(getColor(c.colorTrailMid));
    u.uColorEdge.value.copy(getColor(c.colorTrailEdge));
    u.uColorTail.value.copy(getColor(c.colorTrailTail));
  };

  return material;
}

/* ==================================================================== */
/* The shards                                                            */
/* ==================================================================== */

/**
 * Splinters of light on the crystal prism from `ProceduralGeometry`: dark-cored
 * glass with a hot fresnel edge and a white tip. Additive and unlit — they are
 * light that has been given an edge, not stone — and per-instance `aFade` so a
 * crown can burst and die without touching the material.
 */
const SHARD_VERTEX = /* glsl */ `
  attribute float aFade;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vUp;
  varying float vFade;

  void main() {
    mat4 inst = mat4(1.0);
    #ifdef USE_INSTANCING
      inst = instanceMatrix;
    #endif
    vec4 world = modelMatrix * inst * vec4(position, 1.0);
    // Shards are scaled non-uniformly (long and thin), so the normal goes
    // through the inverse-transpose of the instance's 3x3.
    mat3 m = mat3(modelMatrix) * mat3(inst);
    vNormalW = normalize(transpose(inverse(m)) * normal);
    vViewDir = cameraPosition - world.xyz;
    vUp = position.y;
    vFade = aFade;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SHARD_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uFresnel;
  uniform float uFresnelPower;
  uniform float uOpacity;
  uniform vec3  uColorCore;
  uniform vec3  uColorEdge;
  uniform vec3  uColorDeep;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vUp;
  varying float vFade;

  void main() {
    if (vFade < 0.003) discard;
    float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    float rim = pow(1.0 - ndv, uFresnelPower) * uFresnel;
    float tip = smoothstep(0.55, 1.0, vUp);

    vec3 color = mix(uColorDeep, uColorEdge, clamp(rim, 0.0, 1.0));
    color += uColorCore * (tip * 1.5 + rim * 0.5);

    float alpha = clamp(0.25 + rim + tip * 0.5, 0.0, 1.0) * uOpacity * vFade;
    gl_FragColor = vec4(color * uGlow * uGlobalGlow * vFade, alpha);
  }
`;

export function createBlinkShardMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uGlow: { value: 3 },
      uFresnel: { value: 2.2 },
      uFresnelPower: { value: 2.2 },
      uOpacity: { value: 0.95 },
      uColorCore: { value: new Color() },
      uColorEdge: { value: new Color() },
      uColorDeep: { value: new Color() }
    }),
    vertexShader: SHARD_VERTEX,
    fragmentShader: SHARD_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.blink;
    const g = settings.global;
    const u = material.uniforms;
    u.uGlow.value = c.shardGlow * g.glow;
    u.uFresnel.value = c.shardFresnel * g.fresnel;
    u.uFresnelPower.value = c.shardFresnelPower;
    u.uOpacity.value = c.shardOpacity * g.opacity;
    u.uColorCore.value.copy(getColor(c.colorShardCore));
    u.uColorEdge.value.copy(getColor(c.colorShardEdge));
    u.uColorDeep.value.copy(getColor(c.colorShardDeep));
  };

  return material;
}

/* ==================================================================== */
/* The afterimages                                                       */
/* ==================================================================== */

/**
 * An upright billboard — turned about world Y only, so the figure stays
 * standing however the camera pitches — with a body drawn into it as a signed
 * distance field: head, torso, hips, arms swept back and legs mid-stride, all
 * capsules melted together with a smooth union. Procedural on purpose: the
 * rig's own mesh would need a second skinned draw per ghost, and an afterimage
 * is read as a silhouette at speed, not as a model.
 *
 * Instance attribute `aGhost` = (age 0..1, seed). The age drives the fade, the
 * strobe and the noise that eats the figure from its edges inward.
 */
const GHOST_VERTEX = /* glsl */ `
  uniform float uHeight;
  uniform float uWidth;
  uniform vec3  uDir;       // the dash direction, flat

  attribute vec2 aGhost;

  varying vec2  vQ;        // body space: x across, y 0 at the feet → 1 at the head
  varying vec2  vGhost;

  void main() {
    vec3 centre = vec3(0.0);
    #ifdef USE_INSTANCING
      centre = instanceMatrix[3].xyz;
    #endif
    centre = (modelMatrix * vec4(centre, 1.0)).xyz;

    vec3 toCam = cameraPosition - centre;
    toCam.y = 0.0;
    float len = length(toCam);
    toCam = len > 1e-4 ? toCam / len : vec3(0.0, 0.0, 1.0);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));

    float W = uHeight * uWidth;
    vec3 P = centre + right * position.x * W + vec3(0.0, position.y * uHeight, 0.0);

    // The figure is drawn leaning toward +x. Mirror it whenever the dash runs
    // toward the screen's left, so every afterimage leans into the move.
    float facing = dot(uDir, right) < 0.0 ? -1.0 : 1.0;
    vQ = vec2(position.x * uWidth * facing, position.y);
    vGhost = aGhost;
    gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  }
`;

const GHOST_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uEdge;
  uniform float uFill;
  uniform float uFlicker;
  uniform float uFlickerRate;
  uniform float uGlitch;
  uniform float uSlices;
  uniform float uScan;
  uniform float uDissolve;
  uniform vec3  uColorCore;
  uniform vec3  uColorEdge;
  uniform float uGlobalGlow;

  varying vec2 vQ;
  varying vec2 vGhost;

  ${noiseGLSL}

  float capsule(vec2 p, vec2 a, vec2 b, float r) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }

  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  /** The body, mid-dash: leaning into the move, arms swept back, one leg forward. */
  float body(vec2 q) {
    float d = length(q - vec2(0.02, 0.905)) - 0.062;                            // head
    d = smin(d, capsule(q, vec2(0.012, 0.80), vec2(-0.005, 0.54), 0.078), 0.04); // torso
    d = smin(d, capsule(q, vec2(-0.05, 0.50), vec2(0.05, 0.50), 0.066), 0.04);  // hips
    d = smin(d, capsule(q, vec2(0.045, 0.48), vec2(0.10, 0.27), 0.045), 0.02);  // front thigh
    d = smin(d, capsule(q, vec2(0.10, 0.27), vec2(0.075, 0.03), 0.038), 0.02);  // front shin
    d = smin(d, capsule(q, vec2(-0.04, 0.48), vec2(-0.09, 0.26), 0.045), 0.02); // back thigh
    d = smin(d, capsule(q, vec2(-0.09, 0.26), vec2(-0.16, 0.07), 0.036), 0.02); // back shin
    d = smin(d, capsule(q, vec2(0.08, 0.78), vec2(-0.02, 0.60), 0.034), 0.02);  // near arm
    d = smin(d, capsule(q, vec2(-0.02, 0.60), vec2(-0.14, 0.50), 0.03), 0.02);
    d = smin(d, capsule(q, vec2(-0.08, 0.78), vec2(-0.17, 0.62), 0.032), 0.02); // far arm
    d = smin(d, capsule(q, vec2(-0.17, 0.62), vec2(-0.24, 0.50), 0.028), 0.02);
    return d;
  }

  void main() {
    float age = clamp(vGhost.x, 0.0, 1.0);
    float seed = vGhost.y;

    // Slice tearing: whole horizontal bands jump sideways, re-rolled at the
    // strobe rate, and only some bands at a time.
    float band = floor(vQ.y * uSlices);
    float tick = floor(uTime * uFlickerRate);
    float roll = hash11(band * 1.37 + tick * 0.71 + seed * 13.0);
    float tear = (hash11(band * 3.11 + tick * 1.93 + seed) - 0.5) * 2.0 * uGlitch * step(0.72, roll);
    vec2 q = vQ + vec2(tear * (0.4 + age), 0.0);

    float d = body(q);
    float aa = fwidth(d) + 1e-4;
    float fill = 1.0 - smoothstep(-aa, aa, d);
    float edge = exp(-abs(d) * 70.0);

    // Eaten from the edges inward as it ages.
    float n = snoise(vec3(q * 9.0, seed * 7.0 + uTime * 0.8)) * 0.5 + 0.5;
    // The "- d * 2.0" term biases the threshold toward the outline, so the noise takes
    // the edges first and the core of the figure last.
    float alive = smoothstep(age * uDissolve - 0.05, age * uDissolve + 0.05, n * 0.85 + 0.15 - d * 2.0);

    float scan = 0.7 + 0.3 * sin(q.y * uScan * 6.28318 + uTime * 12.0);
    float strobe = 1.0 - uFlicker * step(0.5, hash11(tick + seed * 31.0));
    float life = pow(1.0 - age, 1.5);

    float energy = (fill * uFill * scan + edge * uEdge) * alive * strobe * life;
    if (energy < 0.003) discard;
    vec3 color = mix(uColorEdge, uColorCore, clamp(fill * 0.6 + (1.0 - age) * 0.3, 0.0, 1.0));
    gl_FragColor = vec4(color * energy * uGlow * uGlobalGlow, clamp(energy, 0.0, 1.0) * uOpacity);
  }
`;

export function createBlinkGhostMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uHeight: { value: 1.78 },
      uWidth: { value: 0.75 },
      uDir: { value: new Vector3(0, 0, 1) },
      uGlow: { value: 2.2 },
      uOpacity: { value: 0.85 },
      uEdge: { value: 0.6 },
      uFill: { value: 0.35 },
      uFlicker: { value: 0.65 },
      uFlickerRate: { value: 28 },
      uGlitch: { value: 0.05 },
      uSlices: { value: 18 },
      uScan: { value: 70 },
      uDissolve: { value: 1 },
      uColorCore: { value: new Color() },
      uColorEdge: { value: new Color() }
    }),
    vertexShader: GHOST_VERTEX,
    fragmentShader: GHOST_FRAGMENT
  });

  material.userData.sync = () => {
    const c = settings.blink;
    const g = settings.global;
    const u = material.uniforms;
    u.uHeight.value = c.ghostHeight;
    u.uWidth.value = c.ghostWidth;
    u.uGlow.value = c.ghostGlow * g.glow;
    u.uOpacity.value = c.ghostOpacity * g.opacity;
    u.uEdge.value = c.ghostEdge;
    u.uFill.value = c.ghostFill;
    u.uFlicker.value = c.ghostFlicker;
    u.uFlickerRate.value = c.ghostFlickerRate * g.animationSpeed;
    u.uGlitch.value = c.ghostGlitch * g.randomness;
    u.uSlices.value = Math.max(1, Math.round(c.ghostSlices));
    u.uScan.value = c.ghostScan;
    u.uDissolve.value = c.ghostDissolve * g.shaderIntensity;
    u.uColorCore.value.copy(getColor(c.colorGhostCore));
    u.uColorEdge.value.copy(getColor(c.colorGhostEdge));
  };

  return material;
}

/* ==================================================================== */
/* The pinch and the bulge                                               */
/* ==================================================================== */

/**
 * A camera-facing disc on `LAYER.DISTORTION` that writes a *radial* offset —
 * the quad is laid out in view space, so its own `position.xy` already is the
 * screen-space direction away from its centre. `uSign` −1 pulls the frame in
 * toward the centre (the body being sucked out of the world), +1 pushes it out
 * (the air the body displaces when it lands). A ring rather than a disc: the
 * wave sits at `uFront`, and the air inside it has already settled.
 */
const WARP_VERTEX = /* glsl */ `
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy * 2.0;   // -1..1 across the disc
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const WARP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uFront;     // 0..1 across the disc
  uniform float uSign;
  uniform float uSeed;
  uniform float uShaderIntensity;
  varying vec2 vP;

  ${noiseGLSL}

  void main() {
    float r = length(vP);
    if (r > 1.0 || r < 1e-3) discard;
    float wobble = snoise(vec3(vP * 2.5, uTime * 2.0 + uSeed)) * 0.08;
    float d = r - uFront + wobble;
    float window = exp(-(d * d) / 0.035) * (1.0 - smoothstep(0.8, 1.0, r));
    float strength = uStrength * uShaderIntensity * window;
    if (strength < 0.002) discard;
    vec2 dir = (vP / r) * uSign;
    gl_FragColor = vec4(dir * 0.5 + 0.5, strength, window);
  }
`;

export function createBlinkWarpMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uSize: { value: 2 },
      uStrength: { value: 0 },
      uFront: { value: 0.5 },
      uSign: { value: 1 },
      uSeed: { value: 0 }
    }),
    vertexShader: WARP_VERTEX,
    fragmentShader: WARP_FRAGMENT
  });

  /** @param {object} state { size, strength, front, sign, seed } */
  material.userData.sync = (state) => {
    const u = material.uniforms;
    u.uSize.value = state.size;
    u.uStrength.value = state.strength * settings.global.distortion;
    u.uFront.value = state.front;
    u.uSign.value = state.sign;
    u.uSeed.value = state.seed;
  };

  return material;
}
