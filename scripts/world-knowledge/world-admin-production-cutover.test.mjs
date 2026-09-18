import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WORLD_ADMIN_EXACT_MIGRATION_PATHS,
  buildWorldAdminProductionCutover,
} from "./build-world-admin-production-cutover.mjs";
import { makeFounderCohortHandoff } from "../decision/phase3c-founder-cohort-fixture.mjs";
import {
  ACCEPTED_SOURCE_POLICY,
  RESOLUTION_CONTRACT_VERSION,
  buildWorldKnowledgeSnapshot,
  createClaim,
  createVerificationExecutionAuthority,
  createVerificationProcessContract,
  createVerificationRecord,
  REGISTRY_HASH,
  REGISTRY_VERSION,
  WORLD_KNOWLEDGE_PORT_VERSION,
  createFounderWorldKnowledgeReader,
  parseBuildWorldKnowledgeInput,
  parseFounderWorldCohortHandoff,
  resolveWorldKnowledge,
} from "../../packages/world-knowledge-core/dist/index.js";

const canonicalSnapshot = (spotId, index) => {
  const known = index < 2;
  const claim = createClaim({ claimId: `claim:cutover:${index}:accessibility`, attributeKey: "accessibility.step_free_entrance", scope: { spotId, area: "SPOT" }, knowledgeState: known ? "KNOWN_TRUE" : "UNKNOWN", value: known ? true : null, actorType: "ADMIN", sourceType: "ADMIN_OBSERVATION", sourceReferenceId: `source:cutover:${index}`, provenanceSessionId: "session:cutover:fixture", verificationState: "VERIFIED", observedAt: "2026-09-18T08:00:00.000Z", validFrom: null, validUntil: null, stance: "SUPPORTS", visibility: "INTERNAL", supersedesClaimId: null });
  const process = createVerificationProcessContract({ processId: "process:admin-confirmed", processVersion: "1.0", policyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, policyHash: ACCEPTED_SOURCE_POLICY.policyHash, attributeKeys: [claim.attributeKey], allowedVerifierRoles: ["SERVER_CONFIRMED_ADMIN"], requiredAuthorityClass: "SERVER_BOUND_ADMIN_WRITE", requiredSourceTypes: ["ADMIN_OBSERVATION"], freshnessPolicyRef: "freshness:durable-until-contradicted", allowedResults: ["VERIFIED"], maxFutureClockSkewSeconds: 60 }, ACCEPTED_SOURCE_POLICY);
  const authority = createVerificationExecutionAuthority({ authorityId: `authority:cutover:${index}`, processId: process.processId, processVersion: process.processVersion, processHash: process.processHash, verifierRole: "SERVER_CONFIRMED_ADMIN", authorityClass: "SERVER_BOUND_ADMIN_WRITE", validFrom: "2026-09-18T07:00:00.000Z", validUntil: "2026-09-18T10:00:00.000Z" }, process, ACCEPTED_SOURCE_POLICY);
  const verificationContext = { processes: [process], authorities: [authority], serverTime: "2026-09-18T08:02:00.000Z" };
  const verification = createVerificationRecord({ recordId: `verification:cutover:${index}`, policyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, policyHash: ACCEPTED_SOURCE_POLICY.policyHash, claimId: claim.claimId, claimHash: claim.contentHash, attributeKey: claim.attributeKey, spotId, processId: process.processId, processVersion: process.processVersion, processHash: process.processHash, executionAuthorityId: authority.authorityId, executionAuthorityHash: authority.authorityHash, verifierRole: authority.verifierRole, sourceReferenceIds: [claim.sourceReferenceId], result: "VERIFIED", checkedAt: "2026-09-18T08:01:00.000Z", reverificationPolicyRef: "freshness:durable-until-contradicted", reasonCodes: ["SYNTHETIC_CUTOVER_REHEARSAL"] }, claim, ACCEPTED_SOURCE_POLICY, verificationContext);
  const resolution = resolveWorldKnowledge({ contractVersion: RESOLUTION_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, asOf: "2026-09-18T09:00:00.000Z", claims: [claim], sourcePolicy: ACCEPTED_SOURCE_POLICY, verificationRecords: [verification] }, [ACCEPTED_SOURCE_POLICY], verificationContext);
  return buildWorldKnowledgeSnapshot(parseBuildWorldKnowledgeInput({ contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, spotId, resolution }, [ACCEPTED_SOURCE_POLICY], verificationContext), [ACCEPTED_SOURCE_POLICY], verificationContext);
};

