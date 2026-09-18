#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductionPlan } from "../deployment/supabase-production-plan.mjs";
import {
  IDEMPOTENCY_EVIDENCE_PATH,
  IDEMPOTENCY_MIGRATION_PATH,
  IDEMPOTENCY_TEST_PATH,
  WORLD_MIGRATION_PATHS,
  verifySourceAwareIdempotencyMigrationScope,
} from "../ci/source-aware-idempotency-migration-scope.mjs";
import { buildWorldWeek2Basis } from "./build-week2-world-basis.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
const requireValue = (value, reason) => { if (!value) throw new Error(reason); };

export const WORLD_ADMIN_CUTOVER_CONTRACT = "backyrd.world-knowledge.world-admin-production-cutover@1.0";
export const WORLD_ADMIN_PRODUCTION_BASE = "d63c5ae66aa30aa017cc54c2ed8be47944b84889";
export const IDEMPOTENCY_SCOPE_BASE = "96f648cebbfdfd854aec688613ddbedb447c25bb";
export const WORLD_ADMIN_EXACT_MIGRATION_PATHS = Object.freeze([...WORLD_MIGRATION_PATHS, IDEMPOTENCY_MIGRATION_PATH]);

const auditMigration = (repo, migration, order) => {
  const sql = readFileSync(resolve(repo, migration.path), "utf8");
  const definerBlocks = [...sql.matchAll(/create\s+or\s+replace\s+function[\s\S]*?(?=create\s+or\s+replace\s+function|$)/gi)]
    .filter((match) => /security\s+definer/i.test(match[0]));
  const audit = {
    order,
    path: migration.path,
    sha256: migration.sha256,
    bytesVerified: sha256(sql) === migration.sha256,
    destructiveDdl: /\b(?:drop|truncate)\s+(?:table|schema|view|function|procedure)\b/i.test(sql),
    internalSupabaseSchemaMutation: /\b(?:create|alter|drop|truncate)\s+(?:table|schema|view|materialized\s+view|function|procedure|trigger|index)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:auth|realtime|storage)\s*\./i.test(sql),
    securityDefinerCount: definerBlocks.length,
    securityDefinerWithEmptySearchPath: definerBlocks.filter((match) => /set\s+search_path\s*=\s*''/i.test(match[0])).length,
    postgresCompatibility: "POSTGRESQL_17",
    secondApply: "MIGRATION_LEDGER_NO_OP",
  };
  requireValue(audit.bytesVerified, `world_admin_migration_hash_mismatch:${migration.path}`);
  requireValue(!audit.destructiveDdl, `world_admin_destructive_ddl:${migration.path}`);
  requireValue(!audit.internalSupabaseSchemaMutation, `world_admin_internal_supabase_schema_mutation:${migration.path}`);
  requireValue(audit.securityDefinerCount === audit.securityDefinerWithEmptySearchPath, `world_admin_unsafe_security_definer:${migration.path}`);
  return audit;
};

