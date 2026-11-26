"""Bounded, isolated parent/child inference; always restore the original live agent.

No cloud allocation, public candidate endpoint or production writes. Invoke only
for a founder-authorized maintenance window after the GPU has been removed.
"""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import select
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

REPO=Path(__file__).resolve().parents[2]
LABEL='com.backyrd.nuknuk-personal'
PLIST=Path.home()/'Library/LaunchAgents'/ (LABEL+'.plist')
PLIST_SHA='779dbc8ea4f9a242e034f44de2fb7a73df0ca0aff56c2f908214dd9bdf939ae9'
LIVE_SHA='ade9ce9b2b73f56188af73e42870ba953a5f04f08dfc0ad78032a24811ad3740'
PARENT_SHA='357bb0012040f891fec45a803072259d5421c3fcb81ebf27d1528bc4bb5f1e66'
DATASET='ac05107ab0734e19005477b5d0ce17b9859ab310eb5b6a559917d55c4cb4b811'
SERVICE=f'gui/{os.getuid()}/{LABEL}'
GUARD=REPO/'scripts/decision-diagnostics/nuknuk-resource-guard.py'
RUNNER=REPO/'scripts/decision-diagnostics/nuknuk-german-diagnostics.mjs'
DOMAIN_FILE=Path('/Users/philippjohanna/dev/backyrd/.worktrees/decision-required-evidence/.local/nuknuk-understanding/qwen36-35b-birthday-dialogue/app-personal-live/ngrok-domain')

def sha(path):
    h=hashlib.sha256()
    with path.open('rb')as f:
        for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk)
    return h.hexdigest()
def read(path):return json.loads(path.read_text())
def put(root,name,value):
    target=root/name;temp=target.with_suffix(target.suffix+'.tmp')
    temp.write_text(json.dumps(value,indent=2)+'\n');temp.chmod(0o600);temp.replace(target)
def event(root,name,**details):
    value={'at':time.time(),'event':name,**details}
    with (root/'events.jsonl').open('a')as f:f.write(json.dumps(value)+'\n')
    print(json.dumps(value),flush=True)
def health(port):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/health',timeout=2)as r:return json.load(r)
    except (OSError,ValueError):return {}
def identity(port,model):
    h=health(port);return h.get('status')=='healthy'and h.get('loaded_model')==model['model']and h.get('loaded_adapter')==model['adapter']
def agent(*args):return subprocess.run(['launchctl',*args],capture_output=True,timeout=30)
def guard_free():
    fd=os.open(Path(tempfile.gettempdir())/f'backyrd-nuknuk-{os.getuid()}.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);return True
        except BlockingIOError:return False
    finally:os.close(fd)
def wait_until(predicate,seconds,label):
    until=time.monotonic()+seconds
    while not predicate():
        if time.monotonic()>until:raise TimeoutError(label)
        time.sleep(1)
def stop_owned(root):
    record=root/'owned-guard.json'
    if not record.exists():return
    item=read(record);pid=item['pid']
    command=subprocess.run(['/bin/ps','-p',str(pid),'-o','command='],capture_output=True,text=True).stdout
    # A stale/reused PID cannot authorize terminating an unrelated process.
    if str(GUARD)not in command or item['receipt']not in command:return
    Path(item['receipt']).with_suffix('.stop').touch()
    try:os.kill(pid,signal.SIGTERM)
    except ProcessLookupError:pass
    wait_until(lambda:guard_free()and not health(8089),45,'owned_model_did_not_release_guard')
def http_status(url):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*_args,**_kw):return None
    try:
        with urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url,method='POST'),timeout=5)as r:return r.status
    except urllib.error.HTTPError as e:return e.code
    except OSError:return None

