"""CPU-only safeguards for remote checkpoint receipt. No SSH or credentials."""
import importlib.util
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('sync',Path(__file__).with_name('nuknuk-gpu-sync.py'))
sync=importlib.util.module_from_spec(spec);spec.loader.exec_module(sync)
class SyncTests(unittest.TestCase):
    def test_sync_failure_signals_watcher_and_does_not_refresh_heartbeat(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            args = SimpleNamespace(evidence_output=root/'evidence', require_evidence=True,
                stop_file=root/'stop', heartbeat_file=root/'heartbeat.json')
            with patch.object(sync, 'sync_evidence', side_effect=TimeoutError), patch.object(sync, 'scan') as scan:
                receipt = sync.sync_once(args)
            self.assertEqual(receipt['status'], 'SYNC_FAILED_REQUIRES_ATTENTION')
            self.assertTrue(receipt['stopRequired'])
            self.assertTrue(args.stop_file.exists())
            self.assertFalse(args.heartbeat_file.exists())
            scan.assert_not_called()
    def test_required_empty_evidence_is_not_a_successful_sync(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            args = SimpleNamespace(evidence_output=root/'evidence', require_evidence=True,
                stop_file=root/'stop', heartbeat_file=root/'heartbeat.json')
            with patch.object(sync, 'sync_evidence', return_value=0), patch.object(sync, 'scan') as scan:
                receipt = sync.sync_once(args)
            self.assertTrue(receipt['stopRequired'])
            scan.assert_not_called()
    def test_successful_replication_updates_transport_heartbeat_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            args = SimpleNamespace(evidence_output=root/'evidence', require_evidence=True,
                stop_file=root/'stop', heartbeat_file=root/'heartbeat.json')
            with patch.object(sync, 'sync_evidence', return_value=2), patch.object(sync, 'scan', return_value=[]):
                receipt = sync.sync_once(args)
            self.assertEqual(receipt['status'], 'SYNC_CHECKED')
            self.assertEqual(json.loads(args.heartbeat_file.read_text())['evidenceFiles'], 2)
            self.assertFalse(args.stop_file.exists())
    def test_legacy_sync_without_stop_or_heartbeat_options_remains_report_only(self):
        args = SimpleNamespace(evidence_output=None)
        with patch.object(sync, 'scan', side_effect=TimeoutError):
            receipt = sync.sync_once(args)
        self.assertEqual(receipt['status'], 'SYNC_FAILED_REQUIRES_ATTENTION')
        self.assertNotIn('stopRequired', receipt)
    def test_evidence_rejects_traversal_and_hash_mismatch_without_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);data=b'{}';sha=hashlib.sha256(data).hexdigest()
            for name,digest in [('../escape.json',sha),('/absolute.json',sha),('key.env',sha),('failure.json','0'*64)]:
                with self.assertRaises(ValueError):sync.save_evidence([{'path':name,'text':'{}','sha256':digest}],root)
                self.assertEqual(list(root.iterdir()),[])
    def test_evidence_updates_logs_and_preserves_exact_raw_response(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);name='final/selected24/r5-test-1.json';data='{"status":"FAILED","rawText":"unvollständig"}'
            row={'path':name,'text':data,'sha256':hashlib.sha256(data.encode()).hexdigest()}
            self.assertEqual(sync.save_evidence([row],root),1)
            self.assertEqual((root/name).read_text(),data)
    def test_evidence_cannot_escape_via_local_symlink(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as other:
            root=Path(tmp);(root/'escape').symlink_to(other,target_is_directory=True)
            with self.assertRaises(ValueError):sync.save_evidence([{'path':'escape/failure.json','text':'{}','sha256':hashlib.sha256(b'{}').hexdigest()}],root)
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
