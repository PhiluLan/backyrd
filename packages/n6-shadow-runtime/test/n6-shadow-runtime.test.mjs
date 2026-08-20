import test from "node:test";
import assert from "node:assert/strict";
import { buildDecisionInputPackage } from "../../decision-input-runtime/src/index.mjs";
import { buildDeterministicDecision } from "../../decision-orchestrator-runtime/src/index.mjs";
import { buildProductionN6ShadowInput, buildProviderRequest, callN6ProviderWithRetry, N6ProviderError, N6ShadowService, runDeterministicWithN6Shadow, validateProductionN6Output } from "../src/index.mjs";

const userId = "22222222-2222-4222-8222-222222222222";
const decisionId = "11111111-1111-4111-8111-111111111111";
const spotIds = ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];
const node = (concept, scope, affinity = .8, confidence = .84) => ({ nodeKey:`${scope.kind}:${scope.key}:${concept}`, concept, scope, affinity, polarity:"POSITIVE", knowledgeState:"POSITIVE", confidence, evidenceDepth:{independentSessions:6,independentSpots:5,outcomes:5}, evidenceComposition:{comparative:4,directReview:1}, evidenceRefs:[], contradictions:[], trend:{direction:"STABLE"} });
const card = { version:"backyrd-n5-6-user-card-v1", userId, userCardHash:"b".repeat(64), maturity:{state:"KNOWN"}, occasionPatterns:[], memorySummary:{eventCount:30}, nodes:[node("vibe.cozy",{kind:"GLOBAL",key:"global"}),node("vibe.quiet",{kind:"CONTEXT",key:"audience.friends"})] };

function source({ cold = false, query = "ruhige gemütliche Bar mit Freunden", audience = ["friends"], selectedMoods = ["ruhig","gemütlich"] } = {}) {
  const candidates = spotIds.map((spotId,index)=>({spotId,retrievalPosition:index+1,status:"approved",city:"Basel",category:"Bar",productPlaceType:"bar",openNow:true,distributionEligible:true}));
  return {
    decision:{id:decisionId,userId,city:"Basel",moodA:null,moodB:null,createdAt:"2026-08-21T18:30:00.000Z"},
    requestContext:{query,rawFreeText:query,preferredPlaceTypes:["bar"],audience,selectedMoods,strictCategoryIntent:true,model_version:"decision-v13.0"},
    userCard:cold?null:card,memoryConsentState:"granted",candidates,
    n4BySpot:{
      [spotIds[0]]:{available:true,placeType:"bar",snapshotIdentity:"n4-a",freshness:"2026-08-20T00:00:00Z",concepts:{"vibe.quiet":{presence:.95,confidence:.9,provenance:"n4-a-q"},"vibe.cozy":{presence:.9,confidence:.88,provenance:"n4-a-c"}}},
      [spotIds[1]]:{available:true,placeType:"bar",snapshotIdentity:"n4-b",freshness:"2026-08-20T00:00:00Z",concepts:{"vibe.lively":{presence:.95,confidence:.9,provenance:"n4-b-l"}}}
    }
  };
}

const cards = (pkg) => pkg.candidates.map((row)=>({spotId:row.spotId,name:`Spot ${row.spotId.slice(-3)}`,city:"Basel",category:"Bar",headerPhotoPath:null}));
function fixture(options) {
  const pkg = buildDecisionInputPackage(source(options)).package;
  const deterministic = buildDeterministicDecision(pkg,cards(pkg),{expectedUserId:userId});
  return { pkg, deterministic, input:buildProductionN6ShadowInput({decisionPackage:pkg,deterministicDecision:deterministic}) };
}

