import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertUnseenContinuation,composeFrozenContinuationOrder} from "../src/continuation.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");

test("frozen continuation preserves deterministic order",()=>{
  assert.deepEqual(composeFrozenContinuationOrder({deterministicOrder:["A","B","C","D"]}),["A","B","C","D"]);
});

test("validated N6 can reorder only the frozen candidates",()=>{
  assert.deepEqual(composeFrozenContinuationOrder({deterministicOrder:["A","B","C","D"],n6Order:["C","A"],n6Validated:true}),["C","A","B","D"]);
  assert.throws(()=>composeFrozenContinuationOrder({deterministicOrder:["A"],n6Order:["X"],n6Validated:true}),/candidate_invalid/);
});

test("pages never intersect and short or empty final pages are valid",()=>{
  assert.equal(assertUnseenContinuation({previouslyShownSpotIds:["A","B","C"],returnedSpotIds:["D","E","F"]}),true);
  assert.equal(assertUnseenContinuation({previouslyShownSpotIds:["A","B","C","D","E","F"],returnedSpotIds:["G","H"]}),true);
  assert.equal(assertUnseenContinuation({previouslyShownSpotIds:["A","B","C","D","E","F","G","H"],returnedSpotIds:[]}),true);
  assert.throws(()=>assertUnseenContinuation({previouslyShownSpotIds:["A","B","C"],returnedSpotIds:["D","A"]}),/seen_spot/);
  assert.throws(()=>assertUnseenContinuation({previouslyShownSpotIds:[],returnedSpotIds:["A","A"]}),/duplicate_response/);
});

test("Mobile requests server continuation and never refills from seen rows",()=>{
  const source=fs.readFileSync(path.join(root,"mobile/app/(tabs)/decision.tsx"),"utf8");
  assert.match(source,/continuationDecisionId:\s*decisionId/);
  assert.match(source,/continuationRequestId:\s*continuationRequestIdRef\.current/);
  assert.match(source,/const serverDecisionId\s*=\s*data\.north_star\?\.decision_id\s*\?\?\s*data\.continuation\?\.decision_id\s*\?\?\s*null/);
  assert.match(source,/if \(!serverDecisionId\)/);
  assert.match(source,/if \(!isRemix\) setDecisionId\(serverDecisionId\)/);
  assert.doesNotMatch(source,/create_decision_session_v1/);
  assert.doesNotMatch(source,/\[\.\.\.fresh,\s*\.\.\.fallback\]/);
  assert.match(source,/disabled=\{continuationLoading\}/);
  assert.match(source,/Das waren die passendsten Vorschläge/);
});

test("DB contract owns page idempotency, exposure uniqueness and cross-user scope",()=>{
  const migration=fs.readFileSync(path.join(root,"supabase/migrations/20260824090000_create_decision_continuation_v1.sql"),"utf8");
  assert.match(migration,/unique\(decision_id,request_id\)/i);
  assert.match(migration,/primary key\(decision_id,spot_id\)/i);
  assert.match(migration,/where decision_id=p_decision_id and user_id=p_user_id for update/i);
  assert.match(migration,/limit p_page_size/i);
});
