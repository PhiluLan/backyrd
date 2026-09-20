import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { applyVerifiedGateResume, classifyChange, isAuthorizedBoundedMigration, isDestructiveMigration } from "./classify-change.mjs";

const policy = {
  decisionTrustAnchor: "decision-lab/config/anchor.json",
  surfacePrefixes: { mobile: ["mobile/"], web: ["web/", "packages/world-knowledge-authoring-ui/"], admin: ["admin-dashboard/", "packages/world-knowledge-authoring-ui/"], shared: ["packages/shared/"], user: ["packages/user-intelligence-vnext-core/", "scripts/user-intelligence/"], world: ["packages/world-knowledge-core/", "scripts/world-knowledge/"] },
  databasePrefixes: ["supabase/migrations/", "supabase/canonical/", "supabase/tests/"],
  authorizationPrefixes: ["mobile/lib/supabase.ts", "supabase/canonical/auth_hooks.sql", "supabase/canonical/storage.sql"],
  privilegedServerPrefixes: ["supabase/functions/", "supabase/config.toml", "supabase/production/auth-config.json"],
  decisionSemanticPrefixes: ["packages/decision-vnext-core/src/", "packages/world-knowledge-core/src/port.ts", "supabase/functions/decision-v13/"],
  decisionEvaluationPrefixes: ["packages/decision-vnext-core/test/", "packages/decision-vnext-core/sandbox/", "decision-lab/"],
  decisionConsumerPrefixes: ["packages/shared/", "packages/user-intelligence-vnext-core/", "packages/world-knowledge-core/"],
  decisionPipelineControlPrefixes: [".github/workflows/", "package.json", "package-lock.json", "scripts/ci/classify-change.mjs", "scripts/ci/decision-", "scripts/ci/verify-decision-shards.mjs"],
  integrationControlPrefixes: ["delivery/integration/", "docs/operations/integration/", "scripts/ci/integration-", "scripts/ci/week2-dark-wiring", "scripts/ci/founder-live-control-plane", "scripts/ci/founder-activation-control-plane", "scripts/ci/source-aware-idempotency-migration-scope", "scripts/world-knowledge/build-week1-production-release-foundation"],
  productReleasePrefixes: ["mobile/app/(tabs)/decision.tsx", "mobile/app/(tabs)/wohin.tsx", "mobile/lib/supabase.ts", "mobile/lib/decision/", "packages/decision-vnext-core/src/product-", "supabase/functions/decision-", "scripts/deployment/"],
  knownRepositoryPrefixes: [".github/", ".gitleaks.toml", "README.md", "admin-dashboard/", "decision-lab/", "docs/", "mobile/", "package.json", "package-lock.json", "packages/", "scripts/", "supabase/", "web/"],
  deliveryControlPrefixes: [".github/workflows/", ".gitleaks.toml", "delivery/", "scripts/ci/", "scripts/deployment/", "docs/operations/"],
  releaseEvidencePrefixes: ["docs/operations/releases/"],
  retiredPrefixes: ["decision-lab/", "scripts/decision/", "packages/decision-vnext-core/sandbox/", "docs/operations/integration/"],
};
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = (root, path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
const commit = (root, message) => { git(root, ["add", "."]); git(root, ["commit", "--quiet", "-m", message]); return git(root, ["rev-parse", "HEAD"]); };
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-classify-"));
  git(root, ["init", "--quiet", "-b", "main"]); git(root, ["config", "user.email", ["fixture", "example.invalid"].join("@")]); git(root, ["config", "user.name", "Fixture"]);
  put(root, "decision-lab/config/anchor.json", JSON.stringify({ protectedSemanticSourceSet: { paths: ["mobile/lib/protected-decision.ts"] } }));
  put(root, "README.md", "base\n");
  const base = commit(root, "base");
  return { root, base };
};
const plan = ({ files }) => {
  const { root, base } = fixture();
  for (const [path, value] of Object.entries(files)) put(root, path, value);
  const head = commit(root, "candidate");
  const context = { baseSha: base, headSha: head };
  return classifyChange({ root, context, policy });
};

