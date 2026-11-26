"""One inference-only RunPod allocation, total authorization bounded at five USD.

Reuses the beta controller's REST quota ledger, ownership, independent local
and own-Pod guards, SSH transport and deletion verification. No training entry.
"""
from pathlib import Path
import base64
import hashlib
import importlib.util
import io
import json
import math
import os
import shlex
import subprocess
import sys
import tarfile
import time
import urllib.error
import uuid

POLICY='COST_ONLY_SPEED_5_USD'
IMAGE='vllm/vllm-openai@sha256:20fdb089454afbb324efa4110a2c025ff7b27cc1a086e07aa580b18df8ad1ce1'
REMOTE='/workspace/backyrd-cloud-speed'


def load_module(path):
    spec=importlib.util.spec_from_file_location('cloud_speed_worker',path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value


def deadline(started,rate,prior=0):
    if isinstance(started,bool) or not isinstance(started,(int,float)) or not math.isfinite(started) or started<0:
        raise ValueError('speed_started_time_invalid')
    if isinstance(rate,bool) or not isinstance(rate,(int,float)) or not math.isfinite(rate) or not 0<rate<=4.5:
        raise ValueError('speed_compute_and_storage_rate_invalid')
    if isinstance(prior,bool)or not isinstance(prior,(int,float))or not math.isfinite(prior)or not 0<=prior<4:
        raise ValueError('speed_prior_cost_invalid')
    return started+(4-prior)/rate*3600  # 5 USD ceiling, 1 USD cleanup/billing reserve.


def verify(plan_path,beta):
    plan=json.loads(plan_path.read_text())
    if (plan.get('kind')!='CLOUD_9B_MIGRATION_SPEED_5_USD_V1' or plan.get('totalCeilingUsd')!=5
            or plan.get('reserveUsd')!=1 or plan.get('executionAuthorized') is not True
            or plan.get('optimizerAllowed') is not False or plan.get('productionActivation') is not False
            or plan.get('image')!=IMAGE or plan.get('gpu')!='NVIDIA H100 80GB HBM3'
            or plan.get('containerDiskGb')!=120 or plan.get('persistentVolumeGb')!=0
            or plan.get('autoPay') is not False):
        raise ValueError('cloud_speed_authority_invalid')
    for entry in plan['files'].values():
        if beta.digest(Path(entry['path']).read_bytes())!=entry['sha256']:
            raise ValueError('cloud_speed_bound_file_changed')
    worker=load_module(Path(__file__).with_name('nuknuk-cloud-speed-worker.py'))
    inputs=json.loads(Path(plan['inputs']).read_text())
    if (inputs['roster']!=worker.roster() or len(inputs['cases'])!=3
            or inputs['optimizerAllowed'] is not False or inputs['productionActivation'] is not False
            or [len(c['prefixIds']) for c in inputs['cases']]!=[3988,3999,3991]):
        raise ValueError('cloud_speed_input_scope_invalid')
    prior_cost(plan)
    return plan,worker


def prior_cost(plan):
    receipts=plan.get('priorAttempts',[]);cost=0;seen=set()
    for entry in receipts:
        path=Path(entry['stateFile']);raw=path.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=entry['stateSha256']:raise ValueError('speed_prior_state_changed')
        state=json.loads(raw)
        if (state.get('resourcesRemoved')is not True or state.get('phase')!='REMOVED'
                or state.get('limitPolicy')!=POLICY or state.get('totalCeilingUsd')!=5
                or state.get('initialBalanceUsd')!=plan.get('campaignInitialCreditUsd')
                or state['podId']in seen):raise ValueError('speed_prior_attempt_not_secured')
        seen.add(state['podId'])
        cost+=max(state.get('finalObservedDebitUsd',0),max(0,state['heartbeat']-state['started'])*state['allInHourlyRateUsd']/3600)
    prior=plan.get('priorConservativeUsd',0)
    deadline(0,1,prior)
    if prior<cost:raise ValueError('speed_prior_cost_reset_refused')
    if prior and not receipts:raise ValueError('speed_prior_receipt_required')
    return prior


def launch_code(root):
    # All child descriptors are disconnected from SSH; the worker itself leads
    # the new process group, rather than a shell wrapper that outlives the call.
    return ("import subprocess,pathlib;root=pathlib.Path("+repr(str(root))+");"
        "log=(root/'worker.log').open('xb');p=subprocess.Popen(['python3','-B','-u',str(root/'worker.py'),'--root',str(root)],"
        "cwd=root,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);print(p.pid,flush=True)")


def package(plan):
    buffer=io.BytesIO()
    with tarfile.open(fileobj=buffer,mode='w:gz') as tar:
        for name,entry in plan['upload'].items():
            if Path(name).is_absolute() or '..' in Path(name).parts: raise ValueError('cloud_speed_upload_path_invalid')
            data=Path(entry['path']).read_bytes()
            if hashlib.sha256(data).hexdigest()!=entry['sha256']:raise ValueError('cloud_speed_upload_changed')
            info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o600;tar.addfile(info,io.BytesIO(data))
    return buffer.getvalue()


def sync(beta,ssh,folder,label):
    raw=beta.ssh_call(ssh,'tar -czf - -C '+REMOTE+' results worker.log',60)
    target=folder/label;target.mkdir(exist_ok=False)
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz')as tar:
        for entry in tar.getmembers():
            if not entry.isfile() and not entry.isdir():raise ValueError('cloud_speed_result_archive_type_invalid')
            if Path(entry.name).is_absolute() or '..' in Path(entry.name).parts:raise ValueError('cloud_speed_result_archive_path_invalid')
        tar.extractall(target,filter='data')
    return target


def run(args,beta):
    plan,worker=verify(args.speed_plan,beta)
    folder=args.operation
    if folder.exists():raise ValueError('cloud_speed_attempt_already_exists')
    bundle=package(plan)
    billing,account=beta.catalog_account(args)
    beta.catalog_validate_idle(billing,account,required_credit=5)
    if hashlib.sha256(args.public_key.read_bytes()).hexdigest()!=plan['sshPublicKeySha256']:
        raise ValueError('cloud_speed_ssh_identity_changed')
    quote_rows=beta.rest(args.key_file,'GET','/v2/catalog/gpus?include=AVAILABILITY&product=POD&cloud=SECURE&count=1')
    rows=quote_rows if isinstance(quote_rows,list)else quote_rows['gpus']
    choices=[r for r in rows if r['id']==plan['gpu'] and r.get('secure') and r.get('availability')in ['LOW','MEDIUM','HIGH']
             and isinstance(r.get('price',{}).get('secure'),(int,float)) and 0<r['price']['secure']<=4.39]
    if len(choices)!=1:raise ValueError('cloud_speed_h100_not_available_at_price_cap_no_allocation')
    compute=float(choices[0]['price']['secure']);cap=compute+.03
    storage=120*.1/672;rate=cap+storage
    folder.mkdir(mode=0o700)
    worker.write(folder/'authorization.json',plan)
    prior=max(prior_cost(plan),plan.get('campaignInitialCreditUsd',billing['balanceAmount'])-billing['balanceAmount'])
    campaign_credit=plan.get('campaignInitialCreditUsd',billing['balanceAmount'])
    start=time.time();end=deadline(start,rate,prior);name='backyrd-speed9b-'+uuid.uuid4().hex[:12]
    state=beta.save(folder,'PREPARED',limitPolicy=POLICY,runName=name,podId=None,started=start,deadline=end,
        initialBalanceUsd=campaign_credit,balanceAtAllocationUsd=billing['balanceAmount'],priorConservativeUsd=prior,preexistingPodIds=[p['id']for p in account['pods']],
        allInHourlyRateUsd=rate,computeRateCap=cap,totalCeilingUsd=5,reserveUsd=1,resourcesRemoved=False,
        optimizerUpdates=0,productionActivation=False)
    worker.write(folder/'quote.json',{'gpu':choices[0],'allInHourlyRateUsd':rate,'storageHourlyUsd':storage,
        'costDerivedDeadline':end,'noIndependentTimeLimit':True,'totalCeilingUsd':5,'reserveUsd':1,'priorConservativeUsd':prior,'image':IMAGE})
    # The own-Pod guard is armed before network package installation or SSH.
    boot="python3 -u -c \"import os,base64;exec(base64.b64decode(os.environ['BACKYRD_GUARD']))\" > /tmp/backyrd-guard.log 2>&1 & "
    boot+="if ! command -v sshd >/dev/null 2>&1; then apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openssh-server; fi; "
    boot+="mkdir -p /root/.ssh /run/sshd; chmod 700 /root/.ssh; printf '%s\\n' \"$PUBLIC_KEY\" > /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys; ssh-keygen -A; /usr/sbin/sshd; exec sleep infinity"
    request={'name':name,'cloud':'SECURE','gpu':{'id':plan['gpu'],'count':1,'minRamPerGpu':96,'minVcpuCountPerGpu':8,'minCudaVersion':'13.0'},
        'image':IMAGE,'disk':120,'mounts':{},'startSsh':True,'ports':['22/tcp'],'entrypoint':['/bin/bash','-lc'],'cmd':[boot],
        'env':{'PUBLIC_KEY':args.public_key.read_text().strip(),'BACKYRD_GUARD':base64.b64encode(beta.NATIVE_GUARD.encode()).decode(),
               'BACKYRD_DEADLINE':str(end),'BACKYRD_COMPUTE_CAP':str(cap),'BACKYRD_STOP_LEAD_SECONDS':'0','BACKYRD_PROVIDER_API':'REST_V2',
               'BACKYRD_SPEED_GROUP_FILE':'/tmp/backyrd-speed-owned.json','HF_HUB_DISABLE_TELEMETRY':'1','VLLM_NO_USAGE_STATS':'1','TOKENIZERS_PARALLELISM':'false','PYTHONDONTWRITEBYTECODE':'1'}}
    guard=None;ssh=None;rate_sync=None;tunnel=None;created=False;intent=False;failure=None
    beta.PY='python3'  # Official vLLM image; only this controller's SSH sync uses it.
    try:
        with (folder/'guard.log').open('x')as log:
            guard=subprocess.Popen([sys.executable,'-B',str(Path(__file__).with_name('nuknuk-beta-run.py')),'guard',
                '--operation',str(folder),'--key-file',str(args.key_file)],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        for _ in range(50):
            if (folder/'guard.ready').exists():break
            if guard.poll() is not None:raise ValueError('cloud_speed_local_guard_failed')
            time.sleep(.1)
        if not (folder/'guard.ready').exists():raise ValueError('cloud_speed_local_guard_not_armed')
        beta.catalog_attempt_event(folder,'CREATE_INTENT',runName=name)
        beta.save(folder,'CREATING');intent=True
        response=beta.rest(args.key_file,'POST','/v2/pods',request);pod=response.get('pod',response);pid=pod['id']
        beta.catalog_attempt_event(folder,'POD_ACKNOWLEDGED',runName=name,podId=pid)
        beta.save(folder,'ALLOCATED',podId=pid);created=True
        while True:
            beta.save(folder,'WAITING_FOR_SSH')
            if time.time()>=end:raise ValueError('cloud_speed_cost_deadline_startup')
            detail=beta.rest(args.key_file,'GET','/v2/pods/'+pid);record=beta.catalog_pod_record(detail)
            if (detail.get('image')!=IMAGE or detail.get('disk')!=120 or detail.get('mounts')not in ({},None)
                    or record['volumeInGb']!=0 or record['id']!=pid or record['name']!=name
                    or not 0<record['costPerHr']<=cap or detail.get('locked')is True):
                raise ValueError('cloud_speed_assigned_pod_identity_price_or_storage_changed')
            ports=[p for p in (record.get('runtime')or{}).get('ports',[])if p['isIpPublic']and p['privatePort']==22 and p['type']=='tcp']
            if len(ports)==1:
                import ipaddress
                port=ports[0];host=str(ipaddress.ip_address(port['ip']))
                ssh=['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ConnectTimeout=5','-o','StrictHostKeyChecking=accept-new',
                    '-o','UserKnownHostsFile='+str(folder/'known_hosts'),'-i',str(args.private_key),'-p',str(int(port['publicPort'])),'root@'+host]
                try:
                    ready=json.loads(beta.ssh_call(ssh,'cat /tmp/backyrd-guard.ready',10))
                    if ready['podId']==pid and ready['deadline']==end and 0<=time.time()-ready['heartbeat']<45:break
                except (RuntimeError,subprocess.TimeoutExpired,json.JSONDecodeError,KeyError):pass
            time.sleep(5)
        rate_sync=beta.CatalogRateSync(args,ssh)
        beta.save(folder,'UPLOADING')
        beta.ssh_call(ssh,'mkdir -p '+REMOTE,15)
        beta.ssh_call(ssh,'cat > '+REMOTE+'/input.tgz',60,bundle)
        unpack="import pathlib,hashlib,tarfile;p=pathlib.Path('"+REMOTE+"/input.tgz');assert hashlib.sha256(p.read_bytes()).hexdigest()=='"+hashlib.sha256(bundle).hexdigest()+"';tarfile.open(p).extractall('"+REMOTE+"',filter='data')"
        beta.ssh_call(ssh,'python3 -c '+shlex.quote(unpack),30)
        authority={'podId':pid,'deadline':end,'totalCeilingUsd':5,'optimizerAllowed':False,'productionActivation':False}
        beta.ssh_call(ssh,'cat > '+REMOTE+'/authority.json',15,json.dumps(authority).encode())
        worker_pid=int(beta.ssh_call(ssh,'python3 -c '+shlex.quote(launch_code(REMOTE)),30))
        beta.save(folder,'WORKER_STARTED',remoteWorkerPid=worker_pid)
        worker.write(folder/'ssh-transport.json',{'host':host,'port':port['publicPort'],'serverApiPubliclyExposed':False})
        beta.save(folder,'BENCHMARK')
        while True:
            if time.time()>=end or rate_sync.error or time.time()-rate_sync.lastSuccessful>45:
                raise ValueError('cloud_speed_budget_or_quota_sync_expired')
            beta.save(folder,'BENCHMARK')
            status=beta.ssh_call(ssh,'if test -f '+REMOTE+'/LOCAL_COMPLETE; then echo READY; elif test -f '+REMOTE+'/results/failure.json; then echo FAILED; else echo RUNNING; fi',15).decode().strip()
            if status=='FAILED':raise ValueError('cloud_speed_remote_worker_failed')
            if status=='READY':break
            time.sleep(5)
        sync(beta,ssh,folder,'local-secured')
        with (folder/'tunnel.log').open('x')as log:
            tunnel=subprocess.Popen([*ssh[:-1],'-o','ExitOnForwardFailure=yes','-N','-L','127.0.0.1:18089:127.0.0.1:8000',ssh[-1]],stdout=log,stderr=subprocess.STDOUT)
        for _ in range(50):
            if tunnel.poll() is not None:raise ValueError('cloud_speed_tunnel_failed')
            try:
                import urllib.request
                with urllib.request.urlopen('http://127.0.0.1:18089/health',timeout=2)as response:
                    if response.status==200:break
            except OSError:time.sleep(.2)
        network=folder/'network';network.mkdir()
        inputs=json.loads(Path(plan['inputs']).read_text())
        for case in inputs['cases']:
            if time.time()>=end:raise ValueError('cloud_speed_network_cost_deadline')
            worker.reset('http://127.0.0.1:18089')
            network_row=worker.request('http://127.0.0.1:18089',case,{'mode':'actual','case':case['case'],'condition':'cold',
                'warmup':False,'repeat':1,'transport':'MAC_SSH_TUNNEL_NETWORK_LATENCY'},network/(str(case['case'])+'.json'))
            if network_row['cachedTokens']!=0:raise ValueError('cloud_speed_network_cold_not_empty')
        beta.ssh_call(ssh,'touch '+REMOTE+'/NETWORK_COMPLETE',10)
        target=sync(beta,ssh,folder,'final-secured')
        beta.save(folder,'RESULTS_SECURED',results=str(target),networkResults=str(network))
    except BaseException as error:
        failure=type(error).__name__+':'+str(error);beta.save(folder,'FAILED',failure=failure)
        if ssh is not None:
            try:sync(beta,ssh,folder,'failure-secured')
            except Exception:pass
        raise
    finally:
        if tunnel and tunnel.poll() is None:tunnel.terminate()
        if rate_sync:rate_sync.close()
        if intent:
            if not created:
                discovered=None
                for _ in range(6):
                    discovered=beta.owned(folder,args.key_file)
                    if discovered:break
                    time.sleep(5)
                if discovered:
                    beta.save(folder,'LATE_ALLOCATION_DISCOVERED',podId=discovered['id'])
                    beta.catalog_attempt_event(folder,'POD_DISCOVERED',runName=name,podId=discovered['id']);created=True
                else:
                    beta.save(folder,'ALLOCATION_UNCONFIRMED',stopWhenDiscovered=True,resourcesRemoved=False)
                    raise RuntimeError('cloud_speed_create_unconfirmed_guard_retained_no_retry')
            beta.catalog_cleanup(args,folder)
            final=beta.rest(args.key_file,'GET','/v2/billing/balance',cleanup=True)
            beta.save(folder,'REMOVED',resourcesRemoved=True,finalBalanceUsd=final['balanceAmount'],
                finalObservedDebitUsd=max(0,campaign_credit-final['balanceAmount']),
                observedAttemptDebitUsd=max(0,billing['balanceAmount']-final['balanceAmount']),
                conservativeTotalCostUsd=prior+max(0,time.time()-start)*rate/3600,failure=failure)
        else:beta.save(folder,'NO_ALLOCATION',resourcesRemoved=True)
        if guard and guard.poll() is None:guard.terminate()
    return json.loads((folder/'state.json').read_text())


def prepare_inputs(model_dir,adapter_dir,payload_path,tokenization_path,bundle_dir):
    """CPU-only exact64-factor transpose and frozen tokenizer/case export."""
    import numpy as np
    import shutil
    from safetensors.numpy import load_file,save_file
    from transformers import AutoTokenizer
    bundle_dir.mkdir(exist_ok=False)
    adapter_out=bundle_dir/'adapter';adapter_out.mkdir()
    source_config=json.loads((adapter_dir/'adapter_config.json').read_text())
    targets=[f'language_model.model.layers.{i}.self_attn.{p}_proj' for i in range(3,32,4)for p in ('q','k','v','o')]
    parameters=source_config['lora_parameters']
    if parameters!={'rank':16,'scale':2.0,'dropout':0.0,'keys':sorted(targets)}:
        raise ValueError('cloud_speed_original_adapter_config_invalid')
    original=load_file(str(adapter_dir/'adapters.safetensors'))
    if set(original)!={name+suffix for name in targets for suffix in ('.lora_a','.lora_b')}:
        raise ValueError('cloud_speed_original64_factor_coverage_invalid')
    exported={};mapping={}
    for key,value in original.items():
        if value.dtype!=np.float32 or (key.endswith('.lora_b') and np.count_nonzero(value)!=0):
            raise ValueError('cloud_speed_seed_is_not_original_f32_zero_delta')
        module,suffix=key.rsplit('.',1)
        out={'q_proj':8192,'k_proj':1024,'v_proj':1024,'o_proj':4096}[module.rsplit('.',1)[1]]
        expected=(4096,16)if suffix=='lora_a'else(16,out)
        if value.shape!=expected or not np.isfinite(value).all():raise ValueError('cloud_speed_factor_shape_or_finiteness_invalid')
        hf=module.replace('language_model.model.','model.language_model.',1)
        name='base_model.model.'+hf+('.lora_A.weight'if suffix=='lora_a'else'.lora_B.weight')
        exported[name]=np.ascontiguousarray(value.T);mapping[key]=name
    save_file(exported,str(adapter_out/'adapter_model.safetensors'),metadata={'format':'pt'})
    actual=load_file(str(adapter_out/'adapter_model.safetensors'))
    if set(actual)!=set(exported)or any(not np.array_equal(original[k],actual[v].T)for k,v in mapping.items()):
        raise ValueError('cloud_speed_adapter_transpose_roundtrip_failed')
    config={'base_model_name_or_path':'Qwen/Qwen3.5-9B','peft_type':'LORA','task_type':'CAUSAL_LM','r':16,
        'lora_alpha':32,'lora_dropout':0,'bias':'none','inference_mode':True,'use_rslora':False,'use_dora':False,
        'target_modules':[name.replace('language_model.model.','model.language_model.',1)for name in targets]}
    worker=load_module(Path(__file__).with_name('nuknuk-cloud-speed-worker.py'))
    worker.write(adapter_out/'adapter_config.json',config)
    tokenizer_dir=bundle_dir/'tokenizer';tokenizer_dir.mkdir()
    for name in ['tokenizer.json','tokenizer_config.json','chat_template.jinja','vocab.json','merges.txt','added_tokens.json','special_tokens_map.json']:
        if (model_dir/name).exists():shutil.copyfile(model_dir/name,tokenizer_dir/name)
    tokenizer=AutoTokenizer.from_pretrained(tokenizer_dir,local_files_only=True)
    payload=json.loads(payload_path.read_text());frozen=json.loads(tokenization_path.read_text())['cases'];cases=[]
    for case,index in enumerate((0,12,32)):
        row=payload['evaluation'][index]
        ids=tokenizer.encode(tokenizer.apply_chat_template(row['messages'],tokenize=False,
            add_generation_prompt=True,enable_thinking=False),add_special_tokens=False)
        if hashlib.sha256(json.dumps(ids,separators=(',',':')).encode()).hexdigest()!=frozen[row['id']]['prefixSha256']:
            raise ValueError('cloud_speed_exported_prompt_ids_differ_from_mac')
        cases.append({'case':case,'id':row['id'],'messages':row['messages'],'prefixIds':ids,
            'eosTokenId':tokenizer.eos_token_id,'outputSchema':row['outputSchema']})
    shutil.copyfile(Path(__file__).with_name('nuknuk-cloud-speed-worker.py'),bundle_dir/'worker.py')
    instrumentation=bundle_dir/'instrumentation';instrumentation.mkdir()
    shutil.copyfile(Path(__file__).with_name('nuknuk-cloud-lora-observer.py'),instrumentation/'sitecustomize.py')
    sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
    inputs={'optimizerAllowed':False,'productionActivation':False,'roster':worker.roster(),'cases':cases,
        'adapterTargetModules':targets,'adapterExpectedShapes':{name:{'aShape':list(original[name+'.lora_a'].T.shape),'bShape':list(original[name+'.lora_b'].T.shape)}for name in targets},'firstCrossQueryCacheMissPolicy':'KEEP_MISS_SKIP_REMAINING_CACHED_SLOTS_CONTINUE_FROZEN_COLD_AND_NETWORK',
        'files':{str(p.relative_to(bundle_dir)):sha(p) for p in bundle_dir.rglob('*')if p.is_file()}}
    worker.write(bundle_dir/'inputs.json',inputs)
    worker.write(bundle_dir.parent/'cpu-preflight.json',{'status':'PASS','modelWeightsLoaded':False,
        'factors':64,'modules':32,'allFactorTransposesRoundTripExactly':True,'allBFactorsZero':True,
        'mapping':mapping,'prefixLengths':[len(c['prefixIds'])for c in cases],
        'files':{str(p.relative_to(bundle_dir)):sha(p)for p in bundle_dir.rglob('*')if p.is_file()}})
    return inputs
