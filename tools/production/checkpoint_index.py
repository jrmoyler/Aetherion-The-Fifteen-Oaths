#!/usr/bin/env python3
"""List delivered design IDs separately from state/export multiplicity."""
from pathlib import Path
import collections
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
groups = collections.defaultdict(list)
refs = {}
for path in sorted((ROOT / 'assets/production').rglob('manifest.json')):
    manifest = json.loads(path.read_text())
    for asset in manifest['assets']:
        key = asset.get('archetypeId', asset['id'])
        groups[key].append({**asset, 'familyId': manifest['familyId'], 'manifest': str(path.relative_to(ROOT))})
        refs[key] = manifest.get('referenceIds', [])
records = []
for design_id, assets in groups.items():
    files = collections.defaultdict(set)
    for asset in assets:
        for role, value in asset['files'].items():
            files[role].update(value if isinstance(value, list) else [value])
    bones = max((a['rig'].get('boneCount', a['rig'].get('bones', 0)) if isinstance(a.get('rig'), dict) else 0) for a in assets)
    clips = sorted({c if isinstance(c, str) else c['name'] for a in assets for c in a.get('animations', [])})
    records.append({'design_id': design_id, 'family_id': assets[0]['familyId'], 'asset_ids': [a['id'] for a in assets],
        'references': refs[design_id], 'bone_count_per_design': bones, 'clip_names': clips,
        'files': {k: [{'path': p, 'sha256': hashlib.sha256((ROOT / p).read_bytes()).hexdigest()} for p in sorted(v)] for k,v in files.items()},
        'acceptance': 'UNAPPROVED', 'remaining_gates': sorted({g for a in assets for g in a.get('remainingGates', [])})})
summary = {'designs': len(records), 'manifest_entries': sum(len(r['asset_ids']) for r in records),
    'rigged_designs': sum(r['bone_count_per_design'] > 0 for r in records),
    'bones_across_distinct_designs': sum(r['bone_count_per_design'] for r in records),
    'design_clip_pairs': sum(len(r['clip_names']) for r in records), 'production_approved': 0}
(ROOT / 'validation/production/DELIVERED_DESIGNS.json').write_text(json.dumps({'scope': 'Actual candidate designs; variants, LODs, collision exports and clip copies do not count as additional designs.', 'summary': summary, 'designs': records}, indent=2)+'\n')
lines = ['# Delivered candidate designs', '', f"**{summary['designs']} designs; {summary['manifest_entries']} state/configuration entries; {summary['rigged_designs']} rigged designs; {summary['design_clip_pairs']} distinct design/clip pairs.** No production approvals.", '', 'Exact IDs, all source/texture/export paths and SHA-256 hashes are in [DELIVERED_DESIGNS.json](DELIVERED_DESIGNS.json). This table links every editable source and candidate render; repeated state sources are not distinct designs. The [render review index](../../docs/production/RENDER_REVIEW_INDEX.md) links original reference pixels and observed quality gaps.', '', '| Design ID | Manifest asset IDs | Editable sources | Bones / clips | Candidate view |', '| --- | --- | --- | --- | --- |']
for r in records:
    blends = '<br>'.join(f"[{Path(f['path']).name}](../../{f['path']})" for f in r['files']['blend'])
    view = r['files']['renders'][0]['path']
    lines.append(f"| `{r['design_id']}` | "+'<br>'.join(f'`{i}`' for i in r['asset_ids'])+f" | {blends} | {r['bone_count_per_design']} / {len(r['clip_names'])} | [Render](../../{view}) |")
(ROOT / 'validation/production/DELIVERED_DESIGNS.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(summary))
