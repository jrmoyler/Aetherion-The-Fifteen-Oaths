"""Numpy signed-distance-field toolkit used by the character forge.

Every character is authored as a set of analytic SDF primitives (anatomy, garments,
armour, attachments).  Primitives are evaluated on a dense voxel grid (only inside each
primitive's bounding box), merged with smooth/hard boolean operators, and meshed with
marching cubes.  Coordinates: Blender world space, Z up, metres, character faces -Y.
"""
import math
import numpy as np

F = np.float32


def v3(*a):
    if len(a) == 1:
        return np.asarray(a[0], dtype=np.float64)
    return np.asarray(a, dtype=np.float64)


def normalize(v):
    v = np.asarray(v, dtype=np.float64)
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


def frame_from_axis(axis, up=(0, -1, 0)):
    """3x3 matrix whose columns are local X, Y, Z; local Z = axis."""
    z = normalize(axis)
    up = normalize(up)
    if abs(np.dot(z, up)) > 0.95:
        up = normalize((1, 0, 0)) if abs(z[0]) < 0.9 else normalize((0, 0, 1))
    x = normalize(np.cross(up, z))
    y = np.cross(z, x)
    return np.stack([x, y, z], axis=1)


def rot_euler(rx=0.0, ry=0.0, rz=0.0):
    """Rotation matrix from XYZ euler (degrees), applied as Rz*Ry*Rx (Blender XYZ)."""
    rx, ry, rz = map(math.radians, (rx, ry, rz))
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


# ----------------------------------------------------------------------------- noise
_rng = np.random.default_rng(1234)
_LAT = _rng.random((64, 64, 64)).astype(F)


def vnoise(P, freq=1.0, seed=0):
    """Smooth value noise in [-1, 1] for points P (..., 3)."""
    q = P * freq + seed * 17.31
    i = np.floor(q).astype(np.int64)
    f = (q - i).astype(F)
    f = f * f * (3 - 2 * f)
    i0 = i & 63
    i1 = (i + 1) & 63
    x0, y0, z0 = i0[..., 0], i0[..., 1], i0[..., 2]
    x1, y1, z1 = i1[..., 0], i1[..., 1], i1[..., 2]
    fx, fy, fz = f[..., 0], f[..., 1], f[..., 2]
    L = _LAT
    c00 = L[x0, y0, z0] * (1 - fx) + L[x1, y0, z0] * fx
    c10 = L[x0, y1, z0] * (1 - fx) + L[x1, y1, z0] * fx
    c01 = L[x0, y0, z1] * (1 - fx) + L[x1, y0, z1] * fx
    c11 = L[x0, y1, z1] * (1 - fx) + L[x1, y1, z1] * fx
    c0 = c00 * (1 - fy) + c10 * fy
    c1 = c01 * (1 - fy) + c11 * fy
    return (c0 * (1 - fz) + c1 * fz) * 2 - 1


def fbm(P, freq=1.0, octaves=3, seed=0):
    s = 0.0
    a = 0.5
    for o in range(octaves):
        s = s + a * vnoise(P, freq * (2 ** o), seed + o * 5)
        a *= 0.5
    return s


# ----------------------------------------------------------------------------- primitives
class Prim:
    """An SDF primitive: fn(P[...,3]) -> d, plus a world bbox."""

    def __init__(self, fn, lo, hi):
        self.fn = fn
        self.lo = np.asarray(lo, dtype=np.float64)
        self.hi = np.asarray(hi, dtype=np.float64)

    def __call__(self, P):
        return self.fn(P)

    # combinators -----------------------------------------------------------
    def displaced(self, fn, amp):
        base = self.fn
        return Prim(lambda P: base(P) - fn(P), self.lo - amp, self.hi + amp)

    def rounded(self, r):
        base = self.fn
        return Prim(lambda P: base(P) - r, self.lo - r, self.hi + r)

    def shell(self, t):
        base = self.fn
        return Prim(lambda P: np.abs(base(P)) - t, self.lo - t, self.hi + t)

    def inter(self, other, k=0.0):
        a, b = self.fn, other.fn
        lo = np.maximum(self.lo, other.lo)
        hi = np.minimum(self.hi, other.hi)
        return Prim(lambda P: smax(a(P), b(P), k), lo, hi)

    def sub(self, other, k=0.0):
        a, b = self.fn, other.fn
        return Prim(lambda P: smax(a(P), -b(P), k), self.lo, self.hi)

    def union(self, other, k=0.0):
        a, b = self.fn, other.fn
        return Prim(lambda P: smin(a(P), b(P), k), np.minimum(self.lo, other.lo), np.maximum(self.hi, other.hi))


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def union_all(prims, k=0.0):
    out = prims[0]
    for p in prims[1:]:
        out = out.union(p, k)
    return out


def _local(P, c, M):
    return (P - c.astype(F)) @ M.astype(F)


def _bbox_rot(c, half, M):
    ext = np.abs(M) @ np.asarray(half)
    return c - ext, c + ext


