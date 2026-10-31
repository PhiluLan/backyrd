import { BASEL_DISCOVERY_LOCALITIES } from "../dist/product-librarian-geography.js";
import assert from "node:assert/strict";
import { createDecisionProductHttpHandler } from "../dist/product-decision.js";
import { createDecisionProductLunaProvider } from "../dist/product-luna-provider.js";
import { createDecisionProductRpcEvaluationProvider } from "../dist/product-decision-production-adapter.js";
import { contentHash } from "../dist/canonical.js";
import { reference, authority } from "./librarian-matching-fixtures.mjs";
const baseActor = {userId:'11111111-1111-4111-a111-111111111111',subjectBindingHash:contentHash('subject'),authenticationContextHash:contentHash('auth'),sessionBindingHash:contentHash('session'),sessionId:'22222222-2222-4222-a222-222222222222'};
const identity = {releaseHash:contentHash('release'),artifactHash:contentHash('artifact'),sourceSetHash:contentHash('source'),controlGeneration:1};
export async function exercise({text,meaning,catalog,explicit={targetCity:'Basel',targetCityRole:'SEARCH_CONTEXT'},fetchImpl,auth=true,understandOverride,requestOverride,prefetch=false,eventOccurrences=[],userId=baseActor.userId,onSearch}) {
  const actor={...baseActor,userId};
  let calls=0,reads=0,stored,diagnostics=[];
  const provider=createDecisionProductLunaProvider({apiKey:'synthetic-key',now:()=>new Date(reference.now),fetchImpl:fetchImpl??(async(_url,options)=>{
    calls++; const body=JSON.parse(options.body); assert.equal(body.store,false);
    assert.equal(JSON.parse(body.input).request,text);
    return new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(meaning.raw)}]}]}));
  })});
  const rpc={async rpc(name,parameters){reads++;assert.equal(name,request.explicit.targetCityRole==='SEARCH_CONTEXT' ? 'backyrd_decision_vnext_product_context_v7' : request.includeEvents===true ? 'backyrd_decision_vnext_product_context_v6' : 'backyrd_decision_vnext_product_context_v5');assert.equal(parameters.p_auth_user_id,actor.userId);assert.equal(JSON.stringify(parameters).includes(text),false);
    return {error:null,data:{contractVersion:'backyrd.decision-vnext.product-runtime-context@1.0',status:'NO_CONSENT',consent:null,snapshot:null,authorizedCity:'Basel',authorizedLocalities:BASEL_DISCOVERY_LOCALITIES,serverTime:authority.now,worldSnapshots:catalog,...(request.includeEvents === true ? {eventOccurrences} : {})}};
  }};
  const evaluation=createDecisionProductRpcEvaluationProvider(rpc,{meaningRequired:true,...(onSearch?{onSearch}:{})});
  const handler=createDecisionProductHttpHandler({
    auth:{async authenticate(){return auth?actor:null;}},rateLimit:{async consume(){return true;}},control:{timeoutMilliseconds:2000,maxRequestBytes:16384,async assertBoundary(){}},
    understand:understandOverride??(prefetch ? async(request,actor,signal)=>{
      const [meaning]=await Promise.all([provider(request,actor,signal),evaluation.prefetch({request,actor,identity,signal})]);return meaning;
    }:provider),
    evaluate(request,actor,signal,meaning){return evaluation.evaluate({request,actor,signal,meaning,identity});},
    idempotency:{async commit(input){stored=input.execution;return {status:'CREATED'};}},
    interaction:{async resolve(){throw Error('unexpected interaction');}},
    learning:{contractVersion:'backyrd.user-intelligence.product-decision-learning-port@1.0',async record(){throw Error('no consent: must not learn');}},
    diagnostics:{reportFailure(stage,code){diagnostics.push({stage,code});}},
  });
  const request=requestOverride??{contractVersion:'backyrd.decision-vnext.product-request@1.0',requestId:'case-request',idempotencyKey:'case-idempotency',naturalLanguage:text,explicit,alternativeRequested:false,previouslyPresentedCandidateIds:[],rejectedCandidateIds:[]};
  const response=await handler(new Request('https://example.test/functions/v1/decision-v13',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify(request)}));
  return {status:response.status,body:await response.json(),calls,reads,stored,diagnostics,request};
}

