import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const WORLD_MIGRATION_PATHS = Object.freeze([
  "supabase/migrations/20260910174419_world_knowledge_slice_3b_foundation.sql",
  "supabase/migrations/20260911184459_world_knowledge_slice_4a_authoring.sql",
  "supabase/migrations/20260911214533_world_knowledge_slice_4a_legacy_import_rehearsal.sql",
  "supabase/migrations/20260912084654_world_knowledge_slice_4a_authoring_product_readiness.sql",
  "supabase/migrations/20260912103000_world_knowledge_slice_4a_authoring_reliability.sql",
  "supabase/migrations/20260912121000_world_knowledge_slice_4a_taxonomy_candidate_expansion.sql",
  "supabase/migrations/20260912165043_world_knowledge_slice_4a_authoring_registry_2.sql",
  "supabase/migrations/20260915163631_world_knowledge_slice_4b_contextual_semantics.sql",
  "supabase/migrations/20260916061802_world_founder_context_handoff_unknown_canonicalization.sql",
]);

export const IDEMPOTENCY_MIGRATION_PATH = "supabase/migrations/20260918123000_founder_live_durable_idempotency_v1.sql";
export const IDEMPOTENCY_TEST_PATH = "supabase/tests/founder_live_durable_idempotency_v1.sql";
export const IDEMPOTENCY_EVIDENCE_PATH = "delivery/database-releases/20260918123000-founder-live-durable-idempotency-v1.json";
const MIGRATION_SHA256 = "0db49db4b2e0f5c191cf5960eb51fab4f2d569ba87b3037dfe8d253f89785fb2";
const TEST_SHA256 = "dcd4c15833c71bc611a4acd2e205baf0fc2a0cdd63fffde4a15d567eea4fa842";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const requireValue = (value, reason) => { if (!value) throw new Error(reason); };

export function partitionSourceAwareMigrationScopes(pendingMigrations) {
  requireValue(Array.isArray(pendingMigrations), "source_aware_pending_migrations_required");
  const paths = pendingMigrations.map(({ path }) => path);
  requireValue(new Set(paths).size === paths.length, "source_aware_duplicate_pending_migration");
  requireValue(paths.length === WORLD_MIGRATION_PATHS.length || paths.length === WORLD_MIGRATION_PATHS.length + 1, `source_aware_pending_migration_count_invalid:${paths.length}`);
  requireValue(WORLD_MIGRATION_PATHS.every((path, index) => paths[index] === path), "source_aware_world_migration_identity_or_order_mismatch");
  const independent = pendingMigrations.slice(WORLD_MIGRATION_PATHS.length);
  if (independent.length) requireValue(independent[0].path === IDEMPOTENCY_MIGRATION_PATH, `source_aware_independent_scope_unknown:${independent[0].path}`);
  return { worldMigrations: pendingMigrations.slice(0, WORLD_MIGRATION_PATHS.length), independentMigrations: independent };
}

export function verifySourceAwareIdempotencyMigrationScope({ root, pendingMigrations, baseSha, headSha }) {
  const partitioned = partitionSourceAwareMigrationScopes(pendingMigrations);
  if (partitioned.independentMigrations.length === 0) return { ...partitioned, evidenceId: null };

  const evidence = JSON.parse(readFileSync(resolve(root, IDEMPOTENCY_EVIDENCE_PATH), "utf8"));
  requireValue(evidence.schemaVersion === "backyrd-database-evidence-v1" && evidence.kind === "release" && evidence.id === "20260918123000-founder-live-durable-idempotency-v1", "source_aware_idempotency_evidence_identity_invalid");
  requireValue(evidence.previousEvidence === "20260916061802-world-founder-context-handoff-unknown-canonicalization", "source_aware_idempotency_evidence_lineage_invalid");
  requireValue(evidence.migrations?.length === 1 && evidence.migrations[0].path === IDEMPOTENCY_MIGRATION_PATH && evidence.migrations[0].sha256 === MIGRATION_SHA256, "source_aware_idempotency_migration_seal_invalid");
  requireValue(evidence.tests?.length === 1 && evidence.tests[0].path === IDEMPOTENCY_TEST_PATH && evidence.tests[0].sha256 === TEST_SHA256, "source_aware_idempotency_test_seal_invalid");
  requireValue(sha256(readFileSync(resolve(root, IDEMPOTENCY_MIGRATION_PATH))) === MIGRATION_SHA256, "source_aware_idempotency_migration_bytes_mismatch");
  requireValue(sha256(readFileSync(resolve(root, IDEMPOTENCY_TEST_PATH))) === TEST_SHA256, "source_aware_idempotency_test_bytes_mismatch");
  requireValue(partitioned.independentMigrations[0].sha256 === MIGRATION_SHA256, "source_aware_idempotency_plan_hash_mismatch");

  const git = (args, options = {}) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: options.stdio ?? ["ignore", "pipe", "pipe"] }).trim();
  let existsAtBase = true;
  try { execFileSync("git", ["cat-file", "-e", `${baseSha}:${IDEMPOTENCY_MIGRATION_PATH}`], { cwd: root, stdio: "ignore" }); }
  catch { existsAtBase = false; }
  const migrationEntries = git(["diff", "--name-status", "--no-renames", `${baseSha}..${headSha}`, "--", "supabase/migrations/"]).split("\n").filter(Boolean).map((line) => {
    const [status, path] = line.split("\t"); return { status, path };
  });
  if (existsAtBase) {
    requireValue(migrationEntries.length === 0, `source_aware_existing_migration_mutation:${migrationEntries.map(({ status, path }) => `${status}:${path}`).join(",")}`);
  } else {
    requireValue(migrationEntries.length === 1 && migrationEntries[0].status === "A" && migrationEntries[0].path === IDEMPOTENCY_MIGRATION_PATH, `source_aware_idempotency_scope_not_exact_addition:${migrationEntries.map(({ status, path }) => `${status}:${path}`).join(",")}`);
  }
  return { ...partitioned, evidenceId: evidence.id };
}
