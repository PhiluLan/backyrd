import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { activeAdminDataEvidenceProblems } from "../../scripts/ci/resolve-active-admin-data-validation.mjs";
import { productionLineageCandidateProblems } from "../../scripts/ci/resolve-production-lineage-target.mjs";

const root = new URL("../..", import.meta.url).pathname;
const record = JSON.parse(await readFile(join(root, "decision-lab/config/decision-v13-production-recertification-v47.json"), "utf8"));
const currentFreeze = JSON.parse(await readFile(join(root, "decision-lab/config/additive-recertification-v1.freeze.json"), "utf8"));
const freeze = {
  ...currentFreeze,
  currentVersion: record.version,
  currentRecertificationHash: record.recertificationHash,
};

function activeProblems(overrides = {}) {
  return activeAdminDataEvidenceProblems({
    freeze,
    record,
    verification: record.verificationReceipt,
    baseDescendsToCandidate: true,
    candidateIntegrated: true,
    candidateTree: record.candidateProductTree,
    ...overrides,
  });
}

test("V1.4.5 active Admin/data evidence binds exact artifact, receipt, base, candidate, tree, and ancestry", () => {
  assert.deepEqual(activeProblems(), []);
  const currentMode = JSON.parse(execFileSync("node", ["scripts/ci/resolve-active-admin-data-validation.mjs", "--head-sha", "HEAD"], { cwd: root, encoding: "utf8" })).mode;
  assert.equal(currentMode, currentFreeze.currentVersion === record.version ? "admin-data-additive-active" : "inactive");
});

test("V1.4.5 active Admin/data evidence fails closed for every identity or ancestry mismatch", () => {
  const cases = [
    { record: { ...record, candidateArtifactHash: "0".repeat(64) }, expected: "artifact hash binding differs" },
    { record: { ...record, verificationHash: "0".repeat(64) }, expected: "receipt hash binding differs" },
    { record: { ...record, baseMainSha: "0".repeat(40) }, expected: "base/candidate binding differs" },
    { record: { ...record, candidateProductTree: "0".repeat(40) }, expected: "candidate tree binding differs" },
    { baseDescendsToCandidate: false, expected: "candidate does not descend" },
    { candidateIntegrated: false, expected: "candidate is not integrated" },
    { verification: { ...record.verificationReceipt, valid: false }, expected: "fresh receipt verification differs" },
  ];
  for (const { expected, ...override } of cases) assert.ok(activeProblems(override).some((problem) => problem.includes(expected)), expected);
});

const markerPath = "docs/operations/production-lineage-candidates/RESTAURANT_INFORMATION_V1.json";
const marker = {
  schemaVersion: "backyrd-production-lineage-candidate-v1",
  id: "restaurant-information-v1",
  deployedSourceCommit: "a".repeat(40),
  deploymentAudit: { runId: 1, result: "PASS", planHash: "b".repeat(64), auditHash: "c".repeat(64) },
  admin: { tree: "d".repeat(40), githubDeploymentId: 2 },
  database: { migrationTip: "20260907170853_restaurant_information_v1", migrationCount: 137, migrationSha256: "e".repeat(64) },
};
const manifest = {
  surfaces: {
    admin_intelligence_web: {
      commit: marker.deployedSourceCommit,
      tree: marker.admin.tree,
      github_deployment_id: marker.admin.githubDeploymentId,
      canonical_source: { commit: marker.deployedSourceCommit, tree: marker.admin.tree, production_verified: true },
    },
    database: {
      source_commit: marker.deployedSourceCommit,
      migration_tip: marker.database.migrationTip,
      migration_count: marker.database.migrationCount,
      canonical_source: { source_commit: marker.deployedSourceCommit, migration_tip: marker.database.migrationTip, migration_count: marker.database.migrationCount, production_verified: true },
    },
  },
  required_ancestry: [marker.deployedSourceCommit],
};

function lineageProblems(overrides = {}) {
  return productionLineageCandidateProblems({
    marker,
    manifest,
    markerPath,
    markerChanges: [{ status: "A", path: markerPath }],
    manifestChanged: true,
    deployedAdminTree: marker.admin.tree,
    deployedMigrationCount: marker.database.migrationCount,
    deployedMigrationSha256: marker.database.migrationSha256,
    deployedSourceIntegrated: true,
    ...overrides,
  });
}

test("V1.4.5 Production lineage candidate accepts only an exact deployment-bound marker", () => {
  assert.deepEqual(lineageProblems(), []);
});

test("V1.4.5 Production lineage candidate fails closed without correlated manifest, tree, bytes, or ancestry", () => {
  assert.ok(lineageProblems({ manifestChanged: false }).includes("Production lineage manifest is unchanged"));
  assert.ok(lineageProblems({ markerChanges: [] }).includes("exactly one new versioned candidate marker is required"));
  assert.ok(lineageProblems({ deployedAdminTree: "0".repeat(40) }).includes("Admin tree does not match deployed source"));
  assert.ok(lineageProblems({ deployedMigrationCount: 136 }).includes("migration count does not match deployed source"));
  assert.ok(lineageProblems({ deployedMigrationSha256: "0".repeat(64) }).includes("migration bytes do not match deployed source"));
  assert.ok(lineageProblems({ deployedSourceIntegrated: false }).includes("deployed source is not an ancestor of the exact PR head"));
  const changedManifest = structuredClone(manifest);
  changedManifest.surfaces.database.migration_count = 136;
  assert.ok(lineageProblems({ manifest: changedManifest }).includes("database shipped lineage differs from marker"));
});

test("V1.4.5 canonical database reconstructs active additive Base before Candidate", async () => {
  const script = await readFile(join(root, "scripts/ci/validate-supabase-local.sh"), "utf8");
  const resolver = script.indexOf("resolve-active-admin-data-validation.mjs");
  const baseCheckout = script.indexOf("base_checkout=");
  const candidateMigration = script.indexOf("exact manifest-bound candidate migrations applied");
  assert.ok(resolver > 0 && baseCheckout > resolver && candidateMigration > baseCheckout);
  assert.match(script, /Active Admin\/data evidence cannot overlap another Admin\/data candidate/);
});

test("V1.4.5 workflow supplies exact PR head while ordinary PRs remain base-bound", async () => {
  const workflow = await readFile(join(root, ".github/workflows/database.yml"), "utf8");
  const wrapper = await readFile(join(root, "scripts/ci/validate-production-lineage-at-ref.sh"), "utf8");
  assert.match(workflow, /PRODUCTION_LINEAGE_TARGET_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /PRODUCTION_LINEAGE_PR_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(wrapper, /resolve-production-lineage-target\.mjs/);
  assert.match(wrapper, /reviewed checkout is not the exact PR head or its exact base\/head synthetic merge/);
  assert.match(wrapper, /worktree add --quiet --detach "\$checkout" "\$target_commit"/);
  assert.match(wrapper, /validation_mode="base"/);
});

test("V1.4.5 D3-A zero-data boot excludes only the certified historical operations", async () => {
  const runner = await readFile(join(root, "scripts/decision/run-d3-a-full-diagnostic.sh"), "utf8");
  assert.match(runner, /validate-database-lineage\.mjs/);
  assert.match(runner, /validate-migrations\.sh/);
  assert.match(runner, /historical-data-operations\.json/);
  assert.match(runner, /Excluded %s hash-certified historical Production data operations from D3-A bootstrap/);
});