def restore(root):
    with (root/'restore.lock').open('a')as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if (root/'restored.json').exists():return
        cfg=read(root/'session.json');event(root,'RESTORING_ORIGINAL')
        stop_owned(root)
        if sha(PLIST)!=cfg['plistSha256']:raise RuntimeError('original_agent_changed')
        if agent('print',SERVICE).returncode:
            wait_until(lambda:guard_free()and not health(8089),45,'guard_not_free_for_original')
            if agent('bootstrap',f'gui/{os.getuid()}',str(PLIST)).returncode:raise RuntimeError('original_bootstrap_failed')
        wait_until(lambda:identity(8088,cfg['live']),180,'original_health_restore_timeout')
        if sha(Path(cfg['live']['adapter'])/'adapters.safetensors')!=LIVE_SHA:raise RuntimeError('restored_adapter_changed')
        wait_until(lambda:http_status('http://127.0.0.1:8092/v1/chat/completions')==401,40,'original_gateway_not_ready')
        public_status=None
        def public_ready():
            nonlocal public_status
            public_status=http_status(cfg['gatewayDomain']+'/v1/chat/completions')
            event(root,'PUBLIC_RESTORE_PROBE',status=public_status)
            return public_status==401
        wait_until(public_ready,40,'original_public_gateway_not_ready')
        put(root,'restored.json',{'status':'HEALTHY_ORIGINAL_RESTORED','at':time.time(),'adapterSha256':LIVE_SHA,'publicUnauthenticatedStatus':public_status,'candidatePortStopped':not bool(health(8089))})
        event(root,'HEALTHY_ORIGINAL_RESTORED')

def watchdog(root,fd):
    cfg=read(root/'session.json');(root/'watchdog.ready').touch()
    until=cfg['deadline']-420
    while time.time()<until:
        ready,_,_=select.select([fd],[],[],min(5,max(0,until-time.time())))
        if ready and not os.read(fd,1):break
    if not(root/'restored.json').exists():
        event(root,'INDEPENDENT_RESTORE_TRIGGERED')
        try:restore(root)
        except Exception as e:put(root,'watchdog-failure.json',{'error':str(e)});raise

def preflight(root,candidate,completion,python,comparison_spec=None):
    if comparison_spec is not None:return preflight_catalog(root,candidate,completion,python,comparison_spec)
    if (root/'session.json').exists():raise ValueError('maintenance_already_used')
    trained=read(completion);conversion=read(candidate/'conversion.json')
    if trained.get('status')!='TRAINED_SECURED_AND_OWNED_POD_REMOVED'or trained.get('candidateSha256')!=conversion.get('hfAdapterSha256'):raise ValueError('secured_training_completion_required')
    if conversion.get('datasetHash')!=DATASET or conversion.get('parentMlxSha256')!=PARENT_SHA or conversion.get('exactRoundTrip')is not True or sha(candidate/'adapters.safetensors')!=conversion.get('mlxAdapterSha256')or sha(candidate/'adapter_config.json')!=conversion.get('mlxConfigSha256'):raise ValueError('converted_candidate_identity_invalid')
    h=health(8088)
    if h.get('status')!='healthy'or not h.get('loaded_adapter')or sha(Path(h['loaded_adapter'])/'adapters.safetensors')!=LIVE_SHA or sha(PLIST)!=PLIST_SHA:raise ValueError('original_live_identity_invalid')
    parents=[root/'parent-20',root/'parent-5']
    for folder,count in zip(parents,[20,5]):
        m=read(folder/'manifest.json')
        if m['scope']!='ISOLATED_PARENT_COMPARISON_ONLY'or m['caseCount']!=count or m['adapterSha256']!=PARENT_SHA or m['model']!=h['loaded_model']:raise ValueError('parent_comparison_identity_invalid')
        for name,expected in m['sourceHashes'].items():
            if sha(REPO/name)!=expected:raise ValueError('comparison_source_changed:'+name)
        for name,expected in m['files'].items():
            if sha(folder/name)!=expected:raise ValueError('comparison_inputs_changed')
    if health(8089):raise ValueError('isolated_port_already_used')
    domain=DOMAIN_FILE.read_text().strip()
    if not re.fullmatch(r'https://[a-z0-9][a-z0-9.-]+',domain):raise ValueError('original_domain_invalid')
    return {'deadline':time.time()+1200,'python':str(python),'live':{'model':h['loaded_model'],'adapter':h['loaded_adapter']},'plistSha256':PLIST_SHA,'gatewayDomain':domain,'parentDirectories':[str(p)for p in parents],'candidate':str(candidate),'candidateMlxSha256':conversion['mlxAdapterSha256'],'candidateHfSha256':conversion['hfAdapterSha256'],'resourceGuardSha256':sha(GUARD),'publicCandidate':False,'maxSeconds':1200}

