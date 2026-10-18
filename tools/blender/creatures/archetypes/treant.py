"""Treant: 3.6 m root-and-bark behemoth — gnarled trunk torso, branch arms ending in twig talons,
root-splayed feet, a carved bark face with amber-lit hollows, a crown of dead branches and moss."""
import math
import numpy as np
from mathutils import Vector
from lib import core, kit, mats, biped
from lib.sdf import Clay, rot_to
from lib.build import Spec

V = Vector
J = dict(hips=(0, 0.0, 1.45), spine1=(0, 0.02, 1.80), spine2=(0, 0.06, 2.25), neck=(0, 0.22, 2.70), head=(0, 0.28, 2.78),
         head_top=(0, 0.32, 3.15), clav=(0.2, 0.08, 2.55), shoulder=(0.70, 0.05, 2.60), elbow=(0.95, 0.18, 1.90),
         wrist=(0.98, 0.38, 1.22), hand=(0.98, 0.50, 0.85),
         hip=(0.35, 0.0, 1.35), knee=(0.44, 0.16, 0.80), ankle=(0.46, -0.02, 0.26), ball=(0.46, 0.30, 0.08), toe=(0.46, 0.55, 0.03))


def strands(c, a, b, n, rb, rs, twist=1.5, k=0.025, seed=0, m=7, taper=0.75, fill=0.62):
    """bundle of twisting root strands from a to b (reads as braided wood/roots)."""
    rng = np.random.default_rng(seed)
    a, b = V(a), V(b)
    ax = (b - a).normalized()
    e1 = ax.cross(V((0, 0, 1)) if abs(ax.z) < 0.9 else V((1, 0, 0))).normalized()
    e2 = ax.cross(e1)
    c.cone(tuple(a), tuple(b), rb * fill, rb * fill * taper, k=k * 2)
    for i in range(n):
        a0 = 2 * math.pi * i / n + rng.uniform(-0.3, 0.3)
        jit = rng.uniform(0.85, 1.15, m)
        pts, rad = [], []
        for j in range(m):
            u = j / (m - 1)
            R = rb * (1 - (1 - taper) * u) * jit[j]
            ang = a0 + twist * u
            p = a.lerp(b, u) + (e1 * math.cos(ang) + e2 * math.sin(ang)) * R * 0.78
            pts.append(tuple(p)); rad.append(rs * (1 - (1 - taper) * u) * rng.uniform(0.85, 1.15))
        c.chain(pts, rad, k=k)


def clay():
    c = Clay()
    # torso: braided trunk from pelvis to shoulder girdle + burls
    strands(c, (0, 0.0, 1.25), (0, 0.10, 2.60), 11, 0.46, 0.13, twist=1.2, seed=1, taper=1.15, fill=0.7)
    c.ell((0, 0.10, 2.48), (0.56, 0.32, 0.22), k=0.08)                       # shoulder girdle
    c.ell((0.24, 0.32, 2.12), (0.13, 0.08, 0.16), k=0.05, mirror=True)       # chest burls
    c.ell((0, -0.28, 2.32), (0.26, 0.16, 0.34), k=0.08)                      # back hump
    strands(c, (0, 0.12, 2.50), (0, 0.27, 2.80), 6, 0.20, 0.07, twist=0.8, seed=2)
    c.ell((0, 0.32, 2.88), (0.22, 0.21, 0.28), k=0.05)                       # head
    c.ell((0, 0.46, 2.99), (0.20, 0.08, 0.06), k=0.04)                       # brow ridge
    c.ell((0, 0.50, 2.80), (0.05, 0.06, 0.12), k=0.04)                       # nose ridge
    c.add("sphere", k=0.03, op="sub", c=(0.09, 0.50, 2.90), r=0.06, mirror=True)   # eye hollows
    c.add("ellipsoid", k=0.03, op="sub", c=(0, 0.52, 2.68), r=(0.10, 0.06, 0.05))  # mouth hollow
    for g in (1, -1):
        X = V((g, 1, 1))
        strands(c, V(J["clav"]) * X, V(J["shoulder"]) * X, 5, 0.22, 0.09, twist=0.8, seed=3 + g)
        strands(c, V(J["shoulder"]) * X, V(J["elbow"]) * X, 5, 0.19, 0.075, twist=1.4, seed=5 + g)
        c.add("sphere", k=0.05, c=tuple(V(J["elbow"]) * X), r=0.16)
        strands(c, V(J["elbow"]) * X, V(J["wrist"]) * X, 5, 0.15, 0.06, twist=-1.4, seed=7 + g)
        strands(c, V(J["wrist"]) * X, V(J["hand"]) * X, 4, 0.11, 0.045, twist=0.8, seed=9 + g)
        strands(c, V(J["hip"]) * X, V(J["knee"]) * X, 6, 0.24, 0.09, twist=1.2, seed=11 + g)
        c.add("sphere", k=0.05, c=tuple(V(J["knee"]) * X), r=0.19)
        strands(c, V(J["knee"]) * X, V(J["ankle"]) * X, 6, 0.19, 0.075, twist=-1.0, seed=13 + g)
        # root feet: splayed root toes
        for dx, dy, L in ((-0.20, 0.30, 0.42), (0.0, 0.42, 0.46), (0.22, 0.30, 0.40), (0.05, -0.32, 0.34)):
            a = V(J["ankle"]) * X + V((0, 0, -0.06))
            b = V(((J["ankle"][0] + dx) * g, J["ankle"][1] + dy, 0.03))
            mid = a.lerp(b, 0.5) + V((0, 0, 0.06))
            c.chain([tuple(a), tuple(mid), tuple(b)], [0.11, 0.08, 0.03], k=0.05)
    c.lumps(0.006, 20.0, seed=42, n=12)
    return c


