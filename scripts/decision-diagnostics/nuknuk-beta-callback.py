"""Axolotl training telemetry/probe guard; no provider calls or credentials."""
import json
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
        if (self.total_updates,self.maximum_seconds) not in [(200,5100),(121,3900)]:raise ValueError('beta_recipe_environment_invalid')
        self.total_updates=int(os.environ.get('BACKYRD_TOTAL_UPDATES','200'));self.max_seconds=int(os.environ.get('BACKYRD_MAX_TRAIN_SECONDS','5100'))
        if (self.total_updates,self.max_seconds) not in ((200,5100),(121,3900)):raise ValueError('beta_callback_unapproved_recipe')
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
        if state.max_steps!=self.total_updates or args.gradient_accumulation_steps!=4 or args.per_device_train_batch_size!=1 or args.num_train_epochs!=1:
            raise ValueError('beta_actual_trainer_recipe_changed')
        self.started=time.monotonic();self.record(state,'TRAINING')

    def on_step_begin(self,args,state,control,**kwargs):
        self.step_started=time.monotonic()

    def on_step_end(self,args,state,control,**kwargs):
        elapsed=time.monotonic()-self.step_started
        if len(self.steps)<10:self.steps.append(elapsed)
        status='COMPLETE' if state.global_step==self.total_updates else 'TRAINING'
        extra={'optimizerStepSeconds':elapsed}
        if state.global_step==10:
            if not self.lengths:raise ValueError('beta_probe_no_actual_batch_lengths')
            estimate=estimate_remaining(self.steps,min(self.lengths),self.maximum_tokens,self.total_updates-10)
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


class BetaPlugin(BasePlugin):
    def add_callbacks_pre_trainer(self,cfg,model):
        return [BetaCallback(model)]
