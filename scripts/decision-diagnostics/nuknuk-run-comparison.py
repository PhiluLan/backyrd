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
    if args.wait_for_training:
        deadline = time.monotonic() + 7200
        while not (adapter / "training-result.json").is_file():
            if time.monotonic() >= deadline:
                raise ValueError("nuknuk_comparison_training_wait_expired")
            time.sleep(2)
    if health() is not None:
        raise ValueError("nuknuk_comparison_service_already_running")
    result = json.loads((adapter / "training-result.json").read_text())
    if not result.get("trainingExecuted") or result["status"] != "TRAINING_FINISHED_REQUIRES_EVALUATION":
        raise ValueError("nuknuk_comparison_training_not_finished")
    output.mkdir(mode=0o700)
    env = {**os.environ, "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "HF_HUB_DISABLE_TELEMETRY": "1"}
    variants = [("baseline", None), ("adapter", adapter)]
    if args.development_adapter is not None:
        if args.cases_file is None or json.loads(args.cases_file.read_text()).get("split") != "VALIDATION":
            raise ValueError("nuknuk_selection_requires_development_cases")
        variants = [("small", adapter), ("larger", args.development_adapter.resolve(strict=True))]
        alternate_result = json.loads((variants[1][1] / "training-result.json").read_text())
        if alternate_result.get("status") != "TRAINING_FINISHED_REQUIRES_EVALUATION":
            raise ValueError("nuknuk_alternate_training_not_finished")
    for name, active_adapter in variants:
        server = None
        with (output / (name + "-server.log")).open("x") as log:
            command = [sys.executable, "-u", str(Path(__file__).with_name("nuknuk-resource-guard.py")),
                       "--receipt", str(output / (name + "-host-memory.json")),
                       "mlx_vlm.server", "--host", "127.0.0.1", "--port", "8088", "--model", str(model), "--max-num-seqs", "1", "--log-progress-interval", "100"]
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
                if args.cases_file is not None:
                    evaluation += ["--cases-file", str(args.cases_file.resolve(strict=True))]
                completed = subprocess.run(evaluation, env=env, timeout=5400, check=False)
                if completed.returncode:
                    raise ValueError("nuknuk_comparison_evaluation_failed")
            finally:
                if server and server.poll() is None:
                    server.terminate()
                    try:
                        server.wait(timeout=25)
                    except subprocess.TimeoutExpired:
                        server.kill()
                        server.wait(timeout=10)
        (output / (name + "-server.log")).chmod(0o600)
    before_name, after_name = [name for name, _ in variants]
    baseline = json.loads((output / before_name / "summary.json").read_text())
    adapted = json.loads((output / after_name / "summary.json").read_text())
    if any(baseline[key] != adapted[key] for key in ["datasetHash", "profile", "transferCasesHash", "total"]):
        raise ValueError("nuknuk_comparison_plan_changed")
    for before in baseline["cases"]:
        after = json.loads((output / after_name / (before["id"] + ".json")).read_text())
        original = json.loads((output / before_name / (before["id"] + ".json")).read_text())
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
    report = {before_name: baseline, after_name: adapted, "sameInputsVerified": True,
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
    parser.add_argument("--wait-for-training", action="store_true")
    parser.add_argument("--cases-file", type=Path)
    parser.add_argument("--development-adapter", type=Path)
    run(parser.parse_args())