for (const [label, path, flag] of [
  ["Mobile presentation", "mobile/components/Card.tsx", "mobile"],
  ["Web presentation", "web/components/Card.tsx", "web"],
  ["Admin presentation", "admin-dashboard/components/Card.tsx", "admin"],
  ["shared Product contract", "packages/shared/src/contract.ts", "shared"],
  ["User Intelligence vNext contract", "packages/user-intelligence-vnext-core/src/contracts.ts", "user"],
  ["World Knowledge foundation contract", "packages/world-knowledge-core/src/contracts.ts", "world"],
]) test(`${label} selects only its relevant surface gate`, () => {
  const result = plan({ files: { [path]: "export const value = true;\n" } });
  assert.equal(result.flags[flag], true);
  assert.equal(result.flags.decisionSemantics, false);
  assert.equal(result.flags.database, false);
});

test("Wohin is classified as a Product release, not an unguarded Mobile-only screen", () => {
  const result = plan({ files: { "mobile/app/(tabs)/wohin.tsx": "export default true;\n" } });
  assert.equal(result.flags.mobile, true);
  assert.equal(result.flags.productRelease, true);
});

test("native Supabase Auth lifecycle selects authorization and Product release certification", () => {
  const result = plan({ files: { "mobile/lib/supabase.ts": "export const authLifecycle = true;\n" } });
  assert.equal(result.flags.mobile, true);
  assert.equal(result.flags.authorizationBoundary, true);
  assert.equal(result.flags.productRelease, true);
  assert.ok(result.requiredGates.includes("release-certification"));
  assert.ok(result.requiredGates.includes("repository-security"));
});

test("additive migration is separated from authorization and destructive changes", () => {
  const result = plan({ files: { "supabase/migrations/20260101000000_add_column.sql": "alter table public.example add column note text;\n" } });
  assert.deepEqual(result.classes, ["database-additive"]);
  assert.deepEqual(result.blockedReasons, []);
});

test("Product context RPC migrations require Decision and release certification", () => {
  const result = plan({ files: {
    "supabase/migrations/20260101000000_product_context.sql":
      "create or replace function public.backyrd_decision_vnext_product_context_v2() returns void language sql as $$ select 1 $$;\n",
  } });
  assert.equal(result.flags.database, true);
  assert.equal(result.flags.decisionEvaluation, true);
  assert.equal(result.flags.productRelease, true);
  assert.ok(result.requiredGates.includes("decision"));
  assert.ok(result.requiredGates.includes("release-certification"));
});

test("RLS migration selects the strict authorization boundary", () => {
  const result = plan({ files: { "supabase/migrations/20260101000000_add_rls.sql": "create policy own_rows on public.example to authenticated using ((select auth.uid()) = user_id);\n" } });
  assert.equal(result.flags.authorizationBoundary, true);
  assert.ok(result.classes.includes("authorization-boundary"));
});

test("destructive migration is a separate blocked class", () => {
  const result = plan({ files: { "supabase/migrations/20260101000000_drop_data.sql": "drop table public.example;\n" } });
  assert.ok(result.classes.includes("destructive-production-operation"));
  assert.ok(result.blockedReasons.includes("destructive_migration_requires_separate_founder_cto_authorization"));
});

