"""Explicit local packaging / bounded CUDA pilot. Never deploys or rents a Pod.

The MLX->PEFT matrix mapping is algebraically checked during packaging. CUDA
NF4 and MLX affine quantization differ; semantic parity must be evaluated.
"""
import argparse
import hashlib
import importlib.metadata
import math
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

# Bound jobs must not acquire untracked bytecode payloads during runtime checks.
sys.dont_write_bytecode = True

MODEL_ID = "Qwen/Qwen3.5-27B"
MODEL_REVISION = "fc05daec18b0a78c049392ed2e771dde82bdf654"
PARENT_SHA = "cd0735f6cc576df3386ca0254d08d3db7e976f0711a6fad7bf900777a0f180b3"
V7_PURPOSE = "APPROVED_V7_FOUR_TASK_20_USD_PILOT"
V7_RECIPE = "V7_TASK_BALANCED_PILOT_V1"
V7_FULL_PURPOSE = "APPROVED_V7_FOUR_TASK_200_USD_FULL_LEARNING"
V7_FULL_RECIPE = "V7_FULL_LEARNING_V1"
V7_PURPOSES = (V7_PURPOSE, V7_FULL_PURPOSE)
V7_TASK_CYCLE = ("INTERPRET_REQUEST", "ASSESS_CANDIDATES", "PLAN_SEARCH", "PROPOSE_EXPERIENCE", "INTERPRET_REQUEST")


def json_digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def build_v7_schedule(cases, steps=210):
    """Two examples of one task per update; no length-dependent cross-task loss."""
    import random
    if not 1 <= steps <= 210 or len({r['id'] for r in cases}) != len(cases):
        raise ValueError('nuknuk_v7_schedule_inventory_invalid')
    groups = {task: {} for task in set(V7_TASK_CYCLE)}
    for index, row in enumerate(cases):
        if row.get('split') != 'TRAIN' or row.get('task') not in groups:
            raise ValueError('nuknuk_v7_schedule_train_only')
        groups[row['task']].setdefault(row['scenarioGroup'], []).append(index)
    rng = random.Random(7)
    queues = {}
    for task in sorted(groups):
        buckets = [groups[task][key][:] for key in sorted(groups[task])]
        rng.shuffle(buckets)
        for bucket in buckets:
            rng.shuffle(bucket)
        queue = []
        while any(buckets):
            for bucket in buckets:
                if bucket:
                    queue.append(bucket.pop())
        queues[task] = queue
    cursors = {task: 0 for task in queues}
    schedule = []
    for step in range(steps):
        task = V7_TASK_CYCLE[step % len(V7_TASK_CYCLE)]
        start = cursors[task]
        indices = queues[task][start:start + 2]
        if len(indices) != 2:
            raise ValueError('nuknuk_v7_schedule_would_repeat_or_underfill')
        cursors[task] += 2
        schedule.append({'step': step + 1, 'task': task, 'indices': indices,
                         'ids': [cases[i]['id'] for i in indices]})
    return schedule


def build_v7_full_schedule(cases, epochs=2):
    """Complete epochs; explicitly weighted task objective, no oversampling."""
    import random
    counts = {'INTERPRET_REQUEST': 700, 'ASSESS_CANDIDATES': 104,
              'PLAN_SEARCH': 84, 'PROPOSE_EXPERIENCE': 84}
    weights = {'INTERPRET_REQUEST': 0.4, 'ASSESS_CANDIDATES': 0.2,
               'PLAN_SEARCH': 0.2, 'PROPOSE_EXPERIENCE': 0.2}
    if epochs != 2 or len(cases) != 972 or len({row['id'] for row in cases}) != 972:
        raise ValueError('nuknuk_v7_full_inventory_invalid')
    groups = {task: {} for task in counts}
    for index, row in enumerate(cases):
        if row.get('split') != 'TRAIN' or row.get('task') not in groups:
            raise ValueError('nuknuk_v7_full_train_only')
        groups[row['task']].setdefault(row['scenarioGroup'], []).append(index)
    if any(sum(map(len, groups[task].values())) != count for task, count in counts.items()):
        raise ValueError('nuknuk_v7_full_task_counts_changed')
    schedule = []
    for epoch in range(epochs):
        rng = random.Random(7 + epoch)
        batches = []
        for task in sorted(groups):
            buckets = [groups[task][key][:] for key in sorted(groups[task])]
            rng.shuffle(buckets)
            for bucket in buckets:
                rng.shuffle(bucket)
            queue = []
            while any(buckets):
                for bucket in buckets:
                    if bucket:
                        queue.append(bucket.pop())
            task_steps = counts[task] // 2
            for position in range(task_steps):
                indices = queue[position * 2:position * 2 + 2]
                batches.append(((position + 0.5) / task_steps, task, indices))
        # Spread each task through the whole epoch, independent of answers/length.
        batches.sort(key=lambda item: (item[0], item[1]))
        for epoch_step, (_, task, indices) in enumerate(batches, 1):
            schedule.append({'step': len(schedule) + 1, 'epoch': epoch + 1, 'epochStep': epoch_step,
                'task': task, 'indices': indices, 'ids': [cases[index]['id'] for index in indices],
                'lossScale': weights[task] * 486 / (counts[task] // 2)})
    return schedule


def evaluation_rows(plan, split, one_per_group=False, preserve_tasks=False):
    rows = [row for row in plan['cases'] if row['split'] == split]
    if not one_per_group:
        return rows
    groups, selected = set(), []
    for row in rows:
        key = (row['task'], row['scenarioGroup']) if preserve_tasks else row['scenarioGroup']
        if key not in groups:
            selected.append(row)
            groups.add(key)
    return selected


def initialization_policy(initialization, adapter):
    if initialization not in ('legacy-seed', 'fresh', 'adapter'):
        raise ValueError('nuknuk_gpu_initialization_invalid')
    if (initialization == 'fresh' and adapter is not None) or (initialization == 'adapter' and adapter is None):
        raise ValueError('nuknuk_gpu_initialization_adapter_conflict')
    return initialization == 'legacy-seed'


def v7_recipe_check(folder, manifest, args):
    if manifest.get('purpose') not in V7_PURPOSES:
        if getattr(args, 'recipe', None) is not None:
            raise ValueError('nuknuk_v7_recipe_requires_v7_bundle')
        return None
    recipe = json.loads((folder / 'pilot-recipe.json').read_text())
    full = manifest.get('purpose') == V7_FULL_PURPOSE
    expected_recipe = V7_FULL_RECIPE if full else V7_RECIPE
    if getattr(args, 'recipe', None) != expected_recipe or recipe.get('name') != expected_recipe:
        raise ValueError('nuknuk_v7_explicit_recipe_required')
    if getattr(args, 'initialization', 'legacy-seed') not in ('fresh', 'adapter'):
        raise ValueError('nuknuk_v7_explicit_initialization_required')
    initialization_policy(args.initialization, args.adapter)
    if args.strategy != recipe['strategy'] or args.layers != recipe['layers']:
        raise ValueError('nuknuk_v7_recipe_architecture_changed')
    if getattr(args, 'command', None) == 'train' and (
        args.steps not in ((972,) if full else (2, 210)) or args.batch_size != 2 or args.learning_rate != recipe['learningRate']
        or args.checkpoint_every != recipe['checkpointEvery'] or args.completion_head
        or (full and args.initialization != 'fresh')
        or not 30 <= args.max_seconds <= recipe['maxTrainingSeconds']):
        raise ValueError('nuknuk_v7_recipe_training_changed')
    binding = {'recipeFileSha256': file_sha(folder / 'pilot-recipe.json'),
               'initialization': args.initialization, 'initialAdapterSha256': args.adapter_sha256,
               'steps': getattr(args, 'steps', None), 'maxSeconds': args.max_seconds}
    return {**binding, 'executionRecipeHash': json_digest(binding)}


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
    v7 = manifest.get('purpose') in V7_PURPOSES
    if manifest.get("model") != MODEL_ID or manifest.get("revision") != MODEL_REVISION or (not v7 and manifest.get("parentAdapterSha256") != PARENT_SHA):
        raise ValueError("nuknuk_gpu_bundle_identity_invalid")
    for name, expected in manifest["files"].items():
        original = folder / name
        path = original.resolve(strict=True)
        if folder not in path.parents or original.is_symlink() or file_sha(path) != expected:
            raise ValueError("nuknuk_gpu_bundle_file_changed")
    if v7:
        required = {'curriculum-manifest.json', 'offline-preflight.json', 'pilot-recipe.json', 'training-cases.json',
                    'evaluation-plan.json', 'metamorphic-evaluation-plan.json', 'chain-evaluation-inputs.json',
                    'data/train.jsonl', 'data/valid.jsonl', 'data/test.jsonl',
                    'tokenizer/tokenizer.json', 'tokenizer/tokenizer_config.json', 'tokenizer/chat_template.jinja'}
        if not required.issubset(manifest['files']) or manifest.get('counts') != {'TRAIN': 972, 'VALIDATION': 146, 'TEST': 178}:
            raise ValueError('nuknuk_v7_bundle_inventory_invalid')
        source = json.loads((folder / 'curriculum-manifest.json').read_text())
        preflight = json.loads((folder / 'offline-preflight.json').read_text())
        recipe = json.loads((folder / 'pilot-recipe.json').read_text())
        if (file_sha(folder / 'curriculum-manifest.json') != preflight['datasetManifestFileSha256']
            or source['datasetHash'] != manifest.get('sourceDatasetHash')
            or source['instructionProfile'] != 'SPOT_GROUNDED_V6'
            or source['targetSerialization'] != 'schema-ordered-spaced-json@1'
            or recipe['datasetHash'] != source['datasetHash']
            or recipe['name'] != (V7_FULL_RECIPE if manifest.get('purpose') == V7_FULL_PURPOSE else V7_RECIPE)
            or manifest.get('recipeFileSha256') != file_sha(folder / 'pilot-recipe.json')):
            raise ValueError('nuknuk_v7_source_binding_invalid')
        for name, digest in preflight['tokenizerFilesSha256'].items():
            if name not in ('tokenizer.json', 'tokenizer_config.json', 'chat_template.jinja') or file_sha(folder / 'tokenizer' / name) != digest:
                raise ValueError('nuknuk_v7_tokenizer_file_changed')
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


def padded_training_rows(samples, pad_token):
    if not samples or len(samples)>4 or any(len(ids)!=len(labels) or not ids for ids,labels in samples):
        raise ValueError("nuknuk_gpu_training_batch_invalid")
    width=max(len(ids) for ids,_ in samples)
    return {"input_ids":[ids+[pad_token]*(width-len(ids)) for ids,_ in samples],
        "labels":[labels+[-100]*(width-len(labels)) for _,labels in samples],
        "attention_mask":[[1]*len(ids)+[0]*(width-len(ids)) for ids,_ in samples]}


def native_completion_parity(row, tokenizer, reference_tokenizer, template):
    """Compare full token IDs, not just lengths, against frozen raw/Jinja input."""
    prefix_text = template.render(messages=row['messages'][:2], add_generation_prompt=True,
                                  enable_thinking=False, tools=None)
    prefix = reference_tokenizer.encode(prefix_text, add_special_tokens=False).ids
    answer = reference_tokenizer.encode(row['messages'][2]['content'], add_special_tokens=False).ids
    expected = prefix + answer + [tokenizer.eos_token_id]
    ids, labels = encode_row(row, tokenizer)
    if ids != expected or labels != [-100] * len(prefix) + answer + [tokenizer.eos_token_id]:
        raise ValueError('nuknuk_v7_native_tokenizer_template_parity_failed')
    if len(answer) + 1 > 2048:
        raise ValueError('nuknuk_v7_native_completion_limit')
    return ids, labels, len(prefix), answer


def verify_v7_native_runtime(folder, tokenizer):
    """Runs before loading model weights. TRAIN only; never uses held-out labels."""
    from tokenizers import Tokenizer
    from jinja2 import Environment
    import llguidance
    from llguidance.hf import from_tokenizer
    preflight = json.loads((folder / 'offline-preflight.json').read_text())
    if importlib.metadata.version('llguidance') != '1.9.1':
        raise ValueError('nuknuk_gpu_grammar_version_changed')
    raw_tokenizer = Tokenizer.from_file(str(folder / 'tokenizer' / 'tokenizer.json'))
    raw_tokenizer.no_padding(); raw_tokenizer.no_truncation()
    config = json.loads((folder / 'tokenizer' / 'tokenizer_config.json').read_text())
    if tokenizer.eos_token_id != raw_tokenizer.token_to_id(config['eos_token']):
        raise ValueError('nuknuk_v7_native_eos_changed')
    env = Environment(trim_blocks=True, lstrip_blocks=True)
    def raise_exception(message):
        raise ValueError(message)
    env.globals['raise_exception'] = raise_exception
    template = env.from_string((folder / 'tokenizer' / 'chat_template.jinja').read_text())
    plan = json.loads((folder / 'evaluation-plan.json').read_text())
    grammar_by_task = {}
    for case in plan['cases']:
        grammar = plan['grammars'][case['schemaHash']]
        if case['task'] in grammar_by_task and grammar_by_task[case['task']] != grammar:
            raise ValueError('nuknuk_v7_task_schema_not_constant')
        grammar_by_task[case['task']] = grammar
    rows = [json.loads(line) for line in (folder / 'data/train.jsonl').read_text().splitlines()]
    cases = json.loads((folder / 'training-cases.json').read_text())
    previous = {r['id']: r for r in preflight['cases'] if r['split'] == 'TRAIN'}
    if len(rows) != 972 or len(cases) != len(rows) or len(previous) != len(rows) or len(grammar_by_task) != 4:
        raise ValueError('nuknuk_v7_native_inventory_changed')
    ll_tokenizer = from_tokenizer(tokenizer)
    for row, case in zip(rows, cases):
        ids, _, prefix_length, answer = native_completion_parity(row, tokenizer, raw_tokenizer, template)
        expected = previous[case['id']]
        if (case['split'] != 'TRAIN' or expected['task'] != case['task'] or len(ids) != expected['totalTokens']
            or prefix_length != expected['prefixTokens'] or len(answer) != expected['answerTokens']):
            raise ValueError('nuknuk_v7_native_preflight_changed')
        matcher = llguidance.LLMatcher(ll_tokenizer, grammar_by_task[case['task']])
        for token in answer + [tokenizer.eos_token_id]:
            if not matcher.consume_token(token) or matcher.get_error():
                raise ValueError('nuknuk_v7_native_grammar_rejected')
        if not matcher.is_accepting():
            raise ValueError('nuknuk_v7_native_grammar_incomplete')
    return {'trainingRows': len(rows), 'taskSchemas': len(grammar_by_task), 'fullTokenIdsCompared': True,
            'completionMasksVerified': True, 'grammarTokensVerified': True, 'heldoutLabelsRead': False}


def host_check(folder):
    manifest = verify_bundle(folder)
    if sys.platform != "linux":
        raise ValueError("nuknuk_gpu_linux_required")
    cards = subprocess.check_output(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], text=True, timeout=10).strip().splitlines()
    if len(cards) != 1 or int(cards[0].rsplit(",", 1)[1].strip()) < 78000:
        raise ValueError("nuknuk_gpu_single_80gb_card_required")
    if manifest.get('purpose') == V7_FULL_PURPOSE and (
        'H200' not in cards[0] or int(cards[0].rsplit(',', 1)[1].strip()) < 130000):
        raise ValueError('nuknuk_v7_full_single_h200_required')
    if shutil.disk_usage(folder).free < 100 * 1024 ** 3:
        raise ValueError("nuknuk_gpu_disk_reserve_insufficient")
    return {"status": "HOST_AND_BUNDLE_CHECKED", "gpu": cards[0], "model": manifest["model"],
            "revision": manifest["revision"], "productionActivation": False,
            "limitation": "No weights loaded; CUDA load/backward still requires the smoke run."}


def select_targets(named_modules, layers, strategy):
    import torch
    if strategy == "language-linear":
        selected = [name for name, module in named_modules if re.fullmatch(r"model\.language_model\.layers\.\d+\..+", name) and isinstance(module, torch.nn.Linear)]
        if len(selected) < 200:
            raise ValueError("nuknuk_gpu_linear_architecture_changed")
        return selected
    modules = [name for name, _ in named_modules if re.fullmatch(r"model\.language_model\.layers\.\d+\.self_attn\.(q_proj|v_proj)", name)]
    indices = sorted({int(name.split(".")[3]) for name in modules})
    if len(indices) != 16 or len(modules) != 32 or indices[-1] != 63 or layers not in (1, 4, 16):
        raise ValueError("nuknuk_gpu_target_architecture_changed")
    return [name for name in modules if int(name.split(".")[3]) in indices[-layers:]]


def load_model(folder, layers, strategy="qv", adapter=None, initialization="legacy-seed"):
    import numpy as np
    import torch
    from transformers import AutoTokenizer, AutoModelForImageTextToText, BitsAndBytesConfig
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    torch.cuda.set_per_process_memory_fraction(0.85, 0)
    torch.manual_seed(7)
    seed_parent = initialization_policy(initialization, adapter)
    manifest = verify_bundle(folder)
    v7 = manifest.get('purpose') in V7_PURPOSES
    if v7 and initialization == 'legacy-seed':
        raise ValueError('nuknuk_v7_explicit_initialization_required')
    tokenizer = (AutoTokenizer.from_pretrained(folder / 'tokenizer', local_files_only=True, trust_remote_code=False)
                 if v7 else AutoTokenizer.from_pretrained(MODEL_ID, revision=MODEL_REVISION, trust_remote_code=False))
    native_parity = verify_v7_native_runtime(folder, tokenizer) if v7 else None
    model = AutoModelForImageTextToText.from_pretrained(MODEL_ID, revision=MODEL_REVISION,
        trust_remote_code=False, use_safetensors=True, dtype=torch.bfloat16, device_map={"": 0}, attn_implementation="sdpa",
        quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.bfloat16))
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False})
    selected = select_targets(list(model.named_modules()), layers, strategy)
    model = get_peft_model(model, LoraConfig(r=8, lora_alpha=16, lora_dropout=0,
        target_modules=selected, bias="none", task_type="CAUSAL_LM", init_lora_weights=True))
    parameters = dict(model.named_parameters())
    copied = []
    if seed_parent:
        with np.load(folder / "parent-seed.npz", allow_pickle=False) as seed, torch.no_grad():
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
        if len(copied) != 4:
            raise ValueError("nuknuk_gpu_trainable_boundary_failed")
    else:
        # PEFT starts with random A and exactly zero B: zero delta, useful gradients.
        b_values = [p for name, p in parameters.items() if '.lora_B.' in name]
        if not b_values or any(torch.count_nonzero(p).item() for p in b_values):
            raise ValueError('nuknuk_gpu_fresh_adapter_not_zero_delta')
    if any(p.requires_grad and '.lora_' not in name for name, p in parameters.items()):
        raise ValueError('nuknuk_gpu_trainable_boundary_failed')
    if adapter is not None:
        from safetensors.torch import load_file
        from peft import get_peft_model_state_dict, set_peft_model_state_dict
        actual = load_file(str(adapter / "adapter_model.safetensors"))
        expected = get_peft_model_state_dict(model)
        if set(actual) != set(expected) or any(actual[k].shape != expected[k].shape for k in expected):
            raise ValueError("nuknuk_gpu_evaluation_adapter_architecture_mismatch")
        set_peft_model_state_dict(model, actual, adapter_name="default")
        loaded = get_peft_model_state_dict(model)
        if any(not torch.equal(actual[k].to(device=loaded[k].device, dtype=loaded[k].dtype), loaded[k]) for k in actual):
            raise ValueError('nuknuk_gpu_adapter_restore_failed')
    return model, tokenizer, {"strategy": strategy, "targetModules": selected, "copiedParentMatrices": copied,
        "initialization": initialization, "nativeParity": native_parity,
        "trainableParameters": sum(p.numel() for p in model.parameters() if p.requires_grad),
        "quantizationDifference": ("MLX affine4bit -> CUDA NF4. Weight-delta mapping checked; behavior parity unproven."
            if seed_parent else "Pinned CUDA NF4 base; no historical MLX seed transferred. Semantic quality unproven.")}