def catalog_training_origin(spec,bundle,state):
    """Retain the original training receipt across an evaluation-only continuation."""
    origin=spec['files'].get('originalTrainingBundleManifest')
    if origin is None:return spec['files']['bundleManifest']['sha256']
    if state.get('evaluationOnly')is not True:raise ValueError('native_evaluation_continuation_required')
    original=read(Path(origin['path']))
    for key in ['profile','datasetHash','parent','image','recipe']:
        if original.get(key)!=bundle.get(key):raise ValueError('native_continuation_protected_input_changed')
    excluded={'nuknuk-gpu.py','catalog-manifest.json','parent-binding.json','parent-verification.json'}
    if {k:v for k,v in original['files'].items()if k not in excluded}!={k:v for k,v in bundle['files'].items()if k not in excluded}:raise ValueError('native_continuation_data_changed')
    sources=[]
    for manifest,entry in [(original,origin),(bundle,spec['files']['bundleManifest'])]:
        folder=Path(entry['path']).parent
        for name,binding in manifest['files'].items():
            if Path(name).is_absolute()or '..'in Path(name).parts or sha(folder/name)!=binding['sha256']:raise ValueError('native_continuation_bundle_changed')
        sources.append(folder/'nuknuk-gpu.py')
    module_spec=importlib.util.spec_from_file_location('native_gpu_lineage',sources[1]);gpu=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(gpu)
    if gpu.catalog_inference_contract(sources[0].read_text())!=gpu.catalog_inference_contract(sources[1].read_text()):raise ValueError('native_continuation_inference_changed')
    return origin['sha256']


