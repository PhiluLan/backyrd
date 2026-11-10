"""Explicit local packaging / bounded CUDA pilot. Never deploys or rents a Pod.

The MLX->PEFT matrix mapping is algebraically checked during packaging. CUDA
NF4 and MLX affine quantization differ; semantic parity must be evaluated.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

MODEL_ID = "Qwen/Qwen3.5-27B"
MODEL_REVISION = "fc05daec18b0a78c049392ed2e771dde82bdf654"
PARENT_SHA = "cd0735f6cc576df3386ca0254d08d3db7e976f0711a6fad7bf900777a0f180b3"


def file_sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(8 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def write_json(path, value):
    with Path(path).open("x") as file:
        json.dump(value, file, ensure_ascii=False, indent=2)
        file.write("\n")


def transpose_seed(arrays):
    import numpy as np
    expected = {
        "q_proj.lora_a": (5120, 8), "q_proj.lora_b": (8, 12288),
        "v_proj.lora_a": (5120, 8), "v_proj.lora_b": (8, 1024),
    }
    prefix = "language_model.model.layers.63.self_attn."
    if set(arrays) != {prefix + key for key in expected}:
        raise ValueError("nuknuk_gpu_seed_keys_invalid")
    result = {}
    for suffix, shape in expected.items():
        value = arrays[prefix + suffix]
        if value.shape != shape or not np.isfinite(value).all():
            raise ValueError("nuknuk_gpu_seed_shape_or_value_invalid")
        module, matrix = suffix.split(".lora_")
        result["model.language_model.layers.63.self_attn." + module + ".lora_" + matrix.upper()] = np.ascontiguousarray(value.T)
    # MLX: scale * x @ A @ B. PEFT: scale * linear(linear(x,A'),B').
    rng = np.random.default_rng(7)
    x = rng.normal(size=(2, 5120)).astype(np.float64)
    errors = {}
    for projection in ("q_proj", "v_proj"):
        a = arrays[prefix + projection + ".lora_a"].astype(np.float64)
        b = arrays[prefix + projection + ".lora_b"].astype(np.float64)
        key = "model.language_model.layers.63.self_attn." + projection
        actual = (x @ result[key + ".lora_A"].astype(np.float64).T) @ result[key + ".lora_B"].astype(np.float64).T * 2
        expected_delta = x @ a @ b * 2
        if not np.allclose(actual, expected_delta, rtol=1e-12, atol=1e-12):
            raise ValueError("nuknuk_gpu_seed_delta_changed")
        errors[projection] = float(np.max(np.abs(actual - expected_delta)))
    return result, errors


def convert_seed(source, output):
    import numpy as np
    from safetensors.numpy import load_file
    if file_sha(source / "adapters.safetensors") != PARENT_SHA:
        raise ValueError("nuknuk_gpu_parent_hash_changed")
    metadata = json.loads((source / "adapter_config.json").read_text())
    parameters = metadata.get("lora_parameters", {})
    if metadata.get("fine_tune_type") != "lora" or parameters.get("rank") != 8 or parameters.get("scale") != 2 or parameters.get("dropout") != 0:
        raise ValueError("nuknuk_gpu_parent_scaling_changed")
    arrays, errors = transpose_seed(load_file(source / "adapters.safetensors"))
    with output.open("xb") as file:
        np.savez(file, **arrays)
    write_json(output.with_suffix(".json"), {"sourceSha256": PARENT_SHA, "convertedSha256": file_sha(output),
        "scaling": 2, "rank": 8, "alpha": 16, "dropout": 0,
        "matrixDeltaMaxAbsoluteError": errors,
        "limitation": "Projection delta equivalence, not semantic equivalence of different base quantizations."})


def verify_bundle(folder):
    folder = folder.resolve(strict=True)
    manifest = json.loads((folder / "bundle.json").read_text())
    if manifest.get("model") != MODEL_ID or manifest.get("revision") != MODEL_REVISION or manifest.get("parentAdapterSha256") != PARENT_SHA:
        raise ValueError("nuknuk_gpu_bundle_identity_invalid")
    for name, expected in manifest["files"].items():
        original = folder / name
        path = original.resolve(strict=True)
        if folder not in path.parents or original.is_symlink() or file_sha(path) != expected:
            raise ValueError("nuknuk_gpu_bundle_file_changed")
    return manifest


def encode_row(row, tokenizer, maximum=4096):
    messages = row["messages"]
    if [m["role"] for m in messages] != ["system", "user", "assistant"]:
        raise ValueError("nuknuk_gpu_messages_invalid")
    # Construct the exact non-thinking inference prefix, then supervise only the
    # approved answer and end-of-turn. No silent tokenizer/template truncation.
    prefix = tokenizer.apply_chat_template(messages[:2], tokenize=True, add_generation_prompt=True,
        enable_thinking=False, return_dict=False)
    answer = tokenizer.encode(messages[2]["content"], add_special_tokens=False)
    eos = tokenizer.eos_token_id
    if not isinstance(prefix, list) or not prefix or not all(isinstance(token, int) for token in prefix) or not answer or not isinstance(eos, int):
        raise ValueError("nuknuk_gpu_completion_mask_invalid")
    ids = prefix + answer + [eos]
    if len(ids) > maximum:
        raise ValueError("nuknuk_gpu_would_truncate")
    return ids, [-100] * len(prefix) + answer + [eos]


def host_check(folder):
    manifest = verify_bundle(folder)
    if sys.platform != "linux":
        raise ValueError("nuknuk_gpu_linux_required")
    cards = subprocess.check_output(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], text=True, timeout=10).strip().splitlines()
    if len(cards) != 1 or int(cards[0].rsplit(",", 1)[1].strip()) < 78000:
        raise ValueError("nuknuk_gpu_single_80gb_card_required")
    if shutil.disk_usage(folder).free < 100 * 1024 ** 3:
        raise ValueError("nuknuk_gpu_disk_reserve_insufficient")
    return {"status": "HOST_AND_BUNDLE_CHECKED", "gpu": cards[0], "model": manifest["model"],
            "revision": manifest["revision"], "productionActivation": False,
            "limitation": "No weights loaded; CUDA load/backward still requires the smoke run."}


def load_model(folder, layers):
    import numpy as np
    import torch
    from transformers import AutoTokenizer, AutoModelForImageTextToText, BitsAndBytesConfig
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    torch.cuda.set_per_process_memory_fraction(0.85, 0)
    torch.manual_seed(7)
    model = AutoModelForImageTextToText.from_pretrained(MODEL_ID, revision=MODEL_REVISION,
        trust_remote_code=False, use_safetensors=True, dtype=torch.bfloat16, device_map={"": 0}, attn_implementation="sdpa",
        quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.bfloat16))
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=MODEL_REVISION, trust_remote_code=False)
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False})
    modules = [name for name, _ in model.named_modules() if re.fullmatch(r"model\.language_model\.layers\.\d+\.self_attn\.(q_proj|v_proj)", name)]
    indices = sorted({int(name.split(".")[3]) for name in modules})
    if len(indices) != 16 or indices[-1] != 63:
        raise ValueError("nuknuk_gpu_target_architecture_changed")
    selected = [name for name in modules if int(name.split(".")[3]) in indices[-layers:]]
    model = get_peft_model(model, LoraConfig(r=8, lora_alpha=16, lora_dropout=0,
        target_modules=selected, bias="none", task_type="CAUSAL_LM"))
    parameters = dict(model.named_parameters())
    with np.load(folder / "parent-seed.npz", allow_pickle=False) as seed, torch.no_grad():
        copied = []
        for key in seed.files:
            suffix = key + ".default.weight"
            matches = [(name, value) for name, value in parameters.items() if name.endswith(suffix)]
            if len(matches) != 1 or tuple(matches[0][1].shape) != seed[key].shape:
                raise ValueError("nuknuk_gpu_seed_target_mismatch")
            value = torch.as_tensor(seed[key], device=matches[0][1].device, dtype=matches[0][1].dtype)
            matches[0][1].copy_(value)
            if not torch.equal(matches[0][1], value):
                raise ValueError("nuknuk_gpu_seed_copy_failed")
            copied.append(matches[0][0])
    if len(copied) != 4 or any(p.requires_grad and ".lora_" not in name for name, p in parameters.items()):
        raise ValueError("nuknuk_gpu_trainable_boundary_failed")
    return model, tokenizer, {"targetModules": selected, "copiedParentMatrices": copied,
        "trainableParameters": sum(p.numel() for p in model.parameters() if p.requires_grad),
        "quantizationDifference": "MLX affine4bit -> CUDA NF4. Weight-delta mapping checked; behavior parity unproven."}


def run(args):
    folder = args.bundle.resolve(strict=True)
    host = host_check(folder)
    if args.command == "check":
        print(json.dumps(host)); return
    os.environ.setdefault("HF_HOME", "/workspace/hf-cache")
    os.environ.update(HF_HUB_DISABLE_TELEMETRY="1", WANDB_DISABLED="true", TOKENIZERS_PARALLELISM="false")
    # Independent GNU timeout (see runbook) must also bound download/load time.
    if not 1 <= args.steps <= 20 or args.layers not in (1, 4):
        raise ValueError("nuknuk_gpu_pilot_bounds_invalid")
    if args.output.exists() or folder == args.output.resolve() or folder in args.output.resolve().parents:
        raise ValueError("nuknuk_gpu_output_must_be_new_outside_bundle")
    args.output.mkdir(parents=True, mode=0o700)
    started = time.monotonic()
    import torch
    model, tokenizer, boundary = load_model(folder, args.layers)
    versions = {p: importlib.metadata.version(p) for p in ("torch", "transformers", "peft", "bitsandbytes")}
    write_json(args.output / "preflight.json", {**host, **boundary, "versions": versions, "steps": args.steps,
        "layers": args.layers, "learningRate": 1e-5, "seed": 7, "localSmokeTested": False})
    raw = [json.loads(line) for line in (folder / "data/train.jsonl").read_text().splitlines()]
    encoded = [encode_row(row, tokenizer) for row in raw]
    optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=1e-5, weight_decay=0)
    model.train()
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt
    import signal
    signal.signal(signal.SIGTERM, interrupted)
    status, completed = "FAILED", 0
    try:
        with (args.output / "steps.jsonl").open("x") as log:
            for step in range(args.steps):
                if time.monotonic() - started > 3000 or shutil.disk_usage(args.output).free < 25 * 1024 ** 3:
                    raise ValueError("nuknuk_gpu_run_reserve_reached")
                ids, labels = encoded[step % len(encoded)]
                batch = {"input_ids": torch.tensor([ids], device="cuda"), "labels": torch.tensor([labels], device="cuda"),
                         "attention_mask": torch.ones((1, len(ids)), device="cuda", dtype=torch.long)}
                optimizer.zero_grad(set_to_none=True)
                loss = model(**batch, use_cache=False).loss
                if not torch.isfinite(loss):
                    raise ValueError("nuknuk_gpu_nonfinite_loss")
                loss.backward()
                torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1)
                optimizer.step(); torch.cuda.synchronize(); completed = step + 1
                receipt = {"step": completed, "loss": float(loss.detach()), "elapsedSeconds": time.monotonic() - started,
                           "peakCudaAllocatedGiB": torch.cuda.max_memory_allocated() / 1024 ** 3}
                log.write(json.dumps(receipt) + "\n"); log.flush(); print(json.dumps(receipt), flush=True)
                del batch, loss
                if completed % 10 == 0:
                    model.save_pretrained(args.output / ("step-" + str(completed)), safe_serialization=True)
        model.save_pretrained(args.output / "adapter", safe_serialization=True)
        tokenizer.save_pretrained(args.output / "adapter")
        status = "FINISHED_REQUIRES_SEMANTIC_REVIEW"
    except KeyboardInterrupt:
        status = "INTERRUPTED_NO_AUTOMATIC_RETRY"
        raise
    finally:
        write_json(args.output / "result.json", {"status": status, "completedSteps": completed,
            "elapsedSeconds": time.monotonic() - started, "productionActivation": False,
            "providerBillingStopped": False})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    convert = sub.add_parser("convert")
    convert.add_argument("--source", type=Path, required=True)
    convert.add_argument("--output", type=Path, required=True)
    for command in ("check", "train"):
        cmd = sub.add_parser(command); cmd.add_argument("--bundle", type=Path, required=True)
        if command == "train":
            cmd.add_argument("--output", type=Path, required=True)
            cmd.add_argument("--steps", type=int, default=2)
            cmd.add_argument("--layers", type=int, choices=[1, 4], default=1)
    args = parser.parse_args()
    if args.command == "convert":
        convert_seed(args.source, args.output)
    else:
        run(args)
