import fs from "node:fs";
import path from "node:path";
import {
  buildPhase3DFounderLabReport,
  canonicalJson,
  contentHash,
  createPhase3DCanonicalReleaseTrust,
  createPhase3DLocalEvidenceTrust,
  createPhase3DLocalObservation,
  createPhase3DRepositoryTrust,
  PHASE3D_CALIBRATION_CANDIDATES,
  PHASE3D_CALIBRATION_RELEASE,
  PHASE3D_CALIBRATION_TRUST_ANCHOR,
  PRODUCT_INTERPRETATION_POLICY_3C,
  PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C,
  provePhase3DFullIncrementalParity,
} from "../../packages/user-intelligence-vnext-core/dist/index.js";

export const UI_STORE_VERSION = "backyrd.user-intelligence.founder-lab-ui-store@3d-1";
export const UI_API_VERSION = "backyrd.user-intelligence.founder-lab-ui-api@3d-1";
export const UI_LABELS = Object.freeze(["FOUNDER_EVALUATION_ONLY", "LOCAL_ONLY", "NOT_PRODUCTION_AUTHORIZED"]);

const allowedDayPhases = new Set(["morning", "midday", "evening", "night"]);
const allowedCompanyTypes = new Set(["alone", "friends", "partner", "family", "first_date"]);
const allowedTimeBudgets = new Set(["short", "medium", "open"]);
const allowedSpots = new Set(["fixture-cafe-cozy", "fixture-cafe-bright", "fixture-bar-lively"]);
const allowedSearchScopes = new Set(["SELF_CURRENT", "TRAVEL_ONE_OFF", "FOR_OTHER_PERSON"]);
const allowedLifecycles = new Set(["ACTIVE", "WITHDRAWN", "RESET"]);

const actionDefinitions = Object.freeze({
  search: ["SEARCH", "Suche durchgeführt", "Aktuelle, minimierte Suchabsicht", "Keine sofortige langfristige Vorliebe"],
  save: ["SAVED", "Spot gespeichert", "Planning State für diesen Spot", "Keine Experience, Satisfaction oder Concept-Präferenz"],
  removeSave: ["SAVE_REMOVED", "Save entfernt", "Planning State wird beendet", "Kein Dislike und keine alte Evidence wird gelöscht"],
  opened: ["OPENED", "Spot geöffnet", "Eine neutrale Interaktion", "Kein Like und keine Experience"],
  navigation: ["NAVIGATION_STARTED", "Navigation gestartet", "Navigationsabsicht", "Kein Visit und keine Satisfaction"],
  visit: ["VISITED", "Besuch bestätigt", "Qualifizierte Experience; kann Familiarity zählen", "Keine Satisfaction oder positive Präferenz"],
  review: ["STANDARD_REVIEW", "Review erstellt", "Qualifizierte Experience", "Ohne Gesamturteil keine Satisfaction"],
  smartReview: ["SMART_REVIEW", "Smart Review erstellt", "Dieselbe Experience-Semantik wie Standard Review", "Der UI-Einstieg erhöht kein Signal"],
  matched: ["EXPLICIT_SATISFACTION", "Hat gepasst", "Explizite positive persönliche Passung", "Keine objektive Qualitätsaussage"],
  notMatched: ["EXPLICIT_DISSATISFACTION", "Hat nicht gepasst", "Explizite negative persönliche Passung", "Keine objektive Qualitätsaussage"],
  neutral: ["EXPLICIT_UNDECIDED", "Kann ich nicht beurteilen / übersprungen", "Bewusste Antwort ohne Richtung", "Kein Taste- oder Aversion-Beitrag"],
  skip: ["QUICK_SKIP", "Schneller Skip", "Sehr schwaches Signal nur für Spot × Decision × Context", "Keine globale Spot- oder Concept-Aversion"],
  notFit: ["SPOT_NOT_FIT", "Passt nicht", "Situatives negatives Signal für Spot × Decision × Context", "Keine Dissatisfaction nach realer Experience"],
  alternative: ["ALTERNATIVE_REQUESTED", "Alternative angefordert", "Es wurde noch nichts gewählt", "Keine negative Evidence und keine Exploration-Präferenz"],
  moment: ["MOMENT_CREATED", "Moment mit Experience Authority", "Kann eine Experience stützen", "Keine Satisfaction, Taste oder Social Propagation"],
  dwell: ["DWELL", "Verweildauer beobachtet", "Getrennte Attention-Beobachtung", "Kein Taste, keine Sufficiency, keine Decision Projection"],
});

