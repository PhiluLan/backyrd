import {createClient} from 'npm:@supabase/supabase-js@2.112.4';
import {createAdminDiagnosticHandler,resolveAdminDiagnosticCase,DIAGNOSTIC_REFERENCE} from '../../../packages/decision-vnext-core/dist/admin-diagnostic.js';
import {createDecisionProductProductionPorts,createDecisionProductRpcEvaluationProvider,createDecisionProductRpcInteractionAuthorityProvider,createDecisionProductRpcLearningPort,type DecisionProductRpcClient,type DecisionProductProductionConfiguration} from '../../../packages/decision-vnext-core/dist/product-decision-production-adapter.js';
import {createDecisionProductLunaProvider} from '../../../packages/decision-vnext-core/dist/product-luna-provider.js';
import {buildDecisionProductExecution} from '../../../packages/decision-vnext-core/dist/product-decision.js';
import {DecisionProductEvaluationSchema} from '../../../packages/decision-vnext-core/dist/product-v1-contracts.js';
import type {LibrarianSearchResult} from '../../../packages/decision-vnext-core/dist/product-librarian-matching.js';

const required=(name:string):string=>{const value=Deno.env.get(name);if(!value)throw Error('diagnostic_configuration_missing');return value;};
function configuration():DecisionProductProductionConfiguration{
 // Shared production ports require numeric quota configuration. Their quota
 // port is never called by this Admin-only diagnostic; consumer policy is unchanged.
 return {identity:{releaseHash:required('BACKYRD_DECISION_VNEXT_RELEASE_HASH'),artifactHash:required('BACKYRD_DECISION_VNEXT_ARTIFACT_HASH'),sourceSetHash:required('BACKYRD_DECISION_VNEXT_SOURCE_SET_HASH'),controlGeneration:Number(Deno.env.get('BACKYRD_DECISION_VNEXT_CONTROL_GENERATION')??'1')},rateLimitOperation:'decision_admin_diag_v1',rateLimitSubjectKeyVersion:required('BACKYRD_DECISION_VNEXT_RATE_LIMIT_KEY_VERSION'),rateLimitSubjectKey:required('BACKYRD_DECISION_VNEXT_RATE_LIMIT_KEY'),idempotencyKeyVersion:required('BACKYRD_DECISION_VNEXT_IDEMPOTENCY_KEY_VERSION'),idempotencyKey:required('BACKYRD_DECISION_VNEXT_IDEMPOTENCY_KEY'),subjectMinuteLimit:20,subjectDayLimit:20,globalMinuteLimit:20,globalDayLimit:20,timeoutMilliseconds:30000,maxRequestBytes:1024};
}

