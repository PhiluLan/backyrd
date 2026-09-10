import { CONTRACT_VERSIONS as USER_VERSIONS, parseRelevantUserProjection, type DecisionVNextUserProjectionPort, type RelevantUserProjection, type RelevantUserProjectionRequest } from "@backyrd/user-intelligence-vnext-core";
import { contentHash } from "./canonical.js";
import type { SituationalContextSnapshot } from "./contracts.js";

export const USER_ADAPTER_VERSION = "backyrd-vnext-user-adapter-v1" as const;

export function projectionRequest(input: { requestId: string; decisionId: string; userId: string; subjectBindingHash: string; authenticationContextHash: string; context: SituationalContextSnapshot; killSwitch: boolean }): RelevantUserProjectionRequest {
  return {
    contractVersion: USER_VERSIONS.projectionRequest, requestId: input.requestId,
    actor: { kind: "AUTHENTICATED_USER", userId: input.userId, subjectBindingHash: input.subjectBindingHash, authenticationContextHash: input.authenticationContextHash, boundBy: "SERVER" },
    decisionId: input.decisionId, snapshot: null,
    context: { contextContractVersion: input.context.contractVersion, contextHash: input.context.contextHash, placeTypes: [], domainKeys: input.context.explicit.intentKeys, rawLocationIncluded: false, socialDetailsIncluded: false },
    requestedDomains: input.context.explicit.intentKeys, budgets: { maxItems: 16, maxBytes: 8192 }, projectionPolicyVersion: "phase1-projection-policy-not-configured", killSwitch: input.killSwitch,
  };
}

export async function readRelevantUserProjection(port: DecisionVNextUserProjectionPort, request: RelevantUserProjectionRequest): Promise<RelevantUserProjection> {
  if (port.contractVersion !== "backyrd.user-intelligence.decision-projection-port@1.0") throw new Error("user_projection_port_version_unknown");
  const projection = parseRelevantUserProjection(await port.project(request), request);
  if (projection.boundaries.eligibilityAuthority || projection.boundaries.rawEventsIncluded || projection.boundaries.reviewTextIncluded || projection.boundaries.rawLocationIncluded || projection.boundaries.privateSocialDataIncluded) throw new Error("user_projection_boundary_violation");
  return projection;
}

export const userProjectionSetHash = (projection: RelevantUserProjection): string => contentHash({ contractVersion: projection.contractVersion, projectionId: projection.projectionId, projectionHash: projection.projectionHash, manifest: projection.manifest, subjectBindingHash: projection.subjectBindingHash });
