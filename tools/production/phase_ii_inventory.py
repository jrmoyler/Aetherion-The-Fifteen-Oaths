"""Read exact imported Phase II bytes and index refinements without counting meshes.

Canonical IDs stay unchanged. JSON-pointer keys identify unnamed nested work entries;
they are inventory locators, never newly invented canonical asset IDs.
"""
from collections import Counter
from pathlib import Path
import hashlib
import json
import zipfile

ARCHIVE = 'docs/archives/Aetherion_Phase_II_Continental_Architecture_2026-10-13.zip'
PREFIX = 'AETHERION_CANON/21_WORLD_CONSTRUCTION_PHASE_II/'
EXPECTED_SIZE = 1011575
EXPECTED_SHA = '02306b20f0c070f6fe488d7bf2e4fa25412503010c037860fe3a2a91244be2bc'
REGISTRIES = [
    'ARCHITECTURAL_KIT_REGISTRY.json', 'ENVIRONMENT_ASSET_REGISTRY.json',
    'CAPITAL_LAYOUT_REGISTRY.json', 'REGION_BLUEPRINT_INDEX.json',
    'SETTLEMENT_REGISTRY.json', 'WORLD_POI_REGISTRY.json',
    'WORLD_EVENT_REGISTRY.json', 'REGIONAL_ECOLOGY_PROFILES.json',
    'STREAMING_PROTOTYPE_CONTRACTS.json', 'TRANSPORT_ROUTE_REGISTRY.json',
    'WORLD_REGION_GRAPH.json',
]
SYSTEM_DOCS = [
    'WORLD_ECOLOGY_SYSTEM.md', 'DYNAMIC_WEATHER_SYSTEM.md', 'NPC_CIVILIZATION_SYSTEM.md',
    'WORLD_STREAMING_ARCHITECTURE.md', 'TRANSPORTATION_NETWORK.md',
    'DUNGEON_AND_EXPLORATION_PLAN.md', 'CONTINENT_GEOGRAPHY.md',
]
ENGINE_GATES = ['blender_authoring_and_reimport', 'unreal_import_and_runtime',
                'godot_import_and_runtime', 'threejs_load_render_dispose',
                'reference_visual_approval', 'lod_collision_gameplay', 'measured_performance']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify_package(root):
    root = Path(root)
    archive = root / ARCHIVE
    data = archive.read_bytes()
    if len(data) != EXPECTED_SIZE or sha(data) != EXPECTED_SHA:
        raise ValueError('Phase II exact archive checksum/size mismatch')
    payload, admin = [], []
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Duplicate archive entry')
        for name in sorted(names):
            if name.endswith('/'):
                continue
            content = z.read(name)
            if name.startswith('AETHERION_PHASE_II/'):
                relative = name.removeprefix('AETHERION_PHASE_II/')
                path = PREFIX + relative
                local = root / path
                if not local.is_file() or local.read_bytes() != content:
                    raise ValueError(f'Phase II unpacked bytes differ or missing: {path}')
                payload.append({'path': path, 'archive_member': name, 'sha256': sha(content),
                                'size_bytes': len(content), 'integrity': 'EXACT_ARCHIVE_BYTE_MATCH'})
            else:
                admin.append({'archive_member': name, 'sha256': sha(content), 'size_bytes': len(content),
                              'scope': 'ARCHIVE_ADMIN_NOT_EXTRA_WORLD_DELIVERABLE'})
    return payload, admin


