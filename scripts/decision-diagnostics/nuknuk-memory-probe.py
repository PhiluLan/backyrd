"""Opt-in, local phase probe. No library files/base weights are edited.

Explicit evaluation barriers alter scheduling: results diagnose allocations,
not throughput or semantic quality. All runs must use the owned resource guard.
"""
import argparse
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import sys
import subprocess
import plistlib
import time


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
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--events', type=Path, required=True)
    parser.add_argument('--wired-gib', type=int, default=0, choices=[0, 24])
    parser.add_argument('--capture-maps', action='store_true')
    args = parser.parse_args()
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
