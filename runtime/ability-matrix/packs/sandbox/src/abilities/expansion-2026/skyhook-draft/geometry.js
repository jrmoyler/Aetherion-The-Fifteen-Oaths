import {
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  PlaneGeometry,
  Shape,
  Sphere,
  Vector3,
} from 'three';

/**
 * Skyhook Draft — procedural geometry.
 *
 * Two of the three bodies of this cast are *parameter-space* meshes: the
 * buffers hold only where a vertex sits along and around a path, and the
 * vertex shader places it from the live settings every frame (see
 * `materials.js`). That is what makes the cast's placement derived rather than
 * tuned — drag the lane width and the hook's curl re-forms over the lane on
 * the next frame; lengthen the cast and the braid stretches to the hook.
 *
 *  - **the hook** — a tube along an authored shepherd's-crook path: a bowed
 *    stem, a half-circle curl that bends back over the lane, and a dropped
 *    barb. `uv.x` is arc length 0..1 base → tip, `uv.y` the angle round the
 *    tube. `hookPoint` is the same path in JS, so the bodies the draft hoists
 *    are delivered to exactly the tip the shader draws.
 *  - **the braid** — `count` ribbons, each a strip along the lane that
 *    converges and winds up the stem. `uv` is (along, across); `aRibbon` is
 *    (lane slot 0..1, phase seed, index, unused).
 *  - **the plates** — irregular bevelled floor slabs (real, lit, solid), torn
 *    up round the hook's foot.
 *  - **the quad** — the carrier for the floor scour and the lens.
 */

const TAU = Math.PI * 2;

/* ---------------------------------------------------------------------- */
/* The hook path (mirrored in GLSL: HOOK_PATH in materials.js)            */
/* ---------------------------------------------------------------------- */

/**
 * A point on the crook, in the hook's own frame: +x points *away* from the
 * caster (downstream), so the curl bends back over the lane at −x; y is up.
 * The stem foot is the origin.
 *
 * @param {number} s 0..1 along the whole path, foot → barb tip
 * @param {{height:number, curl:number, drop:number, bow:number}} p metres
 * @param {Vector3} out written in place (z = 0)
 */
export function hookPoint(s, p, out) {
  const H = Math.max(0.1, p.height);
  const R = Math.max(0.05, p.curl);
  const D = Math.max(0, p.drop);
  const total = H + Math.PI * R + D;
  let d = Math.min(1, Math.max(0, s)) * total;
  if (d < H) return out.set(p.bow * Math.sin((Math.PI * d) / H), d, 0);
  d -= H;
  const arc = Math.PI * R;
  if (d < arc) {
    const phi = d / R;
    return out.set(-R + R * Math.cos(phi), H + R * Math.sin(phi), 0);
  }
  d -= arc;
  return out.set(-2 * R, H - d, 0);
}

/**
 * The crook as a parameter-space tube.
 * @param {number} along segments along the path
 * @param {number} around segments round the tube
 */
export function createHookGeometry(along = 180, around = 22) {
  const positions = [];
  const uvs = [];
  const index = [];
  const at = new Vector3();
  const preview = { height: 4.2, curl: 1.1, drop: 0.7, bow: 0.2 };
  for (let i = 0; i <= along; i++) {
    const s = i / along;
    hookPoint(s, preview, at);
    for (let j = 0; j <= around; j++) {
      // The buffer position is only a preview of the default crook (for
      // bounds and tooling); the shader recomputes it from settings.
      const a = (j / around) * TAU;
      positions.push(at.x + Math.cos(a) * 0.3, at.y, at.z + Math.sin(a) * 0.3);
      uvs.push(s, j / around);
    }
  }
  const row = around + 1;
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * row + j, b = a + row;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  // Sized for the largest hook the sliders allow, hoisted.
  g.boundingSphere = new Sphere(new Vector3(0, 4, 0), 9);
  return g;
}

/* ---------------------------------------------------------------------- */
/* The braid                                                               */
/* ---------------------------------------------------------------------- */

/**
 * `count` parameter-space ribbons along the lane.
 * @param {number} count ribbons
 * @param {number} segments segments along each ribbon
 */
export function createBraidGeometry(count = 12, segments = 150) {
  const positions = [];
  const uvs = [];
  const ribbon = [];
  const index = [];
  let base = 0;
  for (let r = 0; r < count; r++) {
    const slot = count > 1 ? r / (count - 1) : 0.5;
    // Golden-angle phases: the ribbons wind up the stem evenly spaced.
    const phase = (r * 0.618034) % 1;
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      for (let k = 0; k < 2; k++) {
        positions.push(u * 10, 0.4, (slot - 0.5) * 2);
        uvs.push(u, k);
        ribbon.push(slot, phase, r, 0);
      }
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    base += (segments + 1) * 2;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setAttribute('aRibbon', new Float32BufferAttribute(ribbon, 4));
  g.setIndex(index);
  g.boundingSphere = new Sphere(new Vector3(9, 2, 0), 14);
  return g;
}

/* ---------------------------------------------------------------------- */
/* Torn floor plates                                                       */
/* ---------------------------------------------------------------------- */

/**
 * An irregular floor slab: a jittered heptagon extruded 9 cm with a bevel,
 * lying flat in XZ with its top face at y = 0. Unit size (~1 m across).
 */
export function createPlateGeometry() {
  const shape = new Shape();
  const corners = 7;
  for (let i = 0; i < corners; i++) {
    const a = (i / corners) * TAU + Math.sin(i * 12.9898) * 0.25;
    const r = 0.5 * (0.72 + 0.28 * Math.abs(Math.sin(i * 78.233 + 1.3)));
    const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.8;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new ExtrudeGeometry(shape, {
    depth: 0.09, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 1, curveSegments: 1,
  });
  // Shape lies in XY; extrusion runs +Z. Lay it flat with the top face up.
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.0, 0);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */
/* Carriers                                                                */
/* ---------------------------------------------------------------------- */

/**
 * A flat unit quad lying in XZ: x 0..1 downstream, z −0.5..0.5 across. The
 * floor scour and the lens are placed by scale so the quad spans the lane.
 */
export function createLaneQuad() {
  const g = new PlaneGeometry(1, 1, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0.5, 0, 0);
  return g;
}
