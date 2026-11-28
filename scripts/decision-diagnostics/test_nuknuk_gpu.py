"""CPU-only bundle, masking and matrix-transfer tests. No model downloads."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location("nuknuk_gpu", Path(__file__).with_name("nuknuk-gpu.py"))
gpu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gpu)


class GpuPreparationTests(unittest.TestCase):
    def test_diagnostic_selection_requires_correction_profile_and_all_identity_guards(self):
        receipt = dict(status='CANDIDATE_FROZEN_FOR_DIAGNOSTIC_TEST', selectionPolicy='ONE_PREREGISTERED_FINAL_CHECKPOINT', semanticQualityApproved=False, activationAuthorized=False, datasetHash='data', bundleManifestSha256='bundle', parentAdapterSha256='p', candidateAdapterSha256='c', testUsedForSelection=False)
        source = {'catalogVariant':'understanding-correction-v1'}
        gpu.validate_beta_selection(receipt, source, {'datasetHash':'data'}, 'bundle', 'c')
        for changed in [{'semanticQualityApproved':True}, {'activationAuthorized':True}, {'selectionPolicy':'BEST_TEST'}, {'datasetHash':'other'}, {'bundleManifestSha256':'other'}, {'testUsedForSelection':True}]:
            with self.assertRaisesRegex(ValueError, 'selection_not_bound'):
                gpu.validate_beta_selection({**receipt,**changed}, source, {'datasetHash':'data'}, 'bundle', 'c')
        for bad_source, adapter in [({'catalogVariant':'general'}, 'c'), (source,'unknown')]:
            with self.assertRaisesRegex(ValueError,'selection_not_bound'):
                gpu.validate_beta_selection(receipt, bad_source, {'datasetHash':'data'}, 'bundle', adapter)
        gpu.validate_beta_selection({**receipt, 'status':'DEV_PASSED_FROZEN_SELECTION'}, {'catalogVariant':'general'}, {'datasetHash':'data'}, 'bundle', 'p')

    def test_evaluation_only_execution_rejects_model_training_before_weights_or_native_preparation(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        with tempfile.TemporaryDirectory()as name:
            folder=Path(name);args=SimpleNamespace(bundle=folder,execution_approval=folder/'auth')
            with patch.object(gpu,'verify_product_gpu_bundle',return_value={}),patch.object(gpu,'beta_execution_admission',return_value={'evaluationOnly':True}),patch.object(gpu,'verify_beta_native')as native,patch.object(gpu,'product_base')as base:
                with self.assertRaisesRegex(ValueError,'evaluation_only_training_forbidden'):gpu.train_beta_catalog(args)
                native.assert_not_called();base.assert_not_called()

    def test_completed_candidate_conversion_preserves_projection_and_rejects_bad_tensors(self):
        keys=[f'language_model.model.layers.{i}.self_attn.{p}_proj' for i in range(3,40,4) for p in ('k','o','q','v')]
        rng=np.random.default_rng(42)
        parent={k+'.lora_'+s:np.zeros((3,16) if s=='a' else (16,5),dtype=np.float32) for k in keys for s in ('a','b')}
        arrays={k.replace('language_model.model.layers.','base_model.model.model.language_model.layers.').replace('.lora_a','.lora_A.weight').replace('.lora_b','.lora_B.weight'):rng.normal(size=v.T.shape).astype(np.float32) for k,v in parent.items()}
        result=gpu.transpose_product_candidate(arrays,parent,keys)
        for key in keys:
            hk=key.replace('language_model.model.layers.','base_model.model.model.language_model.layers.')
            np.testing.assert_array_equal(result[key+'.lora_a'].T,arrays[hk+'.lora_A.weight'])
            np.testing.assert_allclose(result[key+'.lora_a']@result[key+'.lora_b'],(arrays[hk+'.lora_B.weight']@arrays[hk+'.lora_A.weight']).T,atol=1e-5)
        first=next(iter(arrays))
        for replacement in [np.full(arrays[first].shape,np.nan,dtype=np.float32),arrays[first].astype(np.float16),np.ones((1,1),dtype=np.float32)]:
            with self.assertRaisesRegex(ValueError,'projection_invalid'):gpu.transpose_product_candidate(dict(arrays,**{first:replacement}),parent,keys)
        with self.assertRaisesRegex(ValueError,'projection_invalid'):gpu.transpose_product_candidate({k:v for k,v in arrays.items() if k!=first},parent,keys)
        with self.assertRaisesRegex(ValueError,'unexpected_tensors'):gpu.transpose_product_candidate(dict(arrays,unexpected=np.ones((1,1),dtype=np.float32)),parent,keys)

    def test_current_product_parent_requires_exact_adapters_not_just_matching_names(self):
        import struct
        def save(path, arrays):
            header,parts,offset = {},[],0
            for key,array in arrays.items():
                raw=np.asarray(array,dtype='<f4').tobytes()
                header[key]={'dtype':'F32','shape':list(array.shape),'data_offsets':[offset,offset+len(raw)]}
                parts.append(raw);offset+=len(raw)
            encoded=json.dumps(header).encode()
            path.write_bytes(struct.pack('<Q',len(encoded))+encoded+b''.join(parts))
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);mlx=root/'mlx';hf=root/'hf';mlx.mkdir();hf.mkdir()
            keys=[f'language_model.model.layers.{i}.self_attn.{p}_proj' for i in range(3,40,4) for p in ('k','o','q','v')]
            arrays={k+'.lora_'+suffix:np.ones((2,16) if suffix=='a' else (16,2),dtype=np.float32) for k in keys for suffix in ('a','b')}
            converted={k.replace('language_model.model.layers.','base_model.model.model.language_model.layers.').replace('.lora_a','.lora_A.weight').replace('.lora_b','.lora_B.weight'):v.T for k,v in arrays.items()}
            save(mlx/'adapters.safetensors',arrays);save(hf/'adapter_model.safetensors',converted)
            (mlx/'adapter_config.json').write_text(json.dumps({'fine_tune_type':'lora','lora_parameters':{'rank':16,'scale':2,'keys':keys}}))
            (hf/'adapter_config.json').write_text(json.dumps({'r':16,'lora_alpha':32,'target_modules':['q_proj','k_proj','v_proj','o_proj']}))
            parent={'mlxBase':{'repo':'mlx-community/Qwen3.6-35B-A3B-4bit','revision':'38740b847e4cb78f352aba30aa41c76e08e6eb46'},'trainingBase':{'repo':'Qwen/Qwen3.6-35B-A3B','revision':'995ad96eacd98c81ed38be0c5b274b04031597b0'}}
            def bind():
                for folder,name,field in [(mlx,'adapters.safetensors','mlxAdapterSha256'),(hf,'adapter_model.safetensors','hfAdapterSha256'),(mlx,'adapter_config.json','mlxAdapterConfigSha256'),(hf,'adapter_config.json','hfAdapterConfigSha256')]:
                    parent[field]=gpu.file_sha(folder/name)
                (root/'manifest.json').write_text(json.dumps({'version':'backyrd.nuknuk-product-training-manifest@1','parent':parent}))
            bind()
            result=gpu.verify_product_parent(root,mlx,hf,root/'valid.json')
            self.assertEqual(result['tensors'],80)
            self.assertFalse(result['nativeBaseNumericalParityVerified'])
            first=next(iter(converted));converted[first]=converted[first].copy();converted[first][0,0]=2
            save(hf/'adapter_model.safetensors',converted)
            with self.assertRaisesRegex(ValueError,'file_changed'):gpu.verify_product_parent(root,mlx,hf,root/'invalid.json')
            bind() # Even a newly hashed but mathematically different adapter is rejected.
            with self.assertRaisesRegex(ValueError,'projection_mismatch'):gpu.verify_product_parent(root,mlx,hf,root/'invalid.json')
            self.assertFalse((root/'invalid.json').exists())

    def test_full_recipe_covers_every_training_row_each_epoch_with_explicit_task_objective(self):
        from collections import Counter
        cases=[]
        for task,count in [('INTERPRET_REQUEST',700),('ASSESS_CANDIDATES',104),('PLAN_SEARCH',84),('PROPOSE_EXPERIENCE',84)]:
            cases.extend({'id':f'{task}-{i}','task':task,'split':'TRAIN','scenarioGroup':f'{task}-group-{i//3}'} for i in range(count))
        schedule=gpu.build_v7_full_schedule(cases)
        self.assertEqual(len(schedule),972)
        self.assertEqual(schedule,gpu.build_v7_full_schedule([dict(row,answerTokens=999,fit='WEAK') for row in cases]))
        for epoch in (1,2):
            rows=[row for row in schedule if row['epoch']==epoch]
            self.assertEqual(len(rows),486)
            self.assertEqual(Counter(i for row in rows for i in row['indices']),Counter(range(972)))
            self.assertTrue(all(len(row['indices'])==2 and all(cases[i]['task']==row['task'] for i in row['indices']) for row in rows))
            for task,weight in [('INTERPRET_REQUEST',0.4),('ASSESS_CANDIDATES',0.2),('PLAN_SEARCH',0.2),('PROPOSE_EXPERIENCE',0.2)]:
                self.assertAlmostEqual(sum(row['lossScale'] for row in rows if row['task']==task)/486,weight)
        self.assertNotEqual([r['indices'] for r in schedule[:486]],[r['indices'] for r in schedule[486:]])
        cases[0]['split']='TEST'
        with self.assertRaisesRegex(ValueError,'train_only'):gpu.build_v7_full_schedule(cases)
        cases[0]['split']='TRAIN';cases[0]['id']=cases[1]['id']
        with self.assertRaisesRegex(ValueError,'inventory_invalid'):gpu.build_v7_full_schedule(cases)

    def test_full_recipe_cannot_silently_use_pilot_subset_or_prior_adapter_for_training(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            (folder/'pilot-recipe.json').write_text(json.dumps({'name':gpu.V7_FULL_RECIPE,'strategy':'language-linear','layers':16,
                'learningRate':0.00001,'checkpointEvery':243,'maxTrainingSeconds':32400}))
            args=SimpleNamespace(command='train',recipe=gpu.V7_FULL_RECIPE,initialization='fresh',adapter=None,adapter_sha256=None,
                strategy='language-linear',layers=16,steps=972,batch_size=2,learning_rate=0.00001,checkpoint_every=243,
                completion_head=False,max_seconds=32400)
            manifest={'purpose':gpu.V7_FULL_PURPOSE}
            gpu.v7_recipe_check(folder,manifest,args)
            for steps in (2,210,486,973):
                args.steps=steps
                with self.assertRaisesRegex(ValueError,'training_changed'):gpu.v7_recipe_check(folder,manifest,args)
            args.steps=972;args.initialization='adapter';args.adapter=folder
            with self.assertRaisesRegex(ValueError,'training_changed'):gpu.v7_recipe_check(folder,manifest,args)
            args.command='evaluate'
            gpu.v7_recipe_check(folder,manifest,args)
            args.recipe=gpu.V7_RECIPE
            with self.assertRaisesRegex(ValueError,'explicit_recipe_required'):gpu.v7_recipe_check(folder,manifest,args)

    def test_full_recipe_requires_user_selected_h200_while_pilot_keeps_old_host_floor(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        with patch.object(gpu,'verify_bundle',return_value={'purpose':gpu.V7_FULL_PURPOSE,'model':gpu.MODEL_ID,'revision':gpu.MODEL_REVISION}), \
             patch.object(gpu.sys,'platform','linux'),patch.object(gpu.shutil,'disk_usage',return_value=SimpleNamespace(free=200*1024**3)), \
             patch.object(gpu.subprocess,'check_output',return_value='NVIDIA H100 80GB HBM3, 81559\n') as cards:
            with self.assertRaisesRegex(ValueError,'single_h200_required'):gpu.host_check(Path('.'))
            cards.return_value='NVIDIA H200, 143771\n'
            self.assertEqual(gpu.host_check(Path('.'))['status'],'HOST_AND_BUNDLE_CHECKED')

    def test_v7_schedule_preserves_task_loss_shares_without_repeating_or_training_holdout(self):
        from collections import Counter
        cases=[]
        for task, count in [('INTERPRET_REQUEST',700),('ASSESS_CANDIDATES',104),('PLAN_SEARCH',84),('PROPOSE_EXPERIENCE',84)]:
            cases.extend({'id':f'{task}-{i}','task':task,'split':'TRAIN','scenarioGroup':f'{task}-group-{i//2}'} for i in range(count))
        schedule=gpu.build_v7_schedule(cases)
        self.assertEqual(schedule,gpu.build_v7_schedule(cases))
        self.assertEqual(Counter(r['task'] for r in schedule),{'INTERPRET_REQUEST':84,'ASSESS_CANDIDATES':42,'PLAN_SEARCH':42,'PROPOSE_EXPERIENCE':42})
        indices=[i for row in schedule for i in row['indices']]
        self.assertEqual(len(indices),420)
        self.assertEqual(len(set(indices)),420)
        self.assertTrue(all(len(row['indices'])==2 and all(cases[i]['task']==row['task'] for i in row['indices']) for row in schedule))
        self.assertEqual(gpu.build_v7_schedule(cases,2),schedule[:2])
        changed=[dict(row,answerTokens=9999,fit='STRONG') for row in cases]
        self.assertEqual(gpu.build_v7_schedule(changed),schedule)  # Never schedule by length, fit or target.
        cases[0]['split']='VALIDATION'
        with self.assertRaisesRegex(ValueError,'train_only'):gpu.build_v7_schedule(cases)
        cases[0]['split']='TRAIN';cases[0]['id']=cases[1]['id']
        with self.assertRaisesRegex(ValueError,'inventory_invalid'):gpu.build_v7_schedule(cases)
        with self.assertRaisesRegex(ValueError,'underfill'):gpu.build_v7_schedule([])

    def test_v7_group_diagnostic_keeps_every_task_and_legacy_behavior_is_unchanged(self):
        tasks=['INTERPRET_REQUEST','ASSESS_CANDIDATES','PLAN_SEARCH','PROPOSE_EXPERIENCE']
        rows=[{'id':str(i),'split':'VALIDATION','task':task,'scenarioGroup':'same-situation'} for i,task in enumerate(tasks)]
        rows.append(dict(rows[0],id='test',split='TEST'))
        plan={'cases':rows}
        self.assertEqual(len(gpu.evaluation_rows(plan,'VALIDATION')),4)
        self.assertEqual(len(gpu.evaluation_rows(plan,'VALIDATION',True)),1)
        self.assertEqual({r['task'] for r in gpu.evaluation_rows(plan,'VALIDATION',True,True)},set(tasks))

    def test_explicit_fresh_initialization_never_requests_legacy_seed(self):
        self.assertFalse(gpu.initialization_policy('fresh',None))
        self.assertFalse(gpu.initialization_policy('adapter',Path('prior')))
        self.assertTrue(gpu.initialization_policy('legacy-seed',None))
        for initialization,adapter in [('fresh',Path('prior')),('adapter',None)]:
            with self.assertRaisesRegex(ValueError,'conflict'):gpu.initialization_policy(initialization,adapter)

    def test_inference_rejects_missing_or_wrong_adapter_identity_before_model_imports(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            (folder/'adapter_model.safetensors').write_bytes(b'actual adapter identity')
            with self.assertRaisesRegex(ValueError,'path_required'):
                gpu.load_inference_state(folder,16,'language-linear',initialization='fresh',adapter_sha256='0'*64)
            with self.assertRaisesRegex(ValueError,'pin_required'):
                gpu.load_inference_state(folder,16,'language-linear',adapter=folder,initialization='adapter',adapter_sha256='0'*64)
            with self.assertRaisesRegex(ValueError,'pin_required'):
                gpu.load_inference_state(folder,16,'language-linear',adapter=folder,initialization='adapter')

    def test_native_parity_detects_same_length_token_drift_not_only_truncation(self):
        from types import SimpleNamespace
        class Native:
            eos_token_id=9
            prefix=[1,2]
            def apply_chat_template(self,*args,**kwargs):return self.prefix
            def encode(self,*args,**kwargs):return [3,4]
        class Raw:
            def encode(self,text,**kwargs):return SimpleNamespace(ids=[1,2] if text=='prefix' else [3,4])
        class Template:
            def render(self,**kwargs):return 'prefix'
        row={'messages':[{'role':'system','content':'rules'},{'role':'user','content':'input'},{'role':'assistant','content':'answer'}]}
        tokenizer=Native()
        ids,labels,prefix,answer=gpu.native_completion_parity(row,tokenizer,Raw(),Template())
        self.assertEqual((ids,labels,prefix,answer),([1,2,3,4,9],[-100,-100,3,4,9],2,[3,4]))
        tokenizer.prefix=[2,1]
        with self.assertRaisesRegex(ValueError,'parity_failed'):gpu.native_completion_parity(row,tokenizer,Raw(),Template())

    def test_v7_recipe_is_opt_in_and_architecture_optimizer_bounds_cannot_drift(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            (folder/'pilot-recipe.json').write_text(json.dumps({'name':gpu.V7_RECIPE,'strategy':'language-linear','layers':16,
                'learningRate':0.00002,'checkpointEvery':70,'maxTrainingSeconds':3000}))
            args=SimpleNamespace(command='train',recipe=gpu.V7_RECIPE,initialization='fresh',adapter=None,adapter_sha256=None,
                strategy='language-linear',layers=16,steps=210,batch_size=2,learning_rate=0.00002,checkpoint_every=70,
                completion_head=False,max_seconds=3000)
            manifest={'purpose':gpu.V7_PURPOSE}
            binding=gpu.v7_recipe_check(folder,manifest,args)
            self.assertEqual(len(binding['executionRecipeHash']),64)
            args.steps=2
            self.assertNotEqual(binding['executionRecipeHash'],gpu.v7_recipe_check(folder,manifest,args)['executionRecipeHash'])
            args.steps=211
            with self.assertRaisesRegex(ValueError,'training_changed'):gpu.v7_recipe_check(folder,manifest,args)
            args.steps=210;args.recipe=None
            with self.assertRaisesRegex(ValueError,'explicit_recipe_required'):gpu.v7_recipe_check(folder,manifest,args)
            self.assertIsNone(gpu.v7_recipe_check(folder,{'purpose':'legacy'},args))

    def test_continuation_requires_exact_immutable_adapter_and_distinct_output(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);adapter=root/'previous';adapter.mkdir()
            file=adapter/'adapter_model.safetensors';file.write_bytes(b'previous weights')
            args=SimpleNamespace(adapter=adapter,adapter_sha256=hashlib.sha256(file.read_bytes()).hexdigest(),output=root/'new')
            self.assertEqual(gpu.training_adapter(args),adapter)
            args.output=adapter/'overwrite'
            with self.assertRaisesRegex(ValueError,'output_overlap'):gpu.training_adapter(args)
            args.output=root/'new';file.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError,'pin_required'):gpu.training_adapter(args)
            args.adapter=None
            with self.assertRaisesRegex(ValueError,'path_required'):gpu.training_adapter(args)
    def arrays(self):
        rng = np.random.default_rng(7)
        prefix = 'language_model.model.layers.63.self_attn.'
        return {prefix + key: (rng.normal(size=shape) * .01).astype(np.float32) for key, shape in {
            'q_proj.lora_a': (5120, 8), 'q_proj.lora_b': (8, 12288),
            'v_proj.lora_a': (5120, 8), 'v_proj.lora_b': (8, 1024)}.items()}

    def test_transfer_preserves_projection_deltas_and_gate_dimensions(self):
        matrices, errors = gpu.transpose_seed(self.arrays())
        self.assertEqual(matrices['model.language_model.layers.63.self_attn.q_proj.lora_B'].shape, (12288, 8))
        self.assertEqual(matrices['model.language_model.layers.63.self_attn.v_proj.lora_A'].shape, (8, 5120))
        self.assertTrue(all(e < 1e-12 for e in errors.values()))

    def test_missing_matrix_and_wrong_architecture_are_not_silently_accepted(self):
        arrays = self.arrays(); arrays.pop(next(iter(arrays)))
        with self.assertRaisesRegex(ValueError, 'seed_keys_invalid'):
            gpu.transpose_seed(arrays)
        arrays = self.arrays(); arrays[next(iter(arrays))] = np.zeros((4096, 8))
        with self.assertRaisesRegex(ValueError, 'seed_shape_or_value_invalid'):
            gpu.transpose_seed(arrays)

    def test_language_targets_exclude_vision_and_preserve_qv_architecture(self):
        import sys
        from types import SimpleNamespace
        from unittest.mock import patch
        class Linear: pass
        modules=[(f'model.language_model.layers.{i}.mlp.up_proj',Linear()) for i in range(200)]
        modules.append(('model.visual.blocks.0.proj',Linear()))
        with patch.dict(sys.modules,{'torch':SimpleNamespace(nn=SimpleNamespace(Linear=Linear))}):
            self.assertEqual(len(gpu.select_targets(modules,1,'language-linear')),200)
            attention=[(f'model.language_model.layers.{i}.self_attn.{q}',Linear()) for i in range(3,64,4) for q in ('q_proj','v_proj')]
            self.assertEqual(len(gpu.select_targets(attention,4,'qv')),8)
            self.assertEqual(len(gpu.select_targets(attention,16,'qv')),32)
            with self.assertRaisesRegex(ValueError,'architecture_changed'):gpu.select_targets(attention[:-1],4,'qv')

    def test_nonfinite_seed_is_rejected(self):
        arrays = self.arrays(); arrays[next(iter(arrays))][0, 0] = np.nan
        with self.assertRaisesRegex(ValueError, 'seed_shape_or_value_invalid'):
            gpu.transpose_seed(arrays)

    def test_completion_mask_excludes_entire_non_thinking_inference_prefix(self):
        class Tokenizer:
            eos_token_id = 14
            def apply_chat_template(self, messages, **kwargs):
                self.messages = messages; self.kwargs = kwargs
                # Transformers 5 defaults to a BatchEncoding. Explicitly request
                # the unbatched token list required by the completion mask.
                return [10, 11] if kwargs.get('return_dict') is False else {'input_ids': [10, 11]}
            def encode(self, text, **kwargs):
                return [12, 13]
        tokenizer = Tokenizer()
        row = {'messages': [{'role': 'system', 'content': 'rules'}, {'role': 'user', 'content': 'wish'}, {'role': 'assistant', 'content': '{}'}]}
        ids, labels = gpu.encode_row(row, tokenizer)
        self.assertEqual(ids, [10, 11, 12, 13, 14])
        self.assertEqual(labels, [-100, -100, 12, 13, 14])
        self.assertFalse(tokenizer.kwargs['enable_thinking'])
        self.assertFalse(tokenizer.kwargs['return_dict'])
        self.assertEqual(len(tokenizer.messages), 2)
        with self.assertRaisesRegex(ValueError, 'would_truncate'):
            gpu.encode_row(row, tokenizer, maximum=4)

    def test_variable_length_training_padding_never_supervises_padding(self):
        rows=gpu.padded_training_rows([([1,2,3],[-100,2,3]),([4,5,6,7],[-100,-100,6,7])],99)
        self.assertEqual(rows['input_ids'][0],[1,2,3,99])
        self.assertEqual(rows['labels'][0],[-100,2,3,-100])
        self.assertEqual(rows['attention_mask'],[[1,1,1,0],[1,1,1,1]])
        with self.assertRaisesRegex(ValueError,'batch_invalid'):gpu.padded_training_rows([],99)

    def test_bundle_tampering_and_path_escape_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / 'bundle'; folder.mkdir()
            (folder / 'data.txt').write_text('approved')
            manifest = {'model': gpu.MODEL_ID, 'revision': gpu.MODEL_REVISION,
                        'parentAdapterSha256': gpu.PARENT_SHA,
                        'files': {'data.txt': hashlib.sha256(b'approved').hexdigest()}}
            (folder / 'bundle.json').write_text(json.dumps(manifest))
            gpu.verify_bundle(folder)
            (folder / 'data.txt').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'bundle_file_changed'):
                gpu.verify_bundle(folder)
            (Path(tmp) / 'outside.txt').write_text('approved')
            manifest['files'] = {'../outside.txt': hashlib.sha256(b'approved').hexdigest()}
            (folder / 'bundle.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'bundle_file_changed'):
                gpu.verify_bundle(folder)

    def test_grammar_consumes_each_completion_token_once_and_never_prompt(self):
        class Matcher:
            def __init__(self): self.tokens = []
            def consume_token(self, token): self.tokens.append(token); return token != 99
            def get_error(self): return None
        matcher = Matcher()
        cursor = gpu.consume_generated(matcher, [], 0)
        cursor = gpu.consume_generated(matcher, [10, 11], cursor)
        cursor = gpu.consume_generated(matcher, [10, 11], cursor)
        cursor = gpu.consume_generated(matcher, [10, 11, 12], cursor)
        self.assertEqual(matcher.tokens, [10, 11, 12])
        with self.assertRaisesRegex(ValueError, 'generation_rewound'):
            gpu.consume_generated(matcher, [], cursor)
        with self.assertRaisesRegex(ValueError, 'grammar_rejected_token'):
            gpu.consume_generated(matcher, [99], 0)


class PairedDiagnosticTests(unittest.TestCase):
    def test_training_recall_cannot_be_relabeled_holdout_or_expanded_or_include_targets(self):
        from copy import deepcopy
        rows=[{'id':'recall-'+str(i).zfill(2)+'-exact-train','split':'RECALL_TRANSFER','task':'parse','locale':'de','query':'test','reference':{},'messages':[{'role':'system','content':'x'},{'role':'user','content':'y'}],'inputHash':'i','promptHash':'p','outputSchema':{}}for i in [5,6,7,10,12,14,15]]
        packet={'kind':'PAIRED_RUNTIME_RECALL_DIAGNOSTIC','targetIncluded':False,'freshHoldout':False,'requestedHfCalls':14,'split':'RECALL_TRANSFER','parentAdapterSha256':'p','candidateAdapterSha256':'c','cases':rows,'expectedPrefixIdSha256':{r['id']:'a'*64 for r in rows},'expectedRuntime':{n:'test-version'for n in ['torch','transformers','peft','axolotl','tokenizers','llguidance']}}
        with tempfile.TemporaryDirectory()as tmp:
            path=Path(tmp)/'packet.json'
            def check(value):
                path.write_text(json.dumps(value));approval={'evaluationOnly':True,'pairedDiagnosticSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'evaluationCandidateSha256':'c'}
                return gpu.validate_paired_diagnostic(path,approval,{'parent':{'hfAdapterSha256':'p'}},'c')
            check(packet)
            for key,value in [('freshHoldout',True),('targetIncluded',True),('requestedHfCalls',16),('split','TEST')]:
                with self.assertRaises(ValueError):check({**packet,key:value})
            bad=deepcopy(packet);bad['cases'][0]['expected']='hidden gold'
            with self.assertRaisesRegex(ValueError,'target_free'):check(bad)
            bad=deepcopy(packet);bad['cases'][0]['id']='replacement'
            with self.assertRaises(ValueError):check(bad)

if __name__ == '__main__':
    unittest.main()
