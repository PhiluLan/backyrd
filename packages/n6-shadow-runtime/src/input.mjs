import { contentHash } from "../../decision-input-runtime/src/package.mjs";
import { buildN6A2Input } from "../../../decision-lab/src/n6a2-reason-authorization.mjs";
import { N5_VERSIONS } from "../../../decision-lab/src/n5-relevant-user-projection.mjs";
import { N4_VERSIONS } from "../../../decision-lab/src/n4-spot-intelligence.mjs";
import { N6_SHADOW_VERSIONS, FROZEN_N6_CONFIG } from "./config.mjs";

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};
const unique = (values) => [...new Set(values.filter(Boolean))].sort();
const keyOf = ({ code, evidence_refs } = {}) => `${code ?? ""}|${[...(evidence_refs ?? [])].sort().join("|")}`;

function adaptProjection(value) {
  const compact = {
    version: N5_VERSIONS.serialization,
    sufficiency: {
      ...value.knowledgeSufficiency,
      level: value.knowledgeMode === "SUFFICIENT" ? "HIGH" : value.knowledgeMode === "PARTIAL" ? "MEDIUM" : "LOW"
    },
    relevantTaste: value.taste.map(({ concept, affinity, confidence, relevance, scope, reasonCodes }) => ({
      concept, affinity, confidence, relevance,
      sourceLayer: scope?.kind === "CONTEXT" ? "CONTEXT" : scope?.kind === "PLACE_TYPE" ? "PLACE_TYPE" : "GLOBAL",
      reasonCodes
    })),
    relevantPatterns: value.occasionPatterns.map(({ patternKey, confidence, relevance, reasonCodes }) => ({ contextSignature: patternKey, confidence, relevance, reasonCodes })),
    recentRelevantEvidence: [], uncertainties: value.uncertainties ?? [], contradictions: [],
    boundaries: { currentIntentAuthoritative: true, candidateIndependent: true, ranking: "NONE" }
  };
  const serializedBytes = new TextEncoder().encode(JSON.stringify(compact)).byteLength;
  return { ...compact, serializedBytes, estimatedTokens: Math.ceil(serializedBytes / 4), serializationHash: contentHash(compact) };
}

function adaptCandidate(candidate) {
  const facts = {
    place_type: candidate.n4.productFacts.placeType ? { value: candidate.n4.productFacts.placeType, confidence: 1 } : undefined,
    city: candidate.n4.productFacts.city ? { value: candidate.n4.productFacts.city, confidence: 1 } : undefined,
    open_now: candidate.n4.productFacts.openNow == null ? undefined : { value: candidate.n4.productFacts.openNow, confidence: 1 }
  };
  return {
    version: N4_VERSIONS.serialization, spotId: candidate.spotId,
    facts: Object.fromEntries(Object.entries(facts).filter(([, value]) => value)),
    concepts: candidate.n4.concepts.map(({ concept, presence, confidence, provenanceIdentity }) => ({
      concept, value: presence, confidence, evidenceFamilies: provenanceIdentity ? [String(provenanceIdentity)] : []
    })),
    contradictions: [],
    intelligenceConfidence: candidate.n4.concepts.length ? candidate.n4.concepts.reduce((sum, row) => sum + row.confidence, 0) / candidate.n4.concepts.length : 0,
    evidenceSufficiency: candidate.n4.availability === "FULL" ? "RICH" : candidate.n4.availability === "PARTIAL" ? "PARTIAL" : "SPARSE"
  };
}

function allowedFrozenReason(reason, candidate, projection) {
  const conceptRef = reason.concept ? `spot:${candidate.spotId}:${reason.concept}` : null;
  if (reason.type === "WHY_NOW" && reason.id.startsWith("now:concept:")) return { code: "CURRENT_INTENT_MATCH", evidence_refs: [`intent:${reason.concept}`, conceptRef] };
  if (reason.type === "WHY_NOW" && reason.id.startsWith("now:place_type:")) return { code: "PLACE_TYPE_MATCH", evidence_refs: [`intent:place_type:${reason.id.slice("now:place_type:".length)}`, `spot:${candidate.spotId}:place_type:${reason.id.slice("now:place_type:".length)}`] };
  if (reason.type === "WHY_FOR_YOU" && reason.id.startsWith("you:") && reason.concept) {
    const node = projection.taste.find((row) => `you:${row.nodeKey}` === reason.id);
    if (!node) return null;
    const layer = node.scope?.kind === "CONTEXT" ? "CONTEXT" : node.scope?.kind === "PLACE_TYPE" ? "PLACE_TYPE" : "GLOBAL";
    return { code: layer === "CONTEXT" ? "CONTEXTUAL_TASTE_MATCH" : "RELEVANT_TASTE_MATCH", evidence_refs: [`user:${layer}:${node.concept}`, conceptRef] };
  }
  if (reason.type === "UNCERTAINTY" && reason.id === "uncertainty:user:low") return { code: "LOW_USER_KNOWLEDGE", evidence_refs: ["user:sufficiency:low"] };
  if (reason.type === "UNCERTAINTY" && reason.id.startsWith("uncertainty:n4:")) return { code: "SPARSE_SPOT_INTELLIGENCE", evidence_refs: [`spot:${candidate.spotId}:sparse`] };
  return null;
}

