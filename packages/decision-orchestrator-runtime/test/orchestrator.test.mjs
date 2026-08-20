import test from "node:test";
import assert from "node:assert/strict";
import { contentHash } from "../../decision-input-runtime/src/package.mjs";
import { buildDeterministicDecision,SupabaseDecisionOrchestrator,validateDeterministicDecision } from "../src/index.mjs";

const userId="10000000-0000-4000-8000-000000000001";
const decisionId="10000000-0000-4000-8000-000000000010";
const ids=["10000000-0000-4000-8000-000000000101","10000000-0000-4000-8000-000000000102","10000000-0000-4000-8000-000000000103","10000000-0000-4000-8000-000000000104"];
const n4=(spotId,concepts,availability="FULL")=>({spotId,availability,placeType:"bar",productFacts:{placeType:"bar"},concepts:Object.entries(concepts).map(([concept,[presence,confidence]])=>({concept,presence,confidence,provenance:[`n4:${spotId}:${concept}`]})),snapshotHash:contentHash({spotId,concepts,availability})});
const cards=(candidates)=>candidates.map(({spotId})=>({spotId,name:`Spot ${spotId.slice(-3)}`,city:"Basel",category:"Bar",headerPhotoPath:null}));
function fixture({mode="LOW_OR_UNKNOWN",taste=[],directions=[],candidates}={}){
  const rows=candidates??[
    {spotId:ids[0],retrievalPosition:1,eligible:true,n4:n4(ids[0],{"vibe.quiet":[.9,.9],"vibe.cozy":[.8,.8]})},
    {spotId:ids[1],retrievalPosition:2,eligible:true,n4:n4(ids[1],{"vibe.lively":[.95,.9]})},
    {spotId:ids[2],retrievalPosition:3,eligible:true,n4:n4(ids[2],{},"UNKNOWN")},
  ];
  const body={version:"backyrd-decision-input-package-v2",decisionId,userId,n3:{currentMoment:{decisionId,userId,fields:{vibe:{value:["quiet"]}},momentHash:"a".repeat(64)},momentHash:"a".repeat(64)},n5:{decisionId,userId,userCardHash:"b".repeat(64),projectionHash:"c".repeat(64),knowledgeMode:mode,taste,currentIntent:{conceptDirections:directions,requiredPlaceTypes:["bar"],preferredPlaceTypes:[]}},candidateSet:{candidateSetHash:contentHash(rows.map(x=>x.spotId)),count:rows.length},candidates:rows};
  return {...body,packageHash:contentHash(body)};
}

test("cold user gets intent/moment ranking and no personal reason",()=>{
  const p=fixture({directions:[{concept:"vibe.quiet",direction:1}]});
  const out=buildDeterministicDecision(p,cards(p.candidates),{expectedUserId:userId});
  assert.equal(out.response.knowledgeMode,"LOW_OR_UNKNOWN");
  assert.equal(out.response.spots[0].spotId,ids[0]);
  assert.ok(out.response.spots.every(x=>!x.reasonId?.startsWith("you:")));
});

test("current intent outranks conflicting historical taste",()=>{
  const taste=[{nodeKey:"global:lively",concept:"vibe.lively",polarity:"POSITIVE",affinity:.99,confidence:.99}];
  const p=fixture({mode:"SUFFICIENT",taste,directions:[{concept:"vibe.quiet",direction:1},{concept:"vibe.lively",direction:-1}]});
  const out=buildDeterministicDecision(p,cards(p.candidates),{expectedUserId:userId});
  assert.equal(out.response.spots[0].spotId,ids[0]);
  assert.equal(out.response.spots.some(x=>x.explanation.includes("lebendige")),false);
});

test("bounded positive personalization breaks only a later tie",()=>{
  const tied=[
    {spotId:ids[0],retrievalPosition:2,eligible:true,n4:n4(ids[0],{"vibe.cozy":[.9,.9]})},
    {spotId:ids[1],retrievalPosition:1,eligible:true,n4:n4(ids[1],{})},
  ];
  const p=fixture({mode:"PARTIAL",taste:[{nodeKey:"global:cozy",concept:"vibe.cozy",polarity:"POSITIVE",affinity:.8,confidence:.8}],candidates:tied});
  const out=buildDeterministicDecision(p,cards(tied),{expectedUserId:userId});
  assert.equal(out.response.spots[0].spotId,ids[0]);
  assert.equal(out.internal.authorizedReasons[ids[0]].some(x=>x.id==="you:global:cozy"),true);
});

test("partial and unknown N4 stay eligible without invented concepts",()=>{
  const p=fixture();const out=buildDeterministicDecision(p,cards(p.candidates),{expectedUserId:userId});
  assert.equal(out.response.spots.length,3);
  assert.equal(out.response.spots.find(x=>x.spotId===ids[2]).degraded.n4,"UNKNOWN");
});

test("candidate freeze and authorized reasons fail closed",()=>{
  const p=fixture({directions:[{concept:"vibe.quiet",direction:1}]});
  const out=buildDeterministicDecision(p,cards(p.candidates),{expectedUserId:userId});
  out.response.spots[0].spotId=ids[3];
  assert.throws(()=>validateDeterministicDecision({response:out.response,internal:out.internal,decisionPackage:p,expectedUserId:userId}),/candidate_invalid/);
});

test("commercial injection and cross-user execution fail closed",()=>{
  const p=fixture();
  assert.throws(()=>buildDeterministicDecision(p,cards(p.candidates),{expectedUserId:"20000000-0000-4000-8000-000000000002"}),/identity_invalid/);
  const out=buildDeterministicDecision(p,cards(p.candidates),{expectedUserId:userId});
  out.internal.ownerTier="premium";
  assert.throws(()=>validateDeterministicDecision({response:out.response,internal:out.internal,decisionPackage:p,expectedUserId:userId}),/commercial_or_truth/);
});

test("same semantic input replays identically",()=>{
  const p=fixture({directions:[{concept:"vibe.quiet",direction:1}]});
  const a=buildDeterministicDecision(p,cards(p.candidates),{expectedUserId:userId});
  const b=buildDeterministicDecision(p,cards(p.candidates),{expectedUserId:userId});
  assert.equal(a.response.responseHash,b.response.responseHash);
  assert.deepEqual(a.response,b.response);
  assert.equal(a.internal.rankingHash,b.internal.rankingHash);
});

test("zero eligible candidates returns an honest empty result",()=>{
  const p=fixture({candidates:[]});const out=buildDeterministicDecision(p,[],{expectedUserId:userId});
  assert.deepEqual(out.response.spots,[]);assert.equal(out.response.fallback.returnedCount,0);
});

test("trace persistence failure never returns an apparently complete decision",async()=>{
  const p=fixture();
  const client={from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{enabled:true},error:null})})};
  const runtime=new SupabaseDecisionOrchestrator(client);
  runtime.assertDecisionOwner=async()=>{};
  runtime.inputRepository={buildAndPersist:async()=>({package:p,performance:{},traceId:"input-trace"})};
  runtime.readSpotCards=async()=>cards(p.candidates);
  runtime.persistCompleteTrace=async()=>{throw new Error("simulated_trace_failure");};
  await assert.rejects(()=>runtime.run({decisionId,userId,authenticatedUserId:userId}),/simulated_trace_failure/);
});
