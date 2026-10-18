"""Serpent: heavy S-coiled serpent, front third reared in a strike posture with a ribbed hood,
keeled scales, dorsal spines.  Spine is two chains from mid-body (forward to the head, back to the
tail tip) animated with a travelling slither wave; strike/coil/hiss clips on the raised neck."""
import math
import numpy as np
from mathutils import Vector
from lib import core, kit, mats
from lib.rig import Bone
from lib.sdf import Clay, rot_to
from lib.build import Spec
from lib.anim import env

V = Vector
CTRL = [(0.05, -2.25, 0), (-0.22, -1.95, 0), (-0.32, -1.50, 0), (-0.05, -1.05, 0), (0.28, -0.62, 0), (0.24, -0.18, 0),
        (0.0, 0.14, 0), (0.0, 0.34, 0.36), (0.0, 0.44, 0.78), (0.0, 0.52, 1.10), (0.0, 0.62, 1.28)]
RAD = [0.02, 0.08, 0.13, 0.17, 0.195, 0.2, 0.195, 0.175, 0.15, 0.12, 0.10]   # neck tapers under the head
N = 18


def _catmull(pts, n):
    P = [V(p) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    dense = []
    for i in range(1, len(P) - 2):
        for k in range(20):
            t = k / 20
            a, b, c, d = P[i - 1], P[i], P[i + 1], P[i + 2]
            dense.append(0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3))
    dense.append(P[-2])
    L = [0.0]
    for i in range(1, len(dense)):
        L.append(L[-1] + (dense[i] - dense[i - 1]).length)
    out, j = [], 0
    for k in range(n):
        s = L[-1] * k / (n - 1)
        while j < len(L) - 2 and L[j + 1] < s:
            j += 1
        f = (s - L[j]) / max(L[j + 1] - L[j], 1e-9)
        out.append((dense[j].lerp(dense[j + 1], f), s / L[-1]))
    return out


def path():
    samp = _catmull(CTRL, N)
    pts, rad = [], []
    for p, u in samp:
        x = u * (len(RAD) - 1); i = min(int(x), len(RAD) - 2); f = x - i
        r = RAD[i] * (1 - f) + RAD[i + 1] * f
        pts.append(V((p.x, p.y, max(p.z, 0.0) + r * 0.92)))
        rad.append(r)
    return pts, rad


PTS, RADS = path()
MID = 7
HEAD0 = V((0, 0.64, 1.32))
SNOUT = V((0, 0.97, 1.30))


def clay():
    c = Clay()
    c.chain(PTS, RADS, k=0.015)
    c.cone(PTS[-1], HEAD0, RADS[-1], 0.10, k=0.03)
    # viper/cobra wedge: broad flat skull widest at the jaw hinge, tapering to a narrow snout
    c.ell((0, 0.71, 1.33), (0.155, 0.13, 0.068), k=0.03)                         # skull (wide, flat)
    c.add("flatcone", k=0.03, a=(0, 0.76, 1.33), b=(0, 0.965, 1.30), ra=0.12, rb=0.045, flat=0.42)
    c.ell((0.105, 0.70, 1.30), (0.065, 0.085, 0.06), k=0.03, mirror=True)       # venom glands / jaw hinge
    c.cone((0, 0.70, 1.28), (0, 0.92, 1.265), 0.06, 0.045, k=0.03)              # jaw
    c.add("box", k=0.008, op="sub", c=(0, 0.88, 1.282), h=(0.1, 0.11, 0.005))
    c.add("sphere", k=0.01, op="sub", c=(0.085, 0.81, 1.355), r=0.02, mirror=True)
    c.ell((0.07, 0.81, 1.385), (0.035, 0.055, 0.016), k=0.02, mirror=True)        # supraocular scale
    c.add("sphere", k=0.006, op="sub", c=(0.02, 0.975, 1.30), r=0.008, mirror=True)
    c.lumps(0.003, 25.0, seed=17, n=10)
    return c


def bones():
    B = [Bone("root", (0, 0, 0), (0, 0.3, 0), None, deform=False)]
    B.append(Bone("hips", PTS[MID], PTS[MID + 1], "root"))
    fw = ["hips"]
    for k in range(MID + 1, N - 1):
        nm = f"spine{k - MID}"
        B.append(Bone(nm, PTS[k], PTS[k + 1], fw[-1])); fw.append(nm)
    B.append(Bone("neck_end", PTS[-1], HEAD0, fw[-1])); fw.append("neck_end")
    B.append(Bone("head", HEAD0, SNOUT, "neck_end"))
    B.append(Bone("jaw", V((0, 0.71, 1.27)), V((0, 0.95, 1.255)), "head"))
    B.append(Bone("tongue", V((0, 0.80, 1.28)), V((0, 1.02, 1.28)), "jaw"))
    bk = []
    prev = "hips"
    for k in range(MID, 0, -1):
        nm = f"tail{MID - k + 1}"
        B.append(Bone(nm, PTS[k], PTS[k - 1], prev)); bk.append(nm); prev = nm
    for s, g in (("L", 1), ("R", -1)):
        B.append(Bone(f"hood_{s}", V((0.05 * g, 0.56, 1.12)), V((0.40 * g, 0.50, 1.14)), fw[-3]))
    return B, fw[1:], bk


