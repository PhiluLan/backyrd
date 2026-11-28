// Current Product-profile extension of the existing training bundle.
// Exports synthetic SFT data only. No GPU creation, service control or deployment.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {productTrainingCases} from './nuknuk-product-training-cases.mjs';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {orderForSchema} from '../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js';
import {inspectNuknukTrainingVocabulary,NUKNUK_TRAINING_VOCABULARY_HASH} from '../../packages/decision-vnext-core/dist/nuknuk-training-vocabulary.js';
import {buildNuknukCompactSearchRequest,validateNuknukCompactSearch,validateCompactTurn} from '../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {buildNuknukDialogueUpdate,mergeNuknukDialogueUpdate} from '../../packages/decision-vnext-core/dist/nuknuk-dialogue.js';
import {createDecisionProductNuknukProvider} from '../../packages/decision-vnext-core/dist/product-nuknuk-provider.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fileSha(path){const hash=createHash('sha256');for await(const part of createReadStream(path))hash.update(part);return hash.digest('hex');}
export function validateProductTrainingRows(rows,{allowReviewedRepetitions=false}={}){
 const ids=new Set(),groups=new Map(),inputs=new Map();
 if(!Array.isArray(rows)||!rows.length)throw Error('product_training_empty');
 for(const row of rows){
  if(ids.has(row.id)||!['TRAIN','VALIDATION','TEST'].includes(row.split)||!row.review?.trim())throw Error('product_training_inventory_invalid');
  ids.add(row.id);
  if(groups.has(row.scenarioGroup)&&groups.get(row.scenarioGroup)!==row.split)throw Error('product_training_group_leakage');
  groups.set(row.scenarioGroup,row.split);
  const input=contentHash({query:row.query,previousMeaning:row.previousMeaning??null,turns:row.turns??null,reference:row.reference});
  const prior=inputs.get(input);
  if(prior&&!(allowReviewedRepetitions&&row.split==='TRAIN'&&prior.split==='TRAIN'&&row.teachingCaseId&&row.teachingCaseId===prior.teachingCaseId&&prior.repetition===1&&row.repetition===2&&prior.id===row.teachingCaseId+'-repeat-1'&&row.id===row.teachingCaseId+'-repeat-2'&&contentHash(prior.expected)===contentHash(row.expected)))throw Error('product_training_duplicate_input');inputs.set(input,row);
  if(row.scenarioGroup.startsWith('known-')&&row.split!=='TRAIN')throw Error('product_training_known_case_in_evaluation');
  let validated,merged=row.expected;
  if(row.task==='DIALOGAKTUALISIERUNG_V3'){
   validateNuknukCompactSearch({meaning:row.previousMeaning},row);
   merged=mergeNuknukDialogueUpdate(row.previousMeaning,row.expected,row.turns);
   validated=validateCompactTurn(merged,row,row.turns.map(t=>t.answer).join(' '));
  }else if(row.task==='COMPACT_SEARCH_V7')validated=validateNuknukCompactSearch(row.expected,row);
  else throw Error('product_training_task_invalid');
  if(!validated.plan)throw Error('product_training_target_not_executable');
  if(inspectNuknukTrainingVocabulary(merged).length)throw Error('product_training_vocabulary_conflict');
  if(row.expected.clarification&&!validated.clarification)throw Error('product_training_question_rejected');
 }
 for(const split of ['TRAIN','VALIDATION','TEST'])if(!rows.some(r=>r.split===split))throw Error('product_training_split_missing');
 return {caseCount:rows.length,counts:Object.fromEntries(['TRAIN','VALIDATION','TEST'].map(s=>[s,rows.filter(r=>r.split===s).length])),
  scenarioGroups:Object.fromEntries(['TRAIN','VALIDATION','TEST'].map(s=>[s,new Set(rows.filter(r=>r.split===s).map(r=>r.scenarioGroup)).size]))};
}
export async function currentPrompt(row){
 if(row.task==='DIALOGAKTUALISIERUNG_V3')return buildNuknukDialogueUpdate(buildNuknukCompactSearchRequest(row),row.previousMeaning,row.turns);
 // Capture the actual provider request with an in-memory stub; no network or key.
 // Includes the provider's purpose instructions without duplicating their text.
 let captured;
 const sentinel=Error('offline_prompt_captured');
 const provider=createDecisionProductNuknukProvider({endpoint:'https://offline-training.invalid/v1/chat/completions',apiKey:'SYNTHETIC_NOT_A_CREDENTIAL',model:'OFFLINE_CAPTURE',
  now:()=>new Date(row.reference.now),routeDialogue:false,clarifyDialogue:false,fastSimpleSearch:false,repairCompactMeaning:false,includePurposeInstructions:true,
  fetchImpl:async(_url,options)=>{if(captured)throw Error('offline_capture_repeated');captured=JSON.parse(options.body);throw sentinel;}});
 const id=randomUUID();
 try{await provider({contractVersion:'backyrd.decision-vnext.product-request@1.0',requestId:id,idempotencyKey:id,naturalLanguage:row.query,includeEvents:true,explicit:{},alternativeRequested:false,previouslyPresentedCandidateIds:[],rejectedCandidateIds:[]},
  {userId:id,subjectBindingHash:contentHash(id),authenticationContextHash:contentHash(id),sessionBindingHash:contentHash(id),sessionId:id},AbortSignal.timeout(3000));}
 catch(error){if(error!==sentinel)throw error;}
 if(!captured||captured.messages.length!==2)throw Error('offline_capture_missing');
 return {instructions:captured.messages[0].content,input:captured.messages[1].content,outputSchema:captured.response_format.json_schema.schema};
}
export async function exportProductTraining(args, options={}){
 const [outArg,modelArg,mlxArg,hfArg]=args;
 if(args.length!==4)throw Error('usage: --product-search-v7 OUTPUT MODEL_DIR CURRENT_MLX_ADAPTER CURRENT_HF_ADAPTER');
 const out=resolve(outArg),model=resolve(modelArg),mlx=resolve(mlxArg),hf=resolve(hfArg);
 const remediation=options.cohort==='BETA_REMEDIATION_V2',beta=options.cohort==='BETA_V1'||remediation;
 const rows=remediation?(await import('./nuknuk-beta-training-program.mjs')).betaRemediationCohort():beta?(await import('./nuknuk-beta-training-cases.mjs')).betaTrainingCases():productTrainingCases(),inventory=validateProductTrainingRows(rows,{allowReviewedRepetitions:remediation});
 const mlxConfig=JSON.parse(await readFile(resolve(mlx,'adapter_config.json'))),hfConfig=JSON.parse(await readFile(resolve(hf,'adapter_config.json')));
 if(mlxConfig.fine_tune_type!=='lora'||mlxConfig.lora_parameters.rank!==16||hfConfig.r!==16||hfConfig.lora_alpha!==32)throw Error('product_training_parent_architecture_changed');
 const modelConfig=JSON.parse(await readFile(resolve(model,'config.json')));
 if(modelConfig.model_type!=='qwen3_5_moe'||modelConfig.text_config.num_hidden_layers!==40)throw Error('product_training_base_architecture_changed');
 const reviewedAt=new Date().toISOString();
 const commission={version:'backyrd.nuknuk-training-commission@2',source:'FOUNDER_CHAT_20261123',instruction:beta?'Erstelle das Trainingsprogramm und lasse den Katalog durch einen neuen Astra-Agent prüfen.':'Perfekt, dann los gehts',
  scope:beta?['CREATE_BETA_CURRICULUM','REQUEST_INDEPENDENT_ASTRA_REVIEW']:['SYNTHETIC_TARGETED_TRAINING_PREPARATION','SEPARATE_CANDIDATE_TRAINING','BASELINE_COMPARISON'],
  independentHumanGold:false,independentAssistantReview:false,reviewedAt};
 const transferRows=beta?(await import('./nuknuk-beta-transfer-cases.mjs')).betaTransferCases():[];
 if(beta)validateProductTrainingRows([...rows.filter(r=>r.split!=='TEST'),...transferRows.map(r=>({...r,split:'TEST'}))],{allowReviewedRepetitions:remediation});
 const delegationHash=contentHash(commission),evaluation=[],reviewed=[],transferEvaluation=[],transferPairs=[];
 const files={train:[],valid:[],test:[]};
 for(const row of [...rows,...transferRows]){
  const request=await currentPrompt(row),target=orderForSchema(row.expected,request.outputSchema,request.outputSchema);
  // Same spaced JSON convention as the canonical exporter/server grammar.
  const answer=JSON.stringify(target).replace(/"(?:[^"\\]|\\.)*"|[:,]/g,token=>token===':'?': ':token===','?', ':token);
  const pair={messages:[{role:'system',content:request.instructions},{role:'user',content:request.input},{role:'assistant',content:answer}]};
  const content={task:row.task,query:row.query,reference:row.reference,target:row.expected,
   context:row.previousMeaning?{previousMeaning:row.previousMeaning,turns:row.turns}:null,
   provenance:{kind:'SYNTHETIC',reference:row.id},trainingPermission:'APPROVED'};
  const hash=contentHash(content);
  if(row.split!=='TRANSFER')reviewed.push({id:row.id,scenarioGroup:row.scenarioGroup,split:row.split,content,contentHash:hash,
   reviews:beta?[]:['SEMANTICS','PRIVACY_AND_SOURCE_USE'].map(kind=>({kind,verdict:'ACCEPT',contentHash:hash,reviewer:'codex-commissioned-product-profile-review',reviewerKind:'DELEGATED_ASSISTANT',delegationHash,vocabularyHash:NUKNUK_TRAINING_VOCABULARY_HASH,reviewedAt,
    note:kind==='SEMANTICS'?row.review:'Authored synthetic case, no personal profiles or live sessions. No independent human gold.'}))});
  (row.split==='TRANSFER'?transferEvaluation:evaluation).push({...(beta?{familyId:row.familyId,theme:row.theme,locale:row.locale,critical:row.critical,reviewStatus:row.reviewStatus}:{}),id:row.id,scenarioGroup:row.scenarioGroup,split:row.split,task:row.task,query:row.query,reference:row.reference,
   messages:pair.messages.slice(0,2),outputSchema:request.outputSchema,expected:row.expected,
   promptHash:sha(request.instructions),inputHash:sha(request.input),schemaHash:contentHash(request.outputSchema)});
  if(row.split==='TRANSFER')transferPairs.push(pair);else files[{TRAIN:'train',VALIDATION:'valid',TEST:'test'}[row.split]].push(pair);
 }
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
 const sources=['scripts/decision-diagnostics/nuknuk-product-training.mjs','scripts/decision-diagnostics/nuknuk-product-training-cases.mjs',
  'scripts/decision-diagnostics/nuknuk-curriculum/preflight.py','scripts/decision-diagnostics/nuknuk-gpu.py',
  'packages/decision-vnext-core/src/nuknuk-understanding.ts','packages/decision-vnext-core/src/nuknuk-dialogue.ts','packages/decision-vnext-core/src/product-nuknuk-provider.ts','packages/decision-vnext-core/src/nuknuk-understanding-learning.ts',
  ...(beta?['scripts/decision-diagnostics/nuknuk-beta-training-cases.mjs','scripts/decision-diagnostics/nuknuk-beta-training-program.mjs','scripts/decision-diagnostics/nuknuk-beta-evaluation.mjs','scripts/decision-diagnostics/nuknuk-beta-transfer-cases.mjs','scripts/decision-diagnostics/nuknuk-beta-review.mjs','scripts/decision-diagnostics/nuknuk-beta-semantics.mjs','scripts/decision-diagnostics/test_nuknuk_beta_evaluation.mjs','packages/decision-vnext-core/test/librarian-required-evidence.test.mjs','packages/decision-vnext-core/test/librarian-active-route-fixtures.mjs']:[]),
  'packages/decision-vnext-core/src/nuknuk-training-vocabulary.ts','packages/world-knowledge-core/src/experience-language.ts','packages/decision-vnext-core/src/product-librarian-matching.ts','packages/decision-vnext-core/src/product-librarian-language.ts','packages/decision-vnext-core/src/product-luna-librarian.ts'];
 const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async name=>[name,await fileSha(resolve(root,name))])));
 const modelFiles=Object.fromEntries(await Promise.all(['config.json','tokenizer.json','tokenizer_config.json','chat_template.jinja'].map(async name=>[name,await fileSha(resolve(model,name))])));
 const parent={mlxBase:{repo:'mlx-community/Qwen3.6-35B-A3B-4bit',revision:'38740b847e4cb78f352aba30aa41c76e08e6eb46'},
  trainingBase:{repo:'Qwen/Qwen3.6-35B-A3B',revision:'995ad96eacd98c81ed38be0c5b274b04031597b0'},
  mlxAdapterSha256:await fileSha(resolve(mlx,'adapters.safetensors')),hfAdapterSha256:await fileSha(resolve(hf,'adapter_model.safetensors')),
  mlxAdapterConfigSha256:sha(await readFile(resolve(mlx,'adapter_config.json'))),hfAdapterConfigSha256:sha(await readFile(resolve(hf,'adapter_config.json'))),
  modelFiles,rank:16,alpha:32,continuationRequired:true,parityRequiredBeforeTraining:true};
 const payload={'reviewed-backyrd.json':JSON.stringify({version:'backyrd.nuknuk-product-training@1',cases:reviewed},null,2)+'\n',
  'commission.json':JSON.stringify(commission,null,2)+'\n','evaluation-inputs.json':JSON.stringify({version:'backyrd.nuknuk-product-evaluation@1',cases:evaluation},null,2)+'\n',
  'parent-identity.json':JSON.stringify(parent,null,2)+'\n'};
 for(const [name,pairs] of Object.entries(files))payload[name+'.jsonl']=pairs.map(JSON.stringify).join('\n')+'\n';
 if(beta){
  const {betaTrainingProgram,betaSupplementalChecks}=await import('./nuknuk-beta-training-program.mjs');
  payload['training-program.json']=JSON.stringify(remediation?(await import('./nuknuk-beta-training-program.mjs')).betaRemediationProgram():betaTrainingProgram(),null,2)+'\n';
  const {auditBetaTransfer,betaNativeReviewPacket}=await import('./nuknuk-beta-review.mjs');
  payload['transfer-evaluation-inputs.json']=JSON.stringify({cases:transferEvaluation},null,2)+'\n';
  payload['transfer.jsonl']=transferPairs.map(JSON.stringify).join('\n')+'\n';
  payload['transfer-cases.json']=JSON.stringify({cases:transferRows},null,2)+'\n';
  payload['transfer-audit.json']=JSON.stringify(auditBetaTransfer(rows,transferRows),null,2)+'\n';
  payload['native-review-packet.json']=JSON.stringify(betaNativeReviewPacket(rows,transferRows),null,2)+'\n';
  payload['supplemental-checks.json']=JSON.stringify(betaSupplementalChecks(),null,2)+'\n';
  const compactFact=f=>f?[f.id,f.key,f.value,f.modality,f.subjectIds,f.basis]:null;
  const compactMeaning=m=>({entities:m.entities?.map(e=>[e.id,e.kind,e.members]),facts:m.facts?.map(compactFact),logic:m.logic??null,bindings:m.bindings??[],weatherConditions:m.weatherConditions??[]});
  const compactTarget=t=>t.meaning?{meaning:compactMeaning(t.meaning),...(t.clarification?{clarification:t.clarification}:{})}:{changes:t.changes.map(c=>[c.id,c.quote,compactFact(c.fact)]),...(t.additions?{additions:compactMeaning(t.additions)}:{})};
  const cards=[];
  for(const familyId of [...new Set(rows.map(r=>r.familyId))]){
   const variants=rows.filter(r=>r.familyId===familyId),first=variants[0],base=compactTarget(first.expected);
   cards.push({familyId,scenarioGroup:first.scenarioGroup,split:first.split,theme:first.theme,critical:first.critical,knownHistoricalPattern:first.knownFamily,
    reference:first.reference,queries:Object.fromEntries(variants.map(r=>[r.locale,r.query])),expected:base,
    localeTargetDifferences:Object.fromEntries(variants.filter(r=>JSON.stringify(compactTarget(r.expected))!==JSON.stringify(base)).map(r=>[r.locale,compactTarget(r.expected)])),
    ...(first.previousMeaning?{previousMeaning:compactMeaning(first.previousMeaning),answers:Object.fromEntries(variants.map(r=>[r.locale,r.turns.map(t=>t.answer)]))}:{}),
    reviewNotes:first.review,rowIds:variants.map(r=>r.id)});
  }
  payload['catalog-family-review.jsonl']=cards.map(JSON.stringify).join('\n')+'\n';

 }
 const manifest={version:'backyrd.nuknuk-product-training-manifest@1',purpose:'SUPERVISED_DATA_EXPORT_ONLY',instructionProfiles:['COMPACT_SEARCH_V7','DIALOGAKTUALISIERUNG_V3'],
  ...inventory,...(remediation?{remediation:{version:2,parentCandidateSha256:'2b620aa7fbec48946c3e8ce25182452f0e4e366bab8e9ea20f1ebb47d02ce271',replayRows:400,uniqueCorrectionRows:42,correctionRepetitions:2,uniqueTrainRows:442,trainingRows:484,optimizerUpdates:121,learningRate:0.000002}}:{}),...(beta?{cohort:remediation?'BETA_REMEDIATION_V2':'BETA_V1',readiness:'DRAFT_PENDING_ASTRA_REVIEW',modelResponsesUsedForTargets:false}:{}),datasetHash:contentHash(reviewed),splitHash:contentHash(rows.map(r=>[r.id,r.scenarioGroup,r.split])),delegationHash,sourceHashes,parent,vocabularyHash:NUKNUK_TRAINING_VOCABULARY_HASH,
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  sourceWorktreeClean:execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()==='',
  files:Object.fromEntries(Object.entries(payload).map(([name,bytes])=>[name,{sha256:sha(bytes),bytes:Buffer.byteLength(bytes)}])),
  independentHumanGold:false,knownTwentyAreBlindTest:false,evaluationFreshness:beta?'CANDIDATE_UNSEEN_PENDING_LEAKAGE_REVIEW':'KNOWN_REGRESSION_ONLY',trainingStarted:false,weightsActivated:false,paidResourcesAuthorizedByExport:false,
  trainingLimits:{maxTotalTokens:5120,maxAnswerTokens:2048},
  limitations:['Authored synthetic examples represent fewer scenario families; grouped variants are not independent users.',
   beta?'Draft authored targets await independent Astra semantic/translation review; no ACCEPT receipt is fabricated.':'Grammar and canonical validation do not prove semantic correctness. Targets received commissioned assistant review only.',
   beta?`Four language variants per authored family are correlated; TEST has ${inventory.scenarioGroups.TEST} semantic groups, not 200 independent situations.`:'Evaluation families in this cohort were observed on November 23; TEST labels preserve historical grouping, not fresh blind-test eligibility.',
   'No spot facts, prices, hours or personal user data are learned. Catalog/matching problems remain separate.',
   'Current default full understanding and atomic dialogue are covered; simple-route and route-classifier retention must be checked before activation.'],
  comparison:{knownDevelopment:'REPLAY_ONLY_NOT_SELECTION',selection:'VALIDATION_ONLY_THEN_FREEZE_CHECKPOINT',test:'ONCE_AFTER_SELECTION',sameCatalogRequired:true,
   reviewLayers:['MEANING','SEARCH_CONSTRAINTS','ELIGIBLE_OFFER','RANKING','VISIBLE_REASON','LATENCY_AND_REPAIRS']}};
 await mkdir(out,{mode:0o700});
 for(const [name,bytes] of Object.entries({...payload,'manifest.json':JSON.stringify(manifest,null,2)+'\n'}))await writeFile(resolve(out,name),bytes,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({directory:out,...inventory,manifestSha256:await fileSha(resolve(out,'manifest.json')),trainingStarted:false,weightsActivated:false}));
 return manifest;
}

