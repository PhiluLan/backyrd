import { deepFreeze } from "./canonical.js";
import { ContextDegradationEntrySchema, type ContextDegradationEntry } from "./context-kernel-contracts.js";

export const CONTEXT_DEGRADATION_MATRIX = deepFreeze({
  CONTEXT_REGISTRY_MISSING: { action: "FAIL_CLOSED", scope: "REQUEST" },
  CONTEXT_REGISTRY_UNKNOWN: { action: "FAIL_CLOSED", scope: "REQUEST" },
  CONTEXT_POLICY_UNKNOWN: { action: "EVALUATION_NOT_CONFIGURED", scope: "CONSTRAINT" },
  LOCATION_AUTHORITY_MISSING: { action: "REQUEST_REJECTED", scope: "REQUEST" },
  LOCATION_SCOPE_CONFLICT: { action: "REQUEST_REJECTED", scope: "REQUEST" },
  TIME_ZONE_MISSING: { action: "REQUEST_REJECTED", scope: "REQUEST" },
  SERVER_TIME_INVALID: { action: "FAIL_CLOSED", scope: "REQUEST" },
  LOCATION_PERMISSION_DENIED: { action: "USER_CLARIFICATION_REQUIRED", scope: "DIMENSION" },
  WEATHER_NOT_AVAILABLE: { action: "DIMENSION_IGNORED_WITH_LIMITATION", scope: "DIMENSION" },
  WEATHER_STALE: { action: "DIMENSION_IGNORED_WITH_LIMITATION", scope: "DIMENSION" },
  INTENT_UNKNOWN: { action: "DIMENSION_IGNORED_WITH_LIMITATION", scope: "DIMENSION" },
  TAXONOMY_NOT_CONFIGURED: { action: "EVALUATION_NOT_CONFIGURED", scope: "DIMENSION" },
  CONSTRAINT_POLICY_UNKNOWN: { action: "EVALUATION_NOT_CONFIGURED", scope: "CONSTRAINT" },
  CONSTRAINT_UNSUPPORTED: { action: "USER_CLARIFICATION_REQUIRED", scope: "CONSTRAINT" },
  USER_PROJECTION_MISSING: { action: "NEUTRAL_DEFAULT", scope: "DIMENSION" },
  WORLD_SNAPSHOT_MISSING: { action: "FAIL_CLOSED", scope: "REQUEST" },
  CANDIDATE_POOL_EMPTY: { action: "EVALUATION_NOT_CONFIGURED", scope: "EVALUATION" },
  SESSION_HISTORY_INVALID: { action: "FAIL_CLOSED", scope: "SESSION" },
  DERIVED_EVIDENCE_UNAUTHORIZED: { action: "FAIL_CLOSED", scope: "DIMENSION" },
} as const);

export type ContextDegradationCode = keyof typeof CONTEXT_DEGRADATION_MATRIX;

export function contextDegradation(code: ContextDegradationCode, subjectRef: string | null = null): ContextDegradationEntry {
  const entry = CONTEXT_DEGRADATION_MATRIX[code];
  return ContextDegradationEntrySchema.parse({ code, action: entry.action, scope: entry.scope, subjectRef });
}
