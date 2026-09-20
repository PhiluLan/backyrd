import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { ACCEPTED_SOURCE_POLICY, REGISTRY_HASH, REGISTRY_VERSION } from "@backyrd/world-knowledge-core";
import {
  createDecisionProductRpcEvaluationProvider,
  createDecisionProductRpcLearningPort,
  contentHash,
} from "../dist/index.js";

const root = new URL("../../../", import.meta.url);
const edge = readFileSync(new URL("supabase/functions/decision-v13/vnext-only.ts", root), "utf8");
const migration = readFileSync(new URL("supabase/migrations/20260918182831_decision_vnext_product_runtime_v1.sql", root), "utf8");
const boundedContextMigration = readFileSync(new URL("supabase/migrations/20260919172027_decision_vnext_bounded_catalog_context_v2.sql", root), "utf8");
const bridgeMigration = readFileSync(new URL("supabase/migrations/20260920190048_bridge_product_world_knowledge_v1.sql", root), "utf8");
const hash = (value) => contentHash(value);
const identity = { releaseHash: hash("release"), artifactHash: hash("artifact"), sourceSetHash: hash("source"), controlGeneration: 1 };

test("Product projection canonicalization works without a global Node Buffer in the Edge runtime", () => {
  const userCanonical = new URL("../../user-intelligence-vnext-core/dist/canonical.js", import.meta.url).href;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e",
    `globalThis.Buffer = undefined; const { canonicalBytes } = await import(${JSON.stringify(userCanonical)}); process.stdout.write(String(canonicalBytes({ status: 'ACTIVE' })));`],
  { encoding: "utf8" });
  assert.equal(Number(output), Buffer.byteLength('{"status":"ACTIVE"}', "utf8"));
  const productSource = readFileSync(new URL("../src/product-decision.ts", import.meta.url), "utf8");
  assert.match(productSource, /import \{ Buffer \} from ["']node:buffer["']/);
});
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

test("Product catalog intake is bounded before World validation and cannot grant client access", () => {
  assert.match(boundedContextMigration, /create function public\.backyrd_decision_vnext_product_context_v2/);
  assert.match(boundedContextMigration, /with catalog as materialized[\s\S]+?limit 48[\s\S]+?verified as materialized/);
  assert.match(boundedContextMigration, /world_knowledge_private\.validate_resolution_manifest_v1/);
  assert.match(boundedContextMigration, /revoke all on function public\.backyrd_decision_vnext_product_context_v2[\s\S]+?from public,anon,authenticated/);
  assert.match(boundedContextMigration, /grant execute on function public\.backyrd_decision_vnext_product_context_v2[\s\S]+?to service_role/);
  assert.doesNotMatch(boundedContextMigration, /delete from|truncate|drop table/i);
});

