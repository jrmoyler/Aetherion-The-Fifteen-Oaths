"""Forge: evaluates a body + outfit op-list on a voxel grid and meshes it."""
import time
import numpy as np
from . import sdf as S
from .body import BONES, BONE_ID

BIG = np.float32(1.0)


class Part:
    def __init__(self, pid, mat, bone=None, mode='soft', name=''):
        self.pid, self.mat, self.bone, self.mode, self.name = pid, mat, bone, mode, name


class Forge:
    def __init__(self, body, h=0.003, log=print):
        self.body = body
        self.h = h
        self.parts = [None]           # pid 0 unused
        self.ops = []
        self.detached = []            # [(name, h, [(pid, prim, k, op)])]
        self.log = log
        self.skin = self.part('skin', None, 'soft', 'skin')
        self.eye = self.part('eye', 'head', 'rigid', 'eye')

    # ----------------------------------------------------------------- registry
    def part(self, mat, bone=None, mode='soft', name=''):
        pid = len(self.parts)
        self.parts.append(Part(pid, mat, bone, mode, name or mat))
        return pid

    def tight(self, pid, cover, thick, noise=None, edge=0.004, margin=0.12):
        """Garment conformed to the body: cover = {bone: (t0, t1)} fractions along the bone,
        thick = float or fn(P)->t, noise = fn(P)->displacement."""
        self.ops.append(('tight', pid, cover, thick, noise, edge, margin))

    def solid(self, pid, prim, k=0.0):
        self.ops.append(('solid', pid, prim, k))

    def shell(self, pid, mask, t1, t2, k=0.004, base='cur', noise=None):
        self.ops.append(('shell', pid, mask, t1, t2, k, base, noise))

    def carve(self, prim, k=0.0):
        self.ops.append(('carve', prim, k))

    def paint(self, pid, prim, only=None):
        self.ops.append(('paint', pid, prim, only))

    def detach(self, name, items, h=None):
        """Separately meshed rigid assembly: items = [(pid, prim, k, op)] op in add/sub."""
        self.detached.append((name, h or self.h * 0.75, items))

    # ----------------------------------------------------------------- evaluation
    def _bounds(self):
        lo = np.array([1e9] * 3)
        hi = -lo
        for prim, bone, k in self.body.anatomy:
            lo = np.minimum(lo, prim.lo)
            hi = np.maximum(hi, prim.hi)
        for op in self.ops:
            if op[0] == 'solid':
                lo = np.minimum(lo, op[2].lo)
                hi = np.maximum(hi, op[2].hi)
        lo = np.maximum(lo, [-3, -3, -0.05])
        return lo - 0.07, hi + 0.07

    def label_field(self, bone):
        if bone in self._lf:
            return self._lf[bone]
        prims = [(p, k) for p, b, k in self.body.anatomy if b == bone]
        lo = np.min([p.lo for p, k in prims], axis=0)
        hi = np.max([p.hi for p, k in prims], axis=0)
        sl = self.grid.box(lo, hi, pad=0.15)
        P = self.grid.points(sl)
        d = None
        for p, k in prims:
            v = p(P)
            d = v if d is None else S.smin(d, v, k)
        self._lf[bone] = (sl, d.astype(np.float32))
        return self._lf[bone]

    def evaluate(self):
        t0 = time.time()
        lo, hi = self._bounds()
        nvox = np.prod((hi - lo) / self.h)
        if nvox > 100e6:
            self.h = self.h * (nvox / 100e6) ** (1 / 3)
        g = self.grid = S.Grid(lo, hi, self.h)
        self._lf = {}
        n = g.n
        self.log(f'grid {n.tolist()} = {np.prod(n)/1e6:.1f}M voxels')
        Db = np.full(n, BIG, dtype=np.float32)
        LAB = np.zeros(n, dtype=np.uint8)
        for prim, bone, k in self.body.anatomy:
            sl = g.box(prim.lo, prim.hi, pad=k + 2 * g.h)
            if sl is None:
                continue
            P = g.points(sl)
            d = prim(P)
            cur = Db[sl]
            LAB[sl] = np.where(d < cur, BONE_ID[bone], LAB[sl])
            Db[sl] = S.smin(cur, d, k)
        for prim, k in self.body.head_cuts:
            sl = g.box(prim.lo, prim.hi, pad=k + 2 * g.h)
            Db[sl] = S.smax(Db[sl], -prim(g.points(sl)), k)
        eyes, lids = self.body.eye_parts()
        for prim in lids:
            sl = g.box(prim.lo, prim.hi, pad=0.004)
            Db[sl] = S.smin(Db[sl], prim(g.points(sl)), 0.0015)
        self.Db, self.LAB = Db, LAB
        D = Db.copy()
        PID = np.full(n, self.skin, dtype=np.uint8)
        for prim in eyes:
            self._solid(D, PID, self.eye, prim, 0.0)
        slow = []
        for i, op in enumerate(self.ops):
            if op[0] in ('shell', 'paint', 'solid', 'carve'):
                pr = op[2] if op[0] != 'carve' else op[1]
                ext = np.clip(np.minimum(pr.hi, g.lo + g.n * g.h) - np.maximum(pr.lo, g.lo), 0, None)
                if np.prod(ext) > 0.12:
                    self.log(f'WARNING op #{i} {op[0]} box {np.round(ext, 2).tolist()} is large')
            t1 = time.time()
            getattr(self, '_' + op[0])(D, PID, *op[1:])
            dt = time.time() - t1
            if dt > 1.5:
                slow.append(f'#{i}:{op[0]}:{dt:.1f}s')
        if slow:
            self.log('slow ops: ' + ' '.join(slow))
        self.D, self.PID = D, PID
        self.log(f'fields evaluated in {time.time()-t0:.1f}s')
        verts, faces = S.mesh_grid(D, g)
        idx = np.clip(np.rint((verts - g.lo) / g.h).astype(int), 0, n - 1)
        vpid = PID[idx[:, 0], idx[:, 1], idx[:, 2]]
        # resolve vertices whose nearest voxel is deep inside (rare): keep
        meshes = [('main', verts, faces, vpid)]
        for name, h, items in self.detached:
            meshes.append((name,) + self._eval_detached(h, items))
        self.log(f'meshed in {time.time()-t0:.1f}s: ' + ', '.join(f'{m[0]}={len(m[2])}' for m in meshes))
        # free big arrays
        self._lf = {}
        return meshes

    def _eval_detached(self, h, items):
        lo = np.min([it[1].lo for it in items if it[3] == 'add'], axis=0) - 4 * h - 0.01
        hi = np.max([it[1].hi for it in items if it[3] == 'add'], axis=0) + 4 * h + 0.01
        g = S.Grid(lo, hi, h)
        D = np.full(g.n, BIG, dtype=np.float32)
        PID = np.zeros(g.n, dtype=np.uint8)
        for pid, prim, k, op in items:
            sl = g.box(prim.lo, prim.hi, pad=k + 2 * h)
            if sl is None:
                continue
            P = g.points(sl)
            d = prim(P)
            if op == 'add':
                cur = D[sl]
                PID[sl] = np.where(d < cur, pid, PID[sl])
                D[sl] = S.smin(cur, d, k)
            elif op == 'sub':
                D[sl] = S.smax(D[sl], -d, k)
            elif op == 'paint':
                PID[sl] = np.where(d < 0, pid, PID[sl])
        verts, faces = S.mesh_grid(D, g)
        idx = np.clip(np.rint((verts - g.lo) / g.h).astype(int), 0, g.n - 1)
        return verts, faces, PID[idx[:, 0], idx[:, 1], idx[:, 2]]

    # ----------------------------------------------------------------- ops
    def _merge(self, D, PID, sl, d, pid, k):
        cur = D[sl]
        PID[sl] = np.where(d < cur, pid, PID[sl])
        D[sl] = S.smin(cur, d, k)

    def _solid(self, D, PID, pid, prim, k):
        sl = self.grid.box(prim.lo, prim.hi, pad=k + 2 * self.h)
        if sl is None:
            return
        self._merge(D, PID, sl, prim(self.grid.points(sl)), pid, k)

    def _carve(self, D, PID, prim, k):
        sl = self.grid.box(prim.lo, prim.hi, pad=k + 2 * self.h)
        if sl is None:
            return
        D[sl] = S.smax(D[sl], -prim(self.grid.points(sl)), k)

    def _band_points(self, sl, mask):
        idx = np.nonzero(mask)
        g = self.grid
        P = np.stack([g.axes[0][sl[0].start + idx[0]], g.axes[1][sl[1].start + idx[1]], g.axes[2][sl[2].start + idx[2]]], axis=-1)
        return idx, P

    def _paint(self, D, PID, pid, prim, only):
        sl = self.grid.box(prim.lo, prim.hi, pad=2 * self.h)
        if sl is None:
            return
        Dsl = D[sl]
        band = np.abs(Dsl) < 2.5 * self.h
        if only is not None:
            band &= np.isin(PID[sl], only)
        idx, P = self._band_points(sl, band)
        if len(P) == 0:
            return
        m = prim(P) < 0
        sub = PID[sl]
        sub[tuple(i[m] for i in idx)] = pid

    def _shell(self, D, PID, pid, mask, t1, t2, k, base, noise):
        sl = self.grid.box(mask.lo, mask.hi, pad=k + 2 * self.h)
        if sl is None:
            return
        B = (D if base == 'cur' else self.Db)[sl]
        pad = k + 3 * self.h + 0.006
        band = (B > t1 - pad) & (B < t2 + pad)
        idx, P = self._band_points(sl, band)
        if len(P) == 0:
            return
        Bb = B[idx]
        d = np.maximum(Bb - t2, t1 - Bb)
        if noise is not None:
            d = d - noise(P)
        d = S.smax(d, mask(P), k)
        Dv = D[sl]
        Pv = PID[sl]
        cur = Dv[idx]
        Pv[idx] = np.where(d < cur, pid, Pv[idx])
        Dv[idx] = np.minimum(cur, d)

    def _tight(self, D, PID, pid, cover, thick, noise, edge, margin):
        g = self.grid
        lo = np.array([1e9] * 3)
        hi = -lo
        for bone in cover:
            for p, b, k in self.body.anatomy:
                if b == bone:
                    lo = np.minimum(lo, p.lo)
                    hi = np.maximum(hi, p.hi)
        box = g.box(lo, hi, pad=margin)
        Dbx = self.Db[box]
        band = (Dbx > -0.008) & (Dbx < margin)
        idx, P = self._band_points(box, band)
        if len(P) == 0:
            return
        # estimate the real thickness range to shrink the band
        sub = P[::97]
        tmax = float(np.max(thick(sub))) if callable(thick) else float(thick)
        if noise is not None:
            tmax += float(np.max(np.abs(noise(sub)))) * 1.3
        keep = Dbx[idx] < tmax + 0.006 + edge
        idx = tuple(i[keep] for i in idx)
        P = P[keep]
        Db_b = Dbx[idx]
        M = np.full(len(P), BIG, dtype=np.float32)
        for bone, rng in cover.items():
            prims = [(p, k) for p, b, k in self.body.anatomy if b == bone]
            plo = np.min([p.lo for p, k in prims], axis=0) - margin
            phi = np.max([p.hi for p, k in prims], axis=0) + margin
            sel = np.nonzero(np.all((P >= plo) & (P <= phi), axis=1))[0]
            if len(sel) == 0:
                continue
            Ps = P[sel]
            Dl = None
            for p, k in prims:
                v = p(Ps)
                Dl = v if Dl is None else S.smin(Dl, v, k)
            a, b = self.body.bones[bone]
            ax = b - a
            L = float(np.linalg.norm(ax))
            u = (ax / L).astype(np.float32)
            t0, t1 = rng[0], rng[1]
            proj = (Ps - a.astype(np.float32)) @ u / L
            m = (Dl - Db_b[sel]) - 0.02
            if t1 is not None:
                m = np.maximum(m, (proj - t1) * L)
            if t0 is not None:
                m = np.maximum(m, (t0 - proj) * L)
            M[sel] = S.smin(M[sel], m, 0.01)
        t = thick(P) if callable(thick) else thick
        d = Db_b - t
        if noise is not None:
            d = d - noise(P)
        d = S.smax(d, M, edge)
        Dv = D[box]
        Pv = PID[box]
        cur = Dv[idx]
        Pv[idx] = np.where(d < cur, pid, Pv[idx])
        Dv[idx] = np.minimum(cur, d)
