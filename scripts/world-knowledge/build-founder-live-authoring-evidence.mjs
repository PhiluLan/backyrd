#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCEPTED_SOURCE_POLICY,
  AUTHORING_CATALOG_HASH,
  AUTHORING_CATALOG_VERSION,
  FOUNDER_READER_VERSION,
  REGISTRY_HASH,
  REGISTRY_VERSION,
} from "../../packages/world-knowledge-core/dist/index.js";
import { buildWorldWeek2Basis } from "./build-week2-world-basis.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const sourceFiles = Object.freeze([
  "packages/world-knowledge-authoring-ui/src/index.tsx",
  "packages/world-knowledge-authoring-ui/src/session.ts",
  "packages/world-knowledge-authoring-ui/src/styles.css",
  "packages/world-knowledge-core/src/authoring.ts",
  "packages/world-knowledge-core/src/contextual.ts",
  "packages/world-knowledge-core/src/port.ts",
  "admin-dashboard/app/world-knowledge/page.tsx",
  "admin-dashboard/app/api/world-knowledge/shadow/route.ts",
  "web/app/owner/world-knowledge/page.tsx",
  "web/app/api/world-knowledge/shadow/route.ts",
]);

export function buildFounderLiveAuthoringEvidence({ headSha = git(["rev-parse", "HEAD"]) } = {}) {
  const baseSha = git(["merge-base", headSha, "origin/main"]);
  const baseTree = git(["rev-parse", `${baseSha}^{tree}`]);
  const week2 = buildWorldWeek2Basis({ headSha });
  if (week2.migrationCount !== 9) throw new Error("founder_live_expected_nine_world_migrations");
  if (week2.reader.worldProductReadDefault !== false || week2.reader.killSwitchDefault !== "ENGAGED") throw new Error("founder_live_reader_must_remain_off");
  if (week2.reader.allowedEnabledEnvironments.join(",") !== "LOCAL_TEST,PROD_LIKE_TEST") throw new Error("founder_live_environment_scope_broadened");
  const sources = sourceFiles.map((path) => ({ path, sha256: sha256(readFileSync(resolve(root, path))) }));
  const sourceSetHash = sha256(stable(sources));
  const body = {
    schemaVersion: "backyrd.world-knowledge.founder-live-authoring-evidence@1.0",
    canonicalBaseSha: baseSha,
    canonicalBaseTree: baseTree,
    candidateHeadSha: headSha,
    candidateTreeSha: git(["rev-parse", `${headSha}^{tree}`]),
    sourceSetHash,
    sources,
    contracts: {
      registryVersion: REGISTRY_VERSION,
      registryHash: REGISTRY_HASH,
      sourcePolicyVersion: ACCEPTED_SOURCE_POLICY.policyVersion,
      sourcePolicyHash: ACCEPTED_SOURCE_POLICY.policyHash,
      authoringCatalogVersion: AUTHORING_CATALOG_VERSION,
      authoringCatalogHash: AUTHORING_CATALOG_HASH,
      readerVersion: FOUNDER_READER_VERSION,
    },
    persistence: {
      migrationCount: week2.migrationCount,
      migrationBundleHash: week2.migrationBundleHash,
      migrations: week2.migrations.map(({ order, path, sha256: hash }) => ({ order, path, sha256: hash })),
      appendOnlyClaims: true,
      correctionMechanism: "SUPERSEDES_CLAIM_ID",
      directClientLedgerWrite: false,
    },
    authoringFlow: {
      surfaces: ["ADMIN", "OWNER"],
      normalLanguage: "de-CH",
      expertDetailsOptIn: true,
      writeBoundary: "SERVER_AUTHORIZED_RPC",
      postWriteSequence: ["APPEND_CLAIM", "VERIFY_SERVER_AUTHORITY", "CANONICAL_REBUILD", "VALIDATED_READER", "UI_RELOAD"],
      manualFileHandoffRequired: false,
      knowledgeStatesPreserved: ["ABSENT", "UNKNOWN", "NOT_CONFIGURED", "NOT_APPLICABLE", "DISPUTED", "KNOWN_FALSE", "KNOWN_TRUE", "KNOWN_VALUE"],
    },
    security: {
      postgresMajor: 17,
      grantsAndRlsAuditedSeparately: true,
      protectedSchemasMutated: false,
      serviceRoleInClient: false,
      userMetadataAuthority: false,
      securityDefinerEmptySearchPathRequired: true,
      logsAllDependency: false,
      extensionVersionPinning: false,
    },
    runtime: {
      default: "OFF",
      killSwitch: "ENGAGED",
      allowedEnvironments: ["LOCAL_TEST", "PROD_LIKE_TEST"],
      productionConnections: 0,
      productionQueries: 0,
      productionWrites: 0,
      productOutputs: 0,
      mobileWiring: "NONE",
      decisionWiring: "NONE",
    },
    releaseCandidate: {
      sequence: ["PREFLIGHT", "BACKUP", "RESTORE_REHEARSAL", "APPLY_IN_ORDER", "VERIFY", "RECOVERY_OR_STOP"],
      sourceAwarePlanHash: week2.sourceAwarePlanHash,
      executionAuthorized: false,
      status: "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY",
      stopConditions: [
        "MIGRATION_OR_PLAN_HASH_MISMATCH",
        "BACKUP_OR_RESTORE_REHEARSAL_MISSING",
        "RLS_GRANT_OR_FUNCTION_AUTHORITY_REGRESSION",
        "UNKNOWN_OR_DISPUTED_COLLAPSES_TO_FALSE",
        "PRODUCTION_RUNTIME_OR_CLIENT_WIRING_APPEARS",
      ],
    },
  };
  return { ...body, evidenceHash: sha256(stable(body)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = `${JSON.stringify(buildFounderLiveAuthoringEvidence(), null, 2)}\n`;
    const outputIndex = process.argv.indexOf("--output");
    if (outputIndex >= 0) writeFileSync(resolve(root, process.argv[outputIndex + 1]), result, "utf8");
    else process.stdout.write(result);
  } catch (error) {
    process.stderr.write(`founder_live_authoring_evidence_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
