import { contentHash } from "./canonical-json.mjs";
import { buildN6Input, estimateRequestCost, estimateTokens, requireAiBudget, assertBudget } from "./n6a-ai-decision-buddy.mjs";

export const N6A1_VERSIONS = Object.freeze({
  reasonContract: "backyrd-n6a1-reason-evidence-contract-v1",
  input: "backyrd-n6a1-ai-decision-input-v1",
  output: "backyrd-n6a1-ai-decision-output-v1",
  instruction: "backyrd-n6a1-ai-decision-buddy-instruction-v1",
  validator: "backyrd-n6a1-reason-evidence-validator-v1",
  capture: "backyrd-n6a1-output-forensic-capture-v1"
});

export const REASON_SEMANTICS = Object.freeze({
  RELEVANT_TASTE_MATCH: { scope: "WHY_FOR_YOU", requires: ["USER_TASTE", "CANDIDATE_CONCEPT"], minimumUserConfidence: 0.65, minimumUserRelevance: 0.65, minimumSpotConfidence: 0.5, insufficient: ["global_history_without_candidate_match", "low_confidence_taste", "moment_only"] },
  CONTEXTUAL_TASTE_MATCH: { scope: "WHY_FOR_YOU", requires: ["CONTEXTUAL_USER_TASTE", "CANDIDATE_CONCEPT"], minimumUserConfidence: 0.65, minimumUserRelevance: 0.65, minimumSpotConfidence: 0.5, insufficient: ["global_taste_only", "pattern_only", "moment_only"] },
  CURRENT_INTENT_MATCH: { scope: "WHY_NOW", requires: ["EXPLICIT_INTENT_CONCEPT", "CANDIDATE_CONCEPT"], minimumSpotConfidence: 0.5, insufficient: ["request_exists_without_concept_match", "moment_only", "user_history_only"] },
  CURRENT_MOMENT_MATCH: { scope: "WHY_NOW", requires: ["DERIVED_MOMENT_CONCEPT", "CANDIDATE_CONCEPT"], minimumMomentConfidence: 0.65, minimumSpotConfidence: 0.5, insufficient: ["moment_exists_without_candidate_match", "user_history_only"] },
  PLACE_TYPE_MATCH: { scope: "WHY_NOW", requires: ["EXPLICIT_PLACE_TYPE", "CANDIDATE_PLACE_TYPE"], insufficient: ["candidate_category_only", "user_place_type_history_only"] },
  LOW_USER_KNOWLEDGE: { scope: "UNCERTAINTY", requires: ["USER_SUFFICIENCY_LOW"] },
  LOW_MOMENT_UNDERSTANDING: { scope: "UNCERTAINTY", requires: ["MOMENT_SUFFICIENCY_NOT_HIGH"] },
  SPARSE_SPOT_INTELLIGENCE: { scope: "UNCERTAINTY", requires: ["SPOT_EVIDENCE_SPARSE"] },
  CONTRADICTORY_EVIDENCE: { scope: "UNCERTAINTY", requires: ["CONTRADICTION"] }
});

export const WHY_FOR_YOU_CODES = Object.freeze(["RELEVANT_TASTE_MATCH", "CONTEXTUAL_TASTE_MATCH"]);
export const WHY_NOW_CODES = Object.freeze(["CURRENT_INTENT_MATCH", "CURRENT_MOMENT_MATCH", "PLACE_TYPE_MATCH"]);
export const UNCERTAINTY_CODES = Object.freeze(["LOW_USER_KNOWLEDGE", "LOW_MOMENT_UNDERSTANDING", "SPARSE_SPOT_INTELLIGENCE", "CONTRADICTORY_EVIDENCE"]);
const candidateConcept = (candidate, concept, minimum = 0.5) => candidate.concepts.find((row) => row.concept === concept && row.value > 0 && row.confidence >= minimum);

function derivedMomentConcepts(moment) {
  const field = (name) => moment.fields?.[name]; const rows = [];
  const add = (dimension, value, concepts) => { const source = field(dimension); if (source?.value === value && source.confidence >= 0.65) for (const concept of concepts) rows.push({ ref: `moment:${dimension}:${concept}`, kind: "DERIVED_MOMENT_CONCEPT", concept, confidence: source.confidence, source: dimension }); };
  add("vibe", "cozy", ["vibe.cozy", "energy.calm"]); add("vibe", "lively", ["vibe.lively", "energy.energetic"]); add("vibe", "relaxed", ["vibe.cozy", "energy.calm"]);
  add("social_context", "family", ["social_style.family_friendly"]); add("social_context", "family_with_kids", ["social_style.family_friendly"]); add("social_context", "friends", ["social_style.social", "social_style.group_friendly"]); add("social_context", "date", ["social_style.romantic_friendly", "social_style.conversation_friendly"]); add("social_context", "solo", ["social_style.solo_friendly"]); add("social_context", "work", ["social_style.work_friendly"]);
  return rows;
}

