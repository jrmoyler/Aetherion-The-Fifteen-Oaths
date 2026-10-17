"""Armature construction and skin weights."""
import math
import bpy
import numpy as np
from mathutils import Vector, Matrix
from . import core


class Bone:
    def __init__(self, name, head, tail, parent=None, deform=True, roll_ref=None):
        self.name, self.head, self.tail, self.parent = name, Vector(head), Vector(tail), parent
        self.deform, self.roll_ref = deform, roll_ref


def build_armature(bones, name="Armature"):
    arm = bpy.data.armatures.new(name)
    ob = core.link(bpy.data.objects.new(name, arm))
    core.activate(ob)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for b in bones:
        e = arm.edit_bones.new(b.name)
        e.head, e.tail = b.head, b.tail
        d = (b.tail - b.head).normalized()
        # Convention: every bone that is not mainly lateral gets local X == world +X, so a
        # positive X rotation is the same world-space pitch for spines, necks, tails and legs
        # ("tip up / back").  Lateral bones (arms, clavicles, wings) keep local Z ~ up.
        if b.roll_ref is not None:
            ref = Vector(b.roll_ref)
        elif abs(d.x) < 0.7:
            ref = Vector((1, 0, 0)).cross(d)
        else:
            ref = Vector((0, 0, 1))
        e.align_roll(ref)
        e.use_deform = b.deform
        eb[b.name] = e
    for b in bones:
        if b.parent:
            eb[b.name].parent = eb[b.parent]
            eb[b.name].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in ob.pose.bones:
        pb.rotation_mode = "XYZ"
    return ob


def scale_bones(bones, s):
    for b in bones:
        b.head = b.head * s
        b.tail = b.tail * s


def heat_weights(mesh_ob, arm_ob):
    """Blender bone-heat skinning; falls back to distance weights if heat fails."""
    core.activate(mesh_ob)
    arm_ob.select_set(True)
    bpy.context.view_layer.objects.active = arm_ob
    ok = True
    try:
        with bpy.context.temp_override(active_object=arm_ob, object=arm_ob,
                                       selected_objects=[mesh_ob, arm_ob],
                                       selected_editable_objects=[mesh_ob, arm_ob]):
            bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    except Exception as e:  # pragma: no cover
        print("heat failed", e)
        ok = False
    # check every vertex got weights
    empty = sum(1 for v in mesh_ob.data.vertices if len(v.groups) == 0 or sum(g.weight for g in v.groups) < 1e-4)
    if not ok or empty > len(mesh_ob.data.vertices) * 0.002:
        print(f"  heat weights incomplete ({empty} unweighted) -> distance fill")
        distance_weights(mesh_ob, arm_ob, only_empty=ok)
    return mesh_ob


def distance_weights(mesh_ob, arm_ob, only_empty=False, power=4.0):
    bones = [b for b in arm_ob.data.bones if b.use_deform]
    H = np.array([b.head_local for b in bones]); T = np.array([b.tail_local for b in bones])
    for b in bones:
        if b.name not in mesh_ob.vertex_groups:
            mesh_ob.vertex_groups.new(name=b.name)
    vg = {b.name: mesh_ob.vertex_groups[b.name] for b in bones}
    V = np.array([v.co for v in mesh_ob.data.vertices])
    D = np.empty((len(V), len(bones)))
    for j in range(len(bones)):
        ab = T[j] - H[j]; l2 = max(ab @ ab, 1e-9)
        t = np.clip((V - H[j]) @ ab / l2, 0, 1)
        D[:, j] = np.linalg.norm(V - (H[j] + t[:, None] * ab), axis=1)
        # side gating: lateral bones do not influence the opposite side
        mx = (H[j][0] + T[j][0]) * 0.5
        if abs(mx) > 0.04:
            wrong = V[:, 0] * np.sign(mx) < -0.01
            D[wrong, j] += 10.0
    for i, v in enumerate(mesh_ob.data.vertices):
        if only_empty and len(v.groups) and sum(g.weight for g in v.groups) > 1e-4:
            continue
        order = np.argsort(D[i])[:4]
        w = 1.0 / (D[i][order] ** power + 1e-8)
        w /= w.sum()
        for j, ww in zip(order, w):
            if ww > 0.01:
                vg[bones[j].name].add([i], float(ww), "REPLACE")
    if not any(m.type == "ARMATURE" for m in mesh_ob.modifiers):
        m = mesh_ob.modifiers.new("Armature", "ARMATURE"); m.object = arm_ob
        mesh_ob.parent = arm_ob


def rigid_group(ob, bone):
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
    return ob


def limit_and_normalize(ob, limit=4):
    core.activate(ob)
    with bpy.context.temp_override(object=ob, active_object=ob):
        bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=limit)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
        bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.005)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)


def func_groups(ob, fn, s=1.0):
    """weights from fn(design_space_co) -> {bone: weight} (co divided by the global scale s)."""
    groups = {}
    for v in ob.data.vertices:
        w = fn(v.co / s)
        tot = sum(w.values()) or 1.0
        for b, x in w.items():
            if x <= 0:
                continue
            if b not in groups:
                groups[b] = ob.vertex_groups.new(name=b)
            groups[b].add([v.index], x / tot, "REPLACE")
    return ob
