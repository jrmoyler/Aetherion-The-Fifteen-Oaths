"""Armature construction and skin weights."""
import math
import bpy
import numpy as np
from mathutils import Vector, Matrix
from . import core


class Bone:
    def __init__(self, name, head, tail, parent=None, deform=True, roll_ref=None, ventral=None, half_of=None):
        self.name, self.head, self.tail, self.parent = name, Vector(head), Vector(tail), parent
        self.deform, self.roll_ref = deform, roll_ref
        # joint helper: same rest frame as bone `half_of`, keyed to half its local rotation, owns the
        # crease skin between that limb and the trunk (rotates it about the joint instead of
        # linearly averaging two rigid transforms -- the LBS "collapse" at hips/shoulders)
        self.half_of = half_of
        # ventral helper: head/tail z are placed by place_ventral() at this fraction between the
        # ventral skin (0) and the dorsal spine line (1), measured on the clay SDF
        self.ventral = ventral


def half_bone(src, parent, frac=0.35):
    """joint helper for Bone src (shares its head/direction/roll, shorter)."""
    return Bone(f"half_{src.name}", src.head, src.head + (src.tail - src.head) * frac, parent,
                roll_ref=src.roll_ref, half_of=src.name)


TRUNK = ("hips", "spine1", "spine2", "spine3", "chest", "neck1")


def place_ventral(bones, clay, voxel):
    """Drop helper bones (sternum / belly) into the deep ventral trunk.  Every trunk bone of these
    rigs runs along the dorsal line, so without them the brisket and belly skin is owned by
    the limb roots (upper_*, thigh_*) and crumples / folds whenever a leg swings."""
    hb = [b for b in bones if b.ventral is not None]
    if not hb:
        return
    F, lo = clay.evaluate(voxel)
    pts = []
    for b in bones:
        if b.name in TRUNK:
            pts += [(b.head.y, b.head.z), (b.tail.y, b.tail.z)]
    pts.sort()
    ys = np.array([p[0] for p in pts]); zs = np.array([p[1] for p in pts])
    ix = int(round((0.0 - lo[0]) / voxel))
    for b in hb:
        for end in ("head", "tail"):
            p = getattr(b, end)
            zsp = float(np.interp(p.y, ys, zs))
            iy = int(round((p.y - lo[1]) / voxel))
            iz = int(round((zsp - lo[2]) / voxel))
            col = F[ix, iy, :iz + 1]
            k = iz
            while k > 0 and col[k] < 0:
                k -= 1
            zv = lo[2] + k * voxel
            setattr(b, end, Vector((0.0, p.y, zv + b.ventral * (zsp - zv))))


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


def mesh_adjacency(me):
    """(i, j) undirected edge index arrays of a mesh."""
    e = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get("vertices", e)
    e = e.reshape(-1, 2)
    return e[:, 0], e[:, 1]


def smooth_weights(W, ei, ej, iters=4, lam=0.5, lock=None):
    """umbrella (Laplacian) smoothing of a dense weight matrix over mesh edges."""
    n = len(W)
    deg = np.bincount(ei, minlength=n) + np.bincount(ej, minlength=n)
    deg = np.maximum(deg, 1)[:, None]
    for _ in range(iters):
        acc = np.zeros_like(W)
        np.add.at(acc, ei, W[ej])
        np.add.at(acc, ej, W[ei])
        Wn = (1 - lam) * W + lam * acc / deg
        if lock is not None:
            Wn[lock] = W[lock]
        W = Wn
    return W


# Distance multipliers per bone-name prefix: >1 makes a bone "thinner" (it owns less of the shared
# skin), <1 "fatter".  Limb-root bones sit on the trunk wall; letting them own that skin is what
# made shoulders/brisket/groin crumple whenever a leg swung -- the trunk keeps it instead.
WEIGHT_BIAS = {"upper_": 1.25, "thigh_": 1.25, "upperarm_": 1.2, "arm_": 1.2, "femur": 1.15,
               "chest": 0.9, "spine": 0.9, "hips": 0.95, "sternum": 1.15}


