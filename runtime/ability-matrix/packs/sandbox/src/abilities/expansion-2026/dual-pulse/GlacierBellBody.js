import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  NormalBlending,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { LAYER } from '../../../core/Layers.js';
import { noiseGLSL } from '../../../shaders/lib/noise.glsl.js';
import { PULSE_GLOBALS_GLSL, pulseUniforms } from './PulseUniforms.js';

/**
 * Glacier Bell only · the bell itself, at zone scale, and its glacier.
 *
 * The shared dual-pulse engine gives the Glacier Bell its travel, telegraph,
 * rime seal, lattice and strike; what it lacked was a *body*. This module is
 * that body, and it belongs to the Glacier Bell alone (Cinder Crown never
 * builds it):
 *
 *  - **the bell** — a faceted lathe of cut ice, `bellRadius × zoneRadius`
 *    across the lip, hollow beneath, a sound-bow thickening at the lip, a
 *    waist, a shoulder and a crown of three crystal prongs. Every ring of the
 *    lathe is turned half a facet against the last and its corners jittered,
 *    so the flat-shaded faces read as cut crystal, not a smooth dome. It
 *    drops out of the sky on the landing frame (`bellDrop`), hangs
 *    `bellHang` metres off the floor and *swings* — a decaying pendulum about
 *    its crown, across the line of sight — while a band of light runs down
 *    it on each swing and its lip quivers. Over the linger rime crawls up it
 *    from the lip; then it dissolves from the lip up with a burning edge.
 *  - **the glacier** — up to 32 faceted ice spikes standing in the zone. Each
 *    stands at its own radius and breaks the floor at the exact moment the
 *    frost front (the hit radius, `q × zoneRadius`) reaches it, leaning out
 *    from the centre; they keep creeping up through the linger and sink and
 *    crumble on the exit.
 *  - **the deep ice floor** — a normal-blended disc under the shared rime
 *    seal, filling exactly the frost radius: blue-black ice with lighter
 *    fracture plates, so the frost has a dark deep tone to sit on.
 *
 * Bell and spikes share one bespoke lit ice shader with a four-stop ramp:
 * white core (specular glints, HDR) → pale tint (fresnel rim, facet edges,
 * the ring band) → saturated body (sun-lit faces) → blue-black deep (faces
 * looking into the ice). Opaque, depth-writing, on `LAYER.SHAPED` (kept out
 * of the depth prepass because the dissolve discards), casting shadows.
 *
 * Records hold nothing but per-spike dice made at construction; every size,
 * time and colour is read from settings on each `updateGlacierBody` call.
 * Allocation-free per frame.
 */

export const MAX_SPIKES = 32;
const TAU = Math.PI * 2;

/** Deterministic 0..1 hash. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * The bell: lip radius 1 at y = 0, crown prongs to y ≈ 2.05. Non-indexed so
 * every triangle is flat-shaded. `aHeight` is 0 at the lip … 1 at the crown.
 */
