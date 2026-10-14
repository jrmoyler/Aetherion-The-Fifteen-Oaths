import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {frameCamera,referencesForAsset,showReference,comparisonBounds} from '../comparison.mjs';
import {normalizeManifest} from '../catalog.mjs';
test('orthographic framing preserves meter scale and world-axis direction',()=>{
 const camera=new THREE.OrthographicCamera();const target=frameCamera(camera,{preset:'side',center:[2,3,4],height:2,aspect:1.5,offset:.2});
 assert.equal(camera.right-camera.left,3);assert.equal(camera.top-camera.bottom,2);assert.deepEqual(target.toArray(),[2,3.2,4]);assert.ok(camera.position.x>2);assert.equal(camera.position.z,4);
 assert.throws(()=>frameCamera(camera,{preset:'front',center:[0,0,0],height:0,aspect:1}));
});
test('view-group rotation changes world bounds without changing source mesh coordinates',()=>{
 const geometry=new THREE.BoxGeometry(1,4,2),before=geometry.attributes.position.array.slice();const mesh=new THREE.Mesh(geometry),group=new THREE.Group();group.add(mesh);group.rotation.z=Math.PI/2;
 const size=new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());assert.ok(Math.abs(size.x-4)<1e-10);assert.ok(Math.abs(size.y-1)<1e-10);assert.deepEqual(geometry.attributes.position.array,before);assert.deepEqual(mesh.scale.toArray(),[1,1,1]);geometry.dispose();mesh.material.dispose();
});
test('asset and family reference correspondence is explicit and deduplicated',()=>{
 const row=normalizeManifest({referenceIds:['reference-061'],assets:[{id:'x',referenceIds:['reference-061','reference-113'],files:{glb:'x.glb'}}]},'manifest.json')[0];
 assert.deepEqual(row.referenceIds,['reference-061','reference-113']);assert.deepEqual(referencesForAsset(row,[{id:'reference-061'},{id:'reference-001'}]),[{id:'reference-061'}]);
});
test('reference replacement clears old source and ignores stale load event',()=>{
 const image={attrs:{},hidden:false,set src(value){this.attrs.src=value},removeAttribute(key){delete this.attrs[key]},getAttribute(key){return this.attrs[key]}};
 const link={removeAttribute(){}},description={};showReference(image,link,description,{id:'a',name:'A',url:'a.png'});const stale=image.onload;
 showReference(image,link,description,{id:'b',name:'B',url:'b.png'});stale();assert.equal(image.hidden,true);image.onload();assert.equal(image.hidden,false);showReference(image,link,description,null);assert.equal(image.hidden,true);assert.equal(image.attrs.src,undefined);
});

test('dirty parent rotation is measured before a renderer updates matrices',()=>{
 const group=new THREE.Group(),asset=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,4,2));asset.add(mesh);group.add(asset);
 comparisonBounds(group,asset);group.rotation.z=Math.PI/2;
 const size=comparisonBounds(group,asset).getSize(new THREE.Vector3());
 assert.ok(Math.abs(size.x-4)<1e-10);assert.ok(Math.abs(size.y-1)<1e-10);
 mesh.geometry.dispose();mesh.material.dispose();
});
test('first framing uses the resized viewport aspect',()=>{
 const camera=new THREE.OrthographicCamera();
 frameCamera(camera,{preset:'front',center:[0,0,0],height:4,aspect:1200/600});
 assert.equal(camera.right-camera.left,8);assert.equal(camera.top-camera.bottom,4);
});
