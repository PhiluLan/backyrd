"""Bounded, isolated parent/child inference; always restore the original live agent.

No cloud allocation, public candidate endpoint or production writes. Invoke only
for a founder-authorized maintenance window after the GPU has been removed.
"""
import argparse
import fcntl
import hashlib
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

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
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
        public_status=http_status(cfg['gatewayDomain']+'/v1/chat/completions')
        if public_status!=401:raise RuntimeError('original_public_gateway_not_ready')
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

def preflight(root,candidate,completion,python):
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

def run(root,candidate,completion,python):
    cfg=preflight(root,candidate,completion,python);put(root,'session.json',cfg)
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
        if runner is not None and runner.poll()is None:runner.terminate();runner.wait(timeout=15)
        try:restore(root)
        finally:os.close(writefd);awake.terminate()
        watcher.wait(timeout=15)
    return 1 if(root/'test-error.json').exists()else 0

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('command',choices=['preflight','run','watchdog'])
    parser.add_argument('--operation',type=Path,required=True);parser.add_argument('--candidate',type=Path);parser.add_argument('--completion',type=Path);parser.add_argument('--python',type=Path);parser.add_argument('--fd',type=int)
    args=parser.parse_args()
    if args.command=='watchdog':watchdog(args.operation,args.fd)
    else:
        if any(getattr(args,k)is None for k in ['candidate','completion','python']):parser.error('explicit candidate, completion and MLX Python required')
        if args.command=='preflight':print(json.dumps(preflight(args.operation,args.candidate,args.completion,args.python)))
        else:sys.exit(run(args.operation,args.candidate,args.completion,args.python))
