"""CPU-only safeguards for remote checkpoint receipt. No SSH or credentials."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('sync',Path(__file__).with_name('nuknuk-gpu-sync.py'))
sync=importlib.util.module_from_spec(spec);spec.loader.exec_module(sync)
class SyncTests(unittest.TestCase):
    def args(self,root):
        return SimpleNamespace(ssh_key=Path('not-read'),known_hosts=Path('not-read'),host='127.0.0.1',port=22,output=root)
    def test_remote_root_is_bounded_before_ssh(self):
        a=self.args(Path('unused'));a.remote_root='/workspace/../../escape'
        with patch.object(sync.subprocess,'run') as run:
            with self.assertRaisesRegex(ValueError,'remote_root_invalid'):sync.scan(a)
            run.assert_not_called()
    def test_remote_traversal_absolute_and_invalid_hash_are_rejected_before_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name,digest in [('../escape','a'*64),('/absolute','a'*64),('safe/path','not-a-hash')]:
                with patch.object(sync.subprocess,'run',return_value=SimpleNamespace(stdout=json.dumps([{'path':name,'metadata':{'adapterSha256':digest}}]))) as run:
                    with self.assertRaisesRegex(ValueError,'untrusted_checkpoint_path'):sync.scan(self.args(Path(tmp)))
                    self.assertEqual(run.call_count,1)
    def test_changed_existing_checkpoint_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);p=root/'safe';p.mkdir();(p/'adapter_model.safetensors').write_bytes(b'previous-checkpoint')
            with patch.object(sync.subprocess,'run',return_value=SimpleNamespace(stdout=json.dumps([{'path':'safe','metadata':{'adapterSha256':'a'*64}}]))) as run:
                with self.assertRaisesRegex(ValueError,'existing_checkpoint_changed'):sync.scan(self.args(root))
                self.assertEqual(run.call_count,1)
                self.assertEqual((p/'adapter_model.safetensors').read_bytes(),b'previous-checkpoint')
if __name__=='__main__':unittest.main()
