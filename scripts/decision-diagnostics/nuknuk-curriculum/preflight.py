"""Tokenizer/template/grammar preflight only. No transformers, torch or model."""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import resource
import signal
import socket
import sys

os.environ.update(HF_HUB_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1", TOKENIZERS_PARALLELISM="false")
def no_network(*_args, **_kwargs):
    raise RuntimeError("offline_preflight_network_forbidden")
socket.create_connection = no_network
signal.alarm(900)
from tokenizers import Tokenizer
from jinja2 import Environment
import llguidance

assert importlib.metadata.version("llguidance") == "1.9.1"
folder, tokenizer_folder, output = map(Path, sys.argv[1:])
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
tokenizer = Tokenizer.from_file(str(tokenizer_folder / "tokenizer.json"))
tokenizer.no_padding()
tokenizer.no_truncation()
config = json.loads((tokenizer_folder / "tokenizer_config.json").read_text())
eos = tokenizer.token_to_id(config["eos_token"])
assert isinstance(eos, int)
def raise_exception(message):
    raise ValueError(message)
env = Environment(trim_blocks=True, lstrip_blocks=True)
env.globals["raise_exception"] = raise_exception
template = env.from_string((tokenizer_folder / "chat_template.jinja").read_text())
ll_tokenizer = llguidance.LLTokenizer(tokenizer.to_str(), eos_token=eos)
compiler = llguidance.JsonCompiler(separators=(", ", ": "), whitespace_pattern="")
manifest = json.loads((folder / "manifest.json").read_text())
catalog_v2 = manifest.get("version") == "backyrd.nuknuk-beta-catalog@2"
transfer_requests, transfer_report = [], []
schema_by_case, schemas_by_task = {}, {}
max_total_tokens = 5120 if catalog_v2 else 4096
if catalog_v2:
    for name, expected in manifest["artifactByteHashes"].items():
        assert name == Path(name).name and sha(folder / name) == expected, (name, "artifact_changed")
    packed = json.loads((folder / "catalog.json").read_text())
    dataset = {"cases": [{"id": r["id"], "split": r["split"], "scenarioGroup": r["scenarioGroup"],
               "content": {"task": r["task"], "target": r["expected"]}, "request": r["request"]}
               for r in packed["cases"]]}
    schemas = packed["schemas"]
else:
    requests = json.loads((folder / "evaluation-inputs.json").read_text())["cases"]
    # Historical profiles retain their frozen 4096-token limit. The active Product
    # profile declares its independently measured 4608-token recipe explicitly.
    product_profile = manifest.get("version") == "backyrd.nuknuk-product-training-manifest@1"
    max_total_tokens = manifest.get('trainingLimits', {}).get('maxTotalTokens', 4608) if product_profile else 4096
    if product_profile:
        assert max_total_tokens in (4608, 5120)
        assert manifest.get("trainingLimits") == {"maxTotalTokens": max_total_tokens, "maxAnswerTokens": 2048}
    transfer_requests = []
    if manifest.get("cohort") in ("BETA_V1","BETA_REMEDIATION_V2") and "transfer-evaluation-inputs.json" in manifest["files"]:
        for name in ["transfer-evaluation-inputs.json", "transfer.jsonl"]:
            assert sha(folder / name) == manifest["files"][name]["sha256"], (name, "transfer_input_changed")
        transfer_requests = json.loads((folder / "transfer-evaluation-inputs.json").read_text())["cases"]
    schemas, schema_by_case, schemas_by_task = {}, {}, {}
    for row in requests + transfer_requests:
        key = hashlib.sha256(json.dumps(row["outputSchema"], sort_keys=True).encode()).hexdigest()
        assert row["id"] not in schema_by_case
        schemas[key] = row["outputSchema"]
        schema_by_case[row["id"]] = key
        schemas_by_task.setdefault(row["task"], set()).add(key)
    dataset = json.loads((folder / "reviewed-backyrd.json").read_text())
grammars = {key: compiler.compile(json.dumps(value)) for key, value in schemas.items()}
tokens_report = []
def inspect_messages(case_id, split, task, messages, grammar_key=None):
    assert [m["role"] for m in messages] == ["system", "user", "assistant"]
    prefix_text = template.render(messages=messages[:2], add_generation_prompt=True, enable_thinking=False, tools=None)
    prefix = tokenizer.encode(prefix_text, add_special_tokens=False).ids
    answer = tokenizer.encode(messages[2]["content"], add_special_tokens=False).ids
    assert prefix and answer and len(prefix) + len(answer) + 1 <= max_total_tokens, (case_id, "would_truncate")
    assert len(answer) + 1 <= 2048, (case_id, "completion_limit")
    ids = prefix + answer + [eos]
    labels = [-100] * len(prefix) + answer + [eos]
    assert len(ids) == len(labels) and labels[:len(prefix)] == [-100] * len(prefix)
    if catalog_v2:
        full = template.render(messages=messages, add_generation_prompt=False, enable_thinking=False, tools=None)
        assert full.startswith(prefix_text), (case_id, "training_inference_template_mismatch")
        full_ids = tokenizer.encode(full, add_special_tokens=False).ids
        assert full_ids[:len(prefix)] == prefix, (case_id, "completion_boundary_mismatch")
    if grammar_key is None:
        grammar_key = schema_by_case.get(case_id)
        if grammar_key is None:
            assert len(schemas_by_task[task]) == 1, (case_id, "derived_schema_ambiguous")
            grammar_key = next(iter(schemas_by_task[task]))
    matcher = llguidance.LLMatcher(ll_tokenizer, grammars[grammar_key])
    for token in answer + [eos]:
        assert matcher.consume_token(token), (case_id, "grammar_token_rejected")
    assert not matcher.get_error() and matcher.is_accepting(), (case_id, "grammar_incomplete")
    return {"id": case_id, "split": split, "task": task, "prefixTokens": len(prefix), "answerTokens": len(answer), "totalTokens": len(ids), "prefixTokenIdsSha256": hashlib.sha256(json.dumps(prefix,separators=(",", ":")).encode()).hexdigest(), "grammarAccepted": True, "completionBoundaryVerified": True, **({"trainerLabelsVerified": False} if catalog_v2 else {"completionOnlyMaskVerified": True})}

if catalog_v2:
    for split, name in [("TRAIN", "train"), ("DEV", "valid"), ("TEST", None)]:
        cases = [r for r in dataset["cases"] if r["split"] == split]
        exported = [json.loads(line) for line in (folder / (name + ".jsonl")).read_text().splitlines()] if name else None
        assert exported is None or len(exported) == len(cases)
        for i, case in enumerate(cases):
            request = case["request"]
            messages = [{"role": "system", "content": packed["prompts"][request["promptHash"]]},
                        {"role": "user", "content": request["input"]},
                        {"role": "assistant", "content": json.dumps(case["content"]["target"], ensure_ascii=False, separators=(", ", ": "))}]
            if exported is not None:
                assert exported[i]["messages"] == messages, (case["id"], "export_changed")
            tokens_report.append(inspect_messages(case["id"], split, case["content"]["task"], messages, request["schemaHash"]))
else:
    for split, name in [("TRAIN", "train"), ("VALIDATION", "valid"), ("TEST", "test")]:
        cases = [r for r in dataset["cases"] if r["split"] == split]
        rows = [json.loads(line) for line in (folder / (name + ".jsonl")).read_text().splitlines()]
        assert len(cases) == len(rows)
        for case, row in zip(cases, rows):
            tokens_report.append(inspect_messages(case["id"], split, case["content"]["task"], row["messages"]))
if transfer_requests:
    pairs = [json.loads(line) for line in (folder / "transfer.jsonl").read_text().splitlines()]
    assert len(pairs) == len(transfer_requests)
    for case, pair in zip(transfer_requests, pairs):
        assert case["split"] == "TRANSFER"
        transfer_report.append(inspect_messages(case["id"], "TRANSFER", case["task"], pair["messages"]))
derived_report = []
controls_file = folder / "metamorphic-controls.json"
if not catalog_v2 and controls_file.exists():
    for control in json.loads(controls_file.read_text())["cases"]:
        assert control["split"] in ("VALIDATION", "TEST")
        answer = json.dumps(control["expected"], ensure_ascii=False, separators=(", ", ": "))
        derived_report.append(inspect_messages(control["id"], control["split"], control["task"], control["messages"] + [{"role": "assistant", "content": answer}]))
mixture = {}
for case in dataset["cases"]:
    key = case["split"] + ":" + case["content"]["task"]
    entry = mixture.setdefault(key, {"examples": 0, "scenarioGroups": set(), "answerTokens": 0})
    entry["examples"] += 1
    entry["scenarioGroups"].add(case["scenarioGroup"])
    entry["answerTokens"] += next(r["answerTokens"] for r in tokens_report if r["id"] == case["id"])
for entry in mixture.values():
    entry["scenarioGroups"] = len(entry["scenarioGroups"])
assert "torch" not in sys.modules and "transformers" not in sys.modules
report = {"version": "backyrd.nuknuk-offline-preflight@2", "datasetManifestFileSha256": sha(folder / "manifest.json"),
          "tokenizerFilesSha256": {name: sha(tokenizer_folder / name) for name in ["tokenizer.json", "tokenizer_config.json", "chat_template.jinja"]},
          "versions": {name: importlib.metadata.version(name) for name in ["tokenizers", "llguidance", "Jinja2"]},
          "cases": tokens_report, "caseCount": len(tokens_report), "maxTotalTokens": max(r["totalTokens"] for r in tokens_report + transfer_report),
          "maxAnswerTokens": max(r["answerTokens"] for r in tokens_report + transfer_report), "grammarCount": len(grammars),
          "trainingTokenCount": sum(r["totalTokens"] for r in tokens_report if r["split"] == "TRAIN"),
          "trainingAnswerTokens": sum(r["answerTokens"] for r in tokens_report if r["split"] == "TRAIN"),
          "catalogVersion": manifest.get("version"), "maximumSequenceBound": max_total_tokens,
          "transferCases": transfer_report, "transferCaseCount": len(transfer_report), "derivedControls": derived_report, "derivedControlCount": len(derived_report), "taskMixture": mixture,
          "mixtureInterpretation": "Report examples, tokens and scenario groups separately. Grouped variants and derived controls are not independent user situations. Loss aggregation is a later recipe choice.",
          "peakRSSBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, "networkUsed": False, "modelLoaded": False, "trainingStarted": False,
          "limitations": ["Uses the locally saved Qwen tokenizer and exact Jinja template; GPU runner must verify the same file hashes and native runtime parity before training.", "Does not inspect the actual trainer labels; use native-tokenization.json from the bound trainer preprocessing function.", "Does not prove semantic correctness or adapter quality."]}
with output.open("x") as file:
    json.dump(report, file, ensure_ascii=False, indent=2)
print(json.dumps({key: report[key] for key in ["caseCount", "maxTotalTokens", "maxAnswerTokens", "grammarCount", "peakRSSBytes", "modelLoaded"]}))
