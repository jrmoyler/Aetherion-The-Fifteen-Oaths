"""Hovering archetypes: wraith (cloaked humanoid torso + cloth chains) and wisp (elemental core +
orbiting shards + trailing tendrils)."""
import math
from mathutils import Vector
from .rig import Bone
from .anim import env

SIDES = (("L", 1.0), ("R", -1.0))


def mx(p, g):
    return Vector((p[0] * g, p[1], p[2]))


def cloth_dir(theta, a, trail=0.0):
    """rotation (x, z) for a vertical cloth bone (local Z = forward) that swings its tip radially
    outward by `a` at azimuth theta (0 = front), plus `trail` backward."""
    return (math.cos(theta) * a - trail, -math.sin(theta) * a)


def wraith_skeleton(J, cloth):
    """cloth: list of (name, theta, [p0, p1, p2, p3]) chains hanging from the body."""
    B = [Bone("root", (0, 0, 0), (0, 0.3, 0), None, deform=False)]
    B.append(Bone("hips", J["hips"], J["spine1"], "root"))
    B.append(Bone("spine1", J["spine1"], J["chest"], "hips"))
    B.append(Bone("chest", J["chest"], J["neck"], "spine1"))
    B.append(Bone("neck", J["neck"], J["head"], "chest"))
    B.append(Bone("head", J["head"], J["head_top"], "neck"))
    B.append(Bone("jaw", J["jaw0"], J["jaw1"], "head"))
    for s, g in SIDES:
        B.append(Bone(f"clav_{s}", mx(J["clav"], g), mx(J["shoulder"], g), "chest"))
        B.append(Bone(f"upperarm_{s}", mx(J["shoulder"], g), mx(J["elbow"], g), f"clav_{s}"))
        B.append(Bone(f"forearm_{s}", mx(J["elbow"], g), mx(J["wrist"], g), f"upperarm_{s}"))
        B.append(Bone(f"hand_{s}", mx(J["wrist"], g), mx(J["hand"], g), f"forearm_{s}"))
    for name, theta, pts, parent in cloth:
        prev = parent
        for k in range(len(pts) - 1):
            bn = f"{name}_{k + 1}"
            B.append(Bone(bn, pts[k], pts[k + 1], prev, roll_ref=(0, 1, 0)))
            prev = bn
    return B