def sphere(c, r):
    c = v3(c)
    cf = c.astype(F)
    return Prim(lambda P: np.linalg.norm(P - cf, axis=-1) - r, c - r, c + r)


def ellipsoid(c, radii, M=None):
    c = v3(c)
    r = v3(radii)
    M = np.eye(3) if M is None else np.asarray(M)
    rf = r.astype(F)

    def fn(P):
        q = _local(P, c, M)
        k0 = np.linalg.norm(q / rf, axis=-1)
        k1 = np.linalg.norm(q / (rf * rf), axis=-1)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)
    lo, hi = _bbox_rot(c, r, M)
    return Prim(fn, lo, hi)


def roundcone(a, b, ra, rb):
    """Capsule with radius ra at a and rb at b (exact, iq)."""
    a = v3(a)
    b = v3(b)
    ba = b - a
    l2 = float(np.dot(ba, ba))
    rr = ra - rb
    a2 = l2 - rr * rr
    il2 = 1.0 / max(l2, 1e-12)
    af, baf = a.astype(F), ba.astype(F)

    def fn(P):
        pa = P - af
        y = pa @ baf
        x2v = pa * l2 - y[..., None] * baf
        x2 = np.einsum('...i,...i->...', x2v, x2v)
        y2 = y * y * l2
        z = y - l2
        z2 = z * z * l2
        k = math.copysign(1.0, rr) * rr * rr * x2
        m1 = np.sign(z) * a2 * z2 > k
        m2 = np.sign(y) * a2 * y2 < k
        res = (np.sqrt(np.maximum(x2 * a2 * il2, 0.0)) + y * rr) * il2 - ra
        res = np.where(m2, np.sqrt(np.maximum(x2 + y2, 0.0)) * il2 - ra, res)
        res = np.where(m1, np.sqrt(np.maximum(x2 + z2, 0.0)) * il2 - rb, res)
        return res.astype(F)
    r = max(ra, rb)
    return Prim(fn, np.minimum(a, b) - r, np.maximum(a, b) + r)


def capsule(a, b, r):
    return roundcone(a, b, r, r)


def roundbox(c, half, M=None, r=0.0):
    c = v3(c)
    h = v3(half)
    M = np.eye(3) if M is None else np.asarray(M)
    hf = (h - r).astype(F)

    def fn(P):
        q = np.abs(_local(P, c, M)) - hf
        outside = np.linalg.norm(np.maximum(q, 0), axis=-1)
        inside = np.minimum(np.max(q, axis=-1), 0)
        return outside + inside - r
    lo, hi = _bbox_rot(c, h, M)
    return Prim(fn, lo, hi)


def torus(c, R, r, M=None):
    """Torus in local XY plane (axis = local Z)."""
    c = v3(c)
    M = np.eye(3) if M is None else np.asarray(M)

    def fn(P):
        q = _local(P, c, M)
        qx = np.sqrt(q[..., 0] ** 2 + q[..., 1] ** 2) - R
        return np.sqrt(qx * qx + q[..., 2] ** 2) - r
    lo, hi = _bbox_rot(c, (R + r, R + r, r), M)
    return Prim(fn, lo, hi)


def cylinder(a, b, r, rnd=0.0):
    a = v3(a)
    b = v3(b)
    axis = b - a
    L = np.linalg.norm(axis)
    M = frame_from_axis(axis)
    c = (a + b) / 2

    def fn(P):
        q = _local(P, c, M)
        dx = np.sqrt(q[..., 0] ** 2 + q[..., 1] ** 2) - (r - rnd)
        dz = np.abs(q[..., 2]) - (L / 2 - rnd)
        out = np.sqrt(np.maximum(dx, 0) ** 2 + np.maximum(dz, 0) ** 2)
        return out + np.minimum(np.maximum(dx, dz), 0) - rnd
    lo, hi = _bbox_rot(c, (r, r, L / 2), M)
    return Prim(fn, lo, hi)


def halfspace(p, n, lo=(-5, -5, -5), hi=(5, 5, 5)):
    """Signed distance to the plane through p with outward normal n (positive = outside)."""
    p = v3(p).astype(F)
    n = normalize(n).astype(F)
    return Prim(lambda P: (P - p) @ n, lo, hi)


def slab(p, n, w):
    p = v3(p).astype(F)
    n = normalize(n).astype(F)
    return Prim(lambda P: np.abs((P - p) @ n) - w / 2, (-5, -5, -5), (5, 5, 5))


def chain(points, radii, k=0.0):
    prims = [roundcone(points[i], points[i + 1], radii[i], radii[i + 1]) for i in range(len(points) - 1)]
    return union_all(prims, k)