test("only the exact private Founder Live expired-key purge is non-destructive", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/20260918123000_founder_live_durable_idempotency_v1.sql", import.meta.url), "utf8");
  assert.equal(isDestructiveMigration(migration), false);
  assert.equal(isDestructiveMigration(migration.replace("create function public.backyrd_founder_live_idempotency_purge_expired_v1", "create function public.other_purge")), true);
  assert.equal(isDestructiveMigration(migration.replaceAll("founder_live_private.idempotency_records_v1", "public.idempotency_records_v1")), true);
  assert.equal(isDestructiveMigration(migration.replaceAll("founder_live_private.idempotency_records_v1", "other_private.idempotency_records_v1")), true);
  assert.equal(isDestructiveMigration(migration.replaceAll("perform founder_live_private.assert_service_authority_v1();", "perform true;")), true);
  assert.equal(isDestructiveMigration(`${migration}\ngrant execute on function public.backyrd_founder_live_idempotency_purge_expired_v1(integer) to authenticated;`), true);
  assert.equal(isDestructiveMigration(migration.replaceAll("expires_at <= clock_timestamp()", "expires_at < clock_timestamp()")), true);
  assert.equal(isDestructiveMigration(migration.replaceAll("expires_at <= clock_timestamp()", "expires_at <= statement_timestamp()")), true);
  assert.equal(isDestructiveMigration(migration.replace("p_limit not between 1 and 1000", "p_limit not between 1 and 1001")), true);
  assert.equal(isDestructiveMigration(migration.replace("limit p_limit", "limit 1000")), true);
  assert.equal(isDestructiveMigration(migration.replace("limit p_limit", "limit least(p_limit, 1000)")), true);
  assert.equal(isDestructiveMigration(migration.replace("for update skip locked", "for update")), true);
  assert.equal(isDestructiveMigration(migration.replace("for update skip locked", "skip locked")), true);
  assert.equal(isDestructiveMigration(migration.replace("using expired_keys", "where target.expires_at <= clock_timestamp()")), true);
  assert.equal(isDestructiveMigration(migration.replace("where expires_at <= clock_timestamp()", "where expires_at <= clock_timestamp() or true")), true);
  assert.equal(isDestructiveMigration(migration.replace("delete from founder_live_private.idempotency_records_v1 as target", "execute 'delete from founder_live_private.idempotency_records_v1'")), true);
  assert.equal(isDestructiveMigration(migration.replaceAll("set search_path = ''", "set search_path = public")), true);
  assert.equal(isDestructiveMigration(`${migration}\nupdate founder_live_private.idempotency_records_v1 set expires_at=now();`), true);
  assert.equal(isDestructiveMigration(`${migration}\ndelete from founder_live_private.idempotency_records_v1;`), true);
  assert.equal(isDestructiveMigration(`${migration}\ntruncate founder_live_private.idempotency_records_v1;`), true);
  const reformatted = migration.replace(/\n/g, "\n  ").replace("with expired_keys", "-- bounded expired selection\n  with expired_keys");
  assert.equal(isDestructiveMigration(reformatted), false);
});

test("only the exact authority-hashed Product consent/expiry migration clears the destructive blocker", () => {
  const path = "supabase/migrations/20260918182831_decision_vnext_product_runtime_v1.sql";
  const migration = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const authority = JSON.parse(readFileSync(new URL("../../delivery/product-authority-v1.json", import.meta.url), "utf8"));
  assert.equal(isDestructiveMigration(migration), true);
  assert.equal(isAuthorizedBoundedMigration(path, migration, authority), true);
  assert.equal(isAuthorizedBoundedMigration(path, migration.trim(), authority), false);
  assert.equal(isAuthorizedBoundedMigration(path, `${migration}\n-- drift`, authority), false);
  assert.equal(isAuthorizedBoundedMigration("supabase/migrations/other.sql", migration, authority), false);
  assert.equal(isAuthorizedBoundedMigration(path, migration, { ...authority, authorizedBoundedMigrations: authority.authorizedBoundedMigrations.map((entry) => ({ ...entry, scope: "BROAD_DELETE" })) }), false);
  assert.equal(isAuthorizedBoundedMigration(path, migration, { ...authority, authorizedBoundedMigrations: authority.authorizedBoundedMigrations.map((entry) => ({ ...entry, sha256: "0".repeat(64) })) }), false);
});

test("protected source changes select Decision recertification while evaluator-only changes do not", () => {
  const source = plan({ files: { "mobile/lib/protected-decision.ts": "export const semantic = 2;\n" } });
  assert.equal(source.flags.decisionSemantics, true);
  const evaluator = plan({ files: { "decision-lab/test/new.test.mjs": "// test\n" } });
  assert.equal(evaluator.flags.decisionSemantics, false);
  assert.equal(evaluator.flags.decisionEvaluation, true);
});

test("a new Product authority can replace the legacy anchor without opening Decision source routing", () => {
  const { root, base } = fixture();
  put(root, "delivery/product-authority-v1.json", JSON.stringify({ protectedSemanticSourceSet: { paths: ["packages/decision-vnext-core/src/product.ts"] } }));
  put(root, "packages/decision-vnext-core/src/product.ts", "export const product = true;\n");
  const head = commit(root, "product authority transition");
  const result = classifyChange({ root, context: { baseSha: base, headSha: head }, policy: { ...policy, decisionTrustAnchor: "delivery/product-authority-v1.json" } });
  assert.equal(result.flags.decisionSemantics, true);
  assert.ok(result.requiredGates.includes("decision"));
});

test("secret scanner policy changes are explicit delivery-control changes", () => {
  const result = plan({ files: { ".gitleaks.toml": "[extend]\nuseDefault = true\n" } });
  assert.equal(result.flags.unknown, false);
  assert.equal(result.flags.deliveryControl, true);
  assert.ok(result.requiredGates.includes("delivery-policy"));
  assert.deepEqual(result.blockedReasons, []);
});

