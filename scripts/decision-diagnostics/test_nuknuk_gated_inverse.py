"""Tiny CPU-only numeric equivalence; no NukNuk weights or library mutation."""
import importlib.util
from pathlib import Path
import unittest
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('inverse_candidate', Path(__file__).with_name('nuknuk-gated-inverse.py'))
candidate = importlib.util.module_from_spec(spec); spec.loader.exec_module(candidate)


class UnitInverseVjp(unittest.TestCase):
    def test_batched_forward_gradient_and_checkpoint_match_original(self):
        import mlx.core as mx
        mx.set_default_device(mx.cpu)
        from mlx_vlm.models.qwen3_5.gated_delta import _invert_unit_lower
        mx.random.seed(7)
        matrix = mx.random.normal((2, 3, 4, 4)) * 0.03 + mx.eye(4)
        weight = mx.random.normal(matrix.shape)
        optimized = candidate.inverse_with_vjp(_invert_unit_lower, 4)
        original = lambda x: _invert_unit_lower(x, 4)
        loss = lambda fn, x: mx.sum(fn(x) * weight)
        left = mx.value_and_grad(lambda x: loss(original, x))(matrix)
        right = mx.value_and_grad(lambda x: loss(optimized, x))(matrix)
        replay = mx.value_and_grad(lambda x: loss(mx.checkpoint(optimized), x))(matrix)
        mx.eval(left, right, replay)
        self.assertTrue(bool(mx.array_equal(original(matrix), optimized(matrix)).item()))
        for actual in (right, replay):
            self.assertTrue(bool(mx.allclose(left[0], actual[0], rtol=1e-5, atol=1e-6).item()))
            self.assertTrue(bool(mx.allclose(left[1], actual[1], rtol=1e-5, atol=1e-6).item()))
        self.assertTrue(bool(mx.all(mx.triu(right[1]) == 0).item()))
        direction = mx.tril(mx.random.normal(matrix.shape), -1)
        direction = direction / mx.linalg.norm(direction)
        epsilon = 0.01
        finite_difference = (loss(original, matrix + epsilon * direction) - loss(original, matrix - epsilon * direction)) / (2 * epsilon)
        derivative = mx.sum(right[1] * direction)
        self.assertTrue(bool(mx.allclose(finite_difference, derivative, rtol=0.001, atol=0.0001).item()))

    def test_context_restores_original_after_failure(self):
        original = lambda matrix, chunk: None
        library = SimpleNamespace(_invert_unit_lower=original)
        with self.assertRaisesRegex(RuntimeError, 'synthetic'):
            with candidate.installed_inverse_vjp(library):
                self.assertIsNot(library._invert_unit_lower, original)
                raise RuntimeError('synthetic')
        self.assertIs(library._invert_unit_lower, original)


if __name__ == '__main__':
    unittest.main()
