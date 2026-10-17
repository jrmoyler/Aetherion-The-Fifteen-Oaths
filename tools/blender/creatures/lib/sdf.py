"""Signed-distance "digital clay" for organic creature bodies.

Bodies are authored as a list of primitives (round cones = tapered limbs/muscle masses,
ellipsoids = skull/ribcage/haunch masses) combined with a polynomial smooth-min so that
junctions read like sculpted anatomy instead of welded tubes.  The field is evaluated on a
regular grid (each primitive only inside its own bounding box) and polygonised with
marching cubes (scikit-image).  Result is the HIGH mesh used as bake source; the game mesh
is a decimated copy.

Coordinates: Blender Z-up, creature authored facing +Y (forge rotates to glTF +Z on export).
"""
import math
import numpy as np

try:
    from skimage.measure import marching_cubes
except Exception as e:  # pragma: no cover
    raise SystemExit("creature forge needs scikit-image in the Blender venv: "
                     "/opt/blender-venv/bin/pip install scikit-image") from e


def _v(a):
    return np.asarray(a, dtype=np.float64)


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(k - np.abs(a - b), 0.0, None) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


class Prim:
    """op: 'add' (smooth union), 'sub' (smooth subtract), 'int' (smooth intersect)."""

    def __init__(self, kind, params, k=0.04, op="add", bbox=None):
        self.kind, self.p, self.k, self.op = kind, params, k, op
        self.bbox = bbox

    def dist(self, P):
        return DIST[self.kind](P, **self.p)


# ---------------------------------------------------------------- distance functions
def d_sphere(P, c, r):
    return np.linalg.norm(P - c, axis=-1) - r


def _local(P, c, R):
    q = P - c
    return q @ R if R is not None else q  # R columns = local axes in world


def d_ellipsoid(P, c, r, R=None):
    q = _local(P, c, R)
    r = _v(r)
    k0 = np.linalg.norm(q / r, axis=-1)
    k1 = np.linalg.norm(q / (r * r), axis=-1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


def d_roundcone(P, a, b, ra, rb):
    """Inigo Quilez exact round cone between points a,b with radii ra, rb."""
    ba = b - a
    l2 = float(ba @ ba)
    rr = ra - rb
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = P - a
    y = pa @ ba
    z = y - l2
    xv = pa * l2 - np.outer(y, ba)
    x2 = np.einsum("ij,ij->i", xv, xv)
    y2 = y * y * l2
    z2 = z * z * l2
    k = math.copysign(1.0, rr) * rr * rr * x2
    out = np.empty(len(P))
    m1 = np.sign(z) * a2 * z2 > k
    m2 = (~m1) & (np.sign(y) * a2 * y2 < k)
    m3 = ~(m1 | m2)
    out[m1] = np.sqrt(x2[m1] + z2[m1]) * il2 - rb
    out[m2] = np.sqrt(x2[m2] + y2[m2]) * il2 - ra
    out[m3] = (np.sqrt(x2[m3] * a2 * il2) + y[m3] * rr) * il2 - ra
    return out


def d_flatcone(P, a, b, ra, rb, flat=0.6, up=(0, 0, 1)):
    """Round cone squashed along `up` (cross-section ellipse ratio `flat`)."""
    up = _v(up) / np.linalg.norm(up)
    q = P.copy()
    c = (a + b) * 0.5
    proj = (q - c) @ up
    q = q + np.outer(proj * (1.0 / flat - 1.0), up)
    return d_roundcone(q, a, b, ra, rb) * flat


def d_box(P, c, h, r=0.0, R=None):
    q = np.abs(_local(P, c, R)) - (_v(h) - r)
    return np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(axis=-1), 0) - r


def d_torus(P, c, R0, r, Rm=None):
    q = _local(P, c, Rm)
    qx = np.sqrt(q[:, 0] ** 2 + q[:, 1] ** 2) - R0
    return np.sqrt(qx * qx + q[:, 2] ** 2) - r


DIST = dict(sphere=d_sphere, ellipsoid=d_ellipsoid, roundcone=d_roundcone, flatcone=d_flatcone,
            box=d_box, torus=d_torus)


def _bbox_of(pr):
    p, k = pr.p, pr.k
    m = k + 0.02
    if pr.kind == "sphere":
        c, r = _v(p["c"]), p["r"]
        return c - r - m, c + r + m
    if pr.kind == "ellipsoid":
        c, r = _v(p["c"]), max(p["r"])
        return c - r - m, c + r + m
    if pr.kind in ("roundcone", "flatcone"):
        a, b = _v(p["a"]), _v(p["b"])
        r = max(p["ra"], p["rb"]) / (p.get("flat", 1.0) if pr.kind == "flatcone" else 1.0)
        return np.minimum(a, b) - r - m, np.maximum(a, b) + r + m
    if pr.kind == "box":
        c, h = _v(p["c"]), np.linalg.norm(p["h"])
        return c - h - m, c + h + m
    if pr.kind == "torus":
        c = _v(p["c"]); e = p["R0"] + p["r"]
        return c - e - m, c + e + m
    raise ValueError(pr.kind)


