"""Armature creation (contract bone names) and SDF-driven skin weights."""
import bpy
import mathutils
import numpy as np
from .body import BONES, PARENT, BONE_ID

SOCKETS = {'socket.hand.R': 'hand.R', 'socket.hand.L': 'hand.L', 'socket.back': 'spine2', 'socket.head': 'head'}


def create_armature(body, name='Armature', zoff=0.0):
    arm_data = bpy.data.armatures.new(name + '_data')
    arm = bpy.data.objects.new(name, arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    off = mathutils.Vector((0, 0, zoff))
    for b in BONES:
        h, t = body.bones[b]
        eb = arm_data.edit_bones.new(b)
        eb.head = mathutils.Vector(h) + off
        eb.tail = mathutils.Vector(t) + off
    for b in BONES:
        eb = arm_data.edit_bones[b]
        if PARENT[b]:
            eb.parent = arm_data.edit_bones[PARENT[b]]
            eb.use_connect = False
        if b.startswith('foot') or b.startswith('toe'):
            eb.align_roll(mathutils.Vector((0, 0, 1)))
        else:
            eb.align_roll(mathutils.Vector((0, -1, 0)))
        eb.use_deform = b != 'root'
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def add_sockets(arm, body, zoff, grip_point=None, back_point=None):
    out = {}
    sc = bpy.context.scene
    for sname, bone in SOCKETS.items():
        e = bpy.data.objects.new(sname, None)
        e.empty_display_type = 'ARROWS'
        e.empty_display_size = 0.08
        sc.collection.objects.link(e)
        e.parent = arm
        e.parent_type = 'BONE'
        e.parent_bone = bone
        pb = arm.pose.bones[bone]
        bpy.context.view_layer.update()
        if sname == 'socket.hand.R' and grip_point is not None:
            p = mathutils.Vector(grip_point) + mathutils.Vector((0, 0, zoff))
        elif sname == 'socket.hand.L':
            hf = body.hand_frames['L']
            p = mathutils.Vector(hf['grip']) + mathutils.Vector((0, 0, zoff))
        elif sname == 'socket.back':
            p = mathutils.Vector(back_point if back_point is not None else body.along('spine2', 0.5) + np.array([0, 0.16 * body.s, 0])) + mathutils.Vector((0, 0, zoff))
        else:
            p = mathutils.Vector(body.J['top']) + mathutils.Vector((0, 0, zoff))
        bm = arm.matrix_world @ pb.bone.matrix_local
        M = bm.copy()
        M.translation = p
        e.matrix_world = M
        out[sname] = e
    bpy.context.view_layer.update()
    return out


def _soft_weights(P, body, allowed=None, tau=0.016):
    prims = body.anatomy
    nb = len(BONES)
    dists = np.empty((len(P), len(prims)), dtype=np.float32)
    bid = np.empty(len(prims), dtype=np.int64)
    Pf = P.astype(np.float32)
    for i, (prim, bone, k) in enumerate(prims):
        dists[:, i] = prim(Pf)
        bid[i] = BONE_ID[bone]
        if allowed is not None and bone not in allowed:
            dists[:, i] = 10.0
    dmin = dists.min(axis=1, keepdims=True)
    e = np.exp(-(dists - dmin) / tau)
    W = np.zeros((len(P), nb), dtype=np.float32)
    for i in range(len(prims)):
        W[:, bid[i]] += e[:, i]
    return W


def compute_weights(lo_verts, lo_pid, parts, body, edges, zoff, log=print):
    """lo_verts in the build space (before zoff shift).  Returns (N, nbones) weights."""
    P = lo_verts
    N = len(P)
    nb = len(BONES)
    W = np.zeros((N, nb), dtype=np.float32)
    rigid = np.zeros(N, dtype=bool)
    groups = {}
    for i, pid in enumerate(lo_pid):
        groups.setdefault(int(pid), []).append(i)
    J = body.J
    for pid, idx in groups.items():
        idx = np.array(idx)
        part = parts[pid] if pid < len(parts) and parts[pid] is not None else parts[1]
        mode = part.mode
        Pi = P[idx]
        if mode == 'rigid':
            W[idx, BONE_ID[part.bone]] = 1.0
            rigid[idx] = True
        elif mode == 'soft':
            W[idx] = _soft_weights(Pi, body)
        elif isinstance(mode, tuple) and mode[0] == 'limit':
            W[idx] = _soft_weights(Pi, body, set(mode[1]), mode[2] if len(mode) > 2 else 0.016)
        elif mode == 'skirt':
            zt = J['pelvis'][2] + 0.04 * body.s
            zb = 0.15 * body.s
            s = np.clip((zt - Pi[:, 2]) / (zt - zb), 0, 1)
            sl = 1 / (1 + np.exp(-Pi[:, 0] / 0.05))
            wl = s * 0.55 * sl
            wr = s * 0.55 * (1 - sl)
            W[idx, BONE_ID['thigh.L']] = wl
            W[idx, BONE_ID['thigh.R']] = wr
            W[idx, BONE_ID['hips']] = 1 - wl - wr
            # upper skirt follows the soft body for smooth waist transition
            top = Pi[:, 2] > zt
            if top.any():
                W[idx[top]] = _soft_weights(Pi[top], body)
        elif mode == 'cape':
            z = Pi[:, 2]
            z2 = J['spine2'][2]
            z1 = J['spine1'][2]
            z0 = J['spine'][2]
            a = np.clip((z - z1) / (z2 - z1), 0, 1)
            b = np.clip((z - z0) / (z1 - z0), 0, 1)
            W[idx, BONE_ID['spine2']] = a
            W[idx, BONE_ID['spine1']] = (1 - a) * b
            W[idx, BONE_ID['spine']] = (1 - a) * (1 - b)
        else:
            W[idx] = _soft_weights(Pi, body)
    # smooth soft weights over the mesh
    if edges is not None and len(edges):
        import scipy.sparse as sp
        A = sp.coo_matrix((np.ones(len(edges) * 2), (np.r_[edges[:, 0], edges[:, 1]], np.r_[edges[:, 1], edges[:, 0]])), shape=(N, N)).tocsr()
        deg = np.asarray(A.sum(axis=1)).ravel()
        for it in range(3):
            Wn = (A @ W + W) / (deg[:, None] + 1)
            W = np.where(rigid[:, None], W, Wn)
    # top-4, normalise
    order = np.argsort(-W, axis=1)
    W2 = np.zeros_like(W)
    rows = np.arange(N)[:, None]
    top = order[:, :4]
    W2[rows, top] = W[rows, top]
    W2[W2 < 0.015] = 0
    s = W2.sum(axis=1, keepdims=True)
    s[s == 0] = 1
    W2 /= s
    return W2


def apply_weights(obj, W, arm):
    for i, b in enumerate(BONES):
        if b == 'root':
            continue
        vg = obj.vertex_groups.new(name=b)
        nz = np.nonzero(W[:, i])[0]
        # group by identical weights is slow; add per vertex
        for v in nz:
            vg.add([int(v)], float(W[v, i]), 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    obj.parent = arm
