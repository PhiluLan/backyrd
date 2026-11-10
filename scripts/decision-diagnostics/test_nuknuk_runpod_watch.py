"""Budget arithmetic and credential safety, no network, Pods or model loading."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('watch',Path(__file__).with_name('nuknuk-runpod-watch.py'))
watch=importlib.util.module_from_spec(spec);spec.loader.exec_module(watch)
class WatchTests(unittest.TestCase):
    def snapshot(self):
        return {'id': 'approvedpod123', 'desiredStatus': 'RUNNING', 'costPerHr': 4.0,
                'runtime': {'uptimeInSeconds': 12}}
    def test_only_explicit_known_running_or_stopped_snapshots_are_valid(self):
        self.assertEqual(watch.validate_pod_snapshot(self.snapshot()), (True, 4.0))
        stopped = {**self.snapshot(), 'desiredStatus': 'EXITED', 'runtime': None}
        self.assertEqual(watch.validate_pod_snapshot(stopped), (False, 4.0))
        invalid = [None, {}, {**self.snapshot(), 'desiredStatus': 'UNKNOWN'},
                   {**self.snapshot(), 'runtime': None}, {**stopped, 'runtime': {}},
                   {k: v for k, v in stopped.items() if k != 'runtime'}]
        invalid += [{**self.snapshot(), 'costPerHr': rate} for rate in (None, 0, -1, float('nan'), float('inf'), True, 'unknown')]
        invalid += [{**self.snapshot(), 'runtime': runtime} for runtime in ({}, [], {'uptimeInSeconds': -1}, {'uptimeInSeconds': float('nan')}, {'uptimeInSeconds': True})]
        for pod in invalid:
            with self.subTest(pod=pod), self.assertRaises(ValueError):
                watch.validate_pod_snapshot(pod)
    def test_unknown_or_absent_pod_stops_only_bound_pod_until_stop_confirmed(self):
        for first in ([], [{**self.snapshot(), 'costPerHr': None}],
                      [self.snapshot(), {'id': 'otherpod123', 'desiredStatus': 'UNKNOWN'}]):
            with self.subTest(first=first), tempfile.TemporaryDirectory() as tmp:
                args = SimpleNamespace(pod='approvedpod123', started=1000, deadline=10000,
                    prior_usd=0, hourly_usd=4, ceiling_usd=20, reserve_usd=2,
                    log=Path(tmp)/'watch.jsonl', stop_file=Path(tmp)/'stop', key_file=None)
                stopped = [{**self.snapshot(), 'desiredStatus': 'EXITED', 'runtime': None}]
                with patch.object(watch, 'status', side_effect=[first, stopped]), patch.object(watch, 'stop') as stop, patch.object(watch.time, 'sleep'):
                    watch.watch(args)
                stop.assert_called_once_with(None, 'approvedpod123')
                self.assertIn('STATUS_FAILURE_STOP_REQUIRED', args.log.read_text())
                self.assertIn('STOP_CONFIRMED', args.log.read_text())
    def test_budget_includes_prior_use_and_shutdown_reserve(self):
        self.assertEqual(watch.budget_deadline(1000,2,4,20,2),15400)
    def test_full_budget_requires_explicit_profile_and_twenty_dollar_reserve(self):
        self.assertEqual(watch.budget_deadline(1000, 2, 6, 200, 20, 'v7-full-200'), 107800)
        self.assertEqual(watch.budget_deadline(1000, 2, 6, 80, 20, 'v7-full-200'), 35800)
        for profile, ceiling, reserve in [('legacy-20', 200, 20), ('unknown', 20, 2),
                                         ('v7-full-200', 201, 20), ('v7-full-200', 200, 19.99),
                                         ('v7-full-200', 22, 20)]:
            with self.subTest(profile=profile, ceiling=ceiling, reserve=reserve), self.assertRaises(ValueError):
                watch.budget_deadline(1000, 2, 6, ceiling, reserve, profile)
    def test_full_budget_rejects_nonfinite_cost_and_start_arguments(self):
        for index in range(5):
            for value in (float('nan'), float('inf'), -float('inf')):
                args = [1000, 2, 6, 200, 20]
                args[index] = value
                with self.subTest(index=index, value=value), self.assertRaises(ValueError):
                    watch.budget_deadline(*args, budget_profile='v7-full-200')
    def test_nonfinite_fixed_deadline_is_rejected_before_any_status_call(self):
        for deadline in (float('nan'), float('inf')):
            with patch.object(watch, 'status') as status:
                with self.assertRaisesRegex(ValueError, 'deadline_invalid'):
                    watch.watch(SimpleNamespace(pod='approvedpod123', deadline=deadline))
                status.assert_not_called()
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