function validPayload(input) {
  const base = input.n6a2Input.n6a1Input.baseInput;
  const bySpot = new Map(input.n6a2Input.authorizedReasons.candidates.map((row)=>[row.spot_id,row]));
  const order = [...base.candidates].sort((a,b)=>{
    const left=input.rankingInputs[a.spotId],right=input.rankingInputs[b.spotId];
    return right.intentTier-left.intentTier||right.intentStrength-left.intentStrength||a.spotId.localeCompare(b.spotId);
  });
  return {
    ranked_candidates:order.map((candidate,index)=>{const allowed=bySpot.get(candidate.spotId);return {spot_id:candidate.spotId,rank:index+1,buddy_fit:.75,confidence:.7,why_for_you:allowed.why_for_you.slice(0,1),why_now:allowed.why_now.slice(0,1),uncertainty:allowed.uncertainty.slice(0,1)};}),
    decision_confidence:.72,user_knowledge_sufficiency:base.relevantUserProjection.sufficiency.level,moment_understanding_sufficiency:base.currentMoment.confidenceLevel
  };
}

test("production input is bounded, frozen-N6A2 shaped, and Sprint-4-authorized",()=>{
  const { input }=fixture();
  assert.equal(input.boundaries.rawHistoryIncluded,false);
  assert.equal(input.n6a2Input.version,"backyrd-n6a2-ai-decision-input-v1");
  assert.ok(Object.keys(input.s4ReasonMap).length>0);
  assert.equal(JSON.stringify(input).includes("payment"),false);
  assert.ok(buildProviderRequest(input).estimatedInputTokens<12_000);
});

test("strict validator accepts exact candidates and exact candidate reasons",()=>{
  const { input }=fixture();const payload=validPayload(input);const result=validateProductionN6Output(payload,input);
  assert.equal(result.valid,true);assert.equal(result.ranked.length,3);assert.ok(result.selectedReasons.length>0);
});

test("all invalid output fixtures fail closed",()=>{
  const { input }=fixture();const baseline=validPayload(input);
  const cases=[];
  const mutate=(fn)=>{const value=structuredClone(baseline);fn(value);cases.push(value);};
  mutate(v=>v.ranked_candidates[0].spot_id="99999999-9999-4999-8999-999999999999");
  mutate(v=>v.ranked_candidates.pop());
  mutate(v=>v.ranked_candidates[1].spot_id=v.ranked_candidates[0].spot_id);
  mutate(v=>v.ranked_candidates[0].why_now=[{code:"CURRENT_INTENT_MATCH",evidence_refs:["fake"]}]);
  mutate(v=>{const a=v.ranked_candidates[0].why_now,b=v.ranked_candidates[1].why_now;v.ranked_candidates[0].why_now=b;v.ranked_candidates[1].why_now=a;});
  mutate(v=>v.ranked_candidates[0].why_for_you=[{code:"RELEVANT_TASTE_MATCH",evidence_refs:["fake:user","fake:spot"]}]);
  mutate(v=>v.ownerPayment="premium");
  mutate(v=>v.ranked_candidates[0].encrypted_content="opaque");
  mutate(v=>v.ranked_candidates[0].rank=3);
  mutate(v=>v.decision_confidence=2);
  mutate(v=>v.user_knowledge_sufficiency="HIGH"===baseline.user_knowledge_sufficiency?"LOW":"HIGH");
  mutate(v=>v.ranked_candidates=[...v.ranked_candidates].reverse().map((row,index)=>({...row,rank:index+1})));
  mutate(v=>v.unexpected="field");
  for(const value of cases)assert.equal(validateProductionN6Output(value,input).valid,false);
});

test("LOW mode prohibits personal reasons even if provider emits one",()=>{
  const { input }=fixture({cold:true});const payload=validPayload(input);
  payload.ranked_candidates[0].why_for_you=[{code:"RELEVANT_TASTE_MATCH",evidence_refs:["user:GLOBAL:vibe.cozy",`spot:${payload.ranked_candidates[0].spot_id}:vibe.cozy`]}];
  assert.equal(validateProductionN6Output(payload,input).valid,false);
});

test("current intent hierarchy cannot be reversed by N6",()=>{
  const { input }=fixture();const payload=validPayload(input);
  payload.ranked_candidates.reverse().forEach((row,index)=>{row.rank=index+1;});
  assert.equal(validateProductionN6Output(payload,input).reason,"CURRENT_INTENT_AUTHORITY_VIOLATION");
});

