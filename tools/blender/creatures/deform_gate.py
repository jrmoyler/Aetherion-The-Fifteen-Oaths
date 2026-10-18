"""Deterministic skinning-deformation gate.

For every clip of an imported (glTF) creature it samples every frame, evaluates linear-blend
skinning exactly as the runtime does (Blender's armature modifier == glTF LBS), and measures the
deformed *organic* surface against the rest pose:

  * per-bone-region volume change (cone volume of the region's triangles about the region
    centroid; invariant to rigid motion, collapses when a region crumples),
  * inverted triangles: deformed normal opposes the rest normal carried by the triangle's own
    blended skin rotation (a fold-over / pinch),
  * edge compression / stretch ratios (deformed / rest length).

Regions are the vertices whose dominant weight is a given deform bone. "Torso-front" regions
(chest / shoulder / neck: chest, spine2, scap_*, clav_*, neck*, upper_*, upperarm_*, arm_*) are
gated hard: any of them losing more than LOSS_MAX of its volume fails the clip, as does any
inverted triangle anywhere on the organic skin.

  /opt/blender-venv/bin/python tools/blender/creatures/deform_gate.py <id> [...]   # prints a table
"""
import os
import sys
import json
import numpy as np

LOSS_MAX = 0.15          # chest/shoulder/neck region volume loss limit
GAIN_MAX = 0.35          # report-only: region bulging
FLIP_DOT = 0.0           # deformed normal . carried rest normal below this == inverted
MIN_AREA_FRAC = 0.05     # ignore specks smaller than this fraction of the median rest area
MIN_QUALITY = 0.15       # ignore needle slivers: 4*sqrt(3)*A / sum(e^2) (1 = equilateral); their
                         # sign flips from sub-millimetre jitter and is invisible
MIN_REGION_TRIS = 24
FRONT_PREFIX = ("chest", "spine2", "scap_", "clav_", "neck", "upper_", "upperarm_", "arm_", "sternum",
                "half_upper", "half_arm")


def group_of(bone):
    """anatomical region a bone's skin belongs to (joint helpers fold into their limb)."""
    b = bone[5:] if bone.startswith("half_") else bone
    side = b[-2:] if b[-2:] in ("_L", "_R") else ""
    if b.startswith(("scap_", "upper_", "clav_", "upperarm_", "arm_")):
        return "shoulder" + side
    if b in ("chest", "sternum", "spine2"):
        return "chest"
    if b.startswith("neck"):
        return "neck"
    return b


def is_front(group):
    return group.startswith(("shoulder", "chest", "neck"))


# ------------------------------------------------------------------------------- topology
def _weld(co, tris):
    """weld seam-split vertices (glTF duplicates at UV / material seams)."""
    key = np.round(co / 1e-5).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.ravel()
    return inv, first, inv[tris]


def _components(nv, tris):
    parent = np.arange(nv)

    def find(a):
        root = a
        while parent[root] != root:
            root = parent[root]
        while parent[a] != root:
            parent[a], a = root, parent[a]
        return root

    for a, b, c in tris:
        ra, rb, rc = find(a), find(b), find(c)
        parent[rb] = ra
        parent[find(rc)] = ra
    return np.array([find(i) for i in range(nv)])


def organic_mask(co, tris):
    """vertices belonging to the skinned organic shell (the large connected component(s)),
    as opposed to the rigid kit parts (claws, spikes, plates) joined into the same mesh."""
    inv, first, wt = _weld(co, tris)
    nw = len(first)
    comp = _components(nw, wt)
    ids, counts = np.unique(comp, return_counts=True)
    keep = set(ids[counts >= 0.1 * counts.max()])
    wmask = np.array([c in keep for c in comp])
    return wmask[inv], inv, wt


# ------------------------------------------------------------------------------- skinning data
def mesh_arrays(me):
    nv = len(me.vertices)
    co = np.empty(nv * 3, np.float64)
    me.vertices.foreach_get("co", co)
    me.calc_loop_triangles()
    nt = len(me.loop_triangles)
    tris = np.empty(nt * 3, np.int64)
    me.loop_triangles.foreach_get("vertices", tris)
    return co.reshape(nv, 3), tris.reshape(nt, 3)