def consume_generated(matcher, tokens, cursor):
    """Consume completion tokens only, including a final EOS not seen by a callback."""
    if len(tokens) < cursor:
        raise ValueError("nuknuk_gpu_generation_rewound")
    for token in tokens[cursor:]:
        if not matcher.consume_token(token) or matcher.get_error():
            raise ValueError("nuknuk_gpu_grammar_rejected_token")
    return len(tokens)


def adapter_parameter_digest(model):
    h = hashlib.sha256()
    for name, value in sorted(model.named_parameters()):
        if '.lora_' in name:
            h.update(name.encode()); h.update(value.detach().cpu().numpy().tobytes())
    return h.hexdigest()


def load_inference_state(folder, layers, strategy, adapter=None, initialization='legacy-seed', adapter_sha256=None):
    initialization_policy(initialization, adapter)
    if adapter is None and adapter_sha256 is not None:
        raise ValueError('nuknuk_gpu_evaluation_adapter_path_required')
    if adapter is not None and (not adapter_sha256 or file_sha(Path(adapter) / 'adapter_model.safetensors') != adapter_sha256):
        raise ValueError('nuknuk_gpu_evaluation_adapter_pin_required')
    import llguidance
    from llguidance.hf import from_tokenizer
    if importlib.metadata.version('llguidance') != '1.9.1':
        raise ValueError('nuknuk_gpu_grammar_version_changed')
    model, tokenizer, boundary = load_model(Path(folder), layers, strategy, adapter, initialization)
    model.gradient_checkpointing_disable(); model.requires_grad_(False); model.eval(); model.config.use_cache = True
    return {'model': model, 'tokenizer': tokenizer, 'll_tokenizer': from_tokenizer(tokenizer),
            'boundary': boundary, 'initialAdapterParameterDigest': adapter_parameter_digest(model)}


def save_initial_adapter(state, output):
    """Save actual zero-delta or restored tensors; never substitute a base model hash."""
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    state['model'].save_pretrained(output, safe_serialization=True)
    state['tokenizer'].save_pretrained(output)
    receipt = {'adapterSha256': file_sha(output / 'adapter_model.safetensors'),
               'adapterParameterDigest': adapter_parameter_digest(state['model']),
               'initialization': state['boundary']['initialization'], 'weightsUpdated': False,
               'model': MODEL_ID, 'revision': MODEL_REVISION}
    write_json(output / 'initial-adapter.json', receipt)
    return receipt


def catalog_generation_budget(prefix_tokens,maximum_output_tokens):
    if not isinstance(prefix_tokens,int) or not 0<prefix_tokens<5120 or not isinstance(maximum_output_tokens,int) or not 1<=maximum_output_tokens<=2048:
        raise ValueError('catalog_generation_budget_invalid')
    return min(maximum_output_tokens,5120-prefix_tokens)


def generate_structured_batch(state, batch, max_seconds=240, max_output_tokens=2048):
    """One shared constrained generation implementation for phases and live rollouts."""
    import numpy as np
    import torch
    import llguidance
    from transformers import LogitsProcessor
    if not 0 < max_seconds <= 240 or not 1 <= max_output_tokens <= 2048 or not 1 <= len(batch) <= 4:
        raise ValueError('nuknuk_gpu_generation_bounds_invalid')
    model, tokenizer, ll_tokenizer = state['model'], state['tokenizer'], state['ll_tokenizer']
    if any([m['role'] for m in row['messages']] != ['system', 'user'] or not isinstance(row['grammar'], str) for row in batch):
        raise ValueError('nuknuk_gpu_inference_messages_invalid')
    class GrammarMask(LogitsProcessor):
        def __init__(self,batch,prefix_length):
            self.matchers=[llguidance.LLMatcher(ll_tokenizer,r['grammar']) for r in batch]
            self.cursors=[0]*len(batch);self.ended=[False]*len(batch);self.prefix_length=prefix_length
            if any(m.get_error() for m in self.matchers):raise ValueError('nuknuk_gpu_grammar_invalid')
        def consume(self,index,tokens):
            for token in tokens[self.cursors[index]:]:
                if not self.ended[index]:
                    if not self.matchers[index].consume_token(token) or self.matchers[index].get_error():raise ValueError('nuknuk_gpu_grammar_rejected_token')
                    if token==tokenizer.eos_token_id:self.ended[index]=True
                elif token!=tokenizer.eos_token_id:raise ValueError('nuknuk_gpu_nonpadding_after_eos')
            self.cursors[index]=len(tokens)
        def __call__(self,input_ids,scores):
            if input_ids.shape[0]!=len(self.matchers):raise ValueError('nuknuk_gpu_generation_batch_changed')
            allowed=torch.zeros_like(scores,dtype=torch.bool)
            for index,matcher in enumerate(self.matchers):
                self.consume(index,input_ids[index,self.prefix_length:].tolist())
                if self.ended[index]:allowed[index,tokenizer.eos_token_id]=True;continue
                mask=np.frombuffer(matcher.compute_logit_bias(),dtype=np.uint8)==200
                if len(mask)>scores.shape[-1]:raise ValueError('nuknuk_gpu_grammar_vocab_mismatch')
                allowed[index,:len(mask)]=torch.as_tensor(mask.copy(),device=scores.device)
            return scores.masked_fill(~allowed,float('-inf'))
    prefixes = [tokenizer.apply_chat_template(r['messages'], tokenize=True, add_generation_prompt=True,
                enable_thinking=False, return_dict=False) for r in batch]
    product = state['boundary'].get('profile') in ('PRODUCT_SEARCH_V7_CONTINUATION_V1','PRODUCT_SEARCH_V7_BETA_CONTINUATION_V1','PRODUCT_SEARCH_V7_BETA_REMEDIATION_V2','PRODUCT_SEARCH_V7_BETA_CATALOG_V2')
    maximum_prefix = state['boundary'].get('maxTotalTokens', 4608) if product else 4096
    if product and maximum_prefix not in (4608, 5120):
        raise ValueError('nuknuk_gpu_evaluation_prefix_limit_invalid')
    if any(not isinstance(p, list) or not p or len(p) >= maximum_prefix for p in prefixes):
        raise ValueError('nuknuk_gpu_evaluation_prefix_invalid')
    length = max(map(len, prefixes))
    budget = min(max_output_tokens, maximum_prefix + 2048 - length) if product else min(max_output_tokens, 4096 - length) if state['boundary'].get('nativeParity') else max_output_tokens
    if state['boundary'].get('profile') == 'PRODUCT_SEARCH_V7_BETA_CATALOG_V2':budget=catalog_generation_budget(length,max_output_tokens)
    ids = torch.full((len(batch), length), tokenizer.eos_token_id, dtype=torch.long, device='cuda')
    attention = torch.zeros_like(ids)
    for index, prefix in enumerate(prefixes):
        ids[index, -len(prefix):] = torch.tensor(prefix, device='cuda'); attention[index, -len(prefix):] = 1
    processor = GrammarMask(batch, length)
    started = time.monotonic()
    with torch.inference_mode():
        generated = model.generate(input_ids=ids, attention_mask=attention, max_new_tokens=budget,
            max_time=max_seconds, do_sample=False, use_cache=True, logits_processor=[processor],
            pad_token_id=tokenizer.eos_token_id, eos_token_id=tokenizer.eos_token_id)
    duration = time.monotonic() - started
    records = []
    for index in range(len(batch)):
        tokens = generated[index, length:].tolist()
        if tokenizer.eos_token_id in tokens:
            tokens = tokens[:tokens.index(tokenizer.eos_token_id) + 1]
        record = {'inputTokens': len(prefixes[index]), 'outputTokens': len(tokens), 'outputTokenBudget': budget,
                  'rawText': tokenizer.decode(tokens, skip_special_tokens=True), 'raw': None, 'status': 'FAILED',
                  'durationSeconds': duration, 'durationMs': round(duration * 1000), 'batchSize': len(batch),
                  'peakCudaAllocatedGiB': torch.cuda.max_memory_allocated() / 1024**3}
        try:
            processor.consume(index, tokens)
            if not tokens or tokens[-1] != tokenizer.eos_token_id or not processor.matchers[index].is_accepting():
                raise ValueError('nuknuk_gpu_generation_incomplete')
            record.update(raw=json.loads(record['rawText']), status='GENERATED_REQUIRES_SEMANTIC_REVIEW')
        except Exception as error:
            record['error'] = str(error)
        records.append(record)
    return records


def generate_structured(state, messages, grammar, max_seconds=240, max_output_tokens=2048):
    return generate_structured_batch(state, [{'messages': messages, 'grammar': grammar}], max_seconds, max_output_tokens)[0]


