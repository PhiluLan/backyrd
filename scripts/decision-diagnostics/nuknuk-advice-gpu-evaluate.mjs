#!/usr/bin/env node
// Explicit, bounded SSH transport for actual model outputs. Never starts a Pod.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {evaluateAdviceRollouts} from './nuknuk-curriculum/advice-evaluation.mjs';

const TASKS=new Set(['INTERPRET_REQUEST','ASSESS_CANDIDATES','PLAN_SEARCH','PROPOSE_EXPERIENCE']);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const safePath=value=>typeof value==='string'&&/^\/[a-zA-Z0-9_./-]+$/.test(value)&&!value.split('/').includes('..');

export function sessionArguments(config){
 if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(config.host)||!Number.isInteger(config.port)||config.port<1||config.port>65535)throw Error('gpu_transport_host_invalid');
 for(const key of ['sshKey','knownHosts','remotePython','remoteSession','remoteBundle','remoteOutput'])if(!safePath(config[key]))throw Error('gpu_transport_path_invalid:'+key);
 if(!/^[a-f0-9]{64}$/.test(config.datasetHash)||!Number.isInteger(config.maximumCalls)||config.maximumCalls<1||config.maximumCalls>240
  ||!Number.isInteger(config.maxSeconds)||config.maxSeconds<60||config.maxSeconds>7200)throw Error('gpu_transport_bounds_invalid');
 const remote=[config.remotePython,'-u','-B',config.remoteSession,'--bundle',config.remoteBundle,'--output',config.remoteOutput,
  '--dataset-hash',config.datasetHash,'--maximum-calls',String(config.maximumCalls),'--max-seconds',String(config.maxSeconds)];
 if(config.adapterPath){
  if(!safePath(config.adapterPath)||!/^[a-f0-9]{64}$/.test(config.adapterHash))throw Error('gpu_transport_adapter_pin_required');
  remote.push('--adapter',config.adapterPath,'--adapter-sha256',config.adapterHash);
 }else if(config.adapterHash)throw Error('gpu_transport_adapter_path_required');
 return ['-T','-i',config.sshKey,'-o','UserKnownHostsFile='+config.knownHosts,'-o','StrictHostKeyChecking=yes',
  '-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2','-p',String(config.port),'root@'+config.host,remote.join(' ')];
}

