import type { DecisionProductCandidate, DecisionProductRequest, DecisionProductResponse } from "@backyrd/product-decision-contract";

const MAX_VISIBLE_CANDIDATES = 5;

export function createWohinRequest(input: { query: string; city: string; requestId: string }): DecisionProductRequest {
  const naturalLanguage = input.query.trim().replace(/\s+/g, " ");
  const profileCity = input.city.trim();
  const targetCity = /^z(?:ü|u)rich$/iu.test(profileCity) ? "Zurich" : profileCity;
  if (naturalLanguage.length < 3 || naturalLanguage.length > 2000) throw new Error("wohin_query_invalid");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(targetCity)) throw new Error("wohin_city_unavailable");
  return {
    contractVersion: "backyrd.decision-vnext.product-request@1.0",
    requestId: input.requestId,
    idempotencyKey: input.requestId,
    naturalLanguage,
    // The profile city is location authority, never an inferred preference.
    // No guided choices or client-side intent interpretation enter this request.
    explicit: { targetCity },
    alternativeRequested: false,
    previouslyPresentedCandidateIds: [],
    rejectedCandidateIds: [],
  };
}

export function visibleWohinCandidates(response: DecisionProductResponse): DecisionProductCandidate[] {
  const ranked = response.candidates.filter((candidate) => candidate.rank !== null && !candidate.contextualReject);
  if (ranked.some((candidate, index) => index > 0 && candidate.rank! <= ranked[index - 1].rank!)) {
    throw new Error("wohin_server_ranking_invalid");
  }
  if (ranked.length > 0 && ranked[0].spotId !== response.primaryCandidateId) {
    throw new Error("wohin_primary_binding_invalid");
  }
  if (ranked.length === 0 && response.primaryCandidateId !== null) {
    throw new Error("wohin_primary_binding_invalid");
  }
  // Slice the already-ranked server response; never re-rank in the client.
  return ranked.slice(0, MAX_VISIBLE_CANDIDATES);
}

export function wohinEvidenceState(candidate: DecisionProductCandidate): string {
  if (candidate.tier === "ELIGIBLE_CONFIRMED" && candidate.coreIntentCoverage === "CONFIRMED") return "Kernabsicht bestätigt";
  if (candidate.coreIntentCoverage === "INCOMPATIBLE" || candidate.coreIntentCoverage === "DISPUTED") return "Nicht passend belegt";
  return "Passung nicht bestätigt";
}

export function wohinRankingEvidence(candidate: DecisionProductCandidate): string[] {
  // The server response is schema-validated at the Product boundary. The
  // shared schema currently exposes nested vector fields as unknown in TS.
  const vector = candidate.rankVector as unknown as {
    hardConstraintState: "PASS" | "UNKNOWN" | "FAIL";
    userRelevance: { state: "POSITIVE_DIRECT" | "NEUTRAL" };
    contextFit: { secondaryIntentConfirmed: boolean; visitSituationConfirmed: boolean; atmosphereConfirmed: boolean; typicalDaypartConfirmed: boolean; matchedSoftPreferenceCount: number };
    worldEvidence: { confirmedReasonCount: number };
  };
  const evidence = [
    candidate.coreIntentCoverage === "CONFIRMED" ? "Die Hauptabsicht ist durch World Knowledge bestätigt." : "Die Hauptabsicht ist für diesen Spot nicht bestätigt.",
    vector.hardConstraintState === "PASS" ? "Keine bekannte harte Bedingung ist verletzt." : "Mindestens eine harte Bedingung ist ungeklärt.",
  ];
  if (vector.userRelevance.state === "POSITIVE_DIRECT") evidence.push("Eine consentgebundene direkte Nutzerpräferenz beeinflusst die Reihenfolge.");
  if (vector.contextFit.secondaryIntentConfirmed || vector.contextFit.visitSituationConfirmed || vector.contextFit.atmosphereConfirmed || vector.contextFit.typicalDaypartConfirmed || vector.contextFit.matchedSoftPreferenceCount > 0) {
    evidence.push("Bestätigte Kontext- oder Stimmungsmerkmale beeinflussen die Reihenfolge.");
  }
  if (vector.worldEvidence.confirmedReasonCount === 0) evidence.push("Keine zusätzliche bestätigte World-Begründung für diesen Platz vorhanden.");
  evidence.push("Bei gleichen fachlichen Signalen entscheidet ein neutraler, stabiler Tie-Breaker – keine behauptete bessere Passung.");
  return evidence;
}
