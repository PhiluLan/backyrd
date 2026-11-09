"""Read-only teacher-forced decision-span scores, under the resource guard.

Scores selected tokens under the correct preceding answer, not free generation
or semantic confidence. No gradients, optimizer, weight writes or remote calls.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace


PROBES = {
    "r3-train-polarity-1": [('"modality":"NOT_REQUIRED"', "NOT_REQUIRED")],
    "r3-train-polarity-2": [('"modality":"EXCLUDED"', "EXCLUDED")],
    "r3-train-specificity-1": [('"text":"Getränke"', "Getränke")],
    "r3-train-specificity-2": [('"text":"beer"', "beer")],
    "r3-train-budget-4": [('"scope":"GROUP_TOTAL"', "GROUP_TOTAL"), ('"modality":"PREFERRED"', "PREFERRED")],
    "r3-train-relations-4": [('"kind":"SAME_PLACE"', "SAME_PLACE"), ('"kind":"SEQUENCE"', "SEQUENCE")],
}


def span_positions(token_ids, tokenizer, needle, value, completion_start):
    text = tokenizer.decode(token_ids, skip_special_tokens=False)
    start = text.rfind(needle)
    if start < 0 or value not in needle:
        raise ValueError("nuknuk_fit_span_missing")
    start += needle.rfind(value)
    end = start + len(value)
    # Decode prefixes rather than assume that a standalone tokenization matches
    # tokens embedded in the model's chat template (including Unicode pieces).
    positions = []
    previous = 0
    for index in range(len(token_ids)):
        current = len(tokenizer.decode(token_ids[:index + 1], skip_special_tokens=False))
        if current > start and previous < end:
            if index < completion_start or index == 0:
                raise ValueError("nuknuk_fit_span_outside_completion")
            positions.append(index)
        previous = current
        if previous >= end:
            break
    if not positions:
        raise ValueError("nuknuk_fit_span_tokens_missing")
    return positions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("model", "data", "adapter", "output"):
        parser.add_argument("--" + key, type=Path, required=True)
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--adapter-sha256", required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("nuknuk_fit_output_exists")
    spec = importlib.util.spec_from_file_location("fit_training_boundary", Path(__file__).with_name("nuknuk-train.py"))
    boundary = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(boundary)
    model_path = args.model.resolve(strict=True)
    data_path = args.data.resolve(strict=True)
    adapter_path = args.adapter.resolve(strict=True)
    if model_path.name not in boundary.REVISIONS:
        raise ValueError("nuknuk_fit_model_invalid")
    splits = boundary.verify_export(data_path, args.manifest_sha256)
    training = json.loads((adapter_path / "training-config.json").read_text())
    boundary.verify_initial_adapter(adapter_path, args.adapter_sha256, model_path, training)
    data = json.loads((data_path / "reviewed-backyrd.json").read_text())
    rows = [r for r in data["cases"] if r["split"] == "TRAIN"]
    if len(rows) != 6 or {r["id"] for r in rows} != set(PROBES):
        raise ValueError("nuknuk_fit_cohort_invalid")
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1")
    import mlx.core as mx
    from mlx_vlm import load
    from mlx_vlm.trainer.vlm.sft.dataset import VisionDataset
    from mlx_vlm.trainer.vlm.sft.runtime import forward_vlm_logits
    model, processor = load(str(model_path), adapter_path=str(adapter_path))
    model.eval()
    tokenizer = processor.tokenizer
    dataset = VisionDataset(splits["train"], json.loads((model_path / "config.json").read_text()), processor,
                            config=SimpleNamespace(train_on_completions=True))
    results = []
    for index, row in enumerate(rows):
        if json.loads(splits["train"][index]["messages"][-1]["content"]) != row["content"]["target"]:
            raise ValueError("nuknuk_fit_training_order_changed")
        sample = dataset[index]
        ids = sample["input_ids"].reshape(-1).tolist()
        mask = sample["completion_mask"].reshape(-1).tolist()
        first = next(i for i, flag in enumerate(mask) if flag)
        probes = [(needle, value, span_positions(ids, tokenizer, needle, value, first))
                  for needle, value in PROBES[row["id"]]]
        batch = {key: value[None, :] if isinstance(value, mx.array) and value.ndim == 1 else value
                 for key, value in sample.items()}
        logits = forward_vlm_logits(model, batch["input_ids"][:, :-1], batch["attention_mask"][:, :-1], batch)
        scored = []
        for needle, value, positions in probes:
            selected = logits[0, mx.array([p - 1 for p in positions]), :]
            targets = mx.array([ids[p] for p in positions])
            log_probs = selected - mx.logsumexp(selected, axis=-1, keepdims=True)
            correct = mx.take_along_axis(log_probs, targets[:, None], axis=-1).reshape(-1)
            argmax = mx.argmax(selected, axis=-1)
            mx.eval(correct, argmax)
            scored.append({"marker": needle, "value": value, "tokenPositions": positions,
                           "tokenIds": targets.tolist(), "logProbabilities": correct.tolist(),
                           "meanNll": -float(mx.mean(correct).item()),
                           "teacherForcedTop1Correct": int(mx.sum(argmax == targets).item()),
                           "tokens": len(positions)})
            del selected, targets, log_probs, correct, argmax
        results.append({"id": row["id"], "probes": scored})
        print(json.dumps({"id": row["id"], "scores": [{"value": s["value"], "meanNll": s["meanNll"]} for s in scored]}), flush=True)
        del logits, batch, sample
        mx.clear_cache()
    if hashlib.sha256((adapter_path / "adapters.safetensors").read_bytes()).hexdigest() != args.adapter_sha256:
        raise ValueError("nuknuk_fit_adapter_changed")
    report = {"status": "READ_ONLY_SPAN_SCORES_FINISHED", "adapterSha256": args.adapter_sha256,
              "manifestSha256": args.manifest_sha256, "cases": results, "productionActivation": False,
              "limitation": "Teacher forcing supplies the correct preceding answer. These scores are not free-generation accuracy, semantic confidence or generalization evidence."}
    with args.output.open("x") as file:
        json.dump(report, file, ensure_ascii=False, indent=2)
    args.output.chmod(0o600)


if __name__ == "__main__":
    main()