export async function connectGpuSession(config,{onStderr=()=>{},spawnProcess=spawn}={}){
 const child=spawnProcess('ssh',sessionArguments(config),{stdio:['pipe','pipe','pipe']});
 const lines=createInterface({input:child.stdout,crlfDelay:Infinity});
 let pending=null,readyResolve,readyReject,ready=false,closed=false,finished=false,calls=0,identity=null;
 const readyPromise=new Promise((accept,reject)=>{readyResolve=accept;readyReject=reject;});
 const fail=error=>{if(!ready)readyReject(error);if(pending){clearTimeout(pending.timer);pending.reject(error);pending=null;}};
 const startup=setTimeout(()=>{fail(Error('gpu_transport_startup_timeout'));child.kill('SIGTERM');},600_000);
 const total=setTimeout(()=>{fail(Error('gpu_transport_total_timeout'));child.kill('SIGTERM');},(config.maxSeconds+30)*1000);
 child.stderr.on('data',chunk=>onStderr(chunk));
 child.on('error',fail);
 child.on('close',code=>{closed=true;clearTimeout(startup);clearTimeout(total);if(!ready||code!==0||!finished)fail(Error('gpu_transport_unexpected_exit:'+code));});
 lines.on('line',line=>{
  try{
   const record=JSON.parse(line);
   if(record.event==='READY'){
    if(ready||record.datasetHash!==config.datasetHash||record.maximumCalls!==config.maximumCalls||!/^[a-f0-9]{64}$/.test(record.modelIdentity?.adapterHash)
     ||record.modelIdentity?.model!=='Qwen/Qwen3.5-27B'||record.modelIdentity?.revision!=='fc05daec18b0a78c049392ed2e771dde82bdf654'
     ||(config.adapterHash&&record.modelIdentity.adapterHash!==config.adapterHash)
     ||(!config.adapterPath&&record.modelIdentity.initialization!=='FRESH_ZERO_LORA'))throw Error('gpu_transport_ready_identity_invalid');
    ready=true;identity=record.modelIdentity;clearTimeout(startup);readyResolve(record);return;
   }
   if(record.event==='COMPLETE'){if(!ready||pending||finished)throw Error('gpu_transport_premature_complete');finished=true;return;}
   if(record.event!=='GENERATED'||!pending||record.id!==pending.id||record.task!==pending.task||record.datasetHash!==config.datasetHash
    ||record.modelIdentity?.adapterHash!==identity?.adapterHash)throw Error('gpu_transport_response_identity_invalid');
   const current=pending;pending=null;clearTimeout(current.timer);current.resolve(record);
  }catch(error){fail(error);child.kill('SIGTERM');}
 });
 let readyRecord;
 try{readyRecord=await readyPromise;}catch(error){clearTimeout(startup);clearTimeout(total);child.kill('SIGTERM');throw error;}
 return{
  ready:readyRecord,
  async call({id,task,instructions,input,outputSchema}){
   if(closed||pending||calls>=config.maximumCalls||!TASKS.has(task)||!/^[a-z0-9-]{1,160}$/.test(id))throw Error('gpu_transport_call_invalid');
   calls++;
   return new Promise((accept,reject)=>{
    const timer=setTimeout(()=>{pending=null;reject(Error('gpu_transport_call_timeout'));child.kill('SIGTERM');},210_000);
    pending={id,task,timer,resolve:accept,reject};
    child.stdin.write(JSON.stringify({id,task,datasetHash:config.datasetHash,messages:[{role:'system',content:instructions},{role:'user',content:input}],outputSchema})+'\n',error=>{if(error)fail(error);});
   });
  },
  async close(){
   if(pending)throw Error('gpu_transport_close_pending');
   if(closed){if(!finished)throw Error('gpu_transport_session_not_complete');return;}
   child.stdin.end();
   await new Promise((accept,reject)=>{
    const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('gpu_transport_close_timeout'));},15_000);
    child.once('close',code=>{clearTimeout(timer);if(code===0&&finished)accept();else reject(Error('gpu_transport_close_failed:'+code));});
   });
  },
  abort(){clearTimeout(startup);clearTimeout(total);if(pending){clearTimeout(pending.timer);pending.reject(Error('gpu_transport_aborted'));pending=null;}child.kill('SIGTERM');}
 };
}

export function verifyEvaluationInputs({manifestBytes,proof,signoff,inputs}){
 const manifest=JSON.parse(manifestBytes);
 if(hash(manifestBytes)!==proof.artifacts?.['manifest.json']?.fileSha256||proof.newAnchorHash!==manifest.anchorHash
  ||signoff.anchorHash!==manifest.anchorHash)throw Error('gpu_arm_review_anchor_or_manifest_mismatch');
 for(const [name,bytes] of Object.entries(inputs)){
  if(hash(bytes)!==proof.artifacts[name]?.fileSha256||JSON.parse(bytes).datasetHash!==manifest.datasetHash)throw Error('gpu_arm_unreviewed_input:'+name);
 }
 return manifest;
}

