import { understandMoods, understandReview } from "../../../decision-lab/src/n5-8-unified-user-evidence.mjs";
import { canonicalizeProductMood,isUserTasteConcept,SEMANTIC_CONTRACT_VERSION } from "../../canonical-semantics/src/index.mjs";

const conceptRequiredEvents=new Set(["spot_tapped","search_result_opened","spot_opened","saved","navigation_intent","reservation_intent","verified_visit","positive_post_visit","negative_post_visit","exact_mood_feedback","explicit_positive","explicit_negative"]);
const outcomeEvents=new Set(["verified_visit","positive_post_visit","negative_post_visit","exact_mood_feedback","explicit_positive","explicit_negative"]);

/**
 * Builds the frozen runtime input from server-read product rows. This adapter
 * does not infer taste: it preserves N2 facts, attaches canonical N4 only,
 * and lets the frozen review contract determine whether satisfaction is known.
 */
export function buildCanonicalRuntimeInput({ memoryEvents, reviewsById = {}, n4BySpot = {} }) {
  const events = [];
  for (const memory of [...memoryEvents].sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)) || String(a.id).localeCompare(String(b.id)))) {
    const base = {
      id: memory.id,
      idempotencyKey: memory.idempotencyKey,
      userId: memory.userId,
      eventType: memory.eventType,
      contractVersion: memory.contractVersion,
      occurredAt: memory.occurredAt,
      observedAt: memory.observedAt,
      ingestedAt: memory.ingestedAt,
      decisionId: memory.decisionId ?? null,
      sessionId: memory.sessionId ?? null,
      spotId: memory.spotId ?? null,
      momentSignature: memory.momentSignature ?? {},
      spotEvidence: {
        placeType: n4BySpot[memory.spotId]?.placeType ?? memory.spotEvidence?.placeType ?? null,
        // N2-authored concepts have already crossed the canonical input
        // validator. N4 concepts are Spot Intelligence and must explicitly be
        // admitted to the frozen 45-concept User Taste registry.
        concepts: [...new Set([
          ...Object.keys(n4BySpot[memory.spotId]?.concepts ?? {}).filter(isUserTasteConcept),
          ...(memory.spotEvidence?.concepts??[]),
        ])].sort(),
      },
      provenance: memory.provenance,
      consentPurpose: memory.consentPurpose,
      consentState: memory.consentState,
    };
    const review = memory.reviewId ? reviewsById[memory.reviewId] : null;
    const qualifiedMoods=(review?.moods??[]).map(canonicalizeProductMood).filter((mood)=>mood.status==="QUALIFYING").map((mood)=>mood.canonicalLabel);
    const reviewEvidence=memory.eventType==="verified_visit"&&review&&base.spotId?{...review,moods:qualifiedMoods,semanticContractVersion:review.semanticContractVersion??SEMANTIC_CONTRACT_VERSION,reviewId:memory.reviewId,journeyLink:review.journeyLink??{journeyKey:[base.userId,base.sessionId,base.decisionId,base.spotId].join("|")}}:null;
    const interpretation=reviewEvidence?understandReview(reviewEvidence,{spotIntelligence:n4BySpot[base.spotId]}):null;
    const directlySupported=interpretation?[...interpretation.claims,...understandMoods(reviewEvidence,interpretation)].map((claim)=>claim.concept):[];
    const attributableConcepts=[...new Set([...base.spotEvidence.concepts,...directlySupported])].sort();
    base.spotEvidence.concepts=attributableConcepts;
    // N2 remains the authoritative Experience/Interest record. The frozen
    // Taste runtime accepts concept-bearing learning events only, so missing
    // N4/direct concepts are omitted here rather than imputed.
    const outcomeScopeReady=!outcomeEvents.has(base.eventType)||Boolean(base.spotEvidence.placeType);
    if((!conceptRequiredEvents.has(base.eventType)||attributableConcepts.length>0)&&outcomeScopeReady)events.push(base);
    if(!interpretation||!['POSITIVE','NEGATIVE'].includes(interpretation.overallSentiment))continue;
    // Overall sentiment without N4 or explicit attribute evidence is observable
    // satisfaction, but cannot safely become concept-level Taste input.
    if (attributableConcepts.length === 0 || !base.spotEvidence.placeType) continue;
    // A review-derived satisfaction observation is deterministic, scoped to
    // the same journey, and never changes the immutable visit fact.
    events.push({ ...base, spotEvidence:{...base.spotEvidence,concepts:attributableConcepts},id: `${base.id}:review-satisfaction`, idempotencyKey: `${base.id}:review-satisfaction`, eventType: interpretation.overallSentiment === "POSITIVE" ? "positive_post_visit" : "negative_post_visit", reviewEvidence });
  }
  return events;
}
