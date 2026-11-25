"""No provider operations: current cost-only authorization and orchestration contracts."""
import importlib.util,json,tempfile,time,unittest,hashlib
from urllib.error import URLError,HTTPError
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch,Mock
spec=importlib.util.spec_from_file_location('ctl',Path(__file__).with_name('nuknuk-beta-run.py'));ctl=importlib.util.module_from_spec(spec);spec.loader.exec_module(ctl)
class Contracts(unittest.TestCase):
 def test_deadline_is_only_cost_derived_and_exceeds_six_hours(self):
  end=ctl.catalog_budget(100,0,2.9)
  self.assertAlmostEqual(end,100+45/2.9*3600);self.assertGreater(end-100,21600)
  self.assertAlmostEqual(ctl.catalog_budget(100,5,4),100+40/4*3600)
  for values in [(0,45,3),(0,-1,3),(0,0,0),(0,0,float('nan'))]:
   with self.assertRaises(ValueError):ctl.catalog_budget(*values)
 def test_capacity_allows_h100_or_h200_only(self):
  rows=[{'id':name,'secure':True,'memory':memory,'availability':'MEDIUM','price':{'secure':rate}}for name,memory,rate in [('NVIDIA A100-SXM4-80GB',80,2.19),('NVIDIA H100 80GB HBM3',80,4.39),('NVIDIA H100 PCIe',80,2.89),('NVIDIA H200',141,5.29),('NVIDIA H100 NVL',94,99)]]
  self.assertEqual([r['id']for r in ctl.catalog_candidates(rows)],['NVIDIA H100 PCIe','NVIDIA H100 80GB HBM3','NVIDIA H200'])
 def test_low_credit_active_resources_and_persistent_storage_fail_before_creation(self):
  billing={'balanceAmount':51};account={'currentSpendPerHr':0,'networkVolumes':[],'pods':[{'desiredStatus':'EXITED','runtime':None,'volumeInGb':0}]};ctl.catalog_validate_idle(billing,account)
  for changed_bill,changed_account in [({'balanceAmount':49},account),(billing,{**account,'currentSpendPerHr':1}),(billing,{**account,'networkVolumes':[{}]}),(billing,{**account,'pods':[{'desiredStatus':'EXITED','runtime':None,'volumeInGb':1}]})]:
   with self.assertRaises(ValueError):ctl.catalog_validate_idle(changed_bill,changed_account)
 def test_run_script_preserves_full_development_before_training_without_timeout_wrapper(self):
  script=ctl.catalog_startup_script({'parent':{'hfAdapterSha256':'a'*64}})
  self.assertLess(script.index('product-smoke'),script.index('product-evaluate'));self.assertLess(script.index('--output parent-development'),script.index(' product-train --bundle'))
  self.assertNotIn('timeout ',script);self.assertNotIn('--split TEST',script);self.assertIn('--execution-approval execution-approval.json',script)
 def test_launch_has_no_process_duration_limit(self):
  with patch.object(ctl,'ssh_call',side_effect=[b'',b'123'] )as call:
   self.assertEqual(ctl.catalog_launch(['ssh'],'true','development'),123)
   command=call.call_args.args[1];self.assertNotIn("'timeout'",command);self.assertNotIn('8400',command)
 def test_explicit_authority_binds_fifty_dollars_and_exact_bundle(self):
  with tempfile.TemporaryDirectory()as name:
   root=Path(name);bundle=root/'bundle';bundle.mkdir();(bundle/'product-gpu-manifest.json').write_text('{}');auth=root/'authority.json'
   row={'executionAuthorized':True,'totalCeilingUsd':50,'limitPolicy':'COST_ONLY_50_USD','autoPay':False,'productionActivation':False,'bundleManifestSha256':ctl.digest(b'{}')};auth.write_text(json.dumps(row));args=SimpleNamespace(execution_authorization=auth,bundle=bundle);ctl.catalog_authority(args)
   for key,value in [('totalCeilingUsd',51),('autoPay',True),('productionActivation',True),('bundleManifestSha256','wrong')]:
    auth.write_text(json.dumps({**row,key:value}))
    with self.assertRaises(ValueError):ctl.catalog_authority(args)
 def test_storage_tariff_is_current_hash_bound_and_conservative(self):
  with tempfile.TemporaryDirectory()as name:
   folder=Path(name);raw=b'<table><tr><td>Container disk</td><td>$0.10/GB/month</td></tr></table>';(folder/'runpod-pricing.html').write_bytes(raw)
   receipt={'sourceUrl':'https://docs.runpod.io/pods/pricing','fetchedAtEpoch':time.time(),'sourceFile':'runpod-pricing.html','sourceSha256':hashlib.sha256(raw).hexdigest(),'containerDiskUsdPerGbMonth':.10,'conservativeMonthHours':672,'billingGranularitySeconds':1};path=folder/'storage.json';path.write_text(json.dumps(receipt));rate,_=ctl.catalog_storage_rate(path);self.assertAlmostEqual(rate,20/672)
   path.write_text(json.dumps({**receipt,'containerDiskUsdPerGbMonth':0}))
   with self.assertRaises(ValueError):ctl.catalog_storage_rate(path)
   path.write_text(json.dumps({**receipt,'fetchedAtEpoch':0}))
   with self.assertRaises(ValueError):ctl.catalog_storage_rate(path)
 def test_cleanup_waits_for_delayed_deletion_and_three_consistent_account_reads(self):
  with tempfile.TemporaryDirectory()as name:
   folder=Path(name);state={'runName':'run','podId':'abc12345678','preexistingPodIds':[]};(folder/'state.json').write_text(json.dumps(state));ctl.catalog_attempt_event(folder,'CREATE_INTENT',runName='run');ctl.catalog_attempt_event(folder,'POD_ACKNOWLEDGED',runName='run',podId='abc12345678')
   pod={'id':'abc12345678','name':'run','desiredStatus':'RUNNING','runtime':{},'volumeInGb':0};snapshots=[({'balanceAmount':50},{'currentSpendPerHr':2.9,'networkVolumes':[],'pods':[pod]})]*2+[({'balanceAmount':50},{'currentSpendPerHr':0,'networkVolumes':[],'pods':[]})]*3
   reads=[0]
   def api(key,method,path,payload=None,**kwargs):
    if method=='DELETE':return None
    reads[0]+=1
    if reads[0]<=2:return {'id':'abc12345678'}
    raise HTTPError('https://api.runpod.io',404,'not found',{},None)
   with patch.object(ctl,'catalog_account',side_effect=snapshots)as account,patch.object(ctl,'rest',side_effect=api),patch.object(ctl.watch,'stop')as stop,patch.object(ctl.time,'sleep'):
    ctl.catalog_cleanup(SimpleNamespace(key_file=folder/'key'),folder);self.assertEqual(account.call_count,5);self.assertEqual(stop.call_count,0)
 def lost_creation_fixture(self,delayed):
  with tempfile.TemporaryDirectory()as name:
   folder=Path(name);bundle=folder/'bundle';bundle.mkdir();catalog=folder/'catalog';catalog.mkdir();(catalog/'manifest.json').write_text(json.dumps({'catalogHash':'dataset'}));(catalog/'test-inference-inputs.json').write_text('{}');(bundle/'product-gpu-manifest.json').write_text('{}');op=folder/'op';op.mkdir();(op/'guard.ready').write_text('1');wheel=folder/'runtime.whl';wheel.write_bytes(b'wheel')
   manifest={'limitPolicy':'COST_ONLY_50_USD','sourceManifestSha256':ctl.digest((catalog/'manifest.json').read_bytes()),'datasetHash':'dataset','testRequestPacketSha256':ctl.digest(b'{}'),'files':{},'parent':{'hfAdapterSha256':'a'*64},'image':'pinned','recipe':{'optimizerUpdates':470,'trainingRows':2350}}
   module=SimpleNamespace(verify_product_gpu_bundle=lambda path:manifest);loader=Mock(exec_module=lambda module:None)
   quote={'id':'NVIDIA H100 PCIe','secure':True,'memory':80,'availability':'HIGH','price':{'secure':2.89}}
   authority={'llguidanceWheelSha256':ctl.digest(b'wheel')};args=SimpleNamespace(operation=op,bundle=bundle,catalog_package=catalog,execution_authorization=folder/'authority',private_key=folder/'private',public_key=folder/'public',storage_tariff=folder/'storage',llguidance_wheel=wheel,key_file=folder/'key');args.public_key.write_text('ssh-ed25519 SYNTHETIC');args.storage_tariff.write_text('{}')
   billing={'billingMode':'PREPAID','balanceAmount':51};account={'currentSpendPerHr':0,'networkVolumes':[],'pods':[]};pod={'id':'abc12345678','name':'bound','desiredStatus':'RUNNING','runtime':{},'costPerHr':2.89}
   def api(key,method,path,payload=None,**kwargs):
    if method=='POST':raise URLError('lost create reply')
    if path=='/v2/account':return {'id':'account'}
    if 'catalog/gpus'in path:return [quote]
    if 'billing/balance'in path:return billing
    raise ValueError('unexpected mock API')
   guard=Mock();guard.poll.return_value=None
   discoveries=[None,None,pod,None]if delayed else [None]*6
   with patch.object(ctl,'catalog_authority',return_value=authority),patch.object(ctl,'catalog_storage_rate',return_value=(.03,{})),patch.object(ctl.importlib.util,'spec_from_file_location',return_value=SimpleNamespace(loader=loader)),patch.object(ctl.importlib.util,'module_from_spec',return_value=module),patch.object(ctl,'catalog_account',return_value=(billing,account)),patch.object(ctl,'package',return_value=b'archive'),patch.object(ctl,'rest',side_effect=api)as rest,patch.object(ctl.subprocess,'Popen',return_value=guard),patch.object(ctl,'owned',side_effect=discoveries),patch.object(ctl,'catalog_cleanup')as cleanup,patch.object(ctl.time,'sleep'):
    with self.assertRaises((URLError,RuntimeError)):ctl.catalog_run(args,op)
    self.assertEqual(sum(call.args[1]=='POST'for call in rest.call_args_list),1)
    if delayed:self.assertEqual(cleanup.call_count,1);self.assertEqual(json.loads((op/'state.json').read_text())['phase'],'REMOVED')
    else:self.assertEqual(cleanup.call_count,0);guard.terminate.assert_not_called();self.assertEqual(json.loads((op/'state.json').read_text())['phase'],'ALLOCATION_UNCONFIRMED')
   self.assertTrue((op/'attempt-ledger.jsonl').exists())
 def test_lost_create_late_visibility_is_adopted_cleaned_and_never_retried(self):self.lost_creation_fixture(True)
 def test_unresolved_create_retains_guard_and_never_retries(self):self.lost_creation_fixture(False)
 def test_full_success_secures_candidate_and_cleanup_without_consuming_test_after_failed_dev(self):
  with tempfile.TemporaryDirectory()as name:
   folder=Path(name);bundle=folder/'bundle';bundle.mkdir();catalog=folder/'catalog';catalog.mkdir();(catalog/'manifest.json').write_text(json.dumps({'catalogHash':'dataset'}));(catalog/'test-inference-inputs.json').write_text('{}');(bundle/'product-gpu-manifest.json').write_text('{}');op=folder/'op';op.mkdir();(op/'guard.ready').write_text('1');wheel=folder/'runtime.whl';wheel.write_bytes(b'wheel')
   manifest={'limitPolicy':'COST_ONLY_50_USD','sourceManifestSha256':ctl.digest((catalog/'manifest.json').read_bytes()),'datasetHash':'dataset','testRequestPacketSha256':ctl.digest(b'{}'),'files':{},'parent':{'hfAdapterSha256':'a'*64},'image':'pinned','recipe':{'optimizerUpdates':470,'trainingRows':2350}};module=SimpleNamespace(verify_product_gpu_bundle=lambda path:manifest);loader=Mock(exec_module=lambda module:None)
   quote={'id':'NVIDIA H100 PCIe','secure':True,'memory':80,'availability':'HIGH','price':{'secure':2.89}};authority={'llguidanceWheelSha256':ctl.digest(b'wheel')};args=SimpleNamespace(operation=op,bundle=bundle,catalog_package=catalog,execution_authorization=folder/'authority',private_key=folder/'private',public_key=folder/'public',storage_tariff=folder/'storage',llguidance_wheel=wheel,key_file=folder/'key');args.public_key.write_text('ssh-ed25519 SYNTHETIC');args.storage_tariff.write_text('{}')
   billing={'billingMode':'PREPAID','balanceAmount':51};account={'currentSpendPerHr':0,'networkVolumes':[],'pods':[]};pod={'id':'abc12345678','name':'bound','desiredStatus':'RUNNING','runtime':{},'costPerHr':2.89};request={};gone=[False]
   target=folder/'results';(target/'training-receipts').mkdir(parents=True);(target/'output').mkdir();(target/'output/adapter_model.safetensors').write_bytes(b'synthetic-adapter');candidate=ctl.digest(b'synthetic-adapter');(target/'training-receipts/result.json').write_text(json.dumps({'datasetHash':'dataset','completedOptimizerUpdates':470,'trainingRows':2350,'adapterSha256':candidate}))
   def api(key,method,path,payload=None,**kwargs):
    if method=='POST':request.update(payload);return {'id':'abc12345678'}
    if path=='/v2/account':return {'id':'account'}
    if 'catalog/gpus'in path:return [quote]
    if 'billing/balance'in path:return billing
    if path=='/v2/pods/abc12345678':return {'id':'abc12345678','name':'bound','status':'RUNNING','cost':2.89,'image':'pinned','disk':200,'mounts':{},'locked':False,'runtime':{'ports':[{'ip':'192.0.2.1','private':22,'public':22000,'type':'tcp'}]}}
    raise ValueError('unexpected mock API')
   def ssh(transport,command,timeout=25,data=None):
    if 'cat /tmp/backyrd-guard.ready'in command:return json.dumps({'podId':'abc12345678','deadline':float(request['env']['BACKYRD_DEADLINE']),'heartbeat':time.time()}).encode()
    return b''
   ports={'pod':{'id':'abc12345678','desiredStatus':'RUNNING','volumeInGb':0,'containerDiskInGb':200,'runtime':{'ports':[{'isIpPublic':True,'privatePort':22,'publicPort':12345,'type':'tcp','ip':'192.0.2.1'}]}}}
   guard=Mock();guard.poll.return_value=None
   with patch.object(ctl,'catalog_authority',return_value=authority),patch.object(ctl,'catalog_storage_rate',return_value=(.03,{})),patch.object(ctl.importlib.util,'spec_from_file_location',return_value=SimpleNamespace(loader=loader)),patch.object(ctl.importlib.util,'module_from_spec',return_value=module),patch.object(ctl,'catalog_account',return_value=(billing,account)),patch.object(ctl,'package',return_value=b'archive'),patch.object(ctl,'rest',side_effect=api)as rest,patch.object(ctl.subprocess,'Popen',return_value=guard),patch.object(ctl,'owned',side_effect=lambda *args:None if gone[0]else pod),patch.object(ctl,'catalog_cleanup',side_effect=lambda *args:gone.__setitem__(0,True)),patch.object(ctl.time,'sleep'),patch.object(ctl.watch,'query',return_value=ports),patch.object(ctl,'ssh_call',side_effect=ssh)as upload,patch.object(ctl,'CatalogRateSync'),patch.object(ctl,'catalog_launch',return_value=123),patch.object(ctl,'catalog_monitor',return_value=target),patch.object(ctl,'catalog_compare',return_value={'comparison':{'passed':False}}):
    state=ctl.catalog_run(args,op)
    self.assertEqual(state['phase'],'REMOVED');self.assertTrue(state['resourcesRemoved']);self.assertEqual(state['candidateSha256'],candidate);self.assertFalse(state['testExecuted']);self.assertEqual(sum(call.args[1]=='POST'for call in rest.call_args_list),1);self.assertFalse(any('cat > '+ctl.REMOTE+'/test-inference-inputs.json'in call.args[1]for call in upload.call_args_list))
 def test_campaign_keeps_original_fifty_dollar_cap_across_failed_attempt(self):
  with tempfile.TemporaryDirectory()as name:
   path=Path(name)/'prior-state.json';state={'phase':'REMOVED','resourcesRemoved':True,'podId':'abc12345678','initialBalanceUsd':51.88,'heartbeat':700,'started':100,'allInHourlyRateUsd':4.5,'finalObservedDebitUsd':.33,'accountId':'account'};path.write_text(json.dumps(state));authority={'campaignId':'campaign','campaignAccountId':'account','campaignInitialBalanceUsd':51.88,'campaignPriorCostUsd':.75,'priorAttempts':[{'stateFile':str(path),'stateSha256':ctl.digest(path.read_bytes())}]}
   self.assertEqual(ctl.catalog_campaign_prior(authority),(51.88,.75))
   with self.assertRaisesRegex(ValueError,'cost_reset_refused'):ctl.catalog_campaign_prior({**authority,'campaignPriorCostUsd':0})
   state['resourcesRemoved']=False;path.write_text(json.dumps(state));authority['priorAttempts'][0]['stateSha256']=ctl.digest(path.read_bytes())
   with self.assertRaisesRegex(ValueError,'not_secured_and_removed'):ctl.catalog_campaign_prior(authority)
