"""Static-only Phase II planning validation; no engine/world simulation runs here."""
import argparse,copy,json,pathlib
from jsonschema import Draft202012Validator

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--package',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1])
    ap.add_argument('--baseline',type=pathlib.Path,required=True)
    ap.add_argument('--output',type=pathlib.Path)
    args=ap.parse_args(); p=args.package
    data=json.loads((p/'STREAMING_PROTOTYPE_CONTRACTS.json').read_text())
    schema=json.loads((p/'schemas/streaming-prototype-contracts.schema.json').read_text())
    Draft202012Validator.check_schema(schema); v=Draft202012Validator(schema)
    errors=list(v.iter_errors(data)); checks=[]
    def check(name,condition,detail): checks.append({'check':name,'status':'PASS' if condition else 'FAIL','detail':detail})
    check('strict_schema',not errors,'Draft 2020-12; '+str(len(errors))+' errors')
    records=data['records']; ids=[x['id'] for x in records]
    check('unique_record_ids',len(ids)==len(set(ids)),'Ten distinct pilot-anchored planning contract IDs')
    baseline=json.loads((args.baseline/'AETHERION_CANON/18_IMPLEMENTATION_CONTRACTS/IMPLEMENTATION_CONTRACTS.json').read_text())
    known={x['id'] for x in baseline['records']}
    missing=sorted({x for r in records for x in r['baseline_contract_ids'] if x not in known})
    check('baseline_contract_reference_closure',not missing,'Unresolved: '+str(missing))
    expected={'region-%02d'%i for i in range(1,16)}
    check('all_region_scope',all(set(r['scope_regions'])==expected for r in records),'Region-09 ID prefix denotes pilot, not exclusive territorial scope')
    check('honest_acceptance_status',all(r['acceptance_status']=='SPECIFIED_NOT_EXECUTED' and r['interface_status']=='PROPOSED_NOT_EXISTING_API' for r in records),'No runtime, engine, terrain, network or save implementation claim')
    negative=[]
    bad=copy.deepcopy(data);bad['records'][0]['imaginary_implemented_api']=True;negative.append(('unknown_field',bad))
    bad=copy.deepcopy(data);bad['records'][0]['acceptance_status']='PASS';negative.append(('false_runtime_pass',bad))
    bad=copy.deepcopy(data);bad['records'][0]['scope_regions'][-1]='region-16';negative.append(('sixteenth_region',bad))
    bad=copy.deepcopy(data);del bad['records'][0]['failure_cases'];negative.append(('missing_failure_cases',bad))
    for name,bad in negative:check('negative_fixture_'+name,bool(list(v.iter_errors(bad))),'Mutated copy rejected; delivered records unchanged')
    report={'schema_version':'1.0.0','report_kind':'STATIC_PLANNING_VALIDATION','baseline_commit':'5dce9edae0bb3587eb7c72433395e7d5a19857ea','record_count':len(records),'checks':checks,'result':'PASS' if all(x['status']=='PASS' for x in checks) else 'FAIL','unexecuted':['Engine selection and implementation','GPU/browser/source visual parity','Terrain generation and measured route traversal','Streaming/rebase/nav failure injection','Multiplayer/save/crash-recovery execution','Cross-platform profiling and human art/accessibility acceptance'],'gaps':['Target engine, devices and world scale unapproved','Production assets and commercial clearance incomplete','Numerical hypotheses require prototype measurements']}
    if args.output:args.output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    return 0 if report['result']=='PASS' else 1
if __name__=='__main__':raise SystemExit(main())
