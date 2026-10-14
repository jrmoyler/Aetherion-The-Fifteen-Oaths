import bpy,json
from pathlib import Path
from mathutils.bvhtree import BVHTree
from mathutils import Vector
p=Path('/tmp/aetherion-daybreak-architecture/modules/stair-flight/source.blend');bpy.ops.wm.open_mainfile(filepath=str(p));obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render];trees=[BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[f.vertices[:] for f in o.data.polygons]) for o in obs];samples=[]
for y in [2.4,2.41,2.65,2.66,2.669,2.671,2.68,2.69,2.699]:
 hits=[t.ray_cast(Vector((.9,y,3)),Vector((0,0,-1)),5)[0] for t in trees];samples.append({'y':y,'highestVisualSurfaceZ':max(h.z for h in hits if h is not None)})
r={'scope':'Actual visual geometry downward ray sample; independent of navigation wedge','samples':samples,'finding':'Terminal riser occupies y=2.67..2.70 and lifts the surface from final tread near1.44m to1.60m, shortening final exposed tread from0.30m to0.27m. Nominal full tread acceptance must remain failed/pending.'};Path('/tmp/aetherion-daybreak-independent-checks/stair-profile.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
