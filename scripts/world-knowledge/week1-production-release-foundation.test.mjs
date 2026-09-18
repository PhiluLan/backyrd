import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { buildWorldWeek1Foundation, validateWorldWeek1IndependentRuntimeScope } from "./build-week1-production-release-foundation.mjs";

const root = resolve(import.meta.dirname, "../..");
const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const sha40 = /^[0-9a-f]{40}$/;
const sha64 = /^[0-9a-f]{64}$/;

const validateIdentityMode = ({ mode, canonicalBaseSha, candidateHeadSha, canonicalMainSha, candidateTreeSha, approvedTreeSha, artifactHash, approvedArtifactHash }) => {
  for (const value of [canonicalBaseSha, candidateHeadSha, canonicalMainSha, candidateTreeSha, approvedTreeSha]) assert.match(value, sha40);
  for (const value of [artifactHash, approvedArtifactHash]) assert.match(value, sha64);
  assert.equal(canonicalBaseSha, canonicalMainSha, "canonical base must match the externally checked main identity");
  assert.equal(candidateTreeSha, approvedTreeSha, "candidate tree differs from the approved tree");
  assert.equal(artifactHash, approvedArtifactHash, "release artifact differs from the approved artifact");
  if (mode === "PR_CANDIDATE") assert.notEqual(candidateHeadSha, canonicalBaseSha, "a PR candidate must be ahead of its base");
  else if (mode === "POST_MERGE_MAIN") assert.equal(candidateHeadSha, canonicalMainSha, "post-merge identity must be the checked main commit");
  else assert.fail(`unknown release identity mode: ${mode}`);
};

test("source-aware Week 1 plan binds exactly nine immutable World migrations", () => {
  const plan = buildWorldWeek1Foundation();
  assert.equal(plan.migrationCount, 9);
  assert.match(plan.canonicalBaseSha, sha40);
  assert.match(plan.candidateHeadSha, sha40);
  const canonicalMainSha = git(["rev-parse", "origin/main"]);
  const checkedHeadSha = git(["rev-parse", "HEAD"]);
  assert.equal(plan.candidateHeadSha, checkedHeadSha);
  assert.equal(plan.canonicalBaseSha, canonicalMainSha);
  if (checkedHeadSha === canonicalMainSha) assert.equal(plan.candidateHeadSha, plan.canonicalBaseSha);
  else assert.notEqual(plan.candidateHeadSha, plan.canonicalBaseSha);
  assert.equal(plan.migrations.length, 9);
  assert.deepEqual(plan.independentMigrationScopes.map(({ path, evidenceId, executionAuthorized }) => ({ path, evidenceId, executionAuthorized })), [{ path: "supabase/migrations/20260918123000_founder_live_durable_idempotency_v1.sql", evidenceId: "20260918123000-founder-live-durable-idempotency-v1", executionAuthorized: false }]);
  assert.deepEqual(plan.independentRuntimeScopes, [{ functionName: "decision-founder-live", relationship: "SEPARATELY_VALIDATED_INACTIVE_DECISION_SOURCE", defaultState: "OFF", killSwitch: "ENGAGED", runtimeAuthority: "NOT_AUTHORIZED", executionAuthorized: false }]);
  assert.equal(plan.executionAuthorized, false);
  assert.equal(plan.runtimeActivationAuthorized, false);
  assert.deepEqual(plan.migrations.map(({ order }) => order), [1,2,3,4,5,6,7,8,9]);
  for (const migration of plan.migrations) {
    assert.match(migration.sha256, /^[0-9a-f]{64}$/);
    assert.equal(migration.metrics.destructiveDdl, 0);
    assert.ok(migration.rollback.length > 20);
    assert.ok(migration.stopConditions.includes("HASH_MISMATCH"));
  }
});

