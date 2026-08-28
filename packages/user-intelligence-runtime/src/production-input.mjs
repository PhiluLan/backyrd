import { understandMoods, understandReview } from "../../../decision-lab/src/n5-8-unified-user-evidence.mjs";
import { canonicalizeProductMood,isUserTasteConcept,SEMANTIC_CONTRACT_VERSION } from "../../canonical-semantics/src/index.mjs";

const conceptRequiredEvents=new Set(["spot_tapped","search_result_opened","spot_opened","saved","navigation_intent","reservation_intent","verified_visit","positive_post_visit","negative_post_visit","exact_mood_feedback","explicit_positive","explicit_negative"]);
const outcomeEvents=new Set(["verified_visit","positive_post_visit","negative_post_visit","exact_mood_feedback","explicit_positive","explicit_negative"]);
const nonTasteDisposition={decision_request:"REQUEST_NO_TASTE",candidate_exposed:"EXPOSURE_NO_TASTE",decision_results_shown:"EXPOSURE_NO_TASTE",not_there:"CONTEXT_CORRECTION_NO_TASTE",save_removed:"STATE_CHANGE_NO_TASTE",memory_correction:"CORRECTION_NO_TASTE"};
const scopeCount=(moment,placeType)=>1+(placeType?1:0)+(moment?.audience&&moment.audience!=="other"?1:0)+(["morning","afternoon","evening"].includes(moment?.daypart)?1:0)+(moment?.calendar?1:0);

/**
 * Builds the frozen runtime input from server-read product rows. This adapter
 * does not infer taste: it preserves N2 facts, attaches canonical N4 only,
 * and lets the frozen review contract determine whether satisfaction is known.
 */
export function buildCanonicalRuntimeInputWithDispositions({ memoryEvents, reviewsById = {} }) {
  const events = [];
  const dispositions=[];
  for (const memory of [...memoryEvents].sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)) || String(a.id).localeCompare(String(b.id)))) {
    const envelope=memory.evidenceEnvelope;
    const directConcepts=(memory.provenance?.source==="SELF_DECLARED"||memory.eventType==="onboarding_preference")?(memory.spotEvidence?.concepts??[]):[];
    const pinnedConcepts=envelope?.tasteConcepts?.map((row)=>row.concept).filter(isUserTasteConcept)??directConcepts;
    const pinnedMoment=envelope?.momentSignature??memory.momentSignature??{};
    const pinnedPlaceType=envelope?.placeType??memory.spotEvidence?.placeType??null;
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
      momentSignature: pinnedMoment,
      spotEvidence: {
        placeType:pinnedPlaceType,
        concepts:[...new Set(pinnedConcepts)].sort(),
      },
      provenance: memory.provenance,
      consentPurpose: memory.consentPurpose,
      consentState: memory.consentState,
    };
    const review = memory.reviewId ? reviewsById[memory.reviewId] : null;
    const qualifiedMoods=(review?.moods??[]).map(canonicalizeProductMood).filter((mood)=>mood.status==="QUALIFYING").map((mood)=>mood.canonicalLabel);
    const reviewEvidence=memory.eventType==="verified_visit"&&review&&base.spotId?{...review,moods:qualifiedMoods,semanticContractVersion:review.semanticContractVersion??SEMANTIC_CONTRACT_VERSION,reviewId:memory.reviewId,journeyLink:review.journeyLink??{journeyKey:[base.userId,base.sessionId,base.decisionId,base.spotId].join("|")}}:null;
    const interpretation=reviewEvidence?understandReview(reviewEvidence,{spotIntelligence:null}):null;
    const directlySupported=interpretation?[...interpretation.claims,...understandMoods(reviewEvidence,interpretation)].map((claim)=>claim.concept):[];
    const attributableConcepts=[...new Set([...base.spotEvidence.concepts,...directlySupported])].sort();
    base.spotEvidence.concepts=attributableConcepts;
    // N2 remains the authoritative Experience/Interest record. The frozen
    // Taste runtime accepts concept-bearing learning events only, so missing
    // N4/direct concepts are omitted here rather than imputed.
    const outcomeScopeReady=!outcomeEvents.has(base.eventType)||Boolean(base.spotEvidence.placeType);
    const included=(!conceptRequiredEvents.has(base.eventType)||attributableConcepts.length>0)&&outcomeScopeReady;
    if(included)events.push(base);
    let disposition=nonTasteDisposition[base.eventType]??null;
    if(conceptRequiredEvents.has(base.eventType)){
      if(!envelope&&directConcepts.length===0)disposition="UNPINNED_HISTORICAL_FAIL_CLOSED";
      else if(envelope?.attributionDisposition==="NO_EVENT_TIME_N4"||envelope?.n4Availability==="UNKNOWN")disposition="NO_EVENT_TIME_N4";
      else if(attributableConcepts.length===0)disposition="NO_TASTE_AUTHORIZED_CONCEPTS";
      else if(!outcomeScopeReady)disposition="SCOPE_NOT_IDENTIFIABLE";
      else disposition=envelope?"PINNED_EVIDENCE_READY":"DIRECT_SEMANTIC_EVIDENCE_READY";
    }
    dispositions.push({eventId:base.id,processingDisposition:disposition??(included?"NON_TASTE_EVENT_PROCESSED":"NO_EVIDENCE"),evidenceCount:included&&attributableConcepts.length?Math.min(8,attributableConcepts.length)*scopeCount(base.momentSignature,base.spotEvidence.placeType):0,envelopeHash:envelope?.envelopeHash??null});
    if(!interpretation||!['POSITIVE','NEGATIVE'].includes(interpretation.overallSentiment))continue;
    // Overall sentiment without N4 or explicit attribute evidence is observable
    // satisfaction, but cannot safely become concept-level Taste input.
    if (attributableConcepts.length === 0 || !base.spotEvidence.placeType) continue;
    // A review-derived satisfaction observation is deterministic, scoped to
    // the same journey, and never changes the immutable visit fact.
    events.push({ ...base, spotEvidence:{...base.spotEvidence,concepts:attributableConcepts},id: `${base.id}:review-satisfaction`, idempotencyKey: `${base.id}:review-satisfaction`, eventType: interpretation.overallSentiment === "POSITIVE" ? "positive_post_visit" : "negative_post_visit", reviewEvidence });
  }
  return {events,dispositions};
}

export function buildCanonicalRuntimeInput(value){return buildCanonicalRuntimeInputWithDispositions(value).events;}
