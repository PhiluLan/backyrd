import { contentHash } from "../../decision-input-runtime/src/package.mjs";
import { validateN6A2Output } from "../../../decision-lab/src/n6a2-reason-authorization.mjs";
import { selectedS4Reasons } from "./input.mjs";
import { N6_SHADOW_VERSIONS } from "./config.mjs";

const forbiddenKey = /(owner|payment|billing|subscription|premium|commercial|sponsored|profile.?completeness|trust|moderation|latent|ground.?truth|encrypted.?content)/i;
const hasForbidden = (value) => value && typeof value === "object" && Object.entries(value).some(([key, child]) => forbiddenKey.test(key) || hasForbidden(child));

function currentIntentValid(payload, input) {
  const directions = input.currentIntent?.conceptDirections ?? [];
  if (!directions.length) return true;
  const ranked = [...payload.ranked_candidates].sort((a, b) => a.rank - b.rank);
  for (let index = 1; index < ranked.length; index += 1) {
    const prior = input.rankingInputs[ranked[index - 1].spot_id];
    const current = input.rankingInputs[ranked[index].spot_id];
    if (!prior || !current) return false;
    if (prior.intentTier < current.intentTier) return false;
    if (prior.intentTier === current.intentTier && prior.intentStrength < current.intentStrength) return false;
  }
  return true;
}

export function validateProductionN6Output(payload, input) {
  if (hasForbidden(payload)) return { version: N6_SHADOW_VERSIONS.validator, valid: false, reason: "FORBIDDEN_FIELD" };
  const frozen = validateN6A2Output(payload, input.n6a2Input);
  if (!frozen.valid) return { version: N6_SHADOW_VERSIONS.validator, ...frozen };
  if (input.knowledgeMode === "LOW_OR_UNKNOWN" && payload.ranked_candidates.some((row) => row.why_for_you.length)) return { version: N6_SHADOW_VERSIONS.validator, valid: false, reason: "LOW_KNOWLEDGE_OVERPERSONALIZATION", audit: frozen.audit };
  if (!currentIntentValid(payload, input)) return { version: N6_SHADOW_VERSIONS.validator, valid: false, reason: "CURRENT_INTENT_AUTHORITY_VIOLATION", audit: frozen.audit };
  const selectedReasons = selectedS4Reasons(input, payload);
  const emittedCount = payload.ranked_candidates.reduce((sum, row) => sum + row.why_for_you.length + row.why_now.length + row.uncertainty.length, 0);
  if (selectedReasons.length !== emittedCount) return { version: N6_SHADOW_VERSIONS.validator, valid: false, reason: "SPRINT4_REASON_MAPPING_MISMATCH", audit: frozen.audit };
  const ranked = [...payload.ranked_candidates].sort((a, b) => a.rank - b.rank);
  return {
    version: N6_SHADOW_VERSIONS.validator, valid: true, disposition: "VALIDATED", ranked,
    selectedReasons, audit: frozen.audit, outputHash: contentHash(payload)
  };
}
