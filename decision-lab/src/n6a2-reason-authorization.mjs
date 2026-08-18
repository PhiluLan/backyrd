import { contentHash } from "./canonical-json.mjs";
import { buildN6A1Input, n6A1OutputSchema, validateN6A1Output } from "./n6a1-reason-evidence-integrity.mjs";

export const N6A2_VERSIONS = Object.freeze({
  authorization: "backyrd-n6a2-authorized-reason-set-v1",
  input: "backyrd-n6a2-ai-decision-input-v1",
  instruction: "backyrd-n6a2-ai-decision-buddy-instruction-v1",
  validator: "backyrd-n6a2-authorized-reason-validator-v1",
  replay: "backyrd-n6a2-offline-replay-v1"
});

const keyOf = ({ code, evidence_refs } = {}) => `${code ?? ""}|${[...(Array.isArray(evidence_refs) ? evidence_refs : [])].sort().join("|")}`;
const byKind = (evidence, kind, candidate) => evidence.entries.filter((row) => row.kind === kind && (!candidate || !row.spotId || row.spotId === candidate.spotId));
const candidateConcepts = (evidence, candidate) => byKind(evidence, "CANDIDATE_CONCEPT", candidate);
const matchingPairs = (left, right) => left.flatMap((a) => right.filter((b) => a.concept === b.concept).map((b) => [a, b]));
const reason = (code, entries) => Object.freeze({ code, evidence_refs: entries.map(({ ref }) => ref) });

function perCandidateAuthorization(input, candidate) {
  const evidence = input.reasonEvidence;
  const concepts = candidateConcepts(evidence, candidate);
  const whyForYou = [
    ...matchingPairs(byKind(evidence, "USER_TASTE"), concepts).map(([user, spot]) => reason("RELEVANT_TASTE_MATCH", [user, spot])),
    ...matchingPairs(byKind(evidence, "CONTEXTUAL_USER_TASTE"), concepts).map(([user, spot]) => reason("CONTEXTUAL_TASTE_MATCH", [user, spot]))
  ];
  const whyNow = [
    ...matchingPairs(byKind(evidence, "EXPLICIT_INTENT_CONCEPT"), concepts).map(([intent, spot]) => reason("CURRENT_INTENT_MATCH", [intent, spot])),
    ...matchingPairs(byKind(evidence, "DERIVED_MOMENT_CONCEPT"), concepts).map(([moment, spot]) => reason("CURRENT_MOMENT_MATCH", [moment, spot])),
    ...byKind(evidence, "EXPLICIT_PLACE_TYPE").flatMap((intent) => byKind(evidence, "CANDIDATE_PLACE_TYPE", candidate).filter((spot) => spot.placeType === intent.placeType).map((spot) => reason("PLACE_TYPE_MATCH", [intent, spot])))
  ];
  const uncertainty = [
    ...byKind(evidence, "USER_SUFFICIENCY_LOW").map((entry) => reason("LOW_USER_KNOWLEDGE", [entry])),
    ...byKind(evidence, "MOMENT_SUFFICIENCY_NOT_HIGH").map((entry) => reason("LOW_MOMENT_UNDERSTANDING", [entry])),
    ...byKind(evidence, "SPOT_EVIDENCE_SPARSE", candidate).map((entry) => reason("SPARSE_SPOT_INTELLIGENCE", [entry])),
    // Only an upstream canonical CONTRADICTION marker can authorize this reason.
    ...byKind(evidence, "CONTRADICTION", candidate).map((entry) => reason("CONTRADICTORY_EVIDENCE", [entry]))
  ];
  const unique = (rows) => Object.freeze([...new Map(rows.map((row) => [keyOf(row), row])).values()]);
  return Object.freeze({ spot_id: candidate.spotId, why_for_you: unique(whyForYou), why_now: unique(whyNow), uncertainty: unique(uncertainty) });
}

