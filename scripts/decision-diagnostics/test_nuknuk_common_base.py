import importlib.util,unittest,tempfile,json,struct
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('common',Path(__file__).with_name('nuknuk-common-base.py'));common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common)
class CommonBaseTests(unittest.TestCase):
 def test_bf16_round_to_nearest_even_and_exact_roundtrip(self):
  a=np.array([0,1,-1,.00390625,1.5,3.125],dtype=np.float32);np.testing.assert_array_equal(common.bf16_float(common.as_bf16(a)),a)
  bits=np.array([0x3f808000,0x3f818000],dtype=np.uint32);np.testing.assert_array_equal(common.as_bf16(bits.view(np.float32)),np.array([0x3f80,0x3f82],dtype=np.uint16))
 def test_four_and_eight_bit_affine_group_values_and_row_axes(self):
  for bits in [4,8]:
   q=np.arange(64,dtype=np.uint32)%(1<<bits);packed=np.zeros((2,64//(32//bits)),dtype=np.uint32)
   for i,v in enumerate(q):packed[:,i//(32//bits)]|=v<<np.uint32((i%(32//bits))*bits)
   s=common.as_bf16(np.array([[.5],[.25]],np.float32));b=common.as_bf16(np.array([[-1],[2]],np.float32));actual=common.bf16_float(common.affine_rows(packed,s,b,bits,64));expected=np.stack([q*.5-1,q*.25+2]).astype(np.float32);np.testing.assert_array_equal(actual,expected)
 def test_invalid_quantization_or_storage_never_silently_coerced(self):
  a=np.zeros((1,8),dtype=np.uint32);s=np.zeros((1,1),dtype=np.uint16)
  for bits,group in [(2,64),(4,32)]:
   with self.assertRaises(ValueError):common.affine_rows(a,s,s,bits,group)
  with self.assertRaises(ValueError):common.affine_rows(a.astype(np.int32),s,s,4,64)
 def test_expert_gate_up_interleaving_by_expert_not_global_concat(self):
  class Source:
   def shape(self,key):return [2,3,2]
   def rows(self,key,start,count):
    offset=100 if key=='up'else 0
    return np.repeat((np.arange(start,start+count)+offset)[:,None],2,axis=1).astype(np.uint16)
  entry={'sources':['gate','up'],'kind':'gate_up'};raw=b''.join(common.chunks(Source(),entry,row_limit=2));actual=np.frombuffer(raw,dtype=np.uint16).reshape(2,6,2);np.testing.assert_array_equal(actual[:,:,0],np.array([[0,1,2,100,101,102],[3,4,5,103,104,105]]))
 def test_norm_offset_roundtrip_and_gated_norm_exclusion(self):
  self.assertTrue(common.shifted_norm('language_model.model.norm.weight'));self.assertTrue(common.shifted_norm('language_model.model.layers.3.self_attn.q_norm.weight'));self.assertFalse(common.shifted_norm('language_model.model.layers.0.linear_attn.norm.weight'))
 def test_key_coverage_fails_closed(self):
  class Source:
   headers={'language_model.model.norm.weight':{'dtype':'BF16','shape':[2]}}
   def shape(self,key):return [2]
  self.assertEqual(common.plan(Source(),['model.norm.weight'])['model.norm.weight']['dtype'],'F32')
  with self.assertRaisesRegex(ValueError,'key_coverage'):common.plan(Source(),['unrelated'])

class RuntimeAdmissionTests(unittest.TestCase):
 def test_exact_common_base_spec_and_zero_optimizer_authority(self):
  import hashlib
  from copy import deepcopy
  spec=importlib.util.spec_from_file_location('runtime',Path(__file__).with_name('nuknuk-common-base-runtime.py'));runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);(root/'common-base.py').write_bytes(b'converter');(root/'common-base-runtime.py').write_bytes(b'runtime');path=root/'common-base-spec.json';h=lambda b:hashlib.sha256(b).hexdigest()
   value={'kind':'COMMON_MLX_BASE_COMPATIBILITY_PILOT','optimizerSteps':0,'sourceRepo':'mlx-community/Qwen3.6-35B-A3B-4bit','sourceRevision':'38740b847e4cb78f352aba30aa41c76e08e6eb46','converterSha256':h(b'converter'),'runtimeSha256':h(b'runtime'),'sourceFiles':{'config.json':'a'*64},'expectedHfKeys':['key'+str(i)for i in range(693)],'expectedReceiptSha256':'b'*64,'expectedShards':{'model-00001-of-00001.safetensors':'c'*64},'backwardCaseId':'recall-05-exact-train'}
   def check(v):
    path.write_text(json.dumps(v));return runtime.verify_spec(path,{'evaluationOnly':True,'commonBasePilotSha256':h(path.read_bytes())})
   check(value)
   for key,item in [('optimizerSteps',1),('optimizerSteps',False),('sourceRepo','other'),('sourceFiles',{'../config':'a'*64}),('expectedHfKeys',[]),('backwardCaseId','unseen-test'),('expectedReceiptSha256','wrong')]:
    with self.assertRaises(ValueError):check({**value,key:item})
   with self.assertRaises(ValueError):runtime.verify_spec(path,{'evaluationOnly':False,'commonBasePilotSha256':h(path.read_bytes())})

class StreamedExportTests(unittest.TestCase):
 def test_small_real_shard_has_correct_expert_order_norms_axes_and_index(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);source=root/'src';source.mkdir();arrays={'language_model.model.norm.weight':common.as_bf16(np.array([1,1.5],np.float32)),'language_model.model.layers.0.linear_attn.conv1d.weight':common.as_bf16(np.arange(8,dtype=np.float32)).reshape(2,4,1)}
   for projection,bias in [('gate_proj',1),('up_proj',2),('down_proj',3)]:
    name='language_model.model.layers.0.mlp.switch_mlp.'+projection;arrays[name+'.weight']=np.zeros((2,1,8),np.uint32);arrays[name+'.scales']=common.as_bf16(np.ones((2,1,1),np.float32));arrays[name+'.biases']=common.as_bf16(np.full((2,1,1),bias,np.float32))
   header={};offset=0;payload=[]
   for name,value in arrays.items():
    raw=value.tobytes();header[name]={'dtype':'U32'if value.dtype==np.uint32 else'BF16','shape':list(value.shape),'data_offsets':[offset,offset+len(raw)]};offset+=len(raw);payload.append(raw)
   raw=json.dumps(header).encode();(source/'model.safetensors').write_bytes(struct.pack('<Q',len(raw))+raw+b''.join(payload));(source/'model.safetensors.index.json').write_text(json.dumps({'weight_map':{k:'model.safetensors'for k in arrays}}));(source/'config.json').write_text(json.dumps({'quantization':{'bits':4,'group_size':64,'mode':'affine'},'text_config':{}}));keys=['model.norm.weight','model.layers.0.linear_attn.conv1d.weight','model.layers.0.mlp.experts.gate_up_proj','model.layers.0.mlp.experts.down_proj'];out=root/'out';receipt=common.export(source,out,keys)
   self.assertEqual(set(receipt['tensors']),set(keys));self.assertFalse(receipt['requantized']);index=json.loads((out/'model.safetensors.index.json').read_text())['weight_map']
   def read(key):
    with(out/index[key]).open('rb')as f:n=struct.unpack('<Q',f.read(8))[0];h=json.loads(f.read(n));a,b=h[key]['data_offsets'];f.seek(8+n+a);return h[key],f.read(b-a)
   meta,raw=read('model.norm.weight');np.testing.assert_array_equal(np.frombuffer(raw,np.float32),[0,.5]);self.assertEqual(meta['dtype'],'F32')
   meta,raw=read('model.layers.0.mlp.experts.gate_up_proj');a=common.bf16_float(np.frombuffer(raw,np.uint16)).reshape(2,2,64);np.testing.assert_array_equal(a[:,0,:],np.ones((2,64)));np.testing.assert_array_equal(a[:,1,:],np.full((2,64),2))

if __name__=='__main__':unittest.main()
