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
    p.add_argument('--deadline',type=float,required=True);p.add_argument('--once',action='store_true')
    a=p.parse_args()
    if not re.fullmatch(r'\d{1,3}(\.\d{1,3}){3}',a.host) or not 1<=a.port<=65535:raise ValueError('nuknuk_sync_host_invalid')
    a.output.mkdir(parents=True,exist_ok=True,mode=0o700)
    with a.log.open('x') as log:
        while time.time()<a.deadline:
            receipt={'at':datetime.now(timezone.utc).isoformat()}
            try:receipt.update(status='SYNC_CHECKED',copied=scan(a))
            except Exception as error:receipt.update(status='SYNC_FAILED_REQUIRES_ATTENTION',errorType=type(error).__name__)
            log.write(json.dumps(receipt)+'\n');log.flush();print(json.dumps(receipt),flush=True)
            if a.once:break
            time.sleep(60)
