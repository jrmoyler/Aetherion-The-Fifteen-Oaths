import { BufferGeometry, Float32BufferAttribute, PlaneGeometry } from 'three';

/**
 * Quartz Spire — procedural geometry.
 *
 * A natural quartz point: a six-sided prism capped by a six-faced pyramidal
 * termination. Real quartz is never a regular hexagon — three alternate faces
 * are broader than the other three (the r and z rhombohedra) — so the prism's
 * corners sit at alternating radii, which is what keeps the crystal from
 * reading as a pencil. Unit sized: radius 1, base at y = `-foot`, termination
 * apex at y = 1. Non-indexed so every face is flat, with:
 *
 *   - `aPart`  0 = prism face, 1 = termination face, 2 = buried foot
 *   - `aFace`  0..5, which of the six faces (the shader tints alternate faces)
 *   - `aEdge`  0..1 across the face (0 and 1 on its two arrises), so the shader
 *              can draw bright edges without derivatives of the instance scale
 *
 * @param {number} tipLength  share of the unit height that is termination (0.05..0.8)
 * @param {number} asymmetry  0 = regular hexagon, 1 = strongly alternating faces
 */
export function createQuartzPointGeometry(tipLength = 0.32, asymmetry = 0.35) {
  const tip = Math.min(0.8, Math.max(0.05, tipLength));
  const shoulder = 1 - tip;
  const foot = 0.35;
  const pos = [];
  const part = [];
  const face = [];
  const edge = [];

  const cx = new Array(6);
  const cz = new Array(6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    // Alternating corner radii make alternate faces broad and narrow.
    const r = 1 + (i % 2 === 0 ? 1 : -1) * 0.18 * asymmetry;
    cx[i] = Math.cos(a) * r;
    cz[i] = Math.sin(a) * r;
  }

  const push = (x, y, z, p, f, e) => {
    pos.push(x, y, z);
    part.push(p);
    face.push(f);
    edge.push(e);
  };

  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    // Prism face: two triangles from the buried foot to the shoulder.
    push(cx[i], -foot, cz[i], 2, i, 0);
    push(cx[j], shoulder, cz[j], 0, i, 1);
    push(cx[j], -foot, cz[j], 2, i, 1);
    push(cx[i], -foot, cz[i], 2, i, 0);
    push(cx[i], shoulder, cz[i], 0, i, 0);
    push(cx[j], shoulder, cz[j], 0, i, 1);
    // Termination face: shoulder edge up to the apex.
    push(cx[i], shoulder, cz[i], 1, i, 0);
    push(0, 1, 0, 1, i, 0.5);
    push(cx[j], shoulder, cz[j], 1, i, 1);
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new Float32BufferAttribute(part, 1));
  g.setAttribute('aFace', new Float32BufferAttribute(face, 1));
  g.setAttribute('aEdge', new Float32BufferAttribute(edge, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** A unit quad for the floor disc and the tip flare (−1..1 in XY). */
export function createQuartzQuadGeometry() {
  return new PlaneGeometry(2, 2, 1, 1);
}
