import bpy,json,pathlib,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
O=pathlib.Path(__file__).resolve().parent;results=[]
def load(slug):
 bpy.ops.wm.open_mainfile(filepath=str(O/'modules'/slug/'source.blend'));return [o for o in bpy.context.scene.objects if o.type=='MESH' and o.hide_render]
def bound(obs):
 pts=[o.matrix_world@Vector(v) for o in obs for v in o.bound_box];return [min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]
def check(name,ok,details):results.append({'check':name,'passed':bool(ok),'details':details})
col=load('floor-bay');lo,hi=bound(col);gap=(lo[0]+4)-hi[0];step=hi[2]-hi[2]
check('Two actual 4m floor collision bounds meet',abs(gap)<=.005 and abs(step)<=.01,{'gap_m':gap,'floor_step_m':step,'collision_bounds':[lo,hi]})
check('15mm displacement negative fixture rejected',abs(gap+.015)>.005,{'injected_seam_m':.015,'tolerance_m':.005})
for slug,w,h,ox,oz in [('door-frame',1.2,2.4,.2,0),('window-wall',1.2,1.2,1.4,1)]:
 col=load(slug);trees=[(o,BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[p.vertices[:] for p in o.data.polygons])) for o in col];hits=[]
 for i in range(13):
  for j in range(25):
   x=ox+.002+(w-.004)*i/12;z=oz+.002+(h-.004)*j/24
   for ob,tree in trees:
    hit=tree.ray_cast(Vector((x,-1,z)),Vector((0,1,0)),3)
    if hit[0] is not None:hits.append({'x':x,'z':z,'object':ob.name})
 check(slug+' actual collider aperture rays',not hits,{'rays':325,'hit_count':len(hits),'hits':hits[:10],'clear_width_m':w,'clear_height_m':h,'scope':'Aperture shell only; no door leaf/controller simulation'})
for slug,run,rise in [('ramp-run',4.8,.4),('stair-flight',2.7,1.6)]:
 col=load(slug);wedge=next(o for o in col if 'navigation_proxy' in o.name);pts=[wedge.matrix_world@v.co for v in wedge.data.vertices];actualrun=max(v.y for v in pts)-min(v.y for v in pts);actualrise=max(v.z for v in pts)-min(v.z for v in pts)
 check(slug+' movement proxy endpoint geometry',abs(actualrun-run)<1e-5 and abs(actualrise-rise)<1e-5,{'actual_run_m':actualrun,'actual_rise_m':actualrise,'grade':actualrise/actualrun,'walkable_width_m':max(v.x for v in pts)-min(v.x for v in pts)})
col=load('daylight-baffle');bpy.context.scene.frame_set(1);moving=[o for o in bpy.context.scene.objects if 'actual_horizontal_pivot' in o.name];poses=[]
for frame in [1,31,61,91,121]:
 bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();poses.append({'frame':frame,'degrees':[math.degrees(o.rotation_euler.x) for o in moving],'scales':[list(o.scale) for o in moving]})
check('Three baffle pivots synchronized, 0 to 70 degrees, fixed scale',len(moving)==3 and max(abs(x-70) for x in poses[2]['degrees'])<.001 and all(abs(v-1)<1e-6 for p in poses for s in p['scales'] for v in s),{'samples':poses,'remaining':'Swept collision authority, mounting, manual release and rendered fit not certified'})
(O/'interface-validation.json').write_text(json.dumps({'scope':'Source geometry and typed-interface checks, not gameplay or engineering certification','checks':results,'failures':sum(not r['passed'] for r in results)},indent=2)+'\n');print('CHECKS',len(results),'FAIL',sum(not r['passed'] for r in results))
