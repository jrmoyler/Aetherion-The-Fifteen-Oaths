import bpy,json,hashlib,numpy as np
from pathlib import Path
from mathutils.bvhtree import BVHTree
P=Path('/workspace/scratch/ninja-v16/kiln-ninja-ensemble-candidate/kiln-ninja-ensemble-candidate.blend');O=Path(__file__).parent;bpy.ops.wm.open_mainfile(filepath=str(P));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');body=bpy.data.objects['Kiln_ninja_weighted_lowpoly'];new=[o for o in bpy.data.objects if o.get('v16_component')];scene=bpy.context.scene;rows=[];restlocal={};component=[]
for ob in new:
 mesh=ob.data;mesh.calc_loop_triangles();uv=mesh.uv_layers.active;bad=0
 for t in mesh.loop_triangles:
  a,b,c=[uv.data[i].uv for i in t.loops];bad+=abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))<1e-12
 component.append({'name':ob.name,'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),'collapsedUvTriangles':bad,'allWeightsForearmL':all(len(v.groups)==1 and ob.vertex_groups[v.groups[0].group].name=='forearm.L' and abs(v.groups[0].weight-1)<1e-8 for v in mesh.vertices)})
for track in rig.animation_data.nla_tracks:track.mute=True
for name,end in [('idle_breath',48),('walk_in_place',32),('cast_release',48)]:
 rig.animation_data.action=bpy.data.actions[name];frames=[1+i/32 for i in range(993)] if name=='walk_in_place' else list(range(1,end+1))
 for f in frames:
  scene.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();boneinv=(rig.matrix_world@rig.pose.bones['forearm.L'].matrix).inverted();minimum=float('inf');newmin=float('inf');rigiderr=0.;contacts=[]
  ev=body.evaluated_get(deps);me=ev.to_mesh();coords=[ev.matrix_world@v.co for v in me.vertices];minimum=min(v.z for v in coords)
  # Proximity signs are diagnostic, not an inside/outside or collision certification.
  tree=BVHTree.FromPolygons(coords,[list(p.vertices) for p in me.polygons],all_triangles=False) if name=='cast_release' and f in [1,13,25,37,48] else None
  ev.to_mesh_clear()
  for ob in new:
   ev=ob.evaluated_get(deps);me=ev.to_mesh();coords=[ev.matrix_world@v.co for v in me.vertices];mn=min(v.z for v in coords);newmin=min(newmin,mn);minimum=min(minimum,mn);local=np.array([list(boneinv@v) for v in coords]);restlocal.setdefault(ob.name,local);rigiderr=max(rigiderr,float(np.abs(local-restlocal[ob.name]).max()))
   if tree:
    d=[]
    for v in coords:
     co,normal,face,dist=tree.find_nearest(v)
     if co is not None:d.append(float((v-co).dot(normal)))
    contacts.append({'component':ob.name,'nearestBodyNormalSignedDistanceMin':min(d),'nearestBodyNormalSignedDistanceMax':max(d),'verticesBelowNegative0_25mm':sum(x<-.00025 for x in d)})
   ev.to_mesh_clear()
  rows.append({'clip':name,'frame':f,'wholeMeshMinimumWorldZ':minimum,'wholeMeshFloorClearance':minimum-.012,'bracerMinimumWorldZ':newmin,'maxBracerForearmLocalCoordinateErrorMeters':rigiderr,'bodyProximityDiagnostics':contacts})
 print('CHECKED',name,len(frames),flush=True)
report={'scope':'Actual saved source evaluated at1089samples includingall128integerframes; body+everynewbracer component. Bone-local coordinates test rigid attachment. Nearest-surface-normal signs are diagnostic only and cannot prove inside/outside for this open intersecting character mesh.','sourceSha256':hashlib.sha256(P.read_bytes()).hexdigest(),'components':component,'samples':rows,'penetratingSamples':sum(r['wholeMeshFloorClearance'] < -1e-6 for r in rows),'maxRigidCoordinateErrorMeters':max(r['maxBracerForearmLocalCoordinateErrorMeters'] for r in rows)};(O/'source-pose-ground.json').write_text(json.dumps(report,indent=2)+'\n');print('DONE',report['penetratingSamples'],report['maxRigidCoordinateErrorMeters'])