class Recovery(unittest.TestCase):
 def test_transient_classification_does_not_retry_unauthorized_or_invalid_data(self):
  self.assertTrue(ctl.transient_provider_error(URLError('temporary')))
  for code in [429,500,502,503]:self.assertTrue(ctl.transient_provider_error(HTTPError('https://api.runpod.io',code,'temporary',{},None)))
  for error in [ValueError('wrong identity'),HTTPError('https://api.runpod.io',401,'unauthorized',{},None),HTTPError('https://api.runpod.io',403,'forbidden',{},None)]:self.assertFalse(ctl.transient_provider_error(error))
 def test_shared_guard_grace_never_extends_cost_deadline_or_ignores_invalid_rate(self):
  state={'podId':'abc12345678','deadline':1000,'heartbeat':100,'computeRateCap':4.42}
  good={'id':state['podId'],'desiredStatus':'RUNNING','costPerHr':4.39}
  self.assertIsNone(ctl.guard_stop_reason(state,None,150,100))
  self.assertIsNone(ctl.guard_stop_reason(state,good,150,100))
  self.assertEqual(ctl.guard_stop_reason(state,None,190,100),'PROVIDER_OBSERVATION_EXPIRED')
  self.assertEqual(ctl.guard_stop_reason({**state,'heartbeat':999},None,1000,999),'COST_DEADLINE_REACHED')
  for changed,reason in [({'costPerHr':4.5},'POD_TARIFF_EXCEEDED'),({'costPerHr':float('nan')},'POD_TARIFF_EXCEEDED'),({'costPerHr':True},'POD_TARIFF_INVALID'),({'id':'other1234567'},'POD_IDENTITY_CHANGED'),({'desiredStatus':'EXITED'},'POD_NOT_RUNNING')]:
   self.assertEqual(ctl.guard_stop_reason(state,{**good,**changed},150,100),reason)
 def test_idempotent_read_retries_and_budget_deadline_stops_retries(self):
  with tempfile.TemporaryDirectory()as name:
   folder=Path(name);(folder/'state.json').write_text(json.dumps({'phase':'DEVELOPMENT','deadline':1000}))
   read=Mock(side_effect=[URLError('temporary'),{'ok':True}])
   with patch.object(ctl.time,'time',return_value=100),patch.object(ctl.time,'sleep'):
    self.assertEqual(ctl.catalog_read_retry(read,folder),{'ok':True});self.assertEqual(read.call_count,2)
   with patch.object(ctl.time,'time',return_value=1000):
    with self.assertRaisesRegex(ValueError,'cost_budget_reached'):ctl.catalog_read_retry(read,folder)
   self.assertEqual(read.call_count,2)
 def test_cost_check_accepts_single_missing_runtime_but_rejects_real_tariff(self):
  with tempfile.TemporaryDirectory()as name:
   folder=Path(name);state={'phase':'DEVELOPMENT','deadline':1000,'podId':'abc12345678','preexistingPodIds':[],'started':100,'initialBalanceUsd':51,'allInHourlyRateUsd':4.45,'computeRateCap':4.42};(folder/'state.json').write_text(json.dumps(state))
   pod={'id':state['podId'],'desiredStatus':'RUNNING','costPerHr':4.39,'runtime':{}}
   account={'pods':[pod],'networkVolumes':[]};args=SimpleNamespace(key_file=folder/'key')
   with patch.object(ctl,'catalog_account',return_value=({'balanceAmount':50},{**account,'pods':[{**pod,'runtime':None}]})),patch.object(ctl,'owned',return_value=pod),patch.object(ctl.time,'time',return_value=150),patch.object(ctl.time,'sleep'):
    ctl.catalog_cost_check(args,folder)
   with patch.object(ctl,'catalog_account',return_value=({'balanceAmount':50},{**account,'pods':[{**pod,'costPerHr':5}]})),patch.object(ctl,'owned'),patch.object(ctl.time,'time',return_value=150):
    with self.assertRaisesRegex(ValueError,'pod_tariff_exceeded'):ctl.catalog_cost_check(args,folder)
 def test_native_guard_survives_one_network_failure_and_stops_at_original_deadline(self):
  self.native_guard_fixture(False)
 def test_native_guard_stops_on_sustained_observation_loss(self):
  self.native_guard_fixture(True)
 def native_guard_fixture(self,sustained):
  import contextlib,io
  namespace={'__name__':'native_guard_test'};exec(ctl.NATIVE_GUARD,namespace)
  clock=[100];calls=[];responses=[True]+[False]*8 if sustained else [True,False,True]
  class Response:
   def __init__(self,value):self.value=value
   def __enter__(self):return self
   def __exit__(self,*args):pass
   def read(self):return json.dumps(self.value).encode()
  def api(request,timeout):
   query=json.loads(request.data)['query'];calls.append(query)
   if 'mutation'in query:return Response({'data':{'podStop':{'id':'abc12345678','desiredStatus':'EXITED'}}})
   ok=responses.pop(0)
   if not ok:raise URLError('temporary network failure')
   return Response({'data':{'pod':{'id':'abc12345678','desiredStatus':'RUNNING','costPerHr':4.39}}})
  with patch.dict(namespace['os'].environ,{'BACKYRD_DEADLINE':'1000'if sustained else '130','BACKYRD_COMPUTE_CAP':'4.42','BACKYRD_STOP_LEAD_SECONDS':'0'}),patch.object(Path,'read_bytes',return_value=b'RUNPOD_POD_ID=abc12345678\0RUNPOD_API_KEY=abcdefghijklmnopqrstuvwx\0'),patch.object(Path,'write_text'),patch.object(Path,'replace'),patch.object(namespace['urllib'].request,'urlopen',side_effect=api),patch.object(namespace['time'],'time',side_effect=lambda:clock[0]),patch.object(namespace['time'],'sleep',side_effect=lambda delay:clock.__setitem__(0,clock[0]+delay)),contextlib.redirect_stdout(io.StringIO())as log:
   namespace['native_main']()
  self.assertEqual(len(calls),10 if sustained else 4);self.assertIn('mutation',calls[-1]);self.assertEqual(clock[0],190 if sustained else 130);self.assertIn('PROVIDER_READ_ERROR',log.getvalue());self.assertIn('PROVIDER_OBSERVATION_EXPIRED'if sustained else 'COST_DEADLINE_REACHED',log.getvalue())
