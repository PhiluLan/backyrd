"""CPU-only safeguards for remote checkpoint receipt. No SSH or credentials."""
import importlib.util
import hashlib
import json
import contextlib
import io
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('sync',Path(__file__).with_name('nuknuk-gpu-sync.py'))
sync=importlib.util.module_from_spec(spec);spec.loader.exec_module(sync)
class SyncTests(unittest.TestCase):
    def evidence_row(self, name, text):
        return {'path': name, 'text': text, 'sha256': hashlib.sha256(text.encode()).hexdigest()}
    def test_incremental_empty_delta_reverifies_existing_evidence_without_rewriting(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            row = self.evidence_row('phase/request.json', '{"request":1}')
            sync.save_evidence([row], root)
            known = sync.evidence_inventory(root)
            before = (root/row['path']).stat().st_mtime_ns
            payload = {'files': [], 'unchanged': [{'path': row['path'], 'sha256': row['sha256']}]}
            self.assertEqual(sync.save_incremental_evidence(payload, root, known), 1)
            self.assertEqual((root/row['path']).stat().st_mtime_ns, before)
            self.assertEqual(sync.save_incremental_evidence({'files': [], 'unchanged': []}, root, known), 0)
    def test_incremental_changed_bytes_update_hash_and_preserve_other_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            initial = self.evidence_row('phase/result.json', '{"status":"running"}')
            retained = self.evidence_row('earlier.json', '{}')
            sync.save_evidence([initial, retained], root)
            known = sync.evidence_inventory(root)
            changed = self.evidence_row(initial['path'], '{"status":"complete"}')
            self.assertEqual(sync.save_incremental_evidence({'files': [changed], 'unchanged': []}, root, known), 1)
            self.assertEqual((root/changed['path']).read_text(), changed['text'])
            self.assertTrue((root/'earlier.json').exists())
            self.assertEqual(sync.evidence_inventory(root)[changed['path']], changed['sha256'])
    def test_incremental_rejects_forged_inventory_and_malformed_or_oversized_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            good = self.evidence_row('good.json', '{}')
            sync.save_evidence([good], root)
            known = sync.evidence_inventory(root)
            bad_payloads = [
                {'files': [], 'unchanged': [{'path': '../escape.json', 'sha256': good['sha256']}]},
                {'files': [], 'unchanged': [{'path': 'good.json', 'sha256': 'a'*64}]},
                {'files': [self.evidence_row('big.log', 'x'*(2*1024**2+1))], 'unchanged': []},
                {'files': [self.evidence_row('phase//bad.json', '{}')], 'unchanged': []},
                {'files': 'not-a-list', 'unchanged': []},
            ]
            for payload in bad_payloads:
                with self.subTest(payload_type=type(payload['files'])), self.assertRaises(ValueError):
                    sync.save_incremental_evidence(payload, root, known)
            (root/'good.json').write_text('{"locally_changed":true}')
            with self.assertRaisesRegex(ValueError, 'inventory_mismatch'):
                sync.save_incremental_evidence({'files': [], 'unchanged': [{'path': 'good.json', 'sha256': good['sha256']}]}, root, known)
    def test_full_remote_scan_initial_recovery_above_legacy_cap_then_changed_only(self):
        with tempfile.TemporaryDirectory() as remote, tempfile.TemporaryDirectory() as local:
            source, output = Path(remote), Path(local)
            text = 'x'*(2*1024**2)
            for i in range(11):
                (source/f'part-{i}.log').write_text(text)
            def capture(known, full):
                stream = io.StringIO()
                with contextlib.redirect_stdout(stream):
                    exec(sync.REMOTE_EVIDENCE, {'REMOTE_ROOT': str(source), 'KNOWN_FILES': known, 'FULL_PROFILE': full})
                return json.loads(stream.getvalue())
            with self.assertRaisesRegex(ValueError, 'transfer_limit'):
                capture({}, False)
            first = capture({}, True)
            self.assertEqual(len(first['files']), 11)
            self.assertEqual(sync.save_incremental_evidence(first, output, {}), 11)
            known = sync.evidence_inventory(output)
            second = capture(known, True)
            self.assertEqual(second['files'], [])
            self.assertEqual(len(second['unchanged']), 11)
            (source/'part-0.log').write_text('updated')
            third = capture(known, True)
            self.assertEqual([row['path'] for row in third['files']], ['part-0.log'])
            self.assertEqual(len(third['unchanged']), 10)
            self.assertEqual(sync.save_incremental_evidence(third, output, known), 11)
    def test_local_inventory_rejects_symlinks_and_unsafe_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'unsafe name.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'untrusted_evidence'):
                sync.evidence_inventory(root)
            (root/'unsafe name.json').unlink()
            (root/'link.json').symlink_to(root/'missing.json')
            with self.assertRaisesRegex(ValueError, 'symlink'):
                sync.evidence_inventory(root)
    def test_full_recovery_rejects_aggregate_above_sixty_four_mib_before_any_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            text = 'x'*(2*1024**2)
            rows = [self.evidence_row(f'part-{i}.log', text) for i in range(33)]
            with self.assertRaisesRegex(ValueError, 'path_or_size'):
                sync.save_incremental_evidence({'files': rows, 'unchanged': []}, root, {})
            self.assertEqual(list(root.iterdir()), [])
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
