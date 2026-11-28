"""Explicitly authorized common-base compatibility pilot, never an optimizer run."""
from pathlib import Path
import importlib.util,json,hashlib,time,re


def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb')as f:
  for b in iter(lambda:f.read(4*1024**2),b''):h.update(b)
 return h.hexdigest()


def module(path,name):
 spec=importlib.util.spec_from_file_location(name,path);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value


def verify_spec(path,approval):
 root=Path(path).parent;spec=json.loads(Path(path).read_text())
 if (sha(path)!=approval.get('commonBasePilotSha256')or approval.get('evaluationOnly')is not True
  or spec.get('kind')!='COMMON_MLX_BASE_COMPATIBILITY_PILOT'or type(spec.get('optimizerSteps'))is not int or spec.get('optimizerSteps')!=0
  or spec.get('sourceRepo')!='mlx-community/Qwen3.6-35B-A3B-4bit'or spec.get('sourceRevision')!='38740b847e4cb78f352aba30aa41c76e08e6eb46'
  or sha(root/'common-base.py')!=spec.get('converterSha256')or sha(root/'common-base-runtime.py')!=spec.get('runtimeSha256')):raise ValueError('common_base_pilot_not_authorized')
 if not spec.get('sourceFiles')or any(Path(k).name!=k or k in ['.','..']or not isinstance(v,str)or len(v)!=64 for k,v in spec['sourceFiles'].items()):raise ValueError('common_base_source_files_invalid')
 if len(spec.get('expectedHfKeys',[]))!=693 or len(set(spec['expectedHfKeys']))!=693 or not re.fullmatch('[a-f0-9]{64}',spec.get('expectedReceiptSha256',''))or not spec.get('expectedShards')or any(not re.fullmatch(r'model-[0-9]{5}-of-[0-9]{5}\.safetensors',k)or not re.fullmatch('[a-f0-9]{64}',v)for k,v in spec['expectedShards'].items())or spec.get('backwardCaseId')!='recall-05-exact-train':raise ValueError('common_base_expected_export_binding_required')
 return spec


def prepare(bundle,approval_path,spec_path):
 gpu=module(Path(bundle)/'nuknuk-gpu.py','bound_gpu');manifest=gpu.verify_product_gpu_bundle(bundle);approval=gpu.beta_execution_admission(bundle,manifest,approval_path);spec=verify_spec(spec_path,approval);root=Path(bundle).parent
 from huggingface_hub import snapshot_download
 source=Path(snapshot_download(spec['sourceRepo'],revision=spec['sourceRevision'],allow_patterns=list(spec['sourceFiles']),cache_dir=str(root/'mlx-source-cache')))
 for name,digest in spec['sourceFiles'].items():
  if sha(source/name)!=digest:raise ValueError('common_base_download_changed:'+name)
 converter=module(root/'common-base.py','common_converter');receipt=converter.export(source,root/'common-base',spec['expectedHfKeys'])
 if sha(root/'common-base/common-base-receipt.json')!=spec['expectedReceiptSha256']:raise ValueError('common_base_export_not_identical_to_mac')
 for file,digest in spec['expectedShards'].items():
  if sha(root/'common-base'/file)!=digest:raise ValueError('common_base_shard_not_identical_to_mac')
 (root/'common-base-prepared.json').write_text(json.dumps({'status':'PASS','sourceFilesVerified':len(spec['sourceFiles']),'commonBaseReceiptSha256':spec['expectedReceiptSha256'],'tensorCount':len(receipt['tensors']),'allShardsByteEqualMacExport':True,'trainingExecuted':False},indent=2)+'\n')