export function buildAuthorizedReasonSet(n6a1Input) {
  const candidates = Object.freeze(n6a1Input.baseInput.candidates.map((candidate) => perCandidateAuthorization(n6a1Input, candidate)));
  const body = { version: N6A2_VERSIONS.authorization, candidateSpecific: true, candidates };
  return Object.freeze({ ...body, authorizationHash: contentHash(body) });
}

export function buildN6A2Input(args) {
  const n6a1Input = args?.version === "backyrd-n6a1-ai-decision-input-v1" ? args : buildN6A1Input(args);
  const authorizedReasons = buildAuthorizedReasonSet(n6a1Input);
  const body = { version: N6A2_VERSIONS.input, n6a1Input, authorizedReasons };
  return Object.freeze({ ...body, inputHash: contentHash({ n6a1InputHash: n6a1Input.inputHash, authorizationHash: authorizedReasons.authorizationHash }) });
}

export function n6A2Instructions() {
  return [
    "Rank only supplied eligible candidates; explicit current intent outranks history.",
    "The authorized_reasons set is authoritative. For each candidate and reason family, emit only an exact provided code plus exact evidence_refs pair.",
    "Do not infer, expand, rename, transfer, or invent a reason. An empty authorized set means omit that reason; UNKNOWN and uncertainty are only allowed when explicitly authorized.",
    "Authorization controls claims, not the permissible structured evidence used to rank. Never infer payment, premium, trust, identity, private history, latent truth, or hidden facts."
  ].join(" ");
}

export const n6A2OutputSchema = n6A1OutputSchema;

export function validateN6A2Output(payload, input) {
  const authorizedBySpot = new Map(input.authorizedReasons.candidates.map((candidate) => [candidate.spot_id, candidate]));
  const authorizationAudit = [];
  // Authorization is evaluated first whenever reason-bearing output is present:
  // a valid vocabulary entry is still invalid when it was not granted to this candidate.
  for (const candidate of Array.isArray(payload?.ranked_candidates) ? payload.ranked_candidates : []) {
    const authorized = authorizedBySpot.get(candidate.spot_id);
    for (const [field, family] of [["why_for_you", "WHY_FOR_YOU"], ["why_now", "WHY_NOW"], ["uncertainty", "UNCERTAINTY"]]) {
      for (const emitted of Array.isArray(candidate[field]) ? candidate[field] : []) {
        const allowed = authorized?.[field].some((row) => keyOf(row) === keyOf(emitted));
        authorizationAudit.push({ spotId: candidate.spot_id, scope: family, code: emitted?.code ?? null, evidenceRefs: emitted?.evidence_refs ?? null, authorization: allowed ? "AUTHORIZED" : "NOT_AUTHORIZED" });
        if (!allowed) return { valid: false, reason: "UNAUTHORIZED_REASON", audit: authorizationAudit, authorizationValid: false };
      }
    }
  }
  const baseValidation = validateN6A1Output(payload, input.n6a1Input);
  const audit = [...(baseValidation.audit ?? []), ...authorizationAudit];
  if (!baseValidation.valid) return { ...baseValidation, audit, authorizationValid: false };
  return { valid: true, ranked: baseValidation.ranked, audit, authorizationValid: true };
}

export const N6A2_CONTRACT = Object.freeze({
  versions: N6A2_VERSIONS,
  canonicalContradiction: {
    definition: "Only an explicit upstream canonical CONTRADICTION evidence reference authorizes CONTRADICTORY_EVIDENCE.",
    insufficient: ["attribute_difference", "missing_evidence", "unknown", "low_confidence", "source_difference", "global_context_difference", "weak_strong_difference"]
  },
  boundaries: { candidateSpecificAuthorization: true, reasonAuthorizationDoesNotLimitRankingEvidence: true, premiumBillingTrustLatentTruthAuthorized: false, productionIntegration: "NOT_STARTED", externalAiCallsForN6A2: 0 }
});
export const N6A2_CONTRACT_HASH = contentHash(N6A2_CONTRACT);
