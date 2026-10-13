import bpy,hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parent
src=root/'amethyst-short-blade/source.blend';before=hashlib.sha256(src.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(src));bpy.ops.object.select_all(action='DESELECT')
for ob in bpy.context.scene.objects:
 if ob.type=='MESH' and not ob.hide_render:
  ob.select_set(True)
  tri=ob.modifiers.new('Review_export_triangulation','TRIANGULATE')
  tri.keep_custom_normals=True
bpy.ops.export_scene.gltf(filepath=str(root/'amethyst-short-blade/review.glb'),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT')
out=root/'amethyst-short-blade/review.glb'
(root/'glb-export-receipt.json').write_text(json.dumps({'status':'REVIEW_ONLY_NOT_PRODUCTION_PROMOTION','blender':bpy.app.version_string,'sourceSHA256':before,'sourceUnchanged':hashlib.sha256(src.read_bytes()).hexdigest()==before,'outputSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'scope':'Static mesh geometry/material export; no rig required. No LOD/collision or runtime acceptance claimed.'},indent=2)+'\n')
