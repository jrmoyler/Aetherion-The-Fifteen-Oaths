import bpy,json,hashlib,sys,shutil
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if len(args)!=2: raise SystemExit('Usage: blender --background --python export_collision.py -- CANDIDATE_ROOT OUTPUT_INPUTS')
root=Path(args[0]).resolve();out=Path(args[1]).resolve();out.mkdir(parents=True,exist_ok=True);reports=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name in ['stairs-with-landing','ramp-with-landing']:
 source=root/'fixtures'/name/'source.blend';before=sha(source);bpy.ops.wm.open_mainfile(filepath=str(source));bpy.ops.object.select_all(action='DESELECT');objects=[]
 for obj in bpy.context.scene.objects:
  if obj.type=='MESH' and obj.name.startswith('COL_'):
   obj.hide_set(False);obj.hide_viewport=False;obj.hide_render=False;obj.select_set(True);objects.append(obj.name)
 assert any('floor' in name.lower()for name in objects),objects
 target=out/(name+'-collision.glb');bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=False,export_yup=True)
 after=sha(source);assert before==after
 reports.append({'source':str(source),'source_relative_to_candidate':source.relative_to(root).as_posix(),'candidate_freeze_sha256':sha(root/'FREEZE.json'),'source_sha256':before,'source_unchanged':before==after,'export':target.name,'sha256':sha(target),'objects':objects})
source=root/'modules/floor-bay/collision.glb';target=out/'start-floor-collision.glb';shutil.copyfile(source,target);reports.append({'source':str(source),'source_relative_to_candidate':source.relative_to(root).as_posix(),'candidate_freeze_sha256':sha(root/'FREEZE.json'),'source_sha256':sha(source),'source_unchanged':True,'export':target.name,'sha256':sha(target),'method':'Exact copy of authored starting floor collision GLB'})
(out/'source-receipt.json').write_text(json.dumps(reports,indent=2)+'\n')
