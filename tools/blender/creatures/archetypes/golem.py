"""Golem: hunched 3.2 m humanoid of rigid, faceted stone masses (one rigid chunk set per bone, so
it articulates like a real stacked construct, never blobby), long knuckle-dragging arms, a
furnace/heart core glowing through the chest seams.
Variants: oath-02 glacial ice + icicles, oath-05 amethyst crystal growths, oath-10 orbiting
gravity spheres, oath-15 riveted iron plate (Bulwark)."""
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import core, kit, mats, biped
from lib.rig import Bone
from lib.build import Spec
from lib.anim import env

J = dict(
    hips=(0, 0.0, 1.35), spine1=(0, 0.02, 1.62), spine2=(0, 0.08, 2.00), neck=(0, 0.30, 2.42),
    head=(0, 0.40, 2.50), head_top=(0, 0.46, 2.80),
    clav=(0.16, 0.14, 2.30), shoulder=(0.64, 0.12, 2.36), elbow=(0.82, 0.16, 1.66), wrist=(0.84, 0.30, 0.98),
    hand=(0.84, 0.36, 0.60),
    hip=(0.32, 0.0, 1.25), knee=(0.40, 0.14, 0.72), ankle=(0.40, -0.02, 0.20), ball=(0.40, 0.30, 0.07),
    toe=(0.40, 0.46, 0.02),
)
V = Vector


def _mid(a, b, t=0.5):
    return V(a).lerp(V(b), t)