test("provider response is canonicalized, validated, costed and technically retried once",async()=>{
  const { input }=fixture();const payload=validPayload(input);let calls=0;
  const fetchImpl=async()=>{calls+=1;if(calls===1)return{ok:false,status:500};return{ok:true,status:200,json:async()=>({id:"resp_1",object:"response",model:"gpt-5.6-sol",status:"completed",output:[{type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text:JSON.stringify(payload),encrypted_content:"drop"}]}],usage:{input_tokens:1000,output_tokens:300,total_tokens:1300},opaque:"drop"})};};
  const result=await callN6ProviderWithRetry(input,{apiKey:"test-key",fetchImpl});
  assert.equal(calls,2);assert.equal(result.retryCount,1);assert.equal(result.validation.valid,true);
  assert.equal("opaque" in result.canonicalProviderResponse,false);assert.equal(JSON.stringify(result.canonicalProviderResponse).includes("encrypted_content"),false);
});

test("shadow service never changes visible deterministic decision or creates learning",async()=>{
  const { pkg,deterministic,input }=fixture();const payload=validPayload(input);let finalized;
  const repository={enqueue:async()=>({status:"PENDING"}),claim:async()=>({workId:"w",shadowRunId:"s",decisionId,userId}),loadInput:async()=>input,finalize:async(_work,trace)=>{finalized=trace;return{status:"VALIDATED",trace};},fail:async()=>assert.fail("unexpected failure")};
  const fetchImpl=async()=>({ok:true,status:200,json:async()=>({id:"resp_2",object:"response",model:"gpt-5.6-sol",status:"completed",output:[{type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text:JSON.stringify(payload)}]}],usage:{input_tokens:900,output_tokens:250,total_tokens:1150}})});
  const service=new N6ShadowService({repository,apiKey:"test-key",fetchImpl});
  const visibleBefore=structuredClone(deterministic.response);
  await service.enqueueSecuredDecision({decisionPackage:pkg,deterministicDecision:deterministic,authenticatedUserId:userId});
  const result=await service.runNext();
  assert.equal(result.status,"VALIDATED");assert.deepEqual(deterministic.response,visibleBefore);
  assert.deepEqual(finalized.boundaries,{visibleDecisionChanged:false,n2LearningCreated:false});
});

test("cross-user enqueue fails before repository or provider access",async()=>{
  const { pkg,deterministic }=fixture();const service=new N6ShadowService({repository:{enqueue:async()=>assert.fail("must not enqueue")}});
  await assert.rejects(()=>service.enqueueSecuredDecision({decisionPackage:pkg,deterministicDecision:deterministic,authenticatedUserId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}),/cross_user/);
});

test("deterministic response is secured before shadow work and does not await it",async()=>{
  const { pkg,deterministic }=fixture();let release;const pending=new Promise((resolve)=>{release=resolve;});let scheduled;
  const orchestrator={run:async()=>({...deterministic,inputPackage:pkg})};
  const shadowService={enqueueSecuredDecision:async()=>pending};
  const result=await runDeterministicWithN6Shadow({orchestrator,shadowService,request:{authenticatedUserId:userId},scheduleBackground:(task)=>{scheduled=task;}});
  assert.equal(result.response.resultSource,"DETERMINISTIC_NORTH_STAR");assert.ok(scheduled instanceof Promise);
  release({status:"PENDING"});await scheduled;
});

test("consent or deletion race aborts without provider call or resurrection",async()=>{
  let providerCalls=0;
  const repository={claim:async()=>({workId:"w",shadowRunId:"s",decisionId,userId}),loadInput:async()=>{throw new Error("n6_shadow_personalization_consent_required");},fail:async()=>{throw new Error("n6_shadow_claim_invalid");}};
  const service=new N6ShadowService({repository,apiKey:"test",fetchImpl:async()=>{providerCalls+=1;}});
  const result=await service.runNext();assert.equal(result.status,"SHADOW_ABORTED_LIFECYCLE_CHANGED");assert.equal(providerCalls,0);
});

