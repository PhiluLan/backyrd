import { canonicalJson, contentHash } from "./canonical.js";
import { CONTRACT_VERSIONS } from "./contracts.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";
import { CalibrationEvidence, CalibrationEvidenceTrustContext, verifyCalibrationEvidence } from "./calibration.js";
import { USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH } from "./lifecycle.js";

const count = schema.number({ min: 0, integer: true });
const withoutHash = (value: Readonly<Record<string, unknown>>, field: string) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
const same = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
const unique = (values: readonly string[]) => [...new Set(values)].sort();
const RELEASE_VALID_FROM = "2026-09-11T00:00:00.000Z";
const RELEASE_VALID_UNTIL = "2030-01-01T00:00:00.000Z";

export const PHASE3C_DECISION_IDS = Object.freeze(Array.from({ length: 20 }, (_, index) => String(index + 1)));
const DecisionSelectionSchema = schema.object({
  decisionId: schema.enum(PHASE3C_DECISION_IDS as unknown as readonly [string, ...string[]]),
  selectedOption: schema.enum(["A", "B", "C", "D"] as const),
  founderInstruction: schema.string({ min: 8, max: 2000 }),
  rationale: schema.string({ min: 8, max: 1000 }),
});

const FROZEN_DECISIONS = Object.freeze([
  ["1", "A", "Drei Antworten nach qualifizierter Decision Experience; nur bewusstes hat gepasst oder hat nicht gepasst ist gerichtet. Review ohne Gesamtantwort bleibt satisfaction unknown.", "Explizite Experience-Antwort trennt Review, Experience und Satisfaction."],
  ["2", "A", "Hat nicht gepasst ist persönliche negative Passung nach qualifizierter Experience; Skip, Removal, fehlender Repeat und ungerichtetes Review sind keine Dissatisfaction.", "Negative Evidence benötigt besonders klare Nutzerabsicht."],
  ["3", "B", "Ein erfolgreicher Save erzeugt nur vorsichtiges Direct-Spot-Planungsinteresse, niemals Experience, Satisfaction oder Concept Taste.", "Save kann Planung bedeuten, ohne Gefallen zu beweisen."],
  ["4", "A", "Save Removal beendet nur den Planning State und verändert keine unabhängige Experience- oder Outcome-Evidence.", "Aufräumen ist kein Dislike."],
  ["5", "B", "Familiarity entsteht erst aus mindestens drei unabhängigen serverqualifizierten Visits desselben Spots.", "Drei ist die ausdrücklich freigegebene Product-Schwelle; Wiederkehr bleibt neutral."],
  ["6", "A", "Review Moods beschreiben Spot oder Experience und gelangen nie in User Taste oder Taste Sufficiency; gesuchte Moods bleiben aktueller Decision Context.", "Beschreibende Moods sind keine persönliche Wertungsrichtung."],
  ["7", "B", "Ein Moment stützt Experience nur mit separater User-, Spot-, Journey- und Experience-Authority und erzeugt nie automatisch Taste, Satisfaction oder Social Propagation.", "Content-Erstellung und persönliche Passung bleiben getrennt."],
  ["8", "D", "Dwell bleibt getrennte, zunächst nicht autorisierte Interaction-/Attention-Beobachtung ohne Taste-, Experience-, Sufficiency- oder Decision-Wirkung.", "Dwell ist durch UI, Ladezeit und Ablenkung mehrdeutig."],
  ["9", "D", "Skip ist sehr schwache Spot-mal-Decision-mal-Context-Evidence, nie globale Aversion; stärkere Reifung bleibt NOT_CONFIGURED.", "Ein situativer Skip darf das Langzeitprofil nicht verengen."],
  ["10", "D", "Search nutzt nur serverminimierte Concept- und Context-IDs; einzelne Suche ist current/recent, wiederholte unabhängige Muster dürfen contextuelle Hypothesen bilden; Promotion bleibt NOT_CONFIGURED.", "Search ist zentrale aktuelle Absicht, Rohtext bleibt ausgeschlossen."],
  ["11", "B", "Independence benötigt getrennte serveraufgelöste Journey und eigenen qualifizierten Experience- oder Search-Nachweis; unresolved und probable related zählen nicht.", "Zeit oder Eventzahl allein beweist kein neues Erlebnis."],
  ["12", "C", "Für gerichtetes Taste-Learning wirkt pro Journey nur das stärkste autorisierte Signal; alle schwächeren Beobachtungen bleiben append-only erhalten.", "Eventreiche Journeys dürfen gerichtete Evidence nicht vervielfachen."],
  ["13", "D", "Erlaubt sind allowgelistete nicht sensible Context-Kategorien. World UNKNOWN bleibt ohne freigegebenen Hard Constraint Kandidat, wird aber gegenüber vergleichbarem KNOWN_TRUE als unsicher markiert.", "Context wird minimiert; Eligibility und Ranking bleiben bei Decision Intelligence."],
  ["14", "A", "Ein explizites Outcome darf sofort eine unreife, vollständig contextgebundene Hypothese erzeugen; kein automatischer Long-Term-Transfer.", "Frühes Lernen muss hohe Unsicherheit offenlegen."],
  ["15", "A", "Es gibt kein automatisches Decay; neue widersprechende Evidence bleibt parallel. Nur ausdrücklich begrenzter Recent State kann enden.", "Zeit allein ändert keine historische fachliche Wahrheit."],
  ["16", "A", "Starke gerichtete Taste-Reife basiert primär auf expliziten Outcomes; neutrale Interaktionen erhöhen keine starke Taste-Sufficiency. Search besitzt eine getrennte, noch nicht final kalibrierte Reifelogik.", "Reife bleibt pro Domain und semantischem Target."],
  ["17", "C", "Exploration wird durch den aktuellen Control etwas Neues, etwas Bekanntes oder offen für beides erfasst; Alternative Requested ist neutral, Repeats beschreiben nur Familiarity.", "Situative Auswahl ist keine dauerhafte Persönlichkeit."],
  ["18", "B", "Concept Taste benötigt mehrere unabhängige Experiences an unterschiedlichen Spots mit demselben sicher attribuierten Concept; genaue Mindestanzahl bleibt NOT_CONFIGURED.", "Ein einzelner Spot darf allgemeinen Taste nicht dominieren."],
  ["19", "B", "Positive und negative Evidence bleibt append-only; verschiedene Contexts bleiben getrennt, gleicher Target und Context bleibt unresolved und gerichtet zurückgehalten.", "Keine Richtung gewinnt automatisch."],
  ["20", "D", "Keine normale Product-UI zeigt Taste-Profil, Scores, Labels, Hypothesen, Conflicts oder Maturity. Consent, Reset, Export und Erasure bleiben wirksam; Legal Export darf erforderliche abgeleitete Daten enthalten.", "Unsichtbares internes Modell darf Datenschutzrechte nicht einschränken."],
] as const).map(([decisionId, selectedOption, founderInstruction, rationale]) => ({ decisionId, selectedOption, founderInstruction, rationale }));

export const FounderDecisionRecordSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.founderDecisionRecord), recordId: identifier,
  sourcePhase: schema.literal("3B"), authority: schema.literal("FOUNDER_APPROVED_PRODUCT_SEMANTICS"),
  productionAuthorized: schema.literal(false), decisions: schema.array(DecisionSelectionSchema, { min: 20, max: 20 }), decisionHash: sha256,
});
export type FounderDecisionRecord = Infer<typeof FounderDecisionRecordSchema>;
const founderBody = { contractVersion: CONTRACT_VERSIONS.founderDecisionRecord, recordId: "backyrd-user-intelligence-founder-decisions-3c-1", sourcePhase: "3B" as const, authority: "FOUNDER_APPROVED_PRODUCT_SEMANTICS" as const, productionAuthorized: false as const, decisions: FROZEN_DECISIONS };
export const FOUNDER_DECISION_RECORD_3C: FounderDecisionRecord = FounderDecisionRecordSchema.parse({ ...founderBody, decisionHash: contentHash(founderBody) });

export const FounderDecisionReleaseSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.founderDecisionRelease), releaseId: identifier, acceptedRecordId: identifier, acceptedRecordVersion: schema.literal(CONTRACT_VERSIONS.founderDecisionRecord), acceptedDecisionHash: sha256, issuer: schema.literal("BACKYRD_PRODUCT_GOVERNANCE"), status: schema.literal("ACCEPTED_FOR_POLICY_DESIGN"), validFrom: timestamp, validUntil: timestamp, productionAuthorized: schema.literal(false), releaseHash: sha256 });
export type FounderDecisionRelease = Infer<typeof FounderDecisionReleaseSchema>;
const founderReleaseBody = { contractVersion: CONTRACT_VERSIONS.founderDecisionRelease, releaseId: "backyrd-founder-decision-release-3c-1", acceptedRecordId: FOUNDER_DECISION_RECORD_3C.recordId, acceptedRecordVersion: CONTRACT_VERSIONS.founderDecisionRecord, acceptedDecisionHash: FOUNDER_DECISION_RECORD_3C.decisionHash, issuer: "BACKYRD_PRODUCT_GOVERNANCE" as const, status: "ACCEPTED_FOR_POLICY_DESIGN" as const, validFrom: RELEASE_VALID_FROM, validUntil: RELEASE_VALID_UNTIL, productionAuthorized: false as const };
export const FOUNDER_DECISION_RELEASE_3C: FounderDecisionRelease = FounderDecisionReleaseSchema.parse({ ...founderReleaseBody, releaseHash: contentHash(founderReleaseBody) });

export const FounderDecisionTrustAnchorSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.founderDecisionTrustAnchor), anchorId: identifier, acceptedReleaseId: identifier, acceptedReleaseHash: sha256, acceptedDecisionHash: sha256, issuer: schema.literal("BACKYRD_CTO_RELEASE_REGISTRY"), environment: schema.literal("CANONICAL_REPOSITORY_RELEASE"), validFrom: timestamp, validUntil: timestamp, productionAuthorized: schema.literal(false), anchorHash: sha256 });
export type FounderDecisionTrustAnchor = Infer<typeof FounderDecisionTrustAnchorSchema>;
const founderAnchorBody = { contractVersion: CONTRACT_VERSIONS.founderDecisionTrustAnchor, anchorId: "backyrd-founder-decision-anchor-3c-1", acceptedReleaseId: FOUNDER_DECISION_RELEASE_3C.releaseId, acceptedReleaseHash: FOUNDER_DECISION_RELEASE_3C.releaseHash, acceptedDecisionHash: FOUNDER_DECISION_RECORD_3C.decisionHash, issuer: "BACKYRD_CTO_RELEASE_REGISTRY" as const, environment: "CANONICAL_REPOSITORY_RELEASE" as const, validFrom: RELEASE_VALID_FROM, validUntil: RELEASE_VALID_UNTIL, productionAuthorized: false as const };
export const FOUNDER_DECISION_TRUST_ANCHOR_3C: FounderDecisionTrustAnchor = FounderDecisionTrustAnchorSchema.parse({ ...founderAnchorBody, anchorHash: contentHash(founderAnchorBody) });