export function glacierBodyBellGeometry(sides = 12) {
  const p = [];
  const h = [];
  // Outer profile lip → crown, then the inner wall crown → lip: one sweep.
  const outer = [[1.0, 0.0], [1.02, 0.1], [0.9, 0.24], [0.78, 0.5], [0.68, 0.84], [0.62, 1.12], [0.6, 1.34], [0.52, 1.52], [0.32, 1.66], [0.0, 1.7]];
  const inner = [[0.0, 1.38], [0.42, 1.24], [0.55, 0.9], [0.66, 0.5], [0.8, 0.18], [0.9, 0.04]];
  const profile = [...outer, ...inner, [1.0, 0.0]];
  const rows = profile.length;
  const vert = (i, j) => {
    const [r0, y0] = profile[j];
    // Every other ring is turned half a facet: the faces become cut triangles.
    const a = ((i + (j % 2) * 0.5) / sides) * TAU;
    const jitter = r0 > 0 ? 1 + (hash((i % sides) * 7.3 + j * 13.1) - 0.5) * 0.09 : 1;
    const y = y0 + (r0 > 0 ? (hash((i % sides) * 3.7 + j * 5.9) - 0.5) * 0.035 : 0);
    return [Math.cos(a) * r0 * jitter, y, Math.sin(a) * r0 * jitter];
  };
  const push = (v) => {
    p.push(v[0], v[1], v[2]);
    h.push(Math.min(1, Math.max(0, v[1] / 1.7)));
  };
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < sides; i++) {
      const a = vert(i, j);
      const b = vert(i + 1, j);
      const c = vert(i, j + 1);
      const d = vert(i + 1, j + 1);
      push(a); push(c); push(b);
      push(b); push(c); push(d);
    }
  }
  // Crown: three crystal prongs, hexagonal, splayed, pointed.
  for (let k = 0; k < 3; k++) {
    const yaw = (k / 3) * TAU + 0.4;
    const tilt = k === 0 ? 0.05 : 0.38;
    const len = k === 0 ? 0.62 : 0.42;
    const ax = Math.sin(tilt) * Math.cos(yaw);
    const az = Math.sin(tilt) * Math.sin(yaw);
    const ay = Math.cos(tilt);
    const base = [ax * 0.05, 1.62, az * 0.05];
    const tip = [base[0] + ax * len, base[1] + ay * len, base[2] + az * len];
    const mid = [base[0] + ax * len * 0.62, base[1] + ay * len * 0.62, base[2] + az * len * 0.62];
    const ring = (c, r, i) => {
      const a = (i / 6) * TAU;
      return [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r];
    };
    const w = k === 0 ? 0.13 : 0.09;
    for (let i = 0; i < 6; i++) {
      const b0 = ring(base, w, i), b1 = ring(base, w, i + 1);
      const m0 = ring(mid, w * 0.9, i), m1 = ring(mid, w * 0.9, i + 1);
      push(b0); push(m0); push(b1);
      push(b1); push(m0); push(m1);
      push(m0); push(tip); push(m1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.setAttribute('aHeight', new Float32BufferAttribute(h, 1));
  g.computeVertexNormals();
  return g;
}

/**
 * One ice spike, base at y = 0, height 1, radius ~0.5: a hexagonal shaft that
 * narrows, kinks at a slanted break, and ends in an off-centre point.
 */
export function glacierSpikeGeometry() {
  const p = [];
  const h = [];
  const rows = [[0.5, 0.0], [0.46, 0.35], [0.36, 0.62], [0.24, 0.8]];
  const tip = [0.06, 1.0, -0.04];
  const ringAt = (j, i) => {
    const [r, y] = rows[j];
    const a = ((i + (j % 2) * 0.5) / 6) * TAU;
    const k = 1 + (hash((i % 6) * 4.1 + j * 9.7) - 0.5) * 0.18;
    return [Math.cos(a) * r * k, y + (j === rows.length - 1 ? 0.08 * Math.cos(a) : 0), Math.sin(a) * r * k];
  };
  const push = (v) => {
    p.push(v[0], v[1], v[2]);
    h.push(v[1]);
  };
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < 6; i++) {
      const a = ringAt(j, i), b = ringAt(j, i + 1), c = ringAt(j + 1, i), d = ringAt(j + 1, i + 1);
      push(a); push(c); push(b);
      push(b); push(c); push(d);
    }
  }
  for (let i = 0; i < 6; i++) {
    push(ringAt(rows.length - 1, i));
    push(tip);
    push(ringAt(rows.length - 1, i + 1));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.setAttribute('aHeight', new Float32BufferAttribute(h, 1));
  g.computeVertexNormals();
  return g;
}

/** A unit disc in XZ, uv centred. */
function floorGeometry(segments = 96) {
  const positions = [0, 0, 0];
  const uv = [0.5, 0.5];
  const index = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    positions.push(Math.cos(a), 0, Math.sin(a));
    uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 1; i <= segments; i++) index.push(0, i + 1, i);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

/* ==================================================================== */
/* The ice shader (bell + spikes)                                        */
/* ==================================================================== */

const ICE_VERTEX = /* glsl */ `
  attribute float aHeight;
  uniform float uQuiver;      // lip vibration amplitude (bell only)
  uniform float clock;
  #ifdef USE_INSTANCING
    attribute float aSeed;
  #endif
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying float vHeight;
  varying float vSeed;
  void main() {
    vec3 p = position;
    vHeight = aHeight;
    // The bell rings: the lip breathes in and out in four lobes.
    float lip = 1.0 - smoothstep(0.0, 0.55, aHeight);
    float ang = atan(p.z, p.x);
    p.xz *= 1.0 + uQuiver * lip * sin(ang * 4.0) * sin(clock * 38.0);
    vLocal = p;
    #ifdef USE_INSTANCING
      vSeed = aSeed;
      mat4 m = modelMatrix * instanceMatrix;
    #else
      vSeed = 0.0;
      mat4 m = modelMatrix;
    #endif
    vec4 world = m * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(m) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ICE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float uDissolve;    // 0 whole … 1 gone
  uniform float uDissolveFromLip; // 1: the cut climbs from the lip; 0: noise only
  uniform float uBand;        // position of the ring band, 0 lip … 1 crown (<0 off)
  uniform float uBandGlow;
  uniform float uRime;        // 0 clear … 1 rimed to the crown
  uniform float uFacet;
  uniform float uCrackGlow;
  uniform float uSpecular;
  uniform float uEnergy;      // strike energy, brightens the inner veins
  uniform vec3  uCore;
  uniform vec3  uTint;
  uniform vec3  uBody;
  uniform vec3  uDeep;
  uniform vec3  uRimeColor;
  uniform vec3  uLightDir;
  uniform float uGlobalGlow;
  uniform float uShaderIntensity;
  ${PULSE_GLOBALS_GLSL}
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying float vHeight;
  varying float vSeed;
  ${noiseGLSL}
  void main() {
    // --- dissolve: climbs from the lip with a burning, pale edge ----------
    float n = snoise01(vLocal * 3.2 * uNoiseScale + vSeed * 17.0);
    float cut = mix(n, n * 0.45 + vHeight * 0.55, uDissolveFromLip);
    float gone = clamp(uDissolve + (1.0 - uGlobalOpacity), 0.0, 1.0);
    float d = cut - (gone * 1.12 - 0.06);
    if (d < 0.0) discard;
    float edge = (1.0 - smoothstep(0.0, 0.06, d)) * step(0.001, gone);

    // --- lighting ----------------------------------------------------------
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uLightDir);
    float ndl = dot(N, L);
    float diffuse = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
    float facing = abs(dot(N, V));
    float fres = pow(1.0 - facing, 2.4) * uFresnel;
    // Flat-shaded, so N is constant per face: hashing it gives every cut
    // facet its own depth, the way a crystal's faces never match.
    float facet = fract(sin(dot(floor(N * 9.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);

    // Four-stop ramp. Faces looking straight into the ice are deep; lit
    // faces lift to the saturated body; grazing faces and facet edges go pale.
    float body = clamp(0.12 + 0.62 * diffuse * diffuse + (facet - 0.5) * 0.35 * uFacet, 0.0, 1.0);
    vec3 color = mix(uDeep, uBody, body);
    // Internal fracture planes: thin pale veins inside the mass.
    vec2 cell = voronoi2((vLocal.xy + vLocal.zy * 0.7) * 2.6 * uNoiseScale + vSeed * 3.0);
    float vein = smoothstep(0.62, 0.8, cell.x) * uNoiseStrength;
    color = mix(color, uTint, vein * (0.25 + 0.45 * uEnergy) * uCrackGlow);
    color = mix(color, uTint, clamp(fres * 0.85, 0.0, 1.0));
    // Glints: sharp sun specular on the facets, HDR so bloom catches them.
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 70.0) * uSpecular;
    color += uCore * spec;

    // The ring band: a ring of pale light running lip → crown on each swing.
    float band = uBand < 0.0 ? 0.0 : exp(-pow((vHeight - uBand) * 7.0, 2.0));
    color += uTint * band * uBandGlow * uShaderIntensity;

    // Rime: matte frost crawling up from the lip over the linger.
    float frost = fbm3(vLocal * 5.0 * uNoiseScale + vSeed * 9.0) * 0.5 + 0.5;
    // Covers everything below height uRime, with a ragged frost line.
    float rime = (1.0 - smoothstep(uRime - 0.1, uRime + 0.04, vHeight + (frost - 0.5) * 0.3)) * step(0.001, uRime);
    vec3 rimeLit = uRimeColor * (0.35 + 0.55 * diffuse);
    color = mix(color, rimeLit, rime * 0.7);

    color *= mix(1.0, uGlobalGlow, 0.35);
    color += uCore * edge * 2.2 * uGlobalGlow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function createIceMaterial() {
  return new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    uniforms: pulseUniforms({
      clock: { value: 0 },
      uQuiver: { value: 0 },
      uDissolve: { value: 0 },
      uDissolveFromLip: { value: 1 },
      uBand: { value: -1 },
      uBandGlow: { value: 1 },
      uRime: { value: 0 },
      uFacet: { value: 1 },
      uCrackGlow: { value: 1 },
      uSpecular: { value: 2 },
      uEnergy: { value: 0 },
      uCore: { value: new Color('#f4feff') },
      uTint: { value: new Color('#8fdcff') },
      uBody: { value: new Color('#1d63a6') },
      uDeep: { value: new Color('#04122b') },
      uRimeColor: { value: new Color('#cfe8f6') },
    }),
    vertexShader: ICE_VERTEX,
    fragmentShader: ICE_FRAGMENT,
  });
}

/* ==================================================================== */
/* The deep ice floor                                                     */
/* ==================================================================== */

const FLOOR_VERTEX = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float clock;
  uniform float progress;    // the frost radius, fraction of the zone
  uniform float fade;
  uniform float opacity;
  uniform float cracks;
  uniform float rimeAmount;
  uniform vec3  uDeep;
  uniform vec3  uBody;
  uniform vec3  uTint;
  uniform float uGlobalGlow;
  ${PULSE_GLOBALS_GLSL}
  varying vec2 vP;
  ${noiseGLSL}
  void main() {
    float r = length(vP);
    // Exactly the frost radius, with a ragged ice edge.
    float edgeN = fbm3(vec3(vP * 5.0 * uNoiseScale, 2.3)) * 0.06;
    float inside = 1.0 - smoothstep(progress - 0.03, progress + 0.005, r + edgeN);
    if (inside <= 0.001) discard;
    // Fracture plates: voronoi cells, their borders lighter.
    vec2 cell = voronoi2(vP * 4.2 * uNoiseScale + 1.7);
    float border = smoothstep(0.5, 0.78, cell.x) * cracks * uNoiseStrength;
    float plate = cell.y;
    vec3 color = mix(uDeep, uBody, 0.18 + 0.3 * plate);
    color = mix(color, uTint * 0.7, border * 0.55);
    // Drifted rime, strongest near the bell and at the fresh front.
    float drift = fbm3(vec3(vP * 2.4 * uNoiseScale, 7.1)) * 0.5 + 0.5;
    float front = exp(-abs(r - progress) * 18.0) * step(r, progress + 0.02);
    color = mix(color, uTint, clamp(smoothstep(0.62, 0.9, drift) * rimeAmount * 0.5 + front * 0.6, 0.0, 1.0));
    float alpha = inside * opacity * fade * uGlobalOpacity * (1.0 - smoothstep(0.92, 1.0, r));
    gl_FragColor = vec4(color * mix(1.0, uGlobalGlow, 0.3), alpha);
  }
`;

/* ==================================================================== */
/* Build / update                                                         */
/* ==================================================================== */

const _m = new Matrix4();
const _q = new Quaternion();
const _qTilt = new Quaternion();
const _pos = new Vector3();
const _scale = new Vector3();
const _axis = new Vector3();
const _up = new Vector3(0, 1, 0);
const _side = new Vector3();

export function createGlacierBody(root, resources) {
  const own = (x) => (resources.push(x), x);
  const group = new Group();
  group.visible = false;
  root.add(group);

  // The pivot hangs at the crown; the bell hangs from it.
  const pivot = new Group();
  group.add(pivot);
  const bellMaterial = own(createIceMaterial());
  const bell = new Mesh(own(glacierBodyBellGeometry()), bellMaterial);
  bell.layers.set(LAYER.SHAPED);
  bell.castShadow = true;
  bell.frustumCulled = false;
  pivot.add(bell);

  const spikeGeometry = own(glacierSpikeGeometry());
  const seeds = new Float32Array(MAX_SPIKES);
  for (let i = 0; i < MAX_SPIKES; i++) seeds[i] = hash(i * 5.31 + 0.7);
  spikeGeometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
  const spikeMaterial = own(createIceMaterial());
  spikeMaterial.uniforms.uDissolveFromLip.value = 0.6;
  const spikes = new InstancedMesh(spikeGeometry, spikeMaterial, MAX_SPIKES);
  spikes.layers.set(LAYER.SHAPED);
  spikes.castShadow = true;
  spikes.frustumCulled = false;
  spikes.count = 0;
  group.add(spikes);

  const floorMaterial = own(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: FrontSide,
      blending: NormalBlending,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      uniforms: pulseUniforms({
        clock: { value: 0 },
        progress: { value: 0 },
        fade: { value: 1 },
        opacity: { value: 0.8 },
        cracks: { value: 1 },
        rimeAmount: { value: 0.6 },
        uDeep: { value: new Color('#06172f') },
        uBody: { value: new Color('#164b80') },
        uTint: { value: new Color('#8fdcff') },
      }),
      vertexShader: FLOOR_VERTEX,
      fragmentShader: FLOOR_FRAGMENT,
    }),
  );
  const floor = new Mesh(own(floorGeometry()), floorMaterial);
  floor.layers.set(LAYER.VFX);
  floor.position.y = 0.012;
  // Under the shared rime seal, over the world floor.
  floor.renderOrder = -1;
  floor.frustumCulled = false;
  group.add(floor);

  // Per-spike dice: angle, radius, height, lean, yaw, width.
  const dice = new Float32Array(MAX_SPIKES * 6);
  for (let i = 0; i < dice.length; i++) dice[i] = hash(i * 1.618 + 11.3);
  return { group, pivot, bell, spikes, floor, dice };
}

