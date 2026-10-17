"""Aetherion character forge — builds, rigs, animates, bakes and exports the 30 Oath heroes.

Usage (headless Blender-as-a-module):
  /opt/blender-venv/bin/python tools/blender/characters/forge.py oath-01-ninja [oath-01-sorcerer ...]
  /opt/blender-venv/bin/python tools/blender/characters/forge.py all
Options: --no-review  --tex 1024  --keep (keep scratch .blend)
"""
import gc
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(ROOT, 'game', 'public', 'assets', 'characters')
REVIEW = os.path.join(HERE, 'review')
LOGS = os.path.join(HERE, 'logs')
SCRATCH = os.environ.get('CHARFORGE_SCRATCH', '/tmp/claude-0/-home-user-Aetherion-The-Fifteen-Oaths/2e59b8d6-737b-56a6-8eef-7a57b51a2054/scratchpad/charforge')

import bpy
import bmesh
import numpy as np

from cf.body import Body, BONES
from cf.assemble import Forge
from cf import shade, rig, anim, review
from cf.face import detail_colors
from cf.heroes import HEROES


class Log:
    def __init__(self, path):
        self.f = open(path, 'w')
        self.t0 = time.time()

    def __call__(self, *a):
        msg = f'[{time.time()-self.t0:7.1f}s] ' + ' '.join(str(x) for x in a)
        print(msg, flush=True)
        self.f.write(msg + '\n')
        self.f.flush()


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mesh(name, V, Fc, mat_index=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(V))
    me.vertices.foreach_set('co', V.astype(np.float32).ravel())
    me.loops.add(Fc.size)
    me.loops.foreach_set('vertex_index', Fc.astype(np.int32).ravel())
    me.polygons.add(len(Fc))
    me.polygons.foreach_set('loop_start', np.arange(0, Fc.size, 3, dtype=np.int32))
    if mat_index is not None:
        me.polygons.foreach_set('material_index', mat_index.astype(np.int32))
    me.update(calc_edges=True)
    me.validate(clean_customdata=False)
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def mat_key(mat):
    kind, color = mat[0], mat[1]
    opts = mat[2] if len(mat) > 2 else {}
    return f"{kind}|{color}|{json.dumps(opts, sort_keys=True, default=str)}"


