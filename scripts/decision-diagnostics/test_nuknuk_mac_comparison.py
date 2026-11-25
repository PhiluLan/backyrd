"""CPU-only maintenance failure paths. Never calls launchctl or loads a model."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('mac',Path(__file__).with_name('nuknuk-mac-comparison.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_gpu_completion_is_required_before_any_live_inspection(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);c=root/'candidate';c.mkdir();(c/'conversion.json').write_text('{}');p=root/'completion.json';p.write_text('{"status":"TRAINING"}')
   with patch.object(m,'health')as health:
    with self.assertRaisesRegex(ValueError,'secured_training_completion_required'):m.preflight(root,c,p,Path('/python'))
    health.assert_not_called()
 def test_reused_guard_pid_cannot_terminate_an_unrelated_process(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);receipt=root/'resource.json';(root/'owned-guard.json').write_text(json.dumps({'pid':123,'receipt':str(receipt)}))
   with patch.object(m.subprocess,'run',return_value=Mock(stdout='/unrelated/app')),patch.object(m.os,'kill')as kill:
    m.stop_owned(root);kill.assert_not_called();self.assertFalse(receipt.with_suffix('.stop').exists())
 def test_watchdog_restores_on_controller_pipe_eof(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);(root/'session.json').write_text(json.dumps({'deadline':time.time()+5}));r,w=os.pipe();os.close(w)
   try:
    with patch.object(m,'restore')as restore:m.watchdog(root,r);restore.assert_called_once_with(root)
   finally:os.close(r)
 def test_watchdog_restores_after_deadline_but_does_not_repeat_completed_restoration(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);(root/'session.json').write_text(json.dumps({'deadline':time.time()-1}));r,w=os.pipe()
   try:
    with patch.object(m,'restore')as restore:m.watchdog(root,r);restore.assert_called_once_with(root)
    (root/'restored.json').write_text('{}')
    with patch.object(m,'restore')as restore:m.watchdog(root,r);restore.assert_not_called()
   finally:os.close(r);os.close(w)
 def test_failure_to_pause_original_still_enters_restoration_finally(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);process=Mock();cfg={'deadline':time.time()+1200,'parentDirectories':[]}
   with patch.object(m,'preflight',return_value=cfg),patch.object(m.subprocess,'Popen',return_value=process),patch.object(m,'wait_until'),patch.object(m,'agent',return_value=Mock(returncode=1)),patch.object(m,'restore')as restore:
    self.assertEqual(m.run(root,root/'candidate',root/'completion',Path('/python')),1);restore.assert_called_once_with(root)
    self.assertIn('original_bootout_failed',json.loads((root/'test-error.json').read_text())['error']);process.terminate.assert_called()
 def test_completed_restore_is_idempotent_without_service_mutations(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);(root/'restored.json').write_text('{}')
   with patch.object(m,'agent')as agent,patch.object(m,'stop_owned')as stop:m.restore(root);agent.assert_not_called();stop.assert_not_called()
 def test_stale_pid_never_authorizes_terminating_an_unrelated_process(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);receipt=root/'parent-resources.json';(root/'owned-guard.json').write_text(json.dumps({'pid':123,'receipt':str(receipt)}))
   with patch.object(m.subprocess,'run',return_value=Mock(stdout='unrelated worker')),patch.object(m.os,'kill')as kill:
    m.stop_owned(root);kill.assert_not_called();self.assertFalse(receipt.with_suffix('.stop').exists())
 def test_preflight_rejects_incomplete_gpu_training_before_reading_live_service(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);candidate=root/'model';candidate.mkdir();(candidate/'conversion.json').write_text(json.dumps({'hfAdapterSha256':'a'*64}));completion=root/'completion.json';completion.write_text(json.dumps({'status':'TRAINING','candidateSha256':'a'*64}))
   with patch.object(m,'health')as health,patch.object(m,'agent')as agent:
    with self.assertRaisesRegex(ValueError,'secured_training_completion_required'):m.preflight(root,candidate,completion,Path('/python'))
    health.assert_not_called();agent.assert_not_called()
 def test_changed_original_launchagent_is_not_silently_started(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);(root/'session.json').write_text(json.dumps({'plistSha256':'expected'}))
   with patch.object(m,'stop_owned'),patch.object(m,'sha',return_value='changed'),patch.object(m,'agent')as agent:
    with self.assertRaisesRegex(RuntimeError,'original_agent_changed'):m.restore(root)
    agent.assert_not_called()

class CatalogChecks(unittest.TestCase):
 def test_altered_bound_artifact_rejected_before_live_inspection(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);a=root/'receipt.json';a.write_text('{}');spec=root/'spec.json';spec.write_text(json.dumps({'version':'backyrd.nuknuk-native-catalog-check@1','split':'DEV','files':{'runState':{'path':str(a),'sha256':'changed'}}}))
   with patch.object(m,'health')as health,patch.object(m,'agent')as agent:
    with self.assertRaisesRegex(ValueError,'bound_file_changed'):m.preflight_catalog(root,root/'candidate',root/'completion',Path('/python'),spec)
    health.assert_not_called();agent.assert_not_called()
 def test_test_inputs_are_never_silently_used_for_native_development_check(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);spec=root/'spec.json';spec.write_text(json.dumps({'version':'backyrd.nuknuk-native-catalog-check@1','split':'TEST'}))
   with patch.object(m,'health')as health:
    with self.assertRaisesRegex(ValueError,'scope_invalid'):m.preflight_catalog(root,root/'candidate',root/'completion',Path('/python'),spec)
    health.assert_not_called()
 def test_catalog_failure_during_native_pair_still_restores_original(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);process=Mock();process.pid=123;process.poll.return_value=None;process.wait.return_value=1
   (root/'spec').write_text(json.dumps({'model':{'files':{}}}))
   cfg={'deadline':time.time()+1200,'python':'/python','resourceGuardSha256':'guard','controllerSourceSha256':'guard','catalogComparison':{'spec':str(root/'spec'),'specSha256':'guard','parentMlxSha256':'guard','parentConfigSha256':'guard',**{'parent':{'model':'model','adapter':'parent'},'candidate':{'model':'model','adapter':'candidate'},'caseCount':10}}}
   with patch.object(m,'preflight',return_value=cfg),patch.object(m.subprocess,'Popen',return_value=process),patch.object(m,'wait_until'),patch.object(m,'agent',return_value=Mock(returncode=0)),patch.object(m,'sha',return_value='guard'),patch.object(m,'stop_owned'),patch.object(m,'restore')as restore:
    self.assertEqual(m.run(root,root/'candidate',root/'completion',Path('/python'),root/'spec'),1)
    restore.assert_called_once_with(root);self.assertIn('local_comparison_command_failed',json.loads((root/'test-error.json').read_text())['error'])

 def fixture(self,root):
  def save(name,value):
   p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value));return p
  parent=root/'parent';candidate=root/'candidate';model=root/'model';live=root/'live'
  for folder in [parent,candidate,model,live]:folder.mkdir()
  for folder in [parent,candidate,live]:save(folder.name+'/adapters.safetensors',folder.name);save(folder.name+'/adapter_config.json',{'rank':16})
  hf=save('hf.safetensors','new trained HF bytes');hs=m.sha(hf)
  source=save('catalog.json',{'catalogVariant':'understanding-correction-v1','catalogHash':'dataset'})
  packet=save('requests.json',{'split':'DEV','targetIncluded':False,'cases':[{'id':'one','split':'DEV'}]})
  pre=save('preflight.json',{'datasetManifestFileSha256':m.sha(source),'cases':[{'id':'one','split':'DEV','prefixTokens':4000}]})
  bundle=save('bundle.json',{'sourceManifestSha256':m.sha(source),'datasetHash':'dataset','parent':{'hfAdapterSha256':'parent-hf','mlxAdapterSha256':m.sha(parent/'adapters.safetensors'),'mlxAdapterConfigSha256':m.sha(parent/'adapter_config.json')},'recipe':{'optimizerUpdates':200,'trainingRows':1000,'epochs':1},'files':{'development-requests.json':{'sha256':m.sha(packet)}}})
  result=save('training.json',{'status':'TRAINED_REQUIRES_COMPARISON','datasetHash':'dataset','parentAdapterSha256':'parent-hf','completedOptimizerUpdates':200,'adapterSha256':hs,'sourceManifestSha256':m.sha(bundle),'trainingRows':1000,'epochs':1})
  state=save('state.json',{'phase':'REMOVED','resourcesRemoved':True,'bundleHash':m.sha(bundle),'candidateSha256':hs})
  save('candidate/conversion.json',{'hfAdapterSha256':hs,'datasetHash':'dataset','parentMlxSha256':m.sha(parent/'adapters.safetensors'),'exactRoundTrip':True,'modelLoaded':False,'activated':False,'mlxAdapterSha256':m.sha(candidate/'adapters.safetensors'),'mlxConfigSha256':m.sha(candidate/'adapter_config.json'),'tensors':80,'rank':16,'scale':2})
  base=save('model/config.json',{'model_type':'qwen3_5_moe'});save('model/tokenizer.json',{});save('model/tokenizer_config.json',{});save('model/chat_template.jinja','template');save('model/model.safetensors.index.json',{'weight_map':{'layer':'model-1.safetensors'}});save('model/model-1.safetensors','weights');plist=save('launch.plist',{});domain=root/'domain';domain.write_text('https://example.test')
  spec=save('spec.json',{'version':'backyrd.nuknuk-native-catalog-check@1','split':'DEV','parentAdapter':str(parent),'caseIds':['one'],'model':{'path':str(model),'files':{p.name:m.sha(p)for p in model.iterdir()if p.is_file()}},'files':{k:{'path':str(v),'sha256':m.sha(v)}for k,v in {'catalogManifest':source,'bundleManifest':bundle,'runState':state,'trainingResult':result,'hfAdapter':hf,'developmentRequests':packet,'preflight':pre}.items()}})
  self.enterContext(patch.object(m,'PLIST',plist));self.enterContext(patch.object(m,'PLIST_SHA',m.sha(plist)));self.enterContext(patch.object(m,'LIVE_SHA',m.sha(live/'adapters.safetensors')));self.enterContext(patch.object(m,'DOMAIN_FILE',domain))
  health=self.enterContext(patch.object(m,'health',side_effect=lambda port:{'status':'healthy','loaded_model':str(model),'loaded_adapter':str(live)}if port==8088 else {}))
  return spec,result,candidate,health
 def test_complete_catalog_chain_accepts_a_bound_serving_smoke(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);spec,result,candidate,_=self.fixture(root);cfg=m.preflight_catalog(root,candidate,result,Path('/python'),spec)
   self.assertEqual(cfg['nativeScope'],'SERVING_SMOKE_NOT_GPU_NUMERICAL_OR_TOKEN_PARITY');self.assertEqual(cfg['catalogComparison']['caseCount'],1)
 def test_partial_model_manifest_cannot_omit_weights_or_tokenizer(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);spec,result,candidate,_=self.fixture(root);v=json.loads(spec.read_text());v['model']['files']={'config.json':v['model']['files']['config.json']};spec.write_text(json.dumps(v))
   with self.assertRaisesRegex(ValueError,'inventory_incomplete'):m.preflight_catalog(root,candidate,result,Path('/python'),spec)
 def test_mismatched_secured_candidates_and_source_fail_before_health(self):
  for file_key,field,value in [('runState','candidateSha256','other'),('trainingResult','sourceManifestSha256','other'),('trainingResult','trainingRows',999)]:
   with self.subTest(field=field),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);spec,result,candidate,health=self.fixture(root);v=json.loads(spec.read_text());path=Path(v['files'][file_key]['path']);data=json.loads(path.read_text());data[field]=value;path.write_text(json.dumps(data));v['files'][file_key]['sha256']=m.sha(path);spec.write_text(json.dumps(v))
    with self.assertRaisesRegex(ValueError,'secured_training_completion_required'):m.preflight_catalog(root,candidate,result,Path('/python'),spec)
    health.assert_not_called()
 def test_runner_timeout_or_terminate_error_cannot_skip_direct_restore(self):
  for kind in ['wait','terminate']:
   with self.subTest(error=kind),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);(root/'spec').write_text(json.dumps({'model':{'files':{}}}))
    watcher,awake,guard,runner=[Mock()for _ in range(4)]
    for i,process in enumerate([watcher,awake,guard,runner]):process.pid=100+i;process.poll.return_value=None
    if kind=='wait':runner.wait.side_effect=m.subprocess.TimeoutExpired('owned-runner',15)
    else:runner.wait.return_value=1;runner.terminate.side_effect=RuntimeError('terminate failed')
    cfg={'deadline':time.time()+1200,'python':'/python','resourceGuardSha256':'guard','controllerSourceSha256':'guard','catalogComparison':{'spec':str(root/'spec'),'specSha256':'guard','parentMlxSha256':'guard','parentConfigSha256':'guard','parent':{'model':'model','adapter':'parent'},'candidate':{'model':'model','adapter':'candidate'},'caseCount':10}}
    with patch.object(m,'preflight',return_value=cfg),patch.object(m.subprocess,'Popen',side_effect=[watcher,awake,guard,runner]),patch.object(m,'wait_until'),patch.object(m,'agent',return_value=Mock(returncode=0)),patch.object(m,'sha',return_value='guard'),patch.object(m,'stop_owned'),patch.object(m,'restore')as restore:
     self.assertEqual(m.run(root,root/'candidate',root/'completion',Path('/python'),root/'spec'),1)
     restore.assert_called_once_with(root);runner.terminate.assert_called_once();watcher.wait.assert_called_once()

class EvaluationOrigin(unittest.TestCase):
 def test_bridge_preserves_original_receipt_and_rejects_non_evaluation_or_changed_data(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);old=root/'old';new=root/'new';old.mkdir();new.mkdir()
   source=Path(m.__file__).with_name('nuknuk-gpu.py').read_text()
   original={'profile':'same','datasetHash':'data','parent':{'hfAdapterSha256':'parent'},'image':'pinned','recipe':{'epochs':1},'files':{'nuknuk-gpu.py':{'sha256':m.hashlib.sha256(source.encode()).hexdigest()}}}
   for folder in [old,new]:(folder/'nuknuk-gpu.py').write_text(source);(folder/'manifest.json').write_text(json.dumps(original))
   spec={'files':{'bundleManifest':{'path':str(new/'manifest.json'),'sha256':m.sha(new/'manifest.json')},'originalTrainingBundleManifest':{'path':str(old/'manifest.json'),'sha256':m.sha(old/'manifest.json')}}}
   self.assertEqual(m.catalog_training_origin(spec,original,{'evaluationOnly':True}),m.sha(old/'manifest.json'))
   with self.assertRaisesRegex(ValueError,'evaluation_continuation_required'):m.catalog_training_origin(spec,original,{})
   with self.assertRaisesRegex(ValueError,'protected_input_changed'):m.catalog_training_origin(spec,{**original,'datasetHash':'wrong'},{'evaluationOnly':True})
   (new/'nuknuk-gpu.py').write_text(source+'\n# changed after seal')
   with self.assertRaisesRegex(ValueError,'bundle_changed'):m.catalog_training_origin(spec,original,{'evaluationOnly':True})

if __name__=='__main__':unittest.main()