def _bias(name, table):
    for k, v in table.items():
        if name.startswith(k):
            return v
    return 1.0


def geodesic_weights(mesh_ob, arm_ob, clay, s, height, rules=None, verbose=True, bias=None, halves=()):
    """Volumetric geodesic skinning (replaces Blender bone-heat, which silently produced
    cross-body bleeding on the marching-cubes clay: fore-leg bones owning both sides of the
    brisket, ear bones owning the neck, no vertex dominated by chest / neck bones).

    The clay SDF is voxelised; for every deform bone a geodesic distance field is grown
    *through the solid interior only* (skimage MCP), so influence cannot jump across air gaps
    (leg <-> belly, jaw <-> throat, L <-> R).  Weights fall off from the nearest bone over a band
    proportional to local thickness, are Laplacian-smoothed over the surface, then
    rules(name, co_design, W) may apply anatomical corrections (see build.Spec.weight_rules).
    """
    from skimage.graph import MCP_Geometric
    from scipy import ndimage
    vd = height / s / 100.0                    # voxel in design units (~1% of height)
    F, lo = clay.evaluate(vd)
    inside = F < 0.25 * vd
    # crop
    nz = np.argwhere(inside)
    a = np.maximum(nz.min(0) - 2, 0); b = np.minimum(nz.max(0) + 3, inside.shape)
    inside = inside[a[0]:b[0], a[1]:b[1], a[2]:b[2]]
    lo = lo + a * vd
    shape = np.array(inside.shape)
    edt, near = ndimage.distance_transform_edt(~inside, return_indices=True)
    costs = np.where(inside, 1.0, np.inf)
    V = np.array([v.co for v in mesh_ob.data.vertices]) / s       # design coords
    vi = np.clip(np.round((V - lo) / vd).astype(int), 0, shape - 1)
    ni = near[:, vi[:, 0], vi[:, 1], vi[:, 2]].T                    # nearest interior voxel
    off = np.linalg.norm(V - (lo + ni * vd), axis=1)
    hnames = {h for h, _src in halves}
    bones = [bn for bn in arm_ob.data.bones if bn.use_deform and bn.name not in hnames]
    names, cols = [], []
    for bn in bones:
        h = np.array(bn.head_local) / s; t = np.array(bn.tail_local) / s
        n = max(2, int(np.ceil(np.linalg.norm(t - h) / (0.5 * vd))) + 1)
        P = h[None] + np.linspace(0, 1, n)[:, None] * (t - h)[None]
        pi = np.round((P - lo) / vd).astype(int)
        okb = np.all((pi >= 0) & (pi < shape), axis=1)
        pi = pi[okb]
        if not len(pi):
            continue
        dist_out = edt[pi[:, 0], pi[:, 1], pi[:, 2]]
        if dist_out.min() > 3.0:              # bone lies outside the solid (wings, cloth, ...)
            continue
        seeds = pi[dist_out < 0.5]
        if not len(seeds):
            k = np.argmin(dist_out)
            seeds = near[:, pi[k, 0], pi[k, 1], pi[k, 2]][None]
        m = MCP_Geometric(costs, fully_connected=True)
        cum, _ = m.find_costs([tuple(x) for x in seeds])
        d = cum[ni[:, 0], ni[:, 1], ni[:, 2]] * vd + off
        names.append(bn.name); cols.append(d)
    D = np.stack(cols, 1)
    D[~np.isfinite(D)] = 1e3
    import os, json
    table = dict(WEIGHT_BIAS)
    table.update(bias or {})
    if os.environ.get("FORGE_WBIAS"):
        table.update(json.loads(os.environ["FORGE_WBIAS"]))
    D = D * np.array([_bias(nm, table) for nm in names])[None]
    # distal gating: a knee/elbow segment (shin, fore, forearm) must not own skin above its own
    # joint -- the flank fold / armpit belongs to the thigh / upper arm and the trunk; likewise
    # jaw / ears / fangs / palps must not own the throat or neck behind their hinge
    ROOTS = ("thigh_", "upper_", "upperarm_", "arm_", "femur")
    for j, nm in enumerate(names):
        bn = arm_ob.data.bones[nm]
        if not ((bn.parent is not None and bn.parent.name.startswith(ROOTS)) or nm == "jaw"
                or nm.startswith(("ear_", "fang", "palp"))):
            continue
        h = np.array(bn.head_local) / s; ab = np.array(bn.tail_local) / s - h
        tt = (V - h) @ ab / max(ab @ ab, 1e-12)
        D[:, j] += np.maximum(0.0, -tt - 0.05) * np.sqrt(ab @ ab) * 4.0
        if nm.startswith(("ear_", "fang", "palp", "tongue")):
            # appendages own only their own capsule (a boar's ears pointed back over the hump and
            # dragged the withers along with every head turn)
            L = np.sqrt(ab @ ab)
            q = h + np.clip(tt, 0, 1)[:, None] * ab
            dperp = np.linalg.norm(V - q, axis=1)
            D[:, j] += np.maximum(0.0, dperp - 0.6 * L) * 6.0 + np.maximum(0.0, tt - 1.15) * L * 6.0
    dmin = D.min(1, keepdims=True)
    import os
    kb = float(os.environ.get("FORGE_WBAND", "0.55"))
    band = kb * dmin + 0.02 * height / s
    W = np.clip(1.0 - (D - dmin) / band, 0.0, 1.0) ** 2
    # hierarchy mask: a vertex may only blend its dominant bone with that bone's parent and
    # children (no shin weight on the belly, no fore-leg weight on the brisket, no ear on neck)
    idx = {nm: j for j, nm in enumerate(names)}
    allow = np.eye(len(names), dtype=bool)
    for nm in names:
        bn = arm_ob.data.bones[nm]
        par = bn.parent
        while par is not None and par.name not in idx:
            par = par.parent
        if par is not None:
            allow[idx[nm], idx[par.name]] = allow[idx[par.name], idx[nm]] = True
    allow2 = (allow.astype(int) @ allow.astype(int)) > 0          # within two hops
    mode = os.environ.get("FORGE_WMASK", "none")
    if mode in ("pre", "both"):
        W = W * allow[W.argmax(1)]
    ei, ej = mesh_adjacency(mesh_ob.data)
    W = smooth_weights(W / W.sum(1, keepdims=True), ei, ej, iters=int(os.environ.get("FORGE_WSMOOTH", "4")))
    if mode in ("post", "both"):
        W = W * allow2[W.argmax(1)]
    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
    W = split_lips(W, names, V * s, arm_ob, height)
    if halves:
        W, names = transfer_to_halves(W, names, arm_ob, halves)
    if rules is not None:
        W = rules(names, V, W, ei, ej)
    # unkeyed ventral helpers move exactly like their parent: fold their weight into it so the
    # 4-influence limit is not spent on duplicates (they only steer the geodesic ownership)
    for j, nm in enumerate(names):
        bn = arm_ob.data.bones[nm]
        if nm in ("sternum", "belly") and bn.parent is not None and bn.parent.name in names:
            k = names.index(bn.parent.name)
            W[:, k] += W[:, j]
            W[:, j] = 0
    # top-4, normalise
    order = np.argsort(-W, axis=1)[:, :4]
    Wt = np.take_along_axis(W, order, 1)
    Wt[Wt < 0.01] = 0
    Wt /= np.maximum(Wt.sum(1, keepdims=True), 1e-9)
    for vg in list(mesh_ob.vertex_groups):
        mesh_ob.vertex_groups.remove(vg)
    groups = {nm: mesh_ob.vertex_groups.new(name=nm) for nm in names}
    for bn in arm_ob.data.bones:
        if bn.use_deform and bn.name not in groups:
            groups[bn.name] = mesh_ob.vertex_groups.new(name=bn.name)
    for j, nm in enumerate(names):
        rows, kk = np.nonzero(order == j)
        w = Wt[rows, kk]
        sel = w > 0
        for r, ww in zip(rows[sel], w[sel]):
            groups[nm].add([int(r)], float(ww), "REPLACE")
    if verbose:
        dom = np.array(names)[W.argmax(1)]
        u, c = np.unique(dom, return_counts=True)
        print("  geodesic weights:", dict(zip(u.tolist(), c.tolist())))
    if not any(mm.type == "ARMATURE" for mm in mesh_ob.modifiers):
        mm = mesh_ob.modifiers.new("Armature", "ARMATURE"); mm.object = arm_ob
    mesh_ob.parent = arm_ob
    return names, W


