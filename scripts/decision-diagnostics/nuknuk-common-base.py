"""Lossless HF text-layout export of the frozen MLX base's represented values.

No training, model instantiation or re-quantization. Streamed CPU conversion;
LoRA matrices stay separate. BF16 dequantization matches MLX's affine format.
"""
from pathlib import Path
import hashlib,json,struct,math,os
import numpy as np


def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb')as f:
  for b in iter(lambda:f.read(4*1024**2),b''):h.update(b)
 return h.hexdigest()


def bf16_float(data):return np.asarray(data,dtype=np.uint16).astype(np.uint32).__lshift__(16).view(np.float32)
def as_bf16(value):
 bits=np.asarray(value,dtype=np.float32).view(np.uint32)
 return ((bits+np.uint32(0x7fff)+((bits>>16)&1))>>16).astype(np.uint16)


def affine_rows(weight,scales,biases,bits,group_size):
 if bits not in (4,8)or group_size!=64:raise ValueError('common_base_quantization_not_supported')
 if weight.dtype!=np.uint32 or scales.dtype!=np.uint16 or biases.dtype!=np.uint16:raise ValueError('common_base_storage_dtype_changed')
 codes=((weight[...,None]>>np.arange(0,32,bits,dtype=np.uint32))&((1<<bits)-1)).reshape(*weight.shape[:-1],-1).astype(np.float32)
 s=np.repeat(bf16_float(scales),group_size,axis=-1);b=np.repeat(bf16_float(biases),group_size,axis=-1)
 if codes.shape!=s.shape or s.shape!=b.shape:raise ValueError('common_base_quant_shape_changed')
 return as_bf16(codes*s+b)


class Source:
 def __init__(self,path):
  self.path=Path(path);self.index=json.loads((self.path/'model.safetensors.index.json').read_text())['weight_map'];self.headers={};self.offsets={};self.config=json.loads((self.path/'config.json').read_text())
  for file in set(self.index.values()):
   if not isinstance(file,str)or Path(file).name!=file or file in ['.','..']:raise ValueError('common_base_source_path_invalid')
   with(self.path/file).open('rb')as f:
    n=struct.unpack('<Q',f.read(8))[0]
    if not 0<n<64*1024**2:raise ValueError('common_base_header_size_invalid')
    head=json.loads(f.read(n))
   self.headers.update({k:v for k,v in head.items()if k!='__metadata__'});self.offsets[file]=8+n
 def raw(self,key,start=0,length=None):
  meta=self.headers[key];a,b=meta['data_offsets'];n=b-a-start if length is None else length
  if start<0 or n<0 or a+start+n>b:raise ValueError('common_base_tensor_range_invalid')
  file=self.index[key]
  with(self.path/file).open('rb')as f:f.seek(self.offsets[file]+a+start);value=f.read(n)
  if len(value)!=n:raise ValueError('common_base_short_read')
  return value
 def quant(self,key):
  q=self.config['quantization'];return {**{k:v for k,v in q.items()if not isinstance(v,dict)},**q.get(key[:-7],{})}
 def shape(self,key):
  if key[:-7]+'.scales'in self.headers:
   scales=self.headers[key[:-7]+'.scales']['shape'];return [*scales[:-1],scales[-1]*self.quant(key)['group_size']]
  return self.headers[key]['shape']
 def rows(self,key,start,count):
  """Flatten all leading axes; preserve per-row groups for MoE matrices."""
  if key[:-7]+'.scales'not in self.headers:raise ValueError('common_base_quant_rows_required')
  h=self.headers[key];sk=key[:-7]+'.scales';bk=key[:-7]+'.biases';width=h['shape'][-1];groups=self.headers[sk]['shape'][-1];q=self.quant(key)
  packed=np.frombuffer(self.raw(key,start*width*4,count*width*4),dtype=np.uint32).reshape(count,width)
  scales=np.frombuffer(self.raw(sk,start*groups*2,count*groups*2),dtype=np.uint16).reshape(count,groups);bias=np.frombuffer(self.raw(bk,start*groups*2,count*groups*2),dtype=np.uint16).reshape(count,groups)
  return affine_rows(packed,scales,bias,q['bits'],q['group_size'])


def shifted_norm(key):return key.endswith(('.input_layernorm.weight','.post_attention_layernorm.weight','.q_norm.weight','.k_norm.weight'))or key=='language_model.model.norm.weight'


