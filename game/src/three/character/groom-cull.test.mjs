import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, Vector3 } from 'three';
import { cullHead } from './groom.js';

function remnant() {
  const g = new BufferGeometry();
  const H = .23;
  const tri = [-.03,-.76*H,.12, .03,-.76*H,.12, 0,-.9*H,.15];
  g.setAttribute('position',new Float32BufferAttribute([...tri,...tri],3));
  g.setAttribute('skinIndex',new Uint16BufferAttribute([
    0,0,0,0, 0,0,0,0, 0,0,0,0,
    2,0,0,0, 2,0,0,0, 2,0,0,0,
  ],4));
  g.setAttribute('skinWeight',new Float32BufferAttribute([
    1,0,0,0, 1,0,0,0, 1,0,0,0,
    1,0,0,0, 1,0,0,0, 1,0,0,0,
  ],4));
  g.setIndex([0,1,2,3,4,5]);
  return {geometry:g,skeleton:{bones:[{name:'head'},{name:'neck'},{name:'spine'}]}};
}

test('Rime legacy beard geometry is culled without deleting lower costume triangles',()=>{
  const head=remnant(); cullHead(head,0,new Vector3(),.23,true);
  assert.equal(head.geometry.index.count,3);
  assert.deepEqual([...head.geometry.index.array],[3,4,5]);
});

test('non-bearded head does not strip lower attached equipment',()=>{
  const mesh=remnant(); cullHead(mesh,0,new Vector3(),.23,false);
  assert.equal(mesh.geometry.index.count,6);
});
