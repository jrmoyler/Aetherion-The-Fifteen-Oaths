// Ground-projected actor shadows for tiers without shadow maps.
import { CircleGeometry, Mesh, ShaderMaterial, Vector3 } from 'three';

const UP = new Vector3(0, 1, 0);
const normal = new Vector3();
let geometry;
let owners = 0;

export function addContactShadow(actor, radius = .55) {
  if (!geometry) {
    geometry = new CircleGeometry(1, 20);
    geometry.rotateX(-Math.PI / 2);
  }
  owners++;
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    uniforms: { opacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform float opacity; varying vec2 vUv; void main(){ float d=length(vUv-.5)*2.; float a=(1.-smoothstep(.15,1.,d))*opacity; if(a<.01)discard; gl_FragColor=vec4(0.,0.,0.,a); }',
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'contact shadow'; mesh.renderOrder = 1; mesh.visible = false;
  actor.root.parent.add(mesh);
  let lastX, lastY, lastZ, ground, water, lastSample = -Infinity;
  let disposed = false;
  const footprint = Math.max(.35, radius) * 1.7;
  return {
    mesh,
    update(groundAt, waterAt, now, fade = 1) {
      if (!actor.visible || !actor.root.visible || fade <= 0) { mesh.visible = false; return; }
      const { x, y, z } = actor.root.position;
      // Cache static actors; periodically catch streamed platforms appearing under them.
      if (x !== lastX || y !== lastY || z !== lastZ || now - lastSample >= .25) {
        ground = groundAt(x, z, y, .06);
        if (now - lastSample >= .15 || Math.hypot(x - lastX, z - lastZ) > .65 || Math.abs(ground - (mesh.position.y - .03)) > .28) {
          const probe = .25;
          const dx = (groundAt(x + probe, z, ground, .4) - ground) / probe;
          const dz = (groundAt(x, z + probe, ground, .4) - ground) / probe;
          // A sample across a platform lip is a drop, not the receiving plane's slope.
          const slopeX = Math.abs(dx) <= 1.5 ? dx : 0;
          const slopeZ = Math.abs(dz) <= 1.5 ? dz : 0;
          normal.set(-slopeX, 1, -slopeZ).normalize();
          mesh.quaternion.setFromUnitVectors(UP, normal);
          water = waterAt(x, z);
          lastSample = now;
        }
        lastX = x; lastY = y; lastZ = z;
      }
      const height = Math.max(0, y - ground);
      const coverage = Math.max(0, 1 - height / (3 + footprint));
      const shore = Math.max(0, Math.min(1, (ground - water) / .25));
      material.uniforms.opacity.value = .42 * coverage * coverage * shore * fade;
      mesh.visible = material.uniforms.opacity.value >= .01;
      mesh.position.set(x, ground + .03, z);
      mesh.scale.setScalar(footprint * (1 + (1 - coverage) * .3));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      material.dispose();
      if (--owners === 0) { geometry.dispose(); geometry = null; }
    },
  };
}
