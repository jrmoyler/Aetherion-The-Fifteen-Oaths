import bpy,pathlib
O=pathlib.Path(__file__).resolve().parent
bpy.context.preferences.filepaths.save_version=0
for p in sorted((O/'modules').glob('*/source.blend')):
 bpy.ops.wm.open_mainfile(filepath=str(p));bpy.ops.wm.save_as_mainfile(filepath=str(p),compress=True)
