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
    : "Mit offenen Angaben";
}

const reasonLabels: Record<string, string> = {
  "core-intent-confirmed": "Eine passende Idee für dich.",
  "atmosphere-fit": "Die Stimmung passt zu dem, was du suchst.",
  "visit-fit": "Passt für dich und deine Begleitung.",
  "daypart-fit": "Passt zu deiner geplanten Tageszeit.",
  "price-level-fit": "Die Preise liegen im günstigen Bereich. Einzelne Angebote können mehr kosten.",
  "primary-purpose-confirmed": "Passt zu dem, was du vorhast.",
};
const reasonPriority = ["core-intent-confirmed", "atmosphere-fit", "visit-fit", "daypart-fit", "price-level-fit", "primary-purpose-confirmed"];

const librarianHighlights: Record<string, string> = {
  "Bestätigt: die gewünschte Aktivität.": "Das kannst du hier unternehmen.",
  "Bestätigt: die gewünschte Art des Angebots.": "Hier gibt es, wonach du suchst.",
  "Bestätigt: die Essensmöglichkeit.": "Hier kannst du wie gewünscht essen.",
  "Bestätigt: die Getränkeauswahl.": "Dein Wunschgetränk gibt es hier.",
  "Bestätigt: die gewünschte Ernährung.": "Hier gibt es etwas Passendes für deine Ernährung.",
  "Bestätigt: die gewünschte Atmosphäre.": "Die Stimmung passt zu deinem Wunsch.",
  "Bestätigt: der gewünschte Bereich.": "Hier findest du den gewünschten Platz drinnen oder draussen.",
  "Dein Budget passt zur hinterlegten Preisspanne.": "Passt zu deinem Budget.",
};

export function wohinPlaceMeta(candidate: DecisionProductCandidate): string {
  const groups: Record<string, string> = { EAT: "Essen & Trinken", DRINKS: "Bar", COFFEE_DAYTIME: "Café", NIGHTLIFE: "Nachtleben", CULTURE_ARTS: "Kultur", ENTERTAINMENT: "Unterhaltung", ACTIVITIES_PLAY: "Aktivitäten & Spiel", SPORT_MOVEMENT: "Sport & Bewegung", OUTDOOR_NATURE: "Natur & draussen", WELLNESS_RELAXATION: "Wellness", SHOPPING_MARKETS: "Shopping", STAY: "Übernachten", COMMUNITY_SOCIAL: "Gemeinschaft", ATTRACTIONS_LANDMARKS: "Ausflugsziel", TEMPORARY_PLACES: "Veranstaltungsort" };
  const raw = candidate.presentation.categoryLabel;
  const category = groups[raw ?? ""] ?? (raw && !/^[A-Z_]+$/.test(raw) ? raw : null);
  return [category, candidate.presentation.locality].filter(Boolean).join(" · ");
}

export function wohinHighlights(candidate: DecisionProductCandidate, personalizationActive: boolean): string[] {
  const confirmed = new Set(candidate.reasons.filter((reason) => reason.confirmed).map((reason) => reason.code));
  const currentReasons = candidate.reasons.filter(reason => reason.confirmed && reason.domain === "WORLD");
  const highlights = currentReasons.flatMap(reason => {
    if (reason.code === "librarian-selected-offers" && reason.statement.startsWith("Passende Angebote: ")) return [`Das gibt es hier: ${reason.statement.slice("Passende Angebote: ".length)}`];
    return reason.code.startsWith("LBR:") && librarianHighlights[reason.statement] ? [librarianHighlights[reason.statement]] : [];
  });
  highlights.push(...reasonPriority
    .filter((code) => confirmed.has(code) && !(code === "primary-purpose-confirmed" && confirmed.has("core-intent-confirmed")))
    .map((code) => reasonLabels[code]));
  if (personalizationActive && candidate.reasons.some((reason) => reason.confirmed && reason.code.startsWith("user-taste-positive-"))) {
    highlights.push("Passt zu deinen Vorlieben.");
  }
  return [...new Set(highlights)].slice(0, 2);
}