export function buildReasonEvidenceIndex(input) {
  const rows = []; const add = (row) => rows.push(Object.freeze(row));
  for (const direction of input.currentIntent.conceptDirections ?? []) if (direction.direction === 1) add({ ref: `intent:${direction.concept}`, kind: "EXPLICIT_INTENT_CONCEPT", concept: direction.concept, confidence: 1, source: "CURRENT_INTENT" });
  for (const placeType of [...(input.currentIntent.requiredPlaceTypes ?? []), ...(input.currentIntent.preferredPlaceTypes ?? [])]) add({ ref: `intent:place_type:${placeType}`, kind: "EXPLICIT_PLACE_TYPE", placeType, confidence: 1, source: "CURRENT_INTENT" });
  for (const row of derivedMomentConcepts(input.currentMoment)) add(row);
  for (const taste of input.relevantUserProjection.relevantTaste) if (taste.affinity > 0 && taste.confidence >= 0.65 && taste.relevance >= 0.65) add({ ref: `user:${taste.sourceLayer}:${taste.concept}`, kind: taste.sourceLayer === "CONTEXT" ? "CONTEXTUAL_USER_TASTE" : "USER_TASTE", concept: taste.concept, confidence: taste.confidence, relevance: taste.relevance, source: "N5" });
  for (const candidate of input.candidates) {
    for (const concept of candidate.concepts.filter((row) => row.value > 0 && row.confidence >= 0.5)) add({ ref: `spot:${candidate.spotId}:${concept.concept}`, kind: "CANDIDATE_CONCEPT", spotId: candidate.spotId, concept: concept.concept, confidence: concept.confidence, source: "N4" });
    const placeType = candidate.facts.place_type?.value; if (placeType) add({ ref: `spot:${candidate.spotId}:place_type:${placeType}`, kind: "CANDIDATE_PLACE_TYPE", spotId: candidate.spotId, placeType, confidence: candidate.facts.place_type.confidence, source: "N4" });
    if (candidate.evidenceSufficiency === "SPARSE") add({ ref: `spot:${candidate.spotId}:sparse`, kind: "SPOT_EVIDENCE_SPARSE", spotId: candidate.spotId, source: "N4" });
    if (candidate.contradictions.length) add({ ref: `spot:${candidate.spotId}:contradiction`, kind: "CONTRADICTION", spotId: candidate.spotId, source: "N4" });
  }
  if (input.relevantUserProjection.sufficiency.level === "LOW") add({ ref: "user:sufficiency:low", kind: "USER_SUFFICIENCY_LOW", source: "N5" });
  if (input.currentMoment.confidenceLevel !== "HIGH") add({ ref: "moment:sufficiency:not_high", kind: "MOMENT_SUFFICIENCY_NOT_HIGH", source: "N3" });
  if (input.relevantUserProjection.contradictions.length) add({ ref: "user:contradiction", kind: "CONTRADICTION", source: "N5" });
  return Object.freeze({ version: N6A1_VERSIONS.reasonContract, entries: Object.freeze(rows), hash: contentHash(rows) });
}

export function buildN6A1Input(args) {
  // Existing N6A inputs already carry an input hash but not the original
  // decisionId. Rebuilding them would lose their canonical identity.
  const base = args?.version === "backyrd-n6-ai-decision-input-v1" && args?.inputHash
    ? args
    : buildN6Input(args);
  const reasonEvidence = buildReasonEvidenceIndex(base);
  const body = { version: N6A1_VERSIONS.input, baseInput: base, reasonEvidence, inputHash: contentHash({ baseInputHash: base.inputHash, reasonEvidenceHash: reasonEvidence.hash }) };
  return Object.freeze(body);
}

