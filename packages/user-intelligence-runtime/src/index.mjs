// The production runtime intentionally executes the frozen Lab implementation
// directly. Do not duplicate inference formulas in SQL or product adapters.
export {
  buildN5_8_4UserCard,
  absoluteNegativityEligibility,
  N5_8_4_NEGATIVE_PROMOTION_CONTRACT,
  N5_8_4_NEGATIVE_PROMOTION_CONTRACT_HASH,
} from "../../../decision-lab/src/n5-8-4-absolute-negativity-guard.mjs";
export {
  buildN5_8UserCard,
  understandMoods,
  understandReview,
  verifyN5_8Rebuild,
  N5_8_EVIDENCE_CONTRACT,
  N5_8_FUSION_CONTRACT,
  N5_8_CONTRACT_HASH,
} from "../../../decision-lab/src/n5-8-unified-user-evidence.mjs";
export {
  buildN5_7UserCard,
  buildN5_7OutcomeObservations,
  verifyN5_7UserCardRebuild,
  N5_7_OUTCOME_OBSERVATION_CONTRACT,
  N5_7_PREFERENCE_INFERENCE_CONTRACT,
  N5_7_CONTRACT_HASH,
} from "../../../decision-lab/src/n5-7-comparative-preference.mjs";
export {
  applyN5_8_2HighEligibility,
  highEligibilityFor,
  N5_8_2_HIGH_ELIGIBILITY_CONTRACT,
  N5_8_2_HIGH_ELIGIBILITY_CONTRACT_HASH,
} from "../../../decision-lab/src/n5-8-2-epistemic-high-guard.mjs";
export { buildCanonicalRuntimeInput } from "./production-input.mjs";
export { rebuildUserIntelligence, validateRuntimeResult } from "./worker.mjs";
export { SupabaseUserIntelligenceRepository } from "./supabase-repository.mjs";
