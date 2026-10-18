import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  ExtrudeGeometry,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Shape,
  Sphere,
  Vector3
} from 'three';

/**
 * Rune Meteor — the procedural meshes the star and its henge are drawn with.
 *
 * The stone and the crystal are real meshes built at unit size and scaled by
 * their transforms. The rune bands, the light beams and the floor sigil are
 * built in parameter space and placed by their vertex stages from uniforms
 * (or per-instance attributes), so every size is a live slider.
 */

const BIG = () => new Sphere(new Vector3(), 1e4);

function gridIndices(cols, rows) {
  const out = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let k = 0;
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      out[k++] = a; out[k++] = c; out[k++] = b;
      out[k++] = b; out[k++] = c; out[k++] = d;
    }
  }
  return out;
}

/**
 * A rune-stone: a pointed slab, base on y = 0, 1 wide, 1 tall, 1 deep
 * (z −0.5..0.5), faces ±z carry the runes. Slightly bevelled so the sun
 * catches its edges.
 */
export function createStoneGeometry() {
  const shape = new Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0.44, 0.74);
  shape.lineTo(0.08, 1.0);
  shape.lineTo(-0.12, 0.97);
  shape.lineTo(-0.46, 0.7);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.9,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.035,
    bevelSegments: 1,
    curveSegments: 1
  });
  geometry.translate(0, 0, -0.45);
  geometry.computeVertexNormals();
  geometry.boundingSphere = BIG();
  return geometry;
}

/**
 * Instanced stones: the stone mesh plus per-instance glow, crumble and seed.
 * The matrices live in an `instanceMatrix`-style attribute the material reads.
 */
export function createStoneInstances(max) {
  const base = createStoneGeometry();
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(base.getIndex());
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('normal', base.getAttribute('normal'));
  const m0 = new InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(DynamicDrawUsage);
  const m1 = new InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(DynamicDrawUsage);
  const m2 = new InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(DynamicDrawUsage);
  const m3 = new InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(DynamicDrawUsage);
  const state = new InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(DynamicDrawUsage);
  geometry.setAttribute('aM0', m0);
  geometry.setAttribute('aM1', m1);
  geometry.setAttribute('aM2', m2);
  geometry.setAttribute('aM3', m3);
  geometry.setAttribute('aState', state);
  geometry.instanceCount = max;
  geometry.boundingSphere = BIG();
  base.dispose();
  return geometry;
}

/** The crystal star: an icosahedron, non-indexed so every facet is flat. */
export function createOrbGeometry() {
  const geometry = new IcosahedronGeometry(1, 1);
  geometry.boundingSphere = BIG();
  return geometry;
}

/** A band (`x` 0..1 round, `y` −1..1 across): a rune ring round the star. */
export function createBandGeometry(around = 96) {
  const cols = around + 1;
  const positions = new Float32Array(cols * 2 * 3);
  let p = 0;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / around;
      positions[p++] = j * 2 - 1;
      positions[p++] = 0;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(gridIndices(cols, 2), 1));
  geometry.boundingSphere = BIG();
  return geometry;
}

/**
 * Light beams, instanced: a ribbon (`x` 0..1 from A to B, `y` −1..1 across)
 * per instance, with per-instance ends, width and intensity.
 */
export function createBeamInstances(max, segments = 24) {
  const cols = segments + 1;
  const positions = new Float32Array(cols * 2 * 3);
  let p = 0;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < cols; i++) {
      positions[p++] = i / segments;
      positions[p++] = j * 2 - 1;
      positions[p++] = 0;
    }
  }
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(gridIndices(cols, 2), 1));
  geometry.setAttribute('aA', new InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute('aB', new InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute('aBeam', new InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(DynamicDrawUsage));
  geometry.instanceCount = max;
  geometry.boundingSphere = BIG();
  return geometry;
}

/** A unit quad, ±1 in XY: the sigil and the warp. */
export function createQuadGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.boundingSphere = BIG();
  return geometry;
}
