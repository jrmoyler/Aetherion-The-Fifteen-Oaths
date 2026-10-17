"""Wraith: floating, hooded spirit — emaciated ribcage torso and skull in a deep cowl, long
skeletal arms with needle fingers, and layered tattered cloth panels on simulated-looking bone
chains (hover bob + flutter).  oath-09 radiant: bone-white/gold with a halo and light blades."""
import math
import numpy as np
from mathutils import Vector
from lib import core, kit, mats, hover
from lib.sdf import Clay, rot_to
from lib.build import Spec

V = Vector
J = dict(hips=(0, 0.0, 1.20), spine1=(0, 0.0, 1.45), chest=(0, 0.02, 1.70), neck=(0, 0.06, 1.98), head=(0, 0.10, 2.05),
         head_top=(0, 0.12, 2.30), jaw0=(0, 0.13, 2.03), jaw1=(0, 0.24, 1.98),
         clav=(0.06, 0.04, 1.90), shoulder=(0.24, 0.02, 1.88), elbow=(0.36, 0.20, 1.52), wrist=(0.34, 0.46, 1.30),
         hand=(0.32, 0.66, 1.16))


def cloth_chains():
    out = []
    for i in range(10):
        th = 2 * math.pi * (i + 0.5) / 10
        r0 = 0.20 if abs(math.cos(th)) < 0.9 else 0.17
        top = V((math.sin(th) * r0, math.cos(th) * r0 * 0.8, 1.55))
        L = 1.30 - 0.18 * math.cos(th)  # back panels longer
        pts = [top + V((math.sin(th), math.cos(th), 0)) * (0.10 * k) + V((0, 0, -L * k / 3)) for k in range(4)]
        out.append((f"cloth{i}", th, pts, "spine1"))
    return out


CLOTH = cloth_chains()


def clay():
    c = Clay()
    c.ell((0, 0.03, 1.72), (0.17, 0.12, 0.17), k=0.03)                       # ribcage
    for i in range(5):
        z = 1.82 - 0.06 * i
        c.add("torus", k=0.012, c=(0, 0.035, z), R0=0.15 - 0.006 * i, r=0.012, Rm=None)  # ribs
    c.cone((0, -0.06, 1.95), (0, -0.07, 1.25), 0.035, 0.03, k=0.03)          # spine column
    c.cone((0, 0.0, 1.58), (0, 0.0, 0.95), 0.10, 0.03, k=0.06)               # wisp-tail below the ribs
    c.cone((0.0, 0.04, 1.9), (0.24, 0.02, 1.88), 0.045, 0.04, k=0.03, mirror=True)   # clavicle/shoulder
    c.ell((0.22, 0.0, 1.88), (0.06, 0.06, 0.06), k=0.03, mirror=True)
    c.cone(J["shoulder"], J["elbow"], 0.035, 0.026, k=0.02, mirror=True)
    c.add("sphere", k=0.01, c=J["elbow"], r=0.032, mirror=True)
    c.cone(J["elbow"], J["wrist"], 0.028, 0.02, k=0.015, mirror=True)
    c.ell((0.335, 0.50, 1.28), (0.035, 0.05, 0.02), R=rot_to((0, 1, -0.6)), k=0.015, mirror=True)  # palm
    c.cone((0, 0.05, 1.96), (0, 0.10, 2.05), 0.035, 0.03, k=0.02)             # neck vertebrae
    c.ell((0, 0.13, 2.13), (0.075, 0.09, 0.095), k=0.02)                      # skull
    c.ell((0, 0.20, 2.04), (0.05, 0.05, 0.035), k=0.02)                       # maxilla
    c.add("sphere", k=0.012, op="sub", c=(0.03, 0.205, 2.13), r=0.024, mirror=True)  # orbits
    c.add("sphere", k=0.008, op="sub", c=(0.0, 0.225, 2.08), r=0.014)                # nasal cavity
    c.ell((0.045, 0.17, 2.07), (0.02, 0.05, 0.02), k=0.015, mirror=True)       # cheekbones
    c.lumps(0.002, 40.0, seed=31, n=8)
    return c


