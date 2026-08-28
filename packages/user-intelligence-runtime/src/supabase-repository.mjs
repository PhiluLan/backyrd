import { createHash } from "node:crypto";

const canonical = (value) => value && typeof value === "object" ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const hash = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const fail = (error) => { if (error) throw new Error(`user_intelligence_repository:${error.message}`); };
const reviewId = (event) => (event.provenance?.sourceEventId ?? "").match(/^(?:smart_review|standard_review):([^:]+)/)?.[1] ?? null;
const batches = (values, size = 100) => Array.from({ length:Math.ceil(values.length/size) }, (_, index) => values.slice(index*size,(index+1)*size));

/** Server/service-role only adapter; it contains no preference inference. */
export class SupabaseUserIntelligenceRepository {
  constructor(client) { this.client = client; }
  async readCanonicalSources(userId, { watermark = null } = {}) {
    const { data: consent, error: consentError } = await this.client.from("user_consents").select("status").eq("user_id", userId).eq("purpose_key", "personalized_recommendations").maybeSingle(); fail(consentError);
    if (consent?.status !== "granted") return { consentGranted: false };
    let memoryQuery = this.client.from("backyrd_memory_events_v1").select("*").eq("user_id", userId).order("ingested_at").order("id");
    if (watermark) memoryQuery = memoryQuery.lte("ingested_at", watermark);
    const { data: memoryEvents, error } = await memoryQuery; fail(error);
    const allMemoryEvents=[...(memoryEvents??[])];
    const { data: declarations, error:declarationError } = await this.client.from("backyrd_self_declared_taste_v1").select("id,concept_key,source_kind,spot_id,source_n4_snapshot_identity,created_at,semantic_contract_version").eq("user_id",userId).eq("state","ACTIVE").order("created_at").order("id"); fail(declarationError);
    const declaredSourceIds=new Set(allMemoryEvents.filter((row)=>row.provenance?.source==="SELF_DECLARED").map((row)=>String(row.provenance?.sourceEventId??"").split(":")[0]));
    // Canonical declarations created before the N2 wiring remain readable,
    // but new declarations are represented by their persisted N2 event only.
    // This avoids both historical reinterpretation and duplicate evidence.
    for(const row of declarations??[])if(!declaredSourceIds.has(String(row.id)))allMemoryEvents.push({id:`declared:${row.id}`,idempotency_key:`declared:${row.id}`,user_id:userId,event_type:"onboarding_preference",contract_version:row.semantic_contract_version,occurred_at:row.created_at,observed_at:row.created_at,ingested_at:row.created_at,decision_id:null,session_id:`declared:${row.source_kind}`,spot_id:row.spot_id,moment_signature:{},spot_evidence:{concepts:[row.concept_key]},provenance:{source:"SELF_DECLARED",sourceVersion:row.semantic_contract_version,sourceEventId:String(row.id),n4SnapshotIdentity:row.source_n4_snapshot_identity},consent_purpose:"personalized_recommendations",consent_state:"granted"});
    allMemoryEvents.sort((a,b)=>String(a.ingested_at).localeCompare(String(b.ingested_at))||String(a.id).localeCompare(String(b.id)));
    const eventIds=allMemoryEvents.map((row)=>row.id).filter((id)=>!String(id).startsWith("declared:"));
    const envelopeRows=[];
    for(const group of batches(eventIds)){const{data,error:envelopeError}=await this.client.from("backyrd_memory_event_evidence_envelopes_v1").select("*").eq("user_id",userId).in("memory_event_id",group);fail(envelopeError);envelopeRows.push(...(data??[]));}
    const envelopeByEvent=Object.fromEntries(envelopeRows.map((row)=>[row.memory_event_id,{sourceKind:row.source_kind,momentSignature:row.moment_signature,requestedContext:row.requested_context,ambientContext:row.ambient_context,n4SnapshotHash:row.n4_snapshot_hash,n4SnapshotIdentity:row.n4_snapshot_identity,n4Availability:row.n4_availability,placeType:row.place_type,tasteConcepts:row.taste_concepts,suitabilityContext:row.suitability_context,attributionDisposition:row.attribution_disposition,semanticContractVersion:row.semantic_contract_version,envelopeHash:row.envelope_hash}]));
    const ids = allMemoryEvents.map(reviewId).filter(Boolean);
    const reviews=[];
    for (const group of batches(ids)) { const { data, error:reviewError } = await this.client.from("reviews").select("id,text,mood_a,mood_b,spot_id,user_id,data_origin,review_origin,product_evidence_origin,semantic_contract_version").eq("user_id",userId).in("id",group); fail(reviewError); reviews.push(...(data??[])); }
    const reviewsById = Object.fromEntries((reviews ?? []).filter((r)=>["REAL","IMPORT"].includes(r.data_origin)&&(
      (r.review_origin==="SMART_REVIEW"&&r.product_evidence_origin==="smart_review_v1")||
      (r.review_origin==="STANDARD_REVIEW"&&r.product_evidence_origin==null)
    )&&r.semantic_contract_version==="backyrd-canonical-semantics-v1").map((r) => [r.id, { text: r.text, moods: [r.mood_a, r.mood_b].filter(Boolean), semanticContractVersion:r.semantic_contract_version,spotBinding: { status: "CONFIRMED", confidence: .9 } }]));
    const effectiveWatermark = watermark ?? allMemoryEvents.at(-1)?.ingested_at ?? null;
    return { consentGranted: true, memoryEvents: allMemoryEvents.map((m) => ({ id:m.id,idempotencyKey:m.idempotency_key,userId:m.user_id,eventType:m.event_type,contractVersion:m.contract_version,occurredAt:m.occurred_at,observedAt:m.observed_at,ingestedAt:m.ingested_at,decisionId:m.decision_id,sessionId:m.session_id,spotId:m.spot_id,reviewId:reviewId(m),momentSignature:m.moment_signature,spotEvidence:m.spot_evidence,evidenceEnvelope:envelopeByEvent[m.id]??null,provenance:m.provenance,consentPurpose:m.consent_purpose,consentState:m.consent_state })), n4BySpot:{}, reviewsById, asOf: effectiveWatermark ?? new Date(0).toISOString(), watermark: effectiveWatermark };
  }
  async claimWork(leaseSeconds = 300) {
    const { data, error } = await this.client.rpc("backyrd_claim_user_intelligence_work_v1", { p_lease_seconds: leaseSeconds }); fail(error);
    const row = data?.[0]; return row ? { leaseToken:row.lease_token,userId:row.user_id,watermark:row.target_watermark,workIds:row.work_ids,attempt:row.attempt,reason:row.processing_reason } : null;
  }
  async failWork(claim, { retryable, code }) {
    const { error } = await this.client.rpc("backyrd_fail_user_intelligence_work_v1", { p_user_id:claim.userId,p_lease_token:claim.leaseToken,p_retryable:retryable,p_failure_code:code }); fail(error);
  }
  async reconcileWork(claim) {
    const { data, error } = await this.client.rpc("backyrd_reconcile_user_intelligence_work_v1", { p_user_id:claim.userId,p_work_ids:claim.workIds }); fail(error);
    return data;
  }
  async readLatestCard(userId) {
    const { data, error } = await this.client.rpc("backyrd_read_latest_shared_user_card_v1", { p_user_id:userId }); fail(error);
    return data ?? null;
  }
  async persistAtomically({ userId, reason, sourceWatermark, input, card, nodes, ledger, dispositions, runtimeVersion, workIds, leaseToken }) {
    // Compatibility-only declared:* rows are not persisted N2 events and
    // therefore cannot be foreign-keyed into per-event processing audit.
    const persistedDispositions=(dispositions??[]).filter((row)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(row.eventId)));
    const { data, error } = await this.client.rpc("backyrd_persist_shared_user_intelligence_v4", { p_user_id:userId,p_runtime_version:runtimeVersion,p_input_contract_version:"backyrd-production-input-adapter-v4+unified-moment-feedback-v1",p_source_watermark:sourceWatermark,p_source_hash:hash(input),p_snapshot_hash:card.userCardHash,p_card:card,p_nodes:nodes,p_ledger:ledger,p_dispositions:persistedDispositions,p_work_ids:workIds,p_lease_token:leaseToken }); fail(error); return { snapshotId:data, snapshotHash:card.userCardHash, reason };
  }
  async purgeDerivedUserIntelligence(userId) { const { error } = await this.client.rpc("backyrd_purge_shared_user_intelligence_v1", { p_user_id:userId }); fail(error); return { purged:true }; }
  async enqueueFullRebuild(userId, reason = "FULL_REBUILD") { const { data, error } = await this.client.rpc("backyrd_enqueue_user_intelligence_rebuild_v1", { p_user_id:userId,p_reason:reason }); fail(error); return data === true; }
}
