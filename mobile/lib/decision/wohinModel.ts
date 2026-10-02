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

export function wohinFitLabel(candidate: DecisionProductCandidate): string {
  return candidate.tier === "ELIGIBLE_CONFIRMED" && candidate.coreIntentCoverage === "CONFIRMED"
    ? "Passend zu deinem Wunsch"
    : "Passung noch nicht vollständig belegt";
}

const reasonLabels: Record<string, string> = {
  "core-intent-confirmed": "Die Art des Ortes passt zu deinem Wunsch.",
  "atmosphere-fit": "Die Atmosphäre passt zu dem, was du suchst.",
  "visit-fit": "Passt zu deiner geplanten Begleitung.",
  "daypart-fit": "Passt zur gewünschten Tageszeit.",
  "price-level-fit": "Das Preisniveau passt zum Wunsch nach günstig.",
  "primary-purpose-confirmed": "Der Ort ist auch auf diese Art von Besuch ausgerichtet.",
};
const reasonPriority = ["core-intent-confirmed", "atmosphere-fit", "visit-fit", "daypart-fit", "price-level-fit", "primary-purpose-confirmed"];

export function wohinHighlights(candidate: DecisionProductCandidate, personalizationActive: boolean): string[] {
  const confirmed = new Set(candidate.reasons.filter((reason) => reason.confirmed).map((reason) => reason.code));
  const highlights = reasonPriority
    .filter((code) => confirmed.has(code) && !(code === "primary-purpose-confirmed" && confirmed.has("core-intent-confirmed")))
    .map((code) => reasonLabels[code]);
  if (personalizationActive && candidate.reasons.some((reason) => reason.confirmed && reason.code.startsWith("user-taste-positive-"))) {
    highlights.push("Passt zu deinen freigegebenen Vorlieben.");
  }
  return highlights.slice(0, 2);
}

export function wohinConsiderations(candidate: DecisionProductCandidate, personalizationActive: boolean): string[] {
  const notes: string[] = [];
  if (candidate.coreIntentCoverage !== "CONFIRMED") notes.push("Ob dieser Ort genau zu deinem Wunsch passt, ist noch nicht bestätigt.");
  if (candidate.unknownHardConstraints.some((constraint) => constraint !== "OPEN_ON_REQUESTED_DAY")) notes.push("Eine angefragte Bedingung konnte noch nicht bestätigt werden.");
  if (personalizationActive && candidate.reasons.some((reason) => reason.confirmed && reason.code.startsWith("user-taste-negative-"))) {
    notes.push("Nicht alle deiner Vorlieben sprechen für diesen Ort.");
  }
  if (candidate.reasons.some((reason) => reason.code === "product-rank-versus-next-v1" && reason.statement.includes("neutralen stabilen Tie-Breakers"))) {
    notes.push("Bei ähnlich gut belegten Orten bedeutet die Reihenfolge keine bessere Passung.");
  }
  return notes;
}

export function wohinLimitations(limitations: readonly string[]): string[] {
  const labels: Record<string, string> = {
    SINGLE_CANDIDATE: "Für diesen Wunsch steht gerade nur ein geprüfter Ort zur Auswahl.",
    CANDIDATE_WINDOW_LIMITED: "Hier siehst du nur einen Teil der passenden Orte.",
    CORE_INTENT_REQUIRES_CLARIFICATION: "Dein Wunsch konnte nicht eindeutig verstanden werden. Versuche ihn genauer zu beschreiben.",
  };
  return [...new Set(limitations.map((code) => labels[code] ?? "Zu dieser Auswahl liegen weitere Einschränkungen vor. Prüfe wichtige Angaben vor deinem Besuch."))];
}
