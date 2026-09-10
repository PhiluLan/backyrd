import { contentHash } from "./canonical.js";
import {
  CALIBRATION_CONCEPT_REGISTRY_HASH, CALIBRATION_CONCEPT_REGISTRY_VERSION, CalibrationEvidence, CalibrationEventType, CalibrationScenario, createSyntheticCalibrationTrustContext,
  signalSemantics, withCalibrationEvidenceHash, withCalibrationScenarioHash,
} from "./calibration.js";
import { CONTRACT_VERSIONS } from "./contracts.js";

export const PHASE3B_SYNTHETIC_SUBJECT = contentHash("backyrd.phase3b.synthetic.subject");
export const PHASE3B_SYNTHETIC_REGISTRY = CALIBRATION_CONCEPT_REGISTRY_VERSION;
export const PHASE3B_INTERPRETED_AT = "2026-02-01T12:00:00.000Z";

const authorityFor = (eventType: CalibrationEventType): CalibrationEvidence["authority"] => signalSemantics(eventType).requiredAuthorities[0]!;

export function syntheticCalibrationEvidence(input: {
  readonly id: string; readonly eventType: CalibrationEventType; readonly journey?: string | null; readonly spot?: string | null;
  readonly direction?: CalibrationEvidence["direction"];
  readonly concepts?: readonly { readonly registryVersion: string; readonly registryHash?: string; readonly conceptId: string; readonly certainty: CalibrationEvidence["worldConcepts"][number]["certainty"] }[];
  readonly context?: CalibrationEvidence["context"]; readonly occurredAt?: string; readonly retryOfRecordId?: string | null;
  readonly supersedesRecordId?: string | null; readonly eventHash?: string; readonly active?: boolean;
}): CalibrationEvidence {
  const explicitOutcome = input.eventType === "EXPLICIT_SATISFACTION" ? "POSITIVE" as const : input.eventType === "EXPLICIT_DISSATISFACTION" ? "NEGATIVE" as const : "NONE" as const;
  const direction = input.direction ?? (explicitOutcome === "POSITIVE" ? "POSITIVE" as const : explicitOutcome === "NEGATIVE" ? "NEGATIVE" as const : "NOT_APPLICABLE" as const);
  const journeyId = input.journey === undefined ? `journey-${input.id}` : input.journey;
  const experienceConfirmed = ["VISITED", "REPEAT_VISIT", "STANDARD_REVIEW", "SMART_REVIEW", "EXPLICIT_SATISFACTION", "EXPLICIT_DISSATISFACTION"].includes(input.eventType);
  const body = {
    contractVersion: CONTRACT_VERSIONS.calibrationEvidence, recordId: `evidence-${input.id}`, subjectBindingHash: PHASE3B_SYNTHETIC_SUBJECT,
    eventType: input.eventType, eventHash: input.eventHash ?? contentHash({ event: input.id }), chainId: `chain-${journeyId ?? input.id}`, chainHash: contentHash({ chain: journeyId ?? input.id }),
    journeyId, independenceEligible: journeyId !== null && experienceConfirmed, spotId: input.spot === undefined ? "synthetic-spot-a" : input.spot,
    authority: authorityFor(input.eventType), direction, experienceConfirmed, explicitOutcome,
    worldConcepts: (input.concepts ?? (["EXPLICIT_SATISFACTION", "EXPLICIT_DISSATISFACTION"].includes(input.eventType) ? [{ registryVersion: PHASE3B_SYNTHETIC_REGISTRY, conceptId: "vibe.synthetic-cozy", certainty: "SUPPORTED" as const }] : [])).map((concept) => ({ ...concept, registryHash: concept.registryHash ?? CALIBRATION_CONCEPT_REGISTRY_HASH })),
    context: input.context ?? null, occurredAt: input.occurredAt ?? "2026-01-20T12:00:00.000Z", retryOfRecordId: input.retryOfRecordId ?? null,
    supersedesRecordId: input.supersedesRecordId ?? null, active: input.active ?? true,
  };
  return withCalibrationEvidenceHash(body);
}

