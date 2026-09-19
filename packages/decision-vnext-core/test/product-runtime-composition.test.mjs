import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ACCEPTED_SOURCE_POLICY, REGISTRY_HASH, REGISTRY_VERSION } from "@backyrd/world-knowledge-core";
import {
  createDecisionProductRpcEvaluationProvider,
  createDecisionProductRpcLearningPort,
  contentHash,
} from "../dist/index.js";

const root = new URL("../../../", import.meta.url);
const edge = readFileSync(new URL("supabase/functions/decision-v13/vnext-only.ts", root), "utf8");
const migration = readFileSync(new URL("supabase/migrations/20260918182831_decision_vnext_product_runtime_v1.sql", root), "utf8");
const hash = (value) => contentHash(value);
const identity = { releaseHash: hash("release"), artifactHash: hash("artifact"), sourceSetHash: hash("source"), controlGeneration: 1 };
const actor = { userId: "11111111-1111-4111-a111-111111111111", subjectBindingHash: hash("subject"), authenticationContextHash: hash("auth"), sessionBindingHash: hash("session-binding"), sessionId: "22222222-2222-4222-a222-222222222222" };

test("decision-v13 composes canonical Product providers without unavailable, Founder or legacy fallbacks", () => {
  assert.match(edge, /createDecisionProductRpcEvaluationProvider\(rpc\)/);
  assert.match(edge, /createDecisionProductRpcLearningPort\(rpc, config\.identity\)/);
  assert.doesNotMatch(edge, /unavailableEvaluationProvider|unavailableLearningPort|from .*founder|from .*legacy/i);
});

