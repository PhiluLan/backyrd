import { createClient } from "@supabase/supabase-js";
import { drainQueue, SupabaseUserIntelligenceRepository } from "../../packages/user-intelligence-runtime/src/index.mjs";

const url=process.env.SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!serviceKey) throw new Error("SUPABASE_URL_and_SUPABASE_SERVICE_ROLE_KEY_required");
class DisabledRealtimeTransport { constructor(){throw new Error("realtime_disabled_for_server_worker")} }
const repository=new SupabaseUserIntelligenceRepository(createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:DisabledRealtimeTransport}}));
const results=await drainQueue({repository,limit:Number(process.env.USER_INTELLIGENCE_WORK_LIMIT??25)});
console.log(JSON.stringify({
  processed:results.length,
  committed:results.filter((x)=>x.status.startsWith("COMMITTED")).length,
  recovered:results.filter((x)=>x.status==="COMMITTED_RECOVERED").length,
  retryable:results.filter((x)=>x.status==="RETRYABLE_FAILED").length,
  terminal:results.filter((x)=>x.status==="TERMINAL_FAILED").length,
  runs:results.map((result)=>({
    workerRunId:result.workerRunId,
    workIds:result.claim?.workIds,
    userId:result.claim?.userId,
    watermark:result.claim?.watermark,
    attempt:result.claim?.attempt,
    status:result.status,
    runtimeVersion:result.runtimeVersion,
    snapshotHash:result.snapshotHash,
    nodesChanged:result.nodesChanged,
    durationMs:result.durationMs,
    failureCode:result.failureCode,
  })),
}));
