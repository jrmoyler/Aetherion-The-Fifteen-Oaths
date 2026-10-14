import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CellResidency,EventInstance,createWorldIndex} from './audited-index.mjs';
const base='/workspace/Aetherion-The-Fifteen-Oaths/AETHERION_CANON/21_WORLD_CONSTRUCTION_PHASE_II/';
const read=n=>JSON.parse(readFileSync(base+n));const c=read('WORLD_EVENT_REGISTRY.json').records[0];
const sockets=Object.fromEntries(c.success_predicate.split(' AND ').flatMap(term=>{const[n,t]=term.split(' == ');return Array.from({length:t==='true'?1:Number(t)},(_,i)=>[`${n}-${i}`,n]);}));
const gates=t=>({checkedAtMs:t,catchmentLease:true,protectedRoutes:true});
const instance=()=>new EventInstance(c,{instanceId:'independent',nowMs:0,sockets});
const response=e=>{e.tick(120000,gates(120000));e.tick(150000,gates(150000));};
const observations={sourceSHA256:createHash('sha256').update(readFileSync(new URL('./audited-index.mjs',import.meta.url))).digest('hex')};
{
 let m,replacement;const callbacks=[];
 m=new CellResidency(key=>{if(key==='A'){replacement=m.request('replacement','v1');m.acquire(replacement,'B');}callbacks.push({key,usersAtDisposal:m.resourceUsers(key)});});
 const t=m.request('original','v1');m.acquire(t,'A');m.acquire(t,'B');m.retire(t);
 observations.reentrantDisposal={callbacks,replacement:m.state('replacement'),usersB:m.resourceUsers('B')};
}
{
 const a=new CellResidency(),b=new CellResidency();const at=a.request('same-cell','revision1');b.request('same-cell','revision1');b.acquire(at,'foreign-resource');const retired=b.retire(at);
 observations.foreignManagerToken={retired,otherManagerCell:b.state('same-cell')};
}
{
 const e=instance();response(e);const request={receiptId:'r1',socketId:'vent_count-0',accountId:'a',nowMs:150001,gates:gates(150001)};
 e.contribute(request);e.contribute({receiptId:'r2',socketId:'vent_count-1',accountId:'a',nowMs:150002,gates:gates(150002)});
 try{observations.replayedReceipt={returned:e.contribute(request)};}catch(error){observations.replayedReceipt={error:error.message,retainedReceipts:e.snapshot().receipts.length};}
}
{
 const e=instance();response(e);let error;
 try{e.contribute({receiptId:'r1',socketId:'vent_count-0',accountId:'a',nowMs:150001,gates:{...gates(150001),protectedRoutes:false}});}catch(e){error=e.message;}
 observations.failedSafetyContribution={error,phase:e.snapshot().phase,outcome:e.snapshot().outcome};
}
{
 const e=new EventInstance(c,{instanceId:'huge-clock',nowMs:1e308,sockets});const s=e.snapshot();observations.hugeClock={entered:s.enteredMs,deadline:s.deadlineMs,effectiveForecastDuration:s.deadlineMs-s.enteredMs,authoredDuration:c.phases[0].duration_ms};
}
{
 const graph=read('WORLD_REGION_GRAPH.json'),poi=read('WORLD_POI_REGISTRY.json');graph.baseline_poi_manifest=Array.from({length:63},()=>structuredClone(graph.baseline_poi_manifest[0]));observations.duplicateBaseline={accepted:createWorldIndex(graph,poi).counts};
}
writeFileSync(new URL('./observations.json',import.meta.url),JSON.stringify(observations,null,2)+'\n');console.log(JSON.stringify(observations,null,2));
