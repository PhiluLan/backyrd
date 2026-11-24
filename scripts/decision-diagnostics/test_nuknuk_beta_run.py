"""No provider calls: fail-closed allocation and one-attempt reconciliation."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch,Mock
from urllib.error import URLError
spec=importlib.util.spec_from_file_location('controller',Path(__file__).with_name('nuknuk-beta-run.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_lost_creation_response_never_retries_allocation_and_always_cleans_up(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);bundle=root/'bundle';bundle.mkdir();op=root/'op';op.mkdir();(op/'guard.ready').write_text('123')
   (bundle/'product-gpu-manifest.json').write_text(json.dumps({'profile':'PRODUCT_SEARCH_V7_BETA_CONTINUATION_V1','recipe':{'trainingRows':800},'image':'pinned-image','parent':{'hfAdapterSha256':'a'*64}}))
   quote=root/'quote.json';quote.write_text(json.dumps({'gpu':'NVIDIA A100-SXM4-80GB'}));receipt={'maximumBillingSeconds':7200,'plannedMaximumIncludingReserveUsd':6.55,'watchdog':{'maxComputeHourlyUsd':2.19}};rp=root/'receipt.json';rp.write_text(json.dumps(receipt));pub=root/'pub';pub.write_text('ssh-ed25519 SYNTHETIC')
   args=SimpleNamespace(operation=op,bundle=bundle,quote=quote,quote_admission=rp,key_file=root/'key',public_key=pub,private_key=root/'private')
   def rest(key,method,path,payload=None):
    if method=='GET':return {'billingMode':'PREPAID','balanceAmount':7.65}
    raise URLError('simulated lost response')
   with patch.object(m,'rest',side_effect=rest)as api,patch.object(m.watch,'query',return_value={'myself':{'currentSpendPerHr':0,'pods':[]}}),patch.object(m,'package',return_value=b'archive'),patch.object(m.subprocess,'check_output',return_value=json.dumps(receipt)),patch.object(m.subprocess,'Popen',return_value=Mock(poll=lambda:None)),patch.object(m.time,'sleep'),patch.object(m,'owned',return_value=None),patch.object(m,'cleanup')as cleanup:
    with self.assertRaises(URLError):m.run(args)
    self.assertEqual(sum(call.args[1]=='POST'for call in api.call_args_list),1)
    cleanup.assert_called_once_with(op,args.key_file)
   state=json.loads((op/'state.json').read_text());self.assertEqual(state['phase'],'REMOVED');self.assertEqual(state['failureType'],'URLError')
 def test_success_arms_financial_watch_only_after_native_guard_then_verifies_and_deletes(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);bundle=root/'bundle';bundle.mkdir();op=root/'op';op.mkdir();(op/'guard.ready').write_text('123')
   manifest={'profile':'PRODUCT_SEARCH_V7_BETA_CONTINUATION_V1','recipe':{'trainingRows':800},'image':'pinned-image','parent':{'hfAdapterSha256':'a'*64},'datasetHash':'dataset'}
   (bundle/'product-gpu-manifest.json').write_text(json.dumps(manifest))
   quote=root/'quote.json';quote.write_text(json.dumps({'gpu':'NVIDIA A100-SXM4-80GB'}));receipt={'maximumBillingSeconds':7200,'plannedMaximumIncludingReserveUsd':6.62,'watchdog':{'maxComputeHourlyUsd':2.22,'priorUsd':0,'hourlyUsd':2.25,'ceilingUsd':7.65}};rp=root/'receipt.json';rp.write_text(json.dumps(receipt));pub=root/'pub';pub.write_text('ssh-ed25519 SYNTHETIC')
   args=SimpleNamespace(operation=op,bundle=bundle,quote=quote,quote_admission=rp,key_file=root/'key',public_key=pub,private_key=root/'private')
   result=root/'result';(result/'output').mkdir(parents=True);(result/'training-receipts').mkdir();(result/'output/adapter_model.safetensors').write_bytes(b'candidate')
   (result/'training-receipts/result.json').write_text(json.dumps({'datasetHash':'dataset','trainingRows':800,'epochs':1,'completedOptimizerUpdates':200,'adapterSha256':m.digest(b'candidate')}))
   events=[];pid='syntheticpod123'
   def rest(key,method,path,payload=None):
    if method=='GET':return {'billingMode':'PREPAID','balanceAmount':7.65}
    events.append('allocate');return {'id':pid}
   def query(key,document,variables=None):
    if 'myself'in document:return {'myself':{'currentSpendPerHr':0,'pods':[]}}
    if 'containerDiskInGb'in document:return {'pod':{'volumeInGb':0,'containerDiskInGb':200}}
    return {'pod':{'desiredStatus':'RUNNING','runtime':{'ports':[{'ip':'192.0.2.1','isIpPublic':True,'privatePort':22,'publicPort':22000,'type':'tcp'}]}}}
   def ssh(command,remote,timeout=25,data=None):
    if 'cat /tmp/backyrd-guard.ready'in remote:
     events.append('native_guard_verified');state=json.loads((op/'state.json').read_text());return json.dumps({'podId':pid,'deadline':state['deadline'],'heartbeat':m.time.time()}).encode()
    if 'complete'in remote:return b'{"exit":"0","complete":true}'
    return b'123'
   def popen(command,**kwargs):
    if 'watch'in command:
     self.assertIn('native_guard_verified',events);events.append('financial_watch');(op/'financial-watch.jsonl').write_text('{}')
    return Mock(poll=lambda:None)
   def cleanup(folder,key):events.append('delete');self.assertIn('financial_watch',events)
   with patch.object(m,'rest',side_effect=rest),patch.object(m.watch,'query',side_effect=query),patch.object(m.watch,'validate_pod_snapshot',return_value=(True,2.19)),patch.object(m,'package',return_value=b'archive'),patch.object(m.subprocess,'check_output',return_value=json.dumps(receipt)),patch.object(m.subprocess,'Popen',side_effect=popen),patch.object(m,'ssh_call',side_effect=ssh),patch.object(m,'sync',return_value=result),patch.object(m.time,'sleep'),patch.object(m,'owned',side_effect=[{'costPerHr':2.19},{'costPerHr':2.19},None]),patch.object(m,'cleanup',side_effect=cleanup):
    m.run(args)
   state=json.loads((op/'state.json').read_text());self.assertEqual(state['deadline']-state['started'],7200);self.assertTrue(state['resourcesRemoved']);self.assertEqual(state['candidateSha256'],m.digest(b'candidate'));self.assertEqual(events,['allocate','native_guard_verified','financial_watch','delete'])
 def test_existing_operation_cannot_reenter_allocation(self):
  with tempfile.TemporaryDirectory() as tmp:
   op=Path(tmp);(op/'state.json').write_text('{}')
   with patch.object(m,'rest')as api,self.assertRaisesRegex(ValueError,'single_allocation_attempt'):
    m.run(SimpleNamespace(operation=op))
   api.assert_not_called()
if __name__=='__main__':unittest.main()