def evaluate(args):
    """Frozen grammar-constrained generation. Targets never enter this process."""
    folder = args.bundle.resolve(strict=True)
    host, manifest = host_check(folder), verify_bundle(folder)
    curriculum = args.plan_file is not None
    plan_name = args.plan_file or 'parity-cases.json'
    if plan_name not in manifest['files']:
        raise ValueError('nuknuk_gpu_evaluation_plan_missing')
    plan = json.loads((folder / plan_name).read_text())
    if plan.get('llguidanceVersion') != '1.9.1' or plan.get('maxOutputTokens') != 2048:
        raise ValueError('nuknuk_gpu_evaluation_plan_invalid')
    if curriculum:
        allowed_plans = ('FROZEN_CURRICULUM_EVALUATION_INPUTS_ONLY', 'DERIVED_METAMORPHIC_EVALUATION_INPUTS_ONLY') if manifest.get('purpose') in V7_PURPOSES else ('FROZEN_CURRICULUM_EVALUATION_INPUTS_ONLY',)
        if manifest.get('purpose') not in ('APPROVED_BROAD_CURRICULUM_20_USD_BOUNDED', *V7_PURPOSES) or plan.get('purpose') not in allowed_plans:
            raise ValueError('nuknuk_gpu_curriculum_identity_invalid')
        rows = evaluation_rows(plan, args.split, args.one_per_group, manifest.get('purpose') in V7_PURPOSES)
        if manifest.get('purpose') in V7_PURPOSES and plan.get('datasetHash') != manifest['sourceDatasetHash']:
            raise ValueError('nuknuk_v7_evaluation_dataset_changed')
    else:
        if plan.get('parentAdapterSha256') != PARENT_SHA or len(plan['cases']) != 6 or args.adapter is not None or args.batch_size != 1:
            raise ValueError('nuknuk_gpu_parity_plan_invalid')
        rows = plan['cases']
    if not rows or len(rows)>300 or not 1<=args.batch_size<=4:
        raise ValueError('nuknuk_gpu_evaluation_size_invalid')
    if args.output.exists() or folder == args.output.resolve() or folder in args.output.resolve().parents:
        raise ValueError('nuknuk_gpu_output_must_be_new_outside_bundle')
    if args.adapter is not None and (not args.adapter_sha256 or file_sha(args.adapter/'adapter_model.safetensors')!=args.adapter_sha256):
        raise ValueError('nuknuk_gpu_evaluation_adapter_pin_required')
    recipe_binding = v7_recipe_check(folder, manifest, args)
    if recipe_binding and args.split == 'TEST':
        selection_path = getattr(args, 'frozen_selection', None)
        if not selection_path:
            raise ValueError('nuknuk_v7_test_requires_frozen_selection')
        selection = json.loads(selection_path.read_text())
        if (selection.get('datasetHash') != manifest['sourceDatasetHash']
            or not args.adapter_sha256 or selection.get('adapterHash') != args.adapter_sha256
            or not re.fullmatch('[a-f0-9]{64}', selection.get('developmentReportHash', ''))
            or not selection.get('frozenAt')):
            raise ValueError('nuknuk_v7_test_selection_mismatch')
    args.output.mkdir(parents=True, mode=0o700)
    os.environ.setdefault('HF_HOME','/workspace/hf-cache')
    os.environ.update(HF_HUB_DISABLE_TELEMETRY='1',WANDB_DISABLED='true',TOKENIZERS_PARALLELISM='false')
    started = time.monotonic()
    state = load_inference_state(folder, args.layers if curriculum else 1, args.strategy if curriculum else 'qv',
                                 args.adapter, getattr(args, 'initialization', 'legacy-seed'), args.adapter_sha256)
    boundary = state['boundary']
    before = adapter_parameter_digest(state['model'])
    write_json(args.output/'preflight.json',{**host,**boundary,'mode':'CURRICULUM_GENERATION' if curriculum else 'READ_ONLY_PARENT_PARITY',
        'planSha256':file_sha(folder/plan_name),'allParametersFrozen':True,'trainingExecuted':False,'batchSize':args.batch_size,
        'adapterSha256':args.adapter_sha256,'split':args.split if curriculum else 'KNOWN_TRAIN','caseCount':len(rows),
        'recipeBinding':recipe_binding,'subsetDiagnosticOnly':bool(args.one_per_group) if curriculum else False})
    records=[]
    for start in range(0,len(rows),args.batch_size):
        if time.monotonic()-started>args.max_seconds:raise ValueError('nuknuk_gpu_evaluation_deadline')
        batch=rows[start:start+args.batch_size]
        outputs = generate_structured_batch(state, [{'messages': row['messages'],
            'grammar': row.get('grammar') or plan['grammars'][row['schemaHash']]} for row in batch])
        for row, generated in zip(batch, outputs):
            record = {k: row[k] for k in ('id', 'query', 'promptHash', 'inputHash', 'schemaHash')}
            record.update(generated)
            id_pattern = '[a-z0-9_-]+' if recipe_binding else '[a-z0-9-]+'
            if not re.fullmatch(id_pattern,row['id']):raise ValueError('nuknuk_gpu_case_id_invalid')
            write_json(args.output/(row['id']+'.json'),record)
            records.append({k:record[k] for k in ('id','status','durationSeconds')});print(json.dumps(records[-1]),flush=True)
    after=adapter_parameter_digest(state['model'])
    if before!=after:raise ValueError('nuknuk_gpu_evaluation_changed_adapter')
    write_json(args.output/'result.json',{'status':'GENERATION_COMPLETE_REQUIRES_REVIEW','cases':records,'adapterUnchanged':True,'adapterParameterDigest':before,
        'trainingExecuted':False,'productionActivation':False,'elapsedSeconds':time.monotonic()-started,'providerBillingStopped':False})


def completion_loss(model, batch):
    """Same supervised tokens; avoid projecting ignored prompt positions to vocab."""
    import torch
    labels = batch["labels"]
    if labels.shape[0] != 1:
        raise ValueError("nuknuk_gpu_completion_batch_invalid")
    positions = (labels[0] != -100).nonzero().flatten()
    start = int(positions[0])
    if start < 1 or len(positions) != labels.shape[1]-start:
        raise ValueError("nuknuk_gpu_completion_mask_not_contiguous")
    output = model(input_ids=batch["input_ids"], attention_mask=batch["attention_mask"], use_cache=False,
                   logits_to_keep=labels.shape[1]-start+1)
    logits = output.logits[:, :-1, :].float()
    if logits.shape[1] != len(positions):
        raise ValueError("nuknuk_gpu_completion_logits_not_supported")
    return torch.nn.functional.cross_entropy(logits.reshape(-1, logits.shape[-1]), labels[:,start:].reshape(-1))


def verify_completion_loss(model, batch, output):
    import torch
    model.train();model.zero_grad(set_to_none=True)
    full = model(**batch,use_cache=False).loss
    full_value = float(full.detach());full.backward()
    expected = {name:p.grad.detach().cpu().clone() for name,p in model.named_parameters() if p.requires_grad and p.grad is not None}
    del full;model.zero_grad(set_to_none=True);torch.cuda.empty_cache()
    compact = completion_loss(model,batch);compact_value=float(compact.detach());compact.backward()
    torch.testing.assert_close(torch.tensor(full_value),torch.tensor(compact_value),rtol=1e-5,atol=1e-5)
    maximum=0.0;metrics=[]
    for name,p in model.named_parameters():
        if name in expected:
            if p.grad is None:raise ValueError("nuknuk_gpu_completion_gradient_missing")
            actual=p.grad.detach().cpu()
            difference=actual-expected[name]
            norm=float(torch.linalg.vector_norm(expected[name]));delta=float(torch.linalg.vector_norm(difference))
            metrics.append({"name":name,"referenceNorm":norm,"differenceNorm":delta,"relativeL2":delta/max(norm,1e-12),
                "maxAbsoluteDifference":float(difference.abs().max()),"cosine":float(torch.nn.functional.cosine_similarity(actual.flatten(),expected[name].flatten(),dim=0)) if norm>1e-12 else None})
            maximum=max(maximum,float(difference.abs().max()))
    model.zero_grad(set_to_none=True);torch.cuda.empty_cache()
    write_json(output/"completion-gradient-diagnostics.json",{"tensors":metrics,"fullLoss":full_value,"completionLoss":compact_value,"weightsUpdated":False})
    if any(m["relativeL2"]>0.001 or (m["cosine"] is not None and m["cosine"]<0.99999) for m in metrics):
        raise ValueError("nuknuk_gpu_completion_gradient_aggregate_not_equivalent")
    write_json(output/"completion-loss-equivalence.json",{"fullLoss":full_value,"completionLoss":compact_value,
        "maxAbsoluteAdapterGradientDifference":maximum,"checkedAdapterGradients":len(expected),"maxRelativeGradientL2":max(m["relativeL2"] for m in metrics),"weightsUpdated":False,
        "limitation":"Numerical gradient equivalence on this input, not model understanding quality."})


def training_adapter(args):
    adapter=getattr(args,'adapter',None)
    digest=getattr(args,'adapter_sha256',None)
    if adapter is None:
        if digest:raise ValueError('nuknuk_gpu_training_adapter_path_required')
        return None
    if not digest or file_sha(adapter/'adapter_model.safetensors')!=digest:
        raise ValueError('nuknuk_gpu_training_adapter_pin_required')
    if adapter.resolve()==args.output.resolve() or adapter.resolve() in args.output.resolve().parents:
        raise ValueError('nuknuk_gpu_training_adapter_output_overlap')
    return adapter


def run(args):
    folder = args.bundle.resolve(strict=True)
    host = host_check(folder)
    if args.command == "check":
        print(json.dumps(host)); return
    os.environ.setdefault("HF_HOME", "/workspace/hf-cache")
    os.environ.update(HF_HUB_DISABLE_TELEMETRY="1", WANDB_DISABLED="true", TOKENIZERS_PARALLELISM="false")
    # Independent GNU timeout (see runbook) must also bound download/load time.
    manifest = verify_bundle(folder)
    recipe_binding = v7_recipe_check(folder, manifest, args)
    full_learning = manifest.get('purpose') == V7_FULL_PURPOSE
    broad = host.get("model") == MODEL_ID and manifest.get("purpose") in ("APPROVED_BROAD_CURRICULUM_20_USD_BOUNDED", *V7_PURPOSES)
    if not 1 <= args.steps <= (5000 if broad else 20) or args.layers not in (1, 4, 16) or args.batch_size not in (1,2,4) or (not broad and (args.strategy != "qv" or args.layers == 16 or args.batch_size!=1)):
        raise ValueError("nuknuk_gpu_pilot_bounds_invalid")
    if not 30 <= args.max_seconds <= (32400 if full_learning else 12600 if broad else 3000) or not 0 < args.learning_rate <= 0.0001 or not 1 <= args.checkpoint_every <= 250:
        raise ValueError("nuknuk_gpu_pilot_bounds_invalid")
    if args.output.exists() or folder == args.output.resolve() or folder in args.output.resolve().parents:
        raise ValueError("nuknuk_gpu_output_must_be_new_outside_bundle")
    args.output.mkdir(parents=True, mode=0o700)
    started = time.monotonic()
    import torch
    initial_adapter = training_adapter(args)
    initial_sha = getattr(args, 'adapter_sha256', None)
    model, tokenizer, boundary = load_model(folder, args.layers, args.strategy, initial_adapter,
                                          getattr(args, 'initialization', 'legacy-seed'))
    versions = {p: importlib.metadata.version(p) for p in ("torch", "transformers", "peft", "bitsandbytes")}
    write_json(args.output / "preflight.json", {**host, **boundary, "versions": versions, "steps": args.steps,
        "layers": args.layers, "strategy": args.strategy, "learningRate": args.learning_rate, "seed": 7, "maxSeconds": args.max_seconds, "batchSize":args.batch_size,"localSmokeTested": False,
        "initialAdapterSha256":initial_sha,"recipeBinding":recipe_binding})
    lines = (folder / "data/train.jsonl").read_text().splitlines()
    raw = [json.loads(line) for line in lines]
    encoded = [encode_row(row, tokenizer) for row in raw]
    schedule = None
    if recipe_binding:
        cases = json.loads((folder / 'training-cases.json').read_text())
        if len(cases) != len(lines) or any(hashlib.sha256(line.encode()).hexdigest() != case['rowSha256'] for line, case in zip(lines, cases)):
            raise ValueError('nuknuk_v7_training_row_identity_changed')
        schedule = build_v7_full_schedule(cases) if full_learning else build_v7_schedule(cases, args.steps)
        exposure = {}
        for item in schedule:
            entry = exposure.setdefault(item['task'], {'updates': 0, 'examples': 0, 'supervisedTokens': 0, 'sumLossScale': 0})
            entry['updates'] += 1; entry['examples'] += len(item['indices'])
            entry['sumLossScale'] += item.get('lossScale', 1)
            entry['supervisedTokens'] += sum(sum(label != -100 for label in encoded[index][1]) for index in item['indices'])
        write_json(args.output / 'training-schedule.json', {'schedule': schedule, 'scheduleHash': json_digest(schedule),
            'recipeBinding': recipe_binding, 'plannedExposure': exposure,
            'lossAggregation': ('Token mean within each two-row single-task batch, multiplied by taskWeight * 486 / taskUpdatesPerEpoch. The epoch mean defines a 40/20/20/20 task objective; Adam, clipping and LR scheduling do not imply exact gradient-contribution shares.'
                if full_learning else 'Token mean within a two-row single-task batch; one equally weighted optimizer update. No cross-task token-length weighting.'),
            'uniqueTrainingRows': len({index for item in schedule for index in item['indices']}),
            'epochs': 2 if full_learning else None})
    optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=args.learning_rate, weight_decay=0)
    import random, math
    order = list(range(len(encoded))); random.Random(7).shuffle(order)
    warmup = max(2, min(60, args.steps // 20))
    def lr_factor(step):
        if step < warmup: return max(0.1, (step + 1) / warmup)
        return 0.1 + 0.9 * (1 + math.cos(math.pi * (step-warmup) / max(1,args.steps-warmup))) / 2
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_factor)
    model.train()
    if args.completion_head:
        if args.batch_size!=1:raise ValueError("nuknuk_gpu_completion_single_sample_only")
        if not broad: raise ValueError("nuknuk_gpu_completion_requires_broad_curriculum")
        ids,labels=encoded[order[0]]
        probe={"input_ids":torch.tensor([ids],device="cuda"),"labels":torch.tensor([labels],device="cuda"),
               "attention_mask":torch.ones((1,len(ids)),device="cuda",dtype=torch.long)}
        verify_completion_loss(model,probe,args.output)
        del probe
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt
    import signal
    signal.signal(signal.SIGTERM, interrupted)
    status, completed = "FAILED", 0
    try:
        with (args.output / "steps.jsonl").open("x") as log:
            for step in range(args.steps):
                if time.monotonic() - started > args.max_seconds or shutil.disk_usage(args.output).free < 25 * 1024 ** 3:
                    status = "BUDGET_OR_DISK_BOUNDARY_CHECKPOINTED"
                    break
                start=(step*args.batch_size)%len(encoded)
                indices=schedule[step]['indices'] if schedule else order[start:min(start+args.batch_size,len(encoded))]
                samples=[encoded[index] for index in indices]
                batch={key:torch.tensor(value,device="cuda",dtype=torch.long)
                    for key,value in padded_training_rows(samples,tokenizer.eos_token_id).items()}
                optimizer.zero_grad(set_to_none=True)
                raw_loss = completion_loss(model,batch) if args.completion_head else model(**batch, use_cache=False).loss
                loss = raw_loss * schedule[step]['lossScale'] if full_learning else raw_loss
                if not torch.isfinite(raw_loss) or not torch.isfinite(loss):
                    raise ValueError("nuknuk_gpu_nonfinite_loss")
                loss.backward()
                torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1,
                                              **({'error_if_nonfinite': True} if full_learning else {}))
                optimizer.step(); scheduler.step(); torch.cuda.synchronize(); completed = step + 1
                receipt = {"step": completed, "loss": float(loss.detach()), "elapsedSeconds": time.monotonic() - started,
                           "peakCudaAllocatedGiB": torch.cuda.max_memory_allocated() / 1024 ** 3, "trainingRows": indices,"examplesProcessed": min((step+1)*args.batch_size, len(encoded)) if args.steps*args.batch_size<=len(encoded) else (step+1)*args.batch_size,
                           "learningRate": scheduler.get_last_lr()[0]}
                if schedule:
                    receipt.update(task=schedule[step]['task'], caseIds=schedule[step]['ids'],
                                   supervisedTokens=sum(sum(v != -100 for v in labels) for _, labels in samples))
                if full_learning:
                    receipt.update(epoch=schedule[step]['epoch'], epochStep=schedule[step]['epochStep'],
                                   unweightedLoss=float(raw_loss.detach()), lossScale=schedule[step]['lossScale'])
                log.write(json.dumps(receipt) + "\n"); log.flush(); print(json.dumps(receipt), flush=True)
                del batch, loss, raw_loss
                if completed % args.checkpoint_every == 0:
                    checkpoint = args.output / ("step-" + str(completed))
                    model.save_pretrained(checkpoint, safe_serialization=True)
                    write_json(checkpoint / "checkpoint-complete.json", {"completedSteps":completed,"adapterSha256":file_sha(checkpoint / "adapter_model.safetensors"),"strategy":args.strategy,"layers":args.layers})
        model.save_pretrained(args.output / "adapter", safe_serialization=True)
        tokenizer.save_pretrained(args.output / "adapter")
        write_json(args.output / "adapter" / "checkpoint-complete.json", {"completedSteps":completed,"adapterSha256":file_sha(args.output / "adapter" / "adapter_model.safetensors"),"strategy":args.strategy,"layers":args.layers})
        if completed == args.steps:
            status = "FINISHED_REQUIRES_SEMANTIC_REVIEW"
    except KeyboardInterrupt:
        status = "INTERRUPTED_NO_AUTOMATIC_RETRY"
        raise
    finally:
        write_json(args.output / "result.json", {"status": status, "completedSteps": completed,
            "elapsedSeconds": time.monotonic() - started, "productionActivation": False,
            **({'completedEpochs': completed // 486, 'requiredEpochs': 2,
                'uniqueTrainingRowsProcessed': len({index for item in schedule[:completed] for index in item['indices']}),
                'completeTrainingCoverage': completed == 972} if full_learning else {}),
            "providerBillingStopped": False})



