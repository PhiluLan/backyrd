#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { generateCandidateEvidence } from "../../decision-lab/src/recertification-generate.mjs";
import { verifyPreMergeCandidate } from "../../decision-lab/src/recertification-verify.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname);
const baseSha = process.env.PR_BASE_SHA;
const headSha = process.env.PR_HEAD_SHA;
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();

if (!baseSha || !headSha) {
  process.stdout.write("Not a pull-request context; mobile-storage-atomic candidate gate not applicable.\n");
  process.exit(0);
}
const changed = git(["diff", "--name-status", baseSha, headSha]).split("\n").filter(Boolean).map((line) => line.split("\t"));
const manifests = changed.filter(([status, path]) => status === "A" && /^docs\/operations\/mobile-storage-atomic\/.+\.json$/.test(path)).map(([, path]) => path);
const touchesScope = changed.some(([, ...paths]) => paths.some((path) =>
  /^mobile\/(?:app\/review\/(?:new|quick|smart)\.tsx|lib\/review-media-upload\.ts|scripts\/test-review-media-upload\.mjs)$/.test(path)
  || /^supabase\/migrations\/\d{14}_[a-z0-9_]*atomic_review_media[a-z0-9_]*\.sql$/.test(path)
  || /^supabase\/tests\/review_media_atomic_[a-z0-9_]+\.sql$/.test(path)
  || /^supabase\/canonical\/mobile-storage-atomic\//.test(path)
  || /^scripts\/ci\/mobile-storage-atomic\//.test(path)));
if (!manifests.length && !touchesScope) {
  process.stdout.write("No mobile-storage-atomic candidate detected.\n");
  process.exit(0);
}
if (manifests.length !== 1) throw new Error(`exactly one newly added mobile-storage-atomic manifest is required, found ${manifests.length}`);
const freeze = JSON.parse(execFileSync("git", ["show", `${baseSha}:decision-lab/config/additive-recertification-v1.freeze.json`], { cwd: root, encoding: "utf8" }));
const baseVersion = freeze.currentVersion.match(/v(\d+)$/)?.[1];
if (!baseVersion) throw new Error("canonical additive parent version is unreadable");
const artifact = await generateCandidateEvidence({
  root,
  baseVersion: `v${baseVersion}`,
  baseMainSha: baseSha,
  candidateSha: headSha,
  evidencePaths: manifests,
  requestedScope: "mobile-storage-atomic",
  mobileStorageManifestPath: manifests[0],
});
const receipt = await verifyPreMergeCandidate({ root, artifact, prBaseSha: baseSha, prHeadSha: headSha });
const proof = {
  baseMainSha: artifact.baseMainSha,
  candidateSha: artifact.candidateSha,
  candidateProductTree: artifact.candidateProductTree,
  artifactHash: artifact.artifactHash,
  verifierVersion: receipt.verifierVersion,
  valid: receipt.valid,
  reasons: receipt.reasons,
};
process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
if (!receipt.valid) process.exitCode = 1;
