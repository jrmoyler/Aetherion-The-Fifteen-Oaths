"""Drake: four-legged winged reptile — long horned head on an S neck, heavy forequarters,
dorsal spine row to a bladed tail, wings with real arm+finger bones and skinned membranes
(semi-folded rest pose so both folded walk and full spread read correctly).
oath-01: ember-cracked plates with glowing fissures and a furnace throat."""
import math
import numpy as np
from mathutils import Vector, kdtree
from lib import core, kit, mats, quad
from lib.rig import Bone
from lib.sdf import Clay, rot_to
from lib.build import Spec
from lib.anim import env

V = Vector
J = dict(
    pelvis=(0, -0.70, 0.95), s1=(0, -0.30, 1.03), s2=(0, 0.15, 1.12), n0=(0, 0.48, 1.22),
    n1=(0, 0.78, 1.58), h0=(0, 0.98, 1.90), snout=(0, 1.45, 1.82),
    jaw0=(0, 1.04, 1.81), jaw1=(0, 1.42, 1.74),
    t0=(0, -0.85, 0.95), t1=(0, -1.17, 0.88), t2=(0, -1.48, 0.78), t3=(0, -1.78, 0.66), t4=(0, -2.05, 0.55),
    t5=(0, -2.28, 0.46), t6=(0, -2.48, 0.40),
    hip=(0.24, -0.70, 0.86), stifle=(0.32, -0.46, 0.56), hock=(0.28, -0.78, 0.28),
    hball=(0.26, -0.70, 0.06), htoe=(0.26, -0.53, 0.015),
    scap=(0.22, 0.16, 1.12), shoulder=(0.30, 0.30, 0.80), elbow=(0.33, 0.10, 0.50),
    wrist=(0.29, 0.28, 0.18), fball=(0.28, 0.34, 0.06), ftoe=(0.28, 0.50, 0.015),
)
W = dict(root=(0.18, 0.10, 1.26), elbow=(0.60, -0.02, 1.58), wrist=(0.86, -0.60, 1.50),
         f1=(1.30, -1.55, 1.30), f2=(1.06, -1.50, 0.98), f3=(0.72, -1.25, 0.86))


def clay():
    c = Clay()
    c.ell((0, -0.18, 0.94), (0.33, 0.62, 0.34), k=0.08)                        # trunk
    c.ell((0, 0.22, 0.94), (0.33, 0.32, 0.37), k=0.08)                         # chest
    c.ell((0, -0.10, 0.72), (0.27, 0.50, 0.16), k=0.08)                        # belly
    c.ell((0, -0.72, 0.94), (0.26, 0.24, 0.22), k=0.07)                        # hips
    c.ell((0.25, -0.64, 0.74), (0.13, 0.25, 0.27), R=rot_to((0, 0.3, -1)), k=0.07, mirror=True)
    c.cone(J["hip"], J["stifle"], 0.17, 0.11, k=0.06, mirror=True)
    c.ell((0.30, -0.64, 0.44), (0.08, 0.11, 0.15), R=rot_to((0, -0.9, -1)), k=0.05, mirror=True)
    c.cone(J["stifle"], J["hock"], 0.10, 0.06, k=0.04, mirror=True)
    c.cone(J["hock"], J["hball"], 0.06, 0.05, k=0.03, mirror=True)
    c.ell((0.26, -0.64, 0.045), (0.09, 0.12, 0.05), k=0.03, mirror=True)
    c.ell((0.27, 0.22, 0.92), (0.12, 0.21, 0.25), R=rot_to((0, 0.4, -1)), k=0.07, mirror=True)
    c.cone(J["shoulder"], J["elbow"], 0.14, 0.10, k=0.06, mirror=True)
    c.cone(J["elbow"], J["wrist"], 0.095, 0.06, k=0.04, mirror=True)
    c.cone(J["wrist"], J["fball"], 0.06, 0.05, k=0.03, mirror=True)
    c.ell((0.28, 0.40, 0.045), (0.09, 0.12, 0.05), k=0.03, mirror=True)
    # neck and head
    c.chain([(0, 0.40, 1.10), J["n1"], (0, 0.98, 1.88)], [0.27, 0.19, 0.145], k=0.07)
    c.ell((0, 1.05, 1.94), (0.13, 0.16, 0.12), k=0.05)                          # skull
    c.add("flatcone", k=0.04, a=(0, 1.12, 1.92), b=(0, 1.45, 1.85), ra=0.11, rb=0.06, flat=0.75)
    c.cone((0, 1.04, 1.83), (0, 1.41, 1.77), 0.08, 0.045, k=0.04)               # jaw
    c.ell((0.08, 1.12, 1.98), (0.05, 0.10, 0.035), k=0.03, mirror=True)        # brow ridge
    c.ell((0.10, 1.04, 1.86), (0.06, 0.09, 0.07), k=0.04, mirror=True)         # jaw muscle
    c.add("box", k=0.01, op="sub", c=(0, 1.33, 1.805), h=(0.12, 0.16, 0.007), R=rot_to((0, 1, -0.18)))
    c.add("sphere", k=0.012, op="sub", c=(0.095, 1.16, 1.955), r=0.025, mirror=True)
    c.add("sphere", k=0.008, op="sub", c=(0.03, 1.46, 1.86), r=0.014, mirror=True)
    c.chain([J[f"t{i}"] for i in range(7)], [0.25, 0.20, 0.155, 0.115, 0.08, 0.055, 0.03], k=0.06)
    c.lumps(0.005, 16.0, seed=8, n=12)
    return c


