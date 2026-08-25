import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseDecisionInputRepository } from "../src/supabase-repository.mjs";

test("trace persistence atomically sequences frozen package then evidence envelope",async()=>{
  const calls=[];
  const client={rpc:async(name,args)=>{calls.push({name,args});return{data:name==="backyrd_persist_decision_input_trace_v1"?"trace-id":null,error:null};}};
  const repository=new SupabaseDecisionInputRepository(client);
  const packageValue={
    decisionId:"11111111-1111-4111-8111-111111111111",userId:"22222222-2222-4222-8222-222222222222",packageHash:"a".repeat(64),
    contractIdentities:{semantics:"backyrd-canonical-semantics-v1"},candidateSet:{candidateSetHash:"b".repeat(64)},
    n3:{momentHash:"c".repeat(64),currentMoment:{fields:{city:{value:"basel"},daypart:{value:"morning"}}}},
    n5:{userCardHash:"d".repeat(64),projectionHash:"e".repeat(64),knowledgeMode:"LOW_OR_UNKNOWN"},
    candidates:[{spotId:"33333333-3333-4333-8333-333333333333",n4:{snapshotHash:"f".repeat(64),snapshotIdentity:null,availability:"UNKNOWN",placeType:"bar",concepts:[],suitabilityFacts:{}}}],
  };
  const result=await repository.persistTrace({package:packageValue,validation:{disposition:"VALID"}},{canonicalIntent:{socialContext:"FRIENDS",currentRequestFacts:{dayparts:{value:["EVENING"]}},conceptDirections:[{concept:"vibe.cozy",direction:1}]}});
  assert.equal(result,"trace-id");
  assert.deepEqual(calls.map((row)=>row.name),["backyrd_persist_decision_input_trace_v1","backyrd_persist_decision_evidence_envelope_v1"]);
  assert.deepEqual(calls[1].args.p_moment_signature,{audience:"friends",daypart:"evening"});
  assert.deepEqual(calls[1].args.p_ambient_context,{observedDaypart:"morning"});
});
