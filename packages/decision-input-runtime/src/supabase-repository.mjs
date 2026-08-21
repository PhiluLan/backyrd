import { buildDecisionInputPackage } from "./package.mjs";
import { categoryToPlaceType } from "../../canonical-semantics/src/index.mjs";

const fail=(error,label)=>{if(error)throw new Error(`decision_input_repository:${label}:${error.message}`)};

export class SupabaseDecisionInputRepository {
  constructor(client){this.client=client;}

  async load(decisionId){
    const started=performance.now();
    const{data:settings,error:settingsError}=await this.client.from("backyrd_decision_input_runtime_settings_v1").select("enabled").eq("singleton",true).single();fail(settingsError,"settings");
    if(!settings.enabled)throw new Error("decision_input_runtime_disabled");
    const{data:decision,error:decisionError}=await this.client.from("decision_sessions").select("id,user_id,city,mood_a_text,mood_b_text,created_at").eq("id",decisionId).single();fail(decisionError,"decision");
    const{data:handoff,error:handoffError}=await this.client.from("backyrd_internal_decision_handoffs_v1").select("request_context").eq("decision_id",decisionId).eq("user_id",decision.user_id).maybeSingle();
    if(handoffError&&!/does not exist|schema cache/i.test(handoffError.message))fail(handoffError,"request_handoff");
    const{data:events,error:eventError}=handoff?.request_context?{data:[],error:null}:await this.client.from("backyrd_ml_events_v1").select("rank,context,created_at").eq("decision_id",decisionId).eq("user_id",decision.user_id).eq("event_type","decision_impression").order("rank").order("created_at").limit(1);fail(eventError,"request_context");
    const{data:impressions,error:impressionError}=await this.client.from("decision_impressions").select("spot_id,rank").eq("decision_id",decisionId).order("rank");fail(impressionError,"impressions");
    const retrievalDone=performance.now();
    const ids=[...new Set((impressions??[]).map((row)=>row.spot_id))];
    const{data:facts,error:factsError}=await this.client.rpc("backyrd_read_decision_candidate_facts_v1",{p_spot_ids:ids});fail(factsError,"candidate_facts");
    const{data:distribution,error:distributionError}=await this.client.rpc("distribution_trust_filter_entities_v1",{p_entity_type:"spot",p_entity_ids:ids,p_surface:"decision"});fail(distributionError,"distribution");
    const eligibilityDone=performance.now();
    const{data:n4Rows,error:n4Error}=await this.client.rpc("backyrd_read_n4_for_decision_v2",{p_spot_ids:ids});fail(n4Error,"n4");
    const n4Done=performance.now();
    const{data:userCard,error:cardError}=await this.client.rpc("backyrd_read_latest_shared_user_card_v1",{p_user_id:decision.user_id});fail(cardError,"user_card");
    const cardDone=performance.now();
    const factById=new Map((facts??[]).map((row)=>[row.spot_id,row]));
    const distributionById=new Map((distribution??[]).map((row)=>[row.entity_id,row]));
    const n4BySpot=Object.fromEntries((n4Rows??[]).map((row)=>[row.spot_id,{available:row.available,placeType:row.place_type,snapshotIdentity:row.snapshot_identity,freshness:row.freshness,suitabilityFacts:row.suitability_facts??{},concepts:Object.fromEntries((row.concepts??[]).map((concept)=>[concept.concept,{presence:Number(concept.presence),confidence:Number(concept.confidence),provenance:concept.provenance}]))}]));
    return {
      decision:{id:decision.id,userId:decision.user_id,city:decision.city,moodA:decision.mood_a_text,moodB:decision.mood_b_text,createdAt:decision.created_at},
      requestContext:handoff?.request_context??events?.[0]?.context??{},requestVersion:(handoff?.request_context??events?.[0]?.context)?.model_version??"decision-v13-product-context-v1",
      memoryConsentState:userCard?"granted":"missing",userCard:userCard??null,n4BySpot,
      candidates:(impressions??[]).map((row)=>{const fact=factById.get(row.spot_id)??{},mapped=categoryToPlaceType(fact.category_name);return{spotId:row.spot_id,retrievalPosition:row.rank,status:fact.status,city:fact.city,category:fact.category_name,productPlaceType:mapped.placeType,categoryMappingStatus:mapped.status,openNow:fact.open_now,distributionEligible:distributionById.get(row.spot_id)?.eligible===true};}),
      performance:{candidateRetrievalReadMs:Number((retrievalDone-started).toFixed(3)),eligibilityFactsMs:Number((eligibilityDone-retrievalDone).toFixed(3)),n4BatchReadMs:Number((n4Done-eligibilityDone).toFixed(3)),userCardReadMs:Number((cardDone-n4Done).toFixed(3))},
    };
  }

  async persistTrace(result){
    const value=result.package;
    const{data,error}=await this.client.rpc("backyrd_persist_decision_input_trace_v1",{p_decision_id:value.decisionId,p_user_id:value.userId,p_user_card_hash:value.n5.userCardHash,p_moment_hash:value.n3.momentHash,p_projection_hash:value.n5.projectionHash,p_candidate_set_hash:value.candidateSet.candidateSetHash,p_n4_hashes:Object.fromEntries(value.candidates.map((candidate)=>[candidate.spotId,candidate.n4.snapshotHash])),p_knowledge_mode:value.n5.knowledgeMode,p_contract_versions:value.contractIdentities,p_package_hash:value.packageHash,p_validation_disposition:result.validation.disposition});fail(error,"persist_trace");return data;
  }

  async buildAndPersist(decisionId){const started=performance.now(),source=await this.load(decisionId),result=buildDecisionInputPackage(source),traceStarted=performance.now(),traceId=await this.persistTrace(result);return{...result,traceId,performance:{...source.performance,...result.performance,tracePersistenceMs:Number((performance.now()-traceStarted).toFixed(3)),totalMs:Number((performance.now()-started).toFixed(3))}};}
}