export const PRODUCT_POLICY_EVENT_TYPES = Object.freeze([
  "SHOWN", "OPENED", "DISMISSED", "REJECTED", "REJECT_REASON", "ALTERNATIVE_REQUESTED", "SAVED", "SAVE_REMOVED", "NAVIGATION_STARTED", "RESERVATION_INTENT", "VISITED", "STANDARD_REVIEW", "SMART_REVIEW", "EXPLICIT_SATISFACTION", "EXPLICIT_DISSATISFACTION", "EXPLICIT_UNDECIDED", "REVIEW_MOODS", "MOMENT_CREATED", "SEARCH", "DWELL", "QUICK_SKIP", "REPEAT_VISIT", "CORRECTION", "MOOD_CONTEXT_SELECTED", "EXPLORATION_CONTROL_SELECTED", "SPOT_NOT_FIT",
] as const);
export type ProductPolicyEventType = typeof PRODUCT_POLICY_EVENT_TYPES[number];
const EFFECT_CLASSES = ["EXPLICIT_STRONG", "CONTEXTUAL_REPEATED", "WEAK_CONTEXTUAL_NEGATIVE", "NEUTRAL_STATE", "RESEARCH_ONLY", "NO_TASTE_EFFECT"] as const;
const MODEL_TARGETS = ["NONE", "EXPERIENCE_SUPPORT", "DIRECT_SPOT_PLANNING", "DIRECT_SPOT_AFFINITY", "FAMILIARITY", "RECENT_SEARCH_INTENT", "CONTEXTUAL_SEARCH_READINESS", "CONCEPT_PROMOTION_READINESS", "CONTEXTUAL_CONCEPT_TASTE", "LONG_TERM_CONCEPT_TASTE", "AVERSION", "INTERACTION_ATTENTION", "CURRENT_DECISION_CONTEXT", "EXPLORATION_REQUEST", "SEMANTIC_CONFLICT"] as const;
const JOURNEY_PRIORITY_CLASSES = ["NONE", "QUICK_SKIP", "CONTEXTUAL_SEARCH", "SPOT_NOT_FIT", "EXPLICIT_OUTCOME"] as const;
const AuthorityRequirementSchema = schema.object({ mode: schema.enum(["ALL_OF", "ANY_OF"] as const), authorities: schema.array(identifier, { min: 1, max: 8 }) });
const ProductEventSemanticsSchema = schema.object({
  eventType: schema.enum(PRODUCT_POLICY_EVENT_TYPES), observationMeaning: schema.string({ min: 4, max: 240 }), authorityRequirement: AuthorityRequirementSchema,
  experienceRequirement: schema.enum(["NONE", "QUALIFIED_EXPERIENCE", "SEPARATE_EXPERIENCE_AUTHORITY", "TARGET_INHERITS"] as const), direction: schema.enum(["POSITIVE", "NEGATIVE", "NEUTRAL", "EXPLICIT_ONLY", "CONTEXTUAL_WEAK_NEGATIVE"] as const),
  semanticTarget: schema.enum(MODEL_TARGETS), contextRequirement: schema.enum(["NONE", "OPTIONAL_PRESERVED", "REQUIRED", "CURRENT_DECISION_ONLY", "TARGET_INHERITS"] as const),
  independenceRule: schema.enum(["NEVER", "ONE_PER_RESOLVED_JOURNEY", "INDEPENDENT_QUALIFIED_ONLY", "TARGET_INHERITS"] as const), journeyPriorityClass: schema.enum(JOURNEY_PRIORITY_CLASSES),
  evidenceClass: schema.enum(EFFECT_CLASSES), sufficiencyContribution: schema.enum(["NONE", "EXPLICIT_DIRECTED", "FAMILIARITY_COUNT", "SEARCH_CONTEXTUAL_PENDING_THRESHOLD", "WEAK_PENDING_THRESHOLD"] as const),
  projectionEligibility: schema.enum(["NEVER", "POLICY_EVALUATION_ONLY", "ELIGIBLE_WHEN_RUNTIME_SEPARATELY_AUTHORIZED"] as const), longTermTransfer: schema.enum(["FORBIDDEN", "NOT_CONFIGURED", "MULTI_SPOT_CERTAIN_ATTRIBUTION_REQUIRED"] as const),
  correctable: schema.boolean(), lifecycleClass: identifier, retentionClass: identifier, prohibitedInterpretations: schema.array(identifier, { min: 1, max: 16 }), reasonCodes: schema.array(identifier, { min: 1, max: 16 }),
});
export type ProductEventSemantics = Infer<typeof ProductEventSemanticsSchema>;

