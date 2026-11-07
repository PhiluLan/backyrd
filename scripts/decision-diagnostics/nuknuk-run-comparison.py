"""Run sequential local baseline/adapter evaluations and clean up owned servers."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request


def health():
    try:
        with urllib.request.urlopen("http://127.0.0.1:8088/health", timeout=2) as response:
            return json.load(response)
    except (OSError, ValueError):
        return None


def run(args):
    model, adapter, data, output = [p.resolve() for p in (args.model, args.adapter, args.data, args.output)]
    if health() is not None:
        raise ValueError("nuknuk_comparison_service_already_running")
    result = json.loads((adapter / "training-result.json").read_text())
    if not result.get("trainingExecuted") or result["status"] != "TRAINING_FINISHED_REQUIRES_EVALUATION":
        raise ValueError("nuknuk_comparison_training_not_finished")
    output.mkdir(mode=0o700)
    env = {**os.environ, "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "HF_HUB_DISABLE_TELEMETRY": "1"}
    for name, active_adapter in [("baseline", None), ("adapter", adapter)]:
        server = None
        with (output / (name + "-server.log")).open("x") as log:
            command = [sys.executable, "-u", "-m", "mlx_vlm.server", "--host", "127.0.0.1", "--port", "8088", "--model", str(model), "--max-num-seqs", "1", "--log-progress-interval", "100"]
            if active_adapter is not None:
                command += ["--adapter-path", str(active_adapter)]
            try:
                server = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env=env)
                deadline = time.monotonic() + 120
                while time.monotonic() < deadline:
                    state = health()
                    if state and state.get("loaded_model") == str(model) and state.get("loaded_adapter") == (str(active_adapter) if active_adapter else None):
                        break
                    if server.poll() is not None:
                        raise ValueError("nuknuk_comparison_server_exited")
                    time.sleep(1)
                else:
                    raise ValueError("nuknuk_comparison_server_not_ready")
                evaluation = ["node", "scripts/decision-diagnostics/nuknuk-adapter-evaluate.mjs", str(data), str(model), str(output / name)]
                if active_adapter:
                    evaluation += [str(active_adapter)]
                completed = subprocess.run(evaluation, env=env, timeout=3600, check=False)
                if completed.returncode:
                    raise ValueError("nuknuk_comparison_evaluation_failed")
            finally:
                if server and server.poll() is None:
                    server.terminate()
                    try:
                        server.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        server.kill()
                        server.wait(timeout=10)
        (output / (name + "-server.log")).chmod(0o600)
    baseline = json.loads((output / "baseline/summary.json").read_text())
    adapted = json.loads((output / "adapter/summary.json").read_text())
    for before in baseline["cases"]:
        after = json.loads((output / "adapter" / (before["id"] + ".json")).read_text())
        original = json.loads((output / "baseline" / (before["id"] + ".json")).read_text())
        if any(after[key] != original[key] for key in ["id", "task", "query", "inputHash", "promptHash", "targetHash", "maxOutputTokens"]):
            raise ValueError("nuknuk_comparison_inputs_differ")
    original_hashes = json.loads(args.base_hashes.read_text())
    for row in original_hashes:
        h = hashlib.sha256()
        with (model / row["file"]).open("rb") as file:
            while chunk := file.read(8 * 1024 * 1024):
                h.update(chunk)
        if h.hexdigest() != row["sha256"]:
            raise ValueError("nuknuk_base_weights_changed")
    report = {"baseline": baseline, "adapter": adapted, "sameInputsVerified": True,
              "baseWeightHashesVerified": True, "productionActivation": False,
              "semanticReviewRequired": True}
    with (output / "comparison.json").open("x") as file:
        json.dump(report, file, ensure_ascii=False, indent=2)
    (output / "comparison.json").chmod(0o600)
    print(json.dumps({"comparison": str(output / "comparison.json"), "baseWeightsUnchanged": True}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ["model", "adapter", "data", "output", "base-hashes"]:
        parser.add_argument("--" + key, type=Path, required=True)
    run(parser.parse_args())