def load(bundle,adapter,adapter_sha256,approval):
 root=Path(bundle).parent;spec=verify_spec(root/'common-base-spec.json',approval)
 receipt=root/'common-base/common-base-receipt.json';prepared=json.loads((root/'common-base-prepared.json').read_text())
 if sha(receipt)!=spec['expectedReceiptSha256']or prepared.get('allShardsByteEqualMacExport')is not True:raise ValueError('common_base_preparation_required')
 import torch
 from transformers import AutoModelForCausalLM
 from safetensors.torch import load_file,save_file
 from safetensors import safe_open
 from peft import PeftModel
 converted=root/('common-adapter-'+adapter_sha256);converted.mkdir(exist_ok=False)
 weights=load_file(str(Path(adapter)/'adapter_model.safetensors'));mapping={key:key.replace('base_model.model.model.language_model.','base_model.model.model.',1)for key in weights}
 if len(weights)!=80 or len(set(mapping.values()))!=80 or any(key==value for key,value in mapping.items()):raise ValueError('common_base_adapter_namespace_invalid')
 save_file({mapping[key]:value for key,value in weights.items()},str(converted/'adapter_model.safetensors'))
 cfg=json.loads((Path(adapter)/'adapter_config.json').read_text());cfg['base_model_name_or_path']=str(root/'common-base');(converted/'adapter_config.json').write_text(json.dumps(cfg,indent=2)+'\n')
 model=AutoModelForCausalLM.from_pretrained(root/'common-base',local_files_only=True,trust_remote_code=False,use_safetensors=True,dtype=torch.bfloat16,device_map={'':0},attn_implementation='sdpa')
 # HF uses zero-centered norms; preserve the exact reconstructed MLX scales.
 converted_receipt=json.loads(receipt.read_text());index=json.loads((root/'common-base/model.safetensors.index.json').read_text())['weight_map'];norms={}
 for key,entry in converted_receipt['tensors'].items():
  if entry['kind']!='norm_offset':continue
  with safe_open(str(root/'common-base'/index[key]),framework='pt',device='cpu')as file:value=file.get_tensor(key)
  parent,name=key.rsplit('.',1);target=model.get_submodule(parent);setattr(target,name,torch.nn.Parameter(value.to(device='cuda',dtype=torch.float32),requires_grad=False));norms[key]='torch.float32'
 actual=dict(model.named_parameters());expected=converted_receipt['tensors']
 if set(actual)!=set(expected):raise ValueError('common_base_effective_key_coverage_changed')
 base_tensors={}
 for name,entry in expected.items():
  value=actual[name].detach();canonical=value.to(torch.bfloat16 if entry['dtype']=='BF16'else torch.float32)
  if value.dtype!=canonical.dtype and not bool(torch.equal(canonical.to(value.dtype),value)):raise ValueError('common_base_effective_value_changed:'+name)
  digest=hashlib.sha256(canonical.cpu().contiguous().view(torch.uint8).numpy().tobytes()).hexdigest()
  if digest!=entry['sha256']:raise ValueError('common_base_effective_tensor_changed:'+name)
  base_tensors[name]={'sha256':digest,'actualDtype':str(value.dtype),'canonicalDtype':entry['dtype'],'shape':list(value.shape)}
 model=PeftModel.from_pretrained(model,converted,is_trainable=False);model.requires_grad_(False);model.eval();model.config.use_cache=True
 metadata={'representation':'MLX_AFFINE_VALUES_DEQUANTIZED_NO_REQUANTIZATION','commonBaseReceiptSha256':spec['expectedReceiptSha256'],'originalAdapterSha256':adapter_sha256,'translatedAdapterSha256':sha(converted/'adapter_model.safetensors'),'namespaceMapping':mapping,'fp32NormOffsets':norms,'baseQuantizationApplied':False,'baseParameterBytes':sum(p.numel()*p.element_size()for p in model.parameters()),'numericalBackendParityClaimed':False,'all693EffectiveBaseValuesVerified':True,'baseTensors':base_tensors}
 return model,converted,metadata


