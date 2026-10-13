import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * The Emberveil cage, in *parameter space*.
 *
 * Every strand of the lattice is one tube, and every tube is built here exactly
 * once — as numbers, not positions. A vertex carries:
 *
 *   - `position.x` — `s`, 0..1 along the strand, floor anchor to floor anchor;
 *   - `position.yz` — (cos θ, sin θ) round the tube's cross-section;
 *   - `aStrand` — which strand it belongs to.
 *
 * The strand material walks the path itself (`LATTICE_GLSL#latticePoint`),
 * builds a frame from finite differences and inflates the tube in its vertex
 * stage, so the dome's radius, height, sweep, weave and the contraction at the
 * end are all uniforms and nothing is ever rebuilt. That is also why the meshes
 * are never culled: the bounding volume of a parameter buffer is meaningless.
 *
 * The path is a woven dome. Strands come in two families that sweep round the
 * circle in opposite senses as they arch over it, so they cross each other
 * like the withies of a basket; a radial weave term pushes alternate crossings
 * in and out so the families pass over and under instead of intersecting.
 *
 * `latticePoint` below is the same function in JavaScript — the ability uses it
 * to drip embers off the exact strands the GPU draws. Keep the two in step.
 *
 * @param {number} strands  maximum strands per cast (the editor clamps to it)
 * @param {number} segments rings along each strand
 * @param {number} sides    vertices round each ring
 */
export function createLatticeGeometry(strands = 24, segments = 96, sides = 8) {
  const ring = sides + 1; // seam duplicated so uv.y can run 0..1
  const perStrand = (segments + 1) * ring;
  const vertexCount = strands * perStrand;

  const positions = new Float32Array(vertexCount * 3);
  const strandIds = new Float32Array(vertexCount);
  const uvs = new Float32Array(vertexCount * 2);
  const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(strands * segments * sides * 6);

  let v = 0;
  let k = 0;
  for (let i = 0; i < strands; i++) {
    const base = i * perStrand;
    for (let j = 0; j <= segments; j++) {
      // Rings crowd toward the anchors: the strand bends hardest where it
      // leaves the floor, and that is where the tessellation is spent.
      const t = j / segments;
      const s = 0.5 - 0.5 * Math.cos(Math.PI * t);
      for (let q = 0; q <= sides; q++) {
        const a = (q / sides) * Math.PI * 2;
        positions[v * 3] = s;
        positions[v * 3 + 1] = Math.cos(a);
        positions[v * 3 + 2] = Math.sin(a);
        strandIds[v] = i;
        uvs[v * 2] = s;
        uvs[v * 2 + 1] = q / sides;
        v++;
      }
    }
    for (let j = 0; j < segments; j++) {
      for (let q = 0; q < sides; q++) {
        const a = base + j * ring + q;
        const b = a + ring;
        indices[k++] = a;
        indices[k++] = b;
        indices[k++] = a + 1;
        indices[k++] = a + 1;
        indices[k++] = b;
        indices[k++] = b + 1;
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aStrand', new BufferAttribute(strandIds, 1));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/**
 * The lattice path — shared by the strand, the flame sheath and the scorched
 * floor (which lights a pool under every anchor). Declares its own uniforms;
 * `syncLatticeUniforms` fills them from one state object.
 */
export const LATTICE_GLSL = /* glsl */ `
  uniform vec3  uCentre;
  uniform float uCount;      // live strands
  uniform float uRadius;     // floor radius of the dome, metres
  uniform float uHeight;     // dome height, metres
  uniform float uApex;       // highest elevation a strand reaches, radians
  uniform float uArch;       // <1 steep walls and a flat crown, >1 a pointed one
  uniform float uSweep;      // radians a strand travels round the circle
  uniform float uCrossings;  // over/under alternations along a strand
  uniform float uWeave;      // how far the over/under pushes, × radius
  uniform float uRot;        // the whole cage's turn, radians
  uniform float uSway;       // radians of lazy writhing
  uniform float uSwaySpeed;
  uniform float uShrink;     // radius multiplier — the contraction
  uniform float uSquash;     // height multiplier — the collapse

  float latticeHash(float i) {
    return fract(sin(i * 12.9898 + 4.1414) * 43758.5453);
  }

  vec3 latticePoint(float i, float s, float time) {
    float fam = mod(i, 2.0);
    float sgn = fam < 0.5 ? 1.0 : -1.0;
    float per = max(1.0, ceil(uCount * 0.5));
    float k = floor(i * 0.5);
    float a0 = uRot + (k + fam * 0.5) / per * 6.28318530718;
    float arch = pow(max(sin(3.14159265359 * s), 0.0), uArch);
    float e = uApex * arch;
    float a = a0 + sgn * uSweep * (s - 0.5)
            + uSway * sin(time * uSwaySpeed + i * 1.7 + s * 5.0) * arch;
    float w = 1.0 + uWeave * sin(3.14159265359 * uCrossings * s + fam * 3.14159265359) * arch;
    float r = uRadius * uShrink * w * cos(e);
    return uCentre + vec3(cos(a) * r, uHeight * uSquash * sin(e), sin(a) * r);
  }
`;

/** JavaScript twin of `latticeHash`. */
export function latticeHash(i) {
  const x = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * JavaScript twin of `latticePoint`.
 * @param {object} p the same state object handed to `syncLatticeUniforms`
 */
export function latticePoint(i, s, time, p, out) {
  const fam = i % 2;
  const sgn = fam === 0 ? 1 : -1;
  const per = Math.max(1, Math.ceil(p.count * 0.5));
  const k = Math.floor(i * 0.5);
  const a0 = p.rot + ((k + fam * 0.5) / per) * Math.PI * 2;
  const arch = Math.pow(Math.max(Math.sin(Math.PI * s), 0), p.arch);
  const e = p.apex * arch;
  const a = a0 + sgn * p.sweep * (s - 0.5) + p.sway * Math.sin(time * p.swaySpeed + i * 1.7 + s * 5) * arch;
  const w = 1 + p.weave * Math.sin(Math.PI * p.crossings * s + fam * Math.PI) * arch;
  const r = p.radius * p.shrink * w * Math.cos(e);
  out.set(p.centre.x + Math.cos(a) * r, p.height * p.squash * Math.sin(e), p.centre.z + Math.sin(a) * r);
  return out;
}

/** The uniform boxes `LATTICE_GLSL` declares, with neutral values. */
export function latticeUniforms() {
  return {
    uCentre: { value: new Vector3() },
    uCount: { value: 0 },
    uRadius: { value: 4 },
    uHeight: { value: 3 },
    uApex: { value: 1.2 },
    uArch: { value: 0.8 },
    uSweep: { value: 2 },
    uCrossings: { value: 6 },
    uWeave: { value: 0.04 },
    uRot: { value: 0 },
    uSway: { value: 0 },
    uSwaySpeed: { value: 1 },
    uShrink: { value: 1 },
    uSquash: { value: 1 }
  };
}

/** Copy one lattice state object into a material's uniform boxes. */
export function syncLatticeUniforms(u, p) {
  u.uCentre.value.copy(p.centre);
  u.uCount.value = p.count;
  u.uRadius.value = p.radius;
  u.uHeight.value = p.height;
  u.uApex.value = p.apex;
  u.uArch.value = p.arch;
  u.uSweep.value = p.sweep;
  u.uCrossings.value = p.crossings;
  u.uWeave.value = p.weave;
  u.uRot.value = p.rot;
  u.uSway.value = p.sway;
  u.uSwaySpeed.value = p.swaySpeed;
  u.uShrink.value = p.shrink;
  u.uSquash.value = p.squash;
}
