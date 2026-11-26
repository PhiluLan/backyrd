"""Singleton CUDA migration-speed probe. Inference only; no production endpoint.

Uses frozen token IDs rather than a server-rendered chat template. Cold and
cross-query primed requests share one server configuration. Primers,
actual answers and SSH-tunnel timings remain separate evidence.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

MODEL = 'Qwen/Qwen3.5-9B'
REVISION = 'c202236235762e1c871ad0ccb60c8ee5ba337b9a'
REMOTE = '/workspace/backyrd-cloud-speed'


def write(path, value):
    with Path(path).open('x') as f:
        json.dump(value, f, ensure_ascii=False, indent=2, allow_nan=False)
        f.write('\n'); f.flush(); os.fsync(f.fileno())


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(4*1024**2), b''): h.update(block)
    return h.hexdigest()


def roster():
    rows = [{'mode':'actual','case':0,'condition':'cold','warmup':True,'repeat':0}]
    for case in range(3):
        for repeat in range(1,3):
            order = ('cold','cached') if repeat % 2 else ('cached','cold')
            rows += [{'mode':'actual','case':case,'condition':c,'warmup':False,'repeat':repeat} for c in order]
    return rows


def body(case):
    ids = case['prefixIds']
    return {'model':'zero9b','prompt':ids,'max_tokens':min(2048,5120-len(ids)),
        'temperature':0,'top_p':1,'top_k':0,'seed':7,'stream':True,'add_special_tokens':False,
        'stream_options':{'include_usage':True},'return_token_ids':True,
        'stop_token_ids':[case['eosTokenId']],'skip_special_tokens':True,
        'structured_outputs':{'json':case['outputSchema']}}


def parse_stream(lines, clock=time.perf_counter):
    ids, stamps, text, final, usage, prompt_ids = [], [], '', None, None, None
    models=set()
    visible, metrics, done = None, None, False
    for line in lines:
        stamp = clock()
        if not line.startswith(b'data:'): continue
        data = line[5:].strip()
        if data == b'[DONE]': done=True; break
        packet = json.loads(data)
        if packet.get('model') is not None:models.add(packet['model'])
        if 'error' in packet: raise ValueError('cloud_speed_server_stream_error')
        if packet.get('usage') is not None: usage=packet['usage']
        if packet.get('metrics') is not None: metrics=packet['metrics']
        for choice in packet.get('choices',[]):
            if choice.get('index') != 0: raise ValueError('cloud_speed_non_singleton')
            emitted = choice.get('token_ids') or []
            if emitted:
                ids.extend(emitted); stamps.extend([stamp]*len(emitted))
            if choice.get('prompt_token_ids') is not None: prompt_ids=choice['prompt_token_ids']
            chunk = choice.get('text') or ''
            text += chunk
            if chunk and visible is None: visible=stamp
            if choice.get('finish_reason') is not None: final=(choice['finish_reason'],stamp,choice.get('stop_reason'))
    if not done or not final or not usage or not ids: raise ValueError('cloud_speed_incomplete_stream_receipt')
    return {'ids':ids,'arrivals':stamps,'text':text,'terminal':final,'usage':usage,
            'promptIds':prompt_ids,'models':sorted(models),'firstVisibleAt':visible,'serverMetrics':metrics}


def request(url, case, spec, output):
    data=body(case)
    if spec.get('mode')=='primer':
        data.pop('structured_outputs',None); data['max_tokens']=1
    started=time.perf_counter()
    req=urllib.request.Request(url+'/v1/completions', data=json.dumps(data).encode(),
        headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=120) as response:
        parsed=parse_stream(response)
    end_stream=time.perf_counter()
    expected=data['prompt']
    if parsed['promptIds'] != expected or parsed['usage']['prompt_tokens'] != len(expected) or parsed['models']!=['zero9b']:
        raise ValueError('cloud_speed_observed_prompt_changed')
    finish,terminal,stop=parsed['terminal']
    count=parsed['usage']['completion_tokens']
    if len(parsed['ids']) not in (count,count-1): raise ValueError('cloud_speed_output_token_accounting_invalid')
    try:
        obj=json.loads(parsed['text']); json_valid=isinstance(obj,dict)
    except ValueError:
        obj=None;json_valid=False
    schema_valid=None; schema_error=None
    if spec.get('mode')=='actual' and json_valid:
        from jsonschema import Draft202012Validator
        errors=list(Draft202012Validator(case['outputSchema']).iter_errors(obj))
        schema_valid=not errors
        if errors: schema_error=errors[0].validator
    ended=time.perf_counter(); first=parsed['arrivals'][0]; last=parsed['arrivals'][-1]
    cached=parsed['usage'].get('prompt_tokens_details',{}).get('cached_tokens')
    record={**spec,'caseId':case['id'],
        'servedModels':parsed['models'],'representation':'ORIGINAL_HF_BF16_NOT_MAC_AFFINE4BIT','promptIdsVerified':True,
        'prefixTokens':len(expected),'prefixSha256':hashlib.sha256(json.dumps(expected,separators=(',',':')).encode()).hexdigest(),
        'outputTokenIds':parsed['ids'],'outputTokensIncludingTerminalIfCountedByServer':count,
        'returnedTokenIdCount':len(parsed['ids']),'terminalTokenIdOmittedByApi':len(parsed['ids'])==count-1,
        'finishReason':finish,'stopReason':stop,'jsonParses':json_valid,'jsonSchemaValid':schema_valid,
        'schemaErrorValidator':schema_error,'text':parsed['text'],'usage':parsed['usage'],'cachedTokens':cached,
        'ttftSeconds':first-started,'firstVisibleTextSeconds':parsed['firstVisibleAt']-started if parsed['firstVisibleAt'] else None,
        'completeSeconds':ended-started,'streamExhaustedSeconds':end_stream-started,
        'decodeObservedTokensPerSecond':(len(parsed['ids'])-1)/(last-first) if last>first else None,
        'decodeIncludesStreamCoalescing':True,'serverMetrics':parsed['serverMetrics'],
        'hostSemanticOrSearchAcceptanceProven':False,'productionActivation':False,'optimizerUpdates':0}
    write(output,record)
    return record


def reset(url):
    req=urllib.request.Request(url+'/reset_prefix_cache',method='POST')
    with urllib.request.urlopen(req,timeout=30) as response:
        value=response.read()
    result=json.loads(value)
    if not isinstance(result,dict) or result.get('success') is not True:
        raise ValueError('cloud_speed_reset_not_confirmed')


def ensure_guard(root):
    authority=json.loads((root/'authority.json').read_text())
    heartbeat=json.loads(Path('/tmp/backyrd-guard.ready').read_text())
    if (Path('/tmp/backyrd-guard.failed').exists() or heartbeat['podId']!=authority['podId']
            or time.time()-heartbeat['heartbeat']>60 or time.time()>=authority['deadline']):
        raise ValueError('cloud_speed_budget_guard_not_healthy')


def run(root):
    ensure_guard(root)
    if os.getpgrp()!=os.getpid():raise ValueError('cloud_speed_dedicated_process_group_required')
    authority=json.loads((root/'authority.json').read_text())
    write('/tmp/backyrd-speed-owned.json',{'kind':'BACKYRD_CLOUD_SPEED_OWNED_GROUP_V1','podId':authority['podId'],
        'root':str(root),'processGroup':os.getpgrp()})
    plan=json.loads((root/'inputs.json').read_text())
    if plan['optimizerAllowed'] is not False or plan['productionActivation'] is not False or plan['roster']!=roster():
        raise ValueError('cloud_speed_scope_changed')
    for name,digest in plan['files'].items():
        if sha(root/name)!=digest: raise ValueError('cloud_speed_uploaded_file_changed:'+name)
    from transformers import AutoTokenizer
    tokenizer=AutoTokenizer.from_pretrained(root/'tokenizer',local_files_only=True)
    for case in plan['cases']:
        actual=tokenizer.encode(tokenizer.apply_chat_template(case['messages'],tokenize=False,
            add_generation_prompt=True,enable_thinking=False),add_special_tokens=False)
        if actual!=case['prefixIds']: raise ValueError('cloud_speed_tokenizer_or_template_changed')
    versions={name:importlib.metadata.version(name) for name in ['vllm','torch','transformers','tokenizers','xgrammar']}
    if versions['vllm']!='0.34.0': raise ValueError('cloud_speed_runtime_version_changed')
    hardware=subprocess.check_output(['nvidia-smi','--query-gpu=name,memory.total,driver_version','--format=csv,noheader'],text=True)
    gpu_rows=[line.split(',')for line in hardware.strip().splitlines()]
    if (len(gpu_rows)!=1 or gpu_rows[0][0].strip()!='NVIDIA H100 80GB HBM3'
            or not 79000<=float(gpu_rows[0][1].strip().split()[0])<=83000):
        raise ValueError('cloud_speed_gpu_type_count_or_memory_mismatch')
    write(root/'results/runtime.json',{'versions':versions,'hardware':hardware,'model':MODEL,'revision':REVISION,
        'baseDtype':'BF16','baseQuantization':None,'sourceMacBaseDtype':'MLX_AFFINE4BIT','zeroAdapterSourceFactorCount':64,
        'zeroAdapterLoraRank':16,'zeroAdapterLoraScale':2,'loraRuntimeDtype':'bfloat16','liveMacTouched':False})
    # Fixed public revision; no credentials or user data are needed for download.
    from huggingface_hub import snapshot_download
    snapshot=snapshot_download(MODEL,revision=REVISION,cache_dir=root/'hf-cache')
    ensure_guard(root)
    write(root/'results/download.json',{'model':MODEL,'revision':REVISION,'snapshot':snapshot,
        'files':{p.name:{'bytes':p.stat().st_size,'sha256':sha(p)} for p in Path(snapshot).iterdir() if p.is_file() and (p.suffix in ['.json','.safetensors'])}})
    command=['vllm','serve',snapshot,'--served-model-name','base9b','--tokenizer',str(root/'tokenizer'),
        '--dtype','bfloat16','--max-model-len','5120','--max-num-seqs','1','--max-num-batched-tokens','1024','--enable-chunked-prefill',
        '--block-size','16','--enable-prefix-caching','--enable-prompt-tokens-details','--gpu-memory-utilization','0.8',
        '--language-model-only','--enable-lora','--max-loras','1','--max-lora-rank','16','--lora-dtype','bfloat16',
        '--lora-modules','zero9b='+str(root/'adapter'),'--host','127.0.0.1','--port','8000','--seed','7',
        '--structured-outputs-config','{"backend":"xgrammar"}']
    write(root/'results/server-command.json',command)
    process=None;url='http://127.0.0.1:8000'
    try:
        with (root/'results/server.log').open('x') as log:
            process=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,
                'PYTHONPATH':str(root/'instrumentation')+os.pathsep+os.environ.get('PYTHONPATH',''),
                'BACKYRD_LORA_DIR':str(root/'results'),'VLLM_SERVER_DEV_MODE':'1'})
        while True:
            ensure_guard(root)
            if process.poll() is not None: raise ValueError('cloud_speed_server_start_failed')
            try:
                with urllib.request.urlopen(url+'/health',timeout=2) as response:
                    if response.status==200: break
            except (OSError,TimeoutError): pass
            time.sleep(2)
        with urllib.request.urlopen(url+'/v1/models',timeout=10) as response:models=json.load(response)
        if 'zero9b' not in {m['id'] for m in models['data']}: raise ValueError('cloud_speed_zero_adapter_not_loaded')
        write(root/'results/models.json',models)
        records=[]; cache_available=True
        for index,spec in enumerate(roster()):
            ensure_guard(root)
            if spec['condition']=='cached' and not cache_available:
                write(root/f'results/skipped-{index:02d}.json',{**spec,'reason':'FIRST_CROSS_QUERY_CACHE_MISS_NO_MORE_PRIMERS','modelInvoked':False})
                continue
            reset(url)
            target=plan['cases'][spec['case']]
            if spec['condition']=='cached':
                primer=plan['cases'][1 if spec['case']==0 else 0]
                request(url,primer,{'mode':'primer','case':primer['case'],'condition':'primer','warmup':True,'repeat':spec['repeat']},root/f'results/primer-{index:02d}.json')
            row=request(url,target,spec,root/f'results/request-{index:02d}.json')
            if index==0:
                proofs=[json.loads(p.read_text()) for p in (root/'results').glob('lora-load-*.json')]
                if not proofs:raise ValueError('cloud_speed_no_actual_lora_load_receipt')
                proof=proofs[0]
                expected=set(plan['adapterTargetModules'])
                if (set(proof['modules'])!=expected or proof['rank']!=16 or proof['adapterId']<=0
                        or any(v['bNonzero']!=0 or v['scaling']!=2 or v['dtype']!='torch.bfloat16'
                            or v['aShape']!=plan['adapterExpectedShapes'][name]['aShape']
                            or v['bShape']!=plan['adapterExpectedShapes'][name]['bShape']
                            for name,v in proof['modules'].items())):
                    raise ValueError('cloud_speed_loaded_adapter_coverage_not_proven')
            cached=row['cachedTokens']
            if cached is None: raise ValueError('cloud_speed_cache_accounting_missing')
            if spec['condition']=='cold' and cached!=0: raise ValueError('cloud_speed_cold_cache_not_empty')
            if spec['condition']=='cached':
                full=target['prefixIds']; other=primer['prefixIds'];common=0
                for a,b in zip(full,other):
                    if a!=b:break
                    common+=1
                if not 0<=cached<=common:raise ValueError('cloud_speed_cached_beyond_common_prefix')
                if cached==0:cache_available=False
            records.append(row)
            print(json.dumps({'request':index,**spec,'seconds':row['completeSeconds'],'ttft':row['ttftSeconds'],
                'outputTokens':row['outputTokensIncludingTerminalIfCountedByServer'],'cachedTokens':cached}),flush=True)
        write(root/'results/local-result.json',{'status':'LOCAL_MATRIX_FINISHED_REQUIRES_REVIEW',
            'requests':len(records),'plannedMaximumPrimers':6,'plannedMeasuredActual':12,'warmups':1,'cacheAvailable':cache_available,
            'cacheMisses':[i for i,r in enumerate(records) if r['condition']=='cached' and r['cachedTokens']==0],
            'optimizerUpdates':0,'productionActivation':False,'qualityOrPureHardwareSpeedupProven':False})
        (root/'LOCAL_COMPLETE').touch()
        while not (root/'NETWORK_COMPLETE').exists():
            ensure_guard(root);time.sleep(2)
        (root/'COMPLETE').touch()
    finally:
        if process and process.poll() is None:
            process.terminate()
            try:process.wait(timeout=15)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);args=parser.parse_args()
    (args.root/'results').mkdir(exist_ok=False)
    try:run(args.root)
    except BaseException as e:
        write(args.root/'results/failure.json',{'errorType':type(e).__name__,'error':str(e),'optimizerUpdates':0})
        raise