def weights(ob, bone_names):
    """dense (nv, nb) weight matrix in bone_names order."""
    gi = {g.index: g.name for g in ob.vertex_groups}
    col = {n: i for i, n in enumerate(bone_names)}
    W = np.zeros((len(ob.data.vertices), len(bone_names)))
    for v in ob.data.vertices:
        for g in v.groups:
            n = gi.get(g.group)
            if n in col:
                W[v.index, col[n]] += g.weight
    s = W.sum(1, keepdims=True)
    s[s < 1e-9] = 1
    return W / s


def skin_mats(arm, mesh_ob, bone_names):
    """(nb, 4, 4) skinning matrices in the mesh's local space for the current frame."""
    A = arm.matrix_world
    Mi = mesh_ob.matrix_world.inverted()
    out = np.empty((len(bone_names), 4, 4))
    for i, n in enumerate(bone_names):
        pb = arm.pose.bones[n]
        S = Mi @ A @ pb.matrix @ pb.bone.matrix_local.inverted() @ A.inverted() @ mesh_ob.matrix_world
        out[i] = np.array(S)
    return out


# ------------------------------------------------------------------------------- measures
def tri_normals(P, T):
    n = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    a = np.linalg.norm(n, axis=1)
    return n / np.maximum(a, 1e-12)[:, None], a * 0.5


def axis_volume(P, T, apex):
    """volume between a skin patch and its bone axis: sum of tetrahedra (apex_t, a, b, c) where
    apex_t is the closest point on the region's dominant bone segment, skinned with the
    triangle's own blended transform (i.e. where LBS puts the bone-interior point under that
    skin).  Any rigid motion keeps it exactly; LBS collapse (skin sinking onto the bone line),
    crumpling and pinching between bones shrink it."""
    a, b, d = P[T[:, 0]] - apex, P[T[:, 1]] - apex, P[T[:, 2]] - apex
    return abs(np.einsum("ij,ij->i", a, np.cross(b, d)).sum()) / 6.0


