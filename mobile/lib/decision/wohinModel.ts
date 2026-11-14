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
    includeEvents: true,
    // The profile city is location authority, never an inferred preference.
    // No guided choices or client-side intent interpretation enter this request.
    explicit: { targetCity, targetCityRole: "SEARCH_CONTEXT" },
    alternativeRequested: false,
    previouslyPresentedCandidateIds: [],
    rejectedCandidateIds: [],
  };
}

const provisionalVisitReasons = new Set([
  "librarian-dinner-cuisine-unconfirmed",
  "librarian-confirmed-weather-branch", "librarian-departure-time-unconfirmed", "librarian-pizza-budget-unconfirmed",
]);

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
  if (ranked.length) return ranked.slice(0, MAX_VISIBLE_CANDIDATES);
  return response.candidates.filter(candidate => candidate.tier === "UNCONFIRMED_FALLBACK"
    && !candidate.contextualReject && !candidate.failedHardConstraints.length
    && candidate.reasons.some(reason => provisionalVisitReasons.has(reason.code)
      || Boolean(response.clarification) && reason.code === "librarian-provisional-nearby"));
}

export function wohinPlaceMeta(candidate: DecisionProductCandidate): string {
  const groups: Record<string, string> = { EAT: "Essen & Trinken", DRINKS: "Bar", COFFEE_DAYTIME: "Café", NIGHTLIFE: "Nachtleben", CULTURE_ARTS: "Kultur", ENTERTAINMENT: "Unterhaltung", ACTIVITIES_PLAY: "Aktivitäten & Spiel", SPORT_MOVEMENT: "Sport & Bewegung", OUTDOOR_NATURE: "Natur & draussen", WELLNESS_RELAXATION: "Wellness", SHOPPING_MARKETS: "Shopping", STAY: "Übernachten", COMMUNITY_SOCIAL: "Gemeinschaft", ATTRACTIONS_LANDMARKS: "Ausflugsziel", TEMPORARY_PLACES: "Veranstaltungsort" };
  const event = candidate.presentation.event;
  if (event) return ["Veranstaltung",new Intl.DateTimeFormat("de-CH",{timeZone:"Europe/Zurich",weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(event.startAt)),event.venueName??candidate.presentation.locality].filter(Boolean).join(" · ");
  const raw = candidate.presentation.categoryLabel;
  const category = groups[raw ?? ""] ?? (raw && !/^[A-Z_]+$/.test(raw) ? raw : null);
  return [category, candidate.presentation.locality].filter(Boolean).join(" · ");
}

const atmospherePhrases = new Map([
  ["cozy", "gemütlich"],
  ["relaxed", "entspannt"],
  ["romantic", "romantisch"],
]);

/** Describe the match using public, confirmed evidence for this candidate. */
export function wohinRecommendation(
  candidate: DecisionProductCandidate,
  interpretation?: DecisionProductResponse["interpretation"],
): string {
  const provisional = candidate.reasons.find(reason =>
    provisionalVisitReasons.has(reason.code) || reason.code === "librarian-provisional-nearby");
  if (candidate.tier === "UNCONFIRMED_FALLBACK" && provisional) return provisional.statement;

  const world = candidate.reasons.filter(reason => reason.confirmed && reason.domain === "WORLD");
  const facts = new Set(world.filter(reason => /^LBR(?::|_EVIDENCE:)/.test(reason.code)).map(reason => reason.statement));
  const hasAtmosphere = facts.has("Bestätigt: die gewünschte Atmosphäre.");
  const moods = interpretation?.moods;
  const atmosphere = hasAtmosphere && Array.isArray(moods) && moods.length === 1 && typeof moods[0] === "string"
    ? atmospherePhrases.get(moods[0])
    : undefined;
  const dateTime = interpretation?.dateTime;
  const evening = candidate.actualAvailability === "open" && typeof dateTime === "object" && dateTime !== null
    && "dayPhase" in dateTime && dateTime.dayPhase === "EVENING";

  const offers = world.find(reason => reason.code === "librarian-selected-offers" && reason.statement.startsWith("Passende Angebote: "));
  const offerNames = offers?.statement.slice("Passende Angebote: ".length).replace(/[.!?]+$/, "").trim();
  const specificOffer = offerNames && offerNames.length <= 100 && !/^(Abendessen|Essen|Getränke|Restaurant)$/i.test(offerNames)
    ? offerNames
    : null;

  if (specificOffer) {
    const offer = `Hier gibt’s ${specificOffer}.`;
    return atmosphere ? `${offer} Die Atmosphäre ist ${atmosphere}.` : offer;
  }
  if (facts.has("Bestätigt: die Essensmöglichkeit.") && evening) {
    if (atmosphere) return `Hier kannst du am gewünschten Abend ${atmosphere} essen gehen.`;
    return "Hier kannst du am gewünschten Abend essen gehen.";
  }
  if (world.some(reason => reason.code === "librarian-pizza-offer-confirmed")) return "Hier gibt’s Pizza, wie du sie gesucht hast.";
  if (facts.has("Bestätigt: die Essensmöglichkeit.")) {
    return atmosphere ? `Hier kannst du ${atmosphere} essen gehen.` : "Hier kannst du wie gewünscht essen gehen.";
  }
  if (facts.has("Bestätigt: die Getränkeauswahl.")) {
    return "Hier gibt’s das Getränk, das du gesucht hast.";
  }
  if (hasAtmosphere) return atmosphere ? `Die Atmosphäre hier ist ${atmosphere} und passt zu deinem Wunsch.` : "Die Atmosphäre passt zu deinem Wunsch.";
  if (facts.has("Bestätigt: die gewünschte Aktivität.")) return "Deine gewünschte Aktivität wird hier angeboten.";
  if (candidate.presentation?.event) {
    return candidate.coreIntentCoverage === "CONFIRMED"
      ? "Die Veranstaltung passt zu dem, was du suchst. Den Termin findest du oben."
      : "Schau dir den Termin und das Programm an. Ob es zu deinem Wunsch passt, ist noch offen.";
  }
  const clearlyMatched = candidate.coreIntentCoverage === "CONFIRMED" && world.some(reason =>
    ["core-intent-confirmed", "primary-purpose-confirmed"].includes(reason.code) || reason.statement === "Bestätigt: die gewünschte Art des Angebots.");
  if (clearlyMatched) return "Die Art des Angebots passt zu deinem Wunsch.";
  return "Zu deinem Wunsch fehlen bei diesem Ort noch bestätigte Angaben.";
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
    if (["librarian-atmosphere-unconfirmed", "event-ticket-availability", "librarian-inherited-spot-hours", "librarian-external-admission-unconfirmed", "librarian-free-admission", "librarian-age-rules-unconfirmed", "librarian-age-requirement", "librarian-external-consumption-exceptions", "librarian-relative-price-level"].includes(reason.code)) return [reason.statement];
    if (reason.confirmed || reason.domain !== "LIMITATION") return [];
    if (reason.code.startsWith("LBR:") && /^(Noch nicht bestätigt:|Nicht passend:|Ein ausdrücklich ausgeschlossener Inhalt|Diesen Wunsch können wir|Welches Budget)/.test(reason.statement)) return [librarianNotes[reason.statement] ?? reason.statement];
    if (reason.code === "librarian-access-details") return [librarianNotes[reason.statement] ?? reason.statement];
    return [];
  });
  const hasDetailedNotes = notes.length > 0;
  if (candidate.coreIntentCoverage !== "CONFIRMED" && !hasDetailedNotes) notes.push("Ob du hier genau das Richtige findest, wissen wir noch nicht.");
  if (candidate.reasons.some((reason) => reason.code === "visit-unconfirmed")) notes.push("Ob es für dich und deine Begleitung passt, wissen wir noch nicht.");
  if (candidate.reasons.some((reason) => reason.code === "price-level-unconfirmed")) notes.push("Ob die Preise günstig sind, wissen wir noch nicht.");
  if (candidate.reasons.some((reason) => reason.code === "music-at-visit-unverified")) notes.push("Ob bei deinem Besuch Musik läuft, wissen wir noch nicht.");
  if (candidate.reasons.some((reason) => reason.code === "precise-time-unverified")) notes.push("Ob dein Besuch zur gewünschten Uhrzeit möglich ist, wissen wir noch nicht.");
  if (candidate.reasons.some((reason) => reason.code === "core-need-unmapped")) notes.push("Zu einem Teil deines Wunsches fehlen uns noch Infos.");
  if (!hasDetailedNotes && candidate.unknownHardConstraints.some((constraint) => constraint !== "OPEN_ON_REQUESTED_DAY")) notes.push("Manche Details zu deinem Wunsch sind noch offen.");
  if (personalizationActive && candidate.reasons.some((reason) => reason.confirmed && reason.code.startsWith("user-taste-negative-"))) {
    notes.push("Der Ort passt nicht zu allen deinen Vorlieben.");
  }
  return [...new Set(notes)];
}

