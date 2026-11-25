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
            if pod and (state.get('stopWhenDiscovered') or time.time()>state['deadline']-(0 if state.get('limitPolicy')=='COST_ONLY_50_USD' else 300) or time.time()-state['heartbeat']>120 or not 0<float(pod['costPerHr'])<=state['computeRateCap']):
                if state.get('limitPolicy')=='COST_ONLY_50_USD':
                    if pod is not None and not state.get('podId'):
                        save(args.operation,'LATE_ALLOCATION_DISCOVERED',podId=pod['id']);catalog_attempt_event(args.operation,'POD_DISCOVERED',runName=state['runName'],podId=pod['id'])
                    catalog_cleanup(args,args.operation)
                else:cleanup(args.operation,args.key_file)
                if state.get('stopWhenDiscovered'):
                    save(args.operation,'REMOVED',resourcesRemoved=True,reconciledLateAllocation=True);return
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
for name in ['output','training-receipts','parent-development','candidate-development','parent-test','candidate-test','framework-smoke','setup-native']:
 for f in (root/name).rglob('*'):
  if f.is_file() and f.suffix in ['.json','.log','.jsonl','.safetensors'] and f.stat().st_size<128*1024*1024:
   payload[str(f.relative_to(root))]=f.read_bytes()
for name in ['EXIT','COMPLETE','workflow.log','runtime.json','development-EXIT','test-EXIT','development.log','test.log']:
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
while time.time()<deadline-float(os.environ.get('BACKYRD_STOP_LEAD_SECONDS','120')):
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
    if getattr(args,'catalog_package',None)is not None:
        return catalog_run(args,folder)
    if (folder/'state.json').exists():raise ValueError('single_allocation_attempt_already_used')
    quote=json.loads(args.quote.read_text());receipt=json.loads(args.quote_admission.read_text())
    manifest=json.loads((args.bundle/'product-gpu-manifest.json').read_text())
    if manifest['profile'] not in ('PRODUCT_SEARCH_V7_BETA_CONTINUATION_V1','PRODUCT_SEARCH_V7_BETA_REMEDIATION_V2') or manifest['recipe']['trainingRows']!=(484 if manifest['profile']=='PRODUCT_SEARCH_V7_BETA_REMEDIATION_V2' else 800):raise ValueError('approved_beta_bundle_required')
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
                if result.get('datasetHash')!=manifest['datasetHash'] or result.get('trainingRows')!=manifest['recipe']['trainingRows'] or result.get('epochs')!=1 or result.get('completedOptimizerUpdates')!=manifest['recipe']['optimizerUpdates'] or digest(adapter.read_bytes())!=result['adapterSha256']:raise ValueError('candidate_not_complete_or_verified')
                save(folder,'TRAINED_AND_SECURED',candidateSha256=result['adapterSha256'],results=str(target));break
            time.sleep(15)
        else:raise TimeoutError('billing_window_closing')
    except BaseException as error:
        capacity_rejected=False
        if not created and isinstance(error,urllib.error.HTTPError) and error.code in (400,409,503):
            try:
                body=json.loads(error.read(65536));detail=body.get('error',body)
                message=detail.get('message','') if isinstance(detail,dict) else str(detail)
                code=detail.get('code','') if isinstance(detail,dict) else ''
                capacity_rejected=code in ('NO_CAPACITY','INSUFFICIENT_GPU_CAPACITY','GPU_UNAVAILABLE','INSUFFICIENT_CAPACITY') or bool(re.search(r'(?:no (?:available|suitable|matching) (?:gpu|pod|resource)|insufficient (?:gpu |pod )?capacity|no gpu.{0,40}available)',message,re.I))
            except (ValueError,TypeError):pass
        save(folder,'FAILED',failureType=type(error).__name__,capacityRejected=capacity_rejected)
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


# Cost-only catalogue execution extends the existing owned-Pod controller.
# No provider operation is performed by import, planning or tests.
CATALOG_PROFILE = 'PRODUCT_SEARCH_V7_BETA_CATALOG_V2'
CATALOG_GPU_ORDER = ['NVIDIA H100 PCIe','NVIDIA H100 NVL','NVIDIA H100 80GB HBM3','NVIDIA H200 NVL','NVIDIA H200']


