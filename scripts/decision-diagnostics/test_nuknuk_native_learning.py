"""Native learning boundaries; the MLX tests use a tiny CPU-only model."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('native', Path(__file__).with_name('nuknuk-native-learning.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class NativeBoundaries(unittest.TestCase):
    def test_full_gradient_diagnostic_requires_passed_pair_and_no_updates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path, payload, plan = self.fixture(root)
            paired = root/'paired.json'
            paired.write_text(json.dumps({'status': 'PASS', 'memoryReductionFraction': 0.20058,
                'referenceWithinTolerance': True, 'referenceFinite': True}))
            restore = root/'restored.json'; restore.write_text('{"status":"HEALTHY_ORIGINAL_RESTORED"}')
            for key in ['inverse-source', 'paired-candidate', 'paired-baseline', 'paired-review']:
                plan['files'][key] = {'path': str(paired), 'sha256': native.sha(paired)}
            plan['files']['paired-restore'] = {'path': str(restore), 'sha256': native.sha(restore)}
            plan.update(kind=native.GRADIENT_DIAGNOSTIC_KIND, optimizerAllowed=False, gradientAttempts=1,
                        workerTimeoutSeconds=300, useUnitInverseVjp=True, probeRowId='0')
            path.write_text(json.dumps(plan))
            with patch.object(native, 'verify_model_choice_seed'):
                native.verify_plan(path, native.sha(path))
                plan['optimizerAllowed'] = True; path.write_text(json.dumps(plan))
                with self.assertRaisesRegex(ValueError, 'diagnostic_scope_invalid'):
                    native.verify_plan(path, native.sha(path))

    def test_full_gradient_diagnostic_rejects_second_recipe_before_live_pause(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, 'has_no_second_recipe'):
                native.execute(SimpleNamespace(native_plan=Path(tmp)/'plan.json', recipe='B'),
                               {'kind': native.GRADIENT_DIAGNOSTIC_KIND})

    def test_model_choice_rejects_another_base_before_loading(self):
        with self.assertRaisesRegex(ValueError, 'base_not_selected_9b'):
            native.verify_model_choice_seed({'model': '/synthetic/another-base'})

    def test_model_choice_seed_checks_all64_shapes_and_zero_delta(self):
        import struct
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base = root / '8b2b98c00a6b4d291155e4890773ca8f769aee53'
            base.mkdir()
            (base / 'config.json').write_text(json.dumps({'text_config': {'hidden_size': 4096, 'num_hidden_layers': 32},
                'quantization': {'group_size': 64, 'bits': 4, 'mode': 'affine'}}))
            adapter = root / 'seed'
            adapter.mkdir()
            keys = sorted(f'language_model.model.layers.{i}.self_attn.{p}_proj' for i in range(3, 32, 4) for p in ['q', 'k', 'v', 'o'])
            (adapter / 'adapter_config.json').write_text(json.dumps({'fine_tune_type': 'lora', 'num_layers': -1,
                'lora_parameters': {'rank': 16, 'scale': 2.0, 'dropout': 0.0, 'keys': keys}}))
            header, parts, offset = {}, [], 0
            for key in keys:
                output = {'q_proj': 8192, 'k_proj': 1024, 'v_proj': 1024, 'o_proj': 4096}[key.split('.')[-1]]
                for suffix, shape in [('.lora_a', [4096, 16]), ('.lora_b', [16, output])]:
                    data = (struct.pack('<f', .001) if suffix == '.lora_a' else b'\0' * 4) * (shape[0] * shape[1])
                    header[key + suffix] = {'dtype': 'F32', 'shape': shape, 'data_offsets': [offset, offset + len(data)]}
                    parts.append(data)
                    offset += len(data)
            raw_header = json.dumps(header).encode()
            seed = adapter / 'adapters.safetensors'
            seed.write_bytes(struct.pack('<Q', len(raw_header)) + raw_header + b''.join(parts))
            previous, session = root / 'previous.json', root / 'session.json'
            previous.write_text(json.dumps({'stopReason': 'MODEL_GROUP_PHYSICAL_FOOTPRINT_OVER_28_GIB',
                'candidateProduced': False, 'originalRestored': 'HEALTHY_ORIGINAL_RESTORED'}))
            session.write_text('{"live":{"model":"original-live"}}')
            plan = {'model': str(base), 'adapter': str(adapter), 'liveModel': 'original-live',
                    'files': {'previous-memory-failure': {'path': str(previous)}, 'previous-live-session': {'path': str(session)}}}
            native.verify_model_choice_seed(plan)
            with seed.open('r+b') as stream:
                entry = next(v for k, v in header.items() if k.endswith('.lora_b'))
                stream.seek(8 + len(raw_header) + entry['data_offsets'][0])
                stream.write(struct.pack('<f', 1.0))
            with self.assertRaisesRegex(ValueError, 'not_zero_delta'):
                native.verify_model_choice_seed(plan)

    def test_prefix_observer_restores_method_without_retaining_model(self):
        import weakref
        class Model:
            def get_input_embeddings(self, ids):
                return ids
        class Ids:
            def tolist(self):
                return [[1, 2, 3]]
        model, actual = Model(), []
        reference = weakref.ref(model)
        with native.generation_prefix_observer(model, [1, 2, 3], actual):
            model.get_input_embeddings(Ids())
        self.assertNotIn('get_input_embeddings', vars(model))
        self.assertEqual(actual, [1, 2, 3])
        del model
        self.assertIsNone(reference())

    def fixture(self, root):
        def row(i, split):
            return {'id': str(i), 'family': str(i), 'scenarioGroup': str(i), 'split': split,
                    'messages': [{'role': 'system'}, {'role': 'user'}], 'target': '{}', 'outputSchema': {'type': 'object'}}
        train = [row(i, 'TRAIN') for i in range(40)]
        dev = [row(i + 40, 'DEV') for i in range(24)]
        payload = root / 'payload.json'
        payload.write_text(json.dumps({'train': train, 'dev': dev, 'evaluation': train[:12] + dev}))
        adapter = root / 'adapter'
        adapter.mkdir()
        (adapter / 'adapters.safetensors').write_bytes(b'synthetic-live')
        (adapter / 'adapter_config.json').write_text('{}')
        live_hash = native.sha(adapter / 'adapters.safetensors')
        temporary_boundary = patch.object(native, 'module', return_value=SimpleNamespace(LIVE_SHA=live_hash))
        temporary_boundary.start()
        self.addCleanup(temporary_boundary.stop)
        value = {'kind': 'NATIVE_MLX_LEARNING_PILOT_V1', 'cloudAllowed': False, 'productionActivation': False,
                 'maxTotalTokens': 5120, 'liveAdapterSha256': live_hash, 'adapter': str(adapter),
                 'liveAdapterConfigSha256': native.sha(adapter / 'adapter_config.json'),
                 'recipes': {'A': {'steps': 80, 'learningRate': 2e-6}, 'B': {'steps': 80, 'learningRate': 1e-5}},
                 'files': {'payload': {'path': str(payload), 'sha256': native.sha(payload)}}}
        path = root / 'plan.json'
        path.write_text(json.dumps(value))
        return path, payload, value

    def test_frozen_plan_and_payload_mutation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path, payload, _ = self.fixture(Path(tmp))
            digest = native.sha(path)
            native.verify_plan(path, digest)
            payload.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'bound_input_changed'):
                native.verify_plan(path, digest)

    def test_scenario_siblings_cannot_cross_train_dev(self):
        with tempfile.TemporaryDirectory() as tmp:
            path, payload, value = self.fixture(Path(tmp))
            p = native.read(payload)
            p['dev'][0]['scenarioGroup'] = p['train'][0]['scenarioGroup']
            payload.write_text(json.dumps(p))
            value['files']['payload']['sha256'] = native.sha(payload)
            path.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, 'split_leakage'):
                native.verify_plan(path, native.sha(path))

    def test_live_identity_cannot_be_asserted_over_another_adapter(self):
        with tempfile.TemporaryDirectory() as tmp:
            path, _, value = self.fixture(Path(tmp))
            (Path(value['adapter']) / 'adapters.safetensors').write_bytes(b'experimental')
            with self.assertRaisesRegex(ValueError, 'initial_adapter_is_not_live'):
                native.verify_plan(path, native.sha(path))

    def test_evaluation_id_match_cannot_hide_modified_messages(self):
        with tempfile.TemporaryDirectory() as tmp:
            path, payload, value = self.fixture(Path(tmp))
            p = native.read(payload)
            p['evaluation'][0]['messages'][0]['content'] = 'changed'
            payload.write_text(json.dumps(p))
            value['files']['payload']['sha256'] = native.sha(payload)
            path.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, 'evaluation_inputs_changed'):
                native.verify_plan(path, native.sha(path))

    def test_guard_start_gate_rejects_controller_death_before_ownership(self):
        import os
        guard_spec = importlib.util.spec_from_file_location('guard', Path(__file__).with_name('nuknuk-resource-guard.py'))
        guard = importlib.util.module_from_spec(guard_spec)
        guard_spec.loader.exec_module(guard)
        reader, writer = os.pipe()
        os.close(writer)
        with self.assertRaisesRegex(ValueError, 'native_start_not_admitted'):
            guard.native_start_admission(reader)
        reader, writer = os.pipe()
        os.write(writer, b'1')
        os.close(writer)
        guard.native_start_admission(reader)

    def test_registration_failure_never_admits_worker_and_stops_owned_child(self):
        self.registration_failure(False)

    def test_registration_cleanup_timeout_still_restores_live(self):
        self.registration_failure(True)

    def registration_failure(self, wait_timeout):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            adapter = root / 'adapter'
            adapter.mkdir()
            (adapter / 'adapters.safetensors').write_bytes(b'live')
            (adapter / 'adapter_config.json').write_text('{}')
            domain = root / 'domain'
            domain.write_text('https://synthetic.invalid')
            comparison = Mock(PLIST=Path('synthetic-plist'), PLIST_SHA='plist', DOMAIN_FILE=domain)
            comparison.sha.return_value = 'plist'
            comparison.health.return_value = {'status': 'healthy', 'loaded_model': 'model', 'loaded_adapter': str(adapter)}
            comparison.agent.return_value.returncode = 0
            comparison.put.side_effect = OSError('synthetic journal failure')
            watcher, child = Mock(), Mock(pid=1234)
            child.poll.return_value = None
            if wait_timeout:
                child.wait.side_effect = native.subprocess.TimeoutExpired('owned-child', 5)
            plan = {'python': 'synthetic-python', 'model': 'model', 'liveAdapterSha256': native.sha(adapter / 'adapters.safetensors'), 'liveAdapterConfigSha256': native.sha(adapter / 'adapter_config.json')}
            args = SimpleNamespace(native_plan=root / 'plan.json', recipe='A', manifest_sha256='x')
            with patch.object(native, 'module', return_value=comparison), patch.object(native.subprocess, 'Popen', side_effect=[watcher, child]), patch.object(native.os, 'write') as admit:
                with self.assertRaises(native.subprocess.TimeoutExpired if wait_timeout else OSError):
                    native.execute(args, plan)
                admit.assert_not_called()
                child.terminate.assert_called_once()
                comparison.restore.assert_called_once()

    def test_missing_recovery_ack_does_not_pause_live(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            adapter = root / 'adapter'
            adapter.mkdir()
            (adapter / 'adapters.safetensors').write_bytes(b'live')
            (adapter / 'adapter_config.json').write_text('{}')
            domain = root / 'domain'
            domain.write_text('https://synthetic.invalid')
            comparison = Mock(PLIST=Path('synthetic-plist'), PLIST_SHA='plist', DOMAIN_FILE=domain)
            comparison.sha.return_value = 'plist'
            comparison.health.return_value = {'status': 'healthy', 'loaded_model': 'model', 'loaded_adapter': str(adapter)}
            comparison.wait_until.side_effect = RuntimeError('no watchdog ack')
            plan = {'python': 'synthetic-python', 'model': 'model', 'liveAdapterSha256': native.sha(adapter / 'adapters.safetensors'), 'liveAdapterConfigSha256': native.sha(adapter / 'adapter_config.json')}
            with patch.object(native, 'module', return_value=comparison), patch.object(native.subprocess, 'Popen'):
                with self.assertRaisesRegex(RuntimeError, 'watchdog ack'):
                    native.execute(SimpleNamespace(native_plan=root / 'plan.json', recipe='A'), plan)
                comparison.agent.assert_not_called()
                comparison.restore.assert_called_once()

    def test_no_cloud_activation_third_recipe_or_extra_updates(self):
        with tempfile.TemporaryDirectory() as tmp:
            path, _, value = self.fixture(Path(tmp))
            for key, changed in [('cloudAllowed', True), ('productionActivation', True),
                    ('recipes', {'A': {'steps': 81, 'learningRate': 2e-6}})]:
                path.write_text(json.dumps({**value, key: changed}))
                with self.assertRaises(ValueError):
                    native.verify_plan(path, native.sha(path))

    def test_answer_loss_positions_include_first_answer_and_eos(self):
        self.assertEqual(native.response_positions(4, 3), (3, 6))
        with self.assertRaises(ValueError):
            native.response_positions(0, 3)
        tokenizer = Mock(eos_token_id=99)
        tokenizer.apply_chat_template.return_value = [1] * 5119
        tokenizer.encode.return_value = [2, 3]
        with self.assertRaisesRegex(ValueError, 'would_truncate'):
            native.encode_row(tokenizer, {'messages': [], 'target': '{}'})

    def test_second_recipe_refuses_without_first_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(FileNotFoundError):
                native.execute(SimpleNamespace(native_plan=Path(tmp) / 'plan.json', recipe='B'), {})


class NativeMlxMath(unittest.TestCase):
    def test_full_gradient_worker_materializes_64_tiny_cpu_factors_without_updates(self):
        import mlx.core as mx
        import mlx.nn as nn
        mx.set_default_device(mx.cpu)
        class Layer(nn.Module):
            def __init__(self):
                super().__init__()
                self.lora_a = mx.ones((2, 1)) * 0.01
                self.lora_b = mx.zeros((1, 2))
            def __call__(self, x):
                return x + x @ self.lora_a @ self.lora_b
        class Language(nn.Module):
            def __init__(self):
                super().__init__()
                self.embed_tokens = nn.Embedding(4, 2)
                self.lm_head = nn.Linear(2, 4)
                self.model = nn.Module()
                self.model.layers = [Layer() for _ in range(32)]
            def __call__(self, ids, **kwargs):
                hidden = self.embed_tokens(ids)
                for layer in self.model.layers:
                    hidden = layer(hidden)
                return SimpleNamespace(hidden_states=(hidden,))
        model = nn.Module(); model.language_model = Language()
        original_call = Layer.__call__
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            native.full_gradient_diagnostic(model, {'first': ([1] * 3988, [2] * 147)},
                                            {'train': [{'id': 'first'}]}, root, lambda: {'tinyModules': 'unchanged'})
            value = json.loads((root/'gradient-result.json').read_text())
            self.assertEqual(value['gradientTensorCount'], 64)
            self.assertTrue(value['allGradientsFinite'])
            self.assertTrue(value['allFactorHashesUnchanged'])
            self.assertTrue(value['allModuleScalesUnchanged'])
            self.assertEqual(value['optimizerUpdates'], 0)
            self.assertEqual(value['inputTokens'], 4134)
            self.assertFalse((root/'candidate').exists())
        self.assertIs(Layer.__call__, original_call)

    def test_answer_only_projection_matches_full_masked_loss_and_real_updates(self):
        import mlx.core as mx
        import mlx.nn as nn
        import mlx.optimizers as optim
        from mlx.utils import tree_flatten
        from mlx_vlm.trainer.peft import LoRALinear
        mx.set_default_device(mx.cpu)
        mx.random.seed(7)

        class Language(nn.Module):
            def __init__(self):
                super().__init__()
                self.embedding = nn.Embedding(16, 8)
                self.lm_head = LoRALinear.from_base(nn.Linear(8, 16, bias=False), r=2, scale=2)
            def __call__(self, ids, **kwargs):
                return SimpleNamespace(hidden_states=[self.embedding(ids)])

        class Network(nn.Module):
            def __init__(self):
                super().__init__()
                self.language_model = Language()

        model = Network()
        model.freeze()
        model.language_model.lm_head.unfreeze(keys=['lora_a', 'lora_b'], recurse=False)
        initial_base = model.language_model.lm_head.linear.weight.tolist()
        initial_embedding = model.language_model.embedding.weight.tolist()
        ids, labels = mx.array([[1, 2, 3, 4, 5]]), mx.array([[6, 7]])
        selected = native.answer_only_loss(model, ids, labels, 3, 5)
        full = model.language_model.lm_head(model.language_model.embedding(ids))
        reference = nn.losses.cross_entropy(full[:, 3:5, :].astype(mx.float32), labels, reduction='mean')
        self.assertAlmostEqual(selected.item(), reference.item(), places=6)
        grad_fn = nn.value_and_grad(model, native.answer_only_loss)
        optimizer = optim.AdamW(learning_rate=.1, weight_decay=0)
        for _ in range(5):
            loss, gradients = grad_fn(model, ids, labels, 3, 5)
            optimizer.update(model, gradients)
            mx.eval(model.parameters(), optimizer.state)
        final = native.answer_only_loss(model, ids, labels, 3, 5).item()
        self.assertLess(final, selected.item())
        self.assertEqual(model.language_model.lm_head.linear.weight.tolist(), initial_base)
        self.assertEqual(model.language_model.embedding.weight.tolist(), initial_embedding)
        self.assertEqual(len(tree_flatten(model.trainable_parameters())), 2)


if __name__ == '__main__':
    unittest.main()