def plan(source,expected_keys):
 result={}
 for key,meta in source.headers.items():
  if not key.startswith('language_model.')or key.endswith(('.scales','.biases')):continue
  name=key.replace('language_model.model.','model.',1).replace('language_model.lm_head.','lm_head.',1);shape=source.shape(key);sources=[key];kind='quant'if key[:-7]+'.scales'in source.headers else'raw';dtype=meta['dtype']if kind=='raw'else'BF16'
  if'.mlp.switch_mlp.up_proj.weight'in key:continue
  if'.mlp.switch_mlp.gate_proj.weight'in key:
   name=name.replace('.switch_mlp.gate_proj.weight','.experts.gate_up_proj');sources.append(key.replace('.gate_proj.weight','.up_proj.weight'))
   if source.shape(sources[1])!=shape:raise ValueError('common_base_expert_partner_shape_changed')
   shape=[shape[0],shape[1]*2,shape[2]];kind='gate_up'
  elif'.mlp.switch_mlp.down_proj.weight'in key:name=name.replace('.switch_mlp.down_proj.weight','.experts.down_proj')
  elif'.conv1d.weight'in key:shape=[shape[0],shape[2],shape[1]];kind='conv'
  elif shifted_norm(key):dtype='F32';kind='norm_offset'
  if name in result or dtype not in ['BF16','F32']:raise ValueError('common_base_duplicate_or_dtype_invalid')
  result[name]={'sources':sources,'shape':shape,'dtype':dtype,'kind':kind,'bytes':math.prod(shape)*(4 if dtype=='F32'else 2)}
 if set(result)!=set(expected_keys):raise ValueError('common_base_hf_key_coverage_changed')
 return result


def chunks(source,entry,row_limit=128):
 key=entry['sources'][0];kind=entry['kind']
 if kind in ['quant','gate_up']:
  shape=source.shape(key)
  if kind=='gate_up':
   for expert in range(shape[0]):
    for item in entry['sources']:
     for r in range(0,shape[1],row_limit):yield source.rows(item,expert*shape[1]+r,min(row_limit,shape[1]-r)).tobytes()
  else:
   count=math.prod(shape[:-1])
   for start in range(0,count,row_limit):yield source.rows(key,start,min(row_limit,count-start)).tobytes()
 elif kind=='conv':
  a=np.frombuffer(source.raw(key),dtype=np.uint16).reshape(source.shape(key));yield a.swapaxes(1,2).copy().tobytes()
 elif kind=='norm_offset':
  weight=bf16_float(np.frombuffer(source.raw(key),dtype=np.uint16));delta=weight-np.float32(1)
  if not np.array_equal(delta+np.float32(1),weight):raise ValueError('common_base_norm_not_exactly_invertible')
  yield delta.astype(np.float32).tobytes()
 else:yield source.raw(key)


def export(source,out,expected_keys,maximum_shard=2*1024**3):
 source=Source(source);out=Path(out);out.mkdir(parents=True,exist_ok=False);entries=plan(source,expected_keys);groups=[];group={};size=0
 for name,entry in sorted(entries.items()):
  if size+entry['bytes']>maximum_shard and group:groups.append(group);group={};size=0
  group[name]=entry;size+=entry['bytes']
 if group:groups.append(group)
 index={};receipts={}
 for i,group in enumerate(groups,1):
  filename=f'model-{i:05d}-of-{len(groups):05d}.safetensors';header={'__metadata__':{'format':'pt'}};offset=0
  for name,entry in group.items():header[name]={'dtype':entry['dtype'],'shape':entry['shape'],'data_offsets':[offset,offset+entry['bytes']]};offset+=entry['bytes'];index[name]=filename
  raw=json.dumps(header,separators=(',',':')).encode();raw+=b' '*((-len(raw))%8)
  with(out/filename).open('xb')as f:
   f.write(struct.pack('<Q',len(raw)));f.write(raw)
   for name,entry in group.items():
    h=hashlib.sha256();written=0
    for payload in chunks(source,entry):f.write(payload);h.update(payload);written+=len(payload)
    if written!=entry['bytes']:raise ValueError('common_base_output_size_changed')
    receipts[name]={'sha256':h.hexdigest(),'dtype':entry['dtype'],'shape':entry['shape'],'sources':entry['sources'],'kind':entry['kind']}
   f.flush();os.fsync(f.fileno())
  print(json.dumps({'commonBaseShard':i,'totalShards':len(groups),'bytes':offset}),flush=True)
 cfg=dict(source.config['text_config']);cfg.update(model_type='qwen3_5_moe_text',architectures=['Qwen3_5MoeForCausalLM'],dtype='bfloat16');cfg.pop('quantization',None);cfg.pop('quantization_config',None)
 (out/'config.json').write_text(json.dumps(cfg,indent=2)+'\n');(out/'model.safetensors.index.json').write_text(json.dumps({'metadata':{'total_size':sum(e['bytes']for e in entries.values())},'weight_map':index},indent=2)+'\n');receipt={'version':'backyrd.common-mlx-base@1','sourceQuantization':source.config['quantization'],'textOnly':True,'requantized':False,'normOffsetsRequireFp32':True,'tensors':receipts,'shards':{file:sha(out/file)for file in set(index.values())},'configSha256':sha(out/'config.json')};(out/'common-base-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');return receipt
