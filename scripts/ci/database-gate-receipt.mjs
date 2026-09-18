#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDatabaseRelease } from "./validate-database-release.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const INPUTS = [
  "supabase/config.toml",
  "supabase/historical-data-operations.json",
  "supabase/migrations",
  "supabase/canonical",
  "supabase/tests",
  "scripts/ci/application-schema-fingerprint.sql",
  "scripts/ci/public-acl-fingerprint.sql",
  "scripts/ci/validate-supabase-current.sh",
  "scripts/ci/validate-database-lineage.mjs",
  "scripts/ci/validate-database-release.mjs",
  "scripts/ci/validate-database-test-coverage.mjs",
  "scripts/ci/validate-migrations.sh",
  "scripts/ci/validate-trust-platform-consumers.sh",
  "scripts/ci/validate-world-knowledge-rebuild-race.sh",
  "scripts/ci/validate-review-same-day-race.sh",
  "scripts/ci/validate-founder-live-idempotency-race.sh",
];

const walk = (path) => {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => walk(resolve(path, entry.name)));
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function databaseGateInput({ root, supabaseCliVersion, databaseImage }) {
  const files = INPUTS.flatMap((path) => walk(resolve(root, path)))
    .filter((path) => statSync(path).isFile())
    .map((path) => ({ path: relative(root, path), sha256: sha256(readFileSync(path)) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const body = { contractVersion: "backyrd.database-gate-input@1.0", supabaseCliVersion, databaseImage, files };
  return { ...body, inputHash: sha256(JSON.stringify(body)) };
}

export function recordDatabaseGateReceipt({ root, output, snapshot, supabaseCliVersion, databaseImage }) {
  if (!SHA256.test(snapshot.publicAclSha256 ?? "") || !SHA256.test(snapshot.applicationSchemaSha256 ?? "")) throw new Error("database_gate_snapshot_invalid");
  const input = databaseGateInput({ root, supabaseCliVersion, databaseImage });
  const body = {
    contractVersion: "backyrd.database-gate-receipt@1.0",
    status: "FULL_DATABASE_EXECUTION_PASS",
    input,
    fingerprints: snapshot,
  };
  const receipt = { ...body, receiptHash: sha256(JSON.stringify(body)) };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

export function verifyDatabaseGateReceipt({ root, receipt, supabaseCliVersion, databaseImage }) {
  const { receiptHash, ...body } = receipt;
  if (receipt.contractVersion !== "backyrd.database-gate-receipt@1.0" || receipt.status !== "FULL_DATABASE_EXECUTION_PASS") throw new Error("database_gate_receipt_invalid");
  if (sha256(JSON.stringify(body)) !== receiptHash) throw new Error("database_gate_receipt_hash_mismatch");
  const current = databaseGateInput({ root, supabaseCliVersion, databaseImage });
  if (current.inputHash !== receipt.input.inputHash) throw new Error("database_gate_receipt_inputs_changed_full_rerun_required");
  return receipt;
}

const args = Object.fromEntries(process.argv.slice(3).flatMap((value, index, values) => value.startsWith("--") ? [[value.slice(2), values[index + 1]]] : []));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(args.root ?? new URL("../..", import.meta.url).pathname);
    if (process.argv[2] === "record") {
      const snapshot = JSON.parse(readFileSync(resolve(args.snapshot), "utf8"));
      const receipt = recordDatabaseGateReceipt({ root, output: resolve(args.output), snapshot, supabaseCliVersion: args["supabase-cli-version"], databaseImage: args["database-image"] });
      process.stdout.write(`${JSON.stringify({ status: "PASS", receiptHash: receipt.receiptHash })}\n`);
    } else if (process.argv[2] === "resume-evidence") {
      const receipt = verifyDatabaseGateReceipt({ root, receipt: JSON.parse(readFileSync(resolve(args.receipt), "utf8")), supabaseCliVersion: args["supabase-cli-version"], databaseImage: args["database-image"] });
      const result = validateDatabaseRelease({ root, baseSha: args["base-sha"], headSha: args["head-sha"] ?? "HEAD", actualPublicAcl: receipt.fingerprints.publicAclSha256, actualApplicationSchema: receipt.fingerprints.applicationSchemaSha256 });
      process.stdout.write(`${JSON.stringify({ status: "PASS", reusedDatabaseReceipt: receipt.receiptHash, evidenceId: result.evidenceId })}\n`);
    } else throw new Error("database_gate_receipt_command_invalid");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