test("independent vNext core and sandbox select the Decision gate", () => {
  const core = plan({ files: { "packages/decision-vnext-core/src/index.ts": "export const spine = true;\n" } });
  assert.equal(core.flags.decisionSemantics, true);
  assert.ok(core.requiredGates.includes("decision"));
  const sandbox = plan({ files: { "packages/decision-vnext-core/sandbox/config.json": "{}\n" } });
  assert.equal(sandbox.flags.decisionEvaluation, true);
  assert.ok(sandbox.requiredGates.includes("decision"));
});

test("World, User and shared contract changes select Decision consumer regression", () => {
  for (const path of ["packages/world-knowledge-core/src/contracts.ts", "packages/user-intelligence-vnext-core/src/contracts.ts", "packages/shared/src/contracts.ts"]) {
    const result = plan({ files: { [path]: "export const changed = true;\n" } });
    assert.equal(result.flags.decisionConsumer, true);
    assert.ok(result.requiredGates.includes("decision"));
  }
});

test("historical integration controls select delivery policy without rebuilding every product surface", () => {
  for (const path of ["delivery/integration/week2-dark-wiring-manifest.json", "scripts/ci/week2-dark-wiring-preflight.mjs", "docs/operations/integration/WEEK2_RELEASE_TRAIN.md", "scripts/ci/founder-live-control-plane.mjs", "scripts/ci/founder-activation-control-plane.mjs", "scripts/ci/source-aware-idempotency-migration-scope.mjs", "scripts/world-knowledge/build-week1-production-release-foundation.mjs"]) {
    const result = plan({ files: { [path]: path.endsWith(".json") ? "{}\n" : "control\n" } });
    assert.equal(result.flags.integrationControl, true);
    assert.ok(result.classes.includes("integration-control-plane"));
    const expected = path.startsWith("scripts/world-knowledge/") ? ["delivery-policy", "repository-security", "world"] : ["delivery-policy", "repository-security"];
    assert.deepEqual(result.requiredGates, expected);
  }
});

test("workflow and package routing changes validate delivery policy without triggering unrelated products", () => {
  for (const path of [".github/workflows/risk-gate.yml", "package.json", "scripts/ci/decision-test-plan.mjs"]) {
    const result = plan({ files: { [path]: "changed\n" } });
    assert.equal(result.flags.pipelineControl, true);
    assert.ok(result.requiredGates.includes("delivery-policy"));
    if (path !== "scripts/ci/decision-test-plan.mjs") assert.deepEqual(result.requiredGates, ["delivery-policy", "repository-security", "supply-chain"]);
  }
});

test("unknown files and deleted tests cannot silently bypass routing", () => {
  const unknown = plan({ files: { "unclassified-surface/value.bin": "opaque\n" } });
  assert.equal(unknown.flags.unknown, true);
  assert.deepEqual(unknown.requiredGates, ["delivery-policy", "repository-security"]);
  assert.deepEqual(unknown.blockedReasons, ["unknown_path_requires_explicit_risk_classification"]);

  const { root, base } = fixture();
  put(root, "packages/decision-vnext-core/test/deleted.test.mjs", "test('required',()=>{});\n");
  const withTest = commit(root, "test exists");
  execFileSync("git", ["rm", "packages/decision-vnext-core/test/deleted.test.mjs"], { cwd: root });
  const head = commit(root, "test deleted");
  const result = classifyChange({ root, context: { baseSha: withTest, headSha: head }, policy });
  assert.equal(result.flags.testDeletion, true);
  assert.ok(result.classes.includes("test-routing-change"));
  assert.notEqual(base, head);
});

test("retired systems are read-only history and can only be deleted", () => {
  const mutation = plan({ files: { "decision-lab/src/revival.mjs": "export const revived = true;\n" } });
  assert.ok(mutation.classes.includes("retired-system-removal"));
  assert.ok(mutation.blockedReasons.includes("retired_system_is_read_only_and_may_only_be_deleted"));
});

test("cross-domain changes receive the union of every affected gate", () => {
  const result = plan({ files: {
    "packages/user-intelligence-vnext-core/src/contracts.ts": "export const user = true;\n",
    "packages/decision-vnext-core/src/product-policy.ts": "export const decision = true;\n",
    "supabase/migrations/20260101000000_union.sql": "create table public.union_fixture(id uuid primary key);\n",
  } });
  assert.deepEqual(result.requiredGates, ["database", "decision", "release-certification", "repository-security", "user"]);
});

