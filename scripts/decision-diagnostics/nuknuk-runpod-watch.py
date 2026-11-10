"""Local, allowlisted Pod status/stop and a fail-closed budget watchdog.

Never creates/restarts Pods; never logs credentials. The credential stays local.
A caffeinate parent prevents idle Mac sleep, not network or hardware failure.
"""
import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
import time
import urllib.request

ENDPOINT = 'https://api.runpod.io/graphql'

def container_identity():
    # Explicitly approved existing provider credential. Never persist, emit or
    # copy it, and never fall back to a different environment secret.
    import sys
    if sys.platform!='linux':raise ValueError('runpod_container_key_linux_only')
    values=dict(item.split(b'=',1) for item in Path('/proc/1/environ').read_bytes().split(b'\0') if b'=' in item)
    secret=values.get(b'RUNPOD_API_KEY',b'').decode()
    pod=values.get(b'RUNPOD_POD_ID',b'').decode()
    if not re.fullmatch(r'[A-Za-z0-9_-]{20,256}',secret) or not re.fullmatch('[a-z0-9]{8,30}',pod):
        raise ValueError('runpod_container_identity_invalid')
    return pod,secret


def query(key_file, document, variables=None):
    if key_file is None:
        _,secret=container_identity()
    else:
        path = key_file.resolve(strict=True)
        if path.stat().st_mode & 0o077:
            raise ValueError('runpod_key_permissions_must_be_0600')
        secret = path.read_text().strip()
        if not re.fullmatch(r'rpa_[A-Za-z0-9_-]+', secret):
            raise ValueError('runpod_key_format_invalid')
    request = urllib.request.Request(ENDPOINT, data=json.dumps({'query': document, 'variables': variables or {}}).encode(),
        headers={'Content-Type':'application/json','Authorization':'Bearer '+secret}, method='POST')
    # Exceptions expose the public endpoint, not the Authorization header.
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.load(response)
    if result.get('errors') or 'data' not in result:
        raise ValueError('runpod_api_request_rejected')
    return result['data']

def status(key_file):
    if key_file is None:
        pod,_=container_identity()
        result=query(None,'query($id: String!) { pod(input: {podId: $id}) { id name desiredStatus costPerHr runtime { uptimeInSeconds } } }',{'id':pod})
        return [result['pod']] if result.get('pod') else []
    result = query(key_file, '{ myself { pods { id name desiredStatus costPerHr runtime { uptimeInSeconds } } } }')
    return result['myself']['pods']

def stop(key_file, pod_id):
    if not re.fullmatch('[a-z0-9]{8,30}', pod_id):
        raise ValueError('runpod_pod_id_invalid')
    if key_file is None and pod_id!=container_identity()[0]:
        raise ValueError('runpod_container_stop_own_pod_only')
    return query(key_file, 'mutation($id: String!) { podStop(input: { podId: $id }) { id desiredStatus } }', {'id':pod_id})

def budget_deadline(started, prior_usd, hourly_usd, ceiling_usd, reserve_usd, budget_profile='legacy-20'):
    profiles = {'legacy-20': (20, 1), 'v7-full-200': (200, 20)}
    if budget_profile not in profiles:
        raise ValueError('runpod_budget_profile_invalid')
    maximum, minimum_reserve = profiles[budget_profile]
    values = (started, prior_usd, hourly_usd, ceiling_usd, reserve_usd)
    if not all(math.isfinite(v) for v in values) or hourly_usd <= 0 or prior_usd < 0 or reserve_usd < minimum_reserve or ceiling_usd > maximum:
        raise ValueError('runpod_budget_invalid')
    available = ceiling_usd - prior_usd - reserve_usd
    if available <= 0:
        raise ValueError('runpod_budget_exhausted')
    return started + available / hourly_usd * 3600

def validate_pod_snapshot(pod):
    """Only explicit running or fully stopped snapshots are actionable evidence."""
    if not isinstance(pod, dict) or not re.fullmatch('[a-z0-9]{8,30}', str(pod.get('id', ''))):
        raise ValueError('runpod_status_identity_unknown')
    if pod.get('desiredStatus') not in ('RUNNING', 'EXITED') or 'runtime' not in pod:
        raise ValueError('runpod_status_unknown')
    raw_rate = pod.get('costPerHr')
    if isinstance(raw_rate, bool):
        raise ValueError('runpod_status_rate_unknown')
    try:
        rate = float(raw_rate)
    except (TypeError, ValueError):
        raise ValueError('runpod_status_rate_unknown') from None
    if not math.isfinite(rate) or rate <= 0:
        raise ValueError('runpod_status_rate_unknown')
    runtime = pod['runtime']
    if pod['desiredStatus'] == 'EXITED':
        if runtime is not None:
            raise ValueError('runpod_stopped_runtime_unconfirmed')
        return False, rate
    if not isinstance(runtime, dict):
        raise ValueError('runpod_running_runtime_unknown')
    uptime = runtime.get('uptimeInSeconds')
    if isinstance(uptime, bool) or not isinstance(uptime, (int, float)) or not math.isfinite(uptime) or uptime < 0:
        raise ValueError('runpod_running_uptime_unknown')
    return True, rate

