import { assertContentHash, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { CompositeContextObjectiveSchema, CompositeFitResultSchema, ConstraintCandidateTierSchema, ContextObservationAdapterResultSchema, PHASE3B_VERSIONS, type CompositeContextObjective, type CompositeFitResult, type ConstraintCandidateTier, type ContextObservationAdapterResult, type UnknownRule } from "./phase3b-contracts.js";
import { assertAcceptedPhase3BProductContextRelease, type AcceptedPhase3BProductContextRelease } from "./phase3b-release.js";

export function createCompositeSituationObjective(input: Omit<CompositeContextObjective, "contractVersion"|"registryVersion"|"policyVersion"|"objectiveHash">, release: AcceptedPhase3BProductContextRelease): CompositeContextObjective {
  assertAcceptedPhase3BProductContextRelease(release);
  const body = { contractVersion: PHASE3B_VERSIONS.compositeObjective, registryVersion: release.registry.registryVersion, policyVersion: release.policy.policyVersion, ...input };
  return deepFreeze(CompositeContextObjectiveSchema.parse(withContentHash(body, "objectiveHash")));
}

export function evaluateCompositeSituationObjective(objective: CompositeContextObjective, release: AcceptedPhase3BProductContextRelease): CompositeFitResult {
  assertAcceptedPhase3BProductContextRelease(release); assertContentHash(objective as unknown as Record<string, unknown>, "objectiveHash");
  if (objective.registryVersion !== release.registry.registryVersion || objective.policyVersion !== release.policy.policyVersion) throw new Error("phase3b_composite_binding_mismatch");
  const satisfied = objective.components.filter((item) => item.knowledgeState === "KNOWN_TRUE" && item.evidenceIds.length > 0 && item.worldRelationRefs.length > 0).map((item) => item.componentId);
  const missing = objective.components.filter((item) => !satisfied.includes(item.componentId)).map((item) => item.componentId);
  const configured = objective.components.every((item) => item.knowledgeState !== "NOT_CONFIGURED");
  const strong = configured && missing.length === 0;
  const state = !configured ? "NOT_CONFIGURED" as const : strong ? "AUTHORIZED_STRONG" as const : satisfied.length ? "PARTIAL_WITH_LIMITATION" as const : "NOT_SUPPORTED" as const;
  const body = { objectiveId: objective.objectiveId, state, satisfiedComponentIds: satisfied, missingComponentIds: missing, evidenceIds: [...new Set(objective.components.flatMap((item) => item.evidenceIds))].sort(), reasonCode: strong ? "composite-situation-confirmed" : "composite-situation-limited", explanationAuthorized: strong };
  return deepFreeze(CompositeFitResultSchema.parse(withContentHash(body, "resultHash")));
}

export function classifyConstraintCandidate(input: { readonly candidateId: string; readonly ruleClass: UnknownRule["ruleClass"]; readonly knowledgeState: ConstraintCandidateTier["knowledgeState"] }, release: AcceptedPhase3BProductContextRelease): ConstraintCandidateTier {
  assertAcceptedPhase3BProductContextRelease(release);
  const rule = release.policy.unknownRules.find((item) => item.ruleClass === input.ruleClass);
  if (!rule) throw new Error("phase3b_unknown_rule_missing");
  let tier: ConstraintCandidateTier["tier"]; let explanationState: ConstraintCandidateTier["explanationState"]; const limitations: string[] = [];
  if (input.knowledgeState === "KNOWN_TRUE") { tier = "ELIGIBLE_CONFIRMED"; explanationState = "CONFIRMED"; }
  else if (input.knowledgeState === "KNOWN_FALSE") { tier = "INELIGIBLE"; explanationState = "NOT_MATCHING"; }
  else if (input.knowledgeState === "NOT_CONFIGURED" || rule.treatment === "NOT_CONFIGURED") { tier = "NOT_CONFIGURED"; explanationState = "NOT_CONFIGURED"; limitations.push("constraint-policy-not-configured"); }
  else if (rule.treatment === "UNCONFIRMED_FALLBACK") { tier = "UNCONFIRMED_FALLBACK"; explanationState = "UNCONFIRMED"; limitations.push("relevant-world-fact-unknown"); }
  else { tier = "INELIGIBLE"; explanationState = "UNCONFIRMED"; limitations.push(`unknown-policy-${rule.treatment.toLowerCase()}`); }
  const body = { contractVersion: PHASE3B_VERSIONS.candidateTier, candidateId: input.candidateId, ruleClass: input.ruleClass, knowledgeState: input.knowledgeState, tier, limitationCodes: limitations, explanationState };
  return deepFreeze(ConstraintCandidateTierSchema.parse(withContentHash(body, "tierHash")));
}

export function orderConstraintCandidates(values: readonly ConstraintCandidateTier[]): readonly ConstraintCandidateTier[] {
  const order = { ELIGIBLE_CONFIRMED: 0, UNCONFIRMED_FALLBACK: 1, NOT_CONFIGURED: 2, INELIGIBLE: 3 } as const;
  return deepFreeze([...values].sort((a, b) => order[a.tier] - order[b.tier] || a.candidateId.localeCompare(b.candidateId)));
}

export function phase3BDecisionIdentity(input: unknown, release: AcceptedPhase3BProductContextRelease): string { assertAcceptedPhase3BProductContextRelease(release); return contentHash({ releaseHash: release.release.releaseHash, input }); }

export function prepareContextObservationAdapter(input: { readonly action: ContextObservationAdapterResult["action"]; readonly consent: boolean }, release: AcceptedPhase3BProductContextRelease): ContextObservationAdapterResult {
  assertAcceptedPhase3BProductContextRelease(release);
  const status = input.action === "ALTERNATIVE_REQUESTED" ? "NOT_APPLICABLE" as const : !input.consent ? "DENIED" as const : "NOT_CONFIGURED" as const;
  const reasonCode = input.action === "ALTERNATIVE_REQUESTED" ? "alternative-is-context-neutral" : !input.consent ? "user-consent-required" : "canonical-user-observation-adapter-not-configured";
  return deepFreeze(ContextObservationAdapterResultSchema.parse(withContentHash({ contractVersion: PHASE3B_VERSIONS.observationAdapter, action: input.action, status, reasonCode, userEventProduced: false as const, writesUserIntelligence: false as const }, "resultHash")));
}
