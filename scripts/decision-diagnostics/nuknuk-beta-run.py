"""Single-attempt owned-Pod controller. No allocation until all local gates pass.

Uses the canonical Product GPU bundle/trainer and existing stop watchdog API.
Credentials remain local; the GPU uses only its provider-injected own-Pod key.
"""
import argparse
import base64
import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
import uuid

spec=importlib.util.spec_from_file_location('watch',Path(__file__).with_name('nuknuk-runpod-watch.py'))
watch=importlib.util.module_from_spec(spec);spec.loader.exec_module(watch)
REMOTE='/workspace/backyrd-product-training'
PY='/workspace/axolotl-venv/bin/python'


def digest(data):return hashlib.sha256(data).hexdigest()

def save(folder,phase,**extra):
    state=json.loads((folder/'state.json').read_text()) if (folder/'state.json').exists() else {}
    state.update(phase=phase,heartbeat=time.time(),**extra)
    temp=folder/'state.tmp';temp.write_text(json.dumps(state,indent=2));temp.chmod(0o600);temp.replace(folder/'state.json')
    print(json.dumps({'phase':phase,**extra}),flush=True);return state

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def rest(key_file,method,path,payload=None):
    if not path.startswith('/v2/'):raise ValueError('provider_path_not_allowlisted')
    if key_file.stat().st_mode&0o077:raise ValueError('credential_permissions')
    key=key_file.read_text().strip()
    request=urllib.request.Request('https://api.runpod.io'+path,data=json.dumps(payload).encode() if payload is not None else None,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},method=method)
    with urllib.request.build_opener(NoRedirect).open(request,timeout=25) as result:
        data=result.read();return json.loads(data) if data else None


def owned(folder,key):
    state=json.loads((folder/'state.json').read_text());rows=watch.status(key)
    matches=[row for row in rows if row['name']==state['runName'] and row['id'] not in state['preexistingPodIds']]
    if len(matches)>1:raise ValueError('ambiguous_own_allocation')
    if matches and state.get('podId') and matches[0]['id']!=state['podId']:raise ValueError('owned_identity_changed')
    return matches[0] if matches else None


def cleanup(folder,key):
    for _ in range(30):
        try:
            pod=owned(folder,key)
            if pod is None:return
            if pod['desiredStatus']!='EXITED' or pod['runtime'] is not None:watch.stop(key,pod['id']);time.sleep(2)
            try:rest(key,'DELETE','/v2/pods/'+pod['id'])
            except urllib.error.HTTPError as error:
                if error.code!=404:raise
        except Exception as error:print(json.dumps({'phase':'CLEANUP_RETRY','type':type(error).__name__}),flush=True)
        time.sleep(3)
    raise RuntimeError('owned_resource_deletion_unconfirmed')


def guard(args):
    (args.operation/'guard.ready').write_text(str(os.getpid()))
    while True:
        state=json.loads((args.operation/'state.json').read_text())
        if state['phase'] in ['REMOVED','NO_ALLOCATION']:return
        try:
            pod=owned(args.operation,args.key_file)
            if pod and (time.time()>state['deadline']-300 or time.time()-state['heartbeat']>120 or not 0<float(pod['costPerHr'])<=state['computeRateCap']):
                cleanup(args.operation,args.key_file)
        except Exception:
            if state.get('podId'):
                try:watch.stop(args.key_file,state['podId'])
                except Exception:pass
        time.sleep(10)


class SSHTransportError(RuntimeError):
    pass


def ssh_call(ssh,command,timeout=25,data=None):
    result=subprocess.run([*ssh,command],input=data,capture_output=True,timeout=timeout)
    if result.returncode==255:raise SSHTransportError('owned_gpu_ssh_transport_failed')
    if result.returncode:raise RuntimeError('owned_gpu_remote_command_failed')
    return result.stdout