def catalog_storage_rate(path):
    from html.parser import HTMLParser
    class DocumentText(HTMLParser):
        def __init__(self):super().__init__();self.parts=[]
        def handle_data(self,data):self.parts.append(data)
    receipt=json.loads(path.read_text())
    if (receipt.get('sourceUrl')!='https://docs.runpod.io/pods/pricing' or not 0<=time.time()-receipt.get('fetchedAtEpoch',0)<=86400
        or receipt.get('sourceFile')!='runpod-pricing.html' or receipt.get('conservativeMonthHours')!=672 or receipt.get('billingGranularitySeconds')!=1):
        raise ValueError('catalog_current_storage_tariff_required')
    raw=(path.parent/receipt['sourceFile']).read_bytes()
    if digest(raw)!=receipt.get('sourceSha256'):raise ValueError('catalog_storage_source_changed')
    parser=DocumentText();parser.feed(raw.decode());match=re.search(r'Container disk\s+\$([0-9.]+)/GB/month',' '.join(parser.parts))
    if not match or float(match.group(1))!=receipt.get('containerDiskUsdPerGbMonth') or not 0<float(match.group(1))<=.20:
        raise ValueError('catalog_storage_rate_not_proven')
    return 200*float(match.group(1))/672,receipt


def catalog_attempt_event(folder,event,**values):
    record={'atEpoch':time.time(),'event':event,**values}
    with (folder/'attempt-ledger.jsonl').open('a')as stream:
        stream.write(json.dumps(record)+'\n');stream.flush();os.fsync(stream.fileno())


def catalog_attempts(folder):
    path=folder/'attempt-ledger.jsonl'
    rows=[json.loads(line)for line in path.read_text().splitlines()]if path.exists()else[]
    names={r['runName']for r in rows if r.get('runName')};ids={r['podId']for r in rows if r.get('podId')}
    return names,ids


def catalog_cleanup(args,folder):
    state=json.loads((folder/'state.json').read_text());names,ids=catalog_attempts(folder)
    names.add(state['runName'])
    if state.get('podId'):ids.add(state['podId'])
    if not ids:raise ValueError('catalog_unconfirmed_creation_cannot_claim_cleanup')
    consistent=0
    for attempt in range(40):
        try:
            _,account=catalog_account(args)
            matches=[p for p in account['pods']if p['id']in ids or p['name']in names]
            for pod in matches:
                if pod['id']in state['preexistingPodIds']:raise ValueError('catalog_cleanup_preexisting_identity_refused')
                ids.add(pod['id'])
                if pod['desiredStatus']!='EXITED' or pod['runtime']is not None:watch.stop(args.key_file,pod['id'])
            confirmed_absent=True
            for pid in ids:
                try:rest(args.key_file,'DELETE','/v2/pods/'+pid)
                except urllib.error.HTTPError as error:
                    if error.code!=404:raise
                try:rest(args.key_file,'GET','/v2/pods/'+pid);confirmed_absent=False
                except urllib.error.HTTPError as error:
                    if error.code!=404:raise
            clean=not matches and confirmed_absent and account.get('currentSpendPerHr')==0 and not account.get('networkVolumes') and all(p.get('volumeInGb')==0 for p in account['pods'])
            consistent=consistent+1 if clean else 0
            if consistent>=3:
                catalog_attempt_event(folder,'CLEANUP_CONFIRMED',runName=state['runName'],podIds=sorted(ids),consistentAccountReads=consistent);return
        except Exception as error:
            consistent=0;print(json.dumps({'phase':'CATALOG_CLEANUP_RETRY','type':type(error).__name__}),flush=True)
        time.sleep(3)
    raise ValueError('catalog_paid_resource_cleanup_unconfirmed_guard_required')


def catalog_budget(started, prior, hourly):
    import math
    if any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v)for v in [started,prior,hourly]) or prior<0 or hourly<=0 or prior>=45:
        raise ValueError('catalog_cost_inputs_invalid')
    return started+(50-prior-5)/hourly*3600


