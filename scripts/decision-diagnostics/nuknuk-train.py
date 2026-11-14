"""Local, reversible understanding-adapter pilot. Never fuses base weights.

Default is preflight only. --execute starts a bounded local SFT run using the
reviewed export. Source targets/reviews are audited by the TypeScript exporter;
this boundary verifies the frozen export and actual preprocessing/masking.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

REVISIONS = {
    "45797d2985a12c55e6473686e9ea91b95e959553",
    "8b2b98c00a6b4d291155e4890773ca8f769aee53",
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify_initial_adapter(folder, expected_hash, model, config):
    folder = folder.resolve(strict=True)
    result = json.loads((folder / "training-result.json").read_text())
    previous = json.loads((folder / "training-config.json").read_text())
    weights = folder / "adapters.safetensors"
    metadata = json.loads((folder / "adapter_config.json").read_text())
    parameters = metadata.get("lora_parameters", {})
    if (result.get("status") != "TRAINING_FINISHED_REQUIRES_EVALUATION"
            or not result.get("trainingExecuted")
            or Path(previous.get("model", "")).resolve() != model.resolve()
            or any(previous.get(k) != config[k] for k in ("target_modules", "lora_rank", "lora_alpha", "lora_dropout", "train_type"))
            or metadata.get("fine_tune_type") != "lora"
            or parameters.get("rank") != config["lora_rank"]
            or parameters.get("keys") != config["target_modules"]
            or parameters.get("scale") != config["lora_alpha"] / config["lora_rank"]
            or parameters.get("dropout") != config["lora_dropout"]
            or len(expected_hash) != 64 or sha(weights.read_bytes()) != expected_hash):
        raise ValueError("nuknuk_initial_adapter_identity_changed")
    return {"file": str(weights), "sha256": expected_hash,
            "metadataSha256": sha((folder / "adapter_config.json").read_bytes()),
            "optimizerStateResumed": False}


def verify_export(folder, expected_manifest_hash):
    manifest_bytes = (folder / "manifest.json").read_bytes()
    if sha(manifest_bytes) != expected_manifest_hash:
        raise ValueError("nuknuk_training_manifest_changed")
    manifest = json.loads(manifest_bytes)
    if (manifest.get("version") != "backyrd.nuknuk-understanding-dataset@1"
            or manifest.get("purpose") != "SUPERVISED_UNDERSTANDING_ADAPTER_DATA_ONLY"):
        raise ValueError("nuknuk_training_export_invalid")
    splits = {}
    for name in ("train", "valid", "test"):
        filename = name + ".jsonl"
        data = (folder / filename).read_bytes()
        if sha(data) != manifest.get("fileByteHashes", {}).get(filename):
            raise ValueError("nuknuk_training_file_changed")
        rows = [json.loads(line) for line in data.decode("utf-8").splitlines() if line.strip()]
        count_key = {"train": "TRAIN", "valid": "VALIDATION", "test": "TEST"}[name]
        if not rows or len(rows) != manifest.get("counts", {}).get(count_key):
            raise ValueError("nuknuk_training_count_invalid")
        for row in rows:
            if ([m.get("role") for m in row.get("messages", [])]
                    != ["system", "user", "assistant"]):
                raise ValueError("nuknuk_training_messages_invalid")
        splits[name] = rows
    return splits


def verify_preprocessing(model, splits, max_sequence):
    # Same processor/dataset implementation as the installed trainer. Check all
    # TRAIN/VALIDATION rows before weights are loaded; no silent truncation or
    # training on system/user instructions. TEST is hashed but never tuned on.
    from transformers import AutoProcessor
    # Match mlx_vlm.load: importing this model registers its MLX-native
    # processor before AutoProcessor (avoids requiring Torch/video for text).
    from mlx_vlm.models import qwen3_5  # noqa: F401
    from mlx_vlm.trainer.vlm.sft.dataset import VisionDataset

    processor = AutoProcessor.from_pretrained(str(model), local_files_only=True,
                                             trust_remote_code=False)
    config = json.loads((model / "config.json").read_text())
    measured = {}
    for name in ("train", "valid"):
        dataset = VisionDataset(splits[name], config, processor,
                                config=SimpleNamespace(train_on_completions=True))
        maximum = 0
        for index in range(len(dataset)):
            row = dataset[index]
            ids = row["input_ids"]
            count = int(ids.shape[-1])
            if count > max_sequence:
                raise ValueError("nuknuk_training_would_truncate")
            mask = row.get("completion_mask")
            if mask is None or int(mask.sum()) == 0 or int(mask.sum()) >= count:
                raise ValueError("nuknuk_completion_mask_unverified")
            maximum = max(maximum, count)
        measured[name] = {"rows": len(dataset), "maxTokens": maximum}
    return measured


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--one-epoch", action="store_true", help="Visit every training row once; otherwise retain the 20-step technical pilot.")
    parser.add_argument("--initial-adapter", type=Path)
    parser.add_argument("--initial-adapter-sha256")
    parser.add_argument("--last-attention-layers", type=int, default=0, help="Restrict LoRA to the final N full-attention blocks; 0 retains all q/v projections.")
    args = parser.parse_args()
    if (args.initial_adapter is None) != (args.initial_adapter_sha256 is None):
        raise ValueError("nuknuk_initial_adapter_hash_required")
    model = args.model.resolve(strict=True)
    folder = args.data.resolve(strict=True)
    output = args.output.resolve()
    if model.name not in REVISIONS or output.exists() or output == model or model in output.parents:
        raise ValueError("nuknuk_training_path_invalid")
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1",
                      HF_HUB_DISABLE_TELEMETRY="1", WANDB_DISABLED="true")
    splits = verify_export(folder, args.manifest_sha256)
    # Conservative pilot: attention projections only, no recurrent gates/vision.
    max_sequence = 32768
    measured = verify_preprocessing(model, splits, max_sequence)
    if not 0 <= args.last_attention_layers <= 16:
        raise ValueError("nuknuk_training_layer_count_invalid")
    targets = ["q_proj", "v_proj"]
    if args.last_attention_layers:
        text_config = json.loads((model / "config.json").read_text())["text_config"]
        layers = [i for i, kind in enumerate(text_config["layer_types"]) if kind == "full_attention"]
        if len(layers) < args.last_attention_layers:
            raise ValueError("nuknuk_training_layers_missing")
        targets = [f"language_model.model.layers.{i}.self_attn.{name}"
                   for i in layers[-args.last_attention_layers:] for name in ("q_proj", "v_proj")]
    config = {
        "task": "vlm", "algorithm": "sft", "model": str(model),
        "data": str(folder), "train_split": "train", "validation_split": "valid",
        "train_type": "lora", "target_modules": targets,
        "lora_rank": 8, "lora_alpha": 16.0, "lora_dropout": 0.0,
        "batch_size": 1, "iters": len(splits["train"]) if args.one_epoch else 20, "learning_rate": 0.00001,
        "grad_checkpoint": True, "max_seq_length": max_sequence,
        "train_on_completions": True, "assistant_id": None,
        "steps_per_report": 1, "steps_per_eval": 120 if args.one_epoch else 20, "steps_per_save": 40 if args.one_epoch else 10,
        "val_batches": -1 if args.one_epoch else 2, "seed": 7,
        "adapter_file": str(output / "adapters.safetensors"),
    }
    initial_adapter = None
    if args.initial_adapter is not None:
        initial_adapter = verify_initial_adapter(args.initial_adapter, args.initial_adapter_sha256, model, config)
        if output == args.initial_adapter.resolve() or args.initial_adapter.resolve() in output.parents:
            raise ValueError("nuknuk_training_path_invalid")
        config["resume_adapter_file"] = initial_adapter["file"]
    report = {"status": "PREFLIGHT_PASSED", "trainingExecuted": False, "baseWeightsChangedByThisTool": False,
              "manifestSha256": args.manifest_sha256, "preprocessing": measured,
              "allTrainingRowsScheduled": args.one_epoch,
              "runtimeVersion": importlib.metadata.version("mlx-vlm"), "config": config,
              "initialAdapter": initial_adapter,
              "limits": ["PILOT_NOT_QUALITY_APPROVAL", "NO_PRODUCTION_ACTIVATION"]}
    if not args.execute:
        print(json.dumps(report, indent=2))
        return
    output.mkdir(parents=True, mode=0o700)
    config_path = output / "training-config.json"
    config_path.write_text(json.dumps(config, indent=2))
    (output / "preflight.json").write_text(json.dumps(report, indent=2))
    # Direct argv, no shell, remote uploads, model download, fusion or deployment.
    report["trainingExecuted"] = True
    try:
        completed = subprocess.run([sys.executable, "-u", str(Path(__file__).with_name("nuknuk-resource-guard.py")),
                                    "--receipt", str(output / "host-memory.json"), "mlx_vlm.train", "--config", str(config_path)],
                                   check=False, timeout=14400)
    except subprocess.TimeoutExpired:
        report["status"] = "TRAINING_TIMED_OUT"
        report["adapterCreated"] = (output / "adapters.safetensors").exists()
        (output / "training-result.json").write_text(json.dumps(report, indent=2))
        raise ValueError("nuknuk_training_timed_out") from None
    report["status"] = "TRAINING_FINISHED_REQUIRES_EVALUATION" if completed.returncode == 0 else "TRAINING_FAILED"
    report["adapterCreated"] = (output / "adapters.safetensors").exists()
    report["baseWeightsChangedByThisTool"] = False
    (output / "training-result.json").write_text(json.dumps(report, indent=2))
    if completed.returncode:
        raise ValueError("nuknuk_training_failed")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, ImportError, subprocess.TimeoutExpired) as error:
        # Model/user text never enters console failures.
        code = str(error) if str(error).startswith("nuknuk_") else "nuknuk_training_preflight_failed"
        print(code, file=sys.stderr)
        sys.exit(1)