def prefer(args):
    """Bounded offline DPO against the frozen SFT start, TRAIN pairs only."""
    folder=args.bundle.resolve(strict=True);host_check(folder);manifest=verify_bundle(folder)
    if manifest.get('purpose')!='APPROVED_BROAD_CURRICULUM_20_USD_BOUNDED' or 'preference-pairs.jsonl' not in manifest['files']:
        raise ValueError('nuknuk_gpu_preference_bundle_required')
    if not 1<=args.pair_limit<=400 or not 30<=args.max_seconds<=3600 or not 0<args.learning_rate<=1e-5:
        raise ValueError('nuknuk_gpu_preference_bounds_invalid')
    if not args.adapter_sha256 or file_sha(args.adapter/'adapter_model.safetensors')!=args.adapter_sha256:
        raise ValueError('nuknuk_gpu_preference_adapter_pin_required')
    if args.output.exists() or folder==args.output.resolve() or folder in args.output.resolve().parents:
        raise ValueError('nuknuk_gpu_output_must_be_new_outside_bundle')
    args.output.mkdir(parents=True,mode=0o700)
    os.environ.setdefault('HF_HOME','/workspace/hf-cache')
    os.environ.update(HF_HUB_DISABLE_TELEMETRY='1',WANDB_DISABLED='true',TOKENIZERS_PARALLELISM='false')
    import torch,random
    started=time.monotonic()
    model,tokenizer,boundary=load_model(folder,args.layers,args.strategy,args.adapter)
    source=[json.loads(line) for line in (folder/'preference-pairs.jsonl').read_text().splitlines()]
    # Round-robin over the ten families rather than spend all steps on the first.
    groups={}
    for row in source:
        if row.get('sourceSplit')!='TRAIN' or not row['id'].startswith('r4-train-'):
            raise ValueError('nuknuk_gpu_preference_test_leakage')
        groups.setdefault(row['id'].split('-')[2],[]).append(row)
    if len(groups)!=10:raise ValueError('nuknuk_gpu_preference_balance_invalid')
    rows=[group[i] for i in range(40) for _,group in sorted(groups.items())][:args.pair_limit]
    encoded=[]
    def batch(item):
        ids,labels=item
        return {'input_ids':torch.tensor([ids],device='cuda'),'labels':torch.tensor([labels],device='cuda'),
                'attention_mask':torch.ones((1,len(ids)),device='cuda',dtype=torch.long)}
    def logp(item):
        count=sum(label!=-100 for label in item[1])
        return -model(**batch(item),use_cache=False).loss*count
    for row in rows:
        pair=[encode_row({'messages':row['prompt']+row[key]},tokenizer) for key in ('chosen','rejected')]
        if pair[0]==pair[1]:raise ValueError('nuknuk_gpu_preference_identical_pair')
        encoded.append(pair)
    model.eval();references=[]
    with torch.no_grad():
        for index,pair in enumerate(encoded):
            if time.monotonic()-started>args.max_seconds/2:raise ValueError('nuknuk_gpu_preference_reference_deadline')
            references.append([float(logp(item)) for item in pair])
            print(json.dumps({'referencePair':index+1,'elapsedSeconds':time.monotonic()-started}),flush=True)
    write_json(args.output/'reference-scores.json',{'adapterSha256':args.adapter_sha256,'pairIds':[r['id'] for r in rows],
        'scores':references,'weightsUpdated':False,'beta':0.1})
    write_json(args.output/'preflight.json',{**boundary,'mode':'DPO_TRAIN_ONLY','learningRate':args.learning_rate,
        'referenceAdapterSha256':args.adapter_sha256,'pairCount':len(rows),'beta':0.1,'productionActivation':False})
    optimizer=torch.optim.AdamW([p for p in model.parameters() if p.requires_grad],lr=args.learning_rate,weight_decay=0)
    model.train();completed=0;status='FAILED'
    with (args.output/'steps.jsonl').open('x') as log:
        for index,pair in enumerate(encoded):
            if time.monotonic()-started>args.max_seconds:
                status='TIME_BOUNDARY_CHECKPOINTED';break
            optimizer.zero_grad(set_to_none=True)
            chosen,rejected=[logp(item) for item in pair]
            margin=(chosen-rejected)-(references[index][0]-references[index][1])
            loss=-torch.nn.functional.logsigmoid(0.1*margin)
            if not torch.isfinite(loss):raise ValueError('nuknuk_gpu_preference_nonfinite_loss')
            loss.backward();torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad],1)
            optimizer.step();torch.cuda.synchronize();completed=index+1
            receipt={'pair':completed,'id':rows[index]['id'],'loss':float(loss.detach()),'elapsedSeconds':time.monotonic()-started,
                'peakCudaAllocatedGiB':torch.cuda.max_memory_allocated()/1024**3}
            log.write(json.dumps(receipt)+'\n');log.flush();print(json.dumps(receipt),flush=True)
            del chosen,rejected,margin,loss
            if completed%10==0:
                checkpoint=args.output/('pair-'+str(completed));model.save_pretrained(checkpoint,safe_serialization=True)
                write_json(checkpoint/'checkpoint-complete.json',{'completedPairs':completed,'adapterSha256':file_sha(checkpoint/'adapter_model.safetensors'),'strategy':args.strategy,'layers':args.layers})
    if completed==len(rows):status='PREFERENCE_TRAINING_FINISHED_REQUIRES_REVIEW'
    model.save_pretrained(args.output/'adapter',safe_serialization=True)
    write_json(args.output/'adapter'/'checkpoint-complete.json',{'completedPairs':completed,'adapterSha256':file_sha(args.output/'adapter'/'adapter_model.safetensors'),'strategy':args.strategy,'layers':args.layers})
    write_json(args.output/'result.json',{'status':status,'completedPairs':completed,'elapsedSeconds':time.monotonic()-started,
        'referenceAdapterUnchanged':file_sha(args.adapter/'adapter_model.safetensors')==args.adapter_sha256,'productionActivation':False,'providerBillingStopped':False})


BETA_CATALOG_PROFILE = 'PRODUCT_SEARCH_V7_BETA_CATALOG_V2'

def verify_product_gpu_bundle(folder):
    manifest = json.loads((folder/'product-gpu-manifest.json').read_text())
    if manifest.get('profile') == BETA_CATALOG_PROFILE:
        return verify_beta_catalog_bundle(folder, manifest)
    if (manifest.get('version') != 'backyrd.nuknuk-product-gpu-bundle@1'
        or manifest.get('profile') not in ('PRODUCT_SEARCH_V7_CONTINUATION_V1','PRODUCT_SEARCH_V7_BETA_CONTINUATION_V1','PRODUCT_SEARCH_V7_BETA_REMEDIATION_V2')
        or manifest.get('recipe',{}).get('testUploaded') is not False
        or manifest['recipe'].get('maxTotalTokens') not in (4608, 5120)
        or manifest['parent']['trainingBase'] != {'repo':'Qwen/Qwen3.6-35B-A3B','revision':'995ad96eacd98c81ed38be0c5b274b04031597b0'}):
        raise ValueError('product_gpu_bundle_invalid')
    allowed={'train.jsonl','valid.jsonl','seed/adapter_config.json','seed/adapter_model.safetensors',
        'tokenizer/tokenizer.json','tokenizer/tokenizer_config.json','tokenizer/chat_template.jinja',
        'nuknuk-gpu.py','nuknuk-runpod-watch.py','development-requests.json','native-prefixes.json','train.yaml'}
    if manifest['profile'] in ('PRODUCT_SEARCH_V7_BETA_CONTINUATION_V1','PRODUCT_SEARCH_V7_BETA_REMEDIATION_V2'):
        allowed.add('nuknuk_beta_callback.py')
        recipe=manifest['recipe'];remediation=manifest['profile']=='PRODUCT_SEARCH_V7_BETA_REMEDIATION_V2'
        if remediation:
            if (manifest.get('sourceManifestSha256')!='dc08575da70135f7af23d3e06193a730ba5004943f8f6d0253b8d2d6bf1d2e73' or manifest['parent']['hfAdapterSha256']!='2b620aa7fbec48946c3e8ce25182452f0e4e366bab8e9ea20f1ebb47d02ce271' or any(recipe.get(k)!=v for k,v in {'rank':16,'alpha':32,'epochs':1,'trainingRows':484,'validationRows':200,'optimizerUpdates':121,'maxTrainingSeconds':3900,'learningRate':0.000002,'seed':42}.items()) or manifest.get('budgetCeilingUsd')!=10 or not re.fullmatch('[a-f0-9]{64}',manifest.get('admissionReceiptSha256',''))):raise ValueError('product_remediation_recipe_invalid')
        elif (manifest.get('sourceManifestSha256')!='58caa68751ff2a779eaaebee519e14db3bf022cdd912302b629856fd65c464ee'
            or not re.fullmatch('[a-f0-9]{64}',manifest.get('admissionReceiptSha256',''))
            or any(recipe.get(k)!=v for k,v in {'rank':16,'alpha':32,'epochs':1,'trainingRows':800,'validationRows':200,'optimizerUpdates':200,'maxTrainingSeconds':5100,'learningRate':0.000006,'seed':42}.items())
            or manifest.get('budgetCeilingUsd')!=10):
            raise ValueError('product_beta_recipe_invalid')
    if set(manifest['files']) != allowed:
        raise ValueError('product_gpu_payload_not_allowlisted')
    for name,binding in manifest['files'].items():
        if file_sha(folder/name) != binding['sha256'] or (folder/name).stat().st_size != binding['bytes']:
            raise ValueError('product_gpu_payload_changed')
    if file_sha(folder/'seed/adapter_model.safetensors') != manifest['parent']['hfAdapterSha256']:
        raise ValueError('product_gpu_seed_changed')
    return manifest


def prepare_product_native(folder):
    """Exact token IDs and answer-only labels, before loading any model weights.

    Axolotl's documented pre-tokenized input avoids a second chat-template or
    label-mask interpretation. Historical chat-template training is unchanged.
    """
    from transformers import AutoTokenizer
    manifest=verify_product_gpu_bundle(folder)
    tokenizer=AutoTokenizer.from_pretrained(folder/'tokenizer',local_files_only=True,trust_remote_code=False)
    rows=json.loads((folder/'native-prefixes.json').read_text())
    report=[]
    if manifest.get('profile') == BETA_CATALOG_PROFILE and importlib.metadata.version('transformers') != '5.22.0':raise ValueError('beta_catalog_transformers_version_changed')
    for split,name,count in [('TRAIN','train',manifest['recipe']['trainingRows']),(('DEV' if manifest.get('profile') == BETA_CATALOG_PROFILE else 'VALIDATION'),'valid',manifest['recipe']['validationRows'])]:
        source=[json.loads(line) for line in (folder/(name+'.jsonl')).read_text().splitlines()]
        bindings=[row for row in rows if row['split']==split]
        if len(source)!=count or len(bindings)!=count:
            raise ValueError('product_native_inventory_changed')
        target=folder/(name+'-tokenized.jsonl')
        with target.open('x') as handle:
            for pair,binding in zip(source,bindings):
                messages=pair['messages']
                if [m['role'] for m in messages] != ['system','user','assistant']:
                    raise ValueError('product_native_roles_invalid')
                prefix=tokenizer.apply_chat_template(messages[:2],tokenize=True,add_generation_prompt=True,enable_thinking=False,return_dict=False)
                prefix_hash=hashlib.sha256(json.dumps(prefix,separators=(',',':')).encode()).hexdigest()
                if prefix_hash!=binding['prefixTokenIdsSha256']:
                    raise ValueError('product_native_prefix_parity_failed')
                answer=tokenizer.encode(messages[2]['content'],add_special_tokens=False)+[tokenizer.eos_token_id]
                if len(prefix)+len(answer)>manifest['recipe']['maxTotalTokens'] or len(answer)>2048 or len(answer)<2:
                    raise ValueError('product_native_would_truncate')
                ids=prefix+answer;labels=[-100]*len(prefix)+answer
                handle.write(json.dumps({'input_ids':ids,'attention_mask':[1]*len(ids),'labels':labels})+'\n')
                report.append({'id':binding['id'],'split':split,'prefixTokenIdsSha256':prefix_hash,'inputTokens':len(ids),'answerTokens':len(answer),'promptLabelsMasked':True,
                    'inputIdsSha256':json_digest(ids),'labelsSha256':json_digest(labels),'attentionMaskSha256':json_digest([1]*len(ids))})
    collator_verified=False
    if manifest.get('profile') == BETA_CATALOG_PROFILE:
        from transformers import DataCollatorForSeq2Seq
        collator=DataCollatorForSeq2Seq(tokenizer,model=None,label_pad_token_id=-100,pad_to_multiple_of=32,return_tensors='np')
        for name in ['train-tokenized.jsonl','valid-tokenized.jsonl']:
            for line in (folder/name).read_text().splitlines():
                row=json.loads(line);batch=collator([dict(row)])
                n=len(row['input_ids'])
                if batch['input_ids'][0,:n].tolist()!=row['input_ids'] or batch['labels'][0,:n].tolist()!=row['labels'] or any(v!=-100 for v in batch['labels'][0,n:].tolist()):raise ValueError('beta_catalog_hf_collator_labels_changed')
        collator_verified=True
    result={'hfCollatorVerified':collator_verified,'result':'PASS','datasetHash':manifest['datasetHash'],'rows':report,'testLabelsRead':False,'baseModelLoaded':False,
        'tokenizedFiles':{name:file_sha(folder/name) for name in ['train-tokenized.jsonl','valid-tokenized.jsonl']},
        'bundleManifestSha256':file_sha(folder/'product-gpu-manifest.json'),
        'preprocessingSourceSha256':file_sha(Path(__file__)), 'transformersVersion':importlib.metadata.version('transformers'),
        'trainerDataloaderVerified':False, 'stage':'BOUND_TRAINER_PREPROCESSING_BEFORE_WEIGHTS'}
    write_json(folder/'native-tokenization.json',result)
    return tokenizer


