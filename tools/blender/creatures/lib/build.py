"""The forge pipeline: spec -> high clay mesh + hard parts -> scaled -> low mesh -> rig/skin ->
UV + Cycles bake -> slot materials -> procedural clips -> glTF (+Y up, faces +Z)."""
import os
import json
import math
import time
import bpy
import numpy as np
from mathutils import Vector, Matrix
from . import core, rig as rigmod, mats, anim

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_DIR = os.path.join(REPO, "game", "public", "assets", "creatures")
SCRATCH = os.environ.get("FORGE_SCRATCH", "/tmp/creatureforge")


class Part:
    def __init__(self, ob, bone, slot="accent", surf=None, detail=None):
        self.ob, self.bone, self.slot, self.surf, self.detail = ob, bone, slot, surf, detail


class Spec:
    def __init__(self, archetype, oath=None):
        self.archetype, self.oath = archetype, oath
        self.id = archetype if not oath else f"{archetype}-{oath}"
        self.height = 1.0
        self.clay = None
        self.voxel = 0.008
        self.slot_fn = None  # f(x, y, z) in design coords -> slot name for organic faces
        self.surface = None  # hi material for organic clay
        self.low_tris = 9000
        self.parts = []
        self.bones = []
        self.legs = []
        self.hips = "hips"
        self.clip_fn = None  # f(ctx) -> {clip: (frames, pose_fn)}
        self.tint = {"body": "#808080", "secondary": "#606060", "accent": "#a08060", "glow": "#ffaa55"}
        self.glow_strength = 4.0
        self.loc_bones = None
        self.bake_res = 1024
        self.ao_samples = 4
        self.extra = {}
        self.weighting = "geodesic"   # organic skin: "geodesic" (volumetric, default) | "heat"
        # soft joint limits (deg from rest) on the baked clips, per bone-name prefix
        self.joint_limits = {"thigh_": 36, "upper_": 34, "shin_": 50, "fore_": 50, "meta_": 50, "carp_": 55,
                             "femur": 34, "tibia": 55, "arm_": 70}
        self.corrective = True        # gate-driven corrective weight smoothing after the clips bake
        self.weight_rules = None      # f(bone_names, V_design, W, ei, ej) -> W  anatomical fixes

    def part(self, ob, bone, slot="accent", surf=None, detail=None):
        """detail=(subsurf_levels, displace_strength_m, noise_size_m): extra geometric detail on the
        bake-source copy only (the game mesh keeps the low part)."""
        self.parts.append(Part(ob, bone, slot, surf, detail))
        return ob


class Ctx:
    """Measurements handed to clip builders (in final metres)."""

    def __init__(self, spec, s, arm):
        self.s = s
        self.spec = spec
        self.arm = arm
        self.bone = {b.name: b for b in arm.data.bones}

    def length(self, name):
        return self.bone[name].length

    def head(self, name):
        return self.bone[name].head_local.copy()

    def tail(self, name):
        return self.bone[name].tail_local.copy()


