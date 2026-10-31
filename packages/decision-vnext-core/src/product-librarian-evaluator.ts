import { requiredRequestIssue } from "./product-librarian-plan.js";
import { decodeWorldQueryConstraint } from "./product-query-semantics.js";
import { PRODUCT_LIBRARIAN_EVALUATOR_VERSION, PRODUCT_EVENT_LIBRARIAN_EVALUATOR_VERSION, librarianMandatoryEvidenceSatisfied } from "./product-librarian-language.js";
import { projectDecisionEventOccurrences } from "./product-event-candidates.js";
import { ACCEPTED_SOURCE_POLICY, REGISTRY_HASH, REGISTRY_VERSION, librarianConcept, parseExperienceProfile } from "@backyrd/world-knowledge-core";
import type { RelevantUserProjection } from "@backyrd/user-intelligence-vnext-core";
import { contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { prepareLibrarianRequest, LUNA_LIBRARIAN_CONTRACT_VERSION, type LibrarianRequest, type LibrarianFact, type LunaExpression } from "./product-luna-librarian.js";
import { searchLibrarianCatalogWithWorlds, type LibrarianCandidate, type LibrarianFactAssessment } from "./product-librarian-matching.js";
import { type ProductWorldView } from "./product-world-resolver-binding.js";
import { evaluateProductWorldViews, userTasteMatches } from "./product-v1-evaluator.js";
import { DECISION_PRODUCT_EVALUATION_POLICY, DECISION_PRODUCT_EVALUATION_RELEASE, DECISION_PRODUCT_INTENT_POLICY } from "./product-v1-authority.js";
import { DecisionProductContextSchema, DecisionProductCandidateAssessmentSchema, DecisionProductEvaluationSchema, DecisionProductPresentationSchema, DecisionProductWorldCohortSchema, PRODUCT_DECISION_VERSIONS, type DecisionProductContext, type DecisionProductRequest } from "./product-v1-contracts.js";

export { PRODUCT_LIBRARIAN_EVALUATOR_VERSION, PRODUCT_EVENT_LIBRARIAN_EVALUATOR_VERSION } from "./product-librarian-language.js";
const cityKey = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();

export function canonicalLibrarianCity(city: string): string {
  const canonical = cityKey(city) === "zurich" ? "Zurich" : city;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(canonical)) throw new Error("product_target_area_invalid");
  return canonical;
}

/** A typed destination, never a second reading of the original sentence. */
export function librarianTargetCity(request: DecisionProductRequest, meaning: LibrarianRequest): string {
  const destinations = meaning.facts.filter(f => f.key === "location.destination" && f.modality === "REQUIRED" && f.value.kind === "TEXT")
    .map(f => f.value.kind === "TEXT" ? f.value.text : "");
  const choices = [...new Map(destinations.map(c => [cityKey(c), c])).values()];
  // The deployed context RPC currently authorizes one city per request. A
  // cross-city alternative is not flattened into the first city in its list.
  if (choices.length > 1) throw new Error("product_librarian_multiple_cities_unavailable");
  const city = request.explicit.targetCity ?? choices[0];
  if (!city) throw new Error("product_target_area_required");
  if (choices.length && cityKey(city) !== cityKey(choices[0]!)) throw new Error("product_librarian_explicit_city_mismatch");
  return canonicalLibrarianCity(city);
}

/** Display/learning context only. Matching below receives the entire plan;
 * these bounded legacy metadata fields never become its input. */
