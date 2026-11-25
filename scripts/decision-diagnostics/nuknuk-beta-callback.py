"""Axolotl training telemetry/probe guard; no provider calls or credentials."""
import json
import hashlib
from collections import Counter
import math
import os
from pathlib import Path
import time
from axolotl.integrations.base import BasePlugin
from transformers import TrainerCallback


def estimate_remaining(step_seconds, minimum_tokens, maximum_tokens, remaining_updates):
    if len(step_seconds) != 10 or any(not math.isfinite(s) or s <= 0 for s in step_seconds) or minimum_tokens <= 0 or maximum_tokens > 5120 or remaining_updates not in (190,111):
        raise ValueError('beta_probe_measurements_invalid')
    # Update 1 includes one-time kernel/compiler initialization. It has already
    # consumed the elapsed budget; only updates 2..10 predict recurring work.
    return max(step_seconds[1:])*remaining_updates*max(1,maximum_tokens/minimum_tokens)**2*1.5


class BetaCallback(TrainerCallback):
    def __init__(self, model):
        self.folder=Path(os.environ['BACKYRD_TRAINING_RECEIPTS'])
        self.maximum_tokens=int(os.environ['BACKYRD_MAXIMUM_TRAIN_TOKENS'])
        self.total_updates=int(os.environ.get('BACKYRD_TOTAL_UPDATES','200'))
        self.maximum_seconds=int(os.environ.get('BACKYRD_MAX_TRAIN_SECONDS','5100'))
        if not os.environ.get('BACKYRD_CATALOG_BUNDLE') and (self.total_updates,self.maximum_seconds) not in [(200,5100),(121,3900)]:raise ValueError('beta_recipe_environment_invalid')
        self.total_updates=int(os.environ.get('BACKYRD_TOTAL_UPDATES','200'));self.max_seconds=int(os.environ.get('BACKYRD_MAX_TRAIN_SECONDS','5100'))
        if not os.environ.get('BACKYRD_CATALOG_BUNDLE') and (self.total_updates,self.max_seconds) not in ((200,5100),(121,3900)):raise ValueError('beta_callback_unapproved_recipe')
        self.steps=[];self.lengths=[];self.started=None;self.step_started=None
        self.model=model;self.hook=model.register_forward_pre_hook(self.observe,with_kwargs=True)

    def observe(self, model, positional, kwargs):
        ids=kwargs.get('input_ids')
        if model.training and ids is not None and len(self.steps)<10:
            self.lengths.append(int(ids.shape[-1]))

    def record(self, state, status, **extra):
        value={'step':state.global_step,'status':status,'elapsedSeconds':time.monotonic()-self.started,**extra}
        with (self.folder/'beta-steps.jsonl').open('a') as handle:
            handle.write(json.dumps(value)+'\n');handle.flush();os.fsync(handle.fileno())
        temp=self.folder/'beta-progress.tmp';temp.write_text(json.dumps(value));temp.replace(self.folder/'beta-progress.json')

    def on_train_begin(self,args,state,control,**kwargs):
        if state.max_steps!=self.total_updates or args.gradient_accumulation_steps!=(5 if os.environ.get('BACKYRD_CATALOG_BUNDLE') else 4) or args.per_device_train_batch_size!=1 or args.num_train_epochs!=1:
            raise ValueError('beta_actual_trainer_recipe_changed')
        self.started=time.monotonic();self.record(state,'TRAINING')

    def on_step_begin(self,args,state,control,**kwargs):
        self.step_started=time.monotonic()

    def on_step_end(self,args,state,control,**kwargs):
        if os.environ.get('BACKYRD_CATALOG_BUNDLE'):catalog_admission()
        elapsed=time.monotonic()-self.step_started
        if len(self.steps)<10:self.steps.append(elapsed)
        status='COMPLETE' if state.global_step==self.total_updates else 'TRAINING'
        extra={'optimizerStepSeconds':elapsed}
        if state.global_step==10:
            if not self.lengths:raise ValueError('beta_probe_no_actual_batch_lengths')
            estimate=(catalog_estimate(self.steps,min(self.lengths),self.maximum_tokens,self.total_updates-10) if os.environ.get('BACKYRD_CATALOG_BUNDLE') else estimate_remaining(self.steps,min(self.lengths),self.maximum_tokens,self.total_updates-10))
            extra.update(probeMinimumTokens=min(self.lengths),estimatedRemainingSeconds=estimate,
                initializationUpdateSeconds=self.steps[0],steadyProbeMaximumSeconds=max(self.steps[1:]),
                initializationIncludedInElapsedBudget=True,probeVersion=2)
            if estimate>min(self.max_seconds-300,self.max_seconds-(time.monotonic()-self.started)):
                status='ABORT_SLOW_PROBE';control.should_training_stop=True;control.should_save=True
        self.record(state,status,**extra)
        return control

    def on_log(self,args,state,control,logs=None,**kwargs):
        for key in ['loss','grad_norm']:
            if logs and key in logs and not math.isfinite(float(logs[key])):
                raise ValueError('beta_nonfinite_training_metric')

    def on_train_end(self,args,state,control,**kwargs):
        self.hook.remove()
        if state.global_step==self.total_updates:self.record(state,'COMPLETE')