def build_hi(V, Fc, P, forge, det, log):
    keys = []
    pid_slot = {}
    for part in forge.parts[1:]:
        mat = part.mat
        if mat == 'skin':
            mat = ('skin', forge._skin_color)
        elif mat == 'eye':
            mat = ('eye', '#d0ccc4')
        k = mat_key(mat)
        if k not in keys:
            keys.append(k)
        pid_slot[part.pid] = (keys.index(k), mat)
    slot_of = np.zeros(256, dtype=np.int32)
    for pid, (si, _) in pid_slot.items():
        slot_of[pid] = si
    fpid = P[Fc[:, 0]]
    ob = make_mesh('hi', V, Fc, slot_of[fpid])
    sources = {}
    done = {}
    for pid, (si, mat) in sorted(pid_slot.items(), key=lambda x: x[1][0]):
        if si in done:
            continue
        m, src = shade.build_material(f'm{si}_{mat[0]}', mat[0], mat[1], mat[2] if len(mat) > 2 else {})
        done[si] = m
        sources[m] = src
    for si in range(len(keys)):
        ob.data.materials.append(done[si])
    ca = ob.data.color_attributes.new('detail', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', det.astype(np.float32).ravel())
    has_emis = any(src['emis'] is not None for src in sources.values())
    log(f'hi mesh: {len(V)} verts, {len(Fc)} tris, {len(keys)} materials, emissive={has_emis}')
    return ob, sources, has_emis


def decimate(hi, target, protect, log):
    lo_me = hi.data.copy()
    lo = bpy.data.objects.new('lo', lo_me)
    bpy.context.scene.collection.objects.link(lo)
    vg = lo.vertex_groups.new(name='protect')
    allv = np.arange(len(protect))
    vg.add(allv[protect == 0].tolist(), 0.0, 'REPLACE')
    for w in (1.0, 0.5):
        idx = np.nonzero(np.isclose(protect, w))[0]
        if len(idx):
            vg.add(idx.tolist(), w * 0.35, 'REPLACE')
    mod = lo.modifiers.new('dec', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = min(1.0, target / len(hi.data.polygons))
    mod.use_collapse_triangulate = True
    # vertex-group weighting: inverted so weight 0 = free collapse, protected verts keep density
    mod.vertex_group = 'protect'
    mod.invert_vertex_group = True
    mod.vertex_group_factor = 1.0
    t0 = time.time()
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(lo.evaluated_get(dg))
    lo.modifiers.clear()
    lo.data = me
    bpy.data.meshes.remove(lo_me)
    lo.vertex_groups.clear()
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    me.materials.clear()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    log(f'decimated to {len(me.polygons)} tris in {time.time()-t0:.1f}s')
    return lo


def unwrap(lo, head_center, head_r, log):
    bpy.ops.object.select_all(action='DESELECT')
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    bm = bmesh.from_edit_mesh(lo.data)
    uvl = bm.loops.layers.uv.active
    # islands
    bm.faces.ensure_lookup_table()
    seen = set()
    hc = np.asarray(head_center)
    for f in bm.faces:
        if f.index in seen:
            continue
        stack = [f]
        isl = []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            isl.append(g)
            for lp in g.loops:
                e = lp.edge
                for lf in e.link_faces:
                    if lf.index in seen:
                        continue
                    # same island if UVs match across the edge
                    ok = True
                    for v in e.verts:
                        uva = [l[uvl].uv for l in g.loops if l.vert == v][0]
                        uvb = [l[uvl].uv for l in lf.loops if l.vert == v][0]
                        if (uva - uvb).length > 1e-5:
                            ok = False
                            break
                    if ok:
                        seen.add(lf.index)
                        stack.append(lf)
        cen = np.mean([np.asarray(g.calc_center_median()) for g in isl], axis=0)
        if np.linalg.norm(cen - hc) < head_r:
            uvs = [l[uvl].uv for g in isl for l in g.loops]
            c = sum((u.copy() for u in uvs), uvs[0].copy() * 0) / len(uvs)
            for g in isl:
                for l in g.loops:
                    l[uvl].uv = c + (l[uvl].uv - c) * 1.7
    bmesh.update_edit_mesh(lo.data)
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    log('uv unwrapped')


def export_glb(path, objs, log):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_animations=True,
              export_animation_mode='ACTIONS', export_skins=True, export_all_influences=False, export_image_format='JPEG',
              export_draco_mesh_compression_enable=False, export_yup=True, export_tangents=True, export_cameras=False,
              export_lights=False, export_extras=False, export_def_bones=False, export_force_sampling=True,
              export_optimize_animation_size=True, export_morph=False, export_vertex_color='NONE')
    try:
        kw['export_jpeg_quality'] = 86
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop('export_jpeg_quality')
        bpy.ops.export_scene.gltf(**kw)
    log(f'exported {path} ({os.path.getsize(path)/1e6:.2f} MB)')


def build(hid, opts, log):
    spec = HEROES[hid]
    reset()
    t0 = time.time()
    body = Body(spec['body'])
    F = Forge(body, h=spec.get('voxel', 0.003), log=log)
    F._skin_color = spec.get('skin', '#c08a70')
    spec['outfit'](F, body, spec)
    meshes = F.evaluate()
    Vs, Fs, Ps = [], [], []
    off = 0
    for name, v, f, p in meshes:
        Vs.append(v)
        Fs.append(f + off)
        Ps.append(p)
        off += len(v)
    V = np.concatenate(Vs)
    Fc = np.concatenate(Fs)
    P = np.concatenate(Ps).astype(np.int32)
    del F.D, F.Db, F.PID, F.LAB
    gc.collect()
    zoff = -float(V[:, 2].min())
    det = detail_colors(V, P, F, body, spec)
    # protection weights for decimation (face / hands keep more triangles)
    protect = np.zeros(len(V), dtype=np.float32)
    near_head = np.linalg.norm(V - body.hc, axis=1) < 0.13 * body.hs
    protect[near_head & ((P == F.skin) | (P == F.eye))] = 1.0
    for sd in 'LR':
        hw = body.hand_frames[sd]['W'] + body.hand_frames[sd]['u'] * 0.06 * body.s
        protect[(np.linalg.norm(V - hw, axis=1) < 0.09 * body.s) & (P == F.skin)] = 0.5
    Vz = V.copy()
    Vz[:, 2] += zoff
    hi, sources, has_emis = build_hi(Vz, Fc, P, F, det, log)
    target = spec.get('tris', 24000)
    lo = decimate(hi, target, protect, log)
    hc = body.hc + np.array([0, 0, zoff])
    unwrap(lo, hc, 0.16 * body.hs, log)
    bm_mat = bpy.data.materials.new('bake_target')
    bm_mat.use_nodes = True
    lo.data.materials.append(bm_mat)
    os.makedirs(os.path.join(SCRATCH, hid), exist_ok=True)
    size = opts.get('tex', 1024)
    imgs = shade.bake(hi, lo, sources, size, os.path.join(SCRATCH, hid), hid.replace('-', '_'), log, has_emis=has_emis)
    em = shade.export_material(hid, imgs)
    lo.data.materials.clear()
    lo.data.materials.append(em)
    # vertex part ids for weights (nearest high-res vertex)
    from scipy.spatial import cKDTree
    n = len(lo.data.vertices)
    LV = np.empty(n * 3, dtype=np.float32)
    lo.data.vertices.foreach_get('co', LV)
    LV = LV.reshape(-1, 3).astype(np.float64)
    tree = cKDTree(Vz)
    _, nn = tree.query(LV, k=1)
    lpid = P[nn]
    del tree
    bpy.data.objects.remove(hi, do_unlink=True)
    for m in list(sources.keys()):
        bpy.data.materials.remove(m)
    gc.collect()
    E = np.empty(len(lo.data.edges) * 2, dtype=np.int32)
    lo.data.edges.foreach_get('vertices', E)
    E = E.reshape(-1, 2)
    Wt = rig.compute_weights(LV - np.array([0, 0, zoff]), lpid, F.parts, body, E, zoff, log)
    arm = rig.create_armature(body, 'Armature', zoff)
    lo.name = hid
    lo.data.name = hid
    rig.apply_weights(lo, Wt, arm)
    grip = body.hand_frames['R']['grip']
    socks = rig.add_sockets(arm, body, zoff, grip_point=grip, back_point=spec.get('back_socket'))
    legs = float(body.J['HpL'][2] + zoff)
    acts = anim.bake_actions(arm, spec['cls'], legs, log, abd_off=spec.get('arm_out', 0.0))
    log(f'{len(acts)} actions baked')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{hid}.glb')
    export_glb(path, [lo, arm] + list(socks.values()), log)
    if opts.get('keep'):
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SCRATCH, hid, f'{hid}.blend'))
    height = float(body.J['top'][2] + zoff)
    return dict(id=hid, oath=spec['oath'], cls=spec['cls'], file=f'{hid}.glb', height=round(height, 3),
                build_seconds=round(time.time() - t0, 1))


