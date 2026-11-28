"""Inference-only resident-model speed measurements. No optimizer or writes to weights.

Scripted token traces isolate runtime overhead; they are never understanding
results. Free JSON generation is reported separately, including failures.
"""
from contextlib import contextmanager
import gc
import hashlib
import json
from pathlib import Path
import statistics
import time

KIND = 'NATIVE_MLX_SPEED_DIAGNOSTIC_V1'
CONFIG = {'evaluationIndices': [0, 12, 32], 'repeats': 3, 'actualRepeats': 2,
          'rawTokens': 128, 'workerTimeoutSeconds': 900, 'prefillStepSize': 4096,
          'temperature': 0, 'maxContextTokens': 5120, 'perResponseCheckSeconds': 60}


def roster():
    rows = [{'mode': 'raw', 'case': 0, 'warmup': i == 0, 'repeat': i} for i in range(4)]
    for case in range(3):
        rows += [{'mode': mode, 'case': case, 'warmup': True, 'repeat': 0} for mode in ('trace', 'trace_grammar')]
        for repeat in range(1, 4):
            order = ('trace', 'trace_grammar') if repeat % 2 else ('trace_grammar', 'trace')
            rows += [{'mode': mode, 'case': case, 'warmup': False, 'repeat': repeat} for mode in order]
    rows += [{'mode': 'actual_grammar', 'case': case, 'warmup': False, 'repeat': repeat}
             for repeat in range(1, 3) for case in range(3)]
    return rows


def verify(plan, payload):
    if (plan.get('speedConfig') != CONFIG or plan.get('optimizerAllowed') is not False
            or plan.get('benchmarkRoster') != roster()
            or not {'speed-source', 'speed-tests', 'speed-trace-preflight'} <= plan['files'].keys()
            or plan.get('speedRowIds') != [payload['evaluation'][i]['id'] for i in CONFIG['evaluationIndices']]):
        raise ValueError('native_speed_scope_invalid')


def trace_preflight(tokenizer, payload, encoded):
    from llguidance import LLMatcher
    from mlx_vlm.structured import build_json_schema_logits_processor
    rows = []
    for index in CONFIG['evaluationIndices']:
        row = payload['evaluation'][index]
        trace = encoded[row['id']][1]
        processor = build_json_schema_logits_processor(tokenizer, row['outputSchema'])
        matcher = LLMatcher(processor.llg_tokenizer, processor.grammar)
        valid = matcher.validate_tokens(trace)
        if valid != len(trace) or not matcher.consume_tokens(trace) or matcher.get_error() or not matcher.is_stopped():
            raise ValueError('speed_gold_trace_not_accepted_by_actual_grammar:' + row['id'])
        rows.append({'id': row['id'], 'tokensIncludingEos': len(trace),
                     'traceSha256': hashlib.sha256(json.dumps(trace, separators=(',', ':')).encode()).hexdigest(),
                     'actualGrammarAcceptedIncludingEos': True})
    return {'status': 'PASS', 'modelWeightsLoaded': False, 'cases': rows}


def write(path, value):
    with path.open('x') as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False, allow_nan=False)
        stream.write('\n'); stream.flush()
        import os
        os.fsync(stream.fileno())


class TimedProcessor:
    def __init__(self, inner):
        self.inner, self.calls, self.seconds = inner, 0, 0.0
        self.requires_immediate_decode_yield = getattr(inner, 'requires_immediate_decode_yield', False)

    def __call__(self, tokens, logits):
        started = time.perf_counter()
        try:
            return self.inner(tokens, logits)
        finally:
            self.calls += 1
            self.seconds += time.perf_counter() - started


class ScriptedTrace:
    def __init__(self, ids):
        self.ids, self.step = ids, 0

    def __call__(self, tokens, logits):
        import mlx.core as mx
        # Deliberate barrier in BOTH scripted controls: prove the requested
        # model/head/(optional) grammar readout was actually materialized.
        # This control is not the raw hardware or real-answer speed ceiling.
        mx.eval(logits)
        # The generator can compute one token ahead of the terminal EOS.
        token = self.ids[min(self.step, len(self.ids) - 1)]
        self.step += 1
        # Retain the actual score. A grammar-forbidden token stays forbidden.
        result = mx.full_like(logits, -float('inf'))
        result[..., token] = logits[..., token]
        return result


