import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderLifecycle, viewportSize, keyboardAction, bindMotionPreference } from '../browser-lifecycle.mjs';
function fixture() {
 const canvas=new EventTarget(),page=new EventTarget(),visibility=new EventTarget();visibility.hidden=false;
 const calls={start:0,stop:0,controls:null,states:[]};
 const runtime=new RenderLifecycle({canvas,page,visibility,start:()=>calls.start++,stop:()=>calls.stop++,setControlsEnabled:value=>{calls.controls=value;},onState:value=>calls.states.push(value)});
 return {canvas,page,visibility,calls,runtime};
}
function persisted(target,name){const event=new Event(name);event.persisted=true;target.dispatchEvent(event);}
test('context loss pauses rendering, requests recovery and restores exactly once',()=>{
 const f=fixture(),lost=new Event('webglcontextlost',{cancelable:true});f.canvas.dispatchEvent(lost);
 assert.equal(lost.defaultPrevented,true);assert.equal(f.calls.stop,1);assert.equal(f.calls.controls,false);
 f.canvas.dispatchEvent(new Event('webglcontextrestored'));assert.equal(f.calls.start,2);assert.equal(f.calls.controls,true);
 f.canvas.dispatchEvent(new Event('webglcontextrestored'));assert.equal(f.calls.start,2);f.runtime.dispose();
});
test('visibility and BFCache suspend without restarting a lost context',()=>{
 const f=fixture();f.visibility.hidden=true;f.visibility.dispatchEvent(new Event('visibilitychange'));assert.equal(f.calls.stop,1);
 f.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));f.visibility.hidden=false;f.visibility.dispatchEvent(new Event('visibilitychange'));assert.equal(f.calls.start,1);
 f.canvas.dispatchEvent(new Event('webglcontextrestored'));assert.equal(f.calls.start,2);persisted(f.page,'pagehide');assert.equal(f.calls.stop,2);persisted(f.page,'pageshow');assert.equal(f.calls.start,3);f.runtime.dispose();
});
test('DOM inspection focus gates camera without stopping scene rendering',()=>{
 const f=fixture();f.runtime.setUIActive(true);assert.equal(f.calls.controls,false);assert.equal(f.calls.stop,0);f.runtime.setUIActive(false);assert.equal(f.calls.controls,true);f.runtime.dispose();
});
test('failed or disposed renderer never restarts after a restore event',()=>{
 const f=fixture();f.runtime.fail();assert.equal(f.calls.states.at(-1),'failed');assert.equal(f.calls.stop,1);f.canvas.dispatchEvent(new Event('webglcontextrestored'));assert.equal(f.calls.start,1);f.runtime.dispose();f.runtime.dispose();f.visibility.dispatchEvent(new Event('visibilitychange'));assert.equal(f.calls.start,1);assert.equal(f.runtime.listeners.length,0);
});
test('resize rejects hidden/invalid dimensions and caps device pixel ratio',()=>{
 for(const pair of [[0,500],[500,0],[NaN,500],[500,Infinity],[-1,500]])assert.equal(viewportSize(...pair,2),null);
 assert.deepEqual(viewportSize(999.4,499.6,4),{width:999,height:500,pixelRatio:2});assert.equal(viewportSize(100,100,NaN).pixelRatio,1);
});
test('keyboard camera shortcuts never hijack form fields, Tab or browser chords',()=>{
 const canvas={},select={};assert.equal(keyboardAction({target:canvas,key:'ArrowLeft'},canvas),'left');assert.equal(keyboardAction({target:select,key:'ArrowLeft'},canvas),null);assert.equal(keyboardAction({target:canvas,key:'Tab'},canvas),null);assert.equal(keyboardAction({target:canvas,key:'f',ctrlKey:true},canvas),null);
});
test('reduced motion pauses clips and damping but permits explicit play opt-in',()=>{
 const media=new EventTarget();media.matches=true;const playing={checked:true},controls={};const dispose=bindMotionPreference(media,playing,controls);assert.equal(playing.checked,false);assert.equal(controls.enableDamping,false);playing.checked=true;media.matches=false;media.dispatchEvent(new Event('change'));assert.equal(controls.enableDamping,true);media.matches=true;media.dispatchEvent(new Event('change'));assert.equal(playing.checked,false);dispose();playing.checked=true;media.dispatchEvent(new Event('change'));assert.equal(playing.checked,true);
});
