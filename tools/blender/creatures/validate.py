"""Re-import forged GLBs, validate (bones/clips/tris/size/influences/materials/orientation) into
VALIDATION.json and render a Cycles contact sheet per file to review/<id>.png
(side view @ idle, front-3/4 @ idle, side-3/4 @ mid-attack).

  /opt/blender-venv/bin/python tools/blender/creatures/validate.py [id ...] [--no-render]
"""
import os
import sys
import json
import math
import struct
import bpy
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.environ.get("FORGE_OUT", os.path.join(REPO, "game", "public", "assets", "creatures"))
REVIEW = os.path.join(OUT, "review") if "FORGE_OUT" in os.environ else os.path.join(HERE, "review")
VALID = os.path.join(OUT, "VALIDATION.json") if "FORGE_OUT" in os.environ else os.path.join(HERE, "VALIDATION.json")
REQUIRED = ["idle", "walk", "run", "attack", "hit", "death"]
SLOTS = {"body", "secondary", "accent", "glow"}


def read_gltf_json(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, ver, length = struct.unpack_from("<III", data, 0)
    clen, ctype = struct.unpack_from("<II", data, 12)
    return json.loads(data[20:20 + clen])


def check_json(path):
    g = read_gltf_json(path)
    rep = {}
    rep["animations"] = [a.get("name") for a in g.get("animations", [])]
    rep["materials"] = [m.get("name") for m in g.get("materials", [])]
    rep["skins"] = len(g.get("skins", []))
    rep["joints"] = len(g["skins"][0]["joints"]) if g.get("skins") else 0
    rep["images"] = [i.get("mimeType") for i in g.get("images", [])]
    rep["extensionsUsed"] = g.get("extensionsUsed", [])
    tris = 0
    maxinf = 0
    for m in g.get("meshes", []):
        for p in m["primitives"]:
            acc = g["accessors"][p["indices"]]
            tris += acc["count"] // 3
            maxinf = max(maxinf, 4 * (1 + sum(1 for k in p["attributes"] if k.startswith("JOINTS_") and k != "JOINTS_0")))
    rep["tris"] = tris
    rep["max_influences"] = maxinf
    rep["materials_detail"] = {}
    for m in g.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {})
        rep["materials_detail"][m.get("name")] = {
            "baseColorFactor": [round(x, 3) for x in pbr.get("baseColorFactor", [1, 1, 1, 1])],
            "baseColorTexture": "baseColorTexture" in pbr,
            "metallicRoughnessTexture": "metallicRoughnessTexture" in pbr,
            "normalTexture": "normalTexture" in m,
            "occlusionTexture": "occlusionTexture" in m,
            "emissiveFactor": [round(x, 3) for x in m.get("emissiveFactor", [0, 0, 0])],
        }
    return rep


def import_glb(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.parent == arm]
    return arm, meshes


def set_clip(arm, name, frac):
    act = bpy.data.actions.get(name)
    if act is None:
        cands = [a for a in bpy.data.actions if a.name.startswith(name)]
        act = cands[0] if cands else None
    if act is None:
        return False
    ad = arm.animation_data or arm.animation_data_create()
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    ad.action = act
    if act.slots:
        ad.action_slot = act.slots[0]
    f0, f1 = act.frame_range
    bpy.context.scene.frame_set(int(round(f0 + (f1 - f0) * frac)))
    return True


def world_bbox(meshes):
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in meshes:
        e = o.evaluated_get(dg)
        me = e.to_mesh()
        M = e.matrix_world
        for v in me.vertices:
            w = M @ v.co
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
        e.to_mesh_clear()
    return lo, hi


