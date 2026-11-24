"""CPU-only callback contract tests, no ML runtime or network."""
import importlib.util
import sys
from pathlib import Path
from types import ModuleType
import unittest
import tempfile
from types import SimpleNamespace
from unittest.mock import patch,Mock
modules={name:ModuleType(name) for name in ['axolotl','axolotl.integrations','axolotl.integrations.base','transformers']}
modules['axolotl.integrations.base'].BasePlugin=object
modules['transformers'].TrainerCallback=object
for name,value in modules.items():sys.modules[name]=value
spec=importlib.util.spec_from_file_location('callback',Path(__file__).with_name('nuknuk-beta-callback.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Tests(unittest.TestCase):
 def test_probe_uses_maximum_actual_step_and_length_scaling(self):
  self.assertEqual(module.estimate_remaining([5]*10,4000,5000,190),2226.5625)
  self.assertGreater(module.estimate_remaining([30]*10,2000,5000,190),4800)
 def test_actual_abort_reproducer_counts_initialization_once(self):
  steps=[127.604324267013,9.861515726,9.855308608,11.852597625,10.737376852,9.745876809,9.966629478,9.779909655,9.934292073,10.425917034]
  self.assertLess(module.estimate_remaining(steps,4352,4984,190),5100-368.045)
  self.assertGreater(module.estimate_remaining([127.604]+[30]*9,4352,4984,190),4800)
 def test_callback_replay_keeps_elapsed_deadline_even_after_excluding_initialization(self):
  for spent,expected in [(148,'TRAINING'),(4000,'ABORT_SLOW_PROBE')]:
   with self.subTest(spent=spent),tempfile.TemporaryDirectory()as tmp:
    clock=[100.0];model=Mock();args=SimpleNamespace(gradient_accumulation_steps=4,per_device_train_batch_size=1,num_train_epochs=1)
    state=SimpleNamespace(max_steps=200,global_step=0);control=SimpleNamespace(should_training_stop=False,should_save=False)
    with patch.dict(module.os.environ,{'BACKYRD_TRAINING_RECEIPTS':tmp,'BACKYRD_MAXIMUM_TRAIN_TOKENS':'4984'}),patch.object(module.time,'monotonic',side_effect=lambda:clock[0]):
     cb=module.BetaCallback(model);cb.on_train_begin(args,state,control);clock[0]+=spent
     for index in range(10):
      cb.on_step_begin(args,state,control);cb.lengths.append(4352);clock[0]+=127.604 if index==0 else 10;state.global_step=index+1;cb.on_step_end(args,state,control)
     receipt=module.json.loads((Path(tmp)/'beta-progress.json').read_text());self.assertEqual(receipt['status'],expected);self.assertTrue(receipt['initializationIncludedInElapsedBudget']);self.assertEqual(receipt['probeVersion'],2)
     self.assertEqual(control.should_training_stop,expected=='ABORT_SLOW_PROBE');self.assertGreater(receipt['elapsedSeconds'],spent+200)
 def test_invalid_or_missing_actual_measurements_are_rejected(self):
  for steps,tokens in [([],4000),([float('nan')]*10,4000),([5]*10,0)]:
   with self.assertRaises(ValueError):module.estimate_remaining(steps,tokens,5000,190)
if __name__=='__main__':unittest.main()