class Clay:
    """Accumulates primitives; helpers mirror left/right automatically."""

    def __init__(self):
        self.prims = []
        self.warps = []  # list of (amp, freq, seed) low-frequency surface lumps

    def add(self, kind, k=0.04, op="add", mirror=False, **p):
        p = {kk: (_v(vv) if isinstance(vv, (tuple, list)) and kk not in ("r", "h") else vv) for kk, vv in p.items()}
        if "r" in p and isinstance(p["r"], (tuple, list)):
            p["r"] = _v(p["r"])
        if "h" in p and isinstance(p["h"], (tuple, list)):
            p["h"] = _v(p["h"])
        self.prims.append(Prim(kind, p, k, op))
        if mirror:
            q = {}
            for kk, vv in p.items():
                if isinstance(vv, np.ndarray) and vv.shape == (3,) and kk in ("a", "b", "c"):
                    vv = vv * _v((-1, 1, 1))
                elif kk in ("R", "Rm") and vv is not None:
                    M = np.diag([-1.0, 1, 1])
                    vv = M @ vv @ M
                q[kk] = vv
            self.prims.append(Prim(kind, q, k, op))
        return self

    def cone(self, a, b, ra, rb, k=0.04, **kw):
        return self.add("roundcone", k=k, a=a, b=b, ra=ra, rb=rb, **kw)

    def chain(self, pts, radii, k=0.04, **kw):
        for i in range(len(pts) - 1):
            self.cone(pts[i], pts[i + 1], radii[i], radii[i + 1], k=k, **kw)
        return self

    def ell(self, c, r, R=None, k=0.04, **kw):
        return self.add("ellipsoid", k=k, c=c, r=r, R=R, **kw)

    def lumps(self, amp, freq, seed=0, n=10):
        self.warps.append((amp, freq, seed, n))
        return self

    # ------------------------------------------------------------ evaluation
    def bounds(self):
        lo = np.full(3, 1e9); hi = np.full(3, -1e9)
        for pr in self.prims:
            if pr.op != "add":
                continue
            a, b = _bbox_of(pr)
            lo = np.minimum(lo, a); hi = np.maximum(hi, b)
        return lo - 0.03, hi + 0.03

    def evaluate(self, voxel):
        lo, hi = self.bounds()
        n = np.ceil((hi - lo) / voxel).astype(int) + 1
        xs = [lo[i] + np.arange(n[i]) * voxel for i in range(3)]
        F = np.full(tuple(n), 0.25, dtype=np.float64)
        for pr in self.prims:
            a, b = _bbox_of(pr)
            i0 = np.clip(np.floor((a - lo) / voxel).astype(int), 0, n - 1)
            i1 = np.clip(np.ceil((b - lo) / voxel).astype(int) + 1, 0, n)
            sl = tuple(slice(i0[i], i1[i]) for i in range(3))
            gx, gy, gz = np.meshgrid(xs[0][sl[0]], xs[1][sl[1]], xs[2][sl[2]], indexing="ij")
            P = np.stack([gx.ravel(), gy.ravel(), gz.ravel()], axis=-1)
            d = pr.dist(P).reshape(gx.shape)
            if pr.op == "add":
                F[sl] = smin(F[sl], d, pr.k)
            elif pr.op == "sub":
                F[sl] = smax(F[sl], -d, pr.k)
            elif pr.op == "int":
                F[sl] = smax(F[sl], d, pr.k)
        if self.warps:
            gx, gy, gz = np.meshgrid(*xs, indexing="ij")
            band = np.abs(F) < 0.05
            P = np.stack([gx[band], gy[band], gz[band]], axis=-1)
            disp = np.zeros(len(P))
            for amp, freq, seed, cnt in self.warps:
                rng = np.random.default_rng(seed)
                for _ in range(cnt):
                    w = rng.normal(size=3); w = w / np.linalg.norm(w) * freq * rng.uniform(0.7, 1.4)
                    disp += amp / cnt * 2.0 * np.sin(P @ w + rng.uniform(0, 6.283))
            F[band] += disp
        return F, lo

    def polygonize(self, voxel):
        F, lo = self.evaluate(voxel)
        verts, faces, _n, _v2 = marching_cubes(F, level=0.0, spacing=(voxel,) * 3)
        verts = verts + lo
        # skimage winding gives inward normals for "negative inside" fields -> flip
        faces = faces[:, ::-1]
        return verts.astype(np.float32), faces.astype(np.int32)


def rot_to(axis_dir, up=(0, 0, 1)):
    """3x3 matrix whose columns are a local frame with Y along axis_dir."""
    y = _v(axis_dir); y = y / np.linalg.norm(y)
    u = _v(up)
    x = np.cross(y, u)
    if np.linalg.norm(x) < 1e-6:
        x = np.cross(y, _v((1, 0, 0)))
    x /= np.linalg.norm(x)
    z = np.cross(x, y)
    return np.stack([x, y, z], axis=1)