test("production service performs no hidden in-process retry",async()=>{
  const { input }=fixture();let calls=0,failures=0;
  const repository={claim:async()=>({workId:"w",shadowRunId:"s",decisionId,userId}),loadInput:async()=>input,fail:async()=>{failures+=1;return{status:"RETRYABLE_FAILED"};}};
  const service=new N6ShadowService({repository,apiKey:"test",fetchImpl:async()=>{calls+=1;return{ok:false,status:500};}});
  const result=await service.runNext();assert.equal(result.status,"RETRYABLE_FAILED");assert.equal(calls,1);assert.equal(failures,1);
});

test("provider timeout is bounded and retryable only by the queue",async()=>{
  const { input }=fixture();let calls=0;
  const fetchImpl=async(_url,{signal})=>new Promise((_resolve,reject)=>{calls+=1;signal.addEventListener("abort",()=>reject(Object.assign(new Error("aborted"),{name:"AbortError"})));});
  await assert.rejects(()=>callN6ProviderWithRetry(input,{apiKey:"test",fetchImpl,timeoutMs:5,maxRetries:0}),(error)=>error instanceof N6ProviderError&&error.code==="N6_PROVIDER_TIMEOUT"&&error.retryable);
  assert.equal(calls,1);
});

test("provider HTTP diagnostics are secret-safe and preserve actionable contract metadata",async()=>{
  const { input }=fixture();
  const fetchImpl=async()=>({ok:false,status:400,headers:{get:(name)=>name==="x-request-id"?"req_fixture":null},json:async()=>({error:{message:"must not persist this raw provider message",type:"invalid_request_error",code:"invalid_json_schema",param:"text.format.schema"},opaque:"drop"})});
  await assert.rejects(()=>callN6ProviderWithRetry(input,{apiKey:"test",fetchImpl,maxRetries:0}),(error)=>{
    assert.equal(error.code,"N6_PROVIDER_HTTP_400");
    assert.deepEqual(error.diagnostic,{httpStatus:400,requestId:"req_fixture",responseObject:null,responseStatus:null,errorType:"invalid_request_error",errorCode:"invalid_json_schema",errorParam:"text.format.schema"});
    assert.equal(JSON.stringify(error.diagnostic).includes("raw provider message"),false);
    return true;
  });
});

test("non-completed Responses API dispositions never reach the semantic validator",async()=>{
  const { input }=fixture();
  const fetchImpl=async()=>({ok:true,status:200,headers:{get:()=>"req_incomplete"},json:async()=>({id:"resp_incomplete",object:"response",model:"gpt-5.6-sol",status:"incomplete",output:[],usage:{input_tokens:100,output_tokens:0,total_tokens:100}})});
  await assert.rejects(()=>callN6ProviderWithRetry(input,{apiKey:"test",fetchImpl,maxRetries:0}),(error)=>error.code==="N6_PROVIDER_RESPONSE_NOT_COMPLETED"&&error.diagnostic.responseStatus==="incomplete");
});

test("validator rejection is persisted whole and never retried",async()=>{
  const { input }=fixture();const invalid=validPayload(input);invalid.ranked_candidates.pop();let calls=0,trace;
  const repository={claim:async()=>({workId:"w",shadowRunId:"s",decisionId,userId,attempt:1}),loadInput:async()=>input,finalize:async(_work,value)=>{trace=value;return{status:"REJECTED",trace:value};},fail:async()=>assert.fail("semantic rejection must not retry")};
  const fetchImpl=async()=>{calls+=1;return{ok:true,status:200,json:async()=>({id:"resp_reject",object:"response",model:"gpt-5.6-sol",status:"completed",output:[{type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text:JSON.stringify(invalid)}]}],usage:{input_tokens:100,output_tokens:50,total_tokens:150}})};};
  const result=await new N6ShadowService({repository,apiKey:"test",fetchImpl}).runNext();assert.equal(result.status,"REJECTED");assert.equal(calls,1);assert.equal(trace.validatorDisposition,"REJECTED");
});
