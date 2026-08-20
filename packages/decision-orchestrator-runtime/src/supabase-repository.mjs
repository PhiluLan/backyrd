import { SupabaseDecisionInputRepository } from "../../decision-input-runtime/src/index.mjs";
import { buildDeterministicDecision } from "./orchestrator.mjs";

const fail=(error,label)=>{if(error)throw new Error(`decision_orchestrator_repository:${label}:${error.message}`)};
export class SupabaseDecisionOrchestrator {
  constructor(client){this.client=client;this.inputRepository=new SupabaseDecisionInputRepository(client);}
  async assertDecisionOwner(decisionId,authenticatedUserId){const{data,error}=await this.client.from("decision_sessions").select("user_id").eq("id",decisionId).single();fail(error,"decision_owner");if(data.user_id!==authenticatedUserId)throw new Error("decision_orchestrator_cross_user");}
  async readSpotCards(ids){const{data,error}=await this.client.rpc("backyrd_read_decision_result_cards_v1",{p_spot_ids:ids});fail(error,"spot_cards");return(data??[]).map((row)=>({spotId:row.spot_id,name:row.name,city:row.city,category:row.category_name,headerPhotoPath:row.header_photo_path}));}
  async persistCompleteTrace(input,decision,latency){const p=input.package,i=decision.internal,r=decision.response;const{data,error}=await this.client.rpc("backyrd_persist_deterministic_decision_trace_v1",{p_decision_id:p.decisionId,p_user_id:p.userId,p_package_hash:p.packageHash,p_moment_hash:p.n3.momentHash,p_user_card_hash:p.n5.userCardHash,p_projection_hash:p.n5.projectionHash,p_candidate_set_hash:p.candidateSet.candidateSetHash,p_n4_hashes:Object.fromEntries(p.candidates.map((x)=>[x.spotId,x.n4.snapshotHash])),p_reason_set_hashes:i.reasonSetHashes,p_ranking_version:i.rankingVersion,p_ranking_hash:i.rankingHash,p_ranking_inputs:i.rankingInputs,p_final_order:i.finalOrder,p_knowledge_mode:r.knowledgeMode,p_result_source:r.resultSource,p_response_hash:r.responseHash,p_validation_disposition:decision.validation.disposition,p_latency_ms:latency});fail(error,"complete_trace");return data;}
  async run({decisionId,authenticatedUserId}){
    const started=performance.now();
    const{data:settings,error:settingsError}=await this.client.from("backyrd_decision_orchestrator_settings_v1").select("enabled").eq("singleton",true).single();fail(settingsError,"settings");if(!settings.enabled)throw new Error("decision_orchestrator_disabled");
    await this.assertDecisionOwner(decisionId,authenticatedUserId);
    const inputStarted=performance.now(),input=await this.inputRepository.buildAndPersist(decisionId),inputDone=performance.now();
    if(input.package.userId!==authenticatedUserId)throw new Error("decision_orchestrator_cross_user");
    const cardsStarted=performance.now(),cards=await this.readSpotCards(input.package.candidates.map((x)=>x.spotId)),cardsDone=performance.now();
    const decision=buildDeterministicDecision(input.package,cards,{expectedUserId:authenticatedUserId});
    const beforeTrace=performance.now();
    const persistedLatency={inputPackageMs:Number((inputDone-inputStarted).toFixed(3)),spotCardsMs:Number((cardsDone-cardsStarted).toFixed(3)),rankingReasonValidationMs:decision.performance.rankingReasonValidationMs,preTraceTotalMs:Number((beforeTrace-started).toFixed(3)),tracePersistenceExcluded:true};
    const traceId=await this.persistCompleteTrace(input,decision,persistedLatency);
    const metrics={...persistedLatency,traceMs:Number((performance.now()-beforeTrace).toFixed(3)),totalMs:Number((performance.now()-started).toFixed(3))};
    return {...decision,inputPackage:input.package,traceId,performance:{...input.performance,...metrics}};
  }
}
