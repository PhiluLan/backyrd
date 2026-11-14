import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {createHash} from 'node:crypto';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {connectGpuSession,sessionArguments,verifyEvaluationInputs,verifyFrozenTestSelection} from './nuknuk-advice-gpu-evaluate.mjs';

const config={host:'127.0.0.1',port:2222,sshKey:'/private/key',knownHosts:'/private/hosts',remotePython:'/workspace/env/bin/python',
 remoteSession:'/workspace/nuknuk-gpu-session.py',remoteBundle:'/workspace/bundle',remoteOutput:'/workspace/arm',datasetHash:'a'.repeat(64),maximumCalls:2,maxSeconds:60};
const identity={adapterHash:'b'.repeat(64),initialization:'FRESH_ZERO_LORA',model:'Qwen/Qwen3.5-27B',revision:'fc05daec18b0a78c049392ed2e771dde82bdf654'};
function fakeProcess({readyIdentity=identity,responseIdentity=identity}={}){
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.killed=false;
 child.kill=()=>{if(!child.killed){child.killed=true;setImmediate(()=>child.emit('close',1));}};
 const requests=[];
 child.stdin=new Writable({write(bytes,_encoding,callback){
  const value=JSON.parse(bytes.toString());requests.push(value);
  setImmediate(()=>child.stdout.write(JSON.stringify({event:'GENERATED',id:value.id,task:value.task,datasetHash:config.datasetHash,
   modelIdentity:responseIdentity,status:'GENERATED_REQUIRES_SEMANTIC_REVIEW',raw:{actual:true}})+'\n'));callback();
 }});
 child.stdin.on('finish',()=>setImmediate(()=>{
  child.stdout.write(JSON.stringify({event:'COMPLETE'})+'\n');child.stdout.end();child.emit('close',0);
 }));
 queueMicrotask(()=>child.stdout.write(JSON.stringify({event:'READY',datasetHash:config.datasetHash,maximumCalls:config.maximumCalls,modelIdentity:readyIdentity})+'\n'));
 return{child,requests};
}

test('SSH is pinned and no connection/adapter value can become shell syntax',()=>{
 const args=sessionArguments(config);
 assert.ok(args.includes('StrictHostKeyChecking=yes'));
 for(const variant of [{remoteOutput:'/workspace/out;touch /tmp/x'},{host:'127.0.0.1;bad'},{adapterPath:'/workspace/adapter'},
  {remotePython:'/workspace/../wrong'},{maximumCalls:241}])assert.throws(()=>sessionArguments({...config,...variant}));
});

test('actual output and adapter identity cross bounded target-free transport',async()=>{
 const {child,requests}=fakeProcess();
 const session=await connectGpuSession(config,{spawnProcess:()=>child});
 assert.equal(session.ready.modelIdentity.adapterHash,identity.adapterHash);
 const result=await session.call({id:'advice-astra-citizenship-solo-archive-plan_search',task:'PLAN_SEARCH',instructions:'system',input:'actual upstream output',outputSchema:{type:'object'}});
 assert.deepEqual(result.raw,{actual:true});
 assert.equal(requests[0].id,'advice-astra-citizenship-solo-archive-plan_search');
 assert.deepEqual(requests[0].messages.map(m=>m.role),['system','user']);
 assert.equal(requests[0].messages[1].content,'actual upstream output');
 await session.close();
});

test('wrong startup pin aborts before any request',async()=>{
 const {child,requests}=fakeProcess();
 await assert.rejects(connectGpuSession({...config,adapterPath:'/workspace/adapter',adapterHash:'c'.repeat(64)},{spawnProcess:()=>child}),/identity_invalid/);
 assert.equal(requests.length,0);assert.equal(child.killed,true);
});

test('wrong returned adapter fails the call and terminates the transport',async()=>{
 const {child}=fakeProcess({responseIdentity:{...identity,adapterHash:'c'.repeat(64)}});
 const session=await connectGpuSession(config,{spawnProcess:()=>child});
 await assert.rejects(session.call({id:'phase-1',task:'PLAN_SEARCH',instructions:'system',input:'input',outputSchema:{type:'object'}}),/response_identity_invalid/);
 session.abort();assert.equal(child.killed,true);
});

