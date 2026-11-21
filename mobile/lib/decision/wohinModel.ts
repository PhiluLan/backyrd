import type { DecisionProductCandidate, DecisionProductRequest, DecisionProductResponse } from "../../packages/product-decision-contract/src/index.mjs";

const MAX_VISIBLE_CANDIDATES = 5;

const discoveryDirections = [
  { label: "Clubs", query: "Ich möchte nachts in einen Club",
    request: /\b(?:club|clubs|nachtclub|disco|diskothek)\b|tanzen gehen/iu,
    category: /\b(?:club|clubs|nachtclub|disco|diskothek|nightlife|nachtleben)\b/iu, terms: ["Club", "Disco", "Nachtleben"] },
  { label: "Asiatisch essen", query: "Ich möchte asiatisch essen gehen",
    request: /\b(?:teriyaki|teryaki|sushi|ramen|asiatisch(?:es)?|japanisch(?:es)?|thailändisch(?:es)?|vietnamesisch(?:es)?|koreanisch(?:es)?|chinesisch(?:es)?)\b/iu,
    category: /asiatisch|japan|sushi|ramen|thai|vietnam|korea|chinesisch|chinese|asian/iu, terms: ["Asiatisch", "Japan", "Sushi", "Ramen", "Thai", "Vietnam", "Korea", "Chinesisch", "Asian"] },
  { label: "Cafés", query: "Ich möchte in ein Café gehen",
    request: /caf[eé]|\bkaffee\b/iu, category: /caf[eé]|coffee.daytime|kaffee/iu, terms: ["Café", "Kaffee"] },
  { label: "Bars", query: "Ich möchte etwas trinken gehen",
    request: /\b(?:bar|bars|cocktails?|bier|wein|pub|drinks?|trinken)\b/iu, category: /\b(?:bar|bars|pub|drinks|cocktailbar|weinbar|biergarten)\b/iu, terms: ["Bar", "Pub"] },
  { label: "Essen", query: "Ich möchte etwas essen gehen",
    request: /\b(?:essen|restaurant|pizzeria|pizza|mittagessen|abendessen|brunch)\b/iu, category: /restaurant|bistro|brasserie|pizzeria|\beat\b/iu, terms: ["Restaurant", "Bistro", "Pizzeria"] },
  { label: "Kultur", query: "Ich möchte etwas Kulturelles unternehmen",
    request: /museum|ausstellung|theater|kultur|galerie/iu, category: /museum|ausstellung|theater|kultur|galerie|culture/iu, terms: ["Museum", "Theater", "Galerie", "Kultur"] },
  { label: "Familie", query: "Ich suche etwas für einen Familienausflug",
    request: /spielplatz|\bzoo\b|familienausflug|familienaktivität/iu, category: /spielplatz|\bzoo\b|familie/iu, terms: ["Spielplatz", "Zoo", "Familie"] },
  { label: "Draussen", query: "Ich möchte etwas draussen unternehmen",
    request: /\b(?:park|wandern|spazieren|draussen|draußen)\b/iu, category: /\bpark\b|natur|outdoor|wandern/iu, terms: ["Park", "Natur", "Outdoor"] },
  { label: "Sport", query: "Ich möchte Sport machen",
    request: /\b(?:sport|bouldern|klettern|fitness|schwimmen)\b/iu, category: /sport|boulder|kletter|fitness|schwimm/iu, terms: ["Sport", "Boulder", "Klettern", "Schwimmen"] },
] as const;

export function wohinDiscoveryDirections(query: string) {
  const userText = query.normalize("NFKC")
    .replace(/\s+Rückfrage:\s*[\s\S]*?\s+Antwort:\s*/gu, " ")
    .replace(/\s+Ergänzung:\s*/gu, " ");
  const matches = discoveryDirections.filter(direction => direction.request.test(userText)
    && (direction.label !== "Clubs" || !/\b(?:kein(?:e[nmrs]?)?|ohne)\s+(?:einen?\s+)?(?:club|clubs|nachtclub|disco|diskothek)\b/iu.test(userText)));
  return matches.some(direction => direction.label === "Asiatisch essen")
    ? matches.filter(direction => direction.label !== "Essen") : matches;
}