function contextFor(request: DecisionProductRequest, meaning: LibrarianRequest, city: string): DecisionProductContext {
  const active = meaning.facts.filter(f => !["EXCLUDED", "NOT_REQUIRED", "PREFERRED"].includes(f.modality));
  const dates = [...new Set(active.flatMap(f => f.value.kind === "DATE" && f.value.operator === "EQ" ? [f.value.date] : []))];
  const phases = [...new Set(active.flatMap(f => f.value.kind === "DAY_PHASE" ? [f.value.phase] : []))];
  const counts = active.flatMap(f => f.key === "people.count" && f.value.kind === "COUNT" && f.value.operator === "EQ" ? [f.value.amount] : []);
  const ages = active.flatMap(f => f.key === "people.age" && f.value.kind === "AGE" && f.value.operator === "EQ" ? [f.value.amount] : []);
  const amounts = active.flatMap(f => ["budget.maximum", "budget.amount", "budget.target"].includes(f.key) && f.value.kind === "MONEY" && f.value.currency === "CHF" && Number.isInteger(f.value.amount) ? [f.value.amount] : []);
  const moods = meaning.facts.flatMap(f => f.key === "atmosphere.character" && f.value.kind === "TEXT" && f.modality !== "EXCLUDED" ? [librarianConcept(f.value.text)].filter((v): v is string => v !== null) : []);
  return deepFreeze(DecisionProductContextSchema.parse(withContentHash({
    contractVersion: PRODUCT_DECISION_VERSIONS.context, resolverVersion: "decision-vnext-librarian-context-v1",
    inputHash: contentHash({ requestHash: contentHash(request), meaningHash: meaning.requestHash }),
    primaryIntent: null, secondaryIntent: null, intentCompatibility: "NOT_APPLICABLE", occasion: request.explicit.occasion ?? null,
    moods: [...new Set(moods)].slice(0, 12), targetCity: city,
    dateTime: { state: dates.length === 1 ? "KNOWN" : "UNKNOWN", localDate: dates.length === 1 ? dates[0]! : null, dayPhase: phases.length === 1 ? phases[0]! : null, timeZone: meaning.source.reference.timezone },
    group: { size: counts.length === 1 ? counts[0]! : null, minimumAge: ages.length ? Math.min(...ages) : null, adultPresent: ages.some(age => age >= 18), companionType: request.explicit.group?.companionType ?? null },
    budget: { state: amounts.length === 1 ? "KNOWN" : "UNKNOWN", amount: amounts.length === 1 ? amounts[0]! : null, currency: amounts.length === 1 ? "CHF" : null, perPerson: active.some(f => f.value.kind === "BUDGET_SCOPE" && f.value.scope === "PER_PERSON"), calibrationLabel: null },
    stayDuration: request.explicit.stayDuration ?? null, hardConstraints: [], softPreferences: [], unresolvedTerms: [],
    locationAuthority: { explicitTargetWins: true, authorizedCity: city, deviceCityUsed: false, state: "KNOWN" },
    limitations: ["DISPLAY_CONTEXT_IS_SUMMARY"], rawTextPersisted: false,
  }, "interpretationHash")));
}
const familyLabels: Readonly<Record<string, string>> = {
  "experience.activity": "die gewünschte Aktivität", "offer.kind": "die gewünschte Art des Angebots",
  "food.meal": "die Essensmöglichkeit", "food.drink": "die Getränkeauswahl", "food.diet": "die gewünschte Ernährung",
  "offer.feature": "die gewünschte Ausstattung", "offer.facility": "die gewünschte Einrichtung",
  "time.duration": "die gewünschte Aktivitätsdauer", "route.length": "die gewünschte Weglänge",
  "food.dish": "die gewünschte Speise", "food.cuisine": "die Küche", "offer.area": "der gewünschte Bereich",
  "atmosphere.character": "die gewünschte Atmosphäre", "atmosphere.music": "die gewünschte Musiksituation",
  "atmosphere.noise": "der gewünschte Geräuschpegel", "location.destination": "der gewünschte Ort",
  "participation.accessibility": "die gewünschte Zugänglichkeit",
  "participation.booking": "die gewünschte Reservationsregel", "participation.entry_mode": "die gewünschte Teilnahme ohne Voranmeldung",
  "eligibility": "die Besuchsbedingungen", "binding": "die Kombination deiner Wünsche",
};
const duty = (f: LibrarianFactAssessment) => f.modality === "REQUIRED" || f.modality === "EXCLUDED";
const codes = (values: readonly string[]) => values.length <= 30 ? values : [...values.slice(0, 29), "ADDITIONAL_LIBRARIAN_REQUIREMENTS"];
const factCode = (f: LibrarianFactAssessment) => `LBR:${contentHash({ id: f.factId, family: f.family }).slice(0, 24)}`;

