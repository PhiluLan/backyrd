import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDecisionProductRpcEvaluationProvider, DECISION_PRODUCT_PRODUCTION_RPCS, DecisionProductRequestSchema, PRODUCT_DECISION_VERSIONS } from "../dist/index.js";

const databaseUrl = process.env.BACKYRD_ISOLATED_TEST_DATABASE_URL;
test("real append-only Admin correction and canonical SQL context reach Product evaluation", { skip: !databaseUrl }, async () => {
  const source = readFileSync(fileURLToPath(new URL("../../../supabase/tests/decision_product_authoring_lease_v1.sql", import.meta.url)), "utf8");
  const marker = "select pg_temp.assert(\n  (public.backyrd_decision_vnext_product_emergency_off_v1(";
  assert.ok(source.includes(marker));
  const discoveryMarker = "select pg_temp.expect_state(format(\n  'select public.world_product_admin_submit_claim_v1(";
  assert.ok(source.includes(discoveryMarker));
  const discovery = "select 'PRODUCT_SEARCH_JSON=' || public.world_product_admin_search_spots_v1('Synthetic Reader',20)::text;\n";
  const capture = `select 'PRODUCT_CONTEXT_JSON=' || public.backyrd_decision_vnext_product_context_v2(\n    pg_temp.id('product-world-admin'),repeat('f',64),'Zurich','ACTIVITY_EXPERIENCE',repeat('a',64),repeat('b',64),repeat('c',64),1\n  )::text;\n`;
  const sql = source.replace(discoveryMarker, `${discovery}${discoveryMarker}`).replace(marker, `${capture}${marker}`);
  const result = spawnSync("psql", [databaseUrl, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout.split("\n").find((line) => line.startsWith("PRODUCT_CONTEXT_JSON="));
  const searchOutput = result.stdout.split("\n").find((line) => line.startsWith("PRODUCT_SEARCH_JSON="));
  assert.ok(searchOutput, "authorized Product Admin discovery was not emitted from real SQL");
  const search = JSON.parse(searchOutput.slice("PRODUCT_SEARCH_JSON=".length));
  assert.equal(search.contractVersion, "backyrd.world-knowledge.product-admin-spot-search@1.0");
  assert.equal(search.spots.length, 1);
  assert.equal(search.spots[0].name, "Synthetic Reader Spot");
  assert.ok(output, "real SQL Product context was not emitted");
  const context = JSON.parse(output.slice("PRODUCT_CONTEXT_JSON=".length));
  assert.equal(context.worldSnapshots[0].decisionProjection.spotId, search.spots[0].spotId);
  assert.equal(context.status, "NO_CONSENT");
  const request = DecisionProductRequestSchema.parse({ contractVersion: PRODUCT_DECISION_VERSIONS.request,
    requestId: "product-sql-world-rehearsal", idempotencyKey: "product-sql-world-rehearsal",
    naturalLanguage: "Ein Erlebnis in Zürich", explicit: {}, alternativeRequested: false,
    previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] });
  const provider = createDecisionProductRpcEvaluationProvider({ async rpc(name) {
    assert.equal(name, DECISION_PRODUCT_PRODUCTION_RPCS.runtimeContext);
    return { data: context, error: null };
  } });
  const evaluation = await provider.evaluate({ request, actor: {
    userId: "941d462c-81d4-441e-84ad-d648cb287c1d", subjectBindingHash: "f".repeat(64),
    sessionId: "11111111-1111-4111-8111-111111111111", sessionBindingHash: "e".repeat(64), authenticationContextHash: "d".repeat(64),
  }, identity: { releaseHash: "a".repeat(64), artifactHash: "b".repeat(64), sourceSetHash: "c".repeat(64), controlGeneration: 1 }, signal: new AbortController().signal });
  assert.equal(evaluation.presentations.length, 1);
  assert.equal(evaluation.presentations[0].name, "After");
  assert.equal(evaluation.projection.status, "NEUTRAL");
  assert.equal(evaluation.evaluation.worldCohort.source, "CANONICAL_WORLD_KNOWLEDGE_READER");
  assert.equal(evaluation.evaluation.candidates.length, 1);
  for (const mutate of [
    (value) => { value.worldSnapshots[0].manifestHash = "bad"; },
    (value) => { value.worldSnapshots[0].registryHash = "0".repeat(64); },
    (value) => { value.worldSnapshots[0].decisionProjection.facts.find((fact) => fact.key === "location.locality").trust = "ASSERTED"; },
    (value) => { value.worldSnapshots[0].decisionProjection.facts.find((fact) => fact.key === "location.locality").value = "Basel"; },
  ]) {
    const changed = structuredClone(context); mutate(changed);
    const denied = createDecisionProductRpcEvaluationProvider({ async rpc() { return { data: changed, error: null }; } });
    await assert.rejects(denied.evaluate({ request, actor: {
      userId: "941d462c-81d4-441e-84ad-d648cb287c1d", subjectBindingHash: "f".repeat(64),
      sessionId: "11111111-1111-4111-8111-111111111111", sessionBindingHash: "e".repeat(64), authenticationContextHash: "d".repeat(64),
    }, identity: { releaseHash: "a".repeat(64), artifactHash: "b".repeat(64), sourceSetHash: "c".repeat(64), controlGeneration: 1 }, signal: new AbortController().signal }));
  }
});
