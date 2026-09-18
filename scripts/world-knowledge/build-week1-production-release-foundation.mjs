#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductionPlan } from "../deployment/supabase-production-plan.mjs";
import { verifySourceAwareIdempotencyMigrationScope } from "../ci/source-aware-idempotency-migration-scope.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();

const migrationPolicy = Object.freeze([
  {
    suffix: "20260910174419_world_knowledge_slice_3b_foundation.sql",
    phase: "EXPAND_FOUNDATION",
    dependencies: ["public.spots", "auth.users", "Slice 2 runtime contracts"],
    lockRisk: "MEDIUM_METADATA_LOCKS",
    rollback: "Stop writes; restore the pre-apply database backup. Do not drop append-only ledgers in place.",
    stopConditions: ["PUBLIC_OR_CLIENT_LEDGER_ACCESS", "UNEXPECTED_EXISTING_WORLD_OBJECT", "HASH_MISMATCH"],
  },
  {
    suffix: "20260911184459_world_knowledge_slice_4a_authoring.sql",
    phase: "EXPAND_AUTHORING",
    dependencies: ["20260910174419", "world_knowledge_private claims and policies"],
    lockRisk: "LOW_NEW_OBJECTS",
    rollback: "Disable the local-only authoring flag; restore backup if structural rollback is required.",
    stopConditions: ["AUTHORING_FLAG_ENABLED_OUTSIDE_ISOLATED_ENV", "HASH_MISMATCH"],
  },
  {
    suffix: "20260911214533_world_knowledge_slice_4a_legacy_import_rehearsal.sql",
    phase: "EXPAND_IMPORT_STAGING",
    dependencies: ["20260911184459", "founder_evaluation_spots_v1"],
    lockRisk: "LOW_SHORT_ALTER_AND_NEW_OBJECTS",
    rollback: "Keep staging unreachable; restore backup rather than deleting provenance rows.",
    stopConditions: ["IMPORT_RPC_REACHABLE_BY_ANON", "IMPORT_CREATES_VERIFIED_CLAIMS", "HASH_MISMATCH"],
  },
  {
    suffix: "20260912084654_world_knowledge_slice_4a_authoring_product_readiness.sql",
    phase: "EXPAND_VALIDATION",
    dependencies: ["20260910174419", "20260911184459"],
    lockRisk: "LOW_TRIGGER_REPLACEMENT",
    rollback: "Restore backup or redeploy the previous function/trigger definitions from immutable source.",
    stopConditions: ["CATEGORY_PLACE_TYPE_POLICY_BROADENED", "TRIGGER_MISSING", "HASH_MISMATCH"],
  },
  {
    suffix: "20260912103000_world_knowledge_slice_4a_authoring_reliability.sql",
    phase: "CONTRACT_VALIDATION_REPLACEMENT",
    dependencies: ["20260910174419"],
    lockRisk: "LOW_FUNCTION_CATALOG_LOCK",
    rollback: "Redeploy the prior immutable validator definition or restore backup.",
    stopConditions: ["VALIDATOR_ACCEPTS_UNKNOWN_KEY", "HASH_MISMATCH"],
  },
  {
    suffix: "20260912121000_world_knowledge_slice_4a_taxonomy_candidate_expansion.sql",
    phase: "EXPAND_CANDIDATE_LEDGER",
    dependencies: ["20260910174419", "20260912084654"],
    lockRisk: "LOW_NEW_OBJECTS",
    rollback: "Revoke candidate RPC execution; preserve candidate history; restore backup for structural rollback.",
    stopConditions: ["CANDIDATE_BECOMES_WORLD_TRUTH", "CLIENT_DIRECT_TABLE_WRITE", "HASH_MISMATCH"],
  },
  {
    suffix: "20260912165043_world_knowledge_slice_4a_authoring_registry_2.sql",
    phase: "EXPAND_REGISTRY_2",
    dependencies: ["20260910174419", "20260911184459", "20260911214533"],
    lockRisk: "MEDIUM_EXISTING_TABLE_ALTERS_AND_TRIGGERS",
    rollback: "Stop Registry 2 authoring and restore backup; never reinterpret or delete Registry 1 history.",
    stopConditions: ["REGISTRY_HASH_MISMATCH", "HISTORICAL_REGISTRY_MUTATION", "HASH_MISMATCH"],
  },
  {
    suffix: "20260915163631_world_knowledge_slice_4b_contextual_semantics.sql",
    phase: "EXPAND_REGISTRY_2_1_CONTEXT",
    dependencies: ["20260912165043"],
    lockRisk: "MEDIUM_CONSTRAINT_AND_TRIGGER_REPLACEMENT",
    rollback: "Stop Registry 2.1 authoring and restore backup; keep all 2.1 claims append-only.",
    stopConditions: ["CONTEXT_ENTERS_DECISION_PROJECTION", "REGISTRY_HASH_MISMATCH", "HASH_MISMATCH"],
  },
  {
    suffix: "20260916061802_world_founder_context_handoff_unknown_canonicalization.sql",
    phase: "CONTRACT_HANDOFF_CANONICALIZATION",
    dependencies: ["20260915163631"],
    lockRisk: "LOW_FUNCTION_CATALOG_LOCK",
    rollback: "Redeploy the prior immutable handoff function or restore backup.",
    stopConditions: ["UNKNOWN_BECOMES_FALSE", "HANDOFF_HASH_MISMATCH", "HASH_MISMATCH"],
  },
]);

