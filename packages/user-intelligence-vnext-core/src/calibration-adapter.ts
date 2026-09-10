import { contentHash } from "./canonical.js";
import {
  CalibrationAuthorityProof, CalibrationEvidence, CalibrationEventType, CalibrationEvidenceTrustAnchor,
  signalSemantics, withCalibrationAuthorityProofHash, withCalibrationEvidenceHash,
  withCalibrationEvidenceTrustAnchorHash,
} from "./calibration.js";
import { CanonicalUserEvent, CONTRACT_VERSIONS } from "./contracts.js";
import {
  EvidenceAuthorityContext, EvidenceBuildResult, EvidenceChainV2, parseContextEvidenceBinding,
  parseWorldEvidenceBinding, verifyEvidenceEngineState,
} from "./evidence-chain.js";
import { ContractValidationError } from "./schema.js";

export interface Phase2CalibrationAdapterInput {
  readonly phase2: EvidenceBuildResult;
  readonly eventId: string;
  readonly variant?: "REPEAT_VISIT";
}

const canonicalType = (event: CanonicalUserEvent, variant?: "REPEAT_VISIT"): CalibrationEventType => {
  if (variant === "REPEAT_VISIT") {
    if (event.eventType !== "VERIFIED_VISIT") throw new ContractValidationError("$.variant", "repeat visit variant requires a verified Phase 2 visit");
    return "REPEAT_VISIT";
  }
  if (event.eventType === "REVIEW_RECORDED") return event.payload.kind === "EXPERIENCE" && event.payload.reviewOrigin === "SMART_REVIEW" ? "SMART_REVIEW" : "STANDARD_REVIEW";
  if (event.eventType === "SATISFACTION_RECORDED") return event.payload.kind === "SATISFACTION" && event.payload.direction === "NEGATIVE" ? "EXPLICIT_DISSATISFACTION" : "EXPLICIT_SATISFACTION";
  const mapping: Partial<Record<CanonicalUserEvent["eventType"], CalibrationEventType>> = {
    CANDIDATE_EXPOSED: "SHOWN", SPOT_OPENED: "OPENED", SAVED: "SAVED", SAVE_REMOVED: "SAVE_REMOVED",
    NAVIGATION_INTENT: "NAVIGATION_STARTED", RESERVATION_INTENT: "RESERVATION_INTENT", VERIFIED_VISIT: "VISITED", USER_CORRECTION: "CORRECTION",
  };
  const mapped = mapping[event.eventType];
  if (!mapped) throw new ContractValidationError("$.eventId", "Phase 2 event has no configured Phase 3B adapter mapping");
  return mapped;
};

const authorityProof = (body: Omit<CalibrationAuthorityProof, "contractVersion" | "authorityVersion" | "proofHash">): CalibrationAuthorityProof => withCalibrationAuthorityProofHash({
  contractVersion: CONTRACT_VERSIONS.calibrationAuthorityProof,
  authorityVersion: CONTRACT_VERSIONS.calibrationAuthorityProof,
  ...body,
});

function chainForEvent(phase2: EvidenceBuildResult, event: CanonicalUserEvent): EvidenceChainV2 {
  const chain = phase2.state.chains.find((candidate) => candidate.eventHashes.some(({ eventId, eventHash }) => eventId === event.eventId && eventHash === event.eventHash));
  if (!chain) throw new ContractValidationError("$.phase2.chains", "event is absent from recursively verified Phase 2 chains");
  return chain;
}