class Gate:
    def __init__(self, arm, mesh_ob):
        import bpy
        self.arm, self.ob = arm, mesh_ob
        self.bones = [b.name for b in arm.data.bones if b.name in mesh_ob.vertex_groups]
        arm.data.pose_position = "REST"
        bpy.context.view_layer.update()
        co, tris = mesh_arrays(mesh_ob.data)
        arm.data.pose_position = "POSE"
        self.rest = co
        self.W = weights(mesh_ob, self.bones)
        omask, inv, wt = organic_mask(co, tris)
        self.omask = omask
        torg = tris[omask[tris].all(1)]
        n0, a0 = tri_normals(co, torg)
        e2 = sum(((co[torg[:, i]] - co[torg[:, (i + 1) % 3]]) ** 2).sum(1) for i in range(3))
        q = 4 * np.sqrt(3) * a0 / np.maximum(e2, 1e-18)
        keep = (a0 > MIN_AREA_FRAC * np.median(a0)) & (q > MIN_QUALITY)
        self.T = torg[keep]
        self.n0 = n0[keep]
        # edges (welded, unique) of the organic shell
        e = np.sort(np.concatenate([self.T[:, [0, 1]], self.T[:, [1, 2]], self.T[:, [2, 0]]]), 1)
        self.E = np.unique(e, axis=0)
        self.L0 = np.linalg.norm(co[self.E[:, 0]] - co[self.E[:, 1]], axis=1)
        # regions: dominant bone per vertex, triangle -> majority
        dom = self.W.argmax(1)
        td = dom[self.T]
        maj = np.where(td[:, 1] == td[:, 2], td[:, 1], td[:, 0])
        # per-triangle apex: closest point on its dominant bone segment (mesh-local rest coords)
        A = arm.matrix_world; Mi = mesh_ob.matrix_world.inverted()
        apex = np.zeros((len(self.T), 3))
        for j, n in enumerate(self.bones):
            sel = maj == j
            if not sel.any():
                continue
            bn = arm.data.bones[n]
            h = np.array(Mi @ A @ bn.head_local); tl = np.array(Mi @ A @ bn.tail_local)
            c = co[self.T[sel]].mean(1)
            ab = tl - h
            u = np.clip((c - h) @ ab / max(ab @ ab, 1e-12), 0, 1)
            apex[sel] = h + u[:, None] * ab
        # regions: anatomical groups of dominant bones
        grp = np.array([group_of(self.bones[j]) for j in maj])
        self.regions, self.apex, self.rsel = {}, {}, {}
        for gname in np.unique(grp):
            sel = np.where(grp == gname)[0]
            if len(sel) >= MIN_REGION_TRIS:
                self.regions[str(gname)] = self.T[sel]
                self.apex[str(gname)] = apex[sel]
                self.rsel[str(gname)] = sel
        self.bidx = {n: i for i, n in enumerate(self.bones)}
        self.V0 = {n: axis_volume(co, t, self.apex[n]) for n, t in self.regions.items()}
        self.edge_bone = dom[self.E[:, 0]]

    def deform(self):
        S = skin_mats(self.arm, self.ob, self.bones)
        self._S = S
        Ph = np.c_[self.rest, np.ones(len(self.rest))]
        # blended matrix per vertex (LBS): sum_i w_i S_i
        M = np.einsum("vb,bij->vij", self.W, S)
        P = np.einsum("vij,vj->vi", M, Ph)[:, :3]
        self._M = M
        return P, M[:, :3, :3]

    def frame_metrics(self):
        P, R = self.deform()
        n1, _ = tri_normals(P, self.T)
        Rt = R[self.T].mean(1)                       # triangle's blended linear part
        carried = np.einsum("tij,tj->ti", Rt, self.n0)
        carried /= np.maximum(np.linalg.norm(carried, axis=1), 1e-12)[:, None]
        dots = np.einsum("ij,ij->i", n1, carried)
        flips = np.where(dots < FLIP_DOT)[0]
        L = np.linalg.norm(P[self.E[:, 0]] - P[self.E[:, 1]], axis=1)
        ratio = L / np.maximum(self.L0, 1e-9)
        vol = {}
        for n, t in self.regions.items():
            Mt = self._M[t].mean(1)                  # triangle's blended skin transform
            ap = np.einsum("tij,tj->ti", Mt[:, :3, :3], self.apex[n]) + Mt[:, :3, 3]
            vol[n] = axis_volume(P, t, ap) / max(self.V0[n], 1e-12) - 1.0
        return dict(flips=flips, ratio=ratio, vol=vol, P=P)


def _top4(W):
    order = np.argsort(-W, axis=1)[:, :4]
    Wt = np.take_along_axis(W, order, 1)
    Wt[Wt < 0.005] = 0
    Wt /= np.maximum(Wt.sum(1, keepdims=True), 1e-9)
    out = np.zeros_like(W)
    np.put_along_axis(out, order, Wt, 1)
    return out