const rule = (eventType: ProductPolicyEventType, input: Omit<ProductEventSemantics, "eventType">): ProductEventSemantics => ProductEventSemanticsSchema.parse({ eventType, ...input });
const base = (observationMeaning: string, overrides: Partial<Omit<ProductEventSemantics, "eventType" | "observationMeaning"> > = {}): Omit<ProductEventSemantics, "eventType"> => ({
  observationMeaning, authorityRequirement: { mode: "ALL_OF", authorities: ["AUTHENTICATED_USER_ACTION"] }, experienceRequirement: "NONE", direction: "NEUTRAL", semanticTarget: "NONE", contextRequirement: "OPTIONAL_PRESERVED", independenceRule: "NEVER", journeyPriorityClass: "NONE", evidenceClass: "NO_TASTE_EFFECT", sufficiencyContribution: "NONE", projectionEligibility: "NEVER", longTermTransfer: "FORBIDDEN", correctable: true, lifecycleClass: "PERSONAL_OBSERVATION", retentionClass: "RETENTION_NOT_CONFIGURED", prohibitedInterpretations: ["NO_IMPLICIT_TASTE"], reasonCodes: ["OBSERVATION_ONLY"], ...overrides,
});
const PRODUCT_RULES: readonly ProductEventSemantics[] = [
  rule("SHOWN", base("Candidate shown", { authorityRequirement: { mode: "ALL_OF", authorities: ["CLIENT_OBSERVATION"] }, prohibitedInterpretations: ["EXPOSURE_IS_INTEREST"], reasonCodes: ["EXPOSURE_NEUTRAL"] })),
  rule("OPENED", base("Spot opened", { authorityRequirement: { mode: "ANY_OF", authorities: ["CLIENT_OBSERVATION", "AUTHENTICATED_USER_ACTION"] }, prohibitedInterpretations: ["OPEN_IS_LIKE", "OPEN_IS_EXPERIENCE"], reasonCodes: ["OPEN_NEUTRAL"] })),
  rule("DISMISSED", base("Presentation dismissed", { prohibitedInterpretations: ["DISMISS_IS_DISLIKE"], reasonCodes: ["DISMISS_NEUTRAL"] })),
  rule("REJECTED", base("Candidate not selected", { prohibitedInterpretations: ["REJECT_IS_AVERSION"], reasonCodes: ["REJECT_UNCONFIGURED"] })),
  rule("REJECT_REASON", base("Structured reject reason", { semanticTarget: "CURRENT_DECISION_CONTEXT", contextRequirement: "REQUIRED", evidenceClass: "WEAK_CONTEXTUAL_NEGATIVE", sufficiencyContribution: "WEAK_PENDING_THRESHOLD", projectionEligibility: "POLICY_EVALUATION_ONLY", prohibitedInterpretations: ["REASON_IS_GLOBAL_TASTE"], reasonCodes: ["REJECT_REASON_CONTEXT_BOUND"] })),
  rule("ALTERNATIVE_REQUESTED", base("Alternative requested", { semanticTarget: "EXPLORATION_REQUEST", contextRequirement: "CURRENT_DECISION_ONLY", prohibitedInterpretations: ["ALTERNATIVE_IS_REJECTION", "ALTERNATIVE_IS_EXPLORATION_PREFERENCE"], reasonCodes: ["ALTERNATIVE_NEUTRAL"] })),
  rule("SAVED", base("Save persisted", { authorityRequirement: { mode: "ANY_OF", authorities: ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"] }, semanticTarget: "DIRECT_SPOT_PLANNING", independenceRule: "ONE_PER_RESOLVED_JOURNEY", evidenceClass: "NEUTRAL_STATE", projectionEligibility: "ELIGIBLE_WHEN_RUNTIME_SEPARATELY_AUTHORIZED", prohibitedInterpretations: ["SAVE_IS_SATISFACTION", "SAVE_IS_CONCEPT_TASTE"], reasonCodes: ["PLANNING_STATE_ACTIVE"] })),
  rule("SAVE_REMOVED", base("Save state removed", { authorityRequirement: { mode: "ANY_OF", authorities: ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"] }, semanticTarget: "DIRECT_SPOT_PLANNING", prohibitedInterpretations: ["REMOVAL_IS_DISLIKE", "REMOVAL_CHANGES_EXPERIENCE_EVIDENCE"], reasonCodes: ["PLANNING_STATE_ENDED"] })),
  rule("NAVIGATION_STARTED", base("Navigation intent started", { contextRequirement: "CURRENT_DECISION_ONLY", prohibitedInterpretations: ["NAVIGATION_IS_VISIT", "NAVIGATION_IS_SATISFACTION"], reasonCodes: ["NAVIGATION_INTENT_ONLY"] })),
  rule("RESERVATION_INTENT", base("Reservation intent persisted", { authorityRequirement: { mode: "ALL_OF", authorities: ["SERVER_VERIFIED_PRODUCT_STATE"] }, prohibitedInterpretations: ["RESERVATION_IS_VISIT"], reasonCodes: ["RESERVATION_INTENT_ONLY"] })),
  rule("VISITED", base("Verified visit", { authorityRequirement: { mode: "ALL_OF", authorities: ["VERIFIED_OUTCOME"] }, experienceRequirement: "QUALIFIED_EXPERIENCE", semanticTarget: "FAMILIARITY", independenceRule: "INDEPENDENT_QUALIFIED_ONLY", evidenceClass: "NEUTRAL_STATE", sufficiencyContribution: "FAMILIARITY_COUNT", projectionEligibility: "ELIGIBLE_WHEN_RUNTIME_SEPARATELY_AUTHORIZED", prohibitedInterpretations: ["VISIT_IS_SATISFACTION", "VISIT_IS_POSITIVE_TASTE"], reasonCodes: ["VERIFIED_EXPERIENCE", "FAMILIARITY_AFTER_THREE"] })),
  rule("STANDARD_REVIEW", base("Review experience", { authorityRequirement: { mode: "ALL_OF", authorities: ["SERVER_VERIFIED_PRODUCT_STATE"] }, experienceRequirement: "QUALIFIED_EXPERIENCE", independenceRule: "ONE_PER_RESOLVED_JOURNEY", prohibitedInterpretations: ["REVIEW_IS_SATISFACTION", "REVIEW_ENTRY_CHANGES_SEMANTICS"], reasonCodes: ["REVIEW_EXPERIENCE_ONLY"] })),
  rule("SMART_REVIEW", base("Review experience", { authorityRequirement: { mode: "ALL_OF", authorities: ["SERVER_VERIFIED_PRODUCT_STATE"] }, experienceRequirement: "QUALIFIED_EXPERIENCE", independenceRule: "ONE_PER_RESOLVED_JOURNEY", prohibitedInterpretations: ["REVIEW_IS_SATISFACTION", "REVIEW_ENTRY_CHANGES_SEMANTICS"], reasonCodes: ["REVIEW_EXPERIENCE_ONLY"] })),
  rule("EXPLICIT_SATISFACTION", base("Explicit has fitted outcome", { authorityRequirement: { mode: "ALL_OF", authorities: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"] }, experienceRequirement: "QUALIFIED_EXPERIENCE", direction: "POSITIVE", semanticTarget: "DIRECT_SPOT_AFFINITY", contextRequirement: "OPTIONAL_PRESERVED", independenceRule: "ONE_PER_RESOLVED_JOURNEY", journeyPriorityClass: "EXPLICIT_OUTCOME", evidenceClass: "EXPLICIT_STRONG", sufficiencyContribution: "EXPLICIT_DIRECTED", projectionEligibility: "ELIGIBLE_WHEN_RUNTIME_SEPARATELY_AUTHORIZED", longTermTransfer: "MULTI_SPOT_CERTAIN_ATTRIBUTION_REQUIRED", prohibitedInterpretations: ["SATISFACTION_ATTRIBUTES_ALL_CONCEPTS", "SATISFACTION_IS_RANKING_AUTHORITY"], reasonCodes: ["EXPLICIT_POSITIVE_OUTCOME"] })),
  rule("EXPLICIT_DISSATISFACTION", base("Explicit has not fitted outcome", { authorityRequirement: { mode: "ALL_OF", authorities: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"] }, experienceRequirement: "QUALIFIED_EXPERIENCE", direction: "NEGATIVE", semanticTarget: "AVERSION", contextRequirement: "OPTIONAL_PRESERVED", independenceRule: "ONE_PER_RESOLVED_JOURNEY", journeyPriorityClass: "EXPLICIT_OUTCOME", evidenceClass: "EXPLICIT_STRONG", sufficiencyContribution: "EXPLICIT_DIRECTED", projectionEligibility: "ELIGIBLE_WHEN_RUNTIME_SEPARATELY_AUTHORIZED", longTermTransfer: "MULTI_SPOT_CERTAIN_ATTRIBUTION_REQUIRED", prohibitedInterpretations: ["DISSATISFACTION_IS_OBJECTIVE_QUALITY", "DISSATISFACTION_IS_ELIGIBILITY"], reasonCodes: ["EXPLICIT_NEGATIVE_PERSONAL_FIT"] })),
  rule("EXPLICIT_UNDECIDED", base("Explicit cannot assess response", { experienceRequirement: "QUALIFIED_EXPERIENCE", prohibitedInterpretations: ["UNDECIDED_HAS_DIRECTION"], reasonCodes: ["SATISFACTION_UNKNOWN"] })),
  rule("REVIEW_MOODS", base("Review mood describes spot experience", { authorityRequirement: { mode: "ALL_OF", authorities: ["SERVER_VERIFIED_PRODUCT_STATE"] }, experienceRequirement: "QUALIFIED_EXPERIENCE", prohibitedInterpretations: ["REVIEW_MOOD_IS_USER_TASTE", "REVIEW_MOOD_INCREASES_TASTE_SUFFICIENCY"], reasonCodes: ["WORLD_EXPERIENCE_DESCRIPTION_ONLY"] })),
  rule("MOMENT_CREATED", base("Moment content created", { authorityRequirement: { mode: "ALL_OF", authorities: ["SERVER_VERIFIED_PRODUCT_STATE", "VERIFIED_OUTCOME"] }, experienceRequirement: "SEPARATE_EXPERIENCE_AUTHORITY", prohibitedInterpretations: ["MOMENT_IS_SATISFACTION", "MOMENT_IS_TASTE", "MOMENT_PROPAGATES_SOCIAL"], reasonCodes: ["EXPERIENCE_SUPPORT_ONLY"] })),
  rule("SEARCH", base("Minimized structured search intent", { authorityRequirement: { mode: "ALL_OF", authorities: ["AUTHENTICATED_USER_ACTION", "SERVER_MINIMIZATION_SERVICE"] }, semanticTarget: "RECENT_SEARCH_INTENT", contextRequirement: "REQUIRED", independenceRule: "INDEPENDENT_QUALIFIED_ONLY", journeyPriorityClass: "CONTEXTUAL_SEARCH", evidenceClass: "CONTEXTUAL_REPEATED", sufficiencyContribution: "SEARCH_CONTEXTUAL_PENDING_THRESHOLD", projectionEligibility: "NEVER", longTermTransfer: "NOT_CONFIGURED", prohibitedInterpretations: ["RAW_SEARCH_IS_PROFILE", "SINGLE_SEARCH_IS_LONG_TERM_TASTE", "SEARCH_IS_EXPERIENCE", "SEARCH_IS_SATISFACTION"], reasonCodes: ["CURRENT_SEARCH_INTENT", "SEARCH_PROMOTION_NOT_CONFIGURED"] })),
  rule("DWELL", base("Interaction attention duration", { authorityRequirement: { mode: "ALL_OF", authorities: ["CLIENT_OBSERVATION", "SERVER_MINIMIZATION_SERVICE"] }, semanticTarget: "INTERACTION_ATTENTION", evidenceClass: "RESEARCH_ONLY", lifecycleClass: "ATTENTION_RESEARCH_OBSERVATION", retentionClass: "ATTENTION_RETENTION_NOT_CONFIGURED", prohibitedInterpretations: ["DWELL_IS_TASTE", "DWELL_IS_EXPERIENCE", "DWELL_INCREASES_TASTE_SUFFICIENCY"], reasonCodes: ["ATTENTION_SEPARATE_NOT_AUTHORIZED"] })),
  rule("QUICK_SKIP", base("Weak contextual skip", { semanticTarget: "DIRECT_SPOT_AFFINITY", contextRequirement: "REQUIRED", independenceRule: "ONE_PER_RESOLVED_JOURNEY", journeyPriorityClass: "QUICK_SKIP", evidenceClass: "WEAK_CONTEXTUAL_NEGATIVE", sufficiencyContribution: "WEAK_PENDING_THRESHOLD", projectionEligibility: "NEVER", longTermTransfer: "FORBIDDEN", prohibitedInterpretations: ["SKIP_IS_GLOBAL_AVERSION", "SKIP_IS_CONCEPT_AVERSION"], reasonCodes: ["WEAK_SPOT_DECISION_CONTEXT_NEGATIVE", "SKIP_MATURITY_NOT_CONFIGURED"] })),
  rule("REPEAT_VISIT", base("Independent verified repeat visit", { authorityRequirement: { mode: "ALL_OF", authorities: ["VERIFIED_OUTCOME"] }, experienceRequirement: "QUALIFIED_EXPERIENCE", semanticTarget: "FAMILIARITY", independenceRule: "INDEPENDENT_QUALIFIED_ONLY", evidenceClass: "NEUTRAL_STATE", sufficiencyContribution: "FAMILIARITY_COUNT", projectionEligibility: "ELIGIBLE_WHEN_RUNTIME_SEPARATELY_AUTHORIZED", prohibitedInterpretations: ["REPEAT_IS_LIKE"], reasonCodes: ["FAMILIARITY_AFTER_THREE"] })),
  rule("CORRECTION", base("Append-only correction", { authorityRequirement: { mode: "ALL_OF", authorities: ["AUTHENTICATED_USER_ACTION", "SERVER_EVENT_LEDGER"] }, experienceRequirement: "TARGET_INHERITS", contextRequirement: "TARGET_INHERITS", independenceRule: "TARGET_INHERITS", prohibitedInterpretations: ["CORRECTION_REWRITES_HISTORY"], reasonCodes: ["TARGET_ACTIVE_INFLUENCE_REMOVED"] })),
  rule("MOOD_CONTEXT_SELECTED", base("Mood selected for current decision", { semanticTarget: "CURRENT_DECISION_CONTEXT", contextRequirement: "CURRENT_DECISION_ONLY", evidenceClass: "NEUTRAL_STATE", projectionEligibility: "POLICY_EVALUATION_ONLY", prohibitedInterpretations: ["SEARCHED_MOOD_IS_LONG_TERM_TASTE"], reasonCodes: ["CURRENT_DECISION_CONTEXT_ONLY"] })),
  rule("EXPLORATION_CONTROL_SELECTED", base("Explicit current exploration control", { semanticTarget: "EXPLORATION_REQUEST", contextRequirement: "CURRENT_DECISION_ONLY", evidenceClass: "NEUTRAL_STATE", projectionEligibility: "ELIGIBLE_WHEN_RUNTIME_SEPARATELY_AUTHORIZED", prohibitedInterpretations: ["EXPLORATION_CONTROL_IS_PERSONALITY"], reasonCodes: ["CURRENT_EXPLORATION_INTENT"] })),
  rule("SPOT_NOT_FIT", base("Explicit spot does not fit current request", { authorityRequirement: { mode: "ALL_OF", authorities: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"] }, direction: "CONTEXTUAL_WEAK_NEGATIVE", semanticTarget: "DIRECT_SPOT_AFFINITY", contextRequirement: "REQUIRED", independenceRule: "ONE_PER_RESOLVED_JOURNEY", journeyPriorityClass: "SPOT_NOT_FIT", evidenceClass: "WEAK_CONTEXTUAL_NEGATIVE", sufficiencyContribution: "WEAK_PENDING_THRESHOLD", projectionEligibility: "NEVER", prohibitedInterpretations: ["SPOT_NOT_FIT_IS_GLOBAL_AVERSION"], reasonCodes: ["SPOT_DECISION_CONTEXT_NEGATIVE"] })),
] satisfies readonly ProductEventSemantics[];

export const ProductSignalSemanticsRegistrySchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.productSignalSemanticsRegistry), registryId: identifier, registryVersion: identifier, authority: schema.literal("PRODUCT_SEMANTICS_RELEASE"), productionAuthorized: schema.literal(false), entries: schema.array(ProductEventSemanticsSchema, { min: PRODUCT_POLICY_EVENT_TYPES.length, max: PRODUCT_POLICY_EVENT_TYPES.length }), registryHash: sha256 });
export type ProductSignalSemanticsRegistry = Infer<typeof ProductSignalSemanticsRegistrySchema>;
const registryBody = { contractVersion: CONTRACT_VERSIONS.productSignalSemanticsRegistry, registryId: "backyrd-user-intelligence-product-signal-semantics", registryVersion: "backyrd.user-intelligence.signal-semantics@3c-1", authority: "PRODUCT_SEMANTICS_RELEASE" as const, productionAuthorized: false as const, entries: PRODUCT_RULES };
export const PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C: ProductSignalSemanticsRegistry = ProductSignalSemanticsRegistrySchema.parse({ ...registryBody, registryHash: contentHash(registryBody) });

export function parseProductSignalSemanticsRegistry(value: unknown): ProductSignalSemanticsRegistry {
  const parsed = ProductSignalSemanticsRegistrySchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "registryHash")) !== parsed.registryHash || !same(parsed, PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C)) throw new ContractValidationError("$.registryHash", "unaccepted Product signal semantics registry");
  if (new Set(parsed.entries.map(({ eventType }) => eventType)).size !== PRODUCT_POLICY_EVENT_TYPES.length) throw new ContractValidationError("$.entries", "registry event types must be unique");
  const standard = parsed.entries.find(({ eventType }) => eventType === "STANDARD_REVIEW")!; const smart = parsed.entries.find(({ eventType }) => eventType === "SMART_REVIEW")!;
  if (!same({ ...standard, eventType: "REVIEW", observationMeaning: "review experience" }, { ...smart, eventType: "REVIEW", observationMeaning: "review experience" })) throw new ContractValidationError("$.entries", "standard and smart review semantics differ");
  return parsed;
}

export const ProductInterpretationPolicySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.productInterpretationPolicy), policyId: identifier, policyVersion: identifier,
  authority: schema.literal("FOUNDER_AND_CTO_APPROVED_SPECIFICATION"), founderDecisionRecord: schema.object({ recordId: identifier, decisionHash: sha256 }), signalRegistry: schema.object({ registryVersion: identifier, registryHash: sha256 }),
  qualitativeEvidenceClasses: schema.array(schema.enum(EFFECT_CLASSES), { min: EFFECT_CLASSES.length, max: EFFECT_CLASSES.length }),
  satisfactionResponses: schema.object({ matched: schema.literal("HAS_MATCHED"), notMatched: schema.literal("HAS_NOT_MATCHED"), cannotAssessOrSkipped: schema.literal("CANNOT_ASSESS_OR_SKIPPED"), missingResponse: schema.literal("INVALID") }),
  familiarityIndependentVisitThreshold: schema.literal(3), directedJourneyPriority: schema.array(schema.enum(["EXPLICIT_OUTCOME", "SPOT_NOT_FIT", "CONTEXTUAL_SEARCH", "QUICK_SKIP"] as const), { min: 4, max: 4 }),
  interactionAttentionBoundary: schema.object({ purpose: schema.literal("INTERACTION_ATTENTION_RESEARCH"), authority: schema.literal("SERVER_MINIMIZED_OBSERVATION"), lifecycleClass: schema.literal("ATTENTION_RESEARCH_OBSERVATION"), retentionClass: schema.literal("ATTENTION_RETENTION_NOT_CONFIGURED"), decisionAuthorized: schema.literal(false), tasteAuthorized: schema.literal(false), productionAuthorized: schema.literal(false) }),
  contextAllowlist: schema.array(schema.enum(["COMPANY_TYPE", "DAY_PHASE", "COARSE_TIME_BUDGET", "REQUESTED_MOOD_CONCEPT"] as const), { min: 4, max: 4 }),
  transitions: schema.object({ searchContextualMaturity: schema.literal("NOT_CONFIGURED"), searchLongTermPromotion: schema.literal("NOT_CONFIGURED"), skipMaturity: schema.literal("NOT_CONFIGURED"), conceptTasteMinimumIndependentSpots: schema.literal("NOT_CONFIGURED"), retentionDurations: schema.literal("NOT_CONFIGURED"), automaticDecay: schema.literal("FORBIDDEN") }),
  privacyVisibility: schema.object({ normalProductTasteProfileVisible: schema.literal(false), individualTasteCorrectionUi: schema.literal(false), legalExportSupportsRequiredDerivedData: schema.literal(true) }),
  worldUnknownPolicy: schema.object({ defaultEligibilityExclusion: schema.literal(false), preferKnownTrueWhenOtherwiseComparable: schema.literal(true), hardConstraintAuthority: schema.literal("DECISION_VNEXT_ONLY") }),
  productionAuthorized: schema.literal(false), runtimeActivated: schema.literal(false), shadowTrafficAuthorized: schema.literal(false), rankingAuthorized: schema.literal(false), eligibilityAuthorized: schema.literal(false),
  limitations: schema.array(identifier, { min: 1, max: 32 }), policyHash: sha256,
});
export type ProductInterpretationPolicy = Infer<typeof ProductInterpretationPolicySchema>;
const policyBody = { contractVersion: CONTRACT_VERSIONS.productInterpretationPolicy, policyId: "backyrd-user-intelligence-product-interpretation", policyVersion: CONTRACT_VERSIONS.productInterpretationPolicy, authority: "FOUNDER_AND_CTO_APPROVED_SPECIFICATION" as const, founderDecisionRecord: { recordId: FOUNDER_DECISION_RECORD_3C.recordId, decisionHash: FOUNDER_DECISION_RECORD_3C.decisionHash }, signalRegistry: { registryVersion: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryVersion, registryHash: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash }, qualitativeEvidenceClasses: EFFECT_CLASSES, satisfactionResponses: { matched: "HAS_MATCHED" as const, notMatched: "HAS_NOT_MATCHED" as const, cannotAssessOrSkipped: "CANNOT_ASSESS_OR_SKIPPED" as const, missingResponse: "INVALID" as const }, familiarityIndependentVisitThreshold: 3 as const, directedJourneyPriority: ["EXPLICIT_OUTCOME", "SPOT_NOT_FIT", "CONTEXTUAL_SEARCH", "QUICK_SKIP"] as const, interactionAttentionBoundary: { purpose: "INTERACTION_ATTENTION_RESEARCH" as const, authority: "SERVER_MINIMIZED_OBSERVATION" as const, lifecycleClass: "ATTENTION_RESEARCH_OBSERVATION" as const, retentionClass: "ATTENTION_RETENTION_NOT_CONFIGURED" as const, decisionAuthorized: false as const, tasteAuthorized: false as const, productionAuthorized: false as const }, contextAllowlist: ["COMPANY_TYPE", "DAY_PHASE", "COARSE_TIME_BUDGET", "REQUESTED_MOOD_CONCEPT"] as const, transitions: { searchContextualMaturity: "NOT_CONFIGURED" as const, searchLongTermPromotion: "NOT_CONFIGURED" as const, skipMaturity: "NOT_CONFIGURED" as const, conceptTasteMinimumIndependentSpots: "NOT_CONFIGURED" as const, retentionDurations: "NOT_CONFIGURED" as const, automaticDecay: "FORBIDDEN" as const }, privacyVisibility: { normalProductTasteProfileVisible: false as const, individualTasteCorrectionUi: false as const, legalExportSupportsRequiredDerivedData: true as const }, worldUnknownPolicy: { defaultEligibilityExclusion: false as const, preferKnownTrueWhenOtherwiseComparable: true as const, hardConstraintAuthority: "DECISION_VNEXT_ONLY" as const }, productionAuthorized: false as const, runtimeActivated: false as const, shadowTrafficAuthorized: false as const, rankingAuthorized: false as const, eligibilityAuthorized: false as const, limitations: ["NO_PRODUCTION_ACTIVATION", "NO_NUMERIC_WEIGHTS", "NO_FINAL_SEARCH_OR_SKIP_THRESHOLDS", "NO_RETENTION_DURATIONS", "NO_RANKING_OR_ELIGIBILITY_AUTHORITY", "NO_TASTE_PROFILE_PRODUCT_UI"] };
export const PRODUCT_INTERPRETATION_POLICY_3C: ProductInterpretationPolicy = ProductInterpretationPolicySchema.parse({ ...policyBody, policyHash: contentHash(policyBody) });

export const ProductPolicyReleaseSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.productPolicyRelease), releaseId: identifier, acceptedPolicyId: identifier, acceptedPolicyVersion: identifier, acceptedPolicyHash: sha256, acceptedDecisionHash: sha256, acceptedRegistryHash: sha256, issuer: schema.literal("BACKYRD_USER_INTELLIGENCE_RELEASE_AUTHORITY"), status: schema.literal("SPECIFICATION_ACCEPTED_RUNTIME_INACTIVE"), validFrom: timestamp, validUntil: timestamp, productionAuthorized: schema.literal(false), releaseHash: sha256 });
export type ProductPolicyRelease = Infer<typeof ProductPolicyReleaseSchema>;
const policyReleaseBody = { contractVersion: CONTRACT_VERSIONS.productPolicyRelease, releaseId: "backyrd-user-intelligence-policy-release-3c-1", acceptedPolicyId: PRODUCT_INTERPRETATION_POLICY_3C.policyId, acceptedPolicyVersion: PRODUCT_INTERPRETATION_POLICY_3C.policyVersion, acceptedPolicyHash: PRODUCT_INTERPRETATION_POLICY_3C.policyHash, acceptedDecisionHash: FOUNDER_DECISION_RECORD_3C.decisionHash, acceptedRegistryHash: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash, issuer: "BACKYRD_USER_INTELLIGENCE_RELEASE_AUTHORITY" as const, status: "SPECIFICATION_ACCEPTED_RUNTIME_INACTIVE" as const, validFrom: RELEASE_VALID_FROM, validUntil: RELEASE_VALID_UNTIL, productionAuthorized: false as const };
export const PRODUCT_POLICY_RELEASE_3C: ProductPolicyRelease = ProductPolicyReleaseSchema.parse({ ...policyReleaseBody, releaseHash: contentHash(policyReleaseBody) });

export const PHASE3C_RELEASE_ARTIFACT_BODY = Object.freeze({ contractVersion: "backyrd.user-intelligence.product-policy-release-artifact@3c-1", productionAuthorized: false as const, runtimeActivated: false as const, shadowTrafficAuthorized: false as const, rankingAuthorized: false as const, eligibilityAuthorized: false as const, founderDecisionRecord: FOUNDER_DECISION_RECORD_3C, founderDecisionRelease: FOUNDER_DECISION_RELEASE_3C, productPolicy: PRODUCT_INTERPRETATION_POLICY_3C, productPolicyRelease: PRODUCT_POLICY_RELEASE_3C, signalRegistry: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C, lifecycleManifestHash: USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH });
export const PHASE3C_RELEASE_ARTIFACT_HASH = contentHash(PHASE3C_RELEASE_ARTIFACT_BODY);
export const ProductPolicyTrustAnchorSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.productPolicyTrustAnchor), anchorId: identifier, acceptedReleaseId: identifier, acceptedReleaseHash: sha256, acceptedReleaseArtifactHash: sha256, acceptedPolicyHash: sha256, acceptedRegistryHash: sha256, acceptedDecisionHash: sha256, acceptedDecisionAnchorHash: sha256, issuer: schema.literal("BACKYRD_CTO_RELEASE_REGISTRY"), environment: schema.literal("CANONICAL_REPOSITORY_RELEASE"), validFrom: timestamp, validUntil: timestamp, productionAuthorized: schema.literal(false), anchorHash: sha256 });
export type ProductPolicyTrustAnchor = Infer<typeof ProductPolicyTrustAnchorSchema>;
const policyAnchorBody = { contractVersion: CONTRACT_VERSIONS.productPolicyTrustAnchor, anchorId: "backyrd-user-intelligence-policy-anchor-3c-1", acceptedReleaseId: PRODUCT_POLICY_RELEASE_3C.releaseId, acceptedReleaseHash: PRODUCT_POLICY_RELEASE_3C.releaseHash, acceptedReleaseArtifactHash: PHASE3C_RELEASE_ARTIFACT_HASH, acceptedPolicyHash: PRODUCT_INTERPRETATION_POLICY_3C.policyHash, acceptedRegistryHash: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash, acceptedDecisionHash: FOUNDER_DECISION_RECORD_3C.decisionHash, acceptedDecisionAnchorHash: FOUNDER_DECISION_TRUST_ANCHOR_3C.anchorHash, issuer: "BACKYRD_CTO_RELEASE_REGISTRY" as const, environment: "CANONICAL_REPOSITORY_RELEASE" as const, validFrom: RELEASE_VALID_FROM, validUntil: RELEASE_VALID_UNTIL, productionAuthorized: false as const };
export const PRODUCT_POLICY_TRUST_ANCHOR_3C: ProductPolicyTrustAnchor = ProductPolicyTrustAnchorSchema.parse({ ...policyAnchorBody, anchorHash: contentHash(policyAnchorBody) });

export interface Phase3CReleaseTrustContext { readonly verifiedAt: string; getFounderDecisionRelease(recordId: string): unknown; getFounderDecisionTrustAnchor(anchorId: string): unknown; getProductPolicyRelease(policyId: string): unknown; getProductPolicyTrustAnchor(anchorId: string): unknown; }
export function verifyProductInterpretationPolicy(value: unknown, trust: Phase3CReleaseTrustContext): ProductInterpretationPolicy {
  const policy = ProductInterpretationPolicySchema.parse(value); parseProductSignalSemanticsRegistry(PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C);
  const verifiedAt = Date.parse(timestamp.parse(trust.verifiedAt));
  if (contentHash(withoutHash(policy as unknown as Record<string, unknown>, "policyHash")) !== policy.policyHash) throw new ContractValidationError("$.policyHash", "Product policy hash mismatch");
  const founder = FounderDecisionRecordSchema.parse(FOUNDER_DECISION_RECORD_3C); if (contentHash(withoutHash(founder as unknown as Record<string, unknown>, "decisionHash")) !== founder.decisionHash || !same(founder.decisions, FROZEN_DECISIONS)) throw new ContractValidationError("$.founderDecisionRecord", "Founder decisions are not canonical");
  const founderRelease = FounderDecisionReleaseSchema.parse(trust.getFounderDecisionRelease(founder.recordId)); const founderAnchor = FounderDecisionTrustAnchorSchema.parse(trust.getFounderDecisionTrustAnchor(FOUNDER_DECISION_TRUST_ANCHOR_3C.anchorId));
  if (!same(founderRelease, FOUNDER_DECISION_RELEASE_3C) || !same(founderAnchor, FOUNDER_DECISION_TRUST_ANCHOR_3C)) throw new ContractValidationError("$.founderAuthority", "Founder record is not independently accepted");
  if (verifiedAt < Date.parse(founderRelease.validFrom) || verifiedAt > Date.parse(founderRelease.validUntil) || verifiedAt < Date.parse(founderAnchor.validFrom) || verifiedAt > Date.parse(founderAnchor.validUntil)) throw new ContractValidationError("$.founderAuthority", "Founder authority is outside its accepted validity window");
  const release = ProductPolicyReleaseSchema.parse(trust.getProductPolicyRelease(policy.policyId)); const anchor = ProductPolicyTrustAnchorSchema.parse(trust.getProductPolicyTrustAnchor(PRODUCT_POLICY_TRUST_ANCHOR_3C.anchorId));
  if (!same(release, PRODUCT_POLICY_RELEASE_3C) || !same(anchor, PRODUCT_POLICY_TRUST_ANCHOR_3C) || release.acceptedPolicyHash !== policy.policyHash || anchor.acceptedPolicyHash !== policy.policyHash || anchor.acceptedRegistryHash !== PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash || anchor.acceptedDecisionHash !== founder.decisionHash || anchor.acceptedReleaseArtifactHash !== PHASE3C_RELEASE_ARTIFACT_HASH) throw new ContractValidationError("$.policyAuthority", "Product policy is not independently accepted");
  if (verifiedAt < Date.parse(release.validFrom) || verifiedAt > Date.parse(release.validUntil) || verifiedAt < Date.parse(anchor.validFrom) || verifiedAt > Date.parse(anchor.validUntil)) throw new ContractValidationError("$.policyAuthority", "Product policy authority is outside its accepted validity window");
  if (!same(policy, PRODUCT_INTERPRETATION_POLICY_3C)) throw new ContractValidationError("$", "unknown Product interpretation policy");
  return policy;
}

export const ProductPolicyObservationSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.productPolicyObservation), recordId: identifier, subjectBindingHash: sha256, eventType: schema.enum(PRODUCT_POLICY_EVENT_TYPES), occurredAt: timestamp, active: schema.boolean(), sourceMode: schema.enum(["PHASE2_VERIFIED_ADAPTER", "SYNTHETIC_FUTURE_EVENT_FIXTURE"] as const), sourceEvidenceHash: sha256, sourceChainHash: sha256, authorityProofs: schema.array(identifier, { min: 1, max: 8 }), journeyId: schema.nullable(identifier), independenceEligible: schema.boolean(), spotId: schema.nullable(identifier), decisionId: schema.nullable(identifier), contextHash: schema.nullable(sha256), contextDimensions: schema.array(schema.enum(["COMPANY_TYPE", "DAY_PHASE", "COARSE_TIME_BUDGET", "REQUESTED_MOOD_CONCEPT"] as const), { max: 4 }), conceptIds: schema.array(identifier, { max: 16 }), worldAttribution: schema.enum(["NOT_APPLICABLE", "CERTAIN", "UNKNOWN", "CONFLICTING"] as const), experienceConfirmed: schema.boolean(), satisfactionResponse: schema.nullable(schema.enum(["HAS_MATCHED", "HAS_NOT_MATCHED", "CANNOT_ASSESS_OR_SKIPPED"] as const)), explorationChoice: schema.nullable(schema.enum(["NEW", "FAMILIAR", "EITHER"] as const)), correctionTargetRecordId: schema.nullable(identifier), correctionTargetSourceEvidenceHash: schema.nullable(sha256), rawSensitiveDataIncluded: schema.literal(false), recordHash: sha256 });
export type ProductPolicyObservation = Infer<typeof ProductPolicyObservationSchema>;
export const withProductPolicyObservationHash = (value: Omit<ProductPolicyObservation, "recordHash">): ProductPolicyObservation => ProductPolicyObservationSchema.parse({ ...value, recordHash: contentHash(value) });
export const ProductPolicyEvidenceAnchorSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.productPolicyEvidenceAnchor), anchorId: identifier, acceptedRecordId: identifier, acceptedRecordHash: sha256, acceptedSourceEvidenceHash: sha256, acceptedSourceChainHash: sha256, subjectBindingHash: sha256, issuer: schema.literal("SYNTHETIC_PHASE3C_EVALUATION_AUTHORITY"), productionAuthorized: schema.literal(false), anchorHash: sha256 });
export type ProductPolicyEvidenceAnchor = Infer<typeof ProductPolicyEvidenceAnchorSchema>;
export const withProductPolicyEvidenceAnchorHash = (value: Omit<ProductPolicyEvidenceAnchor, "anchorHash">): ProductPolicyEvidenceAnchor => ProductPolicyEvidenceAnchorSchema.parse({ ...value, anchorHash: contentHash(value) });
export interface Phase3CEvidenceTrustContext { getAcceptedEvidenceAnchor(recordId: string): unknown; }

