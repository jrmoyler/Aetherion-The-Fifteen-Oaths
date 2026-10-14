import bpy,pathlib,json
O=pathlib.Path(__file__).resolve().parent
bpy.context.preferences.filepaths.save_version=0
for d in sorted((O/'modules').iterdir()):
 if not (d/'lod1.png').exists():continue
 bpy.ops.wm.open_mainfile(filepath=str(d/'source.blend'))
 for level in [1,2]:
  name=f'LOD{level}_EDITABLE_HIDDEN';collection=bpy.data.collections.get(name)
  if collection is None:collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
  for ob in list(bpy.context.scene.objects):
   if ob.get('representation')=='lod_variant' and ob.get('lod_level')==level:
    for existing in list(ob.users_collection):existing.objects.unlink(ob)
    collection.objects.link(ob);ob.hide_render=True;ob.hide_set(True)
  collection.hide_render=True;collection.hide_viewport=True
 bpy.ops.wm.save_as_mainfile(filepath=str(d/'source.blend'),compress=True)
 print('EDITABLE_LOD_COLLECTIONS',d.name,flush=True)
