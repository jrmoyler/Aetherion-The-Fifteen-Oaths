import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import { noiseGLSL } from '../../shaders/lib/noise.glsl.js';
import { sharedUniforms } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';

const ID = 'mindlattice';

/**
 * Mind Lattice — the four bespoke shaders. Everything here is *light* and
 * everything is *straight*: no noise bends a line, noise only modulates
 * brightness. That is what keeps it from reading as anything organic.
 *
 *  - **beams** (`createMindBeamMaterial`) — every straight bar of the cage on
 *    one InstancedMesh of open cylinders: the tesseract's 32 edges, the rim
 *    bars and the two rings. A white-hot core inside a coloured sheath (an
 *    inverted fresnel), packets of "thought" running along each bar on its own
 *    clock, a bright head where a bar is still drawing in, and a flare when
 *    a synapse fires down it. Per instance `aBeam`: seed, intensity, hue
 *    (0 primary … 1 secondary), flare.
 *  - **nodes** (`createMindNodeMaterial`) — the tesseract's 16 vertices as
 *    spinning octahedra, white cores with a hard coloured rim; the thought
 *    that flies out in the travel phase is one more of them.
 *  - **the floor** (`createMindFloorMaterial`) — a crisp triangular lattice
 *    of light inside the circle, concentric rings, nodes at the lattice
 *    intersections, a radar sweep, and rings that pulse out on each synapse.
 *    It is revealed by a ring racing out from the centre.
 *  - **the field** (`createMindFieldMaterial`) — an open cylinder on the
 *    cage's bars on `LAYER.DISTORTION`: thin vertical refraction bands that
 *    slide round it, so the air *inside* the cage looks pressed behind glass.
 *
 * Every material reads `settings.mindlattice` in `userData.sync()`.
 */

/* ==================================================================== */
/* Beams                                                                  */
/* ==================================================================== */

const BEAM_VERTEX = /* glsl */ `
  attribute vec4 aBeam;

  varying vec3 vWorld;
  varying vec3 vN;
  varying vec2 vUv;
  varying vec4 vBeam;
  varying float vLen;

  void main() {
    vUv = uv;
    vBeam = aBeam;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vN = normalize(mat3(model) * vec3(normal.x, 0.0, normal.z));
    vLen = length(model[1].xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uCore;
  uniform float uGlow;
  uniform float uCoreGlow;
  uniform float uPacketGlow;
  uniform float uPacketSpeed;
  uniform float uPacketSpacing;
  uniform float uFlareGlow;

  varying vec3 vWorld;
  varying vec3 vN;
  varying vec2 vUv;
  varying vec4 vBeam;
  varying float vLen;

  ${noiseGLSL}

  void main() {
    float seed = vBeam.x;
    float intensity = vBeam.y;
    float hue = vBeam.z;
    float flare = vBeam.w;
    if (intensity < 0.002) discard;

    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = abs(dot(normalize(vN), V));
    // White core straight on, coloured sheath at the edge.
    float core = pow(ndv, 3.0);
    vec3 sheath = mix(uColorA, uColorB, hue);

    // Packets of thought running along the bar, metres apart.
    float d = vUv.y * vLen;
    float ph = fract(d / max(uPacketSpacing, 0.05) - uTime * uPacketSpeed + seed * 7.0);
    float packet = smoothstep(0.8, 0.97, ph) * (1.0 - smoothstep(0.97, 1.0, ph));
    // The bar's leading end: brightest while it is still drawing in.
    float head = smoothstep(0.85, 1.0, vUv.y) * 0.6;
    float flick = 0.85 + 0.15 * sin(uTime * 37.0 + seed * 50.0);

    vec3 col = sheath * (0.45 + 0.55 * (1.0 - core)) * uGlow;
    col += uCore * core * uCoreGlow;
    col += mix(sheath, uCore, 0.5) * (packet * uPacketGlow + head);
    col += uCore * flare * uFlareGlow;
    col *= intensity * flick * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Every bar of the cage. Additive, instanced. */
export function createMindBeamMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uCore: { value: new Color() },
      uGlow: { value: 1.5 },
      uCoreGlow: { value: 2 },
      uPacketGlow: { value: 3 },
      uPacketSpeed: { value: 1 },
      uPacketSpacing: { value: 1.5 },
      uFlareGlow: { value: 4 }
    }),
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uColorA.value.copy(getColor(c.colorPrimary));
    u.uColorB.value.copy(getColor(c.colorSecondary));
    u.uCore.value.copy(getColor(c.colorCore));
    u.uGlow.value = c.beamGlow * g.glow;
    u.uCoreGlow.value = c.coreGlow * g.glow;
    u.uPacketGlow.value = c.packetGlow * g.glow;
    u.uPacketSpeed.value = c.packetSpeed * g.animationSpeed;
    u.uPacketSpacing.value = c.packetSpacing;
    u.uFlareGlow.value = c.synapseGlow * g.glow;
  };

  return material;
}

/* ==================================================================== */
/* Nodes                                                                  */
/* ==================================================================== */

const NODE_VERTEX = /* glsl */ `
  attribute vec4 aNode;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec4 vNode;
  void main() {
    vNode = aNode;
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vN = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const NODE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  uniform vec3  uColorA;
  uniform vec3  uCore;
  uniform float uGlow;

  varying vec3 vWorld;
  varying vec3 vN;
  varying vec4 vNode;

  void main() {
    float intensity = vNode.y;
    if (intensity < 0.002) discard;
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = abs(dot(normalize(vN), V));
    float rim = pow(1.0 - ndv, 1.5);
    float pulse = 0.8 + 0.2 * sin(uTime * 9.0 + vNode.x * 40.0);
    vec3 col = uCore * ndv * 1.5 + uColorA * rim * 2.0;
    col *= uGlow * intensity * pulse * (1.0 + vNode.w * 2.0) * uGlobalGlow * uShaderIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The tesseract's vertices (and the travelling thought). Additive, instanced. */
export function createMindNodeMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uColorA: { value: new Color() },
      uCore: { value: new Color() },
      uGlow: { value: 2 }
    }),
    vertexShader: NODE_VERTEX,
    fragmentShader: NODE_FRAGMENT
  });
  material.userData.instanced = true;

  material.userData.sync = () => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uColorA.value.copy(getColor(c.colorPrimary));
    u.uCore.value.copy(getColor(c.colorCore));
    u.uGlow.value = c.nodeGlow * g.glow;
  };

  return material;
}