# ----------------------------------------------------------------------------- validation + review
def validate_and_review(hid, log, do_review=True):
    reset()
    path = os.path.join(OUT, f'{hid}.glb')
    bpy.ops.import_scene.gltf(filepath=path)
    arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    empties = [o.name for o in bpy.context.scene.objects if o.type == 'EMPTY']
    arm = arms[0] if arms else None
    tris = 0
    maxinf = 0
    for m in meshes:
        me = m.data
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        cnt = np.zeros(len(me.vertices), dtype=np.int32)
        for v in me.vertices:
            cnt[v.index] = sum(1 for g in v.groups if g.weight > 0)
        maxinf = max(maxinf, int(cnt.max()) if len(cnt) else 0)
    bones = [b.name for b in arm.data.bones] if arm else []
    clips = sorted(a.name for a in bpy.data.actions)
    lo = np.array([1e9] * 3)
    hi = -lo
    for m in meshes:
        for c in m.bound_box:
            w = m.matrix_world @ __import__('mathutils').Vector(c)
            lo = np.minimum(lo, w)
            hi = np.maximum(hi, w)
    missing_bones = [b for b in BONES if b not in bones]
    clip_names = [c.split('|')[0] for c in clips]
    missing_clips = [c for c in anim.CLIP_ORDER if not any(cn == c or cn.startswith(c) for cn in clip_names)]
    res = dict(id=hid, bytes=os.path.getsize(path), tris=tris, max_influences=maxinf, bones=len(bones),
               missing_bones=missing_bones, clips=len(clips), clip_names=clip_names, missing_clips=missing_clips,
               sockets=[e for e in empties if e.startswith('socket')],
               bbox_min=[round(float(x), 3) for x in lo], bbox_max=[round(float(x), 3) for x in hi])
    res['ok'] = (not missing_bones and not missing_clips and res['bytes'] <= 4_000_000 and 12000 <= tris <= 30000
                 and maxinf <= 4 and len(res['sockets']) == 4)
    log('validate', json.dumps(res))
    if do_review and arm is not None:
        render_review(hid, arm, meshes, hi, log)
    return res


def find_action(name):
    for a in bpy.data.actions:
        if a.name == name or a.name.startswith(name + '_') or a.name.split('|')[0] == name:
            return a
    return None


