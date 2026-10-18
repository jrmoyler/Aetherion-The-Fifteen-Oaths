"""Construct: 2.4 m mechanical walker — armoured tapered torso with a reactor core, sensor head,
ball-jointed shoulders, hydraulic pistons on every limb, heavy forearm hammers, two-toed feet.
Variants: oath-14 brass clockwork (exposed gears, swinging pendulum), oath-13 folded lacquer
panels (origami facets + porcelain mask)."""
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import core, kit, mats, biped
from lib.rig import Bone
from lib.build import Spec
from lib.anim import env

V = Vector
J = dict(hips=(0, 0.0, 1.12), spine1=(0, 0.0, 1.32), spine2=(0, 0.02, 1.55), neck=(0, 0.08, 1.95), head=(0, 0.10, 2.02),
         head_top=(0, 0.12, 2.26), clav=(0.12, 0.04, 1.82), shoulder=(0.50, 0.02, 1.84), elbow=(0.58, 0.06, 1.38),
         wrist=(0.58, 0.16, 0.98), hand=(0.58, 0.22, 0.74),
         hip=(0.22, 0.0, 1.05), knee=(0.26, 0.14, 0.60), ankle=(0.26, -0.02, 0.16), ball=(0.26, 0.22, 0.05), toe=(0.26, 0.40, 0.02))


def X(p, g):
    return V((p[0] * g, p[1], p[2]))