export function wohinLimitations(limitations: readonly string[], visibleCount: number): string[] {
  const labels: Record<string, string> = {
    LIBRARIAN_WEATHER_CONDITION_OPEN: "Welche Wetteroption passt, hängt vom tatsächlichen Wetter ab.",
    SINGLE_CANDIDATE: visibleCount > 0
      ? "Für deinen Wunsch haben wir gerade einen Vorschlag."
      : "Der bisher gefundene Ort passt leider nicht zu deinem Wunsch.",
    CANDIDATE_WINDOW_LIMITED: "Einige Orte passen nicht zu deinem Wunsch und werden deshalb nicht gezeigt.",
    REQUEST_NEEDS_CLARIFICATION: "Ergänze bitte ein Budget pro Person, zum Beispiel bis 40 CHF. So können wir die Preise zu deinem Wunsch prüfen.",
    MULTI_PLACE_SEARCH_UNSUPPORTED: "Kaffee holen und einen Spaziergang können wir noch nicht als Ausflug mit mehreren Orten planen. Suche die beiden Schritte einzeln.",
    REQUEST_REQUIREMENT_UNSUPPORTED: "Einen Teil deines Wunsches können wir noch nicht zuverlässig prüfen. Das bedeutet nicht, dass es keinen passenden Ort gibt.",
    CORE_INTENT_REQUIRES_CLARIFICATION: "Wir haben deinen Wunsch noch nicht ganz verstanden. Beschreibe kurz, was du machen möchtest.",
  };
  return [...new Set(limitations.map((code) => labels[code] ?? "Bei dieser Auswahl gibt es noch offene Fragen. Prüfe wichtige Details vor deinem Besuch."))];
}