def build(oath=None):
    S = Spec("treant", oath)
    S.height = 3.6
    S.clay = clay()
    S.voxel = 0.014
    S.low_tris = 9500
    S.surface = mats.surface("bark", "hi_bark", scale=0.5)
    branch_m = mats.surface("bark", "hi_branch", scale=1.2)
    moss_m = mats.surface("moss", "hi_moss")
    glow = mats.surface("glow", "hi_glow")
    S.tint = {"body": "#4a3a28", "secondary": "#4a5a2a", "accent": "#5a4632", "glow": "#ffc04a"}
    for s, g in biped.SIDES:
        Xs = V((g, 1, 1))
        # twig talons
        for k in range(4):
            a = (k - 1.5) * 0.35
            base = V((0.98 * g + math.sin(a) * 0.06 * g, 0.52, 0.86))
            S.part(kit.branch(f"tal{s}{k}", base, (math.sin(a) * 0.4 * g, 0.5, -1.0), 0.45, 0.045, depth=1, seed=k + 5 * (g > 0), kids=1, spread=0.4),
                   f"hand_{s}", "accent", branch_m)
        S.part(kit.eye(f"eye{s}", (0.09 * g, 0.50, 2.90), 0.035), "head", "glow", glow)
        # shoulder branches
        S.part(kit.branch(f"shb{s}", V((0.62 * g, -0.05, 2.78)), (0.5 * g, -0.4, 1.0), 0.9, 0.08, depth=2, seed=11 + (g > 0), kids=2),
               f"clav_{s}", "accent", branch_m)
        # moss on shoulders and forearms
        for j, (p, bn) in enumerate(((V((0.55 * g, 0.05, 2.78)), f"clav_{s}"), (V((0.98 * g, 0.20, 1.60)), f"forearm_{s}"),
                                     (V((0.42 * g, 0.22, 0.95)), f"shin_{s}"))):
            S.part(core.ico(f"moss{s}{j}", 0.17, p, sub=2, scale=(1.3, 1.0, 0.55), jitter=0.3, seed=j + 3), bn, "secondary", moss_m)
    # crown of dead branches on the head
    for k in range(5):
        a = math.radians(-70 + 35 * k)
        S.part(kit.branch(f"crown{k}", V((math.sin(a) * 0.14, 0.24 - 0.05 * abs(math.sin(a)), 3.08)), (math.sin(a) * 0.8, -0.3, 1.0),
                          0.75 - 0.1 * abs(k - 2), 0.06, depth=2, seed=20 + k, kids=2), "head", "accent", branch_m)
    S.part(core.ico("mossback", 0.32, (0, -0.32, 2.62), sub=2, scale=(1.4, 0.8, 0.5), jitter=0.3, seed=9), "chest", "secondary", moss_m)
    # amber sap seams in the chest bark
    for j, (x, z) in enumerate(((0.12, 2.10), (-0.18, 1.95), (0.02, 2.35))):
        pts = core.bezier_pts((x, 0.40, z + 0.22), (x + 0.04, 0.45, z), (x - 0.03, 0.42, z - 0.22), None, 6)
        S.part(core.horn(f"sap{j}", pts, [0.012, 0.022, 0.026, 0.022, 0.014, 0.004], segs=5, flat=0.5), "chest", "glow", glow)
    S.part(core.ico("heart", 0.07, (0, 0.40, 2.12), sub=2), "chest", "glow", glow)
    S.bones = biped.humanoid(J)
    S.legs = biped.humanoid_legs()
    S.clip_fn = lambda ctx: biped.clips_heavy(ctx, dict(stride=0.6, lift=0.12, roar=True, sway=1.2, arm_weight=1.2,
                                                        walk_frames=56, run_frames=32, attack_frames=48))
    return S