def membrane(name, rays, wts, sag=0.0):
    """rays: list of polylines (each list of points, same count); wts: weight dict per ray.
    Inserts a scalloped mid-ray between neighbours (blended weights)."""
    rows, rw = [], []
    for i, (r, w) in enumerate(zip(rays, wts)):
        rows.append([V(p) for p in r]); rw.append(w)
        if i < len(rays) - 1:
            n = len(r)
            mid = []
            for j in range(n):
                a, b = V(r[j]), V(rays[i + 1][j])
                p = (a + b) * 0.5
                u = j / (n - 1)
                tip_in = 0.18 * u ** 2  # trailing-edge scallop
                p = p.lerp(V(r[0]), tip_in)
                mid.append(p + V((0, 0, -sag * math.sin(math.pi * u))))
            rows.append(mid)
            mw = {}
            for k, x in list(w.items()) + list(wts[i + 1].items()):
                mw[k] = mw.get(k, 0) + 0.5 * x
            rw.append(mw)
    ob = core.grid_strip(name, rows, 0.012)
    kd = kdtree.KDTree(sum(len(r) for r in rows))
    flat = []
    for i, r in enumerate(rows):
        for p in r:
            kd.insert(p, len(flat)); flat.append(rw[i])
    kd.balance()

    def fn(co):
        _, idx, _ = kd.find(co)
        return flat[idx]
    return ob, fn


