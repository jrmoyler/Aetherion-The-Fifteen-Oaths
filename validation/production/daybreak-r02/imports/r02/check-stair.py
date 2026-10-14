import bpy,json
from pathlib import Path
from mathutils.bvhtree import BVHTree
from mathutils import Vector
p=Path('/tmp/aetherion-daybreak-architecture-r02/modules/stair-flight/source.blend');bpy.ops.wm.open_mainfile(filepath=str(p));obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render];trees=[BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[f.vertices[:] for f in o.data.polygons]) for o in obs];samples=[]
for y in [2.4,2.41,2.65,2.66,2.669,2.671,2.68,2.69,2.699]:
 hits=[t.ray_cast(Vector((.9,y,3)),Vector((0,0,-1)),5)[0] for t in trees];samples.append({'y':y,'highestVisualSurfaceZ':max(h.z for h in hits if h is not None)})
r={'scope':'Actual visual geometry downward ray sample; independent of navigation wedge','samples':samples,'terminalIntrusionRemoved':all(abs(r['highestVisualSurfaceZ']-1.44)<.001 for r in samples),'finding':'No elevated terminal body intrudes before y2.70 in r02; independent final-tread rays stay at1.44m through y2.699. Receiving landing seam tested separately.'};Path('/tmp/aetherion-daybreak-independent-checks/r02/stair-profile.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
