#!/usr/bin/env node
// Explicit allowlist export, no project checkout, .env, credentials or private key.
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {auditUnderstandingDataset,understandingSplitHash,exportUnderstandingDataset} from '../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js';

const [sourceDirectory,parentAdapter,python,outputDirectory]=process.argv.slice(2);
if(!sourceDirectory||!parentAdapter||!python||!outputDirectory)throw Error('nuknuk_gpu_bundle_arguments_required');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=resolve(sourceDirectory),parent=resolve(parentAdapter),out=resolve(outputDirectory);
const sourceManifest=await readFile(resolve(source,'manifest.json'));
if(digest(sourceManifest)!=='ae9b4b4e4314205eb4509692548d23ec67f8be27a9034e35924463bd16244969')throw Error('nuknuk_gpu_source_manifest_changed');
const data=JSON.parse(await readFile(resolve(source,'reviewed-backyrd.json'),'utf8'));
const audit=auditUnderstandingDataset(data,understandingSplitHash(data.splitPlan));
if(!audit.exportReady||audit.counts.TRAIN!==6||audit.counts.VALIDATION!==2||audit.counts.TEST!==1)throw Error('nuknuk_gpu_cohort_invalid');
const bundle=exportUnderstandingDataset(data,understandingSplitHash(data.splitPlan),'COMPACT_ADAPTER_V3');
const files=JSON.parse(sourceManifest.toString()).fileByteHashes;
for(const [split,rows] of Object.entries(bundle.files)){
  const old=await readFile(resolve(source,split+'.jsonl'));
  if(digest(old)!==files[split+'.jsonl']||rows.map(JSON.stringify).join('\n')+'\n'!==old.toString())throw Error('nuknuk_gpu_export_changed');
}
await mkdir(out,{mode:0o700});await mkdir(resolve(out,'data'),{mode:0o700});
for(const [split,rows] of Object.entries(bundle.files))await writeFile(resolve(out,'data',split+'.jsonl'),rows.map(JSON.stringify).join('\n')+'\n',{flag:'wx',mode:0o600});
const here=dirname(fileURLToPath(import.meta.url));
await copyFile(resolve(here,'nuknuk-gpu.py'),resolve(out,'nuknuk-gpu.py'));
await copyFile(resolve(here,'nuknuk-gpu-requirements.txt'),resolve(out,'requirements.txt'));
execFileSync(python,['-B',resolve(here,'nuknuk-gpu.py'),'convert','--source',parent,'--output',resolve(out,'parent-seed.npz')],{stdio:'inherit'});
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
const hashes={};
for(const name of await readdir(out))if(name!=='data')hashes[name]=digest(await readFile(resolve(out,name)));
for(const name of await readdir(resolve(out,'data')))hashes['data/'+name]=digest(await readFile(resolve(out,'data',name)));
const manifest={version:1,purpose:'PREPARED_GPU_PILOT_NOT_CUDA_VERIFIED',model:'Qwen/Qwen3.5-27B',revision:'fc05daec18b0a78c049392ed2e771dde82bdf654',parentAdapterSha256:'cd0735f6cc576df3386ca0254d08d3db7e976f0711a6fad7bf900777a0f180b3',sourceDatasetHash:bundle.manifest.datasetHash,targetSerialization:bundle.manifest.targetSerialization,counts:bundle.manifest.counts,files:hashes,productionActivation:false,remoteUploadPerformed:false,costlyResourcesStarted:false};
await writeFile(resolve(out,'bundle.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({directory:out,files:Object.keys(hashes).length,counts:manifest.counts,remoteUploadPerformed:false,costlyResourcesStarted:false}));
