import { withContentHash } from "./canonical.js";
import { CONTRACT_VERSIONS, DecisionContextSnapshotSchema, type DecisionContextSnapshot, type DecisionExecutionEnvelope, type DecisionRequest } from "./contracts.js";

export function resolvePhase1Context(request: DecisionRequest, execution: DecisionExecutionEnvelope): DecisionContextSnapshot {
  if (request.location.kind !== "city") throw new Error("phase1_city_location_required");
  return DecisionContextSnapshotSchema.parse(withContentHash({
    contractVersion: CONTRACT_VERSIONS.contextSnapshot,
    serverRequestId: execution.serverRequestId,
    resolvedAt: execution.executedAt,
    location: request.location,
    intentKeys: [...request.intentKeys],
    moodKeys: [...request.moodKeys],
    ...(request.socialContext === undefined ? {} : { socialContext: request.socialContext }),
    hardConstraints: [...request.hardConstraints],
    softPreferences: [...request.softPreferences],
    limitations: ["phase1-synthetic-context-only"],
  }, "contextHash"));
}