function assessment(candidate: LibrarianCandidate, world: ProductWorldView, context: DecisionProductContext, request: DecisionProductRequest, projection: RelevantUserProjection, hasVisitEvidence: boolean, meaning: LibrarianRequest) {
  const hard = candidate.facts.filter(duty);
  const rejected = request.rejectedCandidateIds.includes(candidate.spotId);
  const codeForId = (id: string) => {
    const fact = candidate.facts.find(f => f.factId === id);
    return fact ? factCode(fact) : `LBR:${contentHash(id).slice(0,24)}`;
  };
  const confirmed = hard.filter(f => f.state === "MET" && !candidate.unknownFactIds.includes(f.factId) && !candidate.failedFactIds.includes(f.factId)).map(factCode);
  const unknown = [...new Set(candidate.unknownFactIds.map(codeForId))];
  const failed = [...new Set(candidate.failedFactIds.map(codeForId))];
  if (candidate.status === "PARTIAL" && !unknown.length) unknown.push("LIBRARIAN_VISIT_NOT_FULLY_PROVEN");
  if (!hasVisitEvidence) unknown.push("LIBRARIAN_CORE_NOT_PROVEN");
  if (candidate.status === "INELIGIBLE" && !failed.length) failed.push("LIBRARIAN_VISIT_CONTRADICTED");
  // Independently reject an inconsistent matcher admission before projection.
  const obligationsProven = candidate.conditionalPlans.length
    ? candidate.conditionalPlans.every(plan => plan.status === "CONFIRMED" && librarianMandatoryEvidenceSatisfied(plan.facts))
    : librarianMandatoryEvidenceSatisfied(candidate.facts);
  const coverage = hasVisitEvidence && obligationsProven && !unknown.length && !failed.length ? "CONFIRMED" : "UNKNOWN";
  const proofHashes = new Set(candidate.facts.flatMap(f => f.evidenceHashes));
  const core = { intentId: null, state: coverage, mappingIds: ["lossless-luna-plan"], worldFactKeys: world.facts.filter(f => proofHashes.has(f.entryHash)).map(f => f.key).slice(0,20), evidenceSourceHash: candidate.candidateHash };
  const contextual = (state: "CONFIRMED" | "NOT_APPLICABLE") => ({ state, mappingIds: [], evidenceSourceHash: candidate.candidateHash });
  const semanticKey = (id: string) => {
    const f = meaning.facts.find(f => f.id === id);
    if (!f) return contentHash({ family: candidate.facts.find(f => f.factId === id)?.family, id });
    const value = f.value.kind === "TEXT" ? librarianConcept(f.value.text) ?? f.value.text.trim().toLowerCase() : f.value;
    // Repeated meal/activity aliases express one wish, not two ranking votes.
    const family = ["experience.activity", "food.meal"].includes(f.key) && ["meal", "lunch", "dinner", "breakfast"].includes(String(value)) ? "meal" : f.key;
    return contentHash({ family, value, subjects: [...f.subjectIds].sort(), modality: f.modality });
  };
  const reasons = candidate.facts.filter(f => !["CONTEXT", "NOT_REQUIRED"].includes(f.state)).slice(0, 50).map(f => {
    const proven = f.state === "MET";
    const label = familyLabels[f.family] ?? (f.family.startsWith("budget.") ? "dein Budget" : f.family.startsWith("time.") ? "die gewünschte Besuchszeit" : "dieser Teil deines Wunsches");
    return { reasonCode: proven ? `LBR_EVIDENCE:${semanticKey(f.factId)}` : factCode(f), domain: proven ? "WORLD" : "LIMITATION", sourceHash: contentHash({ candidateHash: candidate.candidateHash, fact: f }),
      statementDe: proven ? f.reason === "BOOKING_RECOMMENDED_NOT_MANDATORY" ? "Eine Reservation ist empfohlen, aber nicht vorgeschrieben. Freie Plätze sind nicht bestätigt." : f.reason === "SCOPED_PRICE_RANGE_BUDGET_CONFIRMED" ? "Dein Budget passt zur hinterlegten Preisspanne." : `Bestätigt: ${label}.` : f.state === "FAILED" ? f.modality === "EXCLUDED" ? "Ein ausdrücklich ausgeschlossener Inhalt ist hier vorhanden." : `Nicht passend: ${label}.` : f.diagnosis === "UNSUPPORTED_REQUIREMENT" ? `Diesen Wunsch können wir noch nicht zuverlässig prüfen: ${label}.` : f.diagnosis === "REQUEST_NEEDS_CLARIFICATION" ? "Welches Budget pro Person passt für dich?" : `Noch nicht bestätigt: ${label}.`,
      confirmed: proven };
  });
  if (candidate.facts.some(f => f.reason === "DOCUMENTED_WHEELCHAIR_ACCESS_DETAILS")) {
    const labels: Readonly<Record<string, string>> = {
      "accessibility.accessible_indoor": "Innenbereich", "accessibility.accessible_outdoor": "Aussenbereich",
      "accessibility.accessible_seating": "Sitzplätze", "accessibility.accessible_toilet": "WC",
      "accessibility.step_free_entrance": "stufenloser Eingang", "accessibility.wheelchair_paths": "rollstuhlgängige Wege",
    };
    // This is the deterministic public accessibility assessment, using the
    // dedicated ACCESSIBILITY permission, not unrestricted generated copy.
    const rows = world.facts.filter(f => labels[f.key] && typeof f.value === "boolean"
      && f.authorizedUseCases?.includes("ACCESSIBILITY") && f.authorizedUseCases.includes("GENERAL_WORLD"));
    const yes = rows.filter(f => f.value === true).map(f => labels[f.key]);
    const no = rows.filter(f => f.value === false).map(f => labels[f.key]);
    if (rows.length) reasons.push({ reasonCode: "librarian-access-details", domain: "LIMITATION", sourceHash: contentHash(rows.map(f => f.entryHash)),
      statementDe: [yes.length ? `Als zugänglich erfasst: ${yes.join(", ")}.` : "", no.length ? `Als nicht vorhanden oder nicht zugänglich erfasst: ${no.join(", ")}.` : ""].filter(Boolean).join(" ").slice(0,500), confirmed: false });
  }
  const profileEntry = world.facts.find(f => f.key === "experience.profile" && f.authorizedUseCases?.includes("EXPLANATION"));
  const explanatoryProfile = profileEntry ? parseExperienceProfile(profileEntry.value) : null;
  if (profileEntry && candidate.offerIds.length) {
    const activityIds = new Set(candidate.facts.filter(f => f.state === "MET" && (["experience.activity", "offer.kind"].includes(f.family) || f.family.startsWith("food."))).flatMap(f => f.offerIds));
    const offers = explanatoryProfile!.offers.filter(o => activityIds.has(o.id));
    const conditional = candidate.conditionalPlans.length > 0 || candidate.status !== "CONFIRMED";
    if (offers.length) reasons.unshift({ reasonCode: "librarian-selected-offers", domain: conditional ? "LIMITATION" : "WORLD", sourceHash: contentHash({ entryHash: profileEntry.entryHash, offerIds: offers.map(o => o.id) }),
      statementDe: `${conditional ? "Mögliche Angebote" : "Passende Angebote"}: ${offers.map(o => o.name).join(", ")}`.slice(0,500), confirmed: !conditional });
  }
  if (!reasons.length) reasons.push({ reasonCode: "librarian-no-visit-evidence", domain: "LIMITATION", sourceHash: candidate.candidateHash, statementDe: "Für diesen Wunsch fehlen bestätigte Angaben zum passenden Angebot.", confirmed: false });
  const temporal = candidate.facts.filter(f => f.family.startsWith("time.") && !["CONTEXT", "PREFERRED", "NOT_REQUIRED"].includes(f.modality)
    && f.reason !== "UNDATED_DAYPART_NO_OPENING_CLAIM" && f.reason !== "RETAINED_AS_REQUEST_CONTEXT");
  const availability = temporal.length ? temporal.some(f => f.state === "FAILED") ? "closed" : temporal.every(f => f.state === "MET") ? "open" : "unknown" : "not_requested";
  if (temporal.some(f => f.reason === "VISIT_TIME_UNCONFIRMED")) reasons.push({reasonCode:"librarian-visit-time-unconfirmed",domain:"LIMITATION",sourceHash:candidate.candidateHash,statementDe:"Der Spot passt zu deinem Wunsch. Öffnungs- und Angebotszeiten für den gewünschten Besuch sind noch nicht bestätigt.",confirmed:false});
  // Inherited hours are an explicit product rule, not a separately researched
  // timetable or confirmation of a free slot / course admission.
  const inheritedOffers = explanatoryProfile?.offers.filter(o => candidate.offerIds.includes(o.id) && o.schedule.length === 0).map(o => o.id) ?? [];
  if (!world.eventOccurrence && availability === "open" && inheritedOffers.length)
    reasons.push({ reasonCode: "librarian-inherited-spot-hours", domain: "LIMITATION", sourceHash: contentHash({candidateHash:candidate.candidateHash,offerIds:inheritedOffers}), statementDe: "Für dieses Angebot gelten die allgemeinen Öffnungszeiten des Ortes, da keine eigenen Zeiten hinterlegt sind. Freie Plätze oder eine Teilnahme sind damit nicht garantiert.", confirmed: false });
  if (candidate.facts.some(f => f.reason === "SCOPED_GROUP_CAPACITY_CONFIRMED_NOT_A_BOOKING"))
    reasons.push({ reasonCode: "librarian-capacity-not-booking", domain: "LIMITATION", sourceHash: candidate.candidateHash, statementDe: "Die Gruppengrösse passt zum Angebot. Freie Plätze für einen konkreten Termin sind damit nicht bestätigt.", confirmed: false });
  const event = world.eventOccurrence;
  if (event) {
    if (!["PUBLISHED","SCHEDULED"].includes(event.eventStatus) || event.occurrenceStatus !== "SCHEDULED" || event.ticketStatus === "SOLD_OUT") failed.push("EVENT_NOT_SCHEDULED");
    reasons.unshift({reasonCode:"event-occurrence",domain:"WORLD",sourceHash:world.snapshotHash,statementDe:"Der Termin für diese Veranstaltung ist veröffentlicht.",confirmed:true});
    reasons.push({reasonCode:"event-ticket-availability",domain:"LIMITATION",sourceHash:world.snapshotHash,statementDe:"Ob du ein Ticket oder eine Anmeldung brauchst und noch teilnehmen kannst, bitte vorab prüfen.",confirmed:false});
  }
  const tastes = event ? [] : userTasteMatches(world, context, projection);
  return DecisionProductCandidateAssessmentSchema.parse(withContentHash({
    ...(event?.matchedSpotId ? {relatedSpotId:event.matchedSpotId}:{}),
    contractVersion: PRODUCT_DECISION_VERSIONS.assessment, candidateId: candidate.spotId, snapshotHash: candidate.snapshotHash,
    tier: rejected || failed.length ? "INELIGIBLE" : candidate.status === "CONFIRMED" && coverage === "CONFIRMED" ? "ELIGIBLE_CONFIRMED" : "UNCONFIRMED_FALLBACK",
    coreIntentCoverage: core, secondaryIntentCoverage: { ...core, state: "NOT_APPLICABLE" },
    worldClassification: { primaryVisitPurpose: null, primaryCategory: world.spot.classification.primaryCategory, placeTypes: world.spot.classification.placeTypes, evidenceSourceHash: world.snapshotHash },
    primaryVisitPurpose: contextual("NOT_APPLICABLE"), specificCoreClassification: { ...contextual("NOT_APPLICABLE"), state: coverage },
    onsiteOfferings: { ...contextual("NOT_APPLICABLE"), availableKinds: [], matchedKinds: [], relationships: [], confirmsCoreIntent: false },
    visitSituation: contextual("NOT_APPLICABLE"), atmosphere: contextual(candidate.facts.some(f => f.family.startsWith("atmosphere.") && f.state === "MET") ? "CONFIRMED" : "NOT_APPLICABLE"),
    typicalDaypart: contextual("NOT_APPLICABLE"), actualAvailability: { status: availability, evidenceSourceHash: candidate.candidateHash },
    confirmedHardConstraints: codes(confirmed), unknownHardConstraints: codes(unknown), failedHardConstraints: codes(failed),
    matchedSoftPreferences: codes([...new Set(candidate.matchedPreferences.map(id => `LBR_PREF:${semanticKey(id).slice(0, 24)}`))]), userTasteMatches: tastes,
    conflicts: world.conflicts.map(c => c.code), reasons, limitations: [...new Set([...candidate.limitations, ...(unknown.length ? ["HARD_CONSTRAINT_EVIDENCE_UNKNOWN"] : []), ...(candidate.facts.length > 50 ? ["DISPLAY_REASONS_SUMMARIZED"] : [])])].slice(0, 30),
    rejectionClass: rejected ? "SITUATIONAL_REJECT" : "NONE", userIntelligenceInvolved: tastes.length > 0, userIntelligenceAffectsEligibility: false,
    neutralTieBreakerHash: contentHash({ spotId: candidate.spotId }),
  }, "assessmentHash"));
}

