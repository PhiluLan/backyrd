#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MOBILE_STORAGE_ATOMIC_EVIDENCE_VERSION, MOBILE_STORAGE_REQUIRED_ASSERTIONS } from "../../decision-lab/src/mobile-storage-atomic.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baseIndex = process.argv.indexOf("--base-sha");
const baseSha = baseIndex >= 0 ? process.argv[baseIndex + 1] : null;
const dbUrl = process.env.DB_URL;
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
const psql = (args, input = undefined) => execFileSync("psql", [dbUrl, "-X", "--set", "ON_ERROR_STOP=1", ...args], { cwd: root, encoding: "utf8", input, maxBuffer: 50 * 1024 * 1024 }).trim();
const fail = (message) => { throw new Error(message); };

if (!baseSha) {
  process.stdout.write("No comparison base supplied; no mobile-storage-atomic candidate to runtime-verify.\n");
  process.exit(0);
}
if (!dbUrl) fail("DB_URL is required for fresh-boot mobile-storage-atomic verification");

const diff = git(["diff", "--name-status", baseSha, "HEAD"]);
const manifests = diff.split("\n").filter(Boolean).map((line) => line.split("\t")).filter(([status, path]) => status === "A" && /^docs\/operations\/mobile-storage-atomic\/.+\.json$/.test(path)).map(([, path]) => path);
if (!manifests.length) {
  process.stdout.write("No new mobile-storage-atomic manifest; candidate runtime gate not applicable.\n");
  process.exit(0);
}
if (manifests.length !== 1) fail(`exactly one mobile-storage-atomic manifest is required, found ${manifests.length}`);

const manifest = JSON.parse(readFileSync(resolve(root, manifests[0]), "utf8"));
if (manifest.schemaVersion !== MOBILE_STORAGE_ATOMIC_EVIDENCE_VERSION) fail("unsupported mobile-storage-atomic manifest version");
if (Object.keys(manifest.assertions ?? {}).sort().join("\n") !== [...MOBILE_STORAGE_REQUIRED_ASSERTIONS].sort().join("\n")) fail("mobile-storage-atomic assertion matrix is incomplete");
const readFingerprint = (path) => readFileSync(resolve(root, path), "utf8").trim();
const baseFingerprint = (path) => git(["show", `${baseSha}:${path}`]).trim();
const currentSchema = psql(["--tuples-only", "--no-align", "--file", resolve(root, "scripts/ci/application-schema-fingerprint.sql")]).split("|").at(-1);
const currentAcl = psql(["--tuples-only", "--no-align", "--file", resolve(root, "scripts/ci/public-acl-fingerprint.sql")]);
if (currentSchema !== readFingerprint(manifest.fingerprints.candidate.applicationSchema)) fail(`candidate application schema fingerprint mismatch: ${currentSchema}`);
if (currentAcl !== readFingerprint(manifest.fingerprints.candidate.publicAcl)) fail(`candidate Public ACL fingerprint mismatch: ${currentAcl}`);

const policyPredicate = psql(["--tuples-only", "--no-align", "--command", "select pg_get_expr(polwithcheck,polrelid) from pg_policy where polname='review_photos_upload_own_review' and polrelid='storage.objects'::regclass;"]);
if (!policyPredicate.includes("review_media_upload_is_reserved_v1")) fail("fresh-boot Storage policy is not reservation-bound");
for (const path of manifest.acceptanceTests) {
  psql(["--file", resolve(root, path)]);
  process.stdout.write(`Mobile-storage-atomic database acceptance passed: ${path}\n`);
}
for (const path of manifest.mobile.tests) {
  execFileSync(process.execPath, [resolve(root, path)], { cwd: resolve(root, "mobile"), stdio: "inherit" });
  process.stdout.write(`Mobile-storage-atomic client acceptance passed: ${path}\n`);
}

const reconstructedSchemaLine = psql(["--tuples-only", "--no-align"], `begin;\n\\ir ${resolve(root, manifest.reconstruction.applicationSchema)}\n\\ir ${resolve(root, "scripts/ci/application-schema-fingerprint.sql")}\nrollback;\n`).split("\n").find((line) => /^\d+\|[a-f0-9]{64}$/.test(line));
const reconstructedAcl = psql(["--tuples-only", "--no-align"], `begin;\n\\ir ${resolve(root, manifest.reconstruction.publicAcl)}\n\\ir ${resolve(root, "scripts/ci/public-acl-fingerprint.sql")}\nrollback;\n`).split("\n").find((line) => /^[a-f0-9]{64}$/.test(line));
if (reconstructedSchemaLine?.split("|").at(-1) !== baseFingerprint(manifest.fingerprints.baseline.applicationSchema)) fail("historical application schema reconstruction mismatch");
if (reconstructedAcl !== baseFingerprint(manifest.fingerprints.baseline.publicAcl)) fail("historical Public ACL reconstruction mismatch");

const directInsertBlocked = psql(["--tuples-only", "--no-align", "--command", "select case when not exists (select 1 from pg_policy where polrelid='public.review_photos'::regclass and polcmd in ('a','*') and ('authenticated'::regrole::oid = any(polroles) or 0 = any(polroles))) then 'true' else 'false' end;"]);
if (directInsertBlocked !== "true") fail("direct authenticated review_photos insert is not fail-closed");
process.stdout.write(`Mobile-storage-atomic fresh-boot verification passed for ${manifest.id}: Storage authority, complete assertion matrix, client contract, candidate fingerprints, and historical reconstruction are exact.\n`);