def build(oath=None):
    S = Spec("construct", oath)
    S.height = 2.4
    S.clay = None
    clock = oath == "oath-14"
    folded = oath == "oath-13"
    S.tint = {"body": "#3c4048", "secondary": "#25272b", "accent": "#c58a4a", "glow": "#b4a2ff"}
    if clock:
        S.tint = {"body": "#8a8478", "secondary": "#2e2a24", "accent": "#b8904a", "glow": "#ffd88a"}
        body_m = mats.surface("brass", "hi_brass", dark=0.62, light=0.9, rough=0.3)
        acc_m = mats.surface("brass", "hi_brass2", dark=0.75, light=0.98, rough=0.22)
    elif folded:
        S.tint = {"body": "#e0d8cc", "secondary": "#2a3450", "accent": "#2a3450", "glow": "#e070ff"}
        body_m = mats.surface("lacquer", "hi_lacq")
        acc_m = mats.surface("lacquer", "hi_lacq2")
    else:
        body_m = mats.surface("iron", "hi_iron", dark=0.55, light=0.85, rough=0.38)
        acc_m = mats.surface("brass", "hi_bronze", dark=0.6, light=0.9, rough=0.3)
    sec_m = mats.surface("iron", "hi_dark", dark=0.4, light=0.6, rough=0.5)
    glow = mats.surface("glow", "hi_glow")
    P = S.part

    def plate(name, bone, c, size, rot=(0, 0, 0), slot="body", taper=(0.85, 0.88), bevel=None):
        m = {"body": body_m, "accent": acc_m, "secondary": sec_m, "glow": glow}[slot]
        if folded and slot in ("body", "accent"):
            # folded-paper look: faceted wedge with a centre crease (slab with few deep chips)
            ob = core.slab(name, size, c, rot, seed=len(name) * 7, chips=5, depth=(0.25, 0.4), cuts=1, bevel=0.0)
            core.shade(ob, False)
        else:
            ob = core.box(name, size, c, rot, bevel=bevel if bevel is not None else min(size) * 0.12, segs=2, taper=taper)
        return P(ob, bone, slot, m)

    # pelvis + torso
    plate("pelvis", "hips", (0, 0.0, 1.10), (0.52, 0.34, 0.22), taper=(0.8, 0.85))
    plate("waist", "spine1", (0, 0.0, 1.33), (0.30, 0.24, 0.22), slot="secondary")
    plate("chest", "chest", (0, 0.02, 1.66), (0.80, 0.50, 0.46), rot=(0.06, 0, 0), taper=(1.12, 1.0))
    plate("chestplate", "chest", (0, 0.27, 1.66), (0.56, 0.08, 0.40), rot=(0.12, 0, 0), slot="accent", taper=(0.8, 1.0))
    plate("back", "chest", (0, -0.26, 1.70), (0.62, 0.14, 0.42), slot="secondary")
    P(core.cylinder("core", 0.09, 0.06, (0, 0.33, 1.62), rot=(math.radians(84), 0, 0), segs=16, bevel=0.01), "chest", "glow", glow)
    P(core.cylinder("corering", 0.13, 0.05, (0, 0.31, 1.62), rot=(math.radians(84), 0, 0), segs=20, bevel=0.01), "chest", "accent", acc_m)
    # head: armoured sensor helm with visor slit
    plate("helm", "head", (0, 0.13, 2.08), (0.24, 0.28, 0.22), taper=(0.8, 0.8))
    plate("jawguard", "head", (0, 0.24, 2.00), (0.20, 0.10, 0.10), slot="accent", taper=(0.7, 1))
    P(core.box("visor", (0.18, 0.03, 0.035), (0, 0.27, 2.10), bevel=0.008), "head", "glow", glow)
    plate("neckcol", "neck", (0, 0.06, 1.94), (0.22, 0.20, 0.10), slot="secondary")
    for s, g in biped.SIDES:
        # shoulders, arms with pistons, forearm hammers
        P(core.ico(f"shball{s}", 0.11, X(J["shoulder"], g), sub=2), f"upperarm_{s}", "secondary", sec_m)
        plate(f"paul{s}", f"clav_{s}", X((0.50, 0.02, 1.98), g), (0.34, 0.40, 0.14), rot=(0, 0.35 * g, 0), slot="accent")
        plate(f"paul2{s}", f"clav_{s}", X((0.60, 0.02, 1.88), g), (0.20, 0.36, 0.12), rot=(0, 0.9 * g, 0))
        ua = kit.along(X(J["shoulder"], g), X(J["elbow"], g))
        plate(f"uarm{s}", f"upperarm_{s}", X(V(J["shoulder"]).lerp(V(J["elbow"]), 0.5), g), (0.16, 0.16, 0.36), rot=ua, slot="secondary")
        P(kit.piston(f"upist{s}", X((0.47, 0.12, 1.76), g), X((0.56, 0.14, 1.45), g), 0.035), f"upperarm_{s}", "accent", acc_m)
        P(core.ico(f"elb{s}", 0.075, X(J["elbow"], g), sub=1), f"forearm_{s}", "secondary", sec_m)
        fa = kit.along(X(J["elbow"], g), X(J["wrist"], g))
        plate(f"farm{s}", f"forearm_{s}", X(V(J["elbow"]).lerp(V(J["wrist"]), 0.55), g), (0.24, 0.26, 0.44), rot=fa)
        plate(f"fist{s}", f"hand_{s}", X((0.58, 0.20, 0.84), g), (0.26, 0.28, 0.26), slot="accent", taper=(0.9, 0.9))
        for k in range(3):
            P(core.box(f"knk{s}{k}", (0.07, 0.05, 0.08), X((0.58 + (k - 1) * 0.08, 0.35, 0.80), g), bevel=0.01), f"hand_{s}", "secondary", sec_m)
        # legs
        th = kit.along(X(J["hip"], g), X(J["knee"], g))
        P(core.ico(f"hipb{s}", 0.09, X(J["hip"], g), sub=1), f"thigh_{s}", "secondary", sec_m)
        plate(f"thigh{s}", f"thigh_{s}", X(V(J["hip"]).lerp(V(J["knee"]), 0.5), g), (0.22, 0.24, 0.42), rot=th)
        P(kit.piston(f"tpist{s}", X((0.30, -0.08, 1.0), g), X((0.30, 0.0, 0.66), g), 0.03), f"thigh_{s}", "accent", acc_m)
        plate(f"knee{s}", f"shin_{s}", X((0.26, 0.24, 0.62), g), (0.16, 0.10, 0.16), slot="accent")
        sh = kit.along(X(J["knee"], g), X(J["ankle"], g))
        plate(f"shin{s}", f"shin_{s}", X(V(J["knee"]).lerp(V(J["ankle"]), 0.5), g), (0.20, 0.24, 0.42), rot=sh)
        P(kit.piston(f"spist{s}", X((0.26, -0.14, 0.55), g), X((0.26, -0.12, 0.22), g), 0.025), f"shin_{s}", "accent", acc_m)
        plate(f"foot{s}", f"foot_{s}", X((0.26, 0.10, 0.07), g), (0.24, 0.36, 0.12), slot="secondary")
        for d in (-1, 1):
            plate(f"toe{s}{d}", f"toe_{s}", X((0.26 + d * 0.065, 0.32, 0.045), g), (0.10, 0.20, 0.08), slot="accent", taper=(0.7, 0.6))
        plate(f"heel{s}", f"foot_{s}", X((0.26, -0.12, 0.05), g), (0.12, 0.12, 0.09), slot="accent")
    # segmented abdomen slats, chest grille, cables, axle caps (mechanical read, not a toy block)
    for k in range(3):
        plate(f"slat{k}", "spine1", (0, 0.13, 1.25 + 0.085 * k), (0.34 - 0.02 * k, 0.06, 0.07), rot=(0.1, 0, 0), slot="body", taper=(0.9, 0.9))
    for k in range(4):
        P(core.box(f"grille{k}", (0.16, 0.025, 0.022), (0, 0.345, 1.76 - 0.04 * k), rot=(0.3, 0, 0), bevel=0.004), "chest", "secondary", sec_m)
    for s, g in biped.SIDES:
        cp = core.bezier_pts(X((0.30, 0.10, 1.48), g), X((0.36, 0.20, 1.30), g), X((0.30, 0.18, 1.12), g), X((0.20, 0.12, 1.10), g), 8)
        P(core.horn(f"cable{s}", cp, [0.022] * 8, segs=6, cap_flat=True), "spine1", "secondary", sec_m)
        cp2 = core.bezier_pts(X((0.18, -0.28, 1.86), g), X((0.40, -0.24, 1.95), g), X((0.52, -0.10, 1.90), g), None, 7)
        P(core.horn(f"cable2{s}", cp2, [0.02] * 7, segs=6, cap_flat=True), "chest", "secondary", sec_m)
        for nm, bn, pnt, r in (("axk", f"shin_{s}", J["knee"], 0.07), ("axe", f"forearm_{s}", J["elbow"], 0.065)):
            P(core.cylinder(f"{nm}{s}", r, 0.06, X((pnt[0] + 0.07, pnt[1], pnt[2]), g), rot=(0, math.radians(90), 0), segs=12, bevel=0.008),
              bn, "accent", acc_m)
        P(core.cylinder(f"tank{s}", 0.075, 0.42, X((0.20, -0.36, 1.55), g), rot=(0, 0, 0), segs=12, bevel=0.012), "chest", "body", body_m)
    # exhaust stacks on the back
    for s, g in biped.SIDES:
        P(core.cylinder(f"stack{s}", 0.05, 0.36, X((0.16, -0.36, 1.92), g), rot=(-0.25, 0, 0), segs=10, bevel=0.006), "chest", "secondary", sec_m)
        P(core.cylinder(f"stackglow{s}", 0.035, 0.02, X((0.16, -0.40, 2.10), g), rot=(-0.25, 0, 0), segs=10), "chest", "glow", glow)
    extra = []
    xf = None
    if clock:
        brass = acc_m
        for i, (c, r, rot, bn) in enumerate((((0.24, 0.29, 1.80), 0.16, (math.radians(84), 0, 0), "chest"),
                                             ((-0.22, 0.30, 1.52), 0.12, (math.radians(84), 0, 0), "chest"),
                                             ((0.62, 0.02, 1.84), 0.10, (0, math.radians(90), 0), "upperarm_L"),
                                             ((-0.62, 0.02, 1.84), 0.10, (0, math.radians(90), 0), "upperarm_R"),
                                             ((0, -0.36, 1.66), 0.22, (math.radians(90), 0, 0), "chest"))):
            P(kit.gear(f"gear{i}", r, 12 + 2 * i, 0.03, c, rot), bn, "accent", brass)
        # pendulum hanging in an open cage below the chest
        extra.append(Bone("pendulum", (0, 0.10, 1.48), (0, 0.10, 1.12), "chest"))
        P(core.horn("pendrod", [V((0, 0.12, 1.48)), V((0, 0.12, 1.16))], [0.012, 0.012], segs=6), "pendulum", "accent", brass)
        P(core.cylinder("pendbob", 0.08, 0.025, (0, 0.12, 1.15), rot=(math.radians(90), 0, 0), segs=18, bevel=0.006), "pendulum", "glow", glow)

        def xf(clip, t, Pz):
            w = 2 * math.pi * t
            sw = {"idle": 1, "walk": 2, "run": 3}.get(clip, 2)
            Pz.r("pendulum", z=0.45 * math.sin(w * sw))
    elif folded:
        # crane-wing fins and a porcelain mask
        for s, g in biped.SIDES:
            for k in range(3):
                plate(f"fin{s}{k}", "chest", X((0.24 + 0.08 * k, -0.30, 1.90 + 0.10 * k), g), (0.05, 0.30, 0.50 - 0.1 * k),
                      rot=(-0.4 - 0.15 * k, 0.4 * g, 0.2 * g), slot="accent")
        P(core.ico("mask", 0.12, (0, 0.27, 2.08), sub=2, scale=(0.9, 0.45, 1.1)), "head", "body", mats.surface("lacquer", "hi_mask"))
        for s, g in biped.SIDES:
            P(core.box(f"maskeye{s}", (0.05, 0.02, 0.012), (0.045 * g, 0.325, 2.11), rot=(0, 0, 0.3 * g), bevel=0.004), "head", "glow", glow)
    S.bones = biped.humanoid(J, extra=extra)
    S.legs = biped.humanoid_legs()
    S.clip_fn = lambda ctx: biped.clips_heavy(ctx, dict(stride=0.8, lift=0.15, roar=True, sway=0.6, arm_weight=0.8, extra_fn=xf,
                                                        walk_frames=40, run_frames=24, attack_frames=36))
    return S