def product_base(folder):
    from huggingface_hub import snapshot_download
    manifest=verify_product_gpu_bundle(folder)
    base=folder.parent/'base'
    snapshot_download(repo_id=manifest['parent']['trainingBase']['repo'],revision=manifest['parent']['trainingBase']['revision'],
        local_dir=base,allow_patterns=['*.safetensors','*.json','*.jinja','*.txt'],max_workers=8)
    config=json.loads((base/'config.json').read_text())
    if config.get('model_type')!='qwen3_5_moe' or config['text_config']['num_hidden_layers']!=40:
        raise ValueError('product_base_architecture_changed')
    return base


def product_evaluate(args):
    if json.loads((args.bundle/'product-gpu-manifest.json').read_text()).get('profile') == BETA_CATALOG_PROFILE:
        return evaluate_beta_catalog(args)
    import torch
    import llguidance
    from llguidance.hf import from_tokenizer
    from transformers import AutoModelForImageTextToText,AutoTokenizer,BitsAndBytesConfig
    from peft import PeftModel
    folder=args.bundle.resolve(strict=True);manifest=verify_product_gpu_bundle(folder)
    if args.output.exists() or file_sha(args.adapter/'adapter_model.safetensors')!=args.adapter_sha256:
        raise ValueError('product_eval_output_or_adapter_invalid')
    if importlib.metadata.version('llguidance')!='1.9.1':
        raise ValueError('product_eval_grammar_version_invalid')
    args.output.mkdir(mode=0o700)
    base=product_base(folder)
    tokenizer=AutoTokenizer.from_pretrained(folder/'tokenizer',local_files_only=True,trust_remote_code=False)
    requests=json.loads((folder/'development-requests.json').read_text())['cases']
    if len(requests)!=15 or any(r['split']!='VALIDATION' or 'expected' in r or [m['role'] for m in r['messages']]!=['system','user'] for r in requests):
        raise ValueError('product_eval_target_free_requests_required')
    torch.cuda.set_per_process_memory_fraction(.92,0)
    model=AutoModelForImageTextToText.from_pretrained(base,local_files_only=True,trust_remote_code=False,use_safetensors=True,
        dtype=torch.bfloat16,device_map={'':0},attn_implementation='sdpa',
        quantization_config=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_use_double_quant=True,bnb_4bit_compute_dtype=torch.bfloat16))
    model=PeftModel.from_pretrained(model,args.adapter,is_trainable=False)
    model.requires_grad_(False);model.eval();model.config.use_cache=True
    state={'model':model,'tokenizer':tokenizer,'ll_tokenizer':from_tokenizer(tokenizer),'boundary':{'profile':manifest['profile'],'maxTotalTokens':manifest['recipe']['maxTotalTokens']}}
    compiler=llguidance.JsonCompiler(separators=(', ',': '),whitespace_pattern='')
    started=time.monotonic();records=[]
    for row in requests:
        if time.monotonic()-started>600:raise ValueError('product_eval_deadline')
        generated=generate_structured(state,row['messages'],compiler.compile(json.dumps(row['outputSchema'])),max_seconds=90)
        record={key:row[key] for key in ['id','task','promptHash','inputHash','schemaHash']};record.update(generated)
        write_json(args.output/(row['id']+'.json'),record);records.append(record)
        print(json.dumps({'id':row['id'],'status':generated['status'],'durationMs':generated.get('durationMs')}),flush=True)
    if file_sha(args.adapter/'adapter_model.safetensors')!=args.adapter_sha256:
        raise ValueError('product_eval_adapter_mutated')
    write_json(args.output/'result.json',{'status':'COMPLETED_REQUIRES_SEMANTIC_REVIEW','datasetHash':manifest['datasetHash'],
        'adapterSha256':args.adapter_sha256,'caseCount':len(records),'generatedCount':sum(r.get('raw') is not None for r in records),
        'testCalled':False,'trainingExecuted':False,'productionActivation':False})


def product_train(args):
    if json.loads((args.bundle/'product-gpu-manifest.json').read_text()).get('profile') == BETA_CATALOG_PROFILE:
        return train_beta_catalog(args)
    import signal
    folder=args.bundle.resolve(strict=True);manifest=verify_product_gpu_bundle(folder)
    beta=manifest['profile'] in ('PRODUCT_SEARCH_V7_BETA_CONTINUATION_V1','PRODUCT_SEARCH_V7_BETA_REMEDIATION_V2')
    seconds=manifest['recipe']['maxTrainingSeconds'] if beta else 1800
    if args.output.exists() or (folder.parent/'output').exists() or manifest['recipe']['maxTrainingSeconds']!=seconds or manifest['recipe']['epochs']!=(1 if beta else 2):
        raise ValueError('product_train_recipe_or_output_invalid')
    parent_evaluation=json.loads((folder.parent/'parent-development/result.json').read_text())
    if (parent_evaluation.get('datasetHash')!=manifest['datasetHash'] or parent_evaluation.get('caseCount')!=15
        or parent_evaluation.get('adapterSha256')!=manifest['parent']['hfAdapterSha256']):
        raise ValueError('product_train_parent_evaluation_required')
    cards=subprocess.check_output(['nvidia-smi','--query-gpu=memory.total','--format=csv,noheader,nounits'],text=True,timeout=10).strip().splitlines()
    if len(cards)!=1 or int(cards[0])<(79000 if beta else 90000):raise ValueError('product_train_gpu_memory_required')
    if not (folder/'native-tokenization.json').exists():prepare_product_native(folder)
    product_base(folder)
    args.output.mkdir(mode=0o700)
    process=None
    try:
        with (args.output/'train.log').open('x') as log:
            environment=os.environ.copy()
            if beta:
                native=json.loads((folder/'native-tokenization.json').read_text())
                if native.get('result')!='PASS' or native.get('datasetHash')!=manifest['datasetHash'] or len(native.get('rows',[]))!=manifest['recipe']['trainingRows']+manifest['recipe']['validationRows'] or any(file_sha(folder/name)!=value for name,value in native.get('tokenizedFiles',{}).items()) or set(native.get('tokenizedFiles',{}))!={'train-tokenized.jsonl','valid-tokenized.jsonl'}:raise ValueError('product_beta_native_parity_required')
                environment.update(PYTHONPATH=str(folder)+os.pathsep+environment.get('PYTHONPATH',''),BACKYRD_TRAINING_RECEIPTS=str(args.output.resolve()),BACKYRD_MAXIMUM_TRAIN_TOKENS=str(max(r['inputTokens']for r in native['rows']if r['split']=='TRAIN')),BACKYRD_TOTAL_UPDATES=str(manifest['recipe']['optimizerUpdates']),BACKYRD_MAX_TRAIN_SECONDS=str(seconds))
            process=subprocess.Popen(['axolotl','train',str(folder/'train.yaml')],stdout=log,stderr=subprocess.STDOUT,start_new_session=True,env=environment)
            status=process.wait(timeout=seconds)
        if status!=0:raise ValueError('product_train_subprocess_failed')
    finally:
        if process is not None and process.poll() is None:
            os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=15)
    if beta:
        progress=json.loads((args.output/'beta-progress.json').read_text())
        if progress.get('step')!=manifest['recipe']['optimizerUpdates'] or progress.get('status')!='COMPLETE':raise ValueError('product_beta_epoch_incomplete')
    adapter=folder.parent/'output'
    if not (adapter/'adapter_model.safetensors').is_file() or not (adapter/'adapter_config.json').is_file():
        raise ValueError('product_train_adapter_missing')
    write_json(args.output/'result.json',{'status':'TRAINED_REQUIRES_COMPARISON','datasetHash':manifest['datasetHash'],
        'parentAdapterSha256':manifest['parent']['hfAdapterSha256'],'adapterSha256':file_sha(adapter/'adapter_model.safetensors'),
        'model':manifest['parent']['trainingBase'],'trainingRows':manifest['recipe']['trainingRows'],'epochs':manifest['recipe']['epochs'],'sourceManifestSha256':manifest['sourceManifestSha256'],'completedOptimizerUpdates':manifest['recipe']['optimizerUpdates'] if beta else None,'testCalled':False,'productionActivation':False,
        'providerBillingStopped':False})


def transpose_product_candidate(arrays, parent_arrays, keys):
    """HF -> MLX LoRA orientation only; no model, quantization or scaling change."""
    import numpy as np
    result = {}
    expected_hf = set()
    for key in keys:
        hf_key = key.replace('language_model.model.layers.', 'base_model.model.model.language_model.layers.')
        for lower, upper in [('a', 'A'), ('b', 'B')]:
            mk, hk = key+'.lora_'+lower, hf_key+'.lora_'+upper+'.weight'
            expected_hf.add(hk)
            if (hk not in arrays or mk not in parent_arrays or arrays[hk].dtype != np.float32
                or arrays[hk].ndim != 2 or not np.isfinite(arrays[hk]).all()
                or arrays[hk].T.shape != parent_arrays[mk].shape):
                raise ValueError('product_candidate_projection_invalid')
            result[mk] = np.ascontiguousarray(arrays[hk].T)
            if not np.array_equal(result[mk].T, arrays[hk]):
                raise ValueError('product_candidate_transpose_not_exact')
    if set(arrays) != expected_hf or set(parent_arrays) != set(result) or len(result) != 80:
        raise ValueError('product_candidate_unexpected_tensors')
    return result


def convert_product_candidate(manifest_file, result_file, hf_folder, mlx_parent, output, expected_sha):
    """Prepare the completed Beta adapter for isolated native evaluation only."""
    from safetensors.numpy import load_file, save_file
    import shutil
    manifest = json.loads(manifest_file.read_text())
    result = json.loads(result_file.read_text())
    catalog = manifest.get('profile') == BETA_CATALOG_PROFILE
    remediation = manifest.get('cohort') == 'BETA_REMEDIATION_V2'
    if remediation and (manifest.get('counts',{}).get('TRAIN') != 484 or result.get('sourceManifestSha256') != file_sha(manifest_file)
        or manifest['parent']['hfAdapterSha256'] != '2b620aa7fbec48946c3e8ce25182452f0e4e366bab8e9ea20f1ebb47d02ce271'):
        raise ValueError('product_remediation_candidate_lineage_required')
    if catalog:
        verify_product_gpu_bundle(manifest_file.parent)
        if (result.get('sourceManifestSha256')!=file_sha(manifest_file) or result.get('status')!='TRAINED_REQUIRES_COMPARISON'
            or result.get('datasetHash')!=manifest['datasetHash'] or result.get('model')!=manifest['parent']['trainingBase']
            or result.get('parentAdapterSha256')!=manifest['parent']['hfAdapterSha256'] or result.get('epochs')!=1
            or result.get('completedOptimizerUpdates')!=manifest['recipe']['optimizerUpdates'] or result.get('trainingRows')!=manifest['recipe']['trainingRows']
            or result.get('adapterSha256')!=expected_sha or file_sha(hf_folder/'adapter_model.safetensors')!=expected_sha):raise ValueError('catalog_candidate_lineage_invalid')
    elif (not remediation and file_sha(manifest_file) != '58caa68751ff2a779eaaebee519e14db3bf022cdd912302b629856fd65c464ee'
        or manifest.get('cohort') not in ('BETA_V1','BETA_REMEDIATION_V2') or result.get('status') != 'TRAINED_REQUIRES_COMPARISON'
        or result.get('model') != manifest['parent']['trainingBase']
        or result.get('completedOptimizerUpdates') != (121 if remediation else 200)
        or result.get('epochs') != 1 or result.get('trainingRows') != (484 if remediation else 800)
        or result.get('datasetHash') != manifest.get('datasetHash')
        or result.get('parentAdapterSha256') != manifest['parent']['hfAdapterSha256']
        or result.get('adapterSha256') != expected_sha
        or file_sha(hf_folder/'adapter_model.safetensors') != expected_sha):
        raise ValueError('product_candidate_complete_lineage_required')
    parent = manifest['parent']
    if (file_sha(mlx_parent/'adapters.safetensors') != parent['mlxAdapterSha256']
        or file_sha(mlx_parent/'adapter_config.json') != parent['mlxAdapterConfigSha256']):
        raise ValueError('product_candidate_mlx_parent_changed')
    cfg = json.loads((mlx_parent/'adapter_config.json').read_text())
    hf_cfg = json.loads((hf_folder/'adapter_config.json').read_text())
    keys = [f'language_model.model.layers.{i}.self_attn.{p}_proj' for i in range(3,40,4) for p in ('k','o','q','v')]
    if (cfg.get('fine_tune_type') != 'lora' or cfg['lora_parameters']['rank'] != 16
        or cfg['lora_parameters']['scale'] != 2 or sorted(cfg['lora_parameters']['keys']) != sorted(keys)
        or hf_cfg.get('r') != 16 or hf_cfg.get('lora_alpha') != 32 or hf_cfg.get('lora_dropout') != 0
        or hf_cfg.get('fan_in_fan_out') or hf_cfg.get('use_dora') or hf_cfg.get('use_rslora')
        or hf_cfg.get('bias') != 'none' or set(hf_cfg.get('target_modules',[])) != {'k_proj','o_proj','q_proj','v_proj'}):
        raise ValueError('product_candidate_lora_architecture_changed')
    for p in [hf_folder/'adapter_model.safetensors', mlx_parent/'adapters.safetensors']:
        if p.stat().st_size > 128*1024*1024:raise ValueError('product_candidate_tensor_size')
    arrays = load_file(str(hf_folder/'adapter_model.safetensors'))
    converted = transpose_product_candidate(arrays,load_file(str(mlx_parent/'adapters.safetensors')),keys)
    output.mkdir(mode=0o700)
    save_file(converted,str(output/'adapters.safetensors'))
    shutil.copyfile(mlx_parent/'adapter_config.json',output/'adapter_config.json')
    reloaded = load_file(str(output/'adapters.safetensors'))
    import numpy as np
    if set(reloaded) != set(converted) or any(not np.array_equal(reloaded[k],converted[k]) for k in converted):
        raise ValueError('product_candidate_saved_tensor_mismatch')
    receipt = {'status':'EXACT_ADAPTER_TRANSPOSE_VERIFIED_NOT_BASE_NUMERICAL_PARITY',
        'hfAdapterSha256':expected_sha,'mlxAdapterSha256':file_sha(output/'adapters.safetensors'),
        'mlxConfigSha256':file_sha(output/'adapter_config.json'),'parentMlxSha256':parent['mlxAdapterSha256'],
        'datasetHash':manifest['datasetHash'],'model':parent['mlxBase'],'tensors':80,'rank':16,'scale':2,
        'exactRoundTrip':True,'modelLoaded':False,'activated':False}
    write_json(output/'conversion.json',receipt)
    print(json.dumps(receipt))