def build(oath=None):
    S = Spec("serpent", oath)
    S.height = 1.4
    S.clay = clay()
    S.voxel = 0.0085
    S.low_tris = 10000
    S.surface = mats.surface("scales", "hi_scales", cells=48.0, base=0.82, rough=0.4)
    fang_m = mats.surface("bone", "hi_fang", rough=0.35)
    hood_m = mats.surface("membrane", "hi_hood")
    glow = mats.surface("glow", "hi_glow")
    S.tint = {"body": "#2e3a30", "secondary": "#1a2420", "accent": "#d6caa8", "glow": "#58d4ff"}
    B, fw, bk = bones()
    neck_bones = [b for b in fw if b.startswith("spine")][-4:] + ["neck_end"]
    # fangs + eyes + tongue
    for s, g in (("L", 1), ("R", -1)):
        S.part(kit.spike(f"fang{s}", (0.045 * g, 0.93, 1.275), (0, 0.25, -1), 0.07, 0.011), "head", "accent", fang_m)
        S.part(kit.eye(f"eye{s}", (0.085 * g, 0.81, 1.355), 0.017), "head", "glow", glow)
    tp = [V((0, 0.82, 1.28)), V((0, 0.95, 1.28)), V((0.0, 1.03, 1.28))]
    S.part(core.horn("tongue", tp, [0.008, 0.006, 0.004], segs=5, flat=0.4), "tongue", "glow", glow)
    for s, g in (("L", 1), ("R", -1)):
        S.part(core.horn(f"tfork{s}", [V((0, 1.03, 1.28)), V((0.015 * g, 1.07, 1.28))], [0.004, 0.0015], segs=4), "tongue", "glow", glow)
    # hood: cobra hood flaring from directly behind the head down the neck, widest about a third
    # of the way down, wrapping back around the neck at its edges (ribs spread it laterally)
    def neck_y(z):
        return 0.44 + (z - 0.78) * 0.25 if z < 1.10 else 0.52 + (z - 1.10) * 0.55
    rows = []
    for i in range(9):
        u = i / 8                                           # 0 = top (behind the head)
        z = 1.29 - 0.42 * u
        w = 0.09 + 0.36 * math.sin(math.pi * min(1.0, 0.12 + u * 0.9)) ** 0.8
        yc = neck_y(z)
        rows.append([V((x * w, yc + 0.075 - 0.14 * abs(x) ** 1.6, z + 0.015 * (1 - abs(x)))) for x in np.linspace(-1, 1, 11)])
    hood = core.grid_strip("hood", rows, 0.012)
    hb = neck_bones

    def hood_w(co):
        side = "L" if co.x > 0 else "R"
        out = min(1.0, abs(co.x) / 0.32) ** 1.3
        nb = hb[1] if co.z < 1.02 else hb[2] if co.z < 1.17 else hb[3]
        return {nb: 1 - out, f"hood_{side}": out}
    S.part(hood, hood_w, "secondary", hood_m)
    for s, g in (("L", 1), ("R", -1)):
        for j in range(4):
            z = 1.24 - 0.10 * j
            w = 0.09 + 0.36 * math.sin(math.pi * min(1.0, 0.12 + (1.29 - z) / 0.42 * 0.9)) ** 0.8
            yc = neck_y(z)
            S.part(core.horn(f"hrib{s}{j}", [V((0.05 * g, yc + 0.07, z)), V((w * 0.95 * g, yc + 0.075 - 0.13, z))], [0.012, 0.005], segs=5),
                   f"hood_{s}", "accent", fang_m)
    # dorsal spine ridge along the back, keeled
    for k in range(2, N - 2):
        p = PTS[k]; r = RADS[k]
        bn = (bk[MID - k] if k < MID else fw[k - MID - 1] if k > MID else "hips") if k != MID else "hips"
        if k < MID:
            bn = f"tail{MID - k}"
        d = (PTS[k + 1] - PTS[k - 1]).normalized()
        up = V((0, 0, 1)) if p.z < 0.4 else V((0, -1, 0.3)).normalized()
        S.part(kit.spike(f"dsp{k}", p + up * r * 0.75, up - d * 0.8, 0.06 + r * 0.45, 0.022 + r * 0.08, flat=0.3, flat_side=True),
               bn, "accent", fang_m)
    if oath == "oath-12":
        S.tint.update(body="#6a1e24", accent="#5a5048", glow="#ff2a3a")
    S.bones = B
    S.legs = []
    tail = bk
    ground_fw = [b for b in fw if b.startswith("spine")][:-4]

    def clips(ctx):
        H = ctx.spec.height

        def slither(t, P, run):
            w = 2 * math.pi * t
            amp = 0.20 if run else 0.13
            chain = list(reversed(tail)) + ["hips"] + ground_fw
            n = len(chain)
            for i, b in enumerate(chain):
                ph = w - 2 * math.pi * 1.0 * (i / n)
                a = amp * (0.4 + 0.6 * (1 - i / n)) * math.sin(ph)
                P.r(b, z=a if b in tail else -a)
            P.move("hips", x=0.02 * H * math.sin(w))
            # raised neck stays aimed forward, gentle counter-sway
            for j, b in enumerate(neck_bones):
                P.r(b, z=0.05 * math.sin(w + 1.0 + j * 0.4), x=(-0.12 if run else 0.0) * (j == 0))
            P.r("head", z=-0.06 * math.sin(w + 1.6))
            P.r("tongue", x=0.0)

        def idle(t, P):
            w = 2 * math.pi * t
            for j, b in enumerate(neck_bones):
                P.r(b, z=0.06 * math.sin(w + j * 0.5), x=0.03 * math.sin(w * 2 + j))
            P.r("head", z=0.08 * math.sin(w + 2.0), x=-0.03 * math.sin(w * 2))
            P.chain(tail, z=0.03 * math.sin(w), falloff=1.1)
            flick = env(t, [(0, 0), (0.4, 0), (0.45, 1), (0.5, 0), (0.55, 1), (0.6, 0), (1, 0)])
            P.r("jaw", x=-0.12 * flick)
            P.r("tongue", x=-0.3 * flick)
            P.move("tongue", y=0.0)

        def attack(t, P):
            coil = env(t, [(0, 0), (0.35, 1), (0.45, -0.2), (0.65, -0.2), (1, 0)])
            strike = env(t, [(0, 0), (0.36, 0), (0.46, 1), (0.62, 1), (0.95, 0)])
            for j, b in enumerate(neck_bones):
                P.r(b, x=0.16 * coil - 0.09 * strike * (1.0 if j < 3 else 0.5))
            P.r("head", x=0.15 * coil - 0.08 * strike)
            P.r("jaw", x=-0.9 * env(t, [(0, 0), (0.3, 0.6), (0.45, 1.0), (0.5, 0.2), (0.7, 0.1), (1, 0)]))
            for s in ("L", "R"):
                P.r(f"hood_{s}", z=(0.5 if s == "L" else -0.5) * coil)
            P.move("hips", y=(-0.05 * coil + 0.10 * strike) * H)
            P.chain(tail, z=0.12 * coil, falloff=1.05)

        def hit(t, P):
            k = env(t, [(0, 0), (0.15, 1), (0.4, 0.6), (1, 0)])
            for j, b in enumerate(neck_bones):
                P.r(b, x=0.15 * k, z=0.12 * k)
            P.r("head", y=0.3 * k, x=0.1 * k)
            P.r("jaw", x=-0.5 * k)
            P.chain(tail, z=-0.1 * k, falloff=1.05)

        def death(t, P):
            k1 = env(t, [(0, 0), (0.4, 1)])
            k2 = env(t, [(0.3, 0), (0.75, 1)])
            # the reared neck topples from its base and lands stretched out (was a 157 deg curl
            # spread over five bones that folded the neck onto itself)
            fall = [0.62, 0.40, 0.24, 0.12, 0.05]
            for j, b in enumerate(neck_bones):
                P.r(b, x=-fall[min(j, len(fall) - 1)] * k1, z=0.10 * k2)
            P.r("head", y=0.9 * k2, x=-0.2 * k2)
            P.r("jaw", x=-0.4 * k2)
            P.r("hips", y=0.5 * k2)
            P.chain(tail, z=0.1 * k2, y=-0.3 * k2, falloff=0.9)
            P.chain(ground_fw, y=0.2 * k2, falloff=1.0)

        def roar(t, P):
            k = env(t, [(0, 0), (0.25, 1), (0.8, 1), (1, 0)])
            sh = math.sin(t * 2 * math.pi * 12) * env(t, [(0.25, 0), (0.35, 1), (0.75, 1), (0.85, 0)])
            for j, b in enumerate(neck_bones):
                P.r(b, x=0.18 * k, z=0.02 * sh)
            P.r("head", x=0.15 * k)
            P.r("jaw", x=-1.0 * k)
            P.r("tongue", x=-0.2 * k)
            for s in ("L", "R"):
                P.r(f"hood_{s}", z=(0.7 if s == "L" else -0.7) * k, x=0.15 * k)
            P.chain(tail, z=0.08 * math.sin(t * 2 * math.pi * 2) * k, falloff=1.1)

        return {"idle": (60, idle), "walk": (40, lambda t, P: slither(t, P, False)), "run": (24, lambda t, P: slither(t, P, True)),
                "attack": (30, attack), "hit": (15, hit), "death": (48, death), "roar": (60, roar)}
    S.clip_fn = clips
    return S
