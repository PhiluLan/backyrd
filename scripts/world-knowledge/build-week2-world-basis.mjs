#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWorldWeek1Foundation } from "./build-week1-production-release-foundation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
    : JSON.stringify(value);

const forbiddenInternalDdl = /\b(?:create|alter|drop|truncate)\s+(?:table|schema|view|materialized\s+view|function|procedure|trigger|index)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:auth|realtime|storage)\s*\./i;
const extensionVersionPin = /\b(?:create|alter)\s+extension\b[^;]*\bversion\s+['"][^'"]+['"]/i;
const logsAllEndpoint = /\blogs\.all\b/i;
const clientSecret = /\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|sb_secret_)\b/i;

export function buildWorldWeek2Basis({ headSha } = {}) {
  const week1 = buildWorldWeek1Foundation(headSha ? { headSha } : undefined);
  const migrations = week1.migrations.map((migration) => {
    const sql = readFileSync(resolve(root, migration.path), "utf8");
    const securityDefinerBlocks = [...sql.matchAll(/create\s+or\s+replace\s+function[\s\S]*?(?=create\s+or\s+replace\s+function|$)/gi)]
      .filter((match) => /security\s+definer/i.test(match[0]));
    const audit = {
      sha256Verified: sha256(sql) === migration.sha256,
      forwardOnly: migration.metrics.destructiveDdl === 0,
      internalSupabaseSchemaMutation: forbiddenInternalDdl.test(sql),
      extensionVersionPin: extensionVersionPin.test(sql),
      logsAllDependency: logsAllEndpoint.test(sql),
      clientSecretReference: clientSecret.test(sql),
      securityDefinerCount: securityDefinerBlocks.length,
      securityDefinerWithEmptySearchPath: securityDefinerBlocks.filter((match) => /set\s+search_path\s*=\s*''/i.test(match[0])).length,
      explicitAnonOrAuthenticatedGrantCount: (sql.match(/\bgrant\b[^;]*\bto\s+(?:anon|authenticated)\b/gi) ?? []).length,
      rlsEnableCount: migration.metrics.enableRls,
      expectedReplay: "MIGRATION_LEDGER_NO_OP",
      postgresCompatibility: "POSTGRESQL_17",
    };
    if (!audit.sha256Verified) throw new Error(`week2_migration_hash_mismatch:${migration.path}`);
    if (!audit.forwardOnly) throw new Error(`week2_destructive_ddl:${migration.path}`);
    if (audit.internalSupabaseSchemaMutation) throw new Error(`week2_internal_supabase_schema_mutation:${migration.path}`);
    if (audit.extensionVersionPin) throw new Error(`week2_extension_version_pin:${migration.path}`);
    if (audit.logsAllDependency) throw new Error(`week2_logs_all_dependency:${migration.path}`);
    if (audit.clientSecretReference) throw new Error(`week2_client_secret_reference:${migration.path}`);
    if (audit.securityDefinerCount !== audit.securityDefinerWithEmptySearchPath) throw new Error(`week2_unsafe_security_definer:${migration.path}`);
    return { ...migration, audit };
  });
  const body = {
    schemaVersion: "backyrd.world-knowledge.world-basis-release@week2-v1",
    canonicalBaseSha: week1.canonicalBaseSha,
    candidateHeadSha: week1.candidateHeadSha,
    executionAuthorized: false,
    productionInspectionAuthorized: false,
    productionMigrationAuthorized: false,
    runtimeActivationAuthorized: false,
    databaseCompatibility: {
      postgresMajor: 17,
      prohibitedSchemaMutations: ["auth", "realtime", "storage"],
      extensionVersionPinning: "FORBIDDEN",
      removedEndpointDependencies: ["logs.all"],
      dataApiExposure: "EXPLICIT_GRANT_PLUS_RLS_ONLY",
    },
    migrationCount: migrations.length,
    migrationBundleHash: week1.migrationBundleHash,
    sourceAwarePlanHash: week1.sourceAwarePlanHash,
    migrations,
    reader: {
      contractVersion: "backyrd.world-knowledge.dark-reader@1.0",
      portVersion: "backyrd.world-knowledge.reader-port@1.0",
      registryVersion: "backyrd.world-knowledge.registry@2.1",
      worldProductReadDefault: false,
      killSwitchDefault: "ENGAGED",
      allowedEnabledEnvironments: ["LOCAL_TEST", "PROD_LIKE_TEST"],
      readOnly: true,
      offEffects: { queries: 0, writes: 0, connections: 0 },
      decisionSemantics: "NONE",
      userSemantics: "NONE",
    },
    rehearsal: {
      environment: "DISPOSABLE_LOCAL_ONLY",
      required: ["CLEAN_BOOT", "NINE_MIGRATION_APPLY", "REPLAY_NO_OP", "PARALLEL_REBUILDS", "NEGATIVE_AUTH_RLS", "DARK_READER_OFF_ON_KILL_SWITCH", "SNAPSHOT_HANDOFF_DETERMINISM", "LOGICAL_BACKUP_RESTORE"],
      productionConnection: false,
    },
    cohort: {
      sourceCandidateHash: "0cd08cd2fde2f1bada4972c568a80e8f54718eb502c4949e7ed81a881424a9c1",
      candidateCount: 30,
      geography: "Basel",
      identityPayloadIncluded: false,
      actorPseudonymsIncluded: false,
      automaticConfirmation: false,
      automaticCohortMembership: false,
      knowledgeStates: ["CONFIRMED", "UNKNOWN", "NOT_CONFIGURED", "NOT_APPLICABLE", "DISPUTED"],
    },
  };
  return { ...body, artifactHash: sha256(stable(body)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const artifact = buildWorldWeek2Basis();
    const outputIndex = process.argv.indexOf("--output");
    const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
    const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
    if (output) writeFileSync(resolve(root, output), serialized, "utf8");
    else process.stdout.write(serialized);
  } catch (error) {
    process.stderr.write(`world_week2_basis_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