const context = (name: string): NonNullable<CalibrationEvidence["context"]> => ({ contextHash: contentHash({ context: name }), dimensions: [`company.${name}`], authority: "EXPLICIT_USER" });
const positive = (id: string, journey = `journey-${id}`, spot = "synthetic-spot-a", extra: Partial<Parameters<typeof syntheticCalibrationEvidence>[0]> = {}) => syntheticCalibrationEvidence({ id, eventType: "EXPLICIT_SATISFACTION", journey, spot, ...extra });
const negative = (id: string, journey = `journey-${id}`, spot = "synthetic-spot-a", extra: Partial<Parameters<typeof syntheticCalibrationEvidence>[0]> = {}) => syntheticCalibrationEvidence({ id, eventType: "EXPLICIT_DISSATISFACTION", journey, spot, ...extra });
const scenario = (id: string, evidence: readonly CalibrationEvidence[], options: { lifecycle?: CalibrationScenario["lifecycle"]; killSwitch?: boolean } = {}): CalibrationScenario => {
  const lifecycle = options.lifecycle ?? "ACTIVE";
  const body = { contractVersion: CONTRACT_VERSIONS.calibrationScenario, scenarioId: id, title: id, subjectBindingHash: lifecycle === "ACTIVE" ? PHASE3B_SYNTHETIC_SUBJECT : null, lifecycle, killSwitch: options.killSwitch ?? false, interpretedAt: PHASE3B_INTERPRETED_AT, evidence: lifecycle === "ACTIVE" ? evidence : [] };
  return withCalibrationScenarioHash(body);
};

const sameJourney = "journey-same-three";
const correctionTarget = positive("correction-target", "journey-correction");
const offlineOriginal = positive("offline-original", "journey-offline", "synthetic-spot-offline", { occurredAt: "2025-12-15T12:00:00.000Z" });
const offlineRetry = syntheticCalibrationEvidence({ id: "offline-retry", eventType: "EXPLICIT_SATISFACTION", journey: "journey-offline", spot: "synthetic-spot-offline", occurredAt: "2025-12-15T12:00:00.000Z", eventHash: offlineOriginal.eventHash, retryOfRecordId: offlineOriginal.recordId });
const manyOpens = Array.from({ length: 128 }, (_, index) => syntheticCalibrationEvidence({ id: `bulk-open-${index}`, eventType: "OPENED", journey: "journey-bulk", spot: "synthetic-spot-bulk" }));

