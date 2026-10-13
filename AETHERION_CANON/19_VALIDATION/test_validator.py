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
   root=pathlib.Path(tmp)/'canon';shutil.copytree(HERE.parent,root)
   mutate(root)
   out=pathlib.Path(tmp)/'report.json'
   proc=subprocess.run([sys.executable,str(root/'19_VALIDATION/validate_canon.py'),'--repo',str(REPO),'--canon',str(root),'--output',str(out)],capture_output=True,text=True)
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