def render_review(hid, arm, meshes, bbhi, log):
    review.setup_scene((360, 600), 14)
    H = float(bbhi[2])
    os.makedirs(REVIEW, exist_ok=True)
    tmp = os.path.join(SCRATCH, hid)
    os.makedirs(tmp, exist_ok=True)
    if arm.animation_data is None:
        arm.animation_data_create()
    paths = []
    act = find_action('idle')
    arm.animation_data.action = act
    if act is not None and hasattr(arm.animation_data, 'action_slot') and act.slots:
        arm.animation_data.action_slot = act.slots[0]
    bpy.context.scene.frame_set(1)
    for yaw, lab in [(0, 'front'), (180, 'back'), (90, 'side'), (35, 'three-quarter')]:
        paths.append(review.render_view(os.path.join(tmp, f'r_{lab}.png'), (0, 0, H * 0.5), H * 1.05, yaw))
    act = find_action('attack_1')
    if act is not None:
        arm.animation_data.action = act
        if hasattr(arm.animation_data, 'action_slot') and act.slots:
            arm.animation_data.action_slot = act.slots[0]
    bpy.context.scene.frame_set(11)
    paths.append(review.render_view(os.path.join(tmp, 'r_action.png'), (0, 0, H * 0.5), H * 1.05, 25))
    bpy.context.scene.render.resolution_x = 360
    bpy.context.scene.render.resolution_y = 360
    act = find_action('idle')
    arm.animation_data.action = act
    if hasattr(arm.animation_data, 'action_slot') and act.slots:
        arm.animation_data.action_slot = act.slots[0]
    bpy.context.scene.frame_set(1)
    head = [o for o in bpy.context.scene.objects if o.name == 'socket.head']
    hz = head[0].matrix_world.translation.z if head else H - 0.12
    face = review.render_view(os.path.join(tmp, 'r_face.png'), (0, -0.02, hz - 0.11), 0.30, 20)
    from PIL import Image
    # pad face render to the sheet height
    im = Image.open(face).convert('RGB')
    canvas = Image.new('RGB', (360, 600), (226, 224, 220))
    canvas.paste(im, (0, 120))
    canvas.save(os.path.join(tmp, 'r_face_pad.png'))
    paths.append(os.path.join(tmp, 'r_face_pad.png'))
    out = os.path.join(REVIEW, f'{hid}.png')
    review.contact_sheet(paths, ['FRONT', 'BACK', 'SIDE', 'THREE-QUARTER', 'ATTACK_1 f11', 'FACE'], out, f'{hid}  (Cycles review, GLB re-import)')
    log('review sheet', out)


def update_manifest(entry):
    path = os.path.join(OUT, 'manifest.json')
    data = []
    if os.path.exists(path):
        try:
            data = json.load(open(path))
        except Exception:
            data = []
    data = [d for d in data if d.get('id') != entry['id']]
    data.append(entry)
    data.sort(key=lambda d: d['id'])
    json.dump(data, open(path, 'w'), indent=1)


def update_validation(res):
    path = os.path.join(HERE, 'VALIDATION.json')
    data = {}
    if os.path.exists(path):
        try:
            data = json.load(open(path))
        except Exception:
            data = {}
    data[res['id']] = res
    json.dump(dict(sorted(data.items())), open(path, 'w'), indent=1)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = [a for a in sys.argv[1:] if a.startswith('--')]
    opts = {'keep': '--keep' in flags}
    for f in flags:
        if f.startswith('--tex='):
            opts['tex'] = int(f.split('=')[1])
    ids = sorted(HEROES) if args == ['all'] else args
    os.makedirs(LOGS, exist_ok=True)
    for hid in ids:
        log = Log(os.path.join(LOGS, f'{hid}.log'))
        if '--review-only' not in flags:
            entry = build(hid, opts, log)
        else:
            entry = {'id': hid, 'oath': HEROES[hid]['oath'], 'cls': HEROES[hid]['cls'], 'file': f'{hid}.glb'}
            old = [d for d in (json.load(open(os.path.join(OUT, 'manifest.json'))) if os.path.exists(os.path.join(OUT, 'manifest.json')) else []) if d['id'] == hid]
            if old:
                entry = old[0]
        res = validate_and_review(hid, log, do_review='--no-review' not in flags)
        update_validation(res)
        entry.update(bytes=res['bytes'], tris=res['tris'], clips=[c for c in anim.CLIP_ORDER if c in res['clip_names']])
        entry.setdefault('height', res['bbox_max'][2])
        update_manifest(entry)
        log('done', hid)


if __name__ == '__main__':
    main()