export function wohinIsDiscoveryPlaceholder(query: string): boolean {
  return /^xyz[.!?]*$/iu.test(query.normalize("NFKC").trim());
}

export function wohinDiscoveryCategories() {
  return discoveryDirections.filter(direction => ["Essen", "Cafés", "Clubs", "Kultur", "Draussen", "Sport"].includes(direction.label));
}

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
  "librarian-dinner-cuisine-unconfirmed", "librarian-provisional-visit",
  "librarian-confirmed-weather-branch", "librarian-departure-time-unconfirmed", "librarian-pizza-budget-unconfirmed",
]);

export function visibleWohinCandidates(response: Pick<DecisionProductResponse, "candidates" | "primaryCandidateId" | "clarification">): DecisionProductCandidate[] {
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
    && !candidate.contextualReject && candidate.actualAvailability !== "closed" && !candidate.failedHardConstraints.length
    && candidate.reasons.some(reason => provisionalVisitReasons.has(reason.code)
      || Boolean(response.clarification) && reason.code === "librarian-provisional-nearby")).slice(0, MAX_VISIBLE_CANDIDATES);
}

export function wohinAvailability(candidate: DecisionProductCandidate): string {
  const requestedDay = candidate.reasons.find((reason) => ["requested-day-opening-hours", "requested-day-closed", "requested-day-opening-unknown"].includes(reason.code));
  if (requestedDay?.code === "requested-day-opening-hours") return requestedDay.statement;
  if (requestedDay?.code === "requested-day-closed") return "Am gewünschten Tag geschlossen";
  if (requestedDay?.code === "requested-day-opening-unknown") return "Für deinen geplanten Tag fehlen uns noch die Öffnungszeiten";
  if (candidate.reasons.some(reason => reason.code === "librarian-visit-time-unconfirmed")) return "Ob du zur gewünschten Zeit vorbeikommen und das Angebot nutzen kannst, ist noch offen.";
  const value = candidate.actualAvailability;
  if (value === "open") return "Zur gewünschten Besuchszeit laut Angaben geöffnet";
  if (value === "closed") return "Zur gewünschten Besuchszeit laut Angaben geschlossen";
  if (value === "not_requested") return "Öffnungszeiten vor Besuch prüfen";
  return "Die Öffnungszeiten kennen wir noch nicht";
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

const provisionalCopy = new Map<string, (statement: string) => string>([
  ["librarian-dinner-cuisine-unconfirmed", statement => statement.includes("Preisniveau")
    ? "Hier kannst du zu Abend essen. Ob Küche und Preise zu deinem Plan passen, ist noch offen."
    : "Hier kannst du zu Abend essen. Ob dir die Küche zusagt, ist noch offen."],
  ["librarian-pizza-budget-unconfirmed", () => "Hier gibt’s Pizza. Ob’s für euch alle im Budget bleibt, müsstest du kurz prüfen."],
  ["librarian-departure-time-unconfirmed", statement => statement.includes("Speise")
    ? "Der Ort ist in der Nähe. Schau kurz, ob der Weg in deine Zeit passt und es dort das gibt, was du essen möchtest."
    : "Der Ort ist in der Nähe. Schau kurz, ob dir die Zeit für den Weg und den Besuch reicht."],
  ["librarian-provisional-nearby", () => "Der Ort liegt in der Nähe. Ob ihr dort das machen könnt, was ihr vorhabt, ist noch offen."],
]);
const cardDetails = new Map([
  ["Cocktails", "Hier gibt’s Cocktails."],
  ["WLAN", "Hier gibt’s WLAN."],
  ["ein stufenloser Zugang", "Hier kommst du stufenlos rein."],
  ["eine ruhige Atmosphäre", "Hier ist es ruhig."],
  ["ein Bereich drinnen", "Hier könnt ihr drinnen bleiben."],
  ["ein Bereich draussen", "Hier könnt ihr draussen bleiben."],
  ["eine Terrasse", "Hier kannst du auf der Terrasse sitzen."],
  ["Kaffee", "Hier gibt’s Kaffee."],
  ["ein Spielplatz", "Hier können die Kinder auf den Spielplatz."],
  ["Regenschutz", "Hier findet ihr bei Regen Schutz."],
  ["vegetarische Gerichte", "Hier gibt’s vegetarische Gerichte."],
  ["vegane Gerichte", "Hier gibt’s vegane Gerichte."],
]);
const cardQuestions = new Map([
  ["die gewünschte Besuchszeit", "Schau vor dem Losgehen kurz nach, ob du zur gewünschten Zeit vorbeikannst."],
  ["die gewünschte Zugänglichkeit", "Frag am besten kurz nach, ob du dort gut reinkommst."],
  ["ein stufenloser Zugang", "Ob du stufenlos reinkommst, ist noch offen."],
  ["die gewünschte Ernährung", "Frag vor dem Besuch nach, ob es für dich etwas Passendes gibt."],
  ["die gewünschte Reservationsregel", "Frag am besten kurz nach, ob du reservieren musst."],
  ["die gewünschte Teilnahme ohne Voranmeldung", "Ob du einfach vorbeikommen kannst, ist noch offen."],
  ["dein Budget", "Ob die Preise für dich passen, ist noch offen."],
  ["der gewünschte Ort", "Schau kurz auf die Karte, ob dir die Lage passt."],
  ["die gewünschte Weglänge", "Schau vor dem Losgehen kurz nach, ob die Strecke für dich passt."],
  ["Regenschutz", "Ob ihr bei Regen Schutz findet, ist noch offen."],
  ["die gewünschte Wettereignung", "Wie gut der Ort bei diesem Wetter passt, ist noch offen."],
  ["die gewünschte Musiksituation", "Ob dann Musik läuft, wissen wir noch nicht."],
  ["die Besuchsbedingungen", "Frag am besten kurz nach, ob ihr so vorbeikommen könnt."],
  ["die Grösse des Lokals", "Wie gross das Lokal ist, wissen wir noch nicht."],
  ["Cocktails", "Ob es Cocktails gibt, ist noch offen."],
  ["eine ruhige Atmosphäre", "Wie ruhig es bei deinem Besuch ist, wissen wir noch nicht."],
  ["WLAN", "Ob es WLAN gibt, wissen wir noch nicht."],
  ["die gewünschte Atmosphäre", "Wie es sich vor Ort anfühlt, ist noch offen."],
]);

/** Describe the match using public, confirmed evidence for this candidate. */
export function wohinRecommendation(
  candidate: DecisionProductCandidate,
  interpretation?: DecisionProductResponse["interpretation"],
  includeCaveat = true,
): string {
  const provisional = candidate.reasons.find(reason =>
    provisionalVisitReasons.has(reason.code) || reason.code === "librarian-provisional-nearby");
  if (candidate.tier === "UNCONFIRMED_FALLBACK" && provisional && provisional.code !== "librarian-provisional-visit") {
    const friendly = provisionalCopy.get(provisional.code);
    return friendly?.(provisional.statement) ?? provisional.statement;
  }

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

  const confirmed = [...cardDetails].find(([label]) => facts.has(`Bestätigt: ${label}.`))?.[1];
  const unanswered = candidate.reasons.filter(reason => !reason.confirmed && reason.domain === "LIMITATION");
  const unknownTime = candidate.actualAvailability === "unknown" || unanswered.some(reason => reason.code === "librarian-visit-time-unconfirmed");
  const openQuestion = unknownTime && !candidate.presentation?.event
    ? cardQuestions.get("die gewünschte Besuchszeit")
    : [...cardQuestions].find(([label]) => unanswered.some(reason =>
      reason.statement === `Noch nicht bestätigt: ${label}.`
      || reason.statement === `Diesen Wunsch können wir noch nicht zuverlässig prüfen: ${label}.`))?.[1];
  const caveat = openQuestion ?? (provisional?.code === "librarian-provisional-visit" || unanswered.some(reason =>
    reason.statement.startsWith("Noch nicht bestätigt:") || reason.statement.startsWith("Diesen Wunsch können wir noch nicht zuverlässig prüfen:"))
    ? "Ein Punkt ist noch offen. Frag vor dem Besuch am besten direkt nach." : undefined);
  const withCaveat = (sentence: string) => includeCaveat && caveat ? `${sentence} ${caveat}` : sentence;

  if (confirmed) {
    const drinks = confirmed === cardDetails.get("Cocktails");
    return withCaveat(drinks && evening ? "Hier bekommst du abends Cocktails." : confirmed);
  }
  if (world.some(reason => reason.code === "librarian-pizza-offer-confirmed")) return withCaveat("Hier gibt’s Pizza, wie du sie gesucht hast.");
  if (specificOffer) return withCaveat(`Hier gibt’s ${specificOffer}.`);
  if (facts.has("Bestätigt: die Essensmöglichkeit.")) {
    const smallVenue = facts.has("Bestätigt: ein kleines Lokal.");
    const setting = smallVenue ? ` in einem kleinen${atmosphere ? `, ${atmosphere}en` : ""} Lokal` : atmosphere ? ` ${atmosphere}` : "";
    return withCaveat(`Hier kannst du${evening ? " am gewünschten Abend" : ""}${setting} essen gehen.`);
  }
  if (facts.has("Bestätigt: Getränke vor Ort.")) {
    return withCaveat(evening ? "Hier kannst du abends etwas trinken gehen." : "Hier kannst du etwas trinken gehen.");
  }
  if (facts.has("Bestätigt: die Getränkeauswahl.")) return withCaveat("Hier bekommst du ein Getränk, das zu deiner Suche passt.");
  if (atmosphere) return withCaveat(`Die Atmosphäre hier ist ${atmosphere}.`);
  if (hasAtmosphere) return withCaveat("Die Stimmung hier passt zu dem, was du suchst.");
  if (facts.has("Bestätigt: die gewünschte Aktivität.")) return withCaveat("Das kannst du hier machen.");
  if (candidate.presentation?.event) {
    return candidate.coreIntentCoverage === "CONFIRMED"
      ? "Die Veranstaltung passt zu dem, was du suchst. Den Termin findest du oben."
      : "Schau dir den Termin und das Programm an. Ob es zu deinem Wunsch passt, ist noch offen.";
  }
  const clearlyMatched = candidate.coreIntentCoverage === "CONFIRMED" && world.some(reason =>
    ["core-intent-confirmed", "primary-purpose-confirmed"].includes(reason.code) || reason.statement === "Bestätigt: die gewünschte Art des Angebots.");
  if (clearlyMatched) return withCaveat("Das Angebot hier passt zu deinem Plan.");
  if (caveat) return caveat;
  return "Zu diesem Ort fehlen uns noch Angaben für deinen Wunsch.";
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
    if (reason.code.startsWith("LBR:") && /^(Noch nicht bestätigt:|Nicht passend:|Ein ausdrücklich ausgeschlossener Inhalt|Diesen Wunsch können wir|Welches Budget)/.test(reason.statement)) {
      const label = reason.statement.replace(/^(?:Noch nicht bestätigt: |Diesen Wunsch können wir noch nicht zuverlässig prüfen: )(.+)\.$/u, "$1");
      if (label === "dieser Teil deines Wunsches") return ["Uns fehlen Angaben, um deinen ganzen Wunsch zu prüfen. Welche Einzelheit offen ist, können wir dir hier leider noch nicht genauer sagen."];
      return [cardQuestions.get(label) ?? librarianNotes[reason.statement] ?? reason.statement];
    }
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
      message: "Ich bin bei deinem Wunsch noch unsicher. Beschreibe kurz, was du erleben möchtest – zum Beispiel gemütlich etwas trinken oder mit deinem Kind etwas unternehmen.",
      actionLabel: "Suchwunsch bearbeiten",
      explainedLimitation: unsupported ? "REQUEST_REQUIREMENT_UNSUPPORTED" : null,
    };
  }
  return {
    message: "Für deinen Plan haben wir gerade keinen passenden Ort gefunden. Ginge für dich auch ein anderer Ort oder eine andere Zeit?",
    actionLabel: "Suche anpassen",
    explainedLimitation: null,
  };
}