function deriveBody(phase2: EvidenceBuildResult, event: CanonicalUserEvent, variant?: "REPEAT_VISIT"): Omit<CalibrationEvidence, "recordHash"> {
  if (!phase2.rebuildMaterial) throw new ContractValidationError("$.phase2.rebuildMaterial", "active Phase 2 rebuild material is required");
  const chain = chainForEvent(phase2, event);
  const eventType = canonicalType(event, variant);
  const semantics = signalSemantics(eventType);
  const targetEvent = event.eventType === "USER_CORRECTION" ? phase2.acceptedEvents.find(({ eventId }) => eventId === event.supersedesEventId) : undefined;
  if (event.eventType === "USER_CORRECTION" && !targetEvent) throw new ContractValidationError("$.eventId", "Phase 2 correction target is absent from the canonical ledger");
  const spotId = targetEvent?.references.spotId ?? event.references.spotId ?? null;
  const experienceEventId = targetEvent?.references.experienceEventId ?? event.references.experienceEventId ?? null;
  const journeyId = chain.journey.journeyId;
  const subjectBindingHash = chain.subject.subjectBindingHash;
  const boundUserHash = contentHash(event.userId);
  const proofBase = { subjectBindingHash, boundUserHash, spotId, journeyId, experienceEventId };
  const proofs: CalibrationAuthorityProof[] = [];
  const eventAuthority = event.authority.kind === "ADMINISTRATIVE_LIFECYCLE_ACTION" ? null : event.authority.kind;
  if (eventAuthority && semantics.authorityRequirement.authorities.includes(eventAuthority)) proofs.push(authorityProof({ ...proofBase, authority: eventAuthority, recordId: `phase2-event-authority-${event.eventId}`, recordHash: event.eventHash, policyVersion: event.authority.contractVersion }));
  const productProofIsJointlyRequired = semantics.authorityRequirement.mode === "ALL_OF" && semantics.authorityRequirement.authorities.includes("SERVER_VERIFIED_PRODUCT_STATE");
  if (productProofIsJointlyRequired && event.referenceResolution) proofs.push(authorityProof({ ...proofBase, authority: "SERVER_VERIFIED_PRODUCT_STATE", recordId: `phase2-reference-resolution-${event.eventId}`, recordHash: event.referenceResolution.resolutionRecordHash, policyVersion: event.referenceResolution.referencePolicyVersion }));
  const correction = chain.corrections.find(({ correctionEventId }) => correctionEventId === event.eventId);
  if (semantics.authorityRequirement.authorities.includes("SERVER_EVENT_LEDGER") && correction) proofs.push(authorityProof({ ...proofBase, authority: "SERVER_EVENT_LEDGER", recordId: `phase2-correction-resolution-${event.eventId}`, recordHash: correction.resolutionRecordHash, policyVersion: phase2.rebuildMaterial.builderPolicyVersion }));

  const worldBindings = phase2.rebuildMaterial.worldEvidence.filter((binding) => binding.eventId === event.eventId).map(parseWorldEvidenceBinding);
  const worldConcepts = worldBindings.flatMap((binding) => binding.references.filter(({ kind, referenceId }) => kind === "CONCEPT" && (
    referenceId.startsWith("vibe.synthetic-") || referenceId.startsWith("environment.synthetic-") || referenceId.startsWith("place.synthetic-")
  ))
    .map((reference) => ({ registryVersion: binding.worldRegistryVersion, registryHash: binding.worldRegistryHash, conceptId: reference.referenceId, certainty: reference.trust === "VERIFIED" ? "VERIFIED" as const : reference.trust === "SUPPORTED" ? "SUPPORTED" as const : reference.trust === "CONTESTED" ? "CONFLICTING" as const : "UNKNOWN" as const })));
  const contextBindings = phase2.rebuildMaterial.contextEvidence.filter((binding) => binding.eventId === event.eventId).map(parseContextEvidenceBinding);
  if (worldBindings.length > 1 || contextBindings.length > 1) throw new ContractValidationError("$.phase2", "adapter requires unique event-time World and Context bindings");
  const contextBinding = contextBindings[0];
  const context = contextBinding && !["UNKNOWN", "NOT_CONFIGURED"].includes(contextBinding.source) ? {
    contextHash: contextBinding.contextHash, dimensions: contextBinding.dimensions,
    authority: contextBinding.source === "USER_EXPLICIT" ? "EXPLICIT_USER" as const : contextBinding.source === "SERVER_AUTHORIZED" ? "SERVER_AUTHORIZED" as const : "CAUTIOUSLY_DERIVED" as const,
  } : null;
  const sourceWithoutHash = {
    adapterContractVersion: CONTRACT_VERSIONS.calibrationEvidenceAdapter, phase2StateHash: phase2.state.stateHash,
    phase2ChainId: chain.chainId, phase2ChainHash: chain.chainHash, phase2EventId: event.eventId, phase2EventHash: event.eventHash,
    journeyProofHash: chain.journey.proofHash, journeyAuthorityProofHashes: chain.journey.authorityProofHashes,
    worldBindingHashes: worldBindings.map(({ bindingHash }) => bindingHash).sort(), contextBindingHashes: contextBindings.map(({ bindingHash }) => bindingHash).sort(),
    correctionResolutionHash: correction?.resolutionRecordHash ?? null, consentEnvelopeHash: contentHash(phase2.rebuildMaterial.consent),
    lifecycleState: "ACTIVE" as const, productionAuthorized: false as const,
  };
  const sourceBinding = { ...sourceWithoutHash, bindingHash: contentHash(sourceWithoutHash) };
  const explicitOutcome = eventType === "EXPLICIT_SATISFACTION" ? "POSITIVE" as const : eventType === "EXPLICIT_DISSATISFACTION" ? "NEGATIVE" as const : "NONE" as const;
  const targetBody = targetEvent ? deriveBody(phase2, targetEvent) : null;
  const targetEvidence = targetBody ? withCalibrationEvidenceHash(targetBody) : null;
  return {
    contractVersion: CONTRACT_VERSIONS.calibrationEvidence, recordId: `calibration-${event.eventId}`, subjectBindingHash,
    eventType, eventHash: event.eventHash, chainId: chain.chainId, chainHash: chain.chainHash, journeyId,
    independenceEligible: chain.journey.independenceEligible && chain.independence.independentExperienceUnits === 1,
    spotId, experienceEventId, authorityProofs: proofs.sort((left, right) => left.authority.localeCompare(right.authority)),
    direction: explicitOutcome === "POSITIVE" ? "POSITIVE" : explicitOutcome === "NEGATIVE" ? "NEGATIVE" : "NOT_APPLICABLE",
    experienceConfirmed: ["VISITED", "REPEAT_VISIT", "STANDARD_REVIEW", "SMART_REVIEW"].includes(eventType) || (experienceEventId !== null && chain.journey.independenceEligible),
    explicitOutcome, worldConcepts, context, occurredAt: event.occurredAt, retryOfRecordId: null,
    correctionTarget: targetEvidence ? { recordId: targetEvidence.recordId, recordHash: targetEvidence.recordHash, eventHash: targetEvidence.eventHash, chainHash: targetEvidence.chainHash } : null,
    sourceBinding, active: true,
  };
}

