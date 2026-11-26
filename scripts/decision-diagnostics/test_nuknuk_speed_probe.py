"""Speed benchmark boundaries; only the logits-mask test imports tiny CPU MLX."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('speed', Path(__file__).with_name('nuknuk-speed-probe.py'))
speed = importlib.util.module_from_spec(spec); spec.loader.exec_module(speed)


class SpeedBoundaries(unittest.TestCase):
    def test_roster_has_fixed_pair_order_and_separate_warmups(self):
        rows = speed.roster()
        self.assertEqual(len(rows), 34)
        self.assertEqual(sum(r['warmup'] for r in rows), 7)
        for case in range(3):
            paired = [r['mode'] for r in rows if r['case'] == case and not r['warmup'] and r['mode'].startswith('trace')]
            self.assertEqual(paired, ['trace', 'trace_grammar', 'trace_grammar', 'trace', 'trace', 'trace_grammar'])

    def test_scope_rejects_training_or_new_matrix(self):
        payload = {'evaluation': [{'id': str(i)} for i in range(33)]}
        plan = {'speedConfig': speed.CONFIG.copy(), 'optimizerAllowed': False, 'benchmarkRoster': speed.roster(),
                'files': {'speed-source': {}, 'speed-tests': {}, 'speed-trace-preflight': {}}, 'speedRowIds': ['0', '12', '32']}
        speed.verify(plan, payload)
        for key, value in [('optimizerAllowed', True), ('benchmarkRoster', []), ('speedRowIds', ['other'])]:
            with self.assertRaisesRegex(ValueError, 'scope_invalid'):
                speed.verify({**plan, key: value}, payload)

    def test_failed_json_and_warmups_never_become_successful_fast_answers(self):
        def row(seconds, **extra):
            return {'mode': 'actual_grammar', 'warmup': False, 'finishReason': 'stop', 'jsonParses': True,
                    'ttftSeconds': 1, 'completeSeconds': seconds, 'decodeWallTokensPerSecond': 20, **extra}
        value = speed.summarize([row(0.1, finishReason='length'), row(0.2, jsonParses=False), row(0.01, warmup=True), row(9)])
        self.assertEqual(value['actual_grammar']['attempts'], 3)
        self.assertEqual(value['actual_grammar']['qualified'], 1)
        self.assertEqual(value['actual_grammar']['completeSeconds']['min'], 9)

    def test_temporary_attribute_restores_on_failure(self):
        previous = object(); obj = SimpleNamespace(stopping_criteria=previous)
        with self.assertRaises(RuntimeError):
            with speed.temporary_attribute(obj, 'stopping_criteria', lambda token: False):
                raise RuntimeError('synthetic')
        self.assertIs(obj.stopping_criteria, previous)

    def test_profile_preserves_required_processor_protocol(self):
        class Grammar:
            requires_immediate_decode_yield = True
            def __call__(self, tokens, logits): return logits
        wrapped = speed.TimedProcessor(Grammar())
        self.assertTrue(wrapped.requires_immediate_decode_yield)
        self.assertEqual(wrapped([], 'logits'), 'logits')
        self.assertEqual(wrapped.calls, 1)


class TinyCpuTrace(unittest.TestCase):
    def test_actual_dispatch_binding_and_wired_restore_on_exception(self):
        import mlx.core as mx
        from mlx_vlm.generate import dispatch
        previous = dispatch.wired_limit
        limit = 24 * 1024**3
        with patch.object(mx, 'set_wired_limit', return_value=limit) as set_limit, patch.object(mx, 'synchronize') as sync:
            with self.assertRaisesRegex(RuntimeError, 'synthetic'):
                with speed.temporary_attribute(dispatch, 'wired_limit', speed.bounded_wired):
                    self.assertIs(dispatch.stream_generate.__globals__['wired_limit'], speed.bounded_wired)
                    with dispatch.wired_limit(None, ['synthetic-stream']):
                        raise RuntimeError('synthetic')
            self.assertEqual([c.args[0] for c in set_limit.call_args_list], [limit, limit])
            sync.assert_called_once_with('synthetic-stream')
        self.assertIs(dispatch.wired_limit, previous)

    def test_wired_limit_never_restores_a_higher_inherited_value(self):
        import mlx.core as mx
        with patch.object(mx, 'set_wired_limit', return_value=32 * 1024**3) as setter:
            with self.assertRaisesRegex(ValueError, 'over_contract'):
                with speed.bounded_wired(None):
                    self.fail('must not enter')
            setter.assert_called_once_with(24 * 1024**3)

    def test_forced_trace_keeps_grammar_forbidden_token_forbidden_and_bounds_lookahead(self):
        import mlx.core as mx
        mx.set_default_device(mx.cpu)
        trace = speed.ScriptedTrace([1, 2])
        logits = mx.array([[1.0, -float('inf'), 3.0, 4.0]])
        first = trace(mx.array([0]), logits)
        self.assertTrue(bool(mx.all(mx.isneginf(first)).item()))
        second = trace(mx.array([0, 1]), logits)
        self.assertEqual(second[0, 2].item(), 3.0)
        third = trace(mx.array([0, 1, 2]), logits)
        self.assertEqual(third[0, 2].item(), 3.0)


if __name__ == '__main__':
    unittest.main()
