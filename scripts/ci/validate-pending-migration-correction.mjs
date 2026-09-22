#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HASH = /^[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{40}$/;
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
const blob = (root, ref, path) => execFileSync("git", ["show", `${ref}:${path}`], { cwd: root });
const hashAt = (root, ref, path) => createHash("sha256").update(blob(root, ref, path)).digest("hex");
const parseChanges = (root, baseSha, headSha) => git(root, ["diff", "--name-status", baseSha, headSha])
  .split("\n").filter(Boolean).map((line) => { const [status, first, second] = line.split("\t"); return { status, path: second ?? first }; });

export function validatePendingMigrationCorrection({ root, baseSha, headSha, changes = parseChanges(root, baseSha, headSha) }) {
  const baseCommit = git(root, ["rev-parse", baseSha]);
  const headCommit = git(root, ["rev-parse", headSha]);
  const mutations = changes.filter(({ status, path }) => status !== "A" && path.startsWith("supabase/migrations/"));
  const records = changes.filter(({ status, path }) => status === "A" && /^delivery\/database-corrections\/[a-z0-9][a-z0-9-]*\.json$/.test(path));
  if (!mutations.length && !records.length) return null;
  if (mutations.length && !records.length) return null;
  if (mutations.length !== 1 || records.length !== 1 || mutations[0].status !== "M") throw new Error("pending_migration_correction_scope_invalid");

  const recordPath = records[0].path;
  const record = JSON.parse(blob(root, headCommit, recordPath));
  const id = recordPath.match(/\/([^/]+)\.json$/)?.[1];
  if (record.schemaVersion !== "backyrd-database-migration-correction-v1" || record.id !== id
    || record.projectRef !== "hjgcrrzfjchzqoegcywn" || record.failedCanonicalMainSha !== baseCommit
    || !SHA.test(record.failedCanonicalMainSha ?? "") || !Number.isInteger(record.failedDeploymentRunId)
    || record.failedDeploymentRunId <= 0 || record.failureStage !== "TRANSACTION_ROLLED_BACK"
    || record.productionEffect !== "NONE_MIGRATION_NOT_RECORDED"
    || !/^[A-Z0-9_]{8,100}$/.test(record.rootCauseCode ?? "")) throw new Error("pending_migration_correction_identity_invalid");

  const migration = record.migration;
  if (migration?.path !== mutations[0].path || !HASH.test(migration.previousSha256 ?? "")
    || !HASH.test(migration.correctedSha256 ?? "") || migration.previousSha256 === migration.correctedSha256
    || hashAt(root, baseCommit, migration.path) !== migration.previousSha256
    || hashAt(root, headCommit, migration.path) !== migration.correctedSha256) throw new Error("pending_migration_correction_bytes_invalid");

  const test = record.test;
  const testChange = changes.find(({ status, path }) => status !== "D" && path === test?.path);
  if (!testChange || !/^supabase\/tests\/.+\.sql$/.test(test.path ?? "") || !HASH.test(test.sha256 ?? "")
    || hashAt(root, headCommit, test.path) !== test.sha256) throw new Error("pending_migration_correction_test_invalid");

  const productionState = JSON.parse(blob(root, baseCommit, "delivery/production-state.json"));
  const version = migration.path.match(/^supabase\/migrations\/(\d{14})_/)?.[1];
  const shippedVersion = productionState.supabase?.migrationTip?.match(/^(\d{14})_/)?.[1];
  if (!version || !shippedVersion || version <= shippedVersion) throw new Error("pending_migration_correction_already_shipped");

  const evidencePaths = git(root, ["ls-tree", "-r", "--name-only", baseCommit, "--", "delivery/database-releases"])
    .split("\n").filter((path) => path.endsWith(".json"));
  const priorEvidence = evidencePaths.map((path) => ({ path, value: JSON.parse(blob(root, baseCommit, path)) }))
    .find(({ value }) => value.migrations?.some((entry) => entry.path === migration.path && entry.sha256 === migration.previousSha256));
  if (!priorEvidence) throw new Error("pending_migration_correction_prior_evidence_missing");

  return { ...record, path: recordPath, priorEvidence: priorEvidence.path };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, all) => {
      if (value.startsWith("--")) items.push([value.slice(2), all[index + 1]]); return items;
    }, []));
    const result = validatePendingMigrationCorrection({ root: resolve(args.root ?? new URL("../..", import.meta.url).pathname), baseSha: args["base-sha"], headSha: args["head-sha"] ?? "HEAD" });
    process.stdout.write(`${JSON.stringify({ status: "PASS", correctionId: result?.id ?? null })}\n`);
  } catch (error) { process.stderr.write(`pending_migration_correction_blocked:${error.message}\n`); process.exitCode = 1; }
}
