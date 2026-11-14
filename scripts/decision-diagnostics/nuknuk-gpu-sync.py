"""Read-only remote checkpoint replication. Never loads weights or provider keys."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
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
root=Path(REMOTE_ROOT);rows=[];total=0;unchanged=[]
known=KNOWN_FILES;full=FULL_PROFILE
for p in sorted(root.rglob('*')):
 if p.is_symlink() or not p.is_file() or p.suffix not in ('.json','.jsonl','.log'):continue
 if any((root/x).is_symlink() for x in p.relative_to(root).parents if x!=Path('.')):continue
 size=p.stat().st_size
 if size>2*1024**2:
  if full:raise ValueError('evidence_individual_limit')
  continue
 data=p.read_bytes();total+=len(data)
 if len(data)>2*1024**2 or total>(64 if full else 20)*1024**2:raise ValueError('evidence_transfer_limit')
 name=str(p.relative_to(root));sha=hashlib.sha256(data).hexdigest()
 if full and known.get(name)==sha:unchanged.append({'path':name,'sha256':sha})
 else:rows.append({'path':name,'sha256':sha,'text':data.decode('utf-8')})
print(json.dumps({'files':rows,'unchanged':unchanged} if full else rows))
"""

def evidence_target(output, name):
    if (not isinstance(name, str) or not re.fullmatch(r'[a-zA-Z0-9_./-]+', name)
            or name.startswith('/') or '..' in Path(name).parts or str(Path(name)) != name
            or Path(name).suffix not in ('.json', '.jsonl', '.log')):
        raise ValueError('nuknuk_sync_untrusted_evidence_path_or_size')
    target = output / name
    if output.resolve() not in target.resolve().parents:
        raise ValueError('nuknuk_sync_evidence_outside_output')
    if target.is_symlink() or any(parent.is_symlink() for parent in target.parents if parent != output and output in parent.parents):
        raise ValueError('nuknuk_sync_evidence_symlink')
    return target

def evidence_inventory(output):
    """Rehash local verified bytes; no persisted or caller-supplied inventory is trusted."""
    if output.is_symlink():
        raise ValueError('nuknuk_sync_evidence_symlink')
    known = {}
    total = 0
    for file in sorted(output.rglob('*')):
        if file.is_symlink():
            raise ValueError('nuknuk_sync_evidence_symlink')
        if not file.is_file() or file.suffix not in ('.json', '.jsonl', '.log'):
            continue
        target = evidence_target(output, str(file.relative_to(output)))
        size = target.stat().st_size
        total += size
        if size > 2 * 1024**2 or total > 64 * 1024**2:
            raise ValueError('nuknuk_sync_evidence_inventory_limit')
        known[str(file.relative_to(output))] = digest(target)
    return known

def save_evidence(rows, output, maximum_total_bytes=20*1024**2):
    """Verify bytes and confine every remote name before replacing local evidence."""
    checked=[];total=0;seen=set()
    for row in rows:
        name=row['path'];data=row['text'].encode('utf-8');total+=len(data)
        if name in seen or len(data)>2*1024**2 or total>maximum_total_bytes:
            raise ValueError('nuknuk_sync_untrusted_evidence_path_or_size')
        seen.add(name)
        target=evidence_target(output,name)
        if hashlib.sha256(data).hexdigest()!=row['sha256']:
            raise ValueError('nuknuk_sync_evidence_hash_mismatch')
        checked.append((target,data))
    for target,data in checked:
        target.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as f:
            f.write(data);tmp=Path(f.name)
        tmp.replace(target)
    return len(checked)

def save_incremental_evidence(payload, output, known):
    if not isinstance(payload, dict) or set(payload) != {'files', 'unchanged'} or not all(isinstance(payload[k], list) for k in payload):
        raise ValueError('nuknuk_sync_incremental_response_invalid')
    unchanged = set()
    for row in payload['unchanged']:
        target = evidence_target(output, row['path'])
        name, sha = row['path'], row['sha256']
        if (name in unchanged or not isinstance(sha, str) or not re.fullmatch('[a-f0-9]{64}', sha)
                or known.get(name) != sha or not target.is_file() or digest(target) != sha):
            raise ValueError('nuknuk_sync_incremental_inventory_mismatch')
        unchanged.add(name)
    if any(row['path'] in unchanged for row in payload['files']):
        raise ValueError('nuknuk_sync_incremental_duplicate')
    copied = save_evidence(payload['files'], output, 64*1024**2)
    # Count remotely reverified existing files too, without treating them as new generations.
    return copied + len(unchanged)