const normalizeSearch = (value) => String(value ?? "").trim().toLocaleLowerCase("de-CH").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ");
export function minimizeFixtureSearch(rawText, scope = "SELF_CURRENT") {
  if (!allowedSearchScopes.has(scope)) throw labError("INVALID_SEARCH_SCOPE", "Die Suchsituation ist nicht freigegeben.");
  const normalized = normalizeSearch(rawText);
  const fixtures = new Map([
    ["gemutliches cafe am vormittag", { conceptIds: ["place_type.cafe", "vibe.cozy"], contextPatch: { dayPhase: "morning", requestedMoodConcept: "mood.cozy" }, label: "Gemütliches Café am Vormittag" }],
    ["ruhig essen beim ersten date", { conceptIds: ["place_type.restaurant", "vibe.quiet"], contextPatch: { companyType: "first_date", requestedMoodConcept: "mood.quiet" }, label: "Ruhig essen beim ersten Date" }],
    ["etwas neues", { conceptIds: ["discovery.novelty"], contextPatch: {}, label: "Etwas Neues" }],
  ]);
  const match = fixtures.get(normalized);
  if (!match) throw labError("SEARCH_NOT_CONFIGURED", "Diese Formulierung ist im lokalen Fixture noch nicht verstanden. Der Zustand blieb unverändert.");
  return { ...match, scope, learningSuppressedReason: scope === "TRAVEL_ONE_OFF" ? "ONE_OFF_TRAVEL_SEARCH" : scope === "FOR_OTHER_PERSON" ? "SEARCH_FOR_OTHER_PERSON" : null, rawTextStored: false };
}

const labError = (code, message, nextAction = "Eingabe prüfen und erneut versuchen.") => Object.assign(new Error(message), { code, nextAction });
const expectKeys = (value, keys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw labError("INVALID_STATE", `${label} ist ungültig.`);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw labError("INVALID_STATE", `${label} enthält das unbekannte Feld ${key}.`);
};
const storeBody = (store) => Object.fromEntries(Object.entries(store).filter(([key]) => key !== "integrityHash"));
const hashStore = (store) => contentHash(storeBody(store));
const initialStore = () => ({ contractVersion: UI_STORE_VERSION, labels: [...UI_LABELS], selectedUserId: null, nextUserNumber: 1, users: [], integrityHash: "" });
const intentLabels = Object.freeze({ FIND_PLACE: "Einen passenden Ort finden", FIND_CAFE: "Café finden", QUIET_MEAL: "Ruhig essen", EXPLORE_NEW: "Etwas Neues entdecken" });
const contextHash = (context) => contentHash({ dayPhase: context.dayPhase, companyType: context.companyType, timeBudget: context.timeBudget, requestedMoodConcept: context.requestedMoodConcept, intentId: context.intentId });
const minimizeIntent = (value) => { const normalized = normalizeSearch(value); const match = Object.entries(intentLabels).find(([, label]) => normalizeSearch(label) === normalized); if (!match) throw labError("INTENT_NOT_CONFIGURED", "Diese Decision-Aufgabe ist im lokalen Fixture noch nicht verstanden. Der Rohtext wurde nicht gespeichert."); return match[0]; };

function validateContext(value) {
  expectKeys(value, ["dayPhase", "companyType", "timeBudget", "requestedMoodConcept", "intentId"], "Situation");
  if (!allowedDayPhases.has(value.dayPhase) || !allowedCompanyTypes.has(value.companyType) || !allowedTimeBudgets.has(value.timeBudget)) throw labError("INVALID_CONTEXT", "Die Situation enthält nicht freigegebene Werte.");
  if (value.requestedMoodConcept !== null && !["mood.cozy", "mood.quiet"].includes(value.requestedMoodConcept)) throw labError("INVALID_CONTEXT", "Das Mood-Concept ist nicht freigegeben.");
  if (!Object.hasOwn(intentLabels, value.intentId)) throw labError("INVALID_CONTEXT", "Die Decision-Aufgabe ist nicht minimiert oder nicht freigegeben.");
}