function requiredInEveryAlternative(node: LunaExpression, meaning: LibrarianRequest, predicate: (fact: LibrarianFact) => boolean): boolean {
  if (node.kind === "FACT") return meaning.facts.some(f => f.id === node.factId && f.modality === "REQUIRED" && predicate(f));
  if (node.kind === "ALL") return node.children.some(child => requiredInEveryAlternative(child, meaning, predicate));
  if (node.kind === "IF") return node.else !== null && requiredInEveryAlternative(node.then, meaning, predicate) && requiredInEveryAlternative(node.else, meaning, predicate);
  if (node.kind === "ANY" && node.strength === "PREFERRED") return false;
  return (node.kind === "FALLBACK" ? node.options : node.children).every(child => requiredInEveryAlternative(child, meaning, predicate));
}

export function evaluateLibrarianProduct(input: {
  readonly request: DecisionProductRequest; readonly meaning: LibrarianRequest;
  readonly catalog: readonly unknown[]; readonly eventOccurrences?: unknown; readonly authority: { readonly authorizedCity: string; readonly serverTime: string };
  readonly projection: RelevantUserProjection;
  readonly onSearch?: (result: ReturnType<typeof searchLibrarianCatalogWithWorlds>["result"]) => void;
}) {
  const meaning = prepareLibrarianRequest({ contractVersion: LUNA_LIBRARIAN_CONTRACT_VERSION, output: input.meaning.raw, sourceText: input.meaning.source.sourceText, reference: input.meaning.source.reference });
  if (meaning.source.sourceText !== input.request.naturalLanguage || meaning.requestHash !== input.meaning.requestHash) throw new Error("product_librarian_source_binding_invalid");
  if (librarianTargetCity(input.request, meaning) !== input.authority.authorizedCity) throw new Error("product_librarian_city_binding_invalid");
  const eventViews = input.request.includeEvents === true ? projectDecisionEventOccurrences(input.eventOccurrences, input.authority.authorizedCity, input.authority.serverTime) : [];
  const { result, worlds } = searchLibrarianCatalogWithWorlds({ request: meaning, catalog: input.catalog, eventViews, authority: { city: input.authority.authorizedCity, now: input.authority.serverTime }, limit: 1500 });
  input.onSearch?.(result);
  const byId = new Map(worlds.map(w => [w.spot.spotId, w]));
  const ids = [...byId.keys()].sort();
  if (!ids.length) throw new Error("product_world_candidate_set_invalid");
  const candidateSetHash = contentHash(ids), context = contextFor(input.request, meaning, input.authority.authorizedCity);
  const cohort = DecisionProductWorldCohortSchema.parse(withContentHash({
    contractVersion: PRODUCT_DECISION_VERSIONS.cohort, cohortId: `product-world-${candidateSetHash.slice(0, 24)}`, source: "CANONICAL_WORLD_KNOWLEDGE_READER", generatedAt: input.authority.serverTime,
    authorizedCity: input.authority.authorizedCity, worldRegistryVersion: REGISTRY_VERSION, worldRegistryHash: REGISTRY_HASH,
    sourcePolicyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, sourcePolicyHash: ACCEPTED_SOURCE_POLICY.policyHash,
    ...(eventViews.length ? { eventBindings: eventViews.map(w => ({occurrenceId: w.eventOccurrence!.occurrenceId, snapshotHash:w.snapshotHash})) } : {}),
    spotBindings: worlds.filter(w => !w.eventOccurrence).map(w => ({ spotId: w.spot.spotId, snapshotHash: w.snapshotHash })).sort((a,b) => a.spotId.localeCompare(b.spotId)), candidateSetHash, limitations: [], commercialSignalsPresent: false, fixtureSourceUsed: false,
  }, "cohortHash"));
  const admitted = new Set(result.ranked.map(c => c.spotId));
  let candidates = [...result.ranked, ...result.excluded, ...result.unresolved].map(c => assessment(c, byId.get(c.spotId)!, context, input.request, input.projection, admitted.has(c.spotId), input.meaning));
  // Typed controls from older clients remain binding. This compatibility guard
  // reads explicit fields only, never re-parses the source or replaces Luna's
  // plan with the old facet language. Missing legacy evidence fails closed.
  const explicit = input.request.explicit;
  if (explicit.hardConstraints?.length || explicit.primaryIntent || explicit.dateTime || explicit.budget || explicit.group) {
    const uiBudget = explicit.budget;
    const scopedBudgetRetained = uiBudget?.state === "KNOWN" && requiredInEveryAlternative(meaning.logic, meaning, f =>
      f.key === "budget.maximum" && f.value.kind === "MONEY" && ["LTE", "EQ"].includes(f.value.operator)
      && f.value.amount === uiBudget.amount && f.value.currency === uiBudget.currency);
    // Explicit UI duties are binding too; never demote them by field family.
    const guardRequest = { ...input.request, naturalLanguage: " ", explicit };
    const guards = evaluateProductWorldViews(guardRequest, input.authority, input.projection, worlds, candidateSetHash).evaluation.candidates;
    candidates = candidates.map(c => {
      const guard = guards.find(g => g.candidateId === c.candidateId);
      if (!guard) return c;
      const { assessmentHash: _hash, ...body } = c;
      // This guard may not apply its implicit "today" to a future Luna visit.
      // Time eligibility belongs to Luna unless an older UI explicitly sets it.
      const uiRequestsTime = !!explicit.dateTime || explicit.hardConstraints?.some(code => ["OPEN_NOW", "OPEN_ON_REQUESTED_DAY"].includes(code));
      const applicableGuard = (code: string) => (code !== "ACTUAL_AVAILABILITY" || uiRequestsTime && !byId.get(c.candidateId)?.eventOccurrence)
        && (code !== "BUDGET_MAXIMUM" || !scopedBudgetRetained);
      const failed = [...c.failedHardConstraints, ...guard.failedHardConstraints.filter(applicableGuard)];
      const event = byId.get(c.candidateId)?.eventOccurrence;
      if(event && explicit.hardConstraints?.includes("OPEN_NOW") && Date.parse(event.startAt)>Date.parse(input.authority.serverTime)) failed.push("EVENT_NOT_STARTED");
      const unknown = [...c.unknownHardConstraints, ...guard.unknownHardConstraints.filter(applicableGuard)];
      if (explicit.primaryIntent && ["INCOMPATIBLE", "DISPUTED"].includes(guard.coreIntentCoverage.state)) failed.push("EXPLICIT_INTENT_CONTRADICTED");
      else if (explicit.primaryIntent && guard.coreIntentCoverage.state !== "CONFIRMED") unknown.push("EXPLICIT_INTENT_NOT_PROVEN");
      const supported = new Set(["BUDGET_MAXIMUM", "ACCESSIBILITY_BASIC", "ACCESSIBILITY_STEP_FREE", "OPEN_NOW", "OPEN_ON_REQUESTED_DAY", "TARGET_LOCATION", "INDOOR_REQUIRED"]);
      if (explicit.hardConstraints?.some(code => !supported.has(code) && decodeWorldQueryConstraint(code) === null)) unknown.push("EXPLICIT_REQUIREMENT_NOT_SUPPORTED");
      return DecisionProductCandidateAssessmentSchema.parse(withContentHash({ ...body, failedHardConstraints: codes(failed), unknownHardConstraints: codes(unknown), tier: failed.length || c.tier === "INELIGIBLE" ? "INELIGIBLE" : unknown.length ? "UNCONFIRMED_FALLBACK" : c.tier }, "assessmentHash"));
    });
  }
  const evaluation = DecisionProductEvaluationSchema.parse(withContentHash({
    contractVersion: PRODUCT_DECISION_VERSIONS.evaluation, evaluationId: `product-evaluation-${contentHash({ requestId: input.request.requestId, cohortHash: cohort.cohortHash }).slice(0,24)}`,
    createdAt: input.authority.serverTime, requestHash: contentHash(input.request), interpretation: context, worldCohort: cohort,
    userProjectionHash: input.projection.projectionHash, candidates, limitations: [...new Set(result.evaluationPlan.requirements.filter(r => requiredRequestIssue(r, r.support)).map(r => r.support === "NEEDS_POLICY" ? "REQUEST_NEEDS_CLARIFICATION" : "REQUEST_REQUIREMENT_UNSUPPORTED"))], evaluatorVersion: input.request.includeEvents === true ? PRODUCT_EVENT_LIBRARIAN_EVALUATOR_VERSION : PRODUCT_LIBRARIAN_EVALUATOR_VERSION,
    evaluationPolicyHash: DECISION_PRODUCT_EVALUATION_POLICY.policyHash, evaluationReleaseHash: DECISION_PRODUCT_EVALUATION_RELEASE.releaseHash, intentPolicyHash: DECISION_PRODUCT_INTENT_POLICY.policyHash,
    sourceKind: "CANONICAL_PRODUCT_PORTS", productSemanticsApproved: true, productRankingAuthorized: true, fixtureSourceUsed: false,
  }, "evaluationHash"));
  const presentations = worlds.map(w => DecisionProductPresentationSchema.parse(withContentHash({
    contractVersion: PRODUCT_DECISION_VERSIONS.presentation, spotId: w.spot.spotId, ...(w.eventOccurrence ? {event:{kind:"EVENT",eventId:w.eventOccurrence.eventId,occurrenceId:w.eventOccurrence.occurrenceId,venueSpotId:w.eventOccurrence.matchedSpotId,venueName:w.eventOccurrence.venueName,address:w.eventOccurrence.address,startAt:w.eventOccurrence.startAt,endAt:w.eventOccurrence.endAt,ticketUrl:w.eventOccurrence.ticketUrl,imageStoragePath:w.eventOccurrence.imageStoragePath??null}} : {}), name: (w.spot.identity.name ?? "Unbenannter Ort").slice(0,160), locality: w.spot.location.locality,
    categoryLabel: w.eventOccurrence ? "Veranstaltung" : w.spot.classification.primaryCategory, imageUrl: w.eventOccurrence?.imageUrl ?? null, sourceHash: w.snapshotHash,
  }, "presentationHash")));
  return deepFreeze({ evaluation, presentations });
}