const statementMetrics = (sql) => ({
  bytes: Buffer.byteLength(sql),
  lines: sql.split(/\r?\n/).length,
  createTable: (sql.match(/\bcreate\s+table\b/gi) ?? []).length,
  alterTable: (sql.match(/\balter\s+table\b/gi) ?? []).length,
  createOrReplaceFunction: (sql.match(/\bcreate\s+or\s+replace\s+function\b/gi) ?? []).length,
  securityDefiner: (sql.match(/\bsecurity\s+definer\b/gi) ?? []).length,
  enableRls: (sql.match(/\benable\s+row\s+level\s+security\b/gi) ?? []).length,
  grants: (sql.match(/\bgrant\b/gi) ?? []).length,
  revokes: (sql.match(/\brevoke\b/gi) ?? []).length,
  inserts: (sql.match(/\binsert\s+into\b/gi) ?? []).length,
  updates: (sql.match(/\bupdate\s+[a-z_]/gi) ?? []).length,
  deletes: (sql.match(/\bdelete\s+from\b/gi) ?? []).length,
  destructiveDdl: (sql.match(/\b(?:drop\s+(?:table|schema)|truncate\s+table)\b/gi) ?? []).length,
});

export const buildWorldWeek1Foundation = ({ headSha = git(["rev-parse", "HEAD"]) } = {}) => {
  const canonicalBaseSha = git(["merge-base", headSha, "origin/main"]);
  const productionState = JSON.parse(readFileSync(resolve(root, "delivery/production-state.json"), "utf8"));
  const sourcePlan = buildProductionPlan({ repo: root, baseSha: productionState.supabase.shippedSourceSha, headSha });
  if (sourcePlan.deployFunctions.length !== 0 || sourcePlan.authConfig?.deploy === true) throw new Error("unexpected_non_migration_runtime_scope");
  const scopes = verifySourceAwareIdempotencyMigrationScope({ root, pendingMigrations: sourcePlan.pendingMigrations, baseSha: canonicalBaseSha, headSha });

  const migrations = scopes.worldMigrations.map((entry, index) => {
    const policy = migrationPolicy[index];
    if (!entry.path.endsWith(policy.suffix)) throw new Error(`migration_order_or_identity_mismatch:${index}:${entry.path}`);
    const sql = readFileSync(resolve(root, entry.path), "utf8");
    if (sha256(sql) !== entry.sha256) throw new Error(`migration_bytes_mismatch:${entry.path}`);
    if (/\bsecurity\s+definer\b/i.test(sql) && !/\bset\s+search_path\s*=\s*''/i.test(sql)) throw new Error(`security_definer_without_empty_search_path:${entry.path}`);
    const metrics = statementMetrics(sql);
    if (metrics.destructiveDdl > 0) throw new Error(`destructive_ddl_forbidden:${entry.path}`);
    return { order: index + 1, path: entry.path, sha256: entry.sha256, ...policy, metrics };
  });

  const bundle = migrations.map(({ order, path, sha256 }) => ({ order, path, sha256 }));
  const foundation = {
    schemaVersion: "backyrd.world-knowledge.production-release-foundation@week1-v1",
    canonicalBaseSha,
    candidateHeadSha: headSha,
    shippedSourceSha: productionState.supabase.shippedSourceSha,
    shippedMigrationTip: productionState.supabase.migrationTip,
    projectRef: sourcePlan.projectRef,
    executionAuthorized: false,
    productionInspectionAuthorized: false,
    runtimeActivationAuthorized: false,
    migrationCount: migrations.length,
    migrationBundleHash: sha256(stable(bundle)),
    sourceAwarePlanHash: sourcePlan.planHash,
    independentMigrationScopes: scopes.independentMigrations.map(({ path, sha256: digest }) => ({ path, sha256: digest, evidenceId: scopes.evidenceId, executionAuthorized: false })),
    migrations,
    releaseSequence: ["PREFLIGHT", "BACKUP", "RESTORE_REHEARSAL", "APPLY_REHEARSAL", "VERIFY_REHEARSAL", "CTO_AUTHORIZATION_REQUIRED", "PRODUCTION_APPLY_BLOCKED"],
    globalStopConditions: [
      "PRODUCTION_STATE_DIFFERS_FROM_ATTESTED_BASELINE",
      "BACKUP_OR_RESTORE_PROOF_MISSING",
      "MIGRATION_OR_PLAN_HASH_MISMATCH",
      "UNEXPECTED_LOCK_OR_RUNTIME_EXCEEDS_BUDGET",
      "RLS_GRANT_OR_FUNCTION_AUTHORITY_REGRESSION",
      "UNKNOWN_OR_DISPUTED_VALUE_COLLAPSES_TO_FALSE",
      "DECISION_USER_OR_PRODUCTION_RUNTIME_SCOPE_APPEARS",
    ],
    cohort: {
      targetMin: 20,
      targetMax: 40,
      region: "Basel",
      candidateGenerationOnly: true,
      automaticClaimConfirmation: false,
      requiredCoverage: [
        "purpose.primary_visit", "classification.place_types", "hours.regular", "hours.kitchen_service",
        "context.typical_dayparts", "context.visit_situations", "context.atmosphere", "operation.price_level",
        "accessibility.step_free_entrance", "rule.age_access", "offering.onsite",
      ],
      knowledgeStatesPreserved: ["ABSENT", "UNKNOWN", "NOT_CONFIGURED", "DISPUTED", "KNOWN_FALSE", "KNOWN_TRUE", "KNOWN_VALUE"],
    },
    dependencies: {
      decision: "READ_ONLY_HANDOFF_ONLY_NO_WIRING_OR_INTENT_AUTHORITY",
      userIntelligence: "NO_CONTRACT_OR_SEMANTIC_CHANGE",
      integration: "REQUIRES_SEPARATE_PRODUCTION_AUTHORIZATION_AFTER_CTO_REVIEW",
    },
  };
  return { ...foundation, foundationHash: sha256(stable(foundation)) };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const outputIndex = process.argv.indexOf("--output");
    const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
    const artifact = `${JSON.stringify(buildWorldWeek1Foundation(), null, 2)}\n`;
    if (output) writeFileSync(resolve(root, output), artifact, { encoding: "utf8" });
    else process.stdout.write(artifact);
  } catch (error) {
    process.stderr.write(`world_week1_release_foundation_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
