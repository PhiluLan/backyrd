"""CPU-only bundle, masking and matrix-transfer tests. No model downloads."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location("nuknuk_gpu", Path(__file__).with_name("nuknuk-gpu.py"))
gpu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gpu)


class GpuPreparationTests(unittest.TestCase):
    def arrays(self):
        rng = np.random.default_rng(7)
        prefix = 'language_model.model.layers.63.self_attn.'
        return {prefix + key: (rng.normal(size=shape) * .01).astype(np.float32) for key, shape in {
            'q_proj.lora_a': (5120, 8), 'q_proj.lora_b': (8, 12288),
            'v_proj.lora_a': (5120, 8), 'v_proj.lora_b': (8, 1024)}.items()}

    def test_transfer_preserves_projection_deltas_and_gate_dimensions(self):
        matrices, errors = gpu.transpose_seed(self.arrays())
        self.assertEqual(matrices['model.language_model.layers.63.self_attn.q_proj.lora_B'].shape, (12288, 8))
        self.assertEqual(matrices['model.language_model.layers.63.self_attn.v_proj.lora_A'].shape, (8, 5120))
        self.assertTrue(all(e < 1e-12 for e in errors.values()))

    def test_missing_matrix_and_wrong_architecture_are_not_silently_accepted(self):
        arrays = self.arrays(); arrays.pop(next(iter(arrays)))
        with self.assertRaisesRegex(ValueError, 'seed_keys_invalid'):
            gpu.transpose_seed(arrays)
        arrays = self.arrays(); arrays[next(iter(arrays))] = np.zeros((4096, 8))
        with self.assertRaisesRegex(ValueError, 'seed_shape_or_value_invalid'):
            gpu.transpose_seed(arrays)

    def test_nonfinite_seed_is_rejected(self):
        arrays = self.arrays(); arrays[next(iter(arrays))][0, 0] = np.nan
        with self.assertRaisesRegex(ValueError, 'seed_shape_or_value_invalid'):
            gpu.transpose_seed(arrays)

    def test_completion_mask_excludes_entire_non_thinking_inference_prefix(self):
        class Tokenizer:
            eos_token_id = 14
            def apply_chat_template(self, messages, **kwargs):
                self.messages = messages; self.kwargs = kwargs
                # Transformers 5 defaults to a BatchEncoding. Explicitly request
                # the unbatched token list required by the completion mask.
                return [10, 11] if kwargs.get('return_dict') is False else {'input_ids': [10, 11]}
            def encode(self, text, **kwargs):
                return [12, 13]
        tokenizer = Tokenizer()
        row = {'messages': [{'role': 'system', 'content': 'rules'}, {'role': 'user', 'content': 'wish'}, {'role': 'assistant', 'content': '{}'}]}
        ids, labels = gpu.encode_row(row, tokenizer)
        self.assertEqual(ids, [10, 11, 12, 13, 14])
        self.assertEqual(labels, [-100, -100, 12, 13, 14])
        self.assertFalse(tokenizer.kwargs['enable_thinking'])
        self.assertFalse(tokenizer.kwargs['return_dict'])
        self.assertEqual(len(tokenizer.messages), 2)
        with self.assertRaisesRegex(ValueError, 'would_truncate'):
            gpu.encode_row(row, tokenizer, maximum=4)

    def test_bundle_tampering_and_path_escape_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / 'bundle'; folder.mkdir()
            (folder / 'data.txt').write_text('approved')
            manifest = {'model': gpu.MODEL_ID, 'revision': gpu.MODEL_REVISION,
                        'parentAdapterSha256': gpu.PARENT_SHA,
                        'files': {'data.txt': hashlib.sha256(b'approved').hexdigest()}}
            (folder / 'bundle.json').write_text(json.dumps(manifest))
            gpu.verify_bundle(folder)
            (folder / 'data.txt').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'bundle_file_changed'):
                gpu.verify_bundle(folder)
            (Path(tmp) / 'outside.txt').write_text('approved')
            manifest['files'] = {'../outside.txt': hashlib.sha256(b'approved').hexdigest()}
            (folder / 'bundle.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'bundle_file_changed'):
                gpu.verify_bundle(folder)

    def test_grammar_consumes_each_completion_token_once_and_never_prompt(self):
        class Matcher:
            def __init__(self): self.tokens = []
            def consume_token(self, token): self.tokens.append(token); return token != 99
            def get_error(self): return None
        matcher = Matcher()
        cursor = gpu.consume_generated(matcher, [], 0)
        cursor = gpu.consume_generated(matcher, [10, 11], cursor)
        cursor = gpu.consume_generated(matcher, [10, 11], cursor)
        cursor = gpu.consume_generated(matcher, [10, 11, 12], cursor)
        self.assertEqual(matcher.tokens, [10, 11, 12])
        with self.assertRaisesRegex(ValueError, 'generation_rewound'):
            gpu.consume_generated(matcher, [], cursor)
        with self.assertRaisesRegex(ValueError, 'grammar_rejected_token'):
            gpu.consume_generated(matcher, [99], 0)


if __name__ == '__main__':
    unittest.main()
