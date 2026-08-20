import { contentHash } from "./canonical-json.mjs";

export const N5_6_4_ENGINE_VERSION = "backyrd-n5-6-4-experience-satisfaction-v1";
export const N5_6_4_EVIDENCE_CONTRACT = Object.freeze({
  version: N5_6_4_ENGINE_VERSION,
  authorizedChange: "VERIFIED_VISIT_IS_EXPERIENCE_ONLY",
  verifiedVisit: { confirms: ["experience", "session_spot_independence", "familiarity", "repeat_behavior", "visit_history", "occasion_history"], neverConfirms: ["positive_satisfaction", "positive_taste", "liked_concept", "durable_positive_preference"] },
  satisfaction: { positive: ["positive_post_visit", "explicit_positive"], negative: ["negative_post_visit", "explicit_negative"], neutralOrUnknown: "NO_ARTIFICIAL_SIGNED_SATISFACTION" },
  ed001: "LATER_EXPLICIT_OUTCOME_REPLACES_ONLY_SATISFACTION_MEANING_WITHIN_JOURNEY_CONCEPT_SCOPE;_VISIT_EXPERIENCE_REMAINS",
  unchanged: ["weights", "thresholds", "confidence", "broad_concept_scope_attribution", "world", "latent_truth", "projection"]
});
export const N5_6_4_ENGINE_CONTRACT_HASH = contentHash(N5_6_4_EVIDENCE_CONTRACT);
// Projection v1 validates the canonical card version.  N5.6.4 changes only
// evidence semantics and adds bounded experience history; it deliberately
// retains the card schema version so N5.6.1 remains an unchanged consumer.
export const N5_6_4_ENGINE_OPTIONS = Object.freeze({ visitSemantics: "EXPERIENCE_ONLY", userCardVersion: "backyrd-n5-6-user-card-v1", evidenceVersion: "backyrd-n5-6-4-evidence-chain-v1" });
