"""CPU-only callback contract tests, no ML runtime or network."""
import importlib.util
import sys
from pathlib import Path
from types import ModuleType
import unittest
modules={name:ModuleType(name) for name in ['axolotl','axolotl.integrations','axolotl.integrations.base','transformers']}
modules['axolotl.integrations.base'].BasePlugin=object
modules['transformers'].TrainerCallback=object
for name,value in modules.items():sys.modules[name]=value
spec=importlib.util.spec_from_file_location('callback',Path(__file__).with_name('nuknuk-beta-callback.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Tests(unittest.TestCase):
 def test_probe_uses_maximum_actual_step_and_length_scaling(self):
  self.assertEqual(module.estimate_remaining([5]*10,4000,5000,190),2226.5625)
  self.assertGreater(module.estimate_remaining([30]*10,2000,5000,190),4800)
 def test_invalid_or_missing_actual_measurements_are_rejected(self):
  for steps,tokens in [([],4000),([float('nan')]*10,4000),([5]*10,0)]:
   with self.assertRaises(ValueError):module.estimate_remaining(steps,tokens,5000,190)
if __name__=='__main__':unittest.main()