def verify_product_parent(bundle, mlx_folder, hf_folder, output):
    """Read adapter tensors only. No model, CUDA, Torch or service changes.

    Exact projection equality binds the HF continuation seed to the live MLX
    adapter. This is not numerical parity of differently quantized base models.
    """
    import struct
    import numpy as np
    manifest = json.loads((bundle / 'manifest.json').read_text())
    if manifest.get('version') not in ('backyrd.nuknuk-product-training-manifest@1','backyrd.nuknuk-beta-parent-binding@1'):
        raise ValueError('product_parent_manifest_invalid')
    parent = manifest['parent']
    if parent['mlxBase'] != {'repo':'mlx-community/Qwen3.6-35B-A3B-4bit','revision':'38740b847e4cb78f352aba30aa41c76e08e6eb46'} or parent['trainingBase'] != {'repo':'Qwen/Qwen3.6-35B-A3B','revision':'995ad96eacd98c81ed38be0c5b274b04031597b0'}:
        raise ValueError('product_parent_base_pin_invalid')
    for folder, filename, field in [(mlx_folder,'adapters.safetensors','mlxAdapterSha256'),(hf_folder,'adapter_model.safetensors','hfAdapterSha256'),
                                    (mlx_folder,'adapter_config.json','mlxAdapterConfigSha256'),(hf_folder,'adapter_config.json','hfAdapterConfigSha256')]:
        if file_sha(folder / filename) != parent[field]:
            raise ValueError('product_parent_file_changed')
    mlx_config = json.loads((mlx_folder / 'adapter_config.json').read_text())
    hf_config = json.loads((hf_folder / 'adapter_config.json').read_text())
    keys = [f'language_model.model.layers.{layer}.self_attn.{projection}_proj'
            for layer in range(3,40,4) for projection in ('k','o','q','v')]
    if (mlx_config.get('fine_tune_type') != 'lora' or mlx_config['lora_parameters']['rank'] != 16
        or mlx_config['lora_parameters']['scale'] != 2 or sorted(mlx_config['lora_parameters']['keys']) != sorted(keys)
        or hf_config.get('r') != 16 or hf_config.get('lora_alpha') != 32 or hf_config.get('fan_in_fan_out')
        or set(hf_config.get('target_modules',[])) != {'q_proj','k_proj','v_proj','o_proj'}):
        raise ValueError('product_parent_lora_architecture_changed')
    def tensors(path):
        if path.stat().st_size > 128 * 1024 * 1024:
            raise ValueError('product_parent_tensor_file_unbounded')
        data = path.read_bytes()
        size = struct.unpack('<Q',data[:8])[0]
        if size > 1024 * 1024 or len(data) > 128 * 1024 * 1024:
            raise ValueError('product_parent_tensor_file_unbounded')
        header = json.loads(data[8:8+size])
        result = {}
        for key, value in header.items():
            if key == '__metadata__':
                continue
            if value['dtype'] != 'F32' or len(value['shape']) != 2:
                raise ValueError('product_parent_tensor_format_invalid')
            start,end = value['data_offsets']
            if not 0 <= start < end <= len(data)-8-size or end-start != int(np.prod(value['shape']))*4:
                raise ValueError('product_parent_tensor_bounds_invalid')
            result[key] = np.frombuffer(data, dtype='<f4', count=(end-start)//4, offset=8+size+start).reshape(value['shape'])
        return result
    mlx_arrays = tensors(mlx_folder / 'adapters.safetensors')
    hf_arrays = tensors(hf_folder / 'adapter_model.safetensors')
    expected_mlx, expected_hf = set(), set()
    for key in keys:
        hf_key = key.replace('language_model.model.layers.','base_model.model.model.language_model.layers.')
        for lower, upper in [('a','A'),('b','B')]:
            mk, hk = key+'.lora_'+lower, hf_key+'.lora_'+upper+'.weight'
            expected_mlx.add(mk);expected_hf.add(hk)
            if (mk not in mlx_arrays or hk not in hf_arrays or not np.isfinite(mlx_arrays[mk]).all()
                or not np.isfinite(hf_arrays[hk]).all() or not np.array_equal(mlx_arrays[mk],hf_arrays[hk].T)):
                raise ValueError('product_parent_projection_mismatch')
    if set(mlx_arrays) != expected_mlx or set(hf_arrays) != expected_hf:
        raise ValueError('product_parent_unexpected_tensors')
    result = {'version':'backyrd.nuknuk-product-parent-verification@1','result':'PASS',
        'manifestSha256':file_sha(bundle/'manifest.json'),'parent':parent,'projections':len(keys),
        'tensors':len(expected_mlx),'exactTransposeEquality':True,'adapterScaleEquality':True,
        'baseModelLoaded':False,'nativeBaseNumericalParityVerified':False,'productionActivation':False}
    with output.open('x') as handle:
        json.dump(result,handle,indent=2)
    print(json.dumps({key:result[key] for key in ['result','projections','tensors','exactTransposeEquality','baseModelLoaded']}))
    return result



def verify_beta_catalog_bundle(folder, manifest):
    expected = {'train.jsonl','valid.jsonl','seed/adapter_config.json','seed/adapter_model.safetensors',
        'tokenizer/tokenizer.json','tokenizer/tokenizer_config.json','tokenizer/chat_template.jinja','tokenizer/config.json',
        'nuknuk-gpu.py','nuknuk-runpod-watch.py','nuknuk_beta_callback.py','development-requests.json',
        'native-prefixes.json','train.yaml','parent-binding.json','parent-verification.json','training-mixture.json','catalog-manifest.json'}
    if (manifest.get('version') != 'backyrd.nuknuk-product-gpu-bundle@1' or set(manifest.get('files',{})) != expected
        or manifest.get('budgetCeilingUsd') != 50 or manifest.get('closingReserveUsd') != 5
        or manifest.get('maximumOwnedGpuSeconds') is not None or manifest.get('limitPolicy')!='COST_ONLY_50_USD' or manifest.get('testLabelsUploaded') is not False
        or manifest.get('resourceCreationAuthorizedByBundle') is not False
        or manifest.get('image') != 'axolotlai/axolotl-cloud-uv@sha256:5a989be77ecfc9ef6f4e578d0addec4e6a6fb882b64abe0b84613666c58afe61'
        or manifest['parent']['trainingBase'] != {'repo':'Qwen/Qwen3.6-35B-A3B','revision':'995ad96eacd98c81ed38be0c5b274b04031597b0'}):
        raise ValueError('beta_catalog_bundle_contract_invalid')
    allowed=expected|{'product-gpu-manifest.json','train-tokenized.jsonl','valid-tokenized.jsonl','native-tokenization.json'}
    actual={str(path.relative_to(folder))for path in folder.rglob('*')if path.is_file()}
    if actual-allowed:raise ValueError('beta_catalog_unexpected_upload_payload')
    for name,binding in manifest['files'].items():
        if Path(name).is_absolute() or '..' in Path(name).parts or file_sha(folder/name) != binding['sha256'] or (folder/name).stat().st_size != binding['bytes']:
            raise ValueError('beta_catalog_bundle_file_changed')
    if file_sha(Path(__file__)) != manifest['files']['nuknuk-gpu.py']['sha256']:
        raise ValueError('beta_catalog_running_source_changed')
    source=json.loads((folder/'catalog-manifest.json').read_text());recipe=manifest['recipe']
    if (source['catalogHash']!=manifest['datasetHash'] or file_sha(folder/'catalog-manifest.json')!=manifest['sourceManifestSha256']
        or any(recipe.get(k)!=v for k,v in {'rank':16,'alpha':32,'epochs':1,'learningRate':0.000002,'seed':42,'trainingRows':source['counts']['TRAIN'],
            'validationRows':source['counts']['DEV'],'optimizerUpdates':source['counts']['TRAIN']//5,'gradientAccumulationSteps':5,'maxTotalTokens':5120,'maxAnswerTokens':2048,'maxTrainingSeconds':None,'testUploaded':False}.items())
        or not re.fullmatch('[a-f0-9]{64}',manifest.get('testRequestPacketSha256',''))):
        raise ValueError('beta_catalog_recipe_changed')
    for name,split in [('train','TRAIN'),('valid','DEV')]:
        if file_sha(folder/(name+'.jsonl'))!=source['files'][name+'.jsonl']:
            raise ValueError('beta_catalog_split_changed')
    parent=manifest['parent'];proof=json.loads((folder/'parent-verification.json').read_text());binding=json.loads((folder/'parent-binding.json').read_text())
    if (binding.get('parent')!=parent or proof.get('parent')!=parent or binding.get('catalogHash')!=manifest['datasetHash']
        or binding.get('datasetManifestSha256')!=manifest['sourceManifestSha256'] or source['counts']['TRAIN']%5!=0
        or any(file_sha(folder/'tokenizer'/name)!=digest for name,digest in parent['modelFiles'].items())):raise ValueError('beta_catalog_complete_parent_binding_required')
    if (proof.get('result')!='PASS' or not proof.get('exactTransposeEquality') or proof.get('baseModelLoaded') is not False
        or proof['manifestSha256']!=file_sha(folder/'parent-binding.json')
        or file_sha(folder/'seed/adapter_model.safetensors')!=parent['hfAdapterSha256']
        or file_sha(folder/'seed/adapter_config.json')!=parent['hfAdapterConfigSha256']):
        raise ValueError('beta_catalog_parent_binding_invalid')
    mixture=json.loads((folder/'training-mixture.json').read_text())
    if (mixture.get('catalogHash')!=manifest['datasetHash'] or mixture.get('stratumMass')!={'LEXICON':.05,'BLUEPRINT':.25,'COMPOSITION':.35,'DIALOGUE':.35}
        or len(mixture['cases'])!=recipe['trainingRows'] or abs(sum(r['lossWeight']for r in mixture['cases'])-recipe['trainingRows'])>1e-6):
        raise ValueError('beta_catalog_mixture_changed')
    rows=(folder/'train.jsonl').read_text().splitlines()
    if len(rows)!=len(mixture['rowHashes']) or any(hashlib.sha256(line.encode()).hexdigest()!=r['rowSha256'] for line,r in zip(rows,mixture['rowHashes'])):
        raise ValueError('beta_catalog_mixture_rows_changed')
    return manifest


def verify_beta_native(folder, manifest):
    receipt=json.loads((folder/'native-tokenization.json').read_text())
    if (receipt.get('result')!='PASS' or receipt.get('bundleManifestSha256')!=file_sha(folder/'product-gpu-manifest.json')
        or receipt.get('preprocessingSourceSha256')!=file_sha(Path(__file__))
        or receipt.get('datasetHash')!=manifest['datasetHash'] or receipt.get('transformersVersion')!='5.22.0'
        or receipt.get('hfCollatorVerified') is not True
        or len(receipt.get('rows',[]))!=manifest['recipe']['trainingRows']+manifest['recipe']['validationRows']
        or set(receipt.get('tokenizedFiles',{}))!={'train-tokenized.jsonl','valid-tokenized.jsonl'}
        or any(file_sha(folder/name)!=digest for name,digest in receipt['tokenizedFiles'].items())):
        raise ValueError('beta_catalog_actual_native_labels_required')
    return receipt


def catalog_provider_pod_id():
    """Bind exclusively to the provider-injected PID1 identity, never SSH ENV."""
    try:
        fields=Path('/proc/1/environ').read_bytes().split(b'\0')
        matches=[entry[len(b'RUNPOD_POD_ID='):].decode('ascii')for entry in fields if entry.startswith(b'RUNPOD_POD_ID=')]
    except (OSError,UnicodeDecodeError):raise ValueError('beta_catalog_provider_pid1_identity_unavailable')
    if len(matches)!=1 or not re.fullmatch('[a-z0-9]{8,30}',matches[0]):raise ValueError('beta_catalog_provider_pid1_identity_invalid')
    return matches[0]


def beta_execution_admission(folder, manifest, approval):
    import math
    if approval is None:raise ValueError('beta_catalog_explicit_execution_approval_required')
    value=json.loads(approval.read_text())
    if (value.get('bundleManifestSha256')!=file_sha(folder/'product-gpu-manifest.json')
        or value.get('parentAdapterSha256')!=manifest['parent']['hfAdapterSha256']
        or value.get('executionAuthorized') is not True or value.get('autoPay') is not False
        or value.get('ownedPods')!=1 or value.get('totalCeilingUsd')!=50 or value.get('reserveUsd')!=5):
        raise ValueError('beta_catalog_execution_admission_invalid')
    for key in ['startedEpoch','deadlineEpoch','observedSpentUsd','allInHourlyRateUsd','storageAllowanceUsd']:
        if isinstance(value.get(key),bool) or not isinstance(value.get(key),(int,float)) or not math.isfinite(value[key]):raise ValueError('beta_catalog_quote_invalid')
    if value['allInHourlyRateUsd']<=0 or min(value['observedSpentUsd'],value['storageAllowanceUsd'])<0:raise ValueError('beta_catalog_quote_invalid')
    available=50-value['observedSpentUsd']-value['storageAllowanceUsd']-5
    bound=value['startedEpoch']+available/value['allInHourlyRateUsd']*3600
    if available<=0 or value['startedEpoch']>time.time() or not time.time()<value['deadlineEpoch']<=bound:raise ValueError('beta_catalog_deadline_exceeded')
    heartbeat=json.loads(Path(value['watchdogHeartbeatPath']).read_text())
    if (heartbeat.get('podId')!=value.get('podId') or value.get('podId')!=catalog_provider_pod_id()
        or heartbeat.get('deadline')!=value['deadlineEpoch'] or not 0<=time.time()-heartbeat.get('heartbeat',0)<=90):
        raise ValueError('beta_catalog_provider_watchdog_not_armed')
    return value


def catalog_inference_contract(source):
    """Source identity of model loading and generation; excludes orchestration only."""
    import ast
    tree=ast.parse(source)
    names={'catalog_generation_budget','generate_structured_batch','generate_structured','product_base'}
    selected=[node for node in tree.body if isinstance(node,ast.FunctionDef)and node.name in names]
    evaluator=next(node for node in tree.body if isinstance(node,ast.FunctionDef)and node.name=='evaluate_beta_catalog')
    # Bind the actual load configuration and invocation, not hand-written claims.
    for node in ast.walk(evaluator):
        if isinstance(node,ast.Call)and isinstance(node.func,ast.Attribute)and node.func.attr in ('from_pretrained','set_per_process_memory_fraction','JsonCompiler'):
            selected.append(node)
        elif isinstance(node,ast.Call)and isinstance(node.func,ast.Name)and node.func.id=='generate_structured':selected.append(node)
        elif isinstance(node,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='state'for t in node.targets):selected.append(node)
    if len([n for n in selected if isinstance(n,ast.FunctionDef)])!=4:raise ValueError('beta_resume_generation_contract_missing')
    # ast.dump changed its empty-field defaults in Python3.13. Provider Python3.12
    # must produce the same fingerprint as the Mac; locations and empty optional
    # fields are deliberately excluded, while every nonempty semantic field stays.
    def canonical(node):
        if isinstance(node,ast.AST):
            return {'node':type(node).__name__,'fields':{key:canonical(value)for key,value in ast.iter_fields(node)if value is not None and not(isinstance(value,list)and not value)}}
        if isinstance(node,list):return [canonical(value)for value in node]
        return node
    payload=json.dumps(canonical(selected),sort_keys=True,separators=(',',':'),ensure_ascii=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def catalog_resume_records(path,manifest,packet_path,requests,adapter_sha256):
    if path is None:return {},None
    value=json.loads(path.read_text());binding=value.get('binding',{})
    expected={'datasetHash':manifest['datasetHash'],'adapterSha256':adapter_sha256,'requestPacketSha256':file_sha(packet_path),
        'inferenceContractSha256':catalog_inference_contract(Path(__file__).read_text()),'image':manifest['image'],
        'tokenizerFiles':manifest['parent']['modelFiles'],'split':'DEV'}
    mismatches=[k for k,v in expected.items()if binding.get(k)!=v]
    if binding.get('firstAttemptOnly')is not True:mismatches.append('firstAttemptOnly')
    if mismatches:raise ValueError('beta_resume_identity_changed:'+','.join(mismatches))
    if value.get('sourceSnapshotManifestSha256')is None or value.get('sourceBundleManifestSha256')is None:raise ValueError('beta_resume_provenance_required')
    if set(value.get('runtime',{}))!={'torch','transformers','peft','axolotl','tokenizers','llguidance'}or value.get('gpuName')!='NVIDIA H100 80GB HBM3':raise ValueError('beta_resume_runtime_binding_incomplete')
    rows={r['id']:r for r in requests};records=value.get('records',[])
    roster_hash=hashlib.sha256(json.dumps(sorted(r['id']for r in records),separators=(',',':')).encode()).hexdigest()
    if binding.get('caseIdsSha256')!=roster_hash:raise ValueError('beta_resume_case_ids_changed')
    component=value.get('sourceComponent','parent-development')
    if component not in ['parent-development','candidate-development']:raise ValueError('beta_resume_component_invalid')
    if component=='parent-development'and adapter_sha256!=manifest['parent']['hfAdapterSha256']:raise ValueError('beta_resume_parent_adapter_changed')
    source_text=value.get('sourceSnapshotManifestText','')
    if hashlib.sha256(source_text.encode()).hexdigest()!=value['sourceSnapshotManifestSha256']:raise ValueError('beta_resume_snapshot_manifest_changed')
    snapshot=json.loads(source_text)
    snapshot_cases={name[len(component+'/'):-5]:sha for name,sha in snapshot.items()if name.startswith(component+'/')and name.endswith('.json')and name not in (component+'/result.json',component+'/resume-receipt.json')}
    if set(snapshot_cases)!={r['id']for r in records}or binding.get('caseCount')!=len(records)or binding.get('failedFirstAttemptCount')!=sum(r.get('status')!='GENERATED_REQUIRES_SEMANTIC_REVIEW'for r in records):raise ValueError('beta_resume_snapshot_roster_changed')
    for record in records:
        original_bytes=(json.dumps(record,ensure_ascii=False,indent=2)+'\n').encode()
        if hashlib.sha256(original_bytes).hexdigest()!=snapshot_cases[record['id']]:raise ValueError('beta_resume_original_record_changed')
    for field,name in [('sourceRuntimeText','runtime.json'),('sourceSmokeText','framework-smoke/result.json')]:
        text=value.get(field,'')
        if hashlib.sha256(text.encode()).hexdigest()!=snapshot.get(name):raise ValueError('beta_resume_original_metadata_changed')
    if json.loads(value['sourceRuntimeText'])!=value['runtime']:raise ValueError('beta_resume_runtime_metadata_changed')
    smoke=json.loads(value['sourceSmokeText'])
    if smoke.get('status')!='PASS'or smoke.get('bundleManifestSha256')!=value['sourceBundleManifestSha256']:raise ValueError('beta_resume_source_bundle_unbound')
    if component=='candidate-development':
        text=value.get('sourceCandidateResultText','')
        if hashlib.sha256(text.encode()).hexdigest()!=snapshot.get('training-receipts/result.json')or snapshot.get('output/adapter_model.safetensors')!=adapter_sha256:raise ValueError('beta_resume_candidate_snapshot_not_bound')
        trained=json.loads(text)
        if (trained.get('status')!='TRAINED_REQUIRES_COMPARISON'or trained.get('sourceManifestSha256')!=value['sourceBundleManifestSha256']or trained.get('datasetHash')!=manifest['datasetHash']or trained.get('adapterSha256')!=adapter_sha256
            or trained.get('parentAdapterSha256')!=manifest['parent']['hfAdapterSha256']or trained.get('model')!=manifest['parent']['trainingBase']or trained.get('trainingRows')!=manifest['recipe']['trainingRows']or trained.get('completedOptimizerUpdates')!=manifest['recipe']['optimizerUpdates']or trained.get('epochs')!=1):raise ValueError('beta_resume_candidate_lineage_invalid')


    if len({r['id']for r in records})!=len(records):raise ValueError('beta_resume_duplicate_case')
    for record in records:
        row=rows.get(record.get('id'))
        if row is None or any(record.get(k)!=row[k]for k in ['id','task','promptHash','inputHash','schemaHash']):raise ValueError('beta_resume_request_changed')
        if record.get('attempt')!=1 or record.get('status')not in ('GENERATED_REQUIRES_SEMANTIC_REVIEW','FAILED','PROVIDER_ERROR'):raise ValueError('beta_resume_first_attempt_required')
        if record['status']=='GENERATED_REQUIRES_SEMANTIC_REVIEW' and (not isinstance(record.get('raw'),dict)or json.loads(record.get('rawText','null'))!=record['raw']):raise ValueError('beta_resume_output_changed')
    return {r['id']:r for r in records},value


def validate_beta_selection(selection, source_manifest, manifest, bundle_hash, adapter_hash):
    correction = source_manifest.get('catalogVariant') == 'understanding-correction-v1'
    diagnostic = (correction and selection.get('status') == 'CANDIDATE_FROZEN_FOR_DIAGNOSTIC_TEST'
        and selection.get('selectionPolicy') == 'ONE_PREREGISTERED_FINAL_CHECKPOINT'
        and selection.get('semanticQualityApproved') is False and selection.get('activationAuthorized') is False)
    if ((selection.get('status') != 'DEV_PASSED_FROZEN_SELECTION' and not diagnostic)
        or selection.get('datasetHash') != manifest['datasetHash'] or selection.get('bundleManifestSha256') != bundle_hash
        or adapter_hash not in [selection.get('parentAdapterSha256'), selection.get('candidateAdapterSha256')]
        or selection.get('testUsedForSelection') is not False):
        raise ValueError('beta_eval_selection_not_bound')


def evaluate_beta_catalog(args):
    folder=args.bundle.resolve(strict=True);manifest=verify_product_gpu_bundle(folder)
    split=args.split
    approval=beta_execution_admission(folder,manifest,args.execution_approval)
    if args.output.exists() or file_sha(args.adapter/'adapter_model.safetensors')!=args.adapter_sha256:raise ValueError('beta_eval_output_or_adapter_invalid')
    if split=='TEST':
        if args.requests is None or args.selection_receipt is None:raise ValueError('beta_eval_test_requires_frozen_selection')
        selection=json.loads(args.selection_receipt.read_text())
        source_manifest=json.loads((folder/'catalog-manifest.json').read_text())
        validate_beta_selection(selection, source_manifest, manifest, file_sha(folder/'product-gpu-manifest.json'), args.adapter_sha256)
        packet_path=args.requests
        if file_sha(packet_path)!=manifest['testRequestPacketSha256']:raise ValueError('beta_eval_test_packet_changed')
    else:
        packet_path=folder/'development-requests.json'
    packet=json.loads(packet_path.read_text());requests=packet['cases']
    source=json.loads((folder/'catalog-manifest.json').read_text())
    if (packet.get('targetIncluded') is not False or packet.get('split')!=split or len(requests)!=source['counts'][split]
        or len({r['id']for r in requests})!=len(requests)
        or any(r['split']!=split or 'expected'in r or 'finalMeaning'in r or [m['role']for m in r['messages']]!=['system','user']for r in requests)):
        raise ValueError('beta_eval_target_free_roster_required')
    cached,resume=catalog_resume_records(getattr(args,'resume',None),manifest,packet_path,requests,args.adapter_sha256)
    if resume is not None:
        allowed=(args.adapter_sha256==manifest['parent']['hfAdapterSha256']and resume.get('sourceComponent','parent-development')=='parent-development')or(approval.get('evaluationOnly')is True and approval.get('evaluationCandidateSha256')==args.adapter_sha256 and resume.get('sourceComponent')=='candidate-development')
        if split!='DEV'or not allowed:raise ValueError('beta_resume_parent_development_only')
        receipt_key='candidateResumeSha256'if resume.get('sourceComponent')=='candidate-development'else'parentResumeSha256'
        if file_sha(args.resume)!=approval.get(receipt_key):raise ValueError('beta_resume_execution_receipt_not_bound')
    verify_beta_framework_smoke(folder)
    # All configuration/identity gates above run before model loading or downloads.
    import torch
    import llguidance
    from llguidance.hf import from_tokenizer
    from transformers import AutoModelForImageTextToText,AutoTokenizer,BitsAndBytesConfig
    from peft import PeftModel
    if importlib.metadata.version('llguidance')!='1.9.1' or importlib.metadata.version('transformers')!='5.22.0':raise ValueError('beta_eval_runtime_changed')
    if resume is not None:
        runtime={name:importlib.metadata.version(name)for name in resume['runtime']}
        if runtime!=resume['runtime']:raise ValueError('beta_resume_runtime_changed')
        gpu_name=subprocess.check_output(['nvidia-smi','--query-gpu=name','--format=csv,noheader'],text=True,timeout=10).strip()
        if gpu_name!=resume['gpuName']:raise ValueError('beta_resume_gpu_changed')
    args.output.mkdir(mode=0o700)
    if resume is not None:write_json(args.output/'resume-receipt.json',{'resumePacketSha256':file_sha(args.resume),'sourceBundleManifestSha256':resume['sourceBundleManifestSha256'],'sourceSnapshotManifestSha256':resume['sourceSnapshotManifestSha256'],'reusedCases':len(cached),'failedFirstAttemptsRetained':sum(r['status']!='GENERATED_REQUIRES_SEMANTIC_REVIEW'for r in cached.values())})
    base=product_base(folder);tokenizer=AutoTokenizer.from_pretrained(folder/'tokenizer',local_files_only=True,trust_remote_code=False)
    torch.cuda.set_per_process_memory_fraction(.90,0)
    model=AutoModelForImageTextToText.from_pretrained(base,local_files_only=True,trust_remote_code=False,use_safetensors=True,dtype=torch.bfloat16,device_map={'':0},attn_implementation='sdpa',quantization_config=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_use_double_quant=True,bnb_4bit_compute_dtype=torch.bfloat16))
    model=PeftModel.from_pretrained(model,args.adapter,is_trainable=False);model.requires_grad_(False);model.eval();model.config.use_cache=True
    state={'model':model,'tokenizer':tokenizer,'ll_tokenizer':from_tokenizer(tokenizer),'boundary':{'profile':BETA_CATALOG_PROFILE,'maxTotalTokens':5120}}
    compiler=llguidance.JsonCompiler(separators=(', ',': '),whitespace_pattern='');records=[]
    for row in requests:
        beta_execution_admission(folder,manifest,args.execution_approval)
        if row['id']in cached:
            record=cached[row['id']];write_json(args.output/(row['id']+'.json'),record);records.append(record);continue
        try:generated=generate_structured(state,row['messages'],compiler.compile(json.dumps(row['outputSchema'])),max_seconds=90,max_output_tokens=2048)
        except Exception as error:generated={'status':'PROVIDER_ERROR','errorType':type(error).__name__,'raw':None}
        record={k:row[k]for k in ['id','task','promptHash','inputHash','schemaHash']};record.update(generated,attempt=1)
        write_json(args.output/(row['id']+'.json'),record);records.append(record)
    if file_sha(args.adapter/'adapter_model.safetensors')!=args.adapter_sha256:raise ValueError('beta_eval_adapter_mutated')
    write_json(args.output/'result.json',{'version':'backyrd.nuknuk-beta-inference-results@1','datasetHash':manifest['datasetHash'],'bundleManifestSha256':file_sha(folder/'product-gpu-manifest.json'),'adapterSha256':args.adapter_sha256,'split':split,'requestPacketSha256':file_sha(packet_path),'caseCount':len(records),'cases':records,'reusedCases':len(cached),'firstAttemptOnly':True,'trainingExecuted':False,'modelEvaluated':True,'productionActivation':False})


def beta_framework_smoke(args):
    """Pinned-image CPU integration: toy scalar autograd only; no NukNuk weights."""
    folder=args.bundle.resolve(strict=True);manifest=verify_product_gpu_bundle(folder)
    beta_execution_admission(folder,manifest,args.execution_approval);native=verify_beta_native(folder,manifest)
    if args.output.resolve()!=folder.parent/'framework-smoke' or args.output.exists():raise ValueError('beta_smoke_canonical_new_output_required')
    versions={name:importlib.metadata.version(name)for name in ['transformers','axolotl','peft','tokenizers','llguidance']}
    if versions!={'transformers':'5.22.0','axolotl':'0.21.2.dev0','peft':'0.21.2','tokenizers':'0.23.3','llguidance':'1.9.1'}:raise ValueError('beta_smoke_runtime_versions_changed')
    import torch
    from transformers import AutoTokenizer,Trainer,TrainingArguments
    from axolotl.integrations.base import PluginManager
    from axolotl.utils.dict import DictDefault
    sys.path.insert(0,str(folder))
    args.output.mkdir(mode=0o700)
    os.environ.update(BACKYRD_CATALOG_BUNDLE=str(folder),BACKYRD_EXECUTION_APPROVAL=str(args.execution_approval.resolve()),BACKYRD_TRAINING_RECEIPTS=str(args.output.resolve()))
    tokenizer=AutoTokenizer.from_pretrained(folder/'tokenizer',local_files_only=True,trust_remote_code=False)
    if tokenizer.padding_side!='right':raise ValueError('beta_smoke_right_padding_required')
    manager=PluginManager.get_instance();manager.register('nuknuk_beta_callback.BetaPlugin')
    if 'nuknuk_beta_callback.BetaPlugin'not in manager.plugins:raise ValueError('beta_smoke_plugin_load_failed')
    cfg=DictDefault({'sample_packing':False});cls,options=manager.get_collator_cls_and_kwargs(cfg,is_eval=False)
    collator=cls(tokenizer=tokenizer,**options)
    dataset=[json.loads(line)for line in (folder/'train-tokenized.jsonl').read_text().splitlines()]
    class ToyScalar(torch.nn.Module):
        def __init__(self):super().__init__();self.scalar=torch.nn.Parameter(torch.tensor(1.,dtype=torch.float64))
        def forward(self,input_ids=None,attention_mask=None,labels=None):return {'loss':self.scalar*labels[labels!=-100].double().mean()}
    model=ToyScalar()
    config=TrainingArguments(output_dir=str(args.output/'unused-toy-output'),use_cpu=True,report_to=[],per_device_train_batch_size=1,gradient_accumulation_steps=5,num_train_epochs=1,dataloader_drop_last=False,dataloader_num_workers=0,remove_unused_columns=False)
    trainer=Trainer(model=model,args=config,train_dataset=dataset,data_collator=collator)
    manager.post_trainer_create(cfg,trainer)
    if not getattr(trainer,'backyrd_objective_installed',False):raise ValueError('beta_smoke_hook_not_installed')
    from nuknuk_beta_callback import batch_weight
    mix=json.loads((folder/'training-mixture.json').read_text());weights={r['id']:r['lossWeight']for r in mix['cases']}
    by_id={r['id']:r for r in native['rows']if r['split']=='TRAIN'};groups={}
    for row in by_id.values():groups.setdefault(row['inputIdsSha256'],[]).append(row)
    bindings={key:{'labelsSha256':items[0]['labelsSha256'],'weight':sum(weights[r['id']]for r in items)/len(items)}for key,items in groups.items()}
    trainer.current_gradient_accumulation_steps=5;count=0
    for row in dataset:
        beta_execution_admission(folder,manifest,args.execution_approval)
        batch=collator([dict(row)]);weight=batch_weight(batch,bindings)
        expected=float(batch['labels'][batch['labels']!=-100].double().mean())*weight/5
        model.zero_grad(set_to_none=True);trainer.training_step(model,batch,num_items_in_batch=None)
        actual=float(model.scalar.grad)
        if not math.isclose(actual,expected,rel_tol=1e-6,abs_tol=1e-6):raise ValueError('beta_smoke_actual_gradient_scaling_changed')
        count+=1
    if count!=manifest['recipe']['trainingRows'] or count%5:raise ValueError('beta_smoke_full_inventory_required')
    write_json(args.output/'result.json',{'status':'PASS','bundleManifestSha256':file_sha(folder/'product-gpu-manifest.json'),'nativeReceiptSha256':file_sha(folder/'native-tokenization.json'),'trainerInputsReceiptSha256':file_sha(args.output/'actual-trainer-inputs.json'),'runtime':versions,'providerPodId':catalog_provider_pod_id(),'providerIdentitySource':'PID1_CONTAINER_ENVIRONMENT','fullAxolotlCliVerified':False,'ociImageIdentityVerified':False,'pluginManagerUsed':True,'actualTrainerUsed':True,'toyScalarGradientChecks':count,'gradientAccumulationSteps':5,'partialWindows':0,'nuknukModelLoaded':False,'nuknukTrainingExecuted':False,'activationAuthorized':False})


def verify_beta_framework_smoke(folder):
    expected_rows=verify_product_gpu_bundle(folder)['recipe']['trainingRows']
    receipt=json.loads((folder.parent/'framework-smoke/result.json').read_text())
    if (receipt.get('status')!='PASS' or receipt.get('bundleManifestSha256')!=file_sha(folder/'product-gpu-manifest.json')
        or receipt.get('nativeReceiptSha256')!=file_sha(folder/'native-tokenization.json') or receipt.get('toyScalarGradientChecks')!=expected_rows
        or receipt.get('actualTrainerUsed') is not True or receipt.get('pluginManagerUsed') is not True or receipt.get('partialWindows')!=0
        or receipt.get('gradientAccumulationSteps')!=5 or receipt.get('runtime')!={'transformers':'5.22.0','axolotl':'0.21.2.dev0','peft':'0.21.2','tokenizers':'0.23.3','llguidance':'1.9.1'}
        or any(receipt.get(key) is not False for key in ['nuknukModelLoaded','nuknukTrainingExecuted','activationAuthorized','fullAxolotlCliVerified','ociImageIdentityVerified'])
        or receipt.get('trainerInputsReceiptSha256')!=file_sha(folder.parent/'framework-smoke/actual-trainer-inputs.json')):raise ValueError('beta_actual_framework_smoke_required_before_weights')
    inputs=json.loads((folder.parent/'framework-smoke/actual-trainer-inputs.json').read_text())
    if (inputs.get('result')!='PASS' or inputs.get('checkedRows')!=expected_rows or inputs.get('actualTrainerDatasetVerified') is not True
        or inputs.get('trainerCollatorVerified') is not True or inputs.get('actualTrainerDataloaderVerified') is not False
        or inputs.get('gradientAccumulationSteps')!=5 or inputs.get('partialAccumulationWindows')!=0):raise ValueError('beta_smoke_actual_trainer_inputs_required')
    return receipt


def train_beta_catalog(args):
    import signal
    folder=args.bundle.resolve(strict=True);manifest=verify_product_gpu_bundle(folder)
    admission=beta_execution_admission(folder,manifest,args.execution_approval)
    if admission.get('evaluationOnly')is True:raise ValueError('beta_evaluation_only_training_forbidden')
    native=verify_beta_native(folder,manifest)
    if str(folder) != '/workspace/backyrd-product-training/job':raise ValueError('beta_catalog_canonical_job_path_required')
    verify_beta_framework_smoke(folder)
    baseline=json.loads((folder.parent/'parent-development/result.json').read_text())
    if (baseline.get('datasetHash')!=manifest['datasetHash'] or baseline.get('adapterSha256')!=manifest['parent']['hfAdapterSha256']
        or baseline.get('caseCount')!=manifest['recipe']['validationRows'] or baseline.get('split')!='DEV' or baseline.get('modelEvaluated') is not True):raise ValueError('beta_catalog_full_parent_baseline_required')
    if args.output.exists() or (folder.parent/'output').exists():raise ValueError('beta_catalog_new_output_required')
    cards=subprocess.check_output(['nvidia-smi','--query-gpu=memory.total','--format=csv,noheader,nounits'],text=True,timeout=10).strip().splitlines()
    if len(cards)!=1 or int(cards[0])<79000:raise ValueError('beta_catalog_one_sufficient_gpu_required')
    product_base(folder);args.output.mkdir(mode=0o700)
    seconds=int(admission['deadlineEpoch']-time.time())
    if seconds<=0:raise ValueError('beta_catalog_insufficient_remaining_budget')
    environment=os.environ.copy();environment.update(PYTHONDONTWRITEBYTECODE='1',PYTHONPATH=str(folder)+os.pathsep+environment.get('PYTHONPATH',''),BACKYRD_TRAINING_RECEIPTS=str(args.output.resolve()),BACKYRD_CATALOG_BUNDLE=str(folder),BACKYRD_EXECUTION_APPROVAL=str(args.execution_approval.resolve()),BACKYRD_TOTAL_UPDATES=str(manifest['recipe']['optimizerUpdates']),BACKYRD_MAX_TRAIN_SECONDS=str(seconds),BACKYRD_MAXIMUM_TRAIN_TOKENS=str(max(r['inputTokens']for r in native['rows']if r['split']=='TRAIN')))
    process=None
    try:
        with (args.output/'train.log').open('x')as log:
            process=subprocess.Popen(['axolotl','train',str(folder/'train.yaml')],stdout=log,stderr=subprocess.STDOUT,start_new_session=True,env=environment)
            status=process.wait(timeout=seconds)
        if status!=0:raise ValueError('beta_catalog_trainer_failed')
    finally:
        if process is not None and process.poll() is None:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=15)
    progress=json.loads((args.output/'beta-progress.json').read_text())
    if progress.get('status')!='COMPLETE' or progress.get('step')!=manifest['recipe']['optimizerUpdates']:raise ValueError('beta_catalog_incomplete_epoch')
    adapter=folder.parent/'output'
    write_json(args.output/'result.json',{'status':'TRAINED_REQUIRES_COMPARISON','datasetHash':manifest['datasetHash'],'sourceManifestSha256':file_sha(folder/'product-gpu-manifest.json'),'parentAdapterSha256':manifest['parent']['hfAdapterSha256'],'adapterSha256':file_sha(adapter/'adapter_model.safetensors'),'model':manifest['parent']['trainingBase'],'trainingRows':manifest['recipe']['trainingRows'],'epochs':1,'completedOptimizerUpdates':progress['step'],'testCalled':False,'providerBillingStopped':False,'productionActivation':False})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    convert = sub.add_parser("convert")
    convert.add_argument("--source", type=Path, required=True)
    convert.add_argument("--output", type=Path, required=True)
    candidate_convert = sub.add_parser('convert-product-candidate')
    for name in ['manifest','result','source','mlx-parent','output']:
        candidate_convert.add_argument('--'+name,type=Path,required=True)
    candidate_convert.add_argument('--expected-sha256',required=True)
    parent_check = sub.add_parser('verify-product-parent')
    parent_check.add_argument('--bundle',type=Path,required=True)
    parent_check.add_argument('--source',type=Path,required=True)
    parent_check.add_argument('--adapter',type=Path,required=True)
    parent_check.add_argument('--output',type=Path,required=True)
    for product_command in ['product-evaluate','product-train','product-prepare','product-smoke']:
        product_parser=sub.add_parser(product_command)
        product_parser.add_argument('--bundle',type=Path,required=True)
        if product_command!='product-prepare':product_parser.add_argument('--output',type=Path,required=True)
        if product_command in ('product-train','product-evaluate','product-smoke'):
            product_parser.add_argument('--execution-approval',type=Path)
        if product_command=='product-evaluate':
            product_parser.add_argument('--split',choices=['DEV','TEST'],default='DEV')
            product_parser.add_argument('--requests',type=Path)
            product_parser.add_argument('--resume',type=Path)
            product_parser.add_argument('--selection-receipt',type=Path)
            product_parser.add_argument('--adapter',type=Path,required=True)
            product_parser.add_argument('--adapter-sha256',required=True)
    for command in ("check", "train", "evaluate", "prefer"):
        cmd = sub.add_parser(command); cmd.add_argument("--bundle", type=Path, required=True)
        if command in ("train", "evaluate", "prefer"):
            cmd.add_argument("--output", type=Path, required=True)
        if command in ('train', 'evaluate'):
            cmd.add_argument('--recipe', choices=[V7_RECIPE, V7_FULL_RECIPE])
            cmd.add_argument('--initialization', choices=['legacy-seed', 'fresh', 'adapter'], default='legacy-seed')
        if command == "prefer":
            cmd.add_argument("--adapter", type=Path, required=True)
            cmd.add_argument("--adapter-sha256", required=True)
            cmd.add_argument("--pair-limit", type=int, default=40)
            cmd.add_argument("--learning-rate", type=float, default=1e-6)
            cmd.add_argument("--max-seconds", type=int, default=1800)
            cmd.add_argument("--layers", type=int, choices=[1,4,16], default=4)
            cmd.add_argument("--strategy", choices=["qv", "language-linear"], default="language-linear")
        if command == "evaluate":
            cmd.add_argument("--plan-file")
            cmd.add_argument("--split", choices=["VALIDATION", "TEST"], default="VALIDATION")
            cmd.add_argument("--one-per-group", action="store_true")
            cmd.add_argument("--batch-size", type=int, choices=[1,2,4], default=1)
            cmd.add_argument("--adapter", type=Path)
            cmd.add_argument("--adapter-sha256")
            cmd.add_argument("--layers", type=int, choices=[1,4,16], default=1)
            cmd.add_argument("--strategy", choices=["qv", "language-linear"], default="qv")
            cmd.add_argument("--max-seconds", type=int, default=3000)
            cmd.add_argument('--frozen-selection', type=Path)
        if command == "train":
            cmd.add_argument("--adapter", type=Path)
            cmd.add_argument("--adapter-sha256")
            cmd.add_argument("--steps", type=int, default=2)
            cmd.add_argument("--layers", type=int, choices=[1, 4, 16], default=1)
            cmd.add_argument("--strategy", choices=["qv", "language-linear"], default="qv")
            cmd.add_argument("--learning-rate", type=float, default=1e-5)
            cmd.add_argument("--max-seconds", type=int, default=3000)
            cmd.add_argument("--checkpoint-every", type=int, default=10)
            cmd.add_argument("--completion-head", action="store_true")
            cmd.add_argument("--batch-size", type=int, choices=[1,2,4], default=1)
    args = parser.parse_args()
    if args.command == 'convert-product-candidate':
        convert_product_candidate(args.manifest,args.result,args.source,args.mlx_parent,args.output,args.expected_sha256)
    elif args.command == 'product-evaluate':
        product_evaluate(args)
    elif args.command == 'product-train':
        product_train(args)
    elif args.command == 'product-smoke':
        beta_framework_smoke(args)
    elif args.command == 'product-prepare':
        prepare_product_native(args.bundle.resolve(strict=True))
    elif args.command == 'verify-product-parent':
        verify_product_parent(args.bundle,args.source,args.adapter,args.output)
    elif args.command == "convert":
        convert_seed(args.source, args.output)
    elif args.command == "prefer":
        prefer(args)
    elif args.command == "evaluate":
        evaluate(args)
    else:
        run(args)