/** Security boundary: recursively verifies Phase 2 before creating a non-authoritative calibration projection. */
export function deriveCalibrationEvidenceFromPhase2(input: Phase2CalibrationAdapterInput, authority: EvidenceAuthorityContext): CalibrationEvidence {
  if (input.phase2.state.status !== "ACTIVE" || !input.phase2.rebuildMaterial) throw new ContractValidationError("$.phase2", "suppressed Phase 2 state cannot create calibration evidence");
  verifyEvidenceEngineState(input.phase2.state, input.phase2.rebuildMaterial, authority);
  const event = input.phase2.acceptedEvents.find(({ eventId }) => eventId === input.eventId);
  if (!event) throw new ContractValidationError("$.eventId", "event is absent from the verified Phase 2 ledger");
  return withCalibrationEvidenceHash(deriveBody(input.phase2, event, input.variant));
}

/** Synthetic evaluation authority: independent from the adapter payload and never Production-authorizing. */
export function createSyntheticEvidenceEvaluationAnchor(evidence: CalibrationEvidence): CalibrationEvidenceTrustAnchor {
  return withCalibrationEvidenceTrustAnchorHash({
    contractVersion: CONTRACT_VERSIONS.calibrationEvidenceTrustAnchor, anchorId: `evaluation-anchor-${evidence.recordId}`,
    acceptedRecordId: evidence.recordId, acceptedRecordHash: evidence.recordHash, subjectBindingHash: evidence.subjectBindingHash,
    acceptedSourceBindingHash: evidence.sourceBinding.bindingHash, acceptedPhase2StateHash: evidence.sourceBinding.phase2StateHash,
    acceptedPhase2ChainHash: evidence.chainHash, acceptedPhase2EventHash: evidence.eventHash,
    issuer: "SYNTHETIC_EVALUATION_AUTHORITY", environment: "SYNTHETIC_FIXTURE_ONLY", productionAuthorized: false,
  });
}