/**
 * @param {object} b       the body from `createGlacierBody`
 * @param {object} s       { active, since, q, fade, clock, c, direction, energy, reduced }
 *   `since` is seconds since the bell landed (impact time + fade time),
 *   `q` the frost radius fraction (the hit rule), `fade` 1 … 0 over the exit.
 */
export function updateGlacierBody(b, s) {
  const c = s.c;
  b.group.visible = s.active;
  if (!s.active) return;
  const R = c.zoneRadius;
  const since = Math.max(0, s.since);
  const fade = s.fade;

  /* ---- the bell ---- */
  const lipR = Math.max(0.05, c.bellRadius * R);
  const tall = lipR * c.bellHeight / 1.7;
  // The drop: falls from `bellDrop` metres up, accelerating, on the landing frame.
  const dropT = Math.min(1, since / Math.max(0.01, c.bellDropTime));
  const drop = c.bellDrop * (1 - dropT * dropT);
  const crownY = c.bellHang + 1.7 * tall + drop;
  b.pivot.position.set(0, crownY, 0);
  b.bell.position.set(0, -1.7 * tall, 0);
  b.bell.scale.set(lipR, tall, lipR);
  // The swing: a decaying pendulum about the crown, across the line of sight.
  const swingT = Math.max(0, since - c.bellDropTime);
  const omega = TAU * Math.max(0.05, c.bellSwingRate);
  const amp = s.reduced ? 0 : c.bellSwing * Math.exp(-swingT * c.bellSwingDecay) * Math.min(1, swingT * 6);
  const angle = amp * Math.sin(omega * swingT);
  _axis.copy(s.direction).setY(0);
  if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);
  _axis.normalize();
  b.pivot.quaternion.setFromAxisAngle(_axis, angle);

  const bu = b.bell.material.uniforms;
  setIce(bu, c, s);
  // The lip quivers hardest just after landing and at each swing's turn.
  bu.uQuiver.value = s.reduced ? 0 : c.bellQuiver * Math.exp(-swingT * 1.4) * (0.4 + 0.6 * Math.abs(Math.cos(omega * swingT)));
  // The ring band runs lip → crown once per half swing.
  const halfPeriod = 0.5 / Math.max(0.05, c.bellSwingRate);
  const bandPhase = (swingT % halfPeriod) / halfPeriod;
  bu.uBand.value = since < c.bellDropTime ? -1 : bandPhase;
  bu.uBandGlow.value = c.bellRingBand * Math.exp(-swingT * 0.6) * fade;
  // Rime crawls up from the lip through the linger.
  bu.uRime.value = Math.min(1, c.bellRimeCrawl * Math.max(0, since - c.lifetime * 0.5) / Math.max(0.1, c.lifetime * 0.5 + c.fadeTime));
  const ds = Math.max(0.01, c.bellDissolveStart);
  bu.uDissolve.value = Math.min(1, Math.max(0, (ds - fade) / ds));

  /* ---- the glacier of spikes ---- */
  const n = Math.max(0, Math.min(MAX_SPIKES, Math.round(c.spikeCount)));
  const front = s.q * R;
  const grow = Math.max(0.01, c.spikeGrowTime);
  const exit = 1 - fade;
  b.spikes.count = n;
  for (let i = 0; i < n; i++) {
    const k = i * 6;
    const d = b.dice;
    // Golden-angle spread with radii from just outside the bell to the rim,
    // weighted outward so the crown of spikes is densest at the edge.
    const a = i * 2.39996 + d[k] * 0.5;
    const rf = c.spikeInner + (0.97 - c.spikeInner) * Math.sqrt((i + 0.5) / n) * (0.9 + 0.1 * d[k + 1]);
    const r = rf * R;
    // The front reaches this radius at (r / R) × lifetime: the hit rule.
    const reachedAt = (r / R) * c.lifetime;
    let h = 0;
    if (front >= r && since >= reachedAt) {
      const age = Math.min(1, (since - reachedAt) / grow);
      // Pops up past its seat, settles, then keeps creeping.
      const pop = 1 - Math.pow(1 - age, 3) + 0.12 * Math.sin(Math.PI * age);
      const creep = 1 + c.spikeCreep * Math.min(1, Math.max(0, since - reachedAt) / Math.max(0.2, c.lifetime + c.fadeTime));
      h = c.spikeHeight * (0.55 + 0.75 * d[k + 2]) * (0.6 + 0.5 * rf) * pop * creep;
    }
    const sink = c.spikeHeight * c.spikeSink * exit * exit;
    const w = c.spikeWidth * (0.7 + 0.6 * d[k + 5]) * (h > 0 ? 1 : 0);
    _pos.set(Math.cos(a) * r, -sink, Math.sin(a) * r);
    // Lean away from the centre.
    _side.set(-Math.sin(a), 0, Math.cos(a));
    _qTilt.setFromAxisAngle(_side, -(c.spikeLean * (0.6 + 0.8 * d[k + 3])));
    _q.setFromAxisAngle(_up, d[k + 4] * TAU);
    _qTilt.multiply(_q);
    _scale.set(Math.max(1e-4, w * 2), Math.max(1e-4, h), Math.max(1e-4, w * 2));
    _m.compose(_pos, _qTilt, _scale);
    b.spikes.setMatrixAt(i, _m);
  }
  b.spikes.instanceMatrix.needsUpdate = true;
  const su = b.spikes.material.uniforms;
  setIce(su, c, s);
  su.uQuiver.value = 0;
  su.uBand.value = -1;
  su.uRime.value = bu.uRime.value * 0.8;
  su.uDissolve.value = Math.min(1, Math.max(0, (0.7 - fade) / 0.7));

  /* ---- the deep ice floor ---- */
  b.floor.scale.set(R, 1, R);
  const fu = b.floor.material.uniforms;
  fu.clock.value = s.clock;
  fu.progress.value = s.q;
  fu.fade.value = Math.min(1, fade * 1.6);
  fu.opacity.value = c.floorOpacity;
  fu.cracks.value = c.floorCracks;
  fu.rimeAmount.value = c.floorRime;
  fu.uDeep.value.set(c.iceDeep);
  fu.uBody.value.set(c.iceBody);
  fu.uTint.value.set(c.iceTint);
}

function setIce(u, c, s) {
  u.clock.value = s.clock;
  u.uFacet.value = c.bellFacet;
  u.uCrackGlow.value = c.bellCrackGlow;
  u.uSpecular.value = c.bellSpecular;
  u.uEnergy.value = s.energy;
  u.uCore.value.set(c.iceCore);
  u.uTint.value.set(c.iceTint);
  u.uBody.value.set(c.iceBody);
  u.uDeep.value.set(c.iceDeep);
  u.uRimeColor.value.set(c.rimeColor);
}