test("World Week 1 admits only the separately validated inactive Decision function source", () => {
  const closed = { deployFunctions: [], authConfig: { deploy: false }, runtimeActivation: false, executionAuthorized: false };
  assert.deepEqual(validateWorldWeek1IndependentRuntimeScope(closed), []);
  assert.deepEqual(validateWorldWeek1IndependentRuntimeScope({ ...closed, deployFunctions: ["decision-founder-live"] }), [{
    functionName: "decision-founder-live",
    relationship: "SEPARATELY_VALIDATED_INACTIVE_DECISION_SOURCE",
    defaultState: "OFF",
    killSwitch: "ENGAGED",
    runtimeAuthority: "NOT_AUTHORIZED",
    executionAuthorized: false,
  }]);
  for (const plan of [
    { ...closed, deployFunctions: ["decision-v13"] },
    { ...closed, deployFunctions: ["decision-founder-live", "decision-copy"] },
    { ...closed, deployFunctions: ["decision-founder-live"], authConfig: { deploy: true } },
    { ...closed, deployFunctions: ["decision-founder-live"], runtimeActivation: true },
    { ...closed, deployFunctions: ["decision-founder-live"], executionAuthorized: true },
  ]) assert.throws(() => validateWorldWeek1IndependentRuntimeScope(plan), /unexpected_non_migration_runtime_scope/);
});

test("release identity accepts the distinct PR candidate and equal post-merge main modes", () => {
  const base = "1".repeat(40), candidate = "2".repeat(40), tree = "3".repeat(40), artifact = "4".repeat(64);
  assert.doesNotThrow(() => validateIdentityMode({ mode:"PR_CANDIDATE", canonicalBaseSha:base, candidateHeadSha:candidate, canonicalMainSha:base, candidateTreeSha:tree, approvedTreeSha:tree, artifactHash:artifact, approvedArtifactHash:artifact }));
  assert.doesNotThrow(() => validateIdentityMode({ mode:"POST_MERGE_MAIN", canonicalBaseSha:base, candidateHeadSha:base, canonicalMainSha:base, candidateTreeSha:tree, approvedTreeSha:tree, artifactHash:artifact, approvedArtifactHash:artifact }));
});

test("release identity still fails closed on base, head, tree and artifact tampering", () => {
  const base = "1".repeat(40), candidate = "2".repeat(40), tree = "3".repeat(40), artifact = "4".repeat(64);
  const valid = { mode:"PR_CANDIDATE", canonicalBaseSha:base, candidateHeadSha:candidate, canonicalMainSha:base, candidateTreeSha:tree, approvedTreeSha:tree, artifactHash:artifact, approvedArtifactHash:artifact };
  assert.throws(() => validateIdentityMode({ ...valid, canonicalMainSha:"5".repeat(40) }));
  assert.throws(() => validateIdentityMode({ ...valid, candidateHeadSha:base }));
  assert.throws(() => validateIdentityMode({ ...valid, candidateTreeSha:"6".repeat(40) }));
  assert.throws(() => validateIdentityMode({ ...valid, artifactHash:"7".repeat(64) }));
  assert.throws(() => validateIdentityMode({ ...valid, mode:"UNKNOWN" }));
});

test("all SECURITY DEFINER functions in the pending bundle have an empty search_path", () => {
  const plan = buildWorldWeek1Foundation();
  for (const migration of plan.migrations) {
    const sql = readFileSync(resolve(root, migration.path), "utf8");
    const definitions = [...sql.matchAll(/create\s+or\s+replace\s+function[\s\S]*?(?=create\s+or\s+replace\s+function|$)/gi)];
    for (const match of definitions) {
      if (/security\s+definer/i.test(match[0])) assert.match(match[0], /set\s+search_path\s*=\s*''/i, migration.path);
    }
  }
});

test("cohort preparation preserves absence, unknown, not configured and disputed", () => {
  const states = buildWorldWeek1Foundation().cohort.knowledgeStatesPreserved;
  assert.ok(states.includes("ABSENT"));
  assert.ok(states.includes("UNKNOWN"));
  assert.ok(states.includes("NOT_CONFIGURED"));
  assert.ok(states.includes("DISPUTED"));
  assert.ok(states.includes("KNOWN_FALSE"));
});

test("plan is deterministic", () => {
  const first = buildWorldWeek1Foundation();
  const second = buildWorldWeek1Foundation();
  assert.deepEqual(second, first);
  assert.equal(second.foundationHash, first.foundationHash);
});

test("the executable rehearsal rejects Production and keeps apply unauthorized", () => {
  const rehearsal = readFileSync(new URL("./rehearse-week1-world-release.sh", import.meta.url), "utf8");
  assert.match(rehearsal, /production[_ -]?ref|production/i);
  assert.match(rehearsal, /executionAuthorized/);
  assert.equal(buildWorldWeek1Foundation().executionAuthorized, false);
});