test("dependency and workflow changes always select the supply-chain gate", () => {
  for (const path of ["package-lock.json", "mobile/package.json", "packages/shared/package.json", ".github/workflows/risk-gate.yml"]) {
    const result = plan({ files: { [path]: "{}\n" } });
    assert.equal(result.flags.supplyChain, true);
    assert.ok(result.requiredGates.includes("supply-chain"));
  }
});

test("a verified prior green gate is reused only when the incremental delta cannot affect it", () => {
  const fullPlan = { context: { baseSha: "a".repeat(40), headSha: "c".repeat(40) }, requiredGates: ["admin", "database", "decision", "repository-security", "supply-chain"] };
  const deltaPlan = { context: { baseSha: "b".repeat(40), headSha: "c".repeat(40) }, changedFiles: ["admin-dashboard/package.json"], requiredGates: ["admin", "repository-security", "supply-chain"] };
  const result = applyVerifiedGateResume({ fullPlan, deltaPlan, resume: { eligible: true, baseSha: "a".repeat(40), previousHeadSha: "b".repeat(40), headSha: "c".repeat(40), previousTree: "d".repeat(40), successfulGates: ["database", "decision"] } });
  assert.deepEqual(result.requiredGates, ["admin", "repository-security", "supply-chain"]);
  assert.deepEqual(result.gateResume.reusedGates, ["database", "decision"]);
});

test("Product release certification never reuses an ancestor-bound artifact", () => {
  const fullPlan = { context: { baseSha: "a".repeat(40), headSha: "c".repeat(40) }, requiredGates: ["database", "release-certification", "repository-security"] };
  const deltaPlan = { context: { baseSha: "b".repeat(40), headSha: "c".repeat(40) }, changedFiles: ["delivery/database-releases/new.json"], requiredGates: ["database", "repository-security"] };
  const result = applyVerifiedGateResume({ fullPlan, deltaPlan, resume: { eligible: true, baseSha: "a".repeat(40), previousHeadSha: "b".repeat(40), headSha: "c".repeat(40), previousTree: "d".repeat(40), successfulGates: ["database", "release-certification"] } });
  assert.deepEqual(result.requiredGates, ["database", "release-certification", "repository-security"]);
  assert.deepEqual(result.gateResume.reusedGates, []);
});

test("missing or failed prior evidence never suppresses a full-plan gate", () => {
  const fullPlan = { context: { baseSha: "a".repeat(40), headSha: "c".repeat(40) }, requiredGates: ["database", "decision", "repository-security"] };
  const deltaPlan = { context: { baseSha: "b".repeat(40), headSha: "c".repeat(40) }, changedFiles: ["README.md"], requiredGates: ["repository-security"] };
  const result = applyVerifiedGateResume({ fullPlan, deltaPlan, resume: { eligible: true, baseSha: "a".repeat(40), previousHeadSha: "b".repeat(40), headSha: "c".repeat(40), previousTree: "d".repeat(40), successfulGates: ["decision"] } });
  assert.deepEqual(result.requiredGates, ["database", "repository-security"]);
  assert.deepEqual(result.gateResume.reusedGates, ["decision"]);
});

test("resume evidence is fail-closed when plan identities differ", () => {
  assert.throws(() => applyVerifiedGateResume({
    fullPlan: { context: { baseSha: "a".repeat(40), headSha: "c".repeat(40) }, requiredGates: [] },
    deltaPlan: { context: { baseSha: "b".repeat(40), headSha: "c".repeat(40) }, changedFiles: [], requiredGates: [] },
    resume: { eligible: true, baseSha: "0".repeat(40), previousHeadSha: "b".repeat(40), headSha: "c".repeat(40), successfulGates: [] },
  }), /identity_mismatch/);
});

test("only proven non-executable Markdown takes the documentation-only shortcut", () => {
  const markdown = plan({ files: { "docs/product/note.md": "prose only\n" } });
  assert.equal(markdown.flags.documentationOnly, true);
  assert.deepEqual(markdown.requiredGates, ["repository-security"]);
  assert.ok(markdown.classes.includes("documentation-only"));

  const machineReadable = plan({ files: { "docs/product/contract.json": "{}\n" } });
  assert.equal(machineReadable.flags.documentationOnly, false);
  assert.deepEqual(machineReadable.requiredGates, ["delivery-policy", "repository-security"]);
});