class Resume(unittest.TestCase):
 def test_resume_identity_and_failed_first_attempts_are_preserved(self):
  spec=importlib.util.spec_from_file_location('resume_gpu',Path(__file__).with_name('nuknuk-gpu.py'));gpu=importlib.util.module_from_spec(spec);spec.loader.exec_module(gpu)
  with tempfile.TemporaryDirectory()as name:
   folder=Path(name);packet=folder/'requests.json';packet.write_text('{}');path=folder/'resume.json'
   row={'id':'case','task':'COMPACT_SEARCH_V7','promptHash':'prompt','inputHash':'input','schemaHash':'schema'}
   manifest={'datasetHash':'data','image':'pinned','parent':{'hfAdapterSha256':'parent','modelFiles':{'tokenizer':'hash'}}}
   value={'sourceBundleManifestSha256':'source','sourceSnapshotManifestSha256':'snapshot','binding':{'datasetHash':'data','adapterSha256':'parent','requestPacketSha256':gpu.file_sha(packet),'inferenceContractSha256':gpu.catalog_inference_contract(Path(gpu.__file__).read_text()),'image':'pinned','tokenizerFiles':manifest['parent']['modelFiles'],'split':'DEV','firstAttemptOnly':True},'runtime':{k:'pinned'for k in ['torch','transformers','peft','axolotl','tokenizers','llguidance']},'gpuName':'NVIDIA H100 80GB HBM3','records':[{**row,'status':'FAILED','raw':None,'attempt':1}]}
   value['binding'].update(caseIdsSha256=ctl.digest(b'["case"]'),caseCount=1,failedFirstAttemptCount=1)
   value['sourceRuntimeText']=json.dumps(value['runtime']);value['sourceSmokeText']=json.dumps({'status':'PASS','bundleManifestSha256':'source'})
   snapshot={'parent-development/case.json':ctl.digest((json.dumps(value['records'][0],ensure_ascii=False,indent=2)+'\n').encode()),'runtime.json':ctl.digest(value['sourceRuntimeText'].encode()),'framework-smoke/result.json':ctl.digest(value['sourceSmokeText'].encode())}
   value['sourceSnapshotManifestText']=json.dumps(snapshot);value['sourceSnapshotManifestSha256']=ctl.digest(value['sourceSnapshotManifestText'].encode())
   path.write_text(json.dumps(value));records,_=gpu.catalog_resume_records(path,manifest,packet,[row],'parent');self.assertEqual(records['case']['status'],'FAILED')
   for mutation in [lambda v:v['binding'].update(adapterSha256='changed'),lambda v:v['records'][0].update(inputHash='changed'),lambda v:v['records'][0].update(attempt=2),lambda v:v.update(runtime={}),lambda v:v['records'].append(v['records'][0]),lambda v:v['binding'].update(failedFirstAttemptCount=0),lambda v:v['binding'].update(caseCount=0),lambda v:v['binding'].update(caseIdsSha256='changed')]:
    altered=json.loads(json.dumps(value));mutation(altered);path.write_text(json.dumps(altered))
    with self.assertRaises(ValueError):gpu.catalog_resume_records(path,manifest,packet,[row],'parent')
 def test_generation_contract_detects_inference_changes(self):
  spec=importlib.util.spec_from_file_location('resume_gpu',Path(__file__).with_name('nuknuk-gpu.py'));gpu=importlib.util.module_from_spec(spec);spec.loader.exec_module(gpu)
  source=Path(gpu.__file__).read_text();expected=gpu.catalog_inference_contract(source)
  for altered in [source.replace('do_sample=False','do_sample=True'),source.replace('max_seconds=90,max_output_tokens=2048','max_seconds=89,max_output_tokens=2048'),source.replace("attn_implementation='sdpa'","attn_implementation='eager'")]:self.assertNotEqual(expected,gpu.catalog_inference_contract(altered))
  self.assertEqual(expected,gpu.catalog_inference_contract(source+'\n# orchestration comment\n'))