function verifyObservation(value: unknown, subject: string, trust: Phase3CEvidenceTrustContext): ProductPolicyObservation {
  const row = ProductPolicyObservationSchema.parse(value); if (row.subjectBindingHash !== subject || contentHash(withoutHash(row as unknown as Record<string, unknown>, "recordHash")) !== row.recordHash) throw new ContractValidationError("$.observations", "observation identity or hash mismatch");
  const semantics = PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.entries.find(({ eventType }) => eventType === row.eventType)!;
  const present = new Set(row.authorityProofs); const authorityOk = semantics.authorityRequirement.mode === "ALL_OF" ? semantics.authorityRequirement.authorities.every((authority) => present.has(authority)) : semantics.authorityRequirement.authorities.some((authority) => present.has(authority));
  if (!authorityOk) throw new ContractValidationError("$.authorityProofs", "Product event authority requirement is not met");
  if (semantics.contextRequirement === "REQUIRED" && (row.contextHash === null || row.contextDimensions.length === 0)) throw new ContractValidationError("$.contextHash", "event requires authorized context");
  if (semantics.contextRequirement === "CURRENT_DECISION_ONLY" && row.decisionId === null) throw new ContractValidationError("$.decisionId", "event requires the current server-bound Decision");
  if (["QUALIFIED_EXPERIENCE", "SEPARATE_EXPERIENCE_AUTHORITY"].includes(semantics.experienceRequirement) && !row.experienceConfirmed) throw new ContractValidationError("$.experienceConfirmed", "event requires qualified experience");
  if (semantics.independenceRule === "INDEPENDENT_QUALIFIED_ONLY" && (!row.independenceEligible || row.journeyId === null)) throw new ContractValidationError("$.independenceEligible", "event requires independent server-resolved journey");
  const expectedResponse = row.eventType === "EXPLICIT_SATISFACTION" ? "HAS_MATCHED" : row.eventType === "EXPLICIT_DISSATISFACTION" ? "HAS_NOT_MATCHED" : row.eventType === "EXPLICIT_UNDECIDED" ? "CANNOT_ASSESS_OR_SKIPPED" : null;
  if (row.satisfactionResponse !== expectedResponse) throw new ContractValidationError("$.satisfactionResponse", expectedResponse === null ? "non-outcome event cannot assert a satisfaction response" : "explicit response is missing or does not match its canonical event");
  if (row.eventType === "EXPLORATION_CONTROL_SELECTED" ? row.explorationChoice === null : row.explorationChoice !== null) throw new ContractValidationError("$.explorationChoice", "exploration choice binding mismatch");
  if (["SAVED", "SAVE_REMOVED", "VISITED", "REPEAT_VISIT", "STANDARD_REVIEW", "SMART_REVIEW", "EXPLICIT_SATISFACTION", "EXPLICIT_DISSATISFACTION", "EXPLICIT_UNDECIDED", "REVIEW_MOODS", "MOMENT_CREATED", "QUICK_SKIP", "SPOT_NOT_FIT"].includes(row.eventType) && row.spotId === null) throw new ContractValidationError("$.spotId", "event requires a server-bound spot");
  if (["QUICK_SKIP", "SPOT_NOT_FIT"].includes(row.eventType) && row.decisionId === null) throw new ContractValidationError("$.decisionId", "weak negative requires Spot, Decision and Context");
  if (row.eventType === "SEARCH" && row.conceptIds.length === 0) throw new ContractValidationError("$.conceptIds", "search requires minimized concept identifiers");
  if (row.eventType === "MOOD_CONTEXT_SELECTED" && (row.contextHash === null || !row.contextDimensions.includes("REQUESTED_MOOD_CONCEPT") || row.conceptIds.length === 0)) throw new ContractValidationError("$.contextHash", "searched mood requires a minimized current Decision context");
  if (row.eventType === "CORRECTION" ? row.correctionTargetRecordId === null || row.correctionTargetSourceEvidenceHash === null : row.correctionTargetRecordId !== null || row.correctionTargetSourceEvidenceHash !== null) throw new ContractValidationError("$.correctionTargetRecordId", "correction target binding mismatch");
  const anchor = ProductPolicyEvidenceAnchorSchema.parse(trust.getAcceptedEvidenceAnchor(row.recordId)); if (contentHash(withoutHash(anchor as unknown as Record<string, unknown>, "anchorHash")) !== anchor.anchorHash || anchor.acceptedRecordId !== row.recordId || anchor.acceptedRecordHash !== row.recordHash || anchor.acceptedSourceEvidenceHash !== row.sourceEvidenceHash || anchor.acceptedSourceChainHash !== row.sourceChainHash || anchor.subjectBindingHash !== subject) throw new ContractValidationError("$.evidenceAnchor", "observation is not independently accepted");
  return row;
}