test("Supabase deployment controls select database and delivery verification", () => {
  const result = plan({ files: { "scripts/deployment/release.mjs": "export const release = false;\n" } });
  assert.equal(result.flags.deploymentControl, true);
  assert.ok(!result.requiredGates.includes("database"));
  assert.ok(result.requiredGates.includes("delivery-policy"));
  assert.ok(result.requiredGates.includes("release-certification"));
});

test("shipped Production state requires a new exact-source Product artifact", () => {
  const shipped = plan({ files: { "delivery/production-state.json": "{}\n" } });
  assert.equal(shipped.flags.deploymentControl, true);
  assert.equal(shipped.flags.productRelease, true);
  assert.ok(shipped.requiredGates.includes("release-certification"));
  assert.ok(shipped.requiredGates.includes("delivery-policy"));
  const unrelated = plan({ files: { "delivery/notes.json": "{}\n" } });
  assert.equal(unrelated.flags.productRelease, false);
  assert.ok(!unrelated.requiredGates.includes("release-certification"));
});

test("shared authoring UI selects web and admin fast lanes without Decision recertification", () => {
  const result = plan({ files: { "packages/world-knowledge-authoring-ui/src/index.tsx": "export const authoring = true;\n" } });
  assert.equal(result.flags.web, true);
  assert.equal(result.flags.admin, true);
  assert.equal(result.flags.decisionSemantics, false);
});

test("WorldKnowledgePort changes still select relevant Decision checks", () => {
  const result = plan({ files: { "packages/world-knowledge-core/src/port.ts": "export const port = true;\n" } });
  assert.equal(result.flags.world, true);
  assert.equal(result.flags.decisionSemantics, true);
  assert.ok(result.requiredGates.includes("decision"));
});

test("privileged Edge Function source selects the server deployment contract", () => {
  const result = plan({ files: { "supabase/functions/example/index.ts": "Deno.serve(() => new Response('ok'));\n" } });
  assert.equal(result.flags.privilegedServer, true);
  assert.ok(result.classes.includes("privileged-server"));
  assert.ok(result.requiredGates.includes("delivery-policy"));
  assert.ok(result.requiredGates.includes("release-certification"));
});

test("published migration mutation is identified independently", () => {
  const { root, base } = fixture();
  put(root, "supabase/migrations/20260101000000_existing.sql", "select 1;\n");
  const withMigration = commit(root, "published migration");
  put(root, "supabase/migrations/20260101000000_existing.sql", "select 2;\n");
  const head = commit(root, "mutated migration");
  const result = classifyChange({ root, context: { baseSha: withMigration, headSha: head }, policy });
  assert.equal(result.flags.migrationMutation, true);
  assert.ok(result.blockedReasons.includes("published_migration_mutation"));
  assert.notEqual(base, head);
});

test("additive ALTER TABLE and later DROP TRIGGER are not joined into a destructive operation", () => {
  const result = plan({ files: { "supabase/migrations/20260102120000_additive_rls.sql": "alter table private.example enable row level security;\ndrop trigger if exists old_trigger on private.example;\n" } });
  assert.equal(result.flags.destructive, false);
  assert.ok(!result.blockedReasons.includes("destructive_migration_requires_separate_founder_cto_authorization"));
});

test("an atomic named CHECK replacement is an authorization change, not a destructive data operation", () => {
  const result = plan({ files: { "supabase/migrations/20260102120000_expand_check.sql": "alter table private.example drop constraint example_kind_check;\nalter table private.example add constraint example_kind_check check (kind in ('A','B'));\n" } });
  assert.equal(result.flags.destructive, false);
  assert.equal(result.flags.database, true);
  assert.ok(!result.blockedReasons.includes("destructive_migration_requires_separate_founder_cto_authorization"));
});

test("an unpaired or differently named constraint drop remains fail-closed", () => {
  for (const sql of [
    "alter table private.example drop constraint example_kind_check;\n",
    "alter table private.example drop constraint example_kind_check;\nalter table private.example add constraint other_check check (kind in ('A','B'));\n",
  ]) {
    const result = plan({ files: { "supabase/migrations/20260102120000_drop_check.sql": sql } });
    assert.equal(result.flags.destructive, true);
    assert.ok(result.blockedReasons.includes("destructive_migration_requires_separate_founder_cto_authorization"));
  }
});
