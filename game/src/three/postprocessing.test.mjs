import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera } from 'three';
import { createPostprocessing } from './postprocessing.js';
import { TIERS } from '../core/quality.js';

test('real Three pass constructors resize and release at every quality tier', () => {
 for (const [name,tier] of Object.entries(TIERS)) {
  const renderer={extensions:{has:()=>true},capabilities:{maxSamples:4},getPixelRatio:()=>1};
  const p=createPostprocessing(renderer,new Scene(),new PerspectiveCamera(),{...tier,name});
  assert.equal(p.features.ambientOcclusion,name==='high'||name==='ultra');
  assert.equal(p.features.bloom,name!=='low');
  p.resize(1280,720,1);p.resize(390,844,.6);
  assert.equal(p.depthTexture.image.width,117);assert.equal(p.depthTexture.image.height,253);
  p.dispose();
 }
});
test('unsupported float render targets fall back to the direct renderer', () => {
 let rendered=0;
 const renderer={extensions:{has:()=>false},render:()=>rendered++};
 const p=createPostprocessing(renderer,new Scene(),new PerspectiveCamera(),{...TIERS.high,name:'high'});
 assert.equal(p.enabled,false);assert.equal(p.features.ambientOcclusion,false);
 p.resize(1,1,1);p.render(.016);assert.equal(rendered,1);p.dispose();
});
