"""Eight-legged skeleton + alternating-tetrapod gait (spider)."""
import math
from mathutils import Vector, Matrix
from .rig import Bone, half_bone
from .anim import Leg, env, smooth, step_cycle

SIDES = (("L", 1.0), ("R", -1.0))


def spider_skeleton(body, legs, extra=None):
    """body: dict(ceph0, ceph1, abd0, abd1, fang0, fang1, palp0, palp1);
    legs: list of (index, coxa, knee, ankle, tip) for the left side (x>0)."""
    B = [Bone("root", (0, 0, 0), (0, 0.3, 0), None, deform=False)]
    B.append(Bone("hips", body["ceph0"], body["ceph1"], "root"))
    B.append(Bone("abdomen", body["abd0"], body["abd1"], "hips"))
    for s, g in SIDES:
        X = Vector((g, 1, 1))
        B.append(Bone(f"fang_{s}", Vector(body["fang0"]) * X, Vector(body["fang1"]) * X, "hips"))
        B.append(Bone(f"palp_{s}", Vector(body["palp0"]) * X, Vector(body["palp1"]) * X, "hips"))
        for i, cox, knee, ank, tip in legs:
            B.append(Bone(f"femur{i}_{s}", Vector(cox) * X, Vector(knee) * X, "hips"))
            B.append(Bone(f"tibia{i}_{s}", Vector(knee) * X, Vector(ank) * X, f"femur{i}_{s}"))
            B.append(Bone(f"tarsus{i}_{s}", Vector(ank) * X, Vector(tip) * X, f"tibia{i}_{s}"))
            B.append(half_bone(B[-3], "hips"))                    # coxa joint helper
            B.append(half_bone(B[-3], f"femur{i}_{s}"))           # knee joint helper
    if extra:
        B += extra
    return B


GROUP_A = {"1_L", "2_R", "3_L", "4_R"}


def spider_legs(legs):
    out = []
    for s, g in SIDES:
        for i, cox, knee, ank, tip in legs:
            radial = Vector((tip[0] * g, tip[1], 0)) - Vector((cox[0] * g, cox[1], 0))
            radial.normalize()
            axis = Vector((0, 0, 1)).cross(radial).normalized()
            ph = (0.0 if f"{i}_{s}" in GROUP_A else 0.5) + 0.04 * i
            out.append(Leg(f"{i}_{s}", [f"femur{i}_{s}", f"tibia{i}_{s}", f"tarsus{i}_{s}"], phase=ph,
                           pole=(radial.x * 0.6, radial.y * 0.6, 1.0), pole_dist=0.6, axis=axis))
    return out


