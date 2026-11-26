"""Bound native learning mode of nuknuk-train.py. No cloud or activation.

The existing resource supervisor owns the worker; the existing Mac restoration
code owns recovery. All training labels and evaluation inputs are frozen before
maintenance. A successful optimizer run still requires semantic review.
"""
import argparse
from contextlib import contextmanager
import gc
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import select
import shutil
import signal
import struct
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024**2), b''):
            h.update(block)
    return h.hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    with Path(path).open('x') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def module(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def verify_plan(path, digest):
    if sha(path) != digest:
        raise ValueError('native_plan_changed')
    plan = read(path)
    if (plan.get('kind') not in ['NATIVE_MLX_LEARNING_PILOT_V1', 'NATIVE_MLX_MODEL_CHOICE_9B_V1']
            or plan.get('cloudAllowed') is not False
            or plan.get('productionActivation') is not False
            or plan.get('maxTotalTokens') != 5120
            or plan.get('liveAdapterSha256') != module('nuknuk-mac-comparison').LIVE_SHA):
        raise ValueError('native_plan_invalid')
    if plan.get('recipes') != {'A': {'steps': 80, 'learningRate': 2e-6},
                               'B': {'steps': 80, 'learningRate': 1e-5}}:
        raise ValueError('native_two_fixed_recipes_required')
    for binding in plan['files'].values():
        if sha(binding['path']) != binding['sha256']:
            raise ValueError('native_bound_input_changed:' + Path(binding['path']).name)
    initial_sha = plan.get('initialAdapterSha256', plan['liveAdapterSha256'])
    initial_config_sha = plan.get('initialAdapterConfigSha256', plan['liveAdapterConfigSha256'])
    if (sha(Path(plan['adapter']) / 'adapters.safetensors') != initial_sha
            or sha(Path(plan['adapter']) / 'adapter_config.json') != initial_config_sha):
        raise ValueError('native_initial_adapter_is_not_live')
    if plan['kind'] == 'NATIVE_MLX_LEARNING_PILOT_V1':
        if initial_sha != plan['liveAdapterSha256'] or initial_config_sha != plan['liveAdapterConfigSha256']:
            raise ValueError('native_live_initial_identity_changed')
    else:
        verify_model_choice_seed(plan)
    payload = read(plan['files']['payload']['path'])
    train, dev, evaluation = payload['train'], payload['dev'], payload['evaluation']
    if len(train) != 40 or len(dev) != 24 or len(evaluation) != 36:
        raise ValueError('native_pilot_roster_invalid')
    if (len({r['id'] for r in train + dev}) != 64
            or {r['family'] for r in train} & {r['family'] for r in dev}
            or {r['scenarioGroup'] for r in train} & {r['scenarioGroup'] for r in dev}
            or len({r['id'] for r in evaluation}) != 36
            or {r['id'] for r in evaluation} != {r['id'] for r in dev + train[:12]}):
        raise ValueError('native_pilot_split_leakage')
    if evaluation != dev + train[:12] and evaluation != train[:12] + dev:
        raise ValueError('native_evaluation_inputs_changed')
    for row in train + dev:
        if ([m['role'] for m in row['messages']] != ['system', 'user']
                or not row.get('target') or not row.get('outputSchema')):
            raise ValueError('native_pilot_row_invalid')
    return plan, payload


def verify_model_choice_seed(plan):
    """One explicitly selected local 9B base; never transfer the 35B adapter."""
    if Path(plan['model']).resolve().name != '8b2b98c00a6b4d291155e4890773ca8f769aee53':
        raise ValueError('native_model_choice_base_not_selected_9b')
    config = read(Path(plan['model']) / 'config.json')
    text = config['text_config']
    if (text['hidden_size'] != 4096 or text['num_hidden_layers'] != 32
            or config['quantization'] != {'group_size': 64, 'bits': 4, 'mode': 'affine'}):
        raise ValueError('native_model_choice_architecture_changed')
    keys = sorted(f'language_model.model.layers.{i}.self_attn.{p}_proj'
                  for i in range(3, 32, 4) for p in ['q', 'k', 'v', 'o'])
    metadata = read(Path(plan['adapter']) / 'adapter_config.json')
    if (metadata.get('fine_tune_type') != 'lora' or metadata.get('num_layers') != -1
            or metadata.get('lora_parameters') != {'rank': 16, 'scale': 2.0, 'dropout': 0.0, 'keys': keys}):
        raise ValueError('native_model_choice_lora_configuration_changed')
    data = (Path(plan['adapter']) / 'adapters.safetensors').read_bytes()
    size = struct.unpack('<Q', data[:8])[0]
    if not 0 < size < 1024**2:
        raise ValueError('native_model_choice_seed_header_invalid')
    header = json.loads(data[8:8 + size])
    header.pop('__metadata__', None)
    if set(header) != {k + suffix for k in keys for suffix in ['.lora_a', '.lora_b']}:
        raise ValueError('native_model_choice_seed_keys_invalid')
    for key, entry in header.items():
        start, end = entry['data_offsets']
        projection = key.split('.')[-2]
        output = {'q_proj': 8192, 'k_proj': 1024, 'v_proj': 1024, 'o_proj': 4096}[projection]
        shape = [4096, 16] if key.endswith('.lora_a') else [16, output]
        if (entry['dtype'] != 'F32' or entry['shape'] != shape or end - start != math.prod(shape) * 4
                or not 0 <= start < end <= len(data) - 8 - size):
            raise ValueError('native_model_choice_seed_shape_invalid')
        raw = data[8 + size + start:8 + size + end]
        if len(raw) != end - start or key.endswith('.lora_b') and any(raw):
            raise ValueError('native_model_choice_seed_not_zero_delta')
        if key.endswith('.lora_a') and any(not math.isfinite(v[0]) for v in struct.iter_unpack('<f', raw)):
            raise ValueError('native_model_choice_seed_nonfinite')
    spans = sorted(entry['data_offsets'] for entry in header.values())
    if spans[0][0] != 0 or spans[-1][1] != len(data) - 8 - size or any(a[1] != b[0] for a, b in zip(spans, spans[1:])):
        raise ValueError('native_model_choice_seed_offsets_invalid')
    previous = read(plan['files']['previous-memory-failure']['path'])
    if (previous.get('stopReason') != 'MODEL_GROUP_PHYSICAL_FOOTPRINT_OVER_28_GIB'
            or previous.get('candidateProduced') is not False
            or previous.get('originalRestored') != 'HEALTHY_ORIGINAL_RESTORED'):
        raise ValueError('native_model_choice_previous_run_not_closed')
    if plan.get('liveModel') != read(plan['files']['previous-live-session']['path'])['live']['model']:
        raise ValueError('native_model_choice_restore_identity_changed')


def encode_row(tokenizer, row):
    prefix = tokenizer.apply_chat_template(row['messages'], tokenize=True,
        add_generation_prompt=True, enable_thinking=False, return_dict=False)
    target = tokenizer.encode(row['target'], add_special_tokens=False) + [tokenizer.eos_token_id]
    if not prefix or not target or len(prefix) + len(target) > 5120:
        raise ValueError('native_training_would_truncate')
    return prefix, target


def response_positions(prefix_length, target_length):
    if prefix_length < 1 or target_length < 1:
        raise ValueError('native_loss_alignment_invalid')
    return prefix_length - 1, prefix_length + target_length - 1


def answer_only_loss(network, ids, labels, start, stop):
    """Keep production position handling, project only completion positions."""
    import mlx.core as mx
    import mlx.nn as nn
    hidden = network.language_model(ids, cache=None, return_hidden=True, skip_logits=True).hidden_states[-1]
    logits = network.language_model.lm_head(hidden[:, start:stop, :])
    return nn.losses.cross_entropy(logits.astype(mx.float32), labels, reduction='mean')


@contextmanager
def generation_prefix_observer(model, expected, actual):
    """Restore the original attribute state, without a bound-method cycle."""
    missing = object()
    previous = vars(model).get('get_input_embeddings', missing)
    original = model.get_input_embeddings
    def observed(*values, **options):
        if not actual:
            supplied = options.get('input_ids', values[0] if values else None)
            ids = supplied.tolist()
            if ids and isinstance(ids[0], list):
                if len(ids) != 1:
                    raise ValueError('native_generation_batch_changed')
                ids = ids[0]
            if ids != expected:
                raise ValueError('native_observed_model_prefix_changed')
            actual.extend(ids)
        return original(*values, **options)
    model.get_input_embeddings = observed
    try:
        yield
    finally:
        if previous is missing:
            delattr(model, 'get_input_embeddings')
        else:
            model.get_input_embeddings = previous


def worker(args):
    plan, payload = verify_plan(args.native_plan, args.manifest_sha256)
    run = args.native_plan.parent / ('trial-' + args.recipe)
    if args.session != run or not (run / 'session.json').exists():
        raise ValueError('native_owned_session_required')
    parent = subprocess.check_output(['/bin/ps', '-p', str(os.getppid()), '-o', 'command='], text=True)
    if str(ROOT / 'nuknuk-resource-guard.py') not in parent or str(run / 'resources.json') not in parent:
        raise ValueError('native_resource_supervisor_required')
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1')
    import importlib.metadata
    if {name: importlib.metadata.version(name) for name in plan['runtimeVersions']} != plan['runtimeVersions']:
        raise ValueError('native_runtime_versions_changed')
    import numpy as np
    import mlx.core as mx
    import mlx.nn as nn
    import mlx.optimizers as optim
    from mlx.utils import tree_flatten, tree_map
    from mlx_vlm import load
    from mlx_vlm.generate import stream_generate
    from mlx_vlm.structured import build_json_schema_logits_processor
    from mlx_vlm.trainer import grad_checkpoint

    mx.random.seed(7)
    expected_factors = 64 if plan['kind'] == 'NATIVE_MLX_MODEL_CHOICE_9B_V1' else 80
    expected_modules = expected_factors // 2
    model, processor = load(plan['model'], adapter_path=plan['adapter'])
    tokenizer = getattr(processor, 'tokenizer', processor)
    original = mx.load(str(Path(plan['adapter']) / 'adapters.safetensors'))

    def factors():
        return {k: v for k, v in tree_flatten(model.parameters()) if k.endswith(('.lora_a', '.lora_b'))}

    def hashes(values):
        return {k: hashlib.sha256(np.asarray(v).tobytes()).hexdigest() for k, v in values.items()}

    actual = factors()
    if len(actual) != expected_factors or set(actual) != set(original) or hashes(actual) != hashes(original):
        raise ValueError('native_effective_live_adapter_mismatch')
    def scales():
        values = {name: {'rank': int(layer.lora_a.shape[-1]), 'scale': float(layer.scale),
            'dropout': float(1 - layer.dropout._p_1)} for name, layer in model.named_modules()
            if hasattr(layer, 'lora_a') and hasattr(layer, 'lora_b')}
        if len(values) != expected_modules or any(v != {'rank': 16, 'scale': 2.0, 'dropout': 0.0} for v in values.values()):
            raise ValueError('native_loaded_lora_configuration_changed')
        return values
    write(run / 'effective-initial-scales.json', scales())
    write(run / 'effective-initial-adapter.json', {'allFactorsEqualInitial': True, 'factorCount': expected_factors, 'hashes': hashes(actual)})
    encoded = {r['id']: encode_row(tokenizer, r) for r in payload['train'] + payload['dev']}
    preflight = read(plan['files']['tokenization']['path'])['cases']
    for id, (prefix, target) in encoded.items():
        if (hashlib.sha256(json.dumps(prefix, separators=(',', ':')).encode()).hexdigest() != preflight[id]['prefixSha256']
                or hashlib.sha256(json.dumps(target, separators=(',', ':')).encode()).hexdigest() != preflight[id]['targetSha256']):
            raise ValueError('native_actual_processor_differs_from_preflight')
    write(run / 'tokenization.json', {k: {'prefixTokens': len(p), 'targetTokens': len(t),
        'prefixSha256': hashlib.sha256(json.dumps(p, separators=(',', ':')).encode()).hexdigest()}
        for k, (p, t) in encoded.items()})

    def evaluate(name):
        output = run / name
        output.mkdir(mode=0o700)
        model.eval()
        for row in payload['evaluation']:
            prompt = tokenizer.apply_chat_template(row['messages'], tokenize=False,
                add_generation_prompt=True, enable_thinking=False)
            ids = tokenizer.encode(prompt, add_special_tokens=False)
            if ids != encoded[row['id']][0]:
                raise ValueError('native_actual_generation_prefix_changed')
            started = time.time()
            text, tokens, finish, actual_prefix = '', [], None, []
            with generation_prefix_observer(model, ids, actual_prefix):
                for part in stream_generate(model, processor, prompt,
                        max_tokens=min(2048, 5120 - len(ids)), temperature=0, top_p=1, top_k=0,
                        prefill_step_size=4096,
                        logits_processors=[build_json_schema_logits_processor(tokenizer, row['outputSchema'])]):
                    text += part.text
                    if getattr(part, 'token', None) is not None and getattr(part, 'finish_reason', None) is None:
                        tokens.append(int(part.token))
                    if getattr(part, 'finish_reason', None) is not None:
                        finish = part.finish_reason
                        if getattr(part, 'token_ids', None) is not None:
                            tokens = list(part.token_ids)
            if not actual_prefix:
                raise ValueError('native_model_prefix_not_observed')
            try:
                raw = json.loads(text)
                status = 'GENERATED_REQUIRES_SEMANTIC_REVIEW' if finish == 'stop' else 'GENERATION_NOT_CONFIRMED_COMPLETE'
            except ValueError:
                raw, status = None, 'INCOMPLETE_OR_INVALID_JSON'
            write(output / (row['id'] + '.json'), {'id': row['id'], 'query': row['query'],
                'split': row['split'], 'raw': raw, 'rawText': text, 'status': status,
                'tokenIds': tokens, 'prefixSha256': hashlib.sha256(json.dumps(ids, separators=(',', ':')).encode()).hexdigest(),
                'finishReason': finish,
                'actualModelPrefixTokenIds': actual_prefix,
                'durationSeconds': time.time() - started, 'attempt': 1})
            print(json.dumps({'stage': name, 'id': row['id'], 'status': status}), flush=True)
            mx.clear_cache()

    evaluate('baseline')
    def recall_losses(name):
        model.eval()
        values = {}
        for row in payload['train'][:12]:
            prefix, target = encoded[row['id']]
            start, stop = response_positions(len(prefix), len(target))
            loss = answer_only_loss(model, mx.array([prefix + target[:-1]]), mx.array([target]), start, stop)
            value = float(loss.item())
            if not math.isfinite(value):
                raise ValueError('native_nonfinite_eval_loss')
            values[row['id']] = value
            del loss
            mx.clear_cache()
        write(run / name, {'kind': 'FIXED_TEACHER_FORCED_RECALL_LOSS_NOT_UNDERSTANDING_SCORE', 'losses': values})
    recall_losses('recall-loss-before.json')
    model.freeze()
    for _, layer in model.named_modules():
        if hasattr(layer, 'lora_a') and hasattr(layer, 'lora_b'):
            layer.unfreeze(keys=['lora_a', 'lora_b'], recurse=False)
    del layer
    trainable = dict(tree_flatten(model.trainable_parameters()))
    if set(trainable) != set(original):
        raise ValueError('native_only_bound_initial_factors_may_train')
    recipe = plan['recipes'][args.recipe]
    optimizer = optim.AdamW(learning_rate=recipe['learningRate'], weight_decay=0.0)

    decoder = type(model.language_model.model.layers[0])
    original_call = decoder.__call__
    grad_checkpoint(model.language_model.model.layers[0])
    value_and_grad = nn.value_and_grad(model, answer_only_loss)
    before = hashes(actual)
    del actual, trainable, original
    started = time.time()
    try:
        model.train()
        with (run / 'updates.jsonl').open('x') as journal:
            for step in range(recipe['steps']):
                row = payload['train'][step % len(payload['train'])]
                prefix, target = encoded[row['id']]
                ids = mx.array([prefix + target[:-1]])
                labels = mx.array([target])
                start, stop = response_positions(len(prefix), len(target))
                # Small atomic phase receipts disambiguate lazy construction,
                # gradient evaluation, update evaluation and committed steps.
                def phase(name):
                    value = {'optimizerStepAttempt': step + 1, 'id': row['id'], 'phase': name, 'atEpoch': time.time(),
                             'completedOptimizerSteps': step + 1 if name == 'STEP_COMMITTED' else step,
                             'mlxActiveBytes': mx.get_active_memory()}
                    temporary = run / 'phase.tmp'
                    with temporary.open('w') as stream:
                        json.dump(value, stream); stream.flush(); os.fsync(stream.fileno())
                    temporary.replace(run / 'phase.json')
                phase('BUILD_FORWARD_AND_GRADIENT_GRAPH')
                loss, grads = value_and_grad(model, ids, labels, start, stop)
                flat = tree_flatten(grads)
                if {k for k, _ in flat} != set(before):
                    raise ValueError('native_gradient_key_coverage_changed')
                finite = mx.all(mx.stack([mx.all(mx.isfinite(g)) for _, g in flat]))
                norm = mx.sqrt(sum(mx.sum(g.astype(mx.float32)**2) for _, g in flat))
                phase('EVALUATE_FORWARD_AND_GRADIENTS')
                mx.eval(loss, finite, norm)
                if not bool(finite.item()) or not math.isfinite(loss.item()) or not math.isfinite(norm.item()) or norm.item() <= 0:
                    raise ValueError('native_nonfinite_or_zero_gradient')
                grads = tree_map(lambda g: g * mx.minimum(1.0, 1.0 / (norm + 1e-12)), grads)
                optimizer.learning_rate = recipe['learningRate'] * min(1, (step + 1) / 5)
                phase('FINITE_GRADIENTS_UPDATE_NOT_EVALUATED')
                optimizer.update(model, grads)
                phase('EVALUATE_OPTIMIZER_UPDATE')
                mx.eval(model.trainable_parameters(), optimizer.state)
                if not all(bool(mx.all(mx.isfinite(v)).item()) for _, v in tree_flatten(optimizer.state) if isinstance(v, mx.array)):
                    raise ValueError('native_nonfinite_optimizer_state')
                record = {'optimizerStep': step + 1, 'id': row['id'], 'loss': loss.item(),
                    'gradientNorm': norm.item(), 'allAdapterGradientsFinite': True, 'gradientTensorCount': expected_factors,
                    'elapsedSeconds': time.time() - started, 'mlxPeakBytes': mx.get_peak_memory()}
                journal.write(json.dumps(record) + '\n'); journal.flush(); os.fsync(journal.fileno())
                phase('STEP_COMMITTED')
                print(json.dumps(record), flush=True)
                del ids, labels, loss, grads, flat, finite, norm
                mx.clear_cache()
    finally:
        decoder.__call__ = original_call
        model.eval()
    after = factors()
    if len(after) != expected_factors or not all(bool(mx.all(mx.isfinite(v)).item()) for v in after.values()):
        raise ValueError('native_end_factors_invalid')
    changed = sum(before[k] != v for k, v in hashes(after).items())
    if changed == 0:
        raise ValueError('native_optimizer_did_not_change_weights')
    candidate = run / 'candidate'
    candidate.mkdir(mode=0o700)
    mx.save_safetensors(str(candidate / 'adapters.safetensors'), after)
    shutil.copyfile(Path(plan['adapter']) / 'adapter_config.json', candidate / 'adapter_config.json')
    write(run / 'training-result.json', {'status': 'OPTIMIZER_FINISHED_REQUIRES_SEMANTIC_REVIEW',
        'optimizerSteps': recipe['steps'], 'changedAdapterTensors': changed,
        'initialAdapterSha256': plan.get('initialAdapterSha256', plan['liveAdapterSha256']),
        'candidateSha256': sha(candidate / 'adapters.safetensors'), 'baseFused': False})
    del optimizer, value_and_grad, model, after
    gc.collect()
    mx.clear_cache()
    model, processor = load(plan['model'], adapter_path=str(candidate))
    if len(factors()) != expected_factors or hashes(factors()) != hashes(mx.load(str(candidate / 'adapters.safetensors'))):
        raise ValueError('native_reloaded_candidate_mismatch')
    write(run / 'reload-receipt.json', {'allSavedFactorsReloadedExactly': True, 'factorCount': expected_factors, 'modules': scales()})
    recall_losses('recall-loss-after.json')
    evaluate('candidate-evaluation')
    write(run / 'result.json', {'status': 'NATIVE_LEARNING_FINISHED_REQUIRES_PAIRED_REVIEW',
        'optimizerSteps': recipe['steps'], 'evaluationCasesPerAdapter': 36,
        'productionActivation': False, 'cloudResourcesCreated': False})


def recovery_watch(fd, session):
    comparison = module('nuknuk-mac-comparison')
    (session / 'watchdog.ready').touch()
    while not (session / 'restored.json').exists():
        ready, _, _ = select.select([fd], [], [], 5)
        if ready and not os.read(fd, 1):
            for attempt in range(3):
                try:
                    comparison.restore(session)
                    break
                except Exception as error:
                    comparison.put(session, 'watchdog-restore-error.json', {'attempt': attempt + 1, 'error': str(error)})
                    if attempt == 2:
                        raise
                    time.sleep(3)
            break


def execute(args, plan):
    comparison = module('nuknuk-mac-comparison')
    session = args.native_plan.parent / ('trial-' + args.recipe)
    if session.exists():
        raise ValueError('native_trial_already_attempted')
    diagnostic = plan.get('kind') == 'NATIVE_MLX_GATED_DELTA_DIAGNOSTIC_V1'
    if diagnostic and args.recipe != 'A':
        raise ValueError('native_memory_diagnostic_has_no_second_recipe')
    if args.recipe == 'B':
        decision = read(args.native_plan.parent / 'decision-A.json')
        if (decision.get('nextAction') != 'TRY_FIXED_RECIPE_B' or not decision.get('mikeReviewSha256')
                or decision.get('planSha256') != args.manifest_sha256
                or decision.get('trialAResultSha256') != sha(args.native_plan.parent / 'trial-A/result.json')
                or read(args.native_plan.parent / 'trial-A/restored.json').get('status') != 'HEALTHY_ORIGINAL_RESTORED'):
            raise ValueError('native_second_recipe_needs_paired_review')
        if sha(args.native_plan.parent / 'MIKE-TRIAL-A-REVIEW.md') != decision['mikeReviewSha256']:
            raise ValueError('native_first_recipe_review_changed')
    if comparison.sha(comparison.PLIST) != comparison.PLIST_SHA:
        raise ValueError('native_live_agent_changed')
    live = comparison.health(8088)
    if (live.get('status') != 'healthy' or live.get('loaded_model') != plan.get('liveModel', plan['model'])
            or sha(Path(live.get('loaded_adapter', '')) / 'adapters.safetensors') != plan['liveAdapterSha256']
            or sha(Path(live.get('loaded_adapter', '')) / 'adapter_config.json') != plan['liveAdapterConfigSha256']):
        raise ValueError('native_live_reference_changed')
    session.mkdir(mode=0o700)
    write(session / 'session.json', {'live': {'model': live['loaded_model'], 'adapter': live['loaded_adapter']},
        'plistSha256': comparison.PLIST_SHA, 'gatewayDomain': comparison.DOMAIN_FILE.read_text().strip()})
    readfd, writefd = os.pipe()
    watchdog = subprocess.Popen([sys.executable, '-B', str(__file__), '--watchdog', str(readfd),
        '--session', str(session)], pass_fds=[readfd], start_new_session=True)
    os.close(readfd)
    process = None
    start_read, start_write = os.pipe()
    admitted = False
    def interrupt(_signum, _frame):
        raise KeyboardInterrupt
    handlers = {s: signal.signal(s, interrupt) for s in (signal.SIGTERM, signal.SIGINT)}
    try:
        comparison.wait_until(lambda: (session / 'watchdog.ready').exists() and watchdog.poll() is None,
                              10, 'native_recovery_watchdog_not_ready')
        if comparison.agent('bootout', comparison.SERVICE).returncode:
            raise RuntimeError('native_could_not_pause_live')
        comparison.wait_until(lambda: not comparison.health(8088) and comparison.guard_free(), 45, 'native_live_not_released')
        guard = module('nuknuk-resource-guard')
        comparison.wait_until(lambda: guard.preflight_reason(guard.read_host()) is None,
                              60, 'native_host_not_ready_after_pause')
        command = [plan['python'], '-B', str(ROOT / 'nuknuk-resource-guard.py'), '--receipt',
            str(session / 'resources.json'), '--native-start-fd', str(start_read),
            'backyrd.nuknuk-native-learning', '--native-plan',
            str(args.native_plan), '--manifest-sha256', args.manifest_sha256, '--worker',
            '--recipe', args.recipe, '--session', str(session)]
        if diagnostic:
            command = [plan['python'], '-B', str(ROOT / 'nuknuk-resource-guard.py'), '--receipt',
                str(session / 'resources.json'), '--native-start-fd', str(start_read),
                'backyrd.nuknuk-memory-probe', '--gated-plan', str(args.native_plan),
                '--manifest-sha256', args.manifest_sha256, '--session', str(session)]
        with (session / 'worker.log').open('x') as log:
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, cwd=ROOT.parents[1], pass_fds=[start_read])
            os.close(start_read)
            start_read = None
            comparison.put(session, 'owned-guard.json', {'pid': process.pid, 'receipt': str(session / 'resources.json')})
            # fsync ownership before the worker may acquire the model lock.
            with (session / 'owned-guard.json').open('rb') as ownership:
                os.fsync(ownership.fileno())
            os.write(start_write, b'1')
            admitted = True
            os.close(start_write)
            start_write = None
            code = process.wait()
        if code:
            raise RuntimeError('native_guarded_worker_failed:' + str(code))
    finally:
        for s in handlers:
            signal.signal(s, signal.SIG_IGN)
        try:
            try:
                for fd in [start_read, start_write]:
                    if fd is not None:
                        os.close(fd)
                if process is not None and not admitted and process.poll() is None:
                    process.terminate()
                    process.wait(timeout=5)
            finally:
                comparison.restore(session)
        finally:
            try:
                os.close(writefd)
                watchdog.wait(timeout=300)
            finally:
                for s, handler in handlers.items():
                    signal.signal(s, handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--native-plan', type=Path)
    parser.add_argument('--manifest-sha256')
    parser.add_argument('--recipe', choices=['A', 'B'], default='A')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--worker', action='store_true')
    parser.add_argument('--watchdog', type=int)
    parser.add_argument('--session', type=Path)
    args = parser.parse_args()
    if args.watchdog is not None:
        return recovery_watch(args.watchdog, args.session)
    if args.native_plan is None or args.manifest_sha256 is None:
        raise ValueError('native_explicit_plan_required')
    if args.worker:
        return worker(args)
    if read(args.native_plan).get('kind') == 'NATIVE_MLX_GATED_DELTA_DIAGNOSTIC_V1':
        plan = module('nuknuk-memory-probe').verify_gated_plan(args.native_plan, args.manifest_sha256)
    else:
        plan, _ = verify_plan(args.native_plan, args.manifest_sha256)
    if args.execute:
        return execute(args, plan)
    print(json.dumps({'status': 'NATIVE_PLAN_VERIFIED_NO_MODEL_LOADED', 'planSha256': args.manifest_sha256}))


if __name__ == '__main__':
    main()
