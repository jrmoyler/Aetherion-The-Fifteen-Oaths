"""Fast sculpt preview: polygonise an archetype's clay + parts (no rig/bake) and render
side / front-3/4 / top views.   python preview_clay.py <archetype> [oath] [out.png]"""
import os
import sys
import math
import importlib
import numpy as np
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lib import core, mats  # noqa


def main():
    arch = sys.argv[1]
    oath = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2].startswith("oath") else None
    out = sys.argv[-1] if sys.argv[-1].endswith(".png") else f"/tmp/clay_{arch}.png"
    core.reset()
    S = importlib.import_module(f"archetypes.{arch}").build(oath)
    objs = []
    if S.clay is not None:
        v, f = S.clay.polygonize(S.voxel * 1.3)
        hi = core.mesh_from_arrays("hi", v, f)
        objs.append(hi)
    col = {"body": (0.35, 0.33, 0.31), "secondary": (0.12, 0.11, 0.1), "accent": (0.75, 0.7, 0.6), "glow": (1, 0.4, 0.1)}
    for sl, c in col.items():
        m = bpy.data.materials.new(sl); m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*c, 1); b.inputs["Roughness"].default_value = 0.55
        if sl == "glow":
            b.inputs["Emission Color"].default_value = (*c, 1); b.inputs["Emission Strength"].default_value = 4
    if S.clay is not None:
        hi.data.materials.append(bpy.data.materials["body"])
    for p in S.parts:
        p.ob.data.materials.clear(); p.ob.data.materials.append(bpy.data.materials[p.slot])
        objs.append(p.ob)
    lo, hi_ = core.stats_bbox(objs)
    ctr = (lo + hi_) / 2
    size = max(hi_ - lo)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"; sc.cycles.samples = 12; sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 400
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.45, 0.46, 0.48, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.4
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = size * 1.1
    key = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN")); key.data.energy = 3.0
    sc.collection.objects.link(key); key.rotation_euler = (math.radians(50), 0, math.radians(30))
    tiles = []
    for tag, d in (("side", (1, 0, 0.05)), ("f34", (0.6, 0.75, 0.25)), ("front", (0.0, 1, 0.1))):
        dv = Vector(d).normalized()
        cam.location = ctr + dv * size * 3
        cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
        p = out.replace(".png", f"_{tag}.png"); sc.render.filepath = p
        bpy.ops.render.render(write_still=True); tiles.append(p)
    arrs = []
    for p in tiles:
        im = bpy.data.images.load(p)
        a = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32); im.pixels.foreach_get(a)
        arrs.append(a.reshape(im.size[1], im.size[0], 4)); os.remove(p)
    sheet = np.concatenate(arrs, axis=1)
    o = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0]); o.pixels.foreach_set(sheet.ravel())
    o.filepath_raw = out; o.file_format = "PNG"; o.save()
    print("wrote", out)


main()