def clips_spider(ctx, p, legs_spec):
    H = ctx.spec.height
    names = [f"{i}_{s}" for s, g in SIDES for i, *_ in legs_spec]
    radial = {}
    for s, g in SIDES:
        for i, cox, knee, ank, tip in legs_spec:
            r = Vector((tip[0] * g, tip[1], 0)) - Vector((cox[0] * g, cox[1], 0))
            radial[f"{i}_{s}"] = r.normalized()
    ph = {n: (0.0 if n in GROUP_A else 0.5) + 0.04 * int(n[0]) for n in names}
    span = (ctx.head("femur1_L") - ctx.tail("tarsus1_L")).length
    stride = p.get("stride", 0.32) * span
    lift = p.get("lift", 0.16) * span
    xf = p.get("extra_fn")

    def fangs(P, k):
        for s, g in SIDES:
            P.r(f"fang_{s}", x=-0.5 * k, z=-g * 0.25 * k)
            P.r(f"palp_{s}", x=0.4 * k)

    def idle(t, P):
        w = 2 * math.pi * t
        P.move("hips", z=0.006 * H * math.sin(w * 2))
        P.r("hips", x=0.02 * math.sin(w))
        P.r("abdomen", x=0.04 * math.sin(w * 2 + 1), z=0.03 * math.sin(w))
        fangs(P, 0.1 + 0.1 * math.sin(w * 3))
        for n in names:
            # occasional tap of the front legs
            tap = env(t, [(0, 0), (0.3, 0), (0.36, 1), (0.42, 0), (1, 0)]) if n.startswith("1") else 0.0
            P.foot(n, (0, 0, 0.05 * span * tap))
        if xf: xf("idle", t, P)

    def gait(t, P, run):
        w = 2 * math.pi * t
        duty = 0.42 if run else 0.55
        st = stride * (1.5 if run else 1.0)
        for n in names:
            dy, dz, _ = step_cycle(t + ph[n], duty, st, lift * (1.2 if run else 1.0))
            P.foot(n, (0, dy, dz))
        P.move("hips", z=0.01 * H * math.cos(w * 4) - (0.03 * H if run else 0), x=0.006 * H * math.sin(w * 2))
        P.r("hips", y=0.03 * math.sin(w * 2), z=0.03 * math.sin(w * 2))
        P.r("abdomen", z=-0.08 * math.sin(w * 2), x=0.04 * math.cos(w * 4))
        fangs(P, 0.15)
        if xf: xf("run" if run else "walk", t, P)

    def attack(t, P):
        rear = env(t, [(0, 0), (0.32, 1), (0.45, 0.4), (0.65, 0.4), (1, 0)])
        strike = env(t, [(0, 0), (0.34, 0), (0.44, 1), (0.6, 1), (0.9, 0)])
        P.move("hips", z=0.10 * H * rear, y=-0.06 * H * rear + 0.12 * H * strike)
        P.r("hips", x=0.45 * rear - 0.25 * strike)
        P.r("abdomen", x=-0.4 * rear + 0.2 * strike)
        fangs(P, 0.8 * rear + 0.5 * strike - 0.9 * env(t, [(0, 0), (0.44, 0), (0.5, 1), (0.7, 0)]))
        for n in names:
            if n.startswith("1"):
                r = radial[n]
                P.foot(n, (r.x * 0.1 * span, 0.35 * span * rear + 0.2 * span * strike, 0.55 * span * rear - 0.3 * span * strike))
            elif n.startswith("2"):
                P.foot(n, (0, 0.15 * span * rear, 0.2 * span * rear))
            else:
                P.foot(n)
        if xf: xf("attack", t, P)

    def hit(t, P):
        k = env(t, [(0, 0), (0.15, 1), (0.4, 0.6), (1, 0)])
        P.move("hips", y=-0.06 * H * k, z=0.03 * H * k)
        P.r("hips", x=0.15 * k, y=0.1 * k)
        P.r("abdomen", x=-0.2 * k)
        fangs(P, 0.6 * k)
        for n in names:
            P.foot(n)
        if xf: xf("hit", t, P)

    def death(t, P):
        k1 = env(t, [(0, 0), (0.35, 1)])
        k2 = env(t, [(0.2, 0), (0.75, 1)])
        hz = ctx.head("hips").z
        P.move("hips", z=-(hz * 0.62) * k1)
        P.r("hips", y=0.15 * k2, x=-0.08 * k2)
        P.r("abdomen", x=0.12 * k2)
        fangs(P, 0.5 * k2)
        # legs curl inward under the body (classic death curl), solved by IK
        for n in names:
            r = radial[n]
            curl = span * 0.55 * k2
            P.foot(n, (-r.x * curl, -r.y * curl, -(hz * 0.62) * k1 * 0.3 + 0.35 * span * k2), 0.0)
        if xf: xf("death", t, P)

    def roar(t, P):
        k = env(t, [(0, 0), (0.25, 1), (0.8, 1), (1, 0)])
        sh = math.sin(t * 2 * math.pi * 12) * env(t, [(0.25, 0), (0.35, 1), (0.75, 1), (0.85, 0)])
        P.move("hips", z=0.12 * H * k)
        P.r("hips", x=0.5 * k + 0.02 * sh)
        P.r("abdomen", x=-0.45 * k)
        fangs(P, 1.0 * k)
        for n in names:
            r = radial[n]
            if n.startswith("1") or n.startswith("2"):
                P.foot(n, (r.x * 0.2 * span, r.y * 0.2 * span + 0.2 * span * k, (0.6 if n.startswith("1") else 0.3) * span * k + 0.02 * span * sh))
            else:
                P.foot(n)
        if xf: xf("roar", t, P)

    C = {"idle": (60, idle), "walk": (p.get("walk_frames", 24), lambda t, P: gait(t, P, False)),
         "run": (p.get("run_frames", 14), lambda t, P: gait(t, P, True)),
         "attack": (32, attack), "hit": (15, hit), "death": (45, death), "roar": (60, roar)}
    return C