const librarianNotes: Record<string, string> = {
  "Noch nicht bestätigt: die gewünschte Aktivität.": "Zu deinem Vorhaben fehlen uns noch Infos.",
  "Noch nicht bestätigt: die gewünschte Art des Angebots.": "Ob es das gesuchte Angebot hier gibt, wissen wir noch nicht.",
  "Noch nicht bestätigt: die Essensmöglichkeit.": "Ob du hier wie gewünscht essen kannst, wissen wir noch nicht.",
  "Noch nicht bestätigt: die Getränkeauswahl.": "Ob es dein Wunschgetränk hier gibt, wissen wir noch nicht.",
  "Noch nicht bestätigt: die gewünschte Ernährung.": "Ob es etwas Passendes für deine Ernährung gibt, wissen wir noch nicht.",
  "Noch nicht bestätigt: der gewünschte Bereich.": "Ob du hier wie gewünscht drinnen oder draussen sein kannst, wissen wir noch nicht.",
  "Noch nicht bestätigt: die gewünschte Atmosphäre.": "Ob die Stimmung vor Ort zu deinem Wunsch passt, wissen wir noch nicht.",
  "Noch nicht bestätigt: die gewünschte Einrichtung.": "Ob die gewünschte Einrichtung vorhanden ist, wissen wir noch nicht.",
  "Noch nicht bestätigt: die gewünschte Ausstattung.": "Ob die gewünschte Ausstattung vorhanden ist, wissen wir noch nicht.",
  "Noch nicht bestätigt: die gewünschte Zugänglichkeit.": "Ob der Zugang für dich geeignet ist, wissen wir noch nicht.",
  "Noch nicht bestätigt: die Besuchsbedingungen.": "Zu den Zutrittsregeln fehlen uns noch Infos.",
  "Noch nicht bestätigt: die Kombination deiner Wünsche.": "Ob sich deine Wünsche hier kombinieren lassen, wissen wir noch nicht.",
  "Noch nicht bestätigt: dein Budget.": "Ob die Preise zu deinem Budget passen, wissen wir noch nicht.",
  "Noch nicht bestätigt: die gewünschte Besuchszeit.": "Ob du zur gewünschten Zeit kommen kannst, wissen wir noch nicht.",
  "Noch nicht bestätigt: dieser Teil deines Wunsches.": "Zu einem Teil deines Wunsches fehlen uns noch Infos.",
  "Ein ausdrücklich ausgeschlossener Inhalt ist hier vorhanden.": "Etwas, das du nicht möchtest, wird hier ebenfalls angeboten.",
};

export function wohinConsiderations(candidate: DecisionProductCandidate, personalizationActive: boolean): string[] {
  const notes: string[] = candidate.reasons.flatMap(reason => {
    if (reason.confirmed || reason.domain !== "LIMITATION") return [];
    if (reason.code.startsWith("LBR:") && /^(Noch nicht bestätigt:|Nicht passend:|Ein ausdrücklich ausgeschlossener Inhalt)/.test(reason.statement)) return [librarianNotes[reason.statement] ?? reason.statement];
    if (["librarian-access-details", "librarian-visit-time-unconfirmed"].includes(reason.code)) return [librarianNotes[reason.statement] ?? reason.statement];
    return [];
  });
  const hasDetailedNotes = notes.length > 0;
  if (candidate.coreIntentCoverage !== "CONFIRMED") notes.push("Ob du hier genau das Richtige findest, wissen wir noch nicht.");
  if (candidate.reasons.some((reason) => reason.code === "visit-unconfirmed")) notes.push("Ob es für dich und deine Begleitung passt, wissen wir noch nicht.");
  if (candidate.reasons.some((reason) => reason.code === "price-level-unconfirmed")) notes.push("Ob die Preise günstig sind, wissen wir noch nicht.");
  if (candidate.reasons.some((reason) => reason.code === "music-at-visit-unverified")) notes.push("Ob bei deinem Besuch Musik läuft, wissen wir noch nicht.");
  if (candidate.reasons.some((reason) => reason.code === "precise-time-unverified")) notes.push("Ob dein Besuch zur gewünschten Uhrzeit möglich ist, wissen wir noch nicht.");
  if (candidate.reasons.some((reason) => reason.code === "core-need-unmapped")) notes.push("Zu einem Teil deines Wunsches fehlen uns noch Infos.");
  if (!hasDetailedNotes && candidate.unknownHardConstraints.some((constraint) => constraint !== "OPEN_ON_REQUESTED_DAY")) notes.push("Manche Details zu deinem Wunsch sind noch offen.");
  if (personalizationActive && candidate.reasons.some((reason) => reason.confirmed && reason.code.startsWith("user-taste-negative-"))) {
    notes.push("Der Ort passt nicht zu allen deinen Vorlieben.");
  }
  if (candidate.reasons.some((reason) => reason.code === "product-rank-versus-next-v1" && reason.statement.includes("neutralen stabilen Tie-Breakers"))) {
    notes.push("Bei ähnlich passenden Orten bedeutet ein früherer Platz keine bessere Empfehlung.");
  }
  return [...new Set(notes)];
}

export function wohinLimitations(limitations: readonly string[], visibleCount: number): string[] {
  const labels: Record<string, string> = {
    SINGLE_CANDIDATE: visibleCount > 0
      ? "Für deinen Wunsch haben wir gerade einen Vorschlag."
      : "Der bisher gefundene Ort passt leider nicht zu deinem Wunsch.",
    CANDIDATE_WINDOW_LIMITED: "Einige Orte passen nicht zu deinem Wunsch und werden deshalb nicht gezeigt.",
    CORE_INTENT_REQUIRES_CLARIFICATION: "Wir haben deinen Wunsch noch nicht ganz verstanden. Beschreibe kurz, was du machen möchtest.",
  };
  return [...new Set(limitations.map((code) => labels[code] ?? "Bei dieser Auswahl gibt es noch offene Fragen. Prüfe wichtige Details vor deinem Besuch."))];
}
