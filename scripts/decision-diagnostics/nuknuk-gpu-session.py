"""Bounded SSH-stdin inference session; no TCP listener or gold answers.

Shares the canonical GPU loader and grammar-constrained generation helper.
The caller must additionally own provider cost/shutdown watchers and a live
evidence sync. Starting this process never starts or rents a provider Pod.
"""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import sys
import time


TASKS = {"INTERPRET_REQUEST", "ASSESS_CANDIDATES", "PLAN_SEARCH", "PROPOSE_EXPERIENCE"}


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(8 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def checked_request(value, dataset_hash):
    if not isinstance(value, dict) or value.get("datasetHash") != dataset_hash:
        raise ValueError("gpu_session_dataset_mismatch")
    if not re.fullmatch(r"[a-z0-9_-]{1,160}", value.get("id", "")) or value.get("task") not in TASKS:
        raise ValueError("gpu_session_request_identity_invalid")
    messages = value.get("messages")
    if not isinstance(messages, list) or [m.get("role") for m in messages] != ["system", "user"]:
        raise ValueError("gpu_session_target_free_messages_required")
    if any(not isinstance(m.get("content"), str) or not m["content"] for m in messages):
        raise ValueError("gpu_session_messages_invalid")
    schema = value.get("outputSchema")
    if not isinstance(schema, dict) or len(json.dumps(value).encode()) > 256 * 1024:
        raise ValueError("gpu_session_schema_or_request_size_invalid")
    return value


def append_evidence(folder, name, value):
    with (folder / name).open("x") as file:
        os.chmod(file.name, 0o600)
        json.dump(value, file, ensure_ascii=False)
        file.write("\n")
        file.flush()
        os.fsync(file.fileno())


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def load_session_state(gpu, args):
    return gpu.load_inference_state(args.bundle, 16, "language-linear", args.adapter,
                                    initialization="fresh" if args.adapter is None else "adapter",
                                    adapter_sha256=args.adapter_sha256)


def main(args):
    if not re.fullmatch(r"[a-f0-9]{64}", args.dataset_hash):
        raise ValueError("gpu_session_dataset_hash_required")
    maximum_seconds = 14400 if args.run_profile == 'full-learning' else 7200
    if not 1 <= args.maximum_calls <= 240 or not 60 <= args.max_seconds <= maximum_seconds:
        raise ValueError("gpu_session_bounds_invalid")
    if args.output.exists() or args.output.resolve() == args.bundle.resolve():
        raise ValueError("gpu_session_new_output_required")
    if args.adapter is not None and (not args.adapter_sha256 or digest(args.adapter / "adapter_model.safetensors") != args.adapter_sha256):
        raise ValueError("gpu_session_adapter_pin_required")
    if args.adapter is None and args.adapter_sha256:
        raise ValueError("gpu_session_adapter_path_required")
    lock = open("/workspace/GPU_JOB_LOCK", "a")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    lock.write(str(os.getpid()) + "\n")
    lock.flush()
    args.output.mkdir(parents=True, mode=0o700)
    started = time.monotonic()

    def deadline(_signum, _frame):
        raise TimeoutError("gpu_session_total_deadline")

    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(args.max_seconds)
    spec = importlib.util.spec_from_file_location("nuknuk_gpu", args.bundle / "nuknuk-gpu.py")
    gpu = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gpu)
    manifest = gpu.verify_bundle(args.bundle)
    if manifest.get("sourceDatasetHash") != args.dataset_hash:
        raise ValueError("gpu_session_bundle_dataset_mismatch")
    import llguidance
    import importlib.metadata
    if importlib.metadata.version("llguidance") != "1.9.1":
        raise ValueError("gpu_session_grammar_version_changed")
    # Model startup information must not corrupt the JSONL control stream.
    from contextlib import redirect_stdout
    with redirect_stdout(sys.stderr):
        state = load_session_state(gpu, args)
        if args.adapter is None:
            snapshot = args.output / "initial-adapter"
            gpu.save_initial_adapter(state, snapshot)
            adapter_hash = digest(snapshot / "adapter_model.safetensors")
            append_evidence(snapshot, "checkpoint-complete.json", {
                "completedSteps": 0, "adapterSha256": adapter_hash,
                "strategy": "language-linear", "layers": 16,
                "purpose": "FROZEN_ZERO_DELTA_BASELINE_NOT_TRAINED"})
        else:
            adapter_hash = args.adapter_sha256
    identity = {"adapterHash": adapter_hash, "model": gpu.MODEL_ID, "revision": gpu.MODEL_REVISION,
                "initialization": "FRESH_ZERO_LORA" if args.adapter is None else "PINNED_ADAPTER"}
    ready = {"event": "READY", "modelIdentity": identity, "datasetHash": args.dataset_hash,
             "maximumCalls": args.maximum_calls, "trainingExecuted": False}
    append_evidence(args.output, "ready.json", ready)
    emit(ready)
    compiler = llguidance.JsonCompiler(separators=(", ", ": "), whitespace_pattern="")
    calls = 0
    seen = set()
    for line in sys.stdin:
        if calls >= args.maximum_calls:
            raise ValueError("gpu_session_call_bound_reached")
        request = checked_request(json.loads(line), args.dataset_hash)
        if request["id"] in seen:
            raise ValueError("gpu_session_duplicate_request")
        seen.add(request["id"])
        calls += 1
        append_evidence(args.output, request["id"] + "-request.json", request)
        grammar = compiler.compile(json.dumps(request["outputSchema"]))
        with redirect_stdout(sys.stderr):
            generated = gpu.generate_structured(state, request["messages"], grammar,
                                                 max_seconds=min(180, max(1, args.max_seconds - int(time.monotonic() - started))),
                                                 max_output_tokens=2048)
        record = {"event": "GENERATED", "id": request["id"], "task": request["task"],
                  "modelIdentity": identity, "datasetHash": args.dataset_hash, **generated}
        append_evidence(args.output, request["id"] + ".json", record)
        emit(record)
        if generated.get("status") == "FAILED" and generated.get("fatal"):
            raise ValueError("gpu_session_fatal_generation")
    result = {"event": "COMPLETE", "calls": calls, "elapsedSeconds": time.monotonic() - started,
              "modelIdentity": identity, "trainingExecuted": False, "providerBillingStopped": False}
    append_evidence(args.output, "result.json", result)
    emit(result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--dataset-hash", required=True)
    parser.add_argument("--adapter", type=Path)
    parser.add_argument("--adapter-sha256")
    parser.add_argument("--maximum-calls", type=int, default=208)
    parser.add_argument("--max-seconds", type=int, default=4500)
    parser.add_argument("--run-profile", choices=['bounded-pilot', 'full-learning'], default='bounded-pilot')
    main(parser.parse_args())
