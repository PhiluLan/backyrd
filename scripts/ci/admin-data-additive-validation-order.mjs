#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MANIFEST = /^docs\/operations\/admin-data-additive\/.+\.json$/;
const MIGRATION = /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/;
const HISTORICAL_BASELINE = /^supabase\/canonical\/(?:application-schema|public-acl)(?:-[a-z0-9-]+)?\.sha256$/;
const HISTORICAL_GATE = /^scripts\/ci\/gate[567]-(?:application-schema|public-acl)-recertification\.sql$/;

const git = (root, args) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
}).trim();

const gitSucceeds = (root, args) => spawnSync("git", args, {
  cwd: root,
  encoding: "utf8",
  stdio: "ignore",
}).status === 0;

const diffEntries = (root, baseSha, headSha) => {
  const output = git(root, ["diff", "--name-status", baseSha, headSha]);
  return output ? output.split("\n").map((line) => {
    const [status, ...paths] = line.split("\t");
    return { status, paths };
  }) : [];
};

const mobileStoragePath = (path) =>
  /^docs\/operations\/mobile-storage-atomic\/.+\.json$/.test(path)
  || /^mobile\/(?:app\/review\/(?:new|quick|smart)\.tsx|lib\/review-media-upload\.ts|scripts\/test-review-media-upload\.mjs)$/.test(path)
  || /^supabase\/migrations\/\d{14}_[a-z0-9_]*atomic_review_media[a-z0-9_]*\.sql$/.test(path)
  || /^supabase\/tests\/review_media_atomic_[a-z0-9_]+\.sql$/.test(path);

const adminDataPath = (path) =>
  /^supabase\/(?:migrations|tests)\//.test(path)
  || /^supabase\/canonical\/admin-data-additive\//.test(path)
  || /^scripts\/ci\/admin-data-additive\//.test(path)
  || MANIFEST.test(path);

const assertCommit = (root, sha, label) => {
  if (!SHA.test(sha ?? "") || !gitSucceeds(root, ["cat-file", "-e", `${sha}^{commit}`])) {
    throw new Error(`${label} is not an exact readable commit`);
  }
};

export function planAdminDataAdditiveValidation({
  root,
  baseSha,
  headSha,
  canonicalMainRef = "refs/remotes/origin/main",
}) {
  if (!baseSha) return { mode: "canonical", baseSha: null, headSha };
  assertCommit(root, baseSha, "CI_BASE_SHA/PR base");
  assertCommit(root, headSha, "PR head");
  assertCommit(root, git(root, ["rev-parse", canonicalMainRef]), "canonical main");
  if (!gitSucceeds(root, ["merge-base", "--is-ancestor", baseSha, headSha])) {
    throw new Error("PR head is not descended from its exact bound base");
  }
  const firstParents = new Set(git(root, ["rev-list", "--first-parent", canonicalMainRef]).split("\n"));
  if (!firstParents.has(baseSha)) {
    throw new Error("CI_BASE_SHA/PR base is not a canonical-main first-parent");
  }
  const entries = diffEntries(root, baseSha, headSha);
  const manifests = entries
    .filter(({ status, paths }) => status === "A" && paths.length === 1 && MANIFEST.test(paths[0]))
    .map(({ paths }) => paths[0]);
  const isMobileStorageCandidate = entries.some(({ paths }) => paths.some(mobileStoragePath));
  const touchesAdminData = !isMobileStorageCandidate && entries.some(({ paths }) => paths.some(adminDataPath));
  if (!manifests.length && !touchesAdminData) return { mode: "canonical", baseSha, headSha };
  if (manifests.length !== 1) {
    throw new Error(`exactly one newly added admin-data-additive manifest is required, found ${manifests.length}`);
  }

  for (const { status, paths } of entries) {
    for (const path of paths) {
      if ((path.startsWith("supabase/migrations/") && status !== "A") || HISTORICAL_BASELINE.test(path) || HISTORICAL_GATE.test(path)) {
        throw new Error(`historical Gate-5/6/7 migration or baseline is immutable: ${path}`);
      }
    }
  }

  const manifestPath = manifests[0];
  const manifest = JSON.parse(git(root, ["show", `${headSha}:${manifestPath}`]));
  const migrations = manifest.migrations;
  if (!Array.isArray(migrations) || migrations.length === 0 || !migrations.every((path) => MIGRATION.test(path))) {
    throw new Error("admin-data-additive manifest has no valid candidate migrations");
  }
  const added = new Set(entries.filter(({ status }) => status === "A").flatMap(({ paths }) => paths));
  if (migrations.some((path) => !added.has(path))) {
    throw new Error("admin-data-additive candidate migration set is not forward-only and exact");
  }
  const candidateFingerprints = manifest.fingerprints?.candidate ?? {};
  for (const [label, path] of Object.entries(candidateFingerprints)) {
    let value = "";
    try { value = git(root, ["show", `${headSha}:${path}`]); } catch {}
    if (!SHA256.test(value)) throw new Error(`candidate ${label} fingerprint is invalid`);
  }

  return { mode: "admin-data-additive", baseSha, headSha, manifestPath, migrations };
}

export function candidateFingerprintFailures({ currentSchema, currentAcl, expectedSchema, expectedAcl }) {
  const failures = [];
  if (currentSchema !== expectedSchema) failures.push("candidate application schema fingerprint mismatch");
  if (currentAcl !== expectedAcl) failures.push("candidate Public ACL fingerprint mismatch");
  return failures;
}

export function reconstructionFailures({ reconstructedSchema, reconstructedAcl, expectedSchema, expectedAcl }) {
  const failures = [];
  if (reconstructedSchema !== expectedSchema) failures.push("historical application schema reconstruction mismatch");
  if (reconstructedAcl !== expectedAcl) failures.push("historical Public ACL reconstruction mismatch");
  return failures;
}

const self = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (self) {
  const value = (name) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
  };
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const plan = planAdminDataAdditiveValidation({
    root,
    baseSha: value("--base-sha"),
    headSha: value("--head-sha") ?? git(root, ["rev-parse", "HEAD"]),
    canonicalMainRef: value("--canonical-main-ref") ?? "refs/remotes/origin/main",
  });
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}