function validateStore(store) {
  expectKeys(store, ["contractVersion", "labels", "selectedUserId", "nextUserNumber", "users", "integrityHash"], "Lab-Store");
  if (store.contractVersion !== UI_STORE_VERSION || canonicalJson(store.labels) !== canonicalJson(UI_LABELS) || !Number.isInteger(store.nextUserNumber) || store.nextUserNumber < 1 || !Array.isArray(store.users) || store.integrityHash !== hashStore(store)) throw labError("STORE_INTEGRITY_FAILED", "Der lokale Lab-Stand ist beschädigt oder stammt aus einer unbekannten Version. Er wurde nicht geladen.", "Die Datei sichern und das Lab mit einem neuen lokalen Store starten.");
  const ids = new Set();
  for (const user of store.users) {
    expectKeys(user, ["userId", "label", "subjectBindingHash", "consent", "lifecycle", "createdAt", "updatedAt", "nextActionNumber", "nextJourneyNumber", "currentJourney", "actions", "rejectedAttempts", "checkpoint"], "Testnutzer");
    if (ids.has(user.userId)) throw labError("STORE_INTEGRITY_FAILED", "Doppelte Testnutzer-ID."); ids.add(user.userId);
    if (!/^testnutzer-[0-9]+$/.test(user.userId) || typeof user.label !== "string" || !allowedLifecycles.has(user.lifecycle) || !Array.isArray(user.actions) || !Array.isArray(user.rejectedAttempts)) throw labError("STORE_INTEGRITY_FAILED", "Testnutzer-Daten sind ungültig.");
    if (user.lifecycle === "ACTIVE" && (!/^[a-f0-9]{64}$/.test(user.subjectBindingHash ?? "") || user.consent !== "LOCAL_EVALUATION_GRANTED")) throw labError("STORE_INTEGRITY_FAILED", "Aktiver Testnutzer besitzt keine gültige lokale Bindung.");
    if (user.lifecycle !== "ACTIVE" && (user.subjectBindingHash !== null || user.actions.length > 0)) throw labError("STORE_INTEGRITY_FAILED", "Unterdrückter Testnutzer enthält personenbezogenes Rebuild-Material.");
    if (user.currentJourney) { expectKeys(user.currentJourney, ["journeyId", "decisionId", "experienceId", "spotId", "startedAt", "context"], "Journey"); if (!allowedSpots.has(user.currentJourney.spotId)) throw labError("STORE_INTEGRITY_FAILED", "Journey enthält einen unbekannten Fixture-Spot."); validateContext(user.currentJourney.context); }
    expectKeys(user.checkpoint, ["observationCount", "stateHash", "updatedAt"], "Checkpoint");
    if (!Number.isInteger(user.checkpoint.observationCount) || user.checkpoint.observationCount < 0 || user.checkpoint.observationCount > user.actions.length) throw labError("STORE_INTEGRITY_FAILED", "Checkpoint ist ungültig.");
    for (const action of user.actions) {
      expectKeys(action, ["actionId", "eventType", "description", "observedMeaning", "possibleLearning", "forbiddenLearning", "journeyId", "decisionId", "experienceId", "spotId", "occurredAt", "context", "conceptIds", "worldAttribution", "experienceConfirmed", "satisfactionResponse", "active", "learningSuppressedReason", "attentionOnly", "rawTextStored", "targetActionId"], "Handlung");
      if (!new Set([...Object.values(actionDefinitions).map(([eventType]) => eventType), "CORRECTION"]).has(action.eventType) || !allowedSpots.has(action.spotId) || action.rawTextStored !== false || !Array.isArray(action.conceptIds) || Number.isNaN(Date.parse(action.occurredAt))) throw labError("STORE_INTEGRITY_FAILED", "Eine gespeicherte Handlung ist ungültig.");
      validateContext(action.context);
    }
    for (const attempt of user.rejectedAttempts) { expectKeys(attempt, ["attemptedAction", "targetActionId", "reason", "occurredAt", "stateUnchanged"], "Abgewiesener Versuch"); if (attempt.stateUnchanged !== true) throw labError("STORE_INTEGRITY_FAILED", "Abgewiesener Versuch ist ungültig."); }
  }
  if (store.selectedUserId !== null && !ids.has(store.selectedUserId)) throw labError("STORE_INTEGRITY_FAILED", "Ausgewählter Testnutzer existiert nicht.");
  return store;
}