def workflow_status(ssh,folder,key,financial,deadline):
    # Retry only this idempotent read. Never repeat allocation, upload or launch.
    command=PY+' -c '+shlex.quote("import pathlib,json;root=pathlib.Path('"+REMOTE+"');print(json.dumps({'exit':(root/'EXIT').read_text()if(root/'EXIT').exists()else None,'complete':(root/'COMPLETE').exists()}))")
    for attempt in range(3):
        if financial.poll()is not None:raise ValueError('canonical_financial_watch_exited')
        if time.time()>=deadline-300:raise TimeoutError('billing_window_closing')
        save(folder,'WORKFLOW_STATUS_CHECK',statusAttempt=attempt+1)
        try:
            value=json.loads(ssh_call(ssh,command,20))
            if not isinstance(value,dict) or set(value)!={'exit','complete'} or type(value['complete'])is not bool or not(value['exit']is None or isinstance(value['exit'],str)and re.fullmatch(r'[0-9]+\s*',value['exit'])):
                raise ValueError('workflow_status_invalid')
            return value
        except (subprocess.TimeoutExpired,SSHTransportError)as error:
            if attempt==2:raise
            pod=owned(folder,key)
            running,rate=watch.validate_pod_snapshot(pod)
            cap=json.loads((folder/'state.json').read_text())['computeRateCap']
            if not running or rate>cap:raise ValueError('retry_provider_state_not_safe')
            save(folder,'WORKFLOW_STATUS_RETRY',statusAttempt=attempt+1,failureType=type(error).__name__)
            time.sleep(5)


def package(bundle,manifest):
    data=io.BytesIO()
    with tarfile.open(fileobj=data,mode='w:gz') as archive:
        for name in ['product-gpu-manifest.json',*manifest['files']]:
            content=(bundle/name).read_bytes()
            if name in manifest['files'] and digest(content)!=manifest['files'][name]['sha256']:raise ValueError('bundle_changed')
            info=tarfile.TarInfo('job/'+name);info.size=len(content);info.mode=0o600;archive.addfile(info,io.BytesIO(content))
    return data.getvalue()


def sync(ssh,folder,label):
    code='''import pathlib,tarfile,io,json,hashlib
root=pathlib.Path('/workspace/backyrd-product-training');payload={}
for name in ['output','training-receipts','parent-development','candidate-development','setup-native']:
 for f in (root/name).rglob('*'):
  if f.is_file() and f.suffix in ['.json','.log','.jsonl','.safetensors'] and f.stat().st_size<128*1024*1024:
   payload[str(f.relative_to(root))]=f.read_bytes()
for name in ['EXIT','COMPLETE','workflow.log','runtime.json']:
 f=root/name
 if f.is_file():payload[name]=f.read_bytes()[-2000000:]
payload['artifact-manifest.json']=(json.dumps({k:hashlib.sha256(v).hexdigest()for k,v in payload.items()})+'\\n').encode()
with tarfile.open(root/'results.tgz','w:gz')as out:
 for name,data in payload.items():
  info=tarfile.TarInfo(name);info.size=len(data);info.mode=384;out.addfile(info,io.BytesIO(data))
print(hashlib.sha256((root/'results.tgz').read_bytes()).hexdigest())'''
    expected=ssh_call(ssh,PY+' -c '+shlex.quote(code),45).decode().strip()
    raw=ssh_call(ssh,'cat '+REMOTE+'/results.tgz',90)
    if len(raw)>250*1024*1024 or digest(raw)!=expected:raise ValueError('result_transfer_integrity')
    target=folder/('results-'+label);target.mkdir(mode=0o700)
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as archive:
        for member in archive:
            if not member.isfile() or member.name.startswith('/') or '..'in Path(member.name).parts:raise ValueError('unsafe_result_path')
            path=target/member.name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(archive.extractfile(member).read());path.chmod(0o600)
    bindings=json.loads((target/'artifact-manifest.json').read_text())
    if any(digest((target/name).read_bytes())!=value for name,value in bindings.items()):raise ValueError('result_checksum_mismatch')
    return target


NATIVE_GUARD=r'''import os,json,time,urllib.request,re
from pathlib import Path
values=dict(x.split(b'=',1)for x in Path('/proc/1/environ').read_bytes().split(b'\0')if b'='in x)
pod=values.get(b'RUNPOD_POD_ID',b'').decode();key=values.get(b'RUNPOD_API_KEY',b'').decode()
assert re.fullmatch('[a-z0-9]{8,30}',pod)and re.fullmatch('[A-Za-z0-9_-]{20,256}',key)
deadline=float(os.environ['BACKYRD_DEADLINE'])
def api(query):
 req=urllib.request.Request('https://api.runpod.io/graphql',data=json.dumps({'query':query,'variables':{'id':pod}}).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=20)as r:return json.load(r)
assert api('query($id:String!){pod(input:{podId:$id}){id}}')['data']['pod']['id']==pod
while time.time()<deadline-120:
 try:
  state=api('query($id:String!){pod(input:{podId:$id}){id costPerHr desiredStatus}}')['data']['pod']
  if state['desiredStatus']!='RUNNING' or not 0<float(state['costPerHr'])<=float(os.environ['BACKYRD_COMPUTE_CAP']):break
 except Exception:break
 p=Path('/tmp/backyrd-guard.tmp');p.write_text(json.dumps({'podId':pod,'deadline':deadline,'heartbeat':time.time()}));p.replace('/tmp/backyrd-guard.ready');time.sleep(10)
while True:
 try:
  api('mutation($id:String!){podStop(input:{podId:$id}){id desiredStatus}}');break
 except Exception:time.sleep(5)
'''