def build(spec, out_dir=None, verbose=True):
    t0 = time.time()
    preview = "FORGE_OUT" in os.environ
    out_dir = out_dir or os.environ.get("FORGE_OUT", OUT_DIR)
    scratch = os.path.join(SCRATCH, spec.id)
    os.makedirs(scratch, exist_ok=True)
    # 1. high organic
    hi = None
    if spec.clay is not None:
        v, f = spec.clay.polygonize(spec.voxel)
        hi = core.mesh_from_arrays("hi_organic", v, f)
        if verbose:
            print(f"  clay: {len(f)} tris ({time.time() - t0:.1f}s)")
        rigmod.place_ventral(spec.bones, spec.clay, spec.height / 100.0)
    objs = ([hi] if hi else []) + [p.ob for p in spec.parts]
    lo_b, hi_b = core.stats_bbox(objs)
    s = spec.height / hi_b.z
    for o in objs:
        o.scale = (s, s, s)
        core.apply_transform(o)
    rigmod.scale_bones(spec.bones, s)
    # 2. armature
    arm = rigmod.build_armature(spec.bones, "Armature")
    # 3. low organic + skin
    pieces = []
    face_slots = []
    if hi:
        lo = core.duplicate(hi, "lo_organic")
        core.decimate_to(lo, spec.low_tris)
        if spec.weighting == "heat":
            rigmod.heat_weights(lo, arm)
        else:
            rigmod.geodesic_weights(lo, arm, spec.clay, s, spec.height, rules=spec.weight_rules,
                                    halves=[(b.name, b.half_of) for b in spec.bones if b.half_of])
        for m in list(lo.modifiers):
            lo.modifiers.remove(m)
        lo.parent = None
        lo.matrix_world = Matrix.Identity(4)
        fn = spec.slot_fn or (lambda x, y, z: "body")
        for p in lo.data.polygons:
            c = p.center / s
            face_slots.append(fn(c.x, c.y, c.z))
        pieces.append(lo)
        n_lo_faces = len(lo.data.polygons)
    highs = [hi] if hi else []
    if hi is not None:
        mats.assign(hi, spec.surface)
    for i, p in enumerate(spec.parts):
        h = core.duplicate(p.ob, f"hi_part{i}")
        if p.detail:
            core.add_detail(h, *p.detail, seed=i)
        mats.assign(h, p.surf or mats.surface("bone", f"hi_auto{i}"))
        highs.append(h)
        if callable(p.bone):
            rigmod.func_groups(p.ob, p.bone, s)
        else:
            rigmod.rigid_group(p.ob, p.bone)
        face_slots += [p.slot] * len(p.ob.data.polygons)
        pieces.append(p.ob)
    game = core.join(pieces, spec.id) if len(pieces) > 1 else pieces[0]
    game.name = spec.id
    # materials (placeholders now, real textures after bake)
    slot_mats = {}
    for sl in mats.SLOTS:
        m = bpy.data.materials.new(sl)
        m.use_nodes = True
        slot_mats[sl] = m
    game.data.materials.clear()
    used = [sl for sl in mats.SLOTS if sl in face_slots]
    for sl in used:
        game.data.materials.append(slot_mats[sl])
    idx = {sl: i for i, sl in enumerate(used)}
    game.data.polygons.foreach_set("material_index", [idx[sl] for sl in face_slots])
    # 4. UV + bake
    n_org = n_lo_faces if hi else 0
    if hi:
        core.bone_seam_unwrap(game, arm, n_org, spec.extra.get("cut_dirs"))
    else:
        core.smart_uv(game, 66.0, 0.003)
    ext = 0.012 * spec.height / 1.1
    fast = os.environ.get("FORGE_FAST") == "1"
    if os.environ.get("FORGE_NOBAKE") == "1":
        texs = None
    else:
      texs = mats.bake(game, highs, scratch, 512 if fast else spec.bake_res, extrusion=ext, ray=ext * 2.5,
                     ao_samples=4 if fast else spec.ao_samples, prefix=f"T_{spec.id}")
    for sl in used:
        tint = mats.hex2rgb(spec.tint[sl])
        if sl == "glow":
            mats.final_material(sl, texs, base=tint, emissive=tint, strength=spec.glow_strength)
        else:
            mats.final_material(sl, texs, base=tint)
    for h in highs:
        bpy.data.objects.remove(h, do_unlink=True)
    # 5. skin finalise
    rigmod.limit_and_normalize(game, 4)
    for m in list(game.modifiers):
        game.modifiers.remove(m)
    mod = game.modifiers.new("Armature", "ARMATURE"); mod.object = arm
    game.parent = arm
    game.matrix_parent_inverse = Matrix.Identity(4)
    # 6. animation
    ctx = Ctx(spec, s, arm)
    R = anim.Rig(arm, spec.legs, spec.hips, halves=[(b.name, b.half_of) for b in spec.bones if b.half_of],
                 limits=spec.joint_limits)
    clips = spec.clip_fn(ctx)
    for name, (frames, fn) in clips.items():
        R.bake_clip(name, frames, fn, spec.loc_bones)
    R.finalize()
    # 6b. gate-driven corrective weighting: smooth weights only where some baked frame folds skin
    if hi is not None and spec.corrective:
        import sys as _sys
        _sys.path.insert(0, HERE)
        import deform_gate
        acts = [bpy.data.actions[n] for n in clips]
        spec.extra["corrective_hist"] = deform_gate.corrective_pass(arm, game, acts, log=print if verbose else (lambda *a: None))
    # 7. face +Z in glTF  (Blender -Y): rotate 180 about Z, apply
    game.parent = None
    for o in (arm, game):
        o.rotation_euler = (0, 0, math.pi)
        core.apply_transform(o)
    game.parent = arm
    game.matrix_parent_inverse = Matrix.Identity(4)
    tris = core.tri_count(game)
    # 8. export
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{spec.id}.glb")
    core.activate(game)
    arm.select_set(True)
    for o in list(bpy.data.objects):
        if o not in (game, arm):
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True,
        export_apply=False, export_animations=True, export_animation_mode="ACTIONS",
        export_force_sampling=True, export_frame_step=1, export_anim_single_armature=True,
        export_reset_pose_bones=True, export_optimize_animation_size=True,
        export_def_bones=False, export_skins=True, export_influence_nb=4, export_all_influences=False,
        export_image_format="JPEG", export_jpeg_quality=86, export_materials="EXPORT",
        export_draco_mesh_compression_enable=False, export_morph=False, export_extras=False,
        export_leaf_bone=False, export_cameras=False, export_lights=False, export_tangents=False)
    size = os.path.getsize(path)
    info = {
        "id": spec.id, "archetype": spec.archetype, "oath": spec.oath,
        "file": f"/assets/creatures/{spec.id}.glb", "bytes": size, "tris": tris,
        "height": round(spec.height, 3), "clips": list(clips.keys()),
        "bones": len(arm.data.bones),
    }
    if verbose:
        print(f"  -> {path} {size / 1e6:.2f} MB, {tris} tris, {time.time() - t0:.1f}s")
    if not preview:
        update_manifest(info, out_dir)
    return info


def update_manifest(info, out_dir=OUT_DIR):
    mp = os.path.join(out_dir, "manifest.json")
    data = []
    if os.path.exists(mp):
        try:
            with open(mp) as fh:
                data = json.load(fh)
        except Exception:
            data = []
    data = [d for d in data if d.get("id") != info["id"]]
    rec = {k: info[k] for k in ("id", "archetype", "oath", "file", "bytes", "tris", "height", "clips")}
    data.append(rec)
    data.sort(key=lambda d: (d["archetype"], d["oath"] or ""))
    with open(mp, "w") as fh:
        json.dump(data, fh, indent=1)
