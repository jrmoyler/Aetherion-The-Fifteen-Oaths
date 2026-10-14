import bpy,json,numpy as np,math,hashlib
from pathlib import Path
P=Path(__file__).resolve().parent;ID='kiln-ninja-ensemble-candidate';D=P/ID;report=[]
files=[('baseline-source',P/'baseline'/(ID+'.blend')),('candidate-source',D/(ID+'.blend'))]+[(s,D/(ID+s+'.glb')) for s in ['', '-lod1','-lod2']]
for label,file in files:
 if file.suffix=='.blend':bpy.ops.wm.open_mainfile(filepath=str(file))
 else:bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=24;bpy.ops.import_scene.gltf(filepath=str(file))
 rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');body=max([o for o in bpy.data.objects if o.type=='MESH'],key=lambda o:len(o.data.vertices));scene=bpy.context.scene;scene.render.fps=24;rig.animation_data_create();rig.animation_data.action=None
 for b in rig.pose.bones:b.rotation_mode='QUATERNION' if file.suffix=='.glb' else 'XYZ';b.rotation_quaternion=(1,0,0,0);b.rotation_euler=(0,0,0);b.location=(0,0,0)
 scene.frame_set(1);bpy.context.view_layer.update();mat=np.array(body.matrix_world);base=np.zeros(len(body.data.vertices)*3);body.data.vertices.foreach_get('co',base);base=base.reshape(-1,3)@mat[:3,:3].T+mat[:3,3]
 subsets={}
 for side,sign in [('L',1),('R',-1)]:
  subsets['dominantFoot'+side]=[v.index for v in body.data.vertices if any(body.vertex_groups[g.group].name=='foot.'+side and g.weight>.5 for g in v.groups)]
  subsets['completeShoeRegion'+side]=np.flatnonzero((base[:,2]<=.25)&(base[:,0]*sign>0)).tolist()
 rows=[];endpoints={}
 for name,duration in [('idle_breath',48),('walk_in_place',32),('cast_release',48)]:
  actions=[a for a in bpy.data.actions if name in a.name];assert actions,(label,name,[a.name for a in bpy.data.actions]);rig.animation_data.action=actions[0]
  frames=[1+i/32 for i in range(993)] if name=='walk_in_place' else list(range(1,duration+1))
  for frame in frames:
   scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update();ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();co=np.zeros(len(me.vertices)*3);me.vertices.foreach_get('co',co);co=co.reshape(-1,3)@mat[:3,:3].T+mat[:3,3];ev.to_mesh_clear();mins={k:float(co[ids,2].min()) for k,ids in subsets.items()};z=float(co[:,2].min());rows.append({'clip':name,'frame':frame,'wholeMeshMinimumWorldZ':z,'wholeMeshFloorClearance':z-.012,'subsetMinimumWorldZ':mins,'verticesBelowFloor':int((co[:,2]<.012-1e-6).sum())})
   if name=='walk_in_place' and frame in [1,32]:endpoints[frame]=co.copy()
  print('CHECKED',label,name,len(frames),flush=True)
 worst=min(rows,key=lambda r:r['wholeMeshFloorClearance']);walk=[r for r in rows if r['clip']=='walk_in_place'];result={'label':label,'file':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'floorWorldZ':.012,'subsetCounts':{k:len(v) for k,v in subsets.items()},'evaluatedCount':len(rows),'all128IntegerFramesIncluded':True,'walkStepFrames':1/32,'worst':worst,'walkMinClearance':min(r['wholeMeshFloorClearance'] for r in walk),'walkMaxSupportClearance':max(r['wholeMeshFloorClearance'] for r in walk),'walkPenetratingSamples':sum(r['verticesBelowFloor']>0 for r in walk),'loopEndpointMaximumVertexDeltaMeters':float(np.linalg.norm(endpoints[1]-endpoints[32],axis=1).max()),'samples':rows};report.append(result);(P/'ground-checks.json').write_text(json.dumps(report,indent=2)+'\n');print('RESULT',label,result['walkMinClearance'],result['walkMaxSupportClearance'],result['loopEndpointMaximumVertexDeltaMeters'],flush=True)