const CALIBRATION_EVENT_MAP: Partial<Record<CalibrationEvidence["eventType"], ProductPolicyEventType>> = {
  SHOWN: "SHOWN", OPENED: "OPENED", DISMISSED: "DISMISSED", REJECTED: "REJECTED", REJECT_REASON: "REJECT_REASON",
  ALTERNATIVE_REQUESTED: "ALTERNATIVE_REQUESTED", SAVED: "SAVED", SAVE_REMOVED: "SAVE_REMOVED",
  NAVIGATION_STARTED: "NAVIGATION_STARTED", RESERVATION_INTENT: "RESERVATION_INTENT", VISITED: "VISITED",
  REPEAT_VISIT: "REPEAT_VISIT", STANDARD_REVIEW: "STANDARD_REVIEW", SMART_REVIEW: "SMART_REVIEW",
  EXPLICIT_SATISFACTION: "EXPLICIT_SATISFACTION", EXPLICIT_DISSATISFACTION: "EXPLICIT_DISSATISFACTION",
  REVIEW_MOODS: "REVIEW_MOODS", MOMENT_CREATED: "MOMENT_CREATED", SEARCH: "SEARCH", DWELL: "DWELL",
  QUICK_SKIP: "QUICK_SKIP", CORRECTION: "CORRECTION",
};