class CrossPythonResume(unittest.TestCase):
 def test_same_source_has_identical_fingerprint_on_required_python_versions(self):
  import shutil,subprocess,sys
  source=Path(__file__).with_name('nuknuk-gpu.py')
  code="import importlib.util,pathlib,json,sys;p=pathlib.Path("+repr(str(source))+");s=importlib.util.spec_from_file_location('gpu',p);g=importlib.util.module_from_spec(s);s.loader.exec_module(g);print(json.dumps({'python':list(sys.version_info[:2]),'hash':g.catalog_inference_contract(p.read_text())}))"
  interpreters=[]
  for name in ['python3.12','python3.13']:
   interpreter=shutil.which(name);self.assertIsNotNone(interpreter,'cross_python_required_interpreter_missing:'+name);interpreters.append(interpreter)
  values=[json.loads(subprocess.check_output([py,'-B','-c',code],text=True))for py in interpreters]
  self.assertEqual({tuple(v['python'])for v in values},{(3,12),(3,13)})
  self.assertEqual(len({v['hash']for v in values}),1)

class RestAndEvaluationSafety(unittest.TestCase):
 def test_rest_cursor_walk_includes_second_page_and_rejects_repeated_cursor(self):
  first={'pods':[{'id':'one'}],'pagination':{'hasNextPage':True,'nextCursor':'a+/='}}
  last={'pods':[{'id':'two'}],'pagination':{'hasNextPage':False,'nextCursor':None}}
  with patch.object(ctl,'rest',side_effect=[first,last])as api:
   self.assertEqual([p['id']for p in ctl.catalog_list(Path('/key'),'/v2/pods?includeClusterPods=true','pods')],['one','two'])
   self.assertIn('cursor=a%2B%2F%3D',api.call_args.args[2])
  with patch.object(ctl,'rest',side_effect=[first,first]):
   with self.assertRaisesRegex(ValueError,'cursor_invalid'):ctl.catalog_list(Path('/key'),'/v2/pods','pods')
 def test_rest_shape_maps_initialization_and_preserves_tariff_storage_ports(self):
  raw={'id':'abc12345678','name':'owned','status':'STARTING','cost':4.39,'disk':200,'mounts':{},'runtime':None}
  item=ctl.catalog_pod_record(raw);self.assertEqual(item['desiredStatus'],'RUNNING');self.assertIsNone(item['runtime']);self.assertEqual(item['costPerHr'],4.39)
  item=ctl.catalog_pod_record({**raw,'status':'RUNNING','mounts':{'persistent':{'size':7}},'runtime':{'ports':[{'ip':'192.0.2.1','private':22,'public':22001,'type':'tcp'}]}})
  self.assertEqual(item['volumeInGb'],7);self.assertEqual(item['runtime']['ports'][0]['publicPort'],22001)
  for changed in [{'status':'UNKNOWN'},{'cost':float('nan')},{'disk':-1},{'id':'bad/id'}]:
   with self.assertRaises(ValueError):ctl.catalog_pod_record({**raw,**changed})
 def test_rate_headers_reserve_cleanup_headroom_and_long_retry_never_busy_retries(self):
  limits=ctl.rate_limits_from_headers({'RateLimit':'"minute";r=170;t=12, "day";r=39;t=5000'},100)
  self.assertTrue(ctl.quota_cleanup_required(limits));self.assertEqual(limits['day']['resetsAt'],5100)
  with tempfile.TemporaryDirectory()as name:
   folder=Path(name);(folder/'state.json').write_text(json.dumps({'phase':'DEVELOPMENT','deadline':10000}));error=HTTPError('https://api.runpod.io',429,'limited',{'Retry-After':'16696'},None);read=Mock(side_effect=error)
   with patch.object(ctl.time,'time',return_value=100),patch.object(ctl.time,'sleep')as sleep:
    with self.assertRaises(HTTPError):ctl.catalog_read_retry(read,folder)
    self.assertEqual(read.call_count,1);sleep.assert_not_called()
 def test_cleanup_deletes_bound_owned_id_even_when_account_observation_is_throttled(self):
  with tempfile.TemporaryDirectory()as name:
   folder=Path(name);(folder/'state.json').write_text(json.dumps({'runName':'owned','podId':'abc12345678','preexistingPodIds':[]}));events=[]
   def api(*args):events.append(('delete',args[2]));return None
   def account(*args,**kwargs):events.append(('account',));raise HTTPError('https://api.runpod.io',429,'limited',{'Retry-After':'1000'},None)
   with patch.object(ctl,'rest',side_effect=api),patch.object(ctl,'catalog_account',side_effect=account),patch.object(ctl.watch,'query')as graphql,patch.object(ctl.time,'sleep'):
    with self.assertRaises(HTTPError):ctl.catalog_cleanup(SimpleNamespace(key_file=folder/'key'),folder)
    self.assertEqual(events[0],('delete','/v2/pods/abc12345678'));graphql.assert_not_called()
 def test_cleanup_never_deletes_preexisting_id(self):
  with tempfile.TemporaryDirectory()as name:
   folder=Path(name);(folder/'state.json').write_text(json.dumps({'runName':'owned','podId':'abc12345678','preexistingPodIds':['abc12345678']}))
   with patch.object(ctl,'rest')as api,patch.object(ctl.time,'sleep'):
    with self.assertRaises(ValueError):ctl.catalog_cleanup(SimpleNamespace(key_file=folder/'key'),folder)
    api.assert_not_called()
 def test_evaluation_only_script_has_no_training_and_requires_both_first_attempt_resumes(self):
  script=ctl.catalog_evaluation_startup_script({'parent':{'hfAdapterSha256':'a'*64}},'b'*64,'runtime.whl')
  self.assertNotIn(' product-train ',script);self.assertIn('--resume parent-resume.json',script);self.assertIn('--resume candidate-resume.json',script);self.assertNotIn('--split TEST',script)
 def test_evaluation_only_authority_cannot_be_used_in_training_mode(self):
  with tempfile.TemporaryDirectory()as name:
   root=Path(name);bundle=root/'bundle';bundle.mkdir();(bundle/'product-gpu-manifest.json').write_text('{}');path=root/'auth.json';auth={'executionAuthorized':True,'totalCeilingUsd':50,'limitPolicy':'COST_ONLY_50_USD','autoPay':False,'productionActivation':False,'bundleManifestSha256':ctl.digest(b'{}'),'evaluationOnly':True};path.write_text(json.dumps(auth));args=SimpleNamespace(bundle=bundle,execution_authorization=path,evaluate_only=False)
   with self.assertRaisesRegex(ValueError,'evaluation_mode_authority_required'):ctl.catalog_authority(args)
   args.evaluate_only=True;self.assertTrue(ctl.catalog_authority(args)['evaluationOnly'])

