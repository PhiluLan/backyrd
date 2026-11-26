"""Opt-in, local phase probe. No library files/base weights are edited.

Explicit evaluation barriers alter scheduling: results diagnose allocations,
not throughput or semantic quality. All runs must use the owned resource guard.
"""
import argparse
import gc
import ctypes
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import sys
import subprocess
import plistlib
import time

GATED_KIND = 'NATIVE_MLX_GATED_DELTA_DIAGNOSTIC_V1'
VJP_KIND = 'NATIVE_MLX_GATED_DELTA_VJP_COMPARE_V1'
GATED_CASES = [('reference', 64)] + [(mode, size) for size in (64, 512, 4134) for mode in ('forward', 'gradient')]
GATED_SHAPE = {'batch': 1, 'keyHeads': 16, 'valueHeads': 32, 'keyDim': 128, 'valueDim': 128, 'chunk': 64}


def case_roster(plan):
    return [('reference', 64), ('gradient', 4134), ('gradient', 4134)] if plan.get('kind') == VJP_KIND else GATED_CASES


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def probe_write(path, value):
    with path.open('x') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, indent=2, allow_nan=False); stream.write('\n')
        stream.flush(); os.fsync(stream.fileno())


def verify_gated_plan(path, expected):
    if digest(path) != expected:
        raise ValueError('gated_probe_plan_changed')
    plan = json.loads(path.read_text())
    if (plan.get('kind') not in (GATED_KIND, VJP_KIND) or plan.get('shape') != GATED_SHAPE
            or plan.get('cases') != [list(c) for c in case_roster(plan)]
            or plan.get('seed') != 7 or plan.get('childTimeoutSeconds') != 300
            or plan.get('referenceTolerance') != {'rtol': 0.001, 'atol': 0.0001}
            or not {'mlx', 'mlx-vlm'} <= plan.get('runtimeVersions', {}).keys()
            or not {'probe-source', 'native-source', 'guard-source', 'comparison-source', 'gated-delta-source',
                    'previous-stop', 'previous-restore'} <= plan.get('files', {}).keys()
            or any(plan.get(k) is not False for k in ('cloudAllowed', 'productionActivation', 'optimizerAllowed', 'modelWeightsLoaded'))):
        raise ValueError('gated_probe_configuration_invalid')
    if plan['kind'] == VJP_KIND and (plan.get('memoryReductionMinimum') != 0.2
            or plan.get('algorithms') != ['unit-inverse-vjp', 'original-ad', 'unit-inverse-vjp']
            or not {'inverse-source', 'component-summary', 'component-review'} <= plan['files'].keys()):
        raise ValueError('gated_vjp_comparison_scope_invalid')
    for item in plan['files'].values():
        if digest(item['path']) != item['sha256']:
            raise ValueError('gated_probe_bound_file_changed')
    previous = json.loads(Path(plan['files']['previous-stop']['path']).read_text())
    restored = json.loads(Path(plan['files']['previous-restore']['path']).read_text())
    if previous.get('action') != 'STOP_TECHNICAL_FAILURE' or restored.get('status') != 'HEALTHY_ORIGINAL_RESTORED':
        raise ValueError('gated_probe_previous_run_not_closed')
    return plan


def gated_sequence(args, plan):
    """Fresh child per condition; all children remain in the guarded PGID."""
    parent = subprocess.check_output(['/bin/ps', '-p', str(os.getppid()), '-o', 'command='], text=True)
    if (str(Path(__file__).with_name('nuknuk-resource-guard.py')) not in parent
            or str(args.session / 'resources.json') not in parent):
        raise ValueError('gated_probe_resource_supervisor_required')
    probe_write(args.session / 'diagnostic-parent.json', {'pid': os.getpid(), 'pgid': os.getpgrp()})
    for index, (mode, size) in enumerate(case_roster(plan)):
        name = f'{index:02d}-{mode}-{size}'
        command = [plan['python'], '-B', str(Path(__file__).resolve()), '--gated-plan', str(args.gated_plan),
                   '--manifest-sha256', args.manifest_sha256, '--session', str(args.session), '--diagnostic-child', str(index)]
        with (args.session / (name + '.log')).open('x') as log:
            try:
                done = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=plan['childTimeoutSeconds'])
            except subprocess.TimeoutExpired:
                probe_write(args.session / 'diagnostic-stop.json', {'status': 'TIMEOUT', 'case': name})
                raise
        result = args.session / (name + '.json')
        record = json.loads(result.read_text()) if result.exists() else {}
        if (done.returncode or record.get('status') != 'PASS' or record.get('caseIndex') != index
                or record.get('mode') != mode or record.get('tokens') != size
                or record.get('planSha256') != args.manifest_sha256):
            probe_write(args.session / 'diagnostic-stop.json', {'status': 'CHILD_FAILED', 'case': name, 'returncode': done.returncode})
            raise RuntimeError('gated_probe_failed_no_larger_stage:' + name)
    probe_write(args.session / 'result.json', {'status': 'SYNTHETIC_COMPONENT_DIAGNOSTIC_FINISHED',
        'cases': len(case_roster(plan)), 'modelLoaded': False, 'optimizerUpdates': 0,
        'fullModelTrainabilityProven': False, 'productionActivation': False})


