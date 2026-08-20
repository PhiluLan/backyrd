import { createHash } from "node:crypto";

const canonical = (value) => value && typeof value === "object" ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const hash = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const fail = (error) => { if (error) throw new Error(`user_intelligence_repository:${error.message}`); };
const reviewId = (event) => (event.provenance?.sourceEventId ?? "").match(/^smart_review:([^:]+)/)?.[1] ?? null;
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
    const spotIds = [...new Set(memoryEvents.map((x) => x.spot_id).filter(Boolean))];
    const n4Rows=[];
    for (const group of batches(spotIds)) { const { data, error:n4Error } = await this.client.rpc("backyrd_read_n4_for_user_intelligence_v1", { p_spot_ids: group }); fail(n4Error); n4Rows.push(...(data??[])); }
    const n4BySpot = Object.fromEntries(n4Rows.map((row) => [row.spot_id, { available:row.available,placeType:row.place_type,snapshotIdentity:row.snapshot_identity,freshness:row.freshness,concepts:Object.fromEntries((row.concepts ?? []).map((c) => [c.concept,{presence:Number(c.presence),confidence:Number(c.confidence),provenance:c.provenance}])) }]));
    const ids = memoryEvents.map(reviewId).filter(Boolean);
    const reviews=[];
    for (const group of batches(ids)) { const { data, error:reviewError } = await this.client.from("reviews").select("id,text,mood_a,mood_b,spot_id,user_id").eq("user_id",userId).in("id",group); fail(reviewError); reviews.push(...(data??[])); }
    const reviewsById = Object.fromEntries((reviews ?? []).map((r) => [r.id, { text: r.text, moods: [r.mood_a, r.mood_b].filter(Boolean), spotBinding: { status: "CONFIRMED", confidence: .9 } }]));
    const effectiveWatermark = watermark ?? memoryEvents.at(-1)?.ingested_at ?? null;
    return { consentGranted: true, memoryEvents: memoryEvents.map((m) => ({ id:m.id,idempotencyKey:m.idempotency_key,userId:m.user_id,eventType:m.event_type,contractVersion:m.contract_version,occurredAt:m.occurred_at,observedAt:m.observed_at,ingestedAt:m.ingested_at,decisionId:m.decision_id,sessionId:m.session_id,spotId:m.spot_id,reviewId:reviewId(m),momentSignature:m.moment_signature,spotEvidence:m.spot_evidence,provenance:m.provenance,consentPurpose:m.consent_purpose,consentState:m.consent_state })), n4BySpot, reviewsById, asOf: effectiveWatermark ?? new Date(0).toISOString(), watermark: effectiveWatermark };
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
  async persistAtomically({ userId, reason, sourceWatermark, input, card, nodes, ledger, runtimeVersion, workIds, leaseToken }) {
    const { data, error } = await this.client.rpc("backyrd_persist_shared_user_intelligence_v2", { p_user_id:userId,p_runtime_version:runtimeVersion,p_input_contract_version:"backyrd-production-input-adapter-v1",p_source_watermark:sourceWatermark,p_source_hash:hash(input),p_snapshot_hash:card.userCardHash,p_card:card,p_nodes:nodes,p_ledger:ledger,p_work_ids:workIds,p_lease_token:leaseToken }); fail(error); return { snapshotId:data, snapshotHash:card.userCardHash, reason };
  }
  async purgeDerivedUserIntelligence(userId) { const { error } = await this.client.rpc("backyrd_purge_shared_user_intelligence_v1", { p_user_id:userId }); fail(error); return { purged:true }; }
  async enqueueFullRebuild(userId, reason = "FULL_REBUILD") { const { data, error } = await this.client.rpc("backyrd_enqueue_user_intelligence_rebuild_v1", { p_user_id:userId,p_reason:reason }); fail(error); return data === true; }
}