export function wohinFollowUp(response: Pick<DecisionProductResponse, "limitations" | "candidates">) {
  const limitations = response.limitations;
  if (limitations.includes("NO_CATALOG_CANDIDATES")) {
    return {
      message: "Für den gewünschten Ort sind noch keine Spots oder Veranstaltungen erfasst. Wenn du örtlich flexibel bist, kannst du einen anderen Ort suchen.",
      actionLabel: "Ort ändern",
      explainedLimitation: "NO_CATALOG_CANDIDATES",
    };
  }
  if (limitations.includes("MULTI_PLACE_SEARCH_UNSUPPORTED")) {
    return {
      message: "Wir können diese Schritte noch nicht als gemeinsamen Ausflug suchen. Mit welchem möchtest du anfangen?",
      actionLabel: "Ersten Schritt eingeben",
      explainedLimitation: "MULTI_PLACE_SEARCH_UNSUPPORTED",
    };
  }
  if (limitations.includes("REQUEST_NEEDS_CLARIFICATION") || limitations.includes("CORE_INTENT_REQUIRES_CLARIFICATION")) {
    const needsBudget = limitations.includes("REQUEST_NEEDS_CLARIFICATION");
    return {
      message: needsBudget
        ? "Welches Budget pro Person passt für dich? Ergänze zum Beispiel «bis 40 CHF pro Person»."
        : "Was möchtest du am liebsten machen? Ein kurzer Zusatz zu deinem Wunsch genügt.",
      actionLabel: "Wunsch ergänzen",
      explainedLimitation: needsBudget ? "REQUEST_NEEDS_CLARIFICATION" : "CORE_INTENT_REQUIRES_CLARIFICATION",
    };
  }
  const unsupported = limitations.includes("REQUEST_REQUIREMENT_UNSUPPORTED");
  const unverified = response.candidates.some((candidate) => !candidate.contextualReject
    && candidate.failedHardConstraints.length === 0 && candidate.unknownHardConstraints.length > 0);
  if (unsupported || unverified) {
    return {
      message: "Eine wichtige Bedingung können wir mit unseren Spotdaten nicht bestätigen. Du kannst die Suche bewusst auf Orte zum Abklären eingrenzen und die Bedingung dort direkt prüfen.",
      actionLabel: "Suchwunsch bearbeiten",
      explainedLimitation: unsupported ? "REQUEST_REQUIREMENT_UNSUPPORTED" : null,
    };
  }
  return {
    message: "Für diesen Wunsch gibt es gerade keinen ausreichend belegten Vorschlag. Wenn du beim Zeitpunkt oder Ort flexibel bist, ergänze das in deiner Suche.",
    actionLabel: "Suche anpassen",
    explainedLimitation: null,
  };
}


export function wohinClarificationQuery(original: string, question: string, answer: string): string | null {
  const reply = answer.trim();
  if (!reply) return null;
  const query = [original.trim(), `Rückfrage: ${question}`, `Antwort: ${reply}`].join("\n");
  return query.length <= 2_000 ? query : null;
}
