import { createClient } from "@supabase/supabase-js";
import { SupabaseDecisionInputRepository } from "../../packages/decision-input-runtime/src/index.mjs";

const url=process.env.SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY,decisionId=process.argv[2]??process.env.DECISION_ID;
if(!url||!serviceKey||!decisionId)throw new Error("SUPABASE_URL_SUPABASE_SERVICE_ROLE_KEY_DECISION_ID_required");
class DisabledRealtimeTransport{constructor(){throw new Error("realtime_disabled_for_server_runtime")}}
const client=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:DisabledRealtimeTransport}});
const started=performance.now();
const result=await new SupabaseDecisionInputRepository(client).buildAndPersist(decisionId);
console.log(JSON.stringify({decisionId,resultHash:result.package.packageHash,momentHash:result.package.n3.momentHash,projectionHash:result.package.n5.projectionHash,candidateSetHash:result.package.candidateSet.candidateSetHash,candidateCount:result.package.candidates.length,knowledgeMode:result.package.n5.knowledgeMode,traceId:result.traceId,durationMs:Number((performance.now()-started).toFixed(3)),status:"VALID",n6:"NOT_AUTHORIZED"}));
