"""CPU-only contract tests. Stub Axolotl import, never claim an actual GPU trainer ran."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
# Only the BasePlugin import is stubbed; production Transformers collation is real.
base=types.ModuleType('axolotl.integrations.base');base.BasePlugin=object
sys.modules['axolotl']=types.ModuleType('axolotl');sys.modules['axolotl.integrations']=types.ModuleType('axolotl.integrations');sys.modules['axolotl.integrations.base']=base

def load(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
callback=load('callback','nuknuk-beta-callback.py');gpu=load('gpu','nuknuk-gpu.py');watch=load('watch','nuknuk-runpod-watch.py')
class Contracts(unittest.TestCase):
 def test_real_numpy_batch_mask_and_weight(self):
  ids=[1,2,3];labels=[-100,-100,3];bindings={callback.array_digest(ids):{'labelsSha256':callback.array_digest(labels),'weight':2.5}}
  row={'input_ids':np.array([[1,2,3,0]]),'labels':np.array([[-100,-100,3,-100]]),'attention_mask':np.array([[1,1,1,0]])}
  self.assertEqual(callback.batch_weight(row,bindings),2.5)
  for key,index,value in [('labels',0,1),('labels',3,0),('input_ids',1,42),('attention_mask',0,0)]:
   broken={k:v.copy()for k,v in row.items()};broken[key][0,index]=value
   with self.assertRaises(ValueError):callback.batch_weight(broken,bindings)
 def test_heartbeat_allows_poll_timeout_jitter_but_expires(self):
  with tempfile.TemporaryDirectory()as name:
   folder=Path(name);(folder/'product-gpu-manifest.json').write_text('{}');heartbeat=folder/'heartbeat.json';approval=folder/'approval.json'
   value={'bundleManifestSha256':gpu.file_sha(folder/'product-gpu-manifest.json'),'parentAdapterSha256':'parent','executionAuthorized':True,'autoPay':False,'ownedPods':1,'totalCeilingUsd':50,'reserveUsd':5,'startedEpoch':100,'deadlineEpoch':1000,'observedSpentUsd':0,'allInHourlyRateUsd':10,'storageAllowanceUsd':0,'watchdogHeartbeatPath':str(heartbeat),'podId':'abcdef12345'};approval.write_text(json.dumps(value))
   with patch.dict(os.environ,{'RUNPOD_POD_ID':'abcdef12345'}),patch.object(gpu.time,'time',return_value=300):
    for age in [29,49,89,91,-1]:
     heartbeat.write_text(json.dumps({'podId':'abcdef12345','deadline':1000,'heartbeat':300-age}))
     if age in [91,-1]:
      with self.assertRaises(ValueError):gpu.beta_execution_admission(folder,{'parent':{'hfAdapterSha256':'parent'}},approval)
     else:gpu.beta_execution_admission(folder,{'parent':{'hfAdapterSha256':'parent'}},approval)
 def test_actual_multiset_rejects_known_duplicate_replacing_missing_row(self):
  a=('input-a','labels-a','attention-a');b=('input-b','labels-b','attention-b')
  callback.verify_dataset_multiset([b,a,a],[a,b,a])
  with self.assertRaises(ValueError):callback.verify_dataset_multiset([a,a,a],[a,a,b])
 def test_generation_never_exceeds_training_context(self):
  for prefix in [1,3072,4400,5119]:
   output=gpu.catalog_generation_budget(prefix,2048)
   self.assertLessEqual(prefix+output,5120);self.assertGreater(output,0)
  self.assertEqual(gpu.catalog_generation_budget(5100,2048),20)
  with self.assertRaises(ValueError):gpu.catalog_generation_budget(5120,2048)
 def test_framework_receipt_enforces_every_claim_before_weights(self):
  with tempfile.TemporaryDirectory()as name:
   root=Path(name);folder=root/'job';folder.mkdir();smoke=root/'framework-smoke';smoke.mkdir()
   (folder/'product-gpu-manifest.json').write_text('{}');(folder/'native-tokenization.json').write_text('{}')
   inputs={'result':'PASS','checkedRows':2350,'actualTrainerDatasetVerified':True,'trainerCollatorVerified':True,'actualTrainerDataloaderVerified':False,'gradientAccumulationSteps':5,'partialAccumulationWindows':0};(smoke/'actual-trainer-inputs.json').write_text(json.dumps(inputs))
   receipt={'status':'PASS','bundleManifestSha256':gpu.file_sha(folder/'product-gpu-manifest.json'),'nativeReceiptSha256':gpu.file_sha(folder/'native-tokenization.json'),'trainerInputsReceiptSha256':gpu.file_sha(smoke/'actual-trainer-inputs.json'),'runtime':{'transformers':'5.22.0','axolotl':'0.21.2.dev0','peft':'0.21.2','tokenizers':'0.23.3','llguidance':'1.9.1'},'pluginManagerUsed':True,'actualTrainerUsed':True,'toyScalarGradientChecks':2350,'gradientAccumulationSteps':5,'partialWindows':0,'nuknukModelLoaded':False,'nuknukTrainingExecuted':False,'activationAuthorized':False,'fullAxolotlCliVerified':False,'ociImageIdentityVerified':False}
   (smoke/'result.json').write_text(json.dumps(receipt));gpu.verify_beta_framework_smoke(folder)
   for key,value in [('runtime',{}),('gradientAccumulationSteps',4),('nuknukModelLoaded',True),('nuknukTrainingExecuted',True),('activationAuthorized',True),('trainerInputsReceiptSha256','bad')]:
    changed={**receipt,key:value};(smoke/'result.json').write_text(json.dumps(changed))
    with self.assertRaises(ValueError):gpu.verify_beta_framework_smoke(folder)
 def test_bound_probe(self):
  self.assertGreater(callback.catalog_estimate([100]+[2]*9,100,200,578),578*2)
  with self.assertRaises(ValueError):callback.catalog_estimate([float('nan')]*10,100,200,578)
 def test_budget_never_rolls_deadline_forward(self):
  self.assertEqual(watch.budget_deadline(100,0,10,50,5,'beta-catalog-50'),16300)
  with tempfile.TemporaryDirectory()as name:
   folder=Path(name);(folder/'product-gpu-manifest.json').write_text('{}');heartbeat=folder/'heartbeat.json';heartbeat.write_text(json.dumps({'podId':'abcdef12345','deadline':16200,'heartbeat':200}))
   approval=folder/'approval.json';value={'bundleManifestSha256':gpu.file_sha(folder/'product-gpu-manifest.json'),'parentAdapterSha256':'parent','executionAuthorized':True,'autoPay':False,'ownedPods':1,'totalCeilingUsd':50,'reserveUsd':5,'startedEpoch':100,'deadlineEpoch':16200,'observedSpentUsd':0,'allInHourlyRateUsd':10,'storageAllowanceUsd':0,'watchdogHeartbeatPath':str(heartbeat),'podId':'abcdef12345'};approval.write_text(json.dumps(value))
   with patch.dict(os.environ,{'RUNPOD_POD_ID':'abcdef12345'}),patch.object(gpu.time,'time',return_value=200):
    gpu.beta_execution_admission(folder,{'parent':{'hfAdapterSha256':'parent'}},approval)
    value['deadlineEpoch']=16400;approval.write_text(json.dumps(value))
    with self.assertRaisesRegex(ValueError,'deadline_exceeded'):gpu.beta_execution_admission(folder,{'parent':{'hfAdapterSha256':'parent'}},approval)
if __name__=='__main__':unittest.main()
