"""Small 9B pilot boundaries and real eight-update/save/reload on tiny CPU LoRA."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import weakref
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('native_small',Path(__file__).with_name('nuknuk-native-learning.py'))
native=importlib.util.module_from_spec(spec);spec.loader.exec_module(native)


def payload():
    def row(i,split):
        return {'id':str(i),'family':str(i),'scenarioGroup':str(i),'query':'synthetic','split':split,
            'messages':[{'role':'system','content':'system'},{'role':'user','content':'synthetic'}],
            'target':'{}','outputSchema':{'type':'object'}}
    train=[row(i,'TRAIN')for i in range(40)];dev=[row(i,'DEV')for i in range(40,64)]
    return {'train':train,'dev':dev,'evaluation':train[:12]+dev}


class SmallBoundaries(unittest.TestCase):
    def test_roster_has8_train4_dev_and6_separate_generation_cases(self):
        train,dev,generated=native.small_rows(payload())
        self.assertEqual((len(train),len(dev),len(generated)),(8,4,6))
        self.assertFalse({r['id']for r in train}&{r['id']for r in dev})
        self.assertEqual(len([r for r in generated if r['split']=='TRAIN']),2)
        self.assertEqual(native.SMALL_CONFIG['steps'],8)
        self.assertEqual(native.SMALL_CONFIG['learningRate'],2e-5)

    def test_scope_refuses_extra_steps_or_no_optimizer_or_changed_rows(self):
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);g=root/'grad.json';g.write_text(json.dumps({'status':'FULL_GRADIENT_FINISHED_NO_UPDATES',
                'gradientTensorCount':64,'allGradientsFinite':True,'allFactorHashesUnchanged':True,
                'allModuleScalesUnchanged':True,'optimizerUpdates':0}))
            restore=root/'restored.json';restore.write_text('{"status":"HEALTHY_ORIGINAL_RESTORED"}')
            rows=payload();train,dev,gen=native.small_rows(rows)
            keys=['inverse-source','speed-source','full-gradient-result','full-gradient-restore','full-gradient-review','pilot-tests','pilot-label-review']
            files={k:{'path':str(restore if k=='full-gradient-restore'else g)}for k in keys}
            plan={'pilotConfig':native.SMALL_CONFIG.copy(),'optimizerAllowed':True,'useUnitInverseVjp':True,'workerTimeoutSeconds':1800,
                'files':files,'pilotRowIds':{'train':[r['id']for r in train],'dev':[r['id']for r in dev],'generation':[r['id']for r in gen]}}
            native.verify_small_pilot(plan,rows)
            for key,value in [('optimizerAllowed',False),('pilotConfig',{**native.SMALL_CONFIG,'steps':9}),('pilotRowIds',{})]:
                with self.assertRaisesRegex(ValueError,'scope_invalid'):native.verify_small_pilot({**plan,key:value},rows)
            x=json.loads(g.read_text());x['allGradientsFinite']=False;g.write_text(json.dumps(x))
            with self.assertRaisesRegex(ValueError,'prerequisite_invalid'):native.verify_small_pilot(plan,rows)

    def test_second_recipe_rejected_before_live_pause(self):
        with tempfile.TemporaryDirectory()as tmp:
            with self.assertRaisesRegex(ValueError,'no_second_recipe'):
                native.execute(SimpleNamespace(native_plan=Path(tmp)/'plan.json',recipe='B'),{'kind':native.SMALL_LEARNING_KIND})


class TinyCpuPilot(unittest.TestCase):
    def test_entire_shared_worker8_updates_checkpoints_save_reload_and_losses(self):
        import mlx.core as mx
        import mlx.nn as nn
        from mlx.utils import tree_flatten
        import mlx_vlm
        import importlib
        generate_module=importlib.import_module('mlx_vlm.generate')
        mx.set_default_device(mx.cpu)
        class Layer(nn.Module):
            def __init__(self):
                super().__init__();self.lora_a=mx.full((1,16),.1);self.lora_b=mx.zeros((16,1))
                self.scale=2.;self.dropout=nn.Dropout(0.)
            def __call__(self,x):return x
        class Tiny(nn.Module):
            def __init__(self):
                super().__init__();self.language_model=nn.Module();self.language_model.model=nn.Module()
                self.language_model.model.layers=[Layer()for _ in range(32)]
            def get_input_embeddings(self,ids):return ids
        def loss(model,ids,labels,start,stop):
            out=sum(mx.sum(layer.lora_a@layer.lora_b)*layer.scale for layer in model.language_model.model.layers)
            return (out-1)**2
        tokenizer=SimpleNamespace(eos_token_id=0,apply_chat_template=lambda *a,**k:'prompt',encode=lambda *a,**k:[1,2])
        def stream(model,processor,prompt,**kwargs):
            model.get_input_embeddings(mx.array([[1,2]]))
            yield SimpleNamespace(text='{}',token=None,finish_reason='stop',token_ids=[0])
        loads=[]
        model_refs=[]
        def load(model_path,adapter_path):
            if model_refs:
                self.assertIsNone(model_refs[-1](), 'prior model must be freed before reload')
            model=Tiny();model_refs.append(weakref.ref(model));model.load_weights(list(mx.load(str(Path(adapter_path)/'adapters.safetensors')).items()))
            loads.append(adapter_path);return model,tokenizer
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);run=root/'trial-A';run.mkdir();(run/'session.json').write_text('{}')
            seed=root/'seed';seed.mkdir();model=Tiny()
            mx.save_safetensors(str(seed/'adapters.safetensors'),{k:v for k,v in tree_flatten(model.parameters())})
            (seed/'adapter_config.json').write_text('{}');seed_sha=native.sha(seed/'adapters.safetensors');del model
            data=payload();pre=root/'preflight.json'
            digest=lambda x:hashlib.sha256(json.dumps(x,separators=(',',':')).encode()).hexdigest()
            pre.write_text(json.dumps({'cases':{r['id']:{'prefixSha256':digest([1,2]),'targetSha256':digest([0])}for r in data['train']+data['dev']}}))
            plan={'kind':native.SMALL_LEARNING_KIND,'runtimeVersions':{},'model':'tiny-cpu','adapter':str(seed),
                'recipes':{'A':{'steps':8,'learningRate':2e-5}},'initialAdapterSha256':seed_sha,'liveAdapterSha256':'unused',
                'initialAdapterConfigSha256':native.sha(seed/'adapter_config.json'),'liveAdapterConfigSha256':'unused',
                'files':{'tokenization':{'path':str(pre)}}}
            args=SimpleNamespace(native_plan=root/'plan.json',manifest_sha256='synthetic',recipe='A',session=run)
            parent=str(native.ROOT/'nuknuk-resource-guard.py')+' '+str(run/'resources.json')
            with patch.object(native,'verify_plan',return_value=(plan,data)),patch.object(native.subprocess,'check_output',return_value=parent),\
                 patch.object(mlx_vlm,'load',side_effect=load),patch.object(generate_module,'stream_generate',new=stream),\
                 patch.object(native,'encode_row',return_value=([1,2],[0])),patch.object(native,'answer_only_loss',new=loss),\
                 patch('mlx_vlm.structured.build_json_schema_logits_processor',return_value=object()):
                native.worker(args)
            rows=[json.loads(line)for line in (run/'updates.jsonl').read_text().splitlines()]
            self.assertEqual([r['optimizerStep']for r in rows],list(range(1,9)))
            self.assertTrue(all(r['gradientTensorCount']==64 for r in rows))
            self.assertEqual(len(list((run/'checkpoints').glob('step-*'))),8)
            self.assertEqual(len(loads),2)
            self.assertTrue(native.read(run/'reload-receipt.json')['allSavedFactorsReloadedExactly'])
            before=native.read(run/'recall-loss-before.json')['losses'];after=native.read(run/'recall-loss-after.json')['losses']
            self.assertEqual(len(before),12);self.assertTrue(all(after[k]<before[k]for k in before))
            self.assertEqual(native.sha(seed/'adapters.safetensors'),seed_sha)
            self.assertEqual(native.read(run/'result.json')['evaluationCasesPerAdapter'],6)
            with self.assertRaisesRegex(ValueError,'already_exists'):
                native.checkpoint_adapter(run,1,{},seed/'adapter_config.json')


if __name__=='__main__':unittest.main()
