#!/usr/bin/env node
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCEPTED_SOURCE_POLICY,
  REGISTRY_HASH,
  REGISTRY_VERSION,
  WORLD_DARK_READER_CONTRACT_VERSION,
  WORLD_INTERNAL_ALLOWLIST_CONTRACT_VERSION,
  createWorldInternalAllowlistRelease,
  createWorldPostDeployEvidence,
} from "../../packages/world-knowledge-core/dist/index.js";
import { buildWorldWeek2Basis } from "./build-week2-world-basis.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}` : JSON.stringify(value);

export const WORLD_WEEK3_CANONICAL_BASE_SHA = "b98b3870f60e9495c10f3c23f006fb9b3213d63e";
export const WORLD_WEEK3_CANONICAL_TREE_SHA = "e59939dc43c51139dcaf0928b9725e8b98b0a1cc";

export function buildWorldWeek3Foundation() {
  const week2 = buildWorldWeek2Basis({ headSha: WORLD_WEEK3_CANONICAL_BASE_SHA });
  if (week2.canonicalBaseSha !== WORLD_WEEK3_CANONICAL_BASE_SHA || week2.migrationCount !== 9) throw new Error("week3_canonical_basis_mismatch");
  const foundation = {
    schemaVersion: "backyrd.world-knowledge.internal-allowlist-foundation@week3-v1",
    canonicalMainSha: WORLD_WEEK3_CANONICAL_BASE_SHA,
    canonicalTreeSha: WORLD_WEEK3_CANONICAL_TREE_SHA,
    migrationCount: week2.migrationCount,
    migrationBundleHash: week2.migrationBundleHash,
    exactMigrationPaths: week2.migrations.map((item) => item.path),
    exactMigrationHashes: week2.migrations.map((item) => item.sha256),
    postgresCompatibility: week2.databaseCompatibility,
    reader: {
      contractVersion: WORLD_DARK_READER_CONTRACT_VERSION,
      allowlistContractVersion: WORLD_INTERNAL_ALLOWLIST_CONTRACT_VERSION,
      registryVersion: REGISTRY_VERSION,
      registryHash: REGISTRY_HASH,
      sourcePolicyVersion: ACCEPTED_SOURCE_POLICY.policyVersion,
      sourcePolicyHash: ACCEPTED_SOURCE_POLICY.policyHash,
      defaultState: "OFF",
      killSwitchDefault: "ENGAGED",
      allowedEnvironments: ["LOCAL_TEST", "PROD_LIKE_TEST"],
      decisionSemantics: "NONE",
      userSemantics: "NONE",
      offEffects: { connections: 0, queries: 0, writes: 0 },
    },
    authority: {
      realAllowlistMembers: 0,
      authorityStatus: "NOT_CONFIGURED",
      expirationPolicy: "NOT_CONFIGURED",
      retentionPolicy: "NOT_CONFIGURED",
      executionAuthorized: false,
      productionCredentialsUsed: false,
      productionQueried: false,
      productionMigrated: false,
      productionDeployed: false,
    },
    requiredRehearsal: ["DEFAULT_OFF_ZERO_EFFECTS", "SYNTHETIC_TEST_ON_MINIMIZED_READ", "EMERGENCY_OFF_ZERO_EFFECTS", "NINE_MIGRATION_CLEAN_BOOT", "REPLAY_NO_OP", "CONCURRENCY", "LOGICAL_BACKUP_RESTORE"],
  };
  const releaseArtifactHash = sha256(stable(foundation));
  const allowlist = createWorldInternalAllowlistRelease({
    releaseVersion: "week3-internal-allowlist-release-1", canonicalMainSha: WORLD_WEEK3_CANONICAL_BASE_SHA,
    canonicalTreeSha: WORLD_WEEK3_CANONICAL_TREE_SHA, releaseArtifactHash, migrationBundleHash: week2.migrationBundleHash,
    authorityStatus: "NOT_CONFIGURED", expirationPolicy: "NOT_CONFIGURED", retentionPolicy: "NOT_CONFIGURED", entries: [],
  });
  const postDeployEvidence = createWorldPostDeployEvidence({
    mainSha: WORLD_WEEK3_CANONICAL_BASE_SHA, treeSha: WORLD_WEEK3_CANONICAL_TREE_SHA, releaseArtifactHash,
    migrationBundleHash: week2.migrationBundleHash, allowlistHash: allowlist.releaseHash,
  });
  const body = { ...foundation, releaseArtifactHash, allowlist, postDeployEvidence };
  return { ...body, reportHash: sha256(stable(body)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const report = buildWorldWeek3Foundation();
    const outputIndex = process.argv.indexOf("--output");
    const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (output) writeFileSync(resolve(root, output), serialized, { encoding: "utf8", mode: 0o644 });
    else process.stdout.write(serialized);
  } catch (error) {
    process.stderr.write(`world_week3_foundation_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