test('COMPLETE before READY cannot leave startup hanging after clean process exit',async()=>{
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
 child.kill=()=>setImmediate(()=>child.emit('close',0));
 queueMicrotask(()=>{child.stdout.write(JSON.stringify({event:'COMPLETE'})+'\n');child.emit('close',0);});
 await assert.rejects(connectGpuSession(config,{spawnProcess:()=>child}),/premature_complete|unexpected_exit/);
});

test('review binds exact manifest bytes, anchor and every input dataset',()=>{
 const digest=b=>createHash('sha256').update(b).digest('hex');
 const manifestBytes=Buffer.from(JSON.stringify({anchorHash:'a'.repeat(64),datasetHash:'b'.repeat(64)}));
 const bytes=Buffer.from(JSON.stringify({datasetHash:'b'.repeat(64)}));
 const proof={newAnchorHash:'a'.repeat(64),artifacts:{'manifest.json':{fileSha256:digest(manifestBytes)},'inputs.json':{fileSha256:digest(bytes)}}};
 const original={manifestBytes,proof,signoff:{anchorHash:'a'.repeat(64)},inputs:{'inputs.json':bytes}};
 assert.equal(verifyEvaluationInputs(original).datasetHash,'b'.repeat(64));
 assert.throws(()=>verifyEvaluationInputs({...original,manifestBytes:Buffer.from(manifestBytes+' ')}),/manifest_mismatch/);
 assert.throws(()=>verifyEvaluationInputs({...original,proof:{...proof,newAnchorHash:'c'.repeat(64)}}),/manifest_mismatch/);
 const foreign=Buffer.from(JSON.stringify({datasetHash:'c'.repeat(64)}));
 assert.throws(()=>verifyEvaluationInputs({...original,proof:{...proof,artifacts:{...proof.artifacts,'inputs.json':{fileSha256:digest(foreign)}}},inputs:{'inputs.json':foreign}}),/unreviewed_input/);
});

test('longer full sessions require the explicit full-learning profile',()=>{
 assert.throws(()=>sessionArguments({...config,maxSeconds:14400}),/bounds_invalid/);
 assert.ok(sessionArguments({...config,maxSeconds:14400,runProfile:'V7_FULL_LEARNING_V1'}).at(-1).includes('--run-profile full-learning'));
});

test('final TEST requires a frozen adapter identity and complete semantic DEV review bytes',()=>{
 const digest=b=>createHash('sha256').update(b).digest('hex');
 const report={datasetHash:'a'.repeat(64),semanticReviewed:true,coverage:{phases:146,controls:8,rollouts:18},selectedAdapterHash:'b'.repeat(64),baselineAdapterHash:'c'.repeat(64)};
 const bytes=Buffer.from(JSON.stringify(report));
 const selection={datasetHash:report.datasetHash,adapterHash:report.selectedAdapterHash,developmentReportHash:contentHash(report),developmentReportFileSha256:digest(bytes),frozenAt:'2026-11-10T22:00:00Z'};
 const args={selection,datasetHash:report.datasetHash,adapterHash:report.selectedAdapterHash,developmentReportBytes:bytes};
 assert.equal(verifyFrozenTestSelection(args),selection);
 assert.throws(()=>verifyFrozenTestSelection({...args,adapterHash:'f'.repeat(64)}),/selection_required/);
 assert.throws(()=>verifyFrozenTestSelection({...args,developmentReportBytes:Buffer.from(bytes+' ')}),/selection_required/);
 const incomplete=Buffer.from(JSON.stringify({...report,coverage:{...report.coverage,rollouts:6}}));
 assert.throws(()=>verifyFrozenTestSelection({...args,selection:{...selection,developmentReportFileSha256:digest(incomplete)},developmentReportBytes:incomplete}),/selection_required/);
});