def gated_child(args, plan):
    parent = json.loads((args.session / 'diagnostic-parent.json').read_text())
    if parent != {'pid': os.getppid(), 'pgid': os.getpgrp()}:
        raise ValueError('gated_probe_owned_child_required')
    import importlib.metadata
    if {k: importlib.metadata.version(k) for k in plan['runtimeVersions']} != plan['runtimeVersions']:
        raise ValueError('gated_probe_runtime_changed')
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1')
    import mlx.core as mx
    mx.set_memory_limit(24 * 1024**3); mx.set_cache_limit(256 * 1024**2); mx.set_wired_limit(24 * 1024**3)
    args.case = case_roster(plan)[args.diagnostic_child]
    args.vjp_compare = plan['kind'] == VJP_KIND
    args.use_inverse_vjp = args.vjp_compare and args.diagnostic_child in (0, 2)
    result = gated_measure(args)
    gc.collect(); mx.clear_cache(); mx.synchronize()
    result['cleanup'] = {'activeBytes': mx.get_active_memory(), 'cacheBytes': mx.get_cache_memory()}
    result.update(planSha256=args.manifest_sha256, caseIndex=args.diagnostic_child, pid=os.getpid(), pgid=os.getpgrp(),
                  actualLimits={'allocatorBytes': 24 * 1024**3, 'wiredBytes': 24 * 1024**3, 'cacheBytes': 256 * 1024**2})
    name = f'{args.diagnostic_child:02d}-{result["mode"]}-{result["tokens"]}'
    probe_write(args.session / (name + '.json'), finite_json(result))
    if result['status'] != 'PASS':
        raise ValueError('gated_probe_nonfinite_or_reference_failure')


