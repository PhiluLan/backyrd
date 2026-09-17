import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { buildWorldWeek2Basis } from "./build-week2-world-basis.mjs";

test("Week 2 binds the exact nine-migration PostgreSQL 17 bundle and stays unauthorized", () => {
  const result = buildWorldWeek2Basis();
  assert.equal(result.migrationCount, 9);
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.runtimeActivationAuthorized, false);
  assert.equal(result.databaseCompatibility.postgresMajor, 17);
  assert.deepEqual(result.migrations.map((item) => item.order), [1,2,3,4,5,6,7,8,9]);
  for (const migration of result.migrations) {
    assert.equal(migration.audit.sha256Verified, true);
    assert.equal(migration.audit.forwardOnly, true);
    assert.equal(migration.audit.internalSupabaseSchemaMutation, false);
    assert.equal(migration.audit.extensionVersionPin, false);
    assert.equal(migration.audit.logsAllDependency, false);
    assert.equal(migration.audit.clientSecretReference, false);
    assert.equal(migration.audit.securityDefinerCount, migration.audit.securityDefinerWithEmptySearchPath);
  }
});

test("Week 2 dark reader release identity is default OFF and kill-switched", () => {
  const result = buildWorldWeek2Basis();
  assert.equal(result.reader.worldProductReadDefault, false);
  assert.equal(result.reader.killSwitchDefault, "ENGAGED");
  assert.deepEqual(result.reader.offEffects, { queries: 0, writes: 0, connections: 0 });
  assert.deepEqual(result.reader.allowedEnabledEnvironments, ["LOCAL_TEST", "PROD_LIKE_TEST"]);
});

test("minimized 30-candidate basis preserves uncertainty rather than inventing state", () => {
  const directory = mkdtempSync(join(tmpdir(), "world-week2-cohort-"));
  const input = join(directory, "input.json"); const first = join(directory, "first.json"); const second = join(directory, "second.json");
  const candidates = Array.from({ length: 30 }, (_, index) => ({ spotId: `spot-${index}`, name: `Private ${index}`, primaryCategory: "EAT", claimedKeys: index < 3 ? ["classification.primary_category"] : [], mappedKeys: index < 10 ? ["hours.regular"] : [], reviewKeys: index < 20 ? ["operation.price_level"] : [], alreadyFounderSelected: index < 5, claimedFields: 0, mappedFields: 0, ambiguousValues: 0 }));
  writeFileSync(input, JSON.stringify({ schemaVersion: "backyrd.world-knowledge.week1-cohort-candidates@1", environment: "LOCAL_FOUNDER_EVALUATION", claimAuthority: "NONE", automaticConfirmation: false, candidateHash: "a".repeat(64), candidates }));
  const script = resolve(import.meta.dirname, "build-week2-basis-cohort.mjs");
  execFileSync(process.execPath, [script, "--input", input, "--output", first]); execFileSync(process.execPath, [script, "--input", input, "--output", second]);
  assert.equal(readFileSync(first, "utf8"), readFileSync(second, "utf8"));
  const artifact = JSON.parse(readFileSync(first, "utf8"));
  assert.equal(artifact.candidateCount, 30);
  assert.equal(artifact.identifiersIncluded, false);
  assert.equal(artifact.actorPseudonymsIncluded, false);
  assert.equal(artifact.coverage["classification.primary_category"].documentedClaim, 3);
  assert.equal(artifact.coverage["classification.primary_category"].semanticStateCounts.CONFIRMED, null);
  assert.match(JSON.stringify(artifact), /NOT_DERIVABLE/);
  assert.equal(JSON.stringify(artifact).includes("Private 0"), false);
});

test("Week 2 plan is deterministic", () => assert.deepEqual(buildWorldWeek2Basis(), buildWorldWeek2Basis()));