def catalog_candidates(rows):
    result=[]
    for gpu_id in CATALOG_GPU_ORDER:
        for row in rows:
            rate=row.get('price',{}).get('secure')
            if row.get('id')==gpu_id and row.get('secure') and row.get('memory',0)>=80 and row.get('availability')in ['LOW','MEDIUM','HIGH'] and isinstance(rate,(int,float)) and not isinstance(rate,bool) and 0<rate<=5.29:
                result.append(row)
    return result


def catalog_authority(args):
    value=json.loads(args.execution_authorization.read_text())
    if (value.get('executionAuthorized')is not True or value.get('totalCeilingUsd')!=50 or value.get('limitPolicy')!='COST_ONLY_50_USD'
        or value.get('autoPay')is not False or value.get('productionActivation')is not False
        or value.get('bundleManifestSha256')!=digest((args.bundle/'product-gpu-manifest.json').read_bytes())):
        raise ValueError('catalog_explicit_current_authority_required')
    return value


def catalog_account(args):
    billing=rest(args.key_file,'GET','/v2/billing/balance')
    account=watch.query(args.key_file,'{myself{currentSpendPerHr pods{id name desiredStatus volumeInGb runtime{uptimeInSeconds}} networkVolumes{id size}}}')['myself']
    if billing.get('billingMode')!='PREPAID' or not isinstance(billing.get('balanceAmount'),(int,float)):
        raise ValueError('catalog_prepaid_billing_required')
    return billing,account


def catalog_validate_idle(billing,account):
    if billing['balanceAmount']<50 or account.get('currentSpendPerHr')!=0 or account.get('networkVolumes') or any(p.get('desiredStatus')!='EXITED' or p.get('runtime')is not None or p.get('volumeInGb')!=0 for p in account['pods']):
        raise ValueError('catalog_account_not_clean_or_credit_insufficient')


def catalog_cost_check(args,folder):
    state=json.loads((folder/'state.json').read_text());billing,account=catalog_account(args)
    pod=owned(folder,args.key_file)
    if pod is None:raise ValueError('catalog_owned_pod_absent')
    if pod['desiredStatus']!='RUNNING' or pod.get('runtime')is None or not 0<float(pod['costPerHr'])<=state['computeRateCap']:
        raise ValueError('catalog_running_identity_or_tariff_changed')
    known=set(state['preexistingPodIds'])|{state['podId']}
    if any(p['id']not in known or p['id']!=state['podId'] and (p['desiredStatus']!='EXITED' or p['runtime']is not None or p['volumeInGb']!=0)for p in account['pods']) or account.get('networkVolumes'):
        raise ValueError('catalog_unexpected_billable_resource')
    debit=max(0,state['initialBalanceUsd']-billing['balanceAmount'])
    bound=max(0,time.time()-state['started'])*state['allInHourlyRateUsd']/3600
    spent=max(debit,bound)
    if spent>=45 or time.time()>=state['deadline']:raise ValueError('catalog_cost_budget_reached')
    save(folder,state['phase'],observedDebitUsd=debit,conservativeAccruedUsd=bound,remainingToHardCeilingUsd=50-spent)
    return state


