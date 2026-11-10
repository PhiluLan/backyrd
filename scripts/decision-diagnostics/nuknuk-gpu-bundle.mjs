#!/usr/bin/env node
// Explicit allowlist export, no project checkout, .env, credentials or private key.
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {auditUnderstandingDataset,understandingSplitHash,exportUnderstandingDataset} from '../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js';

const [sourceDirectory,parentAdapter,python,outputDirectory,parityPlanFile,approvedSourceSha,recipeName,tokenizerDirectory]=process.argv.slice(2);
if(!sourceDirectory||!parentAdapter||!python||!outputDirectory)throw Error('nuknuk_gpu_bundle_arguments_required');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=resolve(sourceDirectory),parent=resolve(parentAdapter),out=resolve(outputDirectory);
const sourceManifest=await readFile(resolve(source,'manifest.json'));
if(digest(sourceManifest)!==(approvedSourceSha??'ae9b4b4e4314205eb4509692548d23ec67f8be27a9034e35924463bd16244969'))throw Error('nuknuk_gpu_source_manifest_changed');
const V7_RECIPE='V7_TASK_BALANCED_PILOT_V1';
if(recipeName){
  if(recipeName!==V7_RECIPE||!tokenizerDirectory||!approvedSourceSha||parentAdapter!=='-'||parityPlanFile!=='-')throw Error('nuknuk_v7_bundle_arguments_invalid');
  const manifest=JSON.parse(sourceManifest);
  if(manifest.curriculumVersion!=='backyrd.nuknuk-solid-curriculum@7'||manifest.instructionProfile!=='SPOT_GROUNDED_V6'
    ||manifest.targetSerialization!=='schema-ordered-spaced-json@1'
    ||JSON.stringify(manifest.counts)!==JSON.stringify({TRAIN:972,VALIDATION:146,TEST:178}))throw Error('nuknuk_v7_source_invalid');
  const reviewed=JSON.parse(await readFile(resolve(source,'reviewed-backyrd.json'),'utf8'));
  const exported=exportUnderstandingDataset(reviewed,understandingSplitHash(reviewed.splitPlan),'SPOT_GROUNDED_V6');
  if(exported.manifest.datasetHash!==manifest.datasetHash||exported.manifest.filesHash!==manifest.filesHash)throw Error('nuknuk_v7_export_binding_changed');
  const receiptBytes=await readFile(resolve(source,'independent-review.json'));
  const receipt=JSON.parse(receiptBytes);
  if(!receipt.verdict.startsWith('GO_FOR_DATA_AND_METHODOLOGY_OF_BOUNDED_EXPERIMENT')
    ||receipt.datasetHash!==manifest.datasetHash||receipt.newAnchorHash!==manifest.anchorHash)throw Error('nuknuk_v7_review_binding_invalid');
  for(const [name,binding] of Object.entries(receipt.artifacts)){
    if(!/^[a-z0-9-]+\.(json|jsonl|md)$/.test(name)||digest(await readFile(resolve(source,name)))!==binding.fileSha256)throw Error('nuknuk_v7_review_artifact_changed');
  }
  const preflightBytes=await readFile(resolve(source,'preflight.json'));
  const preflight=JSON.parse(preflightBytes);
  if(preflight.datasetManifestFileSha256!==approvedSourceSha||preflight.caseCount!==1296||preflight.grammarCount!==4
    ||preflight.maxTotalTokens>4096||preflight.maxAnswerTokens+1>2048
    ||preflight.cases.some(row=>!row.grammarAccepted||!row.completionOnlyMaskVerified))throw Error('nuknuk_v7_preflight_invalid');
  const payload=new Map([
    ['curriculum-manifest.json',sourceManifest],['offline-preflight.json',preflightBytes],['independent-review.json',receiptBytes],
  ]);
  for(const [split,rows] of Object.entries(exported.files)){
    const bytes=await readFile(resolve(source,split+'.jsonl'));
    if(bytes.toString()!==rows.map(JSON.stringify).join('\n')+'\n')throw Error('nuknuk_v7_jsonl_changed');
    payload.set('data/'+split+'.jsonl',bytes);
  }
  for(const name of ['evaluation-plan.json','metamorphic-evaluation-plan.json','chain-evaluation-inputs.json']){
    const bytes=await readFile(resolve(source,name));const plan=JSON.parse(bytes);
    if(plan.datasetHash!==manifest.datasetHash)throw Error('nuknuk_v7_evaluation_binding_changed');
    payload.set(name,bytes);
  }
  for(const name of ['tokenizer.json','tokenizer_config.json','chat_template.jinja']){
    const bytes=await readFile(resolve(tokenizerDirectory,name));
    if(digest(bytes)!==preflight.tokenizerFilesSha256[name])throw Error('nuknuk_v7_tokenizer_changed');
    payload.set('tokenizer/'+name,bytes);
  }
  const trainLines=payload.get('data/train.jsonl').toString().trimEnd().split('\n');
  const trainCases=reviewed.cases.filter(row=>row.split==='TRAIN').map((row,index)=>({id:row.id,task:row.content.task,
    split:row.split,scenarioGroup:row.scenarioGroup,contentHash:row.contentHash,rowSha256:digest(trainLines[index])}));
  const taskCounts=Object.fromEntries(['INTERPRET_REQUEST','ASSESS_CANDIDATES','PLAN_SEARCH','PROPOSE_EXPERIENCE'].map(task=>[task,trainCases.filter(r=>r.task===task).length]));
  if(JSON.stringify(Object.values(taskCounts))!==JSON.stringify([700,104,84,84]))throw Error('nuknuk_v7_task_inventory_changed');
  payload.set('training-cases.json',Buffer.from(JSON.stringify(trainCases,null,2)+'\n'));
  const recipe={name:V7_RECIPE,datasetHash:manifest.datasetHash,sourceManifestFileSha256:approvedSourceSha,
    model:'Qwen/Qwen3.5-27B',revision:'fc05daec18b0a78c049392ed2e771dde82bdf654',
    strategy:'language-linear',layers:16,rank:8,alpha:16,dropout:0,learningRate:0.00002,batchSize:2,
    steps:210,smokeSteps:2,checkpointEvery:70,maxTrainingSeconds:3000,seed:7,
    taskCycle:['INTERPRET_REQUEST','ASSESS_CANDIDATES','PLAN_SEARCH','PROPOSE_EXPERIENCE','INTERPRET_REQUEST'],
    taskCounts,plannedPresentations:{INTERPRET_REQUEST:168,ASSESS_CANDIDATES:84,PLAN_SEARCH:84,PROPOSE_EXPERIENCE:84},
    loss:'HF_TOKEN_MEAN_WITHIN_SINGLE_TASK_BATCH',scheduler:'GROUP_ROUND_ROBIN_WITHOUT_REPLACEMENT_SEED_7',
    initialization:'EXPLICIT_FRESH_ZERO_DELTA_OR_SHA_PINNED_ADAPTER',completionHead:false,
    maxTotalTokens:4096,maxOutputTokens:2048,pilotBudgetUSD:20,totalBudgetUSD:200,closingReserveUSD:20,
    selection:'FULL_DEV_146_PLUS_8_CONTROLS_PLUS_18_ACTUAL_ROLLOUTS; NO_TEST_BEFORE_FROZEN_SELECTION',
    processTimeoutDoesNotStopBilling:true,launchAuthorizedByBundle:false};
  payload.set('pilot-recipe.json',Buffer.from(JSON.stringify(recipe,null,2)+'\n'));
  const here=dirname(fileURLToPath(import.meta.url));
  for(const [local,name] of [['nuknuk-gpu.py','nuknuk-gpu.py'],['nuknuk-gpu-session.py','nuknuk-gpu-session.py'],['nuknuk-gpu-requirements.txt','requirements.txt']])payload.set(name,await readFile(resolve(here,local)));
  payload.set('START.txt',Buffer.from(`Explicit @7 pilot; no resources started. Original dataset bytes preserved: 972 TRAIN / 146 DEV / 178 TEST.
Recipe ${V7_RECIPE}: 210 task-homogeneous batch-2 updates, LR 0.00002, language-linear, layers 16, checkpoints 70.
Specify --recipe ${V7_RECIPE} --initialization fresh (zero delta), or adapter plus an exact --adapter-sha256.
Normal HF loss only; smoke is exactly 2 updates in a separate discarded output. No completion-head optimization.
The native tokenizer/template/grammar check runs over every TRAIN row before model weights load.
Use active independent process AND provider cost/shutdown watchers: pilot <=20 USD within total <=200 USD.
Retain >=20 USD total-budget closing reserve. Bundle purpose and process timeout are not a provider spending limit.
No TEST selection. Evaluate all DEV phases, controls and actual sequential rollouts; group subset is diagnostic only.
Save and hash the actual zero-delta adapter for baseline identity. No model result or production approval is implied.
`));
  await mkdir(out,{mode:0o700});
  for(const directory of ['data','tokenizer'])await mkdir(resolve(out,directory),{mode:0o700});
  const hashes={};for(const [name,bytes] of payload){await writeFile(resolve(out,name),bytes,{flag:'wx',mode:0o600});hashes[name]=digest(bytes);}
  const bundleManifest={version:2,purpose:'APPROVED_V7_FOUR_TASK_20_USD_PILOT',model:recipe.model,revision:recipe.revision,
    parentAdapterSha256:null,sourceDatasetHash:manifest.datasetHash,sourceManifestFileSha256:approvedSourceSha,
    sourceAnchorHash:manifest.anchorHash,counts:manifest.counts,instructionProfile:'SPOT_GROUNDED_V6',
    targetSerialization:manifest.targetSerialization,recipeName:V7_RECIPE,recipeFileSha256:hashes['pilot-recipe.json'],
    files:hashes,productionActivation:false,remoteUploadPerformed:false,costlyResourcesStarted:false};
  await writeFile(resolve(out,'bundle.json'),JSON.stringify(bundleManifest,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({directory:out,recipe:V7_RECIPE,counts:manifest.counts,recipeFileSha256:hashes['pilot-recipe.json'],remoteUploadPerformed:false,costlyResourcesStarted:false}));
  process.exit(0);
}
const data=JSON.parse(await readFile(resolve(source,'reviewed-backyrd.json'),'utf8'));
const audit=auditUnderstandingDataset(data,understandingSplitHash(data.splitPlan));
const broad=JSON.parse(sourceManifest).round===4;
const focused=JSON.parse(sourceManifest).round===5;
if(!audit.exportReady||(!broad&&!focused&&(audit.counts.TRAIN!==6||audit.counts.VALIDATION!==2||audit.counts.TEST!==1))||(broad&&(!approvedSourceSha||audit.counts.TRAIN!==2320||audit.counts.VALIDATION!==100||audit.counts.TEST!==300))||(focused&&(!approvedSourceSha||audit.counts.TRAIN!==296||audit.counts.VALIDATION!==16||audit.counts.TEST!==24)))throw Error('nuknuk_gpu_cohort_invalid');
const instructionProfile=JSON.parse(sourceManifest).instructionProfile ?? 'COMPACT_ADAPTER_V3';
if(!['COMPACT_ADAPTER_V3','COMPACT_ADAPTER_V4'].includes(instructionProfile))throw Error('nuknuk_gpu_instruction_profile_invalid');
const bundle=exportUnderstandingDataset(data,understandingSplitHash(data.splitPlan),instructionProfile);
const files=JSON.parse(sourceManifest.toString()).fileByteHashes;
for(const [split,rows] of Object.entries(bundle.files)){
  const old=await readFile(resolve(source,split+'.jsonl'));
  if(digest(old)!==files[split+'.jsonl']||(!broad||split!=='train'?rows.map(JSON.stringify).join('\n')+'\n'!==old.toString():!old.toString().startsWith(rows.map(JSON.stringify).join('\n')+'\n')))throw Error('nuknuk_gpu_export_changed');
}
await mkdir(out,{mode:0o700});await mkdir(resolve(out,'data'),{mode:0o700});
for(const [split,rows] of Object.entries(bundle.files))await writeFile(resolve(out,'data',split+'.jsonl'),broad?await readFile(resolve(source,split+'.jsonl')):rows.map(JSON.stringify).join('\n')+'\n',{flag:'wx',mode:0o600});
if(broad||focused){
  await copyFile(resolve(source,'manifest.json'),resolve(out,'curriculum-manifest.json'));
  await copyFile(resolve(source,'evaluation-inputs.json'),resolve(out,'evaluation-inputs.json'));
  if(broad)await copyFile(resolve(source,'preference-reviewed.jsonl'),resolve(out,'preference-pairs.jsonl'));
}
const here=dirname(fileURLToPath(import.meta.url));
await copyFile(resolve(here,'nuknuk-gpu.py'),resolve(out,'nuknuk-gpu.py'));
await copyFile(resolve(here,'nuknuk-gpu-requirements.txt'),resolve(out,'requirements.txt'));
execFileSync(python,['-B',resolve(here,'nuknuk-gpu.py'),'convert','--source',parent,'--output',resolve(out,'parent-seed.npz')],{stdio:'inherit'});
if(parityPlanFile && parityPlanFile!=='-'){
  const bytes=await readFile(resolve(parityPlanFile));const plan=JSON.parse(bytes.toString());
  if(plan.parentAdapterSha256!=='cd0735f6cc576df3386ca0254d08d3db7e976f0711a6fad7bf900777a0f180b3'
      ||plan.cases.length!==6||plan.trainingExecuted!==false||plan.llguidanceVersion!=='1.9.1'
      ||plan.cases.some(row=>row.messages.map(m=>m.role).join(',')!=='system,user'||typeof row.grammar!=='string'))
    throw Error('nuknuk_gpu_parity_plan_invalid');
  await writeFile(resolve(out,'parity-cases.json'),bytes,{flag:'wx',mode:0o600});
}
await writeFile(resolve(out,'START.txt'),`Backyrd Nuknuk GPU pilot — prepared, CUDA not yet tested\n
This bundle contains six approved synthetic training cases, two validation cases,
one previously exposed test case, and a converted parent adapter. No production
access, passwords or SSH private keys. TEST is never used by the trainer.

Use one H100 80 GB, an official Runpod PyTorch template, 200 GB /workspace storage,
and full SSH access. Keep automatic top-up disabled. The model is publicly
downloadable; no paid Hugging Face subscription is required.

On the Pod, create a dedicated virtual environment. Do not install on the Mac:
python3 -m venv /workspace/backyrd-gpu-env
/workspace/backyrd-gpu-env/bin/pip install torch==2.8.0 --index-url https://download.pytorch.org/whl/cu128
/workspace/backyrd-gpu-env/bin/pip install -r requirements.txt

export HF_HOME=/workspace/hf-cache
export HF_HUB_DISABLE_TELEMETRY=1
export WANDB_DISABLED=true
export TOKENIZERS_PARALLELISM=false

Read-only host/bundle check (no model weights loaded):
/workspace/backyrd-gpu-env/bin/python -B nuknuk-gpu.py check --bundle .

FIRST run only the 2-step, one-layer CUDA smoke; no automatic longer training:
timeout --signal=TERM --kill-after=30s 3600 /workspace/backyrd-gpu-env/bin/python -B -u nuknuk-gpu.py train --bundle . --steps 2 --layers 1 --output /workspace/nuknuk-smoke

After CUDA forward/backward, copied adapter matrices and semantic parity have
been checked, the next explicitly selected pilot is 20 steps with layers 1 or 4.
Each run must use a new output directory. No automated retries or publication.

GNU timeout stops the PROCESS, not the Pod's hourly billing. After copying all
results back, stop/terminate the Pod in Runpod. Storage can remain billable.
Do not treat a completed training run as semantic quality approval.
`,{flag:'wx',mode:0o600});
if(broad)await writeFile(resolve(out,'START.txt'),`Commissioned broad synthetic curriculum. Original parent retained. No production access.
2360 TRAIN rows including 40 licensed auxiliary exercises; 100 development and 300 sealed TEST requests.
Train only data/train.jsonl. Select checkpoints only on VALIDATION. TEST is final evaluation only.
Start only with active local budget watcher and verified stop path. Total ceiling including prior runs: USD 20.
Copy checkpoints and results to the Mac before stopping the temporary container. Process timeout does not stop billing.
`,{mode:0o600});
if(parityPlanFile && parityPlanFile!=='-')await writeFile(resolve(out,'START.txt'),`READ-ONLY PARENT PARITY: use nuknuk-gpu.py evaluate --bundle . --output /workspace/nuknuk-parity-results\nDo not invoke train. Six known cases, frozen parent, exact Mac-compiled grammar.\nInstall requirements.txt in the same pinned CUDA environment. External timeout <=1200 seconds; stop the Pod after securing results.\n`);
const hashes={};
for(const name of await readdir(out))if(name!=='data')hashes[name]=digest(await readFile(resolve(out,name)));
for(const name of await readdir(resolve(out,'data')))hashes['data/'+name]=digest(await readFile(resolve(out,'data',name)));
const manifest={version:1,purpose:broad||focused?'APPROVED_BROAD_CURRICULUM_20_USD_BOUNDED':'PREPARED_GPU_PILOT_NOT_CUDA_VERIFIED',model:'Qwen/Qwen3.5-27B',revision:'fc05daec18b0a78c049392ed2e771dde82bdf654',parentAdapterSha256:'cd0735f6cc576df3386ca0254d08d3db7e976f0711a6fad7bf900777a0f180b3',sourceDatasetHash:bundle.manifest.datasetHash,targetSerialization:bundle.manifest.targetSerialization,counts:broad||focused?JSON.parse(sourceManifest).counts:bundle.manifest.counts,files:hashes,productionActivation:false,remoteUploadPerformed:false,costlyResourcesStarted:false};
await writeFile(resolve(out,'bundle.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({directory:out,files:Object.keys(hashes).length,counts:manifest.counts,remoteUploadPerformed:false,costlyResourcesStarted:false}));
