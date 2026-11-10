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
signal.alarm(180)
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
requests = json.loads((folder / "evaluation-inputs.json").read_text())["cases"]
schemas = {}
for row in requests:
    schemas[row["task"]] = row["outputSchema"]
grammars = {key: compiler.compile(json.dumps(schema)) for key, schema in schemas.items()}
dataset = json.loads((folder / "reviewed-backyrd.json").read_text())
tokens_report = []
for split, name in [("TRAIN", "train"), ("VALIDATION", "valid"), ("TEST", "test")]:
    cases = [r for r in dataset["cases"] if r["split"] == split]
    rows = [json.loads(line) for line in (folder / (name + ".jsonl")).read_text().splitlines()]
    assert len(cases) == len(rows)
    for case, row in zip(cases, rows):
        messages = row["messages"]
        assert [m["role"] for m in messages] == ["system", "user", "assistant"]
        prefix_text = template.render(messages=messages[:2], add_generation_prompt=True, enable_thinking=False, tools=None)
        prefix = tokenizer.encode(prefix_text, add_special_tokens=False).ids
        answer = tokenizer.encode(messages[2]["content"], add_special_tokens=False).ids
        assert prefix and answer and len(prefix) + len(answer) + 1 <= 4096, (case["id"], len(prefix), len(answer), "would_truncate")
        assert len(answer) + 1 <= 2048, (case["id"], "completion_limit")
        ids = prefix + answer + [eos]
        labels = [-100] * len(prefix) + answer + [eos]
        assert len(ids) == len(labels) and labels[:len(prefix)] == [-100] * len(prefix)
        matcher = llguidance.LLMatcher(ll_tokenizer, grammars[case["content"]["task"]])
        for token in answer + [eos]:
            assert matcher.consume_token(token), (case["id"], "grammar_token_rejected")
        assert not matcher.get_error() and matcher.is_accepting(), (case["id"], "grammar_incomplete")
        tokens_report.append({"id": case["id"], "split": split, "prefixTokens": len(prefix), "answerTokens": len(answer), "totalTokens": len(ids), "grammarAccepted": True, "completionOnlyMaskVerified": True})
assert "torch" not in sys.modules and "transformers" not in sys.modules
report = {"version": "backyrd.nuknuk-offline-preflight@1", "datasetManifestFileSha256": sha(folder / "manifest.json"),
          "tokenizerFilesSha256": {name: sha(tokenizer_folder / name) for name in ["tokenizer.json", "tokenizer_config.json", "chat_template.jinja"]},
          "versions": {name: importlib.metadata.version(name) for name in ["tokenizers", "llguidance", "Jinja2"]},
          "cases": tokens_report, "caseCount": len(tokens_report), "maxTotalTokens": max(r["totalTokens"] for r in tokens_report),
          "maxAnswerTokens": max(r["answerTokens"] for r in tokens_report), "grammarCount": len(grammars),
          "peakRSSBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, "networkUsed": False, "modelLoaded": False, "trainingStarted": False,
          "limitations": ["Uses the locally saved Qwen tokenizer and exact Jinja template; GPU runner must verify the same file hashes and native runtime parity before training.", "Does not prove semantic correctness or adapter quality."]}
with output.open("x") as file:
    json.dump(report, file, ensure_ascii=False, indent=2)
print(json.dumps({key: report[key] for key in ["caseCount", "maxTotalTokens", "maxAnswerTokens", "grammarCount", "peakRSSBytes", "modelLoaded"]}))
