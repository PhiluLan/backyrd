"""Boundaries of the synthetic component diagnostic; no model or MLX import."""
import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('probe', Path(__file__).with_name('nuknuk-memory-probe.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class GatedMemoryBoundaries(unittest.TestCase):
    def fixture(self, root):
        files = {}
        for name in ['probe-source', 'native-source', 'guard-source', 'comparison-source', 'gated-delta-source',
                     'previous-stop', 'previous-restore']:
            value = {'action': 'STOP_TECHNICAL_FAILURE'} if name == 'previous-stop' else (
                {'status': 'HEALTHY_ORIGINAL_RESTORED'} if name == 'previous-restore' else {'source': name})
            p = root / (name + '.json'); p.write_text(json.dumps(value))
            files[name] = {'path': str(p), 'sha256': probe.digest(p)}
        value = {'kind': probe.GATED_KIND, 'shape': probe.GATED_SHAPE, 'seed': 7,
                 'cases': [list(c) for c in probe.GATED_CASES], 'childTimeoutSeconds': 300,
                 'referenceTolerance': {'rtol': 0.001, 'atol': 0.0001}, 'files': files,
                 'runtimeVersions': {'mlx': '0.32.3', 'mlx-vlm': '0.7.8'},
                 **{k: False for k in ['cloudAllowed', 'productionActivation', 'optimizerAllowed', 'modelWeightsLoaded']}}
        p = root / 'plan.json'; p.write_text(json.dumps(value)); return p, value

    def test_plan_and_bound_bytes_are_immutable(self):
        with tempfile.TemporaryDirectory() as temp:
            p, value = self.fixture(Path(temp)); digest = probe.digest(p)
            self.assertEqual(probe.verify_gated_plan(p, digest), value)
            Path(value['files']['probe-source']['path']).write_text('changed')
            with self.assertRaisesRegex(ValueError, 'bound_file_changed'):
                probe.verify_gated_plan(p, digest)

    def test_no_recipe_model_tolerance_or_shape_expansion(self):
        for key, change in [('optimizerAllowed', True), ('modelWeightsLoaded', True), ('cloudAllowed', True),
                            ('shape', {}), ('cases', [['gradient', 4134]]), ('referenceTolerance', {'rtol': 1, 'atol': 1})]:
            with self.subTest(key=key), tempfile.TemporaryDirectory() as temp:
                p, value = self.fixture(Path(temp)); value[key] = change; p.write_text(json.dumps(value))
                with self.assertRaisesRegex(ValueError, 'configuration_invalid'):
                    probe.verify_gated_plan(p, probe.digest(p))

    def test_previous_original_restore_is_required(self):
        with tempfile.TemporaryDirectory() as temp:
            p, value = self.fixture(Path(temp)); entry = value['files']['previous-restore']
            Path(entry['path']).write_text('{"status":"UNCONFIRMED"}'); entry['sha256'] = probe.digest(entry['path'])
            p.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, 'previous_run_not_closed'):
                probe.verify_gated_plan(p, probe.digest(p))

    def test_failed_child_stops_before_any_larger_case(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            args = SimpleNamespace(session=root, gated_plan=root/'plan.json', manifest_sha256='bound')
            parent = str(Path(probe.__file__).with_name('nuknuk-resource-guard.py')) + ' ' + str(root/'resources.json')
            with patch.object(probe.subprocess, 'check_output', return_value=parent), \
                    patch.object(probe.subprocess, 'run', return_value=SimpleNamespace(returncode=1)) as run:
                with self.assertRaisesRegex(RuntimeError, 'no_larger_stage'):
                    probe.gated_sequence(args, {'python': 'synthetic-python', 'childTimeoutSeconds': 300})
            self.assertEqual(run.call_count, 1)
            self.assertFalse((root/'result.json').exists())
            self.assertEqual(json.loads((root/'diagnostic-stop.json').read_text())['case'], '00-reference-64')

    def test_timeout_stops_after_exactly_one_child(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            args = SimpleNamespace(session=root, gated_plan=root/'plan.json', manifest_sha256='bound')
            parent = str(Path(probe.__file__).with_name('nuknuk-resource-guard.py')) + ' ' + str(root/'resources.json')
            error = probe.subprocess.TimeoutExpired('synthetic', 300)
            with patch.object(probe.subprocess, 'check_output', return_value=parent), \
                    patch.object(probe.subprocess, 'run', side_effect=error) as run:
                with self.assertRaises(probe.subprocess.TimeoutExpired):
                    probe.gated_sequence(args, {'python': 'synthetic-python', 'childTimeoutSeconds': 300})
            self.assertEqual(run.call_count, 1)
            self.assertEqual(json.loads((root/'diagnostic-stop.json').read_text())['status'], 'TIMEOUT')

    def test_primary_completion_survives_later_validation_failure(self):
        marks = []
        mx = SimpleNamespace(eval=Mock(), synchronize=Mock(), get_active_memory=lambda: 10,
                             get_cache_memory=lambda: 2, get_peak_memory=lambda: 20)
        snapshot = probe.primary_evaluation(mx, 'synthetic-values', 0, marks.append)
        self.assertEqual(marks, ['PRIMARY_EVAL_COMPLETE'])
        self.assertEqual(snapshot['peakBytes'], 20)
        checks = probe.gated_checks(False)
        self.assertEqual(checks['status'], 'NONFINITE_PRIMARY')
        self.assertEqual(marks, ['PRIMARY_EVAL_COMPLETE'])

    def test_reference_tolerance_nonfinite_state_and_metrics_never_pass(self):
        good = [{'allClose': True, 'maxAbsError': 0.0, 'normalizedL2Error': 0.0}]
        self.assertEqual(probe.gated_checks(True, [1.0], True, good)['status'], 'PASS')
        bad_tolerance = [{'allClose': False, 'maxAbsError': 0.1, 'normalizedL2Error': 0.1}]
        self.assertEqual(probe.gated_checks(True, [1.0], True, bad_tolerance)['status'], 'REFERENCE_TOLERANCE_FAILURE')
        self.assertEqual(probe.gated_checks(True, [1.0], False, good)['status'], 'NONFINITE_REFERENCE')
        bad_metric = [{'allClose': True, 'maxAbsError': float('inf'), 'normalizedL2Error': float('nan')}]
        checks = probe.gated_checks(True, [1.0], True, bad_metric)
        self.assertEqual(checks['status'], 'NONFINITE_REFERENCE')
        self.assertFalse(checks['allChecksPassed'])
        self.assertEqual(probe.finite_json(bad_metric)[0]['maxAbsError'], None)
        self.assertEqual(probe.gated_checks(True, [0.0])['status'], 'ZERO_GRADIENT')

    def test_zero_exit_without_receipt_does_not_advance(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            args = SimpleNamespace(session=root, gated_plan=root/'plan.json', manifest_sha256='bound')
            parent = str(Path(probe.__file__).with_name('nuknuk-resource-guard.py')) + ' ' + str(root/'resources.json')
            with patch.object(probe.subprocess, 'check_output', return_value=parent), \
                    patch.object(probe.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as run:
                with self.assertRaisesRegex(RuntimeError, 'no_larger_stage'):
                    probe.gated_sequence(args, {'python': 'synthetic-python', 'childTimeoutSeconds': 300})
            self.assertEqual(run.call_count, 1)


if __name__ == '__main__':
    unittest.main()