/** Canonical boundary: verifies the Phase 3B adapter result (and therefore its recursively verified Phase 2 source) before minimization. */
export function deriveProductPolicyObservationFromCalibration(
  value: unknown,
  expectedSubjectBindingHash: string,
  calibrationTrust: CalibrationEvidenceTrustContext,
): ProductPolicyObservation {
  const evidence = verifyCalibrationEvidence(value, expectedSubjectBindingHash, calibrationTrust);
  const eventType = CALIBRATION_EVENT_MAP[evidence.eventType];
  if (!eventType) throw new ContractValidationError("$.eventType", "event has no Phase 3C Product Policy mapping");
  const contextDimensions = evidence.context?.dimensions.flatMap((dimension) =>
    dimension.startsWith("company.") ? ["COMPANY_TYPE" as const]
      : dimension.startsWith("day_phase.") ? ["DAY_PHASE" as const]
        : dimension.startsWith("time_budget.") ? ["COARSE_TIME_BUDGET" as const]
          : dimension.startsWith("mood.") ? ["REQUESTED_MOOD_CONCEPT" as const] : [],
  ) ?? [];
  const body: Omit<ProductPolicyObservation, "recordHash"> = {
    contractVersion: CONTRACT_VERSIONS.productPolicyObservation,
    recordId: `phase3c-${evidence.recordId}`,
    subjectBindingHash: evidence.subjectBindingHash,
    eventType,
    occurredAt: evidence.occurredAt,
    active: evidence.active,
    sourceMode: "PHASE2_VERIFIED_ADAPTER",
    sourceEvidenceHash: evidence.recordHash,
    sourceChainHash: evidence.chainHash,
    authorityProofs: unique(evidence.authorityProofs.map(({ authority }) => authority)),
    journeyId: evidence.journeyId,
    independenceEligible: evidence.independenceEligible,
    spotId: evidence.spotId,
    decisionId: null,
    contextHash: evidence.context?.contextHash ?? null,
    contextDimensions: unique(contextDimensions) as ProductPolicyObservation["contextDimensions"],
    conceptIds: unique(evidence.worldConcepts.map(({ conceptId }) => conceptId)),
    worldAttribution: evidence.worldConcepts.length === 0 ? "NOT_APPLICABLE" : evidence.worldConcepts.some(({ certainty }) => certainty === "CONFLICTING") ? "CONFLICTING" : evidence.worldConcepts.some(({ certainty }) => certainty === "UNKNOWN") ? "UNKNOWN" : evidence.worldConcepts.every(({ certainty }) => certainty === "VERIFIED") ? "CERTAIN" : "UNKNOWN",
    experienceConfirmed: evidence.experienceConfirmed,
    satisfactionResponse: evidence.explicitOutcome === "POSITIVE" ? "HAS_MATCHED" : evidence.explicitOutcome === "NEGATIVE" ? "HAS_NOT_MATCHED" : null,
    explorationChoice: null,
    correctionTargetRecordId: evidence.correctionTarget ? `phase3c-${evidence.correctionTarget.recordId}` : null,
    correctionTargetSourceEvidenceHash: evidence.correctionTarget?.recordHash ?? null,
    rawSensitiveDataIncluded: false,
  };
  return withProductPolicyObservationHash(body);
}

const InterpretationSchema = schema.object({ interpretationId: identifier, kind: schema.enum(MODEL_TARGETS), targetKey: identifier, direction: schema.enum(["POSITIVE", "NEGATIVE", "NEUTRAL", "UNKNOWN"] as const), maturity: schema.enum(["FIRST_HINT", "ACTIVE_NEUTRAL_STATE", "THRESHOLD_MET", "TRANSITION_NOT_CONFIGURED", "UNRESOLVED_CONFLICT"] as const), contextHash: schema.nullable(sha256), evidenceRecordIds: schema.array(identifier, { min: 1, max: 128 }), limitations: schema.array(identifier, { min: 1, max: 16 }), interpretationHash: sha256 });
export type ProductInterpretation = Infer<typeof InterpretationSchema>;
const ConflictSchema = schema.object({ conflictId: identifier, targetKey: identifier, contextHash: schema.nullable(sha256), positiveInterpretationIds: schema.array(identifier, { min: 1, max: 128 }), negativeInterpretationIds: schema.array(identifier, { min: 1, max: 128 }), classification: schema.literal("SEMANTIC_CONFLICT"), resolution: schema.literal("UNRESOLVED"), conflictHash: sha256 });
const EvaluationPreviewSchema = schema.object({ mode: schema.enum(["PHASE3C_POLICY_EVALUATION_ONLY", "PRODUCTION_BOUNDARY_ASSERTION"] as const), productionAuthorized: schema.literal(false), runtimeActivated: schema.literal(false), rankingAuthority: schema.literal(false), eligibilityAuthority: schema.literal(false), containsPersonalModelData: schema.boolean(), items: schema.array(schema.object({ kind: schema.enum(MODEL_TARGETS), targetKey: identifier, direction: schema.enum(["POSITIVE", "NEGATIVE", "NEUTRAL", "UNKNOWN"] as const), uncertainty: schema.literal("PRESERVED") }), { max: 256 }), withheldConflictIds: schema.array(identifier, { max: 256 }), limitations: schema.array(identifier, { min: 1, max: 16 }), projectionHash: sha256 });
const SufficiencySchema = schema.object({ targetKey: identifier, state: schema.enum(["NOTHING_KNOWN", "FIRST_HINT", "NEUTRAL_STATE", "FAMILIARITY_THRESHOLD_MET", "TRANSITION_NOT_CONFIGURED", "CONFLICTING"] as const), directedEvidenceCount: count, independentUnits: count, limitations: schema.array(identifier, { max: 16 }) });
export const ProductPolicyEvaluationSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.productPolicyEvaluation), evaluationId: identifier, policyHash: sha256, founderDecisionHash: sha256, registryHash: sha256, status: schema.enum(["ACTIVE_EVALUATION", "NEUTRAL"] as const), neutralReason: schema.nullable(schema.enum(["NO_CONSENT", "WITHDRAWN", "RESET", "ERASED", "NO_EVIDENCE"] as const)), subjectBindingHash: schema.nullable(sha256), auditObservationIds: schema.array(identifier, { max: 4096 }), interpretations: schema.array(InterpretationSchema, { max: 4096 }), conflicts: schema.array(ConflictSchema, { max: 256 }), domainSufficiency: schema.array(SufficiencySchema, { max: 4096 }), privacyBoundary: schema.object({ separateLegalAuthorityRequired: schema.literal(true), normalProductUiVisible: schema.literal(false), tasteDashboardContractExists: schema.literal(false) }), evaluationPreview: EvaluationPreviewSchema, productionBoundary: EvaluationPreviewSchema, evaluationHash: sha256 });
export type ProductPolicyEvaluation = Infer<typeof ProductPolicyEvaluationSchema>;
export interface ProductPolicyEvaluationInput { readonly evaluationId: string; readonly subjectBindingHash: string | null; readonly lifecycle: "ACTIVE" | "NO_CONSENT" | "WITHDRAWN" | "RESET" | "ERASED"; readonly observations: readonly unknown[]; }

function interpretation(kind: ProductInterpretation["kind"], targetKey: string, direction: ProductInterpretation["direction"], maturity: ProductInterpretation["maturity"], contextHash: string | null, evidenceRecordIds: readonly string[], limitations: readonly string[]): ProductInterpretation {
  const body = { interpretationId: `phase3c-interpretation-${contentHash({ kind, targetKey, direction, contextHash, evidenceRecordIds: unique(evidenceRecordIds) })}`, kind, targetKey, direction, maturity, contextHash, evidenceRecordIds: unique(evidenceRecordIds), limitations: unique(limitations) };
  return InterpretationSchema.parse({ ...body, interpretationHash: contentHash(body) });
}
function projection(mode: "PHASE3C_POLICY_EVALUATION_ONLY" | "PRODUCTION_BOUNDARY_ASSERTION", items: readonly { kind: ProductInterpretation["kind"]; targetKey: string; direction: ProductInterpretation["direction"]; uncertainty: "PRESERVED" }[], withheldConflictIds: readonly string[], containsPersonalModelData: boolean) {
  const body = { mode, productionAuthorized: false as const, runtimeActivated: false as const, rankingAuthority: false as const, eligibilityAuthority: false as const, containsPersonalModelData, items, withheldConflictIds: unique(withheldConflictIds), limitations: mode === "PRODUCTION_BOUNDARY_ASSERTION" ? ["RUNTIME_NOT_ACTIVATED", "NO_PERSONAL_MODEL_DATA", "USE_CANONICAL_RELEVANT_USER_PROJECTION_ONLY"] : ["POLICY_EVALUATION_ONLY", "NO_RANKING_OR_ELIGIBILITY_AUTHORITY"] };
  return EvaluationPreviewSchema.parse({ ...body, projectionHash: contentHash(body) });
}

