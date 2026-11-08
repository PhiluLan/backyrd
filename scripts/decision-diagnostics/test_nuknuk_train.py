"""Boundary tests; no MLX loading, training, user corpus or model changes."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("nuknuk_train", Path(__file__).with_name("nuknuk-train.py"))
trainer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trainer)
guard_spec = importlib.util.spec_from_file_location("nuknuk_guard", Path(__file__).with_name("nuknuk-resource-guard.py"))
guard = importlib.util.module_from_spec(guard_spec)
guard_spec.loader.exec_module(guard)


class TrainingBoundaryTests(unittest.TestCase):
    def test_resource_guard_distinguishes_old_swap_from_new_pressure(self):
        initial = {"pressure": 1, "swapUsedBytes": 13 * guard.GIB}
        self.assertIsNone(guard.stop_reason(initial, initial, 0))
        self.assertEqual(guard.stop_reason({**initial, "pressure": 4}, initial, 1), "CRITICAL_HOST_MEMORY_PRESSURE")
        self.assertEqual(guard.stop_reason({**initial, "pressure": 2}, initial, 3), "SUSTAINED_HOST_MEMORY_PRESSURE")
        self.assertEqual(guard.stop_reason({**initial, "swapUsedBytes": 16 * guard.GIB}, initial, 0), "SWAP_GROWTH_OVER_2_GIB")

    def fixture(self, folder):
        manifest = {"version": "backyrd.nuknuk-understanding-dataset@1",
                    "purpose": "SUPERVISED_UNDERSTANDING_ADAPTER_DATA_ONLY",
                    "counts": {"TRAIN": 1, "VALIDATION": 1, "TEST": 1}, "fileByteHashes": {}}
        for name in ("train", "valid", "test"):
            row = {"messages": [{"role": role, "content": "synthetic boundary test"}
                                for role in ("system", "user", "assistant")]}
            data = (json.dumps(row) + "\n").encode()
            (folder / (name + ".jsonl")).write_bytes(data)
            manifest["fileByteHashes"][name + ".jsonl"] = trainer.sha(data)
        data = json.dumps(manifest).encode()
        (folder / "manifest.json").write_bytes(data)
        return trainer.sha(data)

    def test_unchanged_export_can_be_read_without_loading_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            expected = self.fixture(folder)
            self.assertEqual(len(trainer.verify_export(folder, expected)["train"]), 1)

    def test_edited_targets_or_manifest_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            expected = self.fixture(folder)
            (folder / "train.jsonl").write_text("{}\n")
            with self.assertRaisesRegex(ValueError, "nuknuk_training_file_changed"):
                trainer.verify_export(folder, expected)
            (folder / "manifest.json").write_text("{}")
            with self.assertRaisesRegex(ValueError, "nuknuk_training_manifest_changed"):
                trainer.verify_export(folder, expected)


if __name__ == "__main__":
    unittest.main()
