import { createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (error) => { if (error) throw new Error(`user_intelligence_repository:${error.message}`); };
const reviewId = (event) => (event.provenance?.sourceEventId ?? "").match(/^smart_review:([^:]+)/)?.[1] ?? null;

/** Server/service-role only adapter; it contains no preference inference. */
export class SupabaseUserIntelligenceRepository {
  constructor(client) { this.client = client; }
  async readCanonicalSources(userId) {
    const { data: consent, error: consentError } = await this.client.from("user_consents").select("status").eq("user_id", userId).eq("purpose_key", "personalized_recommendations").maybeSingle(); fail(consentError);
    if (consent?.status !== "granted") return { consentGranted: false };
    const { data: memoryEvents, error } = await this.client.from("backyrd_memory_events_v1").select("*").eq("user_id", userId).order("occurred_at"); fail(error);
    const spotIds = [...new Set(memoryEvents.map((x) => x.spot_id).filter(Boolean))];
    const { data: n4Rows, error: n4Error } = await this.client.rpc("backyrd_read_n4_for_user_intelligence_v1", { p_spot_ids: spotIds }); fail(n4Error);
    const n4BySpot = Object.fromEntries((n4Rows ?? []).map((row) => [row.spot_id, { placeType: row.place_type, concepts: Object.fromEntries((row.concepts ?? []).map((c) => [c.concept, { confidence: Number(c.confidence) }])) }]));
    const ids = memoryEvents.map(reviewId).filter(Boolean);
    const { data: reviews, error: reviewError } = ids.length ? await this.client.from("reviews").select("id,text,mood_a,mood_b,spot_id,user_id").in("id", ids) : { data: [], error: null }; fail(reviewError);
    const reviewsById = Object.fromEntries((reviews ?? []).map((r) => [r.id, { text: r.text, moods: [r.mood_a, r.mood_b].filter(Boolean), spotBinding: { status: "CONFIRMED", confidence: .9 } }]));
    return { consentGranted: true, memoryEvents: memoryEvents.map((m) => ({ id:m.id,idempotencyKey:m.idempotency_key,userId:m.user_id,eventType:m.event_type,contractVersion:m.contract_version,occurredAt:m.occurred_at,observedAt:m.observed_at,ingestedAt:m.ingested_at,decisionId:m.decision_id,sessionId:m.session_id,spotId:m.spot_id,reviewId:reviewId(m),momentSignature:m.moment_signature,spotEvidence:m.spot_evidence,provenance:m.provenance,consentPurpose:m.consent_purpose,consentState:m.consent_state })), n4BySpot, reviewsById, asOf: new Date().toISOString(), watermark: memoryEvents.at(-1)?.occurred_at ?? null };
  }
  async persistAtomically({ userId, reason, sourceWatermark, input, card, nodes, ledger, runtimeVersion }) {
    const { data, error } = await this.client.rpc("backyrd_persist_shared_user_intelligence_v1", { p_user_id:userId,p_runtime_version:runtimeVersion,p_input_contract_version:"backyrd-production-input-adapter-v1",p_source_watermark:sourceWatermark,p_source_hash:hash(input),p_snapshot_hash:card.userCardHash,p_card:card,p_nodes:nodes,p_ledger:ledger,p_work_ids:[] }); fail(error); return { snapshotId:data, snapshotHash:card.userCardHash, reason };
  }
  async purgeDerivedUserIntelligence(userId) { const { error } = await this.client.from("backyrd_user_intelligence_latest_v1").delete().eq("user_id",userId); fail(error); return { purged:true }; }
}