test("Product context RPC is service-only, area-bound and reads personal state only after consent", () => {
  assert.match(migration, /create function public\.backyrd_decision_vnext_product_context_v1/);
  assert.match(migration, /s\.status='approved'/);
  assert.match(migration, /lower\(m\.world_snapshot#>>'\{spot,location,locality\}'\)=lower\(btrim\(p_target_city\)\)/);
  assert.match(migration, /attribute_key in \('identity\.location','identity\.locality','location\.locality'\)/);
  assert.match(migration, /if not found or v_consent\.status<>'granted' then[\s\S]+?'snapshot',null/);
  assert.match(migration, /revoke all on function[\s\S]+backyrd_decision_vnext_product_context_v1[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]+backyrd_decision_vnext_product_context_v1[\s\S]+to service_role/);
  assert.doesNotMatch(migration, /p_(?:allowlist|founder|fixture|spot_ids)/i);
});

test("Product learning authority reconstructs exact bindings from consent and sealed Decision ledger", () => {
  assert.match(migration, /create function public\.backyrd_decision_vnext_product_learning_event_v1/);
  for (const binding of ["auth_user_id=p_auth_user_id", "subject_digest=p_subject_binding_hash", "authenticationContextHash", "contextHash", "sessionId", "candidate_binding_invalid", "product_learning_event_not_sealed"]) assert.match(migration, new RegExp(binding));
  assert.match(migration, /return jsonb_build_object\('contractVersion','backyrd\.user-intelligence\.product-decision-learning-receipt@1\.0',[\s\S]+?'SUPPRESSED_NO_CONSENT'[\s\S]+?'persisted',false/);
});

test("runtime adapters reject missing target authority and forward only server-bound learning identity", async () => {
  let calls = 0;
  const rpc = { async rpc(name, parameters) {
    calls += 1;
    assert.equal(name, "backyrd_decision_vnext_product_learning_event_v1");
    assert.equal(parameters.p_auth_user_id, actor.userId);
    assert.equal(parameters.p_subject_binding_hash, actor.subjectBindingHash);
    assert.equal(parameters.p_authentication_context_hash, actor.authenticationContextHash);
    return { data: { contractVersion: "backyrd.user-intelligence.product-decision-learning-receipt@1.0", status: "SUPPRESSED_NO_CONSENT", persisted: false, eventId: null, recordHash: null, neutralProjectionRequired: true }, error: null };
  } };
  const learning = createDecisionProductRpcLearningPort(rpc, identity);
  const event = { contractVersion: "backyrd.user-intelligence.product-decision-learning-input@1.0", eventId: "event-1", idempotencyKey: "key-1", eventType: "decision_requested", decisionId: "decision-1", sessionId: actor.sessionId, candidateId: null, spotId: null, contextBindingHash: hash("context"), occurredAt: "2026-09-18T15:00:00.000Z", feedback: null, targetEventId: null };
  assert.equal((await learning.record(event, new AbortController().signal, actor)).persisted, false);
  await assert.rejects(() => learning.record(event, new AbortController().signal), /actor_unbound/);
  const evaluation = createDecisionProductRpcEvaluationProvider({ async rpc() { calls += 100; return { data: null, error: null }; } });
  await assert.rejects(() => evaluation.evaluate({ request: { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: "request-1", idempotencyKey: "key-1", naturalLanguage: "etwas essen", explicit: {}, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] }, actor, identity, signal: new AbortController().signal }), /target_area_required/);
  assert.equal(calls, 1);
});

test("evaluation failures reveal only a fixed stage and never a World fact or consent payload", async () => {
  const marker = "private-marker-must-not-reach-diagnostics";
  const fact = (key, value) => ({ key, value, scope: "SPOT", resolution: "KNOWN_VALUE", freshness: "CURRENT", trust: "VERIFIED", basisClaimHashes: [hash(key)] });
  const binding = {
    contractVersion: "backyrd.world-knowledge.product-resolver-binding@1.0", manifestHash: hash("manifest"),
    registryHash: REGISTRY_HASH, resolvedAt: "2026-09-19T12:00:00.000Z",
    decisionProjection: { contractVersion: "backyrd.world-knowledge.shadow-decision-projection@1.0",
      registryVersion: REGISTRY_VERSION, policyVersion: ACCEPTED_SOURCE_POLICY.policyVersion,
      spotId: "33333333-3333-4333-a333-333333333333", facts: [fact("identity.name", "Test Spot"), fact("location.locality", "Basel")],
      conflicts: [], explicitUnknowns: [] },
  };
  const context = { contractVersion: "backyrd.decision-vnext.product-runtime-context@1.0", authorizedCity: "Basel",
    serverTime: "2026-09-19T12:00:00.000Z", worldSnapshots: [binding], status: "NO_CONSENT", consent: null, snapshot: null };
  const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: "request-1",
    idempotencyKey: "key-1", naturalLanguage: "Café in Basel", explicit: { targetCity: "Basel" },
    alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
  const evaluate = (data, incoming = request) => createDecisionProductRpcEvaluationProvider({ async rpc() { return { data, error: null }; } })
    .evaluate({ request: incoming, actor, identity, signal: new AbortController().signal });
  const malformedWorld = structuredClone(context);
  malformedWorld.worldSnapshots[0].decisionProjection.facts.push(fact("classification.primary_category", marker));
  await assert.rejects(evaluate(malformedWorld), (error) => error.message === "product_evaluation_world_binding_invalid");
  const malformedConsent = { ...context, status: "ACTIVE", consent: { marker }, snapshot: {} };
  await assert.rejects(evaluate(malformedConsent), (error) => error.message === "product_evaluation_user_projection_invalid");
  await assert.rejects(evaluate(context, { ...request, naturalLanguage: marker.repeat(200) }),
    (error) => error.message === "product_evaluation_ranking_invalid");
  const citySized = { ...context, worldSnapshots: Array.from({ length: 387 }, (_, index) => ({
    ...binding, decisionProjection: { ...binding.decisionProjection,
      spotId: `33333333-3333-4333-a333-${index.toString(16).padStart(12, "0")}` },
  })) };
  const evaluated = await evaluate(citySized);
  assert.equal(evaluated.evaluation.candidates.length, 387);
});