def corrective_pass(arm, mesh_ob, actions, iters=30, rings=3, smooth_iters=4, log=print):
    """Gate-driven corrective weighting (runs inside the forge, after the clips are baked):
    evaluate every frame of every clip, collect the vertices of inverted triangles and try two
    local repairs there (everything else locked): Laplacian *smoothing* (flattens steep weight
    gradients that fold stretched skin) and *sharpening* toward the dominant bone (lets skin
    that is being crushed between two limbs ride one of them rigidly instead of folding).  The
    repair that removes more folds is kept; weights are re-limited to 4 influences each time;
    the best iterate wins."""
    import bpy
    from lib.rig import smooth_weights
    g = Gate(arm, mesh_ob)
    me = mesh_ob.data
    e = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get("vertices", e)
    e = e.reshape(-1, 2)
    ei, ej = e[:, 0], e[:, 1]
    ad = arm.animation_data or arm.animation_data_create()
    frames = []
    for act in actions:
        f0, f1 = (int(x) for x in act.frame_range)
        frames += [(act, f) for f in range(f0, f1 + 1)]
    # cache skin matrices per frame once (weights change, poses do not)
    mats = []
    for act, f in frames:
        if ad.action != act:
            ad.action = act
            if act.slots:
                ad.action_slot = act.slots[0]
        bpy.context.scene.frame_set(f)
        mats.append(skin_mats(arm, mesh_ob, g.bones))
    ad.action = None
    Ph = np.c_[g.rest, np.ones(len(g.rest))]

    def sweep(W):
        bad = np.zeros(len(W), bool)
        total = 0
        Wt = W[g.T]                                         # (t, 3, nb)
        for S in mats:
            M = np.einsum("vb,bij->vij", W, S)
            P = np.einsum("vij,vj->vi", M, Ph)[:, :3]
            n1, _ = tri_normals(P, g.T)
            Rt = M[g.T, :3, :3].mean(1)
            c = np.einsum("tij,tj->ti", Rt, g.n0)
            fl = np.einsum("ij,ij->i", n1, c) < FLIP_DOT
            k = int(fl.sum())
            if k:
                total += k
                bad[g.T[fl].ravel()] = True
        return total, bad

    def grow(m, r):
        for _ in range(r):
            gm = m.copy()
            gm[ej[m[ei]]] = True
            gm[ei[m[ej]]] = True
            m = gm
        return m & g.omask

    depth = np.array([len(arm.data.bones[n].parent_recursive) for n in g.bones], float)
    W = _top4(g.W)
    total, bad = sweep(W)
    hist = [total]
    log(f"  corrective pass 0: {total} inverted tri-frames, {int(bad.sum())} verts")
    touched = np.zeros(len(W), bool)
    stall = 0
    for it in range(1, iters + 1):
        if total == 0:
            break
        zone = grow(bad, rings)
        cands = []
        Ws = _top4(smooth_weights(W, ei, ej, iters=smooth_iters, lam=0.6, lock=~zone))
        cands.append(("smooth", Ws, zone))
        core = grow(bad, 1)
        Wp = W.copy()
        Wp[core] = Wp[core] ** 2
        Wp[core] /= np.maximum(Wp[core].sum(1, keepdims=True), 1e-9)
        cands.append(("sharpen", _top4(Wp), core))
        # "proximal": crease skin rides the least-moving (most proximal) bone it is weighted to --
        # skin that stretches does not invert, skin crushed between two limbs does
        Wq = W.copy()
        sub = Wq[core]
        big = sub > 0.08
        dsel = np.where(big, depth[None, :], 999)
        pj = dsel.argmin(1)
        oh = np.zeros_like(sub); oh[np.arange(len(sub)), pj] = 1.0
        Wq[core] = 0.5 * sub + 0.5 * oh
        cands.append(("proximal", _top4(Wq), core))
        Wz = _top4(smooth_weights(Wq, ei, ej, iters=smooth_iters, lam=0.6, lock=~zone))
        cands.append(("proximal+smooth", Wz, zone))
        res = [(sweep(Wc), nm, Wc, z) for nm, Wc, z in cands]
        (t2, b2), nm, Wc, z = min(res, key=lambda r: r[0][0])
        log(f"  corrective pass {it}: {t2} inverted tri-frames ({nm}), {int(b2.sum())} verts")
        hist.append(t2)
        if t2 < total:
            W, total, bad = Wc, t2, b2
            touched |= z
            stall = 0
        else:
            stall += 1
            rings += 1
            if stall >= 4:
                break
    # write back (organic vertices that were touched)
    idx = np.where(touched)[0].tolist()
    if idx:
        for j, n in enumerate(g.bones):
            vg = mesh_ob.vertex_groups[n]
            vg.remove(idx)
            col = W[idx, j]
            for i, w in zip(idx, col):
                if w > 0:
                    vg.add([i], float(w), "REPLACE")
    return hist


