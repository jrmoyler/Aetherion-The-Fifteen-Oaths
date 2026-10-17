"""Blender helpers: scene reset, mesh construction, hard-surface primitives, joins, UVs."""
import math
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix, Euler


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 30
    sc.unit_settings.system = "METRIC"
    return sc


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def activate(ob, select_only=True):
    if select_only:
        for o in bpy.context.scene.objects:
            if o is not None:
                o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def mesh_from_arrays(name, verts, faces, smooth=True):
    me = bpy.data.meshes.new(name)
    verts = np.asarray(verts, dtype=np.float32)
    faces = np.asarray(faces, dtype=np.int32)
    me.vertices.add(len(verts))
    me.vertices.foreach_set("co", verts.ravel())
    nf = len(faces)
    me.loops.add(nf * 3)
    me.loops.foreach_set("vertex_index", faces.ravel())
    me.polygons.add(nf)
    me.polygons.foreach_set("loop_start", np.arange(0, nf * 3, 3, dtype=np.int32))
    me.update(calc_edges=True)
    me.validate()
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    return link(ob)


def apply_modifiers(ob):
    activate(ob)
    for m in list(ob.modifiers):
        with bpy.context.temp_override(object=ob, active_object=ob):
            bpy.ops.object.modifier_apply(modifier=m.name)


def decimate_to(ob, target_tris):
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris <= target_tris:
        return ob
    m = ob.modifiers.new("dec", "DECIMATE")
    m.decimate_type = "COLLAPSE"
    m.ratio = target_tris / tris
    m.use_collapse_triangulate = True
    apply_modifiers(ob)
    return ob


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def apply_transform(ob):
    activate(ob)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def join(objs, name=None):
    objs = [o for o in objs if o is not None]
    activate(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    if name:
        objs[0].name = name
        objs[0].data.name = name
    return objs[0]


def duplicate(ob, name):
    d = ob.copy()
    d.data = ob.data.copy()
    d.name = name
    for m in list(d.modifiers):
        if m.type == "ARMATURE":
            d.modifiers.remove(m)
    return link(d)


def smart_uv(ob, angle=60.0, margin=0.004):
    activate(ob)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def shade(ob, smooth=True, auto_angle=None):
    for p in ob.data.polygons:
        p.use_smooth = smooth
    if auto_angle is not None:
        activate(ob)
        try:
            with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob],
                                           selected_editable_objects=[ob]):
                bpy.ops.object.shade_auto_smooth(angle=math.radians(auto_angle))
            apply_modifiers(ob)
        except Exception:
            pass


# ----------------------------------------------------------------------------- hard surface
def _finish(bm, name, bevel=0.0, segs=2, smooth_angle=None, sub=0):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    if bevel > 0:
        m = ob.modifiers.new("bev", "BEVEL")
        m.width = bevel
        m.segments = segs
        m.limit_method = "ANGLE"
        m.angle_limit = math.radians(35)
        m.harden_normals = False
    if sub:
        m = ob.modifiers.new("sub", "SUBSURF")
        m.levels = sub
        m.render_levels = sub
    if bevel > 0 or sub:
        apply_modifiers(ob)
    if smooth_angle is not None:
        shade(ob, True, smooth_angle)
    else:
        shade(ob, True)
    return ob


def place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    ob.location = Vector(loc)
    ob.rotation_euler = Euler(rot)
    ob.scale = Vector(scale) if hasattr(scale, "__len__") else Vector((scale,) * 3)
    apply_transform(ob)
    return ob