const reasonItemSchema = (codes) => ({ type: "object", additionalProperties: false, properties: { code: { type: "string", enum: codes }, evidence_refs: { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } } }, required: ["code", "evidence_refs"] });
export function n6A1OutputSchema(candidateIds) {
  return { type: "object", additionalProperties: false, properties: { ranked_candidates: { type: "array", minItems: candidateIds.length, maxItems: candidateIds.length, items: { type: "object", additionalProperties: false, properties: { spot_id: { type: "string", enum: candidateIds }, rank: { type: "integer", minimum: 1, maximum: candidateIds.length }, buddy_fit: { type: "number", minimum: 0, maximum: 1 }, confidence: { type: "number", minimum: 0, maximum: 1 }, why_for_you: { type: "array", maxItems: 2, items: reasonItemSchema(WHY_FOR_YOU_CODES) }, why_now: { type: "array", maxItems: 3, items: reasonItemSchema(WHY_NOW_CODES) }, uncertainty: { type: "array", maxItems: 3, items: reasonItemSchema(UNCERTAINTY_CODES) } }, required: ["spot_id", "rank", "buddy_fit", "confidence", "why_for_you", "why_now", "uncertainty"] } }, decision_confidence: { type: "number", minimum: 0, maximum: 1 }, user_knowledge_sufficiency: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] }, moment_understanding_sufficiency: { type: "string", enum: ["LOW", "PARTIAL", "HIGH"] } }, required: ["ranked_candidates", "decision_confidence", "user_knowledge_sufficiency", "moment_understanding_sufficiency"] };
}

function inspectReason(reason, scope, candidate, evidence) {
  if (!reason || typeof reason !== "object" || Array.isArray(reason) || Object.keys(reason).some((key) => !["code", "evidence_refs"].includes(key)) || !Array.isArray(reason.evidence_refs) || reason.evidence_refs.length < 1 || reason.evidence_refs.length > 2 || reason.evidence_refs.some((ref) => typeof ref !== "string")) return { status: "UNSUPPORTED", reason: "INVALID_REASON_SHAPE" };
  const semantics = REASON_SEMANTICS[reason.code]; if (!semantics || semantics.scope !== scope) return { status: "UNSUPPORTED", reason: "WRONG_OR_UNKNOWN_REASON_SCOPE" };
  const refs = reason.evidence_refs ?? []; const records = refs.map((ref) => evidence.entries.find((row) => row.ref === ref)).filter(Boolean);
  if (records.length !== refs.length) return { status: "UNSUPPORTED", reason: "UNKNOWN_EVIDENCE_REFERENCE" };
  if (records.some((row) => row.spotId && row.spotId !== candidate.spotId)) return { status: "UNSUPPORTED", reason: "CROSS_CANDIDATE_EVIDENCE" };
  const kinds = new Set(records.map(({ kind }) => kind)); const matchingConcept = records.filter(({ concept }) => concept).map(({ concept }) => concept);
  if (semantics.requires.some((kind) => !kinds.has(kind))) return { status: "UNSUPPORTED", reason: "MISSING_REQUIRED_EVIDENCE_KIND" };
  if (["RELEVANT_TASTE_MATCH", "CONTEXTUAL_TASTE_MATCH", "CURRENT_INTENT_MATCH", "CURRENT_MOMENT_MATCH"].includes(reason.code) && new Set(matchingConcept).size !== 1) return { status: "AMBIGUOUS_CONTRACT", reason: "CONCEPT_REFERENCES_MUST_MATCH" };
  return { status: "SUPPORTED", evidenceRefs: refs };
}