def run(arm, mesh_ob, actions, set_frame):
    """actions: {clip: (f0, f1)}; set_frame(clip, frame) poses the armature."""
    g = Gate(arm, mesh_ob)
    out = {"regions": sorted(g.regions), "front_regions": sorted(n for n in g.regions if is_front(n)),
           "organic_tris": int(len(g.T)), "clips": {}}
    fails = []
    for clip, (f0, f1) in actions.items():
        worst = {"front_loss": 0.0, "front_loss_region": None, "front_loss_frame": None,
                 "any_loss": 0.0, "any_loss_region": None, "max_gain": 0.0, "max_gain_region": None,
                 "flips": 0, "flip_frame": None, "flip_bones": [],
                 "min_edge_ratio": 1.0, "max_edge_ratio": 1.0, "p01_edge_ratio": 1.0}
        for f in range(int(f0), int(f1) + 1):
            set_frame(clip, f)
            m = g.frame_metrics()
            for n, dv in m["vol"].items():
                if is_front(n) and -dv > worst["front_loss"]:
                    worst.update(front_loss=-dv, front_loss_region=n, front_loss_frame=f)
                if -dv > worst["any_loss"]:
                    worst.update(any_loss=-dv, any_loss_region=n)
                if dv > worst["max_gain"]:
                    worst.update(max_gain=dv, max_gain_region=n)
            nf = len(m["flips"])
            if nf > worst["flips"]:
                dom = g.W.argmax(1)[g.T[m["flips"], 0]]
                bn, cnt = np.unique(dom, return_counts=True)
                worst.update(flips=nf, flip_frame=f,
                             flip_bones=[g.bones[i] for i in bn[np.argsort(-cnt)][:4]])
            r = m["ratio"]
            worst["min_edge_ratio"] = min(worst["min_edge_ratio"], float(r.min()))
            worst["max_edge_ratio"] = max(worst["max_edge_ratio"], float(r.max()))
            worst["p01_edge_ratio"] = min(worst["p01_edge_ratio"], float(np.percentile(r, 1)))
        for k, v in list(worst.items()):
            if isinstance(v, float):
                worst[k] = round(v, 4)
        reasons = []
        if worst["front_loss"] > LOSS_MAX:
            reasons.append(f"{worst['front_loss_region']} volume -{worst['front_loss'] * 100:.0f}% @f{worst['front_loss_frame']}")
        if worst["flips"] > 0:
            reasons.append(f"{worst['flips']} inverted tris @f{worst['flip_frame']} ({','.join(worst['flip_bones'])})")
        worst["ok"] = not reasons
        worst["reasons"] = reasons
        out["clips"][clip] = worst
        if reasons:
            fails.append(f"{clip}: " + "; ".join(reasons))
    out["ok"] = not fails
    out["fails"] = fails
    out["limits"] = {"front_volume_loss_max": LOSS_MAX, "inverted_tris_max": 0,
                     "tri_quality_min": MIN_QUALITY, "tri_area_min_frac": MIN_AREA_FRAC}
    return out


# ------------------------------------------------------------------------------- CLI
def gate_glb(path):
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH" and o.parent == arm)
    acts = {}
    for a in bpy.data.actions:
        nm = a.name.split("_")[0] if a.name not in ("idle", "walk", "run", "attack", "hit", "death", "roar") else a.name
        acts[nm] = a
    ad = arm.animation_data or arm.animation_data_create()
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)

    def set_frame(clip, f):
        a = acts[clip]
        if ad.action != a:
            ad.action = a
            if a.slots:
                ad.action_slot = a.slots[0]
        bpy.context.scene.frame_set(f)

    ranges = {n: tuple(a.frame_range) for n, a in sorted(acts.items())}
    return run(arm, mesh, ranges, set_frame)


def table(cid, rep):
    lines = [f"== {cid}  {'PASS' if rep['ok'] else 'FAIL'}"]
    for c, w in rep["clips"].items():
        lines.append(f"  {c:7s} front-loss {w['front_loss'] * 100:5.1f}% ({w['front_loss_region']}@{w['front_loss_frame']})"
                     f"  any-loss {w['any_loss'] * 100:5.1f}% ({w['any_loss_region']})"
                     f"  gain {w['max_gain'] * 100:5.1f}% ({w['max_gain_region']})"
                     f"  flips {w['flips']:3d} {w['flip_bones']}  edge[min {w['min_edge_ratio']:.2f} p1 {w['p01_edge_ratio']:.2f}"
                     f" max {w['max_edge_ratio']:.2f}]")
    return "\n".join(lines)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.environ.get("FORGE_OUT", os.path.join(here, "..", "..", "..", "game", "public", "assets", "creatures"))
    ids = [a for a in sys.argv[1:] if not a.startswith("--")]
    res = {}
    for cid in ids:
        rep = gate_glb(os.path.join(out, f"{cid}.glb"))
        res[cid] = rep
        print(table(cid, rep), flush=True)
    if "--json" in sys.argv:
        print(json.dumps(res))