def sync_evidence(args):
    remote_root=args.remote_root
    if not re.fullmatch(r'/workspace/[a-z0-9_-]+',remote_root):
        raise ValueError('nuknuk_sync_remote_root_invalid')
    command=['ssh','-i',str(args.ssh_key),'-o','UserKnownHostsFile='+str(args.known_hosts),
             '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','-p',str(args.port),'root@'+args.host,'python3 -B -']
    profile = getattr(args, 'evidence_profile', 'legacy-20mib')
    if profile not in ('legacy-20mib', 'v7-full-200'):
        raise ValueError('nuknuk_sync_evidence_profile_invalid')
    full = profile == 'v7-full-200'
    known = evidence_inventory(args.evidence_output) if full else {}
    script = ('REMOTE_ROOT=' + repr(remote_root) + '\nKNOWN_FILES=' + repr(known)
              + '\nFULL_PROFILE=' + repr(full) + '\n' + REMOTE_EVIDENCE)
    response=subprocess.run(command,input=script,
                            text=True,capture_output=True,timeout=40,check=True)
    payload = json.loads(response.stdout)
    return save_incremental_evidence(payload, args.evidence_output, known) if full else save_evidence(payload,args.evidence_output)

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

def signal_stop(stop_file):
    """Signal the separately armed Pod watcher; never call a provider here."""
    if stop_file is not None:
        with stop_file.open('x') as file:
            file.write('Checkpoint/evidence replication failed; stop required.\n')
            file.flush()
            os.fsync(file.fileno())

def sync_once(args):
    receipt = {'at': datetime.now(timezone.utc).isoformat()}
    try:
        if args.evidence_output is not None:
            args.evidence_output.mkdir(parents=True, exist_ok=True, mode=0o700)
            receipt['evidenceFiles'] = sync_evidence(args)
            if getattr(args, 'require_evidence', False) and not receipt['evidenceFiles']:
                raise ValueError('nuknuk_sync_required_evidence_missing')
        receipt.update(status='SYNC_CHECKED', copied=scan(args))
        heartbeat = getattr(args, 'heartbeat_file', None)
        if heartbeat is not None:
            # An atomic local transport heartbeat; it does not attest model progress.
            data = json.dumps({'verifiedEpoch': time.time(), 'status': 'SYNC_CHECKED',
                               'evidenceFiles': receipt.get('evidenceFiles', 0)}) + '\n'
            with tempfile.NamedTemporaryFile(dir=heartbeat.parent, delete=False, mode='w') as file:
                file.write(data)
                file.flush()
                os.fsync(file.fileno())
                tmp = Path(file.name)
            tmp.replace(heartbeat)
    except Exception as error:
        receipt.update(status='SYNC_FAILED_REQUIRES_ATTENTION', errorType=type(error).__name__)
        stop_file = getattr(args, 'stop_file', None)
        if stop_file is not None:
            try:
                signal_stop(stop_file)
                receipt['stopRequired'] = True
            except FileExistsError:
                receipt['stopRequired'] = True
            except Exception as stop_error:
                receipt.update(stopRequired=True, stopSignalFailed=True, stopErrorType=type(stop_error).__name__)
    return receipt

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--ssh-key',type=Path,required=True);p.add_argument('--known-hosts',type=Path,required=True)
    p.add_argument('--host',required=True);p.add_argument('--port',type=int,required=True)
    p.add_argument('--output',type=Path,required=True);p.add_argument('--log',type=Path,required=True)
    p.add_argument('--remote-root',default='/workspace/round4')
    p.add_argument('--evidence-output',type=Path)
    p.add_argument('--evidence-profile',choices=['legacy-20mib','v7-full-200'],default='legacy-20mib')
    p.add_argument('--stop-file',type=Path)
    p.add_argument('--heartbeat-file',type=Path)
    p.add_argument('--require-evidence',action='store_true')
    p.add_argument('--interval',type=int,default=60)
    p.add_argument('--deadline',type=float,required=True);p.add_argument('--once',action='store_true')
    a=p.parse_args()
    if not 5<=a.interval<=60:raise ValueError('nuknuk_sync_interval_invalid')
    if a.require_evidence and a.evidence_output is None:p.error('--require-evidence requires --evidence-output')
    if a.stop_file is not None and a.stop_file.exists():p.error('stop-file already exists; do not resume this run')
    if a.heartbeat_file is not None and a.heartbeat_file.exists():p.error('heartbeat-file must be new for this run')
    if any(file is not None and not file.parent.is_dir() for file in (a.stop_file, a.heartbeat_file)):p.error('stop/heartbeat parent directory must already exist')
    if not re.fullmatch(r'\d{1,3}(\.\d{1,3}){3}',a.host) or not 1<=a.port<=65535:raise ValueError('nuknuk_sync_host_invalid')
    a.output.mkdir(parents=True,exist_ok=True,mode=0o700)
    with a.log.open('x') as log:
        while time.time()<a.deadline:
            if a.stop_file is not None and a.stop_file.exists():break
            receipt=sync_once(a)
            log.write(json.dumps(receipt)+'\n');log.flush();print(json.dumps(receipt),flush=True)
            if receipt.get('stopRequired'):break
            if a.once:break
            time.sleep(a.interval)
