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

def query(key_file, document, variables=None):
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
    result = query(key_file, '{ myself { pods { id name desiredStatus costPerHr runtime { uptimeInSeconds } } } }')
    return result['myself']['pods']

def stop(key_file, pod_id):
    if not re.fullmatch('[a-z0-9]{8,30}', pod_id):
        raise ValueError('runpod_pod_id_invalid')
    return query(key_file, 'mutation($id: String!) { podStop(input: { podId: $id }) { id desiredStatus } }', {'id':pod_id})

def budget_deadline(started, prior_usd, hourly_usd, ceiling_usd, reserve_usd):
    values = (started, prior_usd, hourly_usd, ceiling_usd, reserve_usd)
    if not all(math.isfinite(v) for v in values) or hourly_usd <= 0 or prior_usd < 0 or reserve_usd < 1 or ceiling_usd > 20:
        raise ValueError('runpod_budget_invalid')
    available = ceiling_usd - prior_usd - reserve_usd
    if available <= 0:
        raise ValueError('runpod_budget_exhausted')
    return started + available / hourly_usd * 3600

def watch(args):
    if not re.fullmatch('[a-z0-9]{8,30}', args.pod):
        raise ValueError('runpod_pod_id_invalid')
    deadline = min(args.deadline, budget_deadline(args.started, args.prior_usd, args.hourly_usd, args.ceiling_usd, args.reserve_usd))
    if args.log.exists():
        raise ValueError('runpod_watch_log_exists')
    # An exclusive log and pinned Pod prevent accidentally attaching to a new run.
    with args.log.open('x') as log:
        os.chmod(args.log, 0o600)
        def record(event, **data):
            receipt = {'at':datetime.now(timezone.utc).isoformat(),'event':event,'podId':args.pod,**data}
            log.write(json.dumps(receipt)+'\n');log.flush();os.fsync(log.fileno())
            print(json.dumps(receipt),flush=True)
        record('WATCH_ARMED',deadlineEpoch=deadline,ceilingUsd=args.ceiling_usd,priorUsd=args.prior_usd,reserveUsd=args.reserve_usd)
        stopping = False
        while True:
            try:
                pods = status(args.key_file)
                pod = next((p for p in pods if p['id']==args.pod),None)
                if not pod:
                    record('POD_ABSENT_REQUIRES_BILLING_REVIEW');return
                running = pod['desiredStatus']=='RUNNING'
                rate = float(pod.get('costPerHr') or 0)
                if not running and not pod.get('runtime'):
                    record('STOP_CONFIRMED',desiredStatus=pod['desiredStatus'],quotedHourlyUsd=rate);return
                # Unexpected running Pods consume the same account budget; stop
                # our allowlisted training Pod, never somebody else's resource.
                other_running=[p['id'] for p in pods if p['id']!=args.pod and p['desiredStatus']=='RUNNING']
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
    p.add_argument('command',choices=['status','stop','watch']);p.add_argument('--key-file',type=Path,required=True)
    p.add_argument('--pod');p.add_argument('--started',type=float);p.add_argument('--deadline',type=float)
    p.add_argument('--prior-usd',type=float,default=1.75);p.add_argument('--hourly-usd',type=float,default=4.1)
    p.add_argument('--ceiling-usd',type=float,default=20);p.add_argument('--reserve-usd',type=float,default=1.5)
    p.add_argument('--log',type=Path);p.add_argument('--stop-file',type=Path)
    a=p.parse_args()
    if a.command=='status':print(json.dumps(status(a.key_file)))
    elif a.command=='stop':print(json.dumps(stop(a.key_file,a.pod)))
    else:
        if None in (a.pod,a.started,a.deadline,a.log,a.stop_file):p.error('watch requires explicit Pod, start, deadline, log and stop-file')
        watch(a)
