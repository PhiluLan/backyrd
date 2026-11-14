"""Pure session boundary checks. Never imports model libraries or uses SSH."""
import importlib.util
from pathlib import Path
import unittest
from types import SimpleNamespace
from unittest.mock import Mock


spec = importlib.util.spec_from_file_location("session", Path(__file__).with_name("nuknuk-gpu-session.py"))
session = importlib.util.module_from_spec(spec)
spec.loader.exec_module(session)


class SessionBoundaryTests(unittest.TestCase):
    def request(self):
        return {"datasetHash": "a" * 64, "id": "dev-1", "task": "PLAN_SEARCH",
                "messages": [{"role": "system", "content": "instructions"}, {"role": "user", "content": "input"}],
                "outputSchema": {"type": "object"}}

    def test_target_free_request_accepted_and_preserved(self):
        value = self.request()
        self.assertIs(session.checked_request(value, "a" * 64), value)

    def test_approved_full_curriculum_phase_id_is_accepted(self):
        value = self.request()
        value["id"] = "advice-astra-citizenship-solo-archive-plan_search"
        self.assertIs(session.checked_request(value, "a" * 64), value)

    def test_wrong_dataset_or_gold_message_rejected(self):
        value = self.request()
        with self.assertRaisesRegex(ValueError, "dataset_mismatch"):
            session.checked_request(value, "b" * 64)
        value["messages"].append({"role": "assistant", "content": "gold"})
        with self.assertRaisesRegex(ValueError, "target_free"):
            session.checked_request(value, "a" * 64)

    def test_untrusted_name_task_and_oversized_input_rejected(self):
        for field, invalid in [("id", "../../escape"), ("task", "RUN_PYTHON")]:
            value = self.request()
            value[field] = invalid
            with self.assertRaisesRegex(ValueError, "identity_invalid"):
                session.checked_request(value, "a" * 64)
        value = self.request()
        value["messages"][1]["content"] = "x" * (256 * 1024)
        with self.assertRaisesRegex(ValueError, "size_invalid"):
            session.checked_request(value, "a" * 64)

    def test_actual_loader_receives_verified_adapter_pin_and_fresh_mode(self):
        loader = Mock(return_value={"loaded": True})
        gpu = SimpleNamespace(load_inference_state=loader)
        args = SimpleNamespace(bundle=Path('/workspace/bundle'), adapter=Path('/workspace/adapter'), adapter_sha256='a' * 64)
        self.assertEqual(session.load_session_state(gpu, args), {"loaded": True})
        loader.assert_called_once_with(args.bundle, 16, 'language-linear', args.adapter, initialization='adapter', adapter_sha256='a' * 64)
        loader.reset_mock()
        args.adapter = None
        args.adapter_sha256 = None
        session.load_session_state(gpu, args)
        loader.assert_called_once_with(args.bundle, 16, 'language-linear', None, initialization='fresh', adapter_sha256=None)


if __name__ == "__main__":
    unittest.main()