Deno.serve(async(request:Request)=>{
 try{
  const url=required('SUPABASE_URL');
  const service=createClient(url,required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const config=configuration();
  let capturedContext:Record<string,unknown>|null=null;
  let usage:unknown=null;
  let reference:{now:string;timezone:'Europe/Zurich'}=DIAGNOSTIC_REFERENCE;
  let searchTrace:LibrarianSearchResult|null=null;
  const rpc:DecisionProductRpcClient={async rpc(name,parameters,signal){
   const result=await service.rpc(name,parameters as Record<string,unknown>).abortSignal(signal);
   if(!result.error&&name==='backyrd_decision_vnext_product_context_v6'){
    if(!result.data||typeof result.data!=='object'||Array.isArray(result.data))throw Error('diagnostic_context_invalid');
    capturedContext=result.data as Record<string,unknown>;
   }
   return {data:result.data,error:result.error?{message:'diagnostic_rpc_unavailable'}:null};
  }};
  const evaluationProvider=createDecisionProductRpcEvaluationProvider(rpc,{meaningRequired:true,onSearch:(result)=>{searchTrace=result;}});
  const ports=createDecisionProductProductionPorts({rpc,configuration:config,evaluationProvider,interactionAuthority:createDecisionProductRpcInteractionAuthorityProvider(rpc),learningPort:createDecisionProductRpcLearningPort(rpc,config.identity),authClient:{async getUser(token,signal){const r=await service.auth.getUser(token);if(signal.aborted)return {user:null,error:{message:'aborted'}};return {user:r.data.user?{id:r.data.user.id,role:r.data.user.role,is_anonymous:r.data.user.is_anonymous,banned_until:r.data.user.banned_until}:null,error:r.error?{message:'invalid_session'}:null};}},understandingProvider:createDecisionProductLunaProvider({apiKey:required('OPENAI_API_KEY'),now:()=>new Date(reference.now),fetchImpl:async(url,options)=>{
   if(url!=='https://api.openai.com/v1/responses')throw Error('diagnostic_provider_destination_invalid');
   const response=await fetch(url,options);
   const payload:unknown=await response.json();
   if(payload&&typeof payload==='object'&&!Array.isArray(payload)&&'usage'in payload)usage=payload.usage;
   return new Response(JSON.stringify(payload),{status:response.status,headers:{'content-type':'application/json'}});
  }})});
  const handler=createAdminDiagnosticHandler({authenticate:(token,signal)=>ports.auth.authenticate(token,signal),isAdmin:async(token,signal)=>{
   // Authorization is checked using the caller's verified session, never a service-role assertion.
   const caller=createClient(url,required('SUPABASE_ANON_KEY'),{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
   const result=await caller.rpc('admin_is_admin_v1').abortSignal(signal);
   return !result.error&&result.data===true;
  },checkControl:async(signal)=>{await ports.control.assertBoundary('RATE_LIMIT',signal);},diagnose:async(input,actor,signal)=>{
   const selected=resolveAdminDiagnosticCase(input);reference=selected.reference;
   const index=selected.caseIndex;
   const started=performance.now();const id=crypto.randomUUID();
   const productRequest={contractVersion:'backyrd.decision-vnext.product-request@1.0' as const,requestId:id,idempotencyKey:id,naturalLanguage:selected.query,includeEvents:true,explicit:{targetCity:'Basel',moods:[]},alternativeRequested:false,previouslyPresentedCandidateIds:[],rejectedCandidateIds:[]};
   await ports.control.assertBoundary('INTERPRETATION',signal);
   const modelStarted=performance.now();
   if(!ports.understand)throw Error('diagnostic_provider_missing');
   const meaning=await ports.understand(productRequest,actor,signal);
   const modelMs=performance.now()-modelStarted;
   console.info("admin_diagnostic_stage:model_complete");
   await ports.control.assertBoundary('EVALUATION',signal);
   const evaluationStarted=performance.now();
   const evaluated=await ports.evaluate(productRequest,actor,signal,meaning);
   const evaluationMs=performance.now()-evaluationStarted;
   console.info("admin_diagnostic_stage:evaluation_complete");
   const evaluation=DecisionProductEvaluationSchema.parse(evaluated.evaluation);
   const rankingStarted=performance.now();
   const execution=buildDecisionProductExecution({request:productRequest,actor,...evaluated});
   const rankingMs=performance.now()-rankingStarted;
   // Observe the actual search once; do not repeat expensive catalog matching.
   const context=capturedContext as Record<string,unknown>|null;
   const search=searchTrace as LibrarianSearchResult|null;
   if(!context||!Array.isArray(context.worldSnapshots)||!search)throw Error('diagnostic_context_not_captured');
   if(search.ranked.length+search.excluded.length+search.unresolved.length!==evaluation.candidates.length)throw Error('diagnostic_candidate_trace_mismatch');
   const projection=execution.response.personalization;
   await ports.control.assertBoundary('FINAL_OUTPUT',signal);
   return {contractVersion:'backyrd.admin-decision-diagnostic@1.0',caseIndex:index,query:productRequest.naturalLanguage,reference,request:productRequest,meaning,search,response:execution.response,projection,usage,timings:{modelMs,evaluationMs,rankingMs,totalDiagnosticMs:performance.now()-started},runtime:{sourceSetHash:config.identity.sourceSetHash,evaluatorVersion:evaluation.evaluatorVersion,catalogProfiles:context.worldSnapshots.length,eventOccurrences:Array.isArray(context.eventOccurrences)?context.eventOccurrences.length:0,evaluatedCandidates:evaluation.candidates.length},boundaries:{adminAuthorized:true,learningPersisted:false,decisionPersisted:false,spotDataChanged:false,searchObservedWithoutRepeat:true,authenticationExecuted:true,adminTestQuotaApplied:false}};
  }});
  return await handler(request);
 }catch{return new Response(JSON.stringify({error:'diagnostic_configuration_unavailable'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});}
});