def render_sheet(cid, arm, meshes, out_png, res=420):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 16
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    w = bpy.data.worlds.new("w"); sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.43, 0.45, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.35
    # ground
    bpy.ops.mesh.primitive_plane_add(size=40)
    gp = bpy.context.active_object
    gm = bpy.data.materials.new("ground"); gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.32, 0.32, 0.33, 1)
    gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    gp.data.materials.append(gm)
    set_clip(arm, "idle", 0.0)
    lo, hi = world_bbox(meshes)
    ctr = (lo + hi) / 2
    size = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 50
    key = bpy.data.objects.new("key", bpy.data.lights.new("key", "AREA"))
    key.data.energy = 550 * (size / 2) ** 2; key.data.size = size * 1.5
    rim = bpy.data.objects.new("rim", bpy.data.lights.new("rim", "AREA"))
    rim.data.energy = 350 * (size / 2) ** 2; rim.data.size = size
    for l in (key, rim):
        sc.collection.objects.link(l)
    views = [("side", "idle", 0.0, (1.0, 0.0, 0.18)), ("front34", "idle", 0.0, (0.55, 0.85, 0.22)),
             ("attack", "attack", 0.45, (0.85, 0.5, 0.25))]
    tiles = []
    for tag, clip, frac, d in views:
        set_clip(arm, clip, frac)
        # glTF +Z (forward) imports as Blender -Y: camera offset uses forward = -Y
        dv = Vector((d[0], -d[1], d[2])).normalized()
        dist = size * 1.25 / math.tan(cam.data.angle / 2) * 0.47
        cam.location = ctr + dv * dist
        cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
        key.location = ctr + Vector((dv.x * 0.3 + 0.6, dv.y * 0.3 - 0.8, 1.6)).normalized() * size * 2.2
        key.rotation_euler = (ctr - key.location).to_track_quat("-Z", "Y").to_euler()
        rim.location = ctr + Vector((-dv.x, -dv.y, 0.8)).normalized() * size * 2.0
        rim.rotation_euler = (ctr - rim.location).to_track_quat("-Z", "Y").to_euler()
        p = out_png.replace(".png", f"_{tag}.png")
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        tiles.append(p)
    # stitch horizontally
    imgs = [bpy.data.images.load(p) for p in tiles]
    arrs = []
    for im in imgs:
        a = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32)
        im.pixels.foreach_get(a)
        arrs.append(a.reshape(im.size[1], im.size[0], 4))
    sheet = np.concatenate(arrs, axis=1)
    out = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0], alpha=True)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = out_png
    out.file_format = "PNG"
    out.save()
    for p in tiles:
        os.remove(p)


def validate(cid, render=True):
    path = os.path.join(OUT, f"{cid}.glb")
    rep = {"id": cid, "file": os.path.relpath(path, REPO) if "FORGE_OUT" not in os.environ else path, "bytes": os.path.getsize(path)}
    rep.update(check_json(path))
    arm, meshes = import_glb(path)
    rep["bones"] = len(arm.data.bones)
    set_clip(arm, "idle", 0.0)
    lo, hi = world_bbox(meshes)
    rep["bbox_min"] = [round(x, 3) for x in lo]
    rep["bbox_max"] = [round(x, 3) for x in hi]
    rep["height"] = round(hi.z, 3)
    # forward check: head bone should be at -Y in Blender (= +Z glTF)
    hb = arm.data.bones.get("head")
    rep["faces_plus_z"] = bool(hb is None or hb.head_local.y < 0 or (arm.matrix_world @ hb.head_local).y < 0)
    # death clip ends lying (bbox height drop)
    if set_clip(arm, "death", 1.0):
        dlo, dhi = world_bbox(meshes)
        rep["death_end_height"] = round(dhi.z, 3)
    issues = []
    for c in REQUIRED:
        if c not in rep["animations"]:
            issues.append(f"missing clip {c}")
    if not (4000 <= rep["tris"] <= 20000):
        issues.append(f"tris {rep['tris']} outside 4k-20k")
    if rep["bytes"] > 3 * 1024 * 1024:
        issues.append("file > 3MB")
    if rep["skins"] != 1:
        issues.append("expected exactly one skin")
    if rep["max_influences"] > 4:
        issues.append("more than 4 influences")
    if not set(rep["materials"]) <= SLOTS:
        issues.append(f"unexpected materials {rep['materials']}")
    if "KHR_draco_mesh_compression" in rep["extensionsUsed"]:
        issues.append("draco used")
    if abs(lo.z) > 0.05 and "wraith" not in cid and "wisp" not in cid:
        issues.append(f"origin not at ground (min z {lo.z:.3f})")
    rep["issues"] = issues
    rep["ok"] = not issues
    if render:
        os.makedirs(REVIEW, exist_ok=True)
        import_glb(path)
        arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
        meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.parent == arm]
        for o in list(bpy.context.scene.objects):
            if o.type == "MESH" and o not in meshes:
                bpy.data.objects.remove(o, do_unlink=True)
        png = os.path.join(REVIEW, f"{cid}.png")
        render_sheet(cid, arm, meshes, png)
        rep["review"] = os.path.relpath(png, REPO) if "FORGE_OUT" not in os.environ else png
    return rep


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    render = "--no-render" not in sys.argv
    if not args:
        args = sorted(f[:-4] for f in os.listdir(OUT) if f.endswith(".glb"))
    data = {}
    if os.path.exists(VALID):
        try:
            data = json.load(open(VALID))
        except Exception:
            data = {}
    for cid in args:
        print(f"[validate] {cid}")
        rep = validate(cid, render)
        data[cid] = rep
        print(json.dumps({k: rep[k] for k in ("tris", "bytes", "bones", "height", "animations", "issues")}))
        with open(VALID, "w") as fh:
            json.dump(dict(sorted(data.items())), fh, indent=1)


if __name__ == "__main__":
    main()