test("World/Admin cutover binds the exact sealed ten-migration source-aware plan", () => {
  const artifact = buildWorldAdminProductionCutover();
  assert.equal(artifact.migrations.length, 10);
  assert.deepEqual(artifact.migrations.map(({ path }) => path), WORLD_ADMIN_EXACT_MIGRATION_PATHS);
  assert.deepEqual(artifact.migrations.map(({ order }) => order), [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(artifact.migrationScope.sealedWorldCount, 9);
  assert.equal(artifact.migrationScope.durableIdempotencyCount, 1);
  assert.equal(artifact.migrationScope.newMigrationsInTrack, 0);
  for (const migration of artifact.migrations) {
    assert.equal(migration.bytesVerified, true);
    assert.equal(migration.destructiveDdl, false);
    assert.equal(migration.internalSupabaseSchemaMutation, false);
    assert.equal(migration.securityDefinerCount, migration.securityDefinerWithEmptySearchPath);
    assert.equal(migration.postgresCompatibility, "POSTGRESQL_17");
    assert.equal(migration.secondApply, "MIGRATION_LEDGER_NO_OP");
  }
});

test("the complete source-aware scope is visible while World/Admin execution remains closed", () => {
  const artifact = buildWorldAdminProductionCutover();
  assert.deepEqual(artifact.sourceAwareRuntimeScope.observedDeployFunctions, ["decision-founder-live"]);
  assert.deepEqual(artifact.sourceAwareRuntimeScope.worldAdminDeployFunctions, []);
  assert.deepEqual(artifact.sourceAwareRuntimeScope.integrationOwnedDeferredFunctions, ["decision-founder-live"]);
  assert.equal(artifact.sourceAwareRuntimeScope.executionAuthorized, false);
  assert.equal(artifact.releaseControls.realAllowlistMembers, 0);
  assert.equal(artifact.releaseControls.authority, "NOT_CONFIGURED");
  assert.equal(artifact.releaseControls.expiration, "NOT_CONFIGURED");
  assert.equal(artifact.releaseControls.retention, "NOT_CONFIGURED");
  assert.equal(artifact.releaseControls.defaultState, "OFF");
  assert.equal(artifact.releaseControls.killSwitch, "ENGAGED");
  assert.deepEqual(artifact.releaseControls.allowedEnvironments, ["LOCAL_TEST", "PROD_LIKE_TEST"]);
  assert.deepEqual([
    artifact.releaseControls.productionConnections,
    artifact.releaseControls.productionQueries,
    artifact.releaseControls.productionWrites,
    artifact.releaseControls.productOutputs,
  ], [0,0,0,0]);
});

test("five Founder-approved Basel fixtures pass only through the canonical reader and preserve uncertainty", async () => {
  const handoff = parseFounderWorldCohortHandoff(makeFounderCohortHandoff());
  assert.equal(handoff.spots.length, 5);
  const byId = new Map(handoff.spots.map((spot, spotIndex) => [spot.spotId, canonicalSnapshot(spot.spotId, spotIndex)]));
  const reader = createFounderWorldKnowledgeReader(async ({ spotId }) => byId.get(spotId));
  const snapshots = [];
  for (const binding of handoff.manifest.spots) {
    snapshots.push(await reader.readSnapshot({
      spotId: binding.spotId,
      contractVersion: WORLD_KNOWLEDGE_PORT_VERSION,
      registryVersion: REGISTRY_VERSION,
      registryHash: REGISTRY_HASH,
    }));
  }
  assert.equal(snapshots.length, 5);
  assert.ok(snapshots.some((snapshot) => snapshot.explicitUnknowns.some((item) => item.key === "accessibility.step_free_entrance")));
  assert.ok(handoff.spots.some((spot) => spot.snapshot.facts.some((item) => item.key === "rule.age_access_conditions")));
  const serialized = JSON.stringify(snapshots);
  for (const forbidden of ["ownerTier", "subscription", "payment", "privateSource", "actorId", "adminNotes", "userTaste"]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("the existing Admin and Owner boundaries use the canonical reader and keep normal mode non-technical", () => {
  const adminRoute = readFileSync(new URL("../../admin-dashboard/app/api/world-knowledge/shadow/route.ts", import.meta.url), "utf8");
  const ownerRoute = readFileSync(new URL("../../web/app/api/world-knowledge/shadow/route.ts", import.meta.url), "utf8");
  const authoring = readFileSync(new URL("../../packages/world-knowledge-authoring-ui/src/index.tsx", import.meta.url), "utf8");
  for (const route of [adminRoute, ownerRoute]) {
    assert.match(route, /createFounderWorldKnowledgeReader/);
    assert.match(route, /world_authoring_get_spot_v1/);
  }
  assert.match(adminRoute, /world_shadow_rebuild_spot_v1/);
  assert.doesNotMatch(authoring, />\s*(?:Claim|Resolution Hash|Source Policy|Known Value)\s*</);
});

test("the executable rehearsal expands to ten migrations only when explicitly requested", () => {
  const rehearsal = readFileSync(new URL("./rehearse-week1-world-release.sh", import.meta.url), "utf8");
  assert.match(rehearsal, /WORLD_INCLUDE_IDEMPOTENCY/);
  assert.match(rehearsal, /20260918123000_founder_live_durable_idempotency_v1\.sql/);
  assert.match(rehearsal, /founder_live_durable_idempotency_v1\.sql/);
  assert.match(rehearsal, /expected_migration_count=10/);
  assert.match(rehearsal, /WORLD_WEEK2_BACKUP_RESTORE/);
});

test("cutover artifact is deterministic", () => {
  assert.deepEqual(buildWorldAdminProductionCutover(), buildWorldAdminProductionCutover());
});
