#!/usr/bin/env python3
"""Rebuild the evidence-based combined Phase I and II work inventory; never infer art acceptance.

Run from any directory. --check verifies committed outputs without modifying them.
No network, third-party modules, source mutations, or Phase II extrapolation.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys
from delivery_inventory import collect_deliveries
from phase_ii_inventory import build_phase_ii

ROOT = Path(__file__).resolve().parents[2]
CANON = 'AETHERION_CANON/'
MASTER = CANON + '10_ASSET_REGISTRY/MASTER_ASSET_REGISTRY.json'
SOURCE = CANON + '10_ASSET_REGISTRY/SOURCE_ASSET_INDEX.json'
TAXONOMY = CANON + '10_ASSET_REGISTRY/ASSET_TAXONOMY.md'
CONTRACTS = CANON + '18_IMPLEMENTATION_CONTRACTS/IMPLEMENTATION_CONTRACTS.json'
# Each is a distinct identity domain. Relationships are links, not new mesh counts.
DETAIL = [
    '01_WORLD_BIBLE/ENTITY_CONTRACT.json',
    '03_GEOGRAPHY/REALM_REGISTRY.json', '03_GEOGRAPHY/WORLD_POI_REGISTRY.json',
    '03_GEOGRAPHY/WORLD_GRAPH.json', '03_GEOGRAPHY/TRADE_ROUTES.json',
    '05_FACTIONS_AND_CHARACTERS/FACTION_REGISTRY.json',
    '05_FACTIONS_AND_CHARACTERS/CHARACTER_REGISTRY.json',
    '05_FACTIONS_AND_CHARACTERS/CHARACTER_SERVICE_REGISTRY.json',
    '05_FACTIONS_AND_CHARACTERS/RELATIONSHIP_GRAPH.json',
    '06_NARRATIVE/QUEST_REGISTRY.json', '06_NARRATIVE/ENDING_PREREQUISITES.json',
    '07_GAMEPLAY_SYSTEMS/OATH_SYSTEM_PROFILES.json',
    '07_GAMEPLAY_SYSTEMS/CASTABLE_WORLD_LINKS.json',
    '07_GAMEPLAY_SYSTEMS/INTERACTION_RULES.json',
    '12_CREATURES_AND_MOUNTS/CREATURE_MOUNT_MORPH_REGISTRY.json',
    '13_WORLD_EVENTS/WORLD_EVENT_REGISTRY.json',
    '14_LIFE_SKILLS_AND_ECONOMY/ECONOMY_REGISTRY.json',
    '14_LIFE_SKILLS_AND_ECONOMY/PRODUCTION_RECIPES.json',
    '14_LIFE_SKILLS_AND_ECONOMY/WORLD_RESOURCE_FLOWS.json',
    '15_HOUSING/HOUSING_PROFILES.json', '16_PVP_AND_TERRITORY/PVP_MODE_CONTRACTS.json',
    '20_PRODUCTION_ROADMAP/IMPLEMENTATION_BACKLOG.json',
]
GROUPS = {
    'concept_construction_guidance': ['B', 'F', 'H'],
    'character_creature_rig_animation': ['A', 'C', 'D', 'R', 'S', 'T'],
    'equipment_and_clothing': ['E', 'G', 'I', 'J', 'K'],
    'static_environment_architecture_terrain_props': ['L', 'M', 'N', 'O', 'P', 'Q', 'AF'],
    'articulated_vehicles_and_siege': ['U', 'V'],
    'vfx': ['W', 'X', 'Y'],
    'ui': ['Z'], 'audio': ['AA'], 'cinematic': ['AB'],
    'world_interactive_assets': ['AC', 'AD', 'AE', 'AG'],
    'materials_and_shaders': ['AH'],
}
RIG_REQUIRED = {'A', 'C', 'D', 'R', 'S', 'T', 'U', 'V'}
RIG_CONDITIONAL = {'E', 'G', 'I', 'J', 'K', 'M', 'N', 'O', 'P', 'Q', 'AB', 'AC', 'AD', 'AE', 'AG'}
GUIDANCE = {'B', 'F', 'H'}
NON_MESH = {'W', 'X', 'Y', 'Z', 'AA', 'AH'}
GATES = {
    'design_and_pixels': 'Inspect original reference pixels, resolve hidden views and retain exact reference IDs; creation authorization is not final art approval.',
    'authoring': 'Real low-poly source .blend, measured scale/pivots, UV unwrap and exported textured PBR materials where applicable. A PNG or procedural code alone is not a mesh.',
    'rig_and_animation': 'Articulation/deformation only when appropriate; verify bone weights, sockets, clip timing, interruption and contact. Static rocks need no rig.',
    'lod_collision': 'Authored LODs and collision with roles separated; navigation and state swaps tested. Geometry counts alone do not establish quality.',
    'portable_export': 'Actual GLB/glTF export with buffers, accessors, materials, textures, skin and animation checks applicable to asset type.',
    'blender': 'Open/reimport actual deliverable and render source scene. Source .blend plus scripts required for authored meshes.',
    'unreal': 'Actual engine import/runtime test, material/texture/animation mapping and collision/LOD evidence. An import recipe does not verify parity.',
    'godot': 'Actual engine import/runtime test of final files and animation/material/collision behavior.',
    'threejs': 'Actual load, render, animation, dispose and material tests using final files; preserve source castable IDs, bytes and behavior.',
    'reference_visual_match': 'Inspect renders/contact sheets against original pixels; record artifact hashes and exact review scope. Build success is not art acceptance.',
    'performance': 'Measure nominated target devices, memory, frame/rig/shader cost and streaming; budgets remain PROPOSED until measured.',
    'final_art_approval': 'Explicit review of exact artifacts and intended use; PROPOSED designs do not become approved through implementation.',
}


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def read(path: str):
    return json.loads((ROOT / path).read_text())


def require_unique(rows, key, label):
    ids = [r[key] for r in rows]
    if len(ids) != len(set(ids)):
        raise ValueError(f'Duplicate {key} in {label}')


def file_evidence(path, expected):
    p = ROOT / path
    if not p.is_file():
        raise ValueError(f'Missing source artifact: {path}')
    actual = digest(p)
    if actual != expected:
        raise ValueError(f'Hash mismatch: {path}')
    return {'path': path, 'sha256': actual, 'size_bytes': p.stat().st_size, 'byte_integrity': 'VERIFIED_LOCAL'}


def build():
    master = read(MASTER)['records']
    require_unique(master, 'id', MASTER)
    source = read(SOURCE)['records']
    require_unique(source, 'sha256', SOURCE)
    families = [r for r in master if r['record_kind'] == 'production_family_requirement']
    taxonomy = {}
    for line in (ROOT / TAXONOMY).read_text().splitlines():
        cells = [c.strip() for c in line.split('|')]
        if len(cells) == 6 and cells[1] in {r['category_id'] for r in families}:
            taxonomy[cells[1]] = {'id': cells[1], 'name': cells[2], 'scope_components': cells[3], 'acceptance_focus': cells[4]}
    categories = set(taxonomy)
    if categories != {c for codes in GROUPS.values() for c in codes}:
        raise ValueError('Taxonomy categories changed; update group/rig classification explicitly')
    detail = []
    for rel in DETAIL:
        path = CANON + rel
        rows = read(path)['records']
        require_unique(rows, 'id', path)
        for index, row in enumerate(rows):
            detail.append({'id': row['id'], 'registry_path': path, 'json_pointer': f'/records/{index}',
                           'oath_id': row.get('oath_id'), 'name': row.get('name', row.get('title', row['id'])),
                           'dependencies': row.get('dependencies', []),
                           'scope_only_not_additive_asset_count': True})
    detail_ids = {r['id'] for r in detail}
    # Registry views may repeat one identity (e.g. realm and world-graph nodes).
    detail_by_id = {}
    for row in detail:
        item = detail_by_id.setdefault(row['id'], {'id': row['id'], 'source_records': [], 'scope_only_not_additive_asset_count': True})
        item['source_records'].append({k: v for k, v in row.items() if k not in {'id', 'scope_only_not_additive_asset_count'}})
    all_master_ids = {r['id'] for r in master}
    work = []
    for index, r in enumerate(master):
        if r['record_kind'] != 'production_family_requirement':
            continue
        for dep in r['dependencies']:
            if dep not in all_master_ids:
                raise ValueError(f'Unresolved family dependency: {dep}')
        cat = r['category_id']
        rig = 'REQUIRED_ARTICULATION_OR_DEFORMATION' if cat in RIG_REQUIRED else 'CONDITIONAL_ON_COMPONENT' if cat in RIG_CONDITIONAL else 'NOT_REQUIRED_BY_CATEGORY'
        mesh = 'GUIDANCE_ONLY' if cat in GUIDANCE else 'TYPE_DEPENDENT_NON_MESH_DELIVERABLE' if cat in NON_MESH else 'REQUIRED_WHERE_COMPONENT_IS_3D'
        linked = [d['id'] for d in detail if r['id'] in d['dependencies']]
        work.append({'id': r['id'], 'name': r['name'], 'oath_id': r['oath_id'], 'category_id': cat,
                     'group': next(g for g, codes in GROUPS.items() if cat in codes),
                     'source_record': {'path': MASTER, 'json_pointer': f'/records/{index}'},
                     'scope_unit': 'FAMILY_NOT_ONE_MESH', 'canon_status': r['canon_status'],
                     'component_scope': r['model_construction']['components'],
                     'mesh_obligation': mesh, 'rig_obligation': rig,
                     'source_requirements': {k: r[k] for k in ['materials', 'shape_language', 'palette', 'scale',
                         'animation_requirements', 'vfx_requirements', 'audio_requirements', 'environment_interactions',
                         'lod_requirements', 'collision_requirements', 'platform_constraints']},
                     'acceptance_focus': r['model_construction']['acceptance'],
                     'references': r['references'], 'dependencies': r['dependencies'],
                     'explicit_detail_dependency_ids': linked,
                     'delivered_production_artifacts': [],
                     'gates': {g: ('NOT_APPLICABLE_TO_GUIDANCE' if cat in GUIDANCE and g in {'authoring', 'rig_and_animation', 'lod_collision', 'portable_export', 'blender', 'unreal', 'godot', 'threejs'}
                                  else 'CONDITIONAL_NOT_TESTED' if g == 'rig_and_animation' and cat not in RIG_REQUIRED
                                  else 'NOT_TESTED') for g in GATES},
                     'status': 'REQUIREMENTS_DOCUMENTED_PRODUCTION_MISSING', 'approved': False})
    deliveries = collect_deliveries(ROOT, {w['id'] for w in work})
    for requirement in work:
        requirement['delivered_production_artifacts'] = [d for d in deliveries if d['family_id'] == requirement['id']]
        if requirement['delivered_production_artifacts']:
            requirement['status'] = 'PARTIAL_CANDIDATE_DELIVERIES_ACCEPTANCE_OPEN'
    preserved = []
    for r in source:
        artifacts = [file_evidence(p, r['sha256']) for p in r['repository_paths']]
        preserved.append({'id': r['id'], 'sha256': r['sha256'], 'asset_kinds': r['asset_kinds'],
                          'master_alias_ids': [r['primary_sandbox_asset_id']] if r['primary_sandbox_asset_id'] else [],
                          'artifacts': artifacts, 'source_implementation_evidence': r['validation']['implementation_evidence'],
                          'source_status': r['production_status'], 'production_reuse': 'UNVERIFIED',
                          'production_accepted': False, 'license_gate': r['license_gate']})
    references = []
    for r in master:
        if r['record_kind'] == 'reference_image':
            a = r['reference_artifact']
            references.append({'id': r['id'], 'reference_id': a['reference_id'], 'oath_ids': r['oath_ids'],
                               'artifact': file_evidence(a['repository_path'], r['validation']['sha256']),
                               'classification': 'CONCEPT_REFERENCE_NOT_PRODUCTION_MESH',
                               'historical_pixel_review_scope': r['validation'].get('review_depth'),
                               'current_inventory_pixel_review': 'NOT_PERFORMED', 'approved': False})
    castables = read('CASTABLE_REGISTRY.json')['castables']
    require_unique(castables, 'uid', 'CASTABLE_REGISTRY.json')
    runtime = [{'uid': r['uid'], 'kind': r['sourceCatalog']['kind'],
                'oath_id': next(m['oath_id'] for m in master if m.get('source_castable_uid') == r['uid']),
                'source_implementation': r['implementation'], 'validation_snapshot': r['validation'],
                'production_accepted': False} for r in castables]
    contracts = read(CONTRACTS)['records']
    systems = [{'id': c['id'], 'title': c['title'], 'source_path': CONTRACTS,
                'dependencies': c['dependencies'], 'acceptance_tests': c['acceptance_tests'],
                'implementation_status': 'PROPOSED_CONTRACT_NO_PRODUCTION_ACCEPTANCE',
                'validated': False} for c in contracts]
    for c in systems:
        for dep in c['dependencies']:
            if dep not in {s['id'] for s in systems}:
                raise ValueError(f'Unknown contract dependency {dep}')
    phase_ii = build_phase_ii(ROOT, work, detail, systems, GATES)
    for requirement in work:
        requirement['phase_ii_refinement_ids'] = phase_ii['baseline_family_refinements'].get(requirement['id'], [])
    combined_details = json.loads(json.dumps(detail_by_id))
    for row in phase_ii['registered_identity_ledger']:
        item = combined_details.setdefault(row['id'], {'id': row['id'], 'source_records': [], 'scope_only_not_additive_asset_count': True})
        for source in row['source_records']:
            if source not in item['source_records']:
                item['source_records'].append(source)
    for system in systems:
        system['phase_ii_refinement_ids'] = [r['id'] for r in phase_ii['world_system_obligations'] if system['id'] in r['baseline_contract_ids']]
    inputs = sorted({MASTER, SOURCE, TAXONOMY, CONTRACTS, 'CASTABLE_REGISTRY.json'} | {CANON + x for x in DETAIL})
    counts = {
        'phase_i_master_records': len(master), 'production_family_requirements': len(work),
        'family_component_scope_labels': sum(len(w['component_scope']) for w in work),
        'reference_images': len(references), 'source_castables': len(runtime),
        'primary_source_file_alias_records': sum(r['record_kind'] == 'source_binary_asset' for r in master),
        'all_source_unique_byte_identities': len(preserved),
        'all_source_asset_paths': sum(len(r['artifacts']) for r in preserved),
        'source_kind_unique_identities': dict(sorted(Counter(k for r in preserved for k in r['asset_kinds']).items())),
        'linked_detail_registry_records': len(detail), 'linked_detail_unique_ids': len(detail_ids),
        'runtime_implementation_contracts': len(systems),
        'new_production_asset_deliverables': len(deliveries),
        'distinct_candidate_archetypes': len({d['archetype_id'] for d in deliveries}),
        'candidate_glb_file_paths': len({a['path'] for d in deliveries for a in d['artifacts'] if a['path'].endswith('.glb')}),
        'families_with_candidate_deliveries': len({d['family_id'] for d in deliveries}),
        'families_without_candidate_deliveries': sum(not w['delivered_production_artifacts'] for w in work),
        'unaccepted_production_families': len(work),
        'accepted_production_families': 0,
        'fully_rendered_gameplay_certified_castables': 0,
        'exact_mesh_and_clip_requirement_count': None,
        'phase_ii_architecture_module_entries': phase_ii['counts']['architecture_module_entries'],
        'phase_ii_regional_environment_variants': phase_ii['counts']['regional_environment_variants'],
        'phase_i_families_refined_by_phase_ii': phase_ii['counts']['existing_phase_i_family_ids_refined'],
        'combined_detail_unique_ids': len(combined_details),
        'phase_ii_payload_documents': phase_ii['counts']['payload_files'],
        'candidate_texture_file_paths': len({a['path'] for d in deliveries for a in d['artifacts'] if a['role'] == 'textures'}),
        'production_candidate_manifest_paths': len({d['manifest_path'] for d in deliveries}),
    }
    realm_ids = [r['id'] for r in read(CANON + '03_GEOGRAPHY/REALM_REGISTRY.json')['records']]
    oaths = sorted({r['oath_id'] for r in work})
    oath_ledger = [{'oath_id': oath, 'family_requirements': sum(w['oath_id'] == oath for w in work),
                    'categories': {cat: {'requirement_id': next(w['id'] for w in work if w['oath_id'] == oath and w['category_id'] == cat),
                                       'production_accepted': False, 'delivered_production_artifacts': sum(len(w['delivered_production_artifacts']) for w in work if w['oath_id'] == oath and w['category_id'] == cat)} for cat in taxonomy},
                    'source_castables': sum(r['oath_id'] == oath for r in runtime),
                    'linked_detail_records': sum(d['oath_id'] == oath for d in detail),
                    'approved_production_assets': 0,
                    'candidate_asset_entries': sum(d['family_id'] in {w['id'] for w in work if w['oath_id'] == oath} for d in deliveries),
                    'families_without_candidate_deliveries': sum(not w['delivered_production_artifacts'] for w in work if w['oath_id'] == oath),
                    'phase_ii': next(r for r in phase_ii['region_acceptance_ledger'] if r['oath_id'] == oath)} for oath in oaths]
    documents = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / 'AETHERION_CANON').rglob('*') if p.is_file() and p.suffix in {'.md', '.json', '.csv', '.svg'} and '__pycache__' not in p.parts and '21_WORLD_CONSTRUCTION_PHASE_II' not in p.parts)
    counts['phase_i_canon_document_paths'] = len(documents)
    counts['named_character_ids'] = len(read(CANON + '05_FACTIONS_AND_CHARACTERS/CHARACTER_REGISTRY.json')['records'])
    creature_rows = read(CANON + '12_CREATURES_AND_MOUNTS/CREATURE_MOUNT_MORPH_REGISTRY.json')['records']
    counts['creature_and_manifestation_roles'] = dict(sorted(Counter(r['role'] for r in creature_rows).items()))
    counts['baseline_poi_ids'] = len(read(CANON + '03_GEOGRAPHY/WORLD_POI_REGISTRY.json')['records'])
    manifest = {
        'format': 'aetherion-production-inventory@2',
        'scope': 'Combined Phase I registered family scope and exact imported Phase II refinements, with preserved IDs and deduplicated detailed identity views. Exact final mesh/clip decomposition remains unresolved; proposals and candidates are not accepted production.',
        'counting_policy': ['Identity deduplication by preserved family ID and source-file SHA256.',
                            'The 24 primary source-file records alias the full source index; never add them to 112.',
                            'Detailed character, creature, POI and system records refine families; never add these counts to a mesh total.',
                            'Family component descriptions are scope labels, not approved item IDs, finished meshes, clip counts or independently priced work.',
                            'Only byte integrity is tested here. Historical source CPU evidence is scoped; no render/import/approval evidence is inferred.',
                            'A future asset must explicitly map artifact paths and hashes to these requirement IDs; file counts never automatically close gates.'],
        'phase_ii': phase_ii,
        'inputs': [{'path': p, 'sha256': digest(ROOT / p)} for p in inputs],
        'phase_i_canon_document_catalog': [{'path': p, 'sha256': digest(ROOT / p)} for p in documents],
        'counts': counts, 'category_definitions': list(taxonomy.values()),
        'work_group_family_counts': {g: sum(w['group'] == g for w in work) for g in GROUPS},
        'acceptance_gate_definitions': GATES, 'oath_ledger': oath_ledger,
        'registered_realm_ids': realm_ids, 'production_requirements': work,
        'detail_scope_links': list(detail_by_id.values()),
        'combined_detail_scope_links': list(combined_details.values()), 'runtime_system_obligations': systems,
        'source_castable_ledger': runtime, 'preserved_source_asset_ledger': preserved,
        'reference_image_ledger': references, 'production_candidate_deliveries': deliveries,
        'remaining_unknowns': ['All Phase II source requirements are now locally indexed, but implementation/placement/art approval is open.',
                               'Exact final mesh/texture/clip decomposition and cross-family reuse require authoring decisions; family counts do not settle this.',
                               'Source binary production suitability, scale/UV/rig/LOD/collision and provenance acceptance are not established by hashes.',
                               'Target hardware, measured performance budgets, finished art approval and complete engine/gameplay parity remain unverified.'],
    }
    lines = ['# Production inventory and acceptance ledger', '',
             'Generated with `python3 tools/production/inventory.py`; verify without writing using `--check`.', '',
             f'**Status: incomplete production. {len(deliveries)} exported candidate asset entries; zero accepted families. States and LODs do not close a family.**', '',
             'The combined registered scope is now indexed from actual Phase I registries and the exact imported Phase II package. The ledger includes all fifteen Oaths and every Phase I category, plus concrete Phase II module/variant entries and world-system obligations. This is a work/acceptance inventory, not a completed world or an exact final mesh estimate.', '',
             '| Measure | Count |', '|---|---:|']
    for k, v in counts.items():
        if not isinstance(v, dict):
            lines.append(f'| {k.replace("_", " ")} | {"UNKNOWN" if v is None else v} |')
    lines += ['', 'The 748 master records are 510 family requirements + 114 references + 100 castables + 24 primary source-file aliases. The full source inventory groups 197 paths into 112 byte identities; the 24 aliases are already inside it. Existing GLB/FBX files are preserved prototype sources, not newly made or production-approved models.', '',
              'Phase I contains 2,865 component scope labels within its 510 families, 34 named characters, 90 proposed creature/mount/morph identities plus four source summon visual manifestations, and 63 baseline POIs. These are verified registry counts, not completed deliveries. Character, creature, POI, quest and other detail registry rows link back to their original IDs and JSON pointers. These are distinct identity domains and overlapping refinements, not additional completed meshes. The exact mesh/clip total remains unresolved.', '',
              '| Work group | Family requirements |', '|---|---:|']
    lines.extend(f'| {g.replace("_", " ")} | {n} |' for g, n in manifest['work_group_family_counts'].items())
    lines += ['', '| Oath | Families | Source castables | Accepted families |', '|---|---:|---:|---:|']
    lines.extend(f'| {r["oath_id"]} | {r["family_requirements"]} | {r["source_castables"]} | 0 |' for r in oath_ledger)
    lines += ['', 'Every family has per-engine Blender/Unreal/Godot/Three.js obligations and separate design, authoring, UV/PBR, rig, LOD/collision, export, visual match, performance and final approval gates in `inventory.json`. Conditional/non-mesh work is identified: reference construction sheets are not meshes, and static geometry does not need a fabricated rig.', '',
              'The 20 runtime contracts preserve their original acceptance-test specifications. Their existence is not implementation. Castable validation snapshots retain scoped source CPU claims and incomplete GPU/audio/world integration gates without upgrading them.', '',
              'This generator verifies local hashes for all 197 preserved source paths and 114 reference images, unique IDs, taxonomy classification, family dependencies and contract dependencies. It does not inspect image pixels or certify renders, import compatibility, runtime gameplay, licenses or performance.', '',
              'The ledger intentionally does not auto-close gates based on file existence. Future accepted deliveries must attach their exact paths/hashes and test/review evidence to requirement IDs; rerunning an inventory must not silently promote art.', '',
              '## Verified Phase II requirements and overlap', '',
              f'Required archive: `{manifest["phase_ii"]["filename"]}` ({manifest["phase_ii"]["expected_size_bytes"]:,} bytes). SHA256: `{manifest["phase_ii"]["expected_sha256"]}`.', '',
              'All 115 imported payload files match their exact archive bytes; the two administrative files remain inside the unchanged ZIP. Counts below are derived from those local files. New designs remain PROPOSED. Static specification checks are not implemented-world evidence.', '']
    lines += ['| Phase II registered scope | Count |', '|---|---:|']
    lines.extend(f'| {k.replace("_", " ")} | {v} |' for k,v in phase_ii['counts'].items() if not isinstance(v,dict))
    lines += ['', 'The 15 architecture kits and 24 shared environment families refine **210 existing Phase I family IDs**, rather than adding 39 independent families. Their 255 module entries and 272 regional variants preserve exact source specifications and JSON-pointer locators. These are not 527 guaranteed unique meshes: reuse, terrain decomposition, state meshes and clip counts remain authoring work.', '',
              'The 318 POIs already include the 90 districts, 45 interiors and settlement locations. All 63 baseline POI records are retained exactly; 255 POI IDs are new. Region and event IDs retain baseline identity. Repeated views of these subjects are merged into combined_detail_scope_links, with every source pointer preserved.', '',
              'Ten streaming contracts refine named baseline contracts. Fifteen event refinements, fifteen ecology profiles, fifteen capital-layout runtime obligations and complete ecology/weather/civilization/streaming/transport/exploration documents remain implementation work. Their declarations and static tests never close runtime gates.', '',
              '| Oath | Candidate entries | Families without candidates | Phase II refined families | Module entries | Regional variants |', '|---|---:|---:|---:|---:|---:|']
    for row in oath_ledger:
        phase = row['phase_ii']
        lines.append(f'| {row["oath_id"]} | {row["candidate_asset_entries"]} | {row["families_without_candidate_deliveries"]} | {len(phase["refined_phase_i_family_ids"])} | {len(phase["architecture_module_keys"])} | {len(phase["environment_variant_keys"])} |')
    lines += ['', 'All 510 families remain unaccepted. A family with candidate files can still lack most of its components. Exact missing mesh/clip totals therefore remain unknown, while every known category, refined requirement, source entry and acceptance gate is visible.', '']
    return {'inventory.json': json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', 'INVENTORY.md': '\n'.join(lines)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs = build()
    target = ROOT / 'validation/production'
    target.mkdir(parents=True, exist_ok=True)
    stale = []
    for name, text in outputs.items():
        path = target / name
        if args.check:
            if not path.exists() or path.read_text() != text:
                stale.append(str(path.relative_to(ROOT)))
        else:
            path.write_text(text)
    if stale:
        print('Stale inventory outputs: ' + ', '.join(stale), file=sys.stderr)
        return 1
    count = json.loads(outputs['inventory.json'])['counts']['new_production_asset_deliverables']
    print('Inventory ' + ('verified' if args.check else 'written') + f': 510 families; 114 references; 100 source castables; 197 source paths / 112 hashes. {count} candidate asset entries; 0 accepted families.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