def catalog_startup_script(manifest,wheel_sha=None,wheel_name=None):
    script='''#!/bin/bash
set -euo pipefail
cd /workspace/backyrd-product-training
export PATH=/workspace/axolotl-venv/bin:$PATH
export HF_HOME=/workspace/backyrd-product-training/hf-cache
export HF_HUB_DISABLE_TELEMETRY=1 TOKENIZERS_PARALLELISM=false AXOLOTL_DO_NOT_TRACK=1 DO_NOT_TRACK=1 PYTHONDONTWRITEBYTECODE=1
PY=/workspace/axolotl-venv/bin/python
exec 9>/workspace/GPU_JOB_LOCK
flock -n 9
if ! "$PY" -c "import importlib.metadata;assert importlib.metadata.version('llguidance')=='1.9.1'"; then
 WHEEL_INSTALL
fi
"$PY" job/nuknuk-gpu.py product-prepare --bundle job
mkdir setup-native
cp job/native-tokenization.json setup-native/
"$PY" -c "import importlib.metadata as m,json,pathlib;pathlib.Path('runtime.json').write_text(json.dumps({n:m.version(n)for n in ['torch','transformers','peft','axolotl','tokenizers','llguidance']}))"
"$PY" job/nuknuk-gpu.py product-smoke --bundle job --output framework-smoke --execution-approval execution-approval.json
"$PY" job/nuknuk-gpu.py product-evaluate --bundle job --adapter job/seed --adapter-sha256 PARENT --output parent-development --execution-approval execution-approval.json
"$PY" job/nuknuk-gpu.py product-train --bundle job --output training-receipts --execution-approval execution-approval.json
CANDIDATE=$("$PY" -c "import json;print(json.load(open('training-receipts/result.json'))['adapterSha256'])")
"$PY" job/nuknuk-gpu.py product-evaluate --bundle job --adapter output --adapter-sha256 "$CANDIDATE" --output candidate-development --execution-approval execution-approval.json
touch COMPLETE
'''.replace('PARENT',manifest['parent']['hfAdapterSha256'])

    if wheel_sha is None or wheel_name is None:
        return script.replace(' WHEEL_INSTALL',' exit 78 # Missing immutable runtime artifact')
    if not re.fullmatch('[a-f0-9]{64}',wheel_sha) or not re.fullmatch(r'[A-Za-z0-9_.-]+\.whl',wheel_name):raise ValueError('catalog_runtime_wheel_identity_invalid')
    verification=' "$PY" -c '+shlex.quote("import pathlib,hashlib;assert hashlib.sha256(pathlib.Path("+repr(wheel_name)+").read_bytes()).hexdigest()=="+repr(wheel_sha))
    install=' /root/.local/bin/uv pip install --python "$PY" --no-deps --no-index '+shlex.quote(wheel_name)
    return script.replace(' WHEEL_INSTALL',verification+'\n'+install)


def catalog_launch(ssh,script,stage):
    # No wall-clock timeout wrapper. Only the cost watchdog can expire this job.
    ssh_call(ssh,'cat > '+REMOTE+'/'+stage+'.sh',30,script.encode())
    launch="import subprocess,pathlib;root=pathlib.Path("+repr(REMOTE)+");log=(root/"+repr(stage+'.log')+").open('xb');p=subprocess.Popen(['bash','-c',"+repr('bash '+stage+'.sh; echo $? > '+stage+'-EXIT')+"],cwd=root,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);print(p.pid)"
    return int(ssh_call(ssh,PY+' -c '+shlex.quote(launch),30))


def catalog_monitor(args,folder,ssh,stage):
    counter=0
    while True:
        catalog_cost_check(args,folder);counter+=1
        code="import pathlib,json;root=pathlib.Path("+repr(REMOTE)+");p=root/"+repr(stage+'-EXIT')+";print(json.dumps({'exit':p.read_text()if p.exists()else None}))"
        status=json.loads(ssh_call(ssh,PY+' -c '+shlex.quote(code),25))
        if counter%6==1 or status['exit']is not None:
            target=sync(ssh,folder,stage+'-'+str(counter).zfill(5));save(folder,stage.upper(),latestResults=str(target),lastSuccessfulSyncEpoch=time.time())
        if status['exit']is not None:
            if status['exit'].strip()!='0':raise ValueError('catalog_remote_'+stage+'_failed')
            return target
        time.sleep(20)


def catalog_upload_json(ssh,name,path):
    # Only caller-selected, hash-bound nonsecret JSON is transferred.
    if '/'in name or not name.endswith('.json'):raise ValueError('catalog_upload_name_invalid')
    ssh_call(ssh,'cat > '+REMOTE+'/'+name,40,path.read_bytes())