def backward_probe(model,tokenizer,bundle,requests,output,adapter,approval):
 """One known TRAIN example, full 80-factor backward, zero optimizer updates."""
 import torch
 import torch.nn.functional as F
 import math
 root=Path(bundle).parent;spec=verify_spec(root/'common-base-spec.json',approval);id=spec.get('backwardCaseId')
 if id!='recall-05-exact-train':raise ValueError('common_base_backward_case_not_bound')
 row=next(r for r in requests if r['id']==id);records=[json.loads(line)for line in(Path(bundle)/'train.jsonl').read_text().splitlines()];matches=[r for r in records if r['messages'][:2]==row['messages']]
 if not matches or any(r['messages']!=matches[0]['messages']for r in matches):raise ValueError('common_base_backward_train_target_missing_or_ambiguous')
 target=tokenizer.encode(matches[0]['messages'][2]['content'],add_special_tokens=False)+[tokenizer.eos_token_id];prefix=tokenizer.apply_chat_template(row['messages'],tokenize=True,add_generation_prompt=True,enable_thinking=False,return_dict=False)
 if len(prefix)+len(target)>5120:raise ValueError('common_base_backward_budget_invalid')
 before={n:hashlib.sha256(p.detach().cpu().contiguous().view(torch.uint8).numpy().tobytes()).hexdigest()for n,p in model.named_parameters()if'.lora_'in n};assert len(before)==80
 result={'optimizerSteps':0,'trainingWeightsChanged':False,'knownTrainCaseId':id,'prefixTokens':len(prefix),'targetTokens':len(target),'status':'STARTED'};(Path(output)/'common-base-backward.json').write_text(json.dumps(result,indent=2)+'\n');started=time.time();torch.cuda.reset_peak_memory_stats()
 try:
  for name,param in model.named_parameters():param.requires_grad_('.lora_'in name)
  params=[p for p in model.parameters()if p.requires_grad];assert len(params)==80
  base=model.get_base_model();text=base.model;text.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant':False});model.train();model.config.use_cache=False
  ids=torch.tensor([prefix+target],dtype=torch.long,device='cuda')
  with torch.autograd.graph.save_on_cpu(pin_memory=True):
   hidden=text(input_ids=ids,use_cache=False).last_hidden_state[:,len(prefix)-1:-1,:]
   logits=base.lm_head(hidden);labels=torch.tensor(target,dtype=torch.long,device='cuda');loss=F.cross_entropy(logits.float().reshape(-1,logits.shape[-1]),labels)
   gradients=torch.autograd.grad(loss,params)
  finite=all(bool(torch.isfinite(g).all().item())for g in gradients);norm=sum(float(g.double().pow(2).sum().item())for g in gradients)**.5
  if not finite or not math.isfinite(norm)or norm<=0:raise ValueError('common_base_backward_nonfinite_or_zero')
  result.update(status='PASS',loss=float(loss.detach().item()),gradientNorm=norm,gradientTensors=len(gradients),allGradientsFinite=True,peakCudaAllocatedBytes=torch.cuda.max_memory_allocated(),elapsedSeconds=time.time()-started)
 except torch.cuda.OutOfMemoryError:result.update(status='DOES_NOT_FIT_GPU_MEMORY',elapsedSeconds=time.time()-started)
 finally:
  model.eval();model.requires_grad_(False);model.config.use_cache=True
  after={n:hashlib.sha256(p.detach().cpu().contiguous().view(torch.uint8).numpy().tobytes()).hexdigest()for n,p in model.named_parameters()if'.lora_'in n}
  if before!=after:raise ValueError('common_base_backward_changed_weights')
  result['all80AdapterWeightsUnchanged']=True;(Path(output)/'common-base-backward.json').write_text(json.dumps(result,indent=2)+'\n')


if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--bundle',type=Path,required=True);p.add_argument('--approval',type=Path,required=True);p.add_argument('--spec',type=Path,required=True);a=p.parse_args();prepare(a.bundle,a.approval,a.spec)
