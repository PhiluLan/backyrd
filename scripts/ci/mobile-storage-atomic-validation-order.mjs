#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MANIFEST = /^docs\/operations\/mobile-storage-atomic\/.+\.json$/;
const MIGRATION = /^supabase\/migrations\/\d{14}_[a-z0-9_]*atomic_review_media[a-z0-9_]*\.sql$/;
const CANDIDATE_FINGERPRINT = /^supabase\/canonical\/mobile-storage-atomic\/[a-z0-9-]+\/(?:application-schema|public-acl)\.sha256$/;
const CANDIDATE_RECONSTRUCTION = /^scripts\/ci\/mobile-storage-atomic\/[a-z0-9-]+\/(?:application-schema|public-acl)-reconstruction\.sql$/;
const HISTORICAL_BASELINE = /^supabase\/canonical\/(?:application-schema|public-acl)(?:-[a-z0-9-]+)?\.sha256$/;
const HISTORICAL_GATE = /^scripts\/ci\/gate[567]-(?:application-schema|public-acl)-recertification\.sql$/;
const HISTORICAL_RECONSTRUCTION = /^scripts\/ci\/events-v1-later-(?:application-schema|public-acl)-reconstruction\.sql$/;

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
  MANIFEST.test(path)
  || /^mobile\/(?:app\/review\/(?:new|quick|smart)\.tsx|lib\/review-media-upload\.ts|scripts\/test-review-media-upload\.mjs|package\.json)$/.test(path)
  || MIGRATION.test(path)
  || /^supabase\/tests\/review_media_atomic_[a-z0-9_]+\.sql$/.test(path)
  || CANDIDATE_FINGERPRINT.test(path)
  || CANDIDATE_RECONSTRUCTION.test(path)
  || path === "supabase/canonical/storage.sql";

const assertCommit = (root, sha, label) => {
  if (!SHA.test(sha ?? "") || !gitSucceeds(root, ["cat-file", "-e", `${sha}^{commit}`])) {
    throw new Error(`${label} is not an exact readable commit`);
  }
};

export function planMobileStorageAtomicValidation({
  root,
  baseSha,
  headSha,
  canonicalMainRef = "refs/remotes/origin/main",
}) {
  if (!baseSha) return { mode: "canonical", baseSha: null, headSha };
  assertCommit(root, baseSha, "CI_BASE_SHA/PR base");
  assertCommit(root, headSha, "PR head");
  const canonicalMainSha = git(root, ["rev-parse", canonicalMainRef]);
  assertCommit(root, canonicalMainSha, "canonical main");
  if (baseSha !== canonicalMainSha) {
    throw new Error("CI_BASE_SHA/PR base is not the exact canonical-main tip");
  }
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
  const touchesMobileStorage = entries.some(({ paths }) => paths.some(mobileStoragePath));
  if (!manifests.length && !touchesMobileStorage) return { mode: "canonical", baseSha, headSha };
  if (manifests.length !== 1) {
    throw new Error(`exactly one newly added mobile-storage-atomic manifest is required, found ${manifests.length}`);
  }

  for (const { status, paths } of entries) {
    for (const path of paths) {
      if ((path.startsWith("supabase/migrations/") && status !== "A")
        || HISTORICAL_BASELINE.test(path)
        || HISTORICAL_GATE.test(path)
        || HISTORICAL_RECONSTRUCTION.test(path)) {
        throw new Error(`historical Gate-5/6/7 migration, baseline, or reconstruction is immutable: ${path}`);
      }
    }
  }

  const manifestPath = manifests[0];
  const manifest = JSON.parse(git(root, ["show", `${headSha}:${manifestPath}`]));
  const migration = manifest.migration;
  if (!MIGRATION.test(migration ?? "")) {
    throw new Error("mobile-storage-atomic manifest has no valid candidate migration");
  }
  const added = new Set(entries.filter(({ status }) => status === "A").flatMap(({ paths }) => paths));
  if (!added.has(migration)) {
    throw new Error("mobile-storage-atomic candidate migration is not forward-only and exact");
  }
  if (manifest.storagePolicy !== "supabase/canonical/storage.sql") {
    throw new Error("mobile-storage-atomic manifest is not bound to canonical Storage policy");
  }

  const candidateFingerprints = manifest.fingerprints?.candidate ?? {};
  if (Object.keys(candidateFingerprints).sort().join("\n") !== "applicationSchema\npublicAcl") {
    throw new Error("mobile-storage-atomic candidate fingerprint set is incomplete");
  }
  for (const path of Object.values(candidateFingerprints)) {
    if (!CANDIDATE_FINGERPRINT.test(path ?? "") || !added.has(path)) {
      throw new Error("mobile-storage-atomic candidate fingerprint path is not newly versioned and exact");
    }
    const value = git(root, ["show", `${headSha}:${path}`]);
    if (!SHA256.test(value)) throw new Error(`candidate fingerprint is invalid: ${path}`);
  }
  const reconstructions = manifest.reconstruction ?? {};
  if (Object.keys(reconstructions).sort().join("\n") !== "applicationSchema\npublicAcl") {
    throw new Error("mobile-storage-atomic reconstruction set is incomplete");
  }
  for (const path of Object.values(reconstructions)) {
    if (!CANDIDATE_RECONSTRUCTION.test(path ?? "") || !added.has(path)) {
      throw new Error("mobile-storage-atomic reconstruction is not newly versioned and exact");
    }
  }

  return { mode: "mobile-storage-atomic", baseSha, headSha, manifestPath, migration };
}

export function resolveCanonicalFixtureBase({ root, explicitBaseSha }) {
  const canonicalMainSha = git(root, ["rev-parse", "refs/remotes/origin/main"]);
  assertCommit(root, canonicalMainSha, "fixture canonical main");
  const baseSha = explicitBaseSha || canonicalMainSha;
  assertCommit(root, baseSha, "fixture canonical base");
  if (baseSha !== canonicalMainSha) {
    throw new Error("fixture base is not the exact canonical-main tip");
  }
  return baseSha;
}

const self = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (self) {
  const value = (name) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
  };
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const plan = planMobileStorageAtomicValidation({
    root,
    baseSha: value("--base-sha"),
    headSha: value("--head-sha") ?? git(root, ["rev-parse", "HEAD"]),
    canonicalMainRef: value("--canonical-main-ref") ?? "refs/remotes/origin/main",
  });
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}
