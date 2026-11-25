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
   def api(key,method,path,payload=None):
    if method=='DELETE':return None
    reads[0]+=1
    if reads[0]<=2:return {'id':'abc12345678'}
    raise HTTPError('https://api.runpod.io',404,'not found',{},None)
   with patch.object(ctl,'catalog_account',side_effect=snapshots)as account,patch.object(ctl,'rest',side_effect=api),patch.object(ctl.watch,'stop')as stop,patch.object(ctl.time,'sleep'):
    ctl.catalog_cleanup(SimpleNamespace(key_file=folder/'key'),folder);self.assertEqual(account.call_count,5);self.assertEqual(stop.call_count,2)
 def lost_creation_fixture(self,delayed):
  with tempfile.TemporaryDirectory()as name:
   folder=Path(name);bundle=folder/'bundle';bundle.mkdir();catalog=folder/'catalog';catalog.mkdir();(catalog/'manifest.json').write_text(json.dumps({'catalogHash':'dataset'}));(catalog/'test-inference-inputs.json').write_text('{}');(bundle/'product-gpu-manifest.json').write_text('{}');op=folder/'op';op.mkdir();(op/'guard.ready').write_text('1');wheel=folder/'runtime.whl';wheel.write_bytes(b'wheel')
   manifest={'limitPolicy':'COST_ONLY_50_USD','sourceManifestSha256':ctl.digest((catalog/'manifest.json').read_bytes()),'datasetHash':'dataset','testRequestPacketSha256':ctl.digest(b'{}'),'files':{},'parent':{'hfAdapterSha256':'a'*64},'image':'pinned'}
   module=SimpleNamespace(verify_product_gpu_bundle=lambda path:manifest);loader=Mock(exec_module=lambda module:None)
   quote={'id':'NVIDIA H100 PCIe','secure':True,'memory':80,'availability':'HIGH','price':{'secure':2.89}}
   authority={'llguidanceWheelSha256':ctl.digest(b'wheel')};args=SimpleNamespace(operation=op,bundle=bundle,catalog_package=catalog,execution_authorization=folder/'authority',private_key=folder/'private',public_key=folder/'public',storage_tariff=folder/'storage',llguidance_wheel=wheel,key_file=folder/'key');args.public_key.write_text('ssh-ed25519 SYNTHETIC');args.storage_tariff.write_text('{}')
   billing={'billingMode':'PREPAID','balanceAmount':51};account={'currentSpendPerHr':0,'networkVolumes':[],'pods':[]};pod={'id':'abc12345678','name':'bound','desiredStatus':'RUNNING','runtime':{},'costPerHr':2.89}
   def api(key,method,path,payload=None):
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
   manifest={'limitPolicy':'COST_ONLY_50_USD','sourceManifestSha256':ctl.digest((catalog/'manifest.json').read_bytes()),'datasetHash':'dataset','testRequestPacketSha256':ctl.digest(b'{}'),'files':{},'parent':{'hfAdapterSha256':'a'*64},'image':'pinned'};module=SimpleNamespace(verify_product_gpu_bundle=lambda path:manifest);loader=Mock(exec_module=lambda module:None)
   quote={'id':'NVIDIA H100 PCIe','secure':True,'memory':80,'availability':'HIGH','price':{'secure':2.89}};authority={'llguidanceWheelSha256':ctl.digest(b'wheel')};args=SimpleNamespace(operation=op,bundle=bundle,catalog_package=catalog,execution_authorization=folder/'authority',private_key=folder/'private',public_key=folder/'public',storage_tariff=folder/'storage',llguidance_wheel=wheel,key_file=folder/'key');args.public_key.write_text('ssh-ed25519 SYNTHETIC');args.storage_tariff.write_text('{}')
   billing={'billingMode':'PREPAID','balanceAmount':51};account={'currentSpendPerHr':0,'networkVolumes':[],'pods':[]};pod={'id':'abc12345678','name':'bound','desiredStatus':'RUNNING','runtime':{},'costPerHr':2.89};request={};gone=[False]
   target=folder/'results';(target/'training-receipts').mkdir(parents=True);(target/'output').mkdir();(target/'output/adapter_model.safetensors').write_bytes(b'synthetic-adapter');candidate=ctl.digest(b'synthetic-adapter');(target/'training-receipts/result.json').write_text(json.dumps({'datasetHash':'dataset','completedOptimizerUpdates':470,'trainingRows':2350,'adapterSha256':candidate}))
   def api(key,method,path,payload=None):
    if method=='POST':request.update(payload);return {'id':'abc12345678'}
    if path=='/v2/account':return {'id':'account'}
    if 'catalog/gpus'in path:return [quote]
    if 'billing/balance'in path:return billing
    if path=='/v2/pods/abc12345678':return {'image':'pinned','disk':200,'mounts':{},'locked':False}
    raise ValueError('unexpected mock API')
   def ssh(transport,command,timeout=25,data=None):
    if command=='cat /tmp/backyrd-guard.ready':return json.dumps({'podId':'abc12345678','deadline':float(request['env']['BACKYRD_DEADLINE']),'heartbeat':time.time()}).encode()
    return b''
   ports={'pod':{'id':'abc12345678','desiredStatus':'RUNNING','volumeInGb':0,'containerDiskInGb':200,'runtime':{'ports':[{'isIpPublic':True,'privatePort':22,'publicPort':12345,'type':'tcp','ip':'192.0.2.1'}]}}}
   guard=Mock();guard.poll.return_value=None
   with patch.object(ctl,'catalog_authority',return_value=authority),patch.object(ctl,'catalog_storage_rate',return_value=(.03,{})),patch.object(ctl.importlib.util,'spec_from_file_location',return_value=SimpleNamespace(loader=loader)),patch.object(ctl.importlib.util,'module_from_spec',return_value=module),patch.object(ctl,'catalog_account',return_value=(billing,account)),patch.object(ctl,'package',return_value=b'archive'),patch.object(ctl,'rest',side_effect=api)as rest,patch.object(ctl.subprocess,'Popen',return_value=guard),patch.object(ctl,'owned',side_effect=lambda *args:None if gone[0]else pod),patch.object(ctl,'catalog_cleanup',side_effect=lambda *args:gone.__setitem__(0,True)),patch.object(ctl.time,'sleep'),patch.object(ctl.watch,'query',return_value=ports),patch.object(ctl,'ssh_call',side_effect=ssh)as upload,patch.object(ctl,'catalog_launch',return_value=123),patch.object(ctl,'catalog_monitor',return_value=target),patch.object(ctl,'catalog_compare',return_value={'comparison':{'passed':False}}):
    state=ctl.catalog_run(args,op)
    self.assertEqual(state['phase'],'REMOVED');self.assertTrue(state['resourcesRemoved']);self.assertEqual(state['candidateSha256'],candidate);self.assertFalse(state['testExecuted']);self.assertEqual(sum(call.args[1]=='POST'for call in rest.call_args_list),1);self.assertFalse(any('cat > '+ctl.REMOTE+'/test-inference-inputs.json'in call.args[1]for call in upload.call_args_list))
 def test_campaign_keeps_original_fifty_dollar_cap_across_failed_attempt(self):
  with tempfile.TemporaryDirectory()as name:
   path=Path(name)/'prior-state.json';state={'phase':'REMOVED','resourcesRemoved':True,'podId':'abc12345678','initialBalanceUsd':51.88,'heartbeat':700,'started':100,'allInHourlyRateUsd':4.5,'finalObservedDebitUsd':.33,'accountId':'account'};path.write_text(json.dumps(state));authority={'campaignId':'campaign','campaignAccountId':'account','campaignInitialBalanceUsd':51.88,'campaignPriorCostUsd':.75,'priorAttempts':[{'stateFile':str(path),'stateSha256':ctl.digest(path.read_bytes())}]}
   self.assertEqual(ctl.catalog_campaign_prior(authority),(51.88,.75))
   with self.assertRaisesRegex(ValueError,'cost_reset_refused'):ctl.catalog_campaign_prior({**authority,'campaignPriorCostUsd':0})
   state['resourcesRemoved']=False;path.write_text(json.dumps(state));authority['priorAttempts'][0]['stateSha256']=ctl.digest(path.read_bytes())
   with self.assertRaisesRegex(ValueError,'not_secured_and_removed'):ctl.catalog_campaign_prior(authority)
if __name__=='__main__':unittest.main()
