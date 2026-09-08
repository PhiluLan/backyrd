#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_DATA_EVIDENCE_VERSION } from "../../decision-lab/src/admin-data-additive.mjs";
import { candidateFingerprintFailures, reconstructionFailures } from "./admin-data-additive-validation-order.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baseSha = process.argv[process.argv.indexOf("--base-sha") + 1];
const dbUrl = process.env.DB_URL;
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
const psql = (args, input = undefined) => execFileSync("psql", [dbUrl, "-X", "--set", "ON_ERROR_STOP=1", ...args], { cwd: root, encoding: "utf8", input, maxBuffer: 50 * 1024 * 1024 }).trim();
const fail = (message) => { throw new Error(message); };

if (!baseSha || baseSha === "undefined") {
  process.stdout.write("No comparison base supplied; no admin-data-additive candidate to runtime-verify.\n");
  process.exit(0);
}
if (!dbUrl) fail("DB_URL is required for fresh-boot admin-data-additive verification");

const diff = git(["diff", "--name-status", baseSha, "HEAD"]);
const manifests = diff.split("\n").filter(Boolean).map((line) => line.split("\t")).filter(([status, path]) => status === "A" && /^docs\/operations\/admin-data-additive\/.+\.json$/.test(path)).map(([, path]) => path);
if (!manifests.length) {
  process.stdout.write("No new admin-data-additive manifest; candidate runtime gate not applicable.\n");
  process.exit(0);
}
if (manifests.length !== 1) fail(`exactly one admin-data-additive manifest is required, found ${manifests.length}`);

const manifest = JSON.parse(readFileSync(resolve(root, manifests[0]), "utf8"));
if (manifest.schemaVersion !== ADMIN_DATA_EVIDENCE_VERSION) fail("unsupported admin-data-additive manifest version");
const readFingerprint = (path) => readFileSync(resolve(root, path), "utf8").trim();
const baseFingerprint = (path) => git(["show", `${baseSha}:${path}`]).trim();
const currentSchema = psql(["--tuples-only", "--no-align", "--file", resolve(root, "scripts/ci/application-schema-fingerprint.sql")]).split("|").at(-1);
const currentAcl = psql(["--tuples-only", "--no-align", "--file", resolve(root, "scripts/ci/public-acl-fingerprint.sql")]);
const candidateFailures = candidateFingerprintFailures({
  currentSchema,
  currentAcl,
  expectedSchema: readFingerprint(manifest.fingerprints.candidate.applicationSchema),
  expectedAcl: readFingerprint(manifest.fingerprints.candidate.publicAcl),
});
if (candidateFailures.length) fail(`${candidateFailures[0]}: ${candidateFailures[0].includes("schema") ? currentSchema : currentAcl}`);

for (const path of manifest.acceptanceTests.positive) {
  psql(["--file", resolve(root, path)]);
  process.stdout.write(`Positive admin-data acceptance passed: ${path}\n`);
}
for (const path of manifest.acceptanceTests.negative) {
  psql(["--file", resolve(root, path)]);
  process.stdout.write(`Negative admin-data acceptance passed: ${path}\n`);
}

const reconstructedSchemaLine = psql(["--tuples-only", "--no-align"], `begin;\n\\ir ${resolve(root, manifest.reconstruction.applicationSchema)}\n\\ir ${resolve(root, "scripts/ci/application-schema-fingerprint.sql")}\nrollback;\n`).split("\n").find((line) => /^\d+\|[a-f0-9]{64}$/.test(line));
const reconstructedAcl = psql(["--tuples-only", "--no-align"], `begin;\n\\ir ${resolve(root, manifest.reconstruction.publicAcl)}\n\\ir ${resolve(root, "scripts/ci/public-acl-fingerprint.sql")}\nrollback;\n`).split("\n").find((line) => /^[a-f0-9]{64}$/.test(line));
const reconstructedSchema = reconstructedSchemaLine?.split("|").at(-1);
const expectedSchema = baseFingerprint(manifest.fingerprints.baseline.applicationSchema);
const expectedAcl = baseFingerprint(manifest.fingerprints.baseline.publicAcl);
const reconstructionProblems = reconstructionFailures({ reconstructedSchema, reconstructedAcl, expectedSchema, expectedAcl });
if (reconstructionProblems.length) fail(`${reconstructionProblems[0]}: ${reconstructionProblems[0].includes("schema") ? reconstructedSchema : reconstructedAcl}`);

process.stdout.write(`Admin-data-additive fresh-boot verification passed for ${manifest.id}: candidate fingerprints and positive/negative acceptance are exact; schema and ACL reconstruct to the historical baseline.\n`);