export function evaluateProductInterpretationPolicy(input: ProductPolicyEvaluationInput, releaseTrust: Phase3CReleaseTrustContext, evidenceTrust: Phase3CEvidenceTrustContext): ProductPolicyEvaluation {
  const policy = verifyProductInterpretationPolicy(PRODUCT_INTERPRETATION_POLICY_3C, releaseTrust);
  const suppressed = input.lifecycle === "ACTIVE" ? null : input.lifecycle === "NO_CONSENT" ? "NO_CONSENT" as const : input.lifecycle === "WITHDRAWN" ? "WITHDRAWN" as const : input.lifecycle === "RESET" ? "RESET" as const : "ERASED" as const;
  if (suppressed && (input.subjectBindingHash !== null || input.observations.length > 0)) throw new ContractValidationError("$", "suppressed lifecycle input cannot retain personal observations");
  if (!suppressed && input.subjectBindingHash === null) throw new ContractValidationError("$.subjectBindingHash", "active evaluation requires server-bound subject");
  const rows = suppressed ? [] : input.observations.map((value) => verifyObservation(value, input.subjectBindingHash!, evidenceTrust)).sort((a, b) => `${a.occurredAt}|${a.recordId}`.localeCompare(`${b.occurredAt}|${b.recordId}`));
  if (new Set(rows.map(({ recordId }) => recordId)).size !== rows.length) throw new ContractValidationError("$.observations", "duplicate observation id");
  const corrections = rows.filter(({ active, eventType }) => active && eventType === "CORRECTION");
  const correctedIds = new Set<string>();
  for (const correction of corrections) {
    const target = rows.find(({ recordId }) => recordId === correction.correctionTargetRecordId);
    if (!target || target.eventType === "CORRECTION" || target.sourceEvidenceHash !== correction.correctionTargetSourceEvidenceHash || target.occurredAt >= correction.occurredAt || target.spotId !== correction.spotId || target.journeyId !== correction.journeyId) throw new ContractValidationError("$.observations", "correction is not canonically bound to a prior same-target observation");
    if (correctedIds.has(target.recordId)) throw new ContractValidationError("$.observations", "multiple active corrections target the same observation");
    correctedIds.add(target.recordId);
  }
  const active = rows.filter(({ active, eventType, recordId }) => active && eventType !== "CORRECTION" && !correctedIds.has(recordId)); const interpretations: ProductInterpretation[] = [];
  const latestSave = new Map<string, ProductPolicyObservation>(); for (const row of active.filter(({ eventType, spotId }) => spotId && ["SAVED", "SAVE_REMOVED"].includes(eventType))) latestSave.set(row.spotId!, row);
  for (const [spotId, row] of latestSave) if (row.eventType === "SAVED") interpretations.push(interpretation("DIRECT_SPOT_PLANNING", `spot:${spotId}`, "NEUTRAL", "ACTIVE_NEUTRAL_STATE", row.contextHash, [row.recordId], ["SAVE_IS_NOT_SATISFACTION", "NO_CONCEPT_PROPAGATION"]));
  const visits = new Map<string, ProductPolicyObservation[]>(); for (const row of active.filter(({ eventType, spotId, independenceEligible }) => spotId && independenceEligible && ["VISITED", "REPEAT_VISIT"].includes(eventType))) { const list = visits.get(row.spotId!) ?? []; if (!list.some(({ journeyId }) => journeyId === row.journeyId)) list.push(row); visits.set(row.spotId!, list); }
  for (const [spotId, list] of visits) if (list.length >= policy.familiarityIndependentVisitThreshold) interpretations.push(interpretation("FAMILIARITY", `spot:${spotId}`, "NEUTRAL", "THRESHOLD_MET", null, list.map(({ recordId }) => recordId), ["FAMILIARITY_IS_NOT_PREFERENCE", "THREE_INDEPENDENT_VISITS"]));
  for (const row of active.filter(({ eventType }) => eventType === "DWELL")) interpretations.push(interpretation("INTERACTION_ATTENTION", `attention:${row.recordId}`, "UNKNOWN", "TRANSITION_NOT_CONFIGURED", row.contextHash, [row.recordId], ["RESEARCH_ONLY", "NO_TASTE_OR_DECISION_EFFECT"]));
  for (const row of active.filter(({ eventType, experienceConfirmed }) => eventType === "MOMENT_CREATED" && experienceConfirmed)) interpretations.push(interpretation("EXPERIENCE_SUPPORT", `experience:${row.spotId ?? row.recordId}`, "UNKNOWN", "FIRST_HINT", row.contextHash, [row.recordId], ["EXPERIENCE_SUPPORT_ONLY", "NO_TASTE_OR_SATISFACTION"]));
  for (const row of active.filter(({ eventType }) => eventType === "MOOD_CONTEXT_SELECTED")) interpretations.push(interpretation("CURRENT_DECISION_CONTEXT", `decision:${row.decisionId ?? row.recordId}`, "NEUTRAL", "ACTIVE_NEUTRAL_STATE", row.contextHash, [row.recordId], ["CURRENT_DECISION_ONLY", "NO_LONG_TERM_TRANSFER"]));
  for (const row of active.filter(({ eventType }) => eventType === "EXPLORATION_CONTROL_SELECTED")) interpretations.push(interpretation("EXPLORATION_REQUEST", `decision:${row.decisionId ?? row.recordId}`, "NEUTRAL", "ACTIVE_NEUTRAL_STATE", row.contextHash, [row.recordId], ["CURRENT_DECISION_ONLY", "NOT_PERSONALITY"]));
  const directedByJourney = new Map<string, ProductPolicyObservation>();
  const priority = (row: ProductPolicyObservation) => {
    const semantics = PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.entries.find(({ eventType }) => eventType === row.eventType)!;
    return semantics.journeyPriorityClass === "NONE" || semantics.journeyPriorityClass === "CONTEXTUAL_SEARCH" ? -1 : policy.directedJourneyPriority.length - policy.directedJourneyPriority.indexOf(semantics.journeyPriorityClass);
  };
  for (const row of active.filter((candidate) => priority(candidate) >= 0)) { const key = row.journeyId ?? row.recordId; const current = directedByJourney.get(key); if (!current || priority(row) > priority(current) || priority(row) === priority(current) && row.recordId.localeCompare(current.recordId) < 0) directedByJourney.set(key, row); }
  for (const row of directedByJourney.values()) {
    if (row.eventType === "QUICK_SKIP" || row.eventType === "SPOT_NOT_FIT") interpretations.push(interpretation("DIRECT_SPOT_AFFINITY", `spot:${row.spotId}:decision:${row.decisionId}:context:${row.contextHash}`, "NEGATIVE", "TRANSITION_NOT_CONFIGURED", row.contextHash, [row.recordId], [row.eventType === "QUICK_SKIP" ? "VERY_WEAK_CONTEXTUAL_SIGNAL" : "EXPLICIT_SPOT_NOT_FIT_CONTEXT_BOUND", "NO_GLOBAL_AVERSION", "MATURITY_NOT_CONFIGURED"]));
    if (row.eventType === "EXPLICIT_SATISFACTION" || row.eventType === "EXPLICIT_DISSATISFACTION") {
      const direction = row.eventType === "EXPLICIT_SATISFACTION" ? "POSITIVE" as const : "NEGATIVE" as const;
      interpretations.push(interpretation(direction === "POSITIVE" ? "DIRECT_SPOT_AFFINITY" : "AVERSION", `spot:${row.spotId}`, direction, "FIRST_HINT", row.contextHash, [row.recordId], ["EXPLICIT_PERSONAL_FIT", "NO_AUTOMATIC_LONG_TERM_CONCEPT_TRANSFER"]));
      if (row.contextHash !== null) for (const conceptId of row.conceptIds) interpretations.push(interpretation("CONTEXTUAL_CONCEPT_TASTE", `concept:${conceptId}`, direction, "FIRST_HINT", row.contextHash, [row.recordId], ["FIRST_CONTEXTUAL_HINT", "HIGH_UNCERTAINTY", "NO_LONG_TERM_TRANSFER"]));
    }
  }
  const searchGroups = new Map<string, ProductPolicyObservation[]>(); for (const row of active.filter(({ eventType }) => eventType === "SEARCH")) for (const conceptId of row.conceptIds) { const key = `${conceptId}|${row.contextHash}`; const list = searchGroups.get(key) ?? []; if (!list.some(({ journeyId }) => journeyId === row.journeyId)) list.push(row); searchGroups.set(key, list); }
  for (const [key, list] of searchGroups) interpretations.push(interpretation(list.length > 1 ? "CONTEXTUAL_SEARCH_READINESS" : "RECENT_SEARCH_INTENT", `search:${key.split("|")[0]}`, "NEUTRAL", list.length > 1 ? "TRANSITION_NOT_CONFIGURED" : "ACTIVE_NEUTRAL_STATE", list[0]!.contextHash, list.map(({ recordId }) => recordId), [list.length > 1 ? "REPEATED_INDEPENDENT_SEARCH_PATTERN" : "SINGLE_SEARCH_CURRENT_INTENT", "SEARCH_MATURITY_NOT_CONFIGURED", "NO_RAW_SEARCH", "NOT_CONCEPT_TASTE"]));
  const conceptSpots = new Map<string, Set<string>>(); const conceptEvidence = new Map<string, string[]>(); for (const row of active.filter(({ eventType, worldAttribution }) => ["EXPLICIT_SATISFACTION"].includes(eventType) && worldAttribution === "CERTAIN")) for (const conceptId of row.conceptIds) { const spots = conceptSpots.get(conceptId) ?? new Set<string>(); if (row.spotId) spots.add(row.spotId); conceptSpots.set(conceptId, spots); const ids = conceptEvidence.get(conceptId) ?? []; ids.push(row.recordId); conceptEvidence.set(conceptId, ids); }
  for (const [conceptId, spots] of conceptSpots) if (spots.size > 1) interpretations.push(interpretation("CONCEPT_PROMOTION_READINESS", `concept:${conceptId}`, "UNKNOWN", "TRANSITION_NOT_CONFIGURED", null, conceptEvidence.get(conceptId)!, ["MULTI_SPOT_CERTAIN_ATTRIBUTION", "MINIMUM_SPOT_THRESHOLD_NOT_CONFIGURED", "NOT_CONCEPT_TASTE", "NOT_PROJECTABLE"]));
  const directionalGroups = new Map<string, ProductInterpretation[]>(); for (const item of interpretations.filter(({ direction }) => direction === "POSITIVE" || direction === "NEGATIVE")) { const key = `${item.targetKey}|${item.contextHash ?? "none"}`; const list = directionalGroups.get(key) ?? []; list.push(item); directionalGroups.set(key, list); }
  const conflicts = [...directionalGroups.entries()].flatMap(([key, list]) => { const positive = list.filter(({ direction }) => direction === "POSITIVE"); const negative = list.filter(({ direction }) => direction === "NEGATIVE"); if (!positive.length || !negative.length) return []; const body = { conflictId: `phase3c-conflict-${contentHash({ key, ids: list.map(({ interpretationId }) => interpretationId).sort() })}`, targetKey: list[0]!.targetKey, contextHash: list[0]!.contextHash, positiveInterpretationIds: positive.map(({ interpretationId }) => interpretationId).sort(), negativeInterpretationIds: negative.map(({ interpretationId }) => interpretationId).sort(), classification: "SEMANTIC_CONFLICT" as const, resolution: "UNRESOLVED" as const }; return [ConflictSchema.parse({ ...body, conflictHash: contentHash(body) })]; });
  const conflictedIds = new Set(conflicts.flatMap(({ positiveInterpretationIds, negativeInterpretationIds }) => [...positiveInterpretationIds, ...negativeInterpretationIds]));
  const neverPreviewKinds = new Set<ProductInterpretation["kind"]>(["INTERACTION_ATTENTION", "RECENT_SEARCH_INTENT", "CONTEXTUAL_SEARCH_READINESS", "CONCEPT_PROMOTION_READINESS"]);
  const evaluationItems = interpretations.filter(({ interpretationId, maturity, kind }) => !conflictedIds.has(interpretationId) && maturity !== "TRANSITION_NOT_CONFIGURED" && !neverPreviewKinds.has(kind)).map(({ kind, targetKey, direction }) => ({ kind, targetKey, direction, uncertainty: "PRESERVED" as const }));
  const conflictTargets = new Set(conflicts.map(({ targetKey }) => targetKey));
  const domainSufficiency = unique(interpretations.map(({ targetKey }) => targetKey)).map((targetKey) => {
    const items = interpretations.filter((item) => item.targetKey === targetKey); const directed = items.filter(({ direction }) => direction === "POSITIVE" || direction === "NEGATIVE");
    const state = conflictTargets.has(targetKey) ? "CONFLICTING" as const : items.some(({ maturity }) => maturity === "TRANSITION_NOT_CONFIGURED") ? "TRANSITION_NOT_CONFIGURED" as const : items.some(({ maturity }) => maturity === "THRESHOLD_MET") ? "FAMILIARITY_THRESHOLD_MET" as const : directed.length ? "FIRST_HINT" as const : "NEUTRAL_STATE" as const;
    return { targetKey, state, directedEvidenceCount: directed.length, independentUnits: new Set(items.flatMap(({ evidenceRecordIds }) => evidenceRecordIds)).size, limitations: unique(items.flatMap(({ limitations }) => limitations)) };
  });
  const neutralReason = suppressed ?? (rows.length === 0 ? "NO_EVIDENCE" as const : null); const subject = neutralReason ? null : input.subjectBindingHash;
  const body = { contractVersion: CONTRACT_VERSIONS.productPolicyEvaluation, evaluationId: input.evaluationId, policyHash: policy.policyHash, founderDecisionHash: FOUNDER_DECISION_RECORD_3C.decisionHash, registryHash: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash, status: neutralReason ? "NEUTRAL" as const : "ACTIVE_EVALUATION" as const, neutralReason, subjectBindingHash: subject, auditObservationIds: neutralReason ? [] : rows.map(({ recordId }) => recordId), interpretations: neutralReason ? [] : interpretations.sort((a, b) => a.interpretationId.localeCompare(b.interpretationId)), conflicts: neutralReason ? [] : conflicts.sort((a, b) => a.conflictId.localeCompare(b.conflictId)), domainSufficiency: neutralReason ? [] : domainSufficiency, privacyBoundary: { separateLegalAuthorityRequired: true as const, normalProductUiVisible: false as const, tasteDashboardContractExists: false as const }, evaluationPreview: projection("PHASE3C_POLICY_EVALUATION_ONLY", neutralReason ? [] : evaluationItems, conflicts.map(({ conflictId }) => conflictId), !neutralReason && evaluationItems.length > 0), productionBoundary: projection("PRODUCTION_BOUNDARY_ASSERTION", [], [], false) };
  return ProductPolicyEvaluationSchema.parse({ ...body, evaluationHash: contentHash(body) });
}

