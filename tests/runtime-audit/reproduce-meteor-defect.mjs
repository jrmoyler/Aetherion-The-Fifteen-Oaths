/** Reproduce the inherited sandbox wiring bug using its actual public factory. */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {PerspectiveCamera,Vector3} from '../../runtime/ability-matrix/node_modules/three/build/three.module.js';
import {Environment} from '../../runtime/ability-matrix/packs/sandbox/src/world/Environment.js';
import {LightPool} from '../../runtime/ability-matrix/packs/sandbox/src/effects/LightPool.js';
import {CameraShake} from '../../runtime/ability-matrix/packs/sandbox/src/effects/CameraShake.js';
import {ScreenFlash} from '../../runtime/ability-matrix/packs/sandbox/src/effects/ScreenFlash.js';
import {SandboxCharacter} from '../../runtime/ability-matrix/packs/sandbox/src/sandbox/SandboxCharacter.js';
import {DummyField} from '../../runtime/ability-matrix/packs/sandbox/src/combat/DummyField.js';
import {settings} from '../../runtime/ability-matrix/packs/sandbox/src/config/settings.js';
import {frame} from '../../runtime/ability-matrix/packs/sandbox/src/core/FrameUniforms.js';
import {create} from '../../runtime/ability-matrix/packs/sandbox/src/vendor/runtimes/linear.js';
const camera=new PerspectiveCamera(),environment=new Environment(null,camera),scene=environment.scene;
const host={scene,camera,environment,lights:new LightPool(scene),shake:new CameraShake({shakeOffset:new Vector3(),shakeRoll:0}),flash:new ScreenFlash(),character:new SandboxCharacter(environment),dummies:new DummyField(environment),settings,frame};
const runtime=await create(host);
let error=null,steps=0;
try{runtime.cast('meteor',new Vector3(),new Vector3(0,0,1),12);for(;steps<300;steps++){frame.uTime.value=steps/30;runtime.update(1/30,1/30);runtime.afterBodies(1/30,steps/30);}}
catch(e){error=e.stack;}
finally{runtime.dispose();host.lights.dispose();host.character.dispose();host.dummies.dispose();environment.dispose();}
const report={factory:'packs/sandbox/src/vendor/runtimes/linear.js#create',ability:'linear/meteor',stepsBeforeFailure:steps,hasFissuresInRuntimeContext:'fissures' in runtime.ctx,status:error?.includes("reading 'spawn'")?'confirmed-source-defect':'unexpected-result',error,explanation:'MeteorAbility.onImpact requires ctx.fissures.spawn. The standalone linear App constructs FissureSystem; sandbox/createRuntime omits it. No source changes or replacement gameplay services were used.'};
fs.writeFileSync(fileURLToPath(new URL('../../validation/meteor-source-defect.json',import.meta.url)),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exitCode=error?1:0;