def catalog_compare(args,folder,target,split,selection=None):
    parent='parent-development'if split=='DEV'else'parent-test';candidate='candidate-development'if split=='DEV'else'candidate-test'
    output=folder/(split.lower()+'-comparison.json')
    command=['node',str(Path(__file__).with_name('nuknuk-curriculum')/'beta-evaluation.mjs'),'paired',str(args.catalog_package),str(args.bundle),str(target/parent/'result.json'),str(target/candidate/'result.json'),str(output)]
    if selection:command.append(str(selection))
    subprocess.run(command,cwd=Path(__file__).resolve().parents[2],check=True)
    return json.loads(output.read_text())


def catalog_run(args,folder):
    if any(getattr(args,key,None)is None for key in ['bundle','catalog_package','execution_authorization','private_key','public_key','storage_tariff','llguidance_wheel']):raise ValueError('catalog_explicit_run_inputs_required')
    if (folder/'state.json').exists() or (folder/'attempt-ledger.jsonl').exists():raise ValueError('catalog_operation_already_allocated_or_attempted')
    authority=catalog_authority(args)
    storage_rate,storage_receipt=catalog_storage_rate(args.storage_tariff)
    if args.llguidance_wheel is None or digest(args.llguidance_wheel.read_bytes())!=authority.get('llguidanceWheelSha256') or not re.fullmatch(r'[A-Za-z0-9_.-]+\.whl',args.llguidance_wheel.name):raise ValueError('catalog_hash_bound_runtime_wheel_required')
    spec=importlib.util.spec_from_file_location('bound_gpu',args.bundle/'nuknuk-gpu.py');gpu=importlib.util.module_from_spec(spec);spec.loader.exec_module(gpu)
    manifest=gpu.verify_product_gpu_bundle(args.bundle)
    if manifest.get('limitPolicy')!='COST_ONLY_50_USD':raise ValueError('catalog_cost_only_policy_required')
    source=json.loads((args.catalog_package/'manifest.json').read_text())
    if manifest['sourceManifestSha256']!=digest((args.catalog_package/'manifest.json').read_bytes()) or source['catalogHash']!=manifest['datasetHash']:
        raise ValueError('catalog_source_changed')
    test=args.catalog_package/'test-inference-inputs.json'
    if digest(test.read_bytes())!=manifest['testRequestPacketSha256']:raise ValueError('catalog_local_test_packet_changed')
    payload=package(args.bundle,manifest)
    initial,account=catalog_account(args);catalog_validate_idle(initial,account)
    account_meta=rest(args.key_file,'GET','/v2/account')
    if not isinstance(account_meta.get('id'),str):raise ValueError('catalog_account_identity_unavailable')
    baseline_ids=[p['id']for p in account['pods']]
    # Capacity rejections may be retried only after proving no Pod was created.
    # A started/ambiguous paid job is never automatically retried.
    allocated=False;ssh=None;failure=None
    while not allocated:
        response=rest(args.key_file,'GET','/v2/catalog/gpus?include=AVAILABILITY&product=POD&cloud=SECURE&count=1');rows=response if isinstance(response,list)else response['gpus'];choices=catalog_candidates(rows)
        if not choices:
            print(json.dumps({'phase':'WAITING_FOR_H100_CAPACITY','billablePodCreated':False}),flush=True);time.sleep(30);continue
        billing,account=catalog_account(args);catalog_validate_idle(billing,account)
        quote=choices[0];compute=float(quote['price']['secure']);cap=compute+.03;rate=cap+storage_rate
        prior=max(0,initial['balanceAmount']-billing['balanceAmount']);started=time.time();deadline=catalog_budget(started,prior,rate);name='backyrd-catalog-'+uuid.uuid4().hex[:16]
        save(folder,'PREPARED',limitPolicy='COST_ONLY_50_USD',runName=name,started=started,deadline=deadline,initialBalanceUsd=initial['balanceAmount'],priorCostUsd=prior,allInHourlyRateUsd=rate,storageHourlyUsd=storage_rate,storageTariffSha256=digest(args.storage_tariff.read_bytes()),computeRateCap=cap,gpu=quote['id'],accountId=account_meta['id'],preexistingPodIds=baseline_ids,podId=None,bundleHash=digest((args.bundle/'product-gpu-manifest.json').read_bytes()),resourcesRemoved=False)
        (folder/'quote.json').write_text(json.dumps({'gpu':quote,'containerDiskGb':200,'persistentVolumeGb':0,'allInHourlyRateUsd':rate,'storageHourlyUsd':storage_rate,'storageTariff':storage_receipt,'costCeilingUsd':50,'reserveUsd':5,'priorCostUsd':prior,'costDerivedDeadline':deadline,'noIndependentTimeLimit':True,'providerPolicy':'SECURE_ON_DEMAND_NO_REQUESTED_EXPIRY','authorization':authority},indent=2)+'\n')
        command="python3 -u -c \"import os,base64;exec(base64.b64decode(os.environ['BACKYRD_GUARD']))\" > /tmp/backyrd-guard.log 2>&1 & exec sleep infinity"
        request={'name':name,'cloud':'SECURE','gpu':{'id':quote['id'],'count':1,'minRamPerGpu':96,'minVcpuCountPerGpu':8},'image':manifest['image'],'disk':200,'mounts':{},'startSsh':True,'ports':['22/tcp'],'cmd':['/bin/bash','-lc',command],'env':{'PUBLIC_KEY':args.public_key.read_text().strip(),'JUPYTER_DISABLE':'1','BACKYRD_GUARD':base64.b64encode(NATIVE_GUARD.encode()).decode(),'BACKYRD_DEADLINE':str(deadline),'BACKYRD_COMPUTE_CAP':str(cap),'BACKYRD_STOP_LEAD_SECONDS':'0'}}
        guard_process=None;creation_requested=False
        try:
            with (folder/('guard-'+name+'.log')).open('x')as log:guard_process=subprocess.Popen([sys.executable,'-B',str(Path(__file__).resolve()),'guard','--operation',str(folder),'--key-file',str(args.key_file)],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            for _ in range(30):
                if (folder/'guard.ready').exists():break
                if guard_process.poll()is not None:raise ValueError('catalog_local_guard_failed')
                time.sleep(.1)
            if not (folder/'guard.ready').exists():raise ValueError('catalog_local_guard_not_ready')
            save(folder,'CREATING')
            try:
                catalog_attempt_event(folder,'CREATE_INTENT',runName=name,accountId=account_meta['id'],bundleSha256=digest((args.bundle/'product-gpu-manifest.json').read_bytes()))
                creation_requested=True
                result=rest(args.key_file,'POST','/v2/pods',request);pod=result.get('pod',result);pid=pod['id']
            except urllib.error.HTTPError:
                # A POST error is not proof that no delayed Pod was created.
                # Keep the intent and guard; never automatically repeat POST.
                raise
            if not isinstance(pid,str) or not re.fullmatch('[a-z0-9]{8,30}',pid):raise ValueError('catalog_provider_pod_id_invalid')
            allocated=True
            catalog_attempt_event(folder,'POD_ACKNOWLEDGED',runName=name,podId=pid)
            save(folder,'ALLOCATED',podId=pid)
            while True:
                save(folder,'WAITING_FOR_SSH')
                if time.time()>=deadline:raise ValueError('catalog_cost_budget_reached_during_startup')
                state=owned(folder,args.key_file)
                if state is None or not 0<float(state['costPerHr'])<=cap:raise ValueError('catalog_assigned_tariff_exceeded')
                detail=rest(args.key_file,'GET','/v2/pods/'+pid)
                if detail.get('image')!=manifest['image'] or detail.get('disk')!=200 or detail.get('mounts') not in ({},None) or detail.get('locked') is True:
                    raise ValueError('catalog_assigned_image_storage_or_stop_policy_changed')
                for key in ['expiresAt','maxRuntimeSeconds','leaseExpiresAt']:
                    if detail.get(key)not in (None,0):raise ValueError('catalog_unexpected_provider_runtime_limit')
                record=watch.query(args.key_file,'query($id:String!){pod(input:{podId:$id}){id desiredStatus volumeInGb containerDiskInGb runtime{ports{ip isIpPublic privatePort publicPort type}}}}',{'id':pid})['pod']
                if not record or record['volumeInGb']!=0 or record['containerDiskInGb']!=200 or record['desiredStatus']=='EXITED':raise ValueError('catalog_assigned_resource_not_safe')
                ports=[p for p in (record.get('runtime')or{}).get('ports',[])if p['isIpPublic']and p['privatePort']==22 and p['type']=='tcp']
                if len(ports)==1:
                    import ipaddress
                    port=ports[0];host=str(ipaddress.ip_address(port['ip']));ssh=['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ConnectTimeout=5','-o','StrictHostKeyChecking=accept-new','-o','UserKnownHostsFile='+str(folder/'known_hosts'),'-i',str(args.private_key),'-p',str(int(port['publicPort'])),'root@'+host]
                    try:
                        ready=json.loads(ssh_call(ssh,'cat /tmp/backyrd-guard.ready',15))
                        if ready['podId']==pid and ready['deadline']==deadline and 0<=time.time()-ready['heartbeat']<45:break
                    except (SSHTransportError,subprocess.TimeoutExpired,RuntimeError,json.JSONDecodeError):pass
                time.sleep(10)
            approval={'executionAuthorized':True,'bundleManifestSha256':digest((args.bundle/'product-gpu-manifest.json').read_bytes()),'parentAdapterSha256':manifest['parent']['hfAdapterSha256'],'autoPay':False,'ownedPods':1,'totalCeilingUsd':50,'reserveUsd':5,'startedEpoch':started,'deadlineEpoch':deadline,'observedSpentUsd':prior,'allInHourlyRateUsd':rate,'storageAllowanceUsd':0,'watchdogHeartbeatPath':'/tmp/backyrd-guard.ready','podId':pid,'accountId':account_meta['id'],'storageHourlyUsd':storage_rate,'storageTariffSha256':digest(args.storage_tariff.read_bytes()),'limitPolicy':'COST_ONLY_50_USD','launchedImage':detail['image'],'providerRuntimeLimit':None}
            ap=folder/'execution-approval.json';ap.write_text(json.dumps(approval,indent=2)+'\n');ap.chmod(0o600)
            ssh_call(ssh,'mkdir -p '+REMOTE,20);catalog_upload_json(ssh,'execution-approval.json',ap)
            ssh_call(ssh,'cat > '+REMOTE+'/input.tgz',90,payload)
            unpack="import hashlib,tarfile,pathlib;p=pathlib.Path("+repr(REMOTE+'/input.tgz')+");assert hashlib.sha256(p.read_bytes()).hexdigest()=="+repr(digest(payload))+";tarfile.open(p).extractall("+repr(REMOTE)+",filter='data')"
            ssh_call(ssh,PY+' -c '+shlex.quote(unpack),45)
            ssh_call(ssh,'cat > '+REMOTE+'/'+args.llguidance_wheel.name,60,args.llguidance_wheel.read_bytes())
            save(folder,'DEVELOPMENT',providerRequestedImageVerified=True,resolvedRuntimeImageDigestVerified=False,providerRuntimeExpiryConfigured=False)
            process_id=catalog_launch(ssh,catalog_startup_script(manifest,authority['llguidanceWheelSha256'],args.llguidance_wheel.name),'development');save(folder,'DEVELOPMENT',remoteProcessId=process_id)
            target=catalog_monitor(args,folder,ssh,'development')
            trained=json.loads((target/'training-receipts/result.json').read_text());adapter=target/'output/adapter_model.safetensors'
            if trained.get('datasetHash')!=manifest['datasetHash'] or trained.get('completedOptimizerUpdates')!=470 or trained.get('trainingRows')!=2350 or digest(adapter.read_bytes())!=trained.get('adapterSha256'):
                raise ValueError('catalog_completed_candidate_not_bound')
            save(folder,'TRAINED_SECURED',candidateSha256=trained['adapterSha256'],results=str(target))
            comparison=catalog_compare(args,folder,target,'DEV')
            if comparison['comparison']['passed']:
                frozen=folder/'dev-comparison.json.selection.json';catalog_upload_json(ssh,'frozen-selection.json',frozen);catalog_upload_json(ssh,'test-inference-inputs.json',test)
                test_script='''#!/bin/bash
set -euo pipefail
cd /workspace/backyrd-product-training
export PATH=/workspace/axolotl-venv/bin:$PATH HF_HOME=/workspace/backyrd-product-training/hf-cache PYTHONDONTWRITEBYTECODE=1 TOKENIZERS_PARALLELISM=false HF_HUB_DISABLE_TELEMETRY=1
PY=/workspace/axolotl-venv/bin/python
"$PY" job/nuknuk-gpu.py product-evaluate --bundle job --adapter job/seed --adapter-sha256 PARENT --output parent-test --split TEST --requests test-inference-inputs.json --selection-receipt frozen-selection.json --execution-approval execution-approval.json
"$PY" job/nuknuk-gpu.py product-evaluate --bundle job --adapter output --adapter-sha256 CANDIDATE --output candidate-test --split TEST --requests test-inference-inputs.json --selection-receipt frozen-selection.json --execution-approval execution-approval.json
touch COMPLETE
'''.replace('PARENT',manifest['parent']['hfAdapterSha256']).replace('CANDIDATE',trained['adapterSha256'])
                save(folder,'TEST');catalog_launch(ssh,test_script,'test');target=catalog_monitor(args,folder,ssh,'test');catalog_compare(args,folder,target,'TEST',frozen);save(folder,'TEST_SECURED',results=str(target),testExecuted=True)
            else:save(folder,'DEV_REVIEW_REQUIRED',testExecuted=False,reason='Frozen selection gates failed; TEST not consumed.')
            break
        except BaseException as error:
            failure=type(error).__name__+':'+str(error);save(folder,'FAILED',failure=failure)
            # Includes lost-create-response reconciliation: no second allocation.
            raise
        finally:
            if allocated or failure:
                if creation_requested and not allocated:
                    discovered=None
                    for reconciliation in range(6):
                        discovered=owned(folder,args.key_file)
                        if discovered is not None:break
                        time.sleep(5)
                    if discovered is None:
                        save(folder,'ALLOCATION_UNCONFIRMED',failure=failure,stopWhenDiscovered=True,resourcesRemoved=False)
                        # Retain independent discovery/stop guard; never issue a second create.
                        raise RuntimeError('catalog_creation_unconfirmed_guard_retained_no_retry')
                    allocated=True;save(folder,'LATE_ALLOCATION_DISCOVERED',podId=discovered['id']);catalog_attempt_event(folder,'POD_DISCOVERED',runName=name,podId=discovered['id'])
                try:
                    catalog_cleanup(args,folder)
                    if owned(folder,args.key_file)is not None:raise ValueError('catalog_owned_resource_remains')
                    final_billing=rest(args.key_file,'GET','/v2/billing/balance');debit=max(0,initial['balanceAmount']-final_billing['balanceAmount'])
                    save(folder,'REMOVED',resourcesRemoved=True,finalObservedDebitUsd=debit,finalBalanceUsd=final_billing['balanceAmount'],failure=failure)
                finally:
                    final_state=json.loads((folder/'state.json').read_text())
                    if final_state.get('resourcesRemoved') is True and guard_process and guard_process.poll()is None:guard_process.terminate()
    return json.loads((folder/'state.json').read_text())


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('command',choices=['run','guard'])
    for name in ['operation','key-file','bundle','quote','quote-admission','private-key','public-key']:parser.add_argument('--'+name,type=Path,required=name in ['operation','key-file'])
    parser.add_argument('--catalog-package',type=Path)
    parser.add_argument('--execution-authorization',type=Path)
    parser.add_argument('--storage-tariff',type=Path)
    parser.add_argument('--llguidance-wheel',type=Path)
    args=parser.parse_args()
    if args.command=='guard':guard(args)
    else:
        if any(getattr(args,n)is None for n in (['bundle','catalog_package','execution_authorization','private_key','public_key','storage_tariff','llguidance_wheel']if args.catalog_package else ['bundle','quote','quote_admission','private_key','public_key'])):parser.error('explicit bundle, quote and SSH identity required')
        run(args)