/** Authoritative entry point. Parsing or recomputing outer hashes is never sufficient. */
export function verifyProductPolicyEvaluation(
  value: unknown,
  input: ProductPolicyEvaluationInput,
  releaseTrust: Phase3CReleaseTrustContext,
  evidenceTrust: Phase3CEvidenceTrustContext,
): ProductPolicyEvaluation {
  const parsed = ProductPolicyEvaluationSchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "evaluationHash")) !== parsed.evaluationHash) throw new ContractValidationError("$.evaluationHash", "evaluation hash mismatch");
  for (const item of parsed.interpretations) if (contentHash(withoutHash(item as unknown as Record<string, unknown>, "interpretationHash")) !== item.interpretationHash) throw new ContractValidationError("$.interpretations", "inner interpretation hash mismatch");
  for (const item of parsed.conflicts) if (contentHash(withoutHash(item as unknown as Record<string, unknown>, "conflictHash")) !== item.conflictHash) throw new ContractValidationError("$.conflicts", "inner conflict hash mismatch");
  for (const item of [parsed.evaluationPreview, parsed.productionBoundary]) if (contentHash(withoutHash(item as unknown as Record<string, unknown>, "projectionHash")) !== item.projectionHash) throw new ContractValidationError("$.projectionHash", "inner projection hash mismatch");
  const reconstructed = evaluateProductInterpretationPolicy(input, releaseTrust, evidenceTrust);
  if (!same(parsed, reconstructed)) throw new ContractValidationError("$", "evaluation differs from authoritative reconstruction");
  return parsed;
}

export const ProductPolicyPrivacyExportAuthoritySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.productPolicyPrivacyExportAuthority), authorityRecordId: identifier,
  operationId: identifier, subjectBindingHash: sha256, acceptedEvaluationId: identifier, acceptedEvaluationHash: sha256,
  purpose: schema.literal("LEGAL_PRIVACY_EXPORT"), issuer: schema.literal("BACKYRD_PRIVACY_LEGAL_AUTHORITY"),
  validFrom: timestamp, validUntil: timestamp, productionUiAuthorized: schema.literal(false), authorityHash: sha256,
});
export type ProductPolicyPrivacyExportAuthority = Infer<typeof ProductPolicyPrivacyExportAuthoritySchema>;
export const ProductPolicyPrivacyExportTrustAnchorSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.productPolicyPrivacyExportTrustAnchor), anchorId: identifier,
  acceptedAuthorityRecordId: identifier, acceptedAuthorityHash: sha256, subjectBindingHash: sha256,
  issuer: schema.literal("BACKYRD_PRIVACY_TRUST_REGISTRY"), validFrom: timestamp, validUntil: timestamp,
  productionUiAuthorized: schema.literal(false), anchorHash: sha256,
});
export type ProductPolicyPrivacyExportTrustAnchor = Infer<typeof ProductPolicyPrivacyExportTrustAnchorSchema>;
export interface Phase3CPrivacyExportTrustContext { readonly verifiedAt: string; getAcceptedPrivacyAuthority(operationId: string): unknown; getAcceptedPrivacyTrustAnchor(authorityRecordId: string): unknown; }
export const ProductPolicyPrivacyExportSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.productPolicyPrivacyExport), exportId: identifier, operationId: identifier,
  purpose: schema.literal("LEGAL_PRIVACY_EXPORT"), normalProductUiVisible: schema.literal(false), subjectBindingHash: sha256,
  sourceEvaluationId: identifier, sourceEvaluationHash: sha256, interpretationIds: schema.array(identifier, { max: 4096 }),
  conflictIds: schema.array(identifier, { max: 256 }), excludesRawEvents: schema.literal(true), excludesForeignSubjects: schema.literal(true),
  authorityRecordHash: sha256, exportHash: sha256,
});
export type ProductPolicyPrivacyExport = Infer<typeof ProductPolicyPrivacyExportSchema>;
export function buildProductPolicyPrivacyExport(
  operationId: string,
  evaluationValue: unknown,
  evaluationInput: ProductPolicyEvaluationInput,
  releaseTrust: Phase3CReleaseTrustContext,
  evidenceTrust: Phase3CEvidenceTrustContext,
  privacyTrust: Phase3CPrivacyExportTrustContext,
): ProductPolicyPrivacyExport {
  if (evaluationInput.lifecycle !== "ACTIVE" || evaluationInput.subjectBindingHash === null) throw new ContractValidationError("$", "privacy export requires an active, server-bound subject");
  const evaluation = verifyProductPolicyEvaluation(evaluationValue, evaluationInput, releaseTrust, evidenceTrust);
  const authority = ProductPolicyPrivacyExportAuthoritySchema.parse(privacyTrust.getAcceptedPrivacyAuthority(operationId));
  const anchor = ProductPolicyPrivacyExportTrustAnchorSchema.parse(privacyTrust.getAcceptedPrivacyTrustAnchor(authority.authorityRecordId));
  const verifiedAt = Date.parse(timestamp.parse(privacyTrust.verifiedAt));
  if (contentHash(withoutHash(authority as unknown as Record<string, unknown>, "authorityHash")) !== authority.authorityHash || contentHash(withoutHash(anchor as unknown as Record<string, unknown>, "anchorHash")) !== anchor.anchorHash) throw new ContractValidationError("$.privacyAuthority", "privacy authority hash mismatch");
  if (authority.operationId !== operationId || authority.subjectBindingHash !== evaluation.subjectBindingHash || authority.acceptedEvaluationId !== evaluation.evaluationId || authority.acceptedEvaluationHash !== evaluation.evaluationHash || anchor.acceptedAuthorityRecordId !== authority.authorityRecordId || anchor.acceptedAuthorityHash !== authority.authorityHash || anchor.subjectBindingHash !== authority.subjectBindingHash) throw new ContractValidationError("$.privacyAuthority", "privacy export is not independently bound");
  if (verifiedAt < Date.parse(authority.validFrom) || verifiedAt > Date.parse(authority.validUntil) || verifiedAt < Date.parse(anchor.validFrom) || verifiedAt > Date.parse(anchor.validUntil)) throw new ContractValidationError("$.privacyAuthority", "privacy export authority is outside its validity window");
  const body = { contractVersion: CONTRACT_VERSIONS.productPolicyPrivacyExport, exportId: `phase3c-privacy-export-${operationId}`, operationId, purpose: "LEGAL_PRIVACY_EXPORT" as const, normalProductUiVisible: false as const, subjectBindingHash: evaluation.subjectBindingHash!, sourceEvaluationId: evaluation.evaluationId, sourceEvaluationHash: evaluation.evaluationHash, interpretationIds: evaluation.interpretations.map(({ interpretationId }) => interpretationId).sort(), conflictIds: evaluation.conflicts.map(({ conflictId }) => conflictId).sort(), excludesRawEvents: true as const, excludesForeignSubjects: true as const, authorityRecordHash: authority.authorityHash };
  return ProductPolicyPrivacyExportSchema.parse({ ...body, exportHash: contentHash(body) });
}

export const ProductPolicyReducerStateSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.productPolicyReducerState),
  subjectBindingHash: sha256,
  policyHash: sha256,
  checkpointHash: sha256,
  observations: schema.array(ProductPolicyObservationSchema, { max: 4096 }),
  evaluation: ProductPolicyEvaluationSchema,
  stateHash: sha256,
});
export type ProductPolicyReducerState = Infer<typeof ProductPolicyReducerStateSchema>;

function reducerState(input: ProductPolicyEvaluationInput, releaseTrust: Phase3CReleaseTrustContext, evidenceTrust: Phase3CEvidenceTrustContext): ProductPolicyReducerState {
  if (input.lifecycle !== "ACTIVE" || input.subjectBindingHash === null) throw new ContractValidationError("$", "reducer state is available only for active authorized subjects");
  const observations = input.observations.map((value) => verifyObservation(value, input.subjectBindingHash!, evidenceTrust)).sort((a, b) => a.recordId.localeCompare(b.recordId));
  const evaluation = evaluateProductInterpretationPolicy({ ...input, observations }, releaseTrust, evidenceTrust);
  const checkpointHash = contentHash(observations.map(({ recordId, recordHash, active }) => ({ recordId, recordHash, active })));
  const body = { contractVersion: CONTRACT_VERSIONS.productPolicyReducerState, subjectBindingHash: input.subjectBindingHash, policyHash: PRODUCT_INTERPRETATION_POLICY_3C.policyHash, checkpointHash, observations, evaluation };
  return ProductPolicyReducerStateSchema.parse({ ...body, stateHash: contentHash(body) });
}

export function buildProductPolicyState(input: ProductPolicyEvaluationInput, releaseTrust: Phase3CReleaseTrustContext, evidenceTrust: Phase3CEvidenceTrustContext): ProductPolicyReducerState {
  return reducerState(input, releaseTrust, evidenceTrust);
}

export function verifyProductPolicyState(value: unknown, releaseTrust: Phase3CReleaseTrustContext, evidenceTrust: Phase3CEvidenceTrustContext): ProductPolicyReducerState {
  const parsed = ProductPolicyReducerStateSchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "stateHash")) !== parsed.stateHash) throw new ContractValidationError("$.stateHash", "state hash mismatch");
  const rebuilt = reducerState({ evaluationId: parsed.evaluation.evaluationId, subjectBindingHash: parsed.subjectBindingHash, lifecycle: "ACTIVE", observations: parsed.observations }, releaseTrust, evidenceTrust);
  if (!same(parsed, rebuilt)) throw new ContractValidationError("$", "state differs from authoritative reconstruction");
  return parsed;
}

/** Verified delta path: verifies the prior checkpoint, applies only supplied upserts/retractions, then canonically reconciles the ledger; it never delegates to buildUserModel. */
export function updateProductPolicyState(previousValue: unknown, delta: readonly unknown[], releaseTrust: Phase3CReleaseTrustContext, evidenceTrust: Phase3CEvidenceTrustContext): ProductPolicyReducerState {
  const previous = verifyProductPolicyState(previousValue, releaseTrust, evidenceTrust);
  const ledger = new Map(previous.observations.map((row) => [row.recordId, row] as const));
  for (const value of delta) {
    const row = verifyObservation(value, previous.subjectBindingHash, evidenceTrust);
    const existing = ledger.get(row.recordId);
    if (existing && existing.recordHash === row.recordHash) continue;
    ledger.set(row.recordId, row);
  }
  return reducerState({ evaluationId: previous.evaluation.evaluationId, subjectBindingHash: previous.subjectBindingHash, lifecycle: "ACTIVE", observations: [...ledger.values()] }, releaseTrust, evidenceTrust);
}

export function createPhase3CRepositoryReleaseTrust(): Phase3CReleaseTrustContext {
  return { verifiedAt: "2026-09-12T00:00:00.000Z", getFounderDecisionRelease: (recordId) => recordId === FOUNDER_DECISION_RECORD_3C.recordId ? FOUNDER_DECISION_RELEASE_3C : null, getFounderDecisionTrustAnchor: (anchorId) => anchorId === FOUNDER_DECISION_TRUST_ANCHOR_3C.anchorId ? FOUNDER_DECISION_TRUST_ANCHOR_3C : null, getProductPolicyRelease: (policyId) => policyId === PRODUCT_INTERPRETATION_POLICY_3C.policyId ? PRODUCT_POLICY_RELEASE_3C : null, getProductPolicyTrustAnchor: (anchorId) => anchorId === PRODUCT_POLICY_TRUST_ANCHOR_3C.anchorId ? PRODUCT_POLICY_TRUST_ANCHOR_3C : null };
}
export function createPhase3CSyntheticEvidenceTrust(observations: readonly ProductPolicyObservation[], anchors: readonly ProductPolicyEvidenceAnchor[]): Phase3CEvidenceTrustContext {
  const ids = new Set(observations.map(({ recordId }) => recordId)); if (ids.size !== observations.length || anchors.length !== observations.length) throw new ContractValidationError("$", "synthetic evidence trust requires one unique external anchor per observation");
  const map = new Map(anchors.map((anchor) => { const parsed = ProductPolicyEvidenceAnchorSchema.parse(anchor); if (!ids.has(parsed.acceptedRecordId)) throw new ContractValidationError("$", "orphan evidence anchor"); return [parsed.acceptedRecordId, parsed] as const; }));
  return { getAcceptedEvidenceAnchor: (recordId) => map.get(recordId) ?? null };
}
