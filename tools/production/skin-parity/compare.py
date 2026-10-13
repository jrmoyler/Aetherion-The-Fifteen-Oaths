"""Compare fixed imported meshes by verified names/vertex order, no best-fit alignment."""
import copy
import json
import math
import re
import sys

TOLERANCE_METERS = 0.0001  # 0.1 mm, fixed test threshold; not a gameplay/visual budget.
LOCAL_TOLERANCE_METERS = 0.00002
WEIGHT_TOLERANCE = 0.00005


def normalized_name(name):
    # Three removes FBX/glTF property-binding punctuation; Godot inserts underscores.
    # Preserve minus signs so '-1' and '+1' mesh names cannot alias.
    return re.sub(r'[_ .]', '', name)


def indexed_meshes(meshes):
    result = {}
    for mesh in meshes:
        key = normalized_name(mesh['node'])
        if key in result:
            raise ValueError(f'Ambiguous normalized mesh name: {key}')
        result[key] = mesh
    return result


def vertices(mesh):
    return [v for surface in mesh['surfaces'] for v in surface['vertices']]


def bounds(points):
    return {'min': [min(p[i] for p in points) for i in range(3)],
            'max': [max(p[i] for p in points) for i in range(3)]}


def compare_phase(three_meshes, godot_meshes):
    left, right = indexed_meshes(three_meshes), indexed_meshes(godot_meshes)
    if left.keys() != right.keys():
        raise ValueError('Imported mesh sets differ')
    count = skinned = blended = mismatches = 0
    max_world = max_local = max_weight = 0.0
    left_points, right_points, worst = [], [], None
    for name, mesh in left.items():
        other = right[name]
        if mesh['skinned'] != other['skinned']:
            raise ValueError(f'Skin applicability mismatch: {name}')
        source, target = vertices(mesh), vertices(other)
        if len(source) != len(target):
            raise ValueError(f'Vertex count/order correspondence unavailable: {name}')
        for index, (a, b) in enumerate(zip(source, target)):
            local = math.dist(a['local'], b['local'])
            world = math.dist(a['world'], b['world'])
            if not math.isfinite(local + world):
                raise ValueError('Non-finite vertex')
            aw = {normalized_name(n): w for n, w in a['weights']}
            bw = {normalized_name(n): w for n, w in b['weights']}
            if aw.keys() != bw.keys():
                raise ValueError(f'Joint correspondence differs: {name} vertex {index}')
            weight = max((abs(aw[n] - bw[n]) for n in aw), default=0)
            if local > LOCAL_TOLERANCE_METERS or weight > WEIGHT_TOLERANCE:
                raise ValueError(f'Vertex order/weights cannot be trusted: {name} vertex {index}, local={local}, weights={weight}')
            count += 1
            skinned += bool(aw)
            blended += len(aw) > 1
            mismatches += world > TOLERANCE_METERS
            max_local = max(max_local, local)
            max_weight = max(max_weight, weight)
            if world > max_world:
                max_world = world
                worst = {'mesh': mesh['node'], 'vertex': index, 'threeWorld': a['world'], 'godotWorld': b['world']}
            left_points.append(a['world'])
            right_points.append(b['world'])
    if not count or not skinned:
        raise ValueError('No actual skinned vertices compared')
    return {'passed': mismatches == 0, 'meshCount': len(left), 'vertexCount': count,
            'skinnedVertexCount': skinned, 'multipleInfluenceVertexCount': blended,
            'verticesOutsideTolerance': mismatches, 'maximumWorldDifferenceMeters': max_world,
            'maximumLocalDifferenceMeters': max_local, 'maximumWeightDifference': max_weight,
            'threeWorldBounds': bounds(left_points), 'godotWorldBounds': bounds(right_points), 'worst': worst}


def movement(rest, animated):
    left, right = indexed_meshes(rest), indexed_meshes(animated)
    distances = [math.dist(a['world'], b['world']) for key in left
                 for a, b in zip(vertices(left[key]), vertices(right[key])) if a['weights']]
    return {'movedSkinnedVertices': sum(v > TOLERANCE_METERS for v in distances),
            'maximumSkinnedDisplacementMeters': max(distances, default=0)}


def compare(three, godot):
    records = []
    right = {a['id']: a for a in godot['assets']}
    if len(right) != len(godot['assets']) or set(right) != {a['id'] for a in three['assets']}:
        raise ValueError('Asset correspondence differs')
    for a in three['assets']:
        b = right[a['id']]
        if a['clip'] != b['clip'] or abs(a['time'] - b['time']) > 1e-7 or abs(a['duration'] - b['duration']) > 1e-6:
            raise ValueError('Clip/time mismatch')
        phases = {p: compare_phase(a[p], b[p]) for p in ['rest', 'animated']}
        motions = {'three': movement(a['rest'], a['animated']), 'godot': movement(b['rest'], b['animated'])}
        if any(v['movedSkinnedVertices'] == 0 for v in motions.values()):
            raise ValueError('Animated check did not deform actual weighted vertices')
        negative = copy.deepcopy(b['animated'])
        for m in negative:
            for v in vertices(m):
                v['world'][0] += 0.01
        rejected = compare_phase(a['animated'], negative)
        if rejected['passed']:
            raise AssertionError('One-centimeter transformed fixture was falsely accepted')
        records.append({'id': a['id'], 'clip': a['clip'], 'timeSeconds': a['time'], 'durationSeconds': a['duration'],
                        'phases': phases, 'movement': motions,
                        'nativeGodotBake': sorted(set(m['nativeBake'] for m in b['rest'] if m['skinned'])),
                        'negativeFixture': {'description': 'Godot evaluated world vertices translated +0.01m X in memory only',
                                            'rejected': True, 'verticesOutsideTolerance': rejected['verticesOutsideTolerance'],
                                            'maximumWorldDifferenceMeters': rejected['maximumWorldDifferenceMeters']}})
    return {'schemaVersion': 1, 'scope': 'Imported-data CPU weighted vertex evaluation; NOT native RenderingServer/GPU skinning certification',
            'coordinateConversion': {'threeToGodot': 'Identity: X,Y,Z meters retained; no reflection, fitting, rescaling, recentering or pose registration'},
            'tolerances': {'worldMeters': TOLERANCE_METERS, 'localCorrespondenceMeters': LOCAL_TOLERANCE_METERS, 'weights': WEIGHT_TOLERANCE},
            'summary': {'assets': len(records), 'sampledPoses': 2 * len(records),
                        'passedPoses': sum(p['passed'] for r in records for p in r['phases'].values()),
                        'maximumWorldDifferenceMeters': max(p['maximumWorldDifferenceMeters'] for r in records for p in r['phases'].values()),
                        'negativeFixturesRejected': len(records), 'gpuParityCertified': False, 'productionApproved': 0},
            'records': records}

if __name__ == '__main__':
    result = compare(json.load(open(sys.argv[1])), json.load(open(sys.argv[2])))
    with open(sys.argv[3], 'w') as output:
        json.dump(result, output, indent=2)
        output.write('\n')
    print(json.dumps(result['summary']))
    sys.exit(0 if result['summary']['passedPoses'] == result['summary']['sampledPoses'] else 1)
