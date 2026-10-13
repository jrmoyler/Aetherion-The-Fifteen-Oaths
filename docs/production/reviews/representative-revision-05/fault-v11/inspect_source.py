import bpy,json
from pathlib import Path
from mathutils import Vector
p=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(p/'amethyst-short-blade/source.blend'))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
coords=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
report={'status':'REVIEW_ONLY_NOT_APPROVED','reference':'reference-053','meshObjects':len(objects),'sourceTriangles':sum(len(f.vertices)-2 for o in objects for f in o.data.polygons),'dimensionsMeters':[max(v[i] for v in coords)-min(v[i] for v in coords) for i in range(3)],'missingUV':[o.name for o in objects if not o.data.uv_layers],'missingMaterials':[o.name for o in objects if not o.data.materials],'images':[{'name':i.name,'packed':bool(i.packed_file),'colorspace':i.colorspace_settings.name,'size':list(i.size)} for i in bpy.data.images if i.source=='FILE'],'engineValidation':'NOT_RUN','visualAcceptance':'OPEN'}
(p/'source-inspection.json').write_text(json.dumps(report,indent=2)+'\n')