export function wohinMessageKind(message: string, currentWish = ""): "OFF_TOPIC" | "NEW_PLAN" | "REFINEMENT" {
  const text = message.normalize("NFKC").trim();
  const explainer = /^(?:bitte\s+)?(?:erklär(?:e)?(?:\s+mir)?|was\s+(?:ist|sind)|wie\s+funktioniert)\s+/iu;
  const unrelatedTopic = /(?:quantenphysik|relativitätstheorie|quantenmechanik|binomische formeln|photosynthese)/iu;
  const placeContext = /(?:museum|ausstellung|workshop|führung|vortrag|veranstaltung|lernort|kurs)/iu;
  const unrelatedTask = /\b(?:excel[- ]formel|ins? (?:französische|englische|italienische) übersetzen|auf (?:französisch|englisch|italienisch) übersetzen|betreff für ein(?:e)? (?:e-?mail|nachricht))\b/iu;
  const generalKnowledge = /\b(?:unterschied zwischen brutto- und nettolohn)\b/iu;
  if (!placeContext.test(text) && ((explainer.test(text) && unrelatedTopic.test(text))
    || unrelatedTask.test(text) || generalKnowledge.test(text))) return "OFF_TOPIC";

  if (!currentWish) return "REFINEMENT";
  const newRequest = /^(?:(?:aber|und)\s+)?(?:eine neue suche|neuer plan|anderes thema|andere baustelle)\b/iu;
  const switchesTopic = /\bfällt aus[.!?]\s+\S|\b(?:verschiebe|verschieben)\b[^.!?]*[.!?]\s+(?:am |für |morgen|heute)/iu;
  if (newRequest.test(text) || switchesTopic.test(text)) return "NEW_PLAN";

  const day = /\b(?:übermorgen|morgen|heute|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|wochenende)\b/iu;
  const newDay = text.match(day)?.[0].toLowerCase();
  const existingDay = currentWish.match(day)?.[0].toLowerCase();
  const separateWish = /\b(?:möchte(?:n)?|will|suche(?:n)?|hätte(?:n)? gerne|hast du ideen)\b/iu;
  const ownActivity = /\b(?:essen|trinken|wandern|schwimmen|tanzen|erleben|unternehmen|aktivität(?:en)?|ausflug|museum|restaurant|café|kino|spielplatz|konzert)\b/iu;
  const correction = /^(?:(?:aber|und)\s+)?(?:doch|lieber|stattdessen|ich meinte|eigentlich)\b|\bstatt (?:heute|morgen)\b/iu;
  if (newDay && newDay !== existingDay && separateWish.test(text) && ownActivity.test(text) && !correction.test(text)) {
    return "NEW_PLAN";
  }
  return "REFINEMENT";
}

export const wohinOffTopicMessage =
  "Ich helfe dir, einen Ort für deinen nächsten Moment zu finden. Erzähl mir, was du erleben möchtest – auch eine erste Idee reicht.";

export function wohinClarificationQuery(original: string, question: string | null, answer: string): string | null {
  const reply = answer.trim();
  if (!reply) return null;
  const query = [original.trim(), question ? `Rückfrage: ${question}\nAntwort: ${reply}` : `Ergänzung: ${reply}`].join("\n");
  return query.length <= 2_000 ? query : null;
}