export function buildWorldAdminProductionCutover({ repo = root, sourceSha = "origin/main" } = {}) {
  const candidateSourceSha = git(repo, ["rev-parse", sourceSha]);
  const candidateTreeSha = git(repo, ["rev-parse", `${candidateSourceSha}^{tree}`]);
  const productionState = JSON.parse(readFileSync(resolve(repo, "delivery/production-state.json"), "utf8"));
  requireValue(productionState.supabase?.shippedSourceSha === WORLD_ADMIN_PRODUCTION_BASE, "world_admin_production_base_identity_mismatch");
  const plan = buildProductionPlan({ repo, baseSha: WORLD_ADMIN_PRODUCTION_BASE, headSha: candidateSourceSha });
  requireValue(plan.authConfig?.deploy === false, "world_admin_auth_deploy_forbidden");
  requireValue(plan.pendingMigrations.length === WORLD_ADMIN_EXACT_MIGRATION_PATHS.length, "world_admin_pending_migration_count_mismatch");
  requireValue(plan.pendingMigrations.every((item, index) => item.path === WORLD_ADMIN_EXACT_MIGRATION_PATHS[index]), "world_admin_pending_migration_order_mismatch");
  const partition = verifySourceAwareIdempotencyMigrationScope({ root: repo, pendingMigrations: plan.pendingMigrations, baseSha: IDEMPOTENCY_SCOPE_BASE, headSha: candidateSourceSha });
  requireValue(partition.worldMigrations.length === 9 && partition.independentMigrations.length === 1, "world_admin_migration_partition_mismatch");

  const week2 = buildWorldWeek2Basis({ headSha: candidateSourceSha });
  requireValue(week2.migrationCount === 9, "world_admin_sealed_world_migration_count_mismatch");
  requireValue(week2.migrations.every((item, index) => item.path === WORLD_MIGRATION_PATHS[index]), "world_admin_sealed_world_migration_order_mismatch");
  const migrations = plan.pendingMigrations.map((migration, index) => auditMigration(repo, migration, index + 1));
  const idempotencyEvidence = JSON.parse(readFileSync(resolve(repo, IDEMPOTENCY_EVIDENCE_PATH), "utf8"));

  const readerSourcePaths = [
    "packages/decision-vnext-core/src/founder-live-production-adapter.ts",
    "admin-dashboard/app/api/world-knowledge/shadow/route.ts",
    "web/app/api/world-knowledge/shadow/route.ts",
  ];
  const readerSources = readerSourcePaths.map((path) => ({ path, sha256: sha256(readFileSync(resolve(repo, path))) }));
  const productionReader = readFileSync(resolve(repo, readerSourcePaths[0]), "utf8");
  requireValue(productionReader.includes("createFounderWorldKnowledgeReader"), "world_admin_canonical_reader_missing");
  requireValue(productionReader.includes("world_knowledge_public_projection_v1"), "world_admin_public_projection_boundary_missing");
  requireValue(!/from\(["'](?:claims|verification_records|resolution_entries)["']\)/.test(productionReader), "world_admin_direct_ledger_read_forbidden");

  const body = {
    contractVersion: WORLD_ADMIN_CUTOVER_CONTRACT,
    projectRef: plan.projectRef,
    productionBaseline: {
      shippedSourceSha: WORLD_ADMIN_PRODUCTION_BASE,
      migrationTip: productionState.supabase.migrationTip,
      migrationCount: productionState.supabase.migrationCount,
    },
    candidateSourceSha,
    candidateTreeSha,
    sourceAwarePlanHash: plan.planHash,
    migrationBundleHash: sha256(stable(migrations.map(({ order, path, sha256: hash }) => ({ order, path, sha256: hash })))),
    migrations,
    migrationScope: {
      exactCount: 10,
      sealedWorldCount: 9,
      durableIdempotencyCount: 1,
      evidenceId: idempotencyEvidence.id,
      evidencePath: IDEMPOTENCY_EVIDENCE_PATH,
      testPath: IDEMPOTENCY_TEST_PATH,
      newMigrationsInTrack: 0,
    },
    sourceAwareRuntimeScope: {
      observedDeployFunctions: plan.deployFunctions,
      worldAdminDeployFunctions: [],
      integrationOwnedDeferredFunctions: plan.deployFunctions,
      authDeploy: false,
      executionAuthorized: false,
    },
    reader: {
      contractVersion: "backyrd.world-knowledge.reader-port@1.0",
      implementation: "CANONICAL_WORLD_KNOWLEDGE_READER_ONLY",
      directDecisionTableReads: false,
      clientAuthority: false,
      readerSources,
      knowledgeStatesPreserved: ["ABSENT", "KNOWN_TRUE", "KNOWN_FALSE", "KNOWN_VALUE", "UNKNOWN", "DISPUTED", "NOT_APPLICABLE", "NOT_CONFIGURED", "STALE", "EXPIRED"],
      timeDomainsSeparated: ["REGULAR_VENUE_HOURS", "SPECIAL_HOURS", "KITCHEN_SERVICE_HOURS", "CURRENT_STATE"],
      offeringDomainsSeparated: ["CUISINE", "FOOD_SPECIALITY", "OFFERING_GROUP", "MEAL", "SERVICE_MODEL", "SERVICE_FORMAT"],
    },
    admin: {
      surface: "EXISTING_ADMIN_DASHBOARD_ONLY",
      writePath: "SERVER_AUTHORITY_TO_APPEND_ONLY_CLAIM",
      reloadPath: "WRITE_AUTHORITY_REBUILD_READER_RELOAD",
      normalLanguage: "de",
      registryVersion: "backyrd.world-knowledge.registry@2.1",
      technicalJsonInNormalMode: false,
      ownerSubscriptionAffectsTrust: false,
    },
    evidence: {
      founderCohort: "FIVE_LOCAL_FOUNDER_SPOTS",
      geography: "Basel",
      source: "LOCAL_SYNTHETIC_AND_FOUNDER_APPROVED_FIXTURES_ONLY",
      productionQuery: false,
      productionData: false,
      requiredProofs: ["CANONICAL_READER", "SAVE_RELOAD_HOURS", "CONTEXT_HANDOFF", "HARD_CONSTRAINT_UNKNOWN_DISTINCTION", "SANITIZED_OUTPUT"],
    },
    releaseControls: {
      realAllowlistMembers: 0,
      authority: "NOT_CONFIGURED",
      expiration: "NOT_CONFIGURED",
      retention: "NOT_CONFIGURED",
      defaultState: "OFF",
      killSwitch: "ENGAGED",
      allowedEnvironments: ["LOCAL_TEST", "PROD_LIKE_TEST"],
      productionConnections: 0,
      productionQueries: 0,
      productionWrites: 0,
      productOutputs: 0,
      executionAuthorized: false,
    },
    releaseSequence: [
      "VERIFY_EXACT_SOURCE_AND_PLAN_HASHES",
      "CREATE_AND_VERIFY_BACKUP",
      "APPLY_EXACT_TEN_MIGRATIONS_IN_ORDER",
      "VERIFY_LEDGER_RLS_GRANTS_FUNCTIONS_AND_PROJECTIONS",
      "RUN_ADMIN_WRITE_REBUILD_READER_RELOAD_SMOKE",
      "RUN_CANONICAL_READER_FOUNDER_COHORT_SMOKE",
      "HAND_OFF_TO_INTEGRATION_WITH_RUNTIME_STILL_OFF",
    ],
    recovery: {
      destructiveRollback: false,
      restoreRehearsalRequired: true,
      forwardFixOnlyAfterApply: true,
      runtimeEmergencyControl: "KILL_SWITCH_ENGAGED",
      stopConditions: ["HASH_MISMATCH", "BACKUP_NOT_VERIFIED", "MIGRATION_ORDER_MISMATCH", "RLS_OR_GRANT_DRIFT", "READER_CONTRACT_DRIFT", "ADMIN_ROUNDTRIP_FAILURE"],
    },
    productionImpact: "PREPARED_NOT_EXECUTED",
  };
  return { ...body, artifactHash: sha256(stable(body)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const sourceIndex = process.argv.indexOf("--source-sha");
    const outputIndex = process.argv.indexOf("--output");
    const artifact = buildWorldAdminProductionCutover({ sourceSha: sourceIndex >= 0 ? process.argv[sourceIndex + 1] : "origin/main" });
    const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
    if (outputIndex >= 0) writeFileSync(resolve(root, process.argv[outputIndex + 1]), serialized, { encoding: "utf8", flag: "wx" });
    else process.stdout.write(serialized);
  } catch (error) {
    process.stderr.write(`world_admin_production_cutover_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
