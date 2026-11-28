/** Beta-catalog extension of the canonical Product bundle; no allocation or upload. */
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifyBetaCatalog} from './beta-catalog.mjs';
export const BETA_PROFILE='PRODUCT_SEARCH_V7_BETA_CATALOG_V2';
export const BETA_IMAGE='axolotlai/axolotl-cloud-uv@sha256:5a989be77ecfc9ef6f4e578d0addec4e6a6fb882b64abe0b84613666c58afe61';
export const BETA_BASE={repo:'Qwen/Qwen3.6-35B-A3B',revision:'995ad96eacd98c81ed38be0c5b274b04031597b0'};
export const BETA_MLX={repo:'mlx-community/Qwen3.6-35B-A3B-4bit',revision:'38740b847e4cb78f352aba30aa41c76e08e6eb46'};
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
export const byteSha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function fileSha(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
import {betaMixture,evaluationPacket} from './beta-mixture.mjs';
export {betaMixture,evaluationPacket} from './beta-mixture.mjs';
export async function exportBetaCatalogGpuBundle(args){
 const [dataArg,mlxArg,hfArg,tokenizerArg,outArg,python,expectedManifestSha]=args;
 if(args.length!==7||!/^[a-f0-9]{64}$/.test(expectedManifestSha))throw Error('usage: --beta-catalog-v2 DATA MLX_PARENT HF_PARENT TOKENIZER OUTPUT PYTHON EXACT_MANIFEST_SHA256');
 const data=resolve(dataArg),mlx=resolve(mlxArg),hf=resolve(hfArg),tok=resolve(tokenizerArg),out=resolve(outArg);
 const sourceBytes=await readFile(resolve(data,'manifest.json'));if(byteSha(sourceBytes)!==expectedManifestSha)throw Error('beta_bundle_manifest_changed');
 await verifyBetaCatalog(data);const manifest=JSON.parse(sourceBytes),catalog=JSON.parse(await readFile(resolve(data,'catalog.json'))),preflight=JSON.parse(await readFile(resolve(data,'preflight.json')));
 if(preflight.datasetManifestFileSha256!==expectedManifestSha||preflight.caseCount!==manifest.formulations||preflight.cases.some(r=>!r.grammarAccepted||!r.completionBoundaryVerified))throw Error('beta_bundle_preflight_not_bound');
 const mlxCfg=JSON.parse(await readFile(resolve(mlx,'adapter_config.json'))),hfCfg=JSON.parse(await readFile(resolve(hf,'adapter_config.json')));
 if(mlxCfg.lora_parameters?.rank!==16||mlxCfg.lora_parameters?.scale!==2||hfCfg.r!==16||hfCfg.lora_alpha!==32||hfCfg.lora_dropout!==0||hfCfg.fan_in_fan_out||hfCfg.use_dora||hfCfg.use_rslora)throw Error('beta_bundle_parent_architecture_changed');
 const parent={trainingBase:BETA_BASE,mlxBase:BETA_MLX,rank:16,alpha:32,
  hfAdapterSha256:await fileSha(resolve(hf,'adapter_model.safetensors')),hfAdapterConfigSha256:await fileSha(resolve(hf,'adapter_config.json')),
  mlxAdapterSha256:await fileSha(resolve(mlx,'adapters.safetensors')),mlxAdapterConfigSha256:await fileSha(resolve(mlx,'adapter_config.json')),
  targetModules:[...hfCfg.target_modules].sort(),mlxTargetKeys:[...mlxCfg.lora_parameters.keys].sort(),
  identityKind:'EXACT_LOCAL_REFERENCE_PAIR',currentLiveHealthVerified:false,baseNumericalParityVerified:false};
 if(JSON.stringify(parent.targetModules)!==JSON.stringify(['k_proj','o_proj','q_proj','v_proj']))throw Error('beta_bundle_parent_targets_changed');
 const tokenFiles={};for(const name of ['tokenizer.json','tokenizer_config.json','chat_template.jinja','config.json']){tokenFiles[name]=await fileSha(resolve(tok,name));if(name!=='config.json'&&tokenFiles[name]!==preflight.tokenizerFilesSha256[name])throw Error('beta_bundle_tokenizer_changed');}
 if(tokenFiles['config.json']!=='a822a9e48b0aafbe3144ec37d4fb067e178ed96615ce6e4420b3149893cc5767')throw Error('beta_bundle_base_config_pin_changed');
 const config=JSON.parse(await readFile(resolve(tok,'config.json')));if(config.model_type!=='qwen3_5_moe'||config.text_config?.num_hidden_layers!==40)throw Error('beta_bundle_base_architecture_changed');
 parent.modelFiles=tokenFiles;
 await mkdir(out,{mode:0o700});const payload=new Map();
 const put=(name,value)=>payload.set(name,Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n'));
 const parentDir=resolve(out,'parent-proof-input');await mkdir(parentDir,{mode:0o700});
 await writeFile(resolve(parentDir,'manifest.json'),JSON.stringify({version:'backyrd.nuknuk-beta-parent-binding@1',catalogHash:manifest.catalogHash,datasetManifestSha256:expectedManifestSha,parent})+'\n',{flag:'wx',mode:0o600});
 execFileSync(python,['-B',resolve(root,'scripts/decision-diagnostics/nuknuk-gpu.py'),'verify-product-parent','--bundle',parentDir,'--source',mlx,'--adapter',hf,'--output',resolve(parentDir,'parent-verification.json')],{stdio:'pipe'});
 const proof=JSON.parse(await readFile(resolve(parentDir,'parent-verification.json')));if(proof.result!=='PASS'||!proof.exactTransposeEquality||proof.baseModelLoaded)throw Error('beta_bundle_parent_proof_failed');
 put('parent-binding.json',await readFile(resolve(parentDir,'manifest.json')));put('parent-verification.json',await readFile(resolve(parentDir,'parent-verification.json')));await rm(parentDir,{recursive:true});
 for(const name of ['train.jsonl','valid.jsonl'])put(name,await readFile(resolve(data,name)));
 for(const name of ['adapter_model.safetensors','adapter_config.json'])put('seed/'+name,await readFile(resolve(hf,name)));
 for(const name of Object.keys(tokenFiles))put('tokenizer/'+name,await readFile(resolve(tok,name)));
 const trainRows=catalog.cases.filter(r=>r.split==='TRAIN'),mixture=betaMixture(trainRows),lines=payload.get('train.jsonl').toString().trimEnd().split('\n');
 put('training-mixture.json',{...mixture,catalogHash:manifest.catalogHash,rowHashes:trainRows.map((r,i)=>({id:r.id,rowSha256:byteSha(lines[i])}))});
 put('development-requests.json',evaluationPacket(catalog,'DEV'));
 put('native-prefixes.json',preflight.cases.filter(r=>r.split!=='TEST').map(r=>({id:r.id,split:r.split,prefixTokenIdsSha256:r.prefixTokenIdsSha256})));
 put('catalog-manifest.json',sourceBytes);
 for(const name of ['nuknuk-gpu.py','nuknuk-runpod-watch.py','nuknuk-beta-callback.py'])put(name==='nuknuk-beta-callback.py'?'nuknuk_beta_callback.py':name,await readFile(resolve(root,'scripts/decision-diagnostics',name)));
 if(manifest.counts.TRAIN%5!==0)throw Error('beta_bundle_partial_accumulation_forbidden');
 const steps=manifest.counts.TRAIN/5,recipe={rank:16,alpha:32,epochs:1,learningRate:0.000002,seed:42,trainingRows:manifest.counts.TRAIN,validationRows:manifest.counts.DEV,optimizerUpdates:steps,gradientAccumulationSteps:5,maxTotalTokens:5120,maxAnswerTokens:2048,maxTrainingSeconds:null,initialization:'EXACT_REFERENCE_PARENT_CONTINUATION',testUploaded:false,activationAuthorized:false,mixtureVersion:mixture.version};
 let yaml=`base_model: /workspace/backyrd-product-training/base
plugins:
  - nuknuk_beta_callback.BetaPlugin
  - axolotl.integrations.cut_cross_entropy.CutCrossEntropyPlugin
  - axolotl.integrations.liger.LigerPlugin
use_kernels: false
use_scattermoe: false
liger_layer_norm: true
liger_rope: true
liger_rms_norm: true
liger_glu_activation: true
liger_rms_norm_gated: true
chat_template: tokenizer_default
datasets:
  - path: /workspace/backyrd-product-training/job/train-tokenized.jsonl
    ds_type: json
    type:
test_datasets:
  - path: /workspace/backyrd-product-training/job/valid-tokenized.jsonl
    ds_type: json
    type:
train_on_inputs: false
val_set_size: 0
sequence_len: 5120
sample_packing: false
dataset_prepared_path: /workspace/backyrd-product-training/prepared
output_dir: /workspace/backyrd-product-training/output
load_in_4bit: true
quantize_moe_experts: true
adapter: qlora
lora_r: 16
lora_alpha: 32
lora_dropout: 0
lora_target_modules: [q_proj, k_proj, v_proj, o_proj]
lora_qkv_kernel: true
lora_o_kernel: true
lora_mlp_kernel: false
lora_model_dir: /workspace/backyrd-product-training/job/seed
micro_batch_size: 1
gradient_accumulation_steps: 5
eval_batch_size: 1
num_epochs: 1
optimizer: adamw_torch_8bit
lr_scheduler: cosine
learning_rate: 0.000002
warmup_ratio: 0.07
seed: 42
bf16: true
tf32: true
activation_checkpointing:
  enabled: true
  offload:
    all: cpu
attn_implementation: sdpa
logging_steps: 1
eval_strategy: "no"
save_steps: 100
save_only_model: true
save_safetensors: true
use_wandb: false
dataset_processes: 4
`;
 put('train.yaml',yaml);
 for(const [name,bytes]of payload){await mkdir(dirname(resolve(out,name)),{recursive:true,mode:0o700});await writeFile(resolve(out,name),bytes,{flag:'wx',mode:0o600});}
 const result={version:'backyrd.nuknuk-product-gpu-bundle@1',profile:BETA_PROFILE,datasetHash:manifest.catalogHash,sourceManifestSha256:expectedManifestSha,sourceSha:manifest.sourceSha,parent:{...parent,modelFiles:tokenFiles},image:BETA_IMAGE,recipe,
  testRequestPacketSha256:byteSha(JSON.stringify(evaluationPacket(catalog,'TEST'),null,2)+'\n'),budgetCeilingUsd:50,closingReserveUsd:5,maximumOwnedGpuSeconds:null,limitPolicy:'COST_ONLY_50_USD',resourceCreationAuthorizedByBundle:false,providerStopRequired:true,testLabelsUploaded:false,
  files:Object.fromEntries([...payload].map(([name,bytes])=>[name,{sha256:byteSha(bytes),bytes:bytes.length}]))};
 await writeFile(resolve(out,'product-gpu-manifest.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 return {directory:out,bundleManifestSha256:await fileSha(resolve(out,'product-gpu-manifest.json')),counts:manifest.counts,resourcesStarted:false,testLabelsUploaded:false};
}
