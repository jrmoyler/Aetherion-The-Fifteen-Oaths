import bpy,json,hashlib
from pathlib import Path
paths=['/tmp/aetherion-weapon-revision-v6/chronal-wrist-tool-v6.blend','/tmp/aetherion-weapon-revision-v6/chronal-wrist-v6-neutral-fit-witness.blend','/tmp/aetherion-weapon-revision/graft-pass06/sapseed-staff.blend']
rows=[]
for name in paths:
 p=Path(name);h=hashlib.sha256(p.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=name)
 rows.append({'file':p.name,'sha256':h,'meshes':len([o for o in bpy.context.scene.objects if o.type=='MESH']),'materials':len(bpy.data.materials),'armatures':len([o for o in bpy.context.scene.objects if o.type=='ARMATURE']),'images':[{'name':i.name,'packed':bool(i.packed_file),'path':i.filepath,'size':list(i.size),'externalExists':Path(bpy.path.abspath(i.filepath)).is_file() if i.filepath else False} for i in bpy.data.images if i.type=='IMAGE'],'inputUnchanged':hashlib.sha256(p.read_bytes()).hexdigest()==h})
Path('/tmp/aetherion-review-source-probe.json').write_text(json.dumps({'blender':bpy.app.version_string,'scope':'Read-only source .blend open and image metadata; not rendering certification','records':rows},indent=2)+'\n')