def preflight_catalog(root,candidate,completion,python,spec_path):
    """Bind local DEV or recall diagnostics to secured training; no model load."""
    if (root/'session.json').exists():raise ValueError('maintenance_already_used')
    spec=read(spec_path)
    probe=spec.get('diagnosticKind')=='TRAIN_RECALL_AND_TRANSFER'
    split='RECALL_TRANSFER'if probe else'DEV'
    if spec.get('version')!='backyrd.nuknuk-native-catalog-check@1' or spec.get('split')!=split:raise ValueError('native_catalog_scope_invalid')
    for name,binding in spec['files'].items():
        if sha(Path(binding['path']))!=binding['sha256']:raise ValueError('native_catalog_bound_file_changed:'+name)
    if sha(completion)!=spec['files']['trainingResult']['sha256']:raise ValueError('native_completion_changed')
    source=read(Path(spec['files']['catalogManifest']['path']));bundle=read(Path(spec['files']['bundleManifest']['path']));state=read(Path(spec['files']['runState']['path']));trained=read(completion);conversion=read(candidate/'conversion.json')
    if source.get('catalogVariant')!='understanding-correction-v1' or bundle['sourceManifestSha256']!=spec['files']['catalogManifest']['sha256'] or bundle['datasetHash']!=source['catalogHash']:raise ValueError('native_catalog_dataset_invalid')
    if state.get('phase')!='REMOVED' or state.get('resourcesRemoved') is not True or state.get('bundleHash')!=spec['files']['bundleManifest']['sha256']:raise ValueError('secured_gpu_removal_required')
    training_origin=catalog_training_origin(spec,bundle,state)
    if trained.get('status')!='TRAINED_REQUIRES_COMPARISON' or trained.get('datasetHash')!=bundle['datasetHash'] or trained.get('parentAdapterSha256')!=bundle['parent']['hfAdapterSha256'] or trained.get('completedOptimizerUpdates')!=bundle['recipe']['optimizerUpdates'] or trained.get('adapterSha256')!=conversion.get('hfAdapterSha256') or state.get('candidateSha256')!=trained.get('adapterSha256') or trained.get('sourceManifestSha256')!=training_origin or trained.get('trainingRows')!=bundle['recipe']['trainingRows'] or trained.get('epochs')!=bundle['recipe']['epochs'] or spec['files']['hfAdapter']['sha256']!=trained.get('adapterSha256'):raise ValueError('secured_training_completion_required')
    if conversion.get('datasetHash')!=bundle['datasetHash'] or conversion.get('parentMlxSha256')!=bundle['parent']['mlxAdapterSha256'] or conversion.get('exactRoundTrip')is not True or conversion.get('modelLoaded')is not False or conversion.get('activated')is not False or sha(candidate/'adapters.safetensors')!=conversion.get('mlxAdapterSha256') or sha(candidate/'adapter_config.json')!=conversion.get('mlxConfigSha256'):raise ValueError('converted_candidate_identity_invalid')
    if conversion.get('tensors')!=80 or conversion.get('rank')!=16 or conversion.get('scale')!=2:raise ValueError('native_conversion_architecture_invalid')
    parent=Path(spec['parentAdapter'])
    if sha(parent/'adapters.safetensors')!=bundle['parent']['mlxAdapterSha256'] or sha(parent/'adapter_config.json')!=bundle['parent']['mlxAdapterConfigSha256']:raise ValueError('native_parent_changed')
    request_key='probeRequests'if probe else'developmentRequests'
    prefix_key='probePreflight'if probe else'preflight'
    packet=read(Path(spec['files'][request_key]['path']));selected=spec['caseIds']
    if read(Path(spec['files']['preflight']['path'])).get('datasetManifestFileSha256')!=spec['files']['catalogManifest']['sha256']:raise ValueError('native_preflight_unbound')
    if not 1<=len(selected)<=(60 if probe else 20) or any(not isinstance(i,str)or not re.fullmatch(r'[a-zA-Z0-9_-]+',i)for i in selected) or len(set(selected))!=len(selected) or any(i not in {r['id']for r in packet['cases']}for i in selected):raise ValueError('native_subset_invalid')
    if len({r['id']for r in packet['cases']})!=len(packet['cases']) or any(r.get('split')!=split for r in packet['cases']):raise ValueError('native_packet_roster_invalid')
    prefix_rows=read(Path(spec['files'][prefix_key]['path']))['cases']
    for case_id in selected:
        matching=[r for r in prefix_rows if r['id']==case_id]
        if len(matching)!=1 or matching[0].get('split')!=split or type(matching[0].get('prefixTokens'))is not int or not 0<matching[0]['prefixTokens']<5120:raise ValueError('native_prefix_invalid')
    if packet.get('split')!=split or packet.get('targetIncluded')is not False:raise ValueError('native_requests_changed')
    if probe:
        if read(Path(spec['files']['probePreflight']['path'])).get('requestSha256')!=spec['files']['probeRequests']['sha256']:raise ValueError('probe_prefix_source_changed')
        validate_recall_probe(spec,packet,bundle)
    elif sha(Path(spec['files']['developmentRequests']['path']))!=bundle['files']['development-requests.json']['sha256']:raise ValueError('native_requests_changed')
    h=health(8088)
    if h.get('status')!='healthy' or not h.get('loaded_adapter') or sha(Path(h['loaded_adapter'])/'adapters.safetensors')!=LIVE_SHA or sha(PLIST)!=PLIST_SHA or health(8089):raise ValueError('original_live_identity_invalid')
    model_spec=spec['model']
    if h['loaded_model']!=model_spec['path'] or not model_spec.get('files'):raise ValueError('native_base_identity_invalid')
    required={'config.json','tokenizer.json','tokenizer_config.json','chat_template.jinja','model.safetensors.index.json'}
    actual_files={p.name for p in Path(model_spec['path']).iterdir()if p.is_file()}
    if set(model_spec['files'])!=actual_files or not required.issubset(actual_files):raise ValueError('native_base_inventory_incomplete')
    weights=set(read(Path(model_spec['path'])/'model.safetensors.index.json').get('weight_map',{}).values())
    if not weights or any(name!=Path(name).name or not name.endswith('.safetensors')or name not in actual_files for name in weights):raise ValueError('native_base_weights_unbound')
    for name,expected in model_spec['files'].items():
        if name!=Path(name).name or sha(Path(model_spec['path'])/name)!=expected:raise ValueError('native_base_file_changed')
    domain=DOMAIN_FILE.read_text().strip()
    if not re.fullmatch(r'https://[a-z0-9][a-z0-9.-]+',domain):raise ValueError('original_domain_invalid')
    cfg={'deadline':time.time()+1200,'python':str(python),'live':{'model':h['loaded_model'],'adapter':h['loaded_adapter']},'plistSha256':PLIST_SHA,'gatewayDomain':domain,'candidate':str(candidate),'candidateMlxSha256':conversion['mlxAdapterSha256'],'candidateHfSha256':conversion['hfAdapterSha256'],'resourceGuardSha256':sha(GUARD),'publicCandidate':False,'maxSeconds':1200,'nativeScope':'SERVING_SMOKE_NOT_GPU_NUMERICAL_OR_TOKEN_PARITY','controllerSourceSha256':sha(Path(__file__)), 'catalogComparison':{'spec':str(spec_path),'specSha256':sha(spec_path),'parent':{'model':h['loaded_model'],'adapter':str(parent)},'candidate':{'model':h['loaded_model'],'adapter':str(candidate)},'parentMlxSha256':bundle['parent']['mlxAdapterSha256'],'parentConfigSha256':bundle['parent']['mlxAdapterConfigSha256'],'candidateConfigSha256':conversion['mlxConfigSha256'],'caseCount':len(selected)}}
    if probe:cfg.update(deadline=time.time()+2100,maxSeconds=2100,nativeScope='LOCAL_TRAIN_RECALL_AND_TRANSFER_NOT_HF_PARITY')
    return cfg

