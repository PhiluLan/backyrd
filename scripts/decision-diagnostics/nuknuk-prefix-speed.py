"""Inference-only paired resident system-prefix reuse, using native hybrid APC.

No disk cache, prompt edits, optimizer, weight fusion or production activation.
The original speed helper owns identical timing, generation and grammar paths.
"""
from collections import Counter
from contextlib import contextmanager
import gc
import hashlib
import importlib
import importlib.util
import json
from pathlib import Path
import time

KIND = 'NATIVE_MLX_PREFIX_SPEED_DIAGNOSTIC_V1'
BOUNDARY = 1968
PREFIX_SHA = '4e0f405458c9e65495477c3c3db2afd28d10d2843269c07919c222b235432dab'
CONFIG = {'boundary': BOUNDARY, 'evaluationIndices': [0, 12, 32],
          'workerTimeoutSeconds': 900, 'checkpointEntries': 2,
          'checkpointIntervalTokens': 0, 'memoryMaxGiB': 1,
          'memoryReserveGiB': 1, 'blockSize': 16, 'diskCache': False}


def helper():
    spec = importlib.util.spec_from_file_location('prefix_speed_reference', Path(__file__).with_name('nuknuk-speed-probe.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def digest(ids):
    return hashlib.sha256(json.dumps(list(ids), separators=(',', ':')).encode()).hexdigest()


def roster():
    def row(mode, case, condition, warmup, repeat):
        return {'mode': mode, 'case': case, 'cacheCondition': condition, 'warmup': warmup, 'repeat': repeat}
    rows = [row('trace_grammar', 0, 'prime', True, 0)]
    rows += [row('trace_grammar', 1, c, True, 0) for c in ('cold', 'cached')]
    for repeat in range(1, 4):
        order = ('cold', 'cached') if repeat % 2 else ('cached', 'cold')
        rows += [row('trace_grammar', 1, c, False, repeat) for c in order]
    for case in range(3):
        for repeat in range(1, 3):
            order = ('cold', 'cached') if repeat % 2 else ('cached', 'cold')
            rows += [row('actual_grammar', case, c, False, repeat) for c in order]
    return rows


def verify(plan, payload):
    required = {'speed-source', 'speed-tests', 'speed-trace-preflight', 'prefix-source', 'prefix-tests',
                'prefix-preflight', 'stage1-plan', 'stage1-review', 'apc-design'}
    if (plan.get('prefixConfig') != CONFIG or plan.get('optimizerAllowed') is not False
            or plan.get('benchmarkRoster') != roster() or not required <= plan['files'].keys()
            or plan.get('speedRowIds') != [payload['evaluation'][i]['id'] for i in CONFIG['evaluationIndices']]):
        raise ValueError('prefix_speed_scope_invalid')
    pre = json.loads(Path(plan['files']['prefix-preflight']['path']).read_text())
    if (pre.get('status') != 'PASS' or pre.get('boundary') != BOUNDARY
            or len(pre.get('cases', [])) != 3
            or any(r['sharedPrefixSha256'] != PREFIX_SHA or r['systemTokens'] <= BOUNDARY for r in pre['cases'])):
        raise ValueError('prefix_preflight_invalid')


def validate_prefix(ids):
    if len(ids) <= BOUNDARY or digest(ids[:BOUNDARY]) != PREFIX_SHA:
        raise ValueError('prefix_boundary_or_identity_changed')


@contextmanager
def checkpoint_policy(manager, coordinator, ids):
    validate_prefix(ids)
    previous = manager.exact_cache_guard_tokens
    manager.exact_cache_guard_tokens = len(ids) - BOUNDARY
    try:
        if (not coordinator.enabled or coordinator.strategy != 'checkpoint'
                or coordinator.checkpoint_len(ids, set()) != BOUNDARY
                or coordinator.checkpoint_lengths(ids, set()) != [BOUNDARY]):
            raise ValueError('prefix_checkpoint_policy_not_exact')
        yield
    finally:
        manager.exact_cache_guard_tokens = previous


def check_cached_tokens(observed, condition):
    expected = BOUNDARY if condition == 'cached' else 0
    if observed != expected:
        raise ValueError(f'prefix_unexpected_cached_tokens:{observed}:expected:{expected}')


def cache_receipt(manager):
    entries = list(manager._exact_cache.values())
    for entry in entries:
        if (len(entry.token_ids) != BOUNDARY or digest(entry.token_ids) != PREFIX_SHA
                or Counter(type(c).__name__ for c in entry.prompt_cache) != {'ArraysCache': 24, 'KVCache': 8}):
            raise ValueError('prefix_snapshot_contains_wrong_state_or_user_tail')
    stats = manager.stats_snapshot()
    if stats['resident_bytes'] > 1024**3:
        raise ValueError('prefix_cache_resident_budget_exceeded')
    return {'entryTokenLengths': [len(e.token_ids) for e in entries],
            'layerTypes': [[type(c).__name__ for c in e.prompt_cache] for e in entries],
            'stats': stats, 'diskCache': False}


def suffix_observer(original, condition):
    @contextmanager
    def observer(model, full, actual):
        validate_prefix(full)
        expected = full[BOUNDARY:] if condition == 'cached' else full
        with original(model, expected, actual):
            yield
    return observer


def injected_stream(original, manager, coordinator, ids, tenant, evidence):
    def stream(*args, **kwargs):
        generation = None
        with checkpoint_policy(manager, coordinator, ids):
            try:
                generation = original(*args, apc_manager=manager, apc_tenant=tenant, **kwargs)
                for part in generation:
                    if part.finish_reason is not None:
                        evidence['cachedTokens'] = part.cached_tokens
                    yield part
            finally:
                if generation is not None:
                    generation.close()
    return stream


def make_manager():
    from mlx_vlm.apc import APCManager
    manager = APCManager(num_blocks=256, block_size=16, disk=None,
        overrides={'checkpoint_entries': 2, 'checkpoint_interval_tokens': 0,
                   'checkpoint_guard_tokens': 1, 'memory_max_gb': 1, 'memory_reserve_gb': 1})
    if (manager.disk is not None or manager.block_size != 16 or manager._exact_cache_max != 2
            or manager.checkpoint_interval_tokens != 0 or manager.memory_max_bytes != 1024**3
            or manager.memory_reserve_bytes != 1024**3 or manager.exact_cache_min_tokens != 16):
        release_manager(manager)
        raise ValueError('prefix_effective_manager_configuration_changed')
    return manager


def release_manager(manager):
    try:
        manager.clear()
    finally:
        manager.close()


def pairs(rows):
    results = []
    for mode in ('trace_grammar', 'actual_grammar'):
        keys = sorted({(r['case'], r['repeat']) for r in rows if r['mode'] == mode and not r['warmup']})
        for case, repeat in keys:
            pair = [r for r in rows if r['mode'] == mode and r['case'] == case and r['repeat'] == repeat and not r['warmup']]
            cold = next(r for r in pair if r['cacheCondition'] == 'cold')
            warm = next(r for r in pair if r['cacheCondition'] == 'cached')
            if cold['prefixSha256'] != warm['prefixSha256']:
                raise ValueError('prefix_pair_input_changed')
            qualified = all(r['finishReason'] == 'stop' and r['jsonParses'] for r in pair)
            results.append({'mode': mode, 'case': case, 'repeat': repeat, 'qualifiedStopAndJsonOnly': qualified,
                'outputTokenIdsIdentical': cold['outputTokenIds'] == warm['outputTokenIds'],
                'coldOutputTokens': cold['outputTokensIncludingEos'], 'cachedOutputTokens': warm['outputTokensIncludingEos'],
                'ttftSecondsSaved': cold['ttftSeconds'] - warm['ttftSeconds'],
                'completeSecondsSaved': cold['completeSeconds'] - warm['completeSeconds'],
                'meaningOrHostEquivalentProven': False})
    return results


def run(model, processor, payload, encoded, plan, session, prefix_observer):
    import numpy as np
    import mlx.core as mx
    from mlx.utils import tree_flatten
    from mlx_vlm.generate import dispatch
    from mlx_vlm.apc import self_check_model_apc
    from mlx_vlm.apc_coordinator import APCCoordinator
    speed = helper()
    generate_module = importlib.import_module('mlx_vlm.generate')
    original_stream = generate_module.stream_generate
    model.eval()
    def factors():
        return {k: hashlib.sha256(np.asarray(a).tobytes()).hexdigest() for k, a in tree_flatten(model.parameters())
                if k.endswith(('.lora_a', '.lora_b'))}
    before = factors()
    if len(before) != 64:
        raise ValueError('prefix_expected64_adapter_factors')
    cases = [payload['evaluation'][i] for i in CONFIG['evaluationIndices']]
    preflight = json.loads(Path(plan['files']['prefix-preflight']['path']).read_text())
    trace_preflight = json.loads(Path(plan['files']['speed-trace-preflight']['path']).read_text())
    for row, frozen, trace in zip(cases, preflight['cases'], trace_preflight['cases']):
        ids = encoded[row['id']][0]
        validate_prefix(ids)
        if (frozen['id'] != row['id'] or frozen['prefixSha256'] != digest(ids)
                or trace['id'] != row['id'] or trace['traceSha256'] != digest(encoded[row['id']][1])):
            raise ValueError('prefix_current_inputs_differ_from_preflight')
    selfcheck = self_check_model_apc(model, log=False)
    if (not selfcheck.ok or selfcheck.layer_count != 32
            or Counter(selfcheck.layer_types) != {'ArraysCache': 24, 'KVCache': 8}):
        raise ValueError('prefix_hybrid_selfcheck_failed')
    speed.write(session/'apc-selfcheck.json', {'ok': selfcheck.ok, 'layers': selfcheck.layer_count,
        'layerTypes': selfcheck.layer_types, 'capabilities': list(selfcheck.capabilities)})
    tenant = 'backyrd-prefix-speed-' + hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()
    rows = []
    warm_manager = make_manager()
    try:
        with speed.temporary_attribute(dispatch, 'wired_limit', speed.bounded_wired):
            for index, spec in enumerate(roster()):
                speed.write(session/f'pending-{index:02d}.json', {**spec, 'atEpoch': time.time()})
                setup_start = time.perf_counter()
                manager = make_manager() if spec['cacheCondition'] == 'cold' else warm_manager
                try:
                    coordinator = APCCoordinator(manager, model.language_model)
                    ids = encoded[cases[spec['case']]['id']][0]
                    before_cache = cache_receipt(manager)
                    if (bool(before_cache['entryTokenLengths']) != (spec['cacheCondition'] == 'cached')):
                        raise ValueError('prefix_wrong_pre_request_cache_state')
                    setup_seconds = time.perf_counter() - setup_start
                    evidence = {}
                    wrapped = injected_stream(original_stream, manager, coordinator, ids, tenant, evidence)
                    with speed.temporary_attribute(generate_module, 'stream_generate', wrapped):
                        result = speed.request(model, processor, cases[spec['case']], encoded, spec,
                            session/f'request-{index:02d}.json', suffix_observer(prefix_observer, spec['cacheCondition']))
                    check_cached_tokens(evidence.get('cachedTokens'), spec['cacheCondition'])
                    after_cache = cache_receipt(manager)
                    if not after_cache['entryTokenLengths']:
                        raise ValueError('prefix_required_checkpoint_not_saved')
                    speed.write(session/f'cache-{index:02d}.json', {**spec, 'cachedTokens': evidence['cachedTokens'],
                        'fullPrefixTokens': len(ids), 'newlyProcessedTokens': len(ids)-evidence['cachedTokens'],
                        'guardTokens': len(ids)-BOUNDARY, 'checkpointBoundary': BOUNDARY, 'sharedPrefixSha256': PREFIX_SHA,
                        'fullPrefixSha256': digest(ids), 'tenant': tenant,
                        'managerSetupOutsideRequestSeconds': setup_seconds, 'before': before_cache, 'after': after_cache,
                        'libraryPromptThroughputCountsCachedTokensDoNotUseAsPhysicalThroughput': True})
                    rows.append(result)
                    print(json.dumps({'request': index, **spec, 'seconds': result['completeSeconds'],
                        'ttft': result['ttftSeconds'], 'tokens': result['outputTokensIncludingEos'],
                        'cachedTokens': evidence['cachedTokens']}), flush=True)
                finally:
                    if manager is not warm_manager:
                        release_manager(manager)
                    gc.collect(); mx.clear_cache()
    finally:
        release_manager(warm_manager)
    if factors() != before:
        raise ValueError('prefix_adapter_weights_changed')
    summaries = {}
    for condition in ('cold', 'cached'):
        summaries[condition] = speed.summarize([r for r in rows if r['cacheCondition'] == condition])
    speed.write(session/'result.json', {'status': 'PREFIX_SPEED_FINISHED_REQUIRES_REVIEW', 'requests': len(rows),
        'summary': summaries, 'pairs': pairs(rows), 'adapterHashesUnchanged': True, 'modelWeightsChanged': False,
        'optimizerUpdates': 0, 'productionActivation': False, 'fullDecisionLatencyOrQualityProven': False,
        'rawStage1RemainsSeparateReference': True})