def split_lips(W, names, V, arm_ob, height):
    """Mouth: the clay mouth slit is thinner than the weighting voxels, so head/jaw weights blend
    straight across the lips and the lip skin folds whenever the jaw opens.  In front of the
    mouth corner, split head vs jaw by the plane midway between the two bone axes (narrow
    blend), fading back to the geodesic weights behind the corner."""
    if "jaw" not in names or "head" not in names:
        return W
    jh = np.array(arm_ob.data.bones["jaw"].head_local); jt = np.array(arm_ob.data.bones["jaw"].tail_local)
    hh = np.array(arm_ob.data.bones["head"].head_local); ht = np.array(arm_ob.data.bones["head"].tail_local)
    ij, ih = names.index("jaw"), names.index("head")
    ab = jt - jh
    L2 = ab @ ab
    t = (V - jh) @ ab / L2
    # head axis height at the same position along the jaw, then midline
    hb = ht - hh
    th = np.clip((V - hh) @ hb / (hb @ hb), 0, 1.2)
    up = np.array([0.0, 0.0, 1.0])
    zj = (jh + np.clip(t, 0, 1.2)[:, None] * ab) @ up
    zh = (hh + th[:, None] * hb) @ up
    zmid = 0.5 * (zj + zh)
    blend = 0.006 * height
    wj = np.clip(0.5 - (V @ up - zmid) / (2 * blend), 0, 1)        # 1 below the lips
    near = (W[:, ij] + W[:, ih]) > 0.5
    f = np.clip((t - 0.22) / 0.15, 0, 1) * near                      # fade in past the mouth corner
    hj = W[:, ij] + W[:, ih]
    Wn = W.copy()
    Wn[:, ij] = (1 - f) * W[:, ij] + f * hj * wj
    Wn[:, ih] = (1 - f) * W[:, ih] + f * hj * (1 - wj)
    return Wn


def transfer_to_halves(W, names, arm_ob, halves, k=1.0):
    """Move the blended share between a limb root and the trunk onto its joint helper:
    a = min(w_limb, w_trunk); w_limb -= a; w_trunk -= a (proportionally); w_half += 2a."""
    names = list(names)
    for h, src in halves:
        if src not in names:
            continue
        j = names.index(src)
        chain = {src}
        for bn in arm_ob.data.bones[src].children_recursive:
            chain.add(bn.name)
        trunk = np.array([nm not in chain for nm in names])
        wl = W[:, j]
        wt = (W * trunk[None]).sum(1)
        a = k * np.minimum(wl, wt)
        scale = np.where(wt > 1e-9, (wt - a) / np.maximum(wt, 1e-9), 1.0)
        Wn = W.copy()
        Wn[:, trunk] *= scale[:, None]
        Wn[:, j] = wl - a
        W = np.c_[Wn, 2 * a]
        names.append(h)
    return W, names


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
