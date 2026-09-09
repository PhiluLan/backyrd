#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[0-9a-f]{64}$/;
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
const jsonAt = (root, ref, path) => JSON.parse(git(root, ["show", `${ref}:${path}`]));
const hashAt = (root, ref, path) => createHash("sha256").update(execFileSync("git", ["show", `${ref}:${path}`], { cwd: root })).digest("hex");
const releasePathsAt = (root, ref) => git(root, ["ls-tree", "-r", "--name-only", ref, "--", "delivery/database-releases"])
  .split("\n").filter((path) => /^delivery\/database-releases\/[a-z0-9][a-z0-9-]*\.json$/.test(path)).sort();

export function activeDatabaseEvidence(root, ref) {
  const paths = releasePathsAt(root, ref);
  const path = paths.at(-1) ?? "delivery/database-baseline.json";
  const evidence = jsonAt(root, ref, path);
  if (evidence.schemaVersion !== "backyrd-database-evidence-v1" || !evidence.id || !SHA256.test(evidence.fingerprints?.publicAclSha256 ?? "") || !SHA256.test(evidence.fingerprints?.applicationSchemaSha256 ?? "")) {
    throw new Error(`database_evidence_invalid:${path}`);
  }
  return { path, evidence };
}

export function validateDatabaseRelease({ root, baseSha, headSha, actualPublicAcl, actualApplicationSchema }) {
  if (!SHA256.test(actualPublicAcl ?? "") || !SHA256.test(actualApplicationSchema ?? "")) throw new Error("actual_database_fingerprint_invalid");
  const changes = git(root, ["diff", "--name-status", baseSha, headSha]).split("\n").filter(Boolean).map((line) => {
    const [status, first, second] = line.split("\t"); return { status, path: second ?? first };
  });
  const newMigrations = changes.filter(({ status, path }) => status === "A" && path.startsWith("supabase/migrations/")).map(({ path }) => path).sort();
  const changedTests = changes.filter(({ status, path }) => status !== "D" && /^supabase\/tests\/.+\.sql$/.test(path)).map(({ path }) => path).sort();
  const evidenceChanges = changes.filter(({ path }) => /^delivery\/database-releases\/.+\.json$/.test(path));
  if (evidenceChanges.some(({ status }) => status !== "A")) throw new Error("database_release_evidence_is_immutable");
  if (!newMigrations.length) {
    if (evidenceChanges.length) throw new Error("database_release_without_forward_migration");
    const current = activeDatabaseEvidence(root, headSha).evidence;
    if (current.fingerprints.publicAclSha256 !== actualPublicAcl || current.fingerprints.applicationSchemaSha256 !== actualApplicationSchema) throw new Error("unrecorded_database_semantic_drift");
    return { schemaVersion: "backyrd-database-release-validation-v1", evidenceId: current.id, newMigrations: [] };
  }
  const previous = activeDatabaseEvidence(root, baseSha);
  if (evidenceChanges.length !== 1) throw new Error("forward_migration_requires_exactly_one_generated_database_release");
  const record = jsonAt(root, headSha, evidenceChanges[0].path);
  if (record.schemaVersion !== "backyrd-database-evidence-v1" || record.kind !== "release") throw new Error("database_release_schema_invalid");
  if (record.previousEvidence !== previous.evidence.id) throw new Error("database_release_chain_invalid");
  if (record.previousFingerprints?.publicAclSha256 !== previous.evidence.fingerprints.publicAclSha256 || record.previousFingerprints?.applicationSchemaSha256 !== previous.evidence.fingerprints.applicationSchemaSha256) throw new Error("database_release_previous_fingerprint_invalid");
  if (JSON.stringify(record.migrations?.map(({ path }) => path).sort()) !== JSON.stringify(newMigrations)) throw new Error("database_release_migration_set_mismatch");
  if (JSON.stringify(record.tests?.map(({ path }) => path).sort()) !== JSON.stringify(changedTests)) throw new Error("database_release_test_set_mismatch");
  for (const item of [...record.migrations, ...record.tests]) {
    if (!SHA256.test(item.sha256 ?? "") || hashAt(root, headSha, item.path) !== item.sha256) throw new Error(`database_release_source_hash_mismatch:${item.path}`);
  }
  if (record.fingerprints?.publicAclSha256 !== actualPublicAcl || record.fingerprints?.applicationSchemaSha256 !== actualApplicationSchema) throw new Error("database_release_candidate_fingerprint_mismatch");
  if (actualPublicAcl !== previous.evidence.fingerprints.publicAclSha256) {
    const source = changedTests.map((path) => git(root, ["show", `${headSha}:${path}`])).join("\n");
    if (!/^--\s*backyrd:authorization-positive\s*$/im.test(source) || !/^--\s*backyrd:authorization-negative\s*$/im.test(source)) throw new Error("acl_change_requires_positive_and_negative_authorization_tests");
  }
  return { schemaVersion: "backyrd-database-release-validation-v1", evidenceId: record.id, previousEvidence: record.previousEvidence, newMigrations };
}

const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, values) => { if (value.startsWith("--")) items.push([value.slice(2), values[index + 1]]); return items; }, []));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateDatabaseRelease({ root: resolve(args.root ?? new URL("../..", import.meta.url).pathname), baseSha: args["base-sha"], headSha: args["head-sha"] ?? "HEAD", actualPublicAcl: args["actual-public-acl"], actualApplicationSchema: args["actual-application-schema"] });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) { process.stderr.write(`database_release_blocked:${error.message}\n`); process.exitCode = 1; }
}