def validate_recall_probe(spec,packet,bundle):
    """A diagnostic may reuse TRAIN inputs, never assistant answers or holdout claims."""
    plan=read(Path(spec['files']['probePlan']['path']))
    train_path=Path(spec['files']['originalTrainingBundleManifest']['path']).parent/'train.jsonl'
    if sha(train_path)!=bundle['files']['train.jsonl']['sha256']:raise ValueError('probe_training_source_changed')
    train=[read_row['messages'][:-1]for read_row in (json.loads(line)for line in train_path.read_text().splitlines())]
    roster=packet['cases']
    if len(roster)!=60 or [r['id']for r in roster]!=spec['caseIds'] or [r['id']for r in plan['cases']]!=spec['caseIds']:raise ValueError('probe_roster_invalid')
    groups={}
    for row,entry in zip(roster,plan['cases']):
        if row['messages']!=entry['messages']or any(m['role']not in ['system','user']for m in row['messages'])or len(row['messages'])!=2:raise ValueError('probe_target_leak_or_input_changed')
        groups.setdefault(entry['seedId'],{})[entry['variant']]=row
    if len(groups)!=20:raise ValueError('probe_seed_count_invalid')
    seen=[]
    for group in groups.values():
        if set(group)!=set(['EXACT_TRAIN','PARAPHRASE','CONTRAST']):raise ValueError('probe_variants_invalid')
        exact=group['EXACT_TRAIN']['messages']
        if exact not in train:raise ValueError('probe_seed_not_in_training')
        for kind in ['PARAPHRASE','CONTRAST']:
            other=group[kind]['messages']
            if other in train or other==exact or other[0]!=exact[0]:raise ValueError('probe_transfer_not_new_or_prompt_changed')
        seen.extend(json.dumps(x['messages'],sort_keys=True)for x in group.values())
    if len(set(seen))!=60:raise ValueError('probe_duplicate_inputs')

def infer_catalog(root,label):
    cfg=read(root/'session.json');bound=cfg['catalogComparison'];spec_path=Path(bound['spec'])
    if sha(spec_path)!=bound['specSha256']:raise ValueError('native_spec_changed')
    spec=read(spec_path)
    probe=spec.get('diagnosticKind')=='TRAIN_RECALL_AND_TRANSFER'
    request_key='probeRequests'if probe else'developmentRequests';prefix_key='probePreflight'if probe else'preflight'
    for name in [request_key,prefix_key]:
        item=spec['files'][name]
        if sha(Path(item['path']))!=item['sha256']:raise ValueError('native_request_source_changed')
    packet=read(Path(spec['files'][request_key]['path']));prefixes={r['id']:r['prefixTokens']for r in read(Path(spec['files'][prefix_key]['path']))['cases']}
    model=bound[label];expected=bound['parentMlxSha256']if label=='parent'else cfg['candidateMlxSha256']
    if sha(Path(model['adapter'])/'adapters.safetensors')!=expected:raise ValueError('native_adapter_changed')
    if sha(Path(__file__))!=cfg['controllerSourceSha256']:raise ValueError('native_controller_changed')
    config_sha=bound['parentConfigSha256']if label=='parent'else bound['candidateConfigSha256']
    if sha(Path(model['adapter'])/'adapter_config.json')!=config_sha:raise ValueError('native_adapter_config_changed')
    folder=root/(label+'-raw');folder.mkdir(mode=0o700)
    records=[]
    for case_id in spec['caseIds']:
        if time.time()>=cfg['deadline']-420:raise TimeoutError('native_restore_window_required')
        if not identity(8089,model):raise ValueError('native_model_identity_changed')
        req=next(r for r in packet['cases']if r['id']==case_id)
        record={'id':case_id,'attempt':1,'adapterSha256':expected,'query':req['query'],'inputHash':req['inputHash']};started=time.monotonic()
        with (folder/(case_id+'.started')).open('x')as f:json.dump({'requestSha256':hashlib.sha256(json.dumps(req,sort_keys=True).encode()).hexdigest()},f)
        try:
            body={'model':model['model'],'messages':req['messages'],'temperature':0,'max_tokens':min(2048,5120-prefixes[case_id]),'stream':False,'chat_template_kwargs':{'enable_thinking':False},'response_format':{'type':'json_schema','json_schema':{'name':'nuknuk_compact_search','strict':True,'schema':req['outputSchema']}}}
            if body['max_tokens']<1:raise ValueError('native_context_budget_invalid')
            with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8089/v1/chat/completions',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'}),timeout=60)as response:value=json.load(response)
            if value.get('model')!=model['model']:raise ValueError('native_response_model_changed')
            choice=value['choices'][0];record.update(rawText=choice['message']['content'],finishReason=choice['finish_reason'],usage=value.get('usage'))
            if choice['finish_reason']!='stop':raise ValueError('native_output_incomplete')
            record.update(raw=json.loads(record['rawText']),status='GENERATED_REQUIRES_SEMANTIC_REVIEW')
        except Exception as error:record.update(status='FAILED',error=type(error).__name__+': '+str(error))
        record['durationMs']=round((time.monotonic()-started)*1000);records.append(record);put(folder,case_id+'.json',record);event(root,'NATIVE_CASE_SECURED',label=label,id=case_id,status=record['status'])

    put(root,label+'-native-summary.json',{'attempted':len(records),'generated':sum(r['status']=='GENERATED_REQUIRES_SEMANTIC_REVIEW'for r in records),'failed':sum(r['status']=='FAILED'for r in records),'semanticsApproved':False,'scope':'LOCAL_RECALL_TRANSFER'if probe else'SERVING_SMOKE_ONLY'})