def build(oath=None):
    S = Spec("golem", oath)
    S.height = 3.2
    S.clay = None
    S.low_tris = 0
    S.tint = {"body": "#5a5650", "secondary": "#3a3632", "accent": "#7a6a58", "glow": "#ff8a3a"}
    iron = oath == "oath-15"
    ice = oath == "oath-02"
    if iron:
        S.tint.update(body="#3a3c40", accent="#f07a20", glow="#ffb050")
        mat_body = mats.surface("iron", "hi_iron", dark=0.55, light=0.85, rough=0.35)
        mat_acc = mats.surface("iron", "hi_iron2", dark=0.7, light=0.95, rough=0.3)
    elif ice:
        S.tint.update(body="#9fb8c8", accent="#4a5058", glow="#bfe8ff")
        mat_body = mats.surface("ice", "hi_ice")
        mat_acc = mats.surface("stone", "hi_stone", cells=3.0)
    else:
        mat_body = mats.surface("stone", "hi_stone", cells=3.0)
        mat_acc = mats.surface("stone", "hi_stone2", cells=5.0)
    glow = mats.surface("glow", "hi_glow")
    det = (2, 0.03, 0.16)

    def along(a, b):
        d = (V(b) - V(a)).normalized()
        return V((0, 0, 1)).rotation_difference(d).to_euler()

    def chunk(name, bone, c, size, rot=(0, 0, 0), seed=0, slot="body", chips=12):
        if iron:
            ob = core.box(name, size, c, rot, bevel=min(size) * 0.1, segs=2, taper=(0.9, 0.92))
            S.part(ob, bone, slot, mat_body if slot == "body" else mat_acc)
        else:
            ob = core.slab(name, size, c, rot, seed=seed, chips=chips)
            S.part(ob, bone, slot, mat_body if slot == "body" else mat_acc, detail=det)
        return ob

    def seam(name, bone, p, r):
        S.part(core.ico(name, r, V(p), sub=1, jitter=0.25, seed=len(name), flat=True), bone, "glow", glow)

    # ---- torso: stacked hewn slabs
    chunk("pelvis", "hips", (0, 0.0, 1.30), (0.95, 0.62, 0.42), seed=1)
    chunk("abd1", "spine1", (0, 0.05, 1.58), (0.78, 0.56, 0.30), seed=2)
    chunk("abd2", "spine1", (0, 0.10, 1.82), (0.88, 0.62, 0.30), rot=(0.08, 0, 0), seed=3)
    chunk("chest", "chest", (0, 0.10, 2.14), (1.30, 0.80, 0.62), rot=(0.12, 0, 0), seed=4)
    chunk("hump", "chest", (0, -0.24, 2.40), (1.05, 0.52, 0.46), rot=(-0.35, 0, 0), seed=5, slot="accent")
    chunk("head", "head", (0, 0.46, 2.58), (0.38, 0.40, 0.36), rot=(0.1, 0, 0), seed=6)
    chunk("brow", "head", (0, 0.60, 2.70), (0.50, 0.20, 0.15), rot=(0.25, 0, 0), seed=7, slot="accent", chips=6)
    chunk("jawblk", "head", (0, 0.56, 2.45), (0.32, 0.28, 0.15), seed=8, chips=6)
    for s, g in biped.SIDES:
        X = V((g, 1, 1))
        S.part(core.box(f"eye{s}", (0.08, 0.03, 0.03), (0.085 * g, 0.66, 2.615), (0, 0, -0.25 * g), bevel=0.008), "head", "glow", glow)
        chunk(f"pec{s}", "chest", (0.30 * g, 0.48, 2.16), (0.52, 0.2, 0.46), rot=(0.15, 0, 0.15 * g), seed=9 + g)
        chunk(f"paul{s}", f"clav_{s}", (0.64 * g, 0.10, 2.46), (0.62, 0.72, 0.42), rot=(0, 0.35 * g, 0), seed=11 + g, slot="accent")
        chunk(f"uarm{s}", f"upperarm_{s}", (V(J["shoulder"]).lerp(V(J["elbow"]), 0.55)) * X, (0.38, 0.40, 0.62),
              rot=along(V(J["shoulder"]) * X, V(J["elbow"]) * X), seed=13 + g)
        chunk(f"farm{s}", f"forearm_{s}", (V(J["elbow"]).lerp(V(J["wrist"]), 0.5)) * X, (0.50, 0.48, 0.70),
              rot=along(V(J["elbow"]) * X, V(J["wrist"]) * X), seed=15 + g)
        chunk(f"fist{s}", f"hand_{s}", V((0.84 * g, 0.36, 0.74)), (0.44, 0.50, 0.40), seed=17 + g, slot="accent")
        chunk(f"knuck{s}", f"hand_{s}", V((0.84 * g, 0.58, 0.62)), (0.42, 0.18, 0.20), seed=19 + g, chips=6)
        chunk(f"thigh{s}", f"thigh_{s}", (V(J["hip"]).lerp(V(J["knee"]), 0.5)) * X, (0.46, 0.46, 0.56),
              rot=along(V(J["hip"]) * X, V(J["knee"]) * X), seed=21 + g)
        chunk(f"kcap{s}", f"shin_{s}", V((0.40 * g, 0.30, 0.74)), (0.28, 0.18, 0.26), seed=23 + g, slot="accent", chips=6)
        chunk(f"shin{s}", f"shin_{s}", (V(J["knee"]).lerp(V(J["ankle"]), 0.48)) * X, (0.42, 0.44, 0.58),
              rot=along(V(J["knee"]) * X, V(J["ankle"]) * X), seed=25 + g)
        chunk(f"foot{s}", f"foot_{s}", V((0.40 * g, 0.16, 0.11)), (0.44, 0.70, 0.22), seed=27 + g, slot="accent")
        chunk(f"toes{s}", f"toe_{s}", V((0.40 * g, 0.45, 0.07)), (0.46, 0.24, 0.14), seed=29 + g, chips=6)
        for nm, bn, p, r in (("gsh", f"upperarm_{s}", J["shoulder"], 0.12), ("gel", f"forearm_{s}", J["elbow"], 0.12),
                             ("gkn", f"shin_{s}", J["knee"], 0.11), ("gwr", f"hand_{s}", J["wrist"], 0.10),
                             ("ghip", f"thigh_{s}", J["hip"], 0.12)):
            seam(f"{nm}{s}", bn, V(p) * X, r)
    # heart core glowing in the fissure between the chest plates
    S.part(core.box("core", (0.14, 0.12, 0.42), (0, 0.52, 2.16), bevel=0.02), "chest", "glow", glow)
    seam("gwaist", "spine1", (0, 0.06, 1.45), 0.16)
    seam("gneck", "neck", (0, 0.32, 2.44), 0.13)

    extra = []
    xf = None
    if oath == "oath-05":   # amethyst geode growths erupting from back, shoulders, forearms
        S.tint.update(body="#6e5a44", accent="#9a5cd6", glow="#b07cff")
        cry = mats.surface("crystal", "hi_crystal")
        rng = np.random.default_rng(5)
        sites = [((0, -0.30, 2.55), (0, -0.5, 1), "chest", 0.55), ((0.25, -0.25, 2.45), (0.5, -0.5, 1), "chest", 0.45),
                 ((-0.25, -0.25, 2.45), (-0.5, -0.5, 1), "chest", 0.45), ((0.62, 0.0, 2.68), (0.4, -0.2, 1), "clav_L", 0.4),
                 ((-0.62, 0.0, 2.68), (-0.4, -0.2, 1), "clav_R", 0.4), ((0.95, 0.05, 1.35), (1, -0.3, 0.3), "forearm_L", 0.3),
                 ((-0.95, 0.05, 1.35), (-1, -0.3, 0.3), "forearm_R", 0.3), ((0, -0.25, 1.55), (0, -1, 0.4), "spine1", 0.3)]
        for i, (p, d, bn, L) in enumerate(sites):
            for j in range(4):
                dd = V(d).normalized() + V(rng.normal(size=3)) * 0.35
                ln = L * rng.uniform(0.5, 1.0)
                base = V(p) + V(rng.normal(size=3)) * 0.06
                ob = core.cylinder(f"cry{i}_{j}", 0.07 * ln / 0.4 + 0.03, ln, (0, 0, 0), segs=6, r2=0.0, bevel=0.0)
                q = V((0, 0, 1)).rotation_difference(dd.normalized())
                ob.matrix_world = Matrix.Translation(base + dd.normalized() * ln * 0.45) @ q.to_matrix().to_4x4()
                core.apply_transform(ob)
                core.shade(ob, False)
                S.part(ob, bn, "accent", cry)
    elif ice:  # icicles hanging from arms, chin, chest ledge
        icem = mats.surface("ice", "hi_ice2")
        rng = np.random.default_rng(2)
        for s, g in biped.SIDES:
            for j in range(4):
                p = V((0.60 * g + rng.uniform(-0.2, 0.2), 0.12 + rng.uniform(-0.2, 0.2), 2.18))
                S.part(kit.spike(f"icl{s}{j}", p, (0, 0, -1), rng.uniform(0.18, 0.35), 0.05, segs=6), f"clav_{s}", "accent", icem)
            for j in range(3):
                p = V((0.85 * g + rng.uniform(-0.12, 0.12), 0.18 + rng.uniform(-0.1, 0.1), 1.42))
                S.part(kit.spike(f"ica{s}{j}", p, (0, 0, -1), rng.uniform(0.15, 0.28), 0.04, segs=6), f"forearm_{s}", "accent", icem)
            S.part(kit.spike(f"ich{s}", V((0.25 * g, -0.1, 2.72)), (0.4 * g, -0.4, 1), 0.45, 0.09, segs=6), "chest", "accent", icem)
        S.glow_strength = 2.0
    elif oath == "oath-10":  # gravity: three spheres orbiting the torso on their own bones
        S.tint.update(body="#4a4c58", accent="#8a5ad8", glow="#9a7aff")
        orbm = mats.surface("stone", "hi_orb", cells=2.0)
        extra.append(Bone("orbit", (0, 0.1, 2.05), (0, 0.1, 2.40), "chest"))
        for i in range(3):
            a = 2 * math.pi * i / 3
            c = V((math.cos(a) * 1.25, math.sin(a) * 1.25 + 0.1, 2.05 + 0.25 * math.sin(a * 2)))
            extra.append(Bone(f"orb{i + 1}", c, c + V((0, 0, 0.25)), "orbit"))
            S.part(core.ico(f"orb{i}", 0.20 - 0.03 * i, c, sub=3), f"orb{i + 1}", "accent", orbm)
            S.part(core.cylinder(f"orbr{i}", 0.27 - 0.035 * i, 0.03, c, rot=(0.5, 0.3 * i, 0), segs=16, bevel=0.005),
                   f"orb{i + 1}", "glow", glow)

        def xf(clip, t, P):
            loop = clip in ("idle", "walk", "run")
            P.r("orbit", y=2 * math.pi * t * (1 if loop else 0.35))
            for i in range(3):
                ph = 2 * math.pi * (t + i / 3)
                P.move(f"orb{i + 1}", z=0.10 * math.sin(ph * (2 if loop else 1)))
                if clip == "death":
                    P.move(f"orb{i + 1}", z=-2.2 * env(t, [(0.3, 0), (0.6, 1)]))
    elif iron:  # rivet rows along plate edges, chimney vents
        acc = mats.surface("iron", "hi_rivet", dark=0.8, light=0.95, rough=0.25)
        for bn, c, w in (("chest", (0, 0.62, 2.30), 1.1), ("chest", (0, 0.62, 1.84), 1.0), ("hips", (0, 0.36, 1.30), 0.8)):
            pts = [V((x, c[1], c[2])) for x in np.linspace(-w / 2, w / 2, 8)]
            S.part(kit.rivets(f"riv{bn}{c[2]}", pts, 0.035), bn, "accent", acc)
        for s, g in biped.SIDES:
            S.part(core.cylinder(f"vent{s}", 0.09, 0.45, (0.30 * g, -0.42, 2.62), rot=(-0.35, 0.2 * g, 0), segs=10, bevel=0.01),
                   "chest", "accent", mat_acc)
    if oath == "oath-01":
        S.tint.update(body="#3a3634", accent="#6b3a24", glow="#ff6a1a")
    S.bones = biped.humanoid(J, jaw=False, extra=extra)
    S.legs = biped.humanoid_legs()
    S.loc_bones = ["hips"] + [b.name for b in extra]
    S.clip_fn = lambda ctx: biped.clips_heavy(ctx, dict(stride=0.7, lift=0.14, roar=True, sway=1.0, extra_fn=xf,
                                                        walk_frames=48, run_frames=28, attack_frames=44))
    return S