def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, segs=2, taper=None):
    """Bevelled box; `taper` = (sx, sy) scale of the +Z face (wedges, plates)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        if taper and v.co.z > 0:
            v.co.x *= taper[0]
            v.co.y *= taper[1]
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    ob = _finish(bm, name, bevel, segs, smooth_angle=40)
    return place(ob, loc, rot)


def cylinder(name, r, depth, loc=(0, 0, 0), rot=(0, 0, 0), segs=12, r2=None, bevel=0.0, cap=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r,
                          radius2=r if r2 is None else r2, depth=depth)
    ob = _finish(bm, name, bevel, 2, smooth_angle=40)
    return place(ob, loc, rot)


def ico(name, r, loc=(0, 0, 0), sub=2, scale=(1, 1, 1), rot=(0, 0, 0), jitter=0.0, seed=0, flat=False):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    if jitter:
        rng = np.random.default_rng(int(seed) & 0xFFFF)
        for v in bm.verts:
            v.co *= 1.0 + rng.uniform(-jitter, jitter)
    ob = _finish(bm, name, 0, smooth_angle=(25 if flat else None))
    if flat:
        shade(ob, False)
    return place(ob, loc, rot, scale)


def rock(name, r, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), seed=0, chips=6, sub=2):
    """Faceted chunk: icosphere + planar chips (boolean-free: vertices projected onto random planes)."""
    rng = np.random.default_rng(int(seed) & 0xFFFF)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    planes = []
    for _ in range(chips):
        n = Vector(rng.normal(size=3)).normalized()
        d = r * rng.uniform(0.62, 0.86)
        planes.append((n, d))
    for v in bm.verts:
        for n, d in planes:
            h = v.co.dot(n)
            if h > d:
                v.co -= n * (h - d)
        v.co *= 1.0 + rng.uniform(-0.03, 0.03)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    m = ob.modifiers.new("bev", "BEVEL"); m.width = r * 0.06; m.segments = 1
    m.limit_method = "ANGLE"; m.angle_limit = math.radians(30)
    apply_modifiers(ob)
    shade(ob, True, 32)
    return place(ob, loc, rot, scale)


def horn(name, pts, radii, segs=8, slot_tip=None, flat=1.0, twist=0.0, flat_side=False, cap_flat=False):
    """Lofted tapered tube along points (claws, tusks, antler tines, spines, fingers)."""
    pts = [Vector(p) for p in pts]
    bm = bmesh.new()
    rings = []
    n = len(pts)
    prev_side = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
        side = t.cross(ref).normalized() if prev_side is None else (prev_side - t * prev_side.dot(t)).normalized()
        prev_side = side
        up = side.cross(t).normalized()
        ring = []
        r = radii[i]
        for k in range(segs):
            a = 2 * math.pi * k / segs + twist * i
            off = (side * math.cos(a) * r * flat + up * math.sin(a) * r) if flat_side else (side * math.cos(a) * r + up * math.sin(a) * r * flat)
            ring.append(bm.verts.new(p + off))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(segs):
            a, b = rings[i][k], rings[i][(k + 1) % segs]
            c, d = rings[i + 1][(k + 1) % segs], rings[i + 1][k]
            bm.faces.new((a, b, c, d))
    if radii[-1] <= 1e-4:
        pass
    elif cap_flat:
        bm.faces.new(rings[-1])
    else:
        tip = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * radii[-1] * 0.8)
        for k in range(segs):
            bm.faces.new((rings[-1][k], rings[-1][(k + 1) % segs], tip))
    bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    shade(ob, True)
    return ob


def bezier_pts(p0, p1, p2, p3=None, n=8):
    p0, p1, p2 = Vector(p0), Vector(p1), Vector(p2)
    out = []
    for i in range(n):
        t = i / (n - 1)
        if p3 is None:
            out.append(p0 * (1 - t) ** 2 + p1 * 2 * (1 - t) * t + p2 * t * t)
        else:
            q = Vector(p3)
            out.append(p0 * (1 - t) ** 3 + p1 * 3 * (1 - t) ** 2 * t + p2 * 3 * (1 - t) * t * t + q * t ** 3)
    return out


def sheet(name, outline_pts, thickness=0.01, sub=0):
    """Flat polygon (membranes, cloth tatters, plates) extruded slightly. outline in world coords."""
    bm = bmesh.new()
    vs = [bm.verts.new(Vector(p)) for p in outline_pts]
    f = bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=[f])
    if thickness > 0:
        res = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
        nrm = Vector((0, 0, 0))
        for fc in bm.faces:
            nrm += fc.normal
        nrm = nrm.normalized() if nrm.length > 0 else Vector((0, 0, 1))
        for v in [e for e in res["geom"] if isinstance(e, bmesh.types.BMVert)]:
            v.co += nrm * thickness
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    shade(ob, True, 50)
    return ob


def grid_strip(name, rows, thickness=0.006):
    """Cloth/membrane surface from a grid of points rows[i][j] (list of lists of xyz)."""
    bm = bmesh.new()
    R = [[bm.verts.new(Vector(p)) for p in row] for row in rows]
    for i in range(len(R) - 1):
        for j in range(len(R[i]) - 1):
            bm.faces.new((R[i][j], R[i][j + 1], R[i + 1][j + 1], R[i + 1][j]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    if thickness:
        m = ob.modifiers.new("sol", "SOLIDIFY"); m.thickness = thickness; m.offset = 0
        apply_modifiers(ob)
    shade(ob, True)
    return ob


def mirror_copy(ob, name=None):
    d = ob.copy(); d.data = ob.data.copy(); d.name = name or ob.name + "_R"
    link(d)
    bm = bmesh.new(); bm.from_mesh(d.data)
    for v in bm.verts:
        v.co.x = -v.co.x
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(d.data); bm.free()
    d.data.update()
    return d


def stats_bbox(objs):
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi


def _select_faces(ob, idx_set):
    me = ob.data
    sel = np.zeros(len(me.polygons), dtype=bool)
    sel[list(idx_set)] = True
    me.polygons.foreach_set("select", sel)
    vs = np.zeros(len(me.vertices), dtype=bool)
    for p in me.polygons:
        if sel[p.index]:
            for v in p.vertices:
                vs[v] = True
    me.vertices.foreach_set("select", vs)
    es = np.array([vs[e.vertices[0]] and vs[e.vertices[1]] for e in me.edges], dtype=bool)
    me.edges.foreach_set("select", es)


def bone_seam_unwrap(ob, arm, n_organic, cut_dirs=None, margin=0.003, part_scale=0.45):
    """Organic faces [0, n_organic): charts per dominant skin bone, each tube cut open on a
    hidden side (medial for limbs, ventral for trunk) then ABF-unwrapped. Remaining (hard part)
    faces get smart-projected. Everything is packed into one atlas."""
    me = ob.data
    gi2bone = {g.index: g.name for g in ob.vertex_groups}
    dom = np.full(len(me.vertices), -1)
    for v in me.vertices:
        if v.groups:
            g = max(v.groups, key=lambda g: g.weight)
            dom[v.index] = g.group
    bones = arm.data.bones
    bm = bmesh.new(); bm.from_mesh(me)
    bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table()
    fb = {}
    for f in bm.faces:
        if f.index >= n_organic:
            continue
        ds = [dom[v.index] for v in f.verts]
        fb[f.index] = max(set(ds), key=ds.count)
    for e in bm.edges:
        e.seam = False
        lf = [f for f in e.link_faces if f.index < n_organic]
        if len(lf) == 2 and fb[lf[0].index] != fb[lf[1].index]:
            e.seam = True
    # cylindrical cut per chart
    for gi, bname in gi2bone.items():
        b = bones.get(bname)
        if b is None:
            continue
        h, t = b.head_local, b.tail_local
        ax = (t - h).normalized()
        c = (h + t) * 0.5
        if cut_dirs and bname in cut_dirs:
            cd = Vector(cut_dirs[bname])
        elif abs(c.x) > 0.02 and abs(ax.z) > 0.5:
            cd = Vector((-1.0 if c.x > 0 else 1.0, 0, 0))  # limbs: medial side
        else:
            cd = Vector((0, 0, -1))  # trunk/neck/tail/head: ventral
        e1 = (cd - ax * cd.dot(ax))
        if e1.length < 1e-4:
            e1 = Vector((0, 1, 0)) - ax * ax.y
        e1.normalize()
        e2 = ax.cross(e1)
        def theta(p):
            q = p - c
            return math.atan2(q.dot(e2), q.dot(e1))  # 0 at cut side
        for f in bm.faces:
            if f.index >= n_organic or fb[f.index] != gi:
                continue
            for e in f.edges:
                a, bb = e.verts
                ta, tb = theta(a.co), theta(bb.co)
                # seam where the edge crosses theta = 0 (the cut half-plane), near the cut side only
                if (ta >= 0) != (tb >= 0) and abs(ta) < 1.5 and abs(tb) < 1.5:
                    e.seam = True
    bm.to_mesh(me); bm.free()
    activate(ob)
    _select_faces(ob, range(n_organic))
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=margin, fill_holes=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    if n_organic < len(me.polygons):
        _select_faces(ob, range(n_organic, len(me.polygons)))
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0,
                                 correct_aspect=True, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    _select_faces(ob, range(len(me.polygons)))
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")
    # hard parts get a fraction of the organic texel density (they are small / mostly solid colour)
    if n_organic < len(me.polygons):
        uv = me.uv_layers.active.data
        idx = [li for p in me.polygons[n_organic:] for li in p.loop_indices]
        co = np.array([uv[i].uv for i in idx])
        ctr = co.mean(axis=0)
        co = ctr + (co - ctr) * part_scale
        for i, c in zip(idx, co):
            uv[i].uv = c
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(margin=margin, rotate=True, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")


def add_detail(ob, levels=2, strength=0.01, size=0.1, seed=0, kind="VORONOI"):
    """Subdivide + procedural displacement (bake-source detail for rock/bark/ice parts)."""
    m = ob.modifiers.new("sub", "SUBSURF"); m.levels = levels; m.subdivision_type = "SIMPLE"
    tex = bpy.data.textures.new(f"dtex{seed}", "VORONOI" if kind in ("VORONOI", "HARD") else "CLOUDS")
    tex.noise_scale = size
    if tex.type == "VORONOI":
        tex.distance_metric = "DISTANCE"
        tex.color_mode = "INTENSITY"
    d = ob.modifiers.new("disp", "DISPLACE"); d.texture = tex; d.strength = strength; d.mid_level = 0.5
    d.texture_coords = "OBJECT" if False else "LOCAL"
    apply_modifiers(ob)
    shade(ob, True)
    return ob


def slab(name, size, loc=(0, 0, 0), rot=(0, 0, 0), seed=0, chips=12, depth=(0.15, 0.48), cuts=2, bevel=0.03):
    """Angular hewn stone block: subdivided box with random planar corner/edge chips — reads as
    split rock or masonry rather than a pebble."""
    rng = np.random.default_rng(int(seed) & 0xFFFF)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    for _ in range(chips):
        # plane through a point near a random corner/edge, normal pointing outward-ish
        n = Vector((rng.choice([-1, 1]) * rng.uniform(0.3, 1), rng.choice([-1, 1]) * rng.uniform(0.3, 1),
                    rng.choice([-1, 1]) * rng.uniform(0.3, 1))).normalized()
        ext = abs(n.x) * sx + abs(n.y) * sy + abs(n.z) * sz
        d = ext * (1 - rng.uniform(*depth))
        for v in bm.verts:
            h = v.co.dot(n)
            if h > d:
                v.co -= n * (h - d)
    for v in bm.verts:
        v.co += Vector(rng.normal(size=3)) * min(size) * 0.012
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=min(size) * 0.01)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    if bevel:
        m = ob.modifiers.new("bev", "BEVEL"); m.width = min(size) * bevel; m.segments = 1
        m.limit_method = "ANGLE"; m.angle_limit = math.radians(25)
        apply_modifiers(ob)
    m = ob.modifiers.new("dec", "DECIMATE"); m.decimate_type = "DISSOLVE"; m.angle_limit = math.radians(2)
    apply_modifiers(ob)
    tri = ob.modifiers.new("tri", "TRIANGULATE")
    apply_modifiers(ob)
    shade(ob, True, 30)
    return place(ob, loc, rot)


def torus(name, R, r, loc=(0, 0, 0), rot=(0, 0, 0), major=24, minor=6):
    bm = bmesh.new()
    rings = []
    for i in range(major):
        a = 2 * math.pi * i / major
        c = Vector((math.cos(a) * R, math.sin(a) * R, 0))
        out = Vector((math.cos(a), math.sin(a), 0))
        rings.append([bm.verts.new(c + out * math.cos(2 * math.pi * j / minor) * r + Vector((0, 0, math.sin(2 * math.pi * j / minor) * r)))
                      for j in range(minor)])
    for i in range(major):
        for j in range(minor):
            a, b = rings[i][j], rings[(i + 1) % major][j]
            c_, d = rings[(i + 1) % major][(j + 1) % minor], rings[i][(j + 1) % minor]
            bm.faces.new((a, b, c_, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    shade(ob, True)
    return place(ob, loc, rot)