def build(oath=None):
    S = Spec("drake", oath)
    S.height = 2.6
    S.clay = clay()
    S.voxel = 0.011
    S.low_tris = 9500
    S.surface = mats.surface("scales", "hi_scales", cells=34.0, base=0.8)
    horn_m = mats.surface("bone", "hi_horn", rough=0.5)
    memb = mats.surface("membrane", "hi_memb")
    glow = mats.surface("glow", "hi_glow")
    S.tint = {"body": "#3a2c26", "secondary": "#2a1d18", "accent": "#c9b796", "glow": "#ff7a2a"}
    ember = oath == "oath-01"
    extra = []
    for s, g in quad.SIDES:
        X = V((g, 1, 1))
        w = {k: V(p) * X for k, p in W.items()}
        up = (0, 0, 1)
        extra += [Bone(f"wing1_{s}", w["root"], w["elbow"], "chest", roll_ref=up),
                  Bone(f"wing2_{s}", w["elbow"], w["wrist"], f"wing1_{s}", roll_ref=up),
                  Bone(f"fing1_{s}", w["wrist"], w["f1"], f"wing2_{s}", roll_ref=up),
                  Bone(f"fing2_{s}", w["wrist"], w["f2"], f"wing2_{s}", roll_ref=up),
                  Bone(f"fing3_{s}", w["wrist"], w["f3"], f"wing2_{s}", roll_ref=up)]
        # wing arm + finger bones (visible, lofted)
        S.part(core.horn(f"wa1{s}", [w["root"], w["root"].lerp(w["elbow"], 0.5), w["elbow"]], [0.07, 0.06, 0.05], segs=8), f"wing1_{s}", "body", S.surface)
        S.part(core.horn(f"wa2{s}", [w["elbow"], w["elbow"].lerp(w["wrist"], 0.5), w["wrist"]], [0.05, 0.04, 0.035], segs=8), f"wing2_{s}", "body", S.surface)
        S.part(kit.spike(f"thumb{s}", w["wrist"], (0.3 * g, 0.8, 0.5), 0.14, 0.025), f"wing2_{s}", "accent", horn_m)
        for i, f in enumerate(("f1", "f2", "f3")):
            pts = [w["wrist"].lerp(w[f], u) for u in (0, 0.33, 0.66, 1.0)]
            S.part(core.horn(f"wf{i}{s}", pts, [0.03, 0.022, 0.015, 0.006], segs=6), f"fing{i + 1}_{s}", "body", S.surface)
        # membrane: fingers fan + body attachment, plus inner arm patch
        n = 6
        ray = lambda a, b: [V(a).lerp(V(b), 0.06 + 0.94 * u / (n - 1)) for u in range(n)]
        body_pt = V((0.30 * g, -0.68, 1.04))
        rays = [ray(w["wrist"], w["f1"]), ray(w["wrist"], w["f2"]), ray(w["wrist"], w["f3"]), ray(w["wrist"], body_pt)]
        wts = [{f"fing1_{s}": 1}, {f"fing2_{s}": 1}, {f"fing3_{s}": 1}, {"spine1": 0.6, "hips": 0.4}]
        mob, mfn = membrane(f"memb{s}", rays, wts, sag=0.03)
        S.part(mob, mfn, "secondary", memb)
        arm_line = [w["root"], w["root"].lerp(w["elbow"], 0.5), w["elbow"], w["elbow"].lerp(w["wrist"], 0.5), w["wrist"]]
        body_line = [V((0.20 * g, 0.12, 1.22)), V((0.26 * g, -0.05, 1.18)), V((0.29 * g, -0.25, 1.13)), V((0.30 * g, -0.45, 1.09)), body_pt]
        mob2, mfn2 = membrane(f"memb_in{s}", [arm_line, body_line],
                              [{f"wing1_{s}": 0.5, f"wing2_{s}": 0.5}, {"chest": 0.5, "spine1": 0.5}], sag=0.04)
        S.part(mob2, mfn2, "secondary", memb)
        # horns swept back, cheek spikes
        hp = core.bezier_pts((0.07 * g, 1.02, 2.0), (0.12 * g, 0.90, 2.12), (0.16 * g, 0.72, 2.16), (0.15 * g, 0.58, 2.08), 8)
        S.part(core.horn(f"horn{s}", hp, [0.05, 0.045, 0.04, 0.034, 0.027, 0.02, 0.012, 0.003], segs=8), "head", "accent", horn_m)
        S.part(kit.spike(f"cheek{s}", V((0.13 * g, 1.02, 1.86)), (1 * g, -0.6, 0.1), 0.12, 0.022), "head", "accent", horn_m)
        S.part(kit.eye(f"eye{s}", (0.093 * g, 1.165, 1.955), 0.02), "head", "glow", glow)
        for key, bn in (("fball", f"ftoe_{s}"), ("hball", f"htoe_{s}")):
            b = V(J[key]); b.x *= g
            S.part(kit.paw_claws(f"cl{key}{s}", b + V((0, 0.08, -0.01)), n=3, spread=0.09, length=0.09, r=0.016), bn, "accent", horn_m)
    S.part(kit.tooth_row("teethL", (0.07, 1.16, 1.82), (0.045, 1.40, 1.78), 8, 0.035, 0.009), "head", "accent", horn_m)
    S.part(kit.tooth_row("teethR", (-0.07, 1.16, 1.82), (-0.045, 1.40, 1.78), 8, 0.035, 0.009), "head", "accent", horn_m)
    # dorsal spines: neck -> back -> tail, ending in a tail blade
    pts = []
    for i in range(22):
        u = i / 21
        if u < 0.3:
            q = u / 0.3; p = V((0, 0.92, 2.0)).lerp(V((0, 0.45, 1.40)), q); bn = "neck2" if q < 0.5 else "neck1"
        elif u < 0.55:
            q = (u - 0.3) / 0.25; p = V((0, 0.40, 1.36)).lerp(V((0, -0.70, 1.22)), q); bn = "chest" if q < 0.35 else "spine2" if q < 0.7 else "spine1"
        else:
            q = (u - 0.55) / 0.45; k = int(q * 5.99); p = V(J[f"t{k}"]).lerp(V(J[f"t{k + 1}"]), q * 6 - k) + V((0, 0, 0.17 - 0.12 * q)); bn = f"tail{k + 1}"
        L = 0.26 * math.sin(math.pi * min(1, u * 1.6 + 0.1)) + 0.08
        pts.append((p, bn, L))
    for i, (p, bn, L) in enumerate(pts):
        S.part(kit.spike(f"dsp{i}", p - V((0, 0, 0.08)), (0, -0.8, 1), L * 1.1, 0.075, bend=(0, -0.4, 0), flat=0.3, flat_side=True), bn, "accent", horn_m)
    S.part(kit.spike("tailblade", (0, -2.40, 0.42), (0, -1, 0.15), 0.42, 0.11, bend=(0, 0, 0.2), flat=0.18, flat_side=True), "tail6", "accent", horn_m)
    for sgn in (-1, 1):
        S.part(kit.spike(f"tailfin{sgn}", (0, -2.42, 0.41), (0.7 * sgn, -1, 0.1), 0.26, 0.07, flat=0.2), "tail6", "accent", horn_m)
    if ember:
        S.tint.update(body="#2c1f1a", accent="#9a4a2c", glow="#ff7a2a")
        plate_m = mats.surface("stone", "hi_cinder", cells=6.0)
        rng = np.random.default_rng(4)
        # cinder plates on the back with glowing cracks between
        for i in range(9):
            y = 0.30 - 0.12 * i
            for sgn in (-1, 1):
                c = V((0.18 * sgn, y, 1.27 - 0.012 * i))
                S.part(core.slab(f"cpl{i}{sgn}", (0.18, 0.13, 0.05), c, (0.15, -0.45 * sgn, 0), seed=i * 3 + sgn, chips=6),
                       "chest" if y > 0.1 else "spine2" if y > -0.3 else "spine1", "accent", plate_m)
        for s, g in quad.SIDES:
            for j, (y, z) in enumerate(((0.10, 1.08), (-0.25, 1.06), (-0.55, 1.02), (0.35, 1.02))):
                pts2 = core.bezier_pts((0.32 * g, y + 0.12, z + 0.04), (0.35 * g, y, z - 0.08), (0.32 * g, y - 0.08, z - 0.24), None, 6)
                S.part(core.horn(f"crk{s}{j}", pts2, [0.012, 0.016, 0.018, 0.016, 0.012, 0.005], segs=5, flat=0.5),
                       "chest" if y > 0.1 else "spine2" if y > -0.3 else "spine1", "glow", glow)
        S.part(core.ico("throat", 0.08, (0, 0.60, 1.17), sub=2, scale=(1.4, 1.8, 0.9)), "neck1", "glow", glow)
    if oath == "oath-12":
        S.tint.update(body="#4a1418", accent="#c8a060", glow="#ff3a4a")

    def xf(clip, t, P):
        w = 2 * math.pi * t
        spread, raise_, fan, beat = 0.0, 0.0, 0.0, 0.0
        if clip == "idle":
            raise_ = 0.04 * math.sin(w * 2); fan = 0.03 * math.sin(w * 2)
        elif clip == "walk":
            raise_ = 0.05 * math.sin(w * 2) - 0.05; spread = -0.05
        elif clip == "run":
            raise_ = 0.25 + 0.15 * math.sin(w); spread = 0.35; fan = 0.25
        elif clip == "attack":
            k = env(t, [(0, 0), (0.3, 1), (0.6, 1), (1, 0)])
            raise_ = 0.5 * k; spread = 0.6 * k; fan = 0.4 * k
        elif clip == "hit":
            k = env(t, [(0, 0), (0.15, 1), (1, 0)])
            raise_ = 0.3 * k; spread = 0.2 * k
        elif clip == "roar":
            k = env(t, [(0, 0), (0.25, 1), (0.8, 1), (1, 0)])
            raise_ = 0.7 * k; spread = 0.9 * k; fan = 0.55 * k
            beat = 0.35 * k * math.sin(w * 3)
        elif clip == "death":
            k = env(t, [(0.2, 0), (0.7, 1)])
            raise_ = -0.2 * k; spread = 0.7 * k; fan = 0.3 * k
        for s, g in quad.SIDES:
            P.r(f"wing1_{s}", x=raise_ + beat, z=g * spread * 0.6)
            P.r(f"wing2_{s}", z=g * spread * 0.8, x=-beat * 0.5)
            for i in range(3):
                P.r(f"fing{i + 1}_{s}", z=g * fan * (0.4 + 0.5 * i), x=0.1 * beat)

    S.bones = quad.skeleton(J, tail_n=6, ears=False, extra=extra)
    S.legs = quad.legs()
    S.clip_fn = lambda ctx: quad.clips(ctx, dict(stride_w=0.5, stride_r=1.0, lift=0.2, heavy=0.5, attack="bite", roar=True,
                                                 body_half_width=0.30, tail_n=6, extra_fn=xf, walk_frames=36, run_frames=20))
    return S
