// Replays actual local outputs through canonical Product ports with a synthetic World.
// No production API, data, writes, repair inference or replacement gold outputs.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {createDecisionProductNuknukProvider} from '../../packages/decision-vnext-core/dist/product-nuknuk-provider.js';
import {exercise} from '../../packages/decision-vnext-core/test/librarian-active-route-fixtures.mjs';
import {germanTestWorld} from './nuknuk-german-test-world.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const out=resolve(process.argv[2]??'.');
const manifest=JSON.parse(await readFile(resolve(out,'manifest.json')));
const casesBytes=await readFile(resolve(out,'cases.json')),requestsBytes=await readFile(resolve(out,'requests.json'));
if(sha(casesBytes)!==manifest.files?.['cases.json'])throw Error('cases_changed');
if(sha(requestsBytes)!==manifest.files?.['requests.json'])throw Error('requests_changed');
const rows=JSON.parse(casesBytes),requests=JSON.parse(requestsBytes),world=germanTestWorld();
const worldBytes=JSON.stringify(world,null,2)+'\n';
await mkdir(resolve(out,'chain'),{mode:0o700});
await writeFile(resolve(out,'chain/world.json'),worldBytes,{flag:'wx',mode:0o600});
await writeFile(resolve(out,'chain/freeze.json'),JSON.stringify({scope:'CANONICAL_PRODUCT_WITH_SYNTHETIC_PORTS_NOT_DEPLOYED_API',worldSha256:sha(worldBytes),caseFileSha256:sha(casesBytes),requestFileSha256:sha(requestsBytes),codeHashes:Object.fromEntries(await Promise.all(['nuknuk-german-chain.mjs','nuknuk-german-test-world.mjs'].map(async n=>[n,sha(await readFile(new URL(n,import.meta.url)))]))),productionReads:0,productionWrites:0},null,2)+'\n',{flag:'wx',mode:0o600});
const results=[];
for(const row of rows){
 const actual=JSON.parse(await readFile(resolve(out,manifest.scope==='ISOLATED_TRAINING_CANDIDATE_ONLY'?'candidate':'baseline',row.id+'.json'))),frozen=requests.find(r=>r.id===row.id);
 if(actual.adapterSha256!==manifest.adapterSha256||actual.query!==row.query)throw Error('output_not_bound');
 if(!actual.raw){results.push({id:row.id,status:'NOT_EXECUTED_NO_MODEL_OUTPUT'});continue;}
 let capturedSearch=null,replays=0,learning=0,commits=0;
 const provider=createDecisionProductNuknukProvider({endpoint:'https://local-replay.invalid/v1/chat/completions',apiKey:'SYNTHETIC_NOT_A_CREDENTIAL',model:'LOCAL_DIAGNOSTIC_REPLAY',now:()=>new Date(row.reference.now),routeDialogue:false,clarifyDialogue:false,repairCompactMeaning:false,fastSimpleSearch:false,includePurposeInstructions:true,
  fetchImpl:async(_url,options)=>{replays++;const b=JSON.parse(options.body);if(contentHash(b.messages)!==contentHash(frozen.messages)||contentHash(b.response_format.json_schema.schema)!==contentHash(frozen.outputSchema))throw Error('replay_prompt_changed');return new Response(JSON.stringify({model:'LOCAL_DIAGNOSTIC_REPLAY',choices:[{finish_reason:'stop',message:{content:JSON.stringify(actual.raw)}}]}));}});
 const response=await exercise({text:row.query,catalog:world.map(r=>r.binding),understandOverride:provider,runtimeReference:row.reference,runtimeAuthority:{city:'Basel',now:row.reference.now},onSearch:s=>{capturedSearch=s;},onLearning:()=>learning++,onCommit:()=>commits++});
 if(learning!==0)throw Error('no_consent_learning_write');
 const result={id:row.id,query:row.query,rawOutputSha256:sha(JSON.stringify(actual.raw)),status:response.status,body:response.body,diagnostics:response.diagnostics,search:capturedSearch,replayedModelResponses:replays,worldPortReads:response.reads,inMemoryCommits:commits,learningWrites:learning,productionWrites:0};
 await writeFile(resolve(out,'chain',row.id+'.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 const names=Object.fromEntries(world.map(r=>[r.binding.decisionProjection.spotId,r.name]));results.push({id:row.id,httpStatus:response.status,diagnostics:response.diagnostics,primary:names[response.body.primaryCandidateId]??null,clarification:response.body.clarification??null,ranked:capturedSearch?.ranked.map(r=>names[r.spotId])??[],unresolved:capturedSearch?.unresolved.length??0});
 console.log(JSON.stringify(results.at(-1)));
}
await writeFile(resolve(out,'chain/summary.json'),JSON.stringify({scope:'CONTROLLED_WORLD_NOT_LIVE_INVENTORY',results},null,2)+'\n',{flag:'wx',mode:0o600});