test("Product bridge keeps manifests immutable, exposes only authorized context and prioritizes verified core types", () => {
  assert.match(bridgeMigration, /product_decision_projection_v1\(p_snapshot jsonb\)/);
  assert.match(bridgeMigration, /world_knowledge_private\.decision_projection_v1\(p_snapshot\)/);
  for (const key of ["purpose.primary_visit", "offering.onsite", "context.visit_situations", "context.atmosphere", "context.typical_dayparts"]) assert.match(bridgeMigration, new RegExp(key.replaceAll(".", "\\.")));
  assert.match(bridgeMigration, /c\.content_hash=a\.item->'basisClaimHashes'->>0/);
  assert.match(bridgeMigration, /c\.valid_until/);
  assert.match(bridgeMigration, /'DRINKS' then array\['PUB','WINE_BAR','BAR'/);
  assert.match(bridgeMigration, /validate_resolution_manifest_v1/);
  assert.match(bridgeMigration, /limit 48/);
  assert.match(bridgeMigration, /create function public\.backyrd_decision_vnext_product_context_v3/);
  assert.match(bridgeMigration, /revoke all on function public\.backyrd_decision_vnext_product_context_v3[\s\S]+?from public,anon,authenticated/);
  assert.doesNotMatch(bridgeMigration, /create or replace function public\.backyrd_decision_vnext_product_context_v2/);
  assert.doesNotMatch(bridgeMigration, /create or replace function world_knowledge_private\.decision_projection_v1/);
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
    decisionProjection: { contractVersion: "backyrd.world-knowledge.product-decision-projection@1.0",
      registryVersion: REGISTRY_VERSION, policyVersion: ACCEPTED_SOURCE_POLICY.policyVersion,
      spotId: "33333333-3333-4333-a333-333333333333", facts: [fact("identity.name", "Test Spot"), fact("location.locality", "Basel")],
      conflicts: [], explicitUnknowns: [] },
  };
  const context = { contractVersion: "backyrd.decision-vnext.product-runtime-context@1.0", authorizedCity: "Basel",
    serverTime: "2026-09-19T12:00:00.000Z", worldSnapshots: [binding], status: "NO_CONSENT", consent: null, snapshot: null };
  const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: "request-1",
    idempotencyKey: "key-1", naturalLanguage: "Café in Basel", explicit: { targetCity: "Basel" },
    alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
  const evaluate = (data, incoming = request) => createDecisionProductRpcEvaluationProvider({ async rpc(name, parameters) {
    assert.equal(name, "backyrd_decision_vnext_product_context_v3");
    assert.equal(parameters.p_primary_intent, incoming === request ? "COFFEE" : null);
    assert.equal(Object.hasOwn(parameters, "naturalLanguage"), false);
    return { data, error: null };
  } })
    .evaluate({ request: incoming, actor, identity, signal: new AbortController().signal });
  const malformedWorld = structuredClone(context);
  malformedWorld.worldSnapshots[0].decisionProjection.facts.push(fact("classification.primary_category", marker));
  await assert.rejects(evaluate(malformedWorld), (error) => error.message === "product_evaluation_world_binding_invalid");
  const malformedConsent = { ...context, status: "ACTIVE", consent: { marker }, snapshot: {} };
  await assert.rejects(evaluate(malformedConsent), (error) => error.message === "product_evaluation_user_projection_invalid");
  const postgresConsent = {
    contractVersion: "backyrd.user-intelligence.consent-envelope@1.0",
    purpose: "PERSONALIZED_RECOMMENDATIONS", state: "GRANTED",
    consentVersion: "personalized-recommendations-v1", policyVersion: "personalized-recommendations-v1",
    uxVersion: "canonical-consent-ledger-v1", effectiveAt: "2026-08-21T08:12:44.001326+00:00",
    captureContext: "MIGRATION_VERIFIED",
    allowedProcessing: ["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"],
    lifecycleEffect: "ALLOW",
  };
  const missingSnapshot = { ...context, status: "MISSING_SNAPSHOT", consent: postgresConsent, snapshot: null };
  assert.equal((await evaluate(missingSnapshot)).projection.neutralReason, "MISSING_SNAPSHOT");
  const activeSnapshot = { ...context, status: "ACTIVE", consent: postgresConsent,
    snapshot: { snapshotId: "synthetic-snapshot-v1", snapshotHash: hash("synthetic-snapshot"),
      runtimeVersion: "synthetic-user-runtime-v1", nodes: [{ nodeKey: "synthetic-node", concept: "place_type.cafe",
        affinity: 0.5, confidence: 0.8, scope: { kind: "GLOBAL" } }] } };
  assert.equal((await evaluate(activeSnapshot)).projection.status, "ACTIVE");
  await assert.rejects(evaluate({ ...missingSnapshot, consent: { ...postgresConsent, effectiveAt: "not-a-timestamp" } }),
    (error) => error.message === "product_evaluation_user_projection_invalid");
  await assert.rejects(evaluate(context, { ...request, naturalLanguage: marker.repeat(200) }),
    (error) => error.message === "product_evaluation_ranking_invalid");
  const citySized = { ...context, worldSnapshots: Array.from({ length: 387 }, (_, index) => ({
    ...binding, decisionProjection: { ...binding.decisionProjection,
      spotId: `33333333-3333-4333-a333-${index.toString(16).padStart(12, "0")}` },
  })) };
  const evaluated = await evaluate(citySized);
  assert.equal(evaluated.evaluation.candidates.length, 387);
  const transport = createDecisionProductRpcEvaluationProvider({ async rpc() { throw new Error(marker); } });
  await assert.rejects(transport.evaluate({ request, actor, identity, signal: new AbortController().signal }),
    (error) => error.message === "product_runtime_context_transport_failed");
});
