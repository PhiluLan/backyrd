import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
import {internalRuntimeHash,previewSlug} from './build-internal-preview.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));

/** Internal developer execution using the canonical provider, evaluation and
 * ranking. The catalog is an exported reader snapshot, not a synthetic fixture.
 * There is no production write, learning port or browser-visible provider key. */
export async function runLocalDiagnostic({query,catalog,events,apiKey,fetchImpl,serverMeaning,recordedMeaning,now=new Date()}){
 if(serverMeaning&&recordedMeaning)throw Error('local_meaning_sources_conflict');
 if(!serverMeaning&&!recordedMeaning&&(typeof apiKey!=='string'||!apiKey.trim()))throw Error('local_openai_key_missing');
 if(typeof query!=='string'||!query.trim()||query.length>2000)throw Error('local_query_invalid');
 if(!Array.isArray(catalog)||!catalog.length||catalog.length>1000)throw Error('local_catalog_invalid');
 if(events!==undefined&&!Array.isArray(events))throw Error('local_events_invalid');
 const [{createDecisionProductLunaProvider},{createDecisionProductRpcEvaluationProvider},{buildDecisionProductExecution},{contentHash},{BASEL_DISCOVERY_LOCALITIES},{LIBRARIAN_MATCHING_VERSION}]=await Promise.all([
  import('../../packages/decision-vnext-core/dist/product-luna-provider.js'),
  import('../../packages/decision-vnext-core/dist/product-decision-production-adapter.js'),
  import('../../packages/decision-vnext-core/dist/product-decision.js'),
  import('../../packages/decision-vnext-core/dist/canonical.js'),
  import('../../packages/decision-vnext-core/dist/product-librarian-geography.js'),
  import('../../packages/decision-vnext-core/dist/product-librarian-language.js'),
 ]);
 const started=performance.now();const reference={now:now.toISOString(),timezone:'Europe/Zurich'};
 const id=crypto.randomUUID();
 const request={contractVersion:'backyrd.decision-vnext.product-request@1.0',requestId:id,idempotencyKey:id,naturalLanguage:query,includeEvents:events!==undefined,explicit:{targetCity:'Basel',targetCityRole:'SEARCH_CONTEXT',moods:[]},alternativeRequested:false,previouslyPresentedCandidateIds:[],rejectedCandidateIds:[]};
 const actor={userId:crypto.randomUUID(),subjectBindingHash:contentHash('LOCAL_DIAGNOSTIC_NO_REAL_USER'),authenticationContextHash:contentHash('LOCAL_DIAGNOSTIC_NOT_A_PRODUCTION_SESSION'),sessionBindingHash:contentHash(id),sessionId:crypto.randomUUID()};
 const identity={releaseHash:contentHash('LOCAL_NOT_RELEASED'),artifactHash:contentHash({local:true}),sourceSetHash:contentHash(LIBRARIAN_MATCHING_VERSION),controlGeneration:1};
 let usage=null;let modelCalls=0;let search=null;
 let meaning;let signal=AbortSignal.timeout(30000);let modelMs;
 if(recordedMeaning){
  if(recordedMeaning.contractVersion!=='backyrd.local-decision-diagnostic@1'||!['REAL_SERVER_PREVIEW_MODEL_CALL','REAL_MODEL_CALL'].includes(recordedMeaning.providerMode)||recordedMeaning.modelCalls!==1||recordedMeaning.query!==query)throw Error('local_recorded_meaning_invalid');
  const {prepareLibrarianRequest,LUNA_LIBRARIAN_CONTRACT_VERSION}=await import('../../packages/decision-vnext-core/dist/product-luna-librarian.js');
  const {requestHash:originalHash,...originalBody}=recordedMeaning.meaning;
  if(contentHash(originalBody)!==originalHash||originalBody.source.sourceText!==query||contentHash(originalBody.source.reference)!==contentHash(recordedMeaning.reference))throw Error('local_recorded_meaning_mismatch');
  meaning=prepareLibrarianRequest({contractVersion:LUNA_LIBRARIAN_CONTRACT_VERSION,sourceText:query,reference:recordedMeaning.reference,output:recordedMeaning.meaning.raw});
  if(contentHash(meaning.raw)!==contentHash(recordedMeaning.meaning.raw))throw Error('local_recorded_meaning_mismatch');
  reference.now=recordedMeaning.reference.now;modelMs=0;
 }else if(serverMeaning){
  const {prepareLibrarianRequest,LUNA_LIBRARIAN_CONTRACT_VERSION}=await import('../../packages/decision-vnext-core/dist/product-luna-librarian.js');
  if(serverMeaning.contractVersion!=='backyrd.internal-meaning-preview@1'||serverMeaning.query!==query||serverMeaning.codeIdentity?.coreBundleHash!==await internalRuntimeHash())throw Error('local_server_preview_code_mismatch');
  meaning=prepareLibrarianRequest({contractVersion:LUNA_LIBRARIAN_CONTRACT_VERSION,sourceText:query,reference:serverMeaning.reference,output:serverMeaning.meaning.raw});
  if(meaning.requestHash!==serverMeaning.meaning.requestHash)throw Error('local_server_preview_meaning_mismatch');
  reference.now=serverMeaning.reference.now;usage=serverMeaning.usage;modelCalls=1;modelMs=serverMeaning.modelMs;
 }else{
  const understand=createDecisionProductLunaProvider({apiKey,now:()=>now,fetchImpl:async(url,options)=>{
   if(url!=='https://api.openai.com/v1/responses')throw Error('local_provider_destination_invalid');
   modelCalls++;if(modelCalls!==1)throw Error('local_model_call_limit');
   const response=await (fetchImpl??fetch)(url,options);
   if(response.ok){const payload=await response.clone().json();usage=payload.usage??null;}
   return response;
  }});
  meaning=await understand(request,actor,signal);modelMs=performance.now()-started;
 }
 // Read-only context adapter. It never executes this RPC against production.
 // Random local identity is not a real user's session or taste profile.
 const evaluator=createDecisionProductRpcEvaluationProvider({async rpc(name){
  if(name!=='backyrd_decision_vnext_product_context_v7')throw Error('local_unexpected_port_operation');
  return {error:null,data:{contractVersion:'backyrd.decision-vnext.product-runtime-context@1.0',status:'NO_CONSENT',consent:null,snapshot:null,authorizedCity:'Basel',authorizedLocalities:BASEL_DISCOVERY_LOCALITIES,serverTime:reference.now,worldSnapshots:catalog,...(events!==undefined?{eventOccurrences:events}:{})}};
 }},{meaningRequired:true,onSearch:value=>{search=value;}});
 const evaluationStarted=performance.now();
 const evaluated=await evaluator.evaluate({request,actor,identity,signal,meaning});
 const evaluationMs=performance.now()-evaluationStarted;
 const rankingStarted=performance.now();
 const execution=buildDecisionProductExecution({request,actor,...evaluated});
 const rankingMs=performance.now()-rankingStarted;
 if(!search)throw Error('local_search_trace_missing');
 return {contractVersion:'backyrd.local-decision-diagnostic@1',query,reference,providerMode:recordedMeaning?'RECORDED_MEANING_REPLAY':serverMeaning?'REAL_SERVER_PREVIEW_MODEL_CALL':fetchImpl?'INJECTED_PROVIDER_TEST':'REAL_MODEL_CALL',modelCalls,...(recordedMeaning?{replaySource:{requestHash:recordedMeaning.meaning.requestHash,rawMeaningHash:contentHash(recordedMeaning.meaning.raw),promptRevision:recordedMeaning.meaning.configuration.promptRevision,matchingVersion:recordedMeaning.runtime.matchingVersion,catalogHash:recordedMeaning.boundaries.catalogHash}}:{}),meaning,search,response:execution.response,usage,timings:{modelMs,evaluationMs,rankingMs,totalMs:modelMs+evaluationMs+rankingMs},runtime:{matchingVersion:LIBRARIAN_MATCHING_VERSION,source:'LOCAL_CURRENT_BUILD',profiles:catalog.length,events:events?.length??0},boundaries:{productionExecution:false,productionDataChanged:false,decisionPersisted:false,learningPersisted:false,personalization:'NEUTRAL_LOCAL_TEST_IDENTITY',catalogScope:events===undefined?'SPOTS_ONLY':'SPOTS_AND_EVENTS',catalogHash:contentHash(catalog)}};
}

