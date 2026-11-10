// Soft contact shadows for render tiers without shadow maps (phones, software GPUs).
// One shared disc geometry and material; each actor gets a mesh under its root, so bodies stop floating
// above the ground when the sun casts nothing.
import { CircleGeometry, Mesh, ShaderMaterial } from 'three';

let geometry = null, material = null;
function resources() {
  if (!geometry) { geometry = new CircleGeometry(1, 20); geometry.rotateX(-Math.PI / 2); }
  if (!material) {
    material = new ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec2 vUv; void main(){ float d=length(vUv-.5)*2.; float a=smoothstep(1.,.15,d)*.42; if(a<.01)discard; gl_FragColor=vec4(0.,0.,0.,a); }',
    });
  }
  return { geometry, material };
}
/** Adds a contact shadow under an actor root. Returns the mesh; it leaves the scene with the root. */
export function addContactShadow(actor, radius = .55) {
  const { geometry: g, material: m } = resources();
  const mesh = new Mesh(g, m);
  mesh.name = 'contact shadow'; mesh.renderOrder = 1; mesh.position.y = .03;
  // Roots carry the creature scale; divide it out so the disc follows the body's own footprint.
  const s = actor.root.scale.x || 1;
  mesh.scale.setScalar(Math.max(.35, radius) * 1.7 / s);
  actor.root.add(mesh);
  return mesh;
}