export class FounderLabService {
  constructor({ statePath, now = () => new Date().toISOString() }) { this.statePath = statePath; this.now = now; }
  ensure() { if (!fs.existsSync(this.statePath)) this.#write(initialStore()); return this.#read(); }
  #read() { return validateStore(JSON.parse(fs.readFileSync(this.statePath, "utf8"))); }
  #write(store) {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const next = { ...store, integrityHash: hashStore(store) };
    const temp = `${this.statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600, flag: "w" });
    fs.renameSync(temp, this.statePath); fs.chmodSync(this.statePath, 0o600); return next;
  }
  #selected(store) { const user = store.users.find(({ userId }) => userId === store.selectedUserId); if (!user) throw labError("NO_TEST_USER", "Bitte zuerst einen lokalen Testnutzer anlegen oder auswählen."); return user; }
  createUser(label) {
    const store = this.ensure(); const number = store.nextUserNumber; const userId = `testnutzer-${number}`; const now = this.now();
    const safeLabel = String(label ?? `Testnutzer ${number}`).trim(); if (!safeLabel || safeLabel.length > 40 || safeLabel.includes("@")) throw labError("INVALID_USER_LABEL", "Der lokale Anzeigename muss 1 bis 40 Zeichen lang sein und darf keine E-Mail enthalten.");
    const user = { userId, label: safeLabel, subjectBindingHash: contentHash({ localFounderUser: userId, createdAt: now }), consent: "LOCAL_EVALUATION_GRANTED", lifecycle: "ACTIVE", createdAt: now, updatedAt: now, nextActionNumber: 1, nextJourneyNumber: 1, currentJourney: null, actions: [], rejectedAttempts: [], checkpoint: { observationCount: 0, stateHash: null, updatedAt: null } };
    store.users.push(user); store.selectedUserId = userId; store.nextUserNumber += 1; this.#write(store); return this.view();
  }
  selectUser(userId) { const store = this.ensure(); if (!store.users.some((user) => user.userId === userId)) throw labError("UNKNOWN_TEST_USER", "Der Testnutzer existiert nicht."); store.selectedUserId = userId; this.#write(store); return this.view(); }
  startJourney(input) {
    expectKeys(input, ["mode", "spotId", "dayPhase", "companyType", "timeBudget", "requestedMoodConcept", "intentLabel"], "Journey-Anfrage");
    const store = this.ensure(); const user = this.#selected(store); if (user.lifecycle !== "ACTIVE") throw labError("LIFECYCLE_BLOCKED", "Dieser Testnutzer ist nicht aktiv.", "Neuen Testnutzer anlegen.");
    if (!allowedSpots.has(input.spotId)) throw labError("UNKNOWN_FIXTURE_SPOT", "Der Fixture-Spot ist nicht freigegeben.");
    const context = { dayPhase: input.dayPhase, companyType: input.companyType, timeBudget: input.timeBudget, requestedMoodConcept: input.requestedMoodConcept || null, intentId: minimizeIntent(input.intentLabel) }; validateContext(context);
    if (input.mode === "CONTINUE" && user.currentJourney) user.currentJourney = { ...user.currentJourney, spotId: input.spotId, context };
    else if (input.mode === "NEW") { const n = user.nextJourneyNumber++; user.currentJourney = { journeyId: `local-journey-${user.userId}-${n}`, decisionId: `local-decision-${user.userId}-${n}`, experienceId: `local-experience-${user.userId}-${n}`, spotId: input.spotId, startedAt: this.now(), context }; }
    else throw labError("INVALID_JOURNEY_MODE", "Bitte neue Journey oder Fortsetzung wählen.");
    user.updatedAt = this.now(); this.#write(store); return this.view();
  }
  applyAction(input) {
    expectKeys(input, ["actionName", "searchText", "searchScope", "deliveryMode"], "Handlung");
    const store = this.ensure(); const user = this.#selected(store); if (user.lifecycle !== "ACTIVE" || !user.currentJourney) throw labError("JOURNEY_REQUIRED", "Bitte zuerst eine aktive Situation starten.");
    const { actionName, deliveryMode = "NORMAL" } = input;
    if (actionName === "retry") return this.retryLast();
    if (actionName === "correct") return this.correctLast();
    if (actionName === "momentWithoutAuthority") { user.rejectedAttempts.push({ attemptedAction: "MOMENT_CREATED", reason: "MISSING_QUALIFIED_EXPERIENCE_AUTHORITY", occurredAt: this.now(), stateUnchanged: true }); user.updatedAt = this.now(); this.#write(store); return this.view("Moment ohne Experience Authority wurde fail-closed zurückgewiesen."); }
    const definition = actionDefinitions[actionName]; if (!definition) throw labError("UNKNOWN_ACTION", "Diese Handlung ist nicht freigegeben.");
    const [eventType, description, possibleLearning, forbiddenLearning] = definition; const number = user.nextActionNumber++; const journey = user.currentJourney; const occurredAt = deliveryMode === "LATE" ? "2025-01-01T08:00:00.000Z" : this.now();
    const qualifiedExperienceExists = user.actions.some((row) => row.active && row.journeyId === journey.journeyId && ["VISITED", "STANDARD_REVIEW", "SMART_REVIEW"].includes(row.eventType));
    if (["EXPLICIT_SATISFACTION", "EXPLICIT_DISSATISFACTION", "EXPLICIT_UNDECIDED", "MOMENT_CREATED"].includes(eventType) && !qualifiedExperienceExists) throw labError("QUALIFIED_EXPERIENCE_REQUIRED", "Diese Handlung benötigt zuerst einen bestätigten Besuch oder ein Review in derselben Journey.");
    const search = actionName === "search" ? minimizeFixtureSearch(input.searchText, input.searchScope) : null;
    const context = search ? { ...journey.context, ...search.contextPatch } : journey.context; validateContext(context);
    const action = { actionId: `local-action-${user.userId}-${number}`, eventType, description: search?.label ?? description, observedMeaning: description, possibleLearning, forbiddenLearning, journeyId: journey.journeyId, decisionId: journey.decisionId, experienceId: journey.experienceId, spotId: journey.spotId, occurredAt, context, conceptIds: search?.conceptIds ?? [], worldAttribution: search?.conceptIds.length ? "CERTAIN" : "NOT_APPLICABLE", experienceConfirmed: ["VISITED", "STANDARD_REVIEW", "SMART_REVIEW", "EXPLICIT_SATISFACTION", "EXPLICIT_DISSATISFACTION", "EXPLICIT_UNDECIDED", "MOMENT_CREATED"].includes(eventType), satisfactionResponse: eventType === "EXPLICIT_SATISFACTION" ? "HAS_MATCHED" : eventType === "EXPLICIT_DISSATISFACTION" ? "HAS_NOT_MATCHED" : eventType === "EXPLICIT_UNDECIDED" ? "CANNOT_ASSESS_OR_SKIPPED" : null, active: search?.learningSuppressedReason ? false : true, learningSuppressedReason: search?.learningSuppressedReason ?? null, attentionOnly: eventType === "DWELL", rawTextStored: false, targetActionId: null };
    user.actions.push(action); user.updatedAt = this.now(); this.#write(store); return this.view();
  }
  retryLast() { const store = this.ensure(); const user = this.#selected(store); const target = user.actions.at(-1); if (!target) throw labError("NO_ACTION", "Es gibt keine Handlung für einen Retry."); user.rejectedAttempts.push({ attemptedAction: target.eventType, targetActionId: target.actionId, reason: "DELIVERY_RETRY_DEDUPLICATED", occurredAt: this.now(), stateUnchanged: true }); user.updatedAt = this.now(); this.#write(store); return this.view("Retry erkannt und dedupliziert; keine neue Evidence Unit."); }
  correctLast() { const store = this.ensure(); const user = this.#selected(store); const target = [...user.actions].reverse().find(({ eventType }) => eventType !== "CORRECTION"); if (!target) throw labError("NO_ACTION", "Es gibt keine aktive Handlung zum Korrigieren."); if (user.actions.some((row) => row.eventType === "CORRECTION" && row.targetActionId === target.actionId)) throw labError("ALREADY_CORRECTED", "Die letzte Handlung wurde bereits korrigiert."); const number = user.nextActionNumber++; const clock = this.now(); const occurredAt = Date.parse(clock) > Date.parse(target.occurredAt) ? clock : new Date(Date.parse(target.occurredAt) + 1).toISOString(); user.actions.push({ ...target, actionId: `local-action-${user.userId}-${number}`, eventType: "CORRECTION", description: "Letzte Handlung korrigiert", observedMeaning: "Append-only Correction", possibleLearning: "Aktiver Einfluss des Ziels wird entfernt", forbiddenLearning: "Historie wird nicht überschrieben", occurredAt, conceptIds: [], worldAttribution: "NOT_APPLICABLE", experienceConfirmed: false, satisfactionResponse: null, attentionOnly: false, targetActionId: target.actionId }); user.updatedAt = occurredAt; this.#write(store); return this.view(); }
  lifecycle(action, confirmed) {
    if (confirmed !== true) throw labError("CONFIRMATION_REQUIRED", "Diese lokale Aktion benötigt eine ausdrückliche Bestätigung.");
    const store = this.ensure(); const user = this.#selected(store);
    if (action === "WITHDRAW") { user.consent = "WITHDRAWN"; user.lifecycle = "WITHDRAWN"; user.subjectBindingHash = null; user.actions = []; user.rejectedAttempts = []; user.currentJourney = null; user.checkpoint = { observationCount: 0, stateHash: null, updatedAt: this.now() }; user.updatedAt = this.now(); }
    else if (action === "RESET") { user.consent = "NOT_GRANTED"; user.lifecycle = "RESET"; user.subjectBindingHash = null; user.actions = []; user.rejectedAttempts = []; user.currentJourney = null; user.checkpoint = { observationCount: 0, stateHash: null, updatedAt: this.now() }; user.updatedAt = this.now(); }
    else if (action === "ERASE") { store.users = store.users.filter(({ userId }) => userId !== user.userId); store.selectedUserId = store.users[0]?.userId ?? null; }
    else throw labError("UNKNOWN_LIFECYCLE_ACTION", "Unbekannte Lifecycle-Aktion.");
    this.#write(store); return this.view();
  }
  privacyExport() { const store = this.ensure(); const user = this.#selected(store); return { contractVersion: "backyrd.user-intelligence.founder-lab-privacy-export@3d-1", authority: "LOCAL_PRIVACY_LEGAL_TEST_ONLY", productionAuthorized: false, generatedAt: this.now(), testUser: { userId: user.userId, consent: user.consent, lifecycle: user.lifecycle }, observations: user.actions.map(({ description, eventType, occurredAt, journeyId, spotId, active, learningSuppressedReason }) => ({ description, eventType, occurredAt, journeyId, spotId, active, learningSuppressedReason })), derived: this.#evaluation(user)?.state?.evaluation ?? null, limitations: ["LOCAL_SYNTHETIC_DATA_ONLY", "NOT_A_PRODUCT_TASTE_DASHBOARD"] }; }
  rebuild(mode) {
    const store = this.ensure(); const user = this.#selected(store); if (user.lifecycle !== "ACTIVE") throw labError("LIFECYCLE_BLOCKED", "Rebuild ist für unterdrückte Testnutzer geschlossen."); const evaluation = this.#evaluation(user);
    let result;
    if (mode === "FULL") result = { mode, byteIdentical: true, stateHash: evaluation.state?.stateHash ?? null, message: "Full Rebuild erfolgreich rekonstruiert." };
    else if (mode === "INCREMENTAL") { const proof = evaluation.items.length ? provePhase3DFullIncrementalParity(evaluation.input, Math.max(0, Math.min(user.checkpoint.observationCount, evaluation.items.length)), createPhase3DCanonicalReleaseTrust(), evaluation.trust) : null; result = { mode, byteIdentical: proof?.byteIdentical ?? true, stateHash: proof?.full.stateHash ?? null, proofHash: proof?.proofHash ?? null, message: "Incremental Update ist byte-identisch zum Full Rebuild." }; if (proof && !proof.byteIdentical) throw labError("PARITY_FAILED", "Full und Incremental unterscheiden sich. Der Zustand wurde nicht übernommen."); }
    else if (mode === "REPLAY") { const again = this.#evaluation(user); if (canonicalJson(evaluation.report) !== canonicalJson(again.report)) throw labError("REPLAY_FAILED", "Deterministischer Replay ist fehlgeschlagen."); result = { mode, byteIdentical: true, stateHash: evaluation.state?.stateHash ?? null, message: "Replay ist deterministisch und byte-identisch." }; }
    else throw labError("UNKNOWN_REBUILD_MODE", "Unbekannter Rebuild-Modus.");
    user.checkpoint = { observationCount: evaluation.items.length, stateHash: result.stateHash, updatedAt: this.now() }; user.updatedAt = this.now(); this.#write(store); return this.view(result.message, result);
  }
  #evaluation(user) {
    if (!user || user.lifecycle !== "ACTIVE" || !user.subjectBindingHash) return null;
    const items = []; const byId = new Map();
    for (const action of user.actions) {
      if (!action.active && action.learningSuppressedReason) continue;
      const target = action.targetActionId ? byId.get(action.targetActionId)?.observation : null;
      const needsDecision = ["QUICK_SKIP", "ALTERNATIVE_REQUESTED", "SPOT_NOT_FIT", "MOOD_CONTEXT_SELECTED", "EXPLORATION_CONTROL_SELECTED"].includes(action.eventType);
      const item = createPhase3DLocalObservation({ recordId: action.actionId, subjectBindingHash: user.subjectBindingHash, eventType: action.eventType, occurredAt: action.occurredAt, journeyId: action.journeyId, spotId: action.spotId, decisionId: needsDecision ? action.decisionId : null, contextHash: contextHash(action.context), contextDimensions: ["DAY_PHASE", "COMPANY_TYPE", "COARSE_TIME_BUDGET", ...(action.context.requestedMoodConcept ? ["REQUESTED_MOOD_CONCEPT"] : [])], conceptIds: action.conceptIds, worldAttribution: action.worldAttribution, experienceConfirmed: action.experienceConfirmed, satisfactionResponse: action.satisfactionResponse, correctionTargetRecordId: target?.recordId ?? null, correctionTargetSourceEvidenceHash: target?.sourceEvidenceHash ?? null, active: action.active }); items.push(item); byId.set(action.actionId, item);
    }
    const trust = createPhase3DLocalEvidenceTrust(items); const input = { evaluationId: `local-founder-ui-${user.userId}`, subjectBindingHash: user.subjectBindingHash, lifecycle: "ACTIVE", observations: items.map(({ observation }) => observation) };
    const report = buildPhase3DFounderLabReport(input, createPhase3DCanonicalReleaseTrust(), trust, createPhase3DRepositoryTrust());
    const state = items.length ? provePhase3DFullIncrementalParity(input, Math.min(user.checkpoint.observationCount, items.length), createPhase3DCanonicalReleaseTrust(), trust).full : null;
    return { items, trust, input, report, state };
  }
  view(message = null, operation = null) {
    const store = this.ensure(); const selected = store.users.find(({ userId }) => userId === store.selectedUserId) ?? null; const evaluation = this.#evaluation(selected); const corrected = new Set(selected?.actions.filter(({ eventType }) => eventType === "CORRECTION").map(({ targetActionId }) => targetActionId) ?? []);
    const timeline = selected?.actions.map((action) => ({ actionId: action.actionId, occurredAt: action.occurredAt, journeyId: action.journeyId, contextLabel: `${action.context.dayPhase} · ${action.context.companyType} · ${action.context.timeBudget}`, action: action.description, authorityStatus: "SYNTHETIC_SERVER_BOUND", status: corrected.has(action.actionId) ? "CORRECTED" : action.active ? "ACTIVE" : "INACTIVE", independenceUnit: action.active ? action.journeyId : null, target: action.conceptIds.length ? action.conceptIds.join(", ") : action.spotId, direction: action.eventType === "EXPLICIT_SATISFACTION" ? "POSITIVE" : action.eventType === "EXPLICIT_DISSATISFACTION" || ["QUICK_SKIP", "SPOT_NOT_FIT"].includes(action.eventType) ? "NEGATIVE_OR_WEAK" : "NEUTRAL", withheld: action.attentionOnly || action.learningSuppressedReason !== null || ["SEARCH", "QUICK_SKIP", "SPOT_NOT_FIT"].includes(action.eventType), eventType: action.eventType, experienceId: action.experienceId })) ?? [];
    const report = evaluation?.report ?? null; const interpretations = evaluation?.state?.evaluation.interpretations ?? []; const conflicts = evaluation?.state?.evaluation.conflicts ?? [];
    const currentJourney = selected?.currentJourney ? { ...selected.currentJourney, context: { ...selected.currentJourney.context, intentLabel: intentLabels[selected.currentJourney.context.intentId] } } : null;
    return { contractVersion: UI_API_VERSION, labels: [...UI_LABELS], message, operation, users: store.users.map(({ userId, label, consent, lifecycle, updatedAt }) => ({ userId, label, consent, lifecycle, updatedAt })), selectedUser: selected ? { userId: selected.userId, label: selected.label, consent: selected.consent, lifecycle: selected.lifecycle, updatedAt: selected.updatedAt, hasModel: Boolean(evaluation?.state), currentJourney, checkpoint: selected.checkpoint } : null, fixtureSpots: [...allowedSpots].map((spotId) => ({ spotId, label: spotId === "fixture-cafe-cozy" ? "Café Morgenrot (synthetisch)" : spotId === "fixture-cafe-bright" ? "Café Lichtblick (synthetisch)" : "Bar Abendwind (synthetisch)", source: "SYNTHETIC_FIXTURE", uncertaintyVisible: true })), actions: Object.entries(actionDefinitions).map(([actionName, [eventType, label, possibleLearning, forbiddenLearning]]) => ({ actionName, eventType, label, possibleLearning, forbiddenLearning })), timeline, rejectedAttempts: selected?.rejectedAttempts ?? [], internalModel: { observations: timeline.length, interpretations: interpretations.map(({ interpretationId, kind, targetKey, direction, maturity, contextHash, limitations, evidenceRecordIds }) => ({ interpretationId, kind, targetKey, direction, maturity, contextHash, limitations, evidenceRecordIds })), conflicts, sufficiency: evaluation?.state?.evaluation.domainSufficiency ?? [], evaluationPreview: evaluation?.state?.evaluation.evaluationPreview ?? null, productionProjection: evaluation?.state?.evaluation.productionBoundary ?? { productionAuthorized: false, containsPersonalModelData: false, items: [] }, reportPrimaryView: report?.primaryView ?? [] }, candidates: PHASE3D_CALIBRATION_CANDIDATES.map((candidate, index) => ({ candidateId: candidate.candidateId, title: index === 0 ? "Konservativ" : index === 1 ? "Ausgewogen" : "Lernfreudig", authority: candidate.authority, productionAuthorized: candidate.productionAuthorized, rankingAuthorized: candidate.rankingAuthorized, eligibilityAuthorized: candidate.eligibilityAuthorized, rules: candidate.rules, benefits: candidate.benefits, risks: candidate.risks, current: report?.candidateOutcomes[index] ?? null })), expert: { productPolicyVersion: PRODUCT_INTERPRETATION_POLICY_3C.policyVersion, productPolicyHash: PRODUCT_INTERPRETATION_POLICY_3C.policyHash, registryVersion: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryVersion, registryHash: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash, calibrationReleaseId: PHASE3D_CALIBRATION_RELEASE.releaseId, calibrationReleaseHash: PHASE3D_CALIBRATION_RELEASE.releaseHash, calibrationTrustAnchorHash: PHASE3D_CALIBRATION_TRUST_ANCHOR.anchorHash, reportHash: report?.reportHash ?? null, observationHashes: report?.expert.observationHashes ?? [], reasonCodes: report?.expert.reasonCodes ?? [] }, boundaries: { localOnly: true, productionAuthorized: false, rankingAuthority: false, eligibilityAuthority: false, worldSource: "SYNTHETIC_FIXTURE", rawSearchTextStored: false, retentionDurationsConfigured: false } };
  }
}
