import { understandReview } from "../../../decision-lab/src/n5-8-unified-user-evidence.mjs";

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
      spotEvidence: { placeType: n4BySpot[memory.spotId]?.placeType ?? memory.spotEvidence?.placeType ?? null, concepts: Object.keys(n4BySpot[memory.spotId]?.concepts ?? {}) },
      provenance: memory.provenance,
      consentPurpose: memory.consentPurpose,
      consentState: memory.consentState,
    };
    events.push(base);
    const review = memory.reviewId ? reviewsById[memory.reviewId] : null;
    if (memory.eventType !== "verified_visit" || !review || !base.spotId) continue;
    const reviewEvidence = { ...review, reviewId: memory.reviewId, journeyLink: review.journeyLink ?? { journeyKey: [base.userId, base.sessionId, base.decisionId, base.spotId].join("|") } };
    const interpretation = understandReview(reviewEvidence, { spotIntelligence: n4BySpot[base.spotId] });
    if (!['POSITIVE', 'NEGATIVE'].includes(interpretation.overallSentiment)) continue;
    // A review-derived satisfaction observation is deterministic, scoped to
    // the same journey, and never changes the immutable visit fact.
    events.push({ ...base, id: `${base.id}:review-satisfaction`, idempotencyKey: `${base.id}:review-satisfaction`, eventType: interpretation.overallSentiment === "POSITIVE" ? "positive_post_visit" : "negative_post_visit", reviewEvidence });
  }
  return events;
}
