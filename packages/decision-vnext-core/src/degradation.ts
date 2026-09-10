import { PHASE2_CONTRACT_VERSIONS, type DegradationAction, type DegradationCode, type DegradationEntry } from "./phase2-contracts.js";

export const DEGRADATION_POLICY_VERSION = PHASE2_CONTRACT_VERSIONS.degradation;

const MATRIX: Readonly<Record<DegradationCode, { readonly action: DegradationAction; readonly scope: DegradationEntry["scope"] }>> = Object.freeze({
  WORLD_SNAPSHOT_MISSING: { action: "FAIL_CLOSED", scope: "RUN" },
  WORLD_REGISTRY_UNKNOWN: { action: "FAIL_CLOSED", scope: "RUN" },
  SOURCE_POLICY_NOT_ACCEPTED: { action: "FAIL_CLOSED", scope: "RUN" },
  WORLD_READINESS_INSUFFICIENT: { action: "EXCLUDE_CANDIDATE", scope: "CANDIDATE" },
  OPENING_HOURS_UNKNOWN: { action: "EXCLUDE_CANDIDATE", scope: "CANDIDATE" },
  OPENING_HOURS_NOT_AUTHORIZED: { action: "EXCLUDE_CANDIDATE", scope: "CANDIDATE" },
  WORLD_CONFLICT: { action: "EXCLUDE_CANDIDATE", scope: "CANDIDATE" },
  USER_PROJECTION_MISSING: { action: "NEUTRAL_PERSONALIZATION", scope: "USER" },
  NO_CONSENT: { action: "NEUTRAL_PERSONALIZATION", scope: "USER" },
  COLD_USER: { action: "NEUTRAL_PERSONALIZATION", scope: "USER" },
  USER_KILL_SWITCH: { action: "NEUTRAL_PERSONALIZATION", scope: "USER" },
  CONTEXT_DIMENSION_MISSING: { action: "RESULT_LIMITATION", scope: "REQUEST" },
  LOCATION_AUTHORITY_MISSING: { action: "REJECT_REQUEST", scope: "REQUEST" },
  CANDIDATE_POOL_EMPTY: { action: "RESULT_LIMITATION", scope: "RUN" },
  RANKING_ENGINE_UNKNOWN: { action: "FAIL_CLOSED", scope: "ENGINE" },
  EXPLANATION_EVIDENCE_INCOMPLETE: { action: "FAIL_CLOSED", scope: "ENGINE" },
  LEGACY_COMPARISON_UNAVAILABLE: { action: "SKIP_COMPARATOR", scope: "ENGINE" },
  POLICY_NOT_CONFIGURED: { action: "RESULT_LIMITATION", scope: "RUN" },
});

export function degradationEntry(code: DegradationCode, reasonCode: string, subjectRef?: string): DegradationEntry {
  const policy = MATRIX[code];
  return Object.freeze({ code, action: policy.action, scope: policy.scope, ...(subjectRef === undefined ? {} : { subjectRef }), reasonCode });
}

export const degradationMatrix = (): Readonly<Record<DegradationCode, { readonly action: DegradationAction; readonly scope: DegradationEntry["scope"] }>> => MATRIX;
