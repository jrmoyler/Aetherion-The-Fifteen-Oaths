import bpy,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path('/tmp/aetherion-daybreak-architecture');OUT=Path('/tmp/aetherion-daybreak-independent-checks');rows=[]
def load(s):
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'modules'/s/'source.blend'));return [o for o in bpy.context.scene.objects if o.type=='MESH' and o.hide_render]
def bounds(obs):
 p=[o.matrix_world@v.co for o in obs for v in o.data.vertices];return [[min(v[i] for v in p) for i in range(3)],[max(v[i] for v in p) for i in range(3)]]
def record(name,passed,**detail):rows.append({'name':name,'passed':bool(passed),**detail})
obs=load('floor-bay');a,b=bounds(obs);actual=(a[0]+4)-b[0];negative=(a[0]+4.015)-b[0];record('actual_floor_seam_and_displaced_copy',abs(actual)<=.005 and abs(negative)>.005,seamMeters=actual,negativeSeamMeters=negative,toleranceMeters=.005)
for slug,x0,z0,w,h in [('door-frame',.2,0,1.2,2.4),('window-wall',1.4,1,1.2,1.2)]:
 obs=load(slug);trees=[BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[p.vertices[:] for p in o.data.polygons]) for o in obs]
 rays=[Vector((x0+.003+(w-.006)*i/12,-1,z0+.003+(h-.006)*j/24)) for i in range(13) for j in range(25)]
 def count(ts):return sum(any(t.ray_cast(v,Vector((0,1,0)),3)[0] is not None for t in ts) for v in rays)
 good=count(trees);cx=x0+w/2;cz=z0+h/2;v=[(cx+x,.1+y,cz+z) for x,y,z in [(-.1,-.1,-.1),(.1,-.1,-.1),(.1,.1,-.1),(-.1,.1,-.1),(-.1,-.1,.1),(.1,-.1,.1),(.1,.1,.1),(-.1,.1,.1)]];blocker=BVHTree.FromPolygons(v,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]);bad=count(trees+[blocker]);record(slug+'_aperture_with_actual_blocker_negative',good==0 and bad>0,rays=len(rays),baselineHits=good,blockedHits=bad)
obs=load('ramp-run');wedge=next(o for o in obs if 'navigation_proxy' in o.name);v=[wedge.matrix_world@x.co for x in wedge.data.vertices];a=[min(x[i] for x in v) for i in range(3)];b=[max(x[i] for x in v) for i in range(3)];grade=(b[2]-a[2])/(b[1]-a[1]);bad=[x.copy() for x in v]
for x in bad:
 if abs(x.z-b[2])<1e-6:x.z+=.03
badgrade=(max(x.z for x in bad)-min(x.z for x in bad))/(max(x.y for x in bad)-min(x.y for x in bad));record('ramp_grade_geometry_and_raised_endpoint_negative',abs(grade-1/12)<1e-6 and abs(badgrade-1/12)>1e-6,grade=grade,negativeGrade=badgrade,negativeEndpointRiseMeters=.03)
load('daylight-baffle');pivots=[o for o in bpy.context.scene.objects if 'actual_horizontal_pivot' in o.name];samples=[]
for f in range(1,122):
 bpy.context.scene.frame_set(f);bpy.context.view_layer.update();angles=[o.rotation_euler.x for o in pivots];samples.append({'frame':f,'anglesRadians':angles,'scaleValid':all(abs(s-1)<1e-6 for o in pivots for s in o.scale)})
maxdiff=max(max(s['anglesRadians'])-min(s['anglesRadians']) for s in samples);bad=list(samples[60]['anglesRadians']);bad[0]+=.02;record('baffle_full_integer_frames_sync_and_desync_negative',len(pivots)==3 and maxdiff<1e-6 and all(s['scaleValid'] for s in samples) and max(bad)-min(bad)>1e-6,pivots=len(pivots),samples=121,maxDifferenceRadians=maxdiff,negativeDifferenceRadians=max(bad)-min(bad),peakDegrees=[math.degrees(v) for v in samples[60]['anglesRadians']])
(OUT/'independent-fixtures.json').write_text(json.dumps({'scope':'Read-only actual collision geometry/source animation; in-memory injected negatives, no candidate saves; not gameplay, swept collision, access-code or engineering certification','checks':rows,'failures':sum(not r['passed'] for r in rows)},indent=2)+'\n');assert all(r['passed'] for r in rows),rows
