import { assertContentHash, withContentHash } from "./canonical.js";
import { CONTRACT_VERSIONS, SituationalContextSnapshotSchema, type DecisionRequest, type SituationalContextSnapshot } from "./contracts.js";

export interface ContextAuthority { readonly decisionId: string; readonly sessionId: string; readonly executedAt: string; readonly actorSubjectBindingHash: string; readonly authorizedLocationScope: { readonly kind: "city"; readonly city: string } }

const placeholder = (value: DecisionRequest["budget"], namespace: string) => value ?? { state: "NOT_CONFIGURED" as const, namespace };

type EnvelopeContextAuthority = Omit<ContextAuthority, "actorSubjectBindingHash"> & { readonly authenticatedActor: { readonly subjectBindingHash: string } };

export function resolveSituationalContext(request: DecisionRequest, authorityValue: ContextAuthority | EnvelopeContextAuthority): SituationalContextSnapshot {
  if (request.location.kind !== "city") throw new Error("phase1_city_location_required");
  if (!("authorizedLocationScope" in authorityValue) || !authorityValue.authorizedLocationScope) throw new Error("context_authorized_location_scope_required");
  const authority: ContextAuthority = "actorSubjectBindingHash" in authorityValue ? authorityValue : { decisionId: authorityValue.decisionId, sessionId: authorityValue.sessionId, executedAt: authorityValue.executedAt, actorSubjectBindingHash: authorityValue.authenticatedActor.subjectBindingHash, authorizedLocationScope: authorityValue.authorizedLocationScope };
  if (request.location.city !== authority.authorizedLocationScope.city) throw new Error("context_location_authority_mismatch");
  const clientLocationHash = withContentHash({ location: request.location }, "hash").hash;
  const authorizedScopeHash = withContentHash({ location: authority.authorizedLocationScope }, "hash").hash;
  return SituationalContextSnapshotSchema.parse(withContentHash({
    contractVersion: CONTRACT_VERSIONS.contextSnapshot, decisionId: authority.decisionId, sessionId: authority.sessionId, resolvedAt: authority.executedAt,
    explicit: { location: request.location, intentKeys: [...request.intentKeys], moodKeys: [...request.moodKeys], ...(request.socialContext === undefined ? {} : { socialContext: request.socialContext }), ...(request.occasion === undefined ? {} : { occasion: request.occasion }), budget: placeholder(request.budget, "context.budget"), availableTime: placeholder(request.availableTime, "context.available-time"), weather: placeholder(request.weather, "context.weather"), exploration: placeholder(request.exploration, "context.exploration"), hardConstraints: [...request.hardConstraints], softPreferences: [...request.softPreferences], shownCandidateIds: [...request.shownCandidateIds], rejectedCandidateIds: [...request.rejectedCandidateIds] },
    serverBound: { actorSubjectBindingHash: authority.actorSubjectBindingHash, authorizedLocationScope: authority.authorizedLocationScope, canonicalTime: authority.executedAt, locationAuthority: { clientLocationHash, authorizedScopeHash, comparison: "MATCH" } },
    derived: [], limitations: ["phase1-context-taxonomies-not-configured"], rawLocationPersisted: false, writesUserIntelligence: false,
  }, "contextHash"));
}

export const resolvePhase1Context = resolveSituationalContext;

export function validateSituationalContext(context: SituationalContextSnapshot): void {
  const parsed = SituationalContextSnapshotSchema.parse(context);
  assertContentHash(parsed as unknown as Record<string, unknown>, "contextHash");
  if (parsed.explicit.location.city !== parsed.serverBound.authorizedLocationScope.city || parsed.serverBound.locationAuthority.comparison !== "MATCH") throw new Error("context_location_authority_mismatch");
  const clientHash = withContentHash({ location: parsed.explicit.location }, "hash").hash;
  const authorityHash = withContentHash({ location: parsed.serverBound.authorizedLocationScope }, "hash").hash;
  if (parsed.serverBound.locationAuthority.clientLocationHash !== clientHash || parsed.serverBound.locationAuthority.authorizedScopeHash !== authorityHash) throw new Error("context_location_authority_proof_invalid");
  if (parsed.derived.some((entry) => entry.state === "DERIVED" && entry.sourceHashes.length === 0)) throw new Error("derived_context_source_required");
}