export async function exportProductGpuBundle(args,options={}){
 const [dataArg,hfArg,tokenizerArg,outArg]=args;
 if(args.length!==4)throw Error('usage: --product-search-v7 DATA CURRENT_HF_ADAPTER TOKENIZER OUTPUT');
 const data=resolve(dataArg),hf=resolve(hfArg),tokenizer=resolve(tokenizerArg),out=resolve(outArg);
 const manifestBytes=await readFile(resolve(data,'manifest.json')),manifest=JSON.parse(manifestBytes);
 const remediation=manifest.cohort==='BETA_REMEDIATION_V2',beta=manifest.cohort==='BETA_V1'||remediation;let admission=null;
 if(beta){if(!options.betaAdmissionFile)throw Error('beta_gpu_export_requires_review_and_separate_training_plan');const {verifyBetaAdmission}=await import('./nuknuk-beta-admission.mjs');admission=await verifyBetaAdmission(data,JSON.parse(await readFile(options.betaAdmissionFile)),resolve(dirname(fileURLToPath(import.meta.url)),'../..'));}
 const preflight=JSON.parse(await readFile(resolve(data,'preflight.json'))),parentProof=JSON.parse(await readFile(resolve(data,'parent-verification.json')));
 if(manifest.version!=='backyrd.nuknuk-product-training-manifest@1'||manifest.vocabularyHash!==NUKNUK_TRAINING_VOCABULARY_HASH||manifest.caseCount!==(remediation?884:beta?1200:152)||manifest.counts.TRAIN!==(remediation?484:beta?800:121)||manifest.counts.VALIDATION!==(beta?200:15)
  ||preflight.datasetManifestFileSha256!==sha(manifestBytes)||preflight.caseCount!==(remediation?884:beta?1200:152)||(beta&&preflight.transferCaseCount!==64)||preflight.maxTotalTokens>5120
  ||preflight.cases.some(r=>!r.grammarAccepted||!r.completionOnlyMaskVerified||!r.prefixTokenIdsSha256)
  ||parentProof.result!=='PASS'||parentProof.manifestSha256!==sha(manifestBytes)||!parentProof.exactTransposeEquality)throw Error('product_gpu_preflight_not_bound');
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
 for(const [name,hash] of Object.entries(beta?admission.sourceHashes:manifest.sourceHashes))if(await fileSha(resolve(root,name))!==hash)throw Error('product_gpu_source_changed');
 const payload=new Map();
 for(const name of ['train.jsonl','valid.jsonl']){
  const bytes=await readFile(resolve(data,name));if(sha(bytes)!==manifest.files[name].sha256)throw Error('product_gpu_data_changed');payload.set(name,bytes);
 }
 for(const name of ['adapter_model.safetensors','adapter_config.json']){
  const bytes=await readFile(resolve(hf,name));if(sha(bytes)!==manifest.parent[name==='adapter_config.json'?'hfAdapterConfigSha256':'hfAdapterSha256'])throw Error('product_gpu_parent_changed');payload.set('seed/'+name,bytes);
 }
 for(const name of ['tokenizer.json','tokenizer_config.json','chat_template.jinja']){
  const bytes=await readFile(resolve(tokenizer,name));if(sha(bytes)!==manifest.parent.modelFiles[name])throw Error('product_gpu_tokenizer_changed');payload.set('tokenizer/'+name,bytes);
 }
 for(const name of ['nuknuk-gpu.py','nuknuk-runpod-watch.py'])payload.set(name,await readFile(resolve(root,'scripts/decision-diagnostics',name)));
 const inputs=JSON.parse(await readFile(resolve(data,'evaluation-inputs.json')));
 if(sha(await readFile(resolve(data,'evaluation-inputs.json')))!==manifest.files['evaluation-inputs.json'].sha256)throw Error('product_gpu_evaluation_changed');
 const dev=inputs.cases.filter(r=>r.split==='VALIDATION'&&(!remediation||r.locale==='de')).map(({expected,...row})=>row);
 if(dev.length!==(remediation?50:beta?200:15))throw Error('product_gpu_development_count_changed');
 payload.set('development-requests.json',Buffer.from(JSON.stringify({cases:beta?[...new Map((remediation?dev.filter(r=>['de','de-CH'].includes(r.locale)):dev).map(r=>[r.scenarioGroup,r])).values()].slice(0,15):dev},null,2)+'\n'));
 payload.set('native-prefixes.json',Buffer.from(JSON.stringify(preflight.cases.filter(r=>r.split!=='TEST').map(r=>({id:r.id,split:r.split,prefixTokenIdsSha256:r.prefixTokenIdsSha256})),null,2)+'\n'));
 // Continuation only. No fresh adapter, rank change, test upload or live service mutation.
 let yaml=`base_model: /workspace/backyrd-product-training/base
plugins:
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
gradient_accumulation_steps: 4
eval_batch_size: 1
num_epochs: 2
optimizer: adamw_torch_8bit
lr_scheduler: cosine
learning_rate: 0.000006
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
eval_steps: 29
save_steps: 29
save_only_model: true
save_safetensors: true
use_wandb: false
dataset_processes: 4
`;
 if(beta){yaml=yaml.replace('num_epochs: 2','num_epochs: 1').replace('eval_steps: 29','eval_steps: 200').replace('save_steps: 29','save_steps: 50').replace('plugins:\n','plugins:\n  - nuknuk_beta_callback.BetaPlugin\n');payload.set('nuknuk_beta_callback.py',await readFile(resolve(root,'scripts/decision-diagnostics/nuknuk-beta-callback.py')));}
 if(remediation)yaml=yaml.replace('learning_rate: 0.000006','learning_rate: 0.000002');
 payload.set('train.yaml',Buffer.from(yaml));
 const gpuManifest={version:'backyrd.nuknuk-product-gpu-bundle@1',profile:remediation?'PRODUCT_SEARCH_V7_BETA_REMEDIATION_V2':beta?'PRODUCT_SEARCH_V7_BETA_CONTINUATION_V1':'PRODUCT_SEARCH_V7_CONTINUATION_V1',...(beta?{admissionReceiptSha256:admission.receiptSha256,sourceHashes:admission.sourceHashes}:{}),
  datasetHash:manifest.datasetHash,sourceManifestSha256:sha(manifestBytes),parent:manifest.parent,
  image:'axolotlai/axolotl-cloud-uv@sha256:5a989be77ecfc9ef6f4e578d0addec4e6a6fb882b64abe0b84613666c58afe61',
  recipe:{rank:16,alpha:32,epochs:beta?1:2,learningRate:remediation?0.000002:0.000006,seed:42,trainingRows:remediation?484:beta?800:121,validationRows:beta?200:15,optimizerUpdates:remediation?121:beta?200:undefined,maxTotalTokens:5120,maxTrainingSeconds:remediation?3900:beta?5100:1800,
   initialization:'EXACT_CURRENT_ADAPTER_CONTINUATION',testUploaded:false,activationAuthorized:false},
  files:Object.fromEntries([...payload].map(([name,bytes])=>[name,{sha256:sha(bytes),bytes:bytes.length}])),
  budgetCeilingUsd:beta?10:4,hourlyUpperBoundUsd:beta?3.5:3.7,closingReserveUsd:1,resourceCreationAuthorizedByBundle:false,providerStopRequired:true};
 await mkdir(out,{mode:0o700});for(const [name,bytes] of payload){await mkdir(dirname(resolve(out,name)),{recursive:true,mode:0o700});await writeFile(resolve(out,name),bytes,{flag:'wx',mode:0o600});}
 await writeFile(resolve(out,'product-gpu-manifest.json'),JSON.stringify(gpuManifest,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({directory:out,manifestSha256:await fileSha(resolve(out,'product-gpu-manifest.json')),testUploaded:false,resourcesStarted:false}));
}
