"""Cycles review renders + contact sheets."""
import math
import os
import bpy
import mathutils
from PIL import Image, ImageDraw


def setup_scene(res=(420, 640), samples=12):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    sc.cycles.max_bounces = 4
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in [i.identifier for i in sc.view_settings.bl_rna.properties['look'].enum_items] else 'None'
    if not sc.world:
        sc.world = bpy.data.worlds.new('w')
    w = sc.world
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (0.42, 0.42, 0.44, 1)
    bg.inputs[1].default_value = 0.55
    # lights
    for name, loc, energy, size, col in [('key', (2.2, -3.0, 3.2), 520, 2.5, (1.0, 0.96, 0.9)),
                                         ('fill', (-3.0, -1.5, 1.8), 160, 3.0, (0.85, 0.9, 1.0)),
                                         ('rim', (0.5, 3.5, 2.8), 380, 2.0, (1.0, 1.0, 1.0))]:
        if name in bpy.data.objects:
            continue
        L = bpy.data.lights.new(name, 'AREA')
        L.energy, L.size, L.color = energy, size, col
        o = bpy.data.objects.new(name, L)
        sc.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (mathutils.Vector((0, 0, 1.0)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    if 'floor' not in bpy.data.objects:
        me = bpy.data.meshes.new('floor')
        me.from_pydata([(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [], [(0, 1, 2, 3)])
        fl = bpy.data.objects.new('floor', me)
        sc.collection.objects.link(fl)
        m = bpy.data.materials.new('floor')
        m.use_nodes = True
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.36, 0.36, 0.37, 1)
        m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.8
        me.materials.append(m)
    if 'cam' not in bpy.data.objects:
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        sc.collection.objects.link(cam)
        sc.camera = cam
    return sc


def render_view(path, target_center, height, yaw_deg, dist_scale=1.0, focal=85, elev=0.10, aspect=None):
    sc = bpy.context.scene
    cam = bpy.data.objects['cam']
    cam.data.lens = focal
    sensor = 36.0
    res_x, res_y = sc.render.resolution_x, sc.render.resolution_y
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.sensor_height = 24.0
    fov = 2 * math.atan(12.0 / focal)
    dist = (height * 0.62) / math.tan(fov / 2) * dist_scale
    yaw = math.radians(yaw_deg)
    c = mathutils.Vector(target_center)
    d = mathutils.Vector((math.sin(yaw), -math.cos(yaw), elev))
    cam.location = c + d.normalized() * dist
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def contact_sheet(paths, labels, out, title=''):
    ims = [Image.open(p).convert('RGB') for p in paths]
    w, h = ims[0].size
    pad = 28
    W = w * len(ims)
    sheet = Image.new('RGB', (W, h + pad * 2), (226, 224, 220))
    dr = ImageDraw.Draw(sheet)
    dr.text((10, 6), title, fill=(20, 20, 30))
    for i, (im, lb) in enumerate(zip(ims, labels)):
        if im.size != (w, h):
            im = im.resize((w, h))
        sheet.paste(im, (i * w, pad))
        dr.text((i * w + w // 2 - len(lb) * 3, h + pad + 6), lb, fill=(20, 20, 30))
    sheet.save(out)
    return out
