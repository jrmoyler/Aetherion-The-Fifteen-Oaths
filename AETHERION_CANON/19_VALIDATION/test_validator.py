"""Negative fixtures ensure validation gates reject corrupted canon.
Run: python -m unittest discover -s AETHERION_CANON/19_VALIDATION -p test_validator.py
AETHERION_REPO may override repository root while authoring in staging.
"""
import json,os,pathlib,shutil,subprocess,sys,tempfile,unittest
HERE=pathlib.Path(__file__).resolve().parent
REPO=pathlib.Path(os.environ.get('AETHERION_REPO',str(HERE.parent.parent)))
class ValidatorNegativeFixtures(unittest.TestCase):
 def run_mutation(self,mutate,expected):
  with tempfile.TemporaryDirectory(prefix='aetherion-negative-') as tmp:
   root=pathlib.Path(tmp)/'AETHERION_CANON';shutil.copytree(HERE.parent,root)
   # Preserve repository-relative links for the positive fixture without copying
   # or mutating protected source files. Only the disposable canon is edited.
   for sibling in REPO.iterdir():
    if sibling.name not in ('AETHERION_CANON','.git'):
     (pathlib.Path(tmp)/sibling.name).symlink_to(sibling,target_is_directory=sibling.is_dir())
   mutate(root)
   out=pathlib.Path(tmp)/'report.json'
   proc=subprocess.run([sys.executable,str(root/'19_VALIDATION/validate_canon.py'),'--repo',str(REPO),'--canon',str(root),'--output',str(out)],capture_output=True,text=True)
   if expected is None:self.assertEqual(proc.returncode,0,proc.stdout)
   else:
    self.assertNotEqual(proc.returncode,0,proc.stdout)
    report=json.loads(out.read_text());self.assertTrue(any(c['id']==expected and c['status']=='FAIL' for c in report['checks']),proc.stdout)
 def promote(self,root,kind):
  p=root/'10_ASSET_REGISTRY/MASTER_ASSET_REGISTRY.json';d=json.loads(p.read_text());next(r for r in d['records'] if r['record_kind']==kind)['production_status']='Implemented';p.write_text(json.dumps(d))
 def test_concept_cannot_claim_implementation(self):self.run_mutation(lambda r:self.promote(r,'production_family_requirement'),'no-concept-implementation-claims')
 def test_reference_cannot_claim_implementation(self):self.run_mutation(lambda r:self.promote(r,'reference_image'),'no-concept-implementation-claims')
 def test_unknown_evidence_is_rejected(self):
  def mutate(root):
   p=root/'20_PRODUCTION_ROADMAP/IMPLEMENTATION_BACKLOG.json';d=json.loads(p.read_text());d['records'][0]['source_ids'].append('SRC-NOT-REAL');p.write_text(json.dumps(d))
  self.run_mutation(mutate,'source-traceability')
 def append_source(self,root,file,source):
  p=root/file;d=json.loads(p.read_text());d['records'][0]['source_ids'].append(source);p.write_text(json.dumps(d))
 def test_phase_ii_unknown_source_is_rejected(self):
  self.run_mutation(lambda r:self.append_source(r,'21_WORLD_CONSTRUCTION_PHASE_II/WORLD_REGION_GRAPH.json','P2-SRC-NOT-DECLARED'),'source-traceability')
 def test_phase_ii_source_outside_subtree_is_rejected(self):
  self.run_mutation(lambda r:self.append_source(r,'20_PRODUCTION_ROADMAP/IMPLEMENTATION_BACKLOG.json','P2-SRC-DIRECTIVE'),'source-traceability')
 def test_phase_ii_source_in_similar_prefix_is_rejected(self):
  def mutate(root):
   p=root/'21_WORLD_CONSTRUCTION_PHASE_II_OTHER/fixture.json';p.parent.mkdir();p.write_text(json.dumps({'source_ids':['P2-SRC-DIRECTIVE']}))
  self.run_mutation(mutate,'source-traceability')
 def test_removed_phase_ii_source_declaration_is_rejected(self):
  def mutate(root):
   p=root/'21_WORLD_CONSTRUCTION_PHASE_II/SOURCE_INVENTORY.json';d=json.loads(p.read_text());d['records']=[r for r in d['records'] if r['id']!='P2-SRC-DIRECTIVE'];p.write_text(json.dumps(d))
  self.run_mutation(mutate,'source-traceability')
 def test_phase_ii_uses_actual_local_inventory(self):
  def mutate(root):
   p=root/'21_WORLD_CONSTRUCTION_PHASE_II/SOURCE_INVENTORY.json';d=json.loads(p.read_text());record=d['records'][0].copy();record['id']='P2-SRC-TEST-FIXTURE';d['records'].append(record);p.write_text(json.dumps(d))
   self.append_source(root,'21_WORLD_CONSTRUCTION_PHASE_II/WORLD_REGION_GRAPH.json','P2-SRC-TEST-FIXTURE')
  self.run_mutation(mutate,None)
 def test_duplicate_interaction_is_rejected(self):
  def mutate(root):
   p=root/'07_GAMEPLAY_SYSTEMS/INTERACTION_RULES.json';d=json.loads(p.read_text());d['records'][1]=d['records'][0].copy();p.write_text(json.dumps(d))
  self.run_mutation(mutate,'all-element-pairs')
 def test_one_way_border_is_rejected(self):
  def mutate(root):
   p=root/'01_WORLD_BIBLE/ENTITY_CONTRACT.json';d=json.loads(p.read_text());d['records'][0]['neighbor_ids']=[];p.write_text(json.dumps(d))
  self.run_mutation(mutate,'symmetric-borders')
 def test_source_screenshot_cannot_claim_implementation(self):
  def mutate(root):
   p=root/'10_ASSET_REGISTRY/SOURCE_ASSET_INDEX.json';d=json.loads(p.read_text());next(r for r in d['records'] if 'source_screenshot' in r['asset_kinds'])['production_status']='Implemented';p.write_text(json.dumps(d))
  self.run_mutation(mutate,'source-screenshot-status')
 def test_private_source_locator_is_rejected(self):
  def mutate(root):
   p=root/'00_GOVERNANCE/SOURCE_TRACEABILITY.json';d=json.loads(p.read_text());d['records'][0]['location']='https:'+'//chatgpt.com/c/'+'private-test-locator';p.write_text(json.dumps(d))
  self.run_mutation(mutate,'public-provenance-minimization')
if __name__=='__main__':unittest.main()
