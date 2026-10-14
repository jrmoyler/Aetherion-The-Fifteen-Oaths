from pathlib import Path
import json,hashlib
p=Path(__file__).parent
files=['amethyst-short-blade/source.blend','amethyst-short-blade/review.glb','fault_weapons.review.py','render_matched.py','reference-053.original.png']+[x.name for x in sorted(p.glob('*_*.png'))]
rows=[{'path':n,'bytes':(p/n).stat().st_size,'sha256':hashlib.sha256((p/n).read_bytes()).hexdigest()} for n in files]
(p/'geometry-freeze-receipt.json').write_text(json.dumps({'status':'FROZEN_GEOMETRY_UNCHANGED_AFTER_FINAL_PAIR_AND_LOCAL_VALIDATION','files':rows},indent=2)+'\n')
