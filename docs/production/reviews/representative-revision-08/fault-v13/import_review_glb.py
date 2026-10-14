import bpy,json,hashlib
from pathlib import Path
p=Path(__file__).resolve().parent;f=p/'amethyst-short-blade/review.glb'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(f))
obs=[o for o in bpy.context.scene.objects if o.type=='MESH'];pts=[o.matrix_world@v.co for o in obs for v in o.data.vertices]
report={'status':'SCOPED_BLENDER_IMPORT_ONLY','blender':bpy.app.version_string,'glbSHA256':hashlib.sha256(f.read_bytes()).hexdigest(),'meshObjects':len(obs),'triangles':sum(len(f.vertices)-2 for o in obs for f in o.data.polygons),'dimensionsMeters':[max(v[i] for v in pts)-min(v[i] for v in pts) for i in range(3)],'missingUV':[o.name for o in obs if not o.data.uv_layers],'missingMaterials':[o.name for o in obs if not o.data.materials],'renderParity':'NOT_TESTED','engineAcceptance':'OPEN'}
(p/'blender-glb-import.json').write_text(json.dumps(report,indent=2)+'\n')