def build_phase_ii(root, families, baseline_detail, contracts, gate_definitions):
    root = Path(root)
    payload, admin = verify_package(root)
    documents = {name: json.loads((root / PREFIX / name).read_text()) for name in REGISTRIES}
    family_map = {r['id']: r for r in families}
    contract_ids = {r['id'] for r in contracts}
    baseline = {r['id'] for r in baseline_detail}
    ledger = {}
    root_row_count = 0

    def add_record(row, name, pointer, kind, identity=None, inherited=None):
        identity = identity or row.get('id')
        if not identity:
            raise ValueError(f'Missing Phase II identity: {name}#{pointer}')
        item = ledger.setdefault(identity, {'id': identity, 'baseline_identity': identity in baseline,
                                           'source_records': [], 'scope_kinds': [],
                                           'status': 'DOCUMENTED_PROPOSED_NOT_IMPLEMENTED',
                                           'production_accepted': False})
        source = {'registry_path': PREFIX + name, 'json_pointer': pointer, 'name': row.get('name', row.get('title', identity)),
                  'oath_id': row.get('oath_id', (inherited or {}).get('oath_id')),
                  'region_id': row.get('region_id', (inherited or {}).get('region_id'))}
        if source not in item['source_records']:
            item['source_records'].append(source)
        if kind not in item['scope_kinds']:
            item['scope_kinds'].append(kind)

    for name, doc in documents.items():
        seen = set()
        for i, row in enumerate(doc['records']):
            if row['id'] in seen:
                raise ValueError(f'Duplicate Phase II registry ID: {name}:{row["id"]}')
            seen.add(row['id'])
            add_record(row, name, f'/records/{i}', name.removesuffix('.json').lower())
            root_row_count += 1
    for i, row in enumerate(documents['CAPITAL_LAYOUT_REGISTRY.json']['records']):
        for j, district in enumerate(row['districts']):
            add_record(district, 'CAPITAL_LAYOUT_REGISTRY.json', f'/records/{i}/districts/{j}', 'capital_district', inherited=row)
        for j, interior in enumerate(row['interiors']):
            add_record(interior, 'CAPITAL_LAYOUT_REGISTRY.json', f'/records/{i}/interiors/{j}', 'enterable_service_interior', interior['poi_id'], row)
    for name, keys in [('WORLD_REGION_GRAPH.json', ['edges', 'drainage_networks']),
                       ('TRANSPORT_ROUTE_REGISTRY.json', ['mode_catalog'])]:
        for key in keys:
            for i, row in enumerate(documents[name][key]):
                add_record(row, name, f'/{key}/{i}', key)

    arch = documents['ARCHITECTURAL_KIT_REGISTRY.json']['records']
    env = documents['ENVIRONMENT_ASSET_REGISTRY.json']['records']
    refinement_map = {r['id']: [] for r in families}
    modules, variants, production_refinements = [], [], []
    known_dependencies = set(family_map) | set(ledger) | contract_ids

    def require_family(identity):
        if identity not in family_map:
            raise ValueError(f'Unknown Phase II baseline family: {identity}')

    def work_entry(row, parent, name, pointer, kind, family_ids, region_id):
        for identity in family_ids:
            require_family(identity)
        return {'inventory_key': PREFIX + name + '#' + pointer,
                'identity_policy': 'SOURCE_JSON_POINTER_NOT_NEW_CANON_ID',
                'parent_id': parent['id'], 'scope_kind': kind, 'region_id': region_id,
                'oath_id': row.get('oath_id', parent.get('oath_id')),
                'baseline_family_ids': family_ids, 'source_specification': row,
                'status': 'REQUIREMENT_DOCUMENTED_ARTIFACT_MISSING',
                'candidate_ids': [], 'approved': False,
                'acceptance_gates': {g: 'NOT_TESTED' for g in ENGINE_GATES},
                'rig_policy': 'STATIC_BY_DEFAULT_ARTICULATE_ONLY_WHERE_SOURCE_ANIMATION_OR_FUNCTION_REQUIRES'}

    for name, rows in [('ARCHITECTURAL_KIT_REGISTRY.json', arch), ('ENVIRONMENT_ASSET_REGISTRY.json', env)]:
        for i, row in enumerate(rows):
            targets = sorted({row['baseline_asset_id']} | {r['baseline_asset_id'] for r in row.get('baseline_refinements', [])})
            for identity in targets:
                require_family(identity)
                refinement_map[identity].append(row['id'])
            for dep in row['dependencies']:
                if dep not in known_dependencies:
                    raise ValueError(f'Unknown Phase II asset dependency: {dep}')
            production_refinements.append({
                'id': row['id'], 'name': row['name'], 'source_record': {'path': PREFIX + name, 'json_pointer': f'/records/{i}'},
                'baseline_family_ids': targets, 'region_ids': row.get('region_ids', [row.get('region_id')]),
                'source_requirements': {k: row[k] for k in ['purpose', 'construction', 'proposed_physical_scale', 'materials', 'variants', 'collision', 'animation', 'lod', 'interactions', 'performance', 'acceptance']},
                'signature_module_scope_labels': row.get('signature_modules', []),
                'source_reference_evidence': row['reference_evidence'], 'dependencies': row['dependencies'],
                'canon_status': row['canon_status'], 'status': 'REQUIREMENTS_DOCUMENTED_PRODUCTION_MISSING',
                'candidate_ids': [], 'approved': False,
                'acceptance_gates': {g: 'NOT_TESTED' for g in ENGINE_GATES},
            })
            for j, module in enumerate(row.get('modules', [])):
                modules.append(work_entry(module, row, name, f'/records/{i}/modules/{j}', 'architecture_module', [row['baseline_asset_id']], row['region_id']))
            for j, variant in enumerate(row.get('regional_variants', [])):
                variants.append(work_entry(variant, row, name, f'/records/{i}/regional_variants/{j}', 'environment_regional_variant', [variant['baseline_asset_id']], variant['region_id']))

    pois = documents['WORLD_POI_REGISTRY.json']['records']
    baseline_pois = json.loads((root / 'AETHERION_CANON/03_GEOGRAPHY/WORLD_POI_REGISTRY.json').read_text())['records']
    poi_map = {r['id']: r for r in pois}
    for original in baseline_pois:
        if original['id'] not in poi_map or poi_map[original['id']] != original:
            raise ValueError(f'Phase II changes protected baseline POI: {original["id"]}')
    baseline_regions = json.loads((root / 'AETHERION_CANON/03_GEOGRAPHY/REALM_REGISTRY.json').read_text())['records']
    graph = documents['WORLD_REGION_GRAPH.json']
    if {r['id'] for r in graph['records']} != {r['id'] for r in baseline_regions}:
        raise ValueError('Phase II changes protected region identities')
    for region in graph['records']:
        original = next(r for r in baseline_regions if r['id'] == region['id'])
        if (region['oath_id'], region['capital_id']) != (original['oath_id'], original['capital_id']):
            raise ValueError(f'Phase II changes region identity mapping: {region["id"]}')
    stream = documents['STREAMING_PROTOTYPE_CONTRACTS.json']['records']
    for row in stream:
        if not set(row['baseline_contract_ids']) <= contract_ids:
            raise ValueError(f'Unknown Phase II contract refinement: {row["id"]}')
    events = documents['WORLD_EVENT_REGISTRY.json']['records']
    if {r['id'] for r in events} != {r['id'] for r in json.loads((root / 'AETHERION_CANON/13_WORLD_EVENTS/WORLD_EVENT_REGISTRY.json').read_text())['records']}:
        raise ValueError('Phase II event identity set differs from baseline')
    system_obligations = []
    for name in ['STREAMING_PROTOTYPE_CONTRACTS.json', 'WORLD_EVENT_REGISTRY.json', 'REGIONAL_ECOLOGY_PROFILES.json', 'CAPITAL_LAYOUT_REGISTRY.json']:
        for i, row in enumerate(documents[name]['records']):
            system_obligations.append({'id': row['id'], 'source_record': {'path': PREFIX + name, 'json_pointer': f'/records/{i}'},
                                       'kind': name.removesuffix('.json').lower(),
                                       'baseline_contract_ids': row.get('baseline_contract_ids', []),
                                       'acceptance_tests': row.get('acceptance_tests', []),
                                       'additional_acceptance_policy': 'Read complete source record including invariants, recovery, phases and reference gates; empty acceptance_tests does not mean no work.',
                                       'implementation_status': 'DOCUMENTED_NOT_RUNTIME_VERIFIED',
                                       'engine_gates': {k: 'NOT_TESTED' for k in ENGINE_GATES if 'blender' not in k},
                                       'validated': False})
    doc_obligations = [{'source_path': PREFIX + name, 'sha256': sha((root / PREFIX / name).read_bytes()),
                        'scope': 'COMPLETE_DOCUMENT_REQUIREMENTS_NOT_AN_IMPLEMENTED_SYSTEM',
                        'status': 'IMPLEMENTATION_AND_RUNTIME_ACCEPTANCE_OPEN'} for name in SYSTEM_DOCS]
    layouts = documents['CAPITAL_LAYOUT_REGISTRY.json']['records']
    refined = sorted(k for k, values in refinement_map.items() if values)
    region_ledgers = []
    for region in graph['records']:
        rid = region['id']
        refs = [k for k in refined if family_map[k]['oath_id'] == region['oath_id']]
        region_ledgers.append({'region_id': rid, 'oath_id': region['oath_id'], 'capital_id': region['capital_id'],
                               'refined_phase_i_family_ids': refs,
                               'architecture_module_keys': [w['inventory_key'] for w in modules if w['region_id'] == rid],
                               'environment_variant_keys': [w['inventory_key'] for w in variants if w['region_id'] == rid],
                               'poi_ids': [r['id'] for r in pois if r.get('region_id') == rid],
                               'production_accepted': False})
    stats = {'payload_files': len(payload), 'archive_admin_files': len(admin),
             'deliverable_families': len(json.loads((root / PREFIX / 'DELIVERABLE_MANIFEST.json').read_text())['records']),
             'regions': len(graph['records']), 'capital_layouts': len(layouts),
             'architecture_kits': len(arch), 'architecture_module_entries': len(modules),
             'shared_environment_families': len(env), 'regional_environment_variants': len(variants),
             'existing_phase_i_family_ids_refined': len(refined),
             'settlements': len(documents['SETTLEMENT_REGISTRY.json']['records']),
             'city_districts': sum(len(r['districts']) for r in layouts),
             'enterable_service_interiors': sum(len(r['interiors']) for r in layouts),
             'pois': len(pois), 'preserved_baseline_pois': len(baseline_pois),
             'new_poi_ids': len(set(poi_map) - {r['id'] for r in baseline_pois}),
             'event_refinements': len(events), 'streaming_contract_refinements': len(stream),
             'ecology_profiles': len(documents['REGIONAL_ECOLOGY_PROFILES.json']['records']),
             'transport_route_refinements': len(documents['TRANSPORT_ROUTE_REGISTRY.json']['records']),
             'transport_modes': len(documents['TRANSPORT_ROUTE_REGISTRY.json']['mode_catalog']),
             'root_registry_views': root_row_count, 'unique_registered_identity_ids': len(ledger),
             'registered_ids_already_in_phase_i_detail': len(set(ledger) & baseline),
             'registered_ids_new_to_phase_i_detail': len(set(ledger) - baseline),
             'poi_kind_counts': dict(sorted(Counter(r['kind'] for r in pois).items())),
             'accepted_production_assets': 0}
    return {'status': 'EXACT_ARCHIVE_AND_UNPACKED_BYTES_VERIFIED_SCOPE_INDEXED',
            'archive_path': ARCHIVE, 'filename': Path(ARCHIVE).name,
            'expected_size_bytes': EXPECTED_SIZE, 'expected_sha256': EXPECTED_SHA,
            'payload_catalog': payload, 'archive_administrative_files': admin,
            'counts': stats,
            'counting_policy': ['The 39 architecture/environment refinement records are not new independent baseline production families.',
                                'Architecture modules and environment variants refine existing family IDs and may share geometry/materials; 255+272 is not an exact mesh count.',
                                'Districts, interiors and settlements are already represented among 318 POIs; count repeated registry views once by original identity.',
                                'Preserved 63 POIs, 15 regions and 15 events retain their baseline IDs; new sidecar information does not imply approved canon or implemented world.',
                                'Pointer-keyed unnamed entries retain exact provenance without minting canonical item IDs.'],
            'item_level_inventory': {'architecture_modules': modules, 'regional_environment_variants': variants},
            'production_refinements': production_refinements,
            'baseline_family_refinements': {k: sorted(set(v)) for k, v in refinement_map.items() if v},
            'registered_identity_ledger': list(ledger.values()),
            'world_system_obligations': system_obligations, 'system_document_obligations': doc_obligations,
            'region_acceptance_ledger': region_ledgers,
            'acceptance_gate_definitions': gate_definitions,
            'runtime_world_implementation': 'NOT_ESTABLISHED_BY_DOCUMENT_INTEGRATION',
            'exact_mesh_and_clip_requirement_count': None}