def clips_wraith(ctx, p, cloth):
    H = ctx.spec.height
    xf = p.get("extra_fn")

    def flutter(P, t, amp, trail, speed=2, flare=0.0):
        w = 2 * math.pi * t
        for name, theta, pts, parent in cloth:
            n = len(pts) - 1
            for k in range(n):
                ph = w * speed - k * 0.9 + theta * 1.7
                a = flare * (0.6 + 0.4 * k) + amp * (0.5 + 0.5 * k) * math.sin(ph)
                x, z = cloth_dir(theta, a, trail * (0.5 + 0.5 * k))
                P.r(f"{name}_{k + 1}", x=x, z=z + 0.4 * amp * math.sin(ph + 1.3) * (k + 1) / n)

    def arms(P, fwd=0.0, out=0.0, bend=0.0, w=0.0, sw=0.03):
        for s, g in SIDES:
            P.r(f"upperarm_{s}", x=fwd + sw * math.sin(w + g), z=-g * out)
            P.r(f"forearm_{s}", x=bend + sw * math.sin(w + g + 1))
            P.r(f"hand_{s}", x=0.1 * math.sin(w + g + 2) * (sw / 0.03))

    def idle(t, P):
        w = 2 * math.pi * t
        P.move("hips", z=0.03 * H * math.sin(w))
        P.r("spine1", x=0.03 * math.sin(w + 0.6))
        P.r("chest", x=0.03 * math.sin(w + 1.2), y=0.04 * math.sin(w))
        P.r("neck", y=0.1 * math.sin(w * 0.5 * 2), x=0.04 * math.sin(w + 2))
        P.r("head", x=0.05 * math.sin(w + 2.4), z=0.06 * math.sin(w))
        P.r("jaw", x=-0.08 - 0.05 * math.sin(w * 2))
        arms(P, 0.0, 0.05, 0.0, w)
        flutter(P, t, 0.10, 0.0, 2)
        if xf: xf("idle", t, P)

    def glide(t, P, run):
        w = 2 * math.pi * t
        lean = 0.30 if run else 0.16
        P.move("hips", z=0.02 * H * math.sin(w * 2), x=0.01 * H * math.sin(w))
        P.r("hips", x=-lean * 0.6)
        P.r("spine1", x=-lean * 0.3, z=0.05 * math.sin(w))
        P.r("chest", x=-lean * 0.2, z=0.05 * math.sin(w + 0.5))
        P.r("neck", x=lean * 0.5)
        P.r("head", x=lean * 0.4)
        arms(P, -0.25 if run else -0.1, 0.15, 0.2, w, 0.06)
        flutter(P, t, 0.14 if run else 0.11, 0.55 if run else 0.3, 2 if run else 1)
        if xf: xf("run" if run else "walk", t, P)

    def attack(t, P):
        a = env(t, [(0, 0), (0.32, 1), (0.42, -0.3), (0.62, -0.3), (1, 0)])
        k = env(t, [(0, 0), (0.32, 0), (0.44, 1), (0.6, 1), (0.95, 0)])
        P.move("hips", y=(-0.06 * a + 0.12 * k) * H, z=0.04 * H * a)
        P.r("spine1", x=0.15 * a - 0.3 * k)
        P.r("chest", x=0.15 * a - 0.2 * k, y=0.2 * a - 0.25 * k)
        P.r("neck", x=-0.1 * a + 0.2 * k)
        P.r("jaw", x=-0.5 * k - 0.2 * a)
        for s, g in SIDES:
            P.r(f"upperarm_{s}", x=-0.9 * a + 1.6 * k, z=-g * (0.6 * a - 0.1 * k))
            P.r(f"forearm_{s}", x=0.8 * a - 0.2 * k)
            P.r(f"hand_{s}", x=0.4 * a - 0.3 * k)
        flutter(P, t, 0.12, 0.4 * k - 0.2 * a, 2, flare=0.35 * k)
        if xf: xf("attack", t, P)

    def hit(t, P):
        k = env(t, [(0, 0), (0.15, 1), (0.4, 0.6), (1, 0)])
        P.move("hips", y=-0.07 * H * k)
        P.r("spine1", x=0.2 * k, z=0.1 * k)
        P.r("chest", x=0.15 * k)
        P.r("head", x=0.25 * k, y=0.2 * k)
        P.r("jaw", x=-0.5 * k)
        arms(P, -0.4 * k, 0.4 * k, 0.5 * k)
        flutter(P, t, 0.12, -0.4 * k, 3)
        if xf: xf("hit", t, P)

    def death(t, P):
        k1 = env(t, [(0, 0), (0.25, 1)])          # shriek
        k2 = env(t, [(0.25, 0), (0.75, 1)])       # collapse
        hz = ctx.head("hips").z
        P.move("hips", z=-(hz - 0.18 * H) * k2, y=0.04 * H * k2)
        P.r("hips", x=-0.6 * k2)
        P.r("spine1", x=0.25 * k1 - 0.5 * k2)
        P.r("chest", x=0.2 * k1 - 0.4 * k2)
        P.r("neck", x=0.3 * k1 - 0.3 * k2)
        P.r("head", x=0.3 * k1, y=0.3 * k2)
        P.r("jaw", x=-0.7 * k1 * (1 - k2) - 0.3 * k2)
        arms(P, 0.4 * k1 * (1 - k2) + 0.2 * k2, 0.9 * k1 * (1 - k2) + 0.5 * k2, 0.4 * k2)
        flutter(P, t * (1 - 0.8 * k2), 0.12 * (1 - k2), 0.0, 2, flare=0.6 * k2)
        if xf: xf("death", t, P)

    def roar(t, P):
        k = env(t, [(0, 0), (0.25, 1), (0.8, 1), (1, 0)])
        sh = math.sin(t * 2 * math.pi * 11) * env(t, [(0.25, 0), (0.35, 1), (0.75, 1), (0.85, 0)])
        P.move("hips", z=0.06 * H * k)
        P.r("spine1", x=0.2 * k)
        P.r("chest", x=0.2 * k + 0.02 * sh)
        P.r("neck", x=0.2 * k)
        P.r("head", x=0.25 * k + 0.04 * sh)
        P.r("jaw", x=-0.8 * k)
        arms(P, 0.4 * k, 1.1 * k, 0.3 * k)
        flutter(P, t, 0.12 + 0.08 * k, 0.0, 3, flare=0.5 * k)
        if xf: xf("roar", t, P)

    return {"idle": (60, idle), "walk": (40, lambda t, P: glide(t, P, False)), "run": (30, lambda t, P: glide(t, P, True)),
            "attack": (32, attack), "hit": (16, hit), "death": (54, death), "roar": (60, roar)}


# ----------------------------------------------------------------------------- wisp
def wisp_skeleton(core_c, shards, tendrils):
    """shards: list of (name, pos); tendrils: list of (name, [pts])"""
    B = [Bone("root", (0, 0, 0), (0, 0.3, 0), None, deform=False)]
    c = Vector(core_c)
    B.append(Bone("hips", c, c + Vector((0, 0, 0.3)), "root"))
    B.append(Bone("core", c, c + Vector((0, 0.25, 0)), "hips"))
    B.append(Bone("orbit_a", c, c + Vector((0, 0, 0.35)), "hips"))
    B.append(Bone("orbit_b", c, c + Vector((0, 0, 0.35)), "hips"))
    for i, (name, pos, ring) in enumerate(shards):
        pos = Vector(pos)
        B.append(Bone(name, pos, pos + (pos - c).normalized() * 0.15, ring))
    for name, pts in tendrils:
        prev = "hips"
        for k in range(len(pts) - 1):
            B.append(Bone(f"{name}_{k + 1}", pts[k], pts[k + 1], prev, roll_ref=(0, 1, 0)))
            prev = f"{name}_{k + 1}"
    return B


