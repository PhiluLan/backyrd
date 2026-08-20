#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { SupabaseDecisionOrchestrator } from "../../packages/decision-orchestrator-runtime/src/index.mjs";

const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const decisionId=process.env.DECISION_ID,userId=process.env.AUTHENTICATED_USER_ID;
if(!url||!key||!decisionId||!userId)throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DECISION_ID and AUTHENTICATED_USER_ID are required");
if(process.env.BACKYRD_DECISION_ORCHESTRATOR_ENABLED!=="true")throw new Error("decision_orchestrator_process_flag_disabled");
class NoRealtime{constructor(){throw new Error("realtime_disabled")}}
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:NoRealtime}});
const result=await new SupabaseDecisionOrchestrator(client).run({decisionId,authenticatedUserId:userId});
process.stdout.write(`${JSON.stringify({response:result.response,traceId:result.traceId,performance:result.performance},null,2)}\n`);