export async function evaluateGpuArm({source,output,connection,rolloutIds=null,phaseIds=null}){
 const folder=resolve(source),out=resolve(output);
 const manifestBytes=await readFile(resolve(folder,'manifest.json'));
 const manifest=JSON.parse(manifestBytes);
 if(connection.datasetHash!==manifest.datasetHash)throw Error('gpu_arm_source_dataset_mismatch');
 const proof=JSON.parse(await readFile(resolve(folder,'independent-review.json')));
 const files={},inputBytes={};
 for(const name of ['evaluation-inputs.json','chain-evaluation-inputs.json','metamorphic-evaluation-inputs.json']){
  const bytes=await readFile(resolve(folder,name));
  inputBytes[name]=bytes;files[name]=JSON.parse(bytes);
 }
 verifyEvaluationInputs({manifestBytes,proof,signoff:JSON.parse(await readFile(resolve(folder,'review-signoff.json'))),inputs:inputBytes});
 const phases=files['evaluation-inputs.json'].cases.filter(c=>c.split==='VALIDATION'&&(!phaseIds||phaseIds.includes(c.id)));
 const controls=phaseIds?[]:files['metamorphic-evaluation-inputs.json'].cases.filter(c=>c.split==='VALIDATION');
 const chains=files['chain-evaluation-inputs.json'].cases.filter(c=>c.split==='VALIDATION'&&(!rolloutIds||rolloutIds.includes(c.id)));
 if(phaseIds&&phases.length!==phaseIds.length||rolloutIds&&chains.length!==rolloutIds.length||!chains.length)throw Error('gpu_arm_inventory_invalid');
 const maximum=phases.length+controls.length+chains.length*3;
 if(connection.maximumCalls<maximum)throw Error('gpu_arm_calls_not_reserved');
 await mkdir(out,{mode:0o700});
 const stderr=await open(resolve(out,'remote-stderr.log'),'wx',0o600);
 let session;
 try{
  session=await connectGpuSession(connection,{onStderr:chunk=>stderr.write(chunk)});
  await writeFile(resolve(out,'ready.json'),JSON.stringify(session.ready,null,2)+'\n',{flag:'wx',mode:0o600});
  const phaseRecords=[];
  for(const item of [...phases,...controls]){
   const request={id:item.id,task:item.task,instructions:item.messages[0].content,input:item.messages[1].content,outputSchema:item.outputSchema};
   const record=await session.call(request);
   await writeFile(resolve(out,item.id+'.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
   phaseRecords.push({id:item.id,task:item.task,status:record.status});
   console.log(JSON.stringify({event:'PHASE_SECURED',id:item.id,status:record.status}));
  }
  let sequence=0;
  const rollouts=await evaluateAdviceRollouts({inputs:chains,datasetHash:manifest.datasetHash,modelIdentity:session.ready.modelIdentity,maximumModelCalls:chains.length*3,
   modelCall:async request=>{
    const record=await session.call({...request,id:'rollout-'+String(++sequence).padStart(3,'0')});
    if(record.status!=='GENERATED_REQUIRES_SEMANTIC_REVIEW')throw Error('gpu_arm_generation_failed:'+record.status+':'+(record.error??''));
    return{raw:record.raw,modelIdentity:record.modelIdentity};
   },
   onEvidence:async value=>{
    const name=value.task?value.caseId+'-'+value.task.toLowerCase():value.id+'-chain';
    await writeFile(resolve(out,name+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({event:'ROLLOUT_EVIDENCE_SECURED',id:name}));
   }});
  await writeFile(resolve(out,'rollouts.json'),JSON.stringify(rollouts,null,2)+'\n',{flag:'wx',mode:0o600});
  await session.close();
  const receipt={purpose:'ACTUAL_MODEL_DEV_OUTPUTS_REQUIRING_SEMANTIC_REVIEW',datasetHash:manifest.datasetHash,manifestFileSha256:hash(manifestBytes),
   modelIdentity:session.ready.modelIdentity,phases:phaseRecords,rolloutCount:chains.length,rolloutFailed:rollouts.failed,
   pilotSubset:!!(phaseIds||rolloutIds),productionActivation:false,providerBillingStopped:false};
  await writeFile(resolve(out,'result.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});return receipt;
 }catch(error){session?.abort();throw error;}finally{await stderr.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [source,connectionFile,output,subsetFile]=process.argv.slice(2);
 if(!source||!connectionFile||!output)throw Error('gpu_arm_arguments_required');
 const connection=JSON.parse(await readFile(resolve(connectionFile)));
 const subset=subsetFile?JSON.parse(await readFile(resolve(subsetFile))):{};
 console.log(JSON.stringify(await evaluateGpuArm({source,output,connection,...subset})));
}
