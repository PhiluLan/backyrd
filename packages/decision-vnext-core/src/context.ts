import { withContentHash } from "./canonical.js";
import { CONTRACT_VERSIONS, SituationalContextSnapshotSchema, type DecisionRequest, type SituationalContextSnapshot } from "./contracts.js";

export interface ContextAuthority { readonly decisionId: string; readonly sessionId: string; readonly executedAt: string; readonly actorSubjectBindingHash: string; readonly authorizedLocationScope: { readonly kind: "city"; readonly city: string } }

export function resolveSituationalContext(request: DecisionRequest, authorityValue: ContextAuthority | { readonly decisionId: string; readonly sessionId: string; readonly executedAt: string; readonly authenticatedActor: { readonly subjectBindingHash: string } }): SituationalContextSnapshot {
  if (request.location.kind !== "city") throw new Error("phase1_city_location_required");
  const authority: ContextAuthority = "actorSubjectBindingHash" in authorityValue ? authorityValue : { decisionId: authorityValue.decisionId, sessionId: authorityValue.sessionId, executedAt: authorityValue.executedAt, actorSubjectBindingHash: authorityValue.authenticatedActor.subjectBindingHash, authorizedLocationScope: request.location };
  if (request.location.city !== authority.authorizedLocationScope.city) throw new Error("context_location_authority_mismatch");
  return SituationalContextSnapshotSchema.parse(withContentHash({
    contractVersion: CONTRACT_VERSIONS.contextSnapshot, decisionId: authority.decisionId, sessionId: authority.sessionId, resolvedAt: authority.executedAt,
    explicit: { location: request.location, intentKeys: [...request.intentKeys], moodKeys: [...request.moodKeys], ...(request.socialContext === undefined ? {} : { socialContext: request.socialContext }), ...(request.occasion === undefined ? {} : { occasion: request.occasion }), hardConstraints: [...request.hardConstraints], softPreferences: [...request.softPreferences], shownCandidateIds: [...request.shownCandidateIds], rejectedCandidateIds: [...request.rejectedCandidateIds] },
    serverBound: { actorSubjectBindingHash: authority.actorSubjectBindingHash, authorizedLocationScope: authority.authorizedLocationScope, canonicalTime: authority.executedAt },
    derived: [
      { namespace: "context.weather", state: request.weather?.state === "KNOWN" ? "DERIVED" : request.weather?.state ?? "NOT_CONFIGURED", sourceHashes: [] },
      { namespace: "context.budget", state: request.budget?.state === "KNOWN" ? "DERIVED" : request.budget?.state ?? "NOT_CONFIGURED", sourceHashes: [] },
      { namespace: "context.exploration", state: request.exploration?.state === "KNOWN" ? "DERIVED" : request.exploration?.state ?? "NOT_CONFIGURED", sourceHashes: [] },
    ], limitations: ["phase1-context-taxonomies-not-configured"], rawLocationPersisted: false, writesUserIntelligence: false,
  }, "contextHash"));
}

export const resolvePhase1Context = resolveSituationalContext;