class QuotaLedger(unittest.TestCase):
 class Response:
  def __init__(self,value,headers=None):self.value=value;self.headers=headers or{}
  def __enter__(self):return self
  def __exit__(self,*args):pass
  def read(self):return json.dumps(self.value).encode()
 def test_low_billing_quota_prevents_all_following_list_requests(self):
  with tempfile.TemporaryDirectory()as t:
   key=Path(t)/'key';key.write_text('synthetic');key.chmod(0o600)
   opener=Mock();opener.open.return_value=self.Response({'billingMode':'PREPAID','balanceAmount':50},{'RateLimit':'"day";r=39;t=5000'})
   with patch.object(ctl.urllib.request,'build_opener',return_value=opener):
    with self.assertRaisesRegex(ValueError,'quota_cleanup_required'):ctl.catalog_account(SimpleNamespace(key_file=key))
    self.assertEqual(opener.open.call_count,1)
 def test_missing_headers_retain_windows_and_low_page_stops_pagination(self):
  with tempfile.TemporaryDirectory()as t:
   key=Path(t)/'key';key.write_text('synthetic');key.chmod(0o600)
   opener=Mock();opener.open.side_effect=[self.Response({}, {'RateLimit':'"day";r=100;t=5000'}),self.Response({}),self.Response({'pods':[],'pagination':{'hasNextPage':True,'nextCursor':'next'}},{'RateLimit':'"minute";r=39;t=60'})]
   with patch.object(ctl.urllib.request,'build_opener',return_value=opener):
    ctl.rest(key,'GET','/v2/account');ctl.rest(key,'GET','/v2/account')
    self.assertEqual(ctl.REST_RATE_LIMITS['day']['remaining'],99)
    with self.assertRaisesRegex(ValueError,'quota_cleanup_required'):ctl.catalog_list(key,'/v2/pods','pods')
    self.assertEqual(opener.open.call_count,3)
 def test_shared_cooldown_blocks_second_process_api_and_cleanup_before_retry(self):
  import subprocess,sys
  with tempfile.TemporaryDirectory()as t:
   key=Path(t)/'key';key.write_text('synthetic');key.chmod(0o600)
   opener=Mock();opener.open.side_effect=HTTPError('https://api.runpod.io',429,'limited',{'Retry-After':'1000'},None)
   with patch.object(ctl.urllib.request,'build_opener',return_value=opener):
    with self.assertRaises(HTTPError):ctl.rest(key,'GET','/v2/account')
   code="import importlib.util;from pathlib import Path;from unittest.mock import patch;s=importlib.util.spec_from_file_location('c',"+repr(str(Path(ctl.__file__)))+");m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nwith patch.object(m.urllib.request,'build_opener')as o:\n try:m.rest(Path("+repr(str(key))+"),'DELETE','/v2/pods/abc12345678')\n except m.urllib.error.HTTPError as e:assert e.code==429\n else:raise AssertionError('cooldown missing')\n o.assert_not_called()"
   subprocess.run([sys.executable,'-B','-c',code],check=True,capture_output=True)
 def test_stale_remote_never_increases_headroom_or_shortens_cooldown(self):
  old={'limits':{'day':{'remaining':39,'resetsAt':5000}},'retryNotBefore':1000}
  stale={'limits':{'day':{'remaining':900,'resetsAt':7000}},'retryNotBefore':200}
  merged=ctl.merge_rate_state(old,stale,100);self.assertEqual(merged,old)
  self.assertEqual(ctl.merge_rate_state(merged,{},5001)['limits'],{})
 def test_uncertain_transmission_still_reserves_quota(self):
  with tempfile.TemporaryDirectory()as t:
   key=Path(t)/'key';key.write_text('synthetic');key.chmod(0o600);ctl.merge_rate_ledger(key,{'limits':{'day':{'remaining':100,'resetsAt':time.time()+1000}}})
   opener=Mock();opener.open.side_effect=URLError('reply lost')
   with patch.object(ctl.urllib.request,'build_opener',return_value=opener):
    with self.assertRaises(URLError):ctl.rest(key,'GET','/v2/account')
   self.assertEqual(json.loads(ctl.rate_ledger_path(key).read_text())['limits']['day']['remaining'],99)
 def test_interleaved_processes_atomically_consume_headerless_request_budget(self):
  import multiprocessing
  with tempfile.TemporaryDirectory()as t:
   key=Path(t)/'key';key.write_text('synthetic');key.chmod(0o600)
   ctl.merge_rate_ledger(key,{'limits':{'day':{'remaining':100,'resetsAt':time.time()+1000}}})
   def worker():
    opener=Mock();opener.open.return_value=QuotaLedger.Response({})
    with patch.object(ctl.urllib.request,'build_opener',return_value=opener):
     for _ in range(4):ctl.rest(key,'GET','/v2/account')
   ps=[multiprocessing.get_context('fork').Process(target=worker)for _ in range(2)]
   for p in ps:p.start()
   for p in ps:p.join(10);self.assertEqual(p.exitcode,0)
   self.assertEqual(json.loads(ctl.rate_ledger_path(key).read_text())['limits']['day']['remaining'],92)
 def test_rest_native_429_stops_work_at_grace_but_deletes_only_after_retry(self):
  import contextlib,io
  ns={'__name__':'native_test'};exec(ctl.NATIVE_GUARD,ns);clock=[100.];calls=[];events=[]
  def api(request,timeout):
   calls.append((clock[0],request.method,request.full_url))
   if request.method=='GET':raise HTTPError(request.full_url,429,'limited',{'Retry-After':'1000'},None)
   return QuotaLedger.Response({})
  with tempfile.TemporaryDirectory()as t:
   original_path=ns['Path'];proc=Path(t)/'proc';proc.mkdir();job=proc/'321';job.mkdir();(job/'cmdline').write_bytes(b'python\0nuknuk-gpu.py\0product-evaluate')
   def path(value):
    if value=='/proc':return proc
    if value=='/proc/1/environ':return Mock(read_bytes=lambda:b'RUNPOD_POD_ID=abc12345678\0RUNPOD_API_KEY=abcdefghijklmnopqrstuvwx\0')
    return original_path(t+'/'+value.rsplit('/',1)[-1])
   ns['Path']=path
   with patch.dict(ns['os'].environ,{'BACKYRD_PROVIDER_API':'REST_V2','BACKYRD_DEADLINE':'2000','BACKYRD_COMPUTE_CAP':'4.42','BACKYRD_STOP_LEAD_SECONDS':'0'}),patch.object(ns['urllib'].request,'urlopen',side_effect=api),patch.object(ns['os'],'kill',side_effect=lambda pid,sig:events.append((clock[0],pid,sig))),patch.object(ns['time'],'time',side_effect=lambda:clock[0]),patch.object(ns['time'],'sleep',side_effect=lambda d:clock.__setitem__(0,clock[0]+d)),contextlib.redirect_stdout(io.StringIO())as output:ns['native_main']()
   failed=json.loads(path('/tmp/backyrd-guard.failed').read_text());self.assertEqual(failed['epoch'],190);self.assertEqual(failed['failedReason'],'PROVIDER_OBSERVATION_EXPIRED');self.assertEqual(events[0][0],190)
   self.assertEqual([(x[0],x[1])for x in calls],[(100,'GET'),(1100,'DELETE')]);self.assertTrue(all('/v2/pods/abc12345678'in x[2]for x in calls));self.assertNotIn('graphql',str(calls))