@contextmanager
def temporary_attribute(obj, name, value):
    previous = getattr(obj, name)
    setattr(obj, name, value)
    try:
        yield
    finally:
        setattr(obj, name, previous)


@contextmanager
def bounded_wired(model, streams=None):
    import mlx.core as mx
    previous = mx.set_wired_limit(24 * 1024**3)
    if previous > 24 * 1024**3:
        raise ValueError('speed_inherited_wired_limit_over_contract')
    try:
        yield
    finally:
        if streams:
            for stream in streams:
                mx.synchronize(stream)
        else:
            mx.synchronize()
        mx.set_wired_limit(previous)


def request(model, processor, row, encoded, spec, output, prefix_observer):
    import mlx.core as mx
    from mlx_vlm.generate import stream_generate
    from mlx_vlm.structured import build_json_schema_logits_processor
    tokenizer = getattr(processor, 'tokenizer', processor)
    mode = spec['mode']
    messages = row['messages'] if mode != 'raw' else [
        {'role': 'system', 'content': 'Antworte auf Deutsch ohne Denktext.'},
        {'role': 'user', 'content': 'Nenne Freizeitaktivitäten in kurzen Stichpunkten.'}]
    started = time.perf_counter()
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
    prefix = tokenizer.encode(prompt, add_special_tokens=False)
    if mode != 'raw' and prefix != encoded[row['id']][0]:
        raise ValueError('speed_actual_prompt_changed')
    trace = encoded[row['id']][1]
    tokenization_done = time.perf_counter()
    grammar = TimedProcessor(build_json_schema_logits_processor(tokenizer, row['outputSchema'])) if 'grammar' in mode else None
    grammar_done = time.perf_counter()
    processors = [grammar] if grammar else []
    forced = ScriptedTrace(trace) if mode in ('trace', 'trace_grammar') else None
    if forced:
        processors.append(forced)
    budget = CONFIG['rawTokens'] if mode == 'raw' else len(trace) if forced else min(2048, 5120 - len(prefix))
    observed, arrivals, text, final, visible_at = [], [], '', None, None
    mx.synchronize(); mx.reset_peak_memory()
    generation = None
    with prefix_observer(model, prefix, observed):
        # The raw ceiling benchmark intentionally ignores EOS for exactly128
        # tokens. It is not a complete answer or a production configuration.
        stopping = (lambda token: False) if mode == 'raw' else tokenizer.stopping_criteria
        with temporary_attribute(tokenizer, 'stopping_criteria', stopping):
            try:
                generation = stream_generate(model, processor, prompt, max_tokens=budget,
                    temperature=0, top_p=1, top_k=0, prefill_step_size=4096,
                    logits_processors=processors)
                for part in generation:
                    stamp = time.perf_counter()
                    text += part.text
                    if part.text and visible_at is None:
                        visible_at = stamp
                    if part.finish_reason is None and part.token is not None:
                        arrivals.append(stamp)
                    if part.finish_reason is not None:
                        final, terminal_at = part, stamp
                    if stamp - started > CONFIG['perResponseCheckSeconds']:
                        raise TimeoutError('speed_response_exceeded_between_yields')
            finally:
                if generation is not None:
                    generation.close()
    iteration_done = time.perf_counter()
    if final is None or not observed:
        raise ValueError('speed_missing_terminal_or_actual_prefix')
    ids = list(final.token_ids or [])
    if forced and (ids != trace or final.finish_reason != 'stop'):
        raise ValueError('speed_scripted_trace_or_grammar_mismatch')
    if mode == 'raw' and (len(ids) != 128 or final.finish_reason != 'length'):
        raise ValueError('speed_raw_budget_not_completed')
    try:
        parsed = json.loads(text)
        json_parses = isinstance(parsed, dict)
    except ValueError:
        json_parses = False
    ended = time.perf_counter()
    first = arrivals[0] if arrivals else terminal_at
    decode_span = terminal_at - first
    value = {**spec, 'caseId': row['id'] if mode != 'raw' else 'raw-hardware-budget',
        'kind': 'SCRIPTED_TECHNICAL_TRACE_NOT_UNDERSTANDING' if forced else
                'RAW_FIXED_BUDGET_NOT_AN_ANSWER' if mode == 'raw' else 'FREE_GENERATION_NO_QUALITY_APPROVAL',
        'prefixTokens': len(prefix), 'prefixSha256': hashlib.sha256(json.dumps(prefix, separators=(',', ':')).encode()).hexdigest(),
        'actualModelPrefixVerified': True, 'outputTokensIncludingEos': len(ids),
        'outputTokenIds': ids, 'finishReason': final.finish_reason,
        'ttftSeconds': first - started, 'completeSeconds': ended - started,
        'firstVisibleTextSeconds': visible_at - started if visible_at is not None else None,
        'templateAndTokenizationSeconds': tokenization_done - started,
        'grammarBuildSeconds': grammar_done - tokenization_done,
        'jsonAndTraceValidationSeconds': ended - iteration_done,
        'postTerminalSeconds': ended - terminal_at,
        'decodeWallTokensPerSecond': (len(ids) - 1) / decode_span if decode_span > 0 else None,
        'libraryPromptTokensPerSecond': final.prompt_tps,
        'libraryGenerationTokensPerSecond': final.generation_tps,
        'grammarCalls': grammar.calls if grammar else 0,
        'grammarCallWallSecondsIncludingSync': grammar.seconds if grammar else 0,
        'jsonParses': json_parses, 'text': text, 'peakAllocatorBytes': mx.get_peak_memory(),
        'wiredLimitBytes': 24 * 1024**3,
        'scriptedReadoutHasDeliberateEvaluationBarrier': forced is not None,
        'productionActivation': False, 'understandingOrHostAcceptanceProven': False}
    write(output, value)
    gc.collect(); mx.clear_cache()
    return value