def catalog_estimate(seconds, minimum, maximum, remaining):
    if len(seconds)!=10 or any(not math.isfinite(x) or x<=0 for x in seconds) or minimum<=0 or not minimum<=maximum<=5120 or remaining<=0:
        raise ValueError('catalog_probe_invalid')
    return max(seconds[1:])*remaining*max(1,maximum/minimum)**2*1.5


def catalog_admission():
    # Use the exact bundled admission/watchdog implementation on every update.
    import importlib.util
    folder=Path(os.environ['BACKYRD_CATALOG_BUNDLE'])
    spec=importlib.util.spec_from_file_location('bound_catalog_gpu',folder/'nuknuk-gpu.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    manifest=json.loads((folder/'product-gpu-manifest.json').read_text())
    return module.beta_execution_admission(folder,manifest,Path(os.environ['BACKYRD_EXECUTION_APPROVAL']))


def array_digest(values):
    return hashlib.sha256(json.dumps(values,separators=(',',':')).encode()).hexdigest()


def batch_weight(inputs, bindings):
    ids=inputs['input_ids'].tolist();labels=inputs['labels'].tolist();mask=inputs['attention_mask'].tolist()
    if len(ids)!=1 or len(labels)!=1 or len(mask)!=1:raise ValueError('catalog_microbatch_one_required')
    active=[i for i,value in enumerate(mask[0]) if value==1]
    if not active or active!=list(range(len(active))) or any(value not in (0,1) for value in mask[0]):raise ValueError('catalog_right_padding_required')
    n=len(active);key=array_digest(ids[0][:n]);gold=bindings.get(key)
    if gold is None or array_digest(labels[0][:n])!=gold['labelsSha256'] or any(value!=-100 for value in labels[0][n:]):
        raise ValueError('catalog_actual_trainer_labels_changed')
    weight=gold['weight']
    if not math.isfinite(weight) or weight<=0:raise ValueError('catalog_invalid_weight')
    return weight


def verify_dataset_multiset(observed,expected):
    if Counter(observed)!=Counter(expected):raise ValueError('catalog_actual_dataset_multiset_changed')


def install_catalog_objective(trainer):
    from transformers import DataCollatorForSeq2Seq
    folder=Path(os.environ['BACKYRD_CATALOG_BUNDLE']);catalog_admission()
    if not isinstance(trainer.data_collator,DataCollatorForSeq2Seq) or trainer.data_collator.label_pad_token_id!=-100 or trainer.data_collator.pad_to_multiple_of!=32:
        raise ValueError('catalog_actual_collator_changed')
    if trainer.args.world_size!=1 or trainer.args.per_device_train_batch_size!=1 or trainer.args.gradient_accumulation_steps!=(5 if os.environ.get('BACKYRD_CATALOG_BUNDLE') else 4) or trainer.args.dataloader_drop_last:
        raise ValueError('catalog_trainer_objective_changed')
    native=json.loads((folder/'native-tokenization.json').read_text());mix=json.loads((folder/'training-mixture.json').read_text())
    weights={r['id']:r['lossWeight']for r in mix['cases']};groups={}
    for row in native['rows']:
        if row['split']=='TRAIN':groups.setdefault(row['inputIdsSha256'],[]).append(row)
    bindings={}
    for key,rows in groups.items():
        if len({row['labelsSha256']for row in rows})!=1:raise ValueError('catalog_ambiguous_labels')
        # Identical tensors cannot be distinguished after dataset preprocessing.
        # Their average weight preserves their combined objective over an epoch.
        bindings[key]={'labelsSha256':rows[0]['labelsSha256'],'weight':sum(weights[row['id']]for row in rows)/len(rows)}
    if len(trainer.train_dataset)!=mix['trainingRows'] or len(trainer.train_dataset)%trainer.args.gradient_accumulation_steps!=0:raise ValueError('catalog_actual_dataset_count_changed')
    observed=[]
    for row in trainer.train_dataset:
        batch=trainer.data_collator([dict(row)])
        batch_weight(batch,bindings)
        n=int(batch['attention_mask'][0].sum());observed.append((array_digest(batch['input_ids'][0,:n].tolist()),array_digest(batch['labels'][0,:n].tolist()),array_digest(batch['attention_mask'][0,:n].tolist())))
    expected=[(row['inputIdsSha256'],row['labelsSha256'],row['attentionMaskSha256'])for row in native['rows']if row['split']=='TRAIN']
    verify_dataset_multiset(observed,expected)
    target=Path(os.environ['BACKYRD_TRAINING_RECEIPTS'])/'actual-trainer-inputs.json'
    target.write_text(json.dumps({'result':'PASS','checkedRows':len(trainer.train_dataset),'collator':'transformers.DataCollatorForSeq2Seq','padToMultipleOf':32,'promptAndPaddingLabels':-100,'actualTrainerDatasetVerified':True,'trainerCollatorVerified':True,'actualTrainerDataloaderVerified':False,'actualBatchLabelsVerifiedDuringComputeLoss':True,'gradientAccumulationSteps':5,'partialAccumulationWindows':0,'identicalTensorObjective':'AVERAGE_WEIGHT_PRESERVES_COMBINED_OBJECTIVE','uniqueTensorRows':len(bindings)}))
    if getattr(trainer,'backyrd_objective_installed',False):raise ValueError('catalog_objective_installed_twice')
    trainer.backyrd_objective_installed=True
    original=trainer.compute_loss
    # Force per-example token-mean reduction; no global token-count renormalization.
    trainer.model_accepts_loss_kwargs=False
    def weighted_loss(model,inputs,return_outputs=False,num_items_in_batch=None):
        weight=batch_weight(inputs,bindings) if model.training else 1.0
        output=original(model,inputs,return_outputs=return_outputs,num_items_in_batch=None)
        loss=output[0] if return_outputs else output
        if not bool(loss.isfinite().all()):raise ValueError('catalog_nonfinite_loss')
        return (loss*weight,output[1]) if return_outputs else loss*weight
    trainer.compute_loss=weighted_loss


class BetaPlugin(BasePlugin):
    def get_collator_cls_and_kwargs(self,cfg,is_eval=False):
        if not os.environ.get('BACKYRD_CATALOG_BUNDLE'):return None
        from transformers import DataCollatorForSeq2Seq
        return DataCollatorForSeq2Seq,{'model':None,'label_pad_token_id':-100,'pad_to_multiple_of':32}

    def post_trainer_create(self,cfg,trainer):
        if os.environ.get('BACKYRD_CATALOG_BUNDLE'):install_catalog_objective(trainer)

    def add_callbacks_pre_trainer(self,cfg,model):
        return [BetaCallback(model)]