function restrictAuthorization(n6Input, decisionPackage, deterministicInternal) {
  const bySpot = new Map(decisionPackage.candidates.map((row) => [row.spotId, row]));
  const s4Map = {};
  const candidates = n6Input.authorizedReasons.candidates.map((authorized) => {
    const source = deterministicInternal.authorizedReasons[authorized.spot_id] ?? [];
    const candidate = bySpot.get(authorized.spot_id);
    const allowed = new Map();
    for (const reason of source) {
      const frozen = allowedFrozenReason(reason, candidate, decisionPackage.n5);
      if (!frozen) continue;
      const key = keyOf(frozen);
      allowed.set(key, frozen);
      s4Map[`${authorized.spot_id}|${key}`] = { reasonId: reason.id, type: reason.type, copy: reason.copy, evidence: reason.evidence, reasonHash: reason.reasonHash };
    }
    const family = (rows) => rows.filter((row) => allowed.has(keyOf(row)));
    return { spot_id: authorized.spot_id, why_for_you: family(authorized.why_for_you), why_now: family(authorized.why_now), uncertainty: family(authorized.uncertainty) };
  });
  const body = { ...n6Input.authorizedReasons, candidates };
  const authorizedReasons = { ...body, authorizationHash: contentHash(body) };
  return { n6Input: { ...n6Input, authorizedReasons, inputHash: contentHash({ n6a1InputHash: n6Input.n6a1Input.inputHash, authorizationHash: authorizedReasons.authorizationHash }) }, s4ReasonMap: s4Map };
}

export function buildProductionN6ShadowInput({ decisionPackage, deterministicDecision }) {
  if (!decisionPackage || !deterministicDecision?.internal) throw new Error("n6_shadow_input_required");
  if (decisionPackage.packageHash !== deterministicDecision.internal.packageHash) throw new Error("n6_shadow_input_trace_mismatch");
  if (decisionPackage.candidates.length < 1 || decisionPackage.candidates.length > FROZEN_N6_CONFIG.candidateLimit) throw new Error("n6_shadow_candidate_count_unsupported");
  const { userId: _privateUserIdentity, ...providerMomentSource } = decisionPackage.n3.currentMoment;
  const providerMoment = structuredClone(providerMomentSource);
  if (providerMoment.boundaries) delete providerMoment.boundaries.latentTruthRuntimeInput;
  const adapted = {
    decisionId: decisionPackage.decisionId,
    currentIntent: decisionPackage.n5.currentIntent,
    currentMoment: providerMoment,
    relevantUserProjection: adaptProjection(decisionPackage.n5),
    candidates: decisionPackage.candidates.map(adaptCandidate)
  };
  const frozenInput = buildN6A2Input(adapted);
  const restricted = restrictAuthorization(frozenInput, decisionPackage, deterministicDecision.internal);
  const body = {
    version: N6_SHADOW_VERSIONS.input,
    decisionId: decisionPackage.decisionId,
    userId: decisionPackage.userId,
    packageHash: decisionPackage.packageHash,
    candidateSetHash: decisionPackage.candidateSet.candidateSetHash,
    momentHash: decisionPackage.n3.momentHash,
    projectionHash: decisionPackage.n5.projectionHash,
    n4Hashes: Object.fromEntries(decisionPackage.candidates.map((row) => [row.spotId, row.n4.snapshotHash])),
    knowledgeMode: decisionPackage.n5.knowledgeMode,
    currentIntent: decisionPackage.n5.currentIntent,
    rankingInputs: deterministicDecision.internal.rankingInputs,
    deterministicOrder: deterministicDecision.internal.finalOrder,
    reasonSetHashes: deterministicDecision.internal.reasonSetHashes,
    n6a2Input: restricted.n6Input,
    s4ReasonMap: restricted.s4ReasonMap,
    boundaries: { rawHistoryIncluded: false, commercialSignals: false, trustInternals: false, shadowOnly: true }
  };
  return deepFreeze({ ...body, inputHash: contentHash(body) });
}

export function selectedS4Reasons(shadowInput, payload) {
  return (payload?.ranked_candidates ?? []).flatMap((candidate) => [
    ...(candidate.why_for_you ?? []).map((row) => ["WHY_FOR_YOU", row]),
    ...(candidate.why_now ?? []).map((row) => ["WHY_NOW", row]),
    ...(candidate.uncertainty ?? []).map((row) => ["UNCERTAINTY", row])
  ].map(([family, row]) => {
    const mapped = shadowInput.s4ReasonMap[`${candidate.spot_id}|${keyOf(row)}`];
    return mapped ? { spotId: candidate.spot_id, family, code: row.code, evidenceRefs: unique(row.evidence_refs), ...mapped } : null;
  })).filter(Boolean);
}