export function validateN6A1Output(payload, input) {
  const base = input.baseInput; const evidence = input.reasonEvidence; const ids = base.candidates.map(({ spotId }) => spotId);
  const audit = [];
  if (!payload || !Array.isArray(payload.ranked_candidates)) return { valid: false, reason: "MALFORMED_OUTPUT", audit };
  if (Object.keys(payload).some((key) => !["ranked_candidates", "decision_confidence", "user_knowledge_sufficiency", "moment_understanding_sufficiency"].includes(key))) return { valid: false, reason: "INVALID_OUTPUT_SCHEMA", audit };
  if (payload.ranked_candidates.length !== ids.length) return { valid: false, reason: "MISSING_CANDIDATE", audit };
  const outputIds = payload.ranked_candidates.map(({ spot_id }) => spot_id); if (new Set(outputIds).size !== outputIds.length) return { valid: false, reason: "DUPLICATE_CANDIDATE", audit }; if (outputIds.some((id) => !ids.includes(id))) return { valid: false, reason: "UNKNOWN_CANDIDATE", audit };
  const ranks = payload.ranked_candidates.map(({ rank }) => rank).sort((a, b) => a - b); if (ranks.some((rank, index) => rank !== index + 1)) return { valid: false, reason: "INVALID_RANK", audit };
  if (![payload.decision_confidence, ...payload.ranked_candidates.flatMap((row) => [row.buddy_fit, row.confidence])].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return { valid: false, reason: "INVALID_CONFIDENCE", audit };
  if (payload.user_knowledge_sufficiency !== base.relevantUserProjection.sufficiency.level || payload.moment_understanding_sufficiency !== base.currentMoment.confidenceLevel) return { valid: false, reason: "SUFFICIENCY_MISMATCH", audit };
  for (const row of payload.ranked_candidates) {
    if (!row || typeof row !== "object" || Object.keys(row).some((key) => !["spot_id", "rank", "buddy_fit", "confidence", "why_for_you", "why_now", "uncertainty"].includes(key))) return { valid: false, reason: "INVALID_OUTPUT_SCHEMA", audit };
    const candidate = base.candidates.find(({ spotId }) => spotId === row.spot_id);
    for (const [scope, reasons] of [["WHY_FOR_YOU", row.why_for_you], ["WHY_NOW", row.why_now], ["UNCERTAINTY", row.uncertainty]]) {
      if (!Array.isArray(reasons)) return { valid: false, reason: "INVALID_REASON_SCHEMA", audit };
      for (const reason of reasons) { const inspection = inspectReason(reason, scope, candidate, evidence); audit.push({ spotId: candidate.spotId, scope, code: reason.code, ...inspection }); if (inspection.status !== "SUPPORTED") return { valid: false, reason: "UNSUPPORTED_REASON_EVIDENCE", audit }; }
    }
  }
  return { valid: true, ranked: [...payload.ranked_candidates].sort((a, b) => a.rank - b.rank), audit };
}

export function n6A1Instructions() { return "Rank only supplied eligible candidates. Every reason must include exact evidence_refs from reason_evidence. If no complete evidence chain exists, omit the reason and use an uncertainty reason only when its evidence_ref is supplied. Current intent outranks history. Never invent facts, IDs, reasons, evidence references, premium, payment, trust, or private data."; }

export function captureN6A1Output({ payload, validation, input }) { return Object.freeze({ version: N6A1_VERSIONS.capture, inputHash: input.inputHash, reasonEvidenceHash: input.reasonEvidence.hash, parsedStructuredOutput: payload ?? null, validation, reasonAudit: validation.audit ?? [], captureCompleteness: payload ? "COMPLETE" : "MALFORMED_OR_EMPTY", secretMaterialPresent: false }); }

export async function callN6A1Buddy({ config, input, ledger, env = process.env, fetchImpl = fetch }) {
  const budget = requireAiBudget(env); if (!env.DECISION_LAB_OPENAI_API_KEY) throw new Error("DECISION_LAB_OPENAI_API_KEY_REQUIRED");
  const schema = n6A1OutputSchema(input.baseInput.candidates.map(({ spotId }) => spotId)); const tokens = estimateTokens({ instructions: n6A1Instructions(), input, schema }, config.tokenEstimateSafetyMultiplier);
  if (tokens > config.maxInputTokensPerRequest) throw new Error("N6A1_INPUT_TOKEN_CAP_EXCEEDED"); assertBudget({ budgetUsd: budget, spentUsd: ledger.spentUsd, projectedUsd: estimateRequestCost(config, tokens) });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), config.modelConfig.timeoutMs); const started = performance.now(); let response;
  try { response = await fetchImpl("https://api.openai.com/v1/responses", { method: "POST", signal: controller.signal, headers: { "content-type": "application/json", authorization: `Bearer ${env.DECISION_LAB_OPENAI_API_KEY}` }, body: JSON.stringify({ model: config.model, instructions: n6A1Instructions(), input: JSON.stringify(input), reasoning: { effort: config.modelConfig.reasoningEffort }, max_output_tokens: config.modelConfig.maxOutputTokens, text: { format: { type: "json_schema", name: "backyrd_n6a1_buddy", strict: true, schema } } }) }); } finally { clearTimeout(timeout); }
  const latencyMs = performance.now() - started; if (!response.ok) throw new Error(`OPENAI_API_ERROR:${response.status}`); const raw = await response.json(); let payload = null; try { for (const item of raw.output ?? []) for (const content of item.content ?? []) if (content.type === "output_text") payload = JSON.parse(content.text); } catch { /* captured as malformed */ }
  const validation = validateN6A1Output(payload, input); const usage = { inputTokens: Number(raw.usage?.input_tokens ?? 0), outputTokens: Number(raw.usage?.output_tokens ?? 0) }; const costUsd = estimateRequestCost(config, usage.inputTokens, usage.outputTokens); ledger.spentUsd += costUsd;
  return { execution: "LIVE_CALL", validation, capture: captureN6A1Output({ payload, validation, input }), usage, costUsd, latencyMs, responseHash: contentHash(raw.id ?? "missing") };
}

export const N6A1_CONTRACT = Object.freeze({ versions: N6A1_VERSIONS, semantics: REASON_SEMANTICS, boundaries: { noNewAiCallsInN6A1: true, rawRejectedOutputMustBeCapturedForFutureSmoke: true, premiumBlind: true, latentTruthRuntimeInput: false, productionIntegration: "NOT_STARTED" } });
export const N6A1_CONTRACT_HASH = contentHash(N6A1_CONTRACT);