async function main(){
 const args=process.argv.slice(2);const options={};
 for(let i=0;i<args.length;i+=2){if(!['--query','--catalog','--events','--output','--server-env','--recorded'].includes(args[i])||!args[i+1])throw Error('local_arguments_invalid');options[args[i]]=args[i+1];}
 if(options['--recorded']&&options['--server-env'])throw Error('local_meaning_sources_conflict');
 if(!options['--server-env']&&!options['--recorded']&&!process.env.OPENAI_API_KEY)throw Error('local_openai_key_missing');
 if(!options['--output'])throw Error('local_output_required');
 const catalog=JSON.parse(await readFile(resolve(options['--catalog']??''),'utf8'));
 const events=options['--events']?JSON.parse(await readFile(resolve(options['--events']),'utf8')):undefined;
 // Build before loading the canonical modules: never silently test old dist.
 execFileSync('npm',['run','decision-vnext:build'],{cwd:root,stdio:'pipe'});
 let serverMeaning;
 if(options['--server-env']){
  const env=parseEnv(await readFile(resolve(options['--server-env']),'utf8'));
  const url=env.NEXT_PUBLIC_SUPABASE_URL;const key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(url!=='https://hjgcrrzfjchzqoegcywn.supabase.co'||!key)throw Error('local_server_configuration_invalid');
  const response=await fetch(url+'/functions/v1/'+previewSlug,{method:'POST',headers:{authorization:'Bearer '+key,apikey:key,'content-type':'application/json','x-region':'eu-central-2'},body:JSON.stringify({query:options['--query']}),signal:AbortSignal.timeout(35000)});
  if(!response.ok)throw Error('local_server_preview_unavailable');
  serverMeaning=await response.json();
 }
 const recordedMeaning=options['--recorded']?JSON.parse(await readFile(resolve(options['--recorded']),'utf8')):undefined;
 const report=await runLocalDiagnostic({query:options['--query'],catalog,events,apiKey:process.env.OPENAI_API_KEY,serverMeaning,recordedMeaning});
 report.runtime.codeHeadSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 report.runtime.workingTreeDirty=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim().length>0;
 await writeFile(resolve(options['--output']),JSON.stringify(report,null,2));
 console.log(JSON.stringify({query:report.query,providerMode:report.providerMode,promptRevision:report.meaning.configuration.promptRevision,matchingVersion:report.runtime.matchingVersion,timings:report.timings,confirmed:report.response.candidates.filter(c=>c.rank!==null).map(c=>({rank:c.rank,name:c.presentation.name})),productionChanged:false},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(error=>{const code=error instanceof Error&&/^(?:local_|product_luna_)[a-z_]+$/.test(error.message)?error.message:'local_diagnostic_failed';console.error(code);process.exitCode=1;});
}
