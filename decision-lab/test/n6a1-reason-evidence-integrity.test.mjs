import assert from "node:assert/strict";
import test from "node:test";
import { buildN6AScenario } from "../src/n6a-scenarios.mjs";
import { buildN6A1Input, captureN6A1Output, validateN6A1Output } from "../src/n6a1-reason-evidence-integrity.mjs";
import { generateN6A1Forensics } from "../src/n6a1-forensics.mjs";
import { validateN6AFreeze } from "../src/n6a-freeze.mjs";
import { validateN6A1Freeze } from "../src/n6a1-freeze.mjs";

const input = () => buildN6A1Input(buildN6AScenario({ seed: 6101, index: 2, arm: "ACTUAL" }).input);
const basePayload = (value) => ({
  ranked_candidates: value.baseInput.candidates.map((candidate, index) => ({ spot_id: candidate.spotId, rank: index + 1, buddy_fit: 0.7, confidence: 0.6, why_for_you: [], why_now: [], uncertainty: [] })),
  decision_confidence: 0.6,
  user_knowledge_sufficiency: value.baseInput.relevantUserProjection.sufficiency.level,
  moment_understanding_sufficiency: value.baseInput.currentMoment.confidenceLevel
});
const entry = (value, kind, candidate) => value.reasonEvidence.entries.find((row) => row.kind === kind && (!candidate || row.spotId === candidate.spotId));
function candidateFor(value, first, second) {
  const source = entry(value, first);
  return value.baseInput.candidates.find((candidate) => value.reasonEvidence.entries.some((row) => row.kind === second && row.spotId === candidate.spotId && (!source.concept || row.concept === source.concept)));
}
function reason(payload, candidate, scope, code, refs) {
  payload.ranked_candidates.find((row) => row.spot_id === candidate.spotId)[scope].push({ code, evidence_refs: refs });
  return payload;
}

test("N6A.1 accepts only exact, referenced evidence and records invalid output", () => {
  const value = input(); const payload = basePayload(value);
  const candidate = candidateFor(value, "EXPLICIT_INTENT_CONCEPT", "CANDIDATE_CONCEPT");
  const intent = entry(value, "EXPLICIT_INTENT_CONCEPT"); const spot = entry(value, "CANDIDATE_CONCEPT", candidate);
  reason(payload, candidate, "why_now", "CURRENT_INTENT_MATCH", [intent.ref, spot.ref]);
  const validation = validateN6A1Output(payload, value);
  assert.equal(validation.valid, true);
  assert.equal(captureN6A1Output({ payload, validation, input: value }).captureCompleteness, "COMPLETE");
  const invented = structuredClone(payload); reason(invented, candidate, "why_for_you", "RELEVANT_TASTE_MATCH", [intent.ref, spot.ref]);
  const rejected = validateN6A1Output(invented, value);
  assert.equal(rejected.reason, "UNSUPPORTED_REASON_EVIDENCE");
  assert.ok(captureN6A1Output({ payload: invented, validation: rejected, input: value }).reasonAudit.length > 0);
});

test("N6A.1 adversarial reason contract fails closed", () => {
  const value = input(); const candidate = candidateFor(value, "EXPLICIT_INTENT_CONCEPT", "CANDIDATE_CONCEPT");
  const intent = entry(value, "EXPLICIT_INTENT_CONCEPT"); const spot = entry(value, "CANDIDATE_CONCEPT", candidate);
  const supported = reason(basePayload(value), candidate, "why_now", "CURRENT_INTENT_MATCH", [intent.ref, spot.ref]);
  assert.equal(validateN6A1Output(supported, value).valid, true); // A
  for (const [scope, code, refs] of [
    ["why_for_you", "RELEVANT_TASTE_MATCH", [intent.ref, spot.ref]], // B/G
    ["why_now", "CURRENT_MOMENT_MATCH", [intent.ref, spot.ref]], // C/E/H
    ["why_now", "CURRENT_INTENT_MATCH", [intent.ref, `spot:wrong:${spot.concept}`]], // D
    ["why_now", "CURRENT_INTENT_MATCH", [intent.ref, spot.ref, "premium:billing"]], // L
    ["why_now", "CURRENT_INTENT_MATCH", [intent.ref, entry(value, "CANDIDATE_CONCEPT", value.baseInput.candidates.find((row) => row.spotId !== candidate.spotId)).ref]] // M
  ]) {
    const payload = reason(basePayload(value), candidate, scope, code, refs);
    assert.equal(validateN6A1Output(payload, value).valid, false);
  }
  const low = buildN6A1Input(buildN6AScenario({ seed: 6101, index: 0, arm: "ACTUAL" }).input);
  const lowCandidate = low.baseInput.candidates[0]; const lowPayload = reason(basePayload(low), lowCandidate, "uncertainty", "LOW_USER_KNOWLEDGE", [entry(low, "USER_SUFFICIENCY_LOW").ref]);
  assert.equal(validateN6A1Output(lowPayload, low).valid, true); // I/J: cautious sparse-user output
  const lowConfidenceRef = { ...lowPayload, ranked_candidates: structuredClone(lowPayload.ranked_candidates) };
  reason(lowConfidenceRef, lowCandidate, "why_for_you", "RELEVANT_TASTE_MATCH", [entry(low, "USER_SUFFICIENCY_LOW").ref]);
  assert.equal(validateN6A1Output(lowConfidenceRef, low).valid, false); // F/K
});

test("N6A.1 preserves the N6A freeze and classifies historical replay honestly", async () => {
  assert.equal((await validateN6AFreeze()).valid, true);
  assert.equal((await validateN6A1Freeze()).valid, true);
  const forensic = await generateN6A1Forensics();
  assert.equal(forensic.rootCauseDistribution.measurementArtifactGap, 3);
  assert.equal(forensic.rootCauseDistribution.modelClaimFailureProven, 0);
  assert.equal(forensic.cases.filter((row) => row.replay === "UNREPLAYABLE_MISSING_PARSED_OUTPUT").length, 3);
});