def summarize(rows):
    result = {}
    for mode in ('raw', 'trace', 'trace_grammar', 'actual_grammar'):
        samples = [r for r in rows if r['mode'] == mode and not r['warmup']]
        qualified = [r for r in samples if mode != 'actual_grammar' or r['finishReason'] == 'stop' and r['jsonParses']]
        result[mode] = {'attempts': len(samples), 'qualified': len(qualified)}
        for metric in ('ttftSeconds', 'completeSeconds', 'decodeWallTokensPerSecond'):
            values = [r[metric] for r in qualified if r[metric] is not None]
            result[mode][metric] = {'min': min(values), 'median': statistics.median(values), 'max': max(values)} if values else None
    return result


def run(model, processor, payload, encoded, plan, session, prefix_observer):
    import numpy as np
    from mlx.utils import tree_flatten
    from mlx_vlm.generate import dispatch
    model.eval()
    def factors():
        return {k: hashlib.sha256(np.asarray(a).tobytes()).hexdigest() for k, a in tree_flatten(model.parameters())
                if k.endswith(('.lora_a', '.lora_b'))}
    before = factors()
    if len(before) != 64:
        raise ValueError('speed_expected64_adapter_factors')
    rows, cases = [], [payload['evaluation'][i] for i in CONFIG['evaluationIndices']]
    preflight = json.loads(Path(plan['files']['speed-trace-preflight']['path']).read_text())
    expected = {r['id']: hashlib.sha256(json.dumps(encoded[r['id']][1], separators=(',', ':')).encode()).hexdigest() for r in cases}
    if preflight.get('status') != 'PASS' or {r['id']: r['traceSha256'] for r in preflight['cases']} != expected:
        raise ValueError('speed_trace_preflight_not_matching')
    with temporary_attribute(dispatch, 'wired_limit', bounded_wired):
        for index, spec in enumerate(roster()):
            write(session / f'pending-{index:02d}.json', {**spec, 'atEpoch': time.time()})
            result = request(model, processor, cases[spec['case']], encoded, spec,
                             session / f'request-{index:02d}.json', prefix_observer)
            rows.append(result)
            print(json.dumps({'request': index, 'mode': spec['mode'], 'seconds': result['completeSeconds'],
                              'ttft': result['ttftSeconds'], 'tokens': result['outputTokensIncludingEos']}), flush=True)
    if factors() != before:
        raise ValueError('speed_adapter_weights_changed')
    write(session/'result.json', {'status': 'SPEED_PROFILE_FINISHED_REQUIRES_REVIEW',
        'requests': len(rows), 'summary': summarize(rows), 'adapterHashesUnchanged': True,
        'modelWeightsChanged': False, 'optimizerUpdates': 0, 'productionActivation': False,
        'fullDecisionLatencyOrQualityProven': False})