def bezier(p0, p1, p2, n=6):
    p0, p1, p2 = v3(p0), v3(p1), v3(p2)
    return [(1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2 for t in np.linspace(0, 1, n)]


def tube_shell(a, b, ra, rb, th, angle=None, up=(0, -1, 0)):
    """Open/closed cylindrical shell along a->b (bracers, greaves, collars).
    angle: (centre_deg, half_span_deg) about the axis measured from local X; None = full."""
    a = v3(a)
    b = v3(b)
    axis = b - a
    L = float(np.linalg.norm(axis))
    M = frame_from_axis(axis, up)
    af = a.astype(F)
    Mf = M.astype(F)

    def fn(P):
        q = (P - af) @ Mf
        t = np.clip(q[..., 2] / L, 0, 1)
        rad = ra + (rb - ra) * t
        rr = np.sqrt(q[..., 0] ** 2 + q[..., 1] ** 2)
        d = np.abs(rr - rad) - th / 2
        d = np.maximum(d, np.maximum(-q[..., 2], q[..., 2] - L))
        if angle is not None:
            cdeg, hs = angle
            ang = np.degrees(np.arctan2(q[..., 1], q[..., 0])) - cdeg
            ang = (ang + 180) % 360 - 180
            da = (np.abs(ang) - hs) * np.pi / 180 * rr
            d = np.maximum(d, da)
        return d
    r = max(ra, rb) + th
    lo = np.minimum(a, b) - r
    hi = np.maximum(a, b) + r
    return Prim(fn, lo, hi)


def ring_band(c, axis, R, width, th):
    """Flat ring (washer) around axis — collar rings, belts in space."""
    M = frame_from_axis(axis)
    c = v3(c)

    def fn(P):
        q = _local(P, c, M)
        rr = np.sqrt(q[..., 0] ** 2 + q[..., 1] ** 2)
        d1 = np.abs(rr - R) - th / 2
        d2 = np.abs(q[..., 2]) - width / 2
        return np.sqrt(np.maximum(d1, 0) ** 2 + np.maximum(d2, 0) ** 2) + np.minimum(np.maximum(d1, d2), 0)
    lo, hi = _bbox_rot(c, (R + th, R + th, width), M)
    return Prim(fn, lo, hi)


def skirt(c_top, z_top, z_bot, rx_top, ry_top, rx_bot, ry_bot, pleats=0, pleat_amp=0.0, front_open=0.0, yoff_bot=0.0):
    """Solid elliptical frustum (robe skirt) from z_top down to z_bot with optional pleats."""
    cx, cy = float(c_top[0]), float(c_top[1])

    def fn(P):
        z = P[..., 2]
        t = np.clip((z_top - z) / (z_top - z_bot), 0, 1)
        rx = rx_top + (rx_bot - rx_top) * t
        ry = ry_top + (ry_bot - ry_top) * t
        x = P[..., 0] - cx
        y = P[..., 1] - (cy + yoff_bot * t)
        rr = np.sqrt((x / rx) ** 2 + (y / ry) ** 2)
        d = (rr - 1.0) * np.minimum(rx, ry)
        if pleats:
            ang = np.arctan2(y, x)
            d = d - pleat_amp * t ** 1.3 * (np.abs(np.sin(ang * pleats * 0.5)) * 2 - 1)
        d = np.maximum(d, np.maximum(z - z_top, z_bot - z))
        if front_open > 0:
            # vertical slit at the front (−Y), widening downwards
            slit = np.abs(x) - front_open * t ** 1.5
            d = np.where((y < 0) & (t > 0.05), np.maximum(d, -slit), d)
        return d
    r = max(rx_top, rx_bot, ry_top, ry_bot) + pleat_amp
    return Prim(fn, (cx - r, cy - r - abs(yoff_bot), z_bot), (cx + r, cy + r + abs(yoff_bot), z_top))


# ----------------------------------------------------------------------------- grid evaluation
class Grid:
    def __init__(self, lo, hi, h):
        self.h = float(h)
        self.lo = np.floor(np.asarray(lo) / h) * h
        self.n = np.ceil((np.asarray(hi) - self.lo) / h).astype(int) + 1
        self.axes = [(self.lo[i] + np.arange(self.n[i]) * h).astype(F) for i in range(3)]

    def box(self, lo, hi, pad=0.0):
        i0 = np.clip(np.floor((np.asarray(lo) - pad - self.lo) / self.h).astype(int), 0, self.n - 1)
        i1 = np.clip(np.ceil((np.asarray(hi) + pad - self.lo) / self.h).astype(int) + 1, 0, self.n)
        if np.any(i1 <= i0):
            return None
        return tuple(slice(i0[k], i1[k]) for k in range(3))

    def points(self, sl):
        X, Y, Z = np.meshgrid(self.axes[0][sl[0]], self.axes[1][sl[1]], self.axes[2][sl[2]], indexing='ij')
        return np.stack([X, Y, Z], axis=-1)


def mesh_grid(D, grid, level=0.0):
    from skimage.measure import marching_cubes
    verts, faces, normals, _ = marching_cubes(D, level=level, spacing=(grid.h,) * 3, allow_degenerate=False)
    verts = verts + grid.lo
    return verts.astype(np.float64), faces.astype(np.int64)