def run(args):
    folder=args.operation;folder.mkdir(parents=True,exist_ok=True)
    with (folder/'operation.lock').open('a')as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        return run_locked(args,folder)

def run_locked(args,folder):
    if (folder/'state.json').exists():raise ValueError('single_allocation_attempt_already_used')
    quote=json.loads(args.quote.read_text());receipt=json.loads(args.quote_admission.read_text())
    manifest=json.loads((args.bundle/'product-gpu-manifest.json').read_text())
    if manifest['profile']!='PRODUCT_SEARCH_V7_BETA_CONTINUATION_V1' or manifest['recipe']['trainingRows']!=800:raise ValueError('approved_beta_bundle_required')
    check=subprocess.check_output(['node',str(Path(__file__).with_name('verify-nuknuk-beta-quote.mjs')),str(args.quote)],text=True)
    if json.loads(check)!=receipt:raise ValueError('quote_receipt_changed')
    billing=rest(args.key_file,'GET','/v2/billing/balance')
    if billing['billingMode']!='PREPAID' or billing['balanceAmount']<receipt['plannedMaximumIncludingReserveUsd']:raise ValueError('prepaid_balance_no_longer_sufficient')
    account=watch.query(args.key_file,'{myself{currentSpendPerHr pods{id name desiredStatus runtime{uptimeInSeconds}}}}')['myself']
    if account['currentSpendPerHr']!=0 or any(p['desiredStatus']!='EXITED'or p['runtime']is not None for p in account['pods']):raise ValueError('unexpected_billable_resource')
    payload_bytes=package(args.bundle,manifest)
    started=time.time();deadline=started+receipt['maximumBillingSeconds'];name='backyrd-beta-'+uuid.uuid4().hex[:16]
    save(folder,'PREPARED',runName=name,started=started,deadline=deadline,preexistingPodIds=[p['id']for p in account['pods']],computeRateCap=receipt['watchdog']['maxComputeHourlyUsd'],podId=None,bundleHash=digest((args.bundle/'product-gpu-manifest.json').read_bytes()))
    with (folder/'guard.log').open('x')as log:
        child=subprocess.Popen([sys.executable,'-B',str(Path(__file__).resolve()),'guard','--operation',str(folder),'--key-file',str(args.key_file)],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    for _ in range(30):
        if (folder/'guard.ready').exists():break
        time.sleep(.1)
    if not (folder/'guard.ready').exists() or child.poll()is not None:
        save(folder,'NO_ALLOCATION',failureType='independent_local_guard_not_armed')
        if child.poll()is None:child.terminate()
        raise ValueError('independent_local_guard_not_armed')
    command="python3 -u -c \"import os,base64;exec(base64.b64decode(os.environ['BACKYRD_GUARD']))\" > /tmp/backyrd-guard.log 2>&1 & exec sleep infinity"
    request={'name':name,'cloud':'SECURE','gpu':{'id':quote['gpu'],'count':1,'minRamPerGpu':96,'minVcpuCountPerGpu':8},'image':manifest['image'],'disk':200,'mounts':{},'startSsh':True,'ports':['22/tcp'],'cmd':['/bin/bash','-lc',command],'env':{'PUBLIC_KEY':args.public_key.read_text().strip(),'JUPYTER_DISABLE':'1','BACKYRD_GUARD':base64.b64encode(NATIVE_GUARD.encode()).decode(),'BACKYRD_DEADLINE':str(deadline),'BACKYRD_COMPUTE_CAP':str(receipt['watchdog']['maxComputeHourlyUsd'])}}
    ssh=None;created=False
    try:
        save(folder,'CREATING')
        response=rest(args.key_file,'POST','/v2/pods',request);pod=response.get('pod',response);pid=pod['id'];created=True
        if not re.fullmatch('[a-z0-9]{8,30}',pid):raise ValueError('provider_identity_invalid')
        save(folder,'ALLOCATED',podId=pid)
        state=owned(folder,args.key_file)
        if state is None or float(state['costPerHr'])>receipt['watchdog']['maxComputeHourlyUsd']:raise ValueError('assigned_rate_exceeded')
        details=watch.query(args.key_file,'query($id:String!){pod(input:{podId:$id}){id volumeInGb containerDiskInGb}}',{'id':pid})['pod']
        if details['volumeInGb']!=0 or details['containerDiskInGb']!=200:raise ValueError('assigned_storage_exceeded')
        until=started+1200
        while time.time()<until:
            save(folder,'WAITING_FOR_SSH')
            record=watch.query(args.key_file,'query($id:String!){pod(input:{podId:$id}){id desiredStatus runtime{ports{ip isIpPublic privatePort publicPort type}}}}',{'id':pid})['pod']
            if not record or record['desiredStatus']=='EXITED':raise ValueError('pod_stopped_during_startup')
            ports=[p for p in (record.get('runtime')or{}).get('ports',[])if p['isIpPublic']and p['privatePort']==22 and p['type']=='tcp']
            if len(ports)==1:
                import ipaddress
                port=ports[0];host=str(ipaddress.ip_address(port['ip']))
                ssh=['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ConnectTimeout=5','-o','StrictHostKeyChecking=accept-new','-o','UserKnownHostsFile='+str(folder/'known_hosts'),'-i',str(args.private_key),'-p',str(int(port['publicPort'])),'root@'+host]
                try:
                    ready=json.loads(ssh_call(ssh,'cat /tmp/backyrd-guard.ready',12))
                    if ready['podId']==pid and ready['deadline']==deadline and time.time()-ready['heartbeat']<45:break
                except Exception:pass
            time.sleep(10)
        else:raise TimeoutError('bounded_boot_timeout')
        if not watch.validate_pod_snapshot(owned(folder,args.key_file))[0]:raise ValueError('owned_runtime_not_ready')
        financial_log=(folder/'financial-watch.log').open('x')
        financial=subprocess.Popen([sys.executable,'-B',str(Path(__file__).with_name('nuknuk-runpod-watch.py')),'watch','--key-file',str(args.key_file),'--pod',pid,'--started',str(started),'--deadline',str(deadline),'--budget-profile','beta-10','--prior-usd',str(receipt['watchdog']['priorUsd']),'--hourly-usd',str(receipt['watchdog']['hourlyUsd']),'--max-compute-hourly-usd',str(receipt['watchdog']['maxComputeHourlyUsd']),'--ceiling-usd',str(receipt['watchdog']['ceilingUsd']),'--reserve-usd','1','--log',str(folder/'financial-watch.jsonl'),'--stop-file',str(folder/'STOP')],stdout=financial_log,stderr=subprocess.STDOUT,start_new_session=True)
        financial_log.close()
        for _ in range(30):
            if (folder/'financial-watch.jsonl').exists():break
            if financial.poll()is not None:raise ValueError('financial_watch_failed_to_arm')
            time.sleep(.1)
        if not (folder/'financial-watch.jsonl').exists():raise ValueError('financial_watch_not_armed')
        ssh_call(ssh,'mkdir -p '+REMOTE,12)
        ssh_call(ssh,'cat > '+REMOTE+'/input.tgz',90,payload_bytes)
        unpack="import hashlib,tarfile,pathlib;p=pathlib.Path('"+REMOTE+"/input.tgz');assert hashlib.sha256(p.read_bytes()).hexdigest()=="+repr(digest(payload_bytes))+";tarfile.open(p).extractall('"+REMOTE+"',filter='data')"
        ssh_call(ssh,PY+' -c '+shlex.quote(unpack),30)
        script='''#!/bin/bash
set -euo pipefail
cd /workspace/backyrd-product-training
export PATH=/workspace/axolotl-venv/bin:$PATH
export HF_HOME=/workspace/backyrd-product-training/hf-cache
export HF_HUB_DISABLE_TELEMETRY=1 TOKENIZERS_PARALLELISM=false AXOLOTL_DO_NOT_TRACK=1 DO_NOT_TRACK=1
PY=/workspace/axolotl-venv/bin/python
exec 9>/workspace/GPU_JOB_LOCK
flock -n 9
if ! "$PY" -c "import importlib.metadata;assert importlib.metadata.version('llguidance')=='1.9.1'"; then
 /root/.local/bin/uv pip install --python "$PY" --no-deps llguidance==1.9.1
fi
"$PY" -c "import importlib.util,pathlib;s=importlib.util.spec_from_file_location('gpu','job/nuknuk-gpu.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.prepare_product_native(pathlib.Path('job').resolve())"
mkdir setup-native
cp job/native-tokenization.json setup-native/
"$PY" -c "import importlib.metadata as m,json,pathlib;pathlib.Path('runtime.json').write_text(json.dumps({n:m.version(n)for n in ['torch','transformers','peft','axolotl','tokenizers','llguidance']}))"
"$PY" job/nuknuk-gpu.py product-evaluate --bundle job --adapter job/seed --adapter-sha256 PARENT --output parent-development
"$PY" job/nuknuk-gpu.py product-train --bundle job --output training-receipts
CANDIDATE=$("$PY" -c "import json;print(json.load(open('training-receipts/result.json'))['adapterSha256'])")
"$PY" job/nuknuk-gpu.py product-evaluate --bundle job --adapter output --adapter-sha256 "$CANDIDATE" --output candidate-development
touch COMPLETE
'''.replace('PARENT',manifest['parent']['hfAdapterSha256'])
        ssh_call(ssh,'cat > '+REMOTE+'/run.sh',20,script.encode())
        launch="import subprocess,pathlib;root=pathlib.Path('"+REMOTE+"');log=(root/'workflow.log').open('xb');p=subprocess.Popen(['timeout','--signal=TERM','--kill-after=20s',"+repr(str(max(1,int(min(started+8400,deadline-600)-time.time())))+'s')+",'bash','-c','bash run.sh; echo $? > EXIT'],cwd=root,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);print(p.pid)"
        ssh_call(ssh,PY+' -c '+shlex.quote(launch),25)
        counter=0
        while time.time()<deadline-300:
            if financial.poll()is not None:raise ValueError('canonical_financial_watch_exited')
            save(folder,'WORKFLOW_RUNNING');counter+=1
            state=workflow_status(ssh,folder,args.key_file,financial,deadline)
            if counter%4==1 or state['exit']is not None:
                target=sync(ssh,folder,str(counter).zfill(4));save(folder,'WORKFLOW_RUNNING',latestResults=str(target))
            if state['exit']is not None:
                if state['exit'].strip()!='0'or not state['complete']:raise RuntimeError('bounded_workflow_failed')
                result=json.loads((target/'training-receipts/result.json').read_text());adapter=target/'output/adapter_model.safetensors'
                if result.get('datasetHash')!=manifest['datasetHash'] or result.get('trainingRows')!=800 or result.get('epochs')!=1 or result.get('completedOptimizerUpdates')!=200 or digest(adapter.read_bytes())!=result['adapterSha256']:raise ValueError('candidate_not_complete_or_verified')
                save(folder,'TRAINED_AND_SECURED',candidateSha256=result['adapterSha256'],results=str(target));break
            time.sleep(15)
        else:raise TimeoutError('billing_window_closing')
    except BaseException as error:
        save(folder,'FAILED',failureType=type(error).__name__)
        if ssh:
            try:sync(ssh,folder,'failure')
            except Exception:pass
        raise
    finally:
        # A lost creation response is never retried. Reconcile this one run name.
        if not created:
            for _ in range(12):
                if owned(folder,args.key_file)is not None:break
                time.sleep(5)
        cleanup(folder,args.key_file)
        if owned(folder,args.key_file)is not None:raise RuntimeError('paid_residue_unconfirmed')
        save(folder,'REMOVED',resourcesRemoved=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('command',choices=['run','guard'])
    for name in ['operation','key-file','bundle','quote','quote-admission','private-key','public-key']:parser.add_argument('--'+name,type=Path,required=name in ['operation','key-file'])
    args=parser.parse_args()
    if args.command=='guard':guard(args)
    else:
        if any(getattr(args,n)is None for n in ['bundle','quote','quote_admission','private_key','public_key']):parser.error('explicit bundle, quote and SSH identity required')
        run(args)