def run(root,candidate,completion,python,comparison_spec=None):
    cfg=preflight(root,candidate,completion,python,comparison_spec) if comparison_spec is not None else preflight(root,candidate,completion,python);put(root,'session.json',cfg)
    readfd,writefd=os.pipe();guard=None;runner=None
    with (root/'restore-watchdog.log').open('x')as log:
        watcher=subprocess.Popen([sys.executable,'-B','-u',str(Path(__file__).resolve()),'watchdog','--operation',str(root),'--fd',str(readfd)],pass_fds=(readfd,),start_new_session=True,stdout=log,stderr=subprocess.STDOUT)
    os.close(readfd)
    wait_until(lambda:(root/'watchdog.ready').exists()and watcher.poll()is None,10,'restore_watchdog_unavailable')
    awake=subprocess.Popen(['/usr/bin/caffeinate','-i','-w',str(os.getpid())])
    def interrupted(*_args):raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
    def start_model(manifest,label):
        nonlocal guard
        if sha(GUARD)!=cfg['resourceGuardSha256']:raise RuntimeError('resource_guard_changed')
        if 'catalogComparison'in cfg:
            bound=cfg['catalogComparison'];spec=read(Path(bound['spec']))
            if sha(Path(bound['spec']))!=bound['specSha256']or sha(Path(__file__))!=cfg['controllerSourceSha256']:raise RuntimeError('native_sources_changed')
            expected=bound['parentMlxSha256']if label=='parent'else cfg['candidateMlxSha256']
            config=bound['parentConfigSha256']if label=='parent'else bound['candidateConfigSha256']
            if sha(Path(manifest['adapter'])/'adapters.safetensors')!=expected or sha(Path(manifest['adapter'])/'adapter_config.json')!=config:raise RuntimeError('native_adapter_changed_before_load')
            for name,expected in spec['model']['files'].items():
                if sha(Path(manifest['model'])/name)!=expected:raise RuntimeError('native_base_changed_before_load')
        receipt=root/(label+'-resources.json')
        log=(root/(label+'-server.log')).open('x')
        guard=subprocess.Popen([str(python),'-B','-u',str(GUARD),'--receipt',str(receipt),'mlx_vlm.server','--host','127.0.0.1','--port','8089','--model',manifest['model'],'--adapter-path',manifest['adapter'],'--max-num-seqs','1','--log-progress-interval','0'],cwd=REPO,stdout=log,stderr=subprocess.STDOUT)
        log.close();put(root,'owned-guard.json',{'pid':guard.pid,'receipt':str(receipt)})
        def ready():
            if guard.poll()is not None:raise RuntimeError('isolated_guard_exited')
            return identity(8089,manifest)
        wait_until(ready,max(1,min(150,cfg['deadline']-time.time()-420)),'isolated_model_health_timeout');event(root,label.upper()+'_HEALTHY')
    def invoke(command,logname):
        nonlocal runner
        timeout=max(1,int(cfg['deadline']-time.time()-420))
        with (root/logname).open('x')as log:
            runner=subprocess.Popen(command,cwd=REPO,stdout=log,stderr=subprocess.STDOUT)
            if runner.wait(timeout=timeout):raise RuntimeError('local_comparison_command_failed:'+logname)
    try:
        event(root,'PAUSING_ORIGINAL')
        if agent('bootout',SERVICE).returncode:raise RuntimeError('original_bootout_failed')
        wait_until(lambda:not health(8088)and guard_free(),45,'original_guard_release_timeout')
        if 'catalogComparison' in cfg:
            for label in ['parent','candidate']:
                start_model(cfg['catalogComparison'][label],label)
                invoke([sys.executable,'-B',str(Path(__file__).resolve()),'infer-catalog','--operation',str(root),'--label',label],label+'-inference.log')
                stop_owned(root)
                if guard is not None:guard.wait(timeout=15)
            put(root,'inference-completed.json',{'at':time.time(),'parentCases':cfg['catalogComparison']['caseCount'],'candidateCases':cfg['catalogComparison']['caseCount'],'candidateHfSha256':cfg['candidateHfSha256'],'semanticsApproved':False})
        else:
            start_model(read(root/'parent-20/manifest.json'),'parent')
            for folder in cfg['parentDirectories']:
                event(root,'PARENT_TESTING',directory=folder)
                invoke(['node',str(RUNNER),'run',folder],Path(folder).name+'-inference.log')
            stop_owned(root)
            if guard is not None:guard.wait(timeout=15)
            invoke(['node',str(RUNNER),'prepare-candidate',str(root/'candidate'),*cfg['parentDirectories'],str(candidate)],'candidate-prepare.log')
            start_model(read(root/'candidate/manifest.json'),'candidate')
            event(root,'CANDIDATE_TESTING_25')
            invoke(['node',str(RUNNER),'run',str(root/'candidate')],'candidate-inference.log')
            put(root,'inference-completed.json',{'at':time.time(),'parentCases':25,'candidateCases':25,'candidateHfSha256':cfg['candidateHfSha256'],'newModelInferences':50})
            event(root,'COMPARISON_50_FINISHED')
    except BaseException as e:
        put(root,'test-error.json',{'error':type(e).__name__+': '+str(e)});event(root,'TEST_INTERRUPTED',error=str(e))
    finally:
        signal.signal(signal.SIGTERM,signal.SIG_IGN);signal.signal(signal.SIGINT,signal.SIG_IGN)
        try:
            if runner is not None and runner.poll()is None:
                try:runner.terminate();runner.wait(timeout=15)
                except Exception as error:event(root,'OWNED_RUNNER_CLEANUP_FAILED',errorType=type(error).__name__)
        finally:
            try:restore(root)
            finally:
                os.close(writefd)
                try:awake.terminate()
                finally:watcher.wait(timeout=15)
    return 1 if(root/'test-error.json').exists()else 0

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('command',choices=['preflight','run','watchdog','infer-catalog'])
    parser.add_argument('--operation',type=Path,required=True);parser.add_argument('--candidate',type=Path);parser.add_argument('--completion',type=Path);parser.add_argument('--python',type=Path);parser.add_argument('--fd',type=int);parser.add_argument('--comparison-spec',type=Path);parser.add_argument('--label',choices=['parent','candidate'])
    args=parser.parse_args()
    if args.command=='watchdog':watchdog(args.operation,args.fd)
    elif args.command=='infer-catalog':
        if args.label is None:parser.error('explicit label required')
        infer_catalog(args.operation,args.label)
    else:
        if any(getattr(args,k)is None for k in ['candidate','completion','python']):parser.error('explicit candidate, completion and MLX Python required')
        if args.command=='preflight':print(json.dumps(preflight(args.operation,args.candidate,args.completion,args.python,args.comparison_spec)))
        else:sys.exit(run(args.operation,args.candidate,args.completion,args.python,args.comparison_spec))