def build(oath=None):
    S = Spec("wraith", oath)
    S.height = 2.4
    S.clay = clay()
    S.voxel = 0.0065
    S.low_tris = 7000
    radiant = oath == "oath-09"
    S.surface = mats.surface("bone", "hi_bonebody", rough=0.55)
    cloth_m = mats.surface("cloth", "hi_cloth", dark=0.5, light=0.85)
    claw_m = mats.surface("bone", "hi_claw", rough=0.3)
    glow = mats.surface("glow", "hi_glow")
    S.tint = {"body": "#3a3a3e", "secondary": "#1c1d22", "accent": "#b9b2a0", "glow": "#8fdcff"}
    if radiant:
        S.tint = {"body": "#f4eee0", "secondary": "#e8dcc0", "accent": "#d8b060", "glow": "#fff6c8"}
        S.glow_strength = 6.0
    # needle fingers
    for s, g in hover.SIDES:
        for j in range(4):
            a = (j - 1.5) * 0.35
            base = V((0.335 * g + math.sin(a) * 0.02 * g, 0.53, 1.265))
            pts = core.bezier_pts(base, base + V((math.sin(a) * 0.04 * g, 0.12, -0.04)), base + V((math.sin(a) * 0.07 * g, 0.22, -0.13)), None, 6)
            S.part(core.horn(f"fing{s}{j}", pts, [0.01, 0.009, 0.007, 0.005, 0.003, 0.001], segs=5), f"hand_{s}", "accent", claw_m)
        S.part(kit.eye(f"eye{s}", (0.03 * g, 0.20, 2.13), 0.014), "head", "glow", glow)
    S.part(core.ico("soul", 0.06, (0, 0.03, 1.70), sub=2), "chest", "glow", glow)
    # hood: lofted cowl shell around the skull, open at the front, peaked and drooping back
    rows = []
    rngh = np.random.default_rng(4)
    for i in range(9):
        u = i / 8
        z = 1.86 + 0.56 * u
        rr = 0.235 * math.sin(math.pi * (0.18 + 0.82 * u)) ** 0.7 + 0.012
        open_deg = 55 + 40 * (1 - u)          # cowl opening narrows toward the top
        ring = []
        for j in range(15):
            a = math.radians(-180 + open_deg / 2 + (360 - open_deg) * j / 14)
            fold = 0.012 * math.sin(a * 5 + u * 3)
            ring.append(V((math.sin(a) * (rr + fold), -math.cos(a) * (rr + fold) * 1.08 + 0.10 - 0.16 * u * u + 0.05 * (1 - u), z)))
        rows.append(ring)
    hood = core.grid_strip("hood", rows, 0.014)

    def hood_w(co):
        if co.z < 1.97:
            return {"chest": 0.6, "neck": 0.4}
        return {"head": 1.0}
    S.part(hood, hood_w, "secondary", cloth_m)
    # shoulder mantle with ragged hem and folds
    mrows = []
    hem = np.random.default_rng(6).uniform(0.0, 0.12, 25)
    for i in range(5):
        u = i / 4
        z = 1.96 - 0.34 * u
        rr = 0.17 + 0.16 * u
        row = []
        for j, a in enumerate(np.linspace(-math.pi, math.pi, 25)):
            f = 0.02 * u * math.sin(a * 7)
            row.append(V((math.sin(a) * (rr + f), math.cos(a) * (rr + f) * 0.8 + 0.02, z - 0.05 * abs(math.sin(a)) - hem[j] * u ** 3)))
        mrows.append(row)
    mantle = core.grid_strip("mantle", mrows, 0.012)

    def mantle_w(co):
        if abs(co.x) > 0.18:
            return {f"clav_{'L' if co.x > 0 else 'R'}": 0.6, "chest": 0.4}
        return {"chest": 1.0}
    S.part(mantle, mantle_w, "secondary", cloth_m)
    # tattered robe panels on cloth chains
    rng = np.random.default_rng(9)
    for name, th, pts, parent in CLOTH:
        side = V((math.cos(th), -math.sin(th), 0))
        width = 0.20
        rows = []
        n = 8
        hems = rng.uniform(-0.04, 0.30, 7)
        for i in range(n):
            u = i / (n - 1)
            k = u * 3
            kk = min(int(k), 2); f = k - kk
            c = pts[kk].lerp(pts[kk + 1], f)
            w = width * (1.0 + 0.3 * u)
            row = []
            outward = V((math.sin(th), math.cos(th), 0))
            for j in range(7):
                v = (j / 6 - 0.5) * w
                drop = 0.0
                if i == n - 1:
                    drop = hems[j]  # jagged tattered hem
                fold = 0.035 * math.sin(j * 2.1 + th * 3) * (0.3 + u)
                row.append(c + side * v + outward * fold + V((0, 0, -drop)))
            rows.append(row)
        panel = core.grid_strip(name, rows, 0.01)
        chain = [f"{name}_{k + 1}" for k in range(3)]
        zs = [p.z for p in pts]

        def wfn(co, zs=zs, chain=chain):
            if co.z > zs[0] - 0.05:
                return {"spine1": 1.0}
            for k in range(3):
                if co.z >= zs[k + 1]:
                    f = (zs[k] - co.z) / (zs[k] - zs[k + 1])
                    a = chain[k]; b = chain[k + 1] if k < 2 else chain[k]
                    return {a: 1 - f * 0.5, b: f * 0.5} if a != b else {a: 1.0}
            return {chain[2]: 1.0}
        S.part(panel, wfn, "secondary", cloth_m)
    if radiant:
        gold = mats.surface("brass", "hi_gold", dark=0.75, light=0.95, rough=0.25)
        S.part(core.torus("halo", 0.27, 0.018, (0, -0.10, 2.30), rot=(math.radians(78), 0, 0), major=40, minor=8), "head", "glow", glow)
        for i in range(6):
            a = math.radians(-60 + 24 * i)
            base = V((math.sin(a) * 0.12, -0.14, 1.85))
            S.part(kit.spike(f"blade{i}", base, (math.sin(a) * 1.2, -0.6, 0.9), 0.7 - 0.06 * abs(i - 2.5), 0.05, flat=0.25,
                             flat_side=False), "chest", "glow", glow)
        S.part(core.torus("circlet", 0.105, 0.012, (0, 0.13, 2.22), rot=(0.15, 0, 0), major=28, minor=6), "head", "accent", gold)
    if oath == "oath-11":
        S.tint.update(body="#121214", accent="#a8a8b0", glow="#a070ff")
    S.bones = hover.wraith_skeleton(J, CLOTH)
    S.legs = []
    S.clip_fn = lambda ctx: hover.clips_wraith(ctx, {}, CLOTH)
    return S