def watch(args):
    if not re.fullmatch('[a-z0-9]{8,30}', args.pod):
        raise ValueError('runpod_pod_id_invalid')
    if not math.isfinite(args.deadline):
        raise ValueError('runpod_deadline_invalid')
    profile = getattr(args, 'budget_profile', 'legacy-20')
    deadline = min(args.deadline, budget_deadline(args.started, args.prior_usd, args.hourly_usd, args.ceiling_usd, args.reserve_usd, profile))
    if args.log.exists():
        raise ValueError('runpod_watch_log_exists')
    # An exclusive log and pinned Pod prevent accidentally attaching to a new run.
    with args.log.open('x') as log:
        os.chmod(args.log, 0o600)
        def record(event, **data):
            receipt = {'at':datetime.now(timezone.utc).isoformat(),'event':event,'podId':args.pod,**data}
            log.write(json.dumps(receipt)+'\n');log.flush();os.fsync(log.fileno())
            print(json.dumps(receipt),flush=True)
        record('WATCH_ARMED',deadlineEpoch=deadline,ceilingUsd=args.ceiling_usd,priorUsd=args.prior_usd,reserveUsd=args.reserve_usd,budgetProfile=profile)
        stopping = False
        while True:
            try:
                pods = status(args.key_file)
                pod = next((p for p in pods if p['id']==args.pod),None)
                if not pod:
                    raise ValueError('runpod_pod_absent_stop_unconfirmed')
                running, rate = validate_pod_snapshot(pod)
                if not running:
                    record('STOP_CONFIRMED',desiredStatus=pod['desiredStatus'],quotedHourlyUsd=rate);return
                # Unexpected running Pods consume the same account budget; stop
                # our allowlisted training Pod, never somebody else's resource.
                other_running=[]
                for other in pods:
                    if other['id'] != args.pod and validate_pod_snapshot(other)[0]:
                        other_running.append(other['id'])
                if other_running or rate > args.hourly_usd or time.time() >= deadline or args.stop_file.exists():
                    stopping=True
                if stopping:
                    stop(args.key_file,args.pod);record('STOP_REQUESTED',otherRunningPods=other_running,quotedHourlyUsd=rate)
                else:
                    record('STATUS',desiredStatus=pod['desiredStatus'],quotedHourlyUsd=rate,
                        estimatedTotalUsd=args.prior_usd+max(0,time.time()-args.started)*args.hourly_usd/3600)
            except Exception as error:
                # Any lost status signal triggers bounded stop retries rather
                # than allowing the training budget to run silently onward.
                stopping=True
                record('STATUS_FAILURE_STOP_REQUIRED',errorType=type(error).__name__)
                try: stop(args.key_file,args.pod);record('FAILSAFE_STOP_REQUESTED')
                except Exception as stop_error: record('STOP_FAILED_RETRYING',errorType=type(stop_error).__name__)
            time.sleep(10 if stopping else 30)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('command',choices=['status','stop','watch'])
    credentials=p.add_mutually_exclusive_group(required=True)
    credentials.add_argument('--key-file',type=Path)
    credentials.add_argument('--container-key',action='store_true')
    p.add_argument('--pod');p.add_argument('--started',type=float);p.add_argument('--deadline',type=float)
    p.add_argument('--prior-usd',type=float,default=1.75);p.add_argument('--hourly-usd',type=float,default=4.1)
    p.add_argument('--ceiling-usd',type=float,default=20);p.add_argument('--reserve-usd',type=float,default=1.5)
    p.add_argument('--budget-profile',choices=['legacy-20','v7-full-200'],default='legacy-20')
    p.add_argument('--log',type=Path);p.add_argument('--stop-file',type=Path)
    a=p.parse_args()
    if a.command=='status':print(json.dumps(status(a.key_file)))
    elif a.command=='stop':print(json.dumps(stop(a.key_file,a.pod)))
    else:
        if None in (a.pod,a.started,a.deadline,a.log,a.stop_file):p.error('watch requires explicit Pod, start, deadline, log and stop-file')
        watch(a)
