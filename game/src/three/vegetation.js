import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original geometry: branching silhouettes remain readable at gameplay distance.
// Shared geometry + per-chunk instancing bounds draw calls independently of density.
export function branchingTrunk(low = false) {
  const pieces = [], up = new THREE.Vector3(0, 1, 0);
  function limb(start, end, radius) {
    const vector = end.clone().sub(start), length = vector.length();
    const g = new THREE.CylinderGeometry(radius * .32, radius, length, low ? 5 : 7);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, vector.normalize()));
    g.translate(...start.clone().add(end).multiplyScalar(.5).toArray()); pieces.push(g);
  }
  limb(new THREE.Vector3(0, -4, 0), new THREE.Vector3(.2, 4, .1), .46);
  for (let i = 0; i < (low ? 5 : 9); i++) {
    const angle = i * 2.39996, y = -.4 + i * .42;
    const start = new THREE.Vector3(.08, y, .02);
    const end = new THREE.Vector3(Math.cos(angle) * 2.2, y + 2.2, Math.sin(angle) * 2.2);
    limb(start, end, .19 - i * .012);
    if (!low) limb(end.clone().lerp(start, .3), end.clone().add(new THREE.Vector3(Math.sin(angle) * .65, .8, Math.cos(angle) * .65)), .065);
  }
  // Root flare gives trunks contact with the soil rather than a cylinder end.
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * .4;
    limb(new THREE.Vector3(0, -3.2, 0), new THREE.Vector3(Math.cos(a) * 1.15, -4, Math.sin(a) * 1.15), .2);
  }
  const merged = mergeGeometries(pieces); pieces.forEach(g => g.dispose()); return merged;
}

export function grassClump(low = false) {
  const vertices = [], count = low ? 5 : 9;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996, x = Math.cos(angle) * .3, z = Math.sin(angle) * .3;
    const width = .045 + (i % 3) * .012, height = .45 + (i % 5) * .13;
    const dx = Math.cos(angle) * width, dz = Math.sin(angle) * width;
    const bendX = Math.cos(angle) * .18, bendZ = Math.sin(angle) * .18;
    const a = [x-dx,0,z-dz], b=[x+dx,0,z+dz];
    const c=[x+bendX-dx*.5,height*.65,z+bendZ-dz*.5],d=[x+bendX+dx*.5,height*.65,z+bendZ+dz*.5];
    const tip=[x+bendX*1.8,height,z+bendZ*1.8];
    vertices.push(...a,...b,...c,...b,...d,...c,...c,...d,...tip);
  }
  const g = new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
}

export function coniferCrown(low = false) {
  const pieces=[];
  for(let tier=0;tier<5;tier++) {
    const radius=1.6-tier*.23;
    const g=new THREE.ConeGeometry(radius,2.2,low?6:9,1,true);
    // Offset tier orientation prevents a single faceted cone silhouette.
    g.rotateY(tier*.71);g.translate(0,tier*.64-1.2,0);pieces.push(g);
  }
  const g=mergeGeometries(pieces);pieces.forEach(p=>p.dispose());return g;
}
