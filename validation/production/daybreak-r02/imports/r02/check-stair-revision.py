import bpy,pathlib,json,math,hashlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree
O=pathlib.Path('/tmp/aetherion-daybreak-architecture-r02');tests=[]
def check(name,passed,data):tests.append({'check':name,'passed':bool(passed),'evidence':data})
def trees():
 return [(o,BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[p.vertices[:] for p in o.data.polygons])) for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render]
def highest(obtrees,y,x=.9):
 vals=[]
 for o,tree in obtrees:
  hit=tree.ray_cast(Vector((x,y,4)),Vector((0,0,-1)),6)
  if hit[0] is not None:vals.append((hit[0].z,o.name))
 return max(vals) if vals else None
def bounds(o):
 pts=[o.matrix_world@v.co for v in o.data.vertices];return [[min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]]
p=O/'modules/stair-flight/source.blend';bpy.ops.wm.open_mainfile(filepath=str(p));ts=trees();profile=[{'y':y,'hit':highest(ts,y)} for y in [2.4,2.41,2.65,2.66,2.669,2.671,2.68,2.69,2.699,2.69999,2.70001]]
check('r01 intruding terminal body removed; tread9 surface remains1.44m through2.69999m',all(s['hit'] and abs(s['hit'][0]-1.44)<.001 for s in profile if s['y']<2.7),{'actual_visual_ray_profile':profile,'source_sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
check('Unassembled flight has no top landing face beyond2.70m',highest(ts,2.70001) is None,{'final_riser_owner':'receiving landing front fascia, not an overlapping stair body'})
source_manifest=json.loads(p.with_name('manifest.json').read_text());top=next(s for s in source_manifest['sockets'] if s['name']=='top');check('Landing end socket preserved',top['position_blender_xyz_m']==[0,2.7,1.6],top)
p=O/'fixtures/stairs-with-landing/source.blend';bpy.ops.wm.open_mainfile(filepath=str(p));ts=trees();profiles=[];allwidths=[]
for x in [.3,.9,1.5]:
 boundaries=[0.0]
 for i in range(1,10):
  lo=i*.3-.025;hi=i*.3+.025;threshold=i*.16+.08
  for _ in range(32):
   mid=(lo+hi)/2;h=highest(ts,mid,x)
   if h is None:raise RuntimeError('unexpected missing surface in measured valid fixture')
   if h[0]>threshold:hi=mid
   else:lo=mid
  boundaries.append((lo+hi)/2)
 widths=[boundaries[i+1]-boundaries[i] for i in range(9)];allwidths.extend(widths);profiles.append({'x':x,'riser_planes_y_m':boundaries,'exposed_tread_widths_m':widths})
check('Actual assembled geometry has nine300mm exposed treads at three cross-stair positions',all(abs(w-.3)<.00005 for w in allwidths),{'downward_ray_boundary_search':profiles,'tolerance_m':.00005})
land_samples=[{'y':y,'hit':highest(ts,y)} for y in [2.669,2.671,2.69,2.699,2.7001,2.71,2.72,2.73,2.74]]
check('Tenth riser occurs at landing seam,1.44m to1.60m',abs(highest(ts,2.699)[0]-1.44)<.001 and abs(highest(ts,2.7001)[0]-1.6)<.001,{'samples':land_samples,'riser_owner':'160mm receiving landing front fascia'})
wedge=next(o for o in bpy.context.scene.objects if o.type=='MESH' and 'COL_smooth_navigation_proxy' in o.name);landing=next(o for o in bpy.context.scene.objects if o.type=='MESH' and 'COL_floor' in o.name);wb=bounds(wedge);lb=bounds(landing);gap=lb[0][1]-wb[1][1];step=lb[1][2]-wb[1][2]
check('Actual movement proxy and landing collider meet at same height',abs(gap)<=.005 and abs(step)<=.01,{'gap_m':gap,'step_m':step,'wedge_bounds':wb,'landing_bounds':lb})
landing_objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.get('original_module_name') and (not o.hide_render or 'COL_floor' in o.name)]
for o in landing_objects:o.location.y+=.015
bpy.context.view_layer.update();ts=trees();neg=bounds(landing);ngap=neg[0][1]-wb[1][1]
check('15mm displaced physical landing negative fixture rejected',ngap>.005 and highest(ts,2.7075) is None,{'actual_collider_gap_m':ngap,'visual_gap_probe':highest(ts,2.7075),'tolerance_m':.005,'scene_modified_in_memory_only':True})
for o in landing_objects:o.location.y-=.015;o.location.z+=.02
bpy.context.view_layer.update();nstep=bounds(landing)[1][2]-wb[1][2]
check('20mm landing collider step negative fixture rejected',nstep>.01,{'actual_step_m':nstep,'tolerance_m':.01,'scene_modified_in_memory_only':True})
result={'scope':'r02 actual Blender visual geometry rays and movement collider seams; no source saves, no gameplay certification','checks':tests,'failures':sum(not x['passed'] for x in tests)};(pathlib.Path('/tmp/aetherion-daybreak-independent-checks/r02/stair-revision-validation.json')).write_text(json.dumps(result,indent=2)+'\n');print('STAIR_REVISION_CHECKS',len(tests),'FAILURES',result['failures'])
