"""Read-only remote checkpoint replication. Never loads weights or provider keys."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

REMOTE_SCAN = """from pathlib import Path
import json
root=Path(REMOTE_ROOT)
rows=[]
for p in root.rglob('checkpoint-complete.json'):
 if p.is_symlink():continue
 metadata=json.loads(p.read_text())
 if (p.parent/'adapter_model.safetensors').is_file() and (p.parent/'adapter_config.json').is_file():
  rows.append({'path':str(p.parent.relative_to(root)),'metadata':metadata})
print(json.dumps(rows))
"""

REMOTE_EVIDENCE = """from pathlib import Path
import json,hashlib
root=Path(REMOTE_ROOT);rows=[];total=0
for p in sorted(root.rglob('*')):
 if p.is_symlink() or not p.is_file() or p.suffix not in ('.json','.jsonl','.log'):continue
 if any((root/x).is_symlink() for x in p.relative_to(root).parents if x!=Path('.')):continue
 size=p.stat().st_size
 if size>2*1024**2:continue
 data=p.read_bytes();total+=len(data)
 if total>20*1024**2:raise ValueError('evidence_transfer_limit')
 rows.append({'path':str(p.relative_to(root)),'sha256':hashlib.sha256(data).hexdigest(),'text':data.decode('utf-8')})
print(json.dumps(rows))
"""

def save_evidence(rows, output):
    """Verify bytes and confine every remote name before replacing local evidence."""
    checked=[];total=0
    for row in rows:
        name=row['path'];data=row['text'].encode('utf-8');total+=len(data)
        if (not re.fullmatch(r'[a-zA-Z0-9_./-]+',name) or name.startswith('/')
                or '..' in Path(name).parts or Path(name).suffix not in ('.json','.jsonl','.log')
                or len(data)>2*1024**2 or total>20*1024**2):
            raise ValueError('nuknuk_sync_untrusted_evidence_path_or_size')
        target=output/name
        if output.resolve() not in target.resolve().parents:
            raise ValueError('nuknuk_sync_evidence_outside_output')
        if hashlib.sha256(data).hexdigest()!=row['sha256']:
            raise ValueError('nuknuk_sync_evidence_hash_mismatch')
        checked.append((target,data))
    for target,data in checked:
        target.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as f:
            f.write(data);tmp=Path(f.name)
        tmp.replace(target)
    return len(checked)

def sync_evidence(args):
    remote_root=args.remote_root
    if not re.fullmatch(r'/workspace/[a-z0-9_-]+',remote_root):
        raise ValueError('nuknuk_sync_remote_root_invalid')
    command=['ssh','-i',str(args.ssh_key),'-o','UserKnownHostsFile='+str(args.known_hosts),
             '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','-p',str(args.port),'root@'+args.host,'python3 -B -']
    response=subprocess.run(command,input=REMOTE_EVIDENCE.replace('REMOTE_ROOT',repr(remote_root)),
                            text=True,capture_output=True,timeout=40,check=True)
    return save_evidence(json.loads(response.stdout),args.evidence_output)

def scan(args):
    remote_root=getattr(args,'remote_root','/workspace/round4')
    if not re.fullmatch(r'/workspace/[a-z0-9_-]+',remote_root):
        raise ValueError('nuknuk_sync_remote_root_invalid')
    ssh=['ssh','-i',str(args.ssh_key),'-o','UserKnownHostsFile='+str(args.known_hosts),'-o','StrictHostKeyChecking=yes',
         '-o','ConnectTimeout=15','-p',str(args.port),'root@'+args.host]
    response=subprocess.run(ssh+['python3 -B -'],input=REMOTE_SCAN.replace('REMOTE_ROOT',repr(remote_root)),text=True,capture_output=True,timeout=40,check=True)
    rows=json.loads(response.stdout)
    copied=[]
    for row in rows:
        name=row['path'];expected=row['metadata'].get('adapterSha256','')
        if not re.fullmatch('[a-z0-9_/-]+',name) or name.startswith('/') or '..' in name or not re.fullmatch('[a-f0-9]{64}',expected):
            raise ValueError('nuknuk_sync_untrusted_checkpoint_path')
        target=args.output/name
        if target.exists():
            if digest(target/'adapter_model.safetensors')!=expected:raise ValueError('nuknuk_sync_existing_checkpoint_changed')
            continue
        if shutil.disk_usage(args.output).free<20*1024**3:raise ValueError('nuknuk_sync_mac_disk_reserve')
        target.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.receiving-',dir=target.parent) as tmp:
            tmp=Path(tmp)
            for file in ('adapter_model.safetensors','adapter_config.json','checkpoint-complete.json'):
                subprocess.run(['scp','-i',str(args.ssh_key),'-o','UserKnownHostsFile='+str(args.known_hosts),'-o','StrictHostKeyChecking=yes',
                    '-o','ConnectTimeout=15','-P',str(args.port),'root@'+args.host+':'+remote_root+'/'+name+'/'+file,str(tmp/file)],
                    timeout=180,check=True,capture_output=True)
            if digest(tmp/'adapter_model.safetensors')!=expected or json.loads((tmp/'checkpoint-complete.json').read_text())!=row['metadata']:
                raise ValueError('nuknuk_sync_transfer_hash_mismatch')
            tmp.rename(target)
        copied.append({'path':name,'adapterSha256':expected})
    return copied

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
    return h.hexdigest()

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--ssh-key',type=Path,required=True);p.add_argument('--known-hosts',type=Path,required=True)
    p.add_argument('--host',required=True);p.add_argument('--port',type=int,required=True)
    p.add_argument('--output',type=Path,required=True);p.add_argument('--log',type=Path,required=True)
    p.add_argument('--remote-root',default='/workspace/round4')
    p.add_argument('--evidence-output',type=Path)
    p.add_argument('--interval',type=int,default=60)
    p.add_argument('--deadline',type=float,required=True);p.add_argument('--once',action='store_true')
    a=p.parse_args()
    if not 5<=a.interval<=60:raise ValueError('nuknuk_sync_interval_invalid')
    if not re.fullmatch(r'\d{1,3}(\.\d{1,3}){3}',a.host) or not 1<=a.port<=65535:raise ValueError('nuknuk_sync_host_invalid')
    a.output.mkdir(parents=True,exist_ok=True,mode=0o700)
    with a.log.open('x') as log:
        while time.time()<a.deadline:
            receipt={'at':datetime.now(timezone.utc).isoformat()}
            try:
                if a.evidence_output is not None:
                    a.evidence_output.mkdir(parents=True,exist_ok=True,mode=0o700)
                    receipt['evidenceFiles']=sync_evidence(a)
                receipt.update(status='SYNC_CHECKED',copied=scan(a))
            except Exception as error:receipt.update(status='SYNC_FAILED_REQUIRES_ATTENTION',errorType=type(error).__name__)
            log.write(json.dumps(receipt)+'\n');log.flush();print(json.dumps(receipt),flush=True)
            if a.once:break
            time.sleep(a.interval)
