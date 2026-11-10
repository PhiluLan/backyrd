"""Budget arithmetic and credential safety, no network, Pods or model loading."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('watch',Path(__file__).with_name('nuknuk-runpod-watch.py'))
watch=importlib.util.module_from_spec(spec);spec.loader.exec_module(watch)
class WatchTests(unittest.TestCase):
    def test_budget_includes_prior_use_and_shutdown_reserve(self):
        self.assertEqual(watch.budget_deadline(1000,2,4,20,2),15400)
    def test_invalid_or_over_ceiling_budget_is_rejected(self):
        for args in [(0,0,4,21,2),(0,19,4,20,2),(0,1,0,20,2),(0,1,4,20,0),(float('nan'),1,4,20,2)]:
            with self.assertRaises(ValueError):watch.budget_deadline(*args)
    def test_insecure_secret_file_is_rejected_before_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'key';p.write_text('not-a-real-secret');p.chmod(0o644)
            with self.assertRaisesRegex(ValueError,'permissions'):watch.query(p,'{}')
            p.chmod(0o600)
            with self.assertRaisesRegex(ValueError,'format'):watch.query(p,'{}')
    def test_stop_rejects_untrusted_pod_identifiers_before_network(self):
        with self.assertRaisesRegex(ValueError,'pod_id_invalid'):watch.stop(Path('/not-read'),'x"mutation')
    def test_container_stop_cannot_target_another_pod(self):
        with patch.object(watch,'container_identity',return_value=('approvedpod123','not-a-real-secret')),patch.object(watch,'query') as query:
            with self.assertRaisesRegex(ValueError,'own_pod_only'):watch.stop(None,'otherpod123')
            query.assert_not_called()
            watch.stop(None,'approvedpod123')
            self.assertEqual(query.call_args.args[2],{'id':'approvedpod123'})
    def test_container_status_only_queries_own_pod(self):
        with patch.object(watch,'container_identity',return_value=('approvedpod123','not-a-real-secret')),patch.object(watch,'query',return_value={'pod':{'id':'approvedpod123'}}) as query:
            self.assertEqual(watch.status(None),[{'id':'approvedpod123'}])
            self.assertEqual(query.call_args.args[2],{'id':'approvedpod123'})
            self.assertNotIn('myself',query.call_args.args[1])
if __name__=='__main__':unittest.main()