/* ==================================================================== */
/* The floor                                                              */
/* ==================================================================== */

const FLOOR_VERTEX = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uExtent;
  uniform float uYaw;
  varying vec2 vP;
  void main() {
    vec2 p = position.xy * uExtent;
    float cs = cos(uYaw);
    float sn = sin(uYaw);
    // The lattice is laid square to the cast, so it reads as designed, not random.
    vP = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(uCentre.x + p.x, 0.018, uCentre.z + p.y, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;

  uniform float uRadius;
  uniform float uFront;
  uniform float uCell;
  uniform float uLineWidth;
  uniform float uGlow;
  uniform float uSweep;
  uniform float uPulseR;
  uniform float uPulse;
  uniform float uFade;
  uniform float uOpacity;
  uniform float uDim;

  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uCore;
  uniform vec3 uColorDim;

  varying vec2 vP;

  float lineFam(vec2 p, vec2 n, float s, float w) {
    float t = dot(p, n) / s;
    float d = abs(fract(t + 0.5) - 0.5) * s;
    return 1.0 - smoothstep(w * 0.5, w, d);
  }

  void main() {
    vec2 p = vP;
    float r = length(p);
    if (r > uRadius + 0.6) discard;
    float inside = 1.0 - smoothstep(uRadius - 0.05, uRadius + 0.05, r);
    float reached = 1.0 - smoothstep(uFront - 0.3, uFront, r);
    float atFront = (1.0 - smoothstep(0.0, 0.35, abs(r - uFront))) * step(r, uRadius + 0.1);

    // A triangular lattice: three families of lines, 60° apart.
    float s = max(uCell, 0.1);
    float l = max(max(lineFam(p, vec2(1.0, 0.0), s, uLineWidth),
                      lineFam(p, vec2(0.5, 0.8660254), s, uLineWidth)),
                  lineFam(p, vec2(-0.5, 0.8660254), s, uLineWidth));
    // Nodes where they cross.
    vec2 q = p / s;
    vec2 g = vec2(q.x - q.y * 0.5773503, q.y * 1.1547005);
    vec2 gc = floor(g + 0.5);
    vec2 back = vec2(gc.x + gc.y * 0.5, gc.y * 0.8660254) * s;
    float node = 1.0 - smoothstep(uLineWidth * 1.2, uLineWidth * 2.4, length(p - back));

    // Concentric rings, and the rim.
    float rings = 0.0;
    for (int i = 1; i <= 3; i++) {
      float rr = uRadius * float(i) / 3.0;
      rings = max(rings, 1.0 - smoothstep(uLineWidth * 0.6, uLineWidth * 1.4, abs(r - rr)));
    }

    // Radar sweep and synapse pulse rings.
    float ang = atan(p.y, p.x);
    float sw = fract((ang / 6.2831853) - uSweep);
    float sweep = pow(1.0 - sw, 6.0);
    float pulse = exp(-pow((r - uPulseR) / 0.35, 2.0)) * uPulse;

    float lit = inside * reached;
    float lines = max(l * 0.7, max(node, rings));
    float glow = lines * (0.55 + 0.45 * sweep + pulse * 2.0) + atFront * 1.5;
    vec3 col = mix(uColorA, uColorB, rings) * glow * uGlow + uCore * node * (0.5 + sweep);
    col *= uGlobalGlow * uShaderIntensity;
    // A faint dark-blue wash so the lines sit on something.
    vec3 base = uColorDim;
    float a = max(lit * uDim, min(1.0, glow) * lit) * (1.0 - uFade) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(base * (1.0 - min(glow, 1.0)) + col, clamp(a, 0.0, 1.0));
  }
`;

/** The lattice of light on the floor. */
export function createMindFloorMaterial() {
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
      uExtent: { value: 5 },
      uYaw: { value: 0 },
      uRadius: { value: 4 },
      uFront: { value: 0 },
      uCell: { value: 0.9 },
      uLineWidth: { value: 0.03 },
      uGlow: { value: 1.5 },
      uSweep: { value: 0 },
      uPulseR: { value: 0 },
      uPulse: { value: 0 },
      uFade: { value: 0 },
      uOpacity: { value: 1 },
      uDim: { value: 0.35 },
      uColorA: { value: new Color() },
      uColorB: { value: new Color() },
      uCore: { value: new Color() },
      uColorDim: { value: new Color() }
    }),
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT
  });

  /** @param {object} s { centre, yaw, radius, front, sweep, pulseR, pulse, fade } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    const u = material.uniforms;
    u.uCentre.value.copy(s.centre);
    u.uYaw.value = s.yaw;
    u.uRadius.value = s.radius;
    u.uExtent.value = s.radius + 0.8;
    u.uFront.value = s.front;
    u.uCell.value = c.gridCell;
    u.uLineWidth.value = c.gridLineWidth;
    u.uGlow.value = c.gridGlow * g.glow;
    u.uSweep.value = s.sweep;
    u.uPulseR.value = s.pulseR;
    u.uPulse.value = s.pulse;
    u.uFade.value = s.fade;
    u.uOpacity.value = g.opacity;
    u.uDim.value = c.gridWash;
    u.uColorA.value.copy(getColor(c.colorPrimary));
    u.uColorB.value.copy(getColor(c.colorSecondary));
    u.uCore.value.copy(getColor(c.colorCore));
    u.uColorDim.value.copy(getColor(c.colorWash));
  };

  return material;
}

/* ==================================================================== */
/* The field                                                              */
/* ==================================================================== */

const FIELD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FIELD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShaderIntensity;
  uniform float uStrength;
  uniform float uBands;
  uniform float uDrop;    // 0..1 how far down the cage the field has come

  varying vec2 vUv;

  void main() {
    // Vertical glass bands sliding round the cage.
    float b = fract(vUv.x * uBands + uTime * 0.15);
    float slope = sin(b * 6.2831853);
    float drop = step(1.0 - uDrop, vUv.y);
    float mask = drop * smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.92, 1.0, vUv.y));
    float s = uStrength * uShaderIntensity * mask;
    if (s < 0.002) discard;
    gl_FragColor = vec4(vec2(slope, 0.0) * 0.5 + 0.5, s, mask);
  }
`;

/** Glass between the bars. LAYER.DISTORTION — see `createAcidFumeMaterial`. */
export function createMindFieldMaterial() {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: sharedUniforms({
      uStrength: { value: 0 },
      uBands: { value: 24 },
      uDrop: { value: 0 }
    }),
    vertexShader: FIELD_VERTEX,
    fragmentShader: FIELD_FRAGMENT
  });

  /** @param {object} s { strength, drop } */
  material.userData.sync = (s) => {
    const c = settings[ID];
    const g = settings.global;
    material.uniforms.uStrength.value = s.strength * c.fieldStrength * g.distortion;
    material.uniforms.uBands.value = Math.max(1, Math.round(c.barCount));
    material.uniforms.uDrop.value = s.drop;
  };

  return material;
}