class CompletedCandidate(unittest.TestCase):
 def test_payload_is_exact_allowlist_and_rejects_weights_lineage_and_checkpoint_changes(self):
  import tarfile,io
  with tempfile.TemporaryDirectory()as t:
   root=Path(t);source=root/'output';source.mkdir();(source/'adapter_model.safetensors').write_bytes(b'candidate');cfg={'r':16,'lora_alpha':32,'lora_dropout':0,'target_modules':['q_proj']};(source/'adapter_config.json').write_text(json.dumps(cfg));(source/'unapproved-secret').write_text('never transferred')
   result=root/'result.json';value={'status':'TRAINED_REQUIRES_COMPARISON','sourceManifestSha256':'original','datasetHash':'data','parentAdapterSha256':'parent','model':'pinned','adapterSha256':ctl.digest(b'candidate'),'trainingRows':1000,'completedOptimizerUpdates':200,'epochs':1};result.write_text(json.dumps(value));frozen=root/'frozen.json';frozen.write_text(json.dumps({'candidateAdapterSha256':value['adapterSha256'],'selectionPolicy':'ONE_PREREGISTERED_FINAL_CHECKPOINT','testUsedForSelection':False}))
   authority={'completedTrainingResultSha256':ctl.digest(result.read_bytes()),'evaluationCandidateSha256':value['adapterSha256'],'evaluationCandidateConfigSha256':ctl.digest((source/'adapter_config.json').read_bytes()),'originalTrainingBundleManifestSha256':'original','frozenCandidateIdentityFile':str(frozen),'frozenCandidateIdentitySha256':ctl.digest(frozen.read_bytes())};manifest={'datasetHash':'data','parent':{'hfAdapterSha256':'parent','trainingBase':'pinned','targetModules':['q_proj']},'recipe':{'trainingRows':1000,'optimizerUpdates':200}};args=SimpleNamespace(candidate_source=source,candidate_result=result)
   payload=ctl.catalog_candidate_payload(args,manifest,authority)
   with tarfile.open(fileobj=io.BytesIO(payload),mode='r:gz')as archive:self.assertEqual(archive.getnames(),['output/adapter_model.safetensors','output/adapter_config.json','training-receipts/result.json'])
   for field,replacement in [('epochs',2),('model','wrong'),('completedOptimizerUpdates',199),('sourceManifestSha256','other'),('parentAdapterSha256','other')]:
    result.write_text(json.dumps({**value,field:replacement}));modified={**authority,'completedTrainingResultSha256':ctl.digest(result.read_bytes())}
    with self.assertRaisesRegex(ValueError,'lineage_invalid'):ctl.catalog_candidate_payload(args,manifest,modified)
   result.write_text(json.dumps(value));(source/'adapter_model.safetensors').write_bytes(b'changed')
   with self.assertRaisesRegex(ValueError,'lineage_invalid'):ctl.catalog_candidate_payload(args,manifest,authority)
   (source/'adapter_model.safetensors').write_bytes(b'candidate');frozen.write_text(json.dumps({'candidateAdapterSha256':value['adapterSha256'],'selectionPolicy':'BEST_OF_TEST','testUsedForSelection':True}));authority['frozenCandidateIdentitySha256']=ctl.digest(frozen.read_bytes())
   with self.assertRaisesRegex(ValueError,'final_candidate_identity_not_bound'):ctl.catalog_candidate_payload(args,manifest,authority)

if __name__=='__main__':unittest.main()