def finite_json(value):
    """Failed receipts remain valid JSON; final checks retain failure reasons."""
    if isinstance(value, dict):
        return {k: finite_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [finite_json(v) for v in value]
    return None if isinstance(value, float) and not math.isfinite(value) else value


def gated_checks(primary_finite, norms=None, reference_finite=None, comparison=None):
    norms_finite = None if norms is None else all(math.isfinite(n) for n in norms)
    nonzero = None if norms is None else any(n > 0 for n in norms)
    metrics_finite = None if comparison is None else all(math.isfinite(c[k]) for c in comparison
        for k in ('maxAbsError', 'normalizedL2Error'))
    within = None if comparison is None else all(c['allClose'] for c in comparison)
    status = ('NONFINITE_PRIMARY' if not primary_finite else
              'NONFINITE_GRADIENT_NORMS' if norms_finite is False else
              'ZERO_GRADIENT' if nonzero is False else
              'NONFINITE_REFERENCE' if reference_finite is False or metrics_finite is False else
              'REFERENCE_TOLERANCE_FAILURE' if within is False else 'PASS')
    return {'status': status, 'allChecksPassed': status == 'PASS', 'primaryFinite': primary_finite,
            'gradientNormsFinite': norms_finite, 'nonzeroAggregateGradient': nonzero,
            'referenceFinite': reference_finite, 'referenceMetricsFinite': metrics_finite,
            'referenceWithinTolerance': within}


def primary_evaluation(mx, values, started, mark):
    mx.eval(values); mx.synchronize()
    snapshot = {'activeBytes': mx.get_active_memory(), 'cacheBytes': mx.get_cache_memory(),
                'peakBytes': mx.get_peak_memory(), 'elapsedSeconds': time.monotonic() - started}
    mark('PRIMARY_EVAL_COMPLETE')
    return snapshot


def gated_measure(args):
    if args.use_inverse_vjp:
        from mlx_vlm.models.qwen3_5 import gated_delta
        spec = importlib.util.spec_from_file_location('unit_inverse', Path(__file__).with_name('nuknuk-gated-inverse.py'))
        inverse = importlib.util.module_from_spec(spec); spec.loader.exec_module(inverse)
        with inverse.installed_inverse_vjp(gated_delta):
            return gated_measure_arrays(args)
    return gated_measure_arrays(args)


def gated_measure_arrays(args):
    """Return scalar receipts only, so the caller can measure graph release."""
    import mlx.core as mx
    from mlx_vlm.models.qwen3_5.gated_delta import gated_delta_chunked, gated_delta_ops
    mx.set_memory_limit(24 * 1024**3); mx.set_cache_limit(256 * 1024**2); mx.set_wired_limit(24 * 1024**3)
    mx.random.seed(7)
    mode, size = args.case
    name = f'{args.diagnostic_child:02d}-{mode}-{size}'
    q = mx.random.normal((1, size, 16, 128))
    k = mx.random.normal((1, size, 16, 128))
    q = mx.fast.rms_norm(q, None, 1e-6) / 128
    k = mx.fast.rms_norm(k, None, 1e-6) / math.sqrt(128)
    v = mx.random.normal((1, size, 32, 128))
    g = mx.random.uniform(low=0.90, high=0.99, shape=(1, size, 32))
    beta = mx.random.uniform(low=0.2, high=0.8, shape=(1, size, 32))
    if mode != 'reference':
        q, k, v, beta = [a.astype(mx.bfloat16) for a in (q, k, v, beta)]
    state = mx.zeros((1, 32, 128, 128), dtype=mx.float32)
    weight = mx.random.normal(v.shape) / math.sqrt(math.prod(v.shape))
    inputs = (q, k, v, g, beta)
    mx.eval(inputs, state, weight); mx.synchronize(); mx.clear_cache(); mx.reset_peak_memory()
    def memory():
        return {'activeBytes': mx.get_active_memory(), 'cacheBytes': mx.get_cache_memory(), 'peakBytes': mx.get_peak_memory()}
    baseline = memory()
    phases = args.session / (name + '.phases.jsonl')
    def mark(phase):
        with phases.open('a') as stream:
            stream.write(json.dumps({'phase': phase, 'atEpoch': time.time(), **memory()}) + '\n')
            stream.flush(); os.fsync(stream.fileno())
    def scalar(fn, *items):
        y, _ = fn(*items, state)
        return mx.sum(y.astype(mx.float32) * weight)
    started = time.monotonic()
    reference_finite, comparison, norms = None, None, None
    mark('BUILD_FORWARD' if mode == 'forward' else 'BUILD_VALUE_AND_GRAD')
    if mode == 'forward':
        outputs = gated_delta_chunked(*inputs, state)
        mark('EVALUATE_FORWARD')
        primary = primary_evaluation(mx, outputs, started, mark)
        mark('VALIDATE_PRIMARY')
        finite = all(bool(mx.all(mx.isfinite(a)).item()) for a in outputs)
        details = {'outputBufferBytes': mx.get_array_buffer_size(*outputs)}
    else:
        value, gradients = mx.value_and_grad(lambda *xs: scalar(gated_delta_chunked, *xs), argnums=tuple(range(5)))(*inputs)
        mark('EVALUATE_VALUE_AND_GRAD')
        primary = primary_evaluation(mx, (value, gradients), started, mark)
        mark('VALIDATE_PRIMARY')
        finite = bool(mx.isfinite(value).item()) and all(bool(mx.all(mx.isfinite(a)).item()) for a in gradients)
        norms = [mx.linalg.norm(a.astype(mx.float32)).item() for a in gradients]
        details = {'loss': value.item(), 'gradientNorms': norms, 'gradientBufferBytes': mx.get_array_buffer_size(*gradients)}
        if mode == 'reference':
            mark('BUILD_REFERENCE_FORWARD_AND_VJP')
            y, s = gated_delta_chunked(*inputs, state)
            ref_y, ref_s = gated_delta_ops(*inputs, state)
            ref_loss, ref_grads = mx.value_and_grad(lambda *xs: scalar(gated_delta_ops, *xs), argnums=tuple(range(5)))(*inputs)
            mark('EVALUATE_REFERENCE_FORWARD_AND_VJP')
            mx.eval(y, s, ref_y, ref_s, ref_loss, ref_grads)
            mx.synchronize(); mark('REFERENCE_EVAL_COMPLETE'); mark('VALIDATE_REFERENCE')
            reference_finite = all(bool(mx.all(mx.isfinite(a)).item()) for a in [y, s, ref_y, ref_s, ref_loss, *ref_grads])
            pairs = [('output', y, ref_y), ('endState', s, ref_s), ('loss', value, ref_loss)]
            pairs += [(f'gradient-{i}', a, b) for i, (a, b) in enumerate(zip(gradients, ref_grads))]
            details['referenceComparison'] = [{'name': label,
                'allClose': bool(mx.allclose(a, b, rtol=0.001, atol=0.0001).item()),
                'maxAbsError': mx.max(mx.abs(a - b)).item(),
                'normalizedL2Error': (mx.linalg.norm(a - b) / mx.maximum(mx.linalg.norm(b), 1e-12)).item()}
                for label, a, b in pairs]
            comparison = details['referenceComparison']
        if args.vjp_compare and args.diagnostic_child in (1, 2):
            mark('BUILD_NUMERICAL_ARTIFACT_COMPARISON')
            y, s = gated_delta_chunked(*inputs, state)
            mx.eval(y, s); mx.synchronize()
            tensors = {'output': y, 'endState': s, 'loss': value,
                       **{f'gradient-{i}': a for i, a in enumerate(gradients)}}
            finite = finite and all(bool(mx.all(mx.isfinite(a)).item()) for a in tensors.values())
            artifact = args.session / 'synthetic-reference.safetensors'
            if args.diagnostic_child == 1:
                if not finite or artifact.exists():
                    raise ValueError('gated_vjp_reference_not_finite_or_already_exists')
                mx.save_safetensors(str(artifact), tensors); artifact.chmod(0o600)
                if artifact.stat().st_size > 256 * 1024**2:
                    raise ValueError('gated_vjp_reference_artifact_over_bound')
                details['numericArtifactSha256'] = digest(artifact)
            else:
                baseline_receipt = json.loads((args.session / '01-gradient-4134.json').read_text())
                if (baseline_receipt.get('status') != 'PASS' or baseline_receipt.get('planSha256') != args.manifest_sha256
                        or digest(artifact) != baseline_receipt.get('numericArtifactSha256')):
                    raise ValueError('gated_vjp_reference_receipt_mismatch')
                reference = mx.load(str(artifact))
                if set(reference) != set(tensors):
                    raise ValueError('gated_vjp_reference_keys_changed')
                reference_finite = all(bool(mx.all(mx.isfinite(a)).item()) for a in reference.values())
                comparison = [{'name': label, 'allClose': bool(mx.allclose(a, reference[label], rtol=0.001, atol=0.0001).item()),
                    'maxAbsError': mx.max(mx.abs(a.astype(mx.float32) - reference[label].astype(mx.float32))).item(),
                    'normalizedL2Error': (mx.linalg.norm(a.astype(mx.float32) - reference[label].astype(mx.float32)) /
                        mx.maximum(mx.linalg.norm(reference[label].astype(mx.float32)), 1e-12)).item()}
                    for label, a in tensors.items()]
                details['referenceComparison'] = comparison
                details['memoryReductionFraction'] = 1 - primary['peakBytes'] / baseline_receipt['primaryEvaluation']['peakBytes']
    mx.synchronize(); mark('MATERIALIZED')
    result = {**gated_checks(finite, norms, reference_finite, comparison), 'mode': mode, 'tokens': size,
        'shapes': [list(a.shape) for a in inputs], 'dtypes': [str(a.dtype) for a in inputs],
        'inputBufferBytes': mx.get_array_buffer_size(*inputs, state, weight),
        'baseline': baseline, 'primaryEvaluation': primary, 'validationInclusiveMemory': memory(), 'elapsedSeconds': time.monotonic() - started,
        'modelLoaded': False, 'optimizerUpdates': 0, **details}
    if args.vjp_compare:
        result['algorithm'] = 'unit-inverse-vjp' if args.use_inverse_vjp else 'original-ad'
        if args.diagnostic_child == 2 and result['status'] == 'PASS' and details['memoryReductionFraction'] < 0.2:
            result.update(status='INSUFFICIENT_MEMORY_REDUCTION', allChecksPassed=False)
    return result


def validate_configuration(config_path, events):
    config = json.loads(config_path.read_text())
    model = Path(config['model']).resolve(strict=True)
    output = Path(config['adapter_file']).resolve()
    if (not 1 <= config.get('iters', 0) <= 3 or config.get('batch_size') != 1
            or config.get('train_on_completions') is not True
            or output.parent != events.resolve().parent or output.exists()
            or model == output or model in output.parents
            or config.get('train_type') != 'lora'):
        raise ValueError('nuknuk_memory_probe_configuration_invalid')
    # Reuse the canonical data boundary; no examples are changed for this probe.
    spec = importlib.util.spec_from_file_location('probe_training_boundary', Path(__file__).with_name('nuknuk-train.py'))
    trainer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(trainer)
    if model.name not in trainer.REVISIONS:
        raise ValueError('nuknuk_memory_probe_model_invalid')
    trainer.verify_export(Path(config['data']), '71d16f4c0fda441b50980fcbf32b816b22717cdbeca3f3f0f0262b16c5a3bca0')
    return config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path)
    parser.add_argument('--events', type=Path)
    parser.add_argument('--gated-plan', type=Path)
    parser.add_argument('--manifest-sha256')
    parser.add_argument('--session', type=Path)
    parser.add_argument('--diagnostic-child', type=int, choices=range(len(GATED_CASES)))
    parser.add_argument('--wired-gib', type=int, default=0, choices=[0, 24])
    parser.add_argument('--capture-maps', action='store_true')
    args = parser.parse_args()
    if args.gated_plan is not None:
        if not args.manifest_sha256 or args.session is None or args.config or args.events:
            raise ValueError('gated_probe_explicit_plan_and_session_required')
        plan = verify_gated_plan(args.gated_plan, args.manifest_sha256)
        if args.diagnostic_child is None:
            return gated_sequence(args, plan)
        return gated_child(args, plan)
    if args.config is None or args.events is None or args.diagnostic_child is not None:
        raise ValueError('memory_probe_config_and_events_required')
    validate_configuration(args.config, args.events)
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1", WANDB_DISABLED="true")
    import mlx.core as mx
    import mlx.optimizers as optim
    from mlx.utils import tree_flatten
    import mlx_vlm.train as cli
    import mlx_vlm.trainer.common.engine as engine
    import mlx_vlm.trainer.common.utils as utils
    import mlx_vlm.trainer.vlm.sft.runtime as runtime
    spec = importlib.util.spec_from_file_location('local_resource_guard', Path(__file__).with_name('nuknuk-resource-guard.py'))
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    args.events.parent.mkdir(parents=True, exist_ok=True)
    journal = args.events.open('x')
    args.events.chmod(0o600)
    started = time.monotonic()
    step_number = 0

    def driver_memory():
        raw = subprocess.check_output(['/usr/sbin/ioreg', '-r', '-c', 'IOAccelerator', '-a'], timeout=2)
        stats = []
        def visit(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key == 'PerformanceStatistics':
                        stats.append({k: v for k, v in item.items() if k in ('Alloc system memory', 'In use system memory', 'In use system memory (driver)')})
                    elif isinstance(item, (dict, list)):
                        visit(item)
            elif isinstance(value, list):
                for item in value:
                    visit(item)
        visit(plistlib.loads(raw))
        return stats

    def emit(phase, **extra):
        mx.synchronize()
        extra['vmStats'] = subprocess.check_output(['/usr/bin/vm_stat'], text=True, timeout=2)
        if args.capture_maps and phase in ('model_load_end', 'forward_only_end', 'forward_and_backward_end', 'step_cleanup'):
            mapped = subprocess.run(['/usr/bin/vmmap', '-summary', str(os.getpid())], capture_output=True, text=True, timeout=3)
            extra['vmmapSummary'] = {'exit': mapped.returncode, 'text': mapped.stdout[-16000:], 'error': mapped.stderr[-1000:]}
        row = {'phase': phase, 'step': step_number, 'epochSeconds': time.time(),
               'elapsedSeconds': round(time.monotonic()-started, 4),
               'mlxActiveBytes': mx.get_active_memory(), 'mlxCacheBytes': mx.get_cache_memory(),
               'mlxPeakBytes': mx.get_peak_memory(),
               'physicalFootprintBytes': guard.physical_footprint(os.getpid()),
               'gpuDriverMemory': driver_memory(), **extra}
        journal.write(json.dumps(row)+'\n'); journal.flush(); os.fsync(journal.fileno())
        print(json.dumps({'phase': phase, 'step': step_number, 'mlxActiveGiB': round(row['mlxActiveBytes']/1024**3, 3),
                          'footprintGiB': round(row['physicalFootprintBytes']/1024**3, 3)}), flush=True)

    def arrays_size(tree):
        return sum(v.nbytes for _, v in tree_flatten(tree) if isinstance(v, mx.array))

    prior_wired = mx.set_wired_limit(args.wired_gib*1024**3)
    emit('runtime_ready', wiredLimitBytes=args.wired_gib*1024**3, previousWiredLimitBytes=prior_wired,
         deviceInfo=mx.device_info(), diagnosticSchedulingBarriers=True)

    def wrap(obj, name, label, evaluate_model=False):
        original = getattr(obj, name)
        def call(*a, **kw):
            emit(label+'_begin')
            result = original(*a, **kw)
            if evaluate_model:
                model = result[0] if isinstance(result, tuple) else result
                mx.eval(model.parameters())
                emit(label+'_end', modelArrayBytes=arrays_size(model.parameters()),
                     trainableArrayBytes=arrays_size(model.trainable_parameters()))
            else:
                emit(label+'_end')
            return result
        setattr(obj, name, call)

    wrap(cli, '_load_model', 'model_load', True)
    wrap(cli, '_configure_model', 'adapter_configure', True)
    wrap(optim.Optimizer, 'init', 'optimizer_init')
    original_logits = runtime.forward_vlm_logits
    def logits(*a, **kw):
        result = original_logits(*a, **kw)
        emit('logits_graph_built', shape=list(result.shape), dtype=str(result.dtype),
             logicalBytes=result.nbytes, lazyGraphNotStandaloneExecution=True)
        return result
    runtime.forward_vlm_logits = logits

    def step(model, optimizer, loss_value_and_grad, batch, previous_gradients=None, *, update,
             accumulation_steps, loss_args=()):
        nonlocal step_number
        step_number += 1
        emit('step_begin', inputShape=list(batch['input_ids'].shape),
             supervisedTokens=int(batch['completion_mask'][:, 1:].sum().item()))
        # Isolate inference/loss without any gradient tape, then release it.
        mx.reset_peak_memory()
        emit('forward_only_begin')
        output = runtime.vlm_sft_loss(model, batch, train_on_completions=True, assistant_id=None)
        mx.eval(output)
        emit('forward_only_end', loss=float(output[0].item()))
        del output
        mx.clear_cache()
        emit('forward_only_released')
        mx.reset_peak_memory()
        emit('forward_and_backward_begin')
        output, gradients = loss_value_and_grad(model, batch, *loss_args)
        emit('gradient_graph_built', gradientArrayBytes=arrays_size(gradients))
        mx.eval(output, gradients)
        emit('forward_and_backward_end', gradientArrayBytes=arrays_size(gradients), loss=float(output[0].item()))
        loss_value, metrics = utils.normalize_loss_output(output)
        gradients = utils.accumulate_gradients(gradients, previous_gradients)
        if update:
            emit('optimizer_update_begin')
            utils.apply_accumulated_gradients(model, optimizer, gradients, accumulation_steps)
            mx.eval(model.state, optimizer.state)
            emit('optimizer_update_end', optimizerStateArrayBytes=arrays_size(optimizer.state))
            gradients = None
        del output
        mx.clear_cache()
        emit('step_cleanup')
        return loss_value, metrics, gradients
    engine.apply_gradient_step = step
    try:
        cli.main(['--config', str(args.config)])
        emit('probe_finished')
    finally:
        journal.close()


if __name__ == '__main__':
    main()
