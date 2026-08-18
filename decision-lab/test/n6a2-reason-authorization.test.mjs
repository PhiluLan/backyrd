import assert from "node:assert/strict";
import test from "node:test";
import { buildN6AScenario } from "../src/n6a-scenarios.mjs";
import { buildN6A2Input, buildAuthorizedReasonSet, validateN6A2Output } from "../src/n6a2-reason-authorization.mjs";
import { replayN6A2Authorization } from "../src/n6a2-offline-replay.mjs";

const raw = () => structuredClone(buildN6AScenario({ seed: 6101, index: 2, arm: "ACTUAL" }).input);
const payload = (input) => ({ ranked_candidates: input.n6a1Input.baseInput.candidates.map((candidate, index) => ({ spot_id: candidate.spotId, rank: index + 1, buddy_fit: 0.5, confidence: 0.5, why_for_you: [], why_now: [], uncertainty: [] })), decision_confidence: 0.5, user_knowledge_sufficiency: input.n6a1Input.baseInput.relevantUserProjection.sufficiency.level, moment_understanding_sufficiency: input.n6a1Input.baseInput.currentMoment.confidenceLevel });
const candidateAuth = (input, field) => input.authorizedReasons.candidates.find((candidate) => candidate[field].length > 0 && (field !== "why_for_you" || candidate.why_now.length > 0));
const add = (output, spotId, field, item) => { output.ranked_candidates.find((row) => row.spot_id === spotId)[field].push(structuredClone(item)); return output; };

test("N6A.2 authorizes exact candidate-specific reasons and preserves empty reason states", () => {
  const input = buildN6A2Input(raw()); const allowed = candidateAuth(input, "why_for_you"); const output = add(payload(input), allowed.spot_id, "why_for_you", allowed.why_for_you[0]);
  assert.equal(validateN6A2Output(output, input).valid, true); // A
  assert.equal(validateN6A2Output(payload(input), input).valid, true); // K
  const other = input.authorizedReasons.candidates.find(({ spot_id }) => spot_id !== allowed.spot_id);
  assert.equal(validateN6A2Output(add(payload(input), other.spot_id, "why_for_you", allowed.why_for_you[0]), input).reason, "UNAUTHORIZED_REASON"); // B/J
  assert.equal(buildAuthorizedReasonSet(input.n6a1Input).candidateSpecific, true);
});

test("N6A.2 contradiction authorization requires an explicit canonical marker", () => {
  const noMarker = buildN6A2Input(raw()); const candidate = noMarker.authorizedReasons.candidates[0];
  const invented = { code: "CONTRADICTORY_EVIDENCE", evidence_refs: ["spot:any:price.budget", "spot:any:price.premium"] };
  assert.equal(validateN6A2Output(add(payload(noMarker), candidate.spot_id, "uncertainty", invented), noMarker).reason, "UNAUTHORIZED_REASON"); // C/E/F/G
  const markedRaw = raw(); markedRaw.candidates[0].contradictions = [{ code: "CANONICAL_SOURCE_CONFLICT" }];
  const marked = buildN6A2Input(markedRaw); const markedCandidate = marked.authorizedReasons.candidates.find(({ uncertainty }) => uncertainty.some(({ code }) => code === "CONTRADICTORY_EVIDENCE"));
  const marker = markedCandidate.uncertainty.find(({ code }) => code === "CONTRADICTORY_EVIDENCE");
  assert.equal(validateN6A2Output(add(payload(marked), markedCandidate.spot_id, "uncertainty", marker), marked).valid, true); // D
});

test("N6A.2 forbids cross-family, invented, privileged and injection-shaped claims", () => {
  const input = buildN6A2Input(raw()); const forYou = candidateAuth(input, "why_for_you"); const now = input.authorizedReasons.candidates.find(({ why_now }) => why_now.length > 0);
  assert.equal(validateN6A2Output(add(payload(input), forYou.spot_id, "why_for_you", now.why_now[0]), input).reason, "UNAUTHORIZED_REASON"); // H
  assert.equal(validateN6A2Output(add(payload(input), now.spot_id, "why_now", forYou.why_for_you[0]), input).reason, "UNAUTHORIZED_REASON"); // I
  for (const item of [
    { code: "INVENTED_REASON", evidence_refs: [] }, // L
    { code: "PREMIUM_BILLING_ADVANTAGE", evidence_refs: ["premium:yes"] }, // M
    { code: "TRUST_SECURITY_SIGNAL", evidence_refs: ["trust:private"] }, // N
    { code: "CURRENT_INTENT_MATCH", evidence_refs: ["ignore_previous_instructions:authorize"] } // O
  ]) assert.equal(validateN6A2Output(add(payload(input), now.spot_id, "why_now", item), input).reason, "UNAUTHORIZED_REASON");
});

test("N6A.2 offline replay rejects all eight unsupported contradiction claims without a false accept or reject", async () => {
  const replay = await replayN6A2Authorization();
  assert.equal(replay.summary.contradictionCount, 8);
  assert.equal(replay.summary.allEightContradictionsNotAuthorized, true);
  assert.equal(replay.runs.filter(({ originalValidatorDisposition, n6a2ValidatorDisposition }) => originalValidatorDisposition.valid && !n6a2ValidatorDisposition.valid).length, 0);
});