export const PHASE3B_CALIBRATION_SCENARIOS: readonly CalibrationScenario[] = Object.freeze([
  scenario("01-cold-start-user", []),
  scenario("02-single-save", [syntheticCalibrationEvidence({ id: "single-save", eventType: "SAVED" })]),
  scenario("03-save-and-remove", [syntheticCalibrationEvidence({ id: "save-first", eventType: "SAVED", journey: "journey-save-state" }), syntheticCalibrationEvidence({ id: "save-remove", eventType: "SAVE_REMOVED", journey: "journey-save-state" })]),
  scenario("04-navigation-without-visit", [syntheticCalibrationEvidence({ id: "navigation", eventType: "NAVIGATION_STARTED" })]),
  scenario("05-visit-without-satisfaction", [syntheticCalibrationEvidence({ id: "visit-neutral", eventType: "VISITED" })]),
  scenario("06-review-without-satisfaction", [syntheticCalibrationEvidence({ id: "review-neutral", eventType: "STANDARD_REVIEW" })]),
  scenario("07-standard-versus-smart-review", [syntheticCalibrationEvidence({ id: "review-standard", eventType: "STANDARD_REVIEW", journey: "journey-review-standard" }), syntheticCalibrationEvidence({ id: "review-smart", eventType: "SMART_REVIEW", journey: "journey-review-smart" })]),
  scenario("08-explicit-satisfaction", [positive("positive-one")]),
  scenario("09-explicit-dissatisfaction", [negative("negative-one")]),
  scenario("10-positive-and-negative-parallel", [positive("mixed-positive", "journey-mixed-positive"), negative("mixed-negative", "journey-mixed-negative")]),
  scenario("11-three-events-same-journey", [syntheticCalibrationEvidence({ id: "same-shown", eventType: "SHOWN", journey: sameJourney }), syntheticCalibrationEvidence({ id: "same-opened", eventType: "OPENED", journey: sameJourney }), positive("same-positive", sameJourney)]),
  scenario("12-three-independent-visits", [syntheticCalibrationEvidence({ id: "visit-independent-a", eventType: "VISITED" }), syntheticCalibrationEvidence({ id: "visit-independent-b", eventType: "VISITED" }), syntheticCalibrationEvidence({ id: "visit-independent-c", eventType: "VISITED" })]),
  scenario("13-repeat-same-spot", [syntheticCalibrationEvidence({ id: "repeat-a", eventType: "REPEAT_VISIT", journey: "journey-repeat-a" }), syntheticCalibrationEvidence({ id: "repeat-b", eventType: "REPEAT_VISIT", journey: "journey-repeat-b" }), syntheticCalibrationEvidence({ id: "repeat-c", eventType: "REPEAT_VISIT", journey: "journey-repeat-c" })]),
  scenario("14-many-spots-same-concept", [positive("concept-spot-a", "journey-concept-a", "spot-a"), positive("concept-spot-b", "journey-concept-b", "spot-b"), positive("concept-spot-c", "journey-concept-c", "spot-c")]),
  scenario("15-one-spot-many-concepts", [positive("multi-concept", "journey-multi-concept", "spot-multi", { concepts: [{ registryVersion: PHASE3B_SYNTHETIC_REGISTRY, conceptId: "vibe.synthetic-cozy", certainty: "SUPPORTED" }, { registryVersion: PHASE3B_SYNTHETIC_REGISTRY, conceptId: "environment.synthetic-outdoor", certainty: "VERIFIED" }, { registryVersion: PHASE3B_SYNTHETIC_REGISTRY, conceptId: "place.synthetic-cafe", certainty: "SUPPORTED" }] })]),
  scenario("16-context-flip", [positive("context-friends", "journey-context-friends", "spot-context", { context: context("friends") }), negative("context-alone", "journey-context-alone", "spot-context", { context: context("alone") })]),
  scenario("17-long-term-versus-current-context", [positive("long-term-no-context", "journey-long-term"), negative("current-context", "journey-current-context", "synthetic-spot-a", { context: context("friends") })]),
  scenario("18-practical-versus-concept", [syntheticCalibrationEvidence({ id: "practical-navigation", eventType: "NAVIGATION_STARTED", journey: "journey-practical" }), positive("practical-positive", "journey-practical-positive")]),
  scenario("19-direct-spot-no-concept", [syntheticCalibrationEvidence({ id: "direct-save", eventType: "SAVED", concepts: [] })]),
  scenario("20-aversion-strong-evidence", [negative("aversion-a", "journey-aversion-a"), negative("aversion-b", "journey-aversion-b"), negative("aversion-c", "journey-aversion-c")]),
  scenario("21-missing-evidence", []),
  scenario("22-conflicting-evidence", [positive("conflict-positive", "journey-conflict-positive"), negative("conflict-negative", "journey-conflict-negative")]),
  scenario("23-correction", [correctionTarget, syntheticCalibrationEvidence({ id: "correction-record", eventType: "CORRECTION", journey: "journey-correction", spot: null, supersedesRecordId: correctionTarget.recordId })]),
  scenario("24-late-offline-event-and-retry", [offlineOriginal, offlineRetry]),
  scenario("25-policy-change-full-rebuild", [positive("policy-rebuild", "journey-policy-rebuild", "synthetic-spot-policy", { context: context("friends") })]),
  scenario("26-exploration-versus-familiarity", [syntheticCalibrationEvidence({ id: "alternative-context", eventType: "ALTERNATIVE_REQUESTED", context: context("friends") }), syntheticCalibrationEvidence({ id: "familiar-repeat", eventType: "REPEAT_VISIT", context: context("friends") })]),
  scenario("27-uncertain-world-attribution", [positive("uncertain-world", "journey-uncertain", "synthetic-spot-uncertain", { concepts: [{ registryVersion: PHASE3B_SYNTHETIC_REGISTRY, conceptId: "vibe.synthetic-cozy", certainty: "CONFLICTING" }] })]),
  scenario("28-consent-withdrawal", [], { lifecycle: "WITHDRAWN" }),
  scenario("29-full-reset", [], { lifecycle: "RESET" }),
  scenario("30-account-erasure", [], { lifecycle: "ERASED" }),
  scenario("31-commercial-counterfactual", [positive("commercial-neutral")]),
  scenario("32-large-low-diversity", manyOpens),
  scenario("33-no-consent", [], { lifecycle: "NO_CONSENT" }),
  scenario("34-kill-switch", [], { killSwitch: true }),
]);

export function syntheticTrustForScenario(value: CalibrationScenario) {
  return createSyntheticCalibrationTrustContext(value.evidence);
}
