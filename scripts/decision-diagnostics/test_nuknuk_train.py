"""Boundary tests; no MLX loading, training, user corpus or model changes."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess

spec = importlib.util.spec_from_file_location("nuknuk_train", Path(__file__).with_name("nuknuk-train.py"))
trainer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trainer)
guard_spec = importlib.util.spec_from_file_location("nuknuk_guard", Path(__file__).with_name("nuknuk-resource-guard.py"))
guard = importlib.util.module_from_spec(guard_spec)
guard_spec.loader.exec_module(guard)


class TrainingBoundaryTests(unittest.TestCase):
    healthy = {"pressure": 1, "swapUsedBytes": 0, "diskFreeBytes": 100 * guard.GIB}

    def test_disk_reserve_blocks_before_model_start(self):
        sample = {**self.healthy, "diskFreeBytes": 29 * guard.GIB}
        with tempfile.TemporaryDirectory() as tmp, patch.object(guard.sys, "platform", "darwin"), patch.object(guard, "read_host", return_value=sample), patch.object(guard.subprocess, "Popen") as launch:
            with self.assertRaisesRegex(ValueError, "nuknuk_host_not_ready"):
                guard.supervise("mlx_vlm.train", [], Path(tmp) / "receipt.json")
            launch.assert_not_called()

    def test_stop_rules_preserve_old_swap_but_reject_new_risk(self):
        initial = {**self.healthy, "swapUsedBytes": 13 * guard.GIB}
        self.assertIsNone(guard.stop_reason(initial, initial))
        for change, expected in [
            ({"pressure": 4}, "CRITICAL_HOST_MEMORY_PRESSURE"),
            ({"pressure": 2}, "HOST_MEMORY_WARNING"),
            ({"swapUsedBytes": 14 * guard.GIB}, "SWAP_GROWTH_OVER_512_MIB"),
            ({"diskFreeBytes": 29 * guard.GIB}, "DISK_RESERVE_BELOW_30_GIB"),
            ({"modelRssBytes": 29 * guard.GIB}, "MODEL_GROUP_RSS_OVER_28_GIB"),
            ({"dockerRunning": True}, "DOCKER_RUNNING"),
        ]:
            with self.subTest(expected=expected):
                self.assertEqual(guard.stop_reason({**initial, **change}, initial), expected)

    def test_only_one_guarded_run_can_hold_host_lock(self):
        import os
        lock = guard.supervisor_lock()
        try:
            with self.assertRaisesRegex(ValueError, "another_guarded_run"):
                guard.supervisor_lock()
        finally:
            os.close(lock)

    def run_synthetic(self, third_sample, expected):
        # Real tiny child + real separate watchdog, no model or resource load.
        with tempfile.TemporaryDirectory() as tmp, patch.object(guard.sys, "platform", "darwin"), patch.object(guard, "POLL_SECONDS", 0.05), patch.object(guard, "BOOTSTRAP", "import time; time.sleep(60)"), patch.object(guard, "read_host", side_effect=[self.healthy, self.healthy, third_sample]):
            receipt = Path(tmp) / "receipt.json"
            self.assertEqual(guard.supervise("mlx_vlm.train", [], receipt), 75)
            data = json.loads(receipt.read_text())
            self.assertEqual(data["status"], expected)
            self.assertEqual(data["returncode"], -9)
            self.assertGreaterEqual(len(receipt.with_suffix(".samples.jsonl").read_text().splitlines()), 1)
            return data

    def test_warning_immediately_kills_real_owned_process(self):
        data = self.run_synthetic({**self.healthy, "pressure": 2}, "HOST_MEMORY_WARNING")
        self.assertEqual(len(data["samples"]), 2)

    def test_output_disk_becoming_full_stops_real_owned_process(self):
        self.run_synthetic({**self.healthy, "diskFreeBytes": 29 * guard.GIB}, "DISK_RESERVE_BELOW_30_GIB")

    def test_monitor_timeout_fails_closed(self):
        self.run_synthetic(subprocess.TimeoutExpired("sysctl", 1), "HOST_MONITOR_OR_JOURNAL_UNAVAILABLE")

    def test_journal_failure_stops_child_even_without_final_receipt(self):
        with patch.object(guard.os, "fsync", side_effect=[None, OSError("synthetic disk full"), None]):
            self.run_synthetic(self.healthy, "HOST_MONITOR_OR_JOURNAL_UNAVAILABLE")

    def test_success_remains_success_without_loading_model(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(guard.sys, "platform", "darwin"), patch.object(guard, "BOOTSTRAP", "pass"), patch.object(guard, "read_host", return_value=self.healthy):
            receipt = Path(tmp) / "receipt.json"
            self.assertEqual(guard.supervise("mlx_vlm.train", [], receipt), 0)
            self.assertEqual(json.loads(receipt.read_text())["status"], "FINISHED")

    def test_independent_watchdog_stops_when_heartbeat_stalls_or_pipe_closes(self):
        import os
        import sys
        for disconnected in (False, True):
            with self.subTest(disconnected=disconnected), tempfile.TemporaryDirectory() as tmp:
                child = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(60)"], start_new_session=True)
                read_fd, write_fd = os.pipe()
                try:
                    if disconnected:
                        os.close(write_fd)
                    event = Path(tmp) / "watchdog.json"
                    guard.watchdog(child.pid, read_fd, event, timeout=0.05)
                    self.assertEqual(child.wait(timeout=2), -9)
                    self.assertEqual(json.loads(event.read_text())["resourceStop"], "SUPERVISOR_DISCONNECTED" if disconnected else "SUPERVISOR_HEARTBEAT_LOST")
                finally:
                    os.close(read_fd)
                    if not disconnected:
                        os.close(write_fd)
                    guard.terminate_owned(child, immediate=True)

    def test_manual_stop_file_ends_process(self):
        with tempfile.TemporaryDirectory() as tmp:
            receipt = Path(tmp) / "receipt.json"
            calls = 0
            def host(*_args, **_kwargs):
                nonlocal calls
                calls += 1
                if calls == 3:
                    receipt.with_suffix(".stop").touch()
                return self.healthy
            with patch.object(guard.sys, "platform", "darwin"), patch.object(guard, "POLL_SECONDS", 0.05), patch.object(guard, "BOOTSTRAP", "import time;time.sleep(60)"), patch.object(guard, "read_host", side_effect=host):
                self.assertEqual(guard.supervise("mlx_vlm.server", [], receipt), 75)
            self.assertEqual(json.loads(receipt.read_text())["status"], "MANUAL_STOP_REQUESTED")

    def test_host_reader_counts_owned_workers_and_output_volume(self):
        processes = "101 101 1024 /python\n102 101 2048 /python\n999 999 9000 /unrelated\n"
        with patch.object(guard.subprocess, "check_output", side_effect=["1", "used = 0.00M", processes]), patch.object(guard.shutil, "disk_usage", side_effect=[type("Disk", (), {"free": 100 * guard.GIB})(), type("Disk", (), {"free": 29 * guard.GIB})()]):
            sample = guard.read_host(101, (Path("/synthetic-output"),))
            self.assertEqual(sample["modelRssBytes"], 3072 * 1024)
            self.assertEqual(sample["diskFreeBytes"], 29 * guard.GIB)

    def test_real_supervisor_death_and_freeze_kill_entire_owned_group(self):
        import os
        import signal
        import sys
        import time
        import select
        for freeze in (False, True):
            with self.subTest(freeze=freeze), tempfile.TemporaryDirectory() as tmp:
                receipt = Path(tmp) / "receipt.json"
                # This worker also creates a child: both must be stopped.
                bootstrap = "import subprocess,sys,time;subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)']);time.sleep(60)"
                code = ("import importlib.util,pathlib;"
                        + "s=importlib.util.spec_from_file_location('g'," + repr(str(Path(guard.__file__).resolve())) + ");"
                        + "g=importlib.util.module_from_spec(s);s.loader.exec_module(g);"
                        + "g.sys.platform='darwin';g.BOOTSTRAP=" + repr(bootstrap) + ";"
                        + "g.read_host=lambda *a,**k:" + repr(self.healthy) + ";"
                        + "g.supervise('mlx_vlm.train',[],pathlib.Path(" + repr(str(receipt)) + "))")
                supervisor = subprocess.Popen([sys.executable, "-u", "-c", code], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                try:
                    self.assertTrue(select.select([supervisor.stdout], [], [], 5)[0], "supervisor did not start")
                    active = json.loads(supervisor.stdout.readline())
                    pgid = active["groupPid"]
                    # Wait until the target has really created its extra worker.
                    def group_states():
                        text = subprocess.check_output(["/bin/ps", "-axo", "pgid=,stat="], text=True, timeout=1)
                        return [line.split()[1] for line in text.splitlines() if line.split()[0] == str(pgid)]
                    deadline = time.monotonic() + 3
                    while len(group_states()) < 2 and time.monotonic() < deadline:
                        time.sleep(0.02)
                    self.assertGreaterEqual(len(group_states()), 2)
                    if freeze:
                        os.kill(supervisor.pid, signal.SIGSTOP)
                    else:
                        supervisor.kill()
                    deadline = time.monotonic() + guard.HEARTBEAT_SECONDS + 3
                    while any(not s.startswith("Z") for s in group_states()) and time.monotonic() < deadline:
                        time.sleep(0.05)
                    self.assertFalse(any(not s.startswith("Z") for s in group_states()), "model worker survived lost supervisor")
                    event = json.loads(receipt.with_suffix(".watchdog.json").read_text())
                    self.assertEqual(event["resourceStop"], "SUPERVISOR_HEARTBEAT_LOST" if freeze else "SUPERVISOR_DISCONNECTED")
                finally:
                    if freeze:
                        os.kill(supervisor.pid, signal.SIGCONT)
                    if supervisor.poll() is None:
                        supervisor.terminate()
                    supervisor.communicate(timeout=5)

    def test_resource_pilot_bounds_validation_without_reducing_full_epoch(self):
        import sys
        from types import SimpleNamespace
        for full_epoch in (False, True):
            with self.subTest(full_epoch=full_epoch), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                model = root / next(iter(trainer.REVISIONS))
                model.mkdir()
                (model / "config.json").write_text(json.dumps({"text_config": {"layer_types": ["full_attention"]}}))
                data = root / "data"
                data.mkdir()
                output = root / "output"
                argv = ["trainer", "--model", str(model), "--data", str(data), "--manifest-sha256", "synthetic", "--output", str(output), "--last-attention-layers", "1", "--execute"]
                if full_epoch:
                    argv.append("--one-epoch")
                splits = {"train": [{}] * 360, "valid": [{}] * 22, "test": [{}] * 26}
                with patch.object(sys, "argv", argv), patch.object(trainer, "verify_export", return_value=splits), patch.object(trainer, "verify_preprocessing", return_value={}), patch.object(trainer.importlib.metadata, "version", return_value="synthetic"), patch.object(trainer.subprocess, "run", return_value=SimpleNamespace(returncode=0)):
                    trainer.main()
                config = json.loads((output / "training-config.json").read_text())
                self.assertEqual(config["iters"], 360 if full_epoch else 20)
                self.assertEqual(config["steps_per_eval"], 120 if full_epoch else 20)
                self.assertEqual(config["val_batches"], -1 if full_epoch else 2)

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
