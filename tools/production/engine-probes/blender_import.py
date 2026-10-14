"""Read-only source import probe, launched by run.py inside Blender."""
import argparse
import bpy
import json
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.input)
print('AETHERION_PROBE_JSON ' + json.dumps({
    'version': bpy.app.version_string,
    'meshes': len(bpy.data.meshes),
    'materials': len(bpy.data.materials),
    'armatures': len(bpy.data.armatures),
    'actions': len(bpy.data.actions),
}))