def clips_wisp(ctx, p, shards, tendrils):
    H = ctx.spec.height
    xf = p.get("extra_fn")
    tnames = [(n, len(pts) - 1, i) for i, (n, pts) in enumerate(tendrils)]

    def tend(P, t, amp, trail=0.0, speed=1):
        w = 2 * math.pi * t
        for n, cnt, i in tnames:
            th = 2 * math.pi * i / max(len(tnames), 1)
            for k in range(cnt):
                ph = w * speed - 1.1 * k + th
                P.r(f"{n}_{k + 1}", x=amp * math.sin(ph) - trail * (0.4 + 0.3 * k), z=amp * math.cos(ph * 1.3))

    def shard_pulse(P, s):
        for name, pos, ring in shards:
            d = (Vector(pos) - Vector(ctx.spec.extra["core"])).normalized() * s
            P.move(name, x=d.x, y=d.y, z=d.z)

    def idle(t, P):
        w = 2 * math.pi * t
        P.move("hips", z=0.05 * H * math.sin(w))
        P.r("core", y=w, x=0.2 * math.sin(w))
        P.r("orbit_a", y=w)
        P.r("orbit_b", y=-w, x=0.25 * math.sin(w))
        shard_pulse(P, 0.03 * H * math.sin(w * 2))
        tend(P, t, 0.18)
        if xf: xf("idle", t, P)

    def glide(t, P, run):
        w = 2 * math.pi * t
        P.move("hips", z=0.03 * H * math.sin(w * 2))
        P.r("hips", x=-0.25 if run else -0.12)
        P.r("core", y=2 * w, x=0.3)
        P.r("orbit_a", y=w * (2 if run else 1))
        P.r("orbit_b", y=-w * (2 if run else 1), x=0.2)
        shard_pulse(P, -0.02 * H)
        tend(P, t, 0.15, 0.5 if run else 0.3, 2 if run else 1)
        if xf: xf("run" if run else "walk", t, P)

    def attack(t, P):
        a = env(t, [(0, 0), (0.35, 1), (0.45, -0.5), (0.7, -0.2), (1, 0)])
        k = env(t, [(0, 0), (0.38, 0), (0.46, 1), (0.6, 0.6), (1, 0)])
        P.move("hips", y=(-0.05 * a + 0.12 * k) * H, z=0.03 * H * a)
        P.r("core", y=4 * math.pi * t, x=0.5 * k)
        P.r("orbit_a", y=2 * math.pi * t * 2)
        P.r("orbit_b", y=-2 * math.pi * t * 2)
        shard_pulse(P, -0.10 * H * max(a, 0) + 0.18 * H * k)
        tend(P, t, 0.2, 0.3 * k, 3)
        if xf: xf("attack", t, P)

    def hit(t, P):
        k = env(t, [(0, 0), (0.15, 1), (1, 0)])
        P.move("hips", y=-0.08 * H * k, z=0.02 * H * k)
        P.r("hips", x=0.3 * k)
        shard_pulse(P, 0.08 * H * k)
        tend(P, t, 0.2, -0.3 * k, 3)
        if xf: xf("hit", t, P)

    def death(t, P):
        k = env(t, [(0.1, 0), (0.7, 1)])
        f = env(t, [(0.0, 0), (0.2, 1)])
        hz = ctx.head("hips").z
        P.move("hips", z=-(hz - 0.12 * H) * k)
        P.r("core", y=3 * math.pi * t * (1 - k))
        P.r("orbit_a", x=0.8 * k)
        P.r("orbit_b", x=-0.8 * k)
        # shards burst outward then drop to the ground
        for name, pos, ring in shards:
            d = (Vector(pos) - Vector(ctx.spec.extra["core"])).normalized()
            P.move(name, x=d.x * 0.3 * H * f, y=d.y * 0.3 * H * f, z=0.1 * H * f - Vector(pos).z * 0.6 * k)
        tend(P, t, 0.15 * (1 - k), 0, 2)
        if xf: xf("death", t, P)

    def roar(t, P):
        k = env(t, [(0, 0), (0.25, 1), (0.8, 1), (1, 0)])
        w = 2 * math.pi * t
        P.move("hips", z=0.08 * H * k)
        P.r("core", y=3 * w)
        P.r("orbit_a", y=2 * w)
        P.r("orbit_b", y=-2 * w, x=0.5 * k)
        shard_pulse(P, 0.22 * H * k)
        tend(P, t, 0.25 + 0.2 * k, 0, 3)
        if xf: xf("roar", t, P)

    return {"idle": (60, idle), "walk": (40, lambda t, P: glide(t, P, False)), "run": (30, lambda t, P: glide(t, P, True)),
            "attack": (30, attack), "hit": (15, hit), "death": (48, death), "roar": (60, roar)}
