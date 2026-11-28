"""Cloud speed financial, streaming and ownership boundaries; no network/GPU."""
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT=Path(__file__).parent

def load(name):
    spec=importlib.util.spec_from_file_location(name.replace('-','_'),ROOT/(name+'.py'))
    obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj);return obj

cloud=load('nuknuk-cloud-speed');worker=load('nuknuk-cloud-speed-worker');beta=load('nuknuk-beta-run')


class CloudBoundaries(unittest.TestCase):
    def test_budget_reserves_one_dollar_and_cannot_exceed5(self):
        self.assertAlmostEqual((cloud.deadline(100,4.44)-100)*4.44/3600,4)
        for bad in (True,0,-1,4.51,float('nan'),float('inf')):
            with self.assertRaisesRegex(ValueError,'rate_invalid'):cloud.deadline(0,bad)

    def test_roster22_max_with_primers_and_network_and_correct_pairorder(self):
        rows=worker.roster()
        self.assertEqual(len(rows),13);self.assertEqual(sum(r['warmup']for r in rows),1)
        self.assertEqual(len(rows)+sum(r['condition']=='cached'for r in rows)+3,22)
        for case in range(3):
            self.assertEqual([r['condition']for r in rows if r['case']==case and not r['warmup']],['cold','cached','cached','cold'])

    def test_full_prompt_budget_and_schema_preserved_no_second_template(self):
        case={'prefixIds':list(range(3999)),'outputSchema':{'type':'object'},'eosTokenId':248044}
        value=worker.body(case)
        self.assertEqual(value['prompt'],case['prefixIds']);self.assertEqual(value['max_tokens'],1121)
        self.assertEqual(value['model'],'zero9b');self.assertFalse(value['add_special_tokens'])
        self.assertEqual(value['structured_outputs'],{'json':case['outputSchema']})
        self.assertTrue(value['stream_options']['include_usage']);self.assertTrue(value['return_token_ids'])

    def test_sse_keeps_token_deltas_and_usage_after_terminal(self):
        packets=[{'model':'zero9b','choices':[{'index':0,'prompt_token_ids':[9,8],'token_ids':[1],'text':'{'}]},
                 {'model':'zero9b','choices':[{'index':0,'token_ids':[2,3],'text':'}','finish_reason':'stop'}]},
                 {'model':'zero9b','choices':[],'usage':{'prompt_tokens':2,'completion_tokens':3,'prompt_tokens_details':{'cached_tokens':0}}}]
        lines=[b': ping\n']+[('data: '+json.dumps(p)+'\n').encode()for p in packets]+[b'data: [DONE]\n']
        times=iter(range(5));out=worker.parse_stream(lines,clock=lambda:next(times))
        self.assertEqual(out['ids'],[1,2,3]);self.assertEqual(out['arrivals'],[1,2,2])
        self.assertEqual(out['usage']['completion_tokens'],3);self.assertEqual(out['promptIds'],[9,8])
        self.assertEqual(out['models'],['zero9b']);self.assertEqual(out['text'],'{}')

    def test_incomplete_or_error_sse_never_becomes_success(self):
        for lines in ([b'data: [DONE]\n'],[b'data: {"error":"synthetic"}\n']):
            with self.assertRaises(ValueError):worker.parse_stream(lines)

    def test_speed_owned_uses_rest_and_cannot_touch_preexisting_pods(self):
        with TemporaryDirectory()as tmp:
            folder=Path(tmp);state={'limitPolicy':cloud.POLICY,'runName':'ours','podId':'abcdefgh','preexistingPodIds':['oldpod00']}
            (folder/'state.json').write_text(json.dumps(state))
            rows=[{'id':'oldpod00','name':'ours'},{'id':'abcdefgh','name':'ours'}]
            with patch.object(beta,'catalog_pods',return_value=rows),patch.object(beta.watch,'status',side_effect=AssertionError('legacy GraphQL forbidden')):
                self.assertEqual(beta.owned(folder,Path('synthetic'))['id'],'abcdefgh')

    def test_new_speed_kind_reuses_failure_deadline_and_observation_guard(self):
        state={'deadline':100,'podId':'abcdefgh','computeRateCap':4.42,'heartbeat':50}
        self.assertEqual(beta.guard_stop_reason(state,None,100,99),'COST_DEADLINE_REACHED')
        self.assertEqual(beta.guard_stop_reason(state,None,99,0),'PROVIDER_OBSERVATION_EXPIRED')
        pod={'id':'abcdefgh','desiredStatus':'RUNNING','costPerHr':5}
        self.assertEqual(beta.guard_stop_reason(state,pod,60,60),'POD_TARIFF_EXCEEDED')

    def test_native_notstop_targets_only_valid_owned_speed_process_group(self):
        value={'kind':'BACKYRD_CLOUD_SPEED_OWNED_GROUP_V1','podId':'ours','root':'/workspace/backyrd-cloud-speed','processGroup':200}
        with patch.object(Path,'read_text',return_value=json.dumps(value)),patch.object(beta.os,'getpgrp',return_value=100),patch.object(beta.os,'killpg')as kill:
            beta.stop_owned_speed_group('/tmp/backyrd-speed-owned.json','ours')
            kill.assert_called_once_with(200,beta.signal.SIGTERM)
            with self.assertRaisesRegex(ValueError,'identity_invalid'):beta.stop_owned_speed_group('/tmp/backyrd-speed-owned.json','other')
            with self.assertRaisesRegex(ValueError,'not_allowlisted'):beta.stop_owned_speed_group('/tmp/other','ours')
        self.assertIn('stop_owned_speed_group',beta.NATIVE_GUARD)

    def test_lora_observer_keeps_original_return_and_records_actual_load(self):
        import sys
        from types import ModuleType
        observer=load('nuknuk-cloud-lora-observer')
        tensor=SimpleNamespace(shape=(16,4096),dtype='torch.bfloat16')
        result=SimpleNamespace(id=1,rank=16,loras={'target':SimpleNamespace(lora_a=tensor,lora_b=tensor,scaling=2)})
        class FakeLoRA:
            @classmethod
            def from_local_checkpoint(cls,*a,**kw):return result
        torch=ModuleType('torch');torch.count_nonzero=lambda a:SimpleNamespace(item=lambda:0)
        module=ModuleType('vllm.lora.lora_model');module.LoRAModel=FakeLoRA
        with TemporaryDirectory()as tmp,patch.dict(sys.modules,{'torch':torch,'vllm.lora.lora_model':module}):
            observer.install(tmp)
            self.assertIs(FakeLoRA.from_local_checkpoint('bound'),result)
            receipt=json.loads(next(Path(tmp).glob('lora-load-*.json')).read_text())
            self.assertEqual(receipt['modules']['target']['bNonzero'],0)
            self.assertEqual(receipt['rank'],16);self.assertFalse(receipt['observerChangesWeights'])

    def test_remote_launcher_returns_while_its_owned_child_is_still_running(self):
        import os,signal,subprocess,sys,time
        with TemporaryDirectory()as tmp:
            root=Path(tmp);(root/'worker.py').write_text('import time; time.sleep(5)')
            started=time.monotonic();child=None
            try:
                result=subprocess.run([sys.executable,'-B','-c',cloud.launch_code(root)],capture_output=True,text=True,timeout=2)
                self.assertEqual(result.returncode,0);child=int(result.stdout.strip())
                self.assertLess(time.monotonic()-started,2)
                self.assertEqual(os.getpgid(child),child)
            finally:
                if child is not None:
                    try:os.killpg(child,signal.SIGTERM)
                    except ProcessLookupError:pass

    def test_removed_prior_attempt_cost_cannot_be_reset(self):
        import hashlib
        with TemporaryDirectory()as tmp:
            path=Path(tmp)/'prior.json'
            state={'phase':'REMOVED','resourcesRemoved':True,'limitPolicy':cloud.POLICY,'totalCeilingUsd':5,
                'initialBalanceUsd':8.75,'podId':'old-owned','started':100,'heartbeat':206,'allInHourlyRateUsd':4.44,'finalObservedDebitUsd':0}
            path.write_text(json.dumps(state))
            plan={'campaignInitialCreditUsd':8.75,'priorConservativeUsd':.2,
                'priorAttempts':[{'stateFile':str(path),'stateSha256':hashlib.sha256(path.read_bytes()).hexdigest()}]}
            self.assertEqual(cloud.prior_cost(plan),.2)
            self.assertAlmostEqual((cloud.deadline(0,4.44,.2))*4.44/3600,3.8)
            with self.assertRaisesRegex(ValueError,'reset_refused'):cloud.prior_cost({**plan,'priorConservativeUsd':0})
            state['resourcesRemoved']=False;path.write_text(json.dumps(state));plan['priorAttempts'][0]['stateSha256']=hashlib.sha256(path.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError,'not_secured'):cloud.prior_cost(plan)

    def test_pinned_cache_reset_requires_explicit_success_object(self):
        from unittest.mock import MagicMock
        for payload,success in [(b'{"success":true}',True),(b'{"success":false}',False),(b'true',False),(b'{}',False)]:
            response=MagicMock();response.__enter__.return_value.read.return_value=payload
            with patch.object(worker.urllib.request,'urlopen',return_value=response):
                if success:worker.reset('http://private-test')
                else:
                    with self.assertRaisesRegex(ValueError,'not_confirmed'):worker.reset('http://private-test')

    def test_upload_path_traversal_or_changed_bytes_rejected(self):
        with self.assertRaisesRegex(ValueError,'path_invalid'):
            cloud.package({'upload':{'../secret':{'path':'unused','sha256':'unused'}}})

    def test_lost_create_response_reconciles_and_deletes_without_second_post(self):
        from unittest.mock import MagicMock
        import hashlib
        with TemporaryDirectory()as tmp:
            root=Path(tmp);folder=root/'run';public=root/'public';public.write_text('synthetic-public-key')
            args=SimpleNamespace(operation=folder,key_file=root/'key',speed_plan=root/'plan',public_key=public,private_key=root/'ssh')
            plan={'gpu':'NVIDIA H100 80GB HBM3','sshPublicKeySha256':hashlib.sha256(public.read_bytes()).hexdigest()}
            accounting={'balanceAmount':8,'billingMode':'PREPAID'}
            account={'currentSpendPerHr':0,'networkVolumes':[],'globalVolumes':[],'pods':[],'restRateLimits':{}}
            calls=[]
            def rest(key,method,path,*a,**kw):
                calls.append((method,path))
                if method=='GET'and path.startswith('/v2/catalog/gpus'):
                    return [{'id':plan['gpu'],'secure':True,'availability':'HIGH','price':{'secure':4.39}}]
                if method=='POST':raise TimeoutError('ambiguous create')
                if path=='/v2/billing/balance':return accounting
                raise AssertionError((method,path))
            child=MagicMock();child.poll.return_value=None
            def popen(*a,**kw):
                (folder/'guard.ready').touch();return child
            with patch.object(cloud,'verify',return_value=(plan,worker)),patch.object(cloud,'package',return_value=b'bound'),\
                 patch.object(beta,'catalog_account',return_value=(accounting,account)),patch.object(beta,'rest',side_effect=rest),\
                 patch.object(beta,'owned',return_value={'id':'ours123456'}),patch.object(beta,'catalog_cleanup')as cleanup,\
                 patch.object(cloud.subprocess,'Popen',side_effect=popen),patch.object(beta,'PY',beta.PY):
                with self.assertRaisesRegex(TimeoutError,'ambiguous create'):cloud.run(args,beta)
                cleanup.assert_called_once_with(args,folder)
            state=json.loads((folder/'state.json').read_text())
            self.assertTrue(state['resourcesRemoved']);self.assertEqual(state['phase'],'REMOVED')
            self.assertEqual(sum(method=='POST'for method,path in calls),1)

    def test_authority_refuses_other_budget_or_training_before_files_or_api(self):
        with TemporaryDirectory()as tmp:
            p=Path(tmp)/'plan.json'
            p.write_text(json.dumps({'kind':'CLOUD_9B_MIGRATION_SPEED_5_USD_V1','totalCeilingUsd':50}))
            with self.assertRaisesRegex(ValueError,'authority_invalid'):cloud.verify(p,beta)


if __name__=='__main__':unittest.main()
